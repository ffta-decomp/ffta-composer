# Native choice regression

The current `choose` compiler uses original FFTA US instructions only:
`0x0f` displays a native token-`0x32` menu, `0x71` branches on result zero,
and `0x19` joins the routes. No custom instruction handlers are installed.

## Candidate and checks

- Source: 16 MiB US retail, SHA-256
  `43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
- Candidate: current `examples/herb-ward.json`, SHA-256
  `093891ea63cc1b74484045cd5b8e97cb1af6e60ee4bea6f9c341913c0b11cb81`.
- JSON and Lua produce identical ROM bytes. Exported projects reopen and rebuild
  identically. All 33 pinned-ROM tests pass without skips; offline build passes.
- Native descriptor pointer remains `0x083a7ee4`; all 114 descriptors are unchanged.
  Allocation reports contain no `storyRuntime` or `sceneVmDescriptors` entries.
- Enabling `patches.storyChoices` or authoring `enemyHp` is rejected. The custom
  implementation remains in source for future review but cannot run in this build.

## Direct mGBA replay, 2026-11-25

The local harness uses mGBA 0.10.5, loads the supplied SAV into memory, and sends
real controller inputs. It reads the script context in EWRAM and menu result at
`0x02002043`. Observed PC is the offset immediately after the active dialogue.

| Inputs | Observed route | Dialogue PC | Resumed original |
| --- | --- | --- | --- |
| Break → Scatter | Scatter | 524 | Yes |
| Break → Keep | Keep | 517 | Yes |
| Leave → Flank | Flank | 499 | Yes |
| Leave → Duel | Duel | 492 | Yes |
| B → Flank | Flank | 499 | Yes |
| Break → B | Keep | 517 | Yes |
| B → B | Duel | 492 | Yes |

B returns `255`; native `0x71` does not take its zero branch, so the second route
runs. It does not re-prompt. All seven runs reach original dialogue PC532 and
then original script PC142. Route screenshots were captured; Scatter and Duel
were directly inspected. The example changes dialogue/flow only, with no HP
or encounter writes. Historical traces named `route-12/28/52/72` select the four
routes here; those filenames do not imply current HP values.

Local evidence: `/tmp/ffta-native-choices-regression/`, including candidate,
`verification.json`, `build.json`, `test.log`, replay source/binary, input traces,
context logs, and screenshots. ROM/SAV/assets remain outside Git. Software
emulation is not physical-device acceptance or full battle/settlement coverage.

## 中文摘要

选项现在只用原版 `0x71`/`0x19`，没有注入自定义指令。四条路线及三种 B 取消组合
均经 mGBA 实测并接回原流程；B 进入第二路线，不会重问。自定义实现保留但停用。
