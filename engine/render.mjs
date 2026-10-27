// Business-Wrap document renderer — browser + Node, no dependencies.
//
// A port of the source SRS pipeline's print renderer (its `html()` and helpers,
// 2026-10-27) with every client part taken out:
// palette, fonts, logos and every printed label come in as arguments.
// The markup and the stylesheet are the print layout itself — the editor shows
// this exact HTML, and the PDF export prints this exact HTML — so the editor
// cannot drift from the PDF.
//
// Additions over the source: every text leaf carries `data-p` (an RFC 6901
// pointer into the document JSON), every block's top elements carry `data-b`,
// tables carry `data-rows` / `data-cols`, cells `data-r` / `data-c`. Attributes
// do not move a line, so the editor's markup and the printed markup are one.

const NL = '\n';
const KEEP_ROWS = 3;
const GROUPABLE_ROWS = 12;
const PLAIN = '@@bw-plain@@';

export const PAGE = {
  // A4 less the vertical page margins, and less the side padding — the measure.
  contentPx: Math.round(((297 - 18 - 16) / 25.4) * 96),
  measurePx: Math.round(((210 - 16 - 16) / 25.4) * 96),
  relaxAbove: 0.35,
  fillFloor: 0.4,
  keepRows: KEEP_ROWS,
};

const esc = (t) =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (t) => esc(t).replace(/"/g, '&quot;');

/** RFC 6901 pointer from parts. */
export const ptr = (...parts) =>
  parts.map((p) => '/' + String(p).replace(/~/g, '~0').replace(/\//g, '~1')).join('');
const dp = (p) => (p ? ` data-p="${attr(p)}"` : '');

/* ── text polish + bidi isolation (port of src/support/bidi.ts, locale-aware) ── */

export function polish(text, locale = 'ar') {
  const AR = '؀-ۿ';
  let s = String(text ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ـ+/g, '')
    .replace(/[☐☑☒□■]\s*/g, '• ');
  if (locale === 'ar') {
    s = s
      .replace(/\s+[—–]\s+/g, '، ')
      .replace(/\s*[←→⟶⟵]\s*/g, '، ')
      .replace(/[ً-ْ]/g, '')
      .replace(/\s+([،؛:.!؟%])/g, '$1')
      .replace(/([،؛])(?=[^\s،؛.)\]»])/g, '$1 ')
      .replace(/([«([])\s+/g, '$1')
      .replace(/\s+([»)\]])/g, '$1')
      .replace(new RegExp(`([${AR}])\\s*,\\s*(?=[${AR}])`, 'g'), '$1، ')
      .replace(/(\S)«/g, '$1 «')
      .replace(new RegExp(`»(?![،؛؟٫٬])(?=[${AR}A-Za-z0-9])`, 'g'), '» ');
  } else {
    s = s.replace(/\s+([,;:.!?%])/g, '$1');
  }
  return s.replace(/ {2,}/g, ' ').trim();
}

export function makeBidi(locale) {
  if (locale !== 'ar') return (text) => esc(polish(text, locale));
  const run =
    /[([{]?[A-Za-z0-9][A-Za-z0-9\s.,;:!?+\-_/\\()[\]{}|&%'"@#]*[A-Za-z0-9\])}]|[([{]?[A-Za-z0-9][)\]}]?/g;
  const PARTNER = { '(': ')', '[': ']', '{': '}' };
  const paired = (t) => (t[0] in PARTNER ? (t.endsWith(PARTNER[t[0]]) ? t : t.slice(1)) : t);
  return (text) => {
    const raw = polish(text, 'ar');
    let out = '';
    let last = 0;
    for (const m of raw.matchAll(run)) {
      const at = m.index ?? 0;
      const iso = paired(m[0]);
      out += esc(raw.slice(last, at + (m[0].length - iso.length)));
      out += `<bdi dir="ltr">${esc(iso)}</bdi>`;
      last = at + m[0].length;
    }
    return out + esc(raw.slice(last));
  };
}

/** Inline SVG from a document is data, not code: scripts, handlers, foreign objects and js: links go. */
export const safeSvg = (svg) =>
  String(svg ?? '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href\s*=\s*["']?)\s*javascript:[^"'\s>]*/gi, '$1#');

/** Only re-encoded raster data URIs reach a page (the editor re-encodes every image it accepts). */
export const SAFE_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const blank = (c) => ['', '—', '-', '–', 'N/A', 'n/a'].includes(String(c ?? '').trim());

/* ── the renderer ─────────────────────────────────────────────────────────── */

/**
 * @param doc     document JSON (DocumentCheckpoint shape, see samples/)
 * @param o.locale   'ar' | 'en'
 * @param o.labels   printed labels for this locale (engine/i18n.json → doc.<locale>)
 * @param o.theme    { vars: {cssVar: value}, fonts: {text, display}, brand: {producer, confidential} }
 * @param o.fontCss  @font-face rules
 * @param o.logos    { start, center, end, header } data URIs ('' = empty slot)
 * @param o.tocSplit contents split row (0 = none)
 * @param o.extraHead extra markup for <head> (editor stylesheet), '' for print
 * @param o.extraBody extra markup at the end of <body> (editor app), '' for print
 */
export function renderDocument(doc, o) {
  const locale = o.locale || 'ar';
  const L = o.labels;
  const bidi = makeBidi(locale);
  const theme = o.theme;
  const logos = o.logos || {};
  const parts = renderParts(doc, { ...o, locale, bidi, L });

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.control.title)}</title>
<style id="bw-fonts">
${o.fontCss || ''}
</style>
<style id="bw-doc-css">
${documentCss(theme, parts.sheet)}</style>
${o.extraHead || ''}</head>
<body>
${documentMain(parts, logos, locale)}
${o.extraBody || ''}
</body></html>`;
}

/** The print stylesheet. Depends on the theme and the widest figure sheet only. */
const sz = (v, d) => (/^\d+(\.\d+)?(pt|px|mm)$/.test(String(v)) ? v : d);
const safeFamily = (f) => String(f || '').replace(/[^\w\s-]/g, '');
const safeToken = ([k, v]) => /^[a-z0-9-]+$/.test(k) && /^[#a-zA-Z0-9(),.\s%-]+$/.test(String(v));
export function documentCss(theme, sheet) {
  const text = `'${safeFamily(theme.fonts.text)}'`;
  const display = `'${safeFamily(theme.fonts.display || theme.fonts.text)}'`;
  const vars = Object.entries(theme.vars).filter(safeToken).map(([k, v]) => `  --${k}:${v};`).join(NL);
  const paper = safeToken(['paper', theme.vars.paper]) ? theme.vars.paper : '#fff';
  const PAGE_ART_MM = 140;
  return `*{box-sizing:border-box}
:root{
${vars}
  --t-title:${sz(theme.sizes?.title, '24pt')};
  --t-h1:${sz(theme.sizes?.h1, '18pt')};
  --t-h2:${sz(theme.sizes?.h2, '16pt')};
  --t-h3:${sz(theme.sizes?.h3, '14pt')};
  --t-body:${sz(theme.sizes?.body, '14pt')};
  --t-table:${sz(theme.sizes?.table, '12pt')};
  --t-meta:${sz(theme.sizes?.meta, '10pt')};
  --t-micro:${sz(theme.sizes?.micro, '9pt')};
  --page-side:16mm;
}
body{font-family:${text},system-ui,sans-serif;
  color:var(--ink);margin:0;line-height:1.8;font-size:var(--t-body);font-kerning:none}
h1,h2,h3,h4,h5,h2 .num,.kicker,.spine .id,caption.story-head{font-family:${display},${text},system-ui,sans-serif}
.cover h1{font-weight:900}
svg text{font-family:${text},system-ui,sans-serif}
h1{font-size:var(--t-title);font-weight:700;line-height:1.3;margin:0}
h2{font-size:var(--t-h1);font-weight:700;margin:0 0 7mm;color:var(--primary);break-before:auto;
  break-after:avoid;display:flex;align-items:center;gap:5mm;
  padding-bottom:4mm;border-bottom:2px solid var(--accent-rule)}
h2 .num{flex:0 0 auto;width:11mm;height:11mm;background:var(--primary);color:#fff;font-weight:700;
  font-size:var(--t-h3);display:flex;align-items:center;justify-content:center;line-height:1}
h3{font-size:var(--t-h2);font-weight:700;margin:7mm 0 3mm;color:var(--ink);break-after:avoid}
h3 .sn{color:var(--accent);font-weight:700;margin-inline-end:3mm}
h4{font-size:var(--t-h3);font-weight:700;margin:9mm 0 0;color:var(--primary);break-after:avoid;
  border-top:2px solid var(--accent-rule);background:var(--card);
  margin-inline:calc(0mm - var(--page-side));padding:4mm var(--page-side) 0}
p{margin:0 0 3.5mm}
table{width:100%;border-collapse:collapse;font-size:var(--t-table);line-height:1.5;margin:0 0 7mm;
  table-layout:fixed}
thead{display:table-header-group}
th{text-align:start;background:none;color:var(--primary);font-weight:700;padding:0 3mm 2mm;
  font-size:var(--t-table);border-bottom:1.2pt solid var(--primary)}
td{text-align:start;padding:2.5mm 3mm;vertical-align:top;border-bottom:1px solid var(--rule)}
td.long{text-align:justify;text-justify:inter-word}
td,th{word-break:normal;overflow-wrap:normal;hyphens:none}
td bdi,th bdi{overflow-wrap:anywhere}
tbody tr:last-child td{border-bottom:1px solid var(--rule-strong)}
tr{break-inside:avoid}
table.control{font-size:var(--t-table)}
table.control th{background:none;color:var(--muted);font-weight:400;width:42%;
  border-bottom:1px solid var(--rule);padding:2mm 0;font-size:var(--t-table)}
table.control td{font-weight:700;border-bottom:1px solid var(--rule);padding:2mm 0}
.cover{page:cover;color:var(--ink);height:297mm;break-after:page;overflow:hidden;
  display:grid;grid-template-columns:20mm 1fr;grid-template-rows:1fr}
.spine{grid-column:1;grid-row:1;background:var(--primary-deep);position:relative;
  margin-inline-start:-8mm;margin-top:-8mm;padding-top:8mm;
  margin-bottom:14mm;display:flex;align-items:center;justify-content:center}
.spine .id{writing-mode:vertical-rl;transform:rotate(180deg);color:var(--accent-bright);
  font-size:var(--t-table);font-weight:700;letter-spacing:.28em}
.spine .cap{position:absolute;top:0;inset-inline:0;height:28mm;background:var(--accent-bright)}
.cover-main{grid-column:2;grid-row:1;display:flex;flex-direction:column}
.lockup{padding:17mm 16mm 0;display:flex;align-items:center;justify-content:space-between;gap:6mm;min-height:46mm}
.lockup img{display:block}
.lockup .logo-start{height:27mm}
.lockup .logo-center{height:14mm;margin-top:9mm}
.lockup .logo-end{height:29mm}
.cover-rule{margin:10mm 16mm 0;height:1px;background:var(--rule-strong)}
.cover-body{flex:1;padding:0 16mm 30mm;display:flex;flex-direction:column;justify-content:center}
.kicker{font-size:var(--t-table);font-weight:700;color:var(--accent);margin-bottom:5mm;letter-spacing:.10em}
.rule-short{width:30mm;height:3px;background:var(--accent-rule);margin-bottom:7mm}
.cover h1{color:var(--ink)}
.cover .subtitle{font-size:var(--t-table);font-weight:400;color:var(--muted);margin-top:6mm;letter-spacing:.01em}
.cover-foot{margin:0 16mm;padding:5mm 0 14mm;display:flex;justify-content:space-between;
  font-size:var(--t-table);color:var(--muted);border-top:1px solid var(--rule-strong)}
.story{--card-pad-x:5mm;
  border:1px solid var(--rule-strong);border-radius:3mm;padding:4mm var(--card-pad-x);
  margin:0;background:var(--card)}
.story + .story,
section.sec + section.sec > .story:first-child{margin-top:3mm}
.story.part-first{margin-bottom:0;padding-bottom:3mm;border-end-start-radius:0;border-end-end-radius:0}
.story.part-mid{margin-top:-1px;margin-bottom:0;padding:3mm var(--card-pad-x);border-radius:0}
.story.part-last{margin-top:-1px;padding-top:3mm;border-start-start-radius:0;border-start-end-radius:0}
.story.part-mid > .dict-label:first-child,.story.part-last > .dict-label:first-child{margin-top:0}
.story.plain{--card-pad-x:0mm;background:none;border:0;border-radius:0;padding:0}
.story.plain > table.dict{border-inline:1px solid var(--rule-strong)}
.story.plain > table.dict > tbody:last-of-type > tr:last-child > td{border-bottom:1px solid var(--rule-strong)}
caption.story-head{font-size:var(--t-h2);font-weight:700;color:var(--primary);
  padding-bottom:3mm;margin-bottom:0;line-height:1.4}
caption.story-head .sn{color:var(--accent);font-weight:700;margin-inline-end:3mm}
.run-in{font-size:var(--t-table);font-weight:700;color:var(--primary);
  border-inline-start:2px solid var(--accent-rule);padding-inline-start:2.5mm;
  margin:0 0 2.5mm;break-after:avoid}
.cards-label{margin-top:0}
.dict-label{margin-top:4mm}
.story-info{margin-bottom:0;table-layout:fixed}
table.control.story-info th,table.control.story-info td{border:1px solid var(--rule);
  padding:2.5mm 3mm;font-size:var(--t-table);vertical-align:top}
table.control.story-info th{color:var(--ink);font-weight:700;background:var(--primary-50);width:auto}
table.control.story-info td{font-weight:400;background:var(--paper)}
.story-info tr.ac,.story-info tr.ac td,.story-info tr.ac th{break-inside:auto}
.story-info tr.ac ol{margin:0;padding-inline-start:8mm;max-width:none;list-style:decimal}
.story-info tr.ac li{margin-bottom:1.2mm}
.story-info tr.ac li::marker{color:var(--accent);font-weight:700}
table.dict{margin-inline:calc(0mm - var(--card-pad-x, 5mm));margin-block:0;
  width:calc(100% + var(--card-pad-x, 5mm) * 2);font-size:var(--t-table)}
table.dict th,table.dict td{border:1px solid var(--rule);padding:2mm 3mm}
table.dict th{background:var(--primary-100);color:var(--primary);border-bottom:1px solid var(--rule-strong)}
table.dict td{background:var(--paper)}
table.dict tr.alt td{background:var(--primary-50)}
table.dict tbody tr:last-child td{border-bottom:1px solid var(--rule)}
.gap{border-top:2px solid var(--signal);background:var(--signal-wash);
  padding:3mm var(--page-side);margin:0 0 5mm;
  margin-inline:calc(0mm - var(--page-side));break-inside:avoid}
.gap-tag{display:inline-block;background:var(--signal);color:#fff;font-size:var(--t-meta);
  border-radius:2px;padding:.8mm 2.5mm;margin-bottom:1.5mm;letter-spacing:.04em}
.toc td{border:0;border-bottom:1px solid var(--rule);padding:2.2mm 3mm;font-size:var(--t-table)}
table.toc-cont{break-before:page}
table.headed{break-before:auto}
.toc-chapter td{font-weight:700;color:var(--primary);border-bottom:1px solid var(--rule-strong)}
.toc-chapter td:first-child{color:var(--accent)}
.toc-card td:last-child{padding-inline-start:6mm;color:var(--muted)}
p,ul,ol{max-width:150mm}
ul{margin:6px 0;padding-inline-start:18px}
ul.run + ul.run{margin-top:0}
ul.run:has(+ ul.run){margin-bottom:0}
li{margin:3px 0}
section.chapter + section.chapter > h2{margin-top:12mm}
section.chapter.wide > h2{margin-top:0}
section.chapter.wide + section.chapter > h2{margin-top:0}
.fig{margin:10px 0 16px;break-inside:avoid;text-align:center}
.fig-art{border:1px solid var(--rule-strong);border-radius:2px;padding:10px;background:#fff}
.fig-art svg{max-width:100%;max-height:${sheet.drawHeightMm}mm;width:auto;height:auto;display:block;margin:0 auto}
.fig.sheet{height:${PAGE_ART_MM}mm;display:flex;flex-direction:column;margin:10px 0 0}
.fig.sheet > .fig-art{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center}
.fig.sheet > .fig-art svg{max-height:100%;margin:0}
.fig.sheet.hug{height:auto;max-height:${PAGE_ART_MM}mm}
.fig.sheet.hug > .fig-art{flex:0 0 auto;display:block}
.fig.sheet.hug > .fig-art svg{width:100%;height:auto;max-height:${PAGE_ART_MM - 24}mm;margin:0}
figcaption{font-size:var(--t-table);color:var(--primary);margin:0 0 5px;font-weight:700}
.fig-note{font-size:var(--t-table);color:var(--muted);margin:4px 0 0}
@page{size:A4 portrait;margin:18mm 0 16mm;background:${paper}}
.wrap{padding-inline:var(--page-side)}
@page cover{margin:0;background:${paper}}
@page:first{margin:0;background:${paper}}
@page wide{size:${sheet.widthMm}mm ${sheet.heightMm}mm;margin:14mm 0 12mm;background:${paper}}
.wide{page:wide}
section.chapter{break-inside:auto}
h2,h3,figcaption{break-after:avoid}
.lead-in{break-after:avoid}
body,p,li,td,dd{orphans:3;widows:3}
.keep{break-inside:avoid}
tbody.hold,ul.hold,div.hold{break-inside:avoid}
.id-card{break-inside:avoid;display:inline-block;width:100%;margin-bottom:0}
.id-card+.story-info-body{margin-top:-1px}
.id-card table.story-info{margin-bottom:0}
.story-info-body tr:first-child th,.story-info-body tr:first-child td{border-top:0}
.shots{margin:6mm 0 8mm}
.shots .shot{display:block;width:100%;max-width:150mm;margin:0 auto 5mm;
  border:1px solid var(--rule-strong);break-inside:avoid}
caption{caption-side:top;text-align:start;font-size:var(--t-body);color:var(--ink);
  margin-bottom:2mm;line-height:1.7;break-after:avoid}
.whole{display:inline-block;width:100%;vertical-align:top}
.sec:has(>.whole:only-child){font-size:0;line-height:0}
.whole{font-size:var(--t-body);line-height:1.8}
table.headed>caption{margin-bottom:3mm}
table.headed>caption>h2{margin-bottom:5mm}
table.headed>caption>h3{margin-top:0}
table.headed>caption>:last-child{margin-bottom:0}
h2,h3,h4,h5{break-after:avoid}
h2+*,h3+*,h4+*,h5+*{break-before:avoid}
.lead-in+table{break-before:avoid}
table{break-before:avoid}
tbody:first-of-type tr:first-child{break-before:avoid}
figure,.fig,.gap{break-inside:avoid}
.bw-logo-slot{display:none}
.bw-break{break-before:page;height:0}
.bw-doc{position:relative}
.cover{position:relative}
.bw-anchor{position:relative;height:0;break-after:avoid}
.bw-ov{position:absolute;z-index:2;line-height:1.3}
.bw-ov img{display:block;width:100%;height:auto}
.bw-ov-cap{font-size:var(--t-meta);color:var(--muted);text-align:center;margin-top:1mm}
.bw-every{position:absolute;top:297mm;left:0;width:210mm;height:0}
@media print{.bw-every{position:static}.bw-every>.bw-ov{position:fixed}}
`;
}

export function documentMain(parts, logos, locale) {
  return `<main class="bw-doc" data-locale="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}">
${parts.cover(logos || {})}
<div class="wrap">
${parts.front}
${parts.body}
${parts.questions}
</div>
${parts.every || ''}
</main>`;
}

/** The pieces of the document body. Exported for the editor's re-render. */
export function renderParts(doc, o) {
  const locale = o.locale || 'ar';
  const L = o.L || o.labels;
  const bidi = o.bidi || makeBidi(locale);
  const none = L.none;

  // free-placed logos and images (doc.overlays): mm coordinates against their anchor
  const OV = (doc.overlays || []).map((o, i) => ({ ...o, i })).filter((o) => SAFE_IMG.test(String(o.src || '')));
  const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : d));
  const ovHtml = (o) => `<div class="bw-ov" data-ov="${attr(o.id || String(o.i))}" data-i="${o.i}" data-kind="${o.kind === 'logo' ? 'logo' : 'image'}" style="left:${num(o.x, 0, -20, 290).toFixed(2)}mm;top:${num(o.y, 0, -20, 290).toFixed(2)}mm;width:${num(o.w, 30, 4, 200).toFixed(2)}mm"><img src="${attr(o.src)}" alt="${attr(o.alt || '')}" draggable="false" />${o.caption ? `<div class="bw-ov-cap"${dp(`/overlays/${o.i}/caption`)}>${bidi(o.caption)}</div>` : ''}</div>`;
  const overlaysFor = (pred) => OV.filter(pred).map(ovHtml).join('');
  const anchorsAt = (ptrs) => {
    const hit = OV.filter((o) => o.mode === 'anchor' && ptrs.includes(o.anchor));
    return hit.length ? `<div class="bw-anchor" data-anchor="${attr(hit[0].anchor)}">${hit.map(ovHtml).join('')}</div>` : '';
  };
  const guarded = (rows, wrap) =>
    rows.length < KEEP_ROWS * 2
      ? wrap(rows, true)
      : wrap(rows.slice(0, KEEP_ROWS), true) +
        wrap(rows.slice(KEEP_ROWS, rows.length - KEEP_ROWS), false) +
        wrap(rows.slice(-KEEP_ROWS), true);
  const guardedBody = (rows) =>
    guarded(rows, (part, hold) =>
      part.length ? `<tbody${hold ? ' class="hold"' : ''}>${part.join(NL)}</tbody>` : ''
    );

  /**
   * t = { columns, rows, colsPtr, rowsPtr, extra, caption, b (block ptr), alt }
   * Column sizing exactly as the source: square root of a typical-length measure.
   */
  function table(t) {
    const columnsIn = t.columns || [];
    const rowsIn = t.rows || [];
    const width = Math.max(columnsIn.length, ...rowsIn.map((r) => r.length), 0);
    const keep = Array.from({ length: width }, (_, i) => rowsIn.some((r) => !blank(r[i])));
    const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
    const columns = columnsIn.length ? idx.map((i) => columnsIn[i] ?? '') : [];
    const rows = rowsIn.map((r) => idx.map((i) => (blank(r[i]) ? none : r[i])));
    const headings = columns.length ? columns : (rows[0] ?? []).map(() => '');
    const measure = headings.map((c, i) => {
      const lengths = rows.map((r) => String(r[i] ?? '').length).sort((a, b) => a - b);
      const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1;
      const longest = lengths.at(-1) ?? 1;
      const p90 = lengths.length
        ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))]
        : 1;
      const typical = median * 0.55 + p90 * 0.3 + longest * 0.15;
      const longestWord = Math.max(
        1,
        ...[c, ...rows.map((r) => r[i] ?? '')]
          .flatMap((cell) => String(cell).split(/\s+/))
          .map((w) => w.length)
      );
      return Math.max(
        Math.sqrt(Math.max(typical, 1)),
        Math.sqrt(String(c).length) * 1.15,
        Math.sqrt(longestWord) * 1.25,
        headings.length >= 6 ? 3.4 : 2.6
      );
    });
    const total = measure.reduce((a, b) => a + b, 0) || 1;
    const cols = measure.map((m) => `<col style="width:${((m / total) * 100).toFixed(2)}%" />`).join('');
    let n = 0;
    const meta =
      (t.b ? ` data-b="${attr(t.b)}"` : '') +
      (t.rowsPtr ? ` data-rows="${attr(t.rowsPtr)}"` : '') +
      (t.colsPtr ? ` data-cols="${attr(t.colsPtr)}"` : '') +
      ` data-w="${width}"`;
    return `<table class="${t.extra || ''}"${meta}>
  <colgroup>${cols}</colgroup>
  ${t.caption ? `<caption>${t.caption}</caption>` : ''}
  ${
    columns.length
      ? `<thead><tr>${columns
          .map((c, j) => `<th${dp(t.colsPtr && t.colsPtr + '/' + idx[j])} data-c="${idx[j]}">${bidi(c)}</th>`)
          .join('')}</tr></thead>`
      : ''
  }
  ${guardedBody(
    rows.map(
      (r, ri) =>
        `<tr${t.alt && n++ % 2 ? ' class="alt"' : ''} data-r="${ri}">${r
          .map(
            (c, j) =>
              `<td${String(c).length > 200 ? ' class="long"' : ''}${dp(
                t.rowsPtr && `${t.rowsPtr}/${ri}/${idx[j]}`
              )} data-r="${ri}" data-c="${idx[j]}">${bidi(c)}</td>`
          )
          .join('')}</tr>`
    )
  )}
</table>`;
  }

  const bulletList = (items) =>
    guarded(items, (part, hold) =>
      part.length ? `<ul class="run${hold ? ' hold' : ''}">${part.join('')}</ul>` : ''
    );

  /** paragraphs: [{text, p (pointer), b (block pointer)}] */
  function prose(paragraphs, b) {
    const out = [];
    let bullets = [];
    const flush = () => {
      if (!bullets.length) return;
      out.push(bulletList(bullets));
      bullets = [];
    };
    for (const para of paragraphs) {
      const bullet = /^[•–-]\s+/.exec(para.text);
      if (bullet) {
        bullets.push(
          `<li data-b="${attr(b)}"${dp(para.p)} data-pfx="${attr(bullet[0])}">${bidi(para.text.slice(bullet[0].length))}</li>`
        );
        continue;
      }
      flush();
      out.push(`<p data-b="${attr(b)}"${dp(para.p)}>${bidi(para.text)}</p>`);
    }
    flush();
    const last = out.length - 1;
    if (last >= 0) {
      const block = out[last];
      const at = Math.max(block.lastIndexOf('<p '), block.lastIndexOf('<ul'));
      const close = at < 0 ? -1 : block.indexOf('>', at);
      if (close > 0) {
        const tag = block.slice(at, close);
        out[last] =
          block.slice(0, at) +
          (tag.includes('class="') ? tag.replace('class="', 'class="lead-in ') : `${tag} class="lead-in"`) +
          block.slice(close);
      }
    }
    if (out.length <= KEEP_ROWS * 2) return out.join(NL);
    return [
      `<div class="hold">${out.slice(0, KEEP_ROWS).join(NL)}</div>`,
      out.slice(KEEP_ROWS, out.length - KEEP_ROWS).join(NL),
      `<div class="hold lead-in">${out.slice(-KEEP_ROWS).join(NL)}</div>`,
    ].join(NL);
  }

  const paras = (block, b) =>
    (block.paragraphs || []).map((text, k) => ({ text: String(text), p: `${b}/paragraphs/${k}` }));

  const tableOf = (block, b, extra = '', caption = '') =>
    table({
      columns: (block.columns || []).map(String),
      rows: (block.rows || []).map((r) => r.map(String)),
      colsPtr: `${b}/columns`,
      rowsPtr: `${b}/rows`,
      extra,
      caption,
      b,
    });

  function renderBlock(block, b) {
    switch (block.kind) {
      case 'prose':
        return prose(paras(block, b), b);
      case 'subhead':
        return `<h4 data-b="${attr(b)}"${dp(b + '/text')}>${bidi(block.text)}</h4>`;
      case 'table':
        return tableOf(block, b);
      case 'figure':
        return `<figure class="fig${block.sheet ? ' sheet' : ''}${block.compact ? ' hug' : ''}" data-b="${attr(b)}">
  <figcaption${dp(b + '/caption')}>${bidi(block.caption)}</figcaption>
  <div class="fig-art">${safeSvg(block.svg)}</div>
  ${block.note ? `<p class="fig-note"${dp(b + '/note')}>${bidi(block.note)}</p>` : ''}
</figure>`;
      case 'shots':
        return `<figure class="fig shots" data-b="${attr(b)}">
  ${(block.images || []).map((src) => (String(src).startsWith('data:') ? `<img class="shot" src="${attr(src)}" alt="" style="width:${Math.min(100, Math.max(10, Number(block.width) || 100))}%" />` : '')).join(NL)}
  <figcaption${dp(b + '/caption')}>${bidi(block.caption)}</figcaption>
</figure>`;
      case 'stories':
        return (block.items || [])
          .map((s, i) => {
            const sp = `${b}/items/${i}`;
            // One run, as the source prints it: editing it writes the story's own `goal`
            // (the source schema's verbatim-goal field), so the PDF text order never splits.
            const goal = s.goal
              ? `<span${dp(sp + '/goal')}>${bidi(s.goal)}</span>`
              : s.as || s.want || s.so
                ? `<span${dp(sp + '/goal')}>${L.storyGoal.split(/(\{as\}|\{want\}|\{so\})/).map((x) => (x === '{as}' ? bidi(s.as) : x === '{want}' ? bidi(s.want) : x === '{so}' ? bidi(s.so) : esc(x))).join('')}</span>`
                : '';
            const row = (label, value) => (value ? `<tr><th>${bidi(label)}</th><td>${value}</td></tr>` : '');
            const criteria = (s.acceptance || [])
              .map((a, k) => `<li${dp(`${sp}/acceptance/${k}`)}>${bidi(a)}</li>`)
              .join('');
            const sub = (key) =>
              s[key]
                ? table({
                    columns: s[key].columns,
                    rows: s[key].rows,
                    colsPtr: `${sp}/${key}/columns`,
                    rowsPtr: `${sp}/${key}/rows`,
                    extra: 'dict',
                    alt: true,
                  })
                : '';
            const dictionary = sub('dictionary');
            const actions = sub('actions');
            const colgroup = '<colgroup><col style="width:22%" /><col style="width:78%" /></colgroup>';
            const partsArr = [
              `<div class="id-card"><table class="control story-info">${colgroup}
    <caption class="story-head"><span class="sn"${dp(b + '/number')}>${bidi(block.number ?? '')}</span>${bidi(L.userStory)}</caption>
    <tbody>
      ${row(L.storyId, `<bdi dir="ltr"${dp(sp + '/id')}>${esc(s.id)}</bdi>`)}
    </tbody>
  </table></div>
  <table class="control story-info story-info-body">${colgroup}
    <tbody>
      ${row(L.storyName, `<span${dp(sp + '/name')}>${bidi(s.name)}</span>`)}
      ${row(L.storyUser, `<span${dp(sp + '/as')}>${bidi(s.as)}</span>`)}
      ${row(L.storyGoalLabel, goal)}
      ${criteria ? `<tr class="ac"><th>${bidi(L.acceptance)}</th><td><ol>${criteria}</ol></td></tr>` : ''}
    </tbody>
  </table>`,
              ...(actions ? [`<p class="run-in dict-label">${bidi(L.actionsTable)}</p>`, PLAIN + actions] : []),
              ...(dictionary ? [`<p class="run-in dict-label">${bidi(L.dictionary)}</p>`, PLAIN + dictionary] : []),
            ];
            const partClass = (k) => {
              const plain = partsArr[k].startsWith(PLAIN) ? ' plain' : '';
              return partsArr.length === 1
                ? `story${plain}`
                : k === 0
                  ? `story part-first${plain}`
                  : k === partsArr.length - 1
                    ? `story part-last${plain}`
                    : `story part-mid${plain}`;
            };
            return `${block.lead && i === 0 ? `<p class="run-in cards-label"${dp(b + '/lead')}>${bidi(block.lead)}</p>` : ''}
${partsArr.map((part, k) => `<div class="${partClass(k)}" data-b="${attr(b)}" data-item="${attr(sp)}">
  ${part.replace(PLAIN, '')}
</div>`).join(NL)}`;
          })
          .join(NL);
      case 'gap':
        return `<div class="gap" data-b="${attr(b)}"><span class="gap-tag">${bidi(L.openQuestion)}</span>
  <p${dp(b + '/question')}>${bidi(block.question)}</p>
  <p class="owner">${bidi(L.owner)}: <span${dp(b + '/owner')}>${bidi(block.owner)}</span></p></div>`;
      default:
        return '';
    }
  }

  function groupForPaging(blocks, base, heading = '') {
    const out = [];
    let pending = heading;
    for (let i = 0; i < blocks.length; i += 1) {
      const start = out.length;
      const first = i;
      i = stepPaging(i);
      const pre = anchorsAt(Array.from({ length: i - first + 1 }, (_, k) => `${base}/${first + k}`));
      if (pre) {
        if (out.length > start) out[start] = pre + out[start];
        else out.push(pre);
      }
    }
    return (pending ? pending + NL : '') + out.join(NL);

    function stepPaging(i) {
      const block = blocks[i];
      const next = blocks[i + 1];
      const b = `${base}/${i}`;
      const nb = `${base}/${i + 1}`;
      if (block.layout?.breakBefore) out.push(`<div class="bw-break" data-b="${attr(b)}"></div>`);
      if (block.layout?.keepNext && next) {
        out.push(`<div class="keep">${pending}${renderBlock(block, b)}${NL}${renderBlock(next, nb)}</div>`);
        pending = '';
        return i + 1;
      }
      if (block.kind === 'stories') {
        out.push(renderBlock(block, b));
        pending = '';
        return i;
      }
      const shortTable = next?.kind === 'table' && (next.rows?.length ?? 0) <= GROUPABLE_ROWS;
      if (block.kind === 'subhead' && next) {
        if (next.kind !== 'table' || shortTable) {
          out.push(`<div class="keep">${renderBlock(block, b)}${NL}${renderBlock(next, nb)}</div>`);
          i += 1;
          return i;
        }
      }
      if (block.kind === 'prose' && shortTable) {
        out.push(`<div class="keep">${pending}${renderBlock(block, b)}${NL}${renderBlock(next, nb)}</div>`);
        pending = '';
        return i + 1;
      }
      if (block.kind === 'prose' && next?.kind === 'table' && !shortTable) {
        const all = paras(block, b);
        const lead = all.at(-1);
        const rest = all.slice(0, -1);
        out.push(
          (rest.length ? prose(rest, b) : '') +
            tableOf(next, nb, '', lead ? `<span data-b="${attr(b)}"${dp(lead.p)}>${bidi(lead.text)}</span>` : '')
        );
        pending = '';
        return i + 1;
      }
      if (pending && block.kind === 'table') {
        const short = (block.rows?.length ?? 0) <= GROUPABLE_ROWS;
        const headed = tableOf(block, b, 'headed', pending);
        out.push(short ? `<div class="hold head whole">${headed}</div>` : headed);
        pending = '';
        return i;
      }
      out.push(pending ? `<div class="keep">${pending}${NL}${renderBlock(block, b)}</div>` : renderBlock(block, b));
      pending = '';
      return i;
    }
  }

  function contentsRows() {
    const row = (num, title, cls = '') =>
      `<tr${cls ? ` class="${cls}"` : ''}><td>${bidi(num)}</td><td>${bidi(title)}</td></tr>`;
    return doc.chapters.flatMap((ch) => {
      const head = row(ch.number, ch.title, 'toc-chapter');
      if (ch.sections.length === 1) {
        const cards = ch.sections[0].blocks.filter((x) => x.kind === 'subhead').map((x) => row('', x.text, 'toc-card'));
        return [head, ...cards];
      }
      return [head, ...ch.sections.map((sec) => row(sec.number, sec.title))];
    });
  }

  const c = doc.control;
  const serviceName = c.title.split(/\s*[:—]\s+/).slice(1).join(': ') || c.title;
  const controlKeys = ['documentId', 'title', 'preparedBy', 'documentType', 'classification', 'owner', 'issuedOn', 'version', 'status', 'reviewCycle'];

  const rows = contentsRows();
  const TOC_COLS = '<colgroup><col style="width:9%" /><col style="width:91%" /></colgroup>';
  const tocSplit = o.tocSplit || 0;
  const toc =
    tocSplit > 0 && tocSplit < rows.length
      ? `<table class="toc">${TOC_COLS}${guardedBody(rows.slice(0, tocSplit))}</table>` +
        `<table class="toc toc-cont">${TOC_COLS}${guardedBody(rows.slice(tocSplit))}</table>`
      : `<table class="toc">${TOC_COLS}${guardedBody(rows)}</table>`;

  const body = doc.chapters
    .map((ch, ci) => {
      const cp = `/chapters/${ci}`;
      const hasFigure = ch.sections.some((sec) => sec.blocks.some((x) => x.kind === 'figure'));
      const single = ch.sections.length === 1;
      const h2 = `<h2><span class="num"${dp(cp + '/number')}>${bidi(ch.number)}</span><span${dp(cp + '/title')}>${bidi(ch.title)}</span></h2>`;
      const first = ch.sections[0];
      const opensLong = !!first?.blocks[0] && !['figure', 'stories', 'shots'].includes(first.blocks[0].kind);
      const inner = single
        ? groupForPaging(ch.sections[0].blocks, `${cp}/sections/0/blocks`, opensLong ? h2 : '')
        : ch.sections
            .map((sec, i) => {
              const sp = `${cp}/sections/${i}`;
              return `<section class="sec" data-s="${attr(sp)}">
    ${groupForPaging(
      sec.blocks,
      `${sp}/blocks`,
      (i === 0 && opensLong ? h2 : '') +
        `<h3><span class="sn"${dp(sp + '/number')}>${bidi(sec.number)}</span><span${dp(sp + '/title')}>${bidi(sec.title)}</span></h3>`
    )}
  </section>`;
            })
            .join(NL);
      return `<section class="chapter${hasFigure ? ' wide' : ''}" data-ch="${attr(cp)}">
  ${opensLong ? '' : h2}
  ${inner}
</section>`;
    })
    .join(NL);

  const sheets = doc.chapters
    .flatMap((ch) => ch.sections)
    .flatMap((sec) => sec.blocks)
    .flatMap((x) => (x.kind === 'figure' && x.sheet ? [x.sheet] : []));
  const sheet =
    sheets.reduce((w, s) => (!w || s.widthMm > w.widthMm ? s : w), null) ??
    { widthMm: 297, heightMm: 210, drawHeightMm: 146, name: 'A4 landscape' };

  // design-pack logos still print in the lockup; empty slots print nothing (logos are placed freely as overlays)
  const slot = (logos, name) =>
    logos[name] && SAFE_IMG.test(logos[name]) ? `<img class="logo-${name}" data-logo="${name}" src="${attr(logos[name])}" alt="" />` : '';

  const cover = (logos) => `<div class="cover">${overlaysFor((o) => o.mode === 'cover')}
  <div class="spine"><i class="cap"></i><span class="id"><bdi dir="ltr">${esc(c.documentId)}</bdi></span></div>
  <div class="cover-main">
  <div class="lockup">${slot(logos, 'start')}${slot(logos, 'center')}${slot(logos, 'end')}</div>
  <div class="cover-rule"></div>
  <div class="cover-body">
    <div class="kicker">${bidi(L.kicker)}</div>
    <div class="rule-short"></div>
    <h1>${bidi(serviceName)}</h1>
    <div class="subtitle">${esc(L.subtitle)}</div>
  </div>
  <div class="cover-foot">
    <span><bdi dir="ltr">${esc(c.version)}</bdi>${L.comma}${esc(c.status)}${L.comma}<bdi dir="ltr">${esc(c.issuedOn)}</bdi></span>
  </div>
  </div>
</div>`;

  const front = `<h2>${bidi(L.controlChapter)}</h2>
  <h3>${bidi(L.controlData)}</h3>
  <table class="control"><colgroup><col style="width:34%" /><col style="width:66%" /></colgroup>${controlKeys
    .map((k) => `<tr><th>${bidi(L.control[k])}</th><td${dp('/control/' + k)}>${bidi(c[k])}</td></tr>`)
    .join('')}</table>
  <h3>${bidi(L.revisions)}</h3>
  ${table({ columns: [L.revVersion, L.revDate], rows: (doc.revisions || []).map((r) => r.slice(0, 2)), rowsPtr: '/revisions' })}
  <h3>${bidi(L.contents)}</h3>
  ${toc}`;

  const questions = (doc.openQuestions || []).length
    ? `<section class="chapter"><h2><span class="num">؟</span>${bidi(L.openQuestions)}</h2>
  ${table({
    columns: L.questionCols,
    rows: doc.openQuestions.map((q) => [q.id, q.question, q.owner, q.blocks]),
  })}</section>`
    : '';

  const everyOv = overlaysFor((o) => o.mode === 'every');
  const every = everyOv ? `<div class="bw-every">${everyOv}</div>` : '';
  return { cover, front, body, questions, every, sheet, tocRows: rows.length };
}

/**
 * Runs inside the page, before printing: releases keep-together groups that are
 * too tall or would strand a near-empty page. Port of render.ts `relaxTallGroups`.
 * Serialisable — pass it to page.evaluate, or call it in the browser.
 */
export function relaxTallGroups([limit, keepRows, pageH, floor]) {
  let n = 0;
  let waste = 0;
  document.querySelectorAll('.keep,.card,.hold,.fig').forEach((el) => {
    const top0 = el.getBoundingClientRect().top + window.scrollY + waste;
    const usedFraction = (((top0 % pageH) + pageH) % pageH) / pageH;
    if (el.classList.contains('fig')) {
      waste += pageH - usedFraction * pageH;
      return;
    }
    if (el.classList.contains('hold')) {
      const height = el.getBoundingClientRect().height;
      if (height > pageH) {
        el.classList.remove('whole');
        el.style.breakInside = 'auto';
        n += 1;
        return;
      }
      const tall = height > limit;
      const short = !tall && usedFraction < floor;
      if (!tall && !short) {
        const remaining = pageH - usedFraction * pageH;
        if (height > remaining) waste += remaining;
        return;
      }
      el.classList.remove('whole');
      const rows = Array.from(el.children);
      if (el.classList.contains('head')) {
        el.style.breakInside = 'auto';
        n += 1;
        return;
      }
      if (short && rows.length < keepRows * 2) {
        const remaining = pageH - usedFraction * pageH;
        if (height > remaining) waste += remaining;
        return;
      }
      const middle = el.cloneNode(false);
      const tail = el.cloneNode(false);
      middle.classList.remove('hold');
      middle.style.breakInside = 'auto';
      rows.slice(keepRows, rows.length - keepRows).forEach((r) => middle.appendChild(r));
      rows.slice(-keepRows).forEach((r) => tail.appendChild(r));
      el.after(middle, tail);
      n += 1;
      return;
    }
    const height = el.getBoundingClientRect().height;
    if (height > limit) {
      el.style.breakInside = 'auto';
      n += 1;
      return;
    }
    if (el.classList.contains('keep')) el.classList.add('whole');
    const remaining = pageH - usedFraction * pageH;
    if (height > remaining) waste += remaining;
  });
  return n;
}
export const relaxArgs = () => [PAGE.contentPx * PAGE.relaxAbove, PAGE.keepRows, PAGE.contentPx, PAGE.fillFloor];

/** Header/footer templates for Chrome's print (separate documents: inline styles only). */
export function chromeTemplates(doc, o) {
  const roles = o.theme.vars;
  const stack = [o.theme.fonts.text, o.theme.fonts.display].filter(Boolean).map((f) => `'${f}'`).join(',');
  const wrap = (inner) =>
    `<style>${o.fontCss || ''}</style><div style="width:100%;font-size:8pt;font-family:${stack},serif;color:${roles.muted};padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">${inner}</div>`;
  const header = wrap(
    (o.logos?.header ? `<img src="${attr(o.logos.header)}" style="height:5mm;" />` : '<span></span>') +
      `<span>${esc(doc.control.documentId)}</span><span>${esc(doc.control.issuedOn)}</span>`
  );
  const footer = wrap(
    `<span style="color:${roles.signal};font-weight:700;">${esc(o.theme.brand?.confidential || o.labels.confidential)}</span>` +
      `<span style="font-weight:700;letter-spacing:.08em;">${esc(o.theme.brand?.producer || '')}</span>` +
      '<span style="font-weight:700;"></span>'
  );
  return { header, footer };
}
