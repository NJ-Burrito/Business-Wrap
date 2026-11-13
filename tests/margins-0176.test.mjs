// (bw176, margins lane): per-document page margins (doc.layout.margins = {top, bottom, start, end} in mm).
//  M1  The setting: limits, defaults, a document without it prints byte-identical (no margin CSS at all).
//  M2  The editor: EXT.margins.get/set, live (no record) and recorded (one undoable edit), the 'bw:margins' event, undo, redo, the saved document reloads with it.
//  M3  The PDF honours it: @page margins, and the editor's paged view starts every page on the same block as the PDF (custom margins, Arabic).
//  M4  The DOCX writes w:pgMar from it (physical left/right: an Arabic page's start margin is the right one).
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/margins-0176.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { renderDocument, documentCss, docSheet, marginsOf, pageGeom, hasPageGeom, MARGIN_DEFAULT } from '../engine/render.mjs';
import { py } from '../engine/py.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-margins0176-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  margins-0176: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const blank = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const CUSTOM = { top: 30, bottom: 25, start: 28, end: 20 };
const paraDoc = (margins, n = 70) => {
  const d = clone(blank);
  const blocks = Array.from({ length: n }, (_, i) => ({ kind: 'prose', paragraphs: [`فقرة K${i + 1}K نص تجريبي قصير لاختبار التقسيم.`] }));
  d.chapters = [{ number: '1', title: 'اختبار الهوامش', sections: [{ number: '1.1', title: 'فقرات تجريبية', blocks }] }];
  if (margins) d.layout = { ...(d.layout || {}), margins };
  return d;
};

// ── M1 the setting ───────────────────────────────────────────────────────────
{
  check('no setting: marginsOf is null and the page geometry is today\'s', marginsOf(blank) === null && !hasPageGeom(blank));
  const g = pageGeom(paraDoc(null));
  check('today\'s geometry: 297 less 18 and 16 high, 210 less 16 and 16 wide', g.contentPx === Math.round(((297 - 34) / 25.4) * 96) && g.measurePx === Math.round(((210 - 32) / 25.4) * 96));
  const lim = marginsOf({ layout: { margins: { top: 1, bottom: 99, start: 2, end: 'x' } } });
  check('limits: sides 5 to 50, top and bottom 10 to 50, a non-number falls back to today\'s', lim.top === 10 && lim.bottom === 50 && lim.start === 5 && lim.end === MARGIN_DEFAULT.end, JSON.stringify(lim));
  const plain = paraDoc(null);
  const withM = paraDoc(CUSTOM);
  const cssPlain = documentCss(theme, docSheet(plain), plain);
  const cssWith = documentCss(theme, docSheet(withM), withM);
  check('positive sample: the setting writes @page margins and the side vars', /@page\{margin:30mm 0 25mm\}/.test(cssWith) && /--pm-start:28mm/.test(cssWith) && /--pm-end:20mm/.test(cssWith));
  check('a document without the setting has no margin CSS at all (byte-identical)', !/--pm-/.test(cssPlain) && (cssPlain.match(/@page\{size:A4 portrait;margin:18mm 0 16mm/g) || []).length === 1);
  const stripped = clone(withM); delete stripped.layout.margins;
  check('removing the setting restores the very same CSS', documentCss(theme, docSheet(stripped), stripped) === cssPlain);
  check('the same document renders to the same HTML with and without an empty layout object', renderDocument(plain, { locale: 'ar', theme }) === renderDocument({ ...clone(plain), layout: {} }, { locale: 'ar', theme }));
}

const browser = await chromium.launch(launchOptions());
let seq = 0;
const window_has = (f) => !!f && f.presets.join() === 'normal,narrow,wide';
async function openEditor(doc, [vw, vh] = [1600, 900]) {
  const dir = path.join(tmp, `d${(seq += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'document.ar.json'), JSON.stringify(doc));
  const file = path.join(dir, 'ed.html');
  buildEditor({ inputs: [dir], out: file, set: 'margins-0176', watermarkDir: null, ui: 'ar' });
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed += 1; });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = 'ar'; B.render(); B.S.zoom = 1; });
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  return { ctx, page, dir };
}

try {
  // ── M2 the editor ──────────────────────────────────────────────────────────
  {
    const { ctx, page, dir } = await openEditor(paraDoc(null, 8));
    const st = () => page.evaluate(() => { const B = window.BW; return { ops: B.M[B.S.svc][B.S.ed].ops.length, doc: JSON.parse(JSON.stringify(B.M[B.S.svc][B.S.ed].doc.layout || null)), got: B.EXT.margins.get() }; });
    await page.evaluate(() => { window.__ev = []; document.addEventListener('bw:margins', (e) => window.__ev.push(e.detail)); });
    const s0 = await st();
    check('EXT.margins exists and get() is today\'s margins', s0.got.top === 18 && s0.got.bottom === 16 && s0.got.start === 16 && s0.got.end === 16, JSON.stringify(s0.got));
    await page.evaluate(() => window.BW.EXT.margins.set({ start: 24, top: 99 }, { live: true }));
    const s1 = await st();
    const padL = await page.evaluate(() => { const w = document.querySelector('#bw-pair main.bw-doc .wrap'); const c = getComputedStyle(w); return [c.paddingLeft, c.paddingRight]; });
    check('live: the page shows it at once (RTL: start is the right side, 24 mm) and the top is clamped to 50', s1.got.start === 24 && s1.got.top === 50 && Math.abs(parseFloat(padL[1]) - 24 * 96 / 25.4) < 0.5, JSON.stringify([s1.got, padL]));
    check('live: nothing is recorded and the document is unchanged', s1.ops === s0.ops && s1.doc === null, JSON.stringify([s0.ops, s1.ops, s1.doc]));
    await page.evaluate(() => window.BW.EXT.margins.set({ start: 24, top: 22 }, { live: false }));
    const s2 = await st();
    check('recorded: ONE edit, in doc.layout.margins, both rules of the limits held', s2.ops === s0.ops + 1 && s2.doc?.margins?.start === 24 && s2.doc.margins.top === 22 && s2.doc.margins.end === 16, JSON.stringify(s2));
    const cssNow = await page.evaluate(() => document.getElementById('bw-doc-css').textContent);
    check('recorded: the page CSS carries it after the re-render', /--pm-start:24mm/.test(cssNow) && /@page\{margin:22mm 0 16mm\}/.test(cssNow));
    const ev = await page.evaluate(() => window.__ev);
    check('the bw:margins event fired on every change (live step, then the record)', ev.length >= 2 && ev[0].live === true && ev.at(-1).live === false && ev.at(-1).start === 24, JSON.stringify(ev));
    await page.evaluate(() => window.BW.runAction('undo'));
    const s3 = await st();
    check('undo: back to today\'s margins and the event says so', s3.doc === null && s3.got.start === 16 && s3.got.top === 18 && s3.ops === s0.ops, JSON.stringify(s3));
    const ev2 = await page.evaluate(() => window.__ev.at(-1));
    check('undo announced the margins', ev2.start === 16 && ev2.top === 18 && ev2.live === false, JSON.stringify(ev2));
    await page.evaluate(() => window.BW.runAction('redo'));
    const s4 = await st();
    check('redo: the margins come back', s4.got.start === 24 && s4.got.top === 22, JSON.stringify(s4.got));
    await page.evaluate(() => window.BW.EXT.margins.set({ top: 18, start: 16 }, { live: false }));
    const s5 = await st();
    check('setting it back to today\'s removes the key (the document is as before)', s5.doc === null || !s5.doc.margins, JSON.stringify(s5.doc));
    // the Layout tab's control and the preset drawer
    await page.evaluate(() => window.BW.runAction('margins'));
    const fields = await page.waitForFunction(() => {
      const find = (root) => { const f = root.querySelector('[data-w2m="top"]'); if (f) return f; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) { const r = find(e.shadowRoot); if (r) return r; } return null; };
      const f = find(document);
      return f ? { top: f.value, presets: [...f.getRootNode().querySelectorAll('[data-w2mp]')].map((x) => x.dataset.w2mp) } : null;
    }).then((h) => h.jsonValue());
    check('the «margins» command opens the drawer: four fields and the Normal, Narrow and Wide presets', window_has(fields) , JSON.stringify(fields));
    const wasIn = await page.evaluate(() => { const find = (root) => { const f = root.querySelector('[data-w2mp="narrow"]'); if (f) return f; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) { const r = find(e.shadowRoot); if (r) return r; } return null; }; find(document).click(); return window.BW.EXT.margins.get(); });
    check('the Narrow preset records the margins in one click', wasIn.top === 12 && wasIn.start === 10, JSON.stringify(wasIn));
    await page.evaluate(() => window.BW.runAction('undo'));
    check('...and one undo takes it back', (await st()).got.top === 18);
    // reload: the saved document (the editor's current document) opens with its margins
    await page.evaluate(() => window.BW.EXT.margins.set({ top: 20, bottom: 14, start: 12, end: 30 }, { live: false }));
    const saved = await page.evaluate(() => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc)));
    await ctx.close();
    const again = await openEditor(saved);
    const got = await again.page.evaluate(() => window.BW.EXT.margins.get());
    check('reload: a saved document opens with its margins (20, 14, 12, 30)', got.top === 20 && got.bottom === 14 && got.start === 12 && got.end === 30, JSON.stringify(got));
    await again.ctx.close();
  }

  // ── M3 editor against PDF, custom margins ──────────────────────────────────
  {
    fs.writeFileSync(path.join(tmp, 'words.py'), 'import sys, pymupdf\nfor n, p in enumerate(pymupdf.open(sys.argv[1]), 1):\n    for w in p.get_text("words"):\n        print(f"{n}\\t{w[4]}")\n');
    const pdfGroups = async (doc, label) => {
      const file = path.join(tmp, `${label}.pdf`);
      await exportPdf(doc, { locale: 'ar', theme, pdfPath: file, browser });
      const out = spawnSync(...py([path.join(tmp, 'words.py'), file]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' }, maxBuffer: 1e8 }).stdout;
      const by = [];
      for (const l of out.split(/\r?\n/)) { const [p, w] = l.split('\t'); const m = /^K(\d+)K$/.exec(w || ''); if (m) (by[+p] ??= []).push(+m[1]); }
      return by.filter(Boolean).map((a) => a.sort((x, y) => x - y));
    };
    const edGroups = async (doc) => {
      const { ctx, page } = await openEditor(doc);
      await page.evaluate(() => window.BW.runAction('view.single'));
      await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const main = document.querySelector('#bw-pair .bw-view > *');
        const z = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz'));
        const mr = main.getBoundingClientRect(); const t = window.BW.S.pageTab;
        return [...main.querySelectorAll('p')].filter((e) => !e.closest('.bw-rpts,.bw-runs,.bw-sheets,.bw-slot') && /K[0-9]+K/.test(e.textContent)).map((e) => {
          const q = e.getBoundingClientRect(); const c = (q.left + q.right) / 2;
          const m = ((main.dir === 'rtl' ? mr.right - c : c - mr.left) / z) / (96 / 25.4);
          let pg = 0; for (let i = 0; i < t.length; i += 1) if (t[i].x <= m + 0.3) pg = i;
          return { pg, k: +/K(\d+)K/.exec(e.textContent)[1] };
        });
      });
      await ctx.close();
      const by = []; r.forEach((x) => { (by[x.pg] ??= []).push(x.k); });
      return by.filter(Boolean).map((a) => a.sort((x, y) => x - y));
    };
    const sig = (g) => g.map((a) => `${a[0]}-${a.at(-1)}(${a.length})`).join(' ');
    const base = await pdfGroups(paraDoc(null), 'plain');
    const pdf = await pdfGroups(paraDoc(CUSTOM), 'custom');
    const ed = await edGroups(paraDoc(CUSTOM));
    check('positive sample: the margins change the PDF\'s pages (more pages than the plain margins)', pdf.length > base.length, `${pdf.length} vs ${base.length}`);
    check('the editor\'s pages hold the PDF\'s paragraphs, page by page, with custom margins', sig(ed) === sig(pdf), `editor ${sig(ed)} | pdf ${sig(pdf)}`);
    const wide = { top: 12, bottom: 12, start: 8, end: 8 };
    const pdf2 = await pdfGroups(paraDoc(wide), 'narrow');
    const ed2 = await edGroups(paraDoc(wide));
    check('narrow margins: a page holds more paragraphs than the plain one, and the editor agrees with the PDF page by page', pdf2[1].length > base[1].length && sig(ed2) === sig(pdf2), `editor ${sig(ed2)} | pdf ${sig(pdf2)} | plain ${base.length}`);
    // the text block's edges in the PDF: the first K mark lies inside the margins
    fs.writeFileSync(path.join(tmp, 'box.py'), 'import sys, pymupdf\np = pymupdf.open(sys.argv[1])[1]\nmm = 25.4 / 72\nws = [w for w in p.get_text("words") if 22 < w[1] * mm and w[3] * mm < (p.rect.height * mm - 20)]\nprint(round(min(w[0] for w in ws) * mm, 1), round((p.rect.width - max(w[2] for w in ws)) * mm, 1), round(min(w[1] for w in ws) * mm, 1), round((p.rect.height - max(w[3] for w in ws)) * mm, 1))\n');
    const box = spawnSync(...py([path.join(tmp, 'box.py'), path.join(tmp, 'custom.pdf')]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout.trim().split(/\s+/).map(Number);
    // Arabic page: start = right (28 mm), end = left (20 mm); the body text starts at the right margin and stays below the top margin
    check('the PDF text block sits on the margins: right edge 28 mm (the start side), first line at 30 mm or lower, foot above 25 mm', box[1] >= 27.5 && box[1] <= 29.5 && box[2] >= 29.5 && box[3] >= 24.5, JSON.stringify(box));
  }

  // ── M4 the DOCX ────────────────────────────────────────────────────────────
  {
    fs.writeFileSync(path.join(tmp, 'pgmar.py'), 'import sys, re, zipfile\nx = zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8")\nfor m in re.findall(r"<w:pgMar[^>]*>", x): print(m)\n');
    const mar = (file) => spawnSync(...py([path.join(tmp, 'pgmar.py'), file]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout.trim().split(/\r?\n/).filter(Boolean);
    const tw = (mm) => Math.round((mm / 25.4) * 1440);
    const attr = (s, k) => +new RegExp(`w:${k}="(-?\\d+)"`).exec(s)[1];
    const fa = path.join(tmp, 'm-ar.docx');
    exportDocx(paraDoc(CUSTOM, 5), { locale: 'ar', theme, docxPath: fa, embedFonts: false });
    const a = mar(fa).filter((s) => attr(s, 'top') > 0).at(-1); // the body section (python-docx keeps it last); the cover's are 0
    check('DOCX pgMar (Arabic): top 30, bottom 25 mm; left = end 20, right = start 28', a && Math.abs(attr(a, 'top') - tw(30)) <= 2 && Math.abs(attr(a, 'bottom') - tw(25)) <= 2 && Math.abs(attr(a, 'left') - tw(20)) <= 2 && Math.abs(attr(a, 'right') - tw(28)) <= 2, a);
    const docEn = paraDoc(CUSTOM, 5);
    const fe = path.join(tmp, 'm-en.docx');
    const en = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.en.json'), 'utf8'));
    en.chapters = docEn.chapters; en.layout = { ...(en.layout || {}), margins: CUSTOM };
    exportDocx(en, { locale: 'en', theme, docxPath: fe, embedFonts: false });
    const b = mar(fe).filter((s) => attr(s, 'top') > 0).at(-1);
    check('DOCX pgMar (English): left = start 28, right = end 20', b && Math.abs(attr(b, 'left') - tw(28)) <= 2 && Math.abs(attr(b, 'right') - tw(20)) <= 2, b);
    const fp = path.join(tmp, 'plain.docx');
    exportDocx(paraDoc(null, 5), { locale: 'ar', theme, docxPath: fp, embedFonts: false });
    const c = mar(fp).filter((s) => attr(s, 'top') > 0).at(-1);
    check('DOCX without the setting keeps today\'s pgMar (0.7 in, 0.63 in, 0.55 in)', c && attr(c, 'top') === 1008 && attr(c, 'bottom') === 907 && attr(c, 'left') === 792 && attr(c, 'right') === 792, c);
  }
} finally {
  await browser.close();
}
if (failed) { console.log(`\nmargins-0176: ${failed} failed`); process.exit(1); }
console.log('\nmargins-0176: all passed');
