// What the Business-Wrap launcher runs (0.17.0, owner note N15): open the editor in the browser, Chrome first, WITHOUT starting the host.
// The editor is a plain HTML file (file://): the newest document of the save folder, else a blank editor built once per version into the state
// folder. The host starts from the editor's top-bar toggle (business-wrap://start). Nothing here starts a server, a host or a profile.
//   node launcher/open-editor.mjs [editor.html]      BW_BROWSER_STUB=<file>: write the browser command as one JSON line instead of starting one (tests)
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALL = path.resolve(HERE, '..');

/** The editor file to open: `file` if given, else the newest document of the save folder, else a blank editor (built once per version). */
export async function editorFile(file) {
  if (file) return path.resolve(file);
  const { workspace } = await import('../engine/workspace.mjs');
  const dir = workspace().dirs.docs;
  const docs = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name, `${e.name}.html`)).filter((f) => fs.existsSync(f)) : [];
  docs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (docs[0]) return docs[0];
  const { STATE_DIR } = await import('../engine/heal/index.mjs');
  const { buildEditor } = await import('../engine/build-editor.mjs');
  const version = JSON.parse(fs.readFileSync(path.join(INSTALL, 'package.json'), 'utf8')).version;
  const out = path.join(STATE_DIR(), 'launcher', `blank-${version}.editor.html`);
  if (!fs.existsSync(out)) {
    const blank = path.join(INSTALL, 'samples', 'blank');
    const inputs = fs.readdirSync(blank).filter((f) => /\.json$/i.test(f)).map((f) => path.join(blank, f)).filter((f) => { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return !!(d.control && d.chapters); } catch { return false; } });
    if (!inputs.length) throw new Error('no blank document in samples/blank');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmp = `${out}.${process.pid}.tmp`;
    buildEditor({ inputs, out: tmp, set: JSON.parse(fs.readFileSync(inputs[0], 'utf8')).service });
    fs.renameSync(tmp, out);
  }
  return out;
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
