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
import { spawn, spawnSync } from 'node:child_process';
import { applyOps } from './edits.mjs';
import { REPO } from './export.mjs';

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

/** Create the four folders; HISTORY carries the hidden attribute on Windows whenever it lacks it (a folder made or
 *  copied before 0.13.1 too): `attrib +h` once per folder per process, idempotent. */
const hidden = new Set();
export function ensure(ws = workspace()) {
  for (const d of Object.values(ws.dirs)) fs.mkdirSync(d, { recursive: true });
  if (process.platform === 'win32' && !hidden.has(ws.dirs.history)) {
    spawnSync('attrib', ['+h', ws.dirs.history], { windowsHide: true, stdio: 'ignore' });
    hidden.add(ws.dirs.history);
  }
  return ws;
}
/** True when `file` lies inside <base>\HISTORY (case-insensitive on Windows): machine state, never served. */
export function inHistory(base, file) {
  const r = path.relative(path.resolve(base), path.resolve(file));
  const first = r.split(/[\\/]/)[0];
  return !!r && !r.startsWith('..') && (process.platform === 'win32' ? first.toLowerCase() === 'history' : first === 'HISTORY');
}

const day = (d) => { const x = d instanceof Date ? d : new Date(d ?? Date.now()); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
/** The title as a file name: Arabic and the spaces between words kept (as the pipeline outputs name theirs), path-hostile
 *  characters with the spaces around them → -, at most 80 characters. */
export const titleStem = (s) => String(s || '').normalize('NFC').replace(/\s*[\\/:*?"<>|\u0000-\u001f]+\s*/g, '-').replace(/\s+/g, ' ').replace(/-{2,}/g, '-').replace(/^[-.\s]+|[-.\s]+$/g, '').slice(0, 80).trim() || 'document';
/** "<title>-<YYYY-MM-DD>-<AR|ENG>.<ext>": every file the editor saves (PDF, DOCX, HTML, share, report). */
export function outName(title, date, locale, ext) {
  return `${titleStem(title)}-${day(date)}-${locale === 'en' ? 'ENG' : 'AR'}.${String(ext).replace(/^\./, '')}`;
}

/** dir/name, or name-2, name-3 … when it exists: never an overwrite. */
export function uniquePath(dir, name) {
  const ext = /(\.print)?\.[^.]+$/.exec(name)?.[0] || '', stem = name.slice(0, name.length - ext.length); // "x.print.html" → x-2.print.html
  let f = path.join(dir, name);
  for (let n = 2; fs.existsSync(f); n++) f = path.join(dir, `${stem}-${n}${ext}`);
  return f;
}

/** The dialog's command per platform. Windows: FolderBrowserDialog owned by a 1-px TopMost form that is shown and
 *  brought to the front (an Alt tap lifts the foreground lock a background process has), so it opens in front. */
export const PICK_PS = [
  'Add-Type -AssemblyName System.Windows.Forms',
  "Add-Type -Namespace BW -Name Win -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(System.IntPtr h); [DllImport(\"user32.dll\")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'",
  '$f = New-Object System.Windows.Forms.Form -Property @{TopMost = $true; ShowInTaskbar = $false; FormBorderStyle = "None"; Opacity = 0; StartPosition = "CenterScreen"; Width = 1; Height = 1}',
  '$f.Show(); [BW.Win]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [BW.Win]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero); [void][BW.Win]::SetForegroundWindow($f.Handle); $f.Activate()',
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Business-Wrap"; $d.ShowNewFolderButton = $true',
  'if ($d.ShowDialog($f) -eq "OK") { [Console]::OutputEncoding = [Text.Encoding]::UTF8; $d.SelectedPath }',
  '$f.Close()',
].join('; ');
function pickCmd() {
  if (process.env.BW_PICK_CMD) return JSON.parse(process.env.BW_PICK_CMD); // [exe, ...args]: tests
  if (process.platform === 'win32') return ['powershell.exe', '-NoProfile', '-STA', '-Command', PICK_PS];
  if (process.platform === 'darwin') return ['osascript', '-e', 'POSIX path of (choose folder)'];
  return ['zenity', '--file-selection', '--directory'];
}
let picking = null;
/** The OS folder dialog (Windows FolderBrowserDialog through PowerShell; macOS osascript; Linux zenity), run with an
 *  async spawn so the server keeps answering while it is open; one dialog at a time (a second call joins the first).
 *  BW_PICK_STUB answers at once, BW_PICK_CMD replaces the command (tests). → the chosen parent, or null. */
export function pickParent() {
  if (process.env.BW_PICK_STUB !== undefined) { const s = process.env.BW_PICK_STUB.trim(); return Promise.resolve(s ? setParent(s).parent : null); }
  return (picking ||= new Promise((ok) => {
    const [exe, ...args] = pickCmd();
    let out = '';
    const cp = spawn(exe, args, { windowsHide: false, stdio: ['ignore', 'pipe', 'ignore'] });
    cp.stdout.setEncoding('utf8').on('data', (d) => { out += d; });
    cp.on('error', () => ok(''));
    cp.on('close', () => ok(out));
  }).then((out) => { picking = null; const s = String(out).trim(); return s ? setParent(s).parent : null; }, () => { picking = null; return null; }));
}

/** The document's title for file names: control.coverTitle, else the service-name part of control.title. */
export function docTitle(doc, fallback = 'document') {
  const c = doc?.control || {};
  const t = String(c.title || '');
  return String(c.coverTitle || t.split(/\s*[:—]\s+/).slice(1).join(': ') || t || fallback).trim() || fallback;
}
/** The blank document's placeholder names: a title still equal to one of them is "not named yet". */
export const PLACEHOLDER_TITLES = new Set(['خدمة جديدة', 'New service']);
/** docTitle of an edition, falling back to another edition's title while this one is still the placeholder. */
export function pairedTitle(doc, others = [], fallback = 'document') {
  const own = docTitle(doc, fallback);
  if (!PLACEHOLDER_TITLES.has(own)) return own;
  return others.map((d) => docTitle(d, '')).find((x) => x && !PLACEHOLDER_TITLES.has(x)) || own;
}

/** A JSON request body, refused (413) over `max` bytes. Shared by engine/routes/{workspace,library,session}.mjs. */
export async function readJson(req, max = 60 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  const s = Buffer.concat(chunks).toString('utf8');
  try { return s ? JSON.parse(s) : {}; } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
}

/** The performance report's file in PDF\: "<تقرير الأداء|Performance report>-<date>-<AR|ENG>.pdf", -2 on a clash. */
export const reportPath = (pdfDir, lang) => uniquePath(pdfDir, outName(lang === 'en' ? 'Performance report' : 'تقرير الأداء', new Date(), lang, 'pdf'));

/** A shared Save-HTML's file in HTML\: named by the document inside it (bw-data), never by its id. */
export function sharePath(htmlDir, html, fallback = 'document') {
  const locale = /<html[^>]*\blang="en"/i.test(html) ? 'en' : 'ar';
  let title = '';
  try {
    const data = JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html)[1]);
    const eds = data.services?.[0]?.editions || {};
    // the document as it is on screen: the base plus its edits (a renamed cover lives in the ops, not in raw)
    const docs = Object.fromEntries(Object.entries(eds).map(([k, x]) => [k, applyOps(JSON.parse(x.raw), x.ops || [])]));
    const own = docs[locale] || Object.values(docs)[0];
    title = pairedTitle(own, Object.values(docs).filter((d) => d !== own), '');
  } catch { /* not a Save-HTML: the fallback */ }
  return uniquePath(htmlDir, outName(title || String(fallback).replace(/(\.editor)?\.html?$/i, ''), new Date(), locale, 'html'));
}
