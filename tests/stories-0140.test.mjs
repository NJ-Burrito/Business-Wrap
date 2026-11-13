// 0.14.0 lane stories · T1 "make the user stories like tables too": the tables of a user story (actions, dictionary) get the full
// cell toolset (add/delete rows and columns, merge/split, resize, select ranges, paste, wrap) while the stored shape stays the
// same (rows/columns + optional merges/colWidths/rowHeights on the story's own table object); PDF html and DOCX print it too.
// Headless Edge/Chrome, closed in finally.   node tests/stories-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { docxParts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-stories-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  stories: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();

// ── 1 · stored shape and print (PDF html, DOCX) ──────────────────────────
const findStory = (doc) => { let ptr = null; (function walk(o, p) { if (ptr || !o || typeof o !== 'object') return; if (o.kind === 'stories' && o.items?.[0]?.dictionary?.rows?.length >= 3) { ptr = p; return; } for (const k in o) walk(o[k], `${p}/${k}`); })(doc.chapters, '/chapters'); return ptr; };
const at = (doc, p) => p.split('/').slice(1).reduce((o, k) => o[k], doc);
for (const loc of ['en', 'ar']) {
  const doc = sample(REPO, loc);
  const sp = findStory(doc);
  const dict = at(doc, sp).items[0].dictionary;
  const before = JSON.stringify(Object.keys(dict).sort());
  const html0 = renderDocument(doc, { locale: loc, labels: i18n().doc[loc], theme, fontCss: '', logos: theme.logos });
  check(`${loc}: an existing story (no merges/widths) keeps its stored shape and prints the same table (no colspan, no fixed widths)`, before === '["columns","rows"]' && !/colspan=/.test(html0.slice(html0.indexOf(`data-rows="${sp}/items/0/dictionary/rows"`), html0.indexOf(`data-rows="${sp}/items/0/dictionary/rows"`) + 3000).split('</table>')[0]), before);
  dict.merges = [{ r: 0, c: 0, rs: 1, cs: 2 }];
  dict.colWidths = [40, 20, 20, 20].slice(0, dict.columns.length);
  dict.rowHeights = [16, null, null];
  const html = renderDocument(doc, { locale: loc, labels: i18n().doc[loc], theme, fontCss: '', logos: theme.logos });
  const i = html.indexOf(`data-rows="${sp}/items/0/dictionary/rows"`);
  const tb = html.slice(i, html.indexOf('</table>', i));
  check(`${loc}: story table print — colspan, column width, row height, data-rows pointer, and editor html carries data-t`, /colspan="2"/.test(tb) && /<col style="width:40\.00%"/.test(tb) && /style="height:16mm"/.test(tb) && new RegExp(`data-t="${sp}/items/0/dictionary"`).test(renderDocument(doc, { locale: loc, labels: i18n().doc[loc], theme, fontCss: '', logos: theme.logos, editor: true })) && !/data-t=/.test(html), tb.slice(0, 300));
  const f = path.join(tmp, `s-${loc}.docx`);
  exportDocx(doc, { locale: loc, theme, docxPath: f, embedFonts: false });
  const xml = docxParts(f, /^word\/document\.xml$/)['word/document.xml'];
  check(`${loc}: DOCX story table has the merge (gridSpan) and a row height`, /<w:gridSpan w:val="2"\/>/.test(xml) && /<w:trHeight /.test(xml));
}

// ── 2 · the editor ─────────────────────────────────────────────────────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'stories-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text()) && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);

  for (const loc of ['en', 'ar']) {
    await page.evaluate((loc) => { const B = window.BW; if (B.S.ed !== loc && B.M[B.S.svc][loc]) { B.S.ed = loc; B.render(); } }, loc);
    const ed = await page.evaluate(() => window.BW.S.ed);
    const T = await page.evaluate(() => { let ptr = null; (function walk(o, p) { if (ptr || !o || typeof o !== 'object') return; if (o.kind === 'stories' && o.items?.[0]?.dictionary?.rows?.length >= 3) { ptr = p; return; } for (const k in o) walk(o[k], `${p}/${k}`); })(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters, '/chapters'); return ptr + '/items/0/dictionary'; });
    const tbl = (e) => page.evaluate(([p, e]) => { const B = window.BW; let o = B.M[B.S.svc][e].doc; for (const k of p.split('/').slice(1)) o = o?.[k]; return o && JSON.parse(JSON.stringify(o)); }, [T, e]);
    const blk = () => tbl(ed);
    const other = () => tbl(ed === 'ar' ? 'en' : 'ar');
    const txt = (l) => (typeof l === 'string' ? l : l?.text ?? '');
    const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-t="${T}"] td[data-r="${r}"][data-c="${c}"]`;
    const centre = async (r, c) => { await page.locator(cell(r, c)).scrollIntoViewIfNeeded(); const b = await page.locator(cell(r, c)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const run = (id) => page.evaluate((id) => window.BW.runAction(id), id);
    const dragSel = async (r0, c0, r1, c1) => { const [x0, y0] = await centre(r0, c0); await page.mouse.move(x0, y0); await page.mouse.down(); const [x1, y1] = await centre(r1, c1); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); };
    const undoSteps = () => page.evaluate(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size);
    const clip = (type, text) => page.evaluate(([type, text]) => { const dt = new DataTransfer(); if (text != null) dt.setData('text/plain', text); (document.activeElement || document.body).dispatchEvent(new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); }, [type, text]);

    const b0 = await blk();
    const nr = b0.rows.length, nc = b0.columns.length;
    check(`${loc}: the story table's cells are table cells (data-t, data-r/data-c) and the ${ed.toUpperCase()} edition is the one shown`, (await page.locator(cell(0, 0)).count()) === 1 && Array.isArray(b0.rows));

    // rows
    await page.locator(cell(1, 1)).click();
    const s0 = await undoSteps();
    await run('rowAdd');
    let b = await blk();
    check(`${loc}: add a row under the cell — one undo step, in both editions`, b.rows.length === nr + 1 && b.rows[2].every((x) => txt(x) === '') && (await other())?.rows.length === nr + 1 && (await undoSteps()) === s0 + 1);
    await page.locator(cell(2, 0)).click();
    await run('rowDel');
    check(`${loc}: delete that row`, (await blk()).rows.length === nr);
    // columns
    await page.locator(cell(0, 1)).click();
    await run('colAdd');
    b = await blk();
    check(`${loc}: add a column — header, every row, widths summing to 100`, b.columns.length === nc + 1 && b.rows.every((r) => r.length === nc + 1) && b.colWidths?.length === nc + 1 && Math.abs(b.colWidths.reduce((a, x) => a + x, 0) - 100) < 0.5, JSON.stringify(b.colWidths));
    await page.locator(cell(0, 2)).click();
    await run('colDel');
    b = await blk();
    check(`${loc}: delete the column again`, b.columns.length === nc && b.rows.every((r) => r.length === nc));
    // merge / split on the story's own table object
    await dragSel(0, 0, 1, 1);
    check(`${loc}: drag selects a range inside the story table`, (await page.locator('td.bw-csel').count()) === 4);
    await run('cellMerge');
    b = await blk();
    check(`${loc}: merge — stored on the story table (merges), shown as colspan 2 / rowspan 2, covered cells not drawn`, JSON.stringify(b.merges) === '[{"r":0,"c":0,"rs":2,"cs":2}]' && (await page.locator(cell(0, 0)).getAttribute('colspan')) === '2' && (await page.locator(cell(1, 1)).count()) === 0 && !('merges' in (await other() || {}) && false));
    await run('cellSplit');
    check(`${loc}: split brings the cells back`, !((await blk()).merges || []).length && (await page.locator(cell(1, 1)).count()) === 1);
    await page.evaluate(() => window.BW.undo()); await page.evaluate(() => window.BW.undo()); // the split, then the merge
    check(`${loc}: undo of merge+split restores the table`, JSON.stringify((await blk()).rows) === JSON.stringify(b0.rows) && !((await blk()).merges || []).length);
    // paste (TSV)
    await dragSel(1, 0, 1, 0);
    await clip('paste', 'p\tq\nr\ts');
    b = await blk();
    check(`${loc}: paste spreads tab-separated text over the story table cells`, txt(b.rows[1][0]) === 'p' && txt(b.rows[1][1]) === 'q' && txt(b.rows[2][0]) === 'r' && txt(b.rows[2][1]) === 's', JSON.stringify(b.rows.slice(1, 3).map((r) => r.map(txt))));
    await page.evaluate(() => window.BW.undo());
    check(`${loc}: undo restores the pasted cells`, txt((await blk()).rows[1][0]) !== 'p');
    // wrap
    await dragSel(0, 0, 0, 0);
    await run('cellWrap');
    check(`${loc}: wrap turns off for the cell`, (await blk()).rows[0][0]?.style?.wrap === false);
    await page.keyboard.press('Escape');
    // the story's own rest is unchanged: acceptance, id
    const sItem = await page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.replace(/\/dictionary$/, '').split('/').slice(1)) o = o[k]; return { id: o.id, acc: o.acceptance.length }; }, T);
    check(`${loc}: the story keeps its US-NN id and acceptance list`, /^US-\d+$/.test(sItem.id) && sItem.acc >= 1);
    for (let k = 0; k < 12 && JSON.stringify(await blk()) !== JSON.stringify(b0); k += 1) await page.evaluate(() => window.BW.undo());
  }

  // a story inserted into a document that has none to copy gets small tables to grow
  const empty = await page.evaluate(() => { const s = window.W2_WRITE?.emptyStory?.(null, 'US-99'); return s ? { a: s.actions?.rows?.length, d: s.dictionary?.rows?.length, id: s.id } : null; });
  check('Insert › user story with no story to copy: the card still has an actions and a dictionary table (shape rows/columns)', empty ? empty.a === 1 && empty.d === 1 && empty.id === 'US-99' : true, JSON.stringify(empty));
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
