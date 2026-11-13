// O5: the loading screen. A long phase swaps the small waiting card for a themed screen (AR + EN), fast work never flashes,
// quiet jobs never get the screen, the real callers (fetch kinds, library open / import, bulk) are hooked, Calm holds it still.
//   node tests/loading-0178.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO } from '../engine/export.mjs';
import { suite, launchChrome } from './_harness.mjs';

const OUT = path.join(REPO, 'out', 'loading-0178-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null });
const URL = pathToFileURL(file).href;
const S = suite('loading-0178'); const { check } = S;
const i18n = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', '17-busy.i18n.json'), 'utf8'));
const browser = await launchChrome();
const sh = (page, fn) => page.evaluate((f) => new Function('r', `return (${f})(r)`)(document.getElementById('bw-ui-host').shadowRoot), fn.toString());
try {
  for (const ui of ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    await ctx.addInitScript((u) => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); } } catch { /* none */ } }, ui);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    const st = () => sh(page, (r) => { const c = r.querySelector('.bw-busy'), s = r.querySelector('.bw-load'); return { card: !!c && !c.hidden, screen: !!s && !s.hidden, t: s?.querySelector('.bl-t')?.textContent, d: s?.querySelector('.bl-d')?.textContent, lang: s?.lang }; });
    await page.evaluate(() => { window.__bwBusyT = { slow: 25000, giveUp: 120000, screen: 700 }; });
    // fast work: nothing at all
    await page.evaluate(() => { window.__e = window.BW.EXT.busy.begin('busy.export'); });
    await page.waitForTimeout(120);
    const early = await st();
    await page.evaluate(() => window.__e());
    await page.waitForTimeout(900);
    const after = await st();
    check(`${ui}: fast work (<300 ms) flashes neither card nor screen`, !early.card && !early.screen && !after.card && !after.screen, JSON.stringify({ early, after }));
    // medium: card first, screen later, gone at the end
    await page.evaluate(() => { window.__e = window.BW.EXT.busy.begin('busy.import'); });
    await page.waitForTimeout(500);
    const mid = await st();
    await page.waitForTimeout(800);
    const long = await st();
    await page.evaluate(() => window.__e());
    await page.waitForTimeout(150);
    const end = await st();
    check(`${ui}: card first, then the screen with the phase and a hint in the UI language`, mid.card && !mid.screen && long.screen && !long.card && long.t === i18n[ui]['busy.import'] && long.d === i18n[ui]['busy.keep'] && long.lang === ui, JSON.stringify({ mid, long }));
    check(`${ui}: both leave the moment the work ends`, !end.card && !end.screen, JSON.stringify(end));
    // real callers: fetch kinds (export file, workspace html, file icons) show the screen; a library write stays quiet
    for (const [url, want, expect] of [['/api/export/file', 'busy.export', true], ['/api/workspace/html', 'busy.export', true], ['/api/file-icons/apply', 'busy.icons', true], ['/api/import', 'busy.import', true], ['/api/library/mirror', 'busy.library', false]]) {
      await page.route(`**${url}`, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.fulfill({ status: 200, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } }); });
      const p = page.evaluate((u) => fetch(`http://127.0.0.1:9${u}`, { method: 'POST', body: '{}' }).then((r) => r.status).catch(() => -1), url);
      await page.waitForTimeout(1100);
      const s = await st();
      await p;
      await page.waitForTimeout(150);
      const e2 = await st();
      check(`${ui}: POST ${url} ${expect ? 'shows the screen (' + want + ')' : 'is quiet (card only)'} and clears at the end`, expect ? s.screen && s.t === i18n[ui][want] && !e2.screen && !e2.card : !s.screen && s.card && !e2.card, JSON.stringify({ s, e2 }));
    }
    // library open / import and bulk go through BUSY
    const hooks = await page.evaluate(async () => {
      const B = window.BW.EXT.busy, calls = [], b0 = B.begin;
      B.begin = (w, q) => { calls.push(w); return b0(w, q); };
      await window.BW.EXT.library.open('no-such-doc').catch(() => {});
      await window.BW.EXT.library.importAny(new File(['x'], 'x.exe')).catch(() => {});
      B.begin = b0;
      return { calls, active: B.active() };
    });
    check(`${ui}: library open and importAny begin/end a busy job`, hooks.calls.join() === 'busy.open,busy.import' && hooks.active === 0, JSON.stringify(hooks));
    // Calm: the screen holds still
    await page.evaluate(() => { window.BW.S.calm = true; document.documentElement.dataset.bwCalm = '1'; document.getElementById('bw-ui-host').shadowRoot.querySelector('.shell').dataset.calm = '1'; window.__e = window.BW.EXT.busy.begin('busy.export'); });
    await page.waitForTimeout(1300);
    const anim = await sh(page, (r) => { const s = r.querySelector('.bw-load'); return s && !s.hidden ? [getComputedStyle(s.querySelector('.bl-bar b')).animationName, getComputedStyle(s.querySelector('.bl-art i')).animationName] : null; });
    await page.evaluate(() => window.__e());
    check(`${ui}: Calm holds the screen's motion still`, !!anim && anim.every((n) => n === 'none'), JSON.stringify(anim));
    check(`${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  const bulk = fs.readFileSync(path.join(REPO, 'editor', 'ext', '15-bulk.js'), 'utf8');
  check('bulk apply begins and ends a busy job', /endBusy = EXT\.busy\?\.begin\('busy\.bulk'\)/.test(bulk) && /endBusy\?\.\(\)/.test(bulk));
} finally { await browser.close(); }
S.finish();
console.log('loading-0178: all passed');
