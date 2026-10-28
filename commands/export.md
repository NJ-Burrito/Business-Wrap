---
description: Export a Business-Wrap document to PDF and DOCX, then run the render and export gates.
argument-hint: <doc.json> [ar|en] [--out dir] [--no-docx]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" export $ARGUMENTS`

Say in one line where the PDF and DOCX are and the gate verdicts.
