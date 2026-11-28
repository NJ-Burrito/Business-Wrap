/* ── in-place label editing: a text box over the label itself, in the drawing's own type and size ── */
function dgInline(target) {
  if (!S.dg || !dgBlock()) return;
  document.querySelector('.bw-dg-edit')?.remove();
  const fig = dgFig();
  const svg = fig?.querySelector('svg');
  if (!svg) return;
  const m = dgModel();
  const node = target.node ? m.nodes.find((n) => n.id === target.node) : null;
  const edge = target.edge ? m.edges.find((x) => x.id === target.edge) : null;
  // a legend entry (the key under the drawing) is edited in place too: model.legend[key]
  const legendKey = target.legend || null;
  const legendItem = legendKey ? DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg.ed }).items.find((it) => it.t === 'text' && it.legend === legendKey) : null;
  const obj = node || edge || (legendItem ? { text: legendItem.lines.join(' ') } : null);
  if (!obj) return;
  const field = legendItem ? 'text' : target.field === 'sub' ? 'sub' : 'label';
  const r = DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg.ed });
  const F = DIAGRAM.FS;
  let box;
  let size;
  if (legendItem) {
    size = F.key;
    box = { x: legendItem.x - 80, y: legendItem.y - 12, w: 160, h: 24 };
  } else if (node) {
    size = node.kind === 'decision' ? F.gate : node.kind === 'text' ? F.text : field === 'sub' ? F.sub : F.title;
    const sub = r.items.find((it) => it.t === 'text' && it.id === node.id && it.sub);
    if (field === 'sub') box = sub ? { x: node.x + 6, y: sub.box.y - 3, w: node.w - 12, h: sub.box.h + 6 } : { x: node.x + 6, y: node.y + node.h - 24, w: node.w - 12, h: 22 };
    else if (node.kind === 'decision') box = { x: node.x + node.w * 0.16, y: node.y + node.h * 0.22, w: node.w * 0.68, h: node.h * 0.56 };
    else box = { x: node.x + 4, y: node.y + 4, w: node.w - 8, h: (sub ? sub.box.y - node.y : node.h) - 6 };
  } else {
    size = F.edge;
    const cap = r.items.find((it) => it.t === 'text' && it.edge === edge.id);
    const P = dgRoute(m, edge.id) || [[0, 0], [0, 0]];
    const i = Math.max(0, Math.floor((P.length - 1) / 2) - (P.length > 2 ? 0 : 0));
    const mid = cap ? { x: cap.x, y: cap.y } : { x: (P[i][0] + P[Math.min(i + 1, P.length - 1)][0]) / 2, y: (P[i][1] + P[Math.min(i + 1, P.length - 1)][1]) / 2 - 12 };
    const w = Math.max(130, (cap?.box.w || 0) + 30);
    box = { x: mid.x - w / 2, y: mid.y - 13, w, h: 26 };
  }
  const ctm = svg.getScreenCTM();
  const k = ctm.a;
  const el = document.createElement('div');
  el.className = 'bw-dg-edit';
  el.contentEditable = 'plaintext-only';
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-multiline', 'true');
  el.setAttribute('aria-label', t(field === 'sub' ? 'dgSub' : edge ? 'dgEdgeLabel' : 'dgLabel'));
  el.title = t('dgInline');
  el.lang = S.dg.ed;
  // the caret follows the text: Arabic runs right to left, Latin left to right; empty → the edition's direction
  el.dir = obj[field] ? 'auto' : S.dg.ed === 'ar' ? 'rtl' : 'ltr';
  el.spellcheck = false;
  el.textContent = obj[field] || '';
  const fam = [S.theme?.fonts?.text, 'serif'].filter(Boolean).map((x) => (x === 'serif' ? x : `'${x}'`)).join(', ');
  // never narrower than a short phrase at a readable size: a small drawing still gets a usable box, centred on the label
  const bw = Math.max(110, box.w * k);
  Object.assign(el.style, {
    left: `${ctm.e + (box.x + box.w / 2) * k - bw / 2 + window.scrollX}px`, top: `${ctm.f + box.y * k + window.scrollY}px`,
    width: `${bw}px`, minHeight: `${Math.max(18, box.h * k)}px`,
    fontSize: `${Math.max(11, size * k)}px`, fontFamily: fam,
  });
  document.body.appendChild(el);
  el.focus();
  getSelection().selectAllChildren(el);
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const v = el.innerText.replace(/\r/g, '').replace(/\n+$/, '').replace(/ /g, ' ');
    el.remove();
    if (!save || v === (obj[field] || '')) { dgPaint(); return; }
    const m2 = dgModel();
    if (legendItem) {
      const base = DIAGRAM.words(S.dg.ed)[legendKey];
      const lg = m2.legend && typeof m2.legend === 'object' ? { ...m2.legend } : {};
      if (!v || v === base) delete lg[legendKey]; else lg[legendKey] = v;
      if (Object.keys(lg).length) m2.legend = lg; else delete m2.legend;
      dgSave(m2);
      return;
    }
    const o2 = node ? m2.nodes.find((n) => n.id === node.id) : m2.edges.find((x) => x.id === edge.id);
    if (!o2) return;
    o2[field] = v;
    if (node && !o2.sized) {
      // the shape grows or shrinks around its centre, so a longer word never pushes it off its row
      const cx = o2.x + o2.w / 2;
      const cy = o2.y + o2.h / 2;
      const sz = DIAGRAM.measure(o2);
      Object.assign(o2, sz, { x: Math.round(cx - sz.w / 2), y: Math.round(cy - sz.h / 2) });
    }
    dgSave(m2);
  };
  el.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } else if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); finish(true); }
  });
  el.addEventListener('blur', () => finish(true));
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
}
/* ── zoom: the drawing only; view state, never in the model, the PDF or the DOCX ──
 * (Z1-Z6). The frame (.fig-art) keeps the size it had when fitted; only the drawing inside it changes. The scale follows
 * deltaY (a pinch or a precision wheel sends many small events), is coalesced to one update per frame, and keeps the point under the
 * pointer where it was. The view (scale, offsets, scroll) lives in S.dgZoom, so a live redraw, a save or a full render puts it back. */
/** Screen px per layout px of a figure (the page zoom, the side-by-side shrink). Read as rect.width / offsetWidth; offsetWidth is an integer, so at no zoom that ratio is 0.9996 instead of 1,
 *  and a frame stored from it moved by 0.2 px on every re-render (0.16.0, D1/D3): a ratio within 0.15 % of 1 is 1. */
function dgPageK(el) {
  const k = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
  return Math.abs(k - 1) < 0.0015 ? 1 : k;
}
function dgZoomKey(fig) { return `${fig.closest('main.bw-doc')?.dataset.locale}|${fig.dataset.dg}`; }
function dgZoomAll() {
  S.dgZoom ||= {};
  document.querySelectorAll('#bw-pair figure[data-dg]').forEach((fig) => {
    const z = S.dgZoom[dgZoomKey(fig)];
    const art = fig.querySelector('.fig-art');
    if (!art) return;
    if (z) {
      fig.dataset.zoom = String(Math.round(z.pct));
      art.style.setProperty('--dgz', `${z.w}px`);
      art.style.setProperty('--dgh', `${z.h}px`);
      art.style.setProperty('--dgml', `${z.ml || 0}px`);
      art.style.setProperty('--dgmt', `${z.mt || 0}px`);
      art.style.setProperty('--dgsx', `${z.sx || 0}px`);
      art.style.setProperty('--dgsy', `${z.sy || 0}px`);
      if (art.scrollLeft !== (z.sl || 0)) art.scrollLeft = z.sl || 0;
      if (art.scrollTop !== (z.st || 0)) art.scrollTop = z.st || 0;
    } else {
      delete fig.dataset.zoom;
      for (const v of ['--dgz', '--dgh', '--dgml', '--dgmt', '--dgsx', '--dgsy']) art.style.removeProperty(v);
    }
  });
}
/** Scale the drawing of one figure. mode: 'in' | 'out' | 'fit' | '100' | { f: factor }. at: the pointer {x, y} in client pixels (else the frame's centre). */
function dgZoomFig(fig, mode, at) {
  if (!fig) return;
  S.dgZoom ||= {};
  const key = dgZoomKey(fig);
  const svg = fig.querySelector('svg');
  const art = fig.querySelector('.fig-art');
  if (!svg || !art) return;
  const z = S.dgZoom[key];
  // the page zoom is a CSS `zoom` on the page: getBoundingClientRect() is in screen px, the CSS vars below are in the page's own px (0.15.9 C1)
  const kz = dgPageK(art);
  const natural = svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width / kz;
  // the fitted size is measured unzoomed once, then kept: the frame never changes size under the reader
  const fitW = z?.fitW || svg.getBoundingClientRect().width / kz;
  const fitH = z?.h || art.getBoundingClientRect().height / kz;
  const now = z?.w || fitW;
  const f = mode === 'in' ? 1.25 : mode === 'out' ? 1 / 1.25 : mode?.f || 1;
  let w;
  if (mode === 'fit') w = null;
  else if (mode === '100') w = natural;
  else w = Math.min(natural * 4, Math.max(fitW, now * f)); // the drawing never goes smaller than its fitted frame, so in x N and out x N ends where it began
  const fr = art.getBoundingClientRect();
  // the drawing point under the pointer is pinned while the pointer stays put, so rounding never adds up over a run of steps.
  // the point is kept in the drawing's own coordinates through the SVG's screen matrix, not as a fraction of the SVG box: at «fit» the box is wider
  // than the drawing (preserveAspectRatio centres it), so a fraction of the box is not the point the reader pointed at and every step drifted by the letterbox (9-15 px).
  const held = S.dgHold;
  const holding = !!(held && at && held.key === key && Math.abs(at.x - held.ax) < 2.5 && Math.abs(at.y - held.ay) < 2.5 && performance.now() - held.t < 1500);
  const ax = holding ? held.ax : at?.x ?? fr.left + fr.width / 2;
  const ay = holding ? held.ay : at?.y ?? fr.top + fr.height / 2;
  const ctm0 = svg.getScreenCTM();
  if (!ctm0) return;
  const here = holding ? { x: held.sx, y: held.sy } : new DOMPoint(ax, ay).matrixTransform(ctm0.inverse());
  const place = () => { const m = svg.getScreenCTM(); return m ? new DOMPoint(here.x, here.y).matrixTransform(m) : { x: ax, y: ay }; };
  S.dgHold = at ? { key, ax, ay, sx: here.x, sy: here.y, t: performance.now() } : null;
  if (w == null || Math.abs(w - fitW) < 1) {
    delete S.dgZoom[key];
    dgZoomAll();
    if (S.dg) dgPaint();
    return;
  }
  // slack around the drawing (half the frame each way) so the point under the pointer can always stay under it, even next to an edge
  S.dgZoom[key] = { w: Math.round(w), h: fitH, fitW, pct: (w / natural) * 100, ml: 0, mt: 0, sl: 0, st: 0, sx: z?.sx ?? Math.round(art.clientWidth * 0.5), sy: z?.sy ?? Math.round(art.clientHeight * 0.5) };
  dgZoomAll();
  // keep the drawing point that was under (ax, ay) there: scroll when the drawing overflows the frame, else slide it (never past the frame)
  const zz = S.dgZoom[key];
  for (let pass = 0; pass < 2; pass += 1) {
    const p1 = place();
    const ex = p1.x - ax;
    const ey = p1.y - ay;
    art.scrollLeft += ex / kz;
    art.scrollTop += ey / kz;
    const r2 = svg.getBoundingClientRect();
    const p2 = place();
    const rx = p2.x - ax;
    const ry = p2.y - ay;
    if (Math.abs(rx) > 0.4 || Math.abs(ry) > 0.4) {
      const cs = getComputedStyle(art);
      const vw = art.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const vh = art.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      zz.ml = Math.min(Math.max(0, vw - r2.width / kz), Math.max(0, (zz.ml || 0) - rx / kz));
      zz.mt = Math.min(Math.max(0, vh - r2.height / kz), Math.max(0, (zz.mt || 0) - ry / kz));
      art.style.setProperty('--dgml', `${zz.ml}px`);
      art.style.setProperty('--dgmt', `${zz.mt}px`);
    }
  }
  zz.sl = art.scrollLeft;
  zz.st = art.scrollTop;
  if (S.dg) dgPaint();
}
// the view's scroll is remembered per figure, so a redraw or a render puts it back
document.addEventListener('scroll', (e) => {
  const art = e.target;
  if (!art?.classList?.contains?.('fig-art')) return;
  const fig = art.closest('figure[data-dg]');
  const z = fig && S.dgZoom?.[dgZoomKey(fig)];
  if (z) { z.sl = art.scrollLeft; z.st = art.scrollTop; }
}, true);
/** who gets a Ctrl+wheel that lands on a figure. The drawing, as before, except one case: a gesture that STARTS going out while the drawing is
 *  at its fitted size has nothing left to shrink, so the page zooms out (at page zoom 161 % a figure covers most of the window and held the wheel for ever).
 *  A gesture is the run of events less than 450 ms apart: it keeps its owner, so zooming a drawing out all the way never rolls on into the page. */
let dgWheelG = null;
const dgWheelOwn = new WeakMap();
function dgWheelPage(e) {
  if (dgWheelOwn.has(e)) return dgWheelOwn.get(e);
  const fig = e.target.closest?.('#bw-pair figure[data-dg]');
  let page = false;
  if (fig && !S.dgDragging) {
    const key = dgZoomKey(fig);
    const g = dgWheelG;
    if (g && g.key === key && e.timeStamp - g.t < 450) page = g.page;
    else { const z = S.dgZoom?.[key]; page = e.deltaY > 0 && (!z || z.w <= z.fitW + 1); }
    dgWheelG = { key, page, t: e.timeStamp };
  } else dgWheelG = null;
  dgWheelOwn.set(e, page);
  return page;
}
// Ctrl + wheel over a figure scales the drawing: by deltaY (2^(-dy/300): a mouse notch is about x1.26, a pinch's small events add up smoothly), one update per frame
{
  let pend = null;
  let raf = 0;
  document.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (S.dgDragging) { e.preventDefault(); return; } // a drag is held: the wheel neither zooms nor scrolls the page (L4)
    const fig = e.target.closest?.('#bw-pair figure[data-dg]');
    if (!fig || dgWheelPage(e)) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (!pend || pend.fig !== fig) pend = { fig, f: 1 };
    pend.f = Math.min(1.5, Math.max(1 / 1.5, pend.f * 2 ** (-Math.max(-300, Math.min(300, dy)) / 300)));
    pend.x = e.clientX;
    pend.y = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const p = pend; pend = null; if (p && document.contains(p.fig)) dgZoomFig(p.fig, { f: p.f }, { x: p.x, y: p.y }); });
  }, { passive: false });
}

/* ── 0.15.9 · the canvas (block.frame = { wMm, hMm, mode }) ────────────────────────────────────────────────────────
 * A selected diagram shows eight handles on its canvas. Dragging an edge sizes one dimension, a corner both; a width change is symmetric about the
 * centre (the canvas stays centred on the page, so the grabbed edge follows the pointer); a height change grows downward (the canvas stays under its title).
 * The size snaps to a 5 mm grid that is drawn while dragging and follows the Snap switch (S.snap); Alt drags free (0.1 mm). A readout shows the size in mm,
 * Esc cancels, one drag is one undo step. The size is limited by the room the page leaves (figureRoom): never over a title, the note, the header,
 * the footer, another page or the margin. «Fit to shapes» hugs the drawing; «Fit to page» fills the room. Both editions get the same canvas (the pair is the unit):
 * the same op lands in the other edition in the same undo group (a plain `replace` of <block>/frame; `delete` to go back to the automatic size). */
const DG_CV_STEP = 5;
function dgFrameOf(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) { return DIAGRAM.frameNorm(dgBlock(ptr, ed)?.frame); }
/** The canvas being dragged right now, else the saved one (null = the automatic size). */
function dgFrameNow(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) {
  const l = S.dgFrameLive;
  return l && l.ptr === ptr && l.ed === ed ? l.frame : dgFrameOf(ptr, ed);
}
function dgRoom(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) { return figureRoom(cur(ed).doc, ptr, S.theme); }
/** Put a canvas on the figure's element (class, size variables) without a render; null removes it. */
function dgFrameApply(fig, frame) {
  fig.classList.toggle('fr', !!frame);
  if (frame) {
    fig.dataset.frame = String(frame.mode ?? 0);
    fig.style.setProperty('--frw', `${frame.wMm}mm`);
    fig.style.setProperty('--frh', `${frame.hMm}mm`);
    fig.style.setProperty('--shw', `${dgRoom(fig.dataset.dg, fig.closest('main.bw-doc')?.dataset.locale || S.ed).sheetW}mm`);
  } else {
    fig.style.removeProperty('--shw');
    delete fig.dataset.frame;
    fig.style.removeProperty('--frw');
    fig.style.removeProperty('--frh');
  }
}
/** Save a canvas (or null = automatic) in both editions as one undo step. */
function dgFrameSave(frame, ptr = S.dg.b, ed = S.dg.ed) {
  const g = newGroup();
  const ops = (e) => (frame ? [{ op: 'replace', path: `${ptr}/frame`, value: { wMm: frame.wMm, hMm: frame.hMm, mode: frame.mode ?? 0 } }] : dgBlock(ptr, e)?.frame !== undefined ? [{ op: 'delete', path: `${ptr}/frame` }] : []);
  const mine = ops(ed);
  const o = other(ed);
  const twin = S.both && hasOther() && dgBlock(ptr, o)?.kind === 'diagram' ? ops(o) : [];
  S.dgFrameLive = null;
  if (mine.length) commit(mine, { ed, mirror: false, group: g, rerender: !twin.length });
  if (twin.length) commit(twin, { ed: o, mirror: false, group: g });
}
const dgMm = (px, k = 1) => (px / k) * (25.4 / 96);
function dgCanvasPaint(fig, legMsg = '') {
  const art = fig?.querySelector('.fig-art');
  if (!art || !S.dg || S.dg.b !== fig.dataset.dg) return;
  const en = S.ui === 'en';
  const names = { n: en ? 'top edge' : 'الحافة العليا', s: en ? 'bottom edge' : 'الحافة السفلى', e: en ? 'right edge' : 'الحافة اليمنى', w: en ? 'left edge' : 'الحافة اليسرى', ne: en ? 'top right corner' : 'الزاوية العليا اليمنى', nw: en ? 'top left corner' : 'الزاوية العليا اليسرى', se: en ? 'bottom right corner' : 'الزاوية السفلى اليمنى', sw: en ? 'bottom left corner' : 'الزاوية السفلى اليسرى' };
  const ui = document.createElement('div');
  ui.className = 'dg-ui dg-cv';
  const live = S.dgFrameLive && S.dgFrameLive.ptr === S.dg.b;
  if (live && S.snap && !S.dgFrameLive.alt) ui.insertAdjacentHTML('beforeend', `<i class="dg-cv-grid" style="background-size:${DG_CV_STEP}mm ${DG_CV_STEP}mm"></i>`);
  for (const h of Object.keys(names)) ui.insertAdjacentHTML('beforeend', `<b class="dg-cv-h" data-dg-cv="${h}" role="button" aria-label="${esc(`${t('dgCvSize')}: ${names[h]}`)}" title="${esc(`${t('dgCvSize')}: ${names[h]}`)}"></b>`);
  if (legMsg) ui.insertAdjacentHTML('beforeend', `<span class="dg-cv-note" role="note">${esc(legMsg)}</span>`);
  // a stored drawing without model.routing offers its one-click apply on the sheet, top right in both languages (the ribbon's diagram tab is full: 28 tools; the bottom holds the legend, the top left corner is where a press on the empty drawing lands)
  if (+dgBlock(fig.dataset.dg, S.dg.ed)?.model?.routing !== 2) ui.insertAdjacentHTML('beforeend', `<button type="button" class="dg-cv-route" data-dg-cv-route title="${esc(t('dgCvRoute'))}" style="position:absolute;right:8px;top:${legMsg ? 34 : 8}px;padding:2px 9px;border-radius:6px;border:1px solid #14233a;background:#fff;color:#14233a;font-family:inherit;font-weight:600;font-size:12px;line-height:1.5;cursor:pointer;pointer-events:auto">${esc(t('dgCvRoute'))}</button>`);
  if (live) {
    const f = S.dgFrameLive.frame;
    ui.insertAdjacentHTML('beforeend', `<span class="dg-cv-read" dir="ltr">${f.wMm.toFixed(1)} × ${f.hMm.toFixed(1)} mm${S.dgFrameLive.capped ? ` · ${esc(t('dgCvMax'))}` : ''}</span>`);
  }
  art.appendChild(ui);
}
/** The canvas as it is on screen now, in mm (a figure that has no saved canvas is measured). */
function dgFrameStart(fig, art) {
  const saved = dgFrameOf();
  if (saved) return saved;
  const cs = getComputedStyle(art);
  const w = art.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = art.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const room = dgRoom();
  return { wMm: Math.min(room.wMm, Math.max(20, Math.round(dgMm(w) * 10) / 10)), hMm: Math.min(room.hMm, Math.max(20, Math.round(dgMm(h) * 10) / 10)), mode: 0 };
}
function dgCanvasDrag(e, handle) {
  const ptr = S.dg.b;
  const ed = S.dg.ed;
  const fig = dgFig(ptr, ed);
  const art = fig?.querySelector('.fig-art');
  if (!art) return;
  e.preventDefault();
  e.stopPropagation();
  const kz = dgPageK(art);
  const room = dgRoom(ptr, ed);
  const f0 = dgFrameStart(fig, art);
  const had = !!dgFrameOf(ptr, ed);
  const model = dgModel(ptr, ed);
  const sx = e.clientX;
  const sy = e.clientY;
  const side = handle.dataset.dgCv;
  let moved = false;
  const snap = (v, alt) => (S.snap && !alt ? Math.round(v / DG_CV_STEP) * DG_CV_STEP : Math.round(v * 10) / 10);
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    moved = true;
    const dx = dgMm(ev.clientX - sx, kz);
    const dy = dgMm(ev.clientY - sy, kz);
    let w = f0.wMm;
    let h = f0.hMm;
    if (side.includes('e')) w = f0.wMm + 2 * dx;
    if (side.includes('w')) w = f0.wMm - 2 * dx;
    if (side.includes('s')) h = f0.hMm + dy;
    if (side.includes('n')) h = f0.hMm - dy;
    if (/[ew]/.test(side)) w = snap(w, ev.altKey);
    if (/[ns]/.test(side)) h = snap(h, ev.altKey);
    const capped = w > room.wMm || h > room.hMm;
    const frame = { wMm: Math.round(Math.min(room.wMm, Math.max(20, w)) * 10) / 10, hMm: Math.round(Math.min(room.hMm, Math.max(20, h)) * 10) / 10, mode: 0 };
    S.dgFrameLive = { ptr, ed, frame, capped, alt: ev.altKey };
    dgFrameApply(fig, frame);
    dgDraw(model);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    offEsc();
    const live = S.dgFrameLive;
    S.dgFrameLive = null;
    if (!moved || !live) return;
    if (had && live.frame.wMm === f0.wMm && live.frame.hMm === f0.hMm) { dgDraw(model); return; }
    dgFrameSave(live.frame, ptr, ed);
  };
  const offEsc = dgDragEsc(() => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.dgFrameLive = null;
    if (moved) { dgFrameApply(fig, had ? dgFrameOf(ptr, ed) : null); dgDraw(model); }
    moved = false;
  });
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
document.addEventListener('pointerdown', (e) => {
  const r = e.target.closest?.('[data-dg-cv-route]');
  if (r && e.button === 0 && S.dg) { e.preventDefault(); e.stopPropagation(); dgCanvasAction('dgCvRoute'); return; }
  const h = e.target.closest?.('[data-dg-cv]');
  if (!h || e.button !== 0 || !S.dg) return;
  dgCanvasDrag(e, h);
}, true);
function dgCanvasAction(a) {
  if (!S.dg?.b || !dgBlock()) return;
  const ptr = S.dg.b;
  const ed = S.dg.ed;
  if (a === 'dgCvAuto') { dgFrameSave(null, ptr, ed); return; }
  // one click puts a stored drawing on the arrows that never lie on each other (spaced, jump arcs, small shadows); no shape moves
  if (a === 'dgCvRoute') { dgSave(DIAGRAM.applyRouting(dgBlock(ptr, ed).model), ptr, ed); return; }
  const room = dgRoom(ptr, ed);
  if (a === 'dgCvPage') { dgFrameSave({ wMm: room.wMm, hMm: room.hMm, mode: 2 }, ptr, ed); return; }
  if (a === 'dgCvShapes') {
    const view = DIAGRAM.resolve(dgModel(ptr, ed), { theme: S.theme, locale: ed }).view;
    dgFrameSave({ ...DIAGRAM.frameHug(view, room.wMm, room.hMm), mode: 1 }, ptr, ed);
  }
}
bwExt({ cmds: ['dgCvShapes', 'dgCvPage', 'dgCvAuto', 'dgCvRoute', 'dgJoin'].map((id) => ({ id, group: 'diagram', edit: true })), on: { render: () => dgRibbonCanvas() }, expose: { diagram: { autoLayout: dgAutoLayoutAt, check: dgCheckAt } } });