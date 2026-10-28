# Business-Wrap, the public site

Static pages for https://nj-burrito.github.io/Business-Wrap/, deployed by `.github/workflows/pages.yml` on every push to `main`. No build step on the server.

- Edit the templates in `tools/site/pages/`, then run `node tools/site/build.mjs` (writes `site/*.html`); `--check` fails when the built pages are stale.
- Every page carries the English and the Arabic block; `assets/boot.js` picks one (`?lang=ar|en`, the saved choice, or the browser language) before paint. Change both blocks together.
- Brand v2 ("Ledger & Highlighter"): `assets/tokens.css`, `assets/icons.css`, `assets/logo/`, the favicons and `og.png` / `social-card.png` are copies from `brand/v2/`; icons are inlined from `tools/site/icons/` so their micro-animations run.
- Fonts: `assets/thmanyah.css` holds Thmanyah Sans 400/700 and Serif Display 700 as base64 `data:` URIs, because the security gate refuses loose font files. Cairo is banned.
- Security: a meta CSP with `script-src 'self'` and no inline script (the JSON-LD block is data, not script), no third-party request, no cookies.
- Motion: scroll reveals, the highlighter sweep once per section, icon animations, cross-page view transitions; all off under reduced motion.
- Pending media: the hero GIF/MP4 and the GitHub banner from `brand/v2/motion/` go to `assets/media/`; until then the hero shows `assets/social-card.png`.
