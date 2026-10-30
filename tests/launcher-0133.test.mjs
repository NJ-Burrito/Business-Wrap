// 0.13.3 Settings › start / stop servers: the two buttons, the business-wrap: URL protocol and its handler.
//
//   node tests/launcher-0133.test.mjs
// Own state folders and free ports (BW_LOCAL_DIR, BW_STATE_DIR, BW_WORKSPACE, BW_PROBE_PORTS): never the user's host on 4317.
// The real HKCU\Software\Classes\business-wrap is never touched: registration runs in a temp HKCU subkey (Windows) or a
// temp applications folder (Linux). Every process started here is stopped here; an unrelated node process must survive.
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
import * as P from '../engine/protocol.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  launcher: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-launcher-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await fn()) return true; return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };

const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, 'local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_POWER_GRACE_MS: '300', BW_NO_BROWSER: '1', BW_NO_PROTOCOL: '1' };
Object.assign(process.env, { BW_LOCAL_DIR: env.BW_LOCAL_DIR, BW_STATE_DIR: env.BW_STATE_DIR, BW_WORKSPACE: env.BW_WORKSPACE, BW_NO_PROTOCOL: '1' });
const CLI = path.join(REPO, 'update', 'cli.mjs');
const editor = path.join(tmp, 'my docs', 'sample.editor.html'); // a folder name with a space: the real world
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });

/** Run the real handler exactly as the registered command does: node update/cli.mjs handle "<url>". */
const handler = (url, extra = {}) => spawnSync(process.execPath, [CLI, 'handle', url, '--json'], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 90000, windowsHide: true });
const stray = []; // [{pid, port}] servers of this install started here
async function server(port, file = editor) {
  const c = spawn(process.execPath, [path.join(REPO, 'engine', 'serve.mjs'), file, '--port', String(port)], { env: { ...env, BW_SERVE_CHILD: '1' }, detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  await until(() => up(port));
  const s = { pid: c.pid, port };
  stray.push(s);
  return s;
}
/** An unrelated node process: no Business-Wrap path on its command line. It must survive every stop. */
function unrelated() {
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', 'unrelated-process-marker'], { detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  return c.pid;
}
const probeEnv = (ports) => { process.env.BW_PROBE_PORTS = ports.join(','); env.BW_PROBE_PORTS = ports.join(','); };
const hostPort = () => { try { return JSON.parse(fs.readFileSync(path.join(env.BW_LOCAL_DIR, 'host.json'), 'utf8')).port; } catch { return null; } };

const realKey = () => (process.platform === 'win32' ? spawnSync('reg.exe', ['query', 'HKCU\\Software\\Classes\\business-wrap', '/s'], { encoding: 'utf8' }).stdout || 'absent' : 'n/a');
const realBefore = realKey();
const browser = await chromium.launch(launchOptions());
const pids = [];
const shRoot = (page, fn, arg) => page.evaluate(([src, a]) => { const r = document.getElementById('bw-ui-host').shadowRoot; return new Function('r', 'a', `return (${src})(r, a)`)(r, a); }, [fn.toString(), arg]);
async function openPage(ctx, url, ports) {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript(({ ports: pp }) => {
    if (pp) window.__bwProbePorts = pp; // test hook of editor/settings.js
    window.__launched = [];
    document.addEventListener('click', (e) => { const a = e.target.closest?.('a[href^="business-wrap:"]'); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true); // a business-wrap: link is recorded, not followed
    window.__flushes = 0;
    const add = EventSource.prototype.addEventListener;
    EventSource.prototype.addEventListener = function (t, f, o) { return add.call(this, t, t === 'flush' ? (...a) => { window.__flushes++; return f(...a); } : f, o); };
  }, { ports });
  try { await (await ctx.newCDPSession(page)).send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch { /* not Chromium */ } // several pages at once: each behaves as focused
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(500);
  await page.evaluate(() => window.BW.runAction('settings'));
  await page.waitForFunction(() => window.BW.S.drawer === 'settings');
  await sleep(700);
  await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-s="new"]')?.click()); // a served tab of a host that has other tabs asks «resume?»: answer «start fresh», it is not what is tested here
  await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.set-srv-body .set-status'), null, { timeout: 15000 });
  return page;
}
const card = (page) => shRoot(page, (r) => { const b = r.querySelector('.set-srv-body'); return { status: b.querySelector('.set-status')?.textContent.trim(), start: !!b.querySelector('[data-k="srvStart"]'), stop: !!b.querySelector('[data-k="srvStop"]'), open: b.querySelector('[data-k="srvOpen"]')?.dataset.v || null, startLabel: b.querySelector('[data-k="srvStart"] .w')?.textContent, stopLabel: b.querySelector('[data-k="srvStop"] .w')?.textContent }; });
const press = (page, k) => shRoot(page, (r, key) => r.querySelector(`.set-srv-body [data-k="${key}"]`).click(), k);
const dlg = (page) => shRoot(page, (r) => { const d = r.querySelector('.dialog'); return { open: !d.hidden, text: d.textContent, focus: d.querySelector(':focus')?.dataset.k || r.activeElement?.dataset.k, hasFocus: document.hasFocus(), vis: document.visibilityState, ae: r.activeElement?.outerHTML?.slice(0, 160) }; });
const dlgBtn = (page, k) => shRoot(page, (r, key) => r.querySelector(`.dialog [data-k="${key}"]`).click(), k);
const fileUrl = pathToFileURL(editor).href;
let other = 0;

try {
  other = unrelated();
  pids.push(other);

  // ── protocol: strict URLs ──
  const refusals = [
    ['http://example.com/', 'a web URL'],
    ['business-wrap://other', 'an unknown action'],
    ['business-wrap://stop?now=1', 'stop with an argument'],
    ['business-wrap://open', 'open without a file'],
    [`business-wrap://open?file=${encodeURIComponent(editor)}&file=${encodeURIComponent(editor)}`, 'two files'],
    [`business-wrap://open?file=${encodeURIComponent(editor)}&run=calc`, 'an extra argument'],
    ['business-wrap://open?file=sample.editor.html', 'a relative path'],
    [`business-wrap://open?file=${encodeURIComponent(editor.replace(/\.html$/, '.txt'))}`, 'not a .html file'],
    [`business-wrap://open?file=${encodeURIComponent(path.join(tmp, 'nope.html'))}`, 'a file that does not exist'],
    [`business-wrap://open?file=${encodeURIComponent('C:\\a"b.html')}`, 'a path with a double quote'],
    [`business-wrap://open?file=${encodeURIComponent(editor + '" & calc & "')}`, 'a path carrying a command'],
    ['business-wrap://open?file=%5C%5Cevil%5Cshare%5Cx.html', 'a UNC path'],
    ['', 'an empty URL'],
  ];
  const plain = path.join(tmp, 'plain.html');
  fs.writeFileSync(plain, '<!doctype html><title>not a Business-Wrap file</title>');
  refusals.push([`business-wrap://open?file=${encodeURIComponent(plain)}`, 'an html file without the bw-data block']);
  let bad = [];
  for (const [u, why] of refusals) {
    let threw = null;
    try { P.parseUrl(u); if (u.includes('file=')) P.validateFile(new URL(u).searchParams.get('file')); } catch (e) { threw = e; }
    if (!(threw && threw.code === 2)) bad.push(why);
  }
  check(`refuse: ${refusals.length} bad URLs / paths are refused with code 2 (${bad.join(', ') || 'all'})`, !bad.length, bad.join(', '));
  const before = (await Promise.all(P.defaultPorts().map(up))).filter(Boolean).length;
  const r1 = handler('business-wrap://open?file=' + encodeURIComponent(plain));
  const r2 = handler('business-wrap://open?file=' + encodeURIComponent('C:\\a"b.html'));
  const r3 = handler('http://example.com/');
  check('refuse: the real handler exits 2 for a non-bw file, a quoted path and a foreign URL, and starts nothing', r1.status === 2 && r2.status === 2 && r3.status === 2 && (await Promise.all(P.defaultPorts().map(up))).filter(Boolean).length === before && !hostPort(), `${r1.status} ${r2.status} ${r3.status}`);
  check('accept: a valid open URL and stop parse', P.parseUrl(`business-wrap://open?file=${encodeURIComponent(editor)}`).action === 'open' && P.validateFile(editor) === fs.realpathSync.native(editor) && P.parseUrl('business-wrap://stop').action === 'stop' && P.parseUrl('business-wrap://stop/').action === 'stop');
  check('refuse: an apostrophe is a legal file name (spawn takes an args array, no shell)', (() => { const q = path.join(tmp, "Owner's docs.editor.html"); fs.copyFileSync(editor, q); try { return !!P.validateFile(q); } catch { return false; } })());

  // ── registration round trip ──
  const hive = `HKCU\\Software\\BWLauncherTest-${process.pid}`;
  const dir = path.join(tmp, 'applications');
  if (process.platform === 'win32') {
    const s0 = P.status({ hive });
    const r = P.register({ hive });
    const s1 = P.status({ hive });
    check('protocol: register → status (current) → unregister → status (gone), in a temp HKCU key', !s0.registered && r.registered && s1.registered && s1.current && !P.unregister({ hive }).registered && !P.status({ hive }).registered, JSON.stringify([s0, s1]));
    P.register({ hive });
    const key = `${hive}\\business-wrap`;
    const q = spawnSync('reg.exe', ['query', `${key}\\shell\\open\\command`, '/ve'], { encoding: 'utf8' }).stdout;
    const cmd = /REG_SZ\s+(.*)$/m.exec(q)?.[1].trim();
    // the stored command, run as Windows would run it (a shell parses it): the stop URL, through the real handler
    const run = spawnSync(cmd.replace('%1', 'business-wrap://stop'), { shell: true, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
    check('protocol: the stored command line survives a shell parse (spaces in the install path) and runs the handler', /^"[^"]+node(\.exe)?" "[^"]+cli\.mjs" handle "%1"$/.test(cmd) && run.status === 0 && /action\s+stop/.test(run.stdout), `${cmd} / ${run.status} ${run.stderr}`);
    const removed = P.unregister({ hive }).removed;
    spawnSync('reg.exe', ['delete', hive, '/f'], { windowsHide: true }); // the temp parent key too
    check('protocol: the temp key is gone and the real HKCU\\Software\\Classes\\business-wrap is exactly as it was', removed && spawnSync('reg.exe', ['query', hive], { encoding: 'utf8' }).status !== 0 && realKey() === realBefore, `${realBefore} / ${realKey()}`);
  } else {
    check('protocol: (Windows registry round trip is skipped on this platform)', true);
  }
  const lr = P.register({ platform: 'linux', dir, mime: false });
  const ls1 = P.status({ platform: 'linux', dir });
  const desk = fs.readFileSync(path.join(dir, P.DESKTOP_NAME), 'utf8');
  check('protocol: Linux .desktop register → status → unregister round trip (temp applications folder)', lr.registered && ls1.current && /MimeType=x-scheme-handler\/business-wrap;/.test(desk) && /^Exec=.* handle %u$/m.test(desk) && !P.unregister({ platform: 'linux', dir }).registered && !fs.existsSync(path.join(dir, P.DESKTOP_NAME)) && !P.status({ platform: 'linux', dir }).registered);
  check('protocol: ensureRegistered honours BW_NO_PROTOCOL (the tests never register)', P.ensureRegistered().skipped === true);

  // ── START (file:// page) ──
  // 1. no server: the card says so; pressing Start hands the right URL to the browser; the real handler brings a server up; the page then offers «Open from the server»
  const pOpen = await free();
  probeEnv([pOpen]);
  const ctx1 = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const f1 = await openPage(ctx1, fileUrl, [pOpen]);
  const c0 = await card(f1);
  check('start/no server: a file:// page says it has no server behind it, shows Start and Stop, no Open', /القرص|from disk/.test(c0.status) && c0.start && c0.stop && !c0.open, JSON.stringify(c0));
  await press(f1, 'srvStart');
  await until(async () => (await f1.evaluate(() => window.__launched.length)) > 0, 5000);
  const launched = await f1.evaluate(() => window.__launched);
  const want = `business-wrap://open?file=${encodeURIComponent(editor)}`;
  check('start/no server: Start hands business-wrap://open?file=<this file> to the browser', launched.length === 1 && launched[0] === want, JSON.stringify(launched));
  const h = handler(launched[0], { BW_OPEN_PORT: String(pOpen) });
  check('start/no server: the real handler opens that file and a server answers on the probe port', h.status === 0 && (await up(pOpen)), `${h.status} ${h.stderr} ${h.stdout}`.slice(0, 300));
  const seen = await until(async () => (await card(f1)).open === String(pOpen), 15000);
  const c1 = await card(f1);
  check('start/no server: the page notices and offers «Open from the server» for that port', seen && c1.status.includes(String(pOpen)), JSON.stringify(c1));
  check('start/no server: Arabic labels «تشغيل الخادم» and «إيقاف كل خوادم بزنس راب»', await (async () => { const l = await card(f1); return l.startLabel === 'تشغيل الخادم' || l.startLabel === 'Start server'; })());
  const hostBefore = hostPort();

  // 2. one server already running: pressing Start asks the ports first, finds it, launches nothing and offers «Open from the server»
  const c2 = await card(f1);
  check('start/one server: the page shows the running port and Open', c2.open === String(pOpen) && c2.status.includes(String(pOpen)), JSON.stringify(c2));
  await press(f1, 'srvStart');
  await sleep(2500);
  const afterOne = await f1.evaluate(() => window.__launched);
  check('start/one server: pressing Start again launches nothing (a server already answers)', afterOne.length === 1, JSON.stringify(afterOne));
  const h2 = handler(launched[0], { BW_OPEN_PORT: String(pOpen) });
  await sleep(500);
  check('start/one server: even the handler run again reuses the running host (same port, still one server)', h2.status === 0 && hostPort() === hostBefore && (await up(pOpen)) && !(await up(pOpen + 1)), `${h2.status} ${hostBefore} ${hostPort()}`);
  // the served page: no Start button, a status line with the port
  const sp = await openPage(ctx1, `http://127.0.0.1:${pOpen}/`);
  const cs = await card(sp);
  check('start/served: a served page hides Start, shows «server runs on port N» and keeps Stop', !cs.start && cs.stop && cs.status.includes(String(pOpen)), JSON.stringify(cs));
  await sp.close();
  await ctx1.close();
  spawnSync(process.execPath, [CLI, 'handle', 'business-wrap://stop'], { env, windowsHide: true, timeout: 60000 });
  check('start/cleanup: the host this test started is stopped', await until(async () => !(await up(pOpen)), 15000));

  // 3. two servers on two ports, two browsers (two contexts), each with a file:// page
  const [ap, bp] = [await free(), await free()];
  probeEnv([ap, bp]); // set before the servers start: they read the probe ports from their environment
  const A = await server(ap);
  const B = await server(bp);
  const ctxA = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const pa = await openPage(ctxA, fileUrl, [A.port, B.port]);
  const pb = await openPage(ctxB, fileUrl, [B.port, A.port]);
  await press(pa, 'srvStart');
  await press(pb, 'srvStart');
  const lowest = String(Math.min(A.port, B.port));
  const okA = await until(async () => (await card(pa)).open === lowest, 8000);
  const okB = await until(async () => (await card(pb)).open === lowest, 8000);
  check('start/two servers: pressing Start in two browsers finds the servers on both ports, launches nothing, and offers Open', okA && okB && !(await pa.evaluate(() => window.__launched.length)) && !(await pb.evaluate(() => window.__launched.length)), JSON.stringify([await card(pa), await card(pb)]));

  // ── STOP (served page) ──
  // the dialog lists counts; Cancel stops nothing
  const sb = await openPage(ctxB, `http://127.0.0.1:${B.port}/`, [A.port, B.port]);
  const sa = await openPage(ctxA, `http://127.0.0.1:${A.port}/`, [A.port, B.port]);
  await sa.waitForTimeout(500);
  await sa.bringToFront(); // two pages in one window: only the front one has focus
  await press(sa, 'srvStop');
  await sa.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await sleep(300);
  const d1 = await dlg(sa);
  check('stop/served: pressing it asks first, with the number of servers (2), Cancel has the focus', d1.open && /2/.test(d1.text) && d1.focus === 'srv-no', JSON.stringify({ ...d1, text: d1.text.slice(0, 12) }));
  await dlgBtn(sa, 'srv-no');
  await sleep(700);
  check('stop/served: Cancel stops nothing (both servers, the unrelated process)', (await up(A.port)) && (await up(B.port)) && alive(other) && (await sa.evaluate(() => document.documentElement.dataset.bwServers)) === 'cancelled');
  const badPost = await fetch(`http://127.0.0.1:${A.port}/api/servers/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const foreign = await fetch(`http://127.0.0.1:${A.port}/api/servers/stop`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.com' }, body: '{"confirm":true}' });
  check('stop/served: no confirm → 400, a foreign page → 403, nothing stops', badPost.status === 400 && foreign.status === 403 && (await up(A.port)) && (await up(B.port)));
  // two servers: Stop from the first page closes both; the second page's tabs were told to flush first
  await sa.bringToFront(); // two pages in one window: only the front one has focus
  await press(sa, 'srvStop');
  await sa.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await dlgBtn(sa, 'srv-yes');
  const shown = await until(() => shRoot(sa, (r) => !!r.querySelector('.pw-off')), 8000);
  check('stop/two servers: confirm → the «stopped» page on the pressed page', shown);
  const gone = await until(() => ![A.pid, B.pid].some(alive), 25000);
  check('stop/two servers: both servers (two ports) are gone, the unrelated node process is alive', gone && alive(other), JSON.stringify([A, B].map((s) => [s.pid, alive(s.pid)])));
  check('stop/two servers: the other server\'s open page was told to save first (a flush event arrived)', (await sb.evaluate(() => window.__flushes).catch(() => 0)) >= 1, 'flush count: ' + (await sb.evaluate(() => window.__flushes).catch(() => 'page gone')));
  check('stop/two servers: no page errors', !sa.errors.length && !pa.errors.length, [...sa.errors, ...pa.errors].join(' | '));
  await ctxA.close();
  await ctxB.close();

  // one server, a stray plus a recorded host: Stop from the page stops them all
  const [cp, hp] = [await free(), await free()];
  probeEnv([cp, hp]);
  const C = await server(cp);
  const oh = spawnSync(process.execPath, [CLI, 'open', editor, '--port', String(hp), '--no-browser', '--json'], { env, encoding: 'utf8', timeout: 90000, windowsHide: true });
  const ctxC = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const sc = await openPage(ctxC, `http://127.0.0.1:${C.port}/`, [C.port, hp]);
  await press(sc, 'srvStop');
  await sc.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await dlgBtn(sc, 'srv-yes');
  const gone3 = await until(async () => !alive(C.pid) && !(await up(C.port)) && !(await up(hp)), 25000);
  check('stop/stray + host: a stray server and the background host both stop; the unrelated process lives; host.json is removed', gone3 && alive(other) && !hostPort(), `${oh.status} ${hp}`);
  await ctxC.close();

  // ── STOP (file:// page) ──
  const [dp, ep] = [await free(), await free()];
  probeEnv([dp, ep]);
  const D = await server(dp);
  const E = await server(ep);
  const ctxD = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const fd = await openPage(ctxD, fileUrl, [D.port, E.port]);
  await press(fd, 'srvStop');
  await fd.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await sleep(300);
  const d2 = await dlg(fd);
  check('stop/file: asks first (2 servers), Cancel has the focus, nothing is launched yet', d2.open && /2/.test(d2.text) && d2.focus === 'srv-no' && (await fd.evaluate(() => window.__launched.length)) === 0, JSON.stringify({ ...d2, text: d2.text.slice(0, 12) }));
  await dlgBtn(fd, 'srv-no');
  await sleep(600);
  check('stop/file: Cancel launches nothing and stops nothing', (await fd.evaluate(() => window.__launched.length)) === 0 && (await up(D.port)) && (await up(E.port)));
  await press(fd, 'srvStop');
  await fd.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog').hidden);
  await dlgBtn(fd, 'srv-yes');
  await until(async () => (await fd.evaluate(() => window.__launched.length)) > 0, 5000);
  const stopUrl = (await fd.evaluate(() => window.__launched))[0];
  check('stop/file: confirm hands business-wrap://stop to the browser', stopUrl === 'business-wrap://stop', stopUrl);
  const hs = handler(stopUrl);
  check('stop/file: the real handler stops both servers; the unrelated node process lives', hs.status === 0 && (await until(async () => !alive(D.pid) && !alive(E.pid) && !(await up(D.port)) && !(await up(E.port)), 25000)) && alive(other), `${hs.status} ${hs.stderr}`);
  check('stop/file: the page notices — «every server stopped», no Open button', await until(async () => { const c = await card(fd); return !c.open && /تم إيقاف|stopped|لا يعمل|No server/.test(c.status); }, 15000));
  await ctxD.close();

  // the same stop through the handler when nothing runs: exit 0, nothing found
  const hz = handler('business-wrap://stop');
  check('stop/none: with nothing running the handler still exits 0 and reports nothing stopped', hz.status === 0 && /"stopped":0/.test(hz.stdout.replace(/\s/g, '')), hz.stdout + hz.stderr);
} catch (e) {
  check('launcher run', false, e.stack?.split('\n').slice(0, 5).join(' / '));
} finally {
  await browser.close();
  for (const s of stray) { try { process.kill(s.pid); } catch { /* gone */ } }
  spawnSync(process.execPath, [CLI, 'close'], { env, windowsHide: true, timeout: 60000 });
  for (const p of pids) { try { process.kill(p); } catch { /* gone */ } }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: launcher ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
