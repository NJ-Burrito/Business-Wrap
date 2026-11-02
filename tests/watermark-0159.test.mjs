// 0.15.9 mark lane (bw-0159): the owner's NJ mark (#bw-watermark, editor/ext/34-watermark.js) must always show at the bottom left of the editor and
// every behaviour of its header comment must work, in REAL Chrome, on the built editor served over http (127.0.0.1, a free port) as the owner runs it.
//   M1 visible: rect inside the viewport, opacity >= 0.85 after the intro, top of the stack at several points of it (elementFromPoint), not behind the
//      panel, ribbon, backdrop or a toast; ar + en, light + dark, 1024 to 2560 wide, page zoom 75 to 150 % (= a narrower viewport at a higher device
//      scale factor), scrolled top and bottom, side panel open, library view and document view.
//   M2 role change on click, Enter and Space, the role word rising letter by letter.   M3 idle float and pointer tilt.
//   M4 the intro plays once per browser and a click skips it.   M5 W01-W10 on their triggers, W11-W19 random, under their documented limits.
//   M6 W20: seven clicks in 3 s run in full.   M7 print and exports do not contain it.
//   R  ROOT CAUSE guard: the editors the tool itself builds for the user (cli open / create / build, the MCP build tool) carry the mark; they were
//      built with `watermarkDir: null` (no image data, so nothing could ever show) and the owner's editor on 127.0.0.1:4317 had no mark at all.
// Every probe first asserts that it looked (R15): the mark exists, the app is ready, one known-true sample. Closes its browser and server.
//
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/watermark-0159.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'watermark-0159');
fs.mkdirSync(OUT, { recursive: true });
const WMDIR = path.join(REPO, 'editor', 'brand', 'watermark');
const file = path.join(OUT, 'mark.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'mark-0159', watermarkDir: WMDIR });

let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  - ' + detail : ''}`); if (!ok) failed += 1; };
const srv = await serve(file, 0);
const URL = `http://127.0.0.1:${srv.address().port}/?session=s0159&tab=t0159`;
const browser = await chromium.launch(launchOptions());

/** A page like the owner's: http, a seen intro (unless fresh), a fake offset clock for the rate rules, welcome already done (unless welcome). */
async function open({ ui = 'ar', dark = false, calm = false, width = 1920, height = 1080, zoom = 1, fresh = false, welcome = false, clock = false, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: Math.round(width / zoom), height: Math.round(height / zoom) }, deviceScaleFactor: zoom, reducedMotion });
  await ctx.addInitScript(([u, d, c, fr, w]) => {
    try {
      if (!sessionStorage.getItem('bw-test-init')) {
        sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', c ? '1' : '0'); localStorage.setItem('bw:rb:c', '0');
        if (!fr) localStorage.setItem('bw:wm-intro', '1');
        if (!w) sessionStorage.setItem('bw:wm-welcome', '1');
      }
    } catch { /* storage unavailable */ }
    window.__off = 0; const real = Date.now.bind(Date); Date.now = () => real() + window.__off;
  }, [ui, dark, calm, fresh, welcome]);
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.BW?.ready && window.BW_WM, null, { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(clock ? 300 : 900);
  return { ctx, page, errors };
}

/** M1 numbers: everything measured in the page, at this moment. */
const measure = (page) => page.evaluate(() => {
  const wm = document.getElementById('bw-watermark');
  if (!wm) return null;
  const st = wm.querySelector('.bw-wm-stage').getBoundingClientRect();
  const tg = wm.querySelector('.bw-wm-tag').getBoundingClientRect();
  const cs = getComputedStyle(wm);
  const pts = [[.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]].map(([x, y]) => document.elementFromPoint(st.left + st.width * x, st.top + st.height * y));
  const inside = pts.every((e) => !!e?.closest?.('#bw-watermark'));
  const toast = document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.toasts .toast')?.getBoundingClientRect();
  const hit = toast && !(toast.right < st.left || toast.left > st.right || toast.bottom < st.top || toast.top > st.bottom);
  return { l: Math.round(st.left), t: Math.round(st.top), w: Math.round(st.width), h: Math.round(st.height), r: Math.round(innerWidth - st.right), b: Math.round(innerHeight - st.bottom),
    tagB: Math.round(innerHeight - tg.bottom), op: +cs.opacity, disp: cs.display, vis: cs.visibility, inside, topTags: pts.map((e) => e?.tagName + '.' + (e?.className?.baseVal ?? e?.className)).slice(0, 2), toast: !!toast, hit: !!hit,
    on: wm.querySelectorAll('img.on').length, intro: wm.dataset.intro, vw: innerWidth, vh: innerHeight };
});
const m1ok = (m) => !!m && m.disp !== 'none' && m.vis === 'visible' && m.w >= 80 && m.l >= 0 && m.t >= 0 && m.r >= 0 && m.b >= 0 && m.tagB >= 0 && m.op >= 0.85 && m.inside && m.on === 1 && !m.hit;
const sh = (page, fn, arg) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot, ${JSON.stringify(arg ?? null)})`);

try {
  // ── ready-state proof (R15): the sample's mark exists with its 4 roles + intro and a known-true size ──
  {
    const { ctx, page, errors } = await open();
    const m = await measure(page);
    check('looked: editor ready over http, the mark is mounted with 4 roles + intro and an 84 px stage at the bottom-left', !!m && m.w === 84 && m.h === 84 && m.l === 16, JSON.stringify(m));
    check('looked: BW_WM.roles() = tester, teacher, volunteer, professional', JSON.stringify(await page.evaluate(() => window.BW_WM.roles())) === '["tester","teacher","volunteer","professional"]');
    check('no page errors on boot', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── M1 across language, theme, width, scroll, panels ──────────────────────────────────────────────────
  const shots = [];
  for (const ui of ['ar', 'en']) for (const dark of [false, true]) for (const width of [1024, 1366, 1920, 2560]) {
    const { ctx, page } = await open({ ui, dark, width, height: Math.round(width * 0.5625) });
    const tag = `M1 ${ui} ${dark ? 'dark' : 'light'} ${width}`;
    const states = [];
    states.push(['top', await measure(page)]);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    states.push(['bottom', await measure(page)]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => window.BW.EXT.look.backdrop() && 0);
    await page.evaluate(() => window.BW.openDrawer('theme'));
    await page.waitForTimeout(450);
    states.push(['side panel (theme)', await measure(page)]);
    await page.evaluate(() => window.BW.openDrawer('library'));
    await page.waitForTimeout(450);
    states.push(['library view', await measure(page)]);
    await page.evaluate(() => window.BW.toast('probe toast', 'info'));
    await page.waitForTimeout(450);
    states.push(['with a toast', await measure(page)]);
    for (const [name, m] of states) check(`${tag}: ${name}: visible (in viewport, opacity>=.85, top of stack, not behind panel/ribbon/backdrop/toast)`, m1ok(m), JSON.stringify(m));
    if (width === 1920) shots.push([`m1-${ui}-${dark ? 'dark' : 'light'}.png`, page]);
    if (width === 1920) await page.screenshot({ path: path.join(OUT, `m1-${ui}-${dark ? 'dark' : 'light'}.png`) });
    await ctx.close();
  }
  // page zoom 75 and 150 % (a real browser zoom shrinks the CSS viewport and raises the device scale factor)
  for (const [width, zoom] of [[1024, 0.75], [1024, 1.5], [1920, 1.5], [2560, 0.75], [2560, 1.5]]) {
    for (const dark of [false, true]) {
      const { ctx, page } = await open({ ui: dark ? 'ar' : 'en', dark, width, height: Math.round(width * 0.5625), zoom });
      const m = await measure(page);
      check(`M1 zoom ${zoom * 100}% ${width} ${dark ? 'dark ar' : 'light en'}: visible at the bottom-left (css viewport ${m?.vw}x${m?.vh})`, m1ok(m) && m.l === 16 && m.b >= 16 && m.b <= 40, JSON.stringify(m));
      await ctx.close();
    }
  }
  // a document with the ribbon open and the selection strip reaching the bottom: the mark must stay top of the stack at 1920x1200 (the owner's screen)
  {
    const { ctx, page } = await open({ ui: 'ar', width: 1920, height: 1200 });
    await page.evaluate(() => window.scrollTo(0, 2400));
    await page.waitForTimeout(150);
    const m = await measure(page);
    check('M1 owner screen 1920x1200 scrolled into the document, ar: visible and clickable', m1ok(m), JSON.stringify(m));
    await page.screenshot({ path: path.join(OUT, 'm1-owner-1920x1200.png') });
    await ctx.close();
  }
  // library view in the CLI/MCP-built editors is covered by R below; calm mode and focus mode keep the mark visible too
  {
    const { ctx, page } = await open({ calm: true });
    check('M1 calm mode: visible', m1ok(await measure(page)));
    await page.evaluate(() => { window.BW.S.focus = true; });
    await page.waitForTimeout(100);
    check('M1 focus mode flag set: the mark is still visible (reactions pause, the mark does not)', m1ok(await measure(page)));
    await ctx.close();
  }

  // ── M2 role change, letter-by-letter rise ─────────────────────────────────────────────────────────────
  for (const ui of ['en', 'ar']) {
    const { ctx, page } = await open({ ui });
    const role = () => page.evaluate(() => ({ r: window.BW_WM.current(), tag: document.querySelector('#bw-watermark .bw-wm-tag').textContent, on: document.querySelector('#bw-watermark img.on')?.dataset.i, spans: document.querySelectorAll('#bw-watermark .bw-wm-tag i').length,
      anims: [...document.querySelectorAll('#bw-watermark .bw-wm-tag i')].map((e) => e.getAnimations().map((a) => ({ delay: a.effect.getTiming().delay, dur: a.effect.getTiming().duration })))[0] }));
    const r0 = await role();
    check(`M2 ${ui}: starts on tester with its word`, r0.r === 'tester' && r0.tag === (ui === 'ar' ? 'يختبر' : 'TESTER'), JSON.stringify(r0));
    await page.locator('#bw-watermark .bw-wm-stage').click();
    const r1 = await role();
    check(`M2 ${ui}: click -> teacher, the word rises (${ui === 'en' ? 'one span per letter' : 'one piece'}, 560 ms)`, r1.r === 'teacher' && r1.on !== r0.on && r1.spans === (ui === 'en' ? 'TEACHER'.length : 1) && r1.anims?.[0]?.dur === 560, JSON.stringify(r1));
    if (ui === 'en') {
      const delays = await page.evaluate(() => [...document.querySelectorAll('#bw-watermark .bw-wm-tag i')].map((e) => e.getAnimations()[0]?.effect.getTiming().delay));
      check('M2 en: letter-by-letter 40 ms stagger', delays.length === 7 && delays.every((d, i) => d === i * 40), JSON.stringify(delays));
    }
    await page.locator('#bw-watermark .bw-wm-stage').focus();
    await page.keyboard.press('Enter');
    const r2 = await role();
    await page.keyboard.press('Space');
    const r3 = await role();
    check(`M2 ${ui}: Enter -> volunteer, Space -> professional (keyboard, no scrolling)`, r2.r === 'volunteer' && r3.r === 'professional' && r3.on !== r2.on, JSON.stringify([r2.r, r3.r]));
    check(`M2 ${ui}: the live region announces the new role`, (await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-live').textContent)).length > 3);
    await page.locator('#bw-watermark .bw-wm-stage').click();
    check(`M2 ${ui}: wraps professional -> tester`, (await role()).r === 'tester');
    await ctx.close();
  }

  // ── M3 idle float and pointer tilt ────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open();
    const idle = () => page.evaluate(() => { const a = document.querySelector('#bw-watermark .bw-wm-mark').getAnimations().filter((x) => x.effect.getTiming().iterations === Infinity); return { n: a.length, state: a[0]?.playState, tr: getComputedStyle(document.querySelector('#bw-watermark .bw-wm-mark')).transform }; });
    await page.mouse.move(900, 500);
    await page.waitForTimeout(250);
    const a = await idle(); await page.waitForTimeout(900); const b = await idle();
    check('M3 idle float: one looping animation, running, the transform moves between two samples', a.n === 1 && a.state === 'running' && a.tr !== b.tr, JSON.stringify([a, b]));
    const box = await page.locator('#bw-watermark .bw-wm-stage').boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.waitForTimeout(600);
    const tl = await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-mark').style.transform);
    await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8);
    await page.waitForTimeout(600);
    const tr = await page.evaluate(() => document.querySelector('#bw-watermark .bw-wm-mark').style.transform);
    check('M3 tilt: a pointer on the mark tilts it, differently at the two corners (spring, rotateX/rotateY)', /rotateX/.test(tl) && /rotateX/.test(tr) && tl !== tr, JSON.stringify([tl, tr]));
    await page.mouse.move(900, 500);
    await page.waitForTimeout(1500);
    const back = await idle();
    check('M3 tilt ends: pointer away, the spring settles and the idle float resumes', back.n === 1 && back.state === 'running', JSON.stringify(back));
    await ctx.close();
  }

  // ── M4 the intro plays once per browser; a click skips it ─────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('bw-test-init')) { sessionStorage.setItem('bw-test-init', '1'); localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:rb:c', '0'); sessionStorage.setItem('bw:wm-welcome', '1'); } } catch { /* none */ } });
    const page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForFunction(() => window.BW?.ready && window.BW_WM);
    const s1 = await page.evaluate(() => ({ intro: document.getElementById('bw-watermark').dataset.intro, seen: localStorage.getItem('bw:wm-intro'), introOn: document.querySelector('#bw-watermark img.on')?.dataset.intro, op: +getComputedStyle(document.getElementById('bw-watermark')).opacity }));
    check('M4 first visit: the intro plays (the animated image is shown) and is marked seen; still visible while it plays', s1.intro === 'playing' && s1.seen === '1' && s1.introOn === '1' && s1.op >= 0.85, JSON.stringify(s1));
    await page.screenshot({ path: path.join(OUT, 'm4-intro.png') });
    await page.locator('#bw-watermark .bw-wm-stage').click();
    const s2 = await page.evaluate(() => ({ intro: document.getElementById('bw-watermark').dataset.intro, role: window.BW_WM.current(), introOn: document.querySelector('#bw-watermark img.on')?.dataset.intro }));
    check('M4 a click skips the intro (settles on the first role, no role switch)', s2.intro === 'done' && s2.role === 'tester' && !s2.introOn, JSON.stringify(s2));
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready && window.BW_WM);
    const s3 = await page.evaluate(() => document.getElementById('bw-watermark').dataset.intro);
    check('M4 second visit in the same browser: no intro', s3 === 'done', s3);
    await ctx.close();
  }

  // ── M5 W01-W10 on their triggers, under their limits ──────────────────────────────────────────────────
  {
    const { ctx, page } = await open();
    const adv = (ms) => page.evaluate((ms) => { window.__off += ms; }, ms);
    const wm = (code) => page.evaluate(code);
    const done = async () => { await adv(6000); await page.waitForTimeout(50); };
    const fire = (id) => wm(`(() => { const r = window.BW.EXT.watermark.trigger('${id}'); const l = window.BW.EXT.watermark.last(); return { r, id: l?.id, playing: window.BW.EXT.watermark.isPlaying(), anims: window.BW.EXT.watermark.animations().length, name: l?.name, reduced: l?.reduced }; })()`);
    check('M5 looked: the watermark module is exposed and nothing is playing at rest', await wm('!!window.BW.EXT.watermark && !window.BW.EXT.watermark.isPlaying()'));
    // the real wires: BW.emit('save'|'export') and a commit of kind undo, then the frozen bw:wm event for the others
    const wires = [['W01', "window.BW.emit('save')"], ['W02', "window.BW.emit('export')"], ['W03', "window.BW.emit('commit', [], null, 'undo')"], ['W04', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W04' } }))"],
      ['W05', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W05', dir: 1 } }))"], ['W06', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W06' } }))"], ['W07', "document.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W07' } }))"],
      ['W08', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W08' } }))"], ['W09', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W09' } }))"], ['W10', "window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W10' } }))"]];
    for (const [id, code] of wires) {
      await done();
      await wm(code);
      const s = await wm('(() => { const w = window.BW.EXT.watermark; const l = w.last(); return { id: l?.id, playing: w.isPlaying(), anims: w.animations().length }; })()');
      check(`M5 ${id} fires on its trigger (${code.slice(0, 40)}...)`, s.id === id && s.playing && s.anims >= 1, JSON.stringify(s));
    }
    // limits
    await done();
    const f1 = await fire('W01');
    await adv(1500);
    const f2 = await fire('W04');
    check('M5 limit: a second action reaction within 4 s is dropped (never queued)', f1.r === true && f2.r === false && f2.id === 'W01', JSON.stringify([f1, f2]));
    await done();
    await fire('W05');
    await adv(5000);
    const w5 = await fire('W05');
    check('M5 limit: a tab tick (W05) at most once per 8 s', w5.r === false, JSON.stringify(w5));
    await done();
    // one at a time: a trigger while one plays is dropped
    await wm("window.BW.EXT.watermark.play('W20')");
    const during = await fire('W02');
    check('M5 limit: one reaction at a time (a trigger while W20 plays is dropped)', during.r === false, JSON.stringify(during));
    await done();
    // typing: nothing within 2 s of a key press (an action reaction waits <= 2 s, never plays at once)
    const before = await wm('window.BW.EXT.watermark.stats().plays.length');
    await page.locator('main.bw-doc [data-p]').first().click();
    await page.keyboard.type('x');
    const ty = await fire('W01');
    const mid = await wm('window.BW.EXT.watermark.stats().plays.length');
    check('M5 limit: while the person typed in the last 2 s an action reaction does not play at once', mid === before, JSON.stringify([before, mid, ty]));
    await page.keyboard.press('Control+z');
    await adv(8000);
    await page.waitForTimeout(2800);
    // focus mode, zoom above 200 %, hidden tab
    await done();
    await wm('window.BW.S.focus = true');
    const ff = await fire('W07');
    await wm('window.BW.S.focus = false');
    await done();
    const zoomBefore = await wm('window.BW.S.zoom');
    await wm('window.BW.S.zoom = 2.5');
    const fz = await fire('W07');
    await wm(`window.BW.S.zoom = ${JSON.stringify(zoomBefore)}`);
    await done();
    await wm("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })");
    const fh = await fire('W07');
    await wm("delete document.hidden");
    check('M5 limit: nothing in focus mode, above 200 % zoom, or in a hidden tab', ff.r === false && fz.r === false && fh.r === false, JSON.stringify([ff.r, fz.r, fh.r]));
    await done();
    // at most 12 reactions per 10 minutes
    await adv(700000); // the earlier checks used some of the 12; a quiet 10 minutes empties the window
    let ok = 0, last;
    for (let i = 0; i < 16; i += 1) { await adv(5000); last = await fire(['W01', 'W02', 'W03', 'W04'][i % 4]); if (last.r) ok += 1; await page.waitForTimeout(20); }
    check('M5 limit: exactly 12 reactions per 10 minutes, the 13th and later are dropped', ok === 12 && last.r === false, JSON.stringify({ ok, last }));
    await ctx.close();

    // calm mode: random off, an action reaction is a 240 ms opacity pulse
    const c = await open({ calm: true });
    const cr = await c.page.evaluate(() => { const w = window.BW.EXT.watermark; const t = w.trigger('W11'); const a = w.trigger('W03'); const l = w.last(); return { random: t, action: a, ms: l?.ms, reduced: l?.reduced, id: l?.id }; });
    check('M5 calm mode: a random reaction does not play; an action reaction is a 240 ms opacity pulse', cr.random === false && cr.action === true && cr.ms === 240 && cr.reduced === true && cr.id === 'W03', JSON.stringify(cr));
    await c.ctx.close();

    // welcome W10 once per browser session (real wire: bw:ready after boot)
    const w = await open({ welcome: true });
    await w.page.waitForFunction(() => window.BW.EXT.watermark.last()?.id === 'W10', null, { timeout: 5000 }).then(() => check('M5 W10 welcome wave plays on ready (once per session)', true), () => check('M5 W10 welcome wave plays on ready (once per session)', false, JSON.stringify(null)));
    await w.ctx.close();
  }

  // W11-W19: the random reactions, from the real scheduler (25 to 70 s) on a controllable clock, then the hover hop
  {
    const { ctx, page } = await open({ clock: true });
    check('M5 looked (clock): the mark is mounted before the random schedule is advanced', !!(await measure(page)));
    const seenIds = [];
    for (let i = 0; i < 14; i += 1) {
      await page.clock.fastForward(75000);
      await page.waitForTimeout(80);
      const l = await page.evaluate(() => window.BW.EXT.watermark.stats().plays.map((p) => p.id));
      seenIds.splice(0, seenIds.length, ...l);
    }
    const randoms = seenIds.filter((id) => /^W1[1-9]$/.test(id));
    const others = seenIds.filter((id) => !/^W1[1-9]$/.test(id));
    check('M5 W11-W19: the scheduler plays each of the nine random reactions once per shuffle bag (the first nine are all different); the only other id is the idle yawn W06', new Set(randoms.slice(0, 9)).size === 9 && others.every((id) => id === 'W06'), JSON.stringify(seenIds));
    await ctx.close();
    const h = await open();
    const box = await h.page.locator('#bw-watermark .bw-wm-stage').boundingBox();
    await h.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await h.page.waitForTimeout(150);
    const hop = await h.page.evaluate(() => window.BW.EXT.watermark.last()?.id);
    check('M5 hover plays the hop (W11)', hop === 'W11', String(hop));
    await h.ctx.close();
  }

  // ── M6 the easter egg ──────────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open();
    const stage = page.locator('#bw-watermark .bw-wm-stage');
    for (let i = 0; i < 6; i += 1) await stage.click({ delay: 20 });
    const six = await page.evaluate(() => ({ id: window.BW.EXT.watermark.last()?.id, plays: window.BW.EXT.watermark.stats().plays.map((p) => p.id) }));
    check('M6 six clicks do not run W20', !six.plays.includes('W20'), JSON.stringify(six));
    await page.waitForTimeout(3300);
    for (let i = 0; i < 7; i += 1) await stage.click({ delay: 20 });
    const t0 = Date.now();
    const egg = await page.evaluate(() => { const w = window.BW.EXT.watermark; const l = w.last(); return { id: l?.id, ms: l?.ms, playing: w.isPlaying(), anims: w.animations().length, kind: l?.kind }; });
    check('M6 seven clicks in 3 s run W20 (lucky-seven, 1800 ms, the mark + three rings)', egg.id === 'W20' && egg.ms === 1800 && egg.playing && egg.anims === 5, JSON.stringify(egg));
    const timing = await page.evaluate(() => window.BW.EXT.watermark.animations().map((a) => ({ d: a.effect.getTiming().duration, delay: a.effect.getTiming().delay })));
    check('M6 the egg runs in full: its animations end at 1800 ms and finish', Math.max(...timing.map((x) => x.d + x.delay)) <= 1800 && Math.max(...timing.map((x) => x.d + x.delay)) >= 1560, JSON.stringify(timing));
    await page.waitForFunction(() => !window.BW.EXT.watermark.isPlaying(), null, { timeout: 4000 }).then(() => check('M6 the egg finishes by itself (nothing left playing)', true), () => check('M6 the egg finishes by itself (nothing left playing)', false));
    void t0;
    // a second egg inside 60 s does not run
    const n0 = await page.evaluate(() => window.BW.EXT.watermark.stats().plays.filter((p) => p.id === 'W20').length);
    for (let i = 0; i < 7; i += 1) await stage.click({ delay: 20 });
    const n1 = await page.evaluate(() => window.BW.EXT.watermark.stats().plays.filter((p) => p.id === 'W20').length);
    check('M6 a second egg within 60 s is not run', n0 === 1 && n1 === 1, `${n0} ${n1}`);
    await ctx.close();
    // seven presses on the keyboard count too
    const k = await open();
    await k.page.locator('#bw-watermark .bw-wm-stage').focus();
    for (let i = 0; i < 7; i += 1) await k.page.keyboard.press('Enter');
    check('M6 seven Enter presses run it too', (await k.page.evaluate(() => window.BW.EXT.watermark.last()?.id)) === 'W20');
    await k.ctx.close();
  }

  // ── M7 print and exports ───────────────────────────────────────────────────────────────────────────────
  {
    const { ctx, page } = await open();
    const before = await measure(page);
    await page.emulateMedia({ media: 'print' });
    const pr = await page.evaluate(() => { const e = document.getElementById('bw-watermark'); const r = e.getBoundingClientRect(); return { disp: getComputedStyle(e).display, w: r.width, bd: getComputedStyle(document.getElementById('bw-backdrop')).display }; });
    check('M7 looked + print: visible on screen first, then display:none in print', m1ok(before) && pr.disp === 'none' && pr.w === 0, JSON.stringify([before?.disp, pr]));
    const pdf = path.join(OUT, 'print.pdf');
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const bytes = fs.readFileSync(pdf);
    check('M7 the printed PDF holds no image from the mark (no WebP stream, no /Subtype /Image)', bytes.length > 2000 && !/\/Subtype\s*\/Image/.test(bytes.toString('latin1')), `${bytes.length} bytes`);
    await page.emulateMedia({ media: 'screen' });
    const dl = page.waitForEvent('download', { timeout: 15000 });
    await page.evaluate(() => window.BW.saveHtml?.() ?? window.BW.runAction('saveHtml'));
    const saved = fs.readFileSync(await (await dl).path(), 'utf8');
    const b64 = fs.readFileSync(path.join(WMDIR, 'nj-avatar-teacher.webp')).toString('base64').slice(0, 60);
    check('M7 looked + Save-HTML: a real saved file carries no mark element and no mark image data', saved.length > 100000 && !saved.includes('id="bw-watermark') && !saved.includes(b64), `${saved.length}`);
    await ctx.close();
  }

  // ── R root cause: the editors the tool builds for the user carry the mark ──────────────────────────────
  {
    const cli = fs.readFileSync(path.join(REPO, 'engine', 'cli.mjs'), 'utf8');
    const mcp = fs.readFileSync(path.join(REPO, 'mcp', 'server.mjs'), 'utf8');
    const nulls = [...cli.matchAll(/buildEditor\([^\n]*watermarkDir:\s*(null|'')/g)].length + [...mcp.matchAll(/buildEditor\([^\n]*watermarkDir:\s*(null|'')/g)].length;
    check('R no editor the CLI (open, create, build) or the MCP build tool makes for the user is built with watermarkDir null/empty (that left it with no image data)', nulls === 0, `${nulls} call(s) still pass a null/empty watermarkDir`);
    const { build } = await import('../engine/cli.mjs');
    const out = path.join(OUT, 'cli-built.editor.html');
    build({ inputs: [path.join(REPO, 'samples', 'event-permit')], out });
    const srv2 = await serve(out, 0);
    try {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1200 } });
      await ctx.addInitScript(() => { try { localStorage.setItem('bw:wm-intro', '1'); sessionStorage.setItem('bw:wm-welcome', '1'); localStorage.setItem('bw:rb:c', '0'); } catch { /* none */ } });
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${srv2.address().port}/?session=s1&tab=t1`);
      await page.waitForFunction(() => window.BW?.ready);
      await page.waitForTimeout(900);
      const m = await measure(page);
      check('R an editor built by `business-wrap build` shows the mark (looked: BW.ready first)', m1ok(m), JSON.stringify(m));
      await page.screenshot({ path: path.join(OUT, 'r-cli-built.png') });
      await ctx.close();
    } finally { srv2.close(); }
  }
} finally {
  await browser.close();
  srv.close();
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
