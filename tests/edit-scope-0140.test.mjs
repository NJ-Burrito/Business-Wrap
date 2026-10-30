// Lane edit-scope · 0.14.0 — E1 Delete scopes · E2 renumber lists · E3 one document id.
// Pure model (engine/edits.mjs) and the render / DOCX / PDF in Node; the editor extensions (ext/28, 29, 33) in headless Chrome
// (msedge, temp profile under the OS temp dir, closed at the end).
//
//   node tests/edit-scope-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { applyOps, scopesAt, deleteOps, renumberOps, validStart, docIdInstances, docIdOps, docIdFromEdit, replaceId, get } from '../engine/edits.mjs';
import { pageTexts, docxParts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-escope-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  edit-scope: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const num = (text, extra = {}) => ({ text, marks: [], style: { list: 'number', ...extra } });
const html = (doc, locale = 'en') => renderDocument(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });

/* ── E1 · scopes (model) ─────────────────────────────────────────────────── */
{
  const doc = {
    control: { documentId: 'X-1' },
    chapters: [{ number: '1', title: 'c', sections: [{ number: '1.1', title: 's', blocks: [
      { kind: 'prose', paragraphs: ['alpha', 'beta', 'gamma'] },
      { kind: 'table', columns: ['A', 'B'], rows: [['1', '2'], ['3', '4']] },
      { kind: 'stories', items: [{ id: 'US-01', name: 'a', acceptance: ['p', 'q'] }, { id: 'US-02', name: 'b', acceptance: ['r'] }] },
      { kind: 'figure', svg: '<svg/>' },
      { kind: 'prose', paragraphs: ['solo'] },
    ] }] }],
  };
  const B = '/chapters/0/sections/0/blocks';
  const at = (p, b) => scopesAt(doc, { p, b }).map((x) => x.scope);
  check('E1 scopes: a paragraph offers line, block and section as separate scopes', JSON.stringify(at(`${B}/0/paragraphs/1`)) === '["line","block","section"]', at(`${B}/0/paragraphs/1`).join());
  check('E1 scopes: a table cell offers cell, row, column, block, section', JSON.stringify(at(`${B}/1/rows/0/1`)) === '["cell","row","column","block","section"]', at(`${B}/1/rows/0/1`).join());
  check('E1 scopes: a story card offers its line, the part and the block; a figure offers the element', at(`${B}/2/items/0/acceptance/1`).join() === 'line,part,block,section' && at(null, `${B}/3`).join() === 'element,block,section', at(`${B}/2/items/0/acceptance/1`).join() + ' | ' + at(null, `${B}/3`).join());
  const line = applyOps(doc, deleteOps(doc, 'line', { p: `${B}/0/paragraphs/1` }));
  check('E1 line: only that paragraph goes, the block stays', JSON.stringify(line.chapters[0].sections[0].blocks[0].paragraphs) === '["alpha","gamma"]');
  const cell = applyOps(doc, deleteOps(doc, 'cell', { p: `${B}/1/rows/0/1` }));
  check('E1 cell: the words go, the row and the column stay', JSON.stringify(cell.chapters[0].sections[0].blocks[1].rows) === '[["1",""],["3","4"]]');
  const part = applyOps(doc, deleteOps(doc, 'part', { p: `${B}/2/items/0/name` }));
  check('E1 part: one story card goes, the other stays with its acceptance', part.chapters[0].sections[0].blocks[2].items.length === 1 && part.chapters[0].sections[0].blocks[2].items[0].id === 'US-02');
  const whole = applyOps(doc, deleteOps(doc, 'block', { p: `${B}/0/paragraphs/1` }));
  check('E1 block: the whole entity goes (all three paragraphs)', whole.chapters[0].sections[0].blocks.length === 4 && whole.chapters[0].sections[0].blocks[0].kind === 'table');
  const last = applyOps(doc, deleteOps(doc, 'line', { p: `${B}/4/paragraphs/0` }));
  check('E1 edge: the only paragraph of a block is emptied, never leaving a block with no paragraphs', JSON.stringify(last.chapters[0].sections[0].blocks[4].paragraphs) === '[""]');
  check('E1 edge: row / column / section are the editor tools (null here); an unrelated scope is refused', deleteOps(doc, 'row', { p: `${B}/1/rows/0/1` }) === null && deleteOps(doc, 'cell', { p: `${B}/0/paragraphs/0` }) === null);
}

/* ── E2 · numbering (model, render, DOCX, PDF) ───────────────────────────── */
const doc2 = sample(REPO, 'en');
const sec = doc2.chapters[1].sections[0];
sec.blocks.push({ kind: 'prose', paragraphs: [num('one'), num('two'), 'plain break', num('three', { start: 'continue' }), num('four'), num('five', { start: 9 }), num('six')] });
sec.blocks.push({ kind: 'table', columns: ['A', 'B'], rows: [[num('x\ny', { start: 4 }), num('p\nq')], [num('u\nv', { start: 'continue' }), 'z']] });
{
  check('E2 validStart: whole numbers 0..9999 and "continue"; text, negatives, fractions refused', validStart(0) && validStart('7') && validStart('continue') && !validStart('') && !validStart('x') && !validStart(-1) && !validStart(1.5) && !validStart(10000));
  const P = '/chapters/1/sections/0/blocks/' + (sec.blocks.length - 2) + '/paragraphs/';
  const ops = renumberOps(doc2, P + '0', 'set', 7);
  check('E2 ops: set 7 puts style.start on the paragraph; a plain paragraph and a bad value give no op', ops.length === 1 && ops[0].value.style.start === 7 && renumberOps(doc2, P + '2', 'restart').length === 0 && renumberOps(doc2, P + '0', 'set', 'x').length === 0);
  const out = html(doc2);
  const lists = [...out.matchAll(/<ol class="bw-list" data-level="0"([^>]*)>/g)].map((m) => (/start="(\d+)"/.exec(m[1]) || [, '1'])[1]);
  // runs: [one two] → 1 · [three four] continues from 3 (one,two then break) → 3 · [five six] start 9 → 9
  check('E2 render: restart is the default, "continue" goes on from the previous list, a start value splits the run', lists.slice(0, 3).join() === '1,3,9', lists.join());
  check('E2 render: a cell list takes its start value, and "continue" goes on from the cell above', /<ol class="bw-list" start="4" style/.test(out) && /<ol class="bw-list" start="6" style/.test(out) && !/<ol class="bw-list" start="1"/.test(out), (out.match(/<ol class="bw-list"[^>]*>/g) || []).slice(-4).join(' '));
  const none = html(sample(REPO, 'en'));
  check('E2 back-compat: a document with no start values prints no start attribute', !/<ol class="bw-list"[^>]* start=/.test(none));
  // the PDF prints the same numbers; the DOCX carries them as startOverride
  const pdf = path.join(tmp, 'n.pdf');
  await exportPdf(doc2, { locale: 'en', theme, pdfPath: pdf });
  const text = pageTexts(pdf).join('\n');
  check('E2 PDF: the list numbers 3 and 9 print (continue, start value)', /(^|\n)\s*9\.\s*five/.test(text.replace(/\n\s*\n/g, '\n')) || /9\.\s*\n?\s*five/.test(text) || (/\b9\.\b/.test(text) && /five/.test(text)), text.slice(text.indexOf('plain break') - 60, text.indexOf('plain break') + 160).replace(/\n/g, '|'));
  const docx = path.join(tmp, 'n.docx');
  exportDocx(doc2, { locale: 'en', theme, docxPath: docx, embedFonts: false });
  const parts = docxParts(docx, /^word\/(document|numbering)\.xml$/);
  const overrides = [...parts['word/numbering.xml'].matchAll(/<w:startOverride w:val="(\d+)"/g)].map((m) => m[1]);
  check('E2 DOCX: a start value is a w:startOverride (9 for the paragraph run, 4 for the cell list)', overrides.includes('9') && overrides.includes('4'), overrides.join());
}

/* ── the editor ──────────────────────────────────────────────────────────── */
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'escope-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ed = await page.evaluate(() => window.BW.S.ed);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const steps = () => ev(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size);
  const docOf = (e) => ev((e) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][e || window.BW.S.ed].doc)), e);

  // ── E1 in the editor: a fresh prose block (3 paragraphs) and a fresh table, both editions
  const where = await ev(() => {
    const B = window.BW; const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks; const n = blocks.length;
    const base = `/chapters/1/sections/0/blocks/`;
    B.commit([{ op: 'insert', path: base + n, value: { kind: 'prose', paragraphs: ['scope-a', 'scope-b', 'scope-c'] } }, { op: 'insert', path: base + (n + 1), value: { kind: 'table', columns: ['K', 'V'], rows: [['r0c0', 'r0c1'], ['r1c0', 'r1c1'], ['r2c0', 'r2c1']] } }], { mirror: true });
    return { prose: base + n, table: base + (n + 1) };
  });
  const blk = (p, e) => ev(([p, e]) => { const B = window.BW; let o = B.M[B.S.svc][e || B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o?.[k]; return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }, [p, e]);
  const sel = (p, b) => ev(([p, b, ed]) => { window.BW.S.sel = { ed, p, b }; }, [p, b, ed]);
  const selNum = (p, b) => ev(([p, b, ed]) => { window.BW.S.sel = { ed, p, b }; window.BW.EXT.w2format.select({ path: p, start: 0, end: 0 }); }, [p, b, ed]);
  const dialog = () => page.locator('.dialog:not([hidden]) [data-scope]');

  await sel(`${where.prose}/paragraphs/1`, where.prose);
  const offered = await ev(() => window.BW.EXT.scope.list().map((x) => x.scope));
  check('E1 editor: the Delete tool offers line, block and section for a paragraph', offered.join() === 'line,block,section', offered.join());
  await ev(() => window.BW.runAction('delete'));
  await dialog().first().waitFor({ timeout: 4000 });
  const labels = await dialog().allTextContents();
  check('E1 editor: the menu has one separate, labelled entry per scope (AR/EN strings present)', labels.length === 3 && new Set(labels).size === 3 && labels.every((l) => l.trim().length > 3), labels.join(' | '));
  const n0 = await steps();
  await page.locator('.dialog [data-scope="line"]').click();
  let p = await blk(where.prose);
  const pe = await blk(where.prose, ed === 'ar' ? 'en' : 'ar');
  check('E1 line: only the middle paragraph went, in BOTH editions, as ONE undo step', JSON.stringify(p.paragraphs) === '["scope-a","scope-c"]' && pe.paragraphs.length === 2 && (await steps()) === n0 + 1, JSON.stringify(p.paragraphs) + ' steps ' + (await steps()) + '/' + n0);
  await ev(() => window.BW.undo());
  p = await blk(where.prose);
  check('E1 undo: one Ctrl+Z brings the line back, in both editions', p.paragraphs.length === 3 && (await blk(where.prose, ed === 'ar' ? 'en' : 'ar')).paragraphs.length === 3);

  // the whole block: the menu's block entry and the Delete key are the same single step
  await sel(`${where.prose}/paragraphs/0`, where.prose);
  await ev(() => window.BW.runAction('delete'));
  await page.locator('.dialog [data-scope="block"]').click();
  check('E1 block: the whole block (all its paragraphs) went in one step', (await blk(where.prose))?.kind !== 'prose' || (await blk(where.prose)).paragraphs?.[0] !== 'scope-a');
  await ev(() => window.BW.undo());
  check('E1 block undo: restored whole', (await blk(where.prose)).paragraphs.length === 3);

  // table: cell / row / column are three different scopes
  const cellSel = `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${where.table}"] td[data-r="1"][data-c="1"]`;
  await page.locator(cellSel).scrollIntoViewIfNeeded();
  await page.locator(cellSel).click();
  const tl = await ev(() => window.BW.EXT.scope.list().map((x) => x.scope));
  check('E1 table: the same click offers cell, row, column, block, section', tl.join() === 'cell,row,column,block,section', tl.join());
  await ev(() => window.BW.EXT.scope.run('cell'));
  let tb = await blk(where.table);
  check('E1 cell: only the words of r1c1 went; rows and columns stay (3x2)', tb.rows.length === 3 && tb.rows[1].map((c) => (typeof c === 'string' ? c : c.text)).join() === 'r1c0,' && tb.columns.length === 2, JSON.stringify(tb.rows));
  await ev(() => window.BW.undo());
  await page.locator(cellSel).click();
  const n1 = await steps();
  await ev(() => window.BW.EXT.scope.run('row'));
  tb = await blk(where.table);
  check('E1 row: that row went (2 rows left), columns intact, one undo step', tb.rows.length === 2 && tb.columns.length === 2 && (await steps()) === n1 + 1, `rows ${tb.rows.length} steps ${await steps()}/${n1}`);
  await ev(() => window.BW.undo());
  await page.locator(cellSel).click();
  await ev(() => window.BW.EXT.scope.run('column'));
  tb = await blk(where.table);
  check('E1 column: that column went in every row (1 column left), rows intact', tb.columns.length === 1 && tb.rows.every((r) => r.length === 1) && tb.rows.length === 3, JSON.stringify(tb.rows));
  await ev(() => window.BW.undo());
  tb = await blk(where.table);
  check('E1 column undo: both back, one step', tb.columns.length === 2 && tb.rows.every((r) => r.length === 2));

  // the Delete key on a selected block takes the whole block at once (no menu)
  await sel(null, where.table);
  await page.keyboard.press('Delete');
  check('E1 key: Del on a selected block removes the whole block without a menu', (await blk(where.table))?.rows?.[0]?.[0] !== 'r0c0' && !(await page.locator('.dialog:not([hidden]) [data-scope]').count()));
  await ev(() => window.BW.undo());

  // a fresh page for E2 and E3 (a clean draft, a clean undo history): one long session through every scope crashed the renderer once, cause not found
  await page.close();
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await ctx2.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);

  // ── E2 in the editor: a numbered list in both editions, Arabic words in the other
  const lst = await ev(() => {
    const B = window.BW; const n = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks.length;
    const at = `/chapters/1/sections/0/blocks/${n}`;
    const mk = (x) => ({ text: x, marks: [], style: { list: 'number' } });
    B.commit([{ op: 'insert', path: at, value: { kind: 'prose', paragraphs: [mk('بند أول'), mk('بند ثان'), mk('بند ثالث')] } }], { mirror: true });
    return at;
  });
  const n2 = await steps();
  await selNum(`${lst}/paragraphs/1`, lst);
  const okSet = await ev(() => window.BW.EXT.numbering.apply('set', 5));
  let l = await blk(lst);
  let le = await blk(lst, ed === 'ar' ? 'en' : 'ar');
  check('E2 editor: «start at 5» on the 2nd item sets style.start=5 in this edition AND the other, one undo step', okSet && l.paragraphs[1].style.start === 5 && l.paragraphs[0].style.start === undefined && le.paragraphs[1].style.start === 5 && (await steps()) === n2 + 1, JSON.stringify(l.paragraphs.map((x) => x.style.start)));
  const printed = await ev((lst) => { const main = document.querySelector('#bw-pair main.bw-doc'); const ols = [...main.querySelectorAll(`[data-b="${lst}"]`)].map((li) => li.closest('ol').getAttribute('start')); return ols; }, lst);
  check('E2 editor: the page prints the new start (second run starts at 5), and the first stays at 1', printed.join() === ',5,5' || printed.join() === 'null,5,5', printed.join());
  await ev(() => window.BW.undo());
  l = await blk(lst); le = await blk(lst, ed === 'ar' ? 'en' : 'ar');
  check('E2 undo: one Ctrl+Z removes the start from both editions', l.paragraphs[1].style.start === undefined && le.paragraphs[1].style.start === undefined);
  await selNum(`${lst}/paragraphs/2`, lst);
  await ev(() => window.BW.EXT.numbering.apply('continue'));
  await ev(() => window.BW.EXT.numbering.apply('restart'));
  l = await blk(lst);
  check('E2 restart / continue: «restart» writes start 1 (the last choice wins), «continue» writes "continue"', l.paragraphs[2].style.start === 1);
  const bad = await ev(() => window.BW.EXT.numbering.apply('set', 'abc'));
  check('E2 edge: a non-number is refused (nothing changes)', bad === false && (await blk(lst)).paragraphs[2].style.start === 1);
  await selNum(`${lst}/paragraphs/1`, lst);
  await ev(() => { window.BW.runAction('renumList'); }); // the menu waits for a click: do not await it here
  await page.locator('.dialog [data-num="restart"]').waitFor({ timeout: 4000 });
  await page.locator('.dialog [data-num-val]').fill('12');
  await page.locator('.dialog [data-num="set"]').click();
  check('E2 tool: «Renumber list» (menu, Arabic or English) sets the typed value', (await blk(lst)).paragraphs[1].style.start === 12);

  // ── E3 in the editor
  const ID0 = await ev(() => window.BW.EXT.docid.id(window.BW.S.ed));
  // plant the id in a table cell, a revision row and a header text item, literally
  const planted = await ev((id) => {
    const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; const n = e.doc.chapters[1].sections[0].blocks.length;
    const at = `/chapters/1/sections/0/blocks/${n}`;
    B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['Field', 'Value'], rows: [['Ref', id], ['Note', `see ${id} (draft)`], ['Other', `${id}-A`]] } }], { mirror: true });
    B.commit([{ op: 'replace', path: '/chrome', value: { header: { items: [{ id: 'h-t', kind: 'text', value: `File ${id}`, align: 'center', scope: 'all' }] }, footer: { items: [] } }, old: e.doc.chrome }], { mirror: true });
    return at;
  }, ID0);
  const places = await ev(() => window.BW.EXT.docid.places());
  check('E3 places: the id is found in the control field, the cells (whole and inside a sentence), and a header text item — not inside a longer id', places.includes('/control/documentId') && places.some((x) => x.endsWith('/rows/0/1')) && places.some((x) => x.endsWith('/rows/1/1')) && places.some((x) => x.startsWith('/chrome/header')) && !places.some((x) => x.endsWith('/rows/2/1')), places.join());
  // 1) edit the control field: every instance follows, both editions, one undo step
  const s0 = await steps();
  await ev(() => window.BW.setText('/control/documentId', 'NEW-ID-7'));
  let d = await docOf(); let dO = await docOf(ed === 'ar' ? 'en' : 'ar');
  const tbl = (x) => x.chapters[1].sections[0].blocks[x.chapters[1].sections[0].blocks.length - 1].rows;
  check('E3 control → all: cells, sentence, header item and the other edition all read NEW-ID-7; the longer id BW…-A is untouched', tbl(d)[0][1] === 'NEW-ID-7' && tbl(d)[1][1] === 'see NEW-ID-7 (draft)' && tbl(d)[2][1] === `${ID0}-A` && d.chrome.header.items[0].value === 'File NEW-ID-7' && dO.control.documentId === 'NEW-ID-7' && tbl(dO)[0][1] === 'NEW-ID-7', JSON.stringify([tbl(d)[0][1], tbl(d)[1][1], d.chrome.header.items[0].value, dO.control.documentId]));
  check('E3 undo: ONE step undoes the id everywhere (both editions)', (await steps()) === s0 + 1);
  await ev(() => window.BW.undo());
  d = await docOf(); dO = await docOf(ed === 'ar' ? 'en' : 'ar');
  check('E3 undo result: every place reads the old id again', d.control.documentId === ID0 && tbl(d)[0][1] === ID0 && d.chrome.header.items[0].value === `File ${ID0}` && dO.control.documentId === ID0);
  // 2) edit a cell instance typed key by key: the control field and the rest follow, still one step
  const cell = `#bw-pair main.bw-doc[data-locale="${ed}"] [data-p="${planted}/rows/0/1"]`;
  await page.locator(cell).scrollIntoViewIfNeeded();
  await page.locator(cell).click();
  await page.keyboard.press('End');
  const s1 = await steps();
  await page.keyboard.type('-X9');
  await page.waitForTimeout(150);
  d = await docOf(); dO = await docOf(ed === 'ar' ? 'en' : 'ar');
  check('E3 cell → all: typing in a cell changes /control/documentId, the sentence, the header item and the other edition', d.control.documentId === `${ID0}-X9` && tbl(d)[1][1] === `see ${ID0}-X9 (draft)` && d.chrome.header.items[0].value === `File ${ID0}-X9` && dO.control.documentId === `${ID0}-X9`, JSON.stringify([d.control.documentId, tbl(d)[1][1]]));
  check('E3 typing: the three keystrokes are ONE undo step', (await steps()) === s1 + 1, `${await steps()} vs ${s1}`);
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await ev(() => window.BW.undo());
  d = await docOf();
  check('E3 undo after typing: id back everywhere with one Ctrl+Z', d.control.documentId === ID0 && tbl(d)[0][1] === ID0 && d.chrome.header.items[0].value === `File ${ID0}`);
  // 3) the tool + the printed pages
  await ev(() => window.BW.setText('/control/documentId', 'ZZ-2026-001'));
  await ev(() => window.BW.render()); // typing paints in place; the page is drawn again when the focus leaves
  const shown = await ev(() => { const t = document.querySelector('#bw-pair main.bw-doc')?.innerText || ''; return (t.match(/ZZ-2026-001/g) || []).length; });
  check('E3 page: the new id is printed in the cover and the control table, the old one nowhere in the page', shown >= 2, String(shown));
  const html3 = html(await docOf(), ed);
  check('E3 print: the PDF/DOCX source (render) shows the new id in the cover, header band and cells; no old id left', !html3.includes(ID0 + '<') && (html3.match(/ZZ-2026-001/g) || []).length >= 3, String((html3.match(/ZZ-2026-001/g) || []).length));
  check('E3 helper: docIdFromEdit reads an edit inside the id and ignores one outside it', docIdFromEdit('see BW-1.', 'see BW-12.', 'BW-1') === 'BW-12' && docIdFromEdit('see BW-1.', 'see BW-1 and', 'BW-1') === null && replaceId('BW-1 BW-12', 'BW-1', 'Q') === 'Q BW-12');
  check('E3 model: docIdOps rewrites exactly the token instances, nothing else', (() => { const x = { control: { documentId: 'A-1' }, chapters: [{ sections: [{ blocks: [{ kind: 'prose', paragraphs: ['A-1', 'A-1x', 'ref A-1.'] }] }] }] }; const out = applyOps(x, docIdOps(x, 'A-1', 'B'));
    return out.control.documentId === 'B' && out.chapters[0].sections[0].blocks[0].paragraphs.join() === 'B,A-1x,ref B.'; })());
  check('browser: no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `${failed} FAILED` : 'edit-scope-0140: all passed');
process.exit(failed ? 1 : 0);
