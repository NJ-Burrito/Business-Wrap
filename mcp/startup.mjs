// Startup helpers of the MCP server (0.15.0): the log that says why a connection failed, the update notice read
// from the cache with no network, and the facts `business-wrap doctor` prints. Imports nothing heavy, so the
// server can answer `initialize` before any of the pipeline modules are loaded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localBase, isPluginInstall, pluginData } from '../engine/testguard.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LOG = 200 * 1024;

/** The folder holding state that outlives a version: plugin data when run as a plugin, else <repo>/.local. */
export const stateDir = () => localBase(ROOT);
export const logFile = () => path.join(stateDir(), 'mcp.log');
/** Milliseconds since this process started (Node's own clock, so imports are counted). */
export const sinceStart = () => Math.round(process.uptime() * 1000);

/** One JSON line per event; the file is trimmed to its last half when it passes 200 KB. Never throws. */
export function logLine(event, extra = {}) {
  try {
    const f = logFile();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { if (fs.statSync(f).size > MAX_LOG) { const keep = fs.readFileSync(f, 'utf8').split('\n').slice(-400).join('\n'); fs.writeFileSync(f, keep); } } catch { /* no file yet */ }
    fs.appendFileSync(f, JSON.stringify({ ts: new Date().toISOString(), event, pid: process.pid, ...extra }) + '\n');
  } catch { /* a read-only state folder: no log, never a crash */ }
}

export const installedVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return null; } };

/** The facts one startup line carries: enough to tell a stale path from a crash. */
export function startupFacts(extra = {}) {
  return { version: installedVersion(), node: process.version, argv1: process.argv[1], cwd: process.cwd(), root: ROOT, plugin: isPluginInstall(ROOT), pluginData: pluginData(ROOT), local: stateDir(), ...extra };
}

/** The update notice from the cache only (no network): the shape checkForUpdate returns, or null. */
export async function cachedUpdate() {
  try {
    const { STATE_FILE, settings, currentVersion, splitNotes } = await import('../update/check.mjs');
    const { isNewer } = await import('../update/core.mjs');
    if (!settings().check) return { update: null, ageMs: null };
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const ageMs = state.checkedAt ? Date.now() - state.checkedAt : null;
    const cur = currentVersion();
    const l = state.latest;
    if (!l || state.forVersion !== cur || !isNewer(l.version, cur)) return { update: null, ageMs };
    const { human, migration } = splitNotes(l.notes);
    return { ageMs, update: { status: 'available', current: cur, latest: l.version, url: l.url, zip: l.zip, zipApi: l.zipApi, sha256: l.sha256, publishedAt: l.publishedAt, highlights: human.flatMap((s) => s.items).slice(0, 3), notes: { human, migration }, migration, checkedAt: state.checkedAt, cached: true } };
  } catch { return { update: null, ageMs: null }; }
}

/** The last `n` log lines (parsed), newest last. */
export function tailLog(n = 10) {
  try { return fs.readFileSync(logFile(), 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { raw: l }; } }); } catch { return []; }
}

const norm = (x) => path.resolve(String(x || '')).replace(/[\\/]+/g, '/').toLowerCase();
const readJ = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
/** 0.15.3 T10: is the MCP server registered with Claude Code, and for which folder? Read-only look at Claude Code's own files:
 *  <claude>/plugins/installed_plugins.json (a business-wrap@<marketplace> entry), <claude>/settings.json enabledPlugins, and the user-scope
 *  mcpServers of <home>/.claude.json. {registered, plugin, enabled, installPath, version, pathExists, matchesThisInstall, userServer, checked}. */
export function mcpRegistration({ claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), home = os.homedir(), root = ROOT } = {}) {
  const out = { registered: false, plugin: false, enabled: null, installPath: null, version: null, pathExists: null, matchesThisInstall: null, userServer: false, checked: [] };
  const ip = path.join(claudeDir, 'plugins', 'installed_plugins.json');
  const inst = readJ(ip);
  out.checked.push(ip);
  const key = Object.keys(inst?.plugins || {}).find((k) => /^business-wrap@/.test(k));
  const entry = key ? [].concat(inst.plugins[key]).filter(Boolean).at(-1) : null;
  if (entry) {
    out.plugin = true; out.installPath = entry.installPath || null; out.version = entry.version || null;
    out.pathExists = entry.installPath ? fs.existsSync(path.join(entry.installPath, 'mcp', 'cli.mjs')) : false;
    out.matchesThisInstall = entry.installPath ? norm(entry.installPath) === norm(root) : null;
  }
  const st = path.join(claudeDir, 'settings.json');
  const en = readJ(st)?.enabledPlugins;
  out.checked.push(st);
  const ek = Object.keys(en || {}).find((k) => /^business-wrap@/.test(k));
  if (ek) out.enabled = en[ek] !== false;
  const cj = path.join(home, '.claude.json');
  out.checked.push(cj);
  out.userServer = !!readJ(cj)?.mcpServers?.['business-wrap'];
  out.registered = (out.plugin && out.enabled !== false) || out.userServer;
  return out;
}

/** `business-wrap doctor`: what is installed, where state lives, whether a plugin update left a drift, and the last MCP startups. */
export async function doctor() {
  const facts = startupFacts();
  const last = tailLog(12);
  const lastStart = [...last].reverse().find((e) => e.event === 'start');
  const lastInit = [...last].reverse().find((e) => e.event === 'initialize');
  const problems = [];
  if (lastStart && lastStart.version && lastStart.version !== facts.version) problems.push(`the last MCP server loaded ${lastStart.version} but ${facts.version} is installed: run /reload-plugins (or restart the MCP client)`);
  if (facts.plugin && !facts.pluginData) problems.push('plugin install but the plugin data folder could not be derived: state falls back to the versioned folder');
  const errors = last.filter((e) => e.event === 'error');
  if (errors.length) problems.push(`${errors.length} startup error(s) logged, last: ${String(errors[errors.length - 1].message).split('\n')[0]}`);
  const registration = mcpRegistration();
  if (!registration.registered) problems.push('the Business-Wrap MCP server is not registered with Claude Code (no business-wrap plugin entry, none enabled, no user-scope server): install the plugin (/plugin install business-wrap) or add it to .mcp.json, then /reload-plugins');
  else if (registration.plugin && registration.pathExists === false) problems.push(`Claude Code registers Business-Wrap at ${registration.installPath} but that folder has no mcp/cli.mjs: run /plugin update business-wrap, then /reload-plugins`);
  else if (registration.plugin && registration.matchesThisInstall === false && facts.plugin) problems.push(`Claude Code registers ${registration.installPath} (${registration.version}); this folder is another install: run /reload-plugins`);
  const lastError = [...errors].pop() || null;
  const siblings = (() => { try { const parent = path.dirname(ROOT); return facts.plugin ? fs.readdirSync(parent).filter((n) => n !== path.basename(ROOT)) : []; } catch { return []; } })();
  return {
    ...facts,
    state_exists: fs.existsSync(facts.local),
    log: logFile(),
    last_initialize_ms: lastInit?.ms ?? null,
    registered: registration,
    last_start: lastStart ? { ts: lastStart.ts, version: lastStart.version, pid: lastStart.pid } : null,
    last_error: lastError ? { ts: lastError.ts, phase: lastError.phase, message: String(lastError.message).split('\n')[0].slice(0, 300) } : null,
    last_starts: last.filter((e) => e.event === 'start').slice(-3).map((e) => ({ ts: e.ts, version: e.version, pid: e.pid, root: e.root })),
    other_version_folders: siblings,
    host: os.platform(),
    problems,
    hint: 'After a plugin update run /reload-plugins (or restart your MCP client); until then the running server keeps the previous version\'s folder, and a failed reconnect may stay cached for 15 minutes.',
  };
}
