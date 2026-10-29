# 12 — Workspace, library, timeline and the background host (EN) — pair: 12-workspace-host.ar.md

**Verdict:** a document is never saved over its template; files go to one chosen save folder outside the repository; the history counter resets only on Save HTML; and the local server runs in the background, saves every tab when the last one closes, stops with nothing left, and offers to resume next time.

## Save folder (A11) — `engine/workspace.mjs`, `engine/routes/workspace.mjs`
| Rule | Gate |
|---|---|
| Layout `<parent>\Business-Wrap\{PDF,DOCX,HTML,HISTORY}`; the parent is chosen once (OS folder dialog) and kept in `.local/workspace.json`; `BW_WORKSPACE` overrides | `tests/workspace.test.mjs` |
| The default parent is Documents (else home) and is **never inside the repository**; a parent inside it is refused | same |
| **Every** saved file is named `<title>-<YYYY-MM-DD>-<AR\|ENG>.<ext>`: PDF, DOCX, Save HTML, print HTML, the share file (`sharePath`: the title of the document inside the HTML, never its id) and the performance report (`reportPath`, in `PDF\`). The title through `titleStem`: Arabic and the spaces between words kept (as the pipeline outputs), `: / \ * ? " < > \|` → `-`; a clash gets `-2`, `-3`, never an overwrite | same (0.13.0 review line 15) |
| `PDF\ DOCX\ HTML\` hold only such files: no machine file outside `HISTORY\` (the DOCX builder's `.manifest.json` stays in its temp work folder) | same |
| `HISTORY\` is machine state only (hidden on Windows, never served under `/files/`): `sessions\` (JSON), `library\` (gzip) | same |
| `engine/serve.mjs` without `--out` exports into the save folder; with `--out` (and programmatic `serve()` without `workspace`) the old layout stays | same, `tests/print.test.mjs` |

API: `workspace() → {parent, root, chosen, dirs}`, `outName(title, date, locale, ext)`, `titleStem(title)`, `sharePath(htmlDir, html)`, `reportPath(pdfDir, lang)`, `pickParent() → string|null`, `setParent(p)`, `ensure(ws)`, `uniquePath(dir, name)`, `docTitle(doc)`.

## Document library (A2) — `editor/ext/10-library.*`, `engine/routes/library.mjs`, `engine/import/`
- The services built into the HTML are **templates** (read-only). The first Save of a template or of a new blank document creates a library entry `doc-<uuid>` and switches to it; the template returns to its built state. Later Saves update the entry.
- Store: IndexedDB `bw-library` (in-memory when storage is blocked); served: mirrored to `HISTORY\library\<id>.json.gz`.
- **The list copy is always the latest:** every change of a library document is autosaved into its entry (0.6 s after it; on pagehide at once); the «آخر حفظ» stamp beside the change counter says when (list · HTML) and replaces the «حُفظ تلقائياً» toast. A reload with `#doc=<id>` reopens that document; a draft newer than the entry (same base, the entry's ops plus more) is applied quietly, no banner.
- **Open here** sets `#doc=<id>` (`history.replaceState`) and closes the drawer; a template clears it. Every open path (list, new, import, duplicate, from template, resume) goes through `show()` and so emits `open(svc, ed)` (the provenance log attaches there).
- Drawer «المستندات»: search, open here, open in a new tab (`#doc=<id>`), duplicate, «نسخ كقالب», delete (Trash, restore, delete for good), new document (`samples/blank`), «القوالب» (a new document from a saved template: same design, header/footer items, logos, page setup and chapter/section titles, empty bodies), and per-row metrics (edits, active minutes, contributors, last signer, locked) read from the document's provenance log with `BWLOG1.metrics` (read only).
- Import (`engine/import/`): a Save-HTML in the page; any other HTML, DOCX (python-docx through uv, `docx_items.py`) and PDF (`pdftotext -layout -enc UTF-8`, the title from `pdfinfo`; never pymupdf for Arabic) through `POST /api/import`. **Structure kept:** headings from Heading styles, `h1–h6` or numbering (`2.1`, glued `2.1وصف` as pdftotext gives it); numbered headings must follow on and, when the PDF has a contents page, appear in it; tables become table blocks; the running header/footer and the contents pages are dropped. **Title** = the document's own: its metadata title, the «عنوان الوثيقة» row, a Title paragraph, the first cover line; the file name only when there is none. The front matter before chapter 1 is not imported as a chapter (the open question says so).
- Gate: `tests/library.test.mjs`.

## «تغييرات» timeline (A9) — `editor/ext/11-timeline.*`
- Per edition `marks: [{at, n, kind}]` (`checkpoint | save | saveHtml | export`) and `epochIds` (the live op ids at the last Save HTML). Counter = ops added since that point + ops undone since it. Save and PDF/DOCX export add a mark and keep the count.
- Checkpoints: after 2 minutes idle, after 25 ops since the last mark, and by hand. ◀ / ▶ = undo / redo of one action group; a row click travels there; travel never deletes (the future stays on the redo stack).
- Persisted in `localStorage bw:tl:<set>`, in library entries and inside the Save-HTML file. Gate: `tests/timeline.test.mjs`.
- «مقارنة بآخر حفظ HTML»: the document at the epoch (the epoch op ids applied to the base) against now, text leaf by text leaf; «استرجع هذا التغيير» sets one text back (one `setText`), the others stay. Limit: an inserted or deleted block shifts the paths after it. Gate: `tests/library.test.mjs`.

## Background host and resume (A10) — `engine/host.mjs`, `engine/routes/session.mjs`, `editor/ext/12-session.*`
- `start({editor, port, open}) → {pid, port, url}` spawns `serve.mjs` detached (next free port), `.local/host.json` holds `{pid, port, token, browserPids, tabs}`; `stop() → {stopped, pids}`; `status() → {running, pid, port, tabs}`.
- Each tab: `EventSource /api/session/live`, state pushed 1.5 s after a change, `sendBeacon /api/session/flush` on pagehide → `HISTORY\sessions\<run>\<tab>.json`. The last connection gone → 4 s → `run.json`, the host's own Edge profile closed, exit 0.
- Relaunch: a modal offers (1) resume everything — **the server** opens Edge with all URLs, 30 per command line, own `--user-data-dir` under `.local/edge-profile` (a page can open only one popup per gesture) — or (2) new work (the run goes to `sessions\archive\<date>\`).
- The host closes only browsers on its own profile; nothing it did not start. Gate: `tests/host.test.mjs` (ends with a process sweep).
