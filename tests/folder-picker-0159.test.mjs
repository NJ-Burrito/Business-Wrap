// P1-P6: the folder picker is an in-editor panel whose state lives on the host, so a person and an MCP agent see and finish the same picker.
// Real callers end to end: the official MCP client over stdio (mcp/cli.mjs) -> the real host (engine/serve.mjs, token) -> a real Google Chrome tab
// (editor/ext/48-folder-picker.js). Temp workspaces only (BW_LOCAL_DIR); the owner's .local/workspace.json is never touched.
//   A. no tab open: a separate MCP client process reads, navigates, creates, refuses, cancels and chooses (P2, P3, P4, P6), Unicode and Arabic names
//   B. the CLI `picker` verb and host_health show the same waiting picker (P3)
//   C. Chrome, English: the panel by mouse and keyboard; an agent's moves appear live; the agent finishes it (P1, P3)
//   D. Chrome, Arabic (RTL): the panel by keyboard only, Esc cancels and changes nothing (P1, P6)
//   E. the old /api/workspace/pick route and the Save's own ensureFolder() wait on the panel and are answered by it (P5); no spinner is left behind
//   F. no native dialog code remains anywhere (P5 sweep) and the routes refuse a caller with neither token nor page origin
//   node tests/folder-picker-0159.test.mjs      (BW_CHROME names Google Chrome)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-f159-'));
const LOCAL = path.join(tmp, '.local');
const env = { ...process.env, BW_LOCAL_DIR: LOCAL, BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_NO_BROWSER: '1', BW_EDITOR_TIMEOUT_MS: '20000', BW_PICK_TIMEOUT_MS: '60000' };
delete env.BW_WORKSPACE;
Object.assign(process.env, env);
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 12000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { try { if (await fn()) return true; } catch { /* not yet */ } } return false; };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  folder-picker: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 260) : ''}`); if (!ok) failed += 1; };
const wsFile = path.join(LOCAL, 'workspace.json');
const stored = () => { try { return JSON.parse(fs.readFileSync(wsFile, 'utf8')).parent; } catch { return null; } };
const same = (a, b) => path.resolve(String(a || '')).toLowerCase() === path.resolve(String(b || '')).toLowerCase();

// the folders the picker will browse
const AREA = path.join(tmp, 'area');
const NAMES = ['plain', 'مجلد عربي', '日本語-ünï', 'a b c'];
for (const n of NAMES) fs.mkdirSync(path.join(AREA, n), { recursive: true });
fs.mkdirSync(path.join(AREA, 'مجلد عربي', 'داخل'), { recursive: true });
fs.writeFileSync(path.join(AREA, 'a-file.txt'), 'not a folder');
const T2 = path.join(tmp, 'second'); fs.mkdirSync(path.join(T2, 'two'), { recursive: true });
const T3 = path.join(tmp, 'ثالث'); fs.mkdirSync(T3, { recursive: true });

const client = new Client({ name: 'f159', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' });
const text = (r) => r.content?.[0]?.text || '';
const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
const call = (name, args = {}) => client.callTool({ name, arguments: args });
const cli = (args) => new Promise((ok) => { const c = spawn(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), ...args, '--json'], { env, windowsHide: true }); let o = ''; c.stdout.on('data', (d) => { o += d; }); c.stderr.on('data', (d) => { o += d; }); const t = setTimeout(() => c.kill(), 60000); c.on('close', (code) => { clearTimeout(t); let j = null; try { j = JSON.parse(o); } catch { /* text */ } ok({ code, o, j }); }); });
let browser = null, ctx = null, page = null;
try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools.map((x) => x.name);
  check('the MCP server lists the six picker tools', ['picker_state', 'picker_open', 'picker_go', 'picker_mkdir', 'picker_choose', 'picker_cancel'].every((n) => tools.includes(n)), tools.join(','));

  // ---- A. no tab open ----
  await call('open_in_editor', { documents: [path.join(REPO, 'samples', 'event-permit')] }); // starts the host, no browser
  const hs = H.hostState();
  const base = `http://127.0.0.1:${hs?.port}`;
  check('a host is running with no editor tab at all', !!hs?.port && !(await (await fetch(`${base}/api/host/health`)).json()).tabs.length);
  let r = await call('picker_state');
  check('picker_state with nothing waiting: open false', !r.isError && data(r).open === false, text(r));
  r = await call('picker_go', { path: AREA });
  check('picker_go with no picker open is NO_PICKER, not a crash', r.isError === true && data(r).code === 'NO_PICKER', text(r));
  const before = stored();
  r = await call('picker_open', { path: AREA });
  let d = data(r);
  check('picker_open (no tab): open, the listing is the requested folder, folders only, quick places present',
    !r.isError && d.open && same(d.picker.path, AREA) && d.picker.listing.entries.length === NAMES.length && !d.picker.listing.entries.some((e) => e.name === 'a-file.txt') && d.picker.places.some((p) => p.id === 'documents') && d.picker.places.some((p) => p.id === 'drive'), text(r).slice(0, 300));
  check('Unicode and Arabic folder names come back exactly', NAMES.every((n) => d.picker.listing.entries.some((e) => e.name === n && same(e.path, path.join(AREA, n)))), JSON.stringify(d.picker.listing.entries.map((e) => e.name)));
  r = await call('picker_go', { path: path.join(AREA, 'مجلد عربي') });
  d = data(r);
  check('picker_go into an Arabic-named folder', !r.isError && same(d.picker.path, path.join(AREA, 'مجلد عربي')) && d.picker.listing.entries.some((e) => e.name === 'داخل') && d.picker.listing.parent && same(d.picker.listing.parent, AREA), text(r).slice(0, 300));
  r = await call('picker_go', { path: path.join(AREA, 'does-not-exist') });
  d = data(r);
  check('a path that does not exist is a plain error and the listing stays', !r.isError && d.picker.error?.code === 'missing' && same(d.picker.path, path.join(AREA, 'مجلد عربي')), text(r).slice(0, 300));
  r = await call('picker_go', { path: path.join(AREA, 'a-file.txt') });
  check('a file path is "not a folder"', data(r).picker.error?.code === 'notfolder');
  r = await call('picker_go', { path: 'relative/dir' });
  check('a relative path is refused plainly', data(r).picker.error?.code === 'relative');
  if (process.platform === 'win32') {
    const deny = path.join(AREA, 'no-access'); fs.mkdirSync(path.join(deny, 'x'), { recursive: true });
    const ic = spawnSync('icacls', [deny, '/deny', '*S-1-1-0:(RD)'], { encoding: 'utf8', windowsHide: true });
    // R15: the deny must be seen to take effect. The Windows runner's account is an administrator and reads a folder denied to Everyone, so there a
    // folder cannot be made unreadable: the case is skipped there with a stated reason and still runs on any ordinary account.
    let denied = false;
    if (ic.status === 0) { try { fs.readdirSync(deny); } catch { denied = true; } }
    if (ic.status === 0 && !denied) {
      spawnSync('icacls', [deny, '/remove:d', '*S-1-1-0'], { windowsHide: true });
      out.push('NOTE  folder-picker: this account reads a folder denied to Everyone (an administrator); the unreadable-folder checks were skipped here');
    } else if (ic.status === 0) {
      r = await call('picker_go', { path: deny });
      d = data(r);
      check('an unreadable folder is shown plainly (listing.error unreadable), nothing crashes, Choose is refused', !r.isError && d.picker.listing.error?.code === 'unreadable' && d.picker.listing.entries.length === 0, text(r).slice(0, 300));
      r = await call('picker_choose');
      check('Choose on an unreadable folder is refused and the picker stays open', r.isError === true && data(r).code === 'REFUSED' && stored() === before, text(r));
      spawnSync('icacls', [deny, '/remove:d', '*S-1-1-0'], { windowsHide: true });
    } else out.push(`NOTE  folder-picker: icacls could not deny a folder (${ic.status}); the unreadable-folder check was not run`);
  }
  await call('picker_go', { path: path.join(AREA, 'مجلد عربي') });
  r = await call('picker_mkdir', { name: 'جديد' });
  d = data(r);
  check('picker_mkdir creates an Arabic-named folder and goes into it', !r.isError && fs.statSync(path.join(AREA, 'مجلد عربي', 'جديد')).isDirectory() && same(d.picker.path, path.join(AREA, 'مجلد عربي', 'جديد')), text(r).slice(0, 300));
  await call('picker_go', { path: AREA });
  for (const [name, code] of [['a/b', 'badname'], ['..', 'badname'], ['plain', 'exists'], ['bad:name', 'badname'], ['CON', 'badname']]) {
    r = await call('picker_mkdir', { name });
    check(`picker_mkdir "${name}" is ${code}`, !r.isError && data(r).picker.error?.code === code, text(r).slice(0, 200));
  }
  check('nothing was created outside the folder by a bad name', fs.readdirSync(AREA).length === NAMES.length + 1 + (process.platform === 'win32' && fs.existsSync(path.join(AREA, 'no-access')) ? 1 : 0), fs.readdirSync(AREA).join('|'));
  // refused: inside the program folder
  r = await call('picker_choose', { path: REPO });
  check('a folder inside the program is REFUSED with the reason; the picker stays open; nothing stored', r.isError === true && data(r).code === 'REFUSED' && data(r).reason === 'refused' && stored() === before && data(await call('picker_state')).open === true, text(r).slice(0, 300));
  r = await call('picker_go', { path: path.join(REPO, 'engine') });
  d = data(r);
  check('inside the program the listing says blocked (the panel greys Choose)', d.picker.listing.blocked === true);
  r = await call('picker_mkdir', { name: 'x' });
  check('a folder cannot be created inside the program from the picker', data(r).picker.error?.code === 'refused' && !fs.existsSync(path.join(REPO, 'engine', 'x')));
  // cancel changes nothing
  await call('picker_go', { path: AREA });
  r = await call('picker_cancel');
  check('Cancel closes the picker and changes nothing (workspace.json untouched)', !r.isError && data(r).open === false && data(r).last.outcome === 'cancelled' && stored() === before);
  // choose
  await call('picker_open', { path: AREA });
  r = await call('picker_choose', { path: path.join(AREA, 'مجلد عربي') });
  d = data(r);
  check('Choose stores the folder in .local/workspace.json (Unicode path) and closes the picker', !r.isError && d.open === false && same(d.chosen, path.join(AREA, 'مجلد عربي')) && same(stored(), path.join(AREA, 'مجلد عربي')) && d.last.outcome === 'chosen', text(r).slice(0, 300));
  r = await call('picker_choose');
  check('Choose with no picker open is NO_PICKER', r.isError === true && data(r).code === 'NO_PICKER');

  // ---- B. CLI and status ----
  let c = await cli(['picker', 'open', '--path', AREA]);
  check('CLI: picker open', c.code === 0 && c.j?.open === true && same(c.j.picker.path, AREA), c.o);
  const hl = data(await call('host_health'));
  check('host_health (status) shows the waiting picker', hl.picker?.open === true && same(hl.picker.path, AREA), JSON.stringify(hl.picker));
  c = await cli(['picker', 'go', '--path', T2]);
  check('CLI: picker go', c.code === 0 && same(c.j?.picker?.path, T2), c.o);
  c = await cli(['picker', 'state']);
  check('CLI: picker state is the same picker the MCP tools see', c.code === 0 && same(c.j?.picker?.path, T2) && same(data(await call('picker_state')).picker.path, T2), c.o);
  c = await cli(['picker', 'cancel']);
  check('CLI: picker cancel', c.code === 0 && c.j?.open === false);

  // ---- C. real Chrome, English ----
  const lo = launchOptions();
  browser = await chromium.launch(lo);
  check('the browser is Google Chrome', /chrome\.exe$|google-chrome/i.test(String(lo.executablePath)) && !/msedge/i.test(String(lo.executablePath)), lo.executablePath);
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('f159')) { sessionStorage.setItem('f159', '1'); localStorage.setItem('bw:ui', 'en'); } });
  page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message)));
  await page.goto(`${base}/?automation=1`);
  await page.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 60000 });
  check('ready state observed: the editor booted in English with the picker extension loaded', (await page.evaluate(() => window.BW.S.ui)) === 'en' && (await page.evaluate(() => !!window.BW.EXT.folderPicker)));
  const panel = page.locator('dialog.bw-fp[open]');
  const val = (sel) => page.locator(`dialog.bw-fp ${sel}`);
  // the person: Settings -> Change folder
  await page.evaluate(() => window.BW.openDrawer('settings'));
  await page.locator('details:has([data-ws="pick"]) > summary').click(); // the Save folder card is a collapsed Settings section
  await page.locator('[data-ws="pick"]').click();
  check('Settings "Change folder" opens the panel at once', await panel.waitFor({ timeout: 4000 }).then(() => true, () => false));
  check('the panel shows its English title, a dir of ltr, the current folder in the path box and quick places', (await val('h2').innerText()) === 'Choose the save folder' && (await panel.evaluate((e) => e.dir)) === 'ltr' && (await val('#bw-fp-path').inputValue()).length > 3 && (await val('.fp-place').count()) >= 3);
  const txt = await panel.evaluate((e) => e.textContent);
  check('no emoji in the panel; icons are inline Lucide SVG', !/\p{Extended_Pictographic}/u.test(txt) && (await val('svg.ic').count()) >= 5);
  const fam = await val('h2').evaluate((e) => getComputedStyle(e).fontFamily);
  check('the panel uses the editor\'s typeface (Thmanyah first, never Cairo)', /thmanyah/i.test(fam) && !/cairo/i.test(fam), fam);
  check('focus is inside the panel on open (keyboard works at once)', await panel.evaluate((e) => e.matches(':focus-within')));
  // type a path
  await val('#bw-fp-path').fill(AREA);
  await val('#bw-fp-path').press('Enter');
  check('typing a path and Enter goes there: the list shows the folders (Arabic and Japanese names intact)', await until(async () => (await val('.fp-item').count()) >= NAMES.length) && (await val('.fp-item .w').allInnerTexts()).includes('مجلد عربي') && (await val('.fp-item .w').allInnerTexts()).includes('日本語-ünï'));
  check('the breadcrumb ends with the current folder', (await val('.fp-crumb[aria-current="page"]').innerText()) === path.basename(AREA));
  // keyboard in the list
  await val('.fp-item').first().focus();
  await page.keyboard.press('ArrowDown');
  const focused = await val('.fp-item:focus .w').innerText().catch(() => '');
  const items = await val('.fp-item .w').allInnerTexts();
  check('ArrowDown moves focus to the next folder', focused === items[1], `${focused} vs ${items[1]}`);
  await page.keyboard.press('Enter');
  check('Enter opens the focused folder', await until(async () => (await val('#bw-fp-path').inputValue()).toLowerCase().endsWith(items[1].toLowerCase())), await val('#bw-fp-path').inputValue());
  await page.keyboard.press('Backspace');
  check('Backspace in the list goes up one level', await until(async () => same(await val('#bw-fp-path').inputValue(), AREA)), await val('#bw-fp-path').inputValue());
  // mouse: click a folder, create a folder
  await val('.fp-item').filter({ hasText: 'plain' }).first().click().catch(() => {});
  check('a click on a folder enters it', await until(async () => same(await val('#bw-fp-path').inputValue(), path.join(AREA, 'plain'))), await val('#bw-fp-path').inputValue());
  await val('.fp-new').click();
  await val('#bw-fp-name').fill('جديد-من-الواجهة');
  await val('#bw-fp-name').press('Enter');
  check('New folder by the panel creates it on disk and goes into it', await until(async () => fs.existsSync(path.join(AREA, 'plain', 'جديد-من-الواجهة')) && same(await val('#bw-fp-path').inputValue(), path.join(AREA, 'plain', 'جديد-من-الواجهة'))));
  await val('.fp-new').click();
  await val('#bw-fp-name').fill('a:b');
  await val('#bw-fp-name').press('Enter');
  check('a bad folder name shows a plain message in the panel and creates nothing', await until(async () => /Not a valid name/.test(await val('.fp-msg').innerText())) && (await val('.fp-msg').getAttribute('role')) === 'status');
  // refused inside the program, through the panel
  const s0 = stored();
  await val('#bw-fp-path').fill(path.join(REPO, 'engine'));
  await val('#bw-fp-path').press('Enter');
  check('inside the program folder: the panel says so, Choose is disabled and nothing is stored', await until(async () => /program folder/.test(await val('.fp-msg').innerText())) && (await val('.fp-choose').isDisabled()) && same(stored(), s0) && !!s0);
  // the agent drives the same picker while the person watches
  await call('picker_go', { path: T2 });
  check('LIVE: an agent\'s picker_go appears in the open panel (path box, breadcrumb, list)', await until(async () => same(await val('#bw-fp-path').inputValue(), T2) && (await val('.fp-item .w').allInnerTexts()).includes('two'), 6000));
  d = data(await call('picker_state'));
  check('the person and the agent see the same picker (one id, one path)', same(d.picker.path, T2) && d.picker.listing.entries.some((e) => e.name === 'two'));
  await call('picker_mkdir', { name: 'by-agent' });
  check('LIVE: a folder the agent created shows up in the panel', await until(async () => (await val('#bw-fp-path').inputValue()).endsWith('by-agent'), 6000));
  // either can finish: the agent chooses
  r = await call('picker_choose');
  check('the agent finishes the picker the person has open: the panel closes by itself', !r.isError && same(stored(), path.join(T2, 'by-agent')) && await panel.waitFor({ state: 'detached', timeout: 6000 }).then(() => true, () => false), text(r).slice(0, 200));
  await page.evaluate(() => window.BW.openDrawer('settings'));
  check('the Settings card shows the chosen folder (no reload)', await until(async () => ((await page.locator('.ws-root').first().innerText()).toLowerCase()).includes('by-agent')), await page.locator('.ws-root').first().innerText());
  // the agent opens it with a person watching, the person cancels with the mouse
  const keep = stored();
  await call('picker_open', { path: T3 });
  check('LIVE: a picker an agent opens appears in the tab without a click', await panel.waitFor({ timeout: 8000 }).then(() => true, () => false));
  check('the panel says an agent opened it', await val('.fp-by').isVisible() && /agent/i.test(await val('.fp-by').innerText()));
  await val('.fp-cancel').click();
  check('Cancel by the person: the host picker is closed, nothing changes (P6)', await until(async () => data(await call('picker_state')).open === false) && same(stored(), keep) && await panel.waitFor({ state: 'detached', timeout: 4000 }).then(() => true, () => false));

  // ---- E. the old route and the Save's ensureFolder wait on the panel ----
  const pend = page.evaluate(() => { window.__pick = fetch('/api/workspace/pick', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then((x) => x.json()); return 1; });
  await pend;
  check('P5: the old /api/workspace/pick route opens the panel instead of a native dialog', await panel.waitFor({ timeout: 8000 }).then(() => true, () => false) && data(await call('picker_state')).picker.by === 'save');
  await val('#bw-fp-path').fill(T3);
  await val('#bw-fp-path').press('Enter');
  await until(async () => same(await val('#bw-fp-path').inputValue(), T3));
  await val('.fp-choose').focus();
  await page.keyboard.press('Enter');
  const picked = await page.evaluate(() => window.__pick);
  check('the old route answers {ok, parent} when the person chooses by keyboard (Arabic-named folder); no spinner left', picked.ok === true && same(picked.parent, T3) && same(stored(), T3) && await panel.waitFor({ state: 'detached', timeout: 4000 }).then(() => true, () => false), JSON.stringify(picked));
  const ens = page.evaluate(() => { window.__ens = window.BW.EXT.session.ensureFolder(); return 1; });
  await ens;
  const info = await page.evaluate(() => window.BW.EXT.session.info.workspace.chosen);
  check('ensureFolder (the Save path) with a chosen folder asks nothing', info === true && !(await panel.count()));
  // Save asks when the folder was never chosen: remove the choice, then ask
  fs.rmSync(wsFile, { force: true });
  await page.evaluate(() => { window.BW.EXT.session.info.workspace = { root: '', chosen: false }; window.__ens2 = window.BW.EXT.session.ensureFolder(); });
  check('ensureFolder with no chosen folder opens the panel (the first Save)', await panel.waitFor({ timeout: 8000 }).then(() => true, () => false));
  r = await call('picker_choose', { path: AREA });
  const ens2 = await page.evaluate(() => window.__ens2);
  check('an agent answers the first-Save question through MCP; the Save continues (ensureFolder true)', !r.isError && ens2 === true && same(stored(), AREA));
  // a pending old caller that nobody answers is released with a plain pending answer, picker still open for whoever comes
  // (BW_PICK_TIMEOUT_MS is 60 s here; the route is checked in tests/workspace.test.mjs by choosing)

  // ---- D. Arabic, RTL, keyboard only ----
  await page.evaluate(() => { localStorage.setItem('bw:ui', 'ar'); });
  await page.reload();
  await page.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession && window.BW.S.ui === 'ar', null, { timeout: 60000 });
  check('ready state observed: the editor booted in Arabic', (await page.evaluate(() => window.BW.S.ui)) === 'ar');
  const before2 = stored();
  await call('picker_open', { path: AREA });
  check('Arabic: the panel appears (live) with an Arabic title, dir rtl', await panel.waitFor({ timeout: 8000 }).then(() => true, () => false) && (await val('h2').innerText()) === 'اختر مجلد الحفظ' && (await panel.evaluate((e) => e.dir)) === 'rtl');
  const atxt = await panel.evaluate((e) => e.textContent);
  check('Arabic: no emoji, no Latin button text left over (the buttons are Arabic)', !/\p{Extended_Pictographic}/u.test(atxt) && (await val('.fp-choose').innerText()).trim() === 'اختر هذا المجلد' && (await val('.fp-cancel').innerText()).trim() === 'إلغاء');
  check('Arabic: the folder names are listed with dir=auto and read correctly', (await val('.fp-item .w').allInnerTexts()).includes('مجلد عربي') && (await val('.fp-item .w').first().getAttribute('dir')) === 'auto');
  const rtlPos = await val('.fp-places').evaluate((e) => e.getBoundingClientRect().left) > (await val('.fp-main').evaluate((e) => e.getBoundingClientRect().left));
  check('Arabic: the quick places sit on the start (right) side', rtlPos);
  await val('.fp-item').filter({ hasText: 'مجلد عربي' }).first().focus();
  await page.keyboard.press('Enter');
  check('Arabic: Enter on «مجلد عربي» enters it', await until(async () => same(await val('#bw-fp-path').inputValue(), path.join(AREA, 'مجلد عربي'))));
  await page.keyboard.press('Escape');
  check('Esc cancels: the panel closes, the host picker is closed, the choice is unchanged', await panel.waitFor({ state: 'detached', timeout: 5000 }).then(() => true, () => false) && data(await call('picker_state')).open === false && same(stored(), before2));
  // Choose by keyboard in Arabic
  await call('picker_open', { path: AREA });
  await panel.waitFor({ timeout: 8000 });
  await val('.fp-item').filter({ hasText: 'مجلد عربي' }).first().focus();
  await page.keyboard.press('Enter');
  await until(async () => same(await val('#bw-fp-path').inputValue(), path.join(AREA, 'مجلد عربي')));
  await val('.fp-choose').focus();
  await page.keyboard.press('Enter');
  check('Arabic: Choose by keyboard stores the Arabic-named folder', await panel.waitFor({ state: 'detached', timeout: 6000 }).then(() => true, () => false) && same(stored(), path.join(AREA, 'مجلد عربي')));
  check('no page error was raised by the picker', !errs.some((m) => /picker|fp-|FPK/i.test(m)), errs.join(' | '));

  // ---- F. sweep and auth ----
  const bad = await fetch(`${base}/api/workspace/picker/state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('the picker routes refuse a caller with neither the host token nor the page origin (403 AUTH)', bad.status === 403 && (await bad.json()).code === 'AUTH');
  const evil = await fetch(`${base}/api/workspace/picker/state`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  check('a foreign web page origin is refused (403)', evil.status === 403);
  const good = await fetch(`${base}/api/workspace/picker/state`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bw-token': hs.token }, body: '{}' });
  check('the host token is accepted', good.status === 200);
  const sweep = [];
  const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (['node_modules', '.git', 'out', 'tests', 'update', 'site'].includes(e.name) && dir === REPO) continue; if (e.name === 'node_modules' || e.name === '.git' || e.name === 'out') continue; const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(mjs|js|py|html|ps1|cmd)$/.test(e.name) && !/business-wrap\.html$/.test(e.name)) { const s = fs.readFileSync(p, 'utf8'); if (/FolderBrowserDialog|choose folder|zenity|showDirectoryPicker|webkitdirectory|input[^>]*type=["']file["'][^>]*directory|osascript.*folder/i.test(s)) sweep.push(path.relative(REPO, p)); } } };
  for (const d of ['engine', 'editor', 'mcp', 'hooks', 'tools', 'update']) if (fs.existsSync(path.join(REPO, d))) walk(path.join(REPO, d));
  out.push(`NOTE  folder-picker: P5 sweep, files naming a native or browser folder picker: ${sweep.length ? sweep.join(', ') : 'none'}`);
  check('P5 sweep: no native folder dialog or browser folder picker remains in engine, editor, mcp, hooks, tools or update (the sweep read the files: positive sample below)', sweep.filter((f) => !/(^|[\\/])(project-import|13-projects)/.test(f)).length === 0 && fs.readFileSync(path.join(REPO, 'engine', 'workspace.mjs'), 'utf8').includes('pickerOpen'), sweep.join(','));
} catch (e) {
  check('suite ran to the end', false, e?.stack || e);
} finally {
  try { await page?.close({ runBeforeUnload: false }); } catch { /* closed */ }
  try { await ctx?.close(); } catch { /* closed */ }
  try { await browser?.close(); } catch { /* closed */ }
  try { await call('close_editor', {}); } catch { /* host gone */ }
  try { await client.close(); } catch { /* closed */ }
  try { await H.stop(); } catch { /* none */ }
  try { spawnSync('icacls', [path.join(tmp, 'area', 'no-access'), '/remove:d', '*S-1-1-0'], { windowsHide: true }); fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  console.log(out.join('\n'));
  console.log(failed ? `\n${failed} FAILED` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
