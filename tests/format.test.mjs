// A26 selection format bar + rich leaves (0.13.0, design.md §3 A26). Rich leaf model (textOf, marks, rebase on
// typing), the single-reader grep gate, render (allow-list tags, nested lists), the PDF (poppler words, Thmanyah,
// no Type 3), the DOCX (w:b, w:hyperlink, w:numPr ilvl 0–5), the editor bar (one op per tool, Ctrl+B, find/replace
// across a bold run) and the back-compat golden (old documents render byte-identical). Headless Chrome, closed at the end.
//
//   node tests/format.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { textOf, isRich, markLeaf, withText, hasMark, styleLeaf, applyOp, applyOps, textLeaves, replaceFolded } from '../engine/edits.mjs';
import { goldenDiff } from './fixtures/doc-model/golden.mjs';
import { pageTexts, docxParts, pdfFonts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-format-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  format: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();

// ── 1. the rich leaf model ──────────────────────────────────────────────
{
  const b = markLeaf('one two three', 4, 7, 'b');
  check('markLeaf: a string becomes {text, marks}', isRich(b) && JSON.stringify(b.marks) === '[[4,7,"b"]]', JSON.stringify(b));
  check('textOf reads both shapes', textOf(b) === 'one two three' && textOf('x') === 'x' && textOf(null) === '' && textOf(7) === '7');
  check('hasMark / toggling off returns the plain string', hasMark(b, 4, 7, 'b') && markLeaf(b, 4, 7, 'b', null, false) === 'one two three');
  const typed = withText(b, 'one big two three');
  check('typing before a mark shifts it (common prefix/suffix rebase)', JSON.stringify(typed.marks) === '[[8,11,"b"]]' && typed.text === 'one big two three', JSON.stringify(typed));
  const doc = { x: b };
  applyOp(doc, { op: 'setText', path: '/x', value: 'one two three!' });
  check('setText on a rich leaf keeps its marks', isRich(doc.x) && doc.x.marks[0][2] === 'b' && doc.x.text === 'one two three!');
  check('styleLeaf: a style alone makes a rich leaf, removing it gives the string back', isRich(styleLeaf('a', { align: 'center' })) && styleLeaf(styleLeaf('a', { align: 'center' }), { align: null }) === 'a');
  const leaves = textLeaves({ control: { title: b }, revisions: [], chapters: [] });
  check('textLeaves: a rich leaf is ONE leaf (its words), not its parts', leaves.length === 1 && leaves[0].path === '/control/title' && leaves[0].value === 'one two three');
}

// ── 2. single reader: no text consumer reads a leaf with typeof === 'string' ──
{
  const consumers = ['engine/render.mjs', 'engine/learning/core.mjs', 'engine/docx/build_docx.py', 'engine/docx/model_docx.py', 'engine/docx/theme.py'];
  const bad = [];
  for (const f of consumers) {
    fs.readFileSync(path.join(REPO, f), 'utf8').split('\n').forEach((line, i) => {
      if (/leaf-ok/.test(line)) return;
      // a leaf read straight as a string: String(text|cell|para…), typeof … === 'string' on a value, str(cell_text)
      if (/String\((text|para|cell|c|v|leaf)\)/.test(line) && !/textOf|keepLeaf|isRich/.test(line)) bad.push(`${f}:${i + 1}`);
      if (/str\((cell_text|para_text|leaf)\)/.test(line) && !/is_rich|text_of/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  check('every text consumer reads leaves through textOf()/text_of() (grep gate)', !bad.length, bad.join(', '));
  const ed = fs.readFileSync(path.join(REPO, 'engine/edits.mjs'), 'utf8');
  check('textLeaves walks rich leaves through textOf', /isRich\(v\)\) \{ out\.push\(\{ path: p, value: textOf\(v\)/.test(ed));
}

// ── 3. back-compat: old documents render byte-identical (0.12.0 golden) ──
{
  const d = goldenDiff();
  check('samples with no new field: print HTML + header/footer templates byte-identical to 0.12.0', !d.length, d.join(', '));
}

// ── 4. render, PDF and DOCX of a formatted document ──────────────────────
const doc = sample(REPO, 'en');
const B = '/chapters/0/sections/0/blocks/0';
const blk = doc.chapters[0].sections[0].blocks[0];
const plainWords = blk.paragraphs[0];
blk.paragraphs[0] = markLeaf(markLeaf(blk.paragraphs[0], 0, 4, 'b'), 5, 9, 'i');
blk.paragraphs.push({ text: 'Visit the portal now', marks: [[10, 16, 'link', 'https://example.org/portal']] });
for (let l = 0; l < 6; l += 1) blk.paragraphs.push({ text: `Level ${l} item`, marks: [], style: { list: 'number', level: l } });
blk.paragraphs.push({ text: 'Sneaky <script>alert(1)</script>', marks: [[0, 6, 'link', 'javascript:alert(1)'], [0, 6, 'color', 'red;background:url(x)']] });
{
  const html = renderDocument(doc, { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  check('render: bold and italic as <b> / <i>', /<b>[^<]+<\/b> <i>[^<]+<\/i>/.test(html));
  check('render: a link as <a href> (http/https/mailto only)', html.includes('<a href="https://example.org/portal" class="bw-link">portal</a>') && !/javascript:/.test(html));
  check('render: user text never becomes markup; bad colour values dropped', html.includes('&lt;script&gt;') && !/red;background/.test(html));
  const levels = [...html.matchAll(/<ol class="bw-list" data-level="(\d)" style="list-style-type:([a-z-]+)">/g)].map((m) => `${m[1]}:${m[2]}`);
  check('render: 6 nested numbered levels, 1. / a. / i. per level', levels.join(',') === '0:decimal,1:lower-alpha,2:lower-roman,3:decimal,4:lower-alpha,5:lower-roman', levels.join(','));
}
const pdf = path.join(tmp, 'fmt.pdf');
await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf });
{
  const all = pageTexts(pdf).join('\n');
  const words = String(plainWords).match(/\p{L}+/gu); // letters only: a hyphen at a line end splits a token, not a word
  check('PDF (poppler): every word of the formatted paragraph is there', words.every((w) => all.includes(w)), words.filter((w) => !all.includes(w)).join(' '));
  check('PDF: list numbers print 1. a. i.', /1\.\s*Level 0 item/.test(all) && /a\.\s*Level 1 item/.test(all) && /i\.\s*Level 2 item/.test(all), all.match(/.{0,6}Level \d item/g)?.join(' | '));
  const fonts = pdfFonts(pdf);
  check('PDF fonts: Thmanyah only, no Type 3', fonts.length > 0 && fonts.every((f) => /Thmanyah/i.test(f.name)) && !fonts.some((f) => f.type === 'Type 3'), fonts.map((f) => f.name + ' ' + f.type).join('; '));
}
const docx = path.join(tmp, 'fmt.docx');
exportDocx(doc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
{
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  const rels = docxParts(docx, /^word\/_rels\/document\.xml\.rels$/)['word/_rels/document.xml.rels'];
  const runOf = (word) => xml.match(new RegExp(`<w:r>(?:(?!</w:r>).)*<w:t[^>]*>${word}</w:t>`, 's'))?.[0] || '';
  const firstWord = String(plainWords).slice(0, 4);
  check('DOCX: the bold word\'s run has w:b', /<w:b\/>/.test(runOf(firstWord)), runOf(firstWord).slice(0, 300));
  check('DOCX: the link is a w:hyperlink to its URL', /<w:hyperlink [^>]*r:id="(rId\d+)"/.test(xml) && rels.includes('https://example.org/portal'));
  const ilvl = [...xml.matchAll(/<w:ilvl w:val="(\d)"\/><w:numId w:val="(\d+)"\/>/g)].map((m) => +m[1]);
  check('DOCX: nested list levels w:ilvl 0–5', [0, 1, 2, 3, 4, 5].every((l) => ilvl.includes(l)), ilvl.join(','));
  const num = docxParts(docx, /^word\/numbering\.xml$/)['word/numbering.xml'];
  check('DOCX: numbering 1. a. i. per level (decimal, lowerLetter, lowerRoman)', /w:ilvl="1"><w:start w:val="1"\/><w:numFmt w:val="lowerLetter"/.test(num) && /w:ilvl="2"><w:start w:val="1"\/><w:numFmt w:val="lowerRoman"/.test(num));
  check('DOCX: runs carry both font slots (ascii + cs)', /<w:rFonts w:ascii="[^"]+" w:hAnsi="[^"]+" w:cs="[^"]+"/.test(runOf(firstWord)));
}

// ── 5. the editor's format bar ───────────────────────────────────────────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'fmt-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ops = () => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const P = `${B}/paragraphs/0`;
  const leaf = () => page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return o; }, P);
  const hidden = () => page.evaluate(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.island .sec[data-cat="format"]'));
  check('editor: the format section waits hidden until text is selected', (await hidden()) === true);
  // a real selection of the paragraph's first word
  await page.evaluate((p) => {
    const el = document.querySelector(`#bw-pair main.bw-doc [data-p="${p}"]`);
    el.focus();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const n = walk.nextNode();
    const end = n.data.indexOf(' ');
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, end);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  }, P);
  await page.waitForTimeout(50);
  check('editor: a text range shows the format section', (await hidden()) === false);
  let n0 = await ops();
  await page.keyboard.press('Control+b');
  const afterB = await leaf();
  check('editor: Ctrl+B bolds the selected word in ONE op', (await ops()) === n0 + 1 && isRich(afterB) && afterB.marks.some((m) => m[2] === 'b' && m[0] === 0), JSON.stringify(afterB).slice(0, 200));
  n0 = await ops();
  await page.evaluate(() => window.BW.runAction('fmtItalic'));
  check('editor: a toolbar tool (Italic) keeps the remembered range: one op', (await ops()) === n0 + 1 && (await leaf()).marks.some((m) => m[2] === 'i' && m[0] === 0));
  n0 = await ops();
  await page.evaluate(() => window.BW.runAction('fmtAlignCenter'));
  check('editor: paragraph style (centre) is one op and prints as text-align', (await ops()) === n0 + 1 && (await page.evaluate((p) => getComputedStyle(document.querySelector(`#bw-pair [data-p="${p}"]`)).textAlign, P)) === 'center');
  n0 = await ops();
  await page.evaluate(() => window.BW.runAction('fmtNumbers'));
  check('editor: numbering is one op and the paragraph becomes a list item', (await ops()) === n0 + 1 && (await page.evaluate((p) => !!document.querySelector(`#bw-pair li[data-level] [data-p="${p}"]`), P)));
  for (let k = 0; k < 6; k += 1) await page.evaluate(() => window.BW.runAction('fmtIndent'));
  check('editor: indent reaches level 6 (≥ 6 nested levels)', (await leaf()).style.level === 6 && (await page.evaluate((p) => document.querySelector(`#bw-pair [data-p="${p}"]`).closest('ol[data-level]')?.dataset.level, P)) === '6');
  // find / replace across a bold run keeps the marks
  const word = (await leaf()).text.split(' ')[0];
  const nRep = await page.evaluate((w) => window.BW.replaceAll(w, 'XYZW'), word);
  const repl = await leaf();
  check('editor: find/replace across a bold run keeps it bold', nRep >= 1 && repl.text.startsWith('XYZW') && repl.marks.some((m) => m[2] === 'b' && m[0] === 0 && m[1] === 4), JSON.stringify(repl).slice(0, 200));
  await page.evaluate(() => window.BW.undo());
  check('editor: undo restores the word, marks kept', (await leaf()).text.startsWith(word) && (await leaf()).marks.some((m) => m[2] === 'b'));
  // a font mark is Thmanyah only; a link must be http(s)/mailto
  const ok = await page.evaluate(() => { const F = window.BW.EXT.w2format; F.select({ path: '/chapters/0/sections/0/blocks/0/paragraphs/0', start: 0, end: 3 }); return F.mark('font', 'Thmanyah Sans'); });
  check('editor: font family mark (Thmanyah Sans) applied', ok && (await page.evaluate((p) => document.querySelector(`#bw-pair [data-p="${p}"] span[style*="Thmanyah Sans"]`) != null, P)));
  { // 0.13.1 final pass #3 (extras2 #9): Ctrl+A in a bullet with mixed formatting, Ctrl+B, then a colour: every word, not the last
    const li = await page.evaluate(() => { const B = window.BW; const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="${B.S.ed}"] li[data-p][data-pfx]`); return el && { p: el.dataset.p, pfx: el.dataset.pfx.length, n: el.textContent.length }; });
    const leafAt = (p) => page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return o; }, p);
    await page.evaluate((li) => { const F = window.BW.EXT.w2format; F.select({ path: li.p, start: li.pfx, end: li.pfx + 4 }); F.mark('i'); }, li); // mixed: one word italic
    const sel = `#bw-pair main.bw-doc [data-p="${li.p}"]`;
    await page.click(`${sel} i`);
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Control+B'); // at once: before the selectionchange event
    const kept = await page.evaluate(() => getSelection().toString().length);
    await page.evaluate(() => window.BW.EXT.w2format.mark('color', '#c0392b'));
    const v = await leafAt(li.p);
    const full = (ty) => (v.marks || []).some(([a, b, t]) => t === ty && a <= li.pfx && b >= li.pfx + li.n);
    check('editor: Ctrl+A on a mixed-format bullet, Ctrl+B then a colour cover the whole bullet (range kept after each op)', full('b') && full('color') && kept >= li.n - 1, JSON.stringify({ marks: v.marks, kept, li }));
  }
  check('editor: no page errors', !errors.length, errors.join(' | '));
  if (process.env.BW_SHOTS) {
    await page.evaluate((p) => document.querySelector(`#bw-pair [data-p="${p}"]`).scrollIntoView({ block: 'center' }), P);
    await page.screenshot({ path: path.join(process.env.BW_SHOTS, 'a26-format-bar.png') });
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
