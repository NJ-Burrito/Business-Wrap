# Business-Wrap MCP server (EN) · pair: [README.ar.md](README.ar.md)

## ⚡ In 10 seconds

🔌 One command (0.15.4 from the GitHub tag; npm still serves 0.12.0; or the Claude Code plugin, or a clone below):

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.15.4 business-wrap-mcp
```

✅ Needs Node 20+, uv, and Chrome or Edge for the PDF.

🔒 Local only: no network port, it reads and writes only the paths you give it.

🔤 Fonts work out of the box (bundled Thmanyah fallback); `BW_FONT_DIR` wins.

**Jump to:** [🧰 Tools](#-tools) · [▶️ Run](#️-run) · [🧪 Test](#-test)

## 🧰 Tools

A stdio MCP server over the Business-Wrap engine, with 23 tools (plus the local-learning tools). Outputs must end in the stated extension.

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
| `editor_list_documents` | project? | the documents in the editor library of the running host (starts the host if none runs) |
| `editor_outline` | doc, locale? | chapters, sections, block kinds and ids with the JSON pointer of each, from the live editor |
| `editor_get` | doc, pointer?, locale? | the value at a pointer of the document as the editor holds it now (unsaved edits included) |
| `editor_ops` | doc, ops[], locale, mirror?, agent?, group? | applies a batch of edit ops to the document OPEN in the editor as one undo step, saved and signed as the agent; a wrong `old` returns `CONFLICT` and applies nothing |
| `editor_action` | doc, id, args? | renumber, check, saveHtml, share {to, note}, exportPdf on a document in the editor |
| `editor_new` | title, project?, template? | a new blank document in the editor library |
| `editor_import` | document? | file?, project? | puts a document into the editor library (and a project) |
| `host_health` | (none) | the host, its tabs and any hung tab (`lastBeatMs` above 15000) |
| `check_fonts` | theme? | which faces resolve and whether any would print as Type 3 |
| `check_update` | force? | whether a newer release exists (at most one request a day) |
| `apply_update` | confirm | installs the newer release in a clone or npx install, keeping your settings and files; refuses without `confirm: true`. In a Claude Code plugin it changes nothing and returns `{plugin: true, how}` (the client updates the plugin) |

The `editor_*` tools act on the document the user has open, through the local host, so the user watches the edit happen. Errors carry a `code`: `NO_HOST`, `NO_DOC`, `TAB_TIMEOUT`, `CONFLICT`, `BAD_OP`, `UNKNOWN_ACTION`, `RESTART_REQUIRED`. The same verbs run from a terminal as `business-wrap editor <verb>`. Contract: [docs/automation.md](../docs/automation.md).

## 🔄 After a plugin update

🔁 Claude Code keeps a running MCP server on the version folder it started from. After `/plugin update business-wrap` run `/reload-plugins` (an MCP client without it: restart the client). Until then every tool answers `RESTART_REQUIRED` with the version it loaded and the version installed, instead of running half-old code.

⏳ A server that failed to start once can stay "not connected" for up to 15 minutes (Claude Code caches the failure); `/reload-plugins` or editing the plugin config retries at once.

🩺 `business-wrap doctor` (or `/business-wrap:doctor`) prints the version on disk, where state lives, the last server starts with their time to `initialize`, and any drift. The log is `mcp.log` in the state folder.

💾 In a Claude Code plugin the state (host.json, the Edge profile, workspace.json, settings) lives in the plugin data folder, which survives updates; the first start after an update copies it over from the previous version folder.

## ▶️ Run

```bash
claude mcp add business-wrap -- npx -y -p github:NJ-Burrito/Business-Wrap#v0.15.4 business-wrap-mcp
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
