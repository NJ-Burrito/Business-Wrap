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
import { exportPdf, exportDocx, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
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

// ── PDF: the diagram's words are real text; DOCX: native shapes, no picture ──
const docAr = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.ar.json'), 'utf8'));
const browser = await chromium.launch(launchOptions());
try {
  const pdf = path.join(OUT, 'sample.ar.pdf');
  await exportPdf(docAr, { locale: 'ar', theme, pdfPath: pdf, browser });
  const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
  const txt = spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  check('pdf: diagram labels extract as text (pdftotext -enc UTF-8)', ['رئيس القسم', 'مخرج رفض', 'إرجاع للتدقيق', 'المسار الأساسي للطلب'].every((w) => txt.includes(w)), txt.length + ' chars');
  const fonts = spawnSync(config().poppler ? path.join(config().poppler, 'pdffonts') : 'pdffonts', [pdf], { encoding: 'utf8' }).stdout || '';
  check('pdf: no Type 3 font', !/Type 3/.test(fonts));
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
  check('editor: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}
void zlib;
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} PASS`);
process.exit(failed ? 1 : 0);
