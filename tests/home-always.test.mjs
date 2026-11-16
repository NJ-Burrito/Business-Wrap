// Owner rules (2026-11-16): the start page is where the tool always lands, and what a person set stays set.
// Real headless Chrome at 1280x800 on the file:// tool editor (samples/blank + the document-type payload):
//   1. the editor shell's word direction (section.shell[data-tdir]) follows the language, a manual flip is remembered across a reload,
//      a language switch lands on the language's own direction and clears the remembered flips; the layout (dir) never flips
//   2. the file:// «Save as PDF» of both editions (pcBrowserPdf walks the editions) keeps a manual flip
//   3. Home closes a drawer left open on the editor, so the start page's own keys work («/» = search)
//   4. Settings opens above the start page; Esc closes the drawer first, a second Esc the page
//   5. a reload keeps work in view (an edited template does not land on the start page again); an untouched one still does
//   6. a document picked from Recents (#bwopen=1) opens as itself
//   node tests/home-always.test.mjs     (BW_HOME_T=1 lists every check with its time: tests/run.mjs drops the PASS lines of a failing suite)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { startPayload } from './fixtures/doctypes/stub.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-homealways-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
let failed = 0;
const T0 = Date.now();
let passed = 0;
const check = (name, ok, detail = '') => { if (ok) passed += 1; if (process.env.BW_HOME_T) console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${ok ? 'ok' : 'NOT OK'}  ${name}`); console.log(`${ok ? 'PASS' : 'FAIL'}  home-always: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const skip = (name, why) => console.log(`SKIP  home-always: ${name}  — ${why}`);
const json = (x) => JSON.stringify(x).replace(/</g, '<');
const j = (x) => JSON.stringify(x);
const { payload: PL } = startPayload();
const plain = path.join(tmp, 'plain.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: plain, set: 'home-always', watermarkDir: null });
const html = fs.readFileSync(plain, 'utf8');
const at = html.indexOf('<script id="bw-app">');
const page0 = path.join(tmp, 'types.html');
fs.writeFileSync(page0, `${html.slice(0, at)}<script type="application/json" id="bw-doctypes">${json(PL)}</script>\n${html.slice(at)}`, 'utf8');
const URL0 = pathToFileURL(page0).href;

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-homealways'] });
const errors = [];
try {
  /** a fresh browser profile: English UI, no remembered direction (set once per tab, so a reload keeps what the page itself stored) */
  const fresh = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true });
    await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('bw-home-seen')) { sessionStorage.setItem('bw-home-seen', '1'); localStorage.setItem('bw:ui', 'en'); for (const k of ['bw:dir:en', 'bw:dir:ar', 'bw:start-dir:en', 'bw:start-dir:ar']) localStorage.removeItem(k); } } catch {} });
    return ctx;
  };
  const tab = async (ctx) => { const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(e.message)); return page; };
  const ready = (page) => page.waitForFunction(() => window.BW?.ready);
  const startIs = (page) => page.evaluate(() => document.documentElement.dataset.bwStart);
  /** the address answers after window.BW.ready and 3 s: did the start page show by itself? */
  const settled = async (page) => { await ready(page); await page.waitForTimeout(3000); return startIs(page); };
  const click = async (page, sel) => { const hit = await page.evaluate((s) => { const e = document.getElementById('bw-ui-host').shadowRoot.querySelector(s); if (!e) return false; e.click(); return true; }, sel); await page.waitForTimeout(500); return hit; };
  const shell = (page) => page.evaluate(() => {
    const s = document.getElementById('bw-ui-host').shadowRoot.querySelector('section.shell');
    const keys = []; for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); if (/^bw:(start-)?dir:/.test(k)) keys.push(`${k}=${localStorage.getItem(k)}`); }
    return { tdir: s?.dataset.tdir, dir: s?.getAttribute('dir'), lang: s?.lang, ui: window.BW.S.ui, ed: window.BW.S.ed, start: document.documentElement.dataset.bwStart, keys: keys.sort() };
  });
  const drawer = (page) => page.evaluate(() => ({ open: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer:not([hidden])'), kind: window.BW.S.drawer, start: document.documentElement.dataset.bwStart }));

  // ── 1. the editor shell's direction ──
  const ctxA = await fresh();
  const A = await tab(ctxA);
  await A.goto(URL0); // no ?start=1: a test's browser stays on the editor
  await ready(A);
  await A.waitForTimeout(800);
  const s0 = await shell(A);
  check('1 the editor opens with the start page closed, English words left to right, the layout right to left', s0.start === 'closed' && s0.ui === 'en' && s0.tdir === 'ltr' && s0.dir === 'rtl', j(s0));
  check('1 the RTL direction button is in the shell', await click(A, 'section.shell [data-a="dir"][data-d="rtl"]'));
  const s1 = await shell(A);
  check('1 EN + the RTL button: words right to left, the choice stored for the edition in view', s1.tdir === 'rtl' && s1.ui === 'en' && s1.keys.join() === `bw:dir:${s1.ed}=rtl`, j(s1));
  await A.reload();
  await ready(A);
  await A.waitForTimeout(800);
  const s2 = await shell(A);
  check('1 a reload with no language switch keeps the flip', s2.tdir === 'rtl' && s2.ui === 'en' && s2.start === 'closed', j(s2));
  await A.evaluate(() => localStorage.setItem('bw:start-dir:en', 'rtl')); // what the start page's own RTL switch stores (tests/start-layout): the language switch must clear it too
  check('1 the language control has an Arabic button', await click(A, 'section.shell [data-a="ed"][data-ed="ar"]'));
  const s3 = await shell(A);
  check('1 language to Arabic: Arabic words, right to left', s3.ui === 'ar' && s3.lang === 'ar' && s3.tdir === 'rtl', j(s3));
  await click(A, 'section.shell [data-a="ed"][data-ed="en"]');
  const s4 = await shell(A);
  check('1 back to English: left to right again (the flip is gone)', s4.ui === 'en' && s4.tdir === 'ltr', j(s4));
  check('1 no bw:dir:en / bw:dir:ar / bw:start-dir:* is left in localStorage after the switch', s4.ui === 'en' && s4.keys.length === 0, j(s4.keys));
  check('1 the shell\'s dir attribute is "rtl" in every state (the layout never flips)', [s0, s1, s2, s3, s4].every((s) => s.dir === 'rtl'), j([s0, s1, s2, s3, s4].map((s) => s.dir)));

  // ── 2. a tool walking the editions keeps a flip (file:// «Save as PDF», both editions) ──
  await click(A, 'section.shell [data-a="dir"][data-d="rtl"]');
  const p0 = await shell(A);
  const pdf = await A.evaluate(() => {
    const B = window.BW, sh = document.getElementById('bw-ui-host').shadowRoot;
    const b = sh.querySelector('[data-a="export.pdf.both"]');
    return { eds: Object.keys(B.M[B.S.svc]).sort().join(), button: !!b, disabled: b?.getAttribute('aria-disabled') === 'true', known: !!B.hasAction?.('export.pdf.both'), file: location.protocol === 'file:' };
  });
  if (!pdf.button && !pdf.known) skip('2 «Save as PDF» of both editions keeps the flip', `nothing reachable from the page triggers pcBrowserPdf (editor/print-center.js:117): ${j(pdf)}`);
  else {
    check('2 before: the document has both editions, the flip is on, the page is file://', pdf.eds === 'ar,en' && pdf.file && p0.tdir === 'rtl' && p0.ed === 'en' && p0.keys.includes('bw:dir:en=rtl'), j([pdf, p0]));
    await A.evaluate(() => { window.__prints = []; window.print = () => { window.__prints.push(window.BW.S.ed); }; });
    // the export menu's own «PDF: both» tool; on file:// pcAction hands it to pcBrowserPdf (editor/print-center.js:83)
    const via = pdf.button && !pdf.disabled ? 'the «PDF: both» tool of the export menu' : 'window.BW.runAction';
    if (pdf.button && !pdf.disabled) await click(A, '[data-a="export.pdf.both"]'); else await A.evaluate(() => window.BW.runAction('export.pdf.both'));
    await A.waitForTimeout(600);
    const prints = await A.evaluate(() => window.__prints);
    const p1 = await shell(A);
    check(`2 ${via}: the browser print ran once per edition and the editor is back on the edition it started from`, prints.length === 2 && [...prints].sort().join() === 'ar,en' && p1.ed === 'en' && p1.ui === 'en', j([prints, p1]));
    check('2 the flip is still there afterwards (shell and storage)', p1.tdir === 'rtl' && p1.keys.includes('bw:dir:en=rtl') && p1.dir === 'rtl', j(p1));
  }

  // the same rule on the path a person takes: English reached through the language control (the edition follows it), flip, reload
  const r0 = await shell(A);
  await A.reload();
  await ready(A);
  await A.waitForTimeout(800);
  const r1 = await shell(A);
  check('1 English chosen on the language control, RTL pressed, reload: the flip is still there', r0.tdir === 'rtl' && r0.ui === 'en' && r0.ed === 'en' && r1.ui === 'en' && r1.tdir === 'rtl', j([r0, r1]));

  // ── 3. Home closes a drawer left open ──
  await A.locator('main.bw-doc').first().click({ position: { x: 5, y: 5 } }).catch(() => {}); // the keyboard is on the page
  await A.keyboard.press('Control+f');
  await A.waitForFunction(() => window.BW.S.drawer === 'find', null, { timeout: 5000 }).catch(() => {});
  const d0 = await drawer(A);
  check('3 Ctrl+F opens the Find drawer on the editor', d0.open && d0.kind === 'find' && d0.start === 'closed', j(d0));
  check('3 the Home button is in the top bar', await click(A, '.island [data-a="home"]'));
  await A.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 }).catch(() => {});
  await A.waitForSelector('dialog.bw-start .st-tile', { timeout: 15000 }).catch(() => {});
  await A.waitForTimeout(1600); // entrance motion and the drawer's 240 ms close done
  const d1 = await drawer(A);
  check('3 Home: the start page is open and no drawer is left open', d1.start === 'open' && !d1.open && d1.kind === null, j(d1));
  const focusBefore = await A.evaluate(() => { const sh = document.getElementById('bw-ui-host').shadowRoot; const q = sh.querySelector('dialog.bw-start [data-st-q]'); if (sh.activeElement === q) sh.querySelector('dialog.bw-start .st-tile')?.focus(); return { box: !!q, onBox: sh.activeElement === q, inPage: !!sh.activeElement?.closest?.('dialog.bw-start') }; });
  await A.keyboard.press('/');
  await A.waitForTimeout(300);
  const focusAfter = await A.evaluate(() => { const sh = document.getElementById('bw-ui-host').shadowRoot; const q = sh.querySelector('dialog.bw-start [data-st-q]'); return { onBox: !!q && sh.activeElement === q, value: q?.value }; });
  check('3 «/» moves the focus from the page to the start page\'s search box', focusBefore.box && !focusBefore.onBox && focusBefore.inPage && focusAfter.onBox && focusAfter.value === '', j([focusBefore, focusAfter]));

  // ── 4. Settings from the start page ──
  const setAt = await A.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start [data-st-set]')?.getBoundingClientRect(); return b && b.width ? [b.x + b.width / 2, b.y + b.height / 2] : null; });
  check('4 the start page has a Settings button', !!setAt);
  if (setAt) await A.mouse.click(setAt[0], setAt[1]); // a real click: the focus moves the way it does for a person
  await A.waitForFunction(() => window.BW.S.drawer === 'settings' && !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer:not([hidden])'), null, { timeout: 10000 }).catch(() => {});
  await A.waitForTimeout(600);
  const set = await A.evaluate(() => {
    const sh = document.getElementById('bw-ui-host').shadowRoot;
    const dr = sh.querySelector('.drawer:not([hidden])');
    if (!dr) return { open: false, kind: window.BW.S.drawer };
    const b = dr.getBoundingClientRect();
    const pts = [[b.left + b.width / 2, b.top + 20], [b.left + b.width / 2, b.top + b.height / 2], [b.left + b.width / 2, b.bottom - 20]];
    return { open: true, kind: window.BW.S.drawer, box: [b.width, b.height], onTop: pts.map(([x, y]) => { const e = sh.elementFromPoint(x, y); return !!e && dr.contains(e); }), start: document.documentElement.dataset.bwStart };
  });
  check('4 Settings opens the drawer above the start page (the points inside the drawer\'s box hit the drawer)', set.open && set.kind === 'settings' && set.start === 'open' && set.box[0] > 100 && set.onTop.every(Boolean), j(set));
  await A.keyboard.press('Escape');
  await A.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer:not([hidden])'), null, { timeout: 5000 }).catch(() => {});
  await A.waitForTimeout(400);
  const active = () => A.evaluate(() => { const sh = document.getElementById('bw-ui-host').shadowRoot, a = sh.activeElement, d = document.activeElement; return { doc: d?.id || d?.tagName, ui: a ? `${a.tagName}.${a.className}` : null, inStart: !!a?.closest?.('dialog.bw-start') }; });
  const e1 = await drawer(A);
  const a1 = await active();
  check('4 Esc closes the drawer and the start page stays open', set.open && !e1.open && e1.kind === null && e1.start === 'open', j(e1));
  await A.keyboard.press('Escape');
  await A.waitForTimeout(600);
  const e2 = await drawer(A);
  check('4 a second Esc closes the start page', e1.start === 'open' && e2.start === 'closed' && !(await A.evaluate(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'))), j([e2, 'focus after the first Esc', a1]));
  await ctxA.close();

  // ── 5. a reload keeps work in view ──
  const ops = (page) => page.evaluate(() => { const B = window.BW; return { n: Object.values(B.M[B.S.svc]).reduce((n, e) => n + (e.ops || []).length, 0), isDoc: !!B.EXT.library?.isDoc?.(B.S.svc) }; });
  const ctxB = await fresh();
  const B = await tab(ctxB);
  await B.goto(URL0 + '?start=1');
  const b0 = await settled(B);
  const o0 = await ops(B);
  check('5 the tool opened with ?start=1 lands on the start page by itself (untouched template)', b0 === 'open' && o0.n === 0 && !o0.isDoc, j([b0, o0]));
  await B.keyboard.press('Escape');
  await B.waitForTimeout(600);
  check('5 Esc closes the start page', (await startIs(B)) === 'closed');
  const leaf = B.locator('main.bw-doc [data-p][contenteditable]:visible, main.bw-doc p[data-p]:visible').first();
  await leaf.click();
  await B.keyboard.type('Work in view');
  await B.waitForTimeout(1200); // the draft is written 400 ms after the last key
  const o1 = await ops(B);
  check('5 typing into the template is a real edit (an op in window.BW.M)', o1.n > 0, j(o1));
  await B.reload();
  const b1 = await settled(B);
  const o2 = await ops(B);
  const kept = await B.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('bw:draft:') && !x.startsWith('bw:draft-backup')); let n = 0; try { for (const s of Object.values(JSON.parse(localStorage.getItem(k)).svc || {})) for (const e of Object.values(s)) n += (e.ops || []).length; } catch {} return { draftOps: n, banner: document.getElementById('bw-ui-host').shadowRoot.querySelector('.toasts .banner')?.textContent?.trim().slice(0, 80) || null, nav: performance.getEntriesByType('navigation')[0]?.type }; });
  check('5 after the reload the start page stays closed (the work is in view)', b1 === 'closed', j([b1, o2, kept]));
  await ctxB.close();
  const ctxC = await fresh();
  const C = await tab(ctxC);
  await C.goto(URL0 + '?start=1');
  const c0 = await settled(C);
  check('5 control: a fresh profile, the same address, no edit -> the start page is open', c0 === 'open', String(c0));
  await C.reload();
  const c1 = await settled(C);
  check('5 control: reloading the untouched tool lands on the start page again', c1 === 'open' && (await ops(C)).n === 0, String(c1));
  await ctxC.close();

  // ── 6. a document picked from Recents opens as itself ──
  const ctxD = await fresh();
  const D1 = await tab(ctxD);
  await D1.goto(URL0 + '?start=1#bwopen=1');
  const d1s = await settled(D1);
  const D2 = await tab(ctxD);
  await D2.goto(URL0 + '?start=1');
  const d2s = await settled(D2);
  check('6 ?start=1#bwopen=1 (picked from Recents): the start page stays closed', d1s === 'closed' && (await ops(D1)).n === 0, String(d1s));
  check('6 the same profile without the mark: the start page is open', d2s === 'open', String(d2s));
  await ctxD.close();

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally { await browser.close(); }
if (failed) { console.log(`\n${failed} failed, ${passed} passed`); process.exit(1); }
console.log('\nhome-always: all passed');
