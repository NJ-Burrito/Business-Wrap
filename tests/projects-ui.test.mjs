// Project export / import and library ingest in the real editor (0.15.0, note 18; F6): headless Chrome against a served host.
// Export dialog (project drawer button) -> progress -> summary -> a zip on disk; import dialog (file chooser) into a CLEAN host and
// profile -> preview table -> progress -> summary -> documents in the library and in the project; Undo import; the host's inbox read at boot
// (library import with no tab open, then #doc=<id> opens it); a wiped browser profile gets every mirrored document and its project back;
// a purged document does not come back; the offline editor (file://) exports the JSON edits as a zip it builds itself.
//
//   node tests/projects-ui.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { dirsOf } from '../engine/workspace.mjs';
import { readZip, entryData } from '../engine/zip.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pui-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  projects-ui: ${n}${d && !ok ? '  — ' + String(d).slice(0, 500) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: projects-ui stalled past 10 min`); process.exit(1); }, 10 * 60e3).unref();

const file = path.join(tmp, 'pui.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'pui-test', watermarkDir: null });
const mkWs = (n) => { const root = path.join(tmp, n, 'Business-Wrap'); return { parent: path.join(tmp, n), root, chosen: true, dirs: dirsOf(root) }; };
const wsA = mkWs('a'), wsB = mkWs('b');
const srvA = await serve(file, 0, { workspace: wsA });
const srvB = await serve(file, 0, { workspace: wsB });
const urlA = `http://127.0.0.1:${srvA.address().port}/`, urlB = `http://127.0.0.1:${srvB.address().port}/`;
const browser = await chromium.launch(launchOptions());
const errors = [];
const newPage = async (url) => {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Tester' })); } catch { /* storage */ } window.__wm = []; window.addEventListener('bw:wm', (e) => window.__wm.push(e.detail?.id)); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && window.BW.EXT.projects);
  return { ctx, page };
};
/** Polls an async page function until it returns something truthy (waitForFunction does not await a promise returned by its predicate). */
const until = async (page, fn, arg, ms = 45000) => { const t0 = Date.now(); for (;;) { const v = await page.evaluate(fn, arg).catch(() => false); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`until: still false after ${ms} ms: ${String(fn).slice(0, 120)}`); await new Promise((r) => setTimeout(r, 200)); } };
const sh = (page, sel) => page.locator(`#bw-ui-host >> css=${sel}`);
const lib = (page) => page.evaluate(async () => (await window.BW.EXT.library.all()).filter((e) => /^doc-/.test(e.id)).map((e) => ({ id: e.id, title: e.title, deleted: !!e.deletedAt, editions: Object.keys(e.editions), ops: Object.values(e.editions).reduce((a, x) => a + (x.ops?.length || 0), 0) })));
try {
  // ── export from the drawer ──
  const A = await newPage(urlA);
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    await A.page.evaluate((i) => { window.BW.S.svc = 'event-permit'; window.BW.S.ed = 'ar'; window.BW.setText('/chapters/0/title', `مقدمة ${i}`); return window.BW.runAction('save'); }, i);
    await A.page.waitForFunction((n) => (window.BW.libSaved || 0) > n, i, { timeout: 45000 });
    ids.push(await A.page.evaluate(() => window.BW.S.svc));
  }
  const pid = await A.page.evaluate((ids) => { const p = window.BW.EXT.projects.create('مشروع ألفا'); ids.forEach((d) => window.BW.EXT.projects.assign(d, p.id)); return p.id; }, ids);
  await until(A.page, async () => (await (await fetch('/api/projects')).json()).state?.projects?.length === 1);
  check('three library documents sit in one project (browser state and the host agree)', ids.length === 3 && new Set(ids).size === 3);
  const hostState = await (await fetch(`${urlA}api/projects`)).json();
  check('the host holds the project with all three assignments and their ofAt marks', Object.keys(hostState.state.of).length === 3 && Object.keys(hostState.state.ofAt || {}).length === 3);

  await A.page.evaluate(() => window.BW.openDrawer('library'));
  await sh(A.page, '.drawer .pj-g [data-pj="export"]').first().click();
  await sh(A.page, '.bw-modal.px-modal [data-px-f="pdf"]').waitFor();
  check('the export dialog opens from the project\'s own button with the project chosen and the file count shown', (await sh(A.page, '.px-modal [data-px-pj]').inputValue()) === pid && /3/.test(await sh(A.page, '.px-modal .px-count').innerText()));
  await sh(A.page, '.px-modal [data-px-f="pdf"]').uncheck();
  await sh(A.page, '.px-modal [data-px-f="docx"]').uncheck();
  await sh(A.page, '.px-modal [data-px-f="html"]').check();
  check('unchecking a format updates the count', /\b18\b/.test(await sh(A.page, '.px-modal .px-count').innerText()), await sh(A.page, '.px-modal .px-count').innerText());
  await sh(A.page, '.px-modal [data-px-act="go"]').click();
  await sh(A.page, '.px-modal .px-sum').waitFor({ timeout: 60000 });
  const tilesTxt = await sh(A.page, '.px-modal .px-tiles').innerText();
  check('the summary shows 3 done, 0 failed and names the zip', /3\s*\n?\s*(تم|Done)/.test(tilesTxt) && (await sh(A.page, '.px-modal .px-where').innerText()).endsWith('.zip'), tilesTxt);
  const zipPath = await sh(A.page, '.px-modal .px-where').innerText();
  const z = readZip(zipPath);
  const idxEntry = z.find((e) => e.name.endsWith('/index.json'));
  const idx = JSON.parse(entryData(z, idxEntry).toString('utf8'));
  check('the zip holds index.json (v 1, 3 documents), Index.html, the HTML and edits of both languages, with the edit the tab made', idx.v === 1 && idx.documents.length === 3 && z.some((e) => e.name.endsWith('00 فهرس - Index.html')) && z.filter((e) => /\.html$/.test(e.name) && !/Index/.test(e.name)).length === 6 && z.filter((e) => /edits\.ar\.json$/.test(e.name)).length === 3 && JSON.parse(entryData(z, z.find((e) => /edits\.ar\.json$/.test(e.name))).toString('utf8')).ops.length === 1);
  check('the finished export fires the watermark reaction W02 once, and nothing else', JSON.stringify(await A.page.evaluate(() => window.__wm)) === '["W02"]', JSON.stringify(await A.page.evaluate(() => window.__wm)));
  check('the summary offers Open folder, Copy report and Close', (await sh(A.page, '.px-modal [data-px-act="open"]').count()) === 1 && (await sh(A.page, '.px-modal [data-px-act="copy"]').count()) === 1);
  await sh(A.page, '.px-modal [data-px-act="close"]').click();
  check('Close removes the dialog', (await sh(A.page, '.bw-modal.px-modal').count()) === 0);

  // ── a second, clean host and a clean browser profile: import the zip with the file chooser ──
  const B = await newPage(urlB);
  await B.page.evaluate(() => window.BW.openDrawer('library'));
  await sh(B.page, '.drawer .pj-bar [data-pj="import"]').click();
  const chooser = B.page.waitForEvent('filechooser');
  await sh(B.page, '.px-modal [data-px-act="files"]').click();
  (await chooser).setFiles([zipPath]);
  await sh(B.page, '.px-modal .px-tbl').waitFor();
  check('import preview: the zip is listed with its type, and the project name comes from it, before anything is written', /ZIP/.test(await sh(B.page, '.px-modal .px-tbl').innerText()) && (await sh(B.page, '.px-modal [data-px-name]').inputValue()).startsWith('مشروع ألفا') && (fs.existsSync(path.join(wsB.root, '.system', 'inbox')) ? fs.readdirSync(path.join(wsB.root, '.system', 'inbox')).length : 0) === 0, await sh(B.page, '.px-modal [data-px-name]').inputValue());
  await sh(B.page, '.px-modal [data-px-name]').fill('مشروع مستورد');
  await sh(B.page, '.px-modal [data-px-act="go"]').click();
  await sh(B.page, '.px-modal .px-sum').waitFor({ timeout: 60000 });
  const tilesB = await sh(B.page, '.px-modal .px-tiles').innerText();
  check('the import summary: 3 came in, 0 failed', /3\s*\n?\s*(دخل|Came in)/.test(tilesB) && /0\s*\n?\s*(فشل|Failed)/.test(tilesB), tilesB);
  check('the finished import fires W09', (await B.page.evaluate(() => window.__wm)).includes('W09'), JSON.stringify(await B.page.evaluate(() => window.__wm)));
  const LB = await lib(B.page);
  check('the three documents are in the library (stored by the tab) with both editions, and the host inbox is empty again', LB.length === 3 && LB.every((d) => d.editions.includes('ar') && d.editions.includes('en')) && LB.reduce((n, d) => n + d.ops, 0) === 3 && fs.readdirSync(path.join(wsB.root, '.system', 'inbox')).length === 0, JSON.stringify(LB));
  const stB = await B.page.evaluate(() => window.BW.EXT.projects.state());
  const pjB = stB.projects.find((p) => p.name === 'مشروع مستورد');
  check('one new project holds the three documents', !!pjB && Object.values(stB.of).filter((p) => p === pjB.id).length === 3 && stB.projects.length === 1, JSON.stringify(stB));
  await sh(B.page, '.px-modal [data-px-act="undo"]').click();
  await until(B.page, async () => (await window.BW.EXT.library.all()).filter((e) => /^doc-/.test(e.id) && !e.deletedAt).length === 0);
  await B.page.waitForTimeout(300);
  const trashed = await lib(B.page), modalsLeft = await sh(B.page, '.bw-modal.px-modal').count();
  check('Undo import moves the three documents to the Trash and closes the dialog', trashed.length === 3 && trashed.every((d) => d.deleted) && modalsLeft === 0, JSON.stringify({ trashed, modalsLeft }));

  // ── the host's queue with no tab open, then the link open_in_editor returns ──
  const imp = await (await fetch(`${urlB}api/library/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documents: [{ ar: fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'), title: 'من الخادم' }] }) })).json();
  check('library import returns library:true and a #doc link (no tab involved)', imp.library === true && /^\/#doc=doc-/.test(imp.url));
  await B.page.goto(`${urlB}#doc=${imp.doc_id[0]}`);
  await B.page.reload();
  await B.page.waitForFunction((id) => window.BW?.ready && window.BW.S.svc === id, imp.doc_id[0], { timeout: 45000 });
  check('the tab read the inbox at boot and opened the document from the link', (await B.page.evaluate(() => window.BW.S.svc)) === imp.doc_id[0] && (await lib(B.page)).some((d) => d.id === imp.doc_id[0] && d.title === 'من الخادم'));

  // ── a wiped profile: every mirrored document and its project come back ──
  const C = await newPage(urlA);
  await C.page.waitForFunction(() => document.documentElement.dataset.bwIngested !== undefined, null, { timeout: 45000 });
  await until(C.page, async () => (await window.BW.EXT.library.all()).filter((e) => /^doc-/.test(e.id)).length >= 3);
  await until(C.page, async () => Object.keys(window.BW.EXT.projects.state().of).length >= 3);
  const LC = await lib(C.page);
  const stC = await C.page.evaluate(() => window.BW.EXT.projects.state());
  check('a fresh browser profile on the same host gets all three documents back from the mirror, with the project', LC.length === 3 && stC.projects.some((p) => p.name === 'مشروع ألفا') && Object.keys(stC.of).length === 3, JSON.stringify({ LC: LC.map((d) => d.id), stC, tomb: await (await fetch(`${urlA}api/library/mirror?tombstones=1`)).json(), list: await (await fetch(`${urlA}api/library/list`)).json(), ids }));
  // purge one in A; a wiped profile must not bring it back
  await A.page.evaluate((id) => window.BW.EXT.library.remove(id).then(() => window.BW.EXT.library.purge(id)), ids[0]);
  await until(A.page, async (id) => (await (await fetch('/api/library/mirror?tombstones=1')).json()).ids.includes(id), ids[0]);
  const D = await newPage(urlA);
  await D.page.waitForFunction(() => document.documentElement.dataset.bwIngested !== undefined, null, { timeout: 45000 });
  await until(D.page, async () => (await window.BW.EXT.library.all()).filter((e) => /^doc-/.test(e.id)).length >= 2);
  await D.page.evaluate(() => window.BW.EXT.library.ingestMirror()); // joins the run in flight: the mirror pass has finished when it returns
  await D.page.waitForTimeout(300);
  const LD = await lib(D.page);
  check('a purged document is not resurrected by ingest', LD.length === 2 && !LD.some((d) => d.id === ids[0]), JSON.stringify(LD));
  // a newer local edit is not overwritten by an older mirror entry
  await D.page.evaluate(async (id) => { const e = await window.BW.EXT.library.get(id); e.title = 'محلي أحدث'; e.savedAt = new Date(Date.now() + 60000).toISOString(); await window.BW.EXT.library.put(e); await window.BW.EXT.library.ingestMirror(); }, ids[1]);
  check('a newer local entry is kept when ingest meets an older mirror copy', (await D.page.evaluate((id) => window.BW.EXT.library.get(id).then((e) => e.title), ids[1])) === 'محلي أحدث');

  // ── offline (file://): the JSON edits as a zip the tab builds ──
  const ctxO = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  await ctxO.addInitScript(() => { try { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Tester' })); } catch { /* storage */ } });
  const O = await ctxO.newPage();
  O.page = O;
  O.on('pageerror', (e) => errors.push(e.message));
  await O.goto(pathToFileURL(file).href);
  await O.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && window.BW.EXT.projects);
  const oid = await O.evaluate(() => { window.BW.S.svc = 'event-permit'; window.BW.S.ed = 'ar'; window.BW.setText('/chapters/0/title', 'بلا خادم'); return window.BW.runAction('save').then(() => window.BW.S.svc); });
  await O.waitForFunction(() => (window.BW.libSaved || 0) >= 1, null, { timeout: 45000 });
  await O.evaluate((id) => { const p = window.BW.EXT.projects.create('Offline'); window.BW.EXT.projects.assign(window.BW.S.svc, p.id); }, oid);
  await O.evaluate(() => { window.BW.EXT.projects.exportDialog(); });
  check('offline: PDF, DOCX and HTML are disabled with the reason, folder layout too', (await sh(O, '.px-modal [data-px-f="pdf"]').isDisabled()) && (await sh(O, '.px-modal [data-px-f="html"]').isDisabled()) && (await sh(O, '.px-modal [data-px-lay][value="folder"]').isDisabled()) && /server|الخادم/.test(await sh(O, '.px-modal .px-fs').first().innerText()));
  await sh(O, '.px-modal [data-px-act="go"]').click();
  await sh(O, '.px-modal .px-sum').waitFor({ timeout: 45000 });
  const oz = path.join(tmp, 'offline.zip');
  const dl = O.waitForEvent('download');
  await sh(O, '.px-modal a[download]').click();
  await (await dl).saveAs(oz);
  const zo = readZip(oz);
  const eo = JSON.parse(entryData(zo, zo.find((e) => /edits\.ar\.json$/.test(e.name))).toString('utf8'));
  check('offline: the zip built in the tab reads with the engine reader (CRC ok): index, document and edits per language', zo.some((e) => e.name.endsWith('/index.json')) && zo.some((e) => /document\.en\.json$/.test(e.name)) && eo.version === 1 && eo.ops.length === 1 && /^sha256:[0-9a-f]{64}$/.test(eo.baseHash), JSON.stringify(zo.map((e) => e.name)));
  check('no page error was raised in any tab', errors.length === 0, errors.join(' | '));
} catch (e) { check('suite ran without an exception', false, e.stack); } finally {
  await browser.close().catch(() => {});
  srvA.close?.(); srvB.close?.();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `ALL OK: ${out.filter((x) => x.startsWith('PASS')).length} checks`);
process.exit(failed ? 1 : 0);
