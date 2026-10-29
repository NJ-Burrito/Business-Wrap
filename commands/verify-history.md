---
description: Verify a Business-Wrap document's tamper-evident history (hash chain and signatures).
argument-hint: <file>
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" verify-history $ARGUMENTS`

Say in one line whether the history verifies; a FAIL is never healed.
