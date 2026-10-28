# Guide: install, quickstart, troubleshooting, backup, hand-over (EN) · pair: guide.ar.md

## ⚡ In 10 seconds

✅ Install Node 20+, uv and Chrome or Edge. No pip installs: uv brings the Python packages.

🚀 `npm ci`, then `npm run sample`, then `npm run serve`.

🔤 Fonts work out of the box (bundled Thmanyah fallback); your own copy wins.

💾 Keep three files per document: the document JSON, `edits.json`, `theme.json`.

**Jump to:** [1. Requirements](#1-requirements-tested-versions-2026-10-27) · [2. Quickstart](#2-quickstart-windows-step-by-step) · [3. Troubleshooting](#3-troubleshooting) · [4. Backup](#4-backup-and-restore-edits-and-drafts) · [5. Hand-over](#5-handing-a-document-to-a-colleague)

## 1. Requirements (tested versions, 2026-10-27)
| Tool | Version tested | Why |
|---|---|---|
| Windows | 11 | primary platform; macOS/Linux untested |
| Node.js | 24.x | editor engine, renderer, Playwright print |
| Python | 3.12 (3.11+ needed for `tomllib`) | gates, design build, DOCX builder |
| uv | 0.12 | Python packages (`uv pip install`, `uvx`), never pip |
| Google Chrome | 155+ (131+ for CSS page-margin boxes) | the PDF printer |
| poppler (`pdftotext`) | 25.x | judging Arabic text in PDFs; on Windows an older xpdf `pdftotext` may come first on PATH, so pass `-enc UTF-8` |
| git | 2.4x+ | history scan in the security gate |
| gitleaks (optional) | 8.28+ | second engine for the same rules |

## 2. Quickstart (Windows, step by step)
1. Clone the repo: `git clone https://github.com/NJ-Burrito/Business-Wrap` then `cd Business-Wrap`.
2. Install Node packages: `npm install`.
3. Fonts: follow `fonts/README.md` (set `BW_FONT_DIR`, convert each Serif family to TrueType into `<family>/ttf/` under that root).
4. Turn on UTF-8 for Python in this terminal: `$env:PYTHONUTF8 = "1"` (PowerShell).
5. Install the local security hook: `git config core.hooksPath .githooks`.
6. Check the design: `python design/build.py` → prints contrast results and writes `design/ours/theme.json`.
7. Open the sample in the editor (see `editor/README.md`), switch AR ⇄ EN with the direction toggle, make an edit, save: `edits.json` appears beside the document.
8. Export PDF + DOCX from the editor or the CLI in `engine/`; read every gate line it prints.
9. Before any push: `python security/check.py` must end with `0 finding(s)`.

## 3. Troubleshooting
| Symptom | Cause | Fix |
|---|---|---|
| Fonts look right in the editor, wrong in the PDF | the font loaded from `file://` was refused by Chrome on a `setContent` page | inline fonts as base64 and wait for `document.fonts.ready` before printing |
| PDF fonts show as "Type 3", no font names, audit blind | CFF outlines (`.otf`/`.woff2`) printed by Chrome's Skia | print from TrueType (`fonts/README.md`) |
| A fallback face (Segoe UI, Arial) appears for a few symbols | the face lacks those characters (☐, ←) | map them to characters the face has before printing; font-coverage gate reads the printed PDF |
| Arabic letters disconnected | `letter-spacing` on Arabic, or a forced word break | remove letter-spacing; no `word-break`/`overflow-wrap: anywhere` on Arabic |
| Copied Arabic text splits words ("المدير ية") | pair kerning opened gaps | `font-kerning: none` |
| `(SRS)` prints as `)SRS(`, list commas reorder | bidi-neutral punctuation around isolated runs | wrap the whole Latin phrase in one `<bdi>` |
| `pdftotext` returns no Arabic | xpdf `pdftotext` without `-enc UTF-8`, or pymupdf/pdfium | use poppler with `-enc UTF-8`; never trust two tools agreeing |
| Python crashes printing Arabic | Windows cp1252 console | `PYTHONUTF8=1` |
| Security gate fails on a line you wrote on purpose (documentation example) | the line matches a rule | add `bw-allow:<rule-id>` on that line, or rewrite it |
| Security gate fails on `history:` | the hit is in an old commit | unpushed: amend/rebase that commit; pushed: rotate the secret, then rewrite history with the owner's approval |

## 4. Backup and restore (edits and drafts)
- What to keep: the document JSON (`03-document.<locale>.json`), its `edits.json`, and `theme.json` if customised. Together they reproduce every output.
- Backup: copy the three files into a dated folder (`backup/2026-10-27/`) or a private repo; the edits file is small text, safe to version.
- Restore: open the document JSON in the editor and load the edits file; the editor checks `baseHash` and refuses a mismatched base.
- Browser drafts: an unsaved editor session may keep a draft in browser storage; it can vanish (private window, cleared data). Save to `edits.json` before closing.
- Never back up into a public location; the outputs may carry client content.

## 5. Handing a document to a colleague
1. Export the outputs (PDF, DOCX).
2. Send the hand-over set: document JSON + `edits.json` + `theme.json` (+ logos they are allowed to use). Fonts are NOT sent: the colleague installs a licensed copy (`fonts/README.md`).
3. The colleague opens the document JSON, loads the edits file, and continues; their edits append to the same file.
4. Agree who edits next: one writer at a time per edits file; merge by replaying one file after the other, resolving any `setText` conflict shown by the editor.
