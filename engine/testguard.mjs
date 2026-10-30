// Test hygiene (0.13.3): a test never reads or writes the owner's real data, by construction.
// "Test mode" is on when the test runner set BW_TEST_SLOT, when a suite imported tests/_isolate.mjs (BW_TEST_MODE=1),
// or when the entry script is a file under tests/ or mcp/test/ (so `node tests/x.test.mjs` is safe too; children inherit the env).
// In test mode: the local state folder (.local) is a temp folder, the default save folder is a temp folder, and the owner's
// real save folder (<home>\Documents\Business-Wrap) is refused as a workspace parent. BW_LOCAL_DIR / BW_WORKSPACE still win
// when a suite names its own (they are the suite's sandbox).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENTRY = String(process.argv[1] || '');
if (/\/(tests|mcp\/test)\/[^/]+\.mjs$/.test(ENTRY.replace(/\\/g, '/'))) process.env.BW_TEST_MODE ??= '1';

export const isTestMode = () => process.env.BW_TEST_SLOT !== undefined || process.env.BW_TEST_MODE === '1';
/** A per-run scratch folder under the OS temp folder (never under the repo, never in the owner's Documents). Created on first use,
 *  shared with child processes through BW_TEST_SANDBOX, removed by the process that made it when it exits. */
export const testSandbox = (name) => {
  let root = process.env.BW_TEST_SANDBOX;
  if (!root || !fs.existsSync(root)) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-test-'));
    process.env.BW_TEST_SANDBOX = root;
    process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp */ } });
  }
  return path.join(root, name);
};
/** True when `repo` is a Claude Code plugin cache copy (<plugins>/cache/<marketplace>/<plugin>/<version>): a folder the client
 *  owns and replaces on every update, so nothing of the user's may live in it and nothing may rewrite it in place. */
export const isPluginInstall = (repo) => /[\\/]plugins[\\/]cache[\\/]/.test(path.resolve(repo));
/** Claude Code's per-plugin data folder (kept across updates): CLAUDE_PLUGIN_DATA when the client exported it (MCP server, hooks),
 *  else, for a plugin cache copy, derived from the cache path the way the client names it
 *  (<plugins>/data/<plugin>-<marketplace>; [A]: the naming is from the plugin docs, not measured on a real install). */
export const pluginData = (repo) => {
  if (process.env.CLAUDE_PLUGIN_DATA) return path.resolve(process.env.CLAUDE_PLUGIN_DATA);
  const m = /^(.*[\\/]plugins)[\\/]cache[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/][^\\/]+$/.exec(path.resolve(repo));
  return m ? path.join(m[1], 'data', `${m[3]}-${m[2]}`.replace(/[^a-zA-Z0-9_-]/g, '-')) : null;
};
/** The state folder: BW_LOCAL_DIR, else a temp folder in test mode, else <plugin data>/local (a plugin install), else <repo>/.local. */
export const localBase = (repo) => {
  if (process.env.BW_LOCAL_DIR) return path.resolve(process.env.BW_LOCAL_DIR);
  if (isTestMode()) return testSandbox('local');
  const data = process.env.CLAUDE_PLUGIN_DATA || isPluginInstall(repo) ? pluginData(repo) : null;
  return data ? path.join(data, 'local') : path.join(repo, '.local');
};
const SKIP = /^(host\.json|mcp\.log|Singleton.*|lockfile|\.lock|Cache|Code Cache|GPUCache|Crashpad)$/i;
/** One-time move of state into the plugin data folder: when the state folder is `<plugin data>/local` and does not exist yet, copy
 *  what an older layout left (<repo>/.local, or the .local of a sibling version folder, newest first) except host.json (tied to a
 *  dead pid) and browser caches. Copy, never delete: the old folder belongs to a version Claude Code will remove itself.
 *  Returns {migrated, from, items} or {migrated:false, reason}. Never throws. */
export async function migrateLocal(repo) {
  try {
    const target = localBase(repo);
    if (isTestMode() || !/[\\/]local$/.test(target) || path.dirname(target) !== pluginData(repo)) return { migrated: false, reason: 'not-plugin-data' };
    if (fs.existsSync(target) && fs.readdirSync(target).filter((n) => !SKIP.test(n)).length) return { migrated: false, reason: 'target-exists' };
    const sibs = (() => { try { const parent = path.dirname(path.resolve(repo)); return fs.readdirSync(parent).map((n) => path.join(parent, n)).filter((d) => d !== path.resolve(repo)); } catch { return []; } })();
    const cands = [path.join(repo, '.local'), ...sibs.map((d) => path.join(d, '.local')).sort((a, b) => { const t = (x) => { try { return fs.statSync(x).mtimeMs; } catch { return 0; } }; return t(b) - t(a); })]
      .filter((d) => { try { return fs.statSync(d).isDirectory() && fs.readdirSync(d).some((n) => !SKIP.test(n)); } catch { return false; } });
    if (!cands.length) return { migrated: false, reason: 'nothing-to-move' };
    const from = cands[0];
    fs.mkdirSync(target, { recursive: true });
    const items = [];
    for (const n of fs.readdirSync(from)) {
      if (SKIP.test(n)) continue;
      try { await fs.promises.cp(path.join(from, n), path.join(target, n), { recursive: true, filter: (src) => !SKIP.test(path.basename(src)) }); items.push(n); } catch { /* a locked file: that item stays behind */ }
    }
    fs.writeFileSync(path.join(target, 'migrated-from.json'), JSON.stringify({ from, at: new Date().toISOString(), items }, null, 1));
    return { migrated: true, from, items };
  } catch (e) { return { migrated: false, reason: String(e?.message || e) }; }
}
/** The owner's real default save parent and root: never touched by a test. */
export const realParent = () => path.join(os.homedir(), 'Documents');
export const isRealRoot = (p) => {
  const r = path.relative(path.join(realParent(), 'Business-Wrap'), path.resolve(p));
  return !r.startsWith('..') && !path.isAbsolute(r);
};
