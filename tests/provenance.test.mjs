// A13 provenance + A16 lock/share + A17 detection in the editor (design.md §3): two people in two browser contexts
// pass one Save-HTML back and forth (Mark edits, signs and locks → Alaa opens it locked, unlocks with the warning and
// edits → Mark opens hers): every open, op (exact diff), sign, lock, unlock and Save-HTML is in the log with its name,
// the chain verifies and the lock survives the file. A hand-tampered file (edited entry, unlogged edit, stripped log)
// is flagged on open. Exports (PDF + DOCX) carry no provenance and no contributor fingerprint. Served: share writes
// the HTML into the workspace folder and the mirror into HISTORY.
//
//   node tests/provenance.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { serve } from '../engine/serve.mjs';
import { config } from '../engine/config.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-prov-'));
const results = [];
let failed = 0;
const step = (s) => process.env.PV_DEBUG && console.error('step', s);
const check = (name, ok, detail = '') => { step(name); results.push(`${ok ? 'PASS' : 'FAIL'}  provenance: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'prov.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'prov-test', watermarkDir: null });

const profile = (name) => `localStorage.setItem('bw:profile', JSON.stringify({ name: ${JSON.stringify(name)}, activity: true }));`;
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [String(fn), arg]);
// the log's queue must settle: a hang fails the run instead of stalling it
const ready = (page) => page.waitForFunction(() => window.BW?.ready && window.BW.EXT.ledger?.log()).then(() => page.evaluate(() => Promise.race([window.BW.EXT.ledger.ready(), new Promise((_, no) => setTimeout(() => no(new Error('ledger queue did not settle in 20 s')), 20000))])));
const entries = (page) => page.evaluate(() => window.BW.EXT.ledger.log().entries);
const verdict = (page) => page.evaluate(() => window.BW.EXT.ledger.log().verdict);
async function saveHtmlOf(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
  const f = path.join(tmp, name);
  await dl.saveAs(f);
  return f;
}
const setTitle = (page, v) => page.evaluate((v) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return window.BW.commit([{ op: 'setText', path: '/control/title', value: v, old: e.doc.control.title }]); }, v);
const dataOf = (html) => JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html)[1]);
const withData = (html, d) => html.replace(/(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(d).replace(/</g, '\\u003c') + b);

const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const ctxA = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  const ctxB = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  await ctxA.addInitScript(profile('Mark'));
  await ctxB.addInitScript(profile('Alaa'));
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

  // Mark: three edits, a signature, a lock, Save-HTML
  const a = await ctxA.newPage(); watch(a);
  await a.goto(pathToFileURL(file).href);
  step('goto a');
  await ready(a);
  step('ready a');
  for (const v of ['Permit one', 'Permit two', 'Permit three']) await setTitle(a, v);
  await a.evaluate(() => { window.BW.runAction('pvSign'); }); // resolves after the dialog: not awaited here
  await a.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  await sh(a, (r) => r.querySelector('.bw-modal [data-mk="ok"]').click());
  await a.waitForFunction(() => window.BW.EXT.ledger.log().entries.some((e) => e.kind === 'sign'));
  await a.evaluate(() => window.BW.runAction('lkToggle'));
  await a.evaluate(() => window.BW.EXT.ledger.ready());
  const fileA = await saveHtmlOf(a, 'mark.editor.html');
  const htmlA = fs.readFileSync(fileA, 'utf8');
  const dA = dataOf(htmlA);
  check('Save-HTML carries the encrypted log, the lock and the contributor mark', !!dA.prov?.[dA.services[0].id]?.log && dA.lock?.[dA.services[0].id]?.locked === true && dA.contrib?.length === 1 && !htmlA.includes('"kind":"op"'));
  const eA = await entries(a);
  check('Mark\'s log: key, open, 3 ops, sign, lock, Save-HTML', JSON.stringify(eA.map((e) => e.kind)) === JSON.stringify(['actor-key', 'open', 'op', 'op', 'op', 'sign', 'lock', 'saveHtml']), eA.map((e) => e.kind).join(','));
  const opsA = await a.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops);
  const logged = eA.filter((e) => e.kind === 'op').map((e) => e.data.op);
  check('every op entry is the exact diff (op, path, old, value, id)', logged.length === opsA.length && logged.every((o, i) => ['op', 'path', 'old', 'value', 'id'].every((k) => o[k] === opsA[i][k])), JSON.stringify(logged[0]));

  // Alaa opens Mark's file: locked, history intact
  const b = await ctxB.newPage(); watch(b);
  await b.goto(pathToFileURL(fileA).href);
  await ready(b);
  check('Alaa: the chain verifies', (await verdict(b)).ok, JSON.stringify(await verdict(b)));
  const banner = await sh(b, (r) => r.querySelector('.lk-banner')?.textContent || '');
  check('Alaa: the shared file stays locked, the banner names Mark', banner.includes('Mark'), banner);
  const before = await b.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const refused = await b.evaluate(() => { try { window.BW.setText('/control/title', 'nope'); return 'changed'; } catch (e) { return e.refused ? 'refused' : e.message; } });
  const after = await b.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  check('Alaa: locked → setText refused, ops unchanged', refused === 'refused' && before === after, `${refused} ${before}→${after}`);
  const tools = await sh(b, (r) => { const x = r.querySelector('[data-a="addPara"]'); return x ? x.disabled : null; });
  check('Alaa: editing tools are disabled while locked', tools === true, String(tools));
  await b.evaluate(() => { window.BW.runAction('lkToggle'); });
  await b.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  const warn = await sh(b, (r) => r.querySelector('.bw-modal .lk-warn')?.textContent || '');
  check('Alaa: unlock shows the warning dialog (no password)', /Mark|owner|صاحب/.test(warn) && !(await sh(b, (r) => !!r.querySelector('.bw-modal input[type="password"]'))), warn);
  await sh(b, (r) => r.querySelector('.bw-modal [data-mk="ok"]').click());
  await b.waitForFunction(() => window.BW.EXT.ledger.log().entries.some((e) => e.kind === 'unlock'));
  await setTitle(b, 'Permit four (Alaa)');
  await b.evaluate(() => window.BW.EXT.ledger.ready());
  const fileB = await saveHtmlOf(b, 'alaa.editor.html');
  const eB = await entries(b);
  const names = eB.map((e) => `${e.actor.name}:${e.kind}`);
  check('Alaa\'s log continues Mark\'s: Mark\'s entries, then Alaa open/unlock/op/Save-HTML', names.slice(0, 8).every((n) => n.startsWith('Mark:')) && ['Alaa:open', 'Alaa:unlock', 'Alaa:op', 'Alaa:saveHtml'].every((n) => names.includes(n)), names.join(' '));

  // Mark opens Alaa's file: everything visible, with names; drawer lists both
  const a2 = await ctxA.newPage(); watch(a2);
  await a2.goto(pathToFileURL(fileB).href);
  await ready(a2);
  const v2 = await verdict(a2);
  check('Mark opens Alaa\'s copy: chain verifies, extends his mirror', v2.ok, JSON.stringify(v2));
  await a2.evaluate(() => window.BW.openDrawer('provenance'));
  const dr = await sh(a2, (r) => ({ text: r.querySelector('.drawer').textContent, n: r.querySelectorAll('.drawer .pv-e').length, details: r.querySelectorAll('.drawer .pv-e details').length, rows: r.querySelectorAll('.drawer .pv-people tbody tr').length }));
  check('Provenance tab: every entry, expandable, both contributors', dr.n >= 13 && dr.details === dr.n && dr.rows === 2 && dr.text.includes('Alaa') && dr.text.includes('Mark'), JSON.stringify({ ...dr, text: dr.text.slice(0, 80) }));
  await a2.evaluate(() => window.BW.openDrawer('history'));
  await a2.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .pv-tabs [data-pv="tab-prov"]'));
  await sh(a2, (r) => r.querySelector('.drawer [data-pv="tab-prov"]').click());
  check('«المصدر» is a tab of the Changes drawer', (await a2.evaluate(() => window.BW.S.drawer)) === 'provenance' && (await sh(a2, (r) => r.querySelector('.drawer [data-pv="tab-prov"]')?.getAttribute('aria-pressed'))) === 'true');
  check('authorOf(opId) names the author of an op', (await a2.evaluate((id) => window.BW.EXT.ledger.authorOf(id), opsA[0].id)) === 'Mark');

  // tampered files, opened by Mark (his mirror and pinned keys are on this machine)
  const htmlB = fs.readFileSync(fileB, 'utf8');
  const dB = dataOf(htmlB);
  const svc = dB.services[0].id;
  const doc = dB.prov[svc].doc;
  const logB = await L.unseal(dB.prov[svc].log, doc);
  async function opened(name, html) {
    const f = path.join(tmp, name); fs.writeFileSync(f, html);
    const p = await ctxA.newPage(); watch(p);
    await p.goto(pathToFileURL(f).href);
    await ready(p);
    const v = await verdict(p);
    const toast = await sh(p, (r) => r.querySelector('.toasts')?.textContent || '');
    await p.close();
    return { v, toast, reasons: v.issues.map((i) => i.reason) };
  }
  const edited = JSON.parse(JSON.stringify(logB)); edited.entries.find((e) => e.kind === 'op').data.op.value = 'forged title';
  let r = await opened('t-edited.html', withData(htmlB, { ...dB, prov: { [svc]: { doc, log: await L.seal(edited) } } }));
  check('tamper: an edited entry is flagged on open (banner)', r.reasons.includes('hash') && /tamper|عبث/.test(r.toast), JSON.stringify(r));
  const sneaky = JSON.parse(JSON.stringify(dB)); const ed0 = Object.keys(sneaky.services[0].editions)[0];
  sneaky.services[0].editions[ed0].ops.push({ op: 'setText', path: '/control/subtitle', value: 'unlogged', id: 'zz.0' });
  r = await opened('t-unlogged.html', withData(htmlB, sneaky));
  check('tamper: an unlogged edit in the data block is flagged', r.reasons.includes('unlogged'), JSON.stringify(r));
  const { prov, ...stripped } = dB;
  r = await opened('t-stripped.html', withData(htmlB, stripped));
  check('tamper: a stripped log is flagged', r.reasons.includes('stripped'), JSON.stringify(r));
  const trunc = JSON.parse(JSON.stringify(logB)); trunc.entries.length = 6;
  r = await opened('t-truncated.html', withData(htmlB, { ...dB, prov: { [svc]: { doc, log: await L.seal(trunc) } } }));
  check('tamper: a truncated log is flagged against this machine\'s mirror', r.reasons.includes('truncated'), JSON.stringify(r));

  // exports carry no provenance and no contributor fingerprint
  const docNow = await a2.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc);
  const edNow = await a2.evaluate(() => window.BW.S.ed);
  const pdf = path.join(tmp, 'x.pdf'), docx = path.join(tmp, 'x.docx');
  await exportPdf(docNow, { locale: edNow, theme: loadTheme(), pdfPath: pdf, browser });
  exportDocx(docNow, { locale: edNow, theme: loadTheme(), docxPath: docx });
  const kids = [...new Set(logB.entries.map((e) => e.actor.kid))], ids = [...new Set(logB.entries.map((e) => e.actor.id))];
  const marks = [...kids, ...ids, 'bwlog', 'bw-prov', 'data-bw-contrib', '"prov"'];
  const pdfBytes = fs.readFileSync(pdf, 'latin1');
  const pop = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdftotext.exe')));
  const pdfText = spawnSync(pop ? path.join(pop, 'pdftotext') : 'pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  const unz = spawnSync('python', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("".join(z.read(n).decode("utf8","replace") for n in z.namelist() if n.endswith(".xml") or n.endswith(".rels")))', docx], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '';
  check('PDF export: no provenance, no contributor fingerprint', pdfText.length > 100 && marks.every((m) => !pdfBytes.includes(m) && !pdfText.includes(m)), marks.find((m) => pdfBytes.includes(m) || pdfText.includes(m)) || `text ${pdfText.length}`);
  check('DOCX export: no provenance, no contributor fingerprint', unz.length > 1000 && marks.every((m) => !unz.includes(m)), marks.find((m) => unz.includes(m)) || `xml ${unz.length}`);

  // served: share writes into the workspace HTML folder, the mirror into HISTORY
  const dirs = { pdf: path.join(tmp, 'ws', 'PDF'), docx: path.join(tmp, 'ws', 'DOCX'), html: path.join(tmp, 'ws', 'HTML'), history: path.join(tmp, 'ws', 'HISTORY') };
  const served = path.join(tmp, 'served', 'prov.editor.html');
  fs.mkdirSync(path.dirname(served), { recursive: true });
  fs.copyFileSync(fileB, served);
  server = await serve(served, 0, { workspace: { dirs } });
  const s = await ctxA.newPage(); watch(s);
  await s.goto(`http://127.0.0.1:${server.address().port}/`);
  await ready(s);
  await s.evaluate(() => { window.BW.runAction('shShare'); });
  await s.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  await sh(s, (r) => { const i = r.querySelector('.bw-modal [data-sh="to"]'); i.value = 'Rami'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('.bw-modal [data-mk="ok"]').click(); });
  await s.waitForFunction(() => !!window.BW.S.lastShare, null, { timeout: 15000 });
  const sharedPath = await s.evaluate(() => window.BW.S.lastShare);
  await s.evaluate(() => window.BW.EXT.ledger.ready());
  await s.waitForTimeout(700); // the mirror is written 400 ms after the last entry
  const sharedData = fs.existsSync(sharedPath) ? dataOf(fs.readFileSync(sharedPath, 'utf8')) : null;
  const sharedLog = sharedData ? await L.unseal(sharedData.prov[svc].log, doc) : null;
  check('share: the HTML lands in the workspace HTML folder with its log (share entry, recipient)', sharedPath.startsWith(dirs.html) && sharedLog?.entries.some((e) => e.kind === 'share' && e.data.to === 'Rami'), sharedPath);
  const hist = fs.existsSync(dirs.history) ? fs.readdirSync(dirs.history) : [];
  check('served: the log is mirrored in HISTORY (.bwlog + heads)', hist.some((f) => f.endsWith('.bwlog')) && hist.some((f) => f.endsWith('.heads.json')), hist.join(','));
  const heads = JSON.parse(fs.readFileSync(path.join(dirs.history, hist.find((f) => f.endsWith('.heads.json'))), 'utf8'));
  const lowered = await (await fetch(`http://127.0.0.1:${server.address().port}/api/history`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc, log: sharedData.prov[svc].log, mirror: { head: { seq: 1, hash: 'x' }, hashes: [], pins: {} } }) })).json();
  check('served: the HISTORY head never moves back', lowered.mirror.head.seq === heads.head.seq, JSON.stringify(lowered.mirror.head));
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); // first: an open page keeps a keep-alive connection that server.close() would wait on
  if (server) { server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  provenance: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
