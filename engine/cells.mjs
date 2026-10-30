// Spreadsheet-grade table cells (0.14.0, lane A). Pure functions, browser + Node, no dependencies.
//
// Model (all additive; a document without these members renders byte-identical):
//   table block:  merges: [{r, c, rs, cs}]   body-row/column index of the top-left cell + row/col span
//                 colWidths: [percent…]       one per column, sums to 100
//                 rowHeights: [mm | null…]    one per body row (minimum height)
//   cell leaf style (rich leaf {text, marks, style}):
//                 formula: '=SUM(A1:A3)'      text holds the last result, so every export prints the value
//                 fill: '#rrggbb'             wrap: false (no wrapping)     list/level (existing, now also in cells)
// Addresses: A1 = first column, first BODY row (the header row is not addressed).
import { isRich, textOf, markLeaf, styleLeaf, MARK_TYPES } from './edits.mjs';

export const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export const colIndex = (s) => [...s.toUpperCase()].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const AR_DIGITS = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
/** A cell's number, or null when its words are not one (blank → null; '1,200.5' and Arabic-Indic digits are numbers). */
export function numberOf(leaf) {
  const s = textOf(leaf).trim().replace(/[٠-٩]/g, (d) => AR_DIGITS[d]).replace(/٫/g, '.').replace(/٬/g, ',');
  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d*)(\.\d+)?$/.test(s) || !/\d/.test(s)) return null;
  return Number(s.replace(/,/g, ''));
}
/** Display text of a computed number: no float noise (0.1+0.2 → 0.3). */
export const fmtNum = (n) => (Number.isFinite(n) ? String(+n.toPrecision(12)) : '#ERR');

/* ── formula: tokenizer + recursive descent ──────────────────────────────── */
const FUNCS = { SUM: (a) => a.reduce((x, y) => x + y, 0), AVERAGE: (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN), MIN: (a) => (a.length ? Math.min(...a) : 0), MAX: (a) => (a.length ? Math.max(...a) : 0), COUNT: (a) => a.length };
export const FORMULA_FUNCS = Object.keys(FUNCS);
function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?|\.\d+)|(\$?[A-Za-z]{1,3}\$?\d+)|([A-Za-z]+)|([-+*/(),:]))/y;
  let m;
  re.lastIndex = 0;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m) { if (!src.slice(at).trim()) break; throw new Error('token'); }
    if (m[1] !== undefined) out.push({ t: 'n', v: +m[1] });
    else if (m[2] !== undefined) out.push({ t: 'r', v: m[2].replace(/\$/g, '').toUpperCase() });
    else if (m[3] !== undefined) out.push({ t: 'f', v: m[3].toUpperCase() });
    else out.push({ t: m[4] });
  }
  return out;
}
const refOf = (s) => { const m = /^([A-Z]+)(\d+)$/.exec(s); return { c: colIndex(m[1]), r: +m[2] - 1 }; };
/**
 * Evaluates a formula string ('=…'). at(r, c) → the number of that cell, or null for text/blank (blank counts 0 in arithmetic,
 * is skipped by functions). Throws on a syntax error, a division by zero or a cycle (the caller shows #ERR).
 */
export function evalFormula(formula, at) {
  const toks = tokenize(String(formula).replace(/^\s*=/, ''));
  let i = 0;
  const peek = () => toks[i]?.t;
  const eat = (t) => { if (toks[i]?.t !== t) throw new Error(`expected ${t}`); return toks[i++]; };
  const cellNum = (r, c) => { const v = at(r, c); return v == null ? 0 : v; };
  function range() { // → [numbers…] of a ref or A1:B2
    const a = refOf(eat('r').v);
    if (peek() !== ':') { const v = at(a.r, a.c); return v == null ? [] : [v]; }
    i += 1;
    const b = refOf(eat('r').v);
    const out = [];
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r += 1) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c += 1) { const v = at(r, c); if (v != null) out.push(v); }
    return out;
  }
  // a bare range outside a function is #ERR, not a silent SUM (TCELLS-03); an empty reference stays 0, like Excel
  function primary() {
    const k = toks[i];
    if (!k) throw new Error('end');
    if (k.t === 'n') { i += 1; return k.v; }
    if (k.t === '(') { i += 1; const v = expr(); eat(')'); return v; }
    if (k.t === '-') { i += 1; return -primary(); }
    if (k.t === '+') { i += 1; return primary(); }
    if (k.t === 'r') { const n = toks[i + 1]; if (n?.t === ':') throw new Error('range'); i += 1; const { r, c } = refOf(k.v); return cellNum(r, c); }
    if (k.t === 'f') {
      if (!FUNCS[k.v]) throw new Error('fn');
      i += 1; eat('(');
      const args = [];
      while (peek() !== ')') {
        if (peek() === 'r') { const save = i; try { args.push(...range()); } catch (e) { throw e; } if (i === save) throw new Error('arg'); } else args.push(expr());
        if (peek() === ',') i += 1; else break;
      }
      eat(')');
      const v = FUNCS[k.v](args);
      if (!Number.isFinite(v)) throw new Error('math');
      return v;
    }
    throw new Error('unexpected');
  }
  function term() { let v = primary(); while (peek() === '*' || peek() === '/') { const op = toks[i++].t; const w = primary(); if (op === '/' && w === 0) throw new Error('div0'); v = op === '*' ? v * w : v / w; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = toks[i++].t; const w = term(); v = op === '+' ? v + w : v - w; } return v; }
  const v = expr();
  if (i < toks.length) throw new Error('trailing');
  if (!Number.isFinite(v)) throw new Error('math');
  return v;
}
export const isFormula = (s) => typeof s === 'string' && /^\s*=\s*\S/.test(s);
export const formulaOf = (leaf) => (isRich(leaf) && isFormula(leaf.style?.formula) ? leaf.style.formula : null);

/** Covered (hidden) cells of a merge list: Set of 'r,c'. */
export function coveredOf(merges = []) {
  const s = new Set();
  for (const m of merges) for (let r = m.r; r < m.r + m.rs; r += 1) for (let c = m.c; c < m.c + m.cs; c += 1) if (r !== m.r || c !== m.c) s.add(`${r},${c}`);
  return s;
}
/** A formula cell's new leaf: text = result (or #ERR), formula kept. */
const withResult = (leaf, text) => (leaf.text === text ? leaf : { ...leaf, text, marks: [] });
/**
 * Recomputes every formula cell of rows (body rows, any leaf shape). Returns [{r, c, leaf}] for the cells whose shown
 * value changed. A cycle or a bad formula gives '#ERR'; text/blank cells count as blank, merged-away cells as blank.
 */
export function recalc(rows, merges = []) {
  const covered = coveredOf(merges);
  const memo = new Map();
  const stack = new Set();
  function value(r, c) { // number | null
    const key = `${r},${c}`;
    if (covered.has(key)) return null;
    const leaf = rows[r]?.[c];
    const f = formulaOf(leaf);
    if (!f) return numberOf(leaf);
    if (memo.has(key)) return memo.get(key);
    if (stack.has(key)) throw new Error('cycle');
    stack.add(key);
    let v;
    try { v = evalFormula(f, value); } finally { stack.delete(key); }
    memo.set(key, v);
    return v;
  }
  const changes = [];
  rows.forEach((row, r) => row.forEach((leaf, c) => {
    const f = formulaOf(leaf);
    if (!f) return;
    let text;
    try { text = fmtNum(value(r, c)); } catch { text = '#ERR'; }
    if (leaf.text !== text) changes.push({ r, c, leaf: withResult(leaf, text) });
  }));
  return changes;
}
/** Text typed into a cell → its leaf. '=…' becomes a formula leaf with its result as text; anything else drops a formula. */
export function leafFromInput(old, input) {
  const s = String(input ?? '');
  if (isFormula(s)) return { ...(isRich(old) ? old : {}), text: '#ERR', marks: [], style: { ...(isRich(old) ? old.style : {}), formula: s.trim() } };
  if (isRich(old) && old.style?.formula) return styleLeaf({ ...old, text: s }, { formula: null });
  return old === undefined || !isRich(old) ? s : { ...old, text: s };
}
const REF = /(\$?)([A-Za-z]{1,3})(\$?)(\d+)/g;
/** A formula copied by (dr, dc): relative refs move, $-anchored parts stay (Excel's copy/paste). A ref pushed off the grid becomes #REF!. */
export function shiftFormula(f, dr, dc) {
  return f.replace(REF, (m, ca, col, ra, row) => {
    const c = ca ? colIndex(col) : colIndex(col) + dc;
    const r = ra ? +row - 1 : +row - 1 + dr;
    return c < 0 || r < 0 ? '#REF!' : `${ca}${colName(c)}${ra}${r + 1}`;
  });
}
/** A formula after a row/column insert (delta +n at index `at`) or delete (delta −n over [at, at+n)): refs follow their cells. */
export function adjustFormula(f, axis, at, delta) {
  return f.replace(REF, (m, ca, col, ra, row) => {
    let c = colIndex(col), r = +row - 1;
    const k = axis === 'row' ? r : c;
    let nk = k;
    if (delta > 0) { if (k >= at) nk = k + delta; } else if (k >= at + -delta) nk = k + delta; else if (k >= at) return '#REF!';
    if (axis === 'row') r = nk; else c = nk;
    return `${ca}${colName(c)}${ra}${r + 1}`;
  });
}

/* ── merges ───────────────────────────────────────────────────────────────── */
const rectsOverlap = (a, b) => a.r < b.r + b.rs && b.r < a.r + a.rs && a.c < b.c + b.cs && b.c < a.c + a.cs;
/** merges + the rectangle [r0..r1]×[c0..c1] merged: merges it touches are absorbed. Returns the new list, or the same list if the rectangle is a single cell. */
export function mergeRect(merges = [], r0, c0, r1, c1) {
  const box = { r: Math.min(r0, r1), c: Math.min(c0, c1), rs: Math.abs(r1 - r0) + 1, cs: Math.abs(c1 - c0) + 1 };
  if (box.rs * box.cs < 2) return merges;
  // grow to take whole merges that cross the edge (a merged cell is never cut in half)
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of merges) if (rectsOverlap(box, m)) {
      const r = Math.min(box.r, m.r), c = Math.min(box.c, m.c), r2 = Math.max(box.r + box.rs, m.r + m.rs), c2 = Math.max(box.c + box.cs, m.c + m.cs);
      if (r !== box.r || c !== box.c || r2 - r !== box.rs || c2 - c !== box.cs) { Object.assign(box, { r, c, rs: r2 - r, cs: c2 - c }); grew = true; }
    }
  }
  return [...merges.filter((m) => !rectsOverlap(box, m)), box].sort((a, b) => a.r - b.r || a.c - b.c);
}
/** Split: every merge touching the rectangle is removed. */
export function splitRect(merges = [], r0, c0, r1, c1) {
  const box = { r: Math.min(r0, r1), c: Math.min(c0, c1), rs: Math.abs(r1 - r0) + 1, cs: Math.abs(c1 - c0) + 1 };
  return merges.filter((m) => !rectsOverlap(box, m));
}
/** Merges after inserting (n>0) / deleting (n<0) rows or columns at index `at`; a merge that is deleted whole disappears, a cut one shrinks. */
export function shiftMerges(merges = [], axis, at, n) {
  const R = axis === 'row';
  const out = [];
  for (const m of merges) {
    let s = R ? m.r : m.c, len = R ? m.rs : m.cs;
    if (n > 0) { if (at <= s) s += n; else if (at < s + len) len += n; } // inserted inside a merge: it grows
    else {
      const d = -n, end = s + len;
      const kept = len - Math.max(0, Math.min(end, at + d) - Math.max(s, at));
      if (at + d <= s) s -= d; else if (at < s) s = at;
      len = kept;
    }
    if (len < 1) continue;
    const next = R ? { ...m, r: s, rs: len } : { ...m, c: s, cs: len };
    if (next.rs * next.cs > 1) out.push(next);
  }
  return out;
}

/* ── clear value / clear format ──────────────────────────────────────────── */
/** Clear value: the words go, the format stays; a formula goes with its value. */
export function clearValue(leaf) {
  if (!isRich(leaf)) return '';
  const next = { ...leaf, text: '', marks: [] };
  if (next.style) { next.style = { ...next.style }; delete next.style.formula; if (!Object.keys(next.style).length) delete next.style; }
  return next.style ? next : '';
}
/** Clear format: theme/font/size/colour marks, bold…, alignment, fill, list, wrap all go; the words and the formula stay. */
export function clearFormat(leaf) {
  if (!isRich(leaf)) return leaf;
  const f = leaf.style?.formula;
  return f ? { text: leaf.text, marks: [], style: { formula: f } } : leaf.text;
}
/** One mark/style applied to a whole cell. */
export function markWhole(leaf, type, value, on = true) { return markLeaf(leaf, 0, textOf(leaf).length, type, value, on); }
export const WHOLE_TYPES = MARK_TYPES;

/* ── lists inside a cell: one item per line ──────────────────────────────── */
/** A rich leaf cut into its lines ('\n'), marks sliced; a string gives strings. */
export function splitLines(leaf) {
  const text = textOf(leaf);
  const lines = text.split('\n');
  if (!isRich(leaf)) return lines;
  let at = 0;
  return lines.map((ln) => {
    const a = at; const b = at + ln.length; at = b + 1;
    const marks = (leaf.marks || []).map(([s, e, ...r]) => [Math.max(s, a) - a, Math.min(e, b) - a, ...r]).filter(([s, e]) => e > s);
    return { ...leaf, text: ln, marks };
  });
}

/* ── clipboard (TSV) ─────────────────────────────────────────────────────── */
export const toTsv = (grid) => grid.map((row) => row.map((v) => { const s = String(v ?? ''); return /[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join('\t')).join('\n');
export function parseTsv(text) {
  const rows = [[]];
  let cell = '', q = false;
  const s = String(text ?? '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n') { rows.at(-1).push(cell); cell = ''; rows.push([]); }
    else cell += ch;
  }
  rows.at(-1).push(cell);
  if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === '') rows.pop(); // the trailing newline Excel adds
  return rows;
}
/** Widths in percent: column i set to w (clamped), the others scaled so the total stays 100. cols = the set that gets w. */
export function setWidths(widths, cols, w) {
  const n = widths.length;
  const set = new Set(cols);
  const lo = 4, hi = 100 - lo * (n - set.size) - 0;
  w = Math.max(lo, Math.min(set.size === n ? 100 / n : hi / Math.max(1, set.size), w));
  const rest = widths.reduce((a, x, i) => (set.has(i) ? a : a + x), 0);
  const left = 100 - w * set.size;
  return widths.map((x, i) => +(set.has(i) ? w : rest ? (x / rest) * left : left / (n - set.size)).toFixed(2));
}
