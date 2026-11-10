// 0.18.0 (document studio) · lane L8, export gate: every registry type x ar/en is exported for real, as a PDF (engine/export.mjs exportPdf, headless Chrome)
// and as a DOCX (exportDocx, python-docx), and the files are read back with other tools:
//   PDF   pdftotext -enc UTF-8 holds the cover title, the first and the last chapter heading in the edition's script; no Type 3 font and no family but
//         Thmanyah (pdffonts); pdfinfo: the landscape types (registry layout.page.orientation) are landscape on every page, the others start portrait
//   DOCX  a real zip with word/document.xml; every chapter heading and the cover title are in the text; the landscape types are landscape on every
//         section; no colour outside the document's palette (the design vars of the composed document) and no Cairo
// 0.19.0: an `empty` type (the Blank document) has no cover, no heading and no text, so its checks are: a real PDF (one portrait page, no letters, no fonts), a real DOCX (palette only);
//   the exact emptiness rules (one page, no DOCX text, one section) are tests/blank-empty-0190.
// Runtime: 34 exports of ~3 s (PDF) + ~5 s (DOCX, a Python process) is ~4.5 min in one process, so the suite runs BW_EXPORT_JOBS (default 3) worker
// processes of itself (`--worker <jobs.json>`), each with its own Chrome (tagged bw-1109, closed by the worker) and its own scratch folder; the parent
// reads every file the workers wrote and prints one line per check. Every type exports once in each language in this one suite.
//   node tests/run.mjs doctypes-export-0180
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { exportPdf, exportDocx, loadTheme, launchOptions, i18n } from '../engine/export.mjs';
import { designTheme, renderDocument } from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';

const SELF = fileURLToPath(import.meta.url);
const theme = loadTheme();

// ───────────────────────────── worker: exports the jobs it is given and says what happened ─────────────────────────────
if (process.argv[2] === '--worker') {
  const { out, jobs } = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  process.env.BW_FONT_NORM_DIR = path.join(out, `.norm-${process.pid}`);
  const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
  try {
    for (const [id, ed] of jobs) {
      const rec = { id, ed, pdf: false, docx: false, err: '' };
      const doc = DT.compose(id, ed);
      const base = path.join(out, `${id}.${ed}`);
      const t0 = Date.now();
      try { await exportPdf(doc, { locale: ed, theme, pdfPath: base + '.pdf', browser }); rec.pdf = true; } catch (e) { rec.err += `pdf: ${e.message} `; }
      rec.pdfMs = Date.now() - t0;
      const t1 = Date.now();
      try { exportDocx(doc, { locale: ed, theme, docxPath: base + '.docx' }); rec.docx = true; } catch (e) { rec.err += `docx: ${e.message} `; }
      rec.docxMs = Date.now() - t1;
      console.log('BWREC ' + JSON.stringify(rec));
    }
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(process.env.BW_FONT_NORM_DIR, { recursive: true, force: true });
  }
  process.exit(0);
}

// ───────────────────────────── the suite ─────────────────────────────
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  doctypes-export-0180: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-doctypes-export-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');

const BIDI = /[‎‏‪-‮⁦-⁩­]/g;
const ARABIC = /[؀-ۿﭐ-﷿ﹰ-﻿]/g;
/** One comparison form for text read back from a file: presentation forms folded (NFKC), bidi marks and soft hyphens gone, whitespace collapsed. */
const norm = (s) => String(s).normalize('NFKC').replace(BIDI, '').replace(/\s+/g, ' ').trim();
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20 });
const pdfText = (f) => run('pdftotext', ['-enc', 'UTF-8', f, '-']).stdout || '';

/** The parts of a zip as {name: Buffer}, from its central directory (node's zlib only). */
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
    const lnl = b.readUInt16LE(off + 26), lel = b.readUInt16LE(off + 28);
    const data = b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
    parts[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nl + el + cl;
  }
  return parts;
}
const xmlText = (xml) => norm([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'));

const types = DT.listTypes();
check(`the registry lists the 17 types of 0.18.0 (${types.length})`, types.length === 17, types.map((t) => t.id).join());
const jobs = types.flatMap((t) => DT.EDITIONS.map((ed) => [t.id, ed]));
const nWorkers = Math.max(1, Math.min(Number(process.env.BW_EXPORT_JOBS) || 3, jobs.length));
const out = path.join(tmp, 'out');
fs.mkdirSync(out, { recursive: true });
const recs = new Map();
const t0 = Date.now();
const procs = [];
const alive = new Set();
const killAll = () => { for (const c of alive) { try { c.kill(); } catch { /* gone */ } } };
process.on('exit', killAll);
let errText = '';
try {
  await Promise.all(Array.from({ length: nWorkers }, (_, w) => new Promise((resolve) => {
    const mine = jobs.filter((_, i) => i % nWorkers === w);
    const jf = path.join(tmp, `jobs-${w}.json`);
    fs.writeFileSync(jf, JSON.stringify({ out, jobs: mine }));
    const c = spawn(process.execPath, [SELF, '--worker', jf], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    procs.push(c); alive.add(c);
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.startsWith('BWREC ')) { const r = JSON.parse(line.slice(6)); recs.set(`${r.id}.${r.ed}`, r); } } });
    c.stderr.on('data', (d) => { errText += d; });
    c.on('exit', (code) => { alive.delete(c); if (code) errText += ` [worker ${w} exit ${code}]`; resolve(); });
  })));
  const wall = ((Date.now() - t0) / 1000).toFixed(0);
  check(`all ${jobs.length} exports ran in ${nWorkers} workers (${wall} s)`, recs.size === jobs.length && errText.trim() === '', `${recs.size}/${jobs.length} ${errText.slice(0, 200)}`);

  for (const t of types) {
    for (const ed of DT.EDITIONS) {
      const tag = `${t.id} ${ed}`;
      const rec = recs.get(`${t.id}.${ed}`) || {};
      const doc = DT.compose(t.id, ed);
      const land = doc.layout?.page?.orientation === 'landscape';
      // the title as the cover prints it (the renderer's own h1: the part after the colon when the document has no coverTitle), read from the real markup
      const h1 = renderDocument(doc, { locale: ed, labels: i18n().doc[ed], theme, fontCss: '', logos: theme.logos }).match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || '';
      const cover = norm(h1.replace(/<[^>]*>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
      const empty = t.empty === true; // 0.19.0: the Blank document prints no cover, no heading and no text: one empty page (tests/blank-empty-0190 holds the exact rules)
      if (!empty) check(`${tag}: the cover has a title to look for`, cover.length > 1, h1);
      const heads = doc.chapters.map((c) => norm(c.title));
      const base = path.join(out, `${t.id}.${ed}`);

      // ── PDF ──
      const pdfOk = rec.pdf === true && fs.existsSync(base + '.pdf') && fs.statSync(base + '.pdf').size > (empty ? 500 : 8000) && fs.readFileSync(base + '.pdf').subarray(0, 5).toString() === '%PDF-';
      check(`${tag}: PDF exported (a real %PDF file)`, pdfOk, rec.err);
      if (pdfOk) {
        const txt = norm(pdfText(base + '.pdf'));
        if (empty) check(`${tag}: PDF of the empty type holds no letters at all`, (txt.match(/\p{L}/gu) || []).length === 0, JSON.stringify(txt.slice(0, 60)));
        else check(`${tag}: PDF text (pdftotext) holds the cover title and the first and last chapter headings`, txt.includes(cover) && txt.includes(heads[0]) && txt.includes(heads[heads.length - 1]), JSON.stringify([cover, heads[0], heads[heads.length - 1], txt.slice(0, 60)]));
        const letters = (txt.match(/\p{L}/gu) || []).length;
        const arLetters = (txt.match(ARABIC) || []).length;
        if (!empty) check(`${tag}: PDF is in ${ed === 'ar' ? 'Arabic' : 'English'} (${arLetters} Arabic of ${letters} letters)`, letters > 200 && (ed === 'ar' ? arLetters / letters > 0.4 : arLetters / letters < 0.02), `${arLetters}/${letters}`);
        const fonts = run('pdffonts', [base + '.pdf']).stdout.split(/\r?\n/).slice(2).filter(Boolean).map((l) => ({ name: l.split(/\s{2,}/)[0].replace(/^[A-Z]{6}\+/, ''), type: (l.match(/\s(Type 3|Type 1C?|CID TrueType|CID Type 0C?|TrueType|OpenType|CID OpenType)\s/) || [])[1] || '?' }));
        check(`${tag}: PDF fonts (${fonts.length}): no Type 3, only Thmanyah`, (empty || fonts.length > 0) && fonts.every((f) => f.type !== 'Type 3' && /^thmanyah/i.test(f.name)), JSON.stringify(fonts.filter((f) => f.type === 'Type 3' || !/^thmanyah/i.test(f.name))));
        const info = run('pdfinfo', ['-f', '1', '-l', '500', base + '.pdf']).stdout;
        const sizes = [...info.matchAll(/Page\s+(\d+)\s+size:\s+([\d.]+) x ([\d.]+) pts/g)].map((m) => [+m[1], +m[2], +m[3]]);
        const pages = +(info.match(/Pages:\s+(\d+)/)?.[1] || 0);
        check(`${tag}: PDF ${pages} pages, ${land ? 'landscape on every page' : 'first page portrait'}`, pages >= 1 && sizes.length === pages && (land ? sizes.every(([, w, h]) => w > h) : sizes[0][1] < sizes[0][2]), JSON.stringify(sizes.slice(0, 4)));
      }

      // ── DOCX ──
      const dxOk = rec.docx === true && fs.existsSync(base + '.docx') && fs.statSync(base + '.docx').size > (empty ? 500 : 8000);
      check(`${tag}: DOCX exported`, dxOk, rec.err);
      if (dxOk) {
        const z = unzip(base + '.docx');
        const body = z?.['word/document.xml']?.toString('utf8') || '';
        check(`${tag}: DOCX opens (zip with [Content_Types].xml and word/document.xml)`, !!z && !!z['[Content_Types].xml'] && body.startsWith('<?xml') && body.includes('<w:body'), Object.keys(z || {}).slice(0, 4).join());
        const text = xmlText(body);
        const miss = [cover, ...heads].filter((h) => !text.includes(h));
        if (!empty) check(`${tag}: DOCX text holds the cover title and all ${heads.length} chapter headings`, !!body && miss.length === 0, JSON.stringify(miss.slice(0, 3)));
        const pg = [...body.matchAll(/<w:pgSz\s+([^>]*)\/>/g)].map((m) => ({ w: +/w:w="(\d+)"/.exec(m[1])[1], h: +/w:h="(\d+)"/.exec(m[1])[1], o: /w:orient="(\w+)"/.exec(m[1])?.[1] || 'portrait' }));
        check(`${tag}: DOCX ${pg.length} sections, ${land ? 'landscape on every one' : 'first one portrait'}`, pg.length >= 1 && (land ? pg.every((p) => p.w > p.h && p.o === 'landscape') : pg[0].w < pg[0].h), JSON.stringify(pg));
        const allowed = new Set(Object.values(designTheme(theme, doc).vars).filter((v) => /^#[0-9a-f]{6}$/i.test(String(v))).map((v) => v.slice(1).toUpperCase()).concat(['FFFFFF', '000000']));
        const used = new Set();
        let cairo = false;
        for (const [name, buf] of Object.entries(z || {})) {
          if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
          const xml = buf.toString('utf8');
          for (const m of xml.matchAll(/(?:w:fill|w:color|w:val)="([0-9A-Fa-f]{6})"/g)) used.add(m[1].toUpperCase());
          if (/cairo/i.test(xml)) cairo = true;
        }
        const off = [...used].filter((h) => !allowed.has(h));
        check(`${tag}: DOCX colours all on the document's palette (${used.size} used), no Cairo`, off.length === 0 && !cairo, JSON.stringify({ off, cairo }));
      }
    }
  }
} catch (e) {
  check('suite ran without an exception', false, e && e.stack || e);
} finally {
  killAll();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\ndoctypes-export-0180: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
