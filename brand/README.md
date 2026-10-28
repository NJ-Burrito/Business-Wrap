# Business-Wrap brand (EN) · pair: [README.ar.md](README.ar.md)

⚡ **In 10 seconds**
- 🟦 The current brand is **v3, "Cover and Rule"**: everything lives in [`v3/`](v3/).
- 🖼️ See it on one page: the brand board [`v3/index.html`](v3/index.html).
- 📘 Rules: [`v3/BRAND.md`](v3/BRAND.md) · [`v3/BRAND.ar.md`](v3/BRAND.ar.md).
- 🧾 v1 and v2 are retired; git history keeps them.

| What | Where |
|---|---|
| 🎨 Tokens (`--bw-*`, light and dark) | [`v3/tokens-v3.css`](v3/tokens-v3.css), [`v3/tokens-v3.json`](v3/tokens-v3.json), [`v3/dark/tokens-v3.dark.json`](v3/dark/tokens-v3.dark.json) |
| 📊 Contrast, every pair | [`v3/contrast-v3.md`](v3/contrast-v3.md) |
| 🔖 Logo, lockups, wordmarks, animated mark | [`v3/logo/`](v3/logo/) |
| 🧩 Icons (22), sprite, CSS | [`v3/icons/`](v3/icons/) |
| ⭐ Favicons and app icons | [`v3/favicon/`](v3/favicon/) |
| 🪧 Social card and og images | [`v3/social/`](v3/social/) |
| 🛠️ Builders and the brand gate | [`v3/tools/`](v3/tools/) |

The brand is the tool's only: it never appears in a document output (PDF, DOCX, print, edits JSON, design pack, Save-HTML export). Documents keep their own design pack.

Rebuild everything (local Thmanyah files needed for the wordmark and the PNGs):

```
python brand/v3/tools/build_tokens_v3.py palette/tokens.json brand/v3
uv run --no-project --with fonttools --with uharfbuzz python brand/v3/tools/build_logo.py
python brand/v3/tools/build_icons.py
uv run --no-project --with playwright --with pillow python brand/v3/tools/export_png.py
python brand/v3/tools/build_board.py
uv run --no-project --with pillow python brand/v3/tools/check_brand.py
```
