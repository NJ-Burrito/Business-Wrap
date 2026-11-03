// 0.17.0 fixb: the cells' font dialog (editor/ext/24-cells.js fmtFont, a cell selection) carries the same live preview as the text one (21-format w2preview):
// the first selected cell's text drawn in the face being chosen, each option row in its own face.
//   node tests/fixb-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fixb0170-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  fixb-0170: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const file = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'fixb-0170', watermarkDir: null, ui: 'en' });
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => { if (!window.BW.S.calm) window.BW.runAction('calm'); });
  const P = await page.evaluate(() => {
    const B = window.BW;
    const blocks = B.M[B.S.svc][B.S.ed].doc.chapters[1].sections[0].blocks;
    const at = `/chapters/1/sections/0/blocks/${blocks.length}`;
    B.commit([{ op: 'insert', path: at, value: { kind: 'table', columns: ['A', 'B'], rows: [['Quarterly plan', '2'], ['3', '4']] } }], { mirror: true });
    return at;
  });
  const ed = await page.evaluate(() => window.BW.S.ed);
  const sel = `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-b="${P}"] td[data-r="0"][data-c="0"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  await page.evaluate((q) => { const x = document.querySelector(q).closest('table'); window.BW.EXT.cells.select([[0, 0]], { ed: x.closest('main.bw-doc').dataset.locale, rows: x.dataset.rows, b: x.dataset.b, el: x }); }, sel);
  await page.evaluate(() => { window.__ask = window.BW.runAction('fmtFont'); });
  await page.waitForTimeout(300);
  const read = () => page.evaluate(() => {
    const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog');
    const pv = d && !d.hidden ? d.querySelector('.dlg-prev-t') : null;
    if (!pv) return null;
    const f = d.querySelector('select');
    return { text: pv.textContent.trim(), family: getComputedStyle(pv).fontFamily, v: f?.value, optFonts: [...d.querySelectorAll('option')].map((o) => o.style.fontFamily) };
  });
  const a = await read();
  await page.evaluate(() => { const f = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog select'); f.value = [...f.options].pop().value; f.dispatchEvent(new Event('change', { bubbles: true })); });
  const b = await read();
  check('cells font dialog: a live preview exists and shows the selected cell\'s text', !!a && a.text === 'Quarterly plan', JSON.stringify(a));
  check('cells font dialog: every option row is drawn in its own face', !!a && a.optFonts.length >= 2 && a.optFonts.every(Boolean), JSON.stringify(a?.optFonts));
  check('cells font dialog: choosing another face changes the preview face to that face', !!b && !!a && b.family !== a.family && b.family.includes(b.v), JSON.stringify({ a: a?.family, b: b?.family, v: b?.v }));
  await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog [data-k="no"]')?.click());
  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('fixb run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: fixb-0170`);
process.exit(failed ? 1 : 0);
