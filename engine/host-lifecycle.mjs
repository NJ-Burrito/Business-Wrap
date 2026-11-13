// The host's process facts in one place: which port it starts on, whether a pid is alive, how it is stopped and waited for,
// and who may call it (BW_HOST_TOKEN). engine/host.mjs, engine/cli.mjs, engine/heal, engine/protocol, the routes and update/apply all read from here.
import { spawnSync } from 'node:child_process';

export const DEFAULT_PORT = 4317;
/** engine/protocol.mjs probes this many ports upward from DEFAULT_PORT for a running host. */
export const PROBE_PORT_COUNT = 11;
export const probePorts = () => Array.from({ length: PROBE_PORT_COUNT }, (_, i) => DEFAULT_PORT + i);

/** True when a process with this pid exists (a process we may not signal still counts). */
export const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Polls `pred` every `step` ms until it is true or `ms` has passed; returns the last answer. */
export async function waitFor(pred, ms, step = 100) {
  for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await pred()) return true; await sleep(step); }
  return !!(await pred());
}

/** Ends a process and its children. False when it was not running. */
export function killTree(pid) {
  if (!alive(pid)) return false;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } } }
  return true;
}

/** The token a background host was started with; unset when the server was started by hand. */
export const hostToken = () => process.env.BW_HOST_TOKEN;
/** True when this host has a token and the request does not carry it in x-bw-token. */
export const tokenRefused = (req) => { const t = hostToken(); return !!t && req.headers['x-bw-token'] !== t; };
