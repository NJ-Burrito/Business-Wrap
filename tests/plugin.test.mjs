// B3 Claude Code plugin commands (0.13.0): every commands/*.md has front-matter with a description, runs only
// engine/cli.mjs through ${CLAUDE_PLUGIN_ROOT}, names a verb the CLI has, and allows only node; the plugin
// manifest sits where Claude Code finds commands/ (the plugin root). Each command line is also run as Claude Code
// would run it for the read-only verbs.
//
//   node tests/plugin.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
check('plugin manifest at the plugin root (.claude-plugin/plugin.json), so commands/ is discovered', fs.existsSync(path.join(REPO, '.claude-plugin', 'plugin.json')));

const LINE = /^!`node "\$\{CLAUDE_PLUGIN_ROOT\}\/engine\/cli\.mjs" ([a-z-]+)(?: \$ARGUMENTS)?`$/;
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const fm = /^---\n([^]*?)\n---\n/.exec(src);
  const meta = Object.fromEntries((fm?.[1] || '').split('\n').map((l) => l.split(/:\s(.*)/s)).filter((p) => p.length > 1).map(([k, v]) => [k.trim(), v.trim()]));
  check(`${f}: front-matter description`, !!meta.description && meta.description.length > 20, meta.description);
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

console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
