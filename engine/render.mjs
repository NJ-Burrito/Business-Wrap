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
import { isRich, textOf, docNumbers } from './edits.mjs';
import { coveredOf, splitLines } from './cells.mjs';
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
  // a typed line break ("\n": Enter in a cell, Shift+Enter) prints as <br>: the editor, the PDF and the DOCX alike
  const f = makeBidi0(locale);
  return (text) => f(text).replace(/\n/g, '<br>');
}
function makeBidi0(locale) {
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
const LEAF_ALIGN = { start: 'start', center: 'center', end: 'end', justify: 'justify', 'justify-low': 'justify', 'justify-medium': 'justify', 'justify-high': 'justify' };
/** 0.16.2 note J: the kashida level of a paragraph (Word's Justify Low / Medium / High), '' for every other alignment. */
export const KASHIDA_LEVEL = { 'justify-low': 'low', 'justify-medium': 'medium', 'justify-high': 'high' };
const LEAF_VALIGN = { top: 'top', middle: 'middle', bottom: 'bottom' };
const mmOk = (v) => (Number.isFinite(+v) && +v >= 0 && +v <= 60 ? +v : null);
/** 0.17.6 (ruler): a paragraph indent in mm, a number only (start/end 0 to 150; the first line's offset from the start indent, -150 to 150). */
const indOk = (v, lo = 0) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= 150 ? v : null);
/** 0.17.7 (tab stops): a paragraph's tab stops, validated and sorted: [{pos mm 0..400, align start|center|end|decimal}] (at most 40); [] when none are valid. */
export const TAB_ALIGN = { start: 1, center: 1, end: 1, decimal: 1 };
export function tabsOf(st) {
  const raw = st && Array.isArray(st.tabs) ? st.tabs : [];
  const out = [];
  for (const t of raw) {
    if (!t || typeof t.pos !== 'number' || !Number.isFinite(t.pos) || t.pos < 0 || t.pos > 400 || !TAB_ALIGN[t.align]) continue;
    if (out.some((o) => Math.abs(o.pos - t.pos) < 0.05)) continue;
    out.push({ pos: Math.round(t.pos * 100) / 100, align: t.align });
    if (out.length >= 40) break;
  }
  return out.sort((x, y) => x.pos - y.pos);
}
const TABX = '\uE000';
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
  if (indOk(st.indentStart)) d.push(`margin-inline-start:${indOk(st.indentStart)}mm`);
  if (indOk(st.indentEnd)) d.push(`margin-inline-end:${indOk(st.indentEnd)}mm`);
  if (indOk(st.indentFirst, -150)) d.push(`text-indent:${indOk(st.indentFirst, -150)}mm`);
  const c = [cls, st.quote ? 'bw-quote' : ''].filter(Boolean).join(' ');
  const tb = tabsOf(st);
  return (c ? ` class="${c}"` : '') + (d.length ? ` style="${d.join(';')}"` : '') + (KASHIDA_LEVEL[st.align] ? ` data-jk="${KASHIDA_LEVEL[st.align]}"` : '') + (tb.length ? ` data-tabs="${tb.map((t) => `${t.pos}:${t.align}`).join(',')}"` : '');
}
/** The list a paragraph belongs to: {kind: 'bullet'|'number'|'shape', shape, level 0–8} or null. */
export function listOf(leaf) {
  const l = isRich(leaf) && leaf.style?.list;
  if (!l) return null;
  const level = Math.max(0, Math.min(8, (leaf.style.level | 0)));
  if (l === 'bullet' || l === 'number') {
    const li = { kind: l, level, numFormat: leaf.style.numFormat };
    const st = leaf.style.start; // 0.14.0 (E2): a number-list run starts at this value, or continues the previous list
    if (l === 'number' && (st === 'continue' || (Number.isInteger(+st) && st !== '' && st !== null && +st >= 0 && +st <= 9999))) li.start = st === 'continue' ? st : +st;
    return li;
  }
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
/** The sheet every chapter that holds a figure or a diagram prints on (`@page wide`): the widest figure sheet, else A4 landscape. */
export function docSheet(doc) {
  const sheets = (doc?.chapters || [])
    .flatMap((ch) => ch.sections || [])
    .flatMap((sec) => sec.blocks || [])
    .flatMap((x) => (x.kind === 'figure' && x.sheet ? [x.sheet] : []));
  return sheets.reduce((w, s) => (!w || s.widthMm > w.widthMm ? s : w), null) ?? { widthMm: 297, heightMm: 210, drawHeightMm: 146, name: 'A4 landscape' };
}
/** mm of a CSS length written as the theme writes sizes (pt, px, mm, cm, em). */
const cssMm = (v, d) => {
  const m = /^(\d+(?:\.\d+)?)(pt|px|mm|cm|em)$/.exec(String(v)); // leaf-ok: a CSS length from the theme, not a text leaf
  if (!m) return d;
  const n = +m[1];
  return { pt: (n * 25.4) / 72, px: (n * 25.4) / 96, mm: n, cm: n * 10, em: n * 4.9 }[m[2]];
};
/**
 * 0.15.9 · The room a diagram's canvas has on its page: {wMm, hMm} at most, measured on the sheet it prints on (`@page wide`, margins 14 mm above and 12 mm below),
 * below what must stay with it (the chapter title when the diagram opens the chapter, the section title when it opens the section, a subhead right above it,
 * its own figure title) and above its note, with a small slack. The headings and the title are `break-after:avoid` and the figure `break-inside:avoid`, so a
 * canvas that fits this room always lands, with its titles, on one page; a canvas taller than the page would strand them, which is why the number is a limit.
 */
export function figureRoom(doc, ptr, themeIn) {
  const theme = designTheme(themeIn, doc);
  const sheet = docSheet(doc);
  const side = cssMm(theme.vars?.['page-side'], 16);
  const line = parseFloat(theme.vars?.line) > 0 ? parseFloat(theme.vars.line) : 1.8;
  const m = /^\/chapters\/(\d+)\/sections\/(\d+)\/blocks\/(\d+)$/.exec(ptr || '');
  const blocks = m ? doc.chapters?.[+m[1]]?.sections?.[+m[2]]?.blocks || [] : [];
  const block = m ? blocks[+m[3]] : null;
  const textW = sheet.widthMm - 2 * side;
  const lines = (chars, fontMm) => Math.max(1, Math.ceil((chars * fontMm * 0.58) / textW));
  const t3 = cssMm(theme.sizes?.h3, 4.94);
  const capText = String(textOf(block?.caption ?? '')) ;
  const noteText = String(textOf(block?.note ?? ''));
  const capH = lines(capText.length + 12, t3) * t3 * line + 2.5;
  const tt = cssMm(theme.sizes?.table, 4.23);
  const noteH = noteText ? lines(noteText.length, tt) * tt * line + 1.1 : 0;
  let chain = 0;
  let k = m ? +m[3] - 1 : -1;
  while (k >= 0 && blocks[k]?.kind === 'subhead') { chain += 9 + t3 * line + 4 + 1; k -= 1; } // h4: margin 9, text, padding 4, rule
  // 0.19.0 R3 (review #7): in a typed document the prose that opens the section shares the sheet too (and then the chapter title above it)
  const tb = cssMm(theme.sizes?.body, 4.23);
  if (isTyped(doc)) while (k >= 0 && blocks[k]?.kind === 'prose') { for (const para of blocks[k].paragraphs || []) chain += lines(String(textOf(para ?? '')).length, tb) * tb * line + 3.5; k -= 1; }
  if (m && k < 0) {
    // a chapter with one section prints no section title; with several, every section has one (room for two lines)
    if ((doc.chapters?.[+m[1]]?.sections || []).length > 1) chain += 7 + 2 * cssMm(theme.sizes?.h2, 5.64) * line + 3;
    // the chapter title: 12 mm above it unless it is the first chapter, its line, 4 mm padding, the rule, 7 mm below
    if (+m[2] === 0) chain += (+m[1] > 0 ? 12 : 0) + Math.max(cssMm(theme.sizes?.h1, 6.35) * line, 11) + 4 + 7 + 1;
  }
  // 0.19.0 R3 (review #7): in a typed document a short table (at most 6 rows) right after the figure keeps room on the same sheet, so it never lands alone
  const nxt = m ? blocks[+m[3] + 1] : null;
  const tail = isTyped(doc) && nxt?.kind === 'table' && (nxt.rows || []).length <= 6 ? ((nxt.rows || []).length + 1) * (tt * line + 5) + 7 : 0;
  const wMm = Math.floor((textW - 0.6) * 10) / 10;
  const hMm = Math.max(40, Math.floor((sheet.heightMm - 14 - 12 - chain - capH - noteH - tail - 2.7 - 0.6 - 5) * 10) / 10);
  return { wMm, hMm, sheetW: sheet.widthMm, sheetH: sheet.heightMm, sideMm: side, chainMm: Math.round(chain * 10) / 10, captionMm: Math.round(capH * 10) / 10, noteMm: Math.round(noteH * 10) / 10 };
}
/**
 * 0.16.0 · The frame, in mm, a diagram block really prints in: its own canvas (block.frame) kept inside the room the page leaves it, else the automatic figure's
 * box (the room's width less the figure box's padding and rule, the height capped at DIAGRAM.PRINT.maxHmm). The legibility check measures against this, so the
 * editor, the check and the PDF agree; with no document it is DIAGRAM.PRINT.
 */
export function figureFrame(doc, ptr, themeIn) {
  const m = /^\/chapters\/(\d+)\/sections\/(\d+)\/blocks\/(\d+)$/.exec(ptr || '');
  const block = m ? doc?.chapters?.[+m[1]]?.sections?.[+m[2]]?.blocks?.[+m[3]] : null;
  const room = figureRoom(doc, ptr, themeIn);
  const fr = DIAGRAM.frameNorm(block?.frame);
  if (fr) return [Math.min(fr.wMm, room.wMm), Math.min(fr.hMm, room.hMm)];
  return [Math.round((room.wMm - DIAGRAM.PRINT.padMm) * 10) / 10, Math.round(Math.min(DIAGRAM.PRINT.maxHmm, room.hMm - DIAGRAM.PRINT.padMm) * 10) / 10];
}
/** Print geometry of the document's own page (segment 0): CSS px of the content box. */
/**
 * 0.17.6 · Page margins (mm): doc.layout.margins = {top, bottom, start, end}. `start` and `end` are the reading direction's sides (Arabic: right, left), so an
 * Arabic and an English edition of one document mirror each other. A document without the setting gets today's margins (18 above, 16 below, 16 at the sides)
 * and none of the CSS below. Limits: the sides 5 to 50 mm, above and below 10 to 50 mm (the running header and footer sit in that band). The figure sheet
 * (`@page wide`, 14 and 12 mm) and the cover keep their own margins; a section turned landscape keeps the same four margins (not rotated).
 */
export const MARGIN_DEFAULT = { top: 18, bottom: 16, start: 16, end: 16 };
export const MARGIN_LIMIT = { top: [10, 50], bottom: [10, 50], start: [5, 50], end: [5, 50] };
export function marginsOf(doc) {
  const m = doc?.layout?.margins;
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const k of Object.keys(MARGIN_DEFAULT)) {
    const v = +m[k];
    const [lo, hi] = MARGIN_LIMIT[k];
    out[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 10) / 10)) : MARGIN_DEFAULT[k];
  }
  return out;
}
/** True when the document's page differs from the plain A4 with today's margins (a paper size or margins were set). */
export const hasPageGeom = (doc) => !!(doc?.layout?.page || marginsOf(doc));
export function pageGeom(doc) {
  const sp = pageSpec(doc?.layout?.page);
  const mg = marginsOf(doc) || MARGIN_DEFAULT;
  return { ...sp, contentPx: Math.round(((sp.h - mg.top - mg.bottom) / 25.4) * 96), measurePx: Math.round(((sp.w - mg.start - mg.end) / 25.4) * 96) };
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
  // 0.18.1 · start and end are logical: the band's direction (dir=rtl in Arabic) puts «start» on the right, so the same alignments
  // mirror the whole band (the logo, «سري» and the document code at the right; the date and the folio at the left). They were flipped
  // for Arabic before, which landed every item on the same physical side as English.
  void locale;
  return {
    header: { items: [
      { id: 'h-logo', kind: 'logo', value: 'header', align: 'start', scope: 'all' },
      { id: 'h-id', kind: 'field', value: 'documentId', align: 'center', scope: 'all' },
      { id: 'h-date', kind: 'field', value: 'issuedOn', align: 'end', scope: 'all' },
    ] },
    footer: { items: [
      { id: 'f-conf', kind: 'field', value: 'confidentiality', align: 'start', scope: 'all' },
      { id: 'f-prod', kind: 'field', value: 'producer', align: 'center', scope: 'all' },
      { id: 'f-page', kind: 'page', value: 'n', align: 'end', scope: 'all' },
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

/** The user-story ID card as table rows (0.15.1): what a story without a `card` prints, and what the first table edit stores.
 *  A `{label: key}` cell is a house label (/labels/<key>, plain text once stored); a `{bind: field}` cell prints and edits the
 *  story's own field (id, name, as, goal, acceptance), exactly like the control table's `{bind}` cells: the stored fields stay the
 *  single source for the SRS, the harvest and every older edits file. Rows with nothing to print are left out, as before. */
export const STORY_CARD_BINDS = ['id', 'name', 'as', 'goal', 'acceptance'];
export function storyCardDefault(s) {
  const has = { id: s.id, name: s.name, as: s.as, goal: s.goal || s.as || s.want || s.so, acceptance: (s.acceptance || []).length };
  const lab = { id: 'storyId', name: 'storyName', as: 'storyUser', goal: 'storyGoalLabel', acceptance: 'acceptance' };
  return STORY_CARD_BINDS.filter((k) => has[k]).map((k) => [{ label: lab[k] }, { bind: k }]);
}
/** A cell a person kept empty on purpose: `{"text":"","keepEmpty":true}` (0.16.0). It is never blank, so it prints as an empty cell. */
const keepsEmpty = (c) => !!c && typeof c === 'object' && !Array.isArray(c) && c.keepEmpty === true;
const blank = (c) => !keepsEmpty(c) && ['', '—', '-', '–', 'N/A', 'n/a'].includes(textOf(c ?? '').trim());
/** A table cell as the renderer takes it: a rich leaf as is, anything else as its string (0.12.0). */
const keepLeaf = (v) => (isRich(v) ? v : keepsEmpty(v) ? { text: String(v.text ?? ''), marks: [], keepEmpty: true } : String(v));
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
/** 0.16.2 note J · Justify Low / Medium / High. Chrome has no kashida justification, so the stretch is drawn as a DISPLAY layer: after layout
 *  every full line of an Arabic paragraph marked data-jk (low | medium | high) gets empty <i class="bw-k" data-k="ـ.."> elements whose
 *  ::before paints the tatweels (pseudo content: not in textContent, not copied, not found, not spell-checked, not in the document data).
 *  Each line takes a share of its own slack (30 % / 60 % / 95 %), at most 1 / 2 / 4 per word; the rest stays plain justify, so the line
 *  count and every page break are unchanged (a paragraph whose height grew is put back). Last lines, short lines and Latin words are not
 *  touched. The paragraph is laid out with geometricPrecision (fractional glyph advances, as the PDF prints them), so the widths measured on screen are the printed widths. Self-contained: it is also printed into the PDF page as a script (renderDocument), so it must not use anything outside it. */
export function kashidaPass(root) {
  const scope = root || document;
  const els = [...scope.querySelectorAll('[data-jk]')];
  if (!document.getElementById('bw-kashida-css')) {
    const st = document.createElement('style');
    st.id = 'bw-kashida-css';
    st.textContent = '[data-jk]{text-rendering:geometricPrecision}i.bw-k{font:inherit;font-style:normal;text-decoration:none;padding:0;margin:0;border:0;background:none}i.bw-k::before{content:attr(data-k)}.bw-kp{position:absolute;visibility:hidden;white-space:pre;left:0;top:0}';
    document.head.appendChild(st);
  }
  const clear = (el) => { for (const k of el.querySelectorAll('i.bw-k')) k.remove(); for (const k of el.querySelectorAll('.bw-kp')) k.remove(); el.normalize(); };
  const FRAC = { low: 0.3, medium: 0.6, high: 0.95 }, CAP = { low: 1, medium: 2, high: 4 };
  const DUAL = 'بتثجحخسشصضطظعغفقكلمنهيئىپچگکی', LETTER = /[\u0621-\u064A\u066E-\u06D3]/;
  for (const el of els) clear(el);
  const TW = '\u0640';
  const probes = els.map((el) => {
    const mk = (txt) => { const s = document.createElement('span'); s.className = 'bw-kp'; s.textContent = txt; el.appendChild(s); return s; };
    return [mk(TW), mk(TW + ' ' + TW)];
  });
  const r = document.createRange(); // ONE live range: every live range is updated by each text split, so one per word would make the inserts quadratic
  const jobs = els.map((el, ei) => {
    const level = el.dataset.jk;
    const h0 = el.getBoundingClientRect().height;
    const tw = probes[ei][0].getBoundingClientRect().width;
    const sp = probes[ei][1].getBoundingClientRect().width - 2 * tw;
    // the words (pieces of a text node between spaces) in reading order, each with its box and its candidate places
    const pieces = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, prevWs = true;
    while ((node = walk.nextNode())) {
      if (node.parentElement.closest('.bw-kp')) continue;
      const data = node.data;
      for (const m of data.matchAll(/\S+/g)) {
        r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length);
        const b = r.getBoundingClientRect();
        const before = m.index > 0 ? /\s/.test(data[m.index - 1]) : prevWs;
        const w = m[0], cands = [];
        for (let i = 0; i < w.length - 1; i += 1) {
          if (DUAL.includes(w[i]) && LETTER.test(w[i + 1]) && !(w[i] === 'ل' && 'اأإآ'.includes(w[i + 1])) && !(i === 0 && w.length < 3)) cands.push(m.index + i + 1);
        }
        cands.reverse(); // the place before the last letter first
        pieces.push({ node, b, before, cands, used: 0, at: [] });
      }
      prevWs = /\s$/.test(data);
    }
    const lines = [];
    for (const p of pieces) {
      if (!p.b.width) continue;
      const cy = (p.b.top + p.b.bottom) / 2, last = lines.at(-1);
      if (last && cy >= last.top && cy <= last.bottom) { last.ps.push(p); last.top = Math.min(last.top, p.b.top); last.bottom = Math.max(last.bottom, p.b.bottom); }
      else lines.push({ ps: [p], top: p.b.top, bottom: p.b.bottom });
    }
    for (const ln of lines) { ln.l = Math.min(...ln.ps.map((p) => p.b.left)); ln.r = Math.max(...ln.ps.map((p) => p.b.right)); }
    const full = Math.max(0, ...lines.slice(0, -1).map((ln) => ln.r - ln.l));
    const plan = [];
    lines.slice(0, -1).forEach((ln) => {
      if (ln.ps.length < 2 || ln.r - ln.l < full - 1.5) return; // a short line (a forced break) is not stretched
      const spaces = ln.ps.slice(1).filter((p) => p.before).length;
      const slack = ln.r - ln.l - ln.ps.reduce((a, p) => a + p.b.width, 0) - spaces * sp;
      let n = Math.floor((Math.min(slack * FRAC[level], slack - 3)) / tw);
      if (!(tw > 0) || n < 1) return;
      const cap = CAP[level];
      for (let progress = true; n > 0 && progress;) {
        progress = false;
        for (const p of ln.ps) {
          if (n > 0 && p.used < cap && p.cands.length) { p.at.push(p.cands[p.used % p.cands.length]); p.used += 1; n -= 1; progress = true; }
        }
      }
      plan.push(...ln.ps.filter((p) => p.at.length));
    });
    return { el, h0, plan };
  });
  for (const el of els) for (const k of el.querySelectorAll('.bw-kp')) k.remove();
  for (const j of jobs) {
    const byNode = new Map();
    for (const p of j.plan) {
      const m = byNode.get(p.node) || new Map();
      for (const off of p.at) m.set(off, (m.get(off) || 0) + 1);
      byNode.set(p.node, m);
    }
    for (const [nd, m] of byNode) {
      for (const [off, c] of [...m].sort((a, b) => b[0] - a[0])) {
        const tail = nd.splitText(off);
        const k = document.createElement('i');
        k.className = 'bw-k';
        k.setAttribute('aria-hidden', 'true');
        k.setAttribute('data-k', TW.repeat(c));
        tail.parentNode.insertBefore(k, tail);
      }
    }
  }
  // the guard: a paragraph that grew (a line wrapped) is put back to plain justify
  r.detach();
  const grew = jobs.filter((j) => j.plan.length && j.el.getBoundingClientRect().height > j.h0 + 0.5); // all reads first, then the writes
  for (const j of grew) clear(j.el);
  return { n: jobs.length, reverted: grew.length };
}
/** The script a printed page carries when it holds a kashida paragraph (none otherwise: an old document is byte-identical). */
export function kashidaScript(doc) {
  // the PDF is printed at the page's own width while the export window is narrower: under print media the page is laid out at the sheet width, so the stretch is measured where it is printed
  return `<style id="bw-kashida-print">@media print{html{min-width:${pageSpec(doc?.layout?.page).w}mm}}</style><script id="bw-kashida">(function(){var run=${kashidaPass.toString()};function go(){try{run(document)}catch(e){}}window.bwKashida=go;if(document.fonts){document.fonts.ready.then(go);document.fonts.addEventListener('loadingdone',go)}else go();window.addEventListener('load',go)})()<\/script>`;
}

/**
 * 0.17.7 (tab stops) · The tab characters of a paragraph that has stops (data-tabs="mm:align,…" on the element, from style.tabs) are drawn as
 * <span class="bw-tab"> (inline-block, contenteditable=false, the \t stays its text) and this pass gives each span the width that carries the text
 * after it to the next stop: start = the text begins at the stop, center = its middle, end = its end, decimal = its first . , or ٫ . Stops are
 * measured from the text column's start edge (the right edge in Arabic; logical, so RTL mirrors for free); past the last custom stop Word's
 * default grid of 12.7 mm applies. CSS tab-size only gives equal steps, so it is not used. Self-contained: it is also printed into the PDF page as a script.
 */
export function tabPass(root) {
  const scope = root || document;
  const els = scope.matches && scope.matches('[data-tabs]') ? [scope] : [...scope.querySelectorAll('[data-tabs]')];
  const DEF = 12.7;
  let n = 0;
  for (const el of els) {
    const tabs = [...el.querySelectorAll('.bw-tab')];
    if (!tabs.length) continue;
    const stops = String(el.getAttribute('data-tabs') || '').split(',').map((q) => { const m = q.split(':'); return { pos: +m[0], align: m[1] }; }).filter((q) => Number.isFinite(q.pos)).sort((a, b) => a.pos - b.pos);
    const cs = getComputedStyle(el);
    const rtl = cs.direction === 'rtl';
    const r0 = el.getBoundingClientRect();
    const scale = el.offsetWidth ? r0.width / el.offsetWidth : 1;
    const pxmm = (96 / 25.4) * scale;
    const ms = (parseFloat(cs.marginInlineStart) || 0) * scale;
    const origin = rtl ? r0.right + ms : r0.left - ms;
    for (const t of tabs) t.style.width = '0px';
    tabs.forEach((t, k) => {
      const rt = t.getBoundingClientRect();
      const x = ((rtl ? origin - rt.left : rt.left - origin)) / pxmm;
      // the text after this tab, up to the next tab: its width on this tab's line (and, for decimal, the width up to the decimal mark)
      const next = tabs[k + 1] || null;
      const lineW = (rg) => { let w = 0; for (const q of rg.getClientRects()) if (q.bottom > rt.top + 1 && q.top < rt.bottom - 1) w += q.width; return w / pxmm; };
      const body = () => { const rg = document.createRange(); rg.setStartAfter(t); if (next) rg.setEndBefore(next); else rg.setEnd(el, el.childNodes.length); return rg; };
      const after = () => lineW(body());
      // a decimal stop: the distance from where the text starts to the near edge of its first . , or the Arabic decimal mark (the whole width when there is none)
      const toMark = () => {
        const walker = document.createTreeWalker(el, 4);
        let nd;
        let started = false;
        while ((nd = walker.nextNode())) {
          if (!started) { if (!(t.compareDocumentPosition(nd) & 4)) continue; started = true; }
          if (next && ((next.compareDocumentPosition(nd) & 4) || next.contains(nd))) break;
          const i = nd.data.search(/[.,\u066B]/);
          if (i < 0) continue;
          const rg = document.createRange();
          rg.setStart(nd, i); rg.setEnd(nd, i + 1);
          const q = rg.getBoundingClientRect();
          return (rtl ? rt.left - q.right : q.left - rt.left) / pxmm;
        }
        return after();
      };
      const cand = stops.filter((q) => q.pos > x + 0.05);
      let width = null;
      for (const q of cand) {
        const w = q.align === 'center' ? after() / 2 : q.align === 'end' ? after() : q.align === 'decimal' ? toMark() : 0;
        const room = q.pos - x - w;
        if (room >= -0.01) { width = Math.max(0, room); break; }
      }
      if (width == null) width = (Math.floor(x / DEF + 1e-6) + 1) * DEF - x;
      t.style.width = `${(width * 96) / 25.4}px`;
      n += 1;
    });
  }
  return n;
}
/** The script a printed page carries when it holds a tab stop (none otherwise: an old document is byte-identical). */
export function tabScript() {
  return `<script id="bw-tabs">(function(){var run=${tabPass.toString()};function go(){try{run(document)}catch(e){}}window.bwTabs=go;if(document.fonts){document.fonts.ready.then(go);document.fonts.addEventListener('loadingdone',go)}else go();window.addEventListener('load',go)})()<\/script>`;
}

export function renderDocument(doc, o) {
  const locale = o.locale || 'ar';
  const theme = designTheme(o.theme, doc);
  const L = withLabels(o.labels, theme?.labels?.[locale], doc.labels);
  const bidi = makeBidi(locale);
  const logos = o.logos || {};
  const parts = renderParts(doc, { ...o, locale, bidi, L });

  const main = documentMain(parts, logos, locale);
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
${main}
${o.extraBody || ''}
${/ data-jk="/.test(main) ? kashidaScript(doc) : ''}${/ data-tabs="/.test(main) ? tabScript() : ''}</body></html>`;
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
/**
 * 0.17.0 (pages): the PDF is laid out on a page whose width Chrome rounds to whole pixels (A4: 793.7 px becomes 794 px), the editor's page is the exact
 * 210 mm. A third of a pixel is enough to flip a line that fills its cell to the hair (a roles table row of three lines printed, four in the editor: five
 * millimetres, then a held group of three rows fitting one page in the PDF and not in the editor). In print, `.wrap` takes the exact width the editor
 * uses. Not applied while the print pass measures (that page is the measure wide, below the threshold), so the verdicts of relaxTallGroups are
 * unchanged. The full-bleed bands (h4, .gap) reach the page edge again by the same amount.
 */
export function printTrimCss(doc) {
  const wmm = doc?.layout?.page ? pageSpec(doc.layout.page).w : 210;
  const measure = hasPageGeom(doc) ? pageGeom(doc).measurePx : PAGE.measurePx;
  const mg = marginsOf(doc);
  const endv = mg ? `${mg.end}mm` : 'var(--page-side)';
  const px = (wmm / 25.4) * 96;
  const x = Math.round(px) - px;
  if (!(Math.abs(x) > 0.01)) return '';
  const t = (+x.toFixed(3)).toString();
  return `@media print and (min-width:${measure + 40}px){.wrap{width:calc(100% - ${t}px);box-sizing:border-box}h4,.gap{margin-inline-end:calc(0mm - ${endv} - ${t}px)}}`;
}
// ---- 0.18.0 (document studio): page-1 designs and one category colour; 0.19.0: NO motif and no art on page 1, ever (work/sdlc/design/0190-types.md) ----
// `doc.coverDesign` (a page-1 family) and `doc.docType` are additive keys; with no coverDesign (and no old `motif`), nothing here prints and the output is
// byte for byte what it was. The colours are the document's own design vars (doc.design.vars), so a category palette reaches the PDF and the DOCX without a
// new colour. 0.19.0: page 1 is drawn only with straight horizontal and vertical lines, rectangles and text (spec §1, tests/page1-0190): the 0.18 motif is
// gone from render, PDF and Word, and an old file that still carries `motif` prints without it (the key is read only to know the type).
// Families (spec §1): spine (title page with the control block), compact (a title block on page 1), and (0.19.0 R2) report (a decision paper: band,
// key-figure tiles C4, decision box C5, control block), form (a header on page 1: ID box or badge C6, field grid, statement C5, then chapter 1 on the
// same page) and sheet (landscape: fields in one row, a summary strip of status tiles C4, then the sheet). `design` is the page model the editor and
// pdf_post.py read (report is a title page = spine; form and sheet are a header on page 1 = compact); `family` picks the drawing. Every family is
// driven by the content key `cover` only, and prints a sound page 1 without it (no fields, figures, badge or statement yet).
// engine/docx/cover_design.py mirrors the constants below.
export const COVER_DESIGNS = ['spine', 'compact', 'report', 'form', 'sheet'];
const COVER_LAYOUT = { spine: 'spine', report: 'spine', compact: 'compact', form: 'compact', sheet: 'compact' };
/** The type ids a document may name in docType (or, in a 0.18 file, in `motif`). */
export const COVER_TYPES = ['blank', 'srs', 'user-manual', 'tot', 'tor', 'brd', 'frs', 'test-plan', 'test-cases', 'uat-signoff', 'release-notes', 'change-request', 'minutes', 'process-flow', 'rtm', 'defect-report', 'business-case'];
/** C2: the Latin type code (type.json `code`); never taken from the title. Blank has none. */
export const COVER_CODES = { srs: 'SRS', brd: 'BRD', frs: 'FRS', rtm: 'RTM', 'process-flow': 'PF', 'test-plan': 'TP', 'test-cases': 'TC', 'defect-report': 'DEF', 'uat-signoff': 'UAT', 'release-notes': 'RN', 'user-manual': 'UM', tot: 'TOT', tor: 'TOR', 'change-request': 'CR', minutes: 'MOM', 'business-case': 'BC' };
/** The types whose tables are dense (a washed header, a faint zebra): the sheets people scan down. */
export const COVER_DENSE = ['test-cases', 'rtm', 'defect-report', 'release-notes'];
/** The house values of the two roles the spine code needs when a theme has none. */
const SPINE_FALLBACK = { gold: '#be9a41', deep: '#001e3d' };
/** C3 on the spine title page: the eight common control fields, in print order (spec §1). `approvedBy` is an additive control key; absent, its box is blank. */
export const COVER_CONTROL = ['documentId', 'version', 'status', 'issuedOn', 'owner', 'preparedBy', 'approvedBy', 'classification'];
/** Labels of the fields that have none in the house labels (i18n.json `control`): a document's labels.control.<key> wins. */
export const COVER_LABELS = { approvedBy: { en: 'Approved by', ar: 'جهة الاعتماد' } };
/** C3 kinds and grid widths (schema S2). */
export const FIELD_KINDS = ['text', 'chip', 'date', 'blank'];
export const FIELD_COLS = [2, 3, 4, 6];
/** C4 tile kinds (schema S2) and the report's control block (spec §1: ID, version, status, date, owner, prepared by; the type's fields follow). */
export const FIGURE_KINDS = ['none', 'ok', 'warn', 'bad', 'idle'];
export const REPORT_CONTROL = ['documentId', 'version', 'status', 'issuedOn', 'owner', 'preparedBy'];
/** Words the families print that are no house label (a document's labels.<key> wins): back matter heading (C10), the derived summary strip's total,
 * the seal box of a sign-off statement. */
/** 0.19.0 R3 (pilot review #3): a document with a page-1 family (coverDesign) prints its revision history in Version, Date, Description of change, Author (as many as its rows carry). */
export const REV_LABELS = { revDesc: { en: 'Description of change', ar: 'وصف التغيير' }, revAuthor: { en: 'Author', ar: 'المعد' } };
export const revCols = (doc) => (coverOf(doc) ? Math.min(4, Math.max(2, ...(doc.revisions || []).filter(Array.isArray).map((r) => r.length))) : 2);
/** 0.19.0 R3 (pilot review #15): the approvals columns Role, Name, Organisation, Date, Signature in % (room for a hand-written name and a signature). */
export const APPROVAL_WIDTHS = [26, 24, 20, 12, 18];
export const FAMILY_LABELS = {
  backMatter: { en: 'Document control', ar: 'ضبط الوثيقة' },
  total: { en: 'Total', ar: 'الإجمالي' },
  seal: { en: 'Seal', ar: 'الختم' },
};
/** The parts a form or a sheet prints after its last chapter (C10): `layout.back` when set, else control and revisions (spec §1: no contents list). */
export function backOf(doc) {
  const fam = coverOf(doc)?.family;
  const asked = Array.isArray(doc?.layout?.back) ? doc.layout.back.filter((k) => k === 'control' || k === 'revisions') : null;
  const keys = asked ?? (fam === 'form' || fam === 'sheet' ? ['control', 'revisions'] : []);
  const hide = new Set(doc?.layout?.hide || []);
  return [...new Set(keys)].filter((k) => !hide.has(k));
}
/** True for a family with no contents list (form, sheet). */
export const noContents = (doc) => ['form', 'sheet'].includes(coverOf(doc)?.family);
/**
 * The page-1 design a document asks for: { design: the layout drawn (spine | compact), family: the asked family, type: the type id or '' } or null (today's
 * cover). A 0.18 `motif` alone still means the spine design; it is never drawn.
 */
export function coverOf(doc) {
  const old = COVER_TYPES.includes(doc?.motif) ? doc.motif : '';
  const type = COVER_TYPES.includes(doc?.docType) ? doc.docType : old;
  const family = COVER_DESIGNS.includes(doc?.coverDesign) ? doc.coverDesign : old ? 'spine' : '';
  return family ? { design: COVER_LAYOUT[family], family, type } : null;
}
const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
/** WCAG contrast of two #rrggbb colours (computed from the live palette, never typed). */
export const contrastOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** The spine code's colour: the gold where it reads on the spine (4.5:1), else the pale gold step. */
export function spineCodeColor(vars) {
  const gold = vars['accent-bright'] || SPINE_FALLBACK.gold;
  const deep = vars['primary-deep'] || SPINE_FALLBACK.deep;
  return /^#[0-9a-f]{6}$/i.test(gold) && /^#[0-9a-f]{6}$/i.test(deep) && contrastOf(gold, deep) < 4.5 ? vars['accent-200'] || '#e3ddce' : gold;
}
/** The user manual's tag words for a callout (a note, a tip, an important point, a warning) in both languages. */
export const CALLOUT_TAGS = { note: ['Note', 'ملاحظة'], tip: ['Tip', 'نصيحة'], important: ['Important', 'مهم'], warning: ['Warning', 'تحذير'] };
const CALLOUT_RE = new RegExp(`^(${Object.values(CALLOUT_TAGS).flat().join('|')})\\s*[:：—–-]\\s*`, 'u');
/** A paragraph's callout kind and tag word when it opens with one ("Note: ..."), else null. */
export function calloutOf(text) {
  const m = CALLOUT_RE.exec(String(text ?? ''));
  if (!m) return null;
  const kind = Object.keys(CALLOUT_TAGS).find((k) => CALLOUT_TAGS[k].includes(m[1]));
  return { kind, tag: m[1], len: m[0].length };
}
/** A manual step's own prefix: "Step 2:" / «الخطوة 2:» (render.mjs subhead, build_docx.py step chip). */
export const STEP_PREFIX = /^(?:Step|الخطوة)\s+\d+\s*[:：]\s*/u;
/** True for a user manual: its steps and callouts take the manual's look. */
export const isManual = (doc) => doc?.motif === 'user-manual' || doc?.docType === 'user-manual';
/** C3: the field grid's stylesheet (square corners, straight rules only: it may print on page 1). */
const FIELD_GRID_CSS = `.bw-fields{display:grid;grid-template-columns:repeat(var(--fg-cols,2),minmax(0,1fr));gap:.75pt;background:var(--rule);border:.75pt solid var(--rule-strong);margin:0;line-height:1.4}
.bw-fields>.fg{background:var(--paper,#fff);min-height:11mm;padding:1.6mm 2.5mm 1.8mm;break-inside:avoid;min-width:0}
.bw-fields .fg-l{display:block;font-size:var(--t-micro);color:var(--muted);font-weight:400;margin-bottom:.8mm}
.bw-fields .fg-v{display:block;font-size:9.5pt;color:var(--ink);font-weight:700;overflow-wrap:anywhere}
.bw-fields .fg-date{white-space:nowrap;unicode-bidi:isolate}
.bw-fields .fg-chip{display:inline-block;padding:0 2mm;background:var(--primary-100,#e1eaf4);color:var(--primary-deep,#001e3d)}
.bw-fields .fg-chip.st-ok{background:var(--success-100,transparent);color:var(--success-700)}
.bw-fields .fg-chip.st-bad{background:var(--signal-100,transparent);color:var(--signal-600)}
.bw-fields .fg-chip.st-warn{background:var(--accent-100,transparent);color:var(--accent-800)}
.bw-fields .fg-chip.st-idle{background:var(--neutral-100,transparent);color:var(--neutral-700)}
.bw-fields .fg-blank{min-height:5mm}`;
/** C4 tiles, C5 statement box, C6 badge and the form's ID box: square corners, straight rules, solid fills only (they print on page 1). */
const FAMILY_PARTS_CSS = `.bw-tiles{display:grid;grid-template-columns:repeat(var(--tl-n,4),minmax(0,1fr));gap:2mm;margin:0;line-height:1.3}
.bw-tiles>.tl{background:var(--primary-50,#f2f6fa);border-top:.75pt solid var(--rule-strong);padding:2.2mm 3mm 2.6mm;min-width:0;break-inside:avoid}
.bw-tiles .tl-l{display:block;font-size:var(--t-micro);color:var(--muted);margin-bottom:1mm}
.bw-tiles .tl-v{display:block;font-weight:700;font-size:17pt;line-height:1.15;color:var(--primary-deep,#001e3d);overflow-wrap:anywhere}
.bw-tiles>.tl-ok{background:var(--success-100,#e6f2ea)}.bw-tiles>.tl-ok .tl-v{color:var(--success-700)}
.bw-tiles>.tl-bad{background:var(--signal-100,#f9e3e3)}.bw-tiles>.tl-bad .tl-v{color:var(--signal-600)}
.bw-tiles>.tl-warn{background:var(--accent-100,#f3ecdc)}.bw-tiles>.tl-warn .tl-v{color:var(--accent-800)}
.bw-tiles>.tl-idle{background:var(--neutral-100,#efefed)}.bw-tiles>.tl-idle .tl-v{color:var(--neutral-700)}
.bw-stmt{border:1.2pt solid var(--primary);background:var(--primary-50,#f2f6fa);padding:3.5mm 4mm;margin:0;break-inside:avoid;line-height:1.55;font-size:var(--t-table)}
.bw-stmt .st-t{margin:0;font-weight:700;color:var(--ink)}
.bw-stmt .st-items{list-style:none;margin:2mm 0 0;padding:0}
.bw-stmt .st-items li{position:relative;padding-inline-start:4.5mm;margin:0 0 1mm}
.bw-stmt .st-items li::before{content:"";position:absolute;inset-inline-start:0;top:.62em;width:1.6mm;height:1.6mm;background:var(--primary)}
.bw-stmt .st-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;margin-top:3mm}
.bw-stmt .st-choices{display:flex;flex-wrap:wrap;gap:2mm 8mm}
.bw-stmt .st-ch{display:inline-flex;align-items:center;gap:2mm;font-weight:700}
.bw-stmt .st-box{display:inline-block;flex:0 0 auto;width:4mm;height:4mm;border:.75pt solid var(--ink);background:var(--paper,#fff)}
.bw-stmt .st-seal{flex:0 0 auto;width:30mm;height:22mm;border:.75pt solid var(--rule-strong);background:var(--paper,#fff);padding:1.2mm 2mm;font-size:var(--t-micro);color:var(--muted)}
.bw-idbox{flex:0 0 auto;min-width:44mm;max-width:70mm;border:1.2pt solid var(--primary);padding:2mm 3mm 2.4mm;background:var(--paper,#fff)}
.bw-idbox .ib-l,.bw-badge .bg-l{display:block;font-size:var(--t-micro);margin-bottom:.8mm}
.bw-idbox .ib-l{color:var(--muted)}
.bw-idbox .ib-v{display:block;font-weight:700;font-size:13pt;line-height:1.2;color:var(--primary-deep,#001e3d);white-space:nowrap;unicode-bidi:isolate}
.bw-badge{flex:0 0 auto;min-width:36mm;background:var(--primary);color:var(--paper,#fff);padding:2.2mm 4mm 2.6mm}
.bw-badge .bg-l{color:var(--paper,#fff);opacity:.85}
.bw-badge .bg-v{display:block;font-weight:700;font-size:24pt;line-height:1.1;white-space:nowrap;unicode-bidi:isolate}`;
/** The stylesheet of the page-1 designs; '' for a document that asks for none. fam = the quoted display family. */
export function coverCss(doc, theme, fam = {}) {
  const cv = coverOf(doc);
  if (!cv) return '';
  const vars = theme.vars || {};
  const display = fam.display || 'inherit';
  const px = 'inset-inline:34mm 16mm';
  const base = `/* 0.19.0 page 1: ${cv.family}${cv.type ? ' / ' + cv.type : ''} (no motif, no art) */
.cover[data-cover]{print-color-adjust:exact;-webkit-print-color-adjust:exact}
${FIELD_GRID_CSS}${['report', 'form', 'sheet'].includes(cv.family) ? `
${FAMILY_PARTS_CSS}
.bw-tiles .tl-v,.bw-badge .bg-v,.bw-idbox .ib-v{font-family:${display},system-ui,sans-serif}` : ''}`;
  const dense = COVER_DENSE.includes(cv.type) && !('th-fill' in vars) && !('zebra' in vars) ? ':root{--th-fill:var(--primary-100);--zebra:var(--primary-50)}\n' : '';
  // 0.19.0 R2: the head families (a header on page 1) add an ID box or badge at the end of the title row, the field grid, the statement and the tiles
  const head = cv.family === 'form' || cv.family === 'sheet' ? `
.cover[data-cover=compact] .tb-row{align-items:flex-start}
.cover[data-cover=compact] h1{font-size:${cv.family === 'sheet' ? 16 : 18}pt}
.cover[data-cover=compact] .bw-fields,.cover[data-cover=compact] .bw-tiles,.cover[data-cover=compact] .bw-stmt{margin-top:4mm}
${cv.family === 'sheet' ? '.cover[data-cover=compact] .tb-row{padding:4mm 0 3mm}\n.cover[data-cover=compact] .bw-tiles{gap:1.5mm}\n.cover[data-cover=compact] .bw-tiles .tl-v{font-size:16pt}\n' : ''}` : '';
  if (cv.family === 'report') {
    // report (spec §1): a title page; the logo row (20 to 40 mm), the band C1 (40 to 120 mm, gold cap at the reading start), then the tiles C4, the
    // decision box C5 and the control block C3, the foot at 258 mm as on the spine page
    return `${base}
.cover[data-cover=spine][data-family=report]{display:block;position:relative}
.cover[data-family=report] .lockup{position:absolute;top:20mm;${px};height:20mm;padding:0;min-height:0;justify-content:flex-start;gap:6mm}
.cover[data-family=report] .lockup img{height:auto;max-height:20mm;max-width:50mm;margin:0}
.cover[data-family=report] .rp-band{position:absolute;top:40mm;left:0;right:0;height:80mm;background:var(--primary-deep);color:var(--paper,#fff)}
.cover[data-family=report] .rp-band .cap{position:absolute;top:0;bottom:0;inset-inline-start:0;width:20mm;background:var(--accent-bright)}
.cover[data-family=report] .rp-in{position:absolute;${px};bottom:12mm}
.cover[data-family=report] .rp-code{display:inline-block;background:var(--paper,#fff);color:var(--primary-deep);font-family:${display},system-ui,sans-serif;font-weight:700;font-size:var(--t-meta);letter-spacing:.12em;padding:.8mm 3mm;line-height:1.5;margin-inline-end:3mm}
.cover[data-family=report] .kicker{display:inline-block;margin:0;font-size:var(--t-meta);color:var(--accent-bright)}
.cover[data-family=report] h1{color:var(--paper,#fff);margin-top:5mm}
.cover[data-family=report] .subtitle{color:var(--paper,#fff);opacity:.8;margin-top:3mm}
.cover[data-family=report] .rp-body{position:absolute;top:128mm;${px};display:flex;flex-direction:column;gap:5mm}
.cover[data-family=report] .cover-foot{position:absolute;top:258mm;${px};margin:0;padding:6mm 0 0;font-size:var(--t-meta);border-top:.75pt solid var(--rule);display:flex;justify-content:space-between;gap:6mm;color:var(--muted)}
${dense}`;
  }
  if (cv.design === 'compact') {
    const mg = marginsOf(doc);
    return `${base}
.cover[data-cover=compact]{display:block;page:auto;height:auto;overflow:visible;break-after:auto;padding-block:0 7mm;padding-inline:var(--pm-start,var(--page-side)) var(--pm-end,var(--page-side))}
@page:first{margin:${mg ? mg.top : 18}mm 0 ${mg ? mg.bottom : 16}mm;background:${safeToken(['paper', vars.paper]) ? vars.paper : '#fff'}}
.cover[data-cover=compact] .tb-band{position:relative;height:2.5mm;background:var(--primary-deep)}
.cover[data-cover=compact] .tb-band i{position:absolute;top:0;bottom:0;inset-inline-start:0;width:20mm;background:var(--accent-bright)}
.cover[data-cover=compact] .lockup{padding:5mm 0 0;min-height:0;justify-content:flex-start}
.cover[data-cover=compact] .lockup:empty{display:none}
.cover[data-cover=compact] .lockup img{height:auto;max-height:12mm;margin:0}
.cover[data-cover=compact] .tb-row{display:flex;align-items:center;justify-content:space-between;gap:8mm;padding:6mm 0 5mm}
.cover[data-cover=compact] .tb-main{flex:1;min-width:0}
.cover[data-cover=compact] .tb-id{display:flex;align-items:center;gap:3mm;margin-bottom:3mm}
.cover[data-cover=compact] .tb-code{background:var(--primary);color:var(--paper,#fff);font-family:${display},system-ui,sans-serif;font-weight:700;font-size:var(--t-meta);letter-spacing:.12em;padding:.8mm 3mm;line-height:1.5}
.cover[data-cover=compact] .kicker{margin:0}
.cover[data-cover=compact] .subtitle{margin-top:3mm}
.cover[data-cover=compact] .tb-meta{display:flex;justify-content:space-between;gap:6mm;padding:2.5mm 0;border-top:.75pt solid var(--rule-strong);border-bottom:.75pt solid var(--rule);font-size:var(--t-meta);color:var(--muted)}
.cover[data-cover=compact]+.wrap{padding-top:6mm}${head}
${dense}`;
  }
  return `${base}
.cover[data-cover=spine] .spine{position:static}
.cover[data-cover=spine] .spine .cap{inset-inline:auto;inset-inline-start:0;width:20mm;height:20mm}
.cover[data-cover=spine] .spine .id{position:absolute;top:110mm;left:0;width:20mm;height:62mm;display:flex;align-items:center;justify-content:center;font-size:var(--t-micro);letter-spacing:.3em;color:${spineCodeColor(vars)}}
.bw-doc[dir=rtl] .cover[data-cover=spine] .spine .id{transform:none;left:auto;right:0}
.cover[data-cover=spine] .lockup{position:absolute;top:20mm;${px};height:20mm;padding:0;min-height:0;justify-content:flex-start;gap:6mm}
.cover[data-cover=spine] .lockup img{height:auto;max-height:20mm;max-width:50mm;margin:0}
.cover[data-cover=spine] .cover-rule{position:absolute;top:56mm;${px};margin:0;height:.75pt;background:var(--rule)}
.cover[data-cover=spine] .lockup:empty+.cover-rule{display:none}
.cover[data-cover=spine] .cover-body{display:contents}
.cover[data-cover=spine] .type-code{position:absolute;top:91mm;inset-inline-start:34mm;font-family:${display},system-ui,sans-serif;font-weight:900;font-size:17.14mm;line-height:1;letter-spacing:.07em;color:var(--primary)}
.cover[data-cover=spine] .kicker{position:absolute;top:119.5mm;inset-inline-start:34mm;margin:0;font-size:var(--t-meta);color:var(--accent)}
.cover[data-cover=spine] .rule-short{position:absolute;top:134.5mm;inset-inline-start:34mm;width:20mm;height:.75pt;margin:0}
.cover[data-cover=spine] .cover-title{position:absolute;top:141mm;${px}}
.cover[data-cover=spine] .cover-title .subtitle{margin-top:3mm}
.cover[data-cover=spine] .cover-ctl{position:absolute;bottom:45mm;inset-inline-start:34mm;width:152mm;display:flex;flex-direction:column;gap:4mm}
.cover[data-cover=spine] .cover-foot{position:absolute;top:258mm;${px};margin:0;padding:6mm 0 0;font-size:var(--t-meta);border-top:.75pt solid var(--rule)}
${dense}`;
}
/**
 * 0.18.0 polish (L10a): the status words a table cell may carry, by kind, in both languages. A cell whose WHOLE text is one of them takes the fill of
 * covers.md section 4 (the word stays): ok = Pass / Covered, bad = Fail / Gap, warn = Blocked / Partial, idle = Not run.
 */
export const STATUS_WORDS = {
  ok: ['Pass', 'Passed', 'Covered', 'ناجح', 'نجح', 'مغطى'],
  bad: ['Fail', 'Failed', 'Gap', 'فاشل', 'فشل', 'ثغرة', 'فجوة'],
  warn: ['Blocked', 'Partial', 'محجوب', 'جزئي'],
  idle: ['Not run', 'لم ينفذ'],
};
const STATUS_KIND = new Map(Object.entries(STATUS_WORDS).flatMap(([k, ws]) => ws.map((w) => [w, k])));
/**
 * 0.19.0 C9: more status and tag words, filled ONLY in a column headed by one of STATUS_HEADS (and in a `chip` field of page 1); the words above fill
 * everywhere, as before. engine/docx/cover_design.py mirrors both lists (tests/cover-designs-0180 compares them).
 */
export const STATUS_WORDS_HEADED = {
  ok: ['Done', 'Approved', 'Accepted', 'Fixed', 'Added', 'منجز', 'معتمد', 'مقبول', 'مصلح', 'مضاف'],
  bad: ['Critical', 'Overdue', 'Rejected', 'Removed', 'Security', 'حرج', 'متأخر', 'مرفوض', 'محذوف', 'أمني'],
  warn: ['High', 'Deferred', 'Changed', 'Deprecated', 'عال', 'مؤجل', 'معدل', 'مهمل'],
  idle: ['Open', 'مفتوح'],
};
export const STATUS_HEADS = ['Status', 'Result', 'Severity', 'Priority', 'Type', 'Impact', 'Decision', 'الحالة', 'النتيجة', 'الخطورة', 'الأولوية', 'النوع', 'الأثر', 'القرار'];
const HEADED_KIND = new Map(Object.entries(STATUS_WORDS_HEADED).flatMap(([k, ws]) => ws.map((w) => [w, k])));
const HEAD_TOKENS = new Set(STATUS_HEADS.flatMap((h) => [h.toLowerCase(), ...(h.startsWith('ال') ? [h.slice(2)] : [])]));
/** True when a column heading names a status column: one of its words (brackets dropped) is a head word («نتيجة الاختبار», "Test result"). */
export const isStatusHead = (text) => String(text ?? '').replace(/\([^)]*\)/g, ' ').split(/[\s/،,]+/).some((w) => w && HEAD_TOKENS.has(w.toLowerCase()));
/** The status kind (ok | bad | warn | idle) of a cell's text, or '' when it is no status word; `headed`: the cell is in a status column (C9). */
export const statusKind = (text, headed = false) => { const t = String(text ?? '').trim(); return STATUS_KIND.get(t) || (headed ? HEADED_KIND.get(t) : '') || ''; };
/** True for a document built from a document type (doc.docType): only these take the 0.18.0 polish; any other document prints as it always did. */
export const isTyped = (doc) => typeof doc?.docType === 'string' && doc.docType !== '';
/** 0.19.0 C7: a typed document prints its `approvals` rows on the control page (HTML and PDF too; Word always did). */
export const approvalsShown = (doc) => isTyped(doc) && Array.isArray(doc.approvals) && doc.approvals.some(Array.isArray);
/** C12: a `shots` block with no image yet prints a screenshot frame (a typed document, or one that sets `ratio` or `badge`). */
export const SHOT_RATIOS = { '16:10': [16, 10], '4:3': [4, 3], '9:16': [9, 16] };
export const SHOT_LABEL = { en: 'Screenshot', ar: 'لقطة الشاشة' };
export const shotFrame = (doc, block) => Array.isArray(block?.images) && block.images.length === 0 && (isTyped(doc) || block.ratio !== undefined || block.badge !== undefined);
/** The frame's width and height in mm: at most 120 mm wide and 90 mm tall, at the block's ratio (16:10 when unset). */
export function shotBox(block) {
  const [rw, rh] = SHOT_RATIOS[block?.ratio] || SHOT_RATIOS['16:10'];
  const w = Math.min(120, (90 * rw) / rh);
  return { w: +w.toFixed(2), h: +((w * rh) / rw).toFixed(2), rw, rh };
}
/** The page-flow and status polish of a typed document; '' (no byte) for any other document. */
export function polishCss(doc) {
  if (!isTyped(doc)) return '';
  const land = doc.layout?.page ? pageSpec(doc.layout.page).orientation === 'landscape' : false;
  const compact = coverOf(doc)?.design === 'compact';
  const headFam = ['form', 'sheet'].includes(coverOf(doc)?.family); // 0.19.0: a form or a sheet opens chapter 1 on page 1; its first group may break after itself
  const spine = coverOf(doc)?.design === 'spine';
  const hide = new Set(doc.layout?.hide || []);
  const frontShown = ['control', 'revisions', 'toc'].some((k) => !hide.has(k)) || approvalsShown(doc);
  const st = (k, fill, ink) => `.bw-doc table:not(.control):not(.toc):not(.story) tbody tr td.st-${k}{background:var(--${fill},transparent);color:var(--${ink});font-weight:700}`;
  // 0.19.0 C11: on a title-page family, page 2 is document control and approvals, the contents start their own page, chapter 1 opens on a new page.
  // C7: the front approvals' rows are tall enough to sign. C12: a screenshot frame. C15: a chapter heading row moves whole.
  return `/* 0.18.0 polish: bands, chapter heading rows, status cells${compact ? ', compact first page' : ''} */
h4{padding-bottom:3mm}
h2{break-inside:avoid;break-after:avoid}
.bw-doc p{orphans:2;widows:2}
.wrap>[data-part=approvals]{break-inside:avoid}
.wrap>[data-part=approvals] table td{height:12mm;vertical-align:middle}
.bw-doc .shot-frame{position:relative;width:var(--sf-w,120mm);max-width:100%;aspect-ratio:var(--sf-r,16/10);margin:0 auto 2mm;background:var(--card);border:1.4pt solid var(--signal);break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.bw-doc .shot-frame .shot-badge{position:absolute;top:3mm;inset-inline-start:3mm;min-width:7mm;height:7mm;padding:0 1.5mm;display:flex;align-items:center;justify-content:center;background:var(--signal);color:var(--paper,#fff);font-weight:700;font-size:var(--t-table);line-height:1}
${spine && frontShown ? `.cover[data-cover=spine]+.wrap>[data-part=toc]:not(h2+[data-part=toc]){break-before:page}
.cover[data-cover=spine]+.wrap>section.chapter:first-of-type{break-before:page}
` : ''}
${st('ok', 'success-100', 'success-700')}
${st('bad', 'signal-100', 'signal-600')}
${st('warn', 'accent-100', 'accent-800')}
${st('idle', 'neutral-100', 'neutral-700')}
.bw-doc td[class*=st-]{print-color-adjust:exact;-webkit-print-color-adjust:exact}
${compact ? `.cover[data-cover=compact]+.wrap [data-part=control]{break-inside:avoid}
.cover[data-cover=compact]+.wrap [data-part=control] table.control{break-inside:avoid}
.cover[data-cover=compact]+.wrap section.chapter:first-of-type .keep{break-inside:avoid;break-after:${headFam ? 'auto' : 'avoid'}}
.cover[data-cover=compact]+.wrap section.chapter:first-of-type p.lead-in{break-inside:avoid}
${land ? `.cover[data-cover=compact]+.wrap [data-part=control] table.control{display:block}
.cover[data-cover=compact]+.wrap [data-part=control] table.control colgroup{display:none}
.cover[data-cover=compact]+.wrap [data-part=control] table.control tbody{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(5,auto);grid-auto-flow:column;column-gap:12mm}
.cover[data-cover=compact]+.wrap [data-part=control] table.control tr{display:grid;grid-template-columns:42% 58%;break-inside:avoid}
.cover[data-cover=compact]+.wrap [data-part=control] table.control th{width:auto}
` : ''}` : ''}`;
}
/** 0.19.0 C8 and C13: true when a table block carries a style or a column key (style, numCols, nowrapCols, accentCol). */
const tableKeyed = (b) => b?.kind === 'table' && (b.style !== undefined || b.numCols !== undefined || b.nowrapCols !== undefined || b.accentCol !== undefined);
/** C8 (sheet, signoff) and C13 (number, no-wrap and accent columns): '' (no byte) for a document none of whose tables asks for them. */
export function tableKeysCss(doc) {
  if (!(doc?.chapters || []).some((ch) => (ch.sections || []).some((s) => (s.blocks || []).some(tableKeyed)))) return '';
  return `/* 0.19.0 table styles (C8) and column keys (C13) */
.bw-doc table.bw-t-sheet th{background:var(--primary-100);color:var(--primary-deep);print-color-adjust:exact;-webkit-print-color-adjust:exact}
.bw-doc table.bw-t-sheet:not(.control) tbody tr.alt td{background:var(--primary-50);print-color-adjust:exact;-webkit-print-color-adjust:exact}
.bw-doc table.bw-t-sheet td{padding-block:1.8mm}
.bw-doc table.bw-t-signoff:not(.control):not(.toc) tbody tr:nth-child(n) td{background:transparent;vertical-align:middle;border-bottom:.75pt solid var(--rule-strong)}
.bw-doc table.bw-t-signoff tbody tr{height:14mm}
.bw-doc td.num,.bw-doc th.num{text-align:end;font-variant-numeric:tabular-nums}
.bw-doc td.nw{white-space:nowrap} /* 0.19.0 R3: a heading may wrap; only the cells keep one line (an id, a date) */
.bw-doc table:not(.control) tbody tr td.acc{background:var(--primary-50);font-weight:700;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.bw-doc th.acc{background:var(--primary);color:var(--paper,#fff);print-color-adjust:exact;-webkit-print-color-adjust:exact}
`;
}
/** The user manual's own look (steps, screenshot frames, callouts), only for a user-manual document. */
export function manualCss(doc) {
  if (!isManual(doc)) return '';
  const co = (k, border, fill, tag) => `.bw-doc p.bw-co-${k}{background:var(--${fill});border-color:var(--${border})}.bw-doc p.bw-co-${k} b.bw-tag{color:var(--${tag})}`;
  return `/* 0.18.0 user manual: numbered steps, screenshot frames, callouts */
section.chapter,section.sec{counter-reset:bw-step}
.bw-doc h4{counter-increment:bw-step;display:flex;align-items:center;gap:3mm;margin:7mm 0 3mm;margin-inline:0;padding:0;border-top:0;background:none;color:var(--ink);font-size:var(--t-h3)}
.bw-doc h4::before{content:counter(bw-step);flex:0 0 auto;width:8mm;height:8mm;display:flex;align-items:center;justify-content:center;background:var(--primary);color:var(--paper,#fff);font-size:var(--t-table);font-weight:700;line-height:1}
.bw-doc h4.bw-step-own::before{display:none}
.bw-doc h4.bw-step-own .bw-step-no{color:var(--primary);white-space:nowrap}
/* 0.18.1: a step stays whole: its heading, its text and its screenshot frame print on one page (the heading already holds with its first line; every paragraph, list and callout that has a screenshot frame after it in the same section holds with what follows, so the step-3 frame no longer lands alone at the top of the next page) */
.bw-doc :is(.keep,p,ul,ol):has(~ figure.fig){break-after:avoid}
.bw-doc :is(.keep,p,ul,ol)+figure.fig{break-before:avoid}
.bw-doc .fig.shots{background:var(--card);border:.75pt solid var(--rule-strong);padding:3mm;margin:3mm 0 6mm}
.bw-doc .fig.shots .shot{max-width:none;margin:0 0 2mm;border:0}
.bw-doc .fig.shots figcaption{font-size:var(--t-meta);color:var(--muted);margin:0}
.bw-doc p.bw-callout{border:.75pt solid;padding:3mm;margin:0 0 4mm}
${co('note', 'primary-800', 'primary-wash', 'primary-800')}
${co('tip', 'success-700', 'success-100', 'success-700')}
${co('important', 'accent-700', 'accent-100', 'accent-800')}
${co('warning', 'signal-700', 'signal-100', 'signal-700')}
`;
}

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
  // 0.18.0: the cover designs and the user manual's look; '' (and no byte) for a document that asks for neither
  const designCss = [coverCss(doc, theme, { display }), manualCss(doc), polishCss(doc), tableKeysCss(doc)].filter(Boolean).map((s) => (s.endsWith('\n') ? s : `${s}\n`)).join('');
  return `${doc ? uploadedFontCss(doc) : ''}
*{box-sizing:border-box}
:root{
${vars}
  --t-title:${sz(theme.sizes?.title, '22pt')};
  --t-h1:${sz(theme.sizes?.h1, '16pt')};
  --t-h2:${sz(theme.sizes?.h2, '14pt')};
  --t-h3:${sz(theme.sizes?.h3, '12pt')};
  --t-body:${sz(theme.sizes?.body, '12pt')};
  --t-table:${sz(theme.sizes?.table, '10pt')};
  --t-meta:${sz(theme.sizes?.meta, '8pt')};
  --t-micro:${sz(theme.sizes?.micro, '7pt')};
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
/* 0.16.3 (shape): the label part and a table's header stay with its first row (the owner's PDF stranded a title and header on a page of their own) */
.story.lbl{break-after:avoid}
table.dict.shape thead tr{break-after:avoid}
table.dict.shape tbody tr:first-child{break-before:avoid}
.story-info{margin-bottom:0;table-layout:fixed}
table.control.story-info th,table.control.story-info td{border:1px solid var(--rule);
  padding:2.5mm 3mm;font-size:var(--t-table);vertical-align:top}
table.control.story-info th{color:var(--ink);font-weight:700;background:var(--primary-50);width:auto}
table.control.story-info td{font-weight:400;background:var(--paper)}
table.control.story-card>tbody.hold{break-inside:auto}
table.control.story-card td:first-child{color:var(--ink);font-weight:700;background:var(--primary-50)}
/* 0.16.2: the «المعرف» row stands apart from the card's other rows, as in the reference: a card-coloured strip, not a grid line */
table.control.story-info tr.idrow td,table.control.story-info tr.idrow th{border-bottom:3mm solid var(--card)}
table.control.story-info tr.idrow + tr td,table.control.story-info tr.idrow + tr th{border-top:3mm solid var(--card)}
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
/* the automatic drawing, capped to the room its page leaves it */
.fig.sheet.hug.dg.cap > .fig-art svg{max-height:var(--arth)}
/* an inline-block, as .whole: Chrome keeps the whole figure (its title, the canvas, the note) on one page; a flex or block figure was cut between its title and the canvas */
.fig.sheet.hug.dg.fr{display:inline-block;width:100%;vertical-align:top;height:auto;max-height:none}
.fig.dg.fr > .fig-art{box-sizing:border-box;width:calc(var(--frw) + 2px);height:calc(var(--frh) + 2px);max-width:none;padding:0;margin-inline:calc((100% - var(--frw) - 2px) / 2);display:block;overflow:hidden}
.fig.sheet.hug.dg.fr > .fig-art svg{width:100%;height:100%;max-width:none;max-height:none;margin:0;display:block}
figcaption{font-size:var(--t-table);color:var(--primary);margin:0 0 5px;font-weight:700}
.fig.dg > figcaption{font-family:${display},${text},serif;font-size:var(--t-h3);margin:0 0 2.5mm}
.fig.dg > .fig-art{padding:4mm}
.fig-note{font-size:var(--t-table);color:var(--muted);margin:4px 0 0}
@page{size:A4 portrait;margin:18mm 0 16mm;background:${paper}}
.wrap{padding-inline:var(--page-side)}
${printTrimCss(doc)}
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
.id-card.ac-fold{break-inside:auto;display:block}
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
/* 0.16.3: no blanket table break-before avoid: with the caption, the header and the first rows all held, it pulled a table that follows another table (rules, then source notes) onto the next page whole, where the editor's pages started it on the same page. A table's own title, header and first rows still stay together (caption, thead, tbody.hold); only the break between two tables is free again */
tbody:first-of-type tr:first-child{break-before:avoid}
/* 0.16.2: a table's header stays with its first rows: Chrome parted a header from its first group (tbody.hold) and left it alone at a page's foot */
thead{break-after:avoid}
thead+tbody{break-before:avoid}
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
${designCss}${tail}`;
}

/** CSS for the 0.13.0 document model — empty for a document that uses none of it (0.12.0 output unchanged). */
export function modelCss(doc) {
  const out = [];
  const PM = pageModel(doc);
  if (doc.layout?.page) {
    const sp = pageSpec(doc.layout.page);
    out.push(`@page{size:${sp.w}mm ${sp.h}mm}`, `.cover{height:${sp.h}mm}`, `.bw-every{top:${sp.h}mm;width:${sp.w}mm}`);
  }
  const mg = marginsOf(doc);
  if (mg) {
    // 0.17.6 page margins: the vars carry the values (the editor's live preview sets them on the page); @page cannot read a var, so it takes the numbers
    out.push(`.bw-doc{--pm-top:${mg.top}mm;--pm-bottom:${mg.bottom}mm;--pm-start:${mg.start}mm;--pm-end:${mg.end}mm}`,
      `@page{margin:${mg.top}mm 0 ${mg.bottom}mm}`,
      '.wrap{padding-inline:var(--pm-start) var(--pm-end)}',
      'h4{margin-inline:calc(0mm - var(--pm-start)) calc(0mm - var(--pm-end));padding-inline:var(--pm-start) var(--pm-end)}',
      '.gap{margin-inline:calc(0mm - var(--pm-start)) calc(0mm - var(--pm-end));padding-inline:var(--pm-start) var(--pm-end)}');
    const trim = printTrimCss(doc); // the trim of a sheet that is not a whole number of px comes after the rules it adjusts
    if (trim) out.push(trim);
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
  if (anyRich && chs.some((ch) => (ch.sections || []).some((x) => (x.blocks || []).some((b) => (b.paragraphs || []).some((q) => isRich(q) && q.style?.tabs) || (isRich(b.text) && b.text.style?.tabs))))) out.push('.bw-tab{display:inline-block;white-space:pre;tab-size:0;-moz-tab-size:0}'); // 0.17.7 tab stops
  if (anyRich) out.push('td.bw-cell-list ul.bw-list,td.bw-cell-list ol.bw-list{margin:0;padding-inline-start:5mm}', 'td.bw-cell-list li{white-space:pre-wrap}', 'td.bw-nl{white-space:pre-line}');
  if ((doc.overlays || []).some((o) => o.wrap || o.kind === 'text')) out.push('.bw-ovf{position:relative;z-index:1}', '.bw-ovf img{display:block;width:100%;height:auto}', '.bw-ov.bw-behind{z-index:-1}', '.bw-ov.bw-front{z-index:3}', '.bw-tb{display:flex;flex-direction:column;border:1px solid var(--rule-strong);background:var(--card);padding:3mm;font-size:var(--t-table);line-height:1.5}', '.bw-tb-body{white-space:pre-wrap}');
  return out.length ? out.join('\n') + '\n' : '';
}

export function documentMain(parts, logos, locale) {
  return `<main class="bw-doc" data-locale="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}">
${parts.cover(logos || {})}
<div class="wrap">
${parts.front}
${parts.body}
${parts.questions}${parts.back || ''}
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
  let shotSeq = 0; // 0.19.0 C12: the screenshot frames' running number (a block's own `badge` wins)
  const hide = new Set(doc.layout?.hide || []);
  const manual = isManual(doc);
  const bidi0 = o.bidi || makeBidi(locale);
  // a rich leaf (A26) prints its marks; a string takes the 0.12.0 path unchanged
  // 0.17.7: a paragraph with tab stops draws its tab characters as spans (polish() would collapse them to a space); the sentinel crosses polish/bidi and becomes the span
  const tabSpan = '<span class="bw-tab" contenteditable="false">\t</span>';
  const bidi = (v) => (isRich(v) ? (tabsOf(v.style).length ? richHtml(v, (x) => bidi0(String(x).replace(/\t/g, TABX))).replace(/\uE000/g, tabSpan) : richHtml(v, bidi0)) : bidi0(v));
  const none = L.none;
  const PM = pageModel(doc);
  const NUM = docNumbers(doc); // 0.15.0 (F4): what prints comes from position, never from a stored number
  // 0.16.3: a stories block with several cards numbers them per card (6.1, 6.2, ...): the block's number is the first card's, each next card adds one to its last part; a block of one card (a section per card) keeps its own number
  const storyNo = (ptr, blk, k = 0) => {
    const m = /^\/chapters\/(\d+)\/sections\/(\d+)\/blocks\/(\d+)/.exec(ptr || '');
    const base = String(m ? (NUM.story[+m[1]]?.[+m[2]]?.[+m[3]] || (NUM.manual ? (blk.number ?? '') : '')) : (blk.number ?? ''));
    // card k of a block counts on from the block's number, skipping a number another block (a later section's own one-card story) already carries,
    // so no number prints twice (0.16.4)
    if (isTyped(doc) && (blk.items || []).length > 1 && base) return `${base}.${k + 1}`; // 0.19.0 R3 (review #5): a typed document numbers the cards of one block 3.6.1, 3.6.2, never into the next section's number
    let t = k > 0 ? /^(.*?)(\d+)$/.exec(base) : null;
    if (!t) return base;
    let n = +t[2];
    for (let left = k; left > 0;) { n += 1; if (!TAKEN.has(`${t[1]}${n}`)) left -= 1; }
    return `${t[1]}${n}`;
  };
  const TAKEN = new Set(NUM.story.flat(2).filter(Boolean).map(String));
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
    // tight: the text hugs the picture's outline, 2 mm off it; through: no gap, and the text also runs into the picture's
    // see-through parts (a pixel under 90 % opaque lets it in), as Word's «خلال / Through» does inside an open shape
    const shape = o.kind !== 'text' && o.wrap === 'tight' ? `;shape-outside:url(${o.src});shape-image-threshold:.3;shape-margin:2mm`
      : o.kind !== 'text' && o.wrap === 'through' ? `;shape-outside:url(${o.src});shape-image-threshold:.9;shape-margin:0mm`
        : o.wrap === 'topBottom' ? '' : ';shape-outside:margin-box';
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
  // 0.16.5 (acc): a story card that carries the criteria row is taller than a hold group may be; its rows are free (no tbody.hold for the print pass to split and the editor to re-measure differently)
  const guardedBody = (rows, free = false) =>
    free ? `<tbody>${rows.join(NL)}</tbody>` : guarded(rows, (part, hold) =>
      part.length ? `<tbody${hold ? ' class="hold"' : ''}>${part.join(NL)}</tbody>` : ''
    );

  const rowH = (h) => (Number.isFinite(+h) && +h >= 4 && +h <= 400 ? ` style="height:${+h}mm"` : '');
  /** One body cell: spans, fill, wrap and a list (one item per line) are the spreadsheet cell's own look (cells.mjs). */
  const cellNext = new Map();
  function cell(c, ri, ci, span, t) {
    const st = isRich(c) ? c.style || {} : {};
    const li = listOf(c);
    const d = [];
    if (HEX.test(String(st.fill))) d.push(`background:${st.fill}`);
    if (st.wrap === false) d.push('white-space:nowrap;overflow:hidden;text-overflow:ellipsis');
    let attrs = isRich(c) ? leafAttrs(c, textOf(c).length > 200 ? 'long' : '') : String(c).length > 200 ? ' class="long"' : '';
    if (d.length) attrs = /style="/.test(attrs) ? attrs.replace('style="', `style="${d.join(';')};`) : attrs + ` style="${d.join(';')}"`;
    if (li) attrs = /class="/.test(attrs) ? attrs.replace('class="', 'class="bw-cell-list ') : attrs + ' class="bw-cell-list"';
    const stk = !li && isTyped(doc) ? statusKind(textOf(c), !!t.headed?.has(ci)) : ''; // a status word (Pass, Fail, Blocked, Not run, Covered, Partial, Gap; 0.19.0 C9: more words in a status column) in a typed document takes its fill
    if (stk) attrs = /class="/.test(attrs) ? attrs.replace('class="', `class="st-${stk} `) : attrs + ` class="st-${stk}"`;
    else if (textOf(c).includes('\n')) attrs = /class="/.test(attrs) ? attrs.replace('class="', 'class="bw-nl ') : attrs + ' class="bw-nl"';
    const kc = t.colClass?.(ci); // 0.19.0 C13: a number, no-wrap or accent column
    if (kc) attrs = /class="/.test(attrs) ? attrs.replace('class="', `class="${kc} `) : attrs + ` class="${kc}"`;
    const sp = (span && span.cs > 1 ? ` colspan="${span.cs}"` : '') + (span && span.rs > 1 ? ` rowspan="${span.rs}"` : '');
    const f = st.formula ? ` data-f="${attr(st.formula)}"` : '';
    let body;
    if (li) {
      const tag = li.kind === 'number' ? 'ol' : 'ul';
      const type = li.kind === 'number' ? numFormatAt(0, li.numFormat) : li.kind === 'shape' ? `"${li.shape} "` : 'disc';
      const lines = splitLines(c);
      let startAt = '';
      if (li.kind === 'number') { // 0.14.0 (E2): start value, or on from the numbered list above in the same column
        const key = `${t.rowsPtr || ''}|${ci}`;
        const from = li.start === 'continue' ? cellNext.get(key) || 1 : li.start != null ? li.start : 1;
        cellNext.set(key, from + lines.length);
        if (from !== 1) startAt = ` start="${from}"`;
      }
      body = `<${tag} class="bw-list"${startAt} style="list-style-type:${type}">${lines.map((ln) => `<li>${richHtml(ln, bidi0)}</li>`).join('')}</${tag}>`;
    } else body = t.cellHtml?.(ri, ci) ?? (t.ltr?.has(`${ri},${ci}`) ? `<bdi dir="ltr">${esc(textOf(c))}</bdi>` : bidi(c));
    return `<td${attrs}${sp}${f}${dp(t.cellPtr ? t.cellPtr(ri, ci) : t.rowsPtr && `${t.rowsPtr}/${ri}/${ci}`)} data-r="${ri}" data-c="${ci}">${body}</td>`;
  }

  /**
   * t = { columns, rows, colsPtr, rowsPtr, extra, caption, b (block ptr), alt }
   * Column sizing exactly as the source: square root of a typical-length measure.
   */
  function table(t0) {
    // 0.19.0 C8: style sheet (washed header repeated on every page, zebra, status fills) and signoff (no zebra, rows of 14 mm or rowHeights, empty
    // cells kept empty); C13: numCols (end-aligned figures), nowrapCols, accentCol; C9: the columns headed by a status word
    const t = { ...t0 };
    if (t.style === 'sheet') { t.alt = true; t.extra = `${t.extra || ''} bw-t-sheet`.trim(); }
    if (t.style === 'signoff') {
      t.extra = `${t.extra || ''} bw-t-signoff`.trim();
      if (typeof t.blankCell !== 'string') t.blankCell = '';
      t.keepAll = true;
      t.rowHeights = (t.rows || []).map((_, i) => (Number.isFinite(+t.rowHeights?.[i]) && +t.rowHeights[i] >= 4 ? +t.rowHeights[i] : 14));
    }
    const colSet = (k) => new Set(Array.isArray(t[k]) ? t[k].filter(Number.isInteger) : []);
    const numC = colSet('numCols'), nwC = colSet('nowrapCols');
    if (numC.size || nwC.size || Number.isInteger(t.accentCol)) t.colClass = (ci) => [numC.has(ci) && 'num', nwC.has(ci) && 'nw', t.accentCol === ci && 'acc'].filter(Boolean).join(' ');
    if (isTyped(doc) && (t.columns || []).length) { const h = new Set((t.columns || []).map((c, i) => (isStatusHead(textOf(c ?? '')) ? i : -1)).filter((i) => i >= 0)); if (h.size) t.headed = h; }
    const columnsIn = t.columns || [];
    const rowsIn = t.rows || [];
    const width = Math.max(columnsIn.length, ...rowsIn.map((r) => r.length), 0);
    // merges / column widths address columns by position: nothing is dropped from such a table (cells.mjs)
    const cw = Array.isArray(t.colWidths) && t.colWidths.length === width ? t.colWidths : null;
    const covered = coveredOf(t.merges || []);
    const spanAt = new Map((t.merges || []).map((m) => [`${m.r},${m.c}`, m]));
    const keep = Array.from({ length: width }, (_, i) => (cw ? +cw[i] > 0 : t.merges?.length || t.keepAll || typeof t.blankCell === 'string' ? true : rowsIn.some((r) => !blank(r[i]))));
    const idx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
    const columns = columnsIn.length ? idx.map((i) => columnsIn[i] ?? '') : [];
    const fill = typeof t.blankCell === 'string' ? t.blankCell : none; // table option blankCell (0.16.0); absent = «لا يوجد»
    const rows = rowsIn.map((r) => idx.map((i) => (blank(r[i]) ? (isRich(r[i]) ? { ...r[i], text: fill } : fill) : r[i])));
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
    const cols = measure.map((m, k) => `<col style="width:${(cw ? +cw[idx[k]] : (m / total) * 100).toFixed(2)}%" />`).join('');
    let n = 0;
    const meta =
      (t.b ? ` data-b="${attr(t.b)}"` : '') +
      (t.tb && t.b ? ` data-t="${attr(t.tb)}"` : '') +
      (t.rowsPtr ? ` data-rows="${attr(t.rowsPtr)}"` : '') +
      (t.colsPtr ? ` data-cols="${attr(t.colsPtr)}"` : '') +
      ` data-w="${width}"` + (t.meta || '');
    return `<table class="${t.extra || ''}"${meta}>
  <colgroup>${cols}</colgroup>
  ${t.caption ? `<caption${t.capClass ? ` class="${t.capClass}"` : ''}>${t.caption}</caption>` : ''}
  ${
    columns.length
      ? `<thead><tr>${columns
          .map((c, j) => `<th${t.colClass?.(idx[j]) ? ` class="${t.colClass(idx[j])}"` : ''}${dp(t.colPtrs ? t.colPtrs[idx[j]] : t.colsPtr && t.colsPtr + '/' + idx[j])} data-c="${idx[j]}">${bidi(c)}</th>`)
          .join('')}</tr></thead>`
      : ''
  }
  ${guardedBody(
    rows.map(
      (r, ri) =>
        `<tr${t.alt && n++ % 2 ? ' class="alt"' : t.rowClass?.(ri) ? ` class="${t.rowClass(ri)}"` : ''} data-r="${ri}"${rowH(t.rowHeights?.[ri])}>${r
          .map((c, j) => (covered.has(`${ri},${idx[j]}`) ? '' : cell(c, ri, idx[j], spanAt.get(`${ri},${idx[j]}`), t)))
          .join('')}</tr>`
    ),
    t.noHold
  )}
</table>`;
  }

  const bulletList = (items) =>
    guarded(items, (part, hold) =>
      part.length ? `<ul class="run${hold ? ' hold' : ''}">${part.join('')}</ul>` : ''
    );

  /** paragraphs: [{text, p (pointer), b (block pointer)}] */
  function prose(paragraphs, b, flat = false) {
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
      // 0.18.0 (user manual): a paragraph that opens with a tag word ("Note: ...", «ملاحظة: ...») is a callout box; the tag word is bold in print and export (not while it is edited in place)
      const co = manual && !isRich(para.leaf) ? calloutOf(para.text) : null;
      if (co) {
        out.push(`<p data-b="${attr(b)}"${dp(para.p)}${leafAttrs(para.leaf, `bw-callout bw-co-${co.kind}`)}>${(o.editor ? '' : `<b class="bw-tag">${esc(para.text.slice(0, co.len).trimEnd())}</b> `) + bidi(o.editor ? para.text : para.text.slice(co.len)) || '<br>'}</p>`);
        continue;
      }
      out.push(`<p data-b="${attr(b)}"${dp(para.p)}${leafAttrs(para.leaf)}>${bidi(para.leaf ?? para.text) || '<br>'}</p>`); // an empty line keeps its height (0.14.0 page lines)
    }
    flush();
    flushList();
    if (flat) return out.join(NL); // 0.16.5: the criteria row of a story card: no hold groups inside a table cell (the print pass would measure them as page groups)
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
  const listNext = new Map(); // 0.14.0 (E2): level → the number the next numbered list at that level goes on with
  function richList(items, b) {
    const out = [];
    const st = [];
    const listTag = (li) => (li.kind === 'number' ? 'ol' : 'ul');
    const listType = (li) => (li.kind === 'number' ? numFormatAt(li.level, li.numFormat) : li.kind === 'shape' ? `"${li.shape} "` : ['disc', 'circle', 'square'][li.level % 3]);
    const openList = (lv, li, from = 1) => `<${listTag(li)} class="bw-list" data-level="${lv}"${listTag(li) === 'ol' && from !== 1 ? ` start="${from}"` : ''} style="list-style-type:${lv === li.level ? listType(li) : 'none'}">`;
    const closeTop = () => { const x = st.pop(); out.push(`</li></${x.tag}>`); if (x.tag === 'ol' && !x.nest) listNext.set(x.level, x.from + x.n); };
    for (const it of items) {
      const L = it.li.level;
      const tag = listTag(it.li);
      if (tag === 'ol' && it.li.start !== undefined && st.length && st.at(-1).level === L && st.at(-1).tag === tag) closeTop(); // a start value mid-list begins a new run
      while (st.length && st.at(-1).level > L) closeTop();
      if (st.length && st.at(-1).level === L && st.at(-1).tag !== tag) closeTop();
      if (st.length && st.at(-1).level === L) out.push('</li>');
      else {
        for (let lv = st.length ? st.at(-1).level + 1 : L; lv < L; lv += 1) { out.push(openList(lv, { ...it.li, level: -1 }) + '<li class="bw-nest">'); st.push({ tag: listTag(it.li), level: lv, nest: true, from: 1, n: 0 }); }
        const from = tag === 'ol' ? (it.li.start === 'continue' ? listNext.get(L) || 1 : it.li.start != null ? it.li.start : 1) : 1;
        out.push(openList(L, it.li, from));
        st.push({ tag, level: L, from, n: 0 });
      }
      st.at(-1).n += 1;
      out.push(`<li data-b="${attr(b)}" data-level="${L}"${leafAttrs(it.leaf)}><span${dp(it.p)}>${isRich(it.leaf) && tabsOf(it.leaf.style).length ? bidi(it.leaf) : richHtml(it.leaf, bidi0)}</span>`);
    }
    while (st.length) closeTop();
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
      merges: block.merges,
      colWidths: block.colWidths,
      rowHeights: block.rowHeights,
      blankCell: block.blankCell,
      style: block.style, numCols: block.numCols, nowrapCols: block.nowrapCols, accentCol: block.accentCol, // 0.19.0 C8, C13
    });

  let figNo = 0;
  function renderBlock(block, b) {
    switch (block.kind) {
      case 'prose':
        return prose(paras(block, b), b);
      case 'subhead': {
        // 0.19.0 R3 (review #9): a manual step whose text already says «الخطوة 2:» / "Step 2:" prints that prefix as one run (the number stays on its
        // colon, never isolated) and no counter chip, so the number shows once
        const own = manual && typeof block.text === 'string' ? STEP_PREFIX.exec(block.text) : null;
        if (own) return `<h4 class="bw-step-own" data-b="${attr(b)}"${dp(b + '/text')}><span class="bw-step-no">${esc(own[0].trimEnd())}</span> ${bidi(block.text.slice(own[0].length))}</h4>`;
        return `<h4 data-b="${attr(b)}"${dp(b + '/text')}${leafAttrs(block.text)}>${bidi(block.text)}</h4>`;
      }
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
        // 0.15.9: a saved canvas (block.frame) is kept inside the room the page leaves it; absent = the drawing exactly as before
        const fr0 = DIAGRAM.frameNorm(block.frame);
        let fr = null;
        let room0 = null;
        if (fr0) {
          const room = figureRoom(doc, b, o.theme);
          room0 = room;
          fr = { ...fr0, wMm: Math.min(fr0.wMm, room.wMm), hMm: Math.min(fr0.hMm, room.hMm) };
        }
        const art = DIAGRAM.render(block.model || {}, { theme: o.theme, locale, title: block.caption, editor: !!o.editor, ...(fr ? { frame: fr } : {}) });
        // 0.15.9 (owner, one-page landscape view): the automatic drawing's height rule (a flat 116 mm) ignores what shares its page: the chapter title, the section title,
        // the figure title. When the drawing would not fit the room the page leaves it, its height is capped to that room, so its frame never runs over the footer.
        // A drawing that fits is untouched (same markup as before).
        let cap = 0;
        if (!fr) {
          const vb = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(art);
          if (vb) {
            const room = figureRoom(doc, b, o.theme);
            const natural = Math.min(DIAGRAM.PRINT.maxHmm, ((room.wMm - DIAGRAM.PRINT.padMm) * +vb[4]) / +vb[3]);
            if (natural + DIAGRAM.PRINT.padMm > room.hMm) cap = Math.max(30, Math.floor((room.hMm - DIAGRAM.PRINT.padMm) * 10) / 10);
          }
        }
        return `<figure class="fig sheet hug dg${fr ? ' fr' : ''}${cap ? ' cap' : ''}" data-b="${attr(b)}" data-dg="${attr(b)}"${cap ? ` style="--arth:${cap}mm"` : ''}${fr ? ` data-frame="${fr.mode}" style="--frw:${fr.wMm}mm;--frh:${fr.hMm}mm;--shw:${room0.sheetW}mm"` : ''}>
  <figcaption><span class="fig-no">${esc(L.figureNo || L.figure)} ${figNo}: </span><span${dp(b + '/caption')}>${bidi(block.caption)}</span></figcaption>
  <div class="fig-art">${art}</div>
  ${block.note ? `<p class="fig-note"${dp(b + '/note')}>${bidi(block.note)}</p>` : ''}
</figure>`;
      }
      case 'shots': {
        if (shotFrame(doc, block)) {
          // 0.19.0 C12: no image yet: a card frame at the block's ratio, a signal outline and a numbered badge; an empty caption reads «Screenshot n»
          shotSeq += 1;
          const n = Number.isInteger(block.badge) && block.badge >= 1 && block.badge <= 99 ? block.badge : shotSeq;
          const box = shotBox(block);
          const cap = textOf(block.caption ?? '').trim() ? bidi(block.caption) : bidi(`${SHOT_LABEL[locale === 'ar' ? 'ar' : 'en']} ${n}`);
          return `<figure class="fig shots shots-frame" data-b="${attr(b)}">
  <div class="shot-frame" style="--sf-w:${box.w}mm;--sf-r:${box.rw}/${box.rh}"><span class="shot-badge"><bdi dir="ltr">${n}</bdi></span></div>
  <figcaption${dp(b + '/caption')}>${cap}</figcaption>
</figure>`;
        }
        return `<figure class="fig shots" data-b="${attr(b)}">
  ${(block.images || []).map((src) => (String(src).startsWith('data:') ? `<img class="shot" src="${attr(src)}" alt="" style="width:${Math.min(100, Math.max(10, Number(block.width) || 100))}%" />` : '')).join(NL)}
  <figcaption${dp(b + '/caption')}>${bidi(block.caption)}</figcaption>
</figure>`;
      }
      case 'stories':
        return (block.items || [])
          .map((s, i) => {
            const sp = `${b}/items/${i}`;
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
                    ...(o.editor ? { b, tb: `${sp}/${key}` } : {}),
                    merges: s[key].merges,
                    colWidths: s[key].colWidths,
                    rowHeights: s[key].rowHeights,
                  })
                : '';
            const dictionary = sub('dictionary');
            const actions = sub('actions');
            const card = s.card && Array.isArray(s.card.rows) ? s.card : null;
            // 0.16.5 (acc): the field shape — «معايير القبول» subhead + its prose after a story card — prints as the card's last row (stepPaging sets `foldAc`); stored blocks untouched
            const fa = foldAc && i === (block.items || []).length - 1 && !(s.acceptance || []).length ? foldAc : null;
            const cardSrc = [...(card ? card.rows : storyCardDefault(s)), ...(fa ? [[{ foldLabel: 1 }, { foldBody: 1 }]] : [])];
            const goalText = s.goal || (s.as || s.want || s.so ? L.storyGoal.split(/(\{as\}|\{want\}|\{so\})/).map((x) => (x === '{as}' ? s.as : x === '{want}' ? s.want : x === '{so}' ? s.so : x)).join('') : '');
            const bound = (v) => v && typeof v === 'object' && !isRich(v) && STORY_CARD_BINDS.includes(v.bind);
            const labelled = (v) => v && typeof v === 'object' && !isRich(v) && typeof v.label === 'string';
            const ltr = new Set();
            const cardRows = cardSrc.map((row, ri) => (Array.isArray(row) ? row : []).map((v, ci) => {
              if (labelled(v)) return L[v.label] ?? '';
              if (v && v.foldLabel) return fa.label.text || '';
              if (v && v.foldBody) return '';
              if (!bound(v)) return v ?? '';
              if (v.bind === 'id') ltr.add(`${ri},${ci}`);
              return v.bind === 'goal' ? goalText : v.bind === 'acceptance' ? (s.acceptance || []).join(' ') : s[v.bind] ?? '';
            }));
            const cardPtr = (ri, ci) => {
              const v = cardSrc[ri]?.[ci];
              if (labelled(v)) return '/labels/' + v.label;
              if (v && v.foldLabel) return fa.lp + '/text';
              if (v && v.foldBody) return undefined;
              if (bound(v)) return v.bind === 'acceptance' ? undefined : `${sp}/${v.bind}`;
              return `${sp}/card/rows/${ri}/${ci}`;
            };
            const cardHtml = (ri, ci) => {
              const v = cardSrc[ri]?.[ci];
              if (v && v.foldBody) return prose(paras(fa.body, fa.bp), fa.bp, true);
              return bound(v) && v.bind === 'acceptance' ? `<ol>${criteria}</ol>` : undefined;
            };
            const hasAc = (r) => (bound(r?.[1]) && r[1].bind === 'acceptance') || !!r?.[1]?.foldBody;
            const cardTable = table({
              rows: cardRows,
              rowsPtr: `${sp}/card/rows`,
              extra: 'control story-info story-card',
              capClass: 'story-head',
              caption: `<span class="sn"${i === 0 ? dp(b + '/number') : ''}>${bidi(storyNo(b, block, i))}</span>${lb('userStory')}`,
              ...(o.editor ? { b, tb: `${sp}/card` } : {}),
              merges: card?.merges,
              colWidths: Array.isArray(card?.colWidths) ? card.colWidths : [22, 78],
              rowHeights: card?.rowHeights,
              cellPtr: cardPtr,
              cellHtml: cardHtml,
              noHold: !!fa,
              ltr,
              rowClass: (ri) => [hasAc(cardSrc[ri]) ? 'ac' : '', ri === 0 && cardSrc.length > 1 && (cardSrc[0] || []).some((v) => bound(v) && v.bind === 'id') ? 'idrow' : ''].filter(Boolean).join(' '),
            });
            const partsArr = [
              `<div class="id-card${fa ? ' ac-fold' : ''}">${cardTable}</div>`,
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

  // 0.16.3 (shape): the house labels the story card's parts carry, in the document's own wording and in both locales' defaults
  const SHAPE_LABELS = new Set([L.actionsTable, L.dictionary, 'جدول الإجراءات', 'قاموس البيانات والمصطلحات', 'Actions table', 'Data dictionary and terms']
    .filter((x) => typeof x === 'string' && x).map((x) => x.replace(/\s+/g, ' ').trim().toLowerCase()));
  const isShapeLabel = (blk) => blk?.kind === 'subhead' && typeof blk.text === 'string' && SHAPE_LABELS.has(blk.text.replace(/[\s:：]+$/u, '').replace(/\s+/g, ' ').trim().toLowerCase());

  const AC_LABELS = new Set([L.acceptance, 'معايير القبول', 'Acceptance criteria'].filter((x) => typeof x === 'string' && x).map((x) => x.replace(/\s+/g, ' ').trim().toLowerCase()));
  const isAcLabel = (blk) => blk?.kind === 'subhead' && typeof blk.text === 'string' && AC_LABELS.has(blk.text.replace(/[\s:：]+$/u, '').replace(/\s+/g, ' ').trim().toLowerCase());
  let foldAc = null;

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
        const lab = blocks[i + 1];
        const bod = blocks[i + 2];
        const lastIt = (block.items || []).at(-1);
        if (isAcLabel(lab) && bod?.kind === 'prose' && lastIt && !(lastIt.acceptance || []).length && !(segOn && (segStarts.has(`${base}/${i + 1}`) || segStarts.has(`${base}/${i + 2}`)))) {
          foldAc = { label: lab, lp: `${base}/${i + 1}`, body: bod, bp: `${base}/${i + 2}` };
          out.push(renderBlock(block, b));
          foldAc = null;
          pending = '';
          return i + 2;
        }
        out.push(renderBlock(block, b));
        pending = '';
        return i;
      }
      // 0.16.3 (shape): the field shape — a house-label subhead («جدول الإجراءات», «قاموس البيانات والمصطلحات») and the plain table under it, built
      // by an agent rather than as `stories` blocks — prints as the story card's parts. Stored data is untouched; only these label+table pairs match.
      if (isShapeLabel(block) && blocks[i + 1]?.kind === 'table' && next) {
        let end = i + 2;
        while (isShapeLabel(blocks[end]) && blocks[end + 1]?.kind === 'table' && !(segOn && segStarts.has(`${base}/${end}`))) end += 2;
        const parts = [];
        for (let k = i; k < end; k += 2) {
          const lp = `${base}/${k}`;
          const tp = `${base}/${k + 1}`;
          const tb = blocks[k + 1];
          const label = `<p class="run-in dict-label"${dp(lp + '/text')}${leafAttrs(blocks[k].text)}>${bidi(blocks[k].text)}</p>`;
          parts.push({ b: lp, cls: 'lbl', html: label });
          parts.push({
            b: tp,
            cls: 'plain',
            html: table({
              columns: (tb.columns || []).map(keepLeaf),
              rows: (tb.rows || []).map((r) => r.map(keepLeaf)),
              colsPtr: `${tp}/columns`,
              rowsPtr: `${tp}/rows`,
              extra: 'dict shape',
              alt: true,
              ...(o.editor ? { b: tp, tb: tp } : {}),
              merges: tb.merges,
              colWidths: tb.colWidths,
              rowHeights: tb.rowHeights,
              blankCell: tb.blankCell,
            }),
          });
        }
        const grp = parts
          .map((p, k) => `<div class="story ${parts.length === 1 ? '' : k === 0 ? 'part-first' : k === parts.length - 1 ? 'part-last' : 'part-mid'} ${p.cls}" data-b="${attr(p.b)}">
  ${p.html}
</div>`)
          .join(NL);
        out.push(pending ? pending + NL + grp : grp);
        pending = '';
        return end - 1;
      }
      const shortTable = next?.kind === 'table' && (next.rows?.length ?? 0) <= GROUPABLE_ROWS;
      if (block.kind === 'subhead' && next) {
        // 0.17.0 (pages): a subhead opening a section is the section heading's neighbour, not its replacement: the heading (`pending`) goes in front
        // and is spent here. Left pending, the next table of the section took it as its caption (a subhead before a story card moved the section
        // heading onto the output table's caption).
        if (next.kind === 'stories') {
          const head = pending + renderBlock(block, b);
          pending = '';
          const at = out.length;
          const end = stepPaging(i + 1); // the card goes through its own branch (acceptance fold, house labels)
          out.splice(at, out.length - at, `<div class="keep">${head}${NL}${out.slice(at).join(NL)}</div>`);
          return end;
        }
        if (next.kind !== 'table' || shortTable) {
          out.push(`<div class="keep">${pending}${renderBlock(block, b)}${NL}${renderBlock(next, nb)}</div>`);
          pending = '';
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
      if (!pending && block.kind === 'table' && blocks[i - 1]?.kind === 'stories') {
        // 0.16.1 (fault 7): the output card table that follows a story card carries its label bar, as every other table under a heading does
        const short = (block.rows?.length ?? 0) <= GROUPABLE_ROWS;
        const headed = tableOf(block, b, 'headed', lb('outputTable'));
        out.push(short ? `<div class="hold head whole">${headed}</div>` : headed);
        return i;
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
      const numPtr = (p) => (NUM.manual ? p : ''); // the printed numbers are computed from position: only a manual-numbering document types them (UAT M5)
      const head = row(NUM.ch[ci], ch.title, 'toc-chapter', cp, numPtr(cp + '/number'), cp + '/title');
      if (doc.layout?.tocDepth === 1) return [head]; // 0.19.0 C11: contents at depth 1 list the chapters only
      if (ch.sections.length === 1) {
        const cards = ch.sections[0].blocks.map((x, k) => [x, k]).filter(([x]) => x.kind === 'subhead' && !x.tocHidden && !isTyped(doc)).map(([x, k]) => row('', x.text, 'toc-card', `${cp}/sections/0/blocks/${k}`, '', `${cp}/sections/0/blocks/${k}/text`));
        const only = ch.sections[0];
        // a chapter of ONE story section: the card prints «6.1», so the contents list it too (UAT L2); other one-section chapters list only their sub-heads
        const lone = only.blocks?.[0]?.kind === 'stories' && !only.tocHidden ? [row(NUM.sec[ci][0], only.title, '', `${cp}/sections/0`, numPtr(`${cp}/sections/0/number`), `${cp}/sections/0/title`)] : [];
        return [head, ...lone, ...cards];
      }
      return [head, ...ch.sections.map((sec, si) => [sec, si]).filter(([sec]) => !sec.tocHidden).map(([sec, si]) => row(NUM.sec[ci][si], sec.title, '', `${cp}/sections/${si}`, numPtr(`${cp}/sections/${si}/number`), `${cp}/sections/${si}/title`))];
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
      // 0.19.0 R3 (review #6): in a typed document a chapter of several sections stays portrait; only the section that holds the figure turns
      const secWide = hasFigure && isTyped(doc) && ch.sections.length > 1;
      const single = ch.sections.length === 1;
      const h2 = ch.bare === true ? '' : `<h2><span class="num"${dp(cp + '/number')}>${bidi(NUM.ch[ci])}</span><span${dp(cp + '/title')}>${bidi(ch.title)}</span></h2>`; // 0.19.0: a `bare` chapter (the Blank document's one empty page) prints no heading
      const first = ch.sections[0];
      const opensLong = !!first?.blocks[0] && !['figure', 'diagram', 'stories', 'shots'].includes(first.blocks[0].kind);
      // page segments (A18 / A6): a container takes the segment of its first block; figure chapters keep their sheet
      const segAt = (si) => { if (!segOn) return 0; const pt = `${cp}/sections/${si}/blocks/0`; return !hasFigure || segStarts.has(pt) ? segOfPtr(pt) : 0; }; // 0.16.0: a figure chapter keeps its turned sheet unless a page setting starts on it (then the screen draws that sheet too)
      const chSeg = segAt(0);
      const inner = single
        ? groupForPaging(ch.sections[0].blocks, `${cp}/sections/0/blocks`, opensLong ? h2 : '', segOn && !hasFigure ? chSeg : -1)
        : ch.sections
            .map((sec, i) => {
              const sp = `${cp}/sections/${i}`;
              const sSeg = sec.blocks.length ? segAt(i) : chSeg;
              return `<section class="sec${secWide && sec.blocks.some((x) => x.kind === 'figure' || x.kind === 'diagram') ? ' wide' : ''}${sec.layout?.breakBefore ? ' bw-brk' : ''}" data-s="${attr(sp)}"${sSeg !== chSeg ? pageStyle(sSeg) : ''}>
    ${groupForPaging(
      sec.blocks,
      `${sp}/blocks`,
      (i === 0 && opensLong ? h2 : '') +
        `<h3><span class="sn"${dp(sp + '/number')}>${bidi(NUM.sec[ci][i])}</span><span${dp(sp + '/title')}>${bidi(sec.title)}</span></h3>`,
      segOn && !hasFigure ? sSeg : -1
    )}
  </section>`;
            })
            .join(NL);
      return `<section class="chapter${hasFigure && !secWide ? ' wide' : ''}${ch.layout?.breakBefore ? ' bw-brk' : ''}" data-ch="${attr(cp)}"${pageStyle(chSeg)}>
  ${opensLong ? '' : h2}
  ${inner}
</section>`;
    })
    .join(NL);

  const sheet = docSheet(doc);

  // design-pack logos still print in the lockup; empty slots print nothing (logos are placed freely as overlays)
  const slot = (logos, name) =>
    logos[name] && SAFE_IMG.test(logos[name]) ? `<img class="logo-${name}" data-logo="${name}" src="${attr(logos[name])}" alt="" />` : '';

  // 0.18.0: a page-1 design (doc.coverDesign) per document type; none asked = the cover below, byte for byte. 0.19.0: no motif and no art, ever: the
  // spine title page carries the control block (C3) where the 0.18 motif was; the code chip (C2) comes from docType (an old file's `motif` names the type)
  const cv = coverOf(doc);
  /** C3: a field grid. fields = [{label, value, kind, id, lp, vp}] (lp, vp: the label's and the value's pointers); cols 2 | 3 | 4 | 6. */
  const fieldGrid = (fields, cols, cls) => {
    if (!fields.length) return '';
    const n = FIELD_COLS.includes(cols) ? cols : 2;
    const rest = fields.length % n;
    return `<div class="bw-fields ${cls}" style="--fg-cols:${n}">${fields.map((f, i) => {
      const span = rest && i === fields.length - 1 ? ` style="grid-column:span ${n - rest + 1}"` : '';
      const kind = FIELD_KINDS.includes(f.kind) || f.kind === 'ltr' ? f.kind : 'text';
      const raw = f.value ?? '';
      const sk = kind === 'chip' ? statusKind(textOf(raw), true) : ''; // a chip is a status or tag field: the C9 words fill it too
      const v = kind === 'blank' ? `<span class="fg-v fg-blank"${dp(f.vp)}></span>`
        : (kind === 'date' || kind === 'ltr') && !/[؀-ۿ]/.test(textOf(raw)) ? `<span class="fg-v"><bdi dir="ltr" class="fg-date"${dp(f.vp)}>${esc(textOf(raw))}</bdi></span>`
        : kind === 'chip' ? `<span class="fg-v"><span class="fg-chip${sk ? ' st-' + sk : ''}"${dp(f.vp)}>${bidi(raw)}</span></span>`
        : `<span class="fg-v"${dp(f.vp)}>${bidi(raw)}</span>`;
      return `<div class="fg${f.id === true ? ' fg-id' : ''}"${span}><span class="fg-l"${dp(f.lp)}>${bidi(f.label ?? '')}</span>${v}</div>`;
    }).join('')}</div>`;
  };
  /** The type's own fields (content key `cover`, spec §2 / S2); the control fields are never copied into it. */
  const typeFields = () => (Array.isArray(doc.cover?.fields) ? doc.cover.fields : []).filter((f) => f && typeof f === 'object')
    .map((f, i) => ({ ...f, lp: `/cover/fields/${i}/label`, vp: `/cover/fields/${i}/value` }));
  const controlFields = () => COVER_CONTROL.map((k) => ({
    label: L.control?.[k] ?? COVER_LABELS[k]?.[locale === 'ar' ? 'ar' : 'en'] ?? k,
    value: c[k] ?? '',
    kind: k === 'approvedBy' && !textOf(c[k] ?? '').trim() ? 'blank' : ['documentId', 'version', 'issuedOn'].includes(k) ? 'ltr' : 'text',
    lp: `/labels/control/${k}`, vp: `/control/${k}`,
  }));
  // ---- 0.19.0 R2: the parts of the report, form and sheet families (spec §2 C4, C5, C6), all from the content key `cover` ----
  const lang = locale === 'ar' ? 'ar' : 'en';
  const famLb = (k) => lb(k, L[k] ?? FAMILY_LABELS[k][lang]);
  const coverKey = doc.cover && typeof doc.cover === 'object' && !Array.isArray(doc.cover) ? doc.cover : {};
  /** C4: one row of tiles; value Display 700, the fill of its kind (none = the wash). */
  const tiles = (figs) => (figs.length ? `<div class="bw-tiles" style="--tl-n:${figs.length}"${figs[0].derived ? ' data-derived="1"' : ''}>${figs.map((f) => `<div class="tl${FIGURE_KINDS.includes(f.kind) && f.kind !== 'none' ? ' tl-' + f.kind : ''}"><span class="tl-l"${f.lp ? dp(f.lp) : ''}>${f.lw || bidi(f.label ?? '')}</span><span class="tl-v"${f.vp ? dp(f.vp) : ''}>${/^[ -~]+$/.test(textOf(f.value ?? '')) ? `<bdi dir="ltr">${esc(textOf(f.value))}</bdi>` : bidi(f.value ?? '')}</span></div>`).join('')}</div>` : '');
  const coverFigures = () => (Array.isArray(coverKey.figures) ? coverKey.figures : []).filter((f) => f && typeof f === 'object')
    .map((f, i) => ({ ...f, lp: `/cover/figures/${i}/label`, vp: `/cover/figures/${i}/value` }));
  /** A sheet without `cover.figures`: the summary strip is counted from its first `style: sheet` table with a status column (a Status or Result
   * column first): the total, then each status word found. No such table, no strip (a legend or a key table is never counted). */
  const derivedFigures = () => {
    const ch = (doc.chapters || []).find((x) => !x.hidden);
    for (const s of ch?.sections || []) {
      for (const b of s.blocks || []) {
        if (b.kind !== 'table' || b.hidden || b.style !== 'sheet' || !Array.isArray(b.columns)) continue;
        const heads = b.columns.map((x) => textOf(x ?? ''));
        const main = heads.findIndex((x) => /\b(status|result)\b|الحالة|النتيجة|حالة|نتيجة/i.test(x) && isStatusHead(x));
        const col = main >= 0 ? main : heads.findIndex((x) => isStatusHead(x));
        if (col < 0) continue;
        const rowsB = (b.rows || []).filter(Array.isArray);
        const seen = new Map();
        for (const r of rowsB) { const w = textOf(r[col] ?? '').trim(); const k = statusKind(w, true); if (k) { const e = seen.get(k) || { word: w, n: 0 }; e.n += 1; seen.set(k, e); } }
        return [{ derived: true, lw: famLb('total'), value: String(rowsB.length), kind: 'none' }, ...['ok', 'bad', 'warn', 'idle'].filter((k) => seen.has(k)).map((k) => ({ derived: true, label: seen.get(k).word, value: String(seen.get(k).n), kind: k }))];
      }
    }
    return [];
  };
  /** C5: the statement box: its text, up to 5 items (square markers), up to 4 choices as empty squares; `seal`: an empty box for the stamp. */
  const statementBox = (st, seal) => {
    if (!st || typeof st !== 'object' || typeof st.text !== 'string') return '';
    const items = (Array.isArray(st.items) ? st.items : []).map((x, i) => `<li${dp(`/cover/statement/items/${i}`)}>${bidi(x)}</li>`).join('');
    const choices = (Array.isArray(st.choices) ? st.choices : []).map((x, i) => `<span class="st-ch"><i class="st-box"></i><span${dp(`/cover/statement/choices/${i}`)}>${bidi(x)}</span></span>`).join('');
    const sealBox = seal && choices ? `<div class="st-seal">${famLb('seal')}</div>` : '';
    return `<div class="bw-stmt"><p class="st-t"${dp('/cover/statement/text')}>${bidi(st.text)}</p>${items ? `<ul class="st-items">${items}</ul>` : ''}${choices ? `<div class="st-foot"><div class="st-choices">${choices}</div>${sealBox}</div>` : ''}</div>`;
  };
  /** The form's ID box (the field with id:true; without one, the document id) and the C6 badge. */
  const idBox = (f) => `<div class="bw-idbox"><span class="ib-l"${dp(f.lp)}>${bidi(f.label ?? '')}</span><bdi dir="ltr" class="ib-v"${dp(f.vp)}>${esc(textOf(f.value ?? ''))}</bdi></div>`;
  const badgeBox = (b) => (b && typeof b === 'object' && typeof b.value === 'string' ? `<div class="bw-badge"><span class="bg-l"${dp('/cover/badge/label')}>${bidi(b.label ?? '')}</span><bdi dir="ltr" class="bg-v"${dp('/cover/badge/value')}>${esc(b.value)}</bdi></div>` : '');
  const coverDesigned = (logos) => {
    const code = COVER_CODES[cv.type] || '';
    const attrs = `data-part="cover" data-cover="${cv.design}"${cv.family !== cv.design ? ` data-family="${cv.family}"` : ''}${cv.type ? ` data-type="${cv.type}"` : ''}`;
    const title = `<h1${dp(c.coverTitle != null || serviceName !== c.title ? '/control/coverTitle' : '/control/title')}>${bidi(serviceName)}</h1>
    <div class="subtitle"${dp(c.subtitle != null ? '/control/subtitle' : '/labels/subtitle')}>${bidi(c.subtitle ?? L.subtitle)}</div>`;
    const meta = `<span><bdi dir="ltr"${dp('/control/version')}>${esc(c.version)}</bdi>${L.comma}<span${dp('/control/status')}>${esc(c.status)}</span>${L.comma}<bdi dir="ltr"${dp('/control/issuedOn')}>${esc(c.issuedOn)}</bdi></span>`;
    const lockup = `<div class="lockup">${slot(logos, 'start')}${slot(logos, 'center')}${slot(logos, 'end')}</div>`;
    const docId = `<bdi dir="ltr"${dp('/control/documentId')}>${esc(c.documentId)}</bdi>`;
    const tf = typeFields();
    const cols = FIELD_COLS.includes(coverKey.cols) ? coverKey.cols : 0;
    if (cv.family === 'form' || cv.family === 'sheet') {
      const sheetFam = cv.family === 'sheet';
      const idF = tf.find((f) => f.id === true);
      const rest = tf.filter((f) => f !== idF);
      const badge = badgeBox(coverKey.badge);
      const end = sheetFam ? '' : idF ? idBox(idF) + badge : badge || idBox({ label: L.control?.documentId ?? 'Document ID', value: c.documentId ?? '', lp: '/labels/control/documentId', vp: '/control/documentId' });
      const figs = coverFigures();
      const metaLine = `<div class="tb-meta">${meta}<span>${docId}</span></div>`;
      const grid = fieldGrid(rest, cols || (sheetFam ? 6 : 3), 'fg-type');
      return `<div class="cover" ${attrs}>${overlaysFor((o) => o.mode === 'cover')}
  <div class="tb-band"><i></i></div>
  ${lockup}
  <div class="tb-row">
    <div class="tb-main">
    <div class="tb-id">${code ? `<span class="tb-code"><bdi dir="ltr">${code}</bdi></span>` : ''}<div class="kicker">${lb('kicker')}</div></div>
    ${title}
    </div>${end}
  </div>
  ${sheetFam ? metaLine + grid + tiles(figs.length ? figs : derivedFigures()) : grid + metaLine + tiles(figs)}
  ${statementBox(coverKey.statement, !sheetFam)}
</div>`;
    }
    if (cv.family === 'report') {
      const ctl = REPORT_CONTROL.map((k) => ({ label: L.control?.[k] ?? k, value: c[k] ?? '', kind: ['documentId', 'version', 'issuedOn'].includes(k) ? 'ltr' : 'text', lp: `/labels/control/${k}`, vp: `/control/${k}` }));
      return `<div class="cover" ${attrs}>${overlaysFor((o) => o.mode === 'cover')}
  ${lockup}
  <div class="rp-band"><i class="cap"></i><div class="rp-in">${code ? `<span class="rp-code"><bdi dir="ltr">${code}</bdi></span>` : ''}<div class="kicker">${lb('kicker')}</div>
    ${title}</div></div>
  <div class="rp-body">${tiles(coverFigures())}${statementBox(coverKey.statement, false)}${fieldGrid(ctl, 3, 'fg-control')}${fieldGrid(tf, cols && cols <= 3 ? cols : 3, 'fg-type')}</div>
  <div class="cover-foot">${meta}${c.owner ? `<span${dp('/control/owner')}>${bidi(c.owner)}</span>` : ''}</div>
</div>`;
    }
    if (cv.design === 'compact') {
      return `<div class="cover" ${attrs}>${overlaysFor((o) => o.mode === 'cover')}
  <div class="tb-band"><i></i></div>
  ${lockup}
  <div class="tb-row">
    <div class="tb-main">
    <div class="tb-id">${code ? `<span class="tb-code"><bdi dir="ltr">${code}</bdi></span>` : ''}<div class="kicker">${lb('kicker')}</div></div>
    ${title}
    </div>
  </div>
  <div class="tb-meta">${meta}<span>${docId}</span></div>
  ${fieldGrid(tf, doc.cover?.cols, 'fg-type')}
</div>`;
    }
    return `<div class="cover" ${attrs}>${overlaysFor((o) => o.mode === 'cover')}
  <div class="spine"><i class="cap"></i><span class="id">${docId}</span></div>
  <div class="cover-main">
  ${lockup}
  <div class="cover-rule"></div>
  <div class="cover-body">
    ${code ? `<div class="type-code"><bdi dir="ltr">${code}</bdi></div>` : ''}
    <div class="kicker">${lb('kicker')}</div>
    <div class="rule-short"></div>
    <div class="cover-title">${title}</div>
  </div>
  <div class="cover-ctl">${fieldGrid(controlFields(), 2, 'fg-control')}${fieldGrid(tf, FIELD_COLS.includes(doc.cover?.cols) && doc.cover.cols <= 3 ? doc.cover.cols : 2, 'fg-type')}</div>
  <div class="cover-foot">${meta}${c.owner ? `<span${dp('/control/owner')}>${bidi(c.owner)}</span>` : ''}</div>
  </div>
</div>`;
  };
  const cover = (logos) => hide.has('cover') ? '' : cv ? coverDesigned(logos) : `<div class="cover" data-part="cover">${overlaysFor((o) => o.mode === 'cover')}
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
  ${(() => { const n = revCols(doc); const keys = ['revVersion', 'revDate', 'revDesc', 'revAuthor'].slice(0, n); return table({ columns: keys.map((k) => L[k] ?? REV_LABELS[k][lang]), colPtrs: keys.map((k) => '/labels/' + k), rows: (doc.revisions || []).map((r) => r.slice(0, n)), rowsPtr: '/revisions', ...(n > 2 ? { blankCell: '' } : {}), keepAll: true /* UAT H3: a still-empty date stays a cell a person can type in */ }); })()}</div>`,
    // 0.19.0 C7: a typed document's approvals print on the control page too (the DOCX's APPROVALS_COLUMNS); empty cells stay empty, to be signed
    ...(approvalsShown(doc) ? { approvals: () => `<div data-part="approvals"><h3>${lb('approvals')}</h3>
  ${table({ columns: L.approvalCols || [], colsPtr: '/labels/approvalCols', rows: doc.approvals.filter(Array.isArray), rowsPtr: '/approvals', keepAll: true, blankCell: '', extra: 'approvals', ...((L.approvalCols || []).length === 5 ? { colWidths: APPROVAL_WIDTHS } : {}) /* 0.19.0 R3 (review #15) */ })}</div>` } : {}),
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
  // 0.19.0 C10: the parts `layout.back` names (a form and a sheet: control and revisions by default; approvals go with control) print after the last
  // chapter under «Document control»; a form and a sheet print no contents list
  const back = backOf(doc);
  const backSet = new Set(back.includes('control') && FRONT.approvals ? [...back, 'approvals'] : back);
  const shown = order.filter((k) => !hide.has(k) && !backSet.has(k) && !(k === 'toc' && noContents(doc)));
  const front = shown.length ? `<h2>${lb('controlChapter')}</h2>
  ${shown.map((k) => FRONT[k]()).join(NL)}` : '';
  const backKeys = order.filter((k) => backSet.has(k) && !hide.has(k));
  const backPart = backKeys.length ? `<section class="chapter bw-back" data-part="back"${pageStyle(PM.segments.length - 1)}><h2>${lb('backMatter', L.backMatter ?? FAMILY_LABELS.backMatter[lang])}</h2>
  ${backKeys.map((k) => FRONT[k]()).join(NL)}</section>` : '';

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
  return { cover, front, body, questions, back: backPart, every, sheet, tocRows: rows.length, segments: PM.segments };
}

/**
 * Runs inside the page, before printing: releases keep-together groups that are
 * too tall or would strand a near-empty page. Port of render.ts `relaxTallGroups`.
 * Serialisable — pass it to page.evaluate, or call it in the browser.
 */
export function relaxTallGroups([limit, keepRows, pageH, floor, root]) {
  let n = 0;
  let waste = 0;
  // 0.16.0: `root` (optional) is a copy of the document laid out in the editor's probe frame (editor/views.js viewsRelax): its blocks are
  // measured from the root's own top and only its groups are looked at; without it the whole page is the scope, as before
  const base = root ? root.getBoundingClientRect().top : -window.scrollY;
  (root || document).querySelectorAll('.keep,.card,.hold,.fig').forEach((el) => {
    const top0 = el.getBoundingClientRect().top - base + waste;
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
      if (rows.length <= keepRows) {
        // 0.16.2: a group of no more than keepRows rows has no free middle: splitting it left an EMPTY first tbody (a break point right after the header) and the whole group in the clone
        const remaining = pageH - usedFraction * pageH;
        el.classList.add('hold');
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
/**
 * 0.16.4 (bw-0164): the print pass's verdicts as ATTRIBUTES, one function for the editor's page views (editor/views.js viewsRelax) and the PDF
 * (engine/export.mjs). relaxTallGroups splits a long held table into three tables; here that verdict is written back onto the one table instead
 * (its first rows `data-rlr="a"`, its last rows `data-rlr="b"`, `break-inside`, `.whole`), so the markup is never cloned or split and the editor's
 * column layout and the print lay out the same elements the same way. The decision is made on a copy laid out at the print measure. Markers are cleared
 * on the next pass. Serialisable except for `relaxTallGroups`, which the caller provides (the editor has it in scope; the export adds it to the page).
 * args = [relaxArgs..., measurePx]
 */
export function relaxVerdicts(main, args, parent) {
  main.querySelectorAll('[data-rlx]').forEach((e) => {
    if (e.dataset.rlc === undefined) return;
    if (e.dataset.rlc) e.setAttribute('class', e.dataset.rlc); else e.removeAttribute('class');
    if (e.dataset.rls) e.setAttribute('style', e.dataset.rls); else e.removeAttribute('style');
    delete e.dataset.rlc; delete e.dataset.rls; e.removeAttribute('data-rlx');
  });
  main.querySelectorAll('[data-rlr]').forEach((e) => e.removeAttribute('data-rlr'));
  const live = Array.from(main.querySelectorAll('.keep,.card,.hold,.fig')).filter((e) => !e.closest('.bw-runs'));
  if (!parent || !live.length) return 0;
  live.forEach((e, i) => { e.dataset.rlx = String(i); e.dataset.rlc = e.getAttribute('class') || ''; e.dataset.rls = e.getAttribute('style') || ''; });
  const probe = document.createElement('div');
  probe.className = 'bw-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none;width:${args[4]}px;zoom:1`;
  const copy = main.cloneNode(true);
  copy.querySelectorAll('.bw-runs,.bw-sheets,.bw-slot,.bw-rpts').forEach((x) => x.remove());
  copy.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  copy.removeAttribute('id');
  copy.style.cssText = 'zoom:1;width:100%;margin:0;transform:none;box-shadow:none;height:auto';
  probe.appendChild(copy);
  parent.appendChild(probe);
  try {
    relaxTallGroups([args[0], args[1], args[2], args[3], copy]);
    const by = new Map();
    copy.querySelectorAll('[data-rlx]').forEach((e) => { const l = by.get(e.dataset.rlx); if (l) l.push(e); else by.set(e.dataset.rlx, [e]); });
    live.forEach((el, i) => {
      const g = by.get(String(i));
      if (!g) return;
      if (g.length > 1) { // a long held table or list: its first rows and its last rows stay together, the middle flows
        const rows = Array.from(el.children);
        rows.slice(0, Math.max(0, g[0].children.length - 1)).forEach((r) => { r.dataset.rlr = 'a'; });
        rows.slice(Math.max(0, rows.length - g[g.length - 1].children.length + 1)).forEach((r) => { r.dataset.rlr = 'b'; });
        el.style.breakInside = 'auto';
        el.classList.remove('whole');
      } else {
        if (g[0].style.breakInside === 'auto') el.style.breakInside = 'auto';
        el.classList.toggle('whole', g[0].classList.contains('whole'));
      }
    });
  } finally { probe.remove(); }
  return live.length;
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
  if (!doc.chrome) return { side: locale === 'ar' ? 'left' : 'right', format: 'n' }; // 0.18.1: the folio is the band's end slot: left in Arabic
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
    `<style>${o.fontCss || ''}</style><div${o.locale === 'ar' ? ' dir="rtl"' : ''} style="width:100%;font-size:8pt;font-family:${stack},serif;color:${roles.muted};padding:0 16mm;display:flex;justify-content:space-between;align-items:center;">${inner}</div>`; // 0.18.1: dir=rtl mirrors the three slots in Arabic (English is byte-identical)
  // 0.19.0 R3: a sheet's running header repeats its code chip, title and two fields on every page (spec §1: the sheet is read page by page)
  const cvh = coverOf(doc);
  const typedHead = isTyped(doc) && !o.logos?.header;
  const sheetHead = typedHead && cvh?.family === 'sheet' ? (() => {
    const code = COVER_CODES[cvh.type] || '';
    const c = doc.control;
    const title = c.coverTitle ?? (String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title);
    const fs = (Array.isArray(doc.cover?.fields) ? doc.cover.fields : []).filter((f) => f && typeof f === 'object' && f.value).slice(0, 2);
    const two = (fs.length ? fs.map((f) => [textOf(f.label ?? ''), textOf(f.value ?? '')]) : [[o.labels?.control?.version || 'Version', c.version], [o.labels?.control?.status || 'Status', c.status]]);
    const chip = code ? `<span style="display:inline-block;background:${roles.primary};color:#fff;font-weight:700;letter-spacing:.1em;padding:0 1.6mm;margin-inline-end:2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;" dir="ltr">${esc(code)}</span>` : '';
    return `<span>${chip}<span style="color:${roles.ink};font-weight:700;">${esc(title)}</span></span><span>${two.map(([l, v]) => `${esc(l)}: <span style="color:${roles.ink};">${esc(v)}</span>`).join('&#160;&#160;·&#160;&#160;')}</span><span>${esc(doc.control.documentId)}&#160;&#160;${esc(doc.control.issuedOn)}</span>`;
  })() : '';
  const header = wrap(sheetHead || (
    (o.logos?.header ? `<img src="${attr(o.logos.header)}" style="height:5mm;" />` : '<span></span>') +
      `<span>${esc(doc.control.documentId)}</span><span>${esc(doc.control.issuedOn)}</span>`)
  );
  const footer = wrap(
    `<span style="color:${roles.signal};font-weight:700;">${esc(confidentialText(doc, o.theme, o.labels, o.locale))}</span>` +
      `<span style="font-weight:700;letter-spacing:.08em;">${esc(o.theme.brand?.producer || '')}</span>` +
      '<span style="font-weight:700;"></span>'
  );
  return { header, footer };
}
