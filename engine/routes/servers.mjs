// Settings › start / stop servers (0.13.3). Served pages only (a file:// page uses the business-wrap: protocol instead,
// engine/protocol.mjs).
//   GET  /api/servers                      → {self, servers:[{port,version}], browsers}  what a stop would close (the confirm dialog)
//   POST /api/servers/stop {confirm:true}  → every open tab of this server saves (the `flush` event), every other
//        Business-Wrap server is asked to do the same, then ONLY this host process stops (0.15.2 note 4: no browser window or tab is closed; the page shows «server off»).
//   POST /api/servers/stop {confirm:true, flushOnly:true}   only the flush (what the first server asks of its peers)
//   POST /api/servers/stop {confirm:true, returnTo:{x,y,w,h,file?}}   (0.17.8 window switch) a served tab that came from the editor on disk: BEFORE the host ends, the file:// editor is opened
//        as a new window at the served window's screenX / screenY / outerWidth / outerHeight (an http page cannot navigate to file://); the page then closes itself. The answer carries `reopened`.
// A request that changes anything must come from this server's own page (serve.mjs already refuses a foreign Origin).
import { readJson } from '../workspace.mjs';
import { emit } from './session.mjs';
import { stopSelf } from './power.mjs';
import { probeServers, countBrowsers, flushPeers, validateFile } from '../protocol.mjs';

const GRACE = () => Number(process.env.BW_POWER_GRACE_MS || 1500);
const flushTabs = (ctx) => { emit(ctx, 'flush'); }; // ctx.session.live is gone (one stream per browser): emit() reaches every tab
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** The way back (0.17.8): the editor file the person came from (checked like any file a business-wrap: URL names), else the host's own editor file, else the launcher's choice (the tool editor: the start page, 0.18.2; it was the newest document). */
async function reopenOnDisk(rt, ctx) {
  const geometry = { x: rt.x, y: rt.y, w: rt.w, h: rt.h };
  let file = null;
  for (const cand of [rt.file, ctx.editorFile]) { if (!cand || file) continue; try { file = validateFile(String(cand)); } catch { /* not a place we may open */ } }
  try {
    const { openEditor } = await import('../../launcher/open-editor.mjs');
    const r = await openEditor({ file, geometry });
    return { file: r.file, url: r.url, geometry, browser: r.browser };
  } catch (e) { return { error: String(e?.message || e).slice(0, 200), geometry }; }
}

export default async (req, url, send, ctx) => {
  if (url.pathname === '/api/servers/file') { // the document this server serves; the page keeps it to start the same document again if the server dies (editor/ext/18-server.js)
    if (req.method !== 'GET') { send(405, { error: 'GET' }); return true; }
    if (req.headers.origin && !LOCAL.test(req.headers.origin)) { send(403, { error: 'origin' }); return true; }
    send(200, { file: ctx.editorFile || '' });
    return true;
  }
  if (url.pathname === '/api/servers') {
    if (req.method !== 'GET') { send(405, { error: 'GET' }); return true; }
    if (req.headers.origin && !LOCAL.test(req.headers.origin)) { send(403, { error: 'origin' }); return true; }
    const port = ctx.server?.address?.()?.port ?? null;
    const servers = await probeServers();
    if (port && !servers.some((s) => s.port === port)) servers.push({ port });
    send(200, { self: port, servers, browsers: await countBrowsers() });
    return true;
  }
  if (url.pathname !== '/api/servers/stop') return false;
  if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
  const b = await readJson(req).catch(() => ({}));
  if (b?.confirm !== true) { send(400, { error: 'confirm' }); return true; }
  flushTabs(ctx);
  if (b.flushOnly === true) { send(200, { ok: true, flushed: true, grace: GRACE() }); return true; }
  const selfPort = ctx.server?.address?.()?.port ?? null;
  const peers = await flushPeers({ selfPort });
  let reopened = null;
  if (b.returnTo && typeof b.returnTo === 'object') reopened = await reopenOnDisk(b.returnTo, ctx);
  send(200, { ok: true, grace: GRACE(), servers: peers.length + 1, ...(reopened ? { reopened } : {}) });
  ctx.stopping = true; // /api/health and /api/version say so for the grace window, so the reopened file:// editor does not take this host for a live one
  setTimeout(() => stopSelf(ctx), GRACE());
  return true;
};
