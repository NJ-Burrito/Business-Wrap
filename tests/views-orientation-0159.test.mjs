// (bw-0159): the page views of a document that mixes portrait and landscape pages.
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
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, exportPdf, loadTheme, pageThumbs } from '../engine/export.mjs';
import { pageSizes } from './fixtures/doc-model/util.mjs';
import { suite, launchChrome } from './_harness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-views0159-'));
const S = suite("views-orientation");
const { check } = S;
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'views-0159', watermarkDir: null, ui: 'en' });
const browser = await launchChrome();
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
    const z = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')) || 1;
    const mm = 96 / 25.4;
    const pn = document.getElementById('bw-ui-host').shadowRoot.querySelector('.pager .pn')?.textContent || '';
    return { bad, k, n: B.S.pageN, w: r.width / z / mm, h: r.height / z / mm, sz, cx: (r.left + r.right) / 2 - vw / 2, inside, seen, others, mineOk: !mine || (Math.abs(mine.width - r.width) < 1.5 && Math.abs(mine.height - r.height) < 1.5), pn, ratioOk: Math.abs(r.width / r.height - sz.w / sz.h) < 0.01 };
  });
  /** Every line of text and every free object stands on a sheet (nothing is cut), and the free objects sit where they do in a plain document:
   *  the same place inside their column of the document's own page. */
  const onSheets = () => page.evaluate(() => {
    const main = document.querySelector('#bw-pair main.bw-doc[data-locale="' + window.BW.S.ed + '"]');
    const sheets = [...main.querySelectorAll('.bw-sheet')].map((e) => e.getBoundingClientRect());
    const off = [];
    for (const e of main.querySelectorAll('p,li,tr,h2,h3,.bw-ov')) {
      if (e.closest('.bw-runs')) continue;
      for (const q of e.getClientRects()) {
        if (!q.width || !q.height) continue;
        if (!sheets.some((r) => q.left >= r.left - 2 && q.right <= r.right + 2 && q.top >= r.top - 2 && q.bottom <= r.bottom + 2)) off.push(`${e.tagName}.${e.className}`);
      }
    }
    const mr = main.getBoundingClientRect();
    const z = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')) || 1;
    const slot = (210 + 12) * 96 / 25.4;
    const ovs = [...main.querySelectorAll('.bw-ov')].filter((e) => !e.closest('.bw-frun')).map((e) => { const q = e.getBoundingClientRect(); const x = (main.dir === 'rtl' ? mr.right - q.right : q.left - mr.left) / z; return [e.dataset.i, +(x % slot).toFixed(1), +((q.top - mr.top) / z).toFixed(1)]; });
    return { off: off.slice(0, 3), n: off.length, ovs, boxes: main.querySelectorAll('.bw-frun').length };
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
    const os = await onSheets();
    check(`${label}: no line of text and no free object lies off its sheet (nothing cut)`, os.n === 0 && os.boxes > 0, JSON.stringify(os.off));
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
        const mmw = q.width / (parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')) || 1) / (96 / 25.4);
        const T = window.BW.S.pageTab;
        return { pw: 1, vw: mmw, sz: [T[k], T[k + 1] || {}], k, n: window.BW.S.pageN, vis, show: show.filter((x) => x < window.BW.S.pageN), cut, inside: q.left >= -0.5 && q.right <= vw + 0.5 };
      });
      if (r.k > 0 && r.k + 1 < r.n && r.pw !== undefined && r.sz && r.sz[0].w === 210 && r.sz[1].w === 210 && Math.abs(r.vw - 432) > 0.6) bad.push(`gap ${JSON.stringify(r)}`);
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
      /* 0.16.1: a figure chapter may hold two figures, so it can be taller than wide; "wide" = wider than the portrait page column */ const out = segs.map((e) => { const q = e.getBoundingClientRect(); const prev = e.previousElementSibling?.getBoundingClientRect(); return { cx: q.left + q.width / 2 - (mr.left + mr.width / 2), wide: q.width > mr.width + 1, overlapPrev: prev ? prev.bottom - q.top > 1 && prev.height > 0 : false }; });
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
    // the page count is the PDF's too (tests/pages-0160.test.mjs measures it on every sample); the turned sheets come in the same order
    const runs = (x) => x.replace(/(.)\1+/g, '$1');
    check(`${label}: the PDF's turned sheets come in the view in the same order (pdf ${want} / view ${got})`, runs(want) === runs(got) && want.split('L').length === got.split('L').length, `pdf ${want} / view ${got}`);
    check(`${label}: the view has the PDF's page count and no note that they may differ (pdf ${want.length} / view ${got.length})`, want.length === got.length && !(await page.evaluate(() => window.BW.S.viewsNoted)), `pdf ${want} / view ${got}`);
    // the page drawer's thumbnails and the print preview are the printed pages themselves: the same pages, each in its own orientation
    const th = (await pageThumbs(doc, { locale: ed, theme: loadTheme() })).map((x) => (x.wide ? 'L' : 'P')).join('');
    check(`${label}: the page drawer and print preview show the PDF's pages in the PDF's orientation (${th})`, th === want && th.includes('L') && th.includes('P'), `thumbs ${th} / pdf ${want}`);
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
    await page.evaluate(() => window.BW.commit([{ op: 'replace', path: '/overlays', value: [{ id: 'tb-a', kind: 'text', text: 'PLACEHOLDER A', x: 40, y: 150, w: 50, h: 20 }, { id: 'tb-b', kind: 'text', text: 'PLACEHOLDER B', mode: 'anchor', anchor: '/chapters/3/sections/0/blocks/0', x: 30, y: 10, w: 50, h: 20 }], old: [] }]));
    await page.evaluate(() => window.BW.runAction('view.single'));
    await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view'));
    const mixedOv = (await onSheets()).ovs;
    await page.evaluate(() => window.BW.runAction('view.continuous'));
    await turn('/chapters/1/sections/0/blocks/0');
    await page.evaluate(() => window.BW.runAction('view.single'));
    await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view'));
    const turnedOv = (await onSheets()).ovs;
    await page.evaluate(() => window.BW.runAction('view.continuous'));
    await undoAll();
    check(`${ed}: free logos, images and text boxes sit in the same place whether or not a page is turned`, mixedOv.length > 0 && mixedOv.length === turnedOv.length && mixedOv.every((o, i) => Math.abs(o[1] - turnedOv[i][1]) < 0.6 && Math.abs(o[2] - turnedOv[i][2]) < 0.6) && (dir === 'rtl' || mixedOv.every((o) => Math.abs(o[1] - (16 + 30) * 96 / 25.4) < 1.5)), JSON.stringify({ mixedOv, turnedOv }));
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
S.finish();
