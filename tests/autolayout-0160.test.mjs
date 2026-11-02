// 0.16.0 · FIGURE lane, note 6: autoLayout and one legibility frame.
//   DIAGRAM.autoLayout / editor_action autoLayout {aspect, maxNodes}: from any model to a drawing that prints at the legibility bar, or the fewest figures that each do.
//   One frame everywhere (what print gives, measured here in a real PDF; block.frame honoured), per-node type size, a join node, a model by file path.
//
//   node tests/autolayout-0160.test.mjs        (numbers go to out/autolayout-0160/numbers.json)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
import { figureFrame, figureRoom } from '../engine/render.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'autolayout-0160');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
const NLs = String.fromCharCode(10);
process.on('uncaughtException', (e) => { console.log(results.join(NLs)); console.error('CRASH: ' + String(e.stack || e.message).split(NLs).slice(0, 4).join(' / ')); process.exit(1); });
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const theme = loadTheme();
const wf = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'workflow.json'), 'utf8'));
const PT = 72 / 25.4;

// ── independent measures, written here from the drawn primitives ──
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/** Printed size of the smallest text, in pt, when the drawing is fitted into a frame (mm): computed from resolve()'s text items, not from legibility(). */
function minPtIn(model, frameMm, capFrame = false, locale = 'en') {
  const r = DIAGRAM.resolve(model, { theme, locale });
  const scale = Math.min(frameMm[0] / r.view.w, frameMm[1] / r.view.h, ...(capFrame ? [0.4] : []));
  return Math.min(...r.items.filter((i) => i.t === 'text').map((i) => i.size)) * scale * PT;
}
const wiresOf = (items) => items.filter((i) => i.t === 'line' && i.wire && i.id && !i.deco);
/** Any piece of any arrow that runs through a shape that is not one of its two ends (2 units in from the outline). */
function throughShapes(model, locale = 'en') {
  const r = DIAGRAM.resolve(model, { theme, locale });
  const out = [];
  for (const w of wiresOf(r.items)) {
    for (const n of model.nodes) {
      if (['group', 'text', 'note'].includes(n.kind) || n.id === w.from || n.id === w.to) continue;
      for (let i = 1; i < w.route.length; i += 1) {
        const [x1, y1] = w.route[i - 1];
        const [x2, y2] = w.route[i];
        const hit = Math.abs(x1 - x2) < 0.5 ? x1 > n.x + 2 && x1 < n.x + n.w - 2 && Math.max(y1, y2) > n.y + 2 && Math.min(y1, y2) < n.y + n.h - 2 : y1 > n.y + 2 && y1 < n.y + n.h - 2 && Math.max(x1, x2) > n.x + 2 && Math.min(x1, x2) < n.x + n.w - 2;
        if (hit) out.push(`${w.id}~${n.id}`);
      }
    }
  }
  return out;
}
/** Every arrow starts on its source's outline and ends on its target's (1.5 units), and every edge is drawn. */
function ends(model, locale = 'en') {
  const r = DIAGRAM.resolve(model, { theme, locale });
  const ws = wiresOf(r.items);
  const onBox = (p, n) => p[0] >= n.x - 1.5 && p[0] <= n.x + n.w + 1.5 && p[1] >= n.y - 1.5 && p[1] <= n.y + n.h + 1.5 && (Math.abs(p[0] - n.x) < 1.5 || Math.abs(p[0] - n.x - n.w) < 1.5 || Math.abs(p[1] - n.y) < 1.5 || Math.abs(p[1] - n.y - n.h) < 1.5 || n.kind === 'decision' || ['start', 'ok', 'stop'].includes(n.kind));
  const by = new Map(model.nodes.map((n) => [n.id, n]));
  const bad = ws.filter((w) => !onBox(w.route[0], by.get(w.from)) || !onBox(w.route.at(-1), by.get(w.to)));
  return { drawn: ws.length, edges: model.edges.length, bad: bad.map((w) => w.id) };
}
const boxesApart = (model) => {
  const ns = model.nodes.filter((n) => !['group', 'text', 'symbol'].includes(n.kind));
  const bad = [];
  for (let i = 0; i < ns.length; i += 1) for (let j = i + 1; j < ns.length; j += 1) { const a = ns[i]; const b = ns[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) bad.push(`${a.id}~${b.id}`); }
  return bad;
};
/** Wire pieces lying on each other, from the routes. */
function wireOverlaps(model, locale = 'en') {
  const ws = wiresOf(DIAGRAM.resolve(model, { theme, locale }).items);
  let n = 0;
  for (let i = 0; i < ws.length; i += 1) for (let j = i + 1; j < ws.length; j += 1) for (let a = 1; a < ws[i].route.length; a += 1) for (let b = 1; b < ws[j].route.length; b += 1) {
    const s = { a: ws[i].route[a - 1], b: ws[i].route[a] };
    const t = { a: ws[j].route[b - 1], b: ws[j].route[b] };
    const sl = lenOf(s.a, s.b); const tl = lenOf(t.a, t.b);
    if (sl < 0.5 || tl < 0.5) continue;
    const ux = (s.b[0] - s.a[0]) / sl; const uy = (s.b[1] - s.a[1]) / sl;
    if (Math.abs(ux * ((t.b[1] - t.a[1]) / tl) - uy * ((t.b[0] - t.a[0]) / tl)) > 0.02) continue;
    const off = (q) => Math.abs((q[0] - s.a[0]) * uy - (q[1] - s.a[1]) * ux);
    if (off(t.a) >= 1.5 || off(t.b) >= 1.5) continue;
    const pa = (t.a[0] - s.a[0]) * ux + (t.a[1] - s.a[1]) * uy; const pb = (t.b[0] - s.a[0]) * ux + (t.b[1] - s.a[1]) * uy;
    if (Math.min(sl, Math.max(pa, pb)) - Math.max(0, Math.min(pa, pb)) > 2) n += 1;
  }
  return n;
}
/** A drawing is legible when no text prints under `minPt`, no texts overlap, and no arrow lies on another (all measured here). */
function legibleIn(model, frameMm, minPt = 7, capFrame = false) {
  const lg = DIAGRAM.legibility(model, { frameMm, minPt });
  return { ok: minPtIn(model, frameMm, capFrame) >= minPt - 1e-9 && lg.overlaps.length === 0 && wireOverlaps(model) === 0, minPt: minPtIn(model, frameMm, capFrame), textOverlaps: lg.overlaps.length, wireOverlaps: wireOverlaps(model) };
}

/** A workflow the way builders draw them (as in tests/diagram-overlap-0160.test.mjs). */
function gen(n, seed, edgesWanted) {
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const nodes = [{ id: 'n0', kind: 'start', label: 'Request received' }];
  const edges = [];
  const link = (a, b, label = '') => { if (a !== b && !edges.some((e) => e.from === a && e.to === b)) edges.push({ id: `e${edges.length}`, from: a, to: b, label }); };
  const kinds = ['staff', 'staff', 'applicant', 'system', 'payment'];
  for (let i = 1; i < n - 2; i += 1) nodes.push({ id: `n${i}`, kind: i % 4 === 0 ? 'decision' : kinds[Math.floor(rnd() * kinds.length)], label: i % 4 === 0 ? 'Action' : `Desk ${i} review` });
  nodes.push({ id: 'ok', kind: 'ok', label: 'Approved' }, { id: 'no', kind: 'stop', label: 'Refused' });
  const ids = nodes.map((x) => x.id);
  for (let i = 0; i < n - 2; i += 1) link(ids[i], ids[i + 1]);
  link(ids[n - 3], 'ok');
  for (let i = 1; i < n - 3; i += 1) {
    if (nodes[i].kind === 'decision') { link(ids[i], 'no', 'No'); if (rnd() < 0.5 && i + 3 < n - 2) link(ids[i], ids[i + 3], 'Skip'); }
    else if (rnd() < 0.22 && i > 2) link(ids[i], ids[i - 1 - Math.floor(rnd() * Math.min(i - 1, 3))], 'Back');
  }
  for (let guard = 0; edgesWanted && edges.length < edgesWanted && guard < 500; guard += 1) { const a = 1 + Math.floor(rnd() * (n - 4)); const b = Math.max(1, Math.min(n - 3, a + Math.floor(rnd() * 7) - 3)); link(ids[a], ids[b], rnd() < 0.5 ? 'Back' : ''); }
  return { kind: 'bw-diagram', version: 1, flow: 'ltr', nodes, edges };
}
const FRAME = [DIAGRAM.PRINT.wMm, DIAGRAM.PRINT.maxHmm];

// ── 1. ONE frame, measured from a real PDF ──
{
  const docEn = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.en.json'), 'utf8'));
  const blk = docEn.chapters[2].sections[0].blocks[0];
  const ptr = '/chapters/2/sections/0/blocks/0';
  const m = DIAGRAM.layout(wf.en, { aspect: 2.2 });
  blk.model = m;
  const ff = figureFrame(docEn, ptr, theme);
  check('the print frame of an automatic figure (render.mjs, from the page) is the constant every check uses', Math.abs(ff[0] - FRAME[0]) < 0.06 && ff[1] === FRAME[1], JSON.stringify({ ff, PRINT: DIAGRAM.PRINT }));
  const measure = async (doc, label) => {
    const browser = await chromium.launch(launchOptions());
    try {
      const pdf = path.join(OUT, `${label}.pdf`);
      await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf, browser });
      // the diagram's smallest lettering is the smallest span on its landscape page that is not the running header or footer (those are 7.98 and 7.99 pt)
      const code = 'import sys,pymupdf\nfor p in pymupdf.open(sys.argv[1]):\n  if p.rect.width>p.rect.height:\n    z=[s["size"] for b in p.get_text("dict")["blocks"] for l in b.get("lines",[]) for s in l["spans"] if abs(s["size"]-7.98)>0.02 and abs(s["size"]-7.99)>0.02 and s["size"]<12]\n    print(min(z) if z else -1);break';
      const out = spawnSync(...py(['-c', code, pdf], ['pymupdf']), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
      return Number((out.stdout || '').trim());
    } finally { await browser.close(); }
  };
  const real = await measure(docEn, 'auto');
  const predicted = DIAGRAM.legibility(m, { locale: 'en' }).minPtPrinted;
  const old = Math.round(minPtIn(m, [269, 140]) * 10) / 10;
  numbers.frame = { realPdfMinPt: real, predicted, oldFrame269x140: old };
  check('automatic figure: legibility() with no frame agrees with the real PDF (within 0.15 pt); the old 269 x 140 frame did not', real > 0 && Math.abs(real - predicted) <= 0.15 && Math.abs(real - old) > 0.15, JSON.stringify(numbers.frame));
  blk.frame = { wMm: 200, hMm: 80, mode: 0 };
  const ff2 = figureFrame(docEn, ptr, theme);
  const real2 = await measure(docEn, 'framed');
  const pred2 = DIAGRAM.legibility(m, { frame: blk.frame, locale: 'en' });
  numbers.frameBlock = { realPdfMinPt: real2, predicted: pred2.minPtPrinted, frameMm: pred2.frameMm };
  check('block.frame is the print height: figureFrame and legibility read it, and agree with the PDF (within 0.15 pt)', JSON.stringify(ff2) === '[200,80]' && JSON.stringify(pred2.frameMm) === '[200,80]' && real2 > 0 && Math.abs(real2 - pred2.minPtPrinted) <= 0.15, JSON.stringify(numbers.frameBlock));
  check('a frame argument still wins (the CLI and old callers)', DIAGRAM.legibility(m, { frameMm: [269, 140], locale: 'en' }).frameMm[0] === 269);
}

// ── 2. the helper notes: what autoLayout must handle, one test each ──
{
  const N = (id, kind, label, extra = {}) => ({ id, kind, label, ...extra });
  const E = (id, from, to, label = '') => ({ id, from, to, label });
  const base = (nodes, edges) => ({ kind: 'bw-diagram', version: 1, flow: 'ltr', nodes, edges });
  const cases = {
    'a fork three desks from the row start, reaching a join': base(
      [N('s', 'start', 'Request'), N('d1', 'staff', 'Desk one'), N('d2', 'staff', 'Desk two'), N('f', 'decision', 'Action'), N('a', 'staff', 'Branch A'), N('b', 'system', 'Branch B'), N('j', 'join', ''), N('d4', 'staff', 'Desk four'), N('ok', 'ok', 'Approved')],
      [E('e1', 's', 'd1'), E('e2', 'd1', 'd2'), E('e3', 'd2', 'f'), E('e4', 'f', 'a', 'Yes'), E('e5', 'f', 'b', 'Also'), E('e6', 'a', 'j'), E('e7', 'b', 'j'), E('e8', 'j', 'd4'), E('e9', 'd4', 'ok')]),
    'a rejecting fork desk (refusal and approval from one desk)': base(
      [N('s', 'start', 'Request'), N('d1', 'staff', 'Desk one'), N('d2', 'decision', 'Action'), N('no', 'stop', 'Refused'), N('d3', 'staff', 'Desk three'), N('ok', 'ok', 'Approved')],
      [E('e1', 's', 'd1'), E('e2', 'd1', 'd2'), E('e3', 'd2', 'no', 'Reject'), E('e4', 'd2', 'd3', 'Accept'), E('e5', 'd3', 'ok')]),
    'a service with no output (a system step that ends the branch)': base(
      [N('s', 'start', 'Request'), N('d1', 'staff', 'Desk one'), N('sys', 'system', 'Notify the applicant'), N('d2', 'staff', 'Desk two'), N('ok', 'ok', 'Approved')],
      [E('e1', 's', 'd1'), E('e2', 'd1', 'sys'), E('e3', 'd1', 'd2'), E('e4', 'd2', 'ok')]),
    'a side excursion from a desk with no forward exit': base(
      [N('s', 'start', 'Request'), N('d1', 'staff', 'Desk one'), N('d2', 'staff', 'Desk two'), N('rw', 'rework', 'Applicant completes'), N('d3', 'staff', 'Desk three'), N('ok', 'ok', 'Approved')],
      [E('e1', 's', 'd1'), E('e2', 'd1', 'd2'), E('e3', 'd2', 'rw', 'Missing papers'), E('e4', 'rw', 'd1'), E('e5', 'd1', 'd3'), E('e6', 'd3', 'ok')]),
    'back to an earlier desk, and a jump to a later one in the same row': base(
      [N('s', 'start', 'Request'), N('d1', 'staff', 'Desk one'), N('d2', 'staff', 'Desk two'), N('d3', 'staff', 'Desk three'), N('d4', 'staff', 'Desk four'), N('ok', 'ok', 'Approved')],
      [E('e1', 's', 'd1'), E('e2', 'd1', 'd2'), E('e3', 'd2', 'd3'), E('e4', 'd3', 'd4'), E('e5', 'd4', 'ok'), E('e6', 'd4', 'd2', 'Return'), E('e7', 'd1', 'd4', 'Fast track')]),
  };
  for (const [name, src] of Object.entries(cases)) {
    for (const loc of ['en', 'ar']) {
      const r = DIAGRAM.autoLayout(src, { locale: loc, aspect: 2.2 });
      const m = r.model;
      const e = ends(m, loc);
      const l = legibleIn(m, FRAME);
      check(`autoLayout (${loc}): ${name}`, r.ok && !r.figures && l.ok && boxesApart(m).length === 0 && e.drawn === e.edges && e.bad.length === 0 && throughShapes(m, loc).length === 0 && m.routing === 2,
        JSON.stringify({ ok: r.ok, minPt: Math.round(l.minPt * 100) / 100, textOverlaps: l.textOverlaps, wireOverlaps: l.wireOverlaps, apart: boxesApart(m), ends: e, through: throughShapes(m, loc) }));
    }
  }
}

// ── 3. join node, per-node type size ──
{
  const m = DIAGRAM.layout({ kind: 'bw-diagram', version: 1, flow: 'ltr', nodes: [{ id: 'a', kind: 'staff', label: 'A' }, { id: 'b', kind: 'staff', label: 'B' }, { id: 'j', kind: 'join' }, { id: 'c', kind: 'staff', label: 'C' }], edges: [{ id: 'e1', from: 'a', to: 'j', head: 'none' }, { id: 'e2', from: 'b', to: 'j', head: 'none' }, { id: 'e3', from: 'j', to: 'c' }] }, { force: true });
  const r = DIAGRAM.resolve(m, { theme, locale: 'en' });
  const j = m.nodes.find((n) => n.id === 'j');
  const dot = r.items.find((i) => i.t === 'shape' && i.id === 'j');
  check('a join is a real primitive: a filled dot of its own size, no label, no zero-size group', !!dot && dot.w === 10 && dot.h === 10 && dot.fill !== 'none' && j.w === 10 && j.h === 10 && !r.items.some((i) => i.t === 'text' && i.id === 'j'), JSON.stringify(dot));
  check('arrows meet on the join: three edges drawn, ends on its outline, none through a shape', ends(m).drawn === 3 && ends(m).bad.length === 0 && throughShapes(m).length === 0, JSON.stringify(ends(m)));
  const sized = DIAGRAM.layout({ kind: 'bw-diagram', version: 1, flow: 'ltr', nodes: [{ id: 'a', kind: 'staff', label: 'Big label', fs: 24 }, { id: 'b', kind: 'decision', label: 'Action', fs: 17 }, { id: 'c', kind: 'staff', label: 'Plain label' }], edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'c' }] }, { force: true });
  const rs = DIAGRAM.resolve(sized, { theme, locale: 'en' });
  const sz = (id) => rs.items.find((i) => i.t === 'text' && i.id === id && i.node)?.size;
  const plain = DIAGRAM.layout({ kind: 'bw-diagram', version: 1, flow: 'ltr', nodes: [{ id: 'a', kind: 'staff', label: 'Big label' }, { id: 'b', kind: 'decision', label: 'Action' }, { id: 'c', kind: 'staff', label: 'Plain label' }], edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'c' }] }, { force: true });
  check('per-node type size: fs sets that shape\'s label (a decision can match the stages), the others keep the kind\'s own, the shape grows to fit', sz('a') === 24 && sz('b') === 17 && sz('c') === 17 && sized.nodes.find((n) => n.id === 'a').h >= plain.nodes.find((n) => n.id === 'a').h && sized.nodes.find((n) => n.id === 'b').w > plain.nodes.find((n) => n.id === 'b').w, JSON.stringify({ a: sz('a'), b: sz('b'), c: sz('c'), plainDecisionW: plain.nodes.find((n) => n.id === 'b').w, w: sized.nodes.find((n) => n.id === 'b').w }));
  const mm = DIAGRAM.nearestAnchor({ x: 0, y: 0, w: 333, h: 77, kind: 'staff' }, [111.1111, 0]);
  check('ports: a new anchor keeps six decimals (was three), a stored three-decimal one reads back unchanged', /^\d\.\d{4,6}$/.test(String(mm.at)) && mm.at !== Math.round(mm.at * 1000) / 1000 && DIAGRAM.validAnchor({ side: 'r', at: 0.123 }).at === 0.123 && DIAGRAM.anchorPoint({ x: 0, y: 0, w: 100, h: 50, kind: 'staff' }, 'r', 0.123, 3)[1] === 6.15);
}

// ── 4. generated workflows, 6 to 40 nodes ──
{
  const sizes = [6, 8, 10, 14, 18, 24, 32, 40];
  const rows = [];
  let splits = 0;
  for (const n of sizes) {
    for (const seed of n <= 14 ? [1, 2, 3] : [1]) {
      const g = gen(n, seed * 7 + n);
      const t0 = Date.now();
      const r = DIAGRAM.autoLayout(g, { locale: 'en' });
      const figs = r.figures || [{ model: r.model }];
      const lv = figs.map((f) => legibleIn(f.model, FRAME));
      const ok = r.ok && lv.every((x) => x.ok);
      if (r.figures) splits += 1;
      rows.push({ nodes: n, seed, edges: g.edges.length, figures: figs.length, minPt: Math.round(Math.min(...lv.map((x) => x.minPt)) * 100) / 100, ok, ms: Date.now() - t0 });
      check(`autoLayout ${n} nodes, ${g.edges.length} edges (seed ${seed}): ${r.figures ? `a clean split into ${figs.length}` : 'one legible figure'}, zero text or arrow overlaps`, ok, JSON.stringify(rows.at(-1)));
    }
  }
  numbers.generated = rows;
  check('the run saw both outcomes: small graphs stay one figure, big ones are split', rows.some((x) => x.figures === 1) && splits >= 1);
}

// ── 5. the 24-node, 40-edge workflow of the notes ──
{
  const g = gen(24, 5, 40);
  check('the workflow has 24 nodes and 40 edges (as built)', g.nodes.length === 24 && g.edges.length === 40, `${g.nodes.length}/${g.edges.length}`);
  const t0 = Date.now();
  const r = DIAGRAM.autoLayout(g, { locale: 'en', maxNodes: 20 });
  const figs = r.figures || [{ model: r.model, nodes: g.nodes.map((n) => n.id) }];
  const lv = figs.map((f) => legibleIn(f.model, FRAME));
  numbers.workflow24 = { ok: r.ok, figures: figs.length, minPtEach: lv.map((x) => Math.round(x.minPt * 100) / 100), ms: Date.now() - t0 };
  check('24 nodes, 40 edges: 7 pt on the figure\'s own page, or a clean split (each figure at 7 pt or more, no overlaps)', r.ok && lv.every((x) => x.ok) && figs.length <= 6, JSON.stringify(numbers.workflow24));
  check('the cut keeps every node and every edge somewhere (continuations aside)', r.figures ? g.nodes.every((n) => r.figures.some((f) => f.model.nodes.some((x) => x.id === n.id))) && g.edges.every((e) => r.figures.some((f) => f.model.edges.some((x) => x.from === e.from && x.to === e.to) || f.model.edges.some((x) => x.from === e.from) || f.model.edges.some((x) => x.to === e.to))) : true);
}

// ── 6. a model by file path (the CLI, which the MCP op shares) ──
{
  fs.writeFileSync(path.join(OUT, 'model.json'), JSON.stringify(gen(12, 5)));
  fs.writeFileSync(path.join(OUT, 'ref.json'), JSON.stringify({ $file: 'model.json' }));
  const run = (args) => spawnSync(process.execPath, [path.join(REPO, 'engine', 'diagram-cli.mjs'), ...args], { encoding: 'utf8', cwd: OUT, env: { ...process.env, INIT_CWD: OUT, PYTHONUTF8: '1' } });
  const a = run(['--auto-layout', 'ref.json', '--locale', 'en']);
  let j = null; try { j = JSON.parse(a.stdout); } catch { j = null; }
  check('--auto-layout reads {"$file": path} and returns the legibility result', !!j && typeof j.ok === 'boolean' && j.model?.routing === 2 && Number.isFinite(j.legibility?.minPtPrinted) && j.legibility.wireOverlaps === 0 && (a.status === 0) === j.ok, `${a.status} ${a.stderr.slice(0, 120)}`);
  const l = run(['--legibility', 'ref.json', '--locale', 'en']);
  let lj = null; try { lj = JSON.parse(l.stdout); } catch { lj = null; }
  check('--legibility with no --frame measures against the print frame and counts the arrows', !!lj && lj.frameMm[0] === DIAGRAM.PRINT.wMm && lj.frameMm[1] === DIAGRAM.PRINT.maxHmm && Number.isFinite(lj.wireOverlaps) && Number.isFinite(lj.wireCrossings), l.stdout.slice(0, 100));
  const ap = run(['--apply-routing', 'model.json']);
  let aj = null; try { aj = JSON.parse(ap.stdout); } catch { aj = null; }
  check('--apply-routing sets the key and moves nothing', !!aj && aj.routing === 2 && JSON.stringify({ ...aj, routing: undefined }) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(OUT, 'model.json'), 'utf8'))));
}

// ── 7. the real editor: editor_action autoLayout / check go through EXT.diagram ──
{
  const file = path.join(OUT, 'editor.html');
  buildEditor({ inputs: [SAMPLE], out: file, set: 'autolayout-0160', watermarkDir: '' });
  const browser = await chromium.launch(launchOptions());
  const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:calm', '1'); } catch {} });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready && window.BW.EXT?.diagram);
    const ptr = await page.evaluate(() => { const B = window.BW; const d = B.M[B.S.svc].ar.doc; for (const [ci, c] of d.chapters.entries()) for (const [si, s] of c.sections.entries()) for (const [bi, b] of s.blocks.entries()) if (b.kind === 'diagram') return `/chapters/${ci}/sections/${si}/blocks/${bi}`; return null; });
    const read = () => page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); return JSON.stringify(g(B.M[B.S.svc].ar.doc, p).model); }, ptr);
    const before = await read();
    const ops0 = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length);
    const res = await page.evaluate((p) => window.BW.EXT.diagram.autoLayout(p, { aspect: 2.2, maxNodes: 20 }, 'ar'), ptr);
    const after = await read();
    const ops1 = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length);
    numbers.editorAutoLayout = res;
    check('ready: the editor booted with EXT.diagram and a stored diagram', !!ptr && before.length > 100);
    check('autoLayout returns the legibility result and the arrow counts for the print frame', typeof res.ok === 'boolean' && Number.isFinite(res.minPtPrinted) && res.arrowOverlaps === 0 && Number.isFinite(res.arrowCrossings) && res.routing === 2 && res.frameMm[0] === DIAGRAM.PRINT.wMm, JSON.stringify(res));
    check('it is ONE undoable replace of the model (laid out, key set)', ops1 - ops0 === 1 && JSON.parse(after).routing === 2 && after !== before);
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(150);
    check('undo restores the stored model exactly', (await read()) === before);
    check('editor: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  } finally { await browser.close(); }
}

// ── 0.16.1 · the event-permit sample prints legibly, found by kind (no fixed block pointer), in both languages, and the fit buttons' frames are the print's frame ──
{
  const MIN = 7;
  for (const loc of ['ar', 'en']) {
    const doc = JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${loc}.json`), 'utf8'));
    const dgs = [];
    doc.chapters.forEach((c, ci) => c.sections.forEach((sec, si) => sec.blocks.forEach((b, bi) => { if (b.kind === 'diagram') dgs.push({ b, ptr: `/chapters/${ci}/sections/${si}/blocks/${bi}` }); })));
    const lgs = dgs.map(({ b, ptr }) => DIAGRAM.legibility(DIAGRAM.ensure(b.model), { frameMm: figureFrame(doc, ptr, theme), theme, locale: loc, minPt: MIN }));
    check(`sample ${loc}: the workflow is ${dgs.length} figures (two), each prints at ${MIN} pt or more with no label overlap (legibility on figureFrame)`, dgs.length === 2 && lgs.every((l) => l.ok && l.minPtPrinted >= MIN && l.overlaps.length === 0), JSON.stringify(lgs.map((l) => [l.minPtPrinted, l.small.length, l.overlaps.length])));
    // the fit buttons set the room; the print draws a saved frame as figureFrame says (one source): fit frames are not cut back
    const room = figureRoom(doc, dgs[0].ptr, theme);
    const fitted = structuredClone(doc);
    const [ci, si, bi] = dgs[0].ptr.split('/').filter(Boolean).filter((x) => /^\d+$/.test(x)).map(Number);
    fitted.chapters[ci].sections[si].blocks[bi].frame = { wMm: room.wMm, hMm: room.hMm, mode: 2 };
    const ff = figureFrame(fitted, dgs[0].ptr, theme);
    check(`sample ${loc}: «ملاءمة الصفحة» frame is figureRoom and figureFrame returns it unchanged (editor, legibility and print agree)`, ff[0] === room.wMm && ff[1] === room.hMm, JSON.stringify({ room: [room.wMm, room.hMm], ff }));
    const browser = await chromium.launch(launchOptions());
    try {
      const pdf = path.join(OUT, `sample-${loc}.pdf`);
      await exportPdf(doc, { locale: loc, theme, pdfPath: pdf, browser });
      const code = 'import sys,pymupdf\nz=[]\nfor p in pymupdf.open(sys.argv[1]):\n  if p.rect.width>p.rect.height:\n    z+=[s["size"] for b in p.get_text("dict")["blocks"] for l in b.get("lines",[]) for s in l["spans"] if s["text"].strip() and abs(s["size"]-7.98)>0.02 and abs(s["size"]-7.99)>0.02]\nprint(len(z),min(z) if z else 0)';
      const out = spawnSync(...py(['-c', code, pdf], ['pymupdf']), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
      const [n, mn] = String(out.stdout).trim().split(/\s+/).map(Number);
      numbers[`samplePdf.${loc}`] = { spans: n, minPt: mn };
      check(`sample ${loc}: the PDF's smallest lettering on the landscape pages is ${MIN} pt or more (measured, ${n} spans)`, n > 40 && mn >= MIN - 0.05, String(out.stdout).trim() + (out.stderr ? ' ' + String(out.stderr).slice(0, 200) : ''));
    } finally { await browser.close(); }
  }
}

fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 1));
console.log(results.join(NLs));
console.log(failed ? `${NLs}${failed} FAILED` : `${NLs}all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
