// (bw174, pages lane): the editor's page views and the PDF start every page on the same block, at every window size.
// Two causes, each reproduced here on a synthetic document (invented text), through the real editor (view.single) and the real exportPdf:
//  1. The window's fit. The page views were laid out inside `zoom: pz` > `zoom: 1/pz`: the two cancel on paper, not in the float the layout multiplies
//     (the product is not exactly 1 at most window sizes, and a layout unit of 1/64 px is lost on rows and lines). Which block sat at the foot of a page
//     then depended on the size of the window (two pages of two real documents, at some window sizes only). The pages are laid out at exactly 100 percent
//     now (no CSS zoom above them, a transform only): the rows of one table sit at the same place at every window size.
//  2. The page's height. Chrome prints on a page it rounds to a whole px (A4: 1122.52 px prints on 1123), the editor's columns were exactly 297 mm: a row
//     that ends within the rounding of the foot went on to the next page in the editor and stayed in the PDF (a real document, one story-card row).
//     The columns round the same way (views.css: `round(var(--ph), 1px)`, the turned sheets' `--rh` too).
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/pages-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pages0174-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  pages-0174: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const blank = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'));
const MM = 96 / 25.4;
const WORDS = ['النظام', 'يعرض', 'الحقل', 'قيمة', 'المستخدم', 'طلب', 'إدخال', 'رقم'];
const words = (k, s) => Array.from({ length: k }, (_, j) => WORDS[(j * 3 + s) % WORDS.length]).join(' ');
const base = () => { const d = JSON.parse(JSON.stringify(blank)); d.chapters = []; return d; };
/** A long table of rows of every length (invented words): rows that fill a line to the hair at some width are in it. */
const tableDoc = (n) => { const d = base(); d.chapters = [{ number: '1', title: 'اختبار الجدول', sections: [{ number: '1.1', title: 'جدول طويل', blocks: [{ kind: 'table', columns: ['أ', 'ب', 'ج', 'د'], rows: Array.from({ length: n }, (_, i) => [`R${i}`, words((i % 23) + 1, i), words(((i * 7) % 31) + 1, i + 1), words(((i * 5) % 17) + 1, i + 2)]) }] }] }]; return d; };
/** N one-line paragraphs (K<n>K marks each in the PDF's text), optionally on a turned sheet of its own size (w 300 mm, h `turned` mm). */
const paraDoc = (pageH, turned, n = 70) => {
  const d = base();
  const blocks = Array.from({ length: n }, (_, i) => ({ kind: 'prose', paragraphs: [`فقرة K${i + 1}K نص تجريبي قصير لاختبار التقسيم.`] }));
  if (turned) blocks[0].layout = { page: { size: { w: 300, h: turned }, orientation: 'landscape' } };
  else if (pageH) d.layout = { page: { size: { w: 210, h: pageH }, orientation: 'portrait' } };
  d.chapters = [{ number: '1', title: 'اختبار الترقيم', sections: [{ number: '1.1', title: 'فقرات تجريبية', blocks }] }];
  return d;
};

const browser = await chromium.launch(launchOptions());
let seq = 0;
/** The editor's paged view of `doc` in a window of vw x vh: the scale, the zoom of the window and of the pages, and the elements picked by `pick`. */
async function view(doc, [vw, vh], pick, arg) {
  const dir = path.join(tmp, `d${(seq += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'document.ar.json'), JSON.stringify(doc));
  const file = path.join(dir, 'ed.html');
  buildEditor({ inputs: [dir], out: file, set: 'pages-0174', watermarkDir: null, ui: 'ar' });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed += 1; });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = 'ar'; B.render(); B.S.zoom = 1; });
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  await page.evaluate(() => window.BW.runAction('view.single'));
  await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(450);
  const r = await page.evaluate(({ pick, arg }) => {
    const main = document.querySelector('#bw-pair .bw-view > *');
    const z = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz'));
    const mr = main.getBoundingClientRect();
    const t = window.BW.S.pageTab;
    const els = [...main.querySelectorAll(pick)].filter((e) => !e.closest('.bw-rpts,.bw-runs,.bw-sheets,.bw-slot') && (arg ? new RegExp(arg).test(e.textContent) : true));
    return {
      z, n: window.BW.S.pageN,
      boxZoom: getComputedStyle(main.parentElement).zoom, mainZoom: getComputedStyle(main).zoom,
      items: els.map((e) => {
        const q = e.getBoundingClientRect(); const c = (q.left + q.right) / 2;
        const m = ((main.dir === 'rtl' ? mr.right - c : c - mr.left) / z) / (96 / 25.4);
        let pg = 0; for (let i = 0; i < t.length; i += 1) if (t[i].x <= m + 0.3) pg = i;
        return { pg, top: (q.top - mr.top) / z, bottom: (q.bottom - mr.top) / z };
      }),
    };
  }, { pick, arg });
  await ctx.close();
  return r;
}
const groups = (items) => { const by = []; items.forEach((it, i) => { (by[it.pg] ??= []).push(i + 1); }); return by.filter(Boolean); };
const sig = (g) => g.map((a) => `${a[0]}-${a.at(-1)}(${a.length})`).join(' ');
fs.writeFileSync(path.join(tmp, 'words.py'), 'import sys, pymupdf\nfor n, p in enumerate(pymupdf.open(sys.argv[1]), 1):\n    for w in p.get_text("words"):\n        print(f"{n}\\t{w[4]}")\n');
/** The PDF's pages of `doc`: for each page the numbers n of its K<n>K marks. */
async function pdfGroups(doc, label) {
  const file = path.join(tmp, `${label}.pdf`);
  await exportPdf(doc, { locale: 'ar', theme, pdfPath: file, browser });
  const out = spawnSync(...py([path.join(tmp, 'words.py'), file]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 1e8 }).stdout;
  const by = [];
  for (const l of out.split(/\r?\n/)) { const [p, w] = l.split('\t'); const m = /^K(\d+)K$/.exec(w || ''); if (m) (by[+p] ??= []).push(+m[1]); }
  return by.filter(Boolean).map((a) => a.sort((x, y) => x - y));
}

try {
  // 1. the window's fit: the rows of one table sit at the same place at every window size
  {
    const sizes = [600, 700, 800, 900, 1000, 1100, 1200, 1300];
    const runs = [];
    for (const vh of sizes) runs.push(await view(tableDoc(160), [1600, vh], 'tbody tr', '^R[0-9]'));
    check('positive sample: the window sizes give distinct scales and the table has its 160 rows', new Set(runs.map((r) => r.z)).size >= 6 && runs.every((r) => r.items.length === 160), JSON.stringify(runs.map((r) => [r.z, r.items.length])));
    check('the pages are laid out at exactly 100 percent: no CSS zoom on the window or on the sheet, at any window size', runs.every((r) => r.boxZoom === '1' && r.mainZoom === '1'), JSON.stringify(runs.map((r) => [r.boxZoom, r.mainZoom])));
    let dev = 0;
    runs.forEach((r) => r.items.forEach((it, i) => { dev = Math.max(dev, Math.abs(it.bottom - runs[0].items[i].bottom)); }));
    check('every row sits at the same place at every window size (largest deviation of a row bottom, px)', dev <= 0.01, String(dev));
    check('the same pages hold the same rows at every window size', new Set(runs.map((r) => sig(groups(r.items)))).size === 1 && new Set(runs.map((r) => r.n)).size === 1, runs.map((r) => sig(groups(r.items))).join(' / '));
  }
  // 2. the page's height: Chrome prints on a page it rounds to a whole px; the editor's columns round the same way
  for (const turned of [false, true]) {
    const label = turned ? 'a turned sheet (custom 300 x h mm)' : 'the document page (custom 210 x h mm)';
    // the layout of the sheet at a plain height: the bottom of the last paragraph of a middle page and the pitch of the paragraphs
    const h0 = turned ? 200 : 297;
    const r0 = await view(paraDoc(turned ? 0 : h0, turned ? h0 : 0), [1600, 900], 'p', 'K[0-9]+K');
    const pg = []; r0.items.forEach((it) => { (pg[it.pg] ??= []).push(it); });
    const mid = pg.filter(Boolean)[2];
    const L = mid.at(-1).bottom;
    const pitch = mid[1].top - mid[0].top;
    // a page height (px) whose own capacity is a hair short of one more paragraph, and that Chrome prints on the whole px that holds it
    const P0 = L + pitch + 16 * MM; // the page height that holds one paragraph more, to the hair
    const lo = Math.ceil(P0) - 0.5;
    check(`${label}: the tuned height has a window (the rounding makes one more paragraph fit)`, P0 > lo && lo >= P0 - 1, `P0=${P0.toFixed(3)}`);
    const P = (lo + P0) / 2;
    const hMm = +(P / MM).toFixed(4);
    const doc = paraDoc(turned ? 0 : hMm, turned ? hMm : 0);
    const pdf = await pdfGroups(doc, turned ? 'turned' : 'plain');
    const ed = groups((await view(doc, [1600, 900], 'p', 'K[0-9]+K')).items);
    const per = (g) => g.slice(1, -1).map((a) => a.length);
    check(`${label}: positive sample: the PDF holds one paragraph more per page than the plain height does (${per(pdf).join(',')})`, per(pdf).length >= 2 && per(pdf)[0] === groups(r0.items)[1].length + 1, `${per(pdf)} vs ${groups(r0.items)[1].length}`);
    check(`${label}: the editor's pages hold the PDF's paragraphs (page by page)`, sig(ed) === sig(pdf.map((a) => a)), `editor ${sig(ed)} | pdf ${sig(pdf)}`);
  }
} finally {
  await browser.close();
}
if (failed) { console.log(`\npages-0174: ${failed} failed`); process.exit(1); }
console.log('\npages-0174: all passed');
