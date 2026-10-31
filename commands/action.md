---
description: Run a named action on the open Business-Wrap document through the live editor (check, renumber, saveHtml, exportPdf, share, zoom, theme, reading, find, save, outline, page turns).
argument-hint: <check|renumber|saveHtml|exportPdf|share|zoomPct|zoomHeight|zoomWidth|zoomIn|zoomOut|zoomReset|theme|reading|find|save|outline|nextPage|prevPage> [--doc id] [--to who --note text] [--value 100] [--mode dark|light]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_action
---

Action: $ARGUMENTS

1. Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which.
2. The valid names are exactly: `renumber`, `check`, `saveHtml`, `share`, `exportPdf`, and the safe view actions `zoomPct` (args `{value}` 25 to 400), `zoomHeight` (Fill height), `zoomWidth` (fit width), `zoomIn`, `zoomOut`, `zoomReset` (100 % = true A4 size), `theme` (args `{mode: "dark"|"light"}`, none = toggle), `reading` (args `{on}`), `find`, `save`, `outline`, `nextPage`, `prevPage`. A destructive request (delete, close, stop the server, clear) is `REFUSED`: say it is locked and must be done in the editor itself. Any other name is `UNKNOWN_ACTION`: list the valid names. Do not call the tool for a name outside the list; when no name is given, just list them.
3. Call `editor_action` with `id`; for `share` pass `args: {to, note}` (recipient may be empty). `renumber` changes the document (one undo step: Ctrl+Z); `exportPdf` and `share` leave the editor, so run them only when the user named them; the view actions change nothing in the document.
4. Report in one line: the action and its result (`findings` count for check, `opsAdded` for renumber, `path` for share, `zoomPct` for the zoom actions).

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
