// H1 projects (0.13.1): the owner makes «Project A» in «المستندات», puts 3 documents in it (the row's project select and
// the API), sees «Project A · 3» as a collapsible group, filters by project, makes a document straight into a project,
// renames, deletes to the projects' Trash and restores; the groups survive a reload (browser storage) and reach a fresh
// browser through the save folder (HISTORY\projects.json, engine/routes/projects.mjs). Headless Chrome, served on a free port.
//
//   node tests/projects.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { cleanState } from '../engine/routes/projects.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pj-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local'); // the host's profile and state stay in this run's folder (never the install's .local or a caller's)
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  projects: ${n}${d && !ok ? '  — ' + String(d).slice(0, 400) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: projects stalled past 4 min`); process.exit(1); }, 4 * 60e3).unref();

// the route's input check, without a browser
const ok1 = cleanState({ v: 1, savedAt: '2026-10-29T10:00:00.000Z', projects: [{ id: 'pj-abcd1234', name: 'A' }], of: { 'doc-abcd1234': 'pj-abcd1234' } });
check('route: a well-formed state is kept; a document in an unknown project, a bad id or an empty name is refused',
  !!ok1 && !cleanState({ ...ok1, of: { 'doc-abcd1234': 'pj-zzzz9999' } }) && !cleanState({ ...ok1, projects: [{ id: '../x', name: 'A' }] }) && !cleanState({ ...ok1, projects: [{ id: 'pj-abcd1234', name: ' ' }] }));

const file = path.join(tmp, 'pj.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'pj-test', watermarkDir: null });
const ws = { parent: tmp, root: path.join(tmp, 'Business-Wrap'), dirs: Object.fromEntries(['pdf', 'docx', 'html', 'history'].map((k) => [k, path.join(tmp, 'Business-Wrap', k.toUpperCase())])) };
const server = await serve(file, 0, { workspace: ws });
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Tester' })); } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = (p = page) => p.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && window.BW.EXT.projects);
  const sh = (sel, p = page) => p.locator(`#bw-ui-host >> css=.drawer ${sel}`);
  const drawer = (p = page) => p.evaluate(() => ({ ...document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').dataset }));
  await page.goto(base);
  await ready();

  // three documents from the template (Save on a template makes a new library document each time)
  const ids = [];
  for (let i = 0; i < 3; i += 1) {
    const n = ids.length;
    await page.evaluate(() => { window.BW.S.svc = 'event-permit'; window.BW.S.ed = 'ar'; return window.BW.runAction('save'); });
    await page.waitForFunction((n) => (window.BW.libSaved || 0) > n, n, { timeout: 10000 });
    ids.push(await page.evaluate(() => window.BW.S.svc));
  }
  check('three library documents to group', new Set(ids).size === 3 && ids.every((x) => /^doc-/.test(x)), ids.join(','));

  // «مشروع جديد» in the documents drawer → the name card → the group shows, empty
  await page.evaluate(() => window.BW.openDrawer('library'));
  await sh('.pj-bar [data-pj="new"]').click();
  await page.locator('#bw-ui-host >> css=.bw-modal [data-pj-name]').fill('Project A');
  await page.locator('#bw-ui-host >> css=.bw-modal [data-mk="ok"]').click();
  await page.waitForFunction(() => window.BW.EXT.projects.live().length === 1);
  const pid = await page.evaluate(() => window.BW.EXT.projects.live()[0].id);
  await page.waitForFunction((pid) => !!document.getElementById('bw-ui-host').shadowRoot.querySelector(`.drawer [data-pj-g="${pid}"]`), pid, { timeout: 5000 }).catch(() => {});
  const empty = await sh(`[data-pj-g="${pid}"] summary`).textContent().catch(() => '');
  check('«مشروع جديد» creates «Project A»; its group shows at once, «Project A · 0»', /Project A\s*·\s*0/.test(empty), empty);

  // the row's «انقل إلى مشروع» select (one document), the API (two more)
  await sh(`li[data-id="${ids[0]}"] [data-pj-move]`).selectOption(pid);
  await page.evaluate(([a, b, p]) => { window.BW.EXT.projects.assign(a, p); window.BW.EXT.projects.assign(b, p); }, [ids[1], ids[2], pid]);
  await page.waitForFunction((pid) => /·\s*3/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector(`.drawer [data-pj-g="${pid}"] summary`)?.textContent || ''), pid, { timeout: 5000 }).catch(() => {});
  const g = await page.evaluate((pid) => { const r = document.getElementById('bw-ui-host').shadowRoot; const el = r.querySelector(`.drawer [data-pj-g="${pid}"]`); return { sum: el?.querySelector('summary')?.textContent, rows: el?.querySelectorAll('li[data-id]').length, open: el?.querySelector('details')?.open }; }, pid);
  check('the list groups by project: «Project A · 3», collapsible, the 3 rows inside it', /Project A\s*·\s*3/.test(g.sum || '') && g.rows === 3 && g.open === true, JSON.stringify(g));
  await sh(`[data-pj-g="${pid}"] summary`).click();
  const closed = await page.evaluate((pid) => document.getElementById('bw-ui-host').shadowRoot.querySelector(`.drawer [data-pj-g="${pid}"] details`).open, pid);
  check('a project group collapses on its title', closed === false);
  check('one project per document: of() names it for all three', (await page.evaluate((ids) => ids.map((i) => window.BW.EXT.projects.of(i)), ids)).every((x) => x === pid));

  // a fourth document, no project; the filter shows one group
  await page.evaluate(() => { window.BW.S.svc = 'event-permit'; return window.BW.runAction('save'); });
  await page.waitForFunction(() => (window.BW.libSaved || 0) >= 4, null, { timeout: 10000 });
  const loose = await page.evaluate(() => window.BW.S.svc);
  await page.evaluate(() => window.BW.openDrawer('library'));
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-pj-g="-"]'), null, { timeout: 5000 }).catch(() => {});
  await sh('[data-pj-filter]').selectOption(pid);
  const f1 = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer .pj-g:not([hidden])')].map((x) => x.dataset.pjG));
  await sh('[data-pj-filter]').selectOption('-');
  const f2 = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer .pj-g:not([hidden]) li[data-id]')].map((x) => x.dataset.id));
  check('the project filter shows one project («Project A») or «بلا مشروع» only', JSON.stringify(f1) === JSON.stringify([pid]) && JSON.stringify(f2) === JSON.stringify([loose]), JSON.stringify({ f1, f2 }));

  // New document under the «Project A» filter lands in Project A
  await sh('[data-pj-filter]').selectOption(pid);
  await sh('[data-lib="new"]').click();
  await page.waitForFunction(() => /^doc-/.test(window.BW.S.svc) && window.BW.EXT.projects.of(window.BW.S.svc), null, { timeout: 8000 }).catch(() => {});
  const fresh = await page.evaluate(() => ({ id: window.BW.S.svc, pj: window.BW.EXT.projects.of(window.BW.S.svc) }));
  check('«مستند جديد» with the «Project A» filter on puts the new document in Project A', fresh.pj === pid, JSON.stringify(fresh));
  const viaApi = await page.evaluate(async (pid) => { const e = await window.BW.EXT.projects.newIn(pid); return window.BW.EXT.projects.of(e.id) === pid; }, pid);
  check('newIn(project) makes a document straight into a project', viaApi);

  // rename, delete → projects' Trash → restore (the documents come back with it)
  await page.evaluate(() => window.BW.openDrawer('library'));
  await sh('[data-pj-filter]').selectOption('');
  await sh(`[data-pj-g="${pid}"] [data-pj="rename"]`).click();
  await page.locator('#bw-ui-host >> css=.bw-modal [data-pj-name]').fill('Project A1');
  await page.locator('#bw-ui-host >> css=.bw-modal [data-mk="ok"]').click();
  await page.waitForFunction(() => window.BW.EXT.projects.live()[0]?.name === 'Project A1', null, { timeout: 5000 }).catch(() => {});
  const renamed = await page.evaluate(() => window.BW.EXT.projects.live()[0]?.name);
  await sh(`[data-pj-g="${pid}"] [data-pj="del"]`).click();
  const del = await page.evaluate((ids) => ({ live: window.BW.EXT.projects.live().length, trash: window.BW.EXT.projects.trashed().length, of: ids.map((i) => window.BW.EXT.projects.of(i)) }), ids);
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .pj-trash'), null, { timeout: 5000 }).catch(() => {});
  await sh('.pj-trash summary').click();
  await sh(`.pj-trash [data-pj-id="${pid}"] [data-pj="restore"]`).click();
  const back = await page.evaluate((ids) => ({ live: window.BW.EXT.projects.live().length, of: ids.map((i) => window.BW.EXT.projects.of(i)) }), ids);
  check('rename, then delete → «مشاريع محذوفة» (documents in no project), restore → the 3 documents are back in it',
    renamed === 'Project A1' && del.live === 0 && del.trash === 1 && del.of.every((x) => x === null) && back.live === 1 && back.of.every((x) => x === pid), JSON.stringify({ renamed, del, back }));
  const lib = await page.evaluate(async () => (await window.BW.EXT.library.all()).filter((e) => !e.deletedAt).length);
  check('deleting a project never deletes its documents', lib >= 4, String(lib)); // the two new ones stay unsaved until their first Save

  // reload: the same groups (browser storage); the save folder holds them for a fresh browser
  await page.reload();
  await ready();
  const after = await page.evaluate((ids) => ({ names: window.BW.EXT.projects.live().map((p) => p.name), of: ids.map((i) => window.BW.EXT.projects.of(i)) }), ids);
  check('reload: «Project A1» and its 3 documents are still there', after.names.join() === 'Project A1' && after.of.every((x) => x === pid), JSON.stringify(after));
  const onDisk = (() => { try { return JSON.parse(fs.readFileSync(path.join(ws.dirs.history, 'projects.json'), 'utf8')); } catch { return null; } })();
  check('the save folder keeps them: HISTORY\\projects.json', onDisk?.projects?.some((p) => p.id === pid && p.name === 'Project A1') && ids.every((i) => onDisk.of[i] === pid), JSON.stringify(onDisk).slice(0, 300));
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(base);
  await ready(p2);
  await p2.waitForFunction(() => window.BW.EXT.projects.live().length === 1, null, { timeout: 5000 }).catch(() => {});
  const other = await p2.evaluate(() => window.BW.EXT.projects.live().map((p) => p.name).join());
  check('a fresh browser (empty storage) reads the projects from the save folder', other === 'Project A1', other);
  await ctx2.close();
  await ctx.close();
  check('no page errors', !errors.length, errors.join(' | '));
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
console.log(out.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${out.length - failed} pass, ${failed} fail`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
