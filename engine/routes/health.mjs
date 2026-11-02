// GET /api/host/health (0.15.0 L1): what a tool (or the owner) asks before blaming the host: is it up, which version, which browsers
// (clients) hold an event stream, which tabs are live and how long ago each answered, how many editor requests wait.
// {ok, version, pid, uptimeS, workspace, clients:[{client, conns, tabs, since}], tabs:[{tab, svc, docs, automation, live, lastBeatMs}],
//  pendingRequests, warnings:[{code:'MANY_CLIENTS'|'TAB_STALE'|'TAB_ASLEEP', …}], leases, revs}. lastBeatMs > 15000 marks a hung tab (report B4);
// > BW_ASLEEP_MS (9 s) marks it asleep (tabs[].asleep). lastBeatMs refreshes from the tab list, from every state push/flush and from every bridge reply.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { state, registry } from './session.mjs';
import { parentChange } from '../workspace.mjs';

/** The save folder as a tool should see it: its root, whether the person chose it, and (since this host started) any change of it. */
export function workspaceNote(ws) {
  const changed = parentChange(Date.now() - process.uptime() * 1000 - 1000);
  return { root: ws.root, chosen: ws.chosen !== false, ...(changed ? { changed } : {}) };
}

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
    ppid: process.ppid, // the supervisor that forked this server (engine/serve.mjs)
    hostKey: process.env.BW_HOST_TOKEN ? crypto.createHash('sha256').update(process.env.BW_HOST_TOKEN).digest('hex').slice(0, 16) : null, // proves which start spawned it, never the token
    uptimeS: Math.round(process.uptime()),
    workspace: ws ? workspaceNote(ws) : null, // 0.16.0: {root, chosen, changed?:{from, to, at, by}}: a save-folder change is named here and in every editor reply
    runId: s.runId,
    clients: r.clients,
    tabs: r.tabs,
    leases: r.leases, // 0.15.3: document -> the one tab that owns it
    revs: r.revs,
    pendingRequests: Number(ctx.pendingRequests?.() ?? 0) || 0, // the editor bridge (L2) sets ctx.pendingRequests
    warnings: r.warnings,
  });
  return true;
};
