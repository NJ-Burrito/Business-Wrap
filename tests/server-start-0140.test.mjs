// 0.14.0 S1 the server banner (editor/ext/18-server.js): an editor opened with no Business-Wrap server answering shows «الخادم المحلي متوقف»
// with a big «تشغيل الخادم» button; Start runs the real handler; the banner turns into «افتح من الخادم», which opens the SAME document served.
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
const bar = (page) => shRoot(page, (r) => { const b = r.querySelector('.srv-bar'); if (!b || b.hidden) return null; return { st: b.dataset.st, dir: b.dir, title: b.querySelector('strong')?.textContent, start: b.querySelector('[data-k="sbStart"] .w')?.textContent || null, startDisabled: b.querySelector('[data-k="sbStart"]')?.disabled || false, open: b.querySelector('[data-k="sbOpen"] .w')?.textContent || null, note: b.querySelector('.srv-note')?.textContent || '', hasIcon: !!b.querySelector('[data-k="sbStart"] svg.ic, [data-k="sbOpen"] svg.ic'), h: Math.round(b.querySelector('.b.primary')?.getBoundingClientRect().height || 0), top: Math.round(b.getBoundingClientRect().top) }; });
const press = (page, k) => shRoot(page, (r, key) => r.querySelector(`.srv-bar [data-k="${key}"]`).click(), k);
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
  await until(async () => !!(await bar(f1)), 6000);
  const b0 = await bar(f1);
  check('banner/no server: «الخادم المحلي متوقف» with a big «تشغيل الخادم» (icon, >= 40 px tall), right-to-left, at the top', b0 && b0.st === 'down' && b0.title === 'الخادم المحلي متوقف' && b0.start === 'تشغيل الخادم' && b0.dir === 'rtl' && b0.hasIcon && b0.h >= 40 && b0.top <= 16 && !b0.open, JSON.stringify(b0));
  check('banner/no server: the page says so for tests (data-bw-server=down)', (await f1.evaluate(() => document.documentElement.dataset.bwServer)) === 'down');
  const http = f1.reqs.filter((u) => /https?:\/\//.test(u));
  check('banner/no network: the only http request from the file:// page is GET <probe port>/api/version', http.length > 0 && http.every((u) => PROBE.test(u)), http.join(' '));

  // ── 2. Start → the real handler → «افتح من الخادم» → the same document, served ──
  await press(f1, 'sbStart');
  await until(async () => (await f1.evaluate(() => window.__launched.length)) > 0, 6000);
  const launched = await f1.evaluate(() => window.__launched);
  check('start: hands business-wrap://open?file=<this document> to the browser, once', launched.length === 1 && launched[0] === `business-wrap://open?file=${encodeURIComponent(editor)}`, JSON.stringify(launched));
  const bs = await bar(f1);
  check('start: while it starts the button is disabled and the banner says so', bs && bs.startDisabled && /جارٍ تشغيل الخادم/.test(bs.note), JSON.stringify(bs));
  const h = handler(launched[0], { BW_OPEN_PORT: String(p1) });
  check('start: the real handler brings a server up on the probe port', h.status === 0 && (await up(p1)), `${h.status} ${h.stderr}`.slice(0, 300));
  check('start: the banner turns into «افتح من الخادم»', await until(async () => (await bar(f1))?.open === 'افتح من الخادم', 15000), JSON.stringify(await bar(f1)));
  const svcFile = await f1.evaluate(() => window.BW.S.svc);
  const nav = f1.waitForURL(`http://127.0.0.1:${p1}/`, { timeout: 15000 });
  await press(f1, 'sbOpen');
  await nav;
  await f1.waitForFunction(() => window.BW?.ready);
  const same = await f1.evaluate(() => ({ svc: window.BW.S.svc, proto: location.protocol }));
  check('open: «افتح من الخادم» goes to the served address of the same document (same service)', same.proto === 'http:' && same.svc === svcFile, JSON.stringify({ same, svcFile }));
  await sleep(1500);
  check('open: the served page shows no banner (its server answers)', (await bar(f1)) === null);

  // ── 3. served page whose server dies: banner again; Start restarts the SAME file; Open ──
  stop();
  check('served/died: the server is stopped', await until(async () => !(await up(p1)), 15000));
  await sleep(2500); // the supervisor and the host file finish going away before the next start
  await f1.evaluate(() => window.dispatchEvent(new Event('focus'))); // the window regains focus: the page re-checks at once
  check('served/died: the banner comes back on focus, no 10 s wait', await until(async () => (await bar(f1))?.st === 'down', 8000), JSON.stringify(await bar(f1)));
  await f1.evaluate(() => { window.__launched = []; });
  await press(f1, 'sbStart');
  await until(async () => (await f1.evaluate(() => window.__launched.length)) > 0, 6000);
  const l2 = await f1.evaluate(() => window.__launched);
  check('served/died: Start asks for the same file the server was serving', l2.length === 1 && l2[0] === `business-wrap://open?file=${encodeURIComponent(editor)}`, JSON.stringify(l2));
  const h3 = handler(l2[0], { BW_OPEN_PORT: String(p1) });
  check('served/died: the real handler starts it again', h3.status === 0 && (await up(p1)), `${h3.status} ${h3.stderr}`.slice(0, 200));
  await f1.waitForTimeout(1500);
  check('served/died: once it answers again the served page needs no banner', await until(async () => (await bar(f1)) === null, 15000), JSON.stringify(await bar(f1)));
  const gf = await fetch(`http://127.0.0.1:${p1}/api/servers/file`).then((r) => r.json()).catch(() => ({}));
  const gb = await fetch(`http://127.0.0.1:${p1}/api/servers/file`, { headers: { origin: 'https://example.com' } });
  const gp = await fetch(`http://127.0.0.1:${p1}/api/servers/file`, { method: 'POST' });
  check('route: GET /api/servers/file names the served document; a foreign origin gets 403, POST 405', path.resolve(gf.file || '') === path.resolve(editor) && gb.status === 403 && gp.status === 405, JSON.stringify({ gf, gb: gb.status, gp: gp.status }));
  await ctx1.close();
  stop();
  await until(async () => !(await up(p1)), 15000);

  // ── 4. English, dismiss (comes back on the next open), a server that appears while the banner shows, a server already up ──
  const p4 = await free();
  probeEnv([p4]);
  const ctx4 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const e1 = await openPage(ctx4, fileUrl, { ports: [p4], ui: 'en' });
  await until(async () => !!(await bar(e1)), 6000);
  const be = await bar(e1);
  check('english: «The local server is not running» and «Start server», left-to-right', be && be.title === 'The local server is not running' && be.start === 'Start server' && be.dir === 'ltr', JSON.stringify(be));
  await press(e1, 'sbDismiss');
  await sleep(300);
  check('dismiss: the banner goes away', (await bar(e1)) === null);
  await e1.evaluate(() => window.dispatchEvent(new Event('focus')));
  await sleep(1500);
  check('dismiss: a re-check does not bring it back inside the same open', (await bar(e1)) === null);
  await e1.reload();
  await e1.waitForFunction(() => window.BW?.ready);
  check('dismiss: it comes back on the next open', await until(async () => !!(await bar(e1)), 6000));
  const sp = await server(p4);
  await e1.evaluate(() => window.dispatchEvent(new Event('focus')));
  check('recheck: a server that comes up elsewhere turns the banner into «Open from the server»', await until(async () => (await bar(e1))?.open === 'Open from the server', 8000), JSON.stringify(await bar(e1)));
  await ctx4.close();
  const ctx5 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const e2 = await openPage(ctx5, fileUrl, { ports: [p4] });
  await sleep(2500);
  check('already running: opening the file with a server up shows no banner', (await bar(e2)) === null && (await e2.evaluate(() => document.documentElement.dataset.bwServer)) === 'none');
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
