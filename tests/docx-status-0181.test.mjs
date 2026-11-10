// 0.18.1 (lane P2) · the status cells of a typed document take print's fill and ink in the DOCX too (w:shd on the cell, ink on its runs); a document
// without a docType (SRS and the legacy samples) gets none. Colours are the design vars print uses (render.mjs polishCss): ok success-100/700,
// bad signal-100/600, warn accent-100/800, idle neutral-100/neutral-700, read from the same theme.json.
//   node tests/run.mjs docx-status-0181
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { exportDocx, loadTheme, REPO } from '../engine/export.mjs';
import { statusKind } from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';
import { sample } from './fixtures/doc-model/util.mjs';

let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  docx-status-0181: ${name}${detail && !ok ? '  | ' + String(detail).slice(0, 300) : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-docx-status-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const theme = loadTheme();
const vars = JSON.parse(fs.readFileSync(process.env.BW_THEME || path.join(REPO, 'engine', 'defaults', 'theme.json'), 'utf8')).vars;
const V = (k) => String(vars[k]).replace('#', '').toUpperCase();
const KIND = { ok: ['success-100', 'success-700'], bad: ['signal-100', 'signal-600'], warn: ['accent-100', 'accent-800'], idle: ['neutral-100', 'neutral-700'] };

function documentXml(file) {
  const b = fs.readFileSync(file);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i += 1) {
    const method = b.readUInt16LE(p + 10), cs = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    if (name === 'word/document.xml') {
      const d = b.subarray(off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28), off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28) + cs);
      return (method === 8 ? zlib.inflateRawSync(d) : d).toString('utf8');
    }
    p += 46 + nl + el + cl;
  }
  return '';
}
// body cells only: print colours `tbody td`, never a header row (w:tblHeader)
const cellsOf = (xml) => [...xml.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].filter((r) => !r[0].includes('<w:tblHeader')).flatMap((r) => [...r[0].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((m) => m[1]));
const textOfCell = (c) => [...c.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('').trim();
const fillOf = (c) => (c.match(/<w:tcPr>[\s\S]*?<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"/) || [])[1]?.toUpperCase() || '';
const allFills = new Set(Object.values(KIND).map(([f]) => V(f)));
const out = (name, doc, ed) => { const f = path.join(tmp, name + '.docx'); exportDocx(doc, { locale: ed, theme, docxPath: f, embedFonts: false }); return documentXml(f); };

try {
  for (const id of ['test-cases', 'rtm']) for (const ed of ['en', 'ar']) {
    const doc = DT.compose(id, ed);
    const xml = out(`${id}.${ed}`, doc, ed);
    const cells = cellsOf(xml).map((c) => ({ c, t: textOfCell(c), k: statusKind(textOfCell(c)) })).filter((x) => x.k);
    check(`${id}.${ed}: the typed document has status cells (${cells.length})`, cells.length > 0);
    const bad = cells.filter((x) => fillOf(x.c) !== V(KIND[x.k][0]));
    check(`${id}.${ed}: every status cell carries print's fill`, cells.length > 0 && bad.length === 0, bad.map((x) => `${x.t}:${fillOf(x.c)}`).join());
    const ink = cells.filter((x) => !new RegExp(`<w:color w:val="${V(KIND[x.k][1])}"`, 'i').test(x.c));
    check(`${id}.${ed}: every status cell carries print's ink`, ink.length === 0, ink.map((x) => x.t).join());
    // the same document with no docType: no status fill anywhere
    const plain = { ...doc }; delete plain.docType;
    const xml0 = out(`${id}.${ed}.plain`, plain, ed);
    const got = cellsOf(xml0).filter((c) => statusKind(textOfCell(c)) && allFills.has(fillOf(c)));
    check(`${id}.${ed}: without a docType no status cell is filled`, got.length === 0, got.map(textOfCell).join());
    check(`${id}.${ed}: the typed XML differs from the untyped one only by status cells`, xml0.length < xml.length && cellsOf(xml0).length === cellsOf(xml).length);
  }
  for (const ed of ['en', 'ar']) {
    const xml = out(`srs.${ed}`, sample(REPO, ed), ed);
    const got = cellsOf(xml).filter((c) => allFills.has(fillOf(c)) && statusKind(textOfCell(c)));
    check(`legacy SRS sample ${ed}: no status fill`, got.length === 0);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
process.exit(failed ? 1 : 0);
