// The document library's server half (A2): import a DOCX/PDF/HTML as a new document, the blank placeholder SRS,
// and the machine-only mirror of each saved library entry in <workspace>\.system\library\ (gzip, not for hand use).
// 0.15.0 (lane projects): the library <-> disk ingest and the library import route.
//   GET  /api/library/list                 → [{id, title, savedAt, deletedAt?, project?, bytes}] from the mirror dir
//   POST /api/library/import {documents:[{ar?, en?, name?, title?, ops?, project?}], project?}
//        → {library: true, queued, doc_id: [...], url: '/#doc=<id>', project}   the SERVER mints doc-<uuid> ids, writes
//          <workspace>\.system\inbox\<id>.json.gz, assigns the project, and pushes SSE `ingest {ids}` (ctx.broadcast) when a tab listens;
//          200 even with no tab open: the tab reads the inbox on its next boot (editor/ext/10-library.js ingestMirror)
//   GET  /api/library/inbox[?id=]          → {ids} / one inbox entry;  DELETE /api/library/inbox?id=  the tab confirms it stored it
//   GET  /api/library/mirror?tombstones=1  → {ids}: purged documents, which ingest never brings back
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { REPO } from '../export.mjs';
import { ensure, readJson, saveHtml, subdir } from '../workspace.mjs';
import { importFile } from '../import/import.mjs';
import { assignDocs, ensureProject, readState } from './projects.mjs';

const ID = /^doc-[A-Za-z0-9-]{4,64}$/;
const PJID = /^pj-[A-Za-z0-9-]{4,64}$/;

const libDir = (ctx) => subdir(ensure(ctx.workspace).dirs, 'library');
const inboxDir = (ctx) => subdir(ensure(ctx.workspace).dirs, 'inbox');
const tombFile = (ctx) => path.join(libDir(ctx), 'purged.json');
const readTombs = (ctx) => { try { const a = JSON.parse(fs.readFileSync(tombFile(ctx), 'utf8')); return Array.isArray(a) ? a.filter((x) => ID.test(String(x))) : []; } catch { return []; } };
const writeTombs = (ctx, ids) => { fs.mkdirSync(libDir(ctx), { recursive: true }); fs.writeFileSync(tombFile(ctx), JSON.stringify([...new Set(ids)].slice(-5000))); };
const sha = (raw) => `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`;
const PLACEHOLDER = new Set(['خدمة جديدة', 'New service']);

/** The title of a document JSON the way the tab names it (cover title, else the service-name part of the document title). */
export function titleOfRaw(raw, fallback = 'document') {
  const c = JSON.parse(raw).control || {};
  return String(c.coverTitle || String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title || fallback).trim();
}

/** One incoming document {ar?, en?, title?, ops?: {ar, en}, project?} → a library entry the tab stores as it is (editions as 10-library.js writes them). */
export function makeEntry(d, { origin = 'import' } = {}) {
  const editions = {};
  for (const ed of ['ar', 'en']) {
    const v = d[ed];
    if (v == null || v === '') continue;
    const raw = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
    let doc;
    try { doc = JSON.parse(raw); } catch { throw Object.assign(new Error(`${ed}: not JSON`), { code: 400 }); }
    if (!doc?.chapters || !doc?.control) throw Object.assign(new Error(`${ed}: not a Business-Wrap document (chapters and control are missing)`), { code: 400 });
    const ops = (d.ops?.[ed] || []).filter((o) => o && typeof o.op === 'string' && typeof o.path === 'string').map((o, i) => (o.id ? o : { ...o, id: `i${i.toString(36)}${Date.now().toString(36).slice(-4)}` }));
    editions[ed] = { name: '', raw, hash: sha(raw), ops, status: {}, stale: [], comments: [], versions: [], marks: [], epochIds: [] };
  }
  if (!Object.keys(editions).length) throw Object.assign(new Error('document: {ar} or {en} (a document JSON) is required'), { code: 400 });
  const first = Object.values(editions)[0].raw;
  const now = new Date().toISOString(), id = `doc-${crypto.randomUUID()}`;
  let title = String(d.title || '').trim();
  if (!title) { const names = Object.values(editions).map((e) => titleOfRaw(e.raw, id)); title = names.find((n) => n && !PLACEHOLDER.has(n)) || names[0]; }
  return { id, title, service: JSON.parse(first).service || 'document', origin, createdAt: now, savedAt: now, editions, bwlog: 1 };
}

/**
 * Documents into the library through the inbox. All are validated before anything is written.
 * @returns {{library: true, queued: number, doc_id: string[], url: string|null, project: string|null, entries: object[]}}
 */
export function queueDocuments(ctx, documents, { project, origin = 'import' } = {}) {
  if (!ctx.workspace) throw Object.assign(new Error('no save folder: this server was started with --out'), { code: 409 });
  if (!Array.isArray(documents) || !documents.length) throw Object.assign(new Error('documents: [{ar?, en?, name?, project?}] is required'), { code: 400 });
  if (documents.length > 500) throw Object.assign(new Error('documents: at most 500 per request'), { code: 400 });
  const entries = documents.map((d) => makeEntry(d, { origin }));
  const dir = inboxDir(ctx);
  fs.mkdirSync(dir, { recursive: true });
  const pidOf = (d) => {
    const want = d.project ?? project;
    if (!want) return null;
    if (PJID.test(String(want)) && readState(ctx)?.projects.some((p) => p.id === want && !p.purgedAt)) return want;
    return ensureProject(ctx, String(want)).project.id;
  };
  const byProject = new Map();
  entries.forEach((e, i) => {
    const pid = pidOf(documents[i]);
    if (pid) { byProject.set(pid, [...(byProject.get(pid) || []), e.id]); e.project = pid; }
    fs.writeFileSync(path.join(dir, `${e.id}.json.gz`), zlib.gzipSync(JSON.stringify(e)));
  });
  for (const [pid, ids] of byProject) assignDocs(ctx, ids, pid);
  const ids = entries.map((e) => e.id);
  try { ctx.broadcast?.('ingest', { ids }); } catch { /* no push channel: the next boot reads the inbox */ }
  return { library: true, queued: ids.length, doc_id: ids, url: `/#doc=${ids[0]}`, project: [...byProject.keys()][0] || null, entries };
}

const listCache = new Map(); // file → {mtimeMs, size, row}
function listMirror(ctx) {
  const dir = libDir(ctx);
  const of = readState(ctx)?.of || {};
  const rows = [], seen = new Set();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')) : []) {
    const file = path.join(dir, f), st = fs.statSync(file);
    seen.add(file);
    let c = listCache.get(file);
    if (!c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) {
      try {
        const e = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
        c = { mtimeMs: st.mtimeMs, size: st.size, row: ID.test(String(e.id)) ? { id: e.id, title: String(e.title || ''), savedAt: e.savedAt || null, ...(e.deletedAt ? { deletedAt: e.deletedAt } : {}), bytes: st.size } : null };
      } catch { c = { mtimeMs: st.mtimeMs, size: st.size, row: null }; }
      listCache.set(file, c);
    }
    if (c.row) rows.push({ ...c.row, ...(of[c.row.id] ? { project: of[c.row.id] } : {}) });
  }
  for (const k of [...listCache.keys()]) if (!seen.has(k) && k.startsWith(dir)) listCache.delete(k);
  return rows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

/** A mirror entry by id (the whole library entry) or null: what an export of a project reads. */
export function mirrorEntry(ctx, id) {
  if (!ctx.workspace || !ID.test(String(id))) return null;
  const f = path.join(libDir(ctx), `${id}.json.gz`);
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString('utf8')); } catch { return null; }
}

export default async (req, url, send, ctx) => {
  const p = url.pathname;
  if (p !== '/api/import' && !p.startsWith('/api/library/')) return false;
  try {
    if (req.method === 'POST' && p === '/api/import') {
      const b = await readJson(req, 80 * 1024 * 1024);
      const ext = path.extname(String(b.name || '')).toLowerCase();
      if (!['.pdf', '.docx', '.html', '.htm'].includes(ext) || typeof b.data !== 'string') { send(400, { error: 'import: {name: *.pdf|*.docx|*.html, data: base64}' }); return true; }
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-import-'));
      const f = path.join(dir, `in${ext}`);
      try {
        fs.writeFileSync(f, Buffer.from(b.data, 'base64'));
        send(200, importFile(f, { locale: b.locale, name: path.basename(String(b.name)) }));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      return true;
    }
    if (req.method === 'GET' && p === '/api/library/list') {
      send(200, ctx.workspace ? listMirror(ctx) : []);
      return true;
    }
    if (req.method === 'POST' && p === '/api/library/import') {
      const b = await readJson(req, 200 * 1024 * 1024);
      const { entries, ...rest } = queueDocuments(ctx, b.documents, { project: b.project });
      send(200, rest);
      return true;
    }
    if (p === '/api/library/inbox') {
      if (!ctx.workspace) { send(req.method === 'GET' ? 200 : 400, req.method === 'GET' ? { ids: [] } : { error: 'no save folder' }); return true; }
      const dir = inboxDir(ctx), id = url.searchParams.get('id');
      if (req.method === 'GET') {
        if (!id) { send(200, { ids: fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json.gz')).map((x) => x.slice(0, -8)).filter((x) => ID.test(x)) : [] }); return true; }
        const f = path.join(dir, `${id}.json.gz`);
        if (!ID.test(String(id)) || !fs.existsSync(f)) { send(404, { error: 'not found' }); return true; }
        send(200, zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
        return true;
      }
      if (req.method === 'DELETE') {
        if (!ID.test(String(id))) { send(400, { error: 'id' }); return true; }
        fs.rmSync(path.join(dir, `${id}.json.gz`), { force: true });
        send(200, { ok: true });
        return true;
      }
    }
    if (req.method === 'GET' && p === '/api/library/blank') {
      const dir = path.join(REPO, 'samples', 'blank');
      send(200, Object.fromEntries(['ar', 'en'].map((l) => [l, fs.readFileSync(path.join(dir, `document.${l}.json`), 'utf8')])));
      return true;
    }
    if (req.method === 'POST' && p === '/api/library/html') {
      // H3 Save in place: the document's own file Documents\<title>\<title>.html, found by its id (so a renamed document keeps its
      // file), overwritten on every Save; the file it replaces is kept in Versions\. A second document with the same title gets " (2)".
      const b = await readJson(req);
      if (!ID.test(String(b.id)) || typeof b.html !== 'string' || !/^\s*<!doctype html>/i.test(b.html) || !b.html.includes('id="bw-data"')) { send(400, { error: 'html: {id, html: a Save-HTML document}' }); return true; }
      if (!ctx.workspace) { send(409, { error: 'no save folder: this server was started with --out' }); return true; }
      const r = saveHtml(ensure(ctx.workspace), { id: b.id, title: b.title || '', html: b.html });
      send(200, { ok: true, file: r.file, folder: r.folder, overwritten: r.overwritten, version: r.version });
      return true;
    }
    if (p === '/api/library/mirror') {
      if (!ctx.workspace) { send(200, { ok: false, mirrored: false }); return true; }
      const dir = libDir(ctx);
      if (req.method === 'POST') {
        const { entry } = await readJson(req);
        if (!entry || !ID.test(String(entry.id))) { send(400, { error: 'entry.id' }); return true; }
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, `${entry.id}.json.gz`);
        if (entry.purge) { fs.rmSync(f, { force: true }); writeTombs(ctx, [...readTombs(ctx), entry.id]); } // a tombstone: ingest never brings a purged document back
        else fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(entry)));
        send(200, { ok: true, mirrored: !entry.purge });
        return true;
      }
      if (req.method === 'GET' && url.searchParams.has('tombstones')) { send(200, { ids: readTombs(ctx) }); return true; }
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const f = path.join(dir, `${id}.json.gz`);
        if (!ID.test(String(id)) || !fs.existsSync(f)) { send(404, { error: 'not found' }); return true; }
        send(200, zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
        return true;
      }
    }
  } catch (e) { send(e.code === 400 || e.code === 409 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
