// 0.15.0 wave 2 lane polish: W05 from a REAL ribbon click, a failed export fires no W02 (a good one does), W10 plays on a fresh
// profile (queued past the first intro), and the served top bar has exactly one server control (power-off lives in Settings).
//   node tests/polish-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'polish-0150-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file });
const FILEURL = pathToFileURL(file).href;
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  polish-0150: ${name}${detail && !ok ? '  - ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
const plays = (page) => page.evaluate(() => window.BW.EXT.watermark.stats().plays.map((p) => p.id));

/** A tiny host: the built editor at /, /api/export answers per `mode.export`, everything else 404. */
const mode = { export: 500 };
const srv = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(file)); return; }
  if (req.url.startsWith('/api/export')) {
    req.resume();
    res.writeHead(mode.export, { 'content-type': 'application/json' });
    res.end(mode.export === 200 ? JSON.stringify({ pdf: 'a.pdf', docx: 'a.docx', file: 'a.pdf' }) : JSON.stringify({ error: 'boom' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const HTTPURL = `http://127.0.0.1:${srv.address().port}/`;

async function open(url, { seenIntro = true, welcomeDone = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  await ctx.addInitScript(([a, b]) => { try { if (a) localStorage.setItem('bw:wm-intro', '1'); if (b) sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* */ } }, [seenIntro, welcomeDone]);
  await ctx.route(/\.(png|jpg)$/, (r) => r.continue()).catch(() => {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 8000 }).catch(() => {});
  return { ctx, page, errors };
}

try {
  { // W05 from a real ribbon click
    const { ctx, page, errors } = await open(FILEURL);
    await page.waitForTimeout(800);
    const before = await plays(page);
    check('W05: nothing played from the first paint', !before.includes('W05'), before.join(','));
    const cur = await page.locator('.ribbon .rb-tab[aria-selected="true"]').first().getAttribute('data-tab');
    await page.locator('.ribbon .rb-tab[aria-selected="true"]').first().click(); // the selected tab: it folds the ribbon, no tick
    await page.waitForTimeout(600);
    check('W05: collapsing by pressing the selected tab does not play it', !(await plays(page)).includes('W05'));
    const other = await page.locator(`.ribbon .rb-tab:not([data-tab="${cur}"])`).first();
    await other.click(); // a real click on another tab
    await page.waitForFunction(() => window.BW.EXT.watermark.stats().plays.some((p) => p.id === 'W05'), null, { timeout: 4000 }).then(() => check('W05: a real click on another ribbon tab plays W05', true), () => check('W05: a real click on another ribbon tab plays W05', false, (before).join(',')));
    check('W05: no page error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  { // failed export: no W02; a good one: W02
    const { ctx, page, errors } = await open(HTTPURL);
    mode.export = 500;
    await page.evaluate(() => window.BW.runAction('exportPdf'));
    await page.waitForTimeout(2500);
    check('W02: a failed export (HTTP 500) plays no W02', !(await plays(page)).includes('W02'), (await plays(page)).join(','));
    await page.waitForTimeout(4500);
    mode.export = 200;
    await page.evaluate(() => { window.open = () => null; return window.BW.runAction('exportPdf'); });
    await page.waitForFunction(() => window.BW.EXT.watermark.stats().plays.some((p) => p.id === 'W02'), null, { timeout: 4000 }).then(() => check('W02: a finished export plays W02', true), () => check('W02: a finished export plays W02', false));
    void errors;
    await ctx.close();
  }
  { // top bar: exactly one server control; power-off in Settings
    const { ctx, page } = await open(HTTPURL);
    const r = await page.evaluate(() => { const rt = document.getElementById('bw-ui-host').shadowRoot; return { toggles: rt.querySelectorAll('.island .srv-toggle').length, power: rt.querySelectorAll('.island [data-a="powerOff"], .island .pw-btn').length }; });
    check('top bar: exactly one server control (the toggle)', r.toggles === 1 && r.power === 0, JSON.stringify(r));
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForTimeout(600);
    const s = await page.evaluate(() => { const rt = document.getElementById('bw-ui-host').shadowRoot; const b = rt.querySelectorAll('.drawer [data-k="srvPowerOff"]'); const bb = b[0]?.getBoundingClientRect(); return { n: b.length, text: b[0]?.textContent.trim(), box: bb && [Math.round(bb.x), Math.round(bb.y), Math.round(bb.width), Math.round(bb.height)], vis: b[0] && getComputedStyle(b[0]).visibility, toggles: rt.querySelectorAll('.srv-toggle').length }; });
    check('Settings: the power-off button sits in the server section (AR/EN label), toggles stay at two', s.n === 1 && !!s.text && s.toggles === 2 && s.box[2] > 0, JSON.stringify(s));
    await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="srvPowerOff"]').click());
    await page.waitForTimeout(400);
    const asked = await page.evaluate(() => document.documentElement.dataset.bwPower);
    check('Settings: pressing it asks first (the confirm dialog)', asked === 'asked', String(asked));
    await ctx.close();
  }
  { // W10 on a fresh profile: the first intro is playing, W10 waits and then plays
    const { ctx, page } = await open(FILEURL, { seenIntro: false, welcomeDone: false });
    const intro = await page.evaluate(() => document.querySelector('#bw-watermark')?.dataset.intro || 'none');
    await page.waitForFunction(() => window.BW.EXT.watermark.stats().plays.some((p) => p.id === 'W10'), null, { timeout: 30000 }).then(() => check(`W10: a fresh profile (intro: ${intro}) plays W10`, true), () => check(`W10: a fresh profile (intro: ${intro}) plays W10`, false));
    await ctx.close();
  }
} finally { await browser.close(); srv.close(); }

console.log(`polish-0150: ${results.length - failed}/${results.length} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
