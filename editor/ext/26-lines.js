/* Lane page-lines (0.14.0) · P1 — click on any empty place of a page, like Word.
 * A click on the empty page (not on a block, a picture or a drawing) puts a line caret at the NEAREST LINE SLOT: a place between two
 * blocks of the section (before the first, after the last). From there, with no text field focused:
 *   Enter     adds an empty line (a blank prose block, in both editions) at the caret, pushing the content down; the caret goes below it;
 *   Backspace removes the empty line just above the caret, Delete the one just below it, pulling the content up (a line that holds
 *             words, a picture anchor or a page setting is never removed this way);
 *   a letter  starts a paragraph there (click and type), in this edition; the other edition gets an empty line, so the pair keeps its shape;
 *   Up / Down moves the caret one block; Esc leaves it.
 * Insert (picture, logo, table, diagram, paragraph, text box …) lands AT the caret, not at the top or the end (runAction is wrapped).
 * Every change is one commit with mirror: true, so one undo step, and both editions keep the same structure.
 * An empty line prints: render.mjs gives an empty paragraph a <br>, and the DOCX writes an empty paragraph. No new schema. */
const LN = { at: null, focus: null }; // at: {ed, arr, at} = the slot "before block <arr>/<at>"
const LN_BLOCK = /^(\/chapters\/\d+\/sections\/\d+\/blocks)\/(\d+)$/;
/** A blank line = a prose block with only empty paragraphs and nothing else hanging on it (no id for an anchor, no layout). */
const lnBlank = (b) => !!b && b.kind === 'prose' && !b.id && !b.layout && Array.isArray(b.paragraphs) && b.paragraphs.length > 0
  && b.paragraphs.every((p) => typeof p === 'string' && !p.trim()) && Object.keys(b).every((k) => k === 'kind' || k === 'paragraphs');
const lnBlankValue = () => ({ kind: 'prose', paragraphs: [''] });
/** The blocks drawn in `main`, in reading order, with their vertical extent: [{arr, i, ptr, top, bottom}]. */
function lnBlocks(main) {
  const seen = new Map();
  for (const el of main.querySelectorAll('[data-b]')) {
    const m = LN_BLOCK.exec(el.dataset.b);
    if (!m || el.closest('.bw-ln-caret, .bw-ruler, template')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const x = seen.get(el.dataset.b);
    if (x) { x.top = Math.min(x.top, r.top); x.bottom = Math.max(x.bottom, r.bottom); } else seen.set(el.dataset.b, { arr: m[1], i: +m[2], ptr: el.dataset.b, top: r.top, bottom: r.bottom });
  }
  return [...seen.values()];
}
/** The nearest slot to the page y (client px). */
function lnSlotAt(main, y) {
  const list = lnBlocks(main);
  if (!list.length) return null;
  for (let k = 0; k < list.length; k += 1) {
    const x = list[k];
    if (y >= (x.top + x.bottom) / 2) continue;
    const prev = list[k - 1];
    if (prev && prev.arr !== x.arr && y - prev.bottom < x.top - y) return { arr: prev.arr, at: prev.i + 1 }; // between two sections: the nearer end
    return { arr: x.arr, at: x.i };
  }
  const last = list.at(-1);
  return { arr: last.arr, at: last.i + 1 };
}
/** The slot is still a place in the open document (a render, an undo or a delete may have moved it). */
function lnValid() {
  const a = LN.at;
  if (!a) return false;
  const arr = cur(a.ed)?.doc && get(cur(a.ed).doc, a.arr);
  if (!Array.isArray(arr) || a.at < 0 || a.at > arr.length) return false;
  return true;
}
function lnPaint() {
  document.querySelectorAll('.bw-ln-caret').forEach((x) => x.remove());
  if (LN.at && !lnValid()) LN.at = null;
  const a = LN.at;
  if (!a) return;
  const main = mainOf(a.ed);
  if (!main) return;
  const mk = () => { const d = document.createElement('div'); d.className = 'bw-ln-caret'; d.contentEditable = 'false'; d.setAttribute('aria-hidden', 'true'); d.dataset.slot = `${a.arr}/${a.at}`; return d; };
  const group = (ptr) => [...main.querySelectorAll(`[data-b="${CSS.escape(ptr)}"]`)].filter((x) => !x.closest('.bw-ln-caret, template'));
  const next = group(`${a.arr}/${a.at}`)[0];
  if (next) { (next.closest('ul, ol') || next).before(mk()); return; }
  const prevs = a.at > 0 ? group(`${a.arr}/${a.at - 1}`) : [];
  const last = prevs.at(-1);
  if (last) { (last.closest('ul, ol') || last).after(mk()); return; }
  // an empty section: the caret sits at the section's end
  const sec = main.querySelector(`[data-sec="${CSS.escape(a.arr.replace(/\/blocks$/, ''))}"]`);
  if (sec) sec.append(mk());
}
const lnSet = (slot) => { LN.at = slot; lnPaint(); };
function lnEdit(ops, extra = {}) {
  S.typingGroup = null;
  const a = extra.slot || LN.at;
  delete extra.slot;
  commit(ops, { ed: a.ed, mirror: true, ...extra });
}
const lnBothBlank = (a, i) => {
  // the other edition must hold a blank line (or nothing) at the same place, or the delete would take its words
  if (!(S.both && hasOther())) return true;
  const o = get(cur(other(a.ed)).doc, `${a.arr}/${i}`);
  return o === undefined || lnBlank(o);
};
const LN_API = {
  get slot() { return LN.at && { ...LN.at }; },
  /** Put the caret at the slot before block arr/at (tests, keyboard). */
  place(arr, at, ed = S.ed) { if (ed !== S.ed) { S.ed = ed; document.documentElement.lang = ed; } S.sel = null; S.selOv = null; paintSel(); lnSet({ ed, arr, at }); return LN.at; },
  clear() { lnSet(null); },
  /** Enter: n empty lines at the caret; the caret goes below them. */
  enter(n = 1) {
    if (!lnValid()) return false;
    const a = LN.at;
    const ops = Array.from({ length: n }, (_, k) => ({ op: 'insert', path: `${a.arr}/${a.at + k}`, value: lnBlankValue() }));
    lnEdit(ops);
    LN.at = { ...a, at: a.at + n };
    lnPaint();
    return true;
  },
  /** Backspace: the empty line above the caret goes. */
  back() {
    if (!lnValid()) return false;
    const a = LN.at;
    const prev = a.at > 0 ? get(cur(a.ed).doc, `${a.arr}/${a.at - 1}`) : undefined;
    if (!lnBlank(prev) || !lnBothBlank(a, a.at - 1)) { toast(t('ln.noLineAbove'), 'info'); return false; }
    lnEdit([{ op: 'delete', path: `${a.arr}/${a.at - 1}`, old: prev }]);
    LN.at = { ...a, at: a.at - 1 };
    lnPaint();
    return true;
  },
  /** Delete: the empty line below the caret goes. */
  del() {
    if (!lnValid()) return false;
    const a = LN.at;
    const next = get(cur(a.ed).doc, `${a.arr}/${a.at}`);
    if (!lnBlank(next) || !lnBothBlank(a, a.at)) { toast(t('ln.noLineBelow'), 'info'); return false; }
    lnEdit([{ op: 'delete', path: `${a.arr}/${a.at}`, old: next }]);
    lnPaint();
    return true;
  },
  /** Click and type: a paragraph with `text` at the caret (the other edition gets an empty line). */
  type(text) {
    if (!lnValid()) return false;
    const a = LN.at;
    LN.focus = { ed: a.ed, path: `${a.arr}/${a.at}/paragraphs/0` }; // read by the render this commit causes
    LN.at = null;
    lnEdit([{ op: 'insert', path: `${a.arr}/${a.at}`, value: { kind: 'prose', paragraphs: [text] }, mirrorValue: lnBlankValue() }], { slot: a });
    lnPaint();
    return `${a.arr}/${a.at}`;
  },
  move(d) {
    if (!lnValid()) return false;
    const a = LN.at;
    const n = get(cur(a.ed).doc, a.arr).length;
    const at = Math.max(0, Math.min(n, a.at + d));
    lnSet({ ...a, at });
    LN.at?.at !== undefined && lnScroll();
    return true;
  },
};
function lnScroll() { document.querySelector('.bw-ln-caret')?.scrollIntoView({ block: 'nearest' }); }
/** The block an Insert should land after (sel.b) or in (sel.p), from the slot. A picture or logo is anchored to the block BELOW the slot
 *  (its top is the slot), else the block above. */
function lnSelFor(a, overlay) {
  const arr = get(cur(a.ed).doc, a.arr) || [];
  if (overlay) { const i = a.at < arr.length ? a.at : a.at - 1; return i >= 0 ? { b: `${a.arr}/${i}`, p: null, ed: a.ed } : null; }
  if (a.at > 0) return { b: `${a.arr}/${a.at - 1}`, p: null, ed: a.ed };
  return { b: null, p: a.arr.replace(/\/blocks$/, ''), ed: a.ed }; // the start of the section: 23-objects' w2after reads the section from p
}
{
  const lnRun = runAction;
  runAction = async function lnRunAction(a) {
    const at = LN.at;
    const c = CMDS.find((x) => x.id === a);
    if (!at || !lnValid() || c?.group !== 'insert') return lnRun(a);
    if (at.ed !== S.ed) { S.ed = at.ed; document.documentElement.lang = at.ed; }
    const slot = { ...at };
    const overlay = a === 'image' || a === 'logo';
    S.sel = lnSelFor(slot, overlay);
    LN.anchor = a === 'logo' ? S.sel?.b || null : null; // OVL.add reads it for a logo (a picture takes S.sel.b through imageAt)
    S.selOv = null;
    try {
      // the start of a section: the core's «paragraph» and «diagram» read only a selected block, so they are placed here
      if (!overlay && !S.sel?.b && (a === 'addPara' || a === 'addDiagram')) {
        const ops = [];
        if (a === 'addPara') ops.push({ op: 'insert', path: `${slot.arr}/${slot.at}`, value: { kind: 'prose', paragraphs: [I18N.doc[S.ed].newParagraph] }, mirrorValue: { kind: 'prose', paragraphs: [I18N.doc[other(S.ed)]?.newParagraph ?? ''] } });
        else {
          const mk = (ed) => ({ kind: 'diagram', caption: HL(ed).figureCaption.replace('{name}', cur(ed).name || ''), model: DIAGRAM.starter(ed) });
          ops.push({ op: 'insert', path: `${slot.arr}/${slot.at}`, value: mk(S.ed), mirrorValue: mk(other(S.ed)) });
        }
        S.typingGroup = null;
        commit(ops, { mirror: true });
        S.sel = { b: `${slot.arr}/${slot.at}`, p: null, ed: S.ed };
        paintSel(); refreshUi();
      } else await lnRun(a);
    } finally { LN.at = null; LN.anchor = null; lnPaint(); }
  };
}
{ // a logo is placed freely at the page top by default; at the caret it sits at the top of the block below it, like a picture
  const lnAdd = OVL.add;
  OVL.add = function lnOvlAdd(kind, img, at) { return lnAdd.call(this, kind, img, !at && kind === 'logo' && LN.anchor ? { mode: 'anchor', anchor: LN.anchor, x: 0, y: 0 } : at); };
}
document.addEventListener('click', (e) => {
  const main = e.target.closest?.('#bw-pair main.bw-doc');
  if (!main) return; // the toolbar, the desk: the slot stays, so Insert still finds it
  if (e.target.closest('[data-b], [data-p], .bw-ov, .bw-ovf, figure, .bw-dg-edit, #bw-overlay, a, button, input, textarea, select, label, template')) { if (LN.at) lnSet(null); return; }
  if (!getSelection().isCollapsed) return;
  const slot = lnSlotAt(main, e.clientY);
  if (!slot) return;
  const ed = main.dataset.locale;
  if (ed !== S.ed) { S.ed = ed; document.documentElement.lang = ed; }
  if (document.activeElement && document.activeElement !== document.body && document.activeElement.closest?.('#bw-pair')) document.activeElement.blur();
  S.sel = null; S.selOv = null; if (S.dg) dgClear();
  paintSel(); refreshUi();
  lnSet({ ed, ...slot });
});
bwExt({
  expose: { w2lines: LN_API },
  on: {
    boot: () => w2docCss('w2-lines-css', `@media screen{html.bw-ed .bw-ln-caret{display:block;height:0;position:relative;margin:0;padding:0;pointer-events:none;overflow:visible;clear:both}
html.bw-ed .bw-ln-caret::before{content:"";position:absolute;inset-inline-start:0;top:-.7em;height:1.4em;width:2px;background:var(--accent,#c8a24a);animation:bw-ln-blink 1.06s steps(1) infinite}
html.bw-ed .bw-ln-caret::after{content:"";position:absolute;inset-inline:0;top:0;border-top:1px dashed var(--accent,#c8a24a);opacity:.45}
html[data-bw-calm="1"] .bw-ln-caret::before{animation:none}
@keyframes bw-ln-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){html.bw-ed .bw-ln-caret::before{animation:none}}}
@media print{.bw-ln-caret{display:none!important}}`),
    render: () => {
      lnPaint();
      const f = LN.focus;
      LN.focus = null;
      const el = f && mainOf(f.ed)?.querySelector(`[data-p="${CSS.escape(f.path)}"]`);
      if (!el) return;
      el.contentEditable = 'plaintext-only';
      el.focus({ preventScroll: true });
      const r = document.createRange();
      r.selectNodeContents(el); r.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    },
    open: () => { LN.at = null; },
    keydown: (e) => {
      if (!LN.at) return false;
      const path = e.composedPath?.() || [];
      const t0 = path[0] || e.target;
      if (t0.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t0.tagName || '') || path.some((x) => x === host)) return false;
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;
      if (!lnValid()) { LN.at = null; lnPaint(); return false; }
      if (e.key === 'Escape') { e.preventDefault(); lnSet(null); return true; }
      if (e.key === 'Enter') { e.preventDefault(); LN_API.enter(); return true; }
      if (e.key === 'Backspace') { e.preventDefault(); LN_API.back(); return true; }
      if (e.key === 'Delete') { e.preventDefault(); LN_API.del(); return true; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); LN_API.move(e.key === 'ArrowUp' ? -1 : 1); return true; }
      if (e.key.length === 1 && e.key !== ' ') { e.preventDefault(); LN_API.type(e.key); return true; }
      return false;
    },
  },
});
