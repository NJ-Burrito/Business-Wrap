// Power off (owner request 2026-10-29): POST /api/power/off {confirm: true}, sent by the editor's power button after its
// confirm dialog (editor/ext/14-power.js). Every open tab is told to flush its state (the session's live connections),
// the pressing page shows its «stopped» page, then everything this install started stops through the same code as
// `business-wrap close` / `stop --all` (engine/cli.mjs close: the hosts the CLI started, any other serve.mjs of this
// folder, Edge on this install's profile) and this server goes last. Another install's host is never touched.
import fs from 'node:fs';
import { close } from '../cli.mjs';
import { readJson } from '../workspace.mjs';
import { hostFile, hostState } from '../host.mjs';

export const GRACE_MS = Number(process.env.BW_POWER_GRACE_MS || 1500); // the time the page has to flush and draw «stopped»

export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/power/off') return false;
  if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
  const b = await readJson(req).catch(() => ({}));
  if (b?.confirm !== true) { send(400, { error: 'confirm' }); return true; }
  for (const r of ctx.session?.live?.keys() || []) r.write('event: flush\ndata: {}\n\n');
  send(200, { ok: true, grace: GRACE_MS });
  setTimeout(async () => {
    const self = [process.pid, process.ppid]; // this server and its supervisor stop themselves, after everything else
    try { await close({ keep: self }); } catch { /* best effort: this server still stops */ }
    if (self.includes(hostState()?.pid)) fs.rmSync(hostFile(), { force: true });
    ctx.server?.close();
    ctx.server?.closeAllConnections?.();
    if (process.env.BW_SERVE_CHILD) setTimeout(() => process.exit(0), 300); // the supervisor sees 0 and ends too
  }, GRACE_MS);
  return true;
};
