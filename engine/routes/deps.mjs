// POST /api/deps/install (0.17.13): the one-time `npm ci` the editor offers when exports cannot run because playwright-core is not installed
// (a zip copy or a plugin folder arrives without node_modules). GET /api/deps → {ok, missing, manual}.
// Same-origin only: a request that carries a foreign Origin is refused (serve.mjs already refuses it for every POST; this route checks again, because it runs a command).
// Nothing from the request reaches the command line.
import { depsStatus, installDeps, MANUAL_COMMAND } from '../deps.mjs';
import { resetPlaywright } from '../export.mjs';

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export default async (req, url, send) => {
  if (url.pathname !== '/api/deps' && url.pathname !== '/api/deps/install') return false;
  if (req.headers.origin && !LOCAL.test(req.headers.origin)) { send(403, { error: 'origin' }); return true; }
  if (url.pathname === '/api/deps') {
    if (req.method !== 'GET') { send(405, { error: 'GET' }); return true; }
    send(200, { ...depsStatus(), manual: MANUAL_COMMAND });
    return true;
  }
  if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
  if (depsStatus().ok) { send(200, { ok: true, already: true, ...depsStatus() }); return true; }
  const r = await installDeps();
  if (r.ok) resetPlaywright();
  send(r.ok ? 200 : 500, { ok: r.ok, command: r.command, tail: r.tail, ...(r.timedOut ? { timedOut: true } : {}), ...depsStatus(), manual: MANUAL_COMMAND });
  return true;
};
