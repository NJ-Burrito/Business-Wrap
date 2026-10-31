// 0.14.0 S1 the server banner, 0.15.0 the server TOGGLE (editor/ext/18-server.js, lane spell, owner note 15): an editor opened with no Business-Wrap server
// answering shows its toggle OFFLINE («غير متصل»); pressing it runs the real handler; the toggle turns ONLINE, and Settings offers «افتح المحرر من الخادم»,
// which opens the SAME document served. The banner, its Dismiss button and its «Open» button are gone.
//
//   node tests/server-start-0140.test.mjs
// Own state folders and free ports (BW_LOCAL_DIR, BW_STATE_DIR, BW_WORKSPACE, BW_PROBE_PORTS): never the user's host on 4317 and never the
// registered business-wrap: protocol (the handler is run directly with the URL the page hands to the browser). Everything started here is stopped here.
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions, REPO } from '../engine/export.mjs';
import { buildEditor } from '../engine/build-editor.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  server-start: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-srvstart-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await fn()) return true; return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, 'local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_POWER_GRACE_MS: '300', BW_NO_BROWSER: '1', BW_NO_PROTOCOL: '1' };
Object.assign(process.env, { BW_LOCAL_DIR: env.BW_LOCAL_DIR, BW_STATE_DIR: env.BW_STATE_DIR, BW_WORKSPACE: env.BW_WORKSPACE, BW_NO_PROTOCOL: '1' });
const CLI = path.join(REPO, 'update', 'cli.mjs');
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });
const handler = (url, extra = {}) => spawnSync(process.execPath, [CLI, 'handle', url, '--json'], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 90000, windowsHide: true });
const stop = () => spawnSync(process.execPath, [CLI, 'handle', 'business-wrap://stop'], { env, windowsHide: true, timeout: 60000 });
const stray = [];
async function server(port) {
  const c = spawn(process.execPath, [path.join(REPO, 'engine', 'serve.mjs'), editor, '--port', String(port)], { env: { ...env, BW_SERVE_CHILD: '1' }, detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  await until(() => up(port));
  stray.push(c.pid);
  return c.pid;
}
const probeEnv = (ports) => { process.env.BW_PROBE_PORTS = ports.join(','); env.BW_PROBE_PORTS = ports.join(','); };
const shRoot = (page, fn, arg) => page.evaluate(([src, a]) => { const r = document.getElementById('bw-ui-host').shadowRoot; return new Function('r', 'a', `return (${src})(r, a)`)(r, a); }, [fn.toString(), arg]);
const bar = (page) => shRoot(page, (r) => { const b = r.querySelector('.island .srv-toggle'); if (!b) return null; return { st: b.dataset.st, dir: b.closest('.shell')?.dataset.tdir, word: b.querySelector('.srv-w')?.textContent || '', disabled: b.disabled, busy: b.getAttribute('aria-busy'), hasIcon: !!b.querySelector('svg.ic'), h: Math.round(b.getBoundingClientRect().height), role: b.getAttribute('role'), srvBar: !!r.querySelector('.srv-bar') }; });
const press = (page, k) => shRoot(page, (r, key) => (key === 'sbOpen' ? r.querySelector('.set-srv-body [data-k="srvOpen"]') : r.querySelector('.island .srv-toggle')).click(), k); // the toggle starts or stops; the open link is in Settings
const openSettings = async (page) => { await page.evaluate(() => window.BW.openDrawer('settings')); await until(() => shRoot(page, (r) => !!r.querySelector('.set-srv-body')), 5000); };
const fileUrl = pathToFileURL(editor).href;
const PROBE = /^GET http:\/\/127\.0\.0\.1:(43(1[7-9]|2[0-7])|\d+)\/api\/version$/;

async function openPage(ctx, url, { ports, ui } = {}) {
  const page = await ctx.newPage();
  page.errors = [];
  page.reqs = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('request', (r) => page.reqs.push(`${r.method()} ${r.url()}`));
  await page.addInitScript(({ ports: pp, ui: u }) => {
    if (pp) window.__bwProbePorts = pp;
    if (u) { try { localStorage.setItem('bw:ui', u); } catch { /* none */ } }
    // (0.15.0: no banner, nothing to switch on: an automated browser sees the toggle like anyone)
    window.__launched = [];
    document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
  }, { ports, ui });
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(600);
  await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-s="new"]')?.click());
  return page;
}

const browser = await chromium.launch(launchOptions());
try {
  // ── 1. no server, Arabic (the default): the banner is there at once, big, with Start; one GET per probe port, nothing else ──
  const p1 = await free();
  probeEnv([p1]);
  const ctx1 = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const f1 = await openPage(ctx1, fileUrl, { ports: [p1] });
  await until(async () => (await bar(f1))?.st === 'offline', 6000);
  const b0 = await bar(f1);
  check('toggle/no server: «غير متصل» (offline, icon + word, a switch), right-to-left, about 40 px tall, in the top bar; no banner', b0 && b0.st === 'offline' && b0.word === 'غير متصل' && b0.dir === 'rtl' && b0.hasIcon && b0.role === 'switch' && b0.h >= 38 && b0.h <= 42 && !b0.srvBar, JSON.stringify(b0));
  check('toggle/no server: the page says so for tests (data-bw-server=offline)', (await f1.evaluate(() => document.documentElement.dataset.bwServer)) === 'offline');
  const http = f1.reqs.filter((u) => /https?:\/\//.test(u));
  check('toggle/no network: the only http request from the file:// page is GET <probe port>/api/version', http.length > 0 && http.every((u) => PROBE.test(u)), http.join(' '));

  // ── 2. Start → the real handler → «افتح من الخادم» → the same document, served ──
  await press(f1);
  await until(async () => (await f1.evaluate(() => window.__launched.length)) > 0, 6000);
  const launched = await f1.evaluate(() => window.__launched);
  check('start: hands business-wrap://open?file=<this document> to the browser, once', launched.length === 1 && launched[0] === `business-wrap://open?file=${encodeURIComponent(editor)}`, JSON.stringify(launched));
  const bs = await bar(f1);
  check('start: while it starts the toggle is disabled, aria-busy, and says «جارٍ التشغيل…»', bs && bs.disabled && bs.busy === 'true' && bs.st === 'starting' && /جارٍ التشغيل/.test(bs.word), JSON.stringify(bs));
  const h = handler(launched[0], { BW_OPEN_PORT: String(p1) });
  check('start: the real handler brings a server up on the probe port', h.status === 0 && (await up(p1)), `${h.status} ${h.stderr}`.slice(0, 300));
  check('start: the toggle turns «متصل» with the port', await until(async () => (await bar(f1))?.st === 'online', 15000) && (await bar(f1)).word === `متصل :${p1}`, JSON.stringify(await bar(f1)));
  const svcFile = await f1.evaluate(() => window.BW.S.svc);
  const nav = f1.waitForURL(`http://127.0.0.1:${p1}/`, { timeout: 15000 });
  await openSettings(f1);
  await press(f1, 'sbOpen');
  await nav;
  await f1.waitForFunction(() => window.BW?.ready);
  const same = await f1.evaluate(() => ({ svc: window.BW.S.svc, proto: location.protocol }));
  check('open: «افتح من الخادم» goes to the served address of the same document (same service)', same.proto === 'http:' && same.svc === svcFile, JSON.stringify({ same, svcFile }));
  await sleep(1500);
  check('open: the served page shows its toggle online (its server answers)', await until(async () => (await bar(f1))?.st === 'online', 8000), JSON.stringify(await bar(f1)));

  // ── 3. served page whose server dies: banner again; Start restarts the SAME file; Open ──
  stop();
  check('served/died: the server is stopped', await until(async () => !(await up(p1)), 15000));
  await sleep(2500); // the supervisor and the host file finish going away before the next start
  await f1.evaluate(() => window.dispatchEvent(new Event('focus'))); // the window regains focus: the page re-checks at once
  check('served/died: the toggle goes offline on focus, no 10 s wait', await until(async () => (await bar(f1))?.st === 'offline', 8000), JSON.stringify(await bar(f1)));
  await f1.evaluate(() => { window.__launched = []; });
  await press(f1);
  await until(async () => (await f1.evaluate(() => window.__launched.length)) > 0, 6000);
  const l2 = await f1.evaluate(() => window.__launched);
  check('served/died: Start asks for the same file the server was serving', l2.length === 1 && l2[0] === `business-wrap://open?file=${encodeURIComponent(editor)}`, JSON.stringify(l2));
  const h3 = handler(l2[0], { BW_OPEN_PORT: String(p1) });
  check('served/died: the real handler starts it again', h3.status === 0 && (await up(p1)), `${h3.status} ${h3.stderr}`.slice(0, 200));
  await f1.waitForTimeout(1500);
  check('served/died: once it answers again the served page shows online', await until(async () => (await bar(f1))?.st === 'online', 15000), JSON.stringify(await bar(f1)));
  const gf = await fetch(`http://127.0.0.1:${p1}/api/servers/file`).then((r) => r.json()).catch(() => ({}));
  const gb = await fetch(`http://127.0.0.1:${p1}/api/servers/file`, { headers: { origin: 'https://example.com' } });
  const gp = await fetch(`http://127.0.0.1:${p1}/api/servers/file`, { method: 'POST' });
  check('route: GET /api/servers/file names the served document; a foreign origin gets 403, POST 405', path.resolve(gf.file || '') === path.resolve(editor) && gb.status === 403 && gp.status === 405, JSON.stringify({ gf, gb: gb.status, gp: gp.status }));
  await ctx1.close();
  stop();
  await until(async () => !(await up(p1)), 15000);

  // ── 4. English, a re-check after the window regains focus, a server that appears while the toggle shows offline, a server already up ──
  const p4 = await free();
  probeEnv([p4]);
  const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const e1 = await openPage(ctx4, fileUrl, { ports: [p4], ui: 'en' });
  await until(async () => (await bar(e1))?.st === 'offline', 6000);
  const be = await bar(e1);
  check('english: «Offline», left-to-right, a switch, no banner and no Dismiss button', be && be.word === 'Offline' && be.dir === 'ltr' && be.role === 'switch' && !be.srvBar, JSON.stringify(be));
  await e1.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(1500);
  check('recheck: with no server the toggle stays offline (nothing to dismiss, nothing comes and goes)', (await bar(e1))?.st === 'offline');
  const sp = await server(p4);
  await e1.evaluate(() => window.dispatchEvent(new Event('focus')));
  check('recheck: a server that comes up elsewhere turns the toggle «Online :port»', await until(async () => (await bar(e1))?.st === 'online', 8000) && (await bar(e1)).word === `Online :${p4}`, JSON.stringify(await bar(e1)));
  await ctx4.close();
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const e2 = await openPage(ctx5, fileUrl, { ports: [p4] });
  await sleep(2500);
  check('already running: opening the file with a server up shows the toggle online at once', (await bar(e2))?.st === 'online' && (await e2.evaluate(() => document.documentElement.dataset.bwServer)) === 'online');
  check('no page errors', !e2.errors.length && !e1.errors.length && !f1.errors.length, [...e1.errors, ...e2.errors, ...f1.errors].join(' | '));
  await ctx5.close();
  try { process.kill(sp); } catch { /* gone */ }
} catch (e) {
  check('server-start run', false, e.stack?.split('\n').slice(0, 5).join(' / '));
} finally {
  await browser.close();
  for (const pid of stray) { if (pid) { try { process.kill(pid); } catch { /* gone */ } } }
  spawnSync(process.execPath, [CLI, 'close'], { env, windowsHide: true, timeout: 60000 });
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: server-start ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
