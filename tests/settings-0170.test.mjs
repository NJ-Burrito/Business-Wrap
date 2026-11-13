// lane settings, owner notes 8, 9, 10, 17, in real Chrome:
//   N8  Settings > About shows only what a user needs: the name, the version, the release date and the repository (no licence, no credits, no trust-limit note)
//   N9  Settings is reworked: cards open and ordered (Preferences first), switches and a sliding pill, both themes (light, dim-navy dark) readable
//   N10 the host on/off control exists ONLY in the top bar, a green / red dot beside «Connected :port» / «Offline»; nothing of it in Settings (no toggle, no power-off button, no Local server card)
//   N17 flipping it on starts the host with no manual command: from a file:// page it hands business-wrap://start to the browser (stubbed here) and polls /api/health
//       (20 s cap, a plain message when the launcher is not registered); off stops only the host and the page stays open
//   GET /api/health: name + version + port, readable from a file:// page (Origin: null), never from a foreign site
// A real stop/start is NEVER sent to a real host here: the served page's /api/servers/stop is answered by the test; file:// talks to a tiny fake host on a free port.
//
//   node tests/settings-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';
import { suite } from './_harness.mjs';

const S = suite("settings-0170");
const { check, results } = S;
const tmp = tmpDir('bw-set170-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });

/** A stand-in for a Business-Wrap host: answers /api/version and /api/health the way a file:// page's probe expects (CORS for Origin: null). */
function fake(port) {
  const s = http.createServer((req, res) => {
    const h = { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin || '*' };
    if (req.url === '/api/version' || req.url === '/api/health') { res.writeHead(200, h); res.end(JSON.stringify({ name: 'Business-Wrap', version: '0.0.0-test', served: true, port })); } else { res.writeHead(404); res.end(); }
  });
  return { up: () => new Promise((ok) => s.listen(port, '127.0.0.1', ok)), down: () => new Promise((ok) => { s.close(() => ok()); s.closeAllConnections?.(); }) };
}
const get = (port, url, headers = {}) => new Promise((ok, no) => { http.get({ host: '127.0.0.1', port, path: url, headers }, (r) => { let b = ''; r.on('data', (d) => { b += d; }); r.on('end', () => ok({ status: r.statusCode, headers: r.headers, body: b })); }).on('error', no); });

const browser = await launch();
const toggles = (page) => shRoot(page, (r) => [...r.querySelectorAll('.srv-toggle')].map((b) => {
  const dot = b.querySelector('.srv-dot');
  const cs = dot && getComputedStyle(dot);
  return { where: b.dataset.where, st: b.dataset.st, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), busy: b.getAttribute('aria-busy'), word: b.querySelector('.srv-w')?.textContent, dot: !!dot, dotRgb: cs?.backgroundColor, inBar: !!b.closest('.island'), title: b.title };
}));
const press = (page) => shRoot(page, (r) => r.querySelector('.island .srv-toggle').click());
const rgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const isGreen = (c) => { const [r, g, b] = rgb(c); return g > 150 && g > r * 1.4 && g > b * 1.2; };
const isRed = (c) => { const [r, g, b] = rgb(c); return r > 180 && r > g * 1.6 && r > b * 1.4; };
async function open(url, { ui = 'en', dark = false, calm = false, ports } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  if (Number(process.env.BW_TEST_CPU_THROTTLE) > 1) await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BW_TEST_CPU_THROTTLE) }); // a slow CI runner on demand
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(({ ui: u, dark: d, calm: c, ports: pp }) => {
    if (pp) window.__bwProbePorts = pp;
    try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:calm', c ? '1' : '0'); } catch { /* none */ }
    window.__launched = [];
    window.addEventListener('bw:follow', (e) => { e.preventDefault(); (window.__follow ||= []).push(e.detail.url); }); // the file:// page would replace itself with the served editor; the suite keeps its page
    document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
  }, { ui, dark, calm, ports });
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(600);
  return { ctx, page };
}
const openSettings = async (page) => { await page.evaluate(() => window.BW.openDrawer('settings')); await until(() => shRoot(page, (r) => !!r.querySelector('.drawer .set-about')), 6000); await sleep(400); };

try {
  // ── 1. GET /api/health ────────────────────────────────────────────────────────────────────────────────────────────────────────
  const server = await serve(editor, 0, { workspace: null });
  const sp = server.address().port;
  const h0 = await get(sp, '/api/health');
  const j0 = JSON.parse(h0.body);
  check('/api/health: 200 with name, version and this port (and nothing about tabs or paths)', h0.status === 200 && j0.ok === true && j0.name === 'Business-Wrap' && /^\d+\.\d+\.\d+/.test(j0.version) && j0.port === sp && !('workspace' in j0) && !('tabs' in j0), h0.body);
  const hn = await get(sp, '/api/health', { origin: 'null' });
  check('/api/health: readable from a file:// page (Origin: null)', hn.headers['access-control-allow-origin'] === 'null', JSON.stringify(hn.headers));
  const hf = await get(sp, '/api/health', { origin: 'https://example.org' });
  check('/api/health: a foreign site gets no CORS header (cannot read it)', !hf.headers['access-control-allow-origin']);
  const hh = await get(sp, '/api/host/health');
  check('/api/host/health (the full report) is unchanged', hh.status === 200 && JSON.parse(hh.body).tabs !== undefined);

  // ── 2. a served page: the top bar holds the only control ────────────────────────────────────────────────────────────────────
  let stopCalls = 0;
  const { ctx: c1, page: a } = await open(`http://127.0.0.1:${sp}/`, { ui: 'ar', ports: [sp] });
  await c1.route('**/api/servers/stop', (route) => { stopCalls += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, grace: 10, servers: 1 }) }); });
  const t1 = await toggles(a);
  check('top bar: exactly ONE host switch, in the bar, role=switch, aria-checked=true', t1.length === 1 && t1[0].inBar && t1[0].role === 'switch' && t1[0].checked === 'true', JSON.stringify(t1));
  check('top bar: a dot beside the status; the dot is GREEN; the word is «متصل :port»', t1[0].dot && isGreen(t1[0].dotRgb) && t1[0].word === `متصل :${sp}`, JSON.stringify(t1[0]));
  await openSettings(a);
  const s1 = await shRoot(a, (r) => {
    const d = r.querySelector('.drawer');
    return {
      toggles: d.querySelectorAll('.srv-toggle').length, power: d.querySelectorAll('[data-k="srvPowerOff"], [data-a="powerOff"], .pw-btn, [data-k="srvOpen"]').length, srvCard: d.querySelectorAll('.set-srv, .set-srv-body').length,
      barToggles: r.querySelectorAll('.island .srv-toggle').length, text: d.textContent,
      cards: [...d.querySelectorAll(':scope .set > .card')].map((c) => c.className.replace(/\bcard\b|\bset-c\b/g, '').trim()),
      aboutRows: [...d.querySelectorAll('.set-about dt')].map((x) => x.textContent.trim()), aboutName: d.querySelector('.set-about .set-name')?.textContent, aboutVer: d.querySelector('.set-about .set-ver')?.textContent,
      repo: d.querySelector('.set-about .set-dl a')?.getAttribute('href') || '',
    };
  });
  check('N10: Settings holds NO host switch, NO power-off button, NO «Local server» card; the top bar still has its one', s1.toggles === 0 && s1.power === 0 && s1.srvCard === 0 && s1.barToggles === 1, JSON.stringify(s1));
  check('N10: no sentence about stopping or starting the host anywhere in Settings', !/الخادم المحلي يعمل|إيقاف كل خوادم|Power off|إطفاء|local server is running/i.test(s1.text), s1.text.slice(0, 200));
  check('N8: About shows exactly two rows (release date, repository) under the name + version', s1.aboutRows.length === 2 && !!s1.aboutName && /\d+\.\d+\.\d+/.test(s1.aboutVer || ''), JSON.stringify(s1.aboutRows));
  check('N8: About carries no licence, no credits, no trust-limit note', !/الترخيص|شكر وتقدير|License|Credits/i.test(await shRoot(a, (r) => r.querySelector('.drawer .set-about').textContent)));
  check('N9: cards ordered by use: Preferences, Update, File icons, Learning, About', s1.cards.slice(0, 5).map((x) => x.split(' ')[0]).join(',') === 'set-prefs,set-upd,set-ico,set-lrn,set-about', JSON.stringify(s1.cards));
  const grpOpen = (pg) => shRoot(pg, (r) => [...r.querySelectorAll('.drawer details')].map((d) => d.open));
  const stk = await shRoot(a, (r) => ({ sw: r.querySelectorAll('.drawer .set-sw input[type="checkbox"]').length, pill: getComputedStyle(r.querySelector('.drawer .set-seg'), '::before').content, segs: r.querySelectorAll('.drawer .set-seg').length }));
  check('N9: two switches (reduced motion, auto-check), three segmented controls with a pill', stk.sw === 2 && stk.segs === 3 && stk.pill !== 'none', JSON.stringify(stk));
  // (owner): every Settings group is collapsed when the panel opens, in both languages; one click opens Preferences
  for (const [lang, pg] of [['ar', a], ['en', (await open(`http://127.0.0.1:${sp}/`, { ui: 'en', ports: [sp] })).page]]) {
    if (lang === 'en') await openSettings(pg);
    const g0 = await grpOpen(pg);
    await shRoot(pg, (r) => r.querySelector('.drawer .set-prefs details summary').click());
    await sleep(300);
    const g1 = await shRoot(pg, (r) => ({ prefs: !!r.querySelector('.drawer .set-prefs details')?.open, open: [...r.querySelectorAll('.drawer details')].filter((d) => d.open).length }));
    check(`0.18.2 (${lang}): Settings opens with every group collapsed (Preferences too); one click opens Preferences only`, g0.length >= 4 && g0.every((x) => x === false) && g1.prefs && g1.open === 1, JSON.stringify({ g0, g1 }));
  }
  // the switch works through the real caller (data-set -> settingsChange) and the pill moves
  await shRoot(a, (r) => r.querySelector('.drawer .set-sw input[data-set="calm"]').click());
  await sleep(300);
  check('N9: the reduced-motion switch writes bw:calm', (await a.evaluate(() => localStorage.getItem('bw:calm'))) === '1');
  await openSettings(a);
  const dir0 = await shRoot(a, (r) => r.querySelector('.shell').dataset.tdir);
  await shRoot(a, (r) => r.querySelector('.drawer [data-k="setDir"][aria-pressed="false"]').click());
  await until(async () => (await shRoot(a, (r) => r.querySelector('.shell').dataset.tdir)) !== dir0, 4000);
  const dir1 = await shRoot(a, (r) => r.querySelector('.shell').dataset.tdir);
  const pill1 = await shRoot(a, (r) => ({ i: r.querySelector('.drawer [data-k="setDir"]')?.closest('.set-seg')?.style.getPropertyValue('--i'), on: r.querySelector('.drawer [data-k="setDir"][aria-pressed="true"]')?.dataset.v }));
  check('N9: a segmented press applies the setting (word direction flipped), the pill follows the pressed button, the drawer stays', dir1 !== dir0 && pill1.i === '1' && pill1.on === dir1 && !!(await shRoot(a, (r) => r.querySelector('.drawer .set-about'))), JSON.stringify([dir0, dir1, pill1]));
  await a.evaluate(() => window.BW.closeDrawer?.());
  // off: the top-bar switch stops only the host; the page stays open
  const url0 = a.url();
  await press(a);
  await until(async () => (await toggles(a))[0]?.st === 'offline', 6000);
  await until(async () => isRed((await toggles(a))[0]?.dotRgb), 4000); // the dot fades from transparent (busy) to red over .2 s; a slow frame reads rgba(0,0,0,0)
  const t2 = await toggles(a);
  check('N17 off: the top-bar press posts /api/servers/stop once; the switch says «غير متصل», the dot turns RED', stopCalls === 1 && t2[0].st === 'offline' && t2[0].checked === 'false' && isRed(t2[0].dotRgb) && t2[0].word === 'غير متصل', JSON.stringify([stopCalls, t2[0]]));
  const still = await a.evaluate(() => ({ url: location.href, shell: !!document.getElementById('bw-ui-host'), off: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.pw-off'), bw: !!window.BW?.ready }));
  check('N17 off: the page stays open (same address, editor alive, no «stopped» page replaces it)', still.url === url0 && still.shell && still.bw && !still.off, JSON.stringify(still));
  await press(a); // on again from the served page: a host already answers, so nothing is launched and the switch is on
  await until(async () => (await toggles(a))[0]?.st === 'online', 8000);
  await until(async () => isGreen((await toggles(a))[0]?.dotRgb), 4000);
  const t3 = await toggles(a);
  check('N17 on (served): the press turns the switch on again, green dot, the page never reloaded', t3[0].st === 'online' && isGreen(t3[0].dotRgb) && (await a.evaluate(() => window.__launched.length)) === 0 && a.url() === url0, JSON.stringify(t3[0]));
  check('N10: no power-off command in the toolbar or the palette', (await shRoot(a, (r) => r.querySelectorAll('[data-a="powerOff"]').length)) === 0);
  await c1.close();

  // ── 3. a file:// page: on and off with no manual command ────────────────────────────────────────────────────────────────────
  const hp = await free();
  const host = fake(hp);
  const { ctx: c2, page: f } = await open(pathToFileURL(editor).href, { ui: 'en', ports: [hp] });
  await until(async () => (await toggles(f))[0]?.st === 'offline', 8000);
  await until(async () => isRed((await toggles(f))[0]?.dotRgb), 3000); // the dot fades from transparent to red over .2 s after the state flips
  const f0 = await toggles(f);
  check('file://: no host found -> «Offline», a RED dot, a switch that is off', f0.length === 1 && f0[0].st === 'offline' && f0[0].word === 'Offline' && isRed(f0[0].dotRgb) && f0[0].checked === 'false', JSON.stringify(f0));
  await press(f);
  const launched1 = await until(async () => (await f.evaluate(() => window.__launched)).length >= 1, 5000);
  const l1 = await f.evaluate(() => window.__launched);
  const mid = await toggles(f);
  check('N17 on: one press hands business-wrap://start (with this file, 0.17.8; and only that) to the browser; the switch shows «Starting…» (busy)', launched1 && l1.length === 1 && /^business-wrap:\/\/start(\?file=|$)/.test(l1[0]) && mid[0].st === 'starting' && mid[0].busy === 'true', JSON.stringify([l1, mid[0]]));
  check('N17 on: no business-wrap://open?file= and no command to type', !l1.some((u) => u.includes('open?file=')));
  await host.up(); // the launcher has started the host
  await until(async () => (await toggles(f))[0]?.st === 'online', 8000);
  await until(async () => isGreen((await toggles(f))[0]?.dotRgb), 4000);
  const f1 = await toggles(f);
  check('N17 on: the poll sees /api/health -> «Online :port», a GREEN dot, the switch is on', f1[0].st === 'online' && f1[0].word === `Online :${hp}` && isGreen(f1[0].dotRgb) && f1[0].checked === 'true', JSON.stringify(f1[0]));
  check('N17: the file:// page stays the file:// page', (await f.evaluate(() => location.protocol)) === 'file:');
  await press(f);
  const launched2 = await until(async () => (await f.evaluate(() => window.__launched)).includes('business-wrap://stop'), 5000);
  await host.down();
  await until(async () => (await toggles(f))[0]?.st === 'offline', 8000);
  await until(async () => isRed((await toggles(f))[0]?.dotRgb), 4000);
  const f2 = await toggles(f);
  check('N17 off (file://): asks business-wrap://stop, then shows «Offline» with a red dot; the page is still open', launched2 && f2[0].st === 'offline' && isRed(f2[0].dotRgb) && (await f.evaluate(() => !!window.BW?.ready)), JSON.stringify(f2[0]));
  // the launcher is not registered: nothing ever answers -> a plain message after 20 s, never a command line
  const t0 = Date.now();
  await press(f);
  await until(async () => (await toggles(f))[0]?.st === 'error', 26000, 300);
  const took = Date.now() - t0;
  const f3 = await toggles(f);
  const msg = await shRoot(f, (r) => [...r.querySelectorAll('.toasts .toast')].map((x) => x.textContent.trim()).join(' | '));
  check('N17 failure: after the 20 s cap the switch says «Could not start» and a plain toast says the launcher is not registered yet (no shell command)', f3[0].st === 'error' && took >= 19000 && took < 26000 && /launcher is not registered/i.test(msg) && !/npm |business-wrap protocol register/.test(msg), JSON.stringify([took, f3[0], msg]));
  await c2.close();
  await new Promise((ok) => server.close(ok));

  // ── 4. both themes: the dot clears 3:1 on the top bar and Settings is readable ───────────────────────────────────────────────
  for (const dark of [false, true]) {
    const tag = dark ? 'dark' : 'light';
    const s2 = await serve(editor, 0, { workspace: null });
    const p2 = s2.address().port;
    const { ctx, page } = await open(`http://127.0.0.1:${p2}/`, { ui: 'en', dark, ports: [p2] });
    const m = await shRoot(page, (r) => {
      const cs = (e, p) => getComputedStyle(e)[p];
      const bar = r.querySelector('.island');
      const root = r.querySelector('.shell') || bar;
      const glass = getComputedStyle(root).getPropertyValue('--bw-glass').trim();
      const probe = document.createElement('i'); probe.style.color = glass; r.appendChild(probe); const glassRgb = getComputedStyle(probe).color; probe.remove();
      return { dot: cs(r.querySelector('.srv-dot'), 'backgroundColor'), word: cs(r.querySelector('.srv-w'), 'color'), glass: glassRgb, barBg: cs(bar, 'backgroundColor') };
    });
    check(`${tag}: the green dot clears 3:1 against the top bar's glass (${contrast(rgb(m.dot), rgb(m.glass)).toFixed(2)}) and the word clears 4.5:1 (${contrast(rgb(m.word), rgb(m.glass)).toFixed(2)})`, contrast(rgb(m.dot), rgb(m.glass)) >= 3 && contrast(rgb(m.word), rgb(m.glass)) >= 4.5, JSON.stringify(m));
    await openSettings(page);
    const q = await shRoot(page, (r) => {
      const d = r.querySelector('.drawer');
      const bg = (e) => getComputedStyle(e).backgroundColor;
      const k = d.querySelector('.set-prefs .set-k');
      const card = d.querySelector('.set-prefs');
      const on = d.querySelector('.set-seg button[aria-pressed="true"]');
      return { k: getComputedStyle(k).color, card: bg(card), onC: getComputedStyle(on).color, h: getComputedStyle(d.querySelector('.set-prefs .set-h')).color, about: bg(d.querySelector('.set-about')), aboutInk: getComputedStyle(d.querySelector('.set-about .set-dl dd')).color };
    });
    const pillBg = await shRoot(page, (r) => getComputedStyle(r.querySelector('.drawer .set-seg'), '::before').backgroundColor);
    check(`${tag} Settings: label text on the card ≥ 4.5:1 (${contrast(rgb(q.k), rgb(q.card)).toFixed(2)}), heading ≥ 4.5:1, pressed text on the pill ≥ 4.5:1 (${contrast(rgb(q.onC), rgb(pillBg)).toFixed(2)})`,
      contrast(rgb(q.k), rgb(q.card)) >= 4.5 && contrast(rgb(q.h), rgb(q.card)) >= 4.5 && contrast(rgb(q.onC), rgb(pillBg)) >= 4.5, JSON.stringify([q, pillBg]));
    check(`${tag} Settings: About (0.17.4: the same flat card surface as the other tabs) keeps its text ≥ 4.5:1 (${contrast(rgb(q.aboutInk), rgb(q.about)).toFixed(2)})`, /^rgba?\(/.test(q.about) && contrast(rgb(q.aboutInk), rgb(q.about)) >= 4.5, JSON.stringify([q.about, q.aboutInk]));
    check(`${tag}: no page error`, page.errors.length === 0, page.errors.join(' | '));
    await ctx.close();
    await new Promise((ok) => s2.close(ok));
  }
} catch (e) {
  check('suite ran to the end', false, e.stack || String(e));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
S.finish();
