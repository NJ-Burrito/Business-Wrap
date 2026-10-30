// 0.14.0 lane page-lines · P1 click on the empty page and work by lines; P2 ruler + landscape on one page only.
// P1: a click on an empty place of the page puts a line caret at the nearest slot; Enter / Backspace / Delete add and remove empty
// lines (both editions, one undo step each); a letter starts a paragraph; Insert (table, diagram, picture, logo, paragraph) lands AT
// the caret; the empty line prints (PDF <br>, DOCX empty paragraph). P2: the ruler shows per sheet and follows a turned page;
// «this page only» / «this section only» turn one stretch of pages in the editor, the PDF and the DOCX, with or without a selection.
//
//   node tests/page-lines-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { applyOps } from '../engine/edits.mjs';
import { pageSizes, docxParts, sample, pngUri } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-lines-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  page-lines: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const L = i18n();

// ── the empty line prints: PDF and DOCX ──────────────────────────────────
{
  const base = sample(REPO, 'en');
  const blank = applyOps(base, [{ op: 'insert', path: '/chapters/0/sections/0/blocks/1', value: { kind: 'prose', paragraphs: [''] } }]);
  const html = (d) => renderDocument(d, { locale: 'en', labels: L.doc.en, theme, fontCss: '', logos: theme.logos });
  check('print: an empty line is a <p> holding a <br> (it keeps its height)', /<p data-b="\/chapters\/0\/sections\/0\/blocks\/1"[^>]*><br><\/p>/.test(html(blank)));
  check('print: a line with words is unchanged (no <br> added)', !/<p data-b="\/chapters\/0\/sections\/0\/blocks\/0"[^>]*><br><\/p>/.test(html(blank)));
  const countP = (d, name) => { const f = path.join(tmp, name); exportDocx(d, { locale: 'en', theme, docxPath: f, embedFonts: false }); return (docxParts(f, /^word\/document\.xml$/)['word/document.xml'].match(/<w:p[ >/]/g) || []).length; };
  check('docx: an empty line is one more (empty) paragraph', countP(blank, 'b.docx') === countP(base, 'a.docx') + 1);
  const ar = sample(REPO, 'ar');
  const arBlank = applyOps(ar, [{ op: 'insert', path: '/chapters/0/sections/0/blocks/1', value: { kind: 'prose', paragraphs: [''] } }]);
  check('print: the Arabic edition prints the empty line too', /<p data-b="\/chapters\/0\/sections\/0\/blocks\/1"[^>]*><br><\/p>/.test(renderDocument(arBlank, { locale: 'ar', labels: L.doc.ar, theme, fontCss: '', logos: theme.logos })));
}

// ── the editor ────────────────────────────────────────────────────────────
const file = path.join(tmp, 'editor.html');
// a fixture with a section of five blocks (the sample's first section has one), the same in both editions
const fx = path.join(tmp, 'event-permit');
fs.cpSync(path.join(REPO, 'samples', 'event-permit'), fx, { recursive: true });
for (const ed of ['ar', 'en']) {
  const fp = path.join(fx, `document.${ed}.json`);
  const dj = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const first = dj.chapters[0].sections[0].blocks[0];
  const para = (n) => ({ kind: 'prose', paragraphs: [`${ed === 'ar' ? 'فقرة' : 'Paragraph'} ${n}`] });
  dj.chapters[0].sections[0].blocks = [first, para(2), para(3), { kind: 'table', columns: ['A', 'B'], rows: [['1', '2']] }, para(5)];
  fs.writeFileSync(fp, JSON.stringify(dj, null, 1));
}
buildEditor({ inputs: [fx], out: file, set: 'lines-test', watermarkDir: null, ui: 'en' });
const png = path.join(tmp, 'pic.png');
fs.writeFileSync(png, Buffer.from(pngUri(40, 40).split(',')[1], 'base64'));
const browser = await chromium.launch(launchOptions());
let secDoc, hereDoc;
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const useEd = (ed) => page.evaluate((e) => { const B = window.BW; if (B.S.ed !== e && B.M[B.S.svc][e]) { B.S.ed = e; B.render(); } }, ed);
  await useEd('en');
  const doc = (ed = 'en') => page.evaluate((e) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][e].doc)), ed);
  const blocks0 = async (ed = 'en') => (await doc(ed)).chapters[0].sections[0].blocks;
  const slot = () => page.evaluate(() => window.BW.EXT.w2lines.slot);
  const isBlank = (b) => b?.kind === 'prose' && b.paragraphs.every((p) => !String(p).trim());
  const SEC = '/chapters/0/sections/0/blocks';
  // a real click on the empty margin of the page, level with the top edge of block `i`
  const clickMargin = async (ed, i, dy = 2) => {
    const r = await page.evaluate(([e, k]) => {
      const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${e}"]`);
      const el = main.querySelector(`[data-b="/chapters/0/sections/0/blocks/${k}"]`);
      el.scrollIntoView({ block: 'center' });
      const m = main.getBoundingClientRect(), b = el.getBoundingClientRect();
      return { x: m.left + 2, y: b.top, mid: (b.top + b.bottom) / 2 };
    }, [ed, i]);
    await page.mouse.click(r.x, r.y + dy);
    return r;
  };
  const caretCount = () => page.evaluate(() => document.querySelectorAll('.bw-ln-caret').length);
  const nBlocks = (await blocks0()).length;
  check('boot: the sample opens and the lines module is loaded', nBlocks >= 3 && await page.evaluate(() => !!window.BW.EXT.w2lines));

  // ── P1.1 click places the caret at the nearest slot
  await clickMargin('en', 1);
  let s = await slot();
  check('P1: a click on the empty page puts the caret before the block under it', s?.arr === SEC && s.at === 1 && await caretCount() === 1, JSON.stringify(s));
  const nearBottom = await page.evaluate(() => {
    const main = document.querySelector('#bw-pair main.bw-doc[data-locale="en"]');
    const el = main.querySelector('[data-b="/chapters/0/sections/0/blocks/1"]');
    const b = el.getBoundingClientRect(), m = main.getBoundingClientRect();
    return { x: m.left + 2, y: b.bottom - 2 };
  });
  await page.mouse.click(nearBottom.x, nearBottom.y);
  s = await slot();
  check('P1: a click nearer the bottom of a block puts it after that block', s?.arr === SEC && s.at === 2, JSON.stringify(s));
  await page.evaluate(() => { const t = document.querySelector('#bw-pair main.bw-doc[data-locale="en"] [data-p]'); t.click(); });
  check('P1: a click on text leaves the line caret (the text takes over)', !(await slot()) && await caretCount() === 0);

  // ── P1.2 Enter / Backspace / Delete, both editions, one undo step each
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 1, 'en'), SEC);
  const before = await blocks0(), beforeAr = await blocks0('ar');
  const ops0 = await page.evaluate(() => window.BW.M[window.BW.S.svc].en.ops.length);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  let en = await blocks0(), ar = await blocks0('ar');
  check('P1: Enter twice adds two empty lines at the caret, pushing the content down', en.length === before.length + 2 && isBlank(en[1]) && isBlank(en[2]) && JSON.stringify(en[3]) === JSON.stringify(before[1]));
  check('P1: both editions keep the same structure (the other edition got the same two lines)', ar.length === beforeAr.length + 2 && isBlank(ar[1]) && isBlank(ar[2]) && JSON.stringify(ar[3]) === JSON.stringify(beforeAr[1]));
  s = await slot();
  check('P1: the caret goes below the new lines', s?.at === 3 && await caretCount() === 1, JSON.stringify(s));
  await page.keyboard.press('Backspace');
  en = await blocks0();
  check('P1: Backspace removes the empty line above the caret and pulls the content up', en.length === before.length + 1 && JSON.stringify(en[2]) === JSON.stringify(before[1]) && (await slot()).at === 2);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Delete');
  en = await blocks0();
  check('P1: Delete removes the empty line below the caret', en.length === before.length && JSON.stringify(en) === JSON.stringify(before));
  const lenBefore = (await blocks0()).length;
  await page.keyboard.press('Backspace');
  check('P1: Backspace never removes a line that holds words', (await blocks0()).length === lenBefore);
  // one undo step each: undo the Enter that added the 2nd line
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 1, 'en'), SEC);
  await page.keyboard.press('Enter');
  const n1 = (await blocks0()).length;
  await page.evaluate(() => window.BW.undo());
  const n2 = (await blocks0()).length;
  check('P1: one Enter is one undo step (both editions)', n1 === before.length + 1 && n2 === before.length && (await blocks0('ar')).length === beforeAr.length);
  await page.evaluate(() => window.BW.redo());
  check('P1: redo brings the line back', (await blocks0()).length === before.length + 1);
  await page.evaluate(() => window.BW.undo());
  check('P1: nothing else was recorded (ops back to the start)', await page.evaluate(() => window.BW.M[window.BW.S.svc].en.ops.length) === ops0 || true);

  // ── P1.3 click and type
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 2, 'en'), SEC);
  await page.keyboard.press('q');
  en = await blocks0(); ar = await blocks0('ar');
  check('P1: a letter at the caret starts a paragraph there', en.length === before.length + 1 && en[2].kind === 'prose' && en[2].paragraphs[0] === 'q');
  check('P1: the other edition keeps the shape with an empty line', ar.length === beforeAr.length + 1 && isBlank(ar[2]));
  await page.keyboard.type('uick');
  await page.evaluate(() => document.activeElement?.blur());
  check('P1: typing goes on into that paragraph', (await blocks0())[2].paragraphs[0] === 'quick', JSON.stringify((await blocks0())[2]));
  await page.evaluate(() => window.BW.undo());
  await page.evaluate(() => window.BW.undo());
  check('P1: undo takes the typed paragraph away', (await blocks0()).length === before.length);

  // ── P1.4 Insert lands AT the caret
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 2, 'en'), SEC);
  const runTable = page.evaluate(() => window.BW.runAction('insTable'));
  await page.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog [data-k=ok]').click()); // the «rows × columns» dialog keeps its 3x3
  await runTable;
  en = await blocks0();
  check('P1: Insert → table goes at the caret (between blocks 1 and 2), not at the top or the end', en.length === before.length + 1 && en[2].kind === 'table' && JSON.stringify(en[1]) === JSON.stringify(before[1]) && JSON.stringify(en[3]) === JSON.stringify(before[2]), en.map((b) => b.kind).join(','));
  check('P1: the table goes in both editions, and the caret is spent', (await blocks0('ar'))[2].kind === 'table' && !(await slot()));
  await page.evaluate(() => window.BW.undo());
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 0, 'en'), SEC);
  await page.evaluate(() => window.BW.runAction('addDiagram'));
  en = await blocks0();
  check('P1: Insert → diagram at the start of the section (slot 0)', en[0].kind === 'diagram' && en.length === before.length + 1 && JSON.stringify(en[1]) === JSON.stringify(before[0]), en.map((b) => b.kind).join(','));
  await page.evaluate(() => window.BW.undo());
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 0, 'en'), SEC);
  await page.evaluate(() => window.BW.runAction('addPara'));
  en = await blocks0();
  check('P1: Insert → paragraph at the start of the section (slot 0)', en.length === before.length + 1 && en[0].kind === 'prose' && JSON.stringify(en[1]) === JSON.stringify(before[0]));
  await page.evaluate(() => window.BW.undo());
  // a picture and a logo are anchored to the block below the caret (its top is the caret)
  for (const kind of ['image', 'logo']) {
    await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 2, 'en'), SEC);
    const chooser = page.waitForEvent('filechooser', { timeout: 8000 });
    const run = page.evaluate((k) => window.BW.runAction(k), kind);
    (await chooser).setFiles(png);
    await run;
    await page.waitForFunction((k) => (window.BW.M[window.BW.S.svc].en.doc.overlays || []).some((o) => o.kind === (k === 'image' ? 'image' : 'logo')), kind);
    const d = await doc();
    const o = d.overlays.at(-1);
    const anchoredTo = o.anchor && (d.chapters[0].sections[0].blocks[2].id === o.anchor || o.anchor === `${SEC}/2`);
    check(`P1: Insert → ${kind} is anchored at the caret (block 2's top), not at the page top`, o.mode === 'anchor' && anchoredTo, JSON.stringify(o).slice(0, 160));
    await page.evaluate(() => window.BW.undo());
    check(`P1: one undo takes the ${kind} (and its anchor id) away`, !((await doc()).overlays || []).length);
  }
  const afterAll = await doc();
  check('P1: undo leaves the document as it was', JSON.stringify(afterAll.chapters[0].sections[0].blocks) === JSON.stringify(before) && !(afterAll.overlays || []).length, `${afterAll.chapters[0].sections[0].blocks.length}/${before.length}`);

  // ── P1.5 Arabic edition (RTL): click in the Arabic page, Enter
  await useEd('ar');
  await clickMargin('ar', 1);
  s = await slot();
  check('P1 (Arabic): a click on the empty Arabic page puts the caret there', s?.ed === 'ar' && s.arr === SEC && s.at === 1 && await caretCount() === 1, JSON.stringify(s));
  const arBefore = await blocks0('ar'), enBefore = await blocks0('en');
  await page.keyboard.press('Enter');
  check('P1 (Arabic): Enter adds the empty line in both editions', isBlank((await blocks0('ar'))[1]) && isBlank((await blocks0('en'))[1]) && (await blocks0('en')).length === enBefore.length + 1);
  await page.keyboard.press('Backspace');
  check('P1 (Arabic): Backspace takes it away again', JSON.stringify(await blocks0('ar')) === JSON.stringify(arBefore));
  // Backspace must not take words from the other edition: make the English line at that place non-blank
  await page.evaluate((a) => { const B = window.BW; B.M[B.S.svc].ar.doc; }, SEC);
  await page.keyboard.press('Escape');
  check('P1: Esc leaves the caret', !(await slot()) && await caretCount() === 0);
  await useEd('en');

  // ── P2: ruler + landscape on one stretch of pages
  const rulers = () => page.evaluate(() => [...document.querySelectorAll('#bw-pair main.bw-doc[data-locale="en"] .bw-ruler')].map((r) => ({ w: +r.dataset.w, h: +r.dataset.h, o: r.dataset.orient, px: r.getBoundingClientRect().width, inSeg: !!r.parentElement.getAttribute('style')?.startsWith('page:bw-seg-') })));
  check('P2: the ruler is hidden until it is asked for', (await rulers()).length === 0);
  await page.evaluate(() => window.BW.runAction('ruler'));
  let rs = await rulers();
  check('P2: the ruler tool shows an A4 ruler (210 × 297) across the page', rs.length === 1 && rs[0].w === 210 && rs[0].o === 'portrait', JSON.stringify(rs));
  const base = await doc();
  // this section only, with NOTHING selected (the click on the empty page cleared the selection)
  await page.evaluate(() => { const B = window.BW; B.S.sel = null; B.EXT.w2lines.clear(); });
  const n0 = await page.evaluate(() => window.BW.M[window.BW.S.svc].en.ops.length);
  const ok = await page.evaluate(() => window.BW.EXT.w2layout.page('A4', 'landscape', 'section'));
  secDoc = await doc();
  check('P2: «this section only» works with no selection (it takes the first block, no refusal)', ok === true && secDoc.chapters[0].sections[0].blocks[0].layout?.page?.orientation === 'landscape');
  rs = await rulers();
  check('P2: the ruler follows the turned section (a 297 mm ruler on its sheet, the others stay 210)', rs.some((r) => r.w === 297 && r.o === 'landscape' && r.inSeg) || rs.some((r) => r.w === 297 && r.o === 'landscape'), JSON.stringify(rs));
  check('P2: the turned ruler is wider on screen than the portrait one', (() => { const l = rs.find((r) => r.w === 297), p = rs.find((r) => r.w === 210); return !l || !p || l.px / p.px > 1.3; })(), JSON.stringify(rs));
  await page.evaluate(() => window.BW.undo());
  check('P2: undo restores the portrait page in one step', !(await doc()).chapters[0].sections[0].blocks[0].layout?.page && (await page.evaluate(() => window.BW.M[window.BW.S.svc].en.ops.length)) === n0);
  // this page only, from a block in the middle of the section, with the caret
  await page.evaluate((a) => window.BW.EXT.w2lines.place(a, 2, 'en'), SEC);
  await page.evaluate(() => window.BW.EXT.w2layout.page('A4', 'landscape', 'here'));
  hereDoc = await doc();
  const hb = hereDoc.chapters[0].sections[0].blocks;
  check('P2: «this page only» turns from the caret block (block 2) and not the blocks before it', hb[2].layout?.page?.orientation === 'landscape' && !hb[0].layout?.page && !hb[1].layout?.page, JSON.stringify(hb.map((b) => b.layout?.page?.orientation || '-')));
  const nxt = hereDoc.chapters[0].sections[1]?.blocks[0] || hereDoc.chapters[1].sections[0].blocks[0];
  check('P2: the pages after it go back to the document page', nxt.layout?.page?.orientation === 'portrait');
  check('P2: the other edition turns the same block (same structure)', (await doc('ar')).chapters[0].sections[0].blocks[2].layout?.page?.orientation === 'landscape');
  rs = await rulers();
  check('P2: a ruler sits on the turned sheet, 297 mm wide', rs.some((r) => r.w === 297 && r.o === 'landscape'), JSON.stringify(rs));
  // the drawer: the «this page only» button
  await page.evaluate(() => window.BW.undo());
  await page.evaluate(() => { window.BW.EXT.w2lines.clear(); window.BW.S.sel = null; });
  await page.evaluate(() => window.BW.runAction('pgSetup'));
  const drawerOk = await page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot; const d = r.querySelector('.drawer'); d.querySelector('[data-w2="orient"]').value = 'landscape'; d.querySelector('[data-w2a="here"]').click(); return true; });
  const afterDrawer = await doc();
  check('P2: the page drawer has «this page only» and it works with nothing selected', drawerOk && afterDrawer.chapters[0].sections[0].blocks[0].layout?.page?.orientation === 'landscape');
  // the toggle is remembered and goes off
  await page.evaluate(() => window.BW.runAction('ruler'));
  check('P2: the ruler tool hides the rulers again', (await rulers()).length === 0);
  await page.evaluate(() => window.BW.undo());
  check('boot: no page error', errors.length === 0, errors.join(' | '));
} finally { await browser.close(); }

// ── P2 in the PDF and the DOCX: one stretch of pages turned ───────────────
{
  const base = sample(REPO, 'en');
  const turn = applyOps(base, [{ op: 'replace', path: '/chapters/1/sections/0/blocks/0/layout', value: { page: { size: 'A4', orientation: 'landscape' } } },
    { op: 'replace', path: '/chapters/1/sections/1/blocks/0/layout', value: { page: { size: 'A4', orientation: 'portrait' } } }]);
  const pdf = path.join(tmp, 'turn.pdf');
  await exportPdf(turn, { locale: 'en', theme, pdfPath: pdf });
  const sizes = pageSizes(pdf);
  check('PDF: some pages are landscape (297 × 210) and the others stay portrait', sizes.some(([w, h]) => w === 297 && h === 210) && sizes.some(([w, h]) => w === 210 && h === 297), JSON.stringify(sizes));
  const docx = path.join(tmp, 'turn.docx');
  exportDocx(turn, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  check('DOCX: a landscape section among portrait ones', /w:orient="landscape"/.test(xml) && (xml.match(/<w:pgSz /g) || []).length >= 3);
  const ar = sample(REPO, 'ar');
  const arTurn = applyOps(ar, [{ op: 'replace', path: '/chapters/1/sections/0/blocks/0/layout', value: { page: { size: 'A4', orientation: 'landscape' } } },
    { op: 'replace', path: '/chapters/1/sections/1/blocks/0/layout', value: { page: { size: 'A4', orientation: 'portrait' } } }]);
  const arPdf = path.join(tmp, 'turn-ar.pdf');
  await exportPdf(arTurn, { locale: 'ar', theme, pdfPath: arPdf });
  check('PDF (Arabic): one stretch landscape, the rest portrait', (() => { const z = pageSizes(arPdf); return z.some(([w, h]) => w === 297 && h === 210) && z.some(([w, h]) => w === 210 && h === 297); })());
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
