// 0.15.6 lane story · S1-S6: a new user story and a blank document carry the reference SRS's sections and tables, AR and EN.
// Real Edge/Chrome clicks the real commands (BW.runAction = the ribbon's own path) on the blank sample, asserts sections, column counts
// and headers in both editions, one undo step per gesture, the normal table tools on the new tables, and the PDF + DOCX text.
// Every column word is read from templates/e-service/pack.json (never typed here).   node tests/story-template-0156.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme, fontsFor, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { config } from '../engine/config.mjs';
import { docxParts } from './fixtures/doc-model/util.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-story156-'));
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  story-0156: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const pack = JSON.parse(fs.readFileSync(path.join(REPO, 'templates', 'e-service', 'pack.json'), 'utf8'));
const W = JSON.parse(fs.readFileSync(path.join(REPO, 'editor', 'ext', '27-writing.i18n.json'), 'utf8'));
const theme = loadTheme();
const LOCS = ['ar', 'en'];
const bare = (a) => a.map((x) => String(x).replace(/[ً-ْ]/g, ''));
const sampleDoc = (l) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${l}.json`), 'utf8'));
const secs = (doc, ci) => doc.chapters[ci].sections;
const tablesOf = (sec) => sec.blocks.filter((b) => b.kind === 'table');
const storiesOf = (doc) => doc.chapters.flatMap((c) => c.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'stories').flatMap((b) => b.items)));

// ── 1 · the blank sample (files): chapters, 16 subsections, columns from the pack, three stories ─────────────────────────────
const CARD = ['description', 'identifier', 'recipients', 'assumptions', 'fees', 'documents', 'adminRef', 'channels', 'outputs', 'legislation', 'roles', 'internal', 'services', 'dataSources', 'partners', 'languages'];
const packChapters = pack.chapters;
check('the pack has 6 chapters and 16 service-card subsections (the source this test reads)', packChapters.length === 6 && packChapters[1].sections.length === 16);
for (const l of LOCS) {
  const d = sampleDoc(l);
  check(`${l}: blank has the pack's 6 chapters`, d.chapters.length === 6, String(d.chapters.length));
  check(`${l}: chapter titles are the pack's`, d.chapters.every((c, i) => c.title === packChapters[i].title[l]), d.chapters.map((c) => c.title).join(' | '));
  check(`${l}: service card has 16 subsections titled as the pack`, secs(d, 1).length === 16 && secs(d, 1).every((s, i) => s.title === packChapters[1].sections[i].title[l]), String(secs(d, 1).length));
  // each pack column set appears once in the right section, with its column count and headers
  const colsOf = { recipients: 'recipients', fees: 'fees', documents: 'documents', outputs: 'outputs', legislation: 'legislation', roles: 'roles', internal: 'internal', services: 'services', dataSources: 'dataSources', partners: 'partners' };
  let ok = true; let seen = 0;
  CARD.forEach((gen, i) => {
    const s = secs(d, 1)[i];
    const want = colsOf[gen] ? bare(pack.columns[colsOf[gen]][l]) : null;
    const t = tablesOf(s)[0];
    if (want) { seen += 1; if (!t || JSON.stringify(t.columns) !== JSON.stringify(want) || !t.rows.length || t.rows.some((r) => r.length !== want.length)) { ok = false; console.log('  bad', gen, JSON.stringify(t?.columns)); } }
    else if (['identifier', 'adminRef', 'assumptions'].includes(gen)) { seen += 1; if (!t || t.columns.length !== 0 || !t.rows.length || t.rows.some((r) => r.length !== 2)) { ok = false; console.log('  bad', gen); } }
    else if (!s.blocks.some((b) => b.kind === 'prose')) { ok = false; console.log('  bad', gen); }
  });
  check(`${l}: 2.1-2.16 carry their tables with the pack's columns (${seen} tables checked)`, ok && seen === 13, String(seen));
  check(`${l}: 3 requirements 4 cols, 4 one figure with a caption, 5 rules 2 cols`, JSON.stringify(secs(d, 2)[0].blocks[0].columns) === JSON.stringify(pack.columns.requirements[l]) && secs(d, 3)[0].blocks[0].kind === 'diagram' && !!secs(d, 3)[0].blocks[0].caption && JSON.stringify(secs(d, 4)[0].blocks[0].columns) === JSON.stringify(pack.columns.rules[l]));
  const st = secs(d, 5);
  check(`${l}: chapter 6 has three numbered story sections with a title each`, st.length === 3 && st.every((s, i) => s.number === `6.${i + 1}` && s.title.length > 3 && s.blocks[0].kind === 'stories'));
  const items = storiesOf(d);
  check(`${l}: stories 1 and 2 carry actions (${pack.columns.actions[l].length} cols) and dictionary (${pack.columns.dictionary[l].length} cols)`, items.slice(0, 2).every((it) => JSON.stringify(it.actions.columns) === JSON.stringify(pack.columns.actions[l]) && JSON.stringify(it.dictionary.columns) === JSON.stringify(pack.columns.dictionary[l]) && it.acceptance.length >= 1));
  const out = st[2];
  check(`${l}: the output story has no actions and no dictionary, and the item/value table with the pack's 3 labels`, !items[2].actions && !items[2].dictionary && JSON.stringify(out.blocks[1].columns) === JSON.stringify(pack.columns.outputCard[l]) && JSON.stringify(out.blocks[1].rows.map((r) => r[0])) === JSON.stringify([pack.glossary[l].outputNameLabel, pack.glossary[l].outputWhenLabel, pack.glossary[l].outputToLabel]), JSON.stringify(out.blocks[1].rows));
}
{
  const a = JSON.stringify(sampleDoc('ar')); const e = JSON.stringify(sampleDoc('en'));
  check('the AR and EN twins have the same shape (same block kinds, same table sizes)', JSON.stringify(shape(sampleDoc('ar'))) === JSON.stringify(shape(sampleDoc('en'))) && a !== e);
  check('no tashkeel in the blank sample (Arabic is unvowelled)', !/[ً-ْ]/.test(a));
}
function shape(d) { return d.chapters.map((c) => c.sections.map((s) => s.blocks.map((b) => [b.kind, b.columns?.length, b.rows?.length, b.items?.map((i) => [!!i.actions, !!i.dictionary, i.acceptance.length])]))); }

// ── 2 · the editor: real commands on the blank sample ─────────────────────────────────────────────────────────────────────────
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: file, set: 'story156', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text()) && !/favicon/.test(m.text())) errors.push(m.text()); });
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const ready = await page.evaluate(() => ({ svc: window.BW.S.svc, ar: window.BW.M[window.BW.S.svc].ar.doc.chapters.length, en: window.BW.M[window.BW.S.svc].en.doc.chapters.length, both: window.BW.S.both }));
  check('ready state seen: the blank document is open, both editions loaded, pair view on', ready.svc === 'blank' && ready.ar === 6 && ready.en === 6 && ready.both === true, JSON.stringify(ready));

  const docs = () => page.evaluate(() => { const B = window.BW; return { ar: JSON.parse(JSON.stringify(B.M[B.S.svc].ar.doc)), en: JSON.parse(JSON.stringify(B.M[B.S.svc].en.doc)) }; });
  const run = (id) => page.evaluate((id) => window.BW.runAction(id), id);
  const select = (b, p = null) => page.evaluate(([b, p]) => { window.BW.S.sel = { b, p, ed: window.BW.S.ed }; }, [b, p]);
  const steps = () => page.evaluate(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size);
  const undo = () => page.evaluate(() => window.BW.undo());
  const redo = () => page.evaluate(() => window.BW.redo());
  const base = await docs();
  const j = (x) => JSON.stringify(x);
  const colsOk = (it, l) => j(it.actions?.columns) === j(pack.columns.actions[l]) && j(it.dictionary?.columns) === j(pack.columns.dictionary[l]) && it.actions.rows.length === 1 && it.dictionary.rows.length === 1;

  // the commands are real ribbon buttons: found by walking the tabs (addOutputStory sits in the Insert tab once 25-ribbon.js lists it, else in View's «more»)
  const where = {};
  const sh = (fn, arg) => page.evaluate(([src, arg]) => new Function('root', 'arg', `return (${src})(root, arg)`)(document.getElementById('bw-ui-host').shadowRoot, arg), [fn.toString(), arg]);
  const setTab = (tab) => page.evaluate(async (tab) => { window.BW.EXT.ribbon.setTab(tab); await new Promise((q) => setTimeout(q, 40)); }, tab);
  for (const tab of await sh((r) => [...r.querySelectorAll('.ribbon .rb-tab')].map((x) => x.dataset.tab))) {
    await setTab(tab);
    for (const id of ['addStory', 'addOutputStory', 'storyCard', 'storyPoint']) if (!where[id] && await sh((r, id) => !!r.querySelector(`.ribbon .rb-panel [data-a="${id}"]`), id)) where[id] = tab;
  }
  check('the story commands are real ribbon buttons (addStory, addOutputStory, storyCard, storyPoint)', ['addStory', 'addOutputStory', 'storyCard', 'storyPoint'].every((id) => where[id]), j(where));
  console.log('  ribbon tabs:', j(where));
  await setTab('insert');

  // S1: the selection is OUTSIDE the stories chapter (1.1); the story still lands in chapter 6, ahead of the closing output story
  await select('/chapters/0/sections/0/blocks/0');
  const s0 = await steps();
  await setTab('insert');
  const clicked = await sh((r) => { const b = r.querySelector('.ribbon .rb-panel [data-a="addStory"]'); b?.click(); return !!b; });
  check('S1: the Insert tab «user story» button is there and clicked', clicked);
  let d = await docs();
  check('S1: addStory from chapter 1 adds ONE section to chapter 6 (the user-stories chapter), in both editions', d.ar.chapters[5].sections.length === 4 && d.en.chapters[5].sections.length === 4 && d.ar.chapters[0].sections.length === 2);
  for (const l of LOCS) {
    const sec = d[l].chapters[5].sections[2]; const blk = sec.blocks[0]; const it = blk.items[0];
    check(`S1 ${l}: the new section 6.3 sits ahead of the output story, has its own editable title, a stories block, ID, acceptance list, actions (2 cols) and dictionary (7 cols) from the house`, sec.number === '6.3' && sec.title === W[l]['w2s.storyTitle'] && blk.kind === 'stories' && /^US-04$/.test(it.id) && it.acceptance.length >= 1 && colsOk(it, l) && d[l].chapters[5].sections[3].title === base[l].chapters[5].sections[2].title, j(sec).slice(0, 300));
  }
  check('S1: each edition has its own language (AR title differs from EN title)', d.ar.chapters[5].sections[2].title !== d.en.chapters[5].sections[2].title && /[؀-ۿ]/.test(d.ar.chapters[5].sections[2].title) && !/[؀-ۿ]/.test(d.en.chapters[5].sections[2].title));
  check('S6: one gesture = one undo step', (await steps()) === s0 + 1, `${s0} -> ${await steps()}`);
  // printed in the editor: a numbered section with the card caption, the two labels and the tables
  const live = await page.evaluate(() => {
    const m = document.querySelector(`#bw-pair main.bw-doc[data-locale="${window.BW.S.ed}"]`);
    const b = '/chapters/5/sections/2/blocks/0';
    const parts = [...m.querySelectorAll(`[data-b="${b}"]`)];
    return { parts: parts.length, caption: !!m.querySelector(`[data-b="${b}"] caption.story-head`), labels: [...m.querySelectorAll(`[data-b="${b}"] .dict-label`)].length, dicts: m.querySelectorAll(`[data-b="${b}"] table.dict`).length, ol: m.querySelectorAll(`[data-b="${b}"] ol li`).length };
  });
  check('S1/S5 editor: the new story prints as card + actions label+table + dictionary label+table', live.caption && live.labels === 2 && live.dicts === 2 && live.ol >= 1, j(live));
  await undo();
  d = await docs();
  check('S6: ONE undo removes the story from both editions (documents equal the start)', j(d) === j(base));
  await redo();
  check('S6: redo brings it back', (await docs()).en.chapters[5].sections.length === 4);
  await undo();

  // S2: a reference story's own columns win; a missing table falls back to the house columns (never to nothing)
  await page.evaluate(() => {
    const B = window.BW;
    for (const ed of ['ar', 'en']) {
      const base = '/chapters/5/sections/0/blocks/0/items/0';
      B.commit([{ op: 'replace', path: `${base}/actions`, value: { columns: ['X', 'Y', 'Z'], rows: [['1', '2', '3']] } }, { op: 'delete', path: `${base}/dictionary` }], { ed, mirror: false, rerender: false });
      B.commit([{ op: 'delete', path: '/chapters/5/sections/1/blocks/0/items/0/actions' }, { op: 'delete', path: '/chapters/5/sections/1/blocks/0/items/0/dictionary' }], { ed, mirror: false, rerender: false });
    }
    B.render();
  });
  await select('/chapters/5/sections/0/blocks/0');
  await run('addStory');
  d = await docs();
  for (const l of LOCS) {
    const it = d[l].chapters[5].sections[1].blocks[0].items[0];
    check(`S2 ${l}: the document's own actions columns win (X,Y,Z), the missing dictionary falls back to the ${pack.columns.dictionary[l].length} house columns`, j(it.actions.columns) === '["X","Y","Z"]' && j(it.dictionary.columns) === j(pack.columns.dictionary[l]), j(it));
  }
  // «قصة أخرى» on a story that has no tables gets the same tables
  await select('/chapters/5/sections/2/blocks/0', '/chapters/5/sections/2/blocks/0/items/0/name');
  await run('storyCard');
  d = await docs();
  const card2 = d.en.chapters[5].sections[2].blocks[0].items;
  check('S3: «another story» next to a story without tables gets actions and dictionary (document columns, else house)', card2.length === 2 && j(card2[1].actions.columns) === '["X","Y","Z"]' && j(card2[1].dictionary.columns) === j(pack.columns.dictionary.en), j(card2[1]).slice(0, 200));
  // back to the start for the rest
  for (let k = 0; k < 8; k += 1) await undo();
  await page.evaluate(() => { const B = window.BW; B.M[B.S.svc].ar.ops.length = 0; });
  await page.reload();
  await page.waitForFunction(() => window.BW?.ready);
  // the reload restores the shipped blank (no storage between runs in test mode); make sure of it
  const again = await docs();
  check('the start state is the shipped blank again before the output-story test', j(again.en.chapters[5].sections.map((s) => s.number)) === '["6.1","6.2","6.3"]', j(again.en.chapters[5].sections.map((s) => s.number)));

  // S3: the output story command: ID card + item/value table, no actions, no dictionary, at the end of the chapter
  await select('/chapters/1/sections/0/blocks/0');
  const s1 = await steps();
  await run('addOutputStory');
  d = await docs();
  for (const l of LOCS) {
    const sec = d[l].chapters[5].sections[3]; const it = sec.blocks[0].items[0]; const tb = sec.blocks[1];
    check(`S3 ${l}: addOutputStory adds the last section: stories without tables, then ${pack.columns.outputCard[l].join(' | ')} with the 3 house rows`, d[l].chapters[5].sections.length === 4 && sec.title === W[l]['w2s.outputTitle'] && !it.actions && !it.dictionary && it.acceptance.length >= 1 && /^US-04$/.test(it.id) && tb.kind === 'table' && j(tb.columns) === j(pack.columns.outputCard[l]) && j(tb.rows.map((r) => r[0])) === j([pack.glossary[l].outputNameLabel, pack.glossary[l].outputWhenLabel, pack.glossary[l].outputToLabel]), j(sec).slice(0, 300));
  }
  check('S3/S6: one gesture, one undo step', (await steps()) === s1 + 1);
  const outHtml = await page.evaluate(() => { const m = document.querySelector(`#bw-pair main.bw-doc[data-locale="${window.BW.S.ed}"]`); const b = '/chapters/5/sections/3/blocks/0'; return { card: !!m.querySelector(`[data-b="${b}"] caption.story-head`), dict: m.querySelectorAll(`[data-b="${b}"] .dict-label`).length }; });
  check('S3 editor: the output story prints a card and no action or dictionary label', outHtml.card && outHtml.dict === 0, j(outHtml));
  await undo();
  check('S3/S6: one undo removes it from both editions', j(await docs()) === j(again));

  // no stories chapter at all: it is created at the end, whatever the selection is
  await page.evaluate(() => { const B = window.BW; for (const ed of ['ar', 'en']) B.commit([{ op: 'delete', path: '/chapters/5' }], { ed, mirror: false, rerender: false }); B.render(); });
  await select('/chapters/1/sections/1/blocks/0');
  await run('addStory');
  d = await docs();
  for (const l of LOCS) {
    const c = d[l].chapters[5];
    check(`S1 ${l}: a document without the chapter gets it (${W[l]['w2s.chapter']}) with the story as its first section and the «${W[l]['w2s.storyLead']}» label`, d[l].chapters.length === 6 && c.title === W[l]['w2s.chapter'] && c.sections.length === 1 && c.sections[0].blocks[0].lead === W[l]['w2s.storyLead'] && colsOk(c.sections[0].blocks[0].items[0], l), j(c).slice(0, 200));
  }
  await undo();
  check('S6: and one undo takes the chapter away again', (await docs()).en.chapters.length === 5);
  await page.reload();
  await page.waitForFunction(() => window.BW?.ready);

  // S6: the normal table tools work on the new tables (rows, columns, merge, undo)
  await select('/chapters/0/sections/0/blocks/0');
  await run('addStory');
  const T = '/chapters/5/sections/2/blocks/0/items/0/dictionary';
  const cell = (r, c) => `#bw-pair main.bw-doc[data-locale="${'ar'}"] table[data-t="${T}"] td[data-r="${r}"][data-c="${c}"]`;
  const ed = await page.evaluate(() => window.BW.S.ed);
  const cellE = (r, c) => `#bw-pair main.bw-doc[data-locale="${ed}"] table[data-t="${T}"] td[data-r="${r}"][data-c="${c}"]`;
  void cell;
  const tbl = async (e = ed) => (await docs())[e].chapters[5].sections[2].blocks[0].items[0].dictionary;
  const t0 = await tbl();
  check('S6: the new dictionary is a real table the cell tools see (data-t, data-r/data-c)', (await page.locator(cellE(0, 0)).count()) === 1 && t0.columns.length === 7);
  await page.locator(cellE(0, 1)).scrollIntoViewIfNeeded();
  await page.locator(cellE(0, 1)).click();
  const s2 = await steps();
  await run('rowAdd');
  check('S6: add a row — one undo step, both editions', (await tbl()).rows.length === 2 && (await tbl(ed === 'ar' ? 'en' : 'ar')).rows.length === 2 && (await steps()) === s2 + 1);
  await page.locator(cellE(0, 1)).click();
  await run('colAdd');
  check('S6: add a column', (await tbl()).columns.length === 8 && (await tbl()).rows.every((r) => r.length === 8));
  await page.locator(cellE(0, 0)).click();
  await page.keyboard.down('Shift');
  await page.locator(cellE(0, 1)).click();
  await page.keyboard.up('Shift');
  await run('cellMerge');
  const merged = await tbl();
  check('S6: merge two cells', (merged.merges || []).length === 1, j(merged.merges));
  await undo(); await undo(); await undo();
  check('S6: undo of merge, column and row restores the table', j(await tbl()) === j(t0), j(await tbl()));

  // ── 3 · PDF + DOCX text of the edited document (the real exporters) ─────────────────────────────────────────────────────
  await select('/chapters/0/sections/0/blocks/0');
  await run('addOutputStory');
  const fin = await docs();
  const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
  const FACES = fontsFor(theme).used.filter((c) => c.format === 'truetype').map((c) => c.family);
  const HAVE_FONTS = [theme.fonts.text, theme.fonts.display].every((f) => FACES.includes(f));
  const flat = (t) => t.normalize('NFKC').replace(/[\s‎‏‪-‮]+/g, '');
  const stripTags = (xml) => xml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '');
  const L = i18n().doc;
  // Arabic table headers wrap inside narrow cells, so pdftotext may break a phrase across lines: for AR every WORD of the phrase must be there
  const miss = (txt, ws, words) => ws.filter((w) => (words ? String(w).split(/[\s()،|]+/).filter(Boolean).some((x) => !txt.includes(flat(x))) : !txt.includes(flat(w))));
  for (const l of LOCS) {
    const doc = fin[l];
    const want = [L[l].userStory, L[l].actionsTable, L[l].dictionary, ...pack.columns.actions[l], ...pack.columns.dictionary[l], ...pack.columns.outputCard[l], pack.glossary[l].outputNameLabel, pack.glossary[l].outputToLabel, W[l]['w2s.storyTitle'], W[l]['w2s.outputTitle'], 'US-04', 'US-05'];
    const html = renderDocument(doc, { locale: l, labels: L[l], theme, fontCss: '', logos: theme.logos });
    const htmlText = flat(html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
    check(`${l}: print HTML carries every card label, column header and house word of the new stories`, want.every((w) => htmlText.includes(flat(w))), want.filter((w) => !htmlText.includes(flat(w))).join(' | '));
    const dx = path.join(tmp, `s-${l}.docx`);
    exportDocx(doc, { locale: l, theme, docxPath: dx, embedFonts: false });
    const xml = docxParts(dx, /^word\/document\.xml$/)['word/document.xml'];
    const dtext = flat(stripTags(xml));
    check(`${l}: DOCX text carries the labels, the 2 + 7 columns and the output table`, want.every((w) => dtext.includes(flat(w))), want.filter((w) => !dtext.includes(flat(w))).join(' | '));
    const pdf = path.join(tmp, `s-${l}.pdf`);
    await exportPdf(doc, { locale: l, theme, pdfPath: pdf, browser });
    const ptxt = flat(spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '');
    if (l === 'ar' && !HAVE_FONTS) check('ar: PDF text — skipped, the Thmanyah faces are not installed here so pdftotext cannot read Arabic (HTML and DOCX above cover it)', true);
    else check(`${l}: PDF text carries the labels, the 2 + 7 columns and the output table`, ptxt.length > 500 && miss(ptxt, want, l === 'ar').length === 0, miss(ptxt, want, l === 'ar').join(' | ') || `len ${ptxt.length}`);
  }
  check('no page errors in the whole run', !errors.length, errors.join(' | '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\nFAILED: ${failed}/${results.length}` : `\nALL ${results.length} PASS`);
process.exit(failed ? 1 : 0);
