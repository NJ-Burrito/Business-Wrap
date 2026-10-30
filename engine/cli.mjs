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
//   business-wrap update [--check|--apply --yes|--notes]   the updater (update/cli.mjs)
// Add --json for machine output. Exit 0 done · 1 failed · 2 usage · 3 needs a module that is not in this build yet.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildEditor } from './build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, loadEdited, fontsFor, REPO, userCwd, fileStem } from './export.mjs';
import { systemFonts } from './fonts.mjs';
import { harvestModel, harvestCrawl } from './harvest/cli.mjs';
import { harvestSources, MODEL_EXT, TEXT_EXT } from './harvest/sources.mjs';
import { STATE_DIR, healPort, healStaleHosts, healWorkspace, healFont, readHealLog, alive } from './heal/index.mjs';
import { GATES } from './heal/gates.mjs';
import { workspace, ensure, reportPath, sourcesDir, keepVersion, docTitle, outName, uniquePath, DOCS_NAME } from './workspace.mjs';
import { tidy } from './tidy.mjs';

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
export async function open({ inputs = [], port = 4317, browser = true, ui } = {}) {
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
  return { url: lib?.url || h.url, doc_id: lib?.doc_id || docId, editor, pid: h.pid, port: h.port, browser: !!h.browserPid, library: !!lib };
}

/** A serve.mjs of THIS install (its path on the command line): another install's host never matches (other folder). */
const norm = (x) => String(x || '').toLowerCase().replace(/\//g, '\\');
export const ownsServe = (cmd, repo = REPO) => norm(cmd).includes(norm(path.join(repo, 'engine', 'serve.mjs')));
function ownServers() {
  const ps = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"], { encoding: 'utf8', windowsHide: true })
    : spawnSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return String(ps.stdout || '').split(/\r?\n/).map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter((m) => m && ownsServe(m[2])).map((m) => Number(m[1]));
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
  return { version: pkg().version, hosts: hosts.map(({ pid, port, url, editor }) => ({ pid, port, url, editor })), host, healed: readHealLog().length, ai: false };
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

export function update(args) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'update', ...args], { encoding: 'utf8' });
  return { code: r.status ?? 1, output: (r.stdout || '') + (r.stderr || '') };
}

/** Every verb this CLI answers (the plugin commands may only call these). */
export const VERBS = ['open', 'close', 'stop', 'status', 'new', 'build', 'harvest', 'import', 'export', 'gate', 'heal-log', 'verify-history', 'library', 'tidy', 'report', 'update', 'help'];

const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//   business-wrap')).map((l) => l.slice(5)).join('\n');
export async function run(argv) {
  const [verb, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--')));
  const val = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  const VALUED = new Set(['--out', '--port', '--name', '--roles', '--edits', '--title', '--ui', '--history']);
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
    case undefined: case 'help': case '--help': case '-h': return { usage: USAGE };
    default: throw Object.assign(new Error(`unknown command: ${verb}\n${USAGE}`), { code: 2 });
  }
}

/** Plain lines for people, the object with --json. A FAIL gate makes the exit code 1. */
export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  try {
    const r = await run(argv.filter((a) => a !== '--json'));
    if (r.usage) console.log(r.usage);
    else if (argv[0] === 'tidy') { if (r.lines.length) console.log(r.lines.join(String.fromCharCode(10))); console.log(json ? JSON.stringify({ ...r, lines: undefined }) : `${r.dryRun ? 'plan' : 'tidy'}: ${r.moved} of ${r.files_before} files, unsorted ${r.unmatched}, failed ${r.failed}  (${r.root})`); }
    else if (argv[0] === 'update') process.stdout.write(r.output);
    else console.log(json ? JSON.stringify(r, null, 1) : Object.entries(r).map(([k, v]) => `${k.padEnd(10)} ${typeof v === 'object' ? JSON.stringify(v) : v}`).join('\n'));
    const gates = [...(r.gates || []), ...(r.opened?.gates || [])];
    return argv[0] === 'update' ? r.code : gates.some((g) => g.verdict === 'FAIL') ? 1 : 0;
  } catch (e) {
    console.error(json ? JSON.stringify({ error: e.message, code: e.code || 1 }) : `business-wrap ${argv[0] || ''}: ${e.message}`);
    return typeof e.code === 'number' ? e.code : 1;
  }
}

const real = (f) => { try { return fs.realpathSync.native(path.resolve(f)); } catch { return path.resolve(f); } };
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) main().then((c) => { process.exitCode = c; });
