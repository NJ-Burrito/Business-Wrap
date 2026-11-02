// 0.16.0 · SPEC lane: F (every diagram flows left to right), T (the document type scale is 2 pt smaller, diagrams keep theirs),
// O (the «المخرجات» / Outputs chapter: blank, every pack, one ribbon command for an older document).
//
//   node tests/spec-0160.test.mjs        (BW_CHROME names Google Chrome; numbers go to out/spec-0160/numbers.json)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { DIAGRAM } from '../engine/diagram.mjs';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, loadTheme, launchOptions, printHtml, REPO } from '../engine/export.mjs';
import { withResolvedDiagrams } from '../engine/export.mjs';
import { designTheme } from '../engine/render.mjs';
import { normaliseNumbers } from '../engine/edits.mjs';
import * as CLI from '../engine/srs/cli.mjs';

const OUT = path.join(REPO, 'out', 'spec-0160');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const NLs = String.fromCharCode(10);
let failed = 0;
const results = [];
const numbers = {};
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  spec-0160: ${name}${detail && !ok ? '  | ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
process.on('uncaughtException', (e) => { console.log(results.join(NLs)); console.error('CRASH: ' + String(e.stack || e.message).split(NLs).slice(0, 4).join(' / ')); process.exit(1); });
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const j = (x) => JSON.stringify(x);
const LOCS = ['ar', 'en'];
const theme = loadTheme();
const OLD = { title: '24pt', h1: '18pt', h2: '16pt', h3: '14pt', body: '14pt', table: '12pt', meta: '10pt', micro: '9pt' };
const NEW = { title: '22pt', h1: '16pt', h2: '14pt', h3: '12pt', body: '12pt', table: '10pt', meta: '8pt', micro: '7pt' };
const blank = (l) => readJson(path.join(REPO, 'samples', 'blank', `document.${l}.json`));
const wf = readJson(path.join(REPO, 'samples', 'event-permit', 'workflow.json'));

// ══ F · left to right, top-left to bottom-right ═══════════════════════════════════════════════════════════════════════
/** Every main arrow goes right on its row, or down to the next row: the order of reading is left to right, top to bottom. */
function misordered(model) {
  const m = DIAGRAM.ensure(model);
  const by = new Map(m.nodes.map((n) => [n.id, n]));
  const bad = [];
  const skip = new Set(['group', 'text', 'note']);
  for (const e of m.edges) {
    if ((e.kind || 'main') !== 'main') continue;
    const S = by.get(e.from); const T = by.get(e.to);
    if (!S || !T || skip.has(S.kind) || skip.has(T.kind)) continue;
    const sameRow = Math.abs(S.y + S.h / 2 - (T.y + T.h / 2)) < Math.min(S.h, T.h) / 2 + 4;
    if (sameRow ? T.x + T.w / 2 <= S.x + S.w / 2 : T.y + T.h / 2 <= S.y + S.h / 2) bad.push(`${e.from}>${e.to}`);
  }
  return bad;
}
/** Resolved drawing (AR and EN): the node shapes keep the model's x, so the order seen in the drawing is the model's. */
function drawnOrderOk(model, locale) {
  const r = DIAGRAM.resolve(DIAGRAM.ensure(model), { theme, locale });
  const shapes = new Map(r.items.filter((i) => i.t === 'shape' && i.id).map((i) => [i.id, i]));
  const m = DIAGRAM.ensure(model);
  return m.edges.filter((e) => (e.kind || 'main') === 'main').every((e) => {
    const a = shapes.get(e.from); const b = shapes.get(e.to);
    if (!a || !b || !a.w || !b.w) return true;
    const sameRow = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) < Math.min(a.h, b.h) / 2 + 4;
    return sameRow ? b.x + b.w / 2 > a.x + a.w / 2 : b.y + b.h / 2 > a.y + a.h / 2;
  });
}
const withFlow = (m, flow) => ({ ...JSON.parse(JSON.stringify(m)), flow });
const strip = (m) => { const c = JSON.parse(JSON.stringify(m)); c.nodes.forEach((n) => { delete n.x; delete n.y; }); return c; };
const paths = {
  'layout() of the sample workflow': (l) => DIAGRAM.layout(wf[l], { force: true }),
  'layout() with an aspect (print frame)': (l) => DIAGRAM.layout(wf[l], { aspect: 2.2, force: true }),
  'layout() of a model that says flow rtl': (l) => DIAGRAM.layout(withFlow(strip(wf[l]), 'rtl'), { force: true }),
  'layout() of a model with no positions': (l) => DIAGRAM.layout(strip(wf[l])),
  'autoLayout()': (l) => DIAGRAM.autoLayout(withFlow(wf[l], 'rtl'), { locale: l }).model,
  'ensure() of a rtl model with no positions': (l) => DIAGRAM.ensure(withFlow(strip(wf[l]), 'rtl')),
  'Mermaid import, LR': (l) => DIAGRAM.fromMermaid('flowchart LR\n A[One] --> B[Two]\n B --> C{Pick}\n C -->|yes| D[Three]\n C -->|no| E[Four]\n D --> F[Five]\n E --> F', { locale: l }),
  'Mermaid import, RL (read left to right too)': (l) => DIAGRAM.fromMermaid('flowchart RL\n A[One] --> B[Two]\n B --> C{Pick}\n C -->|yes| D[Three]\n C -->|no| E[Four]\n D --> F[Five]\n E --> F', { locale: l }),
  'new diagram (starter)': (l) => DIAGRAM.layout(DIAGRAM.starter ? DIAGRAM.starter(l) : wf[l], { force: true }),
  'splitByPhase() figures': (l) => DIAGRAM.splitByPhase(strip(wf[l]), { maxNodes: 6, locale: l }).map((f) => f.model),
};
for (const [name, fn] of Object.entries(paths)) {
  for (const l of LOCS) {
    const made = fn(l);
    const list = Array.isArray(made) ? made : [made];
    const bad = list.flatMap((m) => misordered(m));
    const drawn = list.every((m) => drawnOrderOk(m, l));
    check(`F ${l} ${name}: ${list.length} drawing(s), every main arrow runs right or to the next row down`, list.length > 0 && bad.length === 0 && drawn, bad.join(','));
    check(`F ${l} ${name}: the model says ltr`, list.every((m) => (m.flow || 'ltr') === 'ltr'));
  }
}
{
  const r = DIAGRAM.fromMermaid('flowchart RL\n A --> B', { locale: 'ar' });
  check('F Mermaid: RL code reads as ltr; a model writes LR', r.flow === 'ltr' && DIAGRAM.toMermaid(withFlow(r, 'rtl')).startsWith('flowchart LR'));
  const a = DIAGRAM.layout(withFlow(strip(wf.ar), 'rtl'), { force: true });
  const b = DIAGRAM.layout(withFlow(strip(wf.ar), 'ltr'), { force: true });
  check('F a flow rtl left in a model is ignored by layout (same positions as ltr)', j(a.nodes.map((n) => [n.id, n.x, n.y])) === j(b.nodes.map((n) => [n.id, n.x, n.y])));
  // samples: the stored drawings read left to right and a fresh layout leaves them where they are
  const samples = [];
  const find = (o) => { if (Array.isArray(o)) o.forEach(find); else if (o && typeof o === 'object') { if (o.kind === 'bw-diagram') samples.push(o); else Object.values(o).forEach(find); } };
  for (const d of fs.readdirSync(path.join(REPO, 'samples'), { withFileTypes: true }).filter((x) => x.isDirectory())) for (const f of fs.readdirSync(path.join(REPO, 'samples', d.name)).filter((x) => /\.json$/.test(x))) find(readJson(path.join(REPO, 'samples', d.name, f)));
  find(readJson(path.join(REPO, 'tests', 'fixtures', 'doc-model', 'golden.json')));
  // a stored drawing keeps its hand-set positions until auto layout is pressed (a stored sample drawing, one node moved by hand)
  const hand = JSON.parse(JSON.stringify(samples.find((m) => m.nodes.some((n) => Number.isFinite(n.x) && n.kind !== 'group'))));
  const hn = hand.nodes.find((n) => Number.isFinite(n.x) && n.kind !== 'group'); hn.x += 40;
  check('F a stored drawing keeps its hand-set positions (ensure) and auto layout (force) re-lays it out left to right', DIAGRAM.ensure(hand).nodes.find((n) => n.id === hn.id).x === hn.x && misordered(DIAGRAM.layout(hand, { force: true })).length === 0);
  check(`F samples and golden: ${samples.length} stored drawings all read left to right`, samples.length >= 5 && samples.every((m) => misordered(m).length === 0));
  check('F samples: a fresh auto layout keeps every stored position (the samples did not need a re-layout)', samples.every((m) => { const lay = DIAGRAM.layout(m, { force: true }); return m.nodes.every((n) => { const q = lay.nodes.find((x) => x.id === n.id); return !q || n.x == null || (Math.abs(q.x - n.x) <= 1 && Math.abs(q.y - n.y) <= 1); }); }));
  // the product code no longer carries the toggle
  const ribbon = fs.readFileSync(path.join(REPO, 'editor', 'ext', '25-ribbon.js'), 'utf8');
  const dgui = fs.readFileSync(path.join(REPO, 'editor', 'diagram-ui.js'), 'utf8');
  check('F the «اتجاه السير» toggle is gone from the ribbon and the diagram tools', !/dgFlow/.test(ribbon) && !/dgFlow/.test(dgui) && !/dgFlow/.test(fs.readFileSync(path.join(REPO, 'editor', 'xpl-art.js'), 'utf8')));
}

// ══ O · the Outputs chapter in the blank and in every pack ═══════════════════════════════════════════════════════════════
const TXT = readJson(path.join(REPO, 'templates', '_core', 'text.json'));
const chapterOf = (d) => d.chapters.at(-1);
for (const l of LOCS) {
  const d = blank(l);
  const c = chapterOf(d);
  const want = l === 'ar' ? 'المخرجات' : 'Outputs';
  const tables = c.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'table'));
  check(`O ${l}: samples/blank ends with the chapter «${want}», number ${d.chapters.length}, after the user stories`, c.title === want && c.number === String(d.chapters.length) && d.chapters.at(-2).sections.some((s) => s.blocks.some((b) => b.kind === 'stories')));
  check(`O ${l}: blank sections are numbered ${c.number}.1 to ${c.number}.4 with a description, types and cases, the fixed part and the changing part`, c.sections.length === 4 && c.sections.every((s, i) => s.number === `${c.number}.${i + 1}`) && c.sections[0].blocks[0].kind === 'prose' && tables.length === 3);
  check(`O ${l}: blank columns are the types (${TXT[l].od.cols.types.length}), fixed (2) and changing (4) columns of the wording, placeholders only`, j(tables[0].columns) === j(TXT[l].od.cols.types) && j(tables[1].columns) === j(TXT[l].od.cols.fixed) && j(tables[2].columns) === j(TXT[l].od.cols.changing) && tables.every((t) => t.rows.length === 1 && t.rows[0].every((x) => x === '…' || /^\[.*\]$/.test(x) || x === TXT[l].od.oneStyle)));
}
check('O the pair has the same shape (sections, tables, column counts)', j(chapterOf(blank('ar')).sections.map((s) => s.blocks.map((b) => [b.kind, b.columns?.length]))) === j(chapterOf(blank('en')).sections.map((s) => s.blocks.map((b) => [b.kind, b.columns?.length]))));
const FX = (...p) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', ...p);
const packs = fs.readdirSync(path.join(REPO, 'templates'), { withFileTypes: true }).filter((x) => x.isDirectory() && !x.name.startsWith('_') && readJson(path.join(REPO, 'templates', x.name, 'pack.json')).outputStory !== 'never').map((x) => x.name);
check('O the packs that issue an output (all but call-centre, outputStory never) are the ones tested', packs.length === 5 && !packs.includes('call-centre'), packs.join());
const built = {};
for (const id of packs) {
  const r = await CLI.buildDocuments({ pack: id, profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: FX('garden.record.json'), today: '2026-10-29' });
  built[id] = r;
  for (const l of LOCS) {
    const d = r.docs[l];
    const c = chapterOf(d);
    const want = l === 'ar' ? 'المخرجات' : 'Outputs';
    const tabs = c.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'table'));
    const stories = d.chapters.findIndex((x) => x.sections.some((s) => s.blocks.some((b) => b.kind === 'stories')));
    check(`O ${id} ${l}: the built document ends with «${want}» after the user stories, with description, types, fixed and changing tables`, c.title === want && stories >= 0 && stories < d.chapters.length - 1 && c.sections.length === 4 && c.sections[0].blocks[0].kind === 'prose' && j(c.sections[1].blocks[0].columns) === j(TXT[l].od.cols.types) && j(c.sections[3].blocks[0].columns) === j(TXT[l].od.cols.changing) && (c.sections[2].blocks[0].kind === 'table' ? j(c.sections[2].blocks[0].columns) === j(TXT[l].od.cols.fixed) : r.evidence.openQuestions.some((q) => q.section === c.sections[2].number)) && c.sections.every((s, i) => s.number === `${c.number}.${i + 1}`), c.title);
    check(`O ${id} ${l}: nothing invented: every row carries a stated or pack-given value (no empty cell, no raw key); a part nothing states is a named open question`, tabs.every((t) => t.rows.length > 0 && t.rows.every((row) => row.every((x) => String(x).trim() && !/^(output|when|to)[A-Z]/.test(x)))));
  }
}
{
  // a record that states two variations with their own fixed and changing parts: each gets its own pair of sections; nothing stated: a named question, no invented sentence
  const rec = readJson(FX('garden.record.json'));
  const two = JSON.parse(JSON.stringify(rec));
  two.facts.outputs = [
    { name: { ar: 'تصريح أولي', en: 'First permit' }, when: { ar: 'بعد الموافقة الأولى', en: 'After the first approval' }, to: { ar: 'مقدم الطلب', en: 'The applicant' }, differs: { ar: 'مؤقت', en: 'Temporary' },
      fixed: [{ section: { ar: 'العنوان', en: 'Title' }, text: { ar: 'تصريح مؤقت', en: 'Temporary permit' } }], changing: [{ field: { ar: 'اسم المستفيد', en: 'Holder name' }, changedBy: { ar: 'كل طلب', en: 'Each request' }, source: { ar: 'نموذج الطلب', en: 'The request form' }, example: { ar: 'فلان', en: 'A. Name' } }] },
    { name: { ar: 'تصريح نهائي', en: 'Final permit' }, when: { ar: 'عند الاعتماد', en: 'On approval' }, to: { ar: 'مقدم الطلب', en: 'The applicant' }, differs: { ar: 'نهائي', en: 'Final' } },
  ];
  const f2 = path.join(OUT, 'two-outputs.record.json');
  fs.writeFileSync(f2, JSON.stringify(two));
  const r = await CLI.buildDocuments({ pack: 'e-service', profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: f2, today: '2026-10-29' });
  for (const l of LOCS) {
    const c = chapterOf(r.docs[l]);
    const types = c.sections[1].blocks[0];
    check(`O two variations ${l}: types has one row each; fixed and changing come once per variation (${c.sections.length} sections)`, types.rows.length === 2 && c.sections.length === 2 + 4 && c.sections.every((s, i) => s.number === `${c.number}.${i + 1}`), c.sections.map((s) => s.title).join(' | '));
    check(`O two variations ${l}: the stated variation fills its tables; the second asks, with the question named in the evidence`, c.sections[2].blocks[0].rows[0][1] === (l === 'ar' ? 'تصريح مؤقت' : 'Temporary permit') && c.sections[3].blocks[0].rows[0][3] === (l === 'ar' ? 'فلان' : 'A. Name') && r.evidence.openQuestions.some((q) => /تصريح نهائي|Final permit/.test(q[l])));
  }
}
check('O the open-question chapter, where a pack has one, stays last', ['approval', 'call-centre', 'e-commerce', 'saas'].every((id) => { const pk = readJson(path.join(REPO, 'templates', id, 'pack.json')); const i = pk.chapters.findIndex((c) => c.sections.some((s) => s.gen === 'outputDesc')); return i >= 0 && pk.chapters.slice(i + 1).every((c) => c.sections.every((s) => s.gen === 'questions')); }));
check('O the bible and AGENTS.md carry the rule', /المخرجات|Outputs/.test(fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8')) && /Outputs chapter|outputDesc/.test(fs.readFileSync(path.join(REPO, 'bible', '09-template-packs.md'), 'utf8')));

// ══ T · the type scale, in the page, the PDF, the DOCX and the HTML ═════════════════════════════════════════════════════
check('T design/ours/theme.json, engine/defaults/theme.json carry the new scale', j(readJson(path.join(REPO, 'design', 'ours', 'theme.json')).sizes) === j(NEW) && j(readJson(path.join(REPO, 'engine', 'defaults', 'theme.json')).sizes) === j(NEW));
check('T the loaded theme has the new scale', j(theme.sizes) === j(NEW), j(theme.sizes));
const px = (pt) => (parseFloat(pt) * 96) / 72;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec0160-'));
const browser = await chromium.launch(launchOptions());
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const probe = async (th, l) => {
    const f = path.join(tmp, `print-${l}-${th.sizes.body}.html`);
    fs.writeFileSync(f, printHtml(blank(l), { locale: l, theme: th, embed: false }).html);
    await page.goto(pathToFileURL(f).href);
    await page.waitForSelector('.fig.dg svg');
    return page.evaluate(() => {
      const cs = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
      const svg = document.querySelector('.fig.dg svg').getBoundingClientRect();
      const g = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      return { vars: { title: g('--t-title'), h1: g('--t-h1'), h2: g('--t-h2'), h3: g('--t-h3'), body: g('--t-body'), table: g('--t-table'), meta: g('--t-meta'), micro: g('--t-micro') }, h1: cs('h1'), h2: cs('h2'), h3: cs('h3'), h4: cs('h4'), table: cs('table td'), caption: cs('.fig.dg > figcaption'), svg: [Math.round(svg.width * 100) / 100, Math.round(svg.height * 100) / 100], svgText: [...document.querySelectorAll('.fig.dg svg text')].slice(0, 12).map((t) => t.getAttribute('font-size')) };
    });
  };
  for (const l of LOCS) {
    const now = await probe(theme, l);
    const old = await probe({ ...theme, sizes: { ...OLD } }, l);
    numbers[`html-${l}`] = { now, old };
    check(`T ${l} HTML: the tokens read ${Object.values(NEW).join('/')} pt`, j(now.vars) === j(NEW), j(now.vars));
    check(`T ${l} HTML: computed sizes follow (cover title ${px(NEW.title).toFixed(2)} px, section heading ${px(NEW.h1).toFixed(2)}, table cell ${px(NEW.table).toFixed(2)})`, Math.abs(now.h1 - px(NEW.title)) < 0.2 && Math.abs(now.h2 - px(NEW.h1)) < 0.2 && Math.abs(now.table - px(NEW.table)) < 0.2, j({ h1: now.h1, h2: now.h2, table: now.table }));
    check(`T ${l} HTML: the figure caption is document text and dropped 2 pt (${old.caption} px to ${now.caption} px)`, Math.abs(old.caption - px(OLD.h3)) < 0.2 && Math.abs(now.caption - px(NEW.h3)) < 0.2);
    check(`T ${l} HTML: the diagram prints at the same physical size (${now.svg.join(' x ')} px) and its text sizes did not move`, j(now.svg) === j(old.svg) && j(now.svgText) === j(old.svgText) && now.svgText.length > 3, j({ now: now.svg, old: old.svg }));
  }
  check('T HTML pages: no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  // the PDF, in Chrome's own print: the sizes of the text
  const pdfs = {};
  for (const l of LOCS) { pdfs[l] = path.join(OUT, `blank.${l}.pdf`); await exportPdf(blank(l), { locale: l, theme, pdfPath: pdfs[l] }); }
  const py = (args, input) => spawnSync('uv', ['run', '--no-project', ...args], { encoding: 'utf8', input, env: { ...process.env, PYTHONUTF8: '1' } });
  fs.writeFileSync(path.join(tmp, 'pdfsizes.py'), [
    'import sys, json, collections, pymupdf',
    'out = {}',
    'for f in sys.argv[1:]:',
    '    d = pymupdf.open(f); c = collections.Counter(); last = ""',
    '    for p in d:',
    '        for b in p.get_text("dict")["blocks"]:',
    '            for l in b.get("lines", []):',
    '                for s in l["spans"]: c[round(s["size"], 1)] += len(s["text"])',
    '    out[f] = {"sizes": sorted(c.items()), "pages": len(d), "text": "".join(p.get_text() for p in d)}',
    'print(json.dumps(out))'].join(NLs));
  const pr = py(['--with', 'pymupdf', 'python', path.join(tmp, 'pdfsizes.py'), pdfs.ar, pdfs.en]);
  check('T PDF: read back with pymupdf', pr.status === 0, (pr.stderr || '').slice(-300));
  const pdfInfo = pr.status === 0 ? JSON.parse(pr.stdout) : {};
  for (const l of LOCS) {
    const info = pdfInfo[pdfs[l]];
    const sizes = Object.fromEntries((info?.sizes || []).map(([k, v]) => [k, v]));
    numbers[`pdf-${l}`] = info?.sizes;
    check(`T ${l} PDF: body 12, table 10, meta 8 and the headings 22/16/14 are present, and nothing at the old 24/18/16 body/headings`, [12, 10, 8, 22, 16, 14].every((s) => sizes[s] > 0) && !sizes[24] && !sizes[18], j(Object.keys(sizes)));
    const lastText = info?.text || '';
    check(`T ${l} PDF: ends with the Outputs chapter, contents page lists it`, new RegExp(l === 'ar' ? 'الجزء المتغير' : 'The changing part').test(lastText) && (lastText.match(new RegExp(l === 'ar' ? 'المخرجات' : 'Outputs', 'g')) || []).length >= 2);
    const legible = Object.keys(sizes).map(Number).filter((s) => s < 8);
    numbers[`below8-${l}`] = legible;
  }
  // DOCX: styles, and the diagram's own text unchanged against a build with the old scale
  for (const l of LOCS) {
    const dx = path.join(OUT, `blank.${l}.docx`);
    exportDocx(blank(l), { locale: l, theme, docxPath: dx });
    const base = path.join(OUT, `blank.${l}.oldscale.docx`);
    const work = path.join(tmp, `w-${l}`); fs.mkdirSync(work, { recursive: true });
    const docJson = path.join(work, 'document.json'); const themeJson = path.join(work, 'theme.json');
    fs.writeFileSync(docJson, JSON.stringify(normaliseNumbers(structuredClone(withResolvedDiagrams(blank(l), designTheme(theme, blank(l)), l)))));
    fs.writeFileSync(themeJson, JSON.stringify(designTheme(theme, blank(l))));
    fs.writeFileSync(path.join(tmp, 'oldscale.py'), ['import sys', 'from pathlib import Path', `sys.path.insert(0, r"${path.join(REPO, 'engine', 'docx')}")`, 'import build_docx as B, theme as T', 'T.SIZES.update({"title": 24, "h1": 18, "h2": 16, "h3": 14, "body": 14, "table": 12, "meta": 10, "micro": 9})', 'B.build(Path(sys.argv[1]), Path(sys.argv[2]), None, B.DEFAULT_BODY_FONT, Path(sys.argv[3]))'].join(NLs));
    const env = { ...process.env, PYTHONUTF8: '1', BW_LOCALE: l, BW_THEME: themeJson, BW_CHROME: process.env.BW_CHROME || '' };
    const ob = spawnSync('uv', ['run', '--no-project', '--with', 'python-docx', '--with', 'lxml', 'python', path.join(tmp, 'oldscale.py'), docJson, base, work], { encoding: 'utf8', env });
    check(`T ${l} DOCX: the old-scale reference build ran`, ob.status === 0, (ob.stderr || ob.stdout).slice(-300));
    fs.writeFileSync(path.join(tmp, 'docxsizes.py'), ['import sys, json, zipfile, re', 'from lxml import etree', 'W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"', 'out = {}', 'for f in sys.argv[1:]:', '    z = zipfile.ZipFile(f)', '    st = etree.fromstring(z.read("word/styles.xml"))', '    styles = {}', '    for s in st.iter(W + "style"):', '        n = s.find(W + "name"); sz = s.find(".//" + W + "sz")', '        if n is not None and sz is not None: styles[n.get(W + "val")] = int(sz.get(W + "val")) / 2', '    doc = etree.fromstring(z.read("word/document.xml"))', '    dg = [int(x.get(W + "val")) / 2 for d in doc.iter(W + "drawing") for x in d.iter(W + "sz")]', '    dg += [int(x.get(W + "val")) / 2 for p in doc.iter("{urn:schemas-microsoft-com:vml}textbox") for x in p.iter(W + "sz")]', '    allsz = [int(x.get(W + "val")) / 2 for x in doc.iter(W + "sz")]', '    out[f] = {"styles": styles, "diagram": sorted(dg), "all": sorted(set(allsz))}', 'print(json.dumps(out))'].join(NLs));
    const dr = spawnSync('uv', ['run', '--no-project', '--with', 'lxml', 'python', path.join(tmp, 'docxsizes.py'), dx, base], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
    const di = dr.status === 0 ? JSON.parse(dr.stdout) : {};
    const nowS = di[dx]; const oldS = di[base];
    numbers[`docx-${l}`] = { styles: nowS?.styles, all: nowS?.all };
    check(`T ${l} DOCX: Normal 12, Title 22, Heading 1 16, Heading 2 14, Heading 3 12`, nowS?.styles?.Normal === 12 && nowS.styles.Title === 22 && nowS.styles['heading 1'] === 16 && nowS.styles['heading 2'] === 14 && nowS.styles['heading 3'] === 12, j(nowS?.styles));
    check(`T ${l} DOCX: the reference build with the old scale had 14/24/18/16/14`, oldS?.styles?.Normal === 14 && oldS.styles.Title === 24 && oldS.styles['heading 1'] === 18);
    check(`T ${l} DOCX: the diagram's text runs are unchanged (${nowS?.diagram?.length} runs, the same sizes as the old-scale build)`, nowS?.diagram?.length > 0 && j(nowS.diagram) === j(oldS?.diagram), j({ now: nowS?.diagram?.slice(0, 8), old: oldS?.diagram?.slice(0, 8) }));
    check(`T ${l} DOCX: table text 10 pt, nothing at 12 pt that is table text of the old scale beside body`, (nowS?.all || []).includes(10) && !(nowS?.all || []).includes(18));
  }

  // ══ the editor: the ribbon has no flow toggle; the command adds the chapter to an older document in ONE undo step ═════════
  const file = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: file, set: 'spec160', watermarkDir: null });
  const ep = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  const eerr = [];
  ep.on('pageerror', (e) => eerr.push(String(e)));
  await ep.goto(pathToFileURL(file).href);
  await ep.waitForFunction(() => window.BW?.ready);
  const ready = await ep.evaluate(() => { const B = window.BW; return { ar: B.M[B.S.svc].ar.doc.chapters.length, en: B.M[B.S.svc].en.doc.chapters.length, both: B.S.both }; });
  check('O editor ready state seen: both editions loaded with the blank, 7 chapters each', ready.ar === 7 && ready.en === 7 && ready.both === true, j(ready));
  const docs = () => ep.evaluate(() => { const B = window.BW; return { ar: JSON.parse(JSON.stringify(B.M[B.S.svc].ar.doc)), en: JSON.parse(JSON.stringify(B.M[B.S.svc].en.doc)) }; });
  const steps = () => ep.evaluate(() => new Set(window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.map((o) => o.id.split('.')[0])).size);
  const listed = await ep.evaluate(() => window.BW.EXT.ribbon.listed());
  check('F the editor ribbon lists no dgFlow command; the Insert tab lists addOutputsChapter', !JSON.stringify(listed).includes('dgFlow') && JSON.stringify(listed).includes('addOutputsChapter'));
  // make the document "older": the chapter taken away from both editions, then added by the command
  await ep.evaluate(() => { const B = window.BW; B.commit([{ op: 'delete', path: '/chapters/6', old: B.M[B.S.svc].ar.doc.chapters[6] }], { mirror: true }); });
  let d = await docs();
  check('O an older document: 6 chapters, no Outputs', d.ar.chapters.length === 6 && d.en.chapters.length === 6);
  const s0 = await steps();
  await ep.evaluate(() => window.BW.runAction('addOutputsChapter'));
  d = await docs();
  for (const l of LOCS) {
    const c = d[l].chapters[6];
    check(`O ${l}: the command adds «${l === 'ar' ? 'المخرجات' : 'Outputs'}» as chapter 7 with 4 numbered sections and the three tables`, d[l].chapters.length === 7 && c.title === blank(l).chapters[6].title && c.sections.length === 4 && c.sections.every((s, i) => s.number === `7.${i + 1}`) && j(c.sections.slice(1).map((s) => s.blocks[0].columns)) === j(blank(l).chapters[6].sections.slice(1).map((s) => s.blocks[0].columns)), c?.title);
  }
  check('O one gesture, one undo step (both editions)', (await steps()) === s0 + 1, `${s0} -> ${await steps()}`);
  await ep.evaluate(() => window.BW.undo());
  d = await docs();
  check('O undo takes the chapter out of both editions at once', d.ar.chapters.length === 6 && d.en.chapters.length === 6);
  await ep.evaluate(() => window.BW.redo());
  await ep.evaluate(() => window.BW.runAction('addOutputsChapter'));
  d = await docs();
  check('O pressed again, the chapter is not added twice', d.ar.chapters.length === 7 && d.en.chapters.length === 7);
  const dgs = await ep.evaluate(() => { const B = window.BW; return typeof B.EXT?.ribbon?.listed === 'function'; });
  check('O editor: no page errors', eerr.length === 0 && dgs, eerr.slice(0, 2).join(' | '));
  await ep.context().close();
} finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }

fs.writeFileSync(path.join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 1));
console.log(failed ? `${NLs}${failed} FAILED` : `${NLs}all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
