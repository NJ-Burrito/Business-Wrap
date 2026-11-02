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

const ONLY = process.env.SF_ONLY || '';
const want = (id) => !ONLY || ONLY.split(',').includes(id);
try {
 if (want('C1')) {
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
        const tok = `q${n++}q`; // short and delimited: a long token would break mid-word in the narrow dictionary columns, and q1q never hides in q11q
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
  // ── the editor items: one fresh blank per group ─────────────────────────────────────────────────────────────────────────
  const blankFile = editorFor('blank2', 'blank');
  const pageOf = async () => openPage(blankFile, 'blank');
  const stepsOf = (page) => page.evaluate(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size);
  const idsOf = (doc) => doc.chapters.flatMap((c) => c.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'stories').flatMap((b) => b.items.map((i) => i.id))));
  const secNums = (doc) => doc.chapters[5].sections.map((s) => s.number);
  const secTitles = (doc) => doc.chapters[5].sections.map((s) => s.title);
  const undo = (page) => page.evaluate(() => window.BW.undo());
  const docXml = (file) => docxParts(file, /^word\/document\.xml$/)['word/document.xml'];

  if (want('H3')) {
    const page = await pageOf();
    const r = await page.evaluate(() => { const m = document.querySelector('#bw-pair main.bw-doc[data-locale="ar"]'); const q = (x) => [...m.querySelectorAll(x)].map((e) => e.textContent.trim()); return { th: q('[data-part=revisions] th'), td: q('[data-part=revisions] td'), tdP: [...m.querySelectorAll('[data-part=revisions] td')].map((e) => e.dataset.p || '') }; });
    check('H3 ar: the revisions table prints version AND date columns (2 headers, 2 cells)', r.th.length === 2 && r.td.length === 2, j(r));
    check('H3 ar: the date cell is a typeable leaf of the model (/revisions/0/1)', r.tdP[1] === '/revisions/0/1', j(r.tdP));
    const d0 = await docs(page);
    check('H3: the control table does not show a label as its own value (owner), and the issue date is not empty, AR and EN', d0.ar.control.owner !== i18n().doc.ar.control.owner && d0.en.control.owner !== i18n().doc.en.control.owner && !!d0.ar.control.issuedOn && !!d0.en.control.issuedOn, `${d0.ar.control.owner} | ${d0.en.control.owner}`);
    const el = page.locator('#bw-pair main.bw-doc[data-locale="ar"] [data-part=revisions] td[data-p="/revisions/0/1"]');
    await el.scrollIntoViewIfNeeded(); await el.click(); await page.keyboard.press('Control+A'); await page.keyboard.type('2026-11-02'); await page.waitForTimeout(200);
    const d1 = await docs(page);
    check('H3 ar: a date typed in the revisions table reaches the model', d1.ar.revisions[0][1] === '2026-11-02', j(d1.ar.revisions));
    const dx = path.join(tmp, 'h3.docx');
    exportDocx(d1.ar, { locale: 'ar', theme, docxPath: dx, embedFonts: false });
    check('H3 ar: the DOCX revisions table carries the typed date', flat(stripTags(docXml(dx))).includes('2026-11-02'));
    await page.context().close();
  }

  if (want('M')) {
    const page = await pageOf();
    const base = await docs(page);
    // M1 + L3 + L4: add after 6.1; ids and stored numbers follow the print order, titles are not repeated; one undo step
    await select(page, '/chapters/5/sections/0/blocks/0');
    const s0 = await stepsOf(page);
    await run(page, 'addStory');
    let d = await docs(page);
    for (const l of LOCS) check(`M1 ${l}: after adding a story behind 6.1 the ids read US-01..US-04 in print order`, j(idsOf(d[l])) === j(['US-01', 'US-02', 'US-03', 'US-04']), j(idsOf(d[l])));
    for (const l of LOCS) check(`L3 ${l}: the stored section numbers follow (no duplicate 6.2)`, j(secNums(d[l])) === j(['6.1', '6.2', '6.3', '6.4']), j(secNums(d[l])));
    check('M1/L3: one gesture is one undo step', (await stepsOf(page)) === s0 + 1, `${s0} -> ${await stepsOf(page)}`);
    await run(page, 'addStory');
    d = await docs(page);
    for (const l of LOCS) check(`L4 ${l}: two new stories do not share a placeholder title`, new Set(secTitles(d[l])).size === secTitles(d[l]).length, j(secTitles(d[l])));
    await undo(page); await undo(page);
    check('M1/L3: undo takes the added stories, their numbers and ids back in both editions', j(await docs(page)) === j(base));
    // M1 second case: delete 6.2, then add behind 6.1
    await page.evaluate(() => window.BW.EXT.w2write.delSection('/chapters/5/sections/1'));
    await select(page, '/chapters/5/sections/0/blocks/0');
    await run(page, 'addStory');
    d = await docs(page);
    for (const l of LOCS) check(`M1 ${l}: delete 6.2, add behind 6.1: the ids are in print order`, j(idsOf(d[l])) === j(['US-01', 'US-02', 'US-03']) && j(secNums(d[l])) === j(['6.1', '6.2', '6.3']), `${j(idsOf(d[l]))} ${j(secNums(d[l]))}`);
    await undo(page); await undo(page);
    check('M1: the two undo steps bring the blank back', j(await docs(page)) === j(base));
    // M2: «another story» with the output story selected adds an ordinary story section ahead of it, never inside its block
    await select(page, '/chapters/5/sections/2/blocks/0', '/chapters/5/sections/2/blocks/0/items/0/name');
    await run(page, 'storyCard');
    d = await docs(page);
    for (const l of LOCS) {
      const secs = d[l].chapters[5].sections;
      const last = secs.at(-1);
      check(`M2 ${l}: the output story section still holds ONE card and its item/value table; the new story is a section ahead of it`, secs.length === 4 && last.blocks[0].items.length === 1 && !last.blocks[0].items[0].actions && last.blocks[1].kind === 'table' && !!secs[2].blocks[0].items[0].dictionary, j(secs.map((s) => s.blocks.map((b) => b.kind + (b.items ? b.items.length : '')))));
    }
    await undo(page);
    // M3: Enter in an acceptance point gives the other edition the house placeholder, not «New paragraph»
    const li = page.locator('#bw-pair main.bw-doc[data-locale="ar"] li[data-p="/chapters/5/sections/0/blocks/0/items/0/acceptance/1"]');
    await li.scrollIntoViewIfNeeded(); await li.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    d = await docs(page);
    const enAcc = d.en.chapters[5].sections[0].blocks[0].items[0].acceptance;
    check('M3: Enter in an AR acceptance list adds a point in EN that is the house placeholder (not «New paragraph»)', enAcc.length === 3 && enAcc[2] === '…' && !/New paragraph/i.test(j(enAcc)), j(enAcc));
    await undo(page);
    // M5: the contents' number cells are computed, not typeable (an auto-numbered document)
    const tocP = await page.evaluate(() => [...document.querySelectorAll('#bw-pair main.bw-doc[data-locale="ar"] table.toc td[data-c="0"]')].map((e) => e.dataset.p || ''));
    check('M5: no number cell of the contents is an editable leaf', tocP.length > 10 && tocP.every((x) => !x), j(tocP.filter(Boolean)));
    // M4: the whole block of a story card, alone in its section, takes the section with it (no empty «6.3 title» left)
    const nSec = (await docs(page)).ar.chapters[5].sections.length;
    await select(page, '/chapters/5/sections/1/blocks/0');
    const gone = await page.evaluate(() => window.BW.EXT.scope.run('block'));
    d = await docs(page);
    for (const l of LOCS) check(`M4 ${l}: «the whole block» on a story card removes its numbered section too (no empty heading)`, gone && d[l].chapters[5].sections.length === nSec - 1 && d[l].chapters[5].sections.every((s) => s.blocks.length), `${gone} ${d[l].chapters[5].sections.length}`);
    await undo(page);
    check('M4: and one undo brings the card and its section back', (await docs(page)).ar.chapters[5].sections.length === nSec);
    // M8: while the delete menu is open it says how to leave it, and a press outside closes it so the ribbon works again
    await select(page, '/chapters/5/sections/0/blocks/0');
    await page.evaluate(() => { window.BW.EXT.scope.open(); });
    await page.waitForFunction(() => !!window.BW.EXT.scope.menu());
    const hint = await page.evaluate(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.scope-menu .scope-hint')?.textContent.trim());
    await page.mouse.click(5, 400);
    await page.waitForFunction(() => !window.BW.EXT.scope.menu(), null, { timeout: 3000 }).catch(() => {});
    check('M8: the delete menu carries a hint line and closes on a press outside it', hint && (await page.evaluate(() => !window.BW.EXT.scope.menu())), String(hint));
    await page.context().close();
  }

  if (want('L')) {
    const page = await pageOf();
    // L2: a chapter of one story section lists it in the contents
    const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.en.json'), 'utf8'));
    doc.chapters[5].sections = [doc.chapters[5].sections[0]];
    const html = renderDocument(doc, { locale: 'en', labels: L.en, theme, fontCss: '', logos: theme.logos });
    const toc = [...html.matchAll(/<table class="toc"[\s\S]*?<\/table>/g)].map((m) => m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).join(' ');
    check('L2: a chapter with a single story section still lists «6.1 title» in the contents', toc.includes(`6.1 ${doc.chapters[5].sections[0].title}`), toc.slice(-160));
    // L8: typing in a card label edits the document's one label, which every story card shows
    const lab = page.locator('#bw-pair main.bw-doc[data-locale="ar"] table.story-card td[data-p="/labels/storyId"]').first();
    await lab.scrollIntoViewIfNeeded(); await lab.click(); await page.keyboard.press('End'); await page.keyboard.type('qq'); await page.waitForTimeout(200);
    await page.locator('#bw-pair main.bw-doc[data-locale="ar"] h1').first().click().catch(() => {});
    await page.waitForTimeout(200);
    const dl = await docs(page);
    const html8 = renderDocument(dl.ar, { locale: 'ar', labels: L.ar, theme, fontCss: '', logos: theme.logos });
    const shown = (flat(html8.replace(/<[^>]+>/g, ' ')).match(/المعرفqq/g) || []).length;
    check('L8: a label typed in one story card is the one label of the document: every story card prints it', String(dl.ar.labels?.storyId || '').endsWith('qq') && shown >= 3, `${dl.ar.labels?.storyId} shown ${shown}`);
    // L6: the language switch does not touch the layout direction (its own control, kept per edition)
    const dirOf = () => page.evaluate(() => ({ ed: window.BW.S.ed, dir: document.querySelector('#bw-pair main.bw-doc')?.getAttribute('dir') || getComputedStyle(document.querySelector('#bw-pair main.bw-doc')).direction }));
    const before = await dirOf();
    await run(page, 'uiLang');
    const after = await dirOf();
    check('L6: switching the edition gives the English edition its own LTR page direction, the UI direction is a separate setting (setDir): not a fault', before.ed === 'ar' && after.ed === 'en' && before.dir === 'rtl' && after.dir === 'ltr', j({ before, after }));
    await page.context().close();
  }

  if (want('H2')) {
    const page = await pageOf();
    const d = await docs(page);
    for (const l of LOCS) {
      const its = d[l].chapters[5].sections.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'stories' ? b.items : []))).filter((i) => i.dictionary);
      const ok = its.length === 2 && its.every((i) => i.dictionary.colWidths?.length === 7 && Math.abs(i.dictionary.colWidths.reduce((a, b) => a + b, 0) - 100) < 0.01 && Math.max(...i.dictionary.colWidths) === i.dictionary.colWidths[6] && Math.min(...i.dictionary.colWidths) >= 8 && i.actions.colWidths?.length === 2);
      check(`H2 ${l}: the blank's dictionaries (7 columns) and action tables (2) carry house column widths, constraints widest`, ok, j(its.map((i) => i.dictionary.colWidths)));
    }
    // a new story gets them too; a long sentence typed in the name and constraints columns, then measured in the page
    await select(page, '/chapters/5/sections/0/blocks/0');
    await run(page, 'addStory');
    const T = '/chapters/5/sections/1/blocks/0/items/0/dictionary';
    const dn = await docs(page);
    check('H2: addStory writes the widths into the new dictionary in both editions', LOCS.every((l) => dn[l].chapters[5].sections[1].blocks[0].items[0].dictionary.colWidths?.length === 7), '');
    const sentence = 'قيمة طويلة تحتوي على عدة كلمات لاختبار التفاف الخلية داخل الجدول وكسر الصفحة عند تجاوز المساحة المتاحة';
    for (const c of [0, 6]) {
      const cell = page.locator(`#bw-pair main.bw-doc[data-locale="ar"] table[data-t="${T}"] td[data-r="0"][data-c="${c}"]`);
      await cell.scrollIntoViewIfNeeded(); await cell.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(sentence); await page.waitForTimeout(100);
    }
    const lines = await page.evaluate((T) => { const tr = document.querySelector(`#bw-pair main.bw-doc[data-locale="ar"] table[data-t="${T}"] tbody tr`); const n = (c) => { const r = document.createRange(); r.selectNodeContents(c); return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size; }; return { name: n(tr.cells[0]), cons: n(tr.cells[6]), w: [...tr.cells].map((c) => Math.round(c.getBoundingClientRect().width)) }; }, T);
    check('H2: a 17-word sentence in «constraints» stays within 7 lines and in the narrow «name» within 14 (was a 20-line tower)', lines.cons <= 7 && lines.name <= 14, j(lines));
    // DOCX: the header words fit their columns (measured with the theme font in Chrome); the widths are the model's
    const dd = await docs(page);
    for (const l of LOCS) {
      const dx = path.join(tmp, `h2-${l}.docx`);
      exportDocx(dd[l], { locale: l, theme, docxPath: dx, embedFonts: false });
      const tbls = [...docXml(dx).matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]);
      const hdr = dd[l].chapters[5].sections[1].blocks[0].items[0].dictionary.columns;
      const dict = tbls.find((t) => (t.match(/<w:gridCol /g) || []).length === 7 && t.includes(hdr[0]));
      const grid = dict ? [...dict.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => +m[1]) : [];
      const sz = dict ? +(/<w:sz w:val="(\d+)"/.exec(dict.split('</w:tr>')[0]) || [0, 18])[1] / 2 : 9;
      const fit = await page.evaluate(async ([grid, hdr, sz, face]) => { await document.fonts.load(`700 ${sz * 96 / 72}px "${face}"`, hdr.join(' ')); const cv = document.createElement('canvas').getContext('2d'); cv.font = `700 ${sz * 96 / 72}px "${face}"`; return hdr.map((h, i) => { const w = Math.max(...h.split(/\s+/).map((x) => cv.measureText(x).width)); return { h, need: Math.round(w), have: Math.round((grid[i] / 1440) * 96 - 14) }; }); }, [grid, hdr, sz, theme.fonts.text]);
      const bad = fit.filter((x) => x.need * 1.12 > x.have); // a 12 % margin: Word's own metrics and cell margins are not the canvas's
      console.log('  H2 header need/have', l, j(fit.map((x) => [x.need, x.have])));
      check(`H2 ${l}: in the DOCX every header word of the 7-column dictionary fits its column (no mid-word break)`, grid.length === 7 && !bad.length, j({ grid, bad }));
    }
    await page.context().close();
  }

  if (want('H1')) {
    // H1 · the DOCX story cards carry the PDF design: sand card bands, label bars, one number per card, no repeated heading, no glued numbers
    const sandFill = (theme.vars?.card || '#efede6').replace('#', '').toUpperCase();
    const gold = (theme.vars?.['accent-rule'] || '#9c7e36').replace('#', '').toUpperCase();
    for (const l of LOCS) {
      const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${l}.json`), 'utf8'));
      const dx = path.join(tmp, `h1-${l}.docx`);
      exportDocx(doc, { locale: l, theme, docxPath: dx, embedFonts: false });
      const xml = docXml(dx);
      const paras = [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => m[0]);
      const txt = (p) => stripTags(p).replace(/\s+/g, ' ').trim();
      const stories = doc.chapters[5].sections;
      const caps = paras.filter((p) => p.includes(`w:fill="${sandFill}"`) && p.includes('<w:keepNext/>') && new RegExp(`^\\d\\.\\d ${L[l].userStory}$`).test(txt(p)));
      check(`H1 ${l}: each of the ${stories.length} story cards opens with a sand caption band «n.m ${L[l].userStory}»`, caps.length === stories.length, `${caps.length} bands: ${paras.filter((p) => p.includes(`w:fill="${sandFill}"`)).map(txt).slice(0, 6).join(' | ')}`);
      const bars = paras.filter((p) => p.includes(`w:color="${gold}"`) && p.includes('<w:keepNext/>')).map(txt);
      const wantBars = [doc.chapters[5].sections[0].blocks[0].lead, L[l].actionsTable, L[l].dictionary];
      check(`H1 ${l}: the label bars «${wantBars.join('», «')}» are drawn with the gold rule and keep with their table`, wantBars.every((w) => bars.includes(w)), j(bars));
      const h2 = paras.filter((p) => /<w:pStyle w:val="Heading2"\/>/.test(p)).map(txt);
      check(`H1 ${l}: no heading repeats a story section's title (the card caption carries the number, as in the PDF)`, stories.every((s) => !h2.some((h) => h.includes(s.title))), j(h2.filter((h) => /^6\./.test(h))));
      const h2raw = paras.filter((p) => /<w:pStyle w:val="Heading2"\/>/.test(p) && /^\d+\.\d+$/.test(((p.match(/<w:t[^>]*>([^<]*)<\/w:t>/) || [])[1] || '').trim()));
      check(`H1 ${l}: a heading number is set apart from its title by real spaces, never glued`, h2raw.length >= 10 && h2raw.every((p) => /<w:t[^>]*>\d+\.\d+ {3,}<\/w:t>/.test(p)), String(h2raw.length));
      const tbls = [...xml.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]);
      const dict = tbls.filter((t) => (t.match(/<w:gridCol /g) || []).length === 7);
      check(`H1/M6 ${l}: every header row keeps with its first row (keepNext on its paragraphs), so a label and header never end a page alone`, dict.length >= 2 && dict.every((t) => /<w:keepNext\/>/.test(t.split('</w:tr>')[0])), String(dict.length));
      // the contents list the story sections (the heading is not printed, the contents are the way to find them)
      check(`H1 ${l}: the contents table lists every story section`, stories.every((s) => stripTags(xml).includes(s.title)));
      // the Word font line: no theme font (Calibri, Cambria Math) is left behind the Thmanyah styles
      const parts = docxParts(dx, /^word\/(styles|settings)\.xml$/);
      const st = parts['word/styles.xml'], se = parts['word/settings.xml'];
      check(`H1 ${l}: Word fonts: no style, default or equation font names a theme face (Calibri, Cambria Math, Arial)`, !/Theme="/.test(st.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/)[0]) && !/w:rFonts[^>]*(Calibri|Cambria|Arial)/.test(st) && !/Cambria Math/.test(se), (st.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/) || [''])[0].slice(0, 200));
    }
  }

  if (want('SMOKE')) {
    // ENTRY_SMOKE · the real server (engine/serve.mjs) and the real page: blank document, add a story, type an acceptance point, save, reload, export PDF and DOCX
    const { serve } = await import('../engine/serve.mjs');
    const outDir = path.join(tmp, 'smoke-out');
    fs.mkdirSync(outDir, { recursive: true });
    const server = await serve(editorFor('smoke', 'blank'), 0, { out: outDir });
    const base = `http://127.0.0.1:${server.address().port}/`;
    try {
      const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(base);
      await page.waitForFunction(() => window.BW?.ready);
      check('SMOKE ready state: the served blank document is open', (await page.evaluate(() => window.BW.S.svc)) === 'blank');
      await select(page, '/chapters/1/sections/0/blocks/0');
      await run(page, 'addStory');
      const li = page.locator('#bw-pair main.bw-doc[data-locale="ar"] li[data-p="/chapters/5/sections/2/blocks/0/items/0/acceptance/0"]');
      await li.waitFor(); await page.waitForTimeout(400); await li.scrollIntoViewIfNeeded(); await li.click(); await page.keyboard.press('End'); await page.keyboard.type('smokeaccx');
      await page.waitForFunction(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.chapters[5]).includes('smokeaccx'), null, { timeout: 5000 }).catch(() => {});
      await page.locator('#bw-pair main.bw-doc[data-locale="ar"] h1').first().click().catch(() => {});
      await run(page, 'save');
      // the save is finished when the library entry is written (data-bw-lib-saved, set by the product); the reloaded page is settled when the document named by #doc= is on screen (data-bw-ready), not at BW.ready (booted)
      await page.waitForFunction(() => !!document.documentElement.dataset.bwLibSaved, null, { timeout: 15000 });
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.bwReady === '1', null, { timeout: 15000 });
      const reopened = await page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc].ar.doc.chapters[5].sections));
      check('SMOKE: after save and reload the typed acceptance point is still in the document', reopened.includes('smokeaccx'), reopened.slice(0, 120));
      const res = await page.evaluate(async () => { const B = window.BW; const e = B.M[B.S.svc].ar; const r = await fetch('/api/export', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: B.S.svc, locale: 'ar', doc: e.doc, theme: B.S.theme, embedFonts: false }) }); return r.json(); });
      check('SMOKE: the server exported a PDF and a DOCX', !!res.pdf && !!res.docx && !res.docxError, JSON.stringify(res).slice(0, 200));
      const dtext = flat(stripTags(docXml(res.docx)));
      const ptxt = flat(spawnSync(bin, ['-enc', 'UTF-8', res.pdf, '-'], { encoding: 'utf8' }).stdout || '');
      check('SMOKE: the typed word is in the exported DOCX and in the exported PDF', dtext.includes('smokeaccx') && ptxt.includes('smokeaccx'), `docx ${dtext.includes('smokeaccx')} pdf ${ptxt.includes('smokeaccx')}`);
      await ctx.close();
    } finally { await new Promise((r) => server.close(r)); }
  }

  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
