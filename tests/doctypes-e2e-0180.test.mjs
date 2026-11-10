// 0.18.0 (document studio) · lane L8, end to end through the shipped bundle: the editor that ships (the build `npm run skill-html` makes: samples/blank + event-permit,
// the type registry in <script id="bw-doctypes">) opened over file:// with ?start=1, in real headless Chrome (tagged bw-1109, closed in finally), real mouse and keyboard.
// The bundle is built here with the same options as engine/build-skill-html.mjs into the scratch folder (that script writes the tracked file, a test must not); tests/skill-html
// keeps the shipped file current. R15: every probe first sees the start page open and the app ready.
//   1. the page offers one tile per registry type (read from the registry); every tile creates its document: a library document whose two editions carry docType,
//      coverDesign and the type's cover title, whose open edition is the chosen one (the preview's language segment alternates it), whose page shows
//      `.cover[data-cover][data-motif]` of the type; the loop runs once with an English and once with an Arabic interface, so each type is made in both languages
//   2. on a sample of 5 types (user-manual, test-cases, process-flow, uat-signoff, minutes), in the new document: every ribbon tab opens and holds tools; hovering a tool
//      shows its Explain card in the open Explain panel; the Export tab has the PDF / print / options tools; the watermark is on screen; a diagram is inserted
//      (the document gains a diagram block, the Diagram tabs appear, the Export tab gains the diagram formats); the Settings drawer shows the profile card
//   3. no page error from first paint to the end
//   node tests/run.mjs doctypes-e2e-0180
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import * as DT from '../engine/doctypes.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  doctypes-e2e-0180: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-doctypes-e2e-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const types = DT.listTypes();
const SAMPLE = ['user-manual', 'test-cases', 'process-flow', 'uat-signoff', 'minutes'];
const other = (l) => (l === 'ar' ? 'en' : 'ar');

// the shipped bundle, built the way engine/build-skill-html.mjs builds it (a drift guard on its options is the first check)
const skillSrc = fs.readFileSync(path.join(REPO, 'engine', 'build-skill-html.mjs'), 'utf8');
check('engine/build-skill-html.mjs still builds with the registry (docTypes: true) from samples/blank + event-permit', /docTypes:\s*true/.test(skillSrc) && /'blank'/.test(skillSrc) && /'event-permit'/.test(skillSrc));
const bundle = path.join(tmp, 'business-wrap.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank'), path.join(REPO, 'samples', 'event-permit')], out: bundle, set: 'business-wrap', localFonts: true, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark'), ui: 'ar', docTypes: true });
const html = fs.readFileSync(bundle, 'utf8');
check('the bundle carries the registry payload (one bw-doctypes script) and the watermark image', (html.match(/<script type="application\/json" id="bw-doctypes">/g) || []).length === 1 && /bw-watermark/.test(html));

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
const errors = [];
const D = 'dialog.bw-start';
const SR = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
async function open({ ui = 'en', w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((u) => { try { if (!sessionStorage.getItem('bw-e2e-seen')) { sessionStorage.setItem('bw-e2e-seen', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', '0'); localStorage.setItem('bw:wm-intro', '1'); localStorage.removeItem('bw:start-pins'); localStorage.removeItem('bw:start'); sessionStorage.setItem('bw:wm-welcome', '1'); } } catch { /* storage denied */ } }, ui);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${ui}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|favicon|Failed to load resource/.test(m.text())) errors.push(`${ui}: ${m.text()}`); });
  await page.goto(pathToFileURL(bundle).href + '?start=1');
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 60000 });
  await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
const waitClosed = (page) => page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });
const waitOpen = (page) => page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
const startFromFile = async (page) => { await page.evaluate(() => window.BW.EXT.ribbon.setTab('file')); await page.locator('.ribbon [data-a="startPage"]').click(); await waitOpen(page); };
/** The open document as the editor and its page hold it. */
const read = (page) => page.evaluate(() => {
  const { S, M, EXT } = window.BW;
  const e = M[S.svc];
  const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${S.ed}"]`);
  const cov = main?.querySelector('.cover');
  return {
    svc: S.svc, ed: S.ed, isDoc: EXT.library.isDoc(S.svc), editions: Object.keys(e).sort(),
    per: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { docType: v.doc.docType, cover: v.doc.coverDesign, motif: v.doc.motif, title: v.doc.control.title, chapters: v.doc.chapters.map((c) => c.title) }])),
    coverEl: cov?.dataset.cover ?? null, motifEl: cov?.dataset.motif ?? null, h1: main?.querySelector('h1')?.textContent.trim() ?? '', headings: [...(main?.querySelectorAll('h2 [data-p$="/title"]') || [])].length,
  };
});

try {
  // ── 1. every tile creates its document ──
  for (const ui of ['en', 'ar']) {
    const L = ui.toUpperCase();
    const { ctx, page } = await open({ ui });
    const tiles = await page.locator(`${D} .st-tile`).evaluateAll((l) => l.map((t) => t.dataset.type));
    check(`${L}: the start page is open (seen) with one tile per registry type (${tiles.length} of ${types.length})`, tiles.length === types.length && JSON.stringify([...tiles].sort()) === JSON.stringify(types.map((t) => t.id).sort()), tiles.join());
    const bad = [];
    for (let i = 0; i < types.length; i += 1) {
      const t = types[i];
      const want = i % 2 === 0 ? ui : other(ui);
      try {
        if (!(await page.locator(D).count())) await startFromFile(page);
        await page.locator(`${D} .st-tile[data-type="${t.id}"]`).click();
        const pl = await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start .st-seg-w [aria-checked="true"]')?.dataset.stPl);
        if (pl !== want) await page.locator(`${D} [data-st-pl="${want}"]`).click();
        await page.locator(`${D} [data-st-a="create"]`).click();
        await waitClosed(page);
        await page.waitForFunction((id) => window.BW.EXT.library.isDoc(window.BW.S.svc) && window.BW.M[window.BW.S.svc][window.BW.S.ed]?.doc?.docType === id, t.id, { timeout: 15000 });
        const noCover = (DT.compose(t.id, want).layout?.hide || []).includes('cover'); // 0.19.0: the Blank document hides its cover (one empty page: tests/blank-empty-0190)
        await page.waitForSelector(noCover ? '#bw-pair main.bw-doc section.chapter' : '#bw-pair main.bw-doc .cover[data-cover]', { timeout: 10000 });
        const r = await read(page);
        const problems = [];
        if (!r.isDoc) problems.push('not a library document');
        if (r.ed !== want) problems.push(`opened on ${r.ed}, wanted ${want}`);
        if (JSON.stringify(r.editions) !== '["ar","en"]') problems.push(`editions ${r.editions}`);
        for (const ed of DT.EDITIONS) {
          const p = r.per[ed] || {};
          const src = DT.compose(t.id, ed);
          if (p.docType !== t.id || p.cover !== (t.coverDesign || 'spine') || p.motif !== undefined) problems.push(`${ed}: ${p.docType}/${p.cover}/${p.motif}`);
          if (JSON.stringify(p.chapters) !== JSON.stringify(src.chapters.map((c) => c.title))) problems.push(`${ed}: chapters differ from the registry`);
          if (p.title !== src.control.title) problems.push(`${ed}: title «${p.title}»`);
        }
        if (noCover) {
          if (r.coverEl !== null || r.h1 !== '' || r.headings !== 0) problems.push(`an empty page shows cover ${r.coverEl}, h1 «${r.h1}», ${r.headings} headings`);
        } else {
          if (r.coverEl !== ({ report: 'spine', form: 'compact', sheet: 'compact' }[t.coverDesign] || t.coverDesign || 'spine') || /* 0.19.0 R3: data-cover is the page model */ r.motifEl !== null) problems.push(`page cover ${r.coverEl}/${r.motifEl}`);
          if (!r.h1 || /undefined|NaN|\[object/.test(r.h1) || r.headings < 1) problems.push(`h1 «${r.h1}», ${r.headings} headings`);
        }
        if (problems.length) bad.push(`${t.id}(${want}): ${problems.join('; ')}`);
      } catch (e) { bad.push(`${t.id}(${want}): ${String(e.message).split('\n')[0]}`); }
    }
    check(`${L}: all ${types.length} tiles create their document (docType, cover design, motif, title, chapters, language, cover on the page)`, bad.length === 0, bad.join(' || '));
    await ctx.close();
  }

  // ── 2. the existing features work in the sample types ──
  for (let k = 0; k < SAMPLE.length; k += 1) {
    const id = SAMPLE[k];
    const t = types.find((x) => x.id === id);
    const lang = k % 2 === 0 ? 'ar' : 'en';
    const tag = `${id} (${lang})`;
    check(`${id} is a registry type`, !!t);
    if (!t) continue;
    const { ctx, page } = await open({ ui: 'en' });
    try {
      await page.locator(`${D} .st-tile[data-type="${id}"]`).click();
      await page.locator(`${D} [data-st-pl="${lang}"]`).click();
      await page.locator(`${D} [data-st-a="create"]`).click();
      await waitClosed(page);
      await page.waitForFunction((x) => window.BW.EXT.library.isDoc(window.BW.S.svc) && window.BW.M[window.BW.S.svc][window.BW.S.ed]?.doc?.docType === x, id, { timeout: 15000 });
      await page.waitForSelector('#bw-pair main.bw-doc .cover[data-cover]', { timeout: 10000 });
      await page.waitForTimeout(500);

      // ribbon: every tab the ribbon draws opens and holds tools
      const tabs = await page.evaluate(() => window.BW.EXT.ribbon.tabs());
      const tabRes = [];
      for (const tb of tabs) {
        await page.evaluate((x) => window.BW.EXT.ribbon.setTab(x), tb);
        await page.waitForTimeout(60);
        tabRes.push(await SR(page, (r, x) => ({ tab: x, sel: r.querySelector('.rb-tab[aria-selected="true"]')?.dataset.tab, tools: r.querySelectorAll('.ribbon .rb-panel [data-a]').length }), tb));
      }
      check(`${tag}: all ${tabs.length} ribbon tabs open and hold tools (${tabs.join(' ')})`, tabs.length >= 10 && tabs.includes('export') && tabs.includes('insert') && tabRes.every((x) => x.sel === x.tab && x.tools > 0), JSON.stringify(tabRes.filter((x) => x.sel !== x.tab || !x.tools)));

      // Explain: the panel is open, hovering a tool shows its card
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('home'));
      await page.mouse.move(5, 450);
      const undo = await SR(page, (r) => { const q = r.querySelector('.ribbon .rb-panel [data-a="undo"]')?.getBoundingClientRect(); return q ? { x: q.left + q.width / 2, y: q.top + q.height / 2 } : null; });
      check(`${tag}: Explain panel is open (ready state seen) and Undo is on the Home tab`, !!undo && (await SR(page, (r) => r.querySelector('.xpl-dock')?.dataset.open)) === '1', JSON.stringify(undo));
      if (undo) {
        await page.mouse.move(undo.x, undo.y);
        let card = null;
        for (let i = 0; i < 60 && !card; i += 1) { card = await SR(page, (r) => { const c = r.querySelector('.xpl:not([hidden])'); return c ? { k: c.dataset.k, text: c.textContent.trim().length } : null; }); if (!card) await page.waitForTimeout(50); }
        check(`${tag}: hovering Undo opens its Explain card with text`, !!card && card.k === 'undo' && card.text > 20, JSON.stringify(card));
      }

      // Export tab: the print tools are there
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('export'));
      await page.waitForTimeout(80);
      const ex = await SR(page, (r) => Object.fromEntries(['exportPdf', 'print', 'export.opts'].map((a) => [a, !!r.querySelector(a === 'export.opts' ? '.ribbon .rb-panel [data-a="more"][data-x="export.opts"]' : `.ribbon .rb-panel [data-a="${a}"]`)])));
      check(`${tag}: Export tab has PDF, Print and Export options`, Object.values(ex).every(Boolean), JSON.stringify(ex));

      // watermark
      const wm = await page.evaluate(() => { const e = document.getElementById('bw-watermark'); if (!e) return null; const q = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { x: q.left, y: q.top, w: q.width, h: q.height, op: +cs.opacity, vis: cs.visibility, disp: cs.display, vw: innerWidth, vh: innerHeight }; });
      check(`${tag}: the NJ watermark is on screen in the new document`, !!wm && wm.w > 20 && wm.h > 20 && wm.x >= 0 && wm.y >= 0 && wm.x + wm.w <= wm.vw && wm.y + wm.h <= wm.vh && wm.op >= 0.5 && wm.vis !== 'hidden' && wm.disp !== 'none', JSON.stringify(wm));

      // insert a diagram
      const count = () => page.evaluate(() => { const B = window.BW; return JSON.stringify(B.M[B.S.svc][B.S.ed].doc).match(/"kind":"diagram"/g)?.length || 0; });
      const before = await count();
      await page.evaluate(() => window.BW.runAction('addDiagram'));
      await page.waitForFunction((n) => { const B = window.BW; return (JSON.stringify(B.M[B.S.svc][B.S.ed].doc).match(/"kind":"diagram"/g)?.length || 0) > n; }, before, { timeout: 10000 });
      await page.waitForTimeout(800);
      const dt = await page.evaluate(() => window.BW.EXT.ribbon.tabs());
      const drawn = await page.locator(`#bw-pair main.bw-doc[data-locale="${lang}"] [data-dg], #bw-pair main.bw-doc[data-locale="${lang}"] svg.dg`).count();
      check(`${tag}: a diagram can be inserted (${before} to ${await count()} diagram blocks, drawn ${drawn}, the Diagram tabs appear)`, (await count()) === before + 1 && drawn >= 1 && dt.includes('diagram') && dt.includes('diagram2'), dt.join());
      await page.evaluate(() => window.BW.EXT.ribbon.setTab('export'));
      await page.waitForTimeout(80);
      const dx = await SR(page, (r) => Object.fromEntries(['export.mermaid', 'export.svg', 'export.png'].map((a) => [a, !!r.querySelector(`.ribbon .rb-panel [data-a="${a}"]`)])));
      check(`${tag}: with a diagram in the document the Export tab offers Mermaid, SVG and PNG`, Object.values(dx).every(Boolean), JSON.stringify(dx));

      // the profile panel (Settings drawer)
      await page.evaluate(() => window.BW.openDrawer('settings'));
      await page.waitForTimeout(300);
      const pf = await SR(page, (r) => ({ card: !!r.querySelector('.set-x-profile'), name: !!r.querySelector('.set-x-profile [data-pf="name"]') }));
      check(`${tag}: the Settings drawer shows the profile card with its name field`, pf.card && pf.name, JSON.stringify(pf));
    } catch (e) {
      check(`${tag}: the sample checks ran without an exception`, false, e.stack || e.message);
    }
    await ctx.close();
  }
  check('no page error from first paint to the end (all contexts)', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('suite ran without an exception', false, e && e.stack || e);
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\ndoctypes-e2e-0180: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
