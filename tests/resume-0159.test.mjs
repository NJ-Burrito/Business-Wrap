// 0.15.9 R1-R6 (owner request, 2026-11-02): the «continue where you left off» popup. REAL Google Chrome (CDP, real keyboard events), a REAL host, the real MCP server.
//   R1  the last session's documents as a list (title, last-edited time, language): tick several, or press one to open it alone; the others stay offered
//   R2  70 documents: the list scrolls, a search box filters, select all / clear act on what is shown; opening 65 stays within the host's launch chunks (30 per command line)
//   R3  «continue all»
//   R4  «open an older document» lists the save folder's Documents, newest first, searchable, and opens one; a new blank document stays available
//   R5  plain AR + EN words (every key in both languages), keyboard (focus in the search box, Tab moves on, Esc closes and changes nothing), screen reader names, the page font
//   R6  a tool's ?automation=1 tab never sees it; the MCP tools recent_documents / open_recent_document read and open from the same list
//   node tests/resume-0159.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, chooseBrowser } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-resume0159-'));
const stub = path.join(tmp, 'launches.jsonl');
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BROWSER_STUB: stub };
fs.mkdirSync(env.BW_WORKSPACE, { recursive: true });
Object.assign(process.env, env);
const H = await import('../engine/host.mjs');
const W = await import('../engine/workspace.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  resume-0159: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };
const br = chooseBrowser({ env: { BW_BROWSER: 'chrome' }, saved: '' });
if (!br || br.id !== 'chrome') { console.log('SKIP resume-0159: Google Chrome is not installed here'); process.exit(0); }
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

function tab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const open = new Promise((ok) => { ws.onopen = ok; });
  return {
    async send(method, params = {}) { await open; return new Promise((ok) => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); }); },
    async ev(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; },
    async key(key, code, vk) { for (const type of ['keyDown', 'keyUp']) await this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk }); },
    close() { try { ws.close(); } catch { /* closed */ } },
  };
}
const launches = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const urlsIn = (l) => (l.args || []).filter((a) => a.startsWith('http'));

let host = null, chrome = null, client = null;
const pages = [];
try {
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'resume0159', watermarkDir: null });
  host = await H.start({ editor, port: 4860, open: false });
  const base = host.url;
  const cdp = await freePort();
  chrome = spawn(br.exe, [`--user-data-dir=${path.join(tmp, 'chrome-profile')}`, `--remote-debugging-port=${cdp}`, '--no-first-run', '--no-default-browser-check', '--new-window', `${base}?automation=1&t=S`], { stdio: 'ignore' });
  const list = async () => (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json()).filter((t) => t.type === 'page');
  const attach = async (match) => { const t = await until(async () => (await list()).find((x) => match(x.url) && !pages.some((p) => p.id === x.id)), 40000); if (!t) throw new Error('tab not found'); const c = Object.assign(tab(t.webSocketDebuggerUrl), { id: t.id }); pages.push(c); return c; };
  const booted = (c) => until(async () => (await c.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true, 60000);
  const S = await attach((u) => u.includes('t=S'));
  check('Chrome started; the seed tab (a tool\'s automation tab) booted', !!(await booted(S)));
  const entry = JSON.parse(await S.ev('(async()=>{ await window.BW.EXT.library.newDocument(); const all = await window.BW.EXT.library.all(); return JSON.stringify(all[0]) })()'));
  check('a real library entry to seed the sessions with (positive sample)', !!entry?.id && !!entry.editions, Object.keys(entry || {}).join());

  // seed: a previous run with N documents (real session records), and older documents in the save folder
  const sessions = W.subdir(W.ensure(W.workspace()).dirs, 'sessions');
  const seed = (runId, n, tag, t0 = Date.parse('2026-10-20T08:00:00Z')) => {
    const dir = path.join(sessions, runId); fs.mkdirSync(dir, { recursive: true });
    const made = [];
    for (let i = 0; i < n; i++) {
      const ar = i % 2 === 0, tabId = `seed${tag}${String(i).padStart(3, '0')}`, svc = `doc-seed${tag}-${String(i).padStart(4, '0')}`;
      const title = ar ? `تقرير المشروع ${i}` : `Project report ${i}`;
      const e = { ...JSON.parse(JSON.stringify(entry)), id: svc, title };
      fs.writeFileSync(path.join(dir, `${tabId}.json`), JSON.stringify({ tab: tabId, title, svc, ed: ar ? 'ar' : 'en', at: new Date(t0 + i * 60000).toISOString(), entry: e, snap: null }));
      made.push({ tab: tabId, svc, title, ed: ar ? 'ar' : 'en', i });
    }
    return made;
  };
  const N = 70;
  let seeds = seed('20261020-080000-abc001', N, 'a');
  const docsDir = W.workspace().dirs.docs;
  const old = [['Old Alpha', 'Old Alpha'], ['خطة قديمة', 'خطة قديمة']];
  old.forEach(([folder, name], k) => { const f = path.join(docsDir, folder); fs.mkdirSync(f, { recursive: true }); buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: path.join(f, `${name}.html`), set: `old${k}`, watermarkDir: null }); const t = new Date(Date.parse('2026-09-01T10:00:00Z') + k * 86400000); fs.utimesSync(path.join(f, `${name}.html`), t, t); });

  const lastNow = async () => (await fetch(`${base}api/session/last`)).json();
  check('the host sees the seeded last session (70 tabs, newest first)', (await lastNow()).tabs?.length === N, JSON.stringify(await lastNow()).slice(0, 120));
  const popup = async () => {
    const c = await (async () => { await fetch(`http://127.0.0.1:${cdp}/json/new?${base}`, { method: 'PUT' }); return attach((u) => u === base || u === base.replace(/\/$/, '')); })();
    return c;
  };
  const dlgReady = (c) => until(async () => (await c.ev("document.documentElement.dataset.bwResume === 'asked' && !!document.querySelector('dialog.bw-resume[open]')")) === true, 60000);
  const q = (c, js) => c.ev(`(()=>{ const d = document.querySelector('dialog.bw-resume'); return ${js} })()`);

  // R1: the list
  let P = await popup();
  check('R1: the popup opened on its own (ready state: data-bw-resume=asked and the dialog is open)', !!(await dlgReady(P)));
  const rows = JSON.parse(await q(P, "JSON.stringify([...d.querySelectorAll('.main li')].slice(0,3).map(li=>({ti:li.querySelector('.ti').textContent, me:li.querySelector('.me').textContent, label:li.querySelector('input').getAttribute('aria-label'), one:li.querySelector('.one').getAttribute('aria-label')})))"));
  const n1 = await q(P, "d.querySelectorAll('.main li').length");
  check('R1: all 70 documents are listed, each with a title, a last-edited time and a language', n1 === N && rows.every((r) => r.ti && /\d/.test(r.me) && /(عربي|إنجليزي|Arabic|English)/.test(r.me)), JSON.stringify(rows));
  check('R1: newest first (the record edited last is on top)', rows[0].ti.includes(String(N - 1)), rows[0].ti);
  const first = seeds[N - 1];
  const before = launches().length;
  await q(P, "d.querySelector('.main li .one').click()");
  const alone = await until(async () => (await P.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true && (await P.ev('window.BW.S.svc')) === first.svc, 60000);
  check('R1: pressing one document opens it alone (this tab becomes it; no other window is launched)', !!alone && launches().length === before, await P.ev('window.BW && window.BW.S.svc'));
  check('R1: the other 69 stay offered for the next start', (await lastNow()).tabs?.length === N - 1);

  // R2 + R1 (several): search, select all, clear, scroll
  P = await popup();
  await dlgReady(P);
  const sc = JSON.parse(await q(P, "JSON.stringify({ox: getComputedStyle(d.querySelector('.main .list')).overflowY, sh: d.querySelector('.main .list').scrollHeight, ch: d.querySelector('.main .list').clientHeight})"));
  check('R2: with 69 documents the list scrolls (it does not stretch the dialog)', sc.ox === 'auto' && sc.sh > sc.ch, JSON.stringify(sc));
  const ardocs = seeds.filter((x) => x.ed === 'ar' && x.i !== N - 1).length;
  await q(P, "(()=>{ const i = d.querySelector('.q'); i.value = 'تقرير'; i.dispatchEvent(new Event('input', {bubbles:true})); return 1 })()");
  const shownAr = await q(P, "[...d.querySelectorAll('.main li')].filter(li=>!li.hidden).length");
  check('R2: the search box shows only matching documents (Arabic text)', shownAr === ardocs, `${shownAr} vs ${ardocs}`);
  await q(P, "d.querySelector('[data-s=all]').click()");
  const ticked = await q(P, "[...d.querySelectorAll('.main li')].filter(li=>li.querySelector('input').checked).length");
  check('R2: select all ticks what the search shows, and the primary button counts them', ticked === ardocs && (await q(P, "d.querySelector('[data-s=sel]').textContent")).includes(String(ardocs)), String(ticked));
  await q(P, "d.querySelector('[data-s=none]').click()");
  check('R2: clear unticks everything and disables «continue selected»', (await q(P, "[...d.querySelectorAll('.main li input')].filter(i=>i.checked).length")) === 0 && (await q(P, "d.querySelector('[data-s=sel]').disabled")) === true);
  await q(P, "(()=>{ const i = d.querySelector('.q'); i.value = ''; i.dispatchEvent(new Event('input', {bubbles:true})); const c = d.querySelectorAll('.main li input'); c[1].click(); c[2].click(); c[3].click(); return 1 })()");
  const pickedTabs = JSON.parse(await q(P, "JSON.stringify([...d.querySelectorAll('.main li')].filter(li=>li.querySelector('input').checked).map(li=>li.dataset.tab))"));
  check('R1: several can be ticked at once; the button says how many', pickedTabs.length === 3 && (await q(P, "d.querySelector('[data-s=sel]').textContent")).includes('3'));
  const b2 = launches().length;
  await q(P, "d.querySelector('[data-s=sel]').click()");
  const moved = await until(async () => (await lastNow()).tabs?.length === N - 1 - 3, 20000);
  const l2 = launches().slice(b2);
  check('R1: «continue selected» opens exactly the 3 (this tab is the first, 2 windows launched) and leaves 66 offered', !!moved && l2.length === 1 && urlsIn(l2[0]).length === 2 && pickedTabs.slice(1).every((id) => urlsIn(l2[0]).some((u) => u.includes(`tab=${id}`))), JSON.stringify(l2).slice(0, 200));

  // R3 + R2 (chunks): continue all
  P = await popup();
  await dlgReady(P);
  const b3 = launches().length;
  check('R3: the «continue all» button names the number', (await q(P, "d.querySelector('[data-s=every]').textContent")).includes('66'));
  await q(P, "d.querySelector('[data-s=every]').click()");
  const none = await until(async () => (await lastNow()).tabs?.length === 0, 20000);
  const l3 = launches().slice(b3);
  check('R3: continue all opens every document and clears the offer', !!none && l3.reduce((n, l) => n + urlsIn(l).length, 0) === 65, JSON.stringify(l3.map((l) => urlsIn(l).length)));
  check('R2: 65 windows go out in the host\'s chunks of at most 30 per command line (3 launches)', l3.length === 3 && l3.every((l) => urlsIn(l).length <= 30), JSON.stringify(l3.map((l) => urlsIn(l).length)));

  // R4: older documents + new blank document
  seeds = seed('20261021-080000-abc002', 12, 'b');
  P = await popup();
  await dlgReady(P);
  await q(P, "d.querySelector('[data-s=older]').click()");
  const olderRows = await until(async () => { const r = JSON.parse(await q(P, "JSON.stringify([...d.querySelectorAll('.olist .ti')].map(x=>x.textContent))")); return r.length >= 2 ? r : false; }, 15000);
  check('R4: «open an older document» lists the save folder\'s Documents, newest first', Array.isArray(olderRows) && olderRows[0] === 'خطة قديمة' && olderRows[1] === 'Old Alpha', JSON.stringify(olderRows));
  await q(P, "(()=>{ const i = d.querySelector('.oq'); i.value = 'alpha'; i.dispatchEvent(new Event('input', {bubbles:true})); return 1 })()");
  const filt = await until(async () => { const r = JSON.parse(await q(P, "JSON.stringify([...d.querySelectorAll('.olist .ti')].map(x=>x.textContent))")); return r.length === 1 ? r : false; }, 10000);
  check('R4: the older list is searchable by name', JSON.stringify(filt) === JSON.stringify(['Old Alpha']), JSON.stringify(filt));
  const libBefore = await P.ev('window.BW.EXT.library.all().then(a=>a.length)');
  await q(P, "d.querySelector('.olist .one').click()");
  const imported = await until(async () => (await P.ev('window.BW.EXT.library.all().then(a=>a.length)')) > libBefore, 30000);
  check('R4: pressing an older document opens it (it is in the library and the popup closes)', !!imported && (await until(async () => (await P.ev("!document.querySelector('dialog.bw-resume')")) === true, 8000)), `${libBefore} -> ${await P.ev('window.BW.EXT.library.all().then(a=>a.length)')}`);
  check('R4: the last session is untouched by opening an older document (12 still offered)', (await lastNow()).tabs?.length === 12);

  // R5: words, keyboard, names, font; closing leaves work safe
  P = await popup();
  await dlgReady(P);
  const i18n = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', '12-session.i18n.json'), 'utf8'));
  const keys = Object.keys(i18n.en).filter((k) => /^res/.test(k));
  check('R5: every popup word exists in Arabic and English (non-empty)', keys.length >= 20 && keys.every((k) => String(i18n.ar[k] || '').length > 0 && String(i18n.en[k] || '').length > 0), keys.join());
  const raw = await q(P, "/res[A-Z][A-Za-z]+/.test(d.textContent)");
  check('R5: no raw key shows in the dialog', raw === false);
  check('R5: the dialog is labelled by its heading and every control has a name', (await q(P, "!!document.getElementById(d.getAttribute('aria-labelledby')) && [...d.querySelectorAll('input,button')].every(x => (x.getAttribute('aria-label') || x.textContent || '').trim().length > 0)")) === true);
  check('R5: keyboard: focus starts in the search box', (await q(P, "document.activeElement === d.querySelector('.q')")) === true);
  await P.key('Tab', 'Tab', 9);
  check('R5: Tab moves on inside the dialog', (await q(P, "d.contains(document.activeElement) && document.activeElement !== d.querySelector('.q')")) === true);
  const font = await q(P, "({ d: getComputedStyle(d).fontFamily, b: getComputedStyle(document.body).fontFamily })");
  check('R5: the dialog uses the page font (Thmanyah where the page does)', font.d === font.b || /thmanyah/i.test(font.d), JSON.stringify(font));
  const nBefore = (await lastNow()).tabs?.length;
  await P.key('Escape', 'Escape', 27);
  const closed = await until(async () => (await P.ev("!document.querySelector('dialog.bw-resume[open]')")) === true, 5000);
  check('R5: Esc closes it and changes nothing (the 12 documents stay offered, the tab is usable)', !!closed && (await lastNow()).tabs?.length === nBefore && nBefore === 12);
  P = await popup();
  await dlgReady(P);
  await q(P, "d.querySelector('[data-s=later]').click()");
  check('R5: «not now» closes it and changes nothing', (await until(async () => (await P.ev("!document.querySelector('dialog.bw-resume[open]')")) === true, 5000)) && (await lastNow()).tabs?.length === 12);
  P = await popup();
  await dlgReady(P);
  await q(P, "d.querySelector('[data-s=new]').click()");
  const fresh = await until(async () => (await lastNow()).tabs?.length === 0, 15000);
  check('R4: a new blank document stays available (the offer is put away, the dialog closes)', !!fresh && (await P.ev("!document.querySelector('dialog.bw-resume')")) === true);

  // R6: an automation tab never sees it; MCP reads and opens the same list
  seeds = seed('20261022-080000-abc003', 5, 'c');
  const A = await (async () => { await fetch(`http://127.0.0.1:${cdp}/json/new?${base}?automation=1&t=Z`, { method: 'PUT' }); return attach((u) => u.includes('t=Z')); })();
  await booted(A);
  await sleep(2500);
  check('R6: a tool\'s automation tab never sees the popup (booted, 5 documents waiting, no dialog)', (await A.ev("!document.querySelector('dialog.bw-resume') && !document.documentElement.dataset.bwResume")) === true && (await lastNow()).tabs?.length === 5);
  client = new Client({ name: 'resume-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check('R6: the MCP server offers recent_documents and open_recent_document', tools.includes('recent_documents') && tools.includes('open_recent_document'), tools.join());
  const data = (r) => r.structuredContent ?? JSON.parse(r.content?.[0]?.text || 'null');
  const rec = data(await client.callTool({ name: 'recent_documents', arguments: {} }));
  check('R6: recent_documents returns the same list (5 documents with title, time and language; the 2 older ones)', rec.last?.tabs?.length === 5 && rec.last.tabs.every((x) => x.title && x.at && x.ed) && rec.older?.length === 2, JSON.stringify(rec).slice(0, 240));
  const flt = data(await client.callTool({ name: 'recent_documents', arguments: { query: 'خطة' } }));
  check('R6: the older list can be filtered by name', flt.older?.length === 1 && flt.older[0].name === 'خطة قديمة');
  const b6 = launches().length;
  const op = await client.callTool({ name: 'open_recent_document', arguments: { tabs: [rec.last.tabs[0].tab, rec.last.tabs[1].tab] } });
  const l6 = launches().slice(b6);
  check('R6: open_recent_document opens exactly the chosen documents and leaves the rest offered', !op.isError && l6.length === 1 && urlsIn(l6[0]).length === 2 && (await lastNow()).tabs?.length === 3, JSON.stringify(op).slice(0, 200));
  const nohost = await client.callTool({ name: 'open_recent_document', arguments: {} });
  check('R6: asking to open nothing is refused with a plain message', nohost.isError === true);
} catch (e) {
  check('the run completed without an exception', false, e?.stack || e);
} finally {
  try { await client?.close(); } catch { /* closed */ }
  for (const c of pages) c.close();
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { await H.stop(); } catch { /* none */ }
}
await sleep(500);
check('nothing left running: the host is stopped and Chrome\'s process tree is gone', H.status().running === false && !(chrome?.pid && H.alive(chrome.pid)));
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nresume-0159: all ${out.length} checks passed`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a lock: the OS temp is cleaned later */ }
process.exit(failed ? 1 : 0);
