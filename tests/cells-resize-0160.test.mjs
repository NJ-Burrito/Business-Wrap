// lane cells (bw-0160): dragging a table row's edge never throws, on every kind of table. The crash: a story's ID card that is not
// stored yet (it prints the default, `data-t` points at a card that does not exist) made ceResizeStart read `blk.rows` of undefined.
// Real pointer drags in the real editor, on a plain table, a story ID card, a story's actions table and its dictionary table, AR and EN;
// the drag stores the new height in ONE undo step (the card is stored in the same step); the height prints in HTML and in the PDF.
//   node tests/cells-resize-0160.test.mjs        (BW_CHROME=<path to Google Chrome>)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { pageTexts } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-cellsrz-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  cells-resize: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'cells-resize-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text()) && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  check('ready: the editor booted (window.BW.ready) before any probe', true);

  const SP = await page.evaluate(() => { let ptr = null; (function walk(o, p) { if (ptr || !o || typeof o !== 'object') return; if (o.kind === 'stories' && o.items?.[0]) { ptr = p; return; } for (const k in o) walk(o[k], `${p}/${k}`); })(window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters, '/chapters'); return ptr + '/items/0'; });
  // give the story an actions and a dictionary table (both editions: a mirrored insert)
  await page.evaluate((SP) => { const B = window.BW; const t = () => ({ columns: ['A', 'B'], rows: [['a1', 'b1'], ['a2', 'b2']], colWidths: [40, 60] }); B.commit([{ op: 'insert', path: `${SP}/actions`, value: t(), old: undefined }, { op: 'insert', path: `${SP}/dictionary`, value: t(), old: undefined }], { ed: B.S.ed, mirror: true }); }, SP);

  let pdfDone = false;
  for (const loc of ['en', 'ar']) {
    await page.evaluate((loc) => { const B = window.BW; if (B.S.ed !== loc && B.M[B.S.svc][loc]) { B.S.ed = loc; B.render(); } }, loc);
    const ed = await page.evaluate(() => window.BW.S.ed);
    check(`${loc}: the edition is on screen`, ed === loc, ed);
    const main = `#bw-pair main.bw-doc[data-locale="${ed}"]`;
    const plainSel = `${main} table[data-b]:not([data-t])`;
    const kinds = [
      { name: 'plain table', sel: plainSel, ptr: async () => page.locator(plainSel).first().getAttribute('data-b') },
      { name: 'story ID card', sel: `${main} table[data-t="${SP}/card"]`, ptr: async () => `${SP}/card`, card: true },
      { name: 'story actions table', sel: `${main} table[data-t="${SP}/actions"]`, ptr: async () => `${SP}/actions` },
      { name: 'story dictionary table', sel: `${main} table[data-t="${SP}/dictionary"]`, ptr: async () => `${SP}/dictionary` },
    ];
    for (const k of kinds) {
      const tbl = page.locator(k.sel).first();
      check(`${loc}: ${k.name}: found on screen (positive sample)`, (await tbl.count()) === 1);
      const ptr = await k.ptr();
      const get = () => page.evaluate(([p, e]) => { const B = window.BW; let o = B.M[B.S.svc][e].doc; for (const x of p.split('/').slice(1)) o = o?.[x]; return o && JSON.parse(JSON.stringify(o)); }, [ptr, ed]);
      const opsN = () => page.evaluate((e) => window.BW.M[window.BW.S.svc][e].ops.length, ed);
      const td = tbl.locator('td[data-r="0"][data-c="0"]');
      await td.scrollIntoViewIfNeeded();
      const b = await td.boundingBox();
      const h0 = b.height;
      const x = b.x + b.width / 2, y = b.y + b.height - 1;
      const before = await opsN();
      const errN = errors.length;
      await page.mouse.move(x, y - 8);
      await page.mouse.move(x, y, { steps: 3 });
      const hov = await page.evaluate(() => document.documentElement.classList.contains('bw-rz-row'));
      check(`${loc}: ${k.name}: the row-resize cursor shows on the row edge`, hov);
      await page.mouse.down();
      await page.mouse.move(x, y + 30, { steps: 6 });
      await page.mouse.up();
      const o = await get();
      check(`${loc}: ${k.name}: the drag throws nothing`, errors.length === errN, errors.slice(errN).join(' | '));
      const h = o?.rowHeights?.[0];
      check(`${loc}: ${k.name}: row 0 got a stored height (mm) and the row grew on screen`, typeof h === 'number' && h > 4 && (await td.boundingBox()).height > h0 + 10, JSON.stringify(o?.rowHeights) + ' ' + h0);
      check(`${loc}: ${k.name}: one undo step: a single group on top of the history`, await page.evaluate(([e, n]) => { const ops = window.BW.M[window.BW.S.svc][e].ops; const g = ops.at(-1).id.split('.')[0]; return ops.slice(n).every((x) => x.id.split('.')[0] === g); }, [ed, before]));
      if (!pdfDone && k.card) {
        const doc = await page.evaluate((e) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][e].doc)), ed);
        const html = renderDocument(doc, { locale: ed, labels: i18n().doc[ed], theme, fontCss: '', logos: theme.logos });
        check(`${loc}: ${k.name}: the stored height prints in the HTML (height:${h}mm)`, html.includes(`height:${h}mm`));
        const pdf = path.join(tmp, `rz-${ed}.pdf`);
        await exportPdf(doc, { locale: ed, theme, pdfPath: pdf });
        check(`${loc}: ${k.name}: the PDF renders with the card text`, pageTexts(pdf).join('\n').length > 100);
        pdfDone = true;
      }
      await page.evaluate(() => window.BW.undo());
      const u = await get();
      check(`${loc}: ${k.name}: ONE undo undoes the resize${k.card ? ' and the stored card (the story is as it was)' : ''}`, k.card ? u === undefined : !(u?.rowHeights?.length), JSON.stringify(u?.rowHeights));
      check(`${loc}: ${k.name}: history is back to where it started`, (await opsN()) === before);
    }
  }
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
