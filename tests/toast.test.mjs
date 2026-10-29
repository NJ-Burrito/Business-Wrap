// Toasts (0.13.0, A1): an info/ok toast lives ~2.5 s, a click anywhere on it dismisses it, hover holds it
// (WCAG 2.2.1), the same message twice is one toast, and it sits at the bottom centre in RTL and LTR.
// Headless Chrome, closed at the end.
//
//   node tests/toast.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'toast-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: null });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  toast: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForTimeout(600);
  // a toast's life: show one, watch until it leaves the DOM
  const life = (kind, msg) => page.evaluate(([kind, msg]) => new Promise((res) => {
    const R = document.getElementById('bw-ui-host').shadowRoot;
    R.querySelectorAll('.toast').forEach((x) => x.remove());
    const t0 = performance.now();
    window.BW.toast(msg, kind);
    const el = [...R.querySelectorAll('.toast')].at(-1);
    const tick = () => (el.isConnected && !el.classList.contains('out') ? (performance.now() - t0 > 8000 ? res(-1) : requestAnimationFrame(tick)) : res(performance.now() - t0));
    tick();
  }), [kind, msg]);
  const ok = await life('ok', 'saved');
  check('an ok toast leaves after 2.3–2.8 s', ok >= 2300 && ok <= 2800, `${Math.round(ok)} ms`);
  const warn = await life('warn', 'careful');
  check('a warning stays longer (~4 s)', warn >= 3700 && warn <= 4400, `${Math.round(warn)} ms`);

  // a click on the message (not a button) dismisses it within 300 ms
  await page.evaluate(() => window.BW.toast('click me', 'info'));
  const m = page.locator('.toasts .toast .m').last();
  await m.click();
  await page.waitForTimeout(300);
  const gone = await page.evaluate(() => { const t = [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast')].find((x) => x.textContent.includes('click me')); return !t || t.classList.contains('out'); });
  check('a click on the message dismisses it within 300 ms', gone);

  // hover holds it; leaving lets it go
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.BW.toast('hold me', 'info'));
  await page.locator('.toasts .toast .m').last().hover();
  await page.waitForTimeout(4000);
  const held = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast')].some((x) => x.textContent.includes('hold me') && !x.classList.contains('out')));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(3000);
  const released = await page.evaluate(() => ![...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast')].some((x) => x.textContent.includes('hold me') && !x.classList.contains('out')));
  check('hover for 4 s keeps it; leaving lets it go', held && released, JSON.stringify({ held, released }));

  // the same message twice is one toast; at most three stacked
  const n = await page.evaluate(() => { const R = document.getElementById('bw-ui-host').shadowRoot; R.querySelectorAll('.toast').forEach((x) => x.remove()); window.BW.toast('autosaved', 'ok'); window.BW.toast('autosaved', 'ok'); const one = R.querySelectorAll('.toast').length; ['a', 'b', 'c', 'd'].forEach((x) => window.BW.toast(x, 'info')); return [one, R.querySelectorAll('.toast').length]; });
  check('the same message twice = one toast; at most three stacked', n[0] === 1 && n[1] === 3, JSON.stringify(n));

  // bottom centre, both directions
  const offs = [];
  for (const d of ['rtl', 'ltr']) {
    await page.evaluate((d) => { window.BW.S.dir = d; window.BW.runAction('dir'); window.BW.runAction('dir'); }, d);
    const o = await page.evaluate(() => { const R = document.getElementById('bw-ui-host').shadowRoot; R.querySelectorAll('.toast').forEach((x) => x.remove()); window.BW.toast('where', 'info'); const b = R.querySelector('.toast').getBoundingClientRect(); return { bottom: Math.round(innerHeight - b.bottom), centre: Math.round(Math.abs(b.left + b.width / 2 - document.documentElement.clientWidth / 2)), dir: R.querySelector('.shell').dataset.tdir }; });
    offs.push(o);
  }
  check('RTL and LTR: bottom offset ≤ 40 px, centred', offs.every((o) => o.bottom >= 0 && o.bottom <= 40 && o.centre <= 4), JSON.stringify(offs));
  check('no page errors', !errors.length, errors.join(' | '));
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
