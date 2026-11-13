// The Business-Wrap launcher and its Desktop copy (0.17.0, owner note N15).
//   Business-Wrap.lnk   a Windows shortcut with the Business-Wrap logo (assets/icons/launcher.ico, 16 to 256 px). It runs
//                       wscript.exe //B launcher/open-editor.vbs "<node.exe>" -> open-editor.mjs: the editor opens in the browser (Chrome first)
//                       and NO host starts (the top-bar toggle starts it: business-wrap://start).
//   where it sits       the install folder; for a Claude Code plugin install (a client-owned cache) the plugin data folder, never the cache.
//   Desktop copy        after the FIRST run of an install and after EVERY update (the stamp holds version + install): copied over the old one
//                       (written beside it, then renamed over: never half a shortcut). Not re-made on every run: a copy the person deleted stays deleted.
// Why a .lnk and not an exe: no build chain, no SmartScreen/"unknown publisher" prompt, a real multi-size icon, and Explorer shows it as the app.
// Tests: never the real Desktop (BW_DESKTOP_DIR names the folder; in test mode no folder means no copy), never the registry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { localBase, isTestMode, isPluginInstall, pluginData } from '../engine/testguard.mjs';
import { sandboxed, mayTakeOver, installOf } from '../engine/ownership.mjs';

export const INSTALL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LNK_NAME = 'Business-Wrap.lnk';
export const STAMP_NAME = 'launcher-stamp.json';
const psArgs = (script) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
const ps = (script, env = {}, ms = 20000) => spawnSync('powershell.exe', psArgs(script), { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true, timeout: ms });

const PS_MAKE = `
$ErrorActionPreference='Stop'
$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:BW_LNK_PATH)
$s.TargetPath=$env:BW_LNK_TARGET; $s.Arguments=$env:BW_LNK_ARGS; $s.WorkingDirectory=$env:BW_LNK_DIR
$s.IconLocation=($env:BW_LNK_ICON + ',0'); $s.Description='Business-Wrap'; $s.WindowStyle=7
$s.Save()
`;
const PS_READ = `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.Encoding]::UTF8
$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:BW_LNK_PATH)
ConvertTo-Json -Compress -InputObject @{target=$s.TargetPath;args=$s.Arguments;icon=$s.IconLocation;dir=$s.WorkingDirectory}
`;
const PS_DESKTOP = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetFolderPath('Desktop')`;

const version = (installDir) => { try { return JSON.parse(fs.readFileSync(path.join(installDir, 'package.json'), 'utf8')).version; } catch { return ''; } };

/** The person's Desktop folder (a redirected one, OneDrive, included). BW_DESKTOP_DIR wins; in test mode with none, null: a test never touches the real Desktop. */
export function desktopDir() {
  if (process.env.BW_DESKTOP_DIR) return path.resolve(process.env.BW_DESKTOP_DIR);
  if (isTestMode()) return null;
  if (process.platform === 'win32') { const r = ps(PS_DESKTOP, {}, 10000); const d = String(r.stdout || '').trim(); if (r.status === 0 && d && fs.existsSync(d)) return d; }
  const d = path.join(os.homedir(), 'Desktop');
  return fs.existsSync(d) ? d : null;
}
/** Where the launcher sits: the install folder, or the plugin data folder for a Claude Code plugin install. */
export const lnkDirFor = (installDir = INSTALL) => (isPluginInstall(installDir) ? (pluginData(installDir) || localBase(installDir)) : installDir);
export const stampFile = (installDir = INSTALL) => path.join(localBase(installDir), STAMP_NAME);
const readStamp = (installDir) => { try { return JSON.parse(fs.readFileSync(stampFile(installDir), 'utf8')); } catch { return null; } };
const writeAtomic = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); const t = `${file}.${process.pid}.tmp`; fs.writeFileSync(t, text); fs.renameSync(t, file); };

/** The shortcut's own fields (read back through the shell): {target, args, icon, dir}; null when it cannot be read. */
export function readShortcut(lnk) {
  if (process.platform !== 'win32') return null;
  const r = ps(PS_READ, { BW_LNK_PATH: lnk });
  try { return r.status === 0 ? JSON.parse(String(r.stdout).trim()) : null; } catch { return null; }
}

/** Make (or replace) the launcher shortcut. Written under a temporary name and renamed over the old one. → {lnk, replaced}. */
export function makeLauncher({ installDir = INSTALL, lnkDir = lnkDirFor(installDir), node = process.execPath, icon = path.join(installDir, 'assets', 'icons', 'launcher.ico') } = {}) {
  if (process.platform !== 'win32') return { supported: false, reason: 'windows-only' };
  const vbs = path.join(installDir, 'launcher', 'open-editor.vbs');
  for (const f of [vbs, icon]) if (!fs.existsSync(f)) return { supported: true, ok: false, error: `missing ${f}` };
  fs.mkdirSync(lnkDir, { recursive: true });
  const lnk = path.join(lnkDir, LNK_NAME);
  const tmp = path.join(lnkDir, `Business-Wrap.${process.pid}.tmp.lnk`);
  const r = ps(PS_MAKE, { BW_LNK_PATH: tmp, BW_LNK_TARGET: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'wscript.exe'), BW_LNK_ARGS: `//B //Nologo "${vbs}" "${node}"`, BW_LNK_DIR: installDir, BW_LNK_ICON: icon });
  if (r.status !== 0 || !fs.existsSync(tmp)) { try { fs.rmSync(tmp, { force: true }); } catch { /* none */ } return { supported: true, ok: false, error: String(r.stderr || r.stdout || 'shortcut not made').trim().slice(0, 300) }; }
  const replaced = fs.existsSync(lnk);
  try { fs.renameSync(tmp, lnk); } catch { fs.rmSync(lnk, { force: true }); fs.renameSync(tmp, lnk); }
  return { supported: true, ok: true, lnk, replaced };
}

/** Put a copy of the launcher on the Desktop, replacing an older one. → {copy, replaced}. */
export function copyToDesktop({ lnk, desktop }) {
  fs.mkdirSync(desktop, { recursive: true });
  const copy = path.join(desktop, LNK_NAME);
  const tmp = path.join(desktop, `Business-Wrap.${process.pid}.tmp.lnk`);
  fs.copyFileSync(lnk, tmp);
  const replaced = fs.existsSync(copy);
  try { fs.renameSync(tmp, copy); } catch { fs.rmSync(copy, { force: true }); fs.renameSync(tmp, copy); }
  return { copy, replaced };
}

/** True when the Desktop copy `lnk` points at an install folder that no longer exists. Cheap first: a copy that holds this install's own path is fine (no shell call). */
function deadCopy(lnk, installDir) {
  try {
    const b = fs.readFileSync(lnk);
    if (b.includes(Buffer.from(installDir, 'utf16le')) || b.includes(Buffer.from(installDir, 'latin1'))) return false;
    const cur = installOf(readShortcut(lnk)?.args);
    return !!cur && !fs.existsSync(cur);
  } catch { return false; }
}

/** The launcher in place, and the Desktop copy when this install (version + folder) has not put one there yet (or `force`). Never throws.
 *  → {launcher, desktop:{copy, replaced}|{skipped}}. */
export function ensureLauncher({ installDir = INSTALL, lnkDir, desktop, force = false, node } = {}) {
  try {
    if (process.platform !== 'win32') return { supported: false, reason: 'windows-only' };
    const ver = version(installDir);
    const stamp = readStamp(installDir);
    let due = force || !stamp || stamp.version !== ver || stamp.install !== installDir;
    if (!due) { const w = stamp.desktop || stamp.watch; if (w && fs.existsSync(w) && deadCopy(w, installDir)) due = true; } // a current stamp, but the Desktop copy points at a folder that is gone: repair it
    const dir = lnkDir || lnkDirFor(installDir);
    const have = path.join(dir, LNK_NAME);
    let launcher = { ok: true, lnk: have, replaced: false, kept: true };
    if (due || !fs.existsSync(have)) { launcher = makeLauncher({ installDir, lnkDir: dir, ...(node ? { node } : {}) }); if (!launcher.ok) return { launcher, desktop: { skipped: 'no-launcher' } }; }
    if (!due) return { launcher, desktop: { skipped: 'already-copied' } };
    const where = desktop === undefined ? desktopDir() : desktop;
    if (!where) return { launcher, desktop: { skipped: 'no-desktop-folder' } };
    // only the install the person set up takes over a Desktop copy on its own (launcher/ownership.mjs); `make --force` is the explicit take-over
    const existing = path.join(where, LNK_NAME);
    const current = fs.existsSync(existing) ? installOf(readShortcut(existing)?.args) : null;
    const may = mayTakeOver({ installDir, current, explicit: force, realProfile: desktop === undefined && !process.env.BW_DESKTOP_DIR });
    if (!may.ok) {
      writeAtomic(stampFile(installDir), JSON.stringify({ version: ver, install: installDir, desktop: null, watch: existing, skipped: may.why, at: new Date().toISOString() }, null, 1)); // asked once, not on every run
      return { launcher, desktop: { skipped: may.why, ...(current ? { keeps: current } : {}) } };
    }
    const d = copyToDesktop({ lnk: launcher.lnk, desktop: where });
    writeAtomic(stampFile(installDir), JSON.stringify({ version: ver, install: installDir, desktop: d.copy, at: new Date().toISOString() }, null, 1));
    return { launcher, desktop: d };
  } catch (e) { return { launcher: { ok: false, error: String(e?.message || e).slice(0, 200) }, desktop: { skipped: 'error' } }; }
}

// A run in its own state folder (a test, a trial) never writes the real Desktop; a source checkout never takes over a live one (launcher/ownership.mjs).
// `node launcher/launcher.mjs make --force` is the person's own "make this the default" and still does.

/** The hook every entry calls (terminal, MCP, Claude Code plugin hook, protocol handler, an opened export): idempotent, once per install and version, never throws,
 *  silent. BW_NO_LAUNCHER=1 skips; test mode skips unless a test names its own Desktop folder (BW_DESKTOP_DIR). */
export function autorun() {
  // the business-wrap: link too. It used to be registered only by `business-wrap open`, so a PC set up with `npm run serve`, `npm run host`,
  // MCP or the Desktop launcher had a top-bar host switch that handed business-wrap://start to nothing. ensureRegistered keeps its own guards
  // (BW_NO_PROTOCOL, sandbox, worktree, another live install) and never throws.
  if (process.platform === 'win32') import('../engine/protocol.mjs').then((m) => m.ensureRegistered(), () => {});
  if (process.env.BW_NO_LAUNCHER === '1' || process.platform !== 'win32') return { skipped: true };
  if (sandboxed() && !process.env.BW_DESKTOP_DIR) return { skipped: true };
  return ensureLauncher();
}

/** After an update: the new install makes its own launcher and Desktop copy (a separate process: the new code, not the old one that is running). */
export function afterUpdate(installDir) {
  if (process.env.BW_NO_LAUNCHER === '1' || process.platform !== 'win32' || (sandboxed() && !process.env.BW_DESKTOP_DIR)) return { skipped: true };
  try {
    const c = spawn(process.execPath, [path.join(installDir, 'launcher', 'launcher.mjs'), 'make'], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
    c.on('error', () => {});
    c.unref();
    return { started: true };
  } catch { return { started: false }; }
}

const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  // node launcher/launcher.mjs make [--force]: the launcher + the Desktop copy (what an update runs in the new install)
  const r = process.argv[2] === 'make' ? ensureLauncher({ force: process.argv.includes('--force') }) : { usage: 'node launcher/launcher.mjs make [--force]' };
  console.log(JSON.stringify(r));
}
