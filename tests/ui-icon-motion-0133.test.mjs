// 0.13.3 icon system: every rendered .ic has its own hover/press/focus motion (a named --icm move or a brand .mv move),
// a theme colour on hover, and nothing moves in calm mode or under prefers-reduced-motion. Walks the real editor:
// toolbar, every folded menu, the view popover, the context bars, the palette and the side panels.
//
//   node tests/ui-icon-motion-0133.test.mjs            (UI_DUMP=1 prints the failing icons)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { pathToFileURL } from 'node:url';

const OUT = path.join(REPO, 'out', 'ui-0133');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// the page-side helpers (run in the page; the shadow root is the editor's)
const HELPERS = `
window.__root = () => document.getElementById('bw-ui-host').shadowRoot;
// every distinct icon on screen: key, brand flag, markup
window.__icons = () => {
  const out = [];
  for (const s of __root().querySelectorAll('svg.ic[data-ic]')) {
    const b = s.getBoundingClientRect();
    if (!b.width) continue;
    out.push({ key: s.dataset.ic, bw: s.classList.contains('bw-i'), html: s.outerHTML });
  }
  return out;
};
// which part of the svg animates right now (named animation on a child, brand .mv or the svg itself)
window.__moving = (svg) => {
  const parts = [...svg.children];
  const named = parts.filter((p) => { const a = getComputedStyle(p).animationName; return a && a !== 'none'; }).length;
  const self = getComputedStyle(svg).animationName;
  return { named, self: self && self !== 'none' ? self : '', transform: getComputedStyle(svg).transform, colour: getComputedStyle(svg).color };
};
`;

async function freshPage(browser, { ui = 'en', reduced = false, calm = false, w = 1500, h = 900 } = {}) {
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: w, height: h }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(({ ui, calm }) => { try { localStorage.setItem('bw:ui', ui); if (calm) localStorage.setItem('bw:calm', '1'); } catch {} }, { ui, calm });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(HELPERS);
  return { ctx, page };
}

const seen = new Map(); // key -> {bw, html}
async function harvest(page) {
  const list = await page.evaluate(() => __icons());
  for (const i of list) if (!seen.has(i.key)) seen.set(i.key, i);
}
async function cmd(page, id) {
  await page.keyboard.press('Control+K');
  await page.waitForTimeout(250);
  await harvest(page); // the palette itself lists most of the icons
  const row = page.locator(`#cmdlist [data-cmd="${id}"]`);
  if (await row.count()) await row.first().click(); else await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
}

// every visible icon button of a surface, in its real container: hover = icon move + (wash or colour), focus = house ring
async function surfaceCheck(page, scope, name, allowEmpty = false) {
  const idx = await page.evaluate((scope) => {
    const out = [];
    let k = 0;
    __root().querySelectorAll('[data-qa-s]').forEach((e) => e.removeAttribute('data-qa-s'));
    for (const el of __root().querySelectorAll(scope + ' button, ' + scope + ' [role="option"], ' + scope + ' summary')) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.disabled || !el.querySelector('svg.ic[data-ic]')) continue;
      el.dataset.qaS = String(k++); out.push(k - 1);
    }
    return out;
  }, scope);
  const bad = [];
  for (const i of idx) {
    const loc = page.locator('[data-qa-s="' + i + '"]');
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const bb = await loc.boundingBox(); if (!bb) continue;
    await page.mouse.move(5, 5); await page.waitForTimeout(40);
    const rest = await loc.evaluate((e) => { const s = e.querySelector('svg.ic'); return { bg: getComputedStyle(e).backgroundColor, col: getComputedStyle(s).color, sh: getComputedStyle(e).boxShadow }; });
    await page.mouse.move(bb.x + 4, bb.y + bb.height / 2, { steps: 2 }); await page.waitForTimeout(120);
    const h = await loc.evaluate((e) => { const s = e.querySelector('svg.ic'); const on = e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true'; const parts = [...s.querySelectorAll('*')].filter((p) => getComputedStyle(p).animationName !== 'none').length; return { bg: getComputedStyle(e).backgroundColor, col: getComputedStyle(s).color, sh: getComputedStyle(e).boxShadow, parts, on, key: s.dataset.ic, bw: s.classList.contains('bw-i') }; });
    const visible = h.on || h.bg !== rest.bg || h.col !== rest.col || h.sh !== rest.sh;
    if (!h.parts || !visible) bad.push(h.key + (h.parts ? '' : ' no-move') + (visible ? '' : ' no-state'));
  }
  await page.mouse.move(5, 5);
  check(`${name}: ${idx.length} icon controls each hover with a move and a visible state`, (allowEmpty || idx.length > 0) && bad.length === 0, bad.join(', '));
}

const browser = await chromium.launch(launchOptions());
const failedIcons = { hover: [], press: [], focus: [], colour: [], rows: [] };
try {
  const { ctx, page } = await freshPage(browser);
  await page.waitForTimeout(500);
  await harvest(page);
  // folded menus
  const nMore = await page.evaluate(() => __root().querySelectorAll('.island [data-a="more"]').length);
  for (let k = 0; k < nMore; k += 1) {
    await page.evaluate((k) => __root().querySelectorAll('.island [data-a="more"]')[k].click(), k);
    await page.waitForTimeout(300); await harvest(page);
    await page.keyboard.press('Escape'); await page.waitForTimeout(120);
  }
  await page.evaluate(() => __root().querySelector('.island [data-a="view"]')?.click()); await page.waitForTimeout(350); await harvest(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  // context bars: paragraph, table cell, then every object kind present in the sample
  for (const sel of ['main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]', 'main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]']) {
    const L = page.locator(sel).first();
    if (await L.count()) { await L.click(); await page.waitForTimeout(600); await harvest(page); }
  }
  for (const id of ['settings', 'history', 'check', 'theme', 'webhooks', 'find', 'outline', 'newdoc', 'process', 'library', 'timeline', 'provenance']) { await cmd(page, id); await harvest(page); await page.keyboard.press('Escape'); await page.waitForTimeout(200); }
  check('walked the editor: icons found on screen', seen.size > 120, `${seen.size} distinct icons`);
  // plus every icon of icons.json, not only those on screen now (the extensions' own icons are drawn on screen in the walk)
  const ALL = new Map();
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'icons.json'), 'utf8')).icons)) ALL.set(k, v);
  for (const [k, v] of ALL) if (!seen.has(k)) seen.set(k, { key: k, bw: /class="ic bw-i|bw-i/.test(v), html: v.replace('<svg', `<svg data-ic="${k}"`) });
  check('static icon list covers more than the screen walk', ALL.size > 150, `${ALL.size} from source, ${seen.size} in all`);

  // the surfaces, one by one, in their real containers
  await page.keyboard.press('Escape'); await page.mouse.click(700, 500);
  await surfaceCheck(page, '.island', 'toolbar');
  for (const [nm, sel] of [['paragraph', 'main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]'], ['table cell', 'main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]']]) {
    const L = page.locator(sel).first();
    if (await L.count()) { await L.click(); await page.waitForTimeout(600); await surfaceCheck(page, '.ctx', 'context bar, ' + nm); }
  }
  // the context bars of an object: a text box, a diagram (inserted through the palette, as a person would)
  for (const [id, nm] of [['insTextBox', 'text box'], ['addDiagram', 'diagram']]) {
    await cmd(page, id); await page.waitForTimeout(700);
    const shown = await page.evaluate(() => { const c = __root().querySelector('.ctx'); return !!c && !c.hidden; });
    check('context bar opens for ' + nm, shown);
    if (shown) await surfaceCheck(page, '.ctx', 'context bar, ' + nm);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  // every folded menu and the view popover
  const nm0 = await page.evaluate(() => __root().querySelectorAll('.island [data-a="more"]').length);
  for (let k = 0; k < nm0; k += 1) {
    await page.evaluate((k) => __root().querySelectorAll('.island [data-a="more"]')[k].click(), k); await page.waitForTimeout(300);
    await surfaceCheck(page, '.menu[data-open="1"]', 'menu ' + k, true);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  }
  await page.evaluate(() => __root().querySelector('.island [data-a="view"]')?.click()); await page.waitForTimeout(350);
  await surfaceCheck(page, '#viewpop', 'view popover');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  // every distinct icon, in a neutral button: rest colour, then hover, keyboard focus and the press replay
  const items = [...seen.values()];
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'qa-host';
    host.style.cssText = 'position:fixed;inset-block-end:90px;inset-inline-start:300px;z-index:99';
    __root().querySelector('.shell').appendChild(host);
  });
  const probe = async (it) => {
    await page.evaluate((html) => { const h = __root().getElementById('qa-host'); h.innerHTML = '<button class="b" id="qa-b"><span class="i">' + html + '</span></button>'; }, it.html);
    const loc = page.locator('#qa-b');
    const bb = await loc.boundingBox();
    await page.mouse.move(5, 5); await page.waitForTimeout(60);
    const rest = await page.evaluate(() => __moving(__root().querySelector('#qa-b svg')));
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 2 });
    await page.waitForTimeout(110);
    const hover = await page.evaluate(() => __moving(__root().querySelector('#qa-b svg')));
    await page.mouse.move(5, 5); await page.waitForTimeout(60);
    await page.evaluate(() => __root().querySelector('#qa-b').focus());
    await page.keyboard.press('Shift'); await page.waitForTimeout(110);
    const focus = await page.evaluate(() => __moving(__root().querySelector('#qa-b svg')));
    await page.evaluate(() => __root().querySelector('#qa-b').blur());
    const press = await page.evaluate(() => { const b = __root().querySelector('#qa-b'); b.classList.add('ic-go'); return new Promise((r) => setTimeout(() => r(__moving(b.querySelector('svg'))), 90)); });
    return { key: it.key, bw: it.bw, rest, hover, focus, press };
  };
  const rows = [];
  for (const it of items) rows.push(await probe(it));
  const own = (m) => m.named > 0 || !!m.self;
  const bad = (f) => rows.filter(f).map((r) => r.key);
  failedIcons.hover = bad((r) => !own(r.hover));
  failedIcons.focus = bad((r) => !own(r.focus));
  failedIcons.press = bad((r) => !own(r.press));
  failedIcons.colour = bad((r) => !r.bw && r.hover.colour === r.rest.colour);
  const hoverOnlyGeneric = bad((r) => !r.bw && r.hover.named === 0);
  check('every rendered icon plays a named move on hover', failedIcons.hover.length === 0, `${failedIcons.hover.length}/${rows.length} without: ${failedIcons.hover.join(' ')}`);
  check('... on keyboard focus', failedIcons.focus.length === 0, failedIcons.focus.join(' '));
  check('... and on its press replay (.ic-go)', failedIcons.press.length === 0, failedIcons.press.join(' '));
  check('no mono icon is left with the generic scale only (0 generic-only)', hoverOnlyGeneric.length === 0, hoverOnlyGeneric.join(' '));
  check('mono icons take the theme colour on hover', failedIcons.colour.length === 0, failedIcons.colour.join(' '));
  if (process.env.UI_DUMP) fs.writeFileSync(path.join(OUT, 'icon-rows.json'), JSON.stringify(rows));
  await ctx.close();

  // calm mode and prefers-reduced-motion: no icon moves, no hover pose (hover over a sample of every third icon)
  const sample = items.filter((_, i) => i % 3 === 0 || ['undo', 'palette', 'image', 'save', 'delete', 'close'].includes(_.key));
  for (const mode of ['calm', 'reduced']) {
    const c2 = await freshPage(browser, { calm: mode === 'calm', reduced: mode === 'reduced' });
    await c2.page.evaluate(() => { const h = document.createElement('div'); h.id = 'qa-host'; h.style.cssText = 'position:fixed;inset-block-end:90px;inset-inline-start:300px;z-index:99'; __root().querySelector('.shell').appendChild(h); });
    const moved = [];
    for (const it of sample) {
      await c2.page.evaluate((html) => { __root().getElementById('qa-host').innerHTML = '<button class="b" id="qa-b"><span class="i">' + html + '</span></button>'; }, it.html);
      const bb = await c2.page.locator('#qa-b').boundingBox();
      await c2.page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 2 });
      await c2.page.waitForTimeout(90);
      const m = await c2.page.evaluate(() => { const s = __root().querySelector('#qa-b svg'); const mv = __moving(s); const mvParts = [...s.querySelectorAll('.mv')].filter((p) => getComputedStyle(p).animationName !== 'none').length; return { ...mv, mvParts, tr: getComputedStyle(s).transform, btn: getComputedStyle(__root().querySelector('#qa-b')).transform }; });
      if (m.named || m.self || m.mvParts || m.tr !== 'none' || m.btn !== 'none') moved.push(it.key);
      await c2.page.mouse.move(5, 5);
    }
    check(`${mode}: no icon moves on hover (animation or pose), ${sample.length} sampled`, moved.length === 0, moved.join(' '));
    await c2.ctx.close();
  }

  // surfaces in their real containers: palette rows, panel summaries, check rows, focus rings, brand-icon contrast
  for (const theme of ['light', 'dark']) {
    const s = await freshPage(browser, { ui: theme === 'dark' ? 'ar' : 'en' });
    if (theme === 'dark') await s.page.evaluate(() => { localStorage.setItem('bw:dark', '1'); });
    if (theme === 'dark') { await s.page.reload(); await s.page.waitForFunction(() => window.BW?.ready); await s.page.evaluate(HELPERS); }
    await s.page.keyboard.press('Control+K'); await s.page.waitForTimeout(500);
    const pal = await s.page.evaluate(() => {
      const root = __root();
      const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
      const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const bg = getComputedStyle(root.querySelector('.palette')).backgroundColor;
      const gold = [...root.querySelectorAll('.palette .bw-i .hl:not(.rl)')].map((e) => cr(getComputedStyle(e).fill, bg));
      const rule = [...root.querySelectorAll('.palette .bw-i .hl.rl')].map((e) => cr(getComputedStyle(e).stroke, bg));
      return { n: gold.length + rule.length, min: Math.min(...gold, ...rule), bg };
    });
    check(`palette brand icons: gold part >= 3:1 (${theme})`, pal.n > 5 && pal.min >= 3, `${pal.n} parts, min ${pal.min.toFixed(2)}:1 on ${pal.bg}`);
    // a palette row hovers: wash + its icon plays
    const rows = s.page.locator('#cmdlist [role="option"]');
    const r3 = rows.nth(3);
    const restBg = await r3.evaluate((e) => getComputedStyle(e).backgroundColor);
    const bb = await r3.boundingBox();
    await s.page.mouse.move(bb.x + 40, bb.y + bb.height / 2, { steps: 2 }); await s.page.waitForTimeout(250);
    const hov = await r3.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, sel: e.getAttribute('aria-selected'), mv: [...e.querySelectorAll('.ic > *')].filter((p) => getComputedStyle(p).animationName !== 'none').length }));
    check(`palette row hover is a visible state (${theme})`, hov.bg !== restBg || hov.sel === 'true', `${restBg} -> ${hov.bg}`);
    check(`palette row icon moves on hover (${theme})`, hov.mv > 0, `${hov.mv} parts`);
    await s.page.keyboard.press('Escape');
    // a side panel: group summaries react, every focusable has the house ring (never the UA's auto ring)
    await cmd(s.page, 'settings'); await s.page.waitForTimeout(500);
    const sum = s.page.locator('.drawer details.pgrp > summary').first();
    const sum2 = await sum.evaluate((e) => ({ n: e.getRootNode().querySelectorAll('.drawer details.pgrp > summary').length }));
    check(`settings panel has group summaries (${theme})`, sum2.n >= 3, `${sum2.n}`);
    const sb = await sum.boundingBox();
    const sRest = await sum.evaluate((e) => getComputedStyle(e).backgroundColor);
    await s.page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 2 }); await s.page.waitForTimeout(250);
    const sHov = await sum.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, mv: [...e.querySelectorAll('.ic > *')].filter((p) => getComputedStyle(p).animationName !== 'none').length, hasIc: !!e.querySelector('.ic') }));
    check(`panel group summary has a hover state (${theme})`, sHov.bg !== sRest, `${sRest} -> ${sHov.bg}`);
    if (sHov.hasIc) check(`panel group summary icon moves on hover (${theme})`, sHov.mv > 0, `${sHov.mv} parts`);
    await s.page.evaluate(() => __root().querySelectorAll('.drawer details.pgrp').forEach((d) => { d.open = true; })); await s.page.waitForTimeout(200);
    const chk = s.page.locator('.drawer label.chk:visible').first();
    if (await chk.count()) {
      await chk.scrollIntoViewIfNeeded(); const cb = await chk.boundingBox(); const cr0 = await chk.evaluate((e) => getComputedStyle(e).backgroundColor);
      await s.page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 2 }); await s.page.waitForTimeout(250);
      const ch = await chk.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, cur: getComputedStyle(e).cursor }));
      check(`check row hovers and shows the pointer (${theme})`, ch.bg !== cr0 && ch.cur === 'pointer', `${cr0} -> ${ch.bg}, cursor ${ch.cur}`);
    }
    // keyboard traversal: every stop shows the house ring (solid, >= 2px), never the UA's auto ring, over the toolbar and the Settings panel
    const ua = [];
    await s.page.evaluate(() => { __root().querySelector('.drawer h2')?.setAttribute('tabindex', '-1'); __root().querySelector('.drawer h2')?.focus(); });
    for (let i = 0; i < 45; i += 1) {
      await s.page.keyboard.press('Tab'); await s.page.waitForTimeout(40);
      const o = await s.page.evaluate(() => { const a = __root().activeElement; if (!a || a.id === 'cmdlist') return null; const cs = getComputedStyle(a); return { n: (a.dataset?.a || a.className || a.tagName) + '', st: cs.outlineStyle, w: parseFloat(cs.outlineWidth), tag: a.tagName + (a.type ? '[' + a.type + (a.dataset?.set ? ' ' + a.dataset.set : '') + ']' : ''), own: a.closest('.drawer, .island') ? 1 : 0, fv: a.matches(':focus-visible') }; });
      if (o && o.own && (o.st === 'auto' || o.st === 'none' || o.w < 2)) ua.push(o.tag + '.' + o.n + ':' + o.st + (o.fv ? '' : ' (not focus-visible)'));
    }
    check(`no UA-default or missing focus ring on 45 Tab stops from Settings (${theme})`, ua.length === 0, [...new Set(ua)].slice(0, 8).join(' '));
    await s.ctx.close();
  }
} catch (e) {
  check('ui icon run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
