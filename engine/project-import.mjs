// Project import (0.15.0, note 18): a folder, a zip (a project exported by project-export.mjs, or any pile of files) or several
// .pdf / .docx / .html / .json files at once become ONE project in the library.
//
// importProject({inputs, project, locale, onProgress, known, onConflict, queue}) → {project, came_in, failed, skipped, warnings}
//   inputs      paths of files, folders and .zip files
//   project     the project's name; else index.json's, else the folder or zip name, else "Imported <date>"
//   known       a Set of editionKey(raw, ops) of the editions already in the library (duplicates are `skipped`, the re-import is idempotent)
//   onConflict  'skip' (default: a document already in the library is skipped) | 'keep' (imported again as a new document)
//   queue       (documents, {project}) → {doc_id: [...]}: how the documents reach the library (routes/library.mjs queueDocuments); one call, so the
//               project exists once and every document is assigned in one request
//   onProgress  ({done, total, file, state}) in order, done never decreasing, done == total at the end
// What a file is: .pdf .docx .htm(l) → read by engine/import (a Save-HTML with its bw-data block comes in whole, edits and all); a document JSON
// (control + chapters) → that edition, `<x>.ar.json` and `<x>.en.json` of one folder are ONE document; an edits JSON → replayed onto its base,
// found by `baseHash` (or, when it has none, by `document` id) among the batch; without a base it is `failed`. In a folder that holds
// `document.*.json` the PDF/DOCX/HTML beside them are the export's own renderings and are skipped (the document comes from the JSON).
// Each item is isolated; a DOCX runs in its own process with a 60 s ceiling. A PDF warns: tables may arrive as paragraphs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { editionOfFile, hashOf } from './edits-base.mjs';
import { migrate, validateEdits } from './edits.mjs';
import { extractZip } from './zip.mjs';
import { importFile, words } from './import/import.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** What makes a document "the same one": each edition's text AND its edits (two documents that start from one template and were edited differently are two documents). */
export const opsKey = (ops) => sha(JSON.stringify((ops || []).map((o) => [o.op, o.path, o.value ?? null, o.from ?? null])));
export const editionKey = (raw, ops) => `${sha(raw)}:${opsKey(ops)}`;
const BWDATA = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/;
const MAX_FILES = 5000;
const SKIP_NAMES = /^(index\.json|00 فهرس - Index\.html|desktop\.ini|thumbs\.db|\.ds_store)$/i;

function walk(dir, out = [], rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))) {
    if (e.isSymbolicLink()) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), out, r);
    else if (e.isFile()) { out.push({ file: path.join(dir, e.name), rel: r }); if (out.length > MAX_FILES) throw new Error(`more than ${MAX_FILES} files`); }
  }
  return out;
}
const jsonOf = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return undefined; } };
const isDocJson = (j) => !!(j && typeof j === 'object' && j.chapters && j.control);
const isEdits = (j) => Array.isArray(j) || !!(j && typeof j === 'object' && Array.isArray(j.ops) && !j.chapters);
const stemOf = (rel) => rel.replace(/\.(ar|en)\.(json|pdf|docx|html?)$/i, '').replace(/[ _.-](ar|en|arabic|english|العربية)$/i, '').replace(/\.[^./]+$/, '');
const dirOf = (rel) => (rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '');

/** A DOCX in its own process with a 60 s ceiling (python through uv can hang); PDFs and HTML run in-process. */
function readSource(file, name, locale) {
  const ext = path.extname(file).toLowerCase();
  if (ext !== '.docx') return importFile(file, { name, locale });
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--one', file, name, locale || ''], { encoding: 'utf8', timeout: 60000, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.error?.code === 'ETIMEDOUT') throw new Error('docx: no answer within 60 s (needs uv and python-docx; first run downloads it)');
  if (r.status !== 0) throw new Error(String(r.stderr || r.error?.message || 'docx import failed').replace(/\s+/g, ' ').slice(-300));
  return JSON.parse(r.stdout);
}

export async function importProject({ inputs, project, locale, onProgress = () => {}, known = new Set(), onConflict = 'skip', queue, tmp, isCancelled = () => false } = {}) {
  const work = tmp || fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pimp-'));
  const cleanup = () => { if (!tmp) fs.rmSync(work, { recursive: true, force: true }); };
  const came_in = [], failed = [], skipped = [], warnings = [];
  let done = 0, total = 0;
  const tick = (o = {}) => { try { onProgress({ done, total, ...o }); } catch { /* a listener must not stop the import */ } };
  try {
    // 1. expand: files, folders (recursive), zips (extracted below the work folder; zip-slip and bombs refused by zip.mjs)
    const files = [];
    let guess = '';
    const unzip = (zf, src) => {
      const dir = path.join(work, `zip-${files.length}-${crypto.randomBytes(3).toString('hex')}`);
      const got = extractZip(zf, dir);
      return got.map((g) => ({ file: g.file, rel: g.name.replace(/^[^/]+\//, (m) => (got.every((x) => x.name.startsWith(m)) ? '' : m)), src }));
    };
    for (const [src, input] of (inputs || []).entries()) {
      const p = path.resolve(String(input));
      let st;
      try { st = fs.statSync(p); } catch { failed.push({ file: String(input), reason: 'not found' }); continue; }
      try {
        if (st.isDirectory()) {
          const found = walk(p);
          const zips = found.filter((f) => /\.zip$/i.test(f.rel));
          // a folder (or an upload) holding ONE zip and nothing else is that zip; a zip among other files is opened too, its files joining the rest
          guess ||= zips.length === 1 && found.length === 1 ? path.basename(zips[0].rel).replace(/\.zip$/i, '') : path.basename(p);
          for (const f of found) {
            if (!/\.zip$/i.test(f.rel)) { files.push({ ...f, src }); continue; }
            try { files.push(...unzip(f.file, src)); } catch (e) { failed.push({ file: f.rel, reason: String(e.message || e).slice(0, 300) }); }
          }
        } else if (/\.zip$/i.test(p)) {
          guess ||= path.basename(p).replace(/\.zip$/i, '');
          files.push(...unzip(p, src));
        } else files.push({ file: p, rel: path.basename(p), src });
      } catch (e) { failed.push({ file: path.basename(p), reason: String(e.message || e).slice(0, 300) }); }
    }
    // 2. an exported project's index: its name
    const indexes = files.filter((f) => /(^|\/)index\.json$/i.test(f.rel)).map((f) => jsonOf(f.file)).filter((j) => j?.v === 1 && Array.isArray(j.documents));
    const exported = indexes[0] || null;
    const stamped = (s) => s.replace(/ - \d{4}-\d\d-\d\d \d\d-\d\d( \(\d+\))?$/, '');
    const name = String(project || exported?.project || stamped(guess) || `Imported ${new Date().toISOString().slice(0, 10)}`).trim().slice(0, 120);
    // 3. classify
    const docDirs = new Set(files.filter((f) => /(^|\/)document\.(ar|en)\.json$/i.test(f.rel)).map((f) => dirOf(f.rel)));
    const jsonDocs = [], editsFiles = [], sources = [];
    for (const f of files) {
      const base = path.posix.basename(f.rel), ext = path.extname(base).toLowerCase();
      if (SKIP_NAMES.test(base)) continue;
      if (ext === '.json') {
        const j = jsonOf(f.file);
        if (j === undefined) failed.push({ file: f.rel, reason: 'bad JSON: the file does not parse' });
        else if (isDocJson(j)) jsonDocs.push({ ...f, j });
        else if (isEdits(j)) editsFiles.push({ ...f, j });
        else skipped.push({ file: f.rel, reason: 'JSON that is neither a document nor an edits file' });
      } else if (['.pdf', '.docx', '.html', '.htm'].includes(ext)) {
        if (docDirs.has(dirOf(f.rel))) skipped.push({ file: f.rel, reason: 'a rendering made by the export; the document comes from its JSON' });
        else sources.push(f);
      } else skipped.push({ file: f.rel, reason: `unsupported type ${ext || '(none)'}` });
    }
    // units of progress: each JSON document group, each source file, each edits file
    const folderId = new Map((exported?.documents || []).flatMap((x) => (x.files || []).map((f) => [String(f.path).split('/')[0], x.id])));
    const titleById = new Map((exported?.documents || []).map((x) => [x.id, x.title]));
    const groups = new Map(); // key → {ar?, en?, rel, ops:{}, id?}
    for (const d of jsonDocs) {
      const ed = editionOfFile(d.rel, d.j) || (/[؀-ۿ]/.test(d.j.control?.title || '') ? 'ar' : 'en');
      const key = `${d.src}|${dirOf(d.rel)}|${stemOf(path.posix.basename(d.rel))}`;
      const g = groups.get(key) || { rel: d.rel, files: [], ops: {}, order: groups.size };
      if (g[ed]) { failed.push({ file: d.rel, reason: `a second ${ed} edition for the same document (${g.files.at(-1)})` }); continue; }
      g[ed] = fs.readFileSync(d.file, 'utf8').replace(/^﻿/, ''); // the file's own text: an edits file's baseHash is the hash of exactly it
      g.exportId ||= folderId.get(path.posix.basename(dirOf(d.rel)));
      g.files.push(d.rel);
      groups.set(key, g);
    }
    total = groups.size + sources.length + editsFiles.length;
    tick({ state: 'start' });
    // 4. sources: PDF / DOCX / HTML (a Save-HTML whole)
    const documents = []; // payloads for queue, with `_file`/`_kind` for the report
    const pairs = new Map(); // source stem → [{locale, doc, file, words}]
    for (const f of sources) {
      if (isCancelled()) break;
      const ext = path.extname(f.rel).toLowerCase();
      try {
        let data = null;
        if (ext === '.html' || ext === '.htm') { const m = BWDATA.exec(fs.readFileSync(f.file, 'utf8')); try { data = m && JSON.parse(m[1]); } catch { /* not ours */ } }
        if (data?.services?.length) {
          for (const s of data.services) {
            const d = { _file: f.rel, _kind: 'save-html', title: '', ops: {} };
            for (const [ed, x] of Object.entries(s.editions || {})) { d[ed] = x.raw; d.ops[ed] = x.ops || []; }
            documents.push(d);
          }
        } else {
          const r = readSource(f.file, path.posix.basename(f.rel), locale);
          if (ext === '.pdf') warnings.push({ file: f.rel, reason: 'pdf: tables may arrive as paragraphs and some right-to-left brackets may be mirrored; check the result' });
          const k = `${f.src}|${dirOf(f.rel)}|${stemOf(path.posix.basename(f.rel))}`;
          pairs.set(k, [...(pairs.get(k) || []), { locale: r.locale, doc: r.doc, file: f.rel, words: r.words, ext }]);
        }
      } catch (e) { failed.push({ file: f.rel, reason: String(e.message || e).replace(/\s+/g, ' ').slice(0, 300) }); }
      done += 1; tick({ file: f.rel, state: 'file' });
    }
    for (const list of pairs.values()) {
      // the same stem in two languages is ONE document with two editions; the same language twice is two documents
      const byLoc = new Map();
      const rest = [];
      for (const x of list) { if (byLoc.has(x.locale)) rest.push(x); else byLoc.set(x.locale, x); }
      const d = { _file: [...byLoc.values()].map((x) => x.file).join(' + '), _kind: [...byLoc.values()].map((x) => x.ext.slice(1)).join('+'), _words: [...byLoc.values()].reduce((n, x) => n + x.words, 0), ops: {} };
      for (const [l, x] of byLoc) d[l] = JSON.stringify(x.doc, null, 1);
      documents.push(d);
      for (const x of rest) documents.push({ _file: x.file, _kind: x.ext.slice(1), _words: x.words, [x.locale]: JSON.stringify(x.doc, null, 1), ops: {} });
    }
    // 5. JSON documents (an exported project's, in its own order)
    for (const g of [...groups.values()].sort((a, b) => a.order - b.order)) {
      const d = { _file: g.files.join(' + '), _kind: 'json', _exportId: g.exportId, title: titleById.get(g.exportId) || '', ops: {} };
      if (g.ar) d.ar = g.ar;
      if (g.en) d.en = g.en;
      d._words = ['ar', 'en'].reduce((n, l) => n + (g[l] ? words(JSON.stringify(JSON.parse(g[l]).chapters).replace(/"[a-zA-Z_]+":/g, ' ')) : 0), 0);
      documents.push(d);
      done += 1; tick({ file: g.rel, state: 'file' });
    }
    // 6. edits: each onto its base, by `document` id (the exported project's ids are in index.json) or baseHash, in the batch or known to the library
    const ids = new Map((exported?.documents || []).map((x) => [x.id, x]));
    for (const e of editsFiles) {
      try {
        const edits = migrate(e.j);
        if (Array.isArray(e.j)) throw new Error('edits: a bare operation list has no base document (no baseHash)');
        const bad = validateEdits(edits).filter((x) => !/^missing (document|baseHash)$/.test(x));
        if (bad.length) throw new Error(`edits: ${bad.slice(0, 3).join('; ')}`);
        const ed = edits.locale || editionOfFile(e.rel, null) || 'ar';
        // several documents can start from one text (a template edited three ways): the exported id says which; else the first one with no edits of this edition yet
        const same = documents.filter((d) => d[ed] && (edits.baseHash ? hashOf(d[ed]) === edits.baseHash : edits.document && d._exportId === edits.document));
        const target = same.find((d) => edits.document && d._exportId === edits.document) || same.find((d) => !(d.ops[ed] || []).length && !d._edited?.[ed]) || (edits.document ? null : same[0]);
        if (target) (target._edited ||= {})[ed] = true;
        if (!target) throw new Error(`edits: base document not found (baseHash ${String(edits.baseHash || '').slice(0, 19)}…)`);
        target.ops[ed] = [...(target.ops[ed] || []), ...edits.ops];
        target._kind = `${target._kind}+edits`;
        target._file = `${target._file} + ${e.rel}`;
      } catch (x) { failed.push({ file: e.rel, reason: String(x.message || x).slice(0, 300) }); }
      done += 1; tick({ file: e.rel, state: 'file' });
    }
    // 7. duplicates (already in the library, or twice in this batch)
    const fresh = [];
    const seen = new Set();
    for (const d of documents) {
      const keys = ['ar', 'en'].filter((l) => d[l]).map((l) => editionKey(d[l], d.ops?.[l]));
      const dup = keys.length && keys.every((k) => known.has(k) || seen.has(k));
      if (dup && onConflict !== 'keep') { skipped.push({ file: d._file, reason: 'already in the library (same content)' }); continue; }
      keys.forEach((k) => seen.add(k));
      fresh.push(d);
    }
    if (isCancelled()) return { project: name, came_in, failed, skipped, warnings, total, cancelled: true };
    // 8. into the library, one request
    let docIds = [];
    if (fresh.length) {
      if (!queue) throw new Error('importProject: no way to reach the library (queue)');
      const out = await queue(fresh.map(({ _file, _kind, _words, _exportId, _edited, ...d }) => (d)), { project: name });
      docIds = out.doc_id || [];
      fresh.forEach((d, i) => came_in.push({ file: d._file, doc_id: docIds[i], title: d.title || titleOf(d), kind: d._kind, words: d._words ?? 0, editions: ['ar', 'en'].filter((l) => d[l]) }));
    }
    total = Math.max(total, done);
    done = total;
    tick({ state: 'done' });
    return { project: name, came_in, failed, skipped, warnings, total };
  } finally { cleanup(); }
}

function titleOf(d) {
  for (const l of ['ar', 'en']) if (d[l]) { try { const c = JSON.parse(d[l]).control || {}; return String(c.coverTitle || c.title || '').trim(); } catch { /* next */ } }
  return '';
}

// the DOCX child: node engine/project-import.mjs --one <file> <name> → importFile's result as JSON on stdout
if (process.argv[2] === '--one' && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(importFile(process.argv[3], { name: process.argv[4], locale: process.argv[5] || undefined }))); } catch (e) { process.stderr.write(String(e.message || e)); process.exit(1); }
}
