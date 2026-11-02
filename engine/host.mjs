// The background local host (A10, 0.13.0): the editor's server runs detached, the last tab closed stops it
// (engine/routes/session.mjs: every tab flushed first, then exit 0, nothing left), and a relaunch offers to resume.
//
//   start({editor, port, open}) → {pid, port, url}     spawns engine/serve.mjs detached, waits for /api/version
//   stop()                      → {stopped, pids}      asks the server to flush and exit, then kills what is left
//   status()                    → {running, pid, port, tabs}
//   launchBrowser(urls)         → {chunks, pids, browser}  the chosen browser (Google Chrome first, engine/export.mjs chooseBrowser) with its own --user-data-dir, 30 URLs per command line
//   closeBrowsers()             → pids                 only browsers on this host's own profile folder: never anyone else's
//
// State: .local/host.json {pid, port, startedAt, token, editor, browserPids[], tabs}. BW_BROWSER_STUB=<file> writes
// each launch's argv as one JSON line instead of starting a browser (tests).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDir, workspace, ensure } from './workspace.mjs';
import { chooseBrowser, featureNames, noBrowserMessage } from './export.mjs';

const SERVE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'serve.mjs');
export const hostFile = () => path.join(localDir(), 'host.json');
/** The browser profile folder. `edge-profile` is the name 0.15.8 and older gave it (Edge was the only browser): it stays, so reset, doctor and an owner's existing Edge data still find it.
 *  Edge uses it directly; every other browser gets its own sub-folder (`edge-profile/chrome`, ...), never another vendor's profile: two vendors on one profile folder hand each other's
 *  command line over (Chrome would open the URL in the running Edge) and a newer profile refuses to open in an older build. */
export const profileDir = (id) => (id && id !== 'edge' ? path.join(localDir(), 'edge-profile', id) : path.join(localDir(), 'edge-profile'));
const PROFILE_ROOT = () => path.join(localDir(), 'edge-profile');
const read = () => { try { return JSON.parse(fs.readFileSync(hostFile(), 'utf8')); } catch { return null; } };
/** host.json as written by start() (null when there is none). */
export const hostState = read;
const write = (h) => { fs.mkdirSync(localDir(), { recursive: true }); fs.writeFileSync(hostFile(), JSON.stringify(h, null, 1)); };
export const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** The server's own update of host.json (tab count, browsers it launched); a no-op when no host file is ours. */
export function noteHost(patch) {
  const h = read();
  if (!h || h.token !== process.env.BW_HOST_TOKEN) return;
  write({ ...h, ...patch, browserPids: [...new Set([...(h.browserPids || []), ...(patch.browserPids || [])])] });
}

export function status() {
  const h = read();
  if (!h) return { running: false, pid: null, port: null, tabs: 0 };
  const running = alive(h.pid);
  return { running, pid: h.pid, port: h.port, tabs: running ? h.tabs || 0 : 0, url: `http://127.0.0.1:${h.port}/` };
}

const free = (port) => new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
async function freePort(from) { for (let p = from; p < from + 50; p++) if (await free(p)) return p; throw new Error(`no free port from ${from}`); }

/** GET /api/host/health of the running host (engine/routes/health.mjs), or null when none answers. */
export async function health(timeoutMs = 2500) {
  const st = status();
  if (!st.running) return null;
  try { const r = await fetch(`${st.url}api/host/health`, { signal: AbortSignal.timeout(timeoutMs) }); return r.ok ? await r.json() : null; } catch { return null; }
}

/** 0.15.3 T4: one host per state folder. `start` calls queue in this process and take an atomic lock file (host.lock, created with the
 *  `wx` flag) across processes, so two `open`s in the same second can never spawn two servers: the second waits, then reuses the first's host. */
export const lockFile = () => path.join(localDir(), 'host.lock');
let chain = Promise.resolve();
async function acquire(ms = 40000) {
  fs.mkdirSync(localDir(), { recursive: true });
  for (const t0 = Date.now(); ;) {
    try { const fd = fs.openSync(lockFile(), 'wx'); fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() })); fs.closeSync(fd); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let l = null, age = 0;
    try { l = JSON.parse(fs.readFileSync(lockFile(), 'utf8')); } catch { /* being written, or gone */ }
    try { age = Date.now() - fs.statSync(lockFile()).mtimeMs; } catch { continue; }
    if ((l ? !alive(l.pid) || Date.now() - l.at > 60000 : age > 5000)) { try { fs.rmSync(lockFile(), { force: true }); } catch { /* raced */ } continue; } // its owner is dead: stale
    if (Date.now() - t0 > ms) throw new Error('host.start: another start holds the host lock');
    await new Promise((r) => setTimeout(r, 120));
  }
}
const release = () => { try { const l = JSON.parse(fs.readFileSync(lockFile(), 'utf8')); if (l.pid === process.pid) fs.rmSync(lockFile(), { force: true }); } catch { /* none */ } };
/** The server really answers on that url (its own /api/version). */
const answers = async (url, ms = 1000) => { try { return (await fetch(`${url}api/version`, { signal: AbortSignal.timeout(ms) })).ok; } catch { return false; } };

export function start(opts = {}) {
  const run = chain.then(async () => { await acquire(); try { return await startLocked(opts); } finally { release(); } });
  chain = run.catch(() => {});
  return run;
}

async function startLocked({ editor, port = 4317, open = true } = {}) {
  let now = status();
  if (now.running) {
    // reuse only a host that is really listening (a recorded pid with nothing on its port is not one)
    let up = await answers(now.url);
    for (let i = 0; !up && i < 3; i++) { await new Promise((r) => setTimeout(r, 400)); up = await answers(now.url); }
    if (up) { const b = open ? launchBrowser([now.url]) : null; return { pid: now.pid, port: now.port, url: now.url, browserPid: b?.pids[0] ?? null, browser: b?.browser ?? null, reused: true }; }
    const h0 = read(); try { await fetch(`${now.url}api/host/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: h0?.token }), signal: AbortSignal.timeout(1500) }); } catch { /* not listening: nothing to ask */ } // the recorded host answers nothing: asked to go (by its token, never killed by pid), then replaced
  }
  if (fs.existsSync(hostFile())) fs.rmSync(hostFile(), { force: true }); // stale: its server is gone
  if (!editor || !fs.existsSync(editor)) throw new Error(`host.start: editor file not found: ${editor}`);
  const p = await freePort(port);
  const token = crypto.randomBytes(16).toString('hex');
  const log = fs.openSync(path.join(ensure(workspace()).dirs.history, 'host.log'), 'a'); // no console window: its output goes here
  const child = spawn(process.execPath, [SERVE, path.resolve(editor), '--port', String(p)], { detached: true, stdio: ['ignore', log, log], windowsHide: true, env: { ...process.env, BW_HOST_TOKEN: token } });
  fs.closeSync(log);
  child.unref();
  write({ pid: child.pid, port: p, startedAt: new Date().toISOString(), token, editor: path.resolve(editor), browserPids: [], tabs: 0 });
  const url = `http://127.0.0.1:${p}/`;
  const t0 = Date.now();
  for (;;) { // the server's own answer is the trigger; 20 s is only the ceiling
    try { if ((await fetch(url + 'api/version', { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* not up yet */ }
    if (!alive(child.pid) || Date.now() - t0 > 20000) { await stop(); throw new Error('host.start: the server did not come up'); }
    await new Promise((r) => setTimeout(r, 150));
  }
  // The recorded pid is the supervisor this start spawned (engine/serve.mjs forks the listening server); host.json also names the LISTENER, which answers with
  // its pid and a key derived from OUR token. A server on this port that does not carry our key (another checkout's host that took the port) is NEVER
  // adopted, stopped or killed: this start refuses, removing only its own spawn and its own host.json.
  const pid = child.pid;
  let hp = null;
  try { hp = await (await fetch(url + 'api/host/health', { signal: AbortSignal.timeout(2000) })).json(); } catch { /* an older server without the route */ }
  if (hp && hp.hostKey !== crypto.createHash('sha256').update(token).digest('hex').slice(0, 16)) {
    killTree(child.pid); // our own spawn only
    fs.rmSync(hostFile(), { force: true });
    throw new Error(`host.start: port ${p} is answered by another server (pid ${hp.pid}), not by the one this start spawned: it was left alone`);
  }
  if (hp?.pid) write({ ...read(), listener: hp.pid });
  const b = open ? launchBrowser([url]) : null;
  return { pid, port: p, url, browserPid: b?.pids[0] ?? null, browser: b?.browser ?? null }; // the caller can say whether a browser opened, and which
}

function killTree(pid) {
  if (!alive(pid)) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } } }
}

export async function stop() {
  const h = read();
  if (!h) return { stopped: false, pids: [] };
  const pids = [];
  if (alive(h.pid)) {
    try { await fetch(`http://127.0.0.1:${h.port}/api/host/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: h.token }), signal: AbortSignal.timeout(3000) }); } catch { /* answered or gone */ }
    for (const t0 = Date.now(); alive(h.pid) && Date.now() - t0 < 4000;) await new Promise((r) => setTimeout(r, 100));
    if (alive(h.pid)) killTree(h.pid);
    pids.push(h.pid);
  }
  pids.push(...closeBrowsers(h.browserPids));
  fs.rmSync(hostFile(), { force: true });
  return { stopped: !alive(h.pid), pids };
}

/** The executable of the browser the editor opens in (null when none): the browser-neutral successor of 0.15.8's edgePath(). */
export const browserPath = () => chooseBrowser()?.exe ?? null;

/** 0.15.3 T2, 0.15.9 A1: the editor's browser must not put its tabs to sleep or throttle them: a frozen or throttled tab stops answering the host (TAB_STALE, TAB_ASLEEP).
 *  The three throttling switches are Chromium's own; after --disable-features come Chromium's freezing / discarding / occlusion features and each vendor's own sleep or snooze feature
 *  (Chrome, Edge, Opera, Opera GX, Brave, Vivaldi). A name a build does not know is ignored, never an error. Flags only reach a browser THIS host starts: a tab opened in a
 *  browser the user already runs ignores them, which is why the page keeps itself awake too (editor/ext/12-session.js, editor/session-worker.js). */
export const keepAwakeArgs = () => [
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  `--disable-features=${featureNames().join(',')}`  // every vendor's names go to every browser: an unknown name is ignored,
];
export const KEEP_AWAKE_ARGS = keepAwakeArgs();

/** Open one URL with the OS opener (a default browser that is not Chromium: Firefox, Safari). The host cannot close that window. */
function osOpen(url) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const p = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {});
  p.unref();
}

/** All URLs on as few command lines as the Windows 32 767-character limit allows: 30 per launch. A page cannot open 100 tabs (one popup per gesture); the server can.
 *  Returns {chunks, pids, browser:{id, name, via, closable, note?}}. BW_BROWSER_STUB=<file> logs each launch (args, exe, browser id) instead of starting anything (tests). */
export function launchBrowser(urls, { chunk = 30 } = {}) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += chunk) chunks.push(urls.slice(i, i + chunk));
  const pids = [];
  const br = chooseBrowser();
  if (!br && !process.env.BW_BROWSER_STUB) throw new Error(`${noBrowserMessage('en')}\n${noBrowserMessage('ar')}`);
  const id = br?.id || 'chrome';
  const closable = !br || br.chromium;
  const info = { id, name: br?.name || 'Google Chrome', via: br?.via || 'stub', closable, ...(closable ? {} : { note: `${br.name} is not Chromium: it was opened with the system opener, and Business-Wrap cannot close its window. Close it yourself, or choose a Chromium browser in Settings.` }) };
  for (const c of chunks) {
    if (!closable) {
      if (process.env.BW_BROWSER_STUB) { fs.appendFileSync(process.env.BW_BROWSER_STUB, JSON.stringify({ opener: true, urls: c, exe: br.exe, browser: id }) + '\n'); continue; }
      for (const u of c) osOpen(u);
      continue;
    }
    // 0.16.0: no "restore pages" bubble after a crash or a killed window, so a relaunch never brings 18 old pages back; a tab an agent opens (BW_AGENT_OPEN, set by the MCP server) is an automation tab: no blocking dialog
    const urls = process.env.BW_AGENT_OPEN === '1' ? c.map((u) => (/[?&]automation=/.test(u) ? u : `${u}${u.includes('?') ? '&' : '?'}automation=1`)) : c;
    const args = [`--user-data-dir=${profileDir(id)}`, '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', ...keepAwakeArgs(), '--new-window', ...urls];
    if (process.env.BW_BROWSER_STUB) { fs.appendFileSync(process.env.BW_BROWSER_STUB, JSON.stringify({ args, exe: br?.exe ?? null, browser: id }) + '\n'); continue; }
    const p = spawn(br.exe, args, { detached: true, stdio: 'ignore' });
    p.on('error', () => {});
    p.unref();
    pids.push(p.pid);
  }
  noteHost({ browserPids: pids, browser: id });
  return { chunks: chunks.length, pids, browser: info };
}

/** The file manager with `file` selected (H3). Windows: Explorer parses its own command line and does not accept a
 *  quoted «"/select,<path>"», which is what Node writes for a path with spaces: it fell back to Documents. So the line
 *  is passed verbatim as /select,"<path>". BW_REVEAL_STUB=<file> writes the command as one JSON line instead (tests). */
export function reveal(file) {
  const p = path.resolve(file);
  const [cmd, args, verbatim] = process.platform === 'win32' ? ['explorer.exe', [`/select,"${p}"`], true] : process.platform === 'darwin' ? ['open', ['-R', p], false] : ['xdg-open', [path.dirname(p)], false];
  if (process.env.BW_REVEAL_STUB) { fs.appendFileSync(process.env.BW_REVEAL_STUB, JSON.stringify({ cmd, args, verbatim }) + '\n'); return { cmd, args }; }
  spawn(cmd, args, { detached: true, stdio: 'ignore', windowsVerbatimArguments: verbatim }).unref();
  return { cmd, args };
}

/** Browsers on this host's own profile folder (their command line names it), plus pids it launched: closed, tree and all. Any Chromium browser, whichever was used. */
export function closeBrowsers(known = [], { scan = true } = {}) {
  const found = [];
  if (scan && process.platform === 'win32' && fs.existsSync(PROFILE_ROOT())) {
    const prof = PROFILE_ROOT().replace(/'/g, "''");
    const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='opera.exe' OR Name='brave.exe' OR Name='vivaldi.exe' OR Name='chromium.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${prof}') } | ForEach-Object { $_.ProcessId }`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    found.push(...String(r.stdout || '').split(/\s+/).filter(Boolean).map(Number));
  }
  const all = [...new Set([...known, ...found])].filter(alive);
  all.forEach(killTree);
  return all;
}
