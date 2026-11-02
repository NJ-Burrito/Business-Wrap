// Tabs and runs (A10): each tab holds a live connection (EventSource) and pushes its state; on pagehide it flushes
// with sendBeacon. The last connection gone → 4 s (a reload reconnects within it) → run.json, then ctx.onIdle
// (the host's server exits 0). A relaunch asks /api/session/last and either resumes every tab (the server opens
// the browser with all URLs, 30 per command line) or archives the run (new work).
// Files: <workspace>\.system\sessions\<runId>\<tabId>.json, run.json; archive\<YYYY-MM-DD>\<runId>\. Machine-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ensure, readJson, localDir, subdir, systemDir } from '../workspace.mjs';
import { launchBrowser, closeBrowsers, noteHost, hostState } from '../host.mjs';
import { BROWSERS, installedBrowsers, osDefaultBrowser, classifyBrowser, isChromium, chooseBrowser, savedBrowser, saveBrowser } from '../export.mjs';

/** editor/session-worker.js, next to the editor sources (installed copies keep the same layout). */
const WORKER_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'editor', 'session-worker.js');
export const IDLE_MS = Number(process.env.BW_IDLE_MS || 4000);
const TAB = /^[A-Za-z0-9_-]{4,64}$/;
const RUN = /^\d{8}-\d{6}-[a-f0-9]{6}$/;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 0.15.0 L1: one live connection per BROWSER, not per tab. A client (the page's SharedWorker, or the Web Locks leader tab) holds the one
 *  event stream and lists its tabs with POST /api/session/tabs; a tab is live while some connected client lists it. A page that connects
 *  directly (?tab=, an older page) is a client of one tab. clients: Map<clientId, {id, conns:Set<res>, tabs:Map<tab, info>, since, listedAt}>. */
export function state(ctx) {
  if (!ctx.session) { const t = setInterval(() => { try { reconcile(ctx); sweepAsleep(ctx); } catch { /* the next second */ } }, 1000); t.unref?.(); } // 0.16.0: leases are re-checked every second, not only when a list arrives
  return (ctx.session ||= { runId: `${stamp(new Date())}-${crypto.randomBytes(3).toString('hex')}`, startedAt: new Date().toISOString(), clients: new Map(), timer: null, ended: false, inflight: 0, closing: new Map(), startedMs: Date.now(), leases: new Map(), revs: new Map(), beats: new Map(), asleepKey: '', lost: new Map(), direct: new Map(), closed: new Map() });
}
/** 0.15.3 T2: a tab not heard from for this long is ASLEEP (a browser's sleeping or snoozed tab, a frozen or discarded page): the bridge answers TAB_ASLEEP at once instead of waiting 15 s. The worker pings every 3 s. */
export const asleepMs = () => Number(process.env.BW_ASLEEP_MS) || 9000;
/** 0.16.0 (field notes item 5): a lease is released when its owner has not answered for this long (asleep, discarded, closed, or a ghost its frozen worker client still lists). */
export const leaseReleaseMs = () => Number(process.env.BW_LEASE_RELEASE_MS) || 60000;
/** How long ago this tab last proved it runs: the freshest of its own beat (/api/session/beat, a state push, a bridge reply) and any client's list. Infinity = never heard. */
export function beatAge(s, tab, now = Date.now()) {
  let age = s.beats.has(tab) ? now - s.beats.get(tab) : Infinity;
  for (const c of s.clients.values()) { if (!c.conns.size) continue; const o = c.tabs.get(tab); if (o) age = Math.min(age, (o.ago || 0) + (c.listedAt ? now - c.listedAt : 0)); }
  return age;
}
/** 0.15.9 A4: a tab that vanished without a goodbye (a browser discarded it, or its page was killed) is `lost`, not closed: its saved state stays in the run, a command to it gets
 *  TAB_ASLEEP, and when the LAST connection goes without a goodbye the host waits this long before it exits (a discarded last tab can come back and reload). A clean close keeps the 4 s. */
export const discardGraceMs = () => Number(process.env.BW_DISCARD_GRACE_MS) || (process.env.BW_IDLE_MS ? IDLE_MS : 60000);
/** 0.16.0 (the owner's host stopped twice with no cause; item 11 «the host keeps its editor across a window close»): a host an agent has used within this long does not exit when its last
 *  tab goes (a closed window, a crashed or restarted browser): it waits for a tab to come back. A host only a person used keeps the 4 s / 60 s of before. 0 turns it off. */
export const agentKeepMs = (ctx) => {
  const keep = process.env.BW_AGENT_KEEP_MS !== undefined ? Number(process.env.BW_AGENT_KEEP_MS) : 30 * 60 * 1000;
  return ctx?.agentAt && keep > 0 ? Math.max(0, ctx.agentAt + keep - Date.now()) : 0;
};
/** Any proof that a tab's page runs (a state push, a flush, a bridge reply) counts as a beat, whatever the last tab list said. */
export const beat = (ctx, tab) => { if (typeof tab === 'string') state(ctx).beats.set(tab, Date.now()); };
const awakeOf = (a) => (a && typeof a === 'object' ? { rtc: a.rtc === true, tickMs: [1000, 5000, 60000].includes(a.tickMs) ? a.tickMs : 1000, stalls: Math.min(1e6, Math.max(0, Number(a.stalls) || 0)), lagMs: Math.min(1e9, Math.max(0, Number(a.lagMs) || 0)), frozen: Math.min(1e6, Math.max(0, Number(a.frozen) || 0)), resumed: Math.min(1e6, Math.max(0, Number(a.resumed) || 0)) } : null);
const connected = (s) => [...s.clients.values()].filter((c) => c.conns.size);
const liveTabsExcept = (s, except, tab) => [...s.clients.values()].some((c) => c !== except && c.conns.size && c.tabs.has(tab));
const liveTabs = (s) => new Set(connected(s).flatMap((c) => [...c.tabs.keys()]));
const nConns = (s) => connected(s).reduce((n, c) => n + c.conns.size, 0);
const clientOf = (s, id) => { let c = s.clients.get(id); if (!c) s.clients.set(id, c = { id, conns: new Set(), tabs: new Map(), since: Date.now(), listedAt: 0 }); return c; };
/** Push a server event to the tabs: `tab` set = the one tab (the page-side hub routes it by data.tab), else every tab. Returns how many streams got it. */
export function emit(ctx, event, data = {}, tab = null) {
  const s = state(ctx);
  const body = `event: ${event}\ndata: ${JSON.stringify(tab ? { ...data, tab } : data)}\n\n`;
  let n = 0;
  for (const c of s.clients.values()) for (const r of c.conns) { try { r.write(body); n += 1; } catch { /* closing */ } }
  return n;
}
/** After a tab left a client's list, or a client went: a tab no client lists any more goes through the 4 s grace and, only while other tabs
 *  are still live (the last tab going is the run's end, and stays), leaves the run. */
function settle(ctx, tabs) {
  const s = state(ctx);
  const live = liveTabs(s);
  for (const tab of tabs) {
    if (live.has(tab)) { clearTimeout(s.closing.get(tab)); s.closing.delete(tab); continue; }
    if (s.closing.has(tab)) continue;
    s.closing.set(tab, setTimeout(() => { s.closing.delete(tab); const now = liveTabs(s); if (now.size && !now.has(tab)) dropTab(ctx, tab); }, IDLE_MS));
  }
}
/** 0.15.3 T1: one document = one owning tab. The first live tab that lists a document owns it (its lease); another tab on the same document is a
 *  follower (read-only, told so by the `lease` event). The lease passes to the next claimant when the owner leaves the list. `rev` counts the saves
 *  of a document the host accepted: a save whose base is older than it is refused (acceptWrite). */
export const leaseInfo = (s) => ({ leases: Object.fromEntries([...s.leases].map(([d, l]) => [d, l.tab])), revs: Object.fromEntries([...s.revs].map(([d, r]) => [d, r.rev])) });
function reconcile(ctx) {
  const s = state(ctx);
  const live = new Map();
  const now = Date.now();
  for (const c of connected(s)) for (const [tab, o] of c.tabs) if (!live.has(tab) && beatAge(s, tab, now) <= leaseReleaseMs()) live.set(tab, o.docs || []);
  for (const [tab, d] of s.direct) if (!live.has(tab) && beatAge(s, tab, now) <= leaseReleaseMs()) live.set(tab, d.docs || []); // a tab known only by its own beat
  let changed = false;
  for (const [doc, l] of [...s.leases]) if (!(live.get(l.tab) || []).includes(doc)) { s.leases.delete(doc); changed = true; }
  for (const [tab, docs] of live) for (const doc of docs) if (!s.leases.has(doc)) { s.leases.set(doc, { tab, since: Date.now() }); changed = true; }
  if (changed) emit(ctx, 'lease', leaseInfo(s));
  return changed;
}
/** A tab writes a library document (POST /api/library/mirror, engine/routes/doc-lease.mjs): refused when another LIVE tab owns the document
 *  (NOT_OWNER) or when the tab's base revision is older than the host's (STALE_BASE). Accepted: the revision advances and every tab is told. */
export function acceptWrite(ctx, { tab, doc, base }) {
  const s = state(ctx);
  const owner = s.leases.get(doc)?.tab;
  const live = owner && (([...liveTabs(s)].includes(owner) || s.direct.has(owner)) && beatAge(s, owner) <= leaseReleaseMs());
  if (owner && owner !== tab && live) return { ok: false, code: 'NOT_OWNER', owner, rev: s.revs.get(doc)?.rev ?? 0 };
  const rev = s.revs.get(doc)?.rev ?? 0;
  if (Number.isFinite(base) && base < rev) return { ok: false, code: 'STALE_BASE', owner: owner || null, rev };
  if (!owner || !live) { s.leases.set(doc, { tab, since: Date.now() }); emit(ctx, 'lease', leaseInfo(s)); }
  s.revs.set(doc, { rev: rev + 1, tab, at: Date.now() });
  beat(ctx, tab);
  emit(ctx, 'rev', { doc, rev: rev + 1, by: tab });
  return { ok: true, rev: rev + 1 };
}
/** Tell every tab which tabs are asleep, only when that set changes (the awake tabs show a visible warning). */
function sweepAsleep(ctx) {
  const s = state(ctx);
  const asleep = registry(ctx).tabs.filter((t) => t.asleep);
  const key = asleep.map((t) => t.tab).sort().join(',');
  if (key === s.asleepKey) return;
  s.asleepKey = key;
  emit(ctx, 'asleep', { tabs: asleep.map((t) => ({ tab: t.tab, svc: t.svc })) });
}
const root = (ctx) => subdir(ensure(ctx.workspace).dirs, 'sessions');
const runDir = (ctx, id) => path.join(root(ctx), id);
const tabsOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'run.json') : []).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } }).filter(Boolean);

/** The profile (name, picture, actor id) kept with the host: .local/profile.json. A tab on another origin (a new port)
 *  or another browser profile has an empty localStorage; serve.mjs hands this to the page, so «من أنت؟» is not asked again. */
export const profileFile = () => path.join(localDir(), 'profile.json');
/** H3: a second copy in the save folder's \.system\profile.json.gz (machine state, like the library mirror): an update into a new install folder (a new, empty
 *  .local) or a lost browser storage still finds the owner, so the first-launch card is never asked twice. */
const historyProfile = (ctx) => (ctx?.workspace ? path.join(systemDir(ctx.workspace.dirs), 'profile.json.gz') : null);
function keepProfile(p, ctx) {
  if (!p || typeof p !== 'object' || typeof p.profile !== 'string' || !p.profile || p.profile.length > 2e6) return false;
  try { JSON.parse(p.profile); } catch { return false; }
  // 0.15.9 B8: the person's saved screen preferences (theme, direction, spelling dictionary, ...) travel with the host too, so a new browser profile (Chrome after Edge) starts as they left it.
  // Only `bw:` keys of plain text, never the signing key; merged over what is kept, so a browser that knows fewer keys never wipes the others.
  let prefs = {};
  try { prefs = JSON.parse(fs.readFileSync(profileFile(), 'utf8')).prefs || {}; } catch { /* none yet */ }
  if (p.prefs && typeof p.prefs === 'object') for (const [k, v] of Object.entries(p.prefs).slice(0, 60)) if (/^bw:[A-Za-z0-9:_-]{1,40}$/.test(k) && !/key/i.test(k) && typeof v === 'string' && v.length <= 4000 && (k in prefs || Object.keys(prefs).length < 80)) prefs[k] = v;
  const rec = JSON.stringify({ profile: p.profile, actor: typeof p.actor === 'string' ? p.actor.slice(0, 80) : '', prefs, at: new Date().toISOString() });
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
  if (process.env.BW_HOST_TOKEN) closeBrowsers(hostState()?.browserPids || [], { scan: false }); // the windows this host opened (a background browser left on its profile); no slow process scan here
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
/** The page stamps every push and flush with `seq` (performance.timeOrigin + performance.now(): monotonic in a page, larger after a reload). The
 *  requests of one tab can arrive out of order (a state push still in flight when the pagehide beacon lands); the server keeps the newest and
 *  drops an older one, so a late push never overwrites a newer delta (a typed-just-before-close edit was lost to this). No seq = an older page: applied. */
function writeTab(ctx, b) {
  if (!TAB.test(String(b.tab))) throw Object.assign(new Error('tab'), { code: 400 });
  beat(ctx, b.tab);
  if (typeof b.seq === 'number' && Number.isFinite(b.seq)) {
    const seqs = (state(ctx).seqs ||= new Map());
    if (b.seq < (seqs.get(b.tab) ?? -Infinity)) return false; // older than what this tab already has on disk
    seqs.set(b.tab, b.seq);
  }
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
    // record of the same document, else from the library mirror the Save wrote (library\<id>.json.gz in .system)
    if (entry?.editions && Object.values(entry.editions).some((x) => x && x.raw == null)) {
      let base = null;
      try { const old = JSON.parse(fs.readFileSync(f, 'utf8')); if (old.entry?.id === entry.id) base = old.entry; } catch { /* none */ }
      if (!base && /^doc-[A-Za-z0-9-]{4,64}$/.test(String(entry.id))) {
        try { base = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(subdir(ensure(ctx.workspace).dirs, 'library'), `${entry.id}.json.gz`))).toString('utf8')); } catch { /* none */ }
      }
      for (const [ed, x] of Object.entries(entry.editions)) if (x && x.raw == null) { if (base?.editions?.[ed]?.raw == null) return; x.raw = base.editions[ed].raw; }
    }
    rec = { tab: b.tab, title: String(b.title || '').slice(0, 200), svc: b.svc, ed: b.ed, at: new Date().toISOString(), entry, snap: b.snap || null };
  }
  fs.writeFileSync(f, JSON.stringify(rec));
  return true;
}

/** 0.15.9 R4: the older documents saved in the save folder («المستندات - Documents»): one folder per document, its .html inside (Versions, Exports and Sources are deeper and never listed).
 *  Newest first; `q` filters by name or folder (case-insensitive, Unicode-normalised). Read only: engine/workspace.mjs is not touched. */
export function olderDocs(ctx, q = '', limit = 300) {
  const root = ensure(ctx.workspace).dirs.docs;
  const out = [];
  const norm = (x) => String(x || '').normalize('NFC').toLowerCase();
  const take = (dir, rel) => {
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      if (!e.isFile() || !/\.html?$/i.test(e.name)) continue;
      const file = path.join(dir, e.name);
      let st; try { st = fs.statSync(file); } catch { continue; }
      out.push({ id: [...rel, e.name].join('/'), name: e.name.replace(/\.html?$/i, ''), folder: rel[0] || '', file, at: st.mtime.toISOString(), size: st.size });
    }
  };
  if (!root || !fs.existsSync(root)) return [];
  take(root, []);
  try { for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory() && !/^[._]/.test(d.name)) take(path.join(root, d.name), [d.name]); } catch { /* unreadable */ }
  const needle = norm(q).trim();
  return out.filter((x) => !needle || norm(x.name).includes(needle) || norm(x.folder).includes(needle)).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, Math.max(1, Math.min(1000, Number(limit) || 300)));
}
/** One older document's file by its id (a path relative to the documents folder): never outside it, only .html, not too big. */
function olderDocFile(ctx, id) {
  const root = path.resolve(ensure(ctx.workspace).dirs.docs);
  const f = path.resolve(root, String(id || '').split('/').join(path.sep));
  const rel = path.relative(root, f);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || !/\.html?$/i.test(f) || rel.split(path.sep).length > 2) return null;
  try { const st = fs.statSync(f); return st.isFile() && st.size <= 200 * 1024 * 1024 ? f : null; } catch { return null; }
}
/** What the last session left: its tabs with title, last-edited time and language. */
function lastRun(ctx) {
  const s = state(ctx);
  const dirs = fs.existsSync(root(ctx)) ? fs.readdirSync(root(ctx)).filter((d) => RUN.test(d) && d !== s.runId).sort().reverse() : [];
  for (const d of dirs) {
    const tabs = tabsOf(runDir(ctx, d));
    if (tabs.length) return { runId: d, tabs: tabs.map((x) => ({ tab: x.tab, title: x.title, at: x.at, ed: x.ed || null })).sort((a, b) => (String(a.at) < String(b.at) ? 1 : -1)) };
  }
  return { runId: null, tabs: [] };
}

/** The registry as GET /api/host/health reports it (engine/routes/health.mjs). */
export function registry(ctx) {
  const s = state(ctx);
  const now = Date.now();
  const cl = connected(s);
  const tabs = [];
  for (const c of cl) for (const [tab, o] of c.tabs) {
    const listed = Math.round((o.ago || 0) + (c.listedAt ? now - c.listedAt : 0));
    const heard = s.beats.has(tab) ? now - s.beats.get(tab) : Infinity; // a push, a flush or a bridge reply is a fresher proof than the list
    const lastBeatMs = Math.min(listed, Math.round(heard));
    const rec = { tab, svc: o.svc || null, docs: o.docs || [], automation: !!o.automation, live: true, lastBeatMs, asleep: lastBeatMs > asleepMs(), owns: [...s.leases].filter(([, l]) => l.tab === tab).map(([d]) => d), ...(o.awake ? { awake: o.awake } : {}) };
    // a tab can be listed by two clients (a frozen old leader still holds its stream): the freshest proof wins
    const at = tabs.findIndex((x) => x.tab === tab);
    if (at < 0) tabs.push(rec); else if (rec.lastBeatMs < tabs[at].lastBeatMs) tabs[at] = rec;
  }
  for (const [tab, d] of s.direct) { // a tab known only by its own beat (its worker client froze or is gone): listed live while it beats
    if (tabs.some((x) => x.tab === tab)) continue;
    const lastBeatMs = Math.round(beatAge(s, tab, now));
    if (lastBeatMs > asleepMs()) { s.closed.set(tab, { at: now - lastBeatMs, svc: d.svc, docs: d.docs, automation: d.automation }); s.direct.delete(tab); continue; } // known only by its beat and the beat stopped: it is gone (closed), not asleep
    tabs.push({ tab, svc: d.svc || null, docs: d.docs || [], automation: !!d.automation, live: true, lastBeatMs, asleep: lastBeatMs > asleepMs(), owns: [...s.leases].filter(([, l]) => l.tab === tab).map(([dd]) => dd) });
  }
  for (const [tab, l] of [...s.lost]) { // a discarded or killed tab: still the run's, asleep until it reloads (it re-lists itself) or the grace is over
    if (now - l.at > Math.max(discardGraceMs(), 600000)) { s.lost.delete(tab); continue; }
    if (!tabs.some((x) => x.tab === tab)) tabs.push({ tab, svc: l.svc || null, docs: l.docs || [], automation: !!l.automation, live: false, discarded: true, lastBeatMs: now - l.at, asleep: true, owns: [] });
  }
  for (const [tab, c] of [...s.closed]) { // closed: the tab left the list with a goodbye. Kept for ten minutes so a lease owner that vanished is named, not guessed.
    if (now - c.at > 600000) { s.closed.delete(tab); continue; }
    if (!tabs.some((x) => x.tab === tab)) tabs.push({ tab, svc: c.svc || null, docs: c.docs || [], automation: !!c.automation, live: false, closed: true, lastBeatMs: now - c.at, asleep: false, owns: [] });
  }
  for (const t of tabs) t.state = t.closed ? 'closed' : t.discarded ? 'discarded' : t.asleep ? 'frozen' : 'awake'; // 0.16.0: host_health says it per tab
  const warnings = [];
  for (const t of tabs) if (t.discarded) warnings.push({ code: 'TAB_ASLEEP', tab: t.tab, lastBeatMs: t.lastBeatMs, discarded: true, how: 'the browser discarded this tab to save memory (or its page was killed): click the tab to reload it (its work comes back), or reopen with business-wrap open' });
  for (const t of tabs) if (t.asleep && !t.discarded) warnings.push({ code: 'TAB_ASLEEP', tab: t.tab, lastBeatMs: t.lastBeatMs, how: 'the tab stopped answering (the browser put it to sleep, froze or discarded it): click the tab to wake it, or reopen with business-wrap open (the browser it starts has sleeping tabs off)' });
  if (nConns(s) >= 5) warnings.push({ code: 'MANY_CLIENTS', conns: nConns(s), note: 'five or more event streams: pages that do not use the shared worker each hold one of the six connections a browser allows per origin' });
  for (const t of tabs) if (t.lastBeatMs > 15000) warnings.push({ code: 'TAB_STALE', tab: t.tab, lastBeatMs: t.lastBeatMs });
  return { runId: s.runId, ...leaseInfo(s), clients: cl.map((c) => ({ client: c.id, conns: c.conns.size, tabs: [...c.tabs.keys()], since: new Date(c.since).toISOString() })), tabs, warnings };
}

/** 0.15.9 B4: the browsers Settings offers. `choices` = «default» + every Chromium browser found; `chosen` = what the next window will use and why (`via`). */
export function browserInfo() {
  const installed = installedBrowsers();
  const def = osDefaultBrowser();
  const defId = def ? classifyBrowser(def) : '';
  const chosen = chooseBrowser();
  return {
    saved: savedBrowser(),
    chosen: chosen ? { id: chosen.id, name: chosen.name, via: chosen.via, closable: chosen.chromium } : null,
    systemDefault: def ? { id: defId, name: BROWSERS.find((b) => b.id === defId)?.name || (defId === 'other' ? def.split(/[\\/]/).pop() : defId), chromium: isChromium(defId) } : null,
    choices: BROWSERS.filter((b) => installed[b.id]).map((b) => ({ id: b.id, name: b.name, recommended: b.id === 'chrome' })),
    chromeFound: !!installed.chrome,
  };
}

export default async (req, url, send, ctx, res) => {
  const p = url.pathname;
  if (p === '/api/browser') {
    try {
      if (req.method === 'GET') { send(200, { ok: true, ...browserInfo() }); return true; }
      if (req.method === 'POST') { const b = await readJson(req, 1e4); saveBrowser(typeof b.browser === 'string' ? b.browser : ''); send(200, { ok: true, ...browserInfo() }); return true; } // applies to the next window; nothing already open is touched
    } catch (e) { send(e.code === 400 ? 400 : 500, { error: String(e.message || e).slice(0, 200) }); return true; }
    return false;
  }
  if (p === '/api/profile') {
    // H3: the profile (name, picture, actor id) kept on this machine the moment it is set (not only with a tab's push)
    try {
      if (req.method === 'GET') { send(200, readProfile(ctx) || { profile: null }); return true; }
      if (req.method === 'POST') { const ok = keepProfile(await readJson(req, 4e6), ctx); send(ok ? 200 : 400, { ok }); return true; }
    } catch (e) { send(e.code === 413 ? 413 : 400, { error: String(e.message || e).slice(0, 200) }); return true; }
    return false;
  }
  if (req.method === 'GET' && p === '/api/session/worker.js') { // the SharedWorker: one event stream for every tab of this browser (it must be a URL, a blob: worker is not shared)
    try {
      const js = fs.readFileSync(WORKER_FILE);
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; connect-src 'self'" });
      res.end(js);
    } catch { send(404, { error: 'worker' }); }
    return true;
  }
  if (!p.startsWith('/api/session/') && p !== '/api/host/stop') return false;
  if (!ctx.workspace) return false; // no save folder (a --out server): no sessions
  const s = state(ctx);
  try {
    if (req.method === 'GET' && p === '/api/session/info') { send(200, { runId: s.runId, host: !!process.env.BW_HOST_TOKEN, workspace: { root: ctx.workspace.root, chosen: ctx.workspace.chosen !== false } }); return true; }
    if (req.method === 'GET' && p === '/api/session/leases') { send(200, { ok: true, ...leaseInfo(s) }); return true; }
    if (req.method === 'GET' && p === '/api/session/live') {
      const tab = url.searchParams.get('tab');
      const cid = url.searchParams.get('client');
      if (!res || (cid ? !TAB.test(String(cid)) : !TAB.test(String(tab)))) { send(400, { error: cid ? 'client' : 'tab' }); return true; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: hello\ndata: ${JSON.stringify({ runId: s.runId })}\n\n`);
      clearTimeout(s.timer);
      const c = clientOf(s, cid || `tab:${tab}`);
      c.conns.add(res);
      if (!cid) c.tabs.set(tab, { tab }); // a direct page: a client of one tab
      settle(ctx, [...c.tabs.keys()]); // a reload or a reconnect: the tabs stay
      noteHost({ tabs: liveTabs(s).size });
      req.on('close', () => {
        c.conns.delete(res);
        const gone = [...c.tabs.keys()];
        if (!c.conns.size) s.clients.delete(c.id);
        noteHost({ tabs: liveTabs(s).size });
        reconcile(ctx);
        if (!connected(s).length) {
          // the last connection gone: every tab that closed in the last IDLE_MS went with it (a window closed, the browser quit) and stays
          for (const t of s.closing.values()) clearTimeout(t);
          s.closing.clear();
          // 0.15.9 A4: connections gone while tabs were still listed = no goodbye (a discarded last tab, a killed browser): those tabs are lost, and the host waits before it exits
          const abrupt = [...c.tabs].filter(([t]) => !liveTabs(s).has(t));
          for (const [t, o] of abrupt) if (!s.lost.has(t)) s.lost.set(t, { at: Date.now(), svc: o.svc, docs: o.docs, automation: o.automation });
          clearTimeout(s.timer); s.timer = setTimeout(() => { if (!connected(s).length) finish(ctx); }, Math.max(abrupt.length ? discardGraceMs() : IDLE_MS, agentKeepMs(ctx)));
        } else settle(ctx, gone);
      });
      return true;
    }
    // 0.16.0 (item 5): a tab proves itself on its own, whatever its worker client does (one frozen SharedWorker client must not hold the other tabs)
    if (req.method === 'POST' && p === '/api/session/beat') {
      const b = await readJson(req, 1e5);
      if (!TAB.test(String(b.tab))) { send(400, { error: 'tab' }); return true; }
      beat(ctx, b.tab);
      s.lost.delete(b.tab); s.closed.delete(b.tab);
      s.direct.set(b.tab, { svc: typeof b.svc === 'string' ? b.svc.slice(0, 120) : undefined, docs: Array.isArray(b.docs) ? b.docs.filter((d) => typeof d === 'string').slice(0, 50).map((d) => d.slice(0, 80)) : [], automation: b.automation === true });
      reconcile(ctx);
      send(200, { ok: true });
      return true;
    }
    // editor_action claim: this tab takes the document over now (the owner is asleep, or a ghost)
    if (req.method === 'POST' && p === '/api/session/claim') {
      const b = await readJson(req, 1e5);
      const known = registry(ctx).tabs.some((t) => t.tab === b.tab && t.live);
      if (!TAB.test(String(b.tab)) || typeof b.doc !== 'string' || !b.doc || !known) { send(known ? 400 : 404, { ok: false, code: known ? 'BAD_ARGS' : 'NO_TAB', error: known ? 'tab and doc' : 'the host does not know this tab' }); return true; }
      s.leases.set(b.doc, { tab: b.tab, since: Date.now() });
      emit(ctx, 'lease', leaseInfo(s));
      send(200, { ok: true, doc: b.doc, owner: b.tab });
      return true;
    }
    if (req.method === 'POST' && p === '/api/session/tabs') {
      // the tab registry: {client, tabs:[tabId | {tab, svc, docs:[id], automation, ago}]}; sent by the worker (or leader tab) on every change and every 5 s
      const b = await readJson(req, 2e5);
      if (!TAB.test(String(b.client)) || !Array.isArray(b.tabs) || b.tabs.length > 400) { send(400, { error: 'tabs' }); return true; }
      const c = clientOf(s, b.client);
      // two lists of one client can arrive out of order (the periodic one still on the wire when the list without a closed tab lands): the newest stays
      if (typeof b.seq === 'number') { if (b.seq < (c.listSeq ?? -Infinity)) { send(200, { ok: true, stale: true }); return true; } c.listSeq = b.seq; }
      const next = new Map();
      for (const x of b.tabs) {
        const o = typeof x === 'string' ? { tab: x } : x;
        if (!o || !TAB.test(String(o.tab))) { send(400, { error: 'tab' }); return true; }
        next.set(o.tab, { tab: o.tab, svc: typeof o.svc === 'string' ? o.svc.slice(0, 120) : undefined, docs: Array.isArray(o.docs) ? o.docs.filter((d) => typeof d === 'string').slice(0, 50).map((d) => d.slice(0, 80)) : [], automation: o.automation === true, ago: Math.max(0, Number(o.ago) || 0), ...(awakeOf(o.awake) ? { awake: awakeOf(o.awake) } : {}) });
      }
      const lostNow = new Set(Array.isArray(b.lost) ? b.lost.filter((t) => TAB.test(String(t))).slice(0, 400) : []);
      for (const t of next.keys()) { s.lost.delete(t); s.closed.delete(t); } // it is back
      for (const t of lostNow) if (!next.has(t) && !s.lost.has(t)) { const was = c.tabs.get(t) || {}; s.lost.set(t, { at: Date.now(), svc: was.svc, docs: was.docs, automation: was.automation }); }
      const left = [...c.tabs.keys()].filter((t) => !next.has(t) && !lostNow.has(t)); // a lost tab is not a closed one: no 4 s drop, its record stays
      for (const t of left) { const was = c.tabs.get(t) || {}; if (!liveTabsExcept(s, c, t)) { s.closed.set(t, { at: Date.now(), svc: was.svc, docs: was.docs, automation: was.automation }); s.direct.delete(t); s.beats.delete(t); } }
      c.tabs = next;
      c.listedAt = Date.now();
      if (!c.conns.size && !next.size) s.clients.delete(c.id);
      settle(ctx, [...next.keys(), ...left]);
      reconcile(ctx);
      sweepAsleep(ctx);
      noteHost({ tabs: liveTabs(s).size });
      send(200, { ok: true, n: next.size });
      return true;
    }
    if (req.method === 'POST' && p === '/api/session/_emit' && process.env.BW_TEST_MODE === '1') { // the suites' hook for the event contract; never on in a real host
      const b = await readJson(req);
      send(200, { ok: true, n: emit(ctx, String(b.event), b.data || {}, b.tab || null) });
      return true;
    }
    if (req.method === 'POST' && (p === '/api/session/state' || p === '/api/session/flush')) { s.inflight += 1; let kept; try { kept = writeTab(ctx, await readJson(req)); } finally { s.inflight -= 1; } send(200, kept === false ? { ok: true, stale: true } : { ok: true }); return true; }
    if (req.method === 'GET' && p === '/api/session/tab') {
      const tab = url.searchParams.get('tab');
      const f = path.join(runDir(ctx, s.runId), `${tab}.json`);
      if (!TAB.test(String(tab)) || !fs.existsSync(f)) { send(404, { error: 'not found' }); return true; }
      // x-bw-lost: this tab vanished without a goodbye (a discarded or killed page) and has come back: it puts its saved state back (editor/ext/12-session.js boot)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-bw-lost': s.lost.has(tab) ? '1' : '0' });
      res.end(fs.readFileSync(f, 'utf8'));
      return true;
    }
    if (req.method === 'GET' && p === '/api/session/last') {
      send(200, lastRun(ctx));
      return true;
    }
    // 0.15.9 R4 / R6: the same lists for the popup and for the MCP tools
    if (req.method === 'GET' && p === '/api/session/documents') { send(200, { ok: true, docs: olderDocs(ctx, url.searchParams.get('q') || '', url.searchParams.get('limit') || 300) }); return true; }
    if (req.method === 'GET' && p === '/api/session/document') {
      const f = olderDocFile(ctx, url.searchParams.get('id'));
      if (!f) { send(404, { error: 'not found' }); return true; }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' });
      res.end(fs.readFileSync(f));
      return true;
    }
    if (req.method === 'GET' && p === '/api/session/recent') { send(200, { ok: true, last: lastRun(ctx), older: olderDocs(ctx, url.searchParams.get('q') || '', url.searchParams.get('limit') || 50) }); return true; }
    if (req.method === 'POST' && (p === '/api/session/resume' || p === '/api/session/new')) {
      const { runId, tab: asker, tabs: pick } = await readJson(req);
      if (!RUN.test(String(runId)) || runId === s.runId || !fs.existsSync(runDir(ctx, runId))) { send(400, { error: 'runId' }); return true; }
      if (p === '/api/session/new') { send(200, { ok: archive(ctx, runId) }); return true; }
      // resume: the tabs move into this run, the old run is archived, the server opens every tab at once
      let tabs = tabsOf(runDir(ctx, runId));
      const everyone = tabs.length;
      if (Array.isArray(pick)) { tabs = tabs.filter((x) => pick.includes(x.tab)); if (!tabs.length) { send(400, { error: 'tabs' }); return true; } } // 0.15.9 R1: only the ones the person picked
      const dir = runDir(ctx, s.runId);
      fs.mkdirSync(dir, { recursive: true });
      for (const x of tabs) fs.writeFileSync(path.join(dir, `${x.tab}.json`), JSON.stringify(x));
      if (tabs.length === everyone) archive(ctx, runId);
      else { // the others stay offered next time; the ones moved leave the old run, and an old run left with none is archived
        for (const x of tabs) fs.rmSync(path.join(runDir(ctx, runId), `${x.tab}.json`), { force: true });
        if (!tabsOf(runDir(ctx, runId)).length) archive(ctx, runId);
      }
      // the tab that asked is not a tab of the run: it becomes the first resumed tab (the page navigates itself there),
      // so a resume never adds a tab, and its own fresh record leaves this run
      if (typeof asker === 'string' && TAB.test(asker) && !tabs.some((x) => x.tab === asker)) fs.rmSync(path.join(dir, `${asker}.json`), { force: true });
      const origin = `http://${req.headers.host || `127.0.0.1:${ctx.server?.address()?.port}`}`;
      const urls = tabs.map((x) => `${origin}/?session=${s.runId}&tab=${encodeURIComponent(x.tab)}`);
      const here = typeof asker === 'string' && TAB.test(asker) ? urls.shift() : null; // no asking tab (an agent): every document gets its own window
      const r = urls.length ? launchBrowser(urls) : { chunks: 0 };
      send(200, { ok: true, n: urls.length + (here ? 1 : 0), here, chunks: r.chunks });
      return true;
    }
    if (req.method === 'POST' && p === '/api/host/stop') {
      const { token } = await readJson(req);
      if (!process.env.BW_HOST_TOKEN || token !== process.env.BW_HOST_TOKEN) { send(403, { error: 'token' }); return true; }
      emit(ctx, 'flush'); // every tab sends its state now
      send(200, { ok: true });
      setTimeout(() => finish(ctx), 800);
      return true;
    }
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { error: String(e.message || e).slice(0, 300) }); return true; }
  return false;
};
