# Decision log (EN) — pair: decisions.ar.md

Newest first. Each ruling: date · who · decision · why · where it is enforced.

| Date | Who | Decision | Why | Enforced by |
|---|---|---|---|---|
| 2026-10-27 | owner | This build was done by Opus-tier workers for this task only (governance override) | breadth of the first release | process note, not a code rule |
| 2026-10-27 | owner | Cover every aspect, including ones not named (hygiene, CI, docs, backup, packaging) | a release a colleague can run without help | this repo's docs and CI |
| 2026-10-27 | owner | Fully bilingual: every prose file ships as an AR + EN pair treated as one unit; Arabic is RTL, no tashkeel in visible text | Arabic and English readers are both first-class | paired files; edition-parity gate |
| 2026-10-27 | owner | The tool watermark appears only in the editor UI, never in any output; document logo slots stay empty for the user | outputs belong to the user's organisation | watermark-absent gate; `logos/README.md` |
| 2026-10-27 | owner | Zero client content: no organisation names, logos, service names, hosts, credentials, ID numbers, emails, phones or harvested data | the repo is a neutral product | `security/check.py` (tree, history, commit messages; hashed denylist) |
| 2026-10-27 | owner | Fonts only from the owner's local Thmanyah folder; the repo ships a manifest, never binaries | licence forbids redistribution and hosting | `.gitignore`; font-binary rule (extension + magic bytes) |
| 2026-10-27 | owner | Workflow: an interactive HTML replica of PDF+DOCX for small human edits, instead of regenerating on every change | fast, cheap, reviewable edits | edits contract; replay on export |
| inherited | owner | Thmanyah Serif Text for body/tables, Serif Display for headings/cover; Sans not used in documents; Cairo banned | house face; Cairo has poor copy fidelity | design build refuses banned fonts |
| inherited | owner | Convert to TrueType for printing; keep conversions local | Chrome prints CFF as Type 3, blinding the font audit | `fonts/README.md`; font-coverage gate |
| inherited | owner | DOCX ships with embedded fonts (the most restrictive embed DOCX offers) | the reader sees the real face without installing it | DOCX check |
| inherited | owner | The DOCX is built from the document JSON, never converted from HTML/PDF | converters do not carry CSS | DOCX builder |
| inherited | owner | Promote a fix to the pipeline only by consolidation (devil review, ≥ 4 of 5 vote, exact proof) | one-off rulings promoted set-wide were later contradicted | `bible/05-lessons.md` L14 |
