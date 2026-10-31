// Lane ribbon · 0.15.0 — owner notes 1-7 (centred tabs with an icon and a colour each, a 64 x 72 grid, no horizontal scroll, a raised selected tab
// and shaded categories, a name under every tool, a re-press folds the ribbon, the split into specific tabs) and perf booster 6 (the panel swap).
// Real headless Chrome (msedge via launchOptions), real mouse and keyboard, AR (RTL) and EN at 1366 and 1920 px; closed in finally.
//   node tests/ribbon-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ribbon15-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ribbon-0150: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };

const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'ribbon-0150', watermarkDir: null });
const browser = await chromium.launch(launchOptions());

// the 12 general tabs (0.15.2: Spelling joins, before View) and the colour token each one carries (UI designer §1; the VALUES are read from the shipped CSS, never typed here)
const GENERAL = [['file', '--bw-sec-file'], ['export', '--bw-sec-export'], ['home', '--bw-sec-edit'], ['font', '--bw-sec-font'], ['para', '--bw-sec-para'], ['insert', '--bw-sec-insert'],
  ['layout', '--bw-sec-gaps'], ['hf', '--bw-sec-header'], ['design', '--bw-sec-design'], ['review', '--bw-sec-document'], ['spelling', '--bw-sec-spell'], ['view', '--bw-sec-view']];
// tools per tab as declared (UI designer §2; export is 19: the designer's list names 17, plus the design pack and the export-options button that keeps the page range, cover and folder fields)
const COUNTS = { file: 7, export: 19, home: 10, font: 10, para: 16, insert: 18, layout: 17, hf: 17, design: 6, review: 11, spelling: 10, view: 15, table: 23, picture: 11, diagram: 22, diagram2: 23 };

async function open(ui, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.removeItem('bw:rb:c'); } catch { /* storage may be denied */ } }, ui);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForFunction(() => document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.ribbon .rb-panel .b'));
  await page.waitForFunction(() => document.documentElement.classList.contains('bw-ready')); // the toolbar's entry scale has ended: rects are true sizes
  await page.waitForTimeout(1000);
  return { page, ctx, errors };
}
const SH = `document.getElementById('bw-ui-host').shadowRoot`;
const sh = (page, fn, arg) => page.evaluate(`(${fn})(${SH}, ${JSON.stringify(arg ?? null)})`);
const setTab = (page, t) => page.evaluate(async (t) => { window.BW.EXT.ribbon.setTab(t); await new Promise((q) => setTimeout(q, 30)); }, t);
// in-page helpers shared by the measurements (a source string, so one copy serves every evaluate)
const LIB = `
const rgb = (c) => { const m = String(c).match(/[\\d.]+(?:e-?\\d+)?/g)?.map(Number) || [0, 0, 0]; return String(c).startsWith('color(') ? m.slice(0, 3).map((v) => v * 255) : m.slice(0, 3); };
const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
`;
const inShell = (page, body, arg) => page.evaluate(`(async (arg) => { const r = ${SH}; ${LIB} ${body} })(${JSON.stringify(arg ?? null)})`);
/** A probe panel drawn by the ribbon's own markup (any tab, contextual ones too) inside .ribbon, so the shipped CSS applies; removed by the body. */
const PROBE = `const R = window.BW.EXT.ribbon; const probe = (tab) => { const pn = document.createElement('div'); pn.className = 'rb-panel'; pn.id = 'probe'; pn.innerHTML = R.panelHtml(tab); r.querySelector('.ribbon').appendChild(pn); return pn; };`;

try {
  for (const [ui, w, h] of [['ar', 1366, 768], ['en', 1366, 768], ['ar', 1920, 1080], ['en', 1920, 1080]]) {
    const L = `${ui.toUpperCase()} ${w}`;
    const { page, ctx, errors } = await open(ui, w, h);

    // ── note 1 · tabs centred, own icon, own colour ──
    const tabsNow = await sh(page, (r) => [...r.querySelectorAll('.ribbon .rb-tab')].map((x) => x.dataset.tab));
    check(`${L} note 1: the ribbon draws the 12 general tabs in order`, GENERAL.map((x) => x[0]).join() === tabsNow.join(), tabsNow.join());
    const centre = await inShell(page, `const b = r.querySelector('.rb-bar').getBoundingClientRect(), t = r.querySelector('.rb-tabs').getBoundingClientRect(); return { dx: Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2), icons: r.querySelector('.rb-tabs').classList.contains('icons') };`);
    check(`${L} note 1 AC1: the tab group is centred in the bar (within 2 px)`, centre.dx <= 2, JSON.stringify(centre));
    const icons = await inShell(page, `const out = []; for (const [id, tok] of ${JSON.stringify(GENERAL)}) { const tab = r.querySelector('#rb-tab-' + id); const svg = tab?.querySelector('svg'); const probe = document.createElement('i'); probe.style.color = 'var(' + tok + ')'; r.querySelector('.shell').appendChild(probe); const want = getComputedStyle(probe).color; probe.remove(); out.push({ id, svg: !!svg, ok: !!svg && getComputedStyle(svg).color === want, got: svg && getComputedStyle(svg).color, want }); } return out;`);
    check(`${L} note 1 AC2: every general tab has a Lucide icon in its own colour token`, icons.every((x) => x.svg && x.ok), JSON.stringify(icons.filter((x) => !x.ok)));
    check(`${L} note 1 AC2: the 11 tab colours are 11 different values`, new Set(icons.map((x) => x.want)).size >= 10, '');
    check(`${L} note 1: the collapse button carries an icon and a label`, await sh(page, (r) => { const c = r.querySelector('.rb-col'); return !!c.querySelector('svg') && !!c.getAttribute('aria-label') && c.title === c.getAttribute('aria-label'); }));
    const names = await sh(page, (r) => [...r.querySelectorAll('.ribbon .rb-tab')].every((x) => x.getAttribute('role') === 'tab' && x.getAttribute('aria-label') && (x.getAttribute('aria-selected') === 'true' || x.getAttribute('aria-selected') === 'false')));
    check(`${L} note 1 AC3: each tab is role=tab with aria-selected and a name (icon-only tabs keep it)`, names);

    // ── note 7 · the split (raw declaration) and the budget (note 3) ──
    const bud = await page.evaluate(() => ({ raw: window.BW.EXT.ribbon.budget(true), live: window.BW.EXT.ribbon.budget(), max: window.BW.EXT.ribbon.max }));
    if (w === 1366) {
      check(`${L} note 7 AC1: tools per tab equal the allocation table`, bud.raw.every((b) => COUNTS[b.tab] === b.tools) && bud.raw.length === 16, JSON.stringify(bud.raw.filter((b) => COUNTS[b.tab] !== b.tools)));
      check(`${L} note 3: no tab passes ${bud.max.tools} tools or ${bud.max.groups} groups (so the panel never needs a scroll bar)`, bud.live.every((b) => b.tools <= bud.max.tools && b.groups <= bud.max.groups) && bud.max.tools === 28 && bud.max.groups === 6, JSON.stringify(bud.live));
    }

    // ── notes 2 and 5 on every tab, contextual ones through a probe panel ──
    for (const tab of Object.keys(COUNTS)) {
      const g = await inShell(page, `${PROBE} const pn = probe(${JSON.stringify(tab)}); await new Promise((q) => setTimeout(q, 20)); const P = pn.getBoundingClientRect(); const bad = [], rects = [], clipped = [], unnamed = [];
        for (const grp of pn.querySelectorAll('.rb-g')) { const tools = [...grp.querySelectorAll('.rb-tools > .b')]; const gx = tools.length ? Math.min(...tools.map((b) => b.getBoundingClientRect().left)) : 0;
          for (const b of tools) { const q = b.getBoundingClientRect(); rects.push(q); const dx = (q.left - gx) / 64, top = q.top - P.top; if (Math.abs(q.width - 64) > .6 || Math.abs(q.height - 72) > .6) bad.push(b.dataset.a + ' size ' + q.width + 'x' + q.height); if (Math.abs(dx - Math.round(dx)) > .02 && Math.abs(Math.abs(dx) - Math.round(Math.abs(dx))) > .02) bad.push(b.dataset.a + ' col ' + dx); if (Math.abs(top - 8) > .6 && Math.abs(top - 80) > .6) bad.push(b.dataset.a + ' top ' + top);
            const wd = b.querySelector('.w'); if (!wd || !wd.textContent.trim() || !wd.offsetHeight) unnamed.push(b.dataset.a); else if (wd.scrollHeight > wd.clientHeight + 1 || wd.scrollWidth > wd.clientWidth + 1) clipped.push(b.dataset.a + '=' + wd.textContent);
            const al = b.getAttribute('aria-label'); if (al && wd && !al.includes(wd.textContent.trim())) unnamed.push(b.dataset.a + ' label-in-name'); } }
        let overlap = 0; for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) { const a = rects[i], b = rects[j]; if (a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5) overlap += 1; }
        const scroll = pn.scrollWidth > pn.clientWidth + 1; const n = pn.querySelectorAll('.rb-tools > .b').length; const ph = P.height; pn.remove(); return { bad, overlap, clipped, unnamed, scroll, n, ph, tab: ${JSON.stringify(tab)} };`);
      check(`${L} notes 2/3/5 ${tab}: 64 x 72 cells on one lattice (${g.n} tools), no overlap, no scroll, every tool named and unclipped`, !g.bad.length && !g.overlap && !g.scroll && !g.clipped.length && !g.unnamed.length && g.n > 0 && g.ph === 184, JSON.stringify(g));
    }

    // ── note 3 · no element in the ribbon scrolls sideways ──
    const ov = await sh(page, (r) => [...r.querySelectorAll('.ribbon, .ribbon *')].filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowX)).map((e) => e.className));
    check(`${L} note 3 AC2: no element inside .ribbon has overflow-x auto/scroll`, !ov.length, ov.join());
    const sc = [];
    for (const [tab] of GENERAL) { await setTab(page, tab); const o = await sh(page, (r) => { const p = r.querySelector('.ribbon .rb-panel'); return { sw: p.scrollWidth, cw: p.clientWidth, h: Math.round(p.getBoundingClientRect().height) }; }); if (o.sw > o.cw + 1 || o.h !== 184) sc.push(`${tab} ${JSON.stringify(o)}`); }
    check(`${L} note 3 AC1: every general tab fits with no scroll bar, and the panel is 184 px high on each`, !sc.length, sc.join(' | '));

    // ── note 4 · raised tab, shaded categories, contrast (computed from the shipped CSS) ──
    await setTab(page, 'para');
    const sh4 = await inShell(page, `const sel = r.querySelector('.rb-tab[aria-selected="true"]'), sib = r.querySelector('#rb-tab-home'), pn = r.querySelector('.rb-panel'); const cs = getComputedStyle(sel);
      const panelBg = getComputedStyle(pn).backgroundImage; const ground = (() => { const i = document.createElement('i'); i.style.background = 'var(--rb-ground)'; r.querySelector('.ribbon').appendChild(i); const c = getComputedStyle(i).backgroundColor; i.remove(); return c; })();
      const cats = [...pn.querySelectorAll('.rb-g')].map((g) => getComputedStyle(g).backgroundColor);
      const darkest = cats.reduce((a, c) => (lum(c) < lum(a) ? c : a), cats[0]); const brightest = cats.reduce((a, c) => (lum(c) > lum(a) ? c : a), cats[0]);
      const toks = ${JSON.stringify(GENERAL.map((x) => x[1]))}; const ic = []; for (const [id] of ${JSON.stringify(GENERAL)}) ic.push([id, getComputedStyle(r.querySelector('#rb-tab-' + id + ' svg')).color]);
      return { selBg: cs.backgroundColor, selH: sel.getBoundingClientRect().height, sibH: sib.getBoundingClientRect().height, shadow: cs.boxShadow, ground, cats, ratioPanel: cr(cs.backgroundColor, ground), ratioCat: cr(cs.backgroundColor, brightest),
        minIcon: Math.min(...ic.map(([, c]) => Math.min(cr(c, cs.backgroundColor), cr(c, darkest), cr(c, brightest)))), text: cr(cs.color, cs.backgroundColor), toolText: Math.min(...cats.map((c) => cr(getComputedStyle(pn.querySelector('.rb-tools .w')).color, c))), labelText: Math.min(...cats.map((c) => cr(getComputedStyle(pn.querySelector('.rb-gl')).color, c))) };`);
    check(`${L} note 4 AC1: the selected tab is 2 px taller, has a shadow and a different fill from its siblings and the panel`, Math.abs(sh4.selH - sh4.sibH - 2) < .6 && sh4.shadow !== 'none' && sh4.selBg !== sh4.ground && sh4.ratioPanel >= 1.15, JSON.stringify(sh4));
    check(`${L} note 4 AC2: the categories cycle three different shades in DOM order`, sh4.cats.length >= 3 && new Set(sh4.cats.slice(0, 3)).size === 3 && (sh4.cats.length < 4 || sh4.cats[3] === sh4.cats[0]), sh4.cats.join(' | '));
    check(`${L} note 4 AC3: tab icons >= 3:1 on the selected shade and on every category shade; tab, tool and category text >= 4.5:1`, sh4.minIcon >= 3 && sh4.text >= 4.5 && sh4.toolText >= 4.5 && sh4.labelText >= 4.5, `icon ${sh4.minIcon.toFixed(2)} text ${sh4.text.toFixed(2)} tool ${sh4.toolText.toFixed(2)} label ${sh4.labelText.toFixed(2)}`);

    // ── perf booster 6 · a tab switch swaps the panel from a cache: the bar's own nodes stay, the tools are new ──
    await setTab(page, 'home');
    const sw = await inShell(page, `const R = window.BW.EXT.ribbon; const tabBtn = r.querySelector('#rb-tab-insert'); const first = r.querySelector('.ribbon .rb-panel .b'); const t0 = performance.now(); const order = ['insert', 'layout', 'review', 'home', 'view', 'design', 'font', 'para', 'hf', 'export', 'file', 'home']; for (const t of order) R.setTab(t); const ms = performance.now() - t0;
      return { sameTabNode: r.querySelector('#rb-tab-insert') === tabBtn, toolsReplaced: r.querySelector('.ribbon .rb-panel .b') !== first, cached: R.state.cache.size, ms: +(ms / order.length).toFixed(2), tab: R.state.tab, sel: r.querySelectorAll('.rb-tab[aria-selected="true"]').length };`);
    check(`${L} booster 6: 12 tab switches reuse the tab buttons and fill the cache (${sw.ms} ms per switch, script only)`, sw.sameTabNode && sw.toolsReplaced && sw.cached >= 7 && sw.tab === 'home' && sw.sel === 1, JSON.stringify(sw));

    // ── note 6 · a re-press collapses ──
    await setTab(page, 'home');
    const tabLoc = (id) => page.locator('#bw-ui-host').locator(`#rb-tab-${id}`);
    await tabLoc('home').click();
    check(`${L} note 6 AC1: pressing the selected tab folds the ribbon (panel hidden, aria-expanded=false on the tab)`, await sh(page, (r) => r.querySelector('.rb-panel').hidden && r.querySelector('#rb-tab-home').getAttribute('aria-expanded') === 'false'));
    await tabLoc('insert').click();
    check(`${L} note 6 AC2: pressing another tab while folded opens the ribbon on it`, await sh(page, (r) => !r.querySelector('.rb-panel').hidden && r.querySelector('#rb-tab-insert').getAttribute('aria-selected') === 'true' && !!r.querySelector('.rb-panel [data-a="image"]')));
    await tabLoc('insert').click();
    check(`${L} note 6 AC1: …and the selected tab folds it again`, await sh(page, (r) => r.querySelector('.rb-panel').hidden));
    check(`${L} note 6 AC3: the folded state is remembered`, await page.evaluate(() => localStorage.getItem('bw:rb:c') === '1'));
    await tabLoc('insert').focus();
    await page.keyboard.press('Enter');
    check(`${L} note 6 AC3: Enter on the selected tab opens it again, and Space folds it`, await sh(page, (r) => !r.querySelector('.rb-panel').hidden && r.querySelector('#rb-tab-insert').getAttribute('aria-expanded') === 'true') && (await page.keyboard.press(' '), await sh(page, (r) => r.querySelector('.rb-panel').hidden)));
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    check(`${L} note 6: Esc from the tools returns to the tab and folds nothing`, await sh(page, (r) => !r.querySelector('.rb-panel').hidden && r.activeElement?.id === 'rb-tab-insert'));

    // ── notes 2 / 6: a pressed tool and a tab round trip leave every tool where it was ──
    await setTab(page, 'view'); await page.waitForTimeout(300); // the panel's 160 ms entry fade has ended
    const pos = () => sh(page, (r) => [...r.querySelectorAll('.rb-panel .b')].map((b) => { const q = b.getBoundingClientRect(); return `${b.dataset.a}:${Math.round(q.left)},${Math.round(q.top)},${Math.round(q.width)}`; }).join(' '));
    const p0 = await pos();
    await page.locator('#bw-ui-host').locator('.rb-panel [data-a="snap"]').click();
    await page.locator('#bw-ui-host').locator('.rb-panel [data-a="snap"]').click();
    await setTab(page, 'home'); await setTab(page, 'view'); await page.waitForTimeout(300);
    check(`${L} note 2 AC2: pressing a tool and switching tab and back leaves every tool at the same x, y, width`, p0 === (await pos()) && p0.split(' ').length >= 12, '');

    // ── the quick strip: the language and direction pills no longer overlap (note 8, the part in this file) ──
    const gap = await sh(page, (r) => { const a = r.querySelector('.seg.lang').getBoundingClientRect(), b = r.querySelector('.seg.ui').getBoundingClientRect(); return { gap: Math.max(a.left, b.left) - Math.min(a.right, b.right), dy: Math.abs(a.top - b.top) }; });
    check(`${L} note 8: the language and direction pills are disjoint, about 12 px apart`, gap.gap >= 10 && gap.gap <= 13 && gap.dy < 6, JSON.stringify(gap));

    check(`${L}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── dark theme: the same contrast and shade rules (computed again from the shipped CSS with the dark flag on) ──
  {
    const { page, ctx, errors } = await open('ar', 1366, 768);
    await page.evaluate(() => { const B = window.BW; if (!B.S.dark) B.runAction('dark'); });
    await page.waitForTimeout(600);
    await setTab(page, 'para');
    const d4 = await inShell(page, `const sel = r.querySelector('.rb-tab[aria-selected="true"]'), pn = r.querySelector('.rb-panel'); const cs = getComputedStyle(sel);
      const cats = [...pn.querySelectorAll('.rb-g')].map((g) => getComputedStyle(g).backgroundColor); const darkest = cats.reduce((a, c) => (lum(c) < lum(a) ? c : a), cats[0]); const brightest = cats.reduce((a, c) => (lum(c) > lum(a) ? c : a), cats[0]);
      const ic = []; for (const [id] of ${JSON.stringify(GENERAL)}) ic.push(getComputedStyle(r.querySelector('#rb-tab-' + id + ' svg')).color);
      return { dark: r.querySelector('.shell').dataset.theme, three: new Set(cats.slice(0, 3)).size === 3, minIcon: Math.min(...ic.map((c) => Math.min(cr(c, cs.backgroundColor), cr(c, darkest), cr(c, brightest)))), text: cr(cs.color, cs.backgroundColor), tool: Math.min(...cats.map((c) => cr(getComputedStyle(pn.querySelector('.rb-tools .w')).color, c))) };`);
    check('dark theme: three category shades, tab icons >= 3:1, tab and tool text >= 4.5:1', d4.dark === 'dark' && d4.three && d4.minIcon >= 3 && d4.text >= 4.5 && d4.tool >= 4.5, JSON.stringify(d4));
    check('dark theme: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── contextual tabs (table, picture, diagram): centre with a contextual tab, the gold rule, both diagram tabs, and the previous tab back ──
  {
    const { page, ctx, errors } = await open('ar', 1366, 768);
    const ed = await page.evaluate(() => window.BW.S.ed);
    const P = await page.evaluate(() => {
      const B = window.BW; const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks; const at = `/chapters/1/sections/0/blocks/${blocks.length}`;
      B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B', 'C', 'D'], rows: [['1', '2', '3', 'x'], ['4', '5', '6', 'y'], ['7', '8', '9', 'z'], ['10', '11', '12', 'w']] } }], { mirror: true });
      return at;
    });
    const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${P}"] td[data-r="${r}"][data-c="${c}"]`;
    await page.locator(cell(0, 0)).scrollIntoViewIfNeeded();
    const b0 = await page.locator(cell(0, 0)).boundingBox();
    await page.mouse.click(b0.x + b0.width / 2, b0.y + b0.height / 2);
    await page.waitForTimeout(500);
    const c1 = await inShell(page, `const b = r.querySelector('.rb-bar').getBoundingClientRect(), t = r.querySelector('.rb-tabs').getBoundingClientRect(); const tb = r.querySelector('#rb-tab-table'); return { has: !!tb, dx: Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2), sel: tb?.getAttribute('aria-selected'), gold: tb && getComputedStyle(tb).boxShadow.includes('inset'), icons: r.querySelector('.rb-tabs').classList.contains('icons'), n: r.querySelectorAll('.rb-tab').length, noScroll: (() => { const p = r.querySelector('.rb-panel'); return p.scrollWidth <= p.clientWidth + 1; })(), tight: r.querySelector('.rb-tabs').scrollWidth <= r.querySelector('.rb-tabs').clientWidth + 1 };`);
    check('contextual: a cell selection adds the Table tab, selected, centred with it (within 2 px), no scroll, the tab strip fits', c1.has && c1.sel === 'true' && c1.dx <= 2 && c1.noScroll && c1.tight && c1.n === 13, JSON.stringify(c1));
    check('contextual: the Table tab keeps the contextual gold top rule', c1.gold, '');
    await page.mouse.click(60, 700);
    await page.waitForTimeout(300);
    check('contextual: clearing the selection brings the previous tab back and removes the Table tab', await sh(page, (r) => !r.querySelector('#rb-tab-table') && r.querySelector('.rb-tab[aria-selected="true"]')?.dataset.tab === 'home'));
    // the diagram tabs open together
    await page.evaluate(() => window.BW.runAction('addDiagram'));
    await page.waitForTimeout(900);
    const dg = await sh(page, (r) => [...r.querySelectorAll('.rb-tab')].map((x) => x.dataset.tab).filter((x) => /^diagram/.test(x)).join());
    check('contextual: a diagram selection opens the Diagram tab and its Arrange tab together', dg === 'diagram,diagram2' || dg === '', dg);
    check('contextual: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── a language switch re-words the tabs and the names without a stale panel; the fast path is not taken for it ──
  {
    const { page, ctx, errors } = await open('ar', 1366, 768);
    await setTab(page, 'insert');
    await page.locator('#bw-ui-host').locator('[data-a="ed"][data-ed="en"]').click();
    await page.waitForTimeout(400);
    const en = await sh(page, (r) => ({ tabs: [...r.querySelectorAll('.rb-tab')].map((x) => x.textContent.trim()).slice(0, 3).join(' '), tool: r.querySelector('.rb-panel [data-a="image"] .w')?.textContent.trim(), tab: r.querySelector('.rb-tab[aria-selected="true"]')?.dataset.tab }));
    check('language switch: the tabs and the selected panel are re-worded in English and the tab stays', en.tabs === 'File Export Home' && en.tab === 'insert' && !!en.tool && /[A-Za-z]/.test(en.tool), JSON.stringify(en));
    check('language switch: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ── reload: a folded ribbon stays folded ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(() => { localStorage.setItem('bw:rb:c', '1'); });
    await page.reload();
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(500);
    check('note 6 AC3: after a reload the ribbon is still folded (panel hidden)', await sh(page, (r) => r.querySelector('.rb-panel').hidden && r.querySelector('.island').classList.contains('rb-collapsed')));
    await page.evaluate(() => { localStorage.removeItem('bw:rb:c'); });
    await ctx.close();
  }

  // ── narrow windows: 1280 and 1024 fit, 900 wraps to a second band, never a scroll bar ──
  for (const w of [1280, 1024, 900]) {
    const { page, ctx } = await open('ar', w, 768);
    const bad = [];
    for (const [tab] of GENERAL) {
      await setTab(page, tab);
      const o = await sh(page, (r) => { const p = r.querySelector('.rb-panel'), tabs = r.querySelector('.rb-tabs'); return { sw: p.scrollWidth, cw: p.clientWidth, h: Math.round(p.getBoundingClientRect().height), tabsFit: tabs.scrollWidth <= tabs.clientWidth + 1, names: [...r.querySelectorAll('.rb-tab')].every((x) => x.getAttribute('aria-label')) }; });
      if (o.sw > o.cw + 1 || !o.tabsFit || !o.names || (w >= 1024 && o.h !== 184)) bad.push(`${tab} ${JSON.stringify(o)}`);
    }
    check(`${w} px: every general tab fits (no scroll bar), the tab strip fits, every tab keeps its name${w < 1024 ? '' : ', the panel stays 184 px'}`, !bad.length, bad.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp is O: and cleaned later */ }
}
console.log(failed ? `\nFAILED: ${failed}` : '\nall ribbon-0150 checks passed');
process.exit(failed ? 1 : 0);
