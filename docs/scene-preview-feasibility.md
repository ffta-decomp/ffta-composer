# Scene-entry feasibility experiment

Date: 2026-11-27. Scope: a local, bounded prototype, not a released editor feature.

## Question and acceptance gate

Can a newly compiled later scene execute directly in the existing WASM core,
without replaying the game from its beginning after each edit?

The previous complete Snowball playthrough did **not** answer that question.
Executing a whole cartridge is different from establishing a reusable scene
entry. The emulator supplies execution and presentation; it does not supply the
scene's prerequisite state, invalidate cached script pointers, or select a safe
entry boundary. It should not have been presented as the completed editor preview.

This experiment deliberately supports only scene 2, the original post-Snowball
sequence, with one naturally reached pre-load context on pinned US retail.
Passing this gate establishes a possible checkpoint-based replay mechanism for
that context. It does not establish arbitrary scene launching or live hot reload.

Follow-up: [middle- and late-story validation](later-scene-validation.md) tests
four additional scenes with a different native entry context, including a
rejected case where new dialogue runs on the wrong map. The school checkpoint
does not generalize to those scenes.

## Source evidence

ROM SHA-256:
`43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`.
WASM SHA-256:
`60408381fa70e86d952a71282cb466480c811a3159c9f3f931d8982f1a4452dd`.
Local `ffta-us-decomp` reference:
`6f16714cb9da9059180dbac7ba7282ac870c8044`.

| Inspected reference | Observed responsibility |
| --- | --- |
| `src/saves/08121908.c` | Scene lifecycle: allocate pool/root, create script task, advance, release handles, apply queued state, destroy |
| `src/story/vm/0812237c.c` | Resolve the scene record and script archive; construct the native script task |
| `src/story/vm/08122abc.c` | Fetch at script base + PC and dispatch the original descriptor/handler |
| `src/unknown/08121fb8.c` | Native waits, asynchronous completion and transition processing |
| `src/unknown/08123e00.c` | Mode-specific reset, units, flags and callback registration |
| `src/missions/08009afc.c` | Event queue setup, including event-specific flag changes and redirection |

These are inspected behavior references, not copied C implementations. Some
reference files retain upstream notices without an inferred license grant; they
are not linked into this prototype. Machine execution uses the user's ROM.

The inspected mGBA 0.10.5 `src/gba/serialize.c` rejects a mismatched game identity
but only warns about a different ROM CRC. A successful state load therefore
does not demonstrate that the restored pointers belong to the edited resources.

## Minimal implementation

Only [tools/probe-scene-entry.mjs](../tools/probe-scene-entry.mjs) is added to
execution tooling. The app, native core, build, and public deployment are unchanged.

```text
prepare(originalROM, privateNativeKeys):
    run the original game once
    stop when scene 2 becomes pending and the previous VM root is gone
    require scene=2, root=0, scriptActive=0, queueCount=1, queueHead=2
    capture state + companion SAV + source/core/file hashes

verify(originalROM, verifiedCheckpoint):
    validate all hashes and the boundary contract
    for baseline, edit A, edit B:
        compile a separate candidate ROM
        create a fresh core with that ROM and companion SAV
        restore the pre-load checkpoint and recheck the boundary
        let the original lifecycle allocate and initialize the scene
        check the task-owned script pointer against the compiled allocation
        check PC reaches the newly inserted dialogue instruction
        capture original framebuffer, trace and elapsed time
    reject a checkpoint taken while the old scene is already running
    demonstrate the stale original script pointer in that negative control
```

Edit A inserts `SCENE TWO EDIT A` before scene 2's first native dialogue anchor.
Edit B changes the content and adds a native flag conditional. Scene 2's original
first instruction clears flag 2; the new conditional must execute its else line,
`SCENE TWO EDIT B` / `SECOND REVISION`. This checks changed bytecode and changed
dialogue resources, not just replacing a displayed string in JS.

Both edited programs are relocated beyond the original 16 MiB cartridge prefix.
The proof checks the native task owner's context and PC, rather than only the
scene ID or static compiled bytes. No manual game-RAM edits, CPU-call trampoline,
custom opcode, or injected machine-code launcher is used.

## Reproduce locally

```sh
# One-time natural progression, with a private recording kept outside Git.
node tools/probe-scene-entry.mjs prepare /path/to/retail.gba \
  /outside/native-inputs.json /outside/checkpoint

# Rebuild and replay both edits directly from the same boundary.
node tools/probe-scene-entry.mjs verify /path/to/retail.gba \
  /outside/checkpoint /outside/results
```

`verify` produces a hash-bound `report.json`, three PNG frames, native states and
SAVs, and the two edited ROM/project pairs. All outputs must be outside the
repository. Recorded input, states, saves and game pixels are not distributed.
The script has native assertions; a failed condition ends with a nonzero status.

## Measured result

**PASS for the stated scene-2 checkpoint contract.** Preparation naturally reached
the pre-load boundary at frame **33,746**. Its one-time cold progression took
55.25 seconds on this host; this work is not repeated for either edit.

| Candidate | Native script base | Observed PC after the target dialogue instruction | First target frame | 480-frame verification time |
| --- | --- | --- | --- | --- |
| Original | `0x089a636f` | 17 | Not an added line | 959 ms |
| Edit A | `0x090003e4` | 3487 | 50 | 1,009 ms |
| Edit B, new conditional | `0x090003e4` | 3492 | 50 | 1,063 ms |

The context at `0x020163a4` is owned by the native task at `0x0201638c`.
Both edits start with PC 0, retain the original leading waits/actions, then reach
the newly compiled dialogue. The A and B framebuffer images were inspected and
show their distinct authored text. B shows the expected else branch, not
`UNEXPECTED BRANCH`. The native render retains the school map and characters.
No JS dialogue overlay is involved.
Repeating `verify` into `recheck/` produced identical native PC traces and
framebuffer hashes for all three candidates.

Negative control: mGBA accepts a running original scene's state under edit B,
but its context retains **`0x089a636f`**, not `0x090003e4`. The prototype rejects
that running state before supported replay. This directly demonstrates why
unqualified savestate reuse is not a valid hot-reload design.

Local evidence: `/tmp/ffta-composer-wasm/scene-entry-prototype/`, including
`checkpoint/manifest.json`, `results/report.json`, `baseline.png`, `edit-a.png`,
and `edit-b.png` under `results/`. Report pins every candidate ROM, framebuffer,
checkpoint and core hash and records the native PC trace. Images and game inputs
remain outside Git. Timing is Node/WASM execution on this host, not browser
latency, actual audio quality, or a cross-platform performance claim.

## Decision boundaries

The supported contract is **replay one known scene from its verified entry
context after a data-only project edit**. Context already contains the school
map, actors and game progress from the real preceding battle. This is not
independent scene initialization from an empty machine.

A general editor preview still needs separately demonstrated entry contexts for
scenes with different maps, missions, rosters and battle/result state. Conditions
must be explicit; a context cannot silently be treated as valid for another scene.
Code/ABI changes and unreviewed ROM revisions must invalidate this prototype's
checkpoints. Changes to resources already loaded before the boundary may require
an earlier boundary; this experiment does not prove their reinitialization.

No change to primary editor playback should follow merely from this one passing
case. The next decision needs representative later-scene evidence and an explicit
context/invalidation contract. Browser integration is a later acceptance gate,
after scene entry itself is demonstrated.

## 中文摘要

本原型只验证美版战后场景 2：从原生加载前检查点，直接执行重新编译的脚本和对白，
并用脚本地址、PC 与真实帧画面确认。它不等于任意场景直达，也不等于编辑器实时预览
已经完成；其他场景的前置状态和失效规则仍需逐类证明。

The follow-up [editor preview](scene-editor-preview.md) integrates the verified
entry mechanism into the existing editor and tests an authored pub continuation.
