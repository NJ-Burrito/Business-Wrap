// 0.17.0 icon and motion rework (owner notes N5, N6). Walks the real editor (the sample build) in Chrome:
//   I1 the ribbon's category icons are the brand v3 drawings (brand/v3/tools/build_ribbon_icons.mjs --check)
//   I2 every icon the editor carries (editor/icons.json + the ext files' Object.assign(IC, …)) plays a move on hover / press replay
//   I3 a real hover on every ribbon tab plays its own scene; a real press squashes the icon (wide and low), the release springs it back
//   I4 the hover colour is a theme colour, >= 3:1 on its surface, in light and in the dim-navy dark (the gold part too)
//   I5 the moves are acted: every house move and every watermark reaction has a wind-up / overshoot / settle (>= 4 beats)
//   I6 the watermark: W01-W20 play, the two new eggs play through their real gestures (long press, circling), the brand mark hops
//   I7 calm mode stills all of it (icons, press, nod, brand mark, reactions, eggs)
//   node tests/motion-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { pathToFileURL } from 'node:url';

const OUT = path.join(REPO, 'out', 'motion-0170');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// I1: the drawings are the builder's
{
  const r = spawnSync(process.execPath, [path.join(REPO, 'brand', 'v3', 'tools', 'build_ribbon_icons.mjs'), '--check'], { encoding: 'utf8' });
  check('I1 the ribbon category icons in editor/icons.json are the brand v3 drawings', r.status === 0, (r.stdout + r.stderr).trim());
  const e = spawnSync(process.execPath, [path.join(REPO, 'brand', 'v3', 'tools', 'build_editor_icons.mjs'), '--check'], { encoding: 'utf8' });
  check('I1 every other icons.json icon is a brand v3 drawing (none left in the old Lucide set)', e.status === 0, (e.stdout + e.stderr).trim());
}
// I5 (source half): every house keyframe in 40-icon-motion.css that moves there and back has at least 4 beats
{
  const css = fs.readFileSync(path.join(REPO, 'editor', 'ext', '40-icon-motion.css'), 'utf8');
  const kfs = [];
  for (const m of css.matchAll(/@keyframes (icm-[\w-]+)\s*\{/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < css.length) { if (css[i] === '{') depth += 1; else if (css[i] === '}') depth -= 1; i += 1; }
    const body = css.slice(m.index + m[0].length, i - 1);
    const sels = [...body.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((b) => b[1].split(',').map((x) => x.trim()));
    kfs.push({ name: m[1], beats: new Set(sels.map((x) => (x === 'from' ? '0%' : x === 'to' ? '100%' : x))).size });
  }
  const thin = kfs.filter((k) => !['icm-blink', 'icm-draw', 'icm-draw1', 'icm-grow-x', 'icm-grow-y'].includes(k.name) && k.beats < 4);
  check('I5 every house move is acted (wind-up, overshoot, settle: >= 4 beats)', kfs.length >= 20 && thin.length === 0, `${kfs.length} moves; thin: ${thin.map((k) => k.name + ':' + k.beats).join(' ')}`);
}

const HELPERS = `
window.__root = () => document.getElementById('bw-ui-host').shadowRoot;
window.__rgb = (css) => { const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillStyle = css; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
window.__lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
window.__cr = (a, b) => { const x = __lum(__rgb(a)), y = __lum(__rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
window.__anim = (svg) => [svg, ...svg.querySelectorAll('*')].filter((p) => { const a = getComputedStyle(p).animationName; return a && a !== 'none'; }).map((p) => getComputedStyle(p).animationName);
// a probe: every icon in a button on a solid surface inside the shell (so the shell's tokens and the hover rules apply)
window.__probe = (surface) => {
  const shell = __root().querySelector('.shell');
  let box = shell.querySelector('#mt-probe');
  if (box) box.remove();
  box = document.createElement('div'); box.id = 'mt-probe';
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-wrap:wrap;gap:2px;align-content:flex-start;overflow:auto;background:' + surface;
  const keys = Object.keys(window.__IC);
  box.innerHTML = keys.map((k) => '<button type="button" class="b" data-k="' + k + '"><span class="i">' + window.__IC[k].replace('<svg', '<svg data-ic="' + k + '"') + '</span></button>').join('');
  shell.appendChild(box);
  return keys.length;
};
// press-replay every probe icon, then read: the moves, the resting and the hot colour, their contrast
window.__probeRead = async () => {
  const box = __root().getElementById('mt-probe');
  const bg = getComputedStyle(box).backgroundColor;
  const bs = [...box.querySelectorAll('button')];
  // the colour ease (180 ms) only advances on a rendered frame, which a headless run does not promise within a timeout: read the end state
  bs.forEach((b) => { b.querySelector('svg').style.transition = 'none'; });
  const rest = bs.map((b) => getComputedStyle(b.querySelector('svg')).color);
  bs.forEach((b) => b.classList.add('ic-go'));
  const moves = bs.map((b) => __anim(b.querySelector('svg')).length);
  await new Promise((r) => setTimeout(r, 320));
  return bs.map((b, i) => {
    const svg = b.querySelector('svg'); const hot = getComputedStyle(svg).color;
    return { k: b.dataset.k, moves: moves[i], mono: !svg.classList.contains('bw-i'), hot, rest: rest[i], cr: __cr(hot, bg), hl: [...svg.querySelectorAll('.hl')].map((h) => { const cs = getComputedStyle(h); return __cr(h.classList.contains('rl') ? cs.stroke : cs.fill, bg); }) };
  });
};
`;

const browser = await chromium.launch(launchOptions());
async function open({ dark = false, calm = false, ui = 'ar' } = {}) {
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(({ dark, calm, ui }) => { try { if (sessionStorage.getItem('mt-init')) return; sessionStorage.setItem('mt-init', '1'); localStorage.setItem('bw:ui', ui); localStorage.setItem('bw:dark', dark ? '1' : '0'); localStorage.setItem('bw:calm', calm ? '1' : '0'); localStorage.setItem('bw:wm-intro', '1'); localStorage.setItem('bw:rb:c', '0'); sessionStorage.setItem('bw:wm-welcome', '1'); } catch {} }, { dark, calm, ui });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && window.BW_WM, null, { timeout: 90000 });
  await page.evaluate(HELPERS);
  // the icon map: the editor's own (window.BW.IC, the same object the ext files add to)
  const n = await page.evaluate(() => { window.__IC = window.BW?.IC || null; return window.__IC ? Object.keys(window.__IC).length : 0; });
  return { ctx, page, n };
}

try {
  /* ── I2 + I4 light, I3, I5 (reactions), I6 ─────────────────────────────── */
  const L = await open();
  check('looked: the editor booted and its icon map is readable', L.n > 180, `${L.n} icons`);
  for (const [theme, P] of [['light', L]]) {
    const n = await P.page.evaluate(() => __probe('var(--bw-surface)'));
    const rows = await P.page.evaluate(() => __probeRead());
    const still = rows.filter((r) => r.moves === 0);
    check(`I2 (${theme}) every icon of the ${n} plays a move on its press replay / rested hover`, n === L.n && still.length === 0, still.map((r) => r.k).join(' '));
    const flat = rows.filter((r) => r.mono && (r.hot === r.rest || r.cr < 3));
    check(`I4 (${theme}) every mono icon turns to the theme colour, >= 3:1 on the surface`, flat.length === 0, `${flat.length} below: ${flat.slice(0, 8).map((r) => r.k + ' ' + r.cr.toFixed(2)).join(', ')}; min ${Math.min(...rows.filter((r) => r.mono).map((r) => r.cr)).toFixed(2)}:1`);
    const gold = rows.flatMap((r) => r.hl.map((c) => [r.k, c])).filter(([, c]) => c < 3);
    check(`I4 (${theme}) the gold part of every v3 icon reads >= 3:1 on the surface`, gold.length === 0, gold.slice(0, 6).map(([k, c]) => `${k} ${c.toFixed(2)}`).join(', '));
    await P.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.getElementById('mt-probe').remove());
  }

  // I3 the real ribbon: hover each tab (past the 120 ms rest), its icon plays; colours on the ribbon itself
  const tabs = await L.page.evaluate(() => [...__root().querySelectorAll('.rb-tab')].map((t) => t.dataset.tab));
  check('looked: the ribbon shows its category tabs', tabs.length >= 10, tabs.join(' '));
  const hov = [];
  for (const tab of tabs) {
    await L.page.locator('#bw-ui-host').locator(`.rb-tab[data-tab="${tab}"]`).hover();
    await L.page.waitForTimeout(200);
    hov.push(await L.page.evaluate((tb) => { const s = __root().querySelector(`.rb-tab[data-tab="${tb}"] svg.ic`); return { tab: tb, key: s?.dataset.ic, v3: s?.classList.contains('bw-r'), moves: s ? __anim(s) : [] }; }, tab));
    await L.page.mouse.move(5, 890);
  }
  const dull = hov.filter((h) => !h.v3 || h.moves.length < 1 || h.moves.every((m) => m === 'icm-pop'));
  check('I3 a real hover on every ribbon tab plays its own v3 scene (not the generic pop)', dull.length === 0, dull.map((h) => `${h.tab}:${h.moves.join('+')}`).join(' ') || hov.map((h) => `${h.tab}:${[...new Set(h.moves)].join('+')}`).join(' '));
  const distinct = new Set(hov.map((h) => [...new Set(h.moves)].sort().join('+')));
  check('I3 the tab scenes differ from each other (>= 8 different move sets)', distinct.size >= 8, `${distinct.size} sets`);
  // press: squash on mouse down, spring back on release
  {
    const t = L.page.locator('#bw-ui-host').locator(`.rb-tab[data-tab="${tabs[1]}"]`);
    const b = await t.boundingBox();
    await L.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await L.page.mouse.down();
    await L.page.waitForTimeout(160);
    const down = await L.page.evaluate((tb) => getComputedStyle(__root().querySelector(`.rb-tab[data-tab="${tb}"] svg.ic`)).scale, tabs[1]);
    await L.page.mouse.up();
    await L.page.waitForTimeout(40);
    const easing = await L.page.evaluate((tb) => getComputedStyle(__root().querySelector(`.rb-tab[data-tab="${tb}"] svg.ic`)).transitionTimingFunction, tabs[1]);
    check('I3 a press squashes the icon wide and low; the release rides a spring (linear() curve)', down === '1.12 0.8' && /linear\(/.test(easing), `down ${down}; release ${easing.slice(0, 40)}`);
    await L.page.mouse.move(5, 890);
  }
  // I4 the ribbon tab colours on the ribbon band (the tab colour and the gold part), light
  const band = async (P, theme) => {
    const r = await P.page.evaluate(() => {
      const rb = __root().querySelector('.ribbon');
      const cs = getComputedStyle(rb);
      const sel = cs.getPropertyValue('--rb-sel').trim(), base = cs.getPropertyValue('--rb-base').trim();
      const probe = document.createElement('i'); rb.appendChild(probe);
      const res = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
      const bgSel = res(sel), bgBase = res(base);
      const out = [...rb.querySelectorAll('.rb-tab svg.ic')].map((s) => {
        const tab = s.closest('.rb-tab'); const bg = tab.getAttribute('aria-selected') === 'true' ? bgSel : bgBase;
        const ink = getComputedStyle(s).color;
        const hl = [...s.querySelectorAll('.hl')].map((h) => { const c = getComputedStyle(h); return h.classList.contains('rl') ? c.stroke : c.fill; });
        return { tab: tab.dataset.tab, ink: __cr(ink, bg), hl: hl.map((c) => __cr(c, bg)) };
      });
      probe.remove();
      return out;
    });
    const low = r.filter((x) => x.ink < 3 || x.hl.some((c) => c < 3));
    check(`I4 (${theme}) every ribbon tab icon and its gold part read >= 3:1 on the band`, r.length >= 10 && low.length === 0, low.map((x) => `${x.tab} ${x.ink.toFixed(2)}/${x.hl.map((c) => c.toFixed(2))}`).join(' ') || `min ink ${Math.min(...r.map((x) => x.ink)).toFixed(2)}, min gold ${Math.min(...r.flatMap((x) => x.hl)).toFixed(2)}`);
  };
  await band(L, 'light');

  // I5 the reactions are acted; I6 they play; the eggs play through their real gestures
  const W = await L.page.evaluate(() => {
    const M = window.BW.EXT.watermark;
    const ids = [...M.ids(), ...M.eggs().map((e) => e.id)];
    return ids.map((id) => { const f = M.frames(id) || []; const mark = f.find((a) => a.target === 'mark'); return { id, beats: mark ? mark.keys.length : 0 }; });
  });
  const thinW = W.filter((w) => w.id !== 'W13' && w.beats < 4);
  check('I5 every watermark reaction and egg is acted (>= 4 beats on the mark; W13 is the light sweep)', W.length === 22 && thinW.length === 0, thinW.map((w) => `${w.id}:${w.beats}`).join(' '));
  const played = [];
  for (const id of W.map((w) => w.id)) {
    played.push(await L.page.evaluate((i) => { const a = window.BW.EXT.watermark.play(i); return { id: i, n: a ? a.length : 0 }; }, id));
    await L.page.waitForTimeout(30);
  }
  check('I6 W01-W20 and both eggs fire (each plays at least one animation)', played.every((p) => p.n >= 1), played.filter((p) => !p.n).map((p) => p.id).join(' '));
  check('I6 the 20 reaction ids are unchanged (the frozen contract)', (await L.page.evaluate(() => window.BW.EXT.watermark.ids().length)) === 20);
  await L.page.waitForTimeout(1800);
  // long press: hold 0.8 s, release
  const stage = L.page.locator('#bw-watermark .bw-wm-stage');
  const sb = await stage.boundingBox();
  const cx = sb.x + sb.width / 2, cy = sb.y + sb.height / 2;
  await L.page.mouse.move(cx, cy);
  await L.page.waitForTimeout(2100); // the typing gap and the hover hop's end
  await L.page.mouse.down();
  await L.page.waitForTimeout(820);
  await L.page.mouse.up();
  const charge = await L.page.evaluate(() => ({ id: window.BW.EXT.watermark.last()?.id, playing: window.BW.EXT.watermark.isPlaying() }));
  check('I6 egg «charge»: a 0.8 s press on the mark launches it', charge.id === 'charge' && charge.playing, JSON.stringify(charge));
  await L.page.waitForTimeout(1500);
  // circling: two and a bit turns around the middle of the mark
  for (let i = 0; i <= 64; i += 1) { const a = (i / 64) * Math.PI * 2 * 2.2; await L.page.mouse.move(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28); }
  const dizzy = await L.page.evaluate(() => ({ id: window.BW.EXT.watermark.last()?.id }));
  check('I6 egg «dizzy»: circling the pointer twice round the mark makes it dizzy', dizzy.id === 'dizzy', JSON.stringify(dizzy));
  // the brand mark in the top bar hops on hover
  await L.page.mouse.move(5, 890);
  const brand = L.page.locator('#bw-ui-host').locator('.brand').first();
  let brandAnim = 'absent';
  if (await brand.count()) { await brand.hover(); await L.page.waitForTimeout(120); brandAnim = await L.page.evaluate(() => getComputedStyle(__root().querySelector('.brand svg')).animationName); }
  check('I6 the brand mark hops on hover (bwm-hop)', brandAnim === 'bwm-hop', brandAnim);
  await L.ctx.close();

  /* ── I2 + I4 dark (dim navy) ───────────────────────────────────────────── */
  const D = await open({ dark: true });
  check('looked: dark mode is the dim navy theme', await D.page.evaluate(() => __root().querySelector('.shell').dataset.theme === 'dark'));
  {
    await D.page.evaluate(() => __probe('var(--bw-surface)'));
    const rows = await D.page.evaluate(() => __probeRead());
    check('I2 (dark) every icon plays a move', rows.every((r) => r.moves > 0), rows.filter((r) => !r.moves).map((r) => r.k).join(' '));
    const flat = rows.filter((r) => r.mono && (r.hot === r.rest || r.cr < 3));
    check('I4 (dark) every mono icon turns to the theme colour, >= 3:1 on the dim-navy surface', flat.length === 0, `${flat.length} below; min ${Math.min(...rows.filter((r) => r.mono).map((r) => r.cr)).toFixed(2)}:1`);
    const gold = rows.flatMap((r) => r.hl).filter((c) => c < 3);
    check('I4 (dark) the gold part of every v3 icon reads >= 3:1', gold.length === 0, `${gold.length} below`);
  }
  await band(D, 'dark');
  await D.ctx.close();

  /* ── I7 calm ───────────────────────────────────────────────────────────── */
  const C = await open({ calm: true });
  check('looked: calm mode is on', await C.page.evaluate(() => window.BW.S.calm === true));
  {
    await C.page.evaluate(() => __probe('var(--bw-surface)'));
    const moving = await C.page.evaluate(() => [...__root().querySelectorAll('#mt-probe button')].filter((b) => { b.classList.add('ic-go'); return __anim(b.querySelector('svg')).filter((n) => !n.startsWith('bwi-')).length > 0; }).map((b) => b.dataset.k));
    const bwiMoving = await C.page.evaluate(() => [...__root().querySelectorAll('#mt-probe button')].filter((b) => __anim(b.querySelector('svg')).length > 0).map((b) => b.dataset.k));
    check('I7 calm: no icon moves on its press replay / hover', moving.length === 0 && bwiMoving.length === 0, [...moving, ...bwiMoving].slice(0, 10).join(' '));
    await C.page.evaluate(() => __root().getElementById('mt-probe').remove());
    const t = C.page.locator('#bw-ui-host').locator('.rb-tab').nth(1);
    const b = await t.boundingBox();
    await C.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await C.page.mouse.down();
    await C.page.waitForTimeout(120);
    const sc = await C.page.evaluate(() => { const s = __root().querySelectorAll('.rb-tab svg.ic')[1]; return { scale: getComputedStyle(s).scale, anim: __anim(s) }; });
    await C.page.mouse.up();
    check('I7 calm: a press does not squash, a hover plays nothing', sc.scale === 'none' && sc.anim.length === 0, JSON.stringify(sc));
    await C.page.mouse.move(5, 890);
    const wm = await C.page.evaluate(() => { const M = window.BW.EXT.watermark; const rnd = M.trigger('W12'); const a = M.play('charge') || []; const props = [...new Set(a.flatMap((x) => x.effect.getKeyframes().flatMap((k) => Object.keys(k))))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)); return { rnd, props }; });
    check('I7 calm: a random reaction does not play and an egg is a still (opacity only)', wm.rnd === false && wm.props.length === 1 && wm.props[0] === 'opacity', JSON.stringify(wm));
    const brand = C.page.locator('#bw-ui-host').locator('.brand').first();
    let ba = 'absent';
    if (await brand.count()) { await brand.hover(); await C.page.waitForTimeout(120); ba = await C.page.evaluate(() => getComputedStyle(__root().querySelector('.brand svg')).animationName); }
    check('I7 calm: the brand mark stays still on hover', ba === 'none', ba);
  }
  await C.ctx.close();
} catch (e) {
  check('motion run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
