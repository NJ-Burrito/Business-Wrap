# Document types (0.18.0 document studio)

A document type is a finished **starter document**: the editor's start page lists the types, and picking one opens a new
document made from it. This folder is **not** an evidence pack (`templates/<id>/pack.json` is a different system); the
leading underscore makes every existing `templates/*` scan skip it. Adding a type is one folder and one `order`, no code.

```
templates/_doctypes/
  README.md  schema.json         this contract
  _categories.json               [{id, name:{ar,en}, order}]            six categories
  _palettes.json                 {navy, forest, gold, slate, rust}      computed, never typed (see below)
  _art/<id>.svg                  thumbnail, one per type (lane L7)
  <id>/type.json                 look + metadata (validated by schema.json)
  <id>/en.json  <id>/ar.json     the starter DOCUMENT JSON, content only
```

Code: `engine/doctypes.mjs` (reads this folder). Validator: `node tools/doctypes/check.mjs [id ...]` (exit 0 = clean).
Test: `node tests/run.mjs doctypes-0180`.

## type.json

| Key | Rule |
|---|---|
| `id` | `^[a-z][a-z0-9-]*$`, equals the folder name |
| `code` | 2 to 4 capitals, unique; the document id is `BW-<CODE>-NEW-001` |
| `category` | `start`, `requirements`, `testing`, `delivery`, `governance`, `training` |
| `order` | integer 0 to 999, sorts inside the category |
| `since` | optional, `0.18.0` |
| `name`, `description`, `placeholder` | `{ar, en}`; at most 90 / 240 / 60 characters. `placeholder` is the title part after the colon: `control.title` ends with `: <placeholder>` |
| `palette` | `navy`, `forest`, `gold`, `slate`, `rust` (decisions.md D2: requirements=navy, testing=forest, delivery=gold, governance=slate, training=rust, start=navy) |
| `coverDesign` | `spine` (full cover page) or `compact` (title block on page 1, no cover page); decisions.md D3 |
| `motif` | equals the type id; the cover's signature shape (ux/covers.md §3) |
| `layout` | optional: `hide` (`cover control revisions toc questions`), `front`, `page {size, orientation}` |
| `source` | optional: `samples/<folder>`; the content is read from `<source>/document.<ed>.json` (used by `srs` = `samples/blank`, one copy only) |

## en.json / ar.json (content only)

A complete document JSON in the shape of `samples/blank/document.*.json`.

- Required: `control` with all ten keys (`documentId title preparedBy documentType classification owner issuedOn version status reviewCycle`),
  `revisions` (at least one row), `chapters`, `labels {kicker, subtitle}`, `openQuestions: []`. Optional: `composedAt`, `controlTable`, `chrome`, `layout`.
- Forbidden: `design`, `coverDesign`, `docType`, `service`, `motif` (all composed from type.json), a non-empty `approvals` (DOCX-only; use a sign-off `table`),
  any block kind outside `prose subhead table figure diagram stories gap shots`, embedded `data:` images, e-mail addresses, phone or id shapes,
  local paths, client names (hashed denylist `security/denylist.sha256`), the author's name.
- Chapter and section `number` are positional (`"1"`, `"1.1"`); they are regenerated on render.
- The AR/EN pair has the same shape: equal chapter and section counts, block kinds, table column and row counts, diagram node and edge ids, stories and shots counts, `layout`.
- Size: at most 14 KB per edition once composed and minified; all types together (both editions plus art) at most 400 KB.
- Placeholders are `…` or `[Name]`; sign-off cells print empty with `{"text":"","keepEmpty":true}` or a table `blankCell:""`.

## _palettes.json

Seven colour roles per palette (`primary primary-deep primary-50 primary-100 accent accent-rule accent-bright`), the only roles the HTML, PDF and DOCX read.
Every value is **computed** from `palette/tokens.json` by `node tools/doctypes/check.mjs --write-palettes`; `"$from"` names the ramp step or mix. The
validator recomputes them and fails on a difference. Navy equals `design/ours/theme.json`; rust is the `diagram.rework-line` token `#853311` with derived
tints. Floors checked on every palette: white on primary, primary on paper, accent on paper, accent-bright on primary-deep, primary-deep on primary-50
at 4.5:1; accent-rule on paper at 3:1.

## _art/<id>.svg

Language-neutral thumbnail, a portrait page `viewBox="0 0 W H"` (H > W; the shipped art uses 240x320), at most 6 KB, no `<text>`, `<image>`, font, script, handler or external reference (only `#fragment`
hrefs and `url(#id)`), and `safeSvg()` must leave it unchanged. The start page mirrors it with CSS in right-to-left.

## API (engine/doctypes.mjs)

All take an optional last argument `{ root }` (a repo root; default this repo). No folder, or an empty one, is an empty registry.

| Function | Returns |
|---|---|
| `listTypes()` | the `type.json` objects, ordered by category, `order`, id |
| `loadType(id)` | `{ ...type.json, content: {ar, en}, art }` (`art` is `''` when there is no svg) |
| `compose(id, ed)` | the final document of `'ar'` or `'en'`: content + `service`, `docType`, `coverDesign`, `motif`, `design.vars` (the palette), `layout` (type + content). `FORMAT` and `BUILT_KEYS` do not change |
| `payload()` | contract C2: `{ v:1, categories:[{id,name,order}], types:[{id,code,category,order,name,description,placeholder,coverDesign,motif,palette,accent,art,docs:{ar,en}}] }`; `docs` are composed, minified JSON strings; only categories that hold a type |
| `payloadJson()` | the payload as a string safe inside `<script type="application/json" id="bw-doctypes">` (`<` escaped) |
| `categories()`, `palettes()` | the shared files, parsed |
