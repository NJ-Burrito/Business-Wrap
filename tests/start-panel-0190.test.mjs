// 0.19.0 N4: the start page side panel and its per-type thumbnail moves (editor/ext/50-start.*; treatment work/sdlc/design/0190-motion.md).
// Real headless Chrome, real mouse and keyboard, the editor bundle with the real registry payload embedded (contract C2), over file:// with ?start=1, English and Arabic:
//   - clicking a tile opens the side panel on the inline-end side (right in English, left in Arabic) with the type's purpose, when to use it, its sections
//     (= the chapter titles of its starter in that language) and who uses it (templates/_doctypes/_info.json through payload().info), and Create
//   - Esc and the close button return focus to the tile; Tab and Shift+Tab stay inside the panel; Create from the panel creates that docType
//   - each of the 17 types has its own move (17 distinct), an animation runs on its stage, ends within 900 ms of its start and lands on its end frame;
//     under Calm no animation runs and that same end frame shows (compared property by property)
//   - 1024 px: the panel fits, Create is on screen, no sideways scroll, no tile centre under the panel; widths 360 / 400 / 440 at 1024 / 1366 / 1920
//   - a raster thumbnail (N3's thumb.{ar,en}) shows as an image, not mirrored, and the move still plays over it
//   node tests/start-panel-0190.test.mjs     (BW_PANEL_SHOTS=<dir> keeps the screenshots)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { startPayload } from './fixtures/doctypes/stub.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-panel190-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const shots = process.env.BW_PANEL_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  start-panel-0190: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };

const { payload: REAL, real } = startPayload();
check('the registry is the real one (17 types), each with its info block (purpose, whenToUse, audience in ar and en)', real && REAL.types.length === 17 && REAL.types.every((t) => ['purpose', 'whenToUse', 'audience'].every((k) => t.info?.[k]?.ar && t.info?.[k]?.en)), `real ${real}, ${REAL.types.length} types`);
check('no visible tashkeel in the panel strings or the info file', !/[ً-ْٰ]/.test(fs.readFileSync(path.join(REPO, 'editor', 'ext', '50-start.i18n.json'), 'utf8') + fs.readFileSync(path.join(REPO, 'templates', '_doctypes', '_info.json'), 'utf8')));
// a raster thumbnail on one type (N3 delivers thumb.{ar,en} as data URIs): a 3 x 4 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAECAIAAADETxJQAAAAEUlEQVR4nGP49esnBDHgZQEAvoIjHRXv6TcAAAAASUVORK5CYII=';
const PL = { ...REAL, types: REAL.types.map((t) => (t.id === 'minutes' ? { ...t, thumb: { ar: PNG, en: PNG } } : t)) };
const TYPES = PL.types;
const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');
const plain = path.join(tmp, 'plain.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: plain, set: 'start-panel-0190', watermarkDir: null });
const withTypes = path.join(tmp, 'types.html');
{
  const html = fs.readFileSync(plain, 'utf8');
  const at = html.indexOf('<script id="bw-app">');
  check('the app script marker is in the built editor', at > 0);
  fs.writeFileSync(withTypes, `${html.slice(0, at)}<script type="application/json" id="bw-doctypes">${json(PL)}</script>\n${html.slice(at)}`, 'utf8');
}

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
async function open({ ui = 'en', w = 1024, h = 720 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((a) => { try { if (!sessionStorage.getItem('bw-seen')) { localStorage.setItem('bw:ui', a.ui); localStorage.removeItem('bw:start'); sessionStorage.setItem('bw-seen', '1'); } } catch { /* storage may be denied */ } }, { ui });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(withTypes).href + '?start=1');
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  return { ctx, page, errors };
}
const D = 'dialog.bw-start';
const P = `${D} [data-st-panel]`;
/** The panel as it stands: side, texts, sections, the stage's move and every animation on the stage (awaited to its end), the end frame. */
const probe = (page, { wait = true } = {}) => page.evaluate(async (wait) => {
  const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start');
  const p = d.querySelector('[data-st-panel]');
  if (!p) return null;
  const st = p.querySelector('.st-stage');
  const anims = st.getAnimations({ subtree: true });
  const fxd = parseFloat(st.style.getPropertyValue('--fx-d')) || 0;
  const ends = anims.map((a) => a.effect.getComputedTiming().endTime);
  if (wait) await Promise.all(anims.map((a) => a.finished.catch(() => null)));
  const frame = [...st.querySelectorAll('.st-sheet, .st-pg, .st-fx, .st-fx *')].map((e) => { const c = getComputedStyle(e); const m = new DOMMatrix(c.transform === 'none' ? undefined : c.transform); return [m.a, m.b, m.c, m.d, m.e, m.f, +c.opacity, parseFloat(c.strokeDashoffset) || 0].map((x) => Math.round(x * 100) / 100); });
  const r = p.getBoundingClientRect(), create = p.querySelector('[data-st-a="create"]').getBoundingClientRect();
  const txt = (s) => p.querySelector(s)?.textContent.trim() ?? null;
  const img = st.querySelector('.st-pg > img');
  return {
    id: p.dataset.type, fx: st.dataset.fx, role: p.getAttribute('role'), left: r.left, right: r.right, width: Math.round(r.width), vw: innerWidth, vh: innerHeight,
    h3: txt('h3'), lang: p.querySelector('h3').lang, purpose: txt('[data-st-info="purpose"]'), when: txt('[data-st-info="whenToUse"]'), audience: txt('[data-st-info="audience"]'),
    sections: [...p.querySelectorAll('[data-st-sections] li')].map((li) => li.textContent.trim()), createBottom: create.bottom, createTop: create.top,
    n: anims.length, played: anims.length > 0 && anims.every((a) => a.playState === 'finished'), longest: ends.length ? Math.max(...ends) - fxd : 0, frame,
    mirror: st.querySelector('.st-sheet').dataset.mirror, fxFlip: (() => { const f = st.querySelector('.st-fx'); return f ? getComputedStyle(f).transform : 'none'; })(),
    img: img ? { ok: img.complete && img.naturalWidth > 0, flip: getComputedStyle(img).transform } : null, svg: !!st.querySelector('.st-pg > svg'),
    panelAnims: p.getAnimations({ subtree: true }).filter((a) => !st.contains(a.effect.target)).length,
  };
}, wait);
const active = (page) => page.evaluate(() => { const a = document.getElementById('bw-ui-host').shadowRoot.activeElement; return { type: a?.dataset?.type || null, inPanel: !!a?.closest?.('[data-st-panel]'), create: !!a?.matches?.('[data-st-a="create"]') }; });
const same = (a, b) => a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((v, j) => Math.abs(v - b[i][j]) <= 0.02));

try {
  for (const ui of ['en', 'ar']) {
    const L = ui.toUpperCase();
    const { page, errors } = await open({ ui });
    const ends = {};
    const bad = { side: [], text: [], sections: [], anim: [], focus: [] };
    const kinds = new Set();
    for (const ty of TYPES) {
      await page.locator(`${D} .st-tile[data-type="${ty.id}"]`).click();
      await page.waitForSelector(P);
      const x = await probe(page);
      kinds.add(x.fx);
      const sideOk = ui === 'en' ? x.right >= x.vw - 24 && x.left > x.vw / 2 : x.left <= 24 && x.right < x.vw / 2;
      if (!sideOk || x.role !== 'dialog') bad.side.push(`${ty.id} ${Math.round(x.left)}-${Math.round(x.right)} ${x.role}`);
      const inf = ty.info;
      if (x.id !== ty.id || x.h3 !== ty.name[ui] || x.lang !== ui || x.purpose !== inf.purpose[ui] || x.when !== inf.whenToUse[ui] || x.audience !== inf.audience[ui]) bad.text.push(`${ty.id} ${JSON.stringify({ h3: x.h3, p: x.purpose?.slice(0, 30) })}`);
      const chapters = (JSON.parse(ty.docs[ui]).chapters || []).map((c) => String(c.title || '').trim()).filter(Boolean);
      if (!chapters.length || JSON.stringify(x.sections) !== JSON.stringify(chapters)) bad.sections.push(`${ty.id}: ${x.sections.length} vs ${chapters.length}`);
      if (!(x.n > 0 && x.played && x.longest > 0 && x.longest <= 900)) bad.anim.push(`${ty.id}/${x.fx}: ${x.n} anims, finished ${x.played}, ${Math.round(x.longest)} ms`);
      ends[ty.id] = x;
      await page.keyboard.press('Escape');
      const a = await active(page);
      if ((await page.locator(P).count()) !== 0 || a.type !== ty.id) bad.focus.push(`${ty.id}: ${JSON.stringify(a)}`);
    }
    check(`${L}: every tile opens the side panel (a dialog) on the ${ui === 'en' ? 'right (inline end)' : 'left (inline end in Arabic)'}`, !bad.side.length, bad.side.slice(0, 3).join(' | '));
    check(`${L}: the panel shows the type's name, purpose, when to use it and who uses it in ${ui} (from _info.json via the payload)`, !bad.text.length, bad.text.slice(0, 3).join(' | '));
    check(`${L}: the sections list is the type's chapter titles, in order, for all 17 types`, !bad.sections.length, bad.sections.slice(0, 3).join(' | '));
    check(`${L}: each type is directed separately: 17 distinct moves`, kinds.size === TYPES.length, [...kinds].join());
    check(`${L}: on every type an animation runs on the stage, finishes, and ends within 900 ms of its start`, !bad.anim.length, bad.anim.slice(0, 4).join(' | '));
    check(`${L}: Esc closes the panel and focus returns to the tile`, !bad.focus.length, bad.focus.slice(0, 3).join(' | '));
    const pf = ends['process-flow'], srs = ends.srs;
    check(`${L}: the stage follows the document language (${ui === 'ar' ? 'mirrored' : 'not mirrored'}); process-flow's arrows always run left to right`, srs.mirror === String(ui === 'ar') && (ui === 'ar' ? ends.brd.fxFlip !== 'none' : ends.brd.fxFlip === 'none') && pf.fxFlip === 'none', JSON.stringify({ m: srs.mirror, brd: ends.brd.fxFlip, pf: pf.fxFlip }));
    const mn = ends.minutes;
    check(`${L}: a raster thumbnail (thumb.${ui}) shows as an image that loads, is never flipped, and the move plays over it`, !!mn.img && mn.img.ok && mn.img.flip === 'none' && !mn.svg && mn.n > 0, JSON.stringify(mn.img));
    check(`${L}: the other types fall back to their art (inline svg)`, TYPES.filter((t) => t.id !== 'minutes').every((t) => ends[t.id].svg && !ends[t.id].img));

    // keyboard: Enter on a tile opens the panel with focus on Create; Tab and Shift+Tab stay inside; the close button returns focus to the tile
    await page.locator(`${D} .st-tile[data-type="test-plan"]`).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector(P);
    let a = await active(page);
    let trapped = a.create;
    for (let i = 0; i < 8; i += 1) { await page.keyboard.press('Tab'); a = await active(page); trapped &&= a.inPanel; }
    for (let i = 0; i < 8; i += 1) { await page.keyboard.press('Shift+Tab'); a = await active(page); trapped &&= a.inPanel; }
    check(`${L}: Enter opens the panel on Create; Tab and Shift+Tab (8 each) never leave the panel`, trapped, JSON.stringify(a));
    await page.locator(`${P} [data-st-a="close"]`).click();
    a = await active(page);
    check(`${L}: the close button closes the panel and returns focus to the tile`, (await page.locator(P).count()) === 0 && a.type === 'test-plan', JSON.stringify(a));

    // a mouse click on another tile while the panel is open swaps the content without a new slide; the same tile twice keeps it
    await page.locator(`${D} .st-tile[data-type="brd"]`).click();
    await page.waitForSelector(P);
    await page.waitForTimeout(450);
    await page.locator(`${D} .st-tile[data-type="tor"]`).click();
    const sw = await page.evaluate(() => { const p = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start [data-st-panel]'); return { id: p.dataset.type, slide: p.classList.contains('st-in'), swap: !!p.querySelector('.st-pane.st-swap') }; });
    check(`${L}: picking another tile with the panel open swaps its content (cross-fade, no second slide)`, sw.id === 'tor' && !sw.slide && sw.swap, JSON.stringify(sw));
    await page.keyboard.press('Escape');

    // 1024 px: the panel fits, Create is on screen, no sideways scroll, no tile centre is under the panel
    await page.locator(`${D} .st-tile[data-type="srs"]`).click();
    await page.waitForSelector(P);
    const fit = await page.evaluate(async () => {
      const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start');
      await Promise.all(d.querySelector('[data-st-panel]').getAnimations({ subtree: true }).map((a) => a.finished.catch(() => null))); // measured once it has slid in
      const p = d.querySelector('[data-st-panel]').getBoundingClientRect(), c = d.querySelector('[data-st-panel] [data-st-a="create"]').getBoundingClientRect();
      const under = [...d.querySelectorAll('.st-tile')].filter((t) => { const r = t.querySelector('.st-thumb').getBoundingClientRect(); const cx = r.left + r.width / 2; return r.bottom > p.top && r.top < innerHeight && cx > p.left && cx < p.right; }).map((t) => t.dataset.type);
      return { over: d.scrollWidth - d.clientWidth, inView: p.left >= 0 && p.right <= innerWidth && p.bottom <= innerHeight + 1, create: c.bottom <= innerHeight && c.top >= p.top, w: Math.round(p.width), under };
    });
    check(`${L}: 1024 x 720: the panel (${fit.w} px) fits, Create is on screen, no sideways scroll, no tile centre under the panel`, fit.over <= 0 && fit.inView && fit.create && fit.w === 360 && !fit.under.length, JSON.stringify(fit));
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shots, `start-panel-${ui}-1024.png`) });

    // Calm: no animation runs anywhere in the panel, and every stage shows the same end frame a finished move lands on
    await page.keyboard.press('Escape');
    await page.locator(`${D} [data-st-calm]`).click();
    const calmBad = [];
    for (const ty of TYPES) {
      await page.locator(`${D} .st-tile[data-type="${ty.id}"]`).click();
      await page.waitForSelector(P);
      const x = await probe(page, { wait: false });
      if (x.n !== 0 || x.panelAnims !== 0 || !same(x.frame, ends[ty.id].frame)) calmBad.push(`${ty.id}: ${x.n} stage / ${x.panelAnims} panel anims, frame ${same(x.frame, ends[ty.id].frame) ? 'same' : 'differs'}`);
      await page.keyboard.press('Escape');
    }
    check(`${L}: under Calm no animation runs and each of the 17 stages shows its end frame (equal to the finished move, property by property)`, !calmBad.length, calmBad.slice(0, 3).join(' | '));
    await page.locator(`${D} [data-st-calm]`).click();

    // Create from the panel makes that docType, in the language chosen in the panel
    const want = ui === 'en' ? 'minutes' : 'rtm';
    await page.locator(`${D} .st-tile[data-type="${want}"]`).click();
    await page.waitForSelector(P);
    await page.locator(`${P} [data-st-a="create"]`).click();
    await page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });
    await page.waitForFunction((id) => window.BW.EXT.library.isDoc(window.BW.S.svc) && window.BW.M[window.BW.S.svc][window.BW.S.ed]?.doc?.docType === id, want, { timeout: 15000 }).catch(() => {});
    const made = await page.evaluate(() => { const { S, M } = window.BW; const e = M[S.svc]; return { ed: S.ed, types: Object.values(e || {}).map((v) => v.doc.docType) }; });
    check(`${L}: Create in the panel creates «${want}» (both editions) and opens the ${ui} edition`, made.ed === ui && made.types.length === 2 && made.types.every((t) => t === want), JSON.stringify(made));
    check(`${L}: no page error or console error`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.context().close();
  }

  // widths: 360 / 400 / 440 at 1024 / 1366 / 1920
  const widths = [];
  for (const [w, h] of [[1024, 720], [1366, 768], [1920, 1080]]) {
    const { page, ctx } = await open({ ui: 'ar', w, h });
    await page.locator(`${D} .st-tile[data-type="uat-signoff"]`).click();
    await page.waitForSelector(P);
    const x = await probe(page);
    widths.push([w, x.width, Math.round(x.left)]);
    if (w === 1920) await page.screenshot({ path: path.join(shots, 'start-panel-ar-1920.png') });
    await ctx.close();
  }
  check('panel widths 360 / 400 / 440 at 1024 / 1366 / 1920 (Arabic: docked left)', JSON.stringify(widths.map((x) => x[1])) === '[360,400,440]' && widths.every((x) => x[2] <= 24), JSON.stringify(widths));
} finally {
  await browser.close();
}
console.log(`screenshots: ${shots}`);
console.log(failed ? `\nstart-panel-0190: ${failed} FAILED` : `\nstart-panel-0190: all ${results.length} checks passed`);
if (!process.env.BW_PANEL_SHOTS) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } }
process.exit(failed ? 1 : 0);
