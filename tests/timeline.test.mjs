// A9 «تغييرات» timeline (design.md §3 A9): 5 edits → counter 5; a PDF/DOCX export keeps 5; ◀ ◀ → ops 3 and
// counter 3; a click on row 5 → ops 5; Save HTML → 0 while the timeline still lists 5; an idle checkpoint appears
// after a faked 2-minute clock; 25 ops add a checkpoint on their own; marks survive a reload and travel inside the
// Save-HTML file. Headless Chrome, file://.
//
//   node tests/timeline.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-tl-'));
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  timeline: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };

const file = path.join(tmp, 'tl.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'tl-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install();
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.timeline);
  const counter = () => page.evaluate(() => Number(document.getElementById('bw-ui-host').shadowRoot.querySelector('.count .n')?.textContent));
  const ops = () => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  const sh = (sel) => page.locator(`#bw-ui-host >> css=.drawer ${sel}`);

  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.BW.setText(`/chapters/${i}/title`, `عنوان ${i + 1}`); });
  check('5 edits → counter 5', (await counter()) === 5 && (await ops()) === 5, String(await counter()));
  await page.evaluate(() => window.BW.emit('export', { pdf: true, docx: true }));
  const m1 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.marks.map((m) => m.kind));
  check('PDF/DOCX export adds an export mark and keeps the counter at 5', (await counter()) === 5 && m1.includes('export'), JSON.stringify(m1));

  await page.locator('#bw-ui-host >> css=.count').click(); // the toolbar's change counter opens the timeline
  check('the change counter opens «تغييرات»: one row per action group', (await page.evaluate(() => window.BW.S.drawer)) === 'timeline' && (await sh('.tl-row').count()) === 5);
  await sh('[data-tl="back"]').click();
  await sh('[data-tl="back"]').click();
  check('◀ ◀ → ops 3 and counter 3 (future kept)', (await ops()) === 3 && (await counter()) === 3 && (await sh('.tl-row.future').count()) === 2, `${await ops()} / ${await counter()}`);
  await sh('[data-tl="go"][data-i="5"]').click();
  check('a click on row 5 travels forward → ops 5', (await ops()) === 5 && (await sh('.tl-row.future').count()) === 0, String(await ops()));
  await sh('[data-tl="back"]').click();
  await sh('[data-tl="fwd"]').click();
  check('▶ steps forward one group', (await ops()) === 5);

  const dl = page.waitForEvent('download');
  await page.evaluate(() => window.BW.saveHtml(false));
  const saved = path.join(tmp, 'saved.editor.html');
  await (await dl).saveAs(saved);
  await page.evaluate(() => window.BW.openDrawer('timeline'));
  check('Save HTML → counter 0, the timeline still lists 5', (await counter()) === 0 && (await sh('.tl-row').count()) === 5 && (await sh('.tl-mark[data-kind="saveHtml"]').count()) === 1, String(await counter()));
  const data = JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(fs.readFileSync(saved, 'utf8'))[1].replace(/\\u003c/g, '<'));
  const ed = data.services[0].editions.ar;
  check('the Save-HTML file carries the marks and the epoch', ed.marks.some((m) => m.kind === 'saveHtml') && ed.epochIds.length === 5, JSON.stringify(ed.marks));
  await page.evaluate(() => window.BW.setText('/chapters/0/title', 'بعد الحفظ'));
  check('an edit after Save HTML counts 1', (await counter()) === 1);

  await page.clock.fastForward(121000);
  const cp = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.marks.filter((m) => m.kind === 'checkpoint').length);
  check('an idle checkpoint appears after 2 minutes (faked clock)', cp === 1, String(cp));
  await page.evaluate(() => { for (let i = 0; i < 25; i++) window.BW.setText(`/chapters/${i % 5}/sections/0/title`, `قسم ${i}`); });
  const cp2 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.marks.filter((m) => m.kind === 'checkpoint').length);
  check('25 ops since the last mark add a checkpoint', cp2 >= 2, String(cp2));
  await page.evaluate(() => window.BW.openDrawer('timeline'));
  await sh('[data-tl="cp"]').click();
  const n0 = await ops();
  const here = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.marks.filter((m) => m.kind === 'checkpoint')[0].n);
  await sh(`[data-tl="here"][data-n="${here}"]`).first().click();
  check('«ارجع إلى هنا» travels to the checkpoint', (await ops()) === here && here < n0, `${await ops()} vs ${here}`);

  const before = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.marks));
  await page.evaluate(() => window.BW.flushDraft());
  await page.reload();
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.timeline);
  const afterMarks = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.marks));
  check('marks survive a reload', afterMarks === before && JSON.parse(afterMarks).length >= 5, afterMarks.slice(0, 200));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
}

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\ntimeline: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
