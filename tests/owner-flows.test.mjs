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
process.env.BW_REVEAL_STUB = path.join(tmp, 'reveal.log'); // «افتح موقع الملف» writes the Explorer command here (H3)
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
  // H3 (owner 2026-10-29: «the popup for the name and picture appears every time I launch»): kept on this machine the
  // moment it is set, in the host's .local and in HISTORY, before any edit (it used to travel only with a tab's push)
  await wait(800);
  const keptProf = (() => { try { return JSON.parse(fs.readFileSync(path.join(process.env.BW_LOCAL_DIR, 'profile.json'), 'utf8')).profile; } catch { return ''; } })();
  check(16, 'the profile is kept on this machine the moment it is set (host .local + HISTORY), before any edit', /Mark/.test(keptProf) && fs.existsSync(path.join(W.workspace().dirs.history, 'profile.json.gz')), keptProf.slice(0, 80));

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
  const htmlDir = path.join(process.env.BW_WORKSPACE, 'Business-Wrap', 'HTML');
  const htmlPre = new Set(fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []); // H3: the Saves above wrote each document's own file
  await act('saveHtml');
  const t0 = Date.now();
  let saved = [];
  while (Date.now() - t0 < 10000 && !saved.length) { saved = fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir).filter((f) => f.endsWith('.html') && !htmlPre.has(f)) : []; if (!saved.length) await wait(200); }
  const savedText = saved[0] ? fs.readFileSync(path.join(htmlDir, saved[0]), 'utf8') : '';
  const today = W.outName('x', new Date(), 'ar', 'html').slice(2, 12);
  // Save HTML (an export) is a copy beside the document's own file: «-2» when the Save already wrote «<title>-<date>-AR.html»
  check(15, 'Save HTML lands in Business-Wrap\\HTML as «<title>-<date>-AR.html» (a copy, beside the saved document\'s own file)', saved.length === 1 && /^خدمة المالك الأولى-\d{4}-\d\d-\d\d-AR(-\d+)?\.html$/.test(saved[0]), saved.join(','));
  const data = (() => { const m = /<script type="application\/json" id="bw-data">([^]*?)<\/script>/.exec(savedText); try { return m && JSON.parse(m[1]); } catch { return null; } })();
  check(20, 'a document opened from the list, edited and saved as HTML carries its provenance log (prov)', !!data?.prov?.[id1]?.log, data ? Object.keys(data.prov || {}).join(',') || 'no prov' : 'no file', true);
  check(13, 'the change counter restarts at Save HTML', c0 >= 1 && (await counter()) === 0, `${c0} → ${await counter()}`);

  // L16 the provenance tab of a library document shows its log
  await page.evaluate(() => window.BW.openDrawer('provenance')); await wait(800);
  const pv = await R((r) => { const d = r.querySelector('.drawer'); return { tab: !!d.querySelector('[data-pv="tab-prov"], .pv-tabs'), text: d.textContent.trim().slice(0, 400) }; });
  check(16, 'the «المصدر» tab lists the edits of a document opened from the list (not «…»)', pv.tab && /Mark/.test(pv.text), pv.text.slice(0, 200), true);
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
  await p24.close({ runBeforeUnload: true });

  check(23, 'the owner\'s whole run (every flow above but the line-24 one): no page error', !errors.length, errors.join(' | '));

  // L15 share names the file like a save
  const htmlBefore = new Set(fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []);
  await fire('shShare');
  await wait(300);
  await page.locator('#bw-ui-host >> css=.bw-modal [data-sh="to"]').fill('Alaa').catch(() => {});
  await R((r) => r.querySelector('.bw-modal [data-mk="ok"]')?.click());
  await wait(1500);
  await R((r) => r.querySelectorAll(".sh-done [data-mk=\"close\"]").forEach((b) => b.click())); // H3: the share result card
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
  await R((r) => r.querySelectorAll(".sh-done [data-mk=\"close\"]").forEach((b) => b.click())); // H3: the share result card
  const share2 = fs.readdirSync(htmlDir).filter((n) => !hb2.has(n));
  check(7, 'the share file carries the edited title (not «خدمة جديدة»)', share2.length >= 1 && share2.every((n) => n.startsWith('خدمة مراجعة الإصدار-')), share2.join(',') || 'no shared file');
  // H3 (owner 2026-10-29): Ctrl+S and the yellow Save save THE document: its own HTML file in HTML\ (one file,
  // overwritten, history appended), the list entry, the counter back to 0 (A9); no download, no extra copy
  {
    const dls = [];
    const onDl = (d) => dls.push(d.suggestedFilename());
    page.on('download', onDl);
    await page.evaluate(() => { document.documentElement.dataset.bwSavedFile = ''; }); // the earlier Saves' file
    await page.evaluate(() => window.BW.EXT.library.newDocument());
    await wait(300);
    await clickDoc('[data-p="/control/coverTitle"]');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('خدمة الحفظ في مكانها');
    await page.mouse.click(1000, 450); await wait(300);
    const hb = new Set(fs.readdirSync(htmlDir));
    const savedFile = async () => { await page.waitForFunction(() => !!document.documentElement.dataset.bwSavedFile, null, { timeout: 20000 }).catch(() => {}); return page.evaluate(() => { const f = document.documentElement.dataset.bwSavedFile || ''; document.documentElement.dataset.bwSavedFile = ''; return f; }); };
    await page.keyboard.press('Control+s');
    const f1 = await savedFile();
    const c1 = await counter();
    await clickDoc('[data-p="/chapters/0/title"]');
    await page.keyboard.press('End');
    await page.keyboard.type(' مرة ثانية');
    await page.mouse.click(1000, 450); await wait(300);
    await page.locator('#bw-ui-host >> css=.island [data-a="save"]').click();
    const f2 = await savedFile();
    await wait(800); // the autosave after the Save HTML mark
    const added = fs.readdirSync(htmlDir).filter((n) => !hb.has(n));
    const txt = f2 && fs.existsSync(f2) ? fs.readFileSync(f2, 'utf8') : '';
    const ent = await page.evaluate(async () => { const B = window.BW, e = await B.EXT.library.get(B.S.svc); return { id: e?.id, files: e?.htmlFiles, stamp: document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-stamp')?.dataset.html || '' }; });
    page.off('download', onDl);
    check(7, 'Ctrl+S and the yellow Save save the document itself: one «<title>-<date>-AR.html», overwritten in place, no download', !!f1 && f1 === f2 && added.length === 1 && path.basename(f1) === W.outName('خدمة الحفظ في مكانها', new Date(), 'ar', 'html') && txt.includes('مرة ثانية') && txt.includes('id="bw-data"') && !dls.length && ent.files?.ar === f1, JSON.stringify({ f1, f2, added, dls, ent }));
    const cNow = await counter();
    check(13, 'Save in place is the Save-HTML point: the change counter goes back to 0 and the HTML time is stamped', c1 === 0 && cNow === 0 && !!ent.stamp, JSON.stringify({ c1, cNow, stamp: ent.stamp }));
  }
  // H3: share from the File category: a clear popup (recipient, note, what travels), the file, a result card whose
  // «افتح موقع الملف» opens Explorer on THAT file (it opened Documents), «انسخ المسار», close
  let sharedFile = '';
  {
    await page.evaluate(() => { document.documentElement.dataset.bwShared = ''; });
    await fire('shShare'); await wait(400);
    const pop = await R((r) => { const m = r.querySelector('.bw-modal.sh-modal'); return m && { to: !!m.querySelector('[data-sh="to"]'), note: !!m.querySelector('[data-sh="note"]'), travels: [...m.querySelectorAll('[data-tr]')].map((x) => x.dataset.tr), font: getComputedStyle(m.querySelector('.bw-modal-card')).fontFamily }; });
    await page.locator('#bw-ui-host >> css=.sh-modal [data-sh="to"]').fill('Alaa').catch(() => {});
    await page.locator('#bw-ui-host >> css=.sh-modal [data-sh="note"]').fill('راجعي الفصل الأول').catch(() => {});
    await R((r) => r.querySelector('.sh-modal [data-mk="ok"]')?.click());
    await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.sh-done'), null, { timeout: 15000 }).catch(() => {});
    sharedFile = await page.evaluate(() => document.documentElement.dataset.bwShared || '');
    const card = await R((r) => { const m = r.querySelector('.sh-done'); return m && { open: !!m.querySelector('[data-sh="open"]'), copy: !!m.querySelector('[data-sh="copy"]'), close: !!m.querySelector('[data-mk="close"]') }; });
    if (card?.open) await page.locator('#bw-ui-host >> css=.sh-done [data-sh="open"]').click();
    await wait(600);
    const rv = (() => { try { return JSON.parse(fs.readFileSync(process.env.BW_REVEAL_STUB, 'utf8').trim().split('\n').at(-1)); } catch { return null; } })();
    const stays = await R((r) => !!r.querySelector('.sh-done'));
    if (card?.close) await page.locator('#bw-ui-host >> css=.sh-done [data-mk="close"]').click();
    check(19, 'share popup: recipient, note and what travels (edits, history, lock, signatures), in the house face', !!pop && pop.to && pop.note && ['edits', 'history', 'lock', 'signs'].every((k) => pop.travels.includes(k)) && !/Times|(^|,\s*)serif$/.test(pop.font), JSON.stringify(pop));
    check(19, 'share result card: «افتح موقع الملف» opens Explorer with THAT file selected, «انسخ المسار», close', !!sharedFile && path.dirname(sharedFile) === htmlDir && !!card?.copy && stays && (process.platform === 'win32' ? rv?.cmd === 'explorer.exe' && rv.verbatim && rv.args[0] === `/select,"${sharedFile}"` : !!rv), JSON.stringify({ sharedFile, card, rv, stays }));
  }
  // H3: File › Import = the documents list's import: a shared HTML (its log kept), a DOCX, a PDF, a document JSON
  {
    const id0 = await page.evaluate(() => window.BW.S.svc);
    const ex = await page.evaluate(async () => { const B = window.BW, id = B.S.svc; const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: id, locale: 'ar', doc: B.M[id].ar.doc, embedFonts: false }) }); return r.json(); });
    let accept = '';
    const viaFile = async (f) => {
      const svc0 = await page.evaluate(() => window.BW.S.svc);
      const fc = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
      await fire('import');
      const ch = await fc;
      if (!ch) return null;
      accept ||= (await ch.element().getAttribute('accept')) || '';
      await ch.setFiles(f);
      await page.waitForFunction((s) => window.BW.S.svc !== s && /^doc-/.test(window.BW.S.svc), svc0, { timeout: 60000 }).catch(() => {});
      await wait(600);
      return page.evaluate(async () => { const B = window.BW, id = B.S.svc, e = await B.EXT.library.get(id); return { id, inList: !!e && !e.deletedAt, title: B.EXT.library.titleOf(id), share: (B.EXT.ledger?.log(id)?.entries || []).filter((x) => x.kind === 'share').map((x) => x.data) }; });
    };
    const a = sharedFile ? await viaFile(sharedFile) : null;
    const rest = [];
    for (const f of [ex.docx, ex.pdf, path.join(REPO, 'samples', 'blank', 'document.ar.json')]) rest.push(f ? await viaFile(f) : null);
    check(7, 'File › Import opens a shared Business-Wrap HTML as a new document, its log with the recipient and note kept', !!a && a.id !== id0 && a.inList && a.title === 'خدمة الحفظ في مكانها' && a.share.some((x) => x.to === 'Alaa' && x.note === 'راجعي الفصل الأول'), JSON.stringify(a));
    check(7, 'File › Import takes DOCX, PDF and JSON: each opens as its own new document in the list', ['.docx', '.pdf', '.json', '.html'].every((x) => accept.includes(x)) && rest.every((x) => x?.inList) && new Set(rest.map((x) => x?.id)).size === 3, JSON.stringify({ accept, rest }));
  }
  // G3 (review 2 row 10, L15): HISTORY hidden and never served, whatever the case of the address
  const histAttr = process.platform === 'win32' ? spawnSync('attrib', [ws.dirs.history], { encoding: 'utf8' }).stdout.split(ws.dirs.history)[0] : ' H ';
  const histServed = (await Promise.all(['HISTORY', 'history'].map(async (d) => (await fetch(`${h.url}files/${d}/sessions`)).status))).every((c) => c === 404);
  check(15, 'HISTORY carries the hidden attribute and is never served (any case)', /(^|\s)H(\s|$)/.test(histAttr) && histServed, JSON.stringify({ histAttr, histServed }));

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
  // H3: an update into a new install folder (an empty .local, browser storage on a new origin): the owner is still known
  // from HISTORY, so the first-launch card does not come back
  process.env.BW_LOCAL_DIR = path.join(tmp, '.local-v2');
  h = await H.start({ editor, port: await freePort(), open: false });
  const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx3.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '1'); } catch { /* storage */ } });
  const p3 = await ctx3.newPage();
  await p3.goto(h.url);
  await p3.waitForFunction(() => window.BW?.ready, null, { timeout: 20000 }).catch(() => {});
  await wait(1500);
  const up = await p3.evaluate(() => ({ card: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.pf-first'), name: window.BW.EXT.profile?.get()?.name || '' }));
  check(16, 'after an update (new install folder, empty .local, new origin) the owner is still known: no first-launch card', !up.card && up.name === 'Mark', JSON.stringify(up));
  await p3.close({ runBeforeUnload: true });
  await ctx3.close();
  const t3 = Date.now();
  while (H.alive(h.pid) && Date.now() - t3 < 8000) await wait(100);
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
