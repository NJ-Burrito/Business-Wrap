/* Business-Wrap session SharedWorker (0.15.0 L1). Served at /api/session/worker.js (engine/routes/session.mjs), same origin, one instance per
 * browser profile and origin. It holds the ONE EventSource for every tab (a browser allows 6 HTTP/1.1 connections per origin: one stream per
 * tab made the 7th tab hang), re-broadcasts the server events (flush, req, ingest, progress) to the right tab, and keeps the tab registry
 * (POST /api/session/tabs) up to date. Pages talk to it with port messages:
 *   page → worker  {t:'hello'|'beat'|'bye', tab, svc, docs, automation}      worker → page  {t:'ev', event, data} | {t:'ping'}
 * A tab answers the worker's ping from its message handler (no page timer: a hidden tab's timers are throttled to once a minute). A tab that
 * stops answering stays listed (a sleeping tab is not a closed tab); /api/host/health shows its lastBeatMs and flags it TAB_STALE.
 */
const EVENTS = ['flush', 'req', 'ingest', 'progress', 'hello'];
const ports = new Map(); // port → {tab, svc, docs, automation, at}
const client = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let es = null;
let sentKey = '';
let sentAt = 0;
let pingTimer = 0;

const tabs = () => [...ports.values()].filter((p) => p.tab).map((p) => ({ tab: p.tab, svc: p.svc, docs: p.docs, automation: p.automation, ago: Date.now() - p.at }));
function post(force) {
  const list = tabs();
  const key = JSON.stringify(list.map(({ ago, ...rest }) => rest));
  if (!force && key === sentKey && Date.now() - sentAt < 4500) return Promise.resolve();
  sentKey = key; sentAt = Date.now();
  return fetch('/api/session/tabs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client, tabs: list }), keepalive: true }).catch(() => {});
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
  if (!pingTimer) pingTimer = setInterval(() => { for (const port of ports.keys()) { try { port.postMessage({ t: 'ping' }); } catch { /* gone */ } } post(false); }, 3000);
}
function stop() {
  clearInterval(pingTimer); pingTimer = 0;
  try { es?.close(); } catch { /* closed */ }
  es = null;
}

onconnect = (ev) => {
  const port = ev.ports[0];
  port.onmessage = (m) => {
    const d = m.data || {};
    if (d.t === 'bye') {
      ports.delete(port);
      if (!ports.size) post(true).then(() => { if (ports.size) return; stop(); self.close(); }); // the last tab: say so, close the stream, let the host's idle timer run
      else post(true);
      return;
    }
    if (d.t === 'hello' || d.t === 'beat') {
      ports.set(port, { tab: d.tab, svc: d.svc, docs: Array.isArray(d.docs) ? d.docs : [], automation: !!d.automation, at: Date.now() });
      start();
      if (d.t === 'hello') post(true);
    }
  };
  port.start?.();
};
