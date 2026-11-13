// (bw176, ruler lane): the ruler is interactive, like Word's horizontal ruler.
//  - the margin edges drag (EXT.margins.set live while dragging, once final on release; a stub stands in when the margins model is absent);
//  - the first-line, start (hanging) and end markers drag per paragraph: ONE undoable edit each, stored in the document (style.indentStart,
//    indentEnd, indentFirst in mm), surviving a reload, printed (PDF) and written to DOCX (w:ind start/end/firstLine/hanging);
//  - 0.25 cm steps, Alt = fine, a tooltip in cm, arrow keys on a focused marker, Arabic mirrored (the start is on the right);
//  - a document without indents prints exactly as before.
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/ruler-0176.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { docxParts, poppler } from './fixtures/doc-model/util.mjs';
import { suite, launchChrome } from './_harness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ruler0176-'));
const S = suite("ruler-0176");
const { check } = S;
const theme = loadTheme();
const near = (a, b, e = 0.06) => typeof a === 'number' && Math.abs(a - b) <= e;
const blank = (loc) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${loc}.json`), 'utf8'));
const AR = ['فقرة', 'اختبار', 'المسطرة', 'نص', 'تجريبي', 'قصير'];
const text = (loc, k) => (loc === 'ar' ? `${AR[0]} KIND${k}K ${AR.slice(1).join(' ')} ${AR.join(' ')} ${AR.join(' ')}` : `Paragraph KIND${k}K of the ruler test, long enough to wrap onto a second line of the sheet so the first line is clearly different from the rest of it.`);
const docOf = (loc, styled) => {
  const d = blank(loc); d.chapters = [{ number: '1', title: loc === 'ar' ? 'اختبار' : 'Test', sections: [{ number: '1.1', title: loc === 'ar' ? 'فقرات' : 'Paragraphs', blocks: [{ kind: 'prose', paragraphs: [1, 2, 3].map((k) => (k === 1 && styled ? { text: text(loc, k), marks: [], style: styled } : text(loc, k))) }] }] }];
  return d;
};
const P0 = '/chapters/0/sections/0/blocks/0/paragraphs/0';
const dirOf = (loc) => (loc === 'ar' ? -1 : 1); // the screen direction of "into the page" from the start edge

// ── 1. print: PDF and DOCX values, and the default stays byte-identical ──
{
  const plain = renderDocument(docOf('en'), { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  check('print HTML: a document without indents has no indent style', !/margin-inline-(start|end):\d|text-indent:/.test(plain.replace(/<style[\s\S]*?<\/style>/g, '')));
  const st = { indentStart: 10, indentEnd: 5, indentFirst: 7.5 };
  const html = renderDocument(docOf('en', st), { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  check('print HTML: margin-inline-start / end and text-indent in mm on the block style only', /style="[^"]*margin-inline-start:10mm;margin-inline-end:5mm;text-indent:7\.5mm/.test(html), (html.match(/<p[^>]*indent[^>]*>/) || [''])[0]);
  const junk = renderDocument(docOf('en', { indentStart: 'x', indentEnd: -3, indentFirst: 999 }), { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  check('print HTML: a bad indent (text, negative, out of range) prints nothing', !/margin-inline-(start|end):-?\w|text-indent:/.test(junk.replace(/<style[\s\S]*?<\/style>/g, '')));
  // PDF: the same paragraph is narrower by the indent, and starts further in
  const bbox = (pdf, w) => { const x = spawnSync(poppler('pdftotext'), ['-enc', 'UTF-8', '-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout; const m = new RegExp(`<word xMin="([\\d.]+)" yMin="[\\d.]+" xMax="([\\d.]+)"[^>]*>${w}</word>`).exec(x); return m && { min: +m[1] / 72 * 25.4, max: +m[2] / 72 * 25.4 }; };
  for (const loc of ['en', 'ar']) {
    const a = path.join(tmp, `plain-${loc}.pdf`); const b = path.join(tmp, `ind-${loc}.pdf`);
    const mk = (styled) => { const d = docOf(loc); d.chapters[0].sections[0].blocks[0].paragraphs[0] = styled ? { text: 'KINDXK word', marks: [], style: styled } : 'KINDXK word'; return d; };
    const dp = mk(null); const di = mk({ indentStart: 20 });
    await exportPdf(dp, { locale: loc, theme, pdfPath: a });
    await exportPdf(di, { locale: loc, theme, pdfPath: b });
    const pa = bbox(a, 'KINDXK'); const pb = bbox(b, 'KINDXK');
    const shift = pa && pb ? (loc === 'ar' ? pa.max - pb.max : pb.min - pa.min) : NaN;
    check(`PDF (${loc}): a 20 mm start indent moves the first word 20 mm from the start edge${loc === 'ar' ? ' (the right)' : ''}`, near(shift, 20, 0.8), `shift ${shift}`);
  }
  const docx = path.join(tmp, 'ind.docx');
  const dd = docOf('en', { indentStart: 10, indentEnd: 5, indentFirst: 7.5 });
  dd.chapters[0].sections[0].blocks[0].paragraphs.push({ text: 'hanging one', marks: [], style: { indentStart: 12, indentFirst: -6 } });
  exportDocx(dd, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  const tw = (mm) => Math.round(mm * 56.6929);
  check('DOCX: w:ind start / end / firstLine in twips', xml.includes(`w:start="${tw(10)}"`) && xml.includes(`w:end="${tw(5)}"`) && xml.includes(`w:firstLine="${tw(7.5)}"`), (xml.match(/<w:ind[^>]*>/g) || []).join(' '));
  check('DOCX: a negative first-line offset is w:hanging', xml.includes(`w:hanging="${tw(6)}"`) && xml.includes(`w:start="${tw(12)}"`));
  const xml0 = (() => { const f = path.join(tmp, 'plain.docx'); exportDocx(docOf('en'), { locale: 'en', theme, docxPath: f, embedFonts: false }); return docxParts(f, /^word\/document\.xml$/)['word/document.xml']; })();
  check('DOCX: a document without indents has no w:start / w:end / firstLine indent', !/<w:ind [^>]*w:(start|end|firstLine|hanging)=/.test(xml0));
}

// ── 2. the editor ──
const browser = await launchChrome();
let seq = 0;
async function open(doc, loc, vp = [1500, 900]) {
  const dir = path.join(tmp, `d${(seq += 1)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `document.${loc}.json`), JSON.stringify(doc));
  const file = path.join(dir, 'ed.html');
  buildEditor({ inputs: [dir], out: file, set: 'ruler-0176', watermarkDir: null, ui: loc });
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate((l) => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = l; B.render(); }, loc);
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  // the margins model is the real one (editor/ext/22-margins.js); its set() is wrapped only to record the calls the ruler makes
  await page.evaluate(() => {
    const B = window.BW;
    if (!B.EXT.margins) { // the model is absent (a branch without the margins lane): a stand-in with the same contract
      const st = { top: 20, bottom: 20, start: 16, end: 16 };
      B.EXT.margins = { get: () => ({ ...st }), set: (p) => { Object.assign(st, p); document.dispatchEvent(new CustomEvent('bw:margins')); } };
    }
    window.__mcalls = [];
    const real = B.EXT.margins.set;
    B.EXT.margins.set = (p, o) => { window.__mcalls.push({ p: { ...p }, live: !!(o && o.live) }); return real(p, o); };
    if (!B.EXT.w2ruler.on) B.runAction('ruler');
  });
  await page.waitForSelector('#bw-pair .bw-ruler.bw-ru');
  return { page, ctx, errors, loc };
}
const sel = (page, p = P0) => page.evaluate((p) => { const F = window.BW.EXT.w2format; F.select({ path: p, start: 0, end: 0 }); window.BW.EXT.w2rulerUi.refresh(); }, p);
const leaf = (page, p = P0) => page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return o; }, p);
const nOps = (page) => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
const box = (page, kind) => page.evaluate((k) => { const el = document.querySelector(`#bw-pair .bw-ruler.bw-ru .bw-ru-h[data-ru="${k}"]:not([hidden])`); if (!el) return null; const r = el.getBoundingClientRect(); const ru = el.closest('.bw-ruler'); return { x: r.x + r.width / 2, y: r.y + r.height / 2, mm: ru.getBoundingClientRect().width / ru.offsetWidth * 96 / 25.4, inset: el.style.insetInlineStart, end: el.style.insetInlineEnd, rtl: getComputedStyle(ru).direction === 'rtl' }; }, kind);
/** A real mouse drag of a handle by `mm` millimetres into the page (positive = away from the start edge), optionally with Alt held. */
async function drag(r, kind, mm, { alt = false, tip = false } = {}) {
  const b = await box(r.page, kind);
  if (!b) throw new Error(`no handle ${kind}`);
  const into = (kind === 'i-en' || kind === 'm-end' ? -1 : 1) * dirOf(r.loc); // end handles move against the start edge's direction
  const dx = into * mm * b.mm;
  await r.page.mouse.move(b.x, b.y);
  if (alt) await r.page.keyboard.down('Alt');
  await r.page.mouse.down();
  await r.page.mouse.move(b.x + dx / 2, b.y, { steps: 3 });
  await r.page.mouse.move(b.x + dx, b.y, { steps: 3 });
  let tipText = null;
  if (tip) tipText = await r.page.evaluate(() => { const t = document.querySelector('.bw-ru-tip'); return t && !t.hidden ? t.textContent : null; });
  await r.page.mouse.up();
  if (alt) await r.page.keyboard.up('Alt');
  return tipText;
}
const styleOf = async (page, p = P0) => { const l = await leaf(page, p); return (l && l.style) || {}; };

for (const loc of ['ar', 'en']) {
  const r = await open(docOf(loc), loc);
  const { page } = r;
  const T = (n) => `${loc}: ${n}`;
  // markers are hidden until a paragraph is picked
  check(T('markers hidden with no paragraph picked'), (await box(page, 'i-st')) === null);
  await sel(page);
  const b0 = await box(page, 'i-st');
  check(T('picking a paragraph shows the markers'), !!b0 && !!(await box(page, 'i-fl')) && !!(await box(page, 'i-en')));
  check(T('the ruler runs from the start edge: Arabic starts on the right'), b0 && b0.rtl === (loc === 'ar'));
  const handleAria = await page.evaluate(() => [...document.querySelectorAll('#bw-pair .bw-ruler.bw-ru .bw-ru-h')].map((h) => `${h.dataset.ru}|${h.getAttribute('aria-label')}|${h.getAttribute('role')}|${h.tabIndex}`));
  check(T('every handle is a focusable slider with a label in the UI language'), handleAria.length === 5 && handleAria.every((x) => x.split('|')[1].length > 3 && x.split('|')[2] === 'slider' && x.split('|')[3] === '0') && (loc === 'ar' ? handleAria.every((x) => /[\u0600-\u06ff]/.test(x.split('|')[1])) : handleAria.every((x) => /^[A-Za-z]/.test(x.split('|')[1]))), handleAria.join(' ; '));

  // start marker: 10 mm, one op, tooltip in cm
  let n = await nOps(page);
  const tip = await drag(r, 'i-st', 10, { tip: true });
  let st = await styleOf(page);
  check(T('dragging the start marker 10 mm stores indentStart 10 in ONE op'), near(st.indentStart, 10) && st.indentFirst === undefined && (await nOps(page)) === n + 1, JSON.stringify(st));
  check(T('the tooltip shows the value in cm while dragging'), tip && /1\.00/.test(tip), String(tip));
  const cssStart = await page.evaluate((p) => { const el = document.querySelector(`#bw-pair [data-p="${p}"]`); return parseFloat(getComputedStyle(el).marginInlineStart) / (96 / 25.4); }, P0);
  check(T('the editor renders the indent (margin-inline-start 10 mm)'), near(cssStart, 10, 0.2), String(cssStart));

  // first-line marker: +5 mm beyond the start indent -> indentFirst 5
  n = await nOps(page);
  await sel(page);
  await drag(r, 'i-fl', 5);
  st = await styleOf(page);
  check(T('dragging the first-line marker stores indentFirst 5 (relative to the start indent) in ONE op'), near(st.indentStart, 10) && near(st.indentFirst, 5) && (await nOps(page)) === n + 1, JSON.stringify(st));
  const ti = await page.evaluate((p) => parseFloat(getComputedStyle(document.querySelector(`#bw-pair [data-p="${p}"]`)).textIndent) / (96 / 25.4), P0);
  check(T('the editor renders the first-line indent (text-indent 5 mm)'), near(ti, 5, 0.2), String(ti));

  // start marker again: the first-line marker travels with it (Word)
  n = await nOps(page);
  await sel(page);
  await drag(r, 'i-st', 5);
  st = await styleOf(page);
  const fl = await box(page, 'i-fl');
  check(T('the start marker takes the first-line marker with it (hanging kept)'), near(st.indentStart, 15) && near(st.indentFirst, 5) && (await nOps(page)) === n + 1 && fl && near(parseFloat(fl.inset), 16 + 15 + 5, 0.2), JSON.stringify(st) + ' ' + JSON.stringify(fl));

  // end marker inward 7.5 mm
  n = await nOps(page);
  await sel(page);
  await drag(r, 'i-en', 7.5);
  st = await styleOf(page);
  check(T('dragging the end marker 7.5 mm inward stores indentEnd 7.5 in ONE op'), near(st.indentEnd, 7.5) && (await nOps(page)) === n + 1, JSON.stringify(st));

  // reload: the document goes through a fresh editor
  const saved = await page.evaluate(() => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc][B.S.ed].doc)); });
  const keep = await leaf(page);
  const r2 = await open(saved, loc);
  await sel(r2.page);
  const st2 = await styleOf(r2.page);
  const mk2 = await box(r2.page, 'i-fl');
  check(T('reload: the indents are in the document and the markers sit where they were'), near(st2.indentStart, 15) && near(st2.indentEnd, 7.5) && near(st2.indentFirst, 5) && mk2 && near(parseFloat(mk2.inset), 36, 0.2), JSON.stringify(st2));
  check(T('reload: the saved leaf is the same'), JSON.stringify(keep.style) === JSON.stringify(st2));
  await r2.ctx.close();

  // undo, one drag at a time
  await page.evaluate(() => window.BW.undo());
  st = await styleOf(page);
  check(T('undo takes back ONLY the end indent'), st.indentEnd === undefined && near(st.indentStart, 15) && near(st.indentFirst, 5), JSON.stringify(st));
  await page.evaluate(() => window.BW.undo());
  st = await styleOf(page);
  check(T('undo takes back the start move, the first-line marker comes back with it'), near(st.indentStart, 10) && near(st.indentFirst, 5), JSON.stringify(st));
  await page.evaluate(() => window.BW.undo());
  await page.evaluate(() => window.BW.undo());
  const l0 = await leaf(page);
  check(T('undo to the start: the paragraph is a plain string again'), typeof l0 === 'string', JSON.stringify(l0));

  // snapping: 0.25 cm; Alt = fine
  await sel(page);
  await drag(r, 'i-st', 6.2);
  check(T('snapping: 6.2 mm drag lands on 0.25 cm steps (5 mm)'), near((await styleOf(page)).indentStart, 5, 0.01), JSON.stringify(await styleOf(page)));
  await page.evaluate(() => window.BW.undo());
  await sel(page);
  await drag(r, 'i-st', 6.2, { alt: true });
  const fine = (await styleOf(page)).indentStart;
  check(T('Alt: fine moves (6.2 mm lands on 6.0, not 5.0)'), near(fine, 6, 0.01), String(fine));
  await page.evaluate(() => window.BW.undo());

  // keyboard: arrows move a focused marker; right arrow goes right on screen
  await sel(page);
  await page.focus('#bw-pair .bw-ruler.bw-ru .bw-ru-h[data-ru="i-st"]');
  n = await nOps(page);
  await page.keyboard.press(loc === 'ar' ? 'ArrowLeft' : 'ArrowRight');
  await page.waitForTimeout(80);
  st = await styleOf(page);
  check(T('keyboard: the arrow toward the page body moves the start marker 0.25 cm in ONE op'), near(st.indentStart, 2.5) && (await nOps(page)) === n + 1, JSON.stringify(st));
  const focusKept = await page.evaluate(() => document.activeElement?.dataset?.ru);
  check(T('keyboard: the focus stays on the marker after the redraw'), focusKept === 'i-st', String(focusKept));
  await page.keyboard.down('Alt');
  await page.keyboard.press(loc === 'ar' ? 'ArrowLeft' : 'ArrowRight');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(80);
  check(T('keyboard: Alt+arrow moves 0.05 cm'), near((await styleOf(page)).indentStart, 3, 0.01), JSON.stringify(await styleOf(page)));

  // margins: the drag calls EXT.margins (live while dragging, final on release)
  await page.evaluate(() => { window.__mcalls.length = 0; });
  await drag(r, 'm-start', 9);
  const mc = await page.evaluate(() => window.__mcalls);
  const last = mc[mc.length - 1];
  check(T('margin drag: live set() calls while dragging'), mc.slice(0, -1).length >= 1 && mc.slice(0, -1).every((c) => c.live === true && c.p.start != null), JSON.stringify(mc));
  check(T('margin drag: ONE final set({start:25},{live:false}) on release'), last && last.live === false && near(last.p.start, 25, 0.01) && mc.filter((c) => !c.live).length === 1, JSON.stringify(last));
  const shaded = await page.evaluate(() => parseFloat(document.querySelector('#bw-pair .bw-ruler i.s').style.width));
  check(T('the ruler follows EXT.margins.get() (shaded margin 25 mm, handle at 25 mm)'), near(shaded, 25, 0.01) && near(parseFloat((await box(page, 'm-start')).inset), 25, 0.01), String(shaded));
  const pageSide = await page.evaluate(() => parseFloat((() => { const B = window.BW; return B.M[B.S.svc][B.S.ed].doc.layout?.margins?.start; })()));
  check(T('the margin is recorded in the document (doc.layout.margins.start is 25 mm)'), near(pageSide, 25, 0.2), String(pageSide));
  await page.evaluate(() => window.BW.undo());
  const back = await page.evaluate(() => window.BW.EXT.margins.get().start);
  check(T('undo of the margin drag is ONE step (back to the margin before the drag)'), near(back, 16, 0.01), String(back));
  await page.evaluate(() => { window.__mcalls.length = 0; });
  await drag(r, 'm-end', 4);
  const me = await page.evaluate(() => window.__mcalls);
  check(T('margin drag (end side): final set({end:20},{live:false})'), me.length && me[me.length - 1].live === false && near(me[me.length - 1].p.end, 20, 0.01), JSON.stringify(me));

  // margins absent: the handles are not drawn, the markers still work
  await page.evaluate(() => { const B = window.BW; B.EXT.margins = undefined; B.runAction('ruler'); B.runAction('ruler'); });
  await page.waitForSelector('#bw-pair .bw-ruler.bw-ru');
  const mh = await page.evaluate(() => document.querySelectorAll('#bw-pair .bw-ru-h.m').length);
  check(T('without EXT.margins the margin handles are not drawn (the ruler still works)'), mh === 0);
  check(T('no page errors'), !r.errors.length, r.errors.join(' | '));
  await r.ctx.close();
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
S.finish();
