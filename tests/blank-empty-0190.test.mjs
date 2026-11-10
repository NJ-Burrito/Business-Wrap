// 0.19.0 (crew N2) · the Blank document is ONE EMPTY PAGE (owner rule 2026-11-10): no cover, no headings, no placeholder text, no sample sections,
// in the Business-Wrap theme, ready to type on; Arabic and English editions. Design: work/sdlc/design/0190-n2.md.
//   1. the contract: type.json `empty: true`, the validator accepts the real type and REFUSES an empty type that prints something (planted faults)
//   2. compose + renderDocument (no browser): no cover, no h1-h4, no table, none of the five parts, one empty editable paragraph, no visible text
//   3. PDF (real Chrome): exactly one page, no text but digits (theme chrome: the folio); DOCX (python-docx): a real zip, no text at all
//   4. the editor (the shipped bundle's build, real headless Chrome tagged bw-1109): Blank from the start page, no cover and no heading on the page,
//      a click and typing put the text on page 1 (the document model holds it), Enter makes a second paragraph in both editions, the name is the
//      type's name in the library, no page error
//   node tests/run.mjs blank-empty-0190
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, i18n, REPO } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';
import * as CHK from '../tools/doctypes/check.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  blank-empty-0190: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-blank-empty-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
process.env.BW_WORKSPACE ||= path.join(tmp, 'ws');
const j = (x) => JSON.stringify(x);
const theme = loadTheme();
const labels = i18n().doc;
const ARABIC = /[؀-ۿ]/;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const PARTS = ['cover', 'control', 'revisions', 'toc', 'questions'];

/** The parts of a zip as {name: Buffer} (central directory, node's zlib only). */
function unzip(file) {
  const b = fs.readFileSync(file);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const parts = {};
  for (let i = 0; i < n; i += 1) {
    if (b.readUInt32LE(p) !== 0x02014b50) return null;
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    const lo = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
    const raw = b.subarray(lo, lo + csize);
    parts[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
    p += 46 + nl + el + cl;
  }
  return parts;
}

// ───────── 1. the contract ─────────
const t = DT.listTypes().find((x) => x.id === 'blank');
const dirBlank = path.join(REPO, 'templates', '_doctypes', 'blank');
const rd = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
check('the registry type blank is an empty type (type.json empty: true) that hides all five parts', !!t && t.empty === true && PARTS.every((k) => (t.layout?.hide || []).includes(k)), j(t));
check('the validator accepts the real blank type with no error and no warning', (() => { const r = CHK.validateType('blank'); return r.errors.length === 0 && r.warnings.length === 0; })(), j(CHK.validateType('blank').errors));
check('the start page payload keeps its C2 shape and carries the composed empty documents (tiny, one bare chapter)', (() => { const pb = DT.payload().types.find((x) => x.id === 'blank'); return !!pb && !('empty' in pb) && DT.EDITIONS.every((ed) => pb.docs[ed].length < 1200 && JSON.parse(pb.docs[ed]).chapters[0].bare === true); })());

/** A copy of the real blank type in a throw-away root with one planted fault: mut(type, en, ar). */
function planted(mut) {
  const root = path.join(tmp, `plant-${Math.random().toString(36).slice(2, 8)}`);
  const d = path.join(root, 'templates', '_doctypes');
  fs.mkdirSync(path.join(d, 'blank'), { recursive: true });
  for (const f of ['_categories.json', '_palettes.json', 'schema.json']) fs.copyFileSync(path.join(REPO, 'templates', '_doctypes', f), path.join(d, f));
  const ty = rd(path.join(dirBlank, 'type.json')), en = rd(path.join(dirBlank, 'en.json')), ar = rd(path.join(dirBlank, 'ar.json'));
  mut(ty, en, ar);
  fs.writeFileSync(path.join(d, 'blank', 'type.json'), j(ty));
  fs.writeFileSync(path.join(d, 'blank', 'en.json'), j(en));
  fs.writeFileSync(path.join(d, 'blank', 'ar.json'), j(ar));
  return CHK.validateType('blank', { root });
}
const refuses = (name, mut, re) => { const r = planted(mut); check(`the validator refuses an empty type that ${name}`, r.errors.some((e) => re.test(e)), j(r.errors)); };
refuses('shows the cover', (ty) => { ty.layout.hide = ty.layout.hide.filter((x) => x !== 'cover'); }, /hides «cover»/);
refuses('shows the contents', (ty) => { ty.layout.hide = ty.layout.hide.filter((x) => x !== 'toc'); }, /hides «toc»/);
refuses('has a chapter heading', (ty, en) => { en.chapters[0].title = 'Chapter 1'; }, /no title/);
refuses('has a chapter that is not bare', (ty, en) => { delete en.chapters[0].bare; }, /bare/);
refuses('holds sample text', (ty, en) => { en.chapters[0].sections[0].blocks[0].paragraphs = ['Write here']; }, /one empty paragraph/);
refuses('holds a second block', (ty, en) => { en.chapters[0].sections[0].blocks.push({ kind: 'subhead', text: '' }); }, /one empty paragraph/);
refuses('holds a second chapter (Arabic side)', (ty, en, ar) => { ar.chapters.push({ bare: true, number: '2', title: '', sections: [] }); }, /exactly one skeleton chapter/);
refuses('prints the default running band (no chrome)', (ty, en) => { delete en.chrome; }, /chrome is required/);
refuses('prints a header item', (ty, en) => { en.chrome.header.items = [{ id: 'h', kind: 'field', value: 'documentId', align: 'center', scope: 'all' }]; }, /header band prints nothing/);
refuses('prints a footer item other than the page number', (ty, en) => { en.chrome.footer.items.push({ id: 'f', kind: 'field', value: 'confidentiality', align: 'start', scope: 'all' }); }, /only the page number/);
refuses('carries a title with a placeholder part', (ty, en) => { en.control.title = 'Blank document: Document title'; }, /control\.title is the type's name/);
refuses('differs between Arabic and English (pair shape)', (ty, en) => { en.chapters[0].sections[0].blocks[0].paragraphs.push(''); }, /pair shape differs|one empty paragraph/);
check('a type that is not marked empty keeps every content rule (a chapter without title is still refused)', (() => { const r = planted((ty, en, ar) => { delete ty.empty; }); return r.errors.some((e) => /no title|control\.title must end|revisions needs/.test(e)); })());

// ───────── 2. compose + render, no browser ─────────
for (const ed of DT.EDITIONS) {
  const doc = DT.compose('blank', ed);
  const html = renderDocument(doc, { locale: ed, labels: labels[ed], theme, fontCss: '', logos: theme.logos });
  const body = html.slice(html.indexOf('<main'), html.indexOf('<template class="bw-run"') > 0 ? html.indexOf('<template class="bw-run"') : undefined);
  const text = body.replace(/<[^>]*>/g, '').replace(BIDI, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, '');
  check(`${ed}: composed, the document is the empty skeleton (one bare chapter, one section, one empty paragraph, no title text)`, doc.docType === 'blank' && doc.chapters.length === 1 && doc.chapters[0].bare === true && j(doc.chapters[0].sections[0].blocks) === j([{ kind: 'prose', paragraphs: [''] }]), j(doc.chapters));
  check(`${ed}: the control and the name are the type's own (no «: placeholder», no sample values)`, doc.control.title === t.name[ed] && doc.control.documentType === t.name[ed] && doc.control.preparedBy === '' && doc.control.owner === '', j(doc.control));
  check(`${ed}: the page has no cover, no heading h1-h4, no table, no image, none of the control / revisions / contents / questions parts`, !/class="cover"|data-part="cover"/.test(html) && !/<h[1-4][\s>]/.test(body) && !/<table/.test(body) && !/<(img|svg|figure|image|canvas)[\s>]/.test(body) && !/data-part="(control|revisions|toc|questions)"/.test(body), body.slice(0, 300));
  check(`${ed}: the body holds exactly one editable empty paragraph and no visible text at all`, (body.match(/<p /g) || []).length === 1 && /<p [^>]*data-p="\/chapters\/0\/sections\/0\/blocks\/0\/paragraphs\/0"[^>]*><br><\/p>/.test(body) && text === '', `${(body.match(/<p /g) || []).length} paragraphs; text «${text.slice(0, 60)}»`);
  check(`${ed}: the page prints no running header item and only the page number in the footer`, !/data-ci="header:/.test(html) && (html.match(/data-ci="footer:\d+"/g) || []).length === 1 && /data-bw-page/.test(html));
  check(`${ed}: the document stays in its own language and carries no Arabic in the English edition`, ed === 'ar' ? ARABIC.test(doc.control.title) : !ARABIC.test(j(doc)));
}

// ───────── 3. PDF and DOCX through the real exporters ─────────
const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
const errors = [];
try {
  process.env.BW_FONT_NORM_DIR = path.join(tmp, 'norm');
  for (const ed of DT.EDITIONS) {
    const doc = DT.compose('blank', ed);
    const base = path.join(tmp, `blank.${ed}`);
    let pdfErr = '', docxErr = '';
    try { await exportPdf(doc, { locale: ed, theme, pdfPath: base + '.pdf', browser }); } catch (e) { pdfErr = e.message; }
    try { exportDocx(doc, { locale: ed, theme, docxPath: base + '.docx' }); } catch (e) { docxErr = e.message; }
    const info = pdfErr ? '' : run('pdfinfo', [base + '.pdf']).stdout;
    const txt = pdfErr ? '' : run('pdftotext', ['-enc', 'UTF-8', base + '.pdf', '-']).stdout.replace(BIDI, '');
    check(`${ed}: the PDF exports and has exactly one page`, !pdfErr && /Pages:\s+1\s*$/m.test(info), pdfErr || info.split('\n').filter((l) => /Pages/.test(l)).join());
    const imgs = pdfErr ? '' : run('pdfimages', ['-list', base + '.pdf']).stdout;
    check(`${ed}: the PDF has one page, no image and no body text (letters: none)`, !pdfErr && /Pages:\s+1\s*$/m.test(info) && imgs.split(/\r?\n/).filter((l) => /^\s*\d+\s/.test(l)).length === 0 && !/\p{L}/u.test(txt), imgs.slice(0, 120));
    check(`${ed}: the PDF carries no text but digits (the folio is the only theme chrome)`, !pdfErr && txt.replace(/[\s\f\d]/g, '') === '', JSON.stringify(txt.slice(0, 80)));
    const parts = docxErr ? null : unzip(base + '.docx');
    const xml = parts?.['word/document.xml']?.toString('utf8') || '';
    const wt = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('');
    check(`${ed}: the DOCX exports, opens as a zip with word/document.xml`, !docxErr && !!parts && xml.length > 200, docxErr);
    check(`${ed}: the DOCX holds no text at all (no cover, heading or paragraph text)`, !!xml && wt.replace(/\s/g, '') === '', JSON.stringify(wt.slice(0, 80)));
    const heads = (xml.match(/<w:pStyle w:val="Heading\d"/g) || []).length;
    const sects = (xml.match(/<w:sectPr[\s>]/g) || []).length;
    const bands = Object.entries(parts || {}).filter(([n]) => /^word\/(header|footer)\d*\.xml$/.test(n)).map(([, b]) => [...b.toString('utf8').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join('')).join('');
    check(`${ed}: the DOCX has no table and no image in the body`, !!xml && !/<w:tbl[\s>]/.test(xml) && !/<w:drawing[\s>]|<w:pict[\s>]|<pic:pic/.test(xml), j({ tbl: (xml.match(/<w:tbl[\s>]/g) || []).length, drawing: (xml.match(/<w:drawing/g) || []).length }));
    check(`${ed}: the DOCX has no heading paragraph, ONE section (no leading blank page) and no header or footer text`, !!xml && heads === 0 && sects === 1 && bands.replace(/\s/g, '') === '', j({ heads, sects, bands }));
  }

  // ───────── 4. the editor, real headless Chrome ─────────
  const bundle = path.join(tmp, 'business-wrap.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'blank'), path.join(REPO, 'samples', 'event-permit')], out: bundle, set: 'business-wrap', localFonts: true, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark'), ui: 'ar', docTypes: true });
  const D = 'dialog.bw-start';
  for (const ui of ['en', 'ar']) {
    for (const want of ['en', 'ar']) {
      const tag = `UI ${ui.toUpperCase()}, edition ${want.toUpperCase()}`;
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript((u) => { try { if (!sessionStorage.getItem('bw-e2e-seen')) { sessionStorage.setItem('bw-e2e-seen', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', '0'); localStorage.setItem('bw:wm-intro', '1'); localStorage.removeItem('bw:start-pins'); localStorage.removeItem('bw:start'); sessionStorage.setItem('bw:wm-welcome', '1'); } } catch { /* storage denied */ } }, ui);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|favicon|Failed to load resource/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
      try {
        await page.goto(pathToFileURL(bundle).href + '?start=1');
        await page.waitForFunction(() => window.BW?.ready, null, { timeout: 60000 });
        await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 }); // R15: the start page is open before anything is probed
        await page.evaluate(() => document.fonts.ready);
        await page.locator(`${D} .st-tile[data-type="blank"]`).click();
        await page.locator(`${D} [data-st-pl="${want}"]`).click();
        await page.locator(`${D} [data-st-a="create"]`).click();
        await page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });
        await page.waitForFunction(() => window.BW.EXT.library.isDoc(window.BW.S.svc) && window.BW.M[window.BW.S.svc][window.BW.S.ed]?.doc?.docType === 'blank', null, { timeout: 15000 });
        const P = `#bw-pair main.bw-doc[data-locale="${want}"]`;
        await page.waitForSelector(`${P} section.chapter`, { timeout: 10000 });
        await page.waitForTimeout(400);
        const seen = await page.evaluate((p) => {
          const B = window.BW, m = document.querySelector(p);
          return { ed: B.S.ed, name: B.EXT.library.titleOf(B.S.svc, B.S.ed), covers: m.querySelectorAll('.cover').length, heads: m.querySelectorAll('h1,h2,h3,h4').length, tables: m.querySelectorAll('table').length, imgs: m.querySelectorAll('img,svg,figure,canvas').length, paras: m.querySelectorAll('p[data-p]').length, text: m.innerText.replace(/\s+/g, ''), editions: Object.keys(B.M[B.S.svc]).sort().join() };
        }, P);
        check(`${tag}: the new Blank document opens on the ${want} edition, both editions exist, and the library name is the type's name`, seen.ed === want && seen.editions === 'ar,en' && seen.name === t.name[want], j(seen));
        check(`${tag}: the page shows no cover, no heading, no table, no image, one empty paragraph and no text`, seen.covers === 0 && seen.heads === 0 && seen.tables === 0 && seen.imgs === 0 && seen.paras === 1 && seen.text === '', j(seen));

        // click and type: the text lands on page 1 and in the document
        const first = page.locator(`${P} p[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]`);
        await first.click();
        const word = want === 'ar' ? 'نص أول' : 'First words';
        await page.keyboard.type(word);
        await page.waitForTimeout(250);
        const typed = await page.evaluate(([p, ed]) => {
          const B = window.BW, el = document.querySelector(`${p} p[data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]`);
          const r = el.getBoundingClientRect(), m = document.querySelector(p).getBoundingClientRect();
          const pageH = 297 * 96 / 25.4;
          return { dom: el.innerText.trim(), model: B.M[B.S.svc][ed].doc.chapters[0].sections[0].blocks[0].paragraphs, topOnPage: Math.round(r.top - m.top), pageH: Math.round(pageH), heads: document.querySelector(p).querySelectorAll('h1,h2,h3,h4').length };
        }, [P, want]);
        check(`${tag}: a click and typing put the text on page 1 and in the document`, typed.dom === word && j(typed.model) === j([word]) && typed.topOnPage >= 0 && typed.topOnPage < typed.pageH && typed.heads === 0, j(typed));

        // Enter: a new paragraph in this edition, an empty placeholder in the other (the pair keeps its shape)
        await page.keyboard.press('Enter');
        await page.keyboard.type(want === 'ar' ? 'سطر ثان' : 'Second line');
        await page.waitForTimeout(250);
        const two = await page.evaluate((ed) => {
          const B = window.BW, o = ed === 'ar' ? 'en' : 'ar';
          const ps = (e) => B.M[B.S.svc][e].doc.chapters[0].sections[0].blocks[0].paragraphs;
          return { own: ps(ed), other: ps(o), docsHead: document.querySelectorAll(`#bw-pair main.bw-doc[data-locale="${ed}"] h1, #bw-pair main.bw-doc[data-locale="${ed}"] h2`).length };
        }, want);
        check(`${tag}: Enter makes a second paragraph, the other edition keeps the same shape, still no heading`, two.own.length === 2 && two.own[1] === (want === 'ar' ? 'سطر ثان' : 'Second line') && two.other.length === 2 && two.docsHead === 0, j(two));
      } catch (e) {
        check(`${tag}: the editor checks ran without an exception`, false, e.stack || e.message);
      }
      await ctx.close();
    }
  }
  check('no page error from first paint to the end (all editor contexts)', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('suite ran without an exception', false, (e && e.stack) || e);
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nblank-empty-0190: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
