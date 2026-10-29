# RECEIPT history (branch fix/history-migration, worktree Business-Wrap-wt-history)

## Root cause
`rewrapEditorHtml` (engine/build-editor.mjs) is how an older editor / Save-HTML file is served by a newer build. At v0.13.0 (engine/build-editor.mjs:208-224) it rebuilt the page from `services/setId/theme/fonts` only and dropped every other `bw-data` key: `bwlog`, `prov` (the sealed log), `contrib`, `lock`. The file then opened as "stripped"/"made before 0.13" with no log. Proved: v0.13.0's function on a real 0.13.0 file returns `in: [bwlog,prov,contrib,lock] out: []`.
Commit b24678c ("0.13.1 final pass 1") already carries those keys in master dc22de8 (= v0.13.1): the same file keeps 25/25 log entries and its ops there (served, library-import, re-save all checked). So a 0.13.1 build that includes b24678c does not lose this file; a 0.13.1 build/zip made before b24678c, or any 0.13.0 -> older/newer re-wrap, does. I could not tell which build the user ran. The design flaw (denylist rebuild with no check) is what is fixed structurally below.

## What was added
- engine/format.mjs: `FORMAT=1`, ordered `MIGRATIONS`, `migrateData`, `historyProblems`, `BUILT_KEYS`; files get `format` (0.13.x files = 0, migrated 0->1 by stamping).
- rewrapEditorHtml: migrate, rebuild, then `historyProblems(old,new)`; any loss or a newer format or a failing step throws `FormatError` (nothing rebuilt).
- serve.mjs `openOrRefuse`: on FormatError the file stays untouched, a byte copy goes to `HISTORY/backups` (`.local/backups` without a save folder), the page is an error message (HTTP 500), never an empty editor.
- editor.js saveHtml: edition = `{...s.editions[ed], known fields}` so a future edition attribute (cells, layout) survives Save-HTML. assets/editor/business-wrap.html rebuilt (merge conflict likely with lanes A/B: just re-run `node engine/build-skill-html.mjs`).
- Fixtures: tests/fixtures/history/{0.13.0,0.13.1}.html.gz + .expect.json, made by each version's own build (tools/fixtures/history.mjs make), font paths sanitised.
- tests/history-compat.test.mjs (in `npm test`): per fixture: re-wrap keeps unknown keys, opens in editor (all log entries, chain head, ops), re-save keeps/grows, library import; plus newer-format and failing-migration refusals.
- tools/release/history-gate.mjs wired into .github/workflows/gates.yml (every push) and release.yml (before release): fails a version with no fixture or an old fixture that no longer opens whole. Mutation check: removing the key carry makes it fail.
- AGENTS.md "File format and history", CONTRIBUTING EN+AR row.

## Recovery of files already opened and re-saved
Not automated. If a file lost its log, the log may still exist in the machine's `<save folder>\HISTORY\<doc-id>.bwlog` (+ `.heads.json`, `library\<id>.json.gz`): on the user's machine there are 7 such logs. Re-attaching needs the document id, which the lossy re-save removed; a tool matching by state hash is NOT built. If HISTORY was never written for that file, the history is gone.

## For lanes A/B
Add new block/cell/layout attributes inside the document JSON or as new keys on the edition; do not rebuild objects from fixed field lists. Bumping FORMAT is only for shape changes and goes through engine/format.mjs.
