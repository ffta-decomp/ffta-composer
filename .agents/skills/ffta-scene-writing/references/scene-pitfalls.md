# Observed scene-authoring pitfalls

These are project observations, not universal FFTA scene rules. Update a case
when new source or native evidence changes it. Do not convert a successful
controlled experiment into an arbitrary-scene or natural-playthrough claim.

## Pub furniture and seated Marche — 2026-11-27

**Symptom:** An added pub act showed Marche in the wrong seated position and lost
both chair backs while the rest of map 63 still looked recognizable.

**Cause:** The initial draft loaded map 63 and created only character objects 2
and 4. In retail scene 53, handles **77 and 79 are separate chair-back objects**.
Native isolation trials that hid them individually removed the corresponding
chair backs. They must remain when other patrons are absent. A native actor/unit
list includes furniture and is not a character census.

The draft also copied only Marche's `0x1f` creation, repositioned him, and played
a seated action. Retail additionally applies an actor-local `0x2e` offset of −8
to the second world axis and a `0x30` mode-0/value-0 state write. His action 53
changes the position further. In the observed settled pose, the draft had world
`(400,112)`; retail had `(400,104)`, both on tile `(12,3)`, facing 1. Match the
whole setup rather than adding a guessed tile correction. The full meaning of
all `0x30` states is not inferred from this one case.

**Current approach:** Explicitly borrow initial actor-local setup for 2, 77 and
79 from scene 53; borrow Ritz's creation from scene 134. Preserve chair offsets
and actions as native bytes from the user's ROM. Only omit departing story participants; retain the reviewed ambient residents.
The native regression matches the original world coordinates, furniture state
and a 55×76 seated-corner pixel region. Retain this comparison in
[the native scene tests](../../../../tests/scene-preview.test.mjs).

Baseline scope: pinned US retail SHA-256
`43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19`,
map 63. These handle identities and action 53/54 meanings are scoped to this
reviewed pub staging. Relevant native handlers: `08122f58`, `0812310c`,
`0812314c`, `08126d34`; independent decomp reference revision
`6f16714cb9da9059180dbac7ba7282ac870c8044`. No decomp C is copied into Composer.

## Resident staff were removed with the story cast — 2026-11-27

**Symptom:** After restoring the chairs, the user noticed that the pub's bartender
was also missing. The previous draft and test treated “only Marche remains” as
one visible person and explicitly excluded the bartender and background patrons.

**Cause:** There was no separate inventory for story participants, resident staff,
ambient people and furniture. A strict two-character whitelist repeated this
mistake in the assertions. The user's clarification requires preserving residents.

**Correction:** Keep scene 53's native ambient initializers 128, 129 and 130 (patrons),
and the distinct bartender initializer 53 from shared pub scene 134, including
their actor-local setup. Omit the departing story visitor Ezel (10). Ritz enters as the added story
participant. Native temporary selectors 128–130 resolve to three different unit
records that all have unit ID 1: do not identify or collapse them by that ID.
Reviewed continuation inventory:

| Native selector | Role | Source scene | Added-act treatment |
| --- | --- | --- | --- |
| 2 | Marche, story participant | 53 | Retain the original seated setup |
| 4 | Ritz, story participant | 134 | Initially hidden, then enter and leave |
| 53 | Resident bartender | 134 | Remain behind the counter throughout |
| 128–130 | Ambient patrons | 53 | Retain all three original setups |
| 77,79 | Chair-back props | 53 | Retain throughout |
| 10 | Ezel, departing original-story visitor | 53 | Do not respawn in the added act |

The bartender stands at tile `(2,3)`, facing 0, with the shared setup's world
position `(92,120)`. The first resident fix misidentified patron 130 at `(5,4)`
as the bartender; a native capture of shared-pub actor 53 showed the actual
bartender behind the counter. Do not infer an occupation just from proximity
to the bar or an anonymous unit ID. The regression separately compares ambient
patrons against scene 53 and the bartender against scene 134, then checks
visibility through the full act.
This preserves this pub population; it is not a rule that every generic actor in
every scene is a permanent resident.

## Dialogue exists but is clipped

The pub draft reused Ritz's presentation flags 130 from a different shot. At the
new blocking/camera, the native bubble crossed the top/left edge. Long authored
single-line text also overflowed. Source/encoding tests had passed.

The observed fix places the bubble below the actors (flags 144 in this shot)
and adds explicit native line breaks. Verify all four lines in rendered frames,
including Ritz's denial and Marche's follow-up. These flags and widths are shot
choices, not defaults for every character. Inspect encoded-video frames too.

## A familiar map is not a valid entry context

A post-Snowball checkpoint did not safely launch later story scenes: some runs
changed the map and then faulted. Late-party transplantation and a single flag
write did not establish a valid caller lifecycle. The later-scene prototype uses
a naturally reached mission pre-load boundary instead.

Scene 93 could execute edited dialogue on **map 71 instead of map 37** when the
caller encounter selection was absent. Its verified entry needs the native
encounter bootstrap. Check map and native ownership, not only a changed string.
See [entry evidence](../../../../docs/later-scene-validation.md).

## Queueing a scene does not choose its caller lifecycle

Original scene 53 ended with native mode 5, which returns to the world map. A
queued added act was not made correct by just appending its ID. A trial using
mode 1 also failed in this entry context. The working pub continuation uses mode
2, as in the reviewed native chained-scene scripts. Preserve original dialogue,
actions and fade; explicitly change the exit contract for the appended act.
Validate the full chain, not a direct launch of the second act alone.

## Parent PC and counts can give false confidence

A parent can wait while a child owns dialogue or movement. Gating automatic
confirmation only on the parent's last `say` stalled original scene 53. Native
A pulses allow this demonstration to advance, but can choose menu branches and
must not stand in for interaction testing. Track actual child/task behavior when
more precise controls are needed.

The original full-scene test counted only Marche/Ritz and consequently enforced
the omission of furniture. Define semantic acceptance first; update assertions
that mistake all native objects for people. Intermediate world positions and
visible furniture are stronger evidence than a target actor count. Creation can
span asynchronous actions: assert the complete cast at the initialized staging
beat, not as soon as the first actor appears during black. A recording-helper
assertion that expected both props immediately after Marche was created was a
validation timing error, not a native initialization failure.

## Wrong camera observations and stale script addresses

Current native camera coordinates in this profile are at `0x02007f64/+2`.
Earlier observations at `0x02007f60/+2` read other fields, so their apparent
camera equality was insufficient. The four-scene/12-case probe was corrected
and rerun. Re-derive offsets from the current ABI and compare actual panning.

Compiled resources move as the project grows. Decode the actual compiled bytes
and allocation for PC traces and snapshots; pre-injection command lists and old
ROM addresses omit appended blocks. Restore before allocation when replaying a
changed project.

## Recording and build-validation limits

The first new recording exposed the clipped bubble even though native execution
and DOM integration had passed. Later visual review exposed missing furniture.
Full test-suite success is only as strong as its assertions and observed shots.

An initial recording helper waited for a PCM `close` event after it had already
fired: complete media streams existed, but metadata finalization did not finish.
Register completion promises before ending streams, or inspect their closed
state. Keep those recordings; verify decode and provenance before using them.

The browser-control host was unavailable during these checks. Native framebuffer
capture and actual-WASM DOM integration do not establish browser interaction or
audio-device playback. State that boundary plainly.

## Expanded setup changes jump boundaries

The structure review found that an original-branch exception could accept the
same old delta after a borrowed actor setup had expanded in size. The jump could
then enter the middle of that setup. Only retain the original-branch exception
when the entire instruction layout is unchanged; otherwise validate the new
boundaries. Borrowed setup is one atomic authoring instruction. The synthetic
[compiler regression](../../../../tests/program-compiler.test.mjs) covers both
rejecting the stale delta and accepting a corrected target without game inputs.
