// Power off (owner request 2026-10-29): POST /api/power/off {confirm: true}, sent by the editor's power button after its
// confirm dialog (editor/ext/14-power.js). Every open tab is told to flush its state (the session's live connections),
// the pressing page shows its «server off» card (with a «Turn on» button), then ONLY this host process stops (0.15.2 note 4:
// no Edge window or tab is closed; `business-wrap close` / `stop --all` is the explicit close-everything). Another install's host is never touched.
import fs from 'node:fs';
import { readJson } from '../workspace.mjs';
import { hostFile, hostState } from '../host.mjs';
import { emit } from './session.mjs';

export const GRACE_MS = Number(process.env.BW_POWER_GRACE_MS || 1500); // the time the page has to flush and draw «stopped»

/** 0.15.2 note 4: turning the host off stops ONLY this host process (this server and its supervisor). The editor tab and every
 *  browser window stay open (they show «server off» and can turn it on again); nothing else is closed. Closing Edge and every
 *  host of the install stays what `business-wrap close` / `stop --all` is, from the command line. */
export function stopSelf(ctx) {
  if (process.pid === hostState()?.pid || process.ppid === hostState()?.pid) fs.rmSync(hostFile(), { force: true });
  ctx.server?.close();
  ctx.server?.closeAllConnections?.();
  if (process.env.BW_SERVE_CHILD) setTimeout(() => process.exit(0), 300); // the supervisor sees 0 and ends too
}

export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/power/off') return false;
  if (req.method !== 'POST') { send(405, { error: 'POST' }); return true; }
  const b = await readJson(req).catch(() => ({}));
  if (b?.confirm !== true) { send(400, { error: 'confirm' }); return true; }
  emit(ctx, 'flush'); // every tab saves now (0.15.0: one stream per browser; ctx.session.live no longer exists)
  send(200, { ok: true, grace: GRACE_MS });
  setTimeout(() => stopSelf(ctx), GRACE_MS);
  return true;
};
