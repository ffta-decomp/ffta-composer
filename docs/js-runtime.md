# JavaScript scene runtime

Composer recognizes all 114 native scene opcodes in its browser-compatible JS
preview. This is a semantic runtime, not an ARM/GBA emulator. No WASM, Node-only
modules, external assets, or ROM changes are required by the runtime.

The [instruction matrix](simulation-instructions.json) enumerates every opcode,
its native description, and current handling category. There are 36 core entries,
56 additional model entries, and 22 external-service entries. A model entry may
still request context for an operand or mode it cannot faithfully evaluate.
Classification does not mean complete original-engine behavior.

## Behavior

The core handles task control, flags, dialogue and native menus, placement,
movement, cameras, map selection, and combat boundaries. Additional JS handlers
model save bytes separately from story bits; unit states, HP/MP restoration,
actor masks, actions and palette requests; signed world-coordinate deltas;
straight-line requests; bounded path loading/merging and waypoint playback;
content/task state; and conditional branches. Scene queues are bounded to four
entries, paths to 32 points per cache slot, task count to 17, and execution to
the configured step limit. Scene handoffs are queued rather than automatically
running a second scene with an invented game context.

Static sprites follow position/facing changes. Action IDs, palette requests,
brightness/audio settings, and line effects are recorded as model state or
events. This does not implement original action animation, sound synthesis,
palette interpolation, complete terrain effects, or pixel-exact task timing.
Background-layer visibility is reflected on the stage. Movement and paths use
approximate interpolation/timing, with terrain elevation omitted from loaded
paths. Asynchronous visual actions currently serialize through the preview's
motion phase; original overlapping task timing is not reproduced.

`runtime` options supply fixture context: `saveBytes`, `unitsKnown`, `units`,
`counter`, `resolvedSelector`, `definitionFlags`, `contentIndex`, or cached
`paths`. Unit predicates use explicit `usable`, `available`, `eligible`, flags,
HP, and maximum HP inputs rather than guessing exclusion predicates from HP.
Percentage HP thresholds use floor(maxHP * threshold / 100), with strict `>`;
thresholds 0–9 are absolute. Missing units in a known complete roster evaluate
as absent; an unknown roster requests context.

## External services and unresolved behavior

Unresolved message/prompt workflows, actor-link actions, unit bindings/rewards,
unknown presentation helpers, camera mode three, and missing save/unit/map
context enter phase `external`. The snapshot retains opcode, operation,
operands, native description, request kind, and instruction location. Playback
stops. The UI offers explicit continuation, or true/false for an unknown branch.
`resolveExternal({complete:true})` acknowledges a missing service;
`resolveExternal({branch:true|false})` supplies a condition result. Resolutions
are recorded in the trace. Confirmation does not execute the missing native
service or establish its outcome. No guessed branch or automatic success is used.

Invalid targets, bad paths, unsupported numeric modes, deadlocks, and loop limits
remain errors/pauses. Native no-op opcodes are the only intentional no-ops.
Combat handoffs still stop before battle simulation. Custom 72/73 opcodes remain
reserved and disabled in exported projects.

## Validation

Run the existing suite with external ROM/table inputs, then:

```sh
node tools/audit-simulation.mjs /outside/path/retail.gba /outside/path/sweep.json
```

The local sweep runs all 207 nonempty retail programs referenced by scenes with
two synthetic resolutions for unknown conditions. It selects a synthetic map
zero when no script map is supplied, acknowledges external services, confirms
dialogue, and bounds each run. Coverage and stopping reasons are saved per
program; these are synthetic JS traces, not native gameplay evidence. Both
global true/false choices do not enumerate all mixed branch combinations.

Targeted tests verify domain separation, predicate polarity, strict HP
thresholds, explicit request/resolution, bounded paths, speaker associations,
camera targets, and source preservation. Format/behavior findings also use local
ffta-us-decomp snapshot `6f16714cb9da9059180dbac7ba7282ac870c8044`, consumers
08124DF0, 08124E74, 08127B80, 08127BC4/08127C10 and the
114 handlers documented in [the VM reference](scene-vm.md). Implementations are
independent Composer code by hitsmaxft; reference source was not copied.

### Recorded local results, 2026-11-26

- The complete suite passes **56 tests, no skips**, with retail/CN ROM inputs,
  the owner character table, and three updated CN revisions.
- The sweep contains **414 fixtures**: 244 reach a modeled end/handoff, 153
  reach a combat boundary, 16 reach the configured execution limit, and one
  exhausts the sweep iteration budget at an external request. Explicit external
  acknowledgements are part of these fixtures; end/handoff is not gameplay proof.
- The sweep executes **105 opcode kinds**. A targeted synthetic program executes
  the remaining nine (14, 1B, 37, 3B, 3C, 40, 6A, 6B, 6F), including retail-unused
  no-ops. Combined JS dispatch coverage reaches all 114, while 22 native services
  still require explicit external acknowledgement.
- The opening fixture reaches all 16 dialogue events and its battle boundary;
  it requires 15 external acknowledgements. One Snowball tutorial fixture reaches
  combat after 20 dialogue events and eight acknowledgements. The other follows
  the repeating tutorial route and exhausts the sweep budget; the sweep records
  this rather than claiming completion. A missing menu result requests a
  condition result instead of defaulting to choice zero.
- Reference input SHA-256:
  `43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
- DOM integration verifies external request display, stopped playback controls,
  and explicit continuation. The offline build passes. Browser pixels remain
  unverified; the DOM harness uses canvas stubs.

Evidence remains outside Git under `/tmp/ffta-composer-actors/`:
`js-instruction-sweep.json` and `js-runtime-tests.log`.

中文摘要：继续使用 JS。114 条指令均有明确处理分类；可确认的部分建模，
未知服务或上下文缺失会暂停并要求明确结果，不能据此宣称与原版引擎完全一致。
