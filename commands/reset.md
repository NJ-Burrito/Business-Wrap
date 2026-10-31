---
description: Business-Wrap reset: list, and with the user's yes send to the Recycle Bin, the machine state (Edge profile, .system folders, local state; --all also whole workspaces and plugin data) so an old library cannot come back.
argument-hint: --dry-run | [--all] --yes
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" reset $ARGUMENTS`

Say in one line what the reset did. Without `--yes` (and without `--dry-run`) it refuses and changes nothing; use `--dry-run` to list what would go. Show the user the list in one short block and say what each kind is (workspace: documents and exports; workspace-state: history and library sync; edge-profile / state: the editor's browser profile and local settings). Only when the user agrees, run it with `--yes`: it stops the hosts first and sends every item to the Recycle Bin (never a hard delete, so it can be restored). Never pass `--yes` or `--all` on your own.
