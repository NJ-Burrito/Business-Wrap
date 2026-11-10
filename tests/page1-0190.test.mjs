// 0.19.0 · lane R1 (pilot): page 1 of an opened document carries NO motif and no art, for every type x ar/en and for old saved files
// (work/sdlc/design/0190-types.md §3; decisions.md D13). The start-page art (_art) is the type's identity on the start page only.
//   1. HTML: the rendered cover part (`[data-part=cover]`, a spine title page or a compact title block) holds no <svg>, no .cover-motif, no data-motif,
//      and render.mjs exports no motif drawing any more; a spine title page carries the control block (C3) and the type code (C2)
//   2. PDF (engine/export.mjs, pymupdf on page 0): get_images() is empty, no curve item, no line with both dx and dy above 0.5 pt (a diagonal)
//   3. DOCX: the section-1 body (up to the first w:sectPr) and the header and footer parts that section references hold no a:blip, except pictures
//      whose wp:docPr name starts `logo-` (the builder names logos so)
//   4. page 0's text holds the Latin tokens documentId, version and issue date (Arabic is not asserted from the PDF)
//   5. killed mutants, so the detector bites: an injected motif fails rule 1; tests/fixtures/page1-0190/motif.en.pdf (page 1 of srs.en from 0.18,
//      320 curves) fails rule 2; tests/fixtures/page1-0190/picture.docx (one picture in section 1) fails rule 3, and passes once named logo-*
// Old files: a 0.18 document (coverDesign + motif) exports with no art on page 1 too. Exports run in BW_EXPORT_JOBS (default 3) worker processes of
// this file, each with its own Chrome (tagged bw-1109, closed by the worker). BW_PAGE1_PNG=<dir> also saves page 1 of srs, test-plan and user-manual
// (en, ar) as PNG there for a person to look at.
//   node tests/run.mjs page1-0190
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { exportPdf, exportDocx, loadTheme, launchOptions, i18n } from '../engine/export.mjs';
import * as R from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';
import { py } from '../engine/py.mjs';

const SELF = fileURLToPath(import.meta.url);
const REPO = path.resolve(path.dirname(SELF), '..');
const FIX = path.join(REPO, 'tests', 'fixtures', 'page1-0190');
const theme = loadTheme();

/** The documents this suite exports: every type x edition, plus two 0.18 files that still carry `motif` (a spine and a compact one). */
function docOf(id) {
  const [base, ed] = id.split('.');
  if (base === 'old-srs') return { ...DT.compose('srs', ed), motif: 'srs' };
  if (base === 'old-minutes') return { ...DT.compose('minutes', ed), motif: 'minutes' };
  return DT.compose(base, ed);
}

// ───────────────────────────── worker: exports the jobs it is given ─────────────────────────────
if (process.argv[2] === '--worker') {
  const { out, jobs } = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  process.env.BW_FONT_NORM_DIR = path.join(out, `.norm-${process.pid}`);
  const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
  try {
    for (const id of jobs) {
      const ed = id.split('.')[1];
      const rec = { id, pdf: false, docx: false, err: '' };
      const doc = docOf(id);
      try { await exportPdf(doc, { locale: ed, theme, pdfPath: path.join(out, id + '.pdf'), browser }); rec.pdf = true; } catch (e) { rec.err += `pdf: ${e.message} `; }
      try { exportDocx(doc, { locale: ed, theme, docxPath: path.join(out, id + '.docx') }); rec.docx = true; } catch (e) { rec.err += `docx: ${e.message} `; }
      console.log('BWREC ' + JSON.stringify(rec));
    }
  } finally {
    await browser.close().catch(() => {});
    fs.rmSync(process.env.BW_FONT_NORM_DIR, { recursive: true, force: true });
  }
  process.exit(0);
}

// ───────────────────────────── the detectors ─────────────────────────────
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  page1-0190: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};

/** Rule 1 on markup: the cover part's own markup (up to the body wrapper) → [] when clean, else the reasons. */
export function htmlArt(html) {
  const at = html.indexOf('data-part="cover"');
  if (at < 0) return [];
  const start = html.lastIndexOf('<div', at);
  const end = html.indexOf('<div class="wrap">', at);
  const cover = html.slice(start, end < 0 ? undefined : end);
  return [[/<svg[\s>]/i, 'svg'], [/cover-motif/, '.cover-motif'], [/data-motif/, 'data-motif'], [/<img(?![^>]*data-logo=)[^>]*>/i, 'image (not a logo)']].filter(([re]) => re.test(cover)).map(([, w]) => w);
}

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

/** Rule 3: { blips, pictures: [names], bad: [names that are no logo] } over the section-1 body and the header/footer parts section 1 references. */
export function section1Of(z) {
  if (!z) return null;
  const doc = z['word/document.xml']?.toString('utf8') || '';
  const body = doc.slice(doc.indexOf('<w:body'));
  const k = body.indexOf('<w:sectPr');
  const s1 = k >= 0 ? body.slice(0, k) : body;
  const sect = k >= 0 ? body.slice(k, body.indexOf('</w:sectPr>', k)) : '';
  const rels = z['word/_rels/document.xml.rels']?.toString('utf8') || '';
  const target = (id) => (rels.match(new RegExp(`<Relationship [^>]*Id="${id}"[^>]*>`)) || [''])[0].match(/Target="([^"]+)"/)?.[1];
  const parts = [s1, ...[...sect.matchAll(/<w:(?:header|footer)Reference [^>]*r:id="([^"]+)"/g)].map((m) => z['word/' + target(m[1])]?.toString('utf8') || '')];
  const blips = parts.reduce((n, x) => n + (x.match(/<a:blip\b/g) || []).length, 0);
  const pictures = parts.flatMap((x) => [...x.matchAll(/<wp:docPr\b[^>]*\bname="([^"]*)"/g)].map((m) => m[1]));
  return { blips, pictures, bad: pictures.filter((n) => !n.startsWith('logo-')), refs: parts.length - 1 };
}
const docxSection1 = (file) => section1Of(unzip(file));
const docxClean = (r) => !!r && r.bad.length === 0 && (r.blips === 0 || r.blips === r.pictures.length);

const PDF_PY = `
import sys, json
import pymupdf
out = {}
png = sys.argv[1]
for f in sys.argv[2:]:
    d = pymupdf.open(f)
    p = d[0]
    curves = diag = 0
    for dr in p.get_drawings():
        for it in dr['items']:
            if it[0] == 'c':
                curves += 1
            elif it[0] == 'l' and abs(it[1].x - it[2].x) > 0.5 and abs(it[1].y - it[2].y) > 0.5:
                diag += 1
            elif it[0] == 'qu' and not it[1].is_rectangular:
                diag += 1
    out[f] = {'pages': len(d), 'images': len(p.get_images()), 'curves': curves, 'diag': diag, 'text': p.get_text()}
    if png != '-':
        import os
        base = os.path.basename(f)[:-4]
        if base.split('.')[0] in ('srs', 'test-plan', 'user-manual'):
            p.get_pixmap(dpi=110).save(os.path.join(png, base + '.page1.png'))
print(json.dumps(out))
`;
/** Rules 2 and 4 for many PDFs in one Python run: {file: {pages, images, curves, diag, text}}. */
function pdfPage1(files, pngDir = '-') {
  const [cmd, args] = py(['-c', PDF_PY, pngDir, ...files], ['pymupdf']);
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, PYTHONUTF8: '1' } });
  try { return JSON.parse(r.stdout); } catch { throw new Error(`pymupdf run failed: ${(r.stderr || '').slice(0, 300)}`); }
}
const pdfClean = (r) => !!r && r.images === 0 && r.curves === 0 && r.diag === 0;

// ───────────────────────────── the suite ─────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-page1-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
const alive = new Set();
const killAll = () => { for (const c of alive) { try { c.kill(); } catch { /* gone */ } } };
process.on('exit', killAll);
try {
  const types = DT.listTypes();
  check(`the registry lists 17 types (${types.length})`, types.length === 17);
  const ids = [...types.flatMap((t) => DT.EDITIONS.map((ed) => `${t.id}.${ed}`)), 'old-srs.en', 'old-srs.ar', 'old-minutes.en'];

  // ── 1. HTML ──
  check('render.mjs no longer exports a motif drawing (coverMotifSvg, coverMotifShapes, MOTIF_ROLES gone)', !('coverMotifSvg' in R) && !('coverMotifShapes' in R) && !('MOTIF_ROLES' in R));
  check('compose() writes no motif', ids.filter((id) => !id.startsWith('old-')).every((id) => !('motif' in docOf(id))));
  const htmlOf = (doc, ed) => R.renderDocument(doc, { locale: ed, labels: i18n().doc[ed], theme, fontCss: '', logos: theme.logos });
  const htmlBad = [];
  const spineBad = [];
  for (const id of ids) {
    const ed = id.split('.')[1];
    const doc = docOf(id);
    const h = htmlOf(doc, ed);
    const why = htmlArt(h);
    if (why.length) htmlBad.push(`${id}: ${why.join(', ')}`);
    const cv = R.coverOf(doc);
    if (cv?.design === 'spine' && !(doc.layout?.hide || []).includes('cover')) {
      const code = R.COVER_CODES[cv.type];
      if (!(h.includes('class="bw-fields fg-control"') && (h.match(/class="fg[ "]/g) || []).length >= 8 && (!code || h.includes(`<div class="type-code"><bdi dir="ltr">${code}</bdi>`)) && h.includes(`data-p="/control/documentId"`))) spineBad.push(id);
    }
  }
  check(`HTML: no svg, .cover-motif, data-motif or non-logo image in the cover part of ${ids.length} documents (17 types x ar/en + 3 old files)`, !htmlBad.length, htmlBad);
  check('HTML: every spine title page carries the control block (8 fields, C3), the type code (C2) and the editable document id', !spineBad.length, spineBad);
  check('C2: the code chip follows type.json code (defect report is DEF)', types.every((t) => t.id === 'blank' || R.COVER_CODES[t.id] === t.code), types.filter((t) => t.id !== 'blank' && R.COVER_CODES[t.id] !== t.code).map((t) => t.id));
  // mutant: a motif injected into a clean cover is caught
  const clean = htmlOf(docOf('srs.en'), 'en');
  const injected = clean.replace('<div class="cover-ctl">', '<svg class="cover-motif" viewBox="0 0 160 94"><circle cx="5" cy="5" r="4"/></svg><div class="cover-ctl">');
  check('mutant: a motif svg injected into the srs cover fails rule 1', injected !== clean && htmlArt(injected).length >= 2, htmlArt(injected));
  check('mutant: a data-motif attribute alone fails rule 1', htmlArt(clean.replace('data-part="cover"', 'data-part="cover" data-motif="srs"')).includes('data-motif'));
  // C3 field grid: type fields from the `cover` key print with their pointers; kinds date (LTR) and blank (an empty box); a chip takes its status fill
  const withCover = { ...docOf('test-plan.en'), cover: { cols: 2, fields: [{ label: 'System under test', value: 'Portal' }, { label: 'Test window', value: '2026-11-01', kind: 'date' }, { label: 'Status', value: 'Passed', kind: 'chip' }, { label: 'Sign', kind: 'blank' }] } };
  const hc = htmlOf(withCover, 'en');
  check('C3: cover.fields print in a second grid with /cover/fields/<i>/value pointers (date LTR, chip filled, blank empty)', hc.includes('class="bw-fields fg-type"') && hc.includes('data-p="/cover/fields/0/value"') && /<bdi dir="ltr" class="fg-date" data-p="\/cover\/fields\/1\/value">2026-11-01<\/bdi>/.test(hc) && hc.includes('class="fg-chip st-ok" data-p="/cover/fields/2/value"') && /class="fg-v fg-blank" data-p="\/cover\/fields\/3\/value"><\/span>/.test(hc) && !htmlArt(hc).length);

  // ── 2-4. PDF and DOCX, exported for real ──
  const nWorkers = Math.max(1, Math.min(Number(process.env.BW_EXPORT_JOBS) || 3, ids.length));
  const out = path.join(tmp, 'out');
  fs.mkdirSync(out, { recursive: true });
  const recs = new Map();
  let errText = '';
  const t0 = Date.now();
  await Promise.all(Array.from({ length: nWorkers }, (_, w) => new Promise((resolve) => {
    const jf = path.join(tmp, `jobs-${w}.json`);
    fs.writeFileSync(jf, JSON.stringify({ out, jobs: ids.filter((_, i) => i % nWorkers === w) }));
    const c = spawn(process.execPath, [SELF, '--worker', jf], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
    alive.add(c);
    let buf = '';
    c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.startsWith('BWREC ')) { const r = JSON.parse(line.slice(6)); recs.set(r.id, r); } } });
    c.stderr.on('data', (d) => { errText += d; });
    c.on('exit', (code) => { alive.delete(c); if (code) errText += ` [worker ${w} exit ${code}]`; resolve(); });
  })));
  check(`all ${ids.length} documents exported to PDF and DOCX in ${nWorkers} workers (${((Date.now() - t0) / 1000).toFixed(0)} s)`, recs.size === ids.length && [...recs.values()].every((r) => r.pdf && r.docx), `${recs.size}/${ids.length} ${[...recs.values()].filter((r) => r.err).map((r) => r.id + ': ' + r.err).join(' ')} ${errText.slice(0, 200)}`);

  const pngDir = process.env.BW_PAGE1_PNG ? path.resolve(process.env.BW_PAGE1_PNG) : '-';
  if (pngDir !== '-') fs.mkdirSync(pngDir, { recursive: true });
  const pdfs = ids.map((id) => path.join(out, id + '.pdf')).filter((f) => fs.existsSync(f));
  const P = pdfPage1([...pdfs, path.join(FIX, 'motif.en.pdf')], pngDir);
  const pdfBad = [];
  const tokBad = [];
  const docxBad = [];
  for (const id of ids) {
    const f = path.join(out, id + '.pdf');
    const r = P[f];
    if (!pdfClean(r)) pdfBad.push(`${id}: ${r ? `${r.images} images, ${r.curves} curves, ${r.diag} diagonals` : 'not read'}`);
    const doc = docOf(id);
    const empty = (doc.layout?.hide || []).includes('cover') && !doc.chapters.some((c) => !c.bare);
    if (!empty) {
      const c = doc.control;
      const toks = [c.documentId, c.version, c.issuedOn].filter((t) => t && /^[\x20-\x7e]+$/.test(t));
      const text = (r?.text || '').replace(/\s+/g, ' ');
      const miss = toks.filter((t) => !text.includes(t));
      if (!toks.length || miss.length) tokBad.push(`${id}: ${miss.join(', ') || 'no Latin token'}`);
    }
    const d = docxSection1(path.join(out, id + '.docx'));
    if (!docxClean(d)) docxBad.push(`${id}: ${d ? `${d.blips} blips, pictures ${JSON.stringify(d.pictures)}` : 'not read'}`);
  }
  check(`PDF page 1: no image, no curve, no diagonal in ${ids.length} documents`, !pdfBad.length, pdfBad);
  check('PDF page 1 holds the document id, version and issue date (Latin tokens, every non-empty document)', !tokBad.length, tokBad);
  check(`DOCX section 1 (body, header, footer): no picture but a logo-* one in ${ids.length} documents`, !docxBad.length, docxBad);
  if (pngDir !== '-') check(`page-1 PNGs of srs, test-plan and user-manual (en, ar) saved to ${pngDir}`, ['srs', 'test-plan', 'user-manual'].every((t) => ['en', 'ar'].every((ed) => fs.existsSync(path.join(pngDir, `${t}.${ed}.page1.png`)))));

  // ── 5. mutants: the 0.18 page 1 and a DOCX with a picture in section 1 must fail ──
  const m = P[path.join(FIX, 'motif.en.pdf')];
  check(`mutant: the 0.18 srs.en page 1 (fixture) fails rule 2 (${m ? m.curves : '?'} curves)`, !!m && !pdfClean(m) && m.curves > 100, JSON.stringify(m && { ...m, text: undefined }));
  const pic = docxSection1(path.join(FIX, 'picture.docx'));
  check('mutant: a DOCX with one picture in section 1 (fixture) fails rule 3', !!pic && pic.blips === 1 && !docxClean(pic), JSON.stringify(pic));
  // the same file with its picture named as a logo passes: the rule allows logos the user adds, by name only
  const z = unzip(path.join(FIX, 'picture.docx'));
  const named = z['word/document.xml'].toString('utf8').replace(/(<wp:docPr\b[^>]*\bname=")[^"]*"/, '$1logo-start"');
  const asLogo = section1Of({ ...z, 'word/document.xml': Buffer.from(named) });
  check('control: the same file with its picture named logo-start passes rule 3 (logos are allowed by name only)', named.includes('name="logo-start"') && asLogo.blips === 1 && docxClean(asLogo), JSON.stringify(asLogo));
} catch (e) {
  check('suite ran without an exception', false, (e && e.stack) || e);
} finally {
  killAll();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\npage1-0190: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
