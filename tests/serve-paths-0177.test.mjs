// 0.17.7 (lane notes, item 4): the paths fixb said lost their tests when Settings was rewritten in 0.17.0.
//   - the Settings «open» link (data-k="srvOpen") NO LONGER EXISTS (0.17.0): asserted absent, not rebuilt.
//   - what exists today and is tested here: each server serves ITS OWN document on ITS OWN port (/ , /files/ with no way out of the save
//     folder, the null-origin /api/version probe naming the port), the served page's toggle names its own port, and the file page's
//     «open in the current viewer» probe (OLV.find) lands on the port that answers, in the order asked.
//   node tests/serve-paths-0177.test.mjs
// Own temp folder and free ports; never 4317; everything started here is closed here.
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions, REPO } from '../engine/export.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { serve } from '../engine/serve.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  serve-paths: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'bw-servepaths-')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const get = async (port, p, headers = {}) => { const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers, signal: AbortSignal.timeout(8000) }); return { st: r.status, type: r.headers.get('content-type') || '', cors: r.headers.get('access-control-allow-origin'), body: Buffer.from(await r.arrayBuffer()) }; };

const mk = (name, sample) => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'exports'), { recursive: true });
  const editor = path.join(dir, `${name}.editor.html`);
  buildEditor({ inputs: [path.join(REPO, 'samples', sample)], out: editor, set: 'sample' });
  fs.writeFileSync(path.join(dir, 'exports', 'a.pdf'), name === 'alpha' ? '%PDF-A' : '%PDF-A-beta');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'outside the exports folder');
  return { dir, editor, out: path.join(dir, 'exports') };
};
const A = mk('alpha', 'event-permit');
const B = mk('beta', 'blank');
fs.writeFileSync(path.join(B.out, 'b.pdf'), '%PDF-B');
const pA = await free();
const pB = await free();
const sA = await serve(A.editor, pA, { out: A.out });
const sB = await serve(B.editor, pB, { out: B.out });
let browser;
try {
  // 1. each port serves its own document
  const a = await get(pA, '/'), b = await get(pB, '/');
  check('/ on each port is an HTML page of that port\'s own editor file', a.st === 200 && b.st === 200 && /text\/html/.test(a.type) && /text\/html/.test(b.type) && a.body.length > 5e4 && b.body.length > 5e4);
  check('the two ports serve DIFFERENT documents (event-permit vs blank)', !a.body.equals(b.body));
  // 2. /files/ per port, no way out
  check('/files/ serves the port\'s own export folder', (await get(pA, '/files/a.pdf')).body.toString() === '%PDF-A' && (await get(pB, '/files/b.pdf')).body.toString() === '%PDF-B');
  check('/files/ never crosses to the other port\'s folder', (await get(pA, '/files/b.pdf')).st === 404 && (await get(pB, '/files/a.pdf')).body.toString() === '%PDF-A-beta');
  const esc = await Promise.all(['/files/../secret.txt', '/files/%2e%2e/secret.txt', '/files/..%2fsecret.txt', '/files/%2e%2e%5csecret.txt'].map((p) => get(pA, p)));
  check('/files/ refuses a path that leaves the folder (..  %2e%2e  %2f  %5c)', esc.every((r) => r.st === 404 && !/outside the exports/.test(r.body.toString())), esc.map((r) => r.st).join(','));
  check('/files/ on a missing name is 404', (await get(pA, '/files/none.pdf')).st === 404);
  // 3. the null-origin probe a file page makes
  const ra = await get(pA, '/api/version', { Origin: 'null' });
  const va = JSON.parse(ra.body.toString());
  const vb = JSON.parse((await get(pB, '/api/version', { Origin: 'null' })).body.toString());
  check('GET /api/version from a null origin names Business-Wrap, served, and THIS port (nothing more)', ra.cors === 'null' && va.name === 'Business-Wrap' && va.served === true && va.port === pA && vb.port === pB && Object.keys(va).sort().join() === 'name,port,served,version', JSON.stringify(va));
  // 4. in the browser
  browser = await chromium.launch(launchOptions());
  const ctx = await browser.newContext();
  const open = async (url, ports) => {
    const page = await ctx.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    if (ports) await page.addInitScript((pp) => { window.__bwProbePorts = pp; }, ports);
    await page.goto(url);
    await page.waitForFunction(() => window.BW?.ready);
    await sleep(900);
    return page;
  };
  const word = (page) => page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.island .srv-toggle')?.textContent?.replace(/\s+/g, ' ').trim());
  const pageA = await open(`http://127.0.0.1:${pA}/`), pageB = await open(`http://127.0.0.1:${pB}/`);
  const wa = await word(pageA), wb = await word(pageB);
  check('a served page\'s toggle is online and names its own port', new RegExp(`:${pA}\\b`).test(wa) && new RegExp(`:${pB}\\b`).test(wb) && !new RegExp(`:${pB}\\b`).test(wa), `${wa} | ${wb}`);
  const hasOpen = await pageA.evaluate(() => { window.BW.openDrawer('settings'); return new Promise((r) => setTimeout(() => r(!!document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-k="srvOpen"]')), 700)); });
  check('the served page carries no Settings «open» link (gone in 0.17.0, not rebuilt)', hasOpen === false);
  const file = await open(pathToFileURL(A.editor).href, [pB, pA]);
  const dead = await free();
  const found = await file.evaluate(([x, y, z]) => Promise.all([window.BW.EXT.olv.find([x]), window.BW.EXT.olv.find([z, y, x]), window.BW.EXT.olv.find([z])]), [pA, pB, dead]);
  check('«open in the current viewer»: find() lands on the port that answers, first in the order asked, null when none', found[0]?.port === pA && found[1]?.port === pB && found[2] === null, JSON.stringify(found));
  check('no page error on any of the three pages', pageA.errors.length + pageB.errors.length + file.errors.length === 0, [...pageA.errors, ...pageB.errors, ...file.errors].join(' | '));
} catch (e) {
  check('suite ran to the end', false, String(e.stack || e).slice(0, 400));
} finally {
  try { await browser?.close(); } catch { /* gone */ }
  for (const s of [sA, sB]) { try { s.closeAllConnections?.(); await new Promise((r) => s.close(r)); } catch { /* closed */ } }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* left to the OS temp */ }
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nOK: ${results.length} checks`);
process.exit(failed ? 1 : 0);
