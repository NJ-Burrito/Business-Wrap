// The document library's server half (A2): import a DOCX/PDF/HTML as a new document, the blank placeholder SRS,
// and the machine-only mirror of each saved library entry in <workspace>\.system\library\ (gzip, not for hand use).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { REPO } from '../export.mjs';
import { ensure, readJson, saveHtml, subdir } from '../workspace.mjs';
import { importFile } from '../import/import.mjs';

const ID = /^doc-[A-Za-z0-9-]{4,64}$/;

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
      const dir = subdir(ensure(ctx.workspace).dirs, 'library');
      if (req.method === 'POST') {
        const { entry } = await readJson(req);
        if (!entry || !ID.test(String(entry.id))) { send(400, { error: 'entry.id' }); return true; }
        fs.mkdirSync(dir, { recursive: true });
        const f = path.join(dir, `${entry.id}.json.gz`);
        if (entry.purge) fs.rmSync(f, { force: true });
        else fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(entry)));
        send(200, { ok: true, mirrored: !entry.purge });
        return true;
      }
      if (req.method === 'GET') {
        const id = url.searchParams.get('id');
        const f = path.join(dir, `${id}.json.gz`);
        if (!ID.test(String(id)) || !fs.existsSync(f)) { send(404, { error: 'not found' }); return true; }
        send(200, zlib.gunzipSync(fs.readFileSync(f)).toString('utf8'));
        return true;
      }
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
