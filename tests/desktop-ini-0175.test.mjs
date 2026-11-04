// 0.17.5: the folder-icon desktop.ini (0.17.4) sits in folders the tool makes. Code that lists a folder and takes every entry for a sub-folder
// (the host test listed .system\sessions that way and crashed with ENOTDIR on CI) must meet it without a crash, and it must never be content:
// not a library entry, not a session, not a document, not part of an export or an import. Here desktop.ini is put into EVERY folder of a save tree
// (the role folders, every .system sub-folder, a session run, the folders of an export), on any OS (the file is just a file), and the real
// callers run: the served host (session, library, history, project routes), the folder picker, older documents, tidy, harvest sources,
// the project export (folder and zip), the import plan and the project import (folder, zip, the route).
//   node tests/desktop-ini-0175.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from '../engine/serve.mjs';
import { dirsOf, roleOfFolder, applyTreeIcons, listFolders, UNSORTED_NAME, keepVersion } from '../engine/workspace.mjs';
import { tidy } from '../engine/tidy.mjs';
import { exportProject } from '../engine/project-export.mjs';
import { importProject } from '../engine/project-import.mjs';
import { planSources } from '../engine/import/plan.mjs';
import { makeEntry } from '../engine/routes/library.mjs';
import { readZip } from '../engine/zip.mjs';
import { REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ini175-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  desktop-ini-0175: ${n}${d && !ok ? '  - ' + String(d).slice(0, 400) : ''}`); if (!ok) failed += 1; };
const INI = '[.ShellClassInfo]\r\nIconResource=x.ico,0\r\n';
const sample = (n, l) => fs.readFileSync(path.join(REPO, 'samples', n, `document.${l}.json`), 'utf8');
const servers = [];
/** desktop.ini into every folder at and below `dir` (and into `dir`) */
const iniEverywhere = (dir) => { let n = 0; const go = (d) => { if (!fs.existsSync(path.join(d, 'desktop.ini'))) fs.writeFileSync(path.join(d, 'desktop.ini'), INI); n += 1; for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) go(path.join(d, e.name)); }; go(dir); return n; };
const seesIni = (v) => /desktop\.ini/i.test(typeof v === 'string' ? v : JSON.stringify(v));

try {
  // ── the save tree: every role folder and every .system sub-folder ──────────────────────────────────────────────────────
  const parent = path.join(tmp, 'ws');
  const root = path.join(parent, 'Business-Wrap');
  const ws = { parent, root, chosen: true, dirs: dirsOf(root) };
  const D = ws.dirs;
  for (const d of Object.values(ws.dirs)) fs.mkdirSync(d, { recursive: true });
  for (const s of ['inbox', 'archive', 'cache', 'icons']) fs.mkdirSync(path.join(D.system, s), { recursive: true });
  const doc = path.join(D.docs, 'My Doc');
  for (const s of ['Exports', 'Sources', 'Versions']) fs.mkdirSync(path.join(doc, s), { recursive: true });
  fs.mkdirSync(path.join(D.docs, UNSORTED_NAME), { recursive: true });
  fs.writeFileSync(path.join(doc, 'My Doc.html'), '<!doctype html><title>My Doc</title>');
  fs.writeFileSync(path.join(doc, 'Versions', '2026-11-01 10-00 My Doc.html'), '<!doctype html><title>old</title>');
  const run = '20261104-120000-abcdef';
  fs.mkdirSync(path.join(D.sessions, run), { recursive: true });
  fs.writeFileSync(path.join(D.sessions, run, 'run.json'), JSON.stringify({ runId: run }));
  fs.writeFileSync(path.join(D.sessions, run, 'tabA.json'), JSON.stringify({ tab: 'tabA', title: 'Tab A', at: new Date().toISOString() }));
  // the real writer first (what 0.17.4 does, forced so it also writes off Windows), then desktop.ini into everything else too
  const marked = applyTreeIcons(root, { force: true, notify: false });
  const total = iniEverywhere(root);
  check('desktop.ini is now in every folder of the save tree, .system sub-folders and the session run included', total >= 14 && fs.existsSync(path.join(D.sessions, 'desktop.ini')) && fs.existsSync(path.join(D.sessions, run, 'desktop.ini')), `${marked} marked, ${total} total`);
  check('roles: only .system itself is a system folder; its sub-folders (sessions, history, library, backups, cache) have no role', roleOfFolder(D.system, root) === 'system' && ['sessions', 'history', 'library', 'backups', 'cache', 'inbox'].every((s) => roleOfFolder(path.join(D.system, s), root) === null));

  // ── the served host: session, library, history, project routes ─────────────────────────────────────────────────────────
  const page = path.join(tmp, 'page.html');
  fs.writeFileSync(page, '<!doctype html><title>x</title>');
  const server = await serve(page, 0, { workspace: ws });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', connection: 'close' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  };
  const job = async (id) => { const t0 = Date.now(); for (;;) { const j = (await call('GET', `/api/project/job?id=${id}`)).body; if (j.state !== 'running') return j; if (Date.now() - t0 > 300000) throw new Error(`job ${id} still running`); await new Promise((r) => setTimeout(r, 150)); } };
  const last = await call('GET', '/api/session/last');
  check('host: the last session is the run (its tab), and desktop.ini is neither a run nor a tab', last.status === 200 && last.body.runId === run && last.body.tabs.length === 1 && !seesIni(last.body), JSON.stringify(last.body));
  const recent = await call('GET', '/api/session/recent');
  check('host: recent lists My Doc once; desktop.ini is not an older document', recent.status === 200 && recent.body.older.length === 1 && recent.body.older[0].name === 'My Doc' && !seesIni(recent.body), JSON.stringify(recent.body).slice(0, 300));
  const docs = await call('GET', '/api/session/documents');
  check('host: the older-documents list holds no desktop.ini', docs.status === 200 && docs.body.docs.length === 1 && !seesIni(docs.body));
  const e1 = makeEntry({ ar: sample('event-permit', 'ar'), en: sample('event-permit', 'en'), title: 'تصريح فعالية' });
  const e2 = makeEntry({ ar: sample('blank', 'ar'), en: sample('blank', 'en'), title: 'Blank' });
  const P = (await call('POST', '/api/projects/create', { name: 'Ini project' })).body.project;
  for (const e of [e1, e2]) { await call('POST', '/api/library/mirror', { entry: e }); await call('POST', '/api/projects/assign', { doc: e.id, project: P.id }); }
  const lib = await call('GET', '/api/library/list');
  check('host: the library lists the 2 documents and no desktop.ini (the mirror folder holds one among the .json.gz)', lib.status === 200 && lib.body.length === 2 && !seesIni(lib.body), JSON.stringify(lib.body).slice(0, 300));
  fs.writeFileSync(path.join(D.library, 'desktop.ini'), INI);
  const ids = await call('GET', '/api/library/inbox');
  check('host: the inbox is empty and answers', ids.status === 200 && Array.isArray(ids.body.ids) && ids.body.ids.length === 0);
  const hist = await call('GET', '/api/history?doc=doc-none');
  check('host: history answers for an unknown document', hist.status === 200 && hist.body.log === null);
  const pr = await call('GET', '/api/projects');
  check('host: projects answer with the project', pr.status === 200 && pr.body.state.projects.some((p) => p.id === P.id));
  const pk = listFolders(D.sessions);
  check('picker: listing .system\\sessions gives the run folder only', pk.entries.length === 1 && pk.entries[0].name === run && !seesIni(pk), JSON.stringify(pk).slice(0, 300));
  const pk2 = listFolders(D.docs);
  check('picker: listing the documents folder gives My Doc and Unsorted, no desktop.ini', pk2.entries.length === 2 && !seesIni(pk2.entries));

  // ── versions, tidy, harvest sources ────────────────────────────────────────────────────────────────────────────────────
  const kept = keepVersion(path.join(doc, 'My Doc.html'));
  const vers = fs.readdirSync(path.join(doc, 'Versions')).filter((f) => !/^desktop\.ini$/i.test(f));
  check('versions: keepVersion writes beside the folder icon (2 versions, desktop.ini untouched)', !!kept && vers.length === 2 && fs.existsSync(path.join(doc, 'Versions', 'desktop.ini')));
  const t = tidy(ws, { dryRun: true });
  check('tidy: a save tree full of desktop.ini plans no move and does not crash', t.moves === 0 && t.failed === 0, JSON.stringify(t).slice(0, 300));
  fs.mkdirSync(path.join(root, 'HISTORY', 'sessions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'HISTORY', 'desktop.ini'), INI);
  fs.writeFileSync(path.join(root, 'HISTORY', 'sessions', 'desktop.ini'), INI);
  const t2 = tidy(ws, { dryRun: true });
  check('tidy: a legacy HISTORY folder holding only desktop.ini plans no move', t2.moves === 0 && t2.failed === 0, JSON.stringify(t2).slice(0, 300));
  const { harvestSources } = await import('../engine/harvest/sources.mjs');
  const src = path.join(doc, 'Sources');
  const h = await harvestSources([src], { out: path.join(tmp, 'harvest'), editor: false }).catch((e) => ({ results: [], skipped: [], error: String(e.message || e) }));
  check('harvest: a Sources folder with only desktop.ini offers nothing to read and does not list it', !seesIni(h.skipped) && !seesIni(h.results), JSON.stringify(h).slice(0, 300));

  // ── project export (folder + zip) with desktop.ini in every folder, then import and plan ───────────────────────────────
  const docsOf = [e1, e2];
  const r = await exportProject({ project: 'Ini project', docs: docsOf, formats: ['html', 'edits'], locales: 'both', layout: 'folder', outParent: path.join(tmp, 'exp') });
  const idx = JSON.parse(fs.readFileSync(path.join(r.root, 'index.json'), 'utf8'));
  check('export: the index lists 2 documents and no desktop.ini', idx.documents.length === 2 && !seesIni(idx.documents), JSON.stringify(idx).slice(0, 300));
  const exTree = r.root;
  const nIni = iniEverywhere(exTree);
  const rz = await exportProject({ project: 'Ini project', docs: docsOf, formats: ['html', 'edits'], locales: 'both', layout: 'zip', outParent: path.join(tmp, 'expz') });
  check('export: the zip is written and holds the 2 documents (desktop.ini only as folder settings)', !!rz.zip && readZip(rz.zip).filter((e) => /\.html$/.test(e.name) && !/Index\.html$/.test(e.name)).length >= 2);
  const queue = async (list) => ({ doc_id: list.map((_, i) => `d${i}`) });
  const imF = await importProject({ inputs: [exTree], queue });
  check(`import (folder with ${nIni} desktop.ini): 2 documents in, none failed, desktop.ini is not content`, imF.came_in.length === 2 && !imF.failed.length && !seesIni(imF.came_in), JSON.stringify({ in: imF.came_in.length, failed: imF.failed }).slice(0, 300));
  const imZ = await importProject({ inputs: [rz.zip], queue });
  check('import (zip): 2 documents in, none failed, desktop.ini is not content', imZ.came_in.length === 2 && !imZ.failed.length && !seesIni(imZ.came_in), JSON.stringify({ in: imZ.came_in.length, failed: imZ.failed }).slice(0, 300));
  const files = fs.readdirSync(exTree, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(exTree, f)).isFile()).map((f) => ({ file: path.join(exTree, f), rel: `X/${f.split(path.sep).join('/')}` }));
  const plan = planSources(files);
  check('plan: no desktop.ini among the documents or failures (a system file is listed as skipped at most)', plan.documents.length + plan.toRead.length >= 2 && !plan.failed.length && !seesIni(plan.documents) && !plan.toRead.some((x) => seesIni(x.rel)) && plan.skipped.some((s) => s.kind === 'system'), JSON.stringify({ d: plan.documents.length, r: plan.toRead.length, f: plan.failed }).slice(0, 300));
  const B = path.join(tmp, 'wsB');
  const wsB = { parent: B, root: path.join(B, 'Business-Wrap'), chosen: true, dirs: dirsOf(path.join(B, 'Business-Wrap')) };
  fs.mkdirSync(wsB.dirs.system, { recursive: true });
  fs.writeFileSync(page + '.b', '');
  const sB = await serve(page, 0, { workspace: wsB });
  servers.push(sB);
  const callB = async (method, p, body) => { const rr = await fetch(`http://127.0.0.1:${sB.address().port}${p}`, { method, headers: { 'content-type': 'application/json', connection: 'close' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const tx = await rr.text(); let j; try { j = JSON.parse(tx); } catch { j = tx; } return { status: rr.status, body: j }; };
  const imp = await callB('POST', '/api/project/import', { paths: [exTree] });
  const jb = imp.status === 200 ? await (async () => { const t0 = Date.now(); for (;;) { const j = (await callB('GET', `/api/project/job?id=${imp.body.job}`)).body; if (j.state !== 'running' || Date.now() - t0 > 300000) return j; await new Promise((x) => setTimeout(x, 150)); } })() : {};
  check('import (route, folder full of desktop.ini): the job is done with 2 documents', jb.state === 'done' && jb.result.came_in.length === 2 && !jb.result.failed.length && !seesIni(jb.result.came_in), JSON.stringify(jb).slice(0, 300));
  const exp2 = await call('POST', '/api/project/export', { project: P.id, formats: ['html', 'edits'], locales: 'both', layout: 'folder' });
  const jx = await job(exp2.body.job);
  check('export (route) with desktop.ini in the .system and library folders: done, 2 documents', jx.state === 'done' && jx.result.done === 2 && !seesIni(jx.result.items), JSON.stringify(jx).slice(0, 300));
} catch (e) {
  check('test run', false, e.stack || e);
} finally {
  for (const s of servers) await new Promise((r) => s.close(r));
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(`${out.join('\n')}\n${failed ? `FAILED: ${failed}/${out.length}` : `desktop-ini-0175: ${out.length} checks passed`}`);
process.exit(failed ? 1 : 0);
