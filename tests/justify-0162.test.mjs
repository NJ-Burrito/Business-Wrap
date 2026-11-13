// note J · Justify, Justify Low / Medium / High like Word. An Arabic paragraph can be justified with kashida at three levels; the
// stretch is a DISPLAY layer (render.mjs kashidaPass: CSS-painted tatweels, never characters in the data). Proven here in the editor (real
// Chrome, measured line widths), in the PDF (poppler word boxes), in the DOCX (Word's own w:jc values) and in the data (no U+0640).
//
//   node tests/justify-0162.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, exportPdf, exportDocx, loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import { styleLeaf } from '../engine/edits.mjs';
import { poppler, docxParts } from './fixtures/doc-model/util.mjs';
import { suite, launchChrome } from './_harness.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-justify-'));
const S = suite("justify-0162");
const { check } = S;
const theme = loadTheme();
const LEVELS = ['justify', 'justify-low', 'justify-medium', 'justify-high'];
const AR1 = 'تصف هذه الوثيقة متطلبات خدمة إلكترونية تتيح لمقدم الطلب التقدم بطلب تصريح لإقامة فعالية عامة، ومتابعة حالته حتى صدور القرار، وتحدد مسؤوليات الجهات المشاركة في دراسة الطلب واعتماده وإبلاغ صاحبه بالنتيجة.';
const AR = [AR1, AR1, AR1, AR1].join(' ');
const EN1 = 'This document describes the requirements of an electronic service that lets an applicant request a permit to hold a public event and follow its status until the decision is issued, and it sets the duties of the bodies that study, approve and report the request.';
const EN = [EN1, EN1, EN1].join(' ');
const base = (l) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`), 'utf8'));
const mk = (l) => {
  const d = base(l);
  const b = d.chapters[0].sections[0].blocks[0];
  const text = l === 'ar' ? AR : EN;
  b.paragraphs = LEVELS.map((a) => styleLeaf(text, { align: a }));
  b.paragraphs.push(styleLeaf(EN, { align: 'justify-high' })); // Latin text at the highest level: plain justify
  return d;
};
const arDoc = mk('ar'), enDoc = mk('en');
const PP = '/chapters/0/sections/0/blocks/0/paragraphs';

// ── 1. the schema, the markup, old documents ──
{
  const html = renderDocument(arDoc, { locale: 'ar', labels: i18n().doc.ar, theme, fontCss: '', logos: theme.logos });
  const lv = [...html.matchAll(/<p [^>]*style="text-align:justify" data-jk="(\w+)"/g)].map((m) => m[1]);
  check('render: low / medium / high mark their paragraph (data-jk) and use text-align:justify', lv.join() === 'low,medium,high,high', lv.join());
  check('render: the print page carries the kashida script only when a level is used', html.includes('id="bw-kashida"') && !renderDocument(base('ar'), { locale: 'ar', labels: i18n().doc.ar, theme, fontCss: '', logos: theme.logos }).includes('bw-kashida'));
  check('render: the data holds no tatweel (U+0640) and the markup draws none', !JSON.stringify(arDoc).includes('ـ') && !html.includes('ـ'));
  const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'bible', 'contracts', 'edits.schema.json'), 'utf8'));
  const en = JSON.stringify(schema).match(/"align":\{"enum":\[[^\]]*\]\}/)?.[0] || '';
  check('schema: align accepts justify-low / -medium / -high (additive)', ['justify-low', 'justify-medium', 'justify-high', 'justify', 'start'].every((v) => en.includes(`"${v}"`)), en);
}

// ── 2. DOCX: Word's own values ──
const docxFile = path.join(tmp, 'ar.docx');
exportDocx(arDoc, { locale: 'ar', theme, docxPath: docxFile, embedFonts: false });
{
  const xml = docxParts(docxFile, /^word\/document\.xml$/)['word/document.xml'];
  const jcOf = (needle) => [...xml.matchAll(/<w:p>((?:(?!<\/w:p>).)*)<\/w:p>/gs)].filter((m) => m[1].includes(needle)).map((m) => m[1].match(/<w:jc w:val="(\w+)"/)?.[1]);
  const got = jcOf('تصف هذه الوثيقة');
  check('DOCX: jc both / lowKashida / mediumKashida / highKashida on the four Arabic paragraphs', got.slice(-4).join() === 'both,lowKashida,mediumKashida,highKashida', got.join());
  const lat = jcOf('This document describes');
  check('DOCX: Latin text at the highest level is plain justify (both)', lat.length > 0 && lat.every((v) => v === 'both'), lat.join());
  check('DOCX: no tatweel in the document text', !xml.includes('ـ'));
}
exportDocx(enDoc, { locale: 'en', theme, docxPath: path.join(tmp, 'en.docx'), embedFonts: false });
{
  const xml = docxParts(path.join(tmp, 'en.docx'), /^word\/document\.xml$/)['word/document.xml'];
  const jcs = [...xml.matchAll(/<w:p>((?:(?!<\/w:p>).)*)<\/w:p>/gs)].filter((m) => m[1].includes('This document describes')).map((m) => m[1].match(/<w:jc w:val="(\w+)"/)?.[1]);
  check('DOCX (English edition): every level is plain both', jcs.length >= 4 && jcs.slice(-5).every((v) => v === 'both'), jcs.join());
}

// ── 3. PDF: word boxes by poppler ──
const pdfFile = path.join(tmp, 'ar.pdf');
await exportPdf(arDoc, { locale: 'ar', theme, pdfPath: pdfFile });
{
  const x = spawnSync(poppler('pdftotext'), ['-enc', 'UTF-8', '-bbox-layout', pdfFile, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout;
  // poppler lists Arabic words in visual order (letters reversed); a word box includes any tatweel the page drew
  const rawLines = [...x.matchAll(/<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)<\/line>/gs)].map((m) => ({
    x0: +m[1], x1: +m[3], y: +m[2], words: [...m[5].matchAll(/<word xMin="([\d.]+)" [^>]*xMax="([\d.]+)"[^>]*>([^<]*)<\/word>/g)].map((w) => ({ w: [...w[3]].reverse().join(''), width: +w[2] - +w[1] })),
  }));
  const lines = rawLines.filter((l) => l.y > 40 && l.y < 800); // page header and footer bands are not paragraph lines
  const strip = (w) => w.replace(/[ـ‎‏‪-‮⁦-⁩]/g, '');
  const at = lines.findIndex((l) => l.words.some((w) => strip(w.w) === 'تصف'));
  const groups = [];
  const colW0 = Math.max(...lines.slice(Math.max(0, at), Math.max(0, at) + 6).map((l) => l.x1 - l.x0));
  let k = Math.max(0, at), cur = [];
  for (; at >= 0 && k < lines.length && groups.length < 4; k += 1) {
    cur.push(lines[k]);
    if (lines[k].x1 - lines[k].x0 < colW0 - 3) { groups.push(cur); cur = []; } // a paragraph ends on its short last line
  }
  check('PDF: the four Arabic paragraphs are found by their words', at >= 0 && groups.length === 4, `${groups.length} groups, ${lines.length} lines, at ${at}`);
  if (groups.length === 4) {
    const colW = Math.max(...groups[0].map((l) => l.x1 - l.x0));
    const ink = groups.map((g) => g.slice(0, -1).reduce((n, l) => n + l.words.reduce((a, w) => a + w.width, 0), 0));
    check('PDF: the same number of lines at every level (page breaks do not move)', new Set(groups.map((g) => g.length)).size === 1, groups.map((g) => g.length).join());
    check('PDF: the words are stretched more at each level: plain < low < medium < high (summed word boxes)', ink[0] < ink[1] && ink[1] < ink[2] && ink[2] < ink[3], ink.map((v) => v.toFixed(1)).join(' < '));
    const flush = groups.every((g) => g.slice(0, -1).every((l) => Math.abs(l.x1 - l.x0 - colW) < 1.5));
    check('PDF: every full line is flush to both edges at every level (measured line widths)', flush, groups.map((g) => g.slice(0, -1).map((l) => (l.x1 - l.x0 - colW).toFixed(1)).join(' ')).join(' | '));
    const last = groups.map((g) => g.at(-1));
    check('PDF: the last line of a paragraph is not stretched (same box at every level)', last.every((l) => Math.abs((l.x1 - l.x0) - (last[0].x1 - last[0].x0)) < 0.6), last.map((l) => (l.x1 - l.x0).toFixed(1)).join(' '));
  }
}

// ── 4. the editor in real Chrome ──
const dir = path.join(tmp, 'sample');
fs.cpSync(path.join(REPO, 'samples', 'event-permit'), dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'document.ar.json'), JSON.stringify(arDoc));
fs.writeFileSync(path.join(dir, 'document.en.json'), JSON.stringify(enDoc));
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [dir], out: file, set: 'justify-test', watermarkDir: null });
const browser = await launchChrome();
try {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForFunction(() => document.querySelector('#bw-pair main.bw-doc[data-locale="ar"] [data-jk]'), null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready.then(() => window.BW.EXT.w2format.kashida()));
  const measure = () => page.evaluate((pp) => {
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="ar"] [data-p="${pp}/${i}"]`);
      const ks = [...el.querySelectorAll('i.bw-k')];
      const words = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = walk.nextNode())) for (const m of n.data.matchAll(/\S+/g)) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); words.push(r.getBoundingClientRect()); }
      const lines = [];
      for (const b of words) { const cy = (b.top + b.bottom) / 2, l = lines.at(-1); if (l && cy >= l.top && cy <= l.bottom) { l.l = Math.min(l.l, b.left); l.r = Math.max(l.r, b.right); } else lines.push({ top: b.top, bottom: b.bottom, l: b.left, r: b.right }); }
      const lastTop = lines.at(-1).top;
      out.push({ jk: el.dataset.jk || '', h: Math.round(el.getBoundingClientRect().height * 10) / 10, lines: lines.length, widths: lines.map((l) => l.r - l.l), kashPx: ks.reduce((a, k) => a + k.getBoundingClientRect().width, 0), kashCount: ks.reduce((a, k) => a + k.dataset.k.length, 0), inLast: ks.filter((k) => k.getBoundingClientRect().top >= lastTop - 1).length, text: el.textContent, inner: el.innerText });
    }
    return out;
  }, PP);
  let m = await measure();
  check('editor: the four Arabic paragraphs and the Latin one are drawn', m.length === 5 && m[0].lines >= 4, m.map((x) => x.lines).join());
  check('editor: the same height and line count at every level (page breaks do not move)', new Set(m.slice(0, 4).map((x) => x.h)).size === 1 && new Set(m.slice(0, 4).map((x) => x.lines)).size === 1, m.slice(0, 4).map((x) => `${x.lines}/${x.h}`).join());
  check('editor: stretch rises plain < low < medium < high (plain has none)', m[0].kashCount === 0 && m[1].kashCount > 0 && m[1].kashCount < m[2].kashCount && m[2].kashCount < m[3].kashCount, m.slice(0, 4).map((x) => `${x.kashCount} tatweels`).join(' '));
  const colW = Math.max(...m[0].widths);
  check('editor: every full line stays flush to both edges at every level (measured line widths)', m.slice(0, 4).every((x) => x.widths.slice(0, -1).every((w) => Math.abs(w - colW) < 1.5)), m.slice(0, 4).map((x) => x.widths.slice(0, -1).map((w) => (w - colW).toFixed(1)).join(' ')).join(' | '));
  check('editor: the last line of a paragraph is not stretched', m.every((x) => x.inLast === 0), m.map((x) => x.inLast).join());
  check('editor: Latin text at the highest level is plain justify (no tatweel)', m[4].kashCount === 0 && m[4].jk === 'high');
  check('editor: the displayed text holds no tatweel (textContent and innerText)', m.every((x) => !x.text.includes('ـ') && !x.inner.includes('ـ')));
  const copied = await page.evaluate((pp) => { const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="ar"] [data-p="${pp}/3"]`); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); return getSelection().toString(); }, PP);
  check('editor: a selection (copy) holds no tatweel', copied.length > 100 && !copied.includes('ـ'));
  const stored = () => page.evaluate(() => JSON.stringify(window.BW.M[window.BW.S.svc]));
  check('editor: the stored data holds no tatweel', !(await stored()).includes('ـ'));

  // the tools: all four exist, are keyboard reachable buttons, and one press is one undo step
  await page.waitForFunction(() => document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.ribbon .rb-tab'));
  await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('#rb-tab-para').click());
  await page.waitForTimeout(500);
  const tools = await page.evaluate(() => ['fmtJustify', 'fmtJustifyLow', 'fmtJustifyMedium', 'fmtJustifyHigh'].map((id) => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector(`.ribbon .rb-panel [data-a="${id}"]`); return !!b && b.tagName === 'BUTTON' && !!b.querySelector('svg') && b.textContent.trim().length > 2 && b.tabIndex >= -1; }));
  check('editor: Justify, Low, Medium and High are ribbon buttons with an icon and a name (Paragraph tab)', tools.every(Boolean), tools.join());
  await page.focus('#bw-ui-host');
  const P = `${PP}/0`;
  const get = (p) => page.evaluate((p) => { const B = window.BW; let o = B.M[B.S.svc][B.S.ed].doc; for (const k of p.split('/').slice(1)) o = o[k]; return o; }, p);
  const ops = () => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
  await page.evaluate((p) => { window.BW.S.ed = 'ar'; const F = window.BW.EXT.w2format; F.select({ path: p, ed: 'ar', start: 0, end: 4 }); }, P);
  for (const [id, want] of [['fmtJustifyLow', 'justify-low'], ['fmtJustifyMedium', 'justify-medium'], ['fmtJustifyHigh', 'justify-high'], ['fmtJustify', 'justify']]) {
    const n0 = await ops();
    await page.evaluate((id) => window.BW.runAction(id), id);
    const leaf = await get(P);
    check(`editor: ${id} stores align "${want}" in ONE op`, leaf?.style?.align === want && (await ops()) === n0 + 1, JSON.stringify(leaf?.style));
  }
  await page.evaluate(() => window.BW.runAction('fmtJustifyHigh'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.BW.EXT.w2format.kashida());
  m = await measure();
  check('editor: pressing High on a plain paragraph draws the stretch live', m[0].jk === 'high' && m[0].kashCount > 0 && m[0].widths.slice(0, -1).every((w) => Math.abs(w - colW) < 1.5), `${m[0].jk} ${m[0].kashCount}`);
  await page.evaluate(() => window.BW.undo());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.BW.EXT.w2format.kashida());
  m = await measure();
  check('editor: one undo restores the previous alignment and removes the stretch', (await get(P)).style.align === 'justify' && m[0].kashCount === 0 && m[0].jk === '', `${(await get(P)).style.align} ${m[0].kashCount}`);
  check('editor: the data still holds no tatweel after the tools', !(await stored()).includes('ـ'));

  // the shortcut
  await page.evaluate((p) => { window.BW.EXT.w2format.select({ path: p, ed: 'ar', start: 0, end: 4 }); const el = document.querySelector(`#bw-pair main.bw-doc[data-locale="ar"] [data-p="${p}"]`); el.focus(); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); }, `${PP}/1`);
  await page.keyboard.press('Control+j');
  await page.waitForTimeout(200);
  check('editor: Ctrl+J justifies the paragraph (plain)', (await get(`${PP}/1`))?.style?.align === 'justify', JSON.stringify((await get(`${PP}/1`))?.style));

  // width changes: the stretch is recomputed, lines stay flush
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.BW.EXT.w2format.kashida());
  m = await measure();
  const w2 = Math.max(...m[3].widths);
  check('editor: after a resize the stretched paragraph is flush again', m[3].kashCount > 0 && m[3].widths.slice(0, -1).every((w) => Math.abs(w - w2) < 1.5), m[3].widths.map((w) => (w - w2).toFixed(1)).join(' '));

  // performance: 300 stretched paragraphs
  const perf = await page.evaluate(() => {
    const main = document.querySelector('#bw-pair main.bw-doc[data-locale="ar"]');
    const src = main.querySelector('[data-jk="high"]');
    const box = document.createElement('div');
    for (let i = 0; i < 300; i += 1) { const c = src.cloneNode(true); c.querySelectorAll('i.bw-k').forEach((k) => k.remove()); c.removeAttribute('data-p'); box.appendChild(c); }
    src.parentNode.appendChild(box);
    const t0 = performance.now();
    const rev = window.BW.EXT.w2format.kashida();
    const ms = performance.now() - t0;
    const n = box.querySelectorAll('i.bw-k').length;
    box.remove();
    return { ms, n, rev };
  });
  check('editor: 300 stretched paragraphs are done in under 2.5 s (one layout read, one write)', perf.n > 1000 && perf.ms < 2500, `${perf.n} marks, ${perf.ms.toFixed(0)} ms, ${JSON.stringify(perf.rev)}`);
  check('editor: no page error', errors.length === 0, errors.join('; '));
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
S.finish();
