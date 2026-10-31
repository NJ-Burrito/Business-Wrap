// 0.15.4 hotfix: the per-verb flag check of 0.15.3 refused documented usage (`--ops-file -`, `stop --all`).
// Table-driven: every invocation the docs, the usage header, the commands and the MCP shells show must parse; unknown flags are still refused.
// State is isolated (own BW_* folders), no host is started, port 4317 is never touched.
//
//   node tests/cli-0154.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-cli0154-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp */ } });
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) failed += 1; };
const { checkFlags, VERBS } = await import('../engine/cli.mjs');
const parses = (line) => { const [verb, ...rest] = line.split(' '); try { checkFlags(verb, rest); return true; } catch { return false; } };

// 1) the invocations written in the usage header of engine/cli.mjs, README(.ar), docs/*.md, commands/*.md, mcp/*.mjs (collected from the files, not typed)
const files = ['engine/cli.mjs', 'README.md', 'README.ar.md', ...fs.readdirSync(path.join(REPO, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f), ...fs.readdirSync(path.join(REPO, 'commands')).map((f) => 'commands/' + f), 'mcp/server.mjs', 'mcp/editor-tools.mjs', 'hooks/hooks.json', 'SKILL.md'];
const found = new Set();
for (const f of files) {
  const txt = fs.readFileSync(path.join(REPO, f), 'utf8');
  for (const m of txt.matchAll(/(?:business-wrap|engine\/cli\.mjs)[` ]+((?:open|close|stop|status|new|build|harvest|import|export|gate|heal-log|verify-history|library|tidy|report|update|doctor|reset|editor)\b[^`"'|)\n]*)/g)) {
    let line = m[1].replace(/\[[^\]]*\]/g, (b) => b).trim();
    // optional [--flag] groups in a usage line are expanded to "with the flag": take each flag on its own
    const verb = line.split(/\s+/)[0];
    if (verb === 'update') continue; // passthrough to update/cli.mjs (no flag table)
    if (verb === 'build' && /--(pack|profile|export|record|harvest|model)/.test(line)) continue; // that is engine/srs/cli.mjs
    const flags = [...line.matchAll(/(?<=\s|\[)(--[a-z][a-z-]*|-)(?=[\s\]|=,)]|$)/g)].map((x) => x[1]);
    for (const fl of flags) found.add(`${verb}\t${fl}\t${f}`);
  }
}
const KNOWN_VALUE_FLAGS = new Set(['--ops-file', '--args-file', '--pointer-file']);
let n = 0; const refused = [];
for (const t of found) {
  const [verb, fl] = t.split('\t');
  if (fl === '-') continue; // handled below as a value
  n += 1;
  const VALUED_FLAGS = ['--ops-file', '--args-file', '--pointer-file', '--port', '--name', '--roles', '--edits', '--title', '--ui', '--history', '--doc', '--pointer', '--locale', '--agent', '--group', '--id', '--project', '--file', '--tab', '--scale', '--out'];
  const test = VALUED_FLAGS.includes(fl) ? [fl, KNOWN_VALUE_FLAGS.has(fl) ? '-' : 'v'] : [fl];
  if (!(VERBS.includes(verb) ? parses([verb, ...test].join(' ')) : true)) refused.push(`${verb} ${fl}`);
}
check(`documented flags parse (${n} verb+flag pairs collected from the docs, usage header, commands and MCP shells)`, n >= 15 && refused.length === 0, refused.join(', ') || `${n} checked`);
check('the collection found the two that broke in 0.15.3 (stop --all, editor --ops-file)', [...found].some((t) => t.startsWith('stop\t--all')) && [...found].some((t) => t.startsWith('editor\t--ops-file')));

// 2) a lone - is a value, and so is anything right after a valued flag
check('`editor ops --ops-file -` parses', parses('editor ops --doc A --locale ar --ops-file -'));
check('`editor action --args-file -` parses', parses('editor action --doc A --id x --args-file -'));
check('`editor import --args-file -` parses', parses('editor import --args-file -'));
check('`editor get --pointer-file -` parses', parses('editor get --doc A --pointer-file -'));
check('`stop --all`, `close --all` and `close` parse', parses('stop --all') && parses('close --all') && parses('close') && parses('stop'));
check('a value that starts with a dash after a valued flag is a value', parses('new --title -weird-name') && parses('editor new --title -x'));

// 3) unknown flags are still refused
for (const line of ['stop --nope', 'status --all', 'editor ops --bogus', 'open --pointer p', 'new -x', 'editor list --tab-x', 'close --force']) check(`unknown flag still refused: ${line}`, !parses(line));

// 4) the real binary, isolated state: stdin ops reach the editor step; stop --all works
const env = { ...process.env, PYTHONUTF8: '1', BW_LOCAL_DIR: path.join(TMP, 'local'), BW_STATE_DIR: path.join(TMP, 'state'), BW_WORKSPACE: path.join(TMP, 'ws'), BW_NO_BROWSER: '1', BW_TEST_MODE: '1' };
const cli = (args, input) => spawnSync(process.execPath, [path.join(REPO, 'engine/cli.mjs'), ...args], { encoding: 'utf8', env, input, timeout: 90000, windowsHide: true });
let r = cli(['stop', '--all', '--json']);
let j; try { j = JSON.parse(r.stdout); } catch { j = null; }
check('binary: `stop --all --json` exits 0 and reports 0 stopped (nothing of this isolated install is running)', r.status === 0 && j && j.stopped === 0, r.stdout + r.stderr);
r = cli(['stop', '--nope']);
check('binary: `stop --nope` exits 2 and changes nothing', r.status === 2 && /unknown option --nope/.test(r.stderr), r.stderr.slice(0, 120));
r = cli(['editor', 'ops', '--doc', 'A', '--locale', 'ar', '--ops-file', '-'], JSON.stringify([{ op: 'explode', path: '/x' }]));
check('binary: stdin ops get past the flag check (BAD_OP from the op check, not "unknown option -")', /BAD_OP/.test(r.stderr + r.stdout) && !/unknown option/.test(r.stderr + r.stdout), (r.stderr + r.stdout).slice(0, 160));

console.log(results.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `cli-0154: ${results.length} checks`);
process.exit(failed ? 1 : 0);
