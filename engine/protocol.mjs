// The business-wrap: URL protocol (0.13.3): the one route by which a file:// page, which cannot start a process, asks the
// installed Business-Wrap to open itself or to stop. Registered PER USER only, no admin:
//   Windows  HKCU\Software\Classes\business-wrap  (reg.exe, an args array: no shell string)
//   Linux    ~/.local/share/applications/business-wrap-handler.desktop + `xdg-mime default … x-scheme-handler/business-wrap`
// The handler command line is:  node <install>/update/cli.mjs handle "<url>".  Accepted URLs ONLY:
//   business-wrap://open?file=<absolute path of a .html inside an allowed place>   (exists, carries the bw-data marker)
//   business-wrap://stop
// Anything else is refused (exit 2). Nothing from the URL reaches a shell: the file is opened through cli.mjs open()
// (spawn with an args array). Allowed places for the file: the user's home, the temp folder, this install, the save
// folder, the drive of this install (or `/`), and BW_ALLOWED_ROOTS (a path-delimited list). UNC paths are refused.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { REPO } from './export.mjs';

export const SCHEME = 'business-wrap';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const INSTALL = path.resolve(HERE, '..');
export const HANDLER = path.join(INSTALL, 'update', 'cli.mjs');
const WIN_HIVE = 'HKCU\\Software\\Classes';
export const DESKTOP_NAME = 'business-wrap-handler.desktop';

/* ── the URL ── */
/** Parse a business-wrap: URL strictly. Returns {action:'open', file} or {action:'stop'}; throws code 2 on anything else. */
export function parseUrl(raw) {
  const refuse = (m) => Object.assign(new Error(`refused: ${m}`), { code: 2 });
  const s = String(raw ?? '').trim();
  if (!s || s.length > 4096 || /[\u0000-\u001f\u007f]/.test(s)) throw refuse('empty, too long, or control characters');
  let u;
  try { u = new URL(s); } catch { throw refuse('not a URL'); }
  if (u.protocol !== `${SCHEME}:`) throw refuse('not a business-wrap: URL');
  if (u.username || u.password || u.port || u.hash) throw refuse('credentials, port or fragment');
  if (u.pathname !== '' && u.pathname !== '/') throw refuse('unexpected path');
  const keys = [...u.searchParams.keys()];
  if (u.hostname === 'stop') {
    if (keys.length) throw refuse('stop takes no arguments');
    return { action: 'stop' };
  }
  if (u.hostname === 'open') {
    if (keys.length !== 1 || keys[0] !== 'file' || u.searchParams.getAll('file').length !== 1) throw refuse('open takes exactly one file');
    return { action: 'open', file: u.searchParams.get('file') };
  }
  throw refuse('unknown action');
}

const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const inside = (root, f) => { const r = path.relative(norm(root), norm(f)); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
export function allowedRoots() {
  const roots = [os.homedir(), os.tmpdir(), INSTALL, REPO, path.parse(INSTALL).root, ...String(process.env.BW_ALLOWED_ROOTS || '').split(path.delimiter)];
  try { roots.push(process.env.BW_WORKSPACE || '', process.env.BW_LOCAL_DIR || ''); } catch { /* none */ }
  return [...new Set(roots.filter(Boolean).map((r) => { try { return fs.realpathSync.native(path.resolve(r)); } catch { return path.resolve(r); } }))];
}
const MARKER = /<script type="application\/json" id="bw-data">/;
/** The editor file a URL may open: an absolute .html path in an allowed place, that exists and carries the bw-data block. */
export function validateFile(file) {
  const refuse = (m) => Object.assign(new Error(`refused: ${m}`), { code: 2 });
  const f = String(file ?? '');
  if (!f || f.length > 1024) throw refuse('no file');
  if (/[\u0000-\u001f\u007f"`<>|*?]/.test(f)) throw refuse('the path has quotes or characters a path cannot carry');
  if (/^(\\\\|\/\/)/.test(f)) throw refuse('a network (UNC) path');
  if (!path.isAbsolute(f)) throw refuse('the path is not absolute');
  if (!/\.html$/i.test(f)) throw refuse('not a .html file');
  let real;
  try { real = fs.realpathSync.native(f); } catch { throw refuse('the file does not exist'); }
  if (!fs.statSync(real).isFile()) throw refuse('not a file');
  if (!allowedRoots().some((r) => inside(r, real))) throw refuse('outside the places Business-Wrap may open from');
  if (!MARKER.test(fs.readFileSync(real, 'utf8'))) throw refuse('not a Business-Wrap editor (no bw-data block)');
  return real;
}

/* ── registration ── */
const q = (s) => `"${s}"`;
/** The handler command line (the "%1" / %u slot is the URL). */
export function handlerCommand({ node = process.execPath, cli = HANDLER, win = process.platform === 'win32' } = {}) {
  return `${q(node)} ${q(cli)} handle ${win ? '"%1"' : '%u'}`;
}
const reg = (args) => spawnSync('reg.exe', args, { encoding: 'utf8', windowsHide: true });
const desktopDir = () => path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'applications');
const desktopFile = (dir) => path.join(dir || desktopDir(), DESKTOP_NAME);
const desktopText = (cmd) => `[Desktop Entry]\nType=Application\nName=Business-Wrap\nComment=Opens and stops Business-Wrap from the editor's Settings\nExec=${cmd}\nNoDisplay=true\nTerminal=false\nMimeType=x-scheme-handler/${SCHEME};\n`;
/** `hive`: Windows registry key that holds the class (tests pass a temp key); `dir`: Linux applications folder (tests). */
export function register({ hive = WIN_HIVE, dir, platform = process.platform, node, cli, mime = true } = {}) {
  const cmd = handlerCommand({ node, cli, win: platform === 'win32' });
  if (platform === 'win32') {
    const key = `${hive}\\${SCHEME}`;
    for (const a of [['add', key, '/ve', '/d', 'URL:Business-Wrap', '/f'], ['add', key, '/v', 'URL Protocol', '/d', '', '/f'], ['add', `${key}\\shell\\open\\command`, '/ve', '/d', cmd, '/f']]) {
      const r = reg(a);
      if (r.status !== 0) throw new Error(`reg ${a[0]} failed: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`);
    }
    return { registered: true, platform, command: cmd, where: key };
  }
  if (platform === 'linux') {
    const f = desktopFile(dir);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, desktopText(cmd));
    if (mime) spawnSync('xdg-mime', ['default', DESKTOP_NAME, `x-scheme-handler/${SCHEME}`], { stdio: 'ignore' });
    return { registered: true, platform, command: cmd, where: f };
  }
  return { registered: false, platform, reason: 'unsupported platform: start Business-Wrap from the command line' };
}
export function status({ hive = WIN_HIVE, dir, platform = process.platform, node, cli } = {}) {
  const want = handlerCommand({ node, cli, win: platform === 'win32' });
  if (platform === 'win32') {
    const key = `${hive}\\${SCHEME}\\shell\\open\\command`;
    const r = reg(['query', key, '/ve']);
    if (r.status !== 0) return { registered: false, current: false, platform, command: null, want };
    const cmd = (/REG_SZ\s+(.*)\s*$/m.exec(r.stdout || '')?.[1] || '').trim();
    return { registered: true, current: cmd === want, platform, command: cmd, want };
  }
  if (platform === 'linux') {
    const f = desktopFile(dir);
    if (!fs.existsSync(f)) return { registered: false, current: false, platform, command: null, want };
    const cmd = (/^Exec=(.*)$/m.exec(fs.readFileSync(f, 'utf8'))?.[1] || '').trim();
    return { registered: true, current: cmd === want, platform, command: cmd, want };
  }
  return { registered: false, current: false, platform, command: null, want };
}
export function unregister({ hive = WIN_HIVE, dir, platform = process.platform } = {}) {
  if (platform === 'win32') {
    const r = reg(['delete', `${hive}\\${SCHEME}`, '/f']);
    return { registered: false, removed: r.status === 0, platform };
  }
  if (platform === 'linux') {
    const f = desktopFile(dir);
    const had = fs.existsSync(f);
    if (had) fs.rmSync(f, { force: true });
    return { registered: false, removed: had, platform };
  }
  return { registered: false, removed: false, platform };
}
/** Register when missing or pointing at another install's handler (idempotent, no admin). Never throws. BW_NO_PROTOCOL=1 skips. */
export function ensureRegistered(o = {}) {
  if (process.env.BW_NO_PROTOCOL === '1') return { skipped: true };
  try {
    const s = status(o);
    if (s.registered && s.current) return { ...s, already: true };
    return register(o);
  } catch (e) { return { registered: false, error: String(e.message || e).slice(0, 200) }; }
}

/* ── servers: who answers, how many windows, the flush before a stop ── */
export const defaultPorts = () => (process.env.BW_PROBE_PORTS ? process.env.BW_PROBE_PORTS.split(',').map(Number).filter(Boolean) : Array.from({ length: 11 }, (_, i) => 4317 + i));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** The Business-Wrap servers answering on the probe ports (any install: it is a count of what a person would see). */
export async function probeServers(ports = defaultPorts()) {
  const out = await Promise.all(ports.map(async (port) => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(800), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      return j && j.name === 'Business-Wrap' ? { port, version: j.version } : null;
    } catch { return null; }
  }));
  return out.filter(Boolean);
}
/** Browsers the hosts of this install launched and that still run. */
export async function countBrowsers() {
  const { alive } = await import('./host.mjs');
  const pids = new Set();
  try { const { hostState } = await import('./host.mjs'); for (const p of hostState()?.browserPids || []) pids.add(p); } catch { /* none */ }
  try {
    const { STATE_DIR } = await import('./heal/index.mjs');
    const f = path.join(STATE_DIR(), 'cli-hosts.json');
    if (fs.existsSync(f)) for (const h of JSON.parse(fs.readFileSync(f, 'utf8')).hosts || []) if (h.browserPid) pids.add(h.browserPid);
  } catch { /* none */ }
  return [...pids].filter(alive).length;
}
/** Ask every other Business-Wrap server to flush its tabs (they save their state), then give them the grace to do it. */
export async function flushPeers({ selfPort = null, ports = defaultPorts(), graceMs = 0 } = {}) {
  const peers = (await probeServers(ports)).filter((s) => s.port !== selfPort);
  await Promise.all(peers.map(async (s) => {
    try { await fetch(`http://127.0.0.1:${s.port}/api/servers/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, flushOnly: true }), signal: AbortSignal.timeout(2000) }); } catch { /* gone already */ }
  }));
  if (peers.length && graceMs) await sleep(graceMs);
  return peers;
}

/* ── the handler ── */
/** What the registered command runs: parse, validate, act. Returns a plain object; throws code 2 on a refused URL. */
export async function handle(url, { grace = Number(process.env.BW_POWER_GRACE_MS || 1500) } = {}) {
  const a = parseUrl(url);
  const cli = await import('./cli.mjs');
  if (a.action === 'stop') {
    const peers = await flushPeers({ graceMs: grace });
    const r = await cli.close();
    return { action: 'stop', flushed: peers.length, ...r };
  }
  const file = validateFile(a.file);
  const r = await cli.open({ inputs: [file], browser: true, port: Number(process.env.BW_OPEN_PORT) || 4317 }); // BW_OPEN_PORT: tests only
  return { action: 'open', file, url: r.url, port: r.port };
}
