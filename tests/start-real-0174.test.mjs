// 0.17.4 lane start: the top-bar host switch of an editor opened from a FILE (file://), in a REAL headed Chrome, through the REAL business-wrap:// protocol.
//   switch on  -> Chrome hands business-wrap://start to the registered handler (update/cli.mjs handle) -> the host starts -> «Connected :port», green dot
//   switch off -> business-wrap://stop -> only the host stops: the page stays open, «Offline», red dot, Chrome still running
// Run for a saved editor (engine buildEditor output) and for an exported one (the page's own Save HTML: BW.saveHtml, downloaded by Chrome).
// Chrome asks before it opens an external protocol: the throwaway profile is pre-allowed through protocol_handler.allowed_origin_protocol_pairs.
// Skipped (exit 0) outside Windows, when the protocol is not registered for THIS install, or when any Business-Wrap host answers on 4317-4327
// (the owner's host is never touched; stop it first or set BW_START_REAL_FORCE=1 to run anyway).
//   BW_START_SHOTS=<dir>  keep a screenshot of each state there.   node tests/start-real-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { chromium } from 'playwright-core';
import { REPO, sleep, until } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { chromePath } from '../engine/export.mjs';
import { status as protoStatus, probeServers } from '../engine/protocol.mjs';

const skip = (why) => { console.log(`SKIP  start-real: ${why}`); process.exit(0); };
if (process.platform !== 'win32') skip('Windows only (the registered protocol handler is a per-user registry key)');
const ps = protoStatus();
if (!ps.registered || !ps.current) skip(`business-wrap:// is not registered for this install (run: node update/cli.mjs protocol register). registered=${ps.registered} current=${ps.current}`);
const chrome = chromePath();
if (!chrome || !/chrome\.exe$/i.test(chrome)) skip('no Google Chrome found');
const busy = await probeServers();
if (busy.length && process.env.BW_START_REAL_FORCE !== '1') skip(`a Business-Wrap host already answers on port ${busy.map((s) => s.port).join(', ')}; this test starts and stops a host`);

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  start-real: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(process.env.BW_START_TMP || os.tmpdir(), 'bw-start174-'));
const shots = process.env.BW_START_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const PORTS = Array.from({ length: 11 }, (_, i) => 4317 + i);

const health = async () => { for (const p of PORTS) { try { const j = await (await fetch(`http://127.0.0.1:${p}/api/health`, { signal: AbortSignal.timeout(700) })).json(); if (j?.name === 'Business-Wrap') return j; } catch { /* none */ } } return null; };
const killTree = (pid) => { if (pid) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); };

/** A fresh throwaway profile in which file:// pages may open business-wrap: links without Chrome's prompt. */
function profile() {
  const dir = path.join(tmp, 'prof');
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  const pair = { 'business-wrap': true };
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ protocol_handler: { allowed_origin_protocol_pairs: { 'file://': pair, 'file:///': pair, null: pair, 'file://localhost': pair } }, browser: { has_seen_welcome_page: true } }));
  fs.writeFileSync(path.join(dir, 'First Run'), '');
  return dir;
}

const state = (page) => page.evaluate(() => document.documentElement.dataset.bwServer);
const ui = (page) => page.evaluate(() => {
  const r = document.getElementById('bw-ui-host')?.shadowRoot;
  const b = r?.querySelector('.srv-toggle');
  if (!b) return null;
  const dot = b.querySelector('.srv-dot');
  const c = dot ? getComputedStyle(dot).backgroundColor : '';
  const v = getComputedStyle(b).getPropertyValue('--srv-c');
  return { word: b.querySelector('.srv-w')?.textContent || '', st: b.dataset.st, checked: b.getAttribute('aria-checked'), dot: c, v, n: r.querySelectorAll('.srv-toggle').length };
});
/** A real mouse click on the switch: Chrome launches an external protocol only on a genuine user gesture (a scripted .click() launches the first link, not the next). */
const press = async (page) => { const b = await page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot.querySelector('.srv-toggle').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await page.mouse.click(b.x, b.y); };
const rgb = (s) => (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s) || []).slice(1, 4).map(Number);
const isGreen = (s) => { const [r, g, b] = rgb(s); return g > r + 25 && g >= b; };
const isRed = (s) => { const [r, g, b] = rgb(s); return r > g + 40 && r > b + 30; };

async function run(label, file, port) {
  const prof = profile();
  const child = spawn(chrome, [`--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-position=-1900,20', '--window-size=1300,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: false });
  let browser;
  try {
    for (let i = 0; i < 60 && !browser; i += 1) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(300); } }
    check(`${label}: real Chrome started and attached`, !!browser);
    if (!browser) return;
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] || await ctx.newPage();
    const url = pathToFileURL(file).href;
    await page.goto(url);
    const ready = await until(async () => (await state(page)) === 'offline', 20000);
    check(`${label}: file:// page ready, no host -> Offline`, ready, `state=${await state(page)}`);
    await until(async () => isRed((await ui(page))?.dot || ''), 3000, 100); // the dot fades in over .2 s once the state turns «offline»
    let u = await ui(page);
    check(`${label}: one switch, red dot, word Offline`, !!u && u.n === 1 && u.st === 'offline' && u.checked === 'false' && isRed(u.dot), JSON.stringify(u));
    await page.screenshot({ path: path.join(shots, `${label}-1-offline.png`) });

    // ON
    await press(page);
    check(`${label}: press shows «Starting…»`, await until(async () => (await state(page)) === 'starting', 4000));
    await page.screenshot({ path: path.join(shots, `${label}-2-starting.png`) });
    const up = await until(async () => (await state(page)) === 'online', 40000, 250);
    check(`${label}: switch on -> Connected (the real protocol started the host)`, up, `state=${await state(page)}`);
    const h = await health();
    check(`${label}: /api/health answers with this install's version ${PKG_VERSION}`, !!h && h.version === PKG_VERSION, JSON.stringify(h));
    u = await ui(page);
    check(`${label}: word «Connected :${h?.port}», aria-checked, green dot`, !!u && u.st === 'online' && u.checked === 'true' && !!h && u.word.includes(`:${h.port}`) && isGreen(u.dot), JSON.stringify(u));
    await page.screenshot({ path: path.join(shots, `${label}-3-connected.png`) });
    check(`${label}: the page is still the file:// page`, page.url() === url, page.url());

    // OFF
    await press(page);
    const down = await until(async () => (await state(page)) === 'offline', 40000, 250);
    check(`${label}: switch off -> Offline`, down, `state=${await state(page)}`);
    check(`${label}: the host really stopped (nothing answers 4317-4327)`, await until(async () => !(await health()), 8000, 300));
    await until(async () => isRed((await ui(page))?.dot || ''), 3000, 100);
    u = await ui(page);
    check(`${label}: red dot, word Offline, switch off`, !!u && u.st === 'offline' && u.checked === 'false' && isRed(u.dot), JSON.stringify(u));
    check(`${label}: only the host stopped: the page is open and Chrome still runs`, !page.isClosed() && page.url() === url && child.exitCode === null && browser.isConnected());
    await page.screenshot({ path: path.join(shots, `${label}-4-offline-again.png`) });
  } finally {
    try { await browser?.close(); } catch { /* gone */ }
    killTree(child.pid);
    await sleep(500);
  }
}

const saved = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(saved), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: saved, set: 'sample' });

// the exported editor: the page's own «Save HTML» (BW.saveHtml), downloaded by Chrome into a folder of ours
async function exportedFrom(file, port) {
  const dl = path.join(tmp, 'dl');
  fs.mkdirSync(dl, { recursive: true });
  const prof = path.join(tmp, 'prof-export');
  fs.mkdirSync(path.join(prof, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(prof, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: dl, prompt_for_download: false } }));
  const child = spawn(chrome, [`--user-data-dir=${prof}`, `--remote-debugging-port=${port}`, '--window-position=-1900,20', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 60 && !browser; i += 1) { try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(300); } }
    const page = browser.contexts()[0].pages()[0];
    const cdp = await browser.newBrowserCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    await page.goto(pathToFileURL(file).href);
    await until(async () => page.evaluate(() => !!window.BW?.saveHtml), 20000);
    await page.evaluate(() => window.BW.saveHtml(false));
    await until(() => fs.readdirSync(dl).some((f) => /\.editor\.html$/.test(f)), 15000);
    const f = fs.readdirSync(dl).find((x) => /\.editor\.html$/.test(x));
    return f ? path.join(dl, f) : null;
  } finally { try { await browser?.close(); } catch { /* gone */ } killTree(child.pid); await sleep(500); }
}

try {
  await run('saved', saved, 9441);
  const exported = await exportedFrom(saved, 9442);
  check('exported: the page produced its Save-HTML file', !!exported && /id="bw-data"/.test(fs.readFileSync(exported, 'utf8')), String(exported));
  if (exported) await run('exported', exported, 9443);
} finally {
  // leave nothing behind: a host this test started is stopped (the owner's host was not up: the test refused to run otherwise)
  if (await health()) spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'stop', '--all'], { stdio: 'ignore', windowsHide: true });
}
if (!process.env.BW_START_KEEP) spawnSync('python', [path.join(os.homedir(), '.claude', 'skills', 'safe-delete', 'scripts', 'trash.py'), tmp], { stdio: 'ignore', windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } }); // the throwaway profile and files go to the recycle bin
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}: start-real-0174 — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
