// Shared helpers for the 0.13.0 document-model suites (chrome, format, layout, objects).
// poppler (never xpdf: it drops Arabic) for page text and page sizes; a PNG built in code; a DOCX part reader.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { py } from '../../../engine/py.mjs';

/** The first pdftotext/pdfinfo on PATH that is poppler (`-v` names it). */
export function poppler(tool) {
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['-a', tool], { encoding: 'utf8' }).stdout.split(/\r?\n/).filter(Boolean);
  const hit = where.find((p) => /poppler/i.test(spawnSync(p, ['-v'], { encoding: 'utf8' }).stderr + spawnSync(p, ['-v'], { encoding: 'utf8' }).stdout));
  if (!hit) throw new Error(`poppler ${tool} not found on PATH`);
  return hit;
}
/** Text of each page (index 0 = page 1). */
export function pageTexts(pdf) {
  return spawnSync(poppler('pdftotext'), ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.replace(/[‎‏‪-‮⁦-⁩]/g, '').split('\f').slice(0, -1); // bidi marks poppler adds around runs go
}
/** [w, h] in mm of every page. */
export function pageSizes(pdf) {
  const out = spawnSync(poppler('pdfinfo'), ['-f', '1', '-l', '999', pdf], { encoding: 'utf8' }).stdout;
  return [...out.matchAll(/Page\s+\d+ size:\s+([\d.]+) x ([\d.]+) pts/g)].map((m) => [Math.round((+m[1] / 72) * 25.4), Math.round((+m[2] / 72) * 25.4)]);
}
/** Word count of the whole PDF (letters only). */
export const words = (pdf) => pageTexts(pdf).join(' ').split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
/** Fonts of a PDF: [{name, type, emb}] (pdffonts). */
export function pdfFonts(pdf) {
  const out = spawnSync(poppler('pdffonts'), [pdf], { encoding: 'utf8' }).stdout.split(/\r?\n/).slice(2).filter(Boolean);
  return out.map((l) => ({ name: l.split(/\s+/)[0], type: / Type 3 /.test(l) ? 'Type 3' : l.slice(37, 54).trim(), line: l }));
}
/** A solid RGBA PNG as a data URI (w × h px), alpha 255 except a transparent disc corner when `hole`. */
export function pngUri(w = 40, h = 40, [r, g, b] = [180, 140, 60]) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const o = y * (w * 4 + 1) + 1 + x * 4;
    const inside = (x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 2) ** 2;
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = inside ? 255 : 0;
  }
  const crc = (buf) => { let c = ~0; for (const x of buf) { c ^= x; for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
/** The XML parts of a DOCX whose name matches `re`, joined ({name: xml}). */
export function docxParts(docx, re = /^word\/.*\.xml$/) {
  const code = 'import zipfile,sys,json,re\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist() if re.match(sys.argv[2], n)}))';
  const r = spawnSync(...py(['-c', code, docx, re.source], []), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout);
}
export const sample = (repo, locale = 'ar', name = 'event-permit') => JSON.parse(fs.readFileSync(path.join(repo, 'samples', name, `document.${locale}.json`), 'utf8'));
/** Words the second PDF lost against the first (letter runs, band strings out). A table split over more pages
 *  repeats its header row, so extra words are fine; a missing one is not. */
export function lostWords(pdfA, pdfB, band) {
  const bag = (f) => { const m = new Map(); for (const w of pageTexts(f).map((t) => band.filter(Boolean).reduce((s, b) => s.split(b).join(' '), t)).join(' ').match(/\p{L}+/gu) || []) m.set(w, (m.get(w) || 0) + 1); return m; };
  const a = bag(pdfA), b = bag(pdfB);
  return [...a].filter(([w, n]) => (b.get(w) || 0) < n).map(([w, n]) => `${w} ${n}→${b.get(w) || 0}`);
}
