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

export const TOOLS = ['list', 'get', 'outline', 'ops', 'action', 'new', 'import'];
const STATUS = { NO_TAB: 404, NO_DOC: 404, CONFLICT: 409, BAD_OP: 422, BAD_ARGS: 400, UNKNOWN_ACTION: 400, REFUSED: 423, TAB_TIMEOUT: 504, TAB_ASLEEP: 503, NOT_OWNER: 409 };
const timeoutMs = () => Number(process.env.BW_BRIDGE_TIMEOUT_MS) || 15000;

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
  if (tab) return tabs.find((t) => t.tab === tab) || null;
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
    const tokenSet = process.env.BW_HOST_TOKEN;
    if (tokenSet && req.headers['x-bw-token'] !== tokenSet) { send(403, { ok: false, code: 'AUTH', error: 'x-bw-token missing or wrong (read it from the host state file)' }); return true; }
    const b = await readJson(req, 64e6);
    const tool = String(b.tool ?? b.op ?? '');
    const doc = b.doc ?? b.doc_id ?? undefined;
    if (!TOOLS.includes(tool)) { send(400, { ok: false, code: 'BAD_ARGS', error: `unknown tool "${tool}"`, tools: TOOLS }); return true; }
    if (doc !== undefined && typeof doc !== 'string') { send(400, { ok: false, code: 'BAD_ARGS', error: 'doc must be a string' }); return true; }
    const target = pickTab(ctx, { doc, tab: b.tab });
    if (target?.notOwner) { send(409, { ok: false, code: 'NOT_OWNER', error: `tab ${b.tab} is a follower of ${doc}: it is owned by tab ${target.notOwner}`, owner: target.notOwner, tab: b.tab, how: 'send the call to the owner (omit tab to let the host route it)' }); return true; }
    if (!target) { send(404, { ok: false, code: 'NO_TAB', error: b.tab ? `tab ${b.tab} is not connected` : 'no editor tab is connected to this host', how: 'open the editor (open_in_editor tool or business-wrap open) and retry' }); return true; }
    if (target.asleep) { send(503, { ok: false, code: 'TAB_ASLEEP', error: `tab ${target.tab} is asleep: it has not answered for ${target.lastBeatMs} ms (Edge sleeping tab, a frozen or discarded page)`, tab: target.tab, lastBeatMs: target.lastBeatMs, how: 'click the tab to wake it, or reopen the editor with business-wrap open (its Edge keeps tabs awake) and retry' }); return true; }
    const id = crypto.randomUUID();
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, code: 'TAB_TIMEOUT', message: `tab ${target.tab} did not answer within ${timeoutMs()} ms`, tab: target.tab, lastBeatMs: registry(ctx).tabs.find((t) => t.tab === target.tab)?.lastBeatMs ?? null }); }, timeoutMs());
      pending.set(id, { done: resolve, timer, tab: target.tab });
      if (!emit(ctx, 'req', { id, tool, doc, args: b.args && typeof b.args === 'object' ? b.args : {} }, target.tab)) { clearTimeout(timer); pending.delete(id); resolve({ ok: false, code: 'NO_TAB', message: 'the tab has no live event stream' }); }
    });
    if (answer.ok) { send(200, { ok: true, result: answer.result }); return true; }
    const { ok: _ok, message, error, ...rest } = answer;
    send(STATUS[answer.code] || 500, { ok: false, ...rest, code: answer.code || 'HOST_ERROR', error: String(message || error || 'failed'), ...(answer.code === 'TAB_TIMEOUT' || !answer.code ? { tab: target.tab } : {}) });
    return true;
  } catch (e) { send(e.code === 400 || e.code === 413 ? e.code : 500, { ok: false, error: String(e.message || e).slice(0, 300) }); return true; }
};
