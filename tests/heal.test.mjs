// B4 healers and per-stage gates (0.13.0). Each healer is triggered by a fixture failure → one HEALED line in the
// heal log and the step completes (verdict HEALED, never PASS); a broken signature, a gate failure and a missing
// document code FAIL with no heal attempt. Only locators and waits heal in a browser walk (a real headless page).
//
//   node tests/heal.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'out', 'heal-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
process.env.BW_HEAL_LOG = path.join(OUT, 'heal-log.jsonl');
const H = await import('../engine/heal/index.mjs');
const G = await import('../engine/heal/gates.mjs');
const { launchOptions, loadPlaywright } = await import('../engine/export.mjs');

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const lines = () => H.readHealLog().length;
/** run one healer: it must complete, log exactly one HEALED line, and its step verdict must be HEALED */
async function healed(name, fn, okValue) {
  const before = lines();
  let v, err;
  try { v = await fn(); } catch (e) { err = e; }
  const log = H.readHealLog().slice(before);
  const verdict = H.verdictOf({ error: err, healed: v?.healed });
  check(`${name}: step completes, HEALED logged, verdict HEALED (not PASS)`, !err && log.length === 1 && log[0].verdict === 'HEALED' && verdict === 'HEALED' && okValue(v), `${verdict} log=${JSON.stringify(log)} ${err?.message || ''}`);
  return v;
}
async function failsNoHeal(name, fn) {
  const before = lines();
  let err;
  try { await fn(); } catch (e) { err = e; }
  check(`${name}: FAIL, no heal attempted`, !!err && /FAIL/.test(err.message) && lines() === before, err?.message || 'no error');
}

let browser;
try {
  // ── browser walk: locator and wait (a real page) ──
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch(launchOptions());
  const page = await browser.newPage();
  await page.setContent('<main><button>Next</button><button>Back</button><label>Name <input></label><p>Two</p><p>Two</p></main>');
  await healed('crawl locator (selector gone → role+name)', () => H.healLocator(page, { selector: '#next-old', role: 'button', name: 'Next' }), async (v) => (await v.locator.innerText()) === 'Next');
  await healed('crawl locator (→ label)', () => H.healLocator(page, { selector: '#name-old', label: 'Name' }), (v) => !!v.locator);
  const plain = await H.healLocator(page, { selector: 'button' });
  check('a locator that still matches is not healed (PASS)', plain.healed === false && H.verdictOf(plain) === 'PASS');
  await failsNoHeal('crawl locator: ambiguous fallback (structural change)', () => H.healLocator(page, { selector: '#gone', text: 'Two' }));
  await failsNoHeal('crawl locator: nothing matches', () => H.healLocator(page, { selector: '#gone', role: 'button', name: 'Pay' }));
  await page.evaluate(() => setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<div id="late">late</div>'), 700));
  await healed('crawl wait (extended once to the ceiling)', () => H.healWait((t) => page.locator('#late').waitFor({ timeout: t }), { base: 200, ceiling: 3000 }), (v) => v.healed);
  {
    let e;
    try { await H.healWait((t) => page.locator('#never').waitFor({ timeout: t }), { base: 100, ceiling: 300 }); } catch (x) { e = x; }
    check('crawl wait: a second timeout fails', !!e && /timeout/i.test(e.message));
  }

  // ── host, library, workspace, fonts ──
  const busy = net.createServer();
  await new Promise((ok) => busy.listen(0, '127.0.0.1', ok)); // any free port, then held busy: never a clash with a running host
  const BUSY = busy.address().port;
  await healed('host port busy → next free port', () => H.healPort(BUSY), (v) => v.port > BUSY);
  busy.close();
  const rec = path.join(OUT, 'hosts.json');
  fs.writeFileSync(rec, JSON.stringify({ hosts: [{ pid: 999999, port: 1 }, { pid: process.pid, port: 2 }] }));
  await healed('stale host record', () => H.healStaleHosts(rec), (v) => v.hosts.length === 1 && v.hosts[0].pid === process.pid);
  await healed('library schema migration (bare array → v1)', () => H.healLibrary([{ id: 'a' }]), (v) => v.lib.version === 1 && v.lib.docs.length === 1);
  await failsNoHeal('library from a newer version', () => H.healLibrary({ version: 99, docs: [] }));
  await healed('workspace folder missing → created', () => H.healWorkspace(path.join(OUT, 'ws', 'Business-Wrap')), (v) => fs.existsSync(v.dir));
  await healed('font not installed → bundled Thmanyah', () => H.healFont('No Such Face', () => false), (v) => v.family === 'Thmanyah Serif Text');
  await healed('Cairo is never a face: replaced by Thmanyah', () => H.healFont('Cairo', () => true), (v) => !/cairo/i.test(v.family));

  // ── never heal: signature, hash, gate, document code ──
  await failsNoHeal('broken signature', () => H.refuse('signature', 'ed25519 signature does not verify'));
  await failsNoHeal('broken hash chain', () => H.refuse('hash', 'entry 3 prev hash mismatch'));
  {
    let e;
    try { H.refuse('locator', 'x'); } catch (x) { e = x; }
    check('refuse() takes only never-heal kinds', /not a never-heal kind/.test(e?.message || ''));
  }
  {
    const before = lines();
    const g = G.gateDocument({ control: { title: 'x' }, chapters: [{ title: 'c', sections: [] }] });
    check('gate: a missing document code FAILs, the gate does not heal', g.verdict === 'FAIL' && g.problems.some((p) => /document code/.test(p)) && lines() === before, JSON.stringify(g.problems));
  }

  // ── per-stage gates ──
  const ir = { kind: 'bw-process', steps: [{ id: 's', type: 'task' }], flows: [] };
  check('gate harvest: a process IR PASSes, garbage FAILs', G.gateHarvest(ir).verdict === 'PASS' && G.gateHarvest({ foo: 1 }).verdict === 'FAIL');
  check('gate harvest: a crawl harvest PASSes', G.gateHarvest({ languages: { en: { steps: [] } } }).verdict === 'PASS');
  check('gate evidence: a ledger row without a disposition FAILs', G.gateEvidence({ ledger: [{ kind: 'field', id: 'a', disposition: 'drawn' }, { kind: 'field', id: 'b' }] }).verdict === 'FAIL' && G.gateEvidence({ ledger: [{ kind: 'x', id: 'a', disposition: 'drawn' }] }).verdict === 'PASS');
  check('gate document: the sample PASSes', G.gateDocument(path.join(REPO, 'samples', 'event-permit', 'document.ar.json')).verdict === 'PASS');
  const f = path.join(OUT, 'a.ar.pdf');
  fs.writeFileSync(f, '%PDF-1.4');
  check('gate export: files present + both editions asked → the missing edition FAILs', G.gateExport([f], { editions: ['ar'] }).verdict === 'PASS' && G.gateExport([f], { editions: ['ar', 'en'] }).verdict === 'FAIL');
  const lg = await G.gateLedger(f);
  check('gate ledger: WP4\'s verify, or SKIP when it is not in this build (never PASS by default)', lg.verdict === 'SKIP' || lg.verdict === 'FAIL', lg.verdict);
  { fs.copyFileSync(path.join(REPO, 'tests', 'fixtures', 'bwlog-v1', 'golden.bwlog'), path.join(OUT, 'golden.bwlog')); fs.writeFileSync(path.join(OUT, 'golden.heads.json'), JSON.stringify({ doc: 'doc-golden-1' }));
    const g = await G.gateLedger(path.join(OUT, 'golden.bwlog')); check('gate ledger: the golden bwlog v1 file PASSes', g.verdict === 'PASS', JSON.stringify(g.problems)); }
  check('every HEALED line names its stage and healer', H.readHealLog().every((l) => l.verdict === 'HEALED' && l.stage && l.name && l.at));
} catch (e) {
  check('heal run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser?.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
