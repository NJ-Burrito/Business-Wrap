# Typography, spacing, rules and page geometry (EN) — pair: README.ar.md

**Verdict:** one token file, `tokens.json`, holds every size, weight, line height, space, rule thickness and page measure. A template never carries a hard-coded `pt` or `mm`; a document drifts off its standard one hard-coded value at a time.

## Size scale (print pt)
| Token | pt | Use |
|---|---|---|
| `font.size.title` | 24 | cover title (display, 900) |
| `font.size.h1` | 18 | chapter heading, bold |
| `font.size.h2` | 16 | subheading, bold |
| `font.size.h3` | 14 | deeper subheading, bold |
| `font.size.body` | 14 | body text |
| `font.size.table` | 12 | table text, screen mock-ups, figure captions |
| `font.size.meta` | 10 | control-table labels |
| `font.size.micro` | 9 | running head, footer, cover strapline |

Line height: body 1.8 · table 1.5 · title 1.3 · card head 1.4. Kerning off (Arabic pair kerning opened gaps that text extraction read as spaces).

## Space (mm)
Paragraph after 3.5 · chapter heading after 7 · subheading 7 before / 3 after · deeper heading 9 before · table after 7 · cell 2.5 block / 3 inline · header cell 2 after.

## Rules
| Token | Thickness | Colour role | DOCX `w:sz` (eighths of a point) |
|---|---|---|---|
| `rule.table-head` | 1.2 pt | primary | 10 |
| `rule.table-row` | 0.75 pt (1 px) | rule | 4 |
| `rule.cover` | 0.75 pt | rule-strong | 4 |

## Page geometry (mm)
| Token | Value |
|---|---|
| `page.width` × `page.height` | 210 × 297 (A4 portrait) |
| `page.margin-top` / `-bottom` / `-side` | 18 / 16 / 16 |
| `page.cover-margin` | 0 (full-bleed cover) |
| `page.bleed` | 0 (office print, no trim bleed) |
| `page.wide-margin-top` / `-bottom` | 14 / 12 (the one landscape figure sheet) |
| `page.cover-spine-width` | 20 |
| `page.figure-art-height` | 140 |

## Units
DTCG allows only `px`/`rem`, so each token's `$value` is the screen px (1 pt = 4/3 px, 1 mm = 3.7795 px) and `$extensions.business-wrap.print` holds the exact print value the renderer uses.
