// tools/recover-history.mjs on a synthetic folder: a document whose log was stripped + its HISTORY\*.bwlog, a decoy
// document with other content, and an untouched one. Dry run matches only the right pair; --apply touches only it.
//
//   node tests/recover-history.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { REPO } from '../engine/export.mjs';
import { dataOf, describe, readFixture } from '../tools/fixtures/history.mjs';
import { scanDocs, scanLogs, match, report, apply } from '../tools/recover-history.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-rec-'));
let n = 0, fails = 0;
const check = (name, ok, detail = '') => { n += 1; if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  recover: ${name}${!ok && detail ? '  - ' + detail : ''}`); };
const BLOCK = /(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/;
const put = (html, d) => html.replace(BLOCK, (_, a, b) => a + JSON.stringify(d).replace(/</g, '\\u003c') + b);

try {
  const html = readFixture(REPO, '0.13.0');
  const d = dataOf(html);
  const svc = d.services[0].id;
  const { doc, log } = d.prov[svc];
  const want = (await describe(html)).logs[svc].entries;
  const folder = path.join(tmp, 'Business-Wrap');
  fs.mkdirSync(path.join(folder, 'HTML'), { recursive: true });
  fs.mkdirSync(path.join(folder, 'HISTORY'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'HISTORY', `${doc}.bwlog`), log);
  // the stripped document: log, mark, contributors, lock gone (what the lossy re-wrap left)
  const { prov, bwlog, contrib, lock, ...stripped } = d;
  const target = put(html, stripped);
  fs.writeFileSync(path.join(folder, 'HTML', 'stripped.html'), target);
  // a decoy: same file, other edits (no op id in common with the log), and an intact one
  const decoy = JSON.parse(JSON.stringify(stripped));
  for (const e of Object.values(decoy.services[0].editions)) e.ops = (e.ops || []).map((o, i) => ({ ...o, id: `zz${i}`, value: `other ${i}` }));
  fs.writeFileSync(path.join(folder, 'HTML', 'decoy.html'), put(html, decoy));
  fs.writeFileSync(path.join(folder, 'HTML', 'intact.html'), html);
  const intactBefore = fs.readFileSync(path.join(folder, 'HTML', 'intact.html'), 'utf8');
  const decoyBefore = fs.readFileSync(path.join(folder, 'HTML', 'decoy.html'), 'utf8');

  const { docs, withHistory } = await scanDocs(folder);
  const { logs, bad } = await scanLogs(folder);
  const pairs = match(docs, logs);
  check('scan: 2 documents without history, 1 with, 1 readable log', docs.length === 2 && withHistory.length === 1 && logs.length === 1 && !bad.length, JSON.stringify([docs.length, withHistory.length, logs.length]));
  const top = pairs[0];
  check('dry run: the stripped file matches its log with confidence 1; the decoy stays below 0.9', top?.doc.file === 'stripped.html' && top.score === 1 && pairs.filter((p) => p.doc.file === 'decoy.html').every((p) => p.score < 0.9), JSON.stringify(pairs.map((p) => [p.doc.file, p.score])));
  const md = report({ folder, docs, withHistory, logs, bad, pairs });
  check('report lists the pair, its confidence and the unmatched documents', md.includes(top.id) && md.includes('| 1 |') && /Documents with no match/.test(md) && md.includes('decoy.html'));

  const r = await apply(folder, top);
  const after = await describe(fs.readFileSync(path.join(folder, 'HTML', 'stripped.html'), 'utf8'));
  check(`apply: the stripped file opens with all ${want} log entries; original backed up byte for byte`, r.ok && after.logs[svc].entries === want && fs.readFileSync(r.backup, 'utf8') === target, JSON.stringify(after.logs));
  check('apply: unapproved files are byte-identical', fs.readFileSync(path.join(folder, 'HTML', 'intact.html'), 'utf8') === intactBefore && fs.readFileSync(path.join(folder, 'HTML', 'decoy.html'), 'utf8') === decoyBefore);

  // a failing apply puts the original back
  const bogus = { ...top, cut: top.cut + 5 };
  fs.writeFileSync(path.join(folder, 'HTML', 'stripped.html'), target);
  let err = '';
  try { await apply(folder, bogus); } catch (e) { err = e.message; }
  check('apply that cannot be verified restores the original', /original put back/.test(err) && fs.readFileSync(path.join(folder, 'HTML', 'stripped.html'), 'utf8') === target, err);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(fails ? `FAILED: recover ${n - fails}/${n}` : `ALL PASS: recover ${n}/${n}`);
process.exit(fails ? 1 : 0);
