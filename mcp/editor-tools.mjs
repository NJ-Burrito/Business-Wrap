// The live-editor tool family (0.15.0, architect F3): an agent edits the document that is OPEN in the editor, through the
// local host, instead of editing files or driving the browser over CDP. Every verb is one POST to the host's frozen
// bridge contract:
//
//   POST /api/editor/call   header x-bw-token: <host.json token>   body {tool, doc?, args}
//     200 {ok:true, result}                                  the tab's answer
//     404 {code:'NO_DOC'} · 504 {code:'TAB_TIMEOUT', tab, lastBeatMs} · 4xx {code:'CONFLICT'|'BAD_OP'|'UNKNOWN_ACTION', ...}
//   GET  /api/host/health                                    the frozen health schema (architect.md §2)
//
// The host half (routes/editor.mjs) and the tab half (ext/19-bridge.js) are other lanes'; this file is written against the
// contract and tested with a mock host (mcp/test/editor-tools.test.mjs). docs/automation.md states the contract.
import http from 'node:http';
import { validateEdits } from '../engine/edits.mjs';

/** An error an agent can branch on: `code` is one of NO_HOST NO_DOC TAB_TIMEOUT CONFLICT BAD_OP UNKNOWN_ACTION BAD_ARGS AUTH HOST_ERROR RESTART_REQUIRED. */
export class BwError extends Error {
  constructor(code, message, data = {}) { super(message); this.bw = true; this.code = code; this.data = data; }
}

/** The actions the tab runs on a document (architect §4); anything else is refused here and again by the tab. */
export const EDITOR_ACTIONS = ['renumber', 'check', 'saveHtml', 'share', 'exportPdf'];
const TOOLS = ['list', 'get', 'outline', 'ops', 'action', 'new', 'import'];
export const callTimeoutMs = () => Number(process.env.BW_EDITOR_TIMEOUT_MS) || 45000;

/** Where the host is and the token that authorises a call: BW_HOST_URL + BW_HOST_TOKEN (tests, a remote debug host), else host.json
 *  of this install; when no host is running one is started (no browser window: the host opens the tab it needs). */
export async function hostTarget({ start = true } = {}) {
  if (process.env.BW_HOST_URL) return { url: process.env.BW_HOST_URL.replace(/\/$/, ''), token: process.env.BW_HOST_TOKEN || '' };
  const { hostState, alive } = await import('../engine/host.mjs');
  let h = hostState();
  if (!(h && alive(h.pid)) && start && process.env.BW_NO_AUTOSTART !== '1') {
    try { const { open } = await import('../engine/cli.mjs'); await open({ inputs: [], browser: false }); } catch (e) { throw new BwError('NO_HOST', `the Business-Wrap host could not be started: ${e?.message || e}`, { how: 'run the open_in_editor tool, or business-wrap open, and retry' }); }
    h = hostState();
  }
  if (!(h && alive(h.pid))) throw new BwError('NO_HOST', 'no Business-Wrap host is running', { how: 'run the open_in_editor tool (or business-wrap open) first' });
  return { url: `http://127.0.0.1:${h.port}`, token: h.token || '' };
}

/** One JSON request to the host. Resolves {status, body}; a refused or reset connection is NO_HOST, no answer in time is TAB_TIMEOUT. */
function request(target, method, route, payload) {
  return new Promise((resolve, reject) => {
    const data = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
    const req = http.request(new URL(route, target.url), { method, headers: { 'x-bw-token': target.token, ...(data ? { 'content-type': 'application/json', 'content-length': data.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 300) }; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.setTimeout(callTimeoutMs(), () => req.destroy(Object.assign(new Error('timeout'), { bwTimeout: true })));
    req.on('error', (e) => reject(e.bwTimeout ? new BwError('TAB_TIMEOUT', `the host did not answer within ${callTimeoutMs()} ms`, { client_side: true }) : new BwError('NO_HOST', `the host at ${target.url} is not reachable (${e.code || e.message})`, { how: 'run the open_in_editor tool (or business-wrap open) and retry' })));
    if (data) req.write(data);
    req.end();
  });
}

const KNOWN = new Set(['NO_HOST', 'NO_DOC', 'TAB_TIMEOUT', 'CONFLICT', 'BAD_OP', 'UNKNOWN_ACTION', 'BAD_ARGS']);
function failFrom(status, body) {
  const code = KNOWN.has(body?.code) ? body.code : status === 401 || status === 403 ? 'AUTH' : status === 404 ? 'NO_DOC' : status === 504 ? 'TAB_TIMEOUT' : 'HOST_ERROR';
  const { code: _c, message, error, ok: _o, ...rest } = body || {};
  return new BwError(code, String(message || error || `host answered ${status}`), { ...rest, status });
}
const flat = (r) => (r && typeof r === 'object' && !Array.isArray(r) ? r : { result: r });

/** Call one tab verb through the host. Returns the tab's result as an object (always with ok:true); throws BwError otherwise. */
export async function callEditor(tool, { doc, args = {} } = {}, { target } = {}) {
  if (!TOOLS.includes(tool)) throw new BwError('BAD_ARGS', `unknown editor tool ${tool}`);
  const t = target || await hostTarget();
  const { status, body } = await request(t, 'POST', '/api/editor/call', { tool, ...(doc ? { doc } : {}), args });
  if (status >= 200 && status < 300 && body?.ok !== false) return { ok: true, ...flat(body && 'result' in body ? body.result : body) };
  throw failFrom(status, body);
}

/** Refuse a malformed batch before it costs a round trip: the same op vocabulary and path syntax as the edits contract v1. */
export function checkOps(ops, locale) {
  if (!Array.isArray(ops) || !ops.length) throw new BwError('BAD_OP', 'ops must be a non-empty array');
  const errs = validateEdits({ version: 1, document: 'x', baseHash: `sha256:${'0'.repeat(64)}`, locale, ops });
  if (errs.length) throw new BwError('BAD_OP', `invalid ops: ${errs.join('; ')}`, { problems: errs });
}

/** Register the family on an McpServer. `z` is the bundled zod, `guard` the server's error/decorate wrapper. */
export function registerEditorTools(server, z, guard) {
  const DOC = z.string().describe('Document id: the control.documentId / service code shown by editor_list_documents');
  const LOCALE = z.enum(['ar', 'en']);
  const RW = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  const RO = { readOnlyHint: true, openWorldHint: false };

  server.registerTool('editor_list_documents', {
    title: 'List the documents in the open editor',
    description: 'The documents in the editor library of the running host: {documents:[{id, title, project, editions, savedAt, words}]}. Optional project filter. Use these ids with the other editor_* tools. Starts the host if none runs.',
    inputSchema: { project: z.string().optional().describe('Only the documents of this project') },
    annotations: RO,
  }, guard(({ project }) => callEditor('list', { args: project ? { project } : {} })));

  server.registerTool('editor_get', {
    title: 'Read a document from the open editor',
    description: 'The value at a JSON pointer (default: the whole document) of one edition of a document, as the editor holds it now (unsaved edits included): {value, pointer, locale}. Read-only.',
    inputSchema: { doc: DOC, pointer: z.string().optional().describe('JSON pointer such as /chapters/2/sections/0 (default: the whole document)'), locale: LOCALE.optional().describe('Edition (default: the editor\'s current one)') },
    annotations: RO,
  }, guard(({ doc, pointer, locale }) => callEditor('get', { doc, args: { ...(pointer ? { pointer } : {}), ...(locale ? { locale } : {}) } })));

  server.registerTool('editor_outline', {
    title: 'Outline of a document in the open editor',
    description: 'Chapters, sections, block kinds, block ids, numbers, counts and a JSON pointer for each node, read from the live editor. Use it to find the pointer an op needs.',
    inputSchema: { doc: DOC, locale: LOCALE.optional().describe('Edition (default: the editor\'s current one)') },
    annotations: RO,
  }, guard(({ doc, locale }) => callEditor('outline', { doc, args: locale ? { locale } : {} })));

  server.registerTool('editor_ops', {
    title: 'Edit the open document (one undo step)',
    description: 'Apply a batch of edit ops (setText, replace, insert, delete, move, duplicate; same vocabulary and JSON-pointer paths as the edits contract v1) to the document OPEN in the editor. The batch is validated on a copy first and applied as ONE undo group, saved to the library and signed in the provenance log as the agent. An op may carry old (the value it expects): a mismatch returns CONFLICT with the live value and applies nothing. Use this, not apply_edits, to change what the user is looking at.',
    inputSchema: {
      doc: DOC,
      ops: z.array(z.object({ op: z.enum(['setText', 'replace', 'insert', 'delete', 'move', 'duplicate']), path: z.string() }).passthrough()).min(1).describe('The ops, in order'),
      locale: LOCALE.describe('The edition the ops belong to (required, no silent default)'),
      mirror: z.union([z.boolean(), z.literal('auto')]).optional().describe('Also apply to the other edition (default false)'),
      agent: z.string().optional().describe('The agent name shown in the provenance panel, e.g. "Claude (Opus 5.5)"'),
      group: z.string().optional().describe('A label for the one undo group'),
    },
    annotations: RW,
  }, guard(({ doc, ops, locale, mirror, agent, group }) => {
    checkOps(ops, locale);
    return callEditor('ops', { doc, args: { ops, locale, mirror: mirror ?? false, ...(agent ? { agent } : {}), ...(group ? { group } : {}) } });
  }));

  server.registerTool('editor_action', {
    title: 'Run an editor action on a document',
    description: `Run one allow-listed action on a document in the open editor: ${EDITOR_ACTIONS.join(', ')}. share takes args {to, note} (the coworker-share dialog, recipient may be empty). Anything else returns UNKNOWN_ACTION.`,
    inputSchema: { doc: DOC, id: z.string().describe(`One of ${EDITOR_ACTIONS.join(', ')}`), args: z.record(z.any()).optional().describe('Action arguments, e.g. {to, note} for share') },
    annotations: RW,
  }, guard(({ doc, id, args }) => {
    if (!EDITOR_ACTIONS.includes(id)) throw new BwError('UNKNOWN_ACTION', `unknown action "${id}"`, { allowed: EDITOR_ACTIONS });
    return callEditor('action', { doc, args: { id, ...(args ? { args } : {}) } });
  }));

  server.registerTool('editor_new', {
    title: 'Create a document in the open editor',
    description: 'Create a new blank document in the editor library, optionally inside a project: {id, title, project}.',
    inputSchema: { title: z.string().min(1), project: z.string().optional(), template: z.string().optional().describe('A template id (default: the blank structure)') },
    annotations: RW,
  }, guard(({ title, project, template }) => callEditor('new', { args: { title, ...(project ? { project } : {}), ...(template ? { template } : {}) } })));

  server.registerTool('editor_import', {
    title: 'Import a document into the open editor',
    description: 'Put a document into the editor library (and a project) so it can be edited live: give document (a document JSON object) or file (a path of a document JSON the host can read).',
    inputSchema: { document: z.record(z.any()).optional(), file: z.string().optional(), project: z.string().optional() },
    annotations: RW,
  }, guard(({ document, file, project }) => {
    if (!document && !file) throw new BwError('BAD_ARGS', 'give document or file');
    return callEditor('import', { args: { ...(document ? { document } : {}), ...(file ? { file } : {}), ...(project ? { project } : {}) } });
  }));

  server.registerTool('host_health', {
    title: 'Health of the local host and its tabs',
    description: 'GET /api/host/health: {ok, version, pid, uptimeS, clients, tabs:[{tab, docs, live, lastBeatMs}], pendingRequests, warnings}. A tab with lastBeatMs above 15000 is hung. Does not start a host.',
    inputSchema: {},
    annotations: RO,
  }, guard(async () => {
    const t = await hostTarget({ start: false });
    const { status, body } = await request(t, 'GET', '/api/host/health');
    if (status === 200) return { ok: true, ...flat(body) };
    throw failFrom(status, body);
  }));
}
