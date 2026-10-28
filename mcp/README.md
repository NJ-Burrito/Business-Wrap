# Business-Wrap MCP server (EN) · pair: [README.ar.md](README.ar.md)

## ⚡ In 10 seconds

🔌 One command:

```bash
claude mcp add business-wrap -- npx -y -p business-wrap@latest business-wrap-mcp
```

✅ Needs Node 20+, uv, and Chrome or Edge for the PDF.

🔒 Local only: no network port, it reads and writes only the paths you give it.

🔤 Fonts work out of the box (bundled Thmanyah fallback); `BW_FONT_DIR` wins.

**Jump to:** [🧰 Tools](#-tools) · [▶️ Run](#️-run) · [🧪 Test](#-test)

## 🧰 Tools

A stdio MCP server over the Business-Wrap engine, with 12 tools. Outputs must end in the stated extension.

| Tool | Arguments | Does |
|---|---|---|
| `build_editor` | documents[], out .html, theme?, embed_fonts?, ui? | the single-file editor for one or more services (`*.ar.json` / `*.en.json` = the two editions) |
| `validate_edits` | edits | contract check (v1, older files migrated); returns the problems |
| `apply_edits` | document, edits, out .json | replays an edits file and writes the edited document |
| `export_document` | document, edits?, locale?, out_dir, theme?, docx? | PDF (headless Chrome, the editor markup) + DOCX |
| `export_design_pack` | out .json, theme? | the theme as a `bw-design-pack` the editor imports |
| `diagram_mermaid` | mermaid?, model_file?, locale? | Mermaid flowchart → diagram model in the house workflow style, or a diagram back to Mermaid |
| `harvest_model` | model, out_dir, name? | a BPMN / draw.io / step-list file → both document editions + the editor |
| `harvest_merge` | crawl, model, out_dir, name?, roles? | a crawl harvest and a process model joined into one document, both editions |
| `harvest_crawl` | config, out_dir | walk a live service (headed Chrome, OTP pause) → both editions + the editor |
| `check_fonts` | theme? | which faces resolve and whether any would print as Type 3 |
| `check_update` | force? | whether a newer release exists (at most one request a day) |
| `apply_update` | confirm | installs the newer release, keeping your settings and files; refuses without `confirm: true` |

## ▶️ Run

```bash
claude mcp add business-wrap -- npx -y -p business-wrap@latest business-wrap-mcp
# or, from a clone after npm ci:
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
