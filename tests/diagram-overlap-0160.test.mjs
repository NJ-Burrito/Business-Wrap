// 0.16.0 · FIGURE lane, note 4: diagram arrows never overlap.
//   model.routing = 2: arrows that share a line are spaced apart (the upper one with a small shadow); where one arrow crosses another the upper one jumps over it
//   by a small arc with a small shadow under it. Same primitives in the editor, the PDF, the DOCX (native shapes) and the HTML. Old stored drawings stay byte-identical.
//
//   node tests/diagram-overlap-0160.test.mjs        (numbers go to out/diagram-overlap-0160/numbers.json)
//
// The geometry checks below are written here, from the drawn primitives (routes and path strings); they share no code with engine/diagram.mjs.
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, printHtml, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'diagram-overlap-0160');
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
const SHADOW = [1.4, 1.8];
const SHADOW_INK = '#cdccc7';

// ── geometry, independent of the engine ──
const lenOf = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const piecesOf = (route) => route.slice(1).map((b, i) => ({ a: route[i], b, len: lenOf(route[i], b) })).filter((s) => s.len > 0.5);
/** Two pieces lie on each other: parallel, both ends within 1.5 of the other's line, sharing more than 2 units. */
function lying(s, t) {
  const ux = (s.b[0] - s.a[0]) / s.len;
  const uy = (s.b[1] - s.a[1]) / s.len;
  if (Math.abs(ux * ((t.b[1] - t.a[1]) / t.len) - uy * ((t.b[0] - t.a[0]) / t.len)) > 0.02) return false;
  const off = (q) => Math.abs((q[0] - s.a[0]) * uy - (q[1] - s.a[1]) * ux);
  if (off(t.a) >= 1.5 || off(t.b) >= 1.5) return false;
  const pa = (t.a[0] - s.a[0]) * ux + (t.a[1] - s.a[1]) * uy;
  const pb = (t.b[0] - s.a[0]) * ux + (t.b[1] - s.a[1]) * uy;
  return Math.min(s.len, Math.max(pa, pb)) - Math.max(0, Math.min(pa, pb)) > 2;
}
/** A proper crossing of two pieces: inside both, 1.5 units clear of their ends. */
function crossPt(s, t) {
  const d1 = [s.b[0] - s.a[0], s.b[1] - s.a[1]];
  const d2 = [t.b[0] - t.a[0], t.b[1] - t.a[1]];
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const c = [t.a[0] - s.a[0], t.a[1] - s.a[1]];
  const u = (c[0] * d2[1] - c[1] * d2[0]) / den;
  const v = (c[0] * d1[1] - c[1] * d1[0]) / den;
  if (u <= 1.5 / s.len || u >= 1 - 1.5 / s.len || v <= 1.5 / t.len || v >= 1 - 1.5 / t.len) return null;
  return [s.a[0] + d1[0] * u, s.a[1] + d1[1] * u];
}
/** Overlapping pairs and crossing points among drawn arrows (their routes), each arrow with its index in drawing order. */
function analyse(wires) {
  const overlaps = [];
  const crossings = [];
  for (let i = 0; i < wires.length; i += 1) {
    for (let j = i + 1; j < wires.length; j += 1) {
      for (const s of piecesOf(wires[i].route)) {
        for (const t of piecesOf(wires[j].route)) {
          if (lying(s, t)) overlaps.push([wires[i].id, wires[j].id]);
          const p = crossPt(s, t);
          if (p) crossings.push({ lo: wires[i].id, up: wires[j].id, p });
        }
      }
    }
  }
  return { overlaps, crossings };
}
/** The arcs of an SVG path: {mid, r, sweep}; the current point is tracked through M L Q C A. */
function arcsOfD(d) {
  const out = [];
  let cur = [0, 0];
  for (const m of String(d || '').matchAll(/([MLQCA])([^MLQCAZ]*)/g)) {
    const n = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (m[1] === 'A') { const e = [n[5], n[6]]; out.push({ mid: [(cur[0] + e[0]) / 2, (cur[1] + e[1]) / 2], r: n[0], sweep: n[4], from: cur, to: e }); cur = e; } else cur = [n.at(-2), n.at(-1)];
  }
  return out;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const wiresOf = (items) => items.filter((i) => i.t === 'line' && i.wire && i.id && !i.deco);

/** A workflow the way builders draw them: desks in a chain, rejecting forks, side excursions, returns to an earlier desk, jumps to a later one. */
function gen(n, seed) {
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
  return { kind: 'bw-diagram', version: 1, flow: 'ltr', nodes, edges };
}

// ── 1. old drawings stay byte-identical; a new layout carries the key ──
{
  const { DIAGRAM: OLD } = await import(pathToFileURL(path.join(REPO, 'tests', 'fixtures', 'diagram-0155.mjs')).href);
  const models = [];
  const walk = (x, loc) => { if (Array.isArray(x)) x.forEach((y) => walk(y, loc)); else if (x && typeof x === 'object') { if (x.kind === 'diagram' && x.model) models.push([x.model, loc]); for (const v of Object.values(x)) walk(v, loc); } };
  for (const s of fs.readdirSync(path.join(REPO, 'samples'))) {
    const dir = path.join(REPO, 'samples', s);
    for (const f of fs.readdirSync(dir)) {
      if (/^document\.(ar|en)\.json$/.test(f)) walk(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f.includes('.ar.') ? 'ar' : 'en');
      if (f === 'workflow.json') { const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); for (const loc of ['ar', 'en']) if (w[loc]) models.push([w[loc], loc]); }
    }
  }
  let same = 0;
  let withKey = 0;
  for (const [m, loc] of models) {
    withKey += m.routing ? 1 : 0;
    const a = OLD.render(OLD.ensure(m), { theme, locale: loc });
    const b = DIAGRAM.render(DIAGRAM.ensure(m), { theme, locale: loc });
    if (a === b && !b.includes(SHADOW_INK)) same += 1;
  }
  numbers.oldSamples = { compared: models.length, byteIdentical: same };
  check('old stored drawings (no routing key) draw byte-identical SVG, no shadow, no arc', models.length >= 5 && withKey === 0 && same === models.length, `${same}/${models.length}`);
  check('ensure() lays out for display only: it leaves the key off; layout() sets it', DIAGRAM.ensure(wf.en).routing === undefined && DIAGRAM.layout(wf.en).routing === 2 && DIAGRAM.layout(wf.en, { force: true, aspect: 2 }).routing === 2 && DIAGRAM.starter('en').routing === 2 && DIAGRAM.applyRouting(DIAGRAM.ensure(wf.en)).routing === 2);
  const placed = DIAGRAM.layout(wf.en);
  const noKey = { ...placed }; delete noKey.routing;
  const sOld = DIAGRAM.render(noKey, { theme, locale: 'en' });
  const sNew = DIAGRAM.render(placed, { theme, locale: 'en' });
  check('the key is what changes the drawing: same shapes, new arrows', sOld !== sNew && sNew.includes(SHADOW_INK) && !sOld.includes(SHADOW_INK) && /A\d/.test(sNew));
}

// ── 2. samples and generated workflows: every route kind ──
let exercised = 0;
{
  const stat = { drawings: 0, crossings: 0, hopped: 0, overlapsBefore: 0, overlapsAfter: 0, unshadowed: 0, strayShadows: 0, orderBad: 0 };
  const bad = [];
  const cases = [];
  for (const s of fs.readdirSync(path.join(REPO, 'samples'))) {
    const f = path.join(REPO, 'samples', s, 'workflow.json');
    if (!fs.existsSync(f)) continue;
    const w = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const loc of ['ar', 'en']) if (w[loc]) cases.push([`${s}/${loc}`, w[loc], loc]);
  }
  for (let seed = 1; seed <= 40; seed += 1) cases.push([`gen${seed}`, gen(8 + (seed % 5) * 4, seed), 'en']);
  for (const [name, src, loc] of cases) {
    for (const route of ['elbow', 'straight', 'curved']) {
      const m = DIAGRAM.layout(src, { aspect: 2 });
      if (route !== 'elbow') m.edges.forEach((e) => { e.route = route; });
      const before = DIAGRAM.resolve({ ...m, routing: undefined }, { theme, locale: loc, stats: true });
      const r = DIAGRAM.resolve(m, { theme, locale: loc, stats: true });
      stat.drawings += 1;
      stat.overlapsBefore += before.wires.overlaps;
      if (before.wires.overlaps) exercised += 1;
      const wires = wiresOf(r.items);
      const flat = route === 'curved' ? [] : wires;
      const a = analyse(flat);
      stat.overlapsAfter += a.overlaps.length;
      if (a.overlaps.length) bad.push(`${name}/${route}: overlap ${a.overlaps.slice(0, 2).map((p) => p.join('~')).join(',')}`);
      if (route !== 'curved') {
        if (a.crossings.length !== r.wires.crossings) bad.push(`${name}/${route}: engine counts ${r.wires.crossings} crossings, geometry finds ${a.crossings.length}`);
        const arcs = wires.flatMap((x) => arcsOfD(x.d).map((c) => ({ ...c, id: x.id })));
        // every crossing has its arc (either arrow; the upper by preference), unless it sat too close to a corner or an end
        let miss = 0;
        for (const c of a.crossings) {
          stat.crossings += 1;
          if (arcs.some((q) => (q.id === c.up || q.id === c.lo) && lenOf(q.mid, c.p) < 1.2)) stat.hopped += 1; else miss += 1;
        }
        if (miss > Math.max(2, 0.25 * a.crossings.length)) bad.push(`${name}/${route}: ${miss}/${a.crossings.length} crossings without an arc`);
      }
      // each arc has a shadow of the same size, offset by SHADOW, and it sits right under the arrow that jumps (drawn after the one it jumps over, before the jumper)
      for (const x of wires) {
        const idx = r.items.indexOf(x);
        for (const q of arcsOfD(x.d)) {
          const sh = r.items.find((i) => i.shadow === x.id && arcsOfD(i.d).some((z) => near(z.mid[0], q.mid[0] + SHADOW[0], 0.35) && near(z.mid[1], q.mid[1] + SHADOW[1], 0.35) && z.sweep === q.sweep && near(z.r, q.r, 0.2)));
          if (!sh) stat.unshadowed += 1;
          else if (r.items.indexOf(sh) > idx || r.items.slice(r.items.indexOf(sh) + 1, idx).some((i) => i.t === 'line' && i.wire && i.id && !i.deco)) stat.orderBad += 1;
        }
      }
      stat.strayShadows += r.items.filter((i) => i.shadow && !wires.some((x) => x.id === i.shadow)).length;
      if (route === 'elbow') {
        const hand = wires.some((x) => x.d.includes('NaN'));
        if (hand) bad.push(`${name}: NaN in a path`);
      }
    }
  }
  numbers.geometry = stat;
  check('every drawn arrow of every sample and generated workflow (elbow, straight, curved): no two lie on each other', stat.overlapsAfter === 0 && bad.filter((b) => /overlap/.test(b)).length === 0, `${stat.drawings} drawings, ${stat.overlapsAfter} overlaps left (${stat.overlapsBefore} before the fix)`);
  check('the fix was exercised: some drawings really had arrows lying on each other before it', stat.overlapsBefore > 0 && exercised >= 1, `${exercised} drawings`);
  check('the engine counts the same crossings as the independent geometry, and no check line is off', bad.filter((b) => /engine counts|without an arc|NaN/.test(b)).length === 0, bad.slice(0, 3).join(' / '));
  check('a crossing shows a jump arc (nearly every one; the rest sat at a corner)', stat.crossings > 30 && stat.hopped / stat.crossings >= 0.8, `${stat.hopped}/${stat.crossings}`);
  check('every arc has a small shadow of its own size, offset (1.4, 1.8), drawn under the arrow that jumps', stat.unshadowed === 0 && stat.orderBad === 0 && stat.strayShadows === 0, JSON.stringify({ unshadowed: stat.unshadowed, orderBad: stat.orderBad, stray: stat.strayShadows }));
}

// ── 3. arrows sharing a line: a constructed case, each way ──
{
  const node = (id, x, kind = 'staff') => ({ id, kind, label: id.toUpperCase(), x, y: 100, w: 120, h: 52 });
  const mk = (route) => ({ kind: 'bw-diagram', version: 1, flow: 'ltr', legend: false, nodes: [node('a', 40), node('b', 260), node('c', 480), node('d', 700)], edges: [{ id: 'e1', from: 'a', to: 'b', route }, { id: 'e2', from: 'a', to: 'c', route }, { id: 'e3', from: 'b', to: 'd', route }] });
  const one = (m) => DIAGRAM.resolve(m, { theme, locale: 'en', stats: true });
  const before = one(mk('straight'));
  const after = one({ ...mk('straight'), routing: 2 });
  const w = (r) => wiresOf(r.items);
  check('straight arrows lying on each other (a to c runs over a to b and b to d): found before the fix', before.wires.overlaps >= 2 && analyse(w(before)).overlaps.length >= 2, `${before.wires.overlaps} overlaps`);
  const A = analyse(w(after));
  check('after: spaced apart, none on another, each moved arrow has a shadow under it', A.overlaps.length === 0 && after.wires.overlaps === 0 && after.items.filter((i) => i.shadow).length >= 1, `${after.items.filter((i) => i.shadow).length} shadow(s)`);
  const sh = after.items.find((i) => i.shadow);
  const owner = sh && w(after).find((x) => x.id === sh.shadow);
  check('the shadow is under the upper arrow: grey, a little wider, offset, drawn just before it', !!sh && sh.color === SHADOW_INK && sh.lw > owner.lw && after.items.indexOf(sh) < after.items.indexOf(owner));
  // a hand-set path is respected: same joints, but it still jumps at a crossing
  const hand = { kind: 'bw-diagram', version: 1, flow: 'ltr', legend: false, nodes: [node('a', 40), node('b', 400), { id: 'c', kind: 'staff', label: 'C', x: 220, y: 260, w: 120, h: 52 }, { id: 'd', kind: 'staff', label: 'D', x: 220, y: -80, w: 120, h: 52 }],
    edges: [{ id: 'h1', from: 'a', to: 'b', via: [[160, 20], [460, 20]] }, { id: 'h2', from: 'c', to: 'd', via: [[280, 230], [280, -10]] }] };
  const h1 = one({ ...hand, routing: undefined }); const h2 = one({ ...hand, routing: 2 });
  const route1 = (r, id) => JSON.stringify(wiresOf(r.items).find((x) => x.id === id).route);
  check('a hand-set path (via) keeps its joints exactly, and still gets an arc where it crosses', route1(h1, 'h1') === route1(h2, 'h1') && route1(h1, 'h2') === route1(h2, 'h2') && h2.wires.crossings >= 1 && h2.wires.hops === h2.wires.crossings, JSON.stringify(h2.wires));
  // elbow lanes: parallel arrows that route() puts on one lane are spaced when it does
  const R = [];
  for (let seed = 1; seed <= 60; seed += 1) { const m = DIAGRAM.layout(gen(14 + (seed % 4) * 4, seed), { aspect: 1.6 }); const m1 = { ...m }; delete m1.routing; R.push([DIAGRAM.resolve(m1, { theme, locale: 'en', stats: true }).wires.overlaps, DIAGRAM.resolve(m, { theme, locale: 'en', stats: true }).wires.overlaps]); }
  numbers.elbowLanes = { before: R.reduce((s, x) => s + x[0], 0), after: R.reduce((s, x) => s + x[1], 0), drawings: R.length };
  check('elbow arrows on 60 generated workflows: the overlaps there were are gone', R.every((x) => x[1] === 0), JSON.stringify(numbers.elbowLanes));
}

// ── 4. every output draws the same primitives: SVG, HTML, PDF, DOCX ──
{
  const docEn = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.en.json'), 'utf8'));
  const blk = docEn.chapters[2].sections[0].blocks[0];
  const m = DIAGRAM.layout(blk.model, { aspect: 2 });
  blk.model = m;
  const r = DIAGRAM.resolve(m, { theme, locale: 'en', stats: true });
  const shadows = r.items.filter((i) => i.shadow);
  const wires = wiresOf(r.items);
  const arcs = wires.reduce((s, x) => s + arcsOfD(x.d).length, 0);
  numbers.outputs = { crossings: r.wires.crossings, arcs, shadows: shadows.length };
  check('the sample has crossings to draw (ready state: the outputs below saw arcs and shadows)', r.wires.crossings >= 3 && arcs >= 3 && shadows.length >= arcs, JSON.stringify(numbers.outputs));
  const svg = DIAGRAM.render(m, { theme, locale: 'en' });
  const count = (s, re) => (s.match(re) || []).length;
  check('SVG: one shadow path per shadow primitive, arcs as SVG arc commands', count(svg, new RegExp(`stroke="${SHADOW_INK}"`, 'g')) === shadows.length && count(svg, /<path d="[^"]*A\d/g) >= arcs);
  const html = printHtml(docEn, { locale: 'en', theme }).html;
  check('HTML (print markup): the same drawing', count(html, new RegExp(`stroke="${SHADOW_INK}"`, 'g')) >= shadows.length && /<path d="[^"]*A\d/.test(html));
  const browser0 = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(OUT, 'routing.en.pdf');
    await exportPdf(docEn, { locale: 'en', theme, pdfPath: pdf, browser: browser0 });
    const code = 'import sys,pymupdf;n=0;m=0\nfor p in pymupdf.open(sys.argv[1]):\n  for d in p.get_drawings():\n    c=d.get("color")\n    if c and abs(c[0]-205/255)<.012 and abs(c[1]-204/255)<.012 and abs(c[2]-199/255)<.012: n+=1\n    if d.get("color") and d.get("fill") is None and any(it[0]=="c" for it in d["items"]): m+=1\nprint(n,m)';
    const out = spawnSync(...py(['-c', code, pdf], ['pymupdf']), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    const [grey, curves] = (out.stdout || '').trim().split(/\s+/).map(Number);
    numbers.pdf = { greyStrokes: grey, curvedPaths: curves };
    check('PDF: the shadows are drawn (grey strokes), and the arcs are curves in the vector drawing', grey >= shadows.length * 0.9 && curves >= arcs, JSON.stringify(numbers.pdf) + (out.stderr ? ' ' + out.stderr.slice(0, 120) : ''));
  } finally { await browser0.close(); }
  const docx = path.join(OUT, 'routing.en.docx');
  exportDocx(docEn, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const code2 = 'import zipfile,sys;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode();print(x.count("Arrow shadow"),x.count("<pic:pic"),x.count("cdccc7".upper()))';
  const o2 = spawnSync(...py(['-c', code2, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const [sh, pics, ink] = (o2.stdout || '').trim().split(/\s+/).map(Number);
  numbers.docx = { shadowShapes: sh, pictures: pics, greyRuns: ink };
  check('DOCX: every shadow is a native, named Word line; no picture', sh === shadows.length && pics === 0 && ink >= shadows.length, JSON.stringify(numbers.docx));
}

// ── 5. the real editor: one click puts a stored drawing on the new arrows; the check returns the counts ──
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'overlap-0160', watermarkDir: '' });
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:calm', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ptr = await page.evaluate(() => { const B = window.BW; const d = B.M[B.S.svc].ar.doc; for (const [ci, c] of d.chapters.entries()) for (const [si, s] of c.sections.entries()) for (const [bi, b] of s.blocks.entries()) if (b.kind === 'diagram') return `/chapters/${ci}/sections/${si}/blocks/${bi}`; return null; });
  check('ready: the editor booted and holds a stored diagram without the key', !!ptr && await page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); const b = g(B.M[B.S.svc].ar.doc, p); return b.model.routing === undefined && !!document.querySelector('main.bw-doc figure[data-dg] svg'); }, ptr), ptr);
  const shadowsOnPage = () => page.evaluate((ink) => document.querySelectorAll(`main.bw-doc figure[data-dg] svg path[stroke="${ink}"]`).length, SHADOW_INK);
  const rawBefore = await page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); return JSON.stringify(g(B.M[B.S.svc].ar.doc, p).model); }, ptr);
  const s0 = await shadowsOnPage();
  const chk0 = await page.evaluate((p) => window.BW.EXT.diagram.check(p, 'ar'), ptr);
  check('the check returns the arrow overlap and crossing counts for the print frame', Number.isFinite(chk0.arrowOverlaps) && Number.isFinite(chk0.arrowCrossings) && chk0.routing === 1 && Array.isArray(chk0.frameMm) && chk0.frameMm[0] === DIAGRAM.PRINT.wMm && chk0.frameMm[1] === DIAGRAM.PRINT.maxHmm, JSON.stringify(chk0));
  await page.evaluate((p) => { const B = window.BW; B.S.dg = { b: p, ed: 'ar', nodes: [], edge: null }; B.S.sel = { p: null, b: p, ed: 'ar' }; B.runAction('dgCvRoute'); }, ptr);
  await page.waitForTimeout(250);
  const after = await page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); const m = g(B.M[B.S.svc].ar.doc, p).model; return { routing: m.routing, same: JSON.stringify({ ...m, routing: undefined }) }; }, ptr);
  const s1 = await shadowsOnPage();
  check('one click (dgCvRoute) sets routing 2 and moves nothing', after.routing === 2 && after.same === JSON.stringify({ ...JSON.parse(rawBefore), routing: undefined }), `routing ${after.routing}`);
  check('the editor now draws the shadows and arcs (the same primitives as the PDF)', s0 === 0 && s1 >= 1, `${s0} -> ${s1}`);
  const chk1 = await page.evaluate((p) => window.BW.EXT.diagram.check(p, 'ar'), ptr);
  check('the check counts again: routing 2, jumps drawn, no arrow on another', chk1.routing === 2 && chk1.jumps >= 1 && chk1.arrowOverlaps === 0, JSON.stringify(chk1));
  await page.evaluate(() => window.BW.undo());
  await page.waitForTimeout(150);
  check('undo restores the stored drawing exactly (key gone, no shadow)', (await shadowsOnPage()) === 0 && (await page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); return JSON.stringify(g(B.M[B.S.svc].ar.doc, p).model); }, ptr)) === rawBefore);
  await page.evaluate((p) => { const B = window.BW; B.S.dg = { b: p, ed: 'ar', nodes: [], edge: null }; B.runAction('dgAuto'); }, ptr);
  await page.waitForTimeout(250);
  check('Auto layout (dgAuto) draws the new arrows by default', (await shadowsOnPage()) >= 1 && (await page.evaluate((p) => { const B = window.BW; const g = (o, q) => q.split('/').filter(Boolean).reduce((x, k) => x[k], o); return g(B.M[B.S.svc].ar.doc, p).model.routing; }, ptr)) === 2);
  check('editor: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally { await browser.close(); }

fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 1));
console.log(results.join(NLs));
console.log(failed ? `${NLs}${failed} FAILED` : `${NLs}all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
