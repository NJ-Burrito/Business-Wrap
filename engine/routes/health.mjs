// GET /api/host/health (0.15.0 L1): what a tool (or the owner) asks before blaming the host: is it up, which version, which browsers
// (clients) hold an event stream, which tabs are live and how long ago each answered, how many editor requests wait.
// {ok, version, pid, uptimeS, workspace, clients:[{client, conns, tabs, since}], tabs:[{tab, svc, docs, automation, live, lastBeatMs}],
//  pendingRequests, warnings:[{code:'MANY_CLIENTS'|'TAB_STALE', …}]}. lastBeatMs > 15000 marks a hung tab (report B4).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, registry } from './session.mjs';

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const version = () => { try { return JSON.parse(fs.readFileSync(PKG, 'utf8')).version; } catch { return null; } };

export default async (req, url, send, ctx) => {
  if (req.method !== 'GET' || url.pathname !== '/api/host/health') return false;
  const s = state(ctx);
  const r = registry(ctx);
  const ws = ctx.workspace;
  send(200, {
    ok: true,
    version: version(),
    pid: process.pid,
    uptimeS: Math.round(process.uptime()),
    workspace: ws ? { root: ws.root, chosen: ws.chosen !== false } : null,
    runId: s.runId,
    clients: r.clients,
    tabs: r.tabs,
    pendingRequests: Number(ctx.pendingRequests?.() ?? 0) || 0, // the editor bridge (L2) sets ctx.pendingRequests
    warnings: r.warnings,
  });
  return true;
};
