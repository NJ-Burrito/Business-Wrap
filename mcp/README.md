# Business-Wrap MCP server (EN) — pair: README.ar.md

A stdio MCP server over the Business-Wrap engine. Local only: it reads and writes the paths you give it and opens no network port. Outputs must end in the stated extension.

| Tool | Arguments | Does |
|---|---|---|
| `build_editor` | documents[], out .html, theme?, embed_fonts?, ui? | the single-file editor for one or more services (`*.ar.json` / `*.en.json` = the two editions) |
| `validate_edits` | edits | contract check (v1, older files migrated); returns the problems |
| `apply_edits` | document, edits, out .json | replays an edits file and writes the edited document |
| `export_document` | document, edits?, locale?, out_dir, theme?, docx? | PDF (headless Chrome, the editor markup) + DOCX |
| `export_design_pack` | out .json, theme? | the theme as a `bw-design-pack` the editor imports |
| `check_fonts` | theme? | which faces resolve and whether any would print as Type 3 |

## Run
```
claude mcp add business-wrap -- npx -y -p business-wrap@0.5.0 business-wrap-mcp
# or, from a clone after npm ci:
node mcp/cli.mjs
```
Settings come from the environment or the gitignored `.local/config.json`: `BW_FONT_DIR` (TrueType cuts), `BW_CHROME`, `BW_POPPLER`.

## Test
`npm run test:mcp` starts the server with the official client, lists the tools and calls each one on the sample service.
