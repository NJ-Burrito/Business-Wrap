// 0.16.0 (mcp-notes item 3), in REAL Chrome with a REAL host: what a person sees while an agent edits.
//   V1 a 12-op batch arrives one op at a time, in order (many different intermediate states, not nothing-then-everything), and is still ONE undo step
//   V2 the small «agent editing: <section>» chip shows during the batch with the time of the last edit, and says «last edited» after it; the block just edited is outlined
//   V3 the person's scroll position is held through every op (no jump)
//   V4 the person's caret and typing are held: typing in another block during the batch lands where the caret was, the caret is still there at the end
//   V5 an op on the very block the person has the caret in is merged (applied, not blocked) and the block stays focused
//   V6 the ops are in order: the document shows them in the sequence sent (the group numbers g.0 g.1 … run without a gap)
//   node tests/live-edit-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { REPO, chooseBrowser } from '../engine/export.mjs';
import { buildEditor } from '../engine/build-editor.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-live0160-'));
Object.assign(process.env, { BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_BRIDGE_TIMEOUT_MS: '15000', BW_UPDATE_TOKEN: 'none' });
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 150) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  live-edit-0160: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 600) : ''}`); if (!ok) failed += 1; };
const br = chooseBrowser({ env: { BW_BROWSER: 'chrome' }, saved: '' });
if (!br || br.id !== 'chrome') { console.log('SKIP live-edit-0160: Google Chrome is not installed here'); process.exit(0); }
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function tab(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const open = new Promise((ok) => { ws.onopen = ok; });
  return {
    async send(method, params = {}) { await open; return new Promise((ok) => { const i = ++id; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method, params })); }); },
    async ev(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; },
    close() { try { ws.close(); } catch { /* closed */ } },
  };
}
let chrome = null;
try {
  const editor = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: editor, set: 'live0160', watermarkDir: null });
  const host = await H.start({ editor, port: 4890, open: false });
  const base = host.url.replace(/\/$/, ''), token = H.hostState().token;
  const imp = await (await fetch(`${base}/api/library/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ documents: ['document.ar.json', 'document.en.json'].map((f) => path.join(REPO, 'samples', 'event-permit', f)) }) })).json();
  const DOC = imp.doc_id[0];
  const cdp = await freePort();
  chrome = spawn(br.exe, [`--user-data-dir=${path.join(tmp, 'chrome-profile')}`, `--remote-debugging-port=${cdp}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,900', ...H.keepAwakeArgs(), '--new-window', `${base}/?automation=1#doc=${DOC}`], { stdio: 'ignore' });
  const t = await until(async () => (await (await fetch(`http://127.0.0.1:${cdp}/json`)).json()).find((x) => x.type === 'page' && x.url.startsWith(base)), 40000);
  const P = tab(t.webSocketDebuggerUrl);
  const ready = await until(async () => (await P.ev(`!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession && window.BW.S.svc === ${JSON.stringify(DOC)})`)) === true, 60000);
  check('the editor booted on the document (positive sample: BW.ready and S.svc is the id)', !!ready);
  await until(async () => (await (await fetch(`${base}/api/host/health`, { headers: { 'x-bw-token': token } })).json()).tabs.some((x) => x.live && (x.docs || []).includes(DOC)), 30000);
  const call = async (tool, args) => { const r = await fetch(`${base}/api/editor/call`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': token }, body: JSON.stringify({ tool, doc: DOC, args }) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

  const ol = (await call('outline', { locale: 'ar' })).body.result;
  const pointers = [];
  for (const ch of ol.chapters) { pointers.push(`${ch.pointer}/title`); for (const s of ch.sections) pointers.push(`${s.pointer}/title`); }
  const targets = pointers.slice(0, 12);
  const olds = [];
  for (const p of targets) olds.push((await call('get', { pointer: p, locale: 'ar' })).body.result.value);
  await P.ev('window.BW_OP_PACE_MS = 300; 1'); // slow enough to see: 12 ops, 300 ms between
  const tall = await P.ev('document.documentElement.scrollHeight');
  await P.ev('window.scrollTo(0, 500); 1');
  await sleep(300);
  const y0 = await P.ev('window.scrollY');
  check('the page is scrolled down before the batch (positive sample)', y0 > 100 && tall > 1500, `scrollY ${y0}, height ${tall}`);

  // the person's caret: a text block that the batch does not touch
  const caretSel = await P.ev(`(() => {
    const skip = new Set(${JSON.stringify(targets)});
    const el = [...document.querySelectorAll('#bw-pair main.bw-doc[data-locale="ar"] [data-p]')].find((e) => e.textContent.trim().length > 40 && !skip.has(e.dataset.p) && e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().top < innerHeight - 60);
    if (!el) return null;
    el.setAttribute('contenteditable', 'true'); el.focus({ preventScroll: true });
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const n = w.nextNode();
    const r = document.createRange(); r.setStart(n, 4); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return { p: el.dataset.p, text: el.textContent };
  })()`);
  check('a block in view has the caret at offset 4 (positive sample)', !!caretSel, 'no block in view');
  const caretOff = `(() => { const el = document.querySelector('#bw-pair [data-p="' + CSS.escape(${JSON.stringify(caretSel?.p || '')}) + '"]'); const s = getSelection(); if (!el || !s.rangeCount || !el.contains(s.anchorNode)) return -1; const pre = document.createRange(); pre.selectNodeContents(el); pre.setEnd(s.anchorNode, s.anchorOffset); return pre.toString().length; })()`;

  const ops = targets.map((p, i) => ({ op: 'setText', path: p, value: `${olds[i]} ✎${i}`, old: olds[i] }));
  const opsLen0 = await P.ev('window.BW.M[window.BW.S.svc].ar.ops.length');
  const pBatch = call('ops', { ops, locale: 'ar', agent: 'Claude (live test)', request_id: 'live-1' });
  const seen = new Set(), samples = [];
  let typed = false, maxHl = 0, chipText = '', chipTime = '', chipLive = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    const s = await P.ev(`(() => { const e = window.BW.M[window.BW.S.svc].ar; const chip = document.getElementById('bw-agent-ind'); return { n: e.ops.length, marks: [...document.querySelectorAll('#bw-pair [data-p]')].filter((x) => x.textContent.includes('✎')).length, y: scrollY, hl: document.querySelectorAll('.bw-agent-hl').length, chip: chip && !chip.hidden ? { text: chip.querySelector('.lbl').textContent, time: chip.querySelector('time').textContent, live: chip.dataset.live } : null }; })()`);
    if (!s) break;
    seen.add(s.n); samples.push(s);
    maxHl = Math.max(maxHl, s.hl);
    if (s.chip?.live === '1' && !chipLive) { chipLive = true; chipText = s.chip.text; chipTime = s.chip.time; }
    if (s.n - opsLen0 >= 3 && !typed) { typed = true; await P.send('Input.insertText', { text: 'XY' }); }
    if (s.n - opsLen0 >= 12) break;
    await sleep(50);
  }
  const rb = await pBatch;
  const inter = [...seen].filter((n) => n > opsLen0 && n < opsLen0 + 12);
  check('V1: the 12 ops arrived one at a time (at least 6 different intermediate states were seen)', rb.status === 200 && rb.body.result?.applied === 12 && inter.length >= 6, `status ${rb.status}; applied ${rb.body.result?.applied}; seen ${[...seen].map((n) => n - opsLen0).join(',')}`);
  const marksSeen = [...new Set(samples.map((s) => s.marks))];
  check('V1: the page itself showed 1, 2, 3 … edited headings (the DOM changed step by step)', marksSeen.length >= 6, marksSeen.join(','));
  const grp = await P.ev(`(() => { const e = window.BW.M[window.BW.S.svc].ar; const last = e.ops.slice(-14).filter((o) => /✎/.test(String(o.value))); const g = new Set(last.map((o) => o.id.split('.')[0])); return { g: [...g], ids: last.map((o) => o.id.split('.')[1]), n: last.length }; })()`);
  check('V6: the 12 ops are in order in one group (g.0 … g.11)', grp.g.length === 1 && grp.n === 12 && grp.ids.join(',') === [...Array(12).keys()].join(','), JSON.stringify(grp));
  check('V2: the chip showed «agent editing: <section>» with a time while it ran', chipLive && /\S/.test(chipText) && /^\d\d:\d\d:\d\d$/.test(chipTime), JSON.stringify({ chipText, chipTime }));
  check('V2: the block just edited was outlined at some point', maxHl >= 1, String(maxHl));
  const after = await P.ev(`(() => { const chip = document.getElementById('bw-agent-ind'); return chip && !chip.hidden ? { live: chip.dataset.live, text: chip.querySelector('.lbl').textContent } : null })()`);
  check('V2: after the batch the chip says it is no longer live (last edited)', after && after.live === '0', JSON.stringify(after));
  const ys = samples.map((s) => s.y);
  check('V3: the page never scrolled during the 12 ops', Math.max(...ys.map((y) => Math.abs(y - y0))) <= 2, `y0 ${y0}; seen ${[...new Set(ys)].join(',')}`);
  await sleep(400);
  const caretNow = await P.ev(caretOff);
  const text1 = await P.ev(`document.querySelector('#bw-pair [data-p="' + CSS.escape(${JSON.stringify(caretSel?.p || '')}) + '"]')?.textContent`);
  const model1 = (await call('get', { pointer: caretSel.p, locale: 'ar' })).body.result?.value;
  const wantText = caretSel.text.slice(0, 4) + 'XY' + caretSel.text.slice(4);
  check('V4: what the person typed during the batch landed at the caret (page and document)', typed && text1 === wantText && String(model1).includes('XY'), JSON.stringify({ typed, text1: String(text1).slice(0, 30), model: String(model1).slice(0, 30) }));
  check('V4: the caret is still in that block, right after the typed letters (offset 6)', caretNow === 6, String(caretNow));
  const ok1 = await P.ev('document.activeElement && document.activeElement.isContentEditable');
  check('V4: the block is still editable and focused', ok1 === true, String(ok1));

  // V5: an op on the very block the caret is in
  const r5 = await call('ops', { ops: [{ op: 'setText', path: caretSel.p, value: caretSel.text.slice(0, 4) + 'XY' + ' وصل من الوكيل' }], locale: 'ar', agent: 'Claude (live test)', request_id: 'live-2' });
  await sleep(500);
  const text2 = await P.ev(`document.querySelector('#bw-pair [data-p="' + CSS.escape(${JSON.stringify(caretSel.p)}) + '"]')?.textContent`);
  const caret2 = await P.ev(caretOff);
  const focused2 = await P.ev('document.activeElement && document.activeElement.isContentEditable');
  check('V5: an op on the block being typed in is applied (merged, not blocked) and the block stays focused with the caret in it', r5.status === 200 && r5.body.result?.applied === 1 && String(text2).includes('وصل من الوكيل') && focused2 === true && caret2 >= 0 && caret2 <= String(text2).length, JSON.stringify({ s: r5.status, text2: String(text2).slice(0, 40), caret2, focused2 }));
  const y2 = await P.ev('window.scrollY');
  check('V3: the scroll position was still the same after the merged op', Math.abs(y2 - y0) <= 2, `${y0} -> ${y2}`);
  P.close();
} catch (e) {
  check('the suite ran to the end', false, e.stack || e.message);
} finally {
  if (chrome?.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  try { const h = H.hostState(); if (h && H.alive(h.pid)) await H.stop(); } catch { /* none */ }
}
console.log(out.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  live-edit-0160: ${out.length - failed}/${out.length}`);
process.exit(failed ? 1 : 0);
