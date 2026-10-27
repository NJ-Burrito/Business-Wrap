# Business-Wrap (EN) — pair: README.ar.md

**Governed, bilingual requirements documents: evidence in, an editable HTML replica of the PDF and DOCX in the middle, PDF + DOCX + edits + theme out. Every rule has a gate.**

| Start here | |
|---|---|
| What it is and the rules | `bible/README.md` |
| Install and first run (Windows) | `docs/guide.md` |
| The skill entry point (for Claude) | `SKILL.md` |
| Architecture diagram | `docs/architecture.md` |
| Decisions, roadmap, privacy | `docs/decisions.md`, `docs/roadmap.md`, `docs/privacy.md` |
| Glossary AR/EN | `docs/glossary.md` |
| Research behind the choices | `docs/research/README.md` |

## Folders
| Folder | Holds |
|---|---|
| `bible/` | the method, AR + EN, and the machine contracts |
| `engine/`, `editor/`, `samples/`, `tests/` | the HTML editor engine, renderer, sample document, tests |
| `palette/`, `typography/` | DTCG design tokens + gates |
| `design/` | design packs (`ours/`, `custom/` upload slot) and `build.py` |
| `fonts/` | font manifest only (licence: no binaries) |
| `logos/` | empty: your logos go here, gitignored |
| `security/` | the gate that keeps client content and secrets out of the repo |

## Three commands
```powershell
$env:PYTHONUTF8 = "1"
python design/build.py        # palette contrast gate + theme
python security/check.py      # tree + history + commit messages
git config core.hooksPath .githooks
```

## The editor
A local, single-file HTML editor that **is** the print layout: the page you edit is the markup and stylesheet the PDF is printed from (`engine/render.mjs`). Edits are recorded as an edits file (`bible/contracts/edits.schema.json` v1) and exported to PDF + DOCX.

```powershell
npm install        # playwright-core only (drives the local Chrome)
npm run sample     # builds out/sample/event-permit.editor.html
npm run serve      # http://127.0.0.1:4317/ - one-click PDF + DOCX
npm test           # the editor check, both editions
node engine/build-editor.mjs <doc.json | folder>... --out out/my.editor.html [--theme design/ours/theme.json] [--embed-fonts] [--ui ar|en]
node engine/export.mjs --doc <document.json> [--edits edits.json] [--locale ar|en] [--out dir]
```
Opened from disk (file://), "PDF + DOCX" downloads the edited document JSON and shows the `export.mjs` command; through `npm run serve` it exports in one click.

### Machine settings (never committed)
`.local/config.json` (gitignored) or environment variables; env wins.

| key | env | what |
|---|---|---|
| `fontDir` | `BW_FONT_DIR` | font root: `<family>/otf`, `woff2`, and the local `ttf/` the manifest searches first |
| `watermarkDir` | `BW_WATERMARK_DIR` | the tool's watermark images (svg/png), editor UI only |
| `chrome` | `BW_CHROME` | Chrome or Edge executable |
| `poppler` | `BW_POPPLER` | poppler `bin` folder (pdftotext / pdffonts in the tests) |

Browser support: Chrome and Edge, latest stable (Chromium 120+); Firefox and Safari are not supported (no `plaintext-only` contenteditable in Firefox; the print path is Chromium's).

| path | role |
|---|---|
| `engine/render.mjs` | document JSON → print HTML (browser + Node) |
| `engine/edits.mjs` | edits contract: apply, migrate, validate, merge, find/replace folding, diff |
| `engine/build-editor.mjs` | assembles the single-file editor (CSP with the app script's hash) |
| `engine/export.mjs`, `engine/pdf_post.py` | PDF (headless Chrome + folios) and DOCX |
| `engine/docx/` | DOCX builder (python-docx), labels from `engine/i18n.json` |
| `engine/serve.mjs` | 127.0.0.1-only server for one-click export |
| `engine/i18n.json` | every UI string and printed label, ar + en |
| `editor/` | the editor app and its styles |
| `samples/event-permit/` | the anonymised sample service, AR + EN |
| `tests/` | `editor.test.mjs` (verifier), `fidelity.mjs` + `pdf_compare.py` |

Private and proprietary: see `LICENSE`. Nothing is uploaded: see `docs/privacy.md`.
