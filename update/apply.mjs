// Apply an update to an installed Business-Wrap folder, keeping the user's own files.
// Mirrors QA Wrap's extension/updater/host.ps1 (Invoke-Update, lines 84-154): download the release
// zip, verify its SHA-256 (GitHub's digest or the .sha256 published beside it), keep ONE backup of
// the current folder, swap in place, roll back from the backup on any failure. Never asks anything:
// the caller (CLI --apply --yes, MCP apply_update with confirm: true) has already got consent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isReleaseZipUrl, isAssetApiUrl, isAllowedRedirect, isNewer } from './core.mjs';

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

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (kept(rel)) continue;
    if (e.isDirectory()) walk(p, base, out);
    else out.push(rel);
  }
  return out;
}
/** Every file under `dir`, KEEP paths included (the backup holds the user's data too). */
function walkAll(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAll(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
const copyIn = (from, to, rel) => { const t = path.join(to, rel); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(from, rel), t); };

/** The update's stages, in order (the editor shows them as steps). */
export const STAGES = ['download', 'backup', 'replace', 'verify', 'done'];

/**
 * Replace the program files of `dir` with those of `fresh`: every release file is written; a file the
 * release dropped is removed only inside CODE_ROOTS; KEEP paths are never written or removed.
 * One backup (`<dir>.backup-<from>`, older backups removed) of everything but node_modules and .git, user
 * data included. `verify(dir)` runs after the swap; any throw (swap or verify) restores the backup: the
 * release's new files are removed and every backed-up file (program and data) is copied back.
 * `failAt` ('replace' | 'verify') forces a failure there: tests only.
 */
export async function swapInstall(dir, fresh, from = 'previous', { stage = () => {}, verify = async () => {}, failAt = '' } = {}) {
  const backup = `${dir}.backup-${from}`;
  const parent = path.dirname(dir);
  stage('backup');
  for (const n of fs.readdirSync(parent)) if (n.startsWith(`${path.basename(dir)}.backup-`)) fs.rmSync(path.join(parent, n), { recursive: true, force: true });
  fs.cpSync(dir, backup, { recursive: true, filter: (src) => !/^(node_modules|\.git)([\\/]|$)/.test(path.relative(dir, src)) });
  const incoming = walk(fresh);
  try {
    stage('replace');
    const ships = new Set(incoming);
    for (const rel of walk(dir)) if (!ships.has(rel) && codeFile(rel)) fs.rmSync(path.join(dir, rel), { force: true });
    const half = incoming[Math.floor(incoming.length / 2)];
    for (const rel of incoming) {
      if (failAt === 'replace' && rel === half) throw new Error('forced failure halfway through the replace (test)');
      copyIn(fresh, dir, rel);
    }
    stage('verify');
    if (failAt === 'verify') throw new Error('forced failure in verify (test)');
    await verify(dir);
    return { ok: true, backup };
  } catch (e) {
    const had = new Set(walkAll(backup));
    for (const rel of incoming) if (!had.has(rel)) fs.rmSync(path.join(dir, rel), { force: true });
    for (const rel of had) copyIn(backup, dir, rel);
    return { ok: false, backup, error: String(e.message || e), rolledBack: true };
  }
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
 * @param {{dir: string, release: {version, zip, zipApi, sha256}, repo: string, token?: string, current: string,
 *   onStage?: (stage: string) => void, failAt?: string}} a
 */
export async function applyUpdate({ dir, release, repo, token = '', current, onStage = () => {}, failAt = '', fetch: fetchImpl = globalThis.fetch }) {
  const stage = (s) => { try { onStage(s); } catch { /* a progress listener never stops the update */ } };
  // never a downgrade (0.13.1): a release that is not strictly newer than the installed version is refused, whatever
  // offered it (an old npm copy, a stale cache, a feed that lags behind the GitHub tags)
  const installed = current || (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch { return ''; } })();
  if (installed && !isNewer(release?.version, installed)) return { ok: false, error: `not newer: ${release?.version} is not above the installed ${installed} (no downgrade)` };
  if (fs.existsSync(path.join(dir, '.git'))) {
    const r = gitUpdate(dir, release.version, stage, current);
    if (r.ok) { r.migrated = await migrateUserData(dir, `${dir}.backup-${current}-data`); stage('done'); }
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
    const s = await swapInstall(dir, root, current, { stage, failAt, verify: async (d) => { verifyInstall(d, release.version); migrated = await migrateUserData(d); } });
    if (!s.ok) return { ok: false, error: `rolled back: ${s.error}`, backup: s.backup, rolledBack: true };
    stage('done');
    return { ok: true, mode: 'zip', from: current, to: release.version, backup: s.backup, migrated };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
