// Projects (H1, 0.13.1): the editor's project list and which document sits in which project, kept beside the library
// mirror in <workspace>\HISTORY\projects.json so a reload, a resumed host or a second browser finds the same groups.
//   GET  /api/projects          → the stored state ({} when none yet)
//   POST /api/projects {state}  → stored when newer than what is there (savedAt), else the stored one comes back
import fs from 'node:fs';
import path from 'node:path';
import { ensure, readJson } from '../workspace.mjs';

const PJ = /^pj-[A-Za-z0-9-]{4,64}$/;
const DOC = /^doc-[A-Za-z0-9-]{4,64}$/;
const ISO = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/;

/** A state as the editor writes it, or null: {v: 1, savedAt, projects: [{id, name, createdAt, deletedAt?}], of: {docId: pjId}}. */
export function cleanState(s) {
  if (!s || s.v !== 1 || !ISO.test(String(s.savedAt)) || !Array.isArray(s.projects) || s.projects.length > 500 || !s.of || typeof s.of !== 'object') return null;
  const projects = [];
  for (const p of s.projects) {
    if (!p || !PJ.test(String(p.id)) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 120) return null;
    projects.push({ id: p.id, name: p.name.trim(), createdAt: ISO.test(String(p.createdAt)) ? p.createdAt : s.savedAt, ...(ISO.test(String(p.deletedAt)) ? { deletedAt: p.deletedAt } : {}) });
  }
  const ids = new Set(projects.map((p) => p.id));
  const of = {};
  for (const [d, p] of Object.entries(s.of)) { if (!DOC.test(d) || !ids.has(p)) return null; of[d] = p; }
  return { v: 1, savedAt: s.savedAt, projects, of };
}

export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/projects') return false;
  try {
    if (!ctx.workspace) { send(200, { ok: false, stored: false }); return true; }
    const f = path.join(ensure(ctx.workspace).dirs.history, 'projects.json');
    let have = null;
    try { have = cleanState(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { /* none yet */ }
    if (req.method === 'GET') { send(200, { ok: true, state: have }); return true; }
    if (req.method === 'POST') {
      const s = cleanState((await readJson(req, 2 * 1024 * 1024)).state);
      if (!s) { send(400, { error: 'state: {v: 1, savedAt, projects: [{id: pj-…, name}], of: {doc-…: pj-…}}' }); return true; }
      if (have && have.savedAt > s.savedAt) { send(200, { ok: true, stored: false, state: have }); return true; }
      fs.writeFileSync(f, JSON.stringify(s, null, 1));
      send(200, { ok: true, stored: true, state: s });
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
