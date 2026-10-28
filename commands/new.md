---
description: Start a new blank Business-Wrap document pair (Arabic + English) and open it in the editor.
argument-hint: ["Title"] [--out dir] [--no-open]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" new $ARGUMENTS`

Say in one line where the new documents are and whether the editor opened.
