---
description: Draft a diagram from a description, render it to a PNG with the document engine, then insert it into the open Business-Wrap document.
argument-hint: <description> [--doc id] [--locale ar|en]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_outline, mcp__plugin_business-wrap_business-wrap__editor_get, mcp__plugin_business-wrap_business-wrap__render_diagram, mcp__plugin_business-wrap_business-wrap__editor_ops
---

Description: $ARGUMENTS

1. Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which. Find where a diagram fits with `editor_outline`, and copy the shape of an existing diagram block with `editor_get` when the document has one (never invent block fields; see `bible/04-edits-contract.md` and `docs/automation.md`).
2. Draft the diagram model in the words of the edition (Arabic labels for `ar`, English for `en`), short labels, at most about 9 nodes. Render it with `render_diagram` (`model`, `out` a .png under the OS temp folder, `locale`); read the answer: if `legible` is false or there are overlaps, simplify once and render again, then report what remains.
3. Insert it with ONE `editor_ops` batch (`insert` of the diagram block at the chosen pointer, `locale`, `agent: "Claude"`; do the other edition in its own batch with its own labels when the document is bilingual). Say which pointer, the legibility result, and that Ctrl+Z undoes the insert.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
