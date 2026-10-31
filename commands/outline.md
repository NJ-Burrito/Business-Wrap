---
description: Show the outline (chapters, sections, blocks, numbers) of the document open in the live Business-Wrap editor.
argument-hint: [doc-id] [ar|en]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_outline
---

Arguments: $ARGUMENTS

Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which. Then call `editor_outline` (locale from the arguments when they say ar or en, else the editor's own). Print a compact indented outline: chapter number and title, its sections, and block counts per kind; show a node's JSON pointer only when the user asks for pointers. End with one line: counts of chapters, sections and blocks.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
