# 12 — Workspace, library, timeline and the background host (EN) — pair: 12-workspace-host.ar.md

**Verdict:** a document is never saved over its template; files go to one chosen save folder outside the repository; the history counter resets only on Save HTML; and the local server runs in the background, saves every tab when the last one closes, stops with nothing left, and offers to resume next time.

## Save folder (A11) — `engine/workspace.mjs`, `engine/routes/workspace.mjs`
| Rule | Gate |
|---|---|
| Layout `<parent>\Business-Wrap\{PDF,DOCX,HTML,HISTORY}`; the parent is chosen once (OS folder dialog) and kept in `.local/workspace.json`; `BW_WORKSPACE` overrides | `tests/workspace.test.mjs` |
| The default parent is Documents (else home) and is **never inside the repository**; a parent inside it is refused | same |
| Names `<title>-<YYYY-MM-DD>-<AR\|ENG>.<ext>`; title through `fileStem` (Arabic kept, `: / \ * ? " < > \|` → `-`); a clash gets `-2`, `-3`, never an overwrite | same |
| `HISTORY\` is machine state only (hidden on Windows, never served under `/files/`): `sessions\` (JSON), `library\` (gzip) | same |
| `engine/serve.mjs` without `--out` exports into the save folder; with `--out` (and programmatic `serve()` without `workspace`) the old layout stays | same, `tests/print.test.mjs` |

API: `workspace() → {parent, root, chosen, dirs}`, `outName(title, date, locale, ext)`, `pickParent() → string|null`, `setParent(p)`, `ensure(ws)`, `uniquePath(dir, name)`, `docTitle(doc)`.

## Document library (A2) — `editor/ext/10-library.*`, `engine/routes/library.mjs`, `engine/import/`
- The services built into the HTML are **templates** (read-only). The first Save of a template or of a new blank document creates a library entry `doc-<uuid>` and switches to it; the template returns to its built state. Later Saves update the entry.
- Store: IndexedDB `bw-library` (in-memory when storage is blocked); served: mirrored to `HISTORY\library\<id>.json.gz`.
- Drawer «المستندات»: search, open here, open in a new tab (`#doc=<id>`), duplicate, delete (Trash, restore, delete for good), new document (`samples/blank`), import: Save-HTML in the page; DOCX (python-docx through uv, `engine/import/docx_items.py`) and PDF (`pdftotext -layout -enc UTF-8`, never pymupdf for Arabic) through `POST /api/import`. Headings come from Heading styles or a numbering pattern; the result carries one open question to review the structure.
- Gate: `tests/library.test.mjs`.

## «تغييرات» timeline (A9) — `editor/ext/11-timeline.*`
- Per edition `marks: [{at, n, kind}]` (`checkpoint | save | saveHtml | export`) and `epochIds` (the live op ids at the last Save HTML). Counter = ops added since that point + ops undone since it. Save and PDF/DOCX export add a mark and keep the count.
- Checkpoints: after 2 minutes idle, after 25 ops since the last mark, and by hand. ◀ / ▶ = undo / redo of one action group; a row click travels there; travel never deletes (the future stays on the redo stack).
- Persisted in `localStorage bw:tl:<set>`, in library entries and inside the Save-HTML file. Gate: `tests/timeline.test.mjs`.

## Background host and resume (A10) — `engine/host.mjs`, `engine/routes/session.mjs`, `editor/ext/12-session.*`
- `start({editor, port, open}) → {pid, port, url}` spawns `serve.mjs` detached (next free port), `.local/host.json` holds `{pid, port, token, browserPids, tabs}`; `stop() → {stopped, pids}`; `status() → {running, pid, port, tabs}`.
- Each tab: `EventSource /api/session/live`, state pushed 1.5 s after a change, `sendBeacon /api/session/flush` on pagehide → `HISTORY\sessions\<run>\<tab>.json`. The last connection gone → 4 s → `run.json`, the host's own Edge profile closed, exit 0.
- Relaunch: a modal offers (1) resume everything — **the server** opens Edge with all URLs, 30 per command line, own `--user-data-dir` under `.local/edge-profile` (a page can open only one popup per gesture) — or (2) new work (the run goes to `sessions\archive\<date>\`).
- The host closes only browsers on its own profile; nothing it did not start. Gate: `tests/host.test.mjs` (ends with a process sweep).
