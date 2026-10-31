// Project export and import (0.15.0, note 18) through the real routes of a served host: /api/library/*, /api/projects/*, /api/project/*.
// Export: a 3-document project as folder and as zip, all four formats, both languages; the index; a broken document costs only itself;
// AR-only; PDF text equals exportPdf of the same document; Arabic and very long names. Import: round trip from the folder and from the zip
// into a clean library; a mixed folder; zip-slip and bombs; 40 documents with monotonic progress; re-import is skipped; AR + EN of one
// service become one document. Library: list, import (library: true), inbox, tombstones; projects: two writers never lose an assignment.
//
//   node tests/projects-io.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { dirsOf } from '../engine/workspace.mjs';
import { applyOps } from '../engine/edits.mjs';
import { hashOf } from '../engine/edits-base.mjs';
import { makeEntry } from '../engine/routes/library.mjs';
import { importProject } from '../engine/project-import.mjs';
import { exportProject, docOf, fitStem } from '../engine/project-export.mjs';
import { writeZip, readZip, extractZip } from '../engine/zip.mjs';
import { hasUv } from '../engine/py.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pio-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  projects-io: ${n}${d && !ok ? '  — ' + String(d).slice(0, 500) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: projects-io stalled past 25 min`); process.exit(1); }, 25 * 60e3).unref();

const sample = (n, l) => fs.readFileSync(path.join(REPO, 'samples', n, `document.${l}.json`), 'utf8');
const variant = (l, name) => { const j = JSON.parse(sample('event-permit', l)); j.control.coverTitle = name; j.control.title = `${j.control.title.split(/\s*[:—]\s+/)[0]}: ${name}`; return JSON.stringify(j, null, 1); };
const servers = [];
async function host(name) {
  const root = path.join(tmp, name, 'Business-Wrap');
  const ws = { parent: path.join(tmp, name), root, chosen: true, dirs: dirsOf(root) };
  const file = path.join(tmp, `${name}.html`);
  fs.writeFileSync(file, '<!doctype html><title>x</title>');
  const server = await serve(file, 0, { workspace: ws });
  servers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', connection: 'close' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  };
  const job = async (id, ms = 600000) => { const t0 = Date.now(); const seen = []; for (;;) { const j = (await call('GET', `/api/project/job?id=${id}`)).body; seen.push([j.done, j.total, j.state]); if (j.state !== 'running') return { ...j, seen }; if (Date.now() - t0 > ms) throw new Error(`job ${id} still running after ${ms} ms`); await new Promise((r) => setTimeout(r, 150)); } };
  /** an entry into the mirror (what the tab does on Save) and, with `project`, into the project */
  const mirror = async (entry, project) => { await call('POST', '/api/library/mirror', { entry }); if (project) await call('POST', '/api/projects/assign', { doc: entry.id, project }); };
  const inbox = async () => { const ids = (await call('GET', '/api/library/inbox')).body.ids; return Promise.all(ids.map(async (id) => (await call("GET", `/api/library/inbox?id=${id}`)).body)); };
  return { ws, base, call, job, mirror, inbox };
}
const mk = (o) => { const e = makeEntry(o); return e; };

try {
  const A = await host('a');
  // ── library + projects routes ─────────────────────────────────────────────────────────────────────────────────────────
  const imp = await A.call('POST', '/api/library/import', { documents: [{ ar: sample('blank', 'ar'), en: sample('blank', 'en'), project: 'Seed' }] });
  check('library import answers library:true with a doc id and a #doc url, with no tab open', imp.status === 200 && imp.body.library === true && imp.body.queued === 1 && /^doc-/.test(imp.body.doc_id[0]) && imp.body.url === `/#doc=${imp.body.doc_id[0]}`, JSON.stringify(imp));
  const ib = await A.inbox();
  check('the inbox holds the entry as the tab stores it (two editions, hash, project)', ib.length === 1 && ib[0].id === imp.body.doc_id[0] && ib[0].editions.ar.hash.startsWith('sha256:') && ib[0].editions.en.raw && /^pj-/.test(ib[0].project));
  check('a bad document is refused with 400 and nothing is queued', (await A.call('POST', '/api/library/import', { documents: [{ ar: '{"x":1}' }] })).status === 400 && (await A.inbox()).length === 1);
  const byPath = await A.call('POST', '/api/library/import', { documents: [path.join(REPO, 'samples', 'blank', 'document.ar.json'), path.join(REPO, 'samples', 'blank', 'document.en.json')] });
  check('document paths (what the CLI open has always posted): x.ar.json and x.en.json are ONE document with two editions', byPath.status === 200 && byPath.body.queued === 1 && (await A.inbox()).some((e) => e.id === byPath.body.doc_id[0] && Object.keys(e.editions).join() === 'ar,en'), JSON.stringify(byPath));
  await A.call('DELETE', `/api/library/inbox?id=${byPath.body.doc_id[0]}`);
  check('a path that is not document JSON is refused with 400', (await A.call('POST', '/api/library/import', { documents: [path.join(REPO, 'package.json')] })).status === 400);
  await A.call('DELETE', `/api/library/inbox?id=${imp.body.doc_id[0]}`);
  check('DELETE inbox confirms the tab stored it', (await A.inbox()).length === 0);
  const seedPj = (await A.call('GET', '/api/projects')).body.state;
  check('the project was created once and the document assigned server-side', seedPj.projects.length === 1 && seedPj.projects[0].name === 'Seed' && seedPj.of[imp.body.doc_id[0]] === seedPj.projects[0].id);

  const pj = (await A.call('POST', '/api/projects/create', { name: 'سباق الدراجات - Bike' })).body.project;
  check('create returns the project and an existing name is not doubled', (await A.call('POST', '/api/projects/create', { name: 'سباق الدراجات - bike' })).body.project.id === pj.id);
  // B6 race: two writers assign different documents to one project within 100 ms
  const d1 = `doc-${crypto.randomUUID()}`, d2 = `doc-${crypto.randomUUID()}`;
  await Promise.all([A.call('POST', '/api/projects/assign', { doc: d1, project: pj.id }), A.call('POST', '/api/projects/assign', { doc: d2, project: pj.id })]);
  let st = (await A.call('GET', '/api/projects')).body.state;
  check('two tabs assigning different documents within 100 ms: both assignments survive', st.of[d1] === pj.id && st.of[d2] === pj.id);
  // whole-state posts merge per key: a stale tab that never heard of d2 cannot drop it, and its own unassign still lands
  const stale = { v: 1, savedAt: new Date(Date.now() + 5000).toISOString(), projects: [pj], of: { [d1]: pj.id } };
  await A.call('POST', '/api/projects', { state: stale });
  st = (await A.call('GET', '/api/projects')).body.state;
  check('a whole-state post from a stale tab merges per key: the document it does not list stays assigned', st.of[d2] === pj.id && st.of[d1] === pj.id);
  const un = { v: 1, savedAt: new Date(Date.now() + 9000).toISOString(), projects: [pj], of: {}, ofAt: { [d1]: new Date(Date.now() + 9000).toISOString() } };
  await A.call('POST', '/api/projects', { state: un });
  st = (await A.call('GET', '/api/projects')).body.state;
  check('an explicit unassign (ofAt, no of) wins over the older assignment; the other document is untouched', !st.of[d1] && st.of[d2] === pj.id);

  // the mirror list and tombstones
  const lib1 = mk({ ar: sample('event-permit', 'ar'), en: sample('event-permit', 'en'), ops: { ar: [{ id: 'o1', op: 'setText', path: '/chapters/0/title', value: 'مقدمة معدلة' }] } });
  await A.mirror(lib1, pj.id);
  const list = (await A.call('GET', '/api/library/list')).body;
  check('list: the mirrored document with title, savedAt, bytes and its project', Array.isArray(list) && list.some((r) => r.id === lib1.id && r.title === lib1.title && r.project === pj.id && r.bytes > 100 && r.savedAt));
  await A.call('POST', '/api/library/mirror', { entry: { id: lib1.id, purge: true } });
  check('a purged document leaves the list and is a tombstone ingest can read', !(await A.call('GET', '/api/library/list')).body.some((r) => r.id === lib1.id) && (await A.call('GET', '/api/library/mirror?tombstones=1')).body.ids.includes(lib1.id));

  // ── export ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const ops1 = [{ id: 'o1', op: 'setText', path: '/chapters/0/title', value: 'مقدمة معدلة' }];
  const e1 = mk({ ar: sample('event-permit', 'ar'), en: sample('event-permit', 'en'), ops: { ar: ops1 }, title: 'تصريح فعالية' });
  const e2 = mk({ ar: variant('ar', 'المتجر الإلكتروني'), en: variant('en', 'Online shop'), title: 'المتجر الإلكتروني' });
  const e3 = mk({ ar: '{"control":{"title":"مكسور"},"chapters":"broken"}', title: 'مستند مكسور' });
  const P = (await A.call('POST', '/api/projects/create', { name: 'مشروع التصدير - Export' })).body.project;
  for (const e of [e1, e2, e3]) await A.mirror(e, P.id);
  const fmts = hasUv() ? ['html', 'pdf', 'docx', 'edits'] : ['html', 'pdf', 'edits'];
  const t0 = Date.now();
  const x1 = await A.call('POST', '/api/project/export', { project: P.id, formats: fmts, locales: 'both', layout: 'folder' });
  check('export starts a job', x1.status === 200 && /^job-/.test(x1.body.job), JSON.stringify(x1));
  const busy = await A.call('POST', '/api/project/export', { project: P.id, formats: ['edits'], locales: 'ar' });
  check('a second job while one runs is refused (409) and names the running one', busy.status === 409 && busy.body.job === x1.body.job);
  const j1 = await A.job(x1.body.job);
  const R = j1.result;
  out.push(`INFO  export 3 docs x ${fmts.join('+')} x 2 languages took ${Math.round((Date.now() - t0) / 1000)} s`);
  check('the job finished with a result: 2 documents done, the broken one failed', j1.state === 'done' && R.root && R.items.length === 3 && R.done === 2 && R.failed === 1, JSON.stringify(R).slice(0, 400));
  const idx = JSON.parse(fs.readFileSync(path.join(R.root, 'index.json'), 'utf8'));
  const exists = (rel) => fs.existsSync(path.join(R.root, ...rel.split('/')));
  const files = idx.documents.flatMap((d) => d.files);
  check('index.json: v 1, the project, 3 documents in project order, every listed file exists with a matching sha256 and size', idx.v === 1 && idx.project === P.name && idx.documents.length === 3 && files.length > 6 && files.every((f) => exists(f.path) && crypto.createHash('sha256').update(fs.readFileSync(path.join(R.root, ...f.path.split('/')))).digest('hex') === f.sha256 && fs.statSync(path.join(R.root, ...f.path.split('/'))).size === f.bytes), JSON.stringify(idx).slice(0, 300));
  const kinds = new Set(files.map((f) => `${f.kind}.${f.locale}`));
  check(`all formats in both languages exist (${fmts.join(', ')})`, fmts.every((f) => ['ar', 'en'].every((l) => kinds.has(`${f === 'edits' ? 'edits' : f}.${l}`))), [...kinds].join(','));
  check('the folder tree: Projects folder, 00 Index.html, NN title folders in order', path.basename(path.dirname(R.root)) === 'المشاريع - Projects' && exists('00 فهرس - Index.html') && /^01 /.test(idx.documents[0].files[0].path) && /^02 /.test(idx.documents[1].files[0].path));
  const html = fs.readFileSync(path.join(R.root, '00 فهرس - Index.html'), 'utf8');
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]));
  check('Index.html is RTL, lists each document and every link resolves', /dir="rtl"/.test(html) && links.length === files.length && links.every(exists) && html.includes('تصريح فعالية') && html.includes('المتجر الإلكتروني'));
  const broken = idx.documents.find((d) => d.id === e3.id);
  check('the broken document: its renderings fail with a named reason, its edits still export, the other two are complete', broken.status === 'partial' && broken.errors.some((e) => e.format === 'pdf' && e.error) && idx.documents.filter((d) => d.status === 'ok').length === 2 && R.items.find((x) => x.doc === e3.id).error.includes('pdf'), JSON.stringify(broken).slice(0, 400));
  const ed1 = JSON.parse(fs.readFileSync(path.join(R.root, ...idx.documents[0].files.find((f) => f.kind === 'edits' && f.locale === 'ar').path.split('/')), 'utf8'));
  const base1 = fs.readFileSync(path.join(R.root, ...idx.documents[0].files.find((f) => f.kind === 'document' && f.locale === 'ar').path.split('/')), 'utf8');
  check('the edits file is the v1 contract: baseHash of its document file, the document id, the ops (apply_edits replays it)', ed1.version === 1 && ed1.baseHash === hashOf(base1) && ed1.document === e1.id && ed1.locale === 'ar' && ed1.ops.length === 1 && applyOps(JSON.parse(base1), ed1.ops).chapters[0].title === 'مقدمة معدلة');
  const pdf1 = path.join(R.root, ...idx.documents[0].files.find((f) => f.kind === 'pdf' && f.locale === 'ar').path.split('/'));
  const direct = path.join(tmp, 'direct.pdf');
  await exportPdf(docOf(e1.editions.ar), { locale: 'ar', theme: loadTheme(), pdfPath: direct });
  const txt = (f) => spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', f, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout.replace(/\s+/g, ' ').trim();
  check('the exported PDF text equals exportPdf of the same document with its edits (one code path)', txt(pdf1).length > 500 && txt(pdf1) === txt(direct) && txt(pdf1).includes('مقدمة معدلة'));

  // zip layout, read by independent readers
  const x2 = await A.call('POST', '/api/project/export', { project: P.id, formats: ['html', 'edits'], locales: 'both', layout: 'zip' });
  const j2 = await A.job(x2.body.job);
  const Z = j2.result.zip;
  const zl = readZip(Z);
  const top = new Set(zl.map((e) => e.name.split('/')[0]));
  check('zip layout: one file, one root folder holding the same tree with index.json and Index.html', j2.state === 'done' && Z.endsWith('.zip') && !j2.result.root && top.size === 1 && zl.some((e) => e.name.endsWith('/index.json')) && zl.some((e) => e.name.endsWith('/00 فهرس - Index.html')), JSON.stringify([...top]));
  const pyz = spawnSync('python', ['-X', 'utf8', '-c', 'import zipfile,sys\nz=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(len(z.namelist()))', Z], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const dest = path.join(tmp, 'ps-ex');
  const ps = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${Z}' -DestinationPath '${dest}' -Force`], { encoding: 'utf8' });
  const exRoot = path.join(dest, [...top][0]);
  check('the zip opens with python zipfile and PowerShell Expand-Archive to the same tree (index.json equal, Arabic names)', pyz.status === 0 && +pyz.stdout.trim() === zl.length && ps.status === 0 && JSON.parse(fs.readFileSync(path.join(exRoot, 'index.json'), 'utf8')).documents.length === 3, pyz.stderr + ps.stderr);
  const dl = await fetch(`${A.base}/api/project/file?job=${x2.body.job}`);
  check('GET /api/project/file streams the zip', dl.status === 200 && dl.headers.get('content-type') === 'application/zip' && Buffer.from(await dl.arrayBuffer()).equals(fs.readFileSync(Z)));
  check('no staging folder is left in the temp folder by the zip job', !fs.readdirSync(os.tmpdir()).some((n) => n.startsWith('bw-pexp-') && fs.statSync(path.join(os.tmpdir(), n)).mtimeMs > t0));

  // AR only
  const x3 = await A.call('POST', '/api/project/export', { project: P.id, formats: ['html', 'edits'], locales: 'ar', layout: 'folder' });
  const j3 = await A.job(x3.body.job);
  const f3 = fs.readdirSync(j3.result.root, { recursive: true }).map(String);
  check('AR-only: no .en. file anywhere in the tree', j3.state === 'done' && f3.some((f) => /\.ar\./.test(f)) && !f3.some((f) => /\.en\./.test(f)));

  // very long Arabic title, and progress units
  const longTitle = 'عنوان طويل جدا لمستند يختبر قص المسارات الطويلة على نظام ويندوز '.repeat(5);
  const eL = mk({ ar: sample('blank', 'ar'), title: longTitle });
  const prog = [];
  const deep = path.join(tmp, 'deep', 'x'.repeat(60), 'y'.repeat(60));
  const rL = await exportProject({ project: 'مشروع بعيد', docs: [eL], formats: ['html', 'edits'], locales: 'ar', layout: 'folder', outParent: deep, onProgress: (o) => prog.push(o.done) });
  const longest = Math.max(...fs.readdirSync(rL.root, { recursive: true }).map((f) => path.join(rL.root, String(f)).length));
  check('a 300-character Arabic title: the folder and file names are shortened with a stable suffix and every path stays under 260', longest < 260 && fitStem('ا'.repeat(200), 40) === fitStem('ا'.repeat(200), 40) && /-[0-9a-f]{6}$/.test(fitStem('ا'.repeat(200), 40)) && fs.existsSync(path.join(rL.root, 'index.json')), `longest ${longest}`);
  check('onProgress: done counts the files, never decreases', prog.length >= 4 && prog.every((v, i) => i === 0 || v >= prog[i - 1]) && prog.at(-1) === 2, JSON.stringify(prog));
  // cancel removes everything it wrote
  let n = 0;
  const rC = await exportProject({ project: 'Cancel', docs: [e1, e2], formats: ['html', 'edits'], locales: 'both', layout: 'folder', outParent: path.join(tmp, 'cancel'), isCancelled: () => ++n > 3 });
  check('Cancel mid-export: cancelled, no root, nothing left in the output folder', rC.cancelled && !rC.root && (!fs.existsSync(path.join(tmp, 'cancel', 'المشاريع - Projects')) || fs.readdirSync(path.join(tmp, 'cancel', 'المشاريع - Projects')).length === 0));

  // ── import ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const roundTrip = async (name, input) => {
    const B = await host(name);
    const r = await B.call('POST', '/api/project/import', { paths: [input] });
    const j = await B.job(r.body.job);
    const entries = await B.inbox();
    const state = (await B.call('GET', '/api/projects')).body.state;
    return { B, j, entries, state };
  };
  const fold = await roundTrip('b', R.root);
  const orig = [e1, e2, e3];
  const sameDocs = orig.every((o) => { const m = fold.entries.find((x) => x.title === o.title); return m && Object.keys(o.editions).every((l) => m.editions[l]?.raw === o.editions[l].raw && hashOf(JSON.stringify(applyOps(JSON.parse(m.editions[l].raw), m.editions[l].ops))) === hashOf(JSON.stringify(docOf(o.editions[l])))); });
  check('round trip from the folder into a clean library: same project, same titles, same document texts, the edits replay to the same document', fold.j.state === 'done' && fold.j.result.came_in.length === 3 && fold.state.projects.some((p) => p.name === P.name) && fold.entries.length === 3 && sameDocs, JSON.stringify(fold.j.result).slice(0, 500));
  check('every imported document is assigned to the project, once', Object.values(fold.state.of).filter((p) => p === fold.state.projects.find((q) => q.name === P.name).id).length === 3 && fold.state.projects.filter((p) => p.name === P.name).length === 1);
  check('progress arrived in order and ended with done == total', fold.j.seen.every((s, i) => i === 0 || s[0] >= fold.j.seen[i - 1][0]) && fold.j.done === fold.j.total && fold.j.total >= 3, JSON.stringify(fold.j.seen));
  const zipImp = await roundTrip('c', Z);
  const ed2 = zipImp.entries.find((x) => x.title === e1.title);
  check('round trip from the zip: same project (stamp stripped from nothing: the index names it), 3 documents, edits replayed', zipImp.j.state === 'done' && zipImp.j.result.project === P.name && zipImp.j.result.came_in.length === 3 && ed2.editions.ar.ops.length === 1 && ed2.editions.ar.ops[0].value === 'مقدمة معدلة', JSON.stringify(zipImp.j.result).slice(0, 400));
  // re-import into the same library: nothing doubles
  const again = await fold.B.call('POST', '/api/project/import', { paths: [R.root] });
  const ja = await fold.B.job(again.body.job);
  // the first import's inbox entries have to be in the mirror for the duplicate check (the tab does that on its ingest)
  for (const e of fold.entries) await fold.B.mirror(e);
  const again2 = await fold.B.call('POST', '/api/project/import', { paths: [R.root] });
  const jb = await fold.B.job(again2.body.job);
  check('re-importing the same folder once the library holds it: every document is reported as skipped (same content), no new inbox entry', jb.result.came_in.length === 0 && jb.result.skipped.filter((s) => /already in the library/.test(s.reason)).length === 3 && (await fold.B.inbox()).length === fold.entries.length + ja.result.came_in.length);
  const keep = await fold.B.call('POST', '/api/project/import', { paths: [R.root], onConflict: 'keep' });
  check('onConflict keep imports them again as new documents', (await fold.B.job(keep.body.job)).result.came_in.length === 3);

  // mixed folder
  const mixed = path.join(tmp, 'mixed');
  fs.mkdirSync(mixed, { recursive: true });
  const fileOf = (d, kind, loc) => path.join(R.root, ...d.files.find((f) => f.kind === kind && f.locale === loc).path.split('/'));
  const dd1 = idx.documents[0], dd2 = idx.documents[1];
  fs.copyFileSync(fileOf(dd1, 'pdf', 'ar'), path.join(mixed, 'permit.ar.pdf'));
  fs.copyFileSync(fileOf(dd1, 'pdf', 'en'), path.join(mixed, 'permit.en.pdf'));
  fs.copyFileSync(fileOf(dd2, 'pdf', 'en'), path.join(mixed, 'shop (copy).pdf'));
  if (hasUv()) fs.copyFileSync(fileOf(dd2, 'docx', 'ar'), path.join(mixed, 'shop.docx'));
  fs.copyFileSync(fileOf(dd2, 'html', 'ar'), path.join(mixed, 'shop-page.html'));
  fs.writeFileSync(path.join(mixed, 'base.ar.json'), sample('blank', 'ar'));
  fs.writeFileSync(path.join(mixed, 'base-edits.json'), JSON.stringify({ version: 1, document: 'x', baseHash: hashOf(sample('blank', 'ar')), locale: 'ar', ops: [{ op: 'setText', path: '/control/owner', value: 'فريق الجودة' }] }));
  fs.writeFileSync(path.join(mixed, 'orphan-edits.json'), JSON.stringify({ version: 1, document: 'doc-zzzzzzzz', baseHash: `sha256:${'0'.repeat(64)}`, locale: 'ar', ops: [{ op: 'setText', path: '/control/owner', value: 'x' }] }));
  fs.writeFileSync(path.join(mixed, 'corrupt.pdf'), 'this is not a pdf');
  fs.writeFileSync(path.join(mixed, 'notes.txt'), 'hello');
  const events = [];
  const queued = [];
  const m = await importProject({ inputs: [mixed], project: 'Mixed', onProgress: (o) => events.push(o.done), queue: async (docs, o) => { queued.push({ docs, o }); return { doc_id: docs.map((_, i) => `doc-mixed${i}`) }; } });
  const cameIn = m.came_in.map((c) => c.kind).sort().join(' ');
  check('mixed folder: documents came in, the corrupt PDF and the orphan edits failed with named reasons, the txt is skipped', m.failed.length === 2 && m.failed.some((f) => f.file === 'corrupt.pdf' && /pdftotext failed|failed/.test(f.reason)) && m.failed.some((f) => f.file === 'orphan-edits.json' && /base document not found/.test(f.reason)) && m.skipped.some((s) => s.file.endsWith('notes.txt')), JSON.stringify({ failed: m.failed, skipped: m.skipped, cameIn }));
  check('mixed folder: PDF AR + EN of one stem are ONE document with two editions; the edits with its base is replayed onto it; HTML and (with uv) DOCX came in', m.came_in.some((c) => c.editions.length === 2 && /permit\.ar\.pdf \+ permit\.en\.pdf/.test(c.file)) && m.came_in.some((c) => /base\.ar\.json \+ base-edits\.json/.test(c.file) && queued[0].docs.find((d) => d.ops?.ar?.length === 1)) && m.came_in.some((c) => c.file === 'shop-page.html') && (!hasUv() || m.failed.every((f) => f.file !== 'shop.docx')), JSON.stringify(m.came_in.map((c) => [c.file, c.kind, c.editions])));
  check('mixed folder: a PDF warns that tables may arrive as paragraphs (the summary shows it)', m.warnings.length >= 2 && m.warnings.every((w) => /pdf/.test(w.reason)));
  check('mixed folder: progress is monotonic and ends with done == total', events.length > 3 && events.every((v, i) => i === 0 || v >= events[i - 1]) && events.at(-1) === m.total, JSON.stringify(events));
  check('mixed folder: one queue request carries every document and the project name', queued.length === 1 && queued[0].o.project === 'Mixed' && queued[0].docs.length === m.came_in.length);

  // hostile archives into the importer
  const sentinel = path.join(tmp, 'evil-sentinel.txt');
  const hostile = path.join(tmp, 'hostile.zip');
  const z0 = path.join(tmp, 'ok.zip');
  writeZip(z0, [{ name: 'xx/evil.txt', data: 'pwned' }]);
  const buf = fs.readFileSync(z0);
  fs.writeFileSync(hostile, Buffer.from(buf.toString('latin1').split('xx/evil.txt').join('..\\evil.txt'), 'latin1'));
  const h = await importProject({ inputs: [hostile], project: 'H', queue: async () => ({ doc_id: [] }) });
  check('import of a zip-slip archive: refused with a reason, nothing written outside the temp folder', h.failed.length === 1 && /unsafe entry name/.test(h.failed[0].reason) && !fs.existsSync(path.join(os.tmpdir(), 'evil.txt')) && !fs.existsSync(path.join(tmp, 'evil.txt')), JSON.stringify(h));
  const bomb = path.join(tmp, 'bomb.zip');
  writeZip(bomb, [{ name: 'a.json', data: Buffer.alloc(8 * 1024 * 1024) }]);
  const bz = readZip(bomb);
  check('a highly compressible entry is stored deflated (the bomb shape), and import extracts it within its declared size only', bz[0].csize < 20000 && bz[0].size === 8 * 1024 * 1024);

  // 40 documents, monotonic progress
  const many = path.join(tmp, 'many');
  fs.mkdirSync(many);
  for (let i = 0; i < 40; i++) { const j = JSON.parse(sample('blank', 'ar')); j.control.coverTitle = `مستند ${i + 1}`; j.control.title = `مستند: مستند ${i + 1}`; fs.writeFileSync(path.join(many, `d${String(i).padStart(2, '0')}.ar.json`), JSON.stringify(j, null, 1)); }
  const ev40 = [];
  const t40 = Date.now();
  const m40 = await importProject({ inputs: [many], onProgress: (o) => ev40.push(o.done), queue: async (docs) => ({ doc_id: docs.map((_, i) => `doc-m40${i}`) }) });
  check('40 documents: all come in, progress is monotonic with at least 40 steps, ends at total', m40.came_in.length === 40 && ev40.length >= 40 && ev40.every((v, i) => i === 0 || v >= ev40[i - 1]) && ev40.at(-1) === m40.total && Date.now() - t40 < 20000, `${m40.came_in.length} in, ${ev40.length} events, ${Date.now() - t40} ms`);
  check('with no project given the folder name names the project', m40.project === 'many');

  // a folder of loose files with the SAME title in AR and EN pair up; the same language twice stays two documents
  const pairDir = path.join(tmp, 'pair');
  fs.mkdirSync(pairDir);
  fs.copyFileSync(fileOf(dd1, 'pdf', 'ar'), path.join(pairDir, 'Service A.ar.pdf'));
  fs.copyFileSync(fileOf(dd1, 'pdf', 'en'), path.join(pairDir, 'Service A.en.pdf'));
  fs.copyFileSync(fileOf(dd2, 'pdf', 'ar'), path.join(pairDir, 'Service B.pdf'));
  const mp = await importProject({ inputs: [pairDir], project: 'Pairs', queue: async (docs) => ({ doc_id: docs.map((_, i) => `doc-p${i}`) }) });
  check('AR and EN of one service land as one document; a lone file is its own document', mp.came_in.length === 2 && mp.came_in.filter((c) => c.editions.length === 2).length === 1, JSON.stringify(mp.came_in.map((c) => [c.file, c.editions])));

  // uploads
  const U = await host('u');
  const upId = `up-${crypto.randomBytes(8).toString('hex')}`;
  const upFiles = fs.readdirSync(R.root, { recursive: true }).map(String).filter((f) => /\.json$/.test(f) && fs.statSync(path.join(R.root, f)).isFile());
  for (const f of upFiles) {
    const r = await fetch(`${U.base}/api/project/upload?job=${upId}&name=${encodeURIComponent(`proj/${f.replace(/\\/g, '/')}`)}`, { method: 'POST', body: fs.readFileSync(path.join(R.root, f)) });
    if (r.status !== 200) check(`upload ${f}`, false, await r.text());
  }
  const bad = await fetch(`${U.base}/api/project/upload?job=${upId}&name=${encodeURIComponent('../escape.txt')}`, { method: 'POST', body: 'x' });
  check('an upload name that leaves the job folder is refused (400)', bad.status === 400);
  const ui = await U.call('POST', '/api/project/import', { job: upId, project: 'Uploaded' });
  const uj = await U.job(ui.body.job);
  check('uploaded files (a folder picked in the browser) import as one project, and the upload folder is removed', uj.state === 'done' && uj.result.project === 'Uploaded' && uj.result.came_in.length === 3 && !fs.existsSync(path.join(os.tmpdir(), `bw-upload-${upId}`)), JSON.stringify(uj.result).slice(0, 300));
} catch (e) { check('suite ran without an exception', false, e.stack + ' | ' + (e.cause?.stack || e.cause || '')); } finally {
  for (const s of servers) s.close?.();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `ALL OK: ${out.filter((x) => x.startsWith('PASS')).length} checks`);
process.exit(failed ? 1 : 0);
