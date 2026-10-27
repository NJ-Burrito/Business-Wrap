# Logos (EN) — pair: README.ar.md

**Verdict:** this folder ships EMPTY. Business-Wrap carries no organisation's logo. You add your own; they are gitignored.

## Document logo slots
| Slot | Where it shows | Recommended file | Size on page |
|---|---|---|---|
| `start` | cover, start side of the top band (right in Arabic, left in English) | SVG, or PNG at 600 px wide | max 40 mm wide × 18 mm high |
| `center` | cover, centre of the top band | SVG / PNG 600 px | max 50 × 18 mm |
| `end` | cover, end side of the top band | SVG / PNG 600 px | max 40 × 18 mm |
| `header` | running head on every body page | SVG, or PNG at 300 px wide | max 24 × 8 mm |

Formats: SVG preferred (sharp at any size, small); PNG with a transparent background otherwise. No JPEG for logos. Strip metadata before adding (the security gate fails on EXIF/XMP/PNG text chunks). Under 5 MB each.
Set a slot in the theme: `"logos": {"start": "logos/mine.svg"}`, or pick the file in the editor. An empty slot prints nothing; no placeholder box.

## The tool watermark is NOT a logo slot
The editor shows the tool's own watermark in its interface only. It never appears in any output: PDF, DOCX, print, edits JSON, theme pack or a Save-HTML export. It lives with the editor (`editor/`), not here, and the document slots above stay empty for the user.
