// Owner flows (F4, review-0.13.0 line 36): one titled check per requirement line of the owner's request
// (Downloads\Business-Wrap\original-prompt.md, lines 3–41), driven the way the owner drives the editor: a real
// background host (engine/host.mjs) on a free port, a fresh profile, clicks on the page, the toolbar's own actions.
// It also replays the review's failing flows: open from the list → edit → the saved HTML carries provenance; image +
// move down ×2 → no exception; header item "this page only"; the check panel's jump rings a body element; side panels
// collapsed; save naming.
//
// Checks tagged «xfail L<n>» are the review's open FAIL/PARTIAL items that F1/F2/F3 fix in parallel: they print XFAIL
// (expected) or XPASS (fixed) and do not fail the run. Every other check must pass. BW_STRICT=1 makes an XFAIL a FAIL
// (use it after the merge, then drop the line from XF below).
//
//   node tests/owner-flows.test.mjs              headless (npm test)
//   BW_HEADED=1 node tests/owner-flows.test.mjs  headed, slowed down, to watch it
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-owner-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_BROWSER_STUB = path.join(tmp, 'browser.log');
process.env.BW_UPDATE_TOKEN = 'none';
fs.mkdirSync(process.env.BW_WORKSPACE);
const { buildEditor } = await import('../engine/build-editor.mjs');
const { launchOptions, REPO } = await import('../engine/export.mjs');
const H = await import('../engine/host.mjs');
const W = await import('../engine/workspace.mjs');
const { VERBS } = await import('../engine/cli.mjs');

// the review's open items, fixed by F1/F2/F3 in parallel (review-0.13.0.md line numbers = original-prompt.md lines)
const XF = new Set([]); // F5: every review line is green under BW_STRICT=1 (was 7, 11, 15, 16, 17, 18, 20, 24, 28, 38)
const STRICT = process.env.BW_STRICT === '1';
const HEADED = process.env.BW_HEADED === '1';
const out = [];
let failed = 0, xfail = 0, xpass = 0;
const xfLines = new Set();
function check(line, name, ok, detail = '', xf = false) {
  let tag = ok ? 'PASS' : 'FAIL';
  if (xf && XF.has(line) && !STRICT) { tag = ok ? 'XPASS' : 'XFAIL'; if (ok) xpass += 1; else { xfail += 1; xfLines.add(line); } }
  else if (!ok) failed += 1;
  const s = `${tag.padEnd(5)}  L${line}${xf ? ` (xfail L${line})` : ''}: ${name}${detail && !ok ? '  — ' + String(detail).slice(0, 300) : ''}`;
  out.push(s);
  if (HEADED) console.log(s);
}
// stall bound: a hung step must never hold `npm test` (the first draft waited 49 min on a dialog)
setTimeout(async () => { console.log(`${out.join('\n')}\nFAILED: owner-flows stalled past 8 min`); await H.stop().catch(() => {}); process.exit(1); }, 8 * 60e3).unref();
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const readJ = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const editor = path.join(tmp, 'owner.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: editor, set: 'owner-flows', watermarkDir: null });
const png = path.join(tmp, 'pic.png');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGP4z8CAFTGMKhhVMKpgVMGogqGoAAAzz/8Bl1rGUQAAAABJRU5ErkJggg==', 'base64'));

const browser = await chromium.launch({ ...launchOptions(), headless: !HEADED, slowMo: HEADED ? 120 : 0 });
let h = null;
try {
  // ── non-UI lines: files, CLI, MCP ─────────────────────────────────────────────
  const pkg = readJ(path.join(REPO, 'package.json'));
  const status = spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'status', '--json'], { encoding: 'utf8', env: { ...process.env, BW_STATE_DIR: path.join(tmp, 'state') } });
  let st = {}; try { st = JSON.parse(status.stdout); } catch { /* printed below */ }
  check(3, 'the healer is installed and reported by `business-wrap status`', status.status === 0 && fs.existsSync(path.join(REPO, 'engine', 'heal')) && JSON.stringify(st).includes('heal'), status.stderr || status.stdout.slice(0, 200));
  check(5, 'this checkout is 0.13.0 with its CHANGELOG entry (the version worked on)', pkg.version === '0.13.0' && /0\.13\.0/.test(fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8')));
  check(31, 'licence: MIT in LICENSE, package.json and plugin.json', /MIT License/.test(fs.readFileSync(path.join(REPO, 'LICENSE'), 'utf8')) && pkg.license === 'MIT' && readJ(path.join(REPO, '.claude-plugin', 'plugin.json')).license === 'MIT');
  check(33, 'script, not AI: the CLI covers open/close/status/new/build/harvest/import/export/report/update and says ai false', ['open', 'close', 'status', 'new', 'build', 'harvest', 'import', 'export', 'report', 'update'].every((v) => VERBS.includes(v)) && st.ai === false, JSON.stringify({ VERBS, ai: st.ai }));
  const tools = await new Promise((resolve) => {
    const P = readJ(path.join(REPO, '.claude-plugin', 'plugin.json')).mcpServers['business-wrap'];
    const cp = spawn(P.command === 'node' ? process.execPath : P.command, P.args.map((a) => a.replaceAll('${CLAUDE_PLUGIN_ROOT}', REPO)), { env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    const done = (v) => { clearTimeout(t); cp.kill(); resolve(v); };
    const t = setTimeout(() => done([]), 30000);
    cp.on('error', () => done([]));
    cp.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0;) {
        const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
        if (m.id === 1) { cp.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n'); }
        if (m.id === 2) done((m.result?.tools || []).map((x) => x.name));
      }
    });
    cp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'owner-flows', version: '0' } } }) + '\n');
  });
  check(34, 'MCP as the plugin starts it: harvest_crawl, harvest_sources, harvest_model and open_in_editor are listed', ['harvest_crawl', 'harvest_sources', 'harvest_model', 'open_in_editor'].every((x) => tools.includes(x)), tools.join(','));
  const cmds = fs.readdirSync(path.join(REPO, 'commands')).map((f) => f.replace(/\.md$/, ''));
  check(35, '"/" commands: open, close (all hosts), status, harvest, build, export, update', ['open', 'close', 'status', 'harvest', 'build', 'export', 'update'].every((c) => cmds.includes(c)), cmds.join(','));
  const suites = fs.readdirSync(path.join(REPO, 'tests')).filter((f) => f.endsWith('.test.mjs'));
  const listed = suites.filter((f) => pkg.scripts.test.includes(`tests/${f}`));
  const viaSuite = (f) => listed.some((g) => fs.readFileSync(path.join(REPO, 'tests', g), 'utf8').includes(f)); // srs.test.mjs runs srs-heal and srs-wp8
  const missing = suites.filter((f) => !listed.includes(f) && !viaSuite(f));
  check(36, 'tests on each step: every tests/*.test.mjs (this suite included) runs in `npm test`, directly or from a suite it runs', !missing.length && pkg.scripts.test.includes('mcp/test/server.test.mjs'), missing.join(', '));
  check(37, 'version 0.13.0 everywhere the release reads it (package, plugin, marketplace, MCP server.json)', [pkg.version, readJ(path.join(REPO, '.claude-plugin', 'plugin.json')).version, readJ(path.join(REPO, '.claude-plugin', 'marketplace.json')).plugins[0].version, readJ(path.join(REPO, 'mcp', 'server.json')).version].every((v) => v === '0.13.0'));
  const ws = W.workspace();
  check(39, 'outputs go under a generated «Business-Wrap» folder with PDF, DOCX, HTML, HISTORY', path.basename(ws.root) === 'Business-Wrap' && ['PDF', 'DOCX', 'HTML', 'HISTORY'].every((d) => Object.values(ws.dirs).map((x) => path.basename(x)).includes(d)), JSON.stringify(ws.dirs));
  check(41, 'extras are written down (CHANGELOG «Extras»)', /extras/i.test(fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8')));

  // ── the editor, served by the background host, as the owner opens it ─────────
  h = await H.start({ editor, port: await freePort(), open: false });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('bw:owner-init')) { sessionStorage.setItem('bw:owner-init', '1'); localStorage.setItem('bw:profile-prompt', '1'); } } catch { /* storage */ } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(h.url);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library, null, { timeout: 20000 });
  const R = (fn, arg) => page.evaluate(([f, a]) => (0, eval)(`(${f})`)(document.getElementById('bw-ui-host').shadowRoot, a), [String(fn), arg]);
  const act = (a) => page.evaluate((a) => window.BW.runAction(a), a);
  const fire = (a) => page.evaluate((a) => { Promise.resolve(window.BW.runAction(a)).catch(() => {}); }, a); // an action that waits on a dialog
  const doc = () => page.evaluate(() => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc)));
  const opsN = () => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const counter = () => R((r) => Number(r.querySelector('.count .n')?.textContent));
  const clickDoc = async (sel) => { const el = page.locator(`#bw-pair main.bw-doc[data-locale="ar"] ${sel}`).first(); await el.scrollIntoViewIfNeeded(); await el.click(); };

  // L16 first launch: the profile card; the owner types his name
  const card = await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal.pf-first, .pf-first'), null, { timeout: 8000 }).then(() => true, () => false);
  if (card) {
    await page.locator('#bw-ui-host >> css=.pf-first [data-pf="name"]').fill('Mark');
    await page.locator('#bw-ui-host >> css=.pf-first [data-mk="ok"]').click();
  }
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('bw:profile') || 'null'));
  check(16, 'first launch: a profile card (name, picture) stores the owner\'s name', card && prof?.name === 'Mark', JSON.stringify(prof));

  // L9 the toolbar is never rebuilt by a click
  const n9 = await R((r) => { const b = [...r.querySelectorAll('.island [data-a]')]; b.forEach((x) => { x.__ownerTag = 1; }); return b.length; });
  for (const a of ['uiLang', 'uiLang', 'dir', 'dir', 'view', 'view']) { await act(a); await wait(80); }
  const kept = await R((r) => [...r.querySelectorAll('.island [data-a]')].filter((x) => x.__ownerTag).length);
  check(9, 'toolbar motion: after language, direction and view clicks every toolbar button is the same element', n9 > 20 && kept === n9, `${kept}/${n9}`);

  // L6 toasts: short-lived, gone on a click
  await page.evaluate(() => window.BW.toast('owner toast', 'info'));
  await page.locator('#bw-ui-host >> css=.toasts .toast .m', { hasText: 'owner toast' }).click();
  await wait(350);
  const toastGone = await R((r) => { const t = [...r.querySelectorAll('.toast')].find((x) => x.textContent.includes('owner toast')); return !t || t.classList.contains('out'); });
  await page.mouse.move(1000, 450);
  await page.evaluate(() => window.BW.toast('owner short', 'ok'));
  await wait(3200);
  const shortGone = await R((r) => { const t = [...r.querySelectorAll('.toast')].find((x) => x.textContent.includes('owner short')); return !t || t.classList.contains('out'); });
  check(6, 'messages at the bottom: gone on a click, and gone by themselves within ~3 s', toastGone && shortGone, JSON.stringify({ toastGone, shortGone }));

  // L8 hover explainer: waits, then does not come back on the same tool
  const xpl = () => R((r) => { const c = r.querySelector('.xpl'); return !!c && !c.hidden; });
  await page.mouse.move(700, 600);
  const saveBtn = page.locator('#bw-ui-host >> css=.island [data-a="save"]');
  await saveBtn.hover(); await wait(400);
  const early = await xpl();
  await wait(900);
  const shown = await xpl();
  await page.mouse.move(700, 600); await wait(200); await saveBtn.hover(); await wait(1500);
  const again = await xpl();
  await page.mouse.move(700, 600);
  check(8, 'hover explainer: none at 400 ms, shown by 1.3 s, not again on the same tool', !early && shown && !again, JSON.stringify({ early, shown, again }));

  // L10 header and footer: two sections with their actions
  check(10, '«الترويسة» and «التذييل» sections carry text, field, align, delete and scope', await R((r) => ['hdrText', 'hdrField', 'hdrDelete', 'hdrScope'].every((a) => r.querySelector(`.sec[data-cat="header"] [data-a="${a}"]`)) && ['ftrText', 'ftrField', 'ftrDelete', 'ftrScope'].every((a) => r.querySelector(`.sec[data-cat="footer"] [data-a="${a}"]`))));

  // L11 side panels collapsed by default, rows shaded; L12 outside click closes
  const panels = {};
  for (const k of ['settings', 'theme']) {
    await act(k); await wait(250);
    panels[k] = await R((r) => { const d = r.querySelector('.drawer'); const det = [...d.querySelectorAll('details')]; return { n: det.length, open: det.filter((x) => x.open).length }; });
    await page.mouse.click(1000, 450); await wait(400);
    panels[k].closed = await R((r) => r.querySelector('.drawer').hidden || r.querySelector('.drawer').classList.contains('closing'));
  }
  check(12, 'a click outside Settings and Design closes the side panel', panels.settings.closed && panels.theme.closed, JSON.stringify(panels));
  check(11, 'side panels open with every section collapsed (Settings, Design)', panels.settings.n > 1 && panels.theme.n > 1 && !panels.settings.open && !panels.theme.open, JSON.stringify(panels), true);

  // L7 the documents list: Save puts the document in the list under its own title; New; open here
  await clickDoc('[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
  await page.evaluate(() => window.BW.setText('/control/title', 'خدمة المالك الأولى'));
  await act('save');
  await page.waitForFunction(async () => (await window.BW.EXT.library.all()).length >= 1, null, { timeout: 10000 }).catch(() => {});
  const first = await page.evaluate(async () => (await window.BW.EXT.library.all()).map((e) => ({ id: e.id, title: e.title })));
  await page.evaluate(() => window.BW.EXT.library.newDocument());
  await page.evaluate(() => window.BW.setText('/control/title', 'خدمة المالك الثانية'));
  await act('save');
  await page.waitForFunction(async () => (await window.BW.EXT.library.all()).length >= 2, null, { timeout: 10000 }).catch(() => {});
  const list = await page.evaluate(async () => (await window.BW.EXT.library.all()).filter((e) => !e.deletedAt).map((e) => ({ id: e.id, title: e.title })));
  check(7, 'Save adds the document to the list under its title; New + Save adds a second one', list.length === 2 && list.some((e) => e.title === 'خدمة المالك الأولى') && list.some((e) => e.title === 'خدمة المالك الثانية'), JSON.stringify(list));
  const id1 = first[0]?.id;
  await page.evaluate(() => window.BW.openDrawer('library')); await wait(300);
  const row = page.locator(`#bw-ui-host >> css=.drawer [data-id="${id1}"] [data-lib="open"], .drawer [data-lib="open"][data-id="${id1}"]`).first();
  if (await row.count()) await row.click(); else await page.evaluate((id) => window.BW.EXT.library.open(id), id1);
  await page.waitForFunction((id) => window.BW.S.svc === id, id1, { timeout: 5000 }).catch(() => {});
  const opened = await page.evaluate(() => ({ svc: window.BW.S.svc, hash: location.hash, drawer: !document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').hidden }));
  check(7, '«افتح هنا» opens the earlier document and puts #doc=<id> in the address (a reload keeps it)', opened.svc === id1 && opened.hash.includes(`doc=${id1}`), JSON.stringify(opened), true);

  // L7/L16/L20 open from the list → edit → Save HTML: the saved file carries the provenance log
  await page.evaluate(() => window.BW.setText('/chapters/0/title', 'مقدمة عدّلها المالك'));
  await wait(300);
  const c0 = await counter();
  await act('saveHtml');
  const htmlDir = path.join(process.env.BW_WORKSPACE, 'Business-Wrap', 'HTML');
  const t0 = Date.now();
  let saved = [];
  while (Date.now() - t0 < 10000 && !saved.length) { saved = fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html')) : []; if (!saved.length) await wait(200); }
  const savedText = saved[0] ? fs.readFileSync(path.join(htmlDir, saved[0]), 'utf8') : '';
  const today = W.outName('x', new Date(), 'ar', 'html').slice(2, 12);
  check(15, 'Save HTML lands in Business-Wrap\\HTML as «<title>-<date>-AR.html»', saved[0] === W.outName('خدمة المالك الأولى', new Date(), 'ar', 'html'), saved.join(','));
  const data = (() => { const m = /<script type="application\/json" id="bw-data">([^]*?)<\/script>/.exec(savedText); try { return m && JSON.parse(m[1]); } catch { return null; } })();
  check(20, 'a document opened from the list, edited and saved as HTML carries its provenance log (prov)', !!data?.prov?.[id1]?.log, data ? Object.keys(data.prov || {}).join(',') || 'no prov' : 'no file', true);
  check(13, 'the change counter restarts at Save HTML', c0 >= 1 && (await counter()) === 0, `${c0} → ${await counter()}`);

  // L16 the provenance tab of a library document shows its log
  await page.evaluate(() => window.BW.openDrawer('provenance')); await wait(800);
  const pv = await R((r) => { const d = r.querySelector('.drawer'); return { tab: !!d.querySelector('[data-pv="tab-prov"], .pv-tabs'), text: d.textContent.trim().slice(0, 400) }; });
  check(16, 'the «المصدر» tab lists the edits of a document opened from the list (not «…»)', pv.tab && /Mark/.test(pv.text), pv.text.slice(0, 200), true);
  await page.mouse.click(1000, 450); await wait(300);

  // review2 #17: strip the log AND the bwlog mark by hand (the review's T4) → still «stripped», on a machine with no HISTORY
  {
    const { prov: _p, bwlog: _b, ...bare } = data || {};
    const f = path.join(tmp, 't4.editor.html');
    fs.writeFileSync(f, savedText.replace(/(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(bare).replace(/</g, '\\u003c') + b));
    const v = spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'verify-history', f, '--history', path.join(tmp, 'no-history'), '--json'], { encoding: 'utf8' });
    check(20, 'review2 #17: log + bwlog mark removed by hand → verify-history says «stripped», never «made before 0.13»', v.status === 1 && /stripped/.test(v.stdout) && !/made before 0\.13/.test(v.stdout), v.stdout.slice(0, 300));
  }

  // review2 #11: an export is written to the log; the performance report counts it and reads the title as the document says it now
  await page.evaluate(() => window.BW.setText('/control/coverTitle', 'خدمة مراجعة الإصدار'));
  await page.evaluate(() => window.BW.runAction('export.docx.ar'));
  await page.evaluate(() => window.BW.EXT.ledger.ready());
  const exLog = await page.evaluate(() => window.BW.EXT.ledger.log().entries.filter((e) => e.kind === 'export').map((e) => e.data));
  const { readHistory, reportData } = await import('../engine/report.mjs');
  const rep = reportData(await readHistory(path.join(process.env.BW_WORKSPACE, 'Business-Wrap', 'HISTORY')), {});
  const repDoc = rep.docs.find((x) => x.doc === id1);
  check(16, 'review2 #11: a DOCX export is logged (fmt, edition, live title) and the report counts exports (DOCX + the HTML save) under the live cover title', exLog.some((x) => x.fmt === 'docx' && x.locale === 'ar' && x.docTitle === 'خدمة مراجعة الإصدار') && rep.people.reduce((s, p) => s + p.exports, 0) >= 2 && repDoc?.title === 'خدمة مراجعة الإصدار', JSON.stringify({ exLog, exports: rep.people.map((p) => p.exports), docs: rep.docs.map((x) => x.title) }));

  // review2 #12: the profile key is the person: a rename in Settings is logged, later edits stay on the same row, named both ways
  await page.evaluate(() => window.BW.openDrawer('settings')); await wait(300);
  await R((r) => { const d = r.querySelector('.drawer .set-x-profile [data-pf="name"]')?.closest('details'); if (d) d.open = true; });
  const nameIn = page.locator('#bw-ui-host >> css=.set-x-profile [data-pf="name"]');
  await nameIn.fill('Sami'); await nameIn.dispatchEvent('change');
  await page.evaluate(() => window.BW.setText('/chapters/0/title', 'مقدمة بعد تغيير الاسم'));
  await page.evaluate(() => window.BW.EXT.ledger.ready());
  const rn = await page.evaluate(() => { const E = window.BW.EXT.ledger.log().entries; const r = E.find((e) => e.kind === 'x-rename'); const last = E.filter((e) => e.kind === 'op').at(-1); return { r: r && { ...r.data, id: r.actor.id }, last: last && { id: last.actor.id, name: last.actor.name } }; });
  await page.mouse.click(1000, 450); await wait(300);
  await page.evaluate(() => window.BW.openDrawer('provenance')); await wait(800);
  const pv12 = await R((r) => { const d = r.querySelector('.drawer'); const op = d.querySelector('.pv-e[data-kind="op"]'); return { rows: d.querySelectorAll('.pv-people tbody tr').length, aka: d.querySelector('.pv-aka')?.textContent || '', sum: op?.querySelector(':scope > details > summary')?.textContent || '', raw: op?.querySelector('.pv-raw')?.textContent || '', diff: op?.querySelector('.diff')?.textContent || '' }; });
  check(16, 'review2 #12: a rename is a logged event (Mark → Sami, same profile key); the next edit is that key under its new name', rn.r?.from === 'Mark' && rn.r?.to === 'Sami' && rn.last?.id === rn.r?.id && rn.last?.name === 'Sami', JSON.stringify(rn));
  check(16, 'review2 #12: one contributor row for the key, «also: Mark»; an edit reads as a sentence + before/after text, the JSON pointer only in the detail', pv12.rows === 1 && /Mark/.test(pv12.aka) && !/\/chapters\//.test(pv12.sum) && /\/chapters\//.test(pv12.raw) && /مقدمة بعد تغيير الاسم/.test(pv12.diff), JSON.stringify(pv12));
  await page.mouse.click(1000, 450); await wait(300);

  // L13 timeline back and forward
  await page.evaluate(() => { window.BW.setText('/chapters/1/title', 'بطاقة 1'); window.BW.setText('/chapters/2/title', 'قصص 1'); });
  const before = await opsN();
  await page.evaluate(() => window.BW.openDrawer('timeline')); await wait(300);
  const back = page.locator('#bw-ui-host >> css=.drawer [data-tl="back"]');
  const hasBack = await back.count();
  if (hasBack) await back.click(); else await page.evaluate(() => window.BW.undo());
  const mid = await opsN();
  const fwd = page.locator('#bw-ui-host >> css=.drawer [data-tl="fwd"], .drawer [data-tl="forward"]').first();
  if (await fwd.count()) await fwd.click(); else await page.evaluate(() => window.BW.redo());
  const after = await opsN();
  check(13, '«تغييرات»: back one step and forward again on the timeline', mid === before - 1 && after === before, JSON.stringify({ hasBack, before, mid, after }));
  await page.mouse.click(1000, 450); await wait(300);

  // L17 the check panel: «اذهب إليه» rings the element in the body, not the table of contents
  await act('check'); await wait(300);
  const logoJump = await R((r) => [...r.querySelectorAll('.drawer li')].filter((li) => /الشعار|logo/i.test(li.textContent)).map((li) => !!li.querySelector('.jump')));
  check(17, 'check panel: the logo-slot finding has «اذهب إليه» too', logoJump.length > 0 && logoJump.every(Boolean), JSON.stringify(logoJump), true);
  await page.mouse.click(1000, 450); await wait(300);
  const num0 = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters[1].sections[1].number);
  await page.evaluate(() => window.BW.setText('/chapters/1/sections/1/number', '9.9')); // a numbering finding, pointing at section 2.2
  await act('check'); await wait(300);
  const jump = page.locator('#bw-ui-host >> css=.drawer .jump').first();
  const hasJump = await jump.count();
  if (hasJump) await jump.click();
  await wait(150);
  const ring = await page.evaluate(() => { const el = document.querySelector('.bw-jump'); return el ? { inToc: !!el.closest('table.toc, [data-part="toc"]'), tag: el.tagName, p: el.dataset.p || el.dataset.b } : null; });
  check(17, 'check panel: a numbering finding has «اذهب إليه»', hasJump > 0);
  check(17, 'check panel: the jump rings the section in the document body (not its TOC row)', !!ring && !ring.inToc, JSON.stringify(ring), true);
  await page.mouse.click(1000, 450); await wait(300);
  await page.evaluate((n) => window.BW.setText('/chapters/1/sections/1/number', n), num0);

  // L21 page size and orientation; L22 a page break before a section
  await page.evaluate(() => window.BW.EXT.w2layout.page('A3', 'landscape', 'section', '/chapters/1/sections/0/blocks/0'));
  const d21 = await doc();
  check(21, 'one section on A3 landscape (the rest unchanged)', d21.chapters[1].sections[0].blocks[0].layout?.page?.orientation === 'landscape' && d21.chapters[1].sections[0].blocks[0].layout?.page?.size === 'A3' && !d21.layout?.page);
  await clickDoc('[data-b^="/chapters/1/sections/1/blocks/0"]');
  await act('pgBreak');
  check(22, '«صفحة جديدة قبل هذا القسم» on section 2.2', (await doc()).chapters[1].sections[1].layout?.breakBefore === true);

  // L26 text anywhere; L27 a new table in a section and a duplicated user story
  const ov0 = (await doc()).overlays?.length || 0;
  await clickDoc('[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
  await act('insTextBox'); await wait(200);
  check(26, '«مربع نص» puts a text box on the page', ((await doc()).overlays?.length || 0) === ov0 + 1 && (await doc()).overlays.at(-1).kind === 'text', JSON.stringify((await doc()).overlays?.at(-1)));
  {
    // review2 · extra 10: the text box has a move grip, its resize handle sits bottom-right, a double-click edits it,
    // and a drag far past the margin lands inside the text column
    const tbI = (await doc()).overlays.length - 1;
    const tb = page.locator(`#bw-pair main.bw-doc[data-locale="ar"] .bw-ov[data-i="${tbI}"]`).first();
    await tb.scrollIntoViewIfNeeded();
    const geo = await tb.evaluate((el) => { const r = el.getBoundingClientRect(); const h = el.querySelector('.bw-ov-handle')?.getBoundingClientRect(); const g = el.querySelector('.bw-ov-move')?.getBoundingClientRect(); return { r: [r.left, r.right], h: h && [h.left, h.right], g: g && [g.left + g.width / 2, g.top + g.height / 2] }; });
    check(26, 'text box: a move grip on top, the resize handle on its right edge', !!geo.g && !!geo.h && Math.abs(geo.h[1] - geo.r[1]) <= 10, JSON.stringify(geo));
    if (geo.g) { await page.mouse.move(geo.g[0], geo.g[1]); await page.mouse.down(); await page.mouse.move(geo.g[0] - 900, geo.g[1], { steps: 6 }); await page.mouse.move(geo.g[0] + 1400, geo.g[1], { steps: 8 }); await page.mouse.up(); await wait(200); }
    const ov = (await doc()).overlays[tbI];
    const colW = await page.evaluate(() => { const m = document.querySelector('#bw-pair main.bw-doc[data-locale="ar"]'); const w = m.querySelector('.wrap'); const cs = getComputedStyle(w); const mm = (m.querySelector('.cover') || m).getBoundingClientRect().width / 210; return (w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) / mm; });
    check(26, 'text box: dragged past the page edge it stays inside the text column', ov.mode !== 'anchor' || (ov.x >= 0 && ov.x + ov.w <= colW + 1), JSON.stringify({ x: ov.x, w: ov.w, mode: ov.mode, colW: Math.round(colW) }));
    await page.locator(`#bw-pair main.bw-doc[data-locale="ar"] .bw-ov[data-i="${tbI}"] .bw-tb-body`).first().dblclick();
    await wait(150);
    const editing = await page.evaluate(() => { const a = document.activeElement; return !!a?.matches?.('.bw-tb-body') && a.isContentEditable; });
    check(26, 'text box: a double-click puts the caret in its words', editing);
    await page.keyboard.press('Escape');
  }
  await page.keyboard.press('Escape');
  const blocks = async () => (await doc()).chapters[0].sections[1]?.blocks.length ?? (await doc()).chapters[0].sections[0].blocks.length;
  await clickDoc('[data-b^="/chapters/0/sections/1/blocks/0"]');
  const b0 = await blocks();
  await fire('insTable');
  await wait(300);
  await R((r) => { const d = r.querySelector('.dialog:not([hidden]), .bw-modal'); d?.querySelector('[data-k="ok"], [data-mk="ok"]')?.click(); });
  await wait(200);
  check(27, 'a new table inserted into a section', (await blocks()) === b0 + 1, `${b0} → ${await blocks()}`);
  const storyPtr = await page.evaluate(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; for (const [i, c] of d.chapters.entries()) for (const [j, s] of c.sections.entries()) for (const [k, b] of s.blocks.entries()) if (b.kind === 'story' || b.kind === 'userStory' || b.kind === 'stories') return `/chapters/${i}/sections/${j}/blocks/${k}`; return null; });
  if (storyPtr) {
    const sp = storyPtr.replace(/\/blocks\/\d+$/, '/blocks');
    const n0 = await page.evaluate((sp) => sp.split('/').filter(Boolean).reduce((o, k) => o[k], window.BW.M[window.BW.S.svc][window.BW.S.ed].doc).length, sp);
    await clickDoc(`[data-b="${storyPtr}"]`);
    await act('duplicate');
    const n1 = await page.evaluate((sp) => sp.split('/').filter(Boolean).reduce((o, k) => o[k], window.BW.M[window.BW.S.svc][window.BW.S.ed].doc).length, sp);
    check(27, '«تكرار» on a user-story card duplicates it', n1 === n0 + 1, `${n0} → ${n1}`);
  } else check(27, '«تكرار» on a user-story card duplicates it', false, 'no user-story block in the sample');

  // L29 TOC rows and the document-control table
  await clickDoc('[data-part="toc"] td[data-p]');
  check(29, 'a TOC cell is editable and brings the TOC and table tools', await R((r) => ['tocHide', 'tocAdd', 'fmRowAdd', 'fmColAdd'].every((a) => r.querySelector(`.island [data-a="${a}"]`))));
  await clickDoc('[data-part="control"] td[data-r="0"]');
  const ctl0 = await opsN();
  await act('fmRowAdd'); await act('fmColAdd');
  check(29, 'document control: add a row and a column', (await opsN()) >= ctl0 + 2, `${ctl0} → ${await opsN()}`);

  // L30 a field's format actions
  await clickDoc('[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
  check(30, 'a selected field shows colour, spacing, alignment, vertical position, font, size, quote, link, code, bold, italic, bullets, shapes, numbers, levels', await R((r) => ['fmtColor', 'fmtLine', 'fmtAlignStart', 'fmtAlignCenter', 'fmtAlignEnd', 'fmtTop', 'fmtMiddle', 'fmtBottom', 'fmtFont', 'fmtSize', 'fmtQuote', 'fmtLink', 'fmtCode', 'fmtBold', 'fmtItalic', 'fmtBullets', 'fmtShapes', 'fmtNumbers', 'fmtIndent', 'fmtOutdent'].every((a) => r.querySelector(`[data-a="${a}"]`))));

  {
    // review2 · extra 9: a small dialog keeps what was typed on an outside click and when another tool asks;
    // colour, font and size are a swatch, a list and a stepper
    const dlg = () => R((r) => { const d = r.querySelector('.dialog'); const f = d.querySelector('textarea, input, select'); return { open: !d.hidden, val: f?.value, type: f ? (f.tagName === 'INPUT' ? f.type : f.tagName.toLowerCase()) : null }; });
    await fire('hdrText'); await wait(200);
    await page.keyboard.type('KEEPME');
    await page.mouse.click(700, 600); await wait(200);
    const afterOut = await dlg();
    await fire('ftrText'); await wait(200);
    const afterOther = await dlg();
    await R((r) => r.querySelector('.dialog [data-k="no"]').click()); await wait(100);
    check(30, 'a typed dialog survives an outside click and another tool asking (Save/Close end it)', afterOut.open && afterOut.val === 'KEEPME' && afterOther.open && afterOther.val === 'KEEPME', JSON.stringify({ afterOut, afterOther }));
    const kinds = {};
    for (const [a, want] of [['fmtColor', 'color'], ['fmtFont', 'select'], ['fmtSize', 'number']]) {
      await clickDoc('[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
      await fire(a); await wait(200);
      kinds[a] = (await dlg()).type;
      await R((r) => r.querySelector('.dialog [data-k="no"]')?.click()); await wait(100);
      kinds[a + 'Ok'] = kinds[a] === want;
    }
    check(30, 'colour / font / size dialogs: native swatch, list and stepper', kinds.fmtColorOk && kinds.fmtFontOk && kinds.fmtSizeOk, JSON.stringify(kinds));
  }

  // L28 a header item on "this page only"
  await clickDoc('[data-b^="/chapters/2/sections/0/blocks/0"]');
  await fire('hdrText');
  await wait(200);
  await R((r) => { r.querySelector('.dialog textarea').value = 'OWNERHEAD'; r.querySelector('.dialog [data-k="ok"]').click(); });
  await wait(200);
  const hi = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chrome?.header?.items.findIndex((x) => x.value === 'OWNERHEAD'));
  check(10, 'header: «نص في الترويسة» adds the owner\'s text', hi >= 0, String(hi));
  await clickDoc('[data-b^="/chapters/2/sections/0/blocks/0"]');
  const item = page.locator('#bw-pair .w2-strip [data-w2p^="/chrome/header/items/"]', { hasText: 'OWNERHEAD' }).first();
  if (await item.count()) { await item.scrollIntoViewIfNeeded(); await item.click(); }
  await act('hdrScope');
  await wait(200);
  const sc = await page.evaluate((i) => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chrome?.header?.items[i], hi);
  check(28, 'header item «في هذه الصفحة فقط»: scope only, anchored to the page the owner picked', sc?.scope === 'only' && !!sc.anchor, JSON.stringify(sc), true);

  // L19 lock and unlock (warning, no password)
  await fire('lkToggle'); await wait(300);
  await R((r) => r.querySelector('.bw-modal [data-mk="ok"]')?.click()); await wait(200);
  const lk0 = await opsN();
  let refused = false;
  try { await page.evaluate(() => window.BW.setText('/chapters/0/title', 'locked edit')); } catch { refused = true; }
  const lockedOps = await opsN();
  await fire('lkToggle'); await wait(300);
  const warn = await R((r) => { const m = r.querySelector('.bw-modal'); return m ? { text: m.textContent.slice(0, 200), pw: !!m.querySelector('input[type="password"]') } : null; });
  await R((r) => r.querySelector('.bw-modal [data-mk="ok"]')?.click()); await wait(200);
  let unlocked = true;
  try { await page.evaluate(() => window.BW.setText('/chapters/0/title', 'after unlock')); } catch { unlocked = false; }
  check(19, 'lock refuses edits; unlock asks with a warning and no password; edits work again', (refused || lockedOps === lk0) && !!warn && !warn.pw && unlocked, JSON.stringify({ refused, lk0, lockedOps, warn, unlocked }));

  // L32 palette import with a guideline
  await act('theme'); await wait(300);
  check(32, 'Design: «استيراد لوحة ألوان» with the «ماذا أعطي؟» guideline', await R((r) => { const d = r.querySelector('.drawer'); return !!d.querySelector('[data-k="palImport"], [data-pal="import"], [data-a="palImport"]') || /استيراد لوحة|Import (a )?palette/i.test(d.textContent); }) && await R((r) => /ماذا أعطي|What to give/i.test(r.querySelector('.drawer').textContent)));
  await page.mouse.click(1000, 450); await wait(300);

  // L25 logo motion; L38 design: no horizontal overflow at 1366 and 1920
  const logo = await R((r) => { const b = r.querySelector('.brand'); return b ? b.getAnimations({ subtree: true }).length : -1; });
  check(25, 'the app logo moves (≥ 4 idle animations)', logo >= 4, String(logo));
  const over = [];
  for (const w of [1366, 1920]) { await page.setViewportSize({ width: w, height: 900 }); await wait(300); over.push(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)); }
  await page.setViewportSize({ width: 1366, height: 900 });
  check(38, 'design: no horizontal overflow at 1366 and 1920 px', over.every((x) => x <= 1), JSON.stringify(over));

  // review2 · 1: toasts with buttons are short-lived too, a click dismisses them, focus from code does not pin them,
  // one queue (≤ 2 at once); a tamper warning is a banner that stays and is never doubled
  {
    await page.mouse.move(1000, 450);
    const T = await page.evaluate(async () => {
      const r = document.getElementById('bw-ui-host').shadowRoot;
      r.querySelectorAll('.toast').forEach((x) => x.remove());
      const sh = window.BW.toast('owner share done', 'ok', { persist: true, actions: [['open', () => {}], ['copy', () => {}]] });
      sh.querySelector('button').focus(); // what the share code did: it pinned the toast for 6+ minutes
      window.BW.toast('owner tamper', 'warn', { persist: true, actions: [['show', () => {}]] });
      window.BW.toast('owner tamper', 'warn', { persist: true, actions: [['show', () => {}]] });
      ['q1', 'q2', 'q3', 'q4'].forEach((m) => window.BW.toast(m, 'info'));
      const stack = [...r.querySelectorAll('.toast:not(.banner):not(.out)')].length;
      const ban = () => [...r.querySelectorAll('.toast.banner')].filter((x) => x.textContent.includes('owner tamper'));
      const tamper0 = ban().length;
      await new Promise((res) => setTimeout(res, 6600));
      return { stack, tamper0, shareGone: !sh.isConnected || sh.classList.contains('out'), tamper: ban().length };
    });
    const a1 = await page.evaluate(() => !!window.BW.toast('owner undo-like', 'info', { actions: [['undo', () => {}]] }));
    await page.locator('#bw-ui-host >> css=.toast .m', { hasText: 'owner undo-like' }).click();
    await wait(350);
    const clickGone = await R((r) => { const t = [...r.querySelectorAll('.toast')].find((x) => x.textContent.includes('owner undo-like')); return !t || t.classList.contains('out'); });
    await R((r) => r.querySelectorAll('.toast.banner [data-k]').forEach((b) => b.click()));
    check(6, 'toasts with buttons: gone within 6 s even when code focused them, a click dismisses, at most two at once', T.shareGone && a1 && clickGone && T.stack <= 2, JSON.stringify({ ...T, clickGone }));
    check(6, 'a tamper warning is one banner that stays until answered', T.tamper0 === 1 && T.tamper === 1, JSON.stringify(T));
  }
  // review2 · 34: RTL/LTR per edition; the direction field (and View, Settings, header, footer) stays in the bar at 1024–1920
  {
    const mainDir = (l) => page.evaluate((l) => document.querySelector(`#bw-pair main.bw-doc[data-locale="${l}"]`)?.dir, l);
    const dirBtn = (d) => R((r, d) => r.querySelector(`.island [data-a="dir"][data-d="${d}"]`).click(), d);
    if ((await page.evaluate(() => window.BW.S.ed)) !== 'en') await act('uiLang');
    const onEn = await page.evaluate(() => window.BW.S.ed);
    await dirBtn('ltr'); await wait(150);
    await act('uiLang'); await wait(150);
    const arDir = { ed: await page.evaluate(() => window.BW.S.ed), dir: await mainDir('ar'), pressed: await R((r) => r.querySelector('.island [data-a="dir"][aria-pressed="true"]')?.dataset.d) };
    await dirBtn('ltr'); await wait(150);
    await act('uiLang'); await wait(150);
    const enDir = await mainDir('en');
    await act('uiLang'); await wait(150);
    await dirBtn('rtl'); await wait(150);
    const arBack = await mainDir('ar');
    check(34, 'direction per edition: LTR in English leaves Arabic RTL; LTR in Arabic leaves English as chosen', onEn === 'en' && arDir.ed === 'ar' && arDir.dir === 'rtl' && arDir.pressed === 'rtl' && enDir === 'ltr' && arBack === 'rtl', JSON.stringify({ onEn, arDir, enDir, arBack }));
    const seen = [];
    const inBar = () => R((r) => {
      const ok = (sel) => { const e = r.querySelector(sel); if (!e || !e.checkVisibility()) return false; const q = e.getBoundingClientRect(); const at = r.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return q.left >= 0 && q.right <= innerWidth && !!at && (at === e || e.contains(at)); };
      return { rtl: ok('.island [data-a="dir"][data-d="rtl"]'), ltr: ok('.island [data-a="dir"][data-d="ltr"]'), view: ok('.island [data-a="view"]'), settings: ok('.island [data-a="settings"]'), hdr: !!r.querySelector('.island .sec[data-cat="header"]'), ftr: !!r.querySelector('.island .sec[data-cat="footer"]') };
    });
    for (const sel of ['none', 'text', 'table']) {
      if (sel === 'text') await clickDoc('[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
      if (sel === 'table') await clickDoc('table[data-rows] td[data-p]');
      for (const w of [1024, 1100, 1280, 1290, 1366, 1440, 1920]) {
        await page.setViewportSize({ width: w, height: 900 }); await wait(320);
        const v = await inBar();
        if (!Object.values(v).every(Boolean)) seen.push({ sel, w, ...v });
      }
    }
    await page.setViewportSize({ width: 1366, height: 900 }); await wait(300);
    check(34, 'RTL/LTR, View and Settings visible, header and footer kept, at 1024–1920 px with nothing, text or a table selected', !seen.length, JSON.stringify(seen));
    await page.mouse.click(1000, 450); await wait(200);
  }

  // L18 image through «إدراج صورة» offers the Word wrap options; L24 image + move down ×2: no exception
  const p24 = await ctx.newPage();
  p24.setDefaultTimeout(15000);
  const err24 = [];
  p24.on('pageerror', (e) => err24.push(e.message));
  await p24.goto(h.url);
  await p24.waitForFunction(() => window.BW?.ready, null, { timeout: 20000 });
  const para = p24.locator('#bw-pair main.bw-doc[data-locale="ar"] [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]').first();
  await para.scrollIntoViewIfNeeded(); await para.click();
  const [fc] = await Promise.all([p24.waitForEvent('filechooser'), p24.evaluate(() => { Promise.resolve(window.BW.runAction('image')).catch(() => {}); })]);
  await fc.setFiles(png);
  await p24.waitForFunction(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; return d.chapters[0].sections[0].blocks.some((b) => b.kind === 'shots') || (d.overlays || []).some((o) => o.kind === 'image'); }, null, { timeout: 5000 }).catch(() => {});
  await p24.waitForTimeout(200);
  const wrap = await p24.evaluate(() => ['wrapInline', 'wrapSquare', 'wrapTight', 'wrapThrough', 'wrapTopBottom', 'wrapBehind', 'wrapFront'].filter((a) => document.getElementById('bw-ui-host').shadowRoot.querySelector(`.island [data-a="${a}"]`)).length);
  check(18, '«إدراج صورة»: the inserted image offers in line + 6 wrap options', wrap === 7, `${wrap}/7`, true);
  await para.scrollIntoViewIfNeeded(); await para.click();
  for (let i = 0; i < 2; i++) { await p24.evaluate(() => window.BW.runAction('moveDown')).catch((e) => err24.push(e.message)); await p24.waitForTimeout(150); }
  await para.click().catch(() => {});
  check(24, 'insert an image, then «لأسفل» twice on the paragraph: no exception, the editor still works', !err24.length, err24.join(' | '), true);
  {
    // review2 · 14: every wrap mode reaches every other one, the way the owner picks the picture: a click on it,
    // Alt+click for one behind the text, a click on the in-line figure
    const WR = ['inline', 'square', 'tight', 'through', 'topBottom', 'behind', 'front'];
    const cap = (m) => 'wrap' + m[0].toUpperCase() + m.slice(1);
    const modeNow = () => p24.evaluate(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; const o = (d.overlays || []).filter((x) => x.kind === 'image').at(-1); if (o) return o.wrap || 'free'; for (const c of d.chapters) for (const s of c.sections) for (const b of s.blocks) if (b.kind === 'shots' && b.images?.length === 1 && /^data:image/.test(b.images[0])) return 'inline'; return null; });
    const pick = async () => {
      const m = await modeNow();
      const sel = m === 'inline' ? 'figure.shots[data-b]' : ':is(.bw-ov, .bw-ovf)[data-kind="image"]';
      const el = p24.locator(`#bw-pair main.bw-doc[data-locale="ar"] ${sel}`).last();
      await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      if (m === 'behind') { await p24.keyboard.down('Alt'); await p24.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await p24.keyboard.up('Alt'); }
      else await p24.mouse.click(b.x + b.width / 2, b.y + Math.min(b.height / 2, 20));
      await p24.waitForTimeout(120);
      return p24.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.island .sec[data-cat="wrap"] [data-a^="wrap"]').length);
    };
    const bad = [];
    for (const from of WR) {
      for (const to of WR) {
        if (from === to) continue;
        if ((await modeNow()) !== from) { await pick(); await p24.evaluate((a) => window.BW.runAction(a), cap(from)); await p24.waitForTimeout(80); }
        if ((await modeNow()) !== from) { bad.push(`${from}: not reached (${await modeNow()})`); break; }
        const tools = await pick();
        await p24.evaluate((a) => window.BW.runAction(a), cap(to)).catch((e) => bad.push(e.message));
        await p24.waitForTimeout(80);
        const got = await modeNow();
        if (got !== to) bad.push(`${from}→${to}: ${got} (wrap tools ${tools})`);
      }
    }
    check(18, 'every wrap mode switches to every other one (back from «مع النص» and «خلف النص» included)', !bad.length && !err24.length, bad.slice(0, 8).join(' | ') + err24.join(' | '));
  }
  await p24.close({ runBeforeUnload: true });

  check(23, 'the owner\'s whole run (every flow above but the line-24 one): no page error', !errors.length, errors.join(' | '));

  // L15 share names the file like a save
  const htmlBefore = new Set(fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []);
  await fire('shShare');
  await wait(300);
  await page.locator('#bw-ui-host >> css=.bw-modal [data-sh="to"]').fill('Alaa').catch(() => {});
  await R((r) => r.querySelector('.bw-modal [data-mk="ok"]')?.click());
  await wait(1500);
  const shareName = (fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []).filter((n) => !htmlBefore.has(n));
  check(15, 'share writes «<title>-<date>-AR.html» like a save (not doc-<id>.editor.html)', shareName.length >= 1 && shareName.every((n) => n.includes(today) && /-AR(-\d+)?\.html$/.test(n)), shareName.join(',') || 'no shared file', true);

  // G3 (review 2 row 2, L7): the cover title the owner types drives the list, the document title, the share file and
  // every saved file name live; the EN file follows the same «<title>-<date>-ENG» rule (no «خدمة جديدة» / "New service")
  await page.evaluate(() => window.BW.EXT.library.newDocument());
  await wait(300);
  await clickDoc('[data-p="/control/coverTitle"]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('خدمة مراجعة الإصدار');
  await page.mouse.click(1000, 450); await wait(300);
  await act('save');
  await page.waitForFunction(() => /^doc-/.test(window.BW.S.svc), null, { timeout: 8000 }).catch(() => {});
  const t7 = await page.evaluate(async () => { const B = window.BW, id = B.S.svc, e = await B.EXT.library.get(id); return { list: e?.title, ar: B.M[id].ar.doc.control.title, en: B.M[id].en?.doc.control.title, enName: B.EXT.library.titleOf(id, 'en') }; });
  check(7, 'the cover title typed by the owner names the list entry and «عنوان الوثيقة», and the EN edition follows', t7.list === 'خدمة مراجعة الإصدار' && /: خدمة مراجعة الإصدار$/.test(t7.ar) && /خدمة مراجعة الإصدار$/.test(t7.en || '') && t7.enName === 'خدمة مراجعة الإصدار', JSON.stringify(t7));
  const exEn = await page.evaluate(async () => { const B = window.BW, id = B.S.svc; const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: id, locale: 'en', doc: B.M[id].en.doc, embedFonts: false }) }); return (await r.json()).pdf || ''; });
  check(15, 'the EN export is named «<title>-<date>-ENG.pdf» with the same title (not "New service")', path.basename(exEn) === W.outName('خدمة مراجعة الإصدار', new Date(), 'en', 'pdf'), path.basename(exEn));
  const hb2 = new Set(fs.readdirSync(htmlDir));
  await fire('shShare'); await wait(300);
  await page.locator('#bw-ui-host >> css=.bw-modal [data-sh="to"]').fill('Alaa').catch(() => {});
  await R((r) => r.querySelector('.bw-modal [data-mk="ok"]')?.click());
  await wait(1500);
  const share2 = fs.readdirSync(htmlDir).filter((n) => !hb2.has(n));
  check(7, 'the share file carries the edited title (not «خدمة جديدة»)', share2.length >= 1 && share2.every((n) => n.startsWith('خدمة مراجعة الإصدار-')), share2.join(',') || 'no shared file');
  // G3 (review 2 row 10, L15): HISTORY hidden and never served, whatever the case of the address
  const histAttr = process.platform === 'win32' ? spawnSync('attrib', [ws.dirs.history], { encoding: 'utf8' }).stdout.split(ws.dirs.history)[0] : ' H ';
  const histServed = (await Promise.all(['HISTORY', 'history'].map(async (d) => (await fetch(`${h.url}files/${d}/sessions`)).status))).every((c) => c === 404);
  check(15, 'HISTORY carries the hidden attribute and is never served (any case)', /(^|\s)H(\s|$)/.test(histAttr) && histServed, JSON.stringify({ histAttr, histServed }));

  // H1 (owner 2026-10-29): documents grouped by project, bulk edit on a project or hand-picked documents. In the owner's
  // page: the «تعديل جماعي» tool and the projects bar of «المستندات» with icons; the whole flows run in tests/projects.test.mjs
  // and tests/bulk.test.mjs (spawned below, so `npm test` runs them through this suite)
  const h1ui = await R((r) => ({ tool: !!r.querySelector('[data-a="bulkEdit"] .ic[data-ic="bulkEdit"]') }));
  await act('library');
  await wait(300);
  const h1bar = await R((r) => ({ bar: !!r.querySelector('.drawer .pj-bar [data-pj="new"] .ic[data-ic="pjNew"]'), filter: !!r.querySelector('.drawer .pj-bar [data-pj-filter]') }));
  check('H1', 'projects: «المستندات» carries the project bar (filter + «مشروع جديد» with its icon); the toolbar has «تعديل جماعي»', h1ui.tool && h1bar.bar && h1bar.filter, JSON.stringify({ h1ui, h1bar }));
  await act('bulkEdit');
  await wait(300);
  const h1bk = await R((r) => ({ preview: !!r.querySelector('.drawer [data-bk="preview"]'), apply: r.querySelector('.drawer [data-bk="apply"]')?.disabled, ops: r.querySelectorAll('.drawer [data-bk-f="op"] option').length }));
  check('H1', 'bulk edit: the panel opens with 7 operations, Preview, and Apply off until a preview', h1bk.preview && h1bk.apply === true && h1bk.ops === 7, JSON.stringify(h1bk));
  await page.keyboard.press('Escape');
  for (const suite of ['projects.test.mjs', 'bulk.test.mjs']) {
    const r = spawnSync(process.execPath, [path.join(REPO, 'tests', suite)], { encoding: 'utf8', timeout: 5 * 60e3 });
    const tail = (r.stdout || '').trim().split('\n').filter((l) => /^(FAIL|ALL PASS|FAILED)/.test(l)).join(' / ');
    check('H1', `owner flows of tests/${suite}: ${suite.startsWith('projects') ? 'make «Project A», put 3 documents in it, groups survive a reload and reach a fresh browser' : 'bulk add a field to a project of 3, delete a section from 2 hand-picked, preview counts, logs per document, locked one skipped, undo per document'}`, r.status === 0, tail || r.stderr?.slice(0, 300));
  }

  // L14 closing the last tab saves and stops the host; a relaunch offers resume or new work
  // G3 (review 2 row 9): text typed just before the close is saved whole; tabs closed earlier (line 24's) do not come
  // back; the resumed origin keeps the owner's profile
  const pid = h.pid;
  const lastTab = await page.evaluate(() => document.documentElement.dataset.bwSession);
  await clickDoc('[data-p="/chapters/0/title"]');
  await page.keyboard.press('End');
  await page.keyboard.type(' تعديل غير مكتمل للنهاية');
  for (const p of ctx.pages()) await p.close({ runBeforeUnload: true }); // at once, no wait after the last key
  await ctx.close();
  const t14 = Date.now();
  while (H.alive(pid) && Date.now() - t14 < 8000) await wait(100);
  const stopped = !H.alive(pid);
  h = await H.start({ editor, port: await freePort(), open: false });
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(h.url);
  await p2.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwResume, null, { timeout: 15000 }).catch(() => {});
  const resume = await p2.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-resume'); if (!d) return null; const b = d.querySelector('[data-s="resume"]'); const cs = b && getComputedStyle(b); return { resume: !!b, fresh: !!d.querySelector('[data-s="new"]'), font: getComputedStyle(d).fontFamily, bg: cs?.backgroundColor, border: cs?.borderStyle }; });
  check(14, 'closing the last tab stops the host; a relaunch offers «استأنف كل شيء» and «عمل جديد»', stopped && resume?.resume && resume?.fresh, JSON.stringify({ stopped, resume }));
  const lastRun = await (await fetch(`${h.url}api/session/last`)).json();
  const typedRec = (() => { try { return fs.readFileSync(path.join(ws.dirs.history, 'sessions', lastRun.runId, `${lastTab}.json`), 'utf8'); } catch { return ''; } })();
  check(14, 'text typed right before closing the tab is in the saved run, whole («تعديل غير مكتمل للنهاية»)', typedRec.includes('تعديل غير مكتمل للنهاية'), typedRec ? typedRec.slice(typedRec.indexOf('تعديل غير') - 40, typedRec.indexOf('تعديل غير') + 40) : `no record ${lastRun.runId}/${lastTab}`);
  check(14, 'only the tabs open at shutdown are offered (the line-24 tab closed earlier is not)', lastRun.tabs?.length === 1 && lastRun.tabs[0].tab === lastTab, JSON.stringify(lastRun.tabs));
  const prof2 = await p2.evaluate(() => localStorage.getItem('bw:profile') || '');
  check(16, 'the relaunched host (a new port: a new origin) still knows the owner: no «من أنت؟» again', /Mark/.test(prof2), prof2.slice(0, 120));
  check(38, 'the relaunch dialog uses the house font and styled buttons (not browser defaults)', !!resume && !/Times|(^|,\s*)serif$/.test(resume.font) && resume.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(resume), true);
  await p2.locator('#bw-ui-host >> css=dialog.bw-resume [data-s="new"]').click().catch(() => {});
  await p2.close({ runBeforeUnload: true });
  await ctx2.close();
  const t2 = Date.now();
  while (H.alive(h.pid) && Date.now() - t2 < 8000) await wait(100);
} catch (e) {
  check(0, 'run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  if (h && H.alive(h.pid)) await H.stop().catch(() => {});
}

console.log(out.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${out.length - failed - xfail - xpass} pass, ${failed} fail, ${xfail} expected-fail (lines ${[...xfLines].sort((a, b) => a - b).join(', ') || '-'}), ${xpass} xpass`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
