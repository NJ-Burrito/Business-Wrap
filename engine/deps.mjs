// is the one runtime dependency (playwright-core, which export.mjs drives for PDF and PNG) installed in THIS copy of Business-Wrap?
// A zip copy or a plugin folder arrives without node_modules until `npm ci` runs; the export then died with «Cannot find package 'playwright-core'».
// depsStatus() uses the same lookup as export.mjs loadPlaywright(): <root>/node_modules/playwright-core, else normal resolution from <root>/engine.
// BW_DEPS_ROOT replaces the root (tests: a folder with nothing installed).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REQUIRED = ['playwright-core'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const depsRoot = () => path.resolve(process.env.BW_DEPS_ROOT || path.join(HERE, '..'));

function resolvable(name, root) {
  if (fs.existsSync(path.join(root, 'node_modules', name, 'package.json'))) return true;
  try { createRequire(path.join(root, 'engine', 'export.mjs')).resolve(name); return true; } catch { /* fall through */ }
  try { return fs.existsSync(path.join(path.dirname(createRequire(path.join(root, 'engine', 'export.mjs')).resolve(`${name}/package.json`)), 'package.json')); } catch { return false; }
}

/** {ok, missing:[names]} */
export function depsStatus(root = depsRoot()) {
  const missing = REQUIRED.filter((n) => !resolvable(n, root));
  return { ok: missing.length === 0, missing };
}

/** The error export.mjs raises when a dependency is missing: the same text Node prints, so one pattern maps both. */
export function missingError(root = depsRoot()) {
  return Object.assign(new Error(`Cannot find package 'playwright-core' imported from ${path.join(root, 'engine', 'export.mjs')}`), { code: 'ERR_MODULE_NOT_FOUND' });
}

/** Does an export error message mean "the dependencies are not installed"? */
export const isMissingDepError = (msg) => /ERR_MODULE_NOT_FOUND|Cannot find package ['"`]?playwright-core|Cannot find module ['"`]?playwright-core/i.test(String(msg || ''));

/** Where the person runs the one-time install by hand. */
export const MANUAL_COMMAND = 'npm ci';

let running = null;
/** `npm ci --omit=dev --no-audit --no-fund` in the install folder (`npm install …` when there is no package-lock). One run at a time.
 *  Resolves {ok, command, tail} — tail = the last lines of output, for the error toast. Never rejects. */
export function installDeps({ root = depsRoot(), timeoutMs = Number(process.env.BW_DEPS_TIMEOUT_MS || 300000), npm, shell = process.platform === 'win32' } = {}) {
  if (running) return running;
  const hasLock = fs.existsSync(path.join(root, 'package-lock.json'));
  const args = [hasLock ? 'ci' : 'install', '--omit=dev', '--no-audit', '--no-fund'];
  const cmd = npm || (process.platform === 'win32' ? 'npm.cmd' : 'npm');
  const command = `npm ${args.join(' ')}`;
  running = new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (r) => { if (done) return; done = true; clearTimeout(timer); running = null; resolve({ command, ...r, tail: out.trim().split(/\r?\n/).slice(-8).join('\n').slice(-900) }); };
    let child;
    try {
      // Windows: a .cmd needs a shell (Node refuses to spawn it directly since the 2024 security fix); the arguments are fixed words, nothing from the request
      child = spawn(cmd, args, { cwd: root, shell, windowsHide: true, env: { ...process.env, npm_config_loglevel: 'error' } });
    } catch (e) { out = String(e?.message || e); finish({ ok: false }); return; }
    const timer = setTimeout(() => { out += '\n(timed out)'; try { child.kill(); } catch { /* gone */ } finish({ ok: false, timedOut: true }); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { out += `\n${e.message}`; finish({ ok: false }); });
    child.on('close', (code) => finish({ ok: code === 0 && depsStatus(root).ok, code }));
  });
  return running;
}
