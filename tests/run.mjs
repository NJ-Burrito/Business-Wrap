// Test runner: times every suite, runs targeted suites, runs the rest in parallel.
//   node tests/run.mjs                 all suites, parallel (BW_JOBS, default 4), prints a timing table
//   node tests/run.mjs editor ux       only tests/editor.test.mjs + tests/ux.test.mjs (name or substring)
//   node tests/run.mjs --changed       suites matching files changed vs main (git diff + untracked)
//   node tests/run.mjs --serial        one at a time (old `npm test` order)
//   node tests/run.mjs --shard 2/4     only the 2nd of 4 deterministic shards (CI matrix); balanced by tests/durations.json
//   node tests/run.mjs --list          print the selected suites (after --shard/--changed/names) and exit, running nothing
//   node tests/run.mjs --record        after the run, merge the measured times into tests/durations.json
//   node tests/run.mjs --merge <files> merge suite-times.json files (CI artifacts) into tests/durations.json and exit
//   --retry / --no-retry               one retry of each failed suite, alone, after the rest finish (default on when CI=true; off locally)
// Exit 1 if any suite fails; failing suite output is printed in full, passing output is dropped.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = process.env.BW_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'); // BW_ROOT: tests/run-retry.test.mjs points the runner at a fake tree
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
].filter((f) => existsSync(join(ROOT, f)));
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
// A suite that never ends must not take the whole job with it (GitHub run 41540035963: shard 3 was cancelled at the 45-minute job limit with no line saying which suite hung).
// BW_SUITE_TIMEOUT seconds (default 900; the slowest suite takes about 5 minutes) kills the suite's process tree and reports it as a failure with the output it had written.
// The suite is also finished when its process exits, even if a child it started (a server, a browser) still holds the output pipe open: waiting for the pipe to close would wait for that child.
const SUITE_TIMEOUT = (Number(process.env.BW_SUITE_TIMEOUT) || 900) * 1000;
// A suite recorded in durations.json gets at least 3x its recorded time (a slow CI runner), never less than SUITE_TIMEOUT.
const timeoutFor = (f) => { let d = 0; try { d = Number(JSON.parse(readFileSync(DURATIONS, 'utf8'))[f]) || 0; } catch { /* no durations */ } return Math.max(SUITE_TIMEOUT, d * 3000); };
const run = (f, isRetry = false) => new Promise((res) => {
  const s = Date.now(); let out = ''; const LIMIT = timeoutFor(f);
  console.log(`${isRetry ? 'retry ' : ''}start ${f}`);
  const p = spawn(process.execPath, [f], { cwd: ROOT, env: { ...process.env, BW_TEST_SLOT: String(results.length), BW_TEST_MODE: '1' } });
  let done = false, timedOut = false, exitCode = null;
  const finish = (code) => {
    if (done) return; done = true; clearTimeout(timer);
    const r = { f, code: timedOut ? 124 : (code ?? exitCode ?? 1), s: (Date.now() - s) / 1000, out }; if (!isRetry) results.push(r);
    console.log(`${isRetry ? 'retry ' : ''}${r.code ? 'FAIL' : 'ok  '} ${r.s.toFixed(1).padStart(6)}s ${f}${timedOut ? '  (timed out)' : ''}`); res(r);
  };
  const timer = setTimeout(() => {
    timedOut = true; out += `
FAIL  ${f}: no end after ${LIMIT / 1000} s, its process tree was killed (BW_SUITE_TIMEOUT)
`;
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ } } else { try { p.kill('SIGKILL'); } catch { /* gone */ } }
    setTimeout(() => finish(124), 3000);
  }, LIMIT);
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d));
  p.on('exit', (code) => { exitCode = code; setTimeout(() => finish(code), 2000); });
  p.on('close', (code) => finish(code));
});
const queue = [...want];
await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await run(queue.shift()); }));
// One retry (owner-approved, Business-Wrap release notes: flakes get one retry, never fewer assertions). Each failed suite runs once more, alone, after the parallel phase,
// so the retry has the machine to itself. A suite that timed out is not retried (a second 900 s hang would cost the job its budget). Passing on retry keeps the shard green
// and prints a RETRIED line with the first run's first FAIL line, so the flake stays visible.
const retryOn = flag('--no-retry') ? false : flag('--retry') || process.env.CI === 'true';
const retried = [];
if (retryOn) {
  for (const r of results.filter((x) => x.code && x.code !== 124)) {
    const lines = r.out.split('\n');
    const firstFail = (lines.find((l) => /\bFAIL\b/.test(l)) || lines.find((l) => l.trim()) || `exit ${r.code}`).trim();
    const again = await run(r.f, true);
    if (!again.code) {
      Object.assign(r, { code: 0, s: r.s + again.s, out: again.out }); retried.push(`RETRIED ${r.f}: passed on retry (first run failed: ${firstFail})`);
    } else { r.out += `\n----- retry also failed (exit ${again.code}) -----\n` + again.out; r.code = again.code; }
  }
}
const bad = results.filter((r) => r.code);
// every line that is not a PASS (the failing checks with their detail), not the last 6000 characters: a suite that prints many PASS lines after its FAIL hid the FAIL in the CI log
for (const r of bad) console.log(`\n===== ${r.f} (exit ${r.code}) =====\n${r.out.split('\n').filter((l) => !/^\s*PASS\b/.test(l)).join('\n').slice(-30000)}`);
for (const l of retried) console.log(l);
const total = (Date.now() - t0) / 1000;
console.log(`\n${results.length - bad.length}/${results.length} suites ok, wall ${total.toFixed(1)}s, sum ${results.reduce((a, r) => a + r.s, 0).toFixed(1)}s, jobs ${jobs}${retried.length ? `, ${retried.length} passed only on retry` : ''}`);
const times = Object.fromEntries(results.map((r) => [r.f, r.s]));
try { mkdirSync(join(ROOT, 'out'), { recursive: true }); writeFileSync(join(ROOT, 'out', 'suite-times.json'), JSON.stringify(times, null, 1)); } catch {}
if (flag('--record')) { try { writeDurations({ ...readDurations(), ...Object.fromEntries(results.filter((r) => !r.code).map((r) => [r.f, r.s])) }); console.log('recorded -> tests/durations.json'); } catch (e) { console.log('record failed: ' + e.message); } }
process.exit(bad.length ? 1 : 0);
