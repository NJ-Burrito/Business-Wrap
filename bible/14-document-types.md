# 14 · Document types: the document studio (EN) — pair: 14-document-types.ar.md

**Verdict:** Business-Wrap is no longer only an SRS generator. A **document type** is a finished starter document (a first page built for its purpose plus bilingual content) kept in one folder, `templates/_doctypes/<id>/`. The editor's **start page** lists the 17 shipped types; clicking one opens a side panel that explains it, and Create opens a new Arabic and English pair made from it. Every type exports PDF and DOCX through the same gates as an SRS. Page 1 of an opened document never carries the start-page drawing. Adding a type is one folder, no code.

## What a person sees
| Where | What |
|---|---|
| Start page | The first screen when the editor opens without a document of its own: a gallery of the types, search (`/`), six category chips, the recent documents, and **the local host switch** in its top bar. The switch is the same control and the same state as the editor's top bar (`editor/ext/51-start-host.*` mounts the one control from `18-server.js`): a dot, «Online :4317» or «Offline», and a switch. Turning the host off saves the documents first and stops only the host. |
| Side panel (0.19.0) | Clicking a type opens a panel on the inline-end edge (right in English, left in Arabic): a thumbnail of the type with a short move, its name and description, the document language, **Create**, then what it is for, when to use it, its sections (the starter's chapter titles in the chosen language) and who uses it. Esc or the close button closes it; Tab stays inside it. A double click or Ctrl+Enter still creates at once. The text comes from `templates/_doctypes/_info.json` (`purpose`, `whenToUse`, `audience`, each `{ar, en}`), carried in the payload as `info`. |
| The thumbnail's move | One grammar for every type: only the art's layer groups move (transform and opacity, once, each done by 700 ms, nothing loops). A type differs only in which layers its art has. The **Calm** button turns all motion off and the panel shows the end frame as a still image. |
| File tab, **Start page** (Ctrl+Alt+N) | Brings the gallery back at any time; the open document stays open behind it. File, **New** keeps the older blank-document tool. |
| `business-wrap types` | Lists the types (id, code, category, cover design, names, as JSON). |
| `business-wrap new --type <id> [--title "…"]` | Writes the Arabic and English pair of that type and opens the editor on it. An unknown id is refused and the command lists the valid ones. In Claude Code: `/business-wrap:new --type <id>`. |
| `GET /api/doctypes` (the local host) | The same list for the start page when the page was not built with the types inside it. |

## The first page: four families and the blank page
Each type prints one of these page-1 families (`TYPE_FAMILY` and `familyOf` in `engine/doctypes.mjs`; `type.json` `coverDesign` names it). The same pages come out in the editor, in PDF and in Word.

| Family | Page 1 | Front and back matter | Types |
|---|---|---|---|
| `spine` (title page) | Start-edge spine in the category colour, type code and kicker, title and subtitle, then the **control block** (a 2-column grid of the eight control fields: document ID, version, status, issue date, owner organisation, prepared by, approved by, classification) and a second grid of the type's own fields (`cover.fields`). | Page 2: revision history and the approvals grid. Page 3: contents (chapters only, `tocDepth: 1`). Chapter 1 starts on a new page. | srs, brd, frs, process-flow, test-plan, user-manual, tor, tot |
| `report` (decision paper) | A band with code, kicker and the white title; four key-figure tiles (`cover.figures`); a decision box (`cover.statement`, with empty choices); the control block (ID, version, status, date, owner, prepared by) and the sponsor field. | As `spine`. | business-case |
| `form` | A header at the top of page 1: code chip, kicker, title, an **ID box** (the field with `id: true`) or a **badge** (`cover.badge`), a field grid (`cols` 3 or 4), the meta line; the body continues on the same page. | No contents list. Document control and revisions print at the back (`layout.back`). | defect-report, change-request, minutes, uat-signoff, release-notes |
| `sheet` | A landscape header: fields in one row (`cols` 6), a strip of status tiles (`cover.figures`; counted from the first table when absent), then the table itself. | No contents list. Later pages repeat a running header (chip, title, two fields) and the table's header row. Control and revisions at the back. | rtm, test-cases |
| `compact` | **Blank only:** one empty page, nothing printed (see "The empty type"). | none | blank |

**Page 1 carries no art (owner rule, 2026-11-10).** Page 1 is drawn only with straight horizontal and vertical lines, rectangles and text: no curves, no diagonals, no images, except a logo the user adds (code chips and badges have square corners). The start-page drawing (`_art`) is for choosing a type and never prints. `compose` writes no `motif`; an old file that still has one prints no art. `tests/page1-0190.test.mjs` holds this per type and edition on the HTML, the PDF (no image, no curve, no diagonal on page 1) and the DOCX (no picture in section 1 except one named `logo-*`), and it carries two mutants that must fail so the detector is shown to bite.

## The 17 types (read from `templates/_doctypes/*/type.json`)
Colour comes from the category: requirements and start are navy, testing is forest, delivery is gold, governance is slate, training is rust. All colours are computed from the palette tokens, never typed.

| `id` | Code | Category | Palette | Family | Page | Contents list | Built on (practice) |
|---|---|---|---|---|---|---|---|
| `blank` | DOC | Start | navy | empty `compact` | portrait | none | none |
| `srs` | SRS | Requirements | navy | `spine` | portrait | chapters | ISO/IEC/IEEE 29148 outline, plus the house e-service sections |
| `brd` | BRD | Requirements | navy | `spine` | portrait | chapters | BABOK Guide v3 (IIBA): need, objectives, requirement classes, stakeholders |
| `frs` | FRS | Requirements | navy | `spine` | portrait | chapters | BABOK v3 solution requirements; requirement attributes as in ISO/IEC/IEEE 29148 |
| `rtm` | RTM | Requirements | navy | `sheet` | landscape | none | BABOK v3 trace requirements; two-way traceability |
| `process-flow` | PF | Requirements | navy | `spine` | portrait | chapters | BPMN 2.0 notation (OMG; ISO/IEC 19510), SIPOC |
| `test-plan` | TP | Testing | forest | `spine` | portrait | chapters | ISO/IEC/IEEE 29119-3 test plan |
| `test-cases` | TC | Testing | forest | `sheet` | landscape | none | ISO/IEC/IEEE 29119-3 test case specification and execution log |
| `defect-report` | DEF | Testing | forest | `form` | portrait | none | ISO/IEC/IEEE 29119-3 incident report |
| `user-manual` | UM | Delivery | gold | `spine` | portrait | chapters | task-based user documentation (ISO/IEC/IEEE 26514 as secondary practice) |
| `uat-signoff` | UAT | Delivery | gold | `form` | portrait | none | ISO/IEC/IEEE 29119-3 test completion report, as an acceptance certificate |
| `release-notes` | RN | Delivery | gold | `form` | portrait | none | Keep a Changelog categories; ITIL 4 release management |
| `tor` | TOR | Governance | slate | `spine` | portrait | chapters | consultancy terms-of-reference practice (multilateral agencies) |
| `change-request` | CR | Governance | slate | `form` | portrait | none | ITIL 4 change enablement; PRINCE2 request for change |
| `minutes` | MOM | Governance | slate | `form` | portrait | none | standard minutes practice, with an action log |
| `business-case` | BC | Governance | slate | `report` | portrait | chapters | BABOK v3 business case; PRINCE2 business case |
| `tot` | TOT | Training | rust | `spine` | portrait | chapters | ADDIE instructional design; Kirkpatrick's four levels |

The "Built on" column names the practice each outline follows. The starters are written in Business-Wrap's own words: no standard's text is reproduced, no clause number is printed in a document, and the outlines were taken from the published content lists, not checked against the full standards. Read it as "follows the shape of", never as a claim of compliance or certification.

Names, descriptions and the placeholder title are in each `type.json` as `{ar, en}`; the table of names for readers is in the [README](../README.md#-the-17-types), with what page 1 shows for each type.

## How a type is built
- `type.json`: id, code, category, order, names, description, palette, `coverDesign` (`spine`, `compact`, `report`, `form` or `sheet`) and an optional `layout`: `hide` (`cover control revisions toc questions`), `back` (`control revisions`, never also in `hide`), `tocDepth` (`1` lists chapters only, `2` is the default) and `page {size, orientation}`. `motif` is ignored since 0.19.0. `empty: true` marks the Blank document.
- `en.json` and `ar.json`: a complete document JSON, content only. They must have the same shape: equal chapters and sections, block kinds, table sizes and table keys, diagram ids, and the same `cover` and `layout` shapes. Keys added in 0.19.0, all additive (the file format version is unchanged):
  - `cover`: the type's own page-1 content: `cols` (2, 3, 4 or 6), `fields` (at most 10 `{label, value, kind, id}`; kind `text`, `chip`, `date` or `blank`; at most one `id: true`), `figures` (at most 6 `{label, value, kind}`; kind `none`, `ok`, `warn`, `bad` or `idle`), `badge {label, value}` and `statement {text, items, choices}`. The eight control fields stay in `control`; they are never copied into `cover`. Every printed value edits in place.
  - `approvals`: rows of up to five strings (Role, Name, Organisation, Date, Signature); a starter leaves name, date and signature empty. They print on the control page in HTML, PDF and Word.
  - `layout.back` and `layout.tocDepth`: see above; the content's `layout` is merged with the type's.
  - table keys: `style` (`sheet`: washed header repeated on every page, zebra rows; `signoff`: tall rows, empty cells kept, no zebra), `numCols` (end-aligned figures), `nowrapCols`, `accentCol`. A `shots` block with `images: []` prints a screenshot frame with a caption and a numbered badge.
  - status words fill their cell only in a column headed Status, Result, Severity, Priority, Type, Impact or Decision (and the Arabic equivalents).
- `engine/doctypes.mjs` is the one place that writes `service`, `docType`, `coverDesign`, the palette variables and `layout` into the final document (`compose`). Nothing else edits a type's look. A document without `coverDesign` renders exactly as before 0.18.0.
- `templates/_doctypes/_art/<id>.svg`: the start-page drawing, one per type, hand-drawn. It shows one element of the type's identity, never its page 1. **The layer contract:** every direct child of the root `<svg>` is a `<g>` with exactly one class, in this order: `bw-a-page` (exactly one, first), `bw-a-sheet`, `bw-a-head` (exactly one), `bw-a-row`, `bw-a-node`, `bw-a-arrow`, `bw-a-seal` (at most one) and `bw-a-mark` (exactly one, last); no layer sits inside another. DOM order is the order the panel reveals them in. The files stay at 6 KB or less, with no `<text>`, `<image>`, script or external reference.
- The folder contract, every key and its limits: `templates/_doctypes/README.md`. Validator: `node tools/doctypes/check.mjs` (it checks the layer contract and the pair rules). Tests: `node tests/run.mjs doctypes-0180`, `page1-0190`, `start-panel-0190`, `blank-empty-0190`.

## The empty type (Blank)
The Blank document is one empty page in the theme: no cover, no control table, no revisions, no contents, no heading and no sample text. The editor can only type into a leaf that exists, so the starter keeps one bare chapter (`"bare": true`, no title) holding one empty paragraph, and the footer carries only the page number. The Word file is one empty page too. On the start page its panel lists its sections as «One empty page».

## What does not change
- **Export.** PDF and DOCX in both languages, fonts embedded as real text, the same gates (`03-gates.md`).
- **The editor.** Ribbon, diagrams, profile, watermark (editor only, never in an output), the tools that explain themselves, spelling, projects.
- **Evidence packs.** `templates/<id>/pack.json` (`09-template-packs.md`) is a different system: it builds a requirements document from evidence. A document type is a starter you fill in by hand or with an agent.

## Rules for a new type
1. Content only in the starter: placeholders (`…` or `[Name]`), never a client's name, an e-mail, a phone number, an id, a local path or the author's name (`security/check.py` refuses them). Never print a standard's name or clause number inside the document.
2. The pair is the unit: change the Arabic and the English together. Arabic text carries no visible diacritics.
3. Only the block kinds the renderers and the DOCX builder know: `prose subhead table figure diagram stories gap shots`.
4. Choose the page-1 family for the document's purpose and fill `cover`; never add a drawing to page 1.
5. Add the folder, a hand-drawn `_art/<id>.svg` that follows the layer contract, the type's entry in `_info.json` and an `order`; run the validator and the tests above. No code change is needed.
