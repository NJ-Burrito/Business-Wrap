---
description: Check for a Business-Wrap update, show what is new, or install it (only with --apply --yes after the user agreed).
argument-hint: [--check | --notes | --apply --yes]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" update $ARGUMENTS`

Say in one line what the updater answered; never pass --apply --yes without the user's consent. A plugin install is updated by Claude Code, not here: `/plugin marketplace update business-wrap`, then `/plugin update business-wrap`, then `/reload-plugins` (an MCP client without it must be restarted; until then the running server keeps the previous version folder and a stale "not connected" can stay cached for 15 minutes).
