// Apply an update to an installed Business-Wrap folder, keeping the user's own files.
// Mirrors QA Wrap's extension/updater/host.ps1 (Invoke-Update, lines 84-154): download the release
// zip, verify its SHA-256 (GitHub's digest or the .sha256 published beside it), swap in place with a
// rollback copy that lives only for the update (0.15.7: one version stays on the machine, the old one is
// replaced), roll back from that copy on any failure. Never asks anything:
// the caller (CLI --apply --yes, MCP apply_update with confirm: true) has already got consent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isReleaseZipUrl, isAssetApiUrl, isAllowedRedirect, isNewer } from './core.mjs';
import { isPluginInstall, isTestMode } from '../engine/testguard.mjs';

/** What to do instead of an in-place update when Business-Wrap runs as a Claude Code plugin (0.15.0). */
export const PLUGIN_UPDATE_HOW = ['/plugin marketplace update business-wrap', '/plugin update business-wrap', '/reload-plugins (or restart the MCP client): the running server keeps the previous version folder until then'];

/** User-owned paths that an update never replaces or removes (relative to the install folder). */
export const KEEP = ['.local', '.local/learning', '.git', 'node_modules', 'out', 'design/custom', 'logos', 'fonts/custom', 'drafts', 'exports', 'harvest', 'profiles'];
/**
 * The only folders where a file the new release no longer ships is deleted: program code. Anywhere else
 * (the root, samples/, docs/ …) a file the release does not carry is the user's and stays byte-identical.
 */
export const CODE_ROOTS = ['engine', 'editor', 'mcp', 'update', 'hooks', 'bible', 'assets', 'tests', 'security', 'evals', '.claude-plugin', '.github', '.githooks'];

const kept = (rel) => KEEP.some((k) => rel === k || rel.startsWith(`${k}/`));
const codeFile = (rel) => CODE_ROOTS.some((k) => rel.startsWith(`${k}/`));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

/** The marker inside the rollback copy: its phase says whether the install may be half-replaced (0.15.7). */
const MARK = '.bw-rollback.json';
/** The list of files the installed release shipped, written at every update (0.15.7): lets the next update delete a dropped file anywhere. */
export const MANIFEST = '.shipped-files.json';
const PROTECTED = new Set([MANIFEST]);
/** The one safety copy of the user's data a migration makes: under .local/backups/, only the latest stays. */
export const MIGRATION_PREFIX = 'update-migration-';
export const migrationBackupDir = (dir, from) => path.join(dir, '.local', 'backups', `${MIGRATION_PREFIX}${String(from).replace(/[^\w.+-]/g, '_')}`);

/** A data-copy path read from a marker is trusted only as a real folder directly under <dir>/.local/backups/ named with the migration prefix; else null. */
function migrationCopyOf(dir, p) {
  if (typeof p !== 'string' || !p) return null;
  const root = path.join(dir, '.local', 'backups');
  const r = path.resolve(p);
  if (path.dirname(r) !== path.resolve(root) || !path.basename(r).startsWith(MIGRATION_PREFIX) || !realDir(r)) return null;
  return insideReal(dir, r) ? r : null;
}

/** A moved-aside folder named in a marker is trusted only as a real folder directly under <dir>/.local/backups/, named removed-files-*, holding our marker. */
function removedCopyOf(dir, p) {
  if (typeof p !== 'string' || !p) return null;
  const r = path.resolve(p);
  if (path.dirname(r) !== path.resolve(dir, '.local', 'backups') || !path.basename(r).startsWith(REMOVED_PREFIX) || !realDir(r) || !fs.existsSync(path.join(r, REMOVED_MARK)) || !insideReal(dir, r)) return null;
  return r;
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = posix(path.relative(base, p));
    if (kept(rel)) continue;
    if (e.isDirectory()) walk(p, base, out);
    else out.push(rel);
  }
  return out;
}
/** Every file under `dir`, KEEP paths included. */
function walkAll(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(p, base, out);
    else out.push(posix(path.relative(base, p)));
  }
  return out;
}
const sleep = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* none */ } };
/** A running host can hold a file for a moment on Windows (EBUSY/EPERM/EACCES): try again a few times, then let the error through. */
function retry(fn, tries = 5) {
  for (let i = 0; ; i++) {
    try { return fn(); } catch (e) { if (i >= tries - 1 || !/^(EBUSY|EPERM|EACCES|ENOTEMPTY|EMFILE)$/.test(e.code || '')) throw e; sleep(80 * (i + 1)); }
  }
}
const copyIn = (from, to, rel) => retry(() => { const t = path.join(to, rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(from, rel), t); });
const rmTree = (p) => fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
const rmFile = (p) => fs.rmSync(p, { force: true, maxRetries: 5, retryDelay: 100 });
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
function writeAtomic(p, text) { const t = `${p}.tmp-${process.pid}`; fs.writeFileSync(t, text); retry(() => fs.renameSync(t, p)); }
const alive = (pid) => { if (!pid || pid === process.pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const versionLike = (v) => /^\d+\.\d+\.\d+$/.test(String(v));
const lower = (p) => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p);
/** True when `p` resolves to a place strictly inside `root` (lexically). */
export const inside = (root, p) => { const r = path.relative(path.resolve(root), path.resolve(p)); return !!r && r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r); };
/** True when `p` is inside `root` also after links are resolved (a folder that is a link to elsewhere does not count). */
const insideReal = (root, p) => { try { return inside(fs.realpathSync(root), fs.realpathSync(p)); } catch { return false; } };
/** Like `insideReal`, but the root itself counts (the parent folder of a file at the top of the install). */
const withinReal = (root, p) => { try { const r = fs.realpathSync(root); const q = fs.realpathSync(p); return q === r || inside(r, q); } catch { return false; } };
const realDir = (p) => { try { const l = fs.lstatSync(p); return l.isDirectory() && !l.isSymbolicLink(); } catch { return false; } };
/** Remove one file named by a relative path from a manifest, a listing or a marker: only if it stays inside `dir`, links resolved. */
const rmRel = (dir, rel) => {
  const t = path.join(dir, rel);
  if (!inside(dir, t)) return false;
  if (!withinReal(dir, path.dirname(t))) return false;
  rmFile(t);
  return true;
};

/** A path from a manifest or an old release listing is used only when it stays inside the install and is not user data. */
const usable = (rel) => typeof rel === 'string' && rel && !path.isAbsolute(rel) && !/^[A-Za-z]:/.test(rel) && !rel.includes('\\') && !rel.split('/').some((s) => s === '..' || s === '' || s === '.') && !kept(rel) && !PROTECTED.has(rel);

/** The files the installed release shipped (from its manifest), or null when this install has none yet (a first update). */
export function readManifest(dir) {
  const m = readJson(path.join(dir, MANIFEST));
  return m && Array.isArray(m.files) ? m.files.filter(usable) : null;
}

/** The update's stages, in order (the editor shows them as steps). 'backup' is the rollback copy, kept only until the update is verified. */
export const STAGES = ['download', 'backup', 'replace', 'verify', 'done'];

/** Leftovers beside the install from an older update or a crash: `<dir>.backup-*` (code copies) and `<dir>.backup-*-data` (the old data copy). */
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * 0.15.8: a leftover is removed only when proven to be Business-Wrap's own. The name is exactly `<dir>.backup-<semver>` or
 * `<dir>.backup-<semver>-data` (a real folder, not a link), AND it holds our marker file, or (older code copies) its package.json
 * is named business-wrap with that very version, or (the -data copy) its top level holds only .local, drafts or out. Anything
 * else beside the install is somebody's folder: it is never read as ours, never touched, never reported as a failure.
 */
function ours(p, semver, data) {
  if (!realDir(p)) return false;
  let top = [];
  try { top = fs.readdirSync(p); } catch { return false; }
  if (top.includes(MARK) && readJson(path.join(p, MARK))) return true;
  if (data) return top.length > 0 && top.every((n) => ['.local', 'drafts', 'out'].includes(n));
  const pkg = readJson(path.join(p, 'package.json'));
  return pkg?.name === 'business-wrap' && pkg.version === semver;
}
function leftoversOf(dir) {
  const parent = path.dirname(dir);
  const re = new RegExp(`^${escRe(path.basename(dir))}\\.backup-(\\d+\\.\\d+\\.\\d+)(-data)?$`);
  let names = [];
  try { names = fs.readdirSync(parent); } catch { /* none */ }
  const out = [];
  for (const n of names) {
    const m = re.exec(n);
    if (!m) continue;
    const p = path.join(parent, n);
    if (ours(p, m[1], !!m[2])) out.push({ name: n, p, data: !!m[2], semver: m[1] });
  }
  return out;
}

/** Put the install back from the rollback copy: files the release added go, every copied file returns, a migrated edits file returns from its data copy. */
function restoreFromCopy(dir, backup, mark) {
  const had = new Set(walkAll(backup).filter((r) => r !== MARK && !r.includes('.tmp-')));
  for (const rel of Array.isArray(mark.incoming) ? mark.incoming : []) if (usable(rel) && !had.has(rel)) rmRel(dir, rel);
  if (!had.has(MANIFEST)) rmFile(path.join(dir, MANIFEST));
  for (const rel of had) if ((usable(rel) || rel === MANIFEST) && inside(dir, path.join(dir, rel))) copyIn(backup, dir, rel);
  // 0.15.8: the marker is data read from disk. Its data copy is used (and removed) only when it is one of OUR migration folders:
  // a real folder directly under <dir>/.local/backups/ whose name starts with the migration prefix. Anything else is ignored.
  const db = migrationCopyOf(dir, mark.dataBackup);
  if (db) {
    for (const rel of walkAll(db)) if (inside(dir, path.join(dir, rel))) copyIn(db, dir, rel); // the originals of the edits files a migration rewrote
    rmTree(db);
  }
  // files an update moved aside: every one is back in place now, so that folder (ours: marker inside, named by the same rule) has no job
  const rd = removedCopyOf(dir, mark.removedDir);
  if (rd) rmTree(rd);
  if ((db || rd) && !mark.backupsExisted) { try { fs.rmdirSync(path.join(dir, '.local', 'backups')); } catch { /* not empty: not ours */ } }
}
/** Remove now-empty folders from `rel`'s parent upward, never the install itself and never a KEEP path. */
function pruneEmpty(dir, rel) {
  for (let d = path.posix.dirname(rel); d && d !== '.' && !kept(d); d = path.posix.dirname(d)) {
    try { fs.rmdirSync(path.join(dir, d)); } catch { return; }
  }
}
/** Keep only one `update-migration-*` copy under .local/backups/: `keep` when given, else the newest. */
function pruneMigrationCopies(dir, keep = '') {
  const root = path.join(dir, '.local', 'backups');
  let all = [];
  try { all = fs.readdirSync(root).filter((n) => n.startsWith(MIGRATION_PREFIX)).map((n) => ({ p: path.join(root, n), t: fs.statSync(path.join(root, n)).mtimeMs })); } catch { return []; }
  const win = (keep && all.find((x) => x.p === keep)) || [...all].sort((a, b) => b.t - a.t)[0];
  const gone = [];
  for (const x of all) if (x !== win) { rmTree(x.p); gone.push(x.p); }
  return gone;
}

/**
 * Finish or undo what an earlier update left beside `dir` (a crash, or a version before 0.15.7), so the machine ends with one
 * version: a rollback copy whose marker says "replacing" is rolled back first (the install was half-replaced), any other copy is
 * removed, and the old `-data` copy of migrated user data is moved under `.local/backups/` (only the latest stays, never beside
 * the install). A copy that cannot be restored is kept and named in `failed`.
 * @returns {{rolledBack: string[], removed: string[], moved: string[], failed: string[]}}
 */
export function recoverUpdateLeftovers(dir) {
  const res = { rolledBack: [], removed: [], moved: [], failed: [] };
  const data = [];
  for (const l of leftoversOf(dir)) {
    try {
      if (l.data) { data.push(l); continue; }
      const mark = readJson(path.join(l.p, MARK));
      if (mark?.phase === 'replacing') {
        if (alive(mark.pid)) { res.failed.push(l.p); continue; } // another process is updating right now
        restoreFromCopy(dir, l.p, mark);
        res.rolledBack.push(l.p);
      }
      rmTree(l.p);
      res.removed.push(l.p);
    } catch { res.failed.push(l.p); }
  }
  try {
    if (data.length) {
      const root = path.join(dir, '.local', 'backups');
      const have = fs.existsSync(root) && fs.readdirSync(root).some((n) => n.startsWith(MIGRATION_PREFIX));
      data.sort((a, b) => fs.statSync(b.p).mtimeMs - fs.statSync(a.p).mtimeMs);
      if (!have) {
        const from = data[0].name.slice(data[0].name.indexOf('.backup-') + 8).replace(/-data$/, '');
        const to = migrationBackupDir(dir, from);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.cpSync(data[0].p, to, { recursive: true });
        res.moved.push(to);
      }
      for (const l of data) { rmTree(l.p); res.removed.push(l.p); }
    }
  } catch { for (const l of data) if (fs.existsSync(l.p)) res.failed.push(l.p); }
  return res;
}

/** Marker inside a folder of files moved aside by an update: only a folder that holds it is ever pruned as ours. */
const REMOVED_MARK = '.bw-removed.json';
export const REMOVED_PREFIX = 'removed-files-';
const removedRoot = (dir) => path.join(dir, '.local', 'backups');
/** The path of the folder `.local/backups/removed-files-<from>[-n]/` an update would move files into (never an existing one; not created yet). */
function planRemovedDir(dir, from) {
  const base = `${REMOVED_PREFIX}${String(from).replace(/[^\w.+-]/g, '_')}`;
  let d = path.join(removedRoot(dir), base);
  for (let i = 2; fs.existsSync(d); i++) d = path.join(removedRoot(dir), `${base}-${i}`);
  return d;
}
/** Create the planned folder, with our marker inside. */
function newRemovedDir(d, from) {
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, REMOVED_MARK), JSON.stringify({ from, at: new Date().toISOString() }));
  return d;
}
/** Move `dir/rel` to `to/rel`, keeping the path; a move across devices is a copy, then the original goes. */
function moveAside(dir, rel, to) {
  const src = path.join(dir, rel);
  const dst = path.join(to, rel);
  if (!inside(dir, src) || !inside(to, dst)) throw new Error(`refused to move ${rel}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { retry(() => fs.renameSync(src, dst)); } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    fs.copyFileSync(src, dst);
    rmFile(src);
  }
}
/** Keep only the latest folder of moved-aside files: `keep` when given, else the newest. Only folders that carry our marker are touched. */
function pruneRemovedFiles(dir, keep = '') {
  const root = removedRoot(dir);
  let all = [];
  try { all = fs.readdirSync(root).filter((n) => n.startsWith(REMOVED_PREFIX)).map((n) => path.join(root, n)).filter((p) => realDir(p) && fs.existsSync(path.join(p, REMOVED_MARK))); } catch { return; }
  const win = (keep && all.find((p) => p === keep)) || [...all].sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  for (const p of all) if (p !== win) rmTree(p);
}

/**
 * Replace the program files of `dir` with those of `fresh` IN PLACE. Every release file is written; KEEP paths are never written
 * or removed; a file the installed release shipped and this one does not is removed anywhere (the manifest `.shipped-files.json`
 * written by the last update, else, for a first update, `oldShipped`, the old release's zip listing: a file in the listing goes, a file
 * outside it stays where it is, as the user's). With neither (0.15.8), a file under CODE_ROOTS the release does not carry is never
 * deleted: it is MOVED, path kept, to `.local/backups/removed-files-<from>/` and the result names that folder and the count; only
 * the latest such folder is kept. A file no release ever shipped is the user's and stays.
 * The rollback copy `<dir>.backup-<from>` (program files only: KEEP paths are never touched, so they need no copy) exists only for
 * the update: it is removed once `verify(dir, {dataBackup})` passes, and a failure restores it and then removes it. If the restore
 * itself fails the copy is kept, `rollbackFailed` is true and `backup` names it. Leftovers of earlier updates are finished or
 * rolled back first. `failAt` ('replace' | 'verify') forces a failure there: tests only.
 */
export async function swapInstall(dir, fresh, from = 'previous', { stage = () => {}, verify = async () => {}, failAt = '', oldShipped = null } = {}) {
  const rec = recoverUpdateLeftovers(dir);
  if (rec.failed.length) return { ok: false, rolledBack: false, rollbackFailed: true, backup: rec.failed[0], error: `an earlier update left a rollback copy that could not be restored or removed: ${rec.failed[0]}; nothing was changed` };
  // 0.15.8: the copy goes to `<dir>.backup-<from>` only when nothing is there; whatever sits at that name and was not proven ours
  // by recoverUpdateLeftovers is somebody's folder: it is never written into and never removed. The copy then lives in a fresh temp folder.
  let backup = `${dir}.backup-${from}`;
  try { fs.lstatSync(backup); backup = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-rollback-')); } catch { /* the name is free */ }
  stage('backup');
  try {
    fs.cpSync(dir, backup, { recursive: true, filter: (src) => { const rel = posix(path.relative(dir, src)); return rel === '' || (!/^(node_modules|\.git)(\/|$)/.test(rel) && !kept(rel)); } });
  } catch (e) { try { rmTree(backup); } catch { /* none */ } return { ok: false, error: `could not make the rollback copy: ${e.message}; nothing was changed` }; }
  const incoming = walk(fresh);
  const dataBackup = migrationBackupDir(dir, from);
  const removedPlan = planRemovedDir(dir, from);
  const mark = { phase: 'replacing', from, pid: process.pid, at: new Date().toISOString(), incoming, dataBackup, removedDir: removedPlan, backupsExisted: fs.existsSync(path.join(dir, '.local', 'backups')) };
  writeAtomic(path.join(backup, MARK), JSON.stringify(mark));
  let removed = null; // {dir, count}: files moved aside (a first update with no listing)
  try {
    stage('replace');
    const ships = new Set(incoming);
    // with a manifest only what the old release shipped goes (anywhere); without one (a first update) the old release's zip listing
    // says what it shipped: those go, nothing else. With no listing either, a code file the release lacks is moved aside, never deleted.
    const manifest = readManifest(dir);
    const known = manifest ? new Set(manifest) : Array.isArray(oldShipped) ? new Set(oldShipped.filter(usable)) : null;
    for (const rel of walk(dir)) {
      if (ships.has(rel) || PROTECTED.has(rel)) continue;
      if (known) { if (known.has(rel) && rmRel(dir, rel)) pruneEmpty(dir, rel); continue; }
      if (codeFile(rel) && usable(rel)) {
        removed ??= { dir: newRemovedDir(removedPlan, from), count: 0 };
        moveAside(dir, rel, removed.dir);
        removed.count += 1;
        pruneEmpty(dir, rel);
      }
    }
    // a shipped file that is gone from the tree already (or never was here) is simply absent: nothing to remove
    const half = incoming[Math.floor(incoming.length / 2)];
    for (const rel of incoming) {
      if (failAt === 'replace' && rel === half) throw new Error('forced failure halfway through the replace (test)');
      copyIn(fresh, dir, rel);
    }
    stage('verify');
    if (failAt === 'verify') throw new Error('forced failure in verify (test)');
    await verify(dir, { dataBackup });
    try { writeAtomic(path.join(dir, MANIFEST), JSON.stringify({ version: readJson(path.join(dir, 'package.json'))?.version, files: incoming }, null, 1) + '\n'); } catch { /* the next update falls back to CODE_ROOTS */ }
    writeAtomic(path.join(backup, MARK), JSON.stringify({ ...mark, phase: 'verified' }));
  } catch (e) {
    try {
      restoreFromCopy(dir, backup, mark);
      rmTree(backup);
      return { ok: false, error: String(e.message || e), rolledBack: true };
    } catch (re) {
      return { ok: false, error: `${String(e.message || e)}; the rollback failed: ${String(re.message || re)}. The pre-update copy is kept at ${backup}`, rolledBack: false, rollbackFailed: true, backup };
    }
  }
  // verified: the old version is replaced for good; its rollback copy has done its job
  let leftover = '';
  try { rmTree(backup); } catch { leftover = backup; /* the next launch or update removes it */ }
  try { pruneMigrationCopies(dir, fs.existsSync(dataBackup) ? dataBackup : ''); } catch { /* none */ }
  try { if (removed) pruneRemovedFiles(dir, removed.dir); } catch { /* none */ }
  return { ok: true, replaced: from, ...(leftover ? { leftover } : {}), ...(removed ? { removedFiles: { dir: removed.dir, count: removed.count }, message: `${removed.count} file(s) of the old version that this release does not carry were moved, not deleted, to ${removed.dir}` } : {}) };
}

/**
 * Plugin installs (0.15.7): Claude Code keeps the older version folders of a plugin in its cache (it marks them `.orphaned_at`).
 * Once this version runs, those of Business-Wrap itself are removed: only siblings of the running folder, named like a version
 * older than it, holding this plugin's own package.json, not the install path Claude Code lists as current, carrying Claude Code's
 * own `.orphaned_at` mark, and (0.15.8) with no running process whose command line or working directory is inside it: a session
 * that still runs from an older folder keeps it, and the folder is retried at the next launch. If the process list cannot be read
 * nothing is removed. Never the running folder, never another plugin, never a path that does not match
 * <plugins>/cache/<marketplace>/business-wrap/<version>.
 * `processes`: tests pass a stand-in lister, `() => string[] | null` (the text of each process: command line, and working directory where known).
 * @returns {{removed: string[], skipped: string[], busy: string[]}}
 */
export function pruneOldPluginVersions(dir, { processes = listProcesses } = {}) {
  const res = { removed: [], skipped: [], busy: [] };
  const self = path.resolve(dir);
  const m = /^(.*[\\/]plugins)[\\/]cache[\\/]([^\\/]+)[\\/]business-wrap[\\/]([^\\/]+)$/.exec(self);
  if (!m || !isPluginInstall(self) || !versionLike(m[3])) return res;
  const parent = path.dirname(self);
  const listed = readJson(path.join(m[1], 'installed_plugins.json'));
  const current = listed && listed.plugins ? new Set(Object.values(listed.plugins).flat().map((e) => e?.installPath && path.resolve(String(e.installPath)).toLowerCase())) : null;
  let procs; // read once, and only when a folder has passed every other check
  for (const n of fs.readdirSync(parent)) {
    const p = path.join(parent, n);
    try {
      if (p === self || !versionLike(n) || !isNewer(m[3], n) || !realDir(p)) continue;
      if (readJson(path.join(p, 'package.json'))?.name !== 'business-wrap') { res.skipped.push(p); continue; }
      // Claude Code's own list says it is not installed (when readable), and it has marked the folder orphaned
      if (current && current.has(p.toLowerCase())) { res.skipped.push(p); continue; }
      if (!fs.existsSync(path.join(p, '.orphaned_at'))) { res.skipped.push(p); continue; }
      procs ??= processes();
      if (!procs) { res.skipped.push(p); continue; } // the process list cannot be read: keep it, try at the next launch
      if (procs.some((t) => mentions(t, p))) { res.busy.push(p); res.skipped.push(p); continue; } // a live session runs from it
      rmTree(p);
      res.removed.push(p);
    } catch { res.skipped.push(p); }
  }
  return res;
}

/** True when `text` (a command line or a working directory) names the folder `p` or something inside it, on a path boundary. */
export function mentions(text, p) {
  const norm = (x) => lower(String(x).replace(/\\/g, '/'));
  const t = norm(text);
  const forms = new Set([norm(p), norm(p).replace(/ /g, '%20'), norm(encodeURI(p))]);
  for (const f of forms) {
    for (let i = t.indexOf(f); i !== -1; i = t.indexOf(f, i + 1)) {
      const c = t[i + f.length];
      if (c === undefined || !/[\w.-]/.test(c)) return true; // 0.15.5 must not match 0.15.50
    }
  }
  return false;
}

/**
 * Every running process as one line of text (its command line and, where the system gives it, its working directory), or null when
 * the list cannot be read. Windows: Get-CimInstance (command line and executable path; Windows does not expose a working directory
 * there). Linux: /proc (cmdline and cwd). macOS and others: `ps` (command line only).
 */
export function listProcesses() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "Get-CimInstance Win32_Process | ForEach-Object { ($_.CommandLine + ' ' + $_.ExecutablePath) -replace '\\r?\\n',' ' }"], { encoding: 'utf8', timeout: 20000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      return r.status === 0 && r.stdout.trim() ? r.stdout.split(/\r?\n/).filter(Boolean) : null;
    }
    if (process.platform === 'linux' && fs.existsSync('/proc/self/cmdline')) {
      const out = [];
      for (const pid of fs.readdirSync('/proc').filter((x) => /^\d+$/.test(x))) {
        let line = '';
        try { line += fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { /* gone, or not ours to read */ }
        try { line += ` ${fs.readlinkSync(`/proc/${pid}/cwd`)}`; } catch { /* another user's process */ }
        if (line.trim()) out.push(line);
      }
      if (out.length) return out;
    }
    const r = spawnSync('ps', ['-axo', 'command='], { encoding: 'utf8', timeout: 20000, maxBuffer: 64 * 1024 * 1024 });
    return r.status === 0 && r.stdout.trim() ? r.stdout.split(/\r?\n/).filter(Boolean) : null;
  } catch { return null; }
}

/**
 * What every launch does (the MCP server, the editor server): finish or undo an update a crash left, and, in a plugin install,
 * drop the older version folders. Silent, never throws, and a no-op in test mode unless `force`.
 */
export function launchCleanup(dir, { force = false, processes } = {}) {
  const out = { leftovers: null, plugin: null };
  if (!force && isTestMode()) return out;
  try { if (!isPluginInstall(dir)) out.leftovers = recoverUpdateLeftovers(dir); } catch { /* never stops a launch */ }
  try { if (isPluginInstall(dir)) out.plugin = pruneOldPluginVersions(dir, processes ? { processes } : {}); } catch { /* never stops a launch */ }
  return out;
}


/**
 * Migrate the user's edits files kept across the update (v0 bare op arrays -> v1), with the NEW engine.
 * `backupDir`: each file is copied there (same relative path) before it is rewritten. Idempotent.
 */
export async function migrateUserData(dir, backupDir = '') {
  const { migrate } = await import(pathToFileURL(path.join(dir, 'engine', 'edits.mjs')).href);
  const done = [];
  const scan = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { scan(p); continue; }
      if (!/\.edits\.json$/i.test(e.name)) continue;
      let m;
      try { m = migrate(JSON.parse(fs.readFileSync(p, 'utf8'))); } catch { continue; /* newer than this engine or not an edits file: left as is */ }
      if (m.migratedFrom == null) continue;
      const rel = path.relative(dir, p);
      if (backupDir) { const b = path.join(backupDir, rel); if (!fs.existsSync(b)) { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(p, b); } }
      const { migratedFrom, ...v1 } = m;
      fs.writeFileSync(p, JSON.stringify(v1, null, 1) + '\n');
      done.push(rel);
    }
  };
  for (const k of ['.local', 'drafts', 'out']) scan(path.join(dir, k));
  return done;
}

/** After the swap: the folder says the new version, and its engine and update code load (a broken release rolls back). */
export function verifyInstall(dir, version) {
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  if (v !== version) throw new Error(`swap check failed: the folder says ${v}, expected ${version}`);
  const code = ['engine/edits.mjs', 'update/core.mjs'].map((f) => `await import(${JSON.stringify(pathToFileURL(path.join(dir, f)).href)});`).join(' ');
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (r.status !== 0) throw new Error(`the new version does not load: ${String(r.stderr || '').trim().split('\n').pop() || r.status}`);
}

/** Unpack a zip: tar reads zips on Windows and macOS (bsdtar), GNU tar does not, so unzip there. No entry may land outside `to`. */
export const TAR = (() => {
  // Windows' own bsdtar (reads zips), not a GNU tar earlier on PATH (Git Bash), which takes C: for a remote host
  const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return process.platform === 'win32' && fs.existsSync(sys) ? sys : 'tar';
})();
function unzip(zip, to) {
  let list = spawnSync(TAR, ['-tf', zip], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (list.status !== 0) list = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (list.status !== 0 || !safeEntries(String(list.stdout).split(/\r?\n/).filter(Boolean))) return false;
  let x = spawnSync(TAR, ['-xf', zip, '-C', to], { windowsHide: true });
  if (x.status !== 0) x = spawnSync('unzip', ['-q', '-o', zip, '-d', to], { windowsHide: true });
  if (x.status !== 0) return false;
  const root = fs.realpathSync(to) + path.sep;
  return !walkAll(to).some((rel) => !fs.realpathSync(path.join(to, rel)).startsWith(root));
}

/**
 * GET with redirects followed by hand (at most 5), each hop checked (QA Wrap a6ea828): a hop may only go to this
 * repo's release URL or GitHub's asset CDN (*.githubusercontent.com). The token, when there is one, rides on the
 * first hop to api.github.com only and is never sent to a redirect target. `f` is fetch (tests pass a mock).
 */
export async function download(url, { repo, tok = '', accept = 'application/octet-stream', f = globalThis.fetch } = {}) {
  let u = url;
  for (let hop = 0; hop < 6; hop++) {
    const auth = hop === 0 && tok && isAssetApiUrl(u, repo) ? { Authorization: `Bearer ${tok}` } : {};
    const res = await f(u, { headers: { Accept: accept, 'User-Agent': 'business-wrap-update', ...auth }, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      let loc = String(res.headers?.get?.('location') || '');
      try { res.body?.cancel?.(); } catch { /* none */ }
      if (loc.startsWith('/')) loc = `https://github.com${loc}`;
      if (!isAllowedRedirect(loc, repo)) throw new Error('the download was redirected away from this repository');
      u = loc;
      continue;
    }
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('download failed (too many redirects)');
}

/** Zip entries are listed and checked BEFORE anything is unpacked: no absolute path, drive letter, backslash or `..` segment. */
export function safeEntries(names) {
  return names.every((n) => n && !/^[\\/]/.test(n) && !/^[A-Za-z]:/.test(n) && !n.includes('\\') && !n.split('/').some((s) => s === '..'));
}

/** Git checkout install: fast-forward; user files are gitignored, so they stay. A failed verify resets to the old commit. */
function gitUpdate(dir, version, stage, current) {
  const git = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', windowsHide: true });
  if (git('status', '--porcelain', '--untracked-files=no').stdout.trim()) return { ok: false, error: 'the install folder has local changes to tracked files; commit or stash them first' };
  stage('download');
  if (git('fetch', '--tags', 'origin').status !== 0) return { ok: false, error: 'git fetch failed: nothing was changed' };
  stage('backup');
  const head = git('rev-parse', 'HEAD').stdout.trim();
  stage('replace');
  if (git('pull', '--ff-only').status !== 0) return { ok: false, error: 'the install folder cannot fast-forward; update it by hand' };
  stage('verify');
  try { verifyInstall(dir, version); } catch (e) {
    git('reset', '--hard', head);
    return { ok: false, error: `rolled back: ${e.message}`, rolledBack: true };
  }
  return { ok: true, mode: 'git', from: current, to: version, previous: head };
}

/**
 * The files the OLD release shipped, from its own zip (the same repository's release URL, every hop checked), for a first update
 * that has no manifest yet. Best effort: BW_UPDATE_OLD_ZIP (tests) or the download; any failure gives null and the update falls
 * back to CODE_ROOTS alone. Only the listing is read; nothing from it is unpacked.
 */
export async function oldReleaseListing(release, from, repo, f, work) {
  try {
    if (!from || !release?.version) return null;
    const url = String(release.zip).replace(`/v${release.version}/business-wrap-${release.version}.zip`, `/v${from}/business-wrap-${from}.zip`);
    if (url === release.zip || !isReleaseZipUrl(url, repo)) return null;
    const zip = path.join(work, 'old-release.zip');
    if (process.env.BW_UPDATE_OLD_ZIP) fs.copyFileSync(process.env.BW_UPDATE_OLD_ZIP, zip);
    else fs.writeFileSync(zip, await Promise.race([download(url, { repo, f }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 20000).unref())]));
    let list = spawnSync(TAR, ['-tf', zip], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (list.status !== 0) list = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (list.status !== 0) return null;
    const names = String(list.stdout).split(/\r?\n/).filter(Boolean);
    if (!safeEntries(names)) return null;
    const top = new Set(names.map((n) => n.split('/')[0]));
    const strip = top.size === 1 && names.some((n) => n.includes('/')) ? 1 : 0;
    return names.filter((n) => !n.endsWith('/')).map((n) => n.split('/').slice(strip).join('/'));
  } catch { return null; }
}

/**
 * @param {{dir: string, release: {version, zip, zipApi, sha256}, repo: string, token?: string, current: string,
 *   onStage?: (stage: string) => void, failAt?: string}} a
 */
export async function applyUpdate(a) {
  const r = await applyUpdateCore(a);
  // 0.17.0 (N15): after every update the NEW install makes its launcher and puts a fresh copy on the Desktop (own process: the new code; silent; skipped in test runs)
  if (r?.ok && r.applied !== false && !r.plugin) { try { (await import('../launcher/launcher.mjs')).afterUpdate(a.dir); } catch { /* the first run of the new version does it */ } }
  return r;
}
async function applyUpdateCore({ dir, release, repo, token = '', current, onStage = () => {}, failAt = '', fetch: fetchImpl = globalThis.fetch }) {
  const stage = (s) => { try { onStage(s); } catch { /* a progress listener never stops the update */ } };
  // a plugin install is Claude Code's copy (<plugins>/cache/<marketplace>/<plugin>/<version>): rewriting it in place forks it from what the
  // client believes is installed and leaves a running server on a half-new tree. The client's own update path is the only one.
  if (isPluginInstall(dir)) return { ok: false, applied: false, plugin: true, error: 'plugin install: not updated in place', how: PLUGIN_UPDATE_HOW };
  // never a downgrade (0.13.1): a release that is not strictly newer than the installed version is refused, whatever
  // offered it (an old npm copy, a stale cache, a feed that lags behind the GitHub tags)
  const installed = current || (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch { return ''; } })();
  if (installed && !isNewer(release?.version, installed)) return { ok: false, error: `not newer: ${release?.version} is not above the installed ${installed} (no downgrade)` };
  if (fs.existsSync(path.join(dir, '.git'))) {
    try { recoverUpdateLeftovers(dir); } catch { /* the legacy copies are removed on the next launch */ }
    const r = gitUpdate(dir, release.version, stage, current);
    if (r.ok) {
      const copy = migrationBackupDir(dir, current);
      r.migrated = await migrateUserData(dir, copy);
      try { pruneMigrationCopies(dir, fs.existsSync(copy) ? copy : ''); } catch { /* none */ }
      stage('done');
    }
    return r;
  }
  if (!isReleaseZipUrl(release.zip, repo)) return { ok: false, error: 'the release has no business-wrap zip from this repository' };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-update-'));
  try {
    stage('download');
    // BW_UPDATE_ZIP: a local zip in place of the download (tests, offline previews); the checksum is still required
    // the repo is public: the zip comes anonymously from its release URL; the API asset path is used only with a token
    const zipBuf = process.env.BW_UPDATE_ZIP ? fs.readFileSync(process.env.BW_UPDATE_ZIP)
      : token && isAssetApiUrl(release.zipApi, repo) ? await download(release.zipApi, { repo, tok: token, f: fetchImpl }) : await download(release.zip, { repo, f: fetchImpl });
    // checksum is mandatory: GitHub's digest, else the .sha256 published beside the zip (its file name must be this zip)
    let want = /^[0-9a-f]{64}$/i.test(String(release.sha256 || '')) ? release.sha256 : '';
    if (!want) {
      const line = String(await download(`${release.zip}.sha256`, { repo, accept: 'text/plain', f: fetchImpl })).trim().split(/\r?\n/)[0] || '';
      const [h, name = ''] = line.split(/\s+\*?/);
      if (name && name !== release.zip.split('/').pop()) return { ok: false, error: 'checksum file names another zip: nothing was changed' };
      want = h;
    }
    if (!/^[0-9a-f]{64}$/i.test(want) || sha256(zipBuf) !== want.toLowerCase()) return { ok: false, error: 'checksum mismatch: nothing was changed' };
    const zip = path.join(work, 'release.zip');
    fs.writeFileSync(zip, zipBuf);
    const fresh = path.join(work, 'new');
    fs.mkdirSync(fresh);
    if (!unzip(zip, fresh)) return { ok: false, error: 'could not unpack the release: nothing was changed' };
    const inner = fs.readdirSync(fresh);
    const root = inner.length === 1 && fs.statSync(path.join(fresh, inner[0])).isDirectory() ? path.join(fresh, inner[0]) : fresh;
    if (!fs.existsSync(path.join(root, 'package.json')) || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== release.version) return { ok: false, error: 'the release zip does not hold that version: nothing was changed' };
    let migrated = [];
    // a first update has no manifest of shipped files: the old release's own zip listing says what it shipped (best effort)
    const oldShipped = readManifest(dir) ? null : await oldReleaseListing(release, installed, repo, fetchImpl, work);
    const s = await swapInstall(dir, root, current || installed || 'previous', { stage, failAt, oldShipped, verify: async (d, { dataBackup }) => { verifyInstall(d, release.version); migrated = await migrateUserData(d, dataBackup); } });
    if (!s.ok) return { ok: false, error: s.rollbackFailed ? s.error : `rolled back: ${s.error}`, rolledBack: !!s.rolledBack, ...(s.rollbackFailed ? { rollbackFailed: true, backup: s.backup } : {}) };
    stage('done');
    return { ok: true, mode: 'zip', from: current, to: release.version, replaced: true, migrated, ...(s.leftover ? { leftover: s.leftover } : {}), ...(s.removedFiles ? { removedFiles: s.removedFiles, message: s.message } : {}) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
