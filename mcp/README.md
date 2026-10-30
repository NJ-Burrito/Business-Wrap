# Business-Wrap MCP server (EN) · pair: [README.ar.md](README.ar.md)

## ⚡ In 10 seconds

🔌 One command (0.14.0 from the GitHub tag; npm still serves 0.12.0; or the Claude Code plugin, or a clone below):

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.14.0 business-wrap-mcp
```

✅ Needs Node 20+, uv, and Chrome or Edge for the PDF.

🔒 Local only: no network port, it reads and writes only the paths you give it.

🔤 Fonts work out of the box (bundled Thmanyah fallback); `BW_FONT_DIR` wins.

**Jump to:** [🧰 Tools](#-tools) · [▶️ Run](#️-run) · [🧪 Test](#-test)

## 🧰 Tools

A stdio MCP server over the Business-Wrap engine, with 15 tools (plus the local-learning tools). Outputs must end in the stated extension.

| Tool | Arguments | Does |
|---|---|---|
| `build_editor` | documents[], out .html, theme?, embed_fonts?, ui? | the single-file editor for one or more services (`*.ar.json` / `*.en.json` = the two editions) |
| `validate_edits` | edits | contract check (v1, older files migrated); returns the problems |
| `apply_edits` | document, edits, out .json | replays an edits file and writes the edited document |
| `export_document` | document, edits?, locale?, out_dir, theme?, docx? | PDF (headless Chrome, the editor markup) + DOCX |
| `export_design_pack` | out .json, theme? | the theme as a `bw-design-pack` the editor imports |
| `diagram_mermaid` | mermaid?, model_file?, locale? | Mermaid flowchart → diagram model in the house workflow style, or a diagram back to Mermaid |
| `harvest_model` | model, out_dir, name?, roles?, open? | a BPMN / draw.io / step-list file → both document editions + the editor; `open: true` also opens it in the editor |
| `harvest_merge` | crawl, model, out_dir, name?, roles? | a crawl harvest and a process model joined into one document, both editions |
| `harvest_crawl` | config, out_dir, open? | walk a live service (headed Chrome, OTP pause, never submits) → both editions + the editor |
| `harvest_sources` | sources[], out_dir, name?, roles?, open? | your own files or folders: BPMN, draw.io, YAML/JSON steps, PDF, DOCX, HTML, TXT, MD → documents; unreadable files listed as skipped |
| `open_in_editor` | documents[]? \| editor? \| doc_id? | starts the local host if needed and opens an Edge tab on the editor; returns `{url, doc_id}` |
| `close_editor` | (none) | stops every host and Edge window this install started |
| `check_fonts` | theme? | which faces resolve and whether any would print as Type 3 |
| `check_update` | force? | whether a newer release exists (at most one request a day) |
| `apply_update` | confirm | installs the newer release, keeping your settings and files; refuses without `confirm: true` |

## ▶️ Run

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.14.0 business-wrap-mcp
# or, from a clone (no npm ci needed: the MCP SDK is bundled in mcp/vendor/sdk.mjs):
node mcp/cli.mjs
```

<details>
<summary>⚙️ Settings</summary>

From the environment or the gitignored `.local/config.json`:

- `BW_FONT_DIR`: your own TrueType cuts
- `BW_CHROME`: the Chrome or Edge to print with
- `BW_POPPLER`: the poppler folder (`pdftotext`, `pdffonts`) the tests read PDFs with

</details>

## 🧪 Test

`npm run test:mcp` starts the server with the official client, lists the tools and calls each one on the sample service.
