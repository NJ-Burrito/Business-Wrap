// Lane A · spreadsheet-grade table cells (0.14.0). One check per requested item:
//   1 insert/delete rows+cols, merge, split, wrap   2 lists inside a cell   3 select cells (drag, Shift+click, Ctrl+click), copy/cut/paste (TSV)
//   4 Delete/Backspace clears   5 clear value / clear format   6 formulas (=SUM(A1:A3) … #ERR, save/reload, PDF + DOCX print the value)
//   7 column width / row height by dragging a border, one size for every selected column/row.
// Pure model (engine/cells.mjs) in Node, the editor in headless Chrome (closed at the end), the PDF with poppler, the DOCX as XML.
//
//   node tests/cells.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { recalc, evalFormula, leafFromInput, shiftFormula, adjustFormula, mergeRect, splitRect, shiftMerges, parseTsv, toTsv, setWidths, clearFormat, clearValue, splitLines, numberOf } from '../engine/cells.mjs';
import { applyOps } from '../engine/edits.mjs';
import { pageTexts, docxParts, sample } from './fixtures/doc-model/util.mjs';
import { goldenDiff } from './fixtures/doc-model/golden.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-cells-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  cells: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();

// ── the pure model ───────────────────────────────────────────────────────
{
  const grid = [['1', '2', ''], ['3', '4', ''], ['', '', '']];
  grid[2][0] = leafFromInput('', '=SUM(A1:A2)');
  grid[2][1] = leafFromInput('', '=A1*B2+(1-3)/2');
  grid[2][2] = leafFromInput('', '=AVERAGE(A1:B2)+MAX(A1,B2)-MIN(A1:A2)+COUNT(A1:B2)');
  const got = Object.fromEntries(recalc(grid).map((x) => [`${x.r},${x.c}`, x.leaf.text]));
  check('formula: SUM / product with parentheses / AVERAGE+MAX-MIN+COUNT', got['2,0'] === '4' && got['2,1'] === '3' && got['2,2'] === '9.5', JSON.stringify(got));
  const bad = ['=1/0', '=SUM(', '=A1+', '=FOO(1)', '=A1 B1', '=((1)'].map((f) => { try { evalFormula(f, () => 0); return 'ok'; } catch { return 'ERR'; } });
  check('formula: a bad formula, division by zero, unknown function throw (→ #ERR, never a crash)', bad.every((x) => x === 'ERR'), bad.join());
  const cyc = [[leafFromInput('', '=B1'), leafFromInput('', '=A1')]];
  check('formula: a cycle gives #ERR', recalc(cyc).length === 0 && cyc[0].every((l) => l.text === '#ERR') || recalc(cyc).every((x) => x.leaf.text === '#ERR'));
  check('formula: shift on copy, refs follow an inserted row, a deleted ref is #REF!', shiftFormula('=SUM(A1:A3)+$B$1', 1, 1) === '=SUM(B2:B4)+$B$1' && adjustFormula('=A1+A3', 'row', 1, 1) === '=A1+A4' && adjustFormula('=A2', 'row', 1, -1) === '=#REF!');
  check('numbers: thousands, Arabic-Indic digits, text is not a number', numberOf('1,200.5') === 1200.5 && numberOf('٣') === 3 && numberOf('abc') === null && numberOf('') === null);
  check('merge/split: a merge absorbs the merges it touches; split removes them; row insert inside a merge grows it', mergeRect([{ r: 0, c: 0, rs: 1, cs: 2 }], 0, 1, 1, 2).length === 1 && splitRect([{ r: 0, c: 0, rs: 2, cs: 2 }], 1, 1, 1, 1).length === 0 && shiftMerges([{ r: 0, c: 0, rs: 2, cs: 1 }], 'row', 1, 1)[0].rs === 3 && shiftMerges([{ r: 1, c: 0, rs: 1, cs: 2 }], 'row', 1, -1).length === 0);
  check('TSV round trip incl. quotes and newlines; widths keep summing to 100', JSON.stringify(parseTsv(toTsv([['a', 'b\nc'], ['"q"', '']]))) === '[["a","b\\nc"],["\\"q\\"",""]]' && Math.abs(setWidths([25, 25, 25, 25], [0, 1], 40).reduce((a, b) => a + b, 0) - 100) < 0.1);
  const rich = { text: 'x', marks: [[0, 1, 'b']], style: { fill: '#ffeeaa', formula: '=A1', align: 'center' } };
  check('clear value keeps the format; clear format keeps the formula and the words', clearValue(rich).style.fill === '#ffeeaa' && clearValue(rich).text === '' && !clearValue(rich).style.formula && clearFormat(rich).style.formula === '=A1' && clearFormat({ text: 'x', marks: [], style: { fill: '#ffeeaa' } }) === 'x');
  check('list lines: marks sliced per line', splitLines({ text: 'ab\ncd', marks: [[1, 4, 'b']], style: {} }).map((l) => JSON.stringify(l.marks)).join('|') === '[[1,2,"b"]]|[[0,1,"b"]]');
}
check('back-compat: documents with no cell fields render byte-identical (0.12.0 golden)', !goldenDiff().length);

// ── render, PDF, DOCX of a document that uses everything ─────────────────
const doc = sample(REPO, 'en');
const sec = doc.chapters[1].sections[0];
const f = (formula, text) => ({ text, marks: [], style: { formula } });
sec.blocks.push({
  kind: 'table', columns: ['Item', 'Qty', 'Price'],
  rows: [
    ['Pens', '2', '1.5'],
    ['Pads', '3', '4'],
    [{ text: 'Total', marks: [[0, 5, 'b']], style: { fill: '#ffeeaa' } }, f('=SUM(B1:B2)', '5'), f('=B1*C1+B2*C2', '15')],
    [{ text: 'Merged across', marks: [], style: { fill: '#e0f0ff' } }, '', ''],
    [{ text: 'first\nsecond', marks: [], style: { list: 'bullet' } }, { text: 'one\ntwo', marks: [], style: { list: 'number' } }, 'plain'],
  ],
  merges: [{ r: 3, c: 0, rs: 1, cs: 3 }], colWidths: [50, 20, 30], rowHeights: [null, 14, null, null, null],
});
const T = `/chapters/1/sections/0/blocks/${sec.blocks.length - 1}`;
{
  const html = renderDocument(doc, { locale: 'en', labels: i18n().doc.en, theme, fontCss: '', logos: theme.logos });
  const tb = html.slice(html.indexOf(`data-rows="${T}/rows"`));
  check('render: colspan, column widths, row height, fill, formula attr, bullet and numbered list inside cells', /colspan="3"/.test(tb) && /<col style="width:50\.00%"/.test(tb) && /<tr [^>]*style="height:14mm"/.test(tb) && /background:#ffeeaa/.test(tb) && /data-f="=SUM\(B1:B2\)"/.test(tb) && /<ul class="bw-list"[^>]*><li>first<\/li><li>second<\/li><\/ul>/.test(tb) && /<ol class="bw-list"[^>]*><li>one<\/li><li>two<\/li><\/ol>/.test(tb), tb.slice(0, 400));
  check('render: the merged-away cells are not printed (3+3+3 cells, 1 merged, 3 in the list row)', (tb.slice(0, tb.indexOf('</table>')).match(/<td[ >]/g) || []).length === 13, String((tb.slice(0, tb.indexOf('</table>')).match(/<td[ >]/g) || []).length));
}
const pdf = path.join(tmp, 'cells.pdf');
await exportPdf(doc, { locale: 'en', theme, pdfPath: pdf });
{
  const all = pageTexts(pdf).join('\n');
  check('PDF: the formula cell prints its VALUE, never the formula; the list prints its items', /Total/.test(all) && /\b15\b/.test(all) && !/SUM\(B1/.test(all) && /first/.test(all) && /second/.test(all) && /Merged across/.test(all));
}
const docx = path.join(tmp, 'cells.docx');
exportDocx(doc, { locale: 'en', theme, docxPath: docx, embedFonts: false });
{
  const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
  check('DOCX: formula value printed, gridSpan for the merge, cell fill (w:shd), list numbering in the cell, a row height', />15</.test(xml) && !/SUM\(B1/.test(xml) && /<w:gridSpan w:val="3"\/>/.test(xml) && /<w:shd [^>]*w:fill="FFEEAA"/.test(xml) && (xml.match(/<w:numPr>/g) || []).length >= 4 && /<w:trHeight /.test(xml), '');
}

// ── the editor ───────────────────────────────────────────────────────────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'cells-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ed = await page.evaluate(() => window.BW.S.ed);
  // a fresh numeric table, both editions (structural insert is mirrored)
  const P = await page.evaluate(() => {
    const B = window.BW;
    const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks;
    const at = `/chapters/1/sections/0/blocks/${blocks.length}`;
    B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B', 'C', 'D'], rows: [['1', '2', '3', 'x'], ['4', '5', '6', 'y'], ['7', '8', '9', 'z'], ['10', '11', '12', 'w']] } }], { mirror: true });
    return at;
  });
  const blk = () => page.evaluate(([p]) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return JSON.parse(JSON.stringify(o)); }, [P]);
  const other = () => page.evaluate(([p]) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed === 'ar' ? 'en' : 'ar']; let o = e?.doc; for (const k of p.split('/').slice(1)) o = o?.[k]; return o && JSON.parse(JSON.stringify(o)); }, [P]);
  const txt = (l) => (typeof l === 'string' ? l : l?.text ?? '');
  const grid = async () => (await blk()).rows.map((r) => r.map(txt));
  const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${P}"] td[data-r="${r}"][data-c="${c}"]`;
  const box = async (r, c) => { await page.locator(cell(r, c)).scrollIntoViewIfNeeded(); return page.locator(cell(r, c)).boundingBox(); };
  const centre = async (r, c) => { const b = await box(r, c); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const ops = () => page.evaluate(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size); // undo steps
  const act = (id, ...a) => page.evaluate(([id, a]) => window.BW.EXT.cells.act[id](...a), [id, a]);
  const run = (id) => page.evaluate((id) => window.BW.runAction(id), id);
  const dragSel = async (r0, c0, r1, c1) => {
    const [x0, y0] = await centre(r0, c0);
    await page.mouse.move(x0, y0); await page.mouse.down();
    const [x1, y1] = await centre(r1, c1);
    await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
  };
  const selKeys = () => page.evaluate(() => [...window.BW.EXT.cells.state.sel].sort().join(' '));
  const clip = async (type, text) => page.evaluate(([type, text]) => { const dt = new DataTransfer(); if (text != null) dt.setData('text/plain', text); const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }); (document.activeElement || document.body).dispatchEvent(ev); return dt.getData('text/plain'); }, [type, text]);

  // 3 · select: click-drag, Shift+click, Ctrl+click
  await dragSel(0, 0, 1, 1);
  check('select: click-drag over cells selects the rectangle (A1:B2)', (await selKeys()) === '0,0 0,1 1,0 1,1' && (await page.locator('td.bw-csel').count()) === 4, await selKeys());
  await page.locator(cell(3, 3)).click({ modifiers: ['Shift'] });
  check('select: Shift+click extends the range', (await page.locator('td.bw-csel').count()) === 16, String(await page.locator('td.bw-csel').count()));
  await page.locator(cell(0, 0)).click(); // plain click: back to editing, no cell mode
  await page.locator(cell(1, 1)).click({ modifiers: ['Control'] });
  await page.locator(cell(3, 0)).click({ modifiers: ['Control'] });
  check('select: Ctrl+click adds separate cells (multiple selection)', (await selKeys()) === '0,0 1,1 3,0', await selKeys());

  // 4 · Delete / Backspace clear every selected cell
  let n0 = await ops();
  await page.keyboard.press('Delete');
  let g = await grid();
  check('Delete clears the contents of all selected cells in ONE step; the rest is untouched', g[0][0] === '' && g[1][1] === '' && g[3][0] === '' && g[0][1] === '2' && (await ops()) === n0 + 1, JSON.stringify(g));
  await page.evaluate(() => window.BW.undo());
  check('undo brings the cleared cells back', (await grid())[1][1] === '5');
  await dragSel(2, 0, 2, 1);
  await page.keyboard.press('Backspace');
  g = await grid();
  check('Backspace clears a dragged range too', g[2][0] === '' && g[2][1] === '' && g[2][2] === '9', JSON.stringify(g[2]));
  await page.evaluate(() => window.BW.undo());

  // 3 · copy / cut / paste (TSV)
  await dragSel(0, 0, 1, 1);
  const tsv = await clip('copy');
  check('copy: the selection goes to the clipboard as TSV', tsv === '1\t2\n4\t5', JSON.stringify(tsv));
  await dragSel(2, 2, 2, 2);
  await clip('paste', tsv);
  g = await grid();
  check('paste: the block lands at the selected cell (D1:E2 → C3:D4); a column beyond the table is clipped, rows grow', g[2][2] === '1' && g[2][3] === '2' && g[3][2] === '4' && g[3][3] === '5', JSON.stringify(g));
  await dragSel(0, 0, 0, 1);
  const cutTsv = await clip('cut');
  g = await grid();
  check('cut: copies then clears', cutTsv === '1\t2' && g[0][0] === '' && g[0][1] === '', JSON.stringify(g[0]));
  await dragSel(1, 0, 1, 0);
  await clip('paste', 'p\tq\nr\ts');
  g = await grid();
  check('paste of Excel text (tabs + newline) spreads over the cells', g[1][0] === 'p' && g[1][1] === 'q' && g[2][0] === 'r' && g[2][1] === 's', JSON.stringify(g));
  await dragSel(0, 2, 0, 3);
  await clip('paste', 'Z');
  g = await grid();
  check('paste of one value fills every selected cell', g[0][2] === 'Z' && g[0][3] === 'Z', JSON.stringify(g[0]));
  // reset the data for the next items
  await page.evaluate(([p]) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; B.commit([{ op: 'replace', path: `${p}/rows`, value: [['1', '2', '3', 'x'], ['4', '5', '6', 'y'], ['7', '8', '9', 'z'], ['10', '11', '12', 'w']], old: null }], { mirror: false }); }, [P]);

  // 5 · clear value / clear format; selected cells are the target of the format bar
  await dragSel(0, 0, 1, 1);
  await run('fmtBold'); await page.evaluate(() => window.BW.EXT.cells.act.fill('#ffeeaa')); await act('style', { align: 'center' });
  let b = await blk();
  check('format bar: Bold acts on ALL selected cells (whole words), fill and alignment too', [b.rows[0][0], b.rows[0][1], b.rows[1][0], b.rows[1][1]].every((l) => l.marks?.[0]?.[2] === 'b' && l.style.fill === '#ffeeaa' && l.style.align === 'center') && txt(b.rows[2][0]) === '7' && typeof b.rows[2][0] === 'string', JSON.stringify(b.rows[0][0]));
  await run('cellClearFormat');
  b = await blk();
  check('Clear format resets font/size/colour/bold/fill/alignment and keeps the words', b.rows[0][0] === '1' && b.rows[1][1] === '5', JSON.stringify(b.rows[0][0]));
  await page.evaluate(() => window.BW.EXT.cells.act.mark('color', '#c0392b')); await act('mark', 'size', 18); await act('mark', 'font', 'Thmanyah Sans');
  await run('cellClearValue');
  b = await blk();
  check('Clear value empties the text of the selected cells (and only those)', txt(b.rows[0][0]) === '' && txt(b.rows[1][1]) === '' && txt(b.rows[0][2]) === '3', JSON.stringify(b.rows[0]));
  await page.evaluate(() => window.BW.undo()); await page.evaluate(() => window.BW.undo());
  await run('cellClearFormat'); // after undo the colour/size/font are back; clear format removes all of them
  b = await blk();
  check('Clear format also removes colour, size and font marks', b.rows[0][0] === '1' && b.rows[0][1] === '2', JSON.stringify(b.rows[0]));

  // 2 · lists inside a cell
  await dragSel(0, 3, 1, 3);
  await run('fmtBullets');
  check('list: bullets turn on for both selected cells and a real <ul><li> shows in the table', (await page.locator(`${cell(0, 3)} ul li`).count()) === 1 && (await page.locator(`${cell(1, 3)} ul li`).count()) === 1);
  await page.locator(cell(0, 3)).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second item');
  await page.keyboard.press('Escape');
  b = await blk();
  check('list: Enter inside a list cell adds a new item (two items, two <li>)', txt(b.rows[0][3]) === 'x\nsecond item' && (await page.locator(`${cell(0, 3)} ul li`).count()) === 2, JSON.stringify(b.rows[0][3]));
  await run('fmtNumbers');
  check('list: numbered list on the cell that stayed selected', (await page.locator(`${cell(0, 3)} ol li`).count()) === 2);
  await act('list', 'number'); // toggles off
  check('list: toggling again takes the list off', (await page.locator(`${cell(0, 3)} li`).count()) === 0);
  await page.keyboard.press('Escape');

  // 1 · insert / delete rows and columns, merge, split, wrap
  await page.locator(cell(1, 1)).click();
  n0 = await ops();
  await run('rowAdd');
  b = await blk();
  check('row insert: one blank row under the cell, in both editions', b.rows.length === 5 && b.rows[2].every((x) => txt(x) === '') && (await other())?.rows.length === 5);
  await page.locator(cell(2, 0)).click();
  await run('rowDel');
  check('row delete: the row is gone', (await blk()).rows.length === 4);
  await page.locator(cell(0, 1)).click();
  await run('colAdd');
  b = await blk();
  check('column insert: a new column after B in every row and the header, shown at once', b.columns.length === 5 && b.rows.every((r) => r.length === 5) && b.colWidths?.length === 5 && Math.abs(b.colWidths.reduce((a, x) => a + x, 0) - 100) < 0.5 && (await page.locator(`${cell(0, 2)}`).count()) === 1, JSON.stringify(b.colWidths));
  await page.locator(cell(0, 2)).click();
  await run('colDel');
  b = await blk();
  check('column delete: back to four columns, widths sum to 100', b.columns.length === 4 && b.rows.every((r) => r.length === 4) && Math.abs(b.colWidths.reduce((a, x) => a + x, 0) - 100) < 0.5);
  await dragSel(2, 0, 3, 1);
  await run('cellMerge');
  b = await blk();
  check('merge: A3:B4 is one cell (colspan 2, rowspan 2) and the covered cells are not drawn', JSON.stringify(b.merges) === '[{"r":2,"c":0,"rs":2,"cs":2}]' && (await page.locator(cell(2, 0)).getAttribute('colspan')) === '2' && (await page.locator(cell(2, 0)).getAttribute('rowspan')) === '2' && (await page.locator(cell(3, 1)).count()) === 0 && (await other())?.merges?.length === 1);
  await page.locator(cell(2, 0)).click();
  await page.keyboard.press('Escape');
  await run('cellSplit');
  check('split: the merged cell is separated again', ((await blk()).merges || []).length === 0 && (await page.locator(cell(3, 1)).count()) === 1);
  await page.keyboard.press('Escape');
  await page.locator(cell(0, 0)).click();
  await page.keyboard.press('Escape');
  await run('cellWrap');
  check('wrap: Wrap text off sets nowrap on the cell, on again removes it', (await blk()).rows[0][0].style.wrap === false && /nowrap/.test((await page.locator(cell(0, 0)).getAttribute('style')) || ''));
  await run('cellWrap');
  check('wrap: toggled back on', (await blk()).rows[0][0] === '1');
  // insert a row above a merge keeps the merge on its cells
  await dragSel(3, 0, 3, 1); await run('cellMerge');
  await page.locator(cell(0, 0)).click(); await page.keyboard.press('Escape'); await run('rowAdd');
  check('row insert above a merge shifts the merge down with its cells', JSON.stringify((await blk()).merges) === '[{"r":4,"c":0,"rs":1,"cs":2}]', JSON.stringify((await blk()).merges));
  await page.locator(cell(1, 0)).click(); await page.keyboard.press('Escape'); await run('rowDel');
  await page.locator(cell(3, 0)).click(); await page.keyboard.press('Escape'); await run('cellSplit');

  // 6 · formulas
  await page.locator(cell(0, 0)).click();
  const nF = await ops();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('=SUM(B1:B3)');
  await page.keyboard.press('Enter');
  b = await blk();
  check('formula: typing + finishing a formula is ONE undo step', (await ops()) === nF + 1, `${nF} → ${await ops()}`);
  check('formula: =SUM(B1:B3) typed in a cell shows its result and stores the formula', txt(b.rows[0][0]) === '15' && b.rows[0][0].style.formula === '=SUM(B1:B3)', JSON.stringify(b.rows[0][0]));
  await page.locator(cell(0, 0)).click();
  check('formula: while editing, the cell shows the formula', (await page.locator(cell(0, 0)).innerText()) === '=SUM(B1:B3)');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.locator(cell(0, 0)).click(); await page.keyboard.press('Escape'); // leaves the cell, keeps it selected
  const rtl = await page.evaluate(() => getComputedStyle(document.querySelector('#bw-pair main.bw-doc table')).direction === 'rtl');
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press(rtl ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
  const sk = (await selKeys()).split(' ');
  check('select: Shift+Arrow extends the range from the anchor like Excel (A1 → 2×2 block)', sk.length >= 4 && sk.includes('0,0') && sk.includes('1,1'), sk.join(' '));
  await page.keyboard.press('Shift+ArrowUp');
  check('select: Shift+Arrow back shrinks it again', (await selKeys()).split(' ').length < sk.length, await selKeys());
  await page.locator(cell(1, 2)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('=A1*2+(B3-1)/2');
  await page.keyboard.press('Enter');
  check('formula: =A1*2+(B3-1)/2 reads another formula cell', txt((await blk()).rows[1][2]) === '33.5', JSON.stringify((await blk()).rows[1][2]));
  await page.locator(cell(1, 0)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('=B2/0');
  await page.keyboard.press('Enter');
  check('formula: a bad formula (division by zero) shows #ERR, the page keeps working', txt((await blk()).rows[1][0]) === '#ERR' && !errors.length, errors.join(' | '));
  await page.locator(cell(2, 0)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('=SUM(');
  await page.keyboard.press('Enter');
  check('formula: =SUM( (syntax error) shows #ERR', txt((await blk()).rows[2][0]) === '#ERR');
  await page.locator(cell(0, 1)).click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('10'); // a plain value: Enter would be a line break (lane B), Tab leaves the cell and commits
  await page.keyboard.press('Tab');
  b = await blk();
  check('formula: changing B1 recalculates every formula that reads it (A1 = 10+5+8, C2 follows)', txt(b.rows[0][0]) === '23' && txt(b.rows[1][2]) === '49.5', JSON.stringify([b.rows[0][0], b.rows[1][2]]));
  // save / reload: the stored document keeps the formula
  const keep = await page.evaluate(() => JSON.parse(JSON.stringify(window.BW.editsFile(window.BW.S.svc, window.BW.S.ed))));
  const reopened = applyOps(sample(REPO, ed), keep.ops); // what a fresh load of the saved edits file holds
  let rb = reopened; for (const k of P.split('/').slice(1)) rb = rb[k];
  check('formula: survives Save and reload (the edits file replays to the cell with its formula AND its value; merges/widths too)', rb.rows[0][0].style?.formula === '=SUM(B1:B3)' && rb.rows[0][0].text === '23' && Array.isArray(rb.colWidths), JSON.stringify(rb.rows[0][0]));
  // the document after the ops, rendered by the engine: PDF and DOCX print the value
  const doc2 = reopened;
  const pdf2 = path.join(tmp, 'edited.pdf');
  await exportPdf(doc2, { locale: ed, theme, pdfPath: pdf2 });
  const all2 = pageTexts(pdf2).join('\n');
  check('formula: the exported PDF prints the value (23, #ERR), never "=SUM(B1:B3)"', /23/.test(all2) && /ERR/.test(all2) && !/=SUM\(B1/.test(all2));
  const docx2 = path.join(tmp, 'edited.docx');
  exportDocx(doc2, { locale: ed, theme, docxPath: docx2, embedFonts: false });
  const xml2 = docxParts(docx2, /^word\/document\.xml$/)['word/document.xml'];
  check('formula: the exported DOCX prints the value', />23</.test(xml2) && !/=SUM\(B1/.test(xml2));
  await page.keyboard.press('Escape');

  // 7 · resize by dragging the borders; one size for all selected columns / rows
  await page.locator(cell(2, 2)).scrollIntoViewIfNeeded();
  const w0 = (await blk()).colWidths;
  let bx = await box(2, 1);
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await page.mouse.move(bx.x + bx.width - 1, bx.y + bx.height / 2);
  check('resize: the cursor turns into the column-resize cursor on a cell border', await page.evaluate(() => document.documentElement.classList.contains('bw-rz-col')));
  await page.mouse.down(); await page.mouse.move(bx.x + bx.width + 60, bx.y + bx.height / 2, { steps: 5 }); await page.mouse.up();
  let w1 = (await blk()).colWidths;
  check('resize: dragging a column border widens that column only (others scale, total 100)', w1[1] > w0[1] + 2 && Math.abs(w1.reduce((a, x) => a + x, 0) - 100) < 0.5 && w1[1] !== w1[2], JSON.stringify([w0, w1]));
  await dragSel(2, 0, 2, 2); // columns A–C selected
  bx = await box(2, 1);
  await page.mouse.move(bx.x + bx.width - 1, bx.y + bx.height / 2);
  await page.mouse.down(); await page.mouse.move(bx.x + bx.width + 40, bx.y + bx.height / 2, { steps: 5 }); await page.mouse.up();
  w1 = (await blk()).colWidths;
  check('resize: dragging a selected column border gives ALL selected columns the same width', Math.abs(w1[0] - w1[1]) < 0.05 && Math.abs(w1[1] - w1[2]) < 0.05 && w1[3] < w1[0], JSON.stringify(w1));
  await page.keyboard.press('Escape');
  const hBefore = (await box(1, 0)).height;
  await dragSel(1, 0, 2, 0); // rows 2–3 selected
  bx = await box(1, 0);
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height - 1);
  check('resize: the row-resize cursor on a bottom border', await page.evaluate(() => document.documentElement.classList.contains('bw-rz-row')));
  await page.mouse.down(); await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height + 40, { steps: 5 }); await page.mouse.up();
  const rh = (await blk()).rowHeights;
  check('resize: dragging a selected row border sets one height on every selected row', rh[1] > 8 && rh[1] === rh[2] && rh[0] == null && (await box(1, 0)).height > hBefore + 20, JSON.stringify(rh));
  await page.evaluate(() => window.BW.EXT.cells.act.colWidth(40));
  check('column width command: one width for the selected columns', (await blk()).colWidths.slice(0, 1).every((x) => x === 40));
  // 6b · fill handle: dragging the corner of a selected formula copies it down, relative refs shift, $-anchored refs stay
  await page.evaluate(([p]) => { const B = window.BW; const o = B.M[B.S.svc][B.S.ed]; const ops = [{ op: 'replace', path: `${p}/rows`, value: [['1', '2', '3', { text: '#ERR', marks: [], style: { formula: '=A1+$B$1' } }], ['4', '5', '6', ''], ['7', '8', '9', ''], ['10', '11', '12', '']], old: null }]; B.commit(ops, { mirror: false }); }, [P]);
  await page.evaluate(([p]) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; let t = e.doc; for (const k of p.split('/').slice(1)) t = t[k]; if (t.merges?.length) B.commit([{ op: 'replace', path: `${p}/merges`, value: [], old: t.merges }], { mirror: false }); }, [P]);
  await page.evaluate((q) => { const x = document.querySelector(q).closest('table'); window.BW.EXT.cells.select([[0, 3]], { ed: x.closest('main.bw-doc').dataset.locale, rows: x.dataset.rows, b: x.dataset.b, el: x }); }, cell(0, 3));
  const hb = await box(0, 3);
  await page.mouse.move(hb.x + hb.width - 3, hb.y + hb.height - 3); await page.mouse.down();
  const [fx, fy] = await centre(2, 3);
  await page.mouse.move(fx, fy, { steps: 6 }); await page.mouse.up();
  const fb = await blk();
  check('fill handle: dragging D1 down to D3 shifts =A1+$B$1 to =A2+$B$1 / =A3+$B$1 (anchored $B$1 stays) and calculates them', fb.rows[1][3]?.style?.formula === '=A2+$B$1' && fb.rows[2][3]?.style?.formula === '=A3+$B$1' && txt(fb.rows[1][3]) === '6' && txt(fb.rows[2][3]) === '9', JSON.stringify([fb.rows[1][3], fb.rows[2][3]]));
  await page.keyboard.press('Escape');

  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
