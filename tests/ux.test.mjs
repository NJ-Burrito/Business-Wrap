// Shell UX check (0.10.0): the layout never flips (A1), Arabic/English parity of every control (A2), whole-field
// segmented toggles with a spring thumb (A3), the sticky selection mode (A4), hover/focus explainers (A5) and the
// page view modes (A6); 0.13 (WP1): the toolbar is mounted once and patched in place (R2/A4), explainers remember
// what was shown or pressed (A3), side panels group and close on an outside press (A7, A8), check-panel jumps (A14),
// table tools on every table (R5/A25). Headless Chrome, closed at the end. Font-independent: no check reads a Thmanyah glyph.
//
//   node tests/ux.test.mjs
import './_isolate.mjs';
import { act, rbBtn, rbTabFor } from './_ribbon.mjs';
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
    await (await rbBtn(page,'theme')).click();
    await settle(page, 500);
    ok = (await still('design panel open')) && ok;
    await page.locator('.drawer h3').first().click();
    ok = (await still('panel heading')) && ok;
    const col = page.locator('.drawer input[type="color"]').first();
    if (await col.count()) { await col.evaluate((e) => { e.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); }); await col.evaluate((e) => { e.value = '#123456'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); }
    ok = (await still('colour picker')) && ok;
    await rbTabFor(page, 'dark'); // 0.14: the View popover is the ribbon's View tab; the tab switch redraws the tools
    await settle(page, 300);
    ok = (await still('view tab (rebuild)')) && ok;
    await rbTabFor(page, 'undo');
    await page.locator('.drawer [data-k="close"]').click();
    await settle(page, 300);
    ok = (await still('panel closed')) && ok;
    check(`A4 ${ui}: a shape's tools stay through menus, pickers, the design panel, colour input, popover`, ok, kept.join(' · '));
    // a logo: selected by a click, kept while the panel is used
    await page.mouse.click(40, 700); // empty desk below the fixed 184 px ribbon (left margin: the explanation panel owns the right edge since 0.15.0): the general tools come back
    await page.keyboard.press('Control+K');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#cmdlist [data-cmd="logo"]').click()]);
    await chooser.setFiles(PNG);
    await page.waitForFunction(() => document.querySelector('main.bw-doc .bw-ov'));
    await page.mouse.click(40, 700); // empty desk
    await settle(page, 200);
    const cleared = await state(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const ovb = await page.locator('main.bw-doc .bw-ov').first().boundingBox();
    await page.mouse.click(ovb.x + ovb.width / 2, ovb.y + ovb.height / 2);
    await settle(page, 250);
    const onLogo = await state(page);
    await (await rbBtn(page,'theme')).click();
    await settle(page, 450);
    await page.locator('.drawer h3').nth(1).click();
    const afterPanel = await state(page);
    check(`A4 ${ui}: clicking a logo selects it and its tools stay (the 0.9.1 drop is gone)`, cleared.ctx === '' && onLogo.ctx === 'logo' && afterPanel.ctx === 'logo', JSON.stringify({ cleared, onLogo, afterPanel }));
    // only empty space (or Esc) brings the general tools back
    await page.mouse.click(497, 420); // empty desk between the open drawer (left) and the page; the explanation panel owns the right edge
    await settle(page, 200);
    const desk = await state(page);
    check(`A4 ${ui}: a click on empty space returns the general tools`, desk.ctx === '' && desk.selOv == null, JSON.stringify(desk));
    if (await page.evaluate(() => window.BW.S.drawer)) await page.locator('.drawer [data-k="close"]').click();
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
    await (await rbBtn(page,'save')).focus();
    await page.keyboard.press('Escape'); // nothing open: the selection leaves
    const esc = await state(page);
    check(`A4 ${ui}: Esc in the toolbar (nothing open) returns the general tools`, esc.ctx === '', JSON.stringify(esc));
    await ctx.close();
  }

  // ── A5: hover / focus explainers ───────────────────────────────────────
  {
    // the library extension (editor/ext/10-library.js) words «Save» for the 0.14 save-in-place / save-as-copy split and overrides the core sentence
    const SAVE_TXT = { ar: 'يحفظ الوثيقة في مكانها: يستبدل ملف HTML الخاص بها (ويحتفظ بالقديم في Versions) وسطرها في «المستندات»، ولا ينشئ ملفًا جديدًا. لنسخة جديدة استعمل «حفظ نسخة جديدة». بلا الخادم المحلي يُنزّل ملف التعديلات.', en: 'Saves the document in place: it overwrites its own HTML file (the old one is kept in Versions) and its Documents entry, and creates no new file. For a new file use Save as new copy. Without the local server it downloads the edits file.' };
    const keys = new Set();
    for (const ui of ['ar', 'en']) {
      const { ctx, page } = await open({ ui, width: 1366, store: { 'bw:explainers': 'always' } }); // 0.12 behaviour: every hover (0.13 «once» is checked below)
      const tools = await sh(page, (r) => [...r.querySelectorAll('.island [data-a], .pop [data-a]')].map((el) => el.dataset.a));
      tools.forEach((k) => keys.add(k));
      await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
      (await sh(page, (r) => [...r.querySelectorAll('.ctx [data-a]')].map((el) => el.dataset.a))).forEach((k) => keys.add(k));
      const card = () => sh(page, (r) => { const c = r.querySelector('.xpl'); if (!c || c.hidden) return null; const anim = [...c.querySelectorAll('svg *')].flatMap((e) => e.getAnimations()).length; return { text: c.querySelector('p').textContent, name: c.querySelector('b').textContent, anim, lang: c.lang }; });
      await (await rbBtn(page,'save')).hover();
      await page.waitForTimeout(300);
      const early = await card();
      await page.waitForTimeout(900);
      const shown = await card();
      check(`A5 ${ui}: hover ~900 ms shows the card (not at 300 ms) with its sentence and a running animation`, !early && shown && shown.text === SAVE_TXT[ui] && shown.anim > 0 && shown.lang === ui, JSON.stringify({ early, shown }));
      await page.keyboard.press('Escape');
      check(`A5 ${ui}: Esc leaves the card in the panel (0.15.0: the user closes the panel, nothing hides the card by itself)`, !!(await card()));
      await page.mouse.move(700, 600); // leave first: hovering the same spot again sends no pointerover
      await (await rbBtn(page,'save')).hover();
      await page.waitForTimeout(1150);
      const second = await card();
      await page.mouse.move(700, 600);
      await page.waitForTimeout(150);
      check(`A5 ${ui}: leaving keeps the card (reference area) and the same tool shows it again`, second?.text === SAVE_TXT[ui] && !!(await card()), JSON.stringify(second));
      // keyboard focus shows it too
      await page.keyboard.press('Tab');
      await rbTabFor(page, 'save'); await sh(page, (r) => r.querySelector('.ribbon .rb-panel [data-a="save"]').focus());
      await page.waitForTimeout(1150);
      const kb = await card();
      check(`A5 ${ui}: keyboard focus shows the card`, kb?.text === SAVE_TXT[ui], JSON.stringify(kb));
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
    // 0.13.1 final pass #5: Save and Import say what they do since H3 (save in place; import opens the file as a document)
    check('A5: Save / Import hover help describe the 0.13.1 behaviour (save in place, import opens as a document), AR + EN', /في مكانها/.test(UX.ar['explain.save']) && /in place/.test(UX.en['explain.save']) && /وثيقةً في «المستندات»/.test(UX.ar['explain.import']) && /as a document/.test(UX.en['explain.import']), JSON.stringify([UX.ar['explain.save'], UX.en['explain.import']]));
    const rm = await open({ ui: 'ar', reduced: true });
    await (await rbBtn(rm.page,'save')).hover();
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
    const mode = async (m) => { await act(page, `view.${m}`); };
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
    // the first PDF after an edit or a media switch is taken while the print layout is still settling (measured 8, 10, 9, 9 for the
    // same document), so each view gets one throw-away PDF and a pause before the one that is counted
    const takePdf = async () => { await page.pdf({ preferCSSPageSize: true, printBackground: true }); await settle(page, 600); return page.pdf({ preferCSSPageSize: true, printBackground: true }); };
    const pdfPaged = await takePdf();
    await mode('continuous');
    await settle(page, 400);
    const pdfFlow = await takePdf();
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
      await page.mouse.click(fb.x + 8, fb.y + fb.height / 2); // the empty drawing's left edge (the top corner overlaps the heading's box in a paged view; the bottom corner leaves no room to drag the new text down): diagram tools
      await page.evaluate(() => window.BW.runAction('dgText'));
      await settle(page, 300);
      const ids = await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); let o = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; for (const k of f.dataset.dg.split('/').filter(Boolean)) o = o[k]; return [o.model.nodes.find((n) => n.kind !== 'text' && n.kind !== 'group')?.id, o.model.nodes.filter((n) => n.kind === 'text').at(-1)?.id]; });
      for (const [kind, id] of [['shape', ids[0]], ['text', ids[1]]]) {
        const loc = page.locator(`main.bw-doc figure[data-dg] [data-dg-node="${id}"]`).first();
        if (!(await loc.count())) { res.push([kind, 'absent']); continue; }
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        const a = await loc.boundingBox();
        const [ddx, ddy] = kind === 'text' ? [60, 20] : [120, 40]; // a new text starts mid-drawing and the frame clamps it: in the smaller paged figure +120 px runs out of room
        await dragBy(page, loc, ddx, ddy);
        const b = await page.locator(`main.bw-doc figure[data-dg] [data-dg-node="${id}"]`).first().boundingBox();
        res.push([kind, Math.round(b.x - a.x), Math.round(b.y - a.y)]);
      }
      const bad = res.filter(([k, x, y]) => x === 'absent' || Math.abs(x - (k === 'text' ? 60 : 120)) > 2 || Math.abs(y - (k === 'text' ? 20 : k === 'shape' ? 40 : 120)) > 2);
      check(`move ${view} ${ui}: logo, image, diagram shape and free text follow a real drag (±2 px)`, !bad.length, JSON.stringify(res));
      // keyboard nudge
      await page.evaluate(() => window.scrollTo(0, 0));
      if (view !== 'continuous') { await page.keyboard.press('Home'); await page.waitForTimeout(700); }
      // the drag above can leave the logo on the page edge, where a paged view clips it (nothing to click): put it well inside the cover first
      const base = await page.evaluate(() => { const o = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.overlays[0]; window.BW.commit([{ op: 'replace', path: '/overlays/0', value: { ...o, x: 90, y: 90 }, old: o }]); return 90; });
      await settle(page, 400);
      if (view === 'continuous') { await page.locator('main.bw-doc .bw-ov[data-i="0"]').evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(250); } // the taller 0.15 ribbon pushes the logo under the bottom of the window
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
      check(`move ${view} ${ui}: arrow key nudges by 1 mm and the positions survive a reopen`, Math.abs(nudged - (base - 1)) < 0.05 && JSON.stringify(back) === JSON.stringify(keep), JSON.stringify({ ov, nudged, keep, back }));
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
    await rbTabFor(page, 'save'); const r = await sh(page, (R) => {
      const isl = R.querySelector('.island'); const out = {};
      for (const a of ['dark', 'calm', 'calm', 'snap', 'view', 'view', 'uiLang', 'dir', 'dark']) { window.BW.runAction(a); out[a] = R.querySelector('.island') === isl; }
      return { out, ui: window.BW.S.ui, lang: R.querySelector('.shell').lang, save: R.querySelector('.ribbon .rb-panel [data-a="save"] .w').textContent };
    });
    check('0.13 R2: island same node through toggles', Object.values(r.out).every(Boolean), JSON.stringify(r));
    check('0.13 R2: language words follow in place', r.ui === 'en' && r.lang === 'en' && /Save/i.test(r.save), JSON.stringify(r));
    // animations after a real RTL->LTR click (the logo's own idle loops, A22, run by design and are not counted)
    await page.evaluate(() => window.BW.runAction('uiLang')); await page.waitForTimeout(600);
    await rbTabFor(page, 'dir', 'ltr'); // the direction switch is on the View tab: open it first, as a person would
    await page.waitForTimeout(900); // the tab walk above plays the tools' entrance motion; let it end before the press is observed
    const btn = page.locator('.island [data-a="dir"][data-d="ltr"]');
    await btn.click();
    const anims = await sh(page, async (R) => { const seen = new Set(); const t0 = performance.now(); while (performance.now() - t0 < 600) { R.getAnimations().forEach((a) => { const el = a.effect?.target; if (el && !el.closest?.('.brand, .xpl-dock')) seen.add((el.className?.baseVal ?? el.className) + '@' + (el.closest('[data-x]')?.dataset.x || el.dataset?.a || el.tagName)); }); await new Promise((r) => setTimeout(r, 40)); } return [...seen]; });
    // 0.14: the ribbon's own tools (buttons, their icons, the panel) re-seat when the page direction flips, and the pressed button plays its hover
    // motion; nothing outside the ribbon panel may animate, and the direction thumb must (R15: the positive sample)
    check('0.13 A4: after RTL→LTR only the direction thumb and the ribbon panel own tools animate', anims.length >= 1 && anims.some((x) => x === 'thumb@dir') && anims.filter((x) => !/^toast/.test(x)).every((x) => /^(thumb@dir|b@[\w.-]+|ic@svg|@path|rb-panel[\w ]*@DIV)$/.test(x)), JSON.stringify(anims));
    const xpl = await sh(page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    check('0.15 A4: the explanation panel is still in place after the press (its card is a reference, it stays)', await sh(page, (R) => !!R.querySelector('.xpl-dock .xd-h')));
    check('0.13 R2: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // 0.13 A3
    const { ctx, page } = await open({ width: 1440, height: 900 });
    const card = () => sh(page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    await page.mouse.move(700, 600);
    const save = (await rbBtn(page,'save'));
    const t0 = Date.now(); await save.hover();
    let at = -1; while (Date.now() - t0 < 1600) { if (await card()) { at = Date.now() - t0; break; } await page.waitForTimeout(30); }
    check('0.15 A3: first hover shows the card at about 400 ms (owner note 10)', at >= 330 && at <= 1000, String(at));
    await page.mouse.move(700, 600); await page.waitForTimeout(700);
    await save.hover(); await page.waitForTimeout(1200);
    check('0.15 A3: second hover: the card shows again (no seen-memory)', await card());
    await page.mouse.move(700, 600);
    const und = (await rbBtn(page,'newdoc'));
    await und.click(); await page.mouse.move(700, 600); await page.keyboard.press('Escape'); await und.hover(); await page.waitForTimeout(1500);
    check('0.15 A3: a pressed tool, hovered again: the card shows', await card());
    await ctx.close();
    const al = await open({ width: 1440, height: 900, store: { 'bw:explainers': 'always' } });
    const c2 = () => sh(al.page, (R) => { const c = R.querySelector('.xpl'); return !!c && !c.hidden; });
    await al.page.mouse.move(700, 600); await (await rbBtn(al.page,'save')).hover(); await al.page.waitForTimeout(1200); const a1 = await c2();
    await al.page.mouse.move(700, 600); await al.page.waitForTimeout(200); await (await rbBtn(al.page,'save')).hover(); await al.page.waitForTimeout(1200); const a2 = await c2();
    check('0.15 A3: the old "always" setting is simply the new behaviour (repeat shows)', a1 && a2, JSON.stringify({ a1, a2 }));
    await al.ctx.close();
  }
  { // 0.13 A7
    const { ctx, page } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => window.BW.runAction('settings')); await page.waitForTimeout(500);
    const first = (a) => a.length >= 2 && a.every((x) => x === false); // F2 · 11: every group collapsed on open
    const g = await sh(page, (R) => [...R.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
    check('F2 11: Settings opens with every group collapsed (local learning too)', g.length >= 3 && first(g), JSON.stringify(g));
    // the Design and Process panels follow the same rule (the owner asked for all side panels)
    await page.evaluate(() => window.BW.openDrawer('theme')); await page.waitForTimeout(300);
    const gd = await sh(page, (R) => [...R.querySelectorAll('.drawer details.dgrp')].map((d) => d.open));
    await page.evaluate(() => window.BW.openDrawer('process')); await page.waitForTimeout(300);
    const gp = await sh(page, (R) => [...R.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
    check('F2 11: the Design panel opens with every group collapsed (the Process panel: harvest.test, with a model)', gd.length >= 6 && first(gd) && (gp.length < 2 || first(gp)), JSON.stringify({ gd, gp }));
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
      await page.mouse.click(760, 600); await page.waitForTimeout(300);
      const afterOut = await page.evaluate(() => window.BW.S.drawer);
      res.push(`${k}:${opened}/${afterIn}/${afterOut}`);
      if (afterOut) await page.evaluate(() => { const d = window.BW.S.drawer; if (window.BW.hasAction(d)) window.BW.runAction(d); else document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="close"]')?.click(); }); // 0.15.0: runAction throws on an id that is not a command (the style drawer is not one)
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
  // ── F2 (acceptance review 0.13.0): the owner flows that broke ─────────────────────────────────────────────
  { // F2 · 24 + 18: insert an image after a paragraph, move that paragraph down twice: no error, the pair keeps one shape
    const { ctx, page, errors } = await open({ width: 1366, height: 860 });
    const P0 = '/chapters/0/sections/0/blocks/0';
    await page.locator(`main.bw-doc[data-locale="ar"] [data-b="${P0}"]`).first().click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => { window.BW.runAction('image'); })]);
    await fc.setFiles(PNG); await page.waitForTimeout(500);
    const ins = await page.evaluate(() => { const B = window.BW; const a = B.M[B.S.svc].ar.doc, e = B.M[B.S.svc].en.doc; return { a: (a.overlays || []).length, e: (e.overlays || []).length, wrap: (a.overlays || []).at(-1)?.wrap, selOv: B.S.selOv }; });
    const wrapTools = await sh(page, (R) => [...R.querySelectorAll('.island .sec[data-cat="wrap"] [data-a]')].map((x) => x.dataset.a));
    check('F2 18: «إدراج صورة» goes the dropped image\'s way: an overlay in both editions, the seven wrap tools shown', ins.a === ins.e && ins.a >= 1 && ins.wrap === 'square' && wrapTools.filter((x) => /^wrap/.test(x)).length === 7, JSON.stringify({ ins, wrapTools }));
    await page.evaluate((p) => { window.BW.S.sel = { b: p, p: null, ed: 'ar' }; window.BW.S.selOv = null; }, P0);
    for (let k = 0; k < 2; k += 1) { await page.evaluate(() => window.BW.runAction('moveDown')); await page.waitForTimeout(200); }
    await page.locator('main.bw-doc[data-locale="ar"] .wrap [data-p]').nth(3).click(); await page.waitForTimeout(150);
    const after = await page.evaluate(() => { const B = window.BW; const sh = (d) => JSON.stringify(d.chapters.map((c) => c.sections.map((s) => s.blocks.map((b) => b?.kind ?? null)))); const a = sh(B.M[B.S.svc].ar.doc), e = sh(B.M[B.S.svc].en.doc); return { same: a === e, holes: /null/.test(a + e), parity: document.documentElement.dataset.bwParity || '' }; });
    check('F2 24: image, then «لأسفل» twice: no page error, no hole, the AR/EN pair keeps one shape (parity ok)', !errors.length && after.same && !after.holes && after.parity !== 'drift', JSON.stringify({ errors, ...after }));
    // the parity assertion: a structural op on one edition only is reported, never silent
    const drift = await page.evaluate(() => { const B = window.BW; B.commit([{ op: 'insert', path: '/chapters/0/sections/0/blocks/0', value: { kind: 'prose', paragraphs: ['x'] } }], { mirror: false }); const d = document.documentElement.dataset.bwParity; B.undo(); return d; });
    check('F2 24: a structural op left unmirrored on purpose trips the parity assertion', drift === 'drift', String(drift));
    // a mirrored move from a slot the other edition does not have is refused for the mirror (no undefined block)
    const hole = await page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc].en.doc; const n = e.chapters[0].sections[0].blocks.length; B.commit([{ op: 'insert', path: '/chapters/0/sections/0/blocks/0', value: { kind: 'prose', paragraphs: ['only ar'] } }], { mirror: false }); B.S.sel = { b: `/chapters/0/sections/0/blocks/${n}`, p: null, ed: 'ar' }; B.A.move(1); return e.chapters.flatMap((c) => c.sections.flatMap((s) => s.blocks.map((b) => b?.kind))).every(Boolean); });
    check('F2 24: a mirrored move from a slot the other edition lacks never writes an undefined block', hole === true);
    await ctx.close();
  }
  { // F2 · 28: «نطاق العنصر» on a header item, with no block selected: applies to the page, toast only when it did
    const { ctx, page, errors } = await open({ width: 1366, height: 860 });
    await page.evaluate(() => window.BW.EXT.w2chrome.add('header', { kind: 'text', value: 'ONLYHERE' }));
    await page.waitForTimeout(200);
    await page.locator('#bw-pair .w2-strip [data-ci^="header:"]', { hasText: 'ONLYHERE' }).first().click(); await page.waitForTimeout(150);
    await page.evaluate(() => { window.BW.S.sel = null; });
    await page.evaluate(() => window.BW.runAction('hdrScope')); await page.waitForTimeout(250);
    const r = await page.evaluate(() => { const B = window.BW; const x = B.M[B.S.svc][B.S.ed].doc.chrome.header.items.find((i) => i.value === 'ONLYHERE'); return { scope: x.scope, anchor: !!x.anchor }; });
    const toasts = await sh(page, (R) => [...R.querySelectorAll('.toasts .toast .m')].map((x) => x.textContent));
    check('F2 28: «هذه الصفحة فقط» applies with no block selected (anchored), no «حدّد كتلة» toast', r.scope === 'only' && r.anchor && !toasts.some((x) => /حدّد كتلة|Select a block/.test(x)) && toasts.some((x) => /هذه الصفحة فقط|this page only/.test(x)), JSON.stringify({ r, toasts }));
    check('F2 28: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // F2 · 17 + extra 3 + extra 9: every check finding jumps; a section jump rings the BODY heading, never the TOC row
    const { ctx, page, errors } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => {
      const B = window.BW; const d = B.M[B.S.svc][B.S.ed].doc;
      const find = (pred) => { for (let i = 0; i < d.chapters.length; i += 1) for (let j = 0; j < d.chapters[i].sections.length; j += 1) { const k = d.chapters[i].sections[j].blocks.findIndex(pred); if (k >= 0) return `/chapters/${i}/sections/${j}/blocks/${k}`; } return null; };
      const tb = find((b) => b.kind === 'table' && b.rows.some((r) => String(r[0]) === 'BR-02'));
      const rows = tb.split('/').slice(1).reduce((o, k) => o[k], d).rows;
      B.setText(`${tb}/rows/${rows.findIndex((x) => x[0] === 'BR-02')}/0`, 'BR-01'); // a duplicate code (extra 9)
      const st = find((b) => b.kind === 'stories');
      B.commit([{ op: 'replace', path: `${st}/items/0/acceptance`, value: [], old: undefined }]); // a story without criteria
      B.commit([{ op: 'replace', path: '/chapters/0/sections/1/blocks', value: [], old: undefined }]); // an empty section
      B.render(); B.runAction('check');
    });
    await page.waitForTimeout(400);
    const rows = await sh(page, (R) => [...R.querySelectorAll('.drawer .list > li')].map((li) => ({ t: li.textContent.trim().slice(0, 70), go: li.querySelector('.jump')?.dataset.go || '' })));
    check('F2 17/extra 3: every check finding row has a jump (logo slots and labels included)', rows.length >= 3 && rows.every((x) => x.go), JSON.stringify(rows));
    check('F2 extra 9: a duplicate BR code and a story without acceptance criteria are listed', rows.some((x) => /BR-01/.test(x.t) && /مكرر|Duplicate/.test(x.t)) && rows.some((x) => /معايير قبول|acceptance/.test(x.t)), JSON.stringify(rows.map((x) => x.t)));
    await page.locator('.drawer .jump[data-go="/chapters/0/sections/1/title"]').first().click(); await page.waitForTimeout(300);
    const ring = await page.evaluate(() => { const el = document.querySelector('main.bw-doc .bw-jump'); return el ? { toc: !!el.closest('table.toc, .toc'), p: el.dataset.p || el.closest('[data-p]')?.dataset.p } : null; });
    check('F2 17: the jump rings the section heading in the body, not its TOC row', !!ring && !ring.toc && ring.p === '/chapters/0/sections/1/title', JSON.stringify(ring));
    await page.evaluate(() => window.BW.openDrawer('check')); await page.waitForTimeout(300);
    await page.locator('.drawer .jump[data-go="#logos"]').first().click(); await page.waitForTimeout(300);
    const lg = await page.evaluate(() => !!document.querySelector('main.bw-doc .cover .bw-jump, main.bw-doc .cover.bw-jump'));
    check('F2 extra 3: the logo-slot finding rings the cover\'s logo slots', lg);
    check('F2 17: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // F2 · extra 10: delete a block → «تراجع» for 5 s; the press restores the block and the change counter
    const { ctx, page, errors } = await open({ width: 1366, height: 860 });
    const before = await page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; B.S.sel = { b: '/chapters/0/sections/0/blocks/0', p: null, ed: B.S.ed }; return { ops: e.ops.length, blk: JSON.stringify(e.doc.chapters[0].sections[0].blocks[0]) }; });
    // 0.13: Delete on a block asks which scope (28-scope.js); a person picks «block» in the menu
    const pickBlock = () => sh(page, (R) => { const b = R.querySelector('.dialog [data-scope="block"]'); b?.click(); return !!b; });
    await page.evaluate(() => window.BW.runAction('delete')); await page.waitForTimeout(300);
    const menu = await pickBlock(); await page.waitForTimeout(200);
    const btn = await sh(page, (R) => R.querySelector('.toasts .toast.undo button')?.textContent || '');
    await page.mouse.move(5, 500); await page.waitForTimeout(3500);
    const still = await sh(page, (R) => !!R.querySelector('.toasts .toast.undo:not(.out) button'));
    await sh(page, (R) => R.querySelector('.toasts .toast.undo button').click()); await page.waitForTimeout(200);
    const back = await page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; return { ops: e.ops.length, blk: JSON.stringify(e.doc.chapters[0].sections[0].blocks[0]) }; });
    check('F2 extra 10: delete → «تراجع» toast still there after 3.5 s; the press restores the block and the counter', menu && /تراجع|Undo/.test(btn) && still && back.ops === before.ops && back.blk === before.blk, JSON.stringify({ btn, still, before: before.ops, back: back.ops, same: back.blk === before.blk }));
    const gone = await page.evaluate(async () => { const B = window.BW; B.S.sel = { b: '/chapters/0/sections/0/blocks/0', p: null, ed: B.S.ed }; B.runAction('delete'); await new Promise((r) => setTimeout(r, 300)); const R = document.getElementById('bw-ui-host').shadowRoot; R.querySelector('.dialog [data-scope="block"]')?.click(); await new Promise((r) => setTimeout(r, 200)); const shown = !!R.querySelector('.toasts .toast.undo:not(.out)'); await new Promise((r) => setTimeout(r, 5700)); return shown && !R.querySelector('.toasts .toast.undo:not(.out)'); });
    check('F2 extra 10: the undo toast shows, then leaves after 5 s', gone);
    check('F2 extra 10: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  { // F2 · 11 + 38: primary actions in the panel header, field-group shades, one chevron convention, banners follow the UI language
    const { ctx, page, errors } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => window.BW.openDrawer('theme')); await page.waitForTimeout(300);
    check('F2 11: a primary action of a collapsed group sits in the panel header (Design: logo)', await sh(page, (R) => !!R.querySelector('.drawer > header .hact [data-k="logoAdd"]')));
    await sh(page, (R) => { R.querySelector('.drawer details[data-grp="sizes"]').open = true; });
    const bg = await sh(page, (R) => { const v = [...R.querySelectorAll('.drawer details[data-grp="sizes"] > .vc')]; const pan = getComputedStyle(R.querySelector('.drawer')).backgroundColor; const solid = (c) => (/rgba\(.*,\s*0\)$/.test(c) ? pan : c); return [solid(getComputedStyle(v[0]).backgroundColor), solid(getComputedStyle(v[1]).backgroundColor), getComputedStyle(v[0].querySelector('.vc-l')).color]; });
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    check('F2 11: Design field rows alternate their shade, text contrast ≥ 4.5:1 on both', bg[0] !== bg[1] && ratio(bg[2], bg[0]) >= 4.5 && ratio(bg[2], bg[1]) >= 4.5, JSON.stringify(bg));
    const chev = async (ui) => {
      await page.evaluate((u) => { if (window.BW.S.ui !== u) window.BW.runAction('uiLang'); }, ui); await page.waitForTimeout(300);
      await page.evaluate(() => window.BW.openDrawer('settings')); await page.waitForTimeout(300);
      return sh(page, async (R) => { const d = R.querySelector('.drawer details.pgrp'); const tr = () => getComputedStyle(d.querySelector('summary'), '::before').transform; const wait = () => new Promise((r) => setTimeout(r, 450)); d.open = false; await wait(); const c = tr(); d.open = true; await wait(); const o = tr(); d.open = false; return { c, o }; });
    };
    const ang = (m) => { const [a, b] = m.slice(m.indexOf('(') + 1).split(',').map(Number); return Math.round((Math.atan2(b, a) * 180) / Math.PI); };
    const ar = await chev('ar'); const en = await chev('en');
    check('F2 38: chevrons: open points down in both; collapsed points ‹ in Arabic and › in English', ang(ar.o) === 45 && ang(en.o) === 45 && ang(ar.c) === 135 && ang(en.c) === -45, JSON.stringify({ ar, en }));
    // a live banner follows the UI language switch (no Arabic banner in the English UI)
    await page.evaluate((m) => { window.BW.toast(m, 'info', { persist: true, actions: [[m, () => {}]] }); }, UX.en['ux.jump']);
    await page.evaluate(() => window.BW.runAction('uiLang')); await page.waitForTimeout(300); // en → ar
    const words = await sh(page, (R) => [...R.querySelectorAll('.toasts .toast :is(.m, button)')].map((x) => x.textContent));
    check('F2 38: a live banner is retranslated on a UI language switch', words.length >= 2 && words.every((w) => w !== UX.en['ux.jump']) && words.includes(UX.ar['ux.jump']), JSON.stringify(words));
    // the relaunch prompt (12-session.js puts a dialog.bw-resume on the shadow root, outside .shell): the house face and buttons
    const dlg = await sh(page, (R) => { const d = document.createElement('dialog'); d.className = 'bw-resume'; d.innerHTML = '<h2>x</h2><ol class="list"><li>a</li><li>b</li></ol><div class="btns"><button type="button" class="b primary">go</button></div>'; R.appendChild(d); d.showModal(); const cs = getComputedStyle(d); const b = getComputedStyle(d.querySelector('.b.primary')); const out = { font: cs.fontFamily, bg: cs.backgroundColor, btn: b.backgroundColor, row2: getComputedStyle(d.querySelectorAll('li')[1]).backgroundColor }; d.close(); d.remove(); return out; });
    check('F2 38: the relaunch dialog takes the house face, surface, gold primary button and row shades', /Thmanyah/i.test(dlg.font) && dlg.bg !== 'rgba(0, 0, 0, 0)' && dlg.btn !== 'rgba(0, 0, 0, 0)' && dlg.row2 !== 'rgba(0, 0, 0, 0)', JSON.stringify(dlg));
    // F5 · 4: in dark mode the dialog takes the dark tokens (data-theme like the shell), text ≥ 4.5:1 on its surface and button
    const dk = await sh(page, (R) => { const d = document.createElement('dialog'); d.className = 'bw-resume'; d.dataset.theme = 'dark'; d.innerHTML = '<h2>x</h2><p>y</p><div class="btns"><button type="button" class="b primary">go</button><button type="button" class="b">no</button></div>'; R.appendChild(d); d.showModal(); const cs = getComputedStyle(d); const p = getComputedStyle(d.querySelector('.b.primary')); const b = getComputedStyle(d.querySelector('.b:not(.primary)')); const out = { bg: cs.backgroundColor, ink: cs.color, pbg: p.backgroundColor, pink: p.color, bink: b.color }; d.close(); d.remove(); return out; });
    check('F5 4: the relaunch dialog in dark mode: a dark surface, text and buttons ≥ 4.5:1', lum(dk.bg) < 0.2 && ratio(dk.ink, dk.bg) >= 4.5 && ratio(dk.pink, dk.pbg) >= 4.5 && ratio(dk.bink, dk.bg) >= 4.5, JSON.stringify(dk));
    check('F2 38: no page errors', !errors.length, errors.join(' | '));
    await ctx.close();
  }
  // ── H2 (0.13.1, owner 2026-10-29): side-panel buttons are bordered pills with hover, press and focus; danger tone;
  //    contrast ≥ 4.5:1 light + dark; calm / reduced motion = still. The header/footer strip is never under a panel.
  {
    const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x = +x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const pills = (page) => sh(page, (R) => [...R.querySelectorAll('.drawer :is(.b, .btns > button)')].filter((b) => b.offsetWidth && !b.classList.contains('primary')).map((b) => {
      const cs = getComputedStyle(b);
      return { k: b.dataset.lrn || b.dataset.lib || b.textContent.trim().slice(0, 18), bw: parseFloat(cs.borderTopWidth), bc: cs.borderTopColor, r: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, ink: cs.color, card: getComputedStyle(b.closest('.card') || b.closest('.drawer')).backgroundColor, tr: cs.transitionDuration };
    }));
    const openSettings = async (page) => { await page.evaluate(() => window.BW.openDrawer('settings')); await settle(page, 500); await sh(page, (R) => R.querySelectorAll('.drawer details').forEach((d) => { d.open = true; })); await settle(page, 300); };
    for (const dark of [false, true]) {
      const { ctx, page, errors } = await open({ ui: 'ar', width: 1500 });
      if (dark) { await page.evaluate(() => window.BW.runAction('dark')); await settle(page, 300); }
      await openSettings(page);
      const ps = await pills(page);
      const bad = ps.filter((x) => !(x.bw >= 1 && x.r >= 12 && x.bc !== x.bg && ratio(x.ink, x.bg) >= 4.5));
      check(`H2 panel buttons (${dark ? 'dark' : 'light'}): ${ps.length} Settings buttons are bordered pills, text ≥ 4.5:1`, ps.length >= 5 && !bad.length, JSON.stringify(bad.slice(0, 3)));
      const forget = ps.find((x) => x.k === 'forget');
      const sig = await sh(page, (R) => getComputedStyle(R.querySelector('.shell')).getPropertyValue('--bw-signal').trim());
      check(`H2 panel buttons (${dark ? 'dark' : 'light'}): «امسح كل ما تعلّمته» in the danger tone, ≥ 4.5:1`, !!forget && forget.ink === forget.bc && ratio(forget.ink, forget.bg) >= 4.5, JSON.stringify({ forget, sig }));
      if (!dark) {
        const target = await sh(page, (R) => { const b = R.querySelector('.drawer [data-lrn="rules"]'); b.scrollIntoView({ block: 'center' }); return getComputedStyle(b).backgroundColor; });
        await page.locator('.drawer [data-lrn="rules"]').hover();
        await settle(page, 350);
        const hov = await sh(page, (R) => { const cs = getComputedStyle(R.querySelector('.drawer [data-lrn="rules"]')); return { bg: cs.backgroundColor, ink: cs.color }; });
        check('H2 panel buttons: hover changes the fill (the segmented control\'s wash) and keeps ≥ 4.5:1', hov.bg !== target && ratio(hov.ink, hov.bg) >= 4.5, JSON.stringify({ target, hov }));
        check('H2 panel buttons: they move (transition) when motion is allowed', ps.every((x) => x.tr.split(',').some((d) => parseFloat(d) > 0)), JSON.stringify(ps.map((x) => x.tr).slice(0, 2)));
        // the header/footer strip never sits under the open panel, and no strip item overflows its box
        const strip = await page.evaluate(() => { const s = document.querySelector('#bw-pair .w2-strip'); if (!s) return null; const r = s.getBoundingClientRect(); return { l: r.left, r: r.right, over: [...s.querySelectorAll('.bw-band > *')].filter((x) => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().left < r.left - 1 || x.getBoundingClientRect().right > r.right + 1).length }; });
        const dr = await sh(page, (R) => { const r = R.querySelector('.drawer').getBoundingClientRect(); return { l: r.left, r: r.right }; });
        check('H2 header strip: with Settings open at 1500 px the strip (and the page) is beside the panel, nothing clipped', !!strip && (strip.l >= dr.r || strip.r <= dr.l) && strip.over === 0, JSON.stringify({ strip, dr }));
        await page.evaluate(() => window.BW.closeDrawer?.() ?? window.BW.runAction('settings'));
        await settle(page, 700);
        const back = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bw-room-l').trim());
        check('H2 header strip: the page returns to the middle when the panel closes', back === '0px', back);
      }
      check(`H2 panel buttons (${dark ? 'dark' : 'light'}): no page errors`, !errors.length, errors.join(' | '));
      await ctx.close();
    }
    const rm = await open({ ui: 'ar', width: 1500, reduced: true });
    await openSettings(rm.page);
    const still = (await pills(rm.page)).filter((x) => x.tr.split(',').some((d) => parseFloat(d) > 0));
    check('H2 panel buttons: reduced motion = no transition', !still.length, JSON.stringify(still.slice(0, 2)));
    await rm.ctx.close();
  }
  { // 0.13.1 final pass #4: every toolbar and panel button carries an icon (and every icon this pass added has its own move)
    const { ctx, page, errors } = await open({ ui: 'ar', width: 1920, height: 1000 });
    await page.evaluate(() => window.BW.runAction('save')); // a documents-list row (open, tab, copy, template, delete)
    await settle(page, 1200);
    const scan = () => sh(page, (R) => {
      const words = window.BW.EXT.buttonIcons.words;
      return [...R.querySelectorAll('.island button, .drawer button')].filter((b) => !b.closest('.dialog, .toasts') && !b.matches(words) && !b.querySelector('svg'))
        .map((b) => `${b.closest('.drawer') ? 'panel' : 'toolbar'}:${Object.entries(b.dataset).map(([k, v]) => `${k}=${v}`).join(',')} «${b.textContent.trim().slice(0, 24)}»`);
    });
    const bare = new Set(await scan());
    const added = new Set(); // the icons this pass put on panel buttons (42-button-icons.js), seen across the panels
    for (const d of ['check', 'library', 'timeline', 'bulk', 'provenance', 'settings', 'style', 'theme', 'history', 'find', 'process', 'w2page', 'webhooks']) {
      await page.evaluate((d) => window.BW.openDrawer(d), d);
      await settle(page, 250);
      for (const x of await scan()) bare.add(`${d} ${x}`);
      for (const k of await sh(page, (R) => [...R.querySelectorAll('.bi-i .ic[data-ic]')].map((s) => s.dataset.ic))) added.add(k);
    }
    check('icons: no toolbar or panel button is words only (palette import, profile, compare, template, check jump, documents, changes …)', !bare.size, [...bare].join(' | '));
    const still = await sh(page, (R, keys) => {
      const css = [...R.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      return { n: keys.length, still: keys.filter((k) => !css.includes(`[data-ic="${k}"] >`)) };
    }, [...added]);
    check('icons: every icon added by the final pass has its own hover / focus / press move', still.n > 0 && !still.still.length, JSON.stringify(still));
    check('icons: no page errors', !errors.length, errors.join(' | '));
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
