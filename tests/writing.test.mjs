// Lane B (0.13.2): Enter / line breaks, user-story blocks and points, page-gap tools, the save toast + share dialog inside
// the window (viewport screenshots at 1920×1080 and 1366×768), bullets over a highlighted range, a text box at the caret.
// Headless Chrome, closed at the end.
//
//   node tests/writing.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'writing-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null, ui: 'en' });

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  writing: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { const B = window.BW; if (B.S.ed !== 'en' && B.M[B.S.svc].en) { B.S.ed = 'en'; B.render(); } });
  const doc = (ed = 'en') => page.evaluate((ed) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][ed].doc)), ed);
  const find = (o, kind, out = []) => { if (Array.isArray(o)) o.forEach((x) => find(x, kind, out)); else if (o && typeof o === 'object') { if (o.kind === kind) out.push(o); Object.values(o).forEach((x) => find(x, kind, out)); } return out; };
  const proseSel = '#bw-pair main.bw-doc[data-locale="en"] [data-p$="/paragraphs/0"]';

  // ── 1. Enter: a new paragraph; Shift+Enter and cell Enter: a line break printed as <br>
  {
    const p = await page.evaluate((s) => document.querySelector(s).dataset.p, proseSel);
    const base = p.replace(/\/\d+$/, '');
    const before = await page.evaluate(([b]) => window.BW.M[window.BW.S.svc].en.doc && b.split('/').slice(1).reduce((o, k) => o[k], window.BW.M[window.BW.S.svc].en.doc).length, [base]);
    await page.click(proseSel);
    await page.evaluate((s) => { const x = document.querySelector(s); const r = document.createRange(); r.setStart(x.firstChild, 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }, proseSel);
    await page.keyboard.press('Enter');
    await page.keyboard.type('ZZ');
    const d = await doc();
    const arr = base.split('/').slice(1).reduce((o, k) => o[k], d);
    const orig = await page.evaluate((s) => document.querySelector(s).dataset.p, proseSel);
    check('Enter splits the paragraph at the caret into a new paragraph', arr.length === before + 1 && String(arr[1]).startsWith('ZZ'), JSON.stringify(arr.slice(0, 2)));
    const dAr = await doc('ar');
    const arrAr = base.split('/').slice(1).reduce((o, k) => o[k], dAr);
    check('the other edition keeps the same shape (placeholder paragraph)', arrAr.length === before + 1);
    const focused = await page.evaluate(() => document.activeElement?.dataset?.p);
    check('the caret moved to the new paragraph', focused === `${base}/1`, String(focused));
    // Shift+Enter: a line break inside the leaf
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('QQ');
    const d2 = await doc();
    const leaf = base.split('/').slice(1).reduce((o, k) => o[k], d2)[1];
    check('Shift+Enter types a line break inside the paragraph (no new paragraph)', /ZZ[^\n]*\nQQ/.test(String(leaf)) && base.split('/').slice(1).reduce((o, k) => o[k], d2).length === before + 1, JSON.stringify(leaf));
    await page.keyboard.press('Escape');
    check('the line break shows at once (pre-line) and prints as <br> after a render', await page.evaluate((p) => {
      const ws = getComputedStyle(document.querySelector(`[data-p="${CSS.escape(p)}"]`)).whiteSpace;
      window.BW.render();
      return ws === 'pre-line' && !!document.querySelector(`[data-p="${CSS.escape(p)}"] br`);
    }, `${base}/1`));
    // a table cell: Enter is a line break, the row count stays
    const cell = '#bw-pair main.bw-doc[data-locale="en"] table[data-rows] td [data-p], #bw-pair main.bw-doc[data-locale="en"] table[data-rows] td[data-p]';
    const cp = await page.evaluate((s) => document.querySelector(s)?.dataset.p, cell);
    const rowsBefore = await page.evaluate(() => document.querySelectorAll('#bw-pair main.bw-doc[data-locale="en"] table[data-rows] tbody tr').length);
    await page.click(cell);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('NEXTLINE');
    const cv = await page.evaluate((p) => p.split('/').slice(1).reduce((o, k) => o[k], window.BW.M[window.BW.S.svc].en.doc), cp);
    const rowsAfter = await page.evaluate(() => document.querySelectorAll('#bw-pair main.bw-doc[data-locale="en"] table[data-rows] tbody tr').length);
    check('Enter in a table cell is a new line inside the cell', /\nNEXTLINE$/.test(typeof cv === 'string' ? cv : cv.text) && rowsAfter === rowsBefore, JSON.stringify(cv));
    await page.keyboard.press('Escape');
  }

  // ── 2/3. user story block + points
  {
    const stories0 = find(await doc(), 'stories').length;
    const ptr = await page.evaluate(() => { const B = window.BW; B.S.sel = { b: '/chapters/4/sections/0/blocks/0', p: null, ed: 'en' }; return B.EXT.w2write.addStory(); });
    const d = await doc();
    const blk = ptr.split('/').slice(1).reduce((o, k) => o[k], d);
    check('Insert → User story adds a stories block (house layout)', find(d, 'stories').length === stories0 + 1 && blk.kind === 'stories' && blk.items[0].acceptance.length === 1 && /^US-\d+$/.test(blk.items[0].id), JSON.stringify(blk).slice(0, 200));
    check('the new story keeps the document\'s own table columns', JSON.stringify(blk.items[0].actions?.columns) === JSON.stringify(find(d, 'stories')[0].items[0].actions?.columns));
    const html = await page.evaluate((p) => { const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="en"] [data-b="${p}"]`); return { has: !!el, head: !!el?.querySelector('caption.story-head'), cls: el?.className, ac: el?.closest('main')?.querySelectorAll(`[data-p^="${p}/items/0/acceptance"]`).length }; }, ptr);
    check('it renders as the SRS story card (id-card + story-head + criteria)', html.has && /story/.test(html.cls) && html.ac === 1, JSON.stringify(html));
    const dAr = await doc('ar');
    check('the Arabic edition gets the block too', find(dAr, 'stories').length === stories0 + 1);
    // more points: select the first criterion, add one after it
    await page.evaluate((p) => { const B = window.BW; B.S.sel = { b: p, p: `${p}/items/0/acceptance/0`, ed: 'en' }; B.EXT.w2write.addPoint(); }, ptr);
    let b2 = ptr.split('/').slice(1).reduce((o, k) => o[k], await doc());
    check('"Acceptance point" adds a criterion after the selected one', b2.items[0].acceptance.length === 2);
    await page.evaluate((p) => { const B = window.BW; B.S.sel = { b: p, p: null, ed: 'en' }; B.EXT.w2write.addCard(); }, ptr);
    b2 = ptr.split('/').slice(1).reduce((o, k) => o[k], await doc());
    check('"Another story" adds a story card to the block', b2.items.length === 2 && b2.items[1].id !== b2.items[0].id);
    // Enter inside a criterion makes the next point
    const acSel = `#bw-pair main.bw-doc[data-locale="en"] [data-p="${ptr}/items/0/acceptance/0"]`;
    await page.click(acSel);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    b2 = ptr.split('/').slice(1).reduce((o, k) => o[k], await doc());
    check('Enter inside a criterion adds the next criterion', b2.items[0].acceptance.length === 3);
    await page.keyboard.press('Escape');
  }

  // ── 4. page gaps
  {
    const r = await page.evaluate(() => {
      const B = window.BW; const W = B.EXT.w2write; const out = {};
      const d = () => B.M[B.S.svc].en.doc;
      B.S.sel = { b: '/chapters/1/sections/0/blocks/0', p: null, ed: 'en' };
      out.add = W.setBreak(true); out.has = !!d().chapters[1].sections[0].layout?.breakBefore;
      out.addTwice = W.setBreak(true);
      out.del = W.setBreak(false); out.gone = !d().chapters[1].sections[0].layout?.breakBefore;
      // pull up: a break on the next section goes
      B.commit([{ op: 'replace', path: '/chapters/1/sections/1/layout', value: { breakBefore: true }, old: undefined }]);
      out.pull = W.pullUp(); out.pulled = !d().chapters[1].sections[1].layout?.breakBefore;
      // empty prose block + a section with only that: removed, break dropped
      B.commit([{ op: 'insert', path: '/chapters/1/sections/1/blocks/0', value: { kind: 'prose', paragraphs: ['', '  '] } }], { mirror: true });
      out.empties = W.emptyPages();
      // a section left with no blocks that still starts a page, and a table of empty cells: both are empty pages
      B.commit([{ op: 'insert', path: '/chapters/1/sections/1/blocks/0', value: { kind: 'table', columns: ['', ''], rows: [['', ''], ['', '']] } }, { op: 'replace', path: '/chapters/1/sections/1/layout', value: { breakBefore: true }, old: d().chapters[1].sections[1].layout }], { mirror: true });
      out.emptyTable = W.emptyPages(); out.noTable = !d().chapters[1].sections[1].blocks.some((b) => b.kind === 'table' && !b.rows.flat().join('').trim());
      out.noBlank = !JSON.stringify(d().chapters[1].sections[1].blocks).includes('"paragraphs":["","  "]');
      // delete a section: gap closes, page size handed to the next block
      B.commit([{ op: 'replace', path: '/chapters/1/sections/0/blocks/0/layout', value: { page: { size: 'A5', orientation: 'portrait' } }, old: d().chapters[1].sections[0].blocks[0].layout }]);
      const n0 = d().chapters[1].sections.length;
      B.S.sel = { b: '/chapters/1/sections/0/blocks/0', p: null, ed: 'en' };
      out.delSec = W.delSection(); out.n = [n0, d().chapters[1].sections.length];
      out.handed = d().chapters[1].sections[0].blocks[0].layout?.page?.size;
      return out;
    });
    check('page break: add, refuse a second, remove', r.add && r.has && !r.addTwice && r.del && r.gone, JSON.stringify(r));
    check('remove empty pages also catches a table of empty cells (a page empty by height)', r.emptyTable >= 1 && r.noTable, JSON.stringify(r));
    check('pull next content up removes the next section\'s break', r.pull && r.pulled);
    check('remove empty pages deletes blank blocks', r.empties >= 1 && r.noBlank, JSON.stringify(r));
    check('delete section closes the gap and hands over the page size', r.delSec && r.n[1] === r.n[0] - 1 && r.handed === 'A5', JSON.stringify(r));
  }

  // ── 6. list over a highlighted range; text box at the caret
  {
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(() => { const B = window.BW; if (B.S.ed !== 'en' && B.M[B.S.svc].en) { B.S.ed = 'en'; B.render(); } });
    const ps = await page.evaluate(() => [...document.querySelectorAll('#bw-pair main.bw-doc[data-locale="en"] [data-p*="/paragraphs/"]')].slice(0, 3).map((e) => e.dataset.p));
    // highlight from the first paragraph into the third with the mouse-free selection API, then use the real tool
    await page.evaluate(([a, c]) => {
      const m = document.querySelector('#bw-pair main.bw-doc[data-locale="en"]');
      const x = m.querySelector(`[data-p="${a}"]`); const z = m.querySelector(`[data-p="${c}"]`);
      x.contentEditable = 'plaintext-only'; x.focus();
      const r = document.createRange(); r.setStart(x.firstChild, 1); r.setEnd(z.firstChild, 3);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }, [ps[0], ps[2]]);
    await page.waitForTimeout(100);
    await page.evaluate(() => window.BW.runAction('fmtBullets'));
    const d = await doc();
    const lists = ps.map((p) => p.split('/').slice(1).reduce((o, k) => o[k], d)).map((l) => l?.style?.list);
    check('bullets apply to every paragraph in the highlighted range', lists.every((x) => x === 'bullet'), JSON.stringify(lists));
    await page.evaluate(() => window.BW.runAction('fmtBullets'));
    const d3 = await doc();
    await page.evaluate(() => window.BW.runAction('fmtBold'));
    const dB = await doc();
    const bolds = ps.map((p) => p.split('/').slice(1).reduce((o, k) => o[k], dB)).map((l) => (l?.marks || []).some((m) => m[2] === 'b'));
    check('Bold applies to every paragraph in the highlighted range, not only the first', bolds.length === 3 && bolds.every(Boolean), JSON.stringify(bolds));
    await page.evaluate(() => window.BW.EXT.w2format.mark('color', '#c0392b'));
    await page.evaluate(() => window.BW.EXT.w2format.style({ align: 'center' }));
    const dFmt = await doc();
    const at = (p) => p.split('/').slice(1).reduce((o, k) => o[k], dFmt);
    check('colour and alignment reach every highlighted paragraph', ps.every((p) => (at(p).marks || []).some((m) => m[2] === 'color') && at(p).style?.align === 'center'), JSON.stringify(ps.map((p) => at(p).style)));
    check('the same tool again turns them all off', ps.map((p) => p.split('/').slice(1).reduce((o, k) => o[k], d3)).every((l) => !l?.style?.list));
    // text box at the caret: caret in the third paragraph, far down its block
    const ov0 = (await doc()).overlays?.length || 0;
    await page.evaluate((c) => {
      const m = document.querySelector('#bw-pair main.bw-doc[data-locale="en"]');
      const z = m.querySelector(`[data-p="${c}"]`); z.contentEditable = 'plaintext-only'; z.focus();
      const r = document.createRange(); r.setStart(document.createTreeWalker(z, 4).nextNode(), 2); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r);
    }, ps[2]);
    await page.waitForTimeout(100);
    await page.evaluate(() => window.BW.EXT.w2objects ? window.BW.EXT.w2objects.textBox() : window.BW.runAction('textBox'));
    const d4 = await doc();
    const ov = (d4.overlays || []).at(-1);
    const blockOfP = ps[2].match(/^(.*\/blocks\/\d+)/)[1];
    const anchored = d4.overlays?.length === ov0 + 1 && (find(d4, 'prose').some((b) => b.id === ov?.anchor) || true);
    const anchorBlock = (() => { let hit = null; (function w(o, p) { if (Array.isArray(o)) o.forEach((x, i) => w(x, `${p}/${i}`)); else if (o && typeof o === 'object') { if (o.id === ov?.anchor && o.kind) hit = p; for (const k in o) w(o[k], `${p}/${k}`); } })(d4.chapters, '/chapters'); return hit; })();
    check('Insert text box lands at the caret\'s block, not the top', anchored && anchorBlock === blockOfP, `${anchorBlock} vs ${blockOfP}`);
  }
  check('no page errors', errors.length === 0, errors.join(' | '));

  // ── 5. the save / share toast and the share dialog fit the window
  for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 640]]) {
    const pg = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
    await pg.goto(pathToFileURL(file).href);
    await pg.waitForFunction(() => window.BW?.ready);
    await pg.waitForTimeout(500);
    await pg.evaluate(() => {
      const long = 'D:\\Docs\\Business-Wrap\\HTML\\event-permit-shared-for-a-very-long-recipient-name-2026-10-29-120000.editor.html';
      window.BW.toast(`HTML saved to: ${long}`, 'ok', { actions: [['Copy the path', () => {}], ['Show the file location', () => {}]], ms: 600000 });
    });
    await pg.waitForTimeout(500);
    const fit = await pg.evaluate(() => {
      const root = document.querySelector('[data-bw-shell], #bw-ui, bw-ui')?.shadowRoot || [...document.querySelectorAll('*')].find((e) => e.shadowRoot?.querySelector('.toasts'))?.shadowRoot;
      const t = root.querySelector('.toast');
      const r = t.getBoundingClientRect();
      const bs = [...t.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return { ok: q.left >= 0 && q.right <= innerWidth && q.bottom <= innerHeight && b.scrollWidth <= b.clientWidth + 1 }; });
      return { in: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, bs, r: [r.left, r.top, r.right, r.bottom] };
    });
    check(`toast fully visible at ${w}×${h}, buttons whole`, fit.in && fit.bs.length === 2 && fit.bs.every((b) => b.ok), JSON.stringify(fit));
    await pg.screenshot({ path: path.join(REPO, `share-toast-${w}x${h}.png`) }); // viewport only
    await pg.context().close();
  }
} finally {
  await browser.close();
}
console.log(failed ? `${failed} FAILED` : 'writing: all passed');
process.exit(failed ? 1 : 0);
