---
description: Harvest a live website (never submits a request) or a process model or document into a Business-Wrap document and open it in the editor.
argument-hint: <url | crawl.json | model.bpmn | file.pdf/.docx/.html | folder> [--out dir] [--no-open]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" harvest $ARGUMENTS`

Say in one line which documents were written, the gate verdicts (PASS / HEALED / FAIL) and the editor address.
