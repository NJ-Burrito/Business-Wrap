// 0.15.0 lane "look" (UI/UX lane B): note 8 top-bar spacing, note 11 drawers from the top, note 13 the backdrop, note 14 the dim navy dark
// mode (every pair re-measured from the shipped CSS in the real editor, R16), and the perf boosters 1, 2 and 5 (hover motion, idle mark,
// scoped button-icon decoration). Headless Chrome, closed at the end. Every probe first asserts that it looked (R15): the ribbon, the bar and
// the elements it measures exist before a gate may pass.
//
//   node tests/look-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'look');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
const URL = pathToFileURL(file).href;

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
};
const browser = await chromium.launch(launchOptions());
async function open({ ui = 'ar', width = 1366, height = 768, dark = false, calm = false, reduced = false, collapsed = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([u, d, c, col]) => {
    try {
      if (!sessionStorage.getItem('bw-test-init')) {
        sessionStorage.setItem('bw-test-init', '1');
        localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', c ? '1' : '0'); localStorage.setItem('bw:rb:c', col ? '1' : '0');
      }
    } catch {}
  }, [ui, dark, calm, collapsed]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
const edges = (page) => sh(page, (r) => {
  const b = (s) => { const e = r.querySelector(s); if (!e || !e.offsetWidth) return null; const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, t: x.top, b: x.bottom, w: x.width, h: x.height }; };
  return { isl: b('.island'), brand: b('.island > .brand'), pick: b('.grp.doc select'), lang: b('.seg.lang'), dir: b('.seg.ui'), status: b('.island > .status .count'), ribbon: b('.island > .ribbon') };
});
// the gap between two boxes on the same row, whatever the reading direction: the distance between their nearest vertical edges
const gap = (a, b) => Math.round(Math.max(a.l - b.r, b.l - a.r) * 10) / 10;

try {
  // ── note 8: top-bar spacing, both languages, 1280 and 1366 ──────────────────────────────────────────
  for (const ui of ['ar', 'en']) {
    for (const width of [1280, 1366]) {
      const { ctx, page, errors } = await open({ ui, width });
      const e = await edges(page);
      const seen = !!(e.isl && e.brand && e.pick && e.lang && e.dir && e.status && e.ribbon);
      check(`${ui} ${width} note 8: the bar, its controls and the ribbon were all found (the probe looked)`, seen, JSON.stringify(Object.keys(e).filter((k) => !e[k])));
      if (seen) {
        check(`${ui} ${width} note 8: the mark is 40 x 40`, Math.round(e.brand.w) === 40 && Math.round(e.brand.h) === 40, `${e.brand.w}x${e.brand.h}`);
        const g = [gap(e.brand, e.pick), gap(e.pick, e.lang), gap(e.lang, e.dir), gap(e.dir, e.status)];
        check(`${ui} ${width} note 8: gaps mark/selector/language/direction/history are 16 / 24 / 12 / 24 (+-1)`, [16, 24, 12, 24].every((v, i) => Math.abs(g[i] - v) <= 1), g.join(' / '));
        check(`${ui} ${width} note 8: the language and direction pills do not overlap`, e.lang.r <= e.dir.l || e.dir.r <= e.lang.l);
        const rows = await sh(page, (r) => { const ys = ['.island > .brand', '.grp.doc select', '.seg.lang', '.seg.ui', '.island > .status .count'].map((s) => Math.round(r.querySelector(s).getBoundingClientRect().top / 40)); return new Set(ys).size; });
        check(`${ui} ${width} note 8: nothing wraps to a second row in the quick strip`, rows === 1, String(rows));
        const clipped = await sh(page, (r) => { const i = r.querySelector('.island'); return i.scrollWidth > i.clientWidth + 1; });
        check(`${ui} ${width} note 8: the bar does not clip or scroll sideways`, !clipped);
      }
      check(`${ui} ${width} note 8: no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
      await ctx.close();
    }
  }

  // ── note 11: drawers hang from the top bar, ribbon expanded and folded ──────────────────────────────
  for (const collapsed of [false, true]) {
    const { ctx, page, errors } = await open({ ui: 'en', collapsed });
    const e0 = await edges(page);
    check(`note 11 (${collapsed ? 'folded' : 'open'} ribbon): the bar was found`, !!e0.isl);
    for (const d of ['settings', 'history', 'outline', 'check', 'find']) {
      await page.evaluate((x) => window.BW.runAction(x), d);
      await page.waitForTimeout(450);
      const m = await sh(page, (r) => { const dr = r.querySelector('.drawer:not([hidden])'); const i = r.querySelector('.island'); if (!dr) return null; const a = dr.getBoundingClientRect(); const b = i.getBoundingClientRect(); return { top: a.top, bottom: a.bottom, barBottom: b.bottom, vh: innerHeight }; });
      if (!m) { check(`note 11: drawer ${d} opened`, false); continue; }
      check(`note 11 (${collapsed ? 'folded' : 'open'}): ${d} drawer top = bar bottom + 8 (+-2)`, Math.abs(m.top - (m.barBottom + 8)) <= 2, `${m.top} vs ${m.barBottom + 8}`);
      check(`note 11 (${collapsed ? 'folded' : 'open'}): ${d} drawer bottom is 12 px above the viewport bottom`, Math.abs(m.vh - m.bottom - 12) <= 2, `${m.vh - m.bottom}`);
    }
    if (collapsed) {
      const m = await sh(page, (r) => { const dr = r.querySelector('.drawer:not([hidden])'); return dr ? dr.getBoundingClientRect().top : null; });
      check('note 11: with the ribbon folded a drawer starts above 120 px at 1366 x 768', m !== null && m < 120, String(m));
    }
    // fold and unfold with a drawer open (the last one, find): the drawer follows the bar both ways (the stale --bw-bar-h cause)
    const before = await sh(page, (r) => r.querySelector('.drawer:not([hidden])')?.getBoundingClientRect().top ?? null);
    await sh(page, (r) => (r.querySelector('.rb-col') || r.querySelector('[data-rb="collapse"]'))?.click());
    await page.waitForTimeout(500);
    const after = await sh(page, (r) => ({ top: r.querySelector('.drawer:not([hidden])')?.getBoundingClientRect().top ?? null, bar: r.querySelector('.island').getBoundingClientRect().bottom }));
    check(`note 11 (${collapsed ? 'folded' : 'open'}): folding or unfolding the ribbon moves the open drawer with the bar`, after.top !== null && Math.abs(after.top - (after.bar + 8)) <= 2 && (before === null || Math.abs(after.top - before) > 20), `${before} -> ${after.top}, bar ${after.bar}`);
    const anim = await sh(page, (r) => { const dr = r.querySelector('.drawer:not([hidden])'); const a = dr.getAnimations().find((x) => x.animationName === 'drawer-in'); const k = a ? a.effect.getKeyframes() : []; return { found: !!a, ms: a ? a.effect.getTiming().duration : 0, props: [...new Set(k.flatMap((f) => Object.keys(f)))].filter((p) => !['offset', 'easing', 'composite', 'computedOffset'].includes(p)) }; });
    check('note 11: the drawer opens in 260 ms from its top edge (clip-path + a short drop + opacity)', anim.found && Math.round(anim.ms) === 260 && ['clipPath', 'transform', 'opacity'].every((p) => anim.props.includes(p)), JSON.stringify(anim));
    check(`note 11 (${collapsed ? 'folded' : 'open'}): no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── note 13 (reworked in 0.15.2, note 1): the backdrop is a static drafting-grid layer ─────────────────────
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  for (const dark of [false, true]) {
    const { ctx, page, errors } = await open({ ui: 'en', dark });
    const tag = dark ? 'dark' : 'light';
    const bd = await page.evaluate(() => {
      const el = document.getElementById('bw-backdrop'); if (!el) return null;
      const cs = getComputedStyle(el);
      const px = (c) => { const k = document.createElement('canvas'); k.width = k.height = 1; const g = k.getContext('2d'); g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
      const desk = px(getComputedStyle(document.documentElement).backgroundColor);
      const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      return {
        pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, first: document.body.firstElementChild === el, aria: el.getAttribute('aria-hidden'),
        line: px(cs.getPropertyValue('--bd-line').trim()), fine: px(cs.getPropertyValue('--bd-fine').trim()), desk, hitInside: el.contains(hit) || hit === el, hitTag: hit?.tagName + '#' + (hit?.id || ''),
        anims: document.getAnimations().filter((a) => el.contains(a.effect?.target) || a.effect?.target === el).length, name: cs.animationName, bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    check(`note 13 (${tag}): #bw-backdrop exists as the body's first child, aria-hidden, fixed, z-index -1, no pointer events`, !!bd && bd.first && bd.aria === 'true' && bd.pos === 'fixed' && bd.z === '-1' && bd.pe === 'none', JSON.stringify(bd));
    if (bd) {
      check(`note 13 (${tag}): clicking the desk at its centre hits the desk, not the backdrop`, !bd.hitInside, bd.hitTag);
      check(`note 13 (${tag}): the body is transparent so the backdrop shows through`, bd.bodyBg === 'rgba(0, 0, 0, 0)', bd.bodyBg);
      const over = (c, d) => { const a = c[3] / 255; return [0, 1, 2].map((i) => c[i] * a + d[i] * (1 - a)); };
      const rl = ratio(over(bd.line, bd.desk), bd.desk), rf = ratio(over(bd.fine, bd.desk), bd.desk);
      check(`note 13 (${tag}): the major line is decorative, contrast over the desk 1.04 to 1.25 (${rl.toFixed(3)}), the fine line quieter (${rf.toFixed(3)})`, rl <= 1.25 && rl >= 1.04 && rf >= 1.01 && rf < rl, `${rl} ${rf}`);
      check(`note 13 (${tag}): it is static: no animation at all (idle cost nothing)`, bd.anims === 0 && bd.name === 'none', JSON.stringify({ anims: bd.anims, name: bd.name }));
    }
    check(`note 13 (${tag}): no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  { // the backdrop never reaches print or the saved document
    const { ctx, page } = await open({ ui: 'en' });
    const pr = await page.evaluate(() => { const css = [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r instanceof CSSMediaRule && r.conditionText.includes('print')).map((r) => r.cssText).join(' '); return /#bw-backdrop/.test(css); });
    check('note 13: the print stylesheet hides the backdrop', pr);
    await ctx.close();
  }

  // ── note 14: the dim navy dark mode, every pair measured from the shipped CSS ───────────────────────
  {
    const { ctx, page, errors } = await open({ ui: 'en', dark: true });
    const desk = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(desk);
    check('note 14: the dark desk is rgb(12, 23, 41)', desk === 'rgb(12, 23, 41)', desk);
    check('note 14: its relative luminance is <= 0.012 (the old navy was 0.0127)', !!m && lum([+m[1], +m[2], +m[3]]) <= 0.012, desk);
    // token pairs, resolved in the real editor (the custom properties of the dark shell as shipped)
    const T = await sh(page, (r) => {
      const sh0 = r.querySelector('.shell'); const cs = getComputedStyle(sh0);
      const px = (c) => { const k = document.createElement('canvas'); k.width = k.height = 1; const g = k.getContext('2d'); g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const v = (n) => cs.getPropertyValue(n).trim();
      const names = ['--bw-bg', '--bw-glass', '--bw-surface', '--bw-surface-2', '--bw-surface-sunk', '--bw-ink', '--bw-ink-muted', '--bw-ink-faint', '--bw-line-strong', '--bw-primary', '--bw-primary-soft', '--bw-accent', '--bw-on-accent', '--bw-accent-strong', '--bw-focus', '--bw-signal', '--bw-signal-wash', '--bw-on-signal-wash', '--bw-success', '--bw-success-wash', '--bw-on-success-wash', '--bw-on-glass', '--bw-on-glass-soft']
        .concat(['file', 'insert', 'edit', 'design', 'document', 'export', 'view', 'gaps', 'header', 'footer', 'font', 'para', 'table', 'diagram', 'picture', 'home', 'hf', 'review'].map((s) => '--bw-sec-' + s));
      const o = {}; for (const n of names) { const x = v(n); if (x) o[n] = px(x); }
      return o;
    });
    const need = (fg, bg, min, label) => {
      if (!T[fg] || !T[bg]) { check(`note 14 pair: ${label} (token missing: ${!T[fg] ? fg : bg})`, false); return; }
      const r = ratio(T[fg], T[bg]); check(`note 14 pair: ${label} ${r.toFixed(2)}:1 >= ${min}`, r >= min, `${fg} on ${bg}`);
    };
    const pairs = [
      ['--bw-ink', '--bw-bg', 4.5, 'ink on desk'], ['--bw-on-glass', '--bw-glass', 4.5, 'ink on the bar'], ['--bw-on-glass-soft', '--bw-glass', 4.5, 'muted on the bar'],
      ['--bw-ink', '--bw-surface', 4.5, 'ink on panel'], ['--bw-ink-muted', '--bw-surface', 4.5, 'muted on panel'], ['--bw-ink-faint', '--bw-surface', 4.5, 'faint on panel'], ['--bw-ink-faint', '--bw-surface-2', 4.5, 'faint on raised panel'],
      ['--bw-primary', '--bw-surface', 4.5, 'link on panel'], ['--bw-primary', '--bw-primary-soft', 4.5, 'link on its wash'], ['--bw-on-accent', '--bw-accent', 4.5, 'text on the gold button'], ['--bw-accent-strong', '--bw-surface', 4.5, 'gold text on panel'],
      ['--bw-signal', '--bw-surface', 4.5, 'signal text on panel'], ['--bw-on-signal-wash', '--bw-signal-wash', 4.5, 'ink on the signal wash'], ['--bw-success', '--bw-surface', 4.5, 'success text on panel'], ['--bw-on-success-wash', '--bw-success-wash', 4.5, 'ink on the success wash'],
      ['--bw-line-strong', '--bw-surface', 3, 'control border on panel'], ['--bw-line-strong', '--bw-glass', 3, 'control border on the bar'], ['--bw-focus', '--bw-surface', 3, 'focus ring on panel'], ['--bw-focus', '--bw-glass', 3, 'focus ring on the bar'], ['--bw-accent', '--bw-glass', 3, 'gold icon on the bar'],
      ['--bw-success', '--bw-glass', 3, 'server ON icon on the bar'], ['--bw-signal', '--bw-glass', 3, 'server OFF icon on the bar'],
    ];
    for (const s of ['file', 'insert', 'edit', 'design', 'document', 'export', 'view', 'gaps', 'header', 'footer', 'font', 'para', 'table', 'diagram', 'picture', 'home', 'hf', 'review']) if (T['--bw-sec-' + s]) pairs.push([`--bw-sec-${s}`, '--bw-glass', 3, `${s} icon on the bar`]);
    for (const p of pairs) need(...p);
    check('note 14: at least 25 token pairs were measured (the probe looked)', Object.keys(T).length >= 25 && pairs.length >= 25, String(Object.keys(T).length));
    // elements as drawn: every visible text and every icon in the bar, the ribbon, the drawers and the palette, text 4.5, icons 3
    const measure = () => sh(page, (r) => {
      const px = (c) => { const k = document.createElement('canvas'); k.width = k.height = 1; const g = k.getContext('2d'); g.clearRect(0, 0, 1, 1); g.fillStyle = c; g.fillRect(0, 0, 1, 1); return [...g.getImageData(0, 0, 1, 1).data]; };
      const up = (e) => e.parentElement || (e.getRootNode() instanceof ShadowRoot ? e.getRootNode().host : null);
      const over = (c, d) => { const a = c[3] / 255; return [c[0] * a + d[0] * (1 - a), c[1] * a + d[1] * (1 - a), c[2] * a + d[2] * (1 - a), 255]; };
      const bgOf = (e) => { const chain = []; for (let n = e; n; n = up(n)) chain.push(n); let out = [0, 0, 0, 0]; let grad = false; for (let i = chain.length - 1; i >= 0; i--) { const cs = getComputedStyle(chain[i]); const c = px(cs.backgroundColor); if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/linear-gradient\(var|linear-gradient\(rgb/.test(cs.backgroundImage)) grad = true; out = over(c, out.a === 0 ? px(getComputedStyle(document.documentElement).backgroundColor) : out); out[3] = 255; } return { c: out, grad }; };
      const opac = (e) => { let o = 1; for (let n = e; n; n = up(n)) o *= parseFloat(getComputedStyle(n).opacity); return o; };
      const lum = ([R, G, B]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const rows = []; const seen = new Set();
      const scopes = [...r.querySelectorAll('.island, .drawer:not([hidden]), .palette:not([hidden]), .pop:not([hidden])')];
      for (const sc of scopes) {
        const sn = sc.classList[0];
        const els = [sc, ...sc.querySelectorAll('*')];
        for (const e of els) {
          if (seen.has(e)) continue; seen.add(e);
          const rc = e.getBoundingClientRect(); if (rc.width < 2 || rc.height < 2) continue;
          const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (e.closest('[disabled], [aria-disabled="true"], .vh, [aria-hidden="true"]:not(svg)')) continue;
          const o = opac(e); if (o < 0.99) continue;
          const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          const icon = e.matches('svg.ic, svg.ic > *') && !e.matches('svg.ic > *');
          if (!text && !icon) continue;
          const fg = icon ? px(cs.color) : px(cs.color);
          const { c: bg, grad } = bgOf(e);
          const f = over(fg, bg);
          const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
          const large = size >= 24 || (size >= 18.66 && bold);
          const min = icon ? 3 : large ? 3 : 4.5;
          rows.push({ scope: sn, what: icon ? 'icon ' + (e.getAttribute('data-ic') || '') : (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 24), r: ratio(f, bg), min, grad });
        }
      }
      return rows;
    });
    const row0 = await measure();
    // open the panels and the palette once each, measure again
    const all = [...row0];
    for (const d of ['settings', 'history', 'outline', 'check']) {
      await page.evaluate((x) => window.BW.runAction(x), d); await page.waitForTimeout(500);
      all.push(...(await measure()).filter((x) => x.scope === 'drawer'));
    }
    await page.evaluate(() => window.BW.runAction('settings')); await page.waitForTimeout(300);
    await page.keyboard.press('Control+K'); await page.waitForTimeout(400);
    all.push(...(await measure()).filter((x) => x.scope === 'palette'));
    await page.keyboard.press('Escape');
    check('note 14: the element probe saw the bar, the ribbon, drawers and the palette (>= 120 text and icon pairs)', all.length >= 120 && ['island', 'drawer'].every((s) => all.some((x) => x.scope === s)), String(all.length));
    const bad = all.filter((x) => !x.grad && x.r < x.min);
    const worst = bad.sort((a, b) => a.r - b.r).slice(0, 8).map((x) => `${x.r.toFixed(2)}<${x.min} ${x.scope} ${x.what}`);
    check(`note 14: 0 of ${all.filter((x) => !x.grad).length} drawn text and icon pairs below 4.5:1 (text) or 3:1 (icons, large text) in dark`, bad.length === 0, worst.join(' | '));
    fs.writeFileSync(path.join(OUT, 'dark-contrast.json'), JSON.stringify({ pairs: pairs.map((p) => ({ fg: p[0], bg: p[1], min: p[2], ratio: T[p[0]] && T[p[1]] ? +ratio(T[p[0]], T[p[1]]).toFixed(2) : null })), drawn: all.length, failing: bad.length, worstFirst: bad.slice(0, 20) }, null, 1));
    check('note 14: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  { // light mode stays as it was: the desk is the brand wash and the bar is still the cover navy
    const { ctx, page } = await open({ ui: 'en', dark: false });
    const v = await sh(page, (r) => ({ glass: getComputedStyle(r.querySelector('.shell')).getPropertyValue('--bw-glass').trim(), desk: getComputedStyle(document.documentElement).backgroundColor }));
    check('note 14: light mode is unchanged (bar #001e3d, desk rgb(225, 234, 244))', v.glass === '#001e3d' && v.desk === 'rgb(225, 234, 244)', JSON.stringify(v));
    await ctx.close();
  }
  { // toggling dark and light 20 times: no layout shift in the bar, no page error
    const { ctx, page, errors } = await open({ ui: 'en' });
    const h0 = (await edges(page)).isl.h;
    for (let i = 0; i < 20; i++) { await page.evaluate(() => window.BW.runAction('dark')); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    const h1 = (await edges(page)).isl.h;
    check('note 14: 20 dark/light toggles leave the bar height unchanged', Math.abs(h1 - h0) <= 1, `${h0} -> ${h1}`);
    check('note 14: 20 toggles, no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── perf booster 1: one hover motion, 200 ms at most ────────────────────────────────────────────────
  {
    const { ctx, page } = await open({ ui: 'en' });
    const btn = await sh(page, (r) => { const b = r.querySelector('.island .ribbon .rb-panel button[data-a]'); if (!b) return null; const x = b.getBoundingClientRect(); return { x: x.left + x.width / 2, y: x.top + x.height / 2 }; });
    check('perf 1: a ribbon button was found to hover (the probe looked)', !!btn);
    if (btn) {
      await page.mouse.move(5, 700); await page.mouse.move(btn.x, btn.y, { steps: 2 }); await page.waitForTimeout(160); // 0.15.2: the part moves play once the pointer has rested (120 ms)
      const a = await sh(page, (r) => { const b = r.querySelector('.island .ribbon .rb-panel button[data-a]:hover'); if (!b) return null; return b.getAnimations({ subtree: true }).map((x) => ({ n: x.animationName || x.transitionProperty, end: x.effect.getComputedTiming().endTime })); });
      check('perf 1: hovering a tool plays something (the probe looked)', Array.isArray(a) && a.length > 0, JSON.stringify(a));
      const long = (a || []).filter((x) => x.end > 250 && !/^(background|border|box-shadow|outline)/.test(x.n));
      check('perf 1: every icon move and icon transition on a hovered tool ends within 250 ms (200 ms + its own delay)', long.length === 0, JSON.stringify(long));
    }
    await ctx.close();
  }
  // ── perf booster 2: no animation runs while the mark idles; the nod is a one-shot ───────────────────
  {
    const { ctx, page } = await open({ ui: 'en' });
    await page.mouse.move(700, 600);
    // wait for the first-open build to hand over, then look at a quiet moment (the nod lasts at most 2.4 s of every 6.4 s: sample 6 times over 7 s)
    const counts = [];
    for (let i = 0; i < 7; i++) { counts.push(await sh(page, (r) => r.querySelector('.brand svg')?.getAnimations({ subtree: true }).filter((a) => a.effect.getComputedTiming().iterations === Infinity).length ?? -1)); await page.waitForTimeout(1000); }
    check('perf 2: no infinite animation on the mark at any of 7 samples (0.13.0 ran 4 forever)', counts.every((c) => c === 0), counts.join());
    const names = await page.evaluate(() => window.BW.EXT.look.idleNow());
    check('perf 2: the nod plays the four parts on demand (rule, sheet, cap, lines)', names.length === 4 && names.every((n) => /^bwm-idle-/.test(n)), names.join());
    await page.waitForTimeout(80);
    const live = await sh(page, (r) => r.querySelector('.brand svg').getAnimations({ subtree: true }).map((a) => a.id || a.animationName));
    check('perf 2: those are animations named bwm-idle-* (running while the nod lasts)', live.filter((n) => /^bwm-idle-/.test(n)).length >= 3, live.join());
    await page.waitForTimeout(3000);
    const after = await sh(page, (r) => r.querySelector('.brand svg').getAnimations({ subtree: true }).filter((a) => a.playState !== 'finished').length);
    check('perf 2: the nod clears itself, 0 unfinished animations left on the mark', after === 0, String(after));
    await ctx.close();
    for (const [name, opts] of [['calm', { calm: true }], ['reduced motion', { reduced: true }]]) {
      const c = await open({ ui: 'en', ...opts });
      const n = await c.page.evaluate(() => window.BW.EXT.look.idleNow());
      const any = await sh(c.page, (r) => r.querySelector('.brand svg').getAnimations({ subtree: true }).filter((a) => a.playState === 'running' || a.playState === 'pending').length);
      check(`perf 2 (${name}): nothing plays on the mark`, any === 0 && (name === 'calm' ? n.length === 0 : true), `${n.length} set, ${any} running`);
      await c.ctx.close();
    }
  }
  // ── perf booster 5: the button-icon decoration looks only at what was added, and decorates the same buttons ──
  {
    const { ctx, page, errors } = await open({ ui: 'en' });
    const seq = ['settings', 'history', 'find', 'outline', 'check', 'theme', 'pages', 'newdoc', 'library'];
    const bi = (r) => r.querySelectorAll('.bi-i').length;
    let ok = true; const log = []; let total = 0;
    for (const d of seq) {
      await page.evaluate((x) => window.BW.runAction(x), d); await page.waitForTimeout(350);
      const n1 = await sh(page, bi);
      await page.evaluate(() => window.BW.EXT.buttonIcons.decorate()); // the full pass of 0.14: it must find nothing the observer missed
      const n2 = await sh(page, bi);
      log.push(`${d}:${n1}/${n2}`); total += n1; if (n1 !== n2) ok = false;
    }
    check('perf 5: after each of 9 panels the scoped decoration left nothing for a full pass to add', ok, log.join(' '));
    check('perf 5: buttons were decorated at all (the probe looked: >= 15 icons over the panels)', total >= 15, String(total));
    await sh(page, (r) => { const d = r.querySelector('.drawer') || r.querySelector('.island'); d.insertAdjacentHTML('beforeend', '<div><button type="button" data-lib="new" id="bi-probe">x</button></div>'); });
    await page.waitForTimeout(50);
    const got = await sh(page, (r) => !!r.querySelector('#bi-probe .bi-i svg'));
    check('perf 5: a button added later is decorated by the observer', got);
    check('perf 5: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
