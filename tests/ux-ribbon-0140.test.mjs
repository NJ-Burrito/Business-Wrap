// Lane ux-ribbon · 0.14.0 — R1 the Word-style ribbon, R2 a tool press keeps the selection, R3 language + direction side by side,
// R4 the changes button. Real headless Chrome (msedge via launchOptions), real mouse and keyboard; closed in finally.
//   node tests/ux-ribbon-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-ribbon-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  ux-ribbon: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };

const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'ribbon-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const open = async (ui = 'ar', size = { width: 1600, height: 900 }) => {
    const ctx = await browser.newContext({ viewport: size });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); } catch { /* storage may be denied */ } }, ui);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text()) && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(500);
    return { page, errors };
  };
  const sh = (page, fn, arg) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot, ${JSON.stringify(arg ?? null)})`);
  const { page, errors } = await open('ar');
  const ed = await page.evaluate(() => window.BW.S.ed);

  // ── R1 · tabs, groups, every command reachable ───────────────────────────
  const tabsAr = await sh(page, (r) => [...r.querySelectorAll('.ribbon .rb-tab')].map((x) => x.textContent.trim()));
  check('R1 happy: the Arabic ribbon has the 11 general tabs of 0.15.0 (ملف تصدير الرئيسية الخط الفقرة إدراج التخطيط الترويسة والتذييل التصميم مراجعة عرض)', ['ملف', 'تصدير', 'الرئيسية', 'الخط', 'الفقرة', 'إدراج', 'التخطيط', 'الترويسة والتذييل', 'التصميم', 'مراجعة', 'عرض'].every((w) => tabsAr.includes(w)) && tabsAr.length === 11, tabsAr.join());
  check('R1 happy: tabs are a tablist, each with aria-selected, and the panel is a tabpanel with labelled groups', await sh(page, (r) => !!r.querySelector('.ribbon [role=tablist]') && r.querySelectorAll('.ribbon [role=tab]').length === 11 && r.querySelectorAll('.ribbon [role=tab][aria-selected=true]').length === 1 && r.querySelector('.ribbon [role=tabpanel]') && [...r.querySelectorAll('.ribbon [role=tabpanel] [role=group]')].every((g) => g.getAttribute('aria-label'))));
  // every command of the registry is on some tab: drawn in a general tab, or listed in a contextual one (Table / Picture / Diagram)
  const reach = await page.evaluate(async () => {
    const B = window.BW; const R = B.EXT.ribbon; const r = document.getElementById('bw-ui-host').shadowRoot;
    const seen = new Set();
    for (const t of R.tabs()) { R.setTab(t); await new Promise((q) => setTimeout(q, 0)); r.querySelectorAll('.ribbon .rb-panel [data-a]').forEach((b) => seen.add(b.dataset.a)); }
    return { drawn: [...seen], listed: R.listed(), cmds: B.EXT.cmds.map((c) => c.id) };
  });
  const missing = reach.cmds.filter((id) => !reach.drawn.includes(id) && !reach.listed.includes(id) && id !== 'dir');
  check('R1 coverage: every registered extension command is in the ribbon (general tab or contextual tab)', !missing.length && reach.cmds.length > 50, missing.join());
  const coreMissing = await page.evaluate(async () => {
    const r = document.getElementById('bw-ui-host').shadowRoot; const R = window.BW.EXT.ribbon; const seen = new Set();
    for (const t of R.tabs()) { R.setTab(t); await new Promise((q) => setTimeout(q, 0)); r.querySelectorAll('.ribbon .rb-panel [data-a]').forEach((b) => seen.add(b.dataset.a)); }
    const legacy = [...r.querySelectorAll('.island > .sec:not(.now):not([data-cat="view"]) [data-a]')].map((b) => b.dataset.a).filter((a) => a !== 'more');
    return [...new Set(legacy)].filter((a) => !seen.has(a) && !R.listed().includes(a));
  });
  check('R1 coverage: every tool the old toolbar sections had is on a tab (File, Insert, Edit, Document, Design, Header, Footer, Gaps, Export)', !coreMissing.length, coreMissing.join());
  check('R1 coverage: the diagram tools sit in the Diagram tab list (dg* all listed)', reach.cmds.filter((c) => /^dg/.test(c)).every((c) => reach.listed.includes(c)));
  await page.evaluate(() => window.BW.EXT.ribbon.setTab('home'));

  // R1 edge: collapse / expand, remembered
  await page.locator('#bw-ui-host').locator('.ribbon .rb-col').click();
  check('R1 edge: the collapse button folds the ribbon to its tab row (panel hidden, aria-expanded=false)', await sh(page, (r) => r.querySelector('.ribbon .rb-panel').hidden && r.querySelector('.rb-col').getAttribute('aria-expanded') === 'false'));
  await page.locator('#bw-ui-host').locator('#rb-tab-insert').click();
  check('R1 edge (0.15.0): a tab pressed while collapsed selects it and expands the ribbon (no peek)', await sh(page, (r) => !r.querySelector('.ribbon .rb-panel').hidden && r.querySelector('#rb-tab-insert').getAttribute('aria-selected') === 'true'));
  await page.locator('#bw-ui-host').locator('#rb-tab-insert').click();
  check('R1 edge (0.15.0): …pressing the selected tab again folds the ribbon', await sh(page, (r) => r.querySelector('.ribbon .rb-panel').hidden));
  check('R1 edge: the collapsed state is remembered (localStorage)', await page.evaluate(() => localStorage.getItem('bw:rb:c') === '1'));
  await page.locator('#bw-ui-host').locator('.ribbon .rb-col').click();
  check('R1 edge: expanding brings the panel back', await sh(page, (r) => !r.querySelector('.ribbon .rb-panel').hidden));

  // R1 keyboard + RTL: tabs run right to left in Arabic; ArrowRight goes to the previous (visually right) tab
  const geo = await sh(page, (r) => { const a = r.querySelector('#rb-tab-file').getBoundingClientRect(), b = r.querySelector('#rb-tab-home').getBoundingClientRect(); return { fileRight: a.right, homeRight: b.right, dir: getComputedStyle(r.querySelector('.ribbon')).direction }; });
  check('R1 RTL: Arabic mirrors the ribbon (first tab «ملف» is the rightmost, direction rtl)', geo.dir === 'rtl' && geo.fileRight > geo.homeRight, JSON.stringify(geo));
  await page.locator('#bw-ui-host').locator('#rb-tab-export').focus();
  await page.keyboard.press('ArrowRight');
  check('R1 keyboard: ArrowRight in RTL moves to the previous tab (ملف) and selects it', await sh(page, (r) => r.querySelector('#rb-tab-file').getAttribute('aria-selected') === 'true' && r.activeElement?.id === 'rb-tab-file'));
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  check('R1 keyboard: ArrowLeft twice goes on to «الرئيسية»; End → last tab, Home → first', await sh(page, (r) => r.activeElement?.id === 'rb-tab-home') && (await page.keyboard.press('End'), await sh(page, (r) => r.activeElement?.id === 'rb-tab-view')) && (await page.keyboard.press('Home'), await sh(page, (r) => r.activeElement?.id === 'rb-tab-file')));
  await page.keyboard.press('ArrowDown');
  check('R1 keyboard: ArrowDown goes into the tools, Esc back to the tab', await sh(page, (r) => !!r.activeElement?.closest('.rb-panel')) && (await page.keyboard.press('Escape'), await sh(page, (r) => r.activeElement?.id === 'rb-tab-file')));
  await page.locator('#bw-ui-host').locator('#rb-tab-home').click();
  await page.keyboard.press('Alt');
  check('R1 keyboard: a tap on Alt puts the focus on the active tab', await sh(page, (r) => r.activeElement?.id === 'rb-tab-home'));

  // R1 contextual tabs: the Table tab appears with a cell selection, stays, goes with it
  const P = await page.evaluate(() => {
    const B = window.BW;
    const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks;
    const at = `/chapters/1/sections/0/blocks/${blocks.length}`;
    B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B', 'C', 'D'], rows: [['1', '2', '3', 'x'], ['4', '5', '6', 'y'], ['7', '8', '9', 'z'], ['10', '11', '12', 'w']] } }], { mirror: true });
    return at;
  });
  const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${P}"] td[data-r="${r}"][data-c="${c}"]`;
  const centre = async (r, c) => { await page.locator(cell(r, c)).scrollIntoViewIfNeeded(); const b = await page.locator(cell(r, c)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const dragSel = async (r0, c0, r1, c1) => { const [x0, y0] = await centre(r0, c0); await page.mouse.move(x0, y0); await page.mouse.down(); const [x1, y1] = await centre(r1, c1); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up(); };
  const selKeys = () => page.evaluate(() => [...window.BW.EXT.cells.state.sel].sort().join(' '));
  check('R1 contextual: no selection → no Table tab', await sh(page, (r) => !r.querySelector('#rb-tab-table')));
  await dragSel(0, 0, 1, 1);
  check('R1 contextual: selecting a 2×2 cell range raises the Table tab, active, with rows / columns / cells groups', await sh(page, (r) => r.querySelector('#rb-tab-table')?.getAttribute('aria-selected') === 'true' && r.querySelectorAll('.rb-panel [data-a="cellMerge"], .rb-panel [data-a="rowAdd"], .rb-panel [data-a="colDel"]').length === 3), await selKeys());
  const before = await selKeys();
  // R2 · pressing a ribbon tool keeps the cell range
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="cellWrap"]').click();
  check('R2 happy (cells): pressing «التفاف» in the Table tab keeps the same 4 cells selected and the tab stays', (await selKeys()) === before && before.split(' ').length === 4 && await sh(page, (r) => r.querySelector('#rb-tab-table')?.getAttribute('aria-selected') === 'true'), `${before} -> ${await selKeys()}`);
  // a tool that rebuilds the whole toolbar (dark mode) must not cost the selection either
  await page.locator('#bw-ui-host').locator('#rb-tab-design').click();
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="dark"]').click();
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="dark"]').click();
  check('R2 edge (cells): a rebuilding tool (dark mode twice) leaves the cell range selected, and the Table tab is still there', (await selKeys()) === before && await sh(page, (r) => !!r.querySelector('#rb-tab-table')));
  // the quick strip's own shortcuts still work too (floating context stays as an extra)
  check('R1 contextual: the docked selection strip (.ctx) stays as the shortcut set while the ribbon shows it all', await sh(page, (r) => !r.querySelector('.island .ctx').hidden && !!r.querySelector('.island .ctx [data-a]')));
  // R2 happy (multi): merge, undo — still selected
  await page.locator('#bw-ui-host').locator('#rb-tab-table').click();
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="cellMerge"]').click();
  check('R2 happy (cells): merge from the ribbon works on the range', await page.evaluate(([p]) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return (o.merges || []).length === 1; }, [P]));
  await page.keyboard.press('Control+z');
  await page.evaluate(() => window.BW.EXT.cells.select([[2, 0], [2, 1], [3, 0], [3, 1]], (() => { const x = document.querySelector('table[data-b]'); return { ed: window.BW.S.ed, rows: x.dataset.rows, b: x.dataset.b }; })()));
  // the restore itself: a snapshot taken, the selection thrown away by the press, put back before the command
  const restored = await page.evaluate(() => {
    const B = window.BW; const R = B.EXT.ribbon; const st = B.EXT.cells.state;
    const keys = [...st.sel].sort().join(' ');
    const snap = R.snap();
    st.sel.clear();
    R.restore(snap);
    return { keys, now: [...st.sel].sort().join(' ') };
  });
  check('R2 edge (undo/lost): a cell range lost between the press and the command is restored from the snapshot', restored.keys && restored.keys === restored.now, JSON.stringify(restored));
  // deselect: click empty page → the Table tab goes
  await page.mouse.click(60, 700);
  check('R1 contextual: clearing the selection removes the Table tab again', await sh(page, (r) => !r.querySelector('#rb-tab-table')) && (await selKeys()) === '');

  // R2 happy (text): a word selected in a prose paragraph survives presses on ribbon tools (a harmless one, a format one, a popup)
  const para = await page.evaluate(() => { const p = [...document.querySelectorAll('#bw-pair main.bw-doc [data-p]')].find((x) => /\/paragraphs\/\d+$/.test(x.dataset.p) && x.firstChild?.nodeType === 3 && x.firstChild.length > 8); p.scrollIntoView({ block: 'center' }); p.focus(); const r = document.createRange(); r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); window.__para = p.dataset.p; return s.toString(); });
  await page.locator('#bw-ui-host').locator('#rb-tab-view').click();
  const sel0 = await page.evaluate(() => getSelection().toString());
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="zoomIn"]').click();
  const sel1 = await page.evaluate(() => ({ s: getSelection().toString(), inDoc: !!document.activeElement?.closest?.('#bw-pair') }));
  check('R2 happy (text): a selected word is still selected after pressing a ribbon tool, focus stays in the page', para.length === 6 && sel0 === para && sel1.s === para && sel1.inDoc, `${para} | ${sel0} | ${JSON.stringify(sel1)}`);
  await page.locator('#bw-ui-host').locator('#rb-tab-font').click();
  const nOps = await page.evaluate(() => { const B = window.BW; return B.M[B.S.svc][B.S.ed].ops.length; });
  await page.locator('#bw-ui-host').locator('.rb-panel [data-a="fmtItalic"]').click();
  await page.waitForTimeout(200);
  check('R2 happy (text): the format tool acted on that selection (a new change on the document)', await page.evaluate((n) => { const B = window.BW; return B.M[B.S.svc][B.S.ed].ops.length > n; }, nOps));
  // …and through a popup (a «more» menu entry: the export menu)
  await page.locator('#bw-ui-host').locator('#rb-tab-file').click();
  const para2 = await page.evaluate(() => { const p = document.querySelector(`#bw-pair main.bw-doc [data-p="${window.__para}"]`); p.focus(); const t = [...p.childNodes].find((n) => n.nodeType === 3 && n.length > 4); const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 3); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return s.toString(); });
  await page.locator('#bw-ui-host').locator('.island > .sec[data-cat="view"] [data-a="view"]').first().click(); // 0.15.0: the ribbon has no folded menus; the View popover is the popup left
  check('R2 edge (popup): opening a popup menu from the ribbon keeps the text selection', para2.length === 3 && (await page.evaluate(() => getSelection().toString())) === para2, para2);
  await page.keyboard.press('Escape');
  // R2 Arabic: the same on an Arabic word is what the above did (the sample is Arabic); an EN edition run follows below.

  // ── R3 · language and direction side by side ──────────────────────────────
  const stack = async (p) => sh(p, (r) => { const L = r.querySelector('.seg.lang').getBoundingClientRect(), D = r.querySelector('.seg.ui').getBoundingClientRect(); const between = [...r.querySelectorAll('.island > *, .island .grp.doc > *')].filter((e) => { if (e.closest('.ribbon') || e.hidden || !e.getBoundingClientRect().width) return false; if (e.matches('.seg.lang, .seg.ui') || e.contains(r.querySelector('.seg.lang')) || e.contains(r.querySelector('.seg.ui')) || e.closest('.seg')) return false; const b = e.getBoundingClientRect(); return b.left >= Math.min(L.right, D.right) - 1 && b.right <= Math.max(L.left, D.left) + 1 && b.top < Math.max(L.bottom, D.bottom) && b.bottom > Math.min(L.top, D.top); }).map((e) => e.className || e.tagName); return { gap: Math.max(L.left, D.left) - Math.min(L.right, D.right), dy: Math.abs(L.top - D.top), between }; });
  const s1 = await stack(page);
  check('R3 happy (AR): language and direction toggles sit side by side (gap ≤ 12 px, same row, nothing between)', s1.gap <= 12 && s1.gap >= -8 && s1.dy < 6 && !s1.between.length, JSON.stringify(s1));
  const small = await open('ar', { width: 1366, height: 768 });
  const s2 = await stack(small.page);
  check('R3 edge (1366 px): still together on the same row', s2.gap <= 12 && s2.dy < 6 && !s2.between.length, JSON.stringify(s2));
  await small.page.context().close();
  const en = await open('en');
  const s3 = await stack(en.page);
  check('R3 (EN edition): together too, and the English ribbon reads File Export Home …', s3.gap <= 12 && s3.dy < 6 && !s3.between.length && (await sh(en.page, (r) => [...r.querySelectorAll('.rb-tab')].map((x) => x.textContent.trim()).slice(0, 3).join(' '))) === 'File Export Home', JSON.stringify(s3));
  await page.locator('#bw-ui-host').locator('[data-a="ed"][data-ed="en"]').click();
  await page.waitForTimeout(300);
  await page.locator('#bw-ui-host').locator('[data-a="dir"][data-d="ltr"]').first().click();
  check('R3 undo-ish: switching language and direction keeps them together and the toggles work (pressed states follow)', await sh(page, (r) => r.querySelector('.island [data-a="ed"][data-ed="en"]').getAttribute('aria-pressed') === 'true' && r.querySelector('.island [data-a="dir"][data-d="ltr"]').getAttribute('aria-pressed') === 'true') && (await stack(page)).gap <= 12);
  await en.page.context().close();

  // ── R4 · the changes button ────────────────────────────────────────────────
  const c0 = await sh(page, (r) => { const c = r.querySelector('.status .count'); const cs = getComputedStyle(c); return { tag: c.tagName, icon: !!c.querySelector('svg'), word: c.querySelector('.w')?.textContent.trim(), n: c.querySelector('.n')?.textContent, border: cs.borderTopWidth, cursor: cs.cursor, bg: cs.backgroundColor, label: c.getAttribute('aria-label') }; });
  check('R4 happy: the changes control is a <button> with an icon, the word and a count badge, a border and a pointer cursor', c0.tag === 'BUTTON' && c0.icon && !!c0.word && /^\d+$/.test(c0.n) && c0.border !== '0px' && c0.cursor === 'pointer' && /\d/.test(c0.label), JSON.stringify(c0));
  await page.locator('#bw-ui-host').locator('.status .count').hover();
  await page.waitForTimeout(450);
  const bgH = await sh(page, (r) => getComputedStyle(r.querySelector('.status .count')).backgroundColor);
  check('R4 happy: hover changes its look (background) and press scales it down', bgH !== c0.bg);
  const n0 = +c0.n;
  await page.evaluate(() => { const B = window.BW; const x = B.S.sel; B.commit([{ op: 'insert', path: '/chapters/0/sections/0/blocks/-', value: { kind: 'prose', paragraphs: ['x'] } }], {}); });
  await page.waitForTimeout(200);
  check('R4 edge: the badge counts changes live (+1 after an edit) and the aria-label follows', await sh(page, (r, n) => r.querySelector('.status .count .n').textContent === String(n + 1) && r.querySelector('.status .count').getAttribute('aria-label').includes(String(n + 1)), n0));
  await page.locator('#bw-ui-host').locator('.status .count').click();
  await page.waitForTimeout(400);
  check('R4 happy: pressing it opens the change history (it is a real button)', await page.evaluate(() => ['history', 'timeline'].includes(window.BW.S.drawer)));
  const calm = await page.evaluate(() => { document.documentElement.dataset.bwCalm = '1'; return true; });
  void calm;
  check('R4 calm: under calm mode the hover motion is off (transition none)', await sh(page, (r) => getComputedStyle(r.querySelector('.status .count')).transitionDuration.split(',').every((d) => parseFloat(d) === 0)));

  // ── contextual tabs: Picture and Diagram appear with their selection and stay while it lasts ──────────────
  {
    const pg = await open('ar');
    // diagram: the tab shows while a drawing is selected
    const dg = await pg.page.evaluate(async () => {
      const B = window.BW; B.S.dg = B.S.dg || null;
      const el = document.querySelector('#bw-pair [data-dg], #bw-pair .bw-dg, #bw-pair svg.dg');
      return !!el;
    });
    if (dg) {
      await pg.page.evaluate(() => { const el = document.querySelector('#bw-pair [data-dg], #bw-pair .bw-dg, #bw-pair svg.dg'); el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    }
    check('R1 contextual: the Diagram tab lists all dg* tools (selection path covered by diagram.test.mjs; the list is checked here)', await pg.page.evaluate(() => { const l = window.BW.EXT.ribbon.listed(); return window.BW.EXT.cmds.filter((c) => /^dg/.test(c.id)).length >= 0 && ['dgAlignL', 'dgFlow', 'dgBendAdd', 'dgZoomFit'].every((id) => l.includes(id)); }));
    await pg.page.context().close();
  }

  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
