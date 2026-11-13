// session lane, S1: a LIBRARY document whose host history folder lacks its log gets a calm neutral message (history is in another folder),
// is not «stripped», and logs from this open on. A saved FILE that kept the mark and lost its log still warns (tests/provenance F5 2).
// Real Chrome, a real host, the real library (IndexedDB), the history folder moved away like a switched save folder.
//   node tests/session-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-session0160-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_STATE_DIR = path.join(tmp, 'state');
process.env.BW_NO_BROWSER = '1';
process.env.BW_NO_PROTOCOL = '1';
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const { buildEditor } = await import('../engine/build-editor.mjs');
const { launchOptions, REPO } = await import('../engine/export.mjs');
const H = await import('../engine/host.mjs');
const W = await import('../engine/workspace.mjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  session-0160: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 1600) : ''}`); if (!ok) failed += 1; };
const editor = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: editor, set: 'session-0160', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
let h = null;
const toasts = (page) => page.evaluate(() => [...(document.getElementById('bw-ui-host')?.shadowRoot?.querySelectorAll('.toast') || [])].map((x) => ({ text: x.textContent.trim(), cls: x.className })));
const setTitle = (page, v) => page.evaluate((v) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return window.BW.commit([{ op: 'setText', path: '/control/title', value: v, old: e.doc.control.title }]); }, v);
const state = (page) => page.evaluate(async () => {
  const B = window.BW; await B.EXT.ledger.ready();
  const L = B.EXT.ledger.log(B.S.svc);
  return { svc: B.S.svc, ok: L?.verdict?.ok, elsewhere: !!L?.verdict?.elsewhere, issues: (L?.verdict?.issues || []).map((i) => i.reason), src: L?.src, entries: L?.entries?.length };
});
try {
  h = await H.start({ editor, port: await free(), open: false });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '0'); } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(h.url);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && document.documentElement.dataset.bwReady === '1', null, { timeout: 30000 }).catch(async (e) => { throw new Error(e.message + ' | ' + JSON.stringify(await page.evaluate(() => ({ ds: { ...document.documentElement.dataset }, dialogs: window.BW?.dialogs?.() })))); });
  // a library document with real edits, saved (so its entry lives in the browser and its log is mirrored into the host's history folder)
  await page.evaluate(() => window.BW.EXT.library.newDocument());
  await page.waitForFunction(() => /^doc-/.test(window.BW.S.svc), null, { timeout: 15000 });
  const id = await page.evaluate(() => window.BW.S.svc);
  await setTitle(page, 'S1 tamper false alarm');
  const edited = await page.evaluate((id) => { const B = window.BW; const ed = B.M[id][B.S.ed]; return ed.ops.length; }, id);
  await page.evaluate(() => window.BW.runAction('save'));
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-bw-lib-saved'), null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(async () => { await window.BW.EXT.ledger.ready(); });
  const histDir = path.join(W.workspace().dirs.system || path.join(process.env.BW_WORKSPACE, 'Business-Wrap', '.system'), 'history');
  const histFiles = () => (fs.existsSync(histDir) ? fs.readdirSync(histDir) : []);
  const until = async (fn, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await fn()) return true; return false; };
  const had = await until(() => histFiles().some((f) => /\.bwlog$/.test(f)));
  check('ready state seen: the library document has ops and its log is mirrored into the host history folder', edited >= 1 && had, JSON.stringify({ edited, histDir, files: histFiles() }));
  const first = await state(page);
  check('the intact library document verifies with its host log (src not elsewhere)', first.ok === true && !first.elsewhere && first.entries > 0, JSON.stringify(first));
  await page.close();

  // the history folder is somewhere else now (the save folder was switched): move it away
  const gone = histDir + '.elsewhere';
  fs.mkdirSync(gone, { recursive: true });
  for (const f of histFiles()) if (/\.(bwlog|heads\.json)$/.test(f)) fs.renameSync(path.join(histDir, f), path.join(gone, f)); // the folder itself stays (the host holds it)
  check('the document log is gone from the history folder (the other-folder state)', !histFiles().some((f) => /\.bwlog$/.test(f)) && fs.readdirSync(gone).some((f) => /\.bwlog$/.test(f)), JSON.stringify(histFiles()));
  const page2 = await ctx.newPage();
  page2.setDefaultTimeout(20000);
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.goto(`${h.url}#doc=${id}`);
  await page2.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwReady === '1', null, { timeout: 30000 });
  await page2.waitForFunction((id) => window.BW.S.svc === id, id, { timeout: 15000 }).catch(() => {});
  const s2 = await state(page2);
  await sleep(600);
  const tt = await toasts(page2);
  const warn = tt.filter((x) => /عبث|tamper/i.test(x.text) || /warn/.test(x.cls));
  const calm = tt.filter((x) => /مجلد آخر|another folder/.test(x.text));
  check('ready state seen: the library document is open in the second page and its log was read', s2.svc === id && typeof s2.ok === 'boolean', JSON.stringify(s2));
  check('S1: a library document whose host history lacks its log is NOT stripped: verdict ok, no issue, elsewhere', s2.ok === true && s2.elsewhere && !s2.issues.length && s2.src === 'elsewhere', JSON.stringify(s2));
  check('S1: no tamper warning toast, and one calm toast naming the other folder', warn.length === 0 && calm.length === 1, JSON.stringify(tt));
  await page2.evaluate(() => window.BW.openDrawer('provenance'));
  await sleep(400);
  const ui = await page2.evaluate(() => { const el = document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .pv-status'); return el && { elsewhere: el.dataset.elsewhere === '1', err: el.classList.contains('err'), text: el.textContent.trim() }; });
  check('S1: the history drawer shows the neutral status with what to do (switch back to the earlier save folder), never the error block', ui?.elsewhere && !ui.err && /save folder|مجلد الحفظ/.test(ui.text), JSON.stringify(ui));
  // type and close at once, reopen: the next open is quiet and the new edit is logged
  // the first page was just closed: its document lease is released a moment later; the second tab edits as soon as it is the writer
  let typed = false, typeErr = '';
  for (let i = 0; i < 60 && !typed; i++) { try { await setTitle(page2, 'S1 typed then closed'); typed = true; } catch (e) { typeErr = e.message.slice(0, 120); await sleep(250); } }
  // when it fails, say WHY in the log: who holds the lease, which tabs the host lists, and whether the host still answers (CI had only the page's error text)
  let why = typeErr;
  if (!typed) {
    const get = async (p) => { try { return await (await fetch(h.url + p, { signal: AbortSignal.timeout(3000) })).text(); } catch (e) { return `unreachable: ${e.message}`; } };
    why = `${typeErr} | leases ${(await get('api/session/leases')).slice(0, 300)} | live ${(await get('api/session/live')).slice(0, 900)}`;
  }
  check('the second page became the writer and typed', typed, why);
  await page2.evaluate(async () => { await window.BW.EXT.ledger.ready(); });
  const ents = await page2.evaluate(() => window.BW.EXT.ledger.log().entries.map((e) => `${e.kind}:${e.data?.src || ''}`));
  check('S1: edits from this open on are logged (an «open» entry with src elsewhere, then the op)', ents.some((e) => e === 'open:elsewhere') && ents.some((e) => e.startsWith('op')), ents.join(','));
  await page2.close();
  const page3 = await ctx.newPage();
  page3.setDefaultTimeout(20000);
  await page3.goto(`${h.url}#doc=${id}`);
  await page3.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwReady === '1', null, { timeout: 30000 });
  await page3.waitForFunction((id) => window.BW.S.svc === id, id, { timeout: 15000 }).catch(() => {});
  const s3 = await state(page3);
  await sleep(500);
  const t3 = await toasts(page3);
  check('S1: reopening is not a tamper alarm either', s3.svc === id && s3.ok === true && !t3.some((x) => /عبث|tamper/i.test(x.text)), JSON.stringify({ s3, t3 }));
  check('no page error', errors.length === 0, errors.join(' | '));
  fs.rmSync(gone, { recursive: true, force: true });
} catch (e) {
  check('suite ran to the end', false, e.stack || e.message);
} finally {
  await browser.close().catch(() => {});
  if (h) await H.stop().catch(() => {});
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(out.join('\n'));
if (failed) { console.log(`FAILED: ${failed} check(s)`); process.exit(1); }
console.log(`OK: ${out.length} checks`);
