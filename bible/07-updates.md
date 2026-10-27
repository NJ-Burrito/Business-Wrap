# 07 · Updates for people and their agents (EN) — pair: 07-updates.ar.md

**Verdict:** one release feed (GitHub releases of the private repo), one cached check (at most one request a day), one line to the user, and nothing installed without consent. The same principle as QA Wrap's updater, reaching the person in the editor and terminal and the agent through SKILL.md, AGENTS.md, MCP and an optional hook.

## The feed
| Piece | What |
|---|---|
| `update/source.json` | the repo the check reads |
| `update/core.mjs` | `parseVersion`, `isNewer` (numeric), `pickRelease` (no drafts, no pre-releases), `isReleaseZipUrl` (this repo's release downloads only), `checkLatest` (ETag, rate-limit backoff), `parseNotes`, `extractNotes` |
| `update/check.mjs` | token (env `BW_UPDATE_TOKEN`, `.local/update-token`, or `gh auth token`), the once-a-day cache in `.local/update-state.json`, settings in `.local/update.json` (`check`, `hook`), the one-liner (AR/EN) |
| `.github/workflows/release.yml` | a tag `vX.Y.Z` → version gate → notes cut from CHANGELOG → `business-wrap-X.Y.Z.zip` + `.sha256` → release |
| `update/version-sync.mjs` | CI gate: package, plugin, marketplace, MCP registry, Smithery, READMEs and CHANGELOG say the same version |

Private repo: without a token the check answers "can't check" quietly. A token is read, sent as a Bearer header, never printed, never stored by the tool.

## Who sees what
| Audience | Channel | Behaviour |
|---|---|---|
| Person, editor | `editor/update.js` (one module, one mount point in `engine/build-editor.mjs`) | "What's new" once after an update (from the embedded CHANGELOG section); "Update available" card only when served by `engine/serve.mjs` (`GET /api/update`), with Update / Later / Turn off; animated, honours reduced motion; never printed or saved into Save-HTML |
| Person, terminal | `npx business-wrap update --check` | one line + three highlights; `--apply --yes`; `--notes`; `--off` / `--on` |
| Agent with the skill | SKILL.md "First: check for an update" | check at task start, one line to the user, offer the command, never auto-update |
| Codex, Cursor, Gemini CLI | `AGENTS.md` | the same instruction |
| Any MCP client | MCP server | `update_available` in the initialize instructions and on the first tool result of a session; `check_update`; `apply_update` refuses without `confirm: true` |
| Claude Code plugin | `/plugin update` + `hooks/hooks.json` | the marketplace version is the channel; the SessionStart hook prints one line only after `--enable-hook` (off by default) and uses the daily cache |

## Applying an update
- Git checkout: refuses on local changes to tracked files, then fetches and fast-forwards; user files are gitignored.
- Zip install: downloads the release zip (token for the private repo), verifies SHA-256 (GitHub digest or the `.sha256` asset), keeps ONE backup `<folder>.backup-<old>`, swaps product files, rolls back on failure.
- Never touched: `.local`, `design/custom`, `logos`, `fonts/custom`, `drafts`, `out`, `.git`, `node_modules`.
- Then user data is migrated by the NEW engine (`*.edits.json` v0 → v1).

## Release notes for two audiences
Every CHANGELOG section is bilingual and may carry `### Migration notes / ملاحظات الترحيل`: changed commands, schemas, breaking changes, written for the agent. The check splits it: highlights for the person, migration notes for the agent (`--notes`, `check_update`, the MCP notice).

## Schema gate
An edits file with a newer `version` than the engine is refused ("update Business-Wrap first"); a v0 file is migrated. Agents never down-convert a file or apply old instructions to a new schema without the migration the notes describe.

## Mirrored from QA Wrap
`extension/core/update-check.js` 13–98 → `update/core.mjs`; `extension/core/update-source.json` → `update/source.json`; `extension/ui/update-lib.js` 14–35 (`parseNotes`) → `update/core.mjs`; `extension/updater/host.ps1` 84–154 (verify, one backup, swap, rollback) → `update/apply.mjs`; `extension/tools/release-notes.mjs` → `update/release-notes.mjs`; `.github/workflows/release.yml` (tag = version, notes by script, zip + .sha256) → ours; `extension/tools/lib-release-guard.mjs` (`changelogUndated`, version checks) → `update/version-sync.mjs`; the update card's dismiss-per-version and off switch (`extension/ui/update-card.js` 28–31) → `editor/update.js`.
