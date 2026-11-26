# Scene simulation design

Status: implemented on `scene-simulator`; excluded from the documentation/VM-expression CR #1.

## Outcome

A local scene-preview player shows the selected map, actor positions, dialogue,
choices, and execution flow. Playback supports pause, single-step, restart, speed,
and editing test conditions. It stops at combat handoff rather than simulating
turns, damage, AI, victory, or rewards. A scene preview is not a hardware emulator.

## Data boundaries

- Use the loaded input ROM in memory. Do not fetch assets or upload ROM/SAV data.
- Keep derived images in browser memory; ship no extracted maps with the app.
- Read US map directory 0x569104, 162 records of 0x58 bytes.
- Independently decode map graphics, arrangement, and palette formats. Reuse
  Composer's own existing custom-LZ primitive where its format matches.
- Record format-research sources from ffta-us-decomp, including map resource
  extractors and retail consumers. Do not copy those implementations.
- Treat map animations, original actor sprites, pixel-perfect presentation,
  audio, save progress, and combat as separate capabilities rather than implied
  accuracy claims.

## Architecture

`map-preview.mjs` is a read-only ROM asset adapter. It resolves wrappers and map
redirect/overlay chains, bounds compressed sizes and writes, expands paired tile
entries, and renders RGBA pixels with BGR555 palettes and GBA flips. Malformed or
unsupported resources produce a visible error, not a replacement placeholder.

`scene-simulator.mjs` is a deterministic, browser-independent execution model.
It accepts project/ROM/planned resources without changing the authoring project.
It exposes cloned snapshots plus step/tick/confirm/choose/cancel commands.
The panel implements restart by creating a fresh session.
Known instructions and authoring steps produce explicit state transitions.
Unsupported instructions pause with an explanation and an explicit skip action;
they are not silently treated as implemented. Execution and task counts are
bounded. Entering a combat handoff pauses at a distinct battle boundary.

`ui/simulator.mjs` owns playback timing and view controls. It renders the real
static map with an actor-position overlay, a compact dialogue box, and a flow
trace with the current step highlighted. Changing scene/project or leaving the
panel stops timers. UI text is localized. The English documentation distinguishes
semantic playback from native-engine acceptance.

## Initial validation targets

1. Decode a school map directly from retail and compare its composition visually.
2. Open a fresh authored Goblin Patrol and play its dialogue, walk, and facing
   steps; stop before battle, then edit and restart the current project.
3. Play all four Herb Ward choice routes and B cancellation in the semantic
   preview without running combat or writing a save.
4. Toggle flag inputs and confirm both native/authoring branches rejoin.
5. Verify pause, step, restart, speed, timer cleanup, keyboard focus, i18n,
   narrow-screen layout, and visible handling of unsupported operations.
6. Validate the complete existing ROM/JSON/Lua suite remains unchanged.

## 中文摘要

模拟使用本地ROM地图，展示角色位置、对白与流程；战斗入口暂停。
语义预览与原生引擎实测分开记录，未知指令不会静默当作已支持。

## Current preview contract

The Simulation tab works directly from the current unsaved project. Opening
projects preview their declared cast and actions and stop at combat handoff.
Story fragments preview their branches/choices and then show the original anchor
line, ending before the remaining native scene. Other scenes use a bounded native
semantic interpreter: known state changes and child-script controls are modeled;
unsupported operations pause and require explicit skipping or restart.

Play advances waits/movement and holds dialogue briefly before continuing. Next
confirms dialogue or advances an action; Restart rebuilds from current authoring
data. Choices wait for input. A/Enter/Space advance the focused stage; B/Escape
cancel a choice. High-level and native choices both follow native result255 behavior: B
cancellation continues along the second route. Authoring flag checkboxes affect only the preview.
Leaving the tab, changing scene/project/language, or pausing stops its animation
clock. No ROM, project, or save data is changed.

Map directory IDs shown in the preview are zero-based. Native scene/save map
values are one-based: retail initializer0801a100 subtracts1. The opening resolves
content record30, map value1, to directory0. A replay of the supplied Herb Picking
fixture confirms content32, save map value71, resource index70. This default
context is verified for retail and reviewed US Chinese scene14 fixtures; arbitrary inherited map contexts
require an explicit map selection. An explicit native map operand also subtracts1.

Maps are static compositions of original tiles, palettes, flips, and arrangement
layers decoded in browser memory. Original actor sprites, their animation frames,
precise camera transforms, occlusion, audio, and dynamic map animation are not
emulated. Actor markers are schematic and are labeled as such. Missing animation
tiles can leave gaps; the map adapter exposes a missingTiles count.

Graphics wrapper `0x22` includes a byte destination offset before its nested
compressed-bank header. The preview relocates those tiles before resolving
arrangement entries. The Herb Picking bank starts at byte `0x820`; ignoring this
offset produces an incorrect mosaic. This follows the retail loader at
`0801a518`, specifically its destination and transfer setup at `0801a6a0–0801a6f6`.

## Format-research attribution

This implementation uses the format findings and source/disassembly research in
`ffta-us-decomp` snapshot6f16714cb9da9059180dbac7ba7282ac870c8044, specifically
`extract_map_table.py`, `extract_map_graphics.py`, `extract_map_layout.py`,
retail consumers0801ed24/0801f124/0801f1a8/0801a518, map initializer0801a100, and projection
consumer0801c918. Their implementations were inspected as references and were
not copied. The decoder and simulator are independently written FFTA Composer
code by hitsmaxft under GPLv3; preserve LICENSE/NOTICE when reusing them.

The existing Composer custom-LZ primitive is reused for matching map streams.
GBA BIOS-LZ77, directory/overlay parsing, paired tile expansion, and composition
are independently implemented here. Extracted screenshots and native context
probes are local regression evidence and are not repository assets.

## Validation recorded on 2026-11-25

- Full suite with the pinned US retail input: **36 tests passed, no skips**.
  This includes all 34,395 native instructions round-tripping through typed
  JSON, compact Lua, and compilation, plus all prior authoring/runtime checks.
- All 162 map records decode to bounded, nonempty RGBA compositions without
  modifying the ROM. The school and Herb Picking compositions were visually
  inspected and their pixel hashes are regression fixtures. This does not assert
  visual equivalence for every map or emulate animated tiles.
- A local mGBA replay resolves Herb Picking to map directory 70. Its 18,272-byte
  decoded static graphics bank matches native VRAM exactly at byte offset `0x820`.
- Model tests cover movement/facing, combat stopping, all four nested-choice
  routes, native cancellation, flag branches, source preservation, native child-task
  waits, native choice-zero branching, unsupported instructions, and loop bounds.
- DOM integration QA loads the actual app module and local ROM and exercises
  navigation, autoplay, pause, restart, nested native choices, map override, bilingual
  UI, and timer disposal. This uses jsdom with a canvas stub, not a browser.
- Offline build passes. Browser/native-window access was unavailable in this
  session, so browser-rendered pixels, keyboard focus behavior, and narrow-screen
  layout remain unverified. The tests do not establish native-engine equivalence
  for the entire semantic interpreter.

Local evidence is retained in `/tmp/ffta-composer-simulation-research/`:
`test.log`, `dom-report.json`, `map-verification.json`, map images, and native
probe logs. ROM/SAV inputs and extracted images remain outside Git.
