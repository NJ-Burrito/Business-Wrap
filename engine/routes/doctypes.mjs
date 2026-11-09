// GET /api/doctypes and GET /api/doctypes/<id>/<ar|en>.json (0.18.0 document studio, contract C5 of work/sdlc/design/architecture.md).
// The first is the SAME payload the shipped editor embeds as <script id="bw-doctypes"> (engine/doctypes.mjs payload(), contract C2), for a page that
// does not carry the script (a saved document opened through the served host). The second is one COMPOSED starter document, pretty JSON, so a tool or
// an agent can read a type's document without the editor. Read only: no state, no file written (serve.mjs `send` already sets no-store and nosniff). Auto-loaded by engine/serve.mjs (routes/*.mjs).
import { payload, compose, EDITIONS, ID_RE } from '../doctypes.mjs';

const ONE = /^\/api\/doctypes\/([^/]+)\/([^/]+)\.json$/;

export default async (req, url, send) => {
  if (req.method !== 'GET' || (url.pathname !== '/api/doctypes' && !url.pathname.startsWith('/api/doctypes/'))) return false;
  try {
    if (url.pathname === '/api/doctypes') { send(200, payload()); return true; }
    const m = ONE.exec(url.pathname);
    if (!m) { send(404, { ok: false, error: 'not found: /api/doctypes or /api/doctypes/<id>/<ar|en>.json' }); return true; }
    const [, id, ed] = m;
    if (!ID_RE.test(id) || !EDITIONS.includes(ed)) { send(404, { ok: false, error: `not found: ${id}/${ed}` }); return true; }
    let doc;
    try { doc = compose(id, ed); } catch (e) {
      if (/unknown type/.test(e.message)) { send(404, { ok: false, error: `unknown document type «${id}»` }); return true; }
      throw e;
    }
    send(200, JSON.stringify(doc, null, 1) + String.fromCharCode(10));
  } catch (e) { send(500, { ok: false, error: String(e.message || e) }); }
  return true;
};
