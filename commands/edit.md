---
description: Change the document open in the live Business-Wrap editor from an instruction, as one undoable batch signed as the agent.
argument-hint: <instruction> [--doc id] [--locale ar|en] [--one-edition]
allowed-tools: mcp__plugin_business-wrap_business-wrap__editor_list_documents, mcp__plugin_business-wrap_business-wrap__editor_get, mcp__plugin_business-wrap_business-wrap__editor_outline, mcp__plugin_business-wrap_business-wrap__editor_ops
---

Instruction: $ARGUMENTS

Steps, in order:
1. Pick the document: use the id given; otherwise call `editor_list_documents` and use the only document, or when several are open list them and ask which.
2. Read it with `editor_outline`, then `editor_get` on only the pointers you need (the whole document only when the instruction is global). Never edit from memory or from a stale read.
3. Plan the change as edits-contract v1 ops (`bible/04-edits-contract.md`, `docs/automation.md`): op names `setText`, `replace`, `insert`, `delete`, `move`, `duplicate` only; RFC 6901 pointers copied from the outline; `value` where the contract needs it; never invent a field or a pointer. Put the current value in `old` on every `setText`, `replace` and `delete`, so a clash is a `CONFLICT` and nothing is applied. A rich text leaf keeps its marks through `setText`.
4. The Arabic and English editions are one unit. When the document has both, change both in step: pass `mirror: true` for structural edits (insert, delete, move, duplicate); for wording, write each edition's text in its own language in two batches (one per `locale`) with the same group label, and never leave one side stale. Use `--one-edition` only when the user says so.
5. Apply with ONE `editor_ops` call per edition: `locale` set, `agent: "Claude"` (with your model name), `group` a short label. Never several calls for one edit.
6. Report in at most 4 lines: what changed (pointers or titles), the edition(s), `applied` and the group, and that **Ctrl+Z undoes the whole batch** (one undo step). On `CONFLICT` show the live value and ask; on `BAD_OP` fix the op once from the error, never loop. `REFUSED` means the document is locked: say so.

Answer in the language the user wrote in (Arabic or English) and keep it short. If a tool answers `NO_TAB`, `NO_HOST`, `TAB_TIMEOUT` or the server is off, say in one line that no editor tab is connected and suggest `/business-wrap:open` (a hung tab: `host_health`); never guess a result. `NO_DOC` means the document is not in the editor library: suggest `/business-wrap:open <doc.json>`. Never start `engine/serve.mjs` yourself.
