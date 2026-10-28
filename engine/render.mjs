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

import { DIAGRAM } from './diagram.mjs';
import { isRich, textOf } from './edits.mjs';
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

// ---- everything editable: labels, design, per-instance style, advanced CSS, template parts ----
/** House labels (i18n) ← design-pack labels (theme.labels[locale]) ← this document's labels (doc.labels). */
export function withLabels(base, ...over) {
  const out = { ...base, control: { ...(base?.control || {}) } };
  for (const o of over) for (const [k, v] of Object.entries(o || {})) {
    if (k === 'control' && v && typeof v === 'object') Object.assign(out.control, v);
    else if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}
/** The design pack with this document's own design on top (doc.design: vars, sizes, fonts, css). */
export function designTheme(theme, doc) {
  const d = doc?.design;
  if (!d) return theme;
  return { ...theme, vars: { ...theme.vars, ...(d.vars || {}) }, sizes: { ...(theme.sizes || {}), ...(d.sizes || {}) }, fonts: { ...theme.fonts, ...(d.fonts || {}) } };
}
const STYLE_PROPS = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-align', 'padding', 'margin', 'border', 'border-color', 'border-width', 'border-style', 'border-radius'];
const SAFE_VALUE = /^[#a-zA-Z0-9(),.\s%'-]+$/;
/** One instance's own style ({prop: value}), whitelisted properties and plain values only. */
export function styleDecls(style) {
  return Object.entries(style || {})
    .filter(([k, v]) => STYLE_PROPS.includes(k) && SAFE_VALUE.test(String(v)) && !/url|expression|javascript/i.test(String(v))) // leaf-ok: a style value, not text
    .map(([k, v]) => `${k}:${v} !important`).join(';');
}
/** Advanced CSS: no @import, no url() except data images, no expressions, scripts, bindings, escapes or closing tags. */
export function sanitizeCss(css) {
  const rejected = [];
  let out = String(css || '');
  const drop = (re, why) => { out = out.replace(re, (m) => { rejected.push(`${why}: ${m.slice(0, 60)}`); return ''; }); };
  drop(/\/\*[\s\S]*?\*\//g, 'comment');
  drop(/\\/g, 'escape');
  drop(/<\/?\s*style|<!--|-->/gi, 'tag');
  drop(/@import[^;]*;?/gi, '@import');
  drop(/@charset[^;]*;?/gi, '@charset');
  drop(/url\(\s*(?!['"]?data:image\/(png|jpeg|gif|webp);base64,)[^)]*\)/gi, 'remote url()');
  drop(/expression\s*\(/gi, 'expression()');
  drop(/javascript\s*:/gi, 'javascript:');
  drop(/behavior\s*:|-moz-binding/gi, 'binding');
  return { css: out.trim(), rejected: rejected.filter((r) => !r.startsWith('comment')) };
}
/** CSS for per-instance styles and hidden parts, keyed by the pointers the renderer prints. */
export function instanceCss(doc) {
  const rules = [];
  const add = (sel, node) => {
    const d = styleDecls(node.style);
    if (d) rules.push(`${sel}{${d}}`);
    if (node.hidden) rules.push(`html:not(.bw-ed) ${sel}{display:none !important}`, `html.bw-ed ${sel}{opacity:.4;outline:1px dashed var(--muted)}`);
  };
  (doc?.chapters || []).forEach((ch, ci) => {
    const cp = `/chapters/${ci}`;
    add(`[data-ch="${cp}"]`, ch);
    (ch.sections || []).forEach((sec, si) => {
      const sp = `${cp}/sections/${si}`;
      add(`[data-s="${sp}"]`, sec);
      (sec.blocks || []).forEach((b, bi) => add(`[data-b="${sp}/blocks/${bi}"]`, b));
    });
  });
  for (const [part, st] of Object.entries(doc?.layout?.style || {})) if (/^[a-z]+$/.test(part)) add(`[data-part="${part}"]`, { style: st });
  return rules.join('\n');
}
export const TEMPLATE_PARTS = ['cover', 'control', 'revisions', 'toc', 'questions'];
/** Labels a document cannot print empty (validation flags them). */
export function emptyLabels(L) {
  const out = [];
  for (const [k, v] of Object.entries(L)) {
    if (k === 'control') { for (const [ck, cv] of Object.entries(v)) if (!String(cv).trim()) out.push(`control/${ck}`); }
    else if (Array.isArray(v)) { v.forEach((x, i) => { if (!String(x).trim()) out.push(`${k}/${i}`); }); }
    else if (typeof v === 'string' && !v.trim() && !['comma'].includes(k)) out.push(k);
  }
  return out;
}

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


/* ── rich leaves (0.13.0, A26): marks and paragraph style through an allow-list builder ──
 * A string leaf takes the exact 0.12.0 path; only a rich leaf ({text, marks, style}) goes through here.
 * User text is escaped by the bidi function; tags come only from this table, never from the document. */
const HEX = /^#[0-9a-fA-F]{6}$/;
const HREF = /^(https?:\/\/|mailto:)[^\s"'<>]+$/i;
const PT = (v) => (Number.isFinite(+v) && +v >= 5 && +v <= 72 ? +v : null);
const safeFamilyName = (f) => String(f || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
/** Thmanyah families only (house rule): any other font mark is ignored. */
export const FONT_FAMILIES = ['Thmanyah Serif Text', 'Thmanyah Serif Display', 'Thmanyah Sans'];
const MARK_ORDER = ['link', 'span', 'b', 'i', 'u', 's', 'code'];
function markOpen(type, ms) {
  if (type === 'link') { const m = ms.find((x) => x[2] === 'link' && HREF.test(String(x[3] || ''))); return m ? [`<a href="${attr(m[3])}" class="bw-link">`, '</a>'] : null; }
  if (type === 'span') {
    const d = [];
    for (const m of ms) {
      if (m[2] === 'color' && HEX.test(String(m[3]))) d.push(`color:${m[3]}`);
      if (m[2] === 'font' && FONT_FAMILIES.includes(safeFamilyName(m[3]))) d.push(`font-family:'${safeFamilyName(m[3])}'`);
      if (m[2] === 'size' && PT(m[3])) d.push(`font-size:${PT(m[3])}pt`);
    }
    return d.length ? [`<span style="${d.join(';')}">`, '</span>'] : null;
  }
  return ms.some((x) => x[2] === type) ? [`<${type}>`, `</${type}>`] : null;
}
/** A rich leaf's words with their marks. bidi(text) escapes and isolates each run. */
export function richHtml(leaf, bidi) {
  const text = textOf(leaf);
  const marks = (leaf.marks || []).filter((m) => Array.isArray(m) && m[1] > m[0]);
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [Math.max(0, Math.min(text.length, m[0] | 0)), Math.max(0, Math.min(text.length, m[1] | 0))])])].sort((a, b) => a - b);
  let out = '';
  for (let k = 0; k < cuts.length - 1; k += 1) {
    const [a, b] = [cuts[k], cuts[k + 1]];
    const raw = text.slice(a, b);
    if (!raw) continue;
    // polish trims each run: the spaces at a mark's edge are kept as one space
    const inner = !raw.trim() ? ' ' : (/^\s/.test(raw) && a > 0 ? ' ' : '') + bidi(raw) + (/\s$/.test(raw) && b < text.length ? ' ' : '');
    const on = marks.filter((m) => m[0] <= a && m[1] >= b);
    let open = '', close = '';
    for (const t of MARK_ORDER) { const w = markOpen(t, on); if (w) { open += w[0]; close = w[1] + close; } }
    out += open + inner + close;
  }
  return out;
}
const LEAF_ALIGN = { start: 'start', center: 'center', end: 'end', justify: 'justify' };
const LEAF_VALIGN = { top: 'top', middle: 'middle', bottom: 'bottom' };
const mmOk = (v) => (Number.isFinite(+v) && +v >= 0 && +v <= 60 ? +v : null);
/** style="…" and class for an element holding a rich leaf ('' for a string: the 0.12.0 markup). */
export function leafAttrs(leaf, cls = '') {
  const st = isRich(leaf) ? leaf.style || {} : null;
  if (!st) return cls ? ` class="${cls}"` : '';
  const d = [];
  if (LEAF_ALIGN[st.align]) d.push(`text-align:${LEAF_ALIGN[st.align]}`);
  if (LEAF_VALIGN[st.valign]) d.push(`vertical-align:${LEAF_VALIGN[st.valign]}`);
  if (Number.isFinite(+st.lineHeight) && +st.lineHeight >= 0.8 && +st.lineHeight <= 4) d.push(`line-height:${+st.lineHeight}`);
  if (mmOk(st.spaceBefore) != null) d.push(`margin-top:${mmOk(st.spaceBefore)}mm`);
  if (mmOk(st.spaceAfter) != null) d.push(`margin-bottom:${mmOk(st.spaceAfter)}mm`);
  const c = [cls, st.quote ? 'bw-quote' : ''].filter(Boolean).join(' ');
  return (c ? ` class="${c}"` : '') + (d.length ? ` style="${d.join(';')}"` : '');
}
/** The list a paragraph belongs to: {kind: 'bullet'|'number'|'shape', shape, level 0–8} or null. */
export function listOf(leaf) {
  const l = isRich(leaf) && leaf.style?.list;
  if (!l) return null;
  const level = Math.max(0, Math.min(8, (leaf.style.level | 0)));
  if (l === 'bullet' || l === 'number') return { kind: l, level, numFormat: leaf.style.numFormat };
  const m = /^shape:(.)$/u.exec(String(l));
  return m && '•◦▪–✓➤'.includes(m[1]) ? { kind: 'shape', shape: m[1], level } : null;
}
/** Word's numbering per level: 1. a. i. 1. a. i. … (numFormat overrides one level). */
export const NUM_FORMATS = ['decimal', 'lower-alpha', 'lower-roman'];
const NUM_CSS = { decimal: 1, 'lower-alpha': 1, 'upper-alpha': 1, 'lower-roman': 1, 'upper-roman': 1, 'arabic-indic': 1 };
export const numFormatAt = (level, fmt) => (NUM_CSS[fmt] ? fmt : NUM_FORMATS[level % 3]);

/* ── pages, segments and running header/footer (0.13.0, A5 A6 A18 A19) ──
 * One model: a page segment starts at a block carrying layout.page (A18) or at the anchor of a scoped
 * header/footer item (A6). Segments are numbered in reading order; segment 0 is the document's own page. */
export const PAPER = { A3: [297, 420], A4: [210, 297], A5: [148, 210], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
/** {size, orientation, w, h} in mm for a page setting (default A4 portrait). */
export function pageSpec(p) {
  const size = p?.size;
  const custom = typeof size === 'object' && size && +size.w > 50 && +size.h > 50 && +size.w < 1200 && +size.h < 1200;
  let [w, h] = custom ? [+size.w, +size.h] : PAPER[size] || PAPER.A4;
  const orientation = p?.orientation === 'landscape' ? 'landscape' : 'portrait';
  if ((orientation === 'landscape') !== (w > h)) [w, h] = [h, w];
  return { size: custom ? 'custom' : PAPER[size] ? size : 'A4', orientation, w, h };
}
/** Print geometry of the document's own page (segment 0): CSS px of the content box. */
export function pageGeom(doc) {
  const sp = pageSpec(doc?.layout?.page);
  return { ...sp, contentPx: Math.round(((sp.h - 18 - 16) / 25.4) * 96), measurePx: Math.round(((sp.w - 16 - 16) / 25.4) * 96) };
}
/** Every block in reading order: {ptr, ci, si, bi, block}. */
export function blocksInOrder(doc) {
  const out = [];
  (doc?.chapters || []).forEach((ch, ci) => (ch.sections || []).forEach((sec, si) => (sec.blocks || []).forEach((block, bi) => out.push({ ptr: `/chapters/${ci}/sections/${si}/blocks/${bi}`, ci, si, bi, block }))));
  return out;
}
export const CHROME_FIELDS = ['documentId', 'title', 'version', 'issuedOn', 'status', 'confidentiality', 'producer'];
/** Today's running header/footer as items (what chromeTemplates prints with no doc.chrome). */
export function chromeDefaults(locale = 'ar') {
  const ar = locale === 'ar';
  return {
    header: { items: [
      { id: 'h-logo', kind: 'logo', value: 'header', align: ar ? 'end' : 'start', scope: 'all' },
      { id: 'h-id', kind: 'field', value: 'documentId', align: 'center', scope: 'all' },
      { id: 'h-date', kind: 'field', value: 'issuedOn', align: ar ? 'start' : 'end', scope: 'all' },
    ] },
    footer: { items: [
      { id: 'f-conf', kind: 'field', value: 'confidentiality', align: ar ? 'end' : 'start', scope: 'all' },
      { id: 'f-prod', kind: 'field', value: 'producer', align: 'center', scope: 'all' },
      { id: 'f-page', kind: 'page', value: 'n', align: ar ? 'start' : 'end', scope: 'all' },
    ] },
  };
}
/**
 * The page model: segments [{n, start (block ptr | null), page: pageSpec, only: [item], from: [item]}],
 * segOf: Map(block ptr → n), ids: Map(block id → ptr). Scoped items whose anchor no longer resolves are dropped.
 */
export function pageModel(doc) {
  const order = blocksInOrder(doc);
  const ids = new Map();
  for (const x of order) if (x.block?.id && !ids.has(String(x.block.id))) ids.set(String(x.block.id), x.ptr); // a duplicate keeps the id: the first one holds the anchor
  const resolve = (a) => (a == null ? null : ids.get(String(a)) || (order.some((x) => x.ptr === a) ? a : null));
  const scoped = new Map();
  for (const part of ['header', 'footer']) (doc?.chrome?.[part]?.items || []).forEach((it, i) => {
    if (it?.scope !== 'only' && it?.scope !== 'from') return;
    const at = resolve(it.anchor);
    if (!at) return;
    if (!scoped.has(at)) scoped.set(at, []);
    scoped.get(at).push({ ...it, part, i });
  });
  let page = pageSpec(doc?.layout?.page);
  const segments = [{ n: 0, start: null, page, only: [], from: [] }];
  const segOf = new Map();
  let from = [];
  for (const x of order) {
    const lp = x.block?.layout?.page;
    const items = scoped.get(x.ptr) || [];
    if ((lp && typeof lp === 'object') || items.length) {
      if (lp && typeof lp === 'object') page = pageSpec({ ...(doc?.layout?.page || {}), ...lp });
      from = [...from, ...items.filter((it) => it.scope === 'from')];
      segments.push({ n: segments.length, start: x.ptr, page, only: items.filter((it) => it.scope === 'only'), from });
    }
    segOf.set(x.ptr, segments.length - 1);
  }
  return { segments, segOf, ids };
}

const blank = (c) => ['', '—', '-', '–', 'N/A', 'n/a'].includes(textOf(c ?? '').trim());
/** A table cell as the renderer takes it: a rich leaf as is, anything else as its string (0.12.0). */
const keepLeaf = (v) => (isRich(v) ? v : String(v));
/** The leaf from character n on (a bullet prefix cut off), marks shifted. */
export function sliceLeaf(leaf, n) {
  if (!isRich(leaf)) return textOf(leaf).slice(n);
  return { ...leaf, text: leaf.text.slice(n), marks: (leaf.marks || []).map(([a, b, ...r]) => [Math.max(0, a - n), Math.max(0, b - n), ...r]).filter(([a, b]) => b > a) };
}
/** Word's seven wrap modes (A15); inline = a shots block in the flow. */
export const WRAPS = ['inline', 'square', 'tight', 'through', 'topBottom', 'behind', 'front'];
/** A text box's own look (A23): border, fill and padding from tokens or plain values; vertical align. */
function tbDecl(st = {}) {
  const tok = (v) => (/^--[a-z0-9-]+$/.test(String(v)) ? `var(${v})` : HEX.test(String(v)) ? v : null); // leaf-ok: a style value, not text
  const d = [];
  if (st.border === 'none') d.push('border:0'); else if (tok(st.border)) d.push(`border-color:${tok(st.border)}`);
  if (tok(st.fill)) d.push(`background:${tok(st.fill)}`);
  if (mmOk(st.padding) != null) d.push(`padding:${mmOk(st.padding)}mm`);
  if (LEAF_VALIGN[st.valign]) d.push(`justify-content:${{ top: 'flex-start', middle: 'center', bottom: 'flex-end' }[st.valign]}`);
  return d.length ? ';' + d.join(';') : '';
}

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
  const theme = designTheme(o.theme, doc);
  const L = withLabels(o.labels, theme?.labels?.[locale], doc.labels);
  const bidi = makeBidi(locale);
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
${documentCss(theme, parts.sheet, doc)}</style>
${o.extraHead || ''}</head>
<body>
${documentMain(parts, logos, locale)}
${o.extraBody || ''}
</body></html>`;
}

/** The print stylesheet. Depends on the theme and the widest figure sheet only. */
const sz = (v, d) => (/^\d+(\.\d+)?(pt|px|mm|cm|em)$/.test(String(v)) ? v : d); // leaf-ok: a style value, not text
// any script's letters (a machine font may be named in Arabic or Japanese); quotes, slashes and markup never pass
const safeFamily = (f) => String(f || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
const FONT_SRC = /^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/]+=*$/;
const FONT_FMT = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };
/** The weights one face answers for: a family without a bold face uses its regular face for every weight,
 * so Chrome never fakes bold (a synthesised bold prints as Type 3 shapes, not text). */
export const faceWeights = (w, hasBold) => (!hasBold ? '100 900' : w === 700 ? '550 900' : '100 549');
/** @font-face rules for the fonts uploaded into this document (doc.design.fontFaces): data URIs only. */
export function uploadedFontCss(doc) {
  return (doc?.design?.fontFaces || [])
    .filter((f) => f && safeFamily(f.family) && FONT_SRC.test(String(f.src || '')))
    .map((f, _, all) => `@font-face{font-family:'${safeFamily(f.family)}';font-style:normal;font-weight:${faceWeights(+f.weight, all.some((x) => x.family === f.family && +x.weight === 700))};font-display:block;src:url(${f.src}) format('${FONT_FMT[FONT_SRC.exec(f.src)[1]]}');}`)
    .join('\n');
}
const safeToken = ([k, v]) => /^[a-z0-9-]+$/.test(k) && /^[#a-zA-Z0-9(),.\s%-]+$/.test(String(v)); // leaf-ok: a style value, not text
export function documentCss(themeIn, sheet, doc) {
  const theme = designTheme(themeIn, doc);
  const tail = doc ? `
/* this document: instance styles, hidden parts, advanced CSS */
${instanceCss(doc)}
${modelCss(doc)}${sanitizeCss(doc.design?.css).css}
` : '';
  const text = `'${safeFamily(theme.fonts.text)}'`;
  const display = `'${safeFamily(theme.fonts.display || theme.fonts.text)}'`;
  const vars = Object.entries(theme.vars).filter(safeToken).map(([k, v]) => `  --${k}:${v};`).join(NL);
  const paper = safeToken(['paper', theme.vars.paper]) ? theme.vars.paper : '#fff';
  const PAGE_ART_MM = 140;
  return `${doc ? uploadedFontCss(doc) : ''}
*{box-sizing:border-box}
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
  --page-side:${sz(theme.vars['page-side'], '16mm')};
}
body{font-family:${text},system-ui,sans-serif;
  color:var(--ink);margin:0;line-height:var(--line,1.8);font-size:var(--t-body);font-kerning:none}
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
th{text-align:start;background:var(--th-fill,none);color:var(--th-ink,var(--primary));font-weight:700;padding:0 3mm 2mm;
  font-size:var(--t-table);border-bottom:var(--th-rule-w,1.2pt) solid var(--primary)}
table:not(.control):not(.toc):not(.story) tbody tr:nth-child(even) td{background:var(--zebra,transparent)}
td{text-align:start;padding:2.5mm 3mm;vertical-align:top;border-bottom:var(--rule-w,1px) solid var(--rule)}
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
.fig.dg > figcaption{font-family:${display},${text},serif;font-size:var(--t-h3);margin:0 0 2.5mm}
.fig.dg > .fig-art{padding:4mm}
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
${tail}`;
}

/** CSS for the 0.13.0 document model — empty for a document that uses none of it (0.12.0 output unchanged). */
export function modelCss(doc) {
  const out = [];
  const PM = pageModel(doc);
  if (doc.layout?.page) {
    const sp = pageSpec(doc.layout.page);
    out.push(`@page{size:${sp.w}mm ${sp.h}mm}`, `.cover{height:${sp.h}mm}`, `.bw-every{top:${sp.h}mm;width:${sp.w}mm}`);
  }
  if (PM.segments.length > 1) {
    out.push('.bw-seg{display:block;height:1px;margin-bottom:-1px;overflow:hidden;font-size:0;line-height:0}');
    for (const x of PM.segments.slice(1)) out.push(`@page bw-seg-${x.n}{size:${x.page.w}mm ${x.page.h}mm}`);
  }
  // one pass over the units (the editor re-renders on every structural edit: no deep walk, no stringify)
  const chs = doc.chapters || [];
  if (chs.some((ch) => ch.layout?.breakBefore || (ch.sections || []).some((x) => x.layout?.breakBefore))) out.push('section.chapter.bw-brk,section.sec.bw-brk{break-before:page}');
  const richBlock = (b) => isRich(b.text) || isRich(b.caption) || (b.paragraphs || []).some(isRich) || (b.columns || []).some(isRich) || (b.rows || []).some((r) => Array.isArray(r) && r.some(isRich));
  const anyRich = chs.some((ch) => (ch.sections || []).some((x) => (x.blocks || []).some(richBlock))) || (doc.overlays || []).some((o) => isRich(o.text)) || (doc.controlTable?.rows || []).some((r) => Array.isArray(r) && r.some(isRich));
  if (anyRich) out.push('.bw-quote{border-inline-start:3px solid var(--accent-rule);padding-inline-start:4mm;color:var(--muted);font-style:italic}', 'code{font-family:inherit;background:var(--card);padding:0 1mm;border-radius:1mm}', 'a.bw-link{color:var(--primary);text-decoration:underline}', 'ol.bw-list,ul.bw-list{margin:2mm 0;padding-inline-start:7mm}', 'li.bw-nest{list-style:none}', 'html.bw-ed a.bw-link{pointer-events:none}');
  if ((doc.overlays || []).some((o) => o.wrap || o.kind === 'text')) out.push('.bw-ovf{position:relative;z-index:1}', '.bw-ovf img{display:block;width:100%;height:auto}', '.bw-ov.bw-behind{z-index:-1}', '.bw-ov.bw-front{z-index:3}', '.bw-tb{display:flex;flex-direction:column;border:1px solid var(--rule-strong);background:var(--card);padding:3mm;font-size:var(--t-table);line-height:1.5}', '.bw-tb-body{white-space:pre-wrap}');
  return out.length ? out.join('\n') + '\n' : '';
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
  const L = withLabels(o.L || o.labels, o.theme?.labels?.[locale], doc.labels);
  // a printed label, editable in place: it writes /labels/<key> of this document
  const lb = (k, v = L[k]) => `<span${dp('/labels/' + k)}>${bidi(v)}</span>`;
  const hide = new Set(doc.layout?.hide || []);
  const bidi0 = o.bidi || makeBidi(locale);
  // a rich leaf (A26) prints its marks; a string takes the 0.12.0 path unchanged
  const bidi = (v) => (isRich(v) ? richHtml(v, bidi0) : bidi0(v));
  const none = L.none;
  const PM = pageModel(doc);
  const segOn = PM.segments.length > 1;
  const segStarts = new Map(PM.segments.filter((x) => x.start).map((x) => [x.start, x]));
  const segOfPtr = (p) => PM.segOf.get(p) ?? 0;
  const pageStyle = (k) => (segOn && k > 0 ? ` style="page:bw-seg-${k}"` : '');
  const segMark = (x) => `<a class="bw-seg" data-seg="${x.n}" data-w-mm="${x.page.w}" data-h-mm="${x.page.h}" data-orient="${x.page.orientation}" href="https://bw.invalid/seg/${x.n}" aria-hidden="true" tabindex="-1"></a>`;

  // free-placed logos and images (doc.overlays): mm coordinates against their anchor
  const OV = (doc.overlays || []).map((o, i) => ({ ...o, i })).filter((o) => (o.kind === 'text' ? true : SAFE_IMG.test(String(o.src || ''))))
    .map((o) => (o.wrap && WRAPS.includes(o.wrap) && !o.mode ? { ...o, mode: 'anchor' } : o))
    .map((o) => (o.mode === 'anchor' && PM.ids.has(String(o.anchor)) ? { ...o, anchor: PM.ids.get(String(o.anchor)) } : o));
  const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : d));
  const ovInner = (o) => (o.kind === 'text'
    ? `<div class="bw-tb-body"${dp(`/overlays/${o.i}/text`)}${leafAttrs(o.text)}>${bidi(o.text ?? '')}</div>`
    : `<img src="${attr(o.src)}" alt="${attr(o.alt || '')}" draggable="false" />`) + (o.caption ? `<div class="bw-ov-cap"${dp(`/overlays/${o.i}/caption`)}>${bidi(o.caption)}</div>` : '');
  const ovKind = (o) => (o.kind === 'logo' ? 'logo' : o.kind === 'text' ? 'text' : 'image');
  const tbStyle = (o) => (o.kind === 'text' ? `;min-height:${num(o.h, 20, 4, 280).toFixed(2)}mm${tbDecl(o.style)}` : '');
  const ovHtml = (o) => `<div class="bw-ov${o.kind === 'text' ? ' bw-tb' : ''}${o.wrap === 'behind' ? ' bw-behind' : o.wrap === 'front' ? ' bw-front' : ''}" data-ov="${attr(o.id || String(o.i))}" data-i="${o.i}" data-kind="${ovKind(o)}"${o.wrap ? ` data-wrap="${attr(o.wrap)}"` : ''} style="left:${num(o.x, 0, -20, 290).toFixed(2)}mm;top:${num(o.y, 0, -20, 290).toFixed(2)}mm;width:${num(o.w, 30, 4, 200).toFixed(2)}mm${tbStyle(o)}">${ovInner(o)}</div>`;
  // in-flow wraps (A15): beside the text (square / tight / through) or on its own line (topBottom)
  const measureMm = segOn || doc.layout?.page ? pageSpec(doc.layout?.page).w - 32 : 178;
  const flowHtml = (o) => {
    const x = num(o.x, 0, 0, 290), w = num(o.w, 30, 4, 200), y = num(o.y, 0, 0, 290);
    const left = x + w / 2 <= measureMm / 2;
    const side = o.wrap === 'topBottom' ? `display:block;clear:both;margin-left:${x.toFixed(2)}mm`
      : left ? `float:left;margin-left:${x.toFixed(2)}mm;margin-right:3mm` : `float:right;margin-right:${Math.max(0, measureMm - x - w).toFixed(2)}mm;margin-left:3mm`;
    const shape = o.kind !== 'text' && (o.wrap === 'tight' || o.wrap === 'through') ? `;shape-outside:url(${o.src});shape-image-threshold:.3;shape-margin:${o.wrap === 'through' ? 0 : 2}mm` : o.wrap === 'topBottom' ? '' : ';shape-outside:margin-box';
    return `<div class="bw-ovf${o.kind === 'text' ? ' bw-tb' : ''}" data-ov="${attr(o.id || String(o.i))}" data-i="${o.i}" data-kind="${ovKind(o)}" data-wrap="${attr(o.wrap)}" style="${side};margin-top:${y.toFixed(2)}mm;width:${w.toFixed(2)}mm${shape}${tbStyle(o)}">${ovInner(o)}</div>`;
  };
  const inFlow = (o) => ['square', 'tight', 'through', 'topBottom'].includes(o.wrap);
  const overlaysFor = (pred) => OV.filter(pred).map(ovHtml).join('');
  const anchorsAt = (ptrs) => {
    const hit = OV.filter((o) => o.mode === 'anchor' && ptrs.includes(o.anchor));
    const abs = hit.filter((o) => !inFlow(o));
    return abs.length ? `<div class="bw-anchor" data-anchor="${attr(abs[0].anchor)}">${abs.map(ovHtml).join('')}</div>` : '';
  };
  /** In-flow wraps go right before the anchor block's own first element (after any heading it is grouped with). */
  const flowInto = (html, ptrs) => {
    for (const ptr of ptrs) {
      const f = OV.filter((o) => o.mode === 'anchor' && o.anchor === ptr && inFlow(o)).map(flowHtml).join('');
      if (!f) continue;
      const at = html.indexOf(` data-b="${attr(ptr)}"`);
      const open = at < 0 ? -1 : html.lastIndexOf('<', at);
      html = open < 0 ? f + html : html.slice(0, open) + f + html.slice(open);
    }
    return html;
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
      const lengths = rows.map((r) => textOf(r[i] ?? '').length).sort((a, b) => a - b);
      const median = lengths.length ? lengths[Math.floor(lengths.length / 2)] : 1;
      const longest = lengths.at(-1) ?? 1;
      const p90 = lengths.length
        ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))]
        : 1;
      const typical = median * 0.55 + p90 * 0.3 + longest * 0.15;
      const longestWord = Math.max(
        1,
        ...[c, ...rows.map((r) => r[i] ?? '')]
          .flatMap((cell) => textOf(cell).split(/\s+/))
          .map((w) => w.length)
      );
      return Math.max(
        Math.sqrt(Math.max(typical, 1)),
        Math.sqrt(textOf(c).length) * 1.15,
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
      ` data-w="${width}"` + (t.meta || '');
    return `<table class="${t.extra || ''}"${meta}>
  <colgroup>${cols}</colgroup>
  ${t.caption ? `<caption>${t.caption}</caption>` : ''}
  ${
    columns.length
      ? `<thead><tr>${columns
          .map((c, j) => `<th${dp(t.colPtrs ? t.colPtrs[idx[j]] : t.colsPtr && t.colsPtr + '/' + idx[j])} data-c="${idx[j]}">${bidi(c)}</th>`)
          .join('')}</tr></thead>`
      : ''
  }
  ${guardedBody(
    rows.map(
      (r, ri) =>
        `<tr${t.alt && n++ % 2 ? ' class="alt"' : ''} data-r="${ri}">${r
          .map(
            (c, j) =>
              `<td${isRich(c) ? leafAttrs(c, textOf(c).length > 200 ? 'long' : '') : String(c).length > 200 ? ' class="long"' : ''}${dp(
                t.cellPtr ? t.cellPtr(ri, idx[j]) : t.rowsPtr && `${t.rowsPtr}/${ri}/${idx[j]}`
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
    let listed = [];
    const flushList = () => { if (listed.length) { out.push(richList(listed, b)); listed = []; } };
    for (const para of paragraphs) {
      const li = listOf(para.leaf);
      if (li) { flush(); listed.push({ ...para, li }); continue; }
      flushList();
      const bullet = /^[•–-]\s+/.exec(para.text);
      if (bullet) {
        bullets.push(
          `<li data-b="${attr(b)}"${dp(para.p)} data-pfx="${attr(bullet[0])}">${isRich(para.leaf) ? richHtml(sliceLeaf(para.leaf, bullet[0].length), bidi0) : bidi(para.text.slice(bullet[0].length))}</li>`
        );
        continue;
      }
      flush();
      out.push(`<p data-b="${attr(b)}"${dp(para.p)}${leafAttrs(para.leaf)}>${bidi(para.leaf ?? para.text)}</p>`);
    }
    flush();
    flushList();
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
    (block.paragraphs || []).map((text, k) => (isRich(text) ? { text: textOf(text), leaf: text, p: `${b}/paragraphs/${k}` } : { text: String(text), p: `${b}/paragraphs/${k}` }));
  /** Nested lists (A26): bullets / numbers / shapes, levels 0–8, one <ol>/<ul> per level, the text in its own span. */
  function richList(items, b) {
    const out = [];
    const st = [];
    const listTag = (li) => (li.kind === 'number' ? 'ol' : 'ul');
    const listType = (li) => (li.kind === 'number' ? numFormatAt(li.level, li.numFormat) : li.kind === 'shape' ? `"${li.shape} "` : ['disc', 'circle', 'square'][li.level % 3]);
    const openList = (lv, li) => `<${listTag(li)} class="bw-list" data-level="${lv}" style="list-style-type:${lv === li.level ? listType(li) : 'none'}">`;
    for (const it of items) {
      const L = it.li.level;
      const tag = listTag(it.li);
      while (st.length && st.at(-1).level > L) out.push(`</li></${st.pop().tag}>`);
      if (st.length && st.at(-1).level === L && st.at(-1).tag !== tag) out.push(`</li></${st.pop().tag}>`);
      if (st.length && st.at(-1).level === L) out.push('</li>');
      else {
        for (let lv = st.length ? st.at(-1).level + 1 : L; lv < L; lv += 1) { out.push(openList(lv, { ...it.li, level: -1 }) + '<li class="bw-nest">'); st.push({ tag: listTag(it.li), level: lv }); }
        out.push(openList(L, it.li));
        st.push({ tag, level: L });
      }
      out.push(`<li data-b="${attr(b)}" data-level="${L}"${leafAttrs(it.leaf)}><span${dp(it.p)}>${richHtml(it.leaf, bidi0)}</span>`);
    }
    while (st.length) out.push(`</li></${st.pop().tag}>`);
    return out.join('');
  }

  const tableOf = (block, b, extra = '', caption = '') =>
    table({
      columns: (block.columns || []).map(keepLeaf),
      rows: (block.rows || []).map((r) => r.map(keepLeaf)),
      colsPtr: `${b}/columns`,
      rowsPtr: `${b}/rows`,
      extra,
      caption,
      b,
    });

  let figNo = 0;
  function renderBlock(block, b) {
    switch (block.kind) {
      case 'prose':
        return prose(paras(block, b), b);
      case 'subhead':
        return `<h4 data-b="${attr(b)}"${dp(b + '/text')}${leafAttrs(block.text)}>${bidi(block.text)}</h4>`;
      case 'table':
        return tableOf(block, b);
      case 'figure':
        return `<figure class="fig${block.sheet ? ' sheet' : ''}${block.compact ? ' hug' : ''}" data-b="${attr(b)}">
  <figcaption${dp(b + '/caption')}>${bidi(block.caption)}</figcaption>
  <div class="fig-art">${safeSvg(block.svg)}</div>
  ${block.note ? `<p class="fig-note"${dp(b + '/note')}>${bidi(block.note)}</p>` : ''}
</figure>`;
      case 'diagram': {
        // a workflow diagram: an editable model drawn as shapes and real text (engine/diagram.mjs)
        figNo += 1;
        return `<figure class="fig sheet hug dg" data-b="${attr(b)}" data-dg="${attr(b)}">
  <figcaption><span class="fig-no">${esc(L.figureNo || L.figure)} ${figNo}: </span><span${dp(b + '/caption')}>${bidi(block.caption)}</span></figcaption>
  <div class="fig-art">${DIAGRAM.render(block.model || {}, { theme: o.theme, locale, title: block.caption, editor: !!o.editor })}</div>
  ${block.note ? `<p class="fig-note"${dp(b + '/note')}>${bidi(block.note)}</p>` : ''}
</figure>`;
      }
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
            const row = (label, value) => (value ? `<tr><th>${lb(label)}</th><td>${value}</td></tr>` : '');
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
    <caption class="story-head"><span class="sn"${dp(b + '/number')}>${bidi(block.number ?? '')}</span>${lb('userStory')}</caption>
    <tbody>
      ${row('storyId', `<bdi dir="ltr"${dp(sp + '/id')}>${esc(s.id)}</bdi>`)}
    </tbody>
  </table></div>
  <table class="control story-info story-info-body">${colgroup}
    <tbody>
      ${row('storyName', `<span${dp(sp + '/name')}>${bidi(s.name)}</span>`)}
      ${row('storyUser', `<span${dp(sp + '/as')}>${bidi(s.as)}</span>`)}
      ${row('storyGoalLabel', goal)}
      ${criteria ? `<tr class="ac"><th>${lb('acceptance')}</th><td><ol>${criteria}</ol></td></tr>` : ''}
    </tbody>
  </table>`,
              ...(actions ? [`<p class="run-in dict-label">${lb('actionsTable')}</p>`, PLAIN + actions] : []),
              ...(dictionary ? [`<p class="run-in dict-label">${lb('dictionary')}</p>`, PLAIN + dictionary] : []),
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
        return `<div class="gap" data-b="${attr(b)}"><span class="gap-tag">${lb('openQuestion')}</span>
  <p${dp(b + '/question')}>${bidi(block.question)}</p>
  <p class="owner">${lb('owner')}: <span${dp(b + '/owner')}>${bidi(block.owner)}</span></p></div>`;
      default:
        return '';
    }
  }

  function groupForPaging(blocks, base, heading = '', cseg = 0) {
    const out = [];
    let pending = heading;
    for (let i = 0; i < blocks.length; i += 1) {
      const start = out.length;
      const first = i;
      i = stepPaging(i);
      const ptrs = Array.from({ length: i - first + 1 }, (_, k) => `${base}/${first + k}`);
      if (OV.length && out.length > start) out[start] = flowInto(out.splice(start).join(NL), ptrs);
      const pre = anchorsAt(ptrs);
      if (pre) {
        if (out.length > start) out[start] = pre + out[start];
        else out.push(pre);
      }
      if (segOn) {
        // a page segment (A6/A18) starts here: its marker first; a later segment than the container's gets its own page
        const at = segStarts.get(`${base}/${first}`);
        const k = segOfPtr(`${base}/${first}`);
        const own = cseg >= 0 && k !== cseg; // cseg -1: a figure chapter keeps its turned sheet
        if (at || own) {
          const grp = (at ? segMark(at) : '') + out.splice(start).join(NL);
          out.push(own ? `<div class="bw-pg"${pageStyle(k)}>${grp}</div>` : grp);
        }
      }
    }
    return (pending ? pending + NL : '') + out.join(NL);

    function stepPaging(i) {
      const block = blocks[i];
      const b = `${base}/${i}`;
      const nb = `${base}/${i + 1}`;
      const next = segOn && segStarts.has(nb) ? undefined : blocks[i + 1];
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
    // editor only (A25): each row points at the heading it mirrors, so editing the entry edits the heading
    let r = 0;
    const row = (num, title, cls = '', sec = '', numP = '', titleP = '') =>
      o.editor
        ? `<tr${cls ? ` class="${cls}"` : ''} data-sec="${attr(sec)}" data-r="${r}"><td${dp(numP)} data-r="${r}" data-c="0">${bidi(num)}</td><td${dp(titleP)} data-r="${r++}" data-c="1">${bidi(title)}</td></tr>`
        : `<tr${cls ? ` class="${cls}"` : ''}><td>${bidi(num)}</td><td>${bidi(title)}</td></tr>`;
    return doc.chapters.flatMap((ch, ci) => {
      if (ch.tocHidden) return [];
      const cp = `/chapters/${ci}`;
      const head = row(ch.number, ch.title, 'toc-chapter', cp, cp + '/number', cp + '/title');
      if (ch.sections.length === 1) {
        const cards = ch.sections[0].blocks.map((x, k) => [x, k]).filter(([x]) => x.kind === 'subhead' && !x.tocHidden).map(([x, k]) => row('', x.text, 'toc-card', `${cp}/sections/0/blocks/${k}`, '', `${cp}/sections/0/blocks/${k}/text`));
        return [head, ...cards];
      }
      return [head, ...ch.sections.map((sec, si) => [sec, si]).filter(([sec]) => !sec.tocHidden).map(([sec, si]) => row(sec.number, sec.title, '', `${cp}/sections/${si}`, `${cp}/sections/${si}/number`, `${cp}/sections/${si}/title`))];
    });
  }

  const c = doc.control;
  const serviceName = c.coverTitle ?? (c.title.split(/\s*[:—]\s+/).slice(1).join(': ') || c.title);
  const controlKeys = ['documentId', 'title', 'preparedBy', 'documentType', 'classification', 'owner', 'issuedOn', 'version', 'status', 'reviewCycle'];

  const rows = contentsRows();
  const TOC_COLS = '<colgroup><col style="width:9%" /><col style="width:91%" /></colgroup>';
  const tocSplit = o.tocSplit || 0;
  const tocMeta = o.editor ? ' data-rows="/toc" data-w="2"' : '';
  const toc =
    tocSplit > 0 && tocSplit < rows.length
      ? `<table class="toc"${tocMeta}>${TOC_COLS}${guardedBody(rows.slice(0, tocSplit))}</table>` +
        `<table class="toc toc-cont"${tocMeta}>${TOC_COLS}${guardedBody(rows.slice(tocSplit))}</table>`
      : `<table class="toc"${tocMeta}>${TOC_COLS}${guardedBody(rows)}</table>`;

  const body = doc.chapters
    .map((ch, ci) => {
      const cp = `/chapters/${ci}`;
      const hasFigure = ch.sections.some((sec) => sec.blocks.some((x) => x.kind === 'figure' || x.kind === 'diagram'));
      const single = ch.sections.length === 1;
      const h2 = `<h2><span class="num"${dp(cp + '/number')}>${bidi(ch.number)}</span><span${dp(cp + '/title')}>${bidi(ch.title)}</span></h2>`;
      const first = ch.sections[0];
      const opensLong = !!first?.blocks[0] && !['figure', 'diagram', 'stories', 'shots'].includes(first.blocks[0].kind);
      // page segments (A18 / A6): a container takes the segment of its first block; figure chapters keep their sheet
      const segAt = (si) => (segOn && !hasFigure ? segOfPtr(`${cp}/sections/${si}/blocks/0`) : 0);
      const chSeg = segAt(0);
      const inner = single
        ? groupForPaging(ch.sections[0].blocks, `${cp}/sections/0/blocks`, opensLong ? h2 : '', segOn && !hasFigure ? chSeg : -1)
        : ch.sections
            .map((sec, i) => {
              const sp = `${cp}/sections/${i}`;
              const sSeg = sec.blocks.length ? segAt(i) : chSeg;
              return `<section class="sec${sec.layout?.breakBefore ? ' bw-brk' : ''}" data-s="${attr(sp)}"${sSeg !== chSeg ? pageStyle(sSeg) : ''}>
    ${groupForPaging(
      sec.blocks,
      `${sp}/blocks`,
      (i === 0 && opensLong ? h2 : '') +
        `<h3><span class="sn"${dp(sp + '/number')}>${bidi(sec.number)}</span><span${dp(sp + '/title')}>${bidi(sec.title)}</span></h3>`,
      segOn && !hasFigure ? sSeg : -1
    )}
  </section>`;
            })
            .join(NL);
      return `<section class="chapter${hasFigure ? ' wide' : ''}${ch.layout?.breakBefore ? ' bw-brk' : ''}" data-ch="${attr(cp)}"${pageStyle(chSeg)}>
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

  const cover = (logos) => hide.has('cover') ? '' : `<div class="cover" data-part="cover">${overlaysFor((o) => o.mode === 'cover')}
  <div class="spine"><i class="cap"></i><span class="id"><bdi dir="ltr"${dp('/control/documentId')}>${esc(c.documentId)}</bdi></span></div>
  <div class="cover-main">
  <div class="lockup">${slot(logos, 'start')}${slot(logos, 'center')}${slot(logos, 'end')}</div>
  <div class="cover-rule"></div>
  <div class="cover-body">
    <div class="kicker">${lb('kicker')}</div>
    <div class="rule-short"></div>
    <h1${dp(c.coverTitle != null || serviceName !== c.title ? '/control/coverTitle' : '/control/title')}>${bidi(serviceName)}</h1>
    <div class="subtitle"${dp(c.subtitle != null ? '/control/subtitle' : '/labels/subtitle')}>${bidi(c.subtitle ?? L.subtitle)}</div>
  </div>
  <div class="cover-foot">
    <span><bdi dir="ltr"${dp('/control/version')}>${esc(c.version)}</bdi>${L.comma}<span${dp('/control/status')}>${esc(c.status)}</span>${L.comma}<bdi dir="ltr"${dp('/control/issuedOn')}>${esc(c.issuedOn)}</bdi></span>
  </div>
  </div>
</div>`;

  const FRONT = {
    control: () => doc.controlTable ? controlTable() : `<div data-part="control"><h3>${lb('controlData')}</h3>
  <table class="control"${o.editor ? ' data-rows="/controlTable/rows" data-cols="/controlTable/columns" data-virtual="control" data-w="2"' : ''}><colgroup><col style="width:34%" /><col style="width:66%" /></colgroup>${controlKeys
    .map((k, r) => o.editor
      ? `<tr data-r="${r}"><th${dp('/labels/control/' + k)} data-r="${r}" data-c="0">${bidi(L.control[k])}</th><td${dp('/control/' + k)} data-r="${r}" data-c="1">${bidi(c[k])}</td></tr>`
      : `<tr><th${dp('/labels/control/' + k)}>${bidi(L.control[k])}</th><td${dp('/control/' + k)}>${bidi(c[k])}</td></tr>`)
    .join('')}</table></div>`,
    revisions: () => `<div data-part="revisions"><h3>${lb('revisions')}</h3>
  ${table({ columns: [L.revVersion, L.revDate], colPtrs: ['/labels/revVersion', '/labels/revDate'], rows: (doc.revisions || []).map((r) => r.slice(0, 2)), rowsPtr: '/revisions' })}</div>`,
    toc: () => `<div data-part="toc"><h3>${lb('contents')}</h3>
  ${toc}</div>`,
  };
  /** The materialised control table (A25): rows of cells; a {bind: key} cell edits /control/<key> (cover and header read it). */
  function controlTable() {
    const T = doc.controlTable;
    const rowsC = (T.rows || []).filter(Array.isArray);
    const w = Math.max(2, Array.isArray(T.columns) ? T.columns.length : +T.columns || 0, ...rowsC.map((r) => r.length));
    const cols = `<col style="width:34%" />` + Array.from({ length: w - 1 }, () => `<col style="width:${(66 / (w - 1)).toFixed(2)}%" />`).join('');
    const cell = (v, r, k) => {
      const bound = v && typeof v === 'object' && !isRich(v) && controlKeys.includes(v.bind);
      const p = bound ? `/control/${v.bind}` : `/controlTable/rows/${r}/${k}`;
      const tag = k === 0 ? 'th' : 'td';
      return `<${tag}${dp(p)}${o.editor ? ` data-r="${r}" data-c="${k}"` : ''}${bound ? ` data-bind="${attr(v.bind)}"` : leafAttrs(v)}>${bidi(bound ? c[v.bind] : v ?? '')}</${tag}>`;
    };
    return `<div data-part="control"><h3>${lb('controlData')}</h3>
  <table class="control"${o.editor ? ` data-rows="/controlTable/rows" data-cols="/controlTable/columns" data-w="${w}"` : ''}><colgroup>${cols}</colgroup>${rowsC
    .map((row, r) => `<tr${o.editor ? ` data-r="${r}"` : ''}>${Array.from({ length: w }, (_, k) => cell(row[k], r, k)).join('')}</tr>`).join('')}</table></div>`;
  }
  const order = [...(doc.layout?.front || []).filter((k) => FRONT[k]), ...Object.keys(FRONT).filter((k) => !(doc.layout?.front || []).includes(k))];
  const shown = order.filter((k) => !hide.has(k));
  const front = shown.length ? `<h2>${lb('controlChapter')}</h2>
  ${shown.map((k) => FRONT[k]()).join(NL)}` : '';

  const questions = (doc.openQuestions || []).length && !hide.has('questions')
    ? `<section class="chapter" data-part="questions"${pageStyle(PM.segments.length - 1)}><h2><span class="num">؟</span>${lb('openQuestions')}</h2>
  ${table({
    columns: L.questionCols,
    colsPtr: '/labels/questionCols',
    rows: doc.openQuestions.map((q) => (Array.isArray(q) ? q.slice(0, 4) : [q.id, q.question, q.owner, q.blocks])),
    ...(o.editor ? { meta: ' data-rows="/openQuestions"', cellPtr: (r, k) => (Array.isArray(doc.openQuestions[r]) ? `/openQuestions/${r}/${k}` : `/openQuestions/${r}/${['id', 'question', 'owner', 'blocks'][k]}`) } : {}),
  })}</section>`
    : '';

  const everyOv = overlaysFor((o) => o.mode === 'every');
  const runs = doc.chrome ? PM.segments.map((x) => ['header', 'footer'].map((part) => `<template class="bw-run" data-seg="${x.n}" data-part="${part === 'header' ? 'head' : 'foot'}">${runBand(doc, { ...o, locale, L, bidi }, part, x)}</template>`).join('')).join('') : '';
  const every = (everyOv ? `<div class="bw-every">${everyOv}</div>` : '') + runs;
  return { cover, front, body, questions, every, sheet, tocRows: rows.length, segments: PM.segments };
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
export const relaxArgs = (doc) => { const g = doc ? pageGeom(doc) : PAGE; return [g.contentPx * PAGE.relaxAbove, PAGE.keepRows, g.contentPx, PAGE.fillFloor]; };

/** Header/footer templates for Chrome's print (separate documents: inline styles only). */
/** The footer's confidentiality mark: this document's label, else the design pack's, else the house label. */
export const confidentialText = (doc, theme, labels, locale) => doc?.labels?.confidential ?? theme?.labels?.[locale]?.confidential ?? (theme?.brand?.confidential || labels.confidential);

/** One running item's words: a field reads the document (so the cover and the band never disagree). */
export function chromeItemText(it, doc, o) {
  const c = doc.control || {};
  if (it.kind === 'text') return textOf(it.value);
  if (it.kind !== 'field') return '';
  if (it.value === 'confidentiality') return confidentialText(doc, o.theme, o.labels || o.L || {}, o.locale);
  if (it.value === 'producer') return o.theme?.brand?.producer || '';
  return CHROME_FIELDS.includes(it.value) ? textOf(c[it.value] ?? '') : '';
}
/** The items a page shows: every "all" item, plus the segment's own "from" and "only" items. */
export function chromeItems(doc, part, seg) {
  const all = (doc.chrome?.[part]?.items || []).map((it, i) => ({ ...it, part, i })).filter((it) => !it.scope || it.scope === 'all');
  return [...all, ...(seg?.from || []).filter((it) => it.part === part), ...(seg?.only || []).filter((it) => it.part === part)].filter((it) => !it.hidden);
}
/** The item that carries the folio (pdf_post stamps it): its slot and its format, or null. */
export function folioOf(doc, locale) {
  if (!doc.chrome) return { side: 'right', format: 'n' };
  const it = chromeItems(doc, 'footer').concat(chromeItems(doc, 'header')).find((x) => x.kind === 'page');
  if (!it) return null;
  const rtl = locale === 'ar';
  const phys = it.align === 'center' ? 'center' : (it.align === 'start') === rtl ? 'right' : 'left';
  return { side: phys, format: it.value === 'n/N' ? 'n/N' : 'n', part: it.part };
}
function itemSpan(it, doc, o, roles, logos, edit) {
  const ci = edit ? ` data-ci="${it.part}:${it.i}"${it.scope && it.scope !== 'all' ? ` data-scope="${attr(it.scope)}"` : ''}` : '';
  if (it.kind === 'logo') {
    const src = SAFE_IMG.test(String(it.src || '')) ? it.src : logos?.[it.value || 'header'];
    return src && SAFE_IMG.test(src) ? `<img src="${attr(src)}" style="height:5mm;"${ci} />` : edit ? `<span${ci} class="bw-ci-empty">▢</span>` : '';
  }
  if (it.kind === 'page') return `<span style="font-weight:700;display:inline-block;min-width:8mm;"${ci}${edit ? ' data-bw-page' : ''}>${edit ? (it.value === 'n/N' ? '1 / 1' : '1') : ''}</span>`;
  const text = chromeItemText(it, doc, o);
  const look = it.value === 'confidentiality' ? `color:${roles.signal};font-weight:700;` : it.value === 'producer' ? 'font-weight:700;letter-spacing:.08em;' : it.style?.bold ? 'font-weight:700;' : '';
  const ptr = edit && it.kind === 'text' ? ` data-p="/chrome/${it.part}/items/${it.i}/value"` : '';
  return `<span style="${look}"${ci}${ptr}>${esc(text)}</span>`;
}
/** A band's three slots (start, centre, end) in the locale's direction. */
function band(items, doc, o, roles, logos, edit) {
  const slot = (a) => items.filter((it) => (it.align || 'start') === a).map((it) => itemSpan(it, doc, o, roles, logos, edit)).join('');
  return ['start', 'center', 'end'].map((a) => `<span style="display:flex;gap:3mm;align-items:center;"${edit ? ` data-slot="${a}"` : ''}>${slot(a)}</span>`).join('');
}
/** The editor's screen band of one segment (inside <template class="bw-run">): editable items, page placeholder. */
export function runBand(doc, o, part, seg) {
  const theme = designTheme(o.theme, doc);
  const items = chromeItems(doc, part, seg).map((it) => ((seg?.only || []).includes(it) ? { ...it, only: true } : it));
  return `<div class="bw-band" data-part="${part}" dir="${o.locale === 'ar' ? 'rtl' : 'ltr'}">${band(items, doc, { ...o, theme }, theme.vars, theme.logos || o.logos, true)}</div>`;
}

export function chromeTemplates(doc, oIn, seg) {
  const o = { ...oIn, theme: designTheme(oIn.theme, doc) };
  if (doc.chrome) {
    const roles = o.theme.vars;
    const stack = [o.theme.fonts.text, o.theme.fonts.display].map(safeFamily).filter(Boolean).map((f) => `'${f}'`).join(',');
    const wrap = (inner) =>
      `<style>${o.fontCss || ''}</style><div dir="${o.locale === 'ar' ? 'rtl' : 'ltr'}" style="width:100%;font-size:8pt;font-family:${stack},serif;color:${roles.muted};padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">${inner}</div>`;
    return { header: wrap(band(chromeItems(doc, 'header', seg), doc, o, roles, o.logos, false)), footer: wrap(band(chromeItems(doc, 'footer', seg), doc, o, roles, o.logos, false)) };
  }
  const roles = o.theme.vars;
  const stack = [o.theme.fonts.text, o.theme.fonts.display].map(safeFamily).filter(Boolean).map((f) => `'${f}'`).join(',');
  const wrap = (inner) =>
    `<style>${o.fontCss || ''}</style><div style="width:100%;font-size:8pt;font-family:${stack},serif;color:${roles.muted};padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">${inner}</div>`;
  const header = wrap(
    (o.logos?.header ? `<img src="${attr(o.logos.header)}" style="height:5mm;" />` : '<span></span>') +
      `<span>${esc(doc.control.documentId)}</span><span>${esc(doc.control.issuedOn)}</span>`
  );
  const footer = wrap(
    `<span style="color:${roles.signal};font-weight:700;">${esc(confidentialText(doc, o.theme, o.labels, o.locale))}</span>` +
      `<span style="font-weight:700;letter-spacing:.08em;">${esc(o.theme.brand?.producer || '')}</span>` +
      '<span style="font-weight:700;"></span>'
  );
  return { header, footer };
}
