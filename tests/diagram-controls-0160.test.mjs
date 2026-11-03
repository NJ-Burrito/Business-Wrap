// 0.16.0 · D4: the UI controls for the per-node type size (node.fs) and the join point (kind 'join'), Arabic and English, in the real editor;
// and the deselect rule: a click on a paragraph leaves no canvas handle behind.
//
//   node tests/diagram-controls-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const OUT = path.join(REPO, 'out', 'diagram-controls-0160');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
const NL = String.fromCharCode(10);
process.on('uncaughtException', (e) => { console.log(results.join(NL)); console.error('CRASH: ' + String(e.message).split(NL).slice(0, 3).join(' / ')); process.exit(2); });
// 0.16.1: the sample prints its workflow as two figures; this suite drives ONE whole drawing (the pre-split sample documents)
const SAMPLE = path.join(REPO, 'tests', 'fixtures', 'permit-whole');
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'controls-0160', watermarkDir: '' });
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  for (const ui of ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:calm', '1'); } catch {} }, ui);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    const FIG = 'main.bw-doc figure[data-dg]';
    const SR = "document.getElementById('bw-ui-host').shadowRoot";
    const raw = () => page.evaluate(() => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model)); });
    const ops = () => page.evaluate(() => window.BW.editsFile(window.BW.S.svc, 'ar').ops.length);
    const reveal = async () => { await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); window.scrollBy(0, f.getBoundingClientRect().top - 430); }); await page.waitForTimeout(80); };
    const T = (ar, en) => (ui === 'ar' ? ar : en);
    await reveal();
    const boot = await page.evaluate(() => ({ ready: !!window.BW.ready, nodes: document.querySelectorAll('main.bw-doc figure[data-dg] [data-dg-node]').length }));
    check(`[${ui}] ready: the editor booted with a drawing and its shapes`, boot.ready && boot.nodes >= 8, JSON.stringify(boot));

    // deselect: handles are there while the drawing is selected, gone after a click on a paragraph
    const sb = await page.locator(`${FIG} svg`).boundingBox();
    await page.mouse.click(sb.x + 4, sb.y + 4);
    await page.waitForTimeout(100);
    const h1 = await page.evaluate(() => ({ dg: !!window.BW.S.dg, handles: document.querySelectorAll('[data-dg-cv]').length }));
    check(`[${ui}] ready: the selected drawing shows its 8 canvas handles`, h1.dg && h1.handles === 8, JSON.stringify(h1));
    const para = await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg]'); const ps = [...document.querySelectorAll('#bw-pair main.bw-doc[data-locale="ar"] [data-p]')].filter((p) => !f.contains(p) && p.textContent.trim().length > 10); const p = ps.find((x) => (f.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_PRECEDING) === 0) || ps[0]; p.scrollIntoView({ block: 'center' }); const r = p.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + Math.min(r.height / 2, 8) }; });
    await page.waitForTimeout(80);
    const p2 = await page.evaluate((pt) => { const el = document.elementFromPoint(pt.x, pt.y); const q = el?.closest?.('[data-p]'); if (!q) return null; const r = q.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + Math.min(r.height / 2, 8) }; }, para);
    await page.mouse.click((p2 || para).x, (p2 || para).y);
    await page.waitForTimeout(120);
    const h2 = await page.evaluate(() => ({ dg: window.BW.S.dg, handles: document.querySelectorAll('[data-dg-cv]').length, ui: document.querySelectorAll('figure[data-dg] .dg-ui').length, on: document.querySelectorAll('figure[data-dg].dg-on').length }));
    check(`[${ui}] a click on a paragraph clears the selection and every canvas handle with it`, h2.dg === null && h2.handles === 0 && h2.ui === 0 && h2.on === 0, JSON.stringify(h2));

    // the join point is a tool of the diagram tab, with its name and a vector icon
    await reveal();
    const sb2 = await page.locator(`${FIG} svg`).boundingBox();
    await page.mouse.click(sb2.x + 4, sb2.y + 4);
    await page.waitForTimeout(100);
    check(`[${ui}] ready: the empty drawing is selected again`, await page.evaluate(() => !!window.BW.S.dg), JSON.stringify(await page.evaluate(() => { const f = document.querySelector('main.bw-doc figure[data-dg] svg').getBoundingClientRect(); return [f.x, f.y, f.width, f.height, scrollY]; })));
    const panel = await page.evaluate(() => window.BW.EXT.ribbon.panelHtml('diagram'));
    check(`[${ui}] the diagram tab has the join-point tool`, panel.includes('data-a="dgJoin"'), panel.slice(0, 120));
    const jb = await page.evaluate((sr) => { const b = eval(sr).querySelector('[data-a="dgJoin"]'); return b ? { label: (b.getAttribute('aria-label') || b.title || b.textContent || '').trim(), icon: !!b.querySelector('svg.ic') } : null; }, SR);
    check(`[${ui}] its name is in the UI language and it carries a vector icon`, !!jb && jb.label === T('نقطة التقاء', 'Join point') && jb.icon, JSON.stringify(jb));

    // add a join point
    const m0 = await raw();
    const o0 = await ops();
    await page.evaluate(() => window.BW.runAction('dgJoin'));
    await page.waitForTimeout(120);
    const m1 = await raw();
    const added = m1.nodes.filter((n) => n.kind === 'join' && !m0.nodes.some((x) => x.id === n.id));
    const selId = await page.evaluate(() => window.BW.S.dg.nodes[0]);
    check(`[${ui}] the tool adds one join node of 10 x 10, selected, in one op`, added.length === 1 && added[0].kind === 'join' && added[0].w === 10 && added[0].h === 10 && selId === added[0].id && (await ops()) === o0 + 1, JSON.stringify(added));
    check(`[${ui}] it is drawn`, (await page.locator(`${FIG} [data-dg-node="${added[0].id}"]`).count()) >= 1);
    const c1 = await page.evaluate((sr) => { const r = eval(sr); const k = r.querySelector('select[data-dg="kind"]'); return { kind: k?.value, hasFs: !!r.querySelector('select[data-dg="fs"]'), kindLabel: [...(k?.options || [])].find((o) => o.value === 'join')?.textContent }; }, SR);
    check(`[${ui}] a join point has no text size; its kind is named in the kind list`, c1.kind === 'join' && !c1.hasFs && c1.kindLabel === T('نقطة التقاء', 'join point'), JSON.stringify(c1));
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(100);
    check(`[${ui}] undo takes it away`, (await raw()).nodes.length === m0.nodes.length && (await ops()) === o0);

    // the type size of one shape
    await reveal();
    const nb = await page.locator(`${FIG} [data-dg-node="rev"]`).first().boundingBox();
    await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
    await page.waitForTimeout(100);
    const sel = await page.evaluate((sr) => ({ nodes: window.BW.S.dg?.nodes, hasFs: !!eval(sr).querySelector('select[data-dg="fs"]') }), SR);
    check(`[${ui}] ready: the shape «rev» is selected and shows the type-size list`, sel.nodes?.length === 1 && sel.nodes[0] === 'rev' && sel.hasFs, JSON.stringify(sel));
    const fi = await page.evaluate((sr) => { const s = eval(sr).querySelector('select[data-dg="fs"]'); return { label: s.getAttribute('aria-label'), value: s.value, first: s.options[0].textContent, n: s.options.length }; }, SR);
    check(`[${ui}] the list is named in the UI language and starts at «by kind»`, fi.label === T('حجم الخط', 'Text size') && fi.value === '' && fi.first === T('حسب النوع', 'by kind') && fi.n >= 10, JSON.stringify(fi));
    const pickFs = (v) => page.evaluate(([sr, v]) => { const el = eval(sr).querySelector('select[data-dg="fs"]'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, [SR, v]);
    const fontOf = () => page.evaluate(() => { const tx = document.querySelector('main.bw-doc figure[data-dg] [data-dg-node="rev"] text'); return tx ? parseFloat(tx.getAttribute('font-size')) : null; });
    const f0 = await fontOf();
    const mb = await raw();
    const ens = () => page.evaluate(() => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); return m.nodes.find((n) => n.id === 'rev'); });
    const nb0 = await ens();
    const o1 = await ops();
    await pickFs('24');
    await page.waitForTimeout(150);
    const ma = await raw();
    const na = await ens();
    const f1 = await fontOf();
    check(`[${ui}] choosing 24 stores fs = 24 on that one shape only, in one op`, ma.nodes.find((n) => n.id === 'rev').fs === 24 && ma.nodes.filter((n) => n.fs).length === mb.nodes.filter((n) => n.fs).length + 1 && (await ops()) === o1 + 1, JSON.stringify({ fs: na.fs, ops: [o1, await ops()] }));
    check(`[${ui}] the lettering is drawn at 24 and the shape grew around its centre`, f1 === 24 && f0 !== 24 && na.w >= nb0.w && Math.abs(na.x + na.w / 2 - (nb0.x + nb0.w / 2)) <= 1 && Math.abs(na.y + na.h / 2 - (nb0.y + nb0.h / 2)) <= 1, JSON.stringify({ font: [f0, f1], w: [nb0.w, na.w] }));
    check(`[${ui}] the list shows the stored size`, (await page.evaluate((sr) => eval(sr).querySelector('select[data-dg="fs"]')?.value, SR)) === '24');
    const pr = await page.evaluate(() => { const B = window.BW; const m = B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); return B.DIAGRAM.render(m, { theme: B.S.theme, locale: 'ar' }).includes('font-size="24"'); });
    check(`[${ui}] the size is in the print SVG too`, pr);
    await pickFs('');
    await page.waitForTimeout(120);
    check(`[${ui}] «by kind» removes the key`, !('fs' in (await raw()).nodes.find((n) => n.id === 'rev')));
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(100);
    check(`[${ui}] undo brings the 24 back`, (await raw()).nodes.find((n) => n.id === 'rev').fs === 24);
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(100);
    check(`[${ui}] the second undo leaves the model as it was`, JSON.stringify(await raw()) === JSON.stringify(mb) && (await ops()) === o1);
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}
console.log(results.join(NL));
console.log(failed ? `FAILED: ${failed} of ${results.length}` : `all ${results.length} PASS`);
process.exit(failed ? 1 : 0);
