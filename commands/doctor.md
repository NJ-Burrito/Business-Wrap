---
description: Business-Wrap doctor: what is installed, where its state lives, the last MCP server starts, and whether a plugin update left the server on the previous version.
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" doctor $ARGUMENTS`

Say in one line what the doctor found; if problems is not empty, say what each one says (after a plugin update: /reload-plugins).
