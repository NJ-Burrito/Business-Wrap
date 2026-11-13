// 0.16.0 lane ui. One check per fixed item, each through the real editor in headless Chrome (closed in finally):
//   U1 a tool pressed in the strip keeps the keyboard when the strip refits (the node moves between strip and «More»)
//   U6 (M4) the Explain panel waits as its edge tab in a narrow window nobody chose for, and steps aside for a diagram's canvas handles
//   U7 (L7) a chapter heading selects with a strip (title, Move up/down, Comment) and moves the chapter
//   U8 a table cell can be kept empty on purpose: AR + EN words, an explainer in both languages, `keepEmpty` stored and toggled back
//   node tests/ui-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'ui-0160-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ui-0160: ${name}${detail && !ok ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 400) : ''}`); if (!ok) failed += 1; };
const file = buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: path.join(OUT, 'editor.html'), set: 'ui-0160', watermarkDir: '' }).out;
const read = (f) => JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', f), 'utf8'));

// the words are in both languages (static)
{
  const c = read('24-cells.i18n.json'), x = read('36-explain.i18n.json'), u = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ux-i18n.json'), 'utf8'));
  check('U8 the tool has its name and its explainer in Arabic and English', ['ar', 'en'].every((l) => c[l].cellKeepEmpty && x[l]['explain.cellKeepEmpty']));
  check('U7 «chapter» has its word in Arabic and English', u.ar['ux.selChapter'] && u.en['ux.selChapter']);
}

const browser = await chromium.launch(launchOptions());
const errors = [];
const open = async (vp, store = {}) => {
  const ctx = await browser.newContext({ viewport: vp });
  await ctx.addInitScript((st) => { try { localStorage.setItem('bw:ui', 'ar'); localStorage.setItem('bw:calm', '1'); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } catch { /* none */ } }, store);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForTimeout(500);
  return { ctx, page };
};
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);

try {
  // ── U1 ──
  {
    const { ctx, page } = await open({ width: 1440, height: 900 });
    const sec = await page.evaluate(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; for (const [i, ch] of d.chapters.entries()) for (const [j, s] of ch.sections.entries()) if (s.blocks.length === 2 && s.blocks[0].kind === 'prose' && s.blocks[1].kind !== 'prose') return `/chapters/${i}/sections/${j}`; return null; });
    const el = page.locator(`main.bw-doc [data-p="${sec}/blocks/0/paragraphs/0"]`); await el.scrollIntoViewIfNeeded(); await el.click(); await page.waitForTimeout(200);
    check('U1 ready: the strip shows the move tools (R15)', await sh(page, (r) => !!r.querySelector('.ctx [data-a="moveDown"]')));
    await page.locator('.ctx [data-a="moveDown"]').click(); await page.waitForTimeout(400);
    const f1 = await page.evaluate(() => ({ host: document.activeElement?.id, a: document.getElementById('bw-ui-host').shadowRoot.activeElement?.dataset?.a }));
    check('U1 the pressed tool still holds the keyboard after the strip refit', f1.host === 'bw-ui-host' && /^move(Up|Down)$/.test(f1.a || ''), JSON.stringify(f1));
    // the refit itself: a tool that holds focus is moved into «More» by a narrower window; the keyboard stays in the strip (More), never the page
    await page.setViewportSize({ width: 1024, height: 900 }); await page.waitForTimeout(500);
    const f2 = await page.evaluate(() => ({ host: document.activeElement?.id, a: document.getElementById('bw-ui-host').shadowRoot.activeElement?.dataset?.a }));
    check('U1 a narrower window refits the strip and the keyboard stays in the toolbar', f2.host === 'bw-ui-host' && !!f2.a, JSON.stringify(f2));
    await ctx.close();
  }
  // ── U6 ──
  {
    const { ctx, page } = await open({ width: 1024, height: 800 });
    const d = await sh(page, (r) => { const k = r.querySelector('.xpl-dock'); return k && { open: k.dataset.open, head: getComputedStyle(k.querySelector('.xd-h')).display, w: k.getBoundingClientRect().width }; });
    check('U6 at 1024 nobody has chosen: the panel waits as its 40 px edge tab and covers no page', !!d && d.head === 'none' && d.w <= 41, JSON.stringify(d));
    await sh(page, (r) => r.querySelector('.xpl-dock .xd-tab').click());
    await page.waitForTimeout(400);
    const d2 = await sh(page, (r) => { const k = r.querySelector('.xpl-dock'); return { open: k.dataset.open, head: getComputedStyle(k.querySelector('.xd-h')).display }; });
    check('U6 the edge tab opens it, and that is remembered', d2.open === '1' && d2.head !== 'none' && (await page.evaluate(() => localStorage.getItem('bw:xpl-panel'))) === '1', JSON.stringify(d2));
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ width: 1500, height: 900 });
    const FIG = '#bw-pair main.bw-doc figure[data-dg]';
    const st0 = await sh(page, (r) => { const k = r.querySelector('.xpl-dock'); return { open: k.dataset.open, head: getComputedStyle(k.querySelector('.xd-h')).display, aside: k.dataset.aside || '' }; });
    check('U6 ready: at 1500 the panel is open and no diagram is selected', st0.open === '1' && st0.head !== 'none' && !st0.aside, JSON.stringify(st0));
    await page.locator(FIG).first().scrollIntoViewIfNeeded();
    const b = await page.locator(`${FIG} svg`).first().boundingBox();
    await page.mouse.click(b.x + 4, b.y + 4); await page.waitForTimeout(300);
    const n = await page.locator(`${FIG} [data-dg-cv]`).count();
    check('U6 ready: the diagram is selected and shows its canvas handles', n === 8, String(n));
    await page.waitForTimeout(300);
    const st1 = await sh(page, (r) => { const k = r.querySelector('.xpl-dock'); return { aside: k.dataset.aside || '', head: getComputedStyle(k.querySelector('.xd-h')).display, w: k.getBoundingClientRect().width }; });
    const hs = await page.evaluate((FIG) => [...document.querySelectorAll(`${FIG} [data-dg-cv]`)].map((h) => { const r = h.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return [h.dataset.dgCv, r.width > 0, e === h || h.contains(e)]; }), FIG);
    const covered = hs.filter(([, vis, reach]) => vis && !reach);
    check('U6 with handles under it the panel steps aside to its edge tab', st1.aside === '1' && st1.head === 'none' && st1.w <= 41, JSON.stringify(st1));
    check('U6 every canvas handle that is on screen can be reached by the pointer', hs.length === 8 && covered.length === 0, JSON.stringify(covered));
    const para = page.locator('#bw-pair main.bw-doc p').first(); await para.scrollIntoViewIfNeeded(); await para.click(); await page.evaluate(() => window.BW.render(false)); await page.waitForTimeout(500);
    const left = await page.locator(`${FIG} [data-dg-cv]`).count();
    const st2 = await sh(page, (r) => { const k = r.querySelector('.xpl-dock'); return { aside: k.dataset.aside || '', head: getComputedStyle(k.querySelector('.xd-h')).display }; });
    check('U6 the panel comes back when the handles are gone', left === 0 && !st2.aside && st2.head !== 'none', JSON.stringify({ left, ...st2 }));
    await ctx.close();
  }
  // ── U7 ──
  {
    const { ctx, page } = await open({ width: 1440, height: 900 });
    const h = page.locator('#bw-pair main.bw-doc h2 [data-p$="/title"]').first();
    await h.scrollIntoViewIfNeeded();
    const ptr = await h.getAttribute('data-p');
    const before = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters.map((c) => c.title));
    await h.click(); await page.waitForTimeout(300);
    const s = await page.evaluate(() => ({ p: window.BW.S.sel?.p }));
    const strip = await sh(page, (r) => { const c = r.querySelector('.island > .ctx'); return { hidden: c.hidden, label: c.querySelector('.st')?.textContent, tools: [...c.querySelectorAll('[data-a]')].map((x) => x.dataset.a).filter((a) => a !== 'more') }; });
    check('U7 a click on a chapter heading selects it and the strip shows a model for a chapter', s.p === ptr && /^\/chapters\/\d+\/title$/.test(ptr) && !strip.hidden && strip.label === 'فصل' && strip.tools.includes('moveDown') && strip.tools.includes('comment'), JSON.stringify({ ptr, s, strip }));
    await page.locator('.ctx [data-a="moveDown"]').click(); await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters.map((c) => c.title));
    check('U7 Move down moves the chapter and the selection follows it', after[1] === before[0] && after[0] === before[1] && (await page.evaluate(() => window.BW.S.sel?.p)) === '/chapters/1/title', JSON.stringify({ before, after }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
    const undone = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters.map((c) => c.title));
    check('U7 undo puts the chapter back', JSON.stringify(undone) === JSON.stringify(before), JSON.stringify(undone));
    await ctx.close();
  }
  // ── U8 ──
  {
    const { ctx, page } = await open({ width: 1600, height: 900 });
    const ed = await page.evaluate(() => window.BW.S.ed);
    const P = await page.evaluate(() => {
      const B = window.BW; const at = `/chapters/1/sections/0/blocks/${B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks.length}`;
      B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B', 'C'], rows: [['1', '2', '3'], ['4', '5', '6']] } }], { mirror: true });
      return at;
    });
    const rows = () => page.evaluate(([p]) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return JSON.parse(JSON.stringify(o.rows)); }, [P]);
    const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${P}"] td[data-r="${r}"][data-c="${c}"]`;
    const c01 = page.locator(cell(0, 1)); await c01.scrollIntoViewIfNeeded();
    const bx = await c01.boundingBox(); await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.down(); await page.mouse.up(); // a cell selection through the pointer, as a person makes it
    await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2, { modifiers: ['Shift'] });
    await page.waitForTimeout(250);
    check('U8 ready: the cell tools are on offer for this table', await page.evaluate(() => window.BW.EXT.cells.tools().includes('cellKeepEmpty')));
    await page.evaluate(() => window.BW.EXT.cells.select([[0, 1], [1, 1]], { ed: window.BW.S.ed, rows: null, b: null }));
    await page.evaluate(([p]) => { const e = window.BW.EXT.cells.state; e.rows = `${p}/rows`; e.b = p; }, [P]);
    const pick = () => page.evaluate(([p]) => { const E = window.BW.EXT.cells; E.select([[0, 1], [1, 1]], { ed: window.BW.S.ed, rows: `${p}/rows`, b: p }); }, [P]);
    await pick();
    await page.evaluate(() => window.BW.runAction('cellKeepEmpty'));
    await page.waitForTimeout(250);
    const r1 = await rows();
    check('U8 the command stores keepEmpty in the selected cells only (one undo step)', r1[0][1]?.keepEmpty === true && r1[0][1]?.text === '' && r1[1][1]?.keepEmpty === true && r1[0][0] === '1' && r1[1][2] === '6', JSON.stringify(r1));
    const shown = await page.locator(cell(0, 1)).innerText();
    check('U8 the kept-empty cell shows empty in the editor (never «none»)', shown.trim() === '', JSON.stringify(shown));
    await pick(); await page.evaluate(() => window.BW.runAction('cellKeepEmpty')); await page.waitForTimeout(250);
    const r2 = await rows();
    check('U8 pressed again it gives plain blank cells back', r2[0][1] === '' && r2[1][1] === '' && r2[0][0] === '1', JSON.stringify(r2));
    await pick(); await page.evaluate(() => window.BW.runAction('cellKeepEmpty')); await page.waitForTimeout(250);
    const r2b = await rows();
    check('U8 ready: the cells are kept empty again before the undo (R15)', r2b[0][1]?.keepEmpty === true && r2b[1][1]?.keepEmpty === true, JSON.stringify(r2b));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
    const r3 = await rows();
    check('U8 undo of the command restores the cells', r3[0][1] === '' && r3[1][1] === '', JSON.stringify(r3));
    // it prints empty: the real render of this doc
    await pick(); await page.evaluate(() => window.BW.runAction('cellKeepEmpty')); await page.waitForTimeout(250);
    const html = await page.evaluate(([p]) => { const B = window.BW; const t = B.M[B.S.svc][B.S.ed].doc; return JSON.stringify(t); }, [P]);
    check('U8 the kept cell is in the document as {"text":"","keepEmpty":true}', html.includes('"keepEmpty":true'));
    const tools = await sh(page, (r) => [...r.querySelectorAll('.ctx [data-a="cellKeepEmpty"]')].length);
    check('U8 the tool is in the selection strip of a table cell (strip or «More»)', tools >= 1, String(tools));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
console.log(failed ? `FAILED: ${failed}` : 'ui-0160: all passed');
process.exit(failed ? 1 : 0);
