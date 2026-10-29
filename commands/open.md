---
description: Open the Business-Wrap editor: start the local host in the background (no window) and an Edge window (a blank document when no file is given).
argument-hint: [doc.json | folder | editor.html] [--port 4317]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" open $ARGUMENTS`

Say in one line which document opened and at which address, from the output above. The host already runs in the background with no window: never start `engine/serve.mjs` yourself, in a terminal, with `start powershell` or with `Start-Process`.
