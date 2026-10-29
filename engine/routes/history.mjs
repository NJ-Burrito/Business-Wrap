// A13/A17 mirror + A16 share (design.md §3): the HISTORY store of bwlog v1 logs and the shared HTML folder.
//   GET  /api/history?doc=<id>   → { log: <envelope>|null, mirror: {doc, head, hashes, pins}|null }
//   POST /api/history            { doc, log, mirror } → writes <doc>.bwlog + <doc>.heads.json; the head never moves back
//   POST /api/share              { name, html } → writes the Save-HTML into the workspace HTML folder → { path, dir }
//   POST /api/share/open         { path } → shows that file in the file manager (only inside the HTML folder)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sharePath } from '../workspace.mjs';

const MAX = 64 * 1024 * 1024;
/** The workspace folders: ctx.workspace (tests, the server), else WP3's engine/workspace.mjs, else a stub under Documents. */
export async function dirsOf(ctx) {
  const w = typeof ctx.workspace === 'function' ? ctx.workspace() : ctx.workspace;
  if (w?.dirs) return w.dirs;
  const mod = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'workspace.mjs');
  if (fs.existsSync(mod)) { try { const d = (await import(pathToFileURL(mod).href)).workspace()?.dirs; if (d) return d; } catch { /* stub below */ } }
  // ponytail: stub until WP3's workspace.mjs merges; never inside the repo
  const root = path.join(os.homedir(), 'Documents', 'Business-Wrap');
  return { pdf: path.join(root, 'PDF'), docx: path.join(root, 'DOCX'), html: path.join(root, 'HTML'), history: path.join(root, 'HISTORY') };
}
export const docFile = (doc) => (/^[\w.:-]{1,120}$/.test(doc || '') ? doc.replace(/:/g, '_') : null);
export async function body(req) {
  let n = 0; const parts = [];
  for await (const c of req) { n += c.length; if (n > MAX) throw Object.assign(new Error('too large'), { code: 413 }); parts.push(c); }
  return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}');
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export default async (req, url, send, ctx) => {
  if (!['/api/history', '/api/share', '/api/share/open'].includes(url.pathname)) return false;
  const dirs = await dirsOf(ctx);
  try {
    if (url.pathname === '/api/history' && req.method === 'GET') {
      const stem = docFile(url.searchParams.get('doc'));
      if (!stem) return send(400, { error: 'doc' }), true;
      const f = path.join(dirs.history, stem);
      send(200, { log: fs.existsSync(f + '.bwlog') ? fs.readFileSync(f + '.bwlog', 'utf8') : null, mirror: readJson(f + '.heads.json') });
      return true;
    }
    if (url.pathname === '/api/history' && req.method === 'POST') {
      const b = await body(req);
      const stem = docFile(b.doc);
      if (!stem || typeof b.log !== 'string' || !/^\{"fmt":"bwlog","v":1,/.test(b.log)) return send(400, { error: 'bad log' }), true;
      fs.mkdirSync(dirs.history, { recursive: true });
      const f = path.join(dirs.history, stem);
      const old = readJson(f + '.heads.json');
      const m = b.mirror || {};
      // the highest point ever seen here wins; the first key pinned for an actor id stays pinned
      const keepOld = old?.head && (!m.head || old.head.seq > m.head.seq);
      const rec = { doc: b.doc, head: keepOld ? old.head : m.head || null, hashes: keepOld ? old.hashes : m.hashes || [], pins: { ...(m.pins || {}), ...(old?.pins || {}) } };
      fs.writeFileSync(f + '.bwlog', b.log);
      fs.writeFileSync(f + '.heads.json', JSON.stringify(rec));
      send(200, { ok: true, mirror: rec });
      return true;
    }
    if (url.pathname === '/api/share' && req.method === 'POST') {
      const b = await body(req);
      const name = String(b.name || '').replace(/[\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120);
      if (!/\.html$/i.test(name) || typeof b.html !== 'string') return send(400, { error: 'bad share' }), true;
      fs.mkdirSync(dirs.html, { recursive: true });
      const p = sharePath(dirs.html, b.html, name); // named like every saved file: <title>-<date>-<AR|ENG>.html (A11)
      fs.writeFileSync(p, b.html, 'utf8');
      send(200, { path: p, dir: dirs.html });
      return true;
    }
    if (url.pathname === '/api/share/open' && req.method === 'POST') {
      const p = path.resolve(String((await body(req)).path || ''));
      if (!p.startsWith(path.resolve(dirs.html) + path.sep) || !fs.existsSync(p)) return send(404, { error: 'not found' }), true;
      const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [`/select,${p}`]] : process.platform === 'darwin' ? ['open', ['-R', p]] : ['xdg-open', [path.dirname(p)]];
      spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
      send(200, { ok: true });
      return true;
    }
    send(405, { error: 'method' });
  } catch (e) { send(e.code === 413 ? 413 : 400, { error: String(e.message || e) }); }
  return true;
};
