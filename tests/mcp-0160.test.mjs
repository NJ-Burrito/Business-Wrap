// 0.16.0 (mcp-notes items 7, 8, 9, 10, 11, 12, 15; the tool half of 5): a REAL MCP client over stdio builds a document from a cold start, in REAL Chrome:
//   M1  cold start from MCP alone: no host, no tab, no library. open_in_editor with no arguments starts the host and makes NO document; editor_new then opens its own window and creates the one document
//   M2  logos from files: {"$file": png} puts a checked data URI in; a corrupt PNG, a truncated typed data URI and a missing file are BAD_OP (also straight at the host); reply has revision and doc
//   M3  retries are safe: the same request_id is applied once (replayed:true), the overlay count does not grow
//   M4  an export with a retry: path and folder in the reply, written whole (no .part file), no duplicate on retry, name/destination/docx arguments, a save-folder change named in every reply and host_health
//   M5  a restart mid-way: the same files give the same library id after the host is stopped and started again, and the edit made before is still there
//   M6  project assignment, trash and restore (deletedAt in listings, include_trashed), open_in_editor {doc_id} resolves against the library
//   M7  the CLI finds the host by itself (no BW_HOST_URL) and applies an ops file with {"$file"} values; stop leaves a host another agent started alone
//   M8  verifyHistory returns the issues list; no false tamper after a save-folder switch; a second browser profile (a second signing key) still verifies
//   node tests/mcp-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { REPO, chooseBrowser } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-mcp0160-'));
const stub = path.join(tmp, 'launches.jsonl');
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BROWSER_STUB: stub, BW_BRIDGE_TIMEOUT_MS: '9000', BW_EDITOR_TIMEOUT_MS: '60000', BW_NEW_TAB_WAIT_MS: '60000', BW_OP_PACE_MS: '40', BW_UPDATE_TOKEN: 'none', PYTHONUTF8: '1' };
fs.mkdirSync(env.BW_WORKSPACE, { recursive: true });
Object.assign(process.env, env);
const br = chooseBrowser({ env: { BW_BROWSER: 'chrome' }, saved: '' });
if (!br || br.id !== 'chrome') { console.log('SKIP mcp-0160: Google Chrome is not installed here'); process.exit(0); }
env.BW_CHROME = br.exe; process.env.BW_CHROME = br.exe;
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
// 0.16.3: a stalled run says where (the last check that passed) and what it had, within 8 minutes, instead of being killed silently at 15 (CI run 41587032456 left no line at all)
setTimeout(() => { console.log(out.join('\n') + `\nFAIL  mcp-0160: stalled for 480 s; the last check before the stall: ${out.at(-1) || '(none)'}`); process.exit(1); }, 480e3).unref();
const within = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(ok, ms).unref())]);
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  mcp-0160: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 600) : ''}`); if (!ok) failed += 1; };
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const launches = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/* a PNG made here: signature, IHDR, one IDAT, IEND, real CRCs */
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const png = (w = 24, h = 24, rgb = [190, 154, 65]) => {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = rgb[0]; raw[o + 1] = rgb[1] ^ (x * 3); raw[o + 2] = rgb[2] ^ (y * 3); } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const goodPng = path.join(tmp, 'logo-good.png');
const badPng = path.join(tmp, 'logo-bad.png');
fs.writeFileSync(goodPng, png());
const bad = Buffer.from(png()); bad[bad.length - 20] ^= 0xff; // a flipped byte inside the IDAT: its checksum no longer matches
fs.writeFileSync(badPng, bad);
const goodUri = `data:image/png;base64,${fs.readFileSync(goodPng).toString('base64')}`;

function tab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const open = new Promise((ok) => { ws.onopen = ok; });
  return {
    async send(method, params = {}) { await open; return new Promise((ok) => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); }); },
    async ev(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; },
    close() { try { ws.close(); } catch { /* closed */ } },
  };
}
const chromes = [];
/** Real Chrome on its own profile, opening the url the host asked for (the stub line) or any url; keep-awake switches as the host's own launch has them. */
async function launchChrome(url, profileName) {
  const cdp = await freePort();
  const profile = path.join(tmp, profileName);
  const c = spawn(br.exe, [`--user-data-dir=${profile}`, `--remote-debugging-port=${cdp}`, '--no-first-run', '--no-default-browser-check', '--disable-session-crashed-bubble', '--hide-crash-restore-bubble', ...H.keepAwakeArgs(), '--new-window', url], { stdio: 'ignore' });
  const rec = { pid: c.pid, cdp, profile };
  chromes.push(rec);
  return rec;
}
const killChrome = (rec) => { if (rec?.pid) spawnSync('taskkill', ['/PID', String(rec.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); };
async function attach(rec, match = () => true) {
  const t = await until(async () => (await (await fetch(`http://127.0.0.1:${rec.cdp}/json`)).json()).find((x) => x.type === 'page' && match(x.url)), 40000);
  if (!t) throw new Error('no page');
  return tab(t.webSocketDebuggerUrl);
}
const booted = (c) => until(async () => (await c.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true, 60000);

const client = new Client({ name: 'mcp-0160', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
const call = (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 240000 });
let base = '', token = '';
const hostFresh = () => { const h = H.hostState(); base = h ? `http://127.0.0.1:${h.port}` : ''; token = h?.token || ''; return h; };
const raw = async (tool, doc, args) => { const r = await fetch(`${base}/api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify({ tool, doc, args }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const health = async () => (await fetch(`${base}/api/host/health`, { headers: { 'x-bw-token': token } })).json();

let C1 = null, A = null, B = null;
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check('the MCP server lists the new tools (editor_assign_project, editor_trash)', tools.includes('editor_assign_project') && tools.includes('editor_trash'), tools.join(','));

  /* M1 cold start */
  let r = await call('host_health', {});
  check('M1: before anything, host_health says NO_HOST and starts nothing', r.isError === true && data(r).code === 'NO_HOST' && !hostFresh(), text(r).slice(0, 200));
  r = await call('open_in_editor', {});
  const oe = data(r);
  check('M1: open_in_editor with no arguments starts the host and opens a blank tab (no document made)', !r.isError && oe.blank === true && !!hostFresh() && oe.library !== true, text(r).slice(0, 240));
  const lib0 = await (await fetch(`${base}/api/library/list`)).json();
  check('M1: the host holds no document yet (no stray blank at host start)', Array.isArray(lib0) && lib0.length === 0, JSON.stringify(lib0).slice(0, 200));
  const pNew = call('editor_new', { title: 'اختبار الأدوات 0160' });
  const asked = await until(() => launches().find((l) => (l.args || []).some((a) => /automation=1/.test(a))), 30000);
  check('M1: editor_new with no tab opens a window itself (an automation tab)', !!asked, JSON.stringify(launches()).slice(0, 300));
  const url1 = (asked?.args || []).filter((a) => /^http/.test(a)).at(-1);
  C1 = await launchChrome(url1, 'profile-main');
  const P1 = await attach(C1, (u) => u.startsWith('http://127.0.0.1'));
  check('M1: the window booted (positive sample: BW.ready and a session)', !!(await booted(P1)));
  r = await pNew;
  const created = data(r);
  check('M1: editor_new answered with the one document it made', !r.isError && /^doc-/.test(created.id || '') && created.workspace?.root, text(r).slice(0, 240));
  const DOC = created.id;
  r = await call('editor_list_documents', {});
  check('M1: the library has that one document and nothing else', !r.isError && data(r).documents.length === 1 && data(r).documents[0].id === DOC, text(r).slice(0, 300));

  /* M2 logos from files */
  r = await call('editor_ops', { doc: DOC, locale: 'ar', ops: [{ op: 'replace', path: '/overlays', value: [] }, { op: 'insert', path: '/overlays/-', value: { id: 'lg1', kind: 'image', x: 5, y: 5, w: 20, src: { $file: goodPng } } }] });
  const o1 = data(r);
  check('M2: a logo from a file ({"$file"}) is applied; the reply has applied, revision and the document id', !r.isError && o1.applied === 2 && Number.isInteger(o1.revision) && o1.doc === DOC, text(r).slice(0, 300));
  r = await call('editor_get', { doc: DOC, pointer: '/overlays/0/src', locale: 'ar' });
  check('M2: the stored logo is byte-identical to the file', !r.isError && data(r).value === goodUri, String(data(r)?.value).slice(0, 100));
  r = await call('editor_ops', { doc: DOC, locale: 'ar', ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg2', kind: 'image', x: 5, y: 40, w: 20, src: { $file: badPng } } }] });
  check('M2: a corrupt PNG file is BAD_OP and nothing is applied', r.isError === true && data(r).code === 'BAD_OP' && /checksum|PNG/i.test(data(r).message), text(r).slice(0, 300));
  r = await call('editor_ops', { doc: DOC, locale: 'ar', ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg3', kind: 'image', x: 5, y: 40, w: 20, src: goodUri.slice(0, goodUri.length - 40) } }] });
  check('M2: a truncated typed data URI is BAD_OP', r.isError === true && data(r).code === 'BAD_OP', text(r).slice(0, 300));
  r = await call('editor_ops', { doc: DOC, locale: 'ar', ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg4', kind: 'image', x: 5, y: 40, w: 20, src: { $file: path.join(tmp, 'no-such.png') } } }] });
  check('M2: a missing file is BAD_OP with its path', r.isError === true && data(r).code === 'BAD_OP' && /no-such\.png/.test(data(r).message), text(r).slice(0, 300));
  const direct = await raw('ops', DOC, { locale: 'ar', ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg5', kind: 'image', src: goodUri.slice(0, 200) } }] });
  check('M2: the host itself refuses a data URI that does not decode (422 BAD_OP), whoever calls', direct.status === 422 && direct.body.code === 'BAD_OP', JSON.stringify(direct).slice(0, 300));
  r = await call('editor_get', { doc: DOC, pointer: '/overlays', locale: 'ar' });
  check('M2: after the refused batches the document still has exactly one logo', data(r).value.length === 1, JSON.stringify(data(r).value).length);

  /* M3 retries */
  const RID = 'rid-0160-logo';
  const ins = { doc: DOC, locale: 'ar', request_id: RID, ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg6', kind: 'image', x: 40, y: 5, w: 20, src: { $file: goodPng } } }] };
  const a1 = data(await call('editor_ops', ins));
  const a2 = data(await call('editor_ops', ins));
  r = await call('editor_get', { doc: DOC, pointer: '/overlays', locale: 'ar' });
  check('M3: the same request_id twice is applied once (replayed:true), the logo is not doubled', a1.applied === 1 && a2.replayed === true && data(r).value.length === 2, JSON.stringify({ a1: a1.applied, a2: a2.replayed, n: data(r).value?.length }));
  const tabRid = await raw('ops', DOC, { locale: 'ar', request_id: 'rid-tab-only', ops: [{ op: 'setText', path: '/control/title', value: 'عنوان المحاولة' }] });
  const tabRid2 = await raw('ops', DOC, { locale: 'ar', request_id: 'rid-tab-only', ops: [{ op: 'setText', path: '/control/title', value: 'عنوان المحاولة' }] });
  check('M3: the host answers a repeated request_id from memory', tabRid.status === 200 && tabRid2.status === 200 && tabRid2.body.result?.replayed === true, JSON.stringify([tabRid.body, tabRid2.body]).slice(0, 300));

  /* M4 export with a retry */
  const ws0 = hostFresh() && (await health()).workspace;
  const exArgs = { doc: DOC, id: 'exportPdf', args: { name: 'smoke-0160', docx: false }, request_id: 'rid-export-1' };
  const t0 = Date.now();
  r = await call('editor_action', exArgs);
  const ex1 = data(r);
  const files1 = ex1.folder && fs.existsSync(ex1.folder) ? fs.readdirSync(ex1.folder) : [];
  check('M4: exportPdf returns the path and the folder; the file is a real PDF under the name asked for', !r.isError && ex1.pdf && path.basename(ex1.pdf) === 'smoke-0160.pdf' && path.dirname(ex1.pdf) === ex1.folder && fs.readFileSync(ex1.pdf).subarray(0, 5).toString() === '%PDF-', text(r).slice(0, 300));
  check('M4: no half-finished file is left beside it, and docx:false wrote no DOCX', !files1.some((f) => /\.part\.pdf$/.test(f)) && !files1.some((f) => /\.docx$/.test(f)), files1.join(','));
  r = await call('editor_action', exArgs);
  const ex2 = data(r);
  const files2 = fs.readdirSync(ex1.folder);
  check('M4: the retry (same request_id) is replayed and writes no second file (no «(2)»)', !r.isError && ex2.replayed === true && files2.length === files1.length && !files2.some((f) => /\(2\)/.test(f)), JSON.stringify({ ex2: ex2.replayed, files2 }));
  r = await call('editor_action', { doc: DOC, id: 'exportPdf', args: { destination: path.join(tmp, 'out-here'), name: 'elsewhere', docx: false } });
  const ex3 = data(r);
  check('M4: destination and name are honoured', !r.isError && ex3.pdf === path.join(tmp, 'out-here', 'elsewhere.pdf') && fs.existsSync(ex3.pdf), text(r).slice(0, 300));
  check('M4: a call that never changed the save folder says so: workspace.changed absent, root named', ex1.workspace?.root && !ex1.workspace.changed && ws0?.root === ex1.workspace.root, JSON.stringify(ex1.workspace));
  // the save folder is switched (what the picker's Choose does): every reply and host_health name it
  const newParent = path.join(tmp, 'ws2'); fs.mkdirSync(newParent, { recursive: true });
  const sw = await fetch(`${base}/api/workspace/parent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify({ parent: newParent }) });
  r = await call('editor_get', { doc: DOC, pointer: '/control/title', locale: 'ar' });
  const hh = data(await call('host_health', {}));
  check('M4: after a save-folder change the very next reply and host_health name it (from, to, by)', sw.ok && data(r).workspace?.changed?.to?.startsWith(newParent) && hh.workspace?.changed?.from && hh.workspace.changed.by, JSON.stringify([data(r).workspace, hh.workspace]).slice(0, 400));

  /* M8 (part): verify after the folder switch */
  r = await call('editor_action', { doc: DOC, id: 'verifyHistory' });
  const vh = data(r);
  check('M8: verifyHistory returns {ok, issues[]}; after the folder switch there is no false tamper', !r.isError && vh.ok === true && Array.isArray(vh.issues) && vh.issues.length === 0, text(r).slice(0, 300));
  const banner = await P1.ev(`!!([...document.querySelectorAll('*')].find((e)=>e.shadowRoot && e.shadowRoot.textContent.includes('عبثا')) ) || document.body.innerText.includes('عبثا')`);
  check('M8: the tamper banner is not showing after the folder switch', banner === false, String(banner));

  /* M5 restart mid-way: the same files, the same id */
  const SAMPLE = path.join(REPO, 'samples', 'event-permit');
  r = await call('open_in_editor', { documents: [SAMPLE] });
  const idA = data(r).library_id;
  check('M5: open_in_editor of sample files returns a library id', /^doc-/.test(idA || ''), text(r).slice(0, 240));
  const gotIt = await until(async () => (await P1.ev(`window.BW.EXT.library.get(${JSON.stringify(idA)}).then((e)=>!!e)`)) === true, 30000);
  check('M5: the tab ingested the document (positive sample)', !!gotIt);
  r = await call('editor_ops', { doc: idA, locale: 'ar', ops: [{ op: 'setText', path: '/control/title', value: 'عنوان قبل إعادة التشغيل' }] });
  check('M5: an edit before the restart is applied', !r.isError && data(r).applied === 1, text(r).slice(0, 200));
  await sleep(1500);
  r = await call('close_editor', {});
  const cl = data(r);
  check('M5: close_editor stops the host this session started and names it', !r.isError && cl.stopped >= 1 && cl.host?.pid, text(r).slice(0, 300));
  killChrome(C1); await sleep(1500);
  const after = await until(() => !H.hostState() || !H.alive(H.hostState().pid), 10000);
  check('M5: the host is down', !!after);
  r = await call('open_in_editor', { documents: [SAMPLE] });
  const idB = data(r).library_id;
  check('M5: after the restart the same files give the same library id', idB === idA, `${idA} / ${idB}`);
  hostFresh();
  C1 = await launchChrome(`${base}/?automation=1#doc=${idA}`, 'profile-main');
  const P1b = await attach(C1, (u) => u.startsWith('http://127.0.0.1'));
  check('M5: the restarted editor booted (positive sample)', !!(await booted(P1b)));
  check('M5: the host sees the restarted tab (positive sample)', !!(await until(async () => (await health()).tabs.some((t) => t.live && (t.docs || []).includes(idA)), 30000)));
  r = await call('editor_get', { doc: idA, pointer: '/control/title', locale: 'ar' });
  check('M5: the edit made before the restart is still there', !r.isError && data(r).value === 'عنوان قبل إعادة التشغيل', text(r).slice(0, 200));

  /* M6 projects, trash, doc_id */
  r = await call('editor_assign_project', { doc: idA, project: 'مشروع 0160' });
  check('M6: editor_assign_project puts the document in a project (made by name)', !r.isError && data(r).project === 'مشروع 0160', text(r).slice(0, 200));
  r = await call('editor_list_documents', { project: 'مشروع 0160' });
  check('M6: the project filter lists it', !r.isError && data(r).documents.some((d) => d.id === idA), text(r).slice(0, 300));
  r = await call('editor_trash', { doc: idA });
  const tr = data(r);
  check('M6: editor_trash moves it to the Trash (deletedAt)', !r.isError && tr.trashed === true && !!tr.deletedAt, text(r).slice(0, 200));
  r = await call('editor_list_documents', {});
  const listLive = data(r).documents.map((d) => d.id);
  r = await call('editor_list_documents', { include_trashed: true });
  const trashedRow = data(r).documents.find((d) => d.id === idA);
  check('M6: the default listing hides it; include_trashed shows it with deletedAt', !listLive.includes(idA) && !!trashedRow?.deletedAt, JSON.stringify({ listLive, trashedRow }).slice(0, 300));
  const hostList = await (await fetch(`${base}/api/library/list`)).json();
  check('M6: the host library also carries deletedAt for it', hostList.find((d) => d.id === idA)?.deletedAt, JSON.stringify(hostList).slice(0, 300));
  r = await call('editor_trash', { doc: idA, restore: true });
  r = await call('editor_list_documents', {});
  check('M6: restore brings it back to the default listing', !r.isError && data(r).documents.some((d) => d.id === idA && !d.deletedAt), text(r).slice(0, 300));
  r = await call('open_in_editor', { doc_id: idA });
  check('M6: open_in_editor {doc_id} resolves against the library (the tab that holds it is reported)', !r.isError && data(r).library === true && data(r).doc_id === idA && data(r).already_open === true, text(r).slice(0, 300));
  r = await call('open_in_editor', { doc_id: DOC });
  check('M6: a library document no tab holds is added in a tab, not "not in the library"', !r.isError && data(r).library === true && data(r).doc_id === DOC, text(r).slice(0, 300));

  /* M7 the CLI by itself */
  const cliEnv = { ...env }; delete cliEnv.BW_HOST_URL; delete cliEnv.BW_HOST_TOKEN;
  const opsFile = path.join(tmp, 'ops.json');
  fs.writeFileSync(opsFile, JSON.stringify({ ops: [{ op: 'insert', path: '/overlays/-', value: { id: 'lg7', kind: 'image', x: 60, y: 60, w: 10, src: { $file: goodPng } } }] }));
  const cli = (args) => spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), ...args], { cwd: REPO, env: cliEnv, encoding: 'utf8', timeout: 120000 });
  let c = cli(['editor', 'ops', '--doc', DOC, '--locale', 'ar', '--ops-file', opsFile]);
  let cj = {}; try { cj = JSON.parse(c.stdout); } catch { /* shown below */ }
  check('M7: the CLI finds the host URL and token itself and applies an ops file with a {"$file"} logo', c.status === 0 && cj.applied === 1 && cj.doc === DOC, (c.stdout + c.stderr).slice(0, 300));
  const before = (await fetch(`${base}/api/host/health`)).ok;
  const hs = JSON.parse(fs.readFileSync(H.hostFile(), 'utf8'));
  const other = spawn(process.execPath, ['-e', 'setTimeout(()=>{},60000)'], { stdio: 'ignore' });
  fs.writeFileSync(H.hostFile(), JSON.stringify({ ...hs, startedBy: `mcp:${other.pid}` }, null, 1));
  r = await call('close_editor', {});
  const sk = data(r);
  check('M7: close_editor leaves a host another running MCP server started alone, and names it', !r.isError && sk.stopped === 0 && sk.skipped?.[0]?.startedBy === `mcp:${other.pid}` && before && H.alive(hs.pid), text(r).slice(0, 300));
  other.kill();
  fs.writeFileSync(H.hostFile(), JSON.stringify(hs, null, 1));

  /* M8 a second browser profile: a second signing key */
  C2key: {
    B = await launchChrome(`${base}/?automation=1#doc=${idA}`, 'profile-second');
    const P2 = await attach(B, (u) => u.startsWith('http://127.0.0.1'));
    if (!(await booted(P2))) { check('M8: the second browser booted (positive sample)', false); break C2key; }
    check('M8: the second browser booted (positive sample)', true);
    await until(async () => (await P2.ev(`window.BW.EXT.library.get(${JSON.stringify(idA)}).then((e)=>!!e)`)) === true, 30000);
    await P2.ev(`window.BW.EXT.library.open(${JSON.stringify(idA)}).then(()=>1)`);
    await sleep(1500);
    await P2.ev(`(()=>{ window.BW.setText('/control/title', 'عنوان من المتصفح الثاني'); return 1 })()`);
    await sleep(2500);
    const keys = await P2.ev(`(async()=>{ const L = window.BW.EXT.ledger.log(window.BW.S.svc); await new Promise(r=>setTimeout(r,500)); return { ok: L.verdict.ok, issues: L.verdict.issues, kids: [...new Set(L.entries.map(e=>e.actor.kid))].length, n: L.entries.length } })()`);
    check('M8: a second profile signs with its own key (a second key id in the log) and the ledger still verifies', keys && keys.ok === true && keys.kids >= 2, JSON.stringify(keys).slice(0, 300));
    const tabs = (await health()).tabs;
    r = await raw('action', idA, { id: 'verifyHistory' });
    check('M8: verifyHistory answers from whichever tab owns the document', r.status === 200 && (r.body.result?.ok === true || r.body.result?.issues?.length === 0), JSON.stringify(r.body).slice(0, 300) + ' tabs=' + tabs.length);
  }

  /* M9 the host keeps its editor across a window close (the owner's host stopped twice with no cause) */
  const closeGracefully = async (rec) => { try { const v = await (await fetch(`http://127.0.0.1:${rec.cdp}/json/version`)).json(); const w = tab(v.webSocketDebuggerUrl); await w.send('Browser.close'); w.close(); } catch { /* gone */ } };
  const hostPid = hostFresh().pid;
  await closeGracefully(C1); if (B) await closeGracefully(B);
  await sleep(9000); // longer than the 4 s a closed last tab used to leave a host
  check('M9: after the last window is closed (cleanly) the host an agent used is still up', H.alive(hostPid) && (await fetch(`${base}/api/version`).then((x) => x.ok).catch(() => false)), `pid ${hostPid} alive ${H.alive(hostPid)}`);
  const gone = async (rec) => until(async () => { try { await fetch(`http://127.0.0.1:${rec.cdp}/json/version`, { signal: AbortSignal.timeout(800) }); return false; } catch { return true; } }, 15000, 300);
  await gone(C1); if (B) await gone(B);
  const oldC1 = C1;
  C1 = await launchChrome(`${base}/?automation=1#doc=${DOC}`, 'profile-main');
  let m9 = '';
  try {
    const P3 = await attach(C1, (u) => u.startsWith('http://127.0.0.1'));
    const up = await booted(P3);
    const listed = await until(async () => { const x = await call('editor_list_documents', {}); m9 = text(x).slice(0, 200); return !x.isError && data(x).documents.some((d) => d.id === DOC); }, 40000, 500);
    check('M9: a new window attaches to the same host and the library is as it was (positive sample)', !!up && !!listed, `up ${up}; ${m9}`);
  } catch (e) { check('M9: a new window attaches to the same host and the library is as it was (positive sample)', false, `${e.message}; old chrome ${oldC1.cdp}`); }
  /* M10 a busy host is not a dead host: a recorded host whose port accepts but does not answer in time is reused, never asked to stop */
  r = await call('close_editor', {});
  killChrome(C1);
  const seenReq = [];
  const busy = net.createServer((sock) => { sock.on('data', (d) => seenReq.push(String(d).slice(0, 60))); }); // accepts, never answers (a host busy with a PDF)
  const busyPort = await new Promise((ok) => busy.listen(0, '127.0.0.1', () => ok(busy.address().port)));
  fs.writeFileSync(H.hostFile(), JSON.stringify({ pid: process.pid, port: busyPort, startedAt: new Date().toISOString(), token: 'busy-token', editor: path.join(tmp, 'x.html'), browserPids: [], tabs: 0 }));
  const again = await H.start({ editor: path.join(REPO, 'package.json'), port: busyPort, open: false }).catch((e) => ({ error: e.message }));
  check('M10: start() on a host that is busy (port open, no answer) reuses it and never sends it a stop', again.reused === true && !seenReq.some((x) => /host\/stop/.test(x)), JSON.stringify({ again, seenReq }).slice(0, 300));
  busy.close(); fs.rmSync(H.hostFile(), { force: true });
  const S = await import('../engine/routes/session.mjs');
  check('M9: the keep-alive rule: a host used by an agent just now waits for a tab; one nobody used does not', S.agentKeepMs({ agentAt: Date.now() }) > 60000 && S.agentKeepMs({}) === 0);
  r = await call('close_editor', {});
  check('close_editor at the end stops this session\'s host', !r.isError, text(r).slice(0, 200));
} catch (e) {
  check('the suite ran to the end', false, e.stack || e.message);
} finally {
  for (const rec of chromes) killChrome(rec);
  try { await within(client.close(), 8000); } catch { /* closed */ }
  try { const h = H.hostState(); if (h && H.alive(h.pid)) await within(H.stop(), 15000); } catch { /* none */ }
}
console.log(out.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  mcp-0160: ${out.length - failed}/${out.length}`);
process.exit(failed ? 1 : 0);
