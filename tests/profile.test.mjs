// A12 profile and work metrics (design.md §3 A12): the profile modal shows once on first launch (Skip works, a saved
// name is used by the log), the recording notice and the off switch are there; metrics come from the provenance log
// (a scripted session of 10 edits over a faked 3 minutes = 10 edits, 3 min active); the manager report (Settings →
// Performance report → served POST /api/report) is a PDF with the person's name, 3 SVG charts, a template-written
// story, Thmanyah only and no Type 3 fonts.
//
//   node tests/profile.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { reportData, reportHtml } from '../engine/report.mjs';
import { serve } from '../engine/serve.mjs';
import { config } from '../engine/config.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-profile-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local'); // the host's profile copy (H3) stays in the temp folder
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  profile: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'p.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'profile-test', watermarkDir: null });
const sh = (page, fn) => page.evaluate((f) => new Function('r', `return (${f})(r)`)(document.getElementById('bw-ui-host').shadowRoot), String(fn));
const pop = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdffonts.exe')));
const tool = (n) => (pop ? path.join(pop, n) : n);

const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const errors = [];
  // first launch: the modal, once; Skip works
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('bw:profile-prompt', '1')); // automation opt-in (a person always sees the card)
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(pathToFileURL(file).href);
  await p.waitForFunction(() => window.BW?.ready);
  await p.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  const m = await sh(p, (r) => ({ notice: r.querySelector('.bw-modal .hint')?.textContent || '', off: !!r.querySelector('.bw-modal [data-pf="activity"]'), name: !!r.querySelector('.bw-modal [data-pf="name"]'), pic: !!r.querySelector('.bw-modal [data-pf="pick"]') }));
  check('first launch: profile modal with name, picture, recording notice and off switch', m.name && m.pic && m.off && m.notice.length > 40, JSON.stringify(m));
  const p0 = await (await browser.newContext()).newPage();
  await p0.goto(pathToFileURL(file).href);
  await p0.waitForFunction(() => window.BW?.ready);
  await p0.waitForTimeout(400);
  check('under automation without the opt-in the card stays away (other suites drive the page)', !(await sh(p0, (r) => !!r.querySelector('.bw-modal'))));
  await p0.context().close();
  await sh(p, (r) => r.querySelector('.bw-modal [data-mk="skip"]').click());
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('bw:profile')));
  check('Skip stores a profile and closes the modal', stored?.skipped === true && !(await sh(p, (r) => !!r.querySelector('.bw-modal'))));
  await p.reload();
  await p.waitForFunction(() => window.BW?.ready);
  await p.waitForTimeout(500);
  check('the modal is shown once (not after a reload)', !(await sh(p, (r) => !!r.querySelector('.bw-modal'))));
  await ctx.close();

  // a named profile; a scripted session of 10 edits, 20 s apart, on a faked clock
  const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx2.addInitScript(() => localStorage.setItem('bw:profile-prompt', '1'));
  const q = await ctx2.newPage();
  q.on('pageerror', (e) => errors.push(e.message));
  await q.clock.install({ time: new Date('2026-10-28T09:00:00.000Z') });
  await q.goto(pathToFileURL(file).href);
  await q.waitForFunction(() => !!document.getElementById('bw-ui-host')?.shadowRoot.querySelector('.bw-modal'));
  await sh(q, (r) => { r.querySelector('.bw-modal [data-pf="name"]').value = 'Mark'; r.querySelector('.bw-modal [data-mk="ok"]').click(); });
  await q.evaluate(() => window.BW.EXT.ledger.ready());
  for (let k = 0; k < 10; k += 1) {
    if (k) await q.clock.fastForward(20000);
    await q.evaluate((k) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; window.BW.commit([{ op: 'setText', path: '/control/title', value: `Title ${k}`, old: e.doc.control.title }]); }, k);
  }
  await q.evaluate(() => window.BW.EXT.ledger.ready());
  const log = await q.evaluate(() => window.BW.EXT.ledger.log());
  const met = L.metrics(log.entries)[log.entries[0].actor.id];
  check('the log carries the profile name (every entry after the first-launch card)', log.entries.filter((e) => e.kind === 'op').every((e) => e.actor.name === 'Mark') && log.entries.filter((e) => e.kind === 'op').length === 10);
  check('metrics from the log: 10 edits over 3 min = 10 edits, 3 min active', met.edits === 10 && Math.round(met.activeMs / 6e4) === 3 && met.sessions === 1, JSON.stringify({ edits: met.edits, activeMs: met.activeMs, sessions: met.sessions }));
  await q.evaluate(() => window.BW.openDrawer('settings'));
  const cards = await sh(q, (r) => ({ name: r.querySelector('.set-x-profile [data-pf="name"]')?.value, report: !!r.querySelector('.set-x-report [data-rp="go"]'), limit: r.querySelector('.set-x-trust .pf-limit')?.textContent || '' }));
  check('Settings: profile card (name), report card, trust card with the honest limit', cards.name === 'Mark' && cards.report && /APP_KEY_V1/.test(cards.limit) && /(timestamp|ختم زمني)/.test(cards.limit), JSON.stringify(cards));
  await q.evaluate(() => window.BW.openDrawer('provenance'));
  const drawerMet = await sh(q, (r) => [...(r.querySelector('.drawer .pv-people tbody tr')?.cells || [])].map((c) => c.textContent.trim()));
  check('per-document metrics in the Provenance tab (edits, active minutes, sessions)', drawerMet[0] === 'Mark' && drawerMet[2] === '10' && /^3 /.test(drawerMet[3]) && drawerMet[4] === '1', JSON.stringify(drawerMet));
  await ctx2.close();

  // the report: model + print HTML, then through the served route from Settings
  const keys = await L.newKeys();
  const hist = { doc: 'doc-report-1', entries: [] };
  const t0 = Date.parse('2026-10-20T08:00:00.000Z');
  const mk = { id: 'actor-mark', name: 'Mark' }, al = { id: 'actor-alaa', name: 'Alaa' };
  await L.append(hist, { kind: 'open', actor: mk, keys, at: new Date(t0).toISOString(), data: { title: 'Event permit' } });
  for (let k = 0; k < 10; k += 1) await L.append(hist, { kind: 'op', actor: mk, keys, at: new Date(t0 + (k + 1) * 20e3).toISOString(), data: { ed: 'ar', op: { op: 'setText', path: '/p', value: 'one two three', old: 'one', id: `r${k}.0` } } });
  const keysB = await L.newKeys();
  await L.append(hist, { kind: 'open', actor: al, keys: keysB, at: new Date(t0 + 864e5).toISOString(), data: { title: 'Event permit' } });
  await L.append(hist, { kind: 'sign', actor: al, keys: keysB, at: new Date(t0 + 864e5 + 60e3).toISOString() });
  const d = reportData([hist], { from: '2026-10-01', to: '2026-10-31' });
  const html = reportHtml(d, { lang: 'en' });
  check('report model: people, edits, active hours, documents', d.people.length === 2 && d.people.find((x) => x.name === 'Mark').edits === 10 && d.docs.length === 1 && d.docs[0].status === 'signed', JSON.stringify(d.people.map((x) => [x.name, x.edits, x.activeMs])));
  check('report print HTML: 3 SVG charts and a template story naming the person', (html.match(/<svg /g) || []).length === 3 && /During 2026-10-01 – 2026-10-31, Mark worked on 1 document/.test(html));

  // review 0.13.0 line 16: many documents. A template opened at launch (no work), a document saved from it (its log
  // starts with a copy of the template's), typed edits (one op re-logged after each pause) and exports
  const nd = { id: 'actor-rami', name: 'Rami' };
  const kN = await L.newKeys();
  const at = (s) => new Date(t0 + s * 1e3).toISOString();
  const tpl = { doc: 'tpl', entries: [] };
  await L.append(tpl, { kind: 'open', actor: nd, keys: kN, at: at(0), data: { title: 'وثيقة متطلبات: خدمة جديدة' } });
  const tplWork = { doc: 'tpl2', entries: [] };
  await L.append(tplWork, { kind: 'open', actor: nd, keys: kN, at: at(10), data: { title: 'وثيقة متطلبات: طلب ترخيص فعالية عامة في الساحات' } });
  await L.append(tplWork, { kind: 'op', actor: nd, keys: kN, at: at(20), data: { ed: 'ar', op: { op: 'setText', path: '/p', value: 'one', old: '', id: 'n1.0' } } });
  const forked = { doc: 'doc-forked', entries: JSON.parse(JSON.stringify(tplWork.entries)) };
  await L.append(forked, { kind: 'open', actor: nd, keys: kN, at: at(30), data: { title: 'وثيقة متطلبات: طلب ترخيص فعالية عامة في الساحات' } });
  for (const [s, v] of [[40, 'a b'], [50, 'a b c'], [60, 'a b c d']]) await L.append(forked, { kind: 'op', actor: nd, keys: kN, at: at(s), data: { ed: 'ar', typed: true, op: { op: 'setText', path: '/q', value: v, old: 'a', id: 'n2.0' } } });
  await L.append(forked, { kind: 'op', actor: nd, keys: kN, at: at(70), data: { ed: 'ar', op: { op: 'setText', path: '/r', value: 'x', old: '', id: 'n3.0' } } });
  await L.append(forked, { kind: 'export', actor: nd, keys: kN, at: at(80), data: { pdf: true, docx: true } });
  const other = { doc: 'doc-other', entries: [] };
  await L.append(other, { kind: 'open', actor: nd, keys: kN, at: at(90), data: { title: 'وثيقة متطلبات: خدمة ثانية' } });
  await L.append(other, { kind: 'op', actor: nd, keys: kN, at: at(100), data: { ed: 'ar', op: { op: 'setText', path: '/p', value: 'z', old: '', id: 'n4.0' } } });
  await L.append(other, { kind: 'export', actor: nd, keys: kN, at: at(110), data: { pdf: true } });
  const dm = reportData([tpl, tplWork, forked, other], { from: '2026-10-01', to: '2026-10-31', people: ['actor-rami'] });
  const pn = dm.people[0] || {};
  check('report across documents: 4 edits (a typed op once, a copied entry once), 2 exports, 2 documents (the opened template is not work)', pn.edits === 4 && pn.exports === 2 && pn.docs === 2 && dm.docs.length === 2, JSON.stringify({ edits: pn.edits, exports: pn.exports, docs: pn.docs, list: dm.docs }));
  const st = reportHtml(dm, { lang: 'ar' });
  check('report story matches the numbers (edits, exports, busiest document)', /أجرى 4 تعديلًا/.test(st) && /صدّر 2 مرة/.test(st) && /أكثر الوثائق نشاطًا «طلب ترخيص فعالية عامة في الساحات» بـ 3 تعديلًا/.test(st), st.match(/خلال[^<]*/)?.[0]);
  // chart labels stay inside their chart (they printed as one letter under RTL)
  const rp = await browser.newPage();
  await rp.setContent(st);
  const out = await rp.evaluate(() => [...document.querySelectorAll('svg.chart')].flatMap((s) => { const w = s.viewBox.baseVal.width; return [...s.querySelectorAll('text')].map((x) => { const b = x.getBBox(); return { t: x.textContent, l: b.x, r: b.x + b.width, w }; }); }).filter((b) => b.l < -0.5 || b.r > b.w + 0.5));
  await rp.close();
  check('report charts (RTL): every label inside its chart, none cut to one letter', out.length === 0, JSON.stringify(out.slice(0, 3)));

  const dirs = { pdf: path.join(tmp, 'ws', 'PDF'), docx: path.join(tmp, 'ws', 'DOCX'), html: path.join(tmp, 'ws', 'HTML'), history: path.join(tmp, 'ws', 'HISTORY') };
  fs.mkdirSync(dirs.history, { recursive: true });
  fs.writeFileSync(path.join(dirs.history, 'doc-report-1.bwlog'), await L.seal(hist));
  fs.writeFileSync(path.join(dirs.history, 'doc-report-1.heads.json'), JSON.stringify(L.mirrorOf(hist, null, {})));
  server = await serve(file, 0, { workspace: { dirs } });
  const ctx3 = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx3.addInitScript(`localStorage.setItem('bw:profile', JSON.stringify({ name: 'Rami' }))`);
  const s = await ctx3.newPage();
  s.on('pageerror', (e) => errors.push(e.message));
  await s.goto(`http://127.0.0.1:${server.address().port}/`);
  await s.waitForFunction(() => window.BW?.ready);
  await s.evaluate(() => window.BW.openDrawer('settings'));
  await s.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.set-x-report [data-person]').length >= 2);
  await sh(s, (r) => { r.querySelector('.set-x-report [data-rp="from"]').value = '2026-10-01'; r.querySelector('.set-x-report [data-rp="to"]').value = '2026-10-31'; r.querySelector('.set-x-report [data-rp="go"]').click(); });
  await s.waitForFunction(() => /\.pdf/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector('.set-x-report [data-rp="out"]').textContent), null, { timeout: 60000 });
  const pdfs = fs.existsSync(dirs.pdf) ? fs.readdirSync(dirs.pdf).filter((f) => f.endsWith('.pdf')) : [];
  check('Settings → report → PDF in the workspace PDF folder', pdfs.length === 1, pdfs.join(','));
  const pdf = path.join(dirs.pdf, pdfs[0] || 'none.pdf');
  const txt = spawnSync(tool('pdftotext'), ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  const fonts = spawnSync(tool('pdffonts'), [pdf], { encoding: 'utf8' }).stdout || '';
  check('report PDF names the people and tells the story', txt.includes('Mark') && txt.includes('Alaa') && /خلال/.test(txt) && /عمل/.test(txt), txt.slice(0, 300));
  const faces = fonts.split('\n').slice(2).filter(Boolean);
  check('report PDF fonts: Thmanyah only, TrueType, no Type 3', faces.length > 0 && faces.every((l) => /thmanyah/i.test(l) && /TrueType/.test(l)) && !/Type 3/.test(fonts), fonts);
  await ctx3.close();
  // H3: the profile reaches the host at once (.local + HISTORY) and comes back on a fresh origin, also after the .local
  // copy is gone (an update into a new install folder): the first-launch card is not shown again
  await new Promise((r) => setTimeout(r, 600));
  const hostProf = (() => { try { return JSON.parse(fs.readFileSync(path.join(tmp, '.local', 'profile.json'), 'utf8')).profile; } catch { return ''; } })();
  check('a served page hands its profile to the host at once: .local/profile.json and HISTORY\\profile.json.gz', /Rami/.test(hostProf) && fs.existsSync(path.join(dirs.history, 'profile.json.gz')), hostProf);
  fs.rmSync(path.join(tmp, '.local', 'profile.json'), { force: true });
  const ctx4 = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx4.addInitScript(() => localStorage.setItem('bw:profile-prompt', '1'));
  const s4 = await ctx4.newPage();
  await s4.goto(`http://127.0.0.1:${server.address().port}/`);
  await s4.waitForFunction(() => window.BW?.ready);
  await s4.waitForTimeout(800);
  const back = await s4.evaluate(() => ({ card: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'), name: JSON.parse(localStorage.getItem('bw:profile') || 'null')?.name }));
  check('empty browser storage and no .local copy: the profile comes back from HISTORY, no first-launch card', !back.card && back.name === 'Rami', JSON.stringify(back));
  const bad = await fetch(`http://127.0.0.1:${server.address().port}/api/profile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: 'not json' }) });
  check('the host keeps only a real profile (POST /api/profile refuses anything else)', bad.status === 400);
  await ctx4.close();
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); // first: an open page keeps a keep-alive connection that server.close() would wait on
  if (server) { server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  profile: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
