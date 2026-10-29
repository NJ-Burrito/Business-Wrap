// The save folder (A11, 0.13.0): <parent>\Business-Wrap\{PDF,DOCX,HTML,HISTORY}.
// The parent is chosen once (pickParent: the OS folder dialog) and kept in .local/workspace.json; the default is the
// user's Documents folder (else home), never inside this repository. HISTORY is machine state only (hidden on Windows).
//
//   workspace()                        → {parent, root, dirs: {pdf, docx, html, history}}
//   outName(title, date, locale, ext)  → "<title>-<YYYY-MM-DD>-<AR|ENG>.<ext>"
//   pickParent()                       → the chosen folder (stored) or null when cancelled
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, fileStem } from './export.mjs';

/** .local/ (gitignored); BW_LOCAL_DIR moves it (tests). */
export const localDir = () => path.resolve(process.env.BW_LOCAL_DIR || path.join(REPO, '.local'));
const store = () => path.join(localDir(), 'workspace.json');
const inside = (p, dir) => { const r = path.relative(dir, p); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); };

export function defaultParent() {
  const docs = path.join(os.homedir(), 'Documents');
  return fs.existsSync(docs) ? docs : os.homedir();
}

/** A parent that is absolute and not inside the repository, else null. */
export function validParent(p) {
  if (typeof p !== 'string' || !p || /[\u0000-\u001f]/.test(p) || !path.isAbsolute(p)) return null;
  const abs = path.resolve(p);
  return inside(abs, REPO) ? null : abs;
}

/** Order: BW_WORKSPACE (env) → .local/workspace.json → Documents. A stored parent inside the repo is ignored. */
export function workspace() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(store(), 'utf8')).parent; } catch { /* not chosen yet */ }
  const parent = validParent(process.env.BW_WORKSPACE) || validParent(saved) || defaultParent();
  const root = path.join(parent, 'Business-Wrap');
  return { parent, root, chosen: !!(validParent(process.env.BW_WORKSPACE) || validParent(saved)), dirs: { pdf: path.join(root, 'PDF'), docx: path.join(root, 'DOCX'), html: path.join(root, 'HTML'), history: path.join(root, 'HISTORY') } };
}

/** Remember a parent folder; refuses one inside the repository. */
export function setParent(p) {
  const abs = validParent(p);
  if (!abs) throw Object.assign(new Error('folder: an absolute path outside the Business-Wrap folder'), { code: 400 });
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(store(), JSON.stringify({ parent: abs, at: new Date().toISOString() }, null, 1));
  return workspace();
}

/** Create the four folders (first use); HISTORY gets the hidden attribute on Windows. */
export function ensure(ws = workspace()) {
  const fresh = !fs.existsSync(ws.dirs.history);
  for (const d of Object.values(ws.dirs)) fs.mkdirSync(d, { recursive: true });
  if (fresh && process.platform === 'win32') spawnSync('attrib', ['+h', ws.dirs.history], { windowsHide: true });
  return ws;
}

const day = (d) => { const x = d instanceof Date ? d : new Date(d ?? Date.now()); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
/** "<title>-<YYYY-MM-DD>-<AR|ENG>.<ext>": the title through fileStem (Arabic kept, path-hostile characters → -). */
export function outName(title, date, locale, ext) {
  return `${fileStem(title)}-${day(date)}-${locale === 'en' ? 'ENG' : 'AR'}.${String(ext).replace(/^\./, '')}`;
}

/** dir/name, or name-2, name-3 … when it exists: never an overwrite. */
export function uniquePath(dir, name) {
  const ext = /(\.print)?\.[^.]+$/.exec(name)?.[0] || '', stem = name.slice(0, name.length - ext.length); // "x.print.html" → x-2.print.html
  let f = path.join(dir, name);
  for (let n = 2; fs.existsSync(f); n++) f = path.join(dir, `${stem}-${n}${ext}`);
  return f;
}

/** The OS folder dialog (Windows FolderBrowserDialog through PowerShell; macOS osascript; Linux zenity). BW_PICK_STUB answers for tests. */
export async function pickParent() {
  let out = '';
  if (process.env.BW_PICK_STUB !== undefined) out = process.env.BW_PICK_STUB;
  else if (process.platform === 'win32') {
    const ps = 'Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Business-Wrap"; $d.ShowNewFolderButton = $true; $f = New-Object System.Windows.Forms.Form -Property @{TopMost = $true}; if ($d.ShowDialog($f) -eq "OK") { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }';
    out = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { encoding: 'utf8', windowsHide: false }).stdout || '';
  } else if (process.platform === 'darwin') out = spawnSync('osascript', ['-e', 'POSIX path of (choose folder)'], { encoding: 'utf8' }).stdout || '';
  else out = spawnSync('zenity', ['--file-selection', '--directory'], { encoding: 'utf8' }).stdout || '';
  out = out.trim();
  if (!out) return null;
  return setParent(out).parent;
}

/** The document's title for file names: control.coverTitle, else the service-name part of control.title. */
export function docTitle(doc, fallback = 'document') {
  const c = doc?.control || {};
  const t = String(c.title || '');
  return String(c.coverTitle || t.split(/\s*[:—]\s+/).slice(1).join(': ') || t || fallback).trim() || fallback;
}

/** A JSON request body, refused (413) over `max` bytes. Shared by engine/routes/{workspace,library,session}.mjs. */
export async function readJson(req, max = 60 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
}
