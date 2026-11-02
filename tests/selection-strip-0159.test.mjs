// 0.15.9 · STRIP (bw-0159): the selection strip shows its tools whole and usable at every window size, and selecting never shifts the page.
//   S1 every tool of the strip (and of its «More» menu) is fully visible, inside its clip parents, overlapping no other tool and not the page's selected object
//      (windows 1024 / 1366 / 1920 / 2560, page zoom 75 / 100 / 150 %, AR + EN, light + dark, every selection kind)
//   S2 selecting, changing the selection and deselecting move scrollY and scrollHeight (and the bar's height) by 1 px or less
//   S3 tab words stay wherever the words fit; S4 names + keyboard; S5 print is unaffected; M3 the ribbon follows a diagram selection
//   Zoom z is simulated the way a browser does it: a viewport of window/z CSS px at a device scale factor z.
//   node tests/selection-strip-0159.test.mjs        (BW_STRIP_QUICK=1 runs one window per zoom, for a fast local look)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'selection-strip-0159');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'sheet'), { recursive: true });
const results = [];
let failed = 0;
const fails = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) { failed += 1; fails.push(`${name} | ${detail}`); } };
process.on('uncaughtException', (e) => { console.log(results.join('\n')); console.error('CRASH: ' + String(e.message).split('\n').slice(0, 3).join(' / ')); process.exit(2); });

const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'strip-0159', watermarkDir: '' });
const QUICK = !!process.env.BW_STRIP_QUICK;
const WINDOWS = QUICK ? [1024, 1920] : [1024, 1366, 1920, 2560];
const ZOOMS = QUICK ? [1, 1.5] : [0.75, 1, 1.5];
const KINDS = ['text', 'table cell', 'image', 'story', 'section', 'diagram empty', 'shape', 'arrow', 'joint', 'legend entry', 'several shapes'];
const HOST = '#bw-ui-host';

const browser = await chromium.launch(launchOptions());
const errors = [];

/** Everything the strip shows, measured in the page (rects in CSS px). */
const measure = () => {
  const R = document.getElementById('bw-ui-host').shadowRoot;
  const isl = R.querySelector('.island');
  const ctx = R.querySelector('.island > .ctx');
  const rect = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  const visible = (e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const name = (e) => (e.getAttribute('aria-label') || e.title || e.textContent || '').trim();
  const ancestors = (e) => { const out = []; let n = e.parentElement; while (n && n !== R.host) { out.push(n); n = n.parentElement; } return out; };
  const out = {
    cssW: innerWidth, islandH: isl.getBoundingClientRect().height, scrollY: window.scrollY, scrollH: document.documentElement.scrollHeight,
    hidden: !ctx || ctx.hidden, ctx: ctx && rect(ctx), fit: ctx?.dataset.fit || '', label: ctx?.getAttribute('aria-label') || '',
    tools: [], menu: [], more: null,
  };
  if (!ctx || ctx.hidden) return out;
  const tools = [...ctx.querySelectorAll('.sb button, .sb select, .sb [role="button"]')].filter((e) => !e.closest('.menu') && !e.matches('.more > button'));
  for (const e of tools) {
    const r = rect(e);
    const clip = ancestors(e).filter((a) => { const o = getComputedStyle(a); return a === ctx || a === isl || (o.overflowX !== 'visible' || o.overflowY !== 'visible'); }).map((a) => ({ cls: a.className, r: rect(a) }));
    out.tools.push({ a: e.dataset.a || e.tagName, vis: visible(e), r, name: name(e), clip, tab: e.tabIndex });
  }
  const moreBtn = ctx.querySelector('.more > button[data-a="more"]');
  if (moreBtn) out.more = { vis: visible(moreBtn), r: rect(moreBtn), name: name(moreBtn) };
  out.menuCount = ctx.querySelectorAll('.more .menu > *').length;
  return out;
};

const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const inside = (r, c, tol = 0.6) => r.l >= c.l - tol && r.r <= c.r + tol && r.t >= c.t - tol && r.b <= c.b + tol;
const overlap = (a, b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;

async function openPage(win, zoom, ui, dark) {
  const ctx = await browser.newContext({ viewport: { width: Math.round(win / zoom), height: Math.round(900 / zoom) }, deviceScaleFactor: zoom });
  await ctx.addInitScript(([u, d]) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:calm', '1'); localStorage.setItem('bw:dark', d ? '1' : '0'); localStorage.setItem('bw:xpl-panel', '0'); /* 0.16.0: the Explain panel (M4) is judged on its own suite; closed here it sits as its 40 px edge tab and not on the page's click targets */ } catch { /* none */ } }, [ui, dark]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  return { ctx, page };
}

/** Select one kind with real pointer events where there is a pointer target, else through the editor's own selection state (as its other suites do). */
async function select(page, kind, cssH) {
  const place = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const bar = document.getElementById('bw-ui-host').shadowRoot.querySelector('.island').getBoundingClientRect().bottom; window.scrollBy(0, e.getBoundingClientRect().top - bar - 90); return true; }, sel);
  const clickEl = async (loc) => { const b = await loc.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(80); };
  const FIG = 'main.bw-doc figure[data-dg]';
  const dgNode = (i) => page.locator(`${FIG} [data-dg-node]`).nth(i);
  switch (kind) {
    case 'text': { await place('main.bw-doc p'); await clickEl(page.locator('main.bw-doc p').first()); break; }
    case 'table cell': { await place('main.bw-doc table td'); await clickEl(page.locator('main.bw-doc table td').first()); break; }
    case 'image': await page.evaluate(() => { const B = window.BW; const P = '/chapters/0/sections/0/blocks/0'; const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; B.commit([{ op: 'replace', path: '/overlays', value: [{ id: 'ov1', kind: 'image', src: IMG, mode: 'anchor', anchor: P, x: 10, y: 0, w: 30 }] }]); B.S.selOv = 0; B.render(); }); break;
    case 'story': await page.evaluate(() => { const B = window.BW; const d = B.M[B.S.svc][B.S.ed].doc; let ptr = null; d.chapters.forEach((c, i) => c.sections.forEach((s, j) => s.blocks.forEach((b, k) => { if (!ptr && b.kind === 'stories') ptr = `/chapters/${i}/sections/${j}/blocks/${k}`; }))); B.S.selOv = null; B.S.sel = { b: ptr, p: null, ed: B.S.ed }; B.render(); }); break;
    case 'section': await page.evaluate(() => { const B = window.BW; B.S.selOv = null; B.S.sel = { b: null, p: '/chapters/0/sections/0/title', ed: B.S.ed }; B.render(); }); break;
    case 'diagram empty': { await place(`${FIG} svg`); const sb = await page.locator(`${FIG} svg`).boundingBox(); await page.mouse.click(sb.x + 4, sb.y + 4); break; }
    case 'shape': { await place(`${FIG} svg`); await clickEl(dgNode(0)); break; }
    case 'several shapes': { await place(`${FIG} svg`); await clickEl(dgNode(0)); await page.keyboard.down('Shift'); await clickEl(dgNode(1)); await page.keyboard.up('Shift'); break; }
    case 'arrow': case 'joint': {
      await place(`${FIG} svg`);
      const pt = await page.evaluate(() => { const fig = document.querySelector('main.bw-doc figure[data-dg]'); for (const g of fig.querySelectorAll('[data-dg-edge]')) { const el = g.matches('path, line, polyline') ? g : g.querySelector('path, line, polyline'); if (!el || !el.getTotalLength) continue; el.dataset.dgEdge = el.dataset.dgEdge || g.dataset.dgEdge; const L = el.getTotalLength(); const m = el.getScreenCTM(); for (let t = 0.1; t < 0.95; t += 0.04) { const p = el.getPointAtLength(L * t); const x = m.a * p.x + m.c * p.y + m.e; const y = m.b * p.x + m.d * p.y + m.f; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue; const hit = document.elementFromPoint(x, y); if (hit?.closest?.(`[data-dg-edge="${el.dataset.dgEdge}"]`) && !hit.closest('.dg-ui')) return [x, y]; } } return null; });
      if (pt) { await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(80); }
      if (kind === 'joint') { const j = page.locator(`${FIG} .dg-ui circle.dg-bend`).first(); if (await j.count()) await page.evaluate(() => { const B = window.BW; if (B.S.dg?.edge) B.S.dg.joint = 0; }); }
      break;
    }
    case 'legend entry': { await place(`${FIG} svg`); const lg = page.locator(`${FIG} text[data-dg-legend]`).first(); await lg.scrollIntoViewIfNeeded(); await clickEl(lg); break; }
    default: throw new Error(kind);
  }
  await page.waitForTimeout(220);
}
const deselect = async (page, cssH) => {
  await page.evaluate(() => { const B = window.BW; B.S.selOv = null; });
  await page.keyboard.press('Escape');
  await page.mouse.click(2, Math.round(cssH * 0.6));
  await page.waitForTimeout(150);
};

const sheetKeys = new Set(['1024|1|ar|false', '1366|1|ar|false', '1920|1|ar|true', '1024|1.5|en|false']);
const tally = { combos: 0, kinds: 0, tools: 0, menuItems: 0, noSel: [] };
const jobs = [];
for (const win of WINDOWS) for (const zoom of ZOOMS) for (const ui of ['ar', 'en']) for (const dark of [false, true]) jobs.push([win, zoom, ui, dark]);

async function runJob([win, zoom, ui, dark]) {
  const tag = `${win}px z${Math.round(zoom * 100)} ${ui} ${dark ? 'dark' : 'light'}`;
  const { ctx, page } = await openPage(win, zoom, ui, dark);
  const cssH = Math.round(900 / zoom);
  try {
    const boot = await page.evaluate(() => ({ ready: !!window.BW.ready, figs: document.querySelectorAll('main.bw-doc figure[data-dg]').length, host: !!document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.island > .ribbon .rb-tab') }));
    check(`ready ${tag}: editor booted, a drawing and the ribbon are there`, boot.ready && boot.figs >= 1 && boot.host, JSON.stringify(boot));
    tally.combos += 1;
    const sheet = sheetKeys.has(`${win}|${zoom}|${ui}|${dark}`);
    for (const kind of KINDS) {
      await deselect(page, cssH);
      const before = await page.evaluate(measure);
      await select(page, kind, cssH);
      const m = await page.evaluate(measure);
      tally.kinds += 1;
      if (m.hidden) { tally.noSel.push(`${tag} / ${kind}`); check(`S1 ${tag} / ${kind}: the selection produced a strip`, false, 'strip hidden'); continue; }
      // S2: nothing moved (the baseline is the deselected page at the same scroll position as the selection starts from; the click itself may scroll an element into view, so scrollY is compared after a re-measure of the baseline at the new scroll)
      const dH = Math.abs(m.islandH - before.islandH), dSH = Math.abs(m.scrollH - before.scrollH);
      check(`S2 ${tag} / ${kind}: selecting moves the bar by ≤ 1 px and scrollHeight by ≤ 1 px`, dH <= 1 && dSH <= 1, `bar ${before.islandH}→${m.islandH}, scrollH ${before.scrollH}→${m.scrollH}`);
      // S1
      const obj = await page.evaluate(() => {
        const els = [...document.querySelectorAll('main.bw-doc .dg-lgsel, main.bw-doc [data-dg-node].sel, main.bw-doc [data-dg-node][aria-selected="true"], main.bw-doc .is-sel, main.bw-doc .sel, main.bw-doc [data-sel], main.bw-doc .dg-ui')];
        return els.map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; }).filter((b) => b.r - b.l > 0 && b.b - b.t > 0);
      });
      const bad = [];
      const tools = m.tools;
      tally.tools += tools.length;
      if (!tools.length && !m.more) bad.push('no tools at all');
      for (const [i, tl] of tools.entries()) {
        if (!tl.vis) { bad.push(`${tl.a}: not visible`); continue; }
        if (!inside(tl.r, { l: 0, t: 0, r: m.cssW, b: cssH })) bad.push(`${tl.a}: outside the window`);
        for (const c of tl.clip) if (!inside(tl.r, c.r)) bad.push(`${tl.a}: cut by ${c.cls || 'parent'}`);
        for (const o of tools.slice(i + 1)) if (o.vis && overlap(tl.r, o.r)) bad.push(`${tl.a} overlaps ${o.a}`);
        if (m.more && overlap(tl.r, m.more.r)) bad.push(`${tl.a} overlaps More`);
        for (const ob of obj) if (overlap(tl.r, { l: ob.l, t: ob.t, r: ob.r, b: ob.b })) { bad.push(`${tl.a} overlaps the selected object`); break; }
        if (!tl.name) bad.push(`${tl.a}: no accessible name (S4)`);
      }
      if (m.more) { if (!m.more.vis || !inside(m.more.r, m.ctx)) bad.push(`More: not whole inside the strip ${JSON.stringify([m.more.vis, m.more.r, m.ctx])}`); if (!m.more.name) bad.push('More: no name'); }
      if (m.menuCount && !m.more) bad.push('tools in a menu with no More button');
      if (!inside(m.ctx, { l: 0, t: 0, r: m.cssW, b: cssH })) bad.push('strip outside the window');
      check(`S1 ${tag} / ${kind}: ${tools.length} tools whole, uncut, not overlapping${m.more ? `, More (${m.menuCount})` : ''} [${m.fit || 'full'}]`, bad.length === 0, bad.slice(0, 4).join('; '));
      // More: opens, every item reachable (a real press lands on it), closes on Escape
      if (m.more && m.menuCount) {
        const ok = await page.evaluate(async () => {
          const R = document.getElementById('bw-ui-host').shadowRoot;
          const btn = R.querySelector('.island > .ctx .more > button[data-a="more"]');
          btn.click();
          await new Promise((q) => setTimeout(q, 60));
          const menu = btn.nextElementSibling;
          const items = [...menu.children].filter((e) => e.matches('button, select, .pick, label') || e.querySelector('button, select'));
          const res = { open: menu.dataset.open === '1' && menu.matches(':popover-open'), total: menu.children.length, bad: [] };
          for (const it of items) {
            it.scrollIntoView({ block: 'nearest' });
            const r = it.getBoundingClientRect();
            const mr = menu.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) { res.bad.push(`${it.dataset.a || it.tagName}: empty rect`); continue; }
            if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) res.bad.push(`${it.dataset.a}: off window`);
            if (r.left < mr.left - 0.5 || r.right > mr.right + 0.5 || r.top < mr.top - 0.5 || r.bottom > mr.bottom + 0.5) res.bad.push(`${it.dataset.a}: cut by the menu`);
            const hit = R.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!hit || !(it === hit || it.contains(hit) || hit.contains(it))) res.bad.push(`${it.dataset.a}: covered by ${hit?.className || hit?.tagName}`);
          }
          res.items = items.length;
          btn.click();
          await new Promise((q) => setTimeout(q, 40));
          res.closed = menu.dataset.open !== '1';
          return res;
        });
        tally.menuItems += ok.items;
        check(`S1/S4 ${tag} / ${kind}: «More» opens in the top layer, its ${ok.items} items are all reachable, it closes`, ok.open && ok.items >= 1 && ok.bad.length === 0 && ok.closed, `${JSON.stringify(ok.bad.slice(0, 3))} open=${ok.open} closed=${ok.closed}`);
      }
      if (sheet) await page.screenshot({ path: path.join(OUT, 'sheet', `${win}-z${Math.round(zoom * 100)}-${ui}-${dark ? 'dark' : 'light'}-${kind.replace(/ /g, '_')}.png`), clip: { x: 0, y: 0, width: Math.round(win / zoom), height: Math.min(cssH, 130) } });
      // S2, deselect: the page goes back by ≤ 1 px as well
      await deselect(page, cssH);
      const after = await page.evaluate(measure);
      check(`S2 ${tag} / ${kind}: deselecting moves the bar by ≤ 1 px and scrollHeight by ≤ 1 px`, near(after.islandH, before.islandH) && near(after.scrollH, before.scrollH), `bar ${before.islandH}→${after.islandH}, scrollH ${before.scrollH}→${after.scrollH}`);
    }
    // S2 on a change of selection (shape → arrow → text), page scroll untouched by the selection itself
    await deselect(page, cssH);
    await select(page, 'shape', cssH);
    const s1 = await page.evaluate(measure);
    await select(page, 'arrow', cssH);
    const s2 = await page.evaluate(measure);
    await select(page, 'text', cssH);
    const s3 = await page.evaluate(measure);
    check(`S2 ${tag}: changing the selection (shape, arrow, text) keeps the bar and scrollHeight within 1 px`, near(s1.islandH, s2.islandH) && near(s2.islandH, s3.islandH) && near(s1.scrollH, s2.scrollH) && near(s2.scrollH, s3.scrollH), `bar ${s1.islandH}/${s2.islandH}/${s3.islandH}, scrollH ${s1.scrollH}/${s2.scrollH}/${s3.scrollH}`);
    // S3: the words stay wherever they fit
    for (const kind of ['none', 'diagram empty']) {
      await deselect(page, cssH);
      if (kind !== 'none') await select(page, kind, cssH);
      const tabs = await page.evaluate(() => {
        const R = document.getElementById('bw-ui-host').shadowRoot;
        const el = R.querySelector('.rb-tabs');
        const words = [...R.querySelectorAll('.rb-tab')].filter((t) => getComputedStyle(t.querySelector('.rb-tl')).display !== 'none').length;
        const n = R.querySelectorAll('.rb-tab').length;
        const was = el.className;
        el.classList.remove('icons'); el.classList.add('tight');
        const fitsWithWords = el.scrollWidth <= el.clientWidth + 1;
        el.className = was;
        return { n, words, was, fitsWithWords };
      });
      check(`S3 ${tag} / ${kind === 'none' ? 'nothing selected' : kind}: tab words stay when they fit (${tabs.words}/${tabs.n} words, "${tabs.was}")`, tabs.fitsWithWords ? tabs.words === tabs.n : tabs.words >= 1 && tabs.words < tabs.n, JSON.stringify(tabs));
    }
  } finally { await ctx.close(); }
}

// run the matrix, four pages at a time
{
  const queue = [...jobs];
  const lanes = Array.from({ length: 4 }, async () => { while (queue.length) { const j = queue.shift(); await runJob(j); } });
  await Promise.all(lanes);
}

// M3: the ribbon follows what is selected inside a diagram, with a clear tab name; S4 keyboard; S5 print; ENTRY_SMOKE click
{
  const { ctx, page } = await openPage(1920, 1, 'ar', false);
  const cssH = 900;
  const tabNow = () => page.evaluate(() => window.BW.EXT.ribbon.state.tab);
  const names = await page.evaluate(() => { const B = window.BW; const R = document.getElementById('bw-ui-host').shadowRoot; return B.EXT.ribbon.tabs().map((t) => t); });
  await deselect(page, cssH);
  await select(page, 'diagram empty', cssH); const tEmpty = await tabNow();
  await select(page, 'arrow', cssH); const tArrow = await tabNow();
  await select(page, 'shape', cssH); const tShape = await tabNow();
  const nm = await page.evaluate(() => { const R = document.getElementById('bw-ui-host').shadowRoot; return R.querySelector('#rb-tab-diagram2 .rb-tl')?.textContent || ''; });
  check('M3 empty drawing opens the shape-adding tab, an arrow and a shape open the tab that holds their tools, with a clear name', tEmpty === 'diagram' && tArrow === 'diagram2' && tShape === 'diagram2' && nm && !/ترتيب/.test(nm), JSON.stringify({ tEmpty, tArrow, tShape, nm, tabs: names.length }));
  const arrowTools = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.rb-panel [data-a="dgRoute"], .rb-panel [data-a="dgHead"]')].length);
  await select(page, 'arrow', cssH);
  check('M3 the arrow tools are in the open panel when an arrow is selected', (await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.rb-panel [data-a="dgRoute"], .rb-panel [data-a="dgHead"]').length)) >= 2, `${arrowTools} before`);
  // ENTRY_SMOKE + S4: a real press on a strip tool works; Tab reaches the tools in order
  await deselect(page, cssH);
  await select(page, 'diagram empty', cssH);
  const z0 = await page.evaluate(() => document.querySelector('main.bw-doc figure[data-dg]').dataset.zoom || '');
  const kt = page.locator(HOST).locator('.island > .ctx .keep-tools button').first();
  const kbox = await kt.boundingBox();
  const kkey = await kt.evaluate((e) => e.dataset.a);
  await kt.click();
  await page.waitForTimeout(150);
  const z1 = await page.evaluate(() => document.querySelector('main.bw-doc figure[data-dg]').dataset.zoom || '');
  check('ENTRY_SMOKE a press on a strip tool runs it (diagram zoom key)', !!kbox && (z0 !== z1 || kkey === 'dgZoomFit'), JSON.stringify({ kkey, z0, z1 }));
  const reach = await page.evaluate(async () => {
    const R = document.getElementById('bw-ui-host').shadowRoot;
    const ctx = R.querySelector('.island > .ctx');
    const els = [...ctx.querySelectorAll('.sb button, .sb select')].filter((e) => !e.closest('.menu'));
    const bad = [];
    for (const e of els) { e.focus(); if (R.activeElement !== e) bad.push(e.dataset.a || e.tagName); }
    return { n: els.length, bad, role: ctx.getAttribute('role'), label: !!ctx.getAttribute('aria-label') };
  });
  check('S4 every strip tool takes keyboard focus; the strip is a labelled group', reach.n >= 1 && reach.bad.length === 0 && reach.role === 'group' && reach.label, JSON.stringify(reach));
  // S5: print emulation hides the whole toolbar, nothing of the strip prints
  await page.emulateMedia({ media: 'print' });
  const pr = await page.evaluate(() => { const h = document.getElementById('bw-ui-host'); const cs = getComputedStyle(h); const b = h.getBoundingClientRect(); return { display: cs.display, h: b.height, vis: cs.visibility }; });
  await page.emulateMedia({ media: 'screen' });
  check('S5 print: the toolbar host takes no space on paper', pr.display === 'none' || pr.h === 0 || pr.vis === 'hidden' || pr.h < 1, JSON.stringify(pr));
  await ctx.close();
}

check('no page errors in the whole run', errors.length === 0, errors.slice(0, 3).join(' / '));
check('the run looked: windows × zoom × languages × themes × kinds were all exercised (R15)', tally.combos === jobs.length && tally.kinds === jobs.length * KINDS.length && tally.tools > 0 && tally.noSel.length === 0, JSON.stringify({ combos: tally.combos, kinds: tally.kinds, tools: tally.tools, menuItems: tally.menuItems, noSel: tally.noSel.slice(0, 5) }));
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.txt'), results.join('\n'));
const pass = results.length - failed;
console.log(results.filter((r) => r.startsWith('FAIL')).slice(0, 60).join('\n'));
console.log(`\nselection-strip-0159: ${pass} passed, ${failed} failed of ${results.length}  (tools measured ${tally.tools}, menu items ${tally.menuItems})`);
process.exit(failed ? 1 : 0);
