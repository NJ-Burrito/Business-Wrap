// bwlog v1 (design.md §3 A17): canonical-JSON and hash vectors, encrypt/decrypt round-trip, the golden vectors in
// tests/fixtures/bwlog-v1/ (FROZEN: every later version must still read and verify them), the tamper cases each
// detected with its reason, and the same hashes from Node and from headless Chrome running the same file.
//
//   node tests/ledger.test.mjs                  # check
//   node tests/ledger.test.mjs --write-golden   # once, when the fixtures do not exist yet (never overwrites)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const GOLD = path.join(REPO, 'tests', 'fixtures', 'bwlog-v1');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ledger: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const reasons = (v) => [...new Set(v.issues.map((i) => i.reason))].sort().join(',');

const actorA = { id: '7d1f0c5e-0000-4000-8000-00000000000a', name: 'Mark' };
const editions = { ar: { hash: 'sha256:' + '1'.repeat(64), ops: [] } };
async function scripted(keys, actor = actorA, t0 = Date.parse('2026-10-28T09:00:00.000Z')) {
  const log = { doc: 'doc-golden-1', entries: [] };
  const eds = clone(editions);
  const at = (k) => new Date(t0 + k * 20e3).toISOString();
  await L.append(log, { kind: 'open', actor, keys, at: at(0), docHash: await L.docHash(eds) });
  for (let k = 0; k < 3; k += 1) {
    const op = { op: 'setText', path: `/control/title`, value: `title ${k}`, old: k ? `title ${k - 1}` : 'title', id: `g${k}.0`, at: at(k + 1) };
    eds.ar.ops.push(op);
    await L.append(log, { kind: 'op', actor, keys, at: at(k + 1), data: { ed: 'ar', op }, docHash: await L.docHash(eds) });
  }
  await L.append(log, { kind: 'saveHtml', actor, keys, at: at(4), docHash: await L.docHash(eds) });
  return { log, eds };
}

// 1. canonical JSON (RFC 8785) and hash vectors: frozen strings
const JCS = [
  [{ b: 1, a: [true, null, 'x'], c: { z: 0.5, y: -0 } }, '{"a":[true,null,"x"],"b":1,"c":{"y":0,"z":0.5}}'],
  [{ 'é': 1, e: 2, '\u0000': 'nul', ar: 'مرحبا' }, '{"\\u0000":"nul","ar":"مرحبا","e":2,"é":1}'],
  [{ n: 1e21, m: 1e-7, k: 100, u: undefined }, '{"k":100,"m":1e-7,"n":1e+21}'],
];
for (const [v, s] of JCS) check(`canonical ${s.slice(0, 24)}…`, L.canonical(v) === s, L.canonical(v));
const fixedEntry = { seq: 0, prev: '', at: '2026-10-28T09:00:00.000Z', actor: { id: actorA.id, name: 'Mark', kid: '0011223344556677' }, kind: 'open', data: {}, docHash: 'sha256:' + '0'.repeat(64) };
const fixedHash = await L.entryHash(fixedEntry);

// 2. golden vectors: written once, then only read
if (process.argv.includes('--write-golden')) {
  if (fs.existsSync(path.join(GOLD, 'golden.bwlog'))) { console.error('FAIL  golden vectors exist and are frozen; not overwriting'); process.exit(1); }
  fs.mkdirSync(GOLD, { recursive: true });
  const keys = await L.newKeys(true);
  const { log, eds } = await scripted(keys);
  fs.writeFileSync(path.join(GOLD, 'golden.bwlog'), await L.seal(log));
  fs.writeFileSync(path.join(GOLD, 'golden.expect.json'), JSON.stringify({
    doc: log.doc, entries: log.entries.length, kinds: log.entries.map((e) => e.kind), head: log.entries.at(-1).hash,
    editions: eds, kid: keys.kid, jcs: JCS.map(([, s]) => s), fixedEntry, fixedHash,
  }, null, 1) + '\n');
  console.log(`golden vectors written to ${path.relative(REPO, GOLD)}`);
}
const G = JSON.parse(fs.readFileSync(path.join(GOLD, 'golden.expect.json'), 'utf8'));
const goldEnv = fs.readFileSync(path.join(GOLD, 'golden.bwlog'), 'utf8');
check('fixed entry hash is the frozen vector', fixedHash === G.fixedHash, fixedHash);
check('canonical strings are the frozen vectors', JSON.stringify(JCS.map(([v]) => L.canonical(v))) === JSON.stringify(G.jcs));
const env = JSON.parse(goldEnv);
check('golden envelope header v1', env.fmt === 'bwlog' && env.v === 1 && env.alg === 'A256GCM' && env.kdf === 'HKDF-SHA256' && L.b64 && atob(env.salt).length === 16 && atob(env.iv).length === 12);
const gold = await L.unseal(goldEnv, G.doc);
check('golden vectors decrypt', gold.entries.length === G.entries && gold.entries.at(-1).hash === G.head && JSON.stringify(gold.entries.map((e) => e.kind)) === JSON.stringify(G.kinds));
const gv = await L.verify(gold, { editions: G.editions });
check('golden vectors verify (chain, signatures, state)', gv.ok && gv.kids[0] === G.kid, JSON.stringify(gv.issues));

// 3. round trip
const keysA = await L.newKeys();
const { log, eds } = await scripted(keysA);
const sealed = await L.seal(log);
const back = await L.unseal(sealed, log.doc);
check('encrypt/decrypt round-trip', JSON.stringify(back) === JSON.stringify(log));
check('envelope is not readable by hand', !sealed.includes('Mark') && !sealed.includes('title 1'));
check('fresh salt and iv on every write', JSON.parse(await L.seal(log)).iv !== JSON.parse(sealed).iv);
let wrongDoc = '';
try { await L.unseal(sealed, 'another-doc'); } catch (e) { wrongDoc = e.name || 'error'; }
check('the envelope is bound to its document (AAD)', !!wrongDoc);
const ok = await L.verify(log, { editions: eds });
check('an honest log verifies', ok.ok, JSON.stringify(ok.issues));

// 4. tamper cases (design.md A17 + TASKS.md decisions): each detected with its reason
const mirror = L.mirrorOf(log, null, ok.pins);
async function tamper(name, mutate, want, opts = {}) {
  const t = clone(log);
  const e2 = clone(eds);
  await mutate(t, e2);
  const v = await L.verify(t, { editions: e2, ...opts });
  check(`tamper: ${name} → ${want}`, !v.ok && reasons(v).split(',').includes(want), reasons(v) || 'not detected');
}
await tamper('edited entry', (t) => { t.entries[2].data.op.value = 'forged'; }, 'hash');
await tamper('edited entry, re-hashed (forged signature)', async (t) => { t.entries[2].data.op.value = 'forged'; t.entries[2].hash = await L.entryHash(t.entries[2]); }, 'sig');
await tamper('deleted entry', (t) => { t.entries.splice(2, 1); }, 'link');
await tamper('reordered entries', (t) => { [t.entries[2], t.entries[3]] = [t.entries[3], t.entries[2]]; }, 'seq');
await tamper('truncated vs the mirror', (t) => { t.entries.length = 3; }, 'truncated', { mirror });
await tamper('unlogged edit (op added to the data block)', (t, e) => { e.ar.ops.push({ op: 'setText', path: '/control/title', value: 'sneaky', id: 'zz.0' }); }, 'unlogged');
await tamper('stripped log', (t) => { t.entries = []; }, 'stripped', { mirror });
const keysX = await L.newKeys();
await tamper('re-signed chain, new key, same actor id', async (t) => { const r = await scripted(keysX); t.entries = r.log.entries; }, 'tofu', { mirror });
await tamper('re-signed chain is also a fork of the mirror head', async (t) => { const r = await scripted(keysX, actorA, Date.parse('2026-10-28T10:00:00.000Z')); t.entries = r.log.entries; }, 'fork', { mirror });
await tamper('entry signed by a key that is not the logged one', async (t) => {
  const e = t.entries[3]; e.data.op.value = 'x'; e.hash = await L.entryHash(e);
  const k = await L.newKeys(); e.sig = L.b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, Uint8Array.from(e.hash.match(/../g), (h) => parseInt(h, 16)))));
}, 'sig');
const m2 = L.mirrorOf({ doc: log.doc, entries: log.entries.slice(0, 2) }, mirror, {});
check('the mirror head never moves back', m2.head.seq === mirror.head.seq && m2.head.hash === mirror.head.hash);

// 5. metrics come from the log: 10 edits over a scripted 3 minutes = 10 edits, 3 min active
const mlog = { doc: 'm', entries: [] };
const t0 = Date.parse('2026-10-28T09:00:00.000Z');
for (let k = 0; k < 10; k += 1) await L.append(mlog, { kind: 'op', actor: actorA, keys: keysA, at: new Date(t0 + k * 20e3).toISOString(), data: { ed: 'ar', op: { op: 'setText', path: '/p', value: 'a b', old: 'a', id: `m${k}.0` } } });
const met = L.metrics(mlog.entries)[actorA.id];
check('metrics: 10 edits over 3 min = 10 edits, 3 min active', met.edits === 10 && met.activeMs === 180e3 && met.added === 10, JSON.stringify(met));

// 6. Node and the browser: same file, byte-identical hashes, and the browser verifies the golden vectors
const src = fs.readFileSync(path.join(REPO, 'engine', 'ledger-v1.mjs'), 'utf8').replace(/^export /gm, '');
const browser = await chromium.launch(launchOptions());
try {
  const page = await browser.newPage();
  const blank = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ledger-')), 'blank.html');
  fs.writeFileSync(blank, '<!doctype html><title>ledger</title>');
  await page.goto(pathToFileURL(blank).href); // file:// is a secure context (crypto.subtle); about:blank is not
  const nodeHashes = { fixed: fixedHash, entries: await Promise.all(log.entries.map((e) => L.entryHash(e))), doc: await L.docHash(eds), kid: await L.kidOf(keysA.jwk) };
  const br = await page.evaluate(async ({ src, log, eds, fixedEntry, goldEnv, G, jwk }) => {
    const BW = new Function(`${src}\nreturn BWLOG1;`)();
    const g = await BW.unseal(goldEnv, G.doc);
    const v = await BW.verify(g, { editions: G.editions });
    const own = await BW.verify(log, { editions: eds });
    return { fixed: await BW.entryHash(fixedEntry), entries: await Promise.all(log.entries.map((e) => BW.entryHash(e))), doc: await BW.docHash(eds), kid: await BW.kidOf(jwk), goldOk: v.ok, ownOk: own.ok };
  }, { src, log, eds, fixedEntry, goldEnv, G, jwk: keysA.jwk });
  check('node and browser hashes byte-identical', JSON.stringify({ ...br, goldOk: undefined, ownOk: undefined }) === JSON.stringify(nodeHashes), JSON.stringify(br).slice(0, 200));
  check('the browser verifies the golden vectors and a Node-signed log', br.goldOk && br.ownOk);
  const fromBrowser = await page.evaluate(async ({ src, doc }) => {
    const BW = new Function(`${src}\nreturn BWLOG1;`)();
    const k = await BW.newKeys();
    const log = { doc, entries: [] };
    await BW.append(log, { kind: 'open', actor: { id: 'b', name: 'Alaa' }, keys: k });
    await BW.append(log, { kind: 'sign', actor: { id: 'b', name: 'Alaa' }, keys: k, data: { docHash: 'sha256:x' } });
    return BW.seal(log);
  }, { src, doc: 'from-browser' });
  const fb = await L.unseal(fromBrowser, 'from-browser');
  check('Node decrypts and verifies a browser-written log', (await L.verify(fb)).ok && fb.entries.length === 3);
} finally { await browser.close(); }

{ // review2 #17: the 0.13 traces, read the same way by the editor, the gate and the CLI (logic only: the v1 format is unchanged)
  const html = `<!doctype html>\n<html lang="ar" data-bw-ledger="doc-1" dir="rtl"><head><meta charset="utf-8">\n<meta name="bw-ledger" content="bwlog/v1 doc=doc-1 state=sha256:ab">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-T' 'sha256-APP'; style-src 'unsafe-inline'"></head><body></body></html>`;
  const data = { version: '0.13.1', bwlog: 1, services: [{ id: 's', editions: { ar: { ops: [{}], marks: [{ kind: 'saveHtml' }] } } }] };
  check('traces: all six found in a 0.13 Save-HTML', L.traces(data, 's', html, { version: true }).join() === 'mark,timeline,meta,root,csp,version');
  check('traces: the version is ignored unless the file is read as written', !L.traces(data, 's', html).includes('version'));
  check('traces: a pre-0.13 file (one CSP hash, no mark, 0.12) has none', L.traces({ version: '0.12.3', services: [{ id: 's', editions: { ar: { ops: [{}] } } }] }, 's', `<html lang="ar"><head><meta http-equiv="Content-Security-Policy" content="script-src 'sha256-APP'"></head>`, { version: true }).length === 0);
  check('traceDoc: the document id the head meta names', L.traceDoc(html) === 'doc-1' && L.traceDoc('<head></head>') === '');
}
{ // review2 #11/#12: metrics count every written file (export + Save-HTML) and keep every name one profile key used
  const k = await L.newKeys();
  const log = { doc: 'm', entries: [] };
  const a = { id: 'key-1', name: 'Mark' };
  await L.append(log, { kind: 'export', actor: a, keys: k, data: { fmt: 'pdf' } });
  await L.append(log, { kind: 'saveHtml', actor: a, keys: k });
  await L.append(log, { kind: 'x-rename', actor: { ...a, name: 'Sami' }, keys: k, data: { from: 'Mark', to: 'Sami' } });
  await L.append(log, { kind: 'sign', actor: { ...a, name: 'Sami' }, keys: k });
  const m = L.metrics(log.entries)['key-1'];
  check('metrics: exports = PDF/DOCX/report exports + HTML saves; one key keeps every name, latest first shown', m.exports === 2 && m.signs === 1 && m.name === 'Sami' && m.names.join() === 'Mark,Sami' && (await L.verify(log)).ok, JSON.stringify(m));
}

console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  ledger: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
