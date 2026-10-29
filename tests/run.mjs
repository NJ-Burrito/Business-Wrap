// Test runner: times every suite, runs targeted suites, runs the rest in parallel.
//   node tests/run.mjs                 all suites, parallel (BW_JOBS, default 4), prints a timing table
//   node tests/run.mjs editor ux       only tests/editor.test.mjs + tests/ux.test.mjs (name or substring)
//   node tests/run.mjs --changed       suites matching files changed vs main (git diff + untracked)
//   node tests/run.mjs --serial        one at a time (old `npm test` order)
// Exit 1 if any suite fails; failing suite output is printed in full, passing output is dropped.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const names = args.filter((a) => !a.startsWith('--'));
const all = [
  ...readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => 'tests/' + f),
  'mcp/test/server.test.mjs',
];
// slowest first so the long ones start early (measured in .agent-ops/suite-times.json when present)
let want = all;
if (names.length) want = all.filter((f) => names.some((n) => basename(f).replace('.test.mjs', '') === n || f.includes(n)));
if (flag('--changed')) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const files = [...git('diff', '--name-only', 'main'), ...git('ls-files', '--others', '--exclude-standard')];
  const hit = new Set();
  for (const f of files) {
    if (f.startsWith('tests/') && f.endsWith('.test.mjs')) hit.add(f);
    for (const s of all) { const k = basename(s).replace('.test.mjs', ''); if (f.includes('/' + k) || f.includes(k + '.')) hit.add(s); }
    if (/^(editor|assets\/editor)\//.test(f)) ['tests/editor.test.mjs', 'tests/owner-flows.test.mjs'].forEach((s) => hit.add(s));
  }
  want = all.filter((f) => hit.has(f));
  console.log('changed -> ' + (want.map((f) => basename(f, '.test.mjs')).join(' ') || 'nothing'));
}
if (!want.length) { console.log('no suites selected'); process.exit(0); }

const jobs = flag('--serial') ? 1 : Number(process.env.BW_JOBS) || Math.min(4, Math.max(1, os.cpus().length >> 1));
const results = [];
const t0 = Date.now();
const run = (f) => new Promise((res) => {
  const s = Date.now(); let out = '';
  const p = spawn(process.execPath, [f], { cwd: ROOT, env: { ...process.env, BW_TEST_SLOT: String(results.length) } });
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => { const r = { f, code, s: (Date.now() - s) / 1000, out }; results.push(r); console.log(`${code ? 'FAIL' : 'ok  '} ${r.s.toFixed(1).padStart(6)}s ${f}`); res(); });
});
const queue = [...want];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await run(queue.shift()); }));
const bad = results.filter((r) => r.code);
for (const r of bad) console.log(`\n===== ${r.f} (exit ${r.code}) =====\n${r.out.slice(-6000)}`);
const total = (Date.now() - t0) / 1000;
console.log(`\n${results.length - bad.length}/${results.length} suites ok, wall ${total.toFixed(1)}s, sum ${results.reduce((a, r) => a + r.s, 0).toFixed(1)}s, jobs ${jobs}`);
try { mkdirSync(join(ROOT, 'out'), { recursive: true }); writeFileSync(join(ROOT, 'out', 'suite-times.json'), JSON.stringify(Object.fromEntries(results.map((r) => [r.f, r.s])), null, 1)); } catch {}
process.exit(bad.length ? 1 : 0);
