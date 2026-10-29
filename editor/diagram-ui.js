/* Business-Wrap editor — diagram editing, in place on the page (concatenated after editor.js).
 * A diagram block holds a model (engine/diagram.mjs). Click a shape → shape tools in the toolbar's
 * selection section; click an arrow → arrow tools; click the empty drawing → diagram tools (add shapes,
 * symbols, layout, Mermaid). Drag to move (grid snap), drag the corner handle to resize, arrow keys
 * nudge, double-click (or Enter) edits a label in place; a selected arrow shows bend handles (drag a segment
 * across, drag a corner, add/remove a bend, auto route); Ctrl+wheel or the zoom tools zoom the drawing. Every change is ONE `replace` op on <block>/model, so undo/redo,
 * the edits JSON, Save HTML, the PDF and the DOCX all carry it.
 * Declarations only (hoisted): boot() in editor.js runs before this file's statements. */
function dgClear() { S.dg = null; S.dgPick = null; }
function dgBlock(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) { return ptr ? get(cur(ed).doc, ptr) : null; }
function dgModel(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) { return DIAGRAM.ensure(dgBlock(ptr, ed)?.model || {}); }
function dgFig(ptr = S.dg?.b, ed = S.dg?.ed || S.ed) { return mainOf(ed)?.querySelector(`figure[data-dg="${CSS.escape(ptr)}"]`); }
function dgSave(model, ptr = S.dg.b, ed = S.dg.ed) {
  const blk = dgBlock(ptr, ed);
  commit([{ op: 'replace', path: `${ptr}/model`, value: model, old: blk.model }], { ed });
}
const dgNodeName = (n) => t(`dgk_${n.kind}`);
function zoomKeep() { return ['dgZoomOut', 'dgZoomFit', 'dgZoomIn']; } // a declaration: boot() may draw before this file's statements run
function dgContext() {
  const d = S.dg;
  if (!d || !dgBlock()) return null;
  const m = dgModel();
  const node = d.nodes.length === 1 ? m.nodes.find((n) => n.id === d.nodes[0]) : null;
  const edge = d.edge ? m.edges.find((e) => e.id === d.edge) : null;
  const opt = (v, cur0, label) => `<option value="${esc(v)}"${v === cur0 ? ' selected' : ''}>${esc(label)}</option>`;
  const pick = (name, label, opts) => `<label class="pick"><span class="vh">${esc(label)}</span><select data-dg="${name}" aria-label="${esc(label)}" title="${esc(label)}">${opts}</select></label>`;
  if (edge) {
    const sel = pick('wire', t('dgWire'), DIAGRAM.WIRE_KINDS.map((k) => opt(k, edge.kind, t(`dgw_${k}`))).join(''));
    return { cat: 'arrow', label: t('selArrow', { x: t(`dgw_${edge.kind}`) }), groups: [[sel, 'dgEdgeLabel', 'dgBendAdd', 'dgRouteAuto'], ['dgBendDel', 'dgReverse', 'dgFrom', 'dgTo', 'dgDel']], keep: zoomKeep() };
  }
  if (d.nodes.length > 1) return { cat: 'arrange', label: t('selMulti', { n: d.nodes.length }), groups: [['dgAlignL', 'dgAlignC', 'dgAlignR', 'dgDistH', 'dgDup', 'dgDel'], ['dgAlignT', 'dgAlignM', 'dgAlignB', 'dgDistV', 'dgWrap', 'dgFront', 'dgBack']], keep: zoomKeep() };
  if (node) {
    const kinds = pick('kind', t('dgKind'), DIAGRAM.KINDS.map((k) => opt(k, node.kind, t(`dgk_${k}`))).join(''));
    const colours = pick('color', t('dgColour'), [opt('', node.color || '', t('dgAuto2')), ...DIAGRAM.COLORS.map((k) => opt(k, node.color, t(`dgk_${k === 'ok' ? 'ok' : k === 'stop' ? 'stop' : k}`)))].join(''));
    const icon = node.kind === 'symbol'
      ? pick('icon', t('dgIcon'), DIAGRAM.SYMBOLS.map((k) => opt(k, node.icon, t(`sym_${k}`))).join(''))
      : pick('badge', t('dgIcon'), [opt('', Array.isArray(node.icons) ? (node.icons[0] || '-') : '', t('dgAuto2')), opt('-', Array.isArray(node.icons) && !node.icons.length ? '-' : '', t('dgNone')), ...DIAGRAM.SYMBOLS.map((k) => opt(k, Array.isArray(node.icons) ? node.icons[0] : '', t(`sym_${k}`)))].join(''));
    return { cat: 'shape', label: t('selShape', { x: dgNodeName(node) }), groups: [['dgLabel', kinds, colours, 'dgConnect', 'dgDel'], [icon, 'dgSub', 'dgDup', 'dgFront', 'dgBack']], keep: zoomKeep() };
  }
  const sym = pick('symbol', t('dgSymbol'), [`<option value="">${esc(t('dgSymbol'))} …</option>`, ...DIAGRAM.SYMBOLS.map((k) => opt(k, '', t(`sym_${k}`)))].join(''));
  return { cat: 'diagram', label: t('selDiagram'), groups: [['dgStaff', 'dgDecision', 'dgStart', 'dgOk', 'dgStop', sym], ['dgApplicant', 'dgPayment', 'dgRework', 'dgSystem', 'dgNote', 'dgGroup', 'dgText', 'dgAuto', 'dgReset', 'dgFlow', 'dgLegend', 'dgZoom100', 'dgMermaidIn', 'dgMermaidOut']], keep: zoomKeep() };
}
/* ── selection paint: outline + resize handle, editor DOM only (never exported) ── */
function dgPaint() {
  document.querySelectorAll('figure[data-dg].dg-on').forEach((f) => f.classList.remove('dg-on'));
  document.querySelectorAll('figure[data-dg] .dg-ui').forEach((x) => x.remove());
  document.querySelectorAll('figure[data-dg] .dg-picked').forEach((x) => x.classList.remove('dg-picked'));
  if (!S.dg) return;
  const fig = dgFig();
  if (!fig) return;
  fig.classList.add('dg-on');
  const svg = fig.querySelector('svg');
  const m = dgModel();
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'dg-ui');
  for (const id of S.dg.nodes) {
    const n = m.nodes.find((x) => x.id === id);
    if (!n) continue;
    g.insertAdjacentHTML('beforeend', `<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="6" fill="none" stroke="#005fc2" stroke-width="1.5" stroke-dasharray="5 3"/>`);
    if (S.dg.nodes.length === 1) g.insertAdjacentHTML('beforeend', `<rect class="dg-handle" data-dg-handle="${esc(id)}" x="${n.x + n.w - 2}" y="${n.y + n.h - 2}" width="10" height="10" fill="#fff" stroke="#005fc2" stroke-width="1.5" style="cursor:nwse-resize"/>`);
  }
  if (S.dg.edge) {
    svg.querySelector(`[data-dg-edge="${CSS.escape(S.dg.edge)}"]`)?.classList.add('dg-picked');
    // bend handles: a square on every segment (drag it across), a dot on every corner (drag it; Delete removes the bend)
    const P = dgRoute(m, S.dg.edge) || [];
    for (let i = 0; i + 1 < P.length; i += 1) {
      const [a, b] = [P[i], P[i + 1]];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 18) continue;
      const horiz = Math.abs(a[1] - b[1]) < 0.5;
      g.insertAdjacentHTML('beforeend', `<rect class="dg-seg" data-dg-seg="${i}" x="${(a[0] + b[0]) / 2 - 5}" y="${(a[1] + b[1]) / 2 - 5}" width="10" height="10" rx="2" fill="#fff" stroke="#005fc2" stroke-width="1.5" style="cursor:${horiz ? 'ns-resize' : 'ew-resize'}"/>`);
    }
    for (let k = 1; k + 1 < P.length; k += 1) {
      const on = S.dg.bend === k - 1;
      g.insertAdjacentHTML('beforeend', `<circle class="dg-bend" data-dg-bend="${k}" cx="${P[k][0]}" cy="${P[k][1]}" r="${on ? 6 : 5}" fill="${on ? '#005fc2' : '#fff'}" stroke="#005fc2" stroke-width="1.5" style="cursor:move"/>`);
    }
  }
  svg.appendChild(g);
}
/** The routed points of one arrow (ports included, before the arrowhead is drawn short). */
function dgRoute(m, eid) {
  const w = DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg?.ed || S.ed }).items.find((it) => it.t === 'line' && it.wire && it.id === eid);
  return w ? w.route.map((q) => [...q]) : null;
}
/** Drag a segment across (orthogonal stays orthogonal) or a corner (its neighbours follow); the ports never move. */
function dgBendDrag(e, svg, ptr, ed, el) {
  e.preventDefault();
  const base = dgModel(ptr, ed);
  const eid = S.dg.edge;
  const P = dgRoute(base, eid);
  if (!P) return;
  const isSeg = el.hasAttribute('data-dg-seg');
  let k = +(isSeg ? el.dataset.dgSeg : el.dataset.dgBend);
  if (isSeg) {
    // a segment that starts or ends on a port gets its own corner there, so the port stays put
    if (k === 0) { P.unshift([...P[0]]); k = 1; }
    if (k + 1 === P.length - 1) P.push([...P.at(-1)]);
  }
  const horiz = isSeg && Math.abs(P[k][1] - P[k + 1][1]) < 0.5;
  const start = dgPoint(svg, e);
  let moved = false;
  let work = base;
  const move = (ev) => {
    const p = dgPoint(dgFig(ptr, ed)?.querySelector('svg') || svg, ev);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    const Q = P.map((q) => [...q]);
    if (isSeg) {
      if (horiz) Q[k][1] = Q[k + 1][1] = dgSnap(P[k][1] + dy);
      else Q[k][0] = Q[k + 1][0] = dgSnap(P[k][0] + dx);
    } else {
      const nx = dgSnap(P[k][0] + dx);
      const ny = dgSnap(P[k][1] + dy);
      for (const j of [k - 1, k + 1]) {
        if (j <= 0 || j >= P.length - 1) continue;
        if (Math.abs(P[j][1] - P[k][1]) < 0.5) Q[j][1] = ny;
        else if (Math.abs(P[j][0] - P[k][0]) < 0.5) Q[j][0] = nx;
      }
      Q[k] = [nx, ny];
    }
    work = JSON.parse(JSON.stringify(base));
    work.edges.find((x) => x.id === eid).via = Q.slice(1, -1);
    dgDraw(work);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (!isSeg) S.dg.bend = k - 1;
    if (moved) dgSave(work, ptr, ed);
    else dgPaint();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
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
  const obj = node || edge;
  if (!obj) return;
  const field = target.field === 'sub' ? 'sub' : 'label';
  const r = DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg.ed });
  const F = DIAGRAM.FS;
  let box;
  let size;
  if (node) {
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
/* ── zoom: the drawing only; view state, never in the model, the PDF or the DOCX ── */
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
    } else {
      delete fig.dataset.zoom;
      art.style.removeProperty('--dgz');
      art.style.removeProperty('--dgh');
    }
  });
}
function dgZoomFig(fig, mode) {
  if (!fig) return;
  S.dgZoom ||= {};
  const key = dgZoomKey(fig);
  const svg = fig.querySelector('svg');
  const art = fig.querySelector('.fig-art');
  if (!svg || !art) return;
  const z = S.dgZoom[key];
  const natural = svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width;
  // the fitted size is measured unzoomed once, then kept: the frame never changes height under the reader
  const fitW = z?.fitW || svg.getBoundingClientRect().width;
  const fitH = z?.h || art.getBoundingClientRect().height;
  const now = z?.w || fitW;
  let w;
  if (mode === 'fit') w = null;
  else if (mode === '100') w = natural;
  else w = Math.min(natural * 4, Math.max(fitW * 0.5, mode === 'in' ? now * 1.25 : now / 1.25));
  if (w == null || Math.abs(w - fitW) < 1) delete S.dgZoom[key];
  else S.dgZoom[key] = { w: Math.round(w), h: Math.round(fitH), fitW, pct: (w / natural) * 100 };
  dgZoomAll();
  if (S.dg) dgPaint();
}
document.addEventListener('wheel', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const fig = e.target.closest?.('#bw-pair figure[data-dg]');
  if (!fig) return;
  e.preventDefault();
  dgZoomFig(fig, e.deltaY < 0 ? 'in' : 'out');
}, { passive: false });

/** Live redraw of one diagram while dragging (no op yet): the drawing only, then the paint. */
function dgDraw(model) {
  const fig = dgFig();
  if (!fig) return;
  fig.querySelector('.fig-art').innerHTML = DIAGRAM.render(model, { theme: S.theme, locale: S.dg.ed, editor: true });
  dgPaint();
}
const dgSnap = (v) => (S.snap ? Math.round(v / 10) * 10 : Math.round(v));
function dgPoint(svg, ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function dgSelect(ptr, ed, patch) {
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
  const bendEl = e.target.closest('[data-dg-bend], [data-dg-seg]');
  if (bendEl && S.dg?.edge && S.dg.b === ptr) { dgBendDrag(e, svg, ptr, ed, bendEl); return; }
  const handle = e.target.closest('[data-dg-handle]');
  const nodeEl = e.target.closest('[data-dg-node]');
  const edgeEl = e.target.closest('[data-dg-edge]');
  e.preventDefault();
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
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
});
document.addEventListener('dblclick', (e) => {
  const fig = e.target.closest?.('#bw-pair figure[data-dg]');
  if (!fig || !S.dg) return;
  const n = e.target.closest('[data-dg-node]');
  const edEl = e.target.closest('[data-dg-edge]');
  if (n) {
    const node = dgModel().nodes.find((x) => x.id === n.dataset.dgNode);
    const onSub = !!(node?.sub && e.target.closest('text')?.textContent === node.sub);
    S.dg.nodes = [n.dataset.dgNode];
    dgInline({ node: n.dataset.dgNode, field: onSub ? 'sub' : 'label' });
  } else if (edEl) dgInline({ edge: edEl.dataset.dgEdge });
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
  if ((e.key === 'Enter' || e.key === 'F2') && (S.dg.nodes.length === 1 || S.dg.edge)) { e.preventDefault(); e.stopImmediatePropagation(); dgInline(S.dg.edge ? { edge: S.dg.edge } : { node: S.dg.nodes[0] }); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && S.dg.edge && S.dg.bend != null) { e.preventDefault(); e.stopImmediatePropagation(); dgAction('dgBendDel'); return; }
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
    if (e) e[pk.mode] = targetId;
  }
  // a new arrow's meaning is settled by the same rules as the harvest (to a refusal = red, backwards = dashed)
  for (const e of m.edges) if (e.id.startsWith('e') && !e.label && e.kind === undefined) delete e.kind;
  dgSave(DIAGRAM.classify(m));
}
const ALIGN = { dgAlignL: ['x', 0], dgAlignC: ['x', 0.5], dgAlignR: ['x', 1], dgAlignT: ['y', 0], dgAlignM: ['y', 0.5], dgAlignB: ['y', 1] };
const ADD = { dgStaff: 'staff', dgApplicant: 'applicant', dgStart: 'start', dgPayment: 'payment', dgRework: 'rework', dgSystem: 'system', dgDecision: 'decision', dgOk: 'ok', dgStop: 'stop', dgNote: 'note', dgGroup: 'group', dgText: 'text' };
async function dgAction(a) {
  if (a === 'addDiagram') {
    const b = blockOf(S.sel?.b);
    const arr = b ? b.arr : '/chapters/0/sections/0/blocks';
    const at = b ? b.i + 1 : 0;
    commit([{ op: 'insert', path: `${arr}/${at}`, value: { kind: 'diagram', caption: HL(S.ed).figureCaption.replace('{name}', cur().name || ''), model: DIAGRAM.starter(S.ed) } }]);
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
      const P = dgRoute(m, edge.id);
      if (!P) return;
      // split the segment after the selected bend (else the longest) into thirds: its middle third can then be dragged across
      const len = (i) => Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]);
      let i = S.dg.bend != null && S.dg.bend + 1 < P.length - 1 ? S.dg.bend + 1 : 0;
      if (S.dg.bend == null) for (let j = 1; j + 1 < P.length; j += 1) if (len(j) > len(i)) i = j;
      const [p, q] = [P[i], P[i + 1]];
      const at = (u) => [Math.round(p[0] + (q[0] - p[0]) * u), Math.round(p[1] + (q[1] - p[1]) * u)];
      P.splice(i + 1, 0, at(1 / 3), at(2 / 3));
      edge.via = P.slice(1, -1);
      S.dg.bend = i;
      break;
    }
    case 'dgBendDel': {
      if (!edge?.via?.length) return;
      // a corner goes with its neighbour corner, so the step between them closes (one corner alone would come back as an elbow)
      const k = S.dg.bend != null && S.dg.bend < edge.via.length ? S.dg.bend : edge.via.length - 1;
      edge.via.splice(k + 1 < edge.via.length ? k : Math.max(0, k - 1), 2);
      if (!edge.via.length) delete edge.via;
      S.dg.bend = null;
      break;
    }
    case 'dgRouteAuto': if (!edge?.via) return; delete edge.via; S.dg.bend = null; break;
    case 'dgZoomIn': dgZoomFig(dgFig(), 'in'); return;
    case 'dgZoomOut': dgZoomFig(dgFig(), 'out'); return;
    case 'dgZoomFit': dgZoomFig(dgFig(), 'fit'); return;
    case 'dgZoom100': dgZoomFig(dgFig(), '100'); return;
    case 'dgReverse': { if (!edge) return; [edge.from, edge.to] = [edge.to, edge.from]; break; }
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
    case 'dgFlow': { m.flow = m.flow === 'rtl' ? 'ltr' : 'rtl'; dgSave(DIAGRAM.layout(m)); return; }
    case 'dgLegend': { m.legend = m.legend === false ? undefined : false; if (m.legend === undefined) delete m.legend; break; }
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
