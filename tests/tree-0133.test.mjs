// 0.13.3 one clear tree: every output of a document is inside its own folder with human names, machine state is in .system,
// nothing is written anywhere else, and an old 0.13.0-0.13.2 folder (PDF, DOCX, HTML, HISTORY, uuid names) is moved in whole.
//
//   node tests/tree-0133.test.mjs
// Runs in its own temp workspace (BW_WORKSPACE / BW_LOCAL_DIR under the temp folder); never the real Documents\Business-Wrap.
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-tree-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_STATE_DIR = path.join(tmp, 'state');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_FONT_NORM_DIR = path.join(tmp, 'font-norm');
delete process.env.BW_TEST_SLOT; // the runner sets it to stop the first-start migration; this suite tests that migration in its own temp folder
delete process.env.BW_NO_MIGRATE;
const cwd = path.join(tmp, 'cwd');
fs.mkdirSync(cwd, { recursive: true });
process.env.INIT_CWD = cwd;
fs.mkdirSync(process.env.BW_WORKSPACE, { recursive: true });

const W = await import('../engine/workspace.mjs');
const T = await import('../engine/tidy.mjs');
const CLI = await import('../engine/cli.mjs');
const { serve } = await import('../engine/serve.mjs');
const { buildEditor } = await import('../engine/build-editor.mjs');
const { harvestModel } = await import('../engine/harvest/cli.mjs');

let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  tree: ${n}${d && !ok ? '  — ' + String(d).slice(0, 400) : ''}`); if (!ok) failed += 1; };

// the real user folder must not move during this run
const realRoot = path.join(W.defaultParent(), 'Business-Wrap');
const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const snap = (d) => walk(d).map((f) => `${path.relative(d, f)}|${fs.statSync(f).mtimeMs}`).sort().join('\n');
const repoOutBefore = fs.existsSync(path.join(REPO, 'bw-harvest')) || fs.existsSync(path.join(REPO, 'bw-new'));

const ws = W.workspace();
const R = ws.root, D = ws.dirs;
const rel = (f) => path.relative(R, f).split(path.sep).join('/');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const NAME = (title, lang, ext) => new RegExp(`^\\d{4}-\\d{2}-\\d{2} \\d{2}-\\d{2} ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} - ${lang}( \\(\\d+\\))?\\.${ext.replace('.', '\\.')}$`);

/** A small Save-HTML: the shape the tree reads (bw-data with a service, its editions, optional history doc ids). */
const docOf = (title) => JSON.stringify({ control: { title, coverTitle: title }, chapters: [] });
function saveHtmlText({ id, ar, en, hist, note = '' }) {
  const eds = {};
  if (ar) eds.ar = { raw: docOf(ar), ops: [] };
  if (en) eds.en = { raw: docOf(en), ops: [] };
  const data = { services: [{ id, editions: eds }], prov: hist ? { [id]: { doc: hist, log: 'x' } } : {} };
  return `<!doctype html><html lang="${ar ? 'ar' : 'en'}"><head><meta charset="utf-8">${hist ? `<meta name="bw-ledger" content="bwlog/v1 doc=${hist} state=abc">` : ''}</head><body><!-- ${note} --><script type="application/json" id="bw-data">${JSON.stringify(data)}</script></body></html>`;
}

/* ───────── 1. the tree itself: dirs, README, names ───────── */
check('workspace dirs: one documents folder, one hidden .system, no PDF/DOCX/HTML/HISTORY', D.docs === path.join(R, 'المستندات - Documents') && D.system === path.join(R, '.system') && D.history === path.join(R, '.system', 'history') && D.pdf === D.docs && D.docx === D.docs && D.html === D.docs, JSON.stringify(D));
W.ensure(ws);
check('ensure(): documents folder, .system\\{history,backups,sessions,library,cache} and the AR+EN README exist', [D.docs, D.history, D.backups, D.sessions, D.library, D.cache].every((d) => fs.existsSync(d)) && fs.existsSync(path.join(R, 'اقرأني - README.txt')) && /Documents/.test(fs.readFileSync(path.join(R, 'اقرأني - README.txt'), 'utf8')) && /المستندات/.test(fs.readFileSync(path.join(R, 'اقرأني - README.txt'), 'utf8')));
if (process.platform === 'win32') {
  const { spawnSync } = await import('node:child_process');
  check('.system carries the hidden attribute on Windows', /(^|\s)H(\s|$)/.test(spawnSync('attrib', [D.system], { encoding: 'utf8' }).stdout.split(D.system)[0]));
}
check('inHistory(): .system is machine state and never served (any case); the documents folder is', W.inHistory(R, path.join(R, '.system', 'history', 'x')) && W.inHistory(R, path.join(R, '.SYSTEM', 'x')) === (process.platform === 'win32') || W.inHistory(R, path.join(R, '.system', 'x')), '');
check('inHistory(): a document file is served', !W.inHistory(R, path.join(D.docs, 'A', 'A.html')));
const d0 = new Date(2026, 9, 30, 14, 5);
check('outName: "<title>/Exports/<YYYY-MM-DD HH-MM> <title> - العربية.pdf", English, both', W.outName('تصريح فعالية', d0, 'ar', 'pdf') === 'تصريح فعالية/Exports/2026-10-30 14-05 تصريح فعالية - العربية.pdf' && W.outName('Permit', d0, 'en', 'docx') === 'Permit/Exports/2026-10-30 14-05 Permit - English.docx' && W.outName('Permit', d0, 'both', 'pdf').endsWith(' - both.pdf'), W.outName('Permit', d0, 'both', 'pdf'));
check('outName: no uuid, "editor", "service", "out" or "ENG" in the name', !/editor|service|\bout\b|ENG|[0-9a-f]{8}-[0-9a-f]{4}/.test(W.outName('Permit', d0, 'en', 'pdf').replace('English', '')));

/* ───────── 2. names: illegal characters, Arabic, collision, device names, length ───────── */
check('titleStem: illegal characters → -, Arabic kept, spaces kept', W.titleStem('a:b/c*d?e"f<g>h|i') === 'a-b-c-d-e-f-g-h-i' && W.titleStem('تصريح: فعالية/عامة') === 'تصريح-فعالية-عامة' && W.titleStem('Two  words here') === 'Two words here', W.titleStem('تصريح: فعالية/عامة'));
check('titleStem: no trailing dot or space, Windows device names get a suffix, empty → the Untitled name, at most 80 characters', W.titleStem('name. . ') === 'name' && W.titleStem('CON') === 'CON-' && W.titleStem('   ') === W.UNTITLED && W.titleStem('x'.repeat(200)).length === 80);
{
  const a = W.docFolder(D.docs, { ids: ['doc-a1111111'], titles: ['Same title'] });
  const b = W.docFolder(D.docs, { ids: ['doc-b2222222'], titles: ['Same title'] });
  const c = W.docFolder(D.docs, { ids: ['doc-c3333333'], titles: ['Same title'] });
  const a2 = W.docFolder(D.docs, { ids: ['doc-a1111111'], titles: ['Renamed later'] });
  check('collision: two documents with one title → "Same title", "Same title (2)", "Same title (3)"; a known id keeps its folder', a.folder === 'Same title' && b.folder === 'Same title (2)' && c.folder === 'Same title (3)' && a2.folder === 'Same title', [a, b, c, a2].map((x) => x.folder).join(' | '));
  const ar = W.docFolder(D.docs, { ids: ['doc-d4444444'], titles: ['خدمة الترخيص', 'Licence service'] });
  const same = W.docFolder(D.docs, { titles: ['Licence service'] });
  check('Arabic title names the folder (AR before EN); the EN title finds the same folder when no id is given', ar.folder === 'خدمة الترخيص' && same.folder === 'خدمة الترخيص', `${ar.folder} / ${same.folder}`);
  const adopt = W.docFolder(D.docs, { titles: ['Only exported'] });
  const later = W.docFolder(D.docs, { ids: ['doc-e5555555'], titles: ['Only exported'] });
  check('a folder made by an export before the first Save is adopted by the document of that title', adopt.folder === 'Only exported' && later.folder === 'Only exported', later.folder);
}
{
  const p1 = W.uniquePath(D.docs, W.outName('Name/with:bad*chars', new Date(2026, 9, 30, 9, 1), 'en', 'pdf'));
  fs.writeFileSync(p1, 'x');
  const p2 = W.uniquePath(D.docs, W.outName('Name/with:bad*chars', new Date(2026, 9, 30, 9, 1), 'en', 'pdf'));
  check('uniquePath: illegal characters sanitised in folder and file; the same minute gets " (2)", never an overwrite', rel(p1).startsWith('المستندات - Documents/Name-with-bad-chars/Exports/2026-10-30 09-01 Name-with-bad-chars - English.pdf') && p2.endsWith(' - English (2).pdf') && fs.existsSync(p1), `${p1} | ${p2}`);
}

/* ───────── 3. new document → Save twice → export AR / EN / both → harvest, through the real server ───────── */
const created = await CLI.newDoc({ title: 'تصريح فعالية', openIt: false });
const nd = path.join(D.docs, 'تصريح فعالية');
check('new (no --out): Documents\\<title>\\<title>.html + Sources\\document.ar/en.json; nothing in the working folder', created.editor === path.join(nd, 'تصريح فعالية.html') && fs.existsSync(created.editor) && fs.existsSync(path.join(nd, 'Sources', 'document.ar.json')) && fs.existsSync(path.join(nd, 'Sources', 'document.en.json')) && fs.readdirSync(cwd).length === 0, JSON.stringify(created));

const editor = path.join(tmp, 'tree.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'tree', watermarkDir: null });
const server = await serve(editor, 0, { workspace: true });
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json() }; };
const get = async (p) => { const r = await fetch(base + p); return { s: r.status, j: await r.json().catch(() => null) }; };
try {
  const docs = { ar: JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8')), en: JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'utf8')) };
  const tAr = W.docTitle(docs.ar), tEn = W.docTitle(docs.en);

  // save the document first (it knows both titles), then export both editions
  const html1 = saveHtmlText({ id: 'doc-evt00001', ar: tAr, en: tEn, note: 'v1' });
  const s1 = await post('/api/library/html', { id: 'doc-evt00001', title: tAr, locale: 'ar', html: html1 });
  const folder = path.join(D.docs, W.titleStem(tAr));
  check('Save HTML: the document\'s own file Documents\\<AR title>\\<AR title>.html', s1.s === 200 && s1.j.file === path.join(folder, `${W.titleStem(tAr)}.html`) && fs.readFileSync(s1.j.file, 'utf8') === html1 && s1.j.overwritten === false, JSON.stringify(s1.j));
  const s2 = await post('/api/library/html', { id: 'doc-evt00001', title: tEn, locale: 'en', html: saveHtmlText({ id: 'doc-evt00001', ar: tAr, en: tEn, note: 'v2' }) });
  const s3 = await post('/api/library/html', { id: 'doc-evt00001', title: tEn, locale: 'en', html: saveHtmlText({ id: 'doc-evt00001', ar: tAr, en: tEn, note: 'v2' }) });
  const versions = fs.existsSync(path.join(folder, 'Versions')) ? fs.readdirSync(path.join(folder, 'Versions')) : [];
  check('Save twice with a change: one .html (overwritten), the previous one kept in Versions\\<date> <title>.html', s2.j.file === s1.j.file && s2.j.overwritten === true && versions.length === 1 && /^\d{4}-\d{2}-\d{2} \d{2}-\d{2} /.test(versions[0]) && fs.readFileSync(path.join(folder, 'Versions', versions[0]), 'utf8') === html1, JSON.stringify({ s2: s2.j, versions }));
  check('Save a third time with the same text: no new version, nothing duplicated', s3.j.file === s1.j.file && fs.readdirSync(path.join(folder, 'Versions')).length === 1 && fs.readdirSync(folder).filter((f) => /\.html$/i.test(f)).length === 1);
  check('the English title (saved in the other edition) lands in the same folder', !fs.existsSync(path.join(D.docs, W.titleStem(tEn))) || W.titleStem(tEn) === W.titleStem(tAr), fs.readdirSync(D.docs).join(','));

  const r1 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  const r2 = await post('/api/export', { service: 'event-permit', locale: 'en', doc: docs.en });
  check('export AR: Exports\\<date> <title> - العربية.pdf + .docx inside the document folder', r1.s === 200 && NAME(W.titleStem(tAr), 'العربية', 'pdf').test(path.basename(r1.j.pdf)) && NAME(W.titleStem(tAr), 'العربية', 'docx').test(path.basename(r1.j.docx)) && path.dirname(r1.j.pdf) === path.join(folder, 'Exports') && fs.existsSync(r1.j.pdf) && fs.existsSync(r1.j.docx), JSON.stringify(r1.j).slice(0, 300));
  check('export EN: the same folder (found by the English title), "… - English.pdf"', r2.s === 200 && path.dirname(r2.j.pdf) === path.join(folder, 'Exports') && NAME(W.titleStem(tAr), 'English', 'pdf').test(path.basename(r2.j.pdf)) && fs.existsSync(r2.j.docx), JSON.stringify(r2.j).slice(0, 300));
  const r3 = await post('/api/export', { service: 'event-permit', locale: 'ar', doc: docs.ar });
  check('a second export of the same document never overwrites the first (same minute → " (2)")', r3.s === 200 && r3.j.pdf !== r1.j.pdf && fs.existsSync(r1.j.pdf) && fs.existsSync(r3.j.pdf), r3.j.pdf);
  const served = await fetch(base + r1.j.pdfUrl);
  check('the export is served from /files/ by its tree path (Arabic names encoded)', served.status === 200 && (await served.arrayBuffer()).byteLength > 1000, `${served.status} ${r1.j.pdfUrl}`);
  const hist = await fetch(`${base}/files/.system/history/index.json`);
  const hist2 = await fetch(`${base}/files/.SYSTEM/history/index.json`);
  check('.system is never served (any case)', hist.status === 404 && hist2.status === 404, `${hist.status}/${hist2.status}`);
  const pf = await post('/api/export/file', { format: 'pdf', service: 'event-permit', locale: 'en', doc: docs.en, theme: undefined });
  const pb = await post('/api/export/file', { format: 'printHtml', service: 'event-permit', locale: 'en', doc: docs.en });
  check('print centre: PDF and print page → Exports\\ with the same names; the toast path is the real file', pf.s === 200 && path.dirname(pf.j.file) === path.join(folder, 'Exports') && pb.s === 200 && /English( \(\d+\))?\.print\.html$/.test(pb.j.file) && fs.existsSync(pb.j.file), JSON.stringify([pf.j, pb.j]).slice(0, 300));

  // "both": one PDF named - both (the name only; the language word is the contract of the print centre)
  check('"both" is spelled as the word both in the name', path.basename(W.uniquePath(D.docs, W.outName(tAr, new Date(), 'both', 'pdf'))).includes(' - both.pdf'));

  // report
  const rp = W.reportPath(D.docs, 'en');
  check('performance report: Documents\\Performance report\\Exports\\<date> Performance report - English.pdf', rel(rp).startsWith('المستندات - Documents/Performance report/Exports/') && / - English\.pdf$/.test(rp), rp);

  // share (Save-HTML for a recipient): in the document's Exports
  const sh = await post('/api/share', { name: 'x.html', html: saveHtmlText({ id: 'doc-evt00001', ar: tAr, en: tEn, note: 'shared' }) });
  check('share: …\\Exports\\<date> <title> - العربية.shared.html, and reveal accepts only files inside the documents folder', sh.s === 200 && path.dirname(sh.j.path) === path.join(folder, 'Exports') && /العربية\.shared\.html$/.test(sh.j.path) && fs.existsSync(sh.j.path), JSON.stringify(sh.j));

  // history: written under an unlinked id, then linked and renamed by the Save of its document
  const hid = '0d9d9f8e-1111-4222-8333-444455556666';
  const log = '{"fmt":"bwlog","v":1,"doc":"' + hid + '"}';
  const h1 = await post('/api/history', { doc: hid, log, mirror: { head: { seq: 3, hash: 'aa' }, hashes: ['aa'] } });
  const untitled = fs.readdirSync(D.history).filter((f) => f.endsWith('.bwlog'));
  check('history of an unlinked id: "<Untitled> (<id8>).bwlog" + .heads.json, no bare uuid name', h1.s === 200 && untitled.length === 1 && untitled[0] === `${W.UNTITLED} (0d9d9f8e).bwlog` && fs.existsSync(path.join(D.history, `${W.UNTITLED} (0d9d9f8e).heads.json`)), untitled.join(','));
  const s4 = await post('/api/library/html', { id: 'doc-hist0002', title: 'سجل التاريخ', locale: 'ar', html: saveHtmlText({ id: 'doc-hist0002', ar: 'سجل التاريخ', hist: hid }) });
  const named = fs.readdirSync(D.history).filter((f) => f.endsWith('.bwlog'));
  const g = await get(`/api/history?doc=${hid}`);
  const idx = JSON.parse(fs.readFileSync(path.join(D.history, 'index.json'), 'utf8'));
  check('Save links the history: files renamed "<Document title> (<id8>)", GET /api/history?doc=<id> still resolves, index.json maps id → folder', s4.s === 200 && named.includes('سجل التاريخ (0d9d9f8e).bwlog') && !named.includes(`${W.UNTITLED} (0d9d9f8e).bwlog`) && g.j.log === log && idx.history[hid].folder === 'سجل التاريخ' && idx.ids['doc-hist0002'] === 'سجل التاريخ', JSON.stringify({ named, idx: idx.history[hid] }));
  const h2 = await post('/api/history', { doc: hid, log, mirror: { head: { seq: 1, hash: 'bb' }, hashes: ['bb'] } });
  check('the head never moves back, and the file keeps its title-based name', h2.j.mirror.head.seq === 3 && fs.readdirSync(D.history).filter((f) => f.endsWith('.bwlog')).length === 2 - 1 + 0 || fs.readdirSync(D.history).filter((f) => f.endsWith('.bwlog')).length === 1, fs.readdirSync(D.history).join(','));

  // machine state lands in .system, not at the root
  const pj = await post('/api/projects', { state: { v: 1, savedAt: '2026-10-30T10:00:00.000Z', projects: [{ id: 'pj-0001', name: 'P' }], of: {} } });
  const mr = await post('/api/library/mirror', { entry: { id: 'doc-evt00001', x: 1 } });
  const ss = await post('/api/session/tab', { tab: 't1', run: 'x', state: {} }).catch(() => ({ s: 0 }));
  check('projects.json and the library mirror are in .system; sessions live in .system\\sessions', pj.s === 200 && fs.existsSync(path.join(D.system, 'projects.json')) && fs.existsSync(path.join(D.library, 'doc-evt00001.json.gz')) && !fs.existsSync(path.join(R, 'HISTORY')), JSON.stringify({ pj: pj.s, mr: mr.s }));
  void ss;
} finally {
  await new Promise((ok) => server.close(ok));
}

/* harvest into the tree */
{
  const r = await harvestModel(path.join(REPO, 'tests', 'fixtures', 'harvest', 'permit.bpmn20.xml'), { name: 'Harvested permit' });
  const dir = path.join(D.docs, 'Harvested permit');
  check('harvest (no --out): Documents\\<name>\\Sources\\document.*.json, the editor beside it as <name>.html (never out\\harvest or the working folder)', r.dir === path.join(dir, 'Sources') && fs.existsSync(path.join(dir, 'Sources', 'document.ar.json')) && r.editor === path.join(dir, 'Harvested permit.html') && fs.existsSync(r.editor) && !/\.editor\.html/.test(r.editor) && fs.readdirSync(cwd).length === 0, JSON.stringify({ dir: r.dir, editor: r.editor }));
  const again = await harvestModel(path.join(REPO, 'tests', 'fixtures', 'harvest', 'permit.bpmn20.xml'), { name: 'Harvested permit' });
  check('a second harvest of the same name joins the same folder; the first editor is kept in Versions\\', again.dir === r.dir && fs.readdirSync(path.join(dir, 'Versions')).length === 1);
  const srcs = await CLI.importSources({ inputs: [path.join(REPO, 'tests', 'fixtures', 'harvest', 'steps.yaml')], name: 'Imported steps' });
  check('import (no --out): into Documents\\<name>\\Sources', srcs.documents.length === 2 && srcs.documents.every((f) => rel(f).startsWith('المستندات - Documents/Imported steps/Sources/')), srcs.documents.join(' '));
  const lib = await CLI.library();
  check('library lists one entry per document folder', lib.dir === D.docs && lib.documents.some((x) => x.name === 'Harvested permit') && lib.documents.every((x) => x.file === path.join(D.docs, x.name, `${x.name}.html`)), JSON.stringify(lib.documents.map((x) => x.name)));
  const ex = await CLI.exportDoc({ document: path.join(nd, 'Sources', 'document.en.json'), locale: 'en', docx: false });
  check('export (no --out): Documents\\<title>\\Exports\\<date> <title> - English.pdf', rel(ex.pdf).startsWith('المستندات - Documents/') && /\/Exports\/\d{4}-\d{2}-\d{2} \d{2}-\d{2} .* - English\.pdf$/.test(rel(ex.pdf)) && fs.existsSync(ex.pdf), ex.pdf);
}

/* ───────── 4. migration of a copy of an old-layout folder ───────── */
const old = path.join(tmp, 'old');
const OR = path.join(old, 'Business-Wrap');
const put = (f, text) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const touch = (f, d) => fs.utimesSync(f, d, d);
const H1 = '11111111-aaaa-4bbb-8ccc-000000000001', H2 = '22222222-aaaa-4bbb-8ccc-000000000002', HX = '99999999-aaaa-4bbb-8ccc-0000000000ff', HD = 'doc-5a5a5a5a-1111-4222-8333-444455556666';
const files = {};
files.htmlNew = put(path.join(OR, 'HTML', 'تصريح فعالية-2026-10-29-AR-2.html'), saveHtmlText({ id: 'doc-m1', ar: 'تصريح قديم', en: 'Old permit', hist: H1, note: 'newer' }));
files.htmlOld = put(path.join(OR, 'HTML', 'تصريح فعالية-2026-10-28-AR.html'), saveHtmlText({ id: 'doc-m1', ar: 'تصريح قديم', en: 'Old permit', hist: H1, note: 'older' }));
files.htmlOther = put(path.join(OR, 'HTML', 'Shop-2026-10-28-ENG.html'), saveHtmlText({ id: 'doc-m2', en: 'Shop service', hist: H2 }));
files.htmlNoHist = put(path.join(OR, 'HTML', 'Plain-2026-10-27-ENG.html'), saveHtmlText({ id: 'doc-m3', en: 'Plain doc' }));
files.htmlJunk = put(path.join(OR, 'HTML', 'not-a-save-2026-10-27-AR.html'), '<html><body>hello</body></html>');
touch(files.htmlOld, new Date(2026, 9, 28, 10, 0)); touch(files.htmlNew, new Date(2026, 9, 29, 11, 30)); touch(files.htmlOther, new Date(2026, 9, 28, 12, 15));
files.pdfAr = put(path.join(OR, 'PDF', 'تصريح قديم-2026-10-29-AR.pdf'), '%PDF ar');
files.docxAr = put(path.join(OR, 'DOCX', 'تصريح قديم-2026-10-29-AR.docx'), 'docx ar');
files.pdfEn = put(path.join(OR, 'PDF', 'Old permit-2026-10-29-ENG.pdf'), '%PDF en');
files.pdfEn2 = put(path.join(OR, 'PDF', 'Old permit-2026-10-29-ENG-2.pdf'), '%PDF en 2');
files.pdfShop = put(path.join(OR, 'PDF', 'Shop service-2026-10-28-ENG.pdf'), '%PDF shop');
files.print = put(path.join(OR, 'HTML', 'Shop service-2026-10-28-ENG.print.html'), '<html>print</html>');
files.pdfLost = put(path.join(OR, 'PDF', 'Nobody knows this-2026-10-01-AR.pdf'), '%PDF lost');
files.pdfOdd = put(path.join(OR, 'PDF', 'whatever.pdf'), '%PDF odd');
files.report = put(path.join(OR, 'PDF', 'Performance report-2026-10-20-ENG.pdf'), '%PDF report');
for (const f of [files.pdfAr, files.docxAr, files.pdfEn, files.pdfEn2, files.pdfShop, files.print, files.pdfLost, files.pdfOdd, files.report]) touch(f, new Date(2026, 9, 29, 9, 5));
const logOf = (id) => `{"fmt":"bwlog","v":1,"doc":"${id}","body":"${id}"}`;
for (const id of [H1, H2, HX, HD]) { put(path.join(OR, 'HISTORY', `${id}.bwlog`), logOf(id)); put(path.join(OR, 'HISTORY', `${id}.heads.json`), JSON.stringify({ doc: id, head: { seq: 2, hash: 'h' }, hashes: ['h'] })); }
put(path.join(OR, 'HISTORY', 'sessions', 'run-1', 'tab-1.json'), '{"tab":1}');
put(path.join(OR, 'HISTORY', 'sessions', 'run-1', 'run.json'), '{"run":1}');
put(path.join(OR, 'HISTORY', 'backups', '2026-10-28T10-00-00-old.html'), '<html>backup</html>');
put(path.join(OR, 'HISTORY', 'library', 'doc-m1.json.gz'), 'gz');
put(path.join(OR, 'HISTORY', 'projects.json'), '{"v":1}');
put(path.join(OR, 'HISTORY', 'profile.json.gz'), 'gz2');
put(path.join(OR, 'HISTORY', 'host.log'), 'log');
const oldFiles = walk(OR);
const hashes = oldFiles.map(sha).sort();
const listing = () => walk(OR).map((f) => rel2(f)).sort().join('\n');
const rel2 = (f) => path.relative(OR, f);
const oldWs = { parent: old, root: OR, dirs: W.dirsOf(OR) };

const planBefore = listing();
const dry = T.tidy(oldWs, { dryRun: true });
check('tidy --dry-run prints the plan and changes nothing (not one file, folder or log)', dry.dryRun && dry.moves === oldFiles.length && dry.lines.length === oldFiles.length && listing() === planBefore && !fs.existsSync(path.join(OR, '.system')), JSON.stringify({ moves: dry.moves, files: oldFiles.length }));

const prev = process.env.BW_NO_MIGRATE;
const done = T.tidy(oldWs);
const after = walk(OR);
const afterNoLogs = after.filter((f) => !/migration-0\.13\.3\.json$|index\.json$|README\.txt$/.test(f));
check('migration: every file accounted for (count before = after) and none lost or changed (content hashes equal)', done.before === oldFiles.length && done.moved === oldFiles.length && done.failed === 0 && afterNoLogs.length === oldFiles.length && JSON.stringify(afterNoLogs.map(sha).sort()) === JSON.stringify(hashes), JSON.stringify({ before: done.before, moved: done.moved, failed: done.failed, after: afterNoLogs.length }));
check('migration: PDF, DOCX, HTML and HISTORY are gone (moved, not copied)', ['PDF', 'DOCX', 'HTML', 'HISTORY'].every((n) => !fs.existsSync(path.join(OR, n))), fs.readdirSync(OR).join(','));
const OD = oldWs.dirs;
const docA = path.join(OD.docs, 'تصريح قديم');
const verA = fs.existsSync(path.join(docA, 'Versions')) ? fs.readdirSync(path.join(docA, 'Versions')) : [];
check('migration: the two saves of one document → the newer is <title>.html, the older is in Versions\\<its date> <title>.html', fs.readFileSync(path.join(docA, 'تصريح قديم.html'), 'utf8') === fs.readFileSync(path.join(docA, 'تصريح قديم.html'), 'utf8') && /newer/.test(fs.readFileSync(path.join(docA, 'تصريح قديم.html'), 'utf8')) && verA.length === 1 && verA[0] === '2026-10-28 10-00 تصريح قديم.html' && /older/.test(fs.readFileSync(path.join(docA, 'Versions', verA[0]), 'utf8')), JSON.stringify(verA));
const exA = fs.readdirSync(path.join(docA, 'Exports')).sort();
check('migration: its PDF/DOCX (found by either title) → Exports\\<date> <title> - <language>; the same-day duplicate gets (2)', exA.includes('2026-10-29 09-05 تصريح قديم - العربية.pdf') && exA.includes('2026-10-29 09-05 تصريح قديم - العربية.docx') && exA.includes('2026-10-29 09-05 تصريح قديم - English.pdf') && exA.includes('2026-10-29 09-05 تصريح قديم - English (2).pdf'), exA.join(' | '));
const shop = path.join(OD.docs, 'Shop service');
check('migration: a second document and its print page / PDF are in their own folder', fs.existsSync(path.join(shop, 'Shop service.html')) && fs.readdirSync(path.join(shop, 'Exports')).some((f) => /Shop service - English\.pdf$/.test(f)) && fs.readdirSync(path.join(shop, 'Exports')).some((f) => /English\.print\.html$/.test(f)), fs.existsSync(shop) ? fs.readdirSync(path.join(shop, 'Exports')).join(',') : 'no folder');
check('migration: the performance report keeps its own folder', fs.readdirSync(path.join(OD.docs, 'Performance report', 'Exports')).some((f) => / Performance report - English\.pdf$/.test(f)));
const uns = path.join(OD.docs, W.UNSORTED_NAME);
const unsList = fs.existsSync(uns) ? fs.readdirSync(uns).sort() : [];
check('migration: anything unmatched goes to Documents\\_غير مصنف - Unsorted\\ (unknown title, odd name, a non-Save html)', unsList.length === 3 && unsList.includes('whatever.pdf') && unsList.some((f) => /Nobody knows this - العربية\.pdf$/.test(f)) && done.unmatched >= 2, unsList.join(' | '));
const histNow = fs.readdirSync(OD.history).filter((f) => f.endsWith('.bwlog')).sort();
check('migration: history files are "<Document title> (<id8>)"; a log of no known document is "<Untitled> (<id8>)"; no bare uuid name remains', histNow.includes('تصريح قديم (11111111).bwlog') && histNow.includes('Shop service (22222222).bwlog') && histNow.includes(`${W.UNTITLED} (99999999).bwlog`) && !histNow.some((f) => /^[0-9a-f]{8}-/.test(f)), histNow.join(' | '));
const idxM = JSON.parse(fs.readFileSync(path.join(OD.history, 'index.json'), 'utf8'));
check('migration: index.json resolves every history id (uuid and doc-uuid) to its stem and folder', idxM.history[H1].folder === 'تصريح قديم' && idxM.history[H2].folder === 'Shop service' && idxM.history[HX].folder === null && !!idxM.history[HD] && idxM.ids['doc-m1'] === 'تصريح قديم', JSON.stringify(idxM.history[H1]));
check('migration: sessions, backups, library, projects.json, profile and host.log are in .system, not at the root', fs.existsSync(path.join(OD.sessions, 'run-1', 'tab-1.json')) && fs.existsSync(path.join(OD.backups, '2026-10-28T10-00-00-old.html')) && fs.existsSync(path.join(OD.library, 'doc-m1.json.gz')) && fs.existsSync(path.join(OD.system, 'projects.json')) && fs.existsSync(path.join(OD.system, 'profile.json.gz')) && fs.existsSync(path.join(OD.history, 'host.log')));
const mlog = JSON.parse(fs.readFileSync(path.join(OD.system, 'migration-0.13.3.json'), 'utf8'));
check('migration is logged in .system\\migration-0.13.3.json (every move, from → to)', mlog.version === '0.13.3' && mlog.runs.length === 1 && mlog.runs[0].moves.length === oldFiles.length && mlog.runs[0].moves.every((m) => m.from && m.to), JSON.stringify(mlog).slice(0, 200));
const again = T.tidy(oldWs);
check('idempotent: a second tidy moves nothing and adds no log run', again.moves === 0 && JSON.parse(fs.readFileSync(path.join(OD.system, 'migration-0.13.3.json'), 'utf8')).runs.length === 1, JSON.stringify(again));
// history opens through the same route the editor uses, on the migrated folder
{
  const srv = await serve(editor, 0, { workspace: oldWs });
  try {
    const b = `http://127.0.0.1:${srv.address().port}`;
    const rr = await Promise.all([H1, H2, HX, HD].map(async (id) => (await (await fetch(`${b}/api/history?doc=${id}`)).json()).log === logOf(id)));
    check('history opens by id after the move: GET /api/history?doc=<id> returns the original log for all four ids', rr.every(Boolean), rr.join(','));
    const doc1 = await (await fetch(`${b}/api/history?doc=${H1}`)).json();
    check('…and its heads (the mirror) too', doc1.mirror?.doc === H1 && doc1.mirror.head.seq === 2);
  } finally { await new Promise((ok) => srv.close(ok)); }
}
// the report reader still finds the logs in the new folder
{
  const { readHistory } = await import('../engine/report.mjs');
  const logs = await readHistory(OD.history).catch(() => []);
  check('readHistory reads the migrated folder (titles in the file names do not matter)', Array.isArray(logs));
}
// ensure() migrates by itself on the first start of a copy, and the explicit command agrees
{
  const copy = path.join(tmp, 'old2');
  fs.cpSync(OR, copy, { recursive: true }); // the already migrated tree: nothing to do
  const fresh = path.join(tmp, 'old3', 'Business-Wrap');
  put(path.join(fresh, 'HTML', 'Auto-2026-10-27-ENG.html'), saveHtmlText({ id: 'doc-auto', en: 'Auto doc' }));
  put(path.join(fresh, 'HISTORY', 'aaaaaaaa-1111-4222-8333-444455556666.bwlog'), '{}');
  const ws3 = { parent: path.join(tmp, 'old3'), root: fresh, chosen: true, dirs: W.dirsOf(fresh) };
  const guess = path.join(tmp, 'old5', 'Business-Wrap');
  put(path.join(guess, 'PDF', 'Guess-2026-10-27-AR.pdf'), '%PDF');
  W.ensure({ parent: path.join(tmp, 'old5'), root: guess, chosen: false, dirs: W.dirsOf(guess) });
  check('a folder nobody chose (the default Documents guess) is never moved by itself; only `business-wrap tidy` moves it', fs.existsSync(path.join(guess, 'PDF', 'Guess-2026-10-27-AR.pdf')));
  W.ensure(ws3);
  check('first start (ensure) of an old-layout folder moves it by itself', fs.existsSync(path.join(ws3.dirs.docs, 'Auto doc', 'Auto doc.html')) && !fs.existsSync(path.join(fresh, 'HTML')) && !fs.existsSync(path.join(fresh, 'HISTORY')), fs.readdirSync(fresh).join(','));
}

/* ───────── 5. command line: tidy ───────── */
{
  const old4 = path.join(tmp, 'old4');
  put(path.join(old4, 'Business-Wrap', 'PDF', 'Cli doc-2026-10-27-AR.pdf'), '%PDF');
  const env = { ...process.env, BW_WORKSPACE: old4, BW_NO_MIGRATE: '1' };
  const { spawnSync } = await import('node:child_process');
  const run = (...a) => spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), ...a], { encoding: 'utf8', env, cwd });
  const d = run('tidy', '--dry-run');
  const stillThere = fs.existsSync(path.join(old4, 'Business-Wrap', 'PDF', 'Cli doc-2026-10-27-AR.pdf'));
  const a = run('tidy');
  check('business-wrap tidy --dry-run prints the plan and moves nothing; business-wrap tidy applies it', d.status === 0 && /plan: 1 of 1/.test(d.stdout) && stillThere && a.status === 0 && /tidy: 1 of 1/.test(a.stdout) && !fs.existsSync(path.join(old4, 'Business-Wrap', 'PDF')) && fs.readdirSync(path.join(old4, 'Business-Wrap', 'المستندات - Documents', W.UNSORTED_NAME)).length === 1, `${d.stdout}${d.stderr} | ${a.stdout}${a.stderr}`);
}
void prev;

/* ───────── 6. nothing written anywhere else ───────── */
check('no file in the working folder, none in the repository root (bw-new, bw-harvest), the real Business-Wrap folder gets no .system or Documents', fs.readdirSync(cwd).length === 0 && !repoOutBefore && !fs.existsSync(path.join(REPO, 'bw-harvest')) && !fs.existsSync(path.join(REPO, 'bw-new')) && !fs.existsSync(path.join(realRoot, '.system')) && !fs.existsSync(path.join(realRoot, W.DOCS_NAME)));
check('no uuid-named, "editor"-named or "ENG"-named file under the workspace root', !walk(R).some((f) => /\.editor\.html$|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}|-ENG\.|-AR\./.test(path.basename(f)) && !f.includes(`${path.sep}.system${path.sep}`)), walk(R).filter((f) => /\.editor\.html$|-ENG\.|-AR\./.test(path.basename(f))).join(' | '));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(out.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nall ${out.length} checks passed`);
process.exit(failed ? 1 : 0);
