// The editor bridge (0.15.0): a tool (the MCP server, the CLI) edits the document that is OPEN in a browser tab, through the host.
//
//   POST /api/editor/call   header x-bw-token (required when the host has a token: every host started by `open`)
//        body {tool, doc?, tab?, args}   tool = list | get | outline | ops | action | new | import   (`op` and `doc_id` are accepted as aliases)
//        200 {ok:true, result}                         the tab's answer
//        404 {ok:false, code:'NO_TAB'}                 no live tab at all (open the editor first)
//        404 {ok:false, code:'NO_DOC'}                 the tab has no such document in its library
//        503 TAB_ASLEEP {tab, lastBeatMs, how}        the tab stopped answering (sleeping tab): said at once, not after the 15 s timeout
//        409 NOT_OWNER {owner}                          the document is owned by another tab (one document = one tab)
//        409 CONFLICT · 422 BAD_OP · 400 BAD_ARGS|UNKNOWN_ACTION · 423 REFUSED (locked) · 504 {code:'TAB_TIMEOUT', tab, lastBeatMs}
//   POST /api/editor/reply  body {id, ok, result | error:{code, message, ...}}   what the tab sends back (page origin check, as every non-GET route)
//
// The request travels to the tab as the SSE event `req {id, tool, doc, args}` addressed to ONE tab (engine/routes/session.mjs emit), and waits
// in ctx.pendingRequests until the tab's reply (or BW_BRIDGE_TIMEOUT_MS, default 15 s). The tab half is editor/ext/12-session.js → BW.bridge.
import crypto from 'node:crypto';
import { readJson } from '../workspace.mjs';
import { emit, registry, beat } from './session.mjs';
import { launchBrowser } from '../host.mjs';
import { validateEdits } from '../edits.mjs';
import { workspaceNote } from './health.mjs';
import { tokenRefused } from '../host-lifecycle.mjs';

export const TOOLS = ['list', 'get', 'outline', 'ops', 'action', 'new', 'import', 'assign', 'trash'];
const STATUS = { NO_TAB: 404, NO_DOC: 404, CONFLICT: 409, BAD_OP: 422, BAD_ARGS: 400, UNKNOWN_ACTION: 400, REFUSED: 423, TAB_TIMEOUT: 504, TAB_ASLEEP: 503, NOT_OWNER: 409 };
const timeoutMs = () => Number(process.env.BW_BRIDGE_TIMEOUT_MS) || 15000;
/** an export, a share or a Save-HTML prints and post-processes for many seconds: they get their own, longer ceiling (BW_EXPORT_TIMEOUT_MS, default 120 s).
 *  A batch is applied one op at a time so the person can watch it (BW_OP_PACE_MS each): its ceiling grows with its length. */
const callTimeoutMs = (tool, args) => {
  if (tool === 'action' && ['exportPdf', 'share', 'saveHtml'].includes(args?.id)) return Math.max(timeoutMs(), Number(process.env.BW_EXPORT_TIMEOUT_MS) || 120000);
  if (tool === 'ops' && Array.isArray(args?.ops)) return timeoutMs() + args.ops.length * (Number(process.env.BW_OP_PACE_MS ?? 120) + 40);
  return timeoutMs();
};
/** a call may carry request_id. The same id twice is ONE call: joined while it runs, answered from memory (replayed: true) after it succeeded, so a retry after
 *  TAB_TIMEOUT never doubles an insert or an export. The tab keeps the same memory (editor.js BRIDGE), for a request the host gave up on that the tab then finished. */
const REPLAY_MS = 10 * 60 * 1000;
const repliesOf = (ctx) => (ctx.bridgeReplies ||= new Map());
/** a call to a sleeping tab waits this long for it to wake before TAB_ASLEEP (editor_ops queues instead of failing at once). */
const queueMs = () => Number(process.env.BW_QUEUE_MS ?? 5000);
/** editor_new with no awake tab opens a window itself and waits this long for it. */
const newTabWaitMs = () => Number(process.env.BW_NEW_TAB_WAIT_MS) || 25000;
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

const pendingOf = (ctx) => {
  if (!ctx.bridgePending) { ctx.bridgePending = new Map(); ctx.pendingRequests = () => ctx.bridgePending.size; } // GET /api/host/health reads it
  return ctx.bridgePending;
};

/** The tab that should serve a call. A document has ONE owning tab (its lease, engine/routes/session.mjs): ops and reads of it go there and nowhere else.
 *  Otherwise: the one named, else a tab with the document open, else a tool's tab (automation), else the most recently heard from; a sleeping tab is
 *  taken only when no awake one is left. {notOwner} when the named tab is a follower of the document. */
export function pickTab(ctx, { doc, tab }) {
  const r = registry(ctx);
  const tabs = r.tabs.filter((t) => t.live);
  const owner = doc ? r.leases?.[doc] : null;
  if (owner && tab && tab !== owner && tabs.some((t) => t.tab === owner)) return { notOwner: owner };
  if (tab) return tabs.find((t) => t.tab === tab) || r.tabs.find((t) => t.tab === tab && t.discarded) || null; // a lost (discarded / killed) tab is asleep, not absent: TAB_ASLEEP says what to do
  if (owner) { const o = tabs.find((t) => t.tab === owner); if (o) return o; }
  const fresh = (a) => [...a].sort((x, y) => (x.asleep - y.asleep) || (x.lastBeatMs - y.lastBeatMs))[0] || null;
  if (doc) { const own = fresh(tabs.filter((t) => t.docs.includes(doc) || t.svc === doc)); if (own) return own; }
  return fresh(tabs.filter((t) => t.automation)) || fresh(tabs);
}

export default async (req, url, send, ctx) => {
  const p = url.pathname;
  if (req.method !== 'POST' || (p !== '/api/editor/call' && p !== '/api/editor/reply')) return false;
  const pending = pendingOf(ctx);
  try {
    if (p === '/api/editor/reply') {
      const b = await readJson(req, 64e6);
      const w = typeof b.id === 'string' ? pending.get(b.id) : null;
      if (!w) { send(404, { ok: false, code: 'NO_REQUEST', error: 'no such request (answered already, or timed out)' }); return true; }
      pending.delete(b.id);
      beat(ctx, w.tab); // it answered: its page runs
      clearTimeout(w.timer);
      w.done(b.ok === false || b.error ? { ok: false, ...(typeof b.error === 'object' && b.error ? b.error : { message: String(b.error || 'failed') }) } : { ok: true, result: b.result });
      send(200, { ok: true });
      return true;
    }
    if (tokenRefused(req)) { send(403, { ok: false, code: 'AUTH', error: 'x-bw-token missing or wrong (read it from the host state file)' }); return true; }
    const b = await readJson(req, 64e6);
    const tool = String(b.tool ?? b.op ?? '');
    const doc = b.doc ?? b.doc_id ?? undefined;
    ctx.agentAt = Date.now(); // a tool is using this host: it does not exit when its last tab goes (engine/routes/session.mjs agentKeepMs)
    const rid = typeof (b.request_id ?? b.args?.request_id) === 'string' ? String(b.request_id ?? b.args.request_id).slice(0, 80) : '';
    if (rid) {
      const memo = repliesOf(ctx).get(rid);
      if (memo && Date.now() - memo.at < REPLAY_MS) {
        const prior = await memo.promise;
        if (prior.status === 200) { send(200, { ...prior.body, result: { ...(prior.body.result && typeof prior.body.result === 'object' ? prior.body.result : { value: prior.body.result }), replayed: true } }); return true; }
      }
    }
    if (tool === 'ops') { // BAD_OP before any tab is asked: the op vocabulary, the shapes and a data URI that does not decode (item 7)
      const errs = validateEdits({ version: 1, document: 'x', baseHash: `sha256:${'0'.repeat(64)}`, locale: b.args?.locale === 'en' ? 'en' : 'ar', ops: Array.isArray(b.args?.ops) ? b.args.ops : [] });
      if (!Array.isArray(b.args?.ops) || !b.args.ops.length) errs.unshift('ops must be a non-empty array');
      if (errs.length) { send(422, { ok: false, code: 'BAD_OP', error: `invalid ops: ${errs.join('; ')}`, problems: errs }); return true; }
    }
    if (!TOOLS.includes(tool)) { send(400, { ok: false, code: 'BAD_ARGS', error: `unknown tool "${tool}"`, tools: TOOLS }); return true; }
    if (doc !== undefined && typeof doc !== 'string') { send(400, { ok: false, code: 'BAD_ARGS', error: 'doc must be a string' }); return true; }
    const run = async () => {
      let target = pickTab(ctx, { doc, tab: b.tab });
      if (tool === 'new' && !b.tab && (!target || target.asleep)) { // editor_new always gets an awake tab: a window with the keep-awake launch is opened when there is none
        try { launchBrowser([`http://${req.headers.host || `127.0.0.1:${ctx.server?.address()?.port}`}/?automation=1`]); } catch { /* no browser: the waits below end in the plain answers */ }
        for (const t0 = Date.now(); Date.now() - t0 < newTabWaitMs();) { await nap(250); const t = pickTab(ctx, { doc, tab: b.tab }); if (t && !t.asleep) { target = t; break; } }
      } else if (target?.asleep && !target.notOwner && !target.discarded) {
        for (const t0 = Date.now(); Date.now() - t0 < queueMs();) { await nap(200); const t = pickTab(ctx, { doc, tab: b.tab }); if (t && !t.asleep) { target = t; break; } if (t) target = t; }
      }
      if (target?.notOwner) return { status: 409, body: { ok: false, code: 'NOT_OWNER', error: `tab ${b.tab} is a follower of ${doc}: it is owned by tab ${target.notOwner}`, owner: target.notOwner, tab: b.tab, how: 'send the call to the owner (omit tab to let the host route it)' } };
      if (!target) return { status: 404, body: { ok: false, code: 'NO_TAB', error: b.tab ? `tab ${b.tab} is not connected` : 'no editor tab is connected to this host', how: 'open the editor (open_in_editor tool or business-wrap open) and retry' } };
      if (target.asleep) return { status: 503, body: { ok: false, code: 'TAB_ASLEEP', error: `tab ${target.tab} is asleep: it has not answered for ${target.lastBeatMs} ms (the browser put it to sleep, froze or discarded it)`, tab: target.tab, lastBeatMs: target.lastBeatMs, how: 'click the tab to wake it, or reopen the editor with business-wrap open (the browser it starts keeps tabs awake) and retry' } };
      const id = crypto.randomUUID();
      const limit = callTimeoutMs(tool, b.args);
      const answer = await new Promise((resolve) => {
        const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, code: 'TAB_TIMEOUT', message: `tab ${target.tab} did not answer within ${limit} ms`, tab: target.tab, lastBeatMs: registry(ctx).tabs.find((t) => t.tab === target.tab)?.lastBeatMs ?? null, ...(rid ? { retry: 'send the same request_id again: it is applied once' } : {}) }); }, limit);
        pending.set(id, { done: resolve, timer, tab: target.tab });
        if (!emit(ctx, 'req', { id, tool, doc, args: b.args && typeof b.args === 'object' ? b.args : {} }, target.tab)) { clearTimeout(timer); pending.delete(id); resolve({ ok: false, code: 'NO_TAB', message: 'the tab has no live event stream' }); }
      });
      const ws = ctx.workspace ? workspaceNote(ctx.workspace) : null; // item 8: a change of the save folder rides on every reply
      if (answer.ok) return { status: 200, body: { ok: true, result: answer.result && typeof answer.result === 'object' && !Array.isArray(answer.result) ? { ...answer.result, ...(ws ? { workspace: ws } : {}) } : answer.result } };
      const { ok: _ok, message, error, ...rest } = answer;
      return { status: STATUS[answer.code] || 500, body: { ok: false, ...rest, code: answer.code || 'HOST_ERROR', error: String(message || error || 'failed'), ...(answer.code === 'TAB_TIMEOUT' || !answer.code ? { tab: target.tab } : {}), ...(ws?.changed ? { workspace: ws } : {}) } };
    };
    const promise = run();
    if (rid) { const m = repliesOf(ctx); m.set(rid, { at: Date.now(), promise }); for (const [k, v] of m) if (Date.now() - v.at > REPLAY_MS || m.size > 500) m.delete(k); promise.then((r) => { if (r.status !== 200) m.delete(rid); }).catch(() => m.delete(rid)); }
    const r = await promise;
    send(r.status, r.body);
    return true;
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { ok: false, error: String(e.message || e).slice(0, 300) }); return true; }
};
