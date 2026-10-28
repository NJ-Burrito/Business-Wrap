# 06 · Design system and the design-pack contract (EN) — pair: 06-design-system.ar.md

**Verdict:** the look is data. Tokens (DTCG 2025.10) → `design/build.py` (contrast gate) → `theme.json` → HTML/PDF and DOCX. Nobody types a colour, size or margin into a template.

## Contract
A pack (`contracts/design-pack.schema.json`) has `name`, `version` (semver), `tokens.palette`, `tokens.typography`, `fonts`, optional `bannedFonts`, `layout` notes and `logoSlots`. The palette file must define `color.ramp`, `color.role` (the 19 role names the templates read), `color.diagram`, `color.white` and the contrast pairs. Packs never contain logos or font binaries.

## Token → output map
| Token group | HTML editor and PDF | DOCX |
|---|---|---|
| `color.role.*` | `--c-<role>` CSS variables | run colour, cell shading, border colour |
| `color.diagram.*` | figure SVG fills, lines, inks | the figure is embedded as an image of the same SVG |
| `font.family.text` / `display` | `font-family` on body / headings | `w:rFonts` `w:ascii`+`w:hAnsi` **and** `w:cs` |
| `font.weight.*` | `font-weight` | bold on/off (Word has no 500/900 in runs; the face name carries it) |
| `font.size.*` | `pt` (from `$extensions.business-wrap.print`) | `w:sz` + `w:szCs` in half-points |
| `font.lineHeight.*` | `line-height` | paragraph line spacing (multiple) |
| `space.*` | margins/paddings in mm | space before/after, cell margins in twips |
| `rule.*` | `border-*-width` | `w:sz` in eighths of a point (1.2 pt → 10) |
| `page.*` | `@page { size; margin }`, named pages for cover and the wide sheet | section page size, orientation, margins |

## Fonts chosen in the editor
The editor embeds every chosen font (project, installed on the computer, or uploaded) as real text in the PDF and the DOCX: each face is normalised to TrueType outlines with OS/2 fsType 0 before printing and embedding, and the font's licence is the user's responsibility (owner decision, 2026-10-28). A family with no bold face gets a synthetic Bold at export (`engine/font_normalise.py --embolden`: every outline grows by 1/26 em, the advance by the same), so bold text stays bold and stays real text; Chrome's own faked bold would print as Type 3 drawings.

## Contrast rules
Body text 7:1 on paper and card; secondary text, numbers, ids and tags 4.5:1; accent that carries words uses its 800 step; no information by colour alone. `palette/check.py` fails the build otherwise.

## Importing a colour palette (0.13.0)

Design → Colours → **Import a colour palette** takes a file, suggests a role for each colour (its name when it is a role name such as `primary` or `background`; otherwise the lightest is the background, the darkest the text, a saturated red the alert colour, the darkest saturated left the main colour, the most saturated left the accent, the greyest left the secondary text), previews it on the page and runs the contrast gate of `palette/check.py`, ported to the editor: text and chapter titles 7:1 on the background, secondary text and section numbers 4.5:1, white 7:1 on the main colour and 4.5:1 on the alert colour. A failing pair shows its ratio and blocks **Apply** until the colour is changed or that pair is overridden with a written reason (kept in `design.paletteOverrides` with the ratio and the date). Apply is one change to the design, so one undo restores the previous colours. `palette/check.py` stays the build gate for `palette/tokens.json`.

**What do I provide?**

- 6 to 10 colours, hex codes (`#1f6f5c`).
- Required roles: main colour, accent, text, background. Recommended: a secondary text colour and one alert colour for warnings.
- Dark text on a light background (7:1 text, 4.5:1 secondary).
- Formats: lines of `#hex name`; JSON (`{ "colors": { "primary": "#…" } }` or DTCG tokens); CSS custom properties (`--primary: #…`); Adobe Swatch Exchange `.ase` (RGB entries); an image of swatches (large flat squares on one background, no gradient, shadow or text; at most 10 colours are read).
- Example: `palette/example-import.json` (also downloadable from the panel).

## Print geometry (tokens in `typography/tokens.json`)
A4 210 × 297 mm portrait; margins top 18, bottom 16, sides 16 mm; the cover is full-bleed (`page.cover-margin` 0) with a 20 mm spine on the start side; bleed 0 (office print, no trim). One landscape sheet for the workflow figure with margins 14 / 12 mm and a 140 mm art height. Full-width bands negate the side margin token so they always meet the trim.

## Editor-only elements
The tool watermark, toolbars, selection rings and focus outlines exist only in the editor UI (`@media screen` and editor chrome). The print stylesheet hides them and every exporter strips them; the watermark-absent gate checks every output.
