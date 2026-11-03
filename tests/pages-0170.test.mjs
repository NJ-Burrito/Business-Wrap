// 0.17.0 (bw-0170, pages lane): the editor's pages and the PDF start every page alike; a subhead before a story card keeps its section heading.
//  1. P5: a section that opens with a subhead and then a story card, then the output table: the section heading stays in front of the subhead (it used to
//     stay "pending" and land on the output table's caption).
//  2. P1a: the PDF's page is 794 px wide (Chrome rounds A4's 793.7 px up), the editor's is 210 mm. A third of a pixel flips a line that fills its cell
//     to the hair; in print `.wrap` takes the editor's exact width (render.mjs printTrimCss), and not while the print pass measures (the measure
//     page is narrower than the threshold), so relaxTallGroups sees what it saw before.
//  3. A long data-dictionary table (the shape «قاموس البيانات والمصطلحات»), swept over its length: the PDF's page count equals the editor's. The rows Chrome
//     cuts in two at a held tail group (reported as INFO, not asserted: the cause is in editor/views.js viewsRepeat, out of this lane) stay as before.
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/pages-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme, printHtml } from '../engine/export.mjs';
import { buildDocuments } from '../engine/srs/cli.mjs';
import { py } from '../engine/py.mjs';
import * as R from '../engine/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pages0170-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  pages-0170: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const FX = (f) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', f);
const built = await buildDocuments({ pack: 'e-service', profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: FX('garden.record.json'), today: '2026-11-03' });
const clone = (x) => JSON.parse(JSON.stringify(x));
const browser = await chromium.launch(launchOptions());
try {
  // 1. P5
  {
    const d = clone(built.docs.ar);
    const ch = d.chapters.find((c) => String(c.number) === '6');
    const proto = ch.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'stories');
    const SEC = 'عنوان القسم الفريد قبل القصة';
    const SUB = 'عنوان فرعي قبل بطاقة القصة';
    ch.sections = [{ title: 'مقدمة الفصل', number: '6.0', blocks: [{ kind: 'prose', paragraphs: [{ text: 'فقرة تمهيدية.' }] }] }, { title: SEC, number: '6.1', blocks: [{ kind: 'subhead', text: SUB }, { ...clone(proto), items: [clone(proto.items[0])] }, { kind: 'table', columns: ['المخرج', 'الوصف'], rows: [['م-1', 'مخرج أول'], ['م-2', 'مخرج ثان']] }] }];
    const { html } = printHtml(d, { locale: 'ar', theme, embed: false });
    const pg = await browser.newPage();
    await pg.setContent(html);
    const r = await pg.evaluate(({ SEC, SUB }) => {
      const leaf = [...document.querySelectorAll('h1,h2,h3,h4,caption,p')];
      const at = (t) => leaf.findIndex((e) => (e.textContent || '').includes(t));
      const caps = [...document.querySelectorAll('table caption')].map((c) => c.textContent);
      return { sec: at(SEC), sub: at(SUB), capsWithSec: caps.filter((c) => c.includes(SEC)).length };
    }, { SEC, SUB });
    await pg.close();
    check('positive sample: the section heading and the subhead are both in the printed page', r.sec >= 0 && r.sub >= 0, JSON.stringify(r));
    check('the section heading is printed before the subhead that opens the section', r.sec < r.sub, JSON.stringify(r));
    check('the section heading is not the caption of a table (the output table of the card)', r.capsWithSec === 0, JSON.stringify(r));
  }
  // 2. P1a
  {
    const css = R.printTrimCss ? R.printTrimCss(undefined) : '';
    check('printTrimCss gives A4 a rule (794 px page, 793.7 px editor)', /min-width:\d+px/.test(css) && /\.wrap\{width:calc\(100% - 0\.\d+px\)/.test(css), css);
    check('the rule is off below the measure page (relaxTallGroups measures at the measure wide)', Number(/min-width:(\d+)px/.exec(css)?.[1]) > R.PAGE.measurePx, css);
    const { html } = printHtml(built.docs.ar, { locale: 'ar', theme, embed: false });
    const probe = async (w) => {
      const pg = await browser.newPage({ viewport: { width: w, height: 1000 } });
      await pg.emulateMedia({ media: 'print' });
      await pg.setContent(html);
      const v = await pg.evaluate(() => document.querySelector('.wrap')?.getBoundingClientRect().width);
      await pg.close();
      return v;
    };
    const page = await probe(794);
    const measure = await probe(R.PAGE.measurePx);
    check("in print on the 794 px page, .wrap is the editor's exact 210 mm", Math.abs(page - (210 / 25.4) * 96) < 0.02, String(page));
    check("on the measure page .wrap keeps the full viewport (no change to the print pass's measure)", Math.abs(measure - R.PAGE.measurePx) < 0.02, String(measure));
  }
  // 3. P1b
  {
    fs.writeFileSync(path.join(tmp, 'count.py'), 'import pymupdf, sys\nsys.stdout.write(str(len(pymupdf.open(sys.argv[1]))))\n');
    const sentence = 'قيد الحقل يصف ما يعرضه النظام وما يقبله وما يمنعه عند إدخال القيمة في هذا الحقل من النموذج';
    const docWith = (n) => {
      const d = clone(built.docs.ar);
      const ch = d.chapters.find((c) => String(c.number) === '5');
      ch.sections = [{ title: 'قاموس الحقول', blocks: [{ kind: 'subhead', text: 'قاموس البيانات والمصطلحات' }, { kind: 'table', columns: ['اسم الحقل', 'النوع', 'قيود الحقل'], rows: Array.from({ length: n }, (_, i) => [`F-${String(i + 1).padStart(2, '0')}`, 'نص', `${sentence} ${sentence} END${String(i + 1).padStart(2, '0')}`]) }] }];
      return d;
    };
    const LENGTHS = [16, 19, 22, 25, 28, 31, 34, 37];
    const rows = [];
    let cut = 0;
    let dbg = [];
    for (const n of LENGTHS) {
      const doc = docWith(n);
      const dir = path.join(tmp, `d${n}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'document.ar.json'), JSON.stringify(doc));
      const file = path.join(tmp, `n${n}.pdf`);
      await exportPdf(doc, { locale: 'ar', theme, pdfPath: file, browser });
      const words = spawnSync(...py([path.join(REPO, 'tests', 'fixtures', 'pages-0170', 'words.py'), file]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 1e8 }).stdout.split(/\r?\n/).map((l) => l.split('\t'));
      const pdfN = +spawnSync(...py([path.join(tmp, 'count.py'), file]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout;
      // a row is cut when its first cell (F-nn) is on one page and its last word (ENDnn) on another
      const pageOf = new Map();
      dbg = words.filter(([, w]) => /END|F-|-F|DNE/.test(w || '')).slice(0, 6);
      for (const [p, w] of words) if (/^(F-\d+|END\d+)$/.test(w || '')) pageOf.set(w, +p);
      for (let i = 1; i <= n; i += 1) { const k = String(i).padStart(2, '0'); if (pageOf.has(`F-${k}`) && pageOf.has(`END${k}`) && pageOf.get(`F-${k}`) !== pageOf.get(`END${k}`)) cut += 1; }
      const editor = path.join(tmp, `e${n}.html`);
      buildEditor({ inputs: [dir], out: editor, set: 'pages-0170', watermarkDir: null, ui: 'ar' });
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => { console.log('pageerror', e.message); failed += 1; });
      await page.goto(pathToFileURL(editor).href);
      await page.waitForFunction(() => window.BW?.ready);
      await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = 'ar'; B.render(); B.S.zoom = 1; });
      await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
      await page.evaluate(() => window.BW.runAction('view.single'));
      await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(400);
      const edN = await page.evaluate(() => window.BW.S.pageN);
      await ctx.close();
      rows.push([n, pdfN, edN, pageOf.size]);
    }
    check('every length was seen (positive sample: the row markers are on the PDF pages, more than 3 pages each)', rows.every(([, p, e, m]) => p > 3 && e > 3 && m >= 2), JSON.stringify(rows) + JSON.stringify(dbg));
    console.log(`INFO  pages-0170: dictionary rows cut across two PDF pages over the sweep: ${cut}`);
    const apart = rows.filter(([, p, e]) => p !== e);
    check(`at every table length (${rows.length} lengths) the PDF has exactly the editor's page count`, apart.length === 0, JSON.stringify(apart));
    console.log(`INFO  pages-0170: pdf/editor pages by dictionary rows: ${rows.map(([n, p, e]) => `${n}:${p}/${e}`).join(' ')}`);
  }
} finally {
  await browser.close();
}
if (failed) { console.log(`\npages-0170: ${failed} failed`); process.exit(1); }
console.log('\npages-0170: all passed');
