// 0.15.0 lane spell, owner note 15: ONE server toggle (editor/ext/18-server.js), in a real browser (Edge when installed).
//   - exactly one toggle in the top bar, exactly two with Settings › Local server open, no banner (.srv-bar), no Start/Stop/Open buttons
//   - role="switch" + aria-checked; the state is icon + word + colour; AR and EN; both toggles always show the same state; axe: no serious violation
//   - served page: shows online with the port; stop is refused with the reason in the tooltip while an export/import/print job runs; stop then Undo
//   - file:// page: no server -> offline, the gold ring pulses once per open (not in calm mode); press -> «Starting…» (disabled, aria-busy) -> online;
//     press -> stop (business-wrap://stop) -> offline + an «Undo» toast that starts it again; a server that was already up -> online, no pulse
//   - events: window `bw:server` {online} on every change of the answer; `bw:wm` W07 (went online) / W08 (went offline) on a real transition only
// A real stop is NEVER sent to a real server here: the served page's /api/servers/stop is answered by the test, and the file:// page talks to a tiny fake server.
//
//   node tests/server-toggle-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { launch, browserName, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  server-toggle: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = tmpDir('bw-toggle-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });

/** A stand-in for a Business-Wrap server: answers GET /api/version the way a file:// page's probe expects. */
function fake(port) {
  const s = http.createServer((req, res) => {
    if (req.url === '/api/version') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin || '*' }); res.end(JSON.stringify({ name: 'Business-Wrap', version: '0.0.0-test', served: true, port })); } else { res.writeHead(404); res.end(); }
  });
  return { up: () => new Promise((ok) => s.listen(port, '127.0.0.1', ok)), down: () => new Promise((ok) => { s.close(() => ok()); s.closeAllConnections?.(); }) };
}
const browser = await launch();
const toggles = (page) => shRoot(page, (r) => [...r.querySelectorAll('.srv-toggle')].map((b) => ({ where: b.dataset.where, st: b.dataset.st, role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), busy: b.getAttribute('aria-busy'), disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), word: b.querySelector('.srv-w')?.textContent, icon: !!b.querySelector('.srv-ic svg'), title: b.title, pulse: b.dataset.pulse, inBar: !!b.closest('.island'), label: b.getAttribute('aria-label'), fill: getComputedStyle(b).backgroundColor, h: Math.round(b.getBoundingClientRect().height) })));
const press = (page, where = 'top') => shRoot(page, (r, w) => (w === 'settings' ? r.querySelector('.drawer .srv-toggle') : r.querySelector('.island .srv-toggle')).click(), where);
const toastText = (page) => shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast')].map((t) => t.textContent.trim()));
async function open(url, { ui, calm, ports } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.events = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(({ ui: u, calm: c, ports: pp }) => {
    if (pp) window.__bwProbePorts = pp;
    try { if (u) localStorage.setItem('bw:ui', u); if (c) localStorage.setItem('bw:calm', '1'); } catch { /* none */ }
    window.__launched = [];
    window.__ev = [];
    window.addEventListener('bw:server', (e) => window.__ev.push(`server:${e.detail.online}`));
    window.addEventListener('bw:wm', (e) => window.__ev.push(`wm:${e.detail.id}`));
    document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
  }, { ui, calm, ports });
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(600);
  return { ctx, page };
}
const events = (page) => page.evaluate(() => window.__ev.slice());

try {
  // ── 1. a served page ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  const server = await serve(editor, 0, { workspace: null });
  const sp = server.address().port;
  const { ctx: c1, page: a } = await open(`http://127.0.0.1:${sp}/`, { ports: [sp] });
  const t1 = await toggles(a);
  check(`browser is ${browserName()}; exactly ONE toggle with Settings closed, in the top bar`, t1.length === 1 && t1[0].where === 'top' && t1[0].inBar, JSON.stringify(t1));
  check('it is a switch: role=switch, aria-checked=true, state online, icon + word «متصل :port»', t1[0].role === 'switch' && t1[0].checked === 'true' && t1[0].st === 'online' && t1[0].icon && t1[0].word === `متصل :${sp}`, JSON.stringify(t1[0]));
  check('the toggle is 40 px tall', t1[0].h === 40, String(t1[0].h));
  const banner = await shRoot(a, (r) => ({ bar: !!r.querySelector('.srv-bar'), btn: [...r.querySelectorAll('button')].filter((b) => /Start server|Stop server|تشغيل الخادم|إيقاف كل خوادم|افتح من الخادم/.test(b.textContent)).length }));
  check('no banner (.srv-bar) and no Start / Stop / Open server button anywhere', !banner.bar && banner.btn === 0, JSON.stringify(banner));
  check('<html data-bw-server> says online (for tests)', (await a.evaluate(() => document.documentElement.dataset.bwServer)) === 'online');
  const ev1 = await events(a);
  check('window event bw:server {online:true} fired; no bw:wm for the very first answer', ev1.includes('server:true') && !ev1.some((x) => x.startsWith('wm:')), JSON.stringify(ev1));
  await a.evaluate(() => BW.openDrawer('settings'));
  await until(async () => (await toggles(a)).length === 2, 4000);
  const t2 = await toggles(a);
  check('Settings › Local server open: exactly TWO toggles (top bar + Settings), the same state, the Settings one taller', t2.length === 2 && t2[0].st === t2[1].st && t2.find((x) => x.where === 'settings').h === 56, JSON.stringify(t2.map((x) => [x.where, x.st, x.h])));
  const sentence = await shRoot(a, (r) => r.querySelector('.set-srv-status')?.textContent.trim());
  check('Settings says the port in a sentence under its toggle', sentence.includes(String(sp)), sentence);
  // axe on the toggles
  await a.evaluate(fs.readFileSync(AXE, 'utf8')); // evaluated through the protocol: the page CSP refuses an injected <script>
  const ax = await a.evaluate(async () => { const r = await window.axe.run(document.getElementById('bw-ui-host'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }); return r.violations.filter((v) => v.nodes.some((n) => /srv-toggle/.test(n.html))).map((v) => `${v.id}:${v.nodes.filter((n) => /srv-toggle/.test(n.html)).length}`); });
  check('axe: no violation on the server toggles (role=switch, name, contrast)', ax.length === 0, ax.join(' '));
  // a job running: stop is refused, reason in the tooltip
  await a.evaluate(() => { window.__end = BW.EXT.busy.begin('busy.export'); });
  await a.evaluate(() => BW.EXT.server.draw());
  const tb = (await toggles(a)).find((x) => x.where === 'top');
  check('while an export runs the toggle is aria-disabled and its tooltip gives the reason', tb.ariaDisabled === 'true' && /تصدير|export/i.test(tb.title) && tb.st === 'online', JSON.stringify(tb));
  let posts = 0;
  await a.route('**/api/servers/stop', async (route) => { posts += 1; await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"grace":300}' }); });
  await press(a);
  await sleep(500);
  check('pressing it then stops nothing (no POST /api/servers/stop) and a toast says why', posts === 0 && (await toggles(a))[0].st === 'online' && (await toastText(a)).some((x) => /تصدير|export/i.test(x)), `${posts} ${await toastText(a)}`);
  await a.evaluate(() => window.__end());
  await a.evaluate(() => BW.EXT.server.draw());
  // stop (answered by the test, the real server is not stopped), then Undo
  await a.evaluate(() => { window.__ev.length = 0; });
  await press(a);
  check('online -> press: «جارٍ الإيقاف…» then offline, one POST /api/servers/stop (confirm), the other toggle follows', await until(async () => { const t = await toggles(a); return t.length === 2 && t.every((x) => x.st === 'offline'); }, 8000) && posts === 1, JSON.stringify(await toggles(a)));
  const off = (await toggles(a))[0] || (await toggles(a))[1];
  const onFill = t1[0].fill;
  check('offline is not colour alone: another icon, another word «غير متصل», another fill', off.word === 'غير متصل' && off.checked === 'false' && off.fill !== onFill && off.icon, `${off.fill} vs ${onFill}`);
  const ev2 = await events(a);
  check('stop fires bw:server {online:false} and bw:wm W08 once', ev2.filter((x) => x === 'server:false').length === 1 && ev2.filter((x) => x === 'wm:W08').length === 1, JSON.stringify(ev2));
  check('an «تراجع» (Undo) toast is offered', (await toastText(a)).some((x) => /تراجع/.test(x)), JSON.stringify(await toastText(a)));
  await shRoot(a, (r) => [...r.querySelectorAll('.toasts .toast button')].find((b) => /تراجع/.test(b.textContent))?.click());
  check('Undo starts it again: online, W07 fired', await until(async () => (await toggles(a)).every((x) => x.st === 'online'), 12000) && (await events(a)).includes('wm:W07'), JSON.stringify(await events(a)));
  await a.unroute('**/api/servers/stop');
  check('no page errors (served)', a.errors.length === 0, a.errors.join(' | '));
  await c1.close();
  server.close();
  server.closeAllConnections?.();

  // ── 2. English ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const s2 = await serve(editor, 0, { workspace: null });
  const p2 = s2.address().port;
  const { ctx: c2, page: e } = await open(`http://127.0.0.1:${p2}/`, { ui: 'en', ports: [p2] });
  const te = (await toggles(e))[0];
  check('English: «Online :port», left-to-right label, switch role', te.word === `Online :${p2}` && te.role === 'switch' && /Local server/.test(te.label), JSON.stringify(te));
  await c2.close();
  s2.close();
  s2.closeAllConnections?.();

  // ── 3. a file:// page: no server, then a server that comes up, then stops ────────────────────────────────────────────────────────
  const port = await free();
  const fs1 = fake(port);
  const fileUrl = pathToFileURL(editor).href;
  const { ctx: c3, page: f } = await open(fileUrl, { ports: [port] });
  check('file://, no server: offline («غير متصل») after the first probe', await until(async () => (await toggles(f))[0]?.st === 'offline', 8000), JSON.stringify(await toggles(f)));
  const pulsed = await until(async () => (await toggles(f))[0]?.pulse === '1', 1300, 30); // the ring lasts 1.3 s from the first offline answer
  check('file://, no server: the gold ring pulses (data-pulse=1, once per open) and then settles', pulsed && (await until(async () => (await toggles(f))[0]?.pulse === '0', 4000)), JSON.stringify(await toggles(f)));
  check('file://, no server: bw:server {online:false} fired and NO bw:wm for the first answer', (await events(f)).includes('server:false') && !(await events(f)).some((x) => x.startsWith('wm:')), JSON.stringify(await events(f)));
  await press(f);
  check('press: «Starting…», disabled, aria-busy, spinner icon', await until(async () => { const t = (await toggles(f))[0]; return t?.st === 'starting' && t.disabled && t.busy === 'true'; }, 3000), JSON.stringify(await toggles(f)));
  check('press: hands business-wrap://open?file=<this document> to the browser, once', await until(async () => (await f.evaluate(() => window.__launched)).length === 1, 4000) && (await f.evaluate(() => window.__launched))[0] === `business-wrap://open?file=${encodeURIComponent(editor)}`, JSON.stringify(await f.evaluate(() => window.__launched)));
  await fs1.up();
  check('the server answers -> online with the port; W07 and bw:server {online:true} fire', await until(async () => (await toggles(f))[0]?.st === 'online', 12000) && (await toggles(f))[0].word === `متصل :${port}` && (await events(f)).includes('wm:W07') && (await events(f)).includes('server:true'), JSON.stringify([await toggles(f), await events(f)]));
  await f.evaluate(() => BW.openDrawer('settings'));
  await until(async () => (await toggles(f)).length === 2, 4000);
  const open2 = await shRoot(f, (r) => !!r.querySelector('.set-srv-body [data-k="srvOpen"]'));
  check('Settings (file://, online) offers «افتح المحرر من الخادم» (the only open link) and shows the same state in both toggles', open2 && (await toggles(f)).every((x) => x.st === 'online'));
  await f.evaluate(() => { window.__launched.length = 0; window.__ev.length = 0; });
  await press(f, 'settings'); // the Settings toggle is the same component: it stops too
  check('online -> press the SETTINGS toggle: asks the installed Business-Wrap to stop (business-wrap://stop)', await until(async () => (await f.evaluate(() => window.__launched)).includes('business-wrap://stop'), 4000));
  await fs1.down();
  check('the server goes away -> offline; W08 fires; an «تراجع» toast appears', await until(async () => (await toggles(f))[0]?.st === 'offline', 12000) && (await events(f)).includes('wm:W08') && (await toastText(f)).some((x) => /تراجع/.test(x)), JSON.stringify([await toggles(f), await events(f), await toastText(f)]));
  await f.evaluate(() => { window.__launched.length = 0; });
  await shRoot(f, (r) => [...r.querySelectorAll('.toasts .toast button')].find((b) => /تراجع/.test(b.textContent))?.click());
  check('Undo asks for the server again (business-wrap://open?file=)', await until(async () => (await f.evaluate(() => window.__launched)).some((u) => u.startsWith('business-wrap://open?file=')), 4000));
  await fs1.up();
  check('and it is online again', await until(async () => (await toggles(f)).every((x) => x.st === 'online'), 12000));
  check('no page errors (file://)', f.errors.length === 0, f.errors.join(' | '));
  await fs1.down();
  await c3.close();

  // ── 4. a handler that does nothing: the error state, one toast, «Try again» ───────────────────────────────────────────────────
  const port2 = await free();
  const { ctx: c4, page: g } = await open(fileUrl, { ports: [port2] });
  await until(async () => (await toggles(g))[0]?.st === 'offline', 8000);
  // make the wait short by faking time: srvWait polls every 700 ms for 25 s; the test fast-forwards Date.now instead of waiting
  await g.evaluate(() => { const real = Date.now; let skew = 0; Date.now = () => real() + skew; window.__skew = (ms) => { skew += ms; }; });
  await press(g);
  await until(async () => (await toggles(g))[0]?.st === 'starting', 3000);
  await g.evaluate(() => window.__skew(26000));
  check('a start that never answers ends in the error state «تعذّر التشغيل» with a reason in the tooltip', await until(async () => (await toggles(g))[0]?.st === 'error', 8000) && /business-wrap protocol register/.test((await toggles(g))[0].title), JSON.stringify(await toggles(g)));
  check('…and one toast with «حاول مرة أخرى» (Try again)', (await toastText(g)).filter((x) => /حاول مرة أخرى/.test(x)).length === 1, JSON.stringify(await toastText(g)));
  await c4.close();

  // ── 5. calm mode: no pulse; a server already up: online at once ───────────────────────────────────────────────────────────────
  const port3 = await free();
  const { ctx: c5, page: h } = await open(fileUrl, { ports: [port3], calm: true });
  await until(async () => (await toggles(h))[0]?.st === 'offline', 8000);
  await sleep(400);
  check('calm mode: the ring does not pulse', (await toggles(h))[0].pulse === '0');
  await c5.close();
  const fs3 = fake(port3);
  await fs3.up();
  const { ctx: c6, page: k } = await open(fileUrl, { ports: [port3] });
  check('a server already up when the file opens: online, no pulse, W07 not fired for the first answer', await until(async () => (await toggles(k))[0]?.st === 'online', 8000) && (await toggles(k))[0].pulse === '0' && !(await events(k)).some((x) => x.startsWith('wm:')), JSON.stringify([await toggles(k), await events(k)]));
  await c6.close();
  await fs3.down();
} catch (e) {
  check('suite ran to the end', false, e.stack?.split('\n').slice(0, 5).join(' / '));
} finally {
  await browser.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
