// mcp lane (0.15.0): the editor_* tool family against a MOCK host that speaks the frozen /api/editor/call contract.
// The real host route and tab bridge arrive in wave 2; this proves the MCP side (validation, routing, error codes, CLI)
// through the real caller: the official MCP client over stdio, and `engine/cli.mjs editor` as a subprocess.
//
//   node tests/mcp-editor-tools.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { testSandbox } from '../engine/testguard.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 110) : ''}`); if (!ok) failed += 1; };

// ── the mock host: two tabs (doc A, doc B), a log of what reached which tab ──
const TOKEN = 'mock-token-123';
const DOCS = { A: { title: 'Doc A', rev: 0 }, B: { title: 'Doc B', rev: 0 } };
const seen = []; // {tab, tool, doc}
let hangDoc = null;
const server = http.createServer((req, res) => {
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/api/host/health') return send(200, { ok: true, version: 'mock', pid: 1, uptimeS: 3, clients: [{ client: 'c1', tabs: ['tA', 'tB'] }], tabs: [{ tab: 'tA', docs: ['A'], live: true, lastBeatMs: 120 }, { tab: 'tB', docs: ['B'], live: true, lastBeatMs: 90 }], pendingRequests: 0, warnings: [] });
  if (req.url !== '/api/editor/call' || req.method !== 'POST') return send(404, { error: 'no route' });
  if (req.headers['x-bw-token'] !== TOKEN) return send(401, { code: 'AUTH', error: 'bad token' });
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const { tool, doc, args } = JSON.parse(raw);
    if (tool === 'list') return send(200, { ok: true, result: { documents: Object.entries(DOCS).map(([id, d]) => ({ id, title: d.title, project: id === 'A' ? 'DEMO' : 'TEST', editions: ['ar'], savedAt: 'now', words: 10 })).filter((d) => !args.project || d.project === args.project) } });
    if (doc && !DOCS[doc]) return send(404, { code: 'NO_DOC', error: `no document ${doc}` });
    if (doc && doc === hangDoc) return; // never answers: the client times out
    seen.push({ tab: doc === 'A' ? 'tA' : 'tB', tool, doc, args });
    if (tool === 'get') return send(200, { ok: true, result: { value: args.pointer ? `value@${args.pointer}` : { control: {} }, pointer: args.pointer || '', locale: args.locale || 'ar' } });
    if (tool === 'outline') return send(200, { ok: true, result: { chapters: [{ pointer: '/chapters/0', title: 'One' }] } });
    if (tool === 'ops') {
      if (args.ops.some((o) => o.old === 'WRONG')) return send(409, { code: 'CONFLICT', error: 'old does not match', path: args.ops.find((o) => o.old === 'WRONG').path, live: 'actual' });
      DOCS[doc].rev += 1;
      return send(200, { ok: true, result: { applied: args.ops.length, group: `g${DOCS[doc].rev}`, opsLen: args.ops.length, hash: `h${DOCS[doc].rev}`, agent: args.agent || null, mirror: args.mirror } });
    }
    if (tool === 'action') return send(200, { ok: true, result: { id: args.id, done: true } });
    if (tool === 'new') return send(200, { ok: true, result: { id: 'N1', title: args.title, project: args.project || null } });
    if (tool === 'import') return send(200, { ok: true, result: { id: 'I1' } });
    return send(400, { code: 'BAD_OP', error: 'unknown tool' });
  });
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const URL_ = `http://127.0.0.1:${server.address().port}`;

const env = { ...process.env, BW_HOST_URL: URL_, BW_HOST_TOKEN: TOKEN, BW_NO_AUTOSTART: '1', BW_EDITOR_TIMEOUT_MS: '800', BW_LOCAL_DIR: testSandbox('local'), BW_LEARNING_DIR: testSandbox('learning') };
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' });
const client = new Client({ name: 'editor-tools-test', version: '1.0.0' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
const call = (name, args) => client.callTool({ name, arguments: args });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  check('tools/list has the family', ['editor_list_documents', 'editor_get', 'editor_outline', 'editor_ops', 'editor_action', 'editor_new', 'editor_import', 'host_health'].every((n) => names.includes(n)), names.filter((n) => /^editor|host/.test(n)).join(','));
  check('instructions tell the agent to use editor_ops for the open document', /editor_ops/.test(client.getInstructions?.() || ''), '');

  let r = await call('editor_list_documents', {});
  check('list: both documents with project and word count', !r.isError && data(r).ok && data(r).documents.length === 2 && data(r).documents[0].words === 10, text(r).slice(0, 120));
  r = await call('editor_list_documents', { project: 'TEST' });
  check('list: project filter reaches the tab', data(r).documents.length === 1 && data(r).documents[0].id === 'B');

  r = await call('editor_get', { doc: 'A', pointer: '/chapters/0', locale: 'ar' });
  check('get: value at pointer', data(r).value === 'value@/chapters/0' && data(r).locale === 'ar', text(r).slice(0, 100));
  r = await call('editor_outline', { doc: 'B' });
  check('outline: chapters with pointers', data(r).chapters?.[0]?.pointer === '/chapters/0');

  // (1) a 40-op batch is one call, one group
  const ops40 = Array.from({ length: 40 }, (_, i) => ({ op: 'setText', path: `/chapters/0/sections/0/blocks/0/paragraphs/${i}`, value: `p${i}` }));
  r = await call('editor_ops', { doc: 'A', ops: ops40, locale: 'ar', agent: 'Claude (Opus 5.5)' });
  check('ops: 40 ops in ONE call, one group, the agent name and mirror:false go through', data(r).applied === 40 && data(r).group === 'g1' && data(r).agent === 'Claude (Opus 5.5)' && data(r).mirror === false, text(r).slice(0, 160));
  check('ops: the call reached tab A only', seen.filter((s) => s.tool === 'ops').every((s) => s.tab === 'tA'));

  // (3) conflict applies nothing: the tab reports it, the tool surfaces code + live value
  const revBefore = DOCS.A.rev;
  r = await call('editor_ops', { doc: 'A', ops: [{ op: 'setText', path: '/chapters/0/title', value: 'x', old: 'WRONG' }], locale: 'ar' });
  check('ops: a wrong old is CONFLICT with the live value, nothing applied', r.isError === true && data(r).code === 'CONFLICT' && data(r).live === 'actual' && DOCS.A.rev === revBefore, text(r).slice(0, 160));

  // BAD_OP is refused client-side: no request reaches the host
  const n0 = seen.length;
  r = await call('editor_ops', { doc: 'A', ops: [{ op: 'setText', path: 'no-slash', value: 'x' }], locale: 'ar' });
  check('ops: a bad path is BAD_OP before any request', r.isError === true && data(r).code === 'BAD_OP' && seen.length === n0, text(r).slice(0, 140));
  r = await call('editor_ops', { doc: 'A', ops: [{ op: 'setText', path: '/a' }], locale: 'ar' });
  check('ops: setText without value is BAD_OP', r.isError === true && data(r).code === 'BAD_OP' && /needs value/.test(text(r)));
  r = await call('editor_ops', { doc: 'A', ops: [{ op: 'setText', path: '/a', value: 'x' }] });
  check('ops: locale is required (no silent default)', r.isError === true && /locale/i.test(text(r)));

  // (4) routing: doc B reaches tab B only; unknown doc is NO_DOC
  seen.length = 0;
  await call('editor_ops', { doc: 'B', ops: [{ op: 'delete', path: '/chapters/1' }], locale: 'en', mirror: 'auto' });
  check('routing: a call for B reaches tab B only', seen.length === 1 && seen[0].tab === 'tB' && seen[0].args.mirror === 'auto');
  r = await call('editor_get', { doc: 'ZZ' });
  check('NO_DOC for a document no tab holds', r.isError === true && data(r).code === 'NO_DOC');

  // (5) error paths
  r = await call('editor_action', { doc: 'A', id: 'formatDisk' });
  check('action: unknown id is UNKNOWN_ACTION with the allow-list', r.isError === true && data(r).code === 'UNKNOWN_ACTION' && data(r).allowed.includes('renumber'));
  r = await call('editor_action', { doc: 'A', id: 'share', args: { to: 'a@b.c', note: 'hi' } });
  check('action: share passes through', data(r).id === 'share' && data(r).done === true);
  hangDoc = 'B';
  const t0 = Date.now();
  r = await call('editor_get', { doc: 'B' });
  check('a tab that never answers is TAB_TIMEOUT (client ceiling 800 ms here)', r.isError === true && data(r).code === 'TAB_TIMEOUT' && Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
  hangDoc = null;

  r = await call('editor_new', { title: 'T', project: 'TEST' });
  check('new: title and project', data(r).id === 'N1' && data(r).project === 'TEST');
  r = await call('editor_import', {});
  check('import: needs document or file', r.isError === true && data(r).code === 'BAD_ARGS');
  r = await call('host_health', {});
  check('host_health: tabs and lastBeatMs', data(r).ok && data(r).tabs.length === 2 && data(r).tabs[0].lastBeatMs === 120);

  // (7) concurrency: six docs, six clients' worth of calls at once, all land
  Object.assign(DOCS, Object.fromEntries(['C', 'D', 'E', 'F', 'G', 'H'].map((k) => [k, { title: k, rev: 0 }])));
  const six = await Promise.all(['C', 'D', 'E', 'F', 'G', 'H'].map((d) => call('editor_ops', { doc: d, ops: ops40.slice(0, 5), locale: 'ar', agent: `agent-${d}` })));
  check('6 concurrent editor_ops on 6 docs all land', six.every((x, i) => !x.isError && data(x).applied === 5 && data(x).agent === `agent-${'CDEFGH'[i]}`));

  // a wrong token is AUTH, a dead host is NO_HOST
  const bad = new Client({ name: 't2', version: '1' });
  const t2 = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...env, BW_HOST_TOKEN: 'nope' }, stderr: 'pipe' });
  await bad.connect(t2);
  r = await bad.callTool({ name: 'editor_list_documents', arguments: {} });
  check('a wrong token is AUTH', r.isError === true && JSON.parse(r.content[0].text).code === 'AUTH');
  await bad.close();
  const dead = new Client({ name: 't3', version: '1' });
  await dead.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...env, BW_HOST_URL: 'http://127.0.0.1:9' }, stderr: 'pipe' }));
  r = await dead.callTool({ name: 'editor_list_documents', arguments: {} });
  check('no listening host is NO_HOST with a how', r.isError === true && JSON.parse(r.content[0].text).code === 'NO_HOST' && !!JSON.parse(r.content[0].text).how);
  await dead.close();

  // the CLI twin, through the real entry point
  // async: the mock host lives in this process, so a blocking spawnSync would starve it
  const cli = (args, input) => new Promise((done) => { const p = spawn(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'editor', ...args], { env }); let stdout = ''; let stderr = ''; p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; }); p.on('close', (status) => done({ status, stdout, stderr })); p.stdin.end(input || ''); });
  const opsFile = path.join(testSandbox('cli'), 'ops.json'); fs.mkdirSync(path.dirname(opsFile), { recursive: true });
  fs.writeFileSync(opsFile, JSON.stringify(ops40.slice(0, 3)));
  let c = await cli(['ops', '--doc', 'A', '--locale', 'ar', '--ops-file', opsFile, '--agent', 'cli-agent']);
  check('cli: editor ops --ops-file applies', c.status === 0 && JSON.parse(c.stdout).applied === 3 && JSON.parse(c.stdout).agent === 'cli-agent', (c.stdout + c.stderr).slice(0, 160));
  c = await cli(['ops', '--doc', 'A', '--locale', 'ar', '--ops-file', '-'], JSON.stringify({ ops: ops40.slice(0, 2) }));
  check('cli: editor ops from stdin', c.status === 0 && JSON.parse(c.stdout).applied === 2, (c.stdout + c.stderr).slice(0, 160));
  c = await cli(['ops', '--doc', 'A', '--locale', 'ar', '--ops-file', '-'], JSON.stringify([{ op: 'explode', path: '/x' }]));
  check('cli: a bad op exits 1 with BAD_OP JSON on stderr', c.status === 1 && JSON.parse(c.stderr).code === 'BAD_OP', c.stderr.slice(0, 160));
  c = await cli(['get', '--doc', 'B', '--pointer', '/chapters/0']);
  check('cli: editor get', c.status === 0 && JSON.parse(c.stdout).value === 'value@/chapters/0');
  c = await cli(['list']);
  check('cli: editor list', c.status === 0 && JSON.parse(c.stdout).documents.length >= 2);
  c = await cli(['health']);
  check('cli: editor health', c.status === 0 && JSON.parse(c.stdout).tabs.length === 2);
  c = await cli(['nonsense']);
  check('cli: unknown verb exits 2', c.status === 2, c.stderr.slice(0, 100));
} catch (e) {
  check('editor tools run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await client.close().catch(() => {});
  server.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
