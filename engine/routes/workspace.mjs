// The save folder over HTTP (A11): read it, choose it (OS dialog or a typed path), and write a Save-HTML file into HTML\.
import fs from 'node:fs';
import { workspace, ensure, setParent, pickParent, outName, uniquePath, readJson } from '../workspace.mjs';

export default async (req, url, send, ctx) => {
  if (!url.pathname.startsWith('/api/workspace')) return false;
  try {
    const live = () => ctx.workspace || workspace();
    if (req.method === 'GET' && url.pathname === '/api/workspace') { const w = live(); send(200, { ...w, served: !!ctx.workspace }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/workspace/pick') { const p = await pickParent(); send(200, { ok: !!p, ...(p ? workspace() : {}) }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/workspace/parent') { send(200, { ok: true, ...setParent((await readJson(req)).parent) }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/workspace/html') {
      const b = await readJson(req);
      if (typeof b.html !== 'string' || !/^\s*<!doctype html>/i.test(b.html)) { send(400, { error: 'html: a Save-HTML document' }); return true; }
      if (!ctx.workspace) { send(409, { error: 'no save folder: this server was started with --out' }); return true; }
      const w = ensure(ctx.workspace);
      const file = uniquePath(w.dirs.html, outName(b.title || 'document', new Date(), b.locale, 'html'));
      fs.writeFileSync(file, b.html, 'utf8');
      send(200, { ok: true, file });
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
