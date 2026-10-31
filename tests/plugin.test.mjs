// B3 Claude Code plugin commands (0.13.0): every commands/*.md has front-matter with a description, runs only
// engine/cli.mjs through ${CLAUDE_PLUGIN_ROOT}, names a verb the CLI has, and allows only node; the plugin
// manifest sits where Claude Code finds commands/ (the plugin root). Each command line is also run as Claude Code
// would run it for the read-only verbs.
//
//   node tests/plugin.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VERBS } from '../engine/cli.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(REPO, 'commands');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort() : [];
check('commands/ holds the plugin commands', files.length >= 9, files.join(', '));
for (const want of ['open', 'close', 'status', 'harvest', 'build', 'export', 'update']) check(`/business-wrap:${want} exists`, files.includes(`${want}.md`));
check('no README or other non-command .md in commands/ (each .md becomes a command)', !files.some((f) => /^readme/i.test(f)));
// 0.13.1 final pass #6: `npm test` runs every suite in tests/ (power, projects, bulk, srs-* were left out of the chain)
{ const chain = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts.test; const left = fs.readdirSync(path.join(REPO, 'tests')).filter((f) => f.endsWith('.test.mjs') && !chain.includes(`node tests/${f}`) && !chain.includes('tests/run.mjs')); check('npm test runs every tests/*.test.mjs', !left.length, left.join(', ')); }
check('plugin manifest at the plugin root (.claude-plugin/plugin.json), so commands/ is discovered', fs.existsSync(path.join(REPO, '.claude-plugin', 'plugin.json')));

const LINE = /^!`node "\$\{CLAUDE_PLUGIN_ROOT\}\/engine\/cli\.mjs" ([a-z-]+)(?: \$ARGUMENTS)?`$/;
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const fm = /^---\n([^]*?)\n---\n/.exec(src);
  const meta = Object.fromEntries((fm?.[1] || '').split('\n').map((l) => l.split(/:\s(.*)/s)).filter((p) => p.length > 1).map(([k, v]) => [k.trim(), v.trim()]));
  check(`${f}: front-matter description`, !!meta.description && meta.description.length > 20, meta.description);
  // 0.15.3: the live-editor commands (tabs, edit, ...) call MCP tools, not the CLI; tests/commands-0152.test.mjs checks them
  if (/^mcp__|^Read, /.test(meta['allowed-tools'] || '')) { check(`${f}: live-editor command (checked by commands-0152.test.mjs)`, true); continue; }
  check(`${f}: allowed-tools is node only`, meta['allowed-tools'] === 'Bash(node:*)', meta['allowed-tools']);
  const bangs = src.split('\n').filter((l) => l.startsWith('!'));
  const verbs = bangs.map((l) => LINE.exec(l)?.[1]);
  check(`${f}: runs only engine/cli.mjs`, bangs.length === 1 && verbs.every(Boolean), bangs.join(' | '));
  check(`${f}: its verb exists in the CLI`, verbs.every((v) => VERBS.includes(v)), verbs.join(','));
  check(`${f}: says what it did in one line`, /^Say in one line/m.test(src));
}

// run each read-only command the way Claude Code would (CLAUDE_PLUGIN_ROOT = this repo)
const env = { ...process.env, CLAUDE_PLUGIN_ROOT: REPO, BW_STATE_DIR: path.join(REPO, 'out', 'plugin-test', 'state') };
for (const [f, args] of [['status.md', '--json'], ['update.md', '--notes']]) {
  if (!files.includes(f)) continue;
  const line = LINE.exec(fs.readFileSync(path.join(DIR, f), 'utf8').split(/\r?\n/).find((l) => l.startsWith('!')));
  const r = spawnSync(process.execPath, [path.join(env.CLAUDE_PLUGIN_ROOT, 'engine', 'cli.mjs'), line[1], ...args.split(' ')], { env, encoding: 'utf8' });
  check(`${f} runs: exit 0`, r.status === 0, (r.stderr || '').slice(0, 160));
}

// F4 (review line 34): the plugin starts the MCP server from its own files, never from the npm registry, and it
// runs from a fresh clone (no node_modules). Proof: copy the repo's files to a temp folder with no node_modules
// above it, start the server exactly as plugin.json says, and list the tools over stdio with raw JSON-RPC.
const plugin = JSON.parse(fs.readFileSync(path.join(REPO, '.claude-plugin', 'plugin.json'), 'utf8'));
const srv = plugin.mcpServers?.['business-wrap'] || {};
const argv = [srv.command, ...(srv.args || [])].join(' ');
check('plugin MCP: starts with node from ${CLAUDE_PLUGIN_ROOT}, not npx or a registry package', srv.command === 'node' && (srv.args || []).length === 1 && srv.args[0] === '${CLAUDE_PLUGIN_ROOT}/mcp/cli.mjs', argv);
check('plugin MCP: no npm package spec anywhere in the plugin manifest', !/npx|business-wrap@|registry/.test(JSON.stringify(plugin)));
{ // F5 · 5: the registry metadata describes the local launch (node mcp/cli.mjs), not an npm package that is not published
  const sj = JSON.parse(fs.readFileSync(path.join(REPO, 'mcp', 'server.json'), 'utf8'));
  const launch = sj._meta?.['io.modelcontextprotocol.registry/publisher-provided']?.launch || {};
  const sm = fs.readFileSync(path.join(REPO, 'mcp', 'smithery.yaml'), 'utf8');
  check('F5 5: server.json and smithery.yaml launch node mcp/cli.mjs locally, no npm/npx package', !sj.packages && launch.command === 'node' && launch.args?.[0] === 'mcp/cli.mjs' && /command: "node"/.test(sm) && /args: \["mcp\/cli\.mjs"\]/.test(sm) && !/npx|business-wrap@/.test(sm + JSON.stringify(sj)), JSON.stringify(launch));
}
check('plugin version is 0.15.3 (plugin.json, package.json, server.json)', [plugin.version, JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version, JSON.parse(fs.readFileSync(path.join(REPO, 'mcp', 'server.json'), 'utf8')).version].every((v) => v === '0.15.3'));

// the vendored bundle is exactly a fresh build from the locked packages (security/gitleaks.toml allowlists it by path)
const esbuildDir = path.join(REPO, 'node_modules', 'esbuild');
if (fs.existsSync(esbuildDir)) {
  const { build } = await import(pathToFileURL(path.join(esbuildDir, 'lib', 'main.js')).href);
  const script = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts['vendor:mcp'];
  const banner = /"--banner:js=(.*)"$/.exec(script)?.[1];
  const r = await build({ entryPoints: [path.join(REPO, 'mcp', 'vendor', 'entry.mjs')], bundle: true, platform: 'node', format: 'esm', minify: true, legalComments: 'eof', banner: { js: banner }, write: false, absWorkingDir: REPO, logLevel: 'silent' });
  const fresh = Buffer.from(r.outputFiles[0].contents);
  check('mcp/vendor/sdk.mjs is byte-identical to a fresh `npm run vendor:mcp` build', !!banner && fresh.equals(fs.readFileSync(path.join(REPO, 'mcp', 'vendor', 'sdk.mjs'))), `${fresh.length} bytes fresh`);
} else check('mcp/vendor/sdk.mjs reproducibility (needs npm ci)', true, 'skipped: no node_modules');

const os = await import('node:os');
const FRESH = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fresh-'));
const listed = spawnSync('git', ['-C', REPO, 'ls-files', '-co', '--exclude-standard', '-z'], { encoding: 'utf8' });
for (const rel of listed.stdout.split('\0').filter((f) => f && !f.startsWith('node_modules/') && fs.existsSync(path.join(REPO, f)))) {
  fs.mkdirSync(path.dirname(path.join(FRESH, rel)), { recursive: true });
  fs.copyFileSync(path.join(REPO, rel), path.join(FRESH, rel));
}
const noNm = (d) => { for (let p = d; ; p = path.dirname(p)) { if (fs.existsSync(path.join(p, 'node_modules'))) return false; if (path.dirname(p) === p) return true; } };
check('fresh clone: no node_modules in the copy or above it', noNm(FRESH), FRESH);
const freshEnv = { ...process.env, CLAUDE_PLUGIN_ROOT: FRESH, BW_LOCAL_DIR: path.join(FRESH, '.local'), BW_STATE_DIR: path.join(FRESH, '.state') };
const sub = (s) => s.replaceAll('${CLAUDE_PLUGIN_ROOT}', FRESH);
const tools = await new Promise((resolve) => {
  const cp = spawn(srv.command === 'node' ? process.execPath : srv.command, (srv.args || []).map(sub), { env: freshEnv, cwd: os.tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', err = '';
  const done = (v) => { clearTimeout(t); cp.kill(); resolve(v); };
  const t = setTimeout(() => done({ error: 'timeout 30 s; stderr: ' + err.slice(0, 200) }), 30000);
  cp.stderr.on('data', (d) => { err += d; });
  cp.on('exit', (code) => done({ error: `exited ${code}; stderr: ${err.slice(0, 300)}` }));
  cp.stdout.on('data', (d) => {
    buf += d;
    for (let i; (i = buf.indexOf('\n')) >= 0;) {
      const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (msg.id === 1) {
        cp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        cp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
      } else if (msg.id === 2) done({ names: (msg.result?.tools || []).map((x) => x.name) });
    }
  });
  cp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'plugin-test', version: '0' } } }) + '\n');
});
check('fresh clone: the plugin MCP server lists its tools over stdio', (tools.names || []).length >= 20, tools.error || `${tools.names.length} tools`);
for (const want of ['harvest_crawl', 'harvest_sources', 'open_in_editor', 'build_editor', 'export_document']) check(`fresh clone: MCP tool ${want}`, (tools.names || []).includes(want));
for (const [f, args] of [['status.md', '--json'], ['update.md', '--notes']]) {
  const line = LINE.exec(fs.readFileSync(path.join(FRESH, 'commands', f), 'utf8').split(/\r?\n/).find((l) => l.startsWith('!')));
  const r = spawnSync(process.execPath, [path.join(FRESH, 'engine', 'cli.mjs'), line[1], ...args.split(' ')], { env: freshEnv, encoding: 'utf8' });
  check(`fresh clone: /${f.replace('.md', '')} runs with no node_modules`, r.status === 0, (r.stderr || '').slice(0, 160));
}
fs.rmSync(FRESH, { recursive: true, force: true }); // ponytail: own temp copy made above, not user data

console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
