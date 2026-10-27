// "Everything editable": fixed labels, title, subtitle, cover code, field names and values, design
// (header fill), a per-instance style, sanitised advanced CSS, template parts, the edits-JSON round trip,
// undo, empty-label validation, and the manual flag that survives a re-harvest with a conflict.
//
//   node tests/editable.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { exportPdf, exportDocx, printHtml, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
import { applyOps, validateEdits, get } from '../engine/edits.mjs';
import { sanitizeCss } from '../engine/render.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { harvestModel } from '../engine/harvest/cli.mjs';

const OUT = path.join(REPO, 'out', 'editable-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const lines = [];
const check = (name, ok, detail = '') => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

const baseFile = path.join(REPO, 'samples', 'event-permit', 'document.en.json');
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
const CARD = '/chapters/1/sections/0/blocks/1/rows/0';
const W = { header: 'Release mark', code: 'BW-CODE-7731', title: 'Harbour market permit', subtitle: 'Edited subtitle line', name: 'Permit kind', value: 'Evening market stall', css: '#123456', inst: '#654321' };
const ops = [
  { op: 'replace', path: '/labels', value: {} },
  { op: 'setText', path: '/labels/revVersion', value: W.header },
  { op: 'setText', path: '/control/documentId', value: W.code, old: base.control.documentId },
  { op: 'setText', path: '/control/coverTitle', value: W.title },
  { op: 'setText', path: '/control/subtitle', value: W.subtitle },
  { op: 'setText', path: `${CARD}/0`, value: W.name, old: get(base, `${CARD}/0`) },
  { op: 'setText', path: `${CARD}/1`, value: W.value, old: get(base, `${CARD}/1`) },
  { op: 'replace', path: '/design', value: { vars: { 'th-fill': W.css }, css: "@import url('https://example.com/x.css');\n.bw-doc h3{letter-spacing:.01em}\n.x{background:url(https://example.com/y.png)}" } },
  { op: 'insert', path: '/chapters/3/sections/0/blocks/0/style', value: { color: W.inst } },
];
const edits = { version: 1, document: base.control.documentId, baseHash: `sha256:${'0'.repeat(64)}`, locale: 'en', ops };
const v = validateEdits(edits);
check('edits JSON with labels, design and style ops validates against the contract', v.ok !== false && !(v.errors || []).length, JSON.stringify(v.errors || v).slice(0, 200));
const roundTrip = JSON.parse(JSON.stringify(edits));
const doc = applyOps(base, roundTrip.ops);
check('round trip: the edits JSON replays to the same labels, design and style', doc.labels.revVersion === W.header && doc.design.vars['th-fill'] === W.css && doc.chapters[3].sections[0].blocks[0].style.color === W.inst);

const s = sanitizeCss(doc.design.css);
check('advanced CSS: a remote @import and a remote url() are removed, the rest kept', !/import|example\.com/.test(s.css) && /letter-spacing/.test(s.css) && s.rejected.some((r) => r.startsWith('@import')) && s.rejected.some((r) => r.startsWith('remote url')), JSON.stringify(s));

const theme = loadTheme();
const { html } = printHtml(doc, { locale: 'en', theme });
check('print HTML: instance style keyed by the block pointer, header fill var, no remote CSS', html.includes(`[data-b="/chapters/3/sections/0/blocks/0"]{color:${W.inst}`) && html.includes(`--th-fill:${W.css}`) && !html.includes('example.com'));

const pdf = path.join(OUT, 'edited.en.pdf');
await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf });
const pt = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' });
const flat = (x) => String(x).replace(/\s+/g, '');
const txt = flat(pt.stdout);
for (const [k, w] of Object.entries({ 'table header label': W.header, 'cover code': W.code, title: W.title, subtitle: W.subtitle, 'field name': W.name, 'field value': W.value }))
  check(`PDF text has the edited ${k}`, txt.includes(flat(w)) || (k === 'cover code' && flat(pt.stdout.split('').reverse().join('')).includes(flat(w))), w);
// the colours: Chrome writes fills as "r g b rg" in the (deflated) content streams
const bytes = fs.readFileSync(pdf);
let streams = '';
for (let i = bytes.indexOf('stream'); i >= 0; i = bytes.indexOf('stream', i + 6)) {
  const start = bytes[i + 6] === 0x0d ? i + 8 : i + 7;
  const end = bytes.indexOf('endstream', start);
  try { streams += zlib.inflateSync(bytes.subarray(start, end)).toString('latin1'); } catch { /* not deflated */ }
  i = end;
}
const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
const triples = [...streams.matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(?:rg|RG|sc|scn|SC|SCN)/g)].map((m) => [+m[1], +m[2], +m[3]]);
const hasFill = (h) => { const c = rgb(h); return triples.some((x) => x.every((v, i) => Math.abs(v - c[i]) < 0.006)); };
check('PDF: the header fill colour from the Design panel is painted', hasFill(W.css), `${triples.length} triples, ${streams.length} chars, ${rgb(W.css)}`);
check('PDF: the per-instance colour is painted', hasFill(W.inst));

const docx = path.join(OUT, 'edited.en.docx');
exportDocx(doc, { locale: 'en', theme, docxPath: docx });
const x = spawnSync('python', ['-c', 'import zipfile,sys;sys.stdout.write(zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf-8"))', docx], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout;
const xt = flat(x.replace(/<[^>]+>/g, ''));
for (const [k, w] of Object.entries({ 'table header label': W.header, 'cover code': W.code, title: W.title, subtitle: W.subtitle, 'field name': W.name, 'field value': W.value }))
  check(`DOCX has the edited ${k}`, xt.includes(flat(w)), w);
check('DOCX: the header fill colour shades the header cells', x.includes(`w:fill="${W.css.slice(1).toUpperCase()}"`));

// template parts: hidden parts leave the print
const hiddenDoc = applyOps(base, [{ op: 'replace', path: '/layout', value: { hide: ['revisions'], front: ['toc', 'control', 'revisions'] } }]);
const h2 = printHtml(hiddenDoc, { locale: 'en', theme }).html;
check('template parts: a hidden part is not printed, the order is the chosen one', !h2.includes('data-part="revisions"') && h2.indexOf('data-part="toc"') < h2.indexOf('data-part="control"'));

// the editor: edit a fixed label in place, undo, empty label flagged, edits JSON carries it
const ed = buildEditor({ inputs: [baseFile], out: path.join(OUT, 'editable.editor.html'), set: 'editable', watermarkDir: null }).out;
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(pathToFileURL(ed).href);
  await page.waitForFunction(() => window.BW?.ready);
  const before = await page.evaluate(() => document.querySelector('th[data-p="/labels/revVersion"]')?.textContent);
  await page.evaluate(() => { const el = document.querySelector('th[data-p="/labels/revVersion"]'); el.scrollIntoView(); });
  await page.dblclick('th[data-p="/labels/revVersion"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Build');
  await page.evaluate(() => document.activeElement.blur());
  const r = await page.evaluate(() => ({ doc: window.BW.M[window.BW.S.svc].en.doc.labels, ops: window.BW.editsFile(window.BW.S.svc, 'en').ops.map((o) => o.path), shown: document.querySelector('th[data-p="/labels/revVersion"]').textContent, toast: document.getElementById('bw-ui-host').shadowRoot.querySelector('.toast')?.textContent || '' }));
  check('editor: a fixed table header is edited in place into /labels', r.doc?.revVersion === 'Build' && r.ops.includes('/labels/revVersion') && r.shown === 'Build', JSON.stringify(r).slice(0, 200));
  check('editor: «apply to all documents» is offered after a label edit', /all documents|كل الوثائق/i.test(r.toast), r.toast);
  const u = await page.evaluate(() => { window.BW.undo(); window.BW.render(); return document.querySelector('th[data-p="/labels/revVersion"]').textContent; });
  check('editor: undo restores the label', u === before, `${u} vs ${before}`);
  const val = await page.evaluate(() => { window.BW.setText('/labels/revDate', ''); return window.BW.validate().map((x) => x[1]).join(' | '); });
  check('editor: an empty required label is flagged by the check', /revDate/.test(val), val.slice(0, 120));
  await ctx.close();

  // re-harvest: a hand edit of a generated value is flagged manual, kept, and reported as a conflict
  const yaml = path.join(OUT, 'renewal.yaml');
  fs.copyFileSync(path.join(REPO, 'tests', 'fixtures', 'harvest', 'steps.yaml'), yaml);
  const hout = path.join(OUT, 'harvest');
  const first = await harvestModel(yaml, { out: hout });
  const c2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p2 = await c2.newPage();
  await p2.goto(pathToFileURL(first.editor).href);
  await p2.waitForFunction(() => window.BW?.ready);
  const STEP = '/chapters/3/sections/0/blocks/0/rows/0/0';
  const m = await p2.evaluate((ptr) => { window.BW.S.ed = 'en'; window.BW.setText(ptr, 'My own step name', 'en'); const e = window.BW.M[window.BW.S.svc].en; return { manual: e.doc.manual, file: window.BW.editsFile(window.BW.S.svc, 'en') }; }, STEP);
  check('editor: editing a harvested value flags it «manual»', !!m.manual?.[STEP.replace(/\//g, '~1')] || !!Object.keys(m.manual || {}).length, JSON.stringify(m.manual));
  await c2.close();
  fs.writeFileSync(path.join(first.dir, `${first.service}.en.edits.json`), JSON.stringify(m.file));
  fs.writeFileSync(yaml, fs.readFileSync(yaml, 'utf8').replace('name: Submit the renewal form', 'name: Renamed by the source'));
  const again = await harvestModel(yaml, { out: hout });
  const d2 = JSON.parse(fs.readFileSync(again.documents[1], 'utf8'));
  const cf = again.conflicts.en || [];
  check('re-harvest keeps the manual edit', get(d2, STEP) === 'My own step name', get(d2, STEP));
  check('re-harvest reports the conflict with the source', cf.length === 1 && cf[0].harvested === 'Renamed by the source' && (d2.harvestConflicts || []).length === 1, JSON.stringify(cf));
  const c3 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p3 = await c3.newPage();
  await p3.goto(pathToFileURL(again.editor).href);
  await p3.waitForFunction(() => window.BW?.ready);
  const shown = await p3.evaluate(() => window.BW.S.conflicts.length);
  check('editor: the re-harvest conflict is shown on open', shown >= 1, String(shown));
  await c3.close();
  check('no page errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
}
console.log(lines.join('\n'));
console.log(failed ? `FAILED: ${failed}/${lines.length}` : `ALL PASS: ${lines.length}/${lines.length}`);
process.exit(failed ? 1 : 0);
