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
  const shareName = (fs.existsSync(htmlDir) ? fs.readdirSync(htmlDir) : []).filter((n) => !htmlBefore.has(n));
  check(15, 'share writes «<title>-<date>-AR.html» like a save (not doc-<id>.editor.html)', shareName.length >= 1 && shareName.every((n) => n.includes(today) && /-AR\.html$/.test(n)), shareName.join(',') || 'no shared file', true);

  // L14 closing the last tab saves and stops the host; a relaunch offers resume or new work
  const pid = h.pid;
  for (const p of ctx.pages()) await p.close({ runBeforeUnload: true });
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
