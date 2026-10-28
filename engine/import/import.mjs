// Import a DOCX or PDF as a new document (A2, 0.13.0): text → items → chapters / sections / prose / table blocks.
// PDF: pdftotext -layout -enc UTF-8 (poppler or xpdf; never pymupdf for Arabic, house rule). DOCX: engine/import/docx_items.py
// through uv (python-docx). Headings come from Heading styles (DOCX) or a numbering pattern ("2", "2.1", "٢.١").
//
//   importFile(file, {locale?, name?}) → {doc, locale, words}
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { py } from '../py.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const latin = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
const NUMBERED = /^\s*([0-9٠-٩]+(?:\.[0-9٠-٩]+)*)[.)]?\s+(\S.{0,150})$/;
const heading = (s) => { const m = NUMBERED.exec(s); return m && s.length < 120 && !/[.،:;]$/.test(s) ? { h: latin(m[1]).split('.').length, number: latin(m[1]), text: m[2].trim() } : null; };

/** pdftotext's UTF-8 text. BW_PDFTOTEXT names the binary. */
export function pdfText(file) {
  const r = spawnSync(process.env.BW_PDFTOTEXT || 'pdftotext', ['-layout', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`pdftotext failed: ${(r.stderr || r.error?.message || '').slice(0, 200)}`);
  return r.stdout;
}
export const words = (s) => (String(s).match(/\S+/g) || []).length;

/** PDF text → items: blank lines split paragraphs, form feeds are pages, a numbered short line is a heading. */
export function pdfItems(text) {
  const items = [];
  let para = [];
  const flush = () => { if (para.length) items.push({ p: para.join(' ') }); para = []; };
  for (const raw of text.replace(/\f/g, '\n\n').split(/\r?\n/)) {
    const line = raw.replace(/\s{2,}/g, ' ').trim();
    if (!line) { flush(); continue; }
    const h = heading(line);
    if (h) { flush(); items.push(h); continue; }
    para.push(line);
  }
  flush();
  return items;
}

/** DOCX → items through python-docx (uv); a numbered short paragraph with no Heading style is a heading too. */
export function docxItems(file) {
  const [cmd, args] = py([path.join(HERE, 'docx_items.py'), file], ['python-docx']);
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
  if (r.status !== 0) throw new Error(`docx import failed: ${(r.stderr || r.error?.message || '').slice(-300)}`);
  return JSON.parse(r.stdout).items.map((it) => (it.p && heading(it.p)) || it);
}

const L = {
  ar: { prefix: 'وثيقة متطلبات الخدمة', intro: 'المحتوى المستورد', review: 'راجع البنية المستوردة: العناوين والجداول مستخرجة آلياً من الملف.', owner: 'محرر الوثيقة', type: 'وثيقة متطلبات', status: 'مسودة' },
  en: { prefix: 'Service requirements', intro: 'Imported content', review: 'Review the imported structure: headings and tables were extracted automatically from the file.', owner: 'Document editor', type: 'Requirements document', status: 'Draft' },
};

/** Items → a document the editor opens (engine/render.mjs shape), with one open question to review the structure. */
export function itemsToDoc(items, { locale = 'ar', name = 'document' } = {}) {
  const l = L[locale] || L.ar;
  const chapters = [];
  let ch = null, sec = null;
  const chapter = (title, number) => { ch = { number: number || String(chapters.length + 1), title, sections: [] }; chapters.push(ch); sec = null; };
  const section = (title, number) => { if (!ch) chapter(l.intro); sec = { number: number || `${ch.number}.${ch.sections.length + 1}`, title, blocks: [] }; ch.sections.push(sec); };
  const here = () => { if (!sec) section(ch ? ch.title : l.intro); return sec; };
  for (const it of items) {
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
  const title = String(name).replace(/\.[^.]+$/, '').trim() || 'document';
  return {
    service: `import-${title}`.slice(0, 60),
    composedAt: new Date().toISOString(),
    control: { documentId: `BW-IMPORT-${Date.now().toString(36).toUpperCase()}`, title: `${l.prefix}: ${title}`, documentType: l.type, owner: l.owner, version: 'V0.1', status: l.status, issuedOn: '' },
    revisions: [], approvals: [], chapters,
    openQuestions: [{ id: 'Q-01', question: l.review, owner: l.owner, blocks: '' }],
  };
}

/** A .pdf or .docx on disk → {doc, locale, words}; the locale follows the text (more Arabic letters than Latin → ar) unless given. */
export function importFile(file, { locale, name } = {}) {
  const ext = path.extname(file).toLowerCase();
  let items, text;
  if (ext === '.pdf') { text = pdfText(file); items = pdfItems(text); }
  else if (ext === '.docx') { items = docxItems(file); text = items.map((i) => i.text || i.p || (i.table || []).flat().join(' ')).join('\n'); }
  else throw Object.assign(new Error('import: .pdf or .docx'), { code: 400 });
  const loc = locale || ((text.match(/[؀-ۿ]/g) || []).length > (text.match(/[A-Za-z]/g) || []).length ? 'ar' : 'en');
  return { doc: itemsToDoc(items, { locale: loc, name: name || path.basename(file) }), locale: loc, words: words(text) };
}
