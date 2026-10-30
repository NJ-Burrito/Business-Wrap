// Which serve.mjs processes belong to THIS state folder (0.13.3). `business-wrap close` / Settings › stop servers used to kill
// every serve.mjs of the install found by its command line, so a second state folder on the same machine (a test suite running in
// parallel, another user's profile) lost its servers too. Now a server writes <state>/servers/<pid> when it starts (the supervisor
// and its child each), and close stops only registered pids whose command line is still this install's serve.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { localDir } from './workspace.mjs';

const dir = () => path.join(localDir(), 'servers');
export function registerServer(pid = process.pid) {
  try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(path.join(dir(), String(pid)), String(Date.now())); } catch { /* best effort */ }
}
/** Pids registered in this state folder; entries of dead processes are pruned. */
export function registeredServers(isAlive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; } }) {
  let names = [];
  try { names = fs.readdirSync(dir()); } catch { return []; }
  const out = [];
  for (const n of names) {
    const pid = Number(n);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (isAlive(pid)) out.push(pid); else { try { fs.rmSync(path.join(dir(), n), { force: true }); } catch { /* gone */ } }
  }
  return out;
}
export function unregisterServer(pid = process.pid) { try { fs.rmSync(path.join(dir(), String(pid)), { force: true }); } catch { /* gone */ } }
