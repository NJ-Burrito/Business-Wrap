---
description: Proofread the text of the open Business-Wrap document (Arabic hamza and taa marbuta, Latin punctuation, English typos, AR/EN mismatch); apply with --apply.
argument-hint: [ar|en|both] [--doc id] [--apply]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_get, mcp__plugin_business-wrap_business-wrap__editor_ops
---

Arguments: $ARGUMENTS (default `both`; without `--apply` nothing is changed).

1. Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which.
2. Read the chosen edition(s) with `editor_get` (whole document, per locale).
3. Check the Arabic for: hamza forms (أ إ آ ؤ ئ), taa marbuta against haa, alef maqsura against yaa, Persian letters (ک ی), tatweel, Latin punctuation (, ; ?) inside Arabic, mixed digit systems, doubled spaces. Check the English for typos, doubled words, wrong case, spacing. For both: compare the editions field by field and list the pairs that differ in meaning, numbers or dates, or where one side is missing.
4. Propose fixes as a numbered list: pointer, old, new, one-word reason. Fix only what is certainly wrong; list doubtful items as questions, not edits. Never touch names, codes, numbers or quoted text.
5. Only with `--apply`: send the certain fixes in ONE `editor_ops` batch per edition (`setText` with `value` and `old`, `locale`, `agent: "Claude"`, `group: "proofread"`); a pair mismatch needs the user's decision and is never auto-applied. Report the count and that Ctrl+Z undoes each batch.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
