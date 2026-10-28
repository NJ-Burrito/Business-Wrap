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
The editor embeds every chosen font (project, installed on the computer, or uploaded) as real text in the PDF and the DOCX: each face is normalised to TrueType outlines with OS/2 fsType 0 before printing and embedding, and the font's licence is the user's responsibility (owner decision, 2026-10-28).

## Contrast rules
Body text 7:1 on paper and card; secondary text, numbers, ids and tags 4.5:1; accent that carries words uses its 800 step; no information by colour alone. `palette/check.py` fails the build otherwise.

## Print geometry (tokens in `typography/tokens.json`)
A4 210 × 297 mm portrait; margins top 18, bottom 16, sides 16 mm; the cover is full-bleed (`page.cover-margin` 0) with a 20 mm spine on the start side; bleed 0 (office print, no trim). One landscape sheet for the workflow figure with margins 14 / 12 mm and a 140 mm art height. Full-width bands negate the side margin token so they always meet the trim.

## Editor-only elements
The tool watermark, toolbars, selection rings and focus outlines exist only in the editor UI (`@media screen` and editor chrome). The print stylesheet hides them and every exporter strips them; the watermark-absent gate checks every output.
