/* 0.17.6 · the ruler, interactive (owner ask, 4 Nov 2026: «the horizontal ruler of Word»).
 * 22-layout.js draws the scale (0.14.0) and calls EXT.w2rulerUi.decorate() on every ruler it builds; this file adds, on that ruler:
 *   - two margin handles (the edges of the shaded margins). They drive EXT.margins (the margins model of the same release):
 *     get() -> {top, bottom, start, end} in mm, set(partial, {live}) while dragging, set(partial, {live:false}) on release = one undoable edit.
 *     Without EXT.margins the handles are not drawn and the ruler stays what it was.
 *   - three paragraph markers for the block holding the caret (or every selected block): first line, start (hanging) and end indent.
 *     Stored on the paragraph's style as indentStart / indentEnd / indentFirst (mm; indentFirst is the first line's offset from the start
 *     indent, negative = hanging), through the same style edit as the Paragraph tab: ONE commit per drag, so one undo step.
 *     engine/render.mjs prints them, engine/docx/model_docx.py writes w:ind start/end/firstLine/hanging.
 * Steps of 0.25 cm, Alt = 0.05 cm; a tooltip shows the value in cm; every handle is a focusable slider (arrows move it, Alt = fine).
 * The geometry is logical: x counts from the ruler's START edge (the right edge on an Arabic page), so Arabic mirrors for free. */
const RU = { drag: null, tip: null, step: 2.5, fine: 0.5 };
const ruR1 = (v) => Math.round(v * 100) / 100;
const ruCm = (mm) => `${ruR1(mm / 10).toFixed(2)} ${t('ru.cm')}`;
const ruSnap = (v, fine) => (fine ? Math.round(v / RU.fine) * RU.fine : Math.round(v / RU.step) * RU.step);
const ruClamp = (v, lo, hi) => Math.max(lo, Math.min(hi < lo ? lo : hi, v));
/** The margins now, in mm: the model's, else null (the handles stay off). */
const ruMargins = () => { try { const m = EXT.margins?.get?.(); return m && Number.isFinite(+m.start) && Number.isFinite(+m.end) ? { start: +m.start, end: +m.end } : null; } catch { return null; } };
/** The paragraphs the markers act on: [{path, ed, style}], the caret's block or every selected one ([] when nothing is selected). */
function ruTargets() {
  try {
    return (EXT.w2format?.each?.() || []).filter((x) => x.path && !/^\/labels\//.test(x.path)).map((x) => ({ path: x.path, ed: x.ed, style: isRich(x.leaf) ? x.leaf.style || {} : {} }));
  } catch { return []; }
}
const ruNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** The three indent values of the first target, mm. */
function ruVals(tg) {
  const s = tg[0]?.style || {};
  return { start: ruNum(s.indentStart), end: ruNum(s.indentEnd), first: ruNum(s.indentFirst) };
}
/** The ruler that sits over a target paragraph: the one of its page segment (or the top one of its edition). */
function ruRulerOf(tg) {
  const main = mainOf(tg.ed);
  const el = main?.querySelector(`[data-p="${CSS.escape(tg.path)}"]`);
  if (!main || !el) return null;
  const seg = el.closest('[style^="page:bw-seg-"]');
  return (seg && seg.querySelector(':scope > .bw-ruler')) || main.querySelector(':scope > .bw-ruler');
}
const RU_ICON = { fl: 'M0 0h10L5 6z', st: 'M5 0l5 5v5H0V5z', en: 'M5 0l5 5v5H0V5z' };
function ruHandle(cls, kind, label) {
  const h = document.createElement('div');
  h.className = `bw-ru-h ${cls}`;
  h.dataset.ru = kind;
  h.tabIndex = 0;
  h.setAttribute('role', 'slider');
  h.setAttribute('aria-label', label);
  return h;
}
/** Called by 22-layout.js for each ruler it builds: the page it measures is `page` ({w, h, ...} in mm). */
function ruDecorate(el, page) {
  el.classList.add('bw-ru');
  el.removeAttribute('aria-hidden');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', t('ru.label'));
  const mg = ruMargins();
  if (mg) {
    const a = ruHandle('m s', 'm-start', t('ru.mStart')); a.style.insetInlineStart = `${mg.start}mm`;
    const b = ruHandle('m e', 'm-end', t('ru.mEnd')); b.style.insetInlineEnd = `${mg.end}mm`;
    for (const h of [a, b]) { h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(Math.round(page.w / 2))); }
    a.setAttribute('aria-valuenow', String(ruR1(mg.start))); a.setAttribute('aria-valuetext', ruCm(mg.start));
    b.setAttribute('aria-valuenow', String(ruR1(mg.end))); b.setAttribute('aria-valuetext', ruCm(mg.end));
    el.append(a, b);
  }
  // the indent markers always exist (hidden until a paragraph is picked); they are placed by ruPlace()
  for (const [k, cls, key] of [['fl', 'fl', 'ru.first'], ['st', 'st', 'ru.start'], ['en', 'en', 'ru.end']]) {
    const h = ruHandle(`i ${cls}`, `i-${k}`, t(key));
    h.hidden = true;
    h.innerHTML = `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${RU_ICON[k]}"/></svg>`;
    el.append(h);
  }
  ruPlace(el);
}
/** Puts the three markers of one ruler where the picked paragraph's indents are (or hides them). */
function ruPlace(el) {
  const marks = [...el.querySelectorAll('.bw-ru-h.i')];
  const tg = ruTargets();
  const mine = tg.length && ruRulerOf(tg[0]) === el;
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const page = { w: +el.dataset.w };
  for (const h of marks) h.hidden = !mine;
  if (!mine) return;
  const v = ruVals(tg);
  const col = page.w - mg.start - mg.end;
  const pos = { 'i-fl': mg.start + v.start + v.first, 'i-st': mg.start + v.start };
  for (const h of marks) {
    const k = h.dataset.ru;
    if (k === 'i-en') { h.style.insetInlineEnd = `${mg.end + v.end}mm`; h.style.insetInlineStart = 'auto'; h.setAttribute('aria-valuenow', String(ruR1(v.end))); h.setAttribute('aria-valuetext', ruCm(v.end)); }
    else { h.style.insetInlineStart = `${pos[k]}mm`; h.style.insetInlineEnd = 'auto'; const n = k === 'i-st' ? v.start : v.start + v.first; h.setAttribute('aria-valuenow', String(ruR1(n))); h.setAttribute('aria-valuetext', ruCm(n)); }
    h.setAttribute('aria-valuemin', k === 'i-fl' ? String(-Math.round(v.start)) : '0');
    h.setAttribute('aria-valuemax', String(Math.round(col)));
  }
}
const ruAll = () => document.querySelectorAll('#bw-pair .bw-ruler.bw-ru').forEach(ruPlace);
function ruTip(text, x, y) {
  if (!RU.tip) { RU.tip = document.createElement('div'); RU.tip.className = 'bw-ru-tip'; RU.tip.setAttribute('role', 'status'); document.body.append(RU.tip); }
  RU.tip.textContent = text; RU.tip.style.left = `${x}px`; RU.tip.style.top = `${y}px`; RU.tip.hidden = false;
}
const ruTipOff = () => { if (RU.tip) RU.tip.hidden = true; };
/** Applies a handle's value: kind, logical position from the START edge in mm (margin handles: the margin; markers: from the text column's start). Returns what was set. */
function ruCompute(kind, x, d) {
  const { mg, page, v } = d;
  const col = page.w - mg.start - mg.end;
  if (kind === 'm-start') return { margin: ruClamp(x, 0, page.w - mg.end - 40) };
  if (kind === 'm-end') return { margin: ruClamp(page.w - x, 0, page.w - mg.start - 40) };
  const p = x - mg.start; // from the column's start edge
  if (kind === 'i-st') return { patch: { indentStart: ruClamp(p, 0, col - v.end - 10) } };
  if (kind === 'i-fl') { const a = ruClamp(p, 0, col - v.end - 10); return { patch: { indentFirst: a - v.start } }; }
  return { patch: { indentEnd: ruClamp(col - p, 0, col - v.start - 10) } };
}
/** The live look of a paragraph indent while dragging (the commit on release re-renders the real thing). */
function ruPreview(tg, patch) {
  for (const x of tg) {
    const el = mainOf(x.ed)?.querySelector(`[data-p="${CSS.escape(x.path)}"]`);
    if (!el) continue;
    const s = { ...x.style, ...patch };
    el.style.marginInlineStart = s.indentStart ? `${s.indentStart}mm` : '';
    el.style.marginInlineEnd = s.indentEnd ? `${s.indentEnd}mm` : '';
    el.style.textIndent = s.indentFirst ? `${s.indentFirst}mm` : '';
  }
}
const ruPatchClean = (patch) => Object.fromEntries(Object.entries(patch).map(([k, val]) => [k, Math.abs(val) < 0.001 ? null : ruR1(val)]));
function ruFinish(d, commitIt) {
  if (d.kind.startsWith('m-')) {
    if (d.value != null && EXT.margins) EXT.margins.set({ [d.kind === 'm-start' ? 'start' : 'end']: ruR1(d.value) }, { live: false });
  } else if (d.patch && commitIt) {
    ruPreview(d.tg, Object.fromEntries(d.tg.length ? Object.keys(d.patch).map((k) => [k, d.tg[0].style[k]]) : [])); // back to the stored look first
    EXT.w2format.style(ruPatchClean(d.patch));
  }
  ruTipOff();
  ruAll();
}
function ruDown(e) {
  const h = e.target.closest?.('.bw-ru-h');
  if (!h || e.button > 0) return;
  const el = h.closest('.bw-ruler');
  const kind = h.dataset.ru;
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const tg = kind.startsWith('i-') ? ruTargets() : [];
  if (kind.startsWith('i-') && !tg.length) return;
  e.preventDefault(); // keeps the caret and the selection where they are: the markers act on the paragraph that holds them
  const r = el.getBoundingClientRect();
  const scale = r.width / (el.offsetWidth || r.width); // the page may be zoomed or transformed: mm on screen = CSS mm x scale
  const rtl = getComputedStyle(el).direction === 'rtl';
  RU.drag = { kind, el, r, mmPx: scale * (96 / 25.4), rtl, mg, page: { w: +el.dataset.w }, tg, v: ruVals(tg), value: null, patch: null, moved: false, id: e.pointerId };
  h.classList.add('on');
}
function ruMove(e) {
  const d = RU.drag;
  if (!d) return;
  const x0 = d.rtl ? (d.r.right - e.clientX) / d.mmPx : (e.clientX - d.r.left) / d.mmPx;
  d.moved = true;
  if (d.kind.startsWith('m-')) {
    const raw = d.kind === 'm-end' ? d.page.w - x0 : x0; // the margin as measured from its own edge
    d.value = ruCompute(d.kind, d.kind === 'm-end' ? d.page.w - ruSnap(raw, e.altKey) : ruSnap(raw, e.altKey), d).margin;
    if (EXT.margins) EXT.margins.set({ [d.kind === 'm-start' ? 'start' : 'end']: ruR1(d.value) }, { live: true });
    ruTip(ruCm(d.value), e.clientX + 12, e.clientY + 18);
  } else {
    // start-side markers snap their distance from the column's start edge, the end marker its distance from the column's end edge
    const xs = d.kind === 'i-en' ? d.page.w - d.mg.end - ruSnap(d.page.w - d.mg.end - x0, e.altKey) : d.mg.start + ruSnap(x0 - d.mg.start, e.altKey);
    d.patch = ruCompute(d.kind, xs, d).patch;
    ruPreview(d.tg, d.patch);
    ruTip(ruCm(d.kind === 'i-fl' ? d.patch.indentFirst + d.v.start : (d.patch.indentStart ?? d.patch.indentEnd)), e.clientX + 12, e.clientY + 18);
    // the marker follows the pointer at once; the start marker drags the first-line marker with it (Word)
    const hs = [...d.el.querySelectorAll('.bw-ru-h.i')];
    const sx = d.mg.start + (d.patch.indentStart ?? d.v.start);
    const fx = d.kind === 'i-fl' ? sx + d.patch.indentFirst : sx + d.v.first;
    for (const h of hs) {
      if (h.dataset.ru === 'i-st') h.style.insetInlineStart = `${sx}mm`;
      if (h.dataset.ru === 'i-fl') h.style.insetInlineStart = `${fx}mm`;
      if (h.dataset.ru === 'i-en' && d.patch.indentEnd != null) h.style.insetInlineEnd = `${d.mg.end + d.patch.indentEnd}mm`;
    }
  }
}
function ruUp() {
  const d = RU.drag;
  if (!d) return;
  RU.drag = null;
  d.el.querySelectorAll('.bw-ru-h.on').forEach((h) => h.classList.remove('on'));
  if (d.moved) ruFinish(d, true); else { ruTipOff(); ruAll(); }
}
function ruCancel() {
  const d = RU.drag;
  if (!d) return;
  RU.drag = null;
  d.el.querySelectorAll('.bw-ru-h.on').forEach((h) => h.classList.remove('on'));
  if (d.kind.startsWith('m-')) { if (d.moved && EXT.margins) EXT.margins.set({ [d.kind === 'm-start' ? 'start' : 'end']: d.mg[d.kind === 'm-start' ? 'start' : 'end'] }, { live: false }); } else ruPreview(d.tg, Object.fromEntries(Object.keys(d.patch || {}).map((k) => [k, d.tg[0]?.style[k]])));
  ruTipOff();
  ruAll();
}
/** Arrow keys on a focused handle: 0.25 cm per press, Alt = 0.05 cm; Home/End and PageUp/PageDown are not used. */
function ruKey(e) {
  if (e.key === 'Escape' && RU.drag) { ruCancel(); return; }
  const h = e.target.closest?.('.bw-ru-h');
  if (!h) return;
  const dir = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
  if (!dir) return;
  const kind = h.dataset.ru;
  const el = h.closest('.bw-ruler');
  const rtl = getComputedStyle(el).direction === 'rtl';
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const tg = kind.startsWith('i-') ? ruTargets() : [];
  if (kind.startsWith('i-') && !tg.length) return;
  e.preventDefault();
  const v = ruVals(tg);
  const page = { w: +el.dataset.w };
  const logical = (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? dir * (rtl ? -1 : 1) : dir; // the arrows follow the screen; up/down follow the value
  const step = (e.altKey ? RU.fine : RU.step) * logical;
  // the handle's current logical x from the page's start edge
  const cur = { 'm-start': mg.start, 'm-end': page.w - mg.end, 'i-st': mg.start + v.start, 'i-fl': mg.start + v.start + v.first, 'i-en': page.w - mg.end - v.end }[kind];
  const x = ruR1(cur + step);
  const out = ruCompute(kind, x, { mg, page, v });
  if (out.margin != null) { if (EXT.margins) { EXT.margins.set({ [kind === 'm-start' ? 'start' : 'end']: ruR1(out.margin) }, { live: false }); } }
  else EXT.w2format.style(ruPatchClean(out.patch));
  // the re-render replaced the handle: focus the new one
  setTimeout(() => { const n = document.querySelector(`#bw-pair .bw-ruler.bw-ru .bw-ru-h[data-ru="${kind}"]:not([hidden])`); n?.focus(); }, 0);
}
function ruCss() {
  w2docCss('w2-ruler-ui-css', `@media screen{html.bw-ed .bw-ruler.bw-ru{height:8mm;pointer-events:auto;overflow:visible;z-index:2;touch-action:none}
html.bw-ed .bw-ruler.bw-ru s.c{height:3mm} html.bw-ed .bw-ruler.bw-ru b{top:.6mm}
html.bw-ed .bw-ru-h{position:absolute;z-index:3;cursor:ew-resize;outline:none;touch-action:none}
html.bw-ed .bw-ru-h:focus-visible{outline:2px solid var(--accent,#0a5);outline-offset:1px}
html.bw-ed .bw-ru-h.m{top:0;bottom:0;width:3mm;margin-inline-start:-1.5mm;background:transparent}
html.bw-ed .bw-ru-h.m.e{margin-inline-start:0;margin-inline-end:-1.5mm}
html.bw-ed .bw-ru-h.m::after{content:"";position:absolute;top:1mm;bottom:1mm;inset-inline-start:calc(50% - 1px);width:2px;border-radius:1px;background:var(--accent,#0a5);opacity:.55}
html.bw-ed .bw-ru-h.m:hover::after,html.bw-ed .bw-ru-h.m.on::after{opacity:1}
html.bw-ed .bw-ru-h.i{width:3mm;height:3mm;margin-inline-start:-1.5mm;color:var(--accent,#0a5)}
html.bw-ed .bw-ru-h.i.en{margin-inline-start:0;margin-inline-end:-1.5mm}
html.bw-ed .bw-ru-h.i.fl{top:0} html.bw-ed .bw-ru-h.i.st,html.bw-ed .bw-ru-h.i.en{bottom:0}
html.bw-ed .bw-ru-h.i[hidden]{display:none}
html.bw-ed .bw-ru-h.i svg{display:block;width:100%;height:100%;fill:currentColor} html.bw-ed .bw-ru-h.i.st svg{transform:translateY(0)}
html.bw-ed .bw-ru-h.i:hover,html.bw-ed .bw-ru-h.i.on{color:var(--accent-strong,#063)}
html.bw-ed .bw-ru-tip{position:fixed;z-index:99999;padding:2px 7px;border-radius:6px;background:#0b1b2b;color:#fff;font:600 11px/1.4 var(--font-sans,sans-serif);pointer-events:none;white-space:nowrap}
html.bw-ed .bw-ru-tip[hidden]{display:none}}
@media print{.bw-ru-h,.bw-ru-tip{display:none!important}}`);
}
document.addEventListener('pointerdown', ruDown, true);
window.addEventListener('pointermove', ruMove, true);
window.addEventListener('pointerup', ruUp, true);
window.addEventListener('pointercancel', ruCancel, true);
document.addEventListener('keydown', ruKey, true);
document.addEventListener('selectionchange', () => requestAnimationFrame(() => { if (!RU.drag) ruAll(); }));
// the margins model announces a change (live or final): the ruler redraws at the new margins
const ruMarginsChanged = () => { if (W2R.on && !RU.drag) w2rulers(); else if (W2R.on) { const mg = ruMargins(); if (mg) document.querySelectorAll('#bw-pair .bw-ruler').forEach((r) => { const s = r.querySelector('i.s'), e = r.querySelector('i.e'); if (s) s.style.width = `${mg.start}mm`; if (e) e.style.width = `${mg.end}mm`; }); } };
document.addEventListener('bw:margins', ruMarginsChanged);
window.addEventListener('bw:margins', ruMarginsChanged);
bwExt({
  expose: { w2rulerUi: { decorate: ruDecorate, refresh: ruAll, targets: ruTargets } },
  on: { boot: ruCss, render: () => { ruAll(); } },
});
