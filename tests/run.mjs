// Test runner: times every suite, runs targeted suites, runs the rest in parallel.
//   node tests/run.mjs                 all suites, parallel (BW_JOBS, default 4), prints a timing table
//   node tests/run.mjs editor ux       only tests/editor.test.mjs + tests/ux.test.mjs (name or substring)
//   node tests/run.mjs --changed       suites matching files changed vs main (git diff + untracked)
//   node tests/run.mjs --serial        one at a time (old `npm test` order)
//   node tests/run.mjs --shard 2/4     only the 2nd of 4 deterministic shards (CI matrix); balanced by tests/durations.json
//   node tests/run.mjs --list          print the selected suites (after --shard/--changed/names) and exit, running nothing
//   node tests/run.mjs --record        after the run, merge the measured times into tests/durations.json
//   node tests/run.mjs --merge <files> merge suite-times.json files (CI artifacts) into tests/durations.json and exit
// Exit 1 if any suite fails; failing suite output is printed in full, passing output is dropped.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valueOf = (f) => { const i = args.indexOf(f); return i < 0 ? null : args[i + 1]; };
const mergeAt = args.indexOf('--merge');
const shardArg = valueOf('--shard');
const names = args.filter((a, i) => !a.startsWith('--') && a !== shardArg && !(mergeAt >= 0 && i > mergeAt));
const DURATIONS = join(ROOT, 'tests', 'durations.json');
const readDurations = () => { try { return JSON.parse(readFileSync(DURATIONS, 'utf8')); } catch { return {}; } };
const writeDurations = (d) => writeFileSync(DURATIONS, JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, Math.round(v * 10) / 10])), null, 1) + '\n');
const all = [
  ...readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => 'tests/' + f),
  'mcp/test/server.test.mjs',
];
if (mergeAt >= 0) {
  const d = readDurations();
  for (const f of args.slice(mergeAt + 1)) { const t = JSON.parse(readFileSync(f, 'utf8')); for (const [k, v] of Object.entries(t)) if (typeof v === 'number') d[k] = v; }
  writeDurations(d); console.log('durations.json: ' + Object.keys(d).length + ' suites'); process.exit(0);
}
// Deterministic shard i of n. Longest-processing-time-first onto the lightest shard, using tests/durations.json;
// a suite with no recorded time counts as the median of the recorded ones; with no durations at all, round-robin by name.
function shardOf(files, i, n, durations = {}) {
  const sorted = [...files].sort();
  const known = sorted.map((f) => durations[f]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!known.length) return sorted.filter((_, k) => k % n === i - 1);
  const fallback = known[known.length >> 1];
  const w = (f) => (typeof durations[f] === 'number' ? durations[f] : fallback);
  const load = Array(n).fill(0), mine = [];
  for (const f of [...sorted].sort((a, b) => w(b) - w(a) || (a < b ? -1 : 1))) {
    const k = load.indexOf(Math.min(...load)); load[k] += w(f); if (k === i - 1) mine.push(f);
  }
  return mine; // longest first, so the long ones start early
}
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
if (shardArg) {
  const m = /^(\d+)\/(\d+)$/.exec(shardArg);
  if (!m || +m[1] < 1 || +m[1] > +m[2]) { console.error('--shard wants i/n with 1 <= i <= n, e.g. --shard 2/4'); process.exit(2); }
  want = shardOf(want, +m[1], +m[2], readDurations());
  console.log(`shard ${shardArg} -> ${want.length} suites`);
}
if (flag('--list')) { for (const f of want) console.log(f); process.exit(0); }
if (!want.length) { console.log('no suites selected'); process.exit(0); }

const jobs = flag('--serial') ? 1 : Number(process.env.BW_JOBS) || Math.min(4, Math.max(1, os.cpus().length >> 1));
const results = [];
const t0 = Date.now();
const run = (f) => new Promise((res) => {
  const s = Date.now(); let out = '';
  const p = spawn(process.execPath, [f], { cwd: ROOT, env: { ...process.env, BW_TEST_SLOT: String(results.length), BW_TEST_MODE: '1' } });
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('close', (code) => { const r = { f, code, s: (Date.now() - s) / 1000, out }; results.push(r); console.log(`${code ? 'FAIL' : 'ok  '} ${r.s.toFixed(1).padStart(6)}s ${f}`); res(); });
});
const queue = [...want];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await run(queue.shift()); }));
const bad = results.filter((r) => r.code);
for (const r of bad) console.log(`\n===== ${r.f} (exit ${r.code}) =====\n${r.out.slice(-6000)}`);
const total = (Date.now() - t0) / 1000;
console.log(`\n${results.length - bad.length}/${results.length} suites ok, wall ${total.toFixed(1)}s, sum ${results.reduce((a, r) => a + r.s, 0).toFixed(1)}s, jobs ${jobs}`);
const times = Object.fromEntries(results.map((r) => [r.f, r.s]));
try { mkdirSync(join(ROOT, 'out'), { recursive: true }); writeFileSync(join(ROOT, 'out', 'suite-times.json'), JSON.stringify(times, null, 1)); } catch {}
if (flag('--record')) { try { writeDurations({ ...readDurations(), ...Object.fromEntries(results.filter((r) => !r.code).map((r) => [r.f, r.s])) }); console.log('recorded -> tests/durations.json'); } catch (e) { console.log('record failed: ' + e.message); } }
process.exit(bad.length ? 1 : 0);
