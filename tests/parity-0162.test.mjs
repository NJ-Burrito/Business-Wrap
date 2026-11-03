// 0.16.2 (bw-0162, view lane): owner notes V and P, on a long real-shaped placeholder SRS (no client data).
//
//  V  Every page view (single, spread, continuous) shows each page alone at its own orientation, opened by file://, at zoom 75 to 150 percent.
//     The document is shaped like the owner's screenshot: chapters 1 to 7, a figure chapter 4 (a landscape sheet, no page setting of its own),
//     chapter 5 «new page before this section» (the dashed «فاصل صفحة» line) and chapter 6 with many stories and dictionaries. The cause was
//     `section.bw-brk{break-before:page}`: after the figure box's held empty slot it put chapter 5 into the figure sheet's window.
//  P  A table's label bar, caption and header stay with its first rows: the print (Chrome left a header alone at a page's foot when the first
//     group of rows moved on) and the editor's page views follow one rule, so the page lists agree: same page count, same first words.
//
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/parity-0162.test.mjs
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-parity0162-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  parity-0162: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const FX = (f) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', f);

// ── the document: a generated placeholder SRS, made long and given the owner's page break before chapter 5 ──────────────────────────────
const built = await buildDocuments({ pack: 'e-service', profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: FX('garden.record.json'), today: '2026-11-03' });
function longDoc(src, ed) {
  const d = JSON.parse(JSON.stringify(src));
  const ch = (n) => d.chapters.find((c) => String(c.number) === String(n));
  const ar = ed === 'ar';
  const base = ch(6).sections;
  const out = [];
  let k = 0;
  for (let r = 0; r < 3; r += 1) for (const s of base) {
    if (r > 0 && !s.blocks.some((b) => b.kind === 'stories')) continue;
    const c = JSON.parse(JSON.stringify(s));
    k += 1;
    c.number = `6.${k}`;
    for (const b of c.blocks) {
      if (b.number) b.number = c.number;
      if (b.kind !== 'stories') continue;
      for (const it of b.items) {
        it.id = `US-${String(k).padStart(2, '0')}`;
        // a dictionary whose first rows are tall: the first group of rows does not fit the room a page's foot leaves
        const cols = ar ? ['اسم الحقل', 'النوع', 'إجبارية الحقل', 'القيمة الافتراضية', 'قيود الحقل'] : ['Field name', 'Type', 'Required', 'Default value', 'Field limits'];
        const long = ar ? 'نص يصف الحقل ويشرح قيوده وكيفية عرضه للمستخدم في هذه المرحلة من الخدمة وما يظهر له بعد الحفظ ' : 'Text that describes the field, its limits and how it shows to the user at this stage of the service and after saving ';
        it.dictionary = { columns: cols, rows: Array.from({ length: 7 }, (_, i) => [`F${k}-${i}`, ar ? 'نص' : 'Text', ar ? 'لا' : 'No', ar ? 'لا يوجد' : 'None', long.repeat(i < 3 ? 3 : 1).trim()]) };
      }
    }
    out.push(c);
  }
  ch(6).sections = out;
  const rules = ch(5).sections[0].blocks[0];
  const orig = rules.rows.slice();
  for (let i = 0; i < 2; i += 1) for (const row of orig) rules.rows.push([`BR-${String(rules.rows.length + 1).padStart(2, '0')}`, ...row.slice(1)]);
  ch(5).layout = { breakBefore: true }; // «صفحة جديدة قبل هذا القسم»: the dashed «فاصل صفحة» line before chapter 5
  return d;
}
const docs = { ar: longDoc(built.docs.ar, 'ar'), en: longDoc(built.docs.en, 'en') };
const dir = path.join(tmp, 'doc');
fs.mkdirSync(dir, { recursive: true });
for (const ed of ['ar', 'en']) fs.writeFileSync(path.join(dir, `document.${ed}.json`), JSON.stringify(docs[ed]));
check('the document is shaped like the owner\'s: chapters 1 to 7, a figure chapter 4, a break before chapter 5 (positive sample)',
  docs.ar.chapters.length >= 7 && docs.ar.chapters.some((c) => c.sections.some((s) => s.blocks.some((b) => b.kind === 'diagram'))) && docs.ar.chapters[4].layout?.breakBefore === true);

// ── the PDFs: pages with their first lines; headers and labels alone at a page's foot ────────────────────────────────────────────────────
fs.writeFileSync(path.join(tmp, 'pages.py'), `import pymupdf, sys, json
d = pymupdf.open(sys.argv[1]); out = []
for p in d:
    top = pymupdf.Rect(0, 18 * 72 / 25.4, p.rect.width, p.rect.height - 16 * 72 / 25.4)
    ls = [x.strip() for x in p.get_text("text", clip=top).splitlines() if x.strip()]
    out.append({"wide": p.rect.width > p.rect.height, "lines": ls})
sys.stdout.write(json.dumps(out, ensure_ascii=False))
`);
const browser = await chromium.launch(launchOptions());
const pdf = {};
try {
  for (const ed of ['ar', 'en']) {
    const file = path.join(tmp, `${ed}.pdf`);
    await exportPdf(docs[ed], { locale: ed, theme, pdfPath: file, browser });
    const r = spawnSync(...py([path.join(tmp, 'pages.py'), file]), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } });
    pdf[ed] = JSON.parse(r.stdout);
    // the strings of every label bar, caption and header of the stories' tables, from the print markup itself
    const { html } = printHtml(docs[ed], { locale: ed, theme, embed: false });
    const pg = await browser.newPage();
    await pg.setContent(html);
    const heads = await pg.evaluate(() => [...document.querySelectorAll('.story th, p.run-in, caption')].map((e) => e.textContent.trim()).filter((x) => x && x.length < 60));
    await pg.close();
    pdf[ed].heads = new Set(heads);
    pdf[ed].allHeads = new Set(await (async () => { const p2 = await browser.newPage(); await p2.setContent(html); const h = await p2.evaluate(() => [...document.querySelectorAll('th')].map((e) => e.textContent.trim())); await p2.close(); return h; })());
    const alone = pdf[ed].map((p, i) => [i + 1, p.lines.at(-1)]).filter(([, l]) => l && pdf[ed].heads.has(l));
    check(`${ed}: ${pdf[ed].length} PDF pages, none ends on a table header or label bar with no row under it`, pdf[ed].length > 30 && alone.length === 0, JSON.stringify(alone.slice(0, 3)));
    check(`${ed}: the document has a landscape page (the figure chapter) among the portrait ones (positive sample)`, pdf[ed].some((p) => p.wide) && pdf[ed].some((p) => !p.wide));
  }

  // ── the editor over file:// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [dir], out: editor, set: 'parity-0162', watermarkDir: null, ui: 'ar' });
  const open = async (ed, mode, zoom, vp = { width: 1600, height: 900 }) => {
    const page = await (await browser.newContext({ viewport: vp })).newPage();
    page.on('pageerror', (e) => { console.log('pageerror', e.message); failed += 1; });
    await page.goto(pathToFileURL(editor).href);
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(([e, z]) => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); if (B.S.ed !== e) { B.S.ed = e; B.render(); } B.S.zoom = z; }, [ed, zoom]);
    await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
    if (mode !== 'continuous') {
      await page.evaluate((m) => window.BW.runAction('view.' + m), mode);
      await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
    }
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(400);
    return page;
  };
  /** Every line of text, picture and drawing rect of the edition, with the page it stands on and whether it lies on that page's sheet. */
  const layout = (page) => page.evaluate(() => {
    const B = window.BW;
    const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${B.S.ed}"]`);
    const mr = main.getBoundingClientRect();
    const z = parseFloat(getComputedStyle(main.parentElement).zoom) || 1;
    const rtl = main.dir === 'rtl';
    const mm = 96 / 25.4;
    const tab = B.S.pageTab;
    const sheets = [...main.querySelectorAll('.bw-sheet')].map((e) => e.getBoundingClientRect());
    const pageOf = (q) => { const off = ((rtl ? mr.right - q.right : q.left - mr.left) / z) / mm + 0.5; let k = 0; for (let i = 0; i < tab.length; i += 1) if (tab[i].x <= off) k = i; return k; };
    const off = [];
    const words = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('.bw-runs,.bw-sheets,script,style,template') || !n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        if (!q.width || !q.height) continue;
        if (!sheets.some((r) => q.left >= r.left - 2 && q.right <= r.right + 2 && q.top >= r.top - 2 && q.bottom <= r.bottom + 2)) off.push(`${el.tagName}.${el.className} "${n.textContent.trim().slice(0, 20)}"`);
        words.push({ k: pageOf(q), y: (q.top - mr.top) / z, x: rtl ? -q.right : q.left, t: n.textContent.trim(), thead: !!el.closest('thead') });
      }
    }
    // a table's header must stand on the page of its first row
    const alone = [];
    for (const tb of main.querySelectorAll('table')) {
      const th = tb.querySelector(':scope > thead'); const row = tb.querySelector(':scope > tbody > tr');
      if (!th || !row || tb.closest('.bw-runs')) continue;
      if (pageOf(th.getBoundingClientRect()) !== pageOf(row.getBoundingClientRect())) alone.push(th.textContent.trim().slice(0, 24));
    }
    return { n: B.S.pageN, tab: tab.map((s) => (s.w > s.h ? 'L' : 'P')).join(''), off, offN: off.length, words, alone, brk: main.querySelectorAll('section.bw-brk').length, mixed: sheets.length > 0 };
  });
  /** The window of the shown page (single) or book (spread): the sheets it touches. */
  const windowProbe = (page) => page.evaluate(() => {
    const B = window.BW;
    const view = document.querySelector('#bw-pair .bw-view');
    const r = view.getBoundingClientRect();
    const main = view.querySelector('main.bw-doc');
    const touch = (q) => Math.min(q.right, r.right) - Math.max(q.left, r.left) > 1 && Math.min(q.bottom, r.bottom) - Math.max(q.top, r.top) > 1;
    const sheets = [...main.querySelectorAll('.bw-sheet')];
    const shown = sheets.filter((s) => touch(s.getBoundingClientRect())).map((s) => +s.dataset.page);
    // a line of text that shows in the window but stands on a sheet the window does not show
    const stray = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('.bw-runs,.bw-sheets') || !n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        if (!q.width || !q.height || !touch(q)) continue;
        if (!sheets.some((s) => { const t = s.getBoundingClientRect(); return touch(t) && q.left >= t.left - 2 && q.right <= t.right + 2 && q.top >= t.top - 2 && q.bottom <= t.bottom + 2; })) stray.push(`${el.tagName} "${n.textContent.trim().slice(0, 20)}"`);
      }
    }
    return { k: B.S.pageAt, n: B.S.pageN, shown, stray, sz: (B.S.pageSizes || [])[B.S.pageAt] || {}, w: r.width / (parseFloat(getComputedStyle(view).zoom) || 1) / (96 / 25.4) };
  });

  // V: every page of the single view, then every spread, alone and whole, and the continuous sheet
  const walk = async (ed, mode, zoom) => {
    const page = await open(ed, mode, zoom);
    if (mode === 'continuous') { // the long sheet: the landscape chapter overlaps nothing, the following chapters are not drawn into it
      const c = await page.evaluate(() => {
        const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${window.BW.S.ed}"]`);
        const wide = main.querySelector('section.chapter.wide');
        const wr = wide.getBoundingClientRect();
        const over = [];
        for (const e of main.querySelectorAll('section.chapter:not(.wide) :is(h2,p,li,td,th)')) {
          const q = e.getBoundingClientRect();
          if (q.width && q.height && Math.min(q.right, wr.right) - Math.max(q.left, wr.left) > 1 && Math.min(q.bottom, wr.bottom) - Math.max(q.top, wr.top) > 1) over.push(e.tagName);
        }
        return { over: over.length, w: wr.width, h: wr.height };
      });
      check(`${ed} continuous zoom ${zoom}: the landscape chapter overlaps no other chapter's text`, c.over === 0 && c.w > c.h * 0.5, JSON.stringify(c));
      await page.context().close();
      return null;
    }
    const L = await layout(page);
    check(`${ed} ${mode} zoom ${zoom}: the paged layout holds the figure sheet and the break before chapter 5 (${L.n} pages, ${L.tab})`, L.mixed && L.brk >= 1 && L.tab.includes('L') && L.tab.includes('P'));
    check(`${ed} ${mode} zoom ${zoom}: no line of text lies off its sheet (chapter 5 and 6 are not drawn inside the figure sheet)`, L.offN === 0, L.off.slice(0, 3).join(' | '));
    if (mode !== 'continuous') {
      const next = ed === 'ar' ? 'ArrowLeft' : 'ArrowRight';
      await page.mouse.move(700, 450);
      await page.evaluate(() => document.activeElement?.blur?.());
      await page.keyboard.press('Home');
      const bad = [];
      let sawL = false;
      for (let i = 0; i < 90; i += 1) {
        const p = await windowProbe(page);
        if (p.sz.w > p.sz.h) sawL = true;
        const want = mode === 'single' ? [p.k] : (p.k === 0 ? [0] : [p.k, p.k + 1].filter((x) => x < p.n));
        if (p.stray.length || (mode === 'single' && (p.shown.length !== 1 || p.shown[0] !== p.k)) || (mode === 'spread' && !want.every((x) => p.shown.includes(x)) && p.k > 0) || p.shown.some((x) => !want.includes(x) && mode === 'single')) bad.push(JSON.stringify(p));
        const before = p.k;
        await page.keyboard.press(next);
        await page.waitForTimeout(30);
        const after = (await windowProbe(page)).k;
        if (after === before) break;
      }
      check(`${ed} ${mode} zoom ${zoom}: every ${mode === 'single' ? 'page' : 'spread'} shows only its own sheet${mode === 'single' ? ' at its own size' : 's'}, nothing of another page inside the window; a landscape page was shown`, bad.length === 0 && sawL, bad.slice(0, 2).join(' | '));
    }
    await page.context().close();
    return L;
  };
  for (const [ed, mode, zoom] of [['ar', 'single', 0.85], ['ar', 'single', 1.5], ['ar', 'spread', 1], ['ar', 'continuous', 0.75], ['en', 'single', 1], ['en', 'spread', 0.75]]) {
    await walk(ed, mode, zoom);
  }

  // the check is live: the old rule (a page break before chapter 5) brings the fault back
  {
    const page = await open('ar', 'single', 1);
    await page.addStyleTag({ content: '#bw-pair .bw-view main.bw-doc section.chapter.bw-brk{break-before:page !important}' });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.evaluate(() => { const B = window.BW; B.render(); });
    await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
    await page.waitForTimeout(400);
    const L = await layout(page);
    check('control: with the old `break-before: page` on chapter 5 the same check finds text off its sheet (the check is live)', L.offN > 0, `off=${L.offN}`);
    await page.context().close();
  }

  // P: the page list. Editor against PDF, AR and EN, single view
  const norm = (w) => [...String(w).normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').toLowerCase()].filter((c) => /[\p{L}\p{N}]/u.test(c)).sort().join('');
  const toks = (s) => String(s).split(/\s+/).map(norm).filter(Boolean);
  for (const ed of ['ar', 'en']) {
    const page = await open(ed, 'single', 1);
    const L = await layout(page);
    const pdfTab = pdf[ed].map((p) => (p.wide ? 'L' : 'P')).join('');
    check(`${ed}: the editor has the PDF's pages: ${L.n} against ${pdf[ed].length}, the same orientation on each page`, L.n === pdf[ed].length && L.tab === pdfTab, `${L.tab} / ${pdfTab}`);
    check(`${ed}: no table header stands apart from its first row in the editor's pages`, L.alone.length === 0, L.alone.slice(0, 3).join(' | '));
    // first words of each page: the first line of text of the page in reading order, against the first lines of the PDF page (a header the PDF
    // repeats at the top of a continued table is not a first word; the editor's page has no repeated header)
    const letters = (x) => [...String(x).normalize('NFKC').replace(/[ً-ٰٟـ]/g, '').toLowerCase()].filter((c) => /\p{L}/u.test(c)).join('');
    const heads = pdf[ed].allHeads;
    const first = new Map();
    for (const w of L.words) { if (w.thead) continue; const f = first.get(w.k); if (!f || w.y < f.y - 3) first.set(w.k, { y: w.y, ws: [w] }); else if (Math.abs(w.y - f.y) <= 3) f.ws.push(w); }
    const diff = [];
    for (let k = 1; k < pdf[ed].length; k += 1) {
      const line = (first.get(k)?.ws || []).sort((p, q) => p.x - q.x).map((w) => w.t).join(' ');
      const e = line.split(/\s+/).map(letters).filter((t) => t.length >= 3).slice(0, 3);
      const body = pdf[ed][k].lines.filter((l) => !heads.has(l)).slice(0, 10).map(letters).join('');
      if (!(e.length && e.filter((t) => body.includes(t)).length >= Math.min(2, e.length))) diff.push(`p${k + 1} editor «${line.slice(0, 30)}» pdf «${pdf[ed][k].lines.slice(0, 2).join(' | ').slice(0, 40)}»`);
    }
    check(`${ed}: the first words of every page are the same in the editor and in the PDF`, diff.length === 0, `${diff.length} differ: ${diff.slice(0, 3).join(' ;; ')}`);
    await page.context().close();
  }
} finally {
  await browser.close();
}
if (failed) { console.log(`\nparity-0162: ${failed} failed`); process.exit(1); }
console.log('\nparity-0162: all passed');
