// Tabs and runs (A10): each tab holds a live connection (EventSource) and pushes its state; on pagehide it flushes
// with sendBeacon. The last connection gone → 4 s (a reload reconnects within it) → run.json, then ctx.onIdle
// (the host's server exits 0). A relaunch asks /api/session/last and either resumes every tab (the server opens
// Edge with all URLs, 30 per command line) or archives the run (new work).
// Files: <workspace>\HISTORY\sessions\<runId>\<tabId>.json, run.json; archive\<YYYY-MM-DD>\<runId>\. Machine-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { ensure, readJson, localDir } from '../workspace.mjs';
import { launchBrowser, closeBrowsers, noteHost, hostState } from '../host.mjs';

export const IDLE_MS = Number(process.env.BW_IDLE_MS || 4000);
const TAB = /^[A-Za-z0-9_-]{4,64}$/;
const RUN = /^\d{8}-\d{6}-[a-f0-9]{6}$/;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function state(ctx) {
  return (ctx.session ||= { runId: `${stamp(new Date())}-${crypto.randomBytes(3).toString('hex')}`, startedAt: new Date().toISOString(), live: new Map(), timer: null, ended: false, inflight: 0, closing: new Map() });
}
const root = (ctx) => path.join(ensure(ctx.workspace).dirs.history, 'sessions');
const runDir = (ctx, id) => path.join(root(ctx), id);
const tabsOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'run.json') : []).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);

/** The profile (name, picture, actor id) kept with the host: .local/profile.json. A tab on another origin (a new port)
 *  or another browser profile has an empty localStorage; serve.mjs hands this to the page, so «من أنت؟» is not asked again. */
export const profileFile = () => path.join(localDir(), 'profile.json');
/** H3: a second copy in the save folder's HISTORY\profile.json.gz (machine state, like the library mirror): an update into a new install folder (a new, empty
 *  .local) or a lost browser storage still finds the owner, so the first-launch card is never asked twice. */
const historyProfile = (ctx) => (ctx?.workspace ? path.join(ctx.workspace.dirs.history, 'profile.json.gz') : null);
function keepProfile(p, ctx) {
  if (!p || typeof p !== 'object' || typeof p.profile !== 'string' || !p.profile || p.profile.length > 2e6) return false;
  try { JSON.parse(p.profile); } catch { return false; }
  const rec = JSON.stringify({ profile: p.profile, actor: typeof p.actor === 'string' ? p.actor.slice(0, 80) : '', at: new Date().toISOString() });
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(profileFile(), rec);
  if (historyProfile(ctx)) { ensure(ctx.workspace); fs.writeFileSync(historyProfile(ctx), zlib.gzipSync(rec)); }
  return true;
}
/** The kept profile: .local first, then HISTORY (null when neither has one). */
function readProfile(ctx) {
  for (const f of [profileFile(), historyProfile(ctx)].filter(Boolean)) { try { const b = fs.readFileSync(f); const r = JSON.parse((f.endsWith('.gz') ? zlib.gunzipSync(b) : b).toString('utf8')); if (r?.profile) return r; } catch { /* next */ } }
  return null;
}
/** A tab whose page closed while other tabs stay open was closed by the user: its record leaves the run (kept in
 *  closed\, never deleted), so a resume brings back only the tabs that were open at shutdown. */
function dropTab(ctx, tab) {
  const dir = runDir(ctx, state(ctx).runId);
  const f = path.join(dir, `${tab}.json`);
  if (!fs.existsSync(f)) return;
  fs.mkdirSync(path.join(dir, 'closed'), { recursive: true });
  fs.renameSync(f, path.join(dir, 'closed', `${tab}.json`));
}
function finish(ctx) {
  const s = state(ctx);
  if (s.ended) return;
  // the last tab's pagehide flush may still be on its way in: wait for it (3 s ceiling), never exit before it lands
  if (s.inflight > 0 && (s.waited = (s.waited || 0) + 1) <= 30) { setTimeout(() => finish(ctx), 100); return; }
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
/** ops[0..from) kept, then the delta: the page's pagehide flush sends only the edits since its last push (a beacon
 *  carries at most 64 KB, a whole document does not fit). */
const spliceOps = (old = [], d) => {
  const from = Math.max(0, Math.min(old.length, Number(d.from) || 0));
  if (from && d.prev != null && old[from - 1]?.id !== d.prev) return old; // the list was rewritten since that push: keep the push
  return [...old.slice(0, from), ...(Array.isArray(d.ops) ? d.ops : [])];
};
function writeTab(ctx, b) {
  if (!TAB.test(String(b.tab))) throw Object.assign(new Error('tab'), { code: 400 });
  const dir = runDir(ctx, state(ctx).runId);
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${b.tab}.json`);
  if (b.profile) keepProfile(b.profile, ctx);
  let rec;
  if (b.delta) {
    try { rec = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return; } // nothing pushed yet: the delta has no base
    for (const [ed, d] of Object.entries(b.delta)) {
      if (rec.entry?.editions?.[ed] && rec.entry.id === b.svc) rec.entry.editions[ed].ops = spliceOps(rec.entry.editions[ed].ops, d);
      else if (rec.snap?.svc?.[b.svc]?.[ed]) rec.snap.svc[b.svc][ed].ops = spliceOps(rec.snap.svc[b.svc][ed].ops, d);
    }
    Object.assign(rec, { title: String(b.title || rec.title || '').slice(0, 200), at: new Date().toISOString() });
  } else {
    let entry = b.entry || null;
    // a pagehide flush past 64 KB comes without the editions' base text (raw): it is taken back from this tab's last
    // record of the same document, else from the library mirror the Save wrote (HISTORY\library\<id>.json.gz)
    if (entry?.editions && Object.values(entry.editions).some((x) => x && x.raw == null)) {
      let base = null;
      try { const old = JSON.parse(fs.readFileSync(f, 'utf8')); if (old.entry?.id === entry.id) base = old.entry; } catch { /* none */ }
      if (!base && /^doc-[A-Za-z0-9-]{4,64}$/.test(String(entry.id))) {
        try { base = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ensure(ctx.workspace).dirs.history, 'library', `${entry.id}.json.gz`))).toString('utf8')); } catch { /* none */ }
      }
      for (const [ed, x] of Object.entries(entry.editions)) if (x && x.raw == null) { if (base?.editions?.[ed]?.raw == null) return; x.raw = base.editions[ed].raw; }
    }
    rec = { tab: b.tab, title: String(b.title || '').slice(0, 200), svc: b.svc, ed: b.ed, at: new Date().toISOString(), entry, snap: b.snap || null };
  }
  fs.writeFileSync(f, JSON.stringify(rec));
}

export default async (req, url, send, ctx, res) => {
  const p = url.pathname;
  if (p === '/api/profile') {
    // H3: the profile (name, picture, actor id) kept on this machine the moment it is set (not only with a tab's push)
    try {
      if (req.method === 'GET') { send(200, readProfile(ctx) || { profile: null }); return true; }
      if (req.method === 'POST') { const ok = keepProfile(await readJson(req, 4e6), ctx); send(ok ? 200 : 400, { ok }); return true; }
    } catch (e) { send(e.code === 413 ? 413 : 400, { error: String(e.message || e).slice(0, 200) }); return true; }
    return false;
  }
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
      clearTimeout(s.closing.get(tab)); s.closing.delete(tab); // a reload reconnects: the tab stays
      s.live.set(res, tab);
      noteHost({ tabs: new Set(s.live.values()).size });
      req.on('close', () => {
        s.live.delete(res);
        noteHost({ tabs: new Set(s.live.values()).size });
        if (!s.live.size) {
          // the last page gone: every tab that closed in the last IDLE_MS went with it (a window closed, Edge quit) and stays
          for (const t of s.closing.values()) clearTimeout(t);
          s.closing.clear();
          clearTimeout(s.timer); s.timer = setTimeout(() => { if (!s.live.size) finish(ctx); }, IDLE_MS);
        } else if (![...s.live.values()].includes(tab)) {
          clearTimeout(s.closing.get(tab));
          s.closing.set(tab, setTimeout(() => { s.closing.delete(tab); if (s.live.size && ![...s.live.values()].includes(tab)) dropTab(ctx, tab); }, IDLE_MS));
        }
      });
      return true;
    }
    if (req.method === 'POST' && (p === '/api/session/state' || p === '/api/session/flush')) { s.inflight += 1; try { writeTab(ctx, await readJson(req)); } finally { s.inflight -= 1; } send(200, { ok: true }); return true; }
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
      const { runId, tab: asker } = await readJson(req);
      if (!RUN.test(String(runId)) || runId === s.runId || !fs.existsSync(runDir(ctx, runId))) { send(400, { error: 'runId' }); return true; }
      if (p === '/api/session/new') { send(200, { ok: archive(ctx, runId) }); return true; }
      // resume: the tabs move into this run, the old run is archived, the server opens every tab at once
      const tabs = tabsOf(runDir(ctx, runId));
      const dir = runDir(ctx, s.runId);
      fs.mkdirSync(dir, { recursive: true });
      for (const x of tabs) fs.writeFileSync(path.join(dir, `${x.tab}.json`), JSON.stringify(x));
      archive(ctx, runId);
      // the tab that asked is not a tab of the run: it becomes the first resumed tab (the page navigates itself there),
      // so a resume never adds a tab, and its own fresh record leaves this run
      if (TAB.test(String(asker)) && !tabs.some((x) => x.tab === asker)) fs.rmSync(path.join(dir, `${asker}.json`), { force: true });
      const origin = `http://${req.headers.host || `127.0.0.1:${ctx.server?.address()?.port}`}`;
      const urls = tabs.map((x) => `${origin}/?session=${s.runId}&tab=${encodeURIComponent(x.tab)}`);
      const here = TAB.test(String(asker)) ? urls.shift() : null;
      const r = urls.length ? launchBrowser(urls) : { chunks: 0 };
      send(200, { ok: true, n: urls.length + (here ? 1 : 0), here, chunks: r.chunks });
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
