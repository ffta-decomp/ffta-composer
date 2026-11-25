# Agent integration and native resource format

## Workflow

1. Load a supported ROM and request its catalog. IDs are numeric, stable
   within the pinned profile, and zero-based except for the scene ID
   sentinel. Scene names and captions in the interface are preview text,
   so use the numeric IDs in project data.
2. Create a project or import a partial project. The header is required
   for both. Only provide the resources to change.
3. Preview the result. The diff has typed change entries and ROM pointer
   and allocation arrays. Resolve validation errors before applying.
4. Apply to the working project, then save it or build the ROM.

The browser bridge on the editor's own page exposes:

- `await inspectRom(bytes)` → game code, SHA-256, profile, and editability
- `await open(bytes, fileName)`
- `getCatalog({ includePrograms, includeDialogue })`
- `getStory(sceneId, variantIndex = 0)` → ordered story steps, resolved dialogue, and known branch offsets
- `getProject()` → project object
- `exportProject('json' | 'lua')` → complete project text
- `preview(projectOrText, 'merge' | 'replace')`
- `apply(projectOrText, 'merge' | 'replace')`
- `exportRom()` → `Uint8Array`

Merge replaces entries by resource key. Replace uses the supplied project
as the complete edit set. Both validate the result before changing editor
state. The editor never evaluates code from a project document.

## Project source formats

A project can be saved and loaded as JSON or Lua. Both forms reach the same
ROM-profile and project validation before compilation. The Lua importer reads
one returned data table using a static parser. The parser accepts named tables,
ordered arrays, strings, numbers, booleans, comments and the constructors
below. Arbitrary function calls, assignments, loops and file access are outside
this authoring language.

| Lua expression | Project data |
| --- | --- |
| `say(text)`, `sayAs(actor, text)` or `say(text, actor)` | Dialogue step with an optional native speaker binding |
| `when(flag, yes, no)` | Native flag branch. The last argument is optional. |
| `op(name, operands)` | Named native instruction |
| `native(opcode, bytes)` | Preserved instruction and its opaque bytes |
| `glyph(code, width)`, `control(code, args, side)`, `separator()` | Dialogue tokens. The side is optional. |
| `list()`, `{}`, `null` | Empty array, empty object, and JSON null |

Use list-style tables for nonempty arrays and keyed tables for maps. Keys such
as `["63:2"]` retain the original resource references. Short quoted strings
support escapes such as `\n`, `\t` and `\u{e9}`. Lua long strings and long
comments can span multiple lines. Every constructor has a table form, so
documents can represent every field and value of the project schema.

The [JSON sample](../examples/herb-arrival.json) and
[Lua sample](../examples/herb-arrival.lua) compile to the same ROM bytes.

```sh
node tools/scene.mjs convert examples/herb-arrival.json lua
node tools/scene.mjs diff /path/to/retail.gba examples/herb-arrival.lua
node tools/scene.mjs build /path/to/retail.gba examples/herb-arrival.lua /path/to/story.gba
```

`convert` changes the source representation. `diff` and `build` validate the
project against the supplied ROM. The GBA executes the emitted native
instructions.

## Project example

This creates an independent copy of the opening dialogue page and changes
its first line for the existing scene. It also adds another line to that
page. The existing scene continues to run its original script.

```json
{
  "format": "ffta.scene-project/v1",
  "profile": "ffta-us-retail",
  "baseSha256": "43fc8204c6dceee58828aebc7af0c72eb807e99f35ad641c8bb0a4fa8b6edc19",
  "scenes": { "1": { "dialoguePage": 63 } },
  "pages": { "63": { "cloneFrom": "1" } },
  "dialogue": {
    "63:0": { "text": "A new story begins!" },
    "63:182": { "text": "See you at the orchard." }
  }
}
```

Plain text defaults to the standard scene encoding. Newlines encode as
the native line-break token. Plain scene text finishes with the continuation
sequence observed in retail speech. Use the catalog's token list and
explicit encoding to retain all controls or customize the flow. For variant
pages use keys such as `61/0:3`. US font support is limited to mapped
characters or explicitly supplied and verified native glyph codes.

A new script can name a retail source via `cloneFrom: "0/0"`. To edit it,
also provide the full catalog instruction array with the read-only
`offset` field removed. Apply changes to named operations and operands.
For an original program containing opaque instructions, the compiler
preserves the instruction layout and requires those opaque instructions
to match the selected native source. Opcode definitions with IDs, names
and operand sizes come from the catalog.

## Native writes

The retail index is accessed through the address word at `0x9a20`.
Each row maps to a one-based native group, zero-based program, dialogue
page and reserved byte. The original table contains 234 records,
including sentinel 0. Five rows point outside the recovered script
directory and some more point to empty program slots. New IDs are kept
within the 234–239 editor range.

The script archive at the word `0x1223c0` uses a directory of
32-bit relative pointers to group directories. Each program offset is
relative to its group. The dialogue book at `0x9a88` uses book-relative
32-bit pointers and page-relative unsigned 16-bit line offsets.
Page 61 contains a variant directory whose entries are also relative
to the book base. New pages use contiguous IDs starting at 63.

The retail readers add the relative values with 32-bit arithmetic.
The editor rebuilds only touched directories and pages in the extension
area, using wrapped relative offsets to keep unchanged data in place.
Changed text records are emitted uncompressed and copied neighbors retain
their original encoded bytes. Builds include the declarative project in
an extension-area trailer. Reopening restores the redirected pointer words in memory, verifies the
complete input digest, rebuilds and compares the whole output byte-for-byte.

The format and semantics were independently implemented for FFTA US using
the pinned retail ROM and FFTA1 decompilation as references. No code from
FFTA2Editor was imported.

The native dialogue instruction used by the story view is opcode `0x0f`.
The verified US handler reads a text selector, speaker handle and
presentation flags. The editor resolves the ordinary selector range
0–239 against the scene's dialogue page. Higher selectors use the native
fallback path and are marked separately. In the cold-boot opening replay,
changing the first `say` from selector 0 to a newly added selector 182
displayed the new text, including a line break, through the native task.

Use `programs["group/program"].insertDialogue` to add a native dialogue
before a known `say` instruction. Each entry specifies the catalog
`anchorOffset` and a `textSelector` in 0–239. Optional `speakerHandle` and
`presentationFlags` inherit from the anchor when omitted. The compiler
places the added sequence after the existing program and links back to
the original flow, keeping original instruction offsets stable. Referenced
dialogue lines are validated for all linked scenes before export.

Battle event drafts are available under `battleEvents["snowball.goblin"]`.
Call `preview` to inspect the typed rule and `buildable` status. Use
`exportBattleListenerProbe()` when testing the standalone damage hook.
See [Battle event trial](battle-events.md).

## Declarative story fragments

Import [Herb Picking Arrival](../examples/herb-arrival.json) as a project.
Its `storyEdits` entry attaches to an existing dialogue in the mission's
entry scene. The editor renders both alternatives at the anchor.
`getStory(14)` returns the fragment as a structured `authored` step.

A `say` step inherits the anchor's speaker and presentation. Use a named
speaker binding to borrow another native line's actor and presentation.
That actor must already be available in the scene when the fragment runs.
An `if` step reads a named game flag. Its two paths rejoin and the fragment
resumes the original dialogue. The example uses native flag 589 as a branch
input and does not assign it a mission-completion meaning.

The compiler clones the host program and dialogue page into expanded space.
Only the selected scene uses the clones. The JSON has no jump offsets or
executable source. The current trigger must be an existing nonvariant
dialogue site. New quest registration, persistent custom state, new actors
and battle-time listeners require their own native bindings.

The arrival fixture was replayed in mGBA from a loaded save with each branch
input set while the first dialogue box was open. Both routes displayed the
correct alternative, passed the next line to Montblanc and returned to the
original mission dialogue. The [post-battle example](../examples/herb-field-report.json)
has build and bytecode coverage. A full victory-to-settlement replay of that
fixture remains pending.
