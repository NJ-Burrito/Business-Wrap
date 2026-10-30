// 0.14.0 lane ux-a: A1 explainer side panel, A2 waiting popup, A3 toasts clear of the page controls, A4 reading mode.
// Headless Edge, temp profile via launchOptions, closed in finally.
//
//   node tests/ux-a-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'ux-a-0140-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null });
const URL = pathToFileURL(file).href;

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ux-a-0140: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
async function open({ ui = 'ar', width = 1366, height = 860, store = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([u, st]) => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* none */ } }, [ui, store]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const rect = (page, sel) => sh(page, (r, s) => { const e = r.querySelector(s); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; }, sel);
const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const card = (page) => sh(page, (r) => { const c = r.querySelector('.xpl'); return c && !c.hidden ? { text: c.querySelector('p')?.textContent, inDock: !!c.closest('.xpl-dock') } : null; });
const UX = { ar: {}, en: {} };
{
  const j = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ux-i18n.json'), 'utf8'));
  for (const l of ['ar', 'en']) Object.assign(UX[l], j[l]);
  for (const f of fs.readdirSync(path.join(REPO, 'editor', 'ext')).filter((x) => x.endsWith('.i18n.json'))) {
    const e = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', f), 'utf8'));
    for (const l of ['ar', 'en']) Object.assign(UX[l], e[l] || {});
  }
}
// 0.14.0: ext/10-library.js re-words explain.save at runtime (overwrite-in-place); the shipped text wins over ux-i18n.json
{
  const lib = fs.readFileSync(path.join(REPO, 'editor', 'ext', '10-library.js'), 'utf8');
  const m = [...lib.matchAll(/'explain\.save': (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),/g)];
  ['ar', 'en'].forEach((l, i) => { if (m[i]) UX[l]['explain.save'] = (m[i][1] ?? m[i][2]).replace(/\\'/g, "'"); });
}
const toastRects = (page) => sh(page, (r) => [...r.querySelectorAll('.toast')].map((x) => { const b = x.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; }));
// 0.14.0: the tools live in the ribbon; Save is on its File tab
const saveXY = async (page) => { await page.evaluate(() => window.BW.EXT.ribbon.setTab('file')); await page.waitForTimeout(150); return sh(page, (r) => { const q = r.querySelector('.ribbon .rb-panel [data-a="save"]').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }); };

try {
  // ── A1 ──
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui, store: { 'bw:explainers': 'always' } });
    const idle = await sh(page, (r) => { const d = r.querySelector('.xpl-dock'); const b = d?.getBoundingClientRect(); return d && !d.hidden ? { open: d.dataset.open, hint: d.querySelector('.xph')?.textContent, edge: Math.min(b.left, document.documentElement.clientWidth - b.right), t: b.top } : null; });
    check(`A1 ${ui}: one side panel at the inline-end edge, open by default, with its hint`, idle?.open === '1' && idle.hint === UX[ui]['xpl.hint'] && idle.edge >= 0 && idle.edge <= 40 && idle.t > 40, JSON.stringify(idle));
    const bt = await saveXY(page);
    await page.mouse.move(bt.x, bt.y);
    await page.waitForTimeout(1300);
    const hov = await card(page);
    check(`A1 ${ui}: hovering a tool shows its explanation inside the panel`, hov?.inDock && hov.text === UX[ui]['explain.save'], JSON.stringify(hov));
    const geo = await sh(page, (r) => { const c = r.querySelector('.xpl').getBoundingClientRect(); const d = r.querySelector('.xpl-dock').getBoundingClientRect(); const top = r.elementFromPoint(c.left + c.width / 2, c.top + 12); return { inside: c.left >= d.left - 1 && c.right <= d.right + 1 && c.bottom <= innerHeight, topIsPanel: !!top?.closest('.xpl-dock') }; });
    check(`A1 ${ui}: the card is fully on screen and nothing is drawn over it`, geo.inside && geo.topIsPanel, JSON.stringify(geo));
    await page.mouse.move(5, 400);
    await page.waitForTimeout(250);
    check(`A1 ${ui}: leaving the tool clears the panel back to its hint`, !(await card(page)));
    await page.evaluate(() => document.activeElement?.blur());
    await sh(page, (r) => { r.querySelector('.ribbon .rb-panel [data-a="save"]').focus(); });
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    await page.waitForTimeout(1300);
    const kb = await card(page);
    check(`A1 ${ui}: keyboard focus shows the explanation in the panel`, kb?.inDock && kb.text === UX[ui]['explain.save'], JSON.stringify(kb));
    await page.evaluate(() => window.BW.openDrawer('find'));
    await page.waitForTimeout(800);
    const [dk, dr] = [await rect(page, '.xpl-dock'), await rect(page, '.drawer')];
    check(`A1 ${ui}: with a slide-over panel open the explainer panel steps aside (no overlap)`, dk && dr && !hit(dk, dr), JSON.stringify({ dk, dr }));
    await sh(page, (r) => r.querySelector('.xpl-dock .xd-t').click());
    await page.waitForTimeout(300);
    const col = await sh(page, (r) => ({ open: r.querySelector('.xpl-dock').dataset.open, body: r.querySelector('.xd-b').hidden, ls: localStorage.getItem('bw:xpl-panel') }));
    check(`A1 ${ui}: collapse works and is remembered (bw:xpl-panel=0)`, col.open === '0' && col.body && col.ls === '0', JSON.stringify(col));
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(800);
    const re = await sh(page, (r) => r.querySelector('.xpl-dock').dataset.open);
    const bt2 = await saveXY(page);
    await page.mouse.move(bt2.x, bt2.y);
    await page.waitForTimeout(1300);
    check(`A1 ${ui}: still collapsed after a reload and no card appears while collapsed`, re === '0' && !(await card(page)), re);
    check(`A1 ${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ── A2 ──
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui });
    const vis = () => sh(page, (r) => { const c = r.querySelector('.bw-busy'); return c && !c.hidden ? { text: c.querySelector('.bz-m').textContent, hide: !c.querySelector('.bz-x').hidden, lang: c.lang } : null; });
    await page.evaluate(() => { window.__bwBusyT = { slow: 700, giveUp: 1500 }; window.__e = window.BW.EXT.busy.begin('busy.export'); });
    await page.waitForTimeout(120);
    const early = await vis();
    await page.evaluate(() => window.__e());
    await page.waitForTimeout(500);
    check(`A2 ${ui}: a quick operation (<300 ms) shows no popup`, !early && !(await vis()));
    await page.evaluate(() => { window.__e = window.BW.EXT.busy.begin('busy.export'); });
    await page.waitForTimeout(450);
    const on = await vis();
    check(`A2 ${ui}: an operation over 300 ms shows what is happening in the UI language`, on?.text === UX[ui]['busy.export'] && on.lang === ui, JSON.stringify(on));
    await page.evaluate(() => window.__e());
    await page.waitForTimeout(150);
    check(`A2 ${ui}: it goes away when the work is done`, !(await vis()));
    await page.evaluate(() => { window.__bwBusyT = { slow: 25000, giveUp: 120000 }; });
    await page.route('**/api/export/file', async (route) => { await new Promise((r) => setTimeout(r, 900)); await route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
    const p = page.evaluate(() => fetch('http://127.0.0.1:9/api/export/file', { method: 'POST', body: '{}' }).then((r) => r.status).catch(() => -1));
    await page.waitForTimeout(550);
    const f1 = await vis();
    await p;
    await page.waitForTimeout(150);
    check(`A2 ${ui}: a slow export call is announced and clears when the answer arrives`, f1?.text === UX[ui]['busy.export'] && !(await vis()), JSON.stringify(f1));
    await page.evaluate(() => { window.__bwBusyT = { slow: 500, giveUp: 1400 }; window.BW.EXT.busy.begin('busy.import'); });
    await page.waitForTimeout(1050);
    const slow = await vis();
    check(`A2 ${ui}: after the slow limit it says it is taking long and offers Hide`, slow?.hide && slow.text.includes(UX[ui]['busy.slow']), JSON.stringify(slow));
    await page.waitForTimeout(800);
    const gone = await vis();
    const warn = await sh(page, (r) => [...r.querySelectorAll('.toast.warn .m')].map((x) => x.textContent));
    check(`A2 ${ui}: after the give-up limit the popup hides itself and a message says why`, !gone && warn.includes(UX[ui]['busy.gaveUp']), JSON.stringify({ gone, warn }));
    await page.evaluate(() => { window.__bwBusyT = { slow: 400, giveUp: 120000 }; window.BW.EXT.busy.begin('busy.print'); });
    await page.waitForTimeout(1000);
    await sh(page, (r) => r.querySelector('.bw-busy .bz-x').click());
    check(`A2 ${ui}: the Hide button closes it`, !(await vis()));
    check(`A2 ${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ── A3 ──
  for (const [ui, dir] of [['ar', 'rtl'], ['en', 'ltr']]) {
    for (const width of [1366, 820]) {
      const { ctx, page, errors } = await open({ ui, width, store: { 'bw:pages': 'single' } });
      await page.evaluate((d) => { if (window.BW.S.dir !== d) window.BW.runAction('dir'); }, dir).catch(() => {});
      await page.waitForTimeout(300);
      const pager = await rect(page, '.pager');
      await page.evaluate(() => { window.BW.undoToast('deleted', () => {}); window.BW.toast('another message', 'ok'); });
      await page.waitForTimeout(400);
      const toasts = await toastRects(page);
      check(`A3 ${ui}/${width}: the page pill is showing and no toast or undo prompt overlaps it`, !!pager && toasts.length === 2 && toasts.every((x) => !hit(x, pager)), JSON.stringify({ pager, toasts }));
      const topNext = await sh(page, (r) => { const b = r.querySelector('.pager [data-a="view.next"]').getBoundingClientRect(); const top = r.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!top?.closest('.pager'); });
      check(`A3 ${ui}/${width}: the Next button is the topmost thing at its centre while toasts are up`, topNext);
      await page.evaluate(() => window.BW.openDrawer('find'));
      await page.waitForTimeout(800);
      await page.evaluate(() => window.BW.undoToast('deleted again', () => {}));
      await page.waitForTimeout(300);
      const dr = await rect(page, '.drawer');
      const t2 = await toastRects(page);
      check(`A3 ${ui}/${width}: with a slide-over panel open (page range, preview) toasts stay clear of it`, !!dr && t2.length > 0 && t2.every((x) => !hit(x, dr)), JSON.stringify({ dr, t2 }));
      check(`A3 ${ui}/${width}: no page errors`, !errors.length, errors.join(' | '));
      await ctx.close();
    }
  }
  {
    const { ctx, page } = await open({});
    await page.evaluate(() => window.BW.toast('where', 'info'));
    const o = await sh(page, (r) => { const b = r.querySelector('.toast').getBoundingClientRect(); return { bottom: innerHeight - b.bottom, centre: Math.abs(b.left + b.width / 2 - document.documentElement.clientWidth / 2) }; });
    check('A3: in the continuous view the toast stays bottom-centre', o.bottom <= 40 && o.centre <= 4, JSON.stringify(o));
    await ctx.close();
  }

  // ── A4 ──
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui });
    const st = () => page.evaluate(() => ({ reading: !!window.BW.S.reading, pages: window.BW.S.pages, at: window.BW.S.pageAt || 0, n: window.BW.S.pageN || 0, attr: document.documentElement.dataset.bwReading || '' }));
    const before = await st();
    await page.evaluate(() => window.BW.runAction('reading'));
    await page.waitForTimeout(900);
    const on = await st();
    const chrome = await sh(page, (r) => ({ island: getComputedStyle(r.querySelector('.island')).display, exit: !!r.querySelector('.rd-exit') && getComputedStyle(r.querySelector('.rd-exit')).display !== 'none', pager: !!r.querySelector('.pager') && !r.querySelector('.pager').hidden, dir: r.querySelector('.rd-exit')?.dir }));
    check(`A4 ${ui}: Reading mode hides the toolbar, shows a visible exit button and goes page by page`, on.reading && on.attr === '1' && on.pages !== 'continuous' && on.n > 1 && chrome.island === 'none' && chrome.exit && chrome.pager, JSON.stringify({ on, chrome }));
    await page.evaluate(() => window.BW.S.view = false);
    const inMenu = await sh(page, (r) => !!r.querySelector('#viewpop [data-a="reading"]'));
    check(`A4 ${ui}: the View menu carries the Reading mode switch`, inMenu);
    await page.mouse.move(600, 400);
    const docRtl = await page.evaluate(() => document.querySelector('#bw-pair main.bw-doc')?.dir === 'rtl');
    const next = docRtl ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.press(next); await page.waitForTimeout(150);
    const a1 = await st();
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    const a2 = await st();
    await page.keyboard.press('PageUp'); await page.waitForTimeout(150);
    const a3 = await st();
    await page.keyboard.press('End'); await page.waitForTimeout(150);
    const a4 = await st();
    check(`A4 ${ui}: arrows / Space / PageUp / End turn the pages`, a1.at === on.at + 1 && a2.at === a1.at + 1 && a3.at === a2.at - 1 && a4.at === on.n - 1, JSON.stringify([on.at, a1.at, a2.at, a3.at, a4.at, on.n]));
    const ops0 = await page.evaluate(() => { const B = window.BW; document.querySelector('#bw-pair [data-p][contenteditable]')?.focus(); return B.M[B.S.svc][B.S.ed].ops.length; });
    await page.keyboard.type('zzz'); await page.keyboard.press('Backspace');
    await page.mouse.click(600, 300);
    const after = await page.evaluate(() => { const B = window.BW; return { ops: B.M[B.S.svc][B.S.ed].ops.length, zzz: document.body.textContent.includes('zzz') || [...document.querySelectorAll('[data-p]')].some((x) => x.textContent.includes('zzz')), sel: !!B.S.sel, selOv: B.S.selOv }; });
    check(`A4 ${ui}: nothing can be typed or selected while reading`, !after.zzz && !after.sel && after.selOv == null && after.ops === ops0, JSON.stringify({ ops0, after }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    const off = await st();
    const back = await sh(page, (r) => ({ island: getComputedStyle(r.querySelector('.island')).display, exit: !!r.querySelector('.rd-exit') }));
    check(`A4 ${ui}: Esc leaves reading mode and puts the page mode and toolbar back`, !off.reading && off.pages === before.pages && off.attr === '' && back.island !== 'none' && !back.exit, JSON.stringify({ before, off, back }));
    await page.evaluate(() => window.BW.runAction('reading')); await page.waitForTimeout(800);
    await sh(page, (r) => r.querySelector('.rd-exit').click()); await page.waitForTimeout(800);
    check(`A4 ${ui}: the visible exit button leaves reading mode (second round)`, !(await st()).reading);
    check(`A4 ${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
