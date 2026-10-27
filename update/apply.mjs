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
import { isReleaseZipUrl } from './core.mjs';

/** User-owned paths that an update never replaces or removes (relative to the install folder). */
export const KEEP = ['.local', '.git', 'node_modules', 'out', 'design/custom', 'logos', 'fonts/custom', 'drafts'];

const kept = (rel) => KEEP.some((k) => rel === k || rel.startsWith(`${k}/`));
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

/**
 * Replace the product files of `dir` with those of `fresh`, keeping KEEP paths untouched.
 * One backup (`<dir>.backup-<from>`, older backups removed); restored on any failure.
 */
export function swapInstall(dir, fresh, from = 'previous') {
  const backup = `${dir}.backup-${from}`;
  const parent = path.dirname(dir);
  for (const n of fs.readdirSync(parent)) if (n.startsWith(`${path.basename(dir)}.backup-`)) fs.rmSync(path.join(parent, n), { recursive: true, force: true });
  fs.cpSync(dir, backup, { recursive: true, filter: (src) => !/[\\/]node_modules([\\/]|$)/.test(src) });
  try {
    for (const rel of walk(dir)) fs.rmSync(path.join(dir, rel), { force: true });
    for (const rel of walk(fresh)) {
      const to = path.join(dir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(path.join(fresh, rel), to);
    }
    return { ok: true, backup };
  } catch (e) {
    for (const rel of walk(backup)) { const to = path.join(dir, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(backup, rel), to); }
    return { ok: false, backup, error: String(e.message || e) };
  }
}

/** Migrate the user's edits files kept across the update (v0 bare op arrays -> v1), with the NEW engine. */
export async function migrateUserData(dir) {
  const { migrate } = await import(pathToFileURL(path.join(dir, 'engine', 'edits.mjs')).href);
  const done = [];
  const scan = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.edits\.json$/i.test(e.name)) {
        try {
          const m = migrate(JSON.parse(fs.readFileSync(p, 'utf8')));
          if (m.migratedFrom != null) { const { migratedFrom, ...v1 } = m; fs.writeFileSync(p, JSON.stringify(v1, null, 1) + '\n'); done.push(path.relative(dir, p)); }
        } catch { /* newer than this engine or not an edits file: left as is */ }
      }
    }
  };
  for (const k of ['.local', 'drafts', 'out']) scan(path.join(dir, k));
  return done;
}

async function download(url, tok, accept) {
  const res = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'business-wrap-update', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** Git checkout install: fast-forward the checkout; user files are gitignored, so they stay. */
function gitUpdate(dir, version) {
  const git = (...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8', windowsHide: true });
  if (git('status', '--porcelain', '--untracked-files=no').stdout.trim()) return { ok: false, error: 'the install folder has local changes to tracked files; commit or stash them first' };
  const f = git('fetch', '--tags', 'origin');
  if (f.status !== 0) return { ok: false, error: 'git fetch failed' };
  const p = git('pull', '--ff-only');
  if (p.status !== 0) return { ok: false, error: 'the install folder cannot fast-forward; update it by hand' };
  return { ok: true, mode: 'git', to: version };
}

/** @param {{dir: string, release: {version, zip, zipApi, sha256}, repo: string, token?: string, current: string}} a */
export async function applyUpdate({ dir, release, repo, token = '', current }) {
  if (fs.existsSync(path.join(dir, '.git'))) {
    const r = gitUpdate(dir, release.version);
    if (r.ok) r.migrated = await migrateUserData(dir);
    return r;
  }
  if (!isReleaseZipUrl(release.zip, repo)) return { ok: false, error: 'the release has no business-wrap zip from this repository' };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-update-'));
  try {
    const zipBuf = release.zipApi && token ? await download(release.zipApi, token, 'application/octet-stream') : await download(release.zip, token, 'application/octet-stream');
    let want = release.sha256;
    if (!want) want = String(await download(`${release.zip}.sha256`, token, 'text/plain')).trim().split(/\s+/)[0];
    if (!/^[0-9a-f]{64}$/i.test(want) || sha256(zipBuf) !== want.toLowerCase()) return { ok: false, error: 'checksum mismatch: nothing was changed' };
    const zip = path.join(work, 'release.zip');
    fs.writeFileSync(zip, zipBuf);
    const fresh = path.join(work, 'new');
    fs.mkdirSync(fresh);
    const x = spawnSync('tar', ['-xf', zip, '-C', fresh], { windowsHide: true });
    if (x.status !== 0) return { ok: false, error: 'could not unpack the release' };
    const inner = fs.readdirSync(fresh);
    const root = inner.length === 1 && fs.statSync(path.join(fresh, inner[0])).isDirectory() ? path.join(fresh, inner[0]) : fresh;
    if (!fs.existsSync(path.join(root, 'package.json')) || JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version !== release.version) return { ok: false, error: 'the release zip does not hold that version' };
    const s = swapInstall(dir, root, current);
    if (!s.ok) return { ok: false, error: `rolled back: ${s.error}`, backup: s.backup };
    return { ok: true, mode: 'zip', from: current, to: release.version, backup: s.backup, migrated: await migrateUserData(dir) };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}
