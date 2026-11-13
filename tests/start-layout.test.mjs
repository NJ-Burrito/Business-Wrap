// Owner rule (2026-11-13): on the start page the EN|عربي button changes ONLY the words' language and the RTL|LTR switch only the words' direction;
// no box ever moves. Real headless Chrome at 1280x800: header, recent panel, template grid and filter chips keep the same x (tolerance 2 px)
// after toggling the language and after toggling the direction; the direction is remembered; screenshots of the four states (AR/EN x RTL/LTR).
//   node tests/start-layout.test.mjs     (BW_START_SHOTS=<dir> keeps the screenshots)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { startPayload } from './fixtures/doctypes/stub.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-startlayout-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const shots = process.env.BW_START_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  start-layout: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const json = (x) => JSON.stringify(x).replace(/</g, '\u003c');
const { payload: PL } = startPayload();
const plain = path.join(tmp, 'plain.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: plain, set: 'start-layout', watermarkDir: null });
const html = fs.readFileSync(plain, 'utf8');
const at = html.indexOf('<script id="bw-app">');
const page0 = path.join(tmp, 'types.html');
fs.writeFileSync(page0, `${html.slice(0, at)}<script type="application/json" id="bw-doctypes">${json(PL)}</script>\n${html.slice(at)}`, 'utf8');

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-startlayout'] });
const D = 'dialog.bw-start';
const regions = { header: '.st-bar', title: '.st-head', chips: '.st-chips', grid: '.st-grid', side: '.st-side', spine: '.st-spine' };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('bw-start-seen')) { sessionStorage.setItem('bw-start-seen', '1'); localStorage.setItem('bw:ui', 'en'); localStorage.removeItem('bw:start-dir:en'); localStorage.removeItem('bw:start-dir:ar'); } } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(page0).href + '?start=1');
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  await page.waitForSelector(`${D} .st-tile`, { timeout: 15000 });
  await page.waitForTimeout(1600); // entrance motion done
  const probe = () => page.evaluate(([sel, regions]) => {
    const d = document.getElementById('bw-ui-host').shadowRoot.querySelector(sel);
    const r = {};
    for (const [k, s] of Object.entries(regions)) { const e = d.querySelector(s); if (!e) { r[k] = null; continue; } const b = e.getBoundingClientRect(); r[k] = [b.x, b.y, b.width, b.height]; }
    const tile = d.querySelector('.st-tile'); if (tile) { const b = tile.getBoundingClientRect(); r.tile1 = [b.x, b.y, b.width, b.height]; }
    return { r, dir: d.dir, tdir: d.dataset.tdir, lang: d.lang, h1: d.querySelector('h1').textContent, h1dir: getComputedStyle(d.querySelector('h1')).direction, ovf: d.scrollWidth > d.clientWidth };
  }, [D, regions]);
  const same = (a, b) => Object.keys(a).every((k) => (a[k] === null && b[k] === null) || (a[k] && b[k] && Math.abs(a[k][0] - b[k][0]) <= 2 && Math.abs(a[k][2] - b[k][2]) <= 2));
  const press = async (sel) => { await page.evaluate(([d, s]) => document.getElementById('bw-ui-host').shadowRoot.querySelector(`${d} ${s}`).click(), [D, sel]); await page.waitForTimeout(500); };
  const shot = (n) => page.screenshot({ path: path.join(shots, `start-${n}.png`) });

  const en = await probe();
  check('every main region is present (header, title, chips, grid, recent panel)', ['header', 'chips', 'grid', 'side'].every((k) => en.r[k]), JSON.stringify(en.r));
  check('EN opens with LTR words and the fixed layout (root dir rtl)', en.lang === 'en' && en.tdir === 'ltr' && en.dir === 'rtl' && en.h1dir === 'ltr', JSON.stringify([en.lang, en.tdir, en.dir, en.h1dir]));
  await shot('en-ltr');
  await press('[data-st-d="rtl"]');
  const enR = await probe();
  check('EN + RTL switch: words RTL, language unchanged, no box moved', enR.tdir === 'rtl' && enR.lang === 'en' && enR.h1 === en.h1 && enR.h1dir === 'rtl' && same(en.r, enR.r), JSON.stringify([en.r, enR.r]));
  await shot('en-rtl');
  await press('[data-st-l="ar"]');
  const arR = await probe();
  check('language button EN -> AR: text changes, no box moved (direction choice per language: AR starts RTL)', arR.lang === 'ar' && arR.h1 !== enR.h1 && arR.dir === 'rtl' && arR.tdir === 'rtl' && same(enR.r, arR.r), JSON.stringify([enR.r, arR.r]));
  await shot('ar-rtl');
  await press('[data-st-d="ltr"]');
  const arL = await probe();
  check('AR + LTR switch: words LTR, language unchanged, no box moved', arL.tdir === 'ltr' && arL.lang === 'ar' && arL.h1 === arR.h1 && arL.h1dir === 'ltr' && same(arR.r, arL.r), JSON.stringify([arR.r, arL.r]));
  await shot('ar-ltr');
  check('the pressed state of the switch follows the direction', await page.evaluate(([d]) => document.getElementById('bw-ui-host').shadowRoot.querySelector(`${d} [data-st-d="ltr"]`).getAttribute('aria-pressed') === 'true', [D]));
  check('no sideways overflow in any state', !en.ovf && !enR.ovf && !arR.ovf && !arL.ovf);
  await press('[data-st-l="en"]');
  const enBack = await probe();
  check('EN again: back to its own remembered direction, boxes unchanged from the start', enBack.tdir === 'rtl' && same(en.r, enBack.r), JSON.stringify([enBack.tdir]));
  // remembered across a reload
  await page.reload();
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  await page.waitForSelector(`${D} .st-tile`, { timeout: 15000 });
  const re = await probe();
  check('the direction choice is remembered after a reload', re.tdir === 'rtl' && re.dir === 'rtl', JSON.stringify([re.lang, re.tdir]));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally { await browser.close(); }
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nstart-layout: all passed');
