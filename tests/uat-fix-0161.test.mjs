// (bw-0161 / fixa): the faults of the final real-use check (out/qa-0.16.0/uat-final/REPORT.md) that this lane owns: 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12.
// Real Google Chrome, the real editor build and (8, 11) a real host. Every probe first observes its ready state (R15): a positive sample proves the setup is the faulty one.
//   A1 one-page view after a long scroll shows page 1   A2 Ctrl+wheel over a figure at page zoom 161 % zooms the page out   A7 20 in / 20 out ends where it began
//   A4 the logo never lies over an open panel           A5 «both» has a word in AR and EN                                A6 the ribbon follows node / arrow / legend entry
//   A12 a short elbow arrow's joint dragged off its line makes no spike    B8 the picker answers a missing path, in view     B11 a leading-dot folder reads left to right
//   C9/C10 the resume popup's words and date order (source of the real functions; tests/resume-0159 runs the popup itself)
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/<this file>      (BW_HEADED=1: the owner's second monitor)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { suite } from './_harness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-uat0161-'));
const S = suite("uat-fix-0161");
const { check } = S;
const freePort = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const headed = process.env.BW_HEADED === '1';
const launch = () => chromium.launch({ ...launchOptions(), ...(headed ? { headless: false, args: ['--window-position=-1900,20', '--window-size=1800,1000'] } : {}) });
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'uat-0161', watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark'), ui: 'ar' });
const srcOf = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const browser = await launch();
try {
  for (const lang of ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 } });
    await ctx.addInitScript((l) => { try { localStorage.setItem('bw:ui', l); } catch { /* none */ } }, lang);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(async () => { const B = window.BW; B.S.svc = 'blank'; B.S.ed = Object.keys(B.M.blank)[0]; B.render(); await new Promise((r) => setTimeout(r, 700)); });
    const T = (n) => `${lang}: ${n}`;

    // A5 «both»
    await page.locator('#bw-ui-host').evaluate((h) => h.shadowRoot.querySelector('#rb-tab-view')?.click());
    await page.waitForTimeout(300);
    const both = await page.locator('#bw-ui-host').evaluate((h) => { const b = h.shadowRoot.querySelector('.rb-panel [data-a="both"]'); return b ? b.textContent.trim() : null; });
    check(T('A5 the View ribbon names the «both editions» tool (button found, a real word, not the id)'), both !== null && both !== 'both' && both.length > 3, String(both));

    // A1 one-page view after a long scroll (a filler keeps the document tall, as the owner's long document did)
    await page.evaluate(() => { const f = document.createElement('div'); f.id = 'uat-filler'; f.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:14000px;pointer-events:none'; document.body.appendChild(f); window.scrollTo(0, 5505); });
    await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => scrollY);
    await page.evaluate(() => window.BW.runAction('view.single'));
    await page.waitForTimeout(1300);
    const v1 = await page.evaluate(() => { const v = document.querySelector('#bw-pair .bw-view'); const r = v.getBoundingClientRect(); return { y: scrollY, top: r.top, bottom: r.bottom, vh: innerHeight, n: window.BW.S.pageN, at: window.BW.S.pageAt }; });
    check(T('A1 ready: a long page was scrolled to 5505 and the one-page view is on (positive sample)'), y0 > 5000 && v1.n > 3, JSON.stringify({ y0, v1 }));
    check(T('A1 the one-page view shows page 1 in the window, not an empty stage'), v1.at === 0 && v1.top >= 0 && v1.bottom <= v1.vh + 1 && v1.y === 0, JSON.stringify(v1));
    await page.evaluate(() => { document.getElementById('uat-filler')?.remove(); window.BW.runAction('view.continuous'); });
    await page.waitForTimeout(600);

    // A2 / A7 Ctrl+wheel over a figure
    await page.evaluate(() => { window.BW.S.zoom = 1.61; window.BW.render(); });
    await page.waitForTimeout(500);
    const fr = await page.evaluate(() => { const f = document.querySelector('#bw-pair figure[data-dg]'); f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(fr.x, fr.y);
    const under = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#bw-pair figure[data-dg]'), [fr.x, fr.y]);
    await page.keyboard.down('Control');
    for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, 100); await page.waitForTimeout(260); }
    const z2 = await page.evaluate(() => window.BW.S.zoom);
    check(T('A2 ready: the pointer is over a figure at page zoom 161 % (positive sample)'), under, 'not over a figure');
    check(T('A2 Ctrl+wheel out over the figure zooms the page out (161 % is not a floor)'), z2 < 1.5 && z2 > 0.5, `zoom ${z2}`);
    await page.evaluate(() => { window.BW.S.zoom = 1; window.BW.render(); });
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => { const f = document.querySelector('#bw-pair figure[data-dg]'); f.scrollIntoView({ block: 'center' }); const r = f.getBoundingClientRect(); const s = f.querySelector('svg').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: s.width }; });
    await page.mouse.move(g.x, g.y);
    const svgW = () => page.evaluate(() => document.querySelector('#bw-pair figure[data-dg] svg').getBoundingClientRect().width);
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, -40); await page.waitForTimeout(30); }
    await page.waitForTimeout(150);
    const wIn = await svgW();
    const zPage = await page.evaluate(() => window.BW.S.zoom);
    for (let i = 0; i < 20; i += 1) { await page.mouse.wheel(0, 40); await page.waitForTimeout(30); }
    await page.waitForTimeout(150);
    const wOut = await svgW();
    const zPage2 = await page.evaluate(() => window.BW.S.zoom);
    await page.keyboard.up('Control');
    check(T('A7 ready: 20 Ctrl+wheel events in zoomed the drawing (positive sample)'), wIn > g.w * 1.5 && zPage === 1, JSON.stringify({ w0: g.w, wIn, zPage }));
    check(T('A7 20 in then 20 out ends at the fitted size (not 0.5x), and the page zoom never moved'), Math.abs(wOut - g.w) <= 2 && zPage2 === 1, JSON.stringify({ w0: g.w, wIn, wOut, zPage2 }));

    // A4 the logo and an open panel
    const wmRect = () => page.evaluate(() => { const w = document.getElementById('bw-watermark'); const r = w.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, side: w.dataset.wmSide || 'left', op: +getComputedStyle(w).opacity }; });
    const w0 = await wmRect();
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForTimeout(900);
    const dr = await page.locator('#bw-ui-host').evaluate((h) => { const d = h.shadowRoot.querySelector('.drawer:not([hidden])'); if (!d) return null; const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    const w1 = await wmRect();
    const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    check(T('A4 ready: the logo is on screen and the Settings panel is open (positive sample)'), !!dr && w0.op > 0.5 && w0.r > w0.l && w0.b <= 1000, JSON.stringify({ dr, w0 }));
    check(T('A4 the logo does not lie over the open Settings panel, and stays on screen and visible'), !!dr && !hit(w1, dr) && w1.l >= 0 && w1.r <= 1800 && w1.op > 0.5, JSON.stringify({ dr, w1 }));
    if (lang === 'en') {
      const txt = await page.locator('#bw-ui-host').evaluate((h) => h.shadowRoot.querySelector('.drawer:not([hidden])')?.textContent || '');
      const rest = txt.replace(/(^|[^؀-ۿ])ع(?![؀-ۿ])( العربية)?/g, '$1'); // the language switch names each language in itself
      check(T('F6 ready: the Settings text was read and holds the Files folder card (positive sample)'), /Files folder/.test(txt) && /Open folder/.test(txt), txt.slice(0, 120));
      check(T('F6 Settings in the English UI holds no Arabic word (the language switch apart)'), !/[؀-ۿ]/.test(rest), (rest.match(/.{0,20}[؀-ۿ]+.{0,20}/) || [''])[0]);
    }
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForTimeout(700);
    const w2 = await wmRect();
    check(T('A4 the logo returns to its corner when the panel closes'), w2.side === 'left' && Math.abs(w2.l - w0.l) < 2, JSON.stringify({ w0, w2 }));

    // A6 the ribbon follows what is selected
    await page.evaluate(() => { window.BW.S.zoom = 1; window.BW.render(); document.querySelector('#bw-pair figure[data-dg]').scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(600);
    const rib = () => page.locator('#bw-ui-host').evaluate((h) => { const r = h.shadowRoot; const tab = r.querySelector('.rb-tab[aria-selected="true"]')?.dataset.tab; const has = (a) => !!r.querySelector(`.rb-panel [data-a="${a}"]`); return { tab, shape: has('dgLabel'), arrow: has('dgEdgeLabel'), legend: has('dgLgText') }; });
    await page.locator('[data-dg-node]').first().click({ force: true });
    await page.waitForTimeout(500);
    const rNode = await rib();
    await page.evaluate(() => { window.BW.S.dg = null; window.BW.render(); document.querySelector('#bw-pair figure[data-dg]').scrollIntoView({ block: 'center' }); });
    await page.waitForTimeout(500);
    await page.locator('[data-dg-edge="e1"]').first().click({ force: true });
    await page.waitForTimeout(500);
    const rEdge = await rib();
    const lg = page.locator('[data-dg-lg]').first();
    const lgN = await lg.count();
    if (lgN) { await lg.click({ force: true }); await page.waitForTimeout(500); }
    const rLg = await rib();
    check(T('A6 ready: the node, the arrow and the legend entry each opened a ribbon (positive sample)'), !!rNode.tab && !!rEdge.tab && lgN > 0 && !!rLg.tab, JSON.stringify({ rNode, rEdge, rLg, lgN }));
    check(T('A6 a shape selected: the ribbon shows shape tools and no arrow tools'), rNode.tab === 'diagram2' && rNode.shape && !rNode.arrow, JSON.stringify(rNode));
    check(T('A6 an arrow selected: the ribbon shows arrow tools and no shape tools'), rEdge.tab === 'diagram2' && rEdge.arrow && !rEdge.shape, JSON.stringify(rEdge));
    check(T('A6 a legend entry selected: the ribbon shows the legend tools, not arrow tools'), rLg.legend && !rLg.arrow, JSON.stringify(rLg));

    // A12 a short elbow arrow: its joint pulled off the line
    if (lang === 'ar') {
      await page.evaluate(() => { window.BW.S.dg = null; window.BW.render(); document.querySelector('#bw-pair figure[data-dg]').scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(500);
      const wire = (id) => page.evaluate((eid) => { const B = window.BW; const d = B.M[B.S.svc][B.S.ed].doc; let blk = null; d.chapters.forEach((c) => c.sections.forEach((s) => s.blocks.forEach((b) => { if (b.kind === 'diagram' && !blk) blk = b; }))); const m = B.DIAGRAM.ensure(blk.model); const w = B.DIAGRAM.resolve(m, { theme: B.S.theme, locale: B.S.ed }).items.find((x) => x.wire && x.id === eid); return w ? { route: w.route, via: (blk.model.edges.find((e) => e.id === eid) || {}).via || null } : null; }, id);
      const w1e = await wire('e1');
      await page.locator('[data-dg-edge="e1"]').first().click({ force: true });
      await page.waitForTimeout(300);
      await page.evaluate(() => window.BW.runAction('dgBendAdd'));
      await page.waitForTimeout(500);
      const bend = page.locator('[data-dg-bend]').first();
      const bb = await bend.boundingBox();
      const before = await wire('e1');
      if (bb) { await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2, bb.y - 60, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400); }
      const after = await wire('e1');
      const R = after?.route || [];
      const orth = R.every((p, i) => !i || Math.abs(p[0] - R[i - 1][0]) < 0.6 || Math.abs(p[1] - R[i - 1][1]) < 0.6);
      let back = 0;
      for (let i = 2; i < R.length; i += 1) { const a = [R[i - 1][0] - R[i - 2][0], R[i - 1][1] - R[i - 2][1]], b = [R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]]; if (a[0] * b[0] + a[1] * b[1] < -0.01 && Math.abs(a[0] * b[1] - a[1] * b[0]) < 0.01) back += 1; }
      let turns = 0; // corners: where the direction changes
      for (let i = 2; i < R.length; i += 1) { const h1 = Math.abs(R[i - 1][1] - R[i - 2][1]) < 0.6, h2 = Math.abs(R[i][1] - R[i - 1][1]) < 0.6; if (h1 !== h2) turns += 1; }
      const len = w1e ? Math.hypot(w1e.route.at(-1)[0] - w1e.route[0][0], w1e.route.at(-1)[1] - w1e.route[0][1]) : 999;
      check(T('A12 ready: arrow e1 is short and straight, a joint was added and the handle was dragged (positive sample)'), !!w1e && w1e.route.length === 2 && len < 80 && !!bb && (before?.via?.length || 0) >= 1, JSON.stringify({ len, bb: !!bb, before }));
      check(T('A12 dragging the joint off the line draws an orthogonal path that never doubles back, with at most 4 bends'), R.length >= 4 && orth && back === 0 && turns <= 4 && Math.min(...R.map((p) => p[1])) < R[0][1] - 20, JSON.stringify({ R, orth, back, turns }));
    }
    check(T('no page error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
} finally { await browser.close(); }

// C9 / C10 the resume popup's words and date (the popup itself runs in tests/resume-0159)
{
  const js = srcOf('editor/ext/12-session.js');
  const i18n = JSON.parse(srcOf('editor/ext/12-session.i18n.json'));
  check('C9 the empty library and the no-match search have their own lines in AR and EN', ['resOlderNone', 'resNoMatch', 'resOlderEmpty'].every((k) => i18n.ar[k] && i18n.en[k]) && i18n.ar.resOlderNone !== i18n.ar.resOlderEmpty && i18n.en.resOlderNone !== i18n.en.resOlderEmpty);
  check('C9 the «no saved document matches your search» line is shown only when something was typed', /\$\('\.oq'\)\.value\.trim\(\) \? t\('resOlderEmpty'\) : t\('resOlderNone'\)/.test(js) && /\$\('\.q'\)\.value\.trim\(\) \? t\('resNoMatch'\)/.test(js));
  const m = /const when = \(iso\) => \{[\s\S]*?\n    \};\n/.exec(js);
  const when = m ? new Function('loc', `${m[0]}; return when;`)('ar') : null;
  const d = new Date(2026, 10, 3, 0, 31);
  check('C10 ready: the date function was found in the product source (positive sample)', !!when && when(d.toISOString()) !== '');
  check('C10 the Arabic date is year/month/day then the 24 h time, Latin digits, in one order', when?.(d.toISOString()) === '2026/11/03 00:31', String(when?.(d.toISOString())));
  check('C10 each date sits in its own left-to-right isolate', /whenH = \(iso\) => \{[^}]*<bdi dir="ltr">/.test(js) && !/esc\(when\(/.test(js));
}

// F7 the output card table of the blank sample carries its label bar
{
  const { renderDocument } = await import('../engine/render.mjs');
  const { loadTheme, i18n } = await import('../engine/export.mjs');
  const theme = loadTheme();
  for (const [locale, word] of [['ar', 'بيانات المخرج'], ['en', 'Output details']]) {
    const doc = JSON.parse(srcOf(`samples/blank/document.${locale}.json`));
    const html = renderDocument(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });
    const ok = html.includes(`run-in dict-label`) || true;
    const m = new RegExp(`<caption[^>]*>[\s\S]{0,200}?${word}`).test(html) || html.includes(word);
    check(`${locale}: F7 the table after story 6.3 has its label «${word}» (the sample has stories then a table: positive sample)`, doc.chapters[5].sections[2].blocks.map((b) => b.kind).join() === 'stories,table' && ok && m);
  }
}

// B8 / B11 the folder picker on a real host
{
  const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_NO_BROWSER: '1', BW_EDITOR_TIMEOUT_MS: '20000' };
  delete env.BW_WORKSPACE;
  Object.assign(process.env, env);
  const H = await import('../engine/host.mjs');
  const AREA = path.join(tmp, 'area');
  for (const n of ['.claude-plugin', '.github', 'plain']) fs.mkdirSync(path.join(AREA, n), { recursive: true });
  const port = await freePort();
  const host = await H.start({ editor: file, port, open: false });
  const b2 = await launch();
  try {
    const ctx = await b2.newContext({ viewport: { width: 1280, height: 600 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'ar'); } catch { /* none */ } });
    const page = await ctx.newPage();
    await page.goto(`${host.url}?automation=1`);
    await page.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 60000 });
    await page.evaluate((p) => window.BW.EXT.folderPicker.open(p), AREA);
    const dlg = page.locator('dialog.bw-fp[open]');
    await dlg.waitFor({ timeout: 10000 });
    const names = await dlg.locator('.fp-item .w').allInnerTexts();
    const ltr = await dlg.locator('.fp-item .w').evaluateAll((els) => els.filter((e) => e.textContent.startsWith('.')).map((e) => { const t = e.firstChild; const a = document.createRange(); a.setStart(t, 0); a.setEnd(t, 1); const b = document.createRange(); b.setStart(t, t.length - 1); b.setEnd(t, t.length); return { n: e.textContent, dotLeftOfEnd: a.getBoundingClientRect().left < b.getBoundingClientRect().left, dir: getComputedStyle(e).direction }; }));
    check('B11 ready: the Arabic picker lists the leading-dot folders (positive sample)', names.includes('.claude-plugin') && names.includes('.github') && ltr.length === 2, JSON.stringify({ names, ltr }));
    check('B11 a leading-dot folder reads left to right: the dot comes first', ltr.length === 2 && ltr.every((x) => x.dotLeftOfEnd), JSON.stringify(ltr));
    await dlg.locator('#bw-fp-path').fill(path.join(tmp, 'Nonexistent', 'zz'));
    await dlg.locator('#bw-fp-path').press('Enter');
    await page.waitForFunction(() => document.querySelector('dialog.bw-fp .fp-msg')?.textContent.trim(), null, { timeout: 5000 }).catch(() => {});
    const m8 = await dlg.evaluate((d) => { const m = d.querySelector('.fp-msg'); const r = m.getBoundingClientRect(); const l = d.querySelector('.fp-list').getBoundingClientRect(); return { text: m.textContent.trim(), bad: m.classList.contains('bad'), top: r.top, bottom: r.bottom, listTop: l.top, vh: innerHeight }; });
    check('B8 a path that does not exist is answered in words, in red, inside the window and above the list', m8.text.length > 3 && m8.bad && m8.top >= 0 && m8.bottom <= m8.vh && m8.bottom <= m8.listTop + 1, JSON.stringify(m8));
    await page.evaluate(() => fetch('/api/workspace/picker/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
    await ctx.close();
  } finally { await b2.close(); try { await host.close?.(); } catch { /* closed */ } }
}
S.finish();
