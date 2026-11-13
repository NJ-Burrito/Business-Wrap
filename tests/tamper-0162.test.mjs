// note T: a Save-HTML made honestly by the tool (agent-built through the bridge, person-edited, or both) shows NO tamper warning when opened
// by file:// in a fresh Chrome profile, in the same folder or moved to another; a truly cut file (log removed, edit history trimmed, the JSON edited by hand) still warns.
// Real Chrome (BW_CHROME), a real host for the build and the save, then fresh contexts on file://.
//   node tests/tamper-0162.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-tamper0162-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_STATE_DIR = path.join(tmp, 'state');
process.env.BW_NO_BROWSER = '1';
process.env.BW_NO_PROTOCOL = '1';
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const { buildEditor } = await import('../engine/build-editor.mjs');
const { launchOptions, REPO } = await import('../engine/export.mjs');
const H = await import('../engine/host.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  tamper-0162: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 1600) : ''}`); if (!ok) failed += 1; };
const editor = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: editor, set: 'tamper-0162', watermarkDir: null });
// an editor as 0.16.1 built it: the Save-HTML entry carries no savedDh (the saved-state hash added in 0.16.2); proves the OLD files stop warning too.
// A host starts once per process, so the legacy run is this same file started again with TAMPER_LEGACY=1; its lines join this run's.
const LEGACY_RUN = process.env.TAMPER_LEGACY === '1';
const legacyEditor = path.join(tmp, 'editor-legacy.html');
if (LEGACY_RUN) { const src = fs.readFileSync(editor, 'utf8'); const app = (h) => /<script id="bw-app">([\s\S]*?)<\/script>/.exec(h)[1];
  const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('base64');
  let old = src.replace(', savedDh: await BWLOG1.docHash(held)', '');
  old = old.split(`'sha256-${sha(app(src))}'`).join(`'sha256-${sha(app(old))}'`);
  fs.writeFileSync(legacyEditor, old, 'utf8'); check('ready state seen: the legacy editor differs from the current one only by the savedDh key (and the CSP hash that names the script)', old !== src); }
const browser = await chromium.launch(launchOptions());
let h = null;
const DATA_RE = /(<script type="application\/json" id="bw-data">)([\s\S]*?)(<\/script>)/;
const dataOf = (html) => JSON.parse(DATA_RE.exec(html)[2]);
const withData = (html, d) => html.replace(DATA_RE, (_, a, b, c) => a + JSON.stringify(d).replace(/</g, '\\u003c') + c);
const toasts = (page) => page.evaluate(() => [...(document.getElementById('bw-ui-host')?.shadowRoot?.querySelectorAll('.toast') || [])].map((x) => ({ text: x.textContent.trim(), cls: x.className })));
const isWarn = (t) => /عبث|tamper/i.test(t.text);

/** Open a saved file by file:// in a FRESH profile (no key, no IndexedDB mirror, no localStorage: as on another computer). */
async function openFresh(file) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '0'); } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwReady === '1' && window.BW.EXT.ledger?.attached(), null, { timeout: 30000 });
  await page.evaluate(() => window.BW.EXT.ledger.ready());
  await sleep(700);
  const st = await page.evaluate(() => { const B = window.BW; const L = B.EXT.ledger.log(B.S.svc); return { svc: B.S.svc, ok: L?.verdict?.ok, issues: (L?.verdict?.issues || []).map((i) => i.reason), src: L?.src, entries: L?.entries?.length, kinds: (L?.entries || []).map((e) => e.kind).join(',') }; });
  const tt = await toasts(page);
  const r = { ...st, warn: tt.filter(isWarn).length, toasts: tt.map((x) => x.text), errors };
  await ctx.close();
  return r;
}
try {
  const errors = [];
  let keep = null;
  for (const [L, single, ef] of LEGACY_RUN ? [['single-edition saved by 0.16.1', true, legacyEditor]] : [['two-edition', false, editor], ['single-edition', true, editor]]) {
  if (!h) {
    h = await H.start({ editor: ef, port: await free(), open: false });
    keep = await (await browser.newContext()).newPage(); // one page stays open on the host so it lives between documents
    await keep.goto(h.url);
  }
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '0'); localStorage.setItem('bw:profile', JSON.stringify({ name: 'Mark', activity: true })); } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(h.url);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && document.documentElement.dataset.bwReady === '1', null, { timeout: 30000 });
  await page.evaluate(() => window.BW.EXT.library.newDocument());
  await page.waitForFunction(() => /^doc-/.test(window.BW.S.svc), null, { timeout: 15000 });
  await page.evaluate(() => window.BW.EXT.ledger.ready());
  if (single) await page.evaluate(() => window.BW.bridge('action', undefined, { id: 'singleEdition', args: { editions: 'ar' } }));
  // the agent (MCP bridge) edits, then a person edits, then the agent again, then Save-HTML through the bridge (what the MCP saveHtml action does)
  const bridge = (tool, args) => page.evaluate(([tool, args]) => window.BW.bridge(tool, undefined, args), [tool, args]);
  const ed = await page.evaluate(() => window.BW.S.ed);
  const title0 = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.control.title);
  await bridge('ops', { locale: ed, agent: 'Claude (test)', ops: [{ op: 'setText', path: '/control/title', value: 'Agent built title', old: title0 }] });
  await page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; return B.commit([{ op: 'setText', path: '/control/title', value: 'Person edited title', old: e.doc.control.title }]); });
  await bridge('ops', { locale: ed, agent: 'Claude (test)', ops: [{ op: 'setText', path: '/control/title', value: 'Agent again title' }] });
  await page.evaluate(() => window.BW.EXT.ledger.ready());
  const saved = await bridge('action', { id: 'saveHtml' });
  const file = saved?.file;
  check(L + ': ready state seen: the agent and the person edited and the bridge saved a real file', !!file && fs.existsSync(file), JSON.stringify(saved));
  const html = fs.readFileSync(file, 'utf8');
  const d = dataOf(html);
  const svc = d.services[0].id;
  check(L + ': ' + 'the saveHtml entry ' + (LEGACY_RUN ? 'has no savedDh (an old file)' : 'vouches for the saved editions (savedDh)'), !LEGACY_RUN === (typeof (await page.evaluate(() => window.BW.EXT.ledger.log().entries.at(-1).data.savedDh)) === 'string'));
  check(L + ': ' + 'the file carries the mark, the sealed log and the edits', d.bwlog === 1 && !!d.prov?.[svc]?.log && d.services[0].editions[ed].ops.length >= 3, JSON.stringify({ bwlog: d.bwlog, prov: Object.keys(d.prov || {}), ops: d.services[0].editions[ed].ops.length }));
  let tofuFile = null;
  await ctx.close();
  if (!LEGACY_RUN && !single) {
    // tofu: the same contributor signs from another device (a second key for the same name), the chain otherwise whole: a calm note, no alarm.
    // Built with the ledger engine itself: the saved file's log is unsealed, a Save-HTML entry is added under a new key for the same actor id, and sealed back.
    const { BWLOG1: LG } = await import('../engine/ledger-v1.mjs');
    const j = dataOf(html);
    const log = await LG.unseal(j.prov[svc].log, j.prov[svc].doc);
    const last = log.entries.at(-1);
    await LG.append(log, { kind: 'saveHtml', data: last.data, actor: { id: last.actor.id, name: last.actor.name }, keys: await LG.newKeys(), docHash: last.docHash });
    j.prov[svc].log = await LG.seal(log);
    tofuFile = path.join(tmp, 'tofu.html'); fs.writeFileSync(tofuFile, withData(html, j), 'utf8');
    check(L + ': tofu: ready state seen: the built file holds two keys for one actor id', new Set(log.entries.filter((e) => e.actor.id === last.actor.id).map((e) => e.actor.kid)).size === 2, JSON.stringify(log.entries.map((e) => e.actor.id + ':' + e.actor.kid.slice(0, 6) + ':' + e.kind)));
  }
  if (tofuFile) {
    const rt = await openFresh(tofuFile);
    check(L + ': tofu: two keys for one name, chain otherwise whole: no alarm toast, the log reports only tofu', rt.issues.length > 0 && rt.issues.every((x) => x === 'tofu') && rt.warn === 0, JSON.stringify(rt));
    const tf = fs.readFileSync(tofuFile, 'utf8');
    const tn = path.join(tmp, 'tofu-nolog.html'); fs.writeFileSync(tn, (() => { const j = dataOf(tf); delete j.prov; return withData(tf, j); })(), 'utf8');
    const rtc = await openFresh(tn);
    check(L + ': tofu: a cut chain (log removed) still warns', rtc.warn === 1, JSON.stringify(rtc));
    const te = path.join(tmp, 'tofu-edited.html'); fs.writeFileSync(te, (() => { const j = dataOf(tf); const e = j.services[0].editions[ed]; e.ops[e.ops.length - 1] = { ...e.ops[e.ops.length - 1], value: 'Hand edited title' }; return withData(tf, j); })(), 'utf8');
    const rte = await openFresh(te);
    check(L + ': tofu: two keys plus a hand edit still warns', rte.warn === 1, JSON.stringify(rte));
  }

  // honest: same folder, and another folder
  const r1 = await openFresh(file);
  check(L + ': ' + 'honest agent+person file, fresh profile by file://: log intact, no tamper warning', r1.ok === true && r1.warn === 0 && !r1.issues.length, JSON.stringify(r1));
  const moved = path.join(tmp, 'elsewhere', 'Downloads', 'Moved doc.html');
  fs.mkdirSync(path.dirname(moved), { recursive: true });
  fs.copyFileSync(file, moved);
  const r2 = await openFresh(moved);
  check(L + ': ' + 'the same file moved to another folder: still quiet', r2.ok === true && r2.warn === 0, JSON.stringify(r2));
  // cut files still warn
  const cut = (name, fn) => { const p = path.join(tmp, name); fs.writeFileSync(p, fn(html), 'utf8'); return p; };
  const noLog = cut('nolog.html', (x) => { const j = dataOf(x); delete j.prov; return withData(x, j); });
  const rc1 = await openFresh(noLog);
  check(L + ': ' + 'cut: the log removed, the mark kept: warns', rc1.warn === 1 && rc1.ok === false, JSON.stringify(rc1));
  const edited = cut('edited.html', (x) => { const j = dataOf(x); const e = j.services[0].editions[ed]; if (typeof e.raw === 'string') e.raw = e.raw.replace(/Agent again title/g, 'Hand edited title'); e.ops[e.ops.length - 1] = { ...e.ops[e.ops.length - 1], value: 'Hand edited title' }; return withData(x, j); });
  const rc2 = await openFresh(edited);
  check(L + ': ' + 'cut: an edit made by hand in the file JSON: warns', rc2.warn === 1 && rc2.ok === false, JSON.stringify(rc2));
  if (!LEGACY_RUN) { // an OLD file (no savedDh) cannot show a trimmed op list: stated in the notes; a changed op value above still warns
    const noOps = cut('noops.html', (x) => { const j = dataOf(x); const e = j.services[0].editions[ed]; e.ops = e.ops.slice(0, 1); return withData(x, j); });
    const rc3 = await openFresh(noOps);
    check(L + ': ' + 'cut: the edit history trimmed by hand: warns', rc3.warn === 1 && rc3.ok === false, JSON.stringify(rc3));
  }
  
  }
  check('no page error', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('suite ran to the end', false, e.stack || e.message);
} finally {
  await browser.close().catch(() => {});
  if (h) await H.stop().catch(() => {});
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
if (!LEGACY_RUN && !failed) {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TAMPER_LEGACY: '1' }, encoding: 'utf8', timeout: 280000 });
  const lines = (r.stdout || '').split('\n').filter((l) => /^(PASS|FAIL)  tamper-0162/.test(l));
  out.push(...lines);
  failed += lines.filter((l) => l.startsWith('FAIL')).length;
  if (!lines.length) { failed += 1; out.push(`FAIL  tamper-0162: the legacy run printed nothing  — ${String(r.stderr || r.error || '').slice(0, 600)}`); }
}
console.log(out.join('\n'));
if (failed) { console.log(`FAILED: ${failed} check(s)`); process.exit(1); }
console.log(`OK: ${out.length} checks`);
