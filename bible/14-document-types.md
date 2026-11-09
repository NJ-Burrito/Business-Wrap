# 14 · Document types: the document studio (EN) — pair: 14-document-types.ar.md

**Verdict:** Business-Wrap is no longer only an SRS generator. A **document type** is a finished starter document (a look plus bilingual content) kept in one folder, `templates/_doctypes/<id>/`. The editor's **start page** lists the 17 shipped types, picking one opens a new Arabic and English pair made from it, and every type exports PDF and DOCX through the same gates as an SRS. Adding a type is one folder, no code.

## What a person sees
| Where | What |
|---|---|
| Start page | The first screen when the editor opens without a document of its own: a gallery of the types, search (`/`), six category chips, a preview with the language segment, and recent documents. Create, a double click or Ctrl+Enter opens the type. |
| File tab, **Start page** (Ctrl+Alt+N) | Brings the gallery back at any time; the open document stays open behind it. File, **New** keeps the older blank-document tool. |
| `business-wrap types` | Lists the types (id, code, category, cover design, names, as JSON). |
| `business-wrap new --type <id> [--title "…"]` | Writes the Arabic and English pair of that type and opens the editor on it. An unknown id is refused and the command lists the valid ones. In Claude Code: `/business-wrap:new --type <id>`. |
| `GET /api/doctypes` (the local host) | The same list for the start page when the page was not built with the types inside it. |

## The 17 types (read from `templates/_doctypes/*/type.json`)
Colour comes from the category: requirements and start are navy, testing is forest, delivery is gold, governance is slate, training is rust. All colours are computed from the palette tokens, never typed.

| `id` | Code | Category | Palette | Cover | Page | Hidden parts |
|---|---|---|---|---|---|---|
| `blank` | DOC | Start | navy | title block on page 1 (`compact`) | portrait | revisions, toc |
| `srs` | SRS | Requirements | navy | full cover page (`spine`) | portrait | - |
| `brd` | BRD | Requirements | navy | full cover page (`spine`) | portrait | - |
| `frs` | FRS | Requirements | navy | full cover page (`spine`) | portrait | - |
| `rtm` | RTM | Requirements | navy | title block on page 1 (`compact`) | landscape | toc |
| `process-flow` | PF | Requirements | navy | full cover page (`spine`) | portrait | - |
| `test-plan` | TP | Testing | forest | full cover page (`spine`) | portrait | - |
| `test-cases` | TC | Testing | forest | title block on page 1 (`compact`) | landscape | toc |
| `defect-report` | DEF | Testing | forest | title block on page 1 (`compact`) | portrait | toc, revisions |
| `user-manual` | UM | Delivery | gold | full cover page (`spine`) | portrait | - |
| `uat-signoff` | UAT | Delivery | gold | full cover page (`spine`) | portrait | - |
| `release-notes` | RN | Delivery | gold | full cover page (`spine`) | portrait | - |
| `tor` | TOR | Governance | slate | full cover page (`spine`) | portrait | - |
| `change-request` | CR | Governance | slate | full cover page (`spine`) | portrait | - |
| `minutes` | MOM | Governance | slate | title block on page 1 (`compact`) | portrait | revisions, toc |
| `business-case` | BC | Governance | slate | full cover page (`spine`) | portrait | - |
| `tot` | TOT | Training | rust | full cover page (`spine`) | portrait | - |

Names, descriptions and the placeholder title are in each `type.json` as `{ar, en}`; the table of names for readers is in the [README](../README.md#-the-17-types).

## How a type is built
- `type.json`: id, code, category, order, names, description, palette, cover design, motif and an optional `layout` (hidden parts, page size and orientation).
- `en.json` and `ar.json`: a complete document JSON, content only. They must have the same shape: equal chapters and sections, block kinds, table sizes and diagram ids.
- `engine/doctypes.mjs` is the one place that writes `service`, `docType`, `coverDesign`, `motif`, the palette variables and `layout` into the final document (`compose`). Nothing else edits a type's look.
- Two cover designs: `spine` (a full cover page, the category colour and a motif for the type) and `compact` (no separate cover page; the title block sits on page 1). A document without `coverDesign` renders exactly as before 0.18.0.
- The folder contract, every key and its limits: `templates/_doctypes/README.md`. Validator: `node tools/doctypes/check.mjs`. Test: `node tests/run.mjs doctypes-0180`.

## What does not change
- **Export.** PDF and DOCX in both languages, fonts embedded as real text, the same gates (`03-gates.md`).
- **The editor.** Ribbon, diagrams, profile, watermark (editor only, never in an output), the tools that explain themselves, spelling, projects.
- **Evidence packs.** `templates/<id>/pack.json` (`09-template-packs.md`) is a different system: it builds a requirements document from evidence. A document type is a starter you fill in by hand or with an agent. The SRS type is the same SRS the packs build on.

## Rules for a new type
1. Content only in the starter: placeholders (`…` or `[Name]`), never a client's name, an e-mail, a phone number, an id, a local path or the author's name (`security/check.py` refuses them).
2. The pair is the unit: change the Arabic and the English together. Arabic text carries no visible diacritics.
3. Only the block kinds the renderers and the DOCX builder know: `prose subhead table figure diagram stories gap shots`.
4. Add the folder, an `_art/<id>.svg` thumbnail and an `order`; run the validator and the test above. No code change is needed.
