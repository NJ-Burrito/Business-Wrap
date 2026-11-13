// 0.17.7 (bw177, tabs lane): Word-style TAB STOPS on the ruler.
//  - a selector at the ruler's corner (start, center, end, decimal); a click on the ruler adds a stop, a drag moves it, a drag off the ruler removes it,
//    the arrows move a focused stop and Delete removes it: each change is ONE undoable edit, stored as style.tabs [{pos mm, align}], mirrored in Arabic;
//  - Word's default grid (every 1.27 cm) drawn faint past the last stop;
//  - the Tab key in a paragraph with stops inserts a tab drawn to the next stop (editor and PDF); engine/render.mjs tabPass sizes inline-block spans
//    (CSS tab-size only gives equal steps, so it is not used);
//  - DOCX: w:tabs / w:tab val left | center | right | decimal, pos in twips;
//  - a document without tabs prints exactly as before.
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/ruler-tabs-0177.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { docxParts, poppler } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-tabs0177-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ruler-tabs-0177: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const near = (a, b, e = 0.6) => typeof a === 'number' && Math.abs(a - b) <= e;
const blank = (loc) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${loc}.json`), 'utf8'));
const W = { en: ['Begin', 'leftword', 'midword', 'rightword'], ar: ['بداية', 'يسار', 'وسط', 'يمين'] };
const BASE = { en: 'plain', ar: 'عادي' };
const TYPED = { en: ['end', 'z'], ar: ['نهاية', 'ز'] };
const STOPS = [{ pos: 40, align: 'start' }, { pos: 90, align: 'center' }, { pos: 140, align: 'end' }];
const docOf = (loc, paras) => {
  const d = blank(loc);
  d.chapters = [{ number: '1', title: loc === 'ar' ? 'اختبار' : 'Test', sections: [{ number: '1.1', title: loc === 'ar' ? 'فقرات' : 'Paragraphs', blocks: [{ kind: 'prose', paragraphs: paras }] }] }];
  return d;
};
const tabPara = (loc, tabs) => { const w = W[loc]; return { text: w.join('\t'), marks: [], style: tabs ? { tabs } : {} }; };
const P0 = '/chapters/0/sections/0/blocks/0/paragraphs/0';
const dirOf = (loc) => (loc === 'ar' ? -1 : 1);
const optsOf = (loc) => ({ locale: loc, labels: i18n().doc[loc], theme, fontCss: '', logos: theme.logos });

// ── 1. print ──
{
  const strip = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '');
  const plainDoc = docOf('en', ['Begin\tword', 'two']);
  const plain = renderDocument(plainDoc, optsOf('en'));
  check('print HTML: no tabs, no tab markup, no script, no tab CSS (the default prints as before)', !/bw-tab|data-tabs|bwTabs/.test(plain), (plain.match(/.{20}bw-tab.{20}/) || [''])[0]);
  const withTab = renderDocument(docOf('en', [tabPara('en', STOPS)]), optsOf('en'));
  check('print HTML: data-tabs on the paragraph, one span per tab, the page script, the span CSS', /data-tabs="40:start,90:center,140:end"/.test(withTab) && (strip(withTab).match(/class="bw-tab"/g) || []).length === 3 && /id="bw-tabs"/.test(withTab) && /\.bw-tab\{display:inline-block/.test(withTab));
  const bad = renderDocument(docOf('en', [{ text: 'a\tb', marks: [], style: { tabs: [{ pos: 'x', align: 'start' }, { pos: -5, align: 'start' }, { pos: 10, align: 'bogus' }, { pos: 999, align: 'end' }] } }]), optsOf('en'));
  check('print HTML: bad stops (text, negative, unknown kind, out of range) print nothing', !/bw-tab|data-tabs/.test(strip(bad).replace(/<script[\s\S]*?<\/script>/g, '')) && !/id="bw-tabs"/.test(bad));

  // PDF: the words land on the stops, from the start edge (the right in Arabic)
  const bbox = (pdf) => { const x = spawnSync(poppler('pdftotext'), ['-enc', 'UTF-8', '-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout; const o = {}; for (const m of x.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"[^>]*>([^<]+)<\/word>/g)) o[m[3]] = o[[...m[3]].reverse().join('')] = { min: +m[1] / 72 * 25.4, max: +m[2] / 72 * 25.4 }; return o; };
  for (const loc of ['en', 'ar']) {
    const pdf = path.join(tmp, `tabs-${loc}.pdf`);
    await exportPdf(docOf(loc, [tabPara(loc, STOPS)]), { locale: loc, theme, pdfPath: pdf });
    const b = bbox(pdf);
    const [w0, w1, w2, w3] = W[loc].map((w) => b[w]);
    if (!w0 || !w1 || !w2 || !w3) { check(`PDF (${loc}): the four words are found`, false, JSON.stringify(Object.keys(b))); continue; }
    const col = loc === 'ar' ? w0.max : w0.min; // the column's start edge, from the paragraph's first word
    const from = (v) => (loc === 'ar' ? col - v : v - col); // mm from the start edge
    check(`PDF (${loc}): a start stop at 40 mm puts the word's start there`, near(from(loc === 'ar' ? w1.max : w1.min), 40, 0.9), String(from(loc === 'ar' ? w1.max : w1.min)));
    check(`PDF (${loc}): a center stop at 90 mm centres the word on it`, near(from((w2.min + w2.max) / 2), 90, 0.9), String(from((w2.min + w2.max) / 2)));
    check(`PDF (${loc}): an end stop at 140 mm puts the word's end there`, near(from(loc === 'ar' ? w3.min : w3.max), 140, 0.9), String(from(loc === 'ar' ? w3.min : w3.max)));
  }
  // a document without stops: a tab character prints as before (a space), the PDF carries no span
  {
    const pdf = path.join(tmp, 'plain-tab.pdf');
    await exportPdf(plainDoc, { locale: 'en', theme, pdfPath: pdf });
    check('PDF: a tab character without stops prints exactly as before (no tab spans)', !/bw-tab/.test(renderDocument(plainDoc, optsOf('en'))) && fs.statSync(pdf).size > 1000);
  }

  // DOCX
  const tw = (mm) => Math.round(mm * 56.6929);
  for (const loc of ['en', 'ar']) {
    const f = path.join(tmp, `tabs-${loc}.docx`);
    const dd = docOf(loc, [tabPara(loc, [...STOPS, { pos: 180, align: 'decimal' }])]);
    exportDocx(dd, { locale: loc, theme, docxPath: f, embedFonts: false });
    const xml = docxParts(f, /^word\/document\.xml$/)['word/document.xml'];
    const tabs = (xml.match(/<w:tabs>[\s\S]*?<\/w:tabs>/) || [''])[0];
    check(`DOCX (${loc}): w:tabs with left / center / right / decimal and the position in twips`, tabs.includes(`w:val="left" w:pos="${tw(40)}"`) && tabs.includes(`w:val="center" w:pos="${tw(90)}"`) && tabs.includes(`w:val="right" w:pos="${tw(140)}"`) && tabs.includes(`w:val="decimal" w:pos="${tw(180)}"`), tabs);
    check(`DOCX (${loc}): the tab characters are w:tab runs and w:tabs sits before w:ind / w:jc in the paragraph properties`, (xml.match(/<w:tab\/>/g) || []).length >= 3 && !/<w:pPr>[\s\S]*?<w:(spacing|ind|jc|bidi)[\s\S]*?<w:tabs>/.test((xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) || []).find((x) => x.includes('<w:tabs>')) || ''), (xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g) || []).find((x) => x.includes('<w:tabs>')));
  }
  const f0 = path.join(tmp, 'plain.docx');
  exportDocx(plainDoc, { locale: 'en', theme, docxPath: f0, embedFonts: false });
  const x0 = docxParts(f0, /^word\/document\.xml$/)['word/document.xml'];
  check('DOCX: a document without stops has no w:tabs', !/<w:tabs>/.test(x0));
  fs.copyFileSync(path.join(tmp, 'tabs-en.docx'), path.join(tmp, 'keep-en.docx'));
}

// ── 2. the editor ──
const browser = await chromium.launch(launchOptions());
let seq = 0;
async function open(doc, loc, vp = [1500, 900]) {
  const dir = path.join(tmp, `d${(seq += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `document.${loc}.json`), JSON.stringify(doc));
  const file = path.join(dir, 'ed.html');
  buildEditor({ inputs: [dir], out: file, set: 'ruler-tabs-0177', watermarkDir: null, ui: loc });
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate((l) => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = l; B.render(); }, loc);
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  await page.evaluate(() => { const B = window.BW; if (!B.EXT.w2ruler.on) B.runAction('ruler'); });
  await page.waitForSelector('#bw-pair .bw-ruler.bw-ru');
  return { page, ctx, errors, loc };
}
const sel = (page, p = P0) => page.evaluate((p) => { const F = window.BW.EXT.w2format; F.select({ path: p, start: 0, end: 0 }); window.BW.EXT.w2rulerUi.refresh(); }, p);
const leaf = (page, p = P0) => page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return o; }, p);
const nOps = (page) => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
const tabsOfLeaf = async (page) => { const l = await leaf(page); return (l && l.style && l.style.tabs) || []; };
/** The ruler's geometry on screen: where a logical mm from the column start lands. */
const geo = (page) => page.evaluate(() => {
  const el = document.querySelector('#bw-pair .bw-ruler.bw-ru');
  const r = el.getBoundingClientRect();
  const mmPx = (r.width / el.offsetWidth) * (96 / 25.4);
  const rtl = getComputedStyle(el).direction === 'rtl';
  const mg = window.BW.EXT.margins.get();
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, mmPx, rtl, start: mg.start, w: +el.dataset.w };
});
const xAt = (g, pos) => (g.rtl ? g.right - (g.start + pos) * g.mmPx : g.left + (g.start + pos) * g.mmPx);
const yBare = (g) => g.top + 2; // above the lower markers
const stopBox = (page, i) => page.evaluate((i) => { const el = document.querySelector(`#bw-pair .bw-ruler.bw-ru .bw-ru-h.t[data-i="${i}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
const clickKind = async (page, n) => { for (let k = 0; k < n; k += 1) { const b = await page.evaluate(() => { const r = document.querySelector('#bw-pair .bw-ruler.bw-ru .bw-ru-sel').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.click(b.x, b.y); } };
const kindNow = (page) => page.evaluate(() => document.querySelector('#bw-pair .bw-ruler.bw-ru .bw-ru-sel').dataset.kind);
/** Where the text after the nth tab of the paragraph starts / its decimal point is, in mm from the column's start edge. */
const drawn = (page, p = P0) => page.evaluate((p) => {
  const el = document.querySelector(`#bw-pair [data-p="${p}"]`);
  const holder = el.closest('[data-tabs]') || el;
  const rtl = getComputedStyle(holder).direction === 'rtl';
  const r0 = holder.getBoundingClientRect();
  const k = (96 / 25.4) * (r0.width / holder.offsetWidth);
  const ms = (parseFloat(getComputedStyle(holder).marginInlineStart) || 0) * (r0.width / holder.offsetWidth);
  const origin = rtl ? r0.right + ms : r0.left - ms;
  const out = [];
  const spans = [...el.querySelectorAll('.bw-tab')];
  spans.forEach((s, i) => {
    const rg = document.createRange();
    rg.setStartAfter(s);
    if (spans[i + 1]) rg.setEndBefore(spans[i + 1]); else rg.setEnd(el, el.childNodes.length);
    const rs = rg.getBoundingClientRect();
    const a = rtl ? (origin - rs.right) / k : (rs.left - origin) / k; // text start, mm
    const b = rtl ? (origin - rs.left) / k : (rs.right - origin) / k; // text end, mm
    out.push({ start: a, end: b, mid: (a + b) / 2, text: rg.toString(), w: s.getBoundingClientRect().width / k });
  });
  return out;
}, p);

for (const loc of ['ar', 'en']) {
  const T = (n) => `${loc}: ${n}`;
  const r = await open(docOf(loc, [W[loc].join(' '), 'second', 'third']), loc);
  const { page } = r;
  await sel(page);
  const aria = await page.evaluate(() => { const b = document.querySelector('#bw-pair .bw-ruler.bw-ru .bw-ru-sel'); return { label: b?.getAttribute('aria-label'), tag: b?.tagName, tab: b?.tabIndex }; });
  check(T('the tab selector sits on the ruler, a focusable button with a label in the UI language'), aria.tag === 'BUTTON' && aria.tab === 0 && (loc === 'ar' ? /[\u0600-\u06ff]/.test(aria.label) : /^Tab type: Left/.test(aria.label)), JSON.stringify(aria));
  const sb = await page.evaluate(() => { const b = document.querySelector('#bw-pair .bw-ruler.bw-ru .bw-ru-sel').getBoundingClientRect(); const r = document.querySelector('#bw-pair .bw-ruler.bw-ru').getBoundingClientRect(); return { l: b.left - r.left, rr: r.right - b.right }; });
  check(T('the selector is at the ruler\'s START corner (the right in Arabic)'), loc === 'ar' ? sb.rr < 10 && sb.l > 100 : sb.l < 10 && sb.rr > 100, JSON.stringify(sb));
  const defs0 = await page.evaluate(() => [...document.querySelectorAll('#bw-pair .bw-ruler.bw-ru .bw-ru-d')].map((d) => +d.dataset.pos));
  const g = await geo(page);
  const col = g.w - 2 * g.start;
  check(T('the default tab grid (every 1.27 cm) is drawn faint on the ruler'), defs0.length === Math.floor(col / 12.7 + 0.001) && near(defs0[0], 12.7, 0.01) && near(defs0[1], 25.4, 0.01), JSON.stringify(defs0));
  check(T('the default grid is faint'), await page.evaluate(() => +getComputedStyle(document.querySelector('.bw-ru-d')).opacity < 0.5));

  // the selector cycles start -> center -> end -> decimal -> start
  const seen = [await kindNow(page)];
  for (let k = 0; k < 4; k += 1) { await clickKind(page, 1); seen.push(await kindNow(page)); }
  check(T('the selector cycles start, center, end, decimal and back'), seen.join() === 'start,center,end,decimal,start', seen.join());

  // add stops: a click on the ruler, one op each
  let n = await nOps(page);
  await page.mouse.click(xAt(g, 30), yBare(g));
  let tabs = await tabsOfLeaf(page);
  check(T('a click on the ruler adds a start stop at 30 mm in ONE op'), tabs.length === 1 && near(tabs[0].pos, 30, 0.01) && tabs[0].align === 'start' && (await nOps(page)) === n + 1, JSON.stringify(tabs));
  await sel(page);
  await clickKind(page, 1);
  n = await nOps(page);
  await page.mouse.click(xAt(g, 80), yBare(g));
  await sel(page);
  await clickKind(page, 1);
  await page.mouse.click(xAt(g, 130), yBare(g));
  tabs = await tabsOfLeaf(page);
  check(T('center at 80 and end at 130 follow: sorted, three stops'), tabs.length === 3 && near(tabs[0].pos, 30, 0.01) && tabs[1].align === 'center' && near(tabs[1].pos, 80, 0.01) && tabs[2].align === 'end' && near(tabs[2].pos, 130, 0.01), JSON.stringify(tabs));
  await sel(page);
  const hs = await page.evaluate(() => [...document.querySelectorAll('#bw-pair .bw-ruler.bw-ru .bw-ru-h.t')].map((h) => `${h.dataset.align}|${h.getAttribute('role')}|${h.tabIndex}|${h.getAttribute('aria-label')}`));
  check(T('three focusable stop markers with labels in the UI language'), hs.length === 3 && hs.every((x) => x.split('|')[1] === 'slider' && x.split('|')[2] === '0') && (loc === 'ar' ? hs.every((x) => /[\u0600-\u06ff]/.test(x.split('|')[3])) : hs.every((x) => /^Tab stop /.test(x.split('|')[3]))), hs.join(' ; '));
  const defs1 = await page.evaluate(() => [...document.querySelectorAll('#bw-pair .bw-ruler.bw-ru .bw-ru-d')].map((d) => +d.dataset.pos));
  check(T('the default grid starts after the last custom stop (130 mm)'), defs1.length > 0 && defs1.every((v) => v > 130) && near(defs1[0], 139.7, 0.01), JSON.stringify(defs1));

  // drag: 30 -> 45
  n = await nOps(page);
  let b = await stopBox(page, 0);
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  await page.mouse.move(b.x + dirOf(loc) * 7.5 * g.mmPx, b.y, { steps: 3 });
  await page.mouse.move(b.x + dirOf(loc) * 15 * g.mmPx, b.y, { steps: 3 });
  const tip = await page.evaluate(() => { const t = document.querySelector('.bw-ru-tip'); return t && !t.hidden ? t.textContent : null; });
  await page.mouse.up();
  tabs = await tabsOfLeaf(page);
  check(T('dragging a stop 15 mm moves it to 45 mm in ONE op, the tooltip shows cm'), near(tabs[0].pos, 45, 0.01) && tabs.length === 3 && (await nOps(page)) === n + 1 && tip && /4\.50/.test(tip), JSON.stringify(tabs) + ' ' + tip);

  // drag off the ruler removes
  await sel(page);
  n = await nOps(page);
  b = await stopBox(page, 1);
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y + 25, { steps: 3 });
  await page.mouse.move(b.x, b.y + 70, { steps: 3 });
  await page.mouse.up();
  tabs = await tabsOfLeaf(page);
  check(T('dragging a stop off the ruler removes it, in ONE op'), tabs.length === 2 && tabs.every((x) => x.align !== 'center') && (await nOps(page)) === n + 1, JSON.stringify(tabs));
  // a small drag along the ruler does not remove it
  await sel(page);
  n = await nOps(page);
  b = await stopBox(page, 0);
  await page.mouse.move(b.x, b.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y + 3, { steps: 2 });
  await page.mouse.up();
  check(T('a stop pressed and nudged but not moved changes nothing'), (await tabsOfLeaf(page)).length === 2 && (await nOps(page)) === n);

  // undo one change at a time
  await page.evaluate(() => window.BW.undo());
  tabs = await tabsOfLeaf(page);
  check(T('undo brings the removed stop back (45, 80, 130)'), tabs.length === 3 && near(tabs[0].pos, 45, 0.01) && near(tabs[1].pos, 80, 0.01) && near(tabs[2].pos, 130, 0.01), JSON.stringify(tabs));
  await page.evaluate(() => window.BW.undo());
  tabs = await tabsOfLeaf(page);
  check(T('undo takes the move back (30)'), tabs.length === 3 && near(tabs[0].pos, 30, 0.01), JSON.stringify(tabs));
  await page.evaluate(() => window.BW.redo?.());
  await page.evaluate(() => window.BW.redo?.());
  tabs = await tabsOfLeaf(page);
  check(T('redo goes forward again (45, 130)'), tabs.length === 2 && near(tabs[0].pos, 45, 0.01) && near(tabs[1].pos, 130, 0.01), JSON.stringify(tabs));

  // reload
  const saved = await page.evaluate(() => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc][B.S.ed].doc)); });
  const r2 = await open(saved, loc);
  await sel(r2.page);
  const st2 = await tabsOfLeaf(r2.page);
  const marks2 = await r2.page.evaluate(() => [...document.querySelectorAll('#bw-pair .bw-ruler.bw-ru .bw-ru-h.t')].map((h) => +h.dataset.pos));
  check(T('reload: the stops are in the document and the markers sit where they were'), JSON.stringify(st2) === JSON.stringify(tabs) && JSON.stringify(marks2) === JSON.stringify(tabs.map((x) => x.pos)), JSON.stringify(st2) + JSON.stringify(marks2));
  await r2.ctx.close();

  // keyboard on a focused stop
  await sel(page);
  n = await nOps(page);
  await page.focus('#bw-pair .bw-ruler.bw-ru .bw-ru-h.t[data-i="0"]');
  await page.keyboard.press(loc === 'ar' ? 'ArrowLeft' : 'ArrowRight'); // into the page: +2.5 mm
  tabs = await tabsOfLeaf(page);
  check(T('an arrow moves the focused stop 0.25 cm along the screen (Arabic mirrored), ONE op'), near(tabs[0].pos, 47.5, 0.01) && (await nOps(page)) === n + 1, JSON.stringify(tabs));
  await page.waitForTimeout(60);
  const focused = await page.evaluate(() => document.activeElement?.classList.contains('t') && +document.activeElement.dataset.i);
  check(T('focus stays on the stop after it moves'), focused === 0, String(focused));
  await page.waitForFunction(() => document.activeElement?.classList.contains('t'));
  await page.keyboard.press(loc === 'ar' ? 'ArrowRight' : 'ArrowLeft');
  await page.waitForFunction(() => document.activeElement?.classList.contains('t'));
  await page.waitForTimeout(300);
  tabs = await tabsOfLeaf(page);
  check(T('the opposite arrow moves it back'), near(tabs[0].pos, 45, 0.01), JSON.stringify(tabs));
  n = await nOps(page);
  await page.waitForFunction(() => document.activeElement?.classList.contains('t'));
  await page.keyboard.press('Delete');
  tabs = await tabsOfLeaf(page);
  check(T('Delete removes the focused stop, ONE op'), tabs.length === 1 && near(tabs[0].pos, 130, 0.01) && (await nOps(page)) === n + 1, JSON.stringify(tabs));
  await page.evaluate(() => window.BW.undo());
  await r.ctx.close();
  check(T('no page errors'), r.errors.length === 0, r.errors.join(' | '));
}

// ── 3. the Tab key and the drawn alignment, in the editor ──
for (const loc of ['ar', 'en']) {
  const T = (n) => `${loc}: ${n}`;
  const stops = [{ pos: 40, align: 'start' }, { pos: 90, align: 'center' }, { pos: 140, align: 'end' }];
  const doc = docOf(loc, [{ text: W[loc].join('\t'), marks: [], style: { tabs: [...stops, { pos: 170, align: 'decimal' }] } }, BASE[loc]]);
  doc.chapters[0].sections[0].blocks[0].paragraphs.push({ text: 'x\t12.50\t3.75', marks: [], style: { tabs: [{ pos: 60, align: 'decimal' }, { pos: 120, align: 'decimal' }] } });
  const r = await open(doc, loc);
  const { page } = r;
  await page.waitForFunction((p) => document.querySelector(`#bw-pair [data-p="${p}"] .bw-tab`), P0);
  await page.waitForTimeout(200);
  const d = await drawn(page);
  check(T('editor: the start / center / end stops draw the words at 40 / 90 / 140 mm'), d.length === 3 && near(d[0].start, 40, 0.8) && near(d[1].mid, 90, 0.8) && near(d[2].end, 140, 0.8), JSON.stringify(d.map((x) => [x.start, x.mid, x.end].map((v) => Math.round(v * 10) / 10))));
  const P2 = '/chapters/0/sections/0/blocks/0/paragraphs/2';
  const dec = await page.evaluate((p) => {
    const el = document.querySelector(`#bw-pair [data-p="${p}"]`);
    const rtl = getComputedStyle(el).direction === 'rtl';
    const r0 = el.getBoundingClientRect();
    const k = 96 / 25.4;
    const out = [];
    const walker = document.createTreeWalker(el, 4);
    let nd;
    while ((nd = walker.nextNode())) {
      const i = nd.data.indexOf('.');
      if (i < 0) continue;
      const rg = document.createRange(); rg.setStart(nd, i); rg.setEnd(nd, i + 1);
      const q = rg.getBoundingClientRect();
      out.push(rtl ? (r0.right - q.right) / k : (q.left - r0.left) / k);
    }
    return out;
  }, P2);
  check(T('editor: a decimal stop puts the decimal point on the stop (60 and 120 mm)'), dec.length === 2 && near(dec[0], 60, 0.9) && near(dec[1], 120, 0.9), JSON.stringify(dec));
  const defTab = await page.evaluate(() => { const s = document.querySelectorAll('#bw-pair [data-p="/chapters/0/sections/0/blocks/0/paragraphs/1"] .bw-tab'); return s.length; });
  check(T('a paragraph without stops has no tab spans'), defTab === 0);

  // type: Name, Tab, 12.50 in the plain paragraph that gets its stops from the ruler
  await sel(page, '/chapters/0/sections/0/blocks/0/paragraphs/1');
  const g = await geo(page);
  await page.mouse.click(xAt(g, 70), yBare(g)); // start stop at 70 on 'plain'
  await page.waitForTimeout(150);
  await page.click('#bw-pair [data-p="/chapters/0/sections/0/blocks/0/paragraphs/1"]');
  await page.keyboard.press('End');
  const n0 = await nOps(page);
  await page.keyboard.press('Tab');
  await page.keyboard.type(TYPED[loc][0]);
  await page.waitForTimeout(250);
  const P1 = '/chapters/0/sections/0/blocks/0/paragraphs/1';
  const l1 = await leaf(page, P1);
  const txt = typeof l1 === 'string' ? l1 : l1.text;
  check(T('the Tab key in a paragraph with stops inserts a tab character (focus stays in the text)'), txt === `${BASE[loc]}\t${TYPED[loc][0]}` && (await page.evaluate(() => document.activeElement?.isContentEditable)), JSON.stringify(txt));
  const d1 = await drawn(page, P1);
  check(T('the typed tab is drawn to the 70 mm stop'), d1.length === 1 && near(d1[0].start, 70, 0.8) && d1[0].text === TYPED[loc][0], JSON.stringify(d1));
  // a second tab goes to the next default stop (12.7 mm grid past the last stop)
  await page.keyboard.press('Tab');
  await page.keyboard.type(TYPED[loc][1]);
  await page.waitForTimeout(250);
  const d2 = await drawn(page, P1);
  const grid = d2[1] && d2[1].start / 12.7;
  check(T('the next tab past the last stop goes to Word\'s default grid (a multiple of 12.7 mm)'), d2.length === 2 && near(grid, Math.round(grid), 0.05) && d2[1].start > d2[0].end, JSON.stringify(d2));
  // Backspace removes a tab in one press
  await page.keyboard.press(loc === 'ar' ? 'ArrowRight' : 'ArrowLeft');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);
  const l2 = await leaf(page, P1);
  check(T('Backspace deletes a tab as one character'), (typeof l2 === 'string' ? l2 : l2.text) === `${BASE[loc]}\t${TYPED[loc][0]}${TYPED[loc][1]}`, JSON.stringify(l2));
  // a paragraph without stops: Tab leaves the text (the browser's own focus move), no tab inserted
  await page.click('#bw-pair [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
  await sel(page, '/chapters/0/sections/0/blocks/0/paragraphs/0');
  check(T('no page errors'), r.errors.length === 0, r.errors.join(' | '));
  await r.ctx.close();
}
{
  // Tab in a paragraph WITHOUT stops: no tab character
  const r = await open(docOf('en', ['no stops here']), 'en');
  await r.page.click(`#bw-pair [data-p="${P0}"]`);
  await r.page.keyboard.press('End');
  await r.page.keyboard.press('Tab');
  await r.page.keyboard.type('Q');
  await r.page.waitForTimeout(150);
  const l = await leaf(r.page);
  check('a paragraph without stops: Tab inserts nothing', (typeof l === 'string' ? l : l.text) === 'no stops hereQ' || (typeof l === 'string' ? l : l.text) === 'no stops here', JSON.stringify(l));
  await r.ctx.close();
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
