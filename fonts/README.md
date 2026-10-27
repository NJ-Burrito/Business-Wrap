# Fonts (EN) — pair: README.ar.md

**Verdict:** this folder ships a manifest, never a font file. You point Business-Wrap at your own licensed copy.

| Family | Role | Used for | Weights |
|---|---|---|---|
| Thmanyah Serif Text | text | body, tables, dictionaries, story cards | 400 body · 500 subheads · 700 table heads |
| Thmanyah Serif Display | display | cover title, headings, chapter chips, spine code | 700 headings · 900 cover title only |
| Thmanyah Sans | ui | editor interface only, never in a document | 400 / 700 |

300 (Light) is used only where a design already uses it. **Cairo is banned**, also as a fallback.

## Set it up (once per machine)
1. Get the Thmanyah family from its publisher under its licence.
2. Put it in one folder with `thmanyahseriftext/`, `thmanyahserifdisplay/`, `thmanyahsans/`, each holding `otf/` and `woff2/`.
3. Set the folder as an environment variable (PowerShell, current user):
   `[Environment]::SetEnvironmentVariable('BW_FONT_DIR', '<your font folder>', 'User')`
4. Convert to TrueType for printing (next section) and set `BW_FONT_TTF_DIR` to the output folder.

## Why TrueType for print
Chrome's PDF backend (Skia) prints CFF outlines (`.otf`, `.woff2`) as Type 3 glyph procedures with no font name. A font-coverage audit then cannot see a fallback face that drew a glyph, which is how silent substitution ships. TrueType (glyf) outlines embed as real, named fonts. Convert with fontTools (`uvx --from fonttools ...` with an otf-to-ttf script) into a local folder; never commit the result. Source: `docs/research/01-print-fidelity.md`.

## Licence rules (summary, not legal advice)
- Allowed: using the fonts and embedding them in documents you create (subset in a PDF, embedded in a DOCX).
- Not allowed: redistributing, hosting, web-serving or otherwise enabling extraction of the files; modifying them. A local TrueType conversion for printing is the owner's documented decision; keep the files local.
- So: `.gitignore` blocks `*.otf *.ttf *.ttc *.woff *.woff2 *.eot`, and `security/check.py` fails on any font binary by extension or by magic bytes, in the tree or in history.

## Upload slot
`fonts/custom/` takes a user's own fonts for a custom design pack. It is gitignored; only its README is tracked. Add the family to a copy of `manifest.json` inside your pack.
