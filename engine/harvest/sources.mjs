// User-provided sources → documents (0.13.0 B2): process models (BPMN, draw.io, YAML/JSON steps, monitoring graph)
// go through the model parser; prose documents (PDF, DOCX, HTML, TXT, MD) are read as text and their numbered or
// bulleted lines become the step list. No model, no network: PDF text comes from poppler's pdftotext, DOCX from its
// own XML, HTML from its markup.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { config } from '../config.mjs';
import { harvestModel, writeDocuments, readModel } from './cli.mjs';
import { gateHarvest } from '../heal/gates.mjs';
import { parseModel, modelToDocument } from './model.mjs';
import { unescapeXml } from './xml.mjs';
import { i18n, userCwd } from '../export.mjs';

export const MODEL_EXT = /\.(bpmn|bpmn20\.xml|xml|drawio|ya?ml|json)$/i;
export const TEXT_EXT = /\.(pdf|docx|html?|txt|md)$/i;

/** One entry of a zip file (a DOCX), read from the central directory. Stored or deflated only. */
export function unzipEntry(buf, name) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('not a zip file');
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n -= 1) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nl) === name) {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nl + xl + cl;
  }
  return null;
}

/** Lines of a DOCX: one per paragraph; a list paragraph (w:numPr) is prefixed "- ". */
export function docxLines(buf) {
  const xml = unzipEntry(buf, 'word/document.xml')?.toString('utf8');
  if (!xml) throw new Error('DOCX without word/document.xml');
  return xml.split(/<\/w:p>/).map((p) => {
    const text = unescapeXml([...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).trim();
    return text && (/<w:numPr>/.test(p) ? `- ${text}` : text);
  }).filter(Boolean);
}
/** Lines of an HTML page: the title/h1 first, list items as "- ", paragraphs and headings as lines. */
export function htmlLines(html) {
  const body = String(html).replace(/<(script|style|noscript)[^]*?<\/\1>/gi, '');
  const strip = (s) => unescapeXml(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const title = strip((/<h1[^>]*>([^]*?)<\/h1>/i.exec(body) || /<title[^>]*>([^]*?)<\/title>/i.exec(body) || [])[1] || '');
  const lines = [...body.matchAll(/<(li|p|h[2-6])[^>]*>([^]*?)<\/\1>/gi)].map((m) => (m[1].toLowerCase() === 'li' ? `- ${strip(m[2])}` : strip(m[2])));
  return [title, ...lines].filter((l) => l && l !== '-');
}
export function pdfLines(file) {
  const dir = config().poppler;
  const exe = dir && fs.existsSync(path.join(dir, 'pdftotext.exe')) ? path.join(dir, 'pdftotext.exe') : 'pdftotext';
  const r = spawnSync(exe, ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`reading a PDF needs poppler's pdftotext (set BW_POPPLER): ${r.error?.message || r.stderr}`);
  return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
export function textLines(file) {
  if (/\.pdf$/i.test(file)) return pdfLines(file);
  if (/\.docx$/i.test(file)) return docxLines(fs.readFileSync(file));
  const t = fs.readFileSync(file, 'utf8');
  return /\.html?$/i.test(file) ? htmlLines(t) : t.split(/\r?\n/).map((l) => l.replace(/^#+\s*/, '').trim()).filter(Boolean);
}

const STEP_LINE = /^\s*(?:\d+[.)\-–]|[-*•▪◦–]|[٠-٩]+[.)\-–])\s+(.+)$/;
/** Text lines → a step-list process: the first line is the name, every numbered or bulleted line one step. */
export function linesToProcess(lines, { name } = {}) {
  const steps = lines.map((l) => STEP_LINE.exec(l)?.[1]?.trim()).filter(Boolean);
  if (!steps.length) throw new Error('no numbered or bulleted step found (write the steps as "1. …" or "- …" lines)');
  const title = name || lines.find((l) => !STEP_LINE.test(l)) || 'Process';
  return JSON.stringify({ process: title, steps: steps.map((s, i) => ({ id: `s${i + 1}`, name: s })) });
}

const expand = (srcs) => srcs.flatMap((s) => (fs.statSync(s).isDirectory() ? fs.readdirSync(s).sort().map((f) => path.join(s, f)).filter((f) => fs.statSync(f).isFile()) : [s]));
/**
 * Every source → one document pair (+ editor). Returns { results: [{source, kind, documents, editor, service}], skipped }.
 * A file that is neither a model nor a readable document is listed in `skipped` with the reason.
 */
export async function harvestSources(sources, { out = path.join(userCwd(), 'bw-harvest'), name, roles, editor = true } = {}) {
  const results = [];
  const skipped = [];
  // several sources of one call that land on the same service folder (one `name` for all) never overwrite each other:
  // the first keeps <service>\, the next ones get <service>-2\, -3\ … in source order (a re-run writes the same folders)
  const used = new Map();
  const H = i18n().harvest;
  const into = (ir) => {
    const dir = path.resolve(out, modelToDocument(ir, { locale: 'en', L: H.en }).service);
    const n = (used.get(dir) || 0) + 1;
    used.set(dir, n);
    return n === 1 ? undefined : `${dir}-${n}`;
  };
  for (const src of expand(sources.map((s) => path.resolve(s)))) {
    try {
      if (TEXT_EXT.test(src) && !/\.(xml|json|ya?ml)$/i.test(src)) {
        const ir = await parseModel(linesToProcess(textLines(src), { name }), { roles });
        ir.source = path.extname(src).slice(1).toLowerCase();
        const r = writeDocuments((locale, L) => modelToDocument(ir, { locale, L }), out, { editor, sources: { ir }, name, into: into(ir) });
        results.push({ source: src, kind: 'document', documents: r.documents, editor: r.editor, service: r.service });
      } else if (MODEL_EXT.test(src)) {
        const ir0 = await readModel(src, { name, roles });
        if (gateHarvest(ir0).verdict === 'FAIL') throw new Error('not a process model: no task or decision step');
        const r = await harvestModel(src, { out, name, roles, editor, into: into(ir0) });
        results.push({ source: src, kind: 'model', documents: r.documents, editor: r.editor, service: r.service });
      } else skipped.push({ source: src, why: 'not a model (BPMN, draw.io, YAML, JSON) or a document (PDF, DOCX, HTML, TXT, MD)' });
    } catch (e) { skipped.push({ source: src, why: e.message }); }
  }
  return { results, skipped };
}
