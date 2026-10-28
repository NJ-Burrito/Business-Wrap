# Business-Wrap, the public site

Static pages for https://nj-burrito.github.io/Business-Wrap/ (English) and https://nj-burrito.github.io/Business-Wrap/ar/ (Arabic), deployed by `.github/workflows/pages.yml` on every push to `main`. No build step on the server.

- Edit the templates in `tools/site/pages/`, then run `node tools/site/build.mjs`: it writes `site/<page>.html`, `site/ar/<page>.html`, `site/sitemap.xml` and copies the brand files; `--check` fails when anything is stale.
- One source per page holds both languages: elements with `data-l="en"` or `data-l="ar"` are kept in their own edition and removed from the other. Change both together. Public Arabic carries no tashkeel (the build refuses it).
- `{{version}}` comes from `package.json`; `node update/version-sync.mjs` fails when the built site or its JSON-LD says another version.
- Brand v3 ("Cover & Rule"): `assets/tokens.css`, `assets/icons.css`, the favicons and `og.png` / `og-ar.png` / `social-card.png` are copies from `brand/v3/` made by the build (the `ASSETS` map). `site.css` uses `var(--bw-*)` only, never a colour literal.
- Fonts: `assets/fonts/thmanyah-{sans-400,sans-700,serif-display-700}.woff2`, the only three font paths the security gate allows on the site. Cairo is banned.
- Security: a meta CSP with `script-src 'self'` and no inline script (the JSON-LD block is data), `font-src 'self'`, no third-party request, no cookies; localStorage keeps the theme only.
- Motion (tokens in `tokens.css`): the masthead mark builds once, the hero cover object builds once, sections reveal once, The Rule draws under one phrase per view, cross-page view transitions move the spine between `/` and `/ar/`. Under reduced motion nothing moves and the video is not played.
- `404.html` is bilingual with absolute paths (Pages serves it for any missing address).
