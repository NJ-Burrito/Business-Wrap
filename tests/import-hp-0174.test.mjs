// 0.17.4 · project import on a machine WITHOUT long-path support (another computer of the owner: LongPathsEnabled=0), through the real routes of a
// served host: the zip upload and the folder upload of the same SYNTHETIC tree (invented titles, tests/fixtures/import-hp/shape.json).
// The failure it guards: a file from a zip was handed on as a plain path of 260+ characters; reading it failed and the importer took the file
// for a plain HTML, so the PDF of the same title won ("5 PDFs came in"), the share file was "not needed" and the editor's work was lost.
// A shim makes every unprefixed path of 260+ characters fail with ENOENT as that Windows does (a no-op elsewhere is not needed: the paths are
// the same everywhere, only Windows refuses them). The upload folder sits under a deep temp folder (profile, AppData, Local, Temp).
//
//   node tests/import-hp-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { dirsOf } from '../engine/workspace.mjs';
import { importProject } from '../engine/project-import.mjs';
import { planSources } from '../engine/import/plan.mjs';
import { writeZip } from '../engine/zip.mjs';
import { lp } from '../engine/import/safe.mjs';

const root0 = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-i174-'));
process.env.BW_LOCAL_DIR = path.join(root0, '.local');
const deepTmp = path.join(root0, 'Users', 'HP', 'AppData', 'Local', 'Temp');
fs.mkdirSync(deepTmp, { recursive: true });
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  import-hp-0174: ${n}${d && !ok ? '  — ' + String(d).slice(0, 600) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: import-hp-0174 stalled past 10 min`); process.exit(1); }, 10 * 60e3).unref();

const shape = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'import-hp', 'shape.json'), 'utf8'));
const PLACE = 'وثيقة متطلبات الخدمة: خدمة جديدة';
const base = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8'));
base.control.title = PLACE; delete base.control.coverTitle;
const edition = (name, n) => {
  const ops = [{ op: 'setText', path: '/control/title', value: `${PLACE.split(':')[0]}: ${name}`, id: 't0', at: '2026-11-02T10:00:00.000Z' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ op: 'setText', path: '/control/owner', value: `owner ${i}`, id: `t${i + 1}`, at: '2026-11-02T10:00:00.000Z' }))];
  return { name, raw: JSON.stringify(base, null, 1), hash: 'sha256:x', ops, status: {}, stale: [], comments: [], versions: [], marks: [], epochIds: [] };
};
const saveHtml = (title, ed) => `<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body><script type="application/json" id="bw-data">${JSON.stringify({ format: 1, services: [{ id: `doc-${crypto.randomUUID()}`, editions: { ar: ed } }] })}</script></body></html>`;
const PDF = Buffer.from('%PDF-1.4\n% synthetic: never read, the share or editor file of its title wins\n%%EOF\n');

// the tree, as the owner's save folder looked
const entries = []; // {rel, data}
const put = (rel, data) => entries.push({ rel: `Fixture/${rel}`, data });
for (const d of shape.docs) {
  const T = d.title, has = (k) => d.files.includes(k);
  if (has('editor')) put(`المستندات - Documents/${T}/${T}.html`, saveHtml(T, edition(T, d.ops)));
  if (has('exports-share')) put(`المستندات - Documents/${T}/Exports/2026-11-01 12-55 ${T} - العربية.shared.html`, saveHtml(T, edition(T, d.ops)));
  if (has('exports-pdf')) put(`المستندات - Documents/${T}/Exports/2026-11-01 12-54 ${T} - العربية.pdf`, PDF);
  if (has('share')) put(`${T}/${T} - مشاركة.html`, saveHtml(`وثيقة: ${T}`, edition(T, d.shareOps || d.ops)));
  if (has('pdf')) put(`${T}/${T} - وثيقة المتطلبات.pdf`, PDF);
}
if (shape.blank) put('المستندات - Documents/خدمة جديدة/خدمة جديدة.html', saveHtml(PLACE, { ...edition('x', 1), ops: [] }));
for (const s of shape.system) put(s, '[.ShellClassInfo]\r\n');

const tree = path.join(root0, 'tree');
for (const e of entries) { const f = path.join(tree, ...e.rel.split('/')); fs.mkdirSync(lp(path.dirname(f)), { recursive: true }); fs.writeFileSync(lp(f), e.data); }
const zip = path.join(root0, 'Fixture.zip');
writeZip(zip, entries.map((e) => ({ name: e.rel, data: e.data })));

// Windows without long-path support: an unprefixed path of 260+ characters does not open. `deepest` = the longest path opened WITH the prefix.
let deepest = 0;
const strict = () => {
  const bad = (p) => typeof p === 'string' && p.length >= 260 && !p.startsWith('\\\\?\\');
  for (const n of ['readFileSync', 'writeFileSync', 'mkdirSync', 'copyFileSync', 'readdirSync', 'statSync', 'lstatSync', 'existsSync', 'createWriteStream', 'createReadStream', 'rmSync', 'openSync']) {
    const orig = fs[n];
    fs[n] = function (...a) {
      for (const p of n === 'copyFileSync' ? [a[0], a[1]] : [a[0]]) {
        if (bad(p)) throw Object.assign(new Error(`ENOENT: ${n} ${p.length} characters without the \\\\?\\ prefix`), { code: 'ENOENT' });
        if (typeof p === 'string' && p.startsWith('\\\\?\\') && n === 'readFileSync') deepest = Math.max(deepest, p.length - 4);
      }
      return orig.apply(this, a);
    };
  }
};
const windows = process.platform === 'win32';
if (windows) { process.env.TEMP = deepTmp; process.env.TMP = deepTmp; strict(); }

const servers = [];
async function host(name) {
  const root = path.join(root0, name, 'Business-Wrap');
  const ws = { parent: path.join(root0, name), root, chosen: true, dirs: dirsOf(root) };
  const file = path.join(root0, `${name}.html`);
  fs.writeFileSync(file, '<!doctype html><title>x</title>');
  const server = await serve(file, 0, { workspace: ws });
  servers.push(server);
  const base_ = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, raw) => {
    const r = await fetch(base_ + p, { method, headers: raw ? { connection: 'close' } : { 'content-type': 'application/json', connection: 'close' }, ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  };
  const job = async (id) => { const t0 = Date.now(); for (;;) { const j = (await call('GET', `/api/project/job?id=${id}`)).body; if (j.state !== 'running') return j; if (Date.now() - t0 > 240000) throw new Error('job still running'); await new Promise((r) => setTimeout(r, 100)); } };
  const uploadImport = async (files) => {
    const up = `up-${crypto.randomBytes(16).toString('hex')}`;
    for (const e of files) { const r = await call('POST', `/api/project/upload?job=${up}&name=${encodeURIComponent(e.rel)}`, fs.readFileSync(lp(e.file)), true); if (r.status !== 200) throw new Error(`upload ${e.rel}: ${r.status}`); }
    return job((await call('POST', '/api/project/import', { job: up, project: 'مشروع تجريبي', onConflict: 'skip' })).body.job);
  };
  const inbox = async () => Promise.all((await call('GET', '/api/library/inbox')).body.ids.map(async (id) => (await call('GET', `/api/library/inbox?id=${id}`)).body));
  return { uploadImport, inbox };
}

const titles = shape.docs.map((d) => d.title);
const opsOf = (id) => shape.docs.find((d) => d.id === id).ops;
const assertRun = (label, j, inbox) => {
  const r = j.result || {};
  const sk = (k) => (r.skipped || []).filter((x) => x.kind === k).length;
  const got = (r.came_in || []).map((c) => c.title);
  check(`${label}: the job finished (${j.state})`, j.state === 'done', JSON.stringify(j).slice(0, 300));
  check(`${label}: each document once, under its real title`, got.length === shape.expect.came_in && titles.every((t) => got.filter((x) => x === t).length === 1), JSON.stringify(got));
  check(`${label}: every document came from its editor or share file, none from a PDF`, (r.came_in || []).every((c) => c.kind === 'save-html'), JSON.stringify((r.came_in || []).map((c) => c.kind)));
  check(`${label}: nothing failed`, (r.failed || []).length === shape.expect.failed, JSON.stringify(r.failed));
  check(`${label}: blank ${sk('blank')}, system ${sk('system')}, Exports ${sk('not-document')}, not needed ${sk('not-needed')}`, sk('blank') === shape.expect.blank && sk('system') === shape.expect.system && sk('not-document') === shape.expect.not_document && sk('not-needed') === shape.expect.not_needed, JSON.stringify(r.report?.counts));
  const by = (id) => inbox.find((e) => e.title === shape.docs.find((d) => d.id === id).title);
  check(`${label}: the work came in whole (A ${opsOf('A')}, B ${opsOf('B')}, C ${opsOf('C')} edits; B from the editor file, not its older share file)`, ['A', 'B', 'C'].every((id) => by(id)?.editions?.ar?.ops?.length === opsOf(id)), JSON.stringify(['A', 'B', 'C'].map((id) => by(id)?.editions?.ar?.ops?.length)));
};

try {
  const files = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(lp(d), { withFileTypes: true })) (e.isDirectory() ? walk(path.join(d, e.name), `${rel}${e.name}/`) : files.push({ file: path.join(d, e.name), rel: `${rel}${e.name}` })); };
  walk(path.join(tree, 'Fixture'), 'Fixture/');
  const longest = Math.max(...files.map((f) => path.join(deepTmp, 'bw-p-xxxxxx', 'z0abcd', f.rel).length));
  check(`fixture: ${files.length} files, the longest path under the deep temp folder is ${longest} characters (past 260)`, files.length === entries.length && longest > 260, `${files.length} ${longest}`);

  const Z = await host('z');
  const jz = await Z.uploadImport([{ file: zip, rel: path.basename(zip) }]);
  assertRun('zip via routes', jz, await Z.inbox());
  if (windows) check(`a path of ${deepest} characters was opened through the \\\\?\\ prefix (the zip's files)`, deepest > 260, String(deepest));

  const F = await host('f');
  const jf = await F.uploadImport(files);
  assertRun('folder via routes', jf, await F.inbox());

  // a file that cannot be opened is named as failed, never taken for a plain HTML (which let its PDF win)
  const ghost = { file: path.join(root0, 'no-such', 'x - مشاركة.html'), rel: 'X/x - مشاركة.html' };
  const pdf = { file: path.join(tree, 'Fixture', titles[0], `${titles[0]} - وثيقة المتطلبات.pdf`), rel: `X/x - وثيقة المتطلبات.pdf` };
  const plan = planSources([ghost, pdf]);
  check('an unreadable share file is `failed` with a reason and is not a candidate', plan.failed.length === 1 && plan.failed[0].file === ghost.rel && /cannot be opened/.test(plan.failed[0].reason) && plan.documents.length === 0, JSON.stringify(plan.failed));

  const direct = await importProject({ inputs: [zip], queue: async (docs) => ({ doc_id: docs.map((_, i) => `d${i}`) }) });
  check('importProject on the zip directly: 3 in, 0 failed', direct.came_in.length === 3 && !direct.failed.length, JSON.stringify(direct.failed));
} catch (e) {
  check('test run', false, e.stack || e);
} finally {
  for (const s of servers) await new Promise((r) => s.close(r));
  try { fs.rmSync(lp(root0), { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed} import-hp-0174 check(s)` : `import-hp-0174: ${out.length} checks, all passed`);
process.exit(failed ? 1 : 0);
