// 0.17.8 note O2: the host switch keeps ONE window. Turning the host ON in the editor opened from disk (file://) replaces that page, in place, with the served
// editor (the host serves that same file); turning it OFF in that served tab opens the editor from disk as a new window at the served window's geometry and
// closes the served tab (an http page cannot navigate to file://). Sandbox only: temp state, a free port, BW_BROWSER_STUB (no browser is launched by the host),
// no registry, no Desktop, never the real host on 4317.
//   node tests/window-0178.test.mjs
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { launch, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  window: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = tmpDir('bw-window-');
const stub = path.join(tmp, 'browser.jsonl');
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, 'local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_POWER_GRACE_MS: '300', BW_NO_BROWSER: '1', BW_NO_PROTOCOL: '1', BW_BROWSER_STUB: stub };
Object.assign(process.env, { BW_LOCAL_DIR: env.BW_LOCAL_DIR, BW_STATE_DIR: env.BW_STATE_DIR, BW_WORKSPACE: env.BW_WORKSPACE, BW_NO_PROTOCOL: '1', BW_BROWSER_STUB: env.BW_BROWSER_STUB });
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const up = async (port) => { try { return (await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1200) })).ok; } catch { return false; } };
const CLI = path.join(REPO, 'update', 'cli.mjs');
const handler = (url, extra = {}) => spawnSync(process.execPath, [CLI, 'handle', url, '--json'], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 90000, windowsHide: true });
const editor = path.join(tmp, 'my docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });
const stubLines = () => (fs.existsSync(stub) ? fs.readFileSync(stub, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const P = await free();
let browser;
try {
  // ── 1. the URL and the launcher (no browser, no host) ──
  const { parseUrl, validateFile } = await import('../engine/protocol.mjs');
  const { geometryArgs, openEditor } = await import('../launcher/open-editor.mjs');
  const pu = parseUrl(`business-wrap://start?file=${encodeURIComponent(editor)}`);
  let refused = 0;
  for (const bad of ['business-wrap://start?x=1', `business-wrap://start?file=a&file=b`, 'business-wrap://stop?file=a']) { try { parseUrl(bad); } catch (e) { if (e.code === 2) refused += 1; } }
  check('protocol: start takes no argument or exactly one file; anything else is refused', pu.action === 'start' && pu.file === editor && parseUrl('business-wrap://start').action === 'start' && refused === 3, `${JSON.stringify(pu)} ${refused}`);
  check('launcher: geometry becomes --new-window --window-position --window-size; nonsense gives no flags', JSON.stringify(geometryArgs({ x: -1900, y: 20, w: 1200, h: 800 })) === JSON.stringify(['--new-window', '--window-position=-1900,20', '--window-size=1200,800']) && geometryArgs({ x: 'a', y: 0, w: 1, h: 1 }).length === 0 && geometryArgs({ x: 0, y: 0, w: 50, h: 50 }).length === 0);
  const o = await openEditor({ file: editor, geometry: { x: 10, y: 20, w: 900, h: 700 } });
  const l0 = stubLines().at(-1);
  check('launcher: openEditor passes the geometry before the file:// URL (stub browser)', l0?.launcher && l0.args.at(-1) === pathToFileURL(editor).href && l0.args.includes('--window-position=10,20') && l0.args.includes('--window-size=900,700') && o.host === false, JSON.stringify(l0));
  fs.writeFileSync(stub, '');

  // ── 2. ENTRY_SMOKE: the real handler, start with the page's own file, then stop ──
  const bad = handler(`business-wrap://start?file=${encodeURIComponent(path.join(tmp, 'nope.html'))}`, { BW_OPEN_PORT: String(P) });
  const jb = JSON.parse((bad.stdout || '{}').trim().split('\n').pop() || '{}');
  check('handler: a file that fails the checks does not block the host; the answer says it was ignored', bad.status === 0 && jb.action === 'start' && !!jb.fileIgnored && (await up(P)), `${bad.status} ${bad.stderr} ${bad.stdout}`.slice(0, 300));
  handler('business-wrap://stop');
  await until(async () => !(await up(P)), 15000);

  // ── 3. the pages: file:// -> served in the SAME page, then back ──
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.addInitScript((ports) => {
    window.__bwProbePorts = ports;
    window.__launched = [];
    window.__closed = 0;
    window.close = () => { window.__closed += 1; };
    document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
  }, [P]);
  await page.goto(pathToFileURL(editor).href);
  await page.waitForFunction(() => window.BW?.ready);
  await until(async () => (await shRoot(page, (r) => r.querySelector('.island .srv-toggle')?.dataset.st)) === 'offline', 8000);
  await shRoot(page, (r) => r.querySelector('.island .srv-toggle').click());
  await until(async () => (await page.evaluate(() => window.__launched)).length > 0, 5000);
  const asked = (await page.evaluate(() => window.__launched))[0] || '';
  check('on: the file:// page hands business-wrap://start?file=<its own path>', asked.startsWith('business-wrap://start?file=') && path.resolve(decodeURIComponent(asked.split('?file=')[1])) === path.resolve(editor), asked);
  const h = handler(asked, { BW_OPEN_PORT: String(P) });
  const jh = JSON.parse((h.stdout || '{}').trim().split('\n').pop() || '{}');
  check('on: the real handler serves that very file on the sandbox port, opens no browser', h.status === 0 && jh.port === P && fs.realpathSync.native(jh.file) === fs.realpathSync.native(editor) && jh.browser === false && stubLines().length === 0, `${h.status} ${h.stderr} ${h.stdout}`.slice(0, 300));
  const replaced = await until(() => page.url().startsWith(`http://127.0.0.1:${P}/`), 20000);
  check('on: the SAME page is replaced by the served editor (no second page or window in the context)', replaced && ctx.pages().length === 1, `${page.url()} pages=${ctx.pages().length}`);
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 20000 });
  const mark = await page.evaluate(() => ({ url: location.search, disk: sessionStorage.getItem('bw:disk'), hist: history.length }));
  check('on: the served tab remembers it came from disk, the URL is clean again', mark.url === '' && JSON.parse(mark.disk || '{}').file !== undefined && path.resolve(JSON.parse(mark.disk).file) === path.resolve(editor), JSON.stringify(mark));
  await until(async () => (await shRoot(page, (r) => r.querySelector('.island .srv-toggle')?.dataset.st)) === 'online', 8000);

  const geo = await page.evaluate(() => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight }));
  await shRoot(page, (r) => r.querySelector('.island .srv-toggle').click());
  const back = await until(() => stubLines().length > 0, 15000);
  const line = stubLines().at(-1) || {};
  check('off: the host opens the file:// editor as a new window with the served window\'s geometry', back && line.launcher && line.args.at(-1) === pathToFileURL(editor).href && line.args.includes(`--window-position=${geo.x},${geo.y}`) && line.args.includes(`--window-size=${geo.w},${geo.h}`), JSON.stringify([geo, line]));
  check('off: the host goes away (host only) and the served tab closes itself', await until(async () => !(await up(P)), 15000) && (await until(async () => (await page.evaluate(() => window.__closed).catch(() => 0)) >= 1, 5000)));

  // a served tab that did NOT come from disk keeps the old behaviour: nothing reopened, the page stays
  const fresh = await ctx.newPage();
  await fresh.addInitScript(() => { window.close = () => { window.__closed = (window.__closed || 0) + 1; }; });
  const h2 = handler('business-wrap://start', { BW_OPEN_PORT: String(P) });
  fs.writeFileSync(stub, '');
  await fresh.goto(`http://127.0.0.1:${P}/`);
  await fresh.waitForFunction(() => window.BW?.ready, null, { timeout: 20000 });
  await until(async () => (await shRoot(fresh, (r) => r.querySelector('.island .srv-toggle')?.dataset.st)) === 'online', 8000);
  await shRoot(fresh, (r) => r.querySelector('.island .srv-toggle').click());
  await until(async () => !(await up(P)), 15000);
  await sleep(2600);
  check('off: a served tab that did not come from disk reopens nothing and stays (Offline)', h2.status === 0 && stubLines().length === 0 && !(await fresh.evaluate(() => window.__closed || 0)) && (await shRoot(fresh, (r) => r.querySelector('.island .srv-toggle')?.dataset.st)) === 'offline');
  check('no page error', page.errors.length === 0, page.errors.join(' | '));
} catch (e) {
  check('suite ran to the end', false, String(e?.stack || e).slice(0, 400));
} finally {
  try { await browser?.close(); } catch { /* none */ }
  handler('business-wrap://stop');
  await until(async () => !(await up(P)), 15000);
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nwindow-0178: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
