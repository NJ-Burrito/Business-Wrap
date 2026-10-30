// mcp lane (0.15.0): "MCP server not connected after a plugin update" (architect.md §1), reproduced on a SCRATCH plugin folder
// laid out the way Claude Code lays one out (<tmp>/plugins/cache/<marketplace>/<plugin>/<version>, data in <tmp>/plugins/data/<id>).
// Real caller throughout: the official MCP client starts `mcp/cli.mjs` over stdio exactly as plugin.json says.
//
//   node tests/mcp-startup.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { testSandbox } from '../engine/testguard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 140) : ''}`); if (!ok) failed += 1; };

// ── the scratch plugin cache (under the OS temp folder = O:\Temp on this machine) ──
const SIM = testSandbox('sim');
const MKT = path.join(SIM, 'plugins', 'cache', 'business-wrap', 'business-wrap');
const DATA = path.join(SIM, 'plugins', 'data', 'business-wrap-business-wrap');
const V0 = path.join(MKT, '0.14.0');
const V1 = path.join(MKT, '0.14.1');
const SKIP = new Set(['node_modules', '.git', 'out', 'site', 'tests', '.local', 'work', 'docs', 'tools', 'evals', 'security', 'logos', 'share-toast-1024x640.png', 'share-toast-1366x768.png', 'share-toast-1920x1080.png']);
const copyPlugin = (to) => fs.cpSync(REPO, to, { recursive: true, filter: (src) => !SKIP.has(path.relative(REPO, src).split(path.sep)[0]) });
const setVersion = (dir, v) => { const f = path.join(dir, 'package.json'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.version = v; fs.writeFileSync(f, JSON.stringify(j, null, 2)); };
const hashTree = (dir, parts = ['engine', 'mcp', 'update', 'editor']) => {
  const h = crypto.createHash('sha256');
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); } } };
  for (const x of parts) if (fs.existsSync(path.join(dir, x))) walk(path.join(dir, x));
  return h.digest('hex');
};
copyPlugin(V0);
setVersion(V0, '0.14.0');

// the network is black-holed for every server started here: a request that is made hangs forever
const HOLE = path.join(SIM, 'blackhole.mjs');
const FETCHLOG = path.join(SIM, 'fetch.log'); // when did the server first try the network?
fs.writeFileSync(HOLE, `import fs from 'node:fs'; globalThis.fetch = () => { try { fs.appendFileSync(${JSON.stringify(FETCHLOG)}, Date.now() + '\\n'); } catch { /* none */ } return new Promise(() => {}); };\n`);
const cleanEnv = () => { const e = { ...process.env }; for (const k of ['BW_TEST_MODE', 'BW_TEST_SLOT', 'BW_TEST_SANDBOX', 'BW_LOCAL_DIR', 'BW_STATE_DIR', 'BW_UPDATE_FEED', 'BW_WORKSPACE']) delete e[k]; return e; };
const srvEnv = (extra = {}) => ({ ...cleanEnv(), CLAUDE_PLUGIN_DATA: DATA, BW_WORKSPACE: path.join(SIM, 'ws'), BW_LEARNING_DIR: path.join(SIM, 'learning'), NODE_OPTIONS: `--import ${pathToFileURL(HOLE).href}`, ...extra });
const start = async (root, env) => {
  const client = new Client({ name: 'startup-test', version: '1.0.0' });
  const t0 = Date.now();
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'mcp', 'cli.mjs')], cwd: SIM, env, stderr: 'pipe' }));
  return { client, ms: Date.now() - t0 };
};
const text = (r) => r.content?.[0]?.text || '';
const json = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');

try {
  // ── 1. cold start: initialize answered fast with the network black-holed and no update cache ──
  fs.mkdirSync(path.join(V0, '.local'), { recursive: true });
  fs.writeFileSync(path.join(V0, '.local', 'workspace.json'), JSON.stringify({ parent: path.join(SIM, 'ws') }));
  fs.writeFileSync(path.join(V0, '.local', 'host.json'), JSON.stringify({ pid: 999999, port: 1, token: 'stale' }));
  fs.writeFileSync(path.join(V0, '.local', 'update.json'), JSON.stringify({ check: true, hook: false }));
  let a = await start(V0, srvEnv());
  // Wall time depends on load (ten lanes share this machine), so the proof is ORDER: the old server awaited the update request (up to 4 s)
  // before it connected; this one connects first and only then asks. 8 s is a hang detector, not a target.
  check(`cold start with the network black-holed: connected and initialized in ${a.ms} ms (hang ceiling 8000 ms)`, a.ms < 8000, `${a.ms} ms`);
  const info = a.client.getServerVersion();
  check('initialize carries name and the loaded version', info?.name === 'business-wrap' && info?.version === '0.14.0', JSON.stringify(info));
  let r = await a.client.callTool({ name: 'check_fonts', arguments: {} });
  check('a tool call works on the scratch plugin folder', !r.isError, text(r).slice(0, 80));

  // state went to the plugin data folder, not under the versioned folder; the first start migrated the old .local there
  const L = path.join(DATA, 'local');
  check('state lives in <plugin data>/local, migrated from the version folder (workspace.json, no stale host.json)', fs.existsSync(path.join(L, 'workspace.json')) && !fs.existsSync(path.join(L, 'host.json')) && fs.existsSync(path.join(L, 'migrated-from.json')), fs.existsSync(L) ? fs.readdirSync(L).join(',') : 'no data folder');
  const log = fs.readFileSync(path.join(L, 'mcp.log'), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
  const ev = (n) => log.find((x) => x.event === n);
  check('mcp.log has start, initialize and connected lines with pid, version, root, ms', ev('start')?.version === '0.14.0' && ev('start').pid > 0 && ev('start').root === V0 && ev('start').plugin === true && ev('initialize')?.ms > 0 && ev('connected')?.ms > 0, log.map((x) => x.event).join(','));
  check('the update check made no request before the handshake (cache age is null: nothing cached yet)', ev('initialize')?.updateCacheAgeMs === null);
  await new Promise((r) => setTimeout(r, 1500)); // the background refresh runs after the handshake
  const fetched = fs.existsSync(FETCHLOG) ? fs.readFileSync(FETCHLOG, 'utf8').trim().split('\n').map(Number) : [];
  check('the first network request came AFTER the server was connected (connect first, refresh in the background)', fetched.length >= 1 && fetched[0] >= Date.parse(ev('connected').ts), `fetch at ${fetched[0]} vs connected at ${Date.parse(ev('connected').ts)}`);

  // ── 2. the update, two ways Claude Code can hit a running server ──
  // (a) the folder the server runs from is rewritten under it (in-place swap, or a client that reuses the path)
  setVersion(V0, '0.14.1');
  r = await a.client.callTool({ name: 'check_fonts', arguments: {} });
  const d = json(r);
  check('version drift: the next call is RESTART_REQUIRED with loaded + installed + how, not half-old code', r.isError === true && d.code === 'RESTART_REQUIRED' && d.loaded === '0.14.0' && d.installed === '0.14.1' && /reload-plugins/.test(d.how), text(r).slice(0, 160));
  {
    const dd = spawnSync(process.execPath, [path.join(V0, 'engine', 'cli.mjs'), 'doctor', '--json'], { env: srvEnv({ NODE_OPTIONS: '' }), encoding: 'utf8', cwd: SIM });
    const dj = (() => { try { return JSON.parse(dd.stdout); } catch { return null; } })();
    check('doctor flags the server that is still on the previous version', (dj?.problems || []).some((x) => /loaded 0\.14\.0 but 0\.14\.1 is installed/.test(x)), JSON.stringify(dj?.problems));
  }
  // (b) the old version folder disappears (Claude Code removes an orphaned folder after 14 days)
  fs.renameSync(path.join(V0, 'package.json'), path.join(V0, 'package.json.gone'));
  r = await a.client.callTool({ name: 'check_fonts', arguments: {} });
  check('the version folder is gone: RESTART_REQUIRED with installed null', r.isError === true && json(r).code === 'RESTART_REQUIRED' && json(r).installed === null);
  await a.client.close();
  fs.renameSync(path.join(V0, 'package.json.gone'), path.join(V0, 'package.json'));
  setVersion(V0, '0.14.0');

  // ── 3. /reload-plugins: the new version folder starts, same data folder, state still there ──
  copyPlugin(V1);
  setVersion(V1, '0.14.1');
  fs.writeFileSync(path.join(L, 'profile.json'), JSON.stringify({ name: 'kept across the update' }));
  let b = await start(V1, srvEnv());
  check(`after the update the new server answers initialize (${b.ms} ms) and reports 0.14.1`, b.ms < 8000 && b.client.getServerVersion()?.version === '0.14.1', `${b.ms} ms`);
  check('the data folder survived: profile.json is where the old server left it', JSON.parse(fs.readFileSync(path.join(L, 'profile.json'), 'utf8')).name === 'kept across the update');
  r = await b.client.callTool({ name: 'check_fonts', arguments: {} });
  check('a tool call works after the update', !r.isError);

  // ── 4. apply_update in plugin mode changes nothing ──
  const feed = path.join(SIM, 'feed.json');
  fs.writeFileSync(feed, JSON.stringify({ tag_name: 'v9.9.9', html_url: 'https://github.com/NJ-Burrito/Business-Wrap/releases/tag/v9.9.9', body: '### Added\n- a new thing / شيء جديد\n', published_at: '2026-10-31T00:00:00Z', assets: [] }));
  await b.client.close();
  const before = hashTree(V1);
  b = await start(V1, srvEnv({ BW_UPDATE_FEED: feed, NODE_OPTIONS: '' }));
  r = await b.client.callTool({ name: 'apply_update', arguments: { confirm: true } });
  const u = json(r);
  check('apply_update in a plugin install: {applied:false, plugin:true, how:[…]} and no file changed', !r.isError && u.applied === false && u.plugin === true && /plugin update/.test((u.how || []).join(' ')) && hashTree(V1) === before, text(r).slice(0, 200));
  await b.client.close();

  // ── 5. doctor, through the real CLI entry point, on the plugin folder ──
  const docEnv = srvEnv({ NODE_OPTIONS: '' });
  const run = (root, ...args) => spawnSync(process.execPath, [path.join(root, 'engine', 'cli.mjs'), ...args], { env: docEnv, encoding: 'utf8', cwd: SIM });
  const dr = run(V1, 'doctor', '--json');
  let doc; try { doc = JSON.parse(dr.stdout); } catch { doc = null; }
  check('doctor: plugin install, state folder in the plugin data, last starts listed, exit 0', dr.status === 0 && doc?.plugin === true && doc.local === L && doc.last_starts.length >= 1 && doc.last_initialize_ms > 0, (dr.stdout + dr.stderr).slice(0, 200));
  const st = run(V1, 'status', '--json');
  check('status carries the mcp summary', st.status === 0 && 'mcp' in JSON.parse(st.stdout), st.stdout.slice(0, 120));
  // CLAUDE_PLUGIN_DATA not exported to the command shell: the data folder is derived from the cache path
  const noEnv = spawnSync(process.execPath, [path.join(V1, 'engine', 'cli.mjs'), 'doctor', '--json'], { env: (() => { const e = srvEnv({ NODE_OPTIONS: '' }); delete e.CLAUDE_PLUGIN_DATA; return e; })(), encoding: 'utf8', cwd: SIM });
  check('commands without CLAUDE_PLUGIN_DATA still find the same state folder (derived from the cache path)', noEnv.status === 0 && JSON.parse(noEnv.stdout).local === L, noEnv.stdout.slice(0, 160));

  // ── 6. the order of the state folder, through the real modules in a child (no test mode) ──
  const where = (env) => JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', `import { hostFile } from ${JSON.stringify(pathToFileURL(path.join(V1, 'engine', 'host.mjs')).href)}; console.log(JSON.stringify({ host: hostFile() }));`], { env: { ...cleanEnv(), BW_WORKSPACE: path.join(SIM, 'ws'), ...env }, encoding: 'utf8', cwd: SIM }).stdout);
  check('BW_LOCAL_DIR unset + CLAUDE_PLUGIN_DATA set: host.json goes to <data>/local', where({ CLAUDE_PLUGIN_DATA: DATA }).host === path.join(L, 'host.json'));
  check('BW_LOCAL_DIR wins over CLAUDE_PLUGIN_DATA', where({ CLAUDE_PLUGIN_DATA: DATA, BW_LOCAL_DIR: path.join(SIM, 'explicit') }).host === path.join(SIM, 'explicit', 'host.json'));
  const clone = JSON.parse(spawnSync(process.execPath, ['--input-type=module', '-e', `import { localBase } from ${JSON.stringify(pathToFileURL(path.join(REPO, 'engine', 'testguard.mjs')).href)}; console.log(JSON.stringify({ l: localBase(${JSON.stringify(path.join(SIM, 'a-clone'))}) }));`], { env: cleanEnv(), encoding: 'utf8' }).stdout);
  check('a clone keeps <repo>/.local', clone.l === path.join(SIM, 'a-clone', '.local'), clone.l);
} catch (e) {
  check('mcp startup run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
