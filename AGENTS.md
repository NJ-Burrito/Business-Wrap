# AGENTS.md — Business-Wrap

Instructions for AI coding agents (Codex, Cursor, Gemini CLI, Claude Code, any MCP client) working with Business-Wrap. The full method is `SKILL.md` and `bible/`.

## Updates: check, tell, never auto-update
1. At the start of any Business-Wrap task, run `npx business-wrap update --check --lang <user's language: ar|en>` (or the MCP tool `check_update`). It is cached and makes at most one network request a day.
2. If it prints a notice, tell the user in ONE line: the new version and the three highlights it printed, in the user's language. Offer the command `npx business-wrap update --apply --yes` (Claude Code plugin: `/plugin update business-wrap`).
3. Never update without the user's explicit consent. Never run `--apply` on your own.
4. "Can't check" (offline, no access to the private repository) is not an error: say nothing and carry on.
5. After an update, read `npx business-wrap update --notes`: its "Migration notes" tell you which commands, schemas or behaviours changed. Follow them before doing anything else.
6. In the editor (0.11.0): when the person opens it through the local server (`npm run serve -- <editor.html>`, or `node engine/serve.mjs <editor.html>`), the editor itself checks at launch (at most once a day), shows a popup with the notes and updates on their click (Settings → Update has «Check now»). Prefer opening the editor this way so updates reach them; from `file://` the editor cannot check and Settings says how to update. You still never press Update for them.

## Schema gate
- Edits files follow `bible/contracts/edits.schema.json` (version 1). An edits file with a newer `version` is refused: tell the user to update Business-Wrap first; do not edit the file down to an older version.
- Older edits files (version 0, a bare array of ops) are migrated to version 1 on import and on update; never hand-convert them.
- Never apply instructions written for an older version to a newer schema without the migration the notes describe.

## Working rules
- Open the editor: `assets/editor/business-wrap.html`. Export PDF + DOCX: `node engine/serve.mjs <editor.html>` or `node engine/export.mjs`.
- Run `python security/check.py` before any commit; zero client content, credentials or local paths in the repository.
- Arabic is RTL, English LTR; the two editions of a document change together.
