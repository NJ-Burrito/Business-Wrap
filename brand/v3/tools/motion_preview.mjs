// Business-Wrap 0.17.0 motion preview: one self-contained page with every editor icon, its motion, the ribbon's category icons, the
// brand mark and the watermark's reactions and eggs, taken from a real editor build (so the page shows what ships, not a copy).
//   node brand/v3/tools/motion_preview.mjs <built editor.html> <out.html>
// Hover an icon (it rests 120 ms first, as in the editor), Tab to it (the nod) or press it (the squash). Light / dark / calm switches.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from '../../../engine/export.mjs';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: motion_preview.mjs <editor.html> <out.html>'); process.exit(2); }
const browser = await chromium.launch(launchOptions());
let data;
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:wm-intro', '1'); localStorage.setItem('bw:ui', 'ar'); } catch {} });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(src).href);
  await page.waitForFunction(() => window.BW?.ready && window.BW_WM, null, { timeout: 90000 });
  data = await page.evaluate(() => {
    const root = document.getElementById('bw-ui-host').shadowRoot;
    const css = [...root.querySelectorAll('style')].map((s) => s.textContent).join('\n')
      + [...(root.adoptedStyleSheets || [])].map((sh) => [...sh.cssRules].map((r) => r.cssText).join('\n')).join('\n');
    const M = window.BW.EXT.watermark;
    const ids = [...M.ids(), ...M.eggs().map((e) => e.id)];
    const frames = Object.fromEntries(ids.map((id) => [id, { spec: M.spec(id) || M.eggs().find((e) => e.id === id), anims: M.frames(id) }]));
    const tabs = [...root.querySelectorAll('.rb-tab')].map((t) => ({ tab: t.dataset.tab, label: t.getAttribute('aria-label'), color: t.style.getPropertyValue('--tc') }));
    const img = document.querySelector('#bw-watermark img:not([data-intro])')?.src || '';
    const brand = root.querySelector('.brand')?.outerHTML || '';
    return { css, icons: window.BW.IC, frames, tabs, img, brand };
  });
  await ctx.close();
} finally {
  await browser.close();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const svgOf = (k) => (data.icons[k] || '').replace('<svg', `<svg data-ic="${esc(k)}"`);
const keys = Object.keys(data.icons);
const ribbon = keys.filter((k) => k.startsWith('rbt.'));
const tabsHtml = data.tabs.map((t) => `<button type="button" class="rb-tab" role="tab" data-tab="${esc(t.tab)}" style="--tc: ${esc(t.color)}" aria-selected="false" aria-label="${esc(t.label)}"><span class="rb-ti" aria-hidden="true">${svgOf(`rbt.${t.tab}`)}</span><span class="rb-tl">${esc(t.label)}</span></button>`).join('');
const grid = keys.map((k) => `<button type="button" class="b mp-ic" title="${esc(k)}"><span class="i">${svgOf(k)}</span><span class="mp-k">${esc(k)}</span></button>`).join('');
const wmButtons = Object.entries(data.frames).map(([id, f]) => `<button type="button" class="b mp-w" data-w="${esc(id)}">${esc(id)} <small>${esc(f.spec?.name || '')} · ${esc(f.spec?.ms || '')} ms</small></button>`).join('');

const page = `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><title>Business-Wrap 0.17.0 · icons and motion preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { margin: 0; background: #e8e4de; font-family: "Thmanyah Sans", "Thmanyah sans", system-ui, sans-serif; }
</style></head><body>
<div id="host"></div>
<script type="application/json" id="mp-data">${JSON.stringify({ frames: data.frames, img: data.img }).replace(/</g, '\\u003c')}</script>
<script>
const D = JSON.parse(document.getElementById('mp-data').textContent);
const root = document.getElementById('host').attachShadow({ mode: 'open' });
root.innerHTML = ${JSON.stringify(`<style>${data.css}
.mp { padding: 20px 28px 80px; font-family: var(--bw-font-ui, "Thmanyah Sans", system-ui); background: var(--bw-bg); color: var(--bw-ink); min-height: 100vh; }
.mp h1 { font-family: var(--bw-font-display, "Thmanyah Serif Display", serif); margin: 0 0 4px; font-size: 28px; }
.mp h2 { margin: 28px 0 10px; font-size: 19px; }
.mp p { margin: 4px 0; color: var(--bw-ink-muted); max-width: 70ch; }
.mp-bar { position: sticky; top: 0; z-index: 5; display: flex; gap: 8px; padding: 10px 0; background: var(--bw-bg); }
.mp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.mp-ic { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; border: 1px solid var(--bw-line); border-radius: 10px; background: var(--bw-surface); color: var(--bw-ink); cursor: pointer; font: inherit; }
.mp-ic .i { inline-size: 26px; block-size: 26px; display: grid; place-items: center; }
.mp-ic .i .ic { inline-size: 26px; block-size: 26px; }
.mp-k { font-size: 10.5px; color: var(--bw-ink-faint); word-break: break-all; }
.mp-band { padding: 10px 16px 0; border-radius: 14px; background: var(--bw-glass, #001e3d); }
.mp-band .rb-tabs { display: flex; flex-wrap: wrap; gap: 2px; }
.mp-wm { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.mp-stage { inline-size: 120px; block-size: 120px; display: grid; place-items: center; perspective: 600px; }
.mp-stage img { inline-size: 84px; block-size: 84px; border-radius: 14px; }
.mp-ws { display: flex; flex-wrap: wrap; gap: 6px; max-width: 900px; }
.mp-w { border: 1px solid var(--bw-line-strong); border-radius: 999px; padding: 6px 12px; background: var(--bw-surface); color: var(--bw-ink); cursor: pointer; font: inherit; }
.mp-w small { color: var(--bw-ink-faint); }
.mp-brand { display: inline-flex; padding: 12px 18px; border-radius: 14px; background: var(--bw-glass, #001e3d); color: var(--bw-on-glass, #fafaf9); }
</style>
<section class="shell mp" dir="ltr" data-tdir="ltr" lang="en" data-theme="light" data-calm="0">
<h1>Business-Wrap 0.17.0 · icons and motion</h1>
<p>Hover an icon and let it rest a moment: its part move plays (wind-up, overshoot, settle). Press it: the icon squashes and springs back. Tab to it: it nods. Calm stills everything, as the editor's Calm button does.</p>
<div class="mp-bar"><button type="button" class="b mp-w" data-mp="theme">Light / dim-navy dark</button><button type="button" class="b mp-w" data-mp="calm">Calm: off</button><button type="button" class="b mp-w" data-mp="all">Play every icon</button></div>
<h2>The ribbon's category icons (${ribbon.length}, brand v3 drawings)</h2>
<div class="island mp-band"><div class="ribbon"><div class="rb-bar"><div class="rb-tabs" role="tablist">${tabsHtml}</div></div></div></div>
<h2>The brand mark (hover, press)</h2>
<div class="mp-brand">${data.brand}</div>
<h2>The watermark: 20 reactions and the eggs</h2>
<p>W20 is seven clicks in 3 s; «charge» is a long press (0.7 s) on the mark; «dizzy» is two circles of the pointer around it.</p>
<div class="mp-wm"><div class="mp-stage"><div class="mp-mark" style="position:relative"><img alt="" src="" data-mp="img"><i data-part="star" style="position:absolute;top:-8px;right:-8px;width:20px;height:20px;opacity:0;background:var(--bw-accent);clip-path:polygon(50% 0,61% 39%,100% 50%,61% 61%,50% 100%,39% 61%,0 50%,39% 39%)"></i><i data-part="shadow" style="position:absolute;left:12%;right:12%;bottom:-10px;height:10px;border-radius:50%;opacity:0;background:radial-gradient(closest-side,rgba(0,30,61,.35),transparent)"></i>${[0, 1, 2].map((i) => `<i data-part="ring${i}" style="position:absolute;inset:0;border:2px solid var(--bw-accent);border-radius:50%;opacity:0"></i>`).join('')}<i data-part="strip" style="position:absolute;top:-10%;bottom:-10%;left:0;width:30%;opacity:0;background:color-mix(in srgb,var(--bw-accent) 35%,transparent)"></i><i data-part="halfN" style="position:absolute;top:0;bottom:0;left:0;width:50%;opacity:0;background:rgba(0,20,40,.6)"></i><i data-part="halfJ" style="position:absolute;top:0;bottom:0;right:0;width:50%;opacity:0;background:rgba(0,20,40,.6)"></i></div></div><div class="mp-ws">${wmButtons}</div></div>
<h2>Every editor icon (${keys.length})</h2>
<div class="mp-grid">${grid}</div>
</section>`).replace(/<\//g, '<\\/')};
const shell = root.querySelector('.shell');
root.querySelector('[data-mp="img"]').src = D.img;
// the editor's hover intent: a tool takes .ic-rest 120 ms after the pointer rests on it
let cur = null, timer = 0;
root.addEventListener('pointerover', (e) => { const el = e.target.closest('button'); if (el === cur) return; clearTimeout(timer); cur?.classList.remove('ic-rest'); cur = el; if (el) timer = setTimeout(() => el.classList.add('ic-rest'), 120); });
root.addEventListener('pointerdown', () => { cur?.classList.add('ic-rest'); }, true);
root.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mp === 'theme') { const d = shell.dataset.theme === 'dark'; shell.dataset.theme = d ? 'light' : 'dark'; return; }
  if (b.dataset.mp === 'calm') { const c = shell.dataset.calm === '1'; shell.dataset.calm = c ? '0' : '1'; b.textContent = 'Calm: ' + (c ? 'off' : 'on'); return; }
  if (b.dataset.mp === 'all') { const all = [...root.querySelectorAll('.mp-ic, .rb-tab')]; all.forEach((x) => x.classList.remove('ic-go')); void shell.offsetWidth; all.forEach((x) => x.classList.add('ic-go')); setTimeout(() => all.forEach((x) => x.classList.remove('ic-go')), 900); return; }
  if (b.dataset.w) {
    const f = D.frames[b.dataset.w]; if (!f) return;
    const calm = shell.dataset.calm === '1';
    const mark = root.querySelector('.mp-mark');
    for (const a of f.anims) {
      const el = a.target === 'mark' ? mark : a.target === 'wm' ? mark.querySelector('img') : mark.querySelector('[data-part="' + a.target + '"]');
      if (!el) continue;
      if (calm) { if (a.target === 'wm') el.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 240 }); continue; }
      const o = { duration: a.ms, delay: a.delay || 0, easing: a.easing || 'ease', fill: 'none' }; if (a.composite) o.composite = a.composite;
      el.animate(a.keys, o);
    }
  }
});
</script></body></html>`;
fs.writeFileSync(out, page);
console.log(`wrote ${out}: ${keys.length} icons (${ribbon.length} ribbon), ${Object.keys(data.frames).length} watermark moves, ${(page.length / 1024).toFixed(0)} KiB`);
