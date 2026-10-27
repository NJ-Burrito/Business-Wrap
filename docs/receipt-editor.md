# Receipt — Business-Wrap editor (Agent B, branch `editor`)

Date: 2026-10-27. Governance: nj-governance-v4 (Owner override: Opus worker). delegations: 0.

## Result

- The editor is the print layout: `engine/render.mjs` is a port of the source SRS
  pipeline's `html()` (markup + stylesheet + `relaxTallGroups`), with palette, fonts,
  logos and every printed label passed in. The editor shows that markup; the PDF
  export prints that markup.
- VERIFIER `npm test` (`tests/editor.test.mjs`): **55/55 PASS**, both editions.
- Security gate (copy of `security/check.py` pointed at this worktree, `--tree-only`):
  0 findings. History: rewritten to clean commits (see bottom).
- Sample editor (generated, gitignored): `out/sample/event-permit.editor.html`
  (`npm run sample`). One-click export: `npm run serve` → http://127.0.0.1:4317/.

## Facts checked

| fact | grade | finding |
|---|---|---|
| The PDF is Chrome-printed from HTML, so editor = template + editing layer | [A] → [V] | True. Source `render()` uses Playwright `page.pdf({preferCSSPageSize, tagged, displayHeaderFooter})` on `html(doc)` after `relaxTallGroups`; then pymupdf post-steps (clear cover head, stamp folios). Ported 1:1. |
| Fonts default from `NJ-Font\thmanyah\…\woff2` | [V] | **CHALLENGE.** That folder holds only `.otf`/`.woff2` (CFF outlines). Chrome prints CFF as **Type 3** (the source pipeline records the same finding and uses converted TTF). The engine therefore prefers `.ttf` wherever the manifest's folders hold one; on this machine the TTF cuts are in the per-user Windows font folder (fallback dir in the manifest). Result: all PDFs embed `CID TrueType` Thmanyah subsets, no Type 3. Recommendation: the fonts manifest (Agent A) should point at a TTF folder. |
| Edits contract at `bible/contracts/edits.schema.json` | [V] | Found and used as is (v1). Every saved edits file validates against it (jsonschema, in the test). |

## Fidelity proof

`tests/fidelity.mjs` prints the editor (its own HTML, print media) and compares it
page by page with a reference PDF (`tests/pdf_compare.py`: page count, page size,
body text, grey-level pixel difference; head/foot bands excluded).

| comparison | pages | body text equal | pixel MAD (0–255) |
|---|---|---|---|
| AR sample: editor print vs the **source pipeline's own `html()` + `relaxTallGroups`**, same document JSON, source palette | 9 / 9 | 9 / 9 | 0 (pages 2–9; cover skipped: the source prints its client marks there) |
| AR edited: editor print vs `engine/export.mjs` PDF | 9 / 9 | 9 / 9 | 0 |
| EN edited: editor print vs `engine/export.mjs` PDF | 9 / 9 | 9 / 9 | 0 |

The source renderer is Arabic-only (it prints Arabic labels into an English document),
so for EN the proof is editor-print = export. The source-pipeline reference was built
in the session scratchpad by bundling a read-only copy of its renderer; nothing of it
is in this repo. One divergence found and fixed on the way: the story goal sentence
was split into three spans for per-field editing, which changed the PDF text order;
it is now one run (editing it writes the story's `goal` field).

## Original requirements

| requirement | status | note |
|---|---|---|
| Inline edit of every text field | DONE | `contenteditable="plaintext-only"` on focus; every leaf carries a JSON pointer |
| Move blocks with the cursor (drag) | DONE | grip beside the selected block, drop line, auto-scroll; Alt+↑/↓ for keyboard |
| Duplicate, delete, reorder, undo/redo, shortcuts | DONE | Ctrl+Z/Y, Ctrl+D, Delete, Alt+↑/↓, Ctrl+F, Ctrl+S, Esc |
| Table row/column add and delete | DONE | row ops tested; column ops built, not in the test |
| ADHD-friendly UI | DONE | one toolbar, icon + word on every button, changes counter, selection + autosave state always shown, panels one click away |
| 1 Export edits JSON per service and global | DONE | Save = this edition's contract file; "Export edits" / "All services" = `bw-edits-bundle` wrapper (not in the contract — Lead to reconcile) |
| 2 Export PDF + DOCX from the edited state | DONE | via `npm run serve` one click; from file:// it downloads the edited JSON + shows the command |
| 3 Design pack export/import | DONE | `bw-design-pack` JSON (fonts, sizes, vars, brand, logos); import filters token values and logo URIs |
| 4 Logo slots | DONE | start / centre / end on the cover, header slot; empty slots are dashed placeholders on screen, nothing in print |
| 5 Font picker | DONE | families from the manifest (Cairo excluded) |
| 6 Print | DONE | `window.print()`; `relaxTallGroups` runs on `beforeprint` |
| 7 Save | DONE | file download + localStorage draft (try/catch) |
| 8 Save HTML (single service) | DONE | self-contained, keeps history and comments, no watermark; fonts embedded when the toggle is on and the fonts are reachable |
| Multi-service selector | DONE | sample ships one service; selector groups docs by `service` |
| Bilingual UI (AMEND 1) | DONE | all strings in `engine/i18n.json`; toggle mirrors the whole UI (RTL/LTR) |
| AR/EN editions, switch, side by side, stale flags (AMEND 1) | DONE | text edits flag the other edition's field; structural edits mirror to both editions by default ("Both editions") |
| Watermark (AMEND 2) | DONE, nothing to show | `NJ-Avatar` was **empty** at build time → no element, no placeholder art. Test plants a 1×1 PNG and asserts: shown in the UI; absent from edits JSON, Save-HTML, export PDF, editor print, DOCX |

## AMEND 3 — thirteen items

| # | item | status | note |
|---|---|---|---|
| 1 | Paste sanitising, CSP, offline | DONE | paste = text only after stripping script/style/iframe; CSP `default-src 'none'`, script allowed only by the app script's SHA-256; no CDN; inline SVG figures stripped of script/handlers/foreignObject/js: links; theme values filtered before they reach CSS; server binds 127.0.0.1 and checks Origin. Tested. |
| 2 | Autosave + recovery; version history + diff; change log export | DONE | autosave 400 ms after each change; reopen offers the draft (tested); named versions with a before/after table; `bw-change-log` JSON export |
| 3 | Find & replace AR/EN with alef/hamza folding; spell check per edition | DONE | folding: hamza forms, ta marbuta, alef maqsura, diacritics, tatweel, case; spell toggle per edition |
| 4 | Renumbering, auto TOC, page-break controls, page navigator, zoom | PARTIAL | renumber chapters/sections/story cards DONE; tables/figures carry no number field in the document format, so nothing to renumber; TOC is generated from the chapters DONE; "New page before" / "Keep with next" DONE (block `layout` flags); outline navigator DONE; **page thumbnails DEFERRED** — the screen view is one continuous column, pages exist only when Chrome paginates for print; thumbnails would need a print + rasterise per edit |
| 5 | Figures and images: insert, replace, caption, resize | DONE | image → `shots` block (data URI, PNG/JPEG/SVG), width 10–100 % of the 150 mm measure; DOCX places PNG/JPEG (SVG logos/images are skipped by python-docx — PARTIAL there) |
| 6 | Comments; approve/reject per change | DONE | comments never print, exported as `bw-comments`; rejected changes drop out of the document and the export |
| 7 | Validation panel | DONE | empty section, numbering, pair out of sync, stale fields, overflowing table, font not loaded, empty logo slots — icon + word |
| 8 | Import back with conflict view | DONE | edits file, bundle, comments file or a colleague's Save-HTML (parsed as data); same field changed both sides → Mine/Theirs choice. Tested. |
| 9 | Schema version + migration stub | DONE | `migrate()` in `engine/edits.mjs` (v0 bare op array → v1) |
| 10 | Accessibility | PARTIAL | every field reachable by Tab, every action has a key or a button, ARIA toolbar/dialog/status/aria-pressed, 3 px focus rings, reduced motion respected, UI contrast measured ≥ 5.5:1 in both themes; no screen-reader / axe audit run |
| 11 | Dark mode (UI only), laptop, responsive toolbar | DONE | toggle + `prefers-color-scheme`; the document never changes; toolbar wraps, tested at 1366 px |
| 12 | Performance | DONE | 63-page document: load 366 ms, duplicate + full re-render 64 ms, undo 52 ms, keystroke 1.7 ms (`out/test/perf.txt`) |
| 13 | Browser support | DONE | Chrome/Edge latest, stated in `editor/README.md` (section for Agent A) |

## Formats this branch adds (for the bible)

- Document JSON: block `layout: {breakBefore?, keepNext?}`; `shots.width` (10–100) and
  `shots.images[]` as data URIs; story `goal` written when the composed goal sentence is edited.
- `bw-edits-bundle` `{kind, version, files: [edits v1…]}`, `bw-design-pack`,
  `bw-comments`, `bw-change-log` (kind + version on each).
- Design-pack variable names: `ink muted paper card rule rule-strong primary primary-deep
  primary-50 primary-100 accent accent-rule accent-bright signal signal-wash`
  (stub in `engine/defaults/theme.json` until A's palette lands).

## Not verified / risks

- DOCX visual fidelity was not compared (the builder is the source builder, comments
  stripped by an AST round trip; its `document.xml` was byte-identical before/after
  the strip on both editions). Word COM steps (TOC refresh, font embedding) are
  optional and were not run.
- The source pipeline's multi-pass contents balancing (`tocSplit`) is not ported; the
  sample needs none. Long contents tables may break differently from the source.
- Folio stamping embeds a subset of Thmanyah Serif Display Bold (licence allows
  embedding in documents you create).
- Column add/delete, theme import and the served one-click export were exercised by
  hand/smoke script, not by `npm test`.

## Security gate (AMEND 4)

(a) client terms removed: DOCX copies rewritten without comments/docstrings (AST),
leftover labels moved to `engine/i18n.json`, renderer header neutral; (b) no absolute
paths: font root, watermark dir, Chrome and poppler come from env or the gitignored
`.local/config.json` (`engine/config.mjs`); the sample editor is generated into `out/`;
(c) branch history squashed into clean commits; (d) `npm test` runs the real check;
(e) `NJ-Avatar` empty → no files under `editor/brand/watermark/`, nothing to allow-list.
