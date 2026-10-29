/* WP2 · A15 A23 A24 — objects (0.13.0).
 * A15: the image picked on the page gets «التفاف النص» — Word's seven modes (inline, square, tight, through,
 *      top and bottom, behind, in front); one op each, undoable. inline = back into the flow as a shots block.
 * A23: Insert → «مربع نص»: doc.overlays[] {kind: 'text', text (a leaf, rich allowed), w, h, anchor, wrap, style}.
 * A24: Insert → «جدول» (rows × columns, a header row), «قسم», «فصل»; Ctrl+C / Ctrl+V of a whole block through the
 *      editor's own clipboard (localStorage bw:clip = {kind: 'bw-block', v: 1, block}), across documents and tabs. */
const W2_CLIP = 'bw:clip';
const w2ovEnsure = () => (w2doc().overlays ? [] : [{ op: 'replace', path: '/overlays', value: [], old: undefined }]);
/** Where a new object or block lands: after the selected block, else as the first block of the first section. */
const w2after = () => {
  const b = blockOf(S.sel?.b);
  if (b) return { arr: b.arr, at: b.i + 1, ptr: b.ptr };
  const s = w2sectionOf(S.sel?.p);
  const sec = s?.sec || (s ? `${s.ch}/sections/0` : '/chapters/0/sections/0');
  return { arr: `${sec}/blocks`, at: 0, ptr: null };
};
const W2_OBJECTS = {
  /** A24: rows × cols with a header row, after the selection (or first in the selected/empty section). */
  table(rows = 3, cols = 3, where = w2after()) {
    const L = I18N.doc[S.ed];
    const value = { kind: 'table', columns: Array.from({ length: cols }, (_, i) => `${t('w2.col')} ${i + 1}`), rows: Array.from({ length: Math.max(1, rows - 1) }, () => Array.from({ length: cols }, () => L.none || '—')) };
    commit([{ op: 'insert', path: `${where.arr}/${where.at}`, value }], { mirror: true });
    S.sel = { b: `${where.arr}/${where.at}`, p: null, ed: S.ed };
    paintSel();
    return `${where.arr}/${where.at}`;
  },
  section(chapterPtr) {
    const s = w2sectionOf(chapterPtr || S.sel?.b || S.sel?.p) || { ch: '/chapters/0' };
    return W2_LAYOUT.tocAdd(s.sec || s.ch);
  },
  chapter() {
    const d = w2doc();
    const s = w2sectionOf(S.sel?.b || S.sel?.p);
    const at = s ? +s.ch.split('/')[2] + 1 : d.chapters.length;
    const L = I18N.doc[S.ed];
    commit([{ op: 'insert', path: `/chapters/${at}`, value: { number: String(at + 1), title: L.newChapter || t('w2.newChapter'), sections: [{ number: `${at + 1}.1`, title: L.newSection || t('w2.newSection'), blocks: [{ kind: 'prose', paragraphs: [L.newParagraph] }] }] } }], { mirror: true });
    return true;
  },
  /** A23: a text box anchored to the selected block (it gains an id), in front of the text by default. */
  textBox(text, opts = {}) {
    // item 6: at the caret (or the start of the highlighted words); else the selected block; else the first one
    const spot = w2caretSpot();
    const where = (spot && blockOf(spot.ptr)) || blockOf(S.sel?.b) || blockOf(blocksInOrder(w2doc())[0]?.ptr);
    if (!where) return null;
    if (spot && where.ptr === spot.ptr) opts = { x: spot.x, y: spot.y, ...opts };
    const pre = w2ovEnsure();
    const anchor = w2blockId(where.ptr, pre);
    const o = { id: w2id('tb'), kind: 'text', text: text || t('w2.textBox'), mode: 'anchor', anchor, x: 0, y: 0, w: 60, h: 20, wrap: 'front', ...opts };
    commit([...pre, { op: 'insert', path: '/overlays/-', value: o }]);
    S.selOv = w2doc().overlays.length - 1;
    S.sel = null;
    paintSel(); refreshUi();
    return S.selOv;
  },
  /** A15: one op. inline turns the overlay into a shots block after its anchor (and back is "square"). */
  wrap(i, mode) {
    const d = w2doc();
    const o = (d.overlays || [])[i];
    if (!o || !WRAPS.includes(mode)) return false;
    if (mode === 'inline') {
      if (o.kind === 'text') return false;
      const at = blockOf(PM_anchor(d, o.anchor));
      if (!at) return false;
      commit([{ op: 'delete', path: `/overlays/${i}`, old: o }, { op: 'insert', path: `${at.arr}/${at.i + 1}`, value: { kind: 'shots', caption: o.caption || '', images: [o.src], width: Math.min(100, Math.round((o.w / 178) * 100)) } }]);
      S.selOv = null;
      return true;
    }
    const pre = [];
    let anchor = o.anchor;
    if (o.mode !== 'anchor') { const b = blockOf(S.sel?.b) || blockOf(blocksInOrder(d)[0].ptr); anchor = w2blockId(b.ptr, pre); }
    commit([...pre, { op: 'replace', path: `/overlays/${i}`, value: { ...o, mode: 'anchor', anchor, wrap: mode, x: o.mode === 'anchor' ? o.x : 0, y: o.mode === 'anchor' ? o.y : 0 }, old: o }]);
    return true;
  },
  /** review2 · 14: the way back from «مع النص». A one-picture shots block (what inline made) becomes an overlay again,
   *  anchored to the block before it (else after it), in the picked mode; one commit, undoable. */
  unInline(ptr, mode) {
    const b = blockOf(ptr);
    const d = w2doc();
    const blk = b && get(d, b.ptr);
    if (blk?.kind !== 'shots' || blk.images?.length !== 1 || mode === 'inline' || !WRAPS.includes(mode)) return false;
    const n = get(d, b.arr).length;
    const near = b.i > 0 ? `${b.arr}/${b.i - 1}` : b.i + 1 < n ? `${b.arr}/${b.i + 1}` : null;
    if (!near) return false;
    const pre = w2ovEnsure();
    const anchor = w2blockId(near, pre);
    const o = { id: w2id('im'), kind: 'image', src: blk.images[0], caption: blk.caption || '', mode: 'anchor', anchor, x: 0, y: 0, w: Math.round(((blk.width || 50) / 100) * 178), wrap: mode };
    commit([...pre, { op: 'delete', path: b.ptr, old: blk }, { op: 'insert', path: '/overlays/-', value: o }]);
    S.sel = null;
    S.selOv = w2doc().overlays.length - 1;
    paintSel(); refreshUi();
    return true;
  },
  copy(ptr = S.sel?.b) {
    const b = blockOf(ptr);
    if (!b) return false;
    const block = JSON.parse(JSON.stringify(get(w2doc(), b.ptr)));
    delete block.id; // a copy is a new block: anchors stay with the original
    ls.set(W2_CLIP, JSON.stringify({ kind: 'bw-block', v: 1, block }));
    toast(t('w2.copied'), 'ok');
    return true;
  },
  paste(where = w2after()) {
    let clip;
    try { clip = JSON.parse(ls.get(W2_CLIP) || 'null'); } catch { clip = null; }
    if (!clip || clip.kind !== 'bw-block' || clip.v !== 1 || !clip.block?.kind) return false;
    commit([{ op: 'insert', path: `${where.arr}/${where.at}`, value: clip.block }]);
    S.sel = { b: `${where.arr}/${where.at}`, p: null, ed: S.ed };
    paintSel();
    return true;
  },
};
/** The selected block is a picture in line (a one-image shots block): it keeps the wrap section, so it can go back out. */
const w2inlinePic = () => { const b = blockOf(S.sel?.b); const blk = b && get(w2doc(), b.ptr); return blk?.kind === 'shots' && blk.images?.length === 1; };
/** The wrap section applies: a picked picture or text box (not a logo), or a picture in line. */
const w2wrapOn = () => (S.selOv != null && !!(w2doc().overlays || [])[S.selOv] && (w2doc().overlays || [])[S.selOv].kind !== 'logo') || w2inlinePic();
const PM_anchor = (d, a) => pageModel(d).ids.get(String(a)) || a;
const W2_WRAP_IDS = WRAPS.map((w) => 'wrap' + w[0].toUpperCase() + w.slice(1));
async function w2objectAction(id) {
  if (id === 'insTable') {
    const v = await ask(t('w2.tablePrompt'), '3x3');
    const m = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(v || '');
    if (m) W2_OBJECTS.table(Math.min(60, +m[1]), Math.min(12, +m[2]));
    else if (v) toast(t('w2.badTable'), 'warn');
    return;
  }
  if (id === 'insSection') return W2_OBJECTS.section();
  if (id === 'insChapter') return W2_OBJECTS.chapter();
  if (id === 'insTextBox') return W2_OBJECTS.textBox();
  if (id === 'copyBlock') return W2_OBJECTS.copy();
  if (id === 'pasteBlock') return W2_OBJECTS.paste();
  const k = W2_WRAP_IDS.indexOf(id);
  if (k >= 0) {
    if (S.selOv == null && w2inlinePic()) { W2_OBJECTS.unInline(S.sel.b, WRAPS[k]); return; }
    if (S.selOv == null) { toast(t('w2.pickImage'), 'info'); return; }
    W2_OBJECTS.wrap(S.selOv, WRAPS[k]);
  }
}
bwExt({
  cmds: [
    ...['insTable', 'insSection', 'insChapter', 'insTextBox'].map((id) => ({ id, group: 'insert', edit: true })),
    { id: 'copyBlock', group: 'edit', key: 'Ctrl+C', edit: false }, { id: 'pasteBlock', group: 'edit', key: 'Ctrl+V', edit: true },
    ...W2_WRAP_IDS.map((id) => ({ id, group: 'wrap', edit: true })),
  ],
  actions: Object.fromEntries([...['insTable', 'insSection', 'insChapter', 'insTextBox', 'copyBlock', 'pasteBlock'], ...W2_WRAP_IDS].map((id) => [id, w2objectAction])),
  expose: { w2objects: W2_OBJECTS },
  on: {
    // Ctrl+C / Ctrl+V with a block selected and no text range: the whole block (text copy stays the browser's)
    keydown: (e) => {
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      const k = mod && e.key.toLowerCase();
      if (k !== 'c' && k !== 'v') return false;
      if (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') || e.composedPath?.().some((x) => x === host)) return false;
      if (!S.sel?.b) return false;
      if (k === 'c' && !getSelection().isCollapsed && getSelection().toString()) return false;
      const done = k === 'c' ? W2_OBJECTS.copy() : W2_OBJECTS.paste();
      if (done) e.preventDefault();
      return done;
    },
    render: () => {
      w2showSection('wrap', w2wrapOn());
      document.querySelectorAll('#bw-pair .bw-ovf').forEach((el) => { el.tabIndex = 0; if (+el.dataset.i === S.selOv) el.classList.add('bw-ov-sel'); });
    },
    boot: () => {
      w2showSection('wrap', false);
      w2docCss('w2-obj-css', '@media screen{html.bw-ed .bw-ovf{cursor:pointer}html.bw-ed .bw-ovf.bw-ov-sel,html.bw-ed .bw-ov.bw-ov-sel{outline:2px solid var(--primary)}}');
    },
  },
});
// an in-flow image (square / tight / through / top and bottom) is picked by a click, as the free ones are
document.addEventListener('click', (e) => {
  const el = e.target.closest?.('#bw-pair .bw-ovf');
  if (!el || e.target.closest('[data-p]')) { if (e.target.closest?.('#bw-pair')) queueMicrotask(() => w2showSection('wrap', w2wrapOn())); return; }
  S.selOv = +el.dataset.i; S.sel = null; paintSel(); refreshUi();
  w2showSection('wrap', true);
});
document.addEventListener('focusin', () => w2showSection('wrap', w2wrapOn()));
// review2 · 14: a picture behind the text sits under the words, so a plain click lands on the text. Alt+click (as Word's
// «تحديد الكائنات») or a click where no words are picks it; Tab reaches it too (every overlay is focusable).
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest?.('#bw-pair .bw-ov') || !e.target.closest?.('#bw-pair')) return;
  if (!e.altKey && e.target.closest('[data-p]')) return;
  const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.matches?.('#bw-pair .bw-ov.bw-behind'));
  if (!el) return;
  e.preventDefault(); e.stopPropagation();
  w2behindClick = true; // the click that follows is this pick's, not a press on the words above it
  el.focus(); // the editor's focusin picks it (S.selOv), as a click on a free image does
}, true);
let w2behindClick = false;
document.addEventListener('click', (e) => { if (w2behindClick) { w2behindClick = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// review2 · extra 10: a double-click on a text box puts the caret in its words
document.addEventListener('dblclick', (e) => {
  const box = e.target.closest?.('#bw-pair .bw-ov.bw-tb');
  const body = box?.querySelector('.bw-tb-body[data-p]');
  if (!body || e.target.closest('.bw-ov-handle, .bw-ov-move')) return;
  if (!body.hasAttribute('tabindex')) body.tabIndex = -1;
  body.focus(); // the editor's focusin makes it editable and puts the caret at the end
});
