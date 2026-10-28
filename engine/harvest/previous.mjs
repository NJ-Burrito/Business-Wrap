// The delivered earlier document as evidence: its text (poppler for PDF, pandoc for DOCX, as-is for text),
// then what the new document must not say less than (counts per area), the revisions lineage, the
// preparer, and the legislation lines. A heuristic reader: what it cannot find it leaves out, never guesses.
//
//   readPrevious(file) → { kind: 'bw-previous', ref, counts, revisions, preparedBy, legislation, text }
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** poppler's pdftotext: the one beside poppler's pdffonts when the PATH one is xpdf (which drops Arabic). */
export function popplerBin(name) {
  if (process.env.BW_POPPLER) return path.join(process.env.BW_POPPLER, name);
  const probe = spawnSync(name, ['-v'], { encoding: 'utf8' });
  if (/poppler/i.test(`${probe.stdout}${probe.stderr}`)) return name;
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['pdffonts'], { encoding: 'utf8' });
  for (const p of String(where.stdout || '').split(/\r?\n/).filter(Boolean)) {
    const v = spawnSync(p, ['-v'], { encoding: 'utf8' });
    if (/poppler/i.test(`${v.stdout}${v.stderr}`)) { const c = path.join(path.dirname(p), name + (process.platform === 'win32' ? '.exe' : '')); if (fs.existsSync(c)) return c; }
  }
  return name; // xpdf as a last resort; callers pass -enc UTF-8
}

export function pdfText(file, { layout = false } = {}) {
  const r = spawnSync(popplerBin('pdftotext'), ['-enc', 'UTF-8', ...(layout ? ['-layout'] : []), file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`pdftotext failed on ${file}: ${r.stderr || r.error?.message}`);
  return r.stdout;
}

export function textOfFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return pdfText(file);
  if (ext === '.docx') {
    const r = spawnSync('pandoc', ['-t', 'plain', '--wrap=none', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (r.status !== 0) throw new Error(`pandoc failed on ${file}: ${r.stderr || r.error?.message}`);
    return r.stdout;
  }
  return fs.readFileSync(file, 'utf8');
}

const DATE = /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/;
const isoOf = (d) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(d); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : d; };

export function parsePrevious(text, ref = 'previous document') {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const distinct = (re) => new Set([...String(text).matchAll(re)].map((m) => m[0].replace(/\s+/g, ''))).size;
  const counts = {
    requirements: distinct(/\b(?:FR|F)-?\s?\d{1,3}\b/g),
    stories: distinct(/\bUS-?\s?\d{1,3}\b/g),
  };
  // preparer: «إعداد: …» / «Prepared by: …» on one line
  const prep = lines.map((l) => /^(?:إعداد|اعداد|أعدّها|المُعِد|المعد|Prepared by)\s*[:：]\s*(.+)$/i.exec(l)).find(Boolean);
  // revisions: a line with a version (V01 / 1.0) and a date
  const revisions = lines.map((l) => { const v = /\b(V\d{1,3}|\d+\.\d+)\b/.exec(l); const d = DATE.exec(l); return v && d ? { version: v[1], date: isoOf(d[1]), purpose: l.replace(v[0], '').replace(d[0], '').replace(/[|\t]+/g, ' ').trim() } : null; }).filter(Boolean);
  // legislation: the lines under a legislation heading, up to the next numbered heading
  const li = lines.findIndex((l) => /^(\d+\.\d+\s*)?(التشريعات|Governing legislation|Legislation)/i.test(l));
  const legislation = [];
  if (li >= 0) for (const l of lines.slice(li + 1)) { if (/^\d+\.\d+\s/.test(l)) break; if (l.length > 3) legislation.push({ name: l }); }
  return { kind: 'bw-previous', version: 1, ref, counts, revisions, ...(prep ? { preparedBy: prep[1].trim() } : {}), legislation };
}

export const readPrevious = (file) => ({ ...parsePrevious(textOfFile(file), path.basename(file)) });
