/* Business-Wrap session SharedWorker (0.15.0 L1). Served at /api/session/worker.js (engine/routes/session.mjs), same origin, one instance per
 * browser profile and origin. It holds the ONE EventSource for every tab (a browser allows 6 HTTP/1.1 connections per origin: one stream per
 * tab made the 7th tab hang), re-broadcasts the server events (flush, req, ingest, progress) to the right tab, and keeps the tab registry
 * (POST /api/session/tabs) up to date. Pages talk to it with port messages:
 *   page → worker  {t:'hello'|'beat'|'bye', tab, svc, docs, automation}      worker → page  {t:'ev', event, data} | {t:'ping'}
 * A tab answers the worker's ping from its message handler (no page timer: a hidden tab's timers are throttled to once a minute). A tab that
 * stops answering stays listed (a sleeping tab is not a closed tab); /api/host/health shows its lastBeatMs and flags it TAB_STALE.
 *
 * 0.15.9 A2: the same file is also the page's DEDICATED heartbeat worker (editor/ext/12-session.js starts it with `new Worker`). A dedicated worker's timers are
 * not throttled in a hidden tab (measured, tests/awake-0159.test.mjs), so its clock is the reference the page is compared with: every second it posts
 * {t:'hb', wall}; the page notes how late each one arrives (a frozen or throttled page reads them in a burst) and tells the host (awake.lagMs, awake.stalls).
 * A tab the browser discarded (no pagehide, its Web Lock gone) is reported as `lost`, not as closed: the host keeps its saved state and answers TAB_ASLEEP for it.
 */
if (typeof SharedWorkerGlobalScope === 'undefined') {
  // dedicated heartbeat worker
  setInterval(() => { postMessage({ t: 'hb', wall: Date.now() }); }, 1000);
  self.onmessage = () => {};
}
const EVENTS = ['flush', 'req', 'ingest', 'progress', 'hello', 'lease', 'rev', 'asleep']; // lease/rev/asleep: 0.15.3 (one document = one owning tab; a tab asleep)
const ports = new Map(); // port → {tab, svc, docs, automation, at}
const client = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let es = null;
let sentKey = '';
let sentAt = 0;
let pingTimer = 0;
let listSeq = 0; // the server keeps the newest list of this client, whatever order the requests arrive in
const lost = new Set(); // tabs whose page vanished without a `bye` (a discarded or killed page): not closed, said so to the host

const tabs = () => [...ports.values()].filter((p) => p.tab).map((p) => ({ tab: p.tab, svc: p.svc, docs: p.docs, automation: p.automation, awake: p.awake, ago: Date.now() - p.at }));
function post(force) {
  const list = tabs();
  const key = JSON.stringify([list.map(({ ago, ...rest }) => rest), [...lost]]);
  if (!force && key === sentKey && Date.now() - sentAt < 4500) return Promise.resolve();
  sentKey = key; sentAt = Date.now();
  return fetch('/api/session/tabs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client, seq: ++listSeq, tabs: list, lost: [...lost] }) }).then((r) => r.arrayBuffer()).catch(() => {}); // 0.15.9: NO keepalive here, and the answer is read. A worker outlives the page, and Chrome counts the unread bodies of keepalive requests against a ~64 KB quota: after ~2 minutes of one list every 2 s every fetch failed at once ("Failed to fetch") and the host saw every tab asleep (measured, tests/awake-0159.test.mjs)
}
function route(event, raw) {
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  for (const [port, p] of ports) if (!data.tab || data.tab === p.tab) { try { port.postMessage({ t: 'ev', event, data }); } catch { /* port gone */ } }
}
function connect() {
  if (es) return;
  es = new EventSource(`/api/session/live?client=${client}`);
  for (const n of EVENTS) es.addEventListener(n, (e) => route(n, e.data));
  es.addEventListener('open', () => { post(true); }); // a reconnect: list the tabs again at once
}
function start() {
  connect();
  if (!pingTimer) pingTimer = setInterval(() => { for (const port of ports.keys()) { try { port.postMessage({ t: 'ping' }); } catch { /* gone */ } } post(true); sweep(); }, 2000); // 0.15.3: every 2 s the pages are pinged and the list (with each tab's age) is re-sent, so a healthy tab reads < 5 s and BW_ASLEEP_MS can be short
}
function stop() {
  clearInterval(pingTimer); pingTimer = 0;
  try { es?.close(); } catch { /* closed */ }
  es = null;
}

/** A lost `bye` (a page killed, the message dropped) must not keep a dead tab listed and the stream open for ever: every page holds the Web Lock
 *  `bw-tab:<tab>` while it lives (a sleeping tab keeps it, a dead one loses it), so a port whose lock is gone twice in a row is removed. */
function removePort(port, vanished) {
  const gone = ports.get(port);
  if (vanished && gone?.tab) lost.add(gone.tab);
  ports.delete(port);
  if (!ports.size) post(true).then(() => { if (ports.size) return; stop(); self.close(); }); // the last tab: say so, close the stream, let the host's idle timer run
  else post(true);
}
async function sweep() {
  if (!self.navigator?.locks?.query) return;
  let held;
  try { held = new Set((await navigator.locks.query()).held.map((l) => l.name)); } catch { return; }
  for (const [port, p] of [...ports]) {
    if (!p.tab || Date.now() - p.since < 4000) continue;
    if (held.has(`bw-tab:${p.tab}`)) p.miss = 0;
    else if ((p.miss = (p.miss || 0) + 1) >= 2) removePort(port, true);
  }
}

onconnect = (ev) => {
  const port = ev.ports[0];
  port.onmessage = (m) => {
    const d = m.data || {};
    if (d.t === 'bye') {
      removePort(port);
      return;
    }
    if (d.t === 'hello' || d.t === 'beat') {
      lost.delete(d.tab); // it is back (a discarded tab reloaded)
      ports.set(port, { tab: d.tab, svc: d.svc, docs: Array.isArray(d.docs) ? d.docs : [], automation: !!d.automation, awake: d.awake && typeof d.awake === 'object' ? d.awake : undefined, at: Date.now(), since: ports.get(port)?.since || Date.now(), miss: 0 });
      start();
      if (d.t === 'hello') post(true);
    }
  };
  port.start?.();
};
