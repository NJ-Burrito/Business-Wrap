// The extension seam (0.13.0, editor/ext/README.md): a fixture extension in its own folder is built into the
// editor and registers a command, a toolbar section, a drawer, a Settings card, a guard, a keydown handler and
// commit/boot listeners; each fires once, and the section survives a toolbar rebuild. Also: an i18n key clash
// fails the build, no extension folder builds the same editor as an empty one, and engine/serve.mjs answers
// from an extension route (foreign-origin writes refused). Headless Chrome and the server are closed at the end.
//
//   node tests/ext.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ext-'));
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const put = (rel, s) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), s); };

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ext: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

// the fixture extension: everything it sees is counted in window.EXT_T
put('ext/90-dummy.js', `
window.EXT_T = { boot: 0, open: 0, act: 0, commit: [], render: 0, mount: 0, card: 0, key: 0, save: 0, block: false };
bwExt({
  cmds: [{ id: 'dummyRun', group: 'dummy' }],
  sections: [{ cat: 'dummy' }],
  actions: { dummyRun: () => { window.EXT_T.act += 1; openDrawer('dummy'); } },
  drawers: { dummy: () => ({ title: t('dummyTitle'), html: '<p class="dummy-body">dummy drawer</p>', mount: () => { window.EXT_T.mount += 1; } }) },
  settings: [{ id: 'dummy', title: 'dummyTitle', html: () => '<p class="dummy-card">dummy card</p>', mount: (el) => { if (el) window.EXT_T.card += 1; } }],
  guards: [(what) => (window.EXT_T.block && what === 'commit' ? 'dummy lock' : true)],
  status: { count: () => 42 },
  expose: { dummy: { hello: () => 'hi' } },
  on: {
    boot: () => { window.EXT_T.boot += 1; },
    open: () => { window.EXT_T.open += 1; },
    render: () => { window.EXT_T.render += 1; },
    save: () => { window.EXT_T.save += 1; },
    commit: (ops, ed, kind) => { window.EXT_T.commit.push([ops.length, ed, kind]); },
    keydown: (e) => { if (e.key === 'F9') { window.EXT_T.key += 1; return true; } return false; },
  },
});
`);
put('ext/90-dummy.css', '.sec[data-cat="dummy"] { outline: 3px solid rgb(1, 2, 3); }\n');
put('ext/90-dummy.i18n.json', JSON.stringify({ ar: { dummyRun: 'تشغيل التجربة', secDummy: 'تجربة', grp_dummy: 'تجربة', dummyTitle: 'لوحة التجربة' }, en: { dummyRun: 'Run dummy', secDummy: 'Dummy', grp_dummy: 'Dummy', dummyTitle: 'Dummy panel' } }));
put('clash/90-clash.i18n.json', JSON.stringify({ ar: { save: 'x' }, en: {} }));
fs.mkdirSync(path.join(tmp, 'empty'));
put('routes/50-dummy.mjs', `export default async (req, url, send, ctx) => {
  if (url.pathname !== '/api/dummy') return false;
  send(200, { ok: true, method: req.method, hasOut: typeof ctx.OUT === 'string', editor: typeof ctx.editorFile === 'string', workspace: ctx.workspace });
  return true;
};
`);

const file = path.join(tmp, 'ext.editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'ext-test', watermarkDir: null, extDir: path.join(tmp, 'ext') });

// no extension folder and an empty one build the same editor
const a = path.join(tmp, 'none.html'), b = path.join(tmp, 'empty.html');
buildEditor({ inputs: [SAMPLE], out: a, set: 'x', watermarkDir: null, extDir: path.join(tmp, 'missing') });
buildEditor({ inputs: [SAMPLE], out: b, set: 'x', watermarkDir: null, extDir: path.join(tmp, 'empty') });
check('no extension folder = empty folder (byte-identical editor)', fs.readFileSync(a, 'utf8') === fs.readFileSync(b, 'utf8'));
let clash = '';
try { buildEditor({ inputs: [SAMPLE], out: path.join(tmp, 'clash.html'), watermarkDir: null, extDir: path.join(tmp, 'clash') }); } catch (e) { clash = e.message; }
check('an i18n key clash fails the build', /i18n key "save"/.test(clash), clash || 'built');

const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && window.EXT_T?.boot === 1);
  const T = () => page.evaluate(() => window.EXT_T);
  const sh = (fn) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot)`);

  let t = await T();
  check('boot and open fire once', t.boot === 1 && t.open === 1, JSON.stringify(t));
  check('command joins the registry and the palette groups', await page.evaluate(() => window.BW.EXT.cmds.length === 1 && window.BW.EXT.cmds[0].edit === false && window.BW.EXT.dummy.hello() === 'hi'));
  const secInfo = await sh((r) => { const s = r.querySelector('.island .sec[data-cat="dummy"]'); return s && { tool: !!s.querySelector('[data-a="dummyRun"]'), label: s.getAttribute('aria-label'), outline: getComputedStyle(s).outlineColor }; });
  check('toolbar section drawn after design, with its tool, label and CSS', secInfo?.tool && secInfo.label === 'تجربة' && secInfo.outline === 'rgb(1, 2, 3)', JSON.stringify(secInfo));
  check('status counter comes from the extension', (await sh((r) => r.querySelector('.count .n').textContent)) === '42');

  await sh((r) => r.querySelector('.island [data-a="dummyRun"]').click());
  await page.waitForTimeout(100);
  t = await T();
  const drawer = await sh((r) => { const d = r.querySelector('.drawer'); return { open: !d.hidden, body: !!d.querySelector('.dummy-body'), label: d.getAttribute('aria-label') }; });
  check('action fires once and opens the extension drawer (mounted once)', t.act === 1 && t.mount === 1 && drawer.open && drawer.body && drawer.label === 'لوحة التجربة', JSON.stringify({ t, drawer }));

  await page.evaluate(() => window.BW.openDrawer('settings'));
  t = await T();
  check('Settings card drawn and mounted once', t.card === 1 && (await sh((r) => !!r.querySelector('.drawer .set-x-dummy .dummy-card'))));

  const before = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  await page.evaluate(() => window.BW.commit([{ op: 'setText', path: '/control/title', value: 'Ext test', old: window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.control.title }]));
  t = await T();
  check('commit listener fires once, with ops, edition and kind', t.commit.length === 1 && t.commit[0][0] === 1 && t.commit[0][2] === 'commit', JSON.stringify(t.commit));
  check('render listener fires once per render', t.render === 1, String(t.render));
  await page.evaluate(() => window.BW.undo());
  t = await T();
  check('undo reports to the commit listener', t.commit.length === 2 && t.commit[1][2] === 'undo', JSON.stringify(t.commit));

  await page.evaluate(() => { window.EXT_T.block = true; });
  const refused = await page.evaluate(() => { try { window.BW.commit([{ op: 'setText', path: '/control/title', value: 'nope' }]); return 'committed'; } catch (e) { return e.refused ? e.message : 'other: ' + e.message; } });
  const after = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const toastText = await sh((r) => r.querySelector('.toasts')?.textContent || '');
  check('a guard refusal changes nothing and toasts the reason', refused === 'dummy lock' && after === before && toastText.includes('dummy lock'), JSON.stringify({ refused, before, after, toastText }));
  await page.evaluate(() => { window.EXT_T.block = false; });

  await page.keyboard.press('F9');
  check('extension keydown runs first and claims its key', (await T()).key === 1);

  // survives a rebuild: a state toggle redraws the whole bar
  await page.evaluate(() => window.BW.runAction('dark'));
  await page.waitForTimeout(100);
  await sh((r) => r.querySelector('.island [data-a="dummyRun"]').click());
  await page.waitForTimeout(100);
  t = await T();
  check('section survives a toolbar rebuild and still runs its action', t.act === 2 && t.boot === 1, JSON.stringify(t));
  check('no page errors', errors.length === 0, errors.join(' | '));

  // the server: an extension route, the editor's ctx, foreign-origin writes refused
  const served = path.join(tmp, 'served', 'ext.editor.html');
  fs.mkdirSync(path.dirname(served), { recursive: true });
  fs.copyFileSync(file, served);
  server = await serve(served, 0, { routesDir: path.join(tmp, 'routes') });
  const base = `http://127.0.0.1:${server.address().port}`;
  const g = await (await fetch(`${base}/api/dummy`)).json();
  check('serve: extension route answers with ctx', g.ok && g.hasOut && g.editor && g.workspace === null, JSON.stringify(g));
  const f = await fetch(`${base}/api/dummy`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' });
  check('serve: a foreign-origin write to an extension route is refused', f.status === 403, String(f.status));
  check('serve: unknown path still 404', (await fetch(`${base}/api/nope`)).status === 404);
} finally {
  if (server) await new Promise((ok) => server.close(ok));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}  ext: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
