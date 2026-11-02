// 0.16.0 (mcp-notes items 1 and 5, reproduced first in REAL Chrome with a REAL host):
//   D1 a tool's call to a tab that shows the «continue where you left off» popup is answered (the popup no longer blocks it: it is dismissed), not TAB_TIMEOUT
//   D2 answering «new» in a tab that holds a document never replaces it with a blank one that owns nothing
//   D3 resuming one document from a tab that holds a document opens it in a window of its own; the tab keeps its document
//   D4 editor_action dismissResume closes the popup; editor_action claim takes the document's lease
//   D5 a window an agent opens is an automation tab (no popup) and its launch carries the no-restore flags
//   D6 a frozen SharedWorker (CDP Debugger.pause on it) does not put the tabs to sleep: each tab beats on its own and still receives a tool's request
//   node tests/dialog-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, chooseBrowser } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-dialog0160-'));
const stub = path.join(tmp, 'launches.jsonl');
Object.assign(process.env, { BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BROWSER_STUB: stub, BW_BRIDGE_TIMEOUT_MS: '8000', BW_QUEUE_MS: '2000' });
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const H = await import('../engine/host.mjs');
const W = await import('../engine/workspace.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  dialog-0160: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 500) : ''}`); if (!ok) failed += 1; };
const br = chooseBrowser({ env: { BW_BROWSER: 'chrome' }, saved: '' });
if (!br || br.id !== 'chrome') { console.log('SKIP dialog-0160: Google Chrome is not installed here'); process.exit(0); }
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const SH = "document.getElementById('bw-ui-host').shadowRoot";

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
const launches = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

let chrome = null;
const pages = [];
try {
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'dialog0160', watermarkDir: null });
  const host = await H.start({ editor, port: 4880, open: false });
  const base = host.url, token = H.hostState().token;
  const cdp = await freePort();
  chrome = spawn(br.exe, [`--user-data-dir=${path.join(tmp, 'chrome-profile')}`, `--remote-debugging-port=${cdp}`, '--no-first-run', '--no-default-browser-check', '--new-window', `${base}?automation=1&t=S`], { stdio: 'ignore' });
  const list = async () => (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json());
  const attach = async (match) => { const t = await until(async () => (await list()).find((x) => x.type === 'page' && match(x.url) && !pages.some((p) => p.id === x.id)), 40000); if (!t) throw new Error('tab not found'); const c = Object.assign(tab(t.webSocketDebuggerUrl), { id: t.id }); pages.push(c); return c; };
  const booted = (c) => until(async () => (await c.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true, 60000);
  const popup = async () => { await fetch(`http://127.0.0.1:${cdp}/json/new?${base}`, { method: 'PUT' }); return attach((u) => u === base); };
  const dlgOpen = (c) => until(async () => (await c.ev(`document.documentElement.dataset.bwResume === 'asked' && !!${SH}.querySelector('dialog.bw-resume[open]')`)) === true, 60000);
  const dlgGone = (c) => until(async () => (await c.ev(`!${SH}.querySelector('dialog.bw-resume[open]')`)) === true, 8000);
  const call = async (tool, tabId, doc, args = {}) => { const t0 = Date.now(); const r = await fetch(`${base}api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify({ tool, tab: tabId, doc, args }), signal: AbortSignal.timeout(60000) }); return { status: r.status, ms: Date.now() - t0, j: await r.json().catch(() => ({})) }; };
  const health = async () => (await fetch(`${base}api/host/health`)).json();
  const tabIdOf = (c) => c.ev('document.documentElement.dataset.bwSession');

  const S = await attach((u) => u.includes('t=S'));
  check('Chrome started; the seed tab booted (positive sample)', !!(await booted(S)));
  await S.ev('window.BW.EXT.library.newDocument().then(()=>1)');
  const entry = JSON.parse(await until(async () => (await S.ev('(()=>{ const e = window.BW.EXT.library.entryOf(window.BW.S.svc); return e && e.editions ? JSON.stringify(e) : "" })()')) || false, 30000));
  const sessions = W.subdir(W.ensure(W.workspace()).dirs, 'sessions');
  const seed = (runId, n, tag) => { const dir = path.join(sessions, runId); fs.mkdirSync(dir, { recursive: true }); for (let i = 0; i < n; i++) { const svc = `doc-seed${tag}-${String(i).padStart(4, '0')}`; fs.writeFileSync(path.join(dir, `seed${tag}${String(i).padStart(3, '0')}.json`), JSON.stringify({ tab: `seed${tag}${String(i).padStart(3, '0')}`, title: `Seed ${tag} ${i}`, svc, ed: 'en', at: new Date(Date.parse('2026-10-20T08:00:00Z') + i * 60000).toISOString(), entry: { ...JSON.parse(JSON.stringify(entry)), id: svc, title: `Seed ${tag} ${i}` }, snap: null })); } };
  seed('20261020-080000-abc011', 6, 'a');

  // D1: a call to a tab that shows the popup
  const P1 = await popup();
  check('D1 setup: the popup is open in a plain tab (positive sample)', !!(await dlgOpen(P1)));
  const id1 = await tabIdOf(P1);
  const n1 = await call('new', id1, undefined, { title: 'Agent doc one' });
  check('D1: a tool\'s call to a tab behind the popup is answered at once (not TAB_TIMEOUT) and the popup is gone', n1.status === 200 && n1.ms < 6000 && !!(await dlgGone(P1)), JSON.stringify(n1).slice(0, 200) + ' ' + await P1.ev(`typeof window.BW.EXT.session.dismissResume + ' open=' + !!${SH}.querySelector('dialog.bw-resume[open]') + ' ' + document.documentElement.dataset.bwResume + ' tr=' + window.BW.EXT.session.transport + ' ready=' + document.documentElement.dataset.bwReady + ' dialogs=' + [...${SH}.querySelectorAll('dialog')].map(x => x.className + ':' + x.open).join(',') + ' when=' + await Promise.race([window.BW.whenReady(1500).then(() => 'ok', () => 'timeout'), new Promise((r) => setTimeout(() => r('hung'), 3000))])`));
  const svc1 = await P1.ev('window.BW.S.svc');
  check('D1: the tab holds the agent\'s new document', /^doc-/.test(String(svc1)), String(svc1));

  // D2: «new» answered in a tab that holds a document
  const P2 = await popup();
  await dlgOpen(P2);
  const svc2 = await P2.ev('(async()=>{ await window.BW.EXT.library.newDocument(); return window.BW.S.svc })()'); // the agent\'s document arrives while the popup waits
  await sleep(1500);
  const libN = await P2.ev('window.BW.EXT.library.all().then(a=>a.length)');
  await P2.ev(`${SH}.querySelector('dialog.bw-resume [data-s=new]').click()`);
  await dlgGone(P2);
  await sleep(1500);
  const svc2b = await P2.ev('window.BW.S.svc');
  const libN2 = await P2.ev('window.BW.EXT.library.all().then(a=>a.length)');
  check('D2: answering «new» keeps the agent\'s document in its tab (no blank document that owns nothing)', svc2b === svc2 && libN2 === libN, `${svc2} -> ${svc2b}; library ${libN} -> ${libN2}`);

  // D3: resume one from a tab that holds a document
  seed('20261021-080000-abc012', 4, 'b');
  const P3 = await popup();
  await dlgOpen(P3);
  const svc3 = await P3.ev('(async()=>{ await window.BW.EXT.library.newDocument(); return window.BW.S.svc })()');
  const l0 = launches().length;
  await P3.ev(`${SH}.querySelector('dialog.bw-resume .main li .one').click()`);
  await sleep(4000);
  const svc3b = await P3.ev('window.BW.S.svc');
  const L3 = launches().slice(l0);
  check('D3: the tab keeps its document, and the resumed one gets a window of its own', svc3b === svc3 && L3.length === 1 && L3[0].args.some((a) => /tab=seedb/.test(a)), `${svc3} -> ${svc3b}; ${JSON.stringify(L3).slice(0, 200)}`);

  // D4: dismissResume and claim as editor actions
  seed('20261022-080000-abc013', 3, 'c');
  const P4 = await popup();
  await dlgOpen(P4);
  const id4 = await tabIdOf(P4);
  const dm = await call('action', id4, undefined, { id: 'dismissResume' });
  check('D4: editor_action dismissResume closes the popup', dm.status === 200 && dm.j?.result?.dismissed === true && !!(await dlgGone(P4)), JSON.stringify(dm).slice(0, 200) + ' direct=' + await P4.ev("Promise.race([window.BW.bridge('action', undefined, { id: 'dismissResume' }).then((r) => JSON.stringify(r), (e) => 'ERR ' + (e.bw || '') + ' ' + e.message), new Promise((r) => setTimeout(() => r('hung'), 4000))])"));
  const svc4 = await P4.ev('(async()=>{ await window.BW.EXT.library.newDocument(); return window.BW.S.svc })()');
  await until(async () => (await health()).tabs.find((t) => t.tab === id4)?.owns?.includes(svc4), 10000);
  const cl = await call('action', id4, svc4, { id: 'claim' });
  check('D4: editor_action claim takes the document\'s lease for the tab (answered ok, the host says this tab owns it)', cl.status === 200 && cl.j?.result?.owner === id4 && (await health()).leases?.[svc4] === id4, JSON.stringify(cl).slice(0, 300));

  // D5: a window an agent opens
  const l5 = launches().length;
  process.env.BW_AGENT_OPEN = '1';
  H.launchBrowser(['http://127.0.0.1:1/', 'http://127.0.0.1:2/?x=1']);
  delete process.env.BW_AGENT_OPEN;
  const a5 = launches().slice(l5)[0]?.args || [];
  check('D5: an agent\'s window is an automation tab (no popup) and carries the no-restore flags', a5.filter((a) => /automation=1/.test(a)).length === 2 && a5.includes('--disable-session-crashed-bubble') && a5.includes('--hide-crash-restore-bubble'), a5.join(' ').slice(0, 400));

  // D6: a frozen SharedWorker must not hold the tabs
  const F = P1; const G = P4;
  const idF = await tabIdOf(F), idG = await tabIdOf(G);
  const sw = (await list()).find((t) => t.type === 'shared_worker');
  check('D6 setup: the session SharedWorker is listed as a target (positive sample)', !!sw);
  const SW = tab(sw.webSocketDebuggerUrl);
  await SW.send('Debugger.enable');
  void SW.send('Debugger.pause'); // the worker thread stops: no list, no ping, no events for anyone
  await sleep(12000);
  const hz = await health();
  const rz = (t) => hz.tabs.find((x) => x.tab === t);
  check('D6: with the shared worker frozen, tabs still read awake (each beats on its own)', rz(idF)?.asleep === false && rz(idG)?.asleep === false, JSON.stringify([rz(idF), rz(idG)]).slice(0, 300));
  let lastR = null;
  const viaOwn = await until(async () => { lastR = await call('list', idG, undefined, {}); return lastR.status === 200 ? lastR : false; }, 40000, 1000);
  check('D6: a tool\'s request still reaches a tab (it listens by itself once the worker is silent)', !!viaOwn, JSON.stringify(lastR).slice(0, 60)  + ' ' + await G.ev('window.BW.EXT.session.transport + " silent=" + window.BW.EXT.session.silentMs + " rescuing=" + window.BW.EXT.session.rescuing + " reqSeen=" + document.documentElement.dataset.bwReqSeen') + ' ' + await G.ev("window.BW.whenReady(1500).then(() => 'ready', (e) => e.message.slice(0, 120))") + ' list-direct=' + await G.ev("(async () => { const t0 = Date.now(); try { await Promise.race([window.BW.bridge('list', undefined, {}), new Promise((r) => setTimeout(() => r('hung'), 6000))]); } catch (e) { return 'ERR ' + e.message; } return (Date.now() - t0) + ' ms'; })()"));
  await SW.send('Debugger.resume');
  SW.close();
} catch (e) {
  check('the run completed without an exception', false, e?.stack || e);
} finally {
  for (const c of pages) c.close();
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { await H.stop(); } catch { /* none */ }
}
await sleep(500);
check('nothing left running: the host is stopped and Chrome\'s process tree is gone', H.status().running === false && !(chrome?.pid && H.alive(chrome.pid)));
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\ndialog-0160: all ${out.length} checks passed`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a lock */ }
process.exit(failed ? 1 : 0);
