// 0.15.0 L1 transport: ONE server-sent-event connection per browser, however many tabs (Edge/Chrome allow 6 HTTP/1.1 connections per
// origin; the 7th tab used to hang on its first fetch, report B1). Real Edge (msedge), real host on loopback HTTP/1.1.
//   1. 12 tabs open: all reach bwSession, GET /api/host/health lists 12 tabs and exactly 1 client (written red first: it failed at tab 7)
//   2. the four SSE events reach the right tab (req by tab) or all tabs (ingest, progress); /api/host/stop delivers flush to every tab
//   3. closing every tab stops the host within the idle window (the last-connection rule is kept)
//   4. fallback (no SharedWorker): BroadcastChannel + Web Locks, one leader holds the one connection; kill the leader, another takes over
//   5. ?automation=1: no resume dialog, ever; without it the resume dialog still shows
//   node tests/transport-0150.test.mjs      (TRANSPORT_BROWSER=chromium to use the bundled Chrome instead of Edge)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-transport-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_IDLE_MS = '1500';
fs.mkdirSync(process.env.BW_WORKSPACE);
const H = await import('../engine/host.mjs');
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { try { if (await fn()) return true; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  transport: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };
const N = 12;

const editor = path.join(tmp, 'transport.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'transport', watermarkDir: null });
const edge = H.edgePath();
const opts = process.env.TRANSPORT_BROWSER === 'chromium' || !edge ? launchOptions() : { ...launchOptions(), executablePath: edge };
check('browser under test is real Edge (msedge)', !!edge && /msedge|microsoft-edge/i.test(String(opts.executablePath)) || process.env.TRANSPORT_BROWSER === 'chromium', String(opts.executablePath));
const browser = await chromium.launch(opts);
const health = async (h) => (await fetch(h.url + 'api/host/health', { signal: AbortSignal.timeout(4000) })).json();
const emit = (h, body) => fetch(h.url + 'api/session/_emit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const INIT = () => { window.__srv = []; window.addEventListener('bw:srv', (e) => window.__srv.push({ event: e.detail.event, data: e.detail.data })); };
const open = async (ctx, url) => {
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 15000 });
  return p;
};
const got = (p, event) => p.evaluate((ev) => window.__srv.filter((x) => x.event === ev).length, event);
const gone = async (pid, ms) => until(() => !H.alive(pid), ms);

async function scenario(label, { fallback }) {
  const h = await H.start({ editor, port: await freePort(), open: false });
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  await ctx.addInitScript(INIT);
  if (fallback) await ctx.addInitScript(() => { try { Object.defineProperty(window, 'SharedWorker', { value: undefined, configurable: true }); } catch { window.SharedWorker = undefined; } });
  const pages = [];
  let reached = 0;
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    try { pages.push(await open(ctx, h.url + `?tab=tab${label}${String(i).padStart(2, '0')}x`)); reached += 1; } catch { break; }
  }
  check(`${label}: all ${N} tabs reach bwSession (${Date.now() - t0} ms)`, reached === N, `only ${reached} of ${N} tabs booted (the 7th hangs behind 6 open event streams)`);
  if (reached < N) { for (const p of pages) await p.close().catch(() => {}); await ctx.close(); await H.stop(); return; }
  await until(async () => (await health(h)).tabs.length === N, 8000); // the registry settles within a beat (3 s)
  const hl = await health(h).catch((e) => ({ err: String(e.message) }));
  check(`${label}: /api/host/health schema`, hl.ok === true && typeof hl.version === 'string' && Number.isInteger(hl.pid) && typeof hl.uptimeS === 'number' && Array.isArray(hl.clients) && Array.isArray(hl.tabs) && typeof hl.pendingRequests === 'number' && Array.isArray(hl.warnings) && 'workspace' in hl, JSON.stringify(hl).slice(0, 300));
  check(`${label}: health lists ${N} live tabs`, hl.tabs?.length === N && hl.tabs.every((t) => t.live && typeof t.lastBeatMs === 'number'), `tabs=${hl.tabs?.length}`);
  check(`${label}: exactly 1 client, 1 connection`, hl.clients?.length === 1 && hl.clients[0].conns === 1 && hl.clients[0].tabs.length === N, JSON.stringify(hl.clients));
  const modes = await Promise.all(pages.map((p) => p.evaluate(() => window.BW.EXT.session.transport)));
  check(`${label}: transport seen by the pages (positive sample)`, fallback ? modes.filter((m) => m === 'leader').length === 1 && modes.filter((m) => m === 'follower').length === N - 1 : modes.every((m) => m === 'shared'), JSON.stringify(modes));
  // events: req goes to one tab, ingest to all
  const target = hl.tabs[3].tab;
  const idx = pages.findIndex((p) => p.url().includes(`tab=${target}`));
  await emit(h, { event: 'req', tab: target, data: { id: 'r1', tool: 'ping', args: {} } });
  await emit(h, { event: 'ingest', data: { doc: 'doc-x' } });
  await emit(h, { event: 'progress', data: { job: 'j1', pct: 50 } });
  await until(async () => (await Promise.all(pages.map((p) => got(p, 'ingest')))).every((n) => n === 1), 4000);
  const reqs = await Promise.all(pages.map((p) => got(p, 'req')));
  const ing = await Promise.all(pages.map((p) => got(p, 'ingest')));
  const prog = await Promise.all(pages.map((p) => got(p, 'progress')));
  check(`${label}: req reaches only its tab`, idx >= 0 && reqs[idx] === 1 && reqs.reduce((a, b) => a + b, 0) === 1, JSON.stringify(reqs));
  check(`${label}: ingest and progress reach every tab`, ing.every((n) => n === 1) && prog.every((n) => n === 1), JSON.stringify({ ing, prog }));
  if (fallback) {
    // kill the leader: another tab takes the lock, one client again, req still arrives
    const li = modes.findIndex((m) => m === 'leader');
    await pages[li].close({ runBeforeUnload: true });
    pages.splice(li, 1);
    const ok = await until(async () => { const x = await health(h); return x.tabs.length === N - 1 && x.clients.length === 1 && x.clients[0].conns === 1; }, 12000);
    const x = await health(h);
    check(`${label}: leader closed, a follower takes over (1 client, ${N - 1} tabs)`, ok, JSON.stringify({ tabs: x.tabs.length, clients: x.clients }));
    const t2 = x.tabs[0].tab;
    const i2 = pages.findIndex((p) => p.url().includes(`tab=${t2}`));
    await emit(h, { event: 'req', tab: t2, data: { id: 'r2', tool: 'ping', args: {} } });
    check(`${label}: req still arrives after the takeover`, await until(async () => (await got(pages[i2], 'req')) === 1, 6000));
  }
  // stop: flush to every remaining tab
  const before = await Promise.all(pages.map((p) => got(p, 'flush')));
  const token = H.hostState()?.token;
  const st = await fetch(h.url + 'api/host/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
  await until(async () => (await Promise.all(pages.map((p) => got(p, 'flush')))).every((n, i) => n > before[i]), 3000);
  const after = await Promise.all(pages.map((p) => got(p, 'flush')));
  check(`${label}: /api/host/stop delivers flush to every tab`, st.status === 200 && after.every((n, i) => n > before[i]), JSON.stringify({ before, after }));
  const ended = await gone(h.pid, 10000);
  check(`${label}: the host exits after stop`, ended);
  for (const p of pages) await p.close().catch(() => {});
  await ctx.close();
  await H.stop();
}

async function closing() {
  const h = await H.start({ editor, port: await freePort(), open: false });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  const pages = [];
  for (let i = 0; i < N; i++) pages.push(await open(ctx, h.url + `?tab=tabclose${String(i).padStart(2, '0')}x`));
  await sleep(500);
  for (const p of pages) await p.close({ runBeforeUnload: true });
  const t0 = Date.now();
  const ended = await gone(h.pid, 12000);
  check(`close every tab: the host stops (${Date.now() - t0} ms after the last)`, ended);
  const sess = path.join(tmp, 'ws', 'Business-Wrap', '.system', 'sessions');
  const run = fs.existsSync(sess) ? fs.readdirSync(sess).filter((d) => d !== 'archive')[0] : null;
  const files = run ? fs.readdirSync(path.join(sess, run)).filter((f) => f.endsWith('.json') && f !== 'run.json') : [];
  check(`close every tab: run.json written, ${N} tab records kept (none dropped by the closing wave)`, !!run && fs.existsSync(path.join(sess, run, 'run.json')) && files.length === N, `${files.length} records`);
  await ctx.close();
  await H.stop();
}


async function lostBye(label, { fallback }) {
  // the bye of a closing tab is lost (the message dropped): the dead tab must still leave the registry and, as the last one, the host must still stop
  const h = await H.start({ editor, port: await freePort(), open: false });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  if (fallback) await ctx.addInitScript(() => { try { Object.defineProperty(window, 'SharedWorker', { value: undefined, configurable: true }); } catch { window.SharedWorker = undefined; } });
  const a = await open(ctx, h.url + '?tab=tablost00x');
  await a.waitForFunction(() => ['shared', 'leader'].includes(window.BW.EXT.session.transport), null, { timeout: 8000 });
  const b = await ctx.newPage();
  await b.addInitScript(() => { const o = MessagePort.prototype.postMessage; MessagePort.prototype.postMessage = function (m, ...r) { if (m && m.t === 'bye') return; return o.call(this, m, ...r); }; const c = BroadcastChannel.prototype.postMessage; BroadcastChannel.prototype.postMessage = function (m, ...r) { if (m && m.t === 'bye') return; return c.call(this, m, ...r); }; });
  await b.goto(h.url + '?tab=tablost01x');
  await b.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 15000 });
  await until(async () => (await health(h)).tabs.length === 2, 8000);
  await b.close({ runBeforeUnload: true });
  const dropped = await until(async () => (await health(h)).tabs.length === 1, 20000);
  check(`${label}: a tab whose bye was lost still leaves the registry (Web Lock gone)`, dropped, JSON.stringify((await health(h)).tabs.map((t) => t.tab)));
  await a.close({ runBeforeUnload: true });
  await ctx.close();
  check(`${label}: and the last tab closing still stops the host`, await gone(h.pid, 12000));
  await H.stop();
}

async function latePush() {
  // data-loss guard (0.15.0): a state push still in flight must never overwrite the newer pagehide/flush delta of the same tab
  const h = await H.start({ editor, port: await freePort(), open: false });
  const sess = path.join(tmp, 'ws', 'Business-Wrap', '.system', 'sessions');
  const rec = (tab) => { for (const r of fs.readdirSync(sess).filter((d) => d !== 'archive').sort().reverse()) { const f = path.join(sess, r, `${tab}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')); } return null; };
  const post = (u, b) => fetch(h.url + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  const entry = (n) => ({ id: 'doc-late0001', editions: { ar: { raw: 'x', ops: Array.from({ length: n }, (_, i) => ({ id: `o${i}`, value: `v${i}` })) } } });
  const T = 'tablate00x';
  // server level: full(seq 10, 2 ops) -> delta(seq 20, +1 op) -> a LATE older full(seq 15, 2 ops) must be dropped
  await post('api/session/state', { tab: T, seq: 10, title: 't', svc: 'doc-late0001', ed: 'ar', entry: entry(2), snap: null });
  await post('api/session/flush', { tab: T, seq: 20, svc: 'doc-late0001', ed: 'ar', title: 't', delta: { ar: { from: 2, prev: 'o1', ops: [{ id: 'o2', value: 'v2' }] } } });
  const late = await post('api/session/state', { tab: T, seq: 15, title: 't', svc: 'doc-late0001', ed: 'ar', entry: entry(2), snap: null });
  check('server: a late older push is dropped, the newer delta stays (3 ops)', rec(T)?.entry?.editions?.ar?.ops?.length === 3 && late.stale === true, JSON.stringify({ ops: rec(T)?.entry?.editions?.ar?.ops?.length, late }));
  const newer = await post('api/session/state', { tab: T, seq: 30, title: 't', svc: 'doc-late0001', ed: 'ar', entry: entry(4), snap: null });
  check('server: a newer push is applied (4 ops) and a push without seq (older page) is still applied', rec(T)?.entry?.editions?.ar?.ops?.length === 4 && !newer.stale && (await post('api/session/state', { tab: T, title: 't', svc: 'doc-late0001', ed: 'ar', entry: entry(1), snap: null })).ok && rec(T)?.entry?.editions?.ar?.ops?.length === 1);
  // the tab registry too: a late older list of one client (still on the wire when the list without a closed tab landed) must not bring the tab back
  const sse = await fetch(h.url + 'api/session/live?client=cseqtest0', { headers: { accept: 'text/event-stream' } });
  await post('api/session/tabs', { client: 'cseqtest0', seq: 5, tabs: ['tabseq00x', 'tabseq01x'] });
  await post('api/session/tabs', { client: 'cseqtest0', seq: 7, tabs: ['tabseq00x'] });
  const lateList = await post('api/session/tabs', { client: 'cseqtest0', seq: 6, tabs: ['tabseq00x', 'tabseq01x'] });
  const hl2 = await health(h);
  check('server: a late older tab list is dropped (the closed tab stays gone)', lateList.stale === true && hl2.tabs.filter((t) => t.tab.startsWith('tabseq')).length === 1, JSON.stringify({ lateList, tabs: hl2.tabs.map((t) => t.tab) }));
  await sse.body.cancel().catch(() => {});
  // real page: hold the 0.4 s state push in flight, type more, flush (the pagehide path), then let the older push land
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  let hold = false;
  const held = [];
  await ctx.route('**/api/session/state', (route) => { if (hold) held.push(route); else route.continue(); });
  const pg = await open(ctx, h.url + '?tab=tablate01x');
  await sleep(700);
  hold = true;
  await pg.evaluate(() => window.BW.setText('/chapters/0/title', 'OLDER-PUSH'));
  const heldOk = await until(() => held.length > 0, 4000); // positive sample: the push is on the wire and stalled
  await pg.evaluate(() => window.BW.setText('/chapters/0/title', 'NEWER-FLUSH-TEXT'));
  await pg.evaluate(() => window.BW.EXT.session.flush());
  await sleep(700);
  hold = false;
  for (const r of held) await r.continue().catch(() => {}); // the older push arrives AFTER the flush
  // wait on the real state, not a clock: under full-suite load the flush beacon and the released push land seconds late
  await until(() => JSON.stringify(rec('tablate01x') || {}).includes('NEWER-FLUSH-TEXT'), 20000);
  await sleep(1500); // the released older push has had time to land after it: it must not have replaced the newer text
  const txt = JSON.stringify(rec('tablate01x') || {});
  check('page: the older push was held in flight (positive sample)', heldOk);
  check('page: the flushed latest text survives the late older push', txt.includes('NEWER-FLUSH-TEXT') && !txt.includes('OLDER-PUSH'), txt.slice(0, 200));
  await pg.close().catch(() => {});
  await ctx.close();
  await H.stop();
}

async function automation() {
  // a stored previous run exists → a plain tab asks; an automation tab never does
  const h = await H.start({ editor, port: await freePort(), open: false });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  const a = await open(ctx, h.url + '?tab=tabauto01x');
  await a.evaluate(() => window.BW.setText('/chapters/0/title', 'automation seed'));
  await sleep(900);
  await a.close({ runBeforeUnload: true });
  await ctx.close();
  await gone(h.pid, 10000);
  const h2 = await H.start({ editor, port: await freePort(), open: false });
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* none */ } });
  const plain = await ctx2.newPage();
  await plain.goto(h2.url);
  const asked = await plain.waitForFunction(() => document.documentElement.dataset.bwResume === 'asked' && document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('dialog.bw-resume'), null, { timeout: 10000 }).then(() => true).catch(() => false);
  check('without ?automation=1 the resume dialog still shows (regression)', asked);
  const auto = await ctx2.newPage();
  await auto.goto(h2.url + '?automation=1');
  await auto.waitForFunction(() => document.documentElement.dataset.bwSession, null, { timeout: 15000 });
  await sleep(3000);
  const dlg = await auto.evaluate(() => ({ dlg: !!document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('dialog.bw-resume'), flag: document.documentElement.dataset.bwAutomation, resume: document.documentElement.dataset.bwResume || null }));
  check('with ?automation=1 no resume dialog for 3 s, flag set, booted (positive: bwSession present)', !dlg.dlg && dlg.flag === '1' && !dlg.resume, JSON.stringify(dlg));
  const hl = await health(h2);
  check('health marks the automation tab', hl.tabs.some((t) => t.automation === true), JSON.stringify(hl.tabs));
  await ctx2.close();
  await gone(h2.pid, 10000);
  await H.stop();
}

try {
  await scenario('shared', { fallback: false });
  await scenario('fallback', { fallback: true });
  await closing();
  await lostBye('lost bye (shared)', { fallback: false });
  await lostBye('lost bye (fallback)', { fallback: true });
  await latePush();
  await automation();
} catch (e) {
  check('suite ran to the end', false, String(e.stack || e).slice(0, 900) + String(e.cause?.message || ''));
} finally {
  await browser.close().catch(() => {});
  await H.stop().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nall ${out.length} checks passed`);
process.exit(failed ? 1 : 0);
