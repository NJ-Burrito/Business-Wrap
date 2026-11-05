// 0.17.13 (owner note 3): a copy without node_modules (zip, plugin folder) cannot export: «Cannot find package 'playwright-core' imported from …\engine\export.mjs».
//   engine/deps.mjs      depsStatus() with a fake missing dependency (BW_DEPS_ROOT = an empty folder), the error pattern, installDeps() with a stand-in "npm"
//   /api/health          reports deps {ok, missing}; /api/host/health too; the stdout line at host start is serve.mjs's (not run here)
//   /api/deps/install    a foreign Origin is refused (403); GET /api/deps
//   the editor           one notice (AR, then EN) with «ثبّت الآن» / "Install now" and the manual command; an export that fails with the raw error shows the same notice, not the path
//
//   node tests/deps-0171.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { launch, tmpDir, shRoot, sleep, until, REPO } from './spell-helper.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  deps: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = tmpDir('bw-deps-');
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const bare = path.join(tmp, 'bare'); // a "copy" with nothing installed
fs.mkdirSync(path.join(bare, 'engine'), { recursive: true });
const editor = path.join(tmp, 'docs', 'sample.editor.html');
fs.mkdirSync(path.dirname(editor), { recursive: true });
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'sample' });
const D = await import('../engine/deps.mjs');
const X = await import('../engine/export.mjs');
const toastTexts = (page) => shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast')].map((x) => x.textContent.trim()));
let browser, server;
try {
  // 1. the check itself
  check('this repository: playwright-core resolves (deps.ok)', D.depsStatus().ok === true && D.depsStatus().missing.length === 0);
  process.env.BW_DEPS_ROOT = bare;
  const miss = D.depsStatus();
  check('a root with nothing installed: ok false, missing [playwright-core]', miss.ok === false && miss.missing.join() === 'playwright-core', JSON.stringify(miss));
  let err = null;
  try { X.resetPlaywright(); await X.loadPlaywright(); } catch (e) { err = e; }
  check('loadPlaywright() fails there with the same Node error (ERR_MODULE_NOT_FOUND, Cannot find package playwright-core imported from export.mjs)', err?.code === 'ERR_MODULE_NOT_FOUND' && /Cannot find package 'playwright-core' imported from .*export\.mjs/.test(err.message), String(err?.message));
  check('the error pattern matches Node\'s own text and the code, not other errors', D.isMissingDepError(err.message) && D.isMissingDepError("Cannot find package 'playwright-core' imported from D:\\bw-copy\\engine\\export.mjs") && !D.isMissingDepError('ENOENT: no such file') && !D.isMissingDepError("Cannot find package 'zod'"));

  // 2. installDeps with a stand-in npm: `node ci` runs ./ci in the root and writes the package, like npm ci would
  fs.writeFileSync(path.join(bare, 'package-lock.json'), '{}');
  fs.writeFileSync(path.join(bare, 'ci'), "const fs=require('fs');fs.mkdirSync('node_modules/playwright-core',{recursive:true});fs.writeFileSync('node_modules/playwright-core/package.json','{\"name\":\"playwright-core\"}');console.log('added 1 package');");
  const okRun = await D.installDeps({ root: bare, npm: process.execPath, shell: false, timeoutMs: 20000 });
  check('installDeps: the lock file picks `npm ci --omit=dev --no-audit --no-fund`, the run succeeds, the package is then found', okRun.ok === true && /^npm ci --omit=dev --no-audit --no-fund$/.test(okRun.command) && D.depsStatus(bare).ok, JSON.stringify(okRun));
  fs.rmSync(path.join(bare, 'node_modules'), { recursive: true, force: true });
  fs.rmSync(path.join(bare, 'package-lock.json'));
  const noLock = await D.installDeps({ root: bare, npm: process.execPath, shell: false, timeoutMs: 20000 });
  check('without a lock file it falls back to `npm install --omit=dev …`; a failing run returns ok:false with the last lines', noLock.ok === false && /^npm install --omit=dev/.test(noLock.command) && typeof noLock.tail === 'string' && noLock.tail.length > 0, JSON.stringify(noLock));

  // 3. the host
  server = await serve(editor, 0, { workspace: null });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const h1 = await (await fetch(`${base}/api/health`, { headers: { origin: 'null' } })).json();
  const h2 = await (await fetch(`${base}/api/host/health`)).json();
  check('/api/health and /api/host/health report deps {ok:false, missing:[playwright-core]}', h1.deps?.ok === false && h1.deps.missing[0] === 'playwright-core' && h2.deps?.ok === false, JSON.stringify([h1.deps, h2.deps]));
  const foreign = await fetch(`${base}/api/deps/install`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
  check('POST /api/deps/install with a foreign Origin is refused (403) and runs nothing', foreign.status === 403 && !fs.existsSync(path.join(bare, 'node_modules')));
  const get = await (await fetch(`${base}/api/deps`)).json();
  check('GET /api/deps answers {ok, missing, manual: "npm ci"}', get.ok === false && get.manual === 'npm ci', JSON.stringify(get));

  // 4. the editor
  browser = await launch();
  for (const ui of ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); } catch { /* none */ } }, ui);
    await page.goto(`${base}/`);
    await page.waitForFunction(() => window.BW?.ready);
    const notices = async () => (await toastTexts(page)).filter((x) => /npm ci/.test(x));
    const btns = () => shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast button')].map((b) => b.textContent.trim()));
    const word = ui === 'ar' ? 'ثبّت الآن' : 'Install now';
    const shown = await until(async () => (await notices()).length === 1, 8000);
    const n1 = await notices();
    check(`${ui}: the host is up and deps are missing -> ONE notice with the install button and the manual command npm ci`, shown && (await btns()).includes(word) && (ui === 'ar' ? /تثبيتًا لمرة واحدة/.test(n1[0]) : /one-time install/.test(n1[0])), JSON.stringify([n1, await btns()]));
    // an export that fails with the raw Node error: the same notice, not the path
    await page.route('**/api/export', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: "Cannot find package 'playwright-core' imported from D:\\bw-copy\\engine\\export.mjs" }) }));
    await page.evaluate(() => window.BW.runAction('exportPdf'));
    await sleep(900);
    const texts = await toastTexts(page);
    check(`${ui}: an export failing with ERR_MODULE_NOT_FOUND shows no raw path toast and still only ONE install notice`, !texts.some((x) => /bw-copy|export\.mjs/.test(x)) && (await notices()).length === 1, JSON.stringify(texts));
    await page.unroute('**/api/export');
    await page.route('**/api/export', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'disk full' }) }));
    await page.evaluate(() => window.BW.runAction('exportPdf'));
    await sleep(700);
    check(`${ui}: any other export error is still shown as it is`, (await toastTexts(page)).some((x) => /disk full/.test(x)));
    check(`${ui}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // «Install now» on the real route would run npm: the stand-in is exercised above; here the click path is checked with the route answered by the test
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  await page.route('**/api/deps/install', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"missing":[]}' }));
  await page.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); } catch { /* none */ } });
  await page.goto(`${base}/`);
  await page.waitForFunction(() => window.BW?.ready);
  const hasBtn = () => shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast button')].some((b) => b.textContent.trim() === 'Install now'));
  await until(hasBtn, 8000);
  await shRoot(page, (r) => [...r.querySelectorAll('.toasts .toast button')].find((b) => b.textContent.trim() === 'Install now').click());
  const done = await until(async () => (await toastTexts(page)).some((x) => /Installed\. You can export now/.test(x)), 6000);
  await sleep(500);
  const left = await toastTexts(page);
  check('pressing «Install now» calls the route and ends with the success toast; the notice is gone', done && !left.some((x) => /npm ci/.test(x)), JSON.stringify(left));
  await ctx.close();
} catch (e) {
  check('suite ran to the end', false, e.stack?.split('\n').slice(0, 5).join(' / '));
} finally {
  delete process.env.BW_DEPS_ROOT;
  await browser?.close();
  server?.close();
  server?.closeAllConnections?.();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
