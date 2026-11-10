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
| `coverDesign` | the page-1 family (work/sdlc/design/0190-types.md §1): `spine` (title page with the control block), `compact` (title block on page 1, no cover page), and, from R2, `report`, `form`, `sheet` (until R2 lands they print as `spine`, `compact`, `compact`) |
| `motif` | optional and **ignored** since 0.19.0: page 1 carries no motif and no art, in HTML, PDF or Word (an old file's `motif` only names its type). When kept it equals the id |
| `layout` | optional: `hide` (`cover control revisions toc questions`), `front`, `back` (`control revisions`, never also in `hide`; R2 prints them after the last chapter), `tocDepth` (`1` lists chapters only, `2` default), `page {size, orientation}` |
| `source` | optional: `samples/<folder>`; the content is read from `<source>/document.<ed>.json` (used by `srs` = `samples/blank`, one copy only) |
| `empty` | optional boolean (0.19.0): the starter prints nothing, one empty page (the Blank document). The content rules below are replaced by the **empty type** rules; see the section after `en.json / ar.json` |

## en.json / ar.json (content only)

A complete document JSON in the shape of `samples/blank/document.*.json`.

- Required: `control` with all ten keys (`documentId title preparedBy documentType classification owner issuedOn version status reviewCycle`),
  `revisions` (at least one row), `chapters`, `labels {kicker, subtitle}`, `openQuestions: []`. Optional: `composedAt`, `controlTable`, `chrome`, `layout`, `cover`, `approvals`.
- `cover` (0.19.0, spec §2, additive): the type's own page-1 content, per edition: `cols` (2, 3, 4 or 6), `fields` (at most 10 `{label, value, kind, id}`, kind `text|chip|date|blank`,
  at most one `id: true`), `figures` (at most 6 `{label, value, kind}`, kind `none|ok|warn|bad|idle`), `badge {label, value}`, `statement {text, items (at most 5), choices (at most 4)}`.
  The eight control fields of the title page (Document ID, Version, Status, Issue date, Owner, Prepared by, Approved by, Classification) come from `control` and are never copied into
  `cover`; `control.approvedBy` is optional (absent, its box prints empty). Every printed value edits in place (`/cover/fields/<i>/value`). The `spine` page prints `fields` under the control
  block (2 or 3 columns); R2 prints `figures`, `badge` and `statement` for the report, form and sheet families.
- `approvals` (0.19.0, C7): rows of up to 5 strings in the house columns (Role, Name, Organisation, Date, Signature); in a starter the name, date and signature stay empty. They print on the
  control page in HTML, PDF and Word, 12 mm tall.
- Tables may carry `style` (`sheet|signoff`), `numCols`, `nowrapCols` (column indexes), `accentCol` (an index); `colWidths` should sum to 100 (a warning). A `shots` block with `images: []`
  prints a screenshot frame (C12): `ratio` `16:10|4:3|9:16` (default 16:10) and `badge` 1 to 99 (default: its running number); an empty caption reads «Screenshot n» / «لقطة الشاشة n».
- Forbidden: `design`, `coverDesign`, `docType`, `service`, `motif` (all composed from type.json), signed `approvals` rows (a name, date or signature in a starter),
  any block kind outside `prose subhead table figure diagram stories gap shots`, embedded `data:` images, e-mail addresses, phone or id shapes,
  local paths, client names (hashed denylist `security/denylist.sha256`), the author's name.
- Chapter and section `number` are positional (`"1"`, `"1.1"`); they are regenerated on render.
- The AR/EN pair has the same shape: equal chapter and section counts, block kinds, table column and row counts and table `style`/`numCols`/`nowrapCols`/`accentCol`, diagram node and edge ids,
  stories and shots counts, `layout` (with `back` and `tocDepth`), and `cover` (field and figure counts and kinds, the `id` field's index, badge presence, statement item and choice counts).
- Size: at most 14 KB per edition once composed and minified; all types together (both editions plus art) at most 400 KB.
- Placeholders are `…` or `[Name]`; sign-off cells print empty with `{"text":"","keepEmpty":true}` or a table `blankCell:""`.

## An empty type (`empty: true`, 0.19.0)

The Blank document is one empty page in the theme: no cover, no control table, no revisions, no contents, no heading, no placeholder or sample text (owner rule, 2026-11-10).
The editor can only type into a leaf that exists, so the starter keeps ONE skeleton leaf and prints nothing else:

- `type.json`: `empty: true`; `layout.hide` holds `cover control revisions toc questions`; `placeholder` equals the name (the library name has no `: <title>` part).
- `en.json` / `ar.json`: `control.title` is the type's name (no colon); `revisions: []`; no `labels`; `chrome` is required: no header item and a footer of the page number only
  (without `chrome` the page would print the document id, the date and the confidentiality line); `chapters` is exactly one **bare** chapter (`"bare": true`, `title: ""`) with one section
  (`title: ""`) holding one `prose` block with one empty paragraph `[""]`. A `bare` chapter prints no heading (render.mjs `body`, one guarded line); the DOCX builder must skip its heading too.
- `node tools/doctypes/check.mjs` exempts an empty type from the title, revisions, labels and chapter-content rules and adds the rule that the starter prints nothing (messages name the rule, never the text).
  Every other rule (pair shape, forbidden keys, patterns, denylist, size) still applies. Tests: `node tests/run.mjs blank-empty-0190`.
- A `bare` chapter still counts in the positional numbering: a chapter added later prints its own position.

## _palettes.json

Seven colour roles per palette (`primary primary-deep primary-50 primary-100 accent accent-rule accent-bright`), the only roles the HTML, PDF and DOCX read.
Every value is **computed** from `palette/tokens.json` by `node tools/doctypes/check.mjs --write-palettes`; `"$from"` names the ramp step or mix. The
validator recomputes them and fails on a difference. Navy equals `design/ours/theme.json`; rust is the `diagram.rework-line` token `#853311` with derived
tints. Floors checked on every palette: white on primary, primary on paper, accent on paper, accent-bright on primary-deep, primary-deep on primary-50
at 4.5:1; accent-rule on paper at 3:1.

## _art/<id>.svg

Language-neutral thumbnail, a portrait page `viewBox="0 0 W H"` (H > W; the shipped art uses 240x320), at most 6 KB, no `<text>`, `<image>`, font, script, handler or external reference (only `#fragment`
hrefs and `url(#id)`), and `safeSvg()` must leave it unchanged. The start page mirrors it with CSS in right-to-left. The art is the type's identity on the start page only:
since 0.19.0 nothing of it prints in the document.

Layer contract (0.19.0 §5, S8; a **warning** in the pilot, an error for the 0.19.0 release): every direct child of the root `<svg>` is a `<g>` with exactly one class of
`bw-a-page` (exactly one, first), `bw-a-sheet`, `bw-a-head` (exactly one), `bw-a-row`, `bw-a-node`, `bw-a-arrow`, `bw-a-seal` (at most one), `bw-a-mark` (exactly one, last), in that order;
no `bw-a-*` group is nested in another. DOM order is the reveal order (the start page animates only these classes).

## API (engine/doctypes.mjs)

All take an optional last argument `{ root }` (a repo root; default this repo). No folder, or an empty one, is an empty registry.

| Function | Returns |
|---|---|
| `listTypes()` | the `type.json` objects, ordered by category, `order`, id |
| `loadType(id)` | `{ ...type.json, content: {ar, en}, art }` (`art` is `''` when there is no svg) |
| `compose(id, ed)` | the final document of `'ar'` or `'en'`: content + `service`, `docType`, `coverDesign`, `design.vars` (the palette), `layout` (type + content). 0.19.0: no `motif`. `FORMAT` and `BUILT_KEYS` do not change |
| `payload()` | contract C2: `{ v:1, categories:[{id,name,order}], types:[{id,code,category,order,name,description,placeholder,coverDesign,palette,accent,art,docs:{ar,en}}] }` (0.19.0: no `motif`); `docs` are composed, minified JSON strings; only categories that hold a type |
| `payloadJson()` | the payload as a string safe inside `<script type="application/json" id="bw-doctypes">` (`<` escaped) |
| `categories()`, `palettes()` | the shared files, parsed |
