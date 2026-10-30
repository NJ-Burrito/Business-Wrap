// Projects (H1, 0.13.1; per-key merge 0.15.0): the editor's project list and which document sits in which project, kept beside the
// library mirror in <workspace>\.system\projects.json so a reload, a resumed host or a second browser finds the same groups.
//   GET  /api/projects                       → the stored state ({} when none yet)
//   POST /api/projects {state}               → MERGED into what is there, per key (see mergeStates), and the merged state comes back:
//                                              two tabs that assign different documents within 100 ms both keep their assignments
//   POST /api/projects/create {name}         → {ok, project: {id, name, …}, created}  (an existing live project of that name is returned, not doubled)
//   POST /api/projects/assign {doc, project} → {ok, doc, project}   project: a pj- id, a name, or null/'' for "no project"
// The state stays v1 on the wire; the merge keys are optional extras: a project's `updatedAt` / `purgedAt`, and `ofAt: {doc: iso}`
// (when each document's assignment was last decided, an unassign included: `ofAt` set, no `of` key).
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { ensure, readJson, systemDir } from '../workspace.mjs';

const PJ = /^pj-[A-Za-z0-9-]{4,64}$/;
const DOC = /^doc-[A-Za-z0-9-]{4,64}$/;
const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;

/** A state as the editor writes it, or null: {v: 1, savedAt, projects: [{id, name, createdAt, deletedAt?, updatedAt?, purgedAt?}], of: {docId: pjId}, ofAt?: {docId: iso}}. */
export function cleanState(s) {
  if (!s || s.v !== 1 || !ISO.test(String(s.savedAt)) || !Array.isArray(s.projects) || s.projects.length > 500 || !s.of || typeof s.of !== 'object') return null;
  const projects = [];
  for (const p of s.projects) {
    if (!p || !PJ.test(String(p.id)) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) return null;
    projects.push({
      id: p.id, name: p.name.trim(), createdAt: ISO.test(String(p.createdAt)) ? p.createdAt : s.savedAt,
      ...(ISO.test(String(p.deletedAt)) ? { deletedAt: p.deletedAt } : {}),
      ...(ISO.test(String(p.updatedAt)) ? { updatedAt: p.updatedAt } : {}),
      ...(ISO.test(String(p.purgedAt)) ? { purgedAt: p.purgedAt } : {}),
    });
  }
  const ids = new Set(projects.map((p) => p.id));
  const of = {};
  for (const [d, p] of Object.entries(s.of)) { if (!DOC.test(d) || !ids.has(p)) return null; of[d] = p; }
  const ofAt = {};
  if (s.ofAt && typeof s.ofAt === 'object') for (const [d, at] of Object.entries(s.ofAt)) if (DOC.test(d) && ISO.test(String(at))) ofAt[d] = at;
  return { v: 1, savedAt: s.savedAt, projects, of, ...(Object.keys(ofAt).length ? { ofAt } : {}) };
}

const stamp = (p) => p.updatedAt || p.createdAt;
/**
 * Two states into one, per key (the B6 race: whole-state "newer wins" dropped the other tab's assignment).
 *  - projects: union by id; the same id takes the copy with the later updatedAt (createdAt when none); a purgedAt stays once set.
 *  - documents: a side only has an opinion about a document it lists in `of` or `ofAt`; the opinion's time is ofAt[doc], else the
 *    state's savedAt. The later opinion wins; an assignment to a project the merge does not know is dropped.
 */
export function mergeStates(a, b) {
  if (!a) return b;
  if (!b) return a;
  const byId = new Map();
  for (const p of [...a.projects, ...b.projects]) {
    const q = byId.get(p.id);
    if (!q) { byId.set(p.id, p); continue; }
    const win = stamp(p) >= stamp(q) ? p : q;
    const purgedAt = p.purgedAt || q.purgedAt;
    byId.set(p.id, { ...win, ...(purgedAt ? { purgedAt } : {}) });
  }
  const projects = [...byId.values()];
  const of = {}, ofAt = {};
  const view = (s, d) => (d in s.of || (s.ofAt && d in s.ofAt) ? { pid: s.of[d] || null, at: s.ofAt?.[d] || s.savedAt } : null);
  const docs = new Set([...Object.keys(a.of), ...Object.keys(b.of), ...Object.keys(a.ofAt || {}), ...Object.keys(b.ofAt || {})]);
  for (const d of docs) {
    const x = view(a, d), y = view(b, d);
    const w = !x ? y : !y ? x : y.at >= x.at ? y : x;
    ofAt[d] = w.at;
    if (w.pid && byId.has(w.pid) && !byId.get(w.pid).purgedAt) of[d] = w.pid;
  }
  return { v: 1, savedAt: a.savedAt > b.savedAt ? a.savedAt : b.savedAt, projects, of, ofAt };
}

export const stateFile = (ctx) => path.join(systemDir(ensure(ctx.workspace).dirs), 'projects.json');
export function readState(ctx) {
  try { return cleanState(JSON.parse(fs.readFileSync(stateFile(ctx), 'utf8'))); } catch { return null; }
}
export function writeState(ctx, s) {
  const f = stateFile(ctx);
  fs.writeFileSync(`${f}.part`, JSON.stringify(s, null, 1));
  fs.renameSync(`${f}.part`, f);
}
const blank = () => ({ v: 1, savedAt: new Date(0).toISOString(), projects: [], of: {} });
const now = () => new Date().toISOString();
const clean = (name) => String(name || '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 120);

// a write is read-merge-write with no await in between, and Node runs the handler to its next await alone: two requests cannot interleave

/** The live project of that name (case-insensitive) or a new one; `id` pins a given pj- id (an imported project keeps its own). Returns {project, created}. */
export function ensureProject(ctx, name, { id } = {}) {
  const n = clean(name);
  if (!n) throw Object.assign(new Error('project name is empty'), { code: 400 });
  const st = readState(ctx) || blank();
  const have = st.projects.find((p) => !p.deletedAt && !p.purgedAt && p.name.toLowerCase() === n.toLowerCase());
  if (have) return { project: have, created: false, state: st };
  const p = { id: id && PJ.test(id) && !st.projects.some((x) => x.id === id) ? id : `pj-${crypto.randomUUID()}`, name: n, createdAt: now() };
  st.projects.push(p);
  st.savedAt = now();
  writeState(ctx, st);
  return { project: p, created: true, state: st };
}
/** Puts documents in a project (pid null = in none), recording when. Unknown / deleted project → throws 400. */
export function assignDocs(ctx, docs, pid) {
  const st = readState(ctx) || blank();
  if (pid && !st.projects.some((p) => p.id === pid && !p.purgedAt)) throw Object.assign(new Error(`unknown project ${pid}`), { code: 400 });
  const at = now();
  st.of = { ...st.of };
  st.ofAt = { ...(st.ofAt || {}) };
  for (const d of docs) {
    if (!DOC.test(String(d))) throw Object.assign(new Error(`bad document id ${String(d).slice(0, 40)}`), { code: 400 });
    if (pid) st.of[d] = pid; else delete st.of[d];
    st.ofAt[d] = at;
  }
  st.savedAt = at;
  writeState(ctx, st);
  return st;
}

export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/projects' && !url.pathname.startsWith('/api/projects/')) return false;
  try {
    if (!ctx.workspace) { send(200, { ok: false, stored: false }); return true; }
    const p = url.pathname;
    if (p === '/api/projects') {
      const have = readState(ctx);
      if (req.method === 'GET') { send(200, { ok: true, state: have }); return true; }
      if (req.method === 'POST') {
        const s = cleanState((await readJson(req, 2 * 1024 * 1024)).state);
        if (!s) { send(400, { error: 'state: {v: 1, savedAt, projects: [{id: pj-…, name}], of: {doc-…: pj-…}}' }); return true; }
        const merged = mergeStates(readState(ctx), s);
        const same = have && JSON.stringify(have) === JSON.stringify(merged);
        if (!same) writeState(ctx, merged);
        send(200, { ok: true, stored: !same, state: merged });
        return true;
      }
    }
    if (req.method === 'POST' && p === '/api/projects/create') {
      const b = await readJson(req, 64 * 1024);
      const r = ensureProject(ctx, b.name, { id: b.id });
      send(200, { ok: true, project: r.project, created: r.created });
      return true;
    }
    if (req.method === 'POST' && p === '/api/projects/assign') {
      const b = await readJson(req, 64 * 1024);
      const docs = Array.isArray(b.docs) ? b.docs : [b.doc];
      let pid = b.project || null;
      if (pid && !PJ.test(String(pid))) pid = ensureProject(ctx, pid).project.id; // a name
      const st = assignDocs(ctx, docs, pid);
      send(200, { ok: true, docs, project: pid, savedAt: st.savedAt });
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
