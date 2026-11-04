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
/* 0.17.7 · TAB STOPS on the same ruler (owner ask, 4 Nov 2026: the tab selector and tab stops of Word).
 *   - a selector button at the ruler's start corner cycles the kind: start (left), center, end (right), decimal; one click on the ruler adds a stop of that kind
 *     to the picked paragraph(s), a drag moves it, a drag off the ruler (down or up) removes it, Delete removes the focused stop, the arrows move it.
 *   - stored as style.tabs = [{pos mm from the text column's start edge, align: start|center|end|decimal}] through the Paragraph tab's style edit: ONE commit per change.
 *   - Word's default grid (every 1.27 cm) is drawn faint past the last stop. The Tab key in a paragraph with stops inserts a tab character (a non-editable span,
 *     engine/render.mjs tabPass sizes it to the next stop; the same pass runs in the PDF page). engine/docx/model_docx.py writes w:tabs. */
const RU = { drag: null, tip: null, step: 2.5, fine: 0.5, kind: 'start', defMm: 12.7 };
const RU_KINDS = ['start', 'center', 'end', 'decimal'];
const RU_TAB_ICON = { start: 'M2 0h2v7h6v2H2z', center: 'M4 0h2v7h4v2H0V7h4z', end: 'M8 0h2v9H2V7h6z', decimal: 'M4 0h2v6h4v2H0V6h4zM7.5 7.5a1 1 0 110 .01z' };
/** The tab stops of a style: validated and sorted (the same rule as engine/render.mjs tabsOf). */
const ruTabs = (st) => (typeof tabsOf === 'function' ? tabsOf(st) : []);
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
  const sel = document.createElement('button');
  sel.type = 'button'; sel.className = 'bw-ru-sel'; sel.dataset.ru = 'sel'; sel.tabIndex = 0;
  sel.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path/></svg>';
  el.append(sel);
  ruSelPaint(sel);
  ruPlace(el);
}
function ruSelPaint(sel) {
  sel.dataset.kind = RU.kind;
  sel.querySelector('path')?.setAttribute('d', RU_TAB_ICON[RU.kind]);
  const lab = `${t('ru.tabType')}: ${t('ru.tab.' + RU.kind)}`;
  sel.setAttribute('aria-label', lab); sel.title = lab;
}
/** Puts the three markers of one ruler where the picked paragraph's indents are (or hides them). */
function ruPlace(el) {
  const marks = [...el.querySelectorAll('.bw-ru-h.i')];
  const tg = ruTargets();
  const mine = tg.length && ruRulerOf(tg[0]) === el;
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const page = { w: +el.dataset.w };
  for (const h of marks) h.hidden = !mine;
  ruPlaceTabs(el, mine ? ruTabs(tg[0].style) : [], mg, page);
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
/** The tab-stop markers of one ruler, and Word's default grid (faint ticks every 1.27 cm past the last stop). */
function ruPlaceTabs(el, stops, mg, page) {
  el.querySelectorAll('.bw-ru-h.t, .bw-ru-d').forEach((x) => x.remove());
  const col = page.w - mg.start - mg.end;
  const last = stops.length ? stops.at(-1).pos : 0;
  for (let k = 1; k * RU.defMm < col + 0.01; k += 1) {
    const pos = Math.round(k * RU.defMm * 100) / 100;
    if (pos <= last + 0.05) continue;
    const d = document.createElement('u'); d.className = 'bw-ru-d'; d.dataset.pos = String(pos); d.style.insetInlineStart = `${mg.start + pos}mm`; el.append(d);
  }
  stops.forEach((s, i) => {
    const h = ruHandle(`t ${s.align}`, 't', `${t('ru.tabStop')} ${t('ru.tab.' + s.align)}`);
    h.dataset.i = String(i); h.dataset.pos = String(s.pos); h.dataset.align = s.align;
    h.style.insetInlineStart = `${mg.start + s.pos}mm`;
    h.setAttribute('aria-valuemin', '0'); h.setAttribute('aria-valuemax', String(Math.round(col)));
    h.setAttribute('aria-valuenow', String(ruR1(s.pos))); h.setAttribute('aria-valuetext', ruCm(s.pos));
    h.innerHTML = `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${RU_TAB_ICON[s.align]}"/></svg>`;
    el.append(h);
  });
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
  if (kind === 'm-start') return { margin: ruClamp(x, 5, Math.min(50, page.w - mg.end - 40)) }; // the margins model's limits: 5 to 50 mm a side
  if (kind === 'm-end') return { margin: ruClamp(page.w - x, 5, Math.min(50, page.w - mg.start - 40)) };
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
/** The tab stops now of the first picked paragraph, as a fresh array. */
const ruCurTabs = (tg) => ruTabs(tg[0]?.style).map((x) => ({ ...x }));
/** The stops after a change: sorted, one stop per position (a stop dropped on another replaces it). */
function ruTabsNorm(list) {
  const out = [];
  for (const x of [...list].sort((a, b) => a.pos - b.pos)) { const same = out.findIndex((o) => Math.abs(o.pos - x.pos) < 0.5); if (same >= 0) out[same] = x; else out.push(x); }
  return out;
}
const ruTabsCommit = (list) => { const v = ruTabsNorm(list).map((x) => ({ pos: ruR1(x.pos), align: x.align })); EXT.w2format.style({ tabs: v.length ? v : null }); return v; };
function ruDown(e) {
  if (e.button > 0) return;
  const selBtn = e.target.closest?.('.bw-ru-sel');
  if (selBtn) { e.preventDefault(); RU.kind = RU_KINDS[(RU_KINDS.indexOf(RU.kind) + 1) % RU_KINDS.length]; document.querySelectorAll('.bw-ru-sel').forEach(ruSelPaint); return; }
  const h = e.target.closest?.('.bw-ru-h');
  if (!h) {
    // a press on the bare ruler: a new tab stop of the selected kind (the drag then places it)
    const el = e.target.closest?.('#bw-pair .bw-ruler.bw-ru');
    if (!el) return;
    const tg = ruTargets();
    if (!tg.length || ruRulerOf(tg[0]) !== el) return;
    e.preventDefault();
    ruStart(e, el, 't', tg, -1);
    return;
  }
  if (h.dataset.ru === 't') {
    const tg = ruTargets();
    if (!tg.length) return;
    e.preventDefault();
    ruStart(e, h.closest('.bw-ruler'), 't', tg, +h.dataset.i);
    h.classList.add('on');
    return;
  }
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
/** Begins a tab-stop drag: idx -1 = a new stop (Word adds it at the press and lets the drag place it). */
function ruStart(e, el, kind, tg, idx) {
  const r = el.getBoundingClientRect();
  const scale = r.width / (el.offsetWidth || r.width);
  const rtl = getComputedStyle(el).direction === 'rtl';
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const list = ruCurTabs(tg);
  RU.drag = { kind, el, r, mmPx: scale * (96 / 25.4), rtl, mg, page: { w: +el.dataset.w }, tg, v: ruVals(tg), list, idx, value: null, off: false, moved: false, fresh: idx < 0, align: idx < 0 ? RU.kind : list[idx]?.align, id: e.pointerId };
  ruTabMove(e, true);
}
/** The stop under the pointer (logical mm from the column's start edge), and whether the pointer left the ruler (vertically) = remove. */
function ruTabMove(e, first) {
  const d = RU.drag;
  const x0 = d.rtl ? (d.r.right - e.clientX) / d.mmPx : (e.clientX - d.r.left) / d.mmPx;
  const col = d.page.w - d.mg.start - d.mg.end;
  const v = ruClamp(ruSnap(x0 - d.mg.start, e.altKey), 0, col);
  const away = Math.max(d.r.top - e.clientY, e.clientY - d.r.bottom);
  d.off = !d.fresh && away > 14; // a new stop is placed, not removed; an existing one dragged off the ruler goes
  if (!first) d.moved = true;
  d.value = v;
  let g = d.el.querySelector('.bw-ru-h.t.ghost');
  const real = d.fresh ? null : d.el.querySelector(`.bw-ru-h.t[data-i="${d.idx}"]`);
  if (d.fresh && !g) { g = ruHandle(`t ${d.align} ghost`, 't', t('ru.tabStop')); g.innerHTML = `<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="${RU_TAB_ICON[d.align]}"/></svg>`; d.el.append(g); }
  const m = real || g;
  if (m) { m.style.insetInlineStart = `${d.mg.start + v}mm`; m.style.opacity = d.off ? '.25' : ''; m.classList.add('on'); }
  if (d.off) ruTip(t('ru.tabRemove'), e.clientX + 12, e.clientY + 18); else ruTip(ruCm(v), e.clientX + 12, e.clientY + 18);
}
function ruTabUp() {
  const d = RU.drag;
  RU.drag = null;
  d.el.querySelectorAll('.bw-ru-h.on').forEach((h) => h.classList.remove('on'));
  d.el.querySelectorAll('.bw-ru-h.ghost').forEach((h) => h.remove());
  let list = d.list;
  if (d.fresh) list = [...list, { pos: d.value, align: d.align }];
  else if (d.off) list = list.filter((_, i) => i !== d.idx);
  else if (d.moved) list = list.map((x, i) => (i === d.idx ? { ...x, pos: d.value } : x));
  else { ruTipOff(); ruAll(); return; } // pressed and released in place: nothing changes
  ruTabsCommit(list);
  ruTipOff();
  ruAll();
}
function ruMove(e) {
  const d = RU.drag;
  if (!d) return;
  if (d.kind === 't') { ruTabMove(e, false); return; }
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
  if (d.kind === 't') { ruTabUp(); return; }
  RU.drag = null;
  d.el.querySelectorAll('.bw-ru-h.on').forEach((h) => h.classList.remove('on'));
  if (d.moved) ruFinish(d, true); else { ruTipOff(); ruAll(); }
}
function ruCancel() {
  const d = RU.drag;
  if (!d) return;
  if (d.kind === 't') { RU.drag = null; d.el.querySelectorAll('.bw-ru-h.ghost').forEach((h) => h.remove()); ruTipOff(); ruAll(); return; }
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
  if (h.dataset.ru === 't') { ruTabKey(e, h); return; }
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
/** A focused tab stop: the arrows move it 0.25 cm (Alt 0.05 cm; they follow the screen), Delete / Backspace removes it. */
function ruTabKey(e, h) {
  const i = +h.dataset.i;
  const tg = ruTargets();
  if (!tg.length) return;
  const list = ruCurTabs(tg);
  if (!list[i]) return;
  const del = e.key === 'Delete' || e.key === 'Backspace';
  const dir = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: 1, ArrowDown: -1 }[e.key];
  if (!del && !dir) return;
  e.preventDefault();
  e.stopPropagation(); // the editor's own Delete would remove the picked block
  const el = h.closest('.bw-ruler');
  const rtl = getComputedStyle(el).direction === 'rtl';
  const mg = ruMargins() || { start: W2R.margin, end: W2R.margin };
  const col = +el.dataset.w - mg.start - mg.end;
  let at = i;
  let next;
  if (del) next = list.filter((_, k) => k !== i);
  else {
    const logical = (e.key === 'ArrowRight' || e.key === 'ArrowLeft') ? dir * (rtl ? -1 : 1) : dir;
    const pos = ruClamp(ruR1(list[i].pos + (e.altKey ? RU.fine : RU.step) * logical), 0, col);
    next = list.map((x, k) => (k === i ? { ...x, pos } : x));
    at = ruTabsNorm(next).findIndex((x) => Math.abs(x.pos - pos) < 0.5);
  }
  ruTabsCommit(next);
  // the re-render replaces the markers (it may land a frame or two later, and the ruler may be rebuilt again): keep the focus on the new one for a few frames
  let tries = 0;
  const back = () => {
    const n = document.querySelector(del ? '#bw-pair .bw-ruler.bw-ru .bw-ru-h.t' : `#bw-pair .bw-ruler.bw-ru .bw-ru-h.t[data-i="${at}"]`);
    const ae = document.activeElement;
    if (n && n !== ae && (!ae || ae === document.body || ae.classList?.contains('bw-ru-h') || ae.hasAttribute?.('data-p') || !ae.isConnected)) n.focus();
    if ((tries += 1) < 14) requestAnimationFrame(back);
  };
  requestAnimationFrame(back);
}
/** Tab in a paragraph that has stops inserts a tab character, drawn to the next stop (not the browser's focus move). */
function ruTabKeyInText(e) {
  if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
  const el = e.target.closest?.('#bw-pair [data-p]');
  if (!el || !el.isContentEditable) return;
  const holder = el.closest('[data-tabs]');
  if (!holder) return;
  e.preventDefault();
  document.execCommand('insertText', false, '\t'); // the paragraphs are plaintext-only: the browser inserts the character, ruWrapTabs gives it its span
  ruWrapTabs(el);
  ruTabsLater(holder);
}
/** A typed or pasted tab character becomes a .bw-tab span (the display layer of a tab; the text keeps the tab), and the caret keeps its place. */
function ruWrapTabs(el) {
  const bare = [];
  const walker = document.createTreeWalker(el, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.includes('\t') && !n.parentElement.closest('.bw-tab')) bare.push(n);
  if (!bare.length) return;
  const s = getSelection();
  let off = -1;
  if (s.rangeCount && el.contains(s.anchorNode)) { const rg = document.createRange(); rg.selectNodeContents(el); rg.setEnd(s.anchorNode, s.anchorOffset); off = rg.toString().length; }
  for (const n of bare) {
    const f = document.createDocumentFragment();
    n.data.split(/(\t)/).forEach((part) => {
      if (!part) return;
      if (part === '\t') { const sp = document.createElement('span'); sp.className = 'bw-tab'; sp.contentEditable = 'false'; sp.textContent = '\t'; f.append(sp); } else f.append(document.createTextNode(part));
    });
    n.replaceWith(f);
  }
  if (off < 0) return;
  // the caret: the character offset it had, in the new nodes (after the tab span when it sat right after the tab)
  let left = off;
  const w2 = document.createTreeWalker(el, 4);
  for (let n = w2.nextNode(); n; n = w2.nextNode()) {
    const len = n.data.length;
    const tab = n.parentElement.closest('.bw-tab');
    if (left <= len) {
      const rg = document.createRange();
      if (tab) rg.setStartAfter(tab); else rg.setStart(n, left);
      rg.collapse(true); s.removeAllRanges(); s.addRange(rg);
      return;
    }
    left -= len;
  }
  const rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); s.removeAllRanges(); s.addRange(rg);
}
const ruTabsLater = (root) => requestAnimationFrame(() => { try { tabPass(root || document); } catch { /* the pass is a display layer */ } });
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
html.bw-ed .bw-ru-sel{position:absolute;z-index:4;top:1mm;inset-inline-start:.6mm;width:5.4mm;height:5.4mm;padding:.4mm;border:1px solid var(--rule-strong,#cfd6de);border-radius:1mm;background:var(--paper,#fff);color:var(--accent,#0a5);cursor:pointer;line-height:0}
html.bw-ed .bw-ru-sel svg{width:100%;height:100%;fill:currentColor} html.bw-ed .bw-ru-sel:dir(rtl) svg{transform:scaleX(-1)}
html.bw-ed .bw-ru-sel:hover,html.bw-ed .bw-ru-sel:focus-visible{border-color:var(--accent,#0a5);outline:none}
html.bw-ed .bw-ru-h.t{bottom:0;width:3mm;height:3mm;margin-inline-start:-1.5mm;color:var(--accent,#0a5)}
html.bw-ed .bw-ru-h.t svg{display:block;width:100%;height:100%;fill:currentColor} html.bw-ed .bw-ru-h.t:dir(rtl) svg{transform:scaleX(-1)}
html.bw-ed .bw-ru-h.t:hover,html.bw-ed .bw-ru-h.t.on{color:var(--accent-strong,#063)} html.bw-ed .bw-ru-h.t.ghost{pointer-events:none}
html.bw-ed .bw-ru-d{position:absolute;bottom:0;width:0;height:1.3mm;border-inline-start:1px solid var(--accent,#0a5);opacity:.3;pointer-events:none;text-decoration:none}
html.bw-ed .bw-ru-tip{position:fixed;z-index:99999;padding:2px 7px;border-radius:6px;background:#0b1b2b;color:#fff;font:600 11px/1.4 var(--font-sans,sans-serif);pointer-events:none;white-space:nowrap}
html.bw-ed .bw-ru-tip[hidden]{display:none}}
@media print{.bw-ru-h,.bw-ru-tip,.bw-ru-sel,.bw-ru-d{display:none!important}}`);
}
document.addEventListener('pointerdown', ruDown, true);
window.addEventListener('pointermove', ruMove, true);
window.addEventListener('pointerup', ruUp, true);
window.addEventListener('pointercancel', ruCancel, true);
document.addEventListener('keydown', ruKey, true);
document.addEventListener('keydown', ruTabKeyInText, true);
document.addEventListener('input', (e) => { const h = e.target.closest?.('#bw-pair [data-tabs]'); const el = e.target.closest?.('#bw-pair [data-p]'); if (h && el) { ruWrapTabs(el); if (h.querySelector('.bw-tab')) ruTabsLater(h); } }, true);
document.addEventListener('selectionchange', () => requestAnimationFrame(() => { if (!RU.drag) ruAll(); }));
// the margins model announces a change (live or final): the ruler redraws at the new margins
const ruMarginsChanged = () => { if (W2R.on && !RU.drag) w2rulers(); else if (W2R.on) { const mg = ruMargins(); if (mg) document.querySelectorAll('#bw-pair .bw-ruler').forEach((r) => { const s = r.querySelector('i.s'), e = r.querySelector('i.e'); if (s) s.style.width = `${mg.start}mm`; if (e) e.style.width = `${mg.end}mm`; const hs = r.querySelector('.bw-ru-h.m.s'), he = r.querySelector('.bw-ru-h.m.e'); if (hs) hs.style.insetInlineStart = `${mg.start}mm`; if (he) he.style.insetInlineEnd = `${mg.end}mm`; }); } };
document.addEventListener('bw:margins', ruMarginsChanged);
window.addEventListener('bw:margins', ruMarginsChanged);
bwExt({
  expose: { w2rulerUi: { decorate: ruDecorate, refresh: ruAll, targets: ruTargets } },
  on: { boot: ruCss, render: () => { ruAll(); if (document.querySelector('#bw-pair [data-tabs]')) ruTabsLater(document.querySelector('#bw-pair')); } },
});
