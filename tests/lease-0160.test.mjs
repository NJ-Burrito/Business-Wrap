// 0.16.0 (mcp-notes items 1 and 5, reproduced first): leases, sleeping and ghost tabs, the host's view of each tab, queued calls, an awake tab for editor_new.
//   A REAL host (engine/serve.mjs) and synthetic tabs that speak the same HTTP the editor's session worker speaks (SSE stream + POST /api/session/tabs + POST /api/editor/reply):
//   no browser, so every timing here is the host's own. Short limits through env (BW_ASLEEP_MS, BW_LEASE_RELEASE_MS, BW_QUEUE_MS).
//   L1 a lease is released when its owner has been asleep for the release time, and a fresh tab for the document then owns it (it does not open read-only behind a dead one)
//   L2 a ghost lease (a client keeps listing a tab that has not beaten for ages) is released too
//   L3 claim takes a document over at once
//   L4 host_health says per tab: awake, frozen, discarded or closed
//   L5 a tab proves itself with its own beat when its worker client froze (one frozen SharedWorker client must not hold the other tabs)
//   L6 a call to a sleeping tab queues for a few seconds and succeeds when the tab wakes, instead of failing at once
//   L7 editor_new gets an awake tab, and opens one (with the keep-awake launch, automation) when every tab is asleep
//   node tests/lease-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-lease0160-'));
const stub = path.join(tmp, 'launches.jsonl');
Object.assign(process.env, { BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BROWSER_STUB: stub, BW_ASLEEP_MS: '1500', BW_LEASE_RELEASE_MS: '4000', BW_QUEUE_MS: '6000', BW_BRIDGE_TIMEOUT_MS: '4000', BW_NEW_TAB_WAIT_MS: '15000' });
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 150) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  lease-0160: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 400) : ''}`); if (!ok) failed += 1; };

let base = '', token = '';
const post = async (route, body, headers = {}) => { const r = await fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => ({})) }; };
const get = async (route) => (await fetch(base + route)).json();
const health = () => get('api/host/health');
const rowOf = (h, tab) => h.tabs.find((t) => t.tab === tab);

/** A tab as the host sees it: its own client (a SharedWorker), an SSE stream, a tab list, and answers to the bridge's requests. */
class Syn {
  constructor(tab, { docs = [], svc, answer = true, others = [] } = {}) { this.tab = tab; this.docs = docs; this.svc = svc || docs[0] || 'x'; this.answer = answer; this.others = others; this.client = `syn${tab}`; this.seq = 0; this.timer = 0; this.ac = new AbortController(); this.reqs = 0; }
  async connect() {
    const r = await fetch(`${base}api/session/live?client=${this.client}`, { signal: this.ac.signal });
    this.reader = r.body.getReader();
    (async () => {
      const dec = new TextDecoder(); let buf = '';
      try {
        for (;;) {
          const { value, done } = await this.reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          let i; while ((i = buf.indexOf('\n\n')) >= 0) {
            const blk = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(blk)?.[1]; const data = /^data: (.+)$/m.exec(blk)?.[1];
            if (ev === 'req' && data) { const d = JSON.parse(data); if (d.tab === this.tab && this.answer) { this.reqs += 1; post('api/editor/reply', { id: d.id, ok: true, result: { documents: [{ id: this.docs[0] || 'none' }], title: 'syn', tab: this.tab } }); } }
          }
        }
      } catch { /* closed */ }
    })();
    await this.list();
    return this;
  }
  list(ago = 0) { return post('api/session/tabs', { client: this.client, seq: ++this.seq, tabs: [{ tab: this.tab, svc: this.svc, docs: this.docs, automation: true, ago }, ...this.others.map((o) => ({ tab: o.tab, svc: o.svc, docs: o.docs, automation: true, ago: 0 }))] }); }
  beat() { return post('api/session/beat', { tab: this.tab, svc: this.svc, docs: this.docs, automation: true }); }
  startListing(ms = 500) { clearInterval(this.timer); this.timer = setInterval(() => this.list().catch(() => {}), ms); }
  stop() { clearInterval(this.timer); this.timer = 0; }
  close() { this.stop(); try { this.ac.abort(); } catch { /* gone */ } }
}
const syn = [];
const mk = async (...a) => { const t = new Syn(...a); syn.push(t); await t.connect(); return t; };

try {
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'lease0160', watermarkDir: null });
  const h = await H.start({ editor, port: 4870, open: false });
  base = h.url; token = H.hostState().token;
  const call = async (tool, tab, doc, args = {}) => { const t0 = Date.now(); const r = await post('api/editor/call', { tool, tab, doc, args }, { 'x-bw-token': token }); return { ...r, ms: Date.now() - t0 }; };
  const leases = async () => (await get('api/session/leases')).leases;

  // L1: an owner that sleeps loses the lease after the release time; a fresh tab then owns the document
  const D = 'doc-lease-0001';
  const t1 = await mk('tabone0001', { docs: [D] });
  t1.startListing(); await t1.beat();
  check('L1 setup: the first tab owns the document while it beats (positive sample)', await until(async () => (await leases())[D] === 'tabone0001', 8000));
  t1.stop(); // the page stops answering (a frozen or discarded tab): its client keeps listing it with a growing age, as a real worker does
  const keep = setInterval(() => t1.list(Date.now() - t1.since).catch(() => {}), 500); t1.since = Date.now(); t1.keep = keep;
  const t2 = await mk('tabtwo0002', { docs: [D] });
  t2.startListing(); await t2.beat();
  check('L1: the new tab for the same document starts as a follower while the owner is only just asleep (the old rule still holds inside the release time)', (await leases())[D] === 'tabone0001');
  const released = await until(async () => (await leases())[D] === 'tabtwo0002', 12000);
  check('L1: after the release time the sleeping owner loses the lease and the fresh tab owns the document', !!released, JSON.stringify(await leases()));
  clearInterval(keep);

  // L2: a ghost lease: a client keeps listing a tab that has not beaten for ages (lastBeatMs 650 s)
  const E = 'doc-lease-0002';
  const g = await mk('tabghost003', { docs: [E] });
  await g.list(650000); g.startListing(500); g.list = ((orig) => (ago = 650000) => orig(ago))(g.list.bind(g)); // every list says: not heard for 650 s
  await sleep(300);
  const t3 = await mk('tabthree004', { docs: [E] }); t3.startListing(); await t3.beat();
  check('L2: a ghost lease (owner not heard for 650 s) is released and the live tab owns the document', !!(await until(async () => (await leases())[E] === 'tabthree004', 12000)), JSON.stringify(await leases()));

  // L3: claim
  const F = 'doc-lease-0003';
  const o5 = await mk('tabfive0005', { docs: [F] }); o5.startListing(); await o5.beat();
  const t6 = await mk('tabsix00006', { docs: [F] }); t6.startListing(); await t6.beat();
  await until(async () => (await leases())[F] === 'tabfive0005', 5000);
  const cl = await post('api/session/claim', { tab: 'tabsix00006', doc: F });
  check('L3: claim hands the document to the claiming tab at once (and the answer says so)', cl.status === 200 && cl.j.ok === true && (await leases())[F] === 'tabsix00006', JSON.stringify(cl));
  const cl2 = await post('api/session/claim', { tab: 'tabnothere1', doc: F });
  check('L3: a tab the host does not know cannot claim', cl2.status >= 400 && (await leases())[F] === 'tabsix00006');

  // L4: the host's view per tab
  const t7 = await mk('tabseven007', { docs: ['doc-lease-0004'] }); t7.startListing(); await t7.beat();
  const t8 = await mk('tabeight008', { docs: ['doc-lease-0005'] }); // lists once, never again: asleep
  await sleep(2600);
  const hl = await health();
  check('L4: host_health says awake for a beating tab and frozen for one that stopped answering', rowOf(hl, 'tabseven007')?.state === 'awake' && rowOf(hl, 'tabeight008')?.state === 'frozen', JSON.stringify([rowOf(hl, 'tabseven007')?.state, rowOf(hl, 'tabeight008')?.state]));
  await post('api/session/tabs', { client: t7.client, seq: 99999, tabs: [], lost: [] });
  t7.stop();
  const closed = await until(async () => rowOf(await health(), 'tabseven007')?.state === 'closed', 8000);
  check('L4: a tab that left the list says closed, and a lost one says discarded', !!closed);
  await post('api/session/tabs', { client: t8.client, seq: 99999, tabs: [], lost: ['tabeight008'] });
  check('L4: discarded (lost) is told apart', (await until(async () => rowOf(await health(), 'tabeight008')?.state === 'discarded', 5000)) !== false, JSON.stringify(rowOf(await health(), 'tabeight008')));

  // L5: a frozen worker client lists four tabs and holds them; each tab proves itself with its own beat
  const four = ['tabfreeze01', 'tabfreeze02', 'tabfreeze03', 'tabfreeze04'];
  const fc = await mk('tabfreeze01', { docs: ['doc-fz-1'], others: four.slice(1).map((tab, i) => ({ tab, svc: `doc-fz-${i + 2}`, docs: [`doc-fz-${i + 2}`] })) });
  await sleep(2600); // the client froze after its first list: every tab it lists reads asleep
  const before = await health();
  check('L5 (reproduction): four tabs held by one frozen client read asleep', four.every((t) => rowOf(before, t)?.asleep === true), JSON.stringify(four.map((t) => rowOf(before, t)?.asleep)));
  const beaters = four.slice(1).map((tab, i) => new Syn(tab, { docs: [`doc-fz-${i + 2}`] }));
  const bt = setInterval(() => beaters.forEach((b) => b.beat().catch(() => {})), 500);
  await sleep(1800);
  const after = await health();
  check('L5: tabs that beat on their own read awake although their worker client is frozen; the one that did not still reads asleep', four.slice(1).every((t) => rowOf(after, t)?.asleep === false) && rowOf(after, 'tabfreeze01')?.asleep === true, JSON.stringify(four.map((t) => rowOf(after, t)?.asleep)));
  const lone = new Syn('tabdirect001', { docs: ['doc-direct'] });
  await lone.beat();
  check('L5: a tab known only by its own beat is listed live', rowOf(await health(), 'tabdirect001')?.live === true && rowOf(await health(), 'tabdirect001')?.asleep === false);
  clearInterval(bt);
  fc.close();

  // L6: a call to a sleeping tab queues and succeeds when it wakes
  const Q = await mk('tabqueue0001', { docs: ['doc-q-1'] });
  await sleep(2600); // asleep
  check('L6 setup: the tab reads asleep (positive sample)', rowOf(await health(), 'tabqueue0001')?.asleep === true);
  setTimeout(() => { Q.startListing(300); Q.beat(); }, 1500);
  const qc = await call('list', 'tabqueue0001', undefined, {});
  check('L6: the call waits for the tab to wake (a few seconds) and succeeds instead of failing at once', qc.status === 200 && qc.j?.ok !== false && qc.ms >= 1000, JSON.stringify(qc).slice(0, 300));
  Q.stop();
  await sleep(2600);
  const qf = await call('list', 'tabqueue0001', undefined, {});
  check('L6: a tab that stays asleep still answers TAB_ASLEEP, after the wait', qf.status === 503 && qf.j?.code === 'TAB_ASLEEP' && qf.ms >= 4000, JSON.stringify(qf).slice(0, 300));

  // L7: editor_new gets an awake tab; with every tab asleep the host opens one
  for (const s of syn) { s.close(); }
  await sleep(500);
  const asleepOnly = await mk('tabzzzz0001', { docs: ['doc-z-1'] });
  await sleep(2600);
  const A1 = await mk('tabawake0001', { docs: ['doc-aw-1'] }); A1.startListing(300); await A1.beat();
  const n1 = await call('new', undefined, undefined, { title: 'x' });
  check('L7: editor_new picks the awake tab, not the sleeping one', n1.status === 200 && A1.reqs >= 1 && asleepOnly.reqs === 0, JSON.stringify(n1).slice(0, 300));
  A1.close();
  await sleep(3000);
  fs.rmSync(stub, { force: true });
  let N = null;
  setTimeout(async () => { const l = fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8') : ''; void l; }, 0);
  const waiter = until(async () => fs.existsSync(stub) && /automation=1/.test(fs.readFileSync(stub, 'utf8')), 14000).then(async (ok) => { if (ok) { N = await mk('tabopened001', { docs: ['doc-new-1'] }); N.startListing(300); await N.beat(); } return ok; });
  const n2 = await call('new', undefined, undefined, { title: 'y' });
  const opened = await waiter;
  const line = fs.existsSync(stub) ? JSON.parse(fs.readFileSync(stub, 'utf8').trim().split('\n')[0]) : null;
  check('L7: with every tab asleep editor_new opens a window itself (automation tab, keep-awake flags) and the call is answered by it', !!opened && n2.status === 200 && (N?.reqs || 0) >= 1 && line.args.some((a) => /automation=1/.test(a)) && line.args.includes('--disable-background-timer-throttling'), JSON.stringify({ n2, line }).slice(0, 400));
} catch (e) {
  check('the run completed without an exception', false, e?.stack || e);
} finally {
  for (const s of syn) s.close();
  try { await H.stop(); } catch { /* none */ }
}
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nlease-0160: all ${out.length} checks passed`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* a lock */ }
process.exit(failed ? 1 : 0);
