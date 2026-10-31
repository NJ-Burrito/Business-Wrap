// 0.15.1 lane story: "make the user stories like tables too". The user-story ID card is a real table block: the same table model
// and cell toolset (rows, columns, merge/split, selection, ribbon table tab, undo) as every other table, not a second implementation.
// A story with no `card` prints the default rows and stores nothing (old documents and old edits open unchanged); the first table
// edit stores `card` (labels as text, {bind} cells that keep the story's own fields as the single source). PDF, DOCX, HTML, AR and EN.
// Headless Edge/Chrome, closed in finally.   node tests/story-table-0151.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportDocx, exportPdf, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { applyOps, docIdOps } from '../engine/edits.mjs';
import { docxParts, pageTexts, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-storytbl-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  story-table: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const findStory = (doc) => { let ptr = null; (function walk(o, p) { if (ptr || !o || typeof o !== 'object') return; if (o.kind === 'stories' && o.items?.[0]) { ptr = p; return; } for (const k in o) walk(o[k], `${p}/${k}`); })(doc.chapters, '/chapters'); return ptr; };
const at = (doc, p) => p.split('/').slice(1).reduce((o, k) => o[k], doc);
const html = (doc, loc, extra = {}) => renderDocument(doc, { locale: loc, labels: i18n().doc[loc], theme, fontCss: '', logos: theme.logos, ...extra });
const cardHtml = (h) => { const i = h.indexOf('<div class="id-card">'); return h.slice(i, h.indexOf('</table>', i)); };

// 1 · an old document (no `card`) opens and prints the ID card as a table, nothing stored
for (const loc of ['en', 'ar']) {
  const doc = sample(REPO, loc);
  const sp = findStory(doc);
  const item = at(doc, sp).items[0];
  const before = JSON.stringify(doc);
  check(`${loc}: the old story has no card key (the old shape is the input)`, !('card' in item));
  const c = cardHtml(html(doc, loc));
  const L = i18n().doc[loc];
  check(`${loc}: the ID card prints as a table: caption, labels column, values column (id, name, user, goal, acceptance)`,
    /<caption class="story-head">/.test(c) && c.includes(`>${L.storyId}<`) && c.includes(item.id) && c.includes(item.name) && c.includes(L.acceptance) && /<ol>/.test(c) && (c.match(/<tr[ >]/g) || []).length === 5 && /<col style="width:22\.00%"/.test(c), c.slice(0, 400));
  check(`${loc}: rendering stores nothing: the document is identical after the render (lossless on load)`, JSON.stringify(doc) === before);
  check(`${loc}: print html has no editor pointers; editor html carries data-t / data-rows for the card`, !/data-t=/.test(c) && new RegExp(`data-rows="${sp}/items/0/card/rows"`).test(html(doc, loc, { editor: true })));
}

// 2 · a stored card: merges, widths, bound cells, plain cells; PDF and DOCX
for (const loc of ['en', 'ar']) {
  const doc = sample(REPO, loc);
  const sp = findStory(doc);
  const L = i18n().doc[loc];
  const item = at(doc, sp).items[0];
  item.card = { rows: [[L.storyId, { bind: 'id' }, 'EXTRA-A'], [L.storyName, { bind: 'name' }, 'EXTRA-B'], [L.storyUser, { bind: 'as' }, ''], [L.storyGoalLabel, { bind: 'goal' }, ''], [L.acceptance, { bind: 'acceptance' }, '']], merges: [{ r: 2, c: 1, rs: 1, cs: 2 }], colWidths: [20, 55, 25], rowHeights: [14, null, null, null, null] };
  const c = cardHtml(html(doc, loc));
  check(`${loc}: stored card prints colspan, widths, a row height; bound cells print the story's own fields`, /colspan="2"/.test(c) && /<col style="width:20\.00%"/.test(c) && /style="height:14mm"/.test(c) && c.includes(item.name) && c.includes('EXTRA-A') && c.includes(item.id));
  const f = path.join(tmp, `s-${loc}.docx`);
  exportDocx(doc, { locale: loc, theme, docxPath: f, embedFonts: false });
  const xml = docxParts(f, /^word\/document\.xml$/)['word/document.xml'];
  check(`${loc}: DOCX has the ID card table: merge (gridSpan), row height, labels, bound values, extra cell, numbered acceptance`, /<w:gridSpan w:val="2"\/>/.test(xml) && /<w:trHeight /.test(xml) && xml.includes(item.id) && xml.includes('EXTRA-A') && xml.includes(L.acceptance) && /<w:numPr>/.test(xml));
  const plain = sample(REPO, loc);
  const f0 = path.join(tmp, `p-${loc}.docx`);
  exportDocx(plain, { locale: loc, theme, docxPath: f0, embedFonts: false });
  const xml0 = docxParts(f0, /^word\/document\.xml$/)['word/document.xml'];
  check(`${loc}: DOCX of the old story (no card) still has its labels, id, name, acceptance`, xml0.includes(at(plain, sp).items[0].id) && xml0.includes(L.storyName) && xml0.includes(L.acceptance));
  const pdf = path.join(tmp, `s-${loc}.pdf`);
  await exportPdf(doc, { locale: loc, theme, pdfPath: pdf });
  const text = pageTexts(pdf).join('\n');
  check(`${loc}: PDF contains the ID card table text (id, extra cell, name)`, text.includes(item.id) && text.includes('EXTRA-A') && text.includes(item.name.split(/\s+/)[0]));
  check(`${loc}: the card sits in a ${loc === 'ar' ? 'RTL' : 'LTR'} page`, new RegExp(`<main class="bw-doc"[^>]*dir="${loc === 'ar' ? 'rtl' : 'ltr'}"`).test(html(doc, loc)));
}

// 3 · the editor: the same cell toolset on the ID card
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'story-table-test', watermarkDir: null });
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
    const SP = await page.evaluate(() => { let ptr = null; (function walk(o, p) { if (ptr || !o || typeof o !== 'object') return; if (o.kind === 'stories' && o.items?.[0]) { ptr = p; return; } for (const k in o) walk(o[k], `${p}/${k}`); })(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters, '/chapters'); return ptr + '/items/0'; });
    const T = `${SP}/card`;
    const story = () => page.evaluate(([p, e]) => { const B = window.BW; let o = B.M[B.S.svc][e].doc; for (const k of p.split('/').slice(1)) o = o?.[k]; return o && JSON.parse(JSON.stringify(o)); }, [SP, ed]);
    const txt = (l) => (typeof l === 'string' ? l : l?.text ?? '');
    const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-t="${T}"] td[data-r="${r}"][data-c="${c}"]`;
    const centre = async (r, c) => { await page.locator(cell(r, c)).scrollIntoViewIfNeeded(); const b = await page.locator(cell(r, c)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const run = (id) => page.evaluate((id) => window.BW.runAction(id), id);
    const dragSel = async (r0, c0, r1, c1) => { const [x0, y0] = await centre(r0, c0); await page.mouse.move(x0, y0); await page.mouse.down(); const [x1, y1] = await centre(r1, c1); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); };
    const rowsN = () => page.locator(`#bw-pair main.bw-doc[data-locale="${ed}"] table[data-t="${T}"] tr[data-r]`).count();
    const undo = () => page.evaluate(() => window.BW.undo());

    const s0 = await story();
    check(`${loc}: the ID card is a table in the editor (data-t, data-r/data-c cells), nothing stored yet`, (await page.locator(cell(0, 0)).count()) === 1 && !('card' in s0) && (await rowsN()) === 5);

    await page.locator(cell(1, 1)).click();
    check(`${loc}: selecting an ID card cell opens the ribbon's Table tab`, (await page.locator('.rb-tab.ctx[data-tab="table"]').count()) === 1);
    await run('rowAdd');
    let s = await story();
    check(`${loc}: add a row: the card is stored (5 rows + 1); id and name cells stay bound to the story's own fields`, s.card?.rows.length === 6 && s.card.rows[0][1]?.bind === 'id' && s.card.rows[1][1]?.bind === 'name' && s.card.rows[2].every((x) => txt(x) === '') && (await rowsN()) === 6, JSON.stringify(s.card));
    await page.locator(cell(1, 1)).click();
    await page.keyboard.press('End');
    await page.keyboard.type('+x');
    await page.keyboard.press('Escape');
    s = await story();
    check(`${loc}: typing in the name cell writes the story's own name field (single source), the cell stays bound`, s.name.endsWith('+x') && s.card.rows[1][1]?.bind === 'name', s.name);
    await page.locator(cell(0, 1)).click();
    await run('colAdd');
    s = await story();
    check(`${loc}: add a column: every row of the card grows, widths follow`, s.card.rows.every((r) => r.length === 3) && s.card.colWidths?.length === 3, JSON.stringify(s.card.colWidths));
    await dragSel(0, 1, 0, 2);
    check(`${loc}: drag selects a range of the ID card`, (await page.locator('td.bw-csel').count()) === 2);
    await run('cellMerge');
    s = await story();
    check(`${loc}: merge: stored on the card, colspan 2 on screen, the covered cell is not drawn`, JSON.stringify(s.card.merges) === '[{"r":0,"c":1,"rs":1,"cs":2}]' && (await page.locator(cell(0, 1)).getAttribute('colspan')) === '2' && (await page.locator(cell(0, 2)).count()) === 0);
    await undo();
    check(`${loc}: undo of the merge restores the cells`, !((await story()).card.merges || []).length && (await page.locator(cell(0, 2)).count()) === 1);
    await undo();
    check(`${loc}: undo of the column restores the card`, (await story()).card.rows.every((r) => r.length === 2));
    await undo(); // the typing
    await undo(); // the row
    s = await story();
    check(`${loc}: undo of the row restores the card to 5 rows and the name to its old text`, s.card.rows.length === 5 && !s.name.endsWith('+x'), String(s.card.rows.length));
    await undo(); // the stored card itself
    s = await story();
    check(`${loc}: undo all the way gives the original story back (no card key)`, !('card' in s) && (await rowsN()) === 5);
    await page.evaluate(() => { const B = window.BW; B.redo(); B.redo(); }); // the stored card again (and its row)

    // the document ID stays one value: a card cell that holds it follows an edit of it, in the same undo step
    const id0 = await page.evaluate(() => { const B = window.BW; return B.M[B.S.svc][B.S.ed].doc.control.documentId; });
    await page.evaluate(([T, id0]) => { const B = window.BW; B.commit([{ op: 'setText', path: `${T}/rows/2/1`, value: `${id0} (C)`, old: '' }], { ed: B.S.ed }); }, [T, id0]);
    await page.evaluate(() => { const B = window.BW; B.setText('/control/documentId', 'ZZ-NEW-1'); });
    s = await story();
    check(`${loc}: the document ID tool/edit rewrites the card cell that holds it (one ID everywhere)`, txt(s.card.rows[2][1]) === 'ZZ-NEW-1 (C)', JSON.stringify(s.card.rows[2]));
    for (let k = 0; k < 20 && 'card' in (await story()); k += 1) await undo();
    await page.evaluate(([id0]) => { const B = window.BW; if (B.M[B.S.svc][B.S.ed].doc.control.documentId !== id0) B.setText('/control/documentId', id0); }, [id0]);
  }
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}

// 4 · the document ID is one value: card cells are instances of it; an old edits file still applies
{
  const doc = sample(REPO, 'en');
  const sp = findStory(doc);
  const id0 = doc.control.documentId;
  at(doc, sp).items[0].card = { rows: [['Doc', `${id0} (A)`], ['Name', { bind: 'name' }]] };
  const ops = docIdOps(doc, id0, 'ZZ-NEW-1');
  const mine = ops.filter((o) => o.path === `${sp}/items/0/card/rows/0/1`);
  const out = applyOps(doc, ops);
  check('document ID: a card cell holding it is an instance, the one-ID tool rewrites it with the others', mine.length === 1 && at(out, sp).items[0].card.rows[0][1] === 'ZZ-NEW-1 (A)' && at(out, sp).items[0].card.rows[1][1].bind === 'name', JSON.stringify(mine));
  const old = sample(REPO, 'en');
  const stable = applyOps(old, [{ op: 'setText', path: `${sp}/items/0/name`, value: 'renamed' }]);
  check("an old edits file (an op on the story's own field) applies unchanged and prints in the card", html(stable, 'en').includes('renamed') && !('card' in at(stable, sp).items[0]));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
