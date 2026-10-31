#!/usr/bin/env node
// Business-Wrap, script-first (0.13.0 B1): every capability is a command that runs with no AI and no network.
// The editor, the MCP tools and the Claude Code /business-wrap:* commands are thin layers over these functions.
//
//   business-wrap open [doc.json|folder|editor.html ...] [--port 4317] [--no-browser]   start the host + the editor
//   business-wrap stop --all                               stop every host, server and Edge window this install started (tabs saved first)
//   business-wrap close                                    the same as stop --all
//   business-wrap status                                   version, running hosts, heal count
//   business-wrap new [--title "…"] [--out dir] [--no-open]  a blank document pair + its editor (default: Documents\<title>\ in the save folder)
//   business-wrap build <doc.json|folder ...> --out <editor.html> [--ui ar|en]
//   business-wrap harvest <url|crawl.json|model|PDF/DOCX/HTML|folder> [--out dir] [--name n] [--roles f] [--no-open]
//   business-wrap import <file|folder ...> [--out dir] [--no-open]   user sources (BPMN, draw.io, YAML, PDF, DOCX, HTML)
//   business-wrap export <doc.json> [ar|en] [--out dir] [--edits f] [--no-docx]
//   business-wrap gate <harvest|evidence|document|render|export|ledger> <file ...>
//   business-wrap heal-log                                 the HEALED lines
//   business-wrap verify-history <file> [--history dir]    the trust ledger check, as strict as the editor's
//   business-wrap library [list]                           documents in the save folder
//   business-wrap tidy [--dry-run]                          moves an old save folder (PDF, DOCX, HTML, HISTORY) into the document tree
//   business-wrap report <from> <to>                       the work report (WP4)
//   business-wrap update [--check|--apply --yes|--notes]   the updater (update/cli.mjs; a Claude Code plugin is updated by the client, never in place)
//   business-wrap doctor                                   what is installed, where state lives, the last MCP server starts, version drift, EVERY known workspace / Edge profile / plugin-data path
//   business-wrap reset [--all] [--dry-run] [--yes]        send the machine state (Edge profile, .system, local state; --all: whole workspaces + plugin data) to the Recycle Bin; --dry-run lists only
//   business-wrap editor <list|get|outline|ops|action|new|import|health|render> [--doc id] [--pointer p] [--locale ar|en] [--ops-file f.json|-] [--mirror] [--agent name] [--id action] [--args-file f.json|-] [--project p] [--title t] [--file f] [--tab id] [--pointer-file f|-] [--out x.png]   drive the document OPEN in the editor, through the host (always JSON)
// Add --json for machine output. Exit 0 done · 1 failed · 2 usage · 3 needs a module that is not in this build yet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEditor } from './build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, loadEdited, fontsFor, REPO, userCwd, fileStem, renderDiagramPng } from './export.mjs';
import { modelIn } from './diagram-cli.mjs';
import { systemFonts } from './fonts.mjs';
import { registeredServers } from './server-registry.mjs';
import { harvestModel, harvestCrawl } from './harvest/cli.mjs';
import { harvestSources, MODEL_EXT, TEXT_EXT } from './harvest/sources.mjs';
import { STATE_DIR, healPort, healStaleHosts, healWorkspace, healFont, readHealLog, alive } from './heal/index.mjs';
import { GATES } from './heal/gates.mjs';
import { workspace, localDir, ensure, reportPath, sourcesDir, keepVersion, docTitle, outName, uniquePath, noteOutput, DOCS_NAME } from './workspace.mjs';
import { tidy } from './tidy.mjs';
import { migrateLocal, pluginData, realParent, isTestMode } from './testguard.mjs';
import { doctor as doctorInfo } from '../mcp/startup.mjs';

const pkg = () => JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const HOSTS = () => path.join(STATE_DIR(), 'cli-hosts.json');
const EDITORS = () => path.join(STATE_DIR(), 'editors');
class Pending extends Error { constructor(m) { super(m); this.code = 3; } }
const isDoc = (f) => { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return !!(d.control && d.chapters); } catch { return false; } };
const docsIn = (p) => (fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => /\.json$/i.test(f)).map((f) => path.join(p, f)).filter(isDoc) : [p]);

/* ── host: WP3's engine/host.mjs when it is built, else a local serve.mjs child this CLI records ── */
async function hostModule() {
  try { const m = await import('./host.mjs'); return m; } catch { return null; }
}
const record = (fn) => { const f = HOSTS(); const { hosts } = healStaleHosts(f); const next = fn(hosts); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ hosts: next }, null, 1)); return next; };
const answers = (url) => new Promise((ok) => { const r = http.get(url, (res) => { res.resume(); ok(res.statusCode === 200); }); r.on('error', () => ok(false)); r.setTimeout(1500, () => { r.destroy(); ok(false); }); });
async function waitUp(url, ms = 15000) { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (await answers(url)) return true; await new Promise((r) => setTimeout(r, 200)); } return false; }
const killTree = (pid) => { if (!alive(pid)) return false; if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else { try { process.kill(-pid); } catch { try { process.kill(pid); } catch { /* gone */ } } } return true; };
export function edgePath() {
  return [process.env.BW_EDGE, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/usr/bin/microsoft-edge'].find((p) => p && fs.existsSync(p));
}
/** Edge in its own profile (so its pid is this window's and close can end it). */
function openEdge(url) {
  const exe = edgePath();
  if (!exe) return null;
  const c = spawn(exe, [`--user-data-dir=${path.join(STATE_DIR(), 'edge-profile')}`, '--no-first-run', '--new-window', url], { detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  return c.pid;
}

export async function startHost({ editor, port = 4317, browser = true } = {}) {
  const real = await hostModule();
  if (real) {
    try { const r = await real.start({ editor, port, open: browser }); record((h) => [...h, { ...r, editor, by: 'host.mjs' }]); return { ...r, editor }; } catch (e) { if (!/not built yet/.test(e.message)) throw e; }
  }
  const same = record((h) => h).find((h) => h.editor === editor);
  if (same && (await answers(same.url))) return { ...same, reused: true };
  const { port: p } = await healPort(port);
  const child = spawn(process.execPath, [path.join(REPO, 'engine', 'serve.mjs'), editor, '--port', String(p)], { detached: true, stdio: 'ignore', env: { ...process.env, BW_SERVE_CHILD: '1' }, windowsHide: true });
  child.unref();
  const url = `http://127.0.0.1:${p}/`;
  if (!(await waitUp(url))) { killTree(child.pid); throw new Error(`the host did not answer on ${url}`); }
  const browserPid = browser ? openEdge(url) : null;
  const h = { pid: child.pid, port: p, url, editor, browserPid, by: 'cli', at: new Date().toISOString() };
  record((hs) => [...hs, h]);
  return h;
}

/** The library import of the host (WP3 POST /api/library/import); a host without it already serves the built editor. */
async function libraryImport(url, documents) {
  const body = JSON.stringify({ documents });
  return new Promise((ok) => {
    const r = http.request(new URL('/api/library/import', url), { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => ok(res.statusCode === 200 ? JSON.parse(s || '{}') : null)); });
    r.on('error', () => ok(null));
    r.end(body);
  });
}

/* ── the verbs (each returns a plain object; main() prints it) ── */
/** The documents of the save folder, newest first (Documents<title><title>.html). */
export function libraryDocs() {
  const dir = workspace().dirs.docs;
  const folders = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name) : [];
  return folders.map((f) => path.join(dir, f, `${f}.html`)).filter((f) => fs.existsSync(f)).map((file) => ({ name: path.basename(path.dirname(file)), file, modified: fs.statSync(file).mtime.toISOString() })).sort((a, b) => b.modified.localeCompare(a.modified));
}
/** T13: `open` with no file opens the last document of the library; a blank one is made only when the library is empty. */
export const lastDocument = () => libraryDocs()[0] || null;

export async function open({ inputs = [], port = 4317, browser = true, ui } = {}) {
  if (!inputs.length) { const last = lastDocument(); if (last) inputs = [last.file]; }
  let editor;
  let documents = [];
  if (inputs.length === 1 && /\.html?$/i.test(inputs[0])) editor = path.resolve(inputs[0]);
  else {
    documents = (inputs.length ? inputs : [path.join(REPO, 'samples', 'blank')]).flatMap((i) => docsIn(path.resolve(i)));
    if (!documents.length) throw new Error(`no document JSON in ${inputs.join(', ')}`);
    const first = JSON.parse(fs.readFileSync(documents[0], 'utf8'));
    healWorkspace(EDITORS());
    editor = path.join(EDITORS(), `${fileStem(first.service || first.control.documentId)}.editor.html`);
    buildEditor({ inputs: documents, out: editor, set: first.service, watermarkDir: null, ui });
  }
  const h = await startHost({ editor, port, browser: browser && !process.env.BW_NO_BROWSER });
  const lib = documents.length ? await libraryImport(h.url, documents) : null;
  const docId = documents.length ? JSON.parse(fs.readFileSync(documents[0], 'utf8')).control.documentId : null;
  // 0.15.0: the host answers {library, queued, doc_id[], url:'/#doc=<id>', project}: the url is host-relative (made absolute here); doc_id stays the document's own id (what the editor_* tools take), library_id is the library's
  const libUrl = lib?.url ? new URL(lib.url, h.url).href : null;
  const libId = Array.isArray(lib?.doc_id) ? lib.doc_id[0] : lib?.doc_id;
  return { url: libUrl || h.url, doc_id: docId || libId, ...(libId ? { library_id: libId } : {}), editor, pid: h.pid, port: h.port, browser: !!h.browserPid, library: !!lib && lib.library !== false };
}

/** A serve.mjs of THIS install (its path on the command line): another install's host never matches (other folder). */
const norm = (x) => String(x || '').toLowerCase().replace(/\//g, '\\');
export const ownsServe = (cmd, repo = REPO) => norm(cmd).includes(norm(path.join(repo, 'engine', 'serve.mjs')));
function ownServers() {
  const ps = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"], { encoding: 'utf8', windowsHide: true })
    : spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  const mine = new Set(registeredServers()); // only servers registered in THIS state folder (engine/server-registry.mjs)
  return String(ps.stdout || '').split(/\r?\n/).map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter((m) => m && ownsServe(m[2]) && mine.has(Number(m[1]))).map((m) => Number(m[1]));
}

/** close = stop --all (owner request 2026-10-29): the background host (every tab flushed first), the hosts this CLI
 *  started, any other serve.mjs of this install still running, and Edge on this install's profile. `keep`: pids left
 *  alone (the power route keeps its own server and supervisor, then exits by itself). */
export async function close({ keep = [] } = {}) {
  const real = await hostModule();
  const pids = [];
  let stopped = 0; // hosts and servers: the background host, each record this CLI kept, each stray server
  const h = real?.hostState?.();
  if (real && !(h && keep.includes(h.pid))) { try { const r = await real.stop(); if (r.pids?.length) stopped++; pids.push(...(r.pids || [])); } catch { /* none */ } }
  const f = HOSTS();
  const hosts = (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')).hosts || [] : []).filter((x) => !keep.includes(x.pid));
  for (const x of hosts) for (const pid of [x.browserPid, x.pid]) if (pid && killTree(pid)) pids.push(pid);
  stopped += hosts.length;
  if (fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify({ hosts: [] }, null, 1));
  for (const pid of ownServers()) if (!keep.includes(pid) && killTree(pid)) { pids.push(pid); stopped++; }
  try { pids.push(...(real?.closeBrowsers?.([]) || [])); } catch { /* none */ }
  return { stopped, pids: [...new Set(pids)] };
}

export async function status() {
  const { hosts } = healStaleHosts(HOSTS());
  const real = await hostModule();
  let host = null;
  try { host = real?.status?.() ?? null; } catch { host = null; }
  const d = await doctorInfo().catch(() => null); // the MCP side in one line: plugin or clone, where state lives, drift, last start
  return { version: pkg().version, hosts: hosts.map(({ pid, port, url, editor }) => ({ pid, port, url, editor })), host, healed: readHealLog().length, ai: false, mcp: d && { plugin: d.plugin, state: d.local, last_initialize_ms: d.last_initialize_ms, problems: d.problems } };
}

export async function newDoc({ title, out, browser = true, openIt = true } = {}) {
  const slug = fileStem(title || 'new-document').toLowerCase();
  // no --out: the save folder, Documents\<title>\ (the pair of JSON files in Sources\, the editor as <title>.html)
  const tree = out ? null : sourcesDir([title || 'مستند جديد - New document']);
  const dir = tree ? tree.dir : path.resolve(out);
  fs.mkdirSync(dir, { recursive: true });
  const documents = [];
  for (const ed of ['ar', 'en']) {
    const d = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${ed}.json`), 'utf8'));
    if (title) { d.control.title = title; d.service = slug; }
    d.control.issuedOn ||= new Date().toISOString().slice(0, 10);
    const f = path.join(dir, `document.${ed}.json`);
    fs.writeFileSync(f, JSON.stringify(d, null, 1) + '\n');
    documents.push(f);
  }
  const editorFile = tree ? path.join(tree.docDir, `${tree.folder}.html`) : path.join(dir, `${slug}.editor.html`);
  if (tree) keepVersion(editorFile);
  const editor = buildEditor({ inputs: documents, out: editorFile, set: slug, watermarkDir: null }).out;
  return { documents, editor, ...(openIt ? { opened: await open({ inputs: [editor], browser }) } : {}) };
}

export function build({ inputs, out, ui }) {
  if (!inputs?.length || !out) throw Object.assign(new Error('build <doc.json|folder ...> --out <editor.html>'), { code: 2 });
  const r = buildEditor({ inputs: inputs.map((i) => path.resolve(i)), out: path.resolve(out), watermarkDir: null, ui });
  return { editor: r.out, services: r.services, kb: Math.round(r.bytes / 1024) };
}

/** The per-stage gates after a harvest: harvest input + every document. */
function harvestGates(r, ir) {
  const g = [];
  if (ir) g.push(GATES.harvest(ir));
  for (const d of r.documents || []) g.push({ ...GATES.document(d), file: d });
  return g;
}

export async function harvest({ input, out, name, roles, openIt = false, browser = true }) {
  if (!input) throw Object.assign(new Error('harvest <url|crawl.json|model|file|folder>'), { code: 2 });
  const o = out ? path.resolve(out) : undefined; // no --out: Documents\<name>\Sources in the save folder
  let r;
  let gates;
  if (/^https?:\/\//i.test(input)) {
    // a live crawl from a start URL: a dry run, it never files a request (stops before Send / Submit / Pay)
    const cfg = { name: name || new URL(input).hostname, languages: [{ code: /[?&](lang|locale)=ar(&|$)|\/ar(\/|$)/i.test(input) ? 'ar' : 'en', startUrl: input }], headed: true };
    r = await harvestCrawl(cfg, { out: o, log: () => {}, ask: async () => false });
    gates = [GATES.harvest(r.raw), ...harvestGates(r)];
  } else {
    const f = path.resolve(input);
    const st = fs.statSync(f);
    const cfg = !st.isDirectory() && /\.json$/i.test(f) && (() => { try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); return Array.isArray(j.languages) && !j.kind && !j.graph ? j : null; } catch { return null; } })();
    if (cfg) { r = await harvestCrawl(f, { out: o, log: () => {}, ask: async () => false }); gates = [GATES.harvest(r.raw), ...harvestGates(r)]; }
    else if (!st.isDirectory() && MODEL_EXT.test(f) && !TEXT_EXT.test(f)) { r = await harvestModel(f, { out: o, name, roles: roles && path.resolve(roles) }); gates = harvestGates(r, r.ir); }
    else return importSources({ inputs: [f], out: o, name, roles, openIt, browser });
  }
  const res = { documents: r.documents, editor: r.editor, service: r.service, gates };
  if (openIt) res.opened = await open({ inputs: r.documents, browser });
  return res;
}

export async function importSources({ inputs, out, name, roles, openIt = false, browser = true }) {
  if (!inputs?.length) throw Object.assign(new Error('import <file|folder ...>'), { code: 2 });
  const { results, skipped } = await harvestSources(inputs, { out: out ? path.resolve(out) : undefined, name, roles: roles && path.resolve(roles) });
  const documents = results.flatMap((x) => x.documents);
  const res = { results, skipped, documents, gates: documents.map((d) => ({ ...GATES.document(d), file: d })) };
  if (openIt && documents.length) res.opened = await open({ inputs: results[0].documents, browser });
  return res;
}

export async function exportDoc({ document, locale, out, edits, docx = true }) {
  if (!document) throw Object.assign(new Error('export <doc.json> [ar|en]'), { code: 2 });
  const file = path.resolve(document);
  const doc = loadEdited(file, edits && path.resolve(edits));
  const ed = locale || (/\.en\.json$/i.test(file) ? 'en' : /\.ar\.json$/i.test(file) ? 'ar' : /[؀-ۿ]/.test(doc.control?.title || '') ? 'ar' : 'en');
  const pre = GATES.document(doc);
  if (pre.verdict === 'FAIL') return { locale: ed, gates: [pre] };
  const th = loadTheme();
  // a chosen face that is not on this machine (and not uploaded into the document) falls back to Thmanyah: HEALED
  const steps = [pre];
  const chosen = Object.entries(doc.design?.fonts || {}).filter(([r, f]) => ['text', 'display'].includes(r) && f && !(doc.design.fontFaces || []).some((x) => x.family === f));
  if (chosen.length) {
    const have = new Set([...fontsFor(th).used.map((c) => c.family), ...systemFonts().map((f) => f.family)]);
    for (const [role, fam] of chosen) { const h = healFont(fam, (x) => have.has(x)); if (h.healed) { doc.design.fonts[role] = h.family; steps.push({ stage: 'fonts', verdict: 'HEALED', problems: [], from: fam, to: h.family }); } }
  }
  // no --out: the save folder, Documents\<title>\Exports\<date> <title> - <language>.pdf|docx
  const dir = out ? path.resolve(out) : null;
  const stem = `${fileStem(doc.service || doc.control.documentId)}.${ed}`;
  const target = (ext) => (dir ? path.join(dir, `${stem}.${ext}`) : uniquePath(ensure(workspace()).dirs.docs, outName(docTitle(doc, doc.service), new Date(), ed, ext)));
  const pdf = (await exportPdf(doc, { locale: ed, theme: th, pdfPath: target('pdf') })).pdf;
  const files = [pdf];
  if (docx) files.push(exportDocx(doc, { locale: ed, theme: th, docxPath: target('docx') }).docx);
  if (!dir) for (const f of files) noteOutput(f); // the folder icon of the document's Exports\ (Windows only)
  return { locale: ed, pdf, docx: docx ? files[1] : undefined, gates: [...steps, GATES.render(pdf, { allow: Object.values(doc.design?.fonts || {}) }), GATES.export(files, { editions: [ed] })] };
}

export async function gate({ stage, files }) {
  const g = GATES[stage];
  if (!g || !files?.length) throw Object.assign(new Error(`gate <${Object.keys(GATES).join('|')}> <file ...>`), { code: 2 });
  return { gates: stage === 'export' ? [g(files.map((f) => path.resolve(f)))] : await Promise.all(files.map(async (f) => ({ ...(await g(path.resolve(f))), file: f }))) };
}

/** verify-history: the ledger gate (engine/heal/gates.mjs gateLedger), the same full check the editor runs on open. */
export async function verifyHistory({ file, history }) {
  if (!file) throw Object.assign(new Error('verify-history <file>'), { code: 2 });
  return { gates: [{ ...(await GATES.ledger(path.resolve(file), { history })), file }] };
}

export async function library() {
  const dir = workspace().dirs.docs; // one folder per document: Documents\<title>\<title>.html
  const folders = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  const documents = folders.map((f) => path.join(dir, f, `${f}.html`)).filter((f) => fs.existsSync(f))
    .map((file) => ({ name: path.basename(path.dirname(file)), file, modified: fs.statSync(file).mtime.toISOString() }));
  return { dir, documents };
}

export async function report({ from, to }) {
  if (!from || !to) throw Object.assign(new Error('report <from YYYY-MM-DD> <to YYYY-MM-DD>'), { code: 2 });
  let m;
  try { m = await import('./report.mjs'); } catch { throw new Pending('engine/report.mjs is not in this build yet (WP4)'); }
  const d = (x) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(x)) throw Object.assign(new Error(`report: dates as YYYY-MM-DD, got "${x}"`), { code: 2 }); return x; };
  const ws = ensure(workspace());
  const logs = await m.readHistory(ws.dirs.history);
  const r = await m.exportReport(logs, { from: d(from), to: d(to), pdfPath: reportPath(ws.dirs.docs, 'ar') });
  return { pdf: r.pdf, people: r.data.people.length, docs: r.data.docs.length };
}

/** tidy [--dry-run]: the old PDF\, DOCX\, HTML\, HISTORY\ folders into the document tree (engine/tidy.mjs); --dry-run only prints the plan. */
export function tidyCmd({ dryRun = false } = {}) {
  const ws = workspace();
  if (!dryRun) ensure(ws); // the first start of 0.13.3 does this on its own; here it is on request
  const r = tidy(ws, { dryRun });
  return { root: ws.root, dryRun, files_before: r.before, moved: r.moved, unmatched: r.unmatched, failed: r.failed, lines: r.lines };
}

/* ── T3 (0.15.3): every place this program keeps a library or its state, and a reset that sends them to the Recycle Bin ── */
const homeDir = () => (process.env.BW_HOME_DIR ? path.resolve(process.env.BW_HOME_DIR) : os.homedir());
const sameP = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const within = (p, dir) => { const r = path.relative(path.resolve(dir), path.resolve(p)); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const entriesOf = (p) => { try { return fs.statSync(p).isDirectory() ? fs.readdirSync(p).length : 1; } catch { return 0; } };
/** Every known workspace root (a library the editor syncs back in), workspace state, Edge profile, local state and plugin-data path.
 *  kind: workspace | workspace-state | edge-profile | state | plugin-data. Only the paths that exist carry exists:true. */
export function knownRoots() {
  const items = [];
  const add = (kind, p, note = '') => {
    if (!p || items.some((i) => i.kind === kind && sameP(i.path, p))) return;
    const exists = fs.existsSync(p);
    items.push({ kind, path: path.resolve(p), exists, ...(exists ? { entries: entriesOf(p) } : {}), ...(note ? { note } : {}) });
  };
  const home = homeDir();
  const docs = process.env.BW_HOME_DIR ? path.join(home, 'Documents') : realParent();
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(path.join(localDir(), 'workspace.json'), 'utf8')).parent; } catch { /* none */ }
  const roots = [[workspace().root, 'the folder in use now'], [path.join(docs, 'Business-Wrap'), 'default (0.13.3 and later)'], [path.join(home, 'Downloads', 'Business-Wrap'), 'older 0.13.x save folder'], [path.join(home, 'OneDrive', 'Documents', 'Business-Wrap'), 'Documents redirected to OneDrive'], [path.join(home, 'Desktop', 'Business-Wrap'), ''], [path.join(home, 'Business-Wrap'), ''], [saved && path.join(saved, 'Business-Wrap'), 'the folder chosen in Settings']];
  for (const [r, note] of roots) { add('workspace', r, note); if (r) add('workspace-state', path.join(r, '.system'), 'history, library sync, sessions'); }
  add('edge-profile', path.join(STATE_DIR(), 'edge-profile'), 'the editor\'s Edge profile (its IndexedDB library)');
  add('edge-profile', path.join(localDir(), 'edge-profile'));
  add('state', STATE_DIR(), 'local state: host.json, workspace.json, update cache');
  if (!isTestMode()) add('state', path.join(REPO, '.local'), 'state of a clone or an older plugin folder');
  const pd = pluginData(REPO);
  if (pd && !isTestMode()) add('plugin-data', pd, 'Claude Code plugin data (kept across updates)');
  return items;
}
/** What a reset sends away: the machine state by default (the Edge profile, every .system, the local state: nothing a user wrote);
 *  with all, also every whole workspace (documents and exports) and the plugin data. Nested paths are folded into their parent. */
export function resetPlan({ all = false } = {}) {
  const kinds = new Set(['edge-profile', 'workspace-state', 'state', ...(all ? ['workspace', 'plugin-data'] : [])]);
  const picked = knownRoots().filter((i) => i.exists && kinds.has(i.kind));
  return picked.filter((i) => !picked.some((o) => o !== i && within(i.path, o.path)));
}
/** One path to the Recycle Bin, never a hard delete. Windows: Microsoft.VisualBasic FileSystem SendToRecycleBin (no dialog);
 *  Linux: gio trash; macOS: Finder. True only when the path is gone afterwards. */
export function recycle(p) {
  if (process.platform === 'win32') {
    const ps = "Add-Type -AssemblyName Microsoft.VisualBasic; $p = $env:BW_RECYCLE_PATH; if (Test-Path -LiteralPath $p -PathType Container) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin') } else { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin') }";
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { env: { ...process.env, BW_RECYCLE_PATH: p }, windowsHide: true, stdio: 'ignore' });
  } else if (process.platform === 'darwin') spawnSync('osascript', ['-e', 'on run argv\ntell application "Finder" to delete POSIX file (item 1 of argv)\nend run', p], { stdio: 'ignore' });
  else spawnSync('gio', ['trash', p], { stdio: 'ignore' });
  return !fs.existsSync(p);
}
const ask = (q) => new Promise((ok) => { import('node:readline').then(({ createInterface }) => { const rl = createInterface({ input: process.stdin, output: process.stderr }); rl.question(q, (a) => { rl.close(); ok(/^y(es)?$/i.test(a.trim())); }); }); });
export async function reset({ all = false, dryRun = false, yes = false } = {}) {
  const plan = resetPlan({ all });
  const base = { scope: all ? 'all' : 'state', dryRun, items: plan.map((i) => ({ kind: i.kind, path: i.path, entries: i.entries })) };
  if (dryRun || !plan.length) return { ...base, recycled: 0, failed: 0 };
  if (!yes) {
    if (!process.stdin.isTTY) throw Object.assign(new Error(`reset: ${plan.length} item(s) would go to the Recycle Bin and no --yes was given (not interactive): nothing was changed. List: ${plan.map((i) => i.path).join(' | ')}`), { code: 2 });
    process.stderr.write(`${plan.map((i) => `  ${i.kind.padEnd(16)} ${i.path}`).join('\n')}\n`);
    if (!(await ask(`Send these ${plan.length} item(s) to the Recycle Bin? [y/N] `))) return { ...base, recycled: 0, failed: 0, cancelled: true };
  }
  if (!process.env.BW_RESET_KEEP_HOSTS) await close().catch(() => {}); // a running host or Edge window holds the profile open
  const done = plan.map((i) => ({ kind: i.kind, path: i.path, recycled: recycle(i.path) }));
  return { ...base, items: done, recycled: done.filter((d) => d.recycled).length, failed: done.filter((d) => !d.recycled).length };
}

export function update(args) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'update', ...args], { encoding: 'utf8' });
  return { code: r.status ?? 1, output: (r.stdout || '') + (r.stderr || '') };
}

/** Read a JSON file, or stdin when the path is "-" (a pointer or an op list is never an argv: quoting breaks it on every shell). */
const readJsonArg = (f) => JSON.parse(f === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(f), 'utf8'));
/** business-wrap editor <verb>: the same verbs as the MCP editor_* tools, against the document OPEN in the editor (mcp/editor-tools.mjs). */
async function editorCmd(pos, val, flags) {
  const { callEditor: callAny, checkOps, hostTarget, BwError, EDITOR_ACTIONS } = await import('../mcp/editor-tools.mjs');
  const [verb] = pos;
  const doc = val('doc');
  const tab = val('tab');
  // T11: --tab is honoured (the host routes the call to that tab; an unknown tab answers NO_TAB), never silently dropped
  const callEditor = async (tool, { doc: d, args = {} } = {}) => {
    if (!tab) return callAny(tool, { doc: d, args });
    const t = await hostTarget();
    const res = await fetch(new URL('/api/editor/call', t.url), { method: 'POST', headers: { 'x-bw-token': t.token, 'content-type': 'application/json' }, body: JSON.stringify({ tool, ...(d ? { doc: d } : {}), tab, args }) });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.ok !== false) { const r = 'result' in body ? body.result : body; return { ok: true, ...(r && typeof r === 'object' && !Array.isArray(r) ? r : { result: r }) }; }
    const { code, message, error, ok: _o, ...rest } = body || {};
    throw new BwError(code || (res.status === 404 ? 'NO_TAB' : 'HOST_ERROR'), String(message || error || `host answered ${res.status}`), rest);
  };
  const need = (v, what) => { if (!v) throw new BwError('BAD_ARGS', `editor ${verb}: ${what} is required`); return v; };
  /** T11: a read without --doc works only when exactly one document is open; with several it lists them and refuses (never "another doc"). */
  const docOrSole = async () => {
    if (doc) return doc;
    const docs = (await callEditor('list', {})).documents || [];
    if (docs.length === 1) return docs[0].id;
    throw new BwError(docs.length ? 'BAD_ARGS' : 'NO_DOC', docs.length ? `editor ${verb}: --doc is required, ${docs.length} documents are open` : `editor ${verb}: no document is open`, { documents: docs.map((d) => ({ id: d.id, title: d.title })) });
  };
  // a pointer is a file (or - for stdin) holding the JSON pointer as plain text or as a JSON string
  const pointerOf = () => {
    if (val('pointer-file')) { const raw = (val('pointer-file') === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(val('pointer-file')), 'utf8')).replace(/^\uFEFF/, '').trim(); try { const j = JSON.parse(raw); return typeof j === 'string' ? j : j?.pointer ?? raw; } catch { return raw; } }
    return val('pointer');
  };
  switch (verb) {
    case 'list': return callEditor('list', { args: val('project') ? { project: val('project') } : {} });
    case 'get': { const p = pointerOf(); return callEditor('get', { doc: await docOrSole(), args: { ...(p ? { pointer: p } : {}), ...(val('locale') ? { locale: val('locale') } : {}) } }); }
    case 'outline': return callEditor('outline', { doc: await docOrSole(), args: val('locale') ? { locale: val('locale') } : {} });
    case 'render': {
      // T14: a diagram block's PNG preview, through the same renderer as the PDF (render_diagram)
      const p = need(pointerOf(), '--pointer (or --pointer-file) of a diagram block');
      const out = need(val('out'), '--out x.png');
      const got = await callEditor('get', { doc: await docOrSole(), args: { pointer: p, ...(val('locale') ? { locale: val('locale') } : {}) } });
      const block = got.value;
      if (!block || block.kind !== 'diagram' || !block.model) throw new BwError('BAD_ARGS', `editor render: ${p} is not a diagram block (kind ${block?.kind ?? 'none'})`);
      const r = await renderDiagramPng(modelIn(block.model), { theme: loadTheme(), locale: got.locale || val('locale') || 'ar', scale: Number(val('scale')) || 2, pngPath: path.resolve(out) });
      const L = r.legibility;
      return { ok: true, png: r.png, width: r.width, height: r.height, pointer: p, legible: !!L?.ok, min_pt: L?.minPtPrinted, small: L?.small?.length ?? 0, overlaps: L?.overlaps?.length ?? 0 };
    }
    case 'ops': {
      const raw = readJsonArg(need(val('ops-file'), '--ops-file (a file, or - for stdin)'));
      const ops = Array.isArray(raw) ? raw : raw.ops;
      const locale = need(val('locale') || raw.locale, '--locale ar|en');
      checkOps(ops, locale);
      const r = await callEditor('ops', { doc: need(doc, '--doc'), args: { ops, locale, mirror: flags.has('--mirror'), ...(val('agent') ? { agent: val('agent') } : {}), ...(val('group') ? { group: val('group') } : {}) } });
      // T14: opsLen is the length of the undo stack, not the batch: say how many ops were sent and applied
      return { ...r, batch: ops.length, applied: r.applied ?? ops.length, undo_depth: r.opsLen };
    }
    case 'action': {
      const id = need(val('id'), '--id');
      if (!EDITOR_ACTIONS.includes(id)) throw new BwError('UNKNOWN_ACTION', `unknown action "${id}"`, { allowed: EDITOR_ACTIONS });
      return callEditor('action', { doc: need(doc, '--doc'), args: { id, ...(val('args-file') ? { args: readJsonArg(val('args-file')) } : {}) } });
    }
    case 'new': return callEditor('new', { args: { title: need(val('title'), '--title'), ...(val('project') ? { project: val('project') } : {}) } });
    case 'import': {
      if (!val('file') && !val('args-file')) throw new BwError('BAD_ARGS', 'editor import: --file (a document JSON path) or --args-file (a document, or - for stdin) is required');
      return callEditor('import', { args: { ...(val('file') ? { file: path.resolve(val('file')) } : { document: readJsonArg(val('args-file')) }), ...(val('project') ? { project: val('project') } : {}) } });
    }
    case 'health': {
      const t = await hostTarget({ start: false });
      const res = await fetch(new URL('/api/host/health', t.url), { headers: { 'x-bw-token': t.token } });
      return res.json();
    }
    default: throw Object.assign(new Error(`editor: unknown verb ${verb || ''} (list|get|outline|ops|action|new|import|health|render)`), { code: 2 });
  }
}

/** Every verb this CLI answers (the plugin commands may only call these). */
export const VERBS = ['open', 'close', 'stop', 'status', 'new', 'build', 'harvest', 'import', 'export', 'gate', 'heal-log', 'verify-history', 'library', 'tidy', 'report', 'update', 'doctor', 'reset', 'editor', 'help'];

const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   business-wrap')).map((l) => l.slice(5)).join('\n');
/** The flags each verb knows (T11: an unknown flag is an error, never silently ignored). */
const COMMON = ['--json'];
const KNOWN_FLAGS = {
  open: ['--port', '--no-browser', '--ui'], close: [], stop: [], status: [], new: ['--title', '--out', '--no-browser', '--no-open'], build: ['--out', '--ui'],
  harvest: ['--out', '--name', '--roles', '--no-open', '--no-browser'], import: ['--out', '--name', '--roles', '--no-open', '--no-browser'],
  export: ['--out', '--edits', '--no-docx'], gate: [], 'heal-log': [], 'verify-history': ['--history'], library: [], report: [], doctor: [], reset: ['--all', '--dry-run', '--yes'],
  editor: ['--doc', '--pointer', '--pointer-file', '--locale', '--ops-file', '--mirror', '--agent', '--group', '--id', '--args-file', '--project', '--title', '--file', '--tab', '--out', '--scale'],
};
const HELP = ['--help', '-h', 'help', '-?'];
export async function run(argv) {
  const [verb, ...rest] = argv;
  // T13: --help of ANY verb prints usage and does nothing else: no host, no Edge, no file (the check comes before every other step)
  if (rest.some((a) => HELP.includes(a)) && verb && !HELP.includes(verb)) return { usage: USAGE };
  const known = KNOWN_FLAGS[verb];
  if (known) { const bad = rest.find((a) => a.startsWith('-') && !known.includes(a) && !COMMON.includes(a)); if (bad) throw Object.assign(new Error(`${verb}: unknown option ${bad}${bad === '--tab' ? ' (--tab belongs to business-wrap editor)' : ''}; nothing was done\n${USAGE}`), { code: 2 }); }
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const val = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const VALUED = new Set(['--pointer-file', '--tab', '--scale', '--out', '--port', '--name', '--roles', '--edits', '--title', '--ui', '--history', '--doc', '--pointer', '--locale', '--ops-file', '--agent', '--group', '--id', '--args-file', '--project', '--file']);
  const pos = rest.filter((a, i) => !a.startsWith('--') && !VALUED.has(rest[i - 1]));
  const browser = !flags.has('--no-browser');
  switch (verb) {
    case 'open': return open({ inputs: pos, port: val('port') ? Number(val('port')) : 4317, browser, ui: val('ui') });
    case 'close': case 'stop': return close();
    case 'status': return status();
    case 'new': return newDoc({ title: val('title') || pos[0], out: val('out'), browser, openIt: !flags.has('--no-open') });
    case 'build': return build({ inputs: pos, out: val('out'), ui: val('ui') });
    case 'harvest': return harvest({ input: pos[0], out: val('out'), name: val('name'), roles: val('roles'), openIt: !flags.has('--no-open'), browser });
    case 'import': return importSources({ inputs: pos, out: val('out'), name: val('name'), roles: val('roles'), openIt: !flags.has('--no-open'), browser });
    case 'export': return exportDoc({ document: pos[0], locale: pos.find((p) => /^(ar|en)$/.test(p)), out: val('out'), edits: val('edits'), docx: !flags.has('--no-docx') });
    case 'gate': return gate({ stage: pos[0], files: pos.slice(1) });
    case 'heal-log': return { healed: readHealLog() };
    case 'verify-history': return verifyHistory({ file: pos[0], history: val('history') });
    case 'library': return library();
    case 'tidy': {
      // only `tidy` and `tidy --dry-run` act; help prints usage and changes nothing; anything else exits 2 and changes nothing
      if (rest.some((a) => ['--help', '-h', 'help', '-?'].includes(a))) return { usage: USAGE };
      const bad = rest.filter((a) => a !== '--dry-run');
      if (bad.length) throw Object.assign(new Error(`tidy: unknown argument ${bad[0]} (usage: business-wrap tidy [--dry-run]); nothing was changed`), { code: 2 });
      return tidyCmd({ dryRun: flags.has('--dry-run') });
    }
    case 'report': return report({ from: pos[0], to: pos[1] });
    case 'update': return update(rest);
    case 'doctor': return { ...(await doctorInfo()), roots: knownRoots() };
    case 'reset': return reset({ all: flags.has('--all'), dryRun: flags.has('--dry-run'), yes: flags.has('--yes') });
    case 'editor': return editorCmd(pos, val, flags);
    case undefined: case 'help': case '--help': case '-h': return { usage: USAGE };
    default: throw Object.assign(new Error(`unknown command: ${verb}\n${USAGE}`), { code: 2 });
  }
}

/** Plain lines for people, the object with --json. A FAIL gate makes the exit code 1. */
export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  try {
    if (argv[0] !== 'doctor' && !argv.some((a) => HELP.includes(a))) await migrateLocal(REPO); // plugin installs: state moves to the plugin data folder once
    const r = await run(argv.filter((a) => a !== '--json'));
    if (r.usage) console.log(r.usage);
    else if (argv[0] === 'editor') console.log(JSON.stringify(r, null, 1));
    else if (argv[0] === 'tidy') { if (r.lines.length) console.log(r.lines.join(String.fromCharCode(10))); console.log(json ? JSON.stringify({ ...r, lines: undefined }) : `${r.dryRun ? 'plan' : 'tidy'}: ${r.moved} of ${r.files_before} files, unsorted ${r.unmatched}, failed ${r.failed}  (${r.root})`); }
    else if (argv[0] === 'reset' && !json) { for (const i of r.items) console.log(`${i.recycled === undefined ? (r.dryRun ? 'would recycle' : 'listed') : i.recycled ? 'recycled' : 'FAILED'}  ${i.kind.padEnd(16)} ${i.path}`); console.log(r.cancelled ? 'cancelled: nothing changed' : r.dryRun ? `dry run: ${r.items.length} item(s) would go to the Recycle Bin (add --yes to do it)` : `${r.recycled} item(s) sent to the Recycle Bin${r.failed ? `, ${r.failed} failed (is Edge or a host still running?)` : ''}`); }
    else if (argv[0] === 'update') process.stdout.write(r.output);
    else console.log(json ? JSON.stringify(r, null, 1) : Object.entries(r).map(([k, v]) => `${k.padEnd(10)} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
    const gates = [...(r.gates || []), ...(r.opened?.gates || [])];
    return argv[0] === 'update' ? r.code : argv[0] === 'reset' && r.failed ? 1 : gates.some((g) => g.verdict === 'FAIL') ? 1 : 0;
  } catch (e) {
    console.error(json || argv[0] === 'editor' ? JSON.stringify({ ok: false, error: e.message, code: e.code || 1, ...(e.data || {}) }) : `business-wrap ${argv[0] || ''}: ${e.message}`);
    return typeof e.code === 'number' ? e.code : 1;
  }
}

const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main().then((c) => { process.exitCode = c; });
