// The save folder (0.13.3 tree): <parent>\Business-Wrap\
//   اقرأني - README.txt
//   المستندات - Documents\<Document title>\{<title>.html, Exports\, Sources\, Versions\}   (one folder per document)
//   .system\{history\, backups\, sessions\, library\, cache\, index in history\index.json}      (machine state, hidden)
// The parent is chosen once (pickParent: the OS folder dialog) and kept in .local/workspace.json; the default is the
// user's Documents folder (else home), never inside this repository.
//
//   workspace()                        → {parent, root, dirs: {docs, pdf=docs, docx=docs, html=docs, system, history, backups, sessions, library, cache}}
//   outName(title, date, locale, ext)  → "<title>/Exports/<YYYY-MM-DD HH-MM> <title> - <العربية|English|both>.<ext>" (a path below the documents folder)
//   pickParent()                       → the chosen folder (stored) or null when cancelled
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { applyOps } from './edits.mjs';
import { REPO } from './export.mjs';
import { localBase, isTestMode, testSandbox, isRealRoot, realParent } from './testguard.mjs';
import { tidyNow } from './tidy.mjs'; // a cycle by design: used only when ensure() meets an old layout

/** .local/ (gitignored); BW_LOCAL_DIR moves it (tests). */
export const localDir = () => localBase(REPO);
const store = () => path.join(localDir(), 'workspace.json');
const inside = (p, dir) => { const r = path.relative(dir, p); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); };

export function defaultParent() {
  // under the test runner (tests/run.mjs sets BW_TEST_SLOT) a suite that names no BW_WORKSPACE gets a temp parent, never the real Documents
  if (isTestMode()) return testSandbox('parent');
  const docs = realParent();
  return fs.existsSync(docs) ? docs : os.homedir();
}

/** A parent that is absolute and not inside the repository, else null. */
export function validParent(p) {
  if (typeof p !== 'string' || !p || /[\u0000-\u001f]/.test(p) || !path.isAbsolute(p)) return null;
  const abs = path.resolve(p);
  if (isTestMode() && (isRealRoot(abs) || isRealRoot(path.join(abs, 'Business-Wrap')))) return null; // a test never works in the owner's real folder
  return inside(abs, REPO) ? null : abs;
}

export const DOCS_NAME = 'المستندات - Documents';
export const SYSTEM_NAME = '.system';
export const UNSORTED_NAME = '_غير مصنف - Unsorted';
export const README_NAME = 'اقرأني - README.txt';
export const LEGACY = ['PDF', 'DOCX', 'HTML', 'HISTORY'];

/** The folders of one save folder (root = <parent>\Business-Wrap). pdf, docx and html are the documents folder itself
 *  (callers that still say dirs.pdf get paths routed into the document's own Exports\ by uniquePath). */
export function dirsOf(root) {
  const docs = path.join(root, DOCS_NAME), system = path.join(root, SYSTEM_NAME);
  return { docs, pdf: docs, docx: docs, html: docs, system, history: path.join(system, 'history'), backups: path.join(system, 'backups'), sessions: path.join(system, 'sessions'), library: path.join(system, 'library'), cache: path.join(system, 'cache') };
}
/** Order: BW_WORKSPACE (env) → .local/workspace.json → Documents. A stored parent inside the repo is ignored. */
export function workspace() {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(store(), 'utf8')).parent; } catch { /* not chosen yet */ }
  const parent = validParent(process.env.BW_WORKSPACE) || validParent(saved) || defaultParent();
  const root = path.join(parent, 'Business-Wrap');
  return { parent, root, chosen: !!(validParent(process.env.BW_WORKSPACE) || validParent(saved)), dirs: dirsOf(root) };
}
/** A machine-state sub-folder of a workspace's dirs; a hand-made dirs object (tests) without it keeps it inside history. */
export const subdir = (dirs, key) => dirs[key] || path.join(dirs.history, key);
/** Machine-state files that sit directly in .system (projects.json, profile.json.gz). */
export const systemDir = (dirs) => dirs.system || dirs.history;

/** Remember a parent folder; refuses one inside the repository. */
export function setParent(p) {
  const abs = validParent(p);
  if (!abs) throw Object.assign(new Error('folder: an absolute path outside the Business-Wrap folder'), { code: 400 });
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(store(), JSON.stringify({ parent: abs, at: new Date().toISOString() }, null, 1));
  return workspace();
}

/** Create the folders; .system carries the hidden attribute on Windows (dot-folder elsewhere), the README of the tree is written once, and an
 *  old 0.13.0-0.13.2 layout (PDF, DOCX, HTML, HISTORY) of a chosen folder is moved into the tree once per process (engine/tidy.mjs; BW_NO_MIGRATE=1 skips it). */
const hidden = new Set();
const migrated = new Set();
export function ensure(ws = workspace()) {
  if (ws.root && !migrated.has(ws.root)) {
    migrated.add(ws.root);
    // only a folder the user chose (or BW_WORKSPACE names), never the default Documents guess, and never the owner's real folder from a test:
    // `business-wrap tidy` moves any other folder on request
    if (!process.env.BW_NO_MIGRATE && !(isTestMode() && isRealRoot(ws.root)) && ws.chosen && LEGACY.some((n) => fs.existsSync(path.join(ws.root, n)))) tidyNow(ws);
  }
  for (const d of Object.values(ws.dirs)) fs.mkdirSync(d, { recursive: true });
  const sys = ws.dirs.system || ws.dirs.history;
  if (process.platform === 'win32' && !hidden.has(sys)) {
    spawnSync('attrib', ['+h', sys], { windowsHide: true, stdio: 'ignore' });
    hidden.add(sys);
  }
  if (ws.root) writeReadme(ws.root);
  return ws;
}
/** True when `file` lies inside <base>\.system (or the old HISTORY; case-insensitive on Windows): machine state, never served. */
export function inHistory(base, file) {
  const r = path.relative(path.resolve(base), path.resolve(file));
  const first = r.split(/[\\/]/)[0];
  const win = process.platform === 'win32';
  return !!r && !r.startsWith('..') && ((win ? first.toLowerCase() : first) === SYSTEM_NAME || (win ? first.toLowerCase() === 'history' : first === 'HISTORY'));
}

export const README_TEXT = `اقرأني · README
================

العربية
  المستندات - Documents\\   مجلّد لكل مستند باسمه: ملف المستند (.html) وبداخله:
      Exports\\   كل ملفات PDF وDOCX المصدّرة، باسم التاريخ والعنوان واللغة
      Sources\\   ما جُمع أو استُورد لهذا المستند (صفحات، لقطات، ملفات)
      Versions\\  النسخ السابقة عند كل حفظ (لا يُحذف منها شيء)
  المستندات - Documents\\_غير مصنف - Unsorted\\   ملفات قديمة لم نعرف مستندها
  .system\\   مخفي: سجل التاريخ والنسخ الاحتياطية والجلسات. لا تنقله ولا تغيّره.

English
  Documents\\   one folder per document, named by its title: the document file (.html) and inside it:
      Exports\\   every exported PDF and DOCX, named date, title, language
      Sources\\   what was harvested or imported for this document (pages, screenshots, files)
      Versions\\  the previous saves, kept (nothing is deleted)
  Documents\\_Unsorted\\   old files whose document we could not tell
  .system\\   hidden: the history log, backups and sessions. Do not move or change it.
`;
function writeReadme(root) {
  try { const f = path.join(root, README_NAME); if (!fs.existsSync(f)) fs.writeFileSync(f, '﻿' + README_TEXT.replace(/\n/g, '\r\n'), 'utf8'); } catch { /* read-only parent: no README */ }
}

const pad2 = (n) => String(n).padStart(2, '0');
const day = (d) => { const x = d instanceof Date ? d : new Date(d ?? Date.now()); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
/** "YYYY-MM-DD HH-MM": the date of every output and version file name. */
export const stamp = (d) => { const x = d instanceof Date ? d : new Date(d ?? Date.now()); return `${day(x)} ${pad2(x.getHours())}-${pad2(x.getMinutes())}`; };
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export const UNTITLED = 'مستند بلا عنوان - Untitled';
/** The title as a file or folder name: Arabic and the spaces between words kept, path-hostile characters with the
 *  spaces around them → -, no trailing dot or space, at most 80 characters, never a Windows device name. */
export const titleStem = (s) => {
  const t = String(s || '').normalize('NFC').replace(/\s*[\\/:*?"<>|\u0000-\u001f]+\s*/g, '-').replace(/\s+/g, ' ').replace(/-{2,}/g, '-').replace(/^[-.\s]+|[-.\s]+$/g, '').slice(0, 80).replace(/[.\s]+$/, '').trim();
  return !t ? UNTITLED : RESERVED.test(t) ? `${t}-` : t;
};
export const LANG_WORD = { ar: 'العربية', en: 'English', both: 'both' };
/** The path below the documents folder: "<title>/Exports/<stamp> <title> - <language>.<ext>"; ext "html" → "<title>/<title>.html". */
export function outName(title, date, locale, ext) {
  const t = titleStem(title), e = String(ext).replace(/^\./, '');
  if (e === 'html') return `${t}/${t}.html`;
  return `${t}/Exports/${stamp(date)} ${t} - ${LANG_WORD[locale] || LANG_WORD.ar}.${e}`;
}

/* ── the index: document id → folder, history id → file stem (.system\history\index.json) ── */
const isDocsRoot = (dir) => path.basename(path.resolve(dir)) === DOCS_NAME;
const histOf = (docsDir) => path.join(path.dirname(path.resolve(docsDir)), SYSTEM_NAME, 'history');
const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const indexFile = (histDir) => path.join(histDir, 'index.json');
export function readIndex(histDir) {
  try { const j = JSON.parse(fs.readFileSync(indexFile(histDir), 'utf8')); if (j && j.folders && j.ids && j.history) return j; } catch { /* none yet */ }
  return { v: 1, folders: {}, ids: {}, history: {} };
}
export function writeIndex(histDir, idx) {
  fs.mkdirSync(histDir, { recursive: true });
  const f = indexFile(histDir), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 1));
  fs.renameSync(tmp, f);
}
const uniq = (a) => [...new Set(a.filter(Boolean).map(String))];
/** Pure: the folder name for a document, registered in `idx` (in memory). `ids`: the document's ids (library id, service ids);
 *  `titles`: the titles of its editions (the first names the folder: AR before EN). A document the index knows by id keeps its
 *  folder; with no id, a title the index knows names that folder (a second export of the same document). A folder that exists
 *  but belongs to no id is adopted (an export made before the first Save); one owned by another id gets " (2)". */
export function allocFolder(idx, docsDir, { ids = [], titles = [], hist = [] } = {}) {
  ids = uniq(ids); hist = uniq(hist);
  titles = uniq(titles.map((x) => (String(x || '').trim() ? titleStem(x) : '')));
  const key = (f) => Object.keys(idx.folders).find((k) => sameName(k, f));
  let folder = ids.map((i) => idx.ids[i]).find((f) => f && idx.folders[f]);
  if (!folder && !ids.length) {
    // no id (an export): the folder named like the title, else the most recently touched folder that has carried the title
    const byName = (x) => Object.keys(idx.folders).find((f) => sameName(f, x));
    const byTitle = (x) => Object.keys(idx.folders).filter((f) => idx.folders[f].titles.some((y) => sameName(y, x))).sort((a, b) => (idx.folders[b].at || 0) - (idx.folders[a].at || 0))[0];
    folder = titles.map(byName).find(Boolean) || titles.map(byTitle).find(Boolean);
  }
  if (!folder) {
    const base = titleStem(titles[0] || '');
    const taken = key(base);
    if (!taken) folder = base;
    else if (!idx.folders[taken].ids.length || !ids.length) folder = taken;
    else for (let n = 2; ; n++) { folder = `${base.slice(0, 74)} (${n})`; if (!key(folder) && !fs.existsSync(path.join(docsDir, folder))) break; }
  }
  const e = (idx.folders[folder] ||= { ids: [], titles: [], history: [] });
  const grew = ids.some((i) => !e.ids.includes(i)) || titles.some((x) => !e.titles.includes(x));
  e.ids = uniq([...e.ids, ...ids]); e.titles = uniq([...e.titles, ...titles]); e.history = uniq([...e.history, ...hist]);
  if (grew || !e.at) e.at = Date.now();
  for (const i of ids) idx.ids[i] = folder;
  return folder;
}
/** The document's folder inside the documents folder (made; registered in the index). */
export function docFolder(docsDir, info) {
  const hist = histOf(docsDir);
  const idx = readIndex(hist);
  const before = JSON.stringify(idx);
  const folder = allocFolder(idx, docsDir, info);
  if (JSON.stringify(idx) !== before) writeIndex(hist, idx);
  const dir = path.join(docsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  return { folder, dir };
}
const idPart = (id, n = 8) => String(id).replace(/^doc-/, '').replace(/[^\w]/g, '').slice(0, n) || 'unknown';
/** "<title> (<first 8 of id>)", longer when another history id already has that stem. */
export function stemFor(idx, id, title) {
  const used = new Set(Object.entries(idx.history).filter(([k]) => k !== id).map(([, h]) => h.stem.toLowerCase()));
  let stem = `${title} (${idPart(id)})`;
  for (let n = 9; used.has(stem.toLowerCase()); n++) { stem = `${title} (${idPart(id, n)})`; if (n > 60) { stem += `-${used.size}`; break; } }
  return stem;
}
/** The history files' stem for a history id (null when there is none and nothing is created). An unlinked id gets
 *  "<Untitled> (<id8>)", renamed when a Save of the document links the two; an id with a pre-0.13.3 "<id>.bwlog" keeps that file. */
export function historyStem(histDir, id, { create = false } = {}) {
  const idx = readIndex(histDir);
  if (idx.history[id]) return idx.history[id].stem;
  const legacy = String(id).replace(/:/g, '_');
  if (fs.existsSync(path.join(histDir, `${legacy}.bwlog`)) || fs.existsSync(path.join(histDir, `${legacy}.heads.json`))) return legacy;
  if (!create) return null;
  const stem = stemFor(idx, id, UNTITLED);
  idx.history[id] = { stem, folder: null };
  writeIndex(histDir, idx);
  return stem;
}
/** The path of a history id's .heads.json (null when there is none): for a reader that looked up "<id>.heads.json" before. */
export function headsFile(histDir, id) {
  const s = historyStem(histDir, id);
  return s ? path.join(histDir, `${s}.heads.json`) : null;
}
/** Link history ids to a document folder: their files are renamed "<Document title> (<id8>)", the index remembers it. */
export function linkHistory(histDir, folder, histIds = []) {
  const idx = readIndex(histDir);
  let changed = false;
  for (const id of uniq(histIds)) {
    const legacy = String(id).replace(/:/g, '_');
    const cur = idx.history[id]?.stem || (fs.existsSync(path.join(histDir, `${legacy}.bwlog`)) || fs.existsSync(path.join(histDir, `${legacy}.heads.json`)) ? legacy : null);
    const stem = stemFor(idx, id, folder);
    let now = stem;
    if (cur && cur !== stem) {
      const clash = ['.bwlog', '.heads.json'].some((e) => fs.existsSync(path.join(histDir, stem + e)));
      if (clash) now = cur;
      else for (const e of ['.bwlog', '.heads.json']) { const from = path.join(histDir, cur + e); if (fs.existsSync(from)) fs.renameSync(from, path.join(histDir, stem + e)); }
    }
    if (idx.history[id]?.stem !== now || idx.history[id]?.folder !== folder) { idx.history[id] = { stem: now, folder }; changed = true; }
    const f = idx.folders[folder];
    if (f && !f.history.includes(id)) { f.history.push(id); changed = true; }
  }
  if (changed) writeIndex(histDir, idx);
  return idx;
}

/** dir/name, or "name (2)", "name (3)" … when it exists: never an overwrite. A name made by outName() under the
 *  documents folder lands in that document's folder (found by title in the index, else made); parents are created. */
export function uniquePath(dir, name) {
  let base = path.join(dir, name);
  if (isDocsRoot(dir) && name.includes('/')) {
    const parts = name.split('/');
    const t = parts[0];
    const { folder, dir: fdir } = docFolder(dir, { titles: [t] });
    let rest = parts.slice(1).join(path.sep);
    if (folder !== t) rest = rest.replace(` ${t} - `, ` ${folder} - `).replace(`${t}.html`, `${folder}.html`);
    base = path.join(fdir, rest);
  } else if (name.includes('/')) base = path.join(dir, path.basename(name)); // a folder that is not the documents folder (a hand-made one): the file name only
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const dirName = path.dirname(base), file = path.basename(base);
  const ext = /(\.print|\.shared)?\.[^.]+$/.exec(file)?.[0] || '', stem = file.slice(0, file.length - ext.length); // "x.print.html" → "x (2).print.html"
  let f = base;
  for (let n = 2; fs.existsSync(f); n++) f = path.join(dirName, `${stem} (${n})${ext}`);
  return f;
}

/* ── titles and ids inside a Save-HTML ── */
const BWDATA = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/;
/** {titles: {ar, en}, ids, hist, locale}: what a Save-HTML says about its document (ids: service ids; hist: history doc ids). */
export function htmlInfo(html, pick) {
  const out = { titles: {}, ids: [], hist: [], locale: /<html[^>]*\blang="en"/i.test(html) ? 'en' : 'ar' };
  const trace = /<meta[^>]*name=["']bw-ledger["'][^>]*content=["'][^"']*doc=([\w.:-]+)/i.exec(String(html).split(/<\/head>/i)[0])?.[1] || /data-bw-ledger="([\w.:-]+)"/.exec(String(html).slice(0, 4000))?.[1];
  if (trace) out.hist.push(trace);
  try {
    const data = JSON.parse(BWDATA.exec(html)[1]);
    // a Save-HTML may carry several services; the document is the one asked for (`pick`, its id), else the first
    const svcs = data.services || [];
    const s0 = pick ? svcs.find((x) => x.id === pick) : svcs[0]; // asked for an id the file does not carry: nothing is taken from another service
    if (s0?.id) out.ids.push(String(s0.id));
    if (s0 && data.prov?.[s0.id]?.doc) out.hist.push(String(data.prov[s0.id].doc));
    const eds = s0?.editions || {};
    const docs = Object.fromEntries(Object.entries(eds).map(([k, x]) => [k, applyOps(JSON.parse(x.raw), x.ops || [])])); // the document as on screen: the base plus its edits
    for (const [k, d] of Object.entries(docs)) out.titles[k] = pairedTitle(d, Object.values(docs).filter((x) => x !== d), '');
  } catch { /* not a Save-HTML */ }
  out.hist = uniq(out.hist);
  return out;
}
/** The folder-naming titles of a Save-HTML: AR before EN, a still-blank placeholder never. */
export const titlesOf = (info, given) => uniq([info.titles.ar, info.titles.en, given].filter((x) => x && !PLACEHOLDER_TITLES.has(x)));

/** Save a Save-HTML as the document's file: <Document title>\<Document title>.html, overwritten on every Save; the file it
 *  replaces goes to Versions\<its date> <title>.html first (kept, never deleted). → {file, folder, dir, overwritten, version}. */
export function saveHtml(ws, { id, title, html }) {
  ensure(ws);
  const info = htmlInfo(html, id);
  const titles = titlesOf(info, title);
  const { folder, dir } = docFolder(ws.dirs.docs || ws.dirs.html, { ids: id ? [id] : info.ids, titles: titles.length ? titles : [title || ''], hist: info.hist });
  if (info.hist.length) linkHistory(ws.dirs.history, folder, info.hist);
  const file = path.join(dir, `${folder}.html`);
  let version = null;
  const exists = fs.existsSync(file);
  if (exists && fs.readFileSync(file, 'utf8') !== html) {
    const vdir = path.join(dir, 'Versions');
    fs.mkdirSync(vdir, { recursive: true });
    version = uniquePath(vdir, `${stamp(fs.statSync(file).mtime)} ${folder}.html`);
    fs.copyFileSync(file, version);
  }
  fs.writeFileSync(file, html, 'utf8');
  return { file, folder, dir, overwritten: exists, version };
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

/** The performance report's file: <Performance report>\Exports\<stamp> <title> - <language>.pdf in the documents folder. */
export const reportPath = (docsDir, lang) => uniquePath(docsDir, outName(lang === 'en' ? 'Performance report' : 'تقرير الأداء', new Date(), lang, 'pdf'));

/** A shared Save-HTML's file: its document's Exports\ "<stamp> <title> - <language>.shared.html", named by the document inside it. */
export function sharePath(docsDir, html, fallback = 'document') {
  const info = htmlInfo(html);
  const titles = titlesOf(info, String(fallback).replace(/(\.editor)?\.html?$/i, ''));
  if (!isDocsRoot(docsDir)) return uniquePath(docsDir, `${titleStem(titles[0])} - ${LANG_WORD[info.locale]}.shared.html`);
  const { folder, dir } = docFolder(docsDir, { ids: info.ids, titles, hist: info.hist });
  if (info.hist.length) linkHistory(histOf(docsDir), folder, info.hist);
  return uniquePath(path.join(dir, 'Exports'), `${stamp(new Date())} ${folder} - ${LANG_WORD[info.locale]}.shared.html`);
}

/** Documents\<title>\Sources (made) for what a harvest or an import collects. `titles`: the first names the folder (an existing
 *  document of that title is joined). → {dir: …\Sources, docDir, folder}. */
export function sourcesDir(titles, ws = workspace()) {
  ensure(ws);
  const list = [].concat(titles).filter((x) => x && !PLACEHOLDER_TITLES.has(x));
  const { folder, dir } = docFolder(ws.dirs.docs, { titles: list.length ? list : [''] });
  const s = path.join(dir, 'Sources');
  fs.mkdirSync(s, { recursive: true });
  return { dir: s, docDir: dir, folder };
}
/** Before a file the user may have worked on is written over: the old one is copied to Versions\ beside it (never lost). */
export function keepVersion(file) {
  if (!fs.existsSync(file)) return null;
  const vdir = path.join(path.dirname(file), 'Versions');
  fs.mkdirSync(vdir, { recursive: true });
  const to = uniquePath(vdir, `${stamp(fs.statSync(file).mtime)} ${path.basename(file)}`);
  fs.copyFileSync(file, to);
  return to;
}
