import './_isolate.mjs';
// Tests the one-retry in tests/run.mjs against a fake tree (BW_ROOT): flaky -> RETRIED + exit 0, always-failing -> exit 1, passing -> no retry.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const RUN = join(dirname(fileURLToPath(import.meta.url)), 'run.mjs');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '\n' + detail}`); if (!ok) failed++; };
const tree = (suites) => {
  const root = mkdtempSync(join(tmpdir(), 'bw-retry-')); mkdirSync(join(root, 'tests'));
  for (const [n, body] of Object.entries(suites)) writeFileSync(join(root, 'tests', n + '.test.mjs'), body);
  return root;
};
const go = (root, ...a) => {
  const env = { ...process.env, BW_ROOT: root, BW_JOBS: '2' }; delete env.CI;
  const r = spawnSync(process.execPath, [RUN, ...a], { env, encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr };
};
const flaky = (root) => `import {existsSync,writeFileSync} from 'node:fs'; const s=${JSON.stringify(join(root, 'state'))};
if(!existsSync(s)){writeFileSync(s,'1');console.log('FAIL  first time: boom');process.exit(1)} console.log('PASS ok');`;
const pass = "console.log('PASS ok');";
const fail = "console.log('FAIL  always: nope');process.exit(1);";
const mk = (o) => { const root = tree({}); for (const [n, f] of Object.entries(o)) writeFileSync(join(root, 'tests', n + '.test.mjs'), typeof f === 'function' ? f(root) : f); return root; };

let root = mk({ a: pass, b: flaky });
let r = go(root, '--retry');
check('flaky suite: exit 0', r.code === 0, r.out);
check('flaky suite: RETRIED line with first FAIL line', /RETRIED tests\/b\.test\.mjs: passed on retry \(first run failed: FAIL  first time: boom\)/.test(r.out), r.out);
check('passing suite is not retried', !/retry start tests\/a\.test\.mjs/.test(r.out), r.out);
rmSync(root, { recursive: true, force: true });

root = mk({ a: pass, b: fail });
r = go(root, '--retry');
check('always-failing suite: exit 1', r.code === 1, r.out);
check('always-failing suite: retried once, no RETRIED line', (r.out.match(/retry start tests\/b/g) || []).length === 1 && !/RETRIED/.test(r.out), r.out);
rmSync(root, { recursive: true, force: true });

root = mk({ a: pass, c: pass });
r = go(root, '--retry');
check('all passing: exit 0, nothing retried', r.code === 0 && !/retry start/.test(r.out) && !/RETRIED/.test(r.out), r.out);
rmSync(root, { recursive: true, force: true });

root = mk({ b: flaky });
r = go(root);
check('no flag, no CI: flaky suite is not retried (exit 1)', r.code === 1 && !/retry start/.test(r.out), r.out);
rmSync(root, { recursive: true, force: true });

root = mk({ b: flaky });
{ const env = { ...process.env, BW_ROOT: root, CI: 'true' }; const x = spawnSync(process.execPath, [RUN], { env, encoding: 'utf8' });
  check('CI=true retries by default (exit 0)', x.status === 0 && /RETRIED/.test(x.stdout), x.stdout + x.stderr); }
rmSync(root, { recursive: true, force: true });

root = mk({ b: flaky });
{ const env = { ...process.env, BW_ROOT: root, CI: 'true' }; const x = spawnSync(process.execPath, [RUN, '--no-retry'], { env, encoding: 'utf8' });
  check('--no-retry disables it under CI (exit 1)', x.status === 1 && !/retry start/.test(x.stdout), x.stdout + x.stderr); }
rmSync(root, { recursive: true, force: true });

console.log(failed ? `${failed} FAILED` : 'all run-retry checks passed');
process.exit(failed ? 1 : 0);
