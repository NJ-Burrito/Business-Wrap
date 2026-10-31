// Fix-loop helper: what failed on GitHub for HEAD, re-run only that locally. No model calls.
//   npm run ci:failed                 latest gates run for HEAD -> failing suites -> run them here (serial) -> table
//   npm run ci:failed -- --sha <sha>  a different commit
//   npm run ci:failed -- --run <id>   a specific run id
//   npm run ci:failed -- --push       push main, but only when every failing suite passes locally
//   npm run ci:failed -- --dry        print what would run, run nothing
// Needs the gh CLI, logged in. A suite that fails only on Linux can pass here on Windows: the table says so,
// and tools/ci/linux-run.ps1 is the Linux check.
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i < 0 ? null : args[i + 1]; };
const sh = (cmd, a, opt = {}) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opt });
const die = (m, c = 2) => { console.error(m); process.exit(c); };

const SUITE = /\b((?:tests|mcp\/test)\/[\w.-]+\.test\.mjs)\b/g;

// Pure: failing suite files from a `gh run view --log-failed` text. Only lines run.mjs prints for a failure count
// ("FAIL   12.3s tests/x.test.mjs" and "===== tests/x.test.mjs (exit 1) ====="), not every path mentioned in a stack.
export function failingSuites(log) {
  const out = new Set();
  for (const line of log.split('\n')) {
    if (!/(^|\s)FAIL\s+[\d.]+s\s|=====\s.*\(exit \d+\)/.test(line)) continue;
    for (const m of line.matchAll(SUITE)) out.add(m[1]);
  }
  return [...out].sort();
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();

async function main() {
  try { sh('gh', ['--version']); } catch { die('gh CLI not found on PATH (https://cli.github.com), cannot read the CI run.'); }
  const sha = val('--sha') || sh('git', ['rev-parse', 'HEAD']).trim();
  let runId = val('--run');
  if (!runId) {
    const list = JSON.parse(sh('gh', ['run', 'list', '--workflow', 'gates.yml', '--commit', sha, '--limit', '5', '--json', 'databaseId,status,conclusion,createdAt,headBranch']));
    if (!list.length) die(`No gates run found for ${sha.slice(0, 8)} (not pushed yet?).`);
    const r = list[0];
    console.log(`gates run ${r.databaseId} for ${sha.slice(0, 8)} (${r.headBranch}): ${r.status}${r.conclusion ? ' / ' + r.conclusion : ''}`);
    if (r.status !== 'completed') die('Run still in progress; ci:failed reads finished runs. Try again when it ends (gh run watch ' + r.databaseId + ').', 3);
    if (r.conclusion === 'success') { console.log('Nothing failed.'); process.exit(0); }
    runId = String(r.databaseId);
  }
  const view = JSON.parse(sh('gh', ['run', 'view', runId, '--json', 'jobs']));
  const badJobs = view.jobs.filter((j) => j.conclusion === 'failure').map((j) => j.name);
  console.log('failed jobs: ' + (badJobs.join(', ') || 'none'));
  const log = sh('gh', ['run', 'view', runId, '--log-failed']);
  const suites = failingSuites(log);
  const otherJobs = badJobs.filter((n) => !/^tests \(shard/.test(n) && n !== 'gates');
  if (otherJobs.length) console.log(`non-test jobs failed (${otherJobs.join(', ')}): run them locally, e.g. python security/check.py, node update/version-sync.mjs, node tools/release/history-gate.mjs, node engine/build-skill-html.mjs --check`);
  if (!suites.length) die('No failing test suites found in the log' + (otherJobs.length ? ' (the failure is in the non-test jobs above).' : '; open it with: gh run view ' + runId + ' --log-failed'), otherJobs.length ? 1 : 3);
  console.log('failing suites: ' + suites.join(' '));
  if (flag('--dry')) process.exit(0);

  const p = spawnSync(process.execPath, ['tests/run.mjs', ...suites, '--serial'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const rows = [];
  for (const line of (p.stdout || '').split('\n')) { const m = /^(ok  |FAIL)\s+([\d.]+)s\s+(\S+)/.exec(line); if (m) rows.push({ f: m[3], ok: m[1].trim() === 'ok', s: m[2] }); }
  const w = Math.max(5, ...suites.map((s) => s.length));
  console.log('\n' + 'suite'.padEnd(w) + '  here   ci    secs');
  for (const f of suites) { const r = rows.find((x) => x.f === f); console.log(f.padEnd(w) + '  ' + (r ? (r.ok ? 'pass' : 'FAIL') : 'n/a ') + '   FAIL  ' + (r ? r.s : '-')); }
  const bad = suites.filter((f) => { const r = rows.find((x) => x.f === f); return !r || !r.ok; });
  if (bad.length) {
    console.log('\n' + (p.stdout || '').split('\n').filter((l) => l.startsWith('=====') || bad.some((b) => l.includes(b))).slice(0, 8).join('\n'));
    console.log(`\n${bad.length} still failing locally. Fix, then run ci:failed again (re-runs only these).`);
    process.exit(1);
  }
  console.log('\nAll failing suites pass here. Note: a suite that failed only on Linux can pass on Windows; tools/ci/linux-run.ps1 is the Linux check.');
  if (flag('--push')) {
    const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    if (branch !== 'main') die(`--push pushes main only; you are on ${branch}.`);
    if (sh('git', ['status', '--porcelain', '--untracked-files=no']).trim()) die('--push: tracked changes are uncommitted; commit them first.');
    console.log(sh('git', ['push', 'origin', 'main']));
  }
}
