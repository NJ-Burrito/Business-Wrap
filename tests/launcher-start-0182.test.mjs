// (owner bug 2026-11-10): opening Business-Wrap from the Desktop shortcut did not land on the start page, not even once the local host was up.
//   Root cause (reproduced here first): the launcher with no file opened the NEWEST SAVED DOCUMENT's editor file. That file is a `doc-` service (so 50-start's «untouched template»
//   guard can never pass) and carries no document-type payload (a file:// page has nothing to list), and the host started by a plain business-wrap://start served the same newest document.
// What this drives, through the real callers (R14), in a real headless Chrome with navigator.webdriver masked (a person's browser, not an automation tab):
//   - the shortcut: the .lnk the launcher makes is read back, its own target + arguments are run (wscript -> open-editor.vbs -> open-editor.mjs), the browser command is a stub file: the URL
//     is the tool editor (not the saved document) and the page lands on the start page, whose Recents hold the saved document; clicking it opens that file as itself
//   - an explicit file argument (a saved document) opens that file, no start page
//   - the served host (`handle business-wrap://start`, a real host process on a free port): the page it serves lands on the start page; the «continue where you left off» question does not
//     open over it (one landing), and does open when the start page is switched off in Settings
//   - the host switch with a file (`start?file=<tool editor>`) serves that file and lands on the start page; the way back (`returnTo.file` = a document) opens that document on disk
// Safe by construction: temp state / save folder / Desktop-less (only a temp .lnk), the browser is a stub, a free port, no protocol or HKCU write, the owner's host on 4317 is never probed.
//   node tests/launcher-start-0182.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { workspace } from '../engine/workspace.mjs';
import { makeLauncher, readShortcut } from '../launcher/launcher.mjs';
import { suite, launchChrome } from './_harness.mjs';

const S = suite('launcher-start-0182'); const { check } = S;
const win = process.platform === 'win32';
const tmp = fs.mkdtempSync(path.join(process.env.BW_START_TMP || os.tmpdir(), 'bw-lstart182-'));
const mk = (...p) => { const d = path.join(tmp, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 150) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) { const v = await fn(); if (v) return v; } return null; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };

const port = await free();
const SB = { BW_LOCAL_DIR: mk('local'), BW_STATE_DIR: mk('state'), BW_WORKSPACE: mk('ws'), BW_OPEN_PORT: String(port), BW_PROBE_PORTS: String(port), BW_POWER_GRACE_MS: '300', BW_NO_PROTOCOL: '1', BW_NO_LAUNCHER: '1', BW_NO_BROWSER: '1', BW_BROWSER_STUB: path.join(tmp, 'browser.jsonl') };
Object.assign(process.env, SB); // this process, the wscript chain and the host all see the same sandbox
const stub = () => (fs.existsSync(SB.BW_BROWSER_STUB) ? fs.readFileSync(SB.BW_BROWSER_STUB, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : []);
const lastUrl = () => stub().filter((r) => r.launcher).at(-1)?.args?.at(-1) || '';
const started = [];
let browser = null;
let inproc = null;
const closeAll = async () => {
  try { await browser?.close(); } catch { /* closed */ }
  try { inproc?.close(); inproc?.closeAllConnections?.(); } catch { /* closed */ }
  for (const pid of started) { if (win) spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else { try { process.kill(pid); } catch { /* gone */ } } }
};

/** A person's browser page: webdriver is not set (the start page is hidden under automation), a profile exists (no first-launch card), the editor probes no port of the owner's. */
async function person(url, { ui = 'en', init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 } });
  await ctx.addInitScript((a) => {
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
      if (!localStorage.getItem('bw:profile')) localStorage.setItem('bw:profile', JSON.stringify({ name: 'Owner', role: 'tester', done: true }));
      if (!sessionStorage.getItem('bw-l182')) { sessionStorage.setItem('bw-l182', '1'); localStorage.setItem('bw:ui', a.ui); if (a.off) localStorage.setItem('bw:start', 'off'); }
      window.__bwProbePorts = a.ports;
    } catch { /* none */ }
  }, { ui, off: !!init?.off, ports: init?.ports || [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (init?.last) await page.route('**/api/session/last', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(init.last) }));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 30000 });
  return { page, ctx, errors };
}
/** Everything that decides the landing has run: the session settled, the editor is ready (no card in the way), then a moment for the start page to appear if it will. */
async function landed(page) {
  await page.waitForSelector('html[data-bw-session-settled="1"], html[data-bw-resume="asked"]', { timeout: 30000, state: 'attached' });
  await page.evaluate(() => window.BW.whenReady(8000)).catch(() => {});
  await sleep(1500);
  return page.evaluate(() => {
    const sh = document.getElementById('bw-ui-host')?.shadowRoot;
    const { S, EXT } = window.BW;
    return {
      start: document.documentElement.dataset.bwStart, resume: document.documentElement.dataset.bwResume || '', svc: S.svc, isDoc: EXT.library.isDoc(S.svc), url: location.href,
      dlg: !!sh?.querySelector('dialog.bw-start'), resumeDlg: !!sh?.querySelector('dialog.bw-resume') || !!document.querySelector('dialog.bw-resume'),
      rec: [...(sh?.querySelectorAll('dialog.bw-start [data-recent]') || [])].map((x) => ({ id: x.dataset.recent, text: x.textContent.replace(/\s+/g, ' ').trim() })),
    };
  });
}

/** 0.18.2 (ruling D11): when something can be resumed, the «continue where you left off» popup opens by itself first, as in 0.18.1; answering «later» leaves the start page. */
async function dismissPopup(page) {
  await page.waitForFunction(() => document.documentElement.dataset.bwResume !== 'asked' || !!(document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('dialog.bw-resume') || document.querySelector('dialog.bw-resume')), null, { timeout: 15000 }).catch(() => {}); // asked = the popup is being put up: wait for the dialog itself
  const had = await page.evaluate(() => { const d = document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('dialog.bw-resume') || document.querySelector('dialog.bw-resume'); if (!d) return false; d.querySelector('[data-s="later"]')?.click(); return true; });
  if (had) await page.waitForSelector('html[data-bw-start="open"]', { timeout: 20000, state: 'attached' }).catch(() => {});
  return { had, ...(await landed(page)) };
}

try {
  browser = await launchChrome(['--bw-session=bw-1109']);

  // ── a real saved document in the save folder: made the way the owner's are (a served editor, a library document, Save in place) ──
  const seed = path.join(tmp, 'seed.editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: seed, set: 'seed' });
  inproc = await serve(seed, 0, { workspace: true });
  const seeder = await person(`http://127.0.0.1:${inproc.address().port}/?automation=1`);
  const saved = await seeder.page.evaluate(async () => { const L = window.BW.EXT.library; await L.newFromType('blank', 'en'); await new Promise((r) => setTimeout(r, 400)); const e = await L.saveInPlace(); return { id: window.BW.S.svc, file: Object.values(e?.htmlFiles || {})[0] || '' }; });
  await seeder.ctx.close();
  inproc.close(); inproc.closeAllConnections?.(); inproc = null;
  const docFile = saved.file;
  check('setup: a saved document exists in the (temp) save folder, a `doc-` service', !!docFile && fs.existsSync(docFile) && /^doc-/.test(saved.id) && docFile.startsWith(workspace().root), JSON.stringify(saved));
  const docUrl = pathToFileURL(docFile).href;

  // ── 1. the shortcut ──
  let shortcutRan = false;
  if (win) {
    const made = makeLauncher({ installDir: REPO, lnkDir: mk('lnk') });
    const sc = made.ok ? readShortcut(made.lnk) : null;
    check('shortcut: the launcher .lnk is wscript //B //Nologo open-editor.vbs <node>, working dir = the repo', !!sc && /wscript\.exe$/i.test(sc.target) && /open-editor\.vbs/i.test(sc.args) && path.resolve(sc.dir).toLowerCase() === REPO.toLowerCase(), JSON.stringify(sc));
    if (sc) {
      const before = stub().length;
      const c = spawn(sc.target, [sc.args], { cwd: sc.dir, windowsVerbatimArguments: true, windowsHide: true, stdio: 'ignore' }); // what a double click on the shortcut runs
      c.unref();
      shortcutRan = !!(await until(() => stub().length > before, 40000));
    }
  }
  if (!shortcutRan) { const r = spawnSync(process.execPath, [path.join(REPO, 'launcher', 'open-editor.mjs')], { env: process.env, windowsHide: true, timeout: 60000 }); shortcutRan = r.status === 0 && !!lastUrl(); }
  const tool = lastUrl();
  check('shortcut: the launcher handed the browser ONE file:// URL', shortcutRan && /^file:\/\/\//.test(tool), tool);
  check('shortcut: that URL is the TOOL editor (start.editor.html in the state folder), not the newest saved document', /\/launcher\/start\.editor\.html$/.test(tool) && tool !== docUrl, tool);
  const html = fs.existsSync(new URL(tool)) ? fs.readFileSync(new URL(tool), 'utf8') : '';
  const recJson = (() => { try { return JSON.parse(/id="bw-recents">([^<]*)</.exec(html)?.[1] || 'null'); } catch { return null; } })();
  check('shortcut: it carries the document-type payload (#bw-doctypes) and the saved document in #bw-recents', /id="bw-doctypes"/.test(html) && recJson?.rows?.some((r) => r.file === docFile && r.url === docUrl), `types=${/id="bw-doctypes"/.test(html)} recents=${JSON.stringify(recJson).slice(0, 160)}`);
  for (const ui of ['en', 'ar']) {
    const { page, ctx, errors } = await person(tool, { ui });
    const r = await landed(page);
    check(`shortcut (${ui}): the page lands on the start page (data-bw-start=open, the view is there)`, r.start === 'open' && r.dlg, JSON.stringify(r));
    check(`shortcut (${ui}): it is the template, not a document (service ${r.svc})`, !r.isDoc && /\/start\.editor\.html$/.test(r.url));
    check(`shortcut (${ui}): the last saved document is in Recents`, r.rec.some((x) => x.id.startsWith('disk:') && x.text.includes(path.basename(docFile, '.html'))), JSON.stringify(r.rec));
    check(`shortcut (${ui}): no page error`, !errors.length, errors.join(' | ').slice(0, 200));
    if (ui === 'en') {
      await page.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start [data-st-open]'); b.click(); });
      const went = await until(() => page.url() === docUrl, 15000);
      check('shortcut: clicking the recent document opens THAT file (the same file:// URL)', !!went, page.url());
      await page.waitForFunction(() => window.BW?.ready, null, { timeout: 30000 });
      const d = await landed(page);
      check('shortcut: and it opens as the document (a `doc-` service), the start page stays closed', d.isDoc && d.start === 'closed' && !d.dlg, JSON.stringify(d));
    }
    await ctx.close();
  }

  // ── 2. a specific file: a saved document named on the command line (double click on it) ──
  {
    const before = stub().length;
    const r = spawnSync(process.execPath, [path.join(REPO, 'launcher', 'open-editor.mjs'), docFile], { env: process.env, windowsHide: true, timeout: 60000 });
    check('file argument: the launcher opens exactly that file (the stub browser got its URL)', r.status === 0 && stub().length === before + 1 && lastUrl() === docUrl, lastUrl());
    const { page, ctx } = await person(lastUrl());
    const d = await landed(page);
    check('file argument: it opens as the document, no start page', d.isDoc && d.start === 'closed' && !d.dlg, JSON.stringify(d));
    await ctx.close();
  }

  // ── 3. the served host: a plain business-wrap://start (what the host switch hands over when no file is known) ──
  const handle = (url) => {
    const h = spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), 'handle', url, '--json'], { env: process.env, encoding: 'utf8', windowsHide: true, timeout: 90000 });
    let out = null; try { out = JSON.parse(h.stdout.trim().split(/\r?\n/).pop()); } catch { /* shown below */ }
    if (out?.pid) started.push(out.pid);
    return { h, out };
  };
  {
    const { h, out } = handle('business-wrap://start');
    check('host: `handle business-wrap://start` starts a host on the free port', h.status === 0 && out?.action === 'start' && out.port === port && (await until(() => up(port))) === true, `${h.status} ${h.stdout} ${h.stderr}`.slice(0, 300));
    const served = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    check('host: it serves the TOOL (the blank editor with the document-type payload), not the newest saved document', /id="bw-doctypes"/.test(served) && !served.includes(saved.id), `types=${/id="bw-doctypes"/.test(served)}`);
    const last = { runId: 'r1', at: new Date().toISOString(), tabs: [{ tab: 't-old', title: 'Last time', at: new Date().toISOString(), ed: 'en', svc: saved.id }], older: [] };
    const a = await person(`http://127.0.0.1:${port}/`, { init: { last } });
    const ra0 = await landed(a.page);
    check('host: with something to resume, the «continue where you left off» popup opens by itself (as in 0.18.1)', ra0.resume === 'asked' && ra0.resumeDlg && !ra0.isDoc, JSON.stringify({ r: ra0.resume, d: ra0.resumeDlg }));
    const ra = await dismissPopup(a.page);
    check('host: closing the popup leaves the served page on the start page', ra.had && ra.start === 'open' && ra.dlg && !ra.isDoc, JSON.stringify(ra));
    check('host: the saved document is in Recents (the host\'s library mirror)', !!(await until(async () => (await a.page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start [data-recent]')].length)) > 0, 15000)));
    await a.ctx.close();
    const b = await person(`http://127.0.0.1:${port}/`, { init: { last, off: true } });
    const rb = await landed(b.page);
    check('host: with the start page switched off in Settings the resume question still opens (nothing is lost)', rb.start === 'closed' && rb.resume === 'asked' && rb.resumeDlg, JSON.stringify(rb));
    await b.ctx.close();

    // the host's way back: returnTo names a document (the one being edited during the toggle): that file is opened on disk at the same geometry
    const before = stub().length;
    const stop = await fetch(`http://127.0.0.1:${port}/api/servers/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, returnTo: { x: 11, y: 22, w: 900, h: 700, file: docFile } }) });
    const sj = await stop.json().catch(() => ({}));
    const rec = stub().slice(before).find((r) => r.launcher);
    // the host reopens the REAL path (validateFile resolves 8.3 short names such as RUNNER~1 and junctions): compare the same file by realpath, not by the spelling the test built it with
    const docReal = fs.realpathSync.native(docFile);
    check('returnTo: a document named in it is reopened on disk, at the same geometry, as that file', stop.ok && rec?.args?.at(-1) === pathToFileURL(docReal).href && rec.args.includes('--window-position=11,22') && sj.reopened?.file === docReal, JSON.stringify({ sj, rec }).slice(0, 300));
    await until(async () => !(await up(port)), 15000);
  }

  // ── 4. the host switch from the shortcut's tool editor: business-wrap://start?file=<that file> serves it, and the page lands on the start page ──
  {
    const { h, out } = handle(`business-wrap://start?file=${encodeURIComponent(fileUrlToPath(tool))}`);
    check('switch: `start?file=<tool editor>` starts the host on that file', h.status === 0 && out?.action === 'start' && out.file?.toLowerCase().endsWith('start.editor.html') && (await until(() => up(port))) === true, `${h.stdout} ${h.stderr}`.slice(0, 300));
    const a = await person(`http://127.0.0.1:${port}/?via=disk&from=${encodeURIComponent(fileUrlToPath(tool))}`);
    const ra = await dismissPopup(a.page); // the host holds earlier sessions: the popup is first, then the start page
    check('switch: the served page lands on the start page and keeps its way back (bw:disk = the tool editor file)', ra.start === 'open' && ra.dlg && !ra.isDoc && /start\.editor\.html/i.test(await a.page.evaluate(() => sessionStorage.getItem('bw:disk') || '')), JSON.stringify(ra));
    await a.ctx.close();
    // the way back for a plain tool open: the host switched off from that page reopens the tool editor on disk (the start page again)
    const before = stub().length;
    const stop = await fetch(`http://127.0.0.1:${port}/api/servers/stop`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, returnTo: { x: 5, y: 6, w: 1000, h: 700, file: fileUrlToPath(tool) } }) });
    const rec = stub().slice(before).find((r) => r.launcher);
    check('switch: turning the host off reopens the tool editor on disk (the start page)', stop.ok && /\/launcher\/start\.editor\.html$/.test(rec?.args?.at(-1) || ''), JSON.stringify(rec));
    await until(async () => !(await up(port)), 15000);
  }
} catch (e) {
  check('suite ran to the end', false, String(e?.stack || e).slice(0, 500));
} finally {
  await closeAll();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
S.finish();

function fileUrlToPath(u) { return decodeURIComponent(new URL(u).pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, path.sep); }
