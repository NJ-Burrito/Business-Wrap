/* Business-Wrap editor — explainer illustrations (0.15.0, lane explain), concatenated after explainers.js.
 * Every explanation (`explain.<id>`) has its own drawing, xplArtFor(id): 160 x 96 inline SVG, brand roles only (CSS classes in
 * ux.css, so light, dark and the dim theme follow), no text inside (it would not translate: arrows, highlights and the tool's own
 * icon only). Each scene is written in its END state, the one the tool leaves behind; the CSS animations (k-* classes) play it
 * from "before" through "action" to "after" in 2.4 s, and calm / reduced motion simply stops on the end state.
 * Scenes are families with variants (save:copy, fmt:bold, dg:align.l…); XPL_MAP assigns every id to one. A tool that has an icon
 * in editor/icons.json shows it in the corner badge; a tool without one shows the recipe's fallback icon (never a blank).
 * 0.17.10 redraw: every drawing sits in a miniature of the real tool (navy top bar with tabs, a ribbon with one lit button, the canvas),
 * a cursor glides to the lit button and presses it, then the scene plays before -> action -> after, and a small gold payoff (ring,
 * sparkles, badge pop) closes the loop. Depth comes from CSS (soft shadows, gloss lines, a light sweep), never from gradients or ids
 * (a gradient inside a hidden <svg> would not resolve), so the strings stay free of colours. Calm shows the end state: the CSS in
 * ext/38-explain-art.css keeps the cursor, ripple, ring and sparkles at opacity 0 unless an animation runs.
 * Declarations only (hoisted); nothing runs until xplArtFor() is called after boot. */

/** A class given inside the extra attributes (class="…") joins the shape's own classes instead of repeating the attribute. */
const xaCls = (c, s) => { const m = /class="([^"]*)"/.exec(s || ''); return m ? [`${c} ${m[1]}`, s.replace(m[0], '').trim()] : [c, s || '']; };
const xaR = (c, x, y, w, h, r = 2, s = '') => { const [k, e] = xaCls(c, s); return `<rect class="${k}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"${e ? ` ${e}` : ''}/>`; };
const xaC = (c, x, y, r, s = '') => { const [k, e] = xaCls(c, s); return `<circle class="${k}" cx="${x}" cy="${y}" r="${r}"${e ? ` ${e}` : ''}/>`; };
const xaP = (c, d, s = '') => { const [k, e] = xaCls(c, s); return `<path class="${k}" d="${d}" pathLength="100"${e ? ` ${e}` : ''}/>`; };
const xaG = (c, inner, s = '') => `<g class="${c}"${s ? ` ${s}` : ''}>${inner}</g>`;
/** The "before" offset a moving part starts from (it ends where it is drawn). */
const xaMv = (dx, dy, o = '') => `style="--dx:${dx}px;--dy:${dy}px${o ? `;transform-origin:${o}` : ''}"`;
/** The "before" scale a growing part starts from. */
const xaSc = (sx, sy, o = '') => `style="--sx:${sx};--sy:${sy}${o ? `;transform-origin:${o}` : ''}"`;
const xaLn = (x, y, w, c = 'ln', s = '') => xaR(c, x, y, w, 4, 2, s);
const xaLines = (x, y, n, w = 44, o = {}) => Array.from({ length: n }, (_, i) => {
  const ww = i % 3 === 2 ? Math.max(5, w - 14) : w;
  return xaLn(o.right ? x + w - ww : x, y + i * (o.gap || 9), ww, o.c || 'ln', `style="--i:${i}"`);
}).join('');
/** A page: a sheet with a gloss edge, a heading bar (accent on the reading start side) and n text lines. */
const xaPage = (x = 52, y = 8, w = 56, h = 80, n = 7, o = {}) => xaG(o.cls || 'pg', xaR('sheet', x, y, w, h, 5) + xaR('gl', x + 2, y + 1.2, w - 4, 1.4, 0.7)
  + (n > 0 ? xaR('ln hd', o.right ? x + w - 6 - (w - 12) * 0.42 : x + 6, y + 4.6, (w - 12) * 0.42, 3, 1.5, 'style="--i:0"') : '') + xaLines(x + 6, y + 10, n, w - 12, o));
/** Drawn for a right-to-left interface when true (start = right): set by xplArtFor before each drawing. */
let XPL_RTL = true;
/** A paragraph's start/end as a physical side: s -> l (LTR) or r (RTL), e the other; c and j stay. */
const xaEnd = (a) => (a === 's' ? (XPL_RTL ? 'r' : 'l') : a === 'e' ? (XPL_RTL ? 'l' : 'r') : a);
/** Mirrors a drawing left-right when the interface is right-to-left (direction arrows). */
const xaMir = (inner) => (XPL_RTL ? `<g transform="translate(160 0) scale(-1 1)">${inner}</g>` : inner);
const xaTray = (x = 44, y = 84, w = 72) => xaR('tray', x, y, w, 6, 3);
const xaDown = (x, y, k = 'k-mv', d = -14) => xaG(k, xaP('acs', `M${x} ${y} v18 m-7 -7 l7 7 l7 -7`), xaMv(0, d));
/** Pass 2 kit: a soft shadow that lands under a moving object, a 4-point star (payoff, never a cross), a glint that crosses the result. */
const xaShd = (x, y, w) => xaR('shd k-fade', x, y, w, 3, 1.5);
const xaStar = (x, y, r = 3) => `<path class="star" d="M${x} ${y - r} L${x + r * 0.28} ${y - r * 0.28} L${x + r} ${y} L${x + r * 0.28} ${y + r * 0.28} L${x} ${y + r} L${x - r * 0.28} ${y + r * 0.28} L${x - r} ${y} L${x - r * 0.28} ${y - r * 0.28} Z"/>`;
const xaGlint = (x, y, w, h) => xaR('glint', x, y, 5, h, 2, `style="--gw:${w}px"`);
/** A selected word: a short bar on a line of text. */
const xaWord = (x, y, w, c = 'ln', s = '') => xaR(c, x, y, w, 6, 3, s);
/** A diagram node by kind, centred on cx, cy. */
function xaNode(kind, cx, cy, c = 'bx') {
  const b = (w = 34, h = 20, r = 4) => xaR(c, cx - w / 2, cy - h / 2, w, h, r) + xaR('gl', cx - w / 2 + 3, cy - h / 2 + 1.3, w - 6, 1.4, 0.7);
  switch (kind) {
    case 'start': return xaR('ac', cx - 18, cy - 8, 36, 16, 8);
    case 'decision': return `<path class="${c}" d="M${cx} ${cy - 15} L${cx + 22} ${cy} L${cx} ${cy + 15} L${cx - 22} ${cy} Z"/>`;
    case 'ok': return xaC('ok', cx, cy, 12) + xaP('wh', `M${cx - 5} ${cy} l4 4 l7 -8`);
    case 'stop': return xaC('no', cx, cy, 12) + xaP('wh', `M${cx - 4.5} ${cy - 4.5} l9 9 m0 -9 l-9 9`);
    case 'note': return `<path class="${c} dash" d="M${cx - 17} ${cy - 11} h26 l8 8 v14 h-34 Z"/>` + xaLn(cx - 11, cy - 3, 20) + xaLn(cx - 11, cy + 4, 14);
    case 'group': return xaR('gh', cx - 34, cy - 20, 68, 40, 6) + xaR('side', cx - 34, cy - 20, 68, 9, 4);
    case 'text': return xaLn(cx - 18, cy - 5, 36) + xaLn(cx - 18, cy + 3, 24) + xaR('caret', cx + 10, cy + 2, 2, 8, 1);
    case 'applicant': return b() + xaC('pr', cx - 8, cy - 3, 3.4) + xaP('prs', `M${cx - 14} ${cy + 7} q6 -8 12 0`) + xaLn(cx + 2, cy - 2, 12);
    case 'payment': return b() + xaC('ac', cx - 8, cy, 5) + xaLn(cx + 1, cy - 2, 13);
    case 'rework': return b() + xaP('acs', `M${cx + 11} ${cy - 3} a7 7 0 1 0 2 8 m-3 -6 l3 -2 l1 4`) + xaLn(cx - 14, cy - 2, 14);
    case 'system': return b() + xaC('gh', cx - 8, cy, 5) + xaLn(cx + 1, cy - 2, 13);
    default: return b() + xaLn(cx - 12, cy - 2, 24);
  }
}
/** A diagram canvas: a sheet, plus (unless nodes === false) two boxes joined by an arrow. */
const xaMini = (o = {}) => xaR('sheet', 14, 8, 132, 80, 6) + (o.nodes === false ? '' : xaNode('', 44, 40) + xaNode('', 112, 40) + xaP('wr', 'M61 40 h34 m-6 -5 l6 5 l-6 5'));
const xaPicture = (x, y, w, h, c = 'sf') => xaR(c, x, y, w, h, 3) + xaC('mk', x + w * 0.3, y + h * 0.32, 3) + xaP('prs', `M${x + 3} ${y + h - 3} l${w * 0.32} -${h * 0.36} l${w * 0.22} ${h * 0.22} l${w * 0.14} -${h * 0.1}`, 'style="stroke-width:1.6"');

const XPL_SCENES = {
  /* ── files ── */
  save(v) {
    const base = xaTray() + xaG('k-in2', xaC('ok', 118, 82, 6) + xaP('wh', 'M115 82 l2.4 2.6 l4.4 -5'));
    const drop = (pg) => xaG('k-mv', pg, xaMv(0, -22)); // the document settles into the tray, then a tick confirms it
    switch (v) {
      case 'copy': return xaG('k-in', xaPage(60, 12, 56, 74, 6, { cls: 'pg ghost' })) + drop(xaPage(52, 6, 56, 74, 6)) + base + xaDown(80, 34);
      case 'json': return xaPage(40, 6, 52, 74, 6) + xaP('acs k-draw', 'M112 28 q-7 0 -7 7 v6 q0 5 -5 5 q5 0 5 5 v6 q0 7 7 7 M132 28 q7 0 7 7 v6 q0 5 5 5 q-5 0 -5 5 v6 q0 7 -7 7') + base;
      case 'stack': return xaR('sheet', 62, 8, 52, 68, 5) + xaR('sheet', 56, 14, 52, 68, 5) + xaPage(50, 20, 52, 62, 5) + base + xaDown(80, 36);
      case 'pack': return xaR('sheet', 44, 12, 72, 62, 8) + xaC('pr', 64, 34, 7) + xaC('ac', 84, 34, 7) + xaC('mk', 104, 34, 7) + xaC('ok', 74, 56, 7) + xaC('sg', 94, 56, 7) + base;
      case 'log': return drop(xaPage(52, 6, 56, 74, 0)) + [0, 1, 2, 3].map((i) => xaC('mk', 62, 22 + i * 13, 3) + xaLn(70, 20 + i * 13, 30)).join('') + base + xaDown(80, 40);
      case 'snap': return xaPage(52, 6, 56, 74, 6) + xaP('prs', 'M44 22 v-10 h10 M116 22 v-10 h-10 M44 70 v10 h10 M116 70 v10 h-10') + xaC('wh k-flash', 80, 44, 24) + base;
      default: return drop(xaPage(52, 6, 56, 74, 6)) + base + xaDown(80, 34);
    }
  },
  out(v) { // kind.lang: pdf|docx|print|html|menu|mmd|svg|png . ar|en|both
    const [kind, lang = ''] = v.split('.');
    const from = ['mmd', 'svg', 'png'].includes(kind) ? xaR('sheet', 14, 20, 50, 56, 5) + xaNode('', 38, 36) + xaR('bx', 26, 54, 22, 12, 3) + xaP('wr', 'M38 46 v8') : xaPage(16, 10, 50, 76, 6, { right: lang === 'ar' });
    const card = (x, y) => {
      const body = {
        pdf: xaR('ac', x + 4, y + 4, 22, 5, 2) + xaLines(x + 4, y + 14, 3, 22),
        docx: xaR('pr', x + 4, y + 4, 8, 22, 2) + xaLines(x + 15, y + 8, 4, 12, { gap: 6 }),
        html: xaP('prs', `M${x + 10} ${y + 10} l-5 6 l5 6 M${x + 22} ${y + 10} l5 6 l-5 6`),
        print: xaR('pr', x + 3, y + 14, 24, 10, 3) + xaR('sheet', x + 8, y + 3, 14, 12, 2),
        mmd: xaLines(x + 5, y + 7, 4, 20, { gap: 6 }),
        svg: xaC('acs', x + 15, y + 14, 8) + xaC('ac', x + 15, y + 6, 2),
        png: [0, 1, 2].map((r) => [0, 1, 2].map((q) => xaR((r + q) % 2 ? 'pr' : 'sf', x + 5 + q * 7, y + 5 + r * 7, 7, 7, 0)).join('')).join(''),
      }[kind] || xaLines(x + 4, y + 8, 3, 22);
      return xaR('sheet', x, y, 30, 32, 4) + body;
    };
    if (kind === 'menu') return xaPage(16, 10, 50, 76, 6) + [0, 1, 2, 3].map((i) => xaG(i % 2 ? 'k-in2' : 'k-in', xaR('sheet', 86, 8 + i * 20, 52, 16, 4) + xaR(['ac', 'pr', 'ok', 'mk'][i], 90, 12 + i * 20, 8, 8, 2) + xaLn(102, 14 + i * 20, 30), xaMv(-24, 0))).join('');
    const cards = lang === 'both' ? xaG('k-in', card(104, 4), xaMv(-30, 0)) + xaG('k-in2', card(108, 38), xaMv(-30, 0)) : xaG('k-in', card(104, 22), xaMv(-30, 0));
    const shd = lang === 'both' ? xaShd(108, 70, 30) : xaShd(108, 52, 30);
    return xaG('k-mv', from, xaMv(0, 0)) + xaP('acs k-draw', 'M70 46 h26 m-6 -6 l6 6 l-6 6') + cards + shd + xaGlint(106, lang === 'both' ? 6 : 24, 24, 30);
  },
  in(v) {
    switch (v) {
      case 'mmd': return xaR('sheet', 10, 16, 42, 62, 5) + xaLines(16, 24, 5, 30, { gap: 10 }) + xaP('acs', 'M58 46 h14 m-5 -5 l5 5 l-5 5') + xaG('k-in', xaNode('', 96, 34) + xaNode('', 126, 62) + xaP('wr', 'M102 44 q12 20 22 8'), xaMv(-10, 0));
      case 'pack': return xaR('sheet', 10, 22, 36, 46, 6) + xaC('pr', 22, 38, 5) + xaC('ac', 34, 38, 5) + xaC('mk', 22, 54, 5) + xaP('acs', 'M52 46 h14 m-5 -5 l5 5 l-5 5') + xaPage(76, 10, 56, 76, 6, { c: 'ln hue' });
      default: return xaR('tray', 10, 36, 30, 24, 4) + xaPage(52, 8, 56, 78, 7) + xaR('blk k-in', 58, 36, 44, 12, 3, xaMv(-44, 0)) + xaShd(60, 47, 40) + xaGlint(58, 36, 40, 12);
    }
  },
  swap(v) { // an image/logo replaced, captioned, repeated, removed
    const pg = xaPage(40, 6, 70, 84, 0) + xaLines(46, 14, 2, 58);
    switch (v) {
      case 'caption': return pg + xaPicture(48, 30, 54, 28) + xaLn(56, 64, 38, 'mk k-grow', xaSc(0, 1, 'left center')) + xaLn(56, 72, 24);
      case 'every': return xaPage(10, 14, 40, 66, 3) + xaPage(60, 14, 40, 66, 3) + xaPage(110, 14, 40, 66, 3) + [20, 70, 120].map((x, i) => xaR(i ? 'ac k-in2' : 'ac k-in', x, 20, 20, 10, 3)).join('');
      case 'delete': return pg + xaR('gh', 48, 30, 54, 34, 3) + xaG('k-gone', xaPicture(48, 30, 54, 34));
      default: return pg + xaG('k-gone', xaPicture(48, 30, 54, 34, 'cell')) + xaG('k-in', xaPicture(48, 30, 54, 34), xaMv(24, 0)) + xaShd(52, 63, 46) + xaGlint(50, 30, 44, 34);
    }
  },
  pop(v) { // a new block appears on the page: a dashed landing outline first, the block drops in with a shadow, a glint crosses it
    const R = { image: [48, 34, 54, 26], logo: [86, 10, 18, 14], diagram: [46, 32, 58, 34], text: [54, 32, 44, 26], table: [48, 32, 54, 32], section: [46, 30, 58, 40], chapter: [46, 26, 58, 40], story: [46, 28, 58, 40], outchapter: [46, 24, 58, 44], outstory: [46, 28, 58, 40], point: [57, 42, 42, 20], card: [78, 28, 28, 40], toc: [50, 49, 52, 9], para: [48, 34, 54, 22] }[v] || (['tochide', 'newdoc', 'process'].includes(v) ? null : [48, 34, 54, 14]);
    const out = XPL_SCENES.pop0(v);
    if (!R) return out;
    const pg = xaPage(40, 6, 70, 84, 7);
    const at = out.startsWith(pg) ? pg.length : 0;
    return out.slice(0, at) + xaR('gh', R[0], R[1], R[2], R[3], 3) + out.slice(at) + xaShd(R[0] + 4, R[1] + R[3] - 1, R[2] - 8) + xaGlint(R[0] + 2, R[1], R[2] - 6, R[3]);
  },
  pop0(v) {
    const pg = xaPage(40, 6, 70, 84, 7);
    switch (v) {
      case 'image': return pg + xaG('k-in', xaPicture(48, 34, 54, 26));
      case 'logo': return pg + xaG('k-in', xaR('ac', 86, 10, 18, 14, 3) + xaC('wh', 95, 17, 3.4));
      case 'diagram': return pg + xaG('k-in', xaR('sheet', 46, 32, 58, 34, 3) + xaR('bx', 52, 38, 18, 11, 3) + xaR('bx', 80, 50, 18, 11, 3) + xaP('wr', 'M61 49 v7 h18'));
      case 'text': return pg + xaG('k-in', xaR('hue', 54, 32, 44, 26, 3, 'style="fill-opacity:.35"') + xaLn(60, 40, 32) + xaLn(60, 48, 22) + xaR('caret', 84, 46, 2, 8, 1));
      case 'table': return pg + xaG('k-in', [0, 1, 2].map((r) => [0, 1, 2].map((q) => xaR(r ? 'cell' : 'sf', 48 + q * 18, 32 + r * 11, 17, 10, 2)).join('')).join(''));
      case 'section': return pg + xaG('k-in', xaR('side', 46, 30, 58, 8, 3) + xaLines(48, 44, 3, 52));
      case 'chapter': return pg + xaG('k-in', xaR('pr', 46, 26, 58, 12, 3) + xaLn(52, 31, 30, 'wh') + xaLines(48, 46, 3, 52));
      case 'story': return pg + xaG('k-in', xaR('sheet', 46, 28, 58, 40, 4) + xaR('ac', 46, 28, 5, 40, 2) + xaLn(56, 34, 36, 'sf') + xaLines(56, 44, 3, 40, { gap: 8 }));
      case 'outchapter': return pg + xaG('k-in', xaR('pr', 46, 24, 58, 10, 3) + xaLn(52, 28, 30, 'wh') + xaR('sheet', 46, 38, 58, 30, 4) + [0, 1, 2].map((r) => xaR(r ? 'cell' : 'sf', 52, 43 + r * 8, 22, 6, 2) + xaR(r ? 'cell' : 'sf', 78, 43 + r * 8, 22, 6, 2)).join(''));
      case 'outstory': return pg + xaG('k-in', xaR('sheet', 46, 28, 58, 40, 4) + xaR('ac', 46, 28, 5, 40, 2) + xaLn(56, 34, 36, 'sf') + [0, 1, 2].map((r) => xaR(r ? 'cell' : 'sf', 56, 42 + r * 8, 22, 7, 2) + xaR(r ? 'cell' : 'sf', 80, 42 + r * 8, 22, 7, 2)).join(''));
      case 'point': return pg + xaR('sheet', 46, 28, 58, 40, 4) + xaR('ac', 46, 28, 5, 40, 2) + xaLn(56, 34, 36, 'sf') + xaG('k-in', xaC('ok', 59, 47, 3.4) + xaLn(66, 45, 30) + xaC('ok', 59, 57, 3.4) + xaLn(66, 55, 24));
      case 'card': return pg + xaR('sheet', 46, 28, 28, 40, 4) + xaR('ac', 46, 28, 28, 5, 2) + xaG('k-in', xaR('sheet', 78, 28, 28, 40, 4) + xaR('ac', 78, 28, 28, 5, 2) + xaLines(82, 40, 3, 20));
      case 'toc': return pg + [0, 1, 2].map((i) => xaLn(50, 20 + i * 10, 40 - i * 3) + xaLn(92, 20 + i * 10, 8)).join('') + xaG('k-in', xaLn(50, 50, 30, 'mk') + xaLn(92, 50, 8));
      case 'tochide': return pg + [0, 1, 2].map((i) => xaLn(50, 20 + i * 10, 40 - i * 4) + xaLn(92, 20 + i * 10, 8)).join('') + xaR('gh', 48, 48, 56, 8, 3) + xaG('k-gone', xaLn(50, 50, 30, 'mk') + xaLn(92, 50, 8));
      case 'newdoc': return xaPage(26, 14, 52, 72, 4, { cls: 'pg ghost' }) + xaG('k-in', xaPage(70, 8, 56, 78, 6)) + xaG('k-in2', xaC('ac', 124, 14, 9) + xaP('wh', 'M124 9 v10 M119 14 h10'));
      case 'start': return xaR('sheet', 14, 8, 132, 80, 6) + xaR('side', 14, 8, 132, 12, 6) + [0, 1, 2].map((i) => xaR(i === 1 ? 'hi' : 'cell', 24 + i * 40, 28, 32, 44, 3) + xaR(['pr', 'ac', 'ok'][i], 24 + i * 40, 28, 4, 44, 2) + xaLn(32 + i * 40, 62, 18)).join('') + xaG('k-in', xaR('pr', 62, 28, 36, 8, 2) + xaC('ac', 128, 70, 9) + xaP('wh', 'M128 65 v10 M123 70 h10'));
      case 'process': return xaR('sheet', 14, 8, 132, 80, 6) + xaNode('start', 40, 24) + xaG('k-in', xaNode('', 40, 56) + xaP('wr', 'M40 33 v14')) + xaG('k-in2', xaNode('decision', 104, 56) + xaP('wr', 'M58 56 h22'));
      case 'para': return pg + xaLines(48, 14, 2, 54) + xaG('k-in', xaLines(48, 34, 3, 54, { c: 'ln mkln' })) + xaLines(48, 64, 2, 54);
      default: return pg + xaG('k-in', xaR('blk', 48, 34, 54, 14, 3));
    }
  },
  edit(v) { // block-level edits on a page
    const pg = xaPage(40, 6, 70, 84, 7);
    const blk = (y, c = 'blk', s = '') => xaR(c, 48, y, 54, 12, 3, s);
    switch (v) {
      case 'dup': return pg + blk(32) + xaG('k-in', blk(46, 'blk ghost'));
      case 'del': return pg + xaR('gh', 48, 34, 54, 12, 3) + xaG('k-gone', blk(34));
      case 'up': return pg + blk(24, 'blk k-mv', xaMv(0, 24)) + blk(48, 'sf');
      case 'down': return pg + blk(48, 'blk k-mv', xaMv(0, -24)) + blk(24, 'sf');
      case 'comment': return pg + blk(34) + xaG('k-in', xaR('mk', 90, 14, 30, 20, 5) + xaLines(95, 20, 2, 20, { gap: 6 }) + xaP('mkl', 'M96 34 l-4 6 l10 -6'), xaMv(0, 6));
      case 'copy': return pg + blk(34) + xaG('k-mv', xaR('sheet', 114, 40, 26, 34, 4) + xaR('tray', 120, 36, 14, 6, 3) + xaLines(118, 50, 3, 18, { gap: 7 }), xaMv(-40, 0));
      case 'paste': return xaR('sheet', 118, 8, 26, 34, 4) + xaR('tray', 124, 4, 14, 6, 3) + xaLines(122, 18, 3, 18, { gap: 7 }) + pg + xaG('k-in', blk(46));
      case 'hide': return pg + xaR('gh', 48, 34, 54, 12, 3) + xaG('k-gone', blk(34)) + xaP('acs', 'M62 70 q18 -14 36 0 M64 74 l-4 4 M80 76 v5 M96 74 l4 4');
      case 'style': return pg + blk(34) + xaG('k-fade', xaR('ac', 48, 34, 54, 12, 3, 'style="fill-opacity:.35;stroke:var(--bw-accent-strong);stroke-width:2"')) + xaC('ac', 92, 60, 5) + xaC('pr', 104, 60, 5);
      case 'keep': return xaR('sheet', 14, 10, 58, 76, 5) + xaR('sheet', 88, 10, 58, 76, 5) + xaR('blk', 22, 62, 42, 12, 3) + xaR('blk k-mv', 96, 18, 42, 12, 3, xaMv(-46, 0)) + xaG('k-in', xaP('acs', 'M64 66 q16 -2 32 -44'));
      case 'break': return xaPage(14, 8, 56, 78, 4) + xaPage(90, 8, 56, 78, 3) + xaR('blk k-mv', 98, 22, 40, 12, 3, xaMv(-40, 40)) + xaP('cut', 'M80 4 v88');
      default: return pg + blk(34);
    }
  },
  undo(v) {
    const pg = xaPage(40, 6, 70, 84, 7);
    // undo: the last block leaves (a dashed ghost stays) and a turning arrow runs back; redo: the block returns with a pop. The arrows follow the reading direction like the badge.
    const blk = xaR('hi', 48, 34, 54, 12, 3, 'style="stroke-width:1.2"');
    const ar = v === 'undo' ? xaP('arc back', 'M116 26 h6 a12 12 0 1 1 0 24 h-8 m4 -4 l-4 4 l4 4', 'style="stroke-dasharray:80"') : xaP('arc fwd', 'M44 26 h-6 a12 12 0 1 0 0 24 h8 m-4 -4 l4 4 l-4 4', 'style="stroke-dasharray:80"');
    return pg + xaR('gh', 48, 34, 54, 12, 3) + (v === 'undo' ? xaG('k-gone', blk) : xaG('k-in', blk, xaMv(0, 8))) + xaShd(50, 48, 50) + xaMir(ar);
  },
  /* ── tables ── */
  tbl(v) { // add|del|up|down . row|col
    const [op, kind = 'row'] = v.split('.');
    const sheet = xaR('sheet', 28, 10, 104, 76, 6);
    const cell = (r, q, nr, nc, c = 'cell') => xaR(c, 34 + q * (92 / nc), 16 + r * (64 / nr), 92 / nc - 4, 64 / nr - 4, 2);
    const grid = (nr, nc, skipR = -1, skipC = -1) => Array.from({ length: nr }, (_, r) => Array.from({ length: nc }, (_, q) => (r === skipR || q === skipC) ? '' : cell(r, q, nr, nc)).join('')).join('');
    if (kind === 'col') {
      if (op === 'add') return sheet + grid(3, 4, -1, 3) + xaG('k-grow', xaR('hi', 103, 16, 19, 60, 2), xaSc(0, 1, 'left center'));
      return sheet + grid(3, 4) + xaR('gh', 80, 16, 19, 60, 2) + xaR('no k-gone2', 80, 16, 19, 60, 2, 'style="fill-opacity:.6"');
    }
    if (op === 'add') return sheet + grid(4, 3, 3) + xaG('k-grow', xaR('hi', 34, 64, 92, 12, 2), xaSc(1, 0, 'center top'));
    if (op === 'del') return sheet + grid(4, 3) + xaR('gh', 34, 48, 92, 12, 2) + xaR('no k-gone2', 34, 48, 92, 12, 2, 'style="fill-opacity:.6"');
    if (op === 'up') return sheet + grid(3, 3, 0) + xaR('hi k-mv', 34, 16, 92, 16, 2, xaMv(0, 21));
    return sheet + grid(3, 3, 2) + xaR('hi k-mv', 34, 58, 92, 16, 2, xaMv(0, -21));
  },
  cells(v) {
    const sheet = xaR('sheet', 24, 12, 112, 72, 6);
    const grid = (hi = '', skip = []) => Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, q) => skip.includes(`${r}${q}`) ? '' : xaR(hi.includes(`${r}${q}`) ? 'hi' : 'cell', 30 + q * 35, 18 + r * 21, 33, 19, 2)).join('')).join('');
    switch (v) {
      case 'merge': return sheet + grid('', ['00', '01']) + xaG('k-grow', xaR('hi', 30, 18, 68, 19, 2), xaSc(0.5, 1, 'left center')) + xaP('acs k-fade', 'M64 28 h-8 m3 -3 l-3 3 l3 3 M68 28 h8 m-3 -3 l3 3 l-3 3');
      case 'split': return sheet + grid('', ['00']) + xaR('hi k-in', 30, 18, 15, 19, 2, xaMv(8, 0)) + xaR('hi k-in2', 49, 18, 15, 19, 2, xaMv(-8, 0)) + xaP('acs k-fade', 'M47 14 v27', 'style="stroke-dasharray:3 3"') + xaShd(34, 38, 28);
      case 'wrap': return sheet + grid() + xaR('sheet', 30, 18, 33, 19, 2) + xaLn(34, 22, 24) + xaLn(34, 29, 14, 'ln k-in');
      case 'fill': return sheet + grid('') + ['01', '10', '11', '12', '21'].map((k, i) => xaR(i % 2 ? 'hi k-in2' : 'hi k-in', 30 + k[1] * 35, 18 + k[0] * 21, 33, 19, 2, xaMv(0, -6))).join('') + xaG('k-mv', xaC('ac', 124, 24, 4) + xaP('acs', 'M118 30 q6 6 12 0'), xaMv(-60, 20));
      case 'colw': return sheet + grid('', ['00', '10', '20']) + [0, 1, 2].map((r) => xaR('hi k-grow', 30, 18 + r * 21, 68, 19, 2, xaSc(0.5, 1, 'left center'))).join('') + xaP('acs k-fade', 'M30 78 h68 m-6 -4 l6 4 l-6 4 M30 74 v8 M98 74 v8');
      case 'rowh': return sheet + grid('', ['00', '01', '02']) + [0, 1, 2].map((q) => xaR('hi k-grow', 30 + q * 35, 18, 33, 19, 2, xaSc(1, 0.55, 'center top'))).join('') + xaP('acs k-fade', 'M126 18 v19 m-4 -5 l4 5 l4 -5 M122 18 h8 M122 37 h8');
      case 'clearv': return sheet + grid('11') + xaG('k-gone', xaLn(70, 48, 22, 'ln'));
      case 'keepe': return sheet + grid('11') + xaP('acs k-fade', 'M68 48 h26', 'style="stroke-dasharray:3 3"') + xaP('acs', 'M64 40 v16 M98 40 v16');
      default: return sheet + grid('11') + xaG('k-gone', xaLn(70, 48, 22, 'ln') + xaC('ac', 90, 56, 3)) + xaP('prs', 'M112 60 l8 -8 l4 4 l-8 8 Z');
    }
  },
  /* ── find, check, panels ── */
  find(v) {
    const pg = xaPage(52, 8, 56, 78, 6);
    switch (v) {
      case 'check': return pg + xaR('hi', 58, 22, 30, 7, 2) + xaR('hi', 58, 40, 36, 7, 2) + xaG('k-in', xaC('ok', 112, 40, 10) + xaP('wh', 'M107 40 l4 4 l7 -8'));
      case 'q': return xaR('sheet', 20, 36, 120, 24, 8) + xaC('prs', 36, 47, 6) + xaP('prs', 'M41 52 l7 7') + xaLn(54, 45, 54, 'mk k-grow', xaSc(0, 1, 'left center')) + xaR('caret', 112, 42, 2, 12, 1);
      case 'r': return xaR('sheet', 20, 36, 120, 24, 8) + xaLn(30, 45, 36, 'ln') + xaP('acs', 'M72 48 h14 m-5 -5 l5 5 l-5 5') + xaLn(94, 45, 36, 'mk k-grow', xaSc(0, 1, 'left center'));
      case 'next': return pg + xaR('hi', 58, 22, 30, 7, 2) + xaR('hi', 58, 40, 36, 7, 2) + xaR('hi k-blink', 58, 58, 24, 7, 2) + xaG('k-mv', xaP('acs', 'M112 26 v8 m-4 -4 l4 4 l4 -4 M112 44 v8 m-4 -4 l4 4 l4 -4'), xaMv(0, -18));
      case 'all': return pg + [22, 40, 58].map((y, i) => xaR('ok k-fade', 58, y, 28 + i * 4, 7, 2)).join('');
      default: return pg + xaR('hi', 58, 24, 30, 7, 2) + xaG('lens', xaC('lensc', 0, 0, 9) + xaP('lensp', 'M6 6 l8 8'), 'style="translate:80px 40px"');
    }
  },
  panel(v) { // a side panel opens beside the page
    const pg = xaPage(78, 8, 56, 78, 6);
    const side = (inner) => xaG('pane', xaR('side', 14, 8, 56, 78, 6) + inner);
    switch (v) {
      case 'outline': return pg + side(xaLn(20, 18, 40, 'wh') + xaLn(26, 28, 30, 'mk') + xaLn(26, 38, 26, 'wh') + xaLn(20, 50, 36, 'wh') + xaLn(26, 60, 28, 'wh'));
      case 'pages': return pg + side([0, 1, 2].map((i) => xaR(i === 1 ? 'hi' : 'sheet', 26, 14 + i * 22, 32, 19, 2)).join(''));
      case 'history': return pg + side(xaC('wh', 28, 22, 6) + [0, 1, 2].map((i) => xaLn(20, 36 + i * 12, 40 - i * 6, i ? 'wh' : 'mk')).join(''));
      case 'theme': return pg + side([0, 1, 2, 3].map((i) => xaC(['pr', 'ac', 'mk', 'ok'][i], 24 + (i % 2) * 16, 24 + Math.floor(i / 2) * 16, 6)).join('') + xaR('wh', 20, 56, 42, 4, 2) + xaC('ac', 40, 58, 5));
      case 'palette': return xaG('k-in', xaR('sheet', 24, 14, 112, 68, 8) + xaR('cell', 32, 22, 96, 14, 5) + xaP('prs', 'M40 29 h6', 'style="stroke-width:1.6"') + [0, 1, 2].map((i) => xaR(i === 1 ? 'hi' : 'cell', 32, 42 + i * 13, 96, 10, 3)).join(''), xaMv(0, -8)) + xaShd(30, 80, 100);
      case 'more': return xaPage(30, 8, 56, 78, 6) + xaG('k-in', xaR('sheet', 98, 24, 44, 40, 6) + [0, 1, 2].map((i) => xaLn(104, 32 + i * 10, 32)).join('')) + xaC('ac', 18, 40, 2.6) + xaC('ac', 18, 48, 2.6) + xaC('ac', 18, 56, 2.6);
      case 'settings': return pg + side(xaC('gh', 40, 40, 12) + xaC('wh', 40, 40, 4) + [0, 45, 90, 135].map((a) => xaR('wh', 38, 24, 4, 6, 1, `transform="rotate(${a} 40 40)"`)).join(''));
      case 'library': return pg + side([0, 1, 2].map((i) => xaR('sheet', 22, 14 + i * 22, 40, 18, 3) + xaR(['ac', 'pr', 'ok'][i], 26, 18 + i * 22, 8, 10, 2) + xaLn(38, 21 + i * 22, 20)).join(''));
      case 'timeline': return xaR('sheet', 14, 24, 132, 48, 8) + xaP('rl', 'M26 48 h108') + [0, 1, 2, 3, 4].map((i) => xaC(i === 3 ? 'ac' : 'pr', 30 + i * 25, 48, i === 3 ? 6 : 4)).join('') + xaG('k-mv', xaP('acs', 'M98 32 v8 m-4 -4 l4 4 l4 -4'), xaMv(-25, 0));
      case 'prov': return pg + side([0, 1, 2].map((i) => xaC('wh', 40, 22 + i * 20, 6) + (i < 2 ? xaR('wh', 38.5, 28 + i * 20, 3, 8, 1) : '')).join('') + xaC('mk', 40, 62, 6));
      case 'learn': return pg + side(xaR('wh', 28, 34, 24, 18, 3) + xaP('wh', 'M33 34 v-5 a7 7 0 0 1 14 0 v5') + xaLn(20, 60, 40, 'mk') + xaLn(20, 68, 28, 'wl'));
      case 'close': return pg + xaG('k-gone', xaR('side', 14, 8, 56, 78, 6) + xaP('wh', 'M34 36 l12 12 m0 -12 l-12 12'));
      case 'svc': return xaR('sheet', 30, 22, 100, 20, 6) + xaP('prs', 'M112 30 l5 5 l5 -5') + xaG('k-in', xaR('sheet', 30, 46, 100, 36, 6) + [0, 1].map((i) => xaR(i ? 'cell' : 'hi', 36, 50 + i * 15, 88, 12, 3)).join(''));
      default: return pg + side(xaLines(20, 18, 5, 40, { c: 'ln wl' }));
    }
  },
  /* ── spelling tab (0.15.2) ── */
  spell(v) {
    const W = (x, y, w) => xaWord(x, y, w, 'ln');
    const bad = (x, y, w) => xaWord(x, y, w, 'wl') + xaP('no', `M${x} ${y + 9} q2.5 -4 5 0 t5 0 t5 0 t5 0`, 'style="fill:none;stroke:var(--bw-danger);stroke-width:2"');
    const pg = xaR('sheet', 36, 8, 88, 76, 5);
    switch (v) {
      case 'next': return pg + W(46, 20, 56) + bad(46, 36, 30) + W(46, 52, 48) + bad(46, 66, 26) + xaR('hi k-mv', 42, 32, 40, 16, 3, xaMv(0, 30)) + xaDown(110, 22);
      case 'prev': return pg + W(46, 20, 56) + bad(46, 36, 30) + W(46, 52, 48) + bad(46, 66, 26) + xaR('hi k-mv', 42, 62, 40, 16, 3, xaMv(0, -30)) + xaP('acs k-mv', 'M110 44 v-18 m-7 7 l7 -7 l7 7', xaMv(0, 6));
      case 'fix': return pg + W(46, 20, 56) + xaG('k-gone', bad(46, 36, 34)) + xaWord(46, 36, 34, 'ok k-fade') + xaP('wh', 'M52 39 l4 4 l8 -8') + xaR('side', 50, 50, 58, 14, 7) + xaLn(58, 55, 40, 'wl');
      case 'fixall': return pg + [0, 1, 2].map((i) => xaG('k-gone', bad(46, 18 + i * 20, 30 + i * 6)) + xaWord(46, 18 + i * 20, 30 + i * 6, 'ok k-fade')).join('') + xaC('ok', 112, 70, 9) + xaP('wh', 'M107 70 l4 4 l7 -8');
      case 'ignore': return pg + W(46, 20, 56) + xaG('k-gone', bad(46, 38, 34)) + xaWord(46, 38, 34, 'wl') + W(46, 56, 44) + xaP('prs', 'M100 34 l16 16 m0 -16 l-16 16');
      case 'ignoreall': return pg + xaG('k-gone', bad(46, 20, 30) + bad(46, 40, 34) + bad(46, 60, 26)) + xaLn(46, 22, 30, 'wl') + xaLn(46, 42, 34, 'wl') + xaLn(46, 62, 26, 'wl') + xaP('prs', 'M100 30 l16 16 m0 -16 l-16 16 M100 52 l16 16 m0 -16 l-16 16');
      case 'add': return xaR('sheet', 40, 10, 66, 70, 6) + xaR('ac', 40, 10, 8, 70, 3) + W(56, 24, 36) + W(56, 38, 28) + xaC('ok k-grow', 100, 62, 11, xaSc(0, 0, '100px 62px')) + xaP('wh', 'M100 56 v12 M94 62 h12');
      case 'count': return pg + bad(46, 20, 30) + bad(46, 40, 34) + bad(46, 60, 26) + xaG('k-in2', xaC('no', 112, 26, 12) + xaLn(106, 24, 12, 'wl'), xaMv(0, -8));
      case 'lang': return xaPage(14, 14, 56, 70, 5) + xaPage(90, 14, 56, 70, 5, { right: true }) + xaP('acs', 'M74 40 h12 M82 34 l6 6 l-6 6 M86 56 h-12 M78 50 l-6 6 l6 6');
      default: return pg + W(46, 24, 56) + bad(46, 40, 34);
    }
  },
  /* ── toggles and modes ── */
  mode(v) {
    switch (v) {
      case 'dark': return xaR('sheet', 40, 12, 80, 72, 8) + xaG('k-fade', xaR('night', 40, 12, 80, 72, 8)) + xaLines(50, 24, 5, 60, { c: 'ln' }) + xaC('mk', 100, 28, 8) + xaC('night', 104, 25, 7);
      case 'calm': return xaR('sheet', 24, 20, 112, 56, 8) + xaG('k-gone', xaP('acs', 'M36 48 q8 -14 16 0 t16 0 t16 0 t16 0 t8 0')) + xaP('rl', 'M36 48 h88');
      case 'snap': return xaR('sheet', 24, 14, 112, 68, 8) + xaP('guide', 'M60 14 v68 M24 48 h112') + xaR('blk k-mv', 60, 48, 40, 24, 3, xaMv(14, -12)) + xaC('ac', 60, 48, 3.4);
      case 'focus': return xaR('gh', 14, 4, 132, 88, 6) + xaG('k-gone', xaR('side', 14, 4, 132, 12, 6)) + xaG('k-scale', xaPage(44, 8, 72, 84, 7), 'style="--sc:.82"');
      case 'spell': return xaPage(40, 8, 80, 72, 4) + xaG('k-gone', xaP('no', 'M52 40 q2.5 -4 5 0 t5 0 t5 0 t5 0 t5 0', 'style="fill:none;stroke:var(--bw-danger);stroke-width:2"')) + xaWord(50, 33, 30, 'ln') + xaP('okS k-fade', 'M104 30 l4 4 l8 -9');
      case 'both': return xaPage(14, 14, 56, 70, 5) + xaPage(90, 14, 56, 70, 5, { right: true }) + xaR('hi k-grow', 20, 36, 42, 6, 3, xaSc(0, 1, 'left center')) + xaR('hi k-grow', 98, 36, 42, 6, 3, xaSc(0, 1, 'right center')) + xaP('acs', 'M74 46 h12 M78 42 l-4 4 l4 4 M82 42 l4 4 l-4 4');
      case 'lock': return xaPage(40, 8, 70, 80, 6) + xaR('pr', 60, 40, 30, 24, 5) + xaG('k-mv', xaP('prs', 'M66 40 v-8 a9 9 0 0 1 18 0 v8', 'style="stroke-width:3"'), xaMv(0, -9)) + xaShd(58, 64, 34) + xaC('wh', 75, 52, 3);
      case 'host': return xaR('sheet', 20, 12, 120, 72, 8) + xaLn(30, 22, 40, 'ln hd') + xaR('track', 48, 42, 64, 28, 14) + xaG('k-mv', xaC('knob', 98, 56, 10), xaMv(-34, 0)) + xaC('ac', 34, 56, 4) + xaC('rng k-in2', 34, 56, 9);
      case 'power': return xaR('sheet', 30, 12, 100, 72, 10) + xaP('gh', 'M70 30 a20 20 0 1 0 20 0') + xaP('acs k-draw', 'M80 24 v22', 'style="stroke-width:4"') + xaG('k-blink', xaC('ac', 80, 48, 4)) + xaC('rng k-in2', 80, 38, 26);
      case 'read': return xaPage(48, 8, 64, 80, 5) + xaR('mk k-mv', 54, 38, 52, 6, 3, xaMv(0, -22)) + xaP('acs', 'M16 48 q10 -12 20 0 q-10 12 -20 0 M124 48 q10 -12 20 0 q-10 12 -20 0') + xaG('k-mv', xaC('ac', 26, 48, 3), xaMv(0, -6));
      default: return xaR('track', 48, 34, 64, 28, 14) + xaC('knob', 62, 48, 10);
    }
  },
  lang(v) {
    const ar = xaP('prs', 'M96 40 q-6 -12 -14 -2 q-8 8 -16 2 q-6 -4 -12 4 M82 50 h-30 M70 56 q-4 8 -12 2', 'style="stroke-width:3.2"');
    const en = xaP('prs', 'M56 62 l10 -30 l10 30 M60 54 h12 M92 32 v30 h10 q8 0 8 -8 q0 -8 -8 -8 h-10', 'style="stroke-width:3.2"');
    switch (v) {
      case 'dir': return xaR('sheet', 30, 16, 100, 64, 8) + xaG('rtl', xaLines(70, 28, 4, 50)) + xaP('dirarrow', 'M58 70 h44 m-8 -6 l8 6 l-8 6');
      case 'ed': return xaPage(14, 12, 56, 72, 5, { right: true }) + xaPage(90, 12, 56, 72, 5) + xaG('k-mv', xaR('hi', 20, 24, 42, 6, 3), xaMv(76, 0)) + xaP('acs', 'M74 48 h12 m-4 -4 l4 4 l-4 4');
      default: return xaR('sheet', 30, 14, 100, 68, 8) + xaG('glyph a', ar) + xaG('glyph e', en);
    }
  },
  zoom(v) {
    const grow = (inner, from) => xaG('k-scale', inner, `style="--sc:${from}"`);
    switch (v) {
      case 'out': return grow(xaPage(60, 26, 40, 50, 5), 1.6);
      case 'fit': return xaR('gh', 20, 6, 120, 84, 4) + grow(xaPage(36, 6, 88, 84, 8), 0.6) + xaP('acs', 'M26 12 h8 M26 12 v8 M134 12 h-8 M134 12 v8 M26 84 h8 M26 84 v-8 M134 84 h-8 M134 84 v-8');
      case 'pct': return grow(xaPage(44, 10, 64, 76, 6), 0.7) + xaR('sheet', 112, 6, 40, 16, 6) + xaR('mk', 118, 12, 20, 4, 2);
      case 'height': return xaR('gh', 40, 4, 80, 88, 4) + grow(xaPage(46, 6, 68, 84, 7), 0.7) + xaP('acs', 'M130 12 v72 m-4 -6 l4 6 l4 -6 m-8 -60 l4 -6 l4 6');
      case 'reset': return grow(xaPage(46, 10, 68, 76, 6), 1.3) + xaR('sheet', 112, 6, 40, 16, 6) + xaR('ac', 118, 12, 14, 4, 2);
      default: return grow(xaPage(36, 6, 88, 84, 8), 0.7);
    }
  },
  view(v) {
    switch (v) {
      case 'single': return xaG('one', xaPage(52, 8, 56, 78, 6)) + xaP('turn', 'M122 48 l8 0 m-4 -4 l4 4 l-4 4');
      case 'spread': return xaG('book', xaPage(24, 8, 56, 78, 6, { cls: 'pg l' }) + xaPage(84, 8, 56, 78, 6, { cls: 'pg r' }));
      case 'flow': return xaG('scroll', xaPage(52, 8, 56, 78, 6) + `<g transform="translate(0 84)">${xaPage(52, 8, 56, 78, 6)}</g>`);
      case 'mode': return xaPage(8, 12, 40, 70, 4) + xaPage(60, 12, 40, 70, 4) + xaPage(112, 12, 40, 70, 4, { cls: 'pg l' }) + xaR('gh k-mv', 56, 8, 48, 78, 4, xaMv(-52, 0));
      case 'prev': return xaG('one', xaPage(52, 8, 56, 78, 6)) + xaMir(xaP('turn', 'M36 48 l-8 0 m4 -4 l-4 4 l4 4'));
      case 'next': return xaG('one', xaPage(52, 8, 56, 78, 6)) + xaMir(xaP('turn', 'M124 48 l8 0 m-4 -4 l4 4 l-4 4'));
      case 'side': return xaPage(10, 12, 64, 72, 5, { right: true }) + xaG('k-in', xaPage(86, 12, 64, 72, 5), xaMv(20, 0));
      default: return xaPage(52, 8, 56, 78, 6);
    }
  },
  /* ── text formatting ── */
  fmt(v) { // a line of text with one selected word
    const sheet = xaR('sheet', 20, 22, 120, 52, 8) + xaLn(30, 32, 100) + xaLn(30, 58, 70);
    const w = (c, s = '') => xaWord(52, 42, 38, c, s);
    const before = xaLn(30, 43, 20) + xaLn(94, 43, 36);
    // before: the word is plain; action: a gold selection grows over it, then the formatting lands with a small pop (end state = formatted)
    const fxa = (body) => sheet + before + xaWord(52, 42, 38, 'ln', 'class="k-gone"') + xaR('selbox', 49, 38, 44, 14, 3) + xaG('k-in', body, xaMv(0, 3));
    switch (v) {
      case 'bold': return fxa(xaR('pr', 52, 40, 38, 10, 4));
      case 'italic': return fxa(xaR('pr', 52, 42, 38, 6, 3, 'style="transform:skewX(-18deg);transform-origin:center"'));
      case 'underline': return fxa(w('pr') + xaR('ac k-grow', 52, 51, 38, 2.4, 1, xaSc(0, 1, 'left center')));
      case 'strike': return fxa(w('pr') + xaR('no k-grow', 48, 44, 46, 2.4, 1, xaSc(0, 1, 'left center')));
      case 'code': return fxa(xaR('cell', 50, 38, 42, 12, 3) + xaP('prs', 'M58 42 l-4 4 l4 4 M84 42 l4 4 l-4 4', 'style="stroke-width:1.8"') + xaR('pr', 62, 44, 14, 4, 2));
      case 'link': return fxa(w('ac') + xaR('ac', 52, 50, 38, 1.8, 1) + xaG('k-in', xaP('acs', 'M96 40 l6 -6 m-3 -1 l4 -2 l-1 4 M96 40 l-4 4', 'style="stroke-width:2"')));
      case 'color': return fxa(w('ac') + xaC('ac', 98, 62, 4) + xaC('pr', 108, 62, 4) + xaC('ok', 118, 62, 4));
      case 'font': return fxa(xaR('pr', 52, 40, 38, 8, 2) + xaP('wh', 'M58 46 l4 -4 l4 4 M60 45 h4 M74 42 v4 h6', 'style="stroke-width:1.6"'));
      case 'size': return fxa(xaR('pr', 48, 36, 46, 14, 4) + xaP('acs', 'M102 34 v18 m-3 -5 l3 5 l3 -5 m-6 -8 l3 -5 l3 5'));
      case 'clear': return fxa(w('ln') + xaG('k-gone', xaP('acs', 'M50 41 l44 8 M52 52 l40 -10')) + xaC('ok', 112, 62, 5));
      default: return fxa(w('pr'));
    }
  },
  para(v) { // paragraph formatting: align.<s|c|e|j>, v.<t|m|b>, space.<l|b|a>, quote, bullets, numbers, shapes, indent, outdent
    const [k, a = ''] = v.split('.');
    const sheet = xaR('sheet', 24, 12, 112, 72, 8);
    switch (k) {
      case 'align': {
        const ws = [70, 84, 60, 78, 40];
        const p = xaEnd(a), jw = a[0] === 'j' ? ws.map((w, i) => (i === 4 ? 56 : 88)) : ws;
        // 0.16.2 note J: jl / jm / jh = Justify Low / Medium / High: the stretch drawn as accent bars inside the full lines (1, 2, 3 per line)
        if (a.length === 2 && a[0] === 'j') {
          const nb = { l: 1, m: 2, h: 3 }[a[1]];
          return sheet + jw.map((w, i) => xaLn(36, 22 + i * 10, w)).join('') + jw.slice(0, 4).map((w, i) => [...Array(nb)].map((_, k) => xaR('ac k-grow', 46 + k * (w / (nb + 0.4)) * 0.9, 22.6 + i * 10, 10 + nb * 3, 2.8, 1.4, xaSc(0, 1, 'left center'))).join('')).join('');
        }
        if (a[0] === 'j') return sheet + jw.map((w, i) => xaLn(36, 22 + i * 10, w, 'ln k-grow', xaSc(ws[i] / w, 1, 'left center'))).join('') + xaGlint(36, 20, 80, 50);
        // the lines start left-aligned (centred when that is the target) and glide to their place, one after the other
        const before = p === 'l' ? 'c' : 'l', xo = (q, w) => (q === 'c' ? 80 - w / 2 : q === 'r' ? 124 - w : 36);
        return sheet + jw.map((w, i) => xaLn(xo(p, w), 22 + i * 10, w, 'ln k-mv', `style="--dx:${xo(before, w) - xo(p, w)}px;--dy:0px;animation-delay:${i * 45}ms"`)).join('') + xaGlint(36, 20, 80, 50);
      }
      case 'v': {
        const y = a === 't' ? 18 : a === 'm' ? 38 : 56;
        return sheet + xaR('gh', 36, 16, 88, 64, 4) + xaG('k-mv', xaLn(46, y, 68, 'mk') + xaLn(46, y + 8, 50), xaMv(0, a === 't' ? 30 : a === 'm' ? 0 : -30));
      }
      case 'space': return sheet + (a === 'l'
        ? [0, 1, 2, 3].map((i) => xaLn(36, 20 + i * 15, 76 - (i % 2) * 14, 'ln k-mv', xaMv(0, -i * 5))).join('') + xaP('acs', 'M124 20 v45 m-4 -6 l4 6 l4 -6 m-8 -39 l4 -6 l4 6')
        : xaLines(36, 22, 2, 76) + xaG('k-grow', xaR('hi', 36, a === 'b' ? 34 : 42, 76, 8, 2), xaSc(1, 0, 'center top')) + xaLines(36, 52, 2, 76));
      case 'quote': return sheet + xaR('ac k-grow', 36, 24, 3, 38, 1.5, xaSc(1, 0, 'center top')) + xaLines(46, 28, 3, 70, { gap: 12 }) + xaG('k-in', xaP('prs', 'M96 22 q-6 0 -6 6 h6 v6 h-6', 'style="stroke-width:2.4"'), xaMv(0, -6)) + xaGlint(40, 24, 60, 38);
      case 'bullets': return sheet + [0, 1, 2].map((i) => xaG(['k-in', 'k-in2', 'k-in'][i], xaC('ac', 40, 28 + i * 16, 3.4), xaMv(-8, 0)) + xaLn(50, 26 + i * 16, 70 - i * 10, 'ln k-mv', `style="--dx:-10px;--dy:0px;animation-delay:${i * 60}ms"`)).join('');
      case 'numbers': return sheet + [0, 1, 2].map((i) => xaG(['k-in', 'k-in2', 'k-in'][i], xaC('pr', 40, 28 + i * 16, 5) + xaR('wh', 38.4, 25 + i * 16, 3.2, 6, 1), xaMv(-8, 0)) + xaLn(52, 26 + i * 16, 68 - i * 10, 'ln k-mv', `style="--dx:-10px;--dy:0px;animation-delay:${i * 60}ms"`)).join('');
      case 'shapes': return sheet + xaC('ac', 40, 28, 4) + xaR('pr', 36, 40, 8, 8, 1) + `<path class="ok" d="M40 56 l5 9 h-10 Z"/>` + [0, 1, 2].map((i) => xaLn(52, 26 + i * 16, 68 - i * 10)).join('');
      case 'indent': return sheet + xaMir(xaLn(36, 22, 70) + xaLn(50, 34, 60, 'ln k-mv', xaMv(-14, 0)) + xaLn(36, 46, 66) + xaP('acs', 'M118 30 h-12 m4 -4 l-4 4 l4 4'));
      case 'outdent': return sheet + xaMir(xaLn(36, 22, 70) + xaLn(36, 34, 60, 'ln k-mv', xaMv(14, 0)) + xaLn(36, 46, 66) + xaP('acs', 'M104 30 h12 m-4 -4 l4 4 l-4 4'));
      default: return sheet + [70, 80, 50].map((w, i) => xaLn(36, 22 + i * 10, w)).join('');
    }
  },
  /* ── header and footer ── */
  hf(v) { // hdr|ftr . text|field|logo|conf|start|center|end|delete|scope
    const [zone, op] = v.split('.');
    const y = zone === 'hdr' ? 12 : 74;
    const page = xaR('sheet', 40, 6, 80, 84, 5) + xaLines(48, 28, 5, 64) + xaR('side', 40, zone === 'hdr' ? 6 : 82, 80, 8, 3) + xaR('gh', 46, y - 2, 68, 12, 3);
    const item = (c, x, w) => xaR(c, x, y, w, 7, 3);
    const x0 = () => (XPL_RTL ? 30 : -30); // 'centre' arrives from the line's start side
    switch (op) {
      case 'text': return page + xaG('k-in', item('mk', 52, 40));
      case 'field': return page + xaG('k-in', item('ac', 52, 22) + xaR('wh', 58, y + 2, 10, 3, 1) + xaC('wh', 72, y + 3.5, 1.5));
      case 'logo': return page + xaG('k-in', xaR('ac', 98, y - 1, 14, 9, 2) + xaC('wh', 105, y + 3.5, 2.6));
      case 'conf': return page + xaG('k-in', xaR('sheet', 62, y - 1, 36, 9, 4) + xaP('prs', `M70 ${y + 6} v-3 a3 3 0 0 1 6 0 v3`, 'style="stroke-width:1.4"') + xaLn(80, y + 2, 14, 'mk'), xaMv(0, zone === 'hdr' ? -8 : 8)) + xaGlint(62, y - 1, 34, 9);
      case 'start': { const x = xaEnd('s') === 'l' ? 48 : 84; return page + xaG('k-mv', item('mk', x, 30), xaMv(65 - x, 0)); }
      case 'center': return page + xaG('k-mv', item('mk', 65, 30), xaMv(x0(), 0));
      case 'end': { const x = xaEnd('e') === 'l' ? 48 : 84; return page + xaG('k-mv', item('mk', x, 30), xaMv(65 - x, 0)); }
      case 'delete': return page + xaR('gh', 62, y, 36, 7, 3) + xaG('k-gone', item('mk', 62, 36));
      default: return page + item('mk', 52, 36) + xaR('sheet', 124, 14, 22, 22, 3) + xaR('ok k-in', 128, 18, 14, 14, 2) + xaR('sheet', 124, 40, 22, 22, 3) + xaR('ac', 128, 44, 14, 14, 2) + xaR('sheet', 124, 66, 22, 22, 3) + xaR('pr k-in2', 128, 70, 14, 14, 2);
    }
  },
  /* ── page layout ── */
  layout(v) {
    switch (v) {
      case 'setup': return xaR('gh', 54, 8, 52, 76, 5) + xaG('k-scale', xaR('sheet', 30, 24, 100, 48, 5) + xaLines(38, 34, 3, 84), 'style="--sc:.6"') + xaP('acs', 'M118 78 h14 m-5 -5 l5 5 l-5 5');
      case 'break': return xaPage(14, 8, 56, 78, 4) + xaPage(90, 8, 56, 78, 3) + xaR('side k-mv', 98, 20, 40, 8, 2, xaMv(-76, 44)) + xaP('cut k-draw', 'M80 4 v88') + xaShd(100, 28, 36);
      case 'breakdel': return xaPage(14, 8, 56, 78, 7) + xaPage(90, 8, 56, 78, 0) + xaR('gh', 98, 20, 40, 8, 2) + xaR('side k-mv', 22, 58, 40, 8, 2, xaMv(76, -38)) + xaG('k-gone', xaP('cut', 'M80 4 v88'));
      case 'pull': return xaPage(14, 8, 56, 78, 5) + xaR('gh', 90, 8, 56, 78, 5) + xaR('blk k-mv', 22, 58, 40, 12, 3, xaMv(76, -40)) + xaG('k-gone', xaP('cut', 'M80 4 v88'));
      case 'secdel': return xaPage(40, 8, 70, 80, 0) + xaLn(48, 16, 54, 'side') + xaLines(48, 26, 3, 54) + xaR('gh', 46, 44, 58, 36, 3) + xaG('k-gone', xaLn(48, 48, 54, 'no') + xaLines(48, 58, 3, 54));
      case 'empty': return xaPage(40, 8, 70, 80, 3) + xaR('gh', 48, 40, 54, 8, 2) + xaG('k-gone', xaR('cell', 48, 40, 54, 8, 2) + xaR('cell', 48, 52, 54, 8, 2)) + xaLines(48, 66, 1, 54) + xaC('ok', 118, 20, 6) + xaP('wh', 'M115 20 l2.4 2.4 l4 -5');
      case 'margins': return xaR('sheet', 40, 8, 80, 80, 5) + xaR('gh', 52, 20, 56, 56, 2) + xaG('k-scale', xaLines(58, 28, 5, 44), 'style="--sc:1.28"') + xaP('acs k-fade', 'M40 48 h12 m-4 -4 l4 4 l-4 4') + xaGlint(54, 22, 48, 52);
      case 'ruler': return xaPage(40, 20, 80, 70, 5) + xaR('rl2', 40, 10, 80, 7, 1) + xaR('ac k-mv', 62, 8.5, 6, 9, 2, xaMv(-20, 0)) + xaP('guide k-mv', 'M65 17 v70', xaMv(-20, 0)) + Array.from({ length: 17 }, (_, i) => xaR('ln', 41 + i * 4.7, 11, 0.8, i % 4 === 0 ? 5 : 3, 0)).join('');
      case 'renum': return xaPage(40, 8, 70, 80, 0) + [0, 1, 2, 3].map((i) => xaC('pr', 52, 22 + i * 16, 5) + xaR('wh', 50.4, 19 + i * 16, 3.2, 6, 1) + xaLn(62, 20 + i * 16, 40)).join('') + xaP('acs k-fade', 'M114 22 q8 20 0 44 m-3 -5 l3 5 l4 -4');
      case 'start': return xaPage(40, 8, 70, 80, 0) + [0, 1, 2].map((i) => xaC('ac', 52, 26 + i * 16, 6) + xaLn(64, 24 + i * 16, 36)).join('') + xaR('mk k-grow', 46, 14, 14, 6, 3, xaSc(0, 1, 'left center'));
      case 'docid': return xaPage(40, 8, 70, 80, 4) + xaR('sheet', 44, 12, 62, 18, 3) + xaR('mk k-in', 48, 16, 14, 6, 3) + xaR('mk k-in2', 92, 16, 14, 6, 3) + xaR('mk k-in', 48, 70, 14, 6, 3) + xaR('mk k-blink', 74, 56, 16, 6, 3);
      default: return xaPage(40, 8, 70, 80, 6);
    }
  },
  wrap(v) { // text wrapping around a picture: the picture drops in, the lines shorten to make room (before: full-width lines)
    const sheet = xaR('sheet', 40, 6, 80, 84, 5);
    const rows = (lines) => lines.map(([x, y, w]) => (w < 64 ? xaLn(x, y, w, 'ln k-grow', xaSc(64 / w, 1, 'left center')) : xaLn(x, y, w))).join('');
    const pic = (x, y, w, h, extra = '') => xaG('k-in', extra || xaPicture(x, y, w, h), xaMv(0, -12)) + xaShd(x + 3, y + h - 1, w - 6) + xaGlint(x + 2, y, w - 8, h);
    switch (v) {
      case 'square': return sheet + pic(80, 28, 28, 26) + rows([[48, 16, 64], [48, 26, 28], [48, 36, 28], [48, 46, 28], [48, 58, 64], [48, 68, 64]]);
      case 'tight': return sheet + pic(86, 26, 24, 32, xaP('sf', 'M96 26 l12 14 l-6 18 l-14 0 l-6 -16 Z')) + rows([[48, 16, 64], [48, 28, 40], [48, 38, 34], [48, 48, 38], [48, 58, 64], [48, 68, 64]]);
      case 'through': return sheet + pic(80, 26, 28, 30, xaP('sf', 'M92 26 l14 14 l-4 16 l-16 0 l-4 -14 Z')) + rows([[48, 16, 64], [48, 28, 42], [48, 38, 40], [48, 48, 40], [48, 58, 64], [48, 68, 64]]);
      case 'topbottom': return sheet + rows([[48, 16, 64], [48, 26, 64]]) + pic(54, 36, 52, 24) + rows([[48, 66, 64], [48, 76, 40]]);
      case 'behind': return sheet + xaG('k-in', xaPicture(62, 24, 40, 40), xaMv(0, -10)) + rows([[48, 18, 64], [48, 30, 64], [48, 42, 64], [48, 54, 64]]) + xaGlint(64, 24, 34, 40);
      case 'front': return sheet + rows([[48, 18, 64], [48, 30, 64], [48, 42, 64], [48, 54, 64]]) + pic(62, 24, 40, 40);
      default: return sheet + rows([[48, 16, 64], [48, 26, 64]]) + xaG('k-mv', xaPicture(48, 34, 20, 12), xaMv(0, -10)) + rows([[48, 52, 64], [48, 62, 64]]) + xaShd(50, 45, 16);
    }
  },
  /* ── design ── */
  design(v) {
    const page = xaPage(60, 8, 56, 78, 6);
    switch (v) {
      case 'slider': return xaR('sheet', 18, 22, 124, 50, 8) + xaR('track', 28, 44, 70, 6, 3) + xaC('knob slide', 36, 47, 7) + xaR('cell', 106, 36, 28, 22, 4) + xaR('mk', 111, 44, 18, 6, 2);
      case 'number': return xaR('sheet', 36, 32, 88, 32, 8) + xaR('cell', 44, 38, 40, 20, 4) + xaR('mk k-grow', 50, 45, 26, 6, 2, xaSc(0, 1, 'left center')) + xaR('caret', 80, 42, 2, 12, 1) + xaR('pr', 92, 38, 24, 20, 4);
      case 'unit': return xaR('sheet', 26, 30, 108, 36, 8) + xaR('cell', 34, 38, 36, 20, 4) + xaR('mk', 40, 45, 24, 6, 2) + xaR('pr', 78, 38, 48, 20, 4) + xaP('wh', 'M110 46 l5 5 l5 -5', 'style="stroke-width:2"') + xaG('k-in', xaR('sheet', 78, 60, 48, 24, 4) + xaLn(84, 66, 36) + xaR('hi', 82, 74, 40, 7, 2), xaMv(0, -8));
      case 'swatch': return xaR('sheet', 24, 18, 112, 60, 8) + [['pr', 38], ['ac', 58], ['mk', 78], ['ok', 98], ['sg', 118]].map(([c, x], i) => xaC(c, x, 36, 8) + (i === 1 ? xaC('rng k-in2', x, 36, 11) : '')).join('') + xaR('chip', 34, 54, 92, 12, 4);
      case 'hex': return xaR('sheet', 26, 24, 108, 48, 8) + xaR('cell', 34, 32, 62, 14, 4) + xaP('prs', 'M42 36 v6 M48 36 v6 M40 38 h10 M40 41 h10', 'style="stroke-width:1.4"') + xaLn(54, 37, 32, 'mk k-grow', xaSc(0, 1, 'left center')) + xaR('chip', 104, 32, 22, 22, 6) + xaR('caret', 90, 34, 2, 10, 1);
      case 'part': return page + xaR('blk', 66, 14, 44, 16, 3) + xaR('gh', 66, 34, 44, 12, 3) + xaG('k-gone', xaR('side', 66, 34, 44, 12, 3)) + xaC('ac', 128, 24, 6) + xaP('wh', 'M125 24 l2.5 2.5 l4 -5');
      case 'move': return page + xaR('side k-mv', 66, 38, 44, 14, 3, xaMv(0, -24)) + xaR('blk', 66, 20, 44, 14, 3) + xaP('acs', 'M128 22 v34 m-4 -6 l4 6 l4 -6');
      case 'label': return xaR('sheet', 26, 18, 108, 58, 8) + xaR('bx', 44, 34, 72, 26, 5) + xaR('caret', 60, 41, 2, 12, 1) + xaLn(64, 43, 36, 'mk k-grow', xaSc(0, 1, 'left center'));
      case 'labelall': return xaPage(10, 14, 40, 66, 4) + xaPage(60, 14, 40, 66, 4) + xaPage(110, 14, 40, 66, 4) + [16, 66, 116].map((x, i) => xaR(i ? 'mk k-in2' : 'mk k-in', x, 22, 28, 6, 3)).join('');
      case 'css': return xaR('sheet', 12, 16, 50, 62, 6) + xaP('prs', 'M26 36 l-6 6 l6 6 M48 36 l6 6 l-6 6 M40 32 l-6 20', 'style="stroke-width:2"') + xaP('acs', 'M68 47 h12 m-4 -4 l4 4 l-4 4') + xaPage(90, 10, 56, 76, 5, { c: 'ln hue' });
      case 'styclear': return page + xaR('blk', 66, 34, 44, 14, 3) + xaG('k-gone', xaR('ac', 62, 30, 52, 22, 5, 'style="fill-opacity:.4"')) + xaP('acs', 'M108 30 l8 -8');
      case 'embed': return xaPage(24, 10, 56, 76, 5) + xaR('sheet', 98, 26, 40, 44, 4) + xaP('acs k-draw', 'M86 48 h8 m-3 -3 l3 3 l-3 3') + xaC('ac k-mv', 118, 46, 6, xaMv(-60, 0)) + xaP('prs', 'M110 60 h16', 'style="stroke-width:1.6"');
      default: return page + xaR('blk', 66, 20, 44, 16, 3);
    }
  },
  font(v) {
    const sheet = xaR('sheet', 22, 14, 116, 68, 8);
    switch (v) {
      case 'local': return sheet + xaR('cell', 32, 26, 40, 46, 4) + xaP('prs', 'M40 52 l8 -14 l8 14 M43 47 h10', 'style="stroke-width:2.2"') + xaG('k-in', [0, 1, 2].map((i) => xaR(i === 1 ? 'hi' : 'cell', 80, 24 + i * 16, 46, 12, 3)).join(''));
      case 'upload': return sheet + xaR('cell', 56, 28, 48, 38, 4) + xaP('prs', 'M66 54 l8 -14 l8 14 M69 49 h10', 'style="stroke-width:2.2"') + xaG('k-mv', xaP('acs', 'M80 14 v14 m-5 -5 l5 5 l5 -5'), xaMv(0, -16)) + xaR('tray', 44, 72, 72, 5, 2);
      case 'remove': return sheet + xaR('gh', 56, 28, 48, 38, 4) + xaG('k-gone', xaR('cell', 56, 28, 48, 38, 4) + xaP('prs', 'M66 54 l8 -14 l8 14 M69 49 h10'));
      default: return sheet + xaR('cell', 30, 24, 100, 14, 4) + [0, 1, 2].map((i) => xaR('cell', 30, 44 + i * 12, 100, 10, 3)).join('') + xaR('hi k-mv', 30, 56, 100, 10, 3, xaMv(0, -12)) + xaLn(36, 27, 40, 'pr');
    }
  },
  /* ── project, sharing ── */
  proj(v) {
    switch (v) {
      case 'bulk': return [0, 1, 2].map((i) => xaPage(10 + i * 50, 22, 40, 54, 3)).join('') + [0, 1, 2].map((i) => xaR(i ? 'hi k-in2' : 'hi k-in', 16 + i * 50, 32, 28, 6, 3)).join('') + xaP('prs', 'M70 12 l10 -4 l8 8 l-10 4 Z', 'style="stroke-width:1.8"');
      case 'sign': return xaPage(40, 8, 70, 80, 5) + xaP('acs k-draw', 'M54 68 q6 -14 10 -2 t10 -4 t10 2', 'style="stroke-width:2.6"') + xaC('ok', 112, 22, 9) + xaP('wh', 'M107 22 l3.6 3.6 l6 -7');
      case 'share': return xaPage(18, 10, 56, 76, 5) + xaP('acs k-draw', 'M80 48 h26 m-6 -6 l6 6 l-6 6') + xaR('sheet', 112, 28, 34, 40, 5) + xaC('pr', 129, 44, 6) + xaP('prs', 'M120 60 q9 -10 18 0');
      case 'webhook': return xaPage(16, 10, 56, 76, 5) + xaP('acs k-draw', 'M78 48 h20 m-5 -5 l5 5 l-5 5') + xaR('sheet', 104, 26, 40, 44, 6) + xaP('prs', 'M116 52 q4 -16 8 0 M112 56 h24 M124 40 v-4', 'style="stroke-width:2"') + xaC('ac k-blink', 134, 34, 4);
      case 'export': return [0, 1, 2].map((i) => xaR('sheet', 12 + i * 8, 14 + i * 6, 40, 52, 4) + xaLines(18 + i * 8, 24 + i * 6, 2, 28)).join('') + xaP('acs k-draw', 'M72 48 h22 m-6 -6 l6 6 l-6 6') + xaR('pr', 102, 30, 46, 36, 5) + xaR('pr', 102, 26, 20, 8, 3) + xaR('wh', 118, 40, 14, 3, 1) + xaR('wh', 118, 47, 14, 3, 1);
      case 'import': return xaR('pr', 12, 30, 46, 36, 5) + xaR('pr', 12, 26, 20, 8, 3) + xaP('acs k-draw', 'M66 48 h22 m-6 -6 l6 6 l-6 6') + [0, 1, 2].map((i) => xaG(i ? 'k-in2' : 'k-in', xaR('sheet', 96 + i * 8, 14 + i * 6, 40, 52, 4) + xaLines(102 + i * 8, 24 + i * 6, 2, 28))).join('');
      default: return xaPage(40, 8, 70, 80, 5);
    }
  },
  /* ── diagram ── */
  dg(v) {
    const [k, a = ''] = v.split('.');
    const cv = xaMini({ nodes: false });
    const A = (cx, cy, c) => xaNode('', cx, cy, c);
    switch (k) {
      case 'node': return cv + xaNode('', 40, 62, 'bx dim') + xaP('wr dim', 'M57 62 h16') + xaG('k-in', xaNode(a, 100, a === 'group' ? 48 : 62));
      case 'auto': return cv + [[40, 28, -8, 12], [100, 34, 6, -10], [70, 66, -4, 8]].map(([x, y, dx, dy]) => xaG('k-mv', A(x, y), xaMv(dx, dy))).join('') + xaP('wr', 'M57 31 l26 2 M97 46 l-20 14');
      case 'reset': return cv + [[40, 28, 14, 10], [100, 34, -12, 14], [70, 66, 6, -14]].map(([x, y, dx, dy]) => xaG('k-mv', A(x, y), xaMv(dx, dy))).join('') + xaP('acs', 'M120 76 a8 8 0 1 0 -2 -8 m-1 -6 l1 6 l6 -1');
      case 'cvshapes': return cv + xaR('hi', 28, 18, 104, 60, 3, 'style="fill:none;stroke-dasharray:4 3"') + xaG('k-in', xaR('sheet', 34, 24, 92, 48, 4)) + A(52, 48) + A(108, 48) + xaP('wr', 'M69 48 h22');
      case 'cvpage': return xaPage(40, 8, 80, 80, 6) + xaR('hi', 46, 34, 68, 42, 3, 'style="fill:none;stroke-dasharray:4 3"') + xaG('k-in', xaR('bx', 52, 40, 56, 30, 4)) + xaP('acs', 'M80 30 v-8 m-4 4 l4 -4 l4 4 M80 80 v8 m-4 -4 l4 4 l4 -4');
      case 'cvauto': return cv + xaR('hi', 24, 16, 112, 64, 3, 'style="fill:none;stroke-dasharray:4 3"') + A(52, 48) + A(108, 48) + xaP('acs', 'M120 76 a8 8 0 1 0 -2 -8 m-1 -6 l1 6 l6 -1');
      case 'cvroute': return cv + A(34, 30) + A(118, 66) + xaP('wr', 'M51 30 h30 v36 h20') + xaP('wr', 'M51 66 h22') + xaG('k-in', xaP('wr', 'M60 56 v-34 h22 M60 56 h-9')) + xaP('acs', 'M81 36 a4 4 0 0 1 8 0');
      case 'flow': return cv + A(40, 28) + xaG('k-mv', A(86, 28), xaMv(-24, 28)) + xaG('k-mv', A(40, 66), xaMv(44, -38)) + xaP('wr', 'M57 28 h12') + xaP('acs', 'M126 34 v30 m-4 -6 l4 6 l4 -6');
      case 'legend': return cv + A(44, 30) + A(112, 30) + xaP('wr', 'M61 30 h34') + xaG('k-in', xaR('sheet', 34, 58, 92, 22, 4) + [0, 1, 2].map((i) => xaR(['pr', 'ac', 'ok'][i], 42 + i * 28, 66, 8, 6, 2) + xaLn(52 + i * 28, 67, 12)).join(''));
      case 'proute': return cv + A(34, 60) + A(118, 36) + xaG('k-gone', xaP('wr', 'M51 60 h34 v-24 h16')) + xaG('k-in', xaP('wr', 'M51 58 q30 -40 50 -22'));
      case 'phead': return cv + A(34, 40) + A(118, 40) + xaP('wr', 'M51 40 h46') + xaG('k-in', xaP('wr', 'M92 33 l12 7 l-12 7 z'));
      case 'ptail': return cv + A(34, 40) + A(118, 40) + xaP('wr', 'M51 40 h50') + xaG('k-in', xaC('ac', 54, 40, 5));
      case 'pline': return cv + A(34, 40) + A(118, 40) + xaG('k-gone', xaP('wr', 'M51 40 h50')) + xaG('k-in', xaP('wr', 'M51 40 h50', 'style="stroke-dasharray:3 4"'));
      case 'pweight': return cv + A(34, 40) + A(118, 40) + xaG('k-gone', xaP('wr', 'M51 40 h50')) + xaG('k-in', xaP('wr', 'M51 40 h50', 'style="stroke-width:5"'));
      case 'lgtext': return cv + xaG('k-in', xaR('sheet', 34, 58, 92, 22, 4) + xaR('pr', 42, 66, 8, 6, 2) + xaLn(54, 67, 36) + xaR('caret', 92, 64, 2, 10, 1));
      case 'lglook': return cv + xaR('sheet', 34, 58, 92, 22, 4) + xaLn(54, 67, 36) + xaG('k-gone', xaR('pr', 42, 66, 8, 6, 2)) + xaG('k-in', xaR('ok', 42, 66, 8, 6, 2));
      case 'lgdel': return cv + xaR('sheet', 34, 58, 92, 22, 4) + xaR('pr', 42, 66, 8, 6, 2) + xaLn(52, 67, 12) + xaG('k-gone', xaR('ac', 76, 66, 8, 6, 2) + xaLn(86, 67, 12));
      case 'lgreset': return cv + xaR('sheet', 34, 58, 92, 22, 4) + xaR('pr', 42, 66, 8, 6, 2) + xaLn(52, 67, 12) + xaG('k-in', xaR('ac', 76, 66, 8, 6, 2) + xaLn(86, 67, 12));
      case 'join': return cv + A(34, 28) + A(34, 66) + A(122, 47) + xaP('wr', 'M51 28 h22 q6 0 6 6 v13 M51 66 h22 q6 0 6 -6 v-13 M79 47 h26') + xaG('k-in', xaC('ac', 79, 47, 5));
      case 'fs': return cv + A(34, 40) + xaG('k-in', xaR('bx', 80, 24, 52, 32, 5) + xaLn(88, 36, 36, 'mk')) + xaP('wr', 'M51 40 h26') + xaP('acs', 'M96 70 h24 m-5 -4 l5 4 l-5 4');
      case 'mmdout': return xaMini() + xaG('k-in', xaR('sheet', 64, 56, 70, 26, 4) + xaLines(70, 62, 3, 56, { gap: 6, c: 'ln' }));
      case 'label': return cv + xaR('bx', 24, 30, 48, 22, 5) + xaR('caret', 52, 36, 2, 10, 1) + xaLn(30, 37, 20, 'mk k-grow', xaSc(0, 1, 'left center')) + A(112, 40);
      case 'sub': return cv + xaR('bx', 24, 24, 48, 30, 5) + xaLn(30, 30, 36) + xaLn(30, 42, 24, 'mk k-grow', xaSc(0, 1, 'left center')) + xaR('caret', 56, 40, 2, 7, 1);
      case 'connect': return cv + A(40, 40) + A(112, 40) + xaP('wr k-draw', 'M57 40 h38') + xaP('tipm k-in2', 'M92 35 l6 5 l-6 5');
      case 'dup': return cv + A(70, 34) + xaG('k-in', A(86, 52, 'bx ghost'), xaMv(-10, -8));
      case 'del': return cv + A(44, 40) + xaR('gh', 94, 30, 36, 20, 4) + xaG('k-gone', A(112, 40) + xaP('wr', 'M61 40 h34'));
      case 'front': return cv + A(60, 36, 'bx dim') + xaG('k-mv', A(76, 46, 'sf'), xaMv(-14, 12)) + xaR('ac k-fade', 62, 40, 6, 6, 3) + xaShd(64, 58, 28);
      case 'back': return cv + A(76, 46, 'bx') + xaG('k-mv', A(60, 36, 'sf dim'), xaMv(16, 12)) + xaShd(46, 50, 28);
      case 'align': {
        const g = { l: 'M34 12 v72', c: 'M80 12 v72', r: 'M126 12 v72', t: 'M20 28 h120', m: 'M20 48 h120', b: 'M20 68 h120' }[a];
        const bxs = 'lcr'.includes(a) ? [[28, 18], [40, 40], [20, 62]].map(([w, y], i) => {
          const x = a === 'l' ? 34 : a === 'c' ? 80 - w / 2 : 126 - w;
          return xaG('k-mv', xaR('blk', x, y, w, 14, 3), xaMv((i - 1) * 16, 0));
        }).join('') : [[22, 24], [64, 36], [108, 20]].map(([x, hh], i) => {
          const y = a === 't' ? 28 : a === 'm' ? 48 - hh / 2 : 68 - hh;
          return xaG('k-mv', xaR('blk', x, y, 26, hh, 3), xaMv(0, (i - 1) * 12));
        }).join('');
        return xaR('sheet', 14, 8, 132, 80, 6) + xaP('guide', g) + bxs;
      }
      case 'dist': return xaR('sheet', 14, 8, 132, 80, 6) + (a === 'h'
        ? [24, 65, 106].map((x, i) => xaG('k-mv', xaR('blk', x, 34, 30, 20, 3), xaMv(i === 1 ? -25 : 0, 0))).join('') + xaP('acs', 'M56 66 h8 M97 66 h8', 'style="stroke-width:2"')
        : [14, 39, 64].map((y, i) => xaG('k-mv', xaR('blk', 52, y, 56, 18, 3), xaMv(0, i === 1 ? -19 : 0))).join('') + xaP('acs', 'M126 34 v4 M126 59 v4', 'style="stroke-width:2"'));
      case 'wrap': return cv + A(44, 46) + A(112, 46) + xaP('wr', 'M61 46 h34') + xaG('k-in', xaR('gh', 20, 24, 120, 46, 8) + xaR('side', 20, 24, 120, 8, 4));
      case 'edgelabel': return cv + A(34, 56) + A(118, 56) + xaP('wr', 'M51 56 h50') + xaG('k-in', xaR('hi', 60, 44, 32, 11, 4) + xaR('caret', 78, 46, 2, 7, 1));
      case 'bendadd': return cv + A(34, 60) + A(118, 36) + xaP('wr', 'M51 58 h28 v-22 h22') + xaG('k-in', xaC('ac', 79, 47, 5));
      case 'benddel': return cv + A(34, 60) + A(118, 36) + xaP('wr', 'M51 58 L101 38') + xaG('k-gone', xaP('wr', 'M51 58 h28 v-22 h22') + xaC('ac', 79, 47, 5));
      case 'route': return cv + A(34, 60) + A(118, 36) + xaG('k-gone', xaP('wr', 'M51 58 q30 -40 50 -22', 'style="stroke-dasharray:3 3"')) + xaP('wr', 'M51 60 h34 v-24 h16');
      case 'reverse': return cv + A(34, 40) + A(118, 40) + xaP('wr', 'M51 40 h50') + xaG('k-gone', xaP('tipm', 'M96 35 l6 5 l-6 5')) + xaG('k-in', xaP('tipm', 'M56 35 l-6 5 l6 5'));
      case 'from': return cv + A(34, 30, 'bx dim') + A(34, 64) + A(118, 40) + xaP('wr', 'M51 64 q40 -4 50 -22') + xaG('k-mv', xaC('ac', 51, 64, 4), xaMv(0, -34));
      case 'to': return cv + A(34, 40) + A(118, 20, 'bx dim') + A(118, 64) + xaP('wr', 'M51 42 q40 4 50 20') + xaG('k-mv', xaC('ac', 101, 62, 4), xaMv(0, -42));
      case 'zoom': return xaR('sheet', 14, 8, 132, 80, 6) + xaG('k-scale', A(44, 40) + A(112, 40) + xaP('wr', 'M61 40 h34') + xaP('wr', 'M44 52 v16'), `style="--sc:${a === 'in' ? 0.6 : a === 'out' ? 1.6 : a === 'fit' ? 1.5 : 0.8};--se:${a === 'in' ? 1.25 : a === 'out' ? 0.7 : a === 'fit' ? 0.9 : 1}"`) + (a === 'fit' ? xaP('acs', 'M18 12 h8 M18 12 v8 M142 12 h-8 M142 12 v8 M18 84 h8 M18 84 v-8 M142 84 h-8 M142 84 v-8') : '');
      case 'wire': return xaR('sheet', 14, 8, 132, 80, 6) + xaP('wr k-draw', 'M24 26 h100 m-6 -5 l6 5 l-6 5') + xaP('wr', 'M24 48 h100 m-6 -5 l6 5 l-6 5', 'style="stroke-dasharray:5 4"') + xaP('wr okS k-draw', 'M24 70 h100 m-6 -5 l6 5 l-6 5') + xaR('hi k-blink', 16, 40, 128, 16, 4, 'style="fill-opacity:.35"');
      case 'kind': return cv + xaG('k-gone', A(112, 40)) + xaG('k-in', xaNode('decision', 112, 40)) + A(44, 40) + xaP('wr', 'M61 40 h34');
      case 'color': return cv + A(44, 40) + xaP('wr', 'M61 40 h30') + xaG('k-gone', xaR('pr', 94, 28, 36, 24, 5)) + xaG('k-in', xaR('ac', 94, 28, 36, 24, 5, 'style="fill-opacity:.85"'), xaMv(0, 6)) + [['pr', 40], ['ac', 56], ['ok', 72], ['mk', 88]].map(([c, x]) => xaC(c, x + 6, 72, 5)).join('') + xaC('rng k-in2', 62, 72, 8) + xaGlint(96, 28, 30, 24);
      case 'badge': return cv + A(44, 40) + A(112, 40) + xaP('wr', 'M61 40 h34') + xaG('k-in', xaC('ac', 128, 28, 7) + xaP('wh', 'M124 28 l3 3 l5 -6'));
      case 'icon': return cv + A(44, 36) + xaG('k-in', xaC('pr', 44, 36, 6) + xaP('wh', 'M41 36 l2 2 l4 -5')) + [0, 1, 2, 3].map((i) => xaR(i === 1 ? 'hi' : 'cell', 80 + (i % 2) * 24, 20 + Math.floor(i / 2) * 24, 20, 20, 4)).join('');
      case 'symbol': return cv + A(44, 40) + xaG('k-in', xaR('sheet', 84, 20, 50, 50, 6) + [0, 1, 2, 3].map((i) => xaC(['pr', 'ac', 'ok', 'mk'][i], 96 + (i % 2) * 24, 34 + Math.floor(i / 2) * 20, 6)).join(''));
      default: return cv + A(44, 40) + A(112, 40);
    }
  },
  /* ── ribbon tabs ── */
  tab(v) { // the tool strip of a ribbon tab: the tab pill in the top bar is raised, the group opens under it, a page waits below
    const names = ['file', 'home', 'insert', 'layout', 'design', 'review', 'view', 'table', 'picture', 'diagram', 'export', 'font', 'para', 'hf', 'tools', 'diagram2'];
    const i = Math.max(0, names.indexOf(v)) % 5;
    XPL_FR = { tab: i, lit: i + 1 };
    return xaPage(46, 6, 68, 84, 5) + xaG('k-in', xaR('sheet', 86, 18, 58, 40, 6) + [0, 1, 2].map((q) => xaR(q === 1 ? 'hi' : 'cell', 92, 24 + q * 11, 46, 8, 3)).join(''), xaMv(-12, -6)) + xaR('gh', 40, 2, 80, 90, 6);
  },
  generic() { return xaPage(52, 8, 56, 78, 6) + xaR('gh', 58, 36, 44, 12, 3) + xaG('k-in', xaR('hi', 58, 36, 44, 12, 3), xaMv(0, -10)) + xaShd(60, 48, 40) + xaG('k-mv', xaP('acs', 'M96 64 l-8 -14 l16 4 l-5 5 Z'), xaMv(14, 14)); },
};

/** id → scene:variant (and an optional fallback icon after @). One line per family; ids separated by spaces. */
const XPL_MAP = `
save:plain save@save
save:copy saveHtml@saveHtml export.html@saveHtml
save:json exportEdits@exportEdits export.edits@exportEdits
save:stack exportAll@exportAll export.editsAll@exportAll
save:pack export.pack@theme k_texp@theme
save:log k_log@history
save:snap k_snap@history
out:pdf.ar export.pdf.ar@exportPdf
out:pdf.en export.pdf.en@exportPdf
out:pdf.both export.pdf.both@exportPdf exportPdf@exportPdf
out:docx.ar export.docx.ar@exportPdf
out:docx.en export.docx.en@exportPdf
out:docx.both export.docx.both@exportPdf
out:print print@print
out:html export.printHtml@print
out:html.ar export.printHtml.ar@print
out:html.en export.printHtml.en@print
out:html.both export.printHtml.both@print
out:menu export.menu@export.menu
out:mmd export.mermaid@dgMermaidOut
out:svg export.svg@export.svg
out:png export.png@export.png
in:file import@import
in:mmd dgMermaidIn@dgMermaidIn
in:pack k_timp@theme
swap:replace replace@replace
swap:caption caption@caption
swap:every every@every
swap:delete ovDelete@delete
pop:image image@image
pop:logo logo@logo k_logoAdd@logo
pop:diagram addDiagram@addDiagram
pop:para addPara@addPara
pop:text insTextBox@addPara
pop:table insTable@rowAdd k_addTable@rowAdd
pop:section insSection@addPara k_addSection@addPara
pop:chapter insChapter@addPara
pop:story addStory@addPara
pop:outstory addOutputStory@addPara
pop:outchapter addOutputsChapter@addPara
pop:point storyPoint@add
pop:card storyCard@add
pop:toc tocAdd@pages
pop:tochide tocHide@hideBlock
pop:newdoc newdoc@newdoc
pop:start startPage@newdoc home@homeBtn
pop:process process@process
edit:dup duplicate@duplicate
edit:del delete@delete
edit:up moveUp@moveUp
edit:down moveDown@moveDown
edit:comment comment@comment
edit:copy copyBlock@duplicate
edit:paste pasteBlock@duplicate
edit:hide hideBlock@hideBlock k_sthide@hideBlock
edit:style styleThis@styleThis
edit:keep keepNext@keepNext
edit:break breakBefore@breakBefore
undo:undo undo@undo
undo:redo redo@redo
tbl:add.row rowAdd@rowAdd fmRowAdd@rowAdd
tbl:del.row rowDel@rowDel fmRowDel@rowDel
tbl:up.row rowUp@rowUp
tbl:down.row rowDown@rowDown
tbl:add.col colAdd@colAdd fmColAdd@colAdd
tbl:del.col colDel@colDel fmColDel@colDel
cells:merge cellMerge@duplicate
cells:split cellSplit@duplicate
cells:wrap cellWrap@duplicate
cells:fill cellFill@theme
cells:colw cellColW@colAdd
cells:rowh cellRowH@rowAdd
cells:clearv cellClearValue@delete
cells:keepe cellKeepEmpty@delete
cells:clearf cellClearFormat@delete
find:find find@find
find:check check@check
find:q k_q@find
find:r k_r@replace
find:next k_next@find
find:all k_all@replace
panel:outline outline@outline
panel:pages pages@pages
panel:history history@history
panel:learn learning@history
panel:theme theme@theme
panel:palette palette@palette
panel:more more@more
panel:settings settings@settings
panel:library library@view
panel:timeline timeline@history
panel:prov pvOpen@history
panel:close k_close@close
panel:svc svc@view
panel:view view@view
mode:dark dark@dark
mode:calm calm@calm
mode:snap snap@snap
mode:focus focus@focus
mode:spell spell@spell
mode:both both@both
mode:lock lkToggle@close
mode:power powerOff@close
mode:host srvHost@link
mode:read reading@view
spell:next spellNext@spellNext
spell:prev spellPrev@spellPrev
spell:fix spellFix@spellFix
spell:fixall spellFixAll@spellFixAll
spell:ignore spellIgnore@spellIgnore
spell:ignoreall spellIgnoreAll@spellIgnoreAll
spell:add spellAdd@spellAdd
spell:count spellCount@spellCount
spell:lang spellLang@spellLang
lang:ui uiLang@uiLang
lang:ed ed@ed
lang:dir dir@dir
zoom:in zoomIn@zoomIn
zoom:out zoomOut@zoomOut
zoom:reset zoomReset@zoomReset
zoom:fit zoomFit@zoomFit
zoom:pct zoomPct@zoomIn
zoom:height zoomHeight@zoomFit
view:single view.single@view.single
view:spread view.spread@view.spread
view:flow view.continuous@view.continuous
view:mode view.mode@view
view:prev view.prev@view
view:next view.next@view
view:side side@side
fmt:bold fmtBold@ok
fmt:italic fmtItalic@ok
fmt:underline fmtUnderline@ok
fmt:strike fmtStrike@ok
fmt:code fmtCode@ok
fmt:link fmtLink@link
fmt:color fmtColor@theme
fmt:font fmtFont@ok
fmt:size fmtSize@zoomIn
fmt:clear fmtClear@ok
para:align.s fmtAlignStart@ok
para:align.c fmtAlignCenter@ok
para:align.e fmtAlignEnd@ok
para:align.j fmtJustify@ok
para:align.jl fmtJustifyLow@ok
para:align.jm fmtJustifyMedium@ok
para:align.jh fmtJustifyHigh@ok
para:v.t fmtTop@ok
para:v.m fmtMiddle@ok
para:v.b fmtBottom@ok
para:space.l fmtLine@ok
para:space.b fmtBefore@ok
para:space.a fmtAfter@ok
para:quote fmtQuote@ok
para:bullets fmtBullets@ok
para:numbers fmtNumbers@ok
para:shapes fmtShapes@ok
para:indent fmtIndent@ok
para:outdent fmtOutdent@ok
hf:hdr.text hdrText@add
hf:hdr.field hdrField@add
hf:hdr.logo hdrLogo@logo
hf:ftr.text ftrText@add
hf:ftr.field ftrField@add
hf:ftr.conf hdrConf@ok
hf:hdr.start hdrStart@ok chStart@ok
hf:hdr.center hdrCenter@ok chCenter@ok
hf:hdr.end hdrEnd@ok chEnd@ok
hf:hdr.delete hdrDelete@delete chDelete@delete
hf:hdr.scope hdrScope@every chScope@every
hf:ftr.start ftrStart@ok
hf:ftr.center ftrCenter@ok
hf:ftr.end ftrEnd@ok
hf:ftr.delete ftrDelete@delete
hf:ftr.scope ftrScope@every
layout:setup pgSetup@view
layout:break pgBreak@breakBefore pgBreakAdd@breakBefore
layout:breakdel pgBreakDel@delete
layout:pull pgPullUp@moveUp
layout:secdel secDel@delete
layout:empty pgEmpty@check
layout:ruler ruler@view
layout:margins margins@view
layout:renum renumber@renumber
layout:start renumList@renumber
layout:docid docId@ok
wrap:inline wrapInline@image
wrap:square wrapSquare@image
wrap:tight wrapTight@image
wrap:through wrapThrough@image
wrap:topbottom wrapTopBottom@image
wrap:behind wrapBehind@image
wrap:front wrapFront@image
design:slider vc.slider@view
design:number vc.number@view
design:unit vc.unit@view
design:swatch design.swatch@theme
design:hex design.hex@theme
design:part design.part@hideBlock
design:move design.move@moveDown
design:label design.label@dgLabel
design:labelall k_laball@dgLabel
design:css k_dcssApply@theme
design:styclear k_stclear@styleThis
design:embed k_embed@saveHtml k_docxFonts@exportPdf
font:pick font.pick@theme
font:local font.local@theme
font:upload font.upload@theme
font:remove font.remove@delete
proj:bulk bulkEdit@find
proj:sign pvSign@ok
proj:share shShare@link
proj:webhook webhooks@webhooks
proj:export projExport@exportAll
proj:import projImport@import
dg:node.staff dgStaff@dgStaff
dg:node.applicant dgApplicant@dgApplicant
dg:node.start dgStart@dgStart
dg:node.payment dgPayment@dgPayment
dg:node.rework dgRework@dgRework
dg:node.system dgSystem@dgSystem
dg:node.decision dgDecision@dgDecision
dg:node.ok dgOk@dgOk
dg:node.stop dgStop@dgStop
dg:node.note dgNote@dgNote
dg:node.group dgGroup@dgGroup
dg:node.text dgText@dgText
dg:auto dgAuto@dgAuto
dg:cvshapes dgCvShapes@dgCvShapes
dg:cvpage dgCvPage@dgCvPage
dg:cvauto dgCvAuto@dgCvAuto
dg:cvroute dgCvRoute@dgCvRoute
dg:reset dgReset@dgReset
dg:legend dgLegend@dgLegend
dg:proute dgRoute@dgRoute
dg:phead dgHead@dgHead
dg:ptail dgTail@dgTail
dg:pline dgLine@dgLine
dg:pweight dgWeight@dgWeight
dg:lgtext dgLgText@dgLgText
dg:lglook dgLgLook@dgLgLook
dg:lgdel dgLgDel@dgLgDel
dg:lgreset dgLgReset@dgLgReset
dg:join dgJoin@dgGroup
dg:fs dgFs@dgText
dg:mmdout dgMermaidOut@dgMermaidOut
dg:label dgLabel@dgLabel
dg:sub dgSub@dgSub
dg:connect dgConnect@dgConnect
dg:dup dgDup@dgDup
dg:del dgDel@dgDel
dg:front dgFront@dgFront
dg:back dgBack@dgBack
dg:align.l dgAlignL@dgAlignL
dg:align.c dgAlignC@dgAlignC
dg:align.r dgAlignR@dgAlignR
dg:align.t dgAlignT@dgAlignT
dg:align.m dgAlignM@dgAlignM
dg:align.b dgAlignB@dgAlignB
dg:dist.h dgDistH@dgDistH
dg:dist.v dgDistV@dgDistV
dg:wrap dgWrap@dgWrap
dg:edgelabel dgEdgeLabel@dgEdgeLabel
dg:bendadd dgBendAdd@dgBendAdd
dg:benddel dgBendDel@dgBendDel
dg:route dgRouteAuto@dgRouteAuto
dg:reverse dgReverse@dgReverse
dg:from dgFrom@dgFrom
dg:to dgTo@dgTo
dg:zoom.in dgZoomIn@dgZoomIn
dg:zoom.out dgZoomOut@dgZoomOut
dg:zoom.fit dgZoomFit@dgZoomFit
dg:zoom.100 dgZoom100@dgZoom100
dg:wire dg_wire@dgConnect
dg:kind dg_kind@dgDecision
dg:color dg_color@theme
dg:badge dg_badge@dgOk
dg:icon dg_icon@dgSymbol
dg:symbol dg_symbol@dgSymbol
tab:file rbtab_file@secFile
tab:home rbtab_home@secEdit
tab:insert rbtab_insert@secInsert
tab:layout rbtab_layout@secDocument
tab:design rbtab_design@secDesign
tab:review rbtab_review@check
tab:view rbtab_view@secView
tab:table rbtab_table@rowAdd
tab:picture rbtab_picture@image
tab:diagram rbtab_diagram@addDiagram
tab:export rbtab_export@exportPdf
tab:font rbtab_font@ok
tab:para rbtab_para@ok
tab:hf rbtab_hf@add
tab:tools rbtab_tools@more
tab:diagram2 rbtab_diagram2@dgAlignL
`;

/** The frame's x for a physical position: the miniature mirrors for a right-to-left interface (tabs and ribbon start on the right). */
const xaFx = (x, w = 0) => (XPL_RTL ? 160 - x - w : x);
const xaFr = (c, x, y, w, h, r = 1.4, s = '') => xaR(c, xaFx(x, w), y, w, h, r, s);
/** Set by a scene that wants a particular tab / lit ribbon button ({ tab, lit }); read once by xaFrame. */
let XPL_FR = null;
const xaHash = (t) => { let h = 7; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
/** The miniature of the real tool around one scene: window, navy top bar with tabs, ribbon with one lit button (the one the cursor
 *  presses), the canvas the scene lives in (scaled .78, clipped), and the payoff layer (ring, sparkles) at the badge. */
function xaFrame(inner, key) {
  const fr = XPL_FR || {}; XPL_FR = null;
  const lit = fr.lit ?? (xaHash(key) % 6), tab = fr.tab ?? (xaHash(`${key}t`) % 5);
  const bw = (i) => 9 + i * 11.5;
  const cx = xaFx(bw(lit), 7) + 3.5, cy = 12.6;
  const bar = '<path class="fr-bar" d="M0.5 8 V6.5 A6 6 0 0 1 6.5 0.5 H153.5 A6 6 0 0 1 159.5 6.5 V8 Z"/>';
  const cvs = '<path class="fr-cv" d="M0.5 17 H159.5 V89 A6 6 0 0 1 153.5 95 H6.5 A6 6 0 0 1 0.5 89 Z"/>';
  const head = xaR('fr-win', 0.5, 0.5, 159, 95, 6) + cvs + bar
    + [0, 1, 2].map((i) => xaC('fr-dot', xaFx(6 + i * 4.4), 4.3, 1.25)).join('')
    + [0, 1, 2, 3, 4].map((i) => xaFr(i === tab ? 'fr-tab on' : 'fr-tab', 27 + i * 15, 2.5, 12, 3.6, 1.8)).join('')
    + xaFr('fr-tab', 112, 2.5, 38, 3.6, 1.8)
    + xaR('fr-rib', 0.5, 8, 159, 9, 0) + xaR('fr-rule', 0.5, 16.6, 159, 0.8, 0)
    + Array.from({ length: 7 }, (_, i) => (i === lit ? '' : xaFr('fr-btn', bw(i), 10.1, 7, 5.2, 1.6))).join('')
    + xaFr('fr-pill', 98, 10.1, 52, 5.2, 2.6)
    + xaC('fr-glow', cx, cy, 6.5) + xaFr('fr-btn on', bw(lit), 10.1, 7, 5.2, 1.6);
  const cur = `<g transform="translate(${cx + 0.8} ${cy + 1.2})"><g class="fr-cur" style="--dx:${Math.round(XPL_RTL ? -26 : 30)}px;--dy:34px"><path class="fr-ptr" d="M0 0 V9 L2.4 6.9 L4.1 10.6 L5.9 9.8 L4.2 6.2 L7.4 6.1 Z"/></g></g>`;
  const rip = xaC('fr-rip', cx, cy, 4);
  const body = `<g class="fr-cvg"><g class="scn" transform="translate(17.6 18) scale(.78)">${inner}</g><rect class="fr-sweep" x="-30" y="17" width="22" height="78" rx="0"/></g>`;
  const spk = xaStar(127, 70, 3.2).replace('class="star"', 'class="fr-spk s0"') + xaStar(154, 66, 2.4).replace('class="star"', 'class="fr-spk s1"') + xaC('fr-spk s2', 152, 91, 1.4) + xaC('fr-spk s1', 130, 90, 1);
  return head + body + xaC('fr-pay', 141, 80, 11) + spk + rip + cur;
}

/** Parsed once: id → [scene, variant, fallbackIcon]. */
let XPL_RECIPES = null;
function xplRecipes() {
  if (XPL_RECIPES) return XPL_RECIPES;
  XPL_RECIPES = {};
  for (const line of XPL_MAP.trim().split('\n')) {
    const [sv, ...ids] = line.trim().split(/\s+/);
    const [scene, variant = ''] = sv.split(':');
    for (const x of ids) { const [id, icon = ''] = x.split('@'); XPL_RECIPES[id] = [scene, variant, icon]; }
  }
  return XPL_RECIPES;
}
const XPL_ART_CACHE = {};
/** The drawing for one explanation id: a complete <svg> (cached; the icon follows the UI direction, so the cache is per direction). */
function xplArtFor(id) {
  const ck = `${id}|${uiDir()}`;
  if (XPL_ART_CACHE[ck]) return XPL_ART_CACHE[ck];
  const [scene, variant, icon] = xplRecipes()[id] || ['generic', '', 'info'];
  XPL_RTL = uiDir() === 'rtl';
  XPL_FR = null;
  const inner = xaFrame((XPL_SCENES[scene] || XPL_SCENES.generic)(variant), `${scene}:${variant}`);
  const glyph = ic(id) || (icon && ic(icon)) || ic(id.replace(/^dg_/, 'dg')) || ic('info');
  return (XPL_ART_CACHE[ck] = `<svg viewBox="0 0 160 96" class="sc-${scene}" focusable="false" aria-hidden="true">${inner}<g class="badge" transform="translate(141 80)"><circle r="11"/><g transform="translate(-7.4 -7.4) scale(.62)">${glyph.replace('<svg', '<svg width="24" height="24"')}</g></g></svg>`);
}
/** Every id that has its own recipe (the test compares this with the i18n keys). */
function xplArtIds() { return Object.keys(xplRecipes()); }
