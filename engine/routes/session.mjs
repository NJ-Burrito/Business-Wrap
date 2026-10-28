// Tabs and runs (A10): each tab holds a live connection (EventSource) and pushes its state; on pagehide it flushes
// with sendBeacon. The last connection gone → 4 s (a reload reconnects within it) → run.json, then ctx.onIdle
// (the host's server exits 0). A relaunch asks /api/session/last and either resumes every tab (the server opens
// Edge with all URLs, 30 per command line) or archives the run (new work).
// Files: <workspace>\HISTORY\sessions\<runId>\<tabId>.json, run.json; archive\<YYYY-MM-DD>\<runId>\. Machine-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ensure, readJson } from '../workspace.mjs';
import { launchBrowser, closeBrowsers, noteHost, hostState } from '../host.mjs';

export const IDLE_MS = Number(process.env.BW_IDLE_MS || 4000);
const TAB = /^[A-Za-z0-9_-]{4,64}$/;
const RUN = /^\d{8}-\d{6}-[a-f0-9]{6}$/;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function state(ctx) {
  return (ctx.session ||= { runId: `${stamp(new Date())}-${crypto.randomBytes(3).toString('hex')}`, startedAt: new Date().toISOString(), live: new Map(), timer: null, ended: false });
}
const root = (ctx) => path.join(ensure(ctx.workspace).dirs.history, 'sessions');
const runDir = (ctx, id) => path.join(root(ctx), id);
const tabsOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'run.json') : []).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);

function finish(ctx) {
  const s = state(ctx);
  if (s.ended) return;
  s.ended = true;
  const dir = runDir(ctx, s.runId);
  const tabs = tabsOf(dir).map((x) => ({ tab: x.tab, title: x.title }));
  if (tabs.length) fs.writeFileSync(path.join(dir, 'run.json'), JSON.stringify({ runId: s.runId, startedAt: s.startedAt, endedAt: new Date().toISOString(), tabs }, null, 1));
  if (process.env.BW_HOST_TOKEN) closeBrowsers(hostState()?.browserPids || [], { scan: false }); // the windows this host opened (a background Edge left on its profile); no slow process scan here
  ctx.onIdle?.();
}
function archive(ctx, id) {
  const from = runDir(ctx, id);
  if (!fs.existsSync(from)) return false;
  const to = path.join(root(ctx), 'archive', day(new Date()), id);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  return true;
}
function writeTab(ctx, b) {
  if (!TAB.test(String(b.tab))) throw Object.assign(new Error('tab'), { code: 400 });
  const dir = runDir(ctx, state(ctx).runId);
  fs.mkdirSync(dir, { recursive: true });
  const rec = { tab: b.tab, title: String(b.title || '').slice(0, 200), svc: b.svc, ed: b.ed, at: new Date().toISOString(), entry: b.entry || null, snap: b.snap || null };
  fs.writeFileSync(path.join(dir, `${b.tab}.json`), JSON.stringify(rec));
}

export default async (req, url, send, ctx, res) => {
  const p = url.pathname;
  if (!p.startsWith('/api/session/') && p !== '/api/host/stop') return false;
  if (!ctx.workspace) return false; // no save folder (a --out server): no sessions
  const s = state(ctx);
  try {
    if (req.method === 'GET' && p === '/api/session/info') { send(200, { runId: s.runId, host: !!process.env.BW_HOST_TOKEN, workspace: { root: ctx.workspace.root, chosen: ctx.workspace.chosen !== false } }); return true; }
    if (req.method === 'GET' && p === '/api/session/live') {
      const tab = url.searchParams.get('tab');
      if (!TAB.test(String(tab)) || !res) { send(400, { error: 'tab' }); return true; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ runId: s.runId })}\n\n`);
      clearTimeout(s.timer);
      s.live.set(res, tab);
      noteHost({ tabs: new Set(s.live.values()).size });
      req.on('close', () => {
        s.live.delete(res);
        noteHost({ tabs: new Set(s.live.values()).size });
        if (!s.live.size) { clearTimeout(s.timer); s.timer = setTimeout(() => { if (!s.live.size) finish(ctx); }, IDLE_MS); }
      });
      return true;
    }
    if (req.method === 'POST' && (p === '/api/session/state' || p === '/api/session/flush')) { writeTab(ctx, await readJson(req)); send(200, { ok: true }); return true; }
    if (req.method === 'GET' && p === '/api/session/tab') {
      const tab = url.searchParams.get('tab');
      const f = path.join(runDir(ctx, s.runId), `${tab}.json`);
      if (!TAB.test(String(tab)) || !fs.existsSync(f)) { send(404, { error: 'not found' }); return true; }
      send(200, fs.readFileSync(f, 'utf8'));
      return true;
    }
    if (req.method === 'GET' && p === '/api/session/last') {
      const dirs = fs.existsSync(root(ctx)) ? fs.readdirSync(root(ctx)).filter((d) => RUN.test(d) && d !== s.runId).sort().reverse() : [];
      for (const d of dirs) {
        const tabs = tabsOf(runDir(ctx, d));
        if (tabs.length) { send(200, { runId: d, tabs: tabs.map((x) => ({ tab: x.tab, title: x.title, at: x.at })) }); return true; }
      }
      send(200, { runId: null, tabs: [] });
      return true;
    }
    if (req.method === 'POST' && (p === '/api/session/resume' || p === '/api/session/new')) {
      const { runId } = await readJson(req);
      if (!RUN.test(String(runId)) || runId === s.runId || !fs.existsSync(runDir(ctx, runId))) { send(400, { error: 'runId' }); return true; }
      if (p === '/api/session/new') { send(200, { ok: archive(ctx, runId) }); return true; }
      // resume: the tabs move into this run, the old run is archived, the server opens every tab at once
      const tabs = tabsOf(runDir(ctx, runId));
      const dir = runDir(ctx, s.runId);
      fs.mkdirSync(dir, { recursive: true });
      for (const x of tabs) fs.writeFileSync(path.join(dir, `${x.tab}.json`), JSON.stringify(x));
      archive(ctx, runId);
      const origin = `http://${req.headers.host || `127.0.0.1:${ctx.server?.address()?.port}`}`;
      const urls = tabs.map((x) => `${origin}/?session=${s.runId}&tab=${encodeURIComponent(x.tab)}`);
      const r = launchBrowser(urls);
      send(200, { ok: true, n: urls.length, chunks: r.chunks });
      return true;
    }
    if (req.method === 'POST' && p === '/api/host/stop') {
      const { token } = await readJson(req);
      if (!process.env.BW_HOST_TOKEN || token !== process.env.BW_HOST_TOKEN) { send(403, { error: 'token' }); return true; }
      for (const r of s.live.keys()) r.write('event: flush\ndata: {}\n\n'); // every tab sends its state now
      send(200, { ok: true });
      setTimeout(() => finish(ctx), 800);
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
