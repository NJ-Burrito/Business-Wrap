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
document.addEventListener('selectionchange', () => {
  const s = getSelection();
  if (!s.rangeCount) return;
  const el = w2leafEl(s.anchorNode);
  if (!el || !el.contains(s.focusNode)) return; // a click in the toolbar keeps the last range
  const a = w2offset(el, s.anchorNode, s.anchorOffset);
  const b = w2offset(el, s.focusNode, s.focusOffset);
  W2F.at = { path: el.dataset.p, ed: el.closest('main.bw-doc').dataset.locale, start: Math.min(a, b), end: Math.max(a, b) };
  w2showSection('format', W2F.leaf() != null);
});
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
  commit([{ op: 'replace', path, value: next, old }], { ed });
  return true;
}
const W2_FORMAT = {
  /** at = {path, start, end, ed?}: the range to work on (tests and the keyboard set it directly). */
  select(at) { W2F.at = { ed: S.ed, ...at }; return W2F.leaf() != null; },
  mark(type, value) {
    const leaf = W2F.leaf();
    if (leaf == null) return false;
    const [a, b] = w2range(leaf);
    const on = value != null || !hasMark(leaf, a, b, type);
    return w2put(markLeaf(leaf, a, b, type, value, on), leaf);
  },
  clear() {
    const leaf = W2F.leaf();
    if (!isRich(leaf)) return false;
    const [a, b] = w2range(leaf);
    let next = leaf;
    for (const ty of MARK_TYPES) next = markLeaf(next, a, b, ty, null, false);
    return w2put(next, leaf);
  },
  style(patch) {
    const leaf = W2F.leaf();
    if (leaf == null) return false;
    return w2put(styleLeaf(leaf, patch), leaf);
  },
  list(kind) {
    const leaf = W2F.leaf();
    if (leaf == null) return false;
    const st = isRich(leaf) ? leaf.style || {} : {};
    return w2put(styleLeaf(leaf, st.list === kind ? { list: null, level: null } : { list: kind, level: st.level || 0 }), leaf);
  },
  indent(d) {
    const leaf = W2F.leaf();
    if (!isRich(leaf) || !leaf.style?.list) return false;
    return w2put(styleLeaf(leaf, { level: Math.max(0, Math.min(8, (leaf.style.level || 0) + d)) }), leaf);
  },
};
const W2_TOGGLES = { fmtBold: 'b', fmtItalic: 'i', fmtUnderline: 'u', fmtStrike: 's', fmtCode: 'code' };
async function w2formatAction(id) {
  if (W2F.leaf() == null) { toast(t('w2.pickText'), 'info'); return; }
  if (W2_TOGGLES[id]) return W2_FORMAT.mark(W2_TOGGLES[id]);
  const st = isRich(W2F.leaf()) ? W2F.leaf().style || {} : {};
  switch (id) {
    case 'fmtLink': { const v = await ask(t('w2.linkPrompt'), 'https://'); if (/^(https?:\/\/|mailto:)\S+$/i.test(v)) W2_FORMAT.mark('link', v); else if (v) toast(t('w2.badLink'), 'warn'); return; }
    case 'fmtColor': { const v = await ask(t('w2.colorPrompt'), S.theme.vars?.primary || '#000000'); if (/^#[0-9a-f]{6}$/i.test(v)) W2_FORMAT.mark('color', v); else if (v) toast(t('w2.badColor'), 'warn'); return; }
    case 'fmtFont': { const i = (FONT_FAMILIES.indexOf(st.font) + 1) % FONT_FAMILIES.length; const v = await ask(t('w2.fontPrompt'), FONT_FAMILIES[i]); if (FONT_FAMILIES.includes(v)) W2_FORMAT.mark('font', v); else if (v) toast(t('w2.badFont'), 'warn'); return; }
    case 'fmtSize': { const v = +(await ask(t('w2.sizePrompt'), '12')); if (v >= 5 && v <= 72) W2_FORMAT.mark('size', v); return; }
    case 'fmtClear': return W2_FORMAT.clear();
    case 'fmtAlignStart': case 'fmtAlignCenter': case 'fmtAlignEnd': case 'fmtJustify':
      return W2_FORMAT.style({ align: { fmtAlignStart: 'start', fmtAlignCenter: 'center', fmtAlignEnd: 'end', fmtJustify: 'justify' }[id] });
    case 'fmtTop': case 'fmtMiddle': case 'fmtBottom': return W2_FORMAT.style({ valign: id.slice(3).toLowerCase() });
    case 'fmtLine': { const v = +(await ask(t('w2.linePrompt'), String(st.lineHeight || 1.8))); if (v >= 0.8 && v <= 4) W2_FORMAT.style({ lineHeight: v }); return; }
    case 'fmtBefore': case 'fmtAfter': { const k = id === 'fmtBefore' ? 'spaceBefore' : 'spaceAfter'; const v = await ask(t('w2.spacePrompt'), String(st[k] ?? 0)); if (v !== '' && +v >= 0 && +v <= 60) W2_FORMAT.style({ [k]: +v }); return; }
    case 'fmtQuote': return W2_FORMAT.style({ quote: st.quote ? null : true });
    case 'fmtBullets': return W2_FORMAT.list('bullet');
    case 'fmtNumbers': return W2_FORMAT.list('number');
    case 'fmtShapes': { const v = await ask(t('w2.shapePrompt'), '◦'); if (v && '•◦▪–✓➤'.includes(v)) W2_FORMAT.list('shape:' + v); return; }
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
      w2formatAction(k);
      return true;
    },
    render: () => {
      w2showSection('format', W2F.leaf() != null);
      // the range comes back after the re-render, so the next tool works on the same words
      const at = W2F.at;
      const el = at && mainOf(at.ed)?.querySelector(`[data-p="${CSS.escape(at.path)}"]`);
      if (!el || document.activeElement?.closest?.('#bw-pair') !== el) return;
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
