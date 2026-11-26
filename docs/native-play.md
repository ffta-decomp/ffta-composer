# Native WASM playback

**Native play runs the complete game engine from the current project's ROM.**
The original Snowball sequence is playable from its opening through naming,
the lesson, movement, targeting, attacks, enemy turns, its scripted ending,
and postbattle dialogue. Units, facing and walking animations, camera movement,
dialogue portraits, menus, battle calculations, and audio come from GBA execution.

## Use

1. Open a supported local ROM and select **Native play**.
2. Choose **New game: Snowball** to start a fresh cartridge and enter the first
   act. This sends ordinary Start/A input through the title menus; it does not
   load a supplied state, patch RAM, or skip the opening/naming/tutorial.
3. Use the on-screen GBA buttons or focus the game canvas and use the keyboard.

| GBA input | Keyboard |
| --- | --- |
| Direction pad | Arrow keys |
| A / B | X or A / Z or B |
| Start / Select | Enter / Shift |
| L / R | L / R |

The original menus determine available actions and choices. In Snowball,
select Action → Snowball, use the direction pad or R to select a target, and
confirm the forecast with A. Native menus also provide Cancel and Wait.

Pause freezes execution; Single frame advances one GBA frame. Speed supports
1×, 2× and 4×; sound is played at 1×. Switching tabs or hiding the page pauses
the game, and returning preserves the current native state. Restart preserves
the current battery save and returns to a fresh boot. New game starts without
an imported save. SAV import accepts 64 or 128 KiB files; export downloads a
separate copy. Save in the original game's menu before exporting progress.
Export uses the cartridge's native save size; for retail FFTA this is 64 KiB,
so an imported 128 KiB emulator file's unused padding is not reproduced.
There is no automatic disk or browser-storage persistence: export before closing.

Project edits are compiled into an in-memory ROM before a new core starts.
Changing the input ROM or project invalidates the previous native session.
Character tables control editor decoding; the game draws the fonts present in
the loaded ROM. No custom opcode patch is required for the original Snowball.

## Execution and source provenance

`runtime/mgba-host.c` connects the public mGBA 0.10.5 mCore API to the browser.
Emscripten 4.0.10 compiles the unmodified GBA emulator into WASM. The browser
provides keys, displays a 240×160 framebuffer, and schedules 48 kHz stereo audio.
The core executes the loaded cartridge's ARM/Thumb instructions, interrupts,
scene VM, task scheduler, battle logic, graphics, and native text system.
The offline HTML embeds the same core and all notices. No ROM, BIOS image,
save, recorded replay, or extracted game asset is shipped.

This removes the JS preview's missing-service boundary: a scene function missing
from the semantic model still executes as its original ROM machine code. It
does not require every decompiled function to be compilable or every native
service to be rewritten in JS. Decompiled source was consulted to understand
scene dispatch, actor facing, unit records, menu state, and the battle boundary:

Reference checkout: `6f16714cb9da9059180dbac7ba7282ac870c8044`; the following
consulted files were unchanged in that checkout:

- `ffta-us-decomp/src/story/vm/08121e9c.c`
- `ffta-us-decomp/src/unknown/08126e34.c`
- `ffta-us-decomp/src/story/placement/08124acc.c`
- The native handler addresses and evidence recorded in [the VM reference](scene-vm.md).

These are research references, not source compiled into this core. Composer's
host/browser code is GPL-3.0-only by hitsmaxft; mGBA and its included components
retain their own licenses. Exact upstream source, licenses, and rebuild steps
are in [third-party/mgba](../third-party/mgba/SOURCE.md). WASM SHA-256:
`60408381fa70e86d952a71282cb466480c811a3159c9f3f931d8982f1a4452dd`.

**Instruction preview** remains a separate JS analysis tool. Its modeled states,
coverage matrix, and external acknowledgements are not native-play acceptance.
See [JS runtime boundaries](js-runtime.md).

## Snowball acceptance

Reference: US retail `AFXE`, SHA-256
`43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
The original input remains unchanged. A continuous cold-boot recording ran
**34,227 native frames**, using only GBA keys, without state loads, RAM/HP writes,
instruction skips, or external-service acknowledgements.

| Checkpoint | Observed native result |
| --- | --- |
| First act | Scene 1 after title/new-game input, frame 1,446 |
| Naming and lesson | Native name confirmation and Repeat lesson menu |
| Player movement and attack | Ritz moves (7,3) → (7,5); Lyle HP 32 → 31 |
| Second player attack | Colin HP 17 → 16 |
| Enemy turn | Lyle moves (6,7) → (6,5); Mewt HP 8 → 7 |
| Scripted ending | Mewt reaches HP 5; battle control exits and scene 2 runs |
| Postbattle | Teacher dialogue appears in the original game framebuffer |

Separate native menu checks confirm Yes repeats the lesson and returns to its
question, No records result 1, and B records the original cancellation value 255.

This is the game's scripted Snowball ending, not an all-enemies-defeated victory
or a reward-settlement claim. PNG frames, companion SAVs, states, input recording,
and the hash-bound report remain local outside Git. Reproduce with:

```sh
node tools/replay-native.mjs /path/to/retail.gba /outside/inputs.json /outside/evidence
FFTA_US_ROM=/path/to/retail.gba FFTA_SNOWBALL_REPLAY=/outside/inputs.json npm test
```

Replay records contain `{ "frames": 60, "keys": 0, "capture": "checkpoint" }`;
keys use GBA KEYINPUT bit order, with 1 meaning pressed. The optional replay test
checks the named checkpoints above from a fresh cartridge.

Additional validation covers valid WASM/hash, native video and audio, deterministic
state restore, SAV round-trip, original-input preservation, and fresh first-act
entry on the retail and reviewed Chinese inputs. The 900-frame framebuffer is
byte-identical to the same mGBA release compiled natively. Actual app-module DOM
integration checks native key input, canvas data, pause and tab lifecycle.
The browser automation host was unavailable during this acceptance; that DOM
check uses canvas stubs and does not establish browser pixel/audio quality.
Full-battle acceptance covers the pinned retail input and the reviewed Chinese v1.2
input `67d6ade5def84f86205551cb82baad7dda81f0ef28c71e2cb9cd1917e040e176`
also reaches native postbattle scene 2 with the same continuous 34,227-frame keys;
its final Chinese teacher dialogue was inspected. Different inputs can have
different unit stats and RNG outcomes, so one recording is not an assertion
that every revision follows identical turns.

## 中文摘要

“原版试玩”使用 WASM 执行本地 ROM 的原版引擎，包含角色动画、镜头、对白、
声音与完整战斗。雪球战已从冷启动按原生按键跑到战后场景；不是跳过战斗。
载入 ROM 后点击“新游戏：雪球战”，继续完成原版开场、命名与教学即可。
