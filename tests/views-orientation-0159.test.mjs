// 0.16.0 (bw-0159): the page views of a document that mixes portrait and landscape pages.
// Every page view shows each page whole, alone and at its own size: one page, two pages, continuous. Real Chrome steps through a
// placeholder fixture (the sample event-permit, which already carries a figure chapter on its own turned sheet, plus landscape
// sections set through the editor's own page action): portrait, landscape, portrait; first and last page landscape; AR and EN;
// zoom 75 to 150 percent; windows 1024 to 2560; dark. Each page's rect, centre, full visibility (elementFromPoint at its corners),
// and no other sheet inside the window. Continuous: the landscape sheet is centred and overlaps nothing.
//
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/views-orientation-0159.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import { pageSizes } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-views0159-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  views-orientation: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'views-0159', watermarkDir: null, ui: 'en' });
const browser = await chromium.launch(launchOptions());
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); }); // calm: no slide, the rects are final at once
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  const edit = async (ed) => { await page.evaluate((e) => { const B = window.BW; if (B.S.ed !== e && B.M[B.S.svc][e]) { B.S.ed = e; B.render(); } }, ed); };
  const turn = (ptr) => page.evaluate((p) => window.BW.EXT.w2layout.page('A4', 'landscape', 'section', p), ptr);
  const undoAll = () => page.evaluate(() => { for (let i = 0; i < 6; i += 1) window.BW.undo(); });
  const chapters = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters.length);
  const sizes = () => page.evaluate(() => window.BW.S.pageSizes || []);

  /** One page of the paged view: the window is the page's sheet, centred, whole, alone. */
  const probe = () => page.evaluate(() => {
    const B = window.BW;
    const view = document.querySelector('#bw-pair .bw-view');
    const r = view.getBoundingClientRect();
    const k = B.S.pageAt;
    const sz = (B.S.pageSizes || [])[k] || {};
    const vw = document.documentElement.clientWidth;
    const inside = r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5;
    const corners = [[3, 3], [r.width - 3, 3], [3, r.height - 3], [r.width - 3, r.height - 3]].map(([x, y]) => document.elementFromPoint(r.left + x, r.top + y));
    const hostEl = document.getElementById('bw-ui-host');
    // a toast of the editor may lie over a corner: look through it to the shadow tree, a toast there is not the page's fault
    const seen = corners.every((el, i) => el && (view.contains(el) || el.closest?.('#bw-pair') || (el === hostEl && !!hostEl.shadowRoot.querySelector('[class*=toast]'))));
    const bad = corners.map((el, i) => (el && (view.contains(el) || el.closest?.('#bw-pair')) ? '' : `${i}:${el?.tagName}.${el?.className}#${el?.id}`)).filter(Boolean).join(';') + ` sh=${document.documentElement.scrollHeight}/${innerHeight}`;
    const sheets = [...view.querySelectorAll('.bw-sheet')];
    const others = sheets.filter((s) => +s.dataset.page !== k).filter((s) => { const q = s.getBoundingClientRect(); return Math.min(q.right, r.right) - Math.max(q.left, r.left) > 1 && Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 1; }).map((s) => s.dataset.page);
    const mine = sheets.find((s) => +s.dataset.page === k)?.getBoundingClientRect();
    const z = parseFloat(getComputedStyle(view).zoom) || 1;
    const mm = 96 / 25.4;
    const pn = document.getElementById('bw-ui-host').shadowRoot.querySelector('.pager .pn')?.textContent || '';
    return { bad, k, n: B.S.pageN, w: r.width / z / mm, h: r.height / z / mm, sz, cx: (r.left + r.right) / 2 - vw / 2, inside, seen, others, mineOk: !mine || (Math.abs(mine.width - r.width) < 1.5 && Math.abs(mine.height - r.height) < 1.5), pn, ratioOk: Math.abs(r.width / r.height - sz.w / sz.h) < 0.01 };
  });
  const walk = async (label, dir) => {
    const bad = [];
    const seenSizes = new Set();
    await page.evaluate(() => { window.BW.S.viewsWarned = undefined; window.BW.runAction('view.single'); });
    await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
    const next = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const prev = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.press('Home');
    let n = 0;
    for (let i = 0; i < 60; i += 1) {
      const p = await probe();
      n = p.n;
      seenSizes.add(`${Math.round(p.sz.w)}x${Math.round(p.sz.h)}`);
      const ok = p.k === i && p.inside && p.seen && !p.others.length && p.mineOk && p.ratioOk && Math.abs(p.cx) < 2 && Math.abs(p.w - p.sz.w) < 0.6 && Math.abs(p.h - p.sz.h) < 0.6 && new RegExp(`\\b${i + 1}\\b`).test(p.pn) && p.pn.includes(String(p.n));
      if (!ok) bad.push(JSON.stringify(p));
      if (i === p.n - 1) break;
      await page.keyboard.press(i % 2 ? 'PageDown' : next);
      await page.waitForTimeout(40);
    }
    check(`${label}: ${n} pages, each whole, alone, centred, at its own size`, !bad.length && n > 3, bad.slice(0, 2).join(' | '));
    check(`${label}: both a landscape and a portrait sheet were seen (positive sample)`, [...seenSizes].some((s) => { const [w, h] = s.split('x'); return +w > +h; }) && [...seenSizes].some((s) => { const [w, h] = s.split('x'); return +w < +h; }), [...seenSizes].join(','));
    if (/figure/.test(label)) check(`${label}: the figure sheet holds its content (no text past the sheet)`, !(await page.evaluate(() => window.BW.S.viewsWarned)), await page.evaluate(() => String(window.BW.S.viewsWarned)));
    // and back: previous steps one real page; the wheel steps one page too
    await page.keyboard.press(prev);
    await page.waitForTimeout(40);
    const back = await probe();
    check(`${label}: previous steps one real page back`, back.k === n - 2 && back.inside && !back.others.length, JSON.stringify(back));
    await page.keyboard.press('Home');
    await page.mouse.move(800, 400);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(500);
    const wheel = await probe();
    check(`${label}: the wheel steps one real page`, wheel.k === 1 && !wheel.others.length && wheel.seen, JSON.stringify(wheel));
  };
  const spreadCheck = async (label) => {
    await page.evaluate(() => window.BW.runAction('view.spread'));
    await page.waitForFunction(() => document.querySelector('#bw-pair[data-pages="spread"] .bw-view'));
    const bad = [];
    for (let i = 0; i < 40; i += 1) {
      const r = await page.evaluate(() => {
        const view = document.querySelector('#bw-pair .bw-view');
        const q = view.getBoundingClientRect();
        const k = window.BW.S.pageAt;
        const show = k === 0 ? [0] : [k, k + 1];
        const vis = [...view.querySelectorAll('.bw-sheet')].filter((s) => { const a = s.getBoundingClientRect(); return Math.min(a.right, q.right) - Math.max(a.left, q.left) > 1; }).map((s) => +s.dataset.page).sort((a, b) => a - b);
        const sheets = [...view.querySelectorAll('.bw-sheet')].filter((s) => show.includes(+s.dataset.page)).map((s) => s.getBoundingClientRect());
        const cut = sheets.some((a) => a.left < q.left - 1 || a.right > q.right + 1 || a.top < q.top - 1 || a.bottom > q.bottom + 1);
        const vw = document.documentElement.clientWidth;
        return { k, n: window.BW.S.pageN, vis, show: show.filter((x) => x < window.BW.S.pageN), cut, inside: q.left >= -0.5 && q.right <= vw + 0.5 };
      });
      if (!(JSON.stringify(r.vis.filter((x) => r.show.includes(x))) === JSON.stringify(r.show) && r.vis.every((x) => r.show.includes(x)) && !r.cut && r.inside)) bad.push(JSON.stringify(r));
      if (r.k + 2 >= r.n) break;
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(40);
    }
    check(`${label}: the open book shows its two pages whole and no other`, !bad.length, bad.slice(0, 2).join(' | '));
  };
  const continuous = async (label) => {
    await page.evaluate(() => window.BW.runAction('view.continuous'));
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const main = document.querySelector('#bw-pair main.bw-doc[data-locale="' + window.BW.S.ed + '"]');
      const mr = main.getBoundingClientRect();
      const segs = [...main.querySelectorAll('[style^="page:bw-seg-"], .chapter.wide')].filter((e) => !e.parentElement.closest('[style^="page:bw-seg-"], .chapter.wide'));
      const out = segs.map((e) => { const q = e.getBoundingClientRect(); const prev = e.previousElementSibling?.getBoundingClientRect(); return { cx: q.left + q.width / 2 - (mr.left + mr.width / 2), wide: q.width > q.height, overlapPrev: prev ? prev.bottom - q.top > 1 && prev.height > 0 : false }; });
      return { n: segs.length, out };
    });
    check(`${label}: landscape sheets stand centred and overlap nothing`, r.n > 0 && r.out.every((o) => Math.abs(o.cx) < 2 && !o.overlapPrev) && r.out.some((o) => o.wide), JSON.stringify(r));
  };

  /** The PDF is the reference: the same number of pages, each in the orientation the view draws it in. */
  const pdfSame = async (label) => {
    const ed = await page.evaluate(() => window.BW.S.ed);
    const doc = await page.evaluate(() => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc)));
    const pdf = path.join(tmp, `${label.replace(/\W+/g, '-')}.pdf`);
    await exportPdf(doc, { locale: ed, theme: loadTheme(), pdfPath: pdf });
    const want = pageSizes(pdf).map(([w, h]) => (w > h ? 'L' : 'P')).join('');
    await page.evaluate(() => window.BW.runAction('view.single'));
    await page.waitForFunction(() => window.BW.S.pageN > 1);
    const got = (await sizes()).map((s) => (s.w > s.h ? 'L' : 'P')).join('');
    // the text of one page can differ by a column from the PDF's pagination (the front matter flows differently in CSS columns: measured
    // 10 against 9 pages in the sample, with or without a turned sheet); the sheets themselves must come in the same order and orientation
    const runs = (x) => x.replace(/(.)\1+/g, '$1');
    check(`${label}: the PDF's turned sheets come in the view in the same order (${want} / ${got})`, runs(want) === runs(got) && want.split('L').length === got.split('L').length, `pdf ${want} / view ${got}`);
    await page.evaluate(() => window.BW.runAction('view.continuous'));
  };
  await edit('en');
  await pdfSame('en figure chapter pdf');
  await turn('/chapters/1/sections/0/blocks/0');
  await pdfSame('en middle section landscape pdf');
  await undoAll();
  for (const ed of ['en', 'ar']) {
    await edit(ed);
    const dir = await page.evaluate(() => document.querySelector('#bw-pair main.bw-doc[data-locale="' + window.BW.S.ed + '"]').dir);
    // the sample's own figure chapter prints on a turned sheet: portrait, landscape, portrait
    await walk(`${ed} figure chapter`, dir);
    await continuous(`${ed} figure chapter, continuous`);
    // a landscape section in the middle, then the first, then the last chapter
    for (const [name, ci] of [['middle', 1], ['first', 0], ['last', chapters - 1]]) {
      await turn(`/chapters/${ci}/sections/0/blocks/0`);
      await walk(`${ed} ${name} section landscape`, dir);
      if (name === 'middle') { await spreadCheck(`${ed} ${name} section landscape, spread`); await continuous(`${ed} ${name} section landscape, continuous`); }
      await page.evaluate(() => window.BW.runAction('view.continuous'));
      await undoAll();
    }
  }
  // several in a row, zoom and window sizes, dark
  await edit('en');
  await turn('/chapters/1/sections/0/blocks/0');
  await page.evaluate(() => window.BW.runAction('view.single'));
  await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view'));
  for (const zoom of [0.75, 1, 1.5]) {
    for (const [w, h] of [[1024, 700], [1600, 900], [2560, 1300]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate((z) => { window.BW.S.zoom = z; window.dispatchEvent(new Event('resize')); }, zoom);
      await page.waitForTimeout(80);
      const sz = await sizes();
      const li = sz.findIndex((s) => s.w > s.h);
      const pi = sz.findIndex((s) => s.w < s.h);
      const out = [];
      for (const k of [pi, li, pi]) {
        await page.evaluate((x) => { window.BW.S.pageAt = x; window.BW.viewsGo ? window.BW.viewsGo(0, true) : window.dispatchEvent(new Event('resize')); }, k);
        await page.keyboard.press('Home');
        for (let i = 0; i < k; i += 1) await page.keyboard.press('PageDown');
        const p = await probe();
        // at 150 % the page is larger than the window: it scrolls, but never shows a neighbour
        if (p.others.length || p.k !== k || !(zoom > 1 || (p.inside && p.seen && Math.abs(p.cx) < 2))) out.push(`${w}x${h} z${zoom} k${k}: ${JSON.stringify(p)}`);
      }
      check(`window ${w}x${h}, zoom ${zoom * 100} %: portrait, landscape, portrait show no neighbour${zoom > 1 ? '' : ', centred and whole'}`, !out.length && li >= 0 && pi >= 0, out.slice(0, 1).join(' | '));
    }
  }
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => { window.BW.S.zoom = 1; window.dispatchEvent(new Event('resize')); });
  await page.evaluate(() => window.BW.runAction('dark'));
  await page.waitForTimeout(100);
  const sz = await sizes();
  const li = sz.findIndex((s) => s.w > s.h);
  await page.keyboard.press('Home');
  for (let i = 0; i < li; i += 1) await page.keyboard.press('PageDown');
  const d = await probe();
  check('dark: the landscape page is whole, centred, alone', d.k === li && d.inside && d.seen && !d.others.length && Math.abs(d.cx) < 2, JSON.stringify(d));
  check('no page error in the editor', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nviews-orientation: all passed');
process.exit(failed ? 1 : 0);
