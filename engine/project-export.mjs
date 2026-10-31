// Project export (0.15.0, note 18): every document of a project as HTML / PDF / DOCX / JSON edits, in Arabic, English or both,
// into one folder or one zip with an index.
//
//   <outParent>\المشاريع - Projects\<project> - <YYYY-MM-DD HH-MM>\
//       00 فهرس - Index.html        RTL page: every document, its files as links, its status
//       index.json                  {v: 1, project, exportedAt, appVersion, documents: [{id, title, editions, status, files: [{path, kind, locale, sha256, bytes}], error?}]}
//       <NN> <title>\<title>.<ar|en>.<pdf|docx|html>, edits.<ar|en>.json + document.<ar|en>.json (the edits' base: replayable by apply_edits and by import)
//   layout 'zip' = the same tree inside <project> - <stamp>.zip (staged in the temp folder, which is removed).
//
// exportProject({project, docs, formats, locales, layout, outParent, onProgress, isCancelled}) → {root, zip, index, items, cancelled}
//   docs: library entries [{id, title, editions: {ar: {raw, hash?, ops?}, en: {…}}}]; formats ⊆ html|pdf|docx|edits; locales ar|en|both.
// One failing document or format is recorded in items[].error and the rest still run. A cancel removes everything it wrote.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { applyOps } from './edits.mjs';
import { hashOf } from './edits-base.mjs';
import { exportDocx, exportPdf, launchOptions, loadPlaywright, loadTheme, printHtml, REPO } from './export.mjs';
import { stamp, titleStem } from './workspace.mjs';
import { ensureFolderIcon, refreshFolderIcon } from './brand-icons.mjs';
import { writeZip } from './zip.mjs';

export const PROJECTS_NAME = 'المشاريع - Projects';
export const FORMATS = ['html', 'pdf', 'docx', 'edits'];
const MAX_PATH = 240; // below Windows' 260 with room for the drive and a "(2)"
const appVersion = () => { try { return JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version; } catch { return ''; } };
const pad = (n, w) => String(n).padStart(w, '0');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** `stem` shortened (with a stable 6-hex suffix of the full name) so that base + the longest file inside stays under MAX_PATH. */
export function fitStem(stem, room) {
  if (stem.length <= room) return stem;
  const h = crypto.createHash('sha1').update(stem).digest('hex').slice(0, 6);
  return `${stem.slice(0, Math.max(8, room - 7)).replace(/[.\s]+$/, '')}-${h}`;
}

function uniqueDir(parent, name) {
  let d = path.join(parent, name);
  for (let n = 2; fs.existsSync(d) || fs.existsSync(`${d}.zip`); n++) d = path.join(parent, `${name} (${n})`);
  return d;
}

/** The edited document of one edition: its base with its ops replayed. */
export const docOf = (ed) => applyOps(JSON.parse(ed.raw), ed.ops || []);

const L = {
  ar: { title: 'فهرس المشروع', docs: 'المستندات', file: 'الملف', status: 'الحالة', ok: 'تم', partial: 'جزئي', failed: 'فشل', at: 'تاريخ التصدير', n: 'عدد المستندات', bytes: 'الحجم', none: 'لا ملفات', dir: 'rtl', lang: 'ar' },
  en: { title: 'Project index', docs: 'Documents', file: 'File', status: 'Status', ok: 'Done', partial: 'Partial', failed: 'Failed', at: 'Exported', n: 'Documents', bytes: 'Size', none: 'no files' },
};
function indexHtml(index) {
  const href = (p) => p.split('/').map(encodeURIComponent).join('/');
  const kb = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const rows = index.documents.map((d, i) => {
    const st = d.status === 'ok' ? `${L.ar.ok} · ${L.en.ok}` : d.status === 'partial' ? `${L.ar.partial} · ${L.en.partial}` : `${L.ar.failed} · ${L.en.failed}`;
    const files = d.files.length ? `<ul>${d.files.map((f) => `<li><a href="${esc(href(f.path))}" dir="ltr">${esc(path.posix.basename(f.path))}</a> <small>${esc(f.kind)}${f.locale ? ` · ${f.locale}` : ''} · ${kb(f.bytes)}</small></li>`).join('')}</ul>` : `<p class="m">${L.ar.none} · ${L.en.none}</p>`;
    const err = (d.errors || []).length ? `<ul class="e">${d.errors.map((e) => `<li>${esc(e.format)}${e.locale ? ` · ${e.locale}` : ''}: ${esc(e.error)}</li>`).join('')}</ul>` : '';
    return `<section class="d ${d.status}"><h2><span class="n">${pad(i + 1, 2)}</span> ${esc(d.title)} <span class="s">${st}</span></h2>${files}${err}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(index.project)} · ${L.ar.title} · ${L.en.title}</title>
<style>
:root{color-scheme:light dark;--ink:#16243d;--bg:#fbf8f1;--line:#d9cfb8;--gold:#9a7a2c;--bad:#a33a2a}
@media (prefers-color-scheme:dark){:root{--ink:#e8ecf4;--bg:#101a2e;--line:#2c3a56;--gold:#d8b45c;--bad:#ff9a85}}
body{font:16px/1.7 "Thmanyah Sans","Thmanyah Serif Text",sans-serif;color:var(--ink);background:var(--bg);margin:0;padding:2rem 1rem}
main{max-width:52rem;margin:auto}h1{font:700 1.8rem "Thmanyah Serif Display","Thmanyah Sans",serif;margin:0 0 .25rem}
.m{color:var(--gold)}.d{border-top:1px solid var(--line);padding:.75rem 0}.d h2{font-size:1.1rem;margin:.2rem 0}.n{color:var(--gold);font-variant-numeric:tabular-nums}
.s{font-size:.8rem;font-weight:400;color:var(--gold);margin-inline-start:.5rem}.partial .s,.failed .s{color:var(--bad)}ul{margin:.3rem 0;padding-inline-start:1.2rem}a{color:inherit}.e{color:var(--bad)}
</style></head><body><main>
<h1>${esc(index.project)}</h1>
<p class="m">${L.ar.at} · ${L.en.at}: <span dir="ltr">${esc(index.exportedAt)}</span> · ${L.ar.n} · ${L.en.n}: ${index.documents.length}</p>
${rows}
</main></body></html>
`;
}

export async function exportProject({ project, docs, formats = ['pdf'], locales = 'both', layout = 'folder', outParent, onProgress = () => {}, isCancelled = () => false, theme } = {}) {
  if (!outParent) throw new Error('exportProject: outParent is required');
  if (!Array.isArray(docs) || !docs.length) throw new Error('exportProject: the project has no documents');
  const fmts = FORMATS.filter((f) => (formats || []).includes(f));
  if (!fmts.length) throw new Error(`exportProject: formats must include one of ${FORMATS.join(', ')}`);
  const locs = locales === 'ar' || locales === 'en' ? [locales] : ['ar', 'en'];
  const name = titleStem(project || 'Project');
  const projDir = path.join(outParent, PROJECTS_NAME);
  const stage = layout === 'zip' ? fs.mkdtempSync(path.join(os.tmpdir(), 'bw-pexp-')) : null;
  const baseName = `${name} - ${stamp(new Date())}`;
  const root = stage ? path.join(stage, baseName) : uniqueDir(projDir, baseName);
  const finalName = path.basename(root);
  const th = theme || loadTheme();
  const exportedAt = new Date().toISOString();
  // units: one per file wanted: document × edition present × format (a document that lacks an edition has fewer)
  const wanted = docs.map((d) => locs.filter((l) => d.editions?.[l]?.raw));
  const total = wanted.reduce((n, ls) => n + ls.length * fmts.length, 0) || docs.length;
  let done = 0, browser = null, cancelled = false;
  const items = [];
  const documents = [];
  const progress = (o) => { try { onProgress({ done, total, ...o }); } catch { /* a listener must not stop the export */ } };
  fs.mkdirSync(root, { recursive: true });
  try {
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      const title = String(d.title || d.id);
      const stemRoom = MAX_PATH - root.length - 1 - 4 /* NN + space */ - 1 - 1 - 12 /* .ar.docx etc. + "edits." */ - 2;
      const stem = fitStem(titleStem(title), Math.max(12, Math.floor(stemRoom / 2)));
      const folder = `${pad(i + 1, 2)} ${stem}`;
      const dir = path.join(root, folder);
      fs.mkdirSync(dir, { recursive: true });
      const files = [], errors = [];
      const put = (rel, buf, kind, locale) => { fs.writeFileSync(path.join(dir, rel), buf); files.push({ path: `${folder}/${rel}`, kind, locale, sha256: sha256(buf), bytes: buf.length }); };
      if (!wanted[i].length) errors.push({ format: '*', error: `no ${locs.join(' / ')} edition in this document` });
      for (const loc of wanted[i]) {
        const ed = d.editions[loc];
        let doc = null;
        for (const f of fmts) {
          if (isCancelled()) { cancelled = true; break; }
          progress({ index: i + 1, docs: docs.length, doc: d.id, title, locale: loc, format: f, state: 'start' });
          try {
            if (f === 'edits') {
              const base = Buffer.from(ed.raw, 'utf8');
              put(`document.${loc}.json`, base, 'document', loc);
              const edits = { version: 1, document: d.id, baseHash: hashOf(ed.raw), locale: loc, createdAt: exportedAt, ops: ed.ops || [] };
              put(`edits.${loc}.json`, Buffer.from(JSON.stringify(edits, null, 1), 'utf8'), 'edits', loc);
            } else {
              doc ||= docOf(ed);
              if (f === 'html') put(`${stem}.${loc}.html`, Buffer.from(printHtml(doc, { locale: loc, theme: th }).html, 'utf8'), 'html', loc);
              else if (f === 'pdf') {
                if (!browser) browser = await (await loadPlaywright()).chromium.launch(launchOptions());
                const tmp = path.join(dir, `${stem}.${loc}.pdf`);
                await exportPdf(doc, { locale: loc, theme: th, pdfPath: tmp, browser });
                const buf = fs.readFileSync(tmp);
                files.push({ path: `${folder}/${stem}.${loc}.pdf`, kind: 'pdf', locale: loc, sha256: sha256(buf), bytes: buf.length });
              } else if (f === 'docx') {
                const tmp = path.join(dir, `${stem}.${loc}.docx`);
                exportDocx(doc, { locale: loc, theme: th, docxPath: tmp });
                const buf = fs.readFileSync(tmp);
                files.push({ path: `${folder}/${stem}.${loc}.docx`, kind: 'docx', locale: loc, sha256: sha256(buf), bytes: buf.length });
              }
            }
          } catch (e) {
            errors.push({ format: f, locale: loc, error: String(e.message || e).replace(/\s+/g, ' ').slice(0, 300) });
          }
          done += 1;
          progress({ index: i + 1, docs: docs.length, doc: d.id, title, locale: loc, format: f, state: errors.some((x) => x.format === f && x.locale === loc) ? 'failed' : 'done' });
        }
        if (cancelled) break;
      }
      if (cancelled) break;
      const status = errors.length ? (files.length ? 'partial' : 'failed') : 'ok';
      documents.push({ id: d.id, title, editions: Object.keys(d.editions || {}).filter((l) => locs.includes(l)), status, files, ...(errors.length ? { errors } : {}) });
      items.push({ doc: d.id, title, ok: !errors.length, files: files.map((f) => f.path), ...(errors.length ? { error: errors.map((e) => `${e.format}${e.locale ? '/' + e.locale : ''}: ${e.error}`).join('; '), errors } : {}) });
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  if (cancelled) {
    fs.rmSync(stage || root, { recursive: true, force: true });
    if (stage) { /* the stage held the only copy */ }
    return { root: null, zip: null, cancelled: true, index: null, items };
  }
  const index = { v: 1, project: project || name, exportedAt, appVersion: appVersion(), documents };
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(index, null, 1));
  fs.writeFileSync(path.join(root, '00 فهرس - Index.html'), indexHtml(index), 'utf8');
  progress({ state: 'index' });
  if (!stage) { // a tree Business-Wrap just made: its root is the general icon, each document folder the icon of what it holds (Windows only)
    const sys = path.join(root, '.system');
    ensureFolderIcon(root, { kind: 'general', systemDir: sys });
    try { for (const e of fs.readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith('.')) refreshFolderIcon(path.join(root, e.name), { systemDir: sys }); } catch { /* cosmetic */ }
  }
  if (!stage) return { root, zip: null, cancelled: false, index, items };
  // zip: the staged tree under its own folder name, in tree order, then the stage goes
  const entries = [];
  const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const p = `${rel}/${e.name}`; if (e.isDirectory()) walk(path.join(d, e.name), p); else entries.push({ name: p, file: path.join(d, e.name) }); } };
  walk(root, finalName);
  fs.mkdirSync(projDir, { recursive: true });
  let zip = path.join(projDir, `${finalName}.zip`);
  for (let n = 2; fs.existsSync(zip); n++) zip = path.join(projDir, `${finalName} (${n}).zip`);
  try { writeZip(zip, entries); } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  return { root: null, zip, cancelled: false, index, items };
}
