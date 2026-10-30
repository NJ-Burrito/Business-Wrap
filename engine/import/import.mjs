// Import a DOCX, PDF or HTML as a new document (A2, 0.13.0): text → items → chapters / sections / prose / table blocks.
// PDF: pdftotext -layout -enc UTF-8 (poppler or xpdf; never pymupdf for Arabic, house rule), the title from pdfinfo.
// DOCX: engine/import/docx_items.py through uv (python-docx). HTML: h1–h6 / p / li / table read here.
// Headings come from Heading styles or tags, or a numbering pattern ("2", "2.1", "٢.١", glued "2.1وصف" as pdftotext gives it).
// The title is the document's own: its metadata title, its control-table «عنوان الوثيقة» row, its Title paragraph, else its
// first cover line; the file name only when the document carries none. The front matter (cover, control table, contents)
// before the first chapter is not imported as a chapter: the editor builds those itself.
//
//   importFile(file, {locale?, name?}) → {doc, locale, words}
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { py } from '../py.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const latin = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const BIDI = /[‎‏‪-‮⁦-⁩﻿]/g;
const clean = (s) => String(s || '').replace(BIDI, '').replace(/ /g, ' ');
const NUMBERED = /^\s*([1-9١-٩][0-9٠-٩]?(?:\.[0-9٠-٩]{1,2})*)[.)]?\s*([^\d\s.,،:;)(%+\-/].{0,150})$/;
const heading = (s) => { s = clean(s).trim(); const m = NUMBERED.exec(s); return m && s.length < 120 && words(m[2]) <= 9 && !/[.،:;]$/.test(s) ? { h: latin(m[1]).split('.').length, number: latin(m[1]), text: m[2].trim() } : null; };
const TOC = /^(جدول المحتويات|المحتويات|الفهرس|table of contents|contents)$/i;
/** A heading's letters only (no digits, dots, spaces), its first 24: a contents row and the body heading compare by it. */
const tocKey = (s) => clean(s).replace(/[^\p{L}]+/gu, '').toLowerCase().slice(0, 24);
const TITLE_ROW = /^(عنوان الوثيقة|document title|title)$/i;

/** pdftotext's UTF-8 text. BW_PDFTOTEXT names the binary. */
export function pdfText(file) {
  const r = spawnSync(process.env.BW_PDFTOTEXT || 'pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`pdftotext failed: ${(r.stderr || r.error?.message || '').slice(0, 200)}`);
  return r.stdout;
}
/** The PDF's Info «Title» (pdfinfo, poppler or xpdf; BW_PDFINFO names the binary), '' when there is none or no pdfinfo. */
export function pdfTitle(file) {
  const r = spawnSync(process.env.BW_PDFINFO || 'pdfinfo', ['-enc', 'UTF-8', file], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? clean(/^Title:\s*(.*)$/m.exec(r.stdout || '')?.[1] || '').trim() : '';
}
export const words = (s) => (String(s).match(/\S+/g) || []).length;

/** PDF text → items. Per page (form feeds): the running header and footer (a line on most pages, digits ignored) and the
 *  contents pages are dropped; a line split by 3+ spaces is cells, 2+ such lines in a row are a table (right to left in
 *  Arabic); a numbered short line or cell is a heading; blank lines split paragraphs. */
export function pdfItems(text, { rtl = false } = {}) {
  const pages = clean(text).split('\f').map((p) => p.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')));
  const key = (l) => l.replace(/[0-9٠-٩]+/g, '#').replace(/\s+/g, ' ').trim();
  const seen = {};
  for (const p of pages) for (const k of new Set(p.map(key).filter(Boolean))) seen[k] = (seen[k] || 0) + 1;
  const used = pages.filter((p) => p.some((l) => l.trim())).length;
  const running = (l) => used >= 3 && seen[key(l)] >= Math.max(2, used * 0.5);
  const items = [], toc = new Set();
  let para = [], rows = [], tail = false, lastCh = 0; // tail: the contents may run on at the top of the next page
  const flush = () => { if (para.length) items.push({ p: para.join(' ') }); para = []; };
  const bare = (c) => /^[0-9٠-٩]+(\.[0-9٠-٩]+)*$/.test(c);
  const tocRow = (cells) => { const h = cells.length === 1 ? heading(cells[0]) : cells.length === 2 && cells.some(bare) ? { text: cells.find((c) => !bare(c)) || '' } : null; return h && tocKey(h.text).length > 2 ? tocKey(h.text) : null; };
  const flushRows = () => { if (rows.length >= 2) { flush(); items.push({ table: rows }); } else for (const r of rows) para.push(r.join(' ')); rows = []; };
  for (const page of pages) {
    const lines = page.filter((l) => l.trim() && !running(l));
    const heads = lines.filter((l) => l.trim().split(/\s{3,}/).some((c) => heading(c)));
    // a page of mostly headings with no contents title: the contents running on (read as contents rows until a heading comes twice)
    if (heads.length >= 4 && heads.length >= lines.length * 0.6) tail = true;
    if (lines.some((l) => TOC.test(l.trim()))) { // contents: kept as the list of real headings
      for (const l of lines) for (const c of l.trim().split(/\s{3,}/)) { const k = tocKey(heading(c)?.text || c); if (k.length > 2) toc.add(k); }
      tail = true;
      continue;
    }
    for (const raw of page) {
      if (running(raw)) continue;
      const line = raw.trim();
      if (!line) { flushRows(); flush(); continue; }
      const cells = line.split(/\s{3,}/);
      if (tail) { const k = tocRow(line.split(/\s{2,}/)); if (k && !toc.has(k)) { toc.add(k); continue; } if (!k && (CODEY.test(line) || /\d\.\d+\S/.test(line))) continue; tail = false; } // contents rows until a heading comes twice
      // poppler before ~24.05 prints a chapter heading as two cells, «title   1» (newer: «1 title»): the next chapter number
      // beside a title that the contents lists is a chapter heading too (a table row «name   3» is not: it must be next in line)
      if (cells.length === 2 && toc.size) {
        const bi = cells.findIndex((c) => /^[1-9١-٩][0-9٠-٩]?$/.test(clean(c).trim()));
        const t = bi < 0 ? '' : clean(cells[1 - bi]).trim();
        const k = tocKey(t);
        if (bi >= 0 && k.length > 2 && !/^[0-9٠-٩\s.]+$/.test(t) && Number(latin(clean(cells[bi]).trim())) === lastCh + 1 && [...toc].some((x) => x.startsWith(k) || k.startsWith(x))) {
          flushRows(); flush();
          lastCh += 1;
          items.push({ h: 1, number: String(lastCh), text: t, line });
          continue;
        }
      }
      const hi = cells.findIndex((c) => heading(c));
      if (hi >= 0 && cells.length <= 2) {
        flushRows(); flush();
        const rest = cells.filter((_, i) => i !== hi).join(' ');
        items.push({ ...heading(cells[hi]), line });
        if (heading(cells[hi]).h === 1 && Number(heading(cells[hi]).number) === lastCh + 1) lastCh += 1;
        if (rest) para.push(rest);
        continue;
      }
      if (cells.length >= 2) { rows.push(rtl ? cells.reverse() : cells); continue; }
      flushRows();
      para.push(line.replace(/\s{2,}/g, ' '));
    }
    flushRows(); flush();
  }
  if (toc.size) items.toc = toc;
  return items;
}

/** DOCX → {items, meta} through python-docx (uv). */
export function docxItems(file) {
  const [cmd, args] = py([path.join(HERE, 'docx_items.py'), file], ['python-docx']);
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
  if (r.status !== 0) throw new Error(`docx import failed: ${(r.stderr || r.error?.message || '').slice(-300)}`);
  const j = JSON.parse(r.stdout);
  // a styled heading keeps its numbering apart ("1   المقدمة" → 1, المقدمة); a numbered plain paragraph is a heading too
  const items = j.items.map((it) => { if (it.h) { const n = heading(it.text); return n ? { ...n, styled: it.h } : { ...it, text: clean(it.text).trim() }; } return (it.p && heading(it.p) && { ...heading(it.p), line: it.p }) || it; });
  return { items, meta: j.meta || {} };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const text = (h) => clean(h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m))).replace(/[ \t]+/g, ' ').trim();
/** HTML → {items, meta}: <title>; h1–h6, p, li, table rows in document order (script, style, nav and the contents table left out). */
export function htmlItems(html) {
  const s = String(html).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|nav|head)\b[\s\S]*?<\/\1>/gi, (m, t) => (t.toLowerCase() === 'head' ? m.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '') : ''));
  const meta = { title: text(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(s)?.[1] || '') };
  const body = s.replace(/<head\b[\s\S]*?<\/head>/i, '');
  const items = [];
  for (const m of body.matchAll(/<(h[1-6]|p|li|caption|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === 'table') {
      if (/\btoc\b/.test(m[2])) continue;
      const rows = [...m[3].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1])));
      if (rows.some((r) => r.length)) items.push({ table: rows.filter((r) => r.length) });
      continue;
    }
    const t = text(m[3]);
    if (!t) continue;
    if (tag[0] === 'h') { const n = heading(t); items.push(n ? { ...n, styled: Number(tag[1]) } : { h: Number(tag[1]), text: t }); } else items.push({ p: t });
  }
  return { items, meta };
}

/**
 * Items → structure: numbered headings must follow on (chapter n+1 after n, n.k inside chapter n), else they are text
 * (a "10 ميجابايت" cell is not chapter 10); a lone top heading before deeper ones is the title; levels shift so the top
 * one is a chapter; what comes before the first chapter is the front matter.
 */
export function structure(items) {
  let ch = 0, sec = 0;
  const numbered = items.some((i) => i.number && i.h === 1);
  const out = [];
  for (const it of items) {
    if (!it.number) { out.push(it); continue; }
    const [a, b] = it.number.split('.').map(Number);
    if (items.toc && ![...items.toc].some((k) => k.startsWith(tocKey(it.text)) || tocKey(it.text).startsWith(k))) out.push({ p: it.line || `${it.number} ${it.text}` }); // not in the contents: text
    else if (it.h === 1 && a > ch && a <= ch + 2) { ch = a; sec = 0; out.push(it); }
    else if (it.h >= 2 && a === ch && b > sec && b <= sec + 3) { sec = b; out.push({ ...it, h: 2 }); }
    else out.push({ p: it.line || `${it.number} ${it.text}` });
  }
  // levels: unnumbered headings by their style; the smallest level in use is the chapter
  const hs = out.filter((i) => i.h && !i.number);
  const lone = hs.length > 1 && hs.filter((i) => i.h === hs[0].h).length === 1 && hs.slice(1).every((i) => i.h > hs[0].h) && !numbered;
  if (lone) { const t = hs[0]; out.splice(out.indexOf(t), 1, { title: t.text }); }
  const min = Math.min(...out.filter((i) => i.h && !i.number).map((i) => i.h));
  const levelled = out.map((i) => (i.h && !i.number ? { ...i, h: i.h - min + 1 > 1 ? 2 : 1 } : i));
  // the front matter: everything before the first chapter; with numbered chapters, an unnumbered heading before chapter 1 too
  const first = levelled.findIndex((i) => i.h === 1 && (!numbered || i.number));
  return first > 0 ? { front: levelled.slice(0, first), body: levelled.slice(first) } : { front: [], body: levelled };
}

const JUNK = /^(untitled|microsoft word|document\d*|sample|بدون عنوان)\b/i;
const CODEY = /^[\sA-Z0-9_.:\-/،,]*$|^\d{4}-\d\d-\d\d/; // a code, a date or a version line on a cover
/** "<prefix>: <name>" → <name> (the editor's docTitle rule). */
const nameOf = (t) => { const s = clean(t).trim(); return (s.split(/\s*[:—]\s+/).slice(1).join(': ') || s).trim(); };
/** The document's own title: metadata, the «عنوان الوثيقة» row, a Title paragraph, the first cover line; '' when none. */
export function titleOf(front, meta = {}, all = front) {
  if (meta.title && !JUNK.test(meta.title)) return meta.title;
  for (const it of all) for (const r of it.table || []) if (r.length >= 2 && TITLE_ROW.test(clean(r[0]).trim()) && clean(r[1]).trim()) return clean(r[1]).trim();
  const t = all.find((i) => i.title)?.title;
  if (t) return t;
  for (const it of front) {
    const lines = it.p ? [it.p] : it.text ? [it.text] : (it.table || []).flat().flatMap((c) => String(c).split(/\n+/));
    const ln = lines.map((l) => clean(l).trim()).find((l) => l.length > 2 && !CODEY.test(l) && !TOC.test(l));
    if (ln) return ln;
  }
  return '';
}

const L = {
  ar: { prefix: 'وثيقة متطلبات الخدمة', intro: 'المحتوى المستورد', review: 'راجع البنية المستوردة: العناوين والجداول مستخرجة آلياً من الملف.', front: 'لم تُستورد الصفحات التي تسبق الفصل الأول (الغلاف وضبط الوثيقة والمحتويات): يبنيها المحرر.', owner: 'محرر الوثيقة', type: 'وثيقة متطلبات', status: 'مسودة' },
  en: { prefix: 'Service requirements', intro: 'Imported content', review: 'Review the imported structure: headings and tables were extracted automatically from the file.', front: 'The pages before the first chapter (cover, document control, contents) were not imported: the editor builds them.', owner: 'Document editor', type: 'Requirements document', status: 'Draft' },
};

/** Items → a document the editor opens (engine/render.mjs shape), with one open question to review the structure. */
export function itemsToDoc(items, { locale = 'ar', name = 'document', meta = {} } = {}) {
  const l = L[locale] || L.ar;
  const { front, body } = structure(items);
  const chapters = [];
  let ch = null, sec = null;
  const chapter = (title, number) => { ch = { number: number || String(chapters.length + 1), title, sections: [] }; chapters.push(ch); sec = null; };
  const section = (title, number) => { if (!ch) chapter(l.intro); sec = { number: number || `${ch.number}.${ch.sections.length + 1}`, title, blocks: [] }; ch.sections.push(sec); };
  const here = () => { if (!sec) section(ch ? ch.title : l.intro); return sec; };
  for (const it of body) {
    if (it.title) continue;
    if (it.h === 1) chapter(it.text, it.number);
    else if (it.h) section(it.text, it.number);
    else if (it.table) { const [head, ...rows] = it.table; here().blocks.push({ kind: 'table', columns: rows.length ? head : [], rows: rows.length ? rows : [head] }); }
    else if (it.p) { const s = here(); const b = s.blocks.at(-1); if (b?.kind === 'prose') b.paragraphs.push(it.p); else s.blocks.push({ kind: 'prose', paragraphs: [it.p] }); }
  }
  if (!chapters.length) section(l.intro);
  for (const c of chapters) {
    if (!c.sections.length) c.sections.push({ number: `${c.number}.1`, title: c.title, blocks: [] });
    for (const s of c.sections) if (!s.blocks.length) s.blocks.push({ kind: 'prose', paragraphs: [''] });
  }
  const own = titleOf(front, meta, items);
  const cover = nameOf(own) || String(name).replace(/\.[^.]+$/, '').trim() || 'document';
  const full = own && /\s[:—]\s|:\s/.test(own) ? clean(own).trim() : `${l.prefix}: ${cover}`;
  return {
    service: `import-${cover}`.slice(0, 60),
    composedAt: new Date().toISOString(),
    control: { documentId: `BW-IMPORT-${Date.now().toString(36).toUpperCase()}`, title: full, coverTitle: cover, documentType: l.type, owner: l.owner, version: 'V0.1', status: l.status, issuedOn: '' },
    revisions: [], approvals: [], chapters,
    openQuestions: [{ id: 'Q-01', question: front.length ? `${l.review} ${l.front}` : l.review, owner: l.owner, blocks: '' }],
  };
}

/** A .pdf, .docx or .html on disk → {doc, locale, words}; the locale follows the text (more Arabic letters than Latin → ar) unless given. */
export function importFile(file, { locale, name } = {}) {
  const ext = path.extname(file).toLowerCase();
  const loc = (t) => locale || ((t.match(/[؀-ۿ]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length ? 'ar' : 'en');
  const flat = (items) => items.map((i) => i.title || i.text || i.p || (i.table || []).flat().join(' ')).join('\n');
  let items, text, meta = {}, lc;
  if (ext === '.pdf') { text = pdfText(file); lc = loc(text); items = pdfItems(text, { rtl: lc === 'ar' }); meta = { title: pdfTitle(file) }; }
  else if (ext === '.docx') { ({ items, meta } = docxItems(file)); text = flat(items); lc = loc(text); }
  else if (ext === '.html' || ext === '.htm') { ({ items, meta } = htmlItems(fs.readFileSync(file, 'utf8'))); text = flat(items); lc = loc(text); }
  else throw Object.assign(new Error('import: .pdf, .docx or .html'), { code: 400 });
  return { doc: itemsToDoc(items, { locale: lc, name: name || path.basename(file), meta }), locale: lc, words: words(text) };
}
