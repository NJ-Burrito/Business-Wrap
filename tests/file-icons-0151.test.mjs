// 0.15.1 lane icons: Settings > File icons ("Use Business-Wrap icons on this PC"). The registry layer is a FAKE (an in-memory
// registry with the same ops as engine/file-icons.mjs realReg): this suite never touches the real registry.
//   node tests/file-icons-0151.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { createFileIcons, EXTS, BACKUP_NAME } from '../engine/file-icons.mjs';
import { makeRoute } from '../engine/routes/file-icons.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  file-icons-0151: ${name}${detail && !ok ? '  - ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fileicons-'));

/** An in-memory registry. Keys are case-insensitive; HKCR\x reads HKCU\Software\Classes\x then HKLM\Software\Classes\x. */
class FakeReg {
  constructor() { this.k = new Map(); this.calls = 0; this.failSet = new Set(); }
  norm(key) { return key.toLowerCase(); }
  seed(key, vals = {}) { const parts = this.norm(key).split('\\'); for (let i = 1; i < parts.length; i++) { const p = parts.slice(0, i).join('\\'); if (!this.k.has(p)) this.k.set(p, { vals: new Map() }); } const e = this.k.get(this.norm(key)) || { vals: new Map() }; for (const [n, v] of Object.entries(vals)) e.vals.set(n, typeof v === 'string' ? { data: v, kind: 'String' } : v); this.k.set(this.norm(key), e); }
  find(key) {
    const n = this.norm(key);
    if (n.startsWith('hkcr\\')) return this.k.get(`hkcu\\software\\classes\\${n.slice(5)}`) || this.k.get(`hklm\\software\\classes\\${n.slice(5)}`);
    return this.k.get(n);
  }
  snapshot() { return JSON.stringify([...this.k].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, e]) => [key, [...e.vals].sort(([a], [b]) => (a < b ? -1 : 1))])); }
  async ops(list) {
    this.calls += 1;
    return list.map((o) => {
      if (o.op !== 'get' && !o.key.startsWith('HKCU\\')) return { error: 'hive' };
      const n = this.norm(o.key);
      if (o.op === 'get') { const e = this.find(o.key); return !e ? { key: false, value: false, data: null } : e.vals.has(o.name) ? { key: true, value: true, data: e.vals.get(o.name).data, kind: e.vals.get(o.name).kind } : { key: true, value: false, data: null }; }
      if (o.op === 'set') {
        if (this.failSet.has(n)) return { error: 'access denied' };
        // CreateSubKey creates the parents too
        const parts = n.split('\\');
        for (let i = 2; i <= parts.length; i++) { const p = parts.slice(0, i).join('\\'); if (!this.k.has(p)) this.k.set(p, { vals: new Map() }); }
        this.k.get(n).vals.set(o.name, { data: o.data, kind: o.kind || 'String' });
        return { ok: true };
      }
      if (o.op === 'delValue') { this.k.get(n)?.vals.delete(o.name); return { ok: true }; }
      if (o.op === 'delKey') {
        const e = this.k.get(n);
        const kids = [...this.k.keys()].some((x) => x.startsWith(`${n}\\`));
        if (e && (!o.ifEmpty || (!e.vals.size && !kids))) for (const x of [...this.k.keys()]) if (x === n || x.startsWith(`${n}\\`)) this.k.delete(x);
        return { ok: true };
      }
      return { error: 'op' };
    });
  }
}
const CL = 'HKCU\\Software\\Classes\\';
const FE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\';
/** pdf: UserChoice -> AcroExch.Document.DC, which has an icon of its own in HKCU.  docx: no UserChoice, .docx default in HKLM
 *  -> Word.Document.12, absent from HKCU entirely.  html: UserChoice -> ChromeHTML, DefaultIcon key present, an expandable value. */
function world() {
  const r = new FakeReg();
  r.seed(`${FE}.pdf\\UserChoice`, { ProgId: 'AcroExch.Document.DC' });
  r.seed(`${CL}AcroExch.Document.DC`, {});
  r.seed(`${CL}AcroExch.Document.DC\\DefaultIcon`, { '': 'C:\\Acro\\acro.ico,0' });
  r.seed('HKLM\\Software\\Classes\\.docx', { '': 'Word.Document.12' });
  r.seed(`${FE}.html\\UserChoice`, { ProgId: 'ChromeHTML' });
  r.seed(`${CL}ChromeHTML`, { '': 'Chrome HTML Document' });
  r.seed(`${CL}ChromeHTML\\DefaultIcon`, { '': { data: '%ProgramFiles%\\Chrome\\chrome.exe,0', kind: 'ExpandString' } });
  // Windows 11 24H2+ (0.15.3, measured on the owner's PC): Explorer draws the icon of UserChoiceLatest\ProgId (a SUBKEY named ProgId),
  // which differs from UserChoice for .pdf and .html; the ProgID may hold a space ("Opera GXStable")
  r.seed(`${FE}.pdf\\UserChoiceLatest\\ProgId`, { ProgId: 'PdfGear.App.1' });
  r.seed(`${CL}PdfGear.App.1\\DefaultIcon`, { '': '"C:\\Program Files\\PDFgear\\PDFgear.exe",1' });
  r.seed(`${FE}.html\\UserChoiceLatest\\ProgId`, { ProgId: 'Opera GXStable' });
  r.seed(`${CL}Opera GXStable\\DefaultIcon`, { '': 'C:\\Opera\\opera.exe,0' });
  return r;
}
const mk = (reg, o = {}) => { let n = 0; const sd = path.join(tmp, `state-${Math.random().toString(36).slice(2)}`); return { sd, n: () => n, fi: createFileIcons({ reg, refresh: async () => { n += 1; return true; }, platform: 'win32', stateDir: sd, ...o }) }; };

try {
  // ── apply -> backup -> restore: the exact prior state ──
  {
    const reg = world();
    const before = reg.snapshot();
    const { fi, sd, n } = mk(reg);
    const a = await fi.apply();
    check('apply: all three extensions take (pdf, docx, html), Explorer told once', a.ok && a.results.length === 3 && a.results.every((x) => x.ok) && n() === 1, JSON.stringify(a));
    check('apply: ProgIDs resolved from UserChoice, else the extension default', a.results.map((x) => x.progId).join() === 'AcroExch.Document.DC,Word.Document.12,ChromeHTML', JSON.stringify(a.results));
    check('apply: the .ico files are copied to the per-user folder (not the repo)', EXTS.every((e) => fs.existsSync(path.join(sd, `${e}.ico`))) && !path.relative(REPO, sd).split(path.sep).includes('brand') && path.dirname(sd).startsWith(os.tmpdir()));
    check('apply: DefaultIcon of each ProgID now points at our file', (await reg.ops([{ op: 'get', key: `${CL}ChromeHTML\\DefaultIcon`, name: '' }]))[0].data === `${path.join(sd, 'html.ico')},0`);
    const bk = JSON.parse(fs.readFileSync(path.join(sd, BACKUP_NAME), 'utf8'));
    check('backup: written with each ProgID\'s prior value, key presence and kind', bk.entries['AcroExch.Document.DC'].value === 'C:\\Acro\\acro.ico,0' && bk.entries['Word.Document.12'].value === null && bk.entries['Word.Document.12'].iconKey === false && bk.entries['Word.Document.12'].progKey === false && bk.entries.ChromeHTML.kind === 'ExpandString', JSON.stringify(bk));
    check('apply (24H2): every ProgID Explorer may use is covered: pdf = UserChoice + UserChoiceLatest, html likewise (with a space in the id)', a.results.find((x) => x.ext === 'pdf').progIds.join() === 'AcroExch.Document.DC,PdfGear.App.1' && a.results.find((x) => x.ext === 'html').progIds.join() === 'ChromeHTML,Opera GXStable', JSON.stringify(a.results));
    check('apply (24H2): the latest choice DefaultIcon is ours too, and its original is in the backup (absent key included)', (await reg.ops([{ op: 'get', key: `${CL}PdfGear.App.1\\DefaultIcon`, name: '' }, { op: 'get', key: `${CL}Opera GXStable\\DefaultIcon`, name: '' }])).every((x, i) => x.data === `${path.join(sd, i ? 'html.ico' : 'pdf.ico')},0`) && JSON.parse(fs.readFileSync(path.join(sd, BACKUP_NAME), 'utf8')).entries['PdfGear.App.1'].value === '"C:\\Program Files\\PDFgear\\PDFgear.exe",1'); // platform-guard: ok a fake registry path inside a test string, nothing touches a drive
    const st = await fi.status();
    check('status: applied, every row ours', st.supported && st.applied && st.rows.length === 5 && st.rows.every((x) => x.ours), JSON.stringify(st));
    await fi.apply(); // a second press must not back up our own icon as the "original"
    const bk2 = JSON.parse(fs.readFileSync(path.join(sd, BACKUP_NAME), 'utf8'));
    check('apply twice: the backup still holds the true originals', bk2.entries['AcroExch.Document.DC'].value === 'C:\\Acro\\acro.ico,0' && bk2.entries.ChromeHTML.value === '%ProgramFiles%\\Chrome\\chrome.exe,0');
    check('the registry really changed (the test is not vacuous)', reg.snapshot() !== before);
    const r = await fi.restore();
    check('restore: every extension restored, Explorer told again', r.ok && r.results.length === 5 && r.results.every((x) => x.ok) && n() === 3, JSON.stringify(r));
    check('restore: the registry is exactly as before (absent key and ProgID gone, ExpandString kept)', reg.snapshot() === before, reg.snapshot().slice(0, 400));
    check('restore: backup removed, status says not applied', !fs.existsSync(path.join(sd, BACKUP_NAME)) && (await fi.status()).applied === false);
    const r2 = await fi.restore();
    check('restore again with nothing to restore: ok, nothing changes', r2.ok && r2.results.length === 0 && reg.snapshot() === before);
  }
  // ── absent-key case on its own: nothing for the ProgID existed in HKCU; the DefaultIcon key existed with no value ──
  {
    const reg = new FakeReg();
    reg.seed('HKLM\\Software\\Classes\\.pdf', { '': 'MSEdgePDF' });
    reg.seed('HKLM\\Software\\Classes\\.docx', { '': 'Word.Document.12' });
    reg.seed('HKLM\\Software\\Classes\\.html', { '': 'htmlfile' });
    reg.seed(`${CL}htmlfile\\DefaultIcon`, {}); // the key is there, its (Default) is not
    const before = reg.snapshot();
    const { fi } = mk(reg);
    const a = await fi.apply();
    check('absent: apply works with no UserChoice and no HKCU ProgID key', a.ok && a.results.every((x) => x.ok), JSON.stringify(a));
    await fi.restore();
    check('absent: restore deletes what was absent and keeps the empty DefaultIcon key that existed', reg.snapshot() === before, reg.snapshot());
  }
  // ── honest per-extension result ──
  {
    const reg = world();
    reg.failSet.add(`${CL}ChromeHTML\\DefaultIcon`.toLowerCase());
    const { fi } = mk(reg);
    const a = await fi.apply();
    const by = Object.fromEntries(a.results.map((x) => [x.ext, x]));
    check('a failed write is reported per extension, not hidden (html not ok, pdf and docx ok)', a.ok && by.pdf.ok && by.docx.ok && !by.html.ok && by.html.reason === 'write-failed', JSON.stringify(a.results));
    const noAssoc = new FakeReg();
    noAssoc.seed('HKLM\\Software\\Classes\\.pdf', { '': 'MSEdgePDF' });
    const b = await mk(noAssoc).fi.apply();
    check('an extension with no association is reported (no-association), the others still apply', b.results.find((x) => x.ext === 'docx').reason === 'no-association' && b.results.find((x) => x.ext === 'pdf').ok, JSON.stringify(b.results));
  }
  // ── non-Windows: unsupported, the registry is never asked ──
  {
    const reg = world();
    const { fi } = mk(reg, { platform: 'linux' });
    const s = await fi.status(); const a = await fi.apply(); const r = await fi.restore();
    check('non-Windows: status, apply and restore all say unsupported and never touch the registry', [s, a, r].every((x) => x.supported === false && x.reason === 'windows-only') && reg.calls === 0);
    const sent = [];
    const route = makeRoute({ reg, platform: 'darwin', stateDir: path.join(tmp, 'mac') });
    await route({ method: 'POST', headers: {} }, new URL('http://x/api/file-icons/apply'), (c, b) => sent.push([c, b]));
    check('non-Windows: the route answers 501 {supported:false}', sent[0][0] === 501 && sent[0][1].supported === false && reg.calls === 0, JSON.stringify(sent));
  }
  // ── the route through the REAL server: wiring, method, local-origin refusal ──
  const reg = world();
  const before = reg.snapshot();
  const stateDir = path.join(tmp, 'served');
  globalThis.__fiRoute = makeRoute({ reg, platform: 'win32', stateDir, refresh: async () => true });
  const routesDir = path.join(tmp, 'routes');
  fs.mkdirSync(routesDir);
  fs.writeFileSync(path.join(routesDir, 'file-icons.mjs'), 'export default (...a) => globalThis.__fiRoute(...a);\n');
  const OUT = path.join(REPO, 'out', 'file-icons-0151-test');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file });
  const server = await serve(file, 0, { routesDir, out: OUT });
  const BASE = `http://127.0.0.1:${server.address().port}`;
  const post = (act, headers = {}) => fetch(`${BASE}/api/file-icons/${act}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
  try {
    const foreign = await post('apply', { origin: 'https://example.com' });
    check('route: a foreign page is refused (403) and the registry is untouched', foreign.status === 403 && reg.snapshot() === before && !fs.existsSync(path.join(stateDir, BACKUP_NAME)), String(foreign.status));
    const direct = []; // the route on its own, without the server's gate
    await makeRoute({ reg, platform: 'win32', stateDir })({ method: 'POST', headers: { origin: 'https://evil.example' } }, new URL('http://x/api/file-icons/apply'), (c) => direct.push(c));
    check('route: refuses a foreign origin on its own too', direct[0] === 403 && reg.snapshot() === before);
    check('route: GET apply and POST status are 405', (await fetch(`${BASE}/api/file-icons/apply`)).status === 405 && (await fetch(`${BASE}/api/file-icons/status`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status === 405);
    const s0 = await (await fetch(`${BASE}/api/file-icons/status`)).json();
    check('route: status before apply = supported, not applied', s0.supported === true && s0.applied === false, JSON.stringify(s0));
    const ok = await post('apply', { origin: BASE });
    const j = await ok.json();
    check('route: apply from the local page works (200, three ok)', ok.status === 200 && j.results?.length === 3 && j.results.every((x) => x.ok), JSON.stringify(j));
    check('route: status after apply = applied', (await (await fetch(`${BASE}/api/file-icons/status`)).json()).applied === true);
    const rs = await (await post('restore', { origin: BASE })).json();
    check('route: restore returns the registry to the exact prior state', rs.ok === true && reg.snapshot() === before);
  } finally { await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); }

  // ── the Settings row renders in AR and EN, and the buttons work against a served editor ──
  const browser = await chromium.launch(launchOptions());
  try {
    const reg2 = world();
    globalThis.__fiRoute = makeRoute({ reg: reg2, platform: 'win32', stateDir: path.join(tmp, 'served2'), refresh: async () => true });
    const server2 = await serve(file, 0, { routesDir, out: OUT });
    const URL2 = `http://127.0.0.1:${server2.address().port}/`;
    const open = async (url, lang) => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
      await ctx.addInitScript((l) => { try { localStorage.setItem('bw:ui', l); localStorage.setItem('bw:wm-intro', '1'); sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* */ } }, lang);
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.BW?.ready);
      await page.evaluate(() => window.BW.runAction('settings'));
      await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-ico'));
      return { ctx, page, errors };
    };
    const card = (page) => page.evaluate(() => { const c = document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-ico'); return { text: c.textContent, dis: [...c.querySelectorAll('button')].map((b) => b.disabled), keys: [...c.querySelectorAll('button')].map((b) => b.dataset.k), dir: getComputedStyle(c).direction }; });
    for (const [lang, apply, restore, note] of [['ar', 'استخدم أيقونات بزنس راب على هذا الجهاز', 'أعِد أيقونات ويندوز', 'كل ملف PDF'], ['en', 'Use Business-Wrap icons on this PC', 'Restore Windows icons', 'every .pdf, .docx and .html file']]) {
      const { ctx, page, errors } = await open(URL2, lang);
      await page.waitForFunction(() => /Business-Wrap icons are on|Standard Windows|standard Windows|مفعّلة|أيقونات ويندوز الأصلية/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-ico-status')?.textContent || ''), null, { timeout: 8000 });
      const c = await card(page);
      check(`ui ${lang}: the row shows both buttons and the honest note (served)`, c.text.includes(apply) && c.text.includes(restore) && c.text.includes(note) && c.keys.join() === 'icoApply,icoRestore' && c.dis.every((d) => !d), JSON.stringify(c).slice(0, 300));
      const fr = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer .set-ico-folders li')].map((li) => ({ svg: !!li.querySelector('svg path'), t: li.textContent.trim() })));
      check(`ui ${lang}: the folder-icons preview row shows four labelled folders (0.15.3)`, fr.length === 4 && fr.every((x) => x.svg && x.t) && (lang === 'en' ? fr[1].t === 'PDF files folder' : /PDF/.test(fr[1].t) && /[؀-ۿ]/.test(fr[1].t)), JSON.stringify(fr));
      if (lang === 'en') {
        await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="icoApply"]').click());
        await page.waitForFunction(() => /Icons applied/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-ico-status')?.textContent || ''), null, { timeout: 8000 });
        const toast = await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.toasts')?.textContent || '');
        check('ui en: Apply reports each extension honestly (.pdf .docx .html) in the toast and the status', /\.pdf \.docx \.html/.test(toast) && reg2.snapshot() !== world().snapshot());
        await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="icoRestore"]').click());
        await page.waitForFunction(() => /icons are back/.test(document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-ico-status')?.textContent || ''), null, { timeout: 8000 });
        check('ui en: Restore puts the registry back exactly', reg2.snapshot() === world().snapshot());
      }
      check(`ui ${lang}: no page errors`, !errors.length, errors.join(' | '));
      await ctx.close();
    }
    const fl = await open(pathToFileURL(file).href, 'en');
    const f = await card(fl.page);
    check('ui: served off (file://) - both buttons disabled with the server-needed hint', f.dis.length === 2 && f.dis.every(Boolean) && /Needs the server/.test(f.text), JSON.stringify(f).slice(0, 300));
    await fl.ctx.close();
    const fa = await open(pathToFileURL(file).href, 'ar');
    check('ui ar: served off - Arabic hint', /يحتاج الخادم/.test((await card(fa.page)).text));
    await fa.ctx.close();
    await new Promise((r) => { server2.close(r); server2.closeAllConnections?.(); });
  } finally { await browser.close(); }
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 5).join(' / '));
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
