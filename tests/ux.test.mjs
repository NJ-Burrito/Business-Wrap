// Shell UX check (0.10.0): the layout never flips (A1), Arabic/English parity of every control (A2), whole-field
// segmented toggles with a spring thumb (A3), the sticky selection mode (A4), hover/focus explainers (A5) and the
// page view modes (A6); 0.13 (WP1): the toolbar is mounted once and patched in place (R2/A4), explainers remember
// what was shown or pressed (A3), side panels group and close on an outside press (A7, A8), check-panel jumps (A14),
// table tools on every table (R5/A25). Headless Chrome, closed at the end. Font-independent: no check reads a Thmanyah glyph.
//
//   node tests/ux.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'ux');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
const URL = pathToFileURL(file).href;
const UX = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ux-i18n.json'), 'utf8'));
// the extensions' explainers (editor/ext/*.i18n.json) are merged into the same table by the build
for (const f of fs.readdirSync(path.join(REPO, 'editor', 'ext')).filter((x) => x.endsWith('.i18n.json')).sort()) {
  const j = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', f), 'utf8'));
  for (const l of ['ar', 'en']) Object.assign(UX[l], j[l] || {});
}
const PC = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'print-i18n.json'), 'utf8')); // 0.11.0 strings join the same table
for (const l of ['ar', 'en']) Object.assign(UX[l], PC[l]);
const PNG = path.join(REPO, 'brand', 'v3', 'favicon', 'icon-128.png');

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
};
const browser = await chromium.launch(launchOptions());
async function open({ ui = 'ar', width = 1366, height = 860, reduced = false, store = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([u, st]) => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch {} }, [ui, store]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await settle(page);
  return { ctx, page, errors };
}
async function settle(page, ms = 650) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
const state = (page) => page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot; const c = r.querySelector('.ctx'); return { ui: window.BW.S.ui, ed: window.BW.S.ed, ctx: c.hidden ? '' : c.dataset.cat, selOv: window.BW.S.selOv, dg: !!window.BW.S.dg }; });

try {
  // ── A1: the layout never flips ─────────────────────────────────────────
  for (const width of [1366, 1920]) {
    const { ctx, page, errors } = await open({ ui: 'ar', width });
    const boxes = async () => {
      const ui = await sh(page, (r) => {
        const box = (el) => { if (!el || !el.offsetWidth) return null; const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); };
        const o = { island: box(r.querySelector('.island')), brand: box(r.querySelector('.brand')), lang: box(r.querySelector('.seg.lang')), dirSeg: box(r.querySelector('.seg.ui')), palette: box(r.querySelector('[data-a="palette"]')), drawer: box(r.querySelector('.drawer')), dir: r.querySelector('.shell').dir };
        r.querySelectorAll('.island .sec[data-cat]').forEach((s) => { o['sec:' + s.dataset.cat] = box(s); });
        return o;
      });
      const doc = await page.evaluate(() => { const b = (el) => { const r = el?.getBoundingClientRect(); return r ? [r.x, r.y, r.width].map((v) => Math.round(v)) : null; }; return { page: b(document.querySelector('main.bw-doc')), watermark: b(document.getElementById('bw-watermark')), htmlDir: document.documentElement.dir }; });
      return { ...ui, ...doc };
    };
    await page.evaluate(() => window.BW.runAction('outline')); // a panel open in every state
    await settle(page, 500);
    const base = await boxes();
    const diffs = [];
    for (const [l, d] of [['en', null], ['en', 'rtl'], ['ar', 'ltr'], ['ar', 'rtl']]) {
      await sh(page, (r, l) => r.querySelector(`[data-a="ed"][data-ed="${l}"]`).click(), l);
      if (d) await sh(page, (r, d) => r.querySelector(`[data-a="dir"][data-d="${d}"]`).click(), d);
      await settle(page, 500);
      if (!(await page.evaluate(() => window.BW.S.drawer))) await page.evaluate(() => window.BW.runAction('outline'));
      await settle(page, 450);
      const now = await boxes();
      for (const k of Object.keys(base)) {
        const a = base[k];
        const b = now[k];
        const same = Array.isArray(a) ? Array.isArray(b) && a.every((v, i) => Math.abs(v - b[i]) <= 1) : a === b;
        if (!same) diffs.push(`${l}/${d || 'auto'} ${k}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
      }
    }
    check(`A1 ${width}: toolbar, sections, panel, page and watermark keep their boxes across ع/E × RTL/LTR (±1 px)`, !diffs.length, diffs.slice(0, 6).join(' | '));
    check(`A1 ${width}: shell and page layout stay right-to-left (only data-tdir follows)`, base.dir === 'rtl' && base.htmlDir === 'rtl');
    const td = await sh(page, (r) => r.querySelector('.shell').dataset.tdir);
    const wordDir = await sh(page, (r) => getComputedStyle(r.querySelector('.island .st')).direction);
    check(`A1 ${width}: the words take the chosen direction (data-tdir ${td}, title direction ${wordDir})`, td === wordDir);
    check(`A1 ${width}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ── A2: Arabic/English parity of every control ─────────────────────────
  const sig = async (page) => sh(page, (r) => {
    const named = (el) => !!(el.getAttribute('aria-label') || el.title || el.dataset.tt || el.textContent.trim());
    const one = (el) => {
      const seg = !!el.closest('.seg');
      const icon = !!el.querySelector('.i svg') || (seg && !!el.closest('.seg').querySelector('.cap svg'));
      return `${el.dataset.a}${el.dataset.ed || el.dataset.d || ''}:${icon ? 'I' : '-'}${named(el) ? 'N' : '-'}`;
    };
    const vis = (el) => !!(el.offsetWidth || el.closest('.menu, .more'));
    return {
      tools: [...r.querySelectorAll('.island button[data-a], .island select[data-a], .pop button[data-a]')].map(one).sort(),
      shown: [...r.querySelectorAll('.island button[data-a]')].filter((el) => el.offsetWidth).map((el) => `${el.dataset.a}${el.dataset.ed || el.dataset.d || ''}:${[...el.querySelectorAll('.w, .sw')].some((w) => w.offsetWidth) ? 'W' : '-'}`),
      fold: r.querySelector('.island').className,
      ctx: [...r.querySelectorAll('.ctx [data-a], .ctx [data-dg]')].filter(vis).map(one),
    };
  });
  for (const width of [1366, 1920]) {
    const got = {};
    for (const ui of ['ar', 'en']) {
      const { ctx, page } = await open({ ui, width });
      await page.evaluate(() => window.BW.runAction('view'));
      await settle(page, 400);
      const a = await sig(page);
      await page.evaluate(() => window.BW.runAction('view'));
      await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
      await settle(page, 300);
      a.cell = (await sig(page)).ctx;
      got[ui] = a;
      const noIcon = a.tools.filter((x) => !x.startsWith('svc:') && (/:-/.test(x) || /-$/.test(x))); // the service picker shows its value as its label
      check(`A2 ${width} ${ui}: every toolbar and view control has an icon and a name (pickers: a name)`, !noIcon.length, noIcon.join(' '));
      await ctx.close();
    }
    check(`A2 ${width}: the same controls, icons and names in Arabic and English`, JSON.stringify(got.ar.tools) === JSON.stringify(got.en.tools), JSON.stringify([got.ar.tools.filter((x) => !got.en.tools.includes(x)), got.en.tools.filter((x) => !got.ar.tools.includes(x))]));
    check(`A2 ${width}: the bar folds the same way (words shown/hidden per tool) in both languages`, JSON.stringify(got.ar.shown) === JSON.stringify(got.en.shown) && got.ar.fold === got.en.fold, `${got.ar.fold} vs ${got.en.fold} | ${got.ar.shown.filter((x, i) => x !== got.en.shown[i]).join(' ')}`);
    check(`A2 ${width}: a table cell's tools match in both languages`, JSON.stringify(got.ar.cell) === JSON.stringify(got.en.cell) && got.ar.cell.length > 3, JSON.stringify([got.ar.cell, got.en.cell]));
  }

  // ── A3: whole-field segmented toggles with a spring thumb ──────────────
  {
    const { ctx, page } = await open({ ui: 'ar', width: 1366 });
    const seg = await sh(page, (r) => { const s = r.querySelector('.seg.lang').getBoundingClientRect(); const bs = [...r.querySelectorAll('.seg.lang button')].map((b) => b.getBoundingClientRect()); return { s: [s.x, s.y, s.width, s.height], bs: bs.map((b) => [b.x, b.width]) }; });
    // a point on the field's own padding, outside both options
    const xs = [seg.s[0] + 1.5, seg.s[0] + seg.s[2] - 1.5].filter((x) => seg.bs.every(([bx, bw]) => x < bx || x > bx + bw));
    await page.mouse.click(xs[0], seg.s[1] + seg.s[3] / 2);
    await settle(page, 300);
    const s1 = await state(page);
    check('A3: a click on the language field\'s padding toggles it (ع → E)', s1.ui === 'en', JSON.stringify({ xs, seg, s1 }));
    await page.mouse.click(xs[0], seg.s[1] + seg.s[3] / 2);
    await settle(page, 300);
    check('A3: a second click toggles back (E → ع)', (await state(page)).ui === 'ar');
    const segD = await sh(page, (r) => { const s = r.querySelector('.seg.ui').getBoundingClientRect(); return [s.x, s.y, s.width, s.height]; });
    await page.mouse.click(segD[0] + 1.5, segD[1] + segD[3] / 2);
    await settle(page, 300);
    const dirNow = await page.evaluate(() => [window.BW.S.dir, document.querySelector('main.bw-doc').dir]);
    check('A3: a click on the direction field\'s padding toggles it (RTL → LTR)', dirNow[0] === 'ltr' && dirNow[1] === 'ltr', JSON.stringify(dirNow));
    await sh(page, (r) => r.querySelector('[data-a="dir"][data-d="rtl"]').click());
    await settle(page, 700);
    const th = await sh(page, (r) => [...r.querySelectorAll('.seg[data-x]')].filter((s) => s.offsetWidth).map((s) => { const t = s.querySelector('.thumb').getBoundingClientRect(); const on = s.querySelector('[aria-pressed="true"]').getBoundingClientRect(); return { x: s.dataset.x, d: Math.abs(t.x - on.x) + Math.abs(t.width - on.width), tf: getComputedStyle(s.querySelector('.thumb')).transitionTimingFunction }; }));
    check('A3: the thumb sits under the pressed option of each field', th.length >= 2 && th.every((x) => x.d <= 2), JSON.stringify(th));
    check('A3: the thumb moves on a spring curve', th.every((x) => /linear\(/.test(x.tf)), JSON.stringify(th.map((x) => x.tf)));
    // mid-flight: right after a toggle the thumb is between the two options (it slides, it does not jump)
    await sh(page, (r) => r.querySelector('[data-a="ed"][data-ed="en"]').click());
    await page.waitForTimeout(90);
    const mid = await sh(page, (r) => { const s = r.querySelector('.seg.lang'); const t = s.querySelector('.thumb').getBoundingClientRect().x; const on = s.querySelector('[aria-pressed="true"]').getBoundingClientRect().x; return Math.abs(t - on); });
    check('A3: the thumb slides (mid-flight it has not yet arrived)', mid > 2, `offset ${mid.toFixed(1)} px at 90 ms`);
    await ctx.close();
    const rm = await open({ ui: 'ar', reduced: true });
    const tr = await sh(rm.page, (r) => getComputedStyle(r.querySelector('.seg.lang .thumb')).transitionDuration);
    check('A3: reduced motion → no thumb motion', /^0s(, 0s)*$/.test(tr), tr);
    await rm.ctx.close();
  }

  // ── A4: the selection's tools are a sticky mode ────────────────────────
  for (const ui of ['ar', 'en']) {
    const { ctx, page } = await open({ ui, width: 1366 });
    const fig = page.locator('main.bw-doc figure[data-dg]').first();
    await fig.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    const nb = await fig.locator('[data-dg-node]').nth(1).boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await settle(page, 250);
    const kept = [];
    const still = async (what) => { const s = await state(page); kept.push(`${what}:${s.ctx}`); return s.ctx === 'shape'; };
    let ok = await still('shape');
    await page.locator('.ctx [data-a="more"]').click();
    ok = (await still('more menu')) && ok;
    await page.locator('.ctx .menu .b').first().hover();
    await page.locator('.ctx [data-a="more"]').click();
    ok = (await still('menu closed')) && ok;
    await page.locator('.ctx select').first().click({ force: true });
    await page.keyboard.press('Escape');
    ok = (await still('picker')) && ok;
    await page.locator('.island [data-a="theme"]').click();
    await settle(page, 500);
    ok = (await still('design panel open')) && ok;
    await page.locator('.drawer h3').first().click();
    ok = (await still('panel heading')) && ok;
    const col = page.locator('.drawer input[type="color"]').first();
    if (await col.count()) { await col.evaluate((e) => { e.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); }); await col.evaluate((e) => { e.value = '#123456'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); }
    ok = (await still('colour picker')) && ok;
    await page.locator('.island [data-a="view"]').click();
    await settle(page, 300);
    ok = (await still('view popover (rebuild)')) && ok;
    await page.locator('.island [data-a="view"]').click();
    await page.locator('.drawer [data-k="close"]').click();
    await settle(page, 300);
    ok = (await still('panel closed')) && ok;
    check(`A4 ${ui}: a shape's tools stay through menus, pickers, the design panel, colour input, popover`, ok, kept.join(' · '));
    // a logo: selected by a click, kept while the panel is used
    await page.mouse.click(1220, 420); // empty desk: the general tools come back
    await page.keyboard.press('Control+K');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cmdlist [data-cmd="logo"]').click()]);
    await chooser.setFiles(PNG);
    await page.waitForFunction(() => document.querySelector('main.bw-doc .bw-ov'));
    await page.mouse.click(1220, 420); // empty desk
    await settle(page, 200);
    const cleared = await state(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const ovb = await page.locator('main.bw-doc .bw-ov').first().boundingBox();
    await page.mouse.click(ovb.x + ovb.width / 2, ovb.y + ovb.height / 2);
    await settle(page, 250);
    const onLogo = await state(page);
    await page.locator('.island [data-a="theme"]').click();
    await settle(page, 450);
    await page.locator('.drawer h3').nth(1).click();
    const afterPanel = await state(page);
    check(`A4 ${ui}: clicking a logo selects it and its tools stay (the 0.9.1 drop is gone)`, cleared.ctx === '' && onLogo.ctx === 'logo' && afterPanel.ctx === 'logo', JSON.stringify({ cleared, onLogo, afterPanel }));
    // only empty space (or Esc) brings the general tools back
    await page.mouse.click(1220, 420);
    await settle(page, 200);
    const desk = await state(page);
    check(`A4 ${ui}: a click on empty space returns the general tools`, desk.ctx === '' && desk.selOv == null, JSON.stringify(desk));
    if (await page.evaluate(() => window.BW.S.drawer)) await page.locator('.drawer [data-k="close"]').click();
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
    await page.locator('.island [data-a="save"]').focus();
    await page.keyboard.press('Escape'); // nothing open: the selection leaves
    const esc = await state(page);
    check(`A4 ${ui}: Esc in the toolbar (nothing open) returns the general tools`, esc.ctx === '', JSON.stringify(esc));
    await ctx.close();
  }

  // ── A5: hover / focus explainers ───────────────────────────────────────
  {
    const keys = new Set();
    for (const ui of ['ar', 'en']) {
      const { ctx, page } = await open({ ui, width: 1366, store: { 'bw:explainers': 'always' } }); // 0.12 behaviour: every hover (0.13 «once» is checked below)
      const tools = await sh(page, (r) => [...r.querySelectorAll('.island [data-a], .pop [data-a]')].map((el) => el.dataset.a));
      tools.forEach((k) => keys.add(k));
      await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
      (await sh(page, (r) => [...r.querySelectorAll('.ctx [data-a]')].map((el) => el.dataset.a))).forEach((k) => keys.add(k));
      const card = () => sh(page, (r) => { const c = r.querySelector('.xpl'); if (!c || c.hidden) return null; const anim = [...c.querySelectorAll('svg *')].flatMap((e) => e.getAnimations()).length; return { text: c.querySelector('p').textContent, name: c.querySelector('b').textContent, anim, lang: c.lang }; });
      await page.locator('.island [data-a="save"]').hover();
      await page.waitForTimeout(300);
      const early = await card();
      await page.waitForTimeout(900);
      const shown = await card();
      check(`A5 ${ui}: hover ~900 ms shows the card (not at 300 ms) with its sentence and a running animation`, !early && shown && shown.text === UX[ui]['explain.save'] && shown.anim > 0 && shown.lang === ui, JSON.stringify({ early, shown }));
      await page.keyboard.press('Escape');
      check(`A5 ${ui}: Esc hides the card`, !(await card()));
      await page.mouse.move(700, 600); // leave first: hovering the same spot again sends no pointerover
      await page.locator('.island [data-a="save"]').hover();
      await page.waitForTimeout(1150);
      const second = await card();
      await page.mouse.move(700, 600);
      await page.waitForTimeout(150);
      check(`A5 ${ui}: leaving hides the card`, second?.text === UX[ui]['explain.save'] && !(await card()), JSON.stringify(second));
      // keyboard focus shows it too
      await page.keyboard.press('Tab');
      await sh(page, (r) => r.querySelector('.island [data-a="save"]').focus());
      await page.waitForTimeout(1150);
      const kb = await card();
      check(`A5 ${ui}: keyboard focus shows the card`, kb?.text === UX[ui]['explain.save'], JSON.stringify(kb));
      // the Design panel's own controls (font picker, machine fonts, slider / number / unit, colour swatch and hex)
      await page.keyboard.press('Escape');
      await page.evaluate(() => window.BW.runAction('theme'));
      await settle(page, 500);
      // A7: groups after the first start collapsed; open the ones these controls live in
      await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer details.dgrp').forEach((d) => { d.open = true; }));
      await settle(page, 200);
      const panel = [['[data-fpopen]', 'font.pick'], ['.vc-s', 'vc.slider'], ['.vc-n', 'vc.number'], ['.cc-hex', 'design.hex'], ['input[type="color"]', 'design.swatch']];
      const got = [];
      for (const [sel, key] of panel) {
        const el = page.locator(`.drawer ${sel}`).first();
        if (!(await el.count())) { got.push(`${key}:absent`); continue; }
        await el.scrollIntoViewIfNeeded();
        await page.mouse.move(5, 5);
        await page.waitForTimeout(500);
        await el.hover();
        await page.waitForTimeout(1150);
        const c = await card();
        got.push(`${key}:${c?.text === UX[ui][`explain.${key}`] ? 'ok' : JSON.stringify(c)}`);
      }
      check(`A5 ${ui}: the Design panel's font picker, slider, number, hex and swatch explain themselves`, got.every((x) => x.endsWith(':ok')), got.join(' | '));
      await ctx.close();
    }
    const missing = [...keys].filter((k) => !UX.ar[`explain.${k}`] || !UX.en[`explain.${k}`]);
    check(`A5: every toolbar, view and selection tool has an explainer in Arabic and English (${keys.size} tools)`, !missing.length, missing.join(' '));
    const rm = await open({ ui: 'ar', reduced: true });
    await rm.page.locator('.island [data-a="save"]').hover();
    await rm.page.waitForTimeout(1200);
    const still = await sh(rm.page, (r) => { const c = r.querySelector('.xpl'); return c && !c.hidden ? [...c.querySelectorAll('svg *')].flatMap((e) => e.getAnimations()).length : -1; });
    check('A5: reduced motion → the card shows a still frame', still === 0, String(still));
    await rm.ctx.close();
  }

  // ── A6: page view modes ────────────────────────────────────────────────
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ ui, width: 1366 });
    if (ui === 'en') { await page.evaluate(() => window.BW.runAction('uiLang')); await page.evaluate(() => window.BW.runAction('uiLang')); await settle(page, 300); }
    const ed = (await state(page)).ed;
    const mode = async (m) => { if (!(await page.evaluate(() => window.BW.S.view))) await page.locator('.island [data-a="view"]').click(); await page.locator(`.pop [data-a="view.${m}"]`).click(); };
    await mode('spread');
    await settle(page, 500);
    const geo = () => page.evaluate(() => {
      const v = document.querySelector('#bw-pair .bw-view');
      const m = document.querySelector('main.bw-doc');
      const vr = v.getBoundingClientRect();
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= vr.left - 1 && r.right <= vr.right + 1; };
      const half = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2 < vr.left + vr.width / 2 ? 'L' : 'R'; };
      const cover = m.querySelector('.cover');
      const fields = [...m.querySelectorAll('.wrap :is(h2, h3, p, td, th, li, figcaption)')].filter(inView);
      return { mode: document.getElementById('bw-pair').dataset.pages, at: window.BW.S.pageAt, n: window.BW.S.pageN, coverIn: inView(cover), coverHalf: half(cover), firstHalf: fields[0] ? half(fields[0]) : '', lastHalf: fields.length ? half(fields[fields.length - 1]) : '', halves: [...new Set(fields.map(half))].join(''), vw: Math.round(vr.width), vh: Math.round(vr.height) };
    });
    const g0 = await geo();
    const rtl = ed === 'ar';
    check(`A6 ${ui}: book view opens on the cover alone, on the ${rtl ? 'left (RTL book)' : 'right (LTR book)'}`, g0.mode === 'spread' && g0.coverIn && g0.coverHalf === (rtl ? 'L' : 'R') && !g0.firstHalf, JSON.stringify(g0));
    await page.keyboard.press('PageDown');
    await settle(page, 800);
    const g1 = await geo();
    check(`A6 ${ui}: next spread shows two pages side by side, first page on the ${rtl ? 'right' : 'left'}`, g1.halves.length === 2 && g1.firstHalf === (rtl ? 'R' : 'L') && g1.lastHalf === (rtl ? 'L' : 'R') && !g1.coverIn && g1.n > 3, JSON.stringify(g1));
    // remembered across a reload
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await settle(page, 400);
    check(`A6 ${ui}: the view mode is remembered`, (await geo()).mode === 'spread');
    // single page: one page wide, the pill turns pages
    await mode('single');
    await settle(page, 500);
    const s0 = await geo();
    await sh(page, (r) => r.querySelector('.pager [data-a="view.next"]').click());
    await settle(page, 800);
    const s1 = await geo();
    check(`A6 ${ui}: single page shows one page; «next» turns to page 2`, s0.mode === 'single' && s0.vw < g1.vw * 0.6 && s0.coverIn && s1.at === 1 && !s1.coverIn && s1.halves.length >= 1, JSON.stringify([s0, s1]));
    // editing works in a paged view
    const fld = page.locator('main.bw-doc .wrap [data-p]').first();
    await fld.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' ✓');
    const typed = await page.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].ops.length);
    check(`A6 ${ui}: text can be edited in the single-page view`, typed > 0, String(typed));
    // print and export never see the view
    await page.emulateMedia({ media: 'print' });
    const pr = await page.evaluate(() => { const m = document.querySelector('main.bw-doc'); const cs = getComputedStyle(m); const v = getComputedStyle(document.querySelector('.bw-view')); return { cols: cs.columnWidth, h: cs.height, tf: cs.transform, ov: v.overflow, zoom: v.zoom }; });
    check(`A6 ${ui}: print CSS unaffected (no columns, no fixed height, no slide, no clip)`, pr.cols === 'auto' && pr.tf === 'none' && pr.ov === 'visible' && parseFloat(pr.h) > 1500 && String(pr.zoom) === '1', JSON.stringify(pr));
    await page.emulateMedia({ media: 'screen' });
    const pdfPaged = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    await mode('continuous');
    await settle(page, 400);
    const pdfFlow = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = (b) => { const f = path.join(OUT, 'count.pdf'); fs.writeFileSync(f, b); return +spawnSync(...py(['-c', 'import pymupdf,sys;print(len(pymupdf.open(sys.argv[1])))', f], ['pymupdf']), { encoding: 'utf8' }).stdout.trim(); };
    check(`A6 ${ui}: the editor prints the same number of pages in paged and continuous view`, pages(pdfPaged) === pages(pdfFlow) && pages(pdfFlow) > 3, `${pages(pdfPaged)} vs ${pages(pdfFlow)}`);
    check(`A6 ${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // ── toolbar menus escape the toolbar (owner bug 1, 0.10.0) ─────────────
  for (const width of [1366, 1920]) {
    for (const ui of ['ar', 'en']) {
      const { ctx, page } = await open({ ui, width });
      const fails = [];
      const probeMenu = async (name) => {
        const r = await sh(page, (root) => {
          const m = root.querySelector('.more .menu[data-open="1"]');
          if (!m) return { none: true };
          const b = m.getBoundingClientRect();
          const items = [...m.querySelectorAll('button, select')];
          const last = items.at(-1).getBoundingClientRect();
          const hit = root.elementFromPoint(last.x + last.width / 2, last.y + last.height / 2);
          const bar = root.querySelector('.island');
          return { inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight, lastHit: items.at(-1).contains(hit), top: m.matches(':popover-open'), barScroll: /auto|scroll/.test(getComputedStyle(bar).overflowX) || bar.scrollWidth > bar.clientWidth };
        });
        if (r.none || !r.inView || !r.lastHit || !r.top || r.barScroll) fails.push(`${name}:${JSON.stringify(r)}`);
      };
      // the selection's «More» (a diagram shape), then every folded section's «More»
      const fig = page.locator('main.bw-doc figure[data-dg]').first();
      await fig.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      const nb = await fig.locator('[data-dg-node]').nth(1).boundingBox();
      await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
      await settle(page, 250);
      await page.locator('.ctx [data-a="more"]').click();
      await page.waitForTimeout(300);
      await probeMenu('selection');
      const folded = await sh(page, (r) => [...r.querySelectorAll('.sec.folded .more.tail > [data-a="more"]')].map((b) => b.closest('.sec').dataset.cat));
      for (const cat of folded) {
        await page.locator(`.sec[data-cat="${cat}"] .more.tail > [data-a="more"]`).click();
        await page.waitForTimeout(250);
        await probeMenu(cat);
      }
      // an outside click on the toolbar closes the menu and keeps the shape's tools
      await page.locator('.ctx [data-a="more"]').click();
      await page.locator('.island .brand').click();
      const after = await state(page);
      const stillOpen = await sh(page, (r) => !!r.querySelector('.more .menu[data-open="1"]'));
      // Esc closes and returns focus to the button
      await page.locator('.ctx [data-a="more"]').click();
      await page.keyboard.press('Escape');
      const focus = await sh(page, (r) => [r.activeElement?.dataset?.a, !!r.querySelector('.more .menu[data-open="1"]')]);
      check(`menus ${ui} ${width}: every toolbar menu opens fully visible in the top layer, last item reachable, no toolbar scroll (${folded.length + 1} menus)`, !fails.length, fails.join(' | '));
      check(`menus ${ui} ${width}: outside click closes the menu and keeps the selection; Esc closes and returns focus`, !stillOpen && after.ctx === 'shape' && focus[0] === 'more' && !focus[1], JSON.stringify({ stillOpen, after, focus }));
      await ctx.close();
    }
  }

  // ── moving placed elements (owner bug 2, 0.10.0) ────────────────────────
  const dragBy = async (page, loc, dx, dy) => {
    const bb = await loc.boundingBox();
    const x = bb.x + bb.width / 2;
    const y = bb.y + bb.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) { await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12); await page.waitForTimeout(12); }
    await page.mouse.up();
    await page.waitForTimeout(350);
  };
  for (const view of ['continuous', 'single', 'spread']) {
    for (const ui of ['ar', 'en']) {
      const { ctx, page, errors } = await open({ ui, width: 1366, store: { 'bw:pages': view, 'bw:snap': '0' } });
      if (ui === 'en') { await page.evaluate(() => window.BW.runAction('uiLang')); await page.evaluate(() => window.BW.runAction('uiLang')); await settle(page, 300); }
      const res = [];
      // a logo (Add logo) and a free-placed image, both on the cover
      await page.keyboard.press('Control+K');
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cmdlist [data-cmd="logo"]').click()]);
      await chooser.setFiles(PNG);
      await page.waitForFunction(() => document.querySelector('main.bw-doc .bw-ov'));
      await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; const src = e.doc.overlays[0].src; window.BW.commit([{ op: 'insert', path: '/overlays/-', value: { id: 'img1', kind: 'image', src, mode: 'cover', x: 40, y: 150, w: 40 } }]); });
      await settle(page, 300);
      await page.evaluate(() => window.scrollTo(0, 0));
      for (const [kind, i] of [['logo', 0], ['image', 1]]) {
        const loc = page.locator(`main.bw-doc .bw-ov[data-i="${i}"]`);
        if (view === 'continuous') { await loc.evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200); }
        const a = await loc.boundingBox();
        await dragBy(page, loc, 120, 120);
        const b = await loc.boundingBox();
        res.push([kind, Math.round(b.x - a.x), Math.round(b.y - a.y)]);
      }
      const ov = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.overlays.map((o) => [o.x, o.y]));
      // a diagram shape and a free text in the drawing (paged views turn to the figure's page first)
      for (let n = 0; n < 14; n += 1) {
        const vis = await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg] svg'); const v = document.querySelector('#bw-pair .bw-view') || document.documentElement; const r = f.getBoundingClientRect(); const w = v === document.documentElement ? { left: 0, right: innerWidth } : v.getBoundingClientRect(); return r.left >= w.left - 1 && r.right <= w.right + 1; });
        if (vis) break;
        await page.keyboard.press('PageDown');
        await page.waitForTimeout(700);
      }
      const fig = page.locator('main.bw-doc figure[data-dg]').first();
      await fig.evaluate((e) => e.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(400);
      const fb = await fig.locator('svg').first().boundingBox();
      await page.mouse.click(fb.x + 8, fb.y + 8); // the empty drawing: diagram tools
      await page.evaluate(() => window.BW.runAction('dgText'));
      await settle(page, 300);
      const ids = await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); let o = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; for (const k of f.dataset.dg.split('/').filter(Boolean)) o = o[k]; return [o.model.nodes.find((n) => n.kind !== 'text' && n.kind !== 'group')?.id, o.model.nodes.filter((n) => n.kind === 'text').at(-1)?.id]; });
      for (const [kind, id] of [['shape', ids[0]], ['text', ids[1]]]) {
        const loc = page.locator(`main.bw-doc figure[data-dg] [data-dg-node="${id}"]`).first();
        if (!(await loc.count())) { res.push([kind, 'absent']); continue; }
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        const a = await loc.boundingBox();
        await dragBy(page, loc, 120, 40);
        const b = await page.locator(`main.bw-doc figure[data-dg] [data-dg-node="${id}"]`).first().boundingBox();
        res.push([kind, Math.round(b.x - a.x), Math.round(b.y - a.y)]);
      }
      const bad = res.filter(([k, x, y]) => x === 'absent' || Math.abs(x - 120) > 2 || Math.abs(y - (k === 'shape' || k === 'text' ? 40 : 120)) > 2);
      check(`move ${view} ${ui}: logo, image, diagram shape and free text follow a real drag (±2 px)`, !bad.length, JSON.stringify(res));
      // keyboard nudge
      await page.evaluate(() => window.scrollTo(0, 0));
      if (view !== 'continuous') { await page.keyboard.press('Home'); await page.waitForTimeout(700); }
      { const lb = await page.locator('main.bw-doc .bw-ov[data-i="0"]').boundingBox(); await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2); } // a click picks it; the arrows then nudge it
      await page.keyboard.press('ArrowLeft');
      const nudged = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.overlays[0].x);
      // reopen: the positions persist
      const edNow = await page.evaluate(() => window.BW.S.ed);
      const keep = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.overlays.map((o) => [o.x, o.y]));
      await page.evaluate(() => window.BW.flushDraft());
      await page.reload();
      await page.waitForFunction(() => window.BW?.ready);
      await page.locator('.toasts .banner button[data-k="0"]').click().catch(() => {});
      await settle(page, 300);
      const back = await page.evaluate((ed) => (window.BW.M[window.BW.S.svc][ed].doc.overlays || []).map((o) => [o.x, o.y]), edNow);
      check(`move ${view} ${ui}: arrow key nudges by 1 mm and the positions survive a reopen`, Math.abs(nudged - (ov[0][0] - 1)) < 0.05 && JSON.stringify(back) === JSON.stringify(keep), JSON.stringify({ ov, nudged, keep, back }));
      if (view === 'continuous' && ui === 'ar') {
        // the PDF lands it in the same place: in print, the logo's offset from the cover equals its saved x / y
        await page.emulateMedia({ media: 'print' });
        const pr = await page.evaluate(() => { const m = document.querySelector('main.bw-doc'); const c = m.querySelector('.cover').getBoundingClientRect(); const l = m.querySelector('.bw-ov[data-i="0"]').getBoundingClientRect(); const o = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.overlays[0]; const mm = 96 / 25.4; return { x: (l.left - c.left) / mm, y: (l.top - c.top) / mm, ox: o.x, oy: o.y }; });
        await page.emulateMedia({ media: 'screen' });
        check('move: in print the moved logo sits at its saved position (±0.5 mm)', Math.abs(pr.x - pr.ox) < 0.5 && Math.abs(pr.y - pr.oy) < 0.5, JSON.stringify(pr));
      }
      check(`move ${view} ${ui}: no page errors`, !errors.length, errors.join(' | '));
      await ctx.close();
    }
  }
  // ── 0.13 WP1: toolbar mounted once (R2/A4), explainer memory (A3), side panels (A7, A8), check-panel jumps (A14),
  //    table tools on every table incl. front matter (R5/A25; WP2's TOC/control pointers put on by hand as a fixture) ──
  { // 0.13 R2
    const { ctx, page, errors } = await open({ width: 1440, height: 900 });
    const r = await sh(page, (R) => {
      const isl = R.querySelector('.island'); const out = {};
      for (const a of ['dark', 'calm', 'calm', 'snap', 'view', 'view', 'uiLang', 'dir', 'dark']) { window.BW.runAction(a); out[a] = R.querySelector('.island') === isl; }
      return { out, ui: window.BW.S.ui, lang: R.querySelector('.shell').lang, save: R.querySelector('.island [data-a="save"] .w').textContent };
    });
    check('0.13 R2: island same node through toggles', Object.values(r.out).every(Boolean), JSON.stringify(r));
    check('0.13 R2: language words follow in place', r.ui === 'en' && r.lang === 'en' && /Save/i.test(r.save), JSON.stringify(r));
    // animations after a real RTL->LTR click (the logo's own idle loops, A22, run by design and are not counted)
    await page.evaluate(() => window.BW.runAction('uiLang')); await page.waitForTimeout(600);
    const btn = page.locator('.island [data-a="dir"][data-d="ltr"]');
    await btn.click();
    const anims = await sh(page, async (R) => { const seen = new Set(); const t0 = performance.now(); while (performance.now() - t0 < 600) { R.getAnimations().forEach((a) => { const el = a.effect?.target; if (el && !el.closest?.('.brand')) seen.add((el.className?.baseVal ?? el.className) + '@' + (el.closest('[data-x]')?.dataset.x || el.dataset?.a || el.tagName)); }); await new Promise((r) => setTimeout(r, 40)); } return [...seen]; });
    check('0.13 A4: after RTL→LTR only the direction thumb animates', anims.length >= 1 && anims.filter((x) => !/^toast/.test(x)).every((x) => /thumb@dir/.test(x)), JSON.stringify(anims));
    const xpl = await sh(page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    check('0.13 A4: no explainer after the press', !xpl);
    check('0.13 R2: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // 0.13 A3
    const { ctx, page } = await open({ width: 1440, height: 900 });
    const card = () => sh(page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    await page.mouse.move(700, 600);
    const save = page.locator('.island [data-a="save"]');
    const t0 = Date.now(); await save.hover();
    let at = -1; while (Date.now() - t0 < 1600) { if (await card()) { at = Date.now() - t0; break; } await page.waitForTimeout(30); }
    check('0.13 A3: first hover shows the card at 880–1100 ms', at >= 850 && at <= 1150, String(at));
    await page.mouse.move(700, 600); await page.waitForTimeout(200);
    await save.hover(); await page.waitForTimeout(2000);
    check('0.13 A3: second hover within the window: no card in 2 s', !(await card()));
    await page.mouse.move(700, 600);
    const und = page.locator('.island [data-a="newdoc"]');
    await und.click(); await page.mouse.move(700, 600); await page.keyboard.press('Escape'); await und.hover(); await page.waitForTimeout(1500);
    check('0.13 A3: a pressed tool, hovered again: no card', !(await card()));
    await ctx.close();
    const al = await open({ width: 1440, height: 900, store: { 'bw:explainers': 'always' } });
    const c2 = () => sh(al.page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    await al.page.mouse.move(700, 600); await al.page.locator('.island [data-a="save"]').hover(); await al.page.waitForTimeout(1200); const a1 = await c2();
    await al.page.mouse.move(700, 600); await al.page.waitForTimeout(200); await al.page.locator('.island [data-a="save"]').hover(); await al.page.waitForTimeout(1200); const a2 = await c2();
    check('0.13 A3: setting "always" restores the repeat', a1 && a2, JSON.stringify({ a1, a2 }));
    await al.ctx.close();
  }
  { // 0.13 A7
    const { ctx, page } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => window.BW.runAction('settings')); await page.waitForTimeout(500);
    const first = (a) => a.length >= 2 && a[0] === true && a.slice(1).every((x) => x === false);
    const g = await sh(page, (R) => [...R.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
    check('0.13 A7: Settings opens with only the first group expanded (local learning collapsed too)', g.length >= 3 && first(g), JSON.stringify(g));
    // the Design and Process panels follow the same rule (the owner asked for all side panels)
    await page.evaluate(() => window.BW.openDrawer('theme')); await page.waitForTimeout(300);
    const gd = await sh(page, (R) => [...R.querySelectorAll('.drawer details.dgrp')].map((d) => d.open));
    await page.evaluate(() => window.BW.openDrawer('process')); await page.waitForTimeout(300);
    const gp = await sh(page, (R) => [...R.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
    check('0.13 A7: the Design panel opens with only the first group expanded (the Process panel: harvest.test, with a model)', gd.length >= 6 && first(gd) && (gp.length < 2 || first(gp)), JSON.stringify({ gd, gp }));
    await page.evaluate(() => { window.BW.runAction('settings'); }); await page.waitForTimeout(400);
    await sh(page, (R) => { const d = R.querySelectorAll('.drawer details.pgrp')[2]; d.open = true; });
    await page.waitForTimeout(100);
    await page.evaluate(() => { window.BW.runAction('settings'); }); await page.waitForTimeout(400); await page.evaluate(() => { window.BW.runAction('settings'); }); await page.waitForTimeout(400);
    const g2 = await sh(page, (R) => [...R.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
    check('0.13 A7: a toggled group stays open across a reopen', g2[2] === true, JSON.stringify(g2));
    await page.evaluate(() => window.BW.runAction('outline')); await page.waitForTimeout(400);
    const bg = await sh(page, (R) => { const li = R.querySelectorAll('.drawer .list > li'); return [getComputedStyle(li[0]).backgroundColor, getComputedStyle(li[1]).backgroundColor, getComputedStyle(li[0]).color]; });
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    check('0.13 A7: alternating row shades differ and both keep text contrast ≥ 4.5:1', bg[0] !== bg[1] && ratio(bg[2], bg[0]) >= 4.5 && ratio(bg[2], bg[1]) >= 4.5, JSON.stringify(bg));
    await ctx.close();
  }
  { // 0.13 A8
    const { ctx, page } = await open({ width: 1440, height: 900 });
    const kinds = ['outline', 'settings', 'theme', 'history', 'check', 'find', 'pages', 'webhooks', 'newdoc', 'process', 'styleThis'];
    const res = [];
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
    for (const k of kinds) {
      await page.evaluate((k) => window.BW.runAction(k), k); await page.waitForTimeout(350);
      const opened = await page.evaluate(() => window.BW.S.drawer);
      const inside = page.locator('.drawer header h2'); await inside.click(); await page.waitForTimeout(100);
      const afterIn = await page.evaluate(() => window.BW.S.drawer);
      await page.mouse.click(1410, 600); await page.waitForTimeout(300);
      const afterOut = await page.evaluate(() => window.BW.S.drawer);
      res.push(`${k}:${opened}/${afterIn}/${afterOut}`);
      if (afterOut) await page.evaluate(() => window.BW.runAction(window.BW.S.drawer));
      await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
    }
    check('0.13 A8: every drawer closes on a page press, stays on an inside press', res.every((x) => { const [o, i, a] = x.split(':')[1].split('/'); return o !== 'null' && i === o && a === 'null'; }), res.join(' '));
    await ctx.close();
  }
  { // 0.13 A14
    const { ctx, page } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => { window.BW.setText('/labels/revDate', ''); window.BW.render(); window.scrollTo(0, 99999); window.BW.runAction('check'); });
    await page.waitForTimeout(400);
    const n = await sh(page, (R) => R.querySelectorAll('.drawer .list .jump').length);
    await page.locator('.drawer .jump[data-go="/labels/revDate"]').click(); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const el = document.querySelector('main.bw-doc [data-p="/labels/revDate"]'); const b = el.getBoundingClientRect(); return { inView: b.top >= 0 && b.bottom <= innerHeight, p: window.BW.S.sel?.p, ring: el.classList.contains('bw-jump') }; });
    check('0.13 A14: problem buttons; the jump scrolls the element in view, selects it, rings it', n >= 1 && r.inView && r.p === '/labels/revDate' && r.ring, JSON.stringify({ n, ...r }));
    await ctx.close();
  }
  { // 0.13 R5
    const { ctx, page, errors } = await open({ width: 1440, height: 900 });
    const cell = page.locator('main.bw-doc table[data-rows="/revisions"] td[data-r="0"]').first();
    await cell.scrollIntoViewIfNeeded(); await cell.click(); await page.waitForTimeout(300);
    const st = await sh(page, (R) => { const c = R.querySelector('.ctx'); return { cat: c.hidden ? '' : c.dataset.cat, tools: [...c.querySelectorAll('[data-a]')].map((x) => x.dataset.a) }; });
    const n0 = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.revisions.length);
    await page.evaluate(() => window.BW.runAction('rowAdd'));
    const n1 = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.revisions.length);
    check('0.13 R5: revisions click → table tools (no block move/delete); add row → /revisions +1', st.cat === 'table' && !st.tools.includes('moveUp') && !st.tools.includes('delete') && n1 === n0 + 1, JSON.stringify({ st, n0, n1 }));
    const body = page.locator('main.bw-doc [data-p$="/paragraphs/0"]').first(); await body.scrollIntoViewIfNeeded(); await body.click(); await page.waitForTimeout(200);
    const after = await sh(page, (R) => { const c = R.querySelector('.ctx'); return c.hidden ? '' : c.dataset.cat; });
    check('0.13 R5: a paragraph after a table cell is not a table', after === 'text', after);
    check('0.13 R5: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // 0.13 TOC
    const { ctx, page, errors } = await open({ width: 1440, height: 900 });
    // the TOC and control-table pointers come from engine/render.mjs (WP2, design.md A25): no stand-ins
    const fixture = () => page.evaluate(() => {
      const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc;
      const main = document.querySelector(`main.bw-doc[data-locale="${window.BW.S.ed}"]`);
      const multi = new Set(d.chapters.flatMap((ch, i) => (ch.sections.length > 1 ? ch.sections.map((s, j) => `/chapters/${i}/sections/${j}`) : [])));
      return [...main.querySelectorAll('table.toc[data-rows="/toc"] tr[data-sec]')].map((tr) => tr.dataset.sec).find((x) => multi.has(x)) || null;
    });
    const sec = await fixture();
    const cnt = (p) => page.evaluate((p) => p.split('/').slice(1).reduce((o, k) => o?.[k], window.BW.M[window.BW.S.svc][window.BW.S.ed].doc), p);
    const ch = sec.split('/').slice(0, 3).join('/');
    const n0 = (await cnt(`${ch}/sections`)).length;
    const cell = page.locator(`main.bw-doc table.toc td[data-p="${sec}/title"]`).first(); await cell.scrollIntoViewIfNeeded(); await cell.click(); await page.waitForTimeout(250);
    const tools = await sh(page, (R) => { const c = R.querySelector('.ctx'); return c.hidden ? '' : [...c.querySelectorAll('[data-a]')].map((x) => x.dataset.a).join(','); });
    await page.evaluate(() => window.BW.runAction('rowAdd')); await page.waitForTimeout(200);
    const n1 = (await cnt(`${ch}/sections`)).length;
    check('0.13 A25: TOC row → table tools Add/Delete only; Add inserts a section after the row\'s section', tools === 'rowAdd,rowDel' && n1 === n0 + 1, JSON.stringify({ tools, n0, n1, sec }));
    await fixture();
    await page.locator(`main.bw-doc table.toc td[data-p="${sec}/title"]`).first().click(); await page.waitForTimeout(150);
    await page.evaluate(() => window.BW.runAction('rowDel')); await page.waitForTimeout(200);
    const hid = await cnt(`${sec}/tocHidden`);
    const still = !!(await page.locator(`main.bw-doc [data-p="${sec}/title"]`).count());
    check('0.13 A25: TOC Delete hides the entry (tocHidden), the section stays in the body', hid === true && still && (await cnt(`${ch}/sections`)).length === n1, JSON.stringify({ hid, still }));
    // control table: virtual rows, materialised by its owner (WP2's materialiseControl) before the first structural op
    const rows0 = await page.evaluate(() => document.querySelectorAll(`main.bw-doc[data-locale="${window.BW.S.ed}"] table.control[data-rows="/controlTable/rows"] tr`).length);
    const cc = page.locator('main.bw-doc [data-part="control"] td[data-p]').first(); await cc.scrollIntoViewIfNeeded(); await cc.click(); await page.waitForTimeout(200);
    const ctools = await sh(page, (R) => { const c = R.querySelector('.ctx'); return c.hidden ? '' : c.dataset.cat; });
    await page.evaluate(() => window.BW.runAction('rowAdd')); await page.waitForTimeout(200);
    const rows = await cnt('/controlTable/rows');
    check('0.13 A25: control table → table tools; Add row materialises it first (WP2 materialiseControl), then adds', ctools === 'table' && rows?.length === rows0 + 1, JSON.stringify({ ctools, rows0, rows: rows?.length }));
    check('0.13 A25: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('ux run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
