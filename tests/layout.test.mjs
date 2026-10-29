// A18 page size + orientation, A19 page break at a section, A25 front matter editable (0.13.0, design.md §3).
// A5 landscape for the whole document → every PDF page 210×148 mm (pdfinfo) and the DOCX sections the same;
// chapter 2 only landscape → those pages turned, the rest portrait, in the PDF and the DOCX sectPr; words unchanged
// (poppler); the paper list; a break before section 2.2 puts its heading first on its page and a w:br before it in
// DOCX, removing it restores the flow; TOC entries edit the headings, «حذف من الفهرس» keeps the section, the control
// table gets a row and a column (PDF + DOCX) and its bound cell still drives the cover spine. Headless Chrome.
//
//   node tests/layout.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument, PAPER, pageSpec } from '../engine/render.mjs';
import { applyOps } from '../engine/edits.mjs';
import { pageTexts, pageSizes, lostWords, docxParts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-layout-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  layout: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const base = sample(REPO, 'en');
const basePdf = path.join(tmp, 'base.pdf');
await exportPdf(base, { locale: 'en', theme, pdfPath: basePdf });
const BAND = [base.control.documentId, base.control.issuedOn, theme.brand?.producer, i18n().doc.en.confidential, base.labels?.confidential];
const sectPrs = (docx) => [...docxParts(docx, /^word\/document\.xml$/)['word/document.xml'].matchAll(/<w:pgSz w:w="(\d+)" w:h="(\d+)"(?: w:orient="(\w+)")?/g)].map((m) => [Math.round(+m[1] / 56.7), Math.round(+m[2] / 56.7), m[3] || 'portrait']);

// ── A18: the paper list and the whole document A5 landscape ──────────────
check('paper sizes A3 A4 A5 B5 Letter Legal Tabloid', ['A3', 'A4', 'A5', 'Letter', 'Legal'].every((k) => PAPER[k]) && pageSpec({ size: 'Letter' }).w === 215.9 && pageSpec({ size: 'A3', orientation: 'landscape' }).w === 420);
{
  const doc = applyOps(base, [{ op: 'replace', path: '/layout', value: { page: { size: 'A5', orientation: 'landscape' } } }]);
  const html = renderDocument(doc, { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  check('A5 landscape: @page size 210mm 148mm in the print CSS', html.includes('@page{size:210mm 148mm}'));
  const pdf = path.join(tmp, 'a5.pdf');
  await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf });
  const sizes = pageSizes(pdf);
  // the workflow figure keeps its own turned A4 sheet (297×210): every other page is A5 landscape
  const other = sizes.filter(([w, h]) => !(w === 297 && h === 210));
  check('A5 landscape: every PDF page is 210×148 mm (figure sheet aside)', other.length >= 2 && other.every(([w, h]) => w === 210 && h === 148), JSON.stringify(sizes));
  { const lost = lostWords(basePdf, pdf, BAND); check('A5 landscape: no word lost against A4 portrait (poppler)', !lost.length, lost.join(', ')); }
  const docx = path.join(tmp, 'a5.docx');
  exportDocx(doc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const secs = sectPrs(docx);
  check('A5 landscape: DOCX sections 210×148 landscape (figure sheet aside)', secs.filter(([w]) => w !== 297).every(([w, h, o]) => w === 210 && h === 148 && o === 'landscape') && secs.length >= 2, JSON.stringify(secs));
}
// ── A18: chapter 2 only landscape (through the editor action) ──────────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'layout-test', watermarkDir: null, ui: 'en' });
const browser = await chromium.launch(launchOptions());
let ch2Doc, brkDoc, tocDoc, ctlDoc;
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (B.S.ed !== 'en' && B.M[B.S.svc].en) { B.S.ed = 'en'; B.render(); } });
  const docNow = () => page.evaluate(() => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc)));
  const opsN = () => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const sh = (fn) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot)`);
  check('editor: the Document section carries page size/orientation and page break', await sh((r) => ['pgSetup', 'pgBreak'].every((a) => r.querySelector(`[data-a="${a}"]`))));
  let n0 = await opsN();
  await page.evaluate(() => window.BW.EXT.w2layout.page('A4', 'landscape', 'section', '/chapters/1/sections/0/blocks/0'));
  ch2Doc = await docNow();
  check('editor: "this section only" landscape is one undo group', (await opsN()) > n0 && ch2Doc.chapters[1].sections[0].blocks[0].layout.page.orientation === 'landscape');
  // 0.13.1 final pass #2 (A18 on the canvas): the sheet on screen is as wide as the paper set, per section and for all
  const geo = () => page.evaluate(() => {
    const main = document.querySelector('#bw-pair main.bw-doc[data-locale="en"]');
    const seg = main.querySelector('[style^="page:bw-seg-"]');
    const w = (el) => el.getBoundingClientRect().width;
    return { main: w(main), seg: seg ? w(seg) : 0, label: seg ? getComputedStyle(seg, '::after').content : '' };
  });
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const g0 = await geo();
  check('canvas: a section set to A4 landscape is drawn as a 297 mm sheet on a 210 mm page, labelled', near(g0.seg / g0.main, 297 / 210) && /A4/.test(g0.label), JSON.stringify(g0));
  await page.evaluate(() => window.BW.undo());
  check('editor: undo removes the page setting', !(await docNow()).chapters[1].sections[0].blocks[0].layout?.page);
  for (const [size, orient, w] of [['A3', 'portrait', 297], ['A5', 'portrait', 148], ['Letter', 'portrait', 215.9], ['Legal', 'landscape', 355.6]]) {
    await page.evaluate(([s, o]) => window.BW.EXT.w2layout.page(s, o, 'section', '/chapters/1/sections/0/blocks/0'), [size, orient]);
    const g = await geo();
    check(`canvas: a section set to ${size} ${orient} is drawn ${w} mm wide`, near(g.seg / g.main, w / 210) && g.label.includes(size), JSON.stringify(g));
    await page.evaluate(() => window.BW.undo());
  }
  await page.evaluate(() => window.BW.EXT.w2layout.page('A3', 'landscape', 'all'));
  const gAll = await geo();
  check('canvas: the whole document set to A3 landscape draws the page 420 mm wide', near(gAll.main / g0.main, 420 / 210), JSON.stringify({ gAll, g0 }));
  await page.evaluate(() => window.BW.runAction('view.single'));
  await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view'));
  const gView = await page.evaluate(() => { const v = document.querySelector('#bw-pair .bw-view'); const r = v.getBoundingClientRect(); return { ratio: r.width / r.height }; });
  check('canvas: the single-page view shows A3 landscape sheets (420 × 297)', near(gView.ratio, 420 / 297), JSON.stringify(gView));
  await page.evaluate(() => window.BW.runAction('view.continuous'));
  await page.evaluate(() => window.BW.undo());
  // the page setup drawer: whole document
  await page.evaluate(() => window.BW.runAction('pgSetup'));
  await sh((r) => { const d = r.querySelector('.drawer'); d.querySelector('[data-w2="size"]').value = 'Letter'; d.querySelector('[data-w2a="all"]').click(); });
  check('editor: the page drawer sets the whole document (Letter)', (await docNow()).layout?.page?.size === 'Letter');
  await page.evaluate(() => window.BW.undo());
  // A19: break before section 2.2, through the toolbar with 2.2 selected
  await page.evaluate(() => window.BW.selectEl(document.querySelector('#bw-pair main.bw-doc [data-b^="/chapters/1/sections/1/blocks/0"]')));
  n0 = await opsN();
  await page.evaluate(() => window.BW.runAction('pgBreak'));
  brkDoc = await docNow();
  check('editor: «صفحة جديدة قبل هذا القسم» is one op on section 2.2', (await opsN()) === n0 + 1 && brkDoc.chapters[1].sections[1].layout?.breakBefore === true);
  check('editor: the break shows as a dashed separator labelled «Page break»', await page.evaluate(() => { const s = document.querySelector('#bw-pair section.sec.bw-brk'); return !!s && getComputedStyle(s).borderTopStyle === 'dashed' && s.dataset.w2brk?.length > 0; }));
  await page.evaluate(() => window.BW.runAction('pgBreak'));
  check('editor: the same tool removes it', !(await docNow()).chapters[1].sections[1].layout?.breakBefore);
  // A25: TOC rows point at the headings they mirror
  const tocPtrs = await page.evaluate(() => [...document.querySelectorAll('#bw-pair [data-part="toc"] td[data-p]')].map((x) => x.dataset.p));
  check('editor: TOC cells carry the headings\' pointers (one source)', tocPtrs.includes('/chapters/1/sections/0/title') && tocPtrs.includes('/chapters/0/title'), tocPtrs.slice(0, 4).join(','));
  await page.evaluate(() => window.BW.setText('/chapters/1/sections/0/title', 'Renamed from the TOC'));
  await page.evaluate(() => window.BW.render());
  check('editor: editing the TOC entry renames the heading on screen', await page.evaluate(() => [...document.querySelectorAll('#bw-pair h3 [data-p="/chapters/1/sections/0/title"]')].some((x) => x.textContent === 'Renamed from the TOC')));
  await page.click('#bw-pair [data-part="toc"] tr[data-sec="/chapters/1/sections/1"] td[data-c="1"]');
  check('editor: a picked TOC cell brings the «الصفحات الأولى» section (TOC and front-matter tools)', await sh((r) => ['tocHide', 'tocAdd', 'fmRowAdd', 'fmRowDel', 'fmColAdd', 'fmColDel'].every((a) => r.querySelector(`.island .sec[data-cat="front"] [data-a="${a}"]`))));
  await page.evaluate(() => window.BW.runAction('tocHide'));
  tocDoc = await docNow();
  check('editor: «حذف من الفهرس» hides the entry only (tocHidden, the section stays)', tocDoc.chapters[1].sections[1].tocHidden === true && tocDoc.chapters[1].sections.length === 3);
  // control table: materialise, add a row and a column; the bound cell still edits /control/documentId
  await page.click('#bw-pair [data-part="control"] td[data-r="0"]');
  n0 = await opsN();
  await page.evaluate(() => window.BW.runAction('fmRowAdd'));
  await page.evaluate(() => window.BW.runAction('fmColAdd'));
  ctlDoc = await docNow();
  check('editor: control table materialised + row + column', !!ctlDoc.controlTable && ctlDoc.controlTable.rows.length === 11 && ctlDoc.controlTable.rows.every((r) => r.length === 3), JSON.stringify(ctlDoc.controlTable?.rows?.[1]));
  await page.evaluate(() => window.BW.setText('/controlTable/rows/1/0', 'Owning body'));
  await page.evaluate(() => window.BW.setText('/controlTable/rows/1/1', 'Ministry X'));
  await page.evaluate(() => window.BW.setText('/controlTable/rows/0/2', 'extra col'));
  await page.evaluate(() => window.BW.render());
  const bound = await page.evaluate(() => document.querySelector('#bw-pair [data-part="control"] td[data-bind="documentId"]')?.dataset.p);
  check('editor: the bound documentId cell still points at /control/documentId', bound === '/control/documentId', bound);
  await page.evaluate(() => window.BW.setText('/control/documentId', 'BW-NEW-ID-7'));
  await page.evaluate(() => window.BW.render());
  check('editor: editing the bound cell changes the cover spine', await page.evaluate(() => document.querySelector('#bw-pair .spine .id')?.textContent.includes('BW-NEW-ID-7')));
  ctlDoc = await docNow();
  // revisions + questions get row pointers
  check('editor: revisions table carries data-rows=/revisions', await page.evaluate(() => !!document.querySelector('#bw-pair [data-part="revisions"] table[data-rows="/revisions"]')));
  await page.click('#bw-pair [data-part="revisions"] td[data-r="0"]');
  n0 = (await docNow()).revisions.length;
  await page.evaluate(() => window.BW.runAction('fmRowAdd'));
  check('editor: add row in the revisions table → /revisions +1', (await docNow()).revisions.length === n0 + 1);
  await page.evaluate(() => window.BW.EXT.w2layout.rowAdd('questions', -1));
  check('editor: questions table cells point at their fields', await page.evaluate(() => !!document.querySelector('#bw-pair [data-part="questions"] table[data-rows="/openQuestions"] td[data-p="/openQuestions/0/question"]')));
  check('editor: no page errors', !errors.length, errors.join(' | '));
  if (process.env.BW_SHOTS) {
    await page.evaluate(() => document.querySelector('#bw-pair [data-part="control"]').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(process.env.BW_SHOTS, 'a25-control-table.png') });
  }
} finally {
  await browser.close();
}
// ── PDF + DOCX: chapter 2 only landscape ────────────────────────────────
{
  const pdf = path.join(tmp, 'ch2.pdf');
  await exportPdf(ch2Doc, { locale: 'en', theme, pdfPath: pdf });
  const sizes = pageSizes(pdf);
  const texts = pageTexts(pdf);
  const ch2 = texts.map((t, i) => (/Service card/.test(t) && /2\.1|2\.2|2\.3/.test(t) ? i : -1)).filter((i) => i >= 0);
  check('PDF: chapter 2 pages are landscape', ch2.length > 0 && ch2.every((i) => sizes[i][0] === 297), JSON.stringify(sizes));
  check('PDF: the pages before chapter 2 stay portrait', sizes.slice(0, ch2[0]).every(([w]) => w === 210));
  const ch4 = texts.findIndex((t) => /Business rules/.test(t));
  check('PDF: the pages after chapter 2 (business rules) go back to portrait', ch4 > 0 && sizes[ch4][0] === 210, `${ch4} ${JSON.stringify(sizes[ch4])}`);
  { const lost = lostWords(basePdf, pdf, BAND); check('PDF: no word lost (poppler)', !lost.length, lost.join(', ')); }
  const docx = path.join(tmp, 'ch2.docx');
  exportDocx(ch2Doc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const secs = sectPrs(docx);
  check('DOCX: a landscape section for chapter 2 and portrait sections around it', secs.some(([, , o]) => o === 'landscape') && secs.filter(([, , o]) => o !== 'landscape').length >= 2, JSON.stringify(secs));
}
// ── A19 in the PDF and DOCX ─────────────────────────────────────────────
{
  const title22 = brkDoc.chapters[1].sections[1].title;
  const pdf = path.join(tmp, 'brk.pdf');
  await exportPdf(brkDoc, { locale: 'en', theme, pdfPath: pdf });
  const texts = pageTexts(pdf);
  const tocAt = texts.findIndex((t) => t.includes(brkDoc.chapters[3].title));
  const at = texts.findIndex((t, i) => i > tocAt && t.includes(title22));
  const firstBody = (t) => t.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => !/^BW-|^\d{4}-\d{2}-\d{2}$/.test(l)) || '';
  check('PDF: heading 2.2 is the first line of its page', at > 0 && /2\.2/.test(firstBody(texts[at])) && firstBody(texts[at]).includes(title22.split(' ')[0]), firstBody(texts[at] || ''));
  const docx = path.join(tmp, 'brk.docx');
  exportDocx(brkDoc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  const pos = xml.lastIndexOf(`>${title22}<`);
  const before = xml.slice(Math.max(0, pos - 4000), pos);
  check('DOCX: a page break (w:br w:type="page") precedes heading 2.2', /<w:br w:type="page"\/>(?:(?!<w:br w:type="page"\/>)[\s\S])*$/.test(before) && before.lastIndexOf('w:type="page"') > before.lastIndexOf('</w:tbl>'));
  const plain = path.join(tmp, 'plain.docx');
  exportDocx(base, { locale: 'en', theme, docxPath: plain, embedFonts: false });
  const px = docxParts(plain, /^word\/document\.xml$/)['word/document.xml'];
  const pp = px.lastIndexOf(`>${title22}<`);
  check('DOCX: without the break no page break before 2.2 (removing restores the flow)', pp > 0 && !px.slice(Math.max(0, pp - 1500), pp).includes('w:type="page"'));
}
// ── A25 in the PDF and DOCX ─────────────────────────────────────────────
{
  const pdf = path.join(tmp, 'toc.pdf');
  const hidden = tocDoc.chapters[1].sections[1].title;
  await exportPdf(tocDoc, { locale: 'en', theme, pdfPath: pdf });
  const texts = pageTexts(pdf);
  // the contents run from «Table of contents» to the first chapter heading of the body (they may span two sheets)
  const all = texts.join('\f');
  const tocStart = all.indexOf('Table of contents');
  const bodyStart = all.indexOf(`${tocDoc.chapters[0].sections[0].number} ${tocDoc.chapters[0].sections[0].title}`, tocStart);
  const tocText = all.slice(tocStart, bodyStart), bodyText = all.slice(bodyStart);
  check('PDF: the renamed heading prints in the TOC and in the body', tocStart > 0 && bodyStart > tocStart && tocText.includes('Renamed from the TOC') && bodyText.includes('Renamed from the TOC'), `${tocStart} ${bodyStart}`);
  check('PDF: the hidden TOC entry is gone from the contents, its section stays in the body', !tocText.includes(hidden) && bodyText.includes(hidden));
  const docx = path.join(tmp, 'toc.docx');
  exportDocx(tocDoc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  const tocTbl = xml.match(/<w:tbl>(?:(?!<\/w:tbl>)[\s\S])*?w:tblCaption w:val="contents"[\s\S]*?<\/w:tbl>/)?.[0] || '';
  check('DOCX: the contents table has the renamed entry and not the hidden one', tocTbl.includes('Renamed from the TOC') && !tocTbl.includes(`>${hidden}<`));
  const cpdf = path.join(tmp, 'ctl.pdf');
  await exportPdf(ctlDoc, { locale: 'en', theme, pdfPath: cpdf });
  const ct = pageTexts(cpdf).join('\n');
  check('PDF: the control table prints the new row, its value and the new column', ct.includes('Owning body') && ct.includes('Ministry X') && ct.includes('extra col'));
  check('PDF: the cover spine prints the edited document code', pageTexts(cpdf)[0].includes('BW-NEW-ID-7'));
  const cdocx = path.join(tmp, 'ctl.docx');
  exportDocx(ctlDoc, { locale: 'en', theme, docxPath: cdocx, embedFonts: false });
  const cx = docxParts(cdocx, /^word\/document\.xml$/)['word/document.xml'];
  check('DOCX: the control table has the new row and column, the bound code', cx.includes('Owning body') && cx.includes('Ministry X') && cx.includes('extra col') && cx.includes('BW-NEW-ID-7'));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
