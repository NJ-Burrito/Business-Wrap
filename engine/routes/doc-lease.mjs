// One document = one owning tab (0.15.3 T1). Runs before engine/routes/library.mjs (routes load sorted) and sees only the tab's library write,
// POST /api/library/mirror, with the headers the page adds (editor/ext/12-session.js): x-bw-tab, x-bw-doc, x-bw-base (the revision the tab last saw).
//   409 {ok:false, code:'NOT_OWNER', owner, rev}   another live tab owns the document: this tab is a follower and may not save it
//   409 {ok:false, code:'STALE_BASE', rev}         the tab's copy is older than the library's: it must reload, never save over it
//   accepted: the write goes on to library.mjs, and the answer carries x-bw-rev (the new revision)
// A page without the headers (an older page, a tool) is not touched.
import { acceptWrite } from './session.mjs';

export default async (req, url, send, ctx, res) => {
  if (req.method !== 'POST' || url.pathname !== '/api/library/mirror' || !ctx.workspace) return false;
  const tab = req.headers['x-bw-tab'];
  const doc = req.headers['x-bw-doc'];
  if (typeof tab !== 'string' || typeof doc !== 'string' || !/^[A-Za-z0-9_-]{4,64}$/.test(tab) || !/^doc-[A-Za-z0-9-]{4,64}$/.test(doc)) return false;
  const raw = req.headers['x-bw-base'];
  const base = raw === undefined || raw === '' ? NaN : Number(raw);
  const r = acceptWrite(ctx, { tab, doc, base });
  if (!r.ok) {
    send(409, { ok: false, code: r.code, doc, owner: r.owner || null, rev: r.rev, error: r.code === 'NOT_OWNER' ? 'this document is open in another tab, which owns it: this tab is read-only' : 'this tab\'s copy is older than the library\'s: reload the document before saving' });
    return true;
  }
  res?.setHeader('x-bw-rev', String(r.rev));
  res?.setHeader('access-control-expose-headers', 'x-bw-rev');
  return false;
};
