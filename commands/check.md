---
description: Run the live editor's Check panel on the open document and summarise the problems (structure, stale fields, number gaps).
argument-hint: [doc-id]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_action
---

Arguments: $ARGUMENTS

Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which. Then call `editor_action` with `id: "check"`; it answers `{id, findings:[{level, message, path}]}`. Group the findings by level (errors first), show at most 10 lines with their path, and say the total. Name the likely fix for the common ones (editions differ in structure, a field needs update in the other edition) and offer `/business-wrap:edit` for them. The answer also carries `spelling {enabled, ar, en, total}` (misspelt words by language; `enabled:false` means the spelling switch is off in the editor, say so and do not report zero errors) and `diagramWarnings [{path, minPtPrinted, minPt, small, overlaps}]` (diagrams whose lettering would print too small or overlap). Report both in one line each after the findings: spelling errors Arabic/English, and the number of diagrams with warnings with the path of each (at most 5). Nothing at all (no findings, no spelling errors, no diagram warnings): say the document is clean.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
