/** editor_action autoLayout {pointer, aspect, maxNodes, locale}: lays the diagram out for the frame it prints in (block.frame, else the automatic figure's measured box)
 *  as ONE undoable replace, and returns the legibility result. A graph that no single sheet can hold is left as one drawing and reported (`figures` = how many legible figures
 *  it would take): the splitFigure action cuts it. */
function dgAutoLayoutAt(ptr, args = {}, ed = S.ed) {
  const blk = dgBlock(ptr, ed);
  if (!blk || blk.kind !== 'diagram') throw new Error(`no diagram block at ${ptr}`);
  const r = DIAGRAM.autoLayout(blk.model || {}, { aspect: +args.aspect > 0 ? +args.aspect : undefined, maxNodes: +args.maxNodes > 0 ? +args.maxNodes : 20, frame: blk.frame, theme: S.theme, locale: ed === 'en' ? 'en' : 'ar' });
  commit([{ op: 'replace', path: `${ptr}/model`, value: r.model, old: blk.model }], { ed });
  return { pointer: ptr, ok: r.ok, ...dgCheckSummary(r.legibility), aspect: r.aspect, figures: r.figures ? r.figures.length : 1, splitAdvised: !!r.figures && !r.legibility.ok };
}
/** The check for one diagram block, in the frame it prints in: legibility plus the arrow overlap and crossing counts. */
function dgCheckAt(ptr, ed = S.ed) {
  const blk = dgBlock(ptr, ed);
  if (!blk || blk.kind !== 'diagram') throw new Error(`no diagram block at ${ptr}`);
  return { pointer: ptr, ...dgCheckSummary(DIAGRAM.legibility(blk.model || {}, { frame: blk.frame, theme: S.theme, locale: ed === 'en' ? 'en' : 'ar' })) };
}
function dgCheckSummary(lg) { return ({ legible: lg.ok, minPtPrinted: lg.minPtPrinted, minPt: lg.minPt, frameMm: lg.frameMm, small: lg.small.length, textOverlaps: lg.overlaps.length, arrowOverlaps: lg.wireOverlaps, arrowCrossings: lg.wireCrossings, jumps: lg.wires.hops, routing: lg.wires.routing }); }
/** The two canvas tools join the diagram tab of the ribbon (its tab list lives in 25-ribbon.js; they are added once, after it has loaded). */
function dgRibbonCanvas() {
  if (dgRibbonCanvas.done || typeof RB_TABS === 'undefined') return;
  dgRibbonCanvas.done = true;
  const tab = RB_TABS.find((x) => x[0] === 'diagram');
  const nodesGroup = tab?.[1].find((g) => g[0] === 'nodes');
  if (nodesGroup && !nodesGroup[1].includes('dgJoin')) nodesGroup[1].push('dgJoin'); // the join point sits with the shapes it joins
  RB_LISTED.add('dgJoin');
  if (!tab || tab[1].some((g) => g[0] === 'canvas')) return;
  tab[1].push(['canvas', ['dgCvShapes', 'dgCvPage']]);
  RB_LISTED.add('dgCvShapes'); RB_LISTED.add('dgCvPage'); RB_LISTED.add('dgCvAuto'); RB_LISTED.add('dgCvRoute');
  if (typeof RB !== 'undefined') RB.defs = null;
}
/** Live redraw of one diagram while dragging (no op yet): the drawing only, then the paint. */
function dgDraw(model) {
  const fig = dgFig();
  if (!fig) return;
  const frame = dgFrameNow();
  fig.querySelector('.fig-art').innerHTML = DIAGRAM.render(model, { theme: S.theme, locale: S.dg.ed, editor: true, ...(frame ? { frame } : {}) });
  dgPaint();
}
const dgSnap = (v) => (S.snap ? Math.round(v / 10) * 10 : Math.round(v));
function dgPoint(svg, ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function dgSelect(ptr, ed, patch) {
  // a paragraph that still holds the caret gets it back at every render (holdCaret) and its focus deselects the drawing, so the first edit made from the ribbon dropped the selection
  { const ae = document.activeElement; if (ae?.closest?.('#bw-pair [data-p]')) ae.blur(); }
  S.dg = { b: ptr, ed, nodes: [], edge: null, ...patch };
  S.sel = { p: null, b: ptr, ed };
  S.selOv = null;
  if (ed !== S.ed) S.ed = ed;
  paintSel();
  refreshUi();
  dgPaint();
}
document.addEventListener('pointerdown', (e) => {
  const fig = e.target.closest?.('#bw-pair figure[data-dg]');
  if (!fig || e.button !== 0 || e.target.closest('[data-p]')) return;
  const svg = fig.querySelector('svg');
  if (!svg || !svg.contains(e.target)) return;
  const ptr = fig.dataset.dg;
  S.dgPickedAt = performance.now(); // the click that follows may land on the page wrapper if this press re-laid the page out: not an empty-space click
  const ed = fig.closest('main.bw-doc').dataset.locale;
  const bendEl = e.target.closest('[data-dg-bend]');
  const ghostEl = e.target.closest('[data-dg-ghost]');
  const endEl = e.target.closest('[data-dg-end]');
  if (S.dg?.edge && S.dg.b === ptr && S.dg.ed === ed) {
    if (bendEl) { dgBendDrag(e, svg, ptr, ed, bendEl); return; }
    if (ghostEl) { dgGhostDrag(e, svg, ptr, ed, ghostEl); return; }
    if (endEl) { dgEndDrag(e, svg, ptr, ed, endEl); return; }
  }
  const handle = e.target.closest('[data-dg-handle]');
  const nodeEl = e.target.closest('[data-dg-node]');
  const edgeEl = e.target.closest('[data-dg-edge]');
  e.preventDefault();
  const lgEl0 = e.target.closest('[data-dg-lg]');
  if (lgEl0 && !nodeEl && !edgeEl && !S.dgPick) { dgSelect(ptr, ed, { legend: lgEl0.dataset.dgLg }); return; }
  if (S.dgPick && nodeEl) { dgFinishPick(nodeEl.dataset.dgNode); return; }
  if (edgeEl && !nodeEl) { dgSelect(ptr, ed, { edge: edgeEl.dataset.dgEdge }); return; }
  if (!nodeEl && !handle) { dgSelect(ptr, ed, {}); return; }
  const id = handle ? handle.dataset.dgHandle : nodeEl.dataset.dgNode;
  const same = S.dg?.b === ptr && S.dg.ed === ed;
  let nodes = same ? [...S.dg.nodes] : [];
  if (e.shiftKey && !handle) nodes = nodes.includes(id) ? nodes.filter((x) => x !== id) : [...nodes, id];
  else if (!nodes.includes(id)) nodes = [id];
  dgSelect(ptr, ed, { nodes });
  const base = dgModel(ptr, ed);
  const start = dgPoint(svg, e);
  let moved = false;
  let work = base;
  const move = (ev) => {
    const p = dgPoint(fig.querySelector('svg') || svg, ev);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    work = JSON.parse(JSON.stringify(base));
    for (const n of work.nodes) {
      const o = base.nodes.find((x) => x.id === n.id);
      if (handle && n.id === id) { n.w = Math.max(24, dgSnap(o.w + dx)); n.h = Math.max(20, dgSnap(o.h + dy)); }
      else if (!handle && nodes.includes(n.id)) { n.x = dgSnap(o.x + dx); n.y = dgSnap(o.y + dy); }
    }
    if (!handle) dgCarryBends(work, base, nodes, dgSnap(dx), dgSnap(dy));
    dgDraw(work);
  };
  const up = () => {
    offEsc();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  const offEsc = dgDragEsc(() => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgDraw(base);
    moved = false;
  });
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
document.addEventListener('dblclick', (e) => {
  const fig = e.target.closest?.('#bw-pair figure[data-dg]');
  if (!fig || !S.dg) return;
  const n = e.target.closest('[data-dg-node]');
  const edEl = e.target.closest('[data-dg-edge]');
  const lgEl = e.target.closest('[data-dg-legend]');
  if (lgEl && !n) { dgInline({ legend: lgEl.dataset.dgLegend }); return; }
  // on a selected arrow, a double-click on a joint removes it; on the line (or a ghost) it adds one right there; on the arrow's caption it edits the words
  const capEl = e.target.closest('[data-dg-cap]');
  if (capEl && !n) { dgInline({ edge: capEl.dataset.dgCap }); return; }
  if (S.dg.edge && !n) {
    const jEl = e.target.closest('[data-dg-bend]');
    if (jEl) { S.dg.joint = dgRoute(dgModel(), S.dg.edge)?.[+jEl.dataset.dgBend] || null; dgJointDelete(); return; }
    const gEl = e.target.closest('[data-dg-ghost]');
    if (gEl) { dgJointAddAt([+gEl.getAttribute('cx'), +gEl.getAttribute('cy')], +gEl.dataset.dgGhost); return; }
    if (e.target.closest('[data-dg-end]')) return;
    if (edEl) { const svg2 = fig.querySelector('svg'); const p = dgPoint(svg2, e); dgJointAddAt([p.x, p.y]); return; }
  }
  if (n) {
    const node = dgModel().nodes.find((x) => x.id === n.dataset.dgNode);
    const onSub = !!(node?.sub && e.target.closest('text')?.textContent === node.sub);
    S.dg.nodes = [n.dataset.dgNode];
    dgInline({ node: n.dataset.dgNode, field: onSub ? 'sub' : 'label' });
  }
});
document.addEventListener('keydown', (e) => {
  if (!S.dg || e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') || e.composedPath?.().some((x) => x === host)) return;
  if (e.key === 'Escape' && S.dgPick) { S.dgPick = null; refreshUi(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && S.dg.nodes.length && !e.altKey) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const step = e.shiftKey ? 10 : 1;
    const m = dgModel();
    const base = JSON.parse(JSON.stringify(m));
    for (const n of m.nodes) if (S.dg.nodes.includes(n.id)) { n.x += arrows[e.key][0] * step; n.y += arrows[e.key][1] * step; }
    dgCarryBends(m, base, S.dg.nodes, arrows[e.key][0] * step, arrows[e.key][1] * step);
    dgSave(m);
    return;
  }
  if (S.dg.legend && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); e.stopImmediatePropagation(); dgAction('dgLgDel'); return; }
  if (S.dg.legend && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); e.stopImmediatePropagation(); dgInline({ legend: S.dg.legend }); return; }
  if ((e.key === 'Enter' || e.key === 'F2') && (S.dg.nodes.length === 1 || S.dg.edge)) { e.preventDefault(); e.stopImmediatePropagation(); dgInline(S.dg.edge ? { edge: S.dg.edge } : { node: S.dg.nodes[0] }); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.dg.edge && S.dg.joint) { e.preventDefault(); e.stopImmediatePropagation(); dgAction('dgBendDel'); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.dg.edge && S.dg.end) { e.preventDefault(); e.stopImmediatePropagation(); return; } // an arrow never dangles: an end is moved, not deleted
  if ((e.key === 'Delete' || e.key === 'Backspace') && (S.dg.nodes.length || S.dg.edge)) { e.preventDefault(); e.stopImmediatePropagation(); dgAction('dgDel'); }
}, true);
root.addEventListener('change', (e) => {
  const el = e.target.closest?.('select[data-dg]');
  if (!el || !S.dg) return;
  const m = dgModel();
  const v = el.value;
  const node = m.nodes.find((n) => n.id === S.dg.nodes[0]);
  const edge = m.edges.find((x) => x.id === S.dg.edge);
  switch (el.dataset.dg) {
    case 'kind': if (node) { node.kind = v; Object.assign(node, DIAGRAM.measure(node), { x: node.x, y: node.y }); if (v === 'symbol' && !node.icon) node.icon = 'person'; } break;
    case 'color': if (node) { if (v) node.color = v; else delete node.color; } break;
    case 'badge': if (node) { if (!v) delete node.icons; else node.icons = v === '-' ? [] : [v]; } break;
    case 'icon': if (node) node.icon = v; break;
    case 'fs': {
      if (!node || node.kind === 'join') return;
      if (v && +v >= 8 && +v <= 40) node.fs = +v; else delete node.fs;
      if (!node.sized) { // the shape grows or shrinks around its centre, as with an edited label
        const cx = node.x + node.w / 2;
        const cy = node.y + node.h / 2;
        const sz = DIAGRAM.measure(node);
        Object.assign(node, sz, { x: Math.round(cx - sz.w / 2), y: Math.round(cy - sz.h / 2) });
      }
      break;
    }
    case 'wire': if (edge) edge.kind = v; break;
    case 'symbol': if (v) dgAdd(m, 'symbol', { icon: v }); break;
    default: return;
  }
  dgSave(m);
});
/** An arrow whose two ends both move keeps its hand-set bends in the same place relative to them. */
function dgCarryBends(work, base, ids, dx, dy) {
  for (const e of work.edges) {
    const o = base.edges.find((x) => x.id === e.id);
    if (o?.via && ids.includes(e.from) && ids.includes(e.to)) e.via = o.via.map(([x, y]) => [x + dx, y + dy]);
  }
}
/** A free spot for a new shape: under the drawing's lowest shape, at its centre line. */
function dgAdd(m, kind, extra = {}) {
  const W = DIAGRAM.words(S.dg.ed);
  const labels = { staff: W.newStage, applicant: W.applicant, start: W.start, payment: W.payment, rework: W.rework, system: W.system, decision: W.action, ok: W.ok, stop: W.stop, note: W.note, group: '', text: W.newText, symbol: '' };
  const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const n = { id, kind, label: labels[kind] ?? '', ...extra };
  Object.assign(n, DIAGRAM.measure(n));
  const solid = m.nodes.filter((x) => x.kind !== 'group');
  const maxY = solid.length ? Math.max(...solid.map((x) => x.y + x.h)) : 0;
  const midX = solid.length ? (Math.min(...solid.map((x) => x.x)) + Math.max(...solid.map((x) => x.x + x.w))) / 2 : 200;
  n.x = dgSnap(midX - n.w / 2);
  n.y = dgSnap(maxY + 40);
  if (kind === 'group') m.nodes.unshift(n); else m.nodes.push(n);
  S.dg.nodes = [id];
  S.dg.edge = null;
  return n;
}
function dgFinishPick(targetId) {
  const pk = S.dgPick;
  S.dgPick = null;
  const m = dgModel();
  if (pk.mode === 'connect') {
    if (pk.from !== targetId) m.edges.push({ id: `e${Date.now().toString(36)}`, from: pk.from, to: targetId, label: '' });
  } else {
    const e = m.edges.find((x) => x.id === pk.edge);
    if (e) { e[pk.mode] = targetId; delete e[pk.mode === 'from' ? 'fromAnchor' : 'toAnchor']; delete e.via; }
  }
  // a new arrow's meaning is settled by the same rules as the harvest (to a refusal = red, backwards = dashed)
  for (const e of m.edges) if (e.id.startsWith('e') && !e.label && e.kind === undefined) delete e.kind;
  dgSave(DIAGRAM.classify(m));
}
const ALIGN = { dgAlignL: ['x', 0], dgAlignC: ['x', 0.5], dgAlignR: ['x', 1], dgAlignT: ['y', 0], dgAlignM: ['y', 0.5], dgAlignB: ['y', 1] };
const ADD = { dgStaff: 'staff', dgApplicant: 'applicant', dgStart: 'start', dgPayment: 'payment', dgRework: 'rework', dgSystem: 'system', dgDecision: 'decision', dgOk: 'ok', dgStop: 'stop', dgNote: 'note', dgGroup: 'group', dgText: 'text', dgJoin: 'join' };
/** every symbol by its full name, on a panel of its own (never inside the toolbar's «…» menu); a pick adds it, selected. */
function dgSymbolGallery() {
  document.querySelector('.bw-dg-gallery')?.remove();
  dgGalleryCss();
  dgGalleryOpen();
}
function dgGalleryCss() {
  if (!document.getElementById('bw-dg-gallery-css')) {
    const st = document.createElement('style');
    st.id = 'bw-dg-gallery-css';
    st.textContent = '.bw-dg-gallery{position:fixed;z-index:calc(2147483*1000);box-sizing:border-box;width:min(480px,92vw);max-height:min(62vh,440px);overflow:auto;padding:10px;background:#fff;color:#14233a;border:1px solid #b9c3d3;border-radius:12px;box-shadow:0 12px 32px rgba(10,25,50,.28);display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:6px;font:600 15px/1.35 inherit}.bw-dg-gallery button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 12px;min-height:40px;border-radius:8px;border:1px solid #d3dae6;white-space:normal;overflow-wrap:anywhere}.bw-dg-gallery button:hover,.bw-dg-gallery button:focus-visible{background:#e1eaf4;border-color:#005fc2}';
    document.head.appendChild(st);
  }
}
function dgGalleryOpen() {
  const el = document.createElement('div');
  el.className = 'bw-dg-gallery';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('dgSymbol'));
  el.dir = uiDir();
  el.lang = S.ui;
  el.style.fontFamily = 'inherit';
  el.innerHTML = DIAGRAM.SYMBOLS.map((k) => `<button type="button" data-sym="${k}">${esc(t(`sym_${k}`))}</button>`).join('');
  document.body.appendChild(el);
  const bt = dgAnchor('dgSymbol');
  const w = el.getBoundingClientRect().width;
  const left = bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2);
  el.style.left = `${left}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : innerHeight * 0.3) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); }; // a press anywhere outside it, the background included, closes the popup
  const esc2 = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc2, true);
  const at = S.dg ? { b: S.dg.b, ed: S.dg.ed } : null; // a press outside the page clears the pick: keep where the drawing was
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-sym]');
    if (!b || !at || !dgBlock(at.b, at.ed)) return;
    close();
    dgSelect(at.b, at.ed, {});
    const m = dgModel();
    dgAdd(m, 'symbol', { icon: b.dataset.sym });
    dgSave(m);
  });
  el.querySelector('button')?.focus();
}
async function dgAction(a) {
  if (a === 'dgSymbol') { dgSymbolGallery(); return; }
  if (/^dgCv/.test(a)) { dgCanvasAction(a); return; }
  if (a === 'addDiagram') {
    const b = blockOf(S.sel?.b);
    const arr = b ? b.arr : '/chapters/0/sections/0/blocks';
    const at = b ? b.i + 1 : 0;
    const mk = (ed) => ({ kind: 'diagram', caption: HL(ed).figureCaption.replace('{name}', cur(ed).name || ''), model: DIAGRAM.starter(ed) }); // each edition's own language (DOCS-02)
    commit([{ op: 'insert', path: `${arr}/${at}`, value: mk(S.ed), mirrorValue: mk(other(S.ed)) }]);
    dgSelect(`${arr}/${at}`, S.ed, {});
    return;
  }
  if (!a.startsWith('dg') || !S.dg || !dgBlock()) return;
  const m = dgModel();
  const sel = m.nodes.filter((n) => S.dg.nodes.includes(n.id));
  const edge = m.edges.find((e) => e.id === S.dg.edge);
  if (ADD[a]) { dgAdd(m, ADD[a]); dgSave(m); return; }
  if (ALIGN[a] && sel.length > 1) {
    const [ax, f] = ALIGN[a];
    const dim = ax === 'x' ? 'w' : 'h';
    const lo = Math.min(...sel.map((n) => n[ax]));
    const hi = Math.max(...sel.map((n) => n[ax] + n[dim]));
    for (const n of sel) n[ax] = dgSnap(f === 0 ? lo : f === 1 ? hi - n[dim] : (lo + hi) / 2 - n[dim] / 2);
    dgSave(m);
    return;
  }
  switch (a) {
    case 'dgDistH': case 'dgDistV': {
      if (sel.length < 3) return;
      const [ax, dim] = a === 'dgDistH' ? ['x', 'w'] : ['y', 'h'];
      sel.sort((p, q) => p[ax] - q[ax]);
      const span = sel.at(-1)[ax] + sel.at(-1)[dim] - sel[0][ax];
      const gap = (span - sel.reduce((s, n) => s + n[dim], 0)) / (sel.length - 1);
      let pos = sel[0][ax];
      for (const n of sel) { n[ax] = Math.round(pos); pos += n[dim] + gap; }
      break;
    }
    case 'dgWrap': {
      if (!sel.length) return;
      const pad = 15;
      const l = Math.min(...sel.map((n) => n.x)) - pad;
      const tp = Math.min(...sel.map((n) => n.y)) - pad;
      m.nodes.unshift({ id: `g${Date.now().toString(36)}`, kind: 'group', label: '', x: l, y: tp, w: Math.max(...sel.map((n) => n.x + n.w)) + pad - l, h: Math.max(...sel.map((n) => n.y + n.h)) + pad - tp });
      break;
    }
    case 'dgLabel': case 'dgSub': if (sel[0]) dgInline({ node: sel[0].id, field: a === 'dgSub' ? 'sub' : 'label' }); return;
    case 'dgEdgeLabel': if (edge) dgInline({ edge: edge.id }); return;
    case 'dgBendAdd': {
      if (!edge) return;
      const w = dgWire(m, edge.id);
      if (!w) return;
      // one joint at the middle of the segment after the selected joint (else the longest segment)
      const len = (i) => Math.hypot(w.route[i + 1][0] - w.route[i][0], w.route[i + 1][1] - w.route[i][1]);
      let i = 0;
      const sk = S.dg.joint ? w.route.findIndex((q) => dgNear(q, S.dg.joint)) : -1;
      if (sk >= 0 && sk < w.route.length - 1) i = sk;
      else for (let j = 1; j + 1 < w.route.length; j += 1) if (len(j) > len(i)) i = j;
      const mid = DIAGRAM.wireMid(w, i);
      dgJointAddAt(mid, i);
      return;
    }
    case 'dgBendDel': dgJointDelete(); return;
    case 'dgLgText': if (S.dg.legend) dgInline({ legend: S.dg.legend }); return;
    case 'dgLgDel': {
      if (!S.dg.legend) return;
      m.legendHide = [...new Set([...(Array.isArray(m.legendHide) ? m.legendHide : []), S.dg.legend])];
      S.dg.legend = null;
      break;
    }
    case 'dgLgReset': {
      if (!(m.legendHide || m.legendLook || m.legend !== undefined)) return;
      delete m.legendHide; delete m.legendLook; delete m.legend;
      S.dg.legend = null;
      break;
    }
    case 'dgLgLook': {
      const key = S.dg.legend;
      if (!key) return;
      const opts = [['', t('dgAuto2')], ...['staff', 'applicant', 'payment', 'rework', 'system', 'ok', 'stop', 'note'].map((k) => [`skin:${k}`, t(`dgk_${k}`)]), ...DIAGRAM.WIRE_KINDS.map((k) => [`wire:${k}`, t(`dgw_${k}`)]), ...DIAGRAM.SYMBOLS.map((k) => [`sym:${k}`, t(`sym_${k}`)])];
      dgChoiceMenu('dgLgLook', t('dgLgLook'), opts, m.legendLook?.[key] || '', (v) => {
        const m2 = dgModel();
        const lk = m2.legendLook && typeof m2.legendLook === 'object' ? { ...m2.legendLook } : {};
        if (v) lk[key] = v; else delete lk[key];
        if (Object.keys(lk).length) m2.legendLook = lk; else delete m2.legendLook;
        dgSave(m2);
      });
      return;
    }
    case 'dgRoute': case 'dgHead': case 'dgTail': case 'dgLine': case 'dgWeight': if (edge) dgEdgeMenu(a.slice(2).toLowerCase()); return;
    case 'dgRouteAuto': {
      // «reset to automatic»: the joints and the anchors go, the arrow finds its own path again (its style stays)
      if (!edge || !(edge.via || edge.fromAnchor || edge.toAnchor)) return;
      delete edge.via; delete edge.fromAnchor; delete edge.toAnchor;
      S.dg.joint = null; S.dg.end = null;
      break;
    }
    case 'dgZoomIn': dgZoomFig(dgFig(), 'in'); return;
    case 'dgZoomOut': dgZoomFig(dgFig(), 'out'); return;
    case 'dgZoomFit': dgZoomFig(dgFig(), 'fit'); return;
    case 'dgZoom100': dgZoomFig(dgFig(), '100'); return;
    case 'dgReverse': {
      if (!edge) return;
      [edge.from, edge.to] = [edge.to, edge.from];
      const fa = edge.fromAnchor; const ta = edge.toAnchor;
      delete edge.fromAnchor; delete edge.toAnchor;
      if (ta) edge.fromAnchor = ta;
      if (fa) edge.toAnchor = fa;
      if (edge.via) edge.via = [...edge.via].reverse();
      break;
    }
    case 'dgFrom': case 'dgTo': if (edge) { S.dgPick = { mode: a === 'dgFrom' ? 'from' : 'to', edge: edge.id }; toast(t('dgPickTarget'), 'info'); } return;
    case 'dgConnect': if (sel[0]) { S.dgPick = { mode: 'connect', from: sel[0].id }; toast(t('dgPickTarget'), 'info'); } return;
    case 'dgDup': {
      if (!sel.length) return;
      const ids = [];
      for (const n of sel) { const c = { ...JSON.parse(JSON.stringify(n)), id: `n${Date.now().toString(36)}${ids.length}`, x: n.x + 20, y: n.y + 20 }; delete c.auto; m.nodes.push(c); ids.push(c.id); }
      S.dg.nodes = ids;
      break;
    }
    case 'dgDel': {
      if (edge) { m.edges = m.edges.filter((e) => e !== edge); S.dg.edge = null; break; }
      const gone = new Set(S.dg.nodes);
      m.nodes = m.nodes.filter((n) => !gone.has(n.id));
      m.edges = m.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
      S.dg.nodes = [];
      break;
    }
    case 'dgFront': case 'dgBack': {
      const rest = m.nodes.filter((n) => !S.dg.nodes.includes(n.id));
      m.nodes = a === 'dgFront' ? [...rest, ...sel] : [...sel, ...rest];
      break;
    }
    case 'dgAuto': { const out = DIAGRAM.layout(m, { force: true }); dgSave(out); return; }
    case 'dgReset': {
      const baseBlk = (() => { try { return get(cur(S.dg.ed).base, S.dg.b); } catch { return null; } })();
      dgSave(baseBlk?.kind === 'diagram' ? DIAGRAM.ensure(baseBlk.model) : DIAGRAM.layout(m, { force: true }));
      return;
    }
    case 'dgLegend': { S.dg.legend = null; m.legend = m.legend === false ? undefined : false; if (m.legend === undefined) delete m.legend; break; }
    case 'dgMermaidOut': download(`${S.svc}.${S.dg.ed}.diagram.mmd`, DIAGRAM.toMermaid(m), 'text/plain'); return;
    case 'dgMermaidIn': {
      const code = await ask(t('dgMermaidPrompt'), DIAGRAM.toMermaid(m));
      if (!code) return;
      try { dgSave(DIAGRAM.fromMermaid(code, { locale: S.dg.ed })); } catch (err) { toast(t('dgMermaidBad', { x: err.message }), 'err'); }
      return;
    }
    default: return;
  }
  dgSave(m);
}
