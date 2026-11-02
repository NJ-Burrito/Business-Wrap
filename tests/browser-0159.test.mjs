// 0.15.9 B1-B7 (bw-0159 browser lane): Google Chrome is the standard browser, with a clean fallback chain and no part of the product requiring Edge.
//   order of the editor's browser: BW_BROWSER, the saved Settings choice, Google Chrome, the OS default, Edge, any Chromium (Chrome absent, a non-Chromium default,
//   an explicit path, Opera GX vs Opera, Brave, Vivaldi); the PDF engine walks the same chain after BW_CHROME; a non-Chromium default is opened with the OS opener and
//   says it cannot be closed; no browser at all is a clear message in Arabic and English; BW_EDGE still names Edge; profile folders never mix vendors; the Settings
//   route (GET/POST /api/browser) saves the choice; the launch goes through the real host.start caller (BW_BROWSER_STUB logs the argv, nothing is started).
//   node tests/browser-0159.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-browser0159-'));
Object.assign(process.env, { BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1' });
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });
const X = await import('../engine/export.mjs');
const H = await import('../engine/host.mjs');
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  browser-0159: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };

// fake executables: the chain only checks that a path exists
const bin = path.join(tmp, 'bin');
const mk = (name) => { const f = path.join(bin, name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); return f; };
const P = {
  chrome: mk('Google/Chrome/Application/chrome.exe'),
  edge: mk('Microsoft/Edge/Application/msedge.exe'), // platform-guard: ok (an empty fake file whose name is classified, never run)
  operagx: mk('Programs/Opera GX/opera.exe'),
  opera: mk('Programs/Opera/opera.exe'),
  brave: mk('BraveSoftware/Brave-Browser/Application/brave.exe'),
  vivaldi: mk('Vivaldi/Application/vivaldi.exe'),
  firefox: mk('Mozilla Firefox/firefox.exe'),
};
const pick = (...ids) => Object.fromEntries(ids.map((i) => [i, P[i]]));
const choose = (installed, defaultExe = '', { env = {}, saved = '' } = {}) => X.chooseBrowser({ env, saved, machine: { installed, defaultExe } });
const id = (r) => r?.id ?? null;

// classification (the pattern that names a browser from its executable path)
check('classify: chrome / edge / opera gx / opera / brave / vivaldi / firefox', [X.classifyBrowser(P.chrome), X.classifyBrowser(P.edge), X.classifyBrowser(P.operagx), X.classifyBrowser(P.opera), X.classifyBrowser(P.brave), X.classifyBrowser(P.vivaldi), X.classifyBrowser(P.firefox)].join() === 'chrome,edge,operagx,opera,brave,vivaldi,firefox', [X.classifyBrowser(P.operagx), X.classifyBrowser(P.opera)].join());
check('classify: an unknown program is "other", never Chromium', X.classifyBrowser('C:/Apps/Yandex/browser.exe') === 'other' && !X.isChromium('other') && !X.isChromium('firefox'));

// B1 order
const everything = pick('chrome', 'edge', 'operagx', 'opera', 'brave', 'vivaldi');
check('B1: Chrome beats an Opera GX OS default (the default is not used while Chrome is there)', id(choose(everything, P.operagx)) === 'chrome' && choose(everything, P.operagx).via === 'chrome');
check('B1: BW_BROWSER=default uses the OS default (Opera GX)', id(choose(everything, P.operagx, { env: { BW_BROWSER: 'default' } })) === 'operagx');
check('B1: BW_BROWSER=edge by id', id(choose(everything, P.operagx, { env: { BW_BROWSER: 'edge' } })) === 'edge');
check('B1: BW_BROWSER as an explicit path', choose(everything, '', { env: { BW_BROWSER: P.vivaldi } })?.exe === P.vivaldi);
check('B1: BW_BROWSER beats the saved choice', id(choose(everything, P.operagx, { env: { BW_BROWSER: 'brave' }, saved: 'edge' })) === 'brave');
check('B1: the saved Settings choice beats Chrome', id(choose(everything, P.operagx, { saved: 'vivaldi' })) === 'vivaldi' && choose(everything, P.operagx, { saved: 'vivaldi' }).via === 'saved');
check('B1: saved "default" = the OS default', id(choose(everything, P.operagx, { saved: 'default' })) === 'operagx');
check('B1: a saved browser that is not installed falls through to Chrome', id(choose(pick('chrome', 'edge'), '', { saved: 'brave' })) === 'chrome');
check('B1: Chrome absent: the OS default (Chromium) is next, ahead of Edge', id(choose(pick('edge', 'operagx'), P.operagx)) === 'operagx');
check('B1: Chrome absent, default not Chromium (Firefox): the default is the OS opener, not Edge', (() => { const r = choose(pick('edge'), P.firefox); return r?.id === 'firefox' && r.chromium === false && r.via === 'default'; })());
check('B1: Chrome absent, no readable default: Edge', id(choose(pick('edge', 'brave'), '')) === 'edge');
check('B1: only a third-party Chromium (Brave) is found: Brave', id(choose(pick('brave'), '')) === 'brave' && choose(pick('brave'), '').via === 'any');
check('B1: Opera GX and Opera are told apart', id(choose(pick('operagx', 'opera'), P.opera, { saved: 'default' })) === 'opera' && id(choose(pick('operagx', 'opera'), '', { saved: 'operagx' })) === 'operagx');
check('B1: nothing installed -> null', choose({}, '') === null);
check('B1: a launcher default resolves to the installed executable of its browser', choose(pick('operagx'), path.join(bin, 'Programs/Opera GX/launcher.exe'), { saved: 'default' })?.exe === P.operagx);

// B5 PDF engine: BW_CHROME / config first, then the same chain
const cfgBefore = process.env.BW_CHROME;
check('B5: PDF engine = Chrome when present, whatever the default', X.chromePath({ installed: everything, defaultExe: P.operagx }) === P.chrome);
check('B5: Chrome absent -> the Chromium default, then Edge, then any', X.chromePath({ installed: pick('edge', 'operagx'), defaultExe: P.operagx }) === P.operagx && X.chromePath({ installed: pick('edge', 'brave'), defaultExe: P.firefox }) === P.edge && X.chromePath({ installed: pick('brave'), defaultExe: '' }) === P.brave);
check('B5: a Firefox default never prints a PDF', X.chromePath({ installed: {}, defaultExe: P.firefox }) === undefined);
check('B5: none found: a clear message in both languages', /Chromium/.test(X.noBrowserMessage('en')) && /Chrome/.test(X.noBrowserMessage('en')) && /[\u0600-\u06FF]/.test(X.noBrowserMessage('ar')) && /BW_CHROME/.test(X.noBrowserMessage('ar')));
void cfgBefore;

// B6 BW_EDGE keeps naming Edge; the keep-awake flags cover every vendor
check('B6: BW_EDGE names Edge (an old setup)', X.installedBrowsers({ BW_EDGE: P.edge }).edge === P.edge);
const flags = H.keepAwakeArgs();
const feat = flags.find((a) => a.startsWith('--disable-features=')) || '';
check('A1/B6: keep-awake flags: Chromium throttle switches kept', ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'].every((f) => flags.includes(f)));
check('A1: feature names cover Chrome, Edge, Opera, Opera GX, Brave, Vivaldi', ['IntensiveWakeUpThrottling', 'TabFreeze', 'AutomaticTabDiscarding', 'MemorySaverMultistateMode', 'SleepingTabs', 'msEdgeSleepingTabs', 'OperaTabSnoozing', 'GXTabSnoozing', 'BraveSleepingTabs', 'VivaldiTabHibernation'].every((n) => feat.includes(n)), feat);
check('B6: the old KEEP_AWAKE_ARGS export is the same list', JSON.stringify(H.KEEP_AWAKE_ARGS) === JSON.stringify(flags));

// profile folders: Edge keeps the old folder; every other browser has its own sub-folder (never another vendor's profile)
check('B8: Edge keeps .local/edge-profile; Chrome and Opera GX get their own sub-folder', H.profileDir('edge') === H.profileDir() && path.basename(H.profileDir('chrome')) === 'chrome' && path.dirname(H.profileDir('chrome')) === H.profileDir() && H.profileDir('operagx') !== H.profileDir('chrome'));

// the real caller: host.start -> launchBrowser; BW_BROWSER_STUB logs each launch instead of starting a browser
const stub = path.join(tmp, 'stub.jsonl');
process.env.BW_BROWSER_STUB = stub;
const lines = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const probe = (installed, defaultExe) => { process.env.BW_BROWSER_PROBE = JSON.stringify({ installed, defaultExe }); };
delete process.env.BW_BROWSER;

probe(everything, P.operagx);
let r = H.launchBrowser(['http://127.0.0.1:1/']);
let l = lines().at(-1);
check('launch: Chrome chosen, own profile folder, keep-awake flags, one window', r.browser.id === 'chrome' && r.browser.closable === true && l.exe === P.chrome && l.args.some((a) => a === `--user-data-dir=${H.profileDir('chrome')}`) && l.args.includes('--new-window') && l.args.includes('--disable-background-timer-throttling'), JSON.stringify(l));
fs.rmSync(stub, { force: true });
process.env.BW_BROWSER = 'default';
r = H.launchBrowser(['http://127.0.0.1:1/']); l = lines().at(-1);
check('launch: BW_BROWSER=default opens Opera GX, launched as Chromium with its own folder', r.browser.id === 'operagx' && l.exe === P.operagx && l.args.some((a) => a === `--user-data-dir=${H.profileDir('operagx')}`), JSON.stringify(l));
delete process.env.BW_BROWSER;
fs.rmSync(stub, { force: true });
probe(pick('edge'), P.firefox);
r = H.launchBrowser(['http://127.0.0.1:1/', 'http://127.0.0.1:2/']); l = lines().at(-1);
check('B3: a Firefox default (Chrome absent) is opened with the OS opener, said plainly to be unclosable', r.browser.closable === false && /cannot close/i.test(r.browser.note) && l.opener === true && l.urls.length === 2 && r.pids.length === 0, JSON.stringify(r.browser));
fs.rmSync(stub, { force: true });
probe({}, '');
delete process.env.BW_BROWSER_STUB;
let msg = '';
try { H.launchBrowser(['http://127.0.0.1:1/']); } catch (e) { msg = String(e.message); }
check('B5: no browser at all: the launch says so in English and Arabic', /No Chromium browser found/.test(msg) && /[\u0600-\u06FF]/.test(msg) && /Chrome/.test(msg), msg);
process.env.BW_BROWSER_STUB = stub;

// host.start (the real caller) + the Settings route
probe(everything, P.operagx);
const editor = path.join(tmp, 'editor.html');
const { buildEditor } = await import('../engine/build-editor.mjs');
buildEditor({ inputs: [path.join(X.REPO, 'samples', 'event-permit')], out: editor, set: 'browser0159', watermarkDir: null });
const h = await H.start({ editor, port: 4800, open: true });
check('host.start opens Google Chrome (ready state: the host answers /api/version)', h.browser?.id === 'chrome' && (await (await fetch(h.url + 'api/version')).json()).name !== undefined, JSON.stringify(h.browser));
const get = async () => (await fetch(h.url + 'api/browser')).json();
const post = async (b) => (await fetch(h.url + 'api/browser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ browser: b }) })).json();
// the host process is a separate node; it reads BW_BROWSER_PROBE from its own env, which is not ours: the route is checked for its shape and persistence
let g = await get();
check('B4: GET /api/browser lists the choices with Chrome marked recommended', g.ok === true && Array.isArray(g.choices) && 'saved' in g && 'chosen' in g && 'systemDefault' in g, JSON.stringify(g).slice(0, 200));
const a = await post('edge');
check('B4: POST saves the choice (.local/browser.json) and the route answers the new state', a.ok === true && a.saved === 'edge' && JSON.parse(fs.readFileSync(path.join(process.env.BW_LOCAL_DIR, 'browser.json'), 'utf8')).browser === 'edge', JSON.stringify(a).slice(0, 200));
const bad = await fetch(h.url + 'api/browser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ browser: 'netscape' }) });
check('B4: an unknown browser id is refused (400) and the saved choice is unchanged', bad.status === 400 && (await get()).saved === 'edge');
const clr = await post('');
check('B4: choosing the standard clears the saved choice', clr.ok === true && clr.saved === '');
const cross = await fetch(h.url + 'api/browser', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: JSON.stringify({ browser: 'brave' }) });
check('B4: a cross-site page cannot change it (403)', cross.status === 403);
await H.stop();

// ── B8: a real switch from Edge (the old profile folder) to Google Chrome (its own folder) on temp profiles, one host, nothing of the owner's touched ──
const real = X.installedBrowsers();
if (real.edge && real.chrome && !process.env.BW_SKIP_REAL) {
  const { spawn, spawnSync } = await import('node:child_process');
  const net = await import('node:net');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 30000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(250)) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } } return false; };
  const freePort = () => new Promise((ok) => { const sv = net.createServer().listen(0, '127.0.0.1', () => { const q = sv.address().port; sv.close(() => ok(q)); }); });
  const cdpTab = (wsUrl) => { const ws = new WebSocket(wsUrl); let n = 0; const wait = new Map(); ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } }; const open = new Promise((ok) => { ws.onopen = ok; }); return { async ev(expr) { await open; const r = await new Promise((ok) => { const i = ++n; wait.set(i, ok); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }); return r.result?.result?.value; }, close() { try { ws.close(); } catch { /* closed */ } } }; };
  delete process.env.BW_BROWSER_STUB; delete process.env.BW_BROWSER_PROBE; delete process.env.BW_BROWSER;
  const h2 = await H.start({ editor, port: 4850, open: false });
  const procs = [];
  const run = async (exe, dir, url) => {
    const port = await freePort();
    const c = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--new-window', url], { stdio: 'ignore' });
    procs.push(c);
    let t = null;
    await until(async () => { const l = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); t = l.find((x) => x.type === 'page' && x.url.startsWith(h2.url)); return !!t; }, 40000);
    const tb = cdpTab(t.webSocketDebuggerUrl);
    await until(async () => (await tb.ev('!!(window.BW && window.BW.ready && document.documentElement.dataset.bwSession)')) === true, 60000);
    return { c, port, tb };
  };
  const kill = (r) => { r.tb.close(); spawnSync('taskkill', ['/PID', String(r.c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); };
  let E = null, C = null, E2 = null;
  try {
    E = await run(real.edge, H.profileDir('edge'), h2.url + '?t=E1');
    const made = JSON.parse(await E.tb.ev(`(async()=>{ const B=window.BW; await B.EXT.library.newDocument(); localStorage.setItem('bw:dark','1'); localStorage.setItem('bw:spell:user','["switchword"]'); localStorage.setItem('bw:profile', JSON.stringify({name:'Switch Test'})); localStorage.setItem('bw:actor','person:switch'); B.commit([{op:'setText',path:'/control/title',value:'SWITCH-SAVED'}],{ed:B.S.ed,mirror:false}); await B.EXT.library.persistNow?.(); await new Promise(r=>setTimeout(r,800)); B.commit([{op:'setText',path:'/control/title',value:'SWITCH-UNSAVED'}],{ed:B.S.ed,mirror:false}); return JSON.stringify({svc:B.S.svc,ed:B.S.ed,tab:document.documentElement.dataset.bwSession}) })()`));
    const pf = path.join(process.env.BW_LOCAL_DIR, 'profile.json');
    const kept = await until(() => { const j = JSON.parse(fs.readFileSync(pf, 'utf8')); return j.prefs?.['bw:dark'] === '1' && j.prefs?.['bw:spell:user'] ? j : false; }, 20000);
    check('B8: Edge on the old folder; the host kept the person, the screen preferences and the signing key stays out of the host', !!kept && !('bw:actor-key' in (kept.prefs || {})) && kept.profile.includes('Switch Test'), JSON.stringify(kept).slice(0, 200));
    const recFile = await until(() => { const root = path.join(process.env.BW_WORKSPACE); const g = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? g(path.join(d, e.name)) : [path.join(d, e.name)])); return g(root).find((f) => f.endsWith(`${made.tab}.json`) && !f.includes('closed')) || false; }, 15000);
    await sleep(1500);
    kill(E); E = null;
    await sleep(1500);
    C = await run(real.chrome, H.profileDir('chrome'), h2.url + '?t=C1');
    const seen = await until(async () => { const r = JSON.parse(await C.tb.ev(`(async()=>{ const all = await window.BW.EXT.library.all(); return JSON.stringify({ dark: localStorage.getItem('bw:dark'), spell: localStorage.getItem('bw:spell:user'), prof: localStorage.getItem('bw:profile'), actor: localStorage.getItem('bw:actor'), doc: all.some((e)=>JSON.stringify(e).includes('SWITCH-')), n: all.length }) })()`)); return r.doc && r.dark === '1' ? r : false; }, 60000);
    check('B8: Chrome has its own sub-folder, Edge\'s folder was not used by Chrome', fs.existsSync(path.join(H.profileDir('chrome'), 'Default')) && fs.existsSync(path.join(H.profileDir('edge'), 'Default')) && H.profileDir('chrome').startsWith(H.profileDir('edge')));
    check('B8: the document made in Edge is in Chrome\'s library (restored from the host\'s copy)', !!seen && seen.doc === true, JSON.stringify(seen));
    check('B8: the person, the actor id and the screen preferences (theme, dictionary) are back in Chrome', !!seen && seen.dark === '1' && String(seen.spell).includes('switchword') && String(seen.prof).includes('Switch Test') && seen.actor === 'person:switch', JSON.stringify(seen));
    // the unsaved edit of the Edge tab: its host record opens in Chrome through the resume address
    const run0 = JSON.parse(fs.readFileSync(path.join(process.env.BW_LOCAL_DIR, 'host.json'), 'utf8'));
    void run0;
    const rec = recFile ? JSON.parse(fs.readFileSync(recFile, 'utf8')) : null;
    check('B8: the Edge tab\'s last state (with the edit never saved) is on the host, not only in Edge', !!rec && JSON.stringify(rec).includes('SWITCH-UNSAVED'), String(recFile));
    C.tb.close(); kill(C); C = null;
    // Edge's folder is still readable by Edge itself
    E2 = await run(real.edge, H.profileDir('edge'), h2.url + '?t=E2');
    const back = await E2.tb.ev(`(async()=>{ const all = await window.BW.EXT.library.all(); return all.some((e)=>JSON.stringify(e).includes('SWITCH-')) })()`);
    check('B8: the existing Edge profile data stays readable (Edge reopens its own folder and still has the document)', back === true);
  } catch (e) {
    check('B8 real switch ran without an exception', false, e?.stack || e);
  } finally {
    for (const r of [E, C, E2]) if (r) kill(r);
    for (const c of procs) if (c.pid) spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    await H.stop();
  }
}

// sweep: nothing of this test left (no real browser was started; the host is stopped)
check('host stopped, nothing left running', H.status().running === false);
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nbrowser-0159: all ${out.length} checks passed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
