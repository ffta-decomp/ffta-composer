# Story authoring and instruction reference

FFTA Composer parses JSON and a restricted Lua data language into the same project
model, validates it, and compiles native FFTA US scene bytecode, dialogue, and
resource directories. Ordinary dialogue and flag branches use native instructions.
Interactive choices and arbitrary encounter HP use an explicitly enabled runtime
patch. There is no Lua interpreter on the GBA. An encodable operand combination
is not necessarily a verified gameplay sequence.

Complete importable examples: [native branches, JSON](../examples/herb-arrival.json)
/ [Lua](../examples/herb-arrival.lua), and [nested choices, JSON](../examples/herb-ward.json)
/ [Lua](../examples/herb-ward.lua). See [Agent integration](agent.md), the
[project schema](../schemas/project.schema.json), and the
[complete 114-opcode VM analysis](scene-vm.md). Schema validation alone cannot
check ROM references, resource capacity, or execution timing.

The native VM already has menu-result branching in `0x71`. The current high-level
`choose` uses patch opcode `0x72` to provide B-cancel re-prompting. Opcodes
`0x15/0x16` wait on a frame countdown; `0x03/0x04` wait for registered child
scripts. Existing v1 operation names remain compatible even where those names
are less precise than the runtime analysis.

## 1. Support boundaries

| Layer | Available capabilities | Output and verification boundary |
| --- | --- | --- |
| `storyEdits` | Insert dialogue, flag branches, binary choices, and encounter HP edits before an existing line | Clone the host script/page into expanded space, then resume the original line; Herb Picking arrival has mGBA coverage |
| `openings["first-act"]` | Opening cast, dialogue, walking, facing, Goblin encounter, and continuation | Dedicated native-data compiler with fixed opening map/encounter/deployment templates |
| `programs` | 31 editable named operations, typed expressions for all 114 opcodes, opaque preservation, dialogue insertion | Encoding and branch-boundary validation; general combinations still need gameplay validation |
| `dialogue`, `pages`, `scenes` | Text/tokens, page cloning, new pages, scene-index links | Append resources; a new index entry does not register a map or mission trigger |
| `battleEvents["snowball.goblin"]` | Save, inspect, and preview a damage-triggered event draft | Complete-ROM export is blocked; diagnostic probes are separate from production events |

Input must be a validated 16 MiB US `AFXE` ROM. Same-layout data mods can use
ordinary scene, dialogue, and script tools after compatibility checks; their
projects retain their own input SHA-256. Opening replacement and interactive
instructions require the pinned `ffta-us-retail` digest. A specific FFT Mod has
not been tested. Engine hacks, relocated resources, and other revisions need
their own profiles. Editor-exported 32 MiB ROMs reopen only after an exact rebuild.

## 2. High-level story fragments: `storyEdits`

The project header requires `format: "ffta.scene-project/v1"`, `profile`, and
`baseSha256`. Omitted collections are initialized by the importer. Fragment IDs,
flag names, speakers, and enemy names match `^[a-z][a-z0-9-]{0,63}$`.

| Field | Range and behavior |
| --- | --- |
| `title` | Nonblank, at most 80 characters |
| `trigger.scene` | Existing scene 1–233 with an executable native program |
| `trigger.beforeDialogue` | Selector 0–239 matching a native `say` |
| `trigger.occurrence` | 1–240, default 1: which occurrence of that selector |
| `resume` | Must be `"original"` |
| `flags` | Name → native bit-flag ID 0–1535; read-only bindings, not custom save allocations |
| `speakers` | Name → `{dialogue: 0..239, occurrence?: 1..240}`; borrow the native line's speaker and presentation |
| `enemies` | Name → `{slot: 0..3}`; currently verified only for retail scene 14 |
| `steps` | Nonempty; at most 128 steps across the whole recursive fragment, with at most eight nested branch levels |

A fragment exclusively owns its target scene. Multiple fragments or direct scene
edits cannot target the same scene. Direct edits to its source program or dialogue
page are also rejected. The anchor must use a nonvariant native dialogue page.
The compiler clones the program/page and appends lines continuously, keeping new
selectors within 0–239. A full source page can therefore prevent insertion.
Speaker bindings do not create actors; the borrowed actor must already exist.

### Dialogue and native flag branches

These are `steps` values. Bind `ready` in `flags` and `montblanc` in `speakers` first.

```json
[
  {"type":"say","text":"Wait here."},
  {"type":"if","flag":"ready","then":[
    {"type":"say","speaker":"montblanc","text":"We are ready, kupo!"}
  ],"else":[{"type":"say","text":"We need more time."}]}
]
```

```lua
{
  say("Wait here."),
  when("ready", {
    sayAs("montblanc", "We are ready, kupo!")
  }, {say("We need more time.")})
}
```

| JSON step | Lua | Parameters and compilation |
| --- | --- | --- |
| `{type:"say", text, speaker?}` | `say(text)`, `say(text, speaker)`, `sayAs(speaker, text)` | Nonblank text, 1–160 characters; default speaker/presentation inherit the anchor; emits native `0x0f` and appended dialogue |
| `{type:"if", flag, then, else?}` | `when(flag, yes, no?)` | Reference a declared native flag; at least one branch must contain steps; omitted else is empty; native `0x65` and `0x19` branch paths rejoin |

`when` describes a game-runtime condition. Lua `if ... then` statements are not
accepted. Example flag 589 is a branch input, not a defined mission-completion API.
There are no high-level flag writes, arbitrary variable expressions, loops,
functions, general key sampling, or custom persistent-state APIs. Low-level
`setStoryFlag` requires knowledge of the original flag's role; it does not identify
unused save bits.

### Binary choices and encounter HP: optional patch

Set `patches: {"storyChoices": true}`, or `patches = {storyChoices = true}` in Lua.
The UI entry is **Project → Patch options → Story choices and enemy HP**. It is
off by default. `choose` and `enemyHp` fail validation when it is disabled, before
partial application. Remove dependent steps before disabling it. Enabling an
unused patch does not install runtime code.

Declare `enemies: {"captain":{"slot":0}}`, then use this `steps` value:

```json
[{"type":"choose","prompt":"What about the ward?",
  "first":{"label":"Break","steps":[{"type":"enemyHp","enemy":"captain","hp":12}]},
  "second":{"label":"Leave","steps":[{"type":"enemyHp","enemy":"captain","hp":72}]}
}]
```

```lua
{choose("What about the ward?",
  option("Break", {enemyHp("captain", 12)}),
  option("Leave", {enemyHp("captain", 72)}))}
```

| Step | Parameters and behavior |
| --- | --- |
| `choose(prompt, first, second)` | Exactly two options; nonblank prompt up to 48 characters/two lines; nonblank labels up to 11 characters without CR/LF; each route needs at least one step; nesting counts toward global limits |
| `option(label, steps)` | Builds option data; not an independently executable step |
| `enemyHp(enemy, hp)` | Declared enemy, integer HP 1–999; writes current and maximum HP for this encounter only; does not change attack, other stats, global templates, or saves |

The original dialogue system draws the cursor, handles left/right selection,
A confirmation, and B cancellation. Standard token `0x32`, argument `0x10`, and
two separators form the menu. Native opcode `0x71` can test the first-choice
result; current patch opcode `0x72` provides two route offsets and replays the
current question on B. B does not return to the previous question or undo earlier
steps. Menus inherit the anchor speaker. This is not an L/R interface or general
key listener; three-or-more options are not supported. Character limits do not
guarantee pixel layout, so inspect the game display.

Opcode `0x73` writes encounter unit records and ignores vacant records. Although
its runtime bounds check covers slots 0–11, the public compiler permits only
**retail scene 14, enemy slots 0–3**. Choose an anchor after units are loaded and
before later initialization would overwrite HP. The fixture uses
`beforeDialogue: 5`; structural validation alone cannot establish other timing.
Other encounters have not been validated.

The patch appends 100 bytes of ARM7TDMI Thumb and 116 VM descriptors in expanded
space. It preserves all bytes of the first 114 native descriptors and redirects
the table pointer. Opcode `0x72` is five bytes; `0x73` is four. The high-level
compiler generates them; low-level `op`/`native` cannot inject them. There is no
in-game patch toggle or save option.

The complete [herb-ward fixture](../examples/herb-ward.lua) has two choice levels:

| First question | Second question | Slot 0 current / maximum HP |
| --- | --- | --- |
| Break | Scatter | 12 / 12 |
| Break | Keep | 28 / 28 |
| Leave | Flank | 52 / 52 |
| Leave | Duel | 72 / 72 |

All routes into battle and B re-prompting have mGBA evidence. Automated tests also
cover compilation, rejoining, JSON/Lua equivalence, patch gating, and exact reopen.
This is neither physical-device acceptance nor full battle/settlement coverage.

## 3. Opening cutscene: `openings["first-act"]`

The opening uses a separate model: its `say` step has `actor`, whereas a story
fragment uses `speaker`. Use plain JSON/Lua tables; story `sayAs` is not an opening
constructor.

| Field | Range and behavior |
| --- | --- |
| `title` | Nonblank, 1–80 characters |
| `cast` | Unique actors on distinct starting tiles; entries `{actor,x,y,facing}` |
| `actor` | `marche`, `mewt`, `ritz`, `student`, `instructor`, `redCap`, `goblin1`, `goblin2`, `goblin3` |
| `x`, `y` | Integer columns 0–11, rows 0–8 |
| `facing` | `southwest`, `northwest`, `northeast`, `southeast` |
| `steps` | At most 120; each referenced actor must be in the cast |
| `battleIntro` | 0–160 characters; blank omits the battle-opening line |
| `battleEnding` | Optional, defaults to the fixture ending; 0–160 characters; blank omits the line |
| `victory` | Optional; only `defeatOpponents` |

Each line below is an independent object to place in `steps`:

```json
{"type":"say","actor":"marche","text":"Follow me."}
{"type":"walk","actor":"marche","x":4,"y":4,"facing":"southwest"}
{"type":"face","actor":"marche","facing":"southeast"}
```

```lua
{type="say", actor="marche", text="Follow me."}
{type="walk", actor="marche", x=4, y=4, facing="southwest"}
{type="face", actor="marche", facing="southeast"}
```

Dialogue is nonblank, 1–160 characters. Walking emits movement, wait, and tile
update operations; facing emits a field update and refresh. The compiler owns
scenes 1/2/6 and programs 0/0, 0/1, 0/5, rejecting conflicting direct edits.
The Red Cap/Goblin roster, deployment, map, camera, and transitions are dedicated
templates. There is no general actor-template, map, animation-library, attack-stat,
or mission-objective configuration in this high-level model.

## 4. Low-level programs

All 114 instructions have [JSON descriptions](scene-vm-instructions.json), a
[strict instruction schema](../schemas/scene-vm.schema.json), and
[Lua expressions](scene-vm-examples.lua). The [VM reference](scene-vm.md#3-all-114-native-instructions)
lists every handler's operands, wait status, usage, and evidence boundary.

The existing 31 named editable operations remain available. For example:

```json
{"operation":"setActorFacing","operands":{"actor":15,"facing":3}}
{"operation":"waitForActors","operands":{}}
```

```lua
op("setActorFacing", {actor=15, facing=3})
op("waitForActors", {})
```

The two examples on each side are separate instruction values. Named instructions
cannot override their opcode. `u8` encodes 0–255, `u16` 0–65535, and `i16`
−32768–32767, with little-endian multibyte fields. Bit selectors are restricted to
0–15. These are encoding ranges, not verified sets of map/actor/mode/action IDs.
The existing `moveSceneCamera` encoding accepts unsigned halfwords although the
runtime interprets their bit patterns as signed coordinates.

| Existing operation | Operand keys, in encoding order |
| --- | --- |
| `finishSceneTask` | none |
| `selectSceneHandle` | handle:u8 |
| `waitForActors` | none |
| `fadeSceneBrightness` | mode:u8, frames:u8, level:u8 |
| `loadSceneMap` | map:u8 |
| `setSceneRuntimeState12` | none |
| `say` | textSelector:u8, speakerHandle:u8, presentationFlags:u8 |
| `applySceneMode` | mode:u8 |
| `setContextValue` | value:u8 |
| `setSceneRuntimeMode` | mode:u8 |
| `adjustScriptOffset` | delta:i16 |
| `setStoryFlag` | flag:u16, value:u8 |
| `queueScene` | scene:u16 |
| `placeSceneActor` | actor:u8, tile:u8, facing:u8, visibility:u8 |
| `createActionFromHandles` | firstHandle:u8, secondHandle:u8 |
| `playActorAction` | actor:u8, action:u16, mode:u8 |
| `refreshActorFacing` | actor:u8 |
| `setActorFacing` | actor:u8, facing:u8 |
| `setActorTile` | actor:u8, x:u8, y:u8 |
| `moveActorOnGrid` | actor:u8, x:u8, y:u8, facing:u8, mode:u8, speed:u16 |
| `moveSceneCamera` | x:u16, y:u16, mode:u8, duration:u8 |
| `prepareMapView` | mode:u8 |
| `selectScenePresentation` | preset:u8 |
| `fadeSceneAudio` | level:u8, frames:u16, channels:u8 |
| `loadEncounterUnits` | none |
| `selectSceneEncounter` | encounter:u16 |
| `initializeSceneTaskContext` | none |
| `clearSceneTaskContext` | none |
| `selectCurrentSceneEntity` | handle:u8 |
| `waitForSceneTask` | none |
| `addOffsetWhenTargetFlagSet` | handle:u8, bit:0–15, delta:i16 |

Opening brightness uses mode 19/49 and level 100/0. Actor directions use 0–3 in
the high-level enum order; packed tiles use `(y << 4) | x`. The opening movement
subset uses mode 0/speed 1. Camera modes differ: its last operand can be a speed
index rather than frames. Audio fading is not brightness fading. The VM reference
separates opening-flow evidence, direct handler facts, and unresolved parameters.

Program keys are `group/program`, with group 0–61 and program 0–255. `cloneFrom`
references an executable native program. Omit `instructions` to clone unchanged;
when supplying them, provide the complete catalog list without read-only `offset`.
Limits are 32,767 instructions and 32,767 bytes. A program with no native source
must end with `finishSceneTask`, `adjustScriptOffset`, or `setSceneRuntimeMode`.
Changed explicit branches must land on instruction boundaries. Observed native
branches with unchanged position and displacement can remain as recorded.

### Opaque instructions and dialogue insertion

```json
{"operation":"native","opcode":101,"operands":[77,2,0,0]}
```

```lua
native(101, {77, 2, 0, 0})
```

This illustrates the record shape for `0x65`, not a freely injectable instruction.
The catalog reads sizes and handlers from the native descriptor table. Any program
containing opaque instructions requires a native source, identical instruction
count, total size, per-row opcode, and all opaque operand bytes. Editable named
operands remain subject to validation. Unknown bytes cannot be rewritten and
instructions cannot be added/removed to shift their layout.

All 83 previously opaque opcodes also have typed JSON/Lua names, but lowering them
still produces opaque records and applies the same preservation rules. A semantic
name does not bypass validation or inject patch opcodes/machine code.

To insert dialogue while retaining original instruction offsets, use a program
field such as:

```json
{"insertDialogue":[{"anchorOffset":44,"textSelector":182}]}
```

```lua
{insertDialogue={{anchorOffset=44, textSelector=182}}}
```

The anchor must be a native `say` start in that program; selector is 0–239.
Optional u8 `speakerHandle` and `presentationFlags` inherit the anchor. Insertions
at one anchor follow array order. The compiler redirects the anchor to an appended
sequence, plays added dialogue and the original line, then returns, leaving other
offsets stable. A recognized terminal instruction and total size within 32,767
are required. Every linked scene page must contain the new selectors. Editing a
shared program affects every scene that references it.

## 5. Resources and dialogue tokens

| Collection | Rules |
| --- | --- |
| `scenes` | IDs 1–239; native 0–233 includes sentinel 0, while 234–239 are available additions. Set `script:{group,program}` and/or `dialoguePage`; existing omitted fields inherit. References must resolve |
| `pages` | New IDs must be contiguous from 63 through 255. `{}` creates a page; `{cloneFrom:"3"}` or `"61/0"` clones one. The final page needs records |
| `dialogue` | Keys `page:line` or `page/variant:line`; line 0–4094, with continuous appends. Ordinary `say` directly selects only 0–239 |

Each dialogue record provides exactly one of `text` or `tokens`. Encoding is
`standard` or `alternate`. Text defaults to standard; tokens inherit the existing
encoding or default to standard. Flags are 0–65535, inheriting existing values or
defaulting to 16. The encoder reconstructs the low two bits: bit 0 selects alternate,
bit 1 is cleared because edited records are uncompressed. Other bits are preserved;
untouched neighboring compressed records retain their original bytes. A page's
16-bit offsets cannot exceed 65,535 bytes.

Plain text maps spaces to `0x52`, newlines to `0x4d`, and appends `0x40`/`0x42`.
CR/CRLF normalize to LF; straight quotes map to supported curly quotes and
full-width spaces to ordinary spaces. The US character map includes its listed
kana, Latin letters, digits, and symbols, not arbitrary Chinese/Unicode coverage.
Unsupported characters fail encoding. Explicit native glyph tokens require
independent glyph-identity verification.

| JSON token | Lua | Range and positioning |
| --- | --- | --- |
| `{kind:"glyph",code,width}` | `glyph(code, width)` | full: 0–3174, standard only, before half-width mode; half: 1–254 in standard, 0–255 in alternate |
| `{kind:"control",code,args,side?}` | `control(code, args, side?)` | Exact byte-argument count; standard controls cannot follow half-width mode |
| `{kind:"separator"}` | `separator()` | Standard only, closing exactly two strings after `0x32` |

A record permits at most 2,048 tokens and payload shorter than 4,095 bytes.
Standard half-width mode cannot switch back to full width or controls. Alternate
uses half-width glyphs and ends at `0xff`. Explicit tokens do not receive automatic
speech-continuation controls; preserve known original endings.

Supported control codes, in hexadecimal:

| Argument bytes | Codes | Known meaning and restrictions |
| --- | --- | --- |
| 0 | `40 41 42 4a 4d 4f 52 54 56 57 58` | 4d newline, 4f page break, 52 space; 40/42 are observed speech continuation; other meanings remain preserved |
| 1 | `00 1b 1d 46 4b 51 53 32 04` | 51 text variable; 32 two direct strings followed by separators, standard only; other values preserve observed semantics |
| 2 in standard | `45` | Alternate takes one byte and requires side `left` or `right`; arbitrary visual values are not validated |

Direct strings cannot nest. Alternate supports the listed codes except `32`,
using its own native marker numbering; a token code is not its final byte value.
To preserve variables, page breaks, and presentation, start from catalog tokens
and edit readable text runs.

## 6. Lua parsing, conversion, and validation

Lua statically parses one `return { ... }`. It accepts keyed/array tables, finite
numbers including hexadecimal, strings, booleans, comments, and the documented
constructors. Empty arrays use `list()`, empty objects `{}`, and JSON null `null`.
It does not execute files, assignments, functions, loops, or general expressions;
`nil` is unsupported and there is no QuickJS frontend. Quote resource keys, for
example `["63:2"]`.

Short strings support `\n`, `\r`, `\t`, `\a`, `\b`, `\f`, `\v`, quotes,
backslashes, hexadecimal/decimal byte escapes restricted to 0–127, and `\u{...}`.
`\z` is unsupported. Long strings/comments use `[[...]]` or `[=[...]=]`.
Parsed text must still pass the US glyph encoder. Constructors are compact data
notation; ordinary tables can represent the same complete project model.

```sh
npm test
FFTA_US_ROM=/path/to/retail.gba npm test
npm run build
node tools/scene.mjs diff /path/to/retail.gba examples/herb-ward.lua
node tools/scene.mjs build /path/to/retail.gba examples/herb-ward.lua /outside/ward.gba
```

Without ROM input, integration tests are skipped. With the pinned ROM, tests cover
all 114 expressions, all 34,395 original instructions, four compiled choice routes,
menu tokens, patch gating, layout-mod rejection, descriptor preservation, allowed
retail-prefix writes, JSON/Lua identity, and exact reopen. They do not replace
native rendering/input/battle validation.

On 2026-11-25, 25 tests passed with ROM input and none skipped; without ROM, 11
passed and 14 skipped. The offline build passed. Reassembled patch code matched
all 100 embedded bytes. mGBA replayed four routes and cancellation; HP was 12/12,
28/28, 52/52, 72/72. All 353 sampled frames matched the handoff evidence. SAV data
was loaded into memory only. There was no device or full victory/settlement test.
ROMs, saves, and replay assets remain outside Git and public builds.

## 中文摘要

JSON 与受限 Lua 表达同一个项目模型，导出为原生场景数据。原生 VM 共 114 条指令；
31 条沿用可编辑操作数，83 条提供可逆命名表达并保留原布局和字节保护。
原版已有 `0x71` 菜单分支；当前高阶选项补丁增加 B 取消重问和指定敌人 HP。
以上文档区分编码范围、静态分析与游戏实测，不代表任意组合都已验证。
