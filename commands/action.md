---
description: Run a named action on the open Business-Wrap document through the live editor (check, renumber, saveHtml, exportPdf, share).
argument-hint: <check|renumber|saveHtml|exportPdf|share> [--doc id] [--to who --note text]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_action
---

Action: $ARGUMENTS

1. Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which.
2. The tool's allow-list is exactly: `renumber`, `check`, `saveHtml`, `share`, `exportPdf`. Any other name (zoom, theme, view, find...) is `UNKNOWN_ACTION` through this tool: say so, list the five, and tell the user the others are done in the editor itself (Ctrl+K, then the command name). Do not call the tool for a name outside the list; when no name is given, just list the five.
3. Call `editor_action` with `id`; for `share` pass `args: {to, note}` (recipient may be empty). `renumber` changes the document (one undo step: Ctrl+Z); `exportPdf` and `share` leave the editor, so run them only when the user named them.
4. Report in one line: the action and its result (`findings` count for check, `opsAdded` for renumber, `path` for share).

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
