// Which file is the document (0.16.3, fix 0163). A folder or zip the owner saved holds the SAME document several times: the editor
// file (Documents\<title>\<title>.html), a share file (<title> - مشاركة.html, Exports\*.shared.html), a PDF. Import brings each document
// back ONCE, from the best source: editor HTML, else share HTML, else DOCX / PDF / plain HTML. Other copies are "not needed".
//   planSources(sources) → {documents, toRead, skipped, failed, settled}
//     sources    [{file, rel, src}] (.pdf .docx .html .htm)
//     documents  payloads for the library from Save-HTML files, whole: both editions, their ops, comments, versions, marks
//     toRead     the chosen files that still need reading by engine/import (PDF, DOCX, plain HTML)
//     skipped    [{file, reason, kind, title?}]  kind: not-needed | not-document | blank | no-document
//     failed     [{file, reason}] a file that could not be opened: named, never quietly taken for a plain HTML (0.17.4: that let its PDF win)
//     settled    how many of the given files were settled without reading (documents + skipped)
// A Save-HTML's text is the BLANK base with the work as ops on top: the real title is the applied document's, never the base's.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyOps } from '../edits.mjs';
import { lp } from './safe.mjs';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const BWDATA = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/;
const BIDI = /[‎‏‪-‮⁦-⁩﻿]/g;
export const PLACEHOLDER = /^(خدمة جديدة|new service)$/i;
/** Folders whose files are copies or system files, never documents. */
export const SYSTEM_SEG = /^(exports|versions|sources|\.system|\.localbackups|backups)$/i;
const SHARE = /(?:\s[-–]\s(?:مشاركة|share|shared)|\.shared)\.html?$/i;
const EXT_PREF = ['.docx', '.pdf', '.html', '.htm'];

/** The same document, compared by letters and digits only. */
export const titleKey = (s) => String(s || '').normalize('NFKC').replace(BIDI, '').replace(/[ً-ٟـ]/g, '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
/** A file's stem as the document's title: no extension, no export stamp, no language word, no «مشاركة» / «وثيقة المتطلبات» tail. */
export function stemTitle(rel) {
  let s = path.posix.basename(rel).replace(/\.[^.]+$/, '');
  s = s.replace(/^\d{4}-\d\d-\d\d \d\d-\d\d(?:-\d\d)?\s+/, '');
  for (let i = 0; i < 3; i++) s = s.replace(/\.shared$/i, '').replace(/\s*[-–]\s*(مشاركة|share|shared|وثيقة المتطلبات|requirements|العربية|arabic|english|الإنجليزية|ar|en)$/i, '').replace(/\.(ar|en)$/i, '');
  return s.trim();
}
/** "<prefix>: <name>" → <name> (the library's rule). */
const nameOfTitle = (t) => { const s = String(t || '').replace(BIDI, '').trim(); return (s.split(/\s*[:—]\s+/).slice(1).join(': ') || s).trim(); };
const docName = (doc) => { const c = doc?.control || {}; return String(c.coverTitle || nameOfTitle(c.title) || '').trim(); };

/** A key for "this content": the edition as it reads after its edits, so two files with different histories but the same text are one. */
export function contentKey(raw, ops) {
  try {
    const doc = applyOps(JSON.parse(raw), ops || []);
    delete doc.composedAt; // a document read from a PDF / DOCX / HTML gets the time of the import as its stamp and id: not content
    if (/^BW-IMPORT-/.test(doc.control?.documentId || '')) delete doc.control.documentId;
    return `c:${sha(JSON.stringify(doc))}`;
  } catch { return `c:${sha(String(raw))}`; }
}

/** The Save-HTML data of a file, or null (not ours / not parseable). */
export function readSaveData(file) {
  const t = fs.readFileSync(lp(file), 'utf8'); // lp: a long Arabic path under a long temp folder (Windows without long-path support)
  const m = BWDATA.exec(t);
  let data = null;
  if (m) try { data = JSON.parse(m[1]); } catch { data = null; }
  return { data, htmlTitle: nameOfTitle(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(t.slice(0, 20000))?.[1] || '') };
}

const wordsOf = (doc) => (JSON.stringify(doc.chapters || []).replace(/"[a-zA-Z_]+":/g, ' ').match(/[\p{L}\p{N}]+/gu) || []).length;

/** One service of a Save-HTML → a candidate: the applied title of each edition, the ops, the payload. */
function candidate(s, f, fallback) {
  const eds = {};
  let ops = 0;
  for (const ed of ['ar', 'en']) {
    const x = s.editions?.[ed];
    if (!x || typeof x.raw !== 'string' || !x.raw) continue;
    let doc;
    try { doc = JSON.parse(x.raw); } catch { continue; }
    if (!doc?.chapters || !doc?.control) continue;
    let applied = doc;
    try { applied = applyOps(doc, x.ops || []); } catch { /* broken edits: the base is what we can name */ }
    eds[ed] = { x, applied, own: docName(applied) };
    ops += (x.ops || []).length;
  }
  if (!Object.keys(eds).length) return null;
  const ownNames = Object.values(eds).map((e) => e.own).filter(Boolean);
  const own = ownNames.find((n) => !PLACEHOLDER.test(n)) || ownNames[0] || '';
  const blank = PLACEHOLDER.test(own) && ops === 0; // a blank service nobody touched
  const named = [own, ...Object.values(eds).map((e) => String(e.x.name || '').trim()), fallback.htmlTitle, fallback.stem].find((n) => n && !PLACEHOLDER.test(n)) || own;
  return { eds, ops, blank, title: named, key: PLACEHOLDER.test(named) ? `id:${s.id || f.rel}` : titleKey(named) };
}

export function planSources(sources) {
  const skipped = [], failed = [];
  const cands = []; // {f, rank, ext, title, key, payload?}
  const settled = new Set();
  const skip = (f, reason, kind, title) => { skipped.push({ file: f.rel, reason, kind, ...(title ? { title } : {}) }); settled.add(f); };
  for (const f of sources) {
    const ext = path.extname(f.rel).toLowerCase();
    const seg = f.rel.split('/').slice(0, -1).find((x) => SYSTEM_SEG.test(x));
    if (seg) { skip(f, `inside the folder «${seg}»: a copy or a system file, not a document`, 'not-document'); continue; }
    const stem = stemTitle(f.rel);
    if (ext === '.html' || ext === '.htm') {
      let r;
      try { r = readSaveData(f.file); } catch (e) { failed.push({ file: f.rel, reason: `cannot be opened (${e.code || e.message}); the path may be too long or the file is locked` }); settled.add(f); continue; }
      if (r.data && Array.isArray(r.data.services)) {
        const made = r.data.services.map((s) => { const c = candidate(s, f, { htmlTitle: r.htmlTitle, stem }); const pv = r.data.prov?.[s.id]; if (c && typeof pv?.log === 'string' && pv.log) c.prov = { doc: String(pv.doc || s.id), log: pv.log }; return c; }).filter(Boolean);
        if (!made.length) { skip(f, 'the file carries no document (it holds no edition to import)', 'no-document'); continue; }
        const rank = SHARE.test(f.rel) ? 1 : 0;
        for (const c of made) cands.push({ f, ext, rank, title: c.title, key: c.key, ops: c.ops, nEd: Object.keys(c.eds).length, blank: c.blank, eds: c.eds, svc: c, prov: c.prov });
        continue;
      }
      cands.push({ f, ext, rank: 3, title: stem, key: titleKey(stem), plain: true });
      continue;
    }
    cands.push({ f, ext, rank: 2, title: stem, key: titleKey(stem), plain: true });
  }
  // blank services are dropped first: they are not a document, and must not hide a real one of the same title
  const live = [];
  for (const c of cands) { if (c.blank) skip(c.f, 'a blank document: no title and no edits', 'blank', c.title); else live.push(c); }
  const groups = new Map();
  for (const c of live) groups.set(c.key, [...(groups.get(c.key) || []), c]);
  const documents = [], toRead = [], chosenFiles = new Set();
  const label = (c) => (c.rank === 0 ? 'the editor file' : c.rank === 1 ? 'the share file' : c.ext === '.docx' ? 'the DOCX' : c.ext === '.pdf' ? 'the PDF' : 'the HTML file');
  for (const list of groups.values()) {
    const saves = list.filter((c) => c.rank <= 1).sort((a, b) => a.rank - b.rank || (b.ops || 0) - (a.ops || 0) || (b.nEd || 0) - (a.nEd || 0) || a.f.rel.localeCompare(b.f.rel));
    let keep;
    if (saves.length) keep = [saves[0]];
    else {
      const best = EXT_PREF.find((e) => list.some((c) => c.ext === e));
      keep = list.filter((c) => c.ext === best); // the same format twice (an Arabic and an English PDF) stay: they pair as two editions
    }
    for (const c of keep) {
      if (c.eds) {
        const d = { _file: c.f.rel, _kind: 'save-html', title: nameOfTitle(c.title), ops: {}, keep: {} };
        let w = 0;
        for (const [ed, e] of Object.entries(c.eds)) {
          d[ed] = e.x.raw; d.ops[ed] = e.x.ops || [];
          d.keep[ed] = { name: e.x.name, status: e.x.status, stale: e.x.stale, comments: e.x.comments, versions: e.x.versions, marks: e.x.marks, epochIds: e.x.epochIds };
          w += wordsOf(e.applied);
        }
        d._words = w;
        if (c.prov) d.prov = c.prov; // the sealed history log travels with the work (additive; 31-provenance reads entry.prov and unseals it with the OLD document id)
        documents.push(d);
        chosenFiles.add(c.f);
      } else if (!chosenFiles.has(c.f)) { toRead.push(c.f); chosenFiles.add(c.f); }
    }
    for (const c of list) if (!keep.includes(c) && !chosenFiles.has(c.f)) skip(c.f, `not needed: «${keep[0].title}» comes from ${label(keep[0])} (${keep[0].f.rel})`, 'not-needed', keep[0].title);
  }
  for (const f of sources) if (chosenFiles.has(f)) settled.delete(f);
  const settledN = sources.filter((f) => !toRead.includes(f)).length;
  return { documents, toRead, skipped, failed, settled: settledN };
}

/** The import report in plain words, counts first, Arabic and English: {counts, ar, en}. */
export function buildReport({ came_in = [], skipped = [], failed = [] }) {
  const n = (...k) => skipped.filter((x) => k.includes(x.kind)).length;
  const counts = { came_in: came_in.length, not_needed: n('not-needed'), already: n('already'), empty: n('blank', 'no-document'), ignored: n('not-document', 'system'), failed: failed.length };
  const other = skipped.length - counts.not_needed - counts.already - counts.empty - counts.ignored;
  if (other > 0) counts.ignored += other;
  const ar = `دخل ${counts.came_in} مستندا. لم يلزم ${counts.not_needed} ملفا (نسخ لمستندات دخلت من مصدر أفضل). موجود في المكتبة ${counts.already}. فارغ ${counts.empty}. تُجوهل ${counts.ignored} (ملفات نظام ونسخ). فشل ${counts.failed}.`;
  const en = `${counts.came_in} documents came in. ${counts.not_needed} files were not needed (copies of a document that came from a better file). ${counts.already} already in the library. ${counts.empty} empty or blank. ${counts.ignored} ignored (system files and copies). ${counts.failed} failed.`;
  return { counts, ar, en };
}
