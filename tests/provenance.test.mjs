// A13 provenance + A16 lock/share + A17 detection in the editor (design.md §3): two people in two browser contexts
// pass one Save-HTML back and forth (Mark edits, signs and locks → Alaa opens it locked, unlocks with the warning and
// edits → Mark opens hers): every open, op (exact diff), sign, lock, unlock and Save-HTML is in the log with its name,
// the chain verifies and the lock survives the file. A hand-tampered file (edited entry, unlogged edit, stripped log)
// is flagged on open. Exports (PDF + DOCX) carry no provenance and no contributor fingerprint. Served: share writes
// the HTML into the workspace folder and the mirror into HISTORY.
//
//   node tests/provenance.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { serve } from '../engine/serve.mjs';
import { config } from '../engine/config.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-prov-'));
const results = [];
let failed = 0;
const step = (s) => process.env.PV_DEBUG && console.error('step', s);
const check = (name, ok, detail = '') => { step(name); results.push(`${ok ? 'PASS' : 'FAIL'}  provenance: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'prov.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'prov-test', watermarkDir: null });
const fileLib = path.join(tmp, 'lib.editor.html'); // a template and the blank document: the documents-list paths
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: fileLib, set: 'prov-lib', watermarkDir: null });

const profile = (name) => `localStorage.setItem('bw:profile', JSON.stringify({ name: ${JSON.stringify(name)}, activity: true }));`;
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [String(fn), arg]);
// the log's queue must settle: a hang fails the run instead of stalling it
const ready = (page) => page.waitForFunction(() => window.BW?.ready && window.BW.EXT.ledger?.log()).then(() => page.evaluate(() => Promise.race([window.BW.EXT.ledger.ready(), new Promise((_, no) => setTimeout(() => no(new Error('ledger queue did not settle in 20 s')), 20000))])));
const entries = (page) => page.evaluate(() => window.BW.EXT.ledger.log().entries);
const verdict = (page) => page.evaluate(() => window.BW.EXT.ledger.log().verdict);
async function saveHtmlOf(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
  const f = path.join(tmp, name);
  await dl.saveAs(f);
  return f;
}
const setTitle = (page, v) => page.evaluate((v) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return window.BW.commit([{ op: 'setText', path: '/control/title', value: v, old: e.doc.control.title }]); }, v);
const dataOf = (html) => JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html)[1]);
// a real pre-0.13 file: no log, no mark, no timeline marks, no head traces, an old version (review2 #17: every trace gone)
const preV013 = (d) => { const { prov, contrib, bwlog, ...x } = JSON.parse(JSON.stringify(d)); x.version = '0.12.0'; for (const s of x.services) for (const e of Object.values(s.editions)) { delete e.marks; delete e.epochIds; } return x; };
const bareHead = (html) => html.replace(/ data-bw-ledger="[^"]*"/, '').replace(/\n?<meta name="bw-ledger"[^>]*>/, '').replace(/(script-src )'sha256-[^']*' (?='sha256-)/, '$1');
const withData = (html, d) => html.replace(/(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(d).replace(/</g, '\\u003c') + b);

const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const ctxA = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  const ctxB = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  await ctxA.addInitScript(profile('Mark'));
  await ctxB.addInitScript(profile('Alaa'));
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));

  // Mark: three edits, a signature, a lock, Save-HTML
  const a = await ctxA.newPage(); watch(a);
  await a.goto(pathToFileURL(file).href);
  step('goto a');
  await ready(a);
  step('ready a');
  for (const v of ['Permit one', 'Permit two', 'Permit three']) await setTitle(a, v);
  await a.evaluate(() => { window.BW.runAction('pvSign'); }); // resolves after the dialog: not awaited here
  await a.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  await sh(a, (r) => r.querySelector('.bw-modal [data-mk="ok"]').click());
  await a.waitForFunction(() => window.BW.EXT.ledger.log().entries.some((e) => e.kind === 'sign'));
  await a.evaluate(() => window.BW.runAction('lkToggle'));
  await a.evaluate(() => window.BW.EXT.ledger.ready());
  const fileA = await saveHtmlOf(a, 'mark.editor.html');
  const htmlA = fs.readFileSync(fileA, 'utf8');
  const dA = dataOf(htmlA);
  check('Save-HTML carries the encrypted log, the lock and the contributor mark', !!dA.prov?.[dA.services[0].id]?.log && dA.lock?.[dA.services[0].id]?.locked === true && dA.contrib?.length === 1 && !htmlA.includes('"kind":"op"'));
  const eA = await entries(a);
  check('Mark\'s log: key, open, 3 ops, sign, lock, Save-HTML', JSON.stringify(eA.map((e) => e.kind)) === JSON.stringify(['actor-key', 'open', 'op', 'op', 'op', 'sign', 'lock', 'saveHtml']), eA.map((e) => e.kind).join(','));
  const opsA = await a.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops);
  const logged = eA.filter((e) => e.kind === 'op').map((e) => e.data.op);
  check('every op entry is the exact diff (op, path, old, value, id)', logged.length === opsA.length && logged.every((o, i) => ['op', 'path', 'old', 'value', 'id'].every((k) => o[k] === opsA[i][k])), JSON.stringify(logged[0]));

  // Alaa opens Mark's file: locked, history intact
  const b = await ctxB.newPage(); watch(b);
  await b.goto(pathToFileURL(fileA).href);
  await ready(b);
  check('Alaa: the chain verifies', (await verdict(b)).ok, JSON.stringify(await verdict(b)));
  const banner = await sh(b, (r) => r.querySelector('.lk-banner')?.textContent || '');
  check('Alaa: the shared file stays locked, the banner names Mark', banner.includes('Mark'), banner);
  // extras #7: the approval travels too: the banner names the signer, from the log
  await b.waitForFunction(() => /signed by Mark|وقّعها Mark/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector('.lk-banner')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  const banner2 = await sh(b, (r) => r.querySelector('.lk-banner')?.textContent || '');
  check('Alaa: the lock banner names the signer (signed by Mark)', /signed by Mark|وقّعها Mark/.test(banner2), banner2);
  const bx = await sh(b, (r) => { const q = r.querySelector('.lk-banner').getBoundingClientRect(); return { l: q.left, r: q.right, w: innerWidth }; });
  check('Alaa: the lock banner lies inside the viewport', bx.l >= 0 && bx.r <= bx.w, JSON.stringify(bx));
  const before = await b.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const refused = await b.evaluate(() => { try { window.BW.setText('/control/title', 'nope'); return 'changed'; } catch (e) { return e.refused ? 'refused' : e.message; } });
  const after = await b.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  check('Alaa: locked → setText refused, ops unchanged', refused === 'refused' && before === after, `${refused} ${before}→${after}`);
  const tools = await sh(b, (r) => { const x = r.querySelector('[data-a="addPara"]'); return x ? x.disabled : null; });
  check('Alaa: editing tools are disabled while locked', tools === true, String(tools));
  await b.evaluate(() => { window.BW.runAction('lkToggle'); });
  await b.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  const warn = await sh(b, (r) => r.querySelector('.bw-modal .lk-warn')?.textContent || '');
  check('Alaa: unlock shows the warning dialog (no password)', /Mark|owner|صاحب/.test(warn) && !(await sh(b, (r) => !!r.querySelector('.bw-modal input[type="password"]'))), warn);
  await sh(b, (r) => r.querySelector('.bw-modal [data-mk="ok"]').click());
  await b.waitForFunction(() => window.BW.EXT.ledger.log().entries.some((e) => e.kind === 'unlock'));
  await setTitle(b, 'Permit four (Alaa)');
  await b.evaluate(() => window.BW.EXT.ledger.ready());
  const fileB = await saveHtmlOf(b, 'alaa.editor.html');
  const eB = await entries(b);
  const names = eB.map((e) => `${e.actor.name}:${e.kind}`);
  check('Alaa\'s log continues Mark\'s: Mark\'s entries, then Alaa open/unlock/op/Save-HTML', names.slice(0, 8).every((n) => n.startsWith('Mark:')) && ['Alaa:open', 'Alaa:unlock', 'Alaa:op', 'Alaa:saveHtml'].every((n) => names.includes(n)), names.join(' '));
  await b.evaluate(() => window.BW.openDrawer('provenance'));
  const unl = await sh(b, (r) => [...r.querySelectorAll('.drawer .pv-e[data-kind="unlock"] summary')].map((s) => s.textContent).join(' | '));
  check('extras #7: the recipient\'s unlock shows in her Provenance tab with her name', /Alaa/.test(unl), unl);

  // Mark opens Alaa's file: everything visible, with names; drawer lists both
  const a2 = await ctxA.newPage(); watch(a2);
  await a2.goto(pathToFileURL(fileB).href);
  await ready(a2);
  const v2 = await verdict(a2);
  check('Mark opens Alaa\'s copy: chain verifies, extends his mirror', v2.ok, JSON.stringify(v2));
  await a2.evaluate(() => window.BW.openDrawer('provenance'));
  const dr = await sh(a2, (r) => ({ text: r.querySelector('.drawer').textContent, n: r.querySelectorAll('.drawer .pv-e').length, details: r.querySelectorAll('.drawer .pv-e > details').length, rows: r.querySelectorAll('.drawer .pv-people tbody tr').length }));
  check('Provenance tab: every entry, expandable, both contributors', dr.n >= 13 && dr.details === dr.n && dr.rows === 2 && dr.text.includes('Alaa') && dr.text.includes('Mark'), JSON.stringify({ ...dr, text: dr.text.slice(0, 80) }));
  await a2.evaluate(() => window.BW.openDrawer('history'));
  await a2.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .pv-tabs [data-pv="tab-prov"]'));
  await sh(a2, (r) => r.querySelector('.drawer [data-pv="tab-prov"]').click());
  check('«المصدر» is a tab of the Changes drawer', (await a2.evaluate(() => window.BW.S.drawer)) === 'provenance' && (await sh(a2, (r) => r.querySelector('.drawer [data-pv="tab-prov"]')?.getAttribute('aria-pressed'))) === 'true');
  check('authorOf(opId) names the author of an op', (await a2.evaluate((id) => window.BW.EXT.ledger.authorOf(id), opsA[0].id)) === 'Mark');

  // tampered files, opened by Mark (his mirror and pinned keys are on this machine)
  const htmlB = fs.readFileSync(fileB, 'utf8');
  const dB = dataOf(htmlB);
  const svc = dB.services[0].id;
  const doc = dB.prov[svc].doc;
  const logB = await L.unseal(dB.prov[svc].log, doc);
  async function opened(name, html) {
    const f = path.join(tmp, name); fs.writeFileSync(f, html);
    const p = await ctxA.newPage(); watch(p);
    await p.goto(pathToFileURL(f).href);
    await ready(p);
    const v = await verdict(p);
    const toast = await sh(p, (r) => r.querySelector('.toasts')?.textContent || '');
    await p.close();
    return { v, toast, reasons: v.issues.map((i) => i.reason) };
  }
  const edited = JSON.parse(JSON.stringify(logB)); edited.entries.find((e) => e.kind === 'op').data.op.value = 'forged title';
  let r = await opened('t-edited.html', withData(htmlB, { ...dB, prov: { [svc]: { doc, log: await L.seal(edited) } } }));
  check('tamper: an edited entry is flagged on open (banner)', r.reasons.includes('hash') && /tamper|عبث/.test(r.toast), JSON.stringify(r));
  const sneaky = JSON.parse(JSON.stringify(dB)); const ed0 = Object.keys(sneaky.services[0].editions)[0];
  sneaky.services[0].editions[ed0].ops.push({ op: 'setText', path: '/control/subtitle', value: 'unlogged', id: 'zz.0' });
  r = await opened('t-unlogged.html', withData(htmlB, sneaky));
  check('tamper: an unlogged edit in the data block is flagged', r.reasons.includes('unlogged'), JSON.stringify(r));
  const { prov, ...stripped } = dB;
  r = await opened('t-stripped.html', withData(htmlB, stripped));
  check('tamper: a stripped log is flagged', r.reasons.includes('stripped'), JSON.stringify(r));
  // honest limit: log AND bwlog mark removed by hand looks «made before 0.13», but this machine's HISTORY knows the document
  const { prov: _ps, bwlog: _bs, ...bare0 } = dB;
  r = await opened('t-stripped-nomark.html', withData(htmlB, bare0));
  check('tamper: log + mark removed, document id in HISTORY → «stripped», never «made before 0.13»', r.reasons.includes('stripped') && !r.v.legacy, JSON.stringify(r));
  const trunc = JSON.parse(JSON.stringify(logB)); trunc.entries.length = 6;
  r = await opened('t-truncated.html', withData(htmlB, { ...dB, prov: { [svc]: { doc, log: await L.seal(trunc) } } }));
  check('tamper: a truncated log is flagged against this machine\'s mirror', r.reasons.includes('truncated'), JSON.stringify(r));

  // review 0.13.0 line 20, the owner flow: a document from the documents list is logged on every open path, its
  // Save-HTML carries the log, a clean machine verifies it, and an edited file with no log is never «intact»
  const lp = await ctxA.newPage(); watch(lp);
  await lp.goto(pathToFileURL(fileLib).href);
  await ready(lp);
  await setTitle(lp, 'Library one');
  await lp.evaluate(() => window.BW.runAction('save')); // a template's first Save → a new library document
  await lp.waitForFunction(() => /^doc-/.test(window.BW.S.svc));
  const libId = await lp.evaluate(() => window.BW.S.svc);
  await ready(lp);
  check('Save of a template: the new library document carries the history that made it', (await verdict(lp)).ok && (await entries(lp)).some((e) => e.kind === 'op' && e.data.op.value === 'Library one'), JSON.stringify(await verdict(lp)));
  await setTitle(lp, 'Library two');
  await lp.evaluate(() => window.BW.runAction('save'));
  await lp.waitForFunction(async (id) => Object.values((await window.BW.EXT.library.get(id))?.editions || {}).some((e) => e.ops.length >= 2), libId, { timeout: 8000 });
  await ready(lp);
  await lp.goto(pathToFileURL(fileLib).href); // not reload(): the address now holds #doc=<id>, which reopens it at boot
  await ready(lp);
  // reopened from the list: an edit sent before its log is read waits behind it and is logged, never dropped
  const race = await lp.evaluate(async (id) => { await window.BW.EXT.library.open(id); const early = !window.BW.EXT.ledger.attached(); try { window.BW.setText('/control/title', 'too soon'); return early ? 'early' : 'late'; } catch (e) { return e.refused ? 'refused' : e.message; } }, libId);
  await ready(lp);
  check('an edit made while the opened document\'s log is still loading is logged', race === 'early' && (await entries(lp)).some((e) => e.kind === 'op' && e.data.op.value === 'too soon'), race);
  const refusedNoOpen = await lp.evaluate(() => { const s0 = window.BW.S.svc; window.BW.M['doc-never-opened'] = window.BW.M[s0]; window.BW.S.svc = 'doc-never-opened'; try { window.BW.setText('/control/title', 'x'); return 'accepted'; } catch (e) { return e.refused ? 'refused' : e.message; } finally { window.BW.S.svc = s0; delete window.BW.M['doc-never-opened']; } });
  check('guard: a document whose log was never attached (no open event) refuses edits', refusedNoOpen === 'refused', refusedNoOpen);
  await setTitle(lp, 'Library three');
  await ready(lp);
  const eLib = await entries(lp);
  const opsLib = await lp.evaluate(() => Object.values(window.BW.M[window.BW.S.svc]).flatMap((e) => e.ops.map((o) => o.id)));
  const loggedLib = new Set(eLib.filter((e) => e.kind === 'op').map((e) => e.data.op.id));
  check('library document reopened from the list: logged (opens + every op of both sessions), chain intact', (await verdict(lp)).ok && eLib.filter((e) => e.kind === 'open').length >= 2 && opsLib.length === 4 && opsLib.every((id) => loggedLib.has(id)), JSON.stringify({ v: await verdict(lp), kinds: eLib.map((e) => e.kind), opsLib }));
  const fileL = await saveHtmlOf(lp, 'library.editor.html');
  const htmlL = fs.readFileSync(fileL, 'utf8');
  const dL = dataOf(htmlL);
  check('library document Save-HTML carries its log', dL.services[0].id === libId && !!dL.prov?.[libId]?.log, Object.keys(dL.prov || {}).join(','));
  // other open paths: duplicate, new document, an imported file whose entry carries its log
  const dup = await lp.evaluate(async (id) => { const c = await window.BW.EXT.library.duplicate(id); await window.BW.EXT.library.open(c.id); return c.id; }, libId);
  await ready(lp);
  check('duplicate: the copy opens with the chain that vouches for its state', (await verdict(lp)).ok && (await entries(lp)).some((e) => e.kind === 'op') && (await lp.evaluate(() => window.BW.S.svc)) === dup, JSON.stringify(await verdict(lp)));
  await lp.evaluate(() => window.BW.EXT.library.newDocument());
  await ready(lp);
  await setTitle(lp, 'Blank one');
  await ready(lp);
  check('new document: logged from its first open', (await verdict(lp)).ok && (await entries(lp)).some((e) => e.kind === 'op' && e.data.op.value === 'Blank one'), JSON.stringify((await entries(lp)).map((e) => e.kind)));
  const impId = await lp.evaluate(async ([d, id]) => { const s = d.services[0]; const e = { id: `doc-imp-${Date.now()}`, title: 'imported', service: s.id, origin: 'import', createdAt: new Date().toISOString(), savedAt: new Date().toISOString(), editions: Object.fromEntries(Object.entries(s.editions).map(([ed, x]) => [ed, { ...x, stale: x.stale || [], marks: [], epochIds: [] }])), prov: d.prov[id] }; await window.BW.EXT.library.put(e); await window.BW.EXT.library.open(e.id); return e.id; }, [dL, libId]);
  await ready(lp);
  check('import: an entry that carries the file\'s log opens with it', (await verdict(lp)).ok && (await entries(lp)).filter((e) => e.kind === 'op').length >= 3 && (await lp.evaluate(() => window.BW.S.svc)) === impId, JSON.stringify(await verdict(lp)));
  // F5 · 1: the documents list's own import keeps the file's log (entry.prov) and a duplicate names its source (copy.from)
  const viaFile = (html, name) => lp.evaluate(async ([h, n]) => { const e = await window.BW.EXT.library.importAny(new File([h], n, { type: 'text/html' })); return e && { id: e.id, prov: !!e.prov?.log, bwlog: e.bwlog || 0 }; }, [html, name]);
  const imp2 = await viaFile(htmlL, 'library.editor.html');
  await ready(lp);
  check('F5 1: «استيراد» of a Save-HTML keeps its log as entry.prov and opens with it (src entry, chain intact)', imp2?.prov && (await verdict(lp)).ok && (await lp.evaluate(() => window.BW.EXT.ledger.log().src)) === 'entry' && (await entries(lp)).filter((e) => e.kind === 'op').length >= 4, JSON.stringify({ imp2, v: await verdict(lp) }));
  const dup2 = await lp.evaluate(async (id) => { const c = await window.BW.EXT.library.duplicate(id); return { from: c.from, prov: !!c.prov }; }, imp2?.id);
  await ready(lp);
  check('F5 1: a duplicate carries copy.from = its source id and forks the source\'s live log', dup2.from === imp2?.id && !dup2.prov && (await verdict(lp)).ok && (await lp.evaluate(() => window.BW.EXT.ledger.log().src)) === 'fork', JSON.stringify({ dup2, v: await verdict(lp) }));
  // F5 · 1: editor.js addDocument (a JSON document) fires the `open` event
  const openSeen = await lp.evaluate(async () => { const seen = []; window.BW.bwExt({ on: { open: (svc) => seen.push(svc) } }); const sid = window.BW.S.svc; const doc = JSON.parse(Object.values(window.BW.M[sid])[0].raw); doc.service = 'json-doc-f5'; await window.BW.importFile(new File([JSON.stringify(doc)], 'json-doc-f5.ar.json', { type: 'application/json' })); return seen; });
  await ready(lp);
  check('F5 1: opening a JSON document (addDocument) fires `open`', openSeen.includes("json-doc-f5"), JSON.stringify(openSeen));
  // F5 · 2: a Save-HTML made before 0.13 (edited, never a Business-Wrap log, no `bwlog` mark) is neutral, not «stripped»
  // (a state no open log vouches for: otherwise the fork path rightly attaches that log)
  const reword = (d, v) => { const x = JSON.parse(JSON.stringify(d)); Object.values(x.services[0].editions)[0].ops.at(-1).value = v; return x; };
  const legacyD = preV013(reword(dL, 'made in 0.12'));
  check('F5 2: every 0.13 Save-HTML carries the bwlog mark', dL.bwlog === 1, String(dL.bwlog));
  const leg = await viaFile(withData(bareHead(htmlL), legacyD), 'legacy.editor.html');
  await ready(lp);
  const lv = await verdict(lp);
  await lp.evaluate(() => window.BW.openDrawer('provenance'));
  await lp.waitForTimeout(300);
  const legUi = await sh(lp, (r) => { const el = r.querySelector('.drawer .pv-status'); return el && { legacy: el.dataset.legacy === '1', err: el.classList.contains('err'), text: el.textContent }; });
  check('F5 2: a pre-0.13 document shows «بلا سجل (أُنشئت قبل 0.13)», neutral, never «stripped»', !leg?.bwlog && lv.ok && lv.legacy && legUi?.legacy && !legUi.err && /0\.13/.test(legUi.text), JSON.stringify({ leg, lv, legUi }));
  await setTitle(lp, 'Legacy edited');
  await ready(lp);
  check('F5 2: a pre-0.13 document\'s edits from now on are logged', (await entries(lp)).some((e) => e.kind === 'op' && e.data.op.value === 'Legacy edited') && (await entries(lp)).some((e) => e.kind === 'open' && e.data.src === 'legacy'), JSON.stringify((await entries(lp)).map((e) => e.kind)));
  const { prov: _p1, ...strippedD } = reword(dL, 'log removed by hand');
  await viaFile(withData(htmlL, strippedD), 'stripped.editor.html');
  await ready(lp);
  check('F5 2: a 0.13 document whose log was removed (bwlog mark kept) stays «stripped»', (await verdict(lp)).issues.some((i) => i.reason === 'stripped'), JSON.stringify(await verdict(lp)));
  await lp.close();
  // a clean machine (Rami): the library document's file verifies; the same file with its log and mark removed does not
  const ctxC = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
  await ctxC.addInitScript(profile('Rami'));
  async function openedOn(ctx, name, html) {
    const f = path.join(tmp, name); fs.writeFileSync(f, html);
    const p = await ctx.newPage(); watch(p);
    await p.goto(pathToFileURL(f).href);
    await ready(p);
    const v = await verdict(p);
    await p.close();
    return { v, reasons: v.issues.map((i) => i.reason) };
  }
  r = await openedOn(ctxC, 'c-library.html', htmlL);
  check('clean machine: the library document\'s file opens with an intact chain', r.v.ok, JSON.stringify(r));
  const { prov: _p, contrib: _c, ...bare } = dL;
  r = await openedOn(ctxC, 'c-bare.html', withData(htmlL, bare));
  check('clean machine: an edited file with no log and no mark is «stripped», never intact', r.reasons.includes('stripped'), JSON.stringify(r));
  const { prov: _p4, bwlog: _b4, ...t4e } = dL;
  r = await openedOn(ctxC, 'c-t4.html', withData(htmlL, t4e));
  check('review2 #17 (editor, no HISTORY): log + bwlog mark removed by hand → «stripped», never «made before 0.13»', r.reasons.includes('stripped') && !r.v.legacy, JSON.stringify(r));
  r = await openedOn(ctxC, 'c-t4-head.html', withData(htmlL, preV013(dL)));
  check('review2 #17 (editor): the data block fully stripped, the head traces left → «stripped»', r.reasons.includes('stripped') && !r.v.legacy, JSON.stringify(r));
  const trL = await L.unseal(dL.prov[libId].log, dL.prov[libId].doc); trL.entries.length -= 1;
  r = await openedOn(ctxC, 'c-trunc.html', withData(htmlL, { ...dL, prov: { [libId]: { ...dL.prov[libId], log: await L.seal(trL) } } }));
  check('clean machine: a tail cut from the log is flagged (no mirror needed)', r.reasons.includes('truncated'), JSON.stringify(r));
  { // 0.13.1 final pass #1: a Save-HTML of an older 0.13 version served by this one is re-wrapped with every provenance field
    const olderD = { ...JSON.parse(JSON.stringify(dL)), version: '0.13.0', lock: dL.lock ?? {}, projectsLink: { p: 'kept' } };
    const fOld = path.join(tmp, 'older-0.13.0.editor.html'); fs.writeFileSync(fOld, withData(htmlL, olderD));
    const srvOld = await serve(fOld, 0, {});
    try {
      const htmlS = await (await fetch(`http://127.0.0.1:${srvOld.address().port}/`)).text();
      const dS = dataOf(htmlS);
      const keep = ['bwlog', 'prov', 'contrib', 'lock', 'projectsLink'].filter((k) => JSON.stringify(dS[k]) !== JSON.stringify(olderD[k]));
      const tr = L.traces(dS, libId, htmlS).join();
      check('re-wrap: an older 0.13 Save-HTML served by this version keeps log, bwlog mark, contributors, lock, unknown keys and the head traces', dS.version !== '0.13.0' && !keep.length && tr === 'mark,timeline,meta,root,csp', JSON.stringify({ v: dS.version, keep, tr }));
      const p = await ctxC.newPage(); watch(p);
      await p.goto(`http://127.0.0.1:${srvOld.address().port}/`);
      await ready(p);
      const v = await verdict(p);
      const src = await p.evaluate(() => window.BW.EXT.ledger.log().src);
      check('re-wrap: the served older file opens with its full history intact (src html, not «stripped», not «made before 0.13»)', v.ok && !v.legacy && src === 'html' && (await entries(p)).filter((e) => e.kind === 'op').length >= 1, JSON.stringify({ v, src }));
      await p.close();
    } finally { srvOld.closeAllConnections?.(); await new Promise((ok) => srvOld.close(ok)); }
  }
  await ctxC.close();

  // verify-history (CLI) is as strict as the editor: content-only edit, raw text edit, tail cut, stripped log
  const cli = (f) => { const x = spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'verify-history', f, '--history', path.join(tmp, 'no-history'), '--json'], { encoding: 'utf8' }); let j = null; try { j = JSON.parse(x.stdout); } catch { /* */ } return { code: x.status, problems: j?.gates?.[0]?.problems || [], out: x.stdout + x.stderr }; };
  const putH = (name, d, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, withData(html, d)); return f; };
  const put = (name, d) => putH(name, d, htmlL);
  { // review2 #17: the 0.13 traces live in independent places; stripping the log and the mark (the review's T4) is not enough
    check('review2 #17: a 0.13 Save-HTML carries every trace (mark, timeline marks, head meta, <html> attribute, CSP hash, version)', L.traces(dL, libId, htmlL, { version: true }).join() === 'mark,timeline,meta,root,csp,version' && L.traceDoc(htmlL) === dL.prov[libId].doc, L.traces(dL, libId, htmlL, { version: true }).join());
    const { prov: _x, bwlog: _y, ...t4 } = dL;
    const c4 = cli(put('v-t4.html', t4));
    check('review2 #17: log + bwlog mark removed (T4) → verify-history «stripped», never «made before 0.13»', c4.code === 1 && c4.problems.some((p) => /stripped/.test(p)) && !c4.problems.some((p) => /made before/.test(p)), c4.out.slice(0, 300));
    const t5 = preV013(dL); t5.version = dL.version;
    const c5 = cli(putH('v-t5.html', t5, bareHead(htmlL)));
    check('review2 #17: everything stripped but the file’s own version → still «stripped»', c5.code === 1 && c5.problems.some((p) => /stripped/.test(p)), c5.out.slice(0, 300));
    const c6 = cli(putH('v-t6.html', preV013(dL), htmlL));
    check('review2 #17: data block fully stripped, head traces left → still «stripped»', c6.code === 1 && c6.problems.some((p) => /stripped/.test(p)), c6.out.slice(0, 300));
  }
  let c = cli(fileL);
  check('verify-history: an honest Save-HTML passes', c.code === 0, c.out.slice(0, 200));
  { // F5 · 3: the ledger gate is the same full verify (content-only edit caught); F5 · 2: a pre-0.13 file is named so, not «stripped»
    const { gateLedger } = await import('../engine/heal/gates.mjs');
    const cF = JSON.parse(JSON.stringify(dL)); const edF = Object.keys(cF.services[0].editions)[0]; cF.services[0].editions[edF].ops.at(-1).value = 'forged for the gate';
    const g = await gateLedger(put('g-content.html', cF), { history: path.join(tmp, 'no-history') });
    const g0 = await gateLedger(fileL, { history: path.join(tmp, 'no-history') });
    check('F5 3: gate ledger runs the full verify: an honest file PASSes, a content-only edit FAILs (unlogged)', g0.verdict === 'PASS' && g.verdict === 'FAIL' && g.problems.some((x) => /unlogged/.test(x)), JSON.stringify({ g0: g0.problems, g: g.problems }));
    const legacyD = preV013(dL);
    const cl = cli(putH('v-legacy.html', legacyD, bareHead(htmlL)));
    check('F5 2: verify-history on a pre-0.13 file says «made before 0.13», not stripped', cl.code === 1 && cl.problems.some((x) => /made before 0\.13/.test(x)) && !cl.problems.some((x) => /stripped/.test(x)), cl.out.slice(0, 200));
    const kh = path.join(tmp, 'knows-history'); fs.mkdirSync(kh, { recursive: true });
    fs.writeFileSync(path.join(kh, `${String(legacyD.services[0].id).replace(/:/g, '_')}.heads.json`), JSON.stringify({ doc: legacyD.services[0].id, head: { seq: 1, hash: 'x' }, hashes: [], pins: {} }));
    const gk = await gateLedger(putH('v-legacy-known.html', legacyD, bareHead(htmlL)), { history: kh });
    check('honest limit: log + mark removed, but HISTORY knows the document id → «stripped»', gk.verdict === 'FAIL' && gk.problems.some((x) => /stripped/.test(x)) && !gk.problems.some((x) => /made before 0\.13/.test(x)), JSON.stringify(gk.problems));
  }
  const cOps = JSON.parse(JSON.stringify(dL)); const edL = Object.keys(cOps.services[0].editions)[0];
  cOps.services[0].editions[edL].ops.at(-1).value = 'forged in the data block';
  c = cli(put('v-content.html', cOps));
  check('verify-history: a content-only tamper (an op changed, log untouched) fails', c.code === 1 && c.problems.some((p) => /unlogged/.test(p)), c.out.slice(0, 200));
  const cRaw = JSON.parse(JSON.stringify(dL)); const rawDoc = JSON.parse(cRaw.services[0].editions[edL].raw); rawDoc.control.title = 'forged base'; cRaw.services[0].editions[edL].raw = JSON.stringify(rawDoc);
  c = cli(put('v-raw.html', cRaw));
  check('verify-history: the base text changed with its old hash kept fails', c.code === 1 && c.problems.some((p) => /unlogged/.test(p)), c.out.slice(0, 200));
  c = cli(put('v-trunc.html', { ...dL, prov: { [libId]: { ...dL.prov[libId], log: await L.seal(trL) } } }));
  check('verify-history: tail truncation fails', c.code === 1 && c.problems.some((p) => /truncated|unlogged/.test(p)), c.out.slice(0, 200));
  c = cli(put('v-bare.html', bare));
  check('verify-history: an edited file with its log removed fails', c.code === 1 && c.problems.some((p) => /stripped/.test(p)), c.out.slice(0, 200));

  // exports carry no provenance and no contributor fingerprint
  const docNow = await a2.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc);
  const edNow = await a2.evaluate(() => window.BW.S.ed);
  const pdf = path.join(tmp, 'x.pdf'), docx = path.join(tmp, 'x.docx');
  await exportPdf(docNow, { locale: edNow, theme: loadTheme(), pdfPath: pdf, browser });
  exportDocx(docNow, { locale: edNow, theme: loadTheme(), docxPath: docx });
  const kids = [...new Set(logB.entries.map((e) => e.actor.kid))], ids = [...new Set(logB.entries.map((e) => e.actor.id))];
  const marks = [...kids, ...ids, 'bwlog', 'bw-prov', 'data-bw-contrib', '"prov"'];
  const pdfBytes = fs.readFileSync(pdf, 'latin1');
  const pop = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdftotext.exe')));
  const pdfText = spawnSync(pop ? path.join(pop, 'pdftotext') : 'pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
  const unz = spawnSync('python', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("".join(z.read(n).decode("utf8","replace") for n in z.namelist() if n.endswith(".xml") or n.endswith(".rels")))', docx], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '';
  check('PDF export: no provenance, no contributor fingerprint', pdfText.length > 100 && marks.every((m) => !pdfBytes.includes(m) && !pdfText.includes(m)), marks.find((m) => pdfBytes.includes(m) || pdfText.includes(m)) || `text ${pdfText.length}`);
  check('DOCX export: no provenance, no contributor fingerprint', unz.length > 1000 && marks.every((m) => !unz.includes(m)), marks.find((m) => unz.includes(m)) || `xml ${unz.length}`);

  // served: share writes into the workspace HTML folder, the mirror into HISTORY
  const dirs = { pdf: path.join(tmp, 'ws', 'PDF'), docx: path.join(tmp, 'ws', 'DOCX'), html: path.join(tmp, 'ws', 'HTML'), history: path.join(tmp, 'ws', 'HISTORY') };
  const served = path.join(tmp, 'served', 'prov.editor.html');
  fs.mkdirSync(path.dirname(served), { recursive: true });
  fs.copyFileSync(fileB, served);
  server = await serve(served, 0, { workspace: { dirs } });
  const s = await ctxA.newPage(); watch(s);
  await s.goto(`http://127.0.0.1:${server.address().port}/`);
  await ready(s);
  await s.evaluate(() => { window.BW.runAction('shShare'); });
  await s.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal'));
  await sh(s, (r) => { const i = r.querySelector('.bw-modal [data-sh="to"]'); i.value = 'Rami'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('.bw-modal [data-mk="ok"]').click(); });
  await s.waitForFunction(() => !!window.BW.S.lastShare, null, { timeout: 15000 });
  const sharedPath = await s.evaluate(() => window.BW.S.lastShare);
  await s.evaluate(() => window.BW.EXT.ledger.ready());
  await s.waitForTimeout(700); // the mirror is written 400 ms after the last entry
  const sharedData = fs.existsSync(sharedPath) ? dataOf(fs.readFileSync(sharedPath, 'utf8')) : null;
  const sharedLog = sharedData ? await L.unseal(sharedData.prov[svc].log, doc) : null;
  check('share: the HTML lands in the workspace HTML folder with its log (share entry, recipient)', sharedPath.startsWith(dirs.html) && sharedLog?.entries.some((e) => e.kind === 'share' && e.data.to === 'Rami'), sharedPath);
  const hist = fs.existsSync(dirs.history) ? fs.readdirSync(dirs.history) : [];
  check('served: the log is mirrored in HISTORY (.bwlog + heads)', hist.some((f) => f.endsWith('.bwlog')) && hist.some((f) => f.endsWith('.heads.json')), hist.join(','));
  const heads = JSON.parse(fs.readFileSync(path.join(dirs.history, hist.find((f) => f.endsWith('.heads.json'))), 'utf8'));
  const lowered = await (await fetch(`http://127.0.0.1:${server.address().port}/api/history`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc, log: sharedData.prov[svc].log, mirror: { head: { seq: 1, hash: 'x' }, hashes: [], pins: {} } }) })).json();
  check('served: the HISTORY head never moves back', lowered.mirror.head.seq === heads.head.seq, JSON.stringify(lowered.mirror.head));
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close(); // first: an open page keeps a keep-alive connection that server.close() would wait on
  if (server) { server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  provenance: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
