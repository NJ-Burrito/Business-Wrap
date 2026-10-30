// The save folder over HTTP (A11): read it, choose it (OS dialog or a typed path), and write a Save-HTML file as the document's own file (Documents\<title>\<title>.html).
import path from 'node:path';
import { reveal } from '../host.mjs';
import { workspace, ensure, setParent, pickParent, saveHtml, saveCopy, revealable, readJson, README_NAME } from '../workspace.mjs';

export default async (req, url, send, ctx) => {
  if (!url.pathname.startsWith('/api/workspace')) return false;
  try {
    const live = () => ctx.workspace || workspace();
    if (req.method === 'GET' && url.pathname === '/api/workspace') { const w = live(); send(200, { ...w, served: !!ctx.workspace }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/workspace/pick') { const p = await pickParent(); send(200, { ok: !!p, ...(p ? workspace() : {}) }); return true; }
    if (req.method === 'POST' && url.pathname === '/api/workspace/parent') { send(200, { ok: true, ...setParent((await readJson(req)).parent) }); return true; }
    // Settings «افتح المجلد / Open folder»: the file manager on the tree root (its README selected, so the folder itself opens)
    if (req.method === 'POST' && url.pathname === '/api/workspace/open') {
      const w = ensure(live());
      const b = await readJson(req).catch(() => ({}));
      if (b.file !== undefined) { // 0.14.0 «افتح المجلد» after a report / a copy: that file selected in its folder, only inside the documents folder
        const p = revealable(w, String(b.file));
        if (!p) { send(404, { error: 'not found' }); return true; }
        reveal(p);
        send(200, { ok: true, folder: path.dirname(p), file: p });
        return true;
      }
      reveal(path.join(w.root, README_NAME));
      send(200, { ok: true, root: w.root });
      return true;
    }
    if (req.method === 'POST' && url.pathname === '/api/workspace/html') {
      const b = await readJson(req);
      if (typeof b.html !== 'string' || !/^\s*<!doctype html>/i.test(b.html)) { send(400, { error: 'html: a Save-HTML document' }); return true; }
      if (!ctx.workspace) { send(409, { error: 'no save folder: this server was started with --out' }); return true; }
      const w = ensure(ctx.workspace);
      if (b.copy === true) { // «حفظ نسخة جديدة / Save as new copy»: a new dated file in Versions\, the document's own file untouched
        const c = saveCopy(w, { title: b.title || '', html: b.html });
        send(200, { ok: true, file: c.file, folder: c.folder, copy: true, overwritten: false });
        return true;
      }
      const r = saveHtml(w, { title: b.title || '', html: b.html });
      send(200, { ok: true, file: r.file, folder: r.folder, overwritten: r.overwritten, version: r.version });
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
