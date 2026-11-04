// 0.17.0 (bw170 shell): six owner notes about the editor's shell, one group of checks per note, AR and EN, at 1366 and 1920 px.
//   N1  a press on the background outside the page folds the open ribbon (0.17.8 owner rule: the background closes everything open); a contextual tab hands back to the tab the person was on
//   N3  switching language or direction keeps the page being worked on (continuous: the same line stays where it was; one page / two pages: the same page)
//   N4  the ribbon «View» tab and the top-bar display control differ in icon and in name
//   N7  Book view: the two sheets are 12 mm apart whether a turned (landscape) sheet sits beside a turned or a portrait sheet, and every line stays on its sheet
//   N13 the font, size and colour dialogs carry a live preview at the real point size (size chips, each font in its own face)
//   N14 no highlight (hover box, focus box, selection ring) on the document title: first page and «بيانات ضبط الوثيقة»
//
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/shell-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-shell0170-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  shell-0170: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const HOST = '#bw-ui-host';
const browser = await chromium.launch(launchOptions());
const errors = [];

async function session(ui, width) {
  const file = path.join(tmp, `editor-${ui}-${width}.html`);
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: `shell-0170-${ui}`, watermarkDir: null, ui });
  const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { if (!window.BW.S.calm) window.BW.runAction('calm'); }); // calm: no slide, the rects are final at once
  await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
  return page;
}
const ribbon = (page) => page.evaluate(() => {
  const R = window.BW.EXT.ribbon; const r = document.getElementById('bw-ui-host').shadowRoot; const pn = r.querySelector('.rb-panel');
  return { tab: R.state.tab, collapsed: R.state.collapsed, ctx: R.state.ctx, shown: !!pn && !pn.hidden && pn.offsetHeight > 20 };
});

for (const width of [1366, 1920]) {
  for (const ui of ['ar', 'en']) {
    const L = `${ui.toUpperCase()} ${width}`;
    const page = await session(ui, width);
    const H = page.locator(HOST);
    const press = async (sel) => { await H.locator(sel).first().click(); await page.waitForTimeout(500); };

    // ── N1 ──
    {
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('layout'));
      await page.locator('#bw-pair main.bw-doc td').first().click();
      await page.waitForTimeout(400);
      const withCtx = await ribbon(page); // positive sample: a table is selected, so the contextual tab is the open one
      const spot = await page.evaluate(() => { const e = document.elementFromPoint(8, 640); return { onPage: !!e?.closest('#bw-pair main.bw-doc'), tag: e?.tagName }; });
      await page.mouse.click(8, 640);
      await page.waitForTimeout(500);
      const after = await ribbon(page);
      check(`N1 ${L}: the press landed on the background, a table tab was open first`, !spot.onPage && withCtx.ctx === 'table' && withCtx.tab === 'table' && withCtx.shown, JSON.stringify({ spot, withCtx }));
      check(`N1 ${L}: after a press on the background the ribbon is folded and is back on the tab it was on (0.17.8: the background closes what is open)`, after.collapsed && !after.shown && after.tab === 'layout', JSON.stringify(after));
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('font'));
      await page.mouse.click(8, 640);
      await page.waitForTimeout(300);
      const plain = await ribbon(page);
      check(`N1 ${L}: a plain open tab folds on a background press (0.17.8)`, plain.collapsed && !plain.shown && plain.tab === 'font', JSON.stringify(plain));
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('home'));
    }

    // ── N3 ──
    {
      const topLeaf = () => page.evaluate(() => {
        const e = [...document.querySelectorAll('#bw-pair main.bw-doc [data-p]')].find((x) => x.getBoundingClientRect().bottom > 170);
        return { p: e?.dataset.p, top: Math.round(e?.getBoundingClientRect().top), y: Math.round(window.scrollY) };
      });
      await page.evaluate(() => window.scrollTo(0, 3600));
      await page.waitForTimeout(250);
      const a = await topLeaf();
      const other = ui === 'ar' ? 'en' : 'ar';
      await press(`[data-a="ed"][data-ed="${other}"]`);
      const b = await topLeaf();
      await press(`[data-a="dir"][data-d="${ui === 'ar' ? 'ltr' : 'rtl'}"]`);
      const c = await topLeaf();
      check(`N3 ${L}: continuous page, the same line stays where it was after a language and a direction switch`, a.y > 3000 && b.p === a.p && Math.abs(b.top - a.top) <= 3 && c.p === a.p && Math.abs(c.top - a.top) <= 3, JSON.stringify({ a, b, c }));
      await press(`[data-a="ed"][data-ed="${ui}"]`);
      await press(`[data-a="dir"][data-d="${ui === 'ar' ? 'rtl' : 'ltr'}"]`);
      for (const mode of ['single', 'spread']) {
        await page.evaluate((m) => { window.BW.runAction(`view.${m}`); }, mode);
        await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 3);
        await page.evaluate(() => { window.BW.runAction('view.next'); window.BW.runAction('view.next'); });
        await page.waitForTimeout(300);
        const at0 = await page.evaluate(() => window.BW.S.pageAt);
        const sample = await page.evaluate(() => { const v = document.querySelector('#bw-pair .bw-view').getBoundingClientRect(); const e = [...document.querySelectorAll('#bw-pair main.bw-doc [data-p]')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.right > v.left + 4 && r.left < v.right - 4 && r.bottom > v.top; }); return e?.dataset.p; });
        const onView = (p) => page.evaluate((q) => { const v = document.querySelector('#bw-pair .bw-view').getBoundingClientRect(); const e = document.querySelector(`#bw-pair main.bw-doc [data-p="${CSS.escape(q)}"]`); if (!e) return false; const r = e.getBoundingClientRect(); return r.right > v.left + 4 && r.left < v.right - 4; }, p);
        await press(`[data-a="ed"][data-ed="${other}"]`);
        const b1 = { at: await page.evaluate(() => window.BW.S.pageAt), on: await onView(sample) };
        await press(`[data-a="dir"][data-d="${ui === 'ar' ? 'ltr' : 'rtl'}"]`);
        const c1 = { at: await page.evaluate(() => window.BW.S.pageAt), on: await onView(sample) };
        check(`N3 ${L}: ${mode} view stays on page index ${at0} (the page being worked on) after a language and a direction switch`, at0 >= 2 && b1.at === at0 && b1.on && c1.at === at0 && c1.on, JSON.stringify({ at0, sample, b1, c1 }));
        await press(`[data-a="ed"][data-ed="${ui}"]`);
        await press(`[data-a="dir"][data-d="${ui === 'ar' ? 'rtl' : 'ltr'}"]`);
        await page.evaluate(() => window.BW.runAction('view.continuous'));
        await page.waitForTimeout(300);
      }
    }

    // ── N4 ──
    {
      const r = await page.evaluate(() => {
        const sh = document.getElementById('bw-ui-host').shadowRoot;
        const tab = sh.querySelector('.rb-tab[data-tab="view"]');
        const bar = sh.querySelector('.island [data-a="view"]');
        const strip = (el) => el?.querySelector('svg')?.innerHTML.replace(/\s+/g, ' ') || '';
        return { tabIcon: strip(tab), barIcon: strip(bar), tabName: tab?.querySelector('.rb-tl')?.textContent.trim(), barName: bar?.querySelector('.w')?.textContent.trim() };
      });
      check(`N4 ${L}: the ribbon View tab and the top-bar control differ in icon`, !!r.tabIcon && !!r.barIcon && r.tabIcon !== r.barIcon, JSON.stringify({ tab: r.tabIcon.slice(0, 40), bar: r.barIcon.slice(0, 40) }));
      check(`N4 ${L}: ...and in name (${r.tabName} / ${r.barName})`, !!r.tabName && !!r.barName && r.tabName !== r.barName, JSON.stringify(r));
    }

    // ── N7 ──
    {
      await page.evaluate(() => window.BW.runAction('view.spread'));
      await page.waitForFunction(() => document.querySelector('#bw-pair[data-pages="spread"] .bw-view'));
      const combos = new Set();
      const bad = [];
      const scan = async (label) => {
        await page.keyboard.press('Home');
        await page.waitForTimeout(60);
        for (let i = 0; i < 24; i += 1) {
          const r = await page.evaluate(() => {
            const B = window.BW; const view = document.querySelector('#bw-pair .bw-view'); const q = view.getBoundingClientRect(); const k = B.S.pageAt; const T = B.S.pageTab;
            if (k === 0 || !T[k + 1]) return { k, n: B.S.pageN, skip: true };
            const sheets = [...view.querySelectorAll('.bw-sheet')].map((s) => ({ p: +s.dataset.page, r: s.getBoundingClientRect() })).filter((s) => s.p === k || s.p === k + 1).sort((a, b) => a.r.left - b.r.left);
            if (sheets.length !== 2) return { k, n: B.S.pageN, skip: false, sheets: sheets.length };
            const mm = sheets[0].r.width / T[sheets[0].p].w; // px per mm of the shown scale
            const gap = (sheets[1].r.left - sheets[0].r.right) / mm;
            const inside = sheets.every((s) => s.r.left >= q.left - 1 && s.r.right <= q.right + 1 && s.r.top >= q.top - 1 && s.r.bottom <= q.bottom + 1);
            const stray = [];
            for (const e of view.querySelectorAll('main.bw-doc p, main.bw-doc li, main.bw-doc tr, main.bw-doc h2, main.bw-doc h3')) {
              if (e.closest('.bw-runs, .bw-rpts')) continue;
              for (const b of e.getClientRects()) {
                if (b.width < 2 || b.height < 2) continue;
                const vis = Math.min(b.right, q.right) - Math.max(b.left, q.left);
                if (vis < b.width * 0.5 || b.bottom < q.top || b.top > q.bottom) continue; // not one of the two shown pages
                if (!sheets.some((s) => b.left >= s.r.left - 3 && b.right <= s.r.right + 3 && b.top >= s.r.top - 3 && b.bottom <= s.r.bottom + 3)) stray.push(`${e.tagName}@${Math.round(b.left)}`);
              }
            }
            const kind = sheets.map((s) => (T[s.p].w > T[s.p].h ? 'l' : 'p')).join('+');
            return { k, n: B.S.pageN, gap: +gap.toFixed(2), inside, kind, stray: stray.slice(0, 3), strays: stray.length };
          });
          if (r.sheets !== undefined) bad.push(`k${r.k}: ${r.sheets} sheets in the window`);
          if (r.gap !== undefined) {
            combos.add(r.kind);
            if (Math.abs(r.gap - 12) > 0.3 || !r.inside || r.strays) bad.push(JSON.stringify({ k: r.k, kind: r.kind, gap: r.gap, inside: r.inside, strays: r.strays, stray: r.stray }));
          }
          if (r.k + 2 >= r.n) break;
          await page.keyboard.press('PageDown');
          await page.waitForTimeout(60);
        }
      };
      await scan('plain');
      await page.evaluate(() => window.BW.EXT.w2layout.page('A4', 'landscape', 'section', '/chapters/1/sections/0/blocks/0'));
      await page.waitForTimeout(400);
      await scan('chapter 1 turned');
      check(`N7 ${L}: every open book keeps its two sheets 12 mm apart, whole in the window, every line on its sheet`, !bad.length, bad.slice(0, 2).join(' | '));
      check(`N7 ${L}: the scan met landscape beside landscape, landscape beside portrait and portrait beside landscape (positive sample)`, ['l+l', 'l+p', 'p+l'].every((x) => combos.has(x)), [...combos].join(','));
      await page.evaluate(() => { for (let i = 0; i < 6; i += 1) window.BW.undo(); window.BW.runAction('view.continuous'); });
      await page.waitForTimeout(300);
    }

    // ── N13 ──
    {
      const para = '#bw-pair main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]';
      const open = async (a) => {
        await page.locator(para).first().click();
        await page.waitForTimeout(200);
        await page.evaluate((id) => { window.__ask = window.BW.runAction(id); }, a);
        await page.waitForTimeout(250);
      };
      const state = () => page.evaluate(() => {
        const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog');
        const pv = d && !d.hidden ? d.querySelector('.dlg-prev-t') : null;
        if (!pv) return null;
        const cs = getComputedStyle(pv);
        const f = d.querySelector('input, select');
        return { text: pv.textContent.trim().length, size: +parseFloat(cs.fontSize).toFixed(2), family: cs.fontFamily, color: cs.color, chips: [...d.querySelectorAll('[data-chip]')].map((c) => c.dataset.chip), optFonts: [...d.querySelectorAll('option')].map((o) => o.style.fontFamily), v: f.value };
      });
      const close = async () => { await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog [data-k="no"]')?.click()); await page.waitForTimeout(150); };
      await open('fmtSize');
      const s0 = await state();
      await page.evaluate(() => { const f = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog input'); f.value = '22'; f.dispatchEvent(new Event('input', { bubbles: true })); });
      const s1 = await state();
      await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog [data-chip="14"]').click());
      const s2 = await state();
      check(`N13 ${L}: the size dialog previews the text at its real point size (12 pt, 22 pt by typing, 14 pt by a chip)`, !!s0 && s0.text > 0 && Math.abs(s0.size - 16) < 0.1 && Math.abs(s1.size - 29.33) < 0.1 && Math.abs(s2.size - 18.67) < 0.1 && s2.v === '14' && s0.chips.length >= 6, JSON.stringify({ s0, s1, s2 }));
      await close();
      await open('fmtFont');
      const f0 = await state();
      await page.evaluate(() => { const f = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog select'); f.value = [...f.options].pop().value; f.dispatchEvent(new Event('change', { bubbles: true })); });
      const f1 = await state();
      check(`N13 ${L}: the font dialog previews the face chosen and shows every row in its own face`, !!f0 && f0.optFonts.length >= 2 && f0.optFonts.every(Boolean) && f1.family !== f0.family && f1.family.includes(f1.v), JSON.stringify({ f0: f0?.family, f1: f1?.family, v: f1?.v, opts: f0?.optFonts }));
      await close();
      await open('fmtColor');
      await page.evaluate(() => { const f = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog input[type="color"]'); f.value = '#cc0000'; f.dispatchEvent(new Event('input', { bubbles: true })); });
      const c1 = await state();
      check(`N13 ${L}: the colour dialog previews the colour`, !!c1 && c1.color === 'rgb(204, 0, 0)', JSON.stringify(c1));
      await close();
    }

    // ── N14 ──
    {
      const probe = async (sel) => {
        await page.locator(sel).first().scrollIntoViewIfNeeded();
        await page.hover(sel);
        await page.waitForTimeout(350);
        const read = () => page.evaluate((q) => { const e = document.querySelector(q); const c = getComputedStyle(e); return { outline: c.outlineStyle, ring: c.boxShadow, bg: c.backgroundColor }; }, sel);
        const hover = await read();
        await page.click(sel);
        await page.waitForTimeout(450);
        return { hover, focus: await read() };
      };
      const none = (x) => x.outline === 'none' && x.ring === 'none' && x.bg === 'rgba(0, 0, 0, 0)';
      const cover = await probe('#bw-pair main.bw-doc h1[data-p="/control/coverTitle"]');
      check(`N14 ${L}: the title on the first page shows no highlight on hover or focus`, none(cover.hover) && none(cover.focus), JSON.stringify(cover));
      const row = await probe('#bw-pair main.bw-doc table.control:not(.story-info) td[data-p="/control/title"]');
      check(`N14 ${L}: the title in «بيانات ضبط الوثيقة» shows no highlight on hover or focus`, none(row.hover) && none(row.focus), JSON.stringify(row));
      const sibling = await probe('#bw-pair main.bw-doc table.control:not(.story-info) td[data-p="/control/version"]');
      check(`N14 ${L}: another field of that table still shows its hover box (positive sample, the probe sees highlights)`, sibling.hover.outline !== 'none', JSON.stringify(sibling));
    }
    await page.context().close();
  }
}
await browser.close();
check('no page error in any session', !errors.length, errors.slice(0, 2).join(' | '));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
