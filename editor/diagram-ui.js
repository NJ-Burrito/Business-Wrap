/* Business-Wrap editor — diagram editing, in place on the page (concatenated after editor.js).
 * A diagram block holds a model (engine/diagram.mjs). Click a shape → shape tools in the toolbar's
 * selection section; click an arrow → arrow tools; click the empty drawing → diagram tools (add shapes,
 * symbols, layout, Mermaid). Drag to move (grid snap), drag the corner handle to resize, arrow keys
 * nudge, double-click (or Enter) edits a label in place; a selected arrow shows bend handles (drag a segment
 * across, drag a corner, add/remove a bend, auto route); Ctrl+wheel or the zoom tools zoom the drawing.
 * 0.15.6: a selected arrow shows ONE square at its start, ONE at its head and a circle at every bend (a faint ghost circle on each long
 * segment adds one: drag it, or double-click the line); the squares slide along the shape's outline or reconnect to another shape. Every change is ONE `replace` op on <block>/model, so undo/redo,
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
  if (d.legend) {
    // 0.15.6 (L1): one entry of the key under the drawing is selected
    const it = DIAGRAM.resolve(m, { theme: S.theme, locale: d.ed }).items.find((x) => x.t === 'text' && x.legend === d.legend);
    return { cat: 'diagram', label: t('selLegend', { x: it ? it.lines.join(' ') : '' }), groups: [['dgLgText', 'dgLgLook', 'dgLgDel', 'dgLgReset', 'dgLegend']], keep: zoomKeep() };
  }
  if (edge) {
    const sel = pick('wire', t('dgWire'), DIAGRAM.WIRE_KINDS.map((k) => opt(k, edge.kind, t(`dgw_${k}`))).join(''));
    return { cat: 'arrow', label: t('selArrow', { x: t(`dgw_${edge.kind}`) }), groups: [[sel, 'dgEdgeLabel', 'dgBendAdd', 'dgBendDel'], ['dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight', 'dgRouteAuto', 'dgReverse', 'dgFrom', 'dgTo', 'dgDel']], keep: zoomKeep() };
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
  const sym = btn('dgSymbol'); // 0.14.0 · O2: a gallery with the full names (the old select was squeezed to a sliver inside the «…» menu)
  return { cat: 'diagram', label: t('selDiagram'), groups: [['dgStaff', 'dgDecision', 'dgStart', 'dgOk', 'dgStop', sym], ['dgApplicant', 'dgPayment', 'dgRework', 'dgSystem', 'dgNote', 'dgGroup', 'dgText', 'dgAuto', 'dgReset', 'dgFlow', 'dgLegend', 'dgLgReset', 'dgZoom100', 'dgMermaidIn', 'dgMermaidOut']], keep: zoomKeep() };
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
  // 0.15.0 (F5): lettering that would print too small, or text that overlaps, is a warning on the sheet (editor only, never blocks)
  try {
    const lg = DIAGRAM.legibility(m, { locale: S.ed === 'en' ? 'en' : 'ar' });
    if (!lg.ok) {
      const en = S.ed === 'en';
      const msg = en ? `Prints at ${lg.minPtPrinted} pt${lg.overlaps.length ? `, ${lg.overlaps.length} overlap(s)` : ''}: split the figure or enlarge the frame` : `يُطبع بحجم ${lg.minPtPrinted} نقطة${lg.overlaps.length ? `، ${lg.overlaps.length} تداخل` : ''}: قسّم الشكل أو كبّر الإطار`;
      const v = lg.view;
      g.insertAdjacentHTML('beforeend', `<g class="dg-legib"><rect x="${v.x + 6}" y="${v.y + 6}" width="${Math.min(v.w - 12, 20 + msg.length * 6.4)}" height="24" rx="5" fill="#fff4d6" stroke="#8b5a05" stroke-width="1"/><text x="${v.x + 14}" y="${v.y + 22}" font-size="12" fill="#4e3102" direction="${en ? 'ltr' : 'rtl'}" ${en ? '' : `text-anchor="start" x="${v.x + 14}"`}>${esc(msg)}</text></g>`);
    }
  } catch { /* a model the check cannot read is the Check panel's business */ }
  for (const id of S.dg.nodes) {
    const n = m.nodes.find((x) => x.id === id);
    if (!n) continue;
    g.insertAdjacentHTML('beforeend', `<rect x="${n.x - 4}" y="${n.y - 4}" width="${n.w + 8}" height="${n.h + 8}" rx="6" fill="none" stroke="#005fc2" stroke-width="1.5" stroke-dasharray="5 3"/>`);
    if (S.dg.nodes.length === 1) g.insertAdjacentHTML('beforeend', `<rect class="dg-handle" data-dg-handle="${esc(id)}" x="${n.x + n.w - 2}" y="${n.y + n.h - 2}" width="10" height="10" fill="#fff" stroke="#005fc2" stroke-width="1.5" style="cursor:nwse-resize"/>`);
  }
  if (S.dg.edge) {
    svg.querySelector(`[data-dg-edge="${CSS.escape(S.dg.edge)}"]`)?.classList.add('dg-picked');
    const w = dgWire(m, S.dg.edge);
    const P = w ? w.route : [];
    // the handles keep a usable size on screen when the drawing is scaled down to fit (never smaller than their drawn size)
    const sc = Math.min(2.6, Math.max(1, 1 / (svg.getScreenCTM()?.a || 1)));
    const q1 = (v) => Math.round(v * 10) / 10;
    // ghosts (a faint, small circle on the middle of every long segment: drag one to add a joint), then a circle on every bend, then the two squares
    for (let i = 0; i + 1 < P.length; i += 1) {
      if (Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]) < 44) continue;
      const [mx, my] = DIAGRAM.wireMid(w, i);
      g.insertAdjacentHTML('beforeend', `<circle class="dg-ghost" data-dg-ghost="${i}" cx="${Math.round(mx * 10) / 10}" cy="${Math.round(my * 10) / 10}" r="${q1(3.2 * sc)}" fill="#fff" fill-opacity=".55" stroke="#005fc2" stroke-opacity=".45" stroke-width="${q1(sc)}" style="cursor:copy"/>`);
    }
    for (let k = 1; k + 1 < P.length; k += 1) {
      const on = dgNear(P[k], S.dg.joint);
      g.insertAdjacentHTML('beforeend', `<circle class="dg-bend" data-dg-bend="${k}" data-r0="${q1(5 * sc)}" cx="${P[k][0]}" cy="${P[k][1]}" r="${q1((on ? 6 : 5) * sc)}" fill="${on ? '#005fc2' : '#fff'}" stroke="#005fc2" stroke-width="${q1(1.5 * sc)}" style="cursor:move"/>`);
    }
    if (P.length > 1) {
      for (const [which, q] of [['from', P[0]], ['to', P.at(-1)]]) {
        const on = S.dg.end === which;
        g.insertAdjacentHTML('beforeend', `<rect class="dg-end" data-dg-end="${which}" x="${q1(q[0] - 5 * sc)}" y="${q1(q[1] - 5 * sc)}" width="${q1(10 * sc)}" height="${q1(10 * sc)}" fill="${on ? '#005fc2' : '#fff'}" stroke="#005fc2" stroke-width="${q1(1.5 * sc)}" style="cursor:crosshair"/>`);
      }
    }
  }
  if (S.dg.legend) {
    const bb = dgLegendBox(m, S.dg.legend);
    if (bb) g.insertAdjacentHTML('beforeend', `<rect class="dg-lgsel" x="${bb.x - 4}" y="${bb.y - 4}" width="${bb.w + 8}" height="${bb.h + 8}" rx="5" fill="none" stroke="#005fc2" stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>`);
  }
  if (S.dgCand) {
    const c = m.nodes.find((x) => x.id === S.dgCand);
    if (c) g.insertAdjacentHTML('beforeend', `<rect class="dg-cand" x="${c.x - 5}" y="${c.y - 5}" width="${c.w + 10}" height="${c.h + 10}" rx="8" fill="#005fc2" fill-opacity=".10" stroke="#005fc2" stroke-width="2.5" pointer-events="none"/>`);
  }
  svg.appendChild(g);
}
/** The box round one legend entry (its swatch and its words), or null when that entry is not drawn. */
function dgLegendBox(m, key) {
  const its = DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg?.ed || S.ed }).items.filter((x) => x.lg === key);
  if (!its.length) return null;
  const xs = [];
  const ys = [];
  for (const it of its) {
    if (it.t === 'shape') { xs.push(it.x, it.x + it.w); ys.push(it.y, it.y + it.h); } else if (it.t === 'line') for (const [x, y] of it.pts) { xs.push(x); ys.push(y); } else if (it.t === 'circle') { xs.push(it.cx - it.r, it.cx + it.r); ys.push(it.cy - it.r, it.cy + it.r); } else if (it.t === 'text') { xs.push(it.box.x, it.box.x + it.box.w); ys.push(it.box.y, it.box.y + it.box.h); }
  }
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
/** A list of choices at a ribbon button (the symbol gallery's panel). */
function dgChoiceMenu(action, label, options, current, onPick) {
  document.querySelector('.bw-dg-gallery')?.remove();
  dgGalleryCss();
  const el = document.createElement('div');
  el.className = 'bw-dg-gallery';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', label);
  el.dir = uiDir();
  el.lang = S.ui;
  el.style.fontFamily = 'inherit';
  el.innerHTML = options.map(([v, name]) => `<button type="button" data-val="${esc(v)}"${v === current ? ' aria-current="true" style="border-color:#005fc2"' : ''}>${esc(name)}</button>`).join('');
  document.body.appendChild(el);
  const bt = root.querySelector(`[data-a="${action}"]`)?.getBoundingClientRect();
  const w = el.getBoundingClientRect().width;
  el.style.left = `${bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2)}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : 70) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); };
  const esc2 = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc2, true);
  el.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-val]'); if (!b) return; close(); onPick(b.dataset.val); });
  el.querySelector('button')?.focus();
}
/** Show which joint / end is selected without replacing any element (a press must not swap the element under a double-click). */
function dgMark() {
  const fig = dgFig();
  if (!fig || !S.dg?.edge) return;
  const w = dgWire(dgModel(), S.dg.edge);
  if (!w) return;
  fig.querySelectorAll('.dg-ui circle.dg-bend').forEach((c) => {
    const on = dgNear(w.route[+c.dataset.dgBend], S.dg.joint);
    const r0 = +c.dataset.r0 || 5;
    c.setAttribute('r', String(Math.round(r0 * (on ? 1.2 : 1) * 10) / 10));
    c.setAttribute('fill', on ? '#005fc2' : '#fff');
  });
  fig.querySelectorAll('.dg-ui rect.dg-end').forEach((r) => r.setAttribute('fill', S.dg.end === r.dataset.dgEnd ? '#005fc2' : '#fff'));
}
/** The resolved wire of one arrow (route, curve, head, tail), or null. */
function dgWire(m, eid) {
  return DIAGRAM.resolve(m, { theme: S.theme, locale: S.dg?.ed || S.ed }).items.find((it) => it.t === 'line' && it.wire && it.id === eid && !it.deco) || null;
}
/** The routed points of one arrow: its start, every joint (bend), its head. */
function dgRoute(m, eid) {
  const w = dgWire(m, eid);
  return w ? w.route.map((q) => [...q]) : null;
}
function dgNear(a, b) { return !!a && !!b && Math.abs(a[0] - b[0]) < 1.5 && Math.abs(a[1] - b[1]) < 1.5; }
function dgEdgeType(e) { return DIAGRAM.ROUTES.includes(e?.route) ? e.route : 'elbow'; }
/** Pure edits of an arrow's joints (the model's `via`), shared by the pointer, the keyboard, the ribbon and the tests. Each returns the new via. */
function dgJointInsert(P, seg, pt) {
  const via = P.slice(1, -1).map((q) => [...q]);
  via.splice(seg, 0, [Math.round(pt[0]), Math.round(pt[1])]);
  return via;
}
/** Remove exactly joint k (an index into the route, 1..n-2). On an elbow route, a neighbour that would be left on a diagonal slides along its own line so the path stays orthogonal; none is removed. */
function dgJointRemove(P, k, type) {
  const Q = P.map((q) => [...q]);
  Q.splice(k, 1);
  if (type === 'elbow') {
    const i = k - 1;
    const j = k;
    const aligned = (a, b) => Math.abs(a[0] - b[0]) < 0.5 || Math.abs(a[1] - b[1]) < 0.5;
    if (!aligned(Q[i], Q[j])) {
      const slide = (idx, ref, other) => { // idx slides along the line of its other leg until it is level with ref
        const horiz = Math.abs(Q[idx][1] - other[1]) < 0.5;
        if (horiz) Q[idx][0] = ref[0]; else Q[idx][1] = ref[1];
      };
      if (j < Q.length - 1) slide(j, Q[i], Q[j + 1]);
      else if (i >= 1) slide(i, Q[j], Q[i - 1]);
    }
  }
  return Q.slice(1, -1);
}
/** Free placement of joint k at (nx, ny); on an elbow route the neighbours that shared its line follow, so the path stays orthogonal. */
function dgJointMove(P, k, nx, ny, type) {
  const Q = P.map((q) => [...q]);
  if (type === 'elbow') {
    for (const j of [k - 1, k + 1]) {
      if (j <= 0 || j >= P.length - 1) continue;
      if (Math.abs(P[j][1] - P[k][1]) < 0.5) Q[j][1] = ny;
      else if (Math.abs(P[j][0] - P[k][0]) < 0.5) Q[j][0] = nx;
    }
  }
  Q[k] = [nx, ny];
  return Q.slice(1, -1);
}
/** Shift locks a point to the horizontal or the vertical of the joint before it. */
function dgLock(pt, prev) {
  return Math.abs(pt[0] - prev[0]) >= Math.abs(pt[1] - prev[1]) ? [pt[0], prev[1]] : [prev[0], pt[1]];
}
function dgSetVia(m, eid, via) {
  const e = m.edges.find((x) => x.id === eid);
  if (!e) return;
  if (via.length) e.via = via; else delete e.via;
}
/** Drag a joint of the selected arrow anywhere (grid snap follows S.snap; Shift locks to the previous joint). A press that does not move changes nothing. */
function dgBendDrag(e, svg, ptr, ed, el) {
  e.preventDefault();
  const base = dgModel(ptr, ed);
  const eid = S.dg.edge;
  const P = dgRoute(base, eid);
  if (!P) return;
  const k = +el.dataset.dgBend;
  const type = dgEdgeType(base.edges.find((x) => x.id === eid));
  S.dg.joint = [...P[k]];
  S.dg.end = null;
  dgMark();
  const start = dgPoint(svg, e);
  let moved = false;
  let work = base;
  let at = null;
  const move = (ev) => {
    const p = dgPoint(dgFig(ptr, ed)?.querySelector('svg') || svg, ev);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    at = [dgSnap(P[k][0] + dx), dgSnap(P[k][1] + dy)];
    if (ev.shiftKey) at = dgLock(at, P[k - 1]);
    work = JSON.parse(JSON.stringify(base));
    dgSetVia(work, eid, dgJointMove(P, k, at[0], at[1], type));
    S.dg.joint = [...at];
    dgDraw(work);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
/** Drag a ghost (the faint circle on a long segment): a new joint lands at the pointer. A press with no movement adds nothing. */
function dgGhostDrag(e, svg, ptr, ed, el) {
  e.preventDefault();
  const base = dgModel(ptr, ed);
  const eid = S.dg.edge;
  const w = dgWire(base, eid);
  if (!w) return;
  const P = w.route.map((q) => [...q]);
  const seg = +el.dataset.dgGhost;
  const start = dgPoint(svg, e);
  let moved = false;
  let work = base;
  let at = null;
  const move = (ev) => {
    const p = dgPoint(dgFig(ptr, ed)?.querySelector('svg') || svg, ev);
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
    moved = true;
    at = [dgSnap(p.x), dgSnap(p.y)];
    if (ev.shiftKey) at = dgLock(at, P[seg]);
    work = JSON.parse(JSON.stringify(base));
    dgSetVia(work, eid, dgJointInsert(P, seg, at));
    S.dg.joint = [...at];
    dgDraw(work);
  };
  const up = () => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}
/** Add a joint to the selected arrow at a point of its line (double-click, the ribbon). Returns true when one was added. */
function dgJointAddAt(pt, segHint) {
  if (!S.dg?.edge || !dgBlock()) return false;
  const m = dgModel();
  const w = dgWire(m, S.dg.edge);
  if (!w) return false;
  let seg = segHint;
  let at = pt;
  if (seg == null) {
    const nb = DIAGRAM.nearestOnWire(w, pt);
    if (!nb) return false;
    seg = nb.seg;
    at = [nb.x, nb.y];
  }
  dgSetVia(m, S.dg.edge, dgJointInsert(w.route, seg, at));
  S.dg.joint = [Math.round(at[0]), Math.round(at[1])];
  dgSave(m);
  return true;
}
/** Remove the selected joint of the selected arrow (else the last one): exactly that joint, on every route type. */
function dgJointDelete() {
  if (!S.dg?.edge || !dgBlock()) return false;
  const m = dgModel();
  const w = dgWire(m, S.dg.edge);
  if (!w || w.route.length < 3) return false;
  let k = S.dg.joint ? w.route.findIndex((q, i) => i > 0 && i < w.route.length - 1 && dgNear(q, S.dg.joint)) : -1;
  if (k < 0) k = w.route.length - 2;
  const edge = m.edges.find((x) => x.id === S.dg.edge);
  const type = dgEdgeType(edge);
  let via = dgJointRemove(w.route, k, type);
  let anchors = {};
  if (type === 'elbow') ({ via, anchors } = dgCleanDelete(m, edge.id, w, via));
  dgSetVia(m, S.dg.edge, via);
  Object.assign(edge, anchors);
  S.dg.joint = null;
  dgSave(m);
  return true;
}
/** E1: after a joint of an elbow arrow is deleted the path must stay clean: no jog and no extra joint where it meets a shape. When the end legs cannot both enter square,
 *  the end's anchor moves to the face the remaining leg points at (the leg stays where it is), so nothing extra appears. */
function dgCleanDelete(m, eid, before, via) {
  const want = before.route.length - 3; // joints left on screen
  const clean = (v, anchors) => {
    const m2 = JSON.parse(JSON.stringify(m));
    const e2 = m2.edges.find((x) => x.id === eid);
    dgSetVia(m2, eid, v);
    Object.assign(e2, anchors);
    const w2 = dgWire(m2, eid);
    const orthogonal = !!w2 && w2.route.every((q, i) => !i || Math.abs(q[0] - w2.route[i - 1][0]) < 0.6 || Math.abs(q[1] - w2.route[i - 1][1]) < 0.6);
    return orthogonal && w2.route.length - 2 <= want ? { via: v, anchors } : null;
  };
  const plain = clean(via, {});
  if (plain) return plain;
  if (via.length === 1) {
    const edge = m.edges.find((x) => x.id === eid);
    const [J] = via;
    const A = before.route[0];
    const B = before.route.at(-1);
    const nTo = m.nodes.find((n) => n.id === edge.to);
    const nFrom = m.nodes.find((n) => n.id === edge.from);
    const near1 = (a, b) => Math.abs(a - b) < 0.6;
    const tries = [];
    if (near1(J[0], A[0]) && nTo) { // the first leg is vertical: the head enters from the side the leg comes from
      const side = J[0] < nTo.x ? 'l' : J[0] > nTo.x + nTo.w ? 'r' : null;
      if (side) tries.push([[[J[0], DIAGRAM.anchorPoint(nTo, side, 0.5)[1]]], { toAnchor: { side, at: 0.5 } }]);
    }
    if (near1(J[0], B[0]) && nFrom) { // the last leg is vertical: the start leaves from the side facing it
      const side = J[0] < nFrom.x ? 'l' : J[0] > nFrom.x + nFrom.w ? 'r' : null;
      if (side) tries.push([[[J[0], DIAGRAM.anchorPoint(nFrom, side, 0.5)[1]]], { fromAnchor: { side, at: 0.5 } }]);
    }
    for (const [v, a] of tries) { const ok = clean(v, a); if (ok) return ok; }
  }
  return { via, anchors: {} };
}
/** The shape under a point of the drawing (the topmost one; bands do not count), with a little room around it. */
function dgNodeAt(m, p, pad = 6) {
  for (let i = m.nodes.length - 1; i >= 0; i -= 1) {
    const n = m.nodes[i];
    if (n.kind === 'group') continue;
    if (p.x >= n.x - pad && p.x <= n.x + n.w + pad && p.y >= n.y - pad && p.y <= n.y + n.h + pad) return n;
  }
  return null;
}
/** Drag one end (a square) of the selected arrow: along its own shape's outline to any point, or onto another shape to reconnect (the candidate lights up). Drop on empty space, or Esc, restores. */
function dgEndDrag(e, svg, ptr, ed, el) {
  e.preventDefault();
  const which = el.dataset.dgEnd; // 'from' | 'to'
  const base = dgModel(ptr, ed);
  const eid = S.dg.edge;
  const edge0 = base.edges.find((x) => x.id === eid);
  if (!edge0) return;
  const other = which === 'from' ? edge0.to : edge0.from;
  const own = base.nodes.find((n) => n.id === edge0[which]);
  const key = which === 'from' ? 'fromAnchor' : 'toAnchor';
  S.dg.end = which;
  S.dg.joint = null;
  dgMark();
  const start = dgPoint(svg, e);
  let moved = false;
  let work = base;
  let valid = false;
  let done = false;
  const restore = () => { S.dgCand = null; if (moved) dgDraw(base); };
  const finish = () => {
    done = true;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('keydown', esc, true);
  };
  const move = (ev) => {
    const p = dgPoint(dgFig(ptr, ed)?.querySelector('svg') || svg, ev);
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < 3) return;
    moved = true;
    const hit = dgNodeAt(base, p);
    work = JSON.parse(JSON.stringify(base));
    const w = work.edges.find((x) => x.id === eid);
    valid = false;
    S.dgCand = null;
    if (hit && hit.id !== own.id && hit.id !== other) {
      const na = DIAGRAM.nearestAnchor(hit, [p.x, p.y]);
      w[which] = hit.id;
      w[key] = { side: na.side, at: na.at };
      delete w.via;
      S.dgCand = hit.id;
      valid = true;
    } else if (!(hit && hit.id === other)) {
      const gap = Math.max(own.x - p.x, p.x - (own.x + own.w), own.y - p.y, p.y - (own.y + own.h), 0);
      if (gap <= 48) {
        const na = DIAGRAM.nearestAnchor(own, [p.x, p.y]);
        w[key] = { side: na.side, at: na.at };
        valid = true;
      }
    }
    dgDraw(valid ? work : base);
  };
  const up = () => {
    finish();
    S.dgCand = null;
    if (!moved) return;
    if (valid && JSON.stringify(work) !== JSON.stringify(base)) dgSave(work, ptr, ed);
    else dgDraw(base);
  };
  const esc = (ev) => {
    if (ev.key !== 'Escape' || done) return;
    ev.preventDefault();
    ev.stopPropagation();
    finish();
    restore();
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  document.addEventListener('keydown', esc, true);
}
/** One property of the selected arrow (route, head, tail, line, weight); '' or the default clears the key, so the old drawing is exactly what remains. */
const DG_EDGE_KEYS = { route: ['elbow', 'straight', 'curved'], head: ['arrow', 'triangle', 'diamond', 'circle', 'bar', 'none'], tail: ['none', 'arrow', 'triangle', 'diamond', 'circle', 'bar'], line: ['', 'solid', 'dashed', 'dotted'], weight: ['thin', 'normal', 'thick'] };
const DG_EDGE_DEFAULT = { route: 'elbow', head: 'arrow', tail: 'none', line: '', weight: 'normal' };
function dgEdgeSet(key, v) {
  if (!S.dg?.edge || !dgBlock()) return;
  const m = dgModel();
  const edge = m.edges.find((x) => x.id === S.dg.edge);
  if (!edge) return;
  if (v === DG_EDGE_DEFAULT[key]) delete edge[key]; else edge[key] = v;
  dgSave(m);
}
/** A small list of the values of one arrow property, at its ribbon button (the same panel as the symbol gallery). */
function dgEdgeMenu(key) {
  document.querySelector('.bw-dg-gallery')?.remove();
  dgGalleryCss();
  const edge = S.dg?.edge ? dgModel().edges.find((x) => x.id === S.dg.edge) : null;
  if (!edge) return;
  const curV = edge[key] ?? DG_EDGE_DEFAULT[key];
  const el = document.createElement('div');
  el.className = 'bw-dg-gallery';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t(`dg${key[0].toUpperCase()}${key.slice(1)}`));
  el.dir = uiDir();
  el.lang = S.ui;
  el.style.fontFamily = 'inherit';
  el.innerHTML = DG_EDGE_KEYS[key].map((v) => `<button type="button" data-val="${v}"${v === curV ? ' aria-current="true" style="border-color:#005fc2"' : ''}>${esc(t(`dgo_${key}_${v || 'auto'}`))}</button>`).join('');
  document.body.appendChild(el);
  const bt = root.querySelector(`[data-a="dg${key[0].toUpperCase()}${key.slice(1)}"]`)?.getBoundingClientRect();
  const w = el.getBoundingClientRect().width;
  el.style.left = `${bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2)}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : 70) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); };
  const esc2 = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc2, true);
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-val]');
    if (!b) return;
    close();
    dgEdgeSet(key, b.dataset.val);
  });
  el.querySelector('button')?.focus();
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
  // 0.14.0 · O2: a legend entry (the key under the drawing) is edited in place too: model.legend[key]
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
 * 0.15.6 (Z1-Z6). The frame (.fig-art) keeps the size it had when fitted; only the drawing inside it changes. The scale follows
 * deltaY (a pinch or a precision wheel sends many small events), is coalesced to one update per frame, and keeps the point under the
 * pointer where it was. The view (scale, offsets, scroll) lives in S.dgZoom, so a live redraw, a save or a full render puts it back. */
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
  const natural = svg.viewBox.baseVal?.width || svg.getBoundingClientRect().width;
  // the fitted size is measured unzoomed once, then kept: the frame never changes size under the reader
  const fitW = z?.fitW || svg.getBoundingClientRect().width;
  const fitH = z?.h || art.getBoundingClientRect().height;
  const now = z?.w || fitW;
  const f = mode === 'in' ? 1.25 : mode === 'out' ? 1 / 1.25 : mode?.f || 1;
  let w;
  if (mode === 'fit') w = null;
  else if (mode === '100') w = natural;
  else w = Math.min(natural * 4, Math.max(fitW * 0.5, now * f));
  const r0 = svg.getBoundingClientRect();
  const fr = art.getBoundingClientRect();
  // the drawing point under the pointer is pinned while the pointer stays put, so rounding never adds up over a run of steps
  const vb = svg.viewBox.baseVal;
  const held = S.dgHold;
  const holding = !!(held && at && held.key === key && Math.abs(at.x - held.ax) < 2.5 && Math.abs(at.y - held.ay) < 2.5 && performance.now() - held.t < 1500);
  const ax = holding ? held.ax : at?.x ?? fr.left + fr.width / 2;
  const ay = holding ? held.ay : at?.y ?? fr.top + fr.height / 2;
  const u = holding ? (held.sx - vb.x) / vb.width : r0.width ? (ax - r0.left) / r0.width : 0.5;
  const v = holding ? (held.sy - vb.y) / vb.height : r0.height ? (ay - r0.top) / r0.height : 0.5;
  S.dgHold = at ? { key, ax, ay, sx: vb.x + u * vb.width, sy: vb.y + v * vb.height, t: performance.now() } : null;
  if (w == null || Math.abs(w - fitW) < 1) {
    delete S.dgZoom[key];
    dgZoomAll();
    if (S.dg) dgPaint();
    return;
  }
  // slack around the drawing (half the frame each way) so the point under the pointer can always stay under it, even next to an edge
  S.dgZoom[key] = { w: Math.round(w), h: Math.round(fitH), fitW, pct: (w / natural) * 100, ml: 0, mt: 0, sl: 0, st: 0, sx: z?.sx ?? Math.round(art.clientWidth * 0.5), sy: z?.sy ?? Math.round(art.clientHeight * 0.5) };
  dgZoomAll();
  // keep the drawing point that was under (ax, ay) there: scroll when the drawing overflows the frame, else slide it (never past the frame)
  const zz = S.dgZoom[key];
  for (let pass = 0; pass < 2; pass += 1) {
    const r1 = svg.getBoundingClientRect();
    const ex = r1.left + u * r1.width - ax;
    const ey = r1.top + v * r1.height - ay;
    art.scrollLeft += ex;
    art.scrollTop += ey;
    const r2 = svg.getBoundingClientRect();
    const rx = r2.left + u * r2.width - ax;
    const ry = r2.top + v * r2.height - ay;
    if (Math.abs(rx) > 0.4 || Math.abs(ry) > 0.4) {
      const cs = getComputedStyle(art);
      const vw = art.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const vh = art.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      zz.ml = Math.min(Math.max(0, vw - r2.width), Math.max(0, (zz.ml || 0) - rx));
      zz.mt = Math.min(Math.max(0, vh - r2.height), Math.max(0, (zz.mt || 0) - ry));
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
// Ctrl + wheel over a figure scales the drawing: by deltaY (2^(-dy/300): a mouse notch is about x1.26, a pinch's small events add up smoothly), one update per frame
{
  let pend = null;
  let raf = 0;
  document.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const fig = e.target.closest?.('#bw-pair figure[data-dg]');
    if (!fig) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (!pend || pend.fig !== fig) pend = { fig, f: 1 };
    pend.f = Math.min(1.5, Math.max(1 / 1.5, pend.f * 2 ** (-Math.max(-300, Math.min(300, dy)) / 300)));
    pend.x = e.clientX;
    pend.y = e.clientY;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const p = pend; pend = null; if (p && document.contains(p.fig)) dgZoomFig(p.fig, { f: p.f }, { x: p.x, y: p.y }); });
  }, { passive: false });
}

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
  const lgEl = e.target.closest('[data-dg-legend]');
  if (lgEl && !n) { dgInline({ legend: lgEl.dataset.dgLegend }); return; }
  // 0.15.6: on a selected arrow, a double-click on a joint removes it; on the line (or a ghost) it adds one right there; on the arrow's caption it edits the words
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
const ADD = { dgStaff: 'staff', dgApplicant: 'applicant', dgStart: 'start', dgPayment: 'payment', dgRework: 'rework', dgSystem: 'system', dgDecision: 'decision', dgOk: 'ok', dgStop: 'stop', dgNote: 'note', dgGroup: 'group', dgText: 'text' };
/** 0.14.0 · O2: every symbol by its full name, on a panel of its own (never inside the toolbar's «…» menu); a pick adds it, selected. */
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
  const bt = root.querySelector('[data-a="dgSymbol"]')?.getBoundingClientRect();
  const w = el.getBoundingClientRect().width;
  const left = bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2);
  el.style.left = `${left}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : 70) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); };
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
    case 'dgFlow': { m.flow = m.flow === 'rtl' ? 'ltr' : 'rtl'; dgSave(DIAGRAM.layout(m)); return; }
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
