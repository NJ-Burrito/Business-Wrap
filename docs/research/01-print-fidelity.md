# HTML to print fidelity (CSS Paged Media, Chrome print, RTL)

Retrieved 2026-10-27. Grades: [V] read at the URL, [A] inferred, falsifiable.

## Verdict
Chrome's own print engine is the PDF renderer, so the editor and the PDF share one HTML+CSS template. Paged.js is only needed for preview pagination inside a normal browser tab.

| Claim | Grade | Source |
|---|---|---|
| From Chrome 131, CSS can put content into the 16 page-margin boxes (`@top-left` … `@bottom-right`) with `content`, and `counter(page)` / `counter(pages)` work there | V | https://developer.chrome.com/blog/print-margins |
| `string-set`, `target-counter` and `float: footnote` are not supported yet in Chrome (listed as future work) | V | https://developer.chrome.com/blog/print-margins |
| Browser header/footer content appears when margins leave room; margins of 0 suppress it | V | https://developer.chrome.com/blog/print-margins |
| Margin boxes went through W3C TAG design review | V | https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/918 |
| Paged.js polyfills the W3C Paged Media and Generated Content modules in the browser, rewriting `@page` rules into page boxes; running headers via `running()` / `element()` | V | https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/README.md , https://pagedjs.org/posts/en/our-position-paper-for-the-w3c-css-print-workshop/ |
| Paged.js can mis-split tables with `<thead>` across pages | A (secondary) | https://pdfmonkey.io/docs/code-templates/header-and-footer/ |
| Skia (Chrome's PDF backend) gave up embedding CFF-flavoured OpenType: CFF fonts are forced onto the Type 3 fallback path | V | https://skia.googlesource.com/skia.git/+/3541cdf2fae66d3ab4299eaeba20d234d2f7c84c |
| Letter-spacing on Arabic visibly breaks the joined script; kashida is the typographic way to fill a line | V | https://lists.w3.org/Archives/Public/www-style/2013Jun/0301.html |
| `text-justify: kashida` is not shipped in Chromium; a 2026 Intent to Prototype keeps it behind flags; justification falls back to word spacing | V | https://groups.google.com/a/chromium.org/g/blink-dev/c/WtV5cKOvhhc |

## What Business-Wrap does with it
1. One template. The editor shows the print stylesheet under `@media screen` with page frames; export prints the same file with headless Chrome (`printToPDF`, `preferCSSPageSize: true`).
2. Fonts are converted to TrueType (glyf outlines) for printing, because CFF outlines come out as Type 3 and a font-coverage audit cannot then see which face drew a glyph. See `fonts/README.md`.
3. Fonts are inlined as base64 `data:` URIs and printing waits for `document.fonts.ready`: a `file://` subresource on a `setContent` page can be refused silently (source pipeline failure catalogue, internal).
4. No `letter-spacing` on Arabic runs; justify only long table cells (`text-justify: inter-word`).
5. Running heads: margin boxes where Chrome 131 or later is guaranteed; otherwise Chrome's `headerTemplate`, which cannot read the stylesheet, so its colours must come from the palette tokens.
