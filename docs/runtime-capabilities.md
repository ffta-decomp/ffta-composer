# Scene runtime capabilities beyond actor movement

The original VM is a scene coordinator: it controls presentation, dialogue,
conditions, asynchronous tasks, and transitions into other game systems.
Instruction encoding, editor authoring support, and native gameplay coverage
are separate levels of evidence. All 114 encodings are described in
[the full VM analysis](scene-vm.md); this guide focuses on useful combinations.

## Capabilities and useful combinations

| Capability | Native instructions | Example use | Current boundary |
| --- | --- | --- | --- |
| Story memory and conditions | `1a` set/clear story bit; `65` conditional branch; `19` jump | A later conversation changes after an earlier story event | Native set/clear and all three zero/nonzero/cleared paths tested below. Existing flags have game meanings; this is not a free custom-flag allocator. High-level `when` reads declared flags. |
| Dialogue and choices | `0f` dialogue; `71` result-zero branch; text token `32` menu | Offer a route, show its dialogue, then rejoin | Four routes and three cancellation combinations tested in [native choice regression](native-choice-regression.md). B takes the second route. |
| Timing | `15` byte frame counter; `16` halfword frame counter | Pause between scene beats without another dialogue | Both tested below. Their native scheduling adds a polling boundary; they are not wall-clock sleep calls. |
| Parallel scripts and joining | `00/01` start named/anonymous child; `03/04` wait for selected/all children; `02` finish; `05` cancel children | Start two independent actions, then continue after both finish | Native child completion, filtered/all joins, and cancellation tested below. This is a task system, not a synchronous function call. Low-level opaque-layout protections remain in force. |
| Display composition | `06/07` brightness; `08/09` blend setup/clear; `0b` alpha; `0e` background-layer visibility | Fade a scene or reveal/hide map layers | `0e` tested below with register and pixel evidence. Brightness/blend operations have context-dependent behavior and were not newly tested here. |
| Camera | `46` target actor; `47` coordinate target | Establish a location, pan, or follow the speaking character | Original handlers provide modes/timing. `47` has editable operands; `46` retains opaque-layout restrictions. No new direct native camera acceptance in this pass. |
| Audio | `4c` audio-definition service; `4d` volume interpolation | Apply an existing audio definition or fade selected volume channels | Existing definition IDs and channel semantics matter. `4d` is editable; `4c` is preserved opaque data. No new audible acceptance in this pass. |
| Map and scene handoff | `0c` load map; `1c` enqueue scene; `17/18` runtime mode/transition | Leave a conversation and hand control to the next scene/system | Not a general teleport API: content, map context, queue limits, and the receiving state machine must agree. Map operands are one-based; zero uses current content. No new arbitrary-handoff acceptance in this pass. |
| Encounter and result workflow | `53` choose encounter definition; `4e` load units; `36` reward/result workflow | Reuse an existing encounter or result flow | These rely on mission/content setup. `36` is not a general item-grant API. Combat and settlement were outside this pass. |

For example, a cutscene can start a camera pan and a character action in child
scripts, wait for both, display a choice, check a story flag on the chosen route,
and queue the next scene. The native primitives exist; arbitrary combinations
still need a verified authoring path and gameplay acceptance. The editor does not
yet provide visual controls for all of these workflows.

## Native diagnostic coverage added on 2026-11-25

A local diagnostic ROM tests the original handlers directly. It replaces a
reserved appended scene-data block with **206 bytes of original scene bytecode**.
No custom handler, engine code, or descriptor table is added or changed. Restoring
only the resource-pointer writes reproduces the complete original 16 MiB prefix.

This is a diagnostic fixture, not a normal editor export: its deliberately
replaced bytecode no longer agrees with the embedded authoring manifest. It does
not loosen the production compiler's 82 opaque-instruction preservation guards.

- Input: pinned US retail SHA-256
  `43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
- Candidate SHA-256:
  `f1ed28564fb683ae819fd0e9d8c28f833cee0a5a76beb6a8a033afc23428c27e`.
- Original descriptor pointer: `0x083a7ee4`.
- mGBA 0.10.5 replay: 6,326 frames; supplied SAV loaded into memory only.
- Flags 1400–1415 are temporary diagnostic markers in this disposable run,
  not allocated project flags or a promise that retail leaves them unused.

| Check | Direct observation |
| --- | --- |
| `1a` and `65` | Clear, set, and clear-after-set branches reach success markers; the failure marker stays clear. |
| `15`, counter 30 | Marker frames 2988 → 3019: continuation after 31 emulated frames. |
| `16`, counter 300 | Marker frames 3019 → 3320: continuation after 301 emulated frames. |
| `00`, `03`, `02` | Named child reaches its marker at frame3367; the filtered-wait parent continues at3369. |
| `00/01`, `04`, `02` | Named and anonymous children finish at3446 and3386; the all-child wait continues at3448, after both. |
| `05` | Parent continues at3448. The cancelled child's delayed failure marker remains clear for more than2,000 subsequent frames. |
| `0e` | Hardware display bits `0300` clear at3449 and restore at3462. Screenshots show map layers hidden while actors remain visible, then the map restored. |

Local reproducible evidence is in `/tmp/ffta-vm-capabilities-regression/`:
`build.mjs`, `fixture.json`, `replay.c`, `replay.input`, `replay.log`,
`verify.mjs`, `verification.json`, screenshots, and the candidate ROM.
Run `node verify.mjs` there to recheck the recorded measurements.

The project suite now passes **36 tests, no skips** with the pinned ROM. New model
tests cover flag isolation, full-width countdown values, and child cancellation.
Model time is semantic preview time; it does not reproduce the native scheduler's
frame-by-frame polling overhead. No physical device, audible audio, arbitrary
camera/map handoff, or battle settlement acceptance is claimed.

## 中文摘要

除单位行动外，原版 VM 还负责对白选择、剧情标志、条件跳转、等待与并行脚本、
画面与镜头、音频、地图切换和任务流程。本次新增原生实测覆盖标志、两种帧等待、
并行汇合、取消子脚本和背景图层开关；其他能力按源码分析和编辑器支持分别标注。
