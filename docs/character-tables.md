# Custom character tables

Select a built-in character table, or import an external one, to read and edit
a localized ROM with its own glyph labels. The mapping changes Unicode presentation and text-to-token encoding;
it does not install a font, translate text, change the VM, or authorize an otherwise
unsupported engine. The owner-requested US Chinese v1.1 mapping is bundled as
a selectable preset; its source provenance is retained in NOTICE.

## In the editor

1. Open a supported US or reviewed US Chinese ROM.
2. Use the **Character table** selector in the page header: **Original US**,
   **US Chinese v1.1**, or **Import custom character table…**. The same selector
   is available in Project → Character table.
3. Recognized Chinese ROMs automatically select the built-in US Chinese v1.1
   table; original US ROMs retain the original US mapping. No file import is
   needed for the built-in table. Custom imports accept JSON, CSV, TSV, or
   `CODE=label` text. The dialog shows labelled/total entries and duplicate labels.
4. Edit dialogue or import a project containing Chinese text, then save JSON/Lua
   or export a separate ROM. The normalized table is saved in `characterTable`.

The dialog also exports the normalized mapping or restores the default for the
current ROM. A selected original-US mapping is stored as explicit `null`, so it
remains an explicit choice when a project is saved and reimported.
Mapping changes support undo/redo. A failed import leaves the project unchanged.
Restoring the default is rejected if existing authored text cannot be encoded
without the selected mapping; remove those edits or supply an appropriate table.

A mapping-only change preserves the input ROM byte-for-byte; save the project to
retain that configuration. A ROM with actual scene/text edits embeds both the
project and mapping and reopens with them. Existing ROM/SAV inputs are never
modified or uploaded.

## External formats and native code meaning

Supported JSON forms include:

- A normalized `ffta.character-table/v1` document, as described by
  [the schema](../schemas/character-table.schema.json).
- `{name?, entries: [{code: "8xxx", text: "…"}, …]}` or a hex-code → label object.
- The supplied `character-table.json` format: `{schema: 1, glyphs:
  [{index, token, unicode, …}, …]}`. Font hashes/advances remain external metadata;
  only labels and indices enter the project.
- Decimal index → label/null objects such as `index-to-unicode.json`.
- Label → token-list objects such as `unicode-to-tokens.json`; all aliases survive.

CSV/TSV accepts `token` or `code` with `unicode`, `text`, or `character` columns,
or `index` with a label column. This directly accepts the supplied
`character-table.csv`, including its BOM and quoted fields. Headerless two-column
rows use a hex code and label. `CODE=label` rows accept JSON-quoted labels to
represent spaces. Blank lines and lines beginning with `#` or `//` are ignored.

Full-width codes are **native tokens** `8000–8C66`, corresponding to glyph indices
`0–3174`. Numeric `index` fields and decimal-key dictionaries mean full-width
indices; they are not byte strings. Codes below `0100` are half-width glyph
indices, not standard-stream bytes. Use explicit entry objects when a dictionary
key could be ambiguous. If both token and index are present, they must agree.

A normalized project entry is `{width: "full" | "half", index, text, preferred?}`.
Half-width indices stop at255. Null labels preserve unlabelled source indices.
Labels may contain multiple Unicode characters and match longest-first. New text
uses the first alias in input order unless one entry declares `preferred: true`.
Conflicting code labels, multiple preferred aliases, invalid indices/widths,
control characters in labels, and tables without labelled glyphs are rejected.

An imported full-width table is authoritative for full-width glyphs: missing
labels display as explicit unknown-index tokens, and missing characters in edited
text fail instead of silently falling back to the US alphabet. Native half-width
text remains separate unless half-width entries are explicitly supplied. This is
especially important for Chinese digits, Latin letters, spaces, and duplicate
aliases. Spaces use a mapped glyph when present; line breaks remain native controls.

## Byte preservation and compatibility

Decoding produces native tokens first; the character table only labels them.
Unchanged records and unchanged safe-edit runs retain their original token choices,
control codes, compression, and source bytes. A text edit identical to its current
preview does not canonicalize duplicate aliases or replace invisible controls.
Changed records encode through the selected width domain and preserve untouched
records in the copied page. Project/ROM SHA-256 binding is unchanged.

The reviewed US Chinese v1.1 executable fingerprint is accepted as
`ffta-us-cn-layout`, with the original 114-entry descriptor table, fixed root
pointers, and bounded archive structure still checked. Data-only variants can
retain their own SHA-256. A supplied mapping cannot bypass unknown engine checks.
Opening replacement and battle diagnostics remain restricted to verified retail.

The Chinese archive relocates page bodies while retaining the scene-text root.
Its padded directories terminate at the first `FFFF` slot; the final record is
bounded by its parsed stored length. Nineteen known `0000FFFF` source placeholders
cannot be decoded and remain visible as read-only opaque records. They are copied
as source bytes when their page is relocated, and edits targeting them are rejected.
Other malformed records do not become invented empty strings.

## API and CLI

Browser bridge:

- `loadCharacterTable(source, name?)` imports/validates a table and returns counts.
- `getCharacterTable()` returns the normalized project mapping, or `null`.
- `getCharacterTablePresets()` lists stable preset IDs and names.
- `selectCharacterTable("us-retail" | "us-cn-v1.1")` selects a built-in preset.
  Preset switching validates existing edits before changing the project.
- Existing project imports accept `characterTable`; explicit `null` clears it.
- Catalogs, story previews, safe text editing, and simulation use the selected table.

The pure module adapter is `parseCharacterTable(source, name?)` in
`src/character-table.mjs`. `withCharacterTable(rom, table)` returns a relabelled ROM
view without changing its bytes or original page records. Core preview/encoding
helpers accept an explicit optional table; no process-global encoding switch is used.

```sh
node tools/scene.mjs project /path/to/cn.gba \
  --character-table /path/to/character-table.json > /outside/project.json
node tools/scene.mjs catalog /path/to/cn.gba --dialogue \
  --character-table /path/to/character-table.csv
node tools/scene.mjs build /path/to/cn.gba /outside/project.json /outside/edited.gba
```

## Acceptance: 2026-11-26

The owner's external US Chinese v1.1 mapping has3175 indices,2731 labelled entries,
444 blanks,2688 distinct labels, and43 duplicate-label groups. JSON, CSV,
index-to-Unicode, and Unicode-to-token inputs agree on all3175 index labels.
The mapping source workbook SHA-256 is
`473dd8d2bb43c17aab292a51e00fa5154b97bc5610d53cded1cb737d6d02e17e`.
These pins identify the acceptance inputs, not an inferred third-party license.

- CN input SHA-256:
  `ddbf29205a66d9711d8f6ec2ce7b2de481d3d58255efdc3791e45e1771548c03`.
- Native acceptance candidate SHA-256:
  `6c83f7d65e24166ebd6ccd64f97bfe8dd46f721b539434f70d6a6b845c9229a1`.
- All43 project tests pass with retail, CN ROM and mapping inputs; no skips.
  Tests cover all labelled glyphs/aliases, default behavior, width separation,
  longest matches, missing labels, malformed tables, no-op bytes, unchanged
  source records, opaque placeholders, JSON/Lua, and exact exported-ROM reopening.
- mGBA0.10.5 displays the authored Chinese dialogue, numbers/Latin text, native
  Chinese menu, both routes, and B cancellation. Each rejoins the original flow.
  No font or custom instruction patch is installed. Source engine/font bytes
  remain unchanged; only resource-root pointers change in the input prefix.
- DOM integration exercises the actual file-input import, mapping counts, Unicode
  previews, restore, undo/redo, failed-import preservation, Chinese simulation
  choices, and project persistence. Browser/native-window access was unavailable;
  browser-rendered layout is not claimed as validated. Emulator images were inspected.

Repeat the full suite with external inputs:

```sh
FFTA_US_ROM=/path/to/retail.gba FFTA_CN_ROM=/path/to/us-cn-v1.1.gba \
  FFTA_CHARACTER_TABLE=/path/to/character-table.json npm test
npm run build
```

Local evidence is retained at `/tmp/ffta-composer-character-tables/`: source pins,
candidate/project files, format comparisons, test/DOM reports, controller inputs,
replay source and logs, and emulator images. No ROM, save, table workbook, font pixels, or translated game dialogue is
checked into this repository. The built-in mapping contains only character labels,
indices, aliases and nulls, as explicitly requested by the owner.
This is software-emulator acceptance, not physical-device or arbitrary-mod acceptance.

## References and attribution

Independent implementation informed by the local FFTA2 Editor snapshot
`9dfc97d51eda5d10960bc78d548252c512a047df`: `web/src/core/wordTable.ts`,
`charset.ts`, and the FFTA core's `retail-labels.mjs` width separation. The relevant
contracts are explicit mapping input, longest matching, preserving aliases and
unchanged source bytes, and avoiding single-byte fallbacks in localized text.
Those implementations were inspected as references; their source was not copied.

The external mapping and its provenance were read from `ffta-us-cn`
snapshot `61e0788b919bc7b1edf3a768e2fee23551ae9f74`,
`config/charsets/us-cn-v1.1/`. That package attributes the owner-supplied third-party
workbook and explicitly does not infer a license. Composer preserves that
provenance in NOTICE and the generated preset module. To reproduce the preset:

```sh
node tools/generate-builtin-character-table.mjs /path/to/character-table.json \
  src/character-tables/us-cn-v1.1.mjs
```

The generator checks the exact reviewed mapping hash and emits only labels; font
hashes, advances, ROM bytes, and workbook content are excluded.
New adapter/integration code is FFTA Composer by hitsmaxft under GPLv3; preserve
LICENSE/NOTICE and identify reuse and modifications.

## 中文摘要

顶部可直接选择原版美版、内置美版汉化 v1.1 或自定义字表；汉化 ROM 默认选汉化表，
原版 ROM 保持原版映射。“项目 → 字表”也支持导入 JSON/CSV/TSV/TBL，字表随项目保存；全角与半角映射分开，
重复字符保留原 token，缺字时报错。已用现有美版汉化字表和对应汉化 ROM 验收，
mGBA 确认中文对白、数字英文、中文菜单和两条路线正常；不安装字体或自定义指令。
