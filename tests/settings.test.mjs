// The Settings page and the in-editor update (0.11.0), in a real browser against the local server with a mocked
// release feed (no network, no gh auth): Settings in Arabic and English (About, Update, Preferences; the boxes
// never move between languages), the popup on a newer release only, skip-version remembered, the 24 h throttle and
// the auto-check toggle, file:// makes no update request at all, «حدّث الآن» → the progress steps → the editor
// reloads on the new version with the edits and the place kept, old Save-HTML files (0.9.1, 0.10.0) opened and
// edited, axe 0 serious. Font-independent. Viewport screenshots → out/settings/shots (BW_SHOTS_DIR copies them).
//
//   node tests/settings.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUR = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const R = 'NJ-Burrito/Business-Wrap';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-settings-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_UPDATE_TOKEN = 'none';
const { chromium } = await import('playwright-core');
const { launchOptions } = await import('../engine/export.mjs');
const { buildEditor } = await import('../engine/build-editor.mjs');
const { serve } = await import('../engine/serve.mjs');
const { TAR } = await import('../update/apply.mjs');
const { parseVersion } = await import('../update/core.mjs');
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const SHOTS = path.join(REPO, 'out', 'settings', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  settings: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const p = parseVersion(CUR);
const NEWER = `${p[0]}.${p[1] + 1}.0`;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const put = (base, rel, s) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), s); };
const files = spawnSync('git', ['-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.split('\n').filter((f) => f && fs.existsSync(path.join(REPO, f)));
const copyTree = (to) => { for (const f of files) put(to, f, fs.readFileSync(path.join(REPO, f))); };

// the editor under test, and a fake newer release (zip + feed) for the apply path
const editorFile = path.join(tmp, 'served', 'event-permit.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editorFile, set: 'sample' });
const relRoot = path.join(tmp, 'rel', `business-wrap-${NEWER}`);
copyTree(relRoot);
const pkg = JSON.parse(fs.readFileSync(path.join(relRoot, 'package.json'), 'utf8'));
put(relRoot, 'package.json', JSON.stringify({ ...pkg, version: NEWER }, null, 2) + '\n');
const zip = path.join(tmp, `business-wrap-${NEWER}.zip`);
if (process.platform === 'win32') spawnSync(TAR, ['-a', '-cf', zip, '-C', path.dirname(relRoot), path.basename(relRoot)]);
else spawnSync('zip', ['-qr', zip, path.basename(relRoot)], { cwd: path.dirname(relRoot) });
const feed = (v) => {
  const f = path.join(tmp, `feed-${v}.json`);
  fs.writeFileSync(f, JSON.stringify({ tag_name: `v${v}`, draft: false, prerelease: false, html_url: `https://github.com/${R}/releases/tag/v${v}`, published_at: '2026-10-28T00:00:00Z',
    body: '### Added / أضيف\n- **Settings page** with About and Update / صفحة الإعدادات مع حول البرنامج والتحديث\n- One-click update that keeps your work / تحديث بنقرة واحدة يحفظ عملك\n\n### Fixed / أصلح\n- <b onclick=x>Faster</b> start / بدء أسرع\n',
    assets: [{ name: `business-wrap-${v}.zip`, browser_download_url: `https://github.com/${R}/releases/download/v${v}/business-wrap-${v}.zip`, url: '', digest: `sha256:${sha(fs.readFileSync(zip))}` }] }));
  return f;
};
const FEED = { newer: feed(NEWER), same: feed(CUR), older: feed('0.0.1') };
const resetServerCache = () => fs.rmSync(path.join(process.env.BW_LOCAL_DIR, 'update-state.json'), { force: true });
const servers = [];
async function startServer({ file = editorFile, install = '' } = {}) {
  const dir = install || path.join(tmp, `inst-${servers.length}`, 'business-wrap');
  if (!install) copyTree(dir);
  const s = await serve(file, 0, { installDir: dir, onUpdated: () => {} });
  servers.push(s);
  return { url: `http://127.0.0.1:${s.address().port}/`, dir };
}

const browser = await chromium.launch(launchOptions());
const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
const uh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-update').shadowRoot, a), [fn.toString(), arg]);
async function open(url, { ui = 'ar', store = {}, width = 1366, height = 860 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, bypassCSP: true });
  await ctx.addInitScript(([u, st]) => { try { if (!sessionStorage.getItem('bw-init')) { sessionStorage.setItem('bw-init', '1'); localStorage.setItem('bw:ui', u); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); } } catch { /* file:// */ } }, [ui, store]);
  const page = await ctx.newPage();
  const errors = [];
  const reqs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors, reqs };
}
const popupOpen = (page) => page.evaluate(() => { const h = document.getElementById('bw-update'); const s = h?.shadowRoot.querySelector('.scrim'); return !!(s && !s.hidden) && h.dataset.open; });
const waitPopup = (page, ms = 6000) => page.waitForFunction(() => document.getElementById('bw-update')?.dataset.open === 'popup' && !document.getElementById('bw-update').shadowRoot.querySelector('.scrim').hidden, null, { timeout: ms }).then(() => true, () => false);
const shot = async (page, name) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
async function axe(page, label) {
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0]?.target?.join(' ') })));
  const bad = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  check(`axe ${label}: no serious/critical`, !bad.length, bad.map((x) => `${x.id}×${x.n} @${x.target}`).join(' | '));
}
const openSettings = async (page, via = 'palette') => {
  if (via === 'palette') { await page.keyboard.press('Control+K'); await page.waitForTimeout(250); await sh(page, (r) => r.querySelector('#cmdlist [data-cmd="settings"]').click()); }
  else await page.evaluate(() => window.BW.runAction('settings'));
  await page.waitForFunction(() => window.BW.S.drawer === 'settings');
  await page.waitForTimeout(450);
};

try {
  /* ── popup only on a newer release; screenshots AR + EN ── */
  process.env.BW_UPDATE_FEED = FEED.newer;
  for (const ui of ['ar', 'en']) {
    resetServerCache();
    const s = await startServer();
    const { ctx, page, errors } = await open(s.url, { ui });
    const shown = await waitPopup(page);
    const txt = await uh(page, (r) => r.querySelector('.dlg').innerText);
    check(`${ui}: newer release → the popup, with the version, the notes and three buttons`, shown && txt.includes(NEWER) && /Settings page|صفحة الإعدادات/.test(txt) && (await uh(page, (r) => r.querySelectorAll('.row button').length)) === 3, txt.slice(0, 200));
    check(`${ui}: release notes are text only (no markup from the feed reaches the page)`, !(await uh(page, (r) => !!r.querySelector('.dlg b[onclick], .dlg [onclick]'))) && !txt.includes('**'));
    check(`${ui}: AR+EN section headings`, txt.includes('أُضيف · Added') && txt.includes('أُصلح · Fixed'));
    await shot(page, `popup-${ui}`);
    if (ui === 'ar') await axe(page, 'update popup');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check(`${ui}: Esc = Later, the popup closes`, !(await popupOpen(page)));
    check(`${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  for (const [k, f] of [['same', FEED.same], ['older', FEED.older]]) {
    process.env.BW_UPDATE_FEED = f;
    resetServerCache();
    const s = await startServer();
    const { ctx, page, reqs } = await open(s.url);
    const shown = await waitPopup(page, 3500);
    check(`${k} version in the feed: no popup (the check ran)`, !shown && reqs.some((u) => u.includes('/api/update/check')));
    await ctx.close();
  }

  /* ── skip this version, the 24 h throttle, the toggle ── */
  process.env.BW_UPDATE_FEED = FEED.newer;
  resetServerCache();
  {
    const s = await startServer();
    const { ctx, page, reqs } = await open(s.url);
    await waitPopup(page);
    await uh(page, (r) => r.querySelector('.row button.ghost').click());
    const skipped = await page.evaluate(() => localStorage.getItem('bw:update-skip'));
    await page.evaluate(() => localStorage.removeItem('bw:update-last'));
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    const again = await waitPopup(page, 3500);
    check('skip this version: remembered, no popup for it on the next launch (the check still ran)', skipped === NEWER && !again && reqs.filter((u) => u.includes('/api/update/check')).length === 2, `${skipped} ${again}`);
    const n0 = reqs.filter((u) => u.includes('/api/update/check')).length;
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(2200);
    const n1 = reqs.filter((u) => u.includes('/api/update/check')).length;
    check('throttle: a launch within 24 h makes no check request', n1 === n0, `${n0} → ${n1}`);
    await page.evaluate(() => localStorage.setItem('bw:update-last', String(Date.now() - 25 * 3600 * 1000)));
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(2200);
    const n2 = reqs.filter((u) => u.includes('/api/update/check')).length;
    check('throttle: after 24 h the launch checks again', n2 === n1 + 1, `${n1} → ${n2}`);
    await page.evaluate(() => { localStorage.setItem('bw:update-last', '0'); localStorage.setItem('bw:update-auto', '0'); });
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(2200);
    const n3 = reqs.filter((u) => u.includes('/api/update/check')).length;
    check('toggle off: no check at launch, even past 24 h', n3 === n2, `${n2} → ${n3}`);
    // manual check works with the toggle off and shows the popup even for a skipped version
    await openSettings(page, 'palette');
    const auto = await sh(page, (r) => r.querySelector('.drawer [data-set="auto"]').checked);
    await sh(page, (r) => r.querySelector('.drawer [data-k="updCheck"]').click());
    const manual = await waitPopup(page);
    const forced = reqs.some((u) => u.includes('/api/update/check?force=1'));
    check('Check now: a forced check, the popup opens; the toggle shows off', manual && forced && auto === false);
    await ctx.close();
  }

  /* ── Settings page: AR + EN, layout identical, preferences, screenshots, axe ── */
  process.env.BW_UPDATE_FEED = FEED.same;
  resetServerCache();
  {
    const s = await startServer();
    const { ctx, page, errors } = await open(s.url, { store: { 'bw:update-auto': '0' } });
    await openSettings(page, 'toolbar');
    const btnOnBar = await sh(page, (r) => !!r.querySelector('.island [data-a="settings"]'));
    await sh(page, (r) => r.querySelector('.drawer [data-k="updCheck"]').click());
    await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .set-status')?.dataset.st === 'current');
    const info = async () => sh(page, (r) => {
      const d = r.querySelector('.drawer');
      const box = (el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width].map(Math.round).join(','); };
      return { text: d.innerText, cards: [...d.querySelectorAll('.card')].map(box), drawer: box(d), status: d.querySelector('.set-status').textContent };
    });
    const ar = await info();
    check('Settings opens from the toolbar\'s View section and from Ctrl+K', btnOnBar);
    check('About: name, version, release date, repository, licence, credits', ar.text.includes('Business-Wrap') && ar.text.includes(CUR) && /\d{4}-\d{2}-\d{2}/.test(ar.text) && ar.text.includes('github.com/NJ-Burrito/Business-Wrap') && ar.text.includes('MIT') && ar.text.includes('Lucide'));
    check('Update: current vs latest, last checked, «تحقّق الآن», the auto-check toggle', ar.text.includes('أحدث إصدار') && ar.text.includes('آخر فحص') && ar.text.includes('تحقّق الآن') && ar.status.includes('أحدث إصدار'), ar.status);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'settings-ar');
    await axe(page, 'Settings (ar)');
    await sh(page, (r) => r.querySelector('.drawer [data-k="setLang"][data-v="en"]').click());
    await page.waitForTimeout(500);
    const en = await info();
    check('Preferences → English: the interface switches and Settings stays open', (await page.evaluate(() => window.BW.S.ui)) === 'en' && en.text.includes('Check now') && en.text.includes('Preferences'));
    check('the layout never flips: the drawer and its cards keep their boxes in both languages', en.drawer === ar.drawer && en.cards.slice(0, 1).join() === ar.cards.slice(0, 1).join(), `${ar.drawer} / ${en.drawer}`);
    await shot(page, 'settings-en');
    await sh(page, (r) => r.querySelector('.drawer [data-k="setView"][data-v="single"]').click());
    await page.waitForTimeout(400);
    await sh(page, (r) => { const c = r.querySelector('.drawer [data-set="calm"]'); c.click(); });
    await page.waitForTimeout(300);
    await sh(page, (r) => { const c = r.querySelector('.drawer [data-set="explain"]'); c.click(); });
    const prefs = await page.evaluate(() => ({ pages: localStorage.getItem('bw:pages'), calm: localStorage.getItem('bw:calm'), xpl: localStorage.getItem('bw:explainers'), mode: window.BW.S.pages }));
    check('Preferences write the existing stores (page view, reduced motion, explainer cards)', prefs.pages === 'single' && prefs.mode === 'single' && prefs.calm === '1' && prefs.xpl === '0', JSON.stringify(prefs));
    await sh(page, (r) => r.querySelector('.drawer [data-k="setDir"][data-v="ltr"]').click());
    await page.waitForTimeout(300);
    check('Preferences → direction LTR: words only, the shell stays right-to-left', (await page.evaluate(() => localStorage.getItem('bw:dir'))) === 'ltr' && (await sh(page, (r) => r.querySelector('.shell').dir)) === 'rtl');
    check('no page errors in Settings', !errors.length, errors.join(' | '));
    await ctx.close();
  }

  /* ── file:// — the fallback, and no network call for updates from the page ── */
  {
    const { ctx, page, reqs } = await open(pathToFileURL(editorFile).href, { store: { 'bw:update-last': '0' } });
    await page.waitForTimeout(2000);
    await openSettings(page, 'palette');
    const fb = await sh(page, (r) => ({ file: r.querySelector('.drawer .set-file')?.innerText || '' }));
    await sh(page, (r) => r.querySelector('.drawer [data-k="updCheck"]').click());
    await page.waitForTimeout(300);
    const st = await sh(page, (r) => r.querySelector('.drawer .set-status').textContent);
    const net = reqs.filter((u) => /^https?:/.test(u));
    check('file://: Settings shows how to update (start the server, or the terminal command)', fb.file.includes('npm run serve') && fb.file.includes('npx business-wrap update'), fb.file.slice(0, 120));
    check('file://: «تحقّق الآن» says why it cannot check', /npm run serve/.test(st), st);
    check('file://: no request to GitHub and no network request at all from the page', !net.length && !reqs.some((u) => u.includes('github')), net.join(' '));
    await ctx.close();
  }

  /* ── «حدّث الآن»: steps, then the editor reloads on the new version, edits and place kept (AR, then EN) ── */
  process.env.BW_UPDATE_FEED = FEED.newer;
  process.env.BW_UPDATE_ZIP = zip;
  for (const ui of ['ar', 'en']) {
    resetServerCache();
    const s = await startServer();
    const userFile = path.join(s.dir, 'out', 'mine.editor.html');
    put(s.dir, 'out/mine.editor.html', '<!doctype html><title>mine</title>');
    put(s.dir, 'logos/client.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const before = [sha(fs.readFileSync(userFile)), sha(fs.readFileSync(path.join(s.dir, 'logos/client.svg')))];
    const { ctx, page, errors } = await open(s.url, { ui });
    await waitPopup(page);
    await uh(page, (r) => r.querySelector('.row button.primary').focus());
    await page.evaluate(() => window.BW_UPDATE.close());
    await page.waitForTimeout(300);
    // some work: an edit, the English edition when there is one, a scroll position
    await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; window.BW.commit([{ op: 'setText', path: '/control/title', value: `${e.doc.control.title} · UPDATED-KEEP`, old: e.doc.control.title }]); });
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(500);
    const where = await page.evaluate(() => ({ y: Math.round(window.scrollY), svc: window.BW.S.svc, ed: window.BW.S.ed, ops: window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length }));
    await page.evaluate(() => window.BW_UPDATE.popup(JSON.parse(localStorage.getItem('bw:update-result'))));
    await waitPopup(page);
    const nav = page.waitForEvent('framenavigated', { timeout: 30000 }).then(() => true, () => false);
    await uh(page, (r) => r.querySelector('.row button.primary').click());
    await page.waitForFunction(() => document.getElementById('bw-update').dataset.open === 'progress');
    await page.waitForTimeout(120);
    const steps = await uh(page, (r) => [...r.querySelectorAll('.steps li')].map((li) => li.dataset.step));
    await shot(page, `progress-${ui}`);
    if (ui === 'ar') await axe(page, 'update progress');
    const reloaded = await nav;
    await page.waitForFunction(() => window.BW?.ready, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({ y: Math.round(window.scrollY), svc: window.BW.S.svc, ed: window.BW.S.ed, ops: window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length, title: window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.control.title, resume: localStorage.getItem('bw:resume'), banner: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.banner:not([hidden])') }));
    const card = await uh(page, (r) => (r.querySelector('.card').hidden ? '' : r.querySelector('.card').innerText));
    check(`${ui}: progress shows download, backup, replace, verify, done`, steps.join(',') === 'download,backup,replace,verify,done', steps.join(','));
    check(`${ui}: the install now says ${NEWER}; the editor reloaded by itself`, reloaded && JSON.parse(fs.readFileSync(path.join(s.dir, 'package.json'), 'utf8')).version === NEWER);
    check(`${ui}: after the reload — same service, edition and place, the edit kept, no restore question`, after.svc === where.svc && after.ed === where.ed && Math.abs(after.y - where.y) < 40 && after.ops === where.ops && after.title.includes('UPDATED-KEEP') && !after.resume && !after.banner, `${JSON.stringify(where)} → ${JSON.stringify({ ...after, title: after.title.slice(-20) })}`);
    check(`${ui}: «updated» card shown once after the reload`, /UPDATED|تم التحديث|Updated to/.test(card), card.slice(0, 80));
    check(`${ui}: user files byte-identical through the update`, sha(fs.readFileSync(userFile)) === before[0] && sha(fs.readFileSync(path.join(s.dir, 'logos/client.svg'))) === before[1]);
    check(`${ui}: no page errors through the update`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
  delete process.env.BW_UPDATE_ZIP;

  /* ── old Save-HTML files open and edit, the stored draft migrates with a backup ── */
  process.env.BW_UPDATE_FEED = FEED.same;
  for (const ver of ['0.9.1', '0.10.0']) {
    const f = path.join(tmp, 'old', `${ver}.editor.html`);
    put(path.dirname(f), path.basename(f), zlib.gunzipSync(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'saved', `${ver}.editor.html.gz`))));
    const s = await startServer({ file: f });
    const setId = /"setId":"([^"]+)"/.exec(fs.readFileSync(f, 'utf8'))[1];
    const opsOld = JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(fs.readFileSync(f, 'utf8'))[1]).services[0].editions.ar.ops;
    const draft = JSON.stringify({ v: 1, at: '2026-10-01T00:00:00Z', svc: { 'event-permit': { ar: { hash: 'other-hash', ops: opsOld } } } });
    const { ctx, page, errors } = await open(s.url, { store: { 'bw:update-auto': '0', [`bw:draft:${setId}`]: draft } });
    const st = await page.evaluate(([sid]) => ({ v: window.BW.S && JSON.parse(document.getElementById('bw-data').textContent).version, title: window.BW.M['event-permit'].ar.doc.control.title, comments: window.BW.M['event-permit'].ar.comments.length, versions: window.BW.M['event-permit'].ar.versions.length, draftV: JSON.parse(localStorage.getItem(`bw:draft:${sid}`)).v, backup: localStorage.getItem(`bw:draft-backup:${sid}:v1`) }), [setId]);
    check(`${ver} Save-HTML: opens in ${CUR} with its edit, comment and snapshot`, st.v === CUR && st.title.includes('FIXTURE EDIT') && st.comments === 1 && st.versions === 1, JSON.stringify({ ...st, backup: !!st.backup }));
    check(`${ver}: the stored draft migrated to schema 2, the original kept byte for byte`, st.draftV === 2 && st.backup === draft);
    await page.evaluate(() => { const e = window.BW.M['event-permit'].ar; window.BW.commit([{ op: 'setText', path: '/control/title', value: `${e.doc.control.title} + NEW`, old: e.doc.control.title }]); });
    const ed = await page.evaluate(() => ({ title: window.BW.M['event-permit'].ar.doc.control.title, ops: window.BW.M['event-permit'].ar.ops.length, dom: document.querySelector('main.bw-doc').innerText.includes('+ NEW') }));
    check(`${ver}: edits correctly in the new editor (op recorded, page re-rendered)`, ed.title.endsWith('+ NEW') && ed.ops === opsOld.length + 1 && ed.dom, JSON.stringify(ed));
    check(`${ver}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('settings run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  for (const s of servers) { s.close(); s.closeAllConnections?.(); }
  delete process.env.BW_UPDATE_FEED;
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (process.env.BW_SHOTS_DIR) { fs.mkdirSync(process.env.BW_SHOTS_DIR, { recursive: true }); for (const f of fs.readdirSync(SHOTS)) fs.copyFileSync(path.join(SHOTS, f), path.join(process.env.BW_SHOTS_DIR, f)); }
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: settings ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
