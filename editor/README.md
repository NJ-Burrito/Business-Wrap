# Business-Wrap editor — README section

For the repo README (Agent A merges this section).

## What it is

A local, single-file HTML editor that **is** the print layout: the page you edit is
the markup and stylesheet the PDF is printed from (`engine/render.mjs`). Small
human edits are made there, recorded as an edits file
(`bible/contracts/edits.schema.json` v1), and exported to PDF + DOCX.

## Run it

```
npm install                      # playwright-core only (drives the local Chrome)
npm run sample                   # builds out/sample/event-permit.editor.html
npm run serve                    # http://127.0.0.1:4317/ — one-click PDF + DOCX
npm test                         # the editor check (both editions)
```

Build an editor for your own documents (one or more services, `*.ar.json` / `*.en.json`):

```
node engine/build-editor.mjs <doc.json | folder>... --out out/my.editor.html [--theme pack.json] [--embed-fonts] [--ui ar|en]
node engine/export.mjs --doc <document.json> [--edits edits.json] [--locale ar|en] [--out dir]
```

The editor opens straight from disk (file://). Opened from disk, "PDF + DOCX"
downloads the edited document JSON and shows the `export.mjs` command; opened
through `npm run serve`, it exports in one click.

## Machine settings (never committed)

`.local/config.json` (gitignored) or environment variables — env wins:

| key | env | what |
|---|---|---|
| `fontDir` | `BW_FONT_DIR` | folder holding the Thmanyah cuts (searched recursively) |
| `watermarkDir` | `BW_WATERMARK_DIR` | the tool's own watermark images (svg/png), UI only |
| `chrome` | `BW_CHROME` | Chrome or Edge executable |
| `poppler` | `BW_POPPLER` | poppler `bin` folder, for the test's pdftotext/pdffonts |

Fonts: TrueType (`.ttf`) is preferred over `.woff2`/`.otf` because Chrome's PDF
backend writes CFF outlines as Type 3 glyph procedures. Font files are never
copied into the repo; the per-user Windows font folder is searched as a fallback.

## Browser support

Chrome and Edge, latest stable (Chromium 120+). The editor relies on
`contenteditable="plaintext-only"`, Shadow DOM, `:has()`, CSS logical
properties, `@page` named pages. Firefox and
Safari are not supported (no `plaintext-only` contenteditable in Firefox; the
print path is Chromium's).

## Files

| path | role |
|---|---|
| `engine/render.mjs` | document JSON → print HTML (browser + Node) |
| `engine/edits.mjs` | edits contract: apply, migrate, validate, merge, find/replace fold, diff |
| `engine/build-editor.mjs` | assembles the single-file editor (CSP with the app script's hash) |
| `engine/export.mjs`, `engine/pdf_post.py` | PDF (headless Chrome + folios) and DOCX |
| `engine/docx/` | DOCX builder (python-docx), labels from `engine/i18n.json` |
| `engine/serve.mjs` | 127.0.0.1-only server for one-click export |
| `engine/i18n.json` | every UI string (ar/en) and every printed label (ar/en) |
| `editor/` | the editor app, its light-DOM and Shadow-DOM styles |
| `samples/event-permit/` | the anonymised sample service, AR + EN |
| `tests/` | `editor.test.mjs` (VERIFIER), `fidelity.mjs` + `pdf_compare.py` |
