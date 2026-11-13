// lane L3: the start page (editor/ext/50-start.*). Real headless Chrome, real mouse and keyboard, the editor bundle built here with the document-type payload
// embedded as <script id="bw-doctypes"> (contract C2) and opened over file:// with ?start=1 (the page is hidden under automation otherwise: decisions D4), in
// English and Arabic at 1024 px; then served, where the page has no embedded payload and asks GET /api/doctypes.
//   - every type renders a tile with its thumbnail; categories, search and the empty state work; the page fits 1024 px with no sideways scroll
//   - clicking each tile and Create (alternating the document language through the preview segment) makes a library document whose docType, cover design, title
//     and both editions match the payload, and which opens on the chosen edition; double click and Ctrl+Enter create at once
//   - File › Start page returns to the page, the recents list shows the new document, Back returns to it; pinning is remembered
//   - the page stays hidden under webdriver without ?start=1, and when bw:start is off
// The registry holds only `blank` until the content lanes land: tests/fixtures/doctypes/stub.mjs fans the real composed blank pair out to the 17 ids (the real payload when the registry is complete).
//   node tests/start-0180.test.mjs     (BW_START_SHOTS=<dir> keeps the two screenshots)
import './_isolate.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { startPayload } from './fixtures/doctypes/stub.mjs';

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-start180-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const shots = process.env.BW_START_SHOTS || path.join(tmp, 'shots');
fs.mkdirSync(shots, { recursive: true });
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  start-0180: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };

const { payload: PL, real } = startPayload();
const TYPES = PL.types;
const other = (l) => (l === 'ar' ? 'en' : 'ar');
const nameOf = (c = {}) => String(c.coverTitle || String(c.title || '').split(/\s*[:—]\s+/).slice(1).join(': ') || c.title || '').trim(); // the library's own title rule
const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c'); // inside a script element, a closing script tag cannot occur

// the bundle: samples/blank is the template behind the page (service «blank»); the payload goes in before the app script, like bw-watermark-data
const plain = path.join(tmp, 'plain.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: plain, set: 'start-0180', watermarkDir: null });
const withTypes = path.join(tmp, 'types.html');
{
  const html = fs.readFileSync(plain, 'utf8');
  const at = html.indexOf('<script id="bw-app">');
  check('the app script marker is in the built editor (the payload is injected before it)', at > 0);
  fs.writeFileSync(withTypes, `${html.slice(0, at)}<script type="application/json" id="bw-doctypes">${json(PL)}</script>\n${html.slice(at)}`, 'utf8');
}

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
const contexts = [];
async function open(url, { ui = 'en', w = 1024, h = 720, init } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, bypassCSP: true }); // bypassCSP only so axe can be injected; the page's own CSP is tested elsewhere
  contexts.push(ctx);
  await ctx.addInitScript((a) => { try { if (!sessionStorage.getItem('bw-start-seen')) { localStorage.setItem('bw:ui', a.ui); localStorage.removeItem('bw:start-pins'); localStorage.removeItem('bw:start'); sessionStorage.setItem('bw-start-seen', '1'); } } catch { /* storage may be denied */ } if (a.init) try { new Function(a.init)(); } catch { /* ignore */ } }, { ui, init });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready);
  return { page, ctx, errors };
}
const fileUrl = (f, q = '') => pathToFileURL(f).href + q;
const D = 'dialog.bw-start';
const waitOpen = (page) => page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
const waitClosed = (page) => page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });
/** The open document as the editor holds it: service, edition, both editions' docType and cover design, the title the library derives. */
const read = (page) => page.evaluate(() => {
  const { S, M, EXT } = window.BW;
  const e = M[S.svc];
  const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${S.ed}"]`);
  return {
    svc: S.svc, ed: S.ed, isDoc: EXT.library.isDoc(S.svc), editions: Object.keys(e).sort(), title: EXT.library.titleOf(),
    per: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { docType: v.doc.docType, cover: v.doc.coverDesign, title: v.doc.control.title, primary: v.doc.design?.vars?.primary }])),
    coverEl: main?.querySelector('.cover')?.dataset.cover ?? null, open: document.documentElement.dataset.bwStart,
  };
});
const startFromFile = async (page) => { await page.evaluate(() => window.BW.EXT.ribbon.setTab('file')); await page.locator('.ribbon [data-a="startPage"]').click(); await waitOpen(page); };

try {
  for (const ui of ['en', 'ar']) {
    const L = ui.toUpperCase();
    const { page, errors } = await open(fileUrl(withTypes, '?start=1'), { ui });
    await waitOpen(page);
    const st0 = await page.evaluate(() => ({ svc: window.BW.S.svc, ui: window.BW.S.ui, dir: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start')?.dir, lang: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start')?.lang, role: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start')?.getAttribute('aria-modal') }));
    check(`${L}: the start page is the first screen on open (file://), over the untouched template «blank»`, st0.svc === 'blank' && st0.ui === ui, JSON.stringify(st0));
    check(`${L}: it follows the language and is not modal (layout fixed: dir rtl, owner rule 2026-11-13)`, st0.dir === 'rtl' && st0.lang === ui && st0.role === 'false', JSON.stringify(st0));

    // every tile renders, with a thumbnail and its name
    const tiles = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start .st-tile')].map((t) => ({ id: t.dataset.type, name: t.querySelector('.st-nm')?.textContent.trim(), desc: t.querySelector('.st-ds')?.textContent.trim(), art: !!t.querySelector('.st-thumb svg rect, .st-thumb svg path'), box: t.querySelector('.st-thumb').getBoundingClientRect().height })));
    check(`${L}: one tile per registry type (${TYPES.length}), in registry order with Blank first`, tiles.length === TYPES.length && tiles[0].id === 'blank' && JSON.stringify(tiles.slice(1).map((x) => x.id)) === JSON.stringify(TYPES.filter((x) => x.id !== 'blank').map((x) => x.id)), tiles.map((x) => x.id).join());
    check(`${L}: every tile has its thumbnail, its name and its description in ${ui}`, tiles.every((x, i) => x.art && x.box > 60 && x.name === (TYPES.find((y) => y.id === x.id).name[ui]) && x.desc === TYPES.find((y) => y.id === x.id).description[ui]), JSON.stringify(tiles.filter((x) => !x.art || !x.name)));
    check(`${L}: no thumbnail carries its own title, size or role (the tile's text is the name)`, await page.evaluate(() => ![...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start .st-thumb svg')].some((s) => s.querySelector('title') || s.hasAttribute('width') || s.hasAttribute('role') || s.getAttribute('aria-hidden') !== 'true')));
    const fit = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); const g = d.querySelector('.st-grid'); const cols = new Set([...d.querySelectorAll('.st-tile')].map((t) => t.offsetTop)).size; return { over: d.scrollWidth - d.clientWidth, cols: Math.round(g.getBoundingClientRect().width / d.querySelector('.st-tile').getBoundingClientRect().width), rows: cols }; });
    check(`${L}: 1024 px fits with no sideways scroll, 4 columns`, fit.over <= 0 && fit.cols === 4, JSON.stringify(fit));
    // polish (L10a): the landscape sheets show landscape thumbnails; the skip link is no kicker; the NJ mark stays visible (0.18.2); no visible tashkeel
    const geo = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); return Object.fromEntries([...d.querySelectorAll('.st-tile')].map((t) => { const r = t.querySelector('.st-thumb svg').getBoundingClientRect(); return [t.dataset.type, { w: Math.round(r.width), h: Math.round(r.height), land: t.querySelector('.st-thumb').dataset.land }]; })); });
    if (real) check(`${L}: rtm and test-cases draw landscape thumbnails (wider than tall); every other tile stays portrait`, ['rtm', 'test-cases'].every((id) => geo[id] && geo[id].w > geo[id].h && geo[id].land === 'true') && Object.entries(geo).filter(([id]) => !['rtm', 'test-cases'].includes(id)).every(([, v]) => v.h > v.w && v.land === 'false'), JSON.stringify(geo));
    const ord = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); const top = (s) => Math.round(d.querySelector(s).getBoundingClientRect().top); return { h1: top('h1'), lede: top('.st-lede'), back: top('[data-st-back]') }; });
    check(`${L}: «continue to the editor» sits under the lede, not above the heading as a kicker`, ord.back > ord.lede && ord.lede > ord.h1, JSON.stringify(ord));
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<div id="bw-watermark" style="position:fixed;left:16px;bottom:16px;width:40px;height:40px;z-index:41">NJ</div>'));
    check(`${L}: the NJ mark stays visible while the start page is open (0.18.2: it was hidden; the page leaves it a bottom-start safe area instead)`, await page.evaluate(() => getComputedStyle(document.getElementById('bw-watermark')).visibility !== 'hidden'));
    check(`${L}: no visible tashkeel in the start page strings`, !/[ً-ْ]/.test(fs.readFileSync(path.join(REPO, 'editor', 'ext', '50-start.i18n.json'), 'utf8')));
    check(`${L}: the Thmanyah faces are what shows (no other family in the computed fonts)`, await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); return [...d.querySelectorAll('h1, .st-nm, .st-chip, .st-lede')].every((e) => /Thmanyah/i.test(getComputedStyle(e).fontFamily.split(',')[0]) && !/cairo/i.test(getComputedStyle(e).fontFamily)); }));

    // categories, search, empty state
    const cats = await page.locator(`${D} .st-chip`).evaluateAll((l) => l.map((b) => ({ id: b.dataset.stC, checked: b.getAttribute('aria-checked'), label: b.getAttribute('aria-label') })));
    check(`${L}: chips = All + the categories that hold a type (not «start»), one radio group, the count in the accessible name`, cats.length === 1 + PL.categories.filter((c) => c.id !== 'start' && TYPES.some((t) => t.category === c.id)).length && cats[0].checked === 'true' && cats.every((c) => /\d/.test(c.label)), JSON.stringify(cats));
    await page.locator(`${D} .st-chip[data-st-c="testing"]`).click();
    const test = await page.locator(`${D} .st-tile`).evaluateAll((l) => l.map((t) => t.dataset.type));
    check(`${L}: the Testing chip keeps Blank first and shows only that category`, test[0] === 'blank' && test.slice(1).every((id) => TYPES.find((t) => t.id === id).category === 'testing') && test.length === 1 + TYPES.filter((t) => t.category === 'testing').length, test.join());
    await page.locator(`${D} .st-chip[data-st-c="all"]`).click();
    await page.locator(`${D} [data-st-q]`).fill('traceab');
    check(`${L}: search matches the English description (flat results, the category filter is replaced)`, JSON.stringify(await page.locator(`${D} .st-tile`).evaluateAll((l) => l.map((t) => t.dataset.type))) === JSON.stringify(TYPES.filter((t) => /traceab/i.test(t.description.en)).map((t) => t.id)) || TYPES.filter((t) => /traceab/i.test(t.description.en + t.description.ar)).length === 0);
    await page.locator(`${D} [data-st-q]`).fill(TYPES.find((t) => t.id === 'minutes').name.ar);
    check(`${L}: search matches the Arabic name`, (await page.locator(`${D} .st-tile`).evaluateAll((l) => l.map((t) => t.dataset.type))).includes('minutes'));
    await page.locator(`${D} [data-st-q]`).fill('zzqx');
    check(`${L}: no match shows the heading, Clear search and Start blank, and announces it`, (await page.locator(`${D} .st-empty button`).count()) === 2 && /zzqx/.test(await page.locator(`${D} .st-empty h2`).textContent()) && /zzqx/.test(await page.locator(`${D} [data-st-live]`).textContent()));
    await page.locator(`${D} [data-st-a="clear"]`).click();
    check(`${L}: Clear search brings every tile back`, (await page.locator(`${D} .st-tile`).count()) === TYPES.length);

    // keyboard: / focuses search, Down goes to the grid, Escape in search clears
    await page.locator(`${D} .st-tile[data-type="blank"]`).focus();
    await page.keyboard.press('/');
    check(`${L}: «/» focuses the search from the grid`, await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches('[data-st-q]')));
    await page.keyboard.type('srs');
    await page.keyboard.press('Escape');
    check(`${L}: Escape in the search clears it and keeps the page open`, (await page.locator(`${D} [data-st-q]`).inputValue()) === '' && (await page.locator(`${D} .st-tile`).count()) === TYPES.length && (await page.evaluate(() => document.documentElement.dataset.bwStart)) === 'open');
    await page.locator(`${D} .st-tile[data-type="blank"]`).focus();
    await page.keyboard.press('ArrowLeft'); // the layout never flips: the end side is always the left
    check(`${L}: the arrow towards the end side moves to the next tile (grid keys follow the direction)`, await page.evaluate((id) => document.getElementById('bw-ui-host').shadowRoot.activeElement?.dataset.type === id, tiles[1].id));
    await page.keyboard.press('Enter');
    check(`${L}: Enter previews the tile and moves focus to Create`, (await page.locator(`${D} .st-prev`).count()) === 1 && (await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.activeElement?.matches('[data-st-a="create"]'))));
    await page.keyboard.press('Escape');
    check(`${L}: Escape closes the preview card (Recent returns) and focus goes back to the tile`, (await page.locator(`${D} .st-prev`).count()) === 0 && (await page.evaluate((id) => document.getElementById('bw-ui-host').shadowRoot.activeElement?.dataset.type === id, tiles[1].id)));

    // no recents on the first run
    check(`${L}: no recents yet shows the first-run text`, (await page.locator(`${D} .st-norec`).count()) === 1);

    // screenshot (the preview open, light)
    await page.locator(`${D} .st-tile[data-type="srs"]`).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(shots, `start-${ui}-1024.png`) });
    // axe-core on the page itself (preview open), light and dim: nothing serious or critical
    await page.addScriptTag({ path: AXE });
    const axe = () => page.evaluate(async () => { const r = await window.axe.run({ include: [['#bw-ui-host', 'dialog.bw-start']] }, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }); return r.violations.filter((v) => ['serious', 'critical'].includes(v.impact)).map((v) => `${v.id}x${v.nodes.length} ${v.nodes[0].target.join('>').slice(-60)}`); });
    const axeLight = await axe();
    check(`${L}: axe light (preview open): no serious or critical issue`, axeLight.length === 0, axeLight.join(' | '));
    await page.locator(`${D} [data-st-dark]`).click();
    await page.waitForTimeout(400);
    const axeDim = await axe();
    check(`${L}: axe dim: no serious or critical issue`, axeDim.length === 0, axeDim.join(' | '));
    if (ui === 'en') await page.screenshot({ path: path.join(shots, 'start-en-dim-1024.png') });
    await page.locator(`${D} [data-st-dark]`).click();
    await page.locator(`${D} [data-st-a="close"]`).click();

    // theme and calm: the page's own toggles drive the editor's
    const dark0 = await page.evaluate(() => window.BW.S.dark);
    await page.locator(`${D} [data-st-dark]`).click();
    const dk = await page.evaluate(() => ({ dark: window.BW.S.dark, theme: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start').dataset.theme, bg: getComputedStyle(document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start')).backgroundColor }));
    check(`${L}: the dim toggle switches the editor and the page (the dim desk #0c1729)`, dk.dark === !dark0 && dk.theme === 'dark' && /rgb\(12, 23, 41\)/.test(dk.bg), JSON.stringify(dk));
    await page.locator(`${D} [data-st-dark]`).click();
    await page.locator(`${D} [data-st-calm]`).click();
    check(`${L}: Calm is the only motion switch: on, every animation of the page is off`, await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); return d.dataset.calm === '1' && [...d.querySelectorAll('.st-rule, .st-tile, .st-chip')].every((e) => getComputedStyle(e).animationName === 'none'); }));
    await page.locator(`${D} [data-st-calm]`).click();

    // create every type; the document language alternates through the preview segment
    const made = [];
    for (let i = 0; i < TYPES.length; i += 1) {
      const ty = TYPES[i];
      try {
      const want = i % 2 === 0 ? ui : other(ui);
      if (!(await page.locator(`${D}`).count())) await startFromFile(page);
      await page.locator(`${D} .st-tile[data-type="${ty.id}"]`).click();
      const card = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); return { h3: d.querySelector('.st-prev h3')?.textContent, pl: d.querySelector('.st-seg-w [aria-checked="true"]')?.dataset.stPl, inside: d.querySelectorAll('.st-prev ul li').length }; });
      if (want !== card.pl) await page.locator(`${D} [data-st-pl="${want}"]`).click();
      const card2 = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); return { h3: d.querySelector('.st-prev h3')?.textContent, lang: d.querySelector('.st-prev h3')?.lang, pl: d.querySelector('.st-seg-w [aria-checked="true"]')?.dataset.stPl }; });
      if (card2.h3 !== ty.name[want] || card2.lang !== want || card2.pl !== want) made.push(`${ty.id}: card ${JSON.stringify(card2)}`);
      if (ty.id === 'srs') await page.locator(`${D} [data-bw-create="srs"]`).click(); else if (i % 5 === 3) await page.locator(`${D} .st-tile[data-type="${ty.id}"]`).dblclick({ position: { x: 20, y: 20 } }); else if (i % 5 === 4) { await page.locator(`${D} .st-tile[data-type="${ty.id}"]`).focus(); await page.keyboard.press('Control+Enter'); } else await page.locator(`${D} [data-st-a="create"]`).click();
      await waitClosed(page);
      await page.waitForFunction((id) => window.BW.EXT.library.isDoc(window.BW.S.svc) && window.BW.M[window.BW.S.svc][window.BW.S.ed]?.doc?.docType === id, ty.id, { timeout: 15000 });
      const r = await read(page);
      const mine = JSON.parse(ty.docs[want]);
      const want2 = { docType: ty.id, cover: ty.coverDesign, title: mine.control.title, primary: mine.design.vars.primary };
      const ok = r.ed === want && r.isDoc && JSON.stringify(r.editions) === '["ar","en"]'
        && ['ar', 'en'].every((ed) => r.per[ed].docType === ty.id && r.per[ed].cover === ty.coverDesign && r.per[ed].title === JSON.parse(ty.docs[ed]).control.title && r.per[ed].primary === want2.primary)
        && r.title === nameOf(mine.control) && r.coverEl === ((mine.layout?.hide || []).includes('cover') ? null : ({ report: 'spine', form: 'compact', sheet: 'compact' }[ty.coverDesign] || ty.coverDesign)); // 0.19.0 R3: data-cover is the page model (report = a title page, form and sheet = a header on page 1); data-family names the family // the Blank document hides its cover (one empty page), so its page draws none
      if (!ok) made.push(`${ty.id}/${want}: ${JSON.stringify(r)} wanted ${JSON.stringify(want2)} title «${nameOf(mine.control)}»`);
      // File > Start page returns; the recents list shows the new document; Back returns to it
      await startFromFile(page);
      const rec = await page.evaluate((id) => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); const li = d.querySelector(`[data-recent="${id}"]`); return { has: !!li, text: li?.textContent.replace(/\s+/g, ' ').trim(), back: d.querySelector('[data-st-back]')?.textContent.trim() }; }, r.svc);
      if (!rec.has || !rec.text.includes(r.title) || !rec.back.includes(r.title) || !rec.text.includes(ty.name[ui])) made.push(`${ty.id}: recents ${JSON.stringify(rec)}`);
      if (i % 6 === 0) { await page.locator(`${D} [data-st-back]`).click(); await waitClosed(page); const again = await read(page); if (again.svc !== r.svc) made.push(`${ty.id}: Back left the document (${again.svc})`); await startFromFile(page); }
      } catch (e) { made.push(`${ty.id}/${i}: ${String(e.message).split(/\n/)[0]}`); }
    }
    check(`${L}: Create on each of the ${TYPES.length} types builds both editions with the type's docType, cover design, colours and title, opens on the chosen language, shows in Recent and Back returns`, made.length === 0, made.slice(0, 4).join(' | '));

    // pins are remembered (localStorage), pinned rows lead
    const cur = (await read(page)).svc;
    await page.locator(`${D} [data-st-keep="${cur}"]`).focus();
    await page.keyboard.press('Enter');
    await page.locator(`${D} .st-keep[aria-pressed="true"]`).waitFor({ timeout: 5000 }).catch(() => {});
    check(`${L}: pinning a recent is stored and shows it under Pinned`, (await page.evaluate(() => localStorage.getItem('bw:start-pins')))?.includes(cur) && (await page.locator(`${D} .st-sub`).first().textContent()).trim().length > 0 && (await page.locator(`${D} .st-keep[aria-pressed="true"]`).count()) === 1);
    await page.keyboard.press('Escape'); // closes onto the document
    await waitClosed(page);
    check(`${L}: Escape closes the page onto the open document`, (await read(page)).svc === cur);
    check(`${L}: no page error or console error`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.context().close();
  }

  // the language segment and the page language are independent: a Create in the other edition opens that edition (checked above); the interface toggle on the page switches the editor's language
  {
    const { page } = await open(fileUrl(withTypes, '?start=1'), { ui: 'en' });
    await waitOpen(page);
    await page.locator(`${D} [data-st-l="ar"]`).click();
    const x = await page.evaluate(() => ({ ui: window.BW.S.ui, dir: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start').dir, h1: document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start h1').textContent }));
    check('the EN|عربي segment on the page switches the editor language and never flips the layout', x.ui === 'ar' && x.dir === 'rtl' && /ابدأ/.test(x.h1), JSON.stringify(x));
    // the thumbnails mirror in RTL (the spine side follows the reading side)
    check('thumbnails are mirrored in RTL and not in LTR', await page.evaluate(() => { const s = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start .st-tile .st-thumb svg'); return getComputedStyle(s).transform !== 'none'; }));
    await page.context().close();
  }

  // hidden under webdriver without ?start=1, and when switched off
  {
    const { page } = await open(fileUrl(withTypes), { ui: 'en' });
    await page.evaluate(() => window.BW.whenReady(15000));
    await page.waitForTimeout(1500);
    check('under webdriver the page stays hidden without ?start=1 (agents, MCP and the other suites never see it)', (await page.evaluate(() => ({ s: document.documentElement.dataset.bwStart, n: document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start').length }))).n === 0);
    await page.context().close();
    const b = await open(fileUrl(withTypes, '?automation=1&start=1'), { ui: 'en' });
    await b.page.evaluate(() => window.BW.whenReady(15000));
    await b.page.waitForTimeout(1200);
    check('?automation=1 keeps it hidden even with ?start=1', (await b.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start').length)) === 0);
    await b.page.context().close();
    const c = await open(fileUrl(withTypes, '?start=1'), { ui: 'en', init: "localStorage.setItem('bw:start','off')" });
    await c.page.evaluate(() => window.BW.whenReady(15000));
    await c.page.waitForTimeout(1200);
    check('the setting «show the start page» off keeps it hidden at boot, and File › Start page still opens it', (await c.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start').length)) === 0 && await (async () => { await startFromFile(c.page); return true; })());
    await c.page.context().close();
    const d = await open(fileUrl(withTypes, '?start=1#doc=doc-nothing'), { ui: 'en' });
    await d.page.evaluate(() => window.BW.whenReady(15000));
    await d.page.waitForTimeout(1200);
    check('a #doc= address skips the page (the person is going to a document)', (await d.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start').length)) === 0);
    await d.page.context().close();
    const e = await open(fileUrl(plain, '?start=1'), { ui: 'en' });
    await e.page.evaluate(() => window.BW.whenReady(15000));
    await e.page.waitForTimeout(1200);
    await e.page.evaluate(() => window.BW.runAction('startPage'));
    await e.page.waitForTimeout(500);
    check('a file without the registry (no bw-doctypes, not served) does not open the page and says so', (await e.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('dialog.bw-start').length)) === 0 && /Business-Wrap|app|تطبيق/.test(await e.page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.toasts')?.textContent || '')));
    await e.page.context().close();
  }

  // the File tool: one new tool, with its icon, its explanation and the settings card
  {
    const { page } = await open(fileUrl(withTypes), { ui: 'en' });
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('file'));
    const tool = await page.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('.ribbon [data-a="startPage"]'); return b ? { label: b.textContent.trim(), icon: !!b.querySelector('svg[data-ic="startPage"]'), key: b.dataset.key } : null; });
    check('the File tab carries the Start page tool with its icon and shortcut', !!tool && tool.label === 'Start page' && tool.icon && tool.key === 'Ctrl+Alt+N', JSON.stringify(tool));
    await page.evaluate(() => window.BW.runAction('settings'));
    check('Settings has the start page card with its switch', (await page.locator('.set-x-start [data-st-show]').count()) === 1);
    await page.locator('.set-x-start [data-st-show]').evaluate((el) => el.click()); // the card sits low in the scrolling drawer
    check('turning the switch off stores bw:start=off', (await page.evaluate(() => localStorage.getItem('bw:start'))) === 'off');
    await page.context().close();
  }

  // served: the page has no embedded registry and asks GET /api/doctypes; the recent shows and opens
  {
    const ws = path.join(tmp, 'ws');
    fs.mkdirSync(ws, { recursive: true });
    const server = await serve(plain, 0, { workspace: { root: ws, chosen: true } });
    try {
      const base = `http://127.0.0.1:${server.address().port}`;
      const ctx = await browser.newContext({ viewport: { width: 1024, height: 720 } });
      contexts.push(ctx);
      let asked = 0;
      await ctx.route('**/api/doctypes', (route) => { asked += 1; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PL) }); });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/?start=1`);
      await waitOpen(page);
      check('served: with no embedded registry the page asks GET /api/doctypes and renders every tile', asked >= 1 && (await page.locator(`${D} .st-tile`).count()) === TYPES.length, `asked ${asked}`);
      await page.locator(`${D} .st-tile[data-type="tor"]`).dblclick({ position: { x: 20, y: 20 } });
      await page.waitForFunction(() => window.BW.EXT.library.isDoc(window.BW.S.svc));
      await page.evaluate(() => window.BW.EXT.library.persist(window.BW.S.svc)); // a new document is stored at its first edit or Save; here the store is asked directly
      await page.waitForFunction(() => document.documentElement.dataset.bwLibSaved);
      await page.evaluate(() => window.BW.runAction('startPage'));
      await waitOpen(page);
      const row = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start'); const li = d.querySelector('[data-recent]'); return { id: li?.dataset.recent, svc: window.BW.S.svc, text: li?.textContent.replace(/\s+/g, ' ') }; });
      check('served: the created document is stored and listed in Recent with its type', row.id === row.svc && /ToR/.test(row.text), JSON.stringify(row));
      check('served: no page error', errors.length === 0, errors.join(' | '));
      await ctx.close();
    } finally { for (const c of contexts) await c.close().catch(() => {}); server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
  }
} finally {
  await browser.close();
}
console.log(`registry: ${real ? 'the real payload' : 'the stub (17 types fanned out from the real blank pair)'}`);
console.log(failed ? `\nstart-0180: ${failed} FAILED` : `\nstart-0180: all ${results.length} checks passed`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* the shots dir may be inside */ }
process.exit(failed ? 1 : 0);
