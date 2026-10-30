---
description: Business-Wrap status: version, running hosts, how many steps were healed, and any MCP problem (a plugin update that needs /reload-plugins).
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" status $ARGUMENTS`

Say in one line what is running, from the output above. If mcp.problems is not empty, say what it says (after a plugin update the user runs /reload-plugins).
