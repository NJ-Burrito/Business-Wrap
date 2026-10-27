# Design packs (EN) — pair: README.ar.md

**Verdict:** a design pack = two DTCG token files + a font manifest + layout notes. `design/build.py` gates the palette and compiles the pack into `theme.json`, the one flat file the HTML editor, the PDF print and the DOCX builder all read.

| Folder | What |
|---|---|
| `ours/` | the default pack (`pack.json` → `theme.json`, generated) |
| `custom/` | upload slot for your pack; gitignored except its README |
| `build.py` | pack → theme compiler (refuses a failing palette or a banned font) |

Contract: `bible/contracts/design-pack.schema.json`. Full method: `bible/06-design-system.md`.

## Build or upload a custom pack (5 steps)
1. Copy `ours/pack.json` to `custom/<name>/pack.json`; copy `palette/tokens.json` and `typography/tokens.json` beside it and point `tokens` at the copies.
2. Change anchors/roles/sizes in the copies. Keep every role name (templates read them).
3. `python design/build.py design/custom/<name>/pack.json` → writes `theme.json` beside it, or prints the failing contrast pair.
4. Load it: in the editor, «Theme → Load pack», or `--theme design/custom/<name>/theme.json` on export.
5. Logos go to `logos/` (your files), fonts to `fonts/custom/`.

## How tokens reach each output
| Token | HTML editor / PDF | DOCX |
|---|---|---|
| `color.role.*` | CSS variable `--c-<role>` | run colour, cell shading, border colour |
| `font.family.text/display` | `font-family` on body / headings | `w:rFonts` ASCII **and** `w:cs` slots |
| `font.size.*` | `pt` value on the matching rule | `w:sz` and `w:szCs` (half-points) |
| `rule.*` | `border-*` width | `w:sz` in eighths of a point |
| `page.*` | `@page` size and margins | section page size and margins |
| `space.*` | margins and paddings | paragraph space before/after, cell margins |
