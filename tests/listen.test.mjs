// Listen engine (engine/listen/listen.py): the pure logic (VAD chunk merging, decoding-loop detection and collapse,
// overlap owner, enrollment threshold and margin) through its --selftest. No models, no audio, no network.
//
//   node tests/listen.test.mjs
import './_isolate.mjs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO } from '../engine/export.mjs';

const r = spawnSync('python', [path.join(REPO, 'engine', 'listen', 'listen.py'), '--selftest'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
const ok = r.status === 0 && /listen selftest: PASS/.test(r.stdout);
console.log(`${ok ? 'PASS' : 'FAIL'}  listen: selftest${ok ? '' : '  — ' + (r.stderr || r.stdout || r.error?.message || '').trim().slice(-400)}`);
process.exit(ok ? 0 : 1);
