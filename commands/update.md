---
description: Check for a Business-Wrap update, show what is new, or install it (only with --apply --yes after the user agreed).
argument-hint: [--check | --notes | --apply --yes]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" update $ARGUMENTS`

Say in one line what the updater answered; never pass --apply --yes without the user's consent.
