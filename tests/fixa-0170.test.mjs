// lane fixa · (1) page views repeat a table's header above the CONTINUATION of a row that Chrome cuts across two pages, as the PDF does
// (viewsRepeat drew it only above a row that OPENS a column, so the editor's page was one header height roomier than the PDF's from that row on);
// (2) Backspace / Delete on a clicked blank line removes that empty line, as in Word (both editions, one undo step; an other edition that holds words there keeps its line).
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/fixa-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fixa0170-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  fixa-0170: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch(launchOptions());
const open = async (file, viewport = { width: 1600, height: 1000 }) => {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.log('pageerror', e.message); failed += 1; });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  return { ctx, page };
};
const fixture = (name, edit) => {
  const dir = path.join(tmp, name);
  fs.cpSync(path.join(REPO, 'samples', 'event-permit'), dir, { recursive: true });
  for (const ed of ['ar', 'en']) {
    const fp = path.join(dir, `document.${ed}.json`);
    const d = JSON.parse(fs.readFileSync(fp, 'utf8'));
    edit(d, ed);
    fs.writeFileSync(fp, JSON.stringify(d, null, 1));
  }
  return dir;
};
try {
  // ── 1. the repeated header above a continuation fragment ───────────────────
  {
    const sentence = 'قيد الحقل يصف ما يعرضه النظام وما يقبله وما يمنعه عند إدخال القيمة في هذا الحقل من النموذج';
    let cutRows = 0, withHead = 0, wrongTop = 0, overlap = 0, seen = 0;
    const per = [];
    for (const n of [16, 19, 22, 25, 28, 31, 34, 37]) {
      const dir = fixture(`dict${n}`, (d, ed) => {
        if (ed !== 'ar') return;
        d.chapters[0].sections = [{ title: 'قاموس الحقول', blocks: [{ kind: 'subhead', text: 'قاموس البيانات والمصطلحات' }, { kind: 'table', columns: ['اسم الحقل', 'النوع', 'قيود الحقل'], rows: Array.from({ length: n }, (_, i) => [`F-${String(i + 1).padStart(2, '0')}`, 'نص', `${sentence} ${sentence} END${String(i + 1).padStart(2, '0')}`]) }] }];
      });
      const file = path.join(tmp, `e${n}.html`);
      buildEditor({ inputs: [dir], out: file, set: 'fixa-0170', watermarkDir: null, ui: 'ar' });
      const { ctx, page } = await open(file);
      await page.evaluate(() => { const B = window.BW; if (!B.S.calm) B.runAction('calm'); B.S.ed = 'ar'; B.render(); B.S.zoom = 1; });
      await page.waitForFunction(() => document.documentElement.dataset.bwCalm === '1');
      await page.evaluate(() => window.BW.runAction('view.single'));
      await page.waitForFunction(() => document.querySelector('#bw-pair .bw-view') && window.BW.S.pageN > 1);
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const main = document.querySelector('#bw-pair .bw-view > *');
        const z = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')) || 1;
        const pitch = (parseFloat(main.parentElement.style.getPropertyValue('--pw')) + 12) * (96 / 25.4) * z;
        const rtl = main.dir === 'rtl';
        const o = main.getBoundingClientRect();
        const col = (q) => Math.max(0, Math.floor(((rtl ? o.right - (q.left + q.right) / 2 : (q.left + q.right) / 2 - o.left) + 1) / pitch));
        const out = { rows: 0, cut: 0, head: 0, wrongTop: 0, overlap: 0 };
        const heads = [...main.querySelectorAll('.bw-rpt')].map((e) => e.getBoundingClientRect());
        for (const tr of main.querySelectorAll('table tbody tr')) {
          if (tr.closest('.bw-rpts')) continue;
          out.rows += 1;
          const rs = [...tr.getClientRects()].filter((q) => q.height >= 1);
          for (let i = 1; i < rs.length; i += 1) {
            if (col(rs[i]) <= col(rs[i - 1])) continue;
            out.cut += 1;
            // a repeated header starts at the top of the continuation fragment and the fragment's text starts below its foot
            const h = heads.find((q) => Math.abs(q.top - rs[i].top) < 1.5 && Math.abs(q.left - rs[i].left) < 2);
            if (h) out.head += 1; else { out.wrongTop += 1; continue; }
            const r2 = document.createRange();
            const cell = [...tr.cells].reduce((a, c) => (c.textContent.length > a.textContent.length ? c : a));
            r2.selectNodeContents(cell);
            const lines = [...r2.getClientRects()].filter((q) => q.height > 2 && col(q) === col(rs[i]));
            const top = Math.min(...lines.map((q) => q.top));
            if (lines.length && top < h.bottom - 1) out.overlap += 1;
          }
        }
        out.pages = window.BW.S.pageN;
        return out;
      });
      cutRows += r.cut; withHead += r.head; wrongTop += r.wrongTop; overlap += r.overlap; seen += r.rows;
      per.push(`${n}:${r.pages}p/${r.cut}`);
      await ctx.close();
    }
    check('positive sample: the sweep has pages and table rows, and Chrome cut at least one row across two pages', seen > 100 && cutRows >= 1, `${seen} rows, ${cutRows} cut`);
    check('every continuation fragment of a cut row has a repeated header drawn at the top of its column', withHead === cutRows && wrongTop === 0, `${withHead}/${cutRows}, ${wrongTop} without`);
    check('the continuation text starts below the repeated header (the header covers no line)', overlap === 0, `${overlap} rows overlap`);
    console.log(`INFO  fixa-0170: pages/cut rows by dictionary length: ${per.join(' ')}`);
  }

  // ── 2. Backspace / Delete on a blank line ──────────────────────────────────
  {
    const SEC = '/chapters/0/sections/0/blocks';
    const dir = fixture('blank', (d, ed) => {
      const p = (n) => ({ kind: 'prose', paragraphs: [`${ed === 'ar' ? 'فقرة' : 'Paragraph'} ${n}`] });
      const first = d.chapters[0].sections[0].blocks[0];
      d.chapters[0].sections[0].blocks = [first, { kind: 'prose', paragraphs: [''] }, p(3), { kind: 'prose', paragraphs: [''] }, p(5)];
    });
    const file = path.join(tmp, 'blank.html');
    buildEditor({ inputs: [dir], out: file, set: 'fixa-0170b', watermarkDir: null, ui: 'en' });
    const { ctx, page } = await open(file);
    const useEd = (ed) => page.evaluate((e) => { const B = window.BW; if (B.S.ed !== e && B.M[B.S.svc][e]) { B.S.ed = e; B.render(); } }, ed);
    await useEd('en');
    const blocks = (ed = 'en') => page.evaluate((e) => JSON.parse(JSON.stringify(window.BW.M[window.BW.S.svc][e].doc.chapters[0].sections[0].blocks)), ed);
    const isBlank = (b) => b?.kind === 'prose' && b.paragraphs.every((p) => !String(p).trim());
    const clickBlank = async (ed, i) => {
      await page.evaluate(([e, k]) => document.querySelector(`#bw-pair main.bw-doc[data-locale="${e}"] [data-b="${'/chapters/0/sections/0/blocks'}/${k}"]`).scrollIntoView({ block: 'center' }), [ed, i]);
      await page.waitForTimeout(250);
      const q = await page.evaluate(([e, k]) => { const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="${e}"] [data-p="${'/chapters/0/sections/0/blocks'}/${k}/paragraphs/0"]`); const b = el.getBoundingClientRect(); return { x: b.left + Math.min(8, b.width / 2), y: (b.top + b.bottom) / 2 }; }, [ed, i]);
      await page.mouse.click(q.x, q.y);
      q.ce = await page.evaluate(() => !!document.activeElement?.isContentEditable && /paragraphs\/0$/.test(document.activeElement.dataset.p || ''));
      return q;
    };
    const before = await blocks(), beforeAr = await blocks('ar');
    check('positive sample: the fixture has two blank lines in both editions', isBlank(before[1]) && isBlank(before[3]) && isBlank(beforeAr[1]) && isBlank(beforeAr[3]) && before.length === 5);
    const q = await clickBlank('en', 1);
    check('a click puts the caret in the blank line (an editable leaf)', q.ce === true, JSON.stringify(q));
    const nOps = await page.evaluate(() => window.BW.M[window.BW.S.svc].en.ops.length);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(250);
    const b1 = await blocks(), a1 = await blocks('ar');
    check('Backspace on a blank line removes that line (English)', b1.length === 4 && JSON.stringify(b1[1]) === JSON.stringify(before[2]), JSON.stringify(b1.map((x) => x.paragraphs?.[0])));
    check('... and the Arabic edition loses its blank line too', a1.length === 4 && JSON.stringify(a1[1]) === JSON.stringify(beforeAr[2]));
    check('... in one history step', await page.evaluate((n) => window.BW.M[window.BW.S.svc].en.ops.length === n + 1, nOps));
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(200);
    const u1 = await blocks(), ua = await blocks('ar');
    check('one undo brings the line back in both editions', JSON.stringify(u1) === JSON.stringify(before) && JSON.stringify(ua) === JSON.stringify(beforeAr));
    // Delete, in the Arabic edition
    await useEd('ar');
    await clickBlank('ar', 3);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(250);
    const b2 = await blocks(), a2 = await blocks('ar');
    check('Delete on a blank line removes it (Arabic), and the English edition follows', a2.length === 4 && b2.length === 4 && JSON.stringify(a2[3]) === JSON.stringify(beforeAr[4]));
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(200);
    check('one undo takes the Delete back', JSON.stringify(await blocks('ar')) === JSON.stringify(beforeAr) && JSON.stringify(await blocks()) === JSON.stringify(before));
    // a blank line whose other edition holds words is kept (the delete would take them)
    await page.evaluate((s) => { const B = window.BW; const m = B.M[B.S.svc].en; m.doc.chapters[0].sections[0].blocks[1] = { kind: 'prose', paragraphs: ['words kept'] }; }, SEC);
    await useEd('ar');
    await page.evaluate(() => window.BW.render());
    await clickBlank('ar', 1);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(250);
    const a3 = await blocks('ar');
    check('a blank line facing words in the other edition stays', a3.length === 5);
    // a line with words: Backspace edits the text, the block stays
    await useEd('en');
    await page.evaluate(() => { window.BW.render(); });
    await page.evaluate(() => { const el = document.querySelector('#bw-pair main.bw-doc[data-locale="en"] [data-p="/chapters/0/sections/0/blocks/2/paragraphs/0"]'); el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(250);
    const b4 = await blocks();
    check('Backspace in a line with words still edits the text and keeps the block', b4.length === 5 && /^Paragraph\s*$/.test(b4[2].paragraphs[0]) && b4[2].paragraphs.length === 1, JSON.stringify(b4[2]));
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
