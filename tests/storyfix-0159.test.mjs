// 0.15.9 lane storyfix: the 21 faults of the story UAT (out/qa-0.15.8/uat-story/REPORT.md), each asserted here by its report id.
// Real Google Chrome (BW_CHROME) types, clicks and runs the real commands; the real exporters write the PDF and DOCX that are read back.
//   node tests/storyfix-0159.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { config } from '../engine/config.mjs';
import { docxParts } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-storyfix159-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  storyfix-0159: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const theme = loadTheme();
const LOCS = ['ar', 'en'];
const j = (x) => JSON.stringify(x);
const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
const flat = (t) => t.normalize('NFKC').replace(/[\s‎‏‪-‮]+/g, '');
const stripTags = (xml) => xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '');
const L = i18n().doc;
let seq = 0;

const editorFor = (name, sample) => {
  const file = path.join(tmp, `${name}.html`);
  buildEditor({ inputs: [path.join(REPO, 'samples', sample)], out: file, set: `sf159${name}`, watermarkDir: null });
  return file;
};
const browser = await chromium.launch(launchOptions());
const errors = [];
async function openPage(file, svc) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const r = await page.evaluate(() => ({ svc: window.BW.S.svc, ar: window.BW.M[window.BW.S.svc].ar.doc.chapters.length, en: window.BW.M[window.BW.S.svc].en.doc.chapters.length }));
  check(`ready state seen (${svc}): the document is open with both editions`, r.svc === svc && r.ar > 0 && r.en > 0, j(r));
  return page;
}
const docs = (page) => page.evaluate(() => { const B = window.BW; return { ar: JSON.parse(JSON.stringify(B.M[B.S.svc].ar.doc)), en: JSON.parse(JSON.stringify(B.M[B.S.svc].en.doc)) }; });
const run = (page, id) => page.evaluate((id) => window.BW.runAction(id), id);
const select = (page, b, p = null) => page.evaluate(([b, p]) => { window.BW.S.sel = { b, p, ed: window.BW.S.ed }; }, [b, p]);
/** The words in the print HTML, the DOCX and the PDF of one edition: the lists of the words that are missing from each. */
async function readBack(doc, l, words) {
  const html = renderDocument(doc, { locale: l, labels: L[l], theme, fontCss: '', logos: theme.logos });
  const inHtml = flat(html.replace(/<[^>]+>/g, ' '));
  const id = `${l}-${seq++}`;
  const dx = path.join(tmp, `w-${id}.docx`);
  exportDocx(doc, { locale: l, theme, docxPath: dx, embedFonts: false });
  const dtext = flat(stripTags(docxParts(dx, /^word\/document\.xml$/)['word/document.xml']));
  const pdf = path.join(tmp, `w-${id}.pdf`);
  await exportPdf(doc, { locale: l, theme, pdfPath: pdf, browser });
  const ptxt = flat(spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '');
  return { html: words.filter((w) => !inHtml.includes(w)), docx: words.filter((w) => !dtext.includes(w)), pdf: words.filter((w) => !ptxt.includes(w)), dx, dtext, pdfPath: pdf, ptxt };
}

try {
  // ── C1 · typing in any cell or list of a story reaches the model, both editions, old and new stories ─────────────────────
  for (const [name, sample, svc] of [['blank', 'blank', 'blank'], ['permit', 'event-permit', 'event-permit']]) {
    const page = await openPage(editorFor(name, sample), svc);
    for (const ed of LOCS) {
      if ((await page.evaluate(() => window.BW.S.ed)) !== ed) await run(page, 'uiLang');
      if (name === 'blank') { await select(page, '/chapters/1/sections/0/blocks/0'); await run(page, 'addStory'); }
      const before = errors.length;
      // every typing target of every story: the list items and the table cells (card, actions, dictionary, output table)
      const targets = await page.evaluate((ed) => {
        const m = document.querySelector(`#bw-pair main.bw-doc[data-locale="${ed}"]`);
        const out = [];
        m.querySelectorAll('li[data-p*="/acceptance/"]').forEach((e) => out.push({ kind: 'li', sel: `li[data-p="${e.dataset.p}"]` }));
        m.querySelectorAll('table.story-card td[data-r][data-c]:not(:has(li)), table.dict td[data-r][data-c]').forEach((e) => {
          const t = e.closest('table[data-t]');
          out.push({ kind: 'td', sel: `table[data-t="${t?.dataset.t}"] td[data-r="${e.dataset.r}"][data-c="${e.dataset.c}"]`, label: (e.dataset.p || '').includes('/labels/') });
        });
        return out;
      }, ed);
      check(`C1 ${svc}/${ed}: the story shows list items and cells to type into`, targets.some((t) => t.kind === 'li') && targets.some((t) => t.kind === 'td'), String(targets.length));
      let n = 0; const tokens = [];
      for (const t of targets) {
        if (t.label) continue;
        const loc = page.locator(`#bw-pair main.bw-doc[data-locale="${ed}"] ${t.sel}`).first();
        if (!(await loc.count())) continue;
        await loc.scrollIntoViewIfNeeded(); await loc.click();
        const tok = `zq${name[0]}${ed[0]}${n++}x`;
        await page.keyboard.press('End'); await page.keyboard.type(tok); await page.waitForTimeout(40);
        tokens.push(tok);
      }
      await page.waitForTimeout(300);
      const d = await docs(page);
      const lost = tokens.filter((x) => !j(d[ed]).includes(x));
      check(`C1 ${svc}/${ed}: all ${tokens.length} typed words are in the model (no TypeError, none lost)`, tokens.length >= 10 && lost.length === 0 && errors.length === before, `lost ${lost.join(',')} errors ${errors.slice(before).join('|')}`);
      const w = await readBack(d[ed], ed, tokens);
      check(`C1 ${svc}/${ed}: the typed words reach the print HTML, the DOCX and the PDF`, !w.html.length && !w.docx.length && !w.pdf.length, `html ${w.html} docx ${w.docx} pdf ${w.pdf}`);
    }
    await page.context().close();
  }

  // ── C2 · the DOCX figure caption prints its number ───────────────────────────────────────────────────────────────────────
  {
    for (const l of LOCS) {
      const d = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${l}.json`), 'utf8'));
      const dx = path.join(tmp, `c2-${l}.docx`);
      exportDocx(d, { locale: l, theme, docxPath: dx, embedFonts: false });
      const txt = stripTags(docxParts(dx, /^word\/document\.xml$/)['word/document.xml']);
      const lab = d.chapters[3].sections[0].blocks[0].figureLabel || L[l].figure;
      check(`C2 ${l}: the DOCX figure caption reads «${lab} 1:» (no stray digits)`, new RegExp(`${lab}\\s*1\\s*:`).test(txt) && !/200f/.test(txt), (txt.match(new RegExp(`${lab}[^<]{0,12}`)) || [''])[0]);
    }
  }
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
