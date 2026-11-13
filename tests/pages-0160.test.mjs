// (bw-0160, pages lane): the editor's page count equals the PDF's, at every window size, and the DOCX carries the document's own type scale.
//
//  P1  Real Chrome lays the sample documents out in the paged view (AR and EN, a plain sheet, a figure sheet turned landscape, a mixed
//      fixture with a section turned through the editor's own page action, two window sizes and a zoom) and the same document is printed to PDF:
//      the page counts are equal. The paged layout is made at 100 percent whatever the window's fit (a zoomed layout counted a page more).
//  P2  The page drawer's route (/api/pages on a running host) returns the PDF's pages, each in the PDF's orientation, for the mixed fixture.
//  P3  The DOCX styles hold 22 / 16 / 14 / 12 / 12 pt read from the design pack's theme through engine/docx/theme.py (no override in build_docx.py).
//
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/pages-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { pageSizes, docxParts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pages0160-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  pages-0160: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'pages-0160', watermarkDir: null, ui: 'en' });
const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); });
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  const services = await page.evaluate(() => Object.keys(window.BW.M));
  check('the editor holds both samples (positive sample)', services.includes('event-permit') && services.includes('blank'), services.join());

  const show = async (svc, ed) => {
    await page.evaluate(([s, e]) => { const B = window.BW; B.S.svc = s; B.S.ed = e; B.render(); B.runAction('view.single'); }, [svc, ed]);
    await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 0);
    await page.waitForTimeout(250);
  };
  const turn = (ptr) => page.evaluate((p) => window.BW.EXT.w2layout.page('A4', 'landscape', 'section', p), ptr);
  const undoAll = () => page.evaluate(() => { for (let i = 0; i < 6; i += 1) window.BW.undo(); });
  const viewState = () => page.evaluate(() => ({ n: window.BW.S.pageN, tab: (window.BW.S.pageTab || []).map((s) => (s.w > s.h ? 'L' : 'P')).join(''), noted: !!window.BW.S.viewsNoted, pz: document.documentElement.style.getPropertyValue('--bw-pz') }));
  const pdfOf = async (label) => {
    const [ed, doc] = await page.evaluate(() => [window.BW.S.ed, JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc))]);
    const pdf = path.join(tmp, `${label.replace(/\W+/g, '-')}.pdf`);
    await exportPdf(doc, { locale: ed, theme, pdfPath: pdf });
    return { doc, ed, sizes: pageSizes(pdf).map(([w, h]) => (w > h ? 'L' : 'P')).join('') };
  };
  const same = async (label, sizes = [[1600, 900]]) => {
    const ref = await pdfOf(label);
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(150);
      const v = await viewState();
      check(`${label} at ${w}x${h}: the editor counts ${v.n} pages, the PDF ${ref.sizes.length} (editor ${v.tab} / pdf ${ref.sizes})`, v.n === ref.sizes.length && v.tab === ref.sizes && ref.sizes.length > 3 && !!v.pz && !v.noted, `${v.tab} / ${ref.sizes}`);
    }
    return ref;
  };

  // P1: the plain samples, both languages, two window sizes
  for (const svc of ['event-permit', 'blank']) {
    for (const ed of ['ar', 'en']) {
      await show(svc, ed);
      await same(`${svc} ${ed}`, [[1600, 900], [1280, 720]]);
    }
  }
  // the zoom of the editor moves nothing either
  await show('event-permit', 'ar');
  await page.evaluate(() => { window.BW.S.zoom = 1.5; window.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(150);
  await same('event-permit ar at zoom 150');
  await page.evaluate(() => { window.BW.S.zoom = 1; window.dispatchEvent(new Event('resize')); });
  // the mixed fixture: a section turned landscape through the editor's page action, in the middle of the book
  let mixed = null;
  for (const ed of ['en', 'ar']) {
    await show('event-permit', ed);
    await turn('/chapters/1/sections/0/blocks/0');
    await page.waitForTimeout(250);
    const ref = await same(`mixed ${ed} (section turned landscape)`, [[1600, 900], [1024, 700]]);
    if (ed === 'en') mixed = ref;
    await undoAll();
  }

  // P2: the page drawer's route on a running host, the mixed fixture
  const port = await new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
  server = await serve(file, port, { out: path.join(tmp, 'exports') });
  const r = await fetch(`http://127.0.0.1:${port}/api/pages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc: mixed.doc, locale: 'en' }) });
  const j = await r.json();
  const th = (j.pages || []).map((p) => (p.wide ? 'L' : 'P')).join('');
  check(`the page drawer's route returns the PDF's pages in the PDF's orientation (${th})`, r.ok && th === mixed.sizes && th.includes('L') && th.includes('P'), `${th} / ${mixed.sizes}`);
  const fail = await fetch(`http://127.0.0.1:${port}/api/pages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('the route refuses a body without a document (the check is live)', fail.status === 400);

  check('no page error in the editor', errors.length === 0, errors.slice(0, 2).join(' | '));
} finally {
  if (server) await new Promise((ok) => server.close(ok));
  await browser.close();
}

// P3: the DOCX type scale
const want = { Normal: 12, Title: 22, Heading1: 16, Heading2: 14, Heading3: 12 };
const sizes = theme.sizes;
check('the design pack carries the scale (positive sample)', sizes.title === '22pt' && sizes.h1 === '16pt' && sizes.h2 === '14pt' && sizes.h3 === '12pt' && sizes.body === '12pt', JSON.stringify(sizes));
const src = fs.readFileSync(path.join(REPO, 'engine', 'docx', 'build_docx.py'), 'utf8');
check('build_docx.py holds no type-scale override: theme.py reads the pack', !/SIZES\.update\(/.test(src));
for (const ed of ['en', 'ar']) {
  const docx = path.join(tmp, `scale-${ed}.docx`);
  exportDocx(sample(REPO, ed), { locale: ed, theme, docxPath: docx });
  const x = docxParts(docx, /^word\/styles\.xml$/)['word/styles.xml'];
  const got = {};
  for (const id of Object.keys(want)) {
    const i = x.indexOf(`w:styleId="${id}"`);
    const seg = i < 0 ? '' : x.slice(i, x.indexOf('</w:style>', i));
    got[id] = [...seg.matchAll(/<w:sz(?:Cs)? w:val="(\d+)"/g)].map((m) => +m[1] / 2);
  }
  check(`${ed}: the DOCX styles are 22 / 16 / 14 / 12 / 12 pt (Latin and complex script)`, Object.entries(want).every(([id, pt]) => got[id].length >= 1 && got[id].every((v) => v === pt)), JSON.stringify(got));
}

if (failed) { console.log(`\npages-0160: ${failed} failed`); process.exit(1); }
console.log('\npages-0160: all passed');
