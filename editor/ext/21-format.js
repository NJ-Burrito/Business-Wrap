/* WP2 · A26 — the selection format bar «تنسيق» (0.13.0).
 * Shown while there is a text range (or a caret) inside an editable leaf. Every tool is ONE op: the leaf is replaced
 * by its rich form ({text, marks, style}, engine/edits.mjs markLeaf / styleLeaf); typing keeps the marks (setText
 * rebases them). The range is remembered as character offsets of the leaf's words, so a toolbar click (which moves
 * the focus) still knows what was selected. Fonts: the Thmanyah families only. */
const W2F = { at: null }; // {path, ed, start, end}

/** Character offset of (node, off) inside a leaf element, counted over the leaf's own words (data-pfx included). */
function w2offset(el, node, off) {
  const r = document.createRange();
  r.selectNodeContents(el);
  try { r.setEnd(node, off); } catch { return 0; }
  return (el.dataset.pfx || '').length + r.toString().length;
}
function w2leafEl(n) {
  const el = (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('#bw-pair main.bw-doc [data-p]');
  return el && !el.closest('.w2-strip') ? el : null;
}
/** Item 6: every text leaf a highlighted range touches (several paragraphs, a run of cells). Remembered, so a toolbar click that
 *  moves the focus still acts on all of them; a caret or a range inside one leaf clears it (then W2F.at is the one target). */
function w2multi(s) {
  const main = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement)?.closest?.('#bw-pair main.bw-doc');
  if (!main) return;
  if (s.isCollapsed) { W2F.multi = null; return; }
  const r = s.getRangeAt(0);
  const hits = [...main.querySelectorAll('[data-p]')].filter((el) => !el.closest('.w2-strip') && r.intersectsNode(el) && !/^\/labels\//.test(el.dataset.p));
  W2F.multi = hits.length > 1 ? hits.map((el) => ({ path: el.dataset.p, ed: main.dataset.locale })) : null;
}
/** The leaves a block tool acts on: the highlighted ones, else the caret's leaf. */
W2F.targets = () => {
  const ed0 = W2F.at?.ed;
  const list = (W2F.multi || (W2F.at ? [{ path: W2F.at.path, ed: W2F.at.ed }] : [])).filter((x) => M[S.svc]?.[x.ed]);
  return list.map((x) => ({ ...x, leaf: get(cur(x.ed).doc, x.path) })).filter((x) => typeof x.leaf === 'string' || isRich(x.leaf)).filter((x) => x.ed === (list[0]?.ed ?? ed0));
};
/** Item 6: where the caret (or the start of the highlighted range) is: its block and the offset inside it, in mm. */
function w2caretSpot() {
  const at = W2F.at;
  if (!at) return null;
  const main = mainOf(at.ed);
  const leaf = main?.querySelector(`[data-p="${CSS.escape(at.path)}"]`);
  const blk = leaf?.closest('[data-b]');
  const m = /^(.*\/blocks\/\d+)/.exec(at.path);
  if (!blk || !m) return m ? { ptr: m[1], x: 0, y: 0 } : null;
  let rect = leaf.getBoundingClientRect();
  const s = getSelection();
  if (s.rangeCount && leaf.contains(s.anchorNode)) { const rr = s.getRangeAt(0).cloneRange(); rr.collapse(true); const q = rr.getClientRects()[0]; if (q) rect = q; }
  const br = blk.getBoundingClientRect();
  const k = (br.width / (blk.offsetWidth || br.width || 1)) * (96 / 25.4); // screen px per mm, zoom included
  const clamp = (v) => Math.max(0, Math.min(150, +v.toFixed(1)));
  return { ptr: m[1], x: clamp((rect.left - br.left) / k), y: clamp((rect.top - br.top) / k) };
}

/** The live selection, when it lies in one leaf, becomes the range to work on (also read right before a shortcut acts:
 *  Ctrl+A then Ctrl+B can come before the selectionchange event). */
function w2sync() {
  const s = getSelection();
  if (!s.rangeCount) return false;
  w2multi(s);
  if (W2F.multi) { // a range over several leaves: the first one stands for it in the toolbar; block tools (lists) use all of them
    const f = W2F.multi[0];
    W2F.at = { path: f.path, ed: f.ed, start: 0, end: textOf(get(cur(f.ed).doc, f.path)).length };
    return true;
  }
  const el = w2leafEl(s.anchorNode);
  if (!el || !el.contains(s.focusNode)) return false; // a click in the toolbar keeps the last range
  const a = w2offset(el, s.anchorNode, s.anchorOffset);
  const b = w2offset(el, s.focusNode, s.focusOffset);
  W2F.at = { path: el.dataset.p, ed: el.closest('main.bw-doc').dataset.locale, start: Math.min(a, b), end: Math.max(a, b) };
  return true;
}
document.addEventListener('selectionchange', () => { if (w2sync()) w2showSection('format', W2F.leaf() != null); });
W2F.leaf = () => {
  if (!W2F.at || /^\/labels\//.test(W2F.at.path) || !M[S.svc][W2F.at.ed]) return null;
  const v = get(cur(W2F.at.ed).doc, W2F.at.path);
  return typeof v === 'string' || isRich(v) ? v : null;
};
/** The words the range covers; a caret means the word around it. */
function w2range(leaf) {
  const text = textOf(leaf);
  let { start, end } = W2F.at;
  if (start === end) {
    while (start > 0 && /\S/.test(text[start - 1])) start -= 1;
    while (end < text.length && /\S/.test(text[end])) end += 1;
  }
  return [start, end];
}
function w2put(next, old) {
  const { path, ed } = W2F.at;
  if (JSON.stringify(next) === JSON.stringify(old)) return false;
  W2F.keep = true; // the re-render puts the same range back (and the focus, which the re-render drops), so the next tool works on it
  commit([{ op: 'replace', path, value: next, old }], { ed });
  return true;
}
const W2_FORMAT = {
  /** at = {path, start, end, ed?}: the range to work on (tests and the keyboard set it directly). */
  select(at) { W2F.at = { ed: S.ed, ...at }; return W2F.leaf() != null; },
  /** Several highlighted leaves (paragraphs, a run of cells): every one is worked on, whole; else the caret's leaf and its range. */
  each() {
    if (W2F.multi) return W2F.targets().map((x) => ({ ...x, range: [0, textOf(x.leaf).length] }));
    const leaf = W2F.leaf();
    return leaf == null ? [] : [{ path: W2F.at.path, ed: W2F.at.ed, leaf, range: w2range(leaf) }];
  },
  put(tg, fn) {
    const ops = tg.map((x) => ({ op: 'replace', path: x.path, value: fn(x), old: x.leaf })).filter((o) => JSON.stringify(o.value) !== JSON.stringify(o.old));
    if (!ops.length) return false;
    W2F.keep = true; // the re-render puts the same range back (and the focus, which the re-render drops), so the next tool works on it
    commit(ops, { ed: tg[0].ed });
    return true;
  },
  mark(type, value) {
    const tg = W2_FORMAT.each();
    if (!tg.length) return false;
    const on = value != null || !tg.every((x) => hasMark(x.leaf, ...x.range, type));
    return W2_FORMAT.put(tg, (x) => markLeaf(x.leaf, ...x.range, type, value, on));
  },
  clear() {
    const tg = W2_FORMAT.each().filter((x) => isRich(x.leaf));
    if (!tg.length) return false;
    return W2_FORMAT.put(tg, (x) => MARK_TYPES.reduce((n, ty) => markLeaf(n, ...x.range, ty, null, false), x.leaf));
  },
  style(patch) {
    const tg = W2_FORMAT.each();
    return tg.length ? W2_FORMAT.put(tg, (x) => styleLeaf(x.leaf, patch)) : false;
  },
  list(kind) {
    const tg = W2F.targets();
    if (!tg.length) return false;
    const styleOf = (x) => (isRich(x.leaf) ? x.leaf.style || {} : {});
    const off = tg.every((x) => styleOf(x).list === kind); // all already in this list: the tool turns it off
    const ops = tg.map((x) => ({ op: 'replace', path: x.path, value: styleLeaf(x.leaf, off ? { list: null, level: null } : { list: kind, level: styleOf(x).level || 0 }), old: x.leaf }));
    W2F.keep = true;
    commit(ops, { ed: tg[0].ed });
    return true;
  },
  indent(d) {
    const leaf = W2F.leaf();
    if (!isRich(leaf) || !leaf.style?.list) return false;
    return w2put(styleLeaf(leaf, { level: Math.max(0, Math.min(8, (leaf.style.level || 0) + d)) }), leaf);
  },
};
const W2_TOGGLES = { fmtBold: 'b', fmtItalic: 'i', fmtUnderline: 'u', fmtStrike: 's', fmtCode: 'code' };
async function w2formatAction(id) {
  if (W2F.leaf() == null && !W2F.multi) { toast(t('w2.pickText'), 'info'); return; }
  if (W2_TOGGLES[id]) return W2_FORMAT.mark(W2_TOGGLES[id]);
  const st = isRich(W2F.leaf()) ? W2F.leaf().style || {} : {};
  switch (id) {
    case 'fmtLink': { const v = await ask(t('w2.linkPrompt'), 'https://'); if (/^(https?:\/\/|mailto:)\S+$/i.test(v)) W2_FORMAT.mark('link', v); else if (v) toast(t('w2.badLink'), 'warn'); return; }
    case 'fmtColor': { const v = await ask(t('w2.colorPrompt'), st.color || S.theme.vars?.primary || '#000000', { type: 'color' }); if (/^#[0-9a-f]{6}$/i.test(v)) W2_FORMAT.mark('color', v); else if (v) toast(t('w2.badColor'), 'warn'); return; }
    case 'fmtFont': { const v = await ask(t('w2.fontPrompt'), FONT_FAMILIES.includes(st.font) ? st.font : FONT_FAMILIES[0], { type: 'select', options: FONT_FAMILIES }); if (FONT_FAMILIES.includes(v)) W2_FORMAT.mark('font', v); else if (v) toast(t('w2.badFont'), 'warn'); return; }
    case 'fmtSize': { const v = +(await ask(t('w2.sizePrompt'), String(st.size || 12), { type: 'number', min: 5, max: 72, step: 1 })); if (v >= 5 && v <= 72) W2_FORMAT.mark('size', v); return; }
    case 'fmtClear': return W2_FORMAT.clear();
    case 'fmtAlignStart': case 'fmtAlignCenter': case 'fmtAlignEnd': case 'fmtJustify':
      return W2_FORMAT.style({ align: { fmtAlignStart: 'start', fmtAlignCenter: 'center', fmtAlignEnd: 'end', fmtJustify: 'justify' }[id] });
    case 'fmtTop': case 'fmtMiddle': case 'fmtBottom': return W2_FORMAT.style({ valign: id.slice(3).toLowerCase() });
    case 'fmtLine': { const v = +(await ask(t('w2.linePrompt'), String(st.lineHeight || 1.8), { type: 'number', min: 0.8, max: 4, step: 0.1 })); if (v >= 0.8 && v <= 4) W2_FORMAT.style({ lineHeight: v }); return; }
    case 'fmtBefore': case 'fmtAfter': { const k = id === 'fmtBefore' ? 'spaceBefore' : 'spaceAfter'; const v = await ask(t('w2.spacePrompt'), String(st[k] ?? 0), { type: 'number', min: 0, max: 60, step: 1 }); if (v !== '' && +v >= 0 && +v <= 60) W2_FORMAT.style({ [k]: +v }); return; }
    case 'fmtQuote': return W2_FORMAT.style({ quote: st.quote ? null : true });
    case 'fmtBullets': return W2_FORMAT.list('bullet');
    case 'fmtNumbers': return W2_FORMAT.list('number');
    case 'fmtShapes': { const v = await ask(t('w2.shapePrompt'), '◦', { type: 'select', options: [...'•◦▪–✓➤'] }); if (v && '•◦▪–✓➤'.includes(v)) W2_FORMAT.list('shape:' + v); return; }
    case 'fmtIndent': return W2_FORMAT.indent(1);
    case 'fmtOutdent': return W2_FORMAT.indent(-1);
    default:
  }
}
const W2_FMT_IDS = ['fmtBold', 'fmtItalic', 'fmtUnderline', 'fmtStrike', 'fmtCode', 'fmtLink', 'fmtColor', 'fmtFont', 'fmtSize', 'fmtClear', 'fmtAlignStart', 'fmtAlignCenter', 'fmtAlignEnd', 'fmtJustify', 'fmtTop', 'fmtMiddle', 'fmtBottom', 'fmtLine', 'fmtBefore', 'fmtAfter', 'fmtQuote', 'fmtBullets', 'fmtNumbers', 'fmtShapes', 'fmtIndent', 'fmtOutdent'];
const W2_KEYS = { b: 'fmtBold', i: 'fmtItalic', u: 'fmtUnderline' };
bwExt({
  cmds: W2_FMT_IDS.map((id) => ({ id, group: 'format', edit: true, ...({ fmtBold: { key: 'Ctrl+B' }, fmtItalic: { key: 'Ctrl+I' }, fmtUnderline: { key: 'Ctrl+U' } }[id] || {}) })),
  actions: Object.fromEntries(W2_FMT_IDS.map((id) => [id, w2formatAction])),
  expose: { w2format: W2_FORMAT },
  on: {
    // Ctrl+B / I / U inside a leaf: one op, the browser's own (HTML) formatting never runs
    keydown: (e) => {
      const k = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && W2_KEYS[e.key.toLowerCase()];
      if (!k || !w2leafEl(e.target)) return false;
      e.preventDefault();
      w2sync();
      w2formatAction(k);
      return true;
    },
    render: () => {
      // a block tool over several leaves (lists) re-renders the page: the same range is put back, so the tool can be pressed again
      if (W2F.multi && W2F.keep) {
        const m = mainOf(W2F.multi[0].ed);
        const els = W2F.multi.map((x) => m?.querySelector(`[data-p="${CSS.escape(x.path)}"]`)).filter(Boolean);
        if (els.length > 1) { const r = document.createRange(); r.setStartBefore(els[0]); r.setEndAfter(els.at(-1)); getSelection().removeAllRanges(); getSelection().addRange(r); W2F.keep = false; w2showSection('format', true); return; }
      }
      w2showSection('format', W2F.leaf() != null);
      // the range comes back after the re-render, so the next tool works on the same words
      const at = W2F.at;
      const el = at && mainOf(at.ed)?.querySelector(`[data-p="${CSS.escape(at.path)}"]`);
      const keep = W2F.keep;
      W2F.keep = false;
      if (!el) return;
      const act = document.activeElement;
      // a format tool's own re-render (extras2 #9: after Ctrl+A → Ctrl+B the focus fell to <body>, the range to a caret and the
      // next tool coloured one word): the leaf gets the focus back when the page lost it; otherwise only a focused leaf
      if (keep && (!act || act === document.body)) (el.closest('[contenteditable="true"], [contenteditable="plaintext-only"]') || el).focus({ preventScroll: true });
      else if (!keep && act?.closest?.('#bw-pair') !== el) return;
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n = 0, node, startN, startO, endN, endO;
      const pfx = (el.dataset.pfx || '').length;
      while ((node = walk.nextNode())) {
        const len = node.data.length;
        if (startN == null && at.start - pfx <= n + len) { startN = node; startO = Math.max(0, at.start - pfx - n); }
        if (endN == null && at.end - pfx <= n + len) { endN = node; endO = Math.max(0, at.end - pfx - n); }
        n += len;
      }
      if (startN && endN) { const r = document.createRange(); r.setStart(startN, startO); r.setEnd(endN, endO); getSelection().removeAllRanges(); getSelection().addRange(r); }
    },
    boot: () => {
      w2showSection('format', false);
      w2docCss('w2-fmt-css', 'html.bw-ed a.bw-link{pointer-events:none}');
    },
  },
});
