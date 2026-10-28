// Diagram check: the model, the house look, editing in place, the contextual toolbar, Mermaid, PDF + DOCX.
//
//   node tests/diagram.test.mjs            (screenshots of each toolbar context → out/diagram-compare/)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, fontsFor, REPO } from '../engine/export.mjs';
import { applyOps } from '../engine/edits.mjs';
import { config } from '../engine/config.mjs';

const OUT = path.join(REPO, 'out', 'diagram-test');
const SHOTS = path.join(REPO, 'out', 'diagram-compare');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const wf = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'workflow.json'), 'utf8'));
const theme = loadTheme();

// ── the model and the house look ──
for (const loc of ['ar', 'en']) {
  const m = DIAGRAM.layout(wf[loc]);
  const r = DIAGRAM.resolve(m, { theme, locale: loc });
  const svg = DIAGRAM.render(m, { theme, locale: loc });
  const kinds = (k) => m.nodes.filter((n) => n.kind === k).length;
  check(`${loc}: every node placed, the applicant's run banded`, m.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)) && kinds('group') === 1, JSON.stringify({ group: kinds('group') }));
  check(`${loc}: node kinds kept (5 decisions, 4 staff, 1 start, 1 payment, 1 rework, 1 ok, 1 stop)`, kinds('decision') === 5 && kinds('staff') === 4 && kinds('start') === 1 && kinds('payment') === 1 && kinds('rework') === 1 && kinds('ok') === 1 && kinds('stop') === 1);
  const wires = r.items.filter((x) => x.t === 'line' && x.wire && x.id);
  check(`${loc}: one routed wire per edge, three line classes`, wires.length === m.edges.length && ['main', 'return', 'stop'].every((k) => wires.some((w) => w.wire === k)), `${wires.length}/${m.edges.length}`);
  check(`${loc}: every wire is orthogonal`, wires.every((w) => w.pts.every((p, i) => !i || Math.abs(p[0] - w.pts[i - 1][0]) < 0.6 || Math.abs(p[1] - w.pts[i - 1][1]) < 0.6)));
  const legend = r.items.filter((x) => x.t === 'text' && x.legend);
  check(`${loc}: the legend names 6 shape kinds and 3 line kinds`, legend.length === 9, String(legend.length));
  check(`${loc}: real <text>, no stroke on type, no foreignObject`, (svg.match(/<text /g) || []).length > 30 && !/<text[^>]*stroke=/.test(svg) && !svg.includes('foreignObject'));
  check(`${loc}: house palette (sage stage, salmon rework, red refusal line)`, svg.includes('#adcbbe') && svg.includes('#f3b3a2') && svg.includes('#af1f31'));
}

// ── Mermaid ⇄ model ──
{
  const m = DIAGRAM.layout(wf.ar);
  const code = DIAGRAM.toMermaid(m);
  const back = DIAGRAM.fromMermaid(code);
  const sig = (x) => JSON.stringify([x.nodes.filter((n) => !n.auto).map((n) => [n.id, n.kind, n.label]).sort(), x.edges.map((e) => [e.from, e.to, e.kind, e.label]).sort()]);
  check('mermaid: export → import keeps nodes, kinds, labels and edges', sig(back) === sig(DIAGRAM.ensure(m)), code.split('\n').length + ' lines');
  const hand = DIAGRAM.fromMermaid('flowchart LR\n  A([Submit]) --> B[Review]\n  B --> C{Decide}\n  C -->|Approve| D([Approved])\n  C -->|Refuse| E([Refused])\n  C -.->|Fix| B');
  const k = Object.fromEntries(hand.nodes.filter((n) => !n.auto).map((n) => [n.id, n.kind]));
  check('mermaid: hand-written code → start, stage, decision, approval and refusal ends', k.A === 'start' && k.B === 'staff' && k.C === 'decision' && k.D === 'ok' && k.E === 'stop' && hand.edges.find((e) => e.to === 'E').kind === 'stop' && hand.edges.find((e) => e.label === 'Fix').kind === 'return', JSON.stringify(k));
  let bad = '';
  try { DIAGRAM.fromMermaid('sequenceDiagram\nA->>B: hi'); } catch (e) { bad = e.message; }
  check('mermaid: a non-flowchart is refused with a reason', /not a Mermaid flowchart/.test(bad));
}

// ── hand-set bend points (via): routed through, kept orthogonal, carried by the edits contract, PDF SVG and DOCX ──
{
  const m = DIAGRAM.layout(wf.en);
  const auto = DIAGRAM.resolve(m, { theme, locale: 'en' }).items.find((x) => x.wire && x.id === 'e8');
  const bent = JSON.parse(JSON.stringify(m));
  const mid = auto.route[Math.floor(auto.route.length / 2)];
  bent.edges.find((e) => e.id === 'e8').via = [[mid[0] + 37, mid[1] + 43], [mid[0] + 97, mid[1] + 43]];
  const w = DIAGRAM.resolve(bent, { theme, locale: 'en' }).items.find((x) => x.wire && x.id === 'e8');
  const has = (pts, q) => pts.some((p) => Math.abs(p[0] - q[0]) < 0.6 && Math.abs(p[1] - q[1]) < 0.6);
  check('bend: the arrow is routed through its hand-set points', has(w.route, [mid[0] + 37, mid[1] + 43]) && has(w.route, [mid[0] + 97, mid[1] + 43]), JSON.stringify(w.route));
  check('bend: every segment stays orthogonal (an elbow is added where an end moved)', w.route.every((p, i) => !i || Math.abs(p[0] - w.route[i - 1][0]) < 0.6 || Math.abs(p[1] - w.route[i - 1][1]) < 0.6));
  check('bend: the ports stay on the shapes (first/last points as in automatic routing)', JSON.stringify(w.route[0]) === JSON.stringify(auto.route[0]) && JSON.stringify(w.route.at(-1)) === JSON.stringify(auto.route.at(-1)));
  const svgA = DIAGRAM.render(m, { theme, locale: 'en' });
  const svgB = DIAGRAM.render(bent, { theme, locale: 'en' });
  check('bend: the printed SVG (PDF) draws the bent path', svgA !== svgB && svgB.includes(w.d));
  const relaid = DIAGRAM.layout(bent, { force: true });
  check('bend: «auto layout» routes every arrow afresh (bends cleared)', relaid.edges.every((e) => !e.via));
  // the edits contract: one replace op carries the bends; replaying it gives the same model
  const docEn0 = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.en.json'), 'utf8'));
  const ptr = '/chapters/2/sections/0/blocks/0';
  const blk0 = docEn0.chapters[2].sections[0].blocks[0];
  const replayed = applyOps(docEn0, [{ op: 'replace', path: `${ptr}/model`, value: bent, old: blk0.model }]).chapters[2].sections[0].blocks[0].model;
  check('bend: the edits file carries the bend points (replace op round-trip)', JSON.stringify(replayed.edges.find((e) => e.id === 'e8').via) === JSON.stringify(bent.edges.find((e) => e.id === 'e8').via));
  // the DOCX draws the same primitives: the bent arrow's polyline changes the Word drawing
  const docxXml = (doc, name) => {
    const out = path.join(OUT, name);
    exportDocx(doc, { locale: 'en', theme, docxPath: out, embedFonts: false });
    return spawnSync('python', ['-c', 'import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode())', out], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 1 << 26 }).stdout || '';
  };
  const bentDoc = JSON.parse(JSON.stringify(docEn0));
  bentDoc.chapters[2].sections[0].blocks[0].model = bent;
  const xa = docxXml(docEn0, 'auto.en.docx');
  const xb = docxXml(bentDoc, 'bent.en.docx');
  check('bend: the DOCX native shapes follow the bend (drawing differs, still no picture)', xa.length > 1000 && xb.length > 1000 && xa !== xb && !xb.includes('<pic:pic'), `${xa.length} / ${xb.length}`);
  // hand-made line breaks in a label wrap there
  const nl = JSON.parse(JSON.stringify(m));
  nl.nodes.find((n) => n.id === 'head').label = 'Head\nof section';
  const lines = DIAGRAM.resolve(nl, { theme, locale: 'en' }).items.find((x) => x.t === 'text' && x.id === 'head' && x.node).lines;
  check('label: Shift+Enter line break prints as two lines', lines.length === 2 && lines[0] === 'Head' && lines[1] === 'of section', JSON.stringify(lines));
}
// ── legend: one row for the house sample at A4 landscape (as the reference); wraps only when kinds truly do not fit ──
for (const loc of ['ar', 'en']) {
  const r = DIAGRAM.resolve(DIAGRAM.layout(wf[loc]), { theme, locale: loc });
  const rows = new Set(r.items.filter((x) => x.t === 'text' && x.legend).map((x) => x.y)).size;
  check(`${loc}: the legend is one row (9 entries)`, rows === 1, String(rows));
}
{
  const tiny = { kind: 'bw-diagram', version: 1, flow: 'ltr', nodes: [{ id: 'a', kind: 'start', label: 'A' }, { id: 'b', kind: 'staff', label: 'B' }, { id: 'c', kind: 'payment', label: 'C' }, { id: 'd', kind: 'rework', label: 'D' }, { id: 'e', kind: 'system', label: 'E' }, { id: 'f', kind: 'note', label: 'F', x: 10, y: 200 }, { id: 'g', kind: 'ok', label: 'G' }, { id: 'h', kind: 'stop', label: 'H' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'g' }, { from: 'b', to: 'h' }, { from: 'b', to: 'd' }, { from: 'd', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'e' }] };
  const r = DIAGRAM.resolve(tiny, { theme, locale: 'en' });
  const rows = new Set(r.items.filter((x) => x.t === 'text' && x.legend).map((x) => x.y)).size;
  check('legend: a narrow drawing with many kinds wraps onto more rows', rows > 1, String(rows));
}

// ── PDF: the diagram's words are real text; DOCX: native shapes, no picture ──
const docAr = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.ar.json'), 'utf8'));
const browser = await chromium.launch(launchOptions());
try {
  const pdf = path.join(OUT, 'sample.ar.pdf');
  await exportPdf(docAr, { locale: 'ar', theme, pdfPath: pdf, browser });
  const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
  const txt = spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  // Thmanyah is licensed and never committed: without it the fallback font breaks Arabic extraction in pdftotext,
  // so the AR label match is strict only where the real face is present; otherwise the EN edition's PDF is checked.
  const FACES = fontsFor(theme).used.filter((c) => c.format === 'truetype').map((c) => c.family);
  const HAVE_FONTS = [theme.fonts.text, theme.fonts.display].every((f) => FACES.includes(f));
  const flat = (t) => t.normalize('NFKC').replace(/\s+/g, '');
  let labels = ['رئيس القسم', 'مخرج رفض', 'إرجاع للتدقيق', 'المسار الأساسي للطلب'];
  let ltxt = txt;
  if (!HAVE_FONTS) {
    const docEn = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.en.json'), 'utf8'));
    const pdfEn = path.join(OUT, 'sample.en.pdf');
    await exportPdf(docEn, { locale: 'en', theme, pdfPath: pdfEn, browser });
    ltxt = spawnSync(bin, ['-enc', 'UTF-8', pdfEn, '-'], { encoding: 'utf8' }).stdout || '';
    labels = ['Head of section', 'Department manager', 'Resubmit the request', 'Complete missing items'];
  }
  const missing = labels.filter((w) => !(HAVE_FONTS ? ltxt.includes(w) : flat(ltxt).includes(flat(w))));
  check('pdf: diagram labels extract as text (pdftotext -enc UTF-8)', !missing.length, ltxt.length + ' chars' + (HAVE_FONTS ? '' : ' (EN edition: fallback font)') + (missing.length ? ' | missing: ' + JSON.stringify(missing) + ' | first 600: ' + JSON.stringify(ltxt.slice(0, 600)) : ''));
  const fonts = spawnSync(config().poppler ? path.join(config().poppler, 'pdffonts') : 'pdffonts', [pdf], { encoding: 'utf8' }).stdout || '';
  if (HAVE_FONTS) check('pdf: no Type 3 font', !/Type 3/.test(fonts));
  else results.push('SKIP  pdf: no Type 3 font  — Thmanyah TTF not installed on this machine (fonts are never committed)');
  const docx = path.join(OUT, 'sample.ar.docx');
  exportDocx(docAr, { locale: 'ar', theme, docxPath: docx, embedFonts: false });
  const py = 'import zipfile,sys;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode();print(x.count("<wps:wsp>"),x.count("wpg:wgp"),x.count("<pic:pic"),int("رئيس القسم" in x))';
  const [shapes, groups, pics, label] = (spawnSync('python', ['-c', py, docx], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '0 0 0 0').trim().split(/\s+/).map(Number);
  check('docx: the diagram is one group of native shapes with its labels, not a picture', shapes > 80 && groups >= 2 && pics === 0 && label === 1, JSON.stringify({ shapes, groups, pics, label }));

  // ── the editor: contextual toolbar and in-place editing ──
  const file = path.join(OUT, 'editor.html');
  buildEditor({ inputs: [SAMPLE], out: file, set: 'diagram-test', watermarkDir: '' });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'ar'); localStorage.setItem('bw:calm', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const state = () => page.evaluate(() => {
    const sh = document.getElementById('bw-ui-host').shadowRoot;
    const c = sh.querySelector('.ctx');
    return { sel: c.hidden ? null : c.dataset.cat, label: c.hidden ? '' : c.querySelector('.st')?.textContent, general: [...sh.querySelectorAll('.island .sec[data-cat]:not(.now)')].map((x) => x.dataset.cat) };
  });
  // a click where a person clicks: the shape's centre, scrolled to the middle of the screen
  const clickAt = async (loc, opts = {}) => {
    await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const b = await loc.boundingBox();
    if (opts.shift) await page.keyboard.down('Shift');
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    if (opts.shift) await page.keyboard.up('Shift');
  };
  const shot = async (name) => page.screenshot({ path: path.join(SHOTS, `toolbar-${name}.png`) }); // viewport only
  const fig = page.locator('main.bw-doc figure[data-dg]');
  await fig.scrollIntoViewIfNeeded();
  let s = await state();
  check('toolbar: nothing selected → the general sections only', s.sel === null && ['file', 'insert', 'edit', 'document', 'design', 'export', 'view'].every((c) => s.general.includes(c)), JSON.stringify(s));
  await shot('none');
  const node = page.locator('main.bw-doc [data-dg-node="head"]').first();
  await clickAt(node);
  s = await state();
  check('toolbar: a shape → its «شكل» section (kind, colour, label, arrow, delete)', s.sel === 'shape' && /شكل/.test(s.label), JSON.stringify(s));
  await shot('shape');
  const before = await page.evaluate(() => { const m = window.BW.DIAGRAM.ensure(window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); return m.nodes.find((n) => n.id === 'head'); });
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model.nodes.find((n) => n.id === 'head'));
  check('edit: dragging a shape moves it (one replace op on the model)', after && (after.x !== before.x || after.y !== before.y), JSON.stringify([before.x, before.y, after?.x, after?.y]));
  await page.keyboard.press('ArrowRight');
  const nudged = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model.nodes.find((n) => n.id === 'head').x);
  check('edit: an arrow key nudges the shape', nudged === after.x + 1, `${after.x} → ${nudged}`);
  await page.evaluate(() => window.BW.undo());
  await page.evaluate(() => window.BW.undo());
  const undone = await page.evaluate(() => window.BW.DIAGRAM.ensure(window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model).nodes.find((n) => n.id === 'head'));
  check('edit: undo puts the shape back', undone.x === before.x && undone.y === before.y);
  const edgeEl = page.locator('main.bw-doc [data-dg-edge] .dg-hit').first();
  await edgeEl.dispatchEvent('pointerdown', { button: 0, bubbles: true });
  s = await state();
  check('toolbar: an arrow → its «سهم» section', s.sel === 'arrow' && /سهم/.test(s.label), JSON.stringify(s));
  await shot('arrow');
  // the empty drawing → diagram tools; add a stage box, change its kind, connect it
  await page.locator('main.bw-doc figure[data-dg] svg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const fb = await page.locator('main.bw-doc figure[data-dg] svg').boundingBox();
  await page.mouse.click(fb.x + 6, fb.y + 6);
  s = await state();
  check('toolbar: the empty drawing → the «مخطط» section (add shapes, layout, Mermaid)', s.sel === 'diagram', JSON.stringify(s));
  await shot('diagram');
  const n0 = await page.evaluate(() => window.BW.DIAGRAM.ensure(window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model).nodes.length);
  await page.evaluate(() => window.BW.runAction('dgStaff'));
  const m1 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model);
  check('edit: «مربع مرحلة» adds a stage box and selects it', m1.nodes.length === n0 + 1 && m1.nodes.at(-1).kind === 'staff' && (await state()).sel === 'shape');
  await page.evaluate(() => window.BW.runAction('dgConnect'));
  await page.locator('main.bw-doc [data-dg-node="ok"]').first().dispatchEvent('pointerdown', { button: 0, bubbles: true });
  const m2 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model);
  check('edit: «سهم من هنا» then a click on a shape adds the arrow', m2.edges.some((e) => e.from === m1.nodes.at(-1).id && e.to === 'ok'));
  // multi-select → arrange
  await clickAt(page.locator('main.bw-doc [data-dg-node="rev"]').first());
  await clickAt(page.locator('main.bw-doc [data-dg-node="mgr"]').first(), { shift: true });
  s = await state();
  check('toolbar: two shapes → the arrange section (align, distribute, group)', s.sel === 'arrange', JSON.stringify(s));
  await shot('multi');
  // text → text tools; Esc → general
  await clickAt(page.locator('main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]'));
  s = await state();
  check('toolbar: text → the «نص» section', s.sel === 'text', JSON.stringify(s));
  await shot('text');
  await page.keyboard.press('Escape');
  s = await state();
  check('toolbar: Esc → the general sections come back', s.sel === null, JSON.stringify(s));
  // Save HTML / edits round-trip: replaying the ops reproduces the model
  const e = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar'));
  const replay = applyOps(docAr, e.ops).chapters[2].sections[0].blocks[0].model;
  check('round-trip: the edits file replays to the same diagram', JSON.stringify(replay) === JSON.stringify(m2), `${e.ops.length} ops`);
  // ── bend points by hand: drag a segment handle, add a bend, auto route, undo, Save HTML ──
  const model = () => page.evaluate(() => window.BW.DIAGRAM.ensure(window.BW.M[window.BW.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model));
  await page.locator('main.bw-doc [data-dg-edge="e8"] .dg-hit').first().dispatchEvent('pointerdown', { button: 0, bubbles: true });
  const seg = page.locator('main.bw-doc figure[data-dg] [data-dg-seg]').first();
  check('bend: a selected arrow shows segment and corner handles', (await page.locator('main.bw-doc figure[data-dg] [data-dg-seg]').count()) >= 1, String(await page.locator('main.bw-doc figure[data-dg] [data-dg-seg]').count()));
  await seg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const sb = await seg.boundingBox();
  const horiz = await seg.evaluate((el) => el.style.cursor === 'ns-resize');
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width / 2 + (horiz ? 0 : 30), sb.y + sb.height / 2 + (horiz ? 25 : 0), { steps: 6 });
  await page.mouse.up();
  let mb = await model();
  const e8 = mb.edges.find((e) => e.id === 'e8');
  const routeOf = (mm) => page.evaluate((x) => window.BW.DIAGRAM.resolve(x, { locale: 'ar' }).items.find((it) => it.wire && it.id === 'e8').route, mm);
  const rt = await routeOf(mb);
  check('bend: dragging a segment handle stores bend points (via) on the arrow', Array.isArray(e8.via) && e8.via.length >= 1, JSON.stringify(e8.via));
  check('bend: the dragged arrow stays orthogonal', rt.every((p, i) => !i || Math.abs(p[0] - rt[i - 1][0]) < 0.6 || Math.abs(p[1] - rt[i - 1][1]) < 0.6), JSON.stringify(rt));
  await page.evaluate(() => window.BW.runAction('dgBendAdd'));
  const n1 = (await model()).edges.find((e) => e.id === 'e8').via.length;
  check('bend: «add bend point» adds two corners (a step to drag)', n1 === e8.via.length + 2, `${e8.via.length} → ${n1}`);
  await page.evaluate(() => window.BW.runAction('dgBendDel'));
  check('bend: «remove bend point» removes them again', (await model()).edges.find((e) => e.id === 'e8').via.length === e8.via.length);
  const ops0 = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length);
  const saved = path.join(OUT, 'saved-bend.html');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
  await dl.saveAs(saved);
  check('bend: Save HTML carries the bend points', fs.readFileSync(saved, 'utf8').includes('"via"'));
  await page.evaluate(() => window.BW.runAction('dgRouteAuto'));
  check('bend: «auto route» drops the hand-set bends', !(await model()).edges.find((e) => e.id === 'e8').via);
  await page.evaluate(() => window.BW.undo());
  check('bend: undo brings the bends back', Array.isArray((await model()).edges.find((e) => e.id === 'e8').via) && (await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length)) === ops0);
  await shot('arrow-bend');

  // ── in-place label editing: double-click → a text box on the label; Shift+Enter breaks, Enter saves, Esc cancels ──
  const headEl = page.locator('main.bw-doc [data-dg-node="head"]').first();
  await headEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const hb = await headEl.boundingBox();
  await page.mouse.dblclick(hb.x + hb.width / 2, hb.y + hb.height / 2);
  const ed = page.locator('.bw-dg-edit');
  const eb = await ed.boundingBox().catch(() => null);
  const inside = eb && Math.abs(eb.x + eb.width / 2 - (hb.x + hb.width / 2)) < 3 && eb.y >= hb.y - 2 && eb.y < hb.y + hb.height; // centred on the shape
  check('inline: double-click opens a text box on the shape itself (no dialog)', !!eb && inside && (await page.locator('#bw-ui-host').evaluate((h) => h.shadowRoot.querySelector('.dialog').hidden)), JSON.stringify({ eb, hb }));
  check('inline: the box is RTL-aware (dir auto on Arabic text) and has the label', (await ed.getAttribute('dir')) === 'auto' && (await ed.innerText()) === 'رئيس القسم');
  await shot('inline-edit');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('رئيس');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('القسم الفني');
  await page.keyboard.press('Enter');
  const lab = (await model()).nodes.find((n) => n.id === 'head').label;
  check('inline: Shift+Enter keeps a line break, Enter saves (one op)', lab === 'رئيس\nالقسم الفني' && !(await ed.count()), JSON.stringify(lab));
  await page.keyboard.press('Enter'); // Enter on the selected shape opens the box again
  check('inline: Enter on a selected shape opens the box', (await ed.count()) === 1);
  await page.keyboard.type('xyz');
  await page.keyboard.press('Escape');
  check('inline: Esc cancels (label unchanged)', (await model()).nodes.find((n) => n.id === 'head').label === lab && !(await ed.count()));
  const capEl = page.locator('main.bw-doc [data-dg-edge="e6"] .dg-hit').first();
  await capEl.dispatchEvent('pointerdown', { button: 0, bubbles: true });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Approve');
  await page.locator('main.bw-doc h1, main.bw-doc h2').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.locator('.bw-dg-edit').evaluate((el) => el.blur());
  check('inline: an arrow label is edited in place; blur commits', (await model()).edges.find((e) => e.id === 'e6').label === 'Approve');

  // ── zoom: the drawing only (view state), toolbar tools + Ctrl+wheel ──
  await page.locator('main.bw-doc figure[data-dg] svg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const fb2 = await page.locator('main.bw-doc figure[data-dg] svg').boundingBox();
  await page.mouse.click(fb2.x + 6, fb2.y + 6);
  const geo = () => page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); const sv = f.querySelector('svg'); return { w: Math.round(sv.getBoundingClientRect().width), h: Math.round(f.querySelector('.fig-art').getBoundingClientRect().height), z: f.dataset.zoom || '', vb: sv.viewBox.baseVal.width }; });
  const g0 = await geo();
  const opsZ = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length);
  const zoomTools = await page.locator('#bw-ui-host').evaluate((h) => ['dgZoomIn', 'dgZoomOut', 'dgZoomFit'].every((a) => { const b = h.shadowRoot.querySelector(`.ctx [data-a="${a}"]`); return b && b.getBoundingClientRect().width > 0; }));
  check('zoom: zoom in / out / fit sit in view in the diagram section', zoomTools);
  await page.evaluate(() => window.BW.runAction('dgZoomIn'));
  const g1 = await geo();
  check('zoom: «zoom in» enlarges the drawing, the frame keeps its height', g1.w > g0.w * 1.2 && Math.abs(g1.h - g0.h) <= 2 && g1.z, JSON.stringify([g0, g1]));
  await page.evaluate(() => window.BW.runAction('dgZoom100'));
  const g2 = await geo();
  check('zoom: «100%» shows the drawing at its own size', Math.abs(g2.w - g2.vb) <= 2, JSON.stringify(g2));
  await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  const g3 = await geo();
  check('zoom: «fit» returns to the fitted drawing', !g3.z && Math.abs(g3.w - g0.w) <= 2, JSON.stringify(g3));
  await page.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  const g4 = await geo();
  check('zoom: Ctrl+wheel over the drawing zooms it', g4.w > g0.w * 1.2, JSON.stringify(g4));
  check('zoom: zoom is view state only (no edit op, nothing in the PDF/DOCX)', (await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length)) === opsZ);
  await shot('diagram-zoom');
  await page.evaluate(() => window.BW.runAction('dgZoomFit'));
  check('editor: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  // ── toolbar: section titles stay visible at 1366 px (AR and EN), the bar never scrolls sideways ──
  for (const ui of ['ar', 'en']) {
    const c2 = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    await c2.addInitScript((l) => { try { localStorage.setItem('bw:ui', l); localStorage.setItem('bw:calm', '1'); } catch {} }, ui);
    const p2 = await c2.newPage();
    await p2.goto(pathToFileURL(file).href);
    await p2.waitForFunction(() => window.BW?.ready);
    const titles = () => p2.evaluate(() => {
      const sh = document.getElementById('bw-ui-host').shadowRoot;
      const bar = sh.querySelector('.island');
      const st = [...sh.querySelectorAll('.island .sec .sc .st')];
      return { n: st.length, hidden: st.filter((x) => { const r = x.getBoundingClientRect(); return !(r.width > 4 && r.height > 4 && r.left >= 0 && r.right <= innerWidth); }).map((x) => x.textContent), overflow: bar.scrollWidth - bar.clientWidth };
    });
    const bad = [];
    for (const [name, go] of [
      ['none', async () => {}],
      ['shape', async () => { await p2.locator('main.bw-doc [data-dg-node="head"]').first().dispatchEvent('pointerdown', { button: 0, bubbles: true }); }],
      ['arrow', async () => { await p2.locator('main.bw-doc [data-dg-edge] .dg-hit').first().dispatchEvent('pointerdown', { button: 0, bubbles: true }); }],
      ['diagram', async () => { await p2.locator('main.bw-doc figure[data-dg] svg > rect').first().dispatchEvent('pointerdown', { button: 0, bubbles: true }); }],
    ]) {
      await go();
      const r = await titles();
      if (r.n < 7 || r.hidden.length || r.overflow > 0) bad.push(`${name}: ${JSON.stringify(r)}`);
    }
    check(`toolbar ${ui} 1366: every section title visible in every context, no sideways scroll`, !bad.length, bad.join(' | '));
    await c2.close();
  }
} finally {
  await browser.close();
}
void zlib;
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} PASS`);
process.exit(failed ? 1 : 0);
