# 07 · Updates for people and their agents (EN) — pair: 07-updates.ar.md

**Verdict:** one release feed (GitHub releases of the public repo), one cached check (at most one request a day), one line to the user, and nothing installed without consent. The same principle as QA Wrap's updater, reaching the person in the editor and terminal and the agent through SKILL.md, AGENTS.md, MCP and an optional hook.

## The feed
| Piece | What |
|---|---|
| `update/source.json` | the repo the check reads |
| `update/core.mjs` | `parseVersion`, `isNewer` (numeric), `pickRelease` (no drafts, no pre-releases), `isReleaseZipUrl` (this repo's release downloads only), `checkLatest` (ETag, rate-limit backoff), `parseNotes`, `extractNotes` |
| `update/check.mjs` | optional token (env `BW_UPDATE_TOKEN` or `.local/update-token`; only lifts GitHub's anonymous rate limit), the once-a-day cache in `.local/update-state.json`, settings in `.local/update.json` (`check`, `hook`), the one-liner (AR/EN) |
| `.github/workflows/release.yml` | a tag `vX.Y.Z` → version gate → notes cut from CHANGELOG → `business-wrap-X.Y.Z.zip` + `.sha256` → release |
| `update/version-sync.mjs` | CI gate: package, plugin, marketplace, MCP registry, Smithery, READMEs and CHANGELOG say the same version |

Public repo: the check and the download need no token and no sign-in. An optional read-only token only lifts the anonymous rate limit (60 requests an hour); it is sent to api.github.com only, never printed, never stored by the tool. The `gh` login is not read.

## Who sees what
| Audience | Channel | Behaviour |
|---|---|---|
| Person, editor | `editor/update.js` + `editor/settings.js` (mounted in `engine/build-editor.mjs`) | served by `engine/serve.mjs`: auto-check at launch (at most once per 24 h, switch in Settings, on by default), a popup with the notes and Update now / Later / Skip this version, one-click update with progress steps, then the editor reopens where the user was; Settings (About, Update, Preferences); "What's new" once after an update; from `file://` no request at all, Settings explains how to update; never printed or saved into Save-HTML |
| Person, terminal | `node update/cli.mjs update --check` in the install (the one-liner prints this install's own command) | one line + three highlights; `--apply --yes`; `--notes`; `--off` / `--on`. `npx business-wrap` resolves the **npm** package, which can lag behind GitHub (0.12.0 under 0.13): run from an npx cache, the CLI hands over to the install it stands in, else refuses `--apply` (a temporary copy) |
| Agent with the skill | SKILL.md "First: check for an update" | check at task start, one line to the user, offer the command, never auto-update |
| Codex, Cursor, Gemini CLI | `AGENTS.md` | the same instruction |
| Any MCP client | MCP server | `update_available` in the initialize instructions and on the first tool result of a session; `check_update`; `apply_update` refuses without `confirm: true` |
| Claude Code plugin | `/plugin update` + `hooks/hooks.json` | the marketplace version is the channel; the SessionStart hook prints one line only after `--enable-hook` (off by default) and uses the daily cache |

## Applying an update
- Git checkout: refuses on local changes to tracked files, then fetches and fast-forwards; user files are gitignored.
- Zip install: downloads the release zip (no token needed), verifies SHA-256 (GitHub digest or the `.sha256` asset), keeps ONE backup `<folder>.backup-<old>`, swaps product files, rolls back on failure.
- Never touched: `.local`, `design/custom`, `logos`, `fonts/custom`, `drafts`, `out`, `.git`, `node_modules`.
- Then user data is migrated by the NEW engine (`*.edits.json` v0 → v1).
- **Never a downgrade** (0.13.1): the source is GitHub's releases for the repo in `update/source.json` (never npm), and `applyUpdate` refuses a release that is not strictly newer than the installed version, whoever offered it. Gate: `tests/update.test.mjs`.

## In the editor (0.11.0)
The page is a self-contained HTML, often opened from `file://`: the page never holds a token and never calls GitHub. Everything goes through the local server, which uses the same check and apply as the CLI.

| Endpoint (`engine/serve.mjs`, 127.0.0.1 only, other origins refused) | What |
|---|---|
| `GET /api/version` | name, version, release date, repository, licence, credits, install mode, the last check |
| `GET /api/update/check[?force=1]` | the check (daily cache; `force` for «Check now»); `status` available / current / off / unknown with a `reason` (offline, no-access, rate-limit, error); the notes as plain-text sections; no download address leaves the server |
| `POST /api/update/apply {confirm: true}` | starts the update (202) and returns; one at a time |
| `GET /api/update/progress` | the stage: download → backup → replace → verify → done, or the error and whether it rolled back |

The update, step by step:
1. **download**: the release zip (no token needed), SHA-256 checked; refused before anything changes on a mismatch.
2. **backup**: one full copy `<folder>.backup-<old>`, user data included (not `node_modules`, not `.git`).
3. **replace**: every release file is written except into user folders; a file the release dropped is removed only inside the program folders (`CODE_ROOTS`: engine, editor, mcp, update, hooks, bible, assets, tests, security, evals, .claude-plugin, .github, .githooks). Anything else the release does not carry (a document saved at the root, `samples/<yours>`) stays byte-identical.
4. **verify**: the folder says the new version and its engine loads; user edits files are migrated by the new engine.
5. **done**: the server exits with code 75 and its supervisor (`npm run serve`) starts it again on the new code; the editor waits for `/api/version` to report the new version, saves the draft and its place (`bw:resume`: service, edition, page, scroll) and reloads; the draft loads without a restore question.

Any failure in replace or verify restores the backup exactly: the release's new files are removed and every backed-up file, program and data, is copied back. A Git checkout fast-forwards instead and resets to the previous commit if the new one does not load.

Never touched: documents, `*.edits.json`, the browser stores (draft, history, preferences, uploaded fonts), design packs, uploaded fonts, logos, `out/`, `exports/`, `harvest/`, `drafts/`, `.local/`.

**Old work.** When the server serves an editor or a Save-HTML file built by an older version, it re-wraps it in the current editor (`rewrapEditorHtml`): documents, edits, history, comments, snapshots, theme, fonts and set id are carried over, and the file on disk is never rewritten. The stored draft has a schema (`STATE_SCHEMA`, 2 since 0.11.0); `migrateState` moves it forward, idempotently, after copying the original byte for byte to `bw:draft-backup:<set>:v<old>`. A schema newer than the editor is never loaded or changed.

Tests: `tests/updater.test.mjs` (endpoints, apply, rollback, migration, re-wrap) and `tests/settings.test.mjs` (popup, skip, throttle, toggle, file://, progress and reload, old Save-HTML files, axe).

## Release notes for two audiences
Every CHANGELOG section is bilingual and may carry `### Migration notes / ملاحظات الترحيل`: changed commands, schemas, breaking changes, written for the agent. The check splits it: highlights for the person, migration notes for the agent (`--notes`, `check_update`, the MCP notice).

## Schema gate
An edits file with a newer `version` than the engine is refused ("update Business-Wrap first"); a v0 file is migrated. Agents never down-convert a file or apply old instructions to a new schema without the migration the notes describe.

## Mirrored from QA Wrap
`extension/core/update-check.js` 13–98 → `update/core.mjs`; `extension/core/update-source.json` → `update/source.json`; `extension/ui/update-lib.js` 14–35 (`parseNotes`) → `update/core.mjs`; `extension/updater/host.ps1` 84–154 (verify, one backup, swap, rollback) → `update/apply.mjs`; `extension/tools/release-notes.mjs` → `update/release-notes.mjs`; `.github/workflows/release.yml` (tag = version, notes by script, zip + .sha256) → ours; `extension/tools/lib-release-guard.mjs` (`changelogUndated`, version checks) → `update/version-sync.mjs`; the update card's dismiss-per-version and off switch (`extension/ui/update-card.js` 28–31) → `editor/update.js`.
