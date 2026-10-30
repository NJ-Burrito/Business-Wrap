// 0.15.0 lane core: zoom 25-400 % and Fill height (note 9), the 20 watermark reactions and the easter egg (note 12, AC1-AC6),
// runAction throws on unknown ids, data-bw-dialog hooks, ?automation=1 and the settled bw:ready signal, the new command ids,
// and the two typing-path boosters (validate's table check and fitBar's signature never run on a plain keystroke).
// Headless Edge, a fresh context per scenario, closed in finally. Time-dependent rules run on Playwright's fake clock.
//
//   node tests/core-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'core-0150-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file });
const URL = pathToFileURL(file).href;

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  core-0150: ${name}${detail && !ok ? '  - ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());

/** A page on the editor. clock: install the fake clock (paused after boot, so runFor drives every timer). */
async function open({ query = '', hash = '', clock = false, reduced = false, store = {}, width = 1366, height = 768, spies = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(([st, sp]) => {
    try { if (!sessionStorage.getItem('bw-core-init')) { sessionStorage.setItem('bw-core-init', '1'); localStorage.setItem('bw:wm-intro', '1'); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* */ }
    window.__bwReady = 0; window.addEventListener('bw:ready', () => { window.__bwReady += 1; });
    if (sp) { window.__audio = 0; const wrap = (n) => { const O = window[n]; if (O) window[n] = function (...a) { window.__audio += 1; return new O(...a); }; }; wrap('Audio'); wrap('AudioContext'); wrap('webkitAudioContext'); }
  }, [store, spies]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (clock) {
    await page.clock.install({ time: new Date('2026-10-31T09:00:00Z') });
    // the mark's spring loop would run once per simulated frame (tens of thousands over ten simulated minutes); the rules do not need it
    await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  }
  await page.goto(URL + query + hash);
  await page.waitForFunction(() => window.BW?.ready);
  if (clock) { await page.clock.runFor(1500); await page.clock.pauseAt(new Date('2026-10-31T09:00:30Z')); } else if (store['bw:profile-prompt']) await page.waitForTimeout(900); else await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 5000 });
  return { ctx, page, errors };
}
const WM = (page, fn, arg) => page.evaluate(([f, a]) => new Function('W', 'a', `return (${f})(W, a)`)(window.BW.EXT.watermark, a), [fn.toString(), arg]);
const UIROOT = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
const keysOf = (kfs) => [...new Set(kfs.flatMap((k) => Object.keys(k)))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));

try {
  /* ── automation start and the settled ready signal ─────────────────────── */
  {
    const { ctx, page, errors } = await open({ query: '?automation=1' });
    const r = await page.evaluate(async () => ({ auto: document.documentElement.dataset.bwAutomation, ready: document.documentElement.dataset.bwReady, n: window.__bwReady, flag: window.BW.automation, when: await window.BW.whenReady(50) }));
    check('automation: data-bw-automation="1" and BW.automation', r.auto === '1' && r.flag === true);
    check('automation: data-bw-ready="1", bw:ready fired exactly once, whenReady() resolves', r.ready === '1' && r.n === 1 && r.when === true, JSON.stringify(r));
    check('automation: no page error', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await open();
    const r = await page.evaluate(() => ({ auto: document.documentElement.dataset.bwAutomation ?? null, ready: document.documentElement.dataset.bwReady, n: window.__bwReady, legacy: window.BW.ready }));
    check('plain start: no automation flag, still settles (legacy BW.ready true, bw:ready once)', r.auto === null && r.ready === '1' && r.n === 1 && r.legacy === true, JSON.stringify(r));
    await ctx.close();
  }
  {
    // a first-launch card is open (a person, not a bot): the editor is not «settled» until it is answered; the hook names it
    const { ctx, page } = await open({ store: { 'bw:profile-prompt': '1' } });
    await page.waitForFunction(() => window.BW.dialogs().some((d) => d.id === 'pf-first'), null, { timeout: 8000 }).catch(() => {});
    const d = await page.evaluate(() => ({ dialogs: window.BW.dialogs(), ready: document.documentElement.dataset.bwReady ?? null, el: !!window.BW.dialog('pf-first') }));
    check('dialog hook: the first-launch card is data-bw-dialog="pf-first" and BW.dialog() returns it', d.dialogs.some((x) => x.id === 'pf-first' && x.open) && d.el, JSON.stringify(d));
    check('dialog hook: ids are unique', new Set(d.dialogs.map((x) => x.id)).size === d.dialogs.length);
    check('ready waits for the open dialog (data-bw-ready absent)', d.ready === null, String(d.ready));
    const rej = await page.evaluate(() => window.BW.whenReady(300).then(() => 'resolved', (e) => e.message));
    check('whenReady() rejects (never hangs) and names the blocking dialog', /pf-first/.test(rej), rej);
    await UIROOT(page, (r) => r.querySelector('[data-bw-dialog="pf-first"] [data-mk="skip"]').click());
    await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 5000 }).then(() => check('ready fires once the card is answered', true), () => check('ready fires once the card is answered', false));
    const hold = await page.evaluate(async () => { const rel = window.BW.holdReady('x'); const a = await window.BW.whenReady(50).then(() => 'ok', () => 'bad'); rel(); return a; });
    check('holdReady after settling does not un-settle (the signal is once)', hold === 'ok');
    await ctx.close();
  }

  /* ── runAction: unknown ids fail, every id the UI draws resolves ───────── */
  {
    const { ctx, page } = await open();
    const rej = await page.evaluate(() => window.BW.runAction('nope-0150').then(() => 'resolved', (e) => e.message));
    check('runAction("nope-0150") rejects with the id in the message', /unknown action: nope-0150/.test(rej), rej);
    const known = await page.evaluate(async () => {
      const root = document.getElementById('bw-ui-host').shadowRoot; const ids = new Set();
      const grab = () => root.querySelectorAll('[data-a]').forEach((b) => ids.add(b.dataset.a));
      grab();
      const R = window.BW.EXT.ribbon;
      if (R) for (const t of R.tabs()) { R.setTab(t); await new Promise((q) => setTimeout(q, 20)); grab(); }
      window.BW.runAction('palette'); await new Promise((q) => setTimeout(q, 150));
      root.querySelectorAll('[data-cmd]').forEach((b) => ids.add(b.dataset.cmd));
      window.BW.runAction('palette');
      const STRUCT = new Set(['svc', 'ed', 'more']); // handled by the toolbar's own listeners, never runAction
      return { n: ids.size, unknown: [...ids].filter((i) => !STRUCT.has(i) && !window.BW.hasAction(i)), ids: [...ids] };
    });
    check('every action id the toolbar, every ribbon tab and the palette draw resolves in runAction', known.n > 100 && known.unknown.length === 0, `${known.n} ids; unknown: ${known.unknown.join(',')}`);
    const ours = ['zoomHeight', 'zoomPct', 'projExport', 'projImport'];
    const have = await page.evaluate((l) => l.map((i) => [i, window.BW.hasAction(i)]), ours);
    check('the four new command ids resolve (zoomHeight zoomPct projExport projImport)', have.every(([, ok]) => ok), JSON.stringify(have));
    const palette = await page.evaluate(async () => {
      const root = document.getElementById('bw-ui-host').shadowRoot;
      window.BW.runAction('palette'); await new Promise((q) => setTimeout(q, 150));
      const ids = [...root.querySelectorAll('[data-cmd]')].map((b) => b.dataset.cmd);
      window.BW.runAction('palette');
      return ids;
    });
    check('the four ids are in the palette (CMDS)', ours.every((i) => palette.includes(i)), palette.filter((i) => /zoom|proj/.test(i)).join(','));
    await ctx.close();
  }

  /* ── note 9: zoom 25-400 %, presets, the % field, Fill height ─────────── */
  {
    const { ctx, page } = await open();
    const z = () => page.evaluate(() => ({ s: window.BW.S.zoom, css: document.documentElement.style.getPropertyValue('--bw-zoom'), pill: document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-zoom-pill]')?.textContent, lim: document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-zoom-pill]')?.hasAttribute('data-limit') }));
    const run = (a, v) => (a === 'zoomPct' ? page.evaluate((y) => window.BW.zoomTo(y), v) : page.evaluate((x) => window.BW.runAction(x), a));
    for (let i = 0; i < 20; i += 1) await run('zoomOut');
    let r = await z();
    check('AC1: zoom out stops at 25 % (pill, state, --bw-zoom 0.25, limit mark)', r.s === 0.25 && r.css === '0.25' && r.pill === '25%' && r.lim === true, JSON.stringify(r));
    await run('zoomOut');
    r = await z();
    check('AC1: one more zoom out stays 25 %', r.s === 0.25 && r.pill === '25%');
    await run('zoomIn'); r = await z();
    check('zoom in steps through the preset list (25 to 33 %)', r.s === 0.33 && r.pill === '33%', JSON.stringify(r));
    for (let i = 0; i < 20; i += 1) await run('zoomIn');
    r = await z();
    check('AC1: zoom in stops at 400 % (--bw-zoom 4, limit mark)', r.s === 4 && r.css === '4' && r.pill === '400%' && r.lim === true, JSON.stringify(r));
    await run('zoomIn'); r = await z();
    check('AC1: one more zoom in stays 400 %', r.s === 4);
    await run('zoomPct', '150'); r = await z();
    check('AC3: the % field 150 sets 150 %', r.s === 1.5 && r.pill === '150%' && r.lim === false, JSON.stringify(r));
    await run('zoomPct', '900'); r = await z();
    check('AC3: 900 clamps to 400 %', r.s === 4, JSON.stringify(r));
    await run('zoomPct', '3'); r = await z();
    check('AC3: 3 clamps to 25 %', r.s === 0.25, JSON.stringify(r));
    await run('zoomPct', 'abc'); r = await z();
    check('AC3: a non-number leaves the zoom as it was (inline correction, no toast)', r.s === 0.25 && r.pill === '25%');
    await run('zoomReset');
    await run('zoomFit'); r = await z();
    const wantW = Math.round(((1366 - 96) / (210 * 96 / 25.4)) * 100) / 100;
    check('zoomFit fits the width (formula (clientWidth-96)/A4 width)', Math.abs(r.s - wantW) < 0.02, `${r.s} vs ${wantW}`);
    await run('zoomHeight');
    const h = await page.evaluate(() => { const bar = parseFloat(document.documentElement.style.getPropertyValue('--bw-bar-h')) || 0; return { z: window.BW.S.zoom, bar, ch: document.documentElement.clientHeight, pageH: 297 * 96 / 25.4 * window.BW.S.zoom }; });
    check('AC2: Fill height at 1366 x 768 fits the A4 page (bottom <= viewport - 24 px)', h.pageH + h.bar <= h.ch - 24 + 1, JSON.stringify(h));
    check('AC2: Fill height is not 25 % or 400 % by accident', h.z > 0.25 && h.z < 4);
    await run('zoomReset');
    // Ctrl + wheel multiplies by 1.1, one render per frame
    await page.mouse.move(600, 400);
    await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control');
    await page.waitForTimeout(250);
    r = await z();
    check('Ctrl+wheel up multiplies the zoom by 1.1', r.s === 1.1, JSON.stringify(r));
    await run('zoomReset');
    // the point under the window centre stays put
    await run('zoomPct', '200');
    await page.evaluate(() => window.scrollTo(0, 1200));
    const c0 = await page.evaluate(() => (window.scrollY + innerHeight / 2) / document.documentElement.scrollHeight);
    await run('zoomPct', '300');
    const c1 = await page.evaluate(() => (window.scrollY + innerHeight / 2) / document.documentElement.scrollHeight);
    check('zoom keeps the point under the window centre where it was (centre ratio moved < 3 %)', Math.abs(c1 - c0) < 0.03, `${c0.toFixed(3)} -> ${c1.toFixed(3)}`);
    // keyboard
    await run('zoomReset');
    await page.keyboard.press('Control+Alt+9'); const k9 = (await z()).s;
    await page.keyboard.press('Control+Alt+8'); const k8 = (await z()).s;
    check('Ctrl+Alt+9 = fill height, Ctrl+Alt+8 = fit width', Math.abs(k9 - h.z) < 0.02 && Math.abs(k8 - wantW) < 0.02, `${k9} ${k8}`);
    await ctx.close();
  }
  {
    const fs2 = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ux-i18n.json'), 'utf8'));
    const need = ['zoomHeight', 'zoomPct', 'projExport', 'projImport', 'projSoon'];
    check('AC2: the new labels exist in both languages', ['ar', 'en'].every((l) => need.every((k) => fs2[l][k] && String(fs2[l][k]).trim())), need.filter((k) => !(fs2.ar[k] && fs2.en[k])).join(','));
  }

  /* ── note 12 AC1: the set (20 ids, each plays, transform and opacity only, duration within 10 %) ── */
  {
    const { ctx, page } = await open({ spies: true });
    const ids = await WM(page, (W) => W.ids());
    check('AC1: the module exposes the 20 distinct ids W01-W20', ids.length === 20 && new Set(ids).size === 20 && ids[0] === 'W01' && ids[19] === 'W20', ids.join(','));
    const rows = [];
    for (const id of ids) {
      const r = await page.evaluate(async (i) => {
        const W = window.BW.EXT.watermark;
        const anims = W.play(i);
        if (!anims || !anims.length) return { id: i, none: true };
        const all = document.getElementById('bw-watermark').getAnimations({ subtree: true });
        const props = [...new Set(all.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));
        const end = Math.max(...W.animations().map((a) => a.effect.getComputedTiming().endTime));
        return { id: i, props, end, spec: W.spec(i).ms };
      }, id);
      rows.push(r);
      await page.waitForTimeout(40);
    }
    check('AC1: each of the 20 plays through WM.play(id)', rows.every((r) => !r.none), rows.filter((r) => r.none).map((r) => r.id).join(','));
    check('AC1: every reaction animates only transform and opacity', rows.every((r) => (r.props || []).every((p) => p === 'transform' || p === 'opacity')), rows.filter((r) => !(r.props || []).every((p) => p === 'transform' || p === 'opacity')).map((r) => `${r.id}:${r.props}`).join(' '));
    check('AC1: each measured duration is within 10 % of the table', rows.every((r) => Math.abs(r.end - r.spec) <= r.spec * 0.1), rows.filter((r) => Math.abs(r.end - r.spec) > r.spec * 0.1).map((r) => `${r.id}:${r.end}/${r.spec}`).join(' '));
    const ms = Object.fromEntries(rows.map((r) => [r.id, r.spec]));
    check('AC1: the table lengths are the spec (520 800 700 600 240 1800 700 900 900 1400 | 600 700 900 500 1000 960 800 700 1600 | 1800)', JSON.stringify(ids.map((i) => ms[i])) === JSON.stringify([520, 800, 700, 600, 240, 1800, 700, 900, 900, 1400, 600, 700, 900, 500, 1000, 960, 800, 700, 1600, 1800]));
    /* AC6: silence and safety */
    await page.waitForTimeout(1900);
    const before = await page.evaluate(() => ({ live: document.querySelector('#bw-watermark .bw-wm-live').textContent, doc: JSON.stringify(window.BW.M).length, ops: JSON.stringify(Object.values(window.BW.M).flatMap((e) => Object.values(e).map((x) => x.ops.length))), ls: JSON.stringify(Object.keys(localStorage).filter((k) => k !== 'bw:wm-intro').sort().map((k) => [k, localStorage.getItem(k)])) }));
    for (const id of ids) { await page.evaluate((i) => window.BW.EXT.watermark.play(i), id); await page.waitForTimeout(30); }
    await page.waitForTimeout(1900);
    const after = await page.evaluate(() => ({ live: document.querySelector('#bw-watermark .bw-wm-live').textContent, doc: JSON.stringify(window.BW.M).length, ops: JSON.stringify(Object.values(window.BW.M).flatMap((e) => Object.values(e).map((x) => x.ops.length))), ls: JSON.stringify(Object.keys(localStorage).filter((k) => k !== 'bw:wm-intro').sort().map((k) => [k, localStorage.getItem(k)])), audio: window.__audio, aria: document.querySelector('#bw-watermark').getAttribute('aria-hidden'), fx: [...document.querySelectorAll('#bw-watermark .bw-wm-fx')].map((f) => [getComputedStyle(f).pointerEvents, ...[...f.children].map((c) => getComputedStyle(c).pointerEvents)]).flat(), stage: (() => { const b = document.querySelector('#bw-watermark .bw-wm-stage').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(), wmPE: getComputedStyle(document.getElementById('bw-watermark')).pointerEvents }));
    check('AC6: no Audio / AudioContext object is created', after.audio === 0, String(after.audio));
    check('AC6: the live region text is unchanged by W01-W20', before.live === after.live, `${before.live} -> ${after.live}`);
    check('AC6: the document, the undo history and the settings are unchanged by every reaction', before.doc === after.doc && before.ops === after.ops && before.ls === after.ls);
    check('AC6: the mark takes no pointer events outside its 84 px box (effects and the wrapper are pointer-events none)', after.stage[0] === 84 && after.stage[1] === 84 && after.fx.every((x) => x === 'none') && after.wmPE === 'none', JSON.stringify(after.fx) + after.wmPE);
    await ctx.close();
  }

  /* ── AC3: the actions, through the real paths and the bw:wm contract ──── */
  {
    const { ctx, page } = await open({ clock: true });
    const adv = (ms) => page.clock.runFor(ms);
    const lastId = () => WM(page, (W) => W.last()?.id ?? null);
    const nPlays = () => WM(page, (W) => W.stats().plays.length);
    const fire = (id, detail = {}) => page.evaluate(([i, d]) => window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: i, ...d } })), [id, detail]);
    const step = async (name, fn, want) => { const n0 = await nPlays(); await fn(); await adv(2600); const n1 = await nPlays(); const id = await lastId(); check(`AC3: ${name}`, n1 === n0 + 1 && id === want, `${n0}->${n1} last ${id}`); await adv(9000); };
    await step('Save (runAction save) triggers W01', () => page.evaluate(() => window.BW.runAction('save')), 'W01');
    await step('an export that finished OK triggers W02 (export event)', () => page.evaluate(() => window.BW.emit('export', { pdf: true })), 'W02');
    await step('undo triggers W03 (commit kind undo)', () => page.evaluate(() => window.BW.emit('commit', [], 'ar', 'undo')), 'W03');
    await step('a spelling suggestion applied (bw:wm W04 on window) triggers W04', () => fire('W04'), 'W04');
    await step('a ribbon tab switch (bw:wm W05) triggers W05', () => fire('W05', { dir: -1 }), 'W05');
    // a second tab switch within 8 s does not
    await fire('W05'); await adv(5000);
    const n = await nPlays(); await fire('W05'); await adv(2600);
    check('AC3: a second tab switch within 8 s does not play', (await nPlays()) === n);
    await adv(9000);
    await step('server online triggers W07', () => fire('W07'), 'W07');
    await step('server offline triggers W08', () => fire('W08'), 'W08');
    await step('a finished project import triggers W09', () => fire('W09'), 'W09');
    await step('the event on document works too (the other lane may dispatch there)', () => page.evaluate(() => document.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W04' } }))), 'W04');
    // undo burst: 5 undos in 1 s = one W03
    await adv(9000);
    const b0 = await WM(page, (W) => W.stats().plays.filter((p) => p.id === 'W03').length);
    for (let i = 0; i < 5; i += 1) { await page.evaluate(() => window.BW.emit('commit', [], 'ar', 'undo')); await adv(200); }
    await adv(3000);
    const b1 = await WM(page, (W) => W.stats().plays.filter((p) => p.id === 'W03').length);
    check('AC2: 5 undo presses in 1 s produce exactly 1 W03', b1 === b0 + 1, `${b0}->${b1}`);
    await ctx.close();
  }
  {
    // W10: the first load in a browser session, once; a reload in the same session does not repeat it (real time)
    const { ctx, page } = await open();
    await page.waitForFunction(() => window.BW.EXT.watermark.stats().plays.some((p) => p.id === 'W10'), null, { timeout: 5000 }).then(() => check('AC3: the first load in a session plays W10', true), () => check('AC3: the first load in a session plays W10', false));
    await page.reload(); await page.waitForFunction(() => window.BW?.ready); await page.waitForTimeout(2500);
    const again = await WM(page, (W) => W.stats().plays.some((p) => p.id === 'W10'));
    check('AC3: a reload in the same session does not repeat W10', again === false);
    await ctx.close();
  }
  {
    // W06: 3 idle minutes; a keypress resets the idle count
    const { ctx, page } = await open({ clock: true });
    const adv = (ms) => page.clock.runFor(ms);
    const yawns = () => WM(page, (W) => W.stats().plays.filter((p) => p.id === 'W06').length);
    await adv(140000); // the mark appeared about 30 s ago: 170 s idle so far
    check('AC3: nothing yawns before 3 idle minutes', (await yawns()) === 0);
    await page.keyboard.press('Shift'); // any input resets the count
    await adv(170000);
    check('AC3: a keypress resets the idle count (no W06 170 s later)', (await yawns()) === 0);
    await adv(20000);
    check('AC3: 3 idle minutes trigger W06', (await yawns()) === 1, String(await yawns()));
    await adv(400000);
    check('AC3: at most 3 yawns per idle period', (await yawns()) <= 3 && (await yawns()) >= 2, String(await yawns()));
    await ctx.close();
  }

  /* ── AC2: rates over 10 simulated minutes of mixed input ───────────────── */
  {
    const { ctx, page } = await open({ clock: true });
    const adv = (ms) => page.clock.runFor(ms);
    const keyTimes = [];
    const T = () => page.evaluate(() => Date.now());
    const t0 = await T();
    for (let sec = 0; sec < 600; sec += 5) {
      if (sec % 60 < 20) { await page.keyboard.press('a'); keyTimes.push((await T()) - t0); }
      await adv(5000);
    }
    const stats = await WM(page, (W) => W.stats());
    const plays = stats.plays.map((p) => ({ ...p, rel: p.at - t0 }));
    check('AC2: at most 12 reactions of any kind in any 10 simulated minutes', plays.every((p) => plays.filter((q) => q.at >= p.at && q.at < p.at + 600000).length <= 12), String(plays.length));
    check('AC2: random reactions did run (the scheduler is alive)', plays.some((p) => /^W1[1-9]$/.test(p.id)), plays.map((p) => p.id).join(','));
    const spec = await WM(page, (W) => Object.fromEntries(W.ids().map((i) => [i, W.spec(i).ms])));
    let overlap = 0;
    for (let i = 1; i < plays.length; i += 1) if (plays[i].at - plays[i - 1].at < spec[plays[i - 1].id] - 5) overlap += 1;
    check('AC2: never two overlapping', overlap === 0, String(overlap));
    const rnd = plays.filter((p) => /^W1[1-9]$/.test(p.id));
    check('AC2: at least 10 s between random ones', rnd.every((p, i) => i === 0 || p.at - rnd[i - 1].at >= 10000), rnd.map((p) => p.rel).join(','));
    const typed = plays.filter((p) => keyTimes.some((k) => p.rel - k >= 0 && p.rel - k < 2000));
    check('AC2: none within 2 s of a keypress', typed.length === 0, typed.map((p) => `${p.id}@${p.rel}`).join(' '));
    check('AC2: at least 25 s between a random one and the reaction before it (random gap 25-70 s)', rnd.every((p) => { const before = plays.filter((q) => q.at < p.at).at(-1); return !before || p.at - before.at >= 24000; }), '');
    await ctx.close();
  }

  /* ── AC4: reduced motion and calm ─────────────────────────────────────── */
  for (const mode of ['reduced', 'calm']) {
    const { ctx, page } = await open({ clock: true, reduced: mode === 'reduced' });
    if (mode === 'calm') await page.evaluate(() => { document.documentElement.dataset.bwCalm = '1'; });
    const adv = (ms) => page.clock.runFor(ms);
    await adv(600000);
    const rnd = await WM(page, (W) => W.stats().plays.filter((p) => /^W1[1-9]$/.test(p.id)).length);
    check(`AC4 (${mode}): 0 random reactions in 10 simulated minutes`, rnd === 0, String(rnd));
    const rows = [];
    for (const id of ['W01', 'W03', 'W05', 'W07', 'W09']) {
      await adv(9000);
      rows.push(await page.evaluate((i) => { const W = window.BW.EXT.watermark; W.trigger(i); const an = W.animations(); return { id: i, n: an.length, props: [...new Set(an.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)), dur: an.map((a) => a.effect.getComputedTiming().duration) }; }, id));
    }
    check(`AC4 (${mode}): every action trigger is only an opacity change`, rows.every((r) => r.n >= 1 && r.props.length === 1 && r.props[0] === 'opacity'), JSON.stringify(rows));
    check(`AC4 (${mode}): the pulse is 240 ms`, rows.every((r) => r.dur.every((d) => d === 240)), JSON.stringify(rows.map((r) => r.dur)));
    // easter egg: a still role switch, no transform
    await adv(70000);
    const egg = await page.evaluate(async () => {
      const stage = document.querySelector('#bw-watermark .bw-wm-stage'); const r0 = window.BW_WM.current();
      for (let i = 0; i < 7; i += 1) stage.click();
      const an = window.BW.EXT.watermark.animations();
      const props = [...new Set(an.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k))))].filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k));
      return { r0, r1: window.BW_WM.current(), props, dur: an.map((a) => a.effect.getComputedTiming().duration) };
    });
    check(`AC4 (${mode}): W20 is a still (the role advanced, an opacity hold of 1.5 s, no transform)`, egg.props.length === 1 && egg.props[0] === 'opacity' && egg.dur.includes(1500), JSON.stringify(egg));
    await ctx.close();
  }

  /* ── AC5: the easter egg ─────────────────────────────────────────────── */
  {
    const { ctx, page } = await open({ clock: true });
    const adv = (ms) => page.clock.runFor(ms);
    const eggs = () => WM(page, (W) => W.stats().plays.filter((p) => p.id === 'W20').length);
    const click = (n, gap) => (async () => { const roles = []; for (let i = 0; i < n; i += 1) { roles.push(await page.evaluate(() => { document.querySelector('#bw-watermark .bw-wm-stage').click(); return window.BW_WM.current(); })); await adv(gap); } return roles; })();
    await adv(20000);
    await click(6, 300); await adv(500);
    check('AC5: 6 clicks within 3 s do not trigger W20', (await eggs()) === 0);
    await adv(5000);
    const roles = await click(7, 300);
    await adv(200);
    check('AC5: 7 clicks within 3 s trigger W20, exactly once', (await eggs()) === 1, String(await eggs()));
    check('AC5: each of the 7 clicks still advanced the role image', new Set(roles.slice(0, 4)).size === 4 && roles[0] !== roles[1], roles.join(','));
    await adv(5000);
    await click(7, 300); await adv(200);
    check('AC5: a second attempt within 60 s does not replay', (await eggs()) === 1, String(await eggs()));
    await adv(65000);
    await click(7, 800); await adv(300);
    check('AC5: 7 clicks spread over 5 s do not trigger it', (await eggs()) === 1, String(await eggs()));
    await adv(5000);
    // Enter / Space on the focused mark count the same
    await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-stage').focus());
    for (let i = 0; i < 7; i += 1) { await page.keyboard.press(i % 2 ? 'Enter' : 'Space'); await adv(250); }
    await adv(200);
    check('AC5: Enter and Space on the focused mark count the same', (await eggs()) === 2, String(await eggs()));
    await ctx.close();
  }

  /* ── perf boosters 3 and 4: the typing path ──────────────────────────── */
  {
    const { ctx, page } = await open({ clock: false });
    const r = await page.evaluate(async () => {
      const out = {};
      const tableSW = (() => { let n = 0; const d = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollWidth'); Object.defineProperty(Element.prototype, 'scrollWidth', { ...d, get() { if (this.tagName === 'TABLE') n += 1; return d.get.call(this); } }); return () => n; })();
      const barOH = (() => { let n = 0; const d = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML'); Object.defineProperty(Element.prototype, 'outerHTML', { ...d, get() { if (this.classList?.contains('island')) n += 1; return d.get.call(this); } }); return () => n; })();
      const p = document.querySelector('#bw-pair main.bw-doc [data-p]');
      p.focus();
      const s0 = tableSW(), o0 = barOH();
      for (let i = 0; i < 10; i += 1) { window.BW.setText(p.dataset.p, p.textContent + 'x'); await new Promise((q) => setTimeout(q, 30)); }
      out.tableScrollWidthPerKey = (tableSW() - s0) / 10;
      out.barOuterHtmlPerKey = (barOH() - o0) / 10;
      out.validate = window.BW.validate().length;
      return out;
    });
    check('booster 3: ten keystrokes read no table scrollWidth (it was one per table per key)', r.tableScrollWidthPerKey === 0, JSON.stringify(r));
    check('booster 4: ten keystrokes serialise the toolbar zero times (fitBar signature)', r.barOuterHtmlPerKey === 0, JSON.stringify(r));
    // the answers are still right: a table that overflows is still reported, after a table edit
    const ov = await page.evaluate(async () => {
      const tb = document.querySelector('#bw-pair main.bw-doc table');
      if (!tb) return { skip: true };
      const before = window.BW.validate().filter((x) => x[0] === 'warn').length;
      tb.style.minWidth = '3000px'; await new Promise((q) => setTimeout(q, 30));
      const after = window.BW.validate().filter((x) => x[0] === 'warn').length;
      tb.style.minWidth = ''; await new Promise((q) => setTimeout(q, 30));
      const back = window.BW.validate().filter((x) => x[0] === 'warn').length;
      return { before, after, back };
    });
    check('booster 3: an overflowing table is still flagged (and the flag clears when it fits again)', ov.skip || (ov.after === ov.before + 1 && ov.back === ov.before), JSON.stringify(ov));
    await ctx.close();
  }
} finally { await browser.close(); }

for (const r of results) console.log(r);
console.log(`core-0150: ${results.length - failed}/${results.length} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
