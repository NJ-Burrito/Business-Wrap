// lane start: the top-bar host switch of an editor the HOST ITSELF served (http://127.0.0.1:<port>/), in a REAL headed Chrome.
//   Owner bug (2026-11-04): «starting the host is not working from the editor itself». After «off» stopped the host, «on» must do what a file:// page does:
//   hand business-wrap://start to the browser, poll 127.0.0.1:4317-4327 /api/health, and show «متصل :port» with a green dot, reconnecting to the port that answers.
// Part A (always runs): a served page, the launch link stubbed, a stand-in host that comes up on ANOTHER port -> the page asks business-wrap://start once
//   and navigates to the new port.
// Part B (Windows, only when business-wrap:// is registered for THIS install): the real protocol. The test host runs on its own port (BW_OPEN_PORT), the page probes only
//   that range (window.__bwProbePorts), the owner's host on 4317 is never touched. switch off -> Offline (the page is still the http page), switch on -> Connected :port.
//   BW_START_SHOTS=<dir> keeps a screenshot of each state.   node tests/start-http-0177.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { REPO, sleep, until, launch, shRoot } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';
import { chromePath } from '../engine/export.mjs';
import { status as protoStatus } from '../engine/protocol.mjs';
import { suite } from './_harness.mjs';

const S = suite("start-http");
const { check, results } = S;
const tmp = fs.mkdtempSync(path.join(process.env.BW_START_TMP || os.tmpdir(), 'bw-start177-'));
const shots = process.env.BW_START_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });
const killTree = (pid) => { if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); };

const ui = (page) => page.evaluate(() => {
  const r = document.getElementById('bw-ui-host')?.shadowRoot;
  const b = r?.querySelector('.srv-toggle');
  if (!b) return null;
  const dot = b.querySelector('.srv-dot');
  return { word: b.querySelector('.srv-w')?.textContent || '', st: b.dataset.st, checked: b.getAttribute('aria-checked'), dot: dot ? getComputedStyle(dot).backgroundColor : '', n: r.querySelectorAll('.srv-toggle').length };
});
const state = (page) => page.evaluate(() => document.documentElement.dataset.bwServer);
const rgb = (s) => (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s) || []).slice(1, 4).map(Number);
const isGreen = (s) => { const [r, g, b] = rgb(s); return g > r + 25 && g >= b; };
const isRed = (s) => { const [r, g, b] = rgb(s); return r > g + 40 && r > b + 30; };
const press = async (page) => { const b = await page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot.querySelector('.srv-toggle').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.click(b.x, b.y); };

/** A stand-in host: answers /api/version and /api/health the way a file:// or served page's probe expects. */
function fake(port) {
  const s = http.createServer((req, res) => {
    if (req.url === '/api/version' || req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': req.headers.origin || '*' }); res.end(JSON.stringify({ name: 'Business-Wrap', version: '0.0.0-test', served: true, port })); } else if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>fake host</title>fake'); } else { res.writeHead(404); res.end(); }
  });
  return { up: () => new Promise((ok) => s.listen(port, '127.0.0.1', ok)), down: () => new Promise((ok) => { s.close(() => ok()); s.closeAllConnections?.(); }) };
}

try {
  // ── Part A: stubbed launch ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const browser = await launch();
  const server = await serve(editor, 0, { workspace: null });
  const sp = server.address().port;
  const np = await free();
  const stand = fake(np);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((pp) => {
    window.__bwProbePorts = pp;
    window.__launched = [];
    document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
  }, [sp, np]);
  await ctx.route('**/api/servers/stop', async (route) => { await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"grace":300}' }); setTimeout(() => { server.close(); server.closeAllConnections?.(); }, 200); });
  await page.goto(`http://127.0.0.1:${sp}/`);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(600);
  check('A: served page starts online on its own port', (await state(page)) === 'online' && (await ui(page))?.word === `متصل :${sp}`, JSON.stringify(await ui(page)));
  await page.evaluate(() => { window.__launched.length = 0; });
  await press(page);
  check('A: switch off -> Offline (the host stopped, the page stays)', await until(async () => (await state(page)) === 'offline', 10000) && page.url().startsWith(`http://127.0.0.1:${sp}/`), `${await state(page)} ${page.url()}`);
  await sleep(1200); // the periodic probe must not flip it back or navigate
  check('A: still Offline after the periodic probe', (await state(page)) === 'offline', await state(page));
  await press(page);
  check('A: switch on hands business-wrap://start to the browser, once', await until(async () => (await page.evaluate(() => window.__launched)).length >= 1, 5000) && (await page.evaluate(() => window.__launched)).filter((u) => u === 'business-wrap://start').length === 1, JSON.stringify(await page.evaluate(() => window.__launched)));
  check('A: «Starting…» while it waits', (await state(page)) === 'starting', await state(page));
  const toasts = () => shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast')].map((t) => t.textContent.trim()));
  check('A: a host that has not answered after a few seconds gets the «Open Business-Wrap?» hint', await until(async () => (await toasts()).some((x) => /المتصفح يسألك الإذن/.test(x)), 8000, 200), JSON.stringify(await toasts()));
  await stand.up(); // the host the launcher "started" came up on another port (4317 was taken by something else)
  const moved = await until(async () => { try { return page.url().startsWith(`http://127.0.0.1:${np}/`); } catch { return false; } }, 15000, 200);
  check('A: the page reconnects to the port that answers (navigates there)', moved, page.url());
  check('A: no page errors', page.errors.length === 0, page.errors.join(' | '));
  await stand.down();
  await ctx.close();
  await browser.close();
  server.close();
  server.closeAllConnections?.();

  // ── Part B: the real protocol, real Chrome, a host of this worktree on its own port ───────────────────────────────────────────────
  const ps = process.platform === 'win32' ? protoStatus() : null;
  const chrome = chromePath();
  if (!ps || !ps.registered || !ps.current) console.log(`SKIP  start-http part B: business-wrap:// is not registered for this install (run: node update/cli.mjs protocol register). ${ps ? `registered=${ps.registered} current=${ps.current}` : 'not Windows'}`);
  else if (!chrome || !/chrome\.exe$/i.test(chrome)) console.log('SKIP  start-http part B: no Google Chrome found');
  else {
    const hp = await free();
    process.env.BW_OPEN_PORT = String(hp); // the handler's start uses this port (tests only)
    process.env.BW_PROBE_PORTS = String(hp); // the host's own peer probe stays off the owner's 4317
    const probePorts = [hp];
    const origin = `http://127.0.0.1:${hp}`;
    const hostUp = async () => { try { const j = await (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(700) })).json(); return j?.name === 'Business-Wrap' ? j : null; } catch { return null; } };
    const cliStop = () => spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'stop', '--all'], { stdio: 'ignore', windowsHide: true, env: process.env });
    const dir = path.join(tmp, 'prof');
    fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
    const pair = { 'business-wrap': true };
    fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ protocol_handler: { allowed_origin_protocol_pairs: { [origin]: pair, 'http://127.0.0.1': pair } }, browser: { has_seen_welcome_page: true } }));
    fs.writeFileSync(path.join(dir, 'First Run'), '');
    const cdpPort = await free();
    const start = spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'open', editor, '--port', String(hp), '--no-browser'], { encoding: 'utf8', windowsHide: true, env: process.env });
    check('B: a test host of this worktree is up on its own port', await until(async () => !!(await hostUp()), 20000, 300), `${start.stdout} ${start.stderr}`);
    const child = spawn(chrome, [`--user-data-dir=${dir}`, `--remote-debugging-port=${cdpPort}`, '--window-position=-1900,20', '--window-size=1300,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: false, env: process.env });
    let b2;
    try {
      for (let i = 0; i < 60 && !b2; i += 1) { try { b2 = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`); } catch { await sleep(300); } }
      check('B: real Chrome started and attached', !!b2);
      if (b2) {
        const c = b2.contexts()[0];
        const p = c.pages()[0] || await c.newPage();
        await p.addInitScript((pp) => { window.__bwProbePorts = pp; }, probePorts);
        await p.goto(`${origin}/`);
        check('B: the served page is online with the port', await until(async () => (await state(p)) === 'online', 20000) && (await ui(p))?.word.includes(`:${hp}`), JSON.stringify(await ui(p)));
        await press(p);
        check('B: switch off -> Offline, the host really stopped', await until(async () => (await state(p)) === 'offline', 30000, 250) && await until(async () => !(await hostUp()), 8000, 300), `state=${await state(p)}`);
        await sleep(1500);
        check('B: still the http page, still Offline', p.url().startsWith(origin) && (await state(p)) === 'offline', `${p.url()} ${await state(p)}`);
        await p.screenshot({ path: path.join(shots, 'B-1-offline.png') });
        await press(p);
        check('B: press shows «Starting…»', await until(async () => (await state(p)) === 'starting', 4000));
        const up = await until(async () => (await state(p)) === 'online', 45000, 250);
        check('B: switch on -> Connected (the real protocol started the host)', up, `state=${await state(p)} ${p.url()}`);
        const h = await hostUp();
        const u = await ui(p);
        check(`B: word «متصل :${hp}» / «Connected :${hp}», aria-checked, green dot`, !!h && !!u && u.st === 'online' && u.checked === 'true' && u.word.includes(`:${h.port}`) && isGreen(u.dot), JSON.stringify(u));
        check('B: the page is on the port that answers', p.url().startsWith(`http://127.0.0.1:${h?.port}/`), p.url());
        await p.screenshot({ path: path.join(shots, 'B-2-connected.png') });
        check('B: Chrome still runs', child.exitCode === null && b2.isConnected());
      }
    } finally {
      try { await b2?.close(); } catch { /* gone */ }
      killTree(child.pid);
      await sleep(500);
      if (await hostUp()) cliStop();
      await until(async () => !(await hostUp()), 8000, 300);
    }
  }
} finally {
  if (!process.env.BW_START_KEEP) spawnSync('python', [path.join(os.homedir(), '.claude', 'skills', 'nj-safe-delete', 'scripts', 'trash.py'), tmp], { stdio: 'ignore', windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
}
S.finish();
