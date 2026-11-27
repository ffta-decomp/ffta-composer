# Pub authoring and compiler structure review

The pub continuation now retains native seated setup, chair backs, the shared
pub's bartender and three ambient patrons. Explicit line breaks and the staged
bubble placement keep the four new lines readable. The project-local
[scene-writing skill](../.agents/skills/ffta-scene-writing/SKILL.md) records the
observed failures and their evidence, including the initial bartender
misidentification.

## Resolved structure and correctness findings

| Finding | Resolution |
| --- | --- |
| Project planning also contained all instruction encoding and actor-reference expansion | `src/program-compiler.mjs` owns encoding, read-only setup resolution and control-flow validation; `src/project.mjs` coordinates resources and export |
| Setup copy lengths repeated opcode sizes | Resolve boundaries from decoded source-command offsets; stop before unrelated actors or control flow |
| Original jump deltas could bypass validation after a setup expanded | Restrict the original-branch exemption to unchanged layouts; check current authoring boundaries otherwise |
| Native memory inspection also identified map-specific furniture | Keep classification in `src/scene-actors.mjs`; the preview reader supplies the observed unit ID and map |
| Schema options depended on the last array element | Use an explicitly named actor-reference schema before adding it to the alternatives |
| Repeated actor setup boilerplate and a hardcoded script-group lookup | Use a local setup helper and resolve the reference script through its scene record |
| Generated examples could drift away from the editor demo | Compare both published JSON/Lua examples to the current demo in the existing compilation regression |

The compiler remains a small function-based module. No plugin framework, generic
registry or new VM opcode is introduced. Actor-local setup stays a read-only ROM
reference; raw unresolved instruction guards remain in effect. The existing
preview session and UI ownership are unchanged.

## Verification

The candidate ROM before and after the structure changes has the same SHA-256:
`fa6afde1d4450c049d3deef317873fbd10659b1ba8773fce8e629cfaef15b51d`.
This ties the existing corrected native recording to the refactored compiler's
output; the recording does not need to be presented as a new browser recording.
The hash applies to the reviewed US base and exact pub project, not arbitrary
inputs.

The full suite passes **69/69 with zero skips**. The offline build, actual-WASM
DOM integration and skill validation also pass. Validation covers the synthetic
macro/jump regression and the full project suite
with local game inputs, the original 34,395-instruction round trip, native
53→239 playback, resident state comparison, chair/pose pixels, text editing and
replay, schema regeneration, skill validation, and the offline HTML build.
Actual-WASM DOM integration is separate from browser interaction; the browser
host was unavailable for the earlier visual run. Game recordings, ROMs, saves
and screenshots remain outside Git.
