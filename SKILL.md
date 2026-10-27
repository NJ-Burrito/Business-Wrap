---
name: business-wrap
description: Use when a requirements or specification document (SRS, service card, business requirements, workflow, user stories and acceptance criteria) must be produced, rebuilt, edited or exported as an Arabic and/or English PDF and DOCX from evidence; when someone wants to make small edits in an HTML replica instead of regenerating; when a design pack, palette, typography tokens, logo slot or font setup is changed; when a document's fonts, RTL text, pagination, colours or Type 3 glyphs look wrong; or before publishing the repo (security gate). Arabic triggers - وثيقة متطلبات، مواصفات الخدمة، بطاقة الخدمة، قصص المستخدمين، معايير القبول، مخطط سير العمل، تعديل الوثيقة، تصدير PDF أو DOCX، حزمة التصميم، لوحة الألوان، الخطوط، فحص الأمان.
---

# Business-Wrap

Turns observed evidence into a governed, bilingual (AR RTL / EN LTR) requirements document; a person edits an HTML replica of the PDF+DOCX; export writes PDF, DOCX, the edits file and a theme pack. Every rule has a gate.

## When NOT to use
- A free-form letter, slide deck or marketing page (no evidence chain, no gates).
- Editing a delivered PDF/DOCX by hand: edit through the editor so the change survives the next rebuild.

## Read next (progressive disclosure)
| Need | Read |
|---|---|
| What runs, in what order | `bible/01-pipeline.md` (AR: `.ar.md`) |
| What a document must contain, AR/EN rules, pagination | `bible/02-document-standard.md` |
| Which gate proves what | `bible/03-gates.md` |
| The editor's edits JSON | `bible/04-edits-contract.md`, `bible/contracts/edits.schema.json` |
| A symptom you have seen before | `bible/05-lessons.md` |
| Colours, sizes, page geometry, custom design | `bible/06-design-system.md`, `design/README.md` |
| Fonts setup, Type 3 | `fonts/README.md` |
| Install, quickstart, troubleshooting | `docs/guide.md` |

## Quick reference
| Task | Command |
|---|---|
| Palette contrast gate + swatches | `python palette/check.py` |
| Build a theme from a design pack | `python design/build.py [design/custom/<name>/pack.json]` |
| Security gate (tree + history) | `python security/check.py` |
| Build the editor for documents (`*.ar.json` / `*.en.json`) | `node engine/build-editor.mjs <doc.json or folder> --out out/x.editor.html` |
| Editor with one-click PDF + DOCX and page thumbnails | `node engine/serve.mjs out/x.editor.html` → http://127.0.0.1:4317/ |
| Export without the UI (edits replayed) | `node engine/export.mjs --doc <document.json> --edits <edits.json> --locale ar\|en` |
| Sample, editor check, accessibility check | `npm run sample` · `npm test` |
| The same actions as MCP tools (build_editor, apply_edits, export_document, …) | `node mcp/cli.mjs` — see `mcp/README.md` |

Always `PYTHONUTF8=1` on Windows; Python packages through `uv`.

## Rules that cost a rebuild if skipped
1. Evidence, not memory: one named source per section; a missing source prints a stated gap, never an invented value.
2. Union merges, never select-one; one fact computed once before anything reads it.
3. Edits go through `edits.json`; never hand-edit the document JSON.
4. AR and EN editions are one unit: a structural change made in one is made in the other.
5. Thmanyah fonts only (Cairo banned), printed from TrueType; binaries never committed.
6. Logo slots ship empty; the tool watermark stays in the editor UI and never reaches an output.
7. Zero client content in the repo; run `security/check.py` before every commit and push.
8. Judge Arabic PDF text with poppler `pdftotext -enc UTF-8`; an empty read is a tool suspicion.

## Common mistakes
| Mistake | Fix |
|---|---|
| Re-rendering the stage after the one you changed | re-run from the stage that owns the fact (`bible/01-pipeline.md`) |
| A colour or pt typed into a template | add or use a token; rebuild the theme |
| "All fixes applied" | prove per item from the printed PDF: "N of M applied" |
| Fonts look right in the editor, wrong in the PDF | the PDF used CFF → Type 3, or a `file://` font was refused; see `docs/guide.md` § Troubleshooting |
