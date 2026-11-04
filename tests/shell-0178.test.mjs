// 0.17.8 shell lane: O1 a click on the background outside the page collapses nothing (ribbon panel, side panel, open list/menu, selection tools);
// O4 the watermark sits at a fixed offset from the page edge (bottom LEFT, physical, in both languages; owner decision 2026-11-04) whatever the role word;
// O7 the gold Save button lives in the top bar, not in the Files group. Real headless Chrome; closed in finally.
//   node tests/shell-0178.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-shell178-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  shell-0178: ${name}${detail && !ok ? '  - ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'shell-0178', watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
const browser = await chromium.launch(launchOptions());
const SH = `document.getElementById('bw-ui-host').shadowRoot`;
const sh = (page, fn) => page.evaluate(`(${fn})(${SH})`);

async function open(ui) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.removeItem('bw:rb:c'); localStorage.setItem('bw:wm-intro', '1'); sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* storage denied */ } }, ui);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && window.BW_WM);
  await page.waitForFunction(() => document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.ribbon .rb-panel .b'));
  await page.waitForFunction(() => document.documentElement.classList.contains('bw-ready'));
  await page.waitForTimeout(1200);
  return { ctx, page, errors };
}

try {
  const wmBox = (page) => page.evaluate(() => { const r = document.querySelector('#bw-watermark .bw-wm-stage').getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(innerWidth - r.right), w: Math.round(r.width) }; });
  const offsets = {};
  for (const ui of ['en', 'ar']) {
    const { ctx, page, errors } = await open(ui);
    // looked (R15): the ribbon is drawn, the page exists, the mark exists
    const ready = await sh(page, (r) => !!r.querySelector('.ribbon .rb-panel .b'));
    check(`${ui}: looked - ribbon, page and mark are mounted`, ready && !!(await page.$('#bw-pair main.bw-doc')) && !!(await page.$('#bw-watermark')));

    // O7
    const o7 = await sh(page, (r) => {
      const s = r.querySelector('.island.bar > [data-a="save"]');
      const files = r.querySelectorAll('#rb-panel [data-a="save"], .rb-panel [data-a="save"]');
      const c = s && getComputedStyle(s);
      return { top: !!s, primary: !!s?.classList.contains('primary'), name: !!(s?.getAttribute('title') && s?.textContent.trim()), key: s?.dataset.key || '', files: files.length, visible: !!s && s.getBoundingClientRect().width > 0, bg: c?.backgroundColor };
    });
    check(`${ui} O7: Save is in the top bar, gold primary, labelled, with its shortcut`, o7.top && o7.primary && o7.name && o7.key === 'Ctrl+S' && o7.visible, JSON.stringify(o7));
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('file'));
    await page.waitForTimeout(200);
    const inFiles = await sh(page, (r) => r.querySelectorAll('.rb-panel [data-a="save"]').length);
    check(`${ui} O7: the Files group no longer holds Save`, inFiles === 0, String(inFiles));

    // O4
    const roles = await page.evaluate(() => window.BW_WM.roles());
    const seen = [];
    for (let i = 0; i < roles.length; i += 1) {
      seen.push(await wmBox(page));
      await page.evaluate(() => window.BW_WM.next());
      await page.waitForTimeout(150);
    }
    const key = 'l'; // owner: bottom LEFT in both languages, never mirrored
    check(`${ui} O4: the mark's left offset is the same for all ${roles.length} role words`, seen.length > 1 && seen.every((b) => b[key] === seen[0][key]), JSON.stringify(seen));
    offsets[ui] = seen[0][key];
    const other = 'r';
    check(`${ui} O4: the mark is on the left half`, seen[0][key] < seen[0][other], JSON.stringify(seen[0]));

    // O1 (owner reversal 2026-11-04): a press on the background outside the pages and outside every UI surface CLOSES what is open
    const state = () => sh(page, (r) => ({ drawer: !!r.querySelector('.drawer:not([hidden]):not(.closing)'), panel: !!r.querySelector('.rb-panel') && !r.querySelector('.rb-panel').hidden }));
    const unfold = async () => { await page.evaluate(() => window.BW.EXT.ribbon.collapse(false)); await page.waitForTimeout(300); };
    // ribbon fold
    await unfold();
    const rb0 = await state();
    await page.mouse.click(4, 400);
    await page.waitForTimeout(500);
    const rb1 = await state();
    check(`${ui} O1: looked - the ribbon panel was shown; a background press folds it`, rb0.panel && !rb1.panel, JSON.stringify({ rb0, rb1 }));
    // side panel
    await unfold();
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForTimeout(500);
    const dr0 = await state();
    await page.mouse.click(1596, 400);
    await page.waitForTimeout(600);
    const dr1 = await state();
    check(`${ui} O1: looked - the side panel was open; a background press closes it (and folds the ribbon)`, dr0.drawer && dr0.panel && !dr1.drawer && !dr1.panel, JSON.stringify({ dr0, dr1 }));
    // the view list
    await unfold();
    await page.evaluate(() => window.BW.runAction('view'));
    await page.waitForTimeout(300);
    const viewOpen = await sh(page, (r) => !r.querySelector('#viewpop')?.hidden);
    await page.mouse.click(4, 400);
    await page.waitForTimeout(300);
    const viewStill = await sh(page, (r) => !r.querySelector('#viewpop')?.hidden);
    check(`${ui} O1: looked - the view list opened; a background press closes it`, viewOpen && !viewStill, JSON.stringify({ viewOpen, viewStill }));
    // Esc and the close button still work
    await unfold();
    await page.evaluate(() => window.BW.runAction('view'));
    await page.waitForTimeout(300);
    await sh(page, (r) => r.querySelector('.island [data-a="view"]')?.focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterEsc = await sh(page, (r) => !r.querySelector('#viewpop') || r.querySelector('#viewpop').hidden);
    check(`${ui} O1: Esc still closes the open list`, afterEsc);
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForTimeout(400);
    const wasOpen = await sh(page, (r) => !!r.querySelector('.drawer:not([hidden])'));
    await sh(page, (r) => r.querySelector('.drawer [data-k="close"]')?.click());
    await page.waitForTimeout(500);
    const closed = await sh(page, (r) => !r.querySelector('.drawer:not([hidden]):not(.closing)'));
    check(`${ui} O1: the drawer's close button still works`, wasOpen && closed, JSON.stringify({ wasOpen, closed }));
    // 28-scope.js: the open scope menu closes on a background press (a cell is selected first: the menu needs a selection)
    const cellSel = await page.evaluate(async () => {
      const B = window.BW; const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks; const at = `/chapters/1/sections/0/blocks/${blocks.length}`;
      B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B'], rows: [['1', '2'], ['3', '4']] } }], { mirror: true });
      await new Promise((q) => setTimeout(q, 300));
      const td = document.querySelector(`#bw-pair main.bw-doc[data-locale="${B.S.ed}"] table[data-b="${at}"] td[data-r="0"][data-c="0"]`);
      td.scrollIntoView({ block: 'center' });
      await new Promise((q) => setTimeout(q, 200));
      const r = td.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(cellSel.x, cellSel.y);
    await page.waitForTimeout(400);
    const menuAsk = await page.evaluate(() => { try { window.BW.EXT.scope.open(); } catch (e) { return String(e); } return 'ok'; });
    await page.waitForTimeout(300);
    const menuOpen = await page.evaluate(() => !!window.BW.EXT.scope.menu());
    await page.mouse.click(4, 400);
    await page.waitForTimeout(300);
    const menuStill = await page.evaluate(() => !!window.BW.EXT.scope.menu());
    check(`${ui} O1: looked - the scope menu opened; a background press closes it`, menuOpen && !menuStill, JSON.stringify({ menuAsk, menuOpen, menuStill }));
    // diagram-ui.js: the diagram gallery popup closes on a background press
    await page.evaluate(() => window.BW.runAction('addDiagram'));
    await page.waitForTimeout(900);
    await page.evaluate(() => window.BW.runAction('dgSymbol'));
    await page.waitForTimeout(400);
    const galOpen = await page.evaluate(() => !!document.querySelector('.bw-dg-gallery'));
    await page.mouse.click(4, 400);
    await page.waitForTimeout(300);
    const galStill = await page.evaluate(() => !!document.querySelector('.bw-dg-gallery'));
    check(`${ui} O1: looked - the diagram popup opened; a background press closes it`, galOpen && !galStill, JSON.stringify({ galOpen, galStill }));
    // a press ON the page keeps the old behaviour: the ribbon stays unfolded
    await unfold();
    const pg = await page.evaluate(() => { const m = document.querySelector('#bw-pair main.bw-doc'); const r = m.getBoundingClientRect(); const x = Math.round(r.left + 3), y = Math.round(Math.min(Math.max(r.top + 40, 300), innerHeight - 100)); return { x, y, onPage: !!document.elementFromPoint(x, y)?.closest('#bw-pair main.bw-doc') }; });
    await page.mouse.click(pg.x, pg.y);
    await page.waitForTimeout(300);
    check(`${ui} O1: a press on the page does not fold the ribbon`, pg.onPage && (await state()).panel, JSON.stringify(pg));
    check(`${ui}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  check('O4: Arabic keeps the English offset from the left edge (no mirror)', offsets.en === offsets.ar, JSON.stringify(offsets));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `FAILED: ${failed}` : 'all shell-0178 checks passed');
process.exit(failed ? 1 : 0);
