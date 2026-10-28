/* Business-Wrap editor — diagram editing, in place on the page (concatenated after editor.js).
 * A diagram block holds a model (engine/diagram.mjs). Click a shape → shape tools in the toolbar's
 * selection section; click an arrow → arrow tools; click the empty drawing → diagram tools (add shapes,
 * symbols, layout, Mermaid). Drag to move (grid snap), drag the corner handle to resize, arrow keys
 * nudge, double-click edits a label. Every change is ONE `replace` op on <block>/model, so undo/redo,
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
    return { cat: 'arrow', label: t('selArrow', { x: t(`dgw_${edge.kind}`) }), groups: [[sel, 'dgEdgeLabel', 'dgReverse', 'dgDel'], ['dgFrom', 'dgTo']] };
  }
  if (d.nodes.length > 1) return { cat: 'arrange', label: t('selMulti', { n: d.nodes.length }), groups: [['dgAlignL', 'dgAlignC', 'dgAlignR', 'dgDistH', 'dgDup', 'dgDel'], ['dgAlignT', 'dgAlignM', 'dgAlignB', 'dgDistV', 'dgWrap', 'dgFront', 'dgBack']] };
  if (node) {
    const kinds = pick('kind', t('dgKind'), DIAGRAM.KINDS.map((k) => opt(k, node.kind, t(`dgk_${k}`))).join(''));
    const colours = pick('color', t('dgColour'), [opt('', node.color || '', t('dgAuto2')), ...DIAGRAM.COLORS.map((k) => opt(k, node.color, t(`dgk_${k === 'ok' ? 'ok' : k === 'stop' ? 'stop' : k}`)))].join(''));
    const icon = node.kind === 'symbol'
      ? pick('icon', t('dgIcon'), DIAGRAM.SYMBOLS.map((k) => opt(k, node.icon, t(`sym_${k}`))).join(''))
      : pick('badge', t('dgIcon'), [opt('', Array.isArray(node.icons) ? (node.icons[0] || '-') : '', t('dgAuto2')), opt('-', Array.isArray(node.icons) && !node.icons.length ? '-' : '', t('dgNone')), ...DIAGRAM.SYMBOLS.map((k) => opt(k, Array.isArray(node.icons) ? node.icons[0] : '', t(`sym_${k}`)))].join(''));
    return { cat: 'shape', label: t('selShape', { x: dgNodeName(node) }), groups: [['dgLabel', kinds, colours, 'dgConnect', 'dgDel'], [icon, 'dgSub', 'dgDup', 'dgFront', 'dgBack']] };
  }
  const sym = pick('symbol', t('dgSymbol'), [`<option value="">${esc(t('dgSymbol'))} …</option>`, ...DIAGRAM.SYMBOLS.map((k) => opt(k, '', t(`sym_${k}`)))].join(''));
  return { cat: 'diagram', label: t('selDiagram'), groups: [['dgStaff', 'dgDecision', 'dgStart', 'dgOk', 'dgStop', sym], ['dgApplicant', 'dgPayment', 'dgRework', 'dgSystem', 'dgNote', 'dgGroup', 'dgText', 'dgAuto', 'dgReset', 'dgFlow', 'dgLegend', 'dgMermaidIn', 'dgMermaidOut']] };
}
/* ── selection paint: outline + resize handle, editor DOM only (never exported) ── */
function dgPaint() {
  document.querySelectorAll('figure[data-dg].dg-on').forEach((f) => f.classList.remove('dg-on'));
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
  if (S.dg.edge) svg.querySelector(`[data-dg-edge="${CSS.escape(S.dg.edge)}"] path`)?.setAttribute('stroke', '#005fc2');
  svg.appendChild(g);
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
  const ed = fig.closest('main.bw-doc').dataset.locale;
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
  if (e.target.closest('[data-dg-node]')) dgAction('dgLabel');
  else if (e.target.closest('[data-dg-edge]')) dgAction('dgEdgeLabel');
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
    for (const n of m.nodes) if (S.dg.nodes.includes(n.id)) { n.x += arrows[e.key][0] * step; n.y += arrows[e.key][1] * step; }
    dgSave(m);
    return;
  }
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
    case 'dgLabel': case 'dgSub': {
      const n = sel[0];
      if (!n) return;
      const f = a === 'dgSub' ? 'sub' : 'label';
      const v = await ask(t('dgLabelPrompt'), n[f] || '');
      if (v === '' && !n[f]) return;
      n[f] = v;
      if (!n.sized) Object.assign(n, DIAGRAM.measure(n));
      break;
    }
    case 'dgEdgeLabel': { if (!edge) return; edge.label = await ask(t('dgLabelPrompt'), edge.label || ''); break; }
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
