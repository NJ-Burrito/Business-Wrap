// What the Business-Wrap launcher runs (0.17.0, owner note N15): open the editor in the browser, Chrome first, WITHOUT starting the host.
// The editor is a plain HTML file (file://). 0.18.2: with no file named it is the TOOL editor, so the start page is the landing (never the newest saved document:
// owner bug 2026-11-10); a file argument opens exactly that file. The host starts from the editor's top-bar toggle (business-wrap://start). Nothing here starts a server, a host or a profile.
//   node launcher/open-editor.mjs [editor.html]      BW_BROWSER_STUB=<file>: write the browser command as one JSON line instead of starting one (tests)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALL = path.resolve(HERE, '..');

/** 0.18.2: the documents of the save folder, newest first, at most `limit`: what the start page lists as Recents when it is opened from the shortcut (a file:// page cannot read the folder
 *  and has no library of the host's documents). {name, file, url, savedAt, type}; the type is read from the document's own bw-data block (empty when it cannot be read). */
export async function recentDocs(limit = 20) {
  const { workspace } = await import('../engine/workspace.mjs');
  const dir = workspace().dirs.docs;
  if (!fs.existsSync(dir)) return [];
  const rows = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const file = path.join(dir, e.name, `${e.name}.html`);
    try { rows.push({ name: e.name, file, mtime: fs.statSync(file).mtimeMs }); } catch { /* no editor file in this folder */ }
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows.slice(0, limit).map((r) => {
    let type = '';
    try { const h = fs.readFileSync(r.file, 'utf8'); const at = h.indexOf('id="bw-data">'); type = at < 0 ? '' : (/"docType":"([a-z0-9-]+)"/.exec(h.slice(at, at + 400000))?.[1] || ''); } catch { /* unreadable */ }
    return { name: r.name, file: r.file, url: pathToFileURL(r.file).href, savedAt: new Date(r.mtime).toISOString(), type };
  });
}

/** 0.18.2: the TOOL editor, the start page's file:// page. Opening Business-Wrap itself (the shortcut, no file named) lands on the start page; it never opens the newest saved document
 *  (a saved document is a `doc-` service, so the start page's "untouched template" guard could never pass, and it carries no document-type payload either: owner bug 2026-11-10).
 *  Built once per version into the state folder WITH the document-type payload (the start page's gallery), then written as `start.editor.html` with the save folder's recent documents
 *  embedded (#bw-recents) on every launch. */
export async function toolEditor() {
  const { STATE_DIR } = await import('../engine/heal/index.mjs');
  const { buildEditor } = await import('../engine/build-editor.mjs');
  const version = JSON.parse(fs.readFileSync(path.join(INSTALL, 'package.json'), 'utf8')).version;
  const dir = path.join(STATE_DIR(), 'launcher');
  const base = path.join(dir, `start-${version}.base.html`);
  if (!fs.existsSync(base)) {
    const blank = path.join(INSTALL, 'samples', 'blank');
    const inputs = fs.readdirSync(blank).filter((f) => /\.json$/i.test(f)).map((f) => path.join(blank, f)).filter((f) => { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return !!(d.control && d.chapters); } catch { return false; } });
    if (!inputs.length) throw new Error('no blank document in samples/blank');
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${base}.${process.pid}.tmp`;
    buildEditor({ inputs, out: tmp, set: JSON.parse(fs.readFileSync(inputs[0], 'utf8')).service, docTypes: true });
    fs.renameSync(tmp, base);
  }
  let html = fs.readFileSync(base, 'utf8');
  let rows = [];
  try { rows = await recentDocs(); } catch { /* a folder that cannot be read: the start page lists none */ }
  if (rows.length) {
    const block = `<script type="application/json" id="bw-recents">${JSON.stringify({ v: 1, rows }).replace(/</g, '\\u003c')}</script>\n`;
    const at = html.indexOf('<script id="bw-app">');
    if (at > 0) html = html.slice(0, at) + block + html.slice(at);
  }
  const out = path.join(dir, 'start.editor.html');
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, html);
  try { fs.renameSync(tmp, out); return out; } catch { return tmp; } // a copy another window still holds: this launch gets its own file
}

/** The editor file to open: `file` if given (a specific document: double-click on a saved one, a way back from a host switch), else the tool editor (the start page). */
export async function editorFile(file) {
  if (file) return path.resolve(file);
  return toolEditor();
}

/** Open `url` in the browser the editor uses (Google Chrome first, then the default Chromium, Edge, any): the person's own profile, a new tab, no host. */
/** 0.17.8 (window switch): geometry = {x, y, w, h} (a window's screenX, screenY, outerWidth, outerHeight): the editor opens as a NEW window there (the host switch's way back from the served tab). */
export const geometryArgs = (g) => {
  const n = (v) => v !== null && v !== '' && Number.isFinite(Number(v));
  if (!g || !n(g.x) || !n(g.y) || !n(g.w) || !n(g.h)) return [];
  const [x, y, w, h] = [g.x, g.y, g.w, g.h].map((v) => Math.round(Number(v)));
  if (Math.abs(x) > 30000 || Math.abs(y) > 30000 || w < 200 || h < 150 || w > 30000 || h > 30000) return [];
  return ['--new-window', `--window-position=${x},${y}`, `--window-size=${w},${h}`];
};
export async function openInBrowser(url, { geometry } = {}) {
  const geo = geometryArgs(geometry);
  if (process.env.BW_BROWSER_STUB) { fs.appendFileSync(process.env.BW_BROWSER_STUB, `${JSON.stringify({ exe: 'stub', args: [...geo, url], launcher: true })}\n`); return { exe: 'stub', via: 'stub' }; }
  const { chooseBrowser } = await import('../engine/export.mjs');
  const b = chooseBrowser();
  const run = (exe, args) => { const c = spawn(exe, args, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); };
  if (b?.exe) { run(b.exe, [...geo, url]); return { exe: b.exe, via: b.via }; }
  if (process.platform === 'win32') { run('explorer.exe', [url]); return { exe: 'explorer.exe', via: 'shell' }; }
  throw new Error('no browser found: install Google Chrome');
}

export async function openEditor({ file, geometry } = {}) {
  const f = await editorFile(file);
  const url = pathToFileURL(f).href;
  const b = await openInBrowser(url, { geometry });
  return { file: f, url, browser: b.exe, via: b.via, host: false };
}

const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  // 0.17.8: the Desktop launcher makes sure business-wrap: is registered (or repaired, e.g. node moved) before the editor's host switch needs it
  import('./launcher.mjs').then((m) => m.autorun(), () => {});
  openEditor({ file: process.argv[2] }).catch(async (e) => {
    // windowless: this file is the only place a failure can be read
    try { const { STATE_DIR } = await import('../engine/heal/index.mjs'); const d = path.join(STATE_DIR(), 'launcher'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'last-error.txt'), `${new Date().toISOString()} ${e?.stack || e}\n`); } catch { /* none */ }
    process.exitCode = 1;
  });
}
