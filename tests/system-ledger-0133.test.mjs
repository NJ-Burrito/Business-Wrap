// 0.13.3 TSYS-02: re-opening an unsaved file twice must not raise a tampering alarm, and a real truncation still must.
// Logic only (engine/ledger-v1.mjs + the history route's mirror merge); the served-editor path is scenario H5 of the QA runner.
//
//   node tests/system-ledger-0133.test.mjs
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  system-ledger: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const reasons = (v) => [...new Set(v.issues.map((i) => i.reason))].sort().join(',');
const actor = { id: '7d1f0c5e-0000-4000-8000-0000000000b1', name: 'Mark' };
const eds = { ar: { hash: 'sha256:' + '2'.repeat(64), ops: [] } };
const t0 = Date.parse('2026-10-30T09:00:00.000Z');
const at = (k) => new Date(t0 + k * 1000).toISOString();

const keys = await L.newKeys();
const dh = await L.docHash(eds);
// the file on disk: a past session (open, one edit, saveHtml)
const file = { doc: 'doc-sys-1', entries: [] };
await L.append(file, { kind: 'open', actor, keys, at: at(0), docHash: dh });
await L.append(file, { kind: 'saveHtml', actor, keys, at: at(1), docHash: dh });
const fileLen = file.entries.length;

// session 1 opens the file and closes it unsaved: actor-key (new key) + open + a ping land in the mirror only
const keys2 = await L.newKeys();
const s1 = clone(file);
await L.append(s1, { kind: 'open', actor: { ...actor, id: 'second-actor' }, keys: keys2, at: at(10), docHash: dh });
await L.append(s1, { kind: 'x-active', actor: { ...actor, id: 'second-actor' }, keys: keys2, at: at(11), data: { pings: [at(11)] }, docHash: dh });
const m1 = L.mirrorOf(s1, null, {});
check('the mirror records the kind of every entry', Array.isArray(m1.kinds) && m1.kinds.length === s1.entries.length && m1.kinds.at(-2) === 'open' && m1.kinds.at(-1) === 'x-active', JSON.stringify(m1.kinds));
check('mirrorOf keeps the old kinds when the old head is higher', L.mirrorOf(file, m1, {}).kinds.length === m1.kinds.length);

let v = await L.verify(clone(file), { mirror: m1, editions: eds, saved: true });
check('re-opening the unchanged file after an unsaved session: no tampering alarm', v.ok, reasons(v));

// real truncation: the mirror knows of an edit and a save the file no longer holds
const s2 = clone(file);
await L.append(s2, { kind: 'op', actor, keys, at: at(20), data: { ed: 'ar', op: { op: 'setText', path: '/control/title', value: 'x', old: 'y', id: 'z.0' } }, docHash: dh });
await L.append(s2, { kind: 'saveHtml', actor, keys, at: at(21), docHash: dh });
const m2 = L.mirrorOf(s2, null, {});
v = await L.verify(clone(file), { mirror: m2, editions: eds, saved: true });
check('a real truncation (an edit and a save cut off) still reports truncated', !v.ok && reasons(v).split(',').includes('truncated'), reasons(v));

// an attacker cutting only the tail's last real entry out of a session that also had bookkeeping
const s3 = clone(file);
await L.append(s3, { kind: 'open', actor, keys, at: at(30), docHash: dh });
await L.append(s3, { kind: 'op', actor, keys, at: at(31), data: { ed: 'ar', op: { op: 'setText', path: '/control/title', value: 'x', old: 'y', id: 'z.1' } }, docHash: dh });
const m3 = L.mirrorOf(s3, null, {});
const cut = clone(s3); cut.entries.length = fileLen + 1; // keeps the open, drops the edit
v = await L.verify(cut, { mirror: m3, editions: eds });
check('cutting only an edit off a longer log still reports truncated', !v.ok && reasons(v).split(',').includes('truncated'), reasons(v));

// a mirror from before 0.13.3 has no kinds: the strict rule stays
const old = { ...m1 }; delete old.kinds;
v = await L.verify(clone(file), { mirror: old, editions: eds, saved: true });
check('a mirror without kinds (written by 0.13.2) keeps the strict rule', !v.ok && reasons(v).split(',').includes('truncated'), reasons(v));

// a fork is never excused as bookkeeping
const forked = clone(file); forked.entries[fileLen - 1] = { ...forked.entries[fileLen - 1], hash: 'f'.repeat(64) };
v = await L.verify(forked, { mirror: m1 });
check('a different last entry is still a fork', !v.ok && reasons(v).split(',').includes('fork'), reasons(v));

// the history route keeps the kinds with the head it keeps
const { default: route } = await import('../engine/routes/history.mjs');
const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
const hist = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-sysled-'));
const post = async (mirror) => {
  const body = JSON.stringify({ doc: 'doc-sys-1', log: '{"fmt":"bwlog","v":1,"x":1}', mirror });
  const req = (async function* () { yield Buffer.from(body); })(); req.method = 'POST';
  let sent; await route(req, new URL('http://x/api/history'), (c, b) => { sent = b; }, { workspace: { dirs: { history: hist } } });
  return sent;
};
try {
  await post(m1);
  const kept = await post(L.mirrorOf(file, null, {})); // a lower head arrives later: the old head and its kinds stay
  check('the history route keeps head, hashes and kinds together', kept.mirror.head.seq === m1.head.seq && kept.mirror.kinds.length === m1.kinds.length, JSON.stringify(kept.mirror.kinds));
} finally { fs.rmSync(hist, { recursive: true, force: true }); }

console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  system-ledger: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
