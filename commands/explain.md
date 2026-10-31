---
description: Explain a Business-Wrap editor tool or feature from the docs, in your language, and where to find it on the ribbon.
argument-hint: <tool or feature, e.g. renumber, Check panel, themes>
allowed-tools: Read, Grep, Glob
---

Question: $ARGUMENTS

Search the docs under `${CLAUDE_PLUGIN_ROOT}`: `docs/guide.md` and `docs/guide.ar.md`, `docs/automation.md`, `README.md`, `README.ar.md`, `bible/`, and the editor's own labels in `editor/ux-i18n.json` (the ribbon and menu names in both languages). Answer in the language the user wrote in, in at most 6 lines: what it does, where it is (ribbon tab and button name as the editor shows it, or Ctrl+K and the command name), its shortcut when the docs give one, and one caution if the docs state one. Use only what the files say: when nothing matches, say so and suggest the Ctrl+K command search. No editor connection is needed.
