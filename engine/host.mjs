// The background local host (A10, 0.13.0): the editor's server runs detached, the last tab closed stops it
// (engine/routes/session.mjs: every tab flushed first, then exit 0, nothing left), and a relaunch offers to resume.
//
//   start({editor, port, open}) → {pid, port, url}     spawns engine/serve.mjs detached, waits for /api/version
//   stop()                      → {stopped, pids}      asks the server to flush and exit, then kills what is left
//   status()                    → {running, pid, port, tabs}
//   launchBrowser(urls)         → {chunks, pids}       Edge with its own --user-data-dir, 30 URLs per command line
//   closeBrowsers()             → pids                 only browsers on that profile: never anyone else's
//
// State: .local/host.json {pid, port, startedAt, token, editor, browserPids[], tabs}. BW_BROWSER_STUB=<file> writes
// each launch's argv as one JSON line instead of starting a browser (tests).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localDir } from './workspace.mjs';

const SERVE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'serve.mjs');
export const hostFile = () => path.join(localDir(), 'host.json');
export const profileDir = () => path.join(localDir(), 'edge-profile');
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

export async function start({ editor, port = 4317, open = true } = {}) {
  const now = status();
  if (now.running) { const b = open ? launchBrowser([now.url]) : null; return { pid: now.pid, port: now.port, url: now.url, browserPid: b?.pids[0] ?? null }; }
  if (fs.existsSync(hostFile())) fs.rmSync(hostFile(), { force: true }); // stale: its server is gone
  if (!editor || !fs.existsSync(editor)) throw new Error(`host.start: editor file not found: ${editor}`);
  const p = await freePort(port);
  const token = crypto.randomBytes(16).toString('hex');
  const child = spawn(process.execPath, [SERVE, path.resolve(editor), '--port', String(p)], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, BW_HOST_TOKEN: token } });
  child.unref();
  write({ pid: child.pid, port: p, startedAt: new Date().toISOString(), token, editor: path.resolve(editor), browserPids: [], tabs: 0 });
  const url = `http://127.0.0.1:${p}/`;
  const t0 = Date.now();
  for (;;) { // the server's own answer is the trigger; 20 s is only the ceiling
    try { if ((await fetch(url + 'api/version', { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* not up yet */ }
    if (!alive(child.pid) || Date.now() - t0 > 20000) { await stop(); throw new Error('host.start: the server did not come up'); }
    await new Promise((r) => setTimeout(r, 150));
  }
  const b = open ? launchBrowser([url]) : null;
  return { pid: child.pid, port: p, url, browserPid: b?.pids[0] ?? null }; // the caller can say whether Edge opened
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

export function edgePath() {
  if (process.env.BW_EDGE) return process.env.BW_EDGE;
  const c = process.platform === 'win32'
    ? [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'))
    : process.platform === 'darwin' ? ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'] : ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
  return c.find((f) => fs.existsSync(f)) || null;
}

/** All URLs on as few command lines as the Windows 32 767-character limit allows: 30 per launch. A page cannot open 100 tabs (one popup per gesture); the server can. */
export function launchBrowser(urls, { chunk = 30 } = {}) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += chunk) chunks.push(urls.slice(i, i + chunk));
  const pids = [];
  for (const c of chunks) {
    const args = [`--user-data-dir=${profileDir()}`, '--no-first-run', '--no-default-browser-check', '--new-window', ...c];
    if (process.env.BW_BROWSER_STUB) { fs.appendFileSync(process.env.BW_BROWSER_STUB, JSON.stringify({ args }) + '\n'); continue; }
    const exe = edgePath();
    if (!exe) throw new Error('Microsoft Edge not found (BW_EDGE names it)');
    const p = spawn(exe, args, { detached: true, stdio: 'ignore' });
    p.unref();
    pids.push(p.pid);
  }
  noteHost({ browserPids: pids });
  return { chunks: chunks.length, pids };
}

/** Browsers on this host's own profile (their command line names it), plus pids it launched: closed, tree and all. */
export function closeBrowsers(known = [], { scan = true } = {}) {
  const found = [];
  if (scan && process.platform === 'win32' && fs.existsSync(profileDir())) {
    const prof = profileDir().replace(/'/g, "''");
    const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${prof}') } | ForEach-Object { $_.ProcessId }`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    found.push(...String(r.stdout || '').split(/\s+/).filter(Boolean).map(Number));
  }
  const all = [...new Set([...known, ...found])].filter(alive);
  all.forEach(killTree);
  return all;
}
