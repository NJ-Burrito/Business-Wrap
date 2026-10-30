/* Lane A · spreadsheet-grade table cells (0.14.0). The pure model lives in engine/cells.mjs (formulas, merges, TSV, widths);
 * this file is the editor side: cell selection (click-drag, Shift+click, Ctrl+click), Delete/Backspace, copy/cut/paste (TSV),
 * the cell tools (merge, split, wrap, fill, clear value, clear format), insert/delete rows and columns that keep merges,
 * widths and formulas right, formulas ('=SUM(A1:A3)' typed in a cell, result shown, formula shown while editing) and
 * column/row resizing by dragging a cell border. Every change is ONE commit (one undo step). A body cell only: the header
 * row is plain text. Cell format and values are per edition (mirror: false); the table's shape (rows, columns, merges,
 * widths, heights) goes to both editions so the pair stays one shape. */
const CE = { ed: null, rows: null, b: null, sel: new Set(), anchor: null, clip: null, drag: null, rz: null };
const ceKey = (r, c) => `${r},${c}`;
const ceCellEl = (n) => n?.closest?.('#bw-pair main.bw-doc table[data-b][data-rows] td[data-r][data-c]') || null;
/** the pointer of the object that holds rows/merges/widths: a user story's own table (data-t) or the table block (data-b) */
const ceTblPtr = (tb) => tb.dataset.t || tb.dataset.b;
const ceTblOf = (td) => { const tb = td.closest('table'); return { ed: td.closest('main.bw-doc').dataset.locale, rows: tb.dataset.rows, b: ceTblPtr(tb), el: tb }; };
const ceTableEl = () => mainOf(CE.ed)?.querySelector(`table[data-rows="${CSS.escape(CE.rows || '')}"]`);
function cePaint() {
  document.querySelectorAll('.bw-csel,.bw-fillh').forEach((x) => x.classList.remove('bw-csel', 'bw-fillh'));
  document.documentElement.classList.toggle('bw-cellmode', CE.sel.size > 0);
  if (!CE.sel.size) return;
  const tb = ceTableEl();
  CE.sel.forEach((k) => { const [r, c] = k.split(','); tb?.querySelector(`td[data-r="${r}"][data-c="${c}"]`)?.classList.add('bw-csel'); });
  const cells = [...CE.sel].map((k) => k.split(',').map(Number)), rc = ceRect(cells);
  tb?.querySelector(`td[data-r="${rc.r1}"][data-c="${rc.c1}"]`)?.classList.add('bw-fillh'); // the fill handle sits on the block's last cell
  w2showSection('format', true); // the format tools act on the selected cells
}
function ceSet(cells, tbl) {
  Object.assign(CE, { ed: tbl.ed, rows: tbl.rows, b: tbl.b });
  CE.sel = new Set(cells.map(([r, c]) => ceKey(r, c)));
  cePaint();
  refreshUi();
}
function ceClearSel() { if (!CE.sel.size) return; CE.head = null; CE.sel.clear(); cePaint(); refreshUi(); }
const ceRect = (cells) => ({ r0: Math.min(...cells.map((x) => x[0])), r1: Math.max(...cells.map((x) => x[0])), c0: Math.min(...cells.map((x) => x[1])), c1: Math.max(...cells.map((x) => x[1])) });
const ceBlk = (ed, b) => get(cur(ed).doc, b);
/** the cells a command acts on: the selected cells, else the cell being edited */
function ceTarget() {
  if (CE.sel.size && ceTableEl()) {
    const cells = [...CE.sel].map((k) => k.split(',').map(Number));
    return { ed: CE.ed, rows: CE.rows, b: CE.b, cells, el: ceTableEl(), sel: true };
  }
  const x = tableCtx();
  if (!x || !x.b || x.r < 0 || x.c < 0) return null;
  return { ed: S.sel?.ed || S.ed, rows: x.rows, b: lastCell?.closest('table')?.dataset.t || x.b, cols: x.cols, cells: [[x.r, x.c]], el: lastCell?.closest('table') || null, sel: false };
}
const ceLive = (tg, cells) => { const cov = coveredOf(ceBlk(tg.ed, tg.b).merges || []); return cells.filter(([r, c]) => !cov.has(ceKey(r, c))); };

/** One commit of cell leaves (Map 'r,c' → leaf) + any extra ops; formulas anywhere in the table are recalculated in the same commit. */
function cePut(tg, edits, extra = [], mirror = false) {
  const blk = ceBlk(tg.ed, tg.b);
  const grid = blk.rows.map((r) => r.slice());
  for (const [k, leaf] of edits) { const [r, c] = k.split(',').map(Number); grid[r][c] = leaf; }
  for (const ch of recalc(grid, blk.merges || [])) edits.set(ceKey(ch.r, ch.c), ch.leaf);
  const ops = [];
  for (const [k, leaf] of edits) {
    const [r, c] = k.split(',').map(Number);
    const old = blk.rows[r][c];
    if (JSON.stringify(old) !== JSON.stringify(leaf)) ops.push({ op: 'replace', path: `${tg.rows}/${r}/${c}`, value: leaf, old });
  }
  ops.push(...extra);
  if (!ops.length) return false;
  commit(ops, { ed: tg.ed, mirror });
  return true;
}
const ceMap = (tg, cells, f) => { const m = new Map(); const blk = ceBlk(tg.ed, tg.b); for (const [r, c] of ceLive(tg, cells)) m.set(ceKey(r, c), f(blk.rows[r][c], r, c)); return m; };
function ceMember(blk, ptr, key, value) { return { op: blk[key] === undefined ? 'insert' : 'replace', path: `${ptr}/${key}`, value, old: blk[key] }; }

/* ── the cell tools ─────────────────────────────────────────────────────── */
const CE_ACT = {
  /** Excel's fill handle: the selected block is tiled out to (r, c), formulas shift their relative refs ($-anchored parts stay) */
  fillTo(r, c) {
    const tg = ceTarget();
    if (!tg || !tg.sel) return false;
    const { r0, r1, c0, c1 } = ceRect(tg.cells);
    const blk = ceBlk(tg.ed, tg.b);
    const h = r1 - r0 + 1, w = c1 - c0 + 1;
    const dr = r > r1 ? r - r1 : r < r0 ? r - r0 : 0, dc = c > c1 ? c - c1 : c < c0 ? c - c0 : 0;
    if (!dr && !dc) return false;
    const rows = Math.abs(dr) >= Math.abs(dc) && dr ? [dr > 0 ? r1 + 1 : r + 0, dr > 0 ? r : r0 - 1] : [r0, r1];
    const cols = !(Math.abs(dr) >= Math.abs(dc) && dr) ? [dc > 0 ? c1 + 1 : c, dc > 0 ? c : c0 - 1] : [c0, c1];
    const cov = coveredOf(blk.merges || []);
    const edits = new Map();
    for (let rr = rows[0]; rr <= rows[1]; rr += 1) for (let cc = cols[0]; cc <= cols[1]; cc += 1) {
      if (rr < 0 || cc < 0 || rr >= blk.rows.length || cc >= blk.rows[0].length || cov.has(ceKey(rr, cc))) continue;
      const sr = r0 + (((rr - r0) % h) + h) % h, sc = c0 + (((cc - c0) % w) + w) % w;
      const src = blk.rows[sr][sc], f = formulaOf(src);
      edits.set(ceKey(rr, cc), f ? { ...src, style: { ...src.style, formula: shiftFormula(f, rr - sr, cc - sc) } } : src);
    }
    if (!edits.size) return false;
    const ok = cePut(tg, edits);
    ceSet([...Array(rows[1] - rows[0] + 1)].flatMap((_, i) => [...Array(cols[1] - cols[0] + 1)].map((__, j) => [rows[0] + i, cols[0] + j])).concat(tg.cells), { ed: tg.ed, rows: tg.rows, b: tg.b });
    return ok;
  },
  clearValue() {
    const tg = ceTarget();
    if (!tg) return false;
    return cePut(tg, ceMap(tg, tg.cells, clearValue));
  },
  clearFormat() {
    const tg = ceTarget();
    if (!tg) return false;
    return cePut(tg, ceMap(tg, tg.cells, clearFormat));
  },
  style(patch) {
    const tg = ceTarget();
    if (!tg) return false;
    return cePut(tg, ceMap(tg, tg.cells, (l) => styleLeaf(l, patch)));
  },
  /** a mark over the whole words of every target cell; a toggle is off only when every cell already has it */
  mark(type, value) {
    const tg = ceTarget();
    if (!tg) return false;
    const blk = ceBlk(tg.ed, tg.b);
    const live = ceLive(tg, tg.cells);
    const on = value != null || !live.every(([r, c]) => { const l = blk.rows[r][c]; return hasMark(l, 0, textOf(l).length, type); });
    return cePut(tg, ceMap(tg, tg.cells, (l) => markLeaf(l, 0, textOf(l).length, type, value, on)));
  },
  clearMarks() {
    const tg = ceTarget();
    if (!tg) return false;
    return cePut(tg, ceMap(tg, tg.cells, (l) => { let n = l; for (const ty of MARK_TYPES) n = markLeaf(n, 0, textOf(n).length, ty, null, false); return isRich(n) ? { ...n, marks: [] } : n; }));
  },
  list(kind) {
    const tg = ceTarget();
    if (!tg) return false;
    const blk = ceBlk(tg.ed, tg.b);
    const off = ceLive(tg, tg.cells).every(([r, c]) => (blk.rows[r][c]?.style?.list) === kind);
    return cePut(tg, ceMap(tg, tg.cells, (l) => styleLeaf(l, off ? { list: null, level: null } : { list: kind, level: 0 })));
  },
  wrap() {
    const tg = ceTarget();
    if (!tg) return false;
    const blk = ceBlk(tg.ed, tg.b);
    const wrapped = ceLive(tg, tg.cells).every(([r, c]) => blk.rows[r][c]?.style?.wrap !== false);
    return cePut(tg, ceMap(tg, tg.cells, (l) => styleLeaf(l, { wrap: wrapped ? false : null })));
  },
  fill(color) {
    return CE_ACT.style({ fill: /^#[0-9a-f]{6}$/i.test(color) ? color : null });
  },
  merge() {
    const tg = ceTarget();
    if (!tg || tg.cells.length < 2) { toast(t('ce.pickRange'), 'info'); return false; }
    const { r0, r1, c0, c1 } = ceRect(tg.cells);
    const blk = ceBlk(tg.ed, tg.b);
    const next = mergeRect(blk.merges || [], r0, c0, r1, c1);
    commit([ceMember(blk, tg.b, 'merges', next)], { ed: tg.ed, mirror: true });
    ceSet([[r0, c0]], tg);
    return true;
  },
  split() {
    const tg = ceTarget();
    if (!tg) return false;
    const { r0, r1, c0, c1 } = ceRect(tg.cells);
    const blk = ceBlk(tg.ed, tg.b);
    const next = splitRect(blk.merges || [], r0, c0, r1, c1);
    if (next.length === (blk.merges || []).length) { toast(t('ce.nothingMerged'), 'info'); return false; }
    commit([ceMember(blk, tg.b, 'merges', next)], { ed: tg.ed, mirror: true });
    return true;
  },
  /** one width (percent of the table) for every selected column / one height (mm) for every selected row */
  colWidth(pct) {
    const tg = ceTarget();
    if (!tg) return false;
    const widths = ceWidths(tg);
    const next = setWidths(widths, [...new Set(tg.cells.map((x) => x[1]))], +pct);
    commit([ceMember(ceBlk(tg.ed, tg.b), tg.b, 'colWidths', next)], { ed: tg.ed, mirror: true });
    return true;
  },
  rowHeight(mm) {
    const tg = ceTarget();
    if (!tg) return false;
    const blk = ceBlk(tg.ed, tg.b);
    const h = Array.from({ length: blk.rows.length }, (_, i) => blk.rowHeights?.[i] ?? null);
    for (const r of new Set(tg.cells.map((x) => x[0]))) h[r] = Math.max(4, Math.min(400, +mm));
    commit([ceMember(blk, tg.b, 'rowHeights', h)], { ed: tg.ed, mirror: true });
    return true;
  },
};
/** The table's column widths in percent, one per data column (0 = not printed): the saved ones, else what the page shows now. */
function ceWidths(tg) {
  const blk = ceBlk(tg.ed, tg.b);
  const n = Math.max(blk.columns?.length || 0, ...blk.rows.map((r) => r.length), 1);
  if (Array.isArray(blk.colWidths) && blk.colWidths.length === n) return blk.colWidths.map(Number);
  const el = tg.el || mainOf(tg.ed)?.querySelector(`table[data-rows="${CSS.escape(tg.rows)}"]`);
  const kept = el ? [...new Set([...el.querySelectorAll('td[data-c], th[data-c]')].map((x) => +x.dataset.c))].sort((a, b) => a - b) : [];
  const cols = el ? [...el.querySelectorAll(':scope > colgroup > col')] : [];
  const out = Array(n).fill(0);
  if (kept.length && kept.length === cols.length) kept.forEach((c, k) => { out[c] = parseFloat(cols[k].style.width) || 0; });
  else out.fill(100 / n);
  const sum = out.reduce((a, b) => a + b, 0) || 1;
  return out.map((x) => +((x / sum) * 100).toFixed(2));
}
const ceAsk = async (id) => {
  const tg = ceTarget();
  if (!tg) { toast(t('w2.pickText'), 'info'); return; }
  const l = ceBlk(tg.ed, tg.b).rows[tg.cells[0][0]][tg.cells[0][1]];
  const st = isRich(l) ? l.style || {} : {};
  if (id === 'cellFill') { const v = await ask(t('ce.fillPrompt'), st.fill || '#fff4d6', { type: 'color' }); if (v === '' || /^#[0-9a-f]{6}$/i.test(v)) CE_ACT.fill(v); return; }
  if (id === 'cellColW') { const v = +(await ask(t('ce.colWPrompt'), String(Math.round(ceWidths(tg)[tg.cells[0][1]])), { type: 'number', min: 4, max: 90, step: 1 })); if (v >= 4 && v <= 90) CE_ACT.colWidth(v); return; }
  if (id === 'cellRowH') { const v = +(await ask(t('ce.rowHPrompt'), '12', { type: 'number', min: 4, max: 400, step: 1 })); if (v >= 4 && v <= 400) CE_ACT.rowHeight(v); }
};
const CE_IDS = ['cellMerge', 'cellSplit', 'cellWrap', 'cellFill', 'cellColW', 'cellRowH', 'cellClearValue', 'cellClearFormat'];
const CE_RUN = { cellMerge: () => CE_ACT.merge(), cellSplit: () => CE_ACT.split(), cellWrap: () => CE_ACT.wrap(), cellClearValue: () => CE_ACT.clearValue(), cellClearFormat: () => { CE_ACT.clearMarks(); CE_ACT.clearFormat(); }, cellFill: ceAsk, cellColW: ceAsk, cellRowH: ceAsk };
/* the format bar acts on the selected cells (all of them, whole words) while a cell selection exists */
const CE_FMT = {
  fmtBold: () => CE_ACT.mark('b'), fmtItalic: () => CE_ACT.mark('i'), fmtUnderline: () => CE_ACT.mark('u'), fmtStrike: () => CE_ACT.mark('s'), fmtCode: () => CE_ACT.mark('code'),
  fmtClear: () => CE_ACT.clearMarks(),
  fmtAlignStart: () => CE_ACT.style({ align: 'start' }), fmtAlignCenter: () => CE_ACT.style({ align: 'center' }), fmtAlignEnd: () => CE_ACT.style({ align: 'end' }), fmtJustify: () => CE_ACT.style({ align: 'justify' }),
  fmtTop: () => CE_ACT.style({ valign: 'top' }), fmtMiddle: () => CE_ACT.style({ valign: 'middle' }), fmtBottom: () => CE_ACT.style({ valign: 'bottom' }),
  fmtBullets: () => CE_ACT.list('bullet'), fmtNumbers: () => CE_ACT.list('number'),
  fmtColor: async () => { const v = await ask(t('w2.colorPrompt'), '#000000', { type: 'color' }); if (/^#[0-9a-f]{6}$/i.test(v)) CE_ACT.mark('color', v); else if (v) toast(t('w2.badColor'), 'warn'); },
  fmtFont: async () => { const v = await ask(t('w2.fontPrompt'), FONT_FAMILIES[0], { type: 'select', options: FONT_FAMILIES }); if (FONT_FAMILIES.includes(v)) CE_ACT.mark('font', v); },
  fmtSize: async () => { const v = +(await ask(t('w2.sizePrompt'), '12', { type: 'number', min: 5, max: 72, step: 1 })); if (v >= 5 && v <= 72) CE_ACT.mark('size', v); },
};

/* ── insert / delete rows and columns: merges, widths, heights and formulas follow ─── */
function ceStructCtx() {
  const tg = ceTarget();
  if (!tg) return null;
  const blk = ceBlk(tg.ed, tg.b);
  if (!Array.isArray(blk?.rows)) return null;
  return { ...tg, blk, cols: tg.cols || `${tg.b}/columns`, w: Math.max(blk.columns?.length || 0, ...blk.rows.map((r) => r.length), 1) };
}
/** Runs fn (it commits more ops) right after a commit of this edition and folds those ops into that commit's undo group: one user
 *  action is ONE undo step (TCELLS-01/04). The ids stay unique (`<group>.f<k>`, the way ceFinish joins a typing group). */
function ceJoin(ed, fn) {
  const e = cur(ed);
  const g = e.ops.at(-1)?.id.split('.')[0], n0 = e.ops.length;
  fn();
  if (g) e.ops.slice(n0).forEach((op, k) => { op.id = `${g}.f${k}`; });
}
/** formulas after a structural change: refs follow their cells, then a recalculation (a second commit for this edition only, same undo step) */
function ceFixFormulas(x, axis, at, delta) {
  const rows = ceBlk(x.ed, x.b).rows;
  const edits = new Map();
  rows.forEach((row, r) => row.forEach((leaf, c) => { const f = formulaOf(leaf); if (f) edits.set(ceKey(r, c), { ...leaf, style: { ...leaf.style, formula: adjustFormula(f, axis, at, delta) } }); }));
  if (edits.size) ceJoin(x.ed, () => cePut(x, edits));
}
const A_CORE = { rowAdd: A.rowAdd, rowDel: A.rowDel, colAdd: A.colAdd, colDel: A.colDel };
A.rowAdd = () => {
  const x = ceStructCtx();
  if (!x) return A_CORE.rowAdd();
  const rs = [...new Set(x.cells.map((c) => c[0]))];
  const at = Math.max(...rs) + 1, n = rs.length;
  const ops = Array.from({ length: n }, () => ({ op: 'insert', path: `${x.rows}/${at}`, value: Array.from({ length: x.w }, () => '') }));
  if (x.blk.merges?.length) ops.push(ceMember(x.blk, x.b, 'merges', shiftMerges(x.blk.merges, 'row', at, n)));
  if (x.blk.rowHeights) ops.push(ceMember(x.blk, x.b, 'rowHeights', [...x.blk.rowHeights.slice(0, at), ...Array(n).fill(null), ...x.blk.rowHeights.slice(at)]));
  commit(ops, { ed: x.ed, mirror: true });
  ceFixFormulas(x, 'row', at, n);
};
A.rowDel = () => {
  const x = ceStructCtx();
  if (!x) return A_CORE.rowDel();
  const rs = [...new Set(x.cells.map((c) => c[0]))].sort((a, b) => b - a);
  if (rs.length >= x.blk.rows.length) { toast(t('ce.keepOne'), 'info'); return; }
  const ops = rs.map((r) => ({ op: 'delete', path: `${x.rows}/${r}`, old: x.blk.rows[r] }));
  let merges = x.blk.merges || [];
  for (const r of rs) merges = shiftMerges(merges, 'row', r, -1);
  if (x.blk.merges?.length) ops.push(ceMember(x.blk, x.b, 'merges', merges));
  if (x.blk.rowHeights) ops.push(ceMember(x.blk, x.b, 'rowHeights', x.blk.rowHeights.filter((_, i) => !rs.includes(i))));
  commit(ops, { ed: x.ed, mirror: true });
  lastCell = null;
  ceClearSel();
  ceJoin(x.ed, () => { for (const r of rs) ceFixFormulas(x, 'row', r, -1); });
};
A.colAdd = () => {
  const x = ceStructCtx();
  if (!x) return A_CORE.colAdd();
  const cs = [...new Set(x.cells.map((c) => c[1]))];
  const at = Math.max(...cs) + 1, n = cs.length;
  const w0 = ceWidths(x);
  const ops = [];
  for (let k = 0; k < n; k += 1) { if (x.blk.columns) ops.push({ op: 'insert', path: `${x.cols}/${at}`, value: '…' }); x.blk.rows.forEach((_, r) => ops.push({ op: 'insert', path: `${x.rows}/${r}/${at}`, value: '' })); }
  const fresh = 100 / (w0.length + n);
  const widths = [...w0.slice(0, at), ...Array(n).fill(fresh), ...w0.slice(at)];
  ops.push(ceMember(x.blk, x.b, 'colWidths', setWidths(widths, Array.from({ length: n }, (_, k) => at + k), fresh)));
  if (x.blk.merges?.length) ops.push(ceMember(x.blk, x.b, 'merges', shiftMerges(x.blk.merges, 'col', at, n)));
  commit(ops, { ed: x.ed, mirror: true });
  ceFixFormulas(x, 'col', at, n);
};
A.colDel = () => {
  const x = ceStructCtx();
  if (!x) return A_CORE.colDel();
  const cs = [...new Set(x.cells.map((c) => c[1]))].sort((a, b) => b - a);
  if (cs.length >= x.w) { toast(t('ce.keepOne'), 'info'); return; }
  const w0 = ceWidths(x);
  const ops = [];
  for (const c of cs) { if (x.blk.columns) ops.push({ op: 'delete', path: `${x.cols}/${c}`, old: x.blk.columns[c] }); x.blk.rows.forEach((row, r) => ops.push({ op: 'delete', path: `${x.rows}/${r}/${c}`, old: row[c] })); }
  const rest = w0.filter((_, i) => !cs.includes(i));
  const sum = rest.reduce((a, b) => a + b, 0) || 1;
  ops.push(ceMember(x.blk, x.b, 'colWidths', rest.map((v) => +((v / sum) * 100).toFixed(2))));
  let merges = x.blk.merges || [];
  for (const c of cs) merges = shiftMerges(merges, 'col', c, -1);
  if (x.blk.merges?.length) ops.push(ceMember(x.blk, x.b, 'merges', merges));
  commit(ops, { ed: x.ed, mirror: true });
  lastCell = null;
  ceClearSel();
  ceJoin(x.ed, () => { for (const c of cs) ceFixFormulas(x, 'col', c, -1); });
};

// the page is redrawn by the structural commit: the cell that had the focus loses it, and its focusout must not recalculate the
// table in a commit of its own, before the references have followed (TCELLS-01: one user action, one undo step)
for (const k of ['rowAdd', 'rowDel', 'colAdd', 'colDel']) { const f = A[k]; A[k] = (...a) => { CE.busy = true; try { return f(...a); } finally { CE.busy = false; } }; }

/* ── formulas typed into a cell ─────────────────────────────────────────── */
/** A cell left after typing: '=…' becomes a formula (result shown), a changed value recalculates the formulas that read it. */
function ceFinish(td) {
  if (CE.busy) return;
  const tb = td.closest('table[data-b][data-rows]');
  if (!tb || !td.dataset.p) return;
  const tg = { ed: td.closest('main.bw-doc').dataset.locale, rows: tb.dataset.rows, b: ceTblPtr(tb) };
  const blk = ceBlk(tg.ed, tg.b);
  if (!Array.isArray(blk?.rows)) return;
  const r = +td.dataset.r, c = +td.dataset.c;
  const leaf = blk.rows[r]?.[c];
  if (leaf === undefined) return;
  const edits = new Map();
  const txt = textOf(leaf);
  if (isFormula(txt)) edits.set(ceKey(r, c), leafFromInput(isRich(leaf) ? { ...leaf, text: '' } : '', txt));
  else if (formulaOf(leaf) && CE.dirty === td.dataset.p) edits.set(ceKey(r, c), leafFromInput(leaf, txt)); // the formula was retyped as a value
  CE.dirty = null;
  // typing the formula and turning it into a formula are ONE undo step: the finishing ops join the typing group (ids stay unique)
  const e = cur(tg.ed), last = e.ops.at(-1), g = last?.id.split('.')[0];
  const join = last?.op === 'setText' && last.path === td.dataset.p;
  const n0 = e.ops.length;
  cePut(tg, edits); // an empty map still recalculates the table's formulas
  if (join) e.ops.slice(n0).forEach((op, k) => { op.id = `${g}.f${k}`; });
}
document.addEventListener('focusin', (e) => {
  const td = ceCellEl(e.target);
  if (!td) return;
  if (!CE.keep) { CE.sel.clear(); cePaint(); }
  const f = td.dataset.f;
  if (f && td.isContentEditable && !td.querySelector('li')) { // edit the formula, not its result
    td.textContent = f;
    const r = document.createRange(); r.selectNodeContents(td); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }
});
document.addEventListener('focusout', (e) => {
  const td = ceCellEl(e.target);
  if (td) ceFinish(td);
});
/* a cell with lines (a list, or Alt+Enter) keeps its line breaks; everything else takes the core path */
document.addEventListener('input', (e) => {
  const td = ceCellEl(e.target);
  if (!td) return;
  CE.dirty = td.dataset.p;
  const raw = td.innerText.replace(/ /g, ' ').replace(/\n+$/, '');
  if (!raw.includes('\n') && !td.querySelector('li')) return;
  e.stopImmediatePropagation();
  setText(td.dataset.p, raw, td.closest('main.bw-doc').dataset.locale);
}, true);

/* ── copy / cut / paste ──────────────────────────────────────────────────── */
function ceGrid(tg) {
  const { r0, r1, c0, c1 } = ceRect(tg.cells);
  const blk = ceBlk(tg.ed, tg.b);
  const leaves = [];
  for (let r = r0; r <= r1; r += 1) leaves.push(blk.rows.length > r ? blk.rows[r].slice(c0, c1 + 1) : []);
  return { r0, c0, leaves, tsv: toTsv(leaves.map((row) => row.map(textOf))) };
}
function ceCopy(e, cut) {
  if (!CE.sel.size || !ceTableEl()) return false;
  const tg = ceTarget();
  const g = ceGrid(tg);
  CE.clip = { tsv: g.tsv, leaves: g.leaves, r0: g.r0, c0: g.c0 };
  e.clipboardData?.setData('text/plain', g.tsv);
  e.preventDefault();
  if (cut) CE_ACT.clearValue();
  return true;
}
/** text (TSV) lands with its top-left on (r, c); inside the selection a single value fills every selected cell */
function cePaste(tg, r, c, text) {
  const blk = ceBlk(tg.ed, tg.b);
  const grid = parseTsv(text);
  const own = CE.clip && CE.clip.tsv === toTsv(grid) ? CE.clip : null; // our own copy keeps its format and formulas
  const w = Math.max(blk.columns?.length || 0, ...blk.rows.map((x) => x.length));
  const targets = tg.sel && tg.cells.length > 1 && grid.length === 1 && grid[0].length === 1 ? tg.cells : null;
  const need = targets ? 0 : r + grid.length - blk.rows.length;
  const ops = [];
  for (let k = 0; k < need; k += 1) ops.push({ op: 'insert', path: `${tg.rows}/-`, value: Array.from({ length: w }, () => '') });
  if (ops.length) { commit(ops, { ed: tg.ed, mirror: true }); }
  const edits = new Map();
  const cov = coveredOf(ceBlk(tg.ed, tg.b).merges || []);
  const put = (rr, cc, i, j) => {
    if (cc >= w || cov.has(ceKey(rr, cc))) return;
    const old = ceBlk(tg.ed, tg.b).rows[rr][cc];
    const src = own?.leaves[i]?.[j];
    let leaf;
    if (src !== undefined) {
      const f = formulaOf(src);
      leaf = f ? { ...src, style: { ...src.style, formula: shiftFormula(f, rr - own.r0, cc - own.c0) } } : src;
    } else leaf = leafFromInput(old, grid[i]?.[j] ?? '');
    edits.set(ceKey(rr, cc), leaf);
  };
  if (targets) for (const [rr, cc] of targets) put(rr, cc, 0, 0);
  else grid.forEach((row, i) => row.forEach((_, j) => put(r + i, c + j, i, j)));
  if (ops.length) ceJoin(tg.ed, () => cePut(tg, edits)); else cePut(tg, edits); // the rows a paste adds and the values are one undo step
  ceSet(targets || grid.flatMap((row, i) => row.map((_, j) => [r + i, c + j])).filter(([rr, cc]) => cc < w), tg);
}
document.addEventListener('copy', (e) => { ceCopy(e, false); });
document.addEventListener('cut', (e) => { ceCopy(e, true); });
document.addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text/plain') || '';
  if (CE.sel.size && ceTableEl()) {
    const tg = ceTarget();
    const { r0, c0 } = ceRect(tg.cells);
    e.preventDefault(); e.stopImmediatePropagation();
    cePaste(tg, r0, c0, text);
    return;
  }
  const td = ceCellEl(e.target);
  if (td && /[\t\n]/.test(text.replace(/\n$/, ''))) { // Excel-style block pasted into one cell: it spreads over the cells
    e.preventDefault(); e.stopImmediatePropagation();
    const tb = ceTblOf(td);
    cePaste({ ed: tb.ed, rows: tb.rows, b: tb.b, cells: [[+td.dataset.r, +td.dataset.c]], sel: false }, +td.dataset.r, +td.dataset.c, text);
  }
}, true);

/* ── selecting cells with the mouse ─────────────────────────────────────── */
const ceInUi = (e) => e.composedPath?.().some((x) => x === host);
function ceRange(tbl, a, b) {
  const cov = coveredOf(ceBlk(tbl.ed, tbl.b).merges || []);
  const out = [];
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r += 1) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c += 1) if (!cov.has(ceKey(r, c))) out.push([r, c]);
  return out;
}
const ceRC = (td) => ({ r: +td.dataset.r, c: +td.dataset.c });
document.addEventListener('mousedown', (e) => {
  if (e.button !== 0 || ceInUi(e)) return;
  const td = ceCellEl(e.target);
  if (!td) { if (CE.sel.size && !e.target.closest?.('#bw-ui-host')) ceClearSel(); return; }
  const tbl = ceTblOf(td);
  if (td.classList.contains('bw-fillh') && CE.sel.size) { // the corner handle: drag to fill
    const rc = td.getBoundingClientRect();
    if (e.clientX >= rc.right - 8 && e.clientX <= rc.right + 2 && e.clientY >= rc.bottom - 8 && e.clientY <= rc.bottom + 2) {
      e.preventDefault(); document.activeElement?.blur?.();
      CE.fill = { tbl };
      document.documentElement.classList.add('bw-csel-drag');
      return;
    }
  }
  if (CE.rz?.hover) { // a border: start resizing
    e.preventDefault();
    ceResizeStart(e, td, tbl);
    return;
  }
  const same = CE.anchor && CE.anchor.rows === tbl.rows && CE.anchor.ed === tbl.ed;
  if (e.shiftKey && same) {
    e.preventDefault();
    document.activeElement?.blur?.();
    CE.keep = true; ceSet(ceRange(tbl, CE.anchor, ceRC(td)), tbl); CE.keep = false;
  } else if ((e.ctrlKey || e.metaKey) && same) {
    e.preventDefault();
    document.activeElement?.blur?.();
    const rc = ceRC(td), k = ceKey(rc.r, rc.c);
    const cells = [...CE.sel].map((x) => x.split(',').map(Number));
    if (!CE.sel.size) cells.push([CE.anchor.r, CE.anchor.c]);
    const at = cells.findIndex(([r, c]) => ceKey(r, c) === k);
    if (at >= 0) cells.splice(at, 1); else cells.push([rc.r, rc.c]);
    CE.keep = true; ceSet(cells, tbl); CE.keep = false;
  } else {
    CE.anchor = { ...ceRC(td), rows: tbl.rows, ed: tbl.ed }; CE.head = null;
    CE.drag = { td, tbl };
    if (CE.sel.size) ceClearSel();
  }
}, true);
document.addEventListener('mousemove', (e) => {
  if (CE.fill) { // the target cell is shown by the cursor only; the fill itself lands on mouse-up
    const td = ceCellEl(e.target);
    if (td) CE.fill.to = ceRC(td);
    return;
  }
  if (CE.rz?.active) { ceResizeMove(e); return; }
  if (CE.drag && (e.buttons & 1)) {
    const td = ceCellEl(e.target);
    if (!td || td === CE.drag.td && !CE.sel.size) return;
    const tbl = ceTblOf(td);
    if (tbl.rows !== CE.drag.tbl.rows || tbl.ed !== CE.drag.tbl.ed) return;
    document.documentElement.classList.add('bw-csel-drag');
    document.activeElement?.blur?.();
    getSelection().removeAllRanges();
    CE.keep = true; ceSet(ceRange(tbl, CE.anchor, ceRC(td)), tbl); CE.keep = false;
    return;
  }
  if (e.buttons) return;
  // hovering a cell border: the resize cursor
  const td = ceCellEl(e.target);
  let hv = null;
  if (td) {
    const rc = td.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) <= 4;
    if (!td.colSpan || td.colSpan === 1) {
      if (near(e.clientX, rc.right)) hv = { kind: 'col', c: +td.dataset.c, sign: 1 };
      else if (near(e.clientX, rc.left)) hv = { kind: 'col', c: +td.dataset.c, sign: -1 };
    }
    if (!hv && (!td.rowSpan || td.rowSpan === 1)) {
      if (near(e.clientY, rc.bottom)) hv = { kind: 'row', r: +td.dataset.r };
      else if (near(e.clientY, rc.top) && +td.dataset.r > 0) hv = { kind: 'row', r: +td.dataset.r - 1 };
    }
  }
  CE.rz = hv ? { hover: hv } : null;
  document.documentElement.classList.toggle('bw-rz-col', hv?.kind === 'col');
  document.documentElement.classList.toggle('bw-rz-row', hv?.kind === 'row');
});
document.addEventListener('mouseup', () => {
  if (CE.fill) { const to = CE.fill.to; CE.fill = null; if (to) CE_ACT.fillTo(to.r, to.c); }
  if (CE.rz?.active) ceResizeEnd();
  CE.drag = null;
  document.documentElement.classList.remove('bw-csel-drag');
}, true);
function ceResizeStart(e, td, tbl) {
  const hv = CE.rz.hover;
  const tg = { ed: tbl.ed, rows: tbl.rows, b: tbl.b, el: tbl.el };
  const scale = tbl.el.getBoundingClientRect().width / tbl.el.offsetWidth || 1;
  const sameTable = CE.sel.size && CE.rows === tbl.rows && CE.ed === tbl.ed;
  const sel = sameTable ? [...CE.sel].map((k) => k.split(',').map(Number)) : [];
  if (hv.kind === 'col') {
    const widths = ceWidths(tg);
    const cols = sel.some((x) => x[1] === hv.c) ? [...new Set(sel.map((x) => x[1]))] : [hv.c];
    CE.rz = { active: true, hover: hv, tg, widths, cols, x0: e.clientX, w0: widths[hv.c], scale, tw: tbl.el.offsetWidth };
  } else {
    const blk = ceBlk(tbl.ed, tbl.b);
    const rows = sel.some((x) => x[0] === hv.r) ? [...new Set(sel.map((x) => x[0]))] : [hv.r];
    const tr = tbl.el.querySelector(`tbody tr[data-r="${hv.r}"]`);
    CE.rz = { active: true, hover: hv, tg, rows, y0: e.clientY, h0: (tr.offsetHeight * 25.4) / 96, scale, heights: Array.from({ length: blk.rows.length }, (_, i) => blk.rowHeights?.[i] ?? null) };
  }
}
function ceResizeMove(e) {
  const z = CE.rz;
  const el = z.tg.el;
  if (z.hover.kind === 'col') {
    const w = z.w0 + (z.hover.sign * (e.clientX - z.x0)) / z.scale / z.tw * 100;
    z.next = setWidths(z.widths, z.cols, w);
    const kept = [...new Set([...el.querySelectorAll('td[data-c], th[data-c]')].map((x) => +x.dataset.c))].sort((a, b) => a - b);
    const cg = [...el.querySelectorAll(':scope > colgroup > col')];
    kept.forEach((c, k) => { if (cg[k]) cg[k].style.width = `${z.next[c]}%`; });
  } else {
    const mm = Math.max(4, Math.min(400, z.h0 + ((e.clientY - z.y0) / z.scale) * 25.4 / 96));
    z.next = z.heights.slice();
    z.rows.forEach((r) => { z.next[r] = +mm.toFixed(1); });
    z.rows.forEach((r) => { const tr = el.querySelector(`tbody tr[data-r="${r}"]`); if (tr) tr.style.height = `${z.next[r]}mm`; });
  }
}
function ceResizeEnd() {
  const z = CE.rz;
  CE.rz = null;
  document.documentElement.classList.remove('bw-rz-col', 'bw-rz-row');
  if (!z.next) return;
  const blk = ceBlk(z.tg.ed, z.tg.b);
  commit([ceMember(blk, z.tg.b, z.hover.kind === 'col' ? 'colWidths' : 'rowHeights', z.next)], { ed: z.tg.ed, mirror: true });
}

/* ── the keyboard ───────────────────────────────────────────────────────── */
function ceKey_(e) {
  const t0 = e.composedPath?.()[0] || e.target;
  if (ceInUi(e) && /^(INPUT|TEXTAREA|SELECT)$/.test(t0.tagName || '')) return false;
  const editing = !!t0.isContentEditable;
  const td = ceCellEl(t0);
  if (CE.sel.size && !editing && ceTableEl()) {
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); CE_ACT.clearValue(); return true; }
    const fk = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && { b: 'fmtBold', i: 'fmtItalic', u: 'fmtUnderline' }[e.key.toLowerCase()]; // Ctrl+B / I / U on the selected cells (TCELLS-02)
    if (fk) { e.preventDefault(); CE_FMT[fk](); return true; }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault();
      const [r, c] = [...CE.sel][0].split(',');
      const el = ceTableEl().querySelector(`td[data-r="${r}"][data-c="${c}"]`);
      CE.keep = false; el?.focus();
      return true;
    }
    if (e.shiftKey && !e.ctrlKey && !e.altKey && /^Arrow(Left|Right|Up|Down)$/.test(e.key) && CE.anchor) { // extend the range from the anchor like Excel (the moving corner is CE.head)
      e.preventDefault();
      const tbl = { ed: CE.ed, rows: CE.rows, b: CE.b };
      const blk = ceBlk(tbl.ed, tbl.b);
      const rtl = ceTableEl().closest('main.bw-doc')?.dir === 'rtl' || getComputedStyle(ceTableEl()).direction === 'rtl';
      const dx = { ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1 }[e.key] || 0, dy = { ArrowUp: -1, ArrowDown: 1 }[e.key] || 0;
      const h = CE.head || (() => { const cs = [...CE.sel].map((k) => k.split(',').map(Number)); const q = ceRect(cs); return { r: q.r1, c: q.c1 }; })();
      CE.head = { r: Math.max(0, Math.min(blk.rows.length - 1, h.r + dy)), c: Math.max(0, Math.min((blk.rows[0]?.length || 1) - 1, h.c + dx)) };
      CE.keep = true; ceSet(ceRange(tbl, CE.anchor, CE.head), tbl); CE.keep = false;
      return true;
    }
    if (e.key === 'Escape') { ceClearSel(); return false; }
    return false;
  }
  if (td && editing) {
    if (e.key === 'Escape') { // leave the cell and keep it selected: Delete clears it, the tools act on it
      e.preventDefault();
      const tbl = ceTblOf(td), rc = ceRC(td);
      CE.anchor = { ...rc, rows: tbl.rows, ed: tbl.ed }; CE.head = null;
      t0.blur();
      CE.keep = true; ceSet([[rc.r, rc.c]], tbl); CE.keep = false;
      return true;
    }
    if (e.key === 'Enter' && !e.ctrlKey) {
      const leaf = get(cur(td.closest('main.bw-doc').dataset.locale).doc, td.dataset.p);
      if (listOf(leaf) || e.altKey) { // a new line (a new list item); a plain Enter still leaves the cell
        e.preventDefault();
        td.classList.add('bw-nl');
        document.execCommand('insertText', false, '\n');
        return true;
      }
    }
  }
  return false;
}

const CE_ICON = (d) => `<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
Object.assign(IC, {
  cellMerge: CE_ICON('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h5M16 12h5M8 9l-3 3 3 3M16 9l3 3-3 3"/>'),
  cellSplit: CE_ICON('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18M9 9l-3 3 3 3M15 9l3 3-3 3"/>'),
  cellWrap: CE_ICON('<path d="M3 5h18M3 12h14a3 3 0 0 1 0 6h-4M3 19h5"/><path d="m15 16-2 2 2 2"/>'),
  cellFill: CE_ICON('<path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0z"/><path d="m5 2 5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z"/>'),
  cellColW: CE_ICON('<path d="M3 5v14M21 5v14M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3"/>'),
  cellRowH: CE_ICON('<path d="M5 3h14M5 21h14M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3"/>'),
  cellClearValue: CE_ICON('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 9 6 6M15 9l-6 6"/>'),
  cellClearFormat: CE_ICON('<path d="M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5M20 15l-5 5"/>'),
});
bwExt({
  cmds: CE_IDS.map((id) => ({ id, group: 'table', edit: true })),
  actions: {
    ...Object.fromEntries(CE_IDS.map((id) => [id, (a) => CE_RUN[a](a)])),
    // while cells are selected the format bar acts on all of them; otherwise the caret/word path of 21-format.js
    // (a tool with no whole-cell meaning says so, rather than touching the last text range somewhere else)
    ...Object.fromEntries(W2_FMT_IDS.map((id) => { const prev = EXT.actions[id]; const f = CE_FMT[id]; return [id, (a) => (CE.sel.size && ceTableEl() ? (f ? f() : toast(t('ce.notForCells'), 'info')) : prev(a))]; })),
  },
  expose: { cells: { act: CE_ACT, state: CE, tools: () => CE_IDS, put: cePut, widths: ceWidths, finish: ceFinish, paste: cePaste, select: (cells, tbl) => ceSet(cells, tbl) } },
  on: {
    keydown: ceKey_,
    render: cePaint,
    open: () => { CE.sel.clear(); cePaint(); },
    boot: () => w2docCss('ce-css', 'html.bw-ed td.bw-csel{outline:2px solid var(--accent,#c8a96a);outline-offset:-2px;background-image:linear-gradient(rgba(200,169,106,.22),rgba(200,169,106,.22))}td.bw-fillh{position:relative}html.bw-ed td.bw-fillh::after{content:"";position:absolute;right:-1px;bottom:-1px;width:7px;height:7px;background:var(--accent,#c8a96a);border:1px solid #fff;cursor:crosshair}html.bw-csel-drag{user-select:none}html.bw-rz-col #bw-pair td{cursor:col-resize}html.bw-rz-row #bw-pair td{cursor:row-resize}html.bw-ed td.bw-nl{white-space:pre-line}html.bw-ed td.bw-cell-list li{white-space:pre-wrap}'),
  },
});
