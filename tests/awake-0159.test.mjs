// 0.15.9 A1-A5 (bw-0159 browser lane): tabs the tool opens stay awake or recover losing nothing. REAL Google Chrome, a REAL host, the real editor, raw CDP.
//   Chrome is started WITHOUT the keep-awake flags: the hardest case, a tab opened in a browser the user already runs, where only the page can keep itself awake.
//   Three editor tabs in one window: F (front, visible), A (hidden, the page's keeper on) and B (hidden, `?awake=0`: the keeper off, the "before" numbers).
//   A2  hidden for AWAKE_MINUTES (default 6.5, past the 5-minute intensive throttle): the page timer rate of A and B per 30 s window, the dedicated worker's rate, the
//       host's view (awake.rtc / tickMs), and the live-editor bridge answered by each tab (latency). Chrome's own chrome://discards table says whether it may freeze or discard each tab.
//   A3  CDP Page.setWebLifecycleState frozen -> the host marks the tab asleep and answers TAB_ASLEEP at once; active -> it wakes by itself (no reload), keeps its work, no read-only state
//   A4  a tab that vanishes without a goodbye (Chrome refuses to discard an editor tab, so the stand-in is a killed renderer, CDP Page.crash) is `lost`, not closed: TAB_ASLEEP with what to do; reloaded, it has its work back and says so once
//   A5  the numbers are printed (before = B, after = A) and written to out/qa-0.15.9/browser-detail.md by hand from this output
//   AWAKE_MINUTES=0.4 node tests/awake-0159.test.mjs   (a short run: the throttle assertions need >= 6)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, chooseBrowser } from '../engine/export.mjs';

const WANT = process.env.AWAKE_BROWSER || 'chrome'; // AWAKE_BROWSER=operagx repeats the timer / freeze parts in Opera GX (a temp profile and its own debugging port, never the owner's)

const MIN = Number(process.env.AWAKE_MINUTES || 6.5);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-awake0159-'));
Object.assign(process.env, { BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_ASLEEP_MS: '6000', BW_BRIDGE_TIMEOUT_MS: '20000', BW_QUEUE_MS: '2000', BW_DISCARD_GRACE_MS: '120000' });
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
const numbers = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  awake-0159: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };
const say = (s) => { numbers.push(s); console.log(s); };

const br = chooseBrowser({ env: { BW_BROWSER: WANT }, saved: '' });
if (!br || br.id !== WANT) { console.log(`SKIP awake-0159: ${WANT} is not installed here (the test needs the real browser)`); process.exit(0); }
const CHROME = br.id === 'chrome';
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

function tab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const open = new Promise((ok) => { ws.onopen = ok; });
  return {
    async send(method, params = {}) { await open; return new Promise((ok) => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); }); },
    async ev(expr, ms = 15000) {
      const r = await Promise.race([this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }), sleep(ms).then(() => ({ timeout: true }))]);
      if (r.timeout) return { __timeout: true };
      return r.result?.result?.value;
    },
    close() { try { ws.close(); } catch { /* closed */ } },
  };
}

let host = null, chrome = null, prof = null;
const tabs = {};
try {
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'awake0159', watermarkDir: null });
  host = await H.start({ editor, port: 4830, open: false });
  const base = host.url;
  const token = H.hostState().token;
  const health = async () => (await fetch(`${base}api/host/health`, { signal: AbortSignal.timeout(4000) })).json();
  const call = async (tool, tabId, doc, args = {}) => {
    const t0 = Date.now();
    const r = await fetch(`${base}api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify({ tool, tab: tabId, doc, args }), signal: AbortSignal.timeout(40000) });
    const j = await r.json().catch(() => ({}));
    return { status: r.status, ms: Date.now() - t0, j };
  };

  // Chrome WITHOUT the keep-awake flags, a temp profile tagged with this test (R13), remote debugging on a free port
  let cdp = await freePort();
  while (cdp === 9333) cdp = await freePort(); // the owner's Opera listens there: never
  prof = path.join(tmp, 'chrome-profile');
  chrome = spawn(br.exe, [`--user-data-dir=${prof}`, `--remote-debugging-port=${cdp}`, '--no-first-run', '--no-default-browser-check', '--new-window', `${base}?automation=1&t=F`, `${base}?automation=1&t=A`, `${base}?automation=1&awake=0&t=B`], { stdio: 'ignore' });
  const targets0 = async () => (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json());
  const targets = async () => (await targets0()).filter((t) => t.type === 'page');
  const attach = async () => {
    for (const t of await targets()) {
      let q; try { q = new URL(t.url).searchParams.get('t'); } catch { continue; }
      if (q && !tabs[q]?.id) tabs[q] = Object.assign(tab(t.webSocketDebuggerUrl), { id: t.id });
    }
    return ['F', 'A', 'B'].every((k) => tabs[k]);
  };
  check('Chrome started with three editor tabs (remote debugging answers)', !!(await until(attach, 40000)));
  const ready = async (k) => tabs[k].ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)');
  for (const k of ['F', 'A', 'B']) check(`tab ${k}: the editor booted (BW.ready and a session id)`, !!(await until(() => ready(k), 60000)));
  await fetch(`http://127.0.0.1:${cdp}/json/activate/${tabs.F.id}`);
  // each tab its own new document (so each owns its lease) and one unsaved edit that must survive everything below
  const prep = async (k) => tabs[k].ev(`(async()=>{ const B=window.BW; await B.EXT.library.newDocument(); const svc=B.S.svc; const ed=B.S.ed; B.commit([{op:'setText',path:'/control/title',value:'AWAKE-${'${k}'}-MARK'}],{ed,mirror:false}); return JSON.stringify({svc,ed,tab:document.documentElement.dataset.bwSession,title:B.M[svc][ed].doc.control.title}); })()`.replace('${k}', k));
  const info = {};
  for (const k of ['F', 'A', 'B']) { const r = await prep(k); try { info[k] = JSON.parse(r); } catch { info[k] = { err: String(r) }; } }
  check('each tab has its own document and the unsaved edit is in it', ['F', 'A', 'B'].every((k) => info[k].svc && info[k].title === `AWAKE-${k}-MARK`), JSON.stringify(info));
  const vis = {};
  for (let i = 0; i < 12; i++) { await fetch(`http://127.0.0.1:${cdp}/json/activate/${tabs.F.id}`); await tabs.F.send('Page.bringToFront'); await sleep(1500); for (const k of ['F', 'A', 'B']) vis[k] = await tabs[k].ev('document.visibilityState'); if (vis.F === 'visible' && vis.A === 'hidden' && vis.B === 'hidden') break; } // Chrome may hand the focus to the tab that finished loading last: ask again until F is the visible one
  check('ready state: A and B are hidden, F is visible (the probe saw it)', vis.A === 'hidden' && vis.B === 'hidden' && vis.F === 'visible', JSON.stringify(vis));
  // page-timer probe in A and B (a 100 ms setInterval, counted) and a dedicated-worker probe: both measured from inside the very page the editor runs in
  const probe = `(()=>{ window.__pr={n:0,w:0,t:Date.now()}; setInterval(()=>window.__pr.n++,100); const w=new Worker('/api/session/worker.js',{name:'probe'}); w.onmessage=()=>window.__pr.w++; return 1 })()`;
  for (const k of ['A', 'B']) await tabs[k].ev(probe);
  const h0 = await health();
  const row = (h, k) => h.tabs.find((t) => t.tab === info[k].tab);
  check('the host lists A with awake.rtc true once its data channel is open, B without a keeper', !!(await until(async () => row(await health(), 'A')?.awake?.rtc === true, 20000)) && !(row(await health(), 'B')?.awake?.rtc), JSON.stringify(row(h0, 'A')) + ' / ' + JSON.stringify(row(h0, 'B')));

  // A2: hidden for MIN minutes
  const prev = {};
  const read = async (k) => tabs[k].ev('({n:window.__pr.n,w:window.__pr.w,t:Date.now()})');
  for (const k of ['A', 'B']) prev[k] = await read(k);
  const series = { A: [], B: [] };
  const t0 = Date.now();
  while (Date.now() - t0 < MIN * 60000) {
    await sleep(30000);
    const at = +((Date.now() - t0) / 60000).toFixed(1);
    const line = { min: at };
    for (const k of ['A', 'B']) {
      const n = await read(k);
      const dt = (n.t - prev[k].t) / 1000;
      line[k] = { timer: +((n.n - prev[k].n) / (dt * 10)).toFixed(2), worker: +((n.w - prev[k].w) / dt).toFixed(2) };
      series[k].push({ min: at, ...line[k] }); prev[k] = n;
    }
    say(`hidden ${at} min   A(keeper on) page-timer ${line.A.timer} worker ${line.A.worker}   B(keeper off) page-timer ${line.B.timer} worker ${line.B.worker}`);
    { const hh = await health(); const q = (k) => { const r = row(hh, k); return r ? `${r.asleep ? 'ASLEEP' : 'awake'} ${r.lastBeatMs}ms` : 'gone'; }; say(`   host view: F ${q('F')}  A ${q('A')}  B ${q('B')}`); }
    const hh2 = await health();
    if (!series.diag && ['F', 'A', 'B'].some((k) => row(hh2, k)?.asleep)) {
      series.diag = true; // the session SharedWorker's own view, asked over CDP the moment the host sees every tab asleep
      try {
        const sw = (await targets0()).find((t) => t.type === 'shared_worker');
        if (sw) { const W = tab(sw.webSocketDebuggerUrl);
          say(`   worker POST /api/session/tabs now: ${JSON.stringify(await W.ev('(async()=>{ const t0=Date.now(); try { const r = await fetch("/api/session/tabs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client,seq:++listSeq,tabs:tabs(),lost:[...lost]}),keepalive:true}); return r.status+" in "+(Date.now()-t0)+" ms: "+(await r.text()).slice(0,80) } catch(e){ return "ERR "+e.message+" after "+(Date.now()-t0)+" ms" } })()', 15000))}`);
          { const h5 = await health(); say(`   host view right after that POST: ${JSON.stringify(['F', 'A', 'B'].map((k) => `${k} ${row(h5, k)?.lastBeatMs}`))} clients ${JSON.stringify(h5.clients)}`); }
          say(`   ports in the worker: ${JSON.stringify(await W.ev('JSON.stringify([...ports.values()].map(p=>({tab:p.tab,ago:Date.now()-p.at,since:Date.now()-p.since,miss:p.miss})))'))}`);
          say(`   a fresh port from page F: ${JSON.stringify(await tabs.F.ev('new Promise((r)=>{ const w=new SharedWorker("/api/session/worker.js",{name:"bw-session"}); let n=0; w.port.onmessage=(m)=>{ if(m.data&&m.data.t==="ping"){ n++; w.port.postMessage({t:"beat",tab:"diagprobe",svc:"x",docs:[],automation:false}); } }; w.port.start(); w.port.postMessage({t:"hello",tab:"diagprobe",svc:"x",docs:[],automation:false}); setTimeout(()=>r("pings received on the fresh port in 6 s: "+n+" ; F visibility "+document.visibilityState+" ; F now "+Date.now()),6000) })', 12000))}`);
          say(`   ports in the worker after: ${JSON.stringify(await W.ev('JSON.stringify([...ports.values()].map(p=>({tab:p.tab,ago:Date.now()-p.at})))'))}`); say(`   sharedworker state: ${JSON.stringify(await W.ev('JSON.stringify({now:Date.now(), ports:ports.size, es: es ? es.readyState : null, pingTimer, sentAt, age: Date.now()-sentAt, lost:[...lost]})'))}`); say(`   sharedworker timer test (3 s, 100 ms interval, ticks): ${JSON.stringify(await W.ev('new Promise(r=>{let n=0;const t=setInterval(()=>{n++},100);setTimeout(()=>{clearInterval(t);r(n)},3000)})', 8000))}`); { const h4 = await health(); say(`   host view after the probe: ${JSON.stringify(['F', 'A', 'B'].map((k) => `${k} ${row(h4, k)?.lastBeatMs}`))}`); } W.close(); } else say('   no shared_worker target listed');
      } catch (e) { say(`   sharedworker probe failed: ${e.message}`); }
    }
  }
  const late = (k, key) => { const a = series[k].filter((x) => x.min >= 5.6); return a.length ? a.reduce((s, x) => s + x[key], 0) / a.length : null; };
  if (MIN >= 6) {
    const aT = late('A', 'timer'), bT = late('B', 'timer');
    say(`after 5.6 min hidden: A page-timer ${aT?.toFixed(2)} (1.0 = 10 ticks/s) ; B page-timer ${bT?.toFixed(2)} ; A worker ${late('A', 'worker')?.toFixed(2)} ; B worker ${late('B', 'worker')?.toFixed(2)}`);
    check('A2: with the keeper on, the hidden tab\'s page timers are NOT in the intensive throttle after 5.6 min (rate >= 0.05 of nominal, the 1 s background floor)', aT >= 0.05, `A ${aT}`);
    check('A2 (before): with the keeper off the same tab is intensive-throttled (rate < 0.02)', bT < 0.02, `B ${bT}`);
    check('A2: the dedicated worker heartbeat keeps its rate (>= 0.9 per second) in both', late('A', 'worker') >= 0.9 && late('B', 'worker') >= 0.9, `${late('A', 'worker')} ${late('B', 'worker')}`);
  }
  // the live-editor bridge, asked of each hidden tab at the end
  const bridge = {};
  for (const k of ['A', 'B']) { bridge[k] = await call('get', info[k].tab, info[k].svc, { pointer: '/control/title', locale: info[k].ed }); say(`bridge ${k}: HTTP ${bridge[k].status} in ${bridge[k].ms} ms  ${bridge[k].j?.code || (bridge[k].j?.ok ? 'ok' : JSON.stringify(bridge[k].j).slice(0, 120))}`); }
  check(`A2: the hidden keeper-on tab answers the live-editor bridge (${bridge.A.ms} ms)`, bridge.A.status === 200 && bridge.A.j?.ok === true && bridge.A.ms < 5000, JSON.stringify(bridge.A).slice(0, 300));
  const hl = await health();
  say(`host health after ${MIN} min: A ${JSON.stringify({ asleep: row(hl, 'A')?.asleep, lastBeatMs: row(hl, 'A')?.lastBeatMs, awake: row(hl, 'A')?.awake })}  B ${JSON.stringify({ asleep: row(hl, 'B')?.asleep, lastBeatMs: row(hl, 'B')?.lastBeatMs, awake: row(hl, 'B')?.awake })}`);
  check('A2: the host sees A awake (not asleep) with the channel open and the page timer in the 1 s bucket or better than the minute bucket', row(hl, 'A')?.asleep === false && row(hl, 'A')?.awake?.rtc === true && row(hl, 'A')?.awake?.tickMs !== 60000, JSON.stringify(row(hl, 'A')));

  let D = null, rows = null, trim = null;
  // what Chrome itself says about freezing and discarding these hidden tabs (chrome://discards)
  if (CHROME) {
  const pg = await fetch(`http://127.0.0.1:${cdp}/json/new?chrome://chrome-urls/`, { method: 'PUT' }).then((r) => r.json());
  D = tab(pg.webSocketDebuggerUrl);
  const clickText = (txt) => `(()=>{ let hit=null; const walk=(n,d=0)=>{ if(!n||d>25||hit) return; if(n.shadowRoot) walk(n.shadowRoot,d+1); for(const c of (n.children||[])) { if(/BUTTON/.test(c.tagName||'') && /${txt}/i.test(c.textContent||'')) { hit=c; return; } walk(c,d+1);} }; walk(document); if(hit){hit.click(); return true} return false })()`;
  await until(async () => (await D.ev(clickText('enable'))) === true, 20000, 500);
  await sleep(1200);
  await D.send('Page.navigate', { url: 'chrome://discards/' });
  rows = `(()=>{ const o=[]; const walk=(n,d=0)=>{ if(!n||d>25) return; if(n.shadowRoot) walk(n.shadowRoot,d+1); for(const c of (n.children||[])) { if(c.tagName==='TR') o.push(c.textContent.replace(/\\s+/g,' ').trim()); walk(c,d+1);} }; walk(document); return o })()`;
  const table = await until(async () => { const r = await D.ev(rows); return Array.isArray(r) && r.some((x) => x.includes('t=A')) ? r : false; }, 20000, 500);
  trim = (x) => String(x || '').replace(/^\d+ [\d.]+ /, '').replace(/ \[Toggle\].*$/, '');
  say(`chrome://discards A: ${trim((table || []).find((x) => x.includes('t=A')))}`);
  say(`chrome://discards B: ${trim((table || []).find((x) => x.includes('t=B')))}`);
  check('A2: chrome://discards listed both hidden tabs (the evidence above is Chrome\'s own)', !!table && table.some((x) => x.includes('t=A')) && table.some((x) => x.includes('t=B')));

  }
  // A3: freeze A (CDP), the host notices; thaw it, it wakes by itself and keeps its work
  await tabs.A.send('Page.enable');
  const beforeHash = await tabs.A.ev('window.__pr.n');
  void beforeHash;
  await tabs.A.send('Page.setWebLifecycleState', { state: 'frozen' });
  const asleep = await until(async () => row(await health(), 'A')?.asleep === true, 30000, 500);
  check('A3: a frozen tab is marked asleep by the host (heartbeats against the worker clock)', !!asleep, JSON.stringify(row(await health(), 'A')));
  const fz = await call('get', info.A.tab, info.A.svc, { pointer: '/control/title', locale: info.A.ed });
  say(`frozen A: bridge HTTP ${fz.status} ${fz.j?.code} in ${fz.ms} ms`);
  check('A3: a command to the frozen tab waits the short queue (2 s here, 5 s by default), then gets TAB_ASLEEP with what to do', fz.status === 503 && fz.j?.code === 'TAB_ASLEEP' && /click the tab|reopen/i.test(fz.j?.how || '') && fz.ms >= 1500 && fz.ms < 6000, JSON.stringify(fz).slice(0, 300));
  await tabs.A.send('Page.setWebLifecycleState', { state: 'active' });
  const woke = await until(async () => { const r = row(await health(), 'A'); return r && r.asleep === false && r.awake?.resumed >= 1; }, 30000, 500);
  check('A3: thawed (active), the tab wakes by itself: awake again, the page counted a freeze and a resume', !!woke, JSON.stringify(row(await health(), 'A')));
  const af = await call('get', info.A.tab, info.A.svc, { pointer: '/control/title', locale: info.A.ed });
  check('A3: after the thaw the bridge answers and the unsaved edit is intact', af.status === 200 && JSON.stringify(af.j).includes('AWAKE-A-MARK'), JSON.stringify(af).slice(0, 300));
  const ro = await tabs.A.ev("document.documentElement.dataset.bwReadonly || ''");
  check('A3: no stale or read-only state after the thaw', ro === '', String(ro));
  say(`thaw A: awake after ${woke ? 'ok' : 'NO'}; health ${JSON.stringify(row(await health(), 'A')?.awake)}`);

  if (CHROME) {
  // A4: a REAL discard through chrome://discards (Urgent Discard). Our own CDP sessions on A and B count as "using DevTools" and block discarding, so they are dropped first.
  tabs.A.close(); tabs.B.close();
  const urgent = (key) => D.ev(`(()=>{ let done=false; const walk=(n,d=0)=>{ if(!n||d>25||done) return; if(n.shadowRoot) walk(n.shadowRoot,d+1); for(const c of (n.children||[])) { if(c.tagName==='TR' && c.textContent.includes('${key}')) { const all=[]; const g=(m,dd=0)=>{ if(!m||dd>8) return; if(m.shadowRoot) g(m.shadowRoot,dd+1); for(const y of (m.children||[])) { all.push(y); g(y,dd+1);} }; g(c); const b=all.find(y=>/\[Urgent Discard\]/.test(y.textContent)&&y.children.length===0); if(b){b.click(); done=true; return;} } walk(c,d+1);} }; walk(document); return done })()`);
  await sleep(3000);
  const snap = async (k) => trim(((await D.ev(rows)) || []).find((x) => x.includes(`t=${k}`)));
  say(`before the urgent discard, Chrome says A: ${await snap('A')}`);
  say(`before the urgent discard, Chrome says B: ${await snap('B')}`);
  const uA = await urgent('t=A');
  await sleep(8000);
  const hlA = row(await health(), 'A');
  say(`urgent discard asked of A (keeper on: lock + data channel): clicked ${uA}; host row afterwards live=${hlA?.live} asleep=${hlA?.asleep} discarded=${hlA?.discarded || false}`);
  check('A4 evidence: Chrome did NOT discard the keeper-on tab even on an urgent discard (it stays live, awake)', uA === true && hlA?.live === true && hlA?.asleep === false && !hlA?.discarded, JSON.stringify(hlA));
  say(`B just before: ${await snap('B')}`);
  // Chrome refuses to discard an editor tab even on an urgent discard (it updates its title in the background and holds a Web Lock: see the "before" lines above), so a real
  // discard cannot be forced for it. The stand-in is the same thing as seen by the host and the page: the renderer is killed (CDP Page.crash) with no pagehide and no goodbye,
  // exactly what a discard does, and the tab is brought back by Chrome's reload on activation.
  const uB = await urgent('t=B');
  await sleep(6000);
  const hlB0 = row(await health(), 'B');
  say(`urgent discard asked of B (keeper off): clicked ${uB}; host row afterwards live=${hlB0?.live} asleep=${hlB0?.asleep}; Chrome's reasons: ${await snap('B')}`);
  check('A4 evidence: Chrome does not discard the editor tab even on an urgent discard (so a discard cannot happen to it behind the user\'s back here)', uB === true && hlB0?.live === true);
  const tabUrlB = (await targets()).find((t) => t.id === tabs.B.id)?.url;
  tabs.B = Object.assign(tab((await targets()).find((t) => t.id === tabs.B.id).webSocketDebuggerUrl), { id: tabs.B.id });
  await tabs.B.send('Page.enable');
  void tabs.B.send('Page.crash'); // the renderer dies: no pagehide, no bye, the Web Lock vanishes
  const goneB = await until(async () => { const r = row(await health(), 'B'); return r && r.live === false && r.discarded === true ? r : false; }, 40000, 500);
  const hlD = await health();
  say(`renderer of B killed (stand-in for a discard): host row ${JSON.stringify(row(hlD, 'B'))}`);
  check('A4: the vanished tab is kept by the host as a LOST tab (asleep, discarded:true), not closed, and the host stays up', !!goneB && row(hlD, 'F')?.asleep === false && row(hlD, 'A')?.asleep === false, JSON.stringify(row(hlD, 'B')));
  if (goneB) {
    const dc = await call('get', info.B.tab, info.B.svc, { pointer: '/control/title', locale: info.B.ed });
    say(`lost B: bridge HTTP ${dc.status} ${dc.j?.code} in ${dc.ms} ms`);
    check('A4: a command to the lost tab gets TAB_ASLEEP with what to do', dc.status === 503 && dc.j?.code === 'TAB_ASLEEP' && /click the tab|reopen/i.test(dc.j?.how || ''), JSON.stringify(dc).slice(0, 300));
    // the user comes back: activate and reload it (same browsing context: sessionStorage, so the same tab id)
    tabs.B.close();
    await fetch(`http://127.0.0.1:${cdp}/json/activate/${tabs.B.id}`);
    const live = (await targets()).find((t) => t.id === tabs.B.id);
    tabs.B = Object.assign(tab(live.webSocketDebuggerUrl), { id: live.id });
    await tabs.B.send('Page.reload');
    const back = await until(async () => (await tabs.B.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true, 60000);
    check('A4: the tab reloaded (the editor booted again)', !!back, String(tabUrlB));
    const st = await tabs.B.ev(`JSON.stringify({ tab: document.documentElement.dataset.bwSession, back: document.documentElement.dataset.bwDiscarded || '', svc: window.BW.S.svc, title: (window.BW.M[window.BW.S.svc]?.[window.BW.S.ed]?.doc?.control?.title) || '' })`);
    let s2 = {}; try { s2 = JSON.parse(st); } catch { /* none */ }
    say(`reloaded B: ${st}`);
    check('A4: its work is intact after the reload (same tab id, same document, the unsaved edit is back) and it said so once', s2.tab === info.B.tab && s2.svc === info.B.svc && s2.title === 'AWAKE-B-MARK' && s2.back === '1', st);
    const hl3 = await until(async () => { const r = row(await health(), 'B'); return r && r.live !== false && r.asleep === false ? r : false; }, 20000, 500);
    check('A4: the host lists the tab live again and not asleep', !!hl3, JSON.stringify(row(await health(), 'B')));
  }
  }
  D?.close();
} catch (e) {
  check('the run completed without an exception', false, e?.stack || e);
} finally {
  for (const k of Object.keys(tabs)) { try { tabs[k].close(); } catch { /* closed */ } }
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { await H.stop(); } catch { /* none */ }
}
await sleep(500);
check('nothing left running: the host is stopped and Chrome\'s process tree is gone', H.status().running === false && !(chrome?.pid && H.alive(chrome.pid)));
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nawake-0159: all ${out.length} checks passed`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a lock: the OS temp is cleaned later */ }
process.exit(failed ? 1 : 0);
