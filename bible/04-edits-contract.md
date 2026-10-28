# 04 · The edits contract (EN) — pair: 04-edits-contract.ar.md

**Verdict:** the editor never changes the document JSON. It writes `edits.json`: an ordered list of ops on RFC 6901 JSON Pointers. Replaying the ops on the base document (matched by `baseHash`) gives the edited document. Schema: `contracts/edits.schema.json` (v1), adopted by the editor engine.

## Envelope
| Field | Meaning |
|---|---|
| `version` | `1` |
| `document` | the document id |
| `baseHash` | `sha256:<hex>` of the base document JSON bytes; replay refuses on mismatch |
| `locale` | `ar` (RTL) or `en` (LTR): the edition edited |
| `createdAt`, `author` | optional; author is initials or free text, never an email or ID number |
| `theme` | optional token overrides by DTCG path (`"color.role.primary": "#1f6f5c"`) |
| `ops[]` | the edits, in order |

## Ops
| op | Fields | Use |
|---|---|---|
| `setText` | `path`, `value`, `old` | change a string leaf: paragraph, cell, title, caption |
| `replace` | `path`, `value`, `old` | replace a whole node |
| `insert` | `path` (index or `-`), `value` | add a block, row, paragraph, story |
| `delete` | `path`, `old` | remove an item; `old` keeps it for undo |
| `move` | `from`, `path` | drag or keyboard reorder (JSON Patch move semantics) |
| `duplicate` | `path`, `to` (default: right after) | copy an item |

Pointers resolve against the state after all previous ops. `old` makes every op invertible, which is the undo stack.

## Rules
1. **Only through ops.** Save = write `edits.json`; Export = replay + render. A hand edit of the document JSON is lost on the next stage rebuild.
2. **Conflict check:** a `setText` whose current value differs from `old` is a conflict; the editor shows both and asks, never overwrites silently.
3. **Renumbering** after insert/delete/move is done by the renderer from position, not stored in ops.
4. **Paste is plain text.**
5. **Recurring edits are defects upstream.** If the same op appears on several documents, fix the source rule; the edits file is for one document's human judgement.
6. **No secrets, no watermark:** the edits file is an output; it carries no credentials, no personal data beyond initials, and never the editor watermark.

## Example
```json
{ "version": 1, "document": "SAMPLE-001", "baseHash": "sha256:<64 hex>", "locale": "en",
  "ops": [
    { "op": "setText", "path": "/chapters/0/sections/0/blocks/0/paragraphs/0", "value": "New wording.", "old": "Old wording." },
    { "op": "move", "from": "/chapters/1/sections/0/blocks/2", "path": "/chapters/1/sections/0/blocks/0" },
    { "op": "duplicate", "path": "/chapters/1/sections/0/blocks/1/rows/0" },
    { "op": "delete", "path": "/chapters/2/sections/1/blocks/0/rows/4" } ] }
```

## Editor exports beyond one edits file (`contracts/wrappers.schema.json`)
| `kind` | What | Notes |
|---|---|---|
| `bw-edits-bundle` | `{kind, version: 1, createdAt, files: [edits v1…]}` | "Export edits" for one service (both editions) or "All services" |
| `bw-design-pack` | the compiled theme (`name, fonts, sizes, vars, brand, logos`) + kind/version | same shape `design/build.py` writes to `theme.json`; import keeps token-shaped values and data/relative logo URIs only |
| `bw-comments` | `{kind, version: 1, comments: [{id, path, text, at, service, locale}]}` | comments never print and never enter the document JSON |
| `bw-change-log` | `{kind, version: 1, service, locale, baseHash, exportedAt, changes: [op + status], versions: [{name, at, ops}]}` | status `pending` / `approved` / `rejected`; rejected ops drop out of the document and every export |

Older files are migrated on import (`migrate()`: v0 bare op array → v1).

## Document JSON additions written by the editor
- Any block may carry `layout: {breakBefore?: bool, keepNext?: bool}` (page-break controls: "New page before", "Keep with next"). Set with a `replace` op on `<block>/layout`, mirrored to both editions.
- Image block `{kind: "shots", caption, images: ["data:image/png|jpeg|svg+xml;base64,…"], width: 10–100}`; width is a percent of the 150 mm measure. The DOCX places PNG/JPEG; SVG images are skipped there.
- Editing the composed story goal sentence writes the story's `goal` field.

## The AR/EN pair
- The two editions are one unit. A structural edit (move, delete, insert, duplicate, row/column, page-break flags) made with **Both editions** ticked (the default) is applied to the other edition at the same pointer; an edits file still records each edition separately (`locale`, `baseHash`).
- Text edits stay per edition: editing a field flags the same field in the other edition **Needs update** until it is edited there too.
- Before export, the **Check** panel must show no "Editions differ in structure" line (same chapters, sections, block kinds and table sizes in both) and no stale fields.
- Importing a file whose structural edits touch the same block, row or paragraph as yours opens the conflict view (**Keep mine** / **Take theirs**), as text conflicts do.

## Free-placed logos and images (`overlays`)
The document may carry `overlays: [{id, kind: "logo"|"image", src, mode, x, y, w, anchor?, caption?}]`. Positions are millimetres and print exactly there in the PDF and the DOCX:
- `mode: "cover"`: from the cover page's top-left corner.
- `mode: "every"`: on every page after the cover (headers and footers): x from the page's left edge, y from the top of the text area.
- `mode: "anchor"`: next to a block (`anchor` = its pointer); x from the text column's left edge, y from the block's top. It moves with that block.
`src` is a PNG or JPEG data URI that the editor re-encoded through a canvas (metadata stripped, SVG rasterised, at most 2000 px). Ops: `insert /overlays/-`, `replace /overlays/<i>` (move, resize, every-page toggle), `delete /overlays/<i>`; the first overlay creates the array with `replace /overlays []`. The renderer and the DOCX builder print nothing for a `src` that is not such a data URI.

## Webhooks (`contracts/webhook.schema.json`)
Off by default, no default URLs. In the **Webhooks** panel the user adds URLs, picks events (save, PDF + DOCX export, edits exported, import merged, check failed) and may tick “Include the full document”. The page sends nothing itself: `POST /api/webhook` on the local server (`npm run serve`) delivers it, because a page opened from disk cannot reach other origins (CORS, and the editor's CSP keeps `connect-src 'self'`). The server forwards only the schema's fields; fonts and the tool watermark are never sent. Each delivery is listed with its status and time; **Send test** sends a `test` event.

## Everything is editable (0.7.0)
Nothing the document prints is fixed. All of it lives in the document JSON, travels as ops in the edits file, and lands in the PDF and the DOCX (`contracts/edits.schema.json` → `$defs.documentFields`).
| What | Where it is written | How |
|---|---|---|
| Fixed labels: chapter/section titles of the front matter, table headers (revision table, open questions), story labels, caption prefixes, kicker, confidentiality mark … | `/labels/<key>` (`/labels/control/<key>`, `/labels/questionCols/<i>`) | edit in place, or the **Labels** list in the Design panel; «apply to all documents» writes the design pack (`theme.labels.<locale>`) |
| Title, subtitle, cover code (spine and running header), version/status/date on the cover | `/control/coverTitle`, `/control/subtitle`, `/control/documentId` … | edit in place |
| Field names and values (service card, inputs, attachments, statuses) | the table cells (`…/rows/<r>/<c>`) | edit in place; rows add, delete, move up and down |
| Design: colours per role, sizes, line height, page side margin, rule widths, table header fill and ink, zebra | `/design/vars`, `/design/sizes` | Design panel, live |
| One element only | `<block>/style`, `<block>/hidden` | select → **Style this** / **Hide** |
| Template parts (cover, control data, revisions, contents, open questions): show, hide, order | `/layout/hide`, `/layout/front` | Design panel |
| Chapters: hide, move, duplicate, delete; add a section or a table | `/chapters/…` | Design panel |
| Advanced CSS | `/design/css` | Design panel; sanitised (no `@import`, no remote `url()`, no expressions), applied to the editor and the PDF |

Undo and redo cover all of it (they are ops). The check flags an empty label. A harvested value edited by hand is recorded in `/manual`; a re-harvest keeps it and writes `harvestConflicts`, which the editor shows on open.

## Diagrams (0.9.0)

A `diagram` block's `model` (`contracts/diagram.schema.json`) is edited with the ops above: the editor writes ONE `replace` on `<block>/model` per gesture (move, resize, add, connect, kind, colour, align, layout, Mermaid import), and find/replace reaches node and edge labels through `setText` on `<block>/model/nodes/<i>/label`. Positions are optional: a node without `x`/`y` is placed by the auto layout; arrows are routed from the shapes, so moving a shape re-routes its arrows. Since 0.9.1 an edge may carry `via` — hand-set bend points `[[x, y], …]` between its two ends (drag a segment handle across, drag a corner, «Add bend point» / «Remove bend point»); the router keeps every segment orthogonal and adds an elbow where an end moved; «Auto route» deletes `via`, and «Auto layout» clears every `via`. Labels may hold a line feed (Shift+Enter while editing in place). The version stays 1: `via` is optional and no op changed.

### The toolbar follows the selection

Nothing selected (or Esc, or a click on the page) → the general sections: File · Insert · Edit · Document · Design · Export · View. A selection adds one highlighted section first, named for what is selected: Text, Table cell, Image, Logo, Shape («Shape: stage box»), Arrow, N shapes (align, distribute, group), Diagram (add shapes and symbols, auto layout, reset, flow, legend, Mermaid). Four tools stay in view, the rest sit in its «More» menu; a diagram selection also keeps zoom out · fit · zoom in in view (100% in «More»; Ctrl+wheel over the drawing zooms too; zoom is view state, never an op). Since 0.9.1 the section titles always show: when the bar runs out of room the general tools first drop their words, then one section at a time (the last first) folds its extra tools into its own «More», then the selection's words go — the bar never scrolls sideways at 1280–1920 px. The Ctrl+K palette lists every command under the same categories.

### Labels are edited in place (0.9.1)

Double-click a shape, an arrow or free text (or select it and press Enter/F2): a text box opens on the label itself in the drawing's face and size; the caret follows the text (Arabic right to left, Latin left to right). Enter or a click elsewhere saves (one `replace`), Shift+Enter adds a line, Esc cancels. No dialog.

### The shell, 0.10.0: layout never flips, sticky tools, explainers, page views

- **The layout never flips.** The editor keeps the default (Arabic, right-to-left) arrangement in both languages: toolbar, panels, page and watermark stay where they are. «ع» / «E» changes the interface language and the edition; RTL / LTR changes only the direction of the words (the UI text and the document view). Every toolbar word reserves the width of the longer of its Arabic and English forms, so both languages fold the bar the same way and every tool keeps its place.
- **Segmented fields.** «ع» / «E», RTL / LTR and View → Pages are segmented fields: a click anywhere on the field (an option, its caption or its padding) toggles it, and the thumb slides from where it is (critically damped; no motion under reduced motion or Calm mode).
- **The selection's tools are a mode.** They stay while the person works in the toolbar, panels, menus, pickers, colour inputs and inline editors; only a click on empty space (the desk or the page background) or Esc returns the general tools. Esc peels one layer at a time: explainer → open menu → View popover → panel → selection.
- **Explainers.** Resting on a tool (pointer or keyboard focus) for about 700 ms shows a card: the tool's name, its shortcut, one sentence (`explain.<id>` in `editor/ux-i18n.json`, Arabic and English) and a looping illustration. Moving to the next tool shows its card at once; leaving, pressing, scrolling or Esc hides it; reduced motion shows a still frame.
- **Page views** (View → Pages, remembered per browser): Continuous; Single (one page at a time); Book (the cover alone, then pairs in the edition's reading direction). Pages are screen-only CSS columns of one A4 sheet each: editing works in every view, and print, the PDF, the DOCX and the edits file never see the view (the print pass measures the plain sheet). None of this is an op.
