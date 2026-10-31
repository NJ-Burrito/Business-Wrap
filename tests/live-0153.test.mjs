// 0.15.3 lane live (field report T1, T2, T4, T10). Isolated state and free ports only (tests/_isolate.mjs); kills only what it spawned.
//   T4  two `start`s in the same second (two processes) = ONE host; host.json names the pid that listens; a second start reuses it
//   T1  two tabs on one document: ops go to the owner only, the follower is read-only (guard + banner AR/EN), its save is refused (NOT_OWNER),
//       a stale base is refused (STALE_BASE), nothing is lost, and when the owner leaves the follower takes over from the host's last copy
//   T2  a frozen tab is reported TAB_ASLEEP at once (not after the bridge timeout) and answers again after it wakes (lastBeatMs refreshes);
//       without SharedWorker a frozen LEADER tab loses the one stream to another tab; Edge is launched with the keep-awake switches
//   T10 the MCP server survives a stray exception; doctor/status say whether the plugin is registered
//   node tests/live-0153.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-live0153-'));
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_NO_PROTOCOL: '1', BW_BRIDGE_TIMEOUT_MS: '8000', BW_EDITOR_TIMEOUT_MS: '30000', BW_IDLE_MS: '1500', BW_ASLEEP_MS: '7000' };
fs.mkdirSync(env.BW_WORKSPACE, { recursive: true });
Object.assign(process.env, env);
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) { try { if (await fn()) return true; } catch { /* not yet */ } } return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  live-0153: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };

const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'live-0153', watermarkDir: null });
const PORT = await free();
const base = `http://127.0.0.1:${PORT}`;
let browser = null, ctx = null, ctx2 = null, client = null;
try {
  // ── T4: two starts at once, from two processes ──
  const script = `const H = await import(${JSON.stringify(pathToFileURL(path.join(REPO, 'engine', 'host.mjs')).href)}); const r = await H.start({ editor: ${JSON.stringify(file)}, port: ${PORT}, open: false }); console.log(JSON.stringify(r));`;
  const run = () => new Promise((ok) => { const c = spawn(process.execPath, ['--input-type=module', '-e', script], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); let o = '', e = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { e += d; }); c.on('close', () => { let j = null; try { j = JSON.parse(o.trim().split('\n').pop()); } catch { /* none */ } ok({ j, e }); }); });
  const [r1, r2] = await Promise.all([run(), run()]);
  const hj = H.hostState();
  const hp = await fetch(`${base}/api/host/health`).then((r) => r.json()).catch(() => null);
  check('T4: both starts answered with the same host pid', !!r1.j && !!r2.j && r1.j.pid === r2.j.pid, JSON.stringify({ a: r1.j, b: r2.j, e: r1.e.slice(0, 120) + r2.e.slice(0, 120) }));
  check('T4: host.json names the supervisor AND the listener (the pid that answers), both alive, one parent', !!hj && hp?.pid === hj.listener && hp?.ppid === hj.pid && alive(hj.pid) && alive(hj.listener), JSON.stringify({ hj, listening: hp?.pid, ppid: hp?.ppid }));
  const again = await H.start({ editor: file, port: PORT, open: false });
  check('T4: a later start reuses the live host (same pid, same port, no second server)', again.pid === hj.pid && again.port === PORT && again.reused === true, JSON.stringify(again));
  check('T4: the lock file is released', !fs.existsSync(H.lockFile()));

  const token = H.hostState().token;
  const isDoc = (f) => { try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return !!(d.control && d.chapters); } catch { return false; } };
  const docs = fs.readdirSync(SAMPLE).filter((f) => /\.json$/.test(f)).map((f) => path.join(SAMPLE, f)).filter(isDoc);
  const imp = await (await fetch(`${base}/api/library/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documents: docs }) })).json();
  const DOC = Array.isArray(imp.doc_id) ? imp.doc_id[0] : imp.doc_id;
  check('setup: the host queued the document in the library', /^doc-/.test(DOC || ''), JSON.stringify(imp).slice(0, 200));
  const health = async () => (await fetch(`${base}/api/host/health`, { signal: AbortSignal.timeout(4000) })).json();
  const callApi = async (body) => { const t0 = Date.now(); const r = await fetch(`${base}/api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json(), ms: Date.now() - t0 }; };
  const mirror = async () => { const r = await fetch(`${base}/api/library/mirror?id=${DOC}`); return r.ok ? await r.text() : ''; };

  browser = await chromium.launch(launchOptions());
  ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const open = async (c, url, noShared = false) => {
    const page = await c.newPage();
    page.on('pageerror', (e) => out.push(`NOTE  pageerror: ${String(e.message).slice(0, 140)}`));
    if (noShared) await page.addInitScript(() => { delete window.SharedWorker; });
    await page.goto(url);
    await page.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 60000 });
    return page;
  };
  const tabOf = (p) => p.evaluate(() => window.BW.EXT.session.tab);
  const ro = (p) => p.evaluate(() => window.BW.EXT.session.readonly);
  const title = (p) => p.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.control.title));

  // ── T1: two tabs, one document ──
  const A = await open(ctx, `${base}/?automation=1#doc=${DOC}`);
  const tabA = await tabOf(A);
  await until(async () => (await health()).leases?.[DOC] === tabA, 15000);
  const B = await open(ctx, `${base}/?automation=1#doc=${DOC}`);
  const tabB = await tabOf(B);
  check('T1: the first tab owns the document (host lease)', (await health()).leases?.[DOC] === tabA && tabA !== tabB, JSON.stringify((await health()).leases));
  const folUp = await until(async () => (await ro(B)) === 'follower', 15000);
  const banner = await B.evaluate(() => document.getElementById('bw-lease-banner')?.textContent || '');
  check('T1: the second tab is a follower with a visible banner in Arabic AND English', folUp && /[؀-ۿ]/.test(banner) && /another tab/.test(banner), banner.slice(0, 120));
  const t0B = await title(B);
  const refused = await B.evaluate(() => { try { window.BW.commit([{ op: 'setText', path: '/control/title', value: 'FOLLOWER EDIT' }], { ed: 'ar', mirror: false }); return 'applied'; } catch (e) { return e.refused ? 'refused' : String(e); } });
  check('T1: an edit in the follower tab is refused and changes nothing', refused === 'refused' && (await title(B)) === t0B, refused);
  const pre = await mirror();
  const ops = await callApi({ tool: 'ops', doc: DOC, args: { ops: [{ op: 'setText', path: '/control/title', value: 'OWNER EDIT' }], locale: 'ar', agent: 'Claude (live test)', group: 'live' } });
  check('T1: ops reach the owner (applied), not the follower', ops.status === 200 && ops.body.result?.applied === 1 && (await title(A)).includes('OWNER EDIT') && !(await title(B)).includes('OWNER EDIT'), JSON.stringify(ops.body).slice(0, 200));
  const saved = await until(async () => (await mirror()).includes('OWNER EDIT'), 10000);
  check('T1: the owner\'s save reached the library (mirror positive sample)', saved && !pre.includes('OWNER EDIT'));
  const stale = await B.evaluate(async (doc) => { const r = await fetch('/api/library/mirror', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: { id: doc, title: 'STALE COPY', editions: {} } }) }); return { s: r.status, j: await r.json().catch(() => ({})) }; }, DOC);
  const after = await mirror();
  check('T1: the follower\'s save is refused (409 NOT_OWNER) and the library keeps the owner\'s edit', stale.s === 409 && stale.j.code === 'NOT_OWNER' && after.includes('OWNER EDIT') && !after.includes('STALE COPY'), JSON.stringify(stale));
  const post = (headers, entry) => fetch(`${base}/api/library/mirror`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ entry }) }).then(async (r) => ({ s: r.status, rev: r.headers.get('x-bw-rev'), j: await r.json().catch(() => ({})) }));
  const revNow = (await health()).revs?.[DOC];
  const sb = await post({ 'x-bw-tab': tabA, 'x-bw-doc': DOC, 'x-bw-base': '0' }, { id: DOC, title: 'OLD BASE', editions: {} });
  check('T1: a save whose base revision is older than the library\'s is refused (409 STALE_BASE)', revNow >= 1 && sb.s === 409 && sb.j.code === 'STALE_BASE' && !(await mirror()).includes('OLD BASE'), JSON.stringify({ revNow, sb }));
  const okw = await post({ 'x-bw-tab': tabA, 'x-bw-doc': DOC, 'x-bw-base': String(revNow) }, JSON.parse(after));
  check('T1: the owner at the current revision saves (200) and the revision advances', okw.s === 200 && Number(okw.rev) === revNow + 1, JSON.stringify(okw));
  // a tombstone (purge) is accepted from a follower tab too, a plain write from it is still refused
  const TOMB = 'doc-tomb0155';
  await post({ 'x-bw-tab': tabA, 'x-bw-doc': TOMB }, { id: TOMB, title: 'to purge', editions: {} });
  const plainF = await post({ 'x-bw-tab': tabB, 'x-bw-doc': TOMB }, { id: TOMB, title: 'follower write', editions: {} });
  const purgeF = await post({ 'x-bw-tab': tabB, 'x-bw-doc': TOMB, 'x-bw-base': '0', 'x-bw-purge': '1' }, { id: TOMB, purge: true });
  const tombs = await (await fetch(`${base}/api/library/mirror?tombstones=1`)).json();
  check('0.15.5: a purge from a follower tab with a stale base reaches the library (tombstone written); a plain follower write is still refused', plainF.s === 409 && purgeF.s === 200 && tombs.ids.includes(TOMB), JSON.stringify({ plainF: plainF.s, purgeF: purgeF.s, tombs: tombs.ids }));
  const nb = await callApi({ tool: 'get', doc: DOC, tab: tabB, args: { pointer: '/control/title', locale: 'ar' } });
  check('T1: a call that names the follower tab is refused (NOT_OWNER), never sent to it', nb.status === 409 && nb.body.code === 'NOT_OWNER' && nb.body.owner === tabA, JSON.stringify(nb.body).slice(0, 200));
  await A.close({ runBeforeUnload: false });
  const took = await until(async () => (await health()).leases?.[DOC] === tabB, 15000);
  const healed = await until(async () => (await ro(B)) === '' && (await title(B)).includes('OWNER EDIT'), 15000);
  check('T1: when the owner leaves, the follower takes over and holds the owner\'s edit (no loss)', took && healed, JSON.stringify({ took, ro: await ro(B), t: (await title(B)).slice(0, 60) }));

  // 0.15.5: two library writes of one document sent back to back by the owner tab (a Trash move, then the purge) are both accepted: the page sends them in turn
  const twin = await B.evaluate(async () => {
    const doc = 'doc-twin0155'; // its own document, so the owner's real one stays as it is
    const w = (e) => fetch('/api/library/mirror', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ entry: e }) }).then((r) => r.status);
    const first = await w({ id: doc, title: 'one', editions: {} }); // the page learns the revision the host gave
    const both = await Promise.all([w({ id: doc, title: 'two', editions: {}, deletedAt: new Date().toISOString() }), w({ id: doc, purge: true })]);
    return [first, ...both];
  });
  check('0.15.5: two back-to-back saves of one document from the owner tab are both accepted (the second is not "stale" against the first)', twin.length === 3 && twin.every((c) => c === 200), JSON.stringify(twin));

  // ── T2: a frozen tab ──
  const cdp = await ctx.newCDPSession(B);
  await cdp.send('Page.enable');
  await cdp.send('Debugger.enable'); await cdp.send('Debugger.pause'); // the page's JavaScript stops: no beat, no reply (what a sleeping/frozen tab does)
  const asleep = await until(async () => (await health()).tabs.find((t) => t.tab === tabB)?.asleep === true, 20000);
  const hz = await health();
  check('T2: health marks the frozen tab asleep (TAB_ASLEEP warning, lastBeatMs past the limit)', asleep && hz.warnings.some((w) => w.code === 'TAB_ASLEEP' && w.tab === tabB), JSON.stringify(hz.warnings));
  const fast = await callApi({ tool: 'get', doc: DOC, args: { pointer: '/control/title', locale: 'ar' } });
  check('T2: a call to a sleeping tab answers TAB_ASLEEP at once, not after the bridge timeout', fast.status === 503 && fast.body.code === 'TAB_ASLEEP' && fast.ms < 3000 && !!fast.body.how, JSON.stringify({ s: fast.status, c: fast.body.code, ms: fast.ms }));
  await cdp.send('Debugger.resume');
  const woke = await until(async () => { const t = (await health()).tabs.find((x) => x.tab === tabB); return t && !t.asleep && t.lastBeatMs < 7000; }, 20000);
  const ans = await callApi({ tool: 'get', doc: DOC, args: { pointer: '/control/title', locale: 'ar' } });
  check('T2: after it wakes, lastBeatMs refreshes and the tab answers again', woke && ans.status === 200, JSON.stringify({ woke, s: ans.status, b: ans.body }).slice(0, 200));

  // no SharedWorker: the leader tab's lock is held by a frozen page (B stays open meanwhile: the host stops with its last tab)
  ctx2 = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const D = await open(ctx2, `${base}/?automation=1`, true);
  const E = await open(ctx2, `${base}/?automation=1`, true);
  await B.close({ runBeforeUnload: false });
  const tr = (p) => p.evaluate(() => window.BW.EXT.session.transport);
  const lead0 = await until(async () => (await tr(D)) === 'leader' || (await tr(E)) === 'leader', 10000);
  const leaderIsD = (await tr(D)) === 'leader';
  const [L, F] = leaderIsD ? [D, E] : [E, D];
  check('T2: without SharedWorker one tab is the leader of the one stream (positive sample)', lead0 && (await tr(F)) === 'follower', JSON.stringify([await tr(D), await tr(E)]));
  const cdp2 = await ctx2.newCDPSession(L);
  await cdp2.send('Page.enable');
  await cdp2.send('Debugger.enable'); await cdp2.send('Debugger.pause');
  const stolen = await until(async () => (await tr(F)) === 'leader', 40000);
  const tabF = await tabOf(F);
  const callF = stolen ? await callApi({ tool: 'list', tab: tabF, args: {} }) : null;
  check('T2: a frozen leader tab loses the stream to another tab, which then answers bridge calls', stolen && callF?.status === 200, JSON.stringify({ stolen, s: callF?.status, b: callF?.body }).slice(0, 200));
  await cdp2.send('Debugger.resume').catch(() => {});
  const stepped = await until(async () => (await tr(L)) === 'follower', 15000);
  check('T2: the woken old leader steps down (one stream, not two)', stepped, await tr(L));
  await D.close({ runBeforeUnload: false }); await E.close({ runBeforeUnload: false });

  // Edge's launch line
  const stub = path.join(tmp, 'browser-stub.jsonl');
  process.env.BW_BROWSER_STUB = stub;
  H.launchBrowser(['http://127.0.0.1:1/']);
  delete process.env.BW_BROWSER_STUB;
  const argv = JSON.parse(fs.readFileSync(stub, 'utf8').trim().split('\n')[0]).args;
  check('T2: Edge is launched with the keep-awake switches', ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'].every((f) => argv.includes(f)) && argv.some((a) => /^--disable-features=.*SleepingTabs/.test(a)), argv.join(' '));

  // ── T10: the MCP server ──
  const { mcpRegistration } = await import('../mcp/startup.mjs');
  const fakeClaude = path.join(tmp, 'claude'), fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(path.join(fakeClaude, 'plugins'), { recursive: true }); fs.mkdirSync(fakeHome, { recursive: true });
  const none = mcpRegistration({ claudeDir: fakeClaude, home: fakeHome });
  const inst = path.join(tmp, 'cache', 'bw', 'business-wrap', '9.9.9');
  fs.mkdirSync(path.join(inst, 'mcp'), { recursive: true }); fs.writeFileSync(path.join(inst, 'mcp', 'cli.mjs'), '');
  fs.writeFileSync(path.join(fakeClaude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'business-wrap@bw': [{ scope: 'user', installPath: inst, version: '9.9.9' }] } }));
  const reg = mcpRegistration({ claudeDir: fakeClaude, home: fakeHome, root: inst });
  fs.rmSync(path.join(inst, 'mcp'), { recursive: true });
  const gone = mcpRegistration({ claudeDir: fakeClaude, home: fakeHome, root: inst });
  check('T10: doctor sees "not registered" when Claude Code has no business-wrap plugin or server', none.registered === false && none.plugin === false);
  check('T10: doctor reads the plugin registration (path, version, this install matches)', reg.registered && reg.plugin && reg.version === '9.9.9' && reg.pathExists === true && reg.matchesThisInstall === true, JSON.stringify(reg));
  check('T10: a registration whose folder was replaced (no mcp/cli.mjs) is reported', gone.registered && gone.pathExists === false, JSON.stringify(gone));
  const { status: cliStatus } = await import('../engine/cli.mjs');
  const st = await cliStatus();
  check('T10: business-wrap status carries the MCP registration, last start and last error', st.mcp && 'registered' in st.mcp && 'last_start' in st.mcp && 'last_error' in st.mcp, JSON.stringify(st.mcp));
  client = new Client({ name: 'live-0153', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...env, BW_MCP_THROW_AFTER_MS: '400' }, stderr: 'pipe' }));
  await sleep(1800);
  const tools = await client.listTools().catch((e) => ({ err: String(e.message || e) }));
  const log = fs.existsSync(path.join(env.BW_LOCAL_DIR, 'mcp.log')) ? fs.readFileSync(path.join(env.BW_LOCAL_DIR, 'mcp.log'), 'utf8') : '';
  check('T10: the MCP server survives a stray exception and still answers (the stray one is in mcp.log)', Array.isArray(tools.tools) && tools.tools.length > 5 && /"phase":"uncaught"/.test(log), JSON.stringify(tools).slice(0, 160));
} catch (e) {
  check('suite ran to the end', false, e?.stack || e);
} finally {
  for (const x of [ctx, ctx2, browser]) { try { await x?.close(); } catch { /* closed */ } }
  try { await client?.close(); } catch { /* closed */ }
  try { await H.stop(); } catch { /* none */ }
  console.log(out.join('\n'));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
