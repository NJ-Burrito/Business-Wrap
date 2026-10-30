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
  if (errors.length) problems.push(`${errors.length} startup error(s) logged, last: ${errors[errors.length - 1].message}`);
  const siblings = (() => { try { const parent = path.dirname(ROOT); return facts.plugin ? fs.readdirSync(parent).filter((n) => n !== path.basename(ROOT)) : []; } catch { return []; } })();
  return {
    ...facts,
    state_exists: fs.existsSync(facts.local),
    log: logFile(),
    last_initialize_ms: lastInit?.ms ?? null,
    last_starts: last.filter((e) => e.event === 'start').slice(-3).map((e) => ({ ts: e.ts, version: e.version, pid: e.pid, root: e.root })),
    other_version_folders: siblings,
    host: os.platform(),
    problems,
    hint: 'After a plugin update run /reload-plugins (or restart your MCP client); until then the running server keeps the previous version\'s folder, and a failed reconnect may stay cached for 15 minutes.',
  };
}
