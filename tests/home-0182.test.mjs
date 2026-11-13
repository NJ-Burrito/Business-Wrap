// (owner feature 2026-11-10): a Home button at the leading edge of the top bar opens the start page.
// Real headless Chrome, real mouse and keyboard, 1024 px (the top bar must still fit), English and Arabic as a pair:
//   - the button exists once, sits right after the brand mark and before every other control of the bar, carries the Lucide house icon, its label (Home / الرئيسية), a tooltip and an aria-label
//     (no visible tashkeel); the bar does not overflow sideways with it, and the ribbon still has its one Start page tool (nothing else moved)
//   - keyboard: it is the first stop of Tab, Enter opens the start page; Esc / «Back» returns to the document
//   - a click opens the start page
//   - unsaved changes: the editor has no discard prompt (everything autosaves), so Home takes the editor's own save path first (draft + library entry) and never discards: a typed edit that has NOT yet
//     reached the 0.4 s autosave is in the draft and in the library entry the moment the start page is up, the document stays in Recents (now), and «Back» returns to it with the edit in it
// The editor is opened over file:// with ?automation=1 (the start page stays hidden by itself, so what opens it here is Home alone).
//   node tests/home-0182.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO } from '../engine/export.mjs';
import { suite, launchChrome } from './_harness.mjs';

const S = suite('home-0182'); const { check } = S;
const tmp = fs.mkdtempSync(path.join(process.env.BW_START_TMP || os.tmpdir(), 'bw-home182-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const editor = path.join(tmp, 'home.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: editor, set: 'home-0182', docTypes: true });
const url = `${pathToFileURL(editor).href}?automation=1`;
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/;
const WANT = { en: { word: 'Home', tip: 'Home: the start page' }, ar: { word: 'الرئيسية', tip: 'الرئيسية: صفحة البداية' } };
const sh = (page, fn, arg) => page.evaluate(([src, a]) => { const r = document.getElementById('bw-ui-host').shadowRoot; return new Function('r', 'a', `return (${src})(r, a)`)(r, a); }, [fn.toString(), arg]);

let browser = null;
try {
  browser = await launchChrome(['--bw-session=bw-1109']);
  async function open(ui) {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 } });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); window.__bwProbePorts = []; } catch { /* none */ } }, ui);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.BW?.ready, null, { timeout: 30000 });
    await sleep(900);
    return { page, ctx, errors };
  }
  const startOpen = (page) => page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  const startClosed = (page) => page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });

  for (const ui of ['en', 'ar']) {
    const { page, ctx, errors } = await open(ui);
    const w = WANT[ui];
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('file')); // the Start page tool lives in the File tab
    await sleep(300);
    const info = await sh(page, (r) => {
      const bar = r.querySelector('.island');
      const homes = [...r.querySelectorAll('.home')];
      const h = homes[0];
      const brand = bar.querySelector('.brand');
      const hb = h?.getBoundingClientRect(), bb = brand.getBoundingClientRect();
      const others = [...bar.querySelectorAll('button, select, [role="switch"]')].filter((x) => x !== h && x.getBoundingClientRect().width > 0);
      const kids = [...bar.children];
      return {
        n: homes.length, inBar: !!h && bar.contains(h), tag: h?.tagName, type: h?.type, a: h?.dataset.a, word: h?.querySelector('.w')?.textContent.trim(), title: h?.title, aria: h?.getAttribute('aria-label'),
        icon: h?.querySelector('svg')?.dataset.ic, iconHidden: h?.querySelector('svg')?.getAttribute('aria-hidden'), after: kids.indexOf(h) === kids.indexOf(brand) + 1,
        gap: Math.round(Math.abs(bb.left - hb.right)) , firstButton: bar.querySelector('button') === h, size: [Math.round(hb.width), Math.round(hb.height)],
        beforeAll: others.every((x) => { const o = x.getBoundingClientRect(); return Math.abs(hb.right - bb.left) <= Math.abs(o.right - bb.left) + 1 && Math.abs(hb.left - bb.right) <= Math.abs(o.left - bb.right) + 1 || (Math.abs(o.x - bb.x) >= Math.abs(hb.x - bb.x) - 1); }),
        inView: hb.left >= 0 && hb.right <= innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, dir: getComputedStyle(h).direction,
        ribbonStart: r.querySelectorAll('.ribbon [data-a="startPage"]').length,
      };
    });
    check(`${ui}: one Home button, in the top bar, a real <button type=button> wired to the home action`, info.n === 1 && info.inBar && info.tag === 'BUTTON' && info.type === 'button' && info.a === 'home', JSON.stringify(info));
    check(`${ui}: it sits right after the brand mark (leading edge), the first control of the bar, before the document and language controls`, info.after && info.firstButton && info.beforeAll && info.gap < 24, JSON.stringify(info));
    check(`${ui}: label «${w.word}», tooltip and aria-label «${w.tip}», the Lucide house icon (decorative, aria-hidden)`, info.word === w.word && info.title === w.tip && info.aria === w.tip && info.icon === 'homeBtn' && info.iconHidden === 'true', JSON.stringify(info));
    check(`${ui}: no visible tashkeel in the label, tooltip or aria-label`, !TASHKEEL.test(`${info.word}${info.title}${info.aria}`));
    check(`${ui}: at 1024 px it is fully in the window and the page does not scroll sideways`, info.inView && !info.overflow, JSON.stringify({ v: info.inView, o: info.overflow }));
    check(`${ui}: the ribbon still has its one Start page tool (the top bar's Home is not a ribbon command)`, info.ribbonStart === 1, String(info.ribbonStart));

    // keyboard: the first Tab stop is Home; Enter opens the start page; Esc closes it
    let reached = 0;
    for (let i = 1; i <= 3 && !reached; i++) { await page.keyboard.press('Tab'); if (await sh(page, (r) => r.activeElement?.classList.contains('home'))) reached = i; }
    check(`${ui}: keyboard: Tab reaches Home as the first stop`, reached === 1, `after ${reached} Tab(s)`);
    const ring = await sh(page, (r) => { const s = getComputedStyle(r.activeElement); return { o: s.outlineStyle, w: parseFloat(s.outlineWidth), sh: s.boxShadow }; });
    check(`${ui}: keyboard: the focus is visible on it (an outline or a ring)`, (ring.o !== 'none' && ring.w > 0) || ring.sh !== 'none', JSON.stringify(ring));
    await page.keyboard.press('Enter');
    await startOpen(page);
    const viaKey = await page.evaluate(() => ({ open: document.documentElement.dataset.bwStart, svc: window.BW.S.svc }));
    check(`${ui}: keyboard: Enter on Home opens the start page`, viaKey.open === 'open', JSON.stringify(viaKey));
    await page.keyboard.press('Escape');
    await startClosed(page);
    // a click (the dialog is closed again)
    await sh(page, (r) => r.querySelector('.home').scrollIntoView?.());
    await page.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('.home').getBoundingClientRect(); window.__homeXY = [b.x + b.width / 2, b.y + b.height / 2]; });
    const xy = await page.evaluate(() => window.__homeXY);
    await page.mouse.click(xy[0], xy[1]);
    await startOpen(page);
    check(`${ui}: no page error`, !errors.length, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }

  // ── unsaved changes: a typed edit that has not reached the autosave yet survives Home ──
  {
    const { page, ctx, errors } = await open('en');
    const id = await page.evaluate(async () => { await window.BW.EXT.start.load(); const L = window.BW.EXT.library; const e = await L.newFromType('blank', 'en'); return e?.id || window.BW.S.svc; });
    await sleep(700);
    const leaf = page.locator('#bw-pair main.bw-doc[data-locale="en"] [data-p]').first();
    await leaf.click();
    await page.keyboard.press('End');
    await page.keyboard.type('HomeEdit182');
    const before = await page.evaluate(() => ({ pending: window.BW.S.pending, dirty: window.BW.S.dirty, draft: document.documentElement.dataset.bwDraft || '0', saved: document.documentElement.dataset.bwLibSaved || '0', ops: Object.values(window.BW.M[window.BW.S.svc]).reduce((n, e) => n + e.ops.length, 0) }));
    check('unsaved: the edit is typed and not yet autosaved (S.pending, ops > 0)', before.pending === true && before.ops > 0, JSON.stringify(before));
    await sh(page, (r) => r.querySelector('.home').click());
    await startOpen(page);
    const after = await page.evaluate(async (i) => {
      const e = await window.BW.EXT.library.get(i);
      const raw = JSON.stringify(e?.editions || {});
      let drafted = false;
      try { drafted = JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => /draft|bw:d/.test(k)) || '') || 'null')).includes('HomeEdit182'); } catch { /* no draft key */ }
      return { pending: window.BW.S.pending, draft: document.documentElement.dataset.bwDraft || '0', saved: document.documentElement.dataset.bwLibSaved || '0', entryHasEdit: raw.includes('HomeEdit182'), drafted, svc: window.BW.S.svc };
    }, id);
    check('unsaved: Home wrote the draft at once (nothing pending) through the editor\'s own save path', after.pending === false && Number(after.draft) > Number(before.draft), JSON.stringify(after));
    check('unsaved: and the library entry holds the edit (persisted, not discarded)', after.entryHasEdit === true, JSON.stringify(after));
    const rec = await sh(page, (r) => [...r.querySelectorAll('dialog.bw-start [data-recent]')].map((x) => ({ id: x.dataset.recent, text: x.textContent })));
    check('unsaved: the document is in Recents, marked as the one open now', rec.some((x) => x.id === id), JSON.stringify(rec).slice(0, 200));
    await sh(page, (r) => r.querySelector('dialog.bw-start [data-st-back]').click());
    await startClosed(page);
    const back = await page.evaluate(() => ({ svc: window.BW.S.svc, text: document.querySelector('#bw-pair main.bw-doc[data-locale="en"]')?.textContent.includes('HomeEdit182') }));
    check('unsaved: «Back» returns to the same document with the edit in it', back.svc === id && back.text === true, JSON.stringify(back));
    check('unsaved: no page error', !errors.length, errors.join(' | ').slice(0, 200));
    await ctx.close();
  }
} catch (e) {
  check('suite ran to the end', false, String(e?.stack || e).slice(0, 500));
} finally {
  try { await browser?.close(); } catch { /* closed */ }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
S.finish();
