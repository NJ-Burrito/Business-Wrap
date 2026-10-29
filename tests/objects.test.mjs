// A15 images with Word's wrap modes, A23 free text box, A24 tables and sections anywhere (0.13.0, design.md §3).
// Each of the 7 wrap modes on a fixture paragraph: the paragraph's words all print (poppler), the box sits beside /
// below / behind / in front in the print layout, the DOCX has the right wrap element, switching is one op and undoes.
// A text box: insert, type, move = one op each; its words print once; DOCX wps:txbx with both font slots.
// A 4×2 table into an empty section; copy the stories block and paste it into another document = the same JSON.
//
//   node tests/objects.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, printHtml } from '../engine/export.mjs';
import { applyOps } from '../engine/edits.mjs';
import { pageTexts, docxParts, pngUri, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-objects-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  objects: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const IMG = pngUri(60, 60);
const base = sample(REPO, 'en');
const P = '/chapters/0/sections/0/blocks/0';
const para = base.chapters[0].sections[0].blocks[0].paragraphs[0];
const paraWords = String(para).match(/\p{L}{3,}/gu);
const MODES = ['inline', 'square', 'tight', 'through', 'topBottom', 'behind', 'front'];
const WRAP_XML = { square: 'wp:wrapSquare', tight: 'wp:wrapTight', through: 'wp:wrapThrough', topBottom: 'wp:wrapTopAndBottom', behind: 'wp:wrapNone', front: 'wp:wrapNone' };
const withWrap = (mode) => (mode === 'inline'
  ? applyOps(base, [{ op: 'insert', path: '/chapters/0/sections/0/blocks/1', value: { kind: 'shots', caption: 'inline image', images: [IMG], width: 30 } }])
  : applyOps(base, [{ op: 'replace', path: `${P}/id`, value: 'b-fix' }, { op: 'replace', path: '/overlays', value: [{ id: 'ov1', kind: 'image', src: IMG, mode: 'anchor', anchor: 'b-fix', wrap: mode, x: 0, y: 0, w: 30 }] }]));

// ── A15: print layout per mode (one headless page over the print HTML) ──
const browser = await chromium.launch(launchOptions());
try {
  const pg = await browser.newPage({ viewport: { width: 800, height: 1000 } });
  for (const mode of MODES) {
    const doc = withWrap(mode);
    await pg.setContent(printHtml(doc, { locale: 'en', theme }).html);
    await pg.emulateMedia({ media: 'print' });
    const g = await pg.evaluate((P) => {
      const p = document.querySelector(`[data-p="${P}/paragraphs/0"]`).getBoundingClientRect();
      const box = document.querySelector('.bw-ovf, .bw-ov, figure.shots img');
      const b = box.getBoundingClientRect();
      return { p: [p.left, p.top, p.right, p.bottom], b: [b.left, b.top, b.right, b.bottom], z: getComputedStyle(box.closest('.bw-ov, .bw-ovf') || box).zIndex, pos: getComputedStyle(box.closest('.bw-ov, .bw-ovf') || box).position, float: getComputedStyle(box.closest('.bw-ovf') || box).float };
    }, P);
    const beside = g.b[1] < g.p[3] && g.b[3] > g.p[1] && (g.b[2] <= g.p[0] + 2 || g.b[0] >= g.p[2] - 2 || g.float !== 'none');
    const ok = {
      inline: g.b[1] >= g.p[3] - 1, // its own block after the paragraph
      square: g.float !== 'none' && beside,
      tight: g.float !== 'none' && beside,
      through: g.float !== 'none' && beside,
      topBottom: g.float === 'none' && g.b[3] <= g.p[1] + 1, // on its own line, text below it
      behind: g.pos === 'absolute' && +g.z < 0,
      front: g.pos === 'absolute' && +g.z > 0,
    }[mode];
    check(`${mode}: print layout ${mode === 'behind' ? 'behind the text' : mode === 'front' ? 'in front of the text' : mode === 'topBottom' || mode === 'inline' ? 'on its own line' : 'beside the text'}`, ok, JSON.stringify(g));
  }
} finally {
  await browser.close();
}
// ── A15: PDF words and DOCX wrap elements (square + tight + topBottom + behind printed; all 7 in DOCX) ──
for (const mode of MODES) {
  const doc = withWrap(mode);
  if (['square', 'topBottom', 'behind', 'inline'].includes(mode)) {
    const pdf = path.join(tmp, `wrap-${mode}.pdf`);
    await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf });
    const all = pageTexts(pdf).join(' ');
    const lost = paraWords.filter((w) => !all.includes(w));
    check(`${mode}: PDF keeps every word of the paragraph (poppler)`, !lost.length, lost.join(' '));
  }
  const docx = path.join(tmp, `wrap-${mode}.docx`);
  exportDocx(doc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  if (mode === 'inline') check('inline: DOCX picture is wp:inline in the flow', /<wp:inline/.test(xml) && !/<wp:anchor[^>]*relativeHeight="2517/.test(xml));
  else check(`${mode}: DOCX anchor has ${WRAP_XML[mode]}${mode === 'behind' ? ' + behindDoc="1"' : ''}`, new RegExp(`<${WRAP_XML[mode]}[ />]`).test(xml) && (mode !== 'behind' || /behindDoc="1"/.test(xml)) && (mode !== 'front' || /behindDoc="0"[^>]*>(?:(?!<\/wp:anchor>)[\s\S])*<wp:wrapNone/.test(xml)));
}

// ── A15: «through» is not «tight»: different text flow on the page and in Word ──
{
  const html = (m) => printHtml(withWrap(m), { locale: 'en', theme: loadTheme() }).html.match(/<div class="bw-ovf[^>]*data-wrap="(?:tight|through)"[^>]*>/)?.[0] || '';
  const [ti, th] = [html('tight'), html('through')];
  check('through ≠ tight on the page: tight hugs the outline 2 mm off, through has no gap and lets text into see-through parts', /shape-margin:2mm/.test(ti) && /shape-image-threshold:\.3/.test(ti) && /shape-margin:0mm/.test(th) && /shape-image-threshold:\.9/.test(th), `${ti.slice(0, 80)} | ${th.slice(0, 80)}`);
  const dist = (m) => { const f = path.join(tmp, `dist-${m}.docx`); exportDocx(withWrap(m), { locale: 'en', theme: loadTheme(), docxPath: f }); return /<wp:anchor[^>]*distL="(\d+)"/.exec(docxParts(f, /^word\/document\.xml$/)['word/document.xml'])?.[1]; };
  const [dt, dh] = [dist('tight'), dist('through')];
  check('through ≠ tight in the DOCX: tight keeps a side gap, through has none', dt === '114300' && dh === '0', `${dt} / ${dh}`);
}

// ── editor: wrap switching, text box, tables, copy / paste ───────────────
const fileA = path.join(tmp, 'a.html');
const fileB = path.join(tmp, 'b.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: fileA, set: 'objects-a', watermarkDir: null });
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: fileB, set: 'objects-b', watermarkDir: null });
const b2 = await chromium.launch(launchOptions());
let tbDoc;
try {
  const ctx = await b2.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(fileA).href);
  await page.waitForFunction(() => window.BW?.ready);
  const E = () => page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; return { ops: e.ops.length, doc: JSON.parse(JSON.stringify(e.doc)) }; });
  const sh = (fn) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot)`);
  // an image overlay anchored to block 0, then each wrap mode = one op
  await page.evaluate(([P, IMG]) => { window.BW.commit([{ op: 'replace', path: '/overlays', value: [{ id: 'ov1', kind: 'image', src: IMG, mode: 'anchor', anchor: P, x: 10, y: 0, w: 30 }] }]); window.BW.S.selOv = 0; window.BW.render(); }, [P, IMG]);
  check('editor: «التفاف النص» section shows for a picked image', await sh((r) => !!r.querySelector('.island .sec[data-cat="wrap"]')));
  let n = (await E()).ops;
  let allOne = true;
  for (const m of ['square', 'tight', 'through', 'topBottom', 'behind', 'front']) {
    await page.evaluate((id) => window.BW.runAction(id), 'wrap' + m[0].toUpperCase() + m.slice(1));
    const now = await E();
    if (now.ops !== n + 1 || now.doc.overlays[0].wrap !== m) allOne = false;
    n = now.ops;
  }
  check('editor: each wrap mode is one op (6 modes)', allOne);
  await page.evaluate(() => window.BW.undo());
  check('editor: undo restores the previous mode', (await E()).doc.overlays[0].wrap === 'behind');
  await page.evaluate(() => { window.BW.S.selOv = 0; return window.BW.runAction('wrapInline'); });
  const inl = await E();
  await page.evaluate(() => window.BW.undo());
  const back = await E();
  check('editor: «مع النص» puts the image back in the flow (a shots block); one undo brings the overlay back', !inl.doc.overlays.length && inl.doc.chapters[0].sections[0].blocks[1].kind === 'shots' && back.doc.overlays.length === 1 && back.doc.chapters[0].sections[0].blocks[1]?.kind !== 'shots');
  // A23: text box — insert, type, move = one op each
  await page.evaluate((P) => window.BW.selectEl(document.querySelector(`#bw-pair main.bw-doc [data-b="${P}"]`)), P);
  n = (await E()).ops;
  await page.evaluate(() => window.BW.runAction('insTextBox'));
  const ins = await E();
  const tb = ins.doc.overlays.length - 1;
  check('editor: «مربع نص» inserts a text box: one undo group', ins.doc.overlays[tb]?.kind === 'text' && ins.ops - n <= 2 && ins.ops > n, `${n} → ${ins.ops}`);
  await page.evaluate((tb) => {
    const el = document.querySelector(`#bw-pair .bw-ov[data-i="${tb}"] [data-p]`);
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r);
  }, tb);
  await page.keyboard.type('BOXWORDS here');
  await page.evaluate(() => document.activeElement.blur());
  const typed = await E();
  check('editor: typing in the box is one op', typed.ops === ins.ops + 1 && typed.doc.overlays[tb].text === 'BOXWORDS here', JSON.stringify(typed.doc.overlays[tb].text));
  const box = await page.locator(`#bw-pair .bw-ov[data-i="${tb}"]`).boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 40, { steps: 6 });
  await page.mouse.up();
  const moved = await E();
  check('editor: moving the box is one op', moved.ops === typed.ops + 1 && (moved.doc.overlays[tb].x !== typed.doc.overlays[tb].x || moved.doc.overlays[tb].y !== typed.doc.overlays[tb].y), `${typed.ops} → ${moved.ops}`);
  tbDoc = moved.doc;
  // A24: a 4×2 table into an empty section
  await page.evaluate(() => { const B = window.BW; B.commit([{ op: 'insert', path: '/chapters/0/sections/2', value: { number: '1.3', title: 'Empty', blocks: [] } }]); B.S.sel = { p: '/chapters/0/sections/2/title', b: null, ed: B.S.ed }; });
  n = (await E()).ops;
  await page.evaluate(() => { window.BW.runAction('insTable'); });
  await sh((r) => { r.querySelector('.dialog textarea').value = '4x2'; r.querySelector('.dialog [data-k="ok"]').click(); });
  await page.waitForTimeout(100);
  const t4 = await E();
  const blk = t4.doc.chapters[0].sections[2].blocks[0];
  check('editor: «جدول» 4×2 into an empty section: header row + 3 rows × 2 columns, one op', t4.ops === n + 1 && blk?.kind === 'table' && blk.columns.length === 2 && blk.rows.length === 3 && blk.rows.every((r) => r.length === 2), JSON.stringify(blk));
  await page.evaluate(() => window.BW.undo());
  check('editor: undo removes the table', !(await E()).doc.chapters[0].sections[2].blocks.length);
  // copy the stories block (Ctrl+C on a selected block), paste in the other document (Ctrl+V)
  const storiesPtr = await page.evaluate(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; for (let c = 0; c < d.chapters.length; c += 1) for (let s = 0; s < d.chapters[c].sections.length; s += 1) { const k = d.chapters[c].sections[s].blocks.findIndex((b) => b.kind === 'stories'); if (k >= 0) return `/chapters/${c}/sections/${s}/blocks/${k}`; } return null; });
  const storiesJson = await page.evaluate((p) => JSON.stringify(p.split('/').slice(1).reduce((o, k) => o[k], window.BW.M[window.BW.S.svc][window.BW.S.ed].doc)), storiesPtr);
  await page.evaluate((p) => { window.BW.S.sel = { b: p, p: null, ed: window.BW.S.ed }; document.activeElement?.blur?.(); getSelection().removeAllRanges(); }, storiesPtr);
  await page.keyboard.press('Control+c');
  const pB = await ctx.newPage();
  await pB.goto(pathToFileURL(fileB).href);
  await pB.waitForFunction(() => window.BW?.ready);
  const nb = await pB.evaluate(() => { const B = window.BW; B.S.sel = { b: '/chapters/0/sections/0/blocks/0', p: null, ed: B.S.ed }; return B.M[B.S.svc][B.S.ed].ops.length; });
  await pB.keyboard.press('Control+v');
  const pasted = await pB.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; return { ops: e.ops.length, block: JSON.stringify(e.doc.chapters[0].sections[0].blocks[1]) }; });
  check('editor: Ctrl+C / Ctrl+V copies the stories block into another document (same JSON, one op)', storiesPtr && pasted.ops === nb + 1 && pasted.block === storiesJson, `${pasted.ops - nb} op; same=${pasted.block === storiesJson}`);
  await pB.evaluate(() => window.BW.undo());
  check('editor: undo removes the pasted block', (await pB.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters[0].sections[0].blocks[1] ?? null))) !== storiesJson);
  check('editor: «فصل» and «قسم» insert a chapter and a section', await page.evaluate(() => { const B = window.BW; const e = () => B.M[B.S.svc][B.S.ed].doc; const c0 = e().chapters.length; const s0 = e().chapters[0].sections.length; B.S.sel = { p: '/chapters/0/title', b: null, ed: B.S.ed }; B.runAction('insSection'); B.runAction('insChapter'); return e().chapters.length === c0 + 1 && e().chapters[0].sections.length === s0 + 1; }));
  check('editor: no page errors', !errors.length, errors.join(' | '));
  if (process.env.BW_SHOTS) {
    await page.evaluate(() => document.querySelector('#bw-pair .bw-tb')?.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(process.env.BW_SHOTS, 'a23-text-box.png') });
  }
} finally {
  await b2.close();
}
// ── A23 in the PDF and DOCX ──────────────────────────────────────────────
{
  const pdf = path.join(tmp, 'tb.pdf');
  await exportPdf(tbDoc, { locale: tbDoc.chapters ? (/[ء-ي]/.test(tbDoc.control.title) ? 'ar' : 'en') : 'ar', theme, pdfPath: pdf });
  const all = pageTexts(pdf).join(' ');
  check('PDF: the text box words print once', (all.match(/BOXWORDS/g) || []).length === 1, String((all.match(/BOXWORDS/g) || []).length));
  const docx = path.join(tmp, 'tb.docx');
  exportDocx(tbDoc, { locale: /[ء-ي]/.test(tbDoc.control.title) ? 'ar' : 'en', theme, docxPath: docx, embedFonts: false });
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  const txbx = xml.match(/<wps:txbx>[\s\S]*?<\/wps:txbx>/)?.[0] || '';
  check('DOCX: a wps:txbx holds the box text, both font slots', txbx.includes('BOXWORDS') && /<w:rFonts w:ascii="[^"]+" w:hAnsi="[^"]+" w:cs="[^"]+"/.test(txbx));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
