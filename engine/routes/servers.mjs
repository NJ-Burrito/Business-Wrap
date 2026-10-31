// Settings › start / stop servers (0.13.3). Served pages only (a file:// page uses the business-wrap: protocol instead,
// engine/protocol.mjs).
//   GET  /api/servers                      → {self, servers:[{port,version}], browsers}  what a stop would close (the confirm dialog)
//   POST /api/servers/stop {confirm:true}  → every open tab of this server saves (the `flush` event), every other
//        Business-Wrap server is asked to do the same, then everything this install started stops through the same code as
//        `business-wrap close` (hosts, strays, host-launched browsers) and this server goes last, like power off.
//   POST /api/servers/stop {confirm:true, flushOnly:true}   only the flush (what the first server asks of its peers)
// A request that changes anything must come from this server's own page (serve.mjs already refuses a foreign Origin).
import fs from 'node:fs';
import { close } from '../cli.mjs';
import { readJson } from '../workspace.mjs';
import { hostFile, hostState } from '../host.mjs';
import { emit } from './session.mjs';
import { probeServers, countBrowsers, flushPeers } from '../protocol.mjs';

const GRACE = () => Number(process.env.BW_POWER_GRACE_MS || 1500);
const flushTabs = (ctx) => { emit(ctx, 'flush'); }; // 0.15.0: ctx.session.live is gone (one stream per browser): emit() reaches every tab
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

export default async (req, url, send, ctx) => {
  if (url.pathname === '/api/servers/file') { // 0.14.0: the document this server serves; the page keeps it to start the same document again if the server dies (editor/ext/18-server.js)
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
  send(200, { ok: true, grace: GRACE(), servers: peers.length + 1 });
  setTimeout(async () => {
    const self = [process.pid, process.ppid]; // this server and its supervisor stop themselves, after everything else
    try { await close({ keep: self }); } catch { /* best effort: this server still stops */ }
    if (self.includes(hostState()?.pid)) fs.rmSync(hostFile(), { force: true });
    ctx.server?.close();
    ctx.server?.closeAllConnections?.();
    if (process.env.BW_SERVE_CHILD) setTimeout(() => process.exit(0), 300);
  }, GRACE());
  return true;
};
