# Native scene preview in the editor

The primary **Scene preview / 场景演示** tab runs the current project inside the
bundled mGBA WASM core. It starts at a verified scene-loading checkpoint, so the
preview shows the selected scene rather than cartridge boot and save menus.
The complete-cartridge player remains in the advanced tools.

This is a bounded prototype on pinned US retail, not a universal scene launcher.
It provides native maps, sprites, movement, facing, camera, dialogue portraits,
input and sound. JavaScript selects the entry and controls playback; the original
GBA scene VM executes instructions. No custom VM opcode or ASM hack is installed.

## Use

1. Load the original US ROM and a local preview-context JSON file.
2. Click **Load tavern adaptation**. Select **53** to play the original and its
   continuation, or **239** to replay just the added act.
3. Play, pause, step, change speed, or continue dialogue. Disable **Advance
   dialogue automatically** to handle choices manually. The automatic mode sends
   a two-frame native A pulse every 180 frames, including child-task dialogue.
4. Open **Edit preview story**, edit the project JSON, and apply it. Replay
   compiles the current project into a new candidate and restores the entry
   checkpoint. It does not reuse the previous script address or inject bytes into
   a running script. Undo remains available in the editor.

## Tavern continuation

The paired [JSON](../examples/tavern-continuation.json) and
[Lua](../examples/tavern-continuation.lua) describe an authored continuation:

- Original scene 53 retains its dialogue, actors, movements and final fade.
- A queue instruction added before its last dialogue schedules scene 239.
- Its final native exit switches from mode 5 (world-map return) to mode 2
  (the original chained-scene lifecycle). This change is explicit in
  `resume: "queuedScene"`; `resume: "original"` retains the native exit.
- After black, the pub fades back in. Marche, the remaining story participant,
  sits at the lower-right table/chair, tile `(12,3)`, using his original seated action 53.
- The camera pans toward the entrance. Ritz enters; Marche stands with action
  54 and runs over. He asks whether she remembers him; she denies recognizing
  him, walks out, and the scene fades to black.

Marche and Ritz form the added story cast. The original ambient patrons
(128–130), shared-pub bartender (53) and chair-back objects (77,79) remain.
Ezel and Shara are absent from the added act. “Only Marche remains” does not
clear resident staff or the pub population.
The final black frame is retained in the preview. Character counts exclude these
reviewed pub props; the VM actor registry still contains them.

`borrowSceneActor` is a **compiler reference**, not a custom game instruction:

```json
{"operation":"borrowSceneActor","operands":{"scene":53,"actor":2,"setup":"initial"}}
```

```lua
op("borrowSceneActor", {scene = 53, actor = 2, setup = "initial"})
```

It resolves exactly one unchanged six-byte native actor initializer (`0x1f`)
from the user's input ROM. Source scene: 1–233; actor: 2–254. It does not copy
text, sprites or ROM bytes into the example files and does not expose unresolved
initializer operands for editing. Ambiguous or missing actor initializers fail.
Optional `setup: "initial"` also copies the contiguous actor-local `0x2e`
position offsets, `playActorAction` records and `0x30` state writes immediately
after creation, stopping at the first unrelated command. It copies no branch,
other actor or guessed operand. The pub uses this for Marche's original seated
position and both chair backs. Reapplying a generic placement or seated action
after that setup would undo the preserved state. Actor IDs, actions and map
coordinates remain specific to the selected content.

A high-level queue step is `{type:"queueScene",scene:239}` in JSON or
`queueAfter(239)` in Lua. The native `queueScene` instruction continues to use
`op("queueScene", {scene=239})`. `resume:"queuedScene"` requires exactly one
unconditional top-level queue step targeting a project-owned scene and a
supported final native mode (1, 5 or 7); it changes that final mode to 2.
A matching queue/lifecycle does not establish that arbitrary scene prerequisites
are satisfied. `waitFrames16(frames)` now permits explicit native countdowns
from 0–65535 without an opaque source clone. There are 32 editable native
operations and 82 operations with source/layout preservation guards. Existing
raw `native(0x16, {low, high})` countdowns remain accepted and compile identically.

## Local context and scope

Context files contain private game state and a battery save. They are excluded
from the repository and must not be published. The format
`ffta.scene-preview-context/v1` bundles the manifest, state and save produced by
[the later-scene probe](later-scene-validation.md). Package an existing verified
checkpoint directory with:

```sh
node tools/package-scene-context.mjs /private/checkpoint /private/context.json
```

The tool refuses repository output and existing files. In the editor, import
that JSON with **Load preview context**. The loader checks ROM/core revision,
state/save sizes and checksums, then checks the actual native entry boundary
after restore. The checkpoint embeds no edited script; each replay builds the
current project before native script allocation. Entry changes only the current
scene and queue head before loading. Scene 93 also needs a native encounter
bootstrap. There are no ongoing actor/PC writes or JavaScript acknowledgements
of unsupported instructions.

Verified entry presets are scenes 53, 93, 98, 101 and pub scene 134. The demo adds
239. The provided context requires ROM SHA-256
`43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`
and core SHA-256
`60408381fa70e86d952a71282cb466480c811a3159c9f3f931d8982f1a4452dd`.
Chinese cartridges and arbitrary saves require separately validated contexts;
this does not change the editor's existing Chinese text/table support.
The scene preview is bounded to ten minutes of native frames per replay.

## Validation and evidence boundaries

`tests/scene-preview.test.mjs` checks original scene-body byte preservation,
queue lifecycle, actor-reference rejection, JSON/Lua equivalence, native full
53→239 execution, black→lit pub transition, two-person story cast with residents and chair props, intermediate walking
coordinates, camera interpolation, four new dialogues, Ritz's exit and final
black pixels. A second candidate changes Ritz's line and must produce different
native dialogue pixels after rebuilding from the same checkpoint.

```sh
FFTA_US_ROM=/private/retail.gba \
FFTA_PREVIEW_CONTEXT=/private/context.json \
node --test tests/scene-preview.test.mjs
```

The full suite is run with local US/Chinese ROMs, the owner-supplied character
table, a complete cold Snowball input recording and the preview context. The
four-scene entry matrix also passed all 12 positive cases after the camera-address
correction. The current review and module boundaries are documented in the
[structure review](scene-authoring-review.md).

App integration was also exercised with actual WASM under a DOM harness:
context import, example load, full playback, canvas delivery, JSON edits and
replay. This is not real-browser interaction or audio-device verification. The
browser-control host was unavailable during this run; native framebuffer PNGs
were inspected separately. ROMs, saves, states and these game screenshots remain
local. Export compilation and this scene acceptance do not prove completion of
every game scene or battle.

Independent reference: `ffta-us-decomp`, revision
`6f16714cb9da9059180dbac7ba7282ac870c8044`, specifically lifecycle
`08121908`, exit-mode handling `08121a48`, and camera transitions `0801bb0c` /
`0801ba20`. No decomp C was copied into Composer. The camera's current coordinates
are at `0x02007f64/+2`; `0x02007f60/+2` are not current camera coordinates. The
later-scene probe was corrected and rerun accordingly.

中文摘要：在现有编辑器内直接演示场景。原剧情结束并黑屏后，酒馆重新亮起，
马修坐在右下椅子上，老板、背景客人和家具保留；丽兹入场，马修跑近问话，她否认认识并离开，最后黑屏。
修改 JSON 后重播执行新编译脚本；目前入口只覆盖经过验证的美版场景和本地配置。

Authoring workflow and observed failures are maintained in the project-local
[FFTA scene-writing skill](../.agents/skills/ffta-scene-writing/SKILL.md).
The chair regression now compares native furniture/world coordinates and a
55×76 seated-corner pixel region against the unchanged retail initialization.

Resident-population correction: shared-pub scene 134's bartender (53) and scene 53's
background patrons (128–130) retain their original initialization. The three native scene
regressions check their presence throughout the act and compare their settled
state to retail; the offline actual-WASM editor integration also passes. The
three temporary patron selectors resolve to distinct records with the same unit
ID 1; bartender 53 is separate, with its own original offset and counter position.
