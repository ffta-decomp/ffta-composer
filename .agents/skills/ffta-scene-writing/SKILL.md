---
name: ffta-scene-writing
description: Write, adapt, stage and validate FFTA Composer scenes using native scene instructions, JSON/Lua projects and the editor preview. Use when authoring dialogue, actor or furniture blocking, camera and fades, scene continuations, or recording a scene demonstration.
---

# FFTA scene writing

Deliver the user's requested scene as an editable project and an observed native
performance. Work in FFTA Composer's existing editor. Read
[project constraints](../../../AGENTS.md) and the
[authoring reference](../../../docs/instructions.md). For a runtime or visual
anomaly, consult [observed pitfalls](references/scene-pitfalls.md).

## Establish the intended act and its native context

Restate the latest narrative sequence in concrete beats before changing the
project. Distinguish a rewrite of an existing scene from an added act after its
ending. For an append request, preserve original dialogue and actions, retain its
fade-out, and explicitly stage the next fade-in and ending. Resolve routine
blocking choices from the original scene and current user instructions.

Inspect the actual source script, map, actor initializers, props, pose offsets,
state flags, camera and native exit mode. Start from an observed native baseline
on the same ROM revision and camera. Record the input hash, project/candidate
hash and entry context; a filename or a familiar map is insufficient identity.

Use the native scene VM. Custom opcodes remain reserved and disabled in the
current project. Use [typed instruction descriptions](../../../docs/scene-vm.md)
without treating typed names as permission to edit opaque operands or bypass
source/layout checks. Keep JSON and Lua equivalent.

## Preserve scenery and native setup

Build a scene inventory with **story participants, resident staff, ambient patrons
and furniture/props** before removing anything. A scene actor can be a chair.
“Only Marche remains” refers to the story participants unless the user explicitly
requests an empty venue. Retain resident staff (such as the bartender), normal
background occupants and furniture by default; do not reinterpret narrative cast
cleanup as clearing the entire room. Check the latest user clarification when it
changes that intent. The map background alone may not contain its foreground pieces.
Classify handles from inspected source and rendered isolation trials, not their
numeric range or a unit-count target. An event-specific script can omit venue
staff: cross-check a shared/normal location setup, and verify role and appearance
before borrowing its resident initializer. Ambient occupants in one reviewed scene
are not automatically permanent NPCs in every scene using the same map.

An actor initializer is not necessarily its complete initial state. Preserve the
source's actor-local position offsets, pose actions and state writes where they
belong to the chosen staging. `borrowSceneActor` with `setup: "initial"` retains
the contiguous supported actor-local setup from the user's ROM; it does not infer
other required actors, furniture, paths, encounter state or later setup elsewhere
in the script. Audit those dependencies separately. Do not apply the pub's offsets
or action numbers to unrelated characters and maps.

For a missing object, compare the unchanged source and candidate with the same
camera, fade level and narrative moment. Isolate object visibility, position and
state in research trials, then reproduce the fix through compiled native
instructions. Research RAM writes are diagnosis, not playback acceptance.

## Make dialogue readable in the staged view

Carry the native speaker association through each line and verify its portrait.
Speaker identity, text encoding flags and dialogue presentation flags are separate
fields. Presentation flags borrowed from another shot may place a bubble outside
the viewport after actors or camera move.

Wrap authored text for the native 240×160 display with explicit line breaks when
needed. Inspect all lines, punctuation, portrait and bubble edges after native
rendering. A string present in the project or a dialogue PC reached by the VM
does not establish that the audience can read it. Allow enough dwell time in a
recording for both typewriter reveal and reading.

## Replay the actual edited scene

Use the [verified editor entry workflow](../../../docs/scene-editor-preview.md).
Compile the current project before restoring a matching pre-load checkpoint and
allocating the script. Recompute script addresses after relocation. Show the
scene in the editor; cartridge boot and save menus are not a substitute for
selected-scene preview.

A checkpoint is specific to native prerequisites. Verify the map, cast/props,
encounter context, camera and script ownership together. Reject CPU faults and
wrong-map dialogue even when a changed line appears. Keep unsupported entry
contexts explicit; current US preview evidence does not establish CN preview or
arbitrary mission launch support.

Follow native queue and exit-mode semantics for continuations. The pub example
uses `resume: "queuedScene"` to preserve the original act and change its final
exit to chained-scene mode 2. This is a tested example, not a universal mission
transition recipe. Replay the full chain through final black, including native
child tasks. Automatic A pulses can confirm choices; disable them when validating
interactive branches and cancellation.

## Acceptance and delivery

Check the visible story: initial scenery, resident staff, ambient occupants and furniture, initial pose and world
position, entrance, actual intermediate movement, facing, camera, readable
speaker-associated dialogue, exit and final fade. For regression-prone static
areas, compare a meaningful original/candidate pixel region and native state.
Do not accept actor counts, instruction counts or the first dialogue as evidence
for the complete scene.

Run the relevant project and native regressions. Build the editor and verify that
editing and replaying uses the new candidate. Report native execution, DOM
integration, actual browser checks and physical-device checks separately.

When asked for a recording, capture new continuous native frames and audio from
the current candidate. Preserve earlier recordings and project/input provenance
in separate local revision folders. Keep the recording helper or input timing
needed to reproduce it. With the pinned core, native FPS is `262144/4389` and
audio is stereo 48 kHz. Inspect frames extracted from the encoded video and decode
both tracks fully. A successful encode or screenshot montage is insufficient.
Keep ROMs, saves, states, recordings and game screenshots outside Git and local;
a skill does not authorize uploading them elsewhere.

Write analysis and this skill's maintenance notes in English; a short Chinese
summary is useful. Record newly encountered scene-authoring anomalies and
material cautions in the linked reference before finishing: symptom, evidence-backed cause, fix and
verification status. Mark unresolved causes as hypotheses. Keep ROM-specific
examples scoped to their source revision.

中文摘要：先核对原版完整初始化；角色对象中可能包含椅背等家具。“只留一人”
不能删掉常驻老板、背景人物和家具。对白、站位、镜头、切场都要用原生画面验收，录像须重新录制并
检查成片；排错过程中发现的实际问题记录到附带的案例参考。

FFTA Composer, hitsmaxft — https://github.com/ffta-decomp/ffta-composer.
Preserve the project's LICENSE, NOTICE and attribution when adapting this skill.
