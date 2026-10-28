// A5 Header / Footer toolbar sections + A6 item scope (0.13.0, design.md §3 A5 A6).
// No doc.chrome = the 0.12.0 templates byte for byte; materialised defaults print the same words; an added header
// text is on screen, in the PDF (poppler, page 2) and in DOCX header*.xml; deleting the page number removes it from
// both; undo restores; an "only" item anchored to chapter 3's first block is on exactly one PDF page and one DOCX
// section header; an "all" item is on every non-cover page. Headless Chrome, closed at the end.
//
//   node tests/chrome.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { chromeTemplates, chromeDefaults } from '../engine/render.mjs';
import { applyOps } from '../engine/edits.mjs';
import { pageTexts, docxParts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-chrome-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  chrome: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const golden = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'doc-model', 'golden.json'), 'utf8'));

// ── 1. no doc.chrome: the 0.12.0 templates ──────────────────────────────
for (const locale of ['ar', 'en']) {
  const doc = sample(REPO, locale);
  const t = chromeTemplates(doc, { theme, labels: i18n().doc[locale], locale, fontCss: '', logos: theme.logos });
  check(`${locale}: no doc.chrome → header/footer templates byte-identical to 0.12.0`, sha(t.header) === golden[`event-permit.${locale}`].header && sha(t.footer) === golden[`event-permit.${locale}`].footer);
}

// ── 2. the editor: add a header text, delete the page number, undo ──────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'chrome-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
let edited, ops;
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const sh = (fn) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot)`);
  check('editor: the «الترويسة والتذييل» toolbar section (one section: the bar has room for one at 1366 px)', await sh((r) => r.querySelector('.island .sec[data-cat="chrome"] .st')?.textContent === 'الترويسة والتذييل'));
  check('editor: the section carries the footer tools too', await sh((r) => ['ftrText', 'ftrField'].every((a) => r.querySelector(`.sec[data-cat="chrome"] [data-a="${a}"]`))));
  check('editor: the section carries add text/field/logo, align, delete, scope, logo on every page, confidentiality', await sh((r) => ['hdrText', 'hdrField', 'hdrLogo', 'chStart', 'chCenter', 'chEnd', 'chDelete', 'chScope', 'every', 'hdrConf'].every((a) => r.querySelector(`.sec[data-cat="chrome"] [data-a="${a}"]`))));
  check('editor: the band strip shows today\'s header on screen (document code)', await page.evaluate(() => document.querySelector('#bw-pair .w2-strip .w2-band-h')?.textContent.includes(window.BW.M[window.BW.S.svc].ar.doc.control.documentId)));
  const n0 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.ops.length);
  await page.evaluate(() => { window.BW.runAction('hdrText'); });
  await sh((r) => { r.querySelector('.dialog textarea').value = 'WP2HEAD ترويسة'; r.querySelector('.dialog [data-k="ok"]').click(); });
  await page.waitForTimeout(100);
  check('editor: «نص في الترويسة» adds one item (materialise + insert = one undo group)', await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc].ar; return e.doc.chrome?.header.items.some((x) => x.kind === 'text' && x.value === 'WP2HEAD ترويسة'); }));
  check('editor: the new header text is on screen, editable in place', await page.evaluate(() => { const el = [...document.querySelectorAll('#bw-pair .w2-strip [data-w2p^="/chrome/header/items/"]')].find((x) => x.textContent.includes('WP2HEAD')); return !!el && el.isContentEditable; }));
  // delete the default page number from the footer: pick it on screen, then «حذف عنصر التذييل»
  await page.click('#bw-pair .w2-strip [data-ci^="footer:"][data-bw-page]');
  await page.evaluate(() => window.BW.runAction('chDelete'));
  edited = await page.evaluate(() => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc)));
  ops = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.ops.length);
  check('editor: deleting the page item is one op (materialise + add = one group, delete = one op)', ops === n0 + 3 && !edited.chrome.footer.items.some((x) => x.kind === 'page'), `${n0} → ${ops}`);
  await page.evaluate(() => window.BW.undo());
  check('editor: undo restores the page item', await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.chrome.footer.items.some((x) => x.kind === 'page')));
  check('editor: no page errors', !errors.length, errors.join(' | '));
  if (process.env.BW_SHOTS) {
    await page.evaluate(() => document.querySelector('#bw-pair .w2-strip').scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(process.env.BW_SHOTS, 'a5-header-footer.png') });
  }
} finally {
  await browser.close();
}

// ── 3. PDF and DOCX of the edited document ───────────────────────────────
{
  const pdf = path.join(tmp, 'edited.pdf');
  const post = (await exportPdf(edited, { locale: 'ar', theme, pdfPath: pdf })).post;
  const pages = pageTexts(pdf);
  check('PDF: the added header text prints on page 2', pages[1]?.includes('WP2HEAD'), pages[1]?.slice(0, 200));
  check('PDF: the header text is on every non-cover page, not on the cover', pages.slice(1).every((p) => p.includes('WP2HEAD')) && !pages[0].includes('WP2HEAD'));
  check('PDF: the deleted page number is gone (no sheet numbered)', / 0 sheet\(s\) numbered/.test(post), post);
  const docx = path.join(tmp, 'edited.docx');
  exportDocx(edited, { locale: 'ar', theme, docxPath: docx, embedFonts: false });
  const parts = docxParts(docx, /^word\/(header|footer)\d*\.xml$/);
  const heads = Object.entries(parts).filter(([n]) => n.includes('header'));
  check('DOCX: the added text is in header*.xml, both font slots', heads.some(([, x]) => x.includes('WP2HEAD') && /w:ascii="[^"]+" w:hAnsi="[^"]+" w:cs="[^"]+"/.test(x)));
  check('DOCX: no PAGE field in the footer once the page item is deleted', !Object.entries(parts).some(([n, x]) => n.includes('footer') && />\s*PAGE\s*</.test(x)));
}
// the default items (materialised, nothing changed) print the same words as 0.12.0
{
  const base = sample(REPO, 'ar');
  const mat = { ...JSON.parse(JSON.stringify(base)), chrome: chromeDefaults('ar') };
  const a = path.join(tmp, 'base.pdf'), b = path.join(tmp, 'mat.pdf');
  await exportPdf(base, { locale: 'ar', theme, pdfPath: a });
  await exportPdf(mat, { locale: 'ar', theme, pdfPath: b });
  const pa = pageTexts(a), pb = pageTexts(b);
  const head = (t) => t.split('\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').trim();
  check('materialised defaults: same page count and the same header/footer words as 0.12.0', pa.length === pb.length && pa.every((p, i) => head(p) === head(pb[i]) && p.split(/\s+/).length === pb[i].split(/\s+/).length), `${pa.length}/${pb.length} ${head(pa[1])} | ${head(pb[1])}`);
}

// ── 4. A6 scope: "only" anchored to chapter 3's first block, "all" everywhere ──
{
  const doc = sample(REPO, 'ar');
  const anchor = '/chapters/2/sections/0/blocks/0';
  const ch3 = doc.chapters[2].title;
  const scoped = applyOps(doc, [
    { op: 'replace', path: `${anchor}/id`, value: 'b-ch3' },
    { op: 'replace', path: '/chrome', value: chromeDefaults('ar') },
    { op: 'insert', path: '/chrome/header/items/-', value: { id: 'only1', kind: 'text', value: 'ONLYHERE', align: 'start', scope: 'only', anchor: 'b-ch3' } },
    { op: 'insert', path: '/chrome/header/items/-', value: { id: 'all1', kind: 'text', value: 'EVERYPAGE', align: 'center', scope: 'all' } },
  ]);
  const pdf = path.join(tmp, 'scoped.pdf');
  await exportPdf(scoped, { locale: 'ar', theme, pdfPath: pdf });
  const pages = pageTexts(pdf);
  const hits = pages.map((p, i) => (p.includes('ONLYHERE') ? i : -1)).filter((i) => i >= 0);
  const ch3Page = pages.findLastIndex((p) => p.includes(ch3)); // the TOC lists it first
  check('PDF: the "only" item is on exactly one page — the one chapter 3 starts on', hits.length === 1 && hits[0] === ch3Page, `hits ${hits} ch3 page ${ch3Page}`);
  check('PDF: the "all" item is on every non-cover page', pages.slice(1).every((p) => p.includes('EVERYPAGE')) && !pages[0].includes('EVERYPAGE'));
  check('PDF: the folios still run 1…n after the scoped pages are spliced', pages.slice(1).every((p, i) => new RegExp(`(^|\\s)${i + 1}(\\s|$)`).test(p)));
  const docx = path.join(tmp, 'scoped.docx');
  exportDocx(scoped, { locale: 'ar', theme, docxPath: docx, embedFonts: false });
  const parts = docxParts(docx, /^word\/(header\d*|document)\.xml$/);
  const headsWith = Object.entries(parts).filter(([n, x]) => /header/.test(n) && x.includes('ONLYHERE'));
  const firstRefs = (parts['word/document.xml'].match(/<w:headerReference w:type="first"/g) || []).length;
  check('DOCX: the "only" item is in exactly one section header (that section\'s first page)', headsWith.length === 1 && firstRefs === 1, `${headsWith.length} header parts, ${firstRefs} first-page refs`);
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
