# The Business-Wrap bible (EN) — pair: README.ar.md

**Verdict:** Business-Wrap turns observed evidence about a service into a governed requirements document, shows it as an interactive HTML replica of the PDF and DOCX, lets a person make small edits there, and exports PDF, DOCX, the edits file and a theme pack. Every rule has a gate behind it.

## Read in this order
| # | File | Answers |
|---|---|---|
| 1 | `01-pipeline.md` | What runs, in what order, and what each stage writes |
| 2 | `02-document-standard.md` | What a document must contain and how it is laid out, in Arabic and English |
| 3 | `03-gates.md` | Every gate, what it proves, and the defect that made it necessary |
| 4 | `04-edits-contract.md` | The edits JSON the editor writes and the exporter replays |
| 5 | `05-lessons.md` | Lessons from the source pipeline, generalised |
| 6 | `06-design-system.md` | Design packs, tokens to outputs, contrast, print geometry |
| 7 | `07-updates.md` | Update check, notice to people and agents, applying an update, migrations |
| — | `contracts/edits.schema.json`, `contracts/wrappers.schema.json`, `contracts/design-pack.schema.json` | Machine contracts |

## House rules (non-negotiable)
1. **Zero client content in this repo.** No organisation names, logos, service names, hostnames, credentials, ID numbers, emails, phone numbers or harvested data. `security/check.py` enforces it on the tree and the whole history.
2. **Bilingual.** Every document is produced in an Arabic edition (RTL) and an English edition (LTR) from one document JSON; the pair is the unit, so a fix to one side updates the other. Arabic visible text never carries tashkeel.
3. **Fonts:** Thmanyah only (Serif Text for text, Serif Display for headings and cover). Cairo is banned, also as a fallback. Binaries are never committed (`fonts/README.md`).
4. **Logos:** document logo slots ship empty for the user. The tool's own watermark appears only in the editor interface and never in any output (PDF, DOCX, print, edits JSON, theme pack, Save-HTML export).
5. **Evidence, not memory.** Each section has one named source; a missing source prints a stated gap or an open question, never an invented value.
6. **Edit through the contract.** Human edits go into the edits JSON and are replayed on the document JSON; the document JSON is never hand-edited.
