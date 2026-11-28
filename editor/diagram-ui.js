/* Business-Wrap editor — diagram editing, in place on the page (concatenated after editor.js).
 * A diagram block holds a model (engine/diagram.mjs). Click a shape → shape tools in the toolbar's
 * selection section; click an arrow → arrow tools; click the empty drawing → diagram tools (add shapes,
 * symbols, layout, Mermaid). Drag to move (grid snap), drag the corner handle to resize, arrow keys
 * nudge, double-click (or Enter) edits a label in place; a selected arrow shows bend handles (drag a segment
 * across, drag a corner, add/remove a bend, auto route); Ctrl+wheel or the zoom tools zoom the drawing.
 * a selected arrow shows ONE square at its start, ONE at its head and a circle at every bend (a faint ghost circle on each long
 * segment adds one: drag it, or double-click the line); the squares slide along the shape's outline or reconnect to another shape. Every change is ONE `replace` op on <block>/model, so undo/redo,
 * the edits JSON, Save HTML, the PDF and the DOCX all carry it.
 * Declarations only (hoisted): boot() in editor.js runs before this file's statements. */
/** Deselect. 0.16.0: the selection's DOM (the canvas handles, the outline, the picked arrow) goes with it, in the same call: a click on a paragraph cleared S.dg and left the eight [data-dg-cv] handles until the next render. */
function dgClear() {
  S.dg = null; S.dgPick = null;
  document.querySelectorAll('figure[data-dg].dg-on').forEach((f) => f.classList.remove('dg-on'));
  document.querySelectorAll('figure[data-dg] .dg-ui').forEach((x) => x.remove());
  document.querySelectorAll('figure[data-dg] .dg-picked').forEach((x) => x.classList.remove('dg-picked'));
}
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
    // one entry of the key under the drawing is selected
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
    // the type size of this one shape (node.fs, 8-40 drawing units; «by kind» removes it); a join point has no text
    const FS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40];
    const curFs = Number.isFinite(+node.fs) && +node.fs >= 8 && +node.fs <= 40 ? +node.fs : 0;
    const sizes = node.kind === 'join' ? '' : pick('fs', t('dgFs'), [opt('', curFs ? '-' : '', t('dgAuto2')), ...(curFs && !FS.includes(curFs) ? [curFs] : []).concat(FS).sort((a, b) => a - b).map((k) => opt(String(k), String(curFs), String(k)))].join(''));
    return { cat: 'shape', label: t('selShape', { x: dgNodeName(node) }), groups: [['dgLabel', kinds, colours, 'dgConnect', 'dgDel'], [icon, ...(sizes ? [sizes] : []), 'dgSub', 'dgDup', 'dgFront', 'dgBack']], keep: zoomKeep() };
  }
  const sym = btn('dgSymbol'); // O2: a gallery with the full names (the old select was squeezed to a sliver inside the «…» menu)
  return { cat: 'diagram', label: t('selDiagram'), groups: [['dgStaff', 'dgDecision', 'dgStart', 'dgOk', 'dgStop', sym], ['dgApplicant', 'dgPayment', 'dgRework', 'dgSystem', 'dgNote', 'dgGroup', 'dgText', 'dgJoin', 'dgAuto', 'dgReset', 'dgLegend', 'dgLgReset', 'dgZoom100', 'dgMermaidIn', 'dgMermaidOut'], ['dgCvShapes', 'dgCvPage', 'dgCvAuto']], keep: zoomKeep() };
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
  // lettering that would print too small, or text that overlaps, is a warning on the sheet (editor only, never blocks)
  let legMsg = '';
  try {
    const fr0 = dgFrameNow();
    const lg = DIAGRAM.legibility(m, { locale: S.ed === 'en' ? 'en' : 'ar', ...(fr0 ? { frameMm: [fr0.wMm, fr0.hMm] } : {}) });
    if (!lg.ok) {
      const en = S.ed === 'en';
      const msg = en ? `Prints at ${lg.minPtPrinted} pt${lg.overlaps.length ? `, ${lg.overlaps.length} overlap(s)` : ''}: split the figure or enlarge the frame` : `يُطبع بحجم ${lg.minPtPrinted} نقطة${lg.overlaps.length ? `، ${lg.overlaps.length} تداخل` : ''}: قسّم الشكل أو كبّر الإطار`;
      // the note is a readable label on the canvas (HTML at screen size, set in dgCanvasPaint), not a bar drawn in the drawing's own units
      legMsg = msg;
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
  dgCanvasPaint(fig, legMsg);
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
/** where a picker opens. The ribbon's flyout closes on the press, so the button's rectangle is read when the press starts (kept for 2 s);
 *  else the visible button; else the middle of the window, never the corner. */
const dgBtnPress = { a: '', r: null, t: 0 };
document.addEventListener('pointerdown', (ev) => {
  const b = (ev.composedPath?.() || []).find((x) => x?.dataset?.a);
  if (!b) return;
  const r = b.getBoundingClientRect();
  Object.assign(dgBtnPress, { a: b.dataset.a, r: r.width > 0 ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } : null, t: performance.now() });
}, true);
function dgAnchor(action) {
  if (dgBtnPress.a === action && dgBtnPress.r && performance.now() - dgBtnPress.t < 2000) return dgBtnPress.r;
  for (const b of root.querySelectorAll(`[data-a="${action}"]`)) { const r = b.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return r; }
  return null;
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
  const bt = dgAnchor(action);
  const w = el.getBoundingClientRect().width;
  el.style.left = `${bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2)}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : innerHeight * 0.3) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); }; // a press anywhere outside it, the background included, closes the popup
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
/** the only joint of a short straight elbow arrow, pulled off the arrow's line. The two legs through it would run on the same vertical (or horizontal) and
 *  double back, a spike with 3 bends. The path is a step instead: out of the start a short stub, across at the joint's level, and into the head, the joint on the top run.
 *  Returns the via, or null when the joint is not in that situation. */
function dgStepVia(P, k, nx, ny) {
  if (P.length !== 3 || k !== 1) return null;
  const S = P[0], E = P[2];
  for (const [a, b] of [[0, 1], [1, 0]]) { // a: the axis the arrow runs along, b: across it
    if (Math.abs(S[b] - E[b]) >= 0.5 || Math.abs(S[a] - E[a]) < 0.5) continue;
    const p = [nx, ny];
    if (Math.abs(p[b] - S[b]) < 0.5) return null;
    const dir = Math.sign(E[a] - S[a]);
    const stub = Math.min(12, Math.abs(E[a] - S[a]) / 3);
    const ja = S[a] + dir * stub, jb = E[a] - dir * stub;
    const c = Math.min(Math.max(ja, jb), Math.max(Math.min(ja, jb), p[a]));
    const mk = (v) => { const q = [0, 0]; q[a] = Math.round(v); q[b] = Math.round(p[b]); return q; };
    return Math.abs(c - ja) < 0.5 || Math.abs(c - jb) < 0.5 ? [mk(ja), mk(jb)] : [mk(ja), mk(c), mk(jb)];
  }
  return null;
}
/** Free placement of joint k at (nx, ny); on an elbow route the neighbours that shared its line follow, so the path stays orthogonal. */
function dgJointMove(P, k, nx, ny, type) {
  const Q = P.map((q) => [...q]);
  if (type === 'elbow') {
    const step = dgStepVia(P, k, nx, ny);
    if (step) return step;
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
/** Esc cancels any drag in flight (joint, ghost, shape, canvas): `cancel` restores the drawing; the returned function ends the watch (call it on release).
 *  While a drag is held, Ctrl+wheel does nothing to the page (L4). */
function dgDragEsc(cancel) {
  S.dgDragging = true;
  const h = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    ev.stopPropagation();
    off();
    cancel();
  };
  const off = () => { S.dgDragging = false; document.removeEventListener('keydown', h, true); };
  document.addEventListener('keydown', h, true);
  return off;
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
    offEsc();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  const offEsc = dgDragEsc(() => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.dg.joint = [...P[k]];
    if (moved) dgDraw(base);
    moved = false;
  });
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
    offEsc();
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    if (moved) dgSave(work, ptr, ed);
  };
  const offEsc = dgDragEsc(() => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    S.dg.joint = null;
    if (moved) dgDraw(base);
    moved = false;
  });
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
  if (type === 'elbow') {
    // only the chosen joint goes, plus the corner points that are left collinear or doubled back; no neighbour slides
    const plain = dgElbowDelete(m, edge.id, w, k);
    if (plain) via = plain;
    else ({ via, anchors } = dgCleanDelete(m, edge.id, w, via));
  }
  dgSetVia(m, S.dg.edge, via);
  Object.assign(edge, anchors);
  S.dg.joint = null;
  dgSave(m);
  return true;
}
/** Collinear, repeated and doubled-back interior points of a route removed (the ends stay). */
function dgSimplify(Q) {
  const R = Q.map((q) => [...q]);
  for (let i = 1; i < R.length - 1;) {
    const [a, b, c] = [R[i - 1], R[i], R[i + 1]];
    const dup = Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5;
    const colX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5;
    const colY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5;
    if (dup || colX || colY) { R.splice(i, 1); i = Math.max(1, i - 1); } else i += 1;
  }
  return R;
}
/** Delete joint k of an elbow arrow: take it out of the drawn route, drop what it leaves collinear, and give the joints back to the router when they
 *  draw exactly what it would draw alone. Returns the new via, or null when the result would not stay orthogonal (the caller falls back). */
function dgElbowDelete(m, eid, w, k) {
  const drawn = (v) => {
    const m2 = JSON.parse(JSON.stringify(m));
    dgSetVia(m2, eid, v);
    return dgWire(m2, eid)?.route || null;
  };
  // the stored joints are the user's: when the chosen circle is one of them, exactly that entry goes and every other entry stays where it is
  const stored = m.edges.find((x) => x.id === eid)?.via;
  const hit = Array.isArray(stored) ? stored.findIndex((q) => dgNear(q, w.route[k])) : -1;
  const Q = dgSimplify(w.route.filter((q, i) => i !== k));
  const viaQ = Q.slice(1, -1).map((q) => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]);
  const viaS = hit >= 0 ? stored.filter((q, i) => i !== hit) : null;
  const ortho = (r0) => !!r0 && r0.every((q, i) => !i || Math.abs(q[0] - r0[i - 1][0]) < 0.6 || Math.abs(q[1] - r0[i - 1][1]) < 0.6);
  const via = viaS && ortho(drawn(viaS)) ? viaS : viaQ;
  const r = drawn(via);
  if (!r || !r.every((q, i) => !i || Math.abs(q[0] - r[i - 1][0]) < 0.6 || Math.abs(q[1] - r[i - 1][1]) < 0.6)) return null;
  if (r.length - 2 > w.route.length - 3) return null;
  const auto = drawn([]);
  if (auto && auto.length === r.length && auto.every((q, i) => Math.abs(q[0] - r[i][0]) < 0.6 && Math.abs(q[1] - r[i][1]) < 0.6)) return [];
  return via;
}
/** after a joint of an elbow arrow is deleted the path must stay clean: no jog and no extra joint where it meets a shape. When the end legs cannot both enter square,
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
  const bt = dgAnchor(`dg${key[0].toUpperCase()}${key.slice(1)}`);
  const w = el.getBoundingClientRect().width;
  el.style.left = `${bt ? Math.max(8, Math.min(innerWidth - w - 8, bt.left + bt.width / 2 - w / 2)) : Math.max(8, (innerWidth - w) / 2)}px`;
  el.style.top = `${Math.min(innerHeight - 120, (bt ? bt.bottom : innerHeight * 0.3) + 8)}px`;
  const close = () => { el.remove(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc2, true); };
  const away = (ev) => { if (!ev.composedPath().includes(el)) close(); }; // a press anywhere outside it, the background included, closes the popup
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