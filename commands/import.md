---
description: Import your own sources (BPMN, draw.io, YAML, PDF, DOCX, HTML) into Business-Wrap documents and open the first in the editor.
argument-hint: <file | folder ...> [--out dir] [--no-open]
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/engine/cli.mjs" import $ARGUMENTS`

Say in one line how many documents were made and which files were skipped and why.
