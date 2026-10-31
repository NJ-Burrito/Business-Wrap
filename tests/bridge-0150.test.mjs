// 0.15.0 editor bridge (council finding 1): the editor_* tools reach a REAL tab. Real caller end to end: the official MCP client over stdio ->
// mcp/cli.mjs -> the real host (engine/serve.mjs, token, SSE) -> a real Edge tab (editor/ext/12-session.js -> BW.bridge) -> reply.
//   1. open_in_editor (no browser) returns library:true and the library id the tools take
//   2. no tab connected -> NO_TAB (a clear code, not a 404 guess)
//   3. a tool reads the open document (list, outline, get), the tab is the one that answered
//   4. editor_ops applies a 12-op batch as ONE undo step (one BW.undo() reverts all 12), provenance names the agent, its actor id is not the person's, the chain verifies
//   5. a wrong `old` is a CONFLICT and applies nothing; unknown action, bad op and a missing locale are refused with their codes
//   6. a tab that never replies (its page is blocked) -> TAB_TIMEOUT with the tab id; the host forgets the request (pendingRequests back to 0) and the tab answers again after
//   node tests/bridge-0150.test.mjs      (BRIDGE_BROWSER=chromium to use the bundled Chrome instead of Edge)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-bridge-'));
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BRIDGE_TIMEOUT_MS: '2500', BW_EDITOR_TIMEOUT_MS: '20000', BW_IDLE_MS: '1500' };
fs.mkdirSync(env.BW_WORKSPACE, { recursive: true });
Object.assign(process.env, env); // this process reads the same host.json
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) { try { if (await fn()) return true; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  bridge: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 220) : ''}`); if (!ok) failed += 1; };

const client = new Client({ name: 'bridge-test', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
const call = (name, args) => client.callTool({ name, arguments: args });
let browser = null, ctx = null, page = null;
try {
  await client.connect(transport);

  // 1. open_in_editor: no browser; the host queues the document in the library
  const oe = await call('open_in_editor', { documents: [path.join(REPO, 'samples', 'event-permit')] });
  const oed = data(oe);
  check('open_in_editor returns library:true and a library id', !oe.isError && oed.library === true && /^doc-/.test(oed.library_id || ''), text(oe).slice(0, 200));
  const DOC = oed.library_id;
  const hs = H.hostState();
  const base = `http://127.0.0.1:${hs?.port}`;
  const health = async () => (await fetch(`${base}/api/host/health`, { signal: AbortSignal.timeout(4000) })).json();

  // 2. no tab at all
  let r = await call('editor_list_documents', {});
  check('no tab connected -> NO_TAB', r.isError === true && data(r).code === 'NO_TAB', text(r));
  r = await call('editor_get', { doc: DOC, locale: 'ar' });
  check('no tab: a document call is NO_TAB too', r.isError === true && data(r).code === 'NO_TAB', text(r));

  // a real tab (tool's tab: ?automation=1)
  const edge = H.edgePath();
  const opts = process.env.BRIDGE_BROWSER === 'chromium' || !edge ? launchOptions() : { ...launchOptions(), executablePath: edge };
  browser = await chromium.launch(opts);
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  page = await ctx.newPage();
  page.on('pageerror', (e) => out.push(`NOTE  pageerror: ${String(e.message).slice(0, 160)}`));
  await page.goto(`${base}/?automation=1#doc=${DOC}`);
  await page.waitForFunction((id) => window.BW?.ready && document.documentElement.dataset.bwSession && window.BW.S.svc === id, DOC, { timeout: 60000 });
  check('the tab opened the queued library document (positive sample: S.svc is the id)', (await page.evaluate(() => window.BW.S.svc)) === DOC);
  const listed = await until(async () => { const h = await health(); return h.tabs.some((t) => t.docs.includes(DOC)); }, 15000);
  const hl = await health();
  check('health lists the tab with its document and pendingRequests 0', listed && hl.pendingRequests === 0 && hl.tabs.length === 1 && hl.tabs[0].automation === true, JSON.stringify(hl.tabs));

  // 3. reads
  r = await call('editor_list_documents', {});
  const lst = data(r);
  check('editor_list_documents lists the document', !r.isError && lst.documents?.some((d) => d.id === DOC && d.editions.includes('ar') && d.words > 0), text(r).slice(0, 200));
  r = await call('editor_outline', { doc: DOC, locale: 'ar' });
  const ol = data(r);
  check('editor_outline has chapters, sections and pointers', !r.isError && ol.chapters?.length > 1 && ol.chapters[0].sections?.[0]?.pointer?.startsWith('/chapters/0/sections/0'), text(r).slice(0, 200));
  r = await call('editor_get', { doc: DOC, pointer: '/control/title', locale: 'ar' });
  const title0 = data(r)?.value;
  check('editor_get reads a pointer from the live editor', !r.isError && typeof title0 === 'string' && title0.length > 3, text(r).slice(0, 200));

  // 4. one batch = one undo step, signed as the agent
  const paths = [];
  for (const ch of ol.chapters) { paths.push(ch.pointer + '/title'); for (const s of ch.sections) paths.push(s.pointer + '/title'); }
  const edits = paths.slice(0, 12);
  const docBefore = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc));
  const opsLenBefore = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.ops.length);
  const ops = [];
  for (const p of edits) { const old = (await call('editor_get', { doc: DOC, pointer: p, locale: 'ar' })); ops.push({ op: 'setText', path: p, value: `${data(old).value} (محرَّر)`, old: data(old).value }); }
  check('the batch is 12 ops', ops.length === 12, `got ${ops.length}`);
  r = await call('editor_ops', { doc: DOC, ops, locale: 'ar', agent: 'Claude (Test)', group: 'bridge test' });
  const ap = data(r);
  check('editor_ops applied 12 ops in one group', !r.isError && ap.applied === 12 && /^g[a-z0-9]+(-[a-z0-9-]+)?$/.test(ap.group) && ap.actor?.name === 'Claude (Test)' && /^sha256:/.test(ap.hash || ''), text(r).slice(0, 240));
  const st = await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc].ar; return { json: JSON.stringify(e.doc), n: e.ops.length, groups: [...new Set(e.ops.slice(-12).map((o) => o.id.split('.')[0]))] }; });
  check('the tab shows the 12 edits, all in one group', st.json !== docBefore && st.n === opsLenBefore + 12 && st.groups.length === 1, JSON.stringify({ n: st.n, groups: st.groups }));
  await page.evaluate(() => window.BW.undo());
  const undone = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc));
  check('ONE BW.undo() reverts all 12', undone === docBefore, 'document differs after one undo');
  await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc].ar; return e.redo.length; });
  // redo puts them back, then provenance
  await page.evaluate(() => window.BW.redo());
  const saved = await until(async () => page.evaluate(async (id) => { const e = await window.BW.EXT.library.get(id); return /محرَّر/.test(e?.editions?.ar?.raw || '') || (e?.editions?.ar?.ops || []).length >= 12; }, DOC), 8000);
  check('the library entry holds the edits (persisted)', saved);
  const prov = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 400));
    const L = window.BW.EXT.ledger?.log?.(window.BW.S.svc);
    if (!L) return null;
    const ops = L.entries.filter((e) => e.kind === 'op' && e.data?.op?.value && /محرَّر/.test(String(e.data.op.value)));
    return { n: L.entries.length, ops: ops.map((e) => ({ id: e.actor.id, name: e.actor.name, kid: e.actor.kid })), humans: [...new Set(L.entries.filter((e) => e.kind !== 'op' || !ops.includes(e)).map((e) => e.actor.id))], ok: L.verdict?.ok };
  });
  check('provenance: the 12 ops are signed as the agent (name, own actor id)', !!prov && prov.ops.length === 12 && prov.ops.every((o) => o.name === 'Claude (Test)' && o.id === 'agent:claude-test'), JSON.stringify(prov));
  check('provenance: the agent id differs from the person\'s, the chain still verifies', !!prov && prov.humans.length >= 1 && !prov.humans.includes('agent:claude-test') && prov.ok === true, JSON.stringify(prov));

  // 4b. a human edit landing while the agent's log queue is still draining stays the human's (withActor binds the actor at entry creation)
  const race = await page.evaluate(async ({ doc, paths }) => {
    const B = window.BW, e = () => B.M[B.S.svc].ar;
    const n0 = e().ops.length;
    const agentOps = paths.slice(0, 3).map((p, i) => ({ op: 'setText', path: p, value: `AGX${i} agent` }));
    const pr = B.bridge('ops', doc, { ops: agentOps, locale: 'ar', agent: 'Claude (Race)', group: 'race' });
    for (let i = 0; i < 4000 && e().ops.length === n0; i += 1) await Promise.resolve(); // the agent commit has run; its log queue is still draining
    const stillDraining = e().ops.length > n0;
    B.commit([{ op: 'setText', path: '/control/title', value: 'HUMX human keystroke' }], { ed: 'ar', mirror: false });
    await pr;
    await B.EXT.ledger.ready();
    await new Promise((r) => setTimeout(r, 600));
    await B.EXT.ledger.ready();
    const L = B.EXT.ledger.log(B.S.svc);
    const rows = L.entries.filter((x) => x.kind === 'op' && /^(AGX|HUMX)/.test(String(x.data?.op?.value || ''))).map((x) => ({ v: String(x.data.op.value).slice(0, 4), id: x.actor.id, name: x.actor.name, kid: x.actor.kid }));
    return { stillDraining, rows, ok: L.verdict?.ok, me: B.EXT.profile.actor().id };
  }, { doc: DOC, paths: edits });
  check('race: the agent commit had run and its log was still draining when the human typed', race.stillDraining === true, JSON.stringify(race.rows));
  check('race: the human keystroke is signed as the human (not the agent)', race.rows.filter((x) => x.v === 'HUMX').length === 1 && race.rows.filter((x) => x.v === 'HUMX').every((x) => x.id === race.me), JSON.stringify(race.rows));
  check('race: the 3 agent entries are signed as agent:claude-race', race.rows.filter((x) => x.v.startsWith('AGX')).length === 3 && race.rows.filter((x) => x.v.startsWith('AGX')).every((x) => x.id === 'agent:claude-race' && x.name === 'Claude (Race)'), JSON.stringify(race.rows));
  check('race: the chain verifies', race.ok === true, JSON.stringify(race.rows));

  // 5. refusals
  r = await call('editor_ops', { doc: DOC, ops: [{ op: 'setText', path: '/control/title', value: 'never', old: 'NOT THE TITLE' }], locale: 'ar' });
  const cf = data(r);
  const titleAfter = data(await call('editor_get', { doc: DOC, pointer: '/control/title', locale: 'ar' })).value;
  check('a wrong old is CONFLICT with the live value, nothing applied', r.isError === true && cf.code === 'CONFLICT' && cf.live === titleAfter && titleAfter !== 'never', text(r).slice(0, 200));
  r = await call('editor_ops', { doc: DOC, ops: [{ op: 'setText', path: '/chapters/99/title', value: 'x' }], locale: 'ar' });
  check('a pointer that does not resolve is BAD_OP', r.isError === true && data(r).code === 'BAD_OP', text(r).slice(0, 200));
  r = await call('editor_action', { doc: DOC, id: 'formatDisk' });
  check('an unknown action is UNKNOWN_ACTION', r.isError === true && data(r).code === 'UNKNOWN_ACTION', text(r).slice(0, 160));
  r = await call('editor_get', { doc: 'doc-does-not-exist', locale: 'ar' });
  check('a document the tab does not have is NO_DOC', r.isError === true && data(r).code === 'NO_DOC', text(r).slice(0, 200));
  r = await call('editor_action', { doc: DOC, id: 'check' });
  check('editor_action check returns findings from the live editor', !r.isError && Array.isArray(data(r).findings), text(r).slice(0, 200));

  // 6. a tab that never replies
  await page.evaluate(() => { setTimeout(() => { const t0 = Date.now(); while (Date.now() - t0 < 7000); }, 50); });
  await sleep(300);
  const t0 = Date.now();
  r = await call('editor_get', { doc: DOC, pointer: '/control/title', locale: 'ar' });
  const to = data(r);
  check(`a tab that never replies is TAB_TIMEOUT after ~2.5 s (${Date.now() - t0} ms)`, r.isError === true && to.code === 'TAB_TIMEOUT' && Date.now() - t0 >= 2000 && Date.now() - t0 < 6500 && typeof to.tab === 'string', text(r).slice(0, 200));
  const cleared = await until(async () => (await health().catch(() => ({ pendingRequests: -1 }))).pendingRequests === 0, 3000);
  check('the host forgot the timed-out request (pendingRequests 0)', cleared);
  await sleep(5500); // the blocked page wakes
  r = await call('editor_get', { doc: DOC, pointer: '/control/title', locale: 'ar' });
  check('the tab answers again after it wakes', !r.isError && typeof data(r).value === 'string', text(r).slice(0, 200));

  // the host route refuses a call without the token
  const bad = await fetch(`${base}/api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tool: 'list', args: {} }) });
  check('the call route needs the host token (403 AUTH)', bad.status === 403 && (await bad.json()).code === 'AUTH');
  const rep = await fetch(`${base}/api/editor/reply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'nope', ok: true }) });
  check('a reply for no request is 404', rep.status === 404);
} catch (e) {
  check('suite ran to the end', false, e?.stack || e);
} finally {
  try { await page?.close({ runBeforeUnload: false }); } catch { /* closed */ }
  try { await ctx?.close(); } catch { /* closed */ }
  try { await browser?.close(); } catch { /* closed */ }
  try { await call('close_editor', {}); } catch { /* host gone */ }
  try { await client.close(); } catch { /* closed */ }
  try { await H.stop(); } catch { /* none */ }
  console.log(out.join('\n'));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
