// 0.16.0 lane wrap: P4 (a story's criteria in the prose or list right after it), P5 (a --out server names the export by title),
// and the first Save of a blank document marks data-bw-lib-saved. Real Chrome (BW_CHROME), the real server and the real page.
//   node tests/wrap-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, fileStem } from '../engine/export.mjs';
import { docTitle } from '../engine/workspace.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-wrap160-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  wrap-0160: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const file = path.join(tmp, 'blank.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: file, set: 'wrap160', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  // ── P4 · validate() on the real page ──────────────────────────────────────────────────────────────────────────
  {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    check('P4 ready state: the blank document is open', (await page.evaluate(() => window.BW.S.svc)) === 'blank');
    const noAc = (blocks) => page.evaluate((blocks) => {
      const B = window.BW; const d = B.M[B.S.svc][B.S.ed].doc;
      d.chapters[0].sections[0].blocks = blocks;
      return B.validate().filter((r) => r[2]?.includes('/items/')).map((r) => r[2]);
    }, blocks);
    const story = (id) => ({ id, name: `Story ${id}`, role: 'a user', goal: 'do it', benefit: 'it works' });
    const two = { kind: 'stories', items: [story('US-01'), story('US-02')] };
    const base = await noAc([two]);
    check('P4 control: with nothing after the cards both stories warn', base.length === 2, JSON.stringify(base));
    const withProse = await noAc([two, { kind: 'prose', paragraphs: ['The user sees the result within one second.'] }]);
    check('P4: prose with words right after the cards counts for the last story only', withProse.length === 1 && withProse[0].includes('/items/0/'), JSON.stringify(withProse));
    const withList = await noAc([two, { kind: 'list', items: ['First criterion', 'Second criterion'] }]);
    check('P4: a list with words right after the cards counts for the last story', withList.length === 1, JSON.stringify(withList));
    const empty = await noAc([two, { kind: 'prose', paragraphs: ['   '] }]);
    check('P4: an empty prose block counts for nothing', empty.length === 2, JSON.stringify(empty));
    const apart = await noAc([two, { kind: 'table', columns: ['A'], rows: [['x']] }, { kind: 'prose', paragraphs: ['Words, but not adjacent.'] }]);
    check('P4: prose that does not follow the cards directly counts for nothing', apart.length === 2, JSON.stringify(apart));
    await page.context().close();
  }
  // ── P5 · a --out server names the export by title (or the name asked for) ──────────────────────────────────────
  {
    const { serve } = await import('../engine/serve.mjs');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve(file, 0, { out: outDir });
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.en.json'), 'utf8'));
      doc.control = { ...(doc.control || {}), title: 'Wrap Sixteen Title' };
      const post = (extra) => fetch(`${base}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ service: 'blank', locale: 'en', doc, embedFonts: false, docx: false, ...extra }) }).then((r) => r.json());
      const a = await post({});
      const want = `${fileStem(docTitle(doc, 'blank'))}.en.pdf`;
      check('P5 ready state: the export answered with a PDF that exists', !!a.pdf && fs.existsSync(a.pdf), JSON.stringify(a).slice(0, 160));
      check('P5: no name asked for, the file is <title>.<locale>.pdf', path.basename(a.pdf) === want && path.dirname(a.pdf).startsWith(outDir), `${a.pdf} wanted ${want}`);
      const b = await post({ name: 'My Chosen Name' });
      check('P5: a name asked for is used as is', path.basename(b.pdf) === 'My Chosen Name.pdf', b.pdf);
    } finally { await new Promise((r) => server.close(r)); }
  }
  // ── S · the first Save of a blank document writes its entry, marks it, and survives a reload ─────────────────
  {
    const { serve } = await import('../engine/serve.mjs');
    const outDir = path.join(tmp, 'out2');
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve(file, 0, { out: outDir });
    try {
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.BW?.ready);
      check('S ready state: the served blank document is open and unmarked', (await page.evaluate(() => window.BW.S.svc)) === 'blank' && !(await page.evaluate(() => document.documentElement.dataset.bwLibSaved)));
      await page.evaluate(() => { window.BW.commit([{ op: 'replace', path: '/chapters/0/sections/0/blocks/0/paragraphs/0', value: 'wrapmark160' }]); });
      await page.evaluate(() => window.BW.runAction('save'));
      await page.waitForFunction(() => !!document.documentElement.dataset.bwLibSaved, null, { timeout: 15000 });
      check('S: Save marked data-bw-lib-saved and moved the document into the library', /^doc-/.test(await page.evaluate(() => window.BW.S.svc)));
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 15000 });
      const kept = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.chapters[0].sections[0].blocks[0]));
      check('S: after reload the saved edit is still there', kept.includes('wrapmark160'), kept.slice(0, 120));
      await page.context().close();
    } finally { await new Promise((r) => server.close(r)); }
  }
  // ── R · edit, Save, reload on an already-saved library document: with --out and with a workspace (the diagram lane reported the old text) ──
  for (const mode of ['out', 'workspace']) {
    const dir = path.join(tmp, `r-${mode}`);
    fs.mkdirSync(dir, { recursive: true });
    if (mode === 'workspace') process.env.BW_WORKSPACE = dir;
    const { serve } = await import('../engine/serve.mjs');
    const server = await serve(file, 0, mode === 'out' ? { out: dir } : { workspace: true });
    try {
      const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.BW?.ready);
      const edit = (v) => page.evaluate((v) => { window.BW.commit([{ op: 'replace', path: '/chapters/0/sections/0/blocks/0/paragraphs/0', value: v }]); }, v);
      const mark = () => page.evaluate(() => Number(document.documentElement.dataset.bwLibSaved || 0));
      await edit('first-' + mode);
      await page.evaluate(() => window.BW.runAction('save'));
      await page.waitForFunction(() => !!document.documentElement.dataset.bwLibSaved, null, { timeout: 15000 });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 15000 });
      check(`R ${mode} ready state: the reloaded page shows the saved library document`, /^doc-/.test(await page.evaluate(() => window.BW.S.svc)));
      const m0 = await mark();
      await edit('second-' + mode);
      await page.evaluate(() => window.BW.runAction('save'));
      await page.waitForFunction((n) => Number(document.documentElement.dataset.bwLibSaved || 0) > n, m0, { timeout: 15000 });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 15000 });
      const t2 = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.chapters[0].sections[0].blocks[0]));
      check(`R ${mode}: a second edit, Save, reload brings the second edit back`, t2.includes('second-' + mode), t2.slice(0, 140));
      // an edit and a reload at once, no Save: the autosave must not lose it
      await edit('third-' + mode);
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 15000 });
      const t3 = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.chapters[0].sections[0].blocks[0]));
      check(`R ${mode}: an edit followed at once by a reload (no Save) is not lost`, t3.includes('third-' + mode), t3.slice(0, 140));
      await page.context().close();
    } finally { await new Promise((r) => server.close(r)); delete process.env.BW_WORKSPACE; }
  }
  // ── T · business-wrap://stop reaches only this install's state folder: a server of another install (or a test) keeps running ──
  {
    const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
    const other = fs.mkdtempSync(path.join(tmp, 'other-state-'));
    const child = spawn(process.execPath, [path.join(REPO, 'engine', 'serve.mjs'), file, '--port', String(port), '--out', path.join(tmp, 'out3')], { env: { ...process.env, BW_SERVE_CHILD: '1', BW_LOCAL_DIR: other, BW_STATE_DIR: other }, stdio: 'ignore', windowsHide: true });
    const up = async () => { try { const r = await fetch(`http://127.0.0.1:${port}/api/version`, { signal: AbortSignal.timeout(1500) }); return (await r.json()).name === 'Business-Wrap'; } catch { return false; } };
    try {
      for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
      check('T ready state: the other install server answers on its port and is registered in its own state folder', (await up()) && fs.existsSync(path.join(other, 'servers', String(child.pid))));
      process.env.BW_PROBE_PORTS = String(port);
      const { handle } = await import('../engine/protocol.mjs');
      const r = await handle('business-wrap://stop', { grace: 0 });
      await new Promise((r2) => setTimeout(r2, 1500));
      check('T: stop from this install did not stop the other install server', r.action === 'stop' && !r.pids.includes(child.pid) && (await up()), JSON.stringify(r));
    } finally { delete process.env.BW_PROBE_PORTS; try { child.kill(); } catch { /* gone */ } }
  }
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `FAILED ${failed}` : 'ALL PASS');
process.exit(failed ? 1 : 0);
