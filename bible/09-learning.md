# 09 — Local learning (EN) — pair: 09-learning.ar.md

**Verdict:** Business-Wrap quietly records how the person corrects what it generated, groups repeated corrections into lessons, and turns well-evidenced lessons into rules that the AI agent reads before its next harvest or draft. Everything stays in `.local/learning/` on this machine.

## What is captured
| Event | When | What it holds |
|---|---|---|
| `edit` | every editor change: text, labels, control fields, design, diagram ops, placement (overlays), structure | service, document type, edition, path, field kind, section, before → after, origin (`harvested`, `generated`, `manual`, `learned`), the note on that place if any |
| `note` | a comment the person writes | path, the note |
| `export` | PDF + DOCX, Save HTML, edits JSON, print | format, and the edits that existed at that moment (the accepted state) |
| `revert` | undo | the ops it undid; their edits stop counting (a redo counts them again) |

Every string is redacted before it is written (tokens, passwords, long digit runs such as national numbers), long values are cut, and only the documented fields are kept.

## Where it lives
- Server running (`node engine/serve.mjs`): the editor posts to `/api/learning/events` → `.local/learning/journal.jsonl` (rotated at 4 MB, three old parts kept).
- `file://` with no server: the events wait in this browser's IndexedDB; the panel exports them, and `npm run learn -- import` takes them in.
- Never in the document JSON, Save HTML, the PDF, the DOCX, the design pack or a webhook payload; nothing is sent over the network. `.local/learning/` is gitignored, `security/check.py` fails on a tracked journal (`bw-learning-journal`), and `update --apply` keeps it.

## From events to rules (deterministic, no model call)
`npm run learn` or the MCP tool `learning_distill` groups the journal:

| Lesson | Evidence needed |
|---|---|
| `wording` — the same word-level substitution | ≥ 2 hits |
| `field` — the same field kind set to the same value | ≥ 2 services |
| `delete` — a generated item (a section by title, a block kind) the person always deletes | ≥ 2 hits |
| `design` — the same design override | ≥ 2 services |
| `diagram` — the same diagram node kind always removed (for example system steps) | ≥ 2 hits |

Each lesson carries its pattern, the evidence event ids, its hit count, scope (`global`, `type:<document type>`, or `service:<id>` when only one service shows it), confidence, and status: `candidate`, `promoted` or `retired`.

**Promotion:** automatic at ≥ 3 hits with no kill criterion; by hand with `npm run learn -- promote <id>` or `learning_promote`. **Kill criteria:** a `REVERSAL` (A→B and later B→A, including the person undoing a learned change) or a `CONFLICT` (A→B and A→C). Conflicts are listed side by side (`npm run learn -- conflicts`, `learning_conflicts`) and never resolved automatically: a promoted rule stays promoted until the person retires it. A retired lesson is never promoted again by distillation.

Promoted lessons are written to `.local/learning/rules.md` (Arabic and English) and `rules.json`.

## How agents use it
1. Before harvesting, authoring or generating: read the rules (`learning_rules` or `.local/learning/rules.md`) and apply them.
2. After the person's edits and after an export: run `learning_distill`.
3. Tell the person in one line which learned rules were applied.

The engine itself applies the safe kinds to a **new** harvest only: wording substitutions on the text, design defaults the document does not already set, and diagram conventions. Hand-edited places are left alone and existing documents are never changed. Each change is listed in `doc.learned`; the editor marks it «مطبّق من التعلّم» / "Applied from learning" on hover, and Alt+click undoes it (which the journal records as a reversal).

## Control
No toolbar button. Ctrl+K → «التعلّم المحلي» / "Local learning": on/off (default on), counts, view rules, export/import (to move to another machine), «امسح كل ما تعلّمته» with a confirmation. A Settings page mounts the same section with `window.BW_LEARNING.mount(element)`. CLI: `npm run learn -- status | rules | conflicts | promote <id> | retire <id> | on | off | export <f> | import <f> | forget --yes`.
