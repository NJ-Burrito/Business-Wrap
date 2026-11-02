// The save folder over HTTP (A11): read it, choose it (the in-editor picker, or a typed path), and write a Save-HTML file as the document's own file (Documents\<title>\<title>.html).
import path from 'node:path';
import { reveal } from '../host.mjs';
import { workspace, ensure, setParent, pickParent, pickerOpen, pickerState, pickerGo, pickerMkdir, pickerChoose, pickerCancel, pickerWait, saveHtml, saveCopy, revealable, readJson, README_NAME } from '../workspace.mjs';

export default async (req, url, send, ctx) => {
  if (!url.pathname.startsWith('/api/workspace')) return false;
  try {
    const live = () => ctx.workspace || workspace();
    if (req.method === 'GET' && url.pathname === '/api/workspace') { const w = live(); send(200, { ...w, served: !!ctx.workspace }); return true; }
    // The picker (0.15.9): its state is host state. Every verb is a POST behind the host token (a tool) or this server's own page (the panel).
    //   /api/workspace/picker/{state,open,go,mkdir,choose,cancel,wait}  body {path?, name?, by?, since?, ms?}  → {ok, rev, open, picker, last}
    const pk = /^\/api\/workspace\/picker\/(state|open|go|mkdir|choose|cancel|wait)$/.exec(url.pathname);
    if (pk) {
      if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
      const tokenSet = process.env.BW_HOST_TOKEN;
      if (tokenSet && req.headers['x-bw-token'] !== tokenSet && !req.headers.origin) { send(403, { ok: false, code: 'AUTH', error: 'x-bw-token missing or wrong (read it from the host state file)' }); return true; }
      const b = await readJson(req).catch(() => ({}));
      try {
        const v = { state: () => pickerState(), open: () => pickerOpen({ path: b.path, by: b.by || 'agent' }), go: () => pickerGo(b.path), mkdir: () => pickerMkdir(b.name), choose: () => pickerChoose(b.path), cancel: () => pickerCancel(), wait: () => pickerWait(b.since, b.ms) }[pk[1]];
        const r = await v();
        send(200, { ok: true, ...r, ...(pk[1] === 'choose' && r.last?.outcome === 'chosen' && !r.open ? { chosen: r.last.parent, workspace: workspace() } : {}) });
      } catch (e) { send(e.pickerCode === 'closed' ? 409 : 400, { ok: false, code: e.pickerCode || 'BAD_ARGS', error: String(e.message || e).slice(0, 300) }); }
      return true;
    }
    // The old dialog route, kept for older callers (12-session.js): it opens the picker panel and answers when the person (or an agent) chooses or cancels.
    if (req.method === 'POST' && url.pathname === '/api/workspace/pick') {
      const ms = Number(process.env.BW_PICK_TIMEOUT_MS) || 15 * 60 * 1000;
      const p = await Promise.race([pickParent(), new Promise((ok) => setTimeout(() => ok(undefined), ms).unref())]);
      if (p === undefined) { send(200, { ok: false, pending: true, ...pickerState() }); return true; } // still open: the panel (or an agent) can finish it
      send(200, { ok: !!p, ...(p ? workspace() : {}) });
      return true;
    }
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
