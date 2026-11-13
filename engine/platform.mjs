// The install, the interpreter and the file helpers every engine module needs: the repository root, the environment for a Python
// child, JSON files, and the one answer to "is this path inside that folder".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The environment of a Python child: Python reads and prints UTF-8 whatever the Windows code page is. */
export const pyEnv = (extra = {}) => ({ ...process.env, PYTHONUTF8: '1', ...extra });

/** A JSON file, parsed; throws when it is missing or not JSON. */
export const readJsonFile = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
/** A JSON file, parsed; `fallback` when it is missing or not JSON. */
export const readJsonOr = (file, fallback) => { try { return readJsonFile(file); } catch { return fallback; } };

/** True when `p` lies inside `root` (links are not resolved). `self`: the folder itself counts; `fold`: compare case-insensitively (Windows paths). */
export function inside(root, p, { self = true, fold = false } = {}) {
  const f = (x) => (fold && process.platform === 'win32' ? x.toLowerCase() : x);
  const r = path.relative(f(path.resolve(root)), f(path.resolve(p)));
  if (!r) return self;
  return r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r);
}
