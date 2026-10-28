// /api/learning/* for engine/serve.mjs: the editor's learning hook writes here. 127.0.0.1 only
// (serve binds it), same-origin only, nothing is ever forwarded anywhere.
import * as L from './store.mjs';
import { rulesMarkdown } from './core.mjs';

const MAX = 8 * 1024 * 1024;
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > MAX) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/** Handles one /api/learning/* request through serve's `send`. */
export async function learningRoute(req, url, send) {
  if (req.headers.origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.origin)) return send(403, { error: 'origin' });
  const p = url.pathname.slice('/api/learning/'.length);
  if (req.method === 'GET') {
    if (p === 'status') return send(200, L.status());
    if (p === 'rules') { const r = L.rules(); return send(200, { rules: r, markdown: rulesMarkdown(r), conflicts: L.conflicts() }); }
    if (p === 'export') return send(200, L.exportBundle());
  }
  if (req.method === 'POST') {
    const b = await body(req);
    if (p === 'events') return send(200, { ok: true, written: L.append(b.events || []) });
    if (p === 'settings') return send(200, L.setEnabled(b.enabled !== false));
    if (p === 'distill') return send(200, L.distill());
    if (p === 'import') return send(200, L.importBundle(b));
    if (p === 'forget') return b.confirm === true ? send(200, L.forget()) : send(400, { error: 'confirm: true required' });
  }
  return send(404, { error: 'not found' });
}
