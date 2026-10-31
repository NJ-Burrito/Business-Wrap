---
description: List the documents open in the live Business-Wrap editor, with the host health (tabs, version).
argument-hint: [project]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__host_health
---

Call `host_health` first (it does not start a host), then `editor_list_documents` (with the project filter $ARGUMENTS when given). Show a short table: id, title, editions, words, saved at; then one line on the host (version, number of tabs, any hung tab with lastBeatMs above 15000).

If there are no documents or no tab: say the editor is not open and how to open one: `/business-wrap:open [doc.json]` or `/business-wrap:new "Title"`.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. Never start `engine/serve.mjs` yourself.
