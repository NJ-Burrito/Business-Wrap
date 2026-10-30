// 0.14.0 owner notes O1 + O2 (lane objects).
//   O1  a visible «التفاف النص / Wrap» menu on pictures, in-line pictures and text boxes: Word's six modes + position;
//       each prints the same in the editor, the PDF and the DOCX (wp:anchor wrapSquare / wrapTight / wrapTopAndBottom / behindDoc).
//   O2  the diagram's «رمز / Symbol» list is readable, an added symbol can be picked, moved and deleted, the legend text is editable.
//
//   node tests/objects-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, printHtml } from '../engine/export.mjs';
import { applyOps } from '../engine/edits.mjs';
import { DIAGRAM } from '../engine/diagram.mjs';
import { pageTexts, docxParts, pngUri, sample } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-objects0140-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  objects-0140: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const ONLY = process.env.BW_ONLY || ''; // BW_ONLY=o2 runs the diagram half only (quick loop)
const theme = loadTheme();
const IMG = pngUri(60, 60);
const P = '/chapters/0/sections/0/blocks/0';
const MODES6 = ['inline', 'square', 'tight', 'topBottom', 'behind', 'front'];
const XMLOF = { square: 'wp:wrapSquare', tight: 'wp:wrapTight', topBottom: 'wp:wrapTopAndBottom', behind: 'wp:wrapNone', front: 'wp:wrapNone' };
const baseOf = (loc) => sample(REPO, loc);
const withWrap = (loc, mode, extra = {}) => { const base = baseOf(loc); return applyOps(base, [{ op: 'replace', path: `${P}/id`, value: 'b-fix' }, { op: 'replace', path: '/overlays', value: [{ id: 'ov1', kind: 'image', src: IMG, mode: 'anchor', anchor: 'b-fix', wrap: mode, x: 0, y: 0, w: 30, ...extra }] }]); };

// ── O1 · print: PDF + DOCX per mode, both editions ──
for (const loc of ONLY === 'o2' ? [] : ['en', 'ar']) {
  const words = String(baseOf(loc).chapters[0].sections[0].blocks[0].paragraphs[0]).match(/\p{L}{3,}/gu) || [];
  for (const mode of MODES6.filter((m) => m !== 'inline')) {
    const doc = withWrap(loc, mode);
    const docx = path.join(tmp, `w-${loc}-${mode}.docx`);
    exportDocx(doc, { locale: loc, theme, docxPath: docx, embedFonts: false });
    const xml = docxParts(docx, /^word\/document\.xml$/)['word/document.xml'];
    check(`${loc} ${mode}: DOCX anchor ${XMLOF[mode]}${mode === 'behind' ? ' + behindDoc="1"' : ''}`, new RegExp(`<${XMLOF[mode]}[ />]`).test(xml) && (mode === 'behind') === /behindDoc="1"/.test(xml));
  }
  for (const mode of ['tight', 'behind']) {
    const pdf = path.join(tmp, `w-${loc}-${mode}.pdf`);
    await exportPdf(withWrap(loc, mode), { locale: loc, theme, pdfPath: pdf });
    const all = pageTexts(pdf).join(' ').normalize('NFKC').replace(/\s+/g, '');
    const lost = words.filter((w) => !all.includes(w.normalize('NFKC')));
    check(`${loc} ${mode}: PDF keeps the words of the paragraph`, lost.length <= Math.ceil(words.length * 0.05), lost.slice(0, 5).join(' '));
  }
  // position: «ثابت على الصفحة» = a locked anchor in Word, nothing else changes
  const f = path.join(tmp, `pos-${loc}.docx`);
  exportDocx(withWrap(loc, 'square', { pos: 'page' }), { locale: loc, theme, docxPath: f, embedFonts: false });
  const fx = docxParts(f, /^word\/document\.xml$/)['word/document.xml'];
  const g = path.join(tmp, `pos0-${loc}.docx`);
  exportDocx(withWrap(loc, 'square'), { locale: loc, theme, docxPath: g, embedFonts: false });
  const gx = docxParts(g, /^word\/document\.xml$/)['word/document.xml'];
  check(`${loc}: pos=page gives locked="1"; moves with text gives locked="0"`, /<wp:anchor[^>]*locked="1"/.test(fx) && /<wp:anchor[^>]*locked="0"/.test(gx) && fx.includes('<wp:wrapSquare'));
}
{ // print HTML identical for pos (the position flag never changes the layout)
  const a = printHtml(withWrap('en', 'square'), { locale: 'en', theme }).html.replace(/\s+/g, '');
  const b = printHtml(withWrap('en', 'square', { pos: 'page' }), { locale: 'en', theme }).html.replace(/\s+/g, '');
  check('pos does not change the print layout (same HTML)', a === b);
}

// ── editor ──
const file = path.join(tmp, 'a.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'objects0140', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  for (const ui of ONLY === 'o2' ? [] : ['ar', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:calm', '1'); } catch {} }, ui);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    const E = () => page.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; return { ops: e.ops.length, doc: JSON.parse(JSON.stringify(e.doc)) }; });
    const shp = (fn, arg) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot, ${JSON.stringify(arg ?? null)})`);
    const pick = async (name, value) => { await shp((r, a) => { const s = r.querySelector(`.ctx select[data-w2="${a[0]}"]`); s.value = a[1]; s.dispatchEvent(new Event('change', { bubbles: true })); }, [name, value]); };
    await page.evaluate(([P, IMG]) => { window.BW.commit([{ op: 'replace', path: '/overlays', value: [{ id: 'ov1', kind: 'image', src: IMG, mode: 'anchor', anchor: P, x: 10, y: 0, w: 30 }] }]); window.BW.S.selOv = 0; window.BW.render(); }, [P, IMG]);
    // the menu is in the selection bar itself, on the screen, with whole words
    const m = await shp((r) => { const s = r.querySelector('.ctx select[data-w2="wrap"]'); if (!s) return null; const b = s.getBoundingClientRect(); return { x: b.x, w: b.width, right: b.right, vis: b.width > 0 && b.height > 0 && b.right <= innerWidth && b.x >= 0, opts: [...s.options].map((o) => o.value), texts: [...s.options].map((o) => o.textContent), pos: !!r.querySelector('.ctx select[data-w2="pos"]') }; });
    check(`${ui}: the Wrap menu is visible in the picture's bar (not behind «…»)`, !!m && m.vis && m.w >= 90, JSON.stringify(m));
    check(`${ui}: the menu lists Word's six modes`, !!m && JSON.stringify(m.opts) === JSON.stringify(MODES6) && m.texts.every((x) => x.length > 2), JSON.stringify(m?.texts));
    check(`${ui}: the position list is there (move with text / fix on page)`, !!m?.pos);
    // each mode = one op; undo; the print follows
    let n = (await E()).ops;
    let ok = true;
    for (const mode of ['square', 'tight', 'topBottom', 'behind', 'front']) {
      await pick('wrap', mode);
      const now = await E();
      if (now.ops !== n + 1 || now.doc.overlays[0].wrap !== mode) ok = false;
      n = now.ops;
    }
    check(`${ui}: each pick is one op and sets the mode (5 modes)`, ok);
    await page.evaluate(() => window.BW.undo());
    check(`${ui}: undo restores the previous mode`, (await E()).doc.overlays[0].wrap === 'behind');
    // position
    n = (await E()).ops;
    await pick('pos', 'page');
    let e1 = await E();
    check(`${ui}: «Fix on page» is one op (pos = page); the wrap stays`, e1.ops === n + 1 && e1.doc.overlays[0].pos === 'page' && e1.doc.overlays[0].wrap === 'behind');
    await pick('pos', 'text');
    e1 = await E();
    check(`${ui}: «Move with text» removes the flag`, e1.doc.overlays[0].pos === undefined && e1.ops === n + 2);
    await page.evaluate(() => { window.BW.undo(); window.BW.undo(); });
    check(`${ui}: undo x2 back to the free position`, (await E()).doc.overlays[0].pos === undefined);
    // the picture in the flow (a shots block) has the menu too
    await page.evaluate(() => { window.BW.S.selOv = null; window.BW.commit([{ op: 'insert', path: '/chapters/0/sections/0/blocks/1', value: { kind: 'shots', caption: 'c', images: ['x'], width: 30 } }]); window.BW.S.sel = { b: '/chapters/0/sections/0/blocks/1', p: null, ed: window.BW.S.ed }; window.BW.render(); });
    await page.waitForTimeout(150);
    const inl = await shp((r) => { const s = r.querySelector('.ctx select[data-w2="wrap"]'); return s ? { v: s.value, pos: !!r.querySelector('.ctx select[data-w2="pos"]') } : null; });
    check(`${ui}: a picture in line shows the menu on «In line» (no position list)`, inl?.v === 'inline' && !inl.pos, JSON.stringify(inl));
    await page.evaluate(() => window.BW.undo());
    // a text box
    await page.evaluate((P) => window.BW.selectEl(document.querySelector(`#bw-pair main.bw-doc [data-b="${P}"]`)), P);
    await page.evaluate(() => window.BW.runAction('insTextBox'));
    const tbm = await shp((r) => { const s = r.querySelector('.ctx select[data-w2="wrap"]'); return s ? { v: s.value, n: s.options.length, pos: !!r.querySelector('.ctx select[data-w2="pos"]') } : null; });
    check(`${ui}: a text box shows the menu (in front by default) and the position`, tbm?.v === 'front' && tbm.n === 6 && tbm.pos, JSON.stringify(tbm));
    check(`${ui}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }

  // ── O2 · diagram: symbol list, symbol pick / move / delete, legend text ──
  for (const loc of ['ar']) { // the sample opens as the Arabic edition; the English edition's legend is checked at engine level below
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:calm', '1'); } catch {} }, loc);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    if (loc === 'en') await page.evaluate(() => { if (window.BW.S.ed !== 'en') window.BW.runAction('uiLang'); });
    await page.waitForFunction((l) => window.BW.S.ed === l, loc);
    const model = () => page.evaluate((loc) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][loc].doc.chapters[2].sections[0].blocks[0].model)), loc);
    const ops = () => page.evaluate((loc) => window.BW.M[window.BW.S.svc][loc].ops.length, loc);
    const fig = page.locator(`main.bw-doc[data-locale="${loc}"] figure[data-dg]`);
    await fig.locator('svg').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const fb = await fig.locator('svg').boundingBox();
    await page.mouse.click(fb.x + 6, fb.y + 6); // the empty drawing: the diagram's tools
    await page.evaluate(() => window.BW.runAction('dgSymbol'));
    const gal = await page.evaluate(() => {
      const g = document.querySelector('.bw-dg-gallery');
      if (!g) return null;
      const bs = [...g.querySelectorAll('button')];
      const r = g.getBoundingClientRect();
      return { n: bs.length, labels: bs.map((x) => x.textContent), clipped: bs.filter((x) => x.scrollWidth > x.clientWidth + 1 || x.scrollHeight > x.clientHeight + 1).length, minW: Math.min(...bs.map((x) => x.getBoundingClientRect().width)), onScreen: r.left >= 0 && r.right <= innerWidth && r.top >= 0, dir: g.dir };
    });
    check(`${loc}: the Symbol gallery lists all 13 symbols by full name, none clipped, on screen`, !!gal && gal.n === 13 && gal.clipped === 0 && gal.minW >= 100 && gal.onScreen && gal.labels.every((x) => !/^sym_/.test(x) && x.length > 1), JSON.stringify(gal));
    // add a symbol through the gallery
    const m0 = await model();
    const o0 = await ops();
    await page.locator('.bw-dg-gallery button[data-sym="clock"]').click();
    const m1 = await model();
    const symNode = m1.nodes.find((n) => n.kind === 'symbol');
    check(`${loc}: picking «clock» adds one symbol shape (one op) and closes the gallery`, !!symNode && symNode.icon === 'clock' && m1.nodes.filter((n) => n.kind === 'symbol').length === m0.nodes.filter((n) => n.kind === 'symbol').length + 1 && (await ops()) === o0 + 1 && (await page.locator('.bw-dg-gallery').count()) === 0);
    await page.evaluate(() => window.BW.runAction('dgSymbol'));
    await page.keyboard.press('Escape');
    check(`${loc}: Escape closes the gallery without adding anything`, (await page.locator('.bw-dg-gallery').count()) === 0 && (await model()).nodes.filter((n) => n.kind === 'symbol').length === m1.nodes.filter((n) => n.kind === 'symbol').length);
    // it is selected at once; click elsewhere, then pick it again by a click on it
    const symEl = page.locator(`main.bw-doc[data-locale="${loc}"] [data-dg-node="${symNode.id}"]`).first();
    await symEl.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const fb2 = await fig.locator('svg').boundingBox();
    await page.mouse.click(fb2.x + 6, fb2.y + 6);
    const picked0 = await page.evaluate(() => window.BW.S.dg?.nodes || []);
    const sb = await symEl.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    const picked = await page.evaluate(() => window.BW.S.dg?.nodes || []);
    check(`${loc}: a click on the added symbol selects it`, !picked0.includes(symNode.id) && picked.length === 1 && picked[0] === symNode.id, JSON.stringify({ picked0, picked }));
    await page.mouse.click(fb2.x + 6, fb2.y + 6);
    await page.mouse.click(sb.x + 2, sb.y + 2);
    const corner = await page.evaluate(() => window.BW.S.dg?.nodes || []);
    check(`${loc}: a click in the symbol's empty frame selects it too`, corner[0] === symNode.id, JSON.stringify(corner));
    // move by drag = one op
    const o1 = await ops();
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width / 2 + 60, sb.y + sb.height / 2 + 30, { steps: 6 });
    await page.mouse.up();
    const m2 = await model();
    const mv = m2.nodes.find((n) => n.id === symNode.id);
    check(`${loc}: the symbol moves by a drag (one op, x/y changed)`, (await ops()) === o1 + 1 && (mv.x !== symNode.x || mv.y !== symNode.y), `${symNode.x},${symNode.y} -> ${mv.x},${mv.y}`);
    // delete, then undo
    await page.keyboard.press('Delete');
    const m3 = await model();
    check(`${loc}: Delete removes the symbol`, !m3.nodes.some((n) => n.id === symNode.id));
    await page.evaluate(() => window.BW.undo());
    check(`${loc}: undo brings it back`, (await model()).nodes.some((n) => n.id === symNode.id));
    const pr = DIAGRAM.render(await model(), { theme, locale: loc });
    check(`${loc}: the printed SVG has no editor-only attributes`, !/pointer-events|data-dg-legend|data-dg-node/.test(pr));
    // legend text
    const lg = page.locator(`main.bw-doc[data-locale="${loc}"] text[data-dg-legend="staff"]`).first();
    await lg.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const lb = await lg.boundingBox();
    const oldText = (await lg.textContent()).trim();
    await page.mouse.dblclick(lb.x + lb.width / 2, lb.y + lb.height / 2);
    const ed = page.locator('.bw-dg-edit');
    const opened = await ed.count();
    check(`${loc}: a double-click on a legend entry opens an editor with its words`, opened === 1 && (await ed.innerText()).trim() === oldText, `${opened} ${oldText}`);
    const o2 = await ops();
    const want = loc === 'ar' ? 'مرحلة الموظف المختص' : 'Specialist stage';
    await page.keyboard.press('Control+A');
    await page.keyboard.type(want);
    await page.keyboard.press('Enter');
    const m4 = await model();
    check(`${loc}: Enter saves the new legend text in model.legend (one op)`, m4.legend?.staff === want && (await ops()) === o2 + 1, JSON.stringify(m4.legend));
    const svg = DIAGRAM.render(m4, { theme, locale: loc });
    check(`${loc}: the printed drawing shows the new legend text; the other keys keep theirs`, svg.includes(want) && !svg.includes(`>${oldText}<`) && svg.includes(DIAGRAM.words(loc).ok), JSON.stringify({ a: svg.includes(want), b: !svg.includes(`>${oldText}<`), c: svg.includes(DIAGRAM.words(loc).ok), oldText }));
    const lg2 = page.locator(`main.bw-doc[data-locale="${loc}"] text[data-dg-legend="staff"]`).first();
    await lg2.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const lb2 = await lg2.boundingBox();
    await page.mouse.dblclick(lb2.x + lb2.width / 2, lb2.y + lb2.height / 2);
    await page.keyboard.press('Control+A'); await page.keyboard.type('zzz'); await page.keyboard.press('Escape');
    check(`${loc}: Escape leaves the legend as it was`, (await model()).legend?.staff === want);
    const lg3 = page.locator(`main.bw-doc[data-locale="${loc}"] text[data-dg-legend="staff"]`).first();
    const lb3 = await lg3.boundingBox();
    await page.mouse.dblclick(lb3.x + lb3.width / 2, lb3.y + lb3.height / 2);
    await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter');
    const m5 = await model();
    check(`${loc}: an emptied entry goes back to the default wording`, !m5.legend || m5.legend.staff === undefined, JSON.stringify(m5.legend));
    await page.evaluate(() => window.BW.undo());
    check(`${loc}: undo brings the edited wording back`, (await model()).legend?.staff === want);
    // DOCX carries the edited legend
    const doc = await page.evaluate((loc) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][loc].doc)), loc);
    const dx = path.join(tmp, `lg-${loc}.docx`);
    exportDocx(doc, { locale: loc, theme, docxPath: dx, embedFonts: false });
    const dxml = docxParts(dx, /^word\/document\.xml$/)['word/document.xml'];
    check(`${loc}: the DOCX carries the edited legend text`, dxml.includes(want));
    check(`${loc}: no page errors`, !errors.length, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
{ // English edition, engine level: the override prints, the editor mark never does, an untouched key keeps its default
  const m = DIAGRAM.layout({ kind: 'bw-diagram', version: 1, nodes: [{ id: 'a', kind: 'staff', label: 'A' }, { id: 'b', kind: 'ok', label: 'B' }], edges: [{ from: 'a', to: 'b' }], legend: { staff: 'Specialist stage' } });
  const pr = DIAGRAM.render(m, { theme, locale: 'en' });
  const ed = DIAGRAM.render(m, { theme, locale: 'en', editor: true });
  check('en: the legend override prints, the other key keeps its default', pr.includes('>Specialist stage<') && pr.includes(DIAGRAM.words('en').ok) && !pr.includes('data-dg-legend'));
  check('en: the editor build marks each legend entry for in-place editing', /data-dg-legend="staff"/.test(ed) && /data-dg-legend="ok"/.test(ed));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
