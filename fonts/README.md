# Fonts (EN) · pair: README.ar.md

## ⚡ In 10 seconds

🎯 Documents use the Thmanyah families. **Cairo is banned**, also as a fallback.

🏠 **Your own copy wins:** `BW_FONT_DIR`, then `.local/config.json`, then the system font folder.

🎁 **No copy on this machine?** The bundled fallback in `fonts/nj-fonts/` is used, so a fresh install prints right.

⚖️ `fonts/nj-fonts/` is the owner's licensed Thmanyah copy, under the **Thmanyah licence, not MIT**.

**Jump to:** [🔤 Families](#-families) · [🏠 Use your own copy](#-use-your-own-copy) · [🎁 The bundled fallback](#-the-bundled-fallback) · [📜 Licence](#-licence) · [📤 Upload slot](#-upload-slot)

## 🔤 Families

| Family | Role | Used for | Weights |
|---|---|---|---|
| Thmanyah Serif Text | text | body, tables, dictionaries, story cards | 400 body · 500 subheads · 700 table heads |
| Thmanyah Serif Display | display | cover title, headings, chapter chips, spine code | 700 headings · 900 cover title only |
| Thmanyah Sans | ui | editor interface only, never in a document | 400 / 700 |

300 (Light) is used only where a design already uses it.

## 🏠 Use your own copy

1️⃣ Get the Thmanyah family from its publisher under its licence.

2️⃣ Put it in one folder with `thmanyahseriftext/`, `thmanyahserifdisplay/`, `thmanyahsans/`, each holding `otf/` and `woff2/`.

3️⃣ Point Business-Wrap at it (PowerShell, current user):
`[Environment]::SetEnvironmentVariable('BW_FONT_DIR', '<your font folder>', 'User')`
or put `{"fontDir": "<your font folder>"}` in the gitignored `.local/config.json`.

4️⃣ Convert Serif Text and Serif Display to TrueType into `<family>/ttf/`, keeping the originals:
`uv run --with fonttools --with cu2qu python otf-to-ttf.py <family>/otf/*.otf`

<details>
<summary>🖨️ Why TrueType for print</summary>

Chrome's PDF backend (Skia) prints CFF outlines (`.otf`, `.woff2`) as Type 3 glyph procedures with no font name. A font-coverage audit then cannot see a fallback face that drew a glyph, which is how silent substitution ships. TrueType (glyf) outlines embed as real, named fonts. The manifest searches `ttf/` first. Source: `docs/research/01-print-fidelity.md`.

</details>

## 🎁 The bundled fallback

📁 `fonts/nj-fonts/thmanyah/<family>/<otf|ttf|woff2>/`: Serif Text and Serif Display in otf, ttf and woff2; Sans in otf and woff2.

🔚 It is the **last** entry of `fontDirs` in `manifest.json` (its `ttf/` folders first). `${BW_ROOT}` there means the repo or plugin root.

🔐 `security/check.py` and `security/gitleaks.toml` allow font binaries at exactly that path. Any font file anywhere else still fails the gate, in the tree and in history.

## 📜 Licence

📄 The code is MIT (`LICENSE`). The font files are not: each keeps its publisher's licence.

✅ Allowed: using the fonts and embedding them in documents you create (subset in a PDF, embedded in a DOCX).

🚫 Not allowed: modifying the files, or redistributing them outside what the licence permits.

🧾 `fonts/nj-fonts/` is shipped by the owner under his licence for Thmanyah. Your own fonts never enter the repo: `.gitignore` blocks `*.otf *.ttf *.ttc *.woff *.woff2 *.eot` everywhere else.

*Summary, not legal advice.*

## 📤 Upload slot

`fonts/custom/` takes your own fonts for a custom design pack. It is gitignored; only its README is tracked. Add the family to a copy of `manifest.json` inside your pack.
