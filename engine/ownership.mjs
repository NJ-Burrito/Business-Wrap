// Who may take over the person's Desktop shortcut and the business-wrap: registration (0.17.4, after a worktree host rewrote both).
// Both live in the person's real profile (the Desktop folder, HKCU), so only the install the person set up may write them on its own:
//   1. A sandboxed run (test mode, BW_LOCAL_DIR / BW_STATE_DIR / BW_WORKSPACE) never writes them: it has its own folders and a fake hive.
//   2. A git WORKTREE (its `.git` is a FILE pointing at gitdir/worktrees/...) never writes the REAL ones on its own, whatever they hold. A primary clone
//      (`.git` is a folder: the owner's own install) is an install like any other (rule 3). `launcher make --force` and `protocol register` are the
//      explicit "make this the default" actions and still work.
//   3. Any other install (a release folder, a primary clone) may take over a target only when there is none, when it already points at this same install, or when it points at an
//      install folder that no longer exists (a dead target). A target that points at another install that still exists is left alone.
// Documented here (README unchanged: not in this lane's paths); tests: tests/launcher-owner-0174.test.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { isTestMode } from './testguard.mjs';

/** A run in its own state folder (a test, a trial). */
export const sandboxed = () => isTestMode() || !!(process.env.BW_LOCAL_DIR || process.env.BW_STATE_DIR || process.env.BW_WORKSPACE);
/** A git worktree: `.git` is a FILE (`gitdir: <main>/.git/worktrees/<name>`). A primary clone has a `.git` folder and is not one. */
export const isWorktree = (dir) => { try { return fs.statSync(path.join(dir, '.git')).isFile(); } catch { return false; } };
const real = (p) => { try { return fs.realpathSync.native(path.resolve(p)); } catch { return path.resolve(p); } };
const same = (a, b) => (process.platform === 'win32' ? real(a).toLowerCase() === real(b).toLowerCase() : real(a) === real(b));

/** The install folder a launcher command line or handler command points at: the folder that holds launcher/ or update/ (the first quoted path ending in
 *  open-editor.vbs or update\cli.mjs). null when the text names none. */
export function installOf(text) {
  const m = /"([^"]*?)[\\/](?:launcher[\\/]open-editor\.vbs|update[\\/]cli\.mjs)"/i.exec(String(text || '')) || /([^\s"]+?)[\\/](?:launcher[\\/]open-editor\.vbs|update[\\/]cli\.mjs)/i.exec(String(text || ''));
  return m ? m[1] : null;
}

/** May `installDir` replace a target that currently points at `current` (an install folder, or null when there is none / it cannot be read)?
 *  → {ok, why}. `explicit` is a person's own action (force / register): always ok. */
export function mayTakeOver({ installDir, current, explicit = false, realProfile = true }) {
  if (explicit) return { ok: true, why: 'explicit' };
  if (realProfile && sandboxed()) return { ok: false, why: 'sandbox' };
  if (realProfile && isWorktree(installDir)) return { ok: false, why: 'worktree' };
  if (!current) return { ok: true, why: 'none' };
  if (same(current, installDir)) return { ok: true, why: 'same-install' };
  if (!fs.existsSync(current)) return { ok: true, why: 'dead-target' };
  return { ok: false, why: 'other-install-alive' };
}
