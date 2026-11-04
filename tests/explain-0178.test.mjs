// 0.17.8 (O6): the Explain panel in the current theme with motion. Light and dark (dim) x AR (rtl) and EN (ltr), Calm off and on.
//  - motion is present with Calm off (card parts animate, hover/focus transitions run) and absent with Calm on; the OS reduced-motion setting is NOT consulted
//  - every text of the panel is >= 4.5:1 against what it sits on (composited from the real computed colours, light and dark)
//  - AR is mirrored (dock and card rtl, the swap slides the other way); Thmanyah only
//  - one screenshot per mode in out/qa-0.17.8/explain/ (BW_QA_DIR overrides the folder)
// Headless Chrome, temp profile via launchOptions, closed in finally.   PYTHONUTF8=1 node tests/explain-0178.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'explain-0178-test');
const SHOTS = process.env.BW_QA_DIR || path.join(REPO, 'out', 'qa-0.17.8', 'explain');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null });
const URL = pathToFileURL(file).href;

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  explain-0178: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

const css = fs.readFileSync(path.join(REPO, 'editor', 'ext', '37-explain.css'), 'utf8');
check('37-explain.css has no OS prefers-reduced-motion query (only Calm stops motion)', !/prefers-reduced-motion/.test(css));
check('37-explain.css names no font but Thmanyah and no hard-coded Cairo', !/cairo/i.test(css) && !/font-family:\s*['"]?(?!var|Thmanyah)/.test(css.replace(/font-family:\s*var\([^;]*;/g, '').replace(/'Thmanyah Sans'[^;]*;/g, '')));
check('the Calm rule of 37-explain.css exists', /\.shell\[data-calm="1"\] \.xpl-dock/.test(css));

const browser = await chromium.launch(launchOptions());
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
async function open({ ui, dark, calm }) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 }, reducedMotion: 'reduce' }); // OS says reduce: the panel must still move unless Calm is on
  await ctx.addInitScript(([u, d, c]) => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', c ? '1' : '0'); } } catch { /* storage blocked */ } }, [ui, dark, calm]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  return { ctx, page, errors };
}
const center = (page, sel) => sh(page, (r, s) => { const q = r.querySelector(s).getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }, sel);
async function showCard(page, sel, key) {
  const c = await center(page, sel);
  await page.mouse.move(5, 400); await page.waitForTimeout(100);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 60; i++) { if (await sh(page, (r, k) => r.querySelector('.xpl:not([hidden])')?.dataset.k === k, key)) return true; await page.waitForTimeout(40); }
  return false;
}
/** Contrast of the given in-panel elements, composited in the page (layers painted outermost first on a canvas, text over the result). */
const contrast = (page, sels) => sh(page, (r, list) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const g = cv.getContext('2d', { willReadFrequently: true });
  const px = (layers) => { g.clearRect(0, 0, 1, 1); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); for (const c of layers) { g.fillStyle = c; g.fillRect(0, 0, 1, 1); } const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
  const lum = ([R, G, B]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B); };
  const out = {};
  for (const sel of list) {
    const el = r.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const chain = [];
    for (let n = el; n; n = n.parentElement || n.getRootNode()?.host) chain.unshift(n);
    const bgs = chain.map((n) => getComputedStyle(n).backgroundColor).filter((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
    const bg = px(bgs), fg = px([...bgs, getComputedStyle(el).color]);
    const a = lum(bg), b = lum(fg);
    out[sel] = +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
  }
  return out;
}, sels);
const anim = (page, sel) => sh(page, (r, s) => { const e = r.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { a: c.animationName, ad: c.animationDuration, t: c.transitionDuration, ff: c.fontFamily }; }, sel);

try {
  for (const ui of ['ar', 'en']) for (const dark of [false, true]) {
    const mode = `${ui}-${dark ? 'dark' : 'light'}`;
    // ---- Calm off: motion present
    {
      const { ctx, page, errors } = await open({ ui, dark, calm: false });
      const ready = await sh(page, (r) => !!r.querySelector('.xpl-dock[data-open="1"]') && r.querySelector('.shell')?.dataset.calm === '0');
      check(`${mode}: ready state seen (panel open, Calm off)`, ready);
      const dockCss = await anim(page, '.xpl-dock');
      check(`${mode}: the panel has transitions with Calm off, although the OS asks for reduced motion`, !!dockCss && parseFloat(dockCss.t) > 0, JSON.stringify(dockCss));
      const x = await anim(page, '.xd-x');
      check(`${mode}: the close button has a hover transition`, parseFloat(x.t.split(',')[0]) > 0, JSON.stringify(x));
      check(`${mode}: the panel is ${ui === 'ar' ? 'rtl' : 'ltr'}`, await sh(page, (r, u) => r.querySelector('.xpl-dock').dir === (u === 'ar' ? 'rtl' : 'ltr'), ui));
      const hint = await contrast(page, ['.xd-w', '.xph p']);
      const shown = await showCard(page, '.ribbon .rb-panel [data-a="undo"]', 'undo');
      check(`${mode}: hovering Undo shows its card (ready state seen)`, shown);
      if (shown) {
        await sh(page, (r) => r.querySelector('.xpl .xm')?.removeAttribute('hidden'));
        for (const [sel, name] of [['.xpl.in', 'card'], ['.xpl.in .xa', 'art'], ['.xpl.in .xt b', 'title'], ['.xpl.in p', 'text']]) {
          const a = await anim(page, sel);
          check(`${mode}: ${name} arrives with an animation (Calm off)`, !!a && a.a !== 'none' && parseFloat(a.ad) > 0, JSON.stringify(a));
        }
        const cr = { ...hint, ...(await contrast(page, ['.xpl .xt b', '.xpl .xt kbd', '.xpl p', '.xpl .xm'])) };
        const low = Object.entries(cr).filter(([, v]) => v == null || v < 4.5);
        check(`${mode}: all panel texts >= 4.5:1 (${Object.entries(cr).map(([k, v]) => `${k.replace('.xpl ', '')}=${v}`).join(' ')})`, low.length === 0, JSON.stringify(low));
        const ffs = await sh(page, (r) => [...r.querySelectorAll('.xpl-dock :is(.xd-w, .xt b, kbd, p, .xm)')].map((e) => getComputedStyle(e).fontFamily));
        check(`${mode}: every panel text uses Thmanyah`, ffs.length >= 4 && ffs.every((f) => /Thmanyah/.test(f)), ffs.join(' | '));
        check(`${mode}: the card is ${ui === 'ar' ? 'rtl' : 'ltr'}`, await sh(page, (r, u) => r.querySelector('.xpl').dir === (u === 'ar' ? 'rtl' : 'ltr'), ui));
        // swap on the neighbour: AR slides the other way
        const ok2 = await showCard(page, '.ribbon .rb-panel [data-a="redo"]', 'redo');
        const sw = await anim(page, '.xpl.swap p');
        check(`${mode}: swapping to Redo animates the text ${ui === 'ar' ? '(mirrored: xe-slide-r)' : '(xe-slide)'}`, ok2 && !!sw && sw.a === (ui === 'ar' ? 'xe-slide-r' : 'xe-slide'), JSON.stringify(sw));
        await page.waitForTimeout(1100);
        await page.screenshot({ path: path.join(SHOTS, `explain-${mode}.png`) });
      }
      check(`${mode}: no console or page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
    // ---- Calm on: no motion
    {
      const { ctx, page, errors } = await open({ ui, dark, calm: true });
      const ready = await sh(page, (r) => !!r.querySelector('.xpl-dock[data-open="1"]') && r.querySelector('.shell')?.dataset.calm === '1');
      check(`${mode}/calm: ready state seen (panel open, Calm on)`, ready);
      const shown = await showCard(page, '.ribbon .rb-panel [data-a="undo"]', 'undo');
      check(`${mode}/calm: hovering Undo shows its card`, shown);
      const bad = await sh(page, (r) => [...r.querySelectorAll('.xpl-dock, .xpl-dock *')].filter((e) => { const c = getComputedStyle(e); return c.animationName !== 'none' || parseFloat(c.transitionDuration) > 0; }).map((e) => e.className?.baseVal ?? e.className).slice(0, 5));
      check(`${mode}/calm: nothing in the panel animates or transitions`, shown && bad.length === 0, JSON.stringify(bad));
      check(`${mode}/calm: no console or page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(failed ? `\nexplain-0178: ${failed} FAILED` : `\nexplain-0178: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
