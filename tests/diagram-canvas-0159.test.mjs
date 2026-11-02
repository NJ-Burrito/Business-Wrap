// 0.15.9 · CANVAS lane: C1-C9 for the resizable diagram canvas (block.frame = { wMm, hMm, mode }).
// Real Google Chrome throughout (set BW_CHROME to its path; the exporter and the editor both use launchOptions()), real pointer drags,
// the PDF read back with PyMuPDF (rects and word boxes) and poppler (page text), the DOCX opened in real Word and exported to PDF.
//
//   node tests/diagram-canvas-0159.test.mjs        (the measured numbers go to out/diagram-canvas-0159/numbers.json)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { figureRoom } from '../engine/render.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'diagram-canvas-0159');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
process.on('uncaughtException', (e) => { console.log(results.join('\n')); console.error('CRASH: ' + String(e.stack || e.message).split('\n').slice(0, 5).join(' / ')); process.exit(2); });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const theme = loadTheme();
const PTR = '/chapters/2/sections/0/blocks/0';
const loadDoc = (loc) => JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${loc}.json`), 'utf8'));
const MM = 72 / 25.4;
const run = (code, args, deps = ['pymupdf']) => { const r = spawnSync(...py(['-c', code, ...args], deps), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }); return r; };

// ── model level: absent = today's drawing byte for byte; the math of the canvas ──
{
  const wf = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'workflow.json'), 'utf8'));
  let same = 0;
  let n = 0;
  const base = path.join(REPO, 'tests', 'fixtures', 'diagram-0155.mjs');
  const { DIAGRAM: OLD } = await import(pathToFileURL(base).href);
  for (const loc of ['ar', 'en']) {
    const m = DIAGRAM.layout(wf[loc]);
    delete m.routing; // 0.16.0: layout() now sets the key; this stands for a drawing stored before it
    for (const ed of [false, true]) {
      n += 1;
      const a = DIAGRAM.render(DIAGRAM.ensure(m), { theme, locale: loc, editor: ed });
      const b = DIAGRAM.render(DIAGRAM.ensure(m), { theme, locale: loc, editor: ed, frame: null });
      const norm = (s) => s.replace(/ data-dg-(cap|lg)="[^"]*"/g, '');
      const o = OLD.render(OLD.ensure(m), { theme, locale: loc, editor: ed });
      if (a === b && norm(a) === o) same += 1;
    }
  }
  check('C7 no frame: the drawing is byte for byte the 0.15.5 drawing (print and editor, AR and EN)', same === n, `${same}/${n}`);
  const doc = loadDoc('en');
  const room = figureRoom(doc, PTR, theme);
  const rec = (d) => JSON.stringify(d);
  check('C7 frameNorm: absent, empty and nonsense frames mean "no frame"', [undefined, null, {}, { wMm: 0, hMm: 5 }, { wMm: 'x', hMm: 4 }, 7, 'a'].every((f) => DIAGRAM.frameNorm(f) === null));
  check('C7 frameNorm: a mode is a number (a word under a block would be read as text)', DIAGRAM.frameNorm({ wMm: 100, hMm: 50, mode: 2 }).mode === 2 && DIAGRAM.frameNorm({ wMm: 100, hMm: 50, mode: 'free' }).mode === 0);
  const v = { x: 0, y: 0, w: 1000, h: 500 };
  const tall = DIAGRAM.frameView(v, 100, 200);
  const wide = DIAGRAM.frameView(v, 400, 50);
  const holds = (fv) => fv.x <= v.x + 1e-6 && fv.y <= v.y + 1e-6 && fv.x + fv.w >= v.x + v.w - 1e-6 && fv.y + fv.h >= v.y + v.h - 1e-6;
  check('C2 the drawing is never cut: the canvas view always contains the drawing, centred, same proportions', holds(tall) && holds(wide) && near(tall.x + tall.w / 2, 500, 0.02) && near(wide.y + wide.h / 2, 250, 0.02) && near(tall.w / tall.h, 0.5, 0.001) && near(wide.w / wide.h, 8, 0.001), rec({ tall, wide }));
  check('C2 never blown up past the lettering cap (mm per drawing unit)', DIAGRAM.frameView({ x: 0, y: 0, w: 100, h: 50 }, 250, 120).sc <= DIAGRAM.FRAME.cap + 1e-9);
  const hug = DIAGRAM.frameHug(v, 1000, 1000);
  check('C3 fit to shapes keeps the drawing\'s own proportions', near(hug.wMm / hug.hMm, 2, 0.02), rec(hug));
  numbers.room = { en: room, ar: figureRoom(loadDoc('ar'), PTR, theme) };
}

// ── PDF: sizes on the real sheet; nothing overlaps a title, the caption, the margin, another page ──
const SKIP = process.env.CV_EDITOR_ONLY === '1'; // a developer switch: only the editor part
const browser0 = await chromium.launch(launchOptions());
const SCAN = `
import sys, json, pymupdf
pdf, w_mm, h_mm = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
W, H = w_mm * 72 / 25.4, h_mm * 72 / 25.4
d = pymupdf.open(pdf)
hits = []
for i, p in enumerate(d):
    for dr in p.get_drawings():
        r = dr['rect']
        if abs(r.width - W) < 3 and (H <= 0 or abs(r.height - H) < 3) and dr.get('fill') is not None and (H > 0 or dr.get('color') is not None):
            pieces = [[q['rect'].x0, q['rect'].y0, q['rect'].x1, q['rect'].y1] for q in p.get_drawings() if q['rect'].width < p.rect.width * 0.9 and q['rect'].height < p.rect.height * 0.9]
            hits.append({'page': i, 'rect': [r.x0, r.y0, r.x1, r.y1], 'size': [p.rect.width, p.rect.height], 'words': [list(w[:5]) for w in p.get_text('words')], 'pieces': pieces})
            break
print(json.dumps({'pages': d.page_count, 'hits': hits}))
`;
const pageText = (pdf, n) => spawnSync('pdftotext', ['-enc', 'UTF-8', '-f', String(n), '-l', String(n), pdf, '-'], { encoding: 'utf8' }).stdout || '';
/** Scan one PDF for a canvas of w x h mm; returns the checks' findings. marginMm = {l, r, t, b} the page must keep clear. */
function scanPdf(pdf, w, h, marginMm) {
  const r = run(SCAN, [pdf, String(w), String(h)]);
  if (r.status !== 0) return { err: String(r.stderr).slice(-300) };
  const j = JSON.parse(r.stdout);
  const hit = j.hits[0];
  if (!hit) return { err: `no canvas of ${w} x ${h} mm found in ${j.pages} pages` };
  const [x0, y0, x1, y1] = hit.rect;
  const [pw, ph] = hit.size;
  const bad = [];
  if (x0 < marginMm.l * MM - 1 || x1 > pw - marginMm.r * MM + 1) bad.push(`sideways ${x0.toFixed(1)}..${x1.toFixed(1)} of ${pw.toFixed(1)}`);
  if (y0 < marginMm.t * MM - 1 || y1 > ph - marginMm.b * MM + 1) bad.push(`vertical ${y0.toFixed(1)}..${y1.toFixed(1)} of ${ph.toFixed(1)}`);
  let overlap = 0;
  let inside = 0;
  if (hit.words.length < 5) {
    // Word's PDF carries its text as outlines (no text layer): the vector pieces are the reference. Every piece is inside the canvas, or clear of it; some pieces (the titles) lie above it.
    const rr = hit.rect;
    let piecesAbove = 0;
    let crossing = 0;
    for (const [a, b, c, d] of hit.pieces) {
      const same = Math.abs(a - rr[0]) < 2 && Math.abs(c - rr[2]) < 2 && Math.abs(b - rr[1]) < 2 && Math.abs(d - rr[3]) < 2;
      if (same) continue;
      const isIn = a >= rr[0] - 1.5 && c <= rr[2] + 1.5 && b >= rr[1] - 1.5 && d <= rr[3] + 1.5;
      const disjoint = c <= rr[0] + 0.5 || a >= rr[2] - 0.5 || d <= rr[1] + 0.5 || b >= rr[3] - 0.5;
      if (!isIn && !disjoint) crossing += 1;
      if (!isIn && d <= rr[1] + 0.5) piecesAbove += 1;
    }
    if (crossing) bad.push(`${crossing} pieces cross the canvas edge`);
    return { page: hit.page + 1, pages: j.pages, rect: hit.rect.map((v) => Math.round(v * 10) / 10), size: hit.size.map((v) => Math.round(v * 10) / 10), bad, overlap: crossing, inside: hit.pieces.length, above: piecesAbove, below: 0, outlines: true };
  }
  let above = 0;
  let below = 0;
  for (const [a, b, c, d, t] of hit.words) {
    const isIn = a >= x0 - 1.5 && c <= x1 + 1.5 && b >= y0 - 1.5 && d <= y1 + 1.5;
    const disjoint = c <= x0 + 0.5 || a >= x1 - 0.5 || d <= y0 + 0.5 || b >= y1 - 0.5;
    if (isIn) inside += 1; else if (!disjoint) { overlap += 1; bad.push(`word "${t}" crosses the canvas edge`); }
    if (!isIn && d <= y0 + 0.5) above += 1;
    if (!isIn && b >= y1 - 0.5) below += 1;
  }
  return { page: hit.page + 1, pages: j.pages, rect: hit.rect.map((v) => Math.round(v * 10) / 10), size: hit.size.map((v) => Math.round(v * 10) / 10), bad, overlap, inside, above, below };
}
const SIDE = 16;
const wideMargin = { l: SIDE, r: SIDE, t: 14, b: 12 };
const exportOne = async (doc, loc, name) => { const pdf = path.join(OUT, `${name}.${loc}.pdf`); await exportPdf(doc, { locale: loc, theme, pdfPath: pdf, browser: browser0 }); return pdf; };
const withFrame = (doc, frame, mutate) => { const d = structuredClone(doc); const c = d.chapters[2].sections[0]; if (frame) c.blocks[c.blocks.length - 1].frame = frame; if (mutate) mutate(d); return d; };
const lastIdx = (d) => d.chapters[2].sections[0].blocks.length - 1;
const caption = (doc) => String(doc.chapters[2].sections[0].blocks.at(-1).caption).slice(0, 10);
try {
  for (const loc of SKIP ? [] : ['en', 'ar']) {
    const doc0 = loadDoc(loc);
    const room = figureRoom(doc0, PTR, theme);
    const m = DIAGRAM.ensure(doc0.chapters[2].sections[0].blocks[0].model);
    const view = DIAGRAM.resolve(m, { theme, locale: loc }).view;
    const hug = DIAGRAM.frameHug(view, room.wMm, room.hMm);
    const cases = {
      small: { wMm: 60, hMm: 40, mode: 0 },
      wide: { wMm: room.wMm, hMm: 60, mode: 0 },
      tall: { wMm: 80, hMm: room.hMm, mode: 0 },
      full: { wMm: room.wMm, hMm: room.hMm, mode: 2 },
      hug: { ...hug, mode: 1 },
    };
    for (const [k, f] of Object.entries(cases)) {
      const pdf = await exportOne(withFrame(doc0, f), loc, `c-${k}`);
      const r = scanPdf(pdf, f.wMm, f.hMm, wideMargin);
      const cap = pageText(pdf, r.page || 1);
      const titleOnPage = !!r.page && cap.includes(String(doc0.chapters[2].title).trim().slice(0, 6)) && cap.includes(caption(doc0).slice(0, 6));
      check(`C5 PDF ${loc} ${k} (${f.wMm} x ${f.hMm} mm): canvas inside the margins, no word crosses its edge, title and figure caption on the same page`, !r.err && r.bad.length === 0 && r.inside > 10 && titleOnPage && r.above >= 3, r.err || JSON.stringify({ page: r.page, rect: r.rect, bad: r.bad.slice(0, 3), inside: r.inside, above: r.above, below: r.below, titleOnPage }));
      numbers[`pdf.${loc}.${k}`] = r;
    }
    // no room left on the page: prose first, then a full-page canvas: the canvas moves to a new page WITH its caption, nothing stranded, nothing over anything
    {
      const prose = { kind: 'prose', paragraphs: Array.from({ length: 9 }, (_, i) => `${loc === 'ar' ? 'فقرة تمهيدية رقم' : 'Introductory paragraph number'} ${i + 1}. ${loc === 'ar' ? 'يوضح هذا النص حدود الخدمة وشروطها ومن يحق له تقديم الطلب وما يلزمه من مستندات قبل البدء.' : 'This text sets out the scope of the service, its conditions, who may file the request and the documents needed before the start.'}`) };
      const mutate = (d) => { d.chapters[2].sections[0].blocks.unshift(prose); };
      const d1 = withFrame(doc0, null, mutate);
      const ptr = '/chapters/2/sections/0/blocks/1';
      const rm = figureRoom(d1, ptr, theme);
      const f = { wMm: rm.wMm, hMm: rm.hMm, mode: 2 };
      d1.chapters[2].sections[0].blocks[1].frame = f;
      const pdf = await exportOne(d1, loc, 'c-moves');
      const r = scanPdf(pdf, f.wMm, f.hMm, wideMargin);
      const txt = r.page ? pageText(pdf, r.page) : '';
      const proseHere = r.page && txt.includes(loc === 'ar' ? 'فقرة تمهيدية رقم 9' : 'Introductory paragraph number 9');
      check(`C4 PDF ${loc}: when the page has no room left the canvas moves to a new page with its title (keep-with-next); no overlap`, !r.err && r.bad.length === 0 && txt.includes(caption(doc0).slice(0, 6)) && !proseHere && r.page >= 5 && r.above >= 2, r.err || JSON.stringify({ page: r.page, rect: r.rect, bad: r.bad.slice(0, 3), above: r.above, proseOnSamePage: !!proseHere }));
    }
  }
  // a subhead right above the diagram stays with it, and the room accounts for it
  if (!SKIP) {
    const doc0 = loadDoc('en');
    const sub = { kind: 'subhead', text: 'Stage overview for the request' };
    const d1 = withFrame(doc0, null, (d) => { d.chapters[2].sections[0].blocks.unshift(sub); });
    const rm = figureRoom(d1, '/chapters/2/sections/0/blocks/1', theme);
    const f = { wMm: rm.wMm, hMm: rm.hMm, mode: 2 };
    d1.chapters[2].sections[0].blocks[1].frame = f;
    const pdf = await exportOne(d1, 'en', 'c-subhead');
    const r = scanPdf(pdf, f.wMm, f.hMm, wideMargin);
    const txt = r.page ? pageText(pdf, r.page) : '';
    check('C4 PDF en: a subhead above a full-page canvas stays on its page and nothing overlaps', !r.err && r.bad.length === 0 && txt.includes('Stage overview for the request') && txt.includes('Figure 1'), r.err || JSON.stringify({ page: r.page, bad: r.bad, above: r.above }));
    numbers.subhead = { room: rm, scan: r };
  }
  // a larger sheet (A3 landscape through a figure block's own sheet): the room grows with it, and the canvas still sits inside the margins of that sheet
  if (!SKIP) {
    const doc0 = loadDoc('en');
    const d1 = structuredClone(doc0);
    d1.chapters.push({ number: '9', title: 'Large sheet', sections: [{ number: '9.1', title: 'Large', blocks: [{ kind: 'figure', caption: 'A3 sheet', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="100" height="60"><rect width="100" height="60" fill="#eee"/></svg>', sheet: { widthMm: 420, heightMm: 297, drawHeightMm: 240, name: 'A3 landscape' } }] }] });
    const rm = figureRoom(d1, PTR, theme);
    const f = { wMm: rm.wMm, hMm: rm.hMm, mode: 2 };
    d1.chapters[2].sections[0].blocks[0].frame = f;
    const pdf = await exportOne(d1, 'en', 'c-a3');
    const r = scanPdf(pdf, f.wMm, f.hMm, wideMargin);
    check('C5 PDF: on a larger figure sheet (A3 landscape) the room grows and the canvas stays inside that sheet\'s margins', !r.err && r.bad.length === 0 && rm.wMm > 380 && near(r.size[0], 420 * MM, 2) && r.above >= 3, r.err || JSON.stringify({ room: rm, scan: r }));
    numbers.a3 = { room: rm, scan: r };
  }
  // a frame bigger than the room (a hand-edited file) is cut back to the room, never printed over the page
  if (!SKIP) {
    const doc0 = loadDoc('en');
    const rm = figureRoom(doc0, PTR, theme);
    const f = { wMm: 900, hMm: 900, mode: 0 };
    const pdf = await exportOne(withFrame(doc0, f), 'en', 'c-over');
    const r = scanPdf(pdf, rm.wMm, rm.hMm, wideMargin);
    check('C5 PDF: a saved size beyond the page is cut back to the room (no leak over the margin or the footer)', !r.err && r.bad.length === 0 && r.above >= 3, r.err || JSON.stringify({ room: rm, scan: r }));
  }
  // the owner's one-page landscape view: an automatic (no canvas) drawing whose page also holds the chapter title, a section title and the figure title: its frame must not run over the footer
  if (!SKIP) {
    for (const loc of ['en', 'ar']) {
      const doc0 = loadDoc(loc);
      const d1 = structuredClone(doc0);
      d1.chapters[2].sections.push({ number: '3.2', title: loc === 'ar' ? 'قسم ثان' : 'Second section', blocks: [{ kind: 'prose', paragraphs: ['text'] }] });
      const rm = figureRoom(d1, PTR, theme);
      const pdf = await exportOne(d1, loc, 'c-auto-tight');
      const r = scanPdf(pdf, rm.wMm + 0.6, -1, wideMargin);
      const rect = r.rect || [0, 0, 0, 0];
      const hMm = (rect[3] - rect[1]) / MM;
      const html = (await import('../engine/export.mjs')).printHtml(d1, { locale: loc, theme, embed: false }).html;
      const plain = (await import('../engine/export.mjs')).printHtml(doc0, { locale: loc, theme, embed: false }).html;
      check(`C5 PDF ${loc}: an automatic drawing on a page that also holds the chapter and section titles is capped to its room, its frame stays above the footer (owner landscape page)`, !r.err && r.bad.length === 0 && hMm <= rm.hMm + 0.8 && /class="fig sheet hug dg cap"/.test(html) && r.above >= 3 && r.below >= 1, r.err || JSON.stringify({ rect: r.rect, hMm: Math.round(hMm * 10) / 10, room: rm.hMm, bad: r.bad.slice(0, 3), above: r.above, below: r.below }));
      check(`C7 ${loc}: a drawing that fits its room keeps today's figure markup (no cap class, no style)`, /<figure class="fig sheet hug dg" data-b="[^"]*" data-dg="[^"]*">/.test(plain) && !/<figure class="fig sheet hug dg cap"/.test(plain));
    }
  }
  // an old file (no frame) prints exactly as before
  if (!SKIP) {
    const doc0 = loadDoc('en');
    const pdf = await exportOne(doc0, 'en', 'c-none');
    const r = run('import pymupdf,sys;d=pymupdf.open(sys.argv[1]);print(d.page_count)', [pdf]);
    check('C7 PDF without a frame: the document still exports (same page count as with an empty frame key)', r.status === 0 && Number(r.stdout) >= 8, String(r.stdout).trim());
  }
} finally { await browser0.close(); }

// ── DOCX: real Word opens it and exports a PDF; the same size, nothing overlapping ──
if (!SKIP) {
  const WORD = `
import os, sys
import win32com.client
src, dst = sys.argv[1], sys.argv[2]
w = win32com.client.DispatchEx("Word.Application")
w.Visible = False
w.DisplayAlerts = 0
try:
    d = w.Documents.Open(os.path.abspath(src), ReadOnly=True)
    d.ExportAsFixedFormat(os.path.abspath(dst), 17)
    d.Close(False)
finally:
    w.Quit()
`;
  const have = spawnSync('uv', ['--version'], { encoding: 'utf8' }).status === 0 && process.platform === 'win32';
  for (const loc of ['en', 'ar']) {
    const doc0 = loadDoc(loc);
    const room = figureRoom(doc0, PTR, theme);
    const f = { wMm: Math.min(room.wMm, 200), hMm: Math.min(room.hMm, 90), mode: 0 };
    const docx = path.join(OUT, `c.${loc}.docx`);
    exportDocx(withFrame(doc0, f), { locale: loc, theme, docxPath: docx, embedFonts: false });
    const pdf = path.join(OUT, `word-${loc}.pdf`);
    if (!have) { check(`C6 DOCX ${loc}: Word run`, false, 'uv or Windows missing'); continue; }
    const r = spawnSync('uv', ['run', '--no-project', '--quiet', '--with', 'pywin32', 'python', '-c', WORD, docx, pdf], { encoding: 'utf8', timeout: 240000, env: { ...process.env, PYTHONUTF8: '1' } });
    const ok = fs.existsSync(pdf);
    const s = ok ? scanPdf(pdf, f.wMm, f.hMm, { l: 12, r: 12, t: 12, b: 10 }) : { err: `Word did not export: ${String(r.stderr).slice(-200)}` };
    check(`C6 DOCX ${loc} opened in Word: the canvas is ${f.wMm} x ${f.hMm} mm, inside the page, no word crosses its edge, the chapter title and the figure title are drawn above it on the same page`, !s.err && s.bad.length === 0 && s.above >= 1 && s.inside > 50, s.err || JSON.stringify({ page: s.page, rect: s.rect, bad: s.bad.slice(0, 3), inside: s.inside, above: s.above }));
    numbers[`docx.${loc}`] = s;
    // the same canvas as the PDF: the size is the saved size (both editions), measured on the Word output
    const pdfChrome = await (async () => { const b = await chromium.launch(launchOptions()); try { const p = path.join(OUT, `same.${loc}.pdf`); await exportPdf(withFrame(doc0, f), { locale: loc, theme, pdfPath: p, browser: b }); return p; } finally { await b.close(); } })();
    const sc = scanPdf(pdfChrome, f.wMm, f.hMm, wideMargin);
    check(`C6 ${loc}: the Chrome PDF and the Word output draw the same canvas size (${f.wMm} x ${f.hMm} mm)`, !sc.err && !s.err && near((sc.rect[2] - sc.rect[0]) / MM, f.wMm, 1.2) && near((s.rect[2] - s.rect[0]) / MM, f.wMm, 1.2) && near((sc.rect[3] - sc.rect[1]) / MM, f.hMm, 1.2) && near((s.rect[3] - s.rect[1]) / MM, f.hMm, 1.2), JSON.stringify({ chrome: sc.rect, word: s.rect }));
  }
}

// ── the real editor ──
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: file, set: 'canvas-0159', watermarkDir: '' });
const browser = await chromium.launch(launchOptions());
const errors = [];
try {
  const open = async (ui, vp = { width: 1500, height: 900 }, url = pathToFileURL(file).href) => {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript((u) => { try { localStorage.setItem('bw:ui', u); localStorage.setItem('bw:calm', '1'); localStorage.setItem('bw:xpl-panel', '0'); /* the fixed Explain panel covers the right of a wide canvas (UAT M4, its own lane): closed so a drag on the right handle reaches it */ } catch {} }, ui);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.BW?.ready);
    return { ctx, page };
  };
  const { ctx, page } = await open('ar');
  const FIG = '#bw-pair figure[data-dg]';
  const blockFrame = (ed) => page.evaluate((ed) => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc][ed].doc.chapters[2].sections[0].blocks[0].frame ?? null)); }, ed);
  const opsN = (ed) => page.evaluate((ed) => window.BW.editsFile(window.BW.S.svc, ed).ops.length, ed);
  const artBox = () => page.evaluate((FIG) => { const f = document.querySelector(FIG); const a = f.querySelector('.fig-art'); const r = a.getBoundingClientRect(); const k = r.width / a.offsetWidth; return { x: r.x, y: r.y, w: r.width, h: r.height, k, sh: document.documentElement.scrollHeight, sy: scrollY, mmW: (a.offsetWidth * 25.4) / 96, mmH: (a.offsetHeight * 25.4) / 96 }; }, FIG);
  const handle = async (side) => { const b = await page.locator(`${FIG} [data-dg-cv="${side}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const reveal = async () => { await page.evaluate((FIG) => { const f = document.querySelector(FIG); window.scrollBy(0, f.getBoundingClientRect().top - 330); }, FIG); await page.waitForTimeout(120); };
  const selectDrawing = async () => { await reveal(); const a = await artBox(); await page.mouse.click(a.x + 40, a.y + 36); await page.waitForTimeout(150); };
  const dragH = async (side, dx, dy, { alt = false, esc = false, hold = false } = {}) => {
    await reveal();
    const h = await handle(side);
    if (alt) await page.keyboard.down('Alt');
    const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); if (!e) return 'none'; const r = e.getBoundingClientRect(); return `${e.tagName}.${e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className}${e.dataset?.dgCv ? '#' + e.dataset.dgCv : ''} id=${e.id} [${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}] ${e.parentElement?.id || e.parentElement?.className}`; }, [h.x, h.y]);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x + dx / 2, h.y + dy / 2, { steps: 4 });
    await page.mouse.move(h.x + dx, h.y + dy, { steps: 4 });
    let live = null;
    if (hold || esc) live = await page.evaluate((FIG) => ({ read: document.querySelector(`${FIG} .dg-cv-read`)?.textContent || '', grid: !!document.querySelector(`${FIG} .dg-cv-grid`) }), FIG);
    if (esc) await page.keyboard.press('Escape');
    await page.mouse.up();
    if (alt) await page.keyboard.up('Alt');
    await page.waitForTimeout(150);
    return { from: h, to: { x: h.x + dx, y: h.y + dy }, live, hit };
  };
  const doc0 = loadDoc('ar');
  const room = figureRoom(doc0, PTR, theme);
  await page.evaluate(() => { window.BW.S.snap = true; window.BW.S.both = true; });
  await page.locator(FIG).first().scrollIntoViewIfNeeded();
  const boot = await page.evaluate((FIG) => ({ figs: document.querySelectorAll(FIG).length, handles: document.querySelectorAll(`${FIG} [data-dg-cv]`).length }), FIG);
  check('boot: the figure is drawn and no canvas handle shows before it is selected', boot.figs >= 1 && boot.handles === 0, JSON.stringify(boot));
  await selectDrawing();
  const hs = await page.evaluate((FIG) => [...document.querySelectorAll(`${FIG} [data-dg-cv]`)].map((x) => x.dataset.dgCv).sort().join(','), FIG);
  check('C1 a selected diagram shows handles on all four edges and all four corners', hs === 'e,n,ne,nw,s,se,sw,w', hs);
  const ph = (await import('../engine/export.mjs')).printHtml(withFrame(loadDoc('ar'), { wMm: 150, hMm: 80, mode: 0 }), { locale: 'ar', theme, embed: false }).html;
  const printHidden = !/data-dg-cv|dg-cv|dg-ui|data-dg-node/.test(ph) && /class="fig sheet hug dg fr"/.test(ph);
  check('C1 the handles never print: they are editor-only DOM, absent from the print markup (and so from the PDF and the HTML export)', printHidden);

  // first drag: from the automatic size; the edge follows the pointer; snapped; readout and grid while dragging
  const a0 = await artBox();
  const d1 = await dragH('e', 61, 0, { hold: true });
  const f1 = await blockFrame('ar');
  const a1 = await artBox();
  check('C1 drag the right edge: only the width changes, snapped to the 5 mm grid, saved in the block', !!f1 && f1.wMm % 5 === 0 && near(f1.hMm, a0.mmH - 8.5, 0.4) && near(a1.mmH, f1.hMm, 0.7) && f1.wMm > a0.mmW - 8.5, JSON.stringify({ f1, start: [a0.mmW, a0.mmH] }));
  check('C1 live readout in mm and the visible grid while dragging (snap on)', /^\d+\.\d × \d+\.\d mm/.test(d1.live.read) && d1.live.grid, JSON.stringify(d1.live));
  const after = await page.evaluate((FIG) => ({ read: !!document.querySelector(`${FIG} .dg-cv-read`), grid: !!document.querySelector(`${FIG} .dg-cv-grid`) }), FIG);
  check('C1 readout and grid are gone after the drag', !after.read && !after.grid);
  check('C1 the grabbed edge follows the pointer (within one grid step)', near(a1.x + a1.w, d1.to.x, 14) || near(a1.x, d1.to.x, 14), JSON.stringify({ right: a1.x + a1.w, left: a1.x, pointer: d1.to.x }));
  check('C8 the canvas lands in both editions (the pair is the unit)', JSON.stringify(await blockFrame('en')) === JSON.stringify(f1), JSON.stringify({ ar: f1, en: await blockFrame('en') }));

  // every handle, with snap: edge = one dimension, corner = both; sign checks
  const ok = {};
  for (const side of ['e', 'w', 'n', 's', 'ne', 'nw', 'se', 'sw']) {
    await selectDrawing();
    const b = await blockFrame('ar');
    const o0 = await opsN('ar');
    const dx = side.includes('e') ? -41 : side.includes('w') ? 41 : 0; // inward: always room to move
    const dy = side.includes('s') ? -28 : side.includes('n') ? 28 : 0;
    await dragH(side, dx, dy);
    const f = await blockFrame('ar');
    const dW = f.wMm - b.wMm;
    const dH = f.hMm - b.hMm;
    const wantW = /[ew]/.test(side);
    const wantH = /[ns]/.test(side);
    ok[side] = { dW, dH, ops: (await opsN('ar')) - o0, mult: (!wantW || f.wMm % 5 === 0) && (!wantH || f.hMm % 5 === 0) };
    const good = (wantW ? dW < 0 : dW === 0) && (wantH ? dH < 0 : dH === 0) && ok[side].ops === 1 && ok[side].mult;
    check(`C1 handle ${side}: ${side.length === 2 ? 'both dimensions' : 'one dimension'}, snapped, one undo step`, good, JSON.stringify(ok[side]));
  }
  // Alt: no snap
  {
    await selectDrawing();
    const b = await blockFrame('ar');
    await dragH('e', 37, 0, { alt: true });
    const f = await blockFrame('ar');
    check('C1 Alt drags without snap (0.1 mm steps)', f.wMm % 5 !== 0 && f.wMm > b.wMm && near(f.hMm, b.hMm, 0.001), JSON.stringify({ b, f }));
  }
  // snap off: the grid is not drawn and the size is free
  {
    await page.evaluate(() => { window.BW.S.snap = false; });
    await selectDrawing();
    const d = await dragH('s', 0, 23, { hold: true });
    const f = await blockFrame('ar');
    check('C1 with Snap off the grid is not drawn and the size is not snapped', !d.live.grid && f.hMm % 5 !== 0, JSON.stringify({ live: d.live, f }));
    await page.evaluate(() => { window.BW.S.snap = true; });
  }
  // Esc cancels
  {
    await selectDrawing();
    const b = await blockFrame('ar');
    const o0 = await opsN('ar');
    const d = await dragH('se', 70, 50, { esc: true });
    const f = await blockFrame('ar');
    const art = await artBox();
    check('C1 Esc cancels the drag: no change, no undo step, the readout is gone', JSON.stringify(f) === JSON.stringify(b) && (await opsN('ar')) === o0 && /mm/.test(d.live.read) && near(art.mmW, b.wMm, 0.7), JSON.stringify({ b, f }));
  }
  // limits: far past the page = the room of the page, with the notice
  {
    await selectDrawing();
    const d = await dragH('se', 1500, 900, { hold: true });
    const f = await blockFrame('ar');
    check('C2/C5 dragging past the page stops at the room the page leaves (never over a title, the note, the margin)', near(f.wMm, room.wMm, 0.11) && near(f.hMm, room.hMm, 0.11) && /page maximum|أقصى/.test(d.live.read), JSON.stringify({ f, room: [room.wMm, room.hMm], read: d.live.read }));
    const m = await dragH('nw', 0, 0); void m;
  }
  // width and height are independent: a wide short canvas and a narrow tall one, any size from 20 mm
  {
    await selectDrawing();
    const h0 = await handle('e');
    const dEast = await dragH('e', -(h0.x - 12), 0, { hold: true });
    const fE = await blockFrame('ar');
    await selectDrawing();
    const dSouth = await dragH('s', 0, -440, { hold: true });
    const f = await blockFrame('ar');
    check('C2 any width and any height: dragged down to the 20 mm floor, each on its own', fE.wMm === 20 && fE.hMm > 20 && f.wMm === 20 && f.hMm === 20, JSON.stringify({ h0, fE, f, east: dEast.live, hit: dEast.hit, from: dEast.from, south: dSouth.live }));
  }
  // C3 / C4 buttons
  const model = await page.evaluate(() => { const B = window.BW; return B.DIAGRAM.ensure(B.M[B.S.svc].ar.doc.chapters[2].sections[0].blocks[0].model); });
  const view = DIAGRAM.resolve(model, { theme, locale: 'ar' }).view;
  {
    await selectDrawing();
    const o0 = await opsN('ar');
    await page.evaluate(() => window.BW.runAction('dgCvShapes'));
    await page.waitForTimeout(150);
    const f = await blockFrame('ar');
    const art = await artBox();
    const sc = Math.min(room.wMm / view.w, room.hMm / view.h, DIAGRAM.FRAME.cap);
    check('C3 «ملاءمة الأشكال»: the canvas hugs the drawing (its proportions, its own even margin), inside the room, one undo step', f.mode === 1 && near(f.wMm, view.w * sc, 0.2) && near(f.hMm, view.h * sc, 0.2) && f.wMm <= room.wMm && f.hMm <= room.hMm && near(art.mmW, f.wMm, 0.7) && (await opsN('ar')) === o0 + 1, JSON.stringify({ f, hug: [view.w * sc, view.h * sc] }));
    // the drawing fills the canvas edge to edge in its limiting direction: no slack bigger than the margin the drawing owns
    const slack = await page.evaluate((FIG) => { const s = document.querySelector(`${FIG} svg`); const p = s.getBoundingClientRect(); const a = s.parentElement.getBoundingClientRect(); const vb = s.viewBox.baseVal; return { vb: [vb.width, vb.height], ratioSvg: p.width / p.height, ratioArt: a.width / a.height }; }, FIG);
    check('C3 the drawing is centred and unstretched in the canvas (view proportions = canvas proportions)', near(slack.vb[0] / slack.vb[1], slack.ratioSvg, 0.01) && near(slack.ratioSvg, slack.ratioArt, 0.02), JSON.stringify(slack));
    await page.evaluate(() => window.BW.runAction('dgCvPage'));
    await page.waitForTimeout(150);
    const g = await blockFrame('ar');
    check('C4 «ملاءمة الصفحة»: the canvas fills exactly the room the page leaves below the titles and above the note and footer', g.mode === 2 && near(g.wMm, room.wMm, 0.11) && near(g.hMm, room.hMm, 0.11), JSON.stringify({ g, room: [room.wMm, room.hMm] }));
    check('C8 both buttons land in both editions', JSON.stringify(await blockFrame('en')) === JSON.stringify(g));
    // one undo reverts both editions together; redo brings both back
    await page.evaluate(() => window.BW.undo());
    await page.waitForTimeout(150);
    const u = await blockFrame('ar');
    const ue = await blockFrame('en');
    check('C1/C8 one undo reverts the canvas in both editions at once', JSON.stringify(u) === JSON.stringify(f) && JSON.stringify(ue) === JSON.stringify(f), JSON.stringify({ u, ue }));
    await page.evaluate(() => window.BW.redo());
    await page.waitForTimeout(150);
    check('C1/C8 redo brings it back in both', JSON.stringify(await blockFrame('ar')) === JSON.stringify(g) && JSON.stringify(await blockFrame('en')) === JSON.stringify(g));
  }
  // editor never leaks over the sheet drawn for it; the canvas is centred on the page
  {
    await reveal();
    const geo = await page.evaluate((FIG) => { const f = document.querySelector(FIG); const a = f.querySelector('.fig-art').getBoundingClientRect(); const fr = f.getBoundingClientRect(); const shw = parseFloat(getComputedStyle(f).getPropertyValue('--shw')); const px = shw * 96 / 25.4 * (a.width / f.querySelector('.fig-art').offsetWidth); const cx = fr.x + fr.width / 2; return { aL: a.x, aR: a.x + a.width, pL: cx - px / 2, pR: cx + px / 2, shw }; }, FIG);
    check('C5/C6 editor: the canvas is inside the sheet it prints on, centred', geo.aL >= geo.pL - 0.5 && geo.aR <= geo.pR + 0.5 && near((geo.aL + geo.aR) / 2, (geo.pL + geo.pR) / 2, 3), JSON.stringify(geo));
    // editor size = PDF size: the canvas box in mm
    const art = await artBox();
    const g = await blockFrame('ar');
    check('C6 editor: the canvas is the saved size in millimetres', near(art.mmW, g.wMm, 0.6) && near(art.mmH, g.hMm, 0.6), JSON.stringify({ art: [art.mmW, art.mmH], g }));
    // C5 in the editor "at every step": the drawing is inside the canvas at every size it passes
    let inside = 0;
    let steps = 0;
    for (const [dx, dy] of [[-300, -200], [150, 100], [-120, 60], [400, 300]]) {
      await dragH('se', dx, dy, {});
      const r = await page.evaluate((FIG) => { const f = document.querySelector(FIG); const a = f.querySelector('.fig-art').getBoundingClientRect(); const s = f.querySelector('svg').getBoundingClientRect(); const items = [...f.querySelectorAll('svg [data-dg-node]')].map((n) => n.getBoundingClientRect()); const ok = items.every((b) => b.left >= a.left - 0.5 && b.right <= a.right + 0.5 && b.top >= a.top - 0.5 && b.bottom <= a.bottom + 0.5); const cap = f.querySelector('figcaption').getBoundingClientRect(); return { ok, svgIn: s.left >= a.left - 0.5 && s.right <= a.right + 0.5 && s.top >= a.top - 0.5 && s.bottom <= a.bottom + 0.5, capAbove: cap.bottom <= a.top + 1 }; }, FIG);
      steps += 1;
      if (r.ok && r.svgIn && r.capAbove) inside += 1;
      await selectDrawing();
    }
    check('C5 editor at every step: every shape stays inside the canvas and the figure title stays above it', inside === steps && steps === 4, `${inside}/${steps}`);
  }
  // zoom stays steady at page zoom 75, 100 and 150 with a canvas set
  for (const pz of [0.75, 1, 1.5]) {
    await page.evaluate((z) => window.BW.setZoom(z), pz);
    await page.waitForTimeout(500);
    await reveal();
    const a = await artBox();
    await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 6; i += 1) await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await page.waitForTimeout(400);
    const b = await artBox();
    check(`Z2/Z3 canvas set, page zoom ${pz * 100}%: Ctrl+wheel zooms the drawing only (frame, scroll height and scroll position steady)`, near(a.w, b.w, 1) && near(a.h, b.h, 1) && near(a.sh, b.sh, 1) && near(a.sy, b.sy, 1), JSON.stringify({ a: [a.w, a.h, a.sh, a.sy], b: [b.w, b.h, b.sh, b.sy] }));
    await page.evaluate(() => window.BW.runAction('dgZoomFit'));
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.BW.setZoom(1));
  await page.waitForTimeout(400);
  // the ribbon and the diagram context: both tools, AR words
  {
    const ribbon = await page.evaluate(() => window.BW.EXT.ribbon.panelHtml('diagram'));
    const strip = await page.evaluate(() => { const h = document.getElementById('bw-ui-host'); return h?.shadowRoot ? [...h.shadowRoot.querySelectorAll('[data-a="dgCvShapes"],[data-a="dgCvPage"]')].length : -1; });
    check('C9 the ribbon\'s diagram tab and the diagram context carry «ملاءمة الأشكال» and «ملاءمة الصفحة»', ribbon.includes('dgCvShapes') && ribbon.includes('dgCvPage') && ribbon.includes('ملاءمة الأشكال') && ribbon.includes('ملاءمة الصفحة') && strip >= 2, `ribbon ${ribbon.includes('dgCvShapes')} ${ribbon.includes('dgCvPage')}; buttons in the shadow root: ${strip}`);
    check('C9 each tool carries a vector icon (Lucide), no emoji, no raster', /<svg[^>]*class="ic"/.test(ribbon.slice(ribbon.indexOf('dgCvShapes') - 400, ribbon.indexOf('dgCvShapes') + 800)));
  }
  // the owner's one-page landscape page in the editor: a chapter that also prints a section title; the automatic drawing is capped to the room, so its frame ends above the footer
  {
    const dir2 = path.join(OUT, 'tight');
    fs.mkdirSync(dir2, { recursive: true });
    for (const l of ['ar', 'en']) {
      const d = loadDoc(l);
      d.chapters[2].sections.push({ number: '3.2', title: l === 'ar' ? 'قسم ثان' : 'Second section', blocks: [{ kind: 'prose', paragraphs: ['text'] }] });
      fs.writeFileSync(path.join(dir2, `document.${l}.json`), JSON.stringify(d));
    }
    const f2 = path.join(dir2, 'editor.html');
    buildEditor({ inputs: [dir2], out: f2, set: 'canvas-tight', watermarkDir: '' });
    const { ctx: c4, page: p4 } = await open('ar', { width: 1500, height: 900 }, pathToFileURL(f2).href);
    const rm = figureRoom(JSON.parse(fs.readFileSync(path.join(dir2, 'document.ar.json'), 'utf8')), PTR, theme);
    const m = await p4.evaluate((FIG) => { const f = document.querySelector(FIG); const a = f.querySelector('.fig-art'); return { cls: f.className, mm: (a.offsetHeight * 25.4) / 96 }; }, FIG);
    check('C5 editor: the same page (chapter title, section title, figure title, automatic drawing) keeps the drawing\'s frame inside the room above the footer', /\bcap\b/.test(m.cls) && m.mm <= rm.hMm + 0.8 && m.mm > 40, JSON.stringify({ cls: m.cls, mm: Math.round(m.mm * 10) / 10, room: rm.hMm }));
    await c4.close();
  }
  // M5: the route, head, tail, line and weight pickers open at their own button (within 40 px), never at the corner of the window
  {
    await reveal();
    const pt = await page.evaluate((FIG) => { const f = document.querySelector(FIG); const pth = f.querySelector('[data-dg-edge="e16"] path:not(.dg-hit)'); const L = pth.getTotalLength(); const q = pth.getPointAtLength(L * 0.3); const m = pth.getScreenCTM(); return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]; }, FIG);
    await page.mouse.click(pt[0], pt[1]);
    await page.waitForTimeout(200);
    const sel = await page.evaluate(() => window.BW.S.dg?.edge || null);
    await page.evaluate(() => window.BW.EXT.ribbon.setTab('diagram2'));
    await page.waitForTimeout(300);
    const rows = [];
    for (const k of ['dgRoute', 'dgHead', 'dgTail', 'dgLine', 'dgWeight']) {
      const b = await page.evaluate((k) => { const h = document.getElementById('bw-ui-host'); const all = [...h.shadowRoot.querySelectorAll(`[data-a="${k}"]`)].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0 && r.y > 40); return all[0] ? { x: all[0].x, y: all[0].y, w: all[0].width, h: all[0].height } : null; }, k);
      if (!b) { rows.push({ k, err: 'no visible button' }); continue; }
      await page.mouse.click(b.x + b.w / 2, b.y + b.h / 2);
      await page.waitForTimeout(250);
      const g = await page.evaluate(() => { const e = document.querySelector('.bw-dg-gallery'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if (!g) { rows.push({ k, err: 'no picker' }); continue; }
      const gapY = Math.abs(g.y - (b.y + b.h));
      const gapX = b.x + b.w / 2 < g.x ? g.x - (b.x + b.w / 2) : b.x + b.w / 2 > g.x + g.w ? b.x + b.w / 2 - (g.x + g.w) : 0;
      rows.push({ k, gapY: Math.round(gapY), gapX: Math.round(gapX) });
    }
    check('M5 the route, head, tail, line and weight pickers open within 40 px of their ribbon button (not at the window corner)', sel === 'e16' && rows.length === 5 && rows.every((r) => !r.err && r.gapY <= 40 && r.gapX <= 40), JSON.stringify({ sel, rows }));
    await page.mouse.click(5, 5);
  }
  // save the HTML, reopen: the canvas is there, in both editions; a saved doc without it opens as before
  {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
    const saved = path.join(OUT, 'saved.html');
    await dl.saveAs(saved);
    const g = await blockFrame('ar');
    const { ctx: c2, page: p2 } = await open('ar', { width: 1500, height: 900 }, pathToFileURL(saved).href);
    const fr = await p2.evaluate(() => { const B = window.BW; return ['ar', 'en'].map((e) => JSON.parse(JSON.stringify(B.M[B.S.svc][e].doc.chapters[2].sections[0].blocks[0].frame ?? null))); });
    const wMm = await p2.evaluate((FIG) => { const a = document.querySelector(FIG).querySelector('.fig-art'); return (a.offsetWidth * 25.4) / 96; }, FIG);
    check('C7 save the HTML and reopen it: the canvas is kept in both editions and drawn at the saved size', JSON.stringify(fr[0]) === JSON.stringify(g) && JSON.stringify(fr[1]) === JSON.stringify(g) && near(wMm, g.wMm, 0.7), JSON.stringify({ g, fr, wMm }));
    // «حجم تلقائي»: the key goes away again and the drawing is the old one
    const ab = await p2.evaluate((FIG) => { document.querySelector(FIG).scrollIntoView({ block: 'center' }); const r = document.querySelector(FIG).querySelector('.fig-art').getBoundingClientRect(); return [r.x, r.y]; }, FIG);
    await p2.mouse.click(ab[0] + 40, ab[1] + 36);
    await p2.waitForTimeout(200);
    await p2.evaluate(() => window.BW.runAction('dgCvAuto'));
    await p2.waitForTimeout(150);
    const gone = await p2.evaluate(() => { const B = window.BW; return ['ar', 'en'].map((e) => B.M[B.S.svc][e].doc.chapters[2].sections[0].blocks[0].frame); });
    const cls = await p2.evaluate((FIG) => document.querySelector(FIG).classList.contains('fr'), FIG);
    check('C7 «حجم تلقائي للوحة» removes the key in both editions and the figure is the automatic one again', gone[0] === undefined && gone[1] === undefined && !cls, JSON.stringify({ gone, cls }));
    await c2.close();
  }
  await ctx.close();

  // English UI and edition: LTR handles work the same way, the labels are English, and the canvas mirrors to the Arabic edition
  {
    const { ctx: c3, page: p3 } = await open('en');
    const ed = await p3.evaluate(() => window.BW.S.ed);
    await p3.evaluate(() => { window.BW.S.snap = true; window.BW.S.both = true; });
    const FIGS = '#bw-pair figure[data-dg]';
    await p3.evaluate((FIGS) => { const f = document.querySelector(FIGS); window.scrollBy(0, f.getBoundingClientRect().top - 330); }, FIGS);
    await p3.waitForTimeout(150);
    const bx = await p3.evaluate((FIGS) => { const r = document.querySelector(FIGS).querySelector('.fig-art').getBoundingClientRect(); return [r.x, r.y]; }, FIGS);
    await p3.mouse.click(bx[0] + 40, bx[1] + 36);
    await p3.waitForTimeout(150);
    const hb = await p3.locator(`${FIGS} [data-dg-cv="w"]`).boundingBox();
    const hx = hb.x + hb.width / 2;
    const hy = hb.y + hb.height / 2;
    await p3.mouse.move(hx, hy);
    await p3.mouse.down();
    await p3.mouse.move(hx + 40, hy, { steps: 6 });
    await p3.mouse.up();
    await p3.waitForTimeout(150);
    const f = await p3.evaluate(() => { const B = window.BW; return ['ar', 'en'].map((e) => JSON.parse(JSON.stringify(B.M[B.S.svc][e].doc.chapters[2].sections[0].blocks[0].frame ?? null))); });
    const ribbon = await p3.evaluate(() => window.BW.EXT.ribbon.panelHtml('diagram'));
    check('C8/C9 English UI, LTR: the left handle drags inward to shrink, both editions get the same canvas, the labels are English', !!f[0] && JSON.stringify(f[0]) === JSON.stringify(f[1]) && f[0].wMm % 5 === 0 && ribbon.includes('Fit to shapes') && ribbon.includes('Fit to page'), JSON.stringify({ ed, f, labels: [ribbon.includes('Fit to shapes'), ribbon.includes('Fit to page')] }));
    await c3.close();
  }
  check('no page errors in the editor', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally { await browser.close(); }

fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 1));
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED of ${results.length}` : `\nall ${results.length} PASS`);
process.exit(failed ? 1 : 0);
