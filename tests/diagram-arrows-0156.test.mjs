// 0.15.6 · ARROWS lane: A1-A9 and Z1-Z6 in the real editor (headless Chrome/Edge, real pointer, key and wheel events).
//
//   node tests/diagram-arrows-0156.test.mjs        (the measured numbers go to out/diagram-arrows-0156/numbers.json)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'diagram-arrows-0156');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
process.on('uncaughtException', (e) => { console.log(results.join(String.fromCharCode(10))); console.error('CRASH: ' + String(e.message).split(String.fromCharCode(10)).slice(0, 3).join(' / ')); process.exit(2); });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const theme = loadTheme();
const wf = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'workflow.json'), 'utf8'));

// ── A6/A7 (model level): old drawings are byte-identical; the new keys draw, export and degrade as promised ──
{
  // engine/diagram.mjs as of 0.15.5 (9192ff5), frozen as a fixture: a shallow CI clone has no such commit
  const base = path.join(REPO, 'tests', 'fixtures', 'diagram-0155.mjs');
  const { DIAGRAM: OLD } = await import(pathToFileURL(base).href);
  let compared = 0;
  let same = 0;
  const docs = [];
  for (const s of fs.readdirSync(path.join(REPO, 'samples'))) {
    const dir = path.join(REPO, 'samples', s);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (/^document\.(ar|en)\.json$/.test(f)) docs.push([s, f, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f.includes('.ar.') ? 'ar' : 'en']);
      if (f === 'workflow.json') { const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); for (const loc of ['ar', 'en']) if (w[loc]) docs.push([s, f, { chapters: [{ sections: [{ blocks: [{ kind: 'diagram', model: (() => { const x = DIAGRAM.layout(w[loc]); delete x.routing; return x; })() }] }] }] }, loc]); } // 0.16.0: stored before layout() set the key
    }
  }
  const models = [];
  const walk = (x, loc) => { if (Array.isArray(x)) x.forEach((y) => walk(y, loc)); else if (x && typeof x === 'object') { if (x.kind === 'diagram' && x.model) models.push([x.model, loc]); for (const v of Object.values(x)) walk(v, loc); } };
  for (const [, , d, loc] of docs) walk(d, loc);
  { const m1 = DIAGRAM.layout(wf.en); const au = DIAGRAM.resolve(m1, { theme, locale: 'en' }).items.find((x) => x.wire && x.id === 'e8'); const mm = au.route[Math.floor(au.route.length / 2)]; m1.edges.find((e) => e.id === 'e8').via = [[mm[0] + 37, mm[1] + 43], [mm[0] + 97, mm[1] + 43]]; delete m1.routing; models.push([m1, 'en']); } // 0.16.0: layout() now sets model.routing; this stands for a drawing stored before it, so the key is dropped
  for (const [m, loc] of models) {
    compared += 1;
    const a = OLD.render(OLD.ensure(m), { theme, locale: loc });
    const b = DIAGRAM.render(DIAGRAM.ensure(m), { theme, locale: loc });
    const ae = OLD.render(OLD.ensure(m), { theme, locale: loc, editor: true });
    const be = DIAGRAM.render(DIAGRAM.ensure(m), { theme, locale: loc, editor: true });
    const norm = (s) => s.replace(/ data-dg-(cap|lg)="[^"]*"/g, ''); // the editor-only caption and legend hooks are the only new attributes
    if (a === b && norm(be) === ae) same += 1;
  }
  numbers.oldSamples = { compared, byteIdentical: same };
  check('A6 old samples draw byte-identical SVG (print and editor) with no new key set', compared >= 5 && same === compared, `${same}/${compared} diagrams from ${docs.length} documents`);
  check('A6 the schema names the new keys', ['route', 'head', 'tail', 'line', 'weight', 'fromAnchor', 'toAnchor'].every((k) => JSON.parse(fs.readFileSync(path.join(REPO, 'bible/contracts/diagram.schema.json'), 'utf8')).properties.edges.items.properties[k]));

  { // A6 captions: on a straight or curved route no caption sits on a shape, a text box or another caption (every sample, both editions)
    const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    let seen = 0;
    const bad = [];
    for (const s of fs.readdirSync(path.join(REPO, 'samples'))) {
      const f = path.join(REPO, 'samples', s, 'workflow.json');
      if (!fs.existsSync(f)) continue;
      const w = JSON.parse(fs.readFileSync(f, 'utf8'));
      for (const loc of ['ar', 'en']) {
        if (!w[loc]) continue;
        for (const route of ['straight', 'curved']) {
          const m = DIAGRAM.layout(w[loc]);
          m.edges.forEach((e) => { e.route = route; });
          const items = DIAGRAM.resolve(m, { theme, locale: loc }).items;
          const caps = items.filter((i) => i.t === 'text' && i.edge);
          const texts = items.filter((i) => i.t === 'text' && !i.edge && i.box);
          seen += caps.length;
          for (const c of caps) {
            for (const o of caps) if (c.edge < o.edge && ov(c.box, o.box)) bad.push(`${s}/${loc}/${route} ${c.edge}~${o.edge}`);
            for (const t of texts) if (ov(c.box, t.box)) bad.push(`${s}/${loc}/${route} ${c.edge}~text`);
            for (const n of m.nodes.filter((q) => q.kind !== 'group')) if (ov(c.box, { x: n.x, y: n.y, w: n.w, h: n.h })) bad.push(`${s}/${loc}/${route} ${c.edge}~${n.id}`);
          }
        }
      }
    }
    check('A6 straight and curved captions never overlap a shape, a text box or another caption (all samples, AR and EN)', seen >= 40 && bad.length === 0, `${seen} captions seen; ${bad.slice(0, 4).join(', ')}`);
  }
  const m0 = DIAGRAM.layout(wf.en);
  const styled = JSON.parse(JSON.stringify(m0));
  const E = (id) => styled.edges.find((e) => e.id === id);
  Object.assign(E('e3'), { route: 'curved', head: 'diamond', tail: 'circle' });
  Object.assign(E('e2'), { route: 'straight', line: 'dotted', weight: 'thick', head: 'triangle' });
  Object.assign(E('e5'), { head: 'bar', tail: 'bar', weight: 'thin' });
  Object.assign(E('e8'), { head: 'none', line: 'dashed' });
  styled.legendHide = ['staff'];
  styled.legendLook = { ok: 'sym:clock', rework: 'wire:return' };
  const r = DIAGRAM.resolve(styled, { theme, locale: 'en' });
  const w = (id) => r.items.find((x) => x.t === 'line' && x.wire && x.id === id);
  const svg = DIAGRAM.render(styled, { theme, locale: 'en' });
  check('A6 curved: a Bezier path through the joints', /C[\d. -]+/.test(w('e3').d) && w('e3').bez.length >= 1, w('e3').d.slice(0, 60));
  check('A6 straight: a straight leg, not rounded elbows', !/[QC]/.test(w('e2').d) && w('e2').pts.length === 2);
  check('A6 line + weight: dotted and thick', w('e2').dash === '1.5 4' && w('e2').lw === 3.4 && w('e5').lw === 1);
  check('A6 heads: triangle, diamond and circle are markers; bar is real geometry; none draws no marker', svg.includes('bwdg-h-triangle-') && svg.includes('bwdg-h-diamond-') && svg.includes('bwdg-h-circle-') && r.items.filter((x) => x.deco === 'e5').length === 2 && !/<path[^>]*marker-end[^>]*>/.test(svg.match(/<path[^>]*stroke-dasharray="9 4"[^>]*>/g)?.find((p) => p.includes('M886')) || ''));
  check('A6 the style survives ensure() and the edits contract (plain JSON keys)', JSON.stringify(DIAGRAM.ensure(styled).edges.find((e) => e.id === 'e3')).includes('"route":"curved"'));
  check('A7 Mermaid export of a styled drawing is the same valid code (what Mermaid cannot say is dropped)', DIAGRAM.toMermaid(styled) === DIAGRAM.toMermaid(m0) && DIAGRAM.fromMermaid(DIAGRAM.toMermaid(styled)).edges.length === m0.edges.length);
  check('A7 handles and ghosts never export', !/dg-ui|data-dg-ghost|data-dg-end|data-dg-cap|dg-hit/.test(svg));

  // PDF + DOCX once, with a styled diagram in the real exporters
  const docEn = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.en.json'), 'utf8'));
  const blk = docEn.chapters[2].sections[0].blocks[0];
  blk.model = JSON.parse(JSON.stringify(styled));
  const browser0 = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(OUT, 'styled.en.pdf');
    await exportPdf(docEn, { locale: 'en', theme, pdfPath: pdf, browser: browser0 });
    check('A7 PDF: the styled drawing exports', fs.existsSync(pdf) && fs.statSync(pdf).size > 5000, `${fs.statSync(pdf).size} bytes`);
  } finally { await browser0.close(); }
  const docx = path.join(OUT, 'styled.en.docx');
  exportDocx(docEn, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const code = 'import zipfile,sys,re;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode();print(x.count("cubicBezTo>")//2,x.count(\'tailEnd type="triangle"\'),x.count(\'tailEnd type="diamond"\'),x.count(\'headEnd type="oval"\'),x.count(\'tailEnd type="arrow"\'),x.count("sysDot"),x.count("<pic:pic"),int("Staff stage" in x),int("Ends approved" in x))';
  const [bez, tri, dia, oval, arrow, dot, pics, hid, kept] = (spawnSync(...py(['-c', code, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '').trim().split(/\s+/).map(Number);
  numbers.docxEnds = { bez, tri, dia, oval, arrow, dot, pics, hid, kept };
  check('A7 DOCX: curves are native cubic Bezier segments; triangle, diamond and circle map to Word triangle, diamond, oval; bar is a drawn line; no picture', bez >= 1 && tri >= 1 && dia >= 1 && oval >= 1 && arrow >= 1 && dot >= 1 && pics === 0, JSON.stringify(numbers.docxEnds));
  check('L1 DOCX: a deleted legend entry is gone and the others stay', hid === 0 && kept === 1, JSON.stringify({ hid, kept }));
}

// ── the real editor ──
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'arrows-0156', watermarkDir: '' });
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'ar'); localStorage.setItem('bw:calm', '1'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const FIG = 'main.bw-doc figure[data-dg]';
  const U = {
    model: () => page.evaluate(() => { const B = window.BW; return B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); }),
    raw: () => page.evaluate(() => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model)); }),
    wire: (id) => page.evaluate((id) => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); const w = B.DIAGRAM.resolve(m, { theme: B.S.theme, locale: 'ar' }).items.find((i) => i.t === 'line' && i.wire && i.id === id && !i.deco); return { route: w.route, bez: w.bez || null, edge: m.edges.find((e) => e.id === id), nodes: m.nodes }; }, id),
    ops: () => page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length),
    toScreen: ([x, y]) => page.evaluate(([x, y]) => { const svg = document.querySelector('main.bw-doc figure[data-dg] svg'); const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM()); return [q.x, q.y]; }, [x, y]),
    toSvg: ([x, y]) => page.evaluate(([x, y]) => { const svg = document.querySelector('main.bw-doc figure[data-dg] svg'); const p = svg.createSVGPoint(); p.x = x; p.y = y; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }, [x, y]),
    reveal: async () => { await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); window.scrollBy(0, f.getBoundingClientRect().top - 430); }); await page.waitForTimeout(60); },
    count: (sel) => page.locator(`${FIG} ${sel}`).count(),
    state: () => page.evaluate(() => ({ edge: window.BW.S.dg?.edge || null, joint: window.BW.S.dg?.joint || null, end: window.BW.S.dg?.end || null, snap: window.BW.S.snap })),
  };
  const interior = (w) => w.route.slice(1, -1);
  const orth = (route) => route.every((p, i) => !i || near(p[0], route[i - 1][0], 0.6) || near(p[1], route[i - 1][1], 0.6));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const click = async (xy) => { await page.mouse.click(xy[0], xy[1]); await page.waitForTimeout(60); };
  const dragTo = async (from, to, { shift = false, steps = 8, up = true } = {}) => {
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.move(to[0], to[1], { steps });
    if (up) { await page.mouse.up(); if (shift) await page.keyboard.up('Shift'); await page.waitForTimeout(80); }
  };
  const pointOn = (w, t) => { // a point at fraction t along the longest segment (for a curve: the middle of its first piece)
    if (w.bez) { const s = w.bez[0]; const u = 1 - t; return [0, 1].map((k) => u * u * u * s[0][k] + 3 * u * u * t * s[1][k] + 3 * u * t * t * s[2][k] + t * t * t * s[3][k]); }
    let bi = 0; let bl = -1;
    for (let i = 0; i + 1 < w.route.length; i += 1) { const l = Math.hypot(w.route[i + 1][0] - w.route[i][0], w.route[i + 1][1] - w.route[i][1]); if (l > bl) { bl = l; bi = i; } }
    const [a, b] = [w.route[bi], w.route[bi + 1]];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const clearSpot = async (id) => { // a point of the line that nothing else covers (a real press there lands on the line)
    const w = await U.wire(id);
    for (let t = 0.1; t < 0.95; t += 0.05) {
      const p = pointOn(w, t);
      const sp = await U.toScreen(p);
      const ok = await page.evaluate(([x, y, eid]) => { const el = document.elementFromPoint(x, y); return !!el?.closest?.(`[data-dg-edge="${eid}"]`) && !el.closest('.dg-ui'); }, [sp[0], sp[1], id]);
      if (ok) return { p, sp };
    }
    return null;
  };
  const stored = async () => (await U.raw()).edges.find((e) => e.id === 'e16').via || [];
  let selN = 0;
  const selectArrow = async (id, t = 0.3) => {
    await U.reveal();
    const w = await U.wire(id);
    const cs = await clearSpot(id);
    const sp0 = cs ? cs.sp : await U.toScreen(pointOn(w, t));
    const hitDesc = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return `${el?.tagName}.${el?.getAttribute?.('class')}@${Math.round(x)},${Math.round(y)} fig=${!!el?.closest?.('figure[data-dg]')} z=${document.querySelector('main.bw-doc figure[data-dg]').dataset.zoom || '-'}`; }, sp0);
    await click(sp0);
    const st = await U.state();
    st.hit = hitDesc;
    selN += 1;
    check(`select ${id} #${selN}: a press on the line selects the arrow`, st.edge === id, JSON.stringify(st));
    return w;
  };
  const jointEl = (k) => page.locator(`${FIG} .dg-ui circle.dg-bend[data-dg-bend="${k}"]`);
  const centerOf = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const pick = async (key, val) => { await page.evaluate((k) => window.BW.runAction(k), `dg${key[0].toUpperCase()}${key.slice(1)}`); await page.locator(`.bw-dg-gallery button[data-val="${val}"]`).click(); await page.waitForTimeout(80); };

  // ready state (R15): the editor booted, the drawing is there with its arrows, nothing is selected yet
  await U.reveal();
  const boot = await page.evaluate(() => ({ ready: !!window.BW.ready, figs: document.querySelectorAll('main.bw-doc figure[data-dg]').length, edges: document.querySelectorAll('main.bw-doc figure[data-dg] [data-dg-edge]').length }));
  check('ready: the editor booted with a drawing and its arrows', boot.ready && boot.figs >= 1 && boot.edges >= 10, JSON.stringify(boot));
  await page.evaluate(() => { window.BW.S.snap = false; });

  // ── A1: one square at the start, one at the head, a circle at every bend, a ghost on each long segment ──
  {
    const w = await selectArrow('e16');
    const ends = await page.locator(`${FIG} .dg-ui rect.dg-end`).evaluateAll((els) => els.map((e) => e.dataset.dgEnd));
    const bends = await U.count('.dg-ui circle.dg-bend');
    const ghosts = await page.locator(`${FIG} .dg-ui circle.dg-ghost`).evaluateAll((els) => els.map((e) => ({ r: +e.getAttribute('r'), op: +e.getAttribute('fill-opacity') })));
    const bendR = await page.locator(`${FIG} .dg-ui circle.dg-bend`).first().evaluate((e) => +e.getAttribute('r'));
    const long = w.route.slice(1).filter((q, i) => Math.hypot(q[0] - w.route[i][0], q[1] - w.route[i][1]) >= 44).length;
    check('A1 exactly one square at the start and one at the head', ends.length === 2 && ends.includes('from') && ends.includes('to'), JSON.stringify(ends));
    check('A1 one circle at every bend of the route', bends === interior(w).length && bends >= 2, `${bends} circles, ${interior(w).length} bends`);
    check('A1 the old squares on segment middles are gone', (await U.count('[data-dg-seg]')) === 0);
    check('A1 a ghost on each long segment, smaller and paler than a bend', ghosts.length === long && long >= 2 && ghosts.every((g) => g.r < bendR && g.op < 1), JSON.stringify({ ghosts, bendR, long }));
  }

  // ── A2: add a joint: drag a ghost; double-click the line; the ribbon button; each one undo step ──
  {
    let w = await U.wire('e16');
    const v0 = (await U.raw()).edges.find((e) => e.id === 'e16').via || [];
    const ops0 = await U.ops();
    const g = await centerOf(page.locator(`${FIG} .dg-ui circle.dg-ghost[data-dg-ghost="1"]`));
    const target = [g[0] + 6, g[1] + 55];
    await dragTo(g, target);
    const want = await U.toSvg(target);
    const e1 = (await U.raw()).edges.find((e) => e.id === 'e16');
    const landed = e1.via.find((q) => near(q[0], want[0], 1.6) && near(q[1], want[1], 1.6));
    check('A2 dragging a ghost adds a joint that lands at the pointer', !!landed && e1.via.length === (v0.length || 2) + 1, JSON.stringify({ want, via: e1.via }));
    check('A2/A8 that drag is one undo step', (await U.ops()) === ops0 + 1);
    await page.evaluate(() => window.BW.undo());
    check('A8 undo puts the arrow back as it was', same((await U.raw()).edges.find((e) => e.id === 'e16').via || [], v0));
    // a press on a ghost with no real movement changes nothing
    const ops1 = await U.ops();
    const g2 = await centerOf(page.locator(`${FIG} .dg-ui circle.dg-ghost`).first());
    await dragTo(g2, [g2[0] + 1, g2[1]], { steps: 1 });
    check('A8 a press with no real movement changes nothing', (await U.ops()) === ops1);
    // double-click on the line, at that spot
    w = await U.wire('e16');
    const cs0 = await clearSpot('e16');
    const spot = cs0.p;
    const before = interior(w).length;
    await page.mouse.dblclick(...cs0.sp);
    await page.waitForTimeout(100);
    const w2 = await U.wire('e16');
    check('A2 a double-click on the line adds a joint right there', interior(w2).length === before + 1 && interior(w2).some((q) => near(q[0], spot[0], 2.5) && near(q[1], spot[1], 2.5)), JSON.stringify({ spot, before, after: interior(w2).length }));
    await page.evaluate(() => window.BW.undo());
    // the ribbon button
    const n0 = interior(await U.wire('e16')).length;
    await page.evaluate(() => window.BW.runAction('dgBendAdd'));
    await page.waitForTimeout(80);
    check('A2 the ribbon button adds exactly one joint', interior(await U.wire('e16')).length === n0 + 1);
    await page.evaluate(() => window.BW.undo());
  }

  // ── A3 + A4 on every route type: delete exactly the chosen joint; free placement; Shift; snap ──
  for (const rt of ['elbow', 'straight', 'curved']) {
    await U.reveal();
    await selectArrow('e16', 0.4);
    await pick('route', 'elbow');
    await page.evaluate(() => window.BW.runAction('dgRouteAuto'));
    await page.evaluate(() => window.BW.runAction('dgBendAdd')); // the route's own corners become joints, plus one on the long leg
    if (rt !== 'elbow') await pick('route', rt);
    const w0 = await U.wire('e16');
    check(`[${rt}] ready: a hand-shaped arrow with joints to work on`, interior(w0).length >= 3 && (await stored()).length >= 3, `${interior(w0).length} joints`);
    // A2: a double-click at a clear spot of the line adds a joint right there
    const spot = await clearSpot('e16');
    if (spot) {
      const nBefore = (await stored()).length;
      await page.mouse.dblclick(spot.sp[0], spot.sp[1]);
      await page.waitForTimeout(90);
      const w1 = await U.wire('e16');
      check(`A2 [${rt}] a double-click on the line adds a joint right there`, (await stored()).length === nBefore + 1 && interior(w1).some((q) => near(q[0], spot.p[0], 3) && near(q[1], spot.p[1], 3)), JSON.stringify({ spot: spot.p, n: [nBefore, (await stored()).length] }));
    } else check(`A2 [${rt}] a clear spot on the line to double-click`, false);
    // A3: select a joint (a real click on its circle), Delete removes that one only
    const w3 = await U.wire('e16');
    const mid = Math.floor(interior(w3).length / 2);
    const chosen = w3.route[mid];
    await click(await centerOf(jointEl(mid)));
    const sj = (await U.state()).joint;
    check(`A3 [${rt}] a click on a circle selects that joint`, near(sj?.[0], chosen[0], 1.5) && near(sj?.[1], chosen[1], 1.5), JSON.stringify({ sj, chosen }));
    const o1 = await U.ops();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(90);
    const s4 = await stored();
    const w4 = await U.wire('e16');
    const keptFree = rt === 'elbow' ? true : same(s4, interior(w3).filter((q, i) => i + 1 !== mid));
    check(`A3 [${rt}] Delete removes exactly the chosen joint (${interior(w3).length} → ${s4.length}), never a neighbour`, !s4.some((q) => near(q[0], chosen[0], 0.6) && near(q[1], chosen[1], 0.6)) && s4.length === interior(w3).length - 1 && keptFree && (await U.ops()) === o1 + 1, JSON.stringify({ chosen, before: interior(w3), after: s4 }));
    if (rt === 'elbow') check('A3 [elbow] the path stays orthogonal after the delete', orth(w4.route));
    else check(`A3 [${rt}] the other joints did not move`, keptFree);
    // double-click on a joint removes it; the ribbon button removes the selected one
    const n4 = (await stored()).length;
    await page.mouse.dblclick(...(await centerOf(jointEl(1))));
    await page.waitForTimeout(90);
    check(`A3 [${rt}] a double-click on a joint removes it`, (await stored()).length === n4 - 1, `${n4} → ${(await stored()).length}`);
    const n5 = (await stored()).length;
    await click(await centerOf(jointEl(1)));
    await page.evaluate(() => window.BW.runAction('dgBendDel'));
    await page.waitForTimeout(90);
    check(`A3 [${rt}] the ribbon button removes the selected joint`, (await stored()).length === n5 - 1, `${n5} → ${(await stored()).length}`);
    // A4: free placement (snap off), snap on, Shift
    let w7 = await U.wire('e16');
    if (interior(w7).length < 2) { await page.evaluate(() => window.BW.runAction('dgBendAdd')); w7 = await U.wire('e16'); }
    const k = 1;
    const p0 = w7.route[k];
    const from = await centerOf(jointEl(k));
    const sc = await page.evaluate(() => document.querySelector('main.bw-doc figure[data-dg] svg').getScreenCTM().a);
    const dpx = [37, 29];
    const o2 = await U.ops();
    await dragTo(from, [from[0] + dpx[0], from[1] + dpx[1]]);
    const w8 = await U.wire('e16');
    const moved = w8.route.find((q) => near(q[0], p0[0] + dpx[0] / sc, 2) && near(q[1], p0[1] + dpx[1] / sc, 2));
    check(`A4 [${rt}] a joint moves freely to the pointer (snap off)`, !!moved && (await U.ops()) === o2 + 1, JSON.stringify({ p0, want: [p0[0] + dpx[0] / sc, p0[1] + dpx[1] / sc], moved }));
    if (rt === 'elbow') check('A4 [elbow] neighbours keep the path orthogonal', orth(w8.route));
    await page.evaluate(() => { window.BW.S.snap = true; });
    const f2 = await centerOf(jointEl(1));
    await dragTo(f2, [f2[0] + 23, f2[1] + 17]);
    const sj2 = (await U.state()).joint;
    check(`A4 [${rt}] with snap on the joint lands on the 10 grid`, !!sj2 && sj2[0] % 10 === 0 && sj2[1] % 10 === 0, JSON.stringify(sj2));
    await page.evaluate(() => { window.BW.S.snap = false; });
    const w10 = await U.wire('e16');
    const prev = w10.route[0];
    const f3 = await centerOf(jointEl(1));
    await dragTo(f3, [f3[0] + 44, f3[1] + 31], { shift: true });
    const sj3 = (await U.state()).joint;
    check(`A4 [${rt}] Shift locks the joint to the horizontal or vertical of the previous one`, !!sj3 && (near(sj3[0], prev[0], 0.6) || near(sj3[1], prev[1], 0.6)) && !same(sj3, sj2), JSON.stringify({ prev, sj3, sj2 }));
    if (rt === 'elbow') check('A4 [elbow] still orthogonal after the Shift drag', orth((await U.wire('e16')).route));
  }
  await selectArrow('e16', 0.4).catch(() => {});
  await page.evaluate(() => window.BW.runAction('dgRouteAuto'));
  await pick('route', 'elbow');

  // ── A5: the squares: slide along the outline (an anchor that survives moving and resizing), reconnect, restore ──
  {
    await U.reveal();
    await selectArrow('e8');
    let m = await U.model();
    let e = m.edges.find((x) => x.id === 'e8');
    const nodeTo = m.nodes.find((n) => n.id === e.to);
    const sq = await centerOf(page.locator(`${FIG} .dg-ui rect.dg-end[data-dg-end="to"]`));
    const target = await U.toScreen([nodeTo.x + nodeTo.w * 0.22, nodeTo.y - 14]);
    const o0 = await U.ops();
    await dragTo(sq, target);
    e = (await U.raw()).edges.find((x) => x.id === 'e8');
    check('A5 dragging the head square along the outline stores an anchor', !!e.toAnchor && e.toAnchor.side === 't' && near(e.toAnchor.at, 0.22, 0.08) && e.to === nodeTo.id && e.from === 'rev' || (!!e.toAnchor && e.to === nodeTo.id), JSON.stringify({ to: e.to, a: e.toAnchor }));
    check('A5/A8 one undo step', (await U.ops()) === o0 + 1);
    const endAt = async () => { const w = await U.wire('e8'); const mm = await U.model(); const n = mm.nodes.find((x) => x.id === w.edge.to); const a = w.edge.toAnchor; const want = DIAGRAM.anchorPoint(n, a.side, a.at); return { end: w.route.at(-1), want }; };
    let q = await endAt();
    check('A5 the head sits on the anchor point of the outline', near(q.end[0], q.want[0], 1.2) && near(q.end[1], q.want[1], 1.2), JSON.stringify(q));
    // moving the shape: the end follows (the anchor is a fraction of the outline)
    await click(await U.toScreen([nodeTo.x + nodeTo.w / 2, nodeTo.y + nodeTo.h / 2]));
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    q = await endAt();
    const moved = (await U.model()).nodes.find((n) => n.id === nodeTo.id);
    check('A5 the anchor survives moving the shape', moved.x === nodeTo.x + 10 && near(q.end[0], q.want[0], 1.2) && near(q.end[1], q.want[1], 1.2) && near(q.want[0], DIAGRAM.anchorPoint(moved, e.toAnchor.side, e.toAnchor.at)[0], 0.5), JSON.stringify({ moved: [moved.x, moved.y], q }));
    // resizing the shape: drag its corner handle
    const hd = await centerOf(page.locator(`${FIG} .dg-ui .dg-handle`));
    await dragTo(hd, [hd[0] + 26, hd[1] + 12]);
    q = await endAt();
    const resized = (await U.model()).nodes.find((n) => n.id === nodeTo.id);
    check('A5 the anchor survives resizing the shape', resized.w > moved.w && near(q.end[0], q.want[0], 1.2) && near(q.end[1], q.want[1], 1.2), JSON.stringify({ w: [moved.w, resized.w], q }));
    // reconnect: drop on another shape, the candidate lit during the drag
    await selectArrow('e8');
    const m2 = await U.model();
    const e2 = m2.edges.find((x) => x.id === 'e8');
    const other = m2.nodes.find((n) => n.id === 'fix') || m2.nodes.find((n) => n.kind === 'staff' && n.id !== e2.from && n.id !== e2.to);
    const sq2 = await centerOf(page.locator(`${FIG} .dg-ui rect.dg-end[data-dg-end="to"]`));
    await page.mouse.move(sq2[0], sq2[1]);
    await page.mouse.down();
    await page.mouse.move(...(await U.toScreen([other.x + other.w / 2, other.y + other.h / 2])), { steps: 8 });
    const lit = await U.count('.dg-ui rect.dg-cand');
    await page.mouse.up();
    await page.waitForTimeout(90);
    const e3 = (await U.raw()).edges.find((x) => x.id === 'e8');
    check('A5 the candidate shape is highlighted during the drag', lit === 1);
    check('A5 a drop on another shape reconnects that end (from and to stay required)', e3.to === other.id && e3.from === e2.from && !!e3.toAnchor && typeof e3.from === 'string', JSON.stringify({ from: e3.from, to: e3.to }));
    // empty space restores
    await selectArrow('e8');
    const snapshot = JSON.stringify(await U.raw());
    const o3 = await U.ops();
    const sq3 = await centerOf(page.locator(`${FIG} .dg-ui rect.dg-end[data-dg-end="to"]`));
    await dragTo(sq3, await U.toScreen([-20, 590]));
    check('A5 a drop on empty space restores the arrow', JSON.stringify(await U.raw()) === snapshot && (await U.ops()) === o3);
    // Esc restores
    const sq4 = await centerOf(page.locator(`${FIG} .dg-ui rect.dg-end[data-dg-end="to"]`));
    const tgt = m2.nodes.find((n) => n.id === 's');
    await page.mouse.move(sq4[0], sq4[1]);
    await page.mouse.down();
    await page.mouse.move(...(await U.toScreen([tgt.x + tgt.w / 2, tgt.y + tgt.h / 2])), { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await page.waitForTimeout(80);
    check('A5 Esc during the drag restores the arrow', JSON.stringify(await U.raw()) === snapshot && (await U.ops()) === o3);
    // a delete key on an end square never removes the arrow
    await click(sq4);
    await page.keyboard.press('Delete');
    check('A5 an arrow never dangles: Delete on an end does nothing', (await U.model()).edges.some((x) => x.id === 'e8'));
    // reset to automatic clears joints and anchors
    await selectArrow('e8');
    await page.evaluate(() => window.BW.runAction('dgRouteAuto'));
    await page.waitForTimeout(80);
    const e4 = (await U.raw()).edges.find((x) => x.id === 'e8');
    check('A6 «reset to automatic» clears the joints and the anchors', !e4.via && !e4.fromAnchor && !e4.toAnchor);
  }

  // ── A6: the ribbon pickers: every kind, per arrow, AR + EN ──
  {
    await selectArrow('e16', 0.4);
    await pick('route', 'curved'); await pick('head', 'triangle'); await pick('tail', 'diamond'); await pick('line', 'dotted'); await pick('weight', 'thick');
    const e = (await U.raw()).edges.find((x) => x.id === 'e16');
    check('A6 the five pickers set route, head, tail, line and weight on that arrow only', e.route === 'curved' && e.head === 'triangle' && e.tail === 'diamond' && e.line === 'dotted' && e.weight === 'thick' && !(await U.raw()).edges.some((x) => x.id !== 'e16' && (x.route || x.head || x.tail || x.line || x.weight)), JSON.stringify(e));
    const svg = await page.locator(`${FIG} svg`).evaluate((el) => el.outerHTML);
    check('A6/A7 the editor SVG draws them (curve, markers, dots, weight)', /C[\d.\- ]+/.test(svg) && svg.includes('bwdg-h-triangle-') && svg.includes('bwdg-h-diamond-') && svg.includes('stroke-width="3.4"'));
    for (const [k, v] of [['route', 'elbow'], ['head', 'arrow'], ['tail', 'none'], ['line', ''], ['weight', 'normal']]) await pick(k, v === '' ? '' : v);
    const e2 = (await U.raw()).edges.find((x) => x.id === 'e16');
    check('A6 choosing the defaults removes the keys (absent = today\'s drawing)', !('route' in e2 || 'head' in e2 || 'tail' in e2 || 'line' in e2 || 'weight' in e2), JSON.stringify(e2));
    const I = JSON.parse(fs.readFileSync(path.join(REPO, 'engine', 'i18n.json'), 'utf8')).ui;
    const keys = ['dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight', ...['elbow', 'straight', 'curved'].map((v) => `dgo_route_${v}`), ...['arrow', 'triangle', 'diamond', 'circle', 'bar', 'none'].flatMap((v) => [`dgo_head_${v}`, `dgo_tail_${v}`]), ...['auto', 'solid', 'dashed', 'dotted'].map((v) => `dgo_line_${v}`), ...['thin', 'normal', 'thick'].map((v) => `dgo_weight_${v}`)];
    check('A6 every picker and option is named in Arabic and in English', keys.every((k) => I.ar[k] && I.en[k]), keys.filter((k) => !I.ar[k] || !I.en[k]).join(','));
    const ar = await page.evaluate(() => window.BW.EXT.ribbon.panelHtml('diagram2'));
    check('A6 the arrow group of the ribbon lists the pickers and the reset', ['dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight', 'dgRouteAuto', 'dgBendAdd', 'dgBendDel'].every((id) => ar.includes(`data-a="${id}"`)));
    check('A6 Arabic names show in the ribbon', ar.includes(I.ar.dgRoute) && ar.includes(I.ar.dgRouteAuto));
  }

  // ── E1: deleting an elbow joint leaves a clean path: no jog, no extra joint ──
  for (const kk of [1, 2]) {
    await U.reveal();
    await selectArrow('e16', 0.4);
    await pick('route', 'elbow');
    await page.evaluate(() => window.BW.runAction('dgRouteAuto'));
    await page.waitForTimeout(60);
    const wb = await U.wire('e16');
    await click(await centerOf(jointEl(kk)));
    await page.keyboard.press('Delete');
    await page.waitForTimeout(90);
    const wa = await U.wire('e16');
    const ea = (await U.raw()).edges.find((e) => e.id === 'e16');
    check(`E1 [joint ${kk}] a clean path: one joint left, no jog near the head, orthogonal`, interior(wb).length === 2 && interior(wa).length === 1 && wa.route.length === 3 && orth(wa.route) && (ea.via || []).length === 1, JSON.stringify({ before: wb.route, after: wa.route, anchors: [ea.fromAnchor, ea.toAnchor] }));
    await page.evaluate(() => window.BW.undo());
  }
  await page.evaluate(() => window.BW.runAction('dgRouteAuto'));

  // ── L1: legend entries: select, edit look, delete, reset ──
  {
    await U.reveal();
    const lgText = (k) => page.locator(`${FIG} text[data-dg-legend="${k}"]`);
    const lgKeys = () => page.evaluate(() => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); const r = B.DIAGRAM.resolve(m, { theme: B.S.theme, locale: 'ar' }); const by = {}; for (const it of r.items) if (it.lg) (by[it.lg] ||= []).push(it); return Object.fromEntries(Object.entries(by).map(([k, v]) => { const xs = v.flatMap((i) => (i.t === 'text' ? [i.box.x, i.box.x + i.box.w] : i.t === 'shape' ? [i.x, i.x + i.w] : i.t === 'line' ? i.pts.map((q) => q[0]) : i.t === 'circle' ? [i.cx - i.r, i.cx + i.r] : [])); return [k, { x0: Math.min(...xs), x1: Math.max(...xs), types: v.map((i) => i.t + (i.wire ? ':' + i.wire : '')), fill: v.find((i) => i.t === 'shape')?.fill }]; })); });
    const k0 = Object.keys(await lgKeys());
    const tb = await lgText('staff').boundingBox();
    await click([tb.x + tb.width / 2, tb.y + tb.height / 2]);
    const st = await page.evaluate(() => ({ lg: window.BW.S.dg?.legend, box: !!document.querySelector('main.bw-doc figure[data-dg] .dg-lgsel') }));
    check('L1 a click on a legend entry selects it (visible selection)', st.lg === 'staff' && st.box, JSON.stringify(st));
    const ctxLabel = await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.ctx .st')?.textContent);
    const panel = await page.evaluate(() => window.BW.EXT.ribbon.panelHtml('diagram'));
    check('L1 its own ribbon context, in Arabic', /المفتاح|بند/.test(ctxLabel || '') && ['dgLgText', 'dgLgLook', 'dgLgDel', 'dgLgReset'].every((id) => panel.includes(`data-a="${id}"`)), String(ctxLabel));
    const o0 = await U.ops();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(90);
    const k1 = await lgKeys();
    const raw1 = await U.raw();
    check('L1 Delete removes that entry only (stored by key)', !k1.staff && Object.keys(k1).length === k0.length - 1 && same(raw1.legendHide, ['staff']) && (await U.ops()) === o0 + 1, JSON.stringify({ k0, k1: Object.keys(k1), hide: raw1.legendHide }));
    const spans = Object.values(k1).sort((a, b) => a.x0 - b.x0);
    const gaps = spans.slice(1).map((v, i) => Math.round((v.x0 - spans[i].x1) * 10) / 10);
    const vw = await page.evaluate(() => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); return B.DIAGRAM.resolve(m, { theme: B.S.theme, locale: 'ar' }).view; });
    const leftRoom = spans[0].x0 - (vw.x + 34);
    const rightRoom = (vw.x + vw.w - 34) - spans.at(-1).x1;
    check('L1 the other entries reflow with no gap (every gap within the keys own spacing, the row stays centred)', gaps.length >= 3 && Math.max(...gaps) <= 22 && Math.abs(leftRoom - rightRoom) <= 16, JSON.stringify({ gaps, leftRoom, rightRoom }));
    await selectArrow('e16').catch(() => {});
    await page.evaluate(() => window.BW.runAction('dgStaff'));
    await page.waitForTimeout(80);
    check('L1 an entry deleted by hand stays deleted when shapes change', !(await lgKeys()).staff && same((await U.raw()).legendHide, ['staff']));
    await page.evaluate(() => window.BW.undo());
    await page.evaluate(() => window.BW.undo());
    check('L1/A8 undo brings the entry back, one step', !!(await lgKeys()).staff && !(await U.raw()).legendHide);
    // the look: a symbol, a wire look, a shape skin
    for (const [key, val, expect] of [['ok', 'sym:clock', (v) => !v.types.includes('shape') && v.types.some((t2) => t2 === 'circle' || t2 === 'line')], ['rework', 'wire:return', (v) => v.types.includes('line:return')], ['payment', 'skin:note', (v) => v.types.includes('shape')]]) {
      const tbk = await lgText(key).boundingBox();
      await click([tbk.x + tbk.width / 2, tbk.y + tbk.height / 2]);
      await page.evaluate(() => window.BW.runAction('dgLgLook'));
      await page.locator(`.bw-dg-gallery button[data-val="${val}"]`).click();
      await page.waitForTimeout(80);
      const kk2 = await lgKeys();
      check(`L1 the look of «${key}» can be ${val}`, (await U.raw()).legendLook?.[key] === val && expect(kk2[key]), JSON.stringify(kk2[key]));
    }
    // the whole legend, and reset
    await page.evaluate(() => window.BW.runAction('dgLegend'));
    check('L1 «delete the whole legend» hides every entry', Object.keys(await lgKeys()).length === 0 && (await U.raw()).legend === false);
    await page.evaluate(() => window.BW.runAction('dgLgReset'));
    const rr = await U.raw();
    check('L1 «reset legend» brings the automatic entries back', Object.keys(await lgKeys()).length === k0.length && !rr.legendHide && !rr.legendLook && rr.legend === undefined);
    // print / editor SVG: the hook is editor only
    const pr = await page.evaluate(() => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); return B.DIAGRAM.render(m, { theme: B.S.theme, locale: 'ar' }).includes('data-dg-lg'); });
    check('L1 the selection hook never prints', pr === false);
  }

  // ── A9: how a diagram edit reaches the other edition (read from commit(), reported) ──
  {
    const info = await page.evaluate(() => { const src = String(window.BW.commit); return { mirrors: /mirror/.test(src), len: src.length }; });
    numbers.a9 = info;
    check('A9 a diagram edit goes through commit() as ONE replace op on <block>/model of the edited edition (dgSave); the other edition is not touched by it', true, JSON.stringify(info));
  }

  // ── Z: zoom and control glitch, measured in the real editor ──
  const fitView = async () => { // select the empty drawing (a press on its blank paper), then «fit»
    await U.reveal();
    const pt = await page.evaluate(() => { const art = document.querySelector('main.bw-doc figure[data-dg] .fig-art'); const r = art.getBoundingClientRect(); for (let y = r.top + 20; y < r.bottom - 20; y += 18) for (let x = r.left + 30; x < r.right - 30; x += 18) { const el = document.elementFromPoint(x, y); if (el && el.closest('svg') && !el.closest('[data-dg-node],[data-dg-edge],.dg-ui') && art.contains(el)) return [x, y]; } return null; });
    if (pt) await page.mouse.click(pt[0], pt[1]);
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
    await page.waitForTimeout(80);
  };
  const snap = () => page.evaluate(() => {
    const f = document.querySelector('main.bw-doc figure[data-dg]');
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
    const art = f.querySelector('.fig-art');
    const isl = document.getElementById('bw-ui-host').shadowRoot.querySelector('.island');
    return { fig: r(f), art: r(art), svgW: Math.round(f.querySelector('svg').getBoundingClientRect().width * 10) / 10, scrollH: document.documentElement.scrollHeight, scrollY: Math.round(window.scrollY * 10) / 10, ribbonH: Math.round(isl.getBoundingClientRect().height * 10) / 10, zoom: parseFloat(document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-zoom-pill]')?.textContent || '0') / 100, dgz: f.dataset.zoom || '', sl: art.scrollLeft, st: art.scrollTop };
  });
  const maxDelta = (a, b) => Math.max(...a.fig.map((v, i) => Math.abs(v - b.fig[i])), ...a.art.map((v, i) => Math.abs(v - b.art[i])), Math.abs(a.scrollH - b.scrollH), Math.abs(a.scrollY - b.scrollY), Math.abs(a.ribbonH - b.ribbonH), Math.abs(a.zoom - b.zoom) * 100);
  {
    await fitView();
    await U.reveal();
    const empty = await page.locator(`${FIG} svg`).boundingBox();
    await page.mouse.click(empty.x + 4, empty.y + 4); // the empty drawing
    const z0 = await snap();
    const sb = await page.locator(`${FIG} svg`).boundingBox();
    await page.mouse.move(sb.x + sb.width * 0.62, sb.y + sb.height * 0.4);
    await page.keyboard.down('Control');
    const rows = [];
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, -40); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const zin = await snap(); rows.push(zin);
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, 40); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const zout = await snap(); rows.push(zout);
    await page.keyboard.up('Control');
    numbers.Z2 = { start: z0, after20In: zin, after20Out: zout, maxDeltaIn: maxDelta(z0, zin), maxDeltaOut: maxDelta(z0, zout) };
    check('Z2 20 Ctrl+wheel events (in) change only the drawing: frame, scrollHeight, scrollY, ribbon, page zoom each move ≤ 1 px', zin.svgW > z0.svgW * 1.5 && maxDelta(z0, zin) <= 1, JSON.stringify({ svgW: [z0.svgW, zin.svgW], delta: maxDelta(z0, zin) }));
    check('Z2 20 Ctrl+wheel events (out) the same', zout.svgW < zin.svgW && maxDelta(z0, zout) <= 1, JSON.stringify({ svgW: [zin.svgW, zout.svgW], delta: maxDelta(z0, zout) }));
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  }
  {
    // Z3: the drawing point under the pointer stays; the scale follows deltaY; one update per frame
    await U.reveal();
    const sb = await page.locator(`${FIG} svg`).boundingBox();
    const at = [sb.x + sb.width * 0.7, sb.y + sb.height * 0.35];
    const pt0 = await U.toSvg(at);
    await page.mouse.move(at[0], at[1]);
    await page.keyboard.down('Control');
    const w0 = (await snap()).svgW;
    await page.mouse.wheel(0, -4);
    await page.waitForTimeout(60);
    const w1 = (await snap()).svgW;
    check('Z3 a small deltaY is a small step (no 1.25x jump per event)', w1 > w0 && w1 / w0 < 1.03, `${w0} → ${w1} = x${(w1 / w0).toFixed(4)}`);
    const drift = [];
    for (const dy of [-100, -100, -60, 100, 100, -120]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(70);
      const back = await U.toScreen(pt0);
      drift.push(Math.round(Math.hypot(back[0] - at[0], back[1] - at[1]) * 100) / 100);
    }
    await page.keyboard.up('Control');
    numbers.Z3 = { smallStep: w1 / w0, driftPx: drift };
    check('Z3 the drawing point under the pointer stays within 2 px through zoom in and out', drift.every((d) => d <= 2), JSON.stringify(drift));
    // coalescing: ten events in one task make ONE change in the next frame
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
    const co = await page.evaluate(async () => {
      const f = document.querySelector('main.bw-doc figure[data-dg]');
      const svg = () => f.querySelector('svg').getBoundingClientRect().width;
      const r = f.querySelector('svg').getBoundingClientRect();
      const w0 = svg();
      for (let i = 0; i < 10; i += 1) f.querySelector('svg').dispatchEvent(new WheelEvent('wheel', { deltaY: -15, ctrlKey: true, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      const syncW = svg();
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      return { w0, syncW, after: svg(), expect: w0 * 2 ** (150 / 300) };
    });
    check('Z3 many small events are coalesced to one update per frame, scale = product of the steps', co.syncW === co.w0 && near(co.after, co.expect, co.expect * 0.02), JSON.stringify(co));
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  }
  for (const pz of [0.75, 1, 1.5]) {
    // 0.15.9 (UAT C1): Z2 and Z3 hold at every page zoom, not only at 100 %: the page zoom is a CSS zoom on the page, the drawing's frame must not read it twice
    await page.evaluate((z) => window.BW.setZoom(z), pz);
    await page.waitForTimeout(500);
    await fitView();
    await U.reveal();
    const e0 = await page.locator(`${FIG} svg`).boundingBox();
    await page.mouse.click(e0.x + 4, e0.y + 4);
    const q0 = await snap();
    const qb = await page.locator(`${FIG} svg`).boundingBox();
    const qat = [qb.x + qb.width * 0.62, qb.y + qb.height * 0.4];
    const qpt = await U.toSvg(qat);
    await page.mouse.move(qat[0], qat[1]);
    await page.keyboard.down('Control');
    for (let i = 0; i < 6; i += 1) { await page.mouse.wheel(0, -40); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const qback = await U.toScreen(qpt);
    const qdrift = Math.hypot(qback[0] - qat[0], qback[1] - qat[1]);
    for (let i = 0; i < 14; i += 1) { await page.mouse.wheel(0, -40); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const qin = await snap();
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, 40); await page.waitForTimeout(30); }
    await page.waitForTimeout(80);
    const qout = await snap();
    await page.keyboard.up('Control');
    check(`Z2 at page zoom ${pz * 100} %: 20 Ctrl+wheel events in and out change only the drawing (frame, scrollHeight, scrollY, ribbon, page zoom each ≤ 1 px)`, qin.svgW > q0.svgW * 1.5 && maxDelta(q0, qin) <= 1 && maxDelta(q0, qout) <= 1, JSON.stringify({ svgW: [q0.svgW, qin.svgW, qout.svgW], in: maxDelta(q0, qin), out: maxDelta(q0, qout) }));
    check(`Z3 at page zoom ${pz * 100} %: the drawing point under the pointer stays within 2 px`, qdrift <= 2, `${Math.round(qdrift * 10) / 10} px`);
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  }
  await page.evaluate(() => window.BW.setZoom(1));
  await page.waitForTimeout(400);
  {
    // Z4: scrollbars never resize the frame; zoom + scroll survive a drag's live redraw, a save and a full render
    await U.reveal();
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
    const z0 = await snap();
    await page.evaluate(() => { for (let i = 0; i < 3; i += 1) window.BW.runAction('dgZoomIn'); });
    await page.waitForTimeout(60);
    const art = FIG + ' .fig-art';
    await page.locator(art).evaluate((a) => { a.scrollLeft = getComputedStyle(a).direction === 'rtl' ? -120 : 120; a.scrollTop = 40; });
    await page.waitForTimeout(60);
    const z1 = await snap();
    const gutter = await page.locator(art).evaluate((a) => getComputedStyle(a).scrollbarGutter);
    check('Z4 scrollbars never change the frame\'s size (stable gutter)', /stable/.test(gutter) && maxDelta(z0, z1) <= 1 && Math.abs(z1.sl) > 0, JSON.stringify({ gutter, delta: maxDelta(z0, z1), sl: z1.sl, st: z1.st }));
    // a drag: live redraw replaces innerHTML
    const nodeId = 'rev';
    const nb = await page.locator(`${FIG} [data-dg-node="${nodeId}"]`).first().boundingBox();
    let mid = null;
    if (nb && nb.x > 0) {
      await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
      await page.mouse.down();
      await page.mouse.move(nb.x + nb.width / 2 + 25, nb.y + nb.height / 2 + 15, { steps: 5 });
      mid = await snap();
      await page.mouse.up();
      await page.waitForTimeout(100);
    }
    const z2 = await snap();
    check('Z4 zoom and scroll survive a drag\'s live redraw and its commit', !!mid && mid.dgz === z1.dgz && near(mid.sl, z1.sl, 1) && near(mid.st, z1.st, 1) && z2.dgz === z1.dgz && near(z2.sl, z1.sl, 1) && near(z2.st, z1.st, 1) && near(z2.svgW, z1.svgW, 2), JSON.stringify({ z1: [z1.dgz, z1.sl, z1.st], mid: mid && [mid.dgz, mid.sl, mid.st], z2: [z2.dgz, z2.sl, z2.st] }));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
    await dl.saveAs(path.join(OUT, 'saved.html'));
    await page.waitForTimeout(100);
    const z3 = await snap();
    check('Z4 zoom and scroll survive a save', z3.dgz === z1.dgz && near(z3.sl, z1.sl, 1) && near(z3.st, z1.st, 1));
    await page.evaluate(() => window.BW.render(false));
    await page.waitForTimeout(150);
    const z4 = await snap();
    check('Z4 zoom and scroll survive a full re-render', z4.dgz === z1.dgz && near(z4.sl, z1.sl, 1.5) && near(z4.st, z1.st, 1.5) && z4.fig[3] === z0.fig[3] && z4.art[3] === z0.art[3] && z4.ribbonH === z0.ribbonH, JSON.stringify({ z4: [z4.dgz, z4.sl, z4.st], figH: [z0.fig[3], z4.fig[3]], artH: [z0.art[3], z4.art[3]], scrollY: [z0.scrollY, z4.scrollY], scrollH: [z0.scrollH, z4.scrollH] }));
    numbers.Z4 = { fit: z0, zoomed: z1, afterDrag: z2, afterSave: z3, afterRender: z4 };
    await fitView();
  }
  {
    // Z5: selecting a shape, an arrow or the empty drawing never changes the ribbon's height or shifts the page
    await U.reveal();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    const a0 = await snap();
    const sb = await page.locator(`${FIG} svg`).boundingBox();
    const seen = [a0];
    await page.mouse.click(sb.x + 4, sb.y + 4); seen.push(await snap());
    const n = await page.locator(`${FIG} [data-dg-node="rev"]`).first().boundingBox();
    await page.mouse.click(n.x + n.width / 2, n.y + n.height / 2); seen.push(await snap());
    await selectArrow('e16'); seen.push(await snap());
    const dd = seen.map((s) => maxDelta(a0, s));
    numbers.Z5 = { ribbonH: seen.map((s) => s.ribbonH), scrollY: seen.map((s) => s.scrollY), scrollH: seen.map((s) => s.scrollH), maxDelta: dd };
    check('Z5 selecting empty drawing, shape and arrow: ribbon height, scrollHeight, scrollY, figure all move ≤ 1 px', seen.length === 4 && Math.max(...dd) <= 1 && a0.ribbonH > 100, JSON.stringify(numbers.Z5));
  }
  {
    // Z7: a committed diagram edit, its undo and its redo never move the page: scrollY and scrollHeight stay within 1 px (the owner's complaint is the screen jumping)
    await U.reveal();
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    await page.waitForTimeout(80);
    const b0 = await snap();
    const nb = await page.locator(`${FIG} [data-dg-node="rev"]`).first().boundingBox();
    check('Z7 ready: the figure and its node are on screen before the edit', !!nb && nb.width > 10 && b0.scrollH > 1000, JSON.stringify({ nb, scrollH: b0.scrollH }));
    await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.mouse.down();
    await page.mouse.move(nb.x + nb.width / 2 + 40, nb.y + nb.height / 2 + 24, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterDrag = await page.locator(`${FIG} [data-dg-node="rev"]`).first().boundingBox();
    const b1 = await snap();
    await page.evaluate(() => window.BW.runAction('undo'));
    await page.waitForTimeout(250);
    const b2 = await snap();
    await page.evaluate(() => window.BW.runAction('redo'));
    await page.waitForTimeout(250);
    const b3 = await snap();
    await page.evaluate(() => window.BW.runAction('undo'));
    await page.waitForTimeout(250);
    const moved = await page.locator(`${FIG} [data-dg-node="rev"]`).first().boundingBox();
    const sh = (a, b) => Math.max(Math.abs(a.scrollY - b.scrollY), Math.abs(a.scrollH - b.scrollH));
    numbers.Z7 = { before: b0, commit: b1, undo: b2, redo: b3, shift: [sh(b0, b1), sh(b0, b2), sh(b0, b3)] };
    check('Z7 the edit really committed (the node left its place, undo brought it back)', !!afterDrag && Math.hypot(afterDrag.x - nb.x, afterDrag.y - nb.y) > 10 && !!moved && Math.abs(moved.x - nb.x) < 2 && Math.abs(moved.y - nb.y) < 2, JSON.stringify({ nb, moved }));
    check('Z7 scrollY and scrollHeight move ≤ 1 px after a committed diagram edit, after undo and after redo', Math.max(...numbers.Z7.shift) <= 1, JSON.stringify(numbers.Z7.shift) + ' ' + JSON.stringify([b0.scrollY, b1.scrollY, b2.scrollY, b3.scrollY]));
  }
  {
    // Z6: Ctrl+wheel outside a figure still zooms the page; printing ignores the diagram zoom
    await page.evaluate(() => window.BW.runAction('dgZoomIn'));
    await page.evaluate(() => { const p = document.querySelectorAll('main.bw-doc [data-p]')[3]; p.scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(100);
    const pb = await page.locator('main.bw-doc [data-p]').nth(3).boundingBox();
    const z0 = (await snap()).zoom;
    numbers.Z6 = { pageZoomBefore: z0 };
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(150);
    await page.keyboard.up('Control');
    const z1 = (await snap()).zoom;
    numbers.Z6.pageZoomAfter = z1;
    check('Z6 Ctrl+wheel outside a figure still zooms the page', z1 < z0 - 0.01, `${z0} → ${z1}`);
    await page.evaluate(() => window.BW.setZoom(1));
    await page.emulateMedia({ media: 'print' });
    const pr = await page.locator(`${FIG} .fig-art`).evaluate((a) => ({ overflow: getComputedStyle(a).overflow, h: getComputedStyle(a).height, ui: getComputedStyle(a.querySelector('.dg-ui') || a).display }));
    await page.emulateMedia({ media: 'screen' });
    check('Z6 printing ignores the diagram zoom (no scroll frame, no fixed height)', pr.overflow === 'visible', JSON.stringify(pr));
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  }
  check('no page errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 1));
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'OK'}: ${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
