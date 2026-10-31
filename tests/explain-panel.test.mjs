// 0.15.0 lane explain (owner note 10, handoff bug 6) + 0.15.2 (notes 2 and 15): the explanation panel is on the physical right and opens only on
// hover INTENT (the pointer rests ~500 ms; sweeping never opens; while open another tool swaps in place after ~250 ms), is an OVERLAY (the pages,
// the body padding and the zoom never change), slides with a human ease not tied to the OS reduced-motion setting, has no "seen" memory, closes
// with its X (edge tab brings it back), shows a picture for every card, and works on ribbon tools and tabs.
// Headless Edge, temp profile via launchOptions, closed in finally.
//
//   node tests/explain-panel.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'explain-panel-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null });
const URL = pathToFileURL(file).href;

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  explain-panel: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// the strings as the build merges them: every i18n file (explain.* now live in ext/36-explain.i18n.json)
const T = { ar: {}, en: {} };
for (const f of [path.join(REPO, 'editor', 'ux-i18n.json'), path.join(REPO, 'editor', 'print-i18n.json'), ...fs.readdirSync(path.join(REPO, 'editor', 'ext')).filter((x) => x.endsWith('.i18n.json')).map((x) => path.join(REPO, 'editor', 'ext', x))]) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const l of ['ar', 'en']) Object.assign(T[l], j[l] || {});
}
const browser = await chromium.launch(launchOptions());
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
async function open({ ui = 'ar', width = 1366, height = 860, store = {}, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, ...(reduced ? { reducedMotion: 'reduce' } : {}) });
  await ctx.addInitScript(([u, st]) => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* storage blocked */ } }, [ui, store]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const rect = (page, sel) => sh(page, (r, s) => { const e = r.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, shown: cs.display !== 'none' && !e.hidden }; }, sel);
const card = (page) => sh(page, (r) => { const c = r.querySelector('.xpl'); return c && !c.hidden ? { id: c.dataset.k, text: c.querySelector('p')?.textContent, name: c.querySelector('.xt b')?.textContent, kbd: c.querySelector('kbd')?.textContent, art: !!c.querySelector('.xa svg'), shapes: c.querySelectorAll('.xa svg rect, .xa svg path, .xa svg circle').length, inDock: !!c.closest('.xpl-dock') } : null; });
const center = (page, sel) => sh(page, (r, s) => { const q = r.querySelector(s).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
/** Waits until the card for this key shows (polling); returns ms since `t0`, or -1. */
async function cardAt(page, key, t0, max = 1500) {
  while (Date.now() - t0 < max) { const c = await card(page); if (c && c.id === key) return Date.now() - t0; await page.waitForTimeout(25); }
  return -1;
}
/** The page's layout as a person sees it: the sheets' edges, the body padding, the zoom, the document width. */
const layout = (page) => page.evaluate(() => { const m = document.querySelector('main.bw-doc'); const b = m.getBoundingClientRect(); const de = document.documentElement; return { l: b.left, r: b.right, w: b.width, t: b.top, pad: getComputedStyle(document.body).paddingRight + '|' + getComputedStyle(document.body).paddingLeft, inline: document.body.style.paddingRight, zoom: de.style.getPropertyValue('--bw-zoom'), sw: de.scrollWidth, cw: de.clientWidth }; });
/** Logs closes of the card / the has-card flag from now on (a swap must produce none). */
const spy = (page) => sh(page, (r) => { window.__xplLog = []; const c = r.querySelector('.xpl'); const d = r.querySelector('.xpl-dock'); if (c) new MutationObserver(() => { if (c.hidden) window.__xplLog.push('card-hidden'); }).observe(c, { attributes: true, attributeFilter: ['hidden'] }); if (d) new MutationObserver(() => { if (!d.classList.contains('has-card')) window.__xplLog.push('has-card-off'); }).observe(d, { attributes: true, attributeFilter: ['class'] }); });
const U = '.ribbon .rb-panel [data-a="undo"]', R = '.ribbon .rb-panel [data-a="redo"]';

try {
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui });
    const tag = `${ui}`;
    // geometry: physical right
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    const d = await rect(page, '.xpl-dock');
    check(`${tag}: the panel sits on the physical right, 12 px from the edge, 304 px wide`, d?.shown && Math.abs(vw - d.r - 12) < 2 && Math.abs(d.w - 304) < 2 && d.l > vw / 2, JSON.stringify({ vw, d }));
    const hint = await sh(page, (r) => ({ text: r.querySelector('.xph p')?.textContent, art: !!r.querySelector('.xph svg'), title: r.querySelector('.xd-w')?.textContent }));
    check(`${tag}: empty state shows the hint text and a still picture; the title is the "Explain" word`, hint.text === T[ui]['xpl.hint'] && hint.art && hint.title === T[ui]['xpl.panel'], JSON.stringify(hint));
    const L1 = await layout(page);
    check(`${tag}: the panel is an overlay: the body has no padding and the page is not pushed while it is open`, L1.inline === '' && parseFloat(L1.pad) === 0 && L1.sw <= L1.cw + 1, JSON.stringify(L1));

    // 400 ms delay
    const u = await center(page, U);
    await page.mouse.move(5, 400);
    await page.waitForTimeout(150);
    const t0 = Date.now();
    await page.mouse.move(u.x, u.y);
    await page.waitForTimeout(200);
    const early = await card(page);
    const ms = await cardAt(page, 'undo', t0, 1500);
    check(`${tag}: hovering a ribbon tool shows its card after about 500 ms of rest (not at 200 ms)`, !early && ms >= 450 && ms <= 1100, `early=${JSON.stringify(early)} ms=${ms}`);
    const c = await card(page);
    check(`${tag}: the card has the tool's name, its shortcut, its own explanation and a drawing, inside the panel`, c?.inDock && c.name && c.kbd === 'Ctrl+Z' && c.text === T[ui]['explain.undo'] && c.art && c.shapes > 8, JSON.stringify(c));

    // swap: while a card is open, resting on the neighbour replaces the content after ~250 ms, with no close/open and no second card
    const r = await center(page, R);
    await spy(page);
    const t1 = Date.now();
    await page.mouse.move(r.x, r.y, { steps: 4 });
    await page.waitForTimeout(120);
    const mid = await card(page);
    const ms2 = await cardAt(page, 'redo', t1, 1200);
    const log = await page.evaluate(() => window.__xplLog);
    check(`${tag}: while open, resting on the neighbour swaps the content after ~250 ms (not at once, not after 500 ms)`, mid?.id === 'undo' && ms2 >= 200 && ms2 < 480, `mid=${mid?.id} ms=${ms2}`);
    check(`${tag}: the swap never closes the card or the panel (no hidden / has-card flicker)`, log.length === 0 && (await sh(page, (rt) => rt.querySelectorAll('.xpl').length)) === 1, JSON.stringify(log));
    // the card stays when the pointer leaves
    await page.mouse.move(5, 400);
    await page.waitForTimeout(700);
    const stay = await card(page);
    check(`${tag}: the card stays when the pointer leaves (the panel is a reference area)`, stay?.id === 'redo', JSON.stringify(stay));
    // no anti-spam: five times in a row
    let all = true; const times = [];
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.move(5, 400); await page.waitForTimeout(700); // outside the warm window
      const a = Date.now(); await page.mouse.move(u.x, u.y); const m = await cardAt(page, 'undo', a, 1200);
      times.push(m); if (m < 0) all = false;
      await page.mouse.move(r.x, r.y); await cardAt(page, 'redo', Date.now(), 1200);
    }
    check(`${tag}: hovering the same tool 5 times shows its card 5 times (no "seen" suppression)`, all, times.join(','));
    const mem = await page.evaluate(() => ({ s: sessionStorage.getItem('bw:xpl-seen'), l: localStorage.getItem('bw:xpl-seen') }));
    check(`${tag}: nothing is remembered about seen cards`, !mem.s && !mem.l, JSON.stringify(mem));

    // ribbon tab and a tool on another tab (bug 6: tied to ribbon buttons, also after a repaint)
    const tabPos = await center(page, '.ribbon .rb-tab[data-tab="insert"]');
    const t2 = Date.now(); await page.mouse.move(tabPos.x, tabPos.y);
    const ms3 = await cardAt(page, 'rbtab_insert', t2, 1500);
    const tabCard = await card(page);
    check(`${tag}: a ribbon tab explains itself (name, text, picture)`, ms3 >= 0 && tabCard.text === T[ui]['explain.rbtab_insert'] && tabCard.art, `ms=${ms3} ${JSON.stringify(tabCard)}`);
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('insert'));
    await page.waitForTimeout(300);
    const img = await center(page, '.ribbon .rb-panel [data-a="image"]');
    const t3 = Date.now(); await page.mouse.move(img.x, img.y);
    const ms4 = await cardAt(page, 'image', t3, 1500);
    check(`${tag}: a tool on another ribbon tab explains itself after switching tabs`, ms4 >= 0, `ms=${ms4}`);
    // a repaint while the delay runs must not lose the card
    await page.mouse.move(5, 400); await page.waitForTimeout(700);
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('home'));
    await page.waitForTimeout(250);
    const u2 = await center(page, '.ribbon .rb-panel [data-a="find"]'); // (undo is disabled after a repaint on an empty history: a disabled tool explains nothing)
    const t4 = Date.now(); await page.mouse.move(u2.x, u2.y);
    await page.waitForTimeout(120);
    await page.evaluate(() => { window.BW.EXT.ribbon.setTab('insert'); window.BW.EXT.ribbon.setTab('home'); });
    const ms5 = await cardAt(page, 'find', t4, 1500);
    check(`${tag}: a ribbon repaint during the delay does not lose the card`, ms5 >= 0, `ms=${ms5}`);

    // close, edge tab, reload, reopen
    // slide-out: not tied to the OS reduced-motion setting; mid-slide the panel is partway off the edge, then only the edge tab stays
    await sh(page, (rt) => rt.querySelector('.xpl-dock .xd-x').click());
    await page.waitForTimeout(90);
    const midSlide = await rect(page, '.xpl-dock');
    await page.waitForTimeout(450);
    const L2 = await layout(page); // panel open, measured before it closes
    const closed = { dock: await rect(page, '.xpl-dock .xd-h'), tab: await rect(page, '.xd-tab'), ls: await page.evaluate(() => localStorage.getItem('bw:xpl-panel')), pad: await page.evaluate(() => document.body.style.paddingRight) };
    check(`${tag}: the X closes the panel: edge tab 40 x 96 on the right edge, choice saved, page room released`, midSlide.l > d.l + 4 && !closed.dock.shown && closed.tab.shown && Math.abs(closed.tab.w - 40) < 2 && Math.abs(closed.tab.h - 96) < 2 && Math.abs(vw - closed.tab.r) < 2 && closed.ls === '0' && closed.pad === '', JSON.stringify({ midSlide, d, closed }));
    const L3 = await layout(page);
    check(`${tag}: closing the panel changes nothing on the page (left edge, width, zoom: +-0 px)`, L3.l === L2.l && L3.r === L2.r && L3.w === L2.w && L3.t === L2.t && L3.zoom === L2.zoom && L3.sw === L2.sw, JSON.stringify({ L2, L3 }));
    await page.mouse.move(5, 400); await page.waitForTimeout(150);
    await page.mouse.move(u.x, u.y);
    await page.waitForTimeout(900);
    check(`${tag}: no cards while the panel is closed`, !(await card(page)));
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(800);
    const still = await rect(page, '.xpl-dock .xd-h');
    check(`${tag}: still closed after a reload`, still && !still.shown);
    await sh(page, (rt) => rt.querySelector('.xd-tab').click());
    await page.waitForTimeout(500);
    const back = await rect(page, '.xpl-dock .xd-h');
    const L4 = await layout(page);
    check(`${tag}: reopening the panel changes nothing on the page either (+-0 px, same zoom)`, L4.l === L2.l && L4.r === L2.r && L4.w === L2.w && L4.t === L2.t && L4.zoom === L2.zoom && L4.sw === L2.sw && L4.inline === '', JSON.stringify({ L2, L4 }));
    check(`${tag}: the edge tab opens it again (and the choice is saved)`, back?.shown && (await page.evaluate(() => localStorage.getItem('bw:xpl-panel'))) === '1', JSON.stringify(back));
    check(`${tag}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // keyboard: Tab onto a ribbon tool shows its card after about 500 ms (a fresh page: the ribbon is in its first state)
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui });
    await page.evaluate(() => document.activeElement?.blur());
    await sh(page, (rt) => { rt.querySelector('.ribbon .rb-panel [data-a="redo"]').focus(); });
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const t5 = Date.now();
    const ms6 = await cardAt(page, 'redo', t5, 1500);
    const c6 = await card(page);
    check(`${ui}: keyboard focus (Tab) shows the card after the same ~500 ms intent delay, with its drawing`, ms6 >= 450 && c6?.art && c6.text === T[ui]['explain.redo'], `ms=${ms6} ${JSON.stringify(c6)}`);
    check(`${ui}: keyboard: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // migration: the old "explainers off" closes the panel once
  {
    const { ctx, page, errors } = await open({ store: { 'bw:explainers': '0' } });
    const dk = await rect(page, '.xpl-dock .xd-h');
    check('migration: an old bw:explainers=0 opens with the panel closed (and its edge tab)', dk && !dk.shown && (await rect(page, '.xd-tab')).shown, JSON.stringify(dk));
    const ls = await page.evaluate(() => localStorage.getItem('bw:xpl-panel'));
    check('migration: the choice moves to bw:xpl-panel', ls === '0', String(ls));
    check('migration: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // the old modes are ignored: "always" and nothing behave the same
  {
    const { ctx, page } = await open({ store: { 'bw:explainers': 'always' } });
    check('the old "always" mode is simply the new behaviour (panel open)', (await rect(page, '.xpl-dock .xd-h')).shown);
    await ctx.close();
  }
  // drawers are on the left; the panel is on the right: both show from 1280 px, the panel steps aside to its tab below
  for (const [w, both] of [[1700, true], [1366, true], [1100, false]]) {
    const { ctx, page, errors } = await open({ width: w });
    await page.evaluate(() => window.BW.openDrawer('find'));
    await page.waitForTimeout(800);
    const dk = await rect(page, '.xpl-dock .xd-h'), dkb = await rect(page, '.xpl-dock'), dr = await rect(page, '.drawer'), tab = await rect(page, '.xd-tab');
    check(`drawer open at ${w} px: ${both ? 'panel and drawer both show, no overlap' : 'the panel steps aside to its edge tab'}`, both ? dk.shown && dr && dkb.l >= dr.r : !dk.shown && tab.shown, JSON.stringify({ dk, dkb, dr, tab }));
    if (!both) {
      await sh(page, (rt) => rt.querySelector('.xd-tab').click());
      await page.waitForTimeout(300);
      check(`drawer open at ${w} px: tapping the edge tab brings the panel back`, (await rect(page, '.xpl-dock .xd-h')).shown);
    }
    check(`drawer open at ${w} px: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // 0.15.2 note 2: hover intent. A fast sweep across ten tools never opens (nor flickers); resting on one opens once; rapid enter/leave opens nothing.
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui });
    const ids = [...new Set(await sh(page, (rt) => [...rt.querySelectorAll('.ribbon .rb-panel [data-a]')].filter((b) => b.getClientRects().length).map((b) => b.dataset.a)))].slice(0, 10);
    const pts = [];
    for (const id of ids) pts.push(await center(page, `.ribbon .rb-panel [data-a="${id}"]`));
    await page.mouse.move(5, 400); await page.waitForTimeout(150);
    await spy(page);
    let opened = 0;
    for (const p of pts) { await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(25); if (await card(page)) opened += 1; }
    await page.mouse.move(5, 400);
    await page.waitForTimeout(900);
    check(`${ui}: sweeping across ${ids.length} tools quickly never opens the panel`, ids.length >= 8 && opened === 0 && !(await card(page)), `ids=${ids.length} opened=${opened}`);
    // rapid enter / leave of one tool: nothing opens
    for (let i = 0; i < 6; i += 1) { await page.mouse.move(pts[0].x, pts[0].y); await page.waitForTimeout(120); await page.mouse.move(5, 400); await page.waitForTimeout(60); }
    await page.waitForTimeout(700);
    check(`${ui}: rapid enter and leave of one tool opens nothing`, !(await card(page)));
    // rest on one: opens once
    await spy(page);
    await page.mouse.move(pts[2].x, pts[2].y, { steps: 5 });
    const ms = await cardAt(page, ids[2], Date.now(), 1500);
    await page.waitForTimeout(700);
    const logOpen = await page.evaluate(() => window.__xplLog);
    check(`${ui}: resting on one tool opens its card exactly once`, ms >= 0 && (await card(page))?.id === ids[2] && logOpen.length === 0 && (await sh(page, (rt) => rt.querySelectorAll('.xpl').length)) === 1, `ms=${ms} ${JSON.stringify(logOpen)}`);
    // while open: a sweep past other tools changes nothing; resting on the last swaps
    await spy(page);
    for (const p of [pts[3], pts[4], pts[5], pts[6]]) { await page.mouse.move(p.x, p.y, { steps: 3 }); await page.waitForTimeout(40); }
    const afterSweep = await card(page);
    check(`${ui}: while open, sweeping over other tools leaves the content alone (no stale or half swap)`, afterSweep?.id === ids[2], JSON.stringify(afterSweep));
    await page.waitForTimeout(500);
    check(`${ui}: ... and resting on the last one swaps to exactly that tool, without a close`, (await card(page))?.id === ids[6] && (await page.evaluate(() => window.__xplLog)).length === 0, JSON.stringify(await card(page)));
    // leaving the ribbon keeps the open panel
    await page.mouse.move(5, 400); await page.waitForTimeout(800);
    check(`${ui}: leaving the ribbon keeps the open panel and its card`, (await card(page))?.id === ids[6] && (await rect(page, '.xpl-dock .xd-h')).shown);
    // a disabled tool never opens the card; a tool that vanishes during the rest neither
    await sh(page, (rt) => rt.querySelector('.xd-x').click()); await page.waitForTimeout(500);
    await sh(page, (rt) => rt.querySelector('.xd-tab').click()); await page.waitForTimeout(500);
    await sh(page, (rt, id) => { rt.querySelector(`.ribbon .rb-panel [data-a="${id}"]`).setAttribute('aria-disabled', 'true'); }, ids[7]);
    await page.mouse.move(pts[7].x, pts[7].y, { steps: 3 }); await page.waitForTimeout(900);
    check(`${ui}: a disabled tool opens no card`, !(await card(page)));
    await page.mouse.move(5, 400); await page.waitForTimeout(100);
    await page.mouse.move(pts[8].x, pts[8].y, { steps: 3 }); await page.waitForTimeout(150);
    await sh(page, (rt) => { rt.querySelector('.ribbon .rb-panel').style.display = 'none'; }); // the tool under the pointer disappears (hiding one button would only shift its neighbour under it)
    await page.waitForTimeout(900);
    check(`${ui}: a tool hidden during the rest opens no card`, !(await card(page)));
    check(`${ui}: hover intent: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // the slide ignores the OS reduced-motion setting (only the editor's calm button makes it instant)
  {
    const { ctx, page } = await open({ reduced: true });
    const d0 = await rect(page, '.xpl-dock');
    await sh(page, (rt) => rt.querySelector('.xpl-dock .xd-x').click());
    await page.waitForTimeout(90);
    const mid = await rect(page, '.xpl-dock');
    await page.waitForTimeout(450);
    check('the panel slides out even with the OS reduced-motion setting on (mid-slide it is partway off the edge)', mid.l > d0.l + 4, JSON.stringify({ d0, mid }));
    await ctx.close();
    const c = await open({ store: {} });
    await c.page.evaluate(() => window.BW.runAction('calm')); await c.page.waitForTimeout(200);
    await sh(c.page, (rt) => rt.querySelector('.xpl-dock .xd-x').click());
    await c.page.waitForTimeout(60);
    check('the editor calm button makes the panel close at once (no slide)', !(await rect(c.page, '.xpl-dock .xd-h')).shown);
    await c.ctx.close();
  }
  // narrow: the page is not pushed aside under 1280 px
  {
    const { ctx, page } = await open({ width: 1100 });
    const pad = await page.evaluate(() => document.body.style.paddingRight);
    check('at 1100 px the page is not pushed aside (the panel may cover its edge)', (await rect(page, '.xpl-dock .xd-h')).shown && pad === '', pad);
    await ctx.close();
  }
  // the picture of a card in the panel: the real drawing code, every id of the visible ribbon tab
  {
    const { ctx, page, errors } = await open();
    const ids = await sh(page, (rt) => [...rt.querySelectorAll('.ribbon .rb-panel [data-a]')].map((b) => b.dataset.a));
    let bad = [];
    for (const id of [...new Set(ids)].slice(0, 8)) {
      const p = await center(page, `.ribbon .rb-panel [data-a="${id}"]`).catch(() => null);
      if (!p) continue;
      await page.mouse.move(5, 400); await page.waitForTimeout(650);
      const t = Date.now(); await page.mouse.move(p.x, p.y);
      const ms = await cardAt(page, id, t, 1500);
      const c = await card(page);
      if (ms < 0 || !c?.art || c.shapes < 6) bad.push(`${id}:${ms}`);
    }
    check('every tool of the home tab shows a card with a drawing', bad.length === 0 && ids.length > 4, bad.join(' '));
    check('picture checks: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(failed ? `\nexplain-panel: ${failed} FAILED` : `\nexplain-panel: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
