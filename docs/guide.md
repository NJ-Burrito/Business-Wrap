# Guide: install, quickstart, troubleshooting, backup, hand-over (EN) · pair: guide.ar.md

## ⚡ In 10 seconds

✅ Install Node 20+, uv and Chrome or Edge. No pip installs: uv brings the Python packages.

🚀 `npm ci`, then `npm run serve`, then open the address it prints. Always use the editor through that server.

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
2. Install Node packages: `npm ci`.
3. ▶️ Start the editor: in the Business-Wrap folder run `npm run serve`, then open the address it prints (http://127.0.0.1:4317/) in Chrome or Edge. The first time it builds the sample. Use the editor through this server, not by double-clicking the HTML file: export, print, the printers list and updates need the server.
4. Fonts (optional): the bundled Thmanyah fallback works out of the box. To use your own copy, follow `fonts/README.md`.
5. Turn on UTF-8 for Python in this terminal: `$env:PYTHONUTF8 = "1"` (PowerShell).
6. Install the local security hook: `git config core.hooksPath .githooks`.
7. Check the design: `python design/build.py` → prints contrast results and writes `design/ours/theme.json`.
8. In the editor, switch AR ⇄ EN with the direction toggle, make an edit, save: `edits.json` appears beside the document.
9. Export PDF + DOCX from the editor or the CLI in `engine/`; read every gate line it prints.
10. Before any push: `python security/check.py` must end with `0 finding(s)`.

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
2. Send the hand-over set: document JSON + `edits.json` + `theme.json` (+ logos they are allowed to use). Fonts are NOT sent: the colleague's Business-Wrap uses its bundled Thmanyah fallback or their own licensed copy ([fonts/README.md](../fonts/README.md)).
3. The colleague opens the document JSON, loads the edits file, and continues; their edits append to the same file.
4. Agree who edits next: one writer at a time per edits file; merge by replaying one file after the other, resolving any `setText` conflict shown by the editor.

## 6. Where your files go / أين تُحفظ ملفاتك

```
Business-Wrap\
  اقرأني - README.txt                 what each folder is, in Arabic and English
  المستندات - Documents\
    <Document title>\                 one folder per document (the Arabic title, else the English one)
      <Document title>.html           the editable file: Save HTML overwrites it
      Exports\                        <YYYY-MM-DD HH-MM> <Document title> - العربية.pdf | - English.pdf | .docx | - both.pdf
      Sources\                        what a harvest or an import collected for this document
      Versions\                       the previous saves (kept, never deleted)
    _غير مصنف - Unsorted\             old files whose document could not be told
  .system\                            hidden: history\ (the work log), backups\, sessions\, library\, cache\
```

- Open it from Settings with «Open folder / افتح المجلد»; every export and Save toast shows the real path.
- Old folder (0.13.0-0.13.2: `PDF`, `DOCX`, `HTML`, `HISTORY`, uuid history names)? It is moved in on the first start of 0.13.3. See the plan first with `business-wrap tidy --dry-run`; apply by hand with `business-wrap tidy`. Nothing is deleted; the log is `.system\migration-0.13.3.json`.
- Do not move or edit `.system`: it holds the tamper-evident history (`history\<Document title> (<id8>).bwlog`, found by `index.json`).


## 7. The local server and the `business-wrap:` link

### Start and stop the servers from Settings

Settings has a **Local server** card with two buttons.

- **Start server** (only on a page opened from disk, `file://`). A page opened from disk cannot start a program. The button first asks the local ports 4317 to 4327 whether a Business-Wrap server already answers. If one does, it offers **Open from the server** and starts nothing. If none does, it asks your installed Business-Wrap to open this file, through the `business-wrap:` link (see below), and offers **Open from the server** as soon as the server answers.
- **Stop all Business-Wrap servers** (on a page opened from disk and on a served page). A dialog says how many servers and browser windows will close and that your open documents are saved first, as with the power button. On a served page the editor saves, then the server closes every Business-Wrap host, stray server and browser window the host opened, and itself last. On a page opened from disk the button sends `business-wrap://stop`. It never ends a program that is not a Business-Wrap server or a browser window Business-Wrap opened.

On a served page the Start button is hidden and the card says "The server is running on port N".

#### The `business-wrap:` link

The page uses a per-user URL protocol, registered for your account only (no administrator rights): on Windows under `HKCU\Software\Classes\business-wrap`, on Linux as `~/.local/share/applications/business-wrap-handler.desktop`. `business-wrap open` registers it when it is missing. Manage it yourself with:

```
business-wrap protocol register
business-wrap protocol status
business-wrap protocol unregister
```

The registered handler runs `node <install>/update/cli.mjs handle "<url>"` and accepts only two links: `business-wrap://open?file=<absolute path of a Business-Wrap .html file>` and `business-wrap://stop`. Anything else is refused. The file must exist, end in `.html`, sit inside your home folder, the temp folder, this install, the save folder or the install's drive, and contain the editor's `bw-data` block. The browser may ask once whether to allow opening Business-Wrap.

If the Start button does nothing, register the handler once with `business-wrap protocol register` and press it again.
