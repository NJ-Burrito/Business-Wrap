// 0.15.2 lane "design": note 1 backdrop (static, both themes), note 3 reading-mode icon, notes 5/6 corners (watermark bottom-left, toasts bottom-right,
// physical in ar and en, light and dark), note 16 the ribbon panel glides (height + pages transform over time, back to the same page position, instant in
// calm mode, not instant under the OS reduced-motion setting), hover intent (a hover plays no icon part animation until the pointer has rested).
// Every probe first asserts that it looked (R15). Headless Chrome, closed at the end.
//
//   node tests/design-0152.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'design');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
const URL = pathToFileURL(file).href;

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
async function open({ ui = 'ar', dark = false, calm = false, reduced = false, width = 1366, height = 768 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([u, d, c]) => {
    try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', c ? '1' : '0'); localStorage.setItem('bw:rb:c', '0'); } } catch {}
  }, [ui, dark, calm]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const SH = "document.getElementById('bw-ui-host').shadowRoot";
const sh = (page, fn, arg) => page.evaluate(`(${fn})(${SH}, ${JSON.stringify(arg ?? null)})`);

try {
  // ── notes 5 + 6 + 1: corners and backdrop, ar + en, light + dark ─────────────────────────────────────────
  for (const ui of ['ar', 'en']) for (const dark of [false, true]) {
    const { ctx, page, errors } = await open({ ui, dark });
    const tag = `${ui} ${dark ? 'dark' : 'light'}`;
    const w = await page.evaluate(() => { const e = document.getElementById('bw-watermark'); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: r.left, r: innerWidth - r.right, b: innerHeight - r.bottom, vis: cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0, w: r.width, top: document.elementFromPoint(r.left + r.width / 2, r.top + 30)?.closest('#bw-watermark') ? 1 : 0 }; });
    check(`${tag}: the watermark exists and is visible (looked)`, !!w && w.vis && w.w > 40, JSON.stringify(w));
    check(`${tag}: watermark is at the bottom LEFT (16 px from the left and bottom edges)`, !!w && Math.abs(w.l - 16) <= 1 && Math.abs(w.b - 16) <= 1 && w.r > 600, JSON.stringify(w));
    check(`${tag}: nothing covers the watermark`, !!w && w.top === 1, JSON.stringify(w));
    await page.evaluate(() => window.BW.toast('corner toast', 'info'));
    await page.waitForTimeout(500);
    const t = await sh(page, (r) => { const x = r.querySelector('.toasts .toast'); if (!x) return null; const b = x.getBoundingClientRect(); return { l: b.left, r: innerWidth - b.right, b: innerHeight - b.bottom, w: b.width }; });
    check(`${tag}: a toast is at the bottom RIGHT (not centred, not left)`, !!t && t.r >= 0 && t.r <= 40 && t.b >= 0 && t.b <= 60 && t.l > 683, JSON.stringify(t));
    const bd = await page.evaluate(() => { const e = document.getElementById('bw-backdrop'); if (!e) return null; const cs = getComputedStyle(e); const af = getComputedStyle(e, '::after'); return { z: cs.zIndex, anim: cs.animationName, afAnim: af.animationName, pe: cs.pointerEvents, bg: cs.backgroundImage.length > 20, grid: af.backgroundImage.includes('linear-gradient'), anims: document.getAnimations().filter((a) => a.effect?.target?.id === 'bw-backdrop').length }; });
    check(`${tag}: backdrop is a static layer (no animation, grid + glow, no pointer events, behind the desk content)`, !!bd && bd.anim === 'none' && bd.afAnim === 'none' && bd.anims === 0 && bd.pe === 'none' && bd.z === '-1' && bd.bg && bd.grid, JSON.stringify(bd));
    check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── note 3: reading mode has an icon (same family: a stroked svg with data-ic) ───────────────────────────────
  {
    const { ctx, page } = await open({ ui: 'en' });
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('view'));
    await page.waitForTimeout(300);
    const r = await sh(page, (R) => {
      const b = R.querySelector('.ribbon [data-a="reading"]');
      const svg = b?.querySelector('svg.ic[data-ic="reading"]');
      const other = [...R.querySelectorAll('.ribbon .rb-tools .b svg.ic')].find((x) => x.dataset.ic !== 'reading');
      return { found: !!b, svg: !!svg, sw: svg?.getAttribute('stroke-width'), osw: other?.getAttribute('stroke-width'), parts: svg ? svg.children.length : 0, label: b?.textContent.trim() };
    });
    check('reading mode: the tool is in the ribbon (looked)', r.found, JSON.stringify(r));
    check('reading mode: it has its own icon, the same stroke as the others', r.svg && r.sw === r.osw && r.parts >= 2, JSON.stringify(r));
    await ctx.close();
  }

  // ── note 16: the ribbon glides ───────────────────────────────────────────────────────────────────────────
  const sample = (page) => page.evaluate(() => new Promise((res) => {
    const R = document.getElementById('bw-ui-host').shadowRoot;
    const pair = document.getElementById('bw-pair'); const pn = R.querySelector('.rb-panel');
    const out = []; const t0 = performance.now();
    const f = () => { const m = new DOMMatrix(getComputedStyle(pair).transform); out.push({ t: Math.round(performance.now() - t0), ty: m.m42, top: pair.getBoundingClientRect().top, h: pn.getBoundingClientRect().height }); if (performance.now() - t0 < 420) requestAnimationFrame(f); else res(out); };
    window.BW.EXT.ribbon.collapse(); requestAnimationFrame(f);
  }));
  const pairTop = (page) => page.evaluate(() => document.getElementById('bw-pair').getBoundingClientRect().top);
  for (const reduced of [false, true]) {
    const { ctx, page, errors } = await open({ ui: 'en', reduced });
    const tag = reduced ? 'OS reduced-motion on' : 'normal';
    const top0 = await pairTop(page);
    const hasPanel = await sh(page, (r) => !!r.querySelector('.rb-panel:not([hidden])'));
    check(`ribbon glide (${tag}): the panel is open at the start (looked)`, hasPanel && top0 > 100, String(top0));
    const fold = await sample(page);
    const topShut = await pairTop(page);
    const ys = fold.map((x) => x.ty);
    const mid = fold.filter((x) => x.t > 10 && x.t < 330); // slow CI runners sample few frames (n=9): wide window, still must see an in-between value
    check(`ribbon glide (${tag}): folding moves the pages UP smoothly (transform eases from + to 0, ~240 ms)`, topShut < top0 - 100 && Math.max(...ys) > 100 && mid.some((x) => x.ty > 5 && x.ty < Math.max(...ys) - 5) && Math.abs(ys[ys.length - 1]) < 0.5, JSON.stringify({ top0, topShut, max: Math.max(...ys), n: fold.length }));
    const hs = fold.map((x) => x.h);
    check(`ribbon glide (${tag}): the panel height shrinks over time, never grows back`, hs[0] > 100 && hs.some((h) => h > 5 && h < hs[0] - 5) && hs[hs.length - 1] === 0 && hs.every((h, i) => i === 0 || h <= hs[i - 1] + 1), JSON.stringify(hs.filter((_, i) => i % 3 === 0)));
    const settle = fold.find((x) => Math.abs(x.ty) < 0.5);
    check(`ribbon glide (${tag}): it lands inside ~330 ms and never overshoots`, !!settle && settle.t <= 600 && ys.every((y) => y >= -0.5), JSON.stringify({ settle: settle?.t, min: Math.min(...ys) }));
    const unfold = await sample(page);
    const topBack = await pairTop(page);
    const uy = unfold.map((x) => x.ty);
    check(`ribbon glide (${tag}): opening pushes the pages DOWN smoothly and back to the same place (±1 px)`, Math.abs(topBack - top0) <= 1 && Math.min(...uy) < -100 && unfold.some((x) => x.ty < -5 && x.ty > Math.min(...uy) + 5) && Math.abs(uy[uy.length - 1]) < 0.5, JSON.stringify({ top0, topBack, min: Math.min(...uy) }));
    check(`ribbon glide (${tag}): no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ ui: 'en', calm: true });
    const top0 = await pairTop(page);
    const fold = await sample(page);
    const moved = fold.some((x) => Math.abs(x.ty) > 0.5);
    check('ribbon glide (calm mode): instant, no transform, the page is at its new place at once', !moved && fold[0].h === 0 && (await pairTop(page)) < top0 - 100, JSON.stringify(fold.slice(0, 3)));
    await ctx.close();
  }
  {
    // a scrolled page keeps its place: the text under the pointer does not move
    const { ctx, page } = await open({ ui: 'en' });
    await page.evaluate(() => window.scrollTo(0, 600)); await page.waitForTimeout(200);
    const probe = () => page.evaluate(() => { const e = document.querySelector('main.bw-doc p, main.bw-doc h1, main.bw-doc h2'); const r = e.getBoundingClientRect(); return { y: r.top, sy: scrollY }; });
    const a = await probe();
    await page.evaluate(() => window.BW.EXT.ribbon.collapse()); await page.waitForTimeout(500);
    const b = await probe();
    check('ribbon glide: a scrolled page keeps the text where it was (±2 px) when the ribbon folds', a.sy > 100 && Math.abs(a.y - b.y) <= 2, JSON.stringify({ a, b }));
    await ctx.close();
  }

  // ── hover cost: intent ────────────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open({ ui: 'en' });
    const pts = await sh(page, (r) => [...r.querySelectorAll('.ribbon .rb-tools .b')].map((x) => x.getBoundingClientRect()).filter((x) => x.width > 8 && x.top > 0 && x.bottom < 400).slice(0, 6).map((x) => [x.x + x.width / 2, x.y + 20]));
    check('hover intent: tools found (looked)', pts.length >= 4, String(pts.length));
    const running = () => sh(page, (r) => [...r.querySelectorAll('.ribbon .ic *')].reduce((n, e) => n + e.getAnimations().length, 0));
    await page.mouse.move(700, 600);
    let peak = 0;
    for (const [x, y] of pts) { await page.mouse.move(x, y, { steps: 1 }); await page.waitForTimeout(40); peak = Math.max(peak, await running()); }
    check('hover intent: sweeping across six tools (40 ms each) starts no icon part animation', peak === 0, String(peak));
    await page.mouse.move(pts[0][0], pts[0][1]); await page.waitForTimeout(100);
    const early = await running();
    await page.waitForTimeout(60);
    const late = await running();
    const rest = await sh(page, (r) => !!r.querySelector('.ic-rest'));
    check('hover intent: after the pointer rested (>120 ms) the tool is marked .ic-rest', rest, JSON.stringify({ early, late, rest }));
    await page.mouse.move(700, 600); await page.waitForTimeout(100);
    check('hover intent: leaving clears the rest state', !(await sh(page, (r) => !!r.querySelector('.ic-rest'))));
    // the watermark float is one compositor animation, paused while the pointer is on the toolbar
    const wm = await page.evaluate(() => { const m = document.querySelector('#bw-watermark .bw-wm-mark'); const a = m ? m.getAnimations() : []; return { n: a.length, state: a[0]?.playState }; });
    check('watermark idle float: one Web Animation on the mark (looked)', wm.n === 1 && wm.state === 'running', JSON.stringify(wm));
    await page.mouse.move(pts[0][0], pts[0][1]); await page.waitForTimeout(150);
    const paused = await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-mark').getAnimations()[0]?.playState);
    await page.mouse.move(700, 600); await page.waitForTimeout(150);
    const resumed = await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-mark').getAnimations()[0]?.playState);
    check('watermark idle float: paused while the pointer is on the toolbar, running again after', paused === 'paused' && resumed === 'running', JSON.stringify({ paused, resumed }));
    await ctx.close();
  }
} finally { await browser.close(); }
console.log(`${failed ? 'FAIL' : 'PASS'}  design-0152: ${failed} failed`);
process.exit(failed ? 1 : 0);
