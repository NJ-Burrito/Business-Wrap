# 13 — Projects and bulk edit (EN) — pair: 13-projects.ar.md

**Verdict:** library documents are grouped by project («Project A · 23»), several projects at once, one project per document; a bulk edit changes a field, a section or any text on a whole project or on documents picked by hand, matched by anchor, both editions in step, previewed first, applied as one logged and undoable change per document, never touching a document that was not picked.

## Projects (H1, 0.13.1) — `editor/ext/13-projects.js`, `engine/routes/projects.mjs`
| Rule | Gate |
|---|---|
| A project has an id `pj-…` and a name (unique among live projects, at most 120 characters). Create, rename, delete: a deleted project goes to «مشاريع محذوفة» (restore, or delete for good); its documents are never deleted, they show in «بلا مشروع» until it is restored | `tests/projects.test.mjs` |
| A document sits in one project or in none (`of[docId] = pjId`); moved by the row's «انقل إلى مشروع» select or `EXT.projects.assign(doc, pj)` | same |
| «المستندات» groups the rows by project, each a collapsible group titled «name · count»; an empty project still shows, «بلا مشروع» only when it holds some; the project filter shows one group; the title search still works inside the groups | same |
| «مستند جديد» and «استيراد» pressed while the filter shows a project put the new document in it (`newIn`, `importInto` for scripts) | same |
| State: `localStorage bw:projects` and, served, `<save folder>\HISTORY\projects.json`; the newer `savedAt` wins both ways, so a reload, a resumed host and a fresh browser see the same groups. The route refuses a malformed state (bad id, empty name, a document in an unknown project) | same |
| No change to `10-library.js`: the drawer is decorated in place by a MutationObserver (as 31-provenance does for the Changes tab) | — |

## Bulk edit «تعديل جماعي» — `engine/bulk.mjs`, `editor/ext/15-bulk.js`
| Rule | Gate |
|---|---|
| Target: tick a project (all its documents) and/or single documents, across projects. Only the ticked documents are ever opened or changed | `tests/bulk.test.mjs` |
| Operations: add / delete / edit a field (a table row: label = first cell, value = second), add / delete a section, edit a section heading, replace a text (in one section or the whole document). Each AR and EN value is given separately (one side empty = the other is used) | same |
| Anchors, never positions: a section or chapter by number (`2.1`) or heading in either language, a field by its label; matching folds case, tashkeel, tatweel, hamza forms and spaces | same |
| The pair moves together: the editions that find the anchor must agree on the place, and every edition must hold the same kind of thing there (number, block kinds, table size). Otherwise «تعارض» and nothing changes, so a drifted edition is never edited at the wrong item | same |
| Preview first: per document «سيتغير / كما هو / غير موجود / تعارض / مقفل», counts on top; Apply stays off until a preview of exactly the current form and picks | same |
| Apply: per document one commit group (primary edition `g`, the other `g.m`), so one undo takes both editions; its own provenance entries (bible/11) and a «تعديل جماعي» timeline mark; its library entry saved; then back to the document that was on screen; a summary toast | same |
| A locked document (32-lock) is skipped and listed; it is never unlocked for the run | same |
| Undo per document from the results table (`EXT.bulk.undo(id)`), only while the bulk change is still that document's newest; otherwise its Changes drawer | same |
| `engine/bulk.mjs` is one file for Node and the editor (concatenated by `engine/build-editor.mjs` like `ledger-v1.mjs`): no imports | `tests/bulk.test.mjs` (Node part) |
