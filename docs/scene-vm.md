# FFTA US scene VM: complete instruction and runtime analysis

The original scene VM has **114 instructions, 0x00–0x71**. It schedules parallel
child scripts, asynchronous actions, waits, and conditional branches for dialogue,
actors, paths, camera, audio, and dedicated mission workflows. Composer has 31
editable native operation definitions and typed expressions for the remaining 83,
which retain their original source/layout/byte protections. Native engine support
does not by itself establish a safe, general high-level authoring API.

This analysis covers every descriptor and handler entry in the pinned US ROM:
SHA-256 `43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
The analysis date is 2026-11-25. Additional source evidence comes from the local
`ffta-us-decomp` snapshot `6f16714cb9da9059180dbac7ba7282ac870c8044`. Behavior,
addresses, and data flow were inspected; its recovered C implementations were not
copied into Composer. Retail disassembly takes precedence over partial C recoveries.

- [Authoring APIs and validation](instructions.md)
- [Descriptor sizes, usage counts, program and scene references](scene-vm-catalog.json)
- [Typed JSON descriptions and Lua signatures](scene-vm-instructions.json)
- [Read-only census tool](../tools/audit-vm.mjs): emits metadata, not dialogue,
  operand bytes, or game assets.

## 1. Important corrections and boundaries

**Native opcode `0x71` already branches on dialogue choices.** Handler `0x08123d28`
calls `0x08013380`, reads the low byte of SaveByte19 at RAM `0x02002043`, and adds
a relative displacement only for result zero. Every nonzero result, including
cancellation value 255, follows the sequential path. It does not automatically
re-prompt. Combined with native `0x19`, it can implement a binary choice without
adding machine code merely to read the result.

The current high-level `choose` still uses optional patch opcode `0x72` for two
route offsets and B-cancel re-prompting. `enemyHp` uses patch opcode `0x73` to
assign current and maximum HP in 1–999. Native `0x2d` can clear HP/MP in a specific
unit-state operation, `0x2a` restores current HP/MP from their maxima, and `0x6f`
compares HP; none is a general arbitrary current/maximum HP setter.

`0x15/0x16` set a frame countdown and enter a wait state, rather than merely
writing an unspecified context value. `0x03` waits for matching child-script
handles; it does not select an actor. `0x04` waits for all registered child
scripts, rather than every animation in the scene. `0x25` starts an asynchronous
facing action, whereas `0x29` writes a field directly. These distinctions matter
for parallel execution and rejoining.

## 2. Scheduler and data model

### 2.1 Encoding and PC ownership

The descriptor table is at ROM `0x003a7ee4`. Each six-byte record contains
`u16 length + u32 Thumb handler`. The dispatcher at `0x08122abc` performs:

```text
command = scriptBase + signed16(pc)
status = descriptor[command[0]].handler(context, command)
pc = low16(pc + descriptor.length)
if status == 0x110: execute the next instruction in this scheduling pass
otherwise: return status to the task callback and wait for later progress
```

Handlers modify PC before the dispatcher adds instruction length. Branches are
therefore relative to the **next instruction**. Native addition wraps at 16 bits,
but instruction fetch interprets PC as signed; safe authoring limits a program to
32,767 bytes. The dispatcher does not validate opcodes, branch boundaries, loops,
or operand ranges. A backward loop without a wait can monopolize execution.

Each script context has this observed 16-byte view:

| Offset | Field | Role |
| --- | --- | --- |
| +0 | u16 PC | Script-relative offset, interpreted as s16 for fetch |
| +2 | u16 identifier | Child-script kind/identifier from the task template |
| +4 | u16 shared value | Usually countdown; some instructions use it for selectors/results |
| +6 | u8 shared state | Asynchronous completion or transition state, owned by the active wait protocol |
| +7 | u8 filter | Child-script identifier to wait for; 255 means any |
| +8 | task pointer | Current task owner; asynchronous tasks may be attached below it |
| +12 | script base | Base address of the native program |

The global root is reached through `0x020159cc`. Initializer `0x08121e9c` allocates
a 0x958-byte root and 0x1000-byte task-storage block. The root has 16 registered
child-script handles beginning at +0x14, path caches at +0x58 with stride 0x84,
and unit bindings beginning at +0x4d8. Child-script handles, unit selectors, actor
objects, and task pointers are distinct types. These observed layouts are not
an exposed arbitrary-memory API.

### 2.2 Every handler return state

Task callback `0x08121fb8` consumes these statuses. They are not bytecode opcodes.
Hexadecimal statuses below omit the `0x` prefix.

| Status | Scheduler behavior | Typical instructions |
| --- | --- | --- |
| `110` | Continue immediately in the same pass | Field writes, branches, flags |
| `100` | Exit this pass and resume on a later scheduling pass | 08, 09, 23, 24, 4b |
| `112` | Wait until global `0x0200f390` becomes 14 | 0c, 0d |
| `113` | Wait until no matching registered child script remains | 03, 04 |
| `114` | Resume when countdown is zero or decrements to zero | 15, 16, 22, 46, 47, 4c, 63 |
| `115` | Wait for context +6 to become 1; consume/clear it and resume the owner | Dialogue, fades, actor actions, paths |
| `116` | Poll `0x080d37f8` | 57 |
| `117` | Poll `0x080d37c4` | 58 |
| `118` | Poll `0x080d3878`, then release/clear task context | 5b |
| `119` | Poll `0x080c72e4` | Conditional path in 48 |
| `11a` | Wait for `0x080c74b4` to clear, then commit and clean up placement | Conditional path in 4e |
| `11b` | After countdown, call `0x08004c40` and resume | 61 |
| `11c` | Delegate to transition state machine `0x08122160` | 18, 36 |
| `11d/11e` | Mark the current task as terminal state 3 | 17 / 02 |

`0x14` only returns `115`: it starts no producer and does not set completion, so
it is not a safe unconditional NOP. `0x3b/0x3c/0x6b` are observed no-ops. Native
tasks implement asynchronous behavior; instruction byte counts do not imply time.

### 2.3 Parallel execution and scene lifecycle

`0x00/0x01` create another script task sharing the same script base. Its entry is
`current PC + instruction length + displacement`, and its handle enters a 16-slot
registry. The parent continues; this is not a stack-based call with a general
return instruction or local-variable stack. `0x00` sets an explicit kind;
`0x01` uses 128. `0x03(id)` waits for that kind, `0x04` waits for all registered
children, and `0x05` releases the registered tasks. An asynchronous action's
`115` wait blocks its own script, allowing other child scripts to proceed.

`0x1c` appends a u16 scene ID to RAM `0x02002194`, with count at `0x0200219c`.
The layout holds four entries and its handler has no capacity check. `0x17`
changes outer scene control and ends the current script; values 4/8 additionally
invoke dedicated transitions. `0x18/0x36` enter specialized transition/result
workflows, not arbitrary destination jumps. Writes to save RAM, scene enqueueing,
and task completion do not by themselves write a persistent SAV file.

## 3. All 114 native instructions

Operand types are encoding views: u8/u16 are unsigned, i8/i16 signed, with
little-endian multibyte values. Exact byte offsets appear in the JSON descriptions.
Named v1 operations retain their original encoding types, including camera u16
fields that the runtime interprets as signed bit patterns. Unresolved fields keep
neutral names rather than exposing speculation as an API. Structure offsets such
as +18, +28, and +a4 in the behavior column are hexadecimal.

Counts are static occurrences across 228 original programs and 34,395 decoded
instructions, not execution or reachability counts. Handlers are callable Thumb
addresses with low bit 1. A C filename usually uses the same address with that
bit cleared. Reading a handler and its data flow does not establish that every
parameter combination was tested in gameplay.

### 00–1f

| Opcode | Length | Handler | Uses | Operands | Returns | Behavior and limits |
| --- | ---: | --- | ---: | --- | --- | --- |
| `00` | 4 | `0x08122b15` | 106 | kind:u8, delta:i16 | `110` | Start a parallel child script with an explicit kind and the same script base. Its entry is relative to the next instruction; register its task handle. |
| `01` | 3 | `0x08122b51` | 2139 | delta:i16 | `110` | Start a parallel child script as in 00, with kind 128. This is not a stack-based call/return. |
| `02` | 1 | `0x08122b8d` | 2266 | none | `11e` | Remove the current task from the registered handles, clear its owner at context +8, and terminate this script task. |
| `03` | 2 | `0x08122ba5` | 103 | handle:u8 | `110/113` | Set the child-script filter at +7 and wait while a matching registered task exists. Kind 255 matches any task; this does not select an actor. |
| `04` | 1 | `0x08122bc9` | 942 | none | `110/113` | Wait until all registered child-script tasks have finished by using filter 255. |
| `05` | 1 | `0x08122bed` | 8 | none | `110` | Release tasks in the 16 registered handle slots and clear the slots. This does not remove map actors. |
| `06` | 4 | `0x08122bfd` | 410 | mode:u8, frames:u8, level:u8 | `110/115` | Skip when the global scene-state halfword is 3; otherwise start a brightness task. Its factory uses high(b1)-low(b1), b2, and b3. |
| `07` | 1 | `0x08122c29` | 7 | none | `115` | Start the mode-1 branch of the brightness factory with a null command pointer. Its exact restore/default result depends on the downstream callback. |
| `08` | 1 | `0x08122c3d` | 27 | none | `100` | Write 00, 03, 10, 00 to display-shadow offsets +4a through +4d, configuring blending, then yield until the next scheduling pass. |
| `09` | 1 | `0x08122c6d` | 27 | none | `100` | Clear the BLDCNT and BLDALPHA display-shadow fields, then yield until the next scheduling pass. |
| `0a` | 3 | `0x08122ca9` | 33 | actor:u8, value:u8 | `110` | Resolve an actor and invoke the same callback on its child objects at +54 and +58 with value. The final visual meaning remains unresolved. |
| `0b` | 4 | `0x08122d05` | 38 | first:u8, second:u8, duration:u8 | `115` | Create a two-channel alpha-blending interpolation task. Callback 081269e4 updates both BLDALPHA bytes and notifies the owner when complete. |
| `0c` | 2 | `0x08122d21` | 204 | map:u8 | `112` | Use the current 40-byte content record's map when b1 is zero, otherwise use b1. Write save byte 7, set global scene state to 10, and wait for state 14. |
| `0d` | 1 | `0x08122d65` | 168 | none | `112` | Set the global scene-state byte to 12 and wait for the outer controller to reach 14. |
| `0e` | 2 | `0x08122d75` | 12 | enabled:u8 | `110` | Set display-shadow bits 0x0300 when enabled is nonzero, or clear them otherwise; background-layer visibility control. |
| `0f` | 4 | `0x08122dad` | 2393 | textSelector:u8, speakerHandle:u8, presentationFlags:u8 | `115` | Create a 180-byte native dialogue event task. The native callback consumes its text selector, speaker, and presentation flags. |
| `10` | 3 | `0x08122dbd` | 96 | value:u16 | `110` | Write a halfword at content-state address 020020d0+a4. Its specific mission role is not assigned a general name. |
| `11` | 2 | `0x08122dd5` | 14 | selector:u8 | `115` | Start the 180-byte message/prompt event whose callback is 08125de8. The final text-selection contract remains unresolved. |
| `12` | 2 | `0x08122de9` | 12 | mode:u8 | `115` | If b1 has its high bit set, use mode 1 and b1-128; otherwise use mode 2 and b1. Start the 08125fa8 prompt/dialogue task, not a generic scene-mode bit write. |
| `13` | 1 | `0x08122e1d` | 1 | none | `115` | Start the 180-byte context event with callback 08126118 and clear the owner's completion flag. Its final interaction contract remains unresolved. |
| `14` | 2 | `0x08122e2d` | 0 | b1:u8 | `115` | Return asynchronous-completion wait status without starting an action. Unused in retail scripts; it can hang without a completion producer. |
| `15` | 2 | `0x08122e35` | 5144 | frames:u8 | `114` | Set the context +4 frame countdown from an unsigned byte and wait. Zero resumes after the next state polling pass. |
| `16` | 3 | `0x08122e41` | 11 | frames:u16 | `114` | Set the context +4 frame countdown from an unsigned halfword and wait, as in 15. |
| `17` | 2 | `0x08122e51` | 208 | mode:u8 | `11d` | Write the scene-control byte in the global root. Modes 4 and 8 invoke additional transitions; then terminate the current script. |
| `18` | 2 | `0x081224b9` | 164 | transition:u8 | `110/115/11c` | Write the transition state at +6. Remap 3 to 1, 6 to 3, and 7 to 5; modes 9/10/11/14 have dedicated workflows. Other paths enter the transition state machine. |
| `19` | 3 | `0x08122e7d` | 1275 | delta:i16 | `110` | Add a 16-bit displacement to PC; the dispatcher then adds the instruction length of 3. The resulting branch is relative to the next instruction. |
| `1a` | 4 | `0x08122e91` | 655 | flag:u16, value:u8 | `110` | Set or clear a native bit flag through 080c9574. The actual bitfield covers IDs 0-1535; the handler does not allocate safe custom flags. |
| `1b` | 4 | `0x08122ea9` | 0 | index:u16, value:u8 | `110` | Write the save byte at RAM 02002030+index through 080c95c0. This is separate from the bit flags used by 1a; unused in retail scripts. |
| `1c` | 3 | `0x08122ec1` | 46 | scene:u16 | `110` | Append a halfword scene ID to the queue at 02002194 and increment its count at 0200219c. The handler does not check queue capacity. |
| `1d` | 2 | `0x08122ef9` | 33 | value:u8 | `110` | Write the same byte to 02002190 and 02002191. These belong to outer scene state and are not general custom variables. |
| `1e` | 2 | `0x08122f25` | 1 | selector:u8 | `110` | Resolve b1 through 08036330, write 02001f69, clear 02003c2b, and apply through 08036584. The selector's final domain remains unresolved. |
| `1f` | 6 | `0x08122f59` | 716 | type:u8, packedXY:u8, arg:u8, packedXY2:u8, arg2:u8 | `110` | Split two packed coordinate pairs and forward them with the other parameters to scene-placement factory 081242a0. Template identity and lifecycle depend on that factory. |

### 20–3f

| Opcode | Length | Handler | Uses | Operands | Returns | Behavior and limits |
| --- | ---: | --- | ---: | --- | --- | --- |
| `20` | 5 | `0x08122f8d` | 194 | actor:u8, tile:u8, facing:u8, visibility:u8 | `110` | Forward the low/high coordinate nibbles, facing, and the low flags nibble to actor-configuration helper 08124480. The opening uses a verified placement subset. |
| `21` | 3 | `0x08122fb9` | 4 | selector:u8, value:u8 | `110` | Apply a selector/value pair through 08124560. The final field and mode meanings remain unresolved. |
| `22` | 2 | `0x08122fcd` | 570 | selector:u8 | `114` | Call 08124648 for selector zero, otherwise 08125624, then enter countdown wait. The existing +4 value may matter; the final selection contract remains unresolved. |
| `23` | 2 | `0x08122fe9` | 260 | actor:u8 | `100` | Clear bit 0 of the resolved actor object's flags through 08125760 and preserve other bits; yield until the next scheduling pass. |
| `24` | 2 | `0x08122ffd` | 273 | actor:u8 | `100` | Set bit 0 of the resolved actor object's flags through 08125760 and preserve other bits; yield until the next scheduling pass. |
| `25` | 4 | `0x08123011` | 886 | actor:u8, direction:u8, mode:u8 | `115` | Create a native asynchronous facing action through 08126dfc and callback 08126bfc, notifying the owner on completion. This differs from direct field write 29. |
| `26` | 3 | `0x0812302d` | 148 | firstHandle:u8, secondHandle:u8 | `115` | Create a two-actor action through 08126e34 with owner, first, second, first. Its exact action/following modes remain unresolved. |
| `27` | 5 | `0x08123045` | 2156 | actor:u8, action:u16, mode:u8 | `115` | Create a unit action task through 08126ea4 and callback 08126d34. An action argument is not automatically a graphics-animation resource ID. |
| `28` | 2 | `0x08123065` | 1605 | actor:u8 | `110` | Read the resolved actor's unit byte +f8 and reapply kind-1 state through 08124710. The opening uses this to refresh facing. |
| `29` | 3 | `0x08123081` | 775 | actor:u8, facing:u8 | `110` | Write actor byte +1f directly. It does not independently refresh or wait; the opening pairs it with 28. |
| `2a` | 2 | `0x08123099` | 367 | actor:u8 | `110` | Restore current HP and MP from their maximum values, clear several status ranges, reset actor flags, and refresh through 08124d58. This is not arbitrary HP assignment. |
| `2b` | 5 | `0x081230a9` | 291 | actor:u8, first:u8, condition:u8, delay:u8 | `110` | Start actor palette-override callback 0812682c. The script continues immediately; conditions including 100 have original-palette restoration paths. |
| `2c` | 4 | `0x081230c5` | 1 | selector:u8, operand:u8, value:u8 | `110` | Start the 72-byte task whose callback is 08126910 without waiting in the main script. Its final presentation semantics remain unresolved. |
| `2d` | 4 | `0x081230dd` | 19 | actor:u8, stateIndex:u8, value:u8 | `110` | Apply a unit-state write through 080cd884. When stateIndex is zero, additionally clear current HP at +18 and current MP at +1c. |
| `2e` | 8 | `0x0812310d` | 365 | actor:u8, dx:u16, dy:u16, dz:u16 | `110` | Add three 16-bit values to actor fields +08, +0c, and +0a with 16-bit wraparound. This is not a direct grid-tile assignment. |
| `2f` | 4 | `0x08122599` | 462 | actor:u8, x:u8, y:u8 | `110` | Update unit grid coordinates and actor position. Coordinate 255 preserves the corresponding current world axis shifted right by 5; update unit f6/f7 and f9/fa. |
| `30` | 4 | `0x0812314d` | 432 | actor:u8, mode:u8, value:u8 | `110` | Mode 0 controls actor-flags bit 2. Mode 1 updates bits 0x1000/0x4000 according to value and invokes a refresh helper; their final meanings remain unresolved. |
| `31` | 5 | `0x081231b1` | 167 | actor:u8, argument:u16, presentation:u8 | `110` | Clear actor attachments, multiply the argument by 4 and truncate to u16 for action update, refresh presentation, and set actor-flags bit 0x100. |
| `32` | 2 | `0x081231fd` | 3 | actor:u8 | `110` | Read the unit's native palette/slot value and update actor byte +1e. This does not create a unit. |
| `33` | 9 | `0x08123225` | 1 | type:u8, reference:u8, x1:u8, y1:u8, x2:u8, y2:u8, x3:u8, y3:u8 | `110` | Instantiate a scene actor from a type, reference unit, and three candidate tiles. Helper 08125444 chooses the first vacant tile and computes facing; this does not prove combat-turn registration. |
| `34` | 3 | `0x0812260d` | 23 | unit:u8, selection:u8 | `110` | For selectors 254/255, scan eligible primary units and set flags 0x400. Otherwise select from the 12 encounter slots and write saved selection slot 0, 1, or 2. |
| `35` | 3 | `0x08123235` | 14 | savedSelection:u8, binding:u8 | `110` | Bind a native unit handle from saved selection slot 0/1/2 using a one-based index. An empty selection can underflow; this is not an unchecked general binding API. |
| `36` | 2 | `0x08123295` | 6 | selector:u8 | `11c` | Set transition state +6 to 7 and +4 to selector, then enter the mission reward/unit-result workflow. This is not an ordinary conditional branch. |
| `37` | 2 | `0x081232a5` | 255 | unit:u8 | `110` | Resolve a native unit and set bit 0x100 in its +28 flags halfword when present. |
| `38` | 7 | `0x081232c9` | 19 | selector:u8, value:u16, mode:u8, amount:u16 | `115` | Pack selector, signed 16-bit value, mode, and amount for 08127c54. The final height/action meaning remains unresolved. |
| `39` | 9 | `0x08123321` | 432 | actor:u8, dx:u16, dy:u16, mode:u8, argument:u16 | `115` | Pack two words containing actor, signed deltas, mode, and argument for 08127b80. Opcode 3a uses the same path after computing deltas from target tiles. |
| `3a` | 7 | `0x08123399` | 81 | actor:u8, x:i8, y:i8, mode:u8, argument:u16 | `115` | Compute target-tile-center deltas through 08124e74; a negative coordinate produces zero delta for that axis. Create the action through 08127b80. |
| `3b` | 8 | `0x081233f9` | 0 | b1:u8, b2:u8, b3:u8, b4:u8, b5:u8, b6:u8, b7:u8 | `110` | The retail handler only returns 110. This eight-byte instruction is a no-op and is unused by retail programs. |
| `3c` | 6 | `0x08123401` | 0 | b1:u8, b2:u8, b3:u8, b4:u8, b5:u8 | `110` | The retail handler only returns 110. This six-byte instruction is a no-op and is unused by retail programs. |
| `3d` | 10 | `0x08122771` | 216 | actor:u8, dx:u16, dy:u16, mode:u8, dispatch:u8, argument:u16 | `115` | Use signed deltas directly with the movement factories shared by 3e. Dispatch 1 calls 08127c10; other values call 08127bc4. |
| `3e` | 8 | `0x08123409` | 195 | actor:u8, x:u8, y:u8, facing:u8, mode:u8, speed:u16 | `115` | Compute target-tile deltas, write mode to payload byte 1 and argument to payload +6, then select 08127c10/08127bc4. Retail assembly confirms +6; one partial C recovery incorrectly writes +2. |
| `3f` | 4 | `0x08123475` | 247 | packedStart:u8, packedEnd:u8, value:u8 | `110` | For distinct packed coordinates sharing an x or y coordinate, unpack both nibble pairs and invoke straight-line helper 08124974. |

### 40–5f

| Opcode | Length | Handler | Uses | Operands | Returns | Behavior and limits |
| --- | ---: | --- | ---: | --- | --- | --- |
| `40` | 4 | `0x081234b5` | 3 | actor:u8, packedEnd:u8, value:u8 | `110` | Read the start tile from the actor's unit f6/f7 and invoke 08124974 only when the target shares its row or column. |
| `41` | 4 | `0x081234fd` | 203 | actor:u8, packedPath:u8, delay:u8 | `115` | Use low(b2) as a path slot and bits 4-6 as the repetition parameter for 08127af8. Bit 7 does not enter that parameter. |
| `42` | 4 | `0x0812352d` | 11 | actor:u8, packedRange:u8, delay:u8 | `115` | Create a path request through 08127af8 with repetitions high-low+1, narrowed to a byte. A reversed range is not checked for safety. |
| `43` | 3 | `0x08123565` | 14 | packedSources:u8, destination:u8 | `110` | Merge two cached paths by removing the last point of the first and appending the whole second. Source slots are the low/high nibbles; the destination cache holds only 32 points. |
| `44` | 5 | `0x08123581` | 66 | actor:u8, path:u8, b3:u8, packed:u8 | `115` | Create coordinate-path task 08127b40 with delay from the low nibble and tail from the high nibble of b4. Byte b3 is unused. |
| `45` | 4 | `0x081235a9` | 2 | pathId:u16, slot:u8 | `110` | Load a coordinate path from the relative directory at A19D18 into a cache slot, adding terrain height and clearing entry flags. This does not append new path assets. |
| `46` | 4 | `0x081227f9` | 666 | actor:u8, mode:u8, amount:u8 | `110/114/115` | Project an actor's tile position and terrain height into a camera target. Modes 1/2/0 use interpolation; mode 0 indexes a speed table and mode 3 starts 08128898. |
| `47` | 7 | `0x081228d5` | 595 | x:u16, y:u16, mode:u8, duration:u8 | `110/114/115` | Move the camera to signed coordinates. Mode 1 with amount zero sets immediately; modes 1/2 compute countdowns, mode 0 indexes a table, and mode 3 creates a task. |
| `48` | 2 | `0x081235c1` | 198 | mode:u8 | `110/119` | Execute scene selector 08123e00. If native save byte 13 equals 1, return wait status 119. This reads a byte, not story bit flag 13. |
| `49` | 2 | `0x081235e5` | 77 | restore:u8 | `110` | For nonzero restore, release/restore scene resources and compact the roster when pending bit 8 is set. Zero ensures a restore actor exists; this is not a generic scene end. |
| `4a` | 1 | `0x08123671` | 1 | none | `110` | Apply the current content index to its context through 08096e18; related to mission/deployment selection. |
| `4b` | 2 | `0x08123695` | 182 | preset:u8 | `100` | Select an audio/presentation preset. Value 255 reads current content-record byte +26, with a special global-state path using save byte 20. Apply the selector and yield. |
| `4c` | 4 | `0x08123771` | 258 | definition:u16, mode:u8 | `114` | Apply native audio-definition service 08141570. Modes 255/2/4 prepare selected volume bytes at 100 and map to service channels 1/2; clear the countdown and wait one scheduling pass. |
| `4d` | 5 | `0x08123715` | 604 | level:u8, frames:u16, channels:u8 | `115` | Replicate level into selected byte channels and start volume interpolation through 0812800c. Downstream calls reach floating-point volume setters; mask bit 3 is not a verified fourth audio track. |
| `4e` | 1 | `0x081237d1` | 56 | none | `110/11a` | Populate units from explicit unit/placement banks when available, otherwise from current content. Native save byte 13 equal to 1 selects wait state 11a. |
| `4f` | 3 | `0x08123815` | 23 | selector:u8, update:u8 | `110` | For nonzero update, refresh selected unit actions; otherwise filter actors for transition. This does not register a newly spawned combatant. |
| `50` | 2 | `0x08123835` | 59 | value:u8 | `115` | Start a context action through 081286dc. Its exact control/input-feedback semantics remain unresolved. |
| `51` | 1 | `0x08123849` | 76 | none | `110` | Call 0809a260(context, 0) and then 080a9548. This is not established as a generic mission-completion instruction. |
| `52` | 1 | `0x08123861` | 54 | none | `110` | Clear story-unit state, commit unit-property and occupancy flags, and refresh values for the 24 primary units. |
| `53` | 3 | `0x08123899` | 7 | encounter:u16 | `110` | Search the 12-byte records at 563a70 in descending order for identifier, write selected record 3c2a, and select its content. Identifier is not a direct unit-bank address. |
| `54` | 2 | `0x08123901` | 7 | value:u8 | `110` | Apply value through 080bd11c and write native save byte 53. The final system-property domain remains unresolved. |
| `55` | 5 | `0x0812391d` | 2 | b1:u8, b2:u8, b3:u8, b4:u8 | `110` | Pass four bytes to graphics/map helper 0801ddb4. Its final visual effect remains unresolved. |
| `56` | 1 | `0x08123939` | 1 | none | `110` | Call 0801de20 with constant 3. The final effect remains unresolved. |
| `57` | 1 | `0x08123949` | 331 | none | `116` | Start task-context initialization through 080d376c and wait for 080d37f8. |
| `58` | 1 | `0x08123959` | 331 | none | `117` | Start task-state clearing through 080d37ac and wait for 080d37c4. |
| `59` | 2 | `0x08123969` | 286 | handle:u8 | `110` | Resolve an actor and store it in the current-entity global slot. This does not create a unit binding. |
| `5a` | 2 | `0x0812397d` | 493 | oneBasedIndex:u8 | `110` | Pass b1-1, narrowed to u16, to 08124fd0. Input zero becomes 65535; this is not a safe unchecked general index. |
| `5b` | 1 | `0x08123995` | 493 | none | `110/118` | If 080d3878 reports completion, release and clear the task context. Otherwise enter polling/cleanup wait state 118. |
| `5c` | 3 | `0x081239c5` | 1 | value:u16 | `110` | Queue dedicated action B0 with a halfword through 0812b7d0. Its final mission/UI contract remains unresolved. |
| `5d` | 3 | `0x081239dd` | 9 | first:u8, second:u8 | `110` | Write content-state bytes 020020d0+a6/a7. These are not custom variables. |
| `5e` | 1 | `0x081239f9` | 2 | none | `115` | Queue dedicated action 44 through 0812bd2c. Its final UI workflow remains unresolved. |
| `5f` | 2 | `0x08123a09` | 3 | value:u8 | `115` | Queue dedicated action 44 with a byte through 0812bce4. Its final UI workflow remains unresolved. |

### 60–71

| Opcode | Length | Handler | Uses | Operands | Returns | Behavior and limits |
| --- | ---: | --- | ---: | --- | --- | --- |
| `60` | 1 | `0x08123a1d` | 105 | none | `115` | Queue dedicated action 08 through 0812bd0c. This is not a general key-reading instruction. |
| `61` | 1 | `0x08123a2d` | 4 | none | `110/11b` | When native save byte 13 is 1, clear it, set a 16-frame countdown and content flag 40, then wait and invoke 08004c40. Otherwise continue immediately. |
| `62` | 9 | `0x08123a61` | 38 | payload:u8, b2:u8, b3:u8, b4:u8, b5:u8, b6:u8, b7:u8, wait:u8 | `110/115` | Create dedicated action 108 through 0812c4e4. A nonzero wait byte waits for completion; zero lets the script continue. The remaining payload contract is unresolved. |
| `63` | 1 | `0x08123a7d` | 2 | none | `114` | Reset scene-view state through 08125938, then wait according to the current +4 countdown. The exact visual reset scope remains unresolved. |
| `64` | 4 | `0x08123a8d` | 3 | unit:u8, delta:i16 | `110` | Branch when the selected unit exists and predicates 080c8260 and 080c8240 both return zero. |
| `65` | 5 | `0x08123acd` | 240 | flag:u16, delta:i16 | `110` | Branch when the indexed native story bit flag is nonzero. High-level when uses this instruction. |
| `66` | 5 | `0x08123afd` | 618 | handle:u8, bit:u8, delta:i16 | `110` | Branch when a unit exists and the requested bit of its +28 flags halfword is set. The safe bit range is 0-15. |
| `67` | 4 | `0x08123b35` | 1 | threshold:u8, delta:i16 | `110` | Branch when RAM byte 020021b4 is strictly greater than threshold, not less than threshold. |
| `68` | 4 | `0x08123b69` | 160 | selector:u8, delta:i16 | `110` | Resolve the current saved selector through 08036350. Nonzero b1 requires equality; b1 zero accepts resolved slots 1-6. |
| `69` | 3 | `0x08123bc9` | 1 | delta:i16 | `110` | Branch when bit 0 is set in the current 563a70 definition record's flags at +8. |
| `6a` | 3 | `0x08123c0d` | 1 | delta:i16 | `110` | Branch when bit 1 is clear in the current definition record's flags; its polarity differs from 69. |
| `6b` | 1 | `0x08123c51` | 0 | none | `110` | Return 110 with no side effects. This no-op is unused in retail programs. |
| `6c` | 4 | `0x08123c59` | 17 | unit:u8, delta:i16 | `110` | Branch when a unit exists and exclusion predicates 080c8348, 080cd92c, 080cd95c, 080cd9a4, and 080cd9bc all return zero. |
| `6d` | 3 | `0x08123cc1` | 1 | delta:i16 | `110` | Branch when byte +22 of the current 40-byte content record is zero. |
| `6e` | 3 | `0x08123cfd` | 53 | delta:i16 | `110` | Branch when native save byte 13 equals exactly 1, not when story bit flag 13 is set. |
| `6f` | 5 | `0x08122985` | 306 | unit:u8, threshold:u8, delta:i16 | `110` | For an active unit passing two exclusion checks, branch when current HP exceeds threshold. Thresholds 0-9 are absolute; larger values compare against floor(maxHP*threshold/100), strictly greater. |
| `70` | 3 | `0x08122a01` | 4 | delta:i16 | `110` | Scan current scene units, excluding specified states and property-1 values 94/10/9/4/12. Branch only when no eligible unit remains; this is not simply all enemy HP equal to zero. |
| `71` | 3 | `0x08123d29` | 1 | delta:i16 | `110` | Read native menu result SaveByte19. Branch for low byte zero; the second choice and B cancellation (255) continue sequentially. Native menu branching already exists. |

## 4. Runtime capabilities assembled from the instructions

| Capability | Native building blocks | Composer support and remaining work |
| --- | --- | --- |
| Sequential dialogue and pauses | 0f and text tokens, asynchronous completion | say, borrowed native speakers, token preservation; 11/12/13 prompt contracts remain incomplete |
| Binary choices | Text token32, 71, 19 | Native result branching exists; high-level choose uses patch 72 for B re-prompting; 71 does not create larger menus |
| Frame waits | 15/16 | Typed expressions exist; 15 has editable v1 support, 16 retains source-byte protection; no high-level fragment wait constructor |
| Parallel performance and joining | 00/01 start, 03/04 wait, 02 end, 05 cancel | Runtime supports task-level parallelism; no high-level labels/parallel/join model yet |
| Actor placement and recovery | 1f/20/33, 2a, 4e/4f | Native scene instantiation exists; dynamic combat registration still needs pool, occupancy, turns, and outcome validation |
| Actor actions and facing | 25/26/27, 28/29, 30/31 | Asynchronous actions and direct fields are distinct; no complete action/mode dictionary |
| Palette and blending | 0a/0b, 08/09, 2b/2c/32 | Palette overrides and alpha interpolation are visible in source; safe high-level combinations remain incomplete |
| Coordinates, motion, paths | 2e/2f, 38–45 | Grid, world, and relative coordinates differ; caches can load/merge/traverse paths; no path-asset directory extension UI |
| Camera | 46/47 | Actor-height projection and interpolation; amount can be a speed-table index rather than frames |
| Display and audio | 06/07/0e, 4b/4c/4d | Brightness, layers, definitions, and volume fades are separate; preset/resource dictionaries need more work |
| Conditions | 19, 64–71 | Flags, unit state, HP thresholds, content fields, save bytes, menu results; not a general arithmetic-expression VM |
| Native progress | 1a/1b, 1c/1d/1e, 34/35, 53/54/61 | Existing game state can change; no safe custom-variable namespace, once-only contract, or cross-save-slot state API |
| Mission/result transitions | 17/18/36, 49–52, 57/58/5b, 5c–62 | Dedicated workflows depend on original systems; exposing opcodes alone does not validate arbitrary mission/reward configuration |

### 4.1 Different flags and different selections

- `1a/65` address the bitfield beginning at `02001f70`, one bit per ID.
- `1b/48/4e/61/6e` use native save bytes beginning at `02002030`, one byte per ID.
- `37/66` use a unit's +28 flags; actor objects have separate flags again.
- `03/04` refer to child-script identifiers, not actors.
- `34/35/59` concern unit selection, bindings, and current actors, respectively.
- `71` reads menu result SaveByte19, not a unit/script selector.

Treating all of these as an untyped `flag` or `handle` risks incorrect bindings.
Future APIs should preserve their distinct domains.

### 4.2 Native menu control flow

The following is semantic pseudocode, not an implemented high-level Lua API:

```text
say(menuTokens)                 // Producer writes SaveByte19 before completing.
branchIfChoiceZero first       // Native opcode 71.
secondOrCancel: ...            // Results 1 and 255.
jump joined                    // Native opcode 19.
first: ...                     // Result 0.
joined: ...
```

This uses only native instructions. Distinguishing B from the second choice is
outside 71 itself; current patch 72 instead re-prompts. None of this establishes
general per-key sampling. Existing choice replay validates the native producer
and patch 72 path. It must not be misreported as direct gameplay coverage of the
newly identified native opcode 71.

### 4.3 HP and combat boundaries

The VM compares absolute/percentage HP with 6f, restores current values with 2a,
and clears them in a particular state operation with 2d. No general arbitrary
maximum-HP setter was found in this table. Opcode 33 instantiates a scene actor;
it is not a verified safe way to register a new combatant during an attack.
Opcode 4e loads units from definitions, but that does not make re-entry into it
from a damage callback safe.

Battle conditions and outcomes use a separate bytecode/interpreter. Its opcode
numbers cannot be interpreted using this scene-VM table. Mission registration,
map/NPC triggers, deployment, rewards, and saves also depend on outer controllers
and resource records. A new scene-index row does not connect those systems itself.

## 5. Evidence and remaining semantic work

Static coverage is 114/114 descriptors, 112 handler-address C files, and two
no-op handlers checked directly in retail disassembly. Retail programs use 109
opcodes. The five unused ones are 14, 1b, 3b, 3c, 6b. This is not a claim that
109 handlers naturally executed in this replay. A C recovery, exact native bytes,
a controlled handler test, and a natural scene replay are separate evidence levels.
The census metadata deliberately does not label untested meanings as verified.

Important disassembly corrections:

1. **3e:** retail address `08123442` uses `strh r1,[r6,#6]`, writing the high
   halfword of the second payload word. A partial C recovery writes +2 instead,
   incorrectly overwriting a coordinate delta.
2. **39/3d/46/47:** some partial function inventories end before the complete
   handler. Recovered byte counts alone can omit later branches or literal pools.
3. **3b/3c:** absent C files do not make these side effects unknown. Both retail
   handlers simply return110.
4. **71:** the retail handler already calls a choice-result reader. Missing
   editor names must not be mistaken for missing engine support.
5. **15/16/03/04:** their wait semantics require reading the task callback,
   rather than just a setter in isolation.

Good candidates for further high-level modeling are label-based branches, native
choice-result branches, u8/u16 frame waits, typed child-script parallel/join
operations, path references, and action dictionaries. Outstanding work includes
prompt contracts in 11/12/13, action modes in 0a/21/22/26/2c, the full meaning of
38, dedicated UI workflows in 50 and 5c–62, mission rewards/returns, and dynamic
combat spawning. The typed expression layer below does not remove protections on
the 83 previously opaque opcodes. New high-level action APIs still need model
review and proportionate execution tests.

### Source verification index

Paths are relative to the decomp snapshot named above. Clear the handler's low
Thumb bit for its usual eight-digit C filename. The retail address is the final
locator; paths are convenience references.

| Area or opcode | Source locator |
| --- | --- |
| Default handlers | `src/unknown/<eight-digit code address>.c` |
| 34,35,4a,4e,52,53,54,69,6a,70,71 | `src/missions/<address>.c` |
| 36 | `src/story/vm/08123294.c` |
| 49 | `src/jobs/081235e4.c` |
| 3b/3c | No C files; retail081233f8/08123400, eight bytes each including alignment |
| Dispatch and task entry | `src/story/vm/08122abc.c`, `0812237c.c` |
| Task callback and transitions | `src/unknown/08121fb8.c`, `src/missions/08122160.c` |
| Initialization/destruction | `src/story/vm/08121e9c.c`, `08121ef0.c`, `08121f80.c` |
| Child scripts and handles | `src/story/context/081223c8.c`, `08122454.c`, `08122484.c` |
| Unit/actor resolution | `src/story/context/08121cb4.c`, `src/unknown/081255c8.c` |
| Tile-target deltas | `src/story/placement/08124e74.c` |
| Path load/cache/merge | `src/story/scene/08124df0.c`, `src/story/context/08121c58.c`, `src/story/entities/081257d0.c` |
| Actor creation/recovery | `src/unknown/08125444.c`, `08124d58.c` |
| Native choice reading | `src/unknown/08013380.c`, `src/missions/08123d28.c` |
| Save-byte access | `src/unknown/080c95a8.c`, `080c95c0.c` |
| Volume interpolation | `src/unknown/08127d0c.c`, `0812800c.c` |
| Alpha/palette callbacks | `src/unknown/081269e4.c`, `0812682c.c` |

Recreate the read-only census without exporting game content:

```sh
node tools/audit-vm.mjs /path/to/retail.gba /outside/scene-vm-catalog.json
```

## 6. JSON descriptions and Lua expressions for every instruction

All 114 instructions have [typed descriptions](scene-vm-instructions.json), a
[strict JSON schema](../schemas/scene-vm.schema.json), and
[Lua expression examples](scene-vm-examples.lua). The project schema embeds the
same definitions. Each description records opcode, length, Thumb entry, field
positions/ranges, return states, behavior, editing restrictions, JSON example,
and Lua signature. All-zero examples illustrate encoding shape, not playable
or safe parameter combinations.

Constructors are registered from that same description set. They build static
data; they do not execute arbitrary functions on the host or GBA. Supply every
positional argument explicitly; zero-argument instructions use empty parentheses.
Put the following values inside a program's `instructions` array:

| JSON | Lua | Meaning |
| --- | --- | --- |
| `{"operation":"waitFrames8","operands":{"frames":30}}` | `waitFrames8(30)` | Native 15; old setContextValue remains compatible |
| `{"operation":"waitFrames16","operands":{"frames":300}}` | `waitFrames16(300)` | Typed16, currently preserving the source's layout and bytes |
| `{"operation":"showDialogue","operands":{"textSelector":5,"speakerHandle":15,"presentationFlags":128}}` | `showDialogue(5, 15, 128)` | Low-level0f; distinct from high-level story say(text) |
| `{"operation":"waitForAllSceneScripts","operands":{}}` | `waitForAllSceneScripts()` | Native 04 child-script join |
| `{"operation":"branchOnFirstChoice","operands":{"delta":12}}` | `branchOnFirstChoice(12)` | Typed71; currently preserve the native source displacement |
| `{"operation":"sceneOp0A","operands":{"actor":15,"value":0}}` | `sceneOp0A(15, 0)` | Partially understood0a keeps a neutral name |

`op("name", {operands})` and ordinary Lua tables can express the same data.
The original31 operation names and `native(opcode, bytes)` remain compatible.
Existing operations can still serialize as `op(...)`; semantic aliases can use
compact constructors. `toVmExpression(catalogInstruction)` in
`src/vm-instructions.mjs` produces typed objects; `lowerVmInstruction` lowers them
back into the existing v1 compilation model. Agent catalogs also include all 114
in `vmInstructions`.

**A typed name does not remove preservation rules.** The 31 entries marked
`editing: "named"` retain existing operand editing. The 83 entries marked
`editing: "preserve-native-layout"` have reversible typed encodings, but still
lower to opaque native records requiring a source, identical layout, and unchanged
opaque bytes. Renaming `native` does not bypass these guards. Patch 72/73 are not
part of the native 114; high-level choose/enemyHp keep their patch gating.

Regenerate reference files without reading a ROM:

```sh
node tools/generate-vm-reference.mjs
```

It updates JSON descriptions, Lua examples, and schemas from maintained project
descriptors, without reading or writing game assets.

## 7. Complete regression record: 2026-11-25

- All 25 tests passed with the pinned US ROM, with no skips. Without ROM input,
  11 passed and14 integration tests skipped as designed.
- All 114 descriptors and static program/scene references reproduced from a fresh
  scan. JSON/Lua equivalence, operand limits, missing/extra arguments, and invalid
  ranges are covered across every typed expression.
- All 207 nonempty programs and34,395 original instructions were converted to
  typed JSON and compact Lua, then compiled byte-identically. Unchanged builds
  preserve the input ROM.
- Semantic aliases cannot bypass the 83 opaque operations' source/layout/byte
  guards. Existing 31 operations and old project representations remain compatible.
- Nested-choice JSON/Lua outputs agree. Tests cover native descriptor preservation,
  default-off/unused patch behavior, compatibility rejection, and exact reopen.
- The final offline build passed and embeds full GPLv3/NOTICE text. The Herb
  Picking export matches the earlier gameplay-tested ROM.
- mGBA replayed all four routes and B cancellation:12/12,28/28,52/52,72/72 HP.
  All 353 sampled frames match the handoff evidence.

“Complete” means the full project test suite, every descriptor, and every original
program's representation/encoding regression. It does not mean all 114 handlers
were exercised naturally. Native 71, parallel/path workflows, and dedicated mission
operations primarily have static-analysis evidence here. No physical-device or
full battle-settlement acceptance is claimed. ROM/SAV/replay assets remain local.

## 中文摘要

已逐条记录114条原生指令，区分静态数据流、未知下游语义与游戏实测。
原版已有菜单分支、帧等待、并行子脚本和路径能力；这些不能与编辑器已验证的高阶API混为一谈。
31条保留可编辑操作数，83条有JSON/Lua命名表达但继续受原布局和字节保护。
全部25项测试通过，34,395条指令往返编译一致；未宣称114条都已完成自然游戏回放。
