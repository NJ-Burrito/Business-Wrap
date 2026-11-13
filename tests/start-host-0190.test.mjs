// crew N1 (owner note N1): the local-host switch on the start page (editor/ext/51-start-host.*), in a real headless Chrome, real mouse and keyboard, EN and AR.
// It is the SAME control as the top bar's (editor/ext/18-server.js): one state, one markup, one patch loop. What this drives, through the real callers (R14):
//   1. a served tool editor on a free port (a real `serve()` in an isolated workspace): the switch is in the start page's bar, Online :port, role=switch, dot + word + position, the
//      tooltip, the polite live text; it follows the top-bar switch and the top-bar switch follows it; the start page stays open through off and on again; the focus comes back to it;
//      axe finds nothing on it; the dot clears 3:1 on the page in light and dark; the Calm button stops the dot's pulse
//   2. a file:// tool editor with the host off (Arabic): reached with Tab, started with Space, hands business-wrap://start?file=<this file> to the browser, the host comes up (a real
//      serve() on the free port), the page REPLACES ITSELF with the served editor (same tab, ?via=disk) and lands on the start page, switch online
//   3. a file:// DOCUMENT with the start page opened over it (Home): the served page would open the document, so the swap carries ?bwstart=1 and the start page opens over it
//      («Back to <name>» keeps the way back); the parameter is dropped from the address
//   4. turning the host off from that served page's start page: only the host stops, and the host reopens the document on disk at this window's geometry (the browser is a stub)
// Safe by construction: temp state / save folder / local dir, BW_PROBE_PORTS = the one free port (a stop never flushes the owner's host), the browser that a stop reopens is a stub,
// a free port, no protocol or HKCU write, the owner's port 4317 is never touched.
//   node tests/start-host-0190.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  start-host-0190: ${name}${detail && !ok ? '  - ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 120) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { if (await fn()) return true; } catch { /* the page is navigating: ask again */ } } return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-sthost190-'));
const mk = (...p) => { const d = path.join(tmp, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const port = await free();
Object.assign(process.env, { BW_LOCAL_DIR: mk('local'), BW_STATE_DIR: mk('state'), BW_WORKSPACE: mk('ws'), BW_OPEN_PORT: String(port), BW_PROBE_PORTS: String(port), BW_POWER_GRACE_MS: '300', BW_NO_PROTOCOL: '1', BW_NO_LAUNCHER: '1', BW_NO_BROWSER: '1', BW_BROWSER_STUB: path.join(tmp, 'browser.jsonl') });
const stub = () => (fs.existsSync(process.env.BW_BROWSER_STUB) ? fs.readFileSync(process.env.BW_BROWSER_STUB, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);

const tool = path.join(tmp, 'tool.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: tool, set: 'host-0190', docTypes: true, watermarkDir: null }); // the shortcut's tool editor: the untouched template with the document-type payload
const toolUrl = pathToFileURL(tool).href;

let browser = null;
let host = null; // the one real host on `port` (in this process)
const hostUp = async (file) => { host = await serve(file, port, { workspace: true }); };
const hostDown = () => { try { host?.close(); host?.closeAllConnections?.(); } catch { /* closed */ } host = null; };
const hostAnswers = async () => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };
const ctxs = [];

/** A person's browser page: webdriver masked (the start page hides under automation), a profile (no first-launch card), the probe ports are the free one only, every business-wrap: link is recorded and swallowed. */
async function person(url, { ui = 'en', dark = false, off = false, w = 1024 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 720 }, bypassCSP: true });
  ctxs.push(ctx);
  await ctx.addInitScript((a) => {
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
      if (!localStorage.getItem('bw:profile')) localStorage.setItem('bw:profile', JSON.stringify({ name: 'Owner', role: 'tester', done: true }));
      if (!sessionStorage.getItem('bw-h190')) { sessionStorage.setItem('bw-h190', '1'); localStorage.setItem('bw:ui', a.ui); localStorage.setItem('bw:dark', a.dark ? '1' : '0'); localStorage.removeItem('bw:calm'); if (a.off) localStorage.setItem('bw:start', 'off'); }
      window.__bwProbePorts = [a.port];
    } catch { /* none */ }
    window.__launched = [];
    window.__follows = [];
    window.addEventListener('bw:follow', (e) => window.__follows.push(e.detail.url)); // recorded, NOT cancelled: the page really swaps
    document.addEventListener('click', (e) => { const a2 = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a2) { window.__launched.push(a2.getAttribute('href')); e.preventDefault(); } }, true);
  }, { ui, dark, off, port });
  const page = await ctx.newPage();
  page.errors = [];
  page.navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) page.navs.push(f.url()); }); // every address the tab had (the follow URL is gone from the page's own memory after the swap)
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 30000 });
  return { ctx, page };
}
const SW = 'dialog.bw-start .srv-toggle[data-where="start"]';
/** Every host switch under the shadow root, as a plain row (the start page's and the top bar's). */
const toggles = (page) => page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.srv-toggle')].map((b) => ({
  where: b.dataset.where, st: b.dataset.st, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), disabled: b.disabled, busy: b.getAttribute('aria-busy'), word: b.querySelector('.srv-w')?.textContent || '',
  label: b.getAttribute('aria-label'), title: b.title, x: b.dataset.x || '', inBar: !!b.closest('.st-bar'), inIsland: !!b.closest('.island'), icon: !!b.querySelector('.srv-dot'),
})));
const startSw = async (page) => (await toggles(page)).find((x) => x.where === 'start');
const topSw = async (page) => (await toggles(page)).find((x) => x.where === 'top');
const both = (page, st) => toggles(page).then((t) => t.length === 2 && t.every((x) => x.st === st));
const waitStart = async (page) => {
  try {
    // the host remembers earlier tabs: a page that has something to resume asks «continue where you left off» first (0.18.2 ruling D11); answering «later» leaves the start page
    await page.waitForFunction(() => { const sh = document.getElementById('bw-ui-host')?.shadowRoot; const q = sh?.querySelector('dialog.bw-resume') || document.querySelector('dialog.bw-resume'); if (q) q.querySelector('[data-s="later"]')?.click(); return document.documentElement.dataset.bwStart === 'open'; }, null, { timeout: 40000, polling: 250 });
    await page.waitForSelector(SW, { timeout: 10000, state: 'attached' });
  } catch (e) {
    const d = await page.evaluate(() => ({ url: location.href, start: document.documentElement.dataset.bwStart, resume: document.documentElement.dataset.bwResume, settled: document.documentElement.dataset.bwSessionSettled, dlgs: [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog')].map((x) => x.className), ls: localStorage.getItem('bw:start') })).catch((x) => String(x));
    throw new Error(`the start page did not open: ${JSON.stringify(d)}`);
  }
};
const topClick = (page) => page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.island .srv-toggle').click()); // the top bar is under the page: a script click, the same delegated handler
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const rgb = (s) => { const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)/.exec(s || ''); return m ? [+m[1], +m[2], +m[3]] : null; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const dotContrast = (page) => page.evaluate(() => { const sw = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start .srv-toggle[data-where="start"]'); const bar = sw.closest('dialog.bw-start'); return { dot: getComputedStyle(sw.querySelector('.srv-dot')).backgroundColor, page: getComputedStyle(bar).backgroundColor }; });

try {
  browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });

  // ── 1. a served tool editor: the switch is on the start page, one state with the top bar ─────────────────────────────────────────────────
  await hostUp(tool);
  const A = await person(`http://127.0.0.1:${port}/`);
  const a = A.page;
  await waitStart(a);
  const t0 = await toggles(a);
  const s0 = t0.find((x) => x.where === 'start');
  check('start page, host up: exactly one start-page switch in the start page\'s bar next to the top-bar one (two switches in all)', t0.length === 2 && !!s0 && s0.inBar && t0.some((x) => x.where === 'top' && x.inIsland), JSON.stringify(t0));
  check('it is a switch: role=switch, aria-checked=true, state online, dot + word «Online :port», labelled «Local server»', s0.role === 'switch' && s0.checked === 'true' && s0.st === 'online' && s0.icon && s0.word === `Online :${port}` && /^Local server/.test(s0.label), JSON.stringify(s0));
  check('its tooltip says what it does (the start-page wording), the top bar keeps its own', /documents are saved first/.test(s0.title) && /stay open|Press to stop/.test((await topSw(a)).title) && !(await topSw(a)).title.includes('saved first'), JSON.stringify([s0.title, (await topSw(a)).title]));
  check('the Explain entry is on the top-bar switch only (data-x=srvHost); the start-page one keeps its native title (the panel sits under the page)', (await topSw(a)).x === 'srvHost' && s0.x === '', JSON.stringify([(await topSw(a)).x, s0.x]));
  const geo = await a.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot; const bar = r.querySelector('dialog.bw-start .st-bar'), sw = bar.querySelector('.srv-toggle'), seg = bar.querySelector('[data-st-ui]'); const b = bar.getBoundingClientRect(), s = sw.getBoundingClientRect(); return { barH: Math.round(b.height), swH: Math.round(s.height), inside: s.left >= b.left && s.right <= b.right && s.top >= b.top && s.bottom <= b.bottom, before: !!(sw.compareDocumentPosition(seg) & Node.DOCUMENT_POSITION_FOLLOWING), flag: document.documentElement.dataset.bwStartHost, overflow: bar.scrollWidth > bar.clientWidth, cs: getComputedStyle(sw).color, ink: getComputedStyle(bar).color }; });
  check('layout at 1024 px: inside the bar (one row, 40 px switch), before the language segment, no overflow, ink = the page ink (not the top bar\'s white)', geo.inside && geo.swH === 40 && geo.barH <= 72 && geo.before && !geo.overflow && geo.flag === '1' && geo.cs === geo.ink, JSON.stringify(geo));
  await a.evaluate(fs.readFileSync(AXE, 'utf8'));
  const ax = await a.evaluate(async () => { const r = await window.axe.run(document.getElementById('bw-ui-host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }); return r.violations.filter((v) => v.nodes.some((n) => /srv-toggle|st-host-live/.test(n.html))).map((v) => `${v.id}:${v.nodes.filter((n) => /srv-toggle|st-host-live/.test(n.html)).length}`); });
  check('axe: no violation on the start-page switch (name, role, contrast)', ax.length === 0, ax.join(' '));
  const light = await dotContrast(a);
  check('light page: the dot clears 3:1 on the page', rgb(light.dot) && rgb(light.page) && ratio(rgb(light.dot), rgb(light.page)) >= 3, JSON.stringify(light));
  // keyboard: Tab from the start page's own controls reaches the switch; Space presses it
  await a.focus('dialog.bw-start [data-st-l="en"]');
  await a.keyboard.press('Shift+Tab');
  const reached = await a.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches?.('.srv-toggle[data-where="start"]') || false);
  check('keyboard: Shift+Tab from the EN button lands on the switch (a real focus stop, right before the language segment, in page order)', reached);
  await a.keyboard.press('Tab');
  await a.keyboard.press('Shift+Tab');
  check('keyboard: Tab then Shift+Tab goes there and back (it is one stop)', await a.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches?.('.srv-toggle[data-where="start"]') || false));
  let posts = 0;
  await a.route('**/api/servers/stop', async (route) => { posts += 1; await route.continue(); }); // counted, then the REAL host answers (sandboxed: nothing else to flush)
  await a.keyboard.press('Space');
  check('Space on the start-page switch: «Stopping…» on BOTH switches (the top bar follows), disabled + aria-busy', await until(async () => { const t = await toggles(a); return t.length === 2 && t.every((x) => x.st === 'stopping' && x.disabled && x.busy === 'true'); }, 4000), JSON.stringify(await toggles(a)));
  check('the host stops (one real POST /api/servers/stop, the port goes quiet) and BOTH switches show Offline / «غير متصل»-state, unchecked', await until(() => both(a, 'offline'), 12000) && posts === 1 && (await until(async () => !(await hostAnswers()), 8000)), JSON.stringify([posts, await toggles(a)]));
  const off = await startSw(a);
  check('offline is dot + word + position: «Offline», aria-checked=false, the start-page tooltip for starting', off.word === 'Offline' && off.checked === 'false' && /stay on the start page/.test(off.title), JSON.stringify(off));
  check('only the host stopped: the page is still on the start page (dialog open, html[data-bw-start=open]) and still the same tab', (await a.evaluate(() => ({ s: document.documentElement.dataset.bwStart, d: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'), u: location.href }))).s === 'open' && a.url().startsWith(`http://127.0.0.1:${port}/`));
  check('the polite live text spoke the new state', (await a.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-st-host-live]')?.textContent)) === 'Local server: Offline');
  check('the focus came back to the switch after it settled', await a.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches?.('.srv-toggle[data-where="start"]') === true));
  await a.unroute('**/api/servers/stop');
  // the other way round: the TOP-BAR switch starts it, the start-page switch follows
  await a.evaluate(() => { window.__launched.length = 0; });
  await topClick(a);
  check('top-bar press while offline: BOTH switches go «Starting…», the start page asked the browser for the host (business-wrap://start)', await until(() => both(a, 'starting'), 4000) && await until(async () => (await a.evaluate(() => window.__launched)).some((u) => /^business-wrap:\/\/start/.test(u)), 4000), JSON.stringify([await toggles(a), await a.evaluate(() => window.__launched)]));
  await hostUp(tool);
  check('the host comes up: BOTH switches show Online :port again, the start page never closed', await until(() => both(a, 'online'), 20000) && (await a.evaluate(() => document.documentElement.dataset.bwStart)) === 'open' && (await startSw(a)).word === `Online :${port}`, JSON.stringify(await toggles(a)));
  // contrast and motion on the dark page and with Calm
  await a.click('dialog.bw-start [data-st-dark]');
  await sleep(300);
  const dark = await dotContrast(a);
  check('dark page: the dot clears 3:1 on the page', rgb(dark.dot) && rgb(dark.page) && ratio(rgb(dark.dot), rgb(dark.page)) >= 3, JSON.stringify(dark));
  await a.click('dialog.bw-start [data-st-calm]');
  await sleep(300);
  const calm = await a.evaluate(() => { const sw = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start .srv-toggle[data-where="start"]'); return { dot: getComputedStyle(sw.querySelector('.srv-dot')).animationName, thumb: getComputedStyle(sw.querySelector('.srv-thumb')).transitionDuration }; });
  check('Calm (the start page\'s own button): the dot stops pulsing and the thumb stops springing', calm.dot === 'none' && /^0s/.test(calm.thumb), JSON.stringify(calm));
  check('no page errors (served, English)', A.page.errors.length === 0, A.page.errors.join(' | '));
  await A.ctx.close();
  hostDown();
  check('the host of part 1 is down (nothing left running)', await until(async () => !(await hostAnswers()), 8000));

  // ── 2. a file:// tool editor in Arabic, the host off: Tab + Space, the page swaps to the served editor and lands on the start page ─────────────
  const B = await person(toolUrl, { ui: 'ar' });
  const b = B.page;
  await waitStart(b);
  check('file://, host off: the start page shows the switch «غير متصل», unchecked, next to the top bar\'s', await until(async () => { const t = await toggles(b); return t.length === 2 && t.every((x) => x.st === 'offline'); }, 12000) && (await startSw(b)).word === 'غير متصل' && /صفحة البداية/.test((await startSw(b)).title), JSON.stringify(await toggles(b)));
  const geoAr = await b.evaluate(() => { const bar = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start .st-bar'), sw = bar.querySelector('.srv-toggle'), r = sw.getBoundingClientRect(), br = bar.getBoundingClientRect(); return { dir: getComputedStyle(bar).direction, inside: r.left >= br.left && r.right <= br.right, h: Math.round(br.height), overflow: bar.scrollWidth > bar.clientWidth }; });
  check('Arabic layout: right-to-left bar, the switch inside it, one row, no overflow', geoAr.dir === 'rtl' && geoAr.inside && geoAr.h <= 72 && !geoAr.overflow, JSON.stringify(geoAr));
  await b.focus('dialog.bw-start [data-st-l="en"]');
  await b.keyboard.press('Shift+Tab');
  check('Arabic keyboard: Shift+Tab from the first button of the language segment lands on the switch', await b.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches?.('.srv-toggle[data-where="start"]') || false));
  await b.keyboard.press('Space');
  check('Space: both switches «جارٍ التشغيل…» (starting), and the file:// page handed business-wrap://start?file=<this file> to the browser', await until(() => both(b, 'starting'), 4000) && await until(async () => (await b.evaluate(() => window.__launched)).some((u) => u.startsWith('business-wrap://start?file=') && decodeURIComponent(u).toLowerCase().includes('tool.editor.html')), 4000), JSON.stringify([await toggles(b), await b.evaluate(() => window.__launched)]));
  await hostUp(tool); // what the installed launcher does for that link: this install's host, on the file named
  check('the host answers: the file:// page REPLACED ITSELF with the served editor (same tab, ?via=disk&from=<file>&bwstart=1 followed)', await until(() => b.url().startsWith(`http://127.0.0.1:${port}/`), 25000), b.url());
  await waitStart(b);
  const landed = await b.evaluate(() => ({ s: document.documentElement.dataset.bwStart, q: location.search, disk: sessionStorage.getItem('bw:disk') || '', svc: window.BW.S.svc, isDoc: window.BW.EXT.library.isDoc(window.BW.S.svc) }));
  check('after the swap the page still shows the START PAGE (the tool editor, not a document); the address is clean; the way back (bw:disk) is the file', landed.s === 'open' && !landed.isDoc && landed.q === '' && /tool\.editor\.html/i.test(landed.disk), JSON.stringify(landed));
  check('and its start-page switch is online with the port (the served page asked its own host)', await until(async () => { const s = await startSw(b); return s?.st === 'online' && s.word === `متصل :${port}`; }, 15000), JSON.stringify(await toggles(b)));
  check('no page errors (file:// then served, Arabic)', b.errors.length === 0, b.errors.join(' | '));
  await B.ctx.close();
  hostDown();
  await until(async () => !(await hostAnswers()), 8000);

  // ── 3. a file:// DOCUMENT with the start page over it: the swap carries ?bwstart=1 ──────────────────────────────────────────────────────────
  const seed = path.join(tmp, 'seed.editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: seed, set: 'seed-0190', docTypes: true, watermarkDir: null });
  await hostUp(seed);
  const S0 = await person(`http://127.0.0.1:${port}/?automation=1`);
  const saved = await S0.page.evaluate(async () => { const L = window.BW.EXT.library; await L.newFromType('blank', 'en'); await new Promise((r) => setTimeout(r, 400)); const e = await L.saveInPlace(); return { id: window.BW.S.svc, file: Object.values(e?.htmlFiles || {})[0] || '', title: L.titleOf() }; });
  await S0.ctx.close();
  hostDown();
  await until(async () => !(await hostAnswers()), 8000);
  check('setup: a saved document file exists in the (temp) save folder, a `doc-` service', /^doc-/.test(saved.id) && !!saved.file && fs.existsSync(saved.file), JSON.stringify(saved));
  // A saved document on disk carries no document-type payload (a file:// page has nothing to list: launcher-start-0182), so Home cannot open the start page over it there. The flag is for the
  // pages that CAN be on the start page over a document (a served page that follows a restarted host; a file that carries the payload, as here): this copy carries it, the way start-0180 injects it.
  const payloadJson = /<script type="application\/json" id="bw-doctypes">[\s\S]*?<\/script>/.exec(fs.readFileSync(tool, 'utf8'))?.[0] || '';
  const docHtml = fs.readFileSync(saved.file, 'utf8');
  const at = docHtml.indexOf('<script id="bw-app">');
  const docFile = path.join(path.dirname(saved.file), `with-types-${path.basename(saved.file)}`);
  fs.writeFileSync(docFile, `${docHtml.slice(0, at)}${payloadJson}
${docHtml.slice(at)}`, 'utf8');
  check('setup: a copy of that document file that carries the document-type payload', payloadJson.length > 1000 && at > 0 && fs.readFileSync(docFile, 'utf8').includes('id="bw-doctypes"'));
  const C = await person(pathToFileURL(docFile).href);
  const c = C.page;
  await c.waitForSelector('[data-a="home"]', { state: 'attached', timeout: 20000 }).catch(() => {});
  await sleep(1500);
  const before = await c.evaluate(() => ({ s: document.documentElement.dataset.bwStart, isDoc: window.BW.EXT.library.isDoc(window.BW.S.svc) }));
  check('a saved document on disk opens as itself, no start page by itself', before.isDoc && before.s === 'closed', JSON.stringify(before));
  await c.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.island [data-a="home"]').click()); // Home: the start page over the document
  await waitStart(c);
  check('Home: the start page opens over the document and carries the switch, offline', await until(async () => (await startSw(c))?.st === 'offline', 12000), JSON.stringify(await toggles(c)));
  await c.click(SW);
  check('a real mouse click on the start-page switch hands business-wrap://start?file=<the document>', await until(async () => (await c.evaluate(() => window.__launched)).some((u) => u.startsWith('business-wrap://start?file=') && decodeURIComponent(u).toLowerCase().includes(path.basename(docFile).toLowerCase())), 5000), JSON.stringify(await c.evaluate(() => window.__launched)));
  await hostUp(docFile); // the host serves that same document
  check('the page followed the host with the start page flag (…?via=disk&from=<document>&bwstart=1)', await until(() => c.navs.some((u) => /^http:\/\/127\.0\.0\.1:\d+\/\?via=disk&from=[^&]+&bwstart=1$/.test(u)), 25000), JSON.stringify(c.navs));
  check('same tab, now served', await until(() => c.url().startsWith(`http://127.0.0.1:${port}/`), 25000), c.url());
  await waitStart(c);
  const landed3 = await c.evaluate(() => ({ s: document.documentElement.dataset.bwStart, q: location.search, isDoc: window.BW.EXT.library.isDoc(window.BW.S.svc), back: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start [data-st-back]')?.textContent || '' }));
  check('the served page opened the DOCUMENT and the start page is over it (Back to <name>), the flag is gone from the address', landed3.s === 'open' && landed3.isDoc && landed3.q === '' && landed3.back.includes(saved.title), JSON.stringify(landed3));
  check('its start-page switch is online', await until(async () => (await startSw(c))?.st === 'online', 15000), JSON.stringify(await toggles(c)));

  // ── 4. turning it off from that served start page: only the host stops, the document reopens on disk at this window's place ────────────────
  const n0 = stub().length;
  await c.click(SW);
  check('press online: both switches go offline and the host is gone', await until(() => both(c, 'offline'), 12000) && (await until(async () => !(await hostAnswers()), 8000)), JSON.stringify(await toggles(c)));
  const rec = stub().slice(n0).find((r) => r.launcher);
  check('the host reopened the document on disk, at this window\'s geometry (the stub browser got file:///…, --window-position, --window-size)', !!rec && rec.args.at(-1) === pathToFileURL(fs.realpathSync.native(docFile)).href && rec.args.some((x) => /^--window-position=/.test(x)), JSON.stringify(rec));
  check('no page errors (document, served)', c.errors.length === 0, c.errors.join(' | '));
  await C.ctx.close();

  // ── 5. the Explain entry: the top-bar switch explains itself in the panel (the start page is switched off here: it would cover the panel) ───────
  await hostUp(tool);
  const E = await person(`http://127.0.0.1:${port}/`, { off: true, w: 1440 });
  const e = E.page;
  await e.waitForSelector('.island .srv-toggle', { state: 'attached', timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await e.evaluate(() => { const q = document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('dialog.bw-resume') || document.querySelector('dialog.bw-resume'); q?.querySelector('[data-s="later"]')?.click(); }); // the host remembers earlier tabs: answer «later»
  await sleep(600);
  await e.hover('.island .srv-toggle');
  const card = await (async () => { for (const t0 = Date.now(); Date.now() - t0 < 6000; await sleep(150)) { const c0 = await e.evaluate(() => { const x = document.getElementById('bw-ui-host').shadowRoot.querySelector('.xpl:not([hidden])'); return x ? { k: x.dataset.k, name: x.querySelector('.xt b')?.textContent, text: x.querySelector('.xb p')?.textContent, art: !!x.querySelector('.xa svg'), shapes: x.querySelectorAll('.xa svg rect, .xa svg circle, .xa svg path').length } : null; }); if (c0) return c0; } return null; })();
  check('Explain: resting on the top-bar switch opens its card (name «Local server», its own text, a drawing)', !!card && card.k === 'srvHost' && card.name === 'Local server' && /Starts and stops the local server/.test(card.text) && card.art && card.shapes > 8, JSON.stringify(card));
  check('no page errors (explain)', e.errors.length === 0, e.errors.join(' | '));
  await E.ctx.close();
  hostDown();
} catch (e) {
  check('suite ran to the end', false, String(e?.stack || e).slice(0, 600));
} finally {
  for (const x of ctxs) { try { await x.close(); } catch { /* closed */ } }
  try { await browser?.close(); } catch { /* closed */ }
  hostDown();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(failed ? `FAILED ${failed}` : `ALL PASS: start-host-0190 ${results.length}/${results.length}`);
process.exitCode = failed ? 1 : 0;
