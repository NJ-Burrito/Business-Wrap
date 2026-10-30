// 0.13.3 · editor fixes (lane fix-editor): TW-01..06, TCELLS-01..04, DOCS-01..07, TSYS-01 (the pure model and the real editor).
// The page is driven by real keys and real selections; every check reads the DOCUMENT (BW.M), not the DOM.
//
//   node tests/editor-0133.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { evalFormula } from '../engine/cells.mjs';
import { serve } from '../engine/serve.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-0133-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  editor-0133: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// ── TCELLS-03: a bare range is #ERR, an empty reference stays 0, a range inside a function still sums
{
  const at = (r, c) => (r === 0 && c === 0 ? 1 : r === 0 && c === 1 ? 2 : r === 1 && c === 0 ? 3 : r === 1 && c === 1 ? 4 : null);
  const run = (f) => { try { return evalFormula(f, at); } catch { return 'ERR'; } };
  check('TCELLS-03: =A1:B2 is #ERR, =SUM(A1:B2) is 10, =Z99 stays 0', run('=A1:B2') === 'ERR' && run('=SUM(A1:B2)') === 10 && run('=Z99') === 0, [run('=A1:B2'), run('=SUM(A1:B2)'), run('=Z99')].join());
}

// ── TSYS-01: Save HTML inlines the fonts the served page names as /font/<file url>
{
  const src = fs.readFileSync(path.join(REPO, 'editor', 'editor.js'), 'utf8');
  check('TSYS-01: inlineFonts matches url(/font/...) as well as url(file:...)', /async function inlineFonts[\s\S]{0,400}\\\/font\\\//.test(src));
}

const file = path.join(tmp, 'e.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'editor-0133', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ev = (fn, a) => page.evaluate(fn, a);
  const PA = '/chapters/0/sections/0/blocks/0/paragraphs/0', PB = '/chapters/0/sections/0/blocks/0/paragraphs/1';
  const doc = (ed) => ev((ed) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][ed].doc)), ed);
  const text = (v) => (v && typeof v === 'object' ? v.text : v) ?? '';
  const get = async (p, ed = 'ar') => { let v = await doc(ed); for (const k of p.split('/').filter(Boolean)) v = v?.[k]; return v; };
  const ops = (ed) => ev((ed) => window.BW.M[window.BW.S.svc][ed].ops.length, ed);
  const setLeaf = (p, ed, value) => ev(([p, ed, value]) => { const B = window.BW; const e = B.M[B.S.svc][ed]; let old = e.doc; for (const k of p.split('/').filter(Boolean)) old = old?.[k]; B.commit([{ op: 'replace', path: p, value, old }], { ed, mirror: false }); }, [p, ed, value]);
  const showEd = async (ed) => { if ((await ev(() => window.BW.S.ed)) !== ed) { await ev((ed) => { window.BW.S.ed = ed; window.BW.render(); }, ed); } };
  const select = (p, a, b, ed = 'ar', pb = null, bOff = null) => ev(([p, a, b, ed, pb, bOff]) => {
    const pt = (path, off) => { const el = document.querySelector(`main.bw-doc[data-locale="${ed}"] [data-p="${path}"]`); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n = 0, node; while ((node = w.nextNode())) { const L = node.data.length; if (off <= n + L) return [node, off - n]; n += L; } return [el.lastChild, el.lastChild.length]; };
    const el = document.querySelector(`main.bw-doc[data-locale="${ed}"] [data-p="${p}"]`);
    el.contentEditable = 'plaintext-only'; el.focus();
    const r = document.createRange();
    r.setStart(...pt(p, a)); r.setEnd(...(pb ? pt(pb, bOff) : pt(p, b)));
    const g = getSelection(); g.removeAllRanges(); g.addRange(r);
  }, [p, a, b, ed, pb, bOff]);
  const strip = (s) => String(s).replace(/[ً-ْ]/g, '');

  // an AR paragraph with a shadda, two editions displayed
  const AR = 'يتم التقدّم بطلب خدمة جديدة عبر البوابة الإلكترونية ثم تراجع الجهة المختصة الطلب.';
  await setLeaf(PA, 'ar', AR);
  await page.waitForTimeout(300);
  const ARP = strip(AR); // the selections below are counted on the page, which does not draw diacritics

  // TW-01: typing one letter keeps the diacritic of the untouched words
  await select(PA, 3, 3);
  await page.keyboard.type('x');
  await page.waitForTimeout(250);
  let now = text(await get(PA));
  check('TW-01: typing keeps the shadda and adds only the letter', now.includes('ّ') && strip(now) === strip(AR.slice(0, 3) + 'x' + AR.slice(3)), now);

  // TW-02: the format bar's range is a DOCUMENT range even with the diacritic before it
  await setLeaf(PA, 'ar', AR);
  await page.waitForTimeout(250);
  const word = 'بطلب';
  const dom = await ev((p) => document.querySelector(`main.bw-doc[data-locale="ar"] [data-p="${p}"]`).textContent, PA);
  const a0 = dom.indexOf(word);
  await select(PA, a0, a0 + word.length);
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(250);
  const leaf = await get(PA);
  const mk = (leaf.marks || []).find((m) => m[2] === 'b');
  check('TW-02: Bold covers the selected word, not the letter before it', !!mk && leaf.text.slice(mk[0], mk[1]) === word, JSON.stringify(mk));

  // TW-04: Ctrl+Z right after Ctrl+B (the caret is still in the paragraph) takes the bold back
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const after = await get(PA);
  check('TW-04: Ctrl+Z in the paragraph undoes the app-level edit', !(after.marks || []).some((m) => m[2] === 'b'));

  // TW-03: Enter over a selection removes it (one paragraph) and over two paragraphs removes the span
  await setLeaf(PA, 'ar', ARP);
  await page.waitForTimeout(250);
  const n0 = (await get(PA.replace(/\/\d+$/, ''))).length;
  await select(PA, 10, 20);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const h = text(await get(PA)), tl = text(await get(PA.replace(/\d+$/, '1')));
  check('TW-03: Enter over a selection drops the selected words', strip(h) === strip(ARP.slice(0, 10)) && strip(tl) === strip(ARP.slice(20)), `${h} | ${tl}`);

  // TW-05: that Enter is ONE undo step for both editions: the pair has the same shape and the paragraph counts are back
  await ev(() => window.BW.undo());
  await page.waitForTimeout(300);
  const cnt = async (ed) => (await get(PA.replace(/\/\d+$/, ''), ed)).length;
  check('TW-05: one Undo reverts the split in AR and EN', (await cnt('ar')) === n0 && (await cnt('en')) === n0, `${await cnt('ar')} / ${await cnt('en')} (was ${n0})`);

  // TW-03 (two paragraphs)
  await setLeaf(PA, 'ar', ARP);
  const BR = text(await get(PB));
  await page.waitForTimeout(250);
  await select(PA, 30, 0, 'ar', PB, 10);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const p0 = text(await get(PA)), p1 = text(await get(PA.replace(/\d+$/, '1')));
  check('TW-03: Enter over two paragraphs joins the cut ends', strip(p0) === strip(ARP.slice(0, 30)) && strip(p1) === strip(BR.slice(10)), `${p0.slice(-8)} | ${p1.slice(0, 10)}`);
  await ev(() => window.BW.undo());

  // TW-06: the palette offers the format tools while the format bar is showing
  await select(PA, 3, 9);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  const pal = await ev(() => { const r = document.getElementById('bw-ui-host').shadowRoot; return ['fmtBold', 'fmtItalic', 'fmtBullets', 'fmtColor', 'fmtSize'].filter((id) => r.querySelector(`#cmdlist [data-cmd="${id}"]`)); });
  check('TW-06: Ctrl+K lists Bold, Italic, Bullets, Colour, Size', pal.length === 5, pal.join());
  await page.keyboard.press('Escape');

  // DOCS-02: a section inserted from EN gets an Arabic title in AR (and English in EN)
  await ev(() => { window.BW.S.ed = 'en'; window.BW.render(); });
  await page.waitForTimeout(300);
  await ev(() => { window.BW.EXT.w2layout?.tocAdd?.('/chapters/0/sections/0'); });
  await ev(() => window.BW.EXT.w2objects.table());
  await page.waitForTimeout(300);
  const arT = await get('/chapters/0/sections/1/title', 'ar'), enT = await get('/chapters/0/sections/1/title', 'en');
  check('DOCS-02: a new section has an Arabic title in AR and an English one in EN', /[؀-ۿ]/.test(arT) && !/[؀-ۿ]/.test(enT) && /[A-Za-z]/.test(enT), `${arT} / ${enT}`);
  const colsOf = async (ed) => { let found = null; const d = await doc(ed); (function walk(o) { if (found || !o || typeof o !== 'object') return; if (o.kind === 'table' && o.columns?.[0] && /^(Column|عمود) 1$/.test(o.columns[0])) found = o.columns[0]; for (const k in o) walk(o[k]); })(d.chapters); return found; };
  check('DOCS-02: an inserted table has "Column 1" in EN and "عمود 1" in AR', (await colsOf('en')) === 'Column 1' && (await colsOf('ar')) === 'عمود 1', `${await colsOf('en')} / ${await colsOf('ar')}`);

  // DOCS-01: deleting the block that held the page size hands it to the block that FOLLOWS it, in both editions, in one undo step
  {
    const B0 = '/chapters/0/sections/0/blocks/0';
    await ev((B0) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; let blk = e.doc; for (const k of B0.split('/').filter(Boolean)) blk = blk[k]; B.commit([{ op: 'replace', path: `${B0}/layout`, value: { ...(blk.layout || {}), page: { size: 'A4', orientation: 'landscape' } }, old: blk.layout }], { mirror: true }); }, B0);
    const nextPage = async (ed) => { const d = await doc(ed); const blocks = []; d.chapters.forEach((c) => c.sections.forEach((sc) => sc.blocks.forEach((b) => blocks.push(b)))); return blocks[0]?.layout?.page?.orientation; };
    const before = await nextPage('ar');
    await ev((B0) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; let blk = e.doc; for (const k of B0.split('/').filter(Boolean)) blk = blk[k]; B.commit([{ op: 'delete', path: B0, old: blk }], { mirror: true }); }, B0);
    const [ar, en] = [await nextPage('ar'), await nextPage('en')];
    await ev(() => window.BW.undo());
    const [ar2, en2] = [await nextPage('ar'), await nextPage('en')];
    check('DOCS-01: the page size of a deleted block passes to the next block in AR and EN; one Undo restores both', before === 'landscape' && ar === 'landscape' && en === 'landscape' && ar2 === 'landscape' && en2 === 'landscape', JSON.stringify({ before, ar, en, ar2, en2 }));
  }

  // TCELLS-01 / TCELLS-02: a table with a formula; the shortcuts act on the selected cells; a row insert is ONE undo step
  {
    await ev(() => { window.BW.S.ed = 'en'; window.BW.render(); });
    const ptr = await ev(() => window.BW.EXT.w2objects.table(3, 3));
    for (const [r, c, v] of [[0, 0, '1'], [1, 0, '2'], [0, 1, '5']]) await setLeaf(`${ptr}/rows/${r}/${c}`, 'en', v);
    await page.waitForTimeout(300);
    const cell = (r, c) => page.locator(`main.bw-doc[data-locale="en"] table[data-b="${ptr}"] td[data-r="${r}"][data-c="${c}"]`).first();
    await cell(1, 2).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('=SUM(A1:A2)');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const steps = () => ev(() => new Set(window.BW.M[window.BW.S.svc].en.ops.map((o) => o.id.split('.')[0])).size);
    const rows = async () => (await get(`${ptr}/rows`, 'en')).length;
    const r0 = await rows(), s0 = await steps();
    await cell(0, 0).click();
    await ev(() => window.BW.runAction('rowAdd'));
    await page.waitForTimeout(300);
    const f = (await get(`${ptr}/rows/${r0}/2`, 'en'))?.style?.formula;
    const s1 = await steps();
    await ev(() => window.BW.undo());
    await page.waitForTimeout(300);
    check('TCELLS-01: a row insert with a formula is ONE undo step and one Undo gives the old table', s1 - s0 === 1 && f === '=SUM(A1:A3)' && (await rows()) === r0 && (await get(`${ptr}/rows/1/2`, 'en'))?.style?.formula === '=SUM(A1:A2)', JSON.stringify({ steps: s1 - s0, f, rows: await rows(), r0 }));
    // TCELLS-02: two cells selected (click + shift-click), Ctrl+B
    const centre = async (r, c) => { const b = await cell(r, c).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const [x0, y0] = await centre(0, 0), [x1, y1] = await centre(0, 1);
    await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); // drag over two cells: focus stays on the body
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(300);
    const bold = async (c) => ((await get(`${ptr}/rows/0/${c}`, 'en'))?.marks || []).some((m) => m[2] === 'b');
    check('TCELLS-02: Ctrl+B bolds every selected cell', (await bold(0)) && (await bold(1)));
  }

  // TSYS-01 through the real caller: the served editor's Save HTML carries the fonts as data: URIs, never a dead /font/ path
  {
    const fonts = path.join(tmp, 'fonts.html');
    buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: fonts, set: 'editor-0133-fonts', watermarkDir: null });
    const server = await serve(fonts, 0, {});
    try {
      const sp = await ctx.newPage();
      await sp.goto(`http://127.0.0.1:${server.address().port}/`);
      await sp.waitForFunction(() => window.BW?.ready);
      const dl = sp.waitForEvent('download');
      await sp.evaluate(() => window.BW.runAction('saveHtml'));
      const saved = path.join(tmp, 'saved.html');
      await (await dl).saveAs(saved);
      const html = fs.readFileSync(saved, 'utf8');
      const data = (html.match(/url\(data:font/g) || []).length, rel = (html.match(/url\(\/font\//g) || []).length;
      check('TSYS-01: a served Save HTML embeds the fonts (data: URIs) and keeps no /font/ path', data > 0 && rel === 0, `data ${data}, /font/ ${rel}`);
      await sp.close();
    } finally { server.close(); server.closeAllConnections?.(); }
  }

  check('no page error', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.log(`editor-0133: ${failed} FAILED`); process.exit(1); }
console.log('editor-0133: all passed');
