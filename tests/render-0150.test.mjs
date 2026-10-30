// 0.15.0 render lane: render-time numbering (F4) and diagram auto-layout / PNG / legibility (F5).
//   node tests/render-0150.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { docNumbers, normaliseNumbers, applyOps } from '../engine/edits.mjs';
import { renderDocument, designTheme } from '../engine/render.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, renderDiagramPng, diagramWarnings, printHtml, i18n, REPO } from '../engine/export.mjs';
import { config } from '../engine/config.mjs';
import { py } from '../engine/py.mjs';
import { bigWorkflow } from './render-fixtures.mjs';

const OUT = path.join(REPO, 'out', 'render-0150-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const load = (l) => JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${l}.json`), 'utf8'));
const theme = loadTheme();
const clone = (x) => JSON.parse(JSON.stringify(x));
const strip = (h) => h.replace(/<[^>]+>/g, '\u0001').replace(/\u0001+/g, ' ');
/** The numbers the print HTML shows: chapter <h2> .num spans, section <h3> .sn spans, and the TOC's first column. */
const tx = (h) => h.replace(/<[^>]+>/g, "").replace(/[‎‏⁦-⁩]/g, '').trim();
const printed = (html) => ({
  h2: [...html.matchAll(/<h2><span class="num"[^>]*>(.*?)<\/span><span/g)].map((m) => tx(m[1])),
  h3: [...html.matchAll(/<h3><span class="sn"[^>]*>(.*?)<\/span><span/g)].map((m) => tx(m[1])),
  toc: [...html.matchAll(/<table class="toc[^"]*"[^>]*>[\s\S]*?<\/table>/g)].flatMap((t) => [...t[0].matchAll(/<tr[^>]*><td>(.*?)<\/td>/g)].map((m) => tx(m[1]))),
});
const html = (doc, locale = 'ar') => renderDocument(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });
const mkSection = (title) => ({ title, number: '', blocks: [{ kind: 'prose', paragraphs: [title] }] });

// ── F4 · numbering comes from position ──
{
  const base = load('ar');
  const ch2 = base.chapters[1];
  const want = ch2.sections.length + 1;
  // (1) a section inserted at index 1 of chapter 2: the later ones move down, the stored numbers stay stale
  const ins = applyOps(base, [{ op: 'insert', path: '/chapters/1/sections/1', value: mkSection('قسم مُدرج') }]);
  const storedBefore = ins.chapters[1].sections.map((s) => s.number);
  const p = printed(html(ins));
  const expect = ins.chapters[1].sections.map((_, j) => `2.${j + 1}`);
  check('F4 (1) insert at index 1 of chapter 2: headings print 2.2, 2.3 …', expect.every((n) => p.h3.includes(n)) && p.h3.includes(`2.${want}`) && ins.chapters[1].sections[1].number === '', JSON.stringify({ expect, h3: p.h3 }));
  check('F4 (1) the TOC prints the same positional numbers', expect.every((n) => p.toc.includes(n)), JSON.stringify(p.toc));
  check('F4 (1) stored numbers were left stale (the render, not the JSON, is what fixed it)', storedBefore.includes('') && storedBefore.slice(2).some((n, i) => n !== `2.${i + 3}`), JSON.stringify(storedBefore));

  // (2) the 11th section stores "2.3" and prints "2.11"
  const eleven = clone(base);
  eleven.chapters[1].sections = Array.from({ length: 11 }, (_, i) => ({ ...mkSection(`قسم ${i + 1}`), number: i === 10 ? '2.3' : `2.${i + 1}` }));
  const p11 = printed(html(eleven));
  check('F4 (2) a doc whose 11th section stores «2.3» prints «2.11»', p11.h3.includes('2.11') && p11.h3.filter((n) => n === '2.3').length === 1, JSON.stringify(p11.h3.filter((n) => n.startsWith('2.'))));

  // (3) control.numbering = 'manual' keeps the stored values
  const man = clone(eleven);
  man.control.numbering = 'manual';
  const pm = printed(html(man));
  check("F4 (3) numbering:'manual' prints the stored numbers", pm.h3.filter((n) => n === '2.3').length === 2 && !pm.h3.includes('2.11'), JSON.stringify(pm.h3.filter((n) => n.startsWith('2.'))));
  const before = JSON.stringify(man);
  check("F4 (3) normaliseNumbers leaves a manual document untouched", JSON.stringify(normaliseNumbers(clone(man))) === before);

  // (5) AR and EN editions number the same
  const pa = printed(html(load('ar'), 'ar'));
  const pe = printed(html(load('en'), 'en'));
  check('F4 (5) the AR and EN editions print the same chapter, section and TOC numbers', JSON.stringify(pa) === JSON.stringify(pe) && pa.h2.length === base.chapters.length, JSON.stringify({ ar: pa.h3, en: pe.h3 }));

  // normaliseNumbers: the JSON on disk equals what prints
  const norm = normaliseNumbers(clone(ins));
  const N = docNumbers(ins);
  const flat = norm.chapters.flatMap((c, i) => [c.number === N.ch[i], ...c.sections.map((s, j) => s.number === N.sec[i][j])]);
  check('F4 normaliseNumbers writes the printed numbers into the JSON', flat.every(Boolean) && JSON.stringify(printed(html(norm))) === JSON.stringify(printed(html(ins))));
  const stories = clone(base);
  const sec0 = stories.chapters.flatMap((c, i) => c.sections.map((s, j) => [i, j, s])).find(([, , s]) => s.blocks.some((b) => b.kind === 'stories'));
  if (sec0) {
    const [ci, sj, s] = sec0;
    const blk = s.blocks.find((b) => b.kind === 'stories');
    blk.number = '9.9';
    const h = html(stories);
    check('F4 a story block prints its section number, not a stored one', h.includes(`>${ci + 1}.${sj + 1}<`) && !h.includes('>9.9<'), `${ci + 1}.${sj + 1}`);
  } else results.push('SKIP  F4 story block number: sample has no stories block');

  // (4) PDF vs DOCX parity, both through the real exporters (EN edition: the fallback font never breaks Latin extraction)
  const en = applyOps(load('en'), [{ op: 'insert', path: '/chapters/1/sections/1', value: mkSection('Inserted section') }]);
  const browser = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(OUT, 'num.en.pdf');
    await exportPdf(en, { locale: 'en', theme, pdfPath: pdf, browser });
    const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
    const ptxt = spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
    const docx = path.join(OUT, 'num.en.docx');
    exportDocx(en, { locale: 'en', theme, docxPath: docx, embedFonts: false });
    const code = 'import zipfile,sys,re;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode();print(" ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>",x)))';
    const dtxt = (spawnSync(...py(['-c', code, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '');
    const wantSec = docNumbers(en).sec.filter((l) => l.length > 1).flat(); // a one-section chapter prints no section heading
    const inPdf = wantSec.filter((n) => new RegExp(`(^|\\s)${n.replace('.', '\\.')}(\\s|$)`, 'm').test(ptxt));
    const inDocx = wantSec.filter((n) => new RegExp(`(^|\\s)${n.replace('.', '\\.')}(\\s|$)`).test(dtxt));
    check('F4 (4) PDF and DOCX print the same section numbers (insert-at-1 doc)', inPdf.length === wantSec.length && inDocx.length === wantSec.length, JSON.stringify({ want: wantSec.length, pdf: inPdf.length, docx: inDocx.length, missPdf: wantSec.filter((n) => !inPdf.includes(n)), missDocx: wantSec.filter((n) => !inDocx.includes(n)) }));
    const chPdf = docNumbers(en).ch.every((n) => ptxt.includes(n));
    check('F4 (4) chapter numbers present in both', chPdf && docNumbers(en).ch.every((n) => dtxt.includes(n)));
  } finally {
    await browser.close();
  }
}

// ── F5 · diagrams ──
const big = bigWorkflow();
const countable = big.nodes.length;
check('F5 fixture: the service-4-sized graph has 54 nodes and 79 edges', countable === 54 && big.edges.length === 79, `${countable}/${big.edges.length}`);
const ratioOf = (m) => { const v = DIAGRAM.resolve(m).view; return v.w / v.h; };
{
  // (1) layout by aspect and the phase split
  const MAX = 20;
  const figs = DIAGRAM.splitByPhase(big, { maxNodes: MAX, aspect: 1.5 });
  const ratios = figs.map((f) => ratioOf(f.model));
  check('F5 (1) the 54-node graph is split into figures of at most 20 nodes', figs.length > 1 && figs.every((f) => f.model.nodes.filter((n) => !['group', 'note', 'text', 'symbol'].includes(n.kind)).length <= MAX), figs.map((f) => f.nodes.length).join(','));
  check('F5 (1) every figure lays out at ratio 1.3 to 1.7', ratios.every((r) => r >= 1.3 && r <= 1.7), ratios.map((r) => r.toFixed(2)).join(','));
  const sug = DIAGRAM.layout(big, { aspect: 1.5, maxNodes: MAX });
  check('F5 (1) layout({maxNodes}) attaches the split suggestion for a graph above it', Array.isArray(sug.split) && sug.split.length === figs.length);
  const plain = DIAGRAM.layout(big);
  check('F5 (1) layout() without options is unchanged (no split, default ratio)', !plain.split);
  const small = { nodes: [{ id: 'a', kind: 'start', label: 'ابدأ' }, { id: 'b', kind: 'staff', label: 'مراجعة' }, { id: 'c', kind: 'ok', label: 'تم' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] };
  const kept = DIAGRAM.layout(small, { aspect: 1.5 });
  check('F5 (1) a small graph with an aspect lands inside ±12 % of it', Math.abs(Math.log(ratioOf(kept) / 1.5)) <= 0.12, ratioOf(kept).toFixed(2));

  // (5) continuation nodes appear in the SVG, the PDF text and the DOCX
  const conts = figs.flatMap((f) => f.model.nodes.filter((n) => n.kind === 'continue'));
  check('F5 (5) continuation nodes exist and name the other figure', conts.length >= 2 * (figs.length - 1) && conts.every((n) => /\d/.test(n.label)), conts.map((n) => n.label).join(' | '));
  const svg = DIAGRAM.render(figs[0].model, { theme: designTheme(theme, {}), locale: 'ar' });
  check('F5 (5) the continuation label is in the SVG', conts.some((n) => svg.includes(n.label.split(' ')[0])) && svg.includes('stroke-dasharray="6 4"'));
  const doc = clone(load('en'));
  const secEnd = doc.chapters[0].sections[0];
  figs.slice(0, 2).forEach((f) => secEnd.blocks.push({ kind: 'diagram', caption: f.caption, model: DIAGRAM.layout({ ...f.model, nodes: f.model.nodes.map((n) => ({ ...n })) }) }));
  const enFigs = DIAGRAM.splitByPhase({ ...big, nodes: big.nodes.map((n) => ({ ...n, label: n.label.replace('مرحلة', 'Stage').replace('مراجعة الطلب', 'review') })) }, { maxNodes: 20, locale: 'en' });
  const doc2 = clone(load('en'));
  enFigs.slice(0, 2).forEach((f) => doc2.chapters[0].sections[0].blocks.push({ kind: 'diagram', caption: f.caption, model: f.model }));
  const wantEn = enFigs[0].model.nodes.find((n) => n.kind === 'continue').label;
  const browser = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(OUT, 'cont.en.pdf');
    await exportPdf(doc2, { locale: 'en', theme, pdfPath: pdf, browser });
    const bin = config().poppler ? path.join(config().poppler, 'pdftotext') : 'pdftotext';
    const ptxt = (spawnSync(bin, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '').replace(/\s+/g, ' ');
    check('F5 (5) the continuation label is real text in the PDF', ptxt.includes(wantEn), wantEn);
    const docx = path.join(OUT, 'cont.en.docx');
    exportDocx(doc2, { locale: 'en', theme, docxPath: docx, embedFonts: false });
    const code = 'import zipfile,sys,re;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode();print(" ".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>",x)))';
    const dtxt = (spawnSync(...py(['-c', code, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '').replace(/\s+/g, ' ');
    check('F5 (5) the continuation label is in the DOCX', dtxt.includes(wantEn));
  } finally {
    await browser.close();
  }
  void doc;
}
{
  // (4) a via edge that ends level with a box top still gets its arrowhead on the face
  const m = { nodes: [{ id: 'a', kind: 'staff', label: 'أ', x: 50, y: 50 }, { id: 'b', kind: 'staff', label: 'ب', x: 400, y: 200 }], edges: [{ id: 'e1', from: 'a', to: 'b', via: [[300, 200]] }] };
  const r = DIAGRAM.resolve(m);
  const line = r.items.find((i) => i.t === 'line' && i.id === 'e1');
  const b = r.model.nodes.find((n) => n.id === 'b');
  const last = line.route.at(-1);
  const prev = line.route.at(-2);
  const svg = DIAGRAM.render(m);
  check('F5 (4) a via edge into a box top: marker-end present and the last leg arrives square on the face', /marker-end="url\(#bwdg-tip-main\)"/.test(svg) && Math.abs(last[0] - prev[0]) < 0.5 && Math.abs(last[1] - b.y) < 1.5, JSON.stringify(line.route));
}
{
  // (2) legibility computed from the model: a frame that prints the smallest text at 5 pt fails, one at 8 pt passes
  const m = DIAGRAM.layout(bigWorkflow(), { aspect: 1.5 });
  const sizes = DIAGRAM.resolve(m).items.filter((i) => i.t === 'text').map((i) => i.size);
  const v = DIAGRAM.resolve(m).view;
  const frameFor = (pt) => { const mmPerUnit = (pt / Math.min(...sizes)) * (25.4 / 72); return [v.w * mmPerUnit, v.h * mmPerUnit]; };
  const lo = DIAGRAM.legibility(m, { frameMm: frameFor(5) });
  const hi = DIAGRAM.legibility(m, { frameMm: frameFor(8) });
  check('F5 (2) a figure scaled to 5 pt is flagged', !lo.ok && lo.small.length > 0 && Math.abs(lo.minPtPrinted - 5) < 0.2, `${lo.minPtPrinted} pt, ${lo.small.length} small`);
  check('F5 (2) a figure at 8 pt passes the size test', hi.small.length === 0 && Math.abs(hi.minPtPrinted - 8) < 0.2, `${hi.minPtPrinted} pt`);
  const crowd = { nodes: [{ id: 'a', kind: 'staff', label: 'نص طويل جدا جدا جدا جدا جدا جدا جدا جدا', x: 40, y: 40, w: 80, h: 30 }, { id: 'b', kind: 'staff', label: 'ب', x: 130, y: 40, w: 80, h: 52 }], edges: [{ from: 'a', to: 'b', label: 'تسمية' }] };
  const over = DIAGRAM.legibility(crowd, { frameMm: frameFor(12) });
  check('F5 (2) text overrunning its own shape is reported as an overlap', over.overlaps.length > 0 && !over.ok, JSON.stringify(over.overlaps));
  const doc = clone(load('en'));
  doc.chapters[0].sections[0].blocks.push({ kind: 'diagram', model: m });
  const warn = diagramWarnings(doc, { theme, locale: 'ar', frameMm: frameFor(5) });
  check('F5 (2) export warns (never blocks) for a diagram that prints too small', warn.length === 1 && /pt/.test(warn[0]), warn.join(' | '));
}
{
  // (3) PNG through the headless path: expected width, not blank, and the CLI writes the same
  const f = DIAGRAM.splitByPhase(bigWorkflow(), { maxNodes: 20 })[0].model;
  const png = path.join(OUT, 'fig.png');
  const r = await renderDiagramPng(f, { theme, locale: 'ar', scale: 2, pngPath: png });
  const buf = fs.readFileSync(png);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  check('F5 (3) --png writes a PNG at the expected pixel width (view width x scale)', buf.subarray(1, 4).toString() === 'PNG' && w === r.width && h === r.height && w === Math.ceil(DIAGRAM.resolve(f).view.w) * 2, `${w}x${h}`);
  // decode (8-bit RGB/RGBA, non-interlaced) and count pixels that are not the paper colour
  const colour = buf[25];
  const bpp = colour === 6 ? 4 : colour === 2 ? 3 : 0;
  let idat = Buffer.alloc(0);
  for (let o = 8; o < buf.length;) { const len = buf.readUInt32BE(o); const type = buf.subarray(o + 4, o + 8).toString(); if (type === 'IDAT') idat = Buffer.concat([idat, buf.subarray(o + 8, o + 8 + len)]); o += 12 + len; }
  const raw = zlib.inflateSync(idat);
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y += 1) {
    const ft = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const v = raw[y * (stride + 1) + 1 + x];
      const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
      px[y * stride + x] = (v + (ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
  }
  let ink = 0;
  for (let i = 0; i < px.length; i += bpp) if (px[i] < 250 || px[i + 1] < 250 || px[i + 2] < 250) ink += 1;
  const frac = ink / (w * h);
  check('F5 (3) the PNG is not blank (more than 2 % non-background pixels)', bpp > 0 && frac > 0.02, `${(frac * 100).toFixed(1)} %`);
  const cli = spawnSync(process.execPath, [path.join(REPO, 'engine', 'diagram-cli.mjs'), '--png', path.join(OUT, 'm.json'), '--out', path.join(OUT, 'cli.png'), '--scale', '1'], { encoding: 'utf8' });
  void cli;
}
{
  // the CLI, through its real entry point
  const mf = path.join(OUT, 'm.json');
  fs.writeFileSync(mf, JSON.stringify(DIAGRAM.splitByPhase(bigWorkflow(), { maxNodes: 20 })[0].model));
  const cliPng = path.join(OUT, 'cli.png');
  const r1 = spawnSync(process.execPath, [path.join(REPO, 'engine', 'diagram-cli.mjs'), '--png', mf, '--out', cliPng, '--scale', '1'], { encoding: 'utf8', env: { ...process.env, INIT_CWD: OUT } });
  check('F5 (3) CLI --png exits 0 and the file exists', r1.status === 0 && fs.existsSync(cliPng) && fs.statSync(cliPng).size > 1000, (r1.stderr || '').slice(0, 300));
  const r2 = spawnSync(process.execPath, [path.join(REPO, 'engine', 'diagram-cli.mjs'), '--legibility', mf, '--frame', '269x140'], { encoding: 'utf8', env: { ...process.env, INIT_CWD: OUT } });
  let j = {};
  try { j = JSON.parse(r2.stdout); } catch { /* reported below */ }
  check('F5 CLI --legibility prints the figures and its exit code follows ok', typeof j.minPtPrinted === 'number' && (r2.status === 0) === !!j.ok, `${j.minPtPrinted} pt, exit ${r2.status}`);
}
void printHtml;
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nall ${results.length} PASS`);
process.exit(failed ? 1 : 0);
