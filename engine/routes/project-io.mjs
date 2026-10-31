// Project export / import over HTTP (0.15.0, note 18). One job at a time; progress by poll and by SSE `progress` (ctx.broadcast).
//   POST /api/project/export {project, docs?, formats, locales, layout}  → {job}     project: pj- id or name; docs: library entries (else the project's mirrored documents)
//   POST /api/project/upload?job=up-<id>&name=<relative path>            raw body → {ok, bytes}   a file or folder entry for an import; 500 MB each
//   POST /api/project/import {job?|paths?, project?, onConflict?}        → {job}     job: the upload id; paths: files/folders/zips on this machine
//   GET  /api/project/job?id=                                            → {id, kind, state: running|done|failed|cancelled, done, total, file, result?, error?}
//   POST /api/project/job/cancel {id}                                    → {ok}      stops after the current file; an export removes what it wrote
//   GET  /api/project/file?job=                                          → the zip of a finished export (download)
//   POST /api/project/reveal {job}                                       → opens the output folder (engine/host.mjs reveal)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { ensure, readJson, systemDir, subdir } from '../workspace.mjs';
import { exportProject, PROJECTS_NAME } from '../project-export.mjs';
import { importProject, editionKey } from '../project-import.mjs';
import { queueDocuments, mirrorEntry, push } from './library.mjs';
import { readState } from './projects.mjs';
import { reveal } from '../host.mjs';

const UP = /^up-[a-f0-9-]{8,40}$/;
const MAX_UPLOAD = 500 * 1024 * 1024;
const jobs = new Map(); // id → job (the last 30)
let running = null;

const view = (j) => ({ id: j.id, kind: j.kind, state: j.state, done: j.done, total: j.total, file: j.file, index: j.index, docs: j.docs, ...(j.result ? { result: j.result } : {}), ...(j.error ? { error: j.error } : {}), startedAt: j.startedAt });
function newJob(ctx, kind) {
  const j = { id: `job-${crypto.randomBytes(6).toString('hex')}`, kind, state: 'running', done: 0, total: 0, file: '', cancel: false, startedAt: new Date().toISOString() };
  jobs.set(j.id, j);
  for (const k of [...jobs.keys()].slice(0, Math.max(0, jobs.size - 30))) if (jobs.get(k).state !== 'running') jobs.delete(k);
  running = j;
  j.push = () => push(ctx, 'progress', { job: j.id, kind, done: j.done, total: j.total, file: j.file, state: j.state });
  return j;
}
const finish = (j, state, patch = {}) => { Object.assign(j, patch, { state }); if (running === j) running = null; j.push(); };

const upDir = (id) => path.join(os.tmpdir(), `bw-upload-${id}`);
/** Hashes of every document text the library mirror holds: what an import's duplicates are judged against. */
function knownHashes(ctx) {
  const set = new Set();
  const dir = subdir(ensure(ctx.workspace).dirs, 'library');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')) : []) {
    try { const e = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString('utf8')); if (e.deletedAt) continue; for (const x of Object.values(e.editions || {})) if (x.raw) set.add(editionKey(x.raw, x.ops)); } catch { /* skip a bad entry */ }
  }
  return set;
}

/** The documents of a project as library entries (the request's own `docs`, else the mirror's), and the project's name. */
function resolveDocs(ctx, b) {
  const st = readState(ctx);
  const pj = st?.projects.find((p) => !p.purgedAt && (p.id === b.project || p.name === b.project));
  const name = pj?.name || String(b.project || '').trim();
  let docs;
  if (Array.isArray(b.docs) && b.docs.length) docs = b.docs.map((d) => (typeof d === 'string' ? mirrorEntry(ctx, d) : d)).filter(Boolean);
  else docs = Object.entries(st?.of || {}).filter(([, p]) => p === pj?.id).map(([d]) => mirrorEntry(ctx, d)).filter((e) => e && !e.deletedAt);
  docs = docs.filter((d) => d && d.editions && Object.values(d.editions).some((e) => e?.raw));
  if (b.docs?.length && docs.length < b.docs.length) { /* ids not mirrored are reported by the caller through `missing` */ }
  return { name, docs };
}

export default async (req, url, send, ctx, res) => {
  const p = url.pathname;
  if (!p.startsWith('/api/project/')) return false;
  try {
    if (!ctx.workspace) { send(409, { error: 'no save folder: this server was started with --out' }); return true; }
    if (req.method === 'GET' && p === '/api/project/job') {
      const j = jobs.get(String(url.searchParams.get('id')));
      if (!j) { send(404, { error: 'unknown job' }); return true; }
      send(200, view(j));
      return true;
    }
    if (req.method === 'POST' && p === '/api/project/job/cancel') {
      const j = jobs.get(String((await readJson(req, 4096)).id));
      if (!j) { send(404, { error: 'unknown job' }); return true; }
      if (j.state === 'running') j.cancel = true;
      send(200, { ok: true, state: j.state });
      return true;
    }
    if (req.method === 'GET' && p === '/api/project/file') {
      const j = jobs.get(String(url.searchParams.get('job')));
      const f = j?.result?.zip;
      if (!f || !fs.existsSync(f) || !f.startsWith(path.join(ctx.workspace.root, PROJECTS_NAME) + path.sep)) { send(404, { error: 'no zip for this job' }); return true; }
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': fs.statSync(f).size, 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(f))}`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      fs.createReadStream(f).pipe(res);
      return true;
    }
    if (req.method === 'POST' && p === '/api/project/reveal') {
      const j = jobs.get(String((await readJson(req, 4096)).job));
      const f = j?.result?.zip || j?.result?.root;
      if (!f || !fs.existsSync(f)) { send(404, { error: 'nothing to open' }); return true; }
      reveal(f);
      send(200, { ok: true });
      return true;
    }
    if (req.method === 'POST' && p === '/api/project/upload') {
      const job = String(url.searchParams.get('job')), rel = String(url.searchParams.get('name') || '').replace(/\\/g, '/');
      if (!UP.test(job) || !rel || rel.startsWith('/') || rel.split('/').some((x) => x === '..' || x === '.' || !x) || /[:\u0000]/.test(rel) || rel.length > 400) { send(400, { error: 'upload: job=up-<id>&name=<relative path>' }); return true; }
      const target = path.join(upDir(job), ...rel.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let bytes = 0, over = false;
      const out = fs.createWriteStream(target);
      await new Promise((ok, no) => {
        req.on('data', (c) => { bytes += c.length; if (bytes > MAX_UPLOAD) { over = true; req.destroy(); out.destroy(); ok(); } });
        req.on('error', no); out.on('error', no); out.on('finish', ok); req.pipe(out);
      });
      if (over) { fs.rmSync(target, { force: true }); send(413, { error: 'upload: 500 MB per file' }); return true; }
      send(200, { ok: true, bytes });
      return true;
    }
    if (req.method === 'POST' && p === '/api/project/export') {
      const b = await readJson(req, 200 * 1024 * 1024);
      if (running) { send(409, { error: 'a project export or import is already running', job: running.id }); return true; }
      const { name, docs } = resolveDocs(ctx, b);
      if (!name) { send(400, { error: 'export: {project} is required' }); return true; }
      if (!docs.length) { send(400, { error: `export: the project "${name}" has no documents (nothing mirrored to the save folder yet?)` }); return true; }
      const j = newJob(ctx, 'export');
      j.docs = docs.length;
      const root = ensure(ctx.workspace).root;
      exportProject({
        project: name, docs, formats: b.formats, locales: b.locales || 'both', layout: b.layout === 'zip' ? 'zip' : 'folder', outParent: root,
        onProgress: (o) => { j.done = o.done ?? j.done; j.total = o.total ?? j.total; j.file = o.title ? `${o.title} · ${o.locale || ''} ${o.format || ''}`.trim() : j.file; j.index = o.index; j.push(); },
        isCancelled: () => j.cancel,
      }).then((r) => {
        const failed = r.items.filter((x) => !x.ok);
        finish(j, r.cancelled ? 'cancelled' : 'done', { result: { cancelled: r.cancelled, root: r.root, zip: r.zip, items: r.items.map(({ doc, title, ok, files, error }) => ({ doc, title, ok, files, ...(error ? { error } : {}) })), done: r.items.length - failed.length, failed: failed.length } });
      }).catch((e) => finish(j, 'failed', { error: String(e.message || e).slice(0, 300) }));
      send(200, { job: j.id });
      return true;
    }
    if (req.method === 'POST' && p === '/api/project/import') {
      const b = await readJson(req, 4 * 1024 * 1024);
      if (running) { send(409, { error: 'a project export or import is already running', job: running.id }); return true; }
      let inputs = Array.isArray(b.paths) ? b.paths.map(String) : [];
      const cleanup = [];
      if (b.job) {
        if (!UP.test(String(b.job)) || !fs.existsSync(upDir(b.job))) { send(400, { error: 'import: unknown upload job' }); return true; }
        inputs = [upDir(b.job)];
        cleanup.push(upDir(b.job));
      }
      if (!inputs.length) { send(400, { error: 'import: {job} (uploaded files) or {paths} is required' }); return true; }
      const j = newJob(ctx, 'import');
      importProject({
        inputs, project: b.project, locale: b.locale, onConflict: b.onConflict === 'keep' ? 'keep' : 'skip', known: knownHashes(ctx),
        onProgress: (o) => { j.done = o.done; j.total = o.total; j.file = o.file || j.file; j.push(); },
        isCancelled: () => j.cancel,
        queue: async (documents, opts) => queueDocuments(ctx, documents, opts),
      }).then((r) => finish(j, r.cancelled ? 'cancelled' : 'done', { result: r }))
        .catch((e) => finish(j, 'failed', { error: String(e.message || e).slice(0, 300) }))
        .finally(() => { for (const d of cleanup) fs.rmSync(d, { recursive: true, force: true }); });
      send(200, { job: j.id });
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 409 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
