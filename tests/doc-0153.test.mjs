// 0.15.3 lane doc (correctness): T5 numbers computed everywhere + renumber writes real numbers, T6 single-edition documents, T7 split a
// large figure on phase / role boundaries (>= 7 pt, continue stubs), T8 library words per built edition, T12 visible tashkeel warning + fix,
// T16 `columns: []` refused and a story number never by hand. Pure helpers in node, the rest through the real editor (headless Edge/Chrome,
// closed in finally) and its bridge (the same entry the MCP tools use).   node tests/doc-0153.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { DIAGRAM } from '../engine/diagram.mjs';
import { config } from '../engine/config.mjs';
import { applyOps, docNumbers, numberingOps, validateEdits, opShapeErrors, editionsOf, isSingleEdition, singleEditionOps, exportEditions, tashkeelOps, tashkeelLeaves, stripTashkeel, wordCount, entryWords } from '../engine/edits.mjs';
import { bigWorkflow } from './render-fixtures.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-doc0153-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  doc-0153: ${name}${detail && !ok ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const load = (l) => JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${l}.json`), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const html = (doc, locale = 'ar') => renderDocument(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });
const tx = (h) => h.replace(/<[^>]+>/g, '').replace(/[‎‏⁦-⁩]/g, '').trim();
const h2Nums = (h) => [...h.matchAll(/<h2><span class="num"[^>]*>(.*?)<\/span><span/g)].map((m) => tx(m[1]));
const newChapter = (title) => ({ number: '', title, sections: [{ number: '', title: `${title} 1`, blocks: [{ kind: 'prose', paragraphs: [title] }] }] });

// ── T5 · numbers: pure ──
{
  const base = load('ar');
  const ins = applyOps(base, [{ op: 'insert', path: '/chapters/1', value: newChapter('فصل مُدرج') }]);
  const N = docNumbers(ins);
  check('T5 numbering: an inserted chapter prints 2 and the rest move down (view model)', N.ch[1] === '2' && N.ch.at(-1) === String(ins.chapters.length) && h2Nums(html(ins)).join() === N.ch.join(), JSON.stringify(h2Nums(html(ins))));
  const ops = numberingOps(ins);
  check('T5 renumber ops: stale or empty stored numbers get real ones (opsAdded > 0)', ops.length > 0 && ops.some((o) => o.path === '/chapters/1/number' && o.value === '2'));
  const fixed = applyOps(ins, ops);
  check('T5 after the ops every stored number equals what prints, and a second pass adds nothing', JSON.stringify(fixed.chapters.map((c) => c.number)) === JSON.stringify(N.ch) && numberingOps(fixed).length === 0);
  const man = clone(ins);
  man.control.numbering = 'manual';
  const mops = numberingOps(man);
  check('T5 a manual-numbering document: renumber writes the numbers by position', mops.length > 0 && applyOps(man, mops).chapters.every((c, i) => c.number === String(i + 1)) && docNumbers(applyOps(man, mops)).manual);
}

// ── T6 · single edition: pure ──
{
  const d = load('ar');
  check('T6 editions flag: absent = a pair; control.editions [ar] = one language', !isSingleEdition(d) && isSingleEdition({ control: { editions: ['ar'] } }) && !isSingleEdition({ control: { editions: ['ar', 'en'] } }) && editionsOf({ control: { editions: ['xx'] } }) === null);
  const ops = singleEditionOps({ ar: d, en: load('en') }, 'ar');
  check('T6 singleEditionOps sets the flag on every edition and back off with both', ops.length === 2 && ops.every((o) => o.op.path === '/control/editions') && singleEditionOps({ ar: applyOps(d, [ops[0].op]) }, 'both')[0].op.op === 'delete');
  const entry = { editions: { ar: { raw: JSON.stringify({ ...d, control: { ...d.control, editions: ['ar'] } }) }, en: { raw: JSON.stringify(load('en')) } } };
  check('T6 exports omit the empty edition of a single-edition document, and keep both otherwise', JSON.stringify(exportEditions(entry)) === '["ar"]' && exportEditions({ editions: { ar: { raw: JSON.stringify(d) }, en: { raw: JSON.stringify(load('en')) } } }).length === 2);
  check('T6 the flag is a setting, not words (find, spelling and counts never see it)', !wordCount({ control: { editions: ['ar'], numbering: 'manual' }, chapters: [] }));
}

// ── T8 · words per built edition: pure ──
{
  const d = load('ar');
  const blank = { ...load('en'), chapters: [] };
  const entry = { editions: { ar: { raw: JSON.stringify(blank), ops: [{ id: 'o1', op: 'insert', path: '/chapters/-', value: newChapter('وثيقة مكتملة تحتوي كلمات كثيرة هنا') }] }, en: { raw: JSON.stringify(blank), ops: [] } } };
  const w = entryWords(entry);
  check('T8 entryWords counts what an edition holds now (base + live ops), per edition', w.ar > w.en && w.en === wordCount(blank), JSON.stringify(w));
  check('T8 a rejected op does not count', entryWords({ editions: { ar: { ...entry.editions.ar, status: { o1: 'rejected' } } } }).ar === wordCount(blank));
  check('T8 wordCount of a full sample document is large', wordCount(d) > 300, String(wordCount(d)));
}

// ── T12 · tashkeel: pure ──
{
  const d = clone(load('ar'));
  d.chapters[0].sections[0].blocks.unshift({ kind: 'prose', paragraphs: ['مَرْحَباً بِكُمْ'] });
  const leaves = tashkeelLeaves(d);
  const ops = tashkeelOps(d);
  const out = applyOps(d, ops);
  check('T12 tashkeel in visible text is found, and the ops strip it (nothing else changes)', leaves.length > 0 && ops.length === leaves.length && tashkeelLeaves(out).length === 0 && stripTashkeel('مَرْحَباً') === 'مرحبا');
  check('T12 a clean document gives no ops', tashkeelOps(out).length === 0);
}

// ── T16 · validator: pure ──
{
  const base = { version: 1, document: 'x', baseHash: `sha256:${'0'.repeat(64)}`, locale: 'ar' };
  const bad = validateEdits({ ...base, ops: [{ op: 'insert', path: '/chapters/0/sections/0/blocks/-', value: { kind: 'table', columns: [], rows: [['a', 'b']] } }] });
  check('T16 a table inserted with columns: [] is refused with a reason', bad.some((e) => /columns: \[\]/.test(e)), JSON.stringify(bad));
  check('T16 replacing /columns with [] is refused', validateEdits({ ...base, ops: [{ op: 'replace', path: '/chapters/0/sections/0/blocks/1/columns', value: [] }] }).length === 1);
  check('T16 a table with columns is accepted, and an omitted columns key too', validateEdits({ ...base, ops: [{ op: 'insert', path: '/chapters/0/sections/0/blocks/-', value: { kind: 'table', columns: ['a'], rows: [['b']] } }, { op: 'insert', path: '/chapters/0/sections/0/blocks/-', value: { kind: 'table', rows: [['b']] } }] }).length === 0);
  check('T16 a story block number by hand is refused (it comes from its section)', validateEdits({ ...base, ops: [{ op: 'replace', path: '/chapters/0/sections/1/blocks/0/number', value: '9.9' }] }).some((e) => /from its section/.test(e)) && opShapeErrors({ op: 'replace', path: '/chapters/0/sections/1/number', value: '2.1' }).length === 0);
}

// ── T7 · split a figure: pure ──
let splitRes = null;
{
  const m = bigWorkflow();
  const whole = DIAGRAM.legibility(DIAGRAM.layout(m, { aspect: 1.5 }), { theme });
  splitRes = DIAGRAM.splitForLegibility(m, { theme });
  const figs = splitRes?.figures || [];
  const stubs = figs.map((f) => f.model.nodes.filter((n) => n.kind === 'continue'));
  const legs = figs.map((f) => DIAGRAM.legibility(f.model, { theme }).minPtPrinted);
  check('T7 the unsplit big workflow prints below 7 pt (the field fault)', whole.minPtPrinted < 7, String(whole.minPtPrinted));
  check('T7 splitForLegibility returns several figures, each printing at 7 pt or more', figs.length >= 2 && legs.every((p) => p >= 7) && splitRes.ok, JSON.stringify(legs));
  check('T7 every cut has continue stubs on both sides (the first figure continues, the last is continued from)', stubs[0].length >= 1 && stubs.at(-1).length >= 1 && stubs.slice(1, -1).every((s) => s.length >= 2));
  check('T7 the stubs say «يتبع» / "Continued"', stubs[0].some((n) => /يتبع/.test(n.label)) && DIAGRAM.words('en').continueTo.startsWith('Continued'));
  check('T7 no node is lost: every original stage appears in a figure; only a rework / stop satellite may appear beside two (stubs and auto groups aside)', (() => { const seen = figs.flatMap((f) => f.model.nodes.filter((n) => n.kind !== 'continue' && n.kind !== 'group').map((n) => n.id)); const dup = seen.filter((x, i) => seen.indexOf(x) !== i); return m.nodes.every((n) => seen.includes(n.id)) && dup.every((id) => ['rework', 'stop'].includes(m.nodes.find((n) => n.id === id)?.kind)); })());
  check('T7 a small diagram is left alone', DIAGRAM.splitForLegibility({ kind: 'bw-diagram', nodes: [{ id: 'a', kind: 'start', label: 'أ' }, { id: 'b', kind: 'ok', label: 'ب' }], edges: [{ from: 'a', to: 'b' }] }, { theme }) === null);
}

// ── editor: the real caller ──
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'doc-0153-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  const bw = (fn, arg) => page.evaluate(fn, arg);

  // T5 · view, Check, outline, renumber action
  const r5 = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    await B.bridge('ops', svc, { locale: 'ar', mirror: true, ops: [{ op: 'insert', path: '/chapters/1', value: { number: '', title: 'فصل جديد', sections: [{ number: '', title: 'قسم', blocks: [{ kind: 'prose', paragraphs: ['نص'] }] }] } }] });
    const view = [...document.querySelectorAll('main.bw-doc[data-locale="ar"] h2 .num')].map((x) => x.textContent.replace(/[‎‏⁦-⁩]/g, ''));
    const n = B.M[svc].ar.doc.chapters.length;
    const check = (await B.bridge('action', svc, { id: 'check' })).findings;
    const outline = (await B.bridge('outline', svc, { locale: 'ar' })).chapters.map((c) => c.number);
    const stale = B.M[svc].ar.doc.chapters[1].number;
    const ren = await B.bridge('action', svc, { id: 'renumber' });
    const stored = B.M[svc].ar.doc.chapters.map((c) => c.number);
    const stored2 = B.M[svc].en.doc.chapters.map((c) => c.number);
    return { view, n, outline, stale, ren, stored, stored2, numberingFindings: check.filter((f) => /ترقيم غير متسلسل|out of sequence/.test(f.message)).length };
  });
  const seq = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
  check('T5 editor view: the inserted chapter (empty stored number) shows 2 and the rest follow', JSON.stringify(r5.view) === JSON.stringify(seq(r5.n)), JSON.stringify(r5.view));
  check('T5 Check never flags an auto-numbered document (no «ترقيم غير متسلسل»)', r5.numberingFindings === 0 && r5.stale === '');
  check('T5 the outline (MCP editor_outline) reports the printed numbers', JSON.stringify(r5.outline) === JSON.stringify(seq(r5.n)), JSON.stringify(r5.outline));
  check('T5 action renumber now adds ops (was 0) and writes the numbers into both editions', r5.ren.opsAdded > 0 && JSON.stringify(r5.stored) === JSON.stringify(seq(r5.n)) && JSON.stringify(r5.stored2) === JSON.stringify(seq(r5.n)), JSON.stringify(r5.ren));
  const r5b = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    await B.bridge('ops', svc, { locale: 'ar', mirror: true, ops: [{ op: 'replace', path: '/control/numbering', value: 'manual' }, { op: 'replace', path: '/chapters/0/number', value: '7' }] });
    const flagged = (await B.bridge('action', svc, { id: 'check' })).findings.filter((f) => /ترقيم غير متسلسل/.test(f.message));
    const ren = await B.bridge('action', svc, { id: 'renumber' });
    const after = (await B.bridge('action', svc, { id: 'check' })).findings.filter((f) => /ترقيم غير متسلسل/.test(f.message));
    return { flagged: flagged.length, fix: flagged[0]?.fix?.action, ren, after: after.length, first: B.M[svc].ar.doc.chapters[0].number };
  });
  check('T5 manual numbering: a hand-edited number is flagged with a renumber fix, renumber writes real numbers, Check is clean after', r5b.flagged >= 1 && r5b.fix === 'renumber' && r5b.ren.opsAdded > 0 && r5b.after === 0 && r5b.first === '1', JSON.stringify(r5b));
  await bw(async () => { const B = window.BW; await B.bridge('ops', B.S.svc, { locale: 'ar', mirror: true, ops: [{ op: 'delete', path: '/control/numbering' }] }); });

  // T6 · Arabic-only passes Check
  const r6 = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    const pair = (fs) => fs.filter((f) => /النسختان غير متطابقتين|Editions differ/.test(f.message)).length;
    await B.bridge('ops', svc, { locale: 'ar', mirror: false, ops: [{ op: 'insert', path: '/chapters/-', value: { number: '', title: 'فصل عربي فقط', sections: [{ number: '', title: 'قسم', blocks: [{ kind: 'prose', paragraphs: ['نص عربي'] }] }] } }] });
    const before = (await B.bridge('action', svc, { id: 'check' })).findings;
    const set = await B.bridge('action', svc, { id: 'singleEdition', args: { editions: 'ar' } });
    const after = (await B.bridge('action', svc, { id: 'check' })).findings;
    const viaOps = await B.bridge('ops', svc, { locale: 'ar', mirror: false, ops: [{ op: 'replace', path: '/control/editions', value: ['ar'] }] }).then(() => 'ok', (e) => e.bw);
    const panel = (() => { B.openDrawer?.('check'); return null; })();
    return { pairBefore: pair(before), errAfter: after.filter((f) => f.level === 'err' && /النسختان|Editions/.test(f.message)).length, pairAfter: pair(after), set, viaOps, flag: B.M[svc].ar.doc.control.editions, flagEn: B.M[svc].en.doc.control.editions, panel };
  });
  check('T6 a pair that differs in structure fails Check (the field fault: «النسختان غير متطابقتين»)', r6.pairBefore >= 1, JSON.stringify(r6));
  check('T6 set single-edition (action singleEdition / ops on control.editions): Check skips the pair rules and the document passes', r6.pairAfter === 0 && r6.errAfter === 0 && JSON.stringify(r6.flag) === '["ar"]' && JSON.stringify(r6.flagEn) === '["ar"]' && r6.set.opsAdded >= 1 && r6.viaOps === 'ok', JSON.stringify(r6));
  const ui6 = await bw(async () => { const B = window.BW; await B.runAction('check'); await new Promise((r) => setTimeout(r, 200)); const d = document.querySelector('#bw-ui-host')?.shadowRoot?.querySelector('.drawer'); return { has: !!d?.querySelector('[data-fix="singleEdition"][data-fix-arg="ar"]'), three: d?.querySelectorAll('.doc153-ed [data-fix]').length, pressed: d?.querySelector('[data-fix-arg="ar"]')?.getAttribute('aria-pressed') }; });
  check('T6 the UI: the Check panel carries the AR / EN / both language control, «Arabic only» pressed', ui6.has && ui6.three === 3 && ui6.pressed === 'true', JSON.stringify(ui6));
  const back = await bw(async () => { const B = window.BW; const r = await B.bridge('action', B.S.svc, { id: 'singleEdition', args: { editions: 'both' } }); return { r, a: B.M[B.S.svc].ar.doc.control.editions ?? null, e: B.M[B.S.svc].en.doc.control.editions ?? null }; });
  check('T6 «both» turns it off again (the pair rules return)', back.a === null && back.e === null);

  // T8 · the bridge list: words per edition (a blank edition does not count)
  const r8 = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    try {
      const l = await B.bridge('list', null, {});
      const row = (l.documents || []).find((d) => d.id === svc);
      return { found: !!row, words: row?.words, by: row?.wordsByEdition, direct: B.M[svc].ar.doc && Object.fromEntries(Object.entries(B.M[svc]).map(([ed, e]) => [ed, e.doc.chapters.length])) };
    } catch (e) { return { err: String(e) }; }
  });
  check('T8 editor list: words = the largest built edition, with wordsByEdition per edition', r8.found ? (r8.words > 100 && r8.by && r8.by.ar > 0 && r8.words === Math.max(...Object.values(r8.by))) : !!r8.err === false, JSON.stringify(r8));

  // T12 · tashkeel
  const r12 = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    await B.bridge('action', svc, { id: 'fixTashkeel' });
    const clean = (await B.bridge('action', svc, { id: 'check' })).findings.filter((f) => /تشكيل|tashkeel/i.test(f.message)).length;
    await B.bridge('ops', svc, { locale: 'ar', mirror: true, ops: [{ op: 'insert', path: '/chapters/0/sections/0/blocks/0', value: { kind: 'prose', paragraphs: ['مَرْحَباً بِكُمْ'] } }] });
    const f = (await B.bridge('action', svc, { id: 'check' })).findings.find((x) => /تشكيل|tashkeel/i.test(x.message));
    const fixed = await B.bridge('action', svc, { id: 'fixTashkeel' });
    const text = B.M[svc].ar.doc.chapters[0].sections[0].blocks[0].paragraphs[0];
    const after = (await B.bridge('action', svc, { id: 'check' })).findings.filter((x) => /تشكيل|tashkeel/i.test(x.message)).length;
    return { clean, found: !!f, fix: f?.fix?.action, fixed, text: typeof text === 'string' ? text : text.text, after };
  });
  check('T12 Check warns on tashkeel in visible text (warning, with a fixTashkeel fix)', r12.found && r12.fix === 'fixTashkeel', JSON.stringify(r12));
  check('T12 the one-click fix strips it (ops added), and Check is clean afterwards', r12.fixed.opsAdded >= 1 && r12.text === 'مرحبا بكم' && r12.after === 0 && r12.clean === 0, JSON.stringify(r12));

  // T16 · through the bridge
  const r16 = await bw(async () => {
    const B = window.BW; const svc = B.S.svc;
    const code = (ops) => B.bridge('ops', svc, { locale: 'ar', ops }).then(() => 'ok', (e) => `${e.bw}: ${e.message}`);
    return {
      cols: await code([{ op: 'insert', path: '/chapters/0/sections/0/blocks/-', value: { kind: 'table', columns: [], rows: [['a', 'b']] } }]),
      story: await code([{ op: 'replace', path: '/chapters/0/sections/0/blocks/0/number', value: '9.9' }]),
    };
  });
  check('T16 the bridge refuses a table with columns: [] (BAD_OP, with the reason)', /^BAD_OP: .*columns: \[\]/.test(r16.cols), JSON.stringify(r16));
  check('T16 the bridge refuses a story number written by hand', /^BAD_OP: .*from its section/.test(r16.story), JSON.stringify(r16));

  // T7 · Check offers «Split this figure», the action splits both editions, >= 7 pt, stubs, same shape
  const r7 = await bw(async (wf) => {
    const B = window.BW; const svc = B.S.svc;
    const model = (ed) => ({ ...wf, nodes: wf.nodes.map((n) => ({ ...n, label: `${ed === 'en' ? 'Step' : 'مرحلة'} ${n.label.replace(/\D+/g, ' ').trim() || n.id}` })) });
    const sec = '/chapters/0/sections/0';
    await B.bridge('ops', svc, { locale: 'ar', mirror: false, ops: [{ op: 'insert', path: `${sec}/blocks/-`, value: { kind: 'diagram', caption: 'مخطط كبير', model: model('ar') } }] });
    await B.bridge('ops', svc, { locale: 'en', mirror: false, ops: [{ op: 'insert', path: `${sec}/blocks/-`, value: { kind: 'diagram', caption: 'Big workflow', model: model('en') } }] });
    const at = B.M[svc].ar.doc.chapters[0].sections[0].blocks.length - 1;
    const ptr = `${sec}/blocks/${at}`;
    const f = (await B.bridge('action', svc, { id: 'check' })).findings.find((x) => x.fix?.action === 'splitFigure');
    const t0 = Date.now();
    const r = await B.bridge('action', svc, { id: 'splitFigure', args: { pointer: f?.fix?.args?.pointer || ptr } });
    const blocks = (ed) => B.M[svc][ed].doc.chapters[0].sections[0].blocks.slice(at);
    const arB = blocks('ar'), enB = blocks('en');
    const left = (await B.bridge('action', svc, { id: 'check' })).diagramWarnings.length;
    return { offered: !!f, offeredPtr: f?.fix?.args?.pointer === ptr, r, ms: Date.now() - t0, nAr: arB.length, nEn: enB.length, kinds: arB.map((b) => b.kind).join(), stubs: arB.map((b) => b.model.nodes.filter((n) => n.kind === 'continue').length), captions: arB.map((b) => b.caption), left };
  }, bigWorkflow());
  check('T7 Check offers «Split this figure» on the unreadable diagram (fix action splitFigure with its block pointer)', r7.offered && r7.offeredPtr, JSON.stringify(r7));
  check('T7 the action replaces the block by several diagram blocks, in both editions the same number', r7.r.figures >= 2 && r7.nAr === r7.r.figures && r7.nEn === r7.nAr && /^(diagram,?)+$/.test(r7.kinds), JSON.stringify(r7));
  check('T7 each figure prints at 7 pt or more (as measured by the split)', r7.r.minPtPrinted >= 7, JSON.stringify(r7));
  check('T7 continue stubs at the cuts and a part caption on each figure', r7.stubs[0] >= 1 && r7.stubs.at(-1) >= 1 && r7.captions.every((c) => /مخطط كبير \(الجزء \d+ من \d+\)/.test(c)), JSON.stringify(r7));
  check('T5-T16 no page error in the editor during the run', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
}

// ── T5 · the PDF prints the numbers too (EN edition, real exporter) ──
{
  const en = applyOps(load('en'), [{ op: 'insert', path: '/chapters/1', value: newChapter('Inserted chapter') }]);
  const b2 = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(tmp, 'n.en.pdf');
    await exportPdf(en, { locale: 'en', theme, pdfPath: pdf, browser: b2 });
    const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
    const txt = spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
    const N = docNumbers(en);
    check('T5 PDF: the inserted chapter prints as chapter 2 (its title follows the number) and every chapter number is present', /(^|\n)\s*2\s*\n?\s*Inserted chapter/.test(txt) && N.ch.every((n) => new RegExp(`(^|\\s)${n}(\\s|$)`, 'm').test(txt)), txt.slice(0, 200));
  } finally { await b2.close(); }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `doc-0153: ${failed} FAILED` : 'doc-0153: all passed');
process.exit(failed ? 1 : 0);
