// (fix 0163) · project import on an owner's real archive shape: <save folder>\<title>\<title> - مشاركة.html + <title> - وثيقة المتطلبات.pdf,
// المستندات - Documents\<title>\<title>.html (+ Exports\ copies), a blank «خدمة جديدة», desktop.ini, .system\*.ico. A PLACEHOLDER tree of that shape is
// built here (no client names), then imported as a FOLDER and as a ZIP, both through the real routes of a served host (upload + import + job + inbox).
// Asserts: each document once, under its real title (the share file's base is blank, the title is in its edits); no blank «خدمة جديدة»; Exports,
// .system, desktop.ini, ico are not documents; other copies of a title are "not needed", each named; the work (edits, comments) comes in whole;
// the same archive again is "already in the library" with the document named; a PDF-only title whose path is past 260 characters reads; the
// report counts are first, AR and EN; the upload folder is short.
//
//   node tests/import-0163.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { REPO, exportPdf, launchOptions, loadPlaywright, loadTheme } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { dirsOf } from '../engine/workspace.mjs';
import { importProject } from '../engine/project-import.mjs';
import { writeZip } from '../engine/zip.mjs';
import { lp } from '../engine/import/safe.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-i163-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  import-0163: ${n}${d && !ok ? '  — ' + String(d).slice(0, 600) : ''}`); if (!ok) failed += 1; };
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: import-0163 stalled past 15 min`); process.exit(1); }, 15 * 60e3).unref();

const PLACE = 'وثيقة متطلبات الخدمة: خدمة جديدة';
const base = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8'));
base.control.title = PLACE; delete base.control.coverTitle;
const baseEn = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'utf8'));
baseEn.control.title = 'Service requirements: New service'; delete baseEn.control.coverTitle;
const setText = (p, value, i) => ({ op: 'setText', path: p, value, id: `t${i}`, at: '2026-11-02T10:00:00.000Z' });
/** A Save-HTML's edition as the editor saves it: the BLANK base in raw, the work as ops. */
const edition = (doc, name, n, extra = {}) => {
  const raw = JSON.stringify(doc, null, 1);
  const ops = [setText('/control/title', `${doc.control.title.split(':')[0]}: ${name}`, 0), ...Array.from({ length: n - 1 }, (_, i) => setText('/control/owner', `owner ${name} ${i}`, i + 1))];
  return { name, raw, hash: 'sha256:x', ops, status: {}, stale: [], comments: [], versions: [], marks: [], epochIds: [], ...extra };
};
const saveHtml = (title, editions) => `<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body><script type="application/json" id="bw-data">${JSON.stringify({ format: 1, services: [{ id: `doc-${crypto.randomUUID()}`, editions }] })}</script></body></html>`;

// the placeholder titles; B has an editor file, A and C-less documents have a share file, D is a PDF only (long path)
const A = 'عنوان تجريبي أول للخدمة';
const B = 'عنوان تجريبي ثان للخدمة الإلكترونية';
const D = `عنوان طويل جدا لمستند يوجد في ملف PDF فقط ${'كلمة '.repeat(14)}`.trim();
const N_A = 12, N_B = 9, N_B_SHARE = 4;
const noteComment = { id: 'cm1', text: 'ملاحظة', at: '2026-11-02T10:00:00.000Z' };

const th = loadTheme();
const pdfOf = async (file, doc, browser) => { await exportPdf(doc, { locale: 'ar', theme: th, pdfPath: file, browser }); };

const buildTree = async (root) => {
  const w = (rel, data) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(lp(path.dirname(f)), { recursive: true }); fs.writeFileSync(lp(f), data); };
  const browser = await (await loadPlaywright()).chromium.launch(launchOptions());
  const docOf = (t) => { const j = JSON.parse(JSON.stringify(base)); j.control.coverTitle = t; j.control.title = `${PLACE.split(':')[0]}: ${t}`; return j; };
  try {
    // A: share file + PDF (PDF is not needed)
    w(`${A}/${A} - مشاركة.html`, saveHtml(`وثيقة: ${A}`, { ar: edition(base, A, N_A) }));
    const pa = path.join(tmp, 'a.pdf'); await pdfOf(pa, docOf(A), browser); w(`${A}/${A} - وثيقة المتطلبات.pdf`, fs.readFileSync(pa));
    // B: the editor file (both editions, comments) in المستندات, its Exports copy and PDF, and an older share file with fewer edits
    w(`المستندات - Documents/${B}/${B}.html`, saveHtml(B, { ar: edition(base, B, N_B, { comments: [noteComment] }), en: edition(baseEn, B, 2) }));
    w(`المستندات - Documents/${B}/Exports/2026-11-01 12-55 ${B} - العربية.shared.html`, saveHtml(B, { ar: edition(base, B, N_B) }));
    const pb = path.join(tmp, 'b.pdf'); await pdfOf(pb, docOf(B), browser); w(`المستندات - Documents/${B}/Exports/2026-11-01 12-54 ${B} - العربية.pdf`, fs.readFileSync(pb));
    w(`${B}/${B} - مشاركة.html`, saveHtml(`وثيقة: ${B}`, { ar: edition(base, B, N_B_SHARE) }));
    // a blank service nobody touched, folder settings, icons
    w('المستندات - Documents/خدمة جديدة/خدمة جديدة.html', saveHtml(PLACE, { ar: { ...edition(base, 'x', 1), ops: [] }, en: { ...edition(baseEn, 'x', 1), ops: [] } }));
    w('المستندات - Documents/خدمة جديدة/desktop.ini', '[.ShellClassInfo]\r\n');
    w('المستندات - Documents/.system/folder.ico', Buffer.from([0, 0, 1, 0, 0, 0]));
    // D: a PDF only, in a folder and file name so long that the whole path passes 260 characters
    const pd = path.join(tmp, 'd.pdf'); await pdfOf(pd, docOf(D), browser); w(`${D}/${D} - وثيقة المتطلبات.pdf`, fs.readFileSync(pd));
  } finally { await browser.close().catch(() => {}); }
};

const listFiles = (dir, rel = '') => fs.readdirSync(lp(dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), `${rel}${e.name}/`) : [{ file: path.join(dir, e.name), rel: `${rel}${e.name}` }]));

const servers = [];
async function host(name, editorFile) {
  const root = path.join(tmp, name, 'Business-Wrap');
  const ws = { parent: path.join(tmp, name), root, chosen: true, dirs: dirsOf(root) };
  const file = editorFile || path.join(tmp, `${name}.html`);
  if (!editorFile) fs.writeFileSync(file, '<!doctype html><title>x</title>');
  const server = await serve(file, 0, { workspace: ws });
  servers.push(server);
  const base_ = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, raw) => {
    const r = await fetch(base_ + p, { method, headers: raw ? { connection: 'close' } : { 'content-type': 'application/json', connection: 'close' }, ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  };
  const job = async (id) => { const t0 = Date.now(); for (;;) { const j = (await call('GET', `/api/project/job?id=${id}`)).body; if (j.state !== 'running') return j; if (Date.now() - t0 > 300000) throw new Error('job still running'); await new Promise((r) => setTimeout(r, 150)); } };
  /** what the tab does: upload each file under its relative path, then import the upload */
  const uploadImport = async (entries, project, onConflict) => {
    const up = `up-${crypto.randomBytes(16).toString('hex')}`;
    for (const e of entries) { const r = await call('POST', `/api/project/upload?job=${up}&name=${encodeURIComponent(e.rel)}`, fs.readFileSync(lp(e.file)), true); if (r.status !== 200) throw new Error(`upload ${e.rel}: ${r.status} ${JSON.stringify(r.body)}`); }
    const j = (await call('POST', '/api/project/import', { job: up, project, onConflict })).body.job;
    return job(j);
  };
  const inbox = async () => { const ids = (await call('GET', '/api/library/inbox')).body.ids; return Promise.all(ids.map(async (id) => (await call('GET', `/api/library/inbox?id=${id}`)).body)); };
  return { call, uploadImport, inbox, ws, port: server.address().port };
}

const assertResult = (label, j, entries) => {
  const r = j.result || {};
  const titles = (r.came_in || []).map((c) => c.title);
  const want = [A, B, D];
  check(`${label}: the job finished (${j.state})`, j.state === 'done', JSON.stringify(j).slice(0, 400));
  check(`${label}: each document once, under its real title (A, B, D)`, titles.length === 3 && want.every((t) => titles.filter((x) => x === t).length === 1), JSON.stringify(titles));
  check(`${label}: no blank «خدمة جديدة» came in`, !titles.some((t) => /^(خدمة جديدة|New service)$/i.test(t)) && !entries.some((e) => /خدمة جديدة/.test(e.title || '')));
  const sk = (k) => (r.skipped || []).filter((x) => x.kind === k);
  check(`${label}: the blank service is skipped with a reason`, sk('blank').length === 1 && /blank/.test(sk('blank')[0].reason));
  check(`${label}: Exports (2 files), .system icon, desktop.ini (2) are not documents`, sk('not-document').length === 2 && sk('system').length === 2 && !(r.failed || []).length, JSON.stringify({ nd: sk('not-document').length, sys: sk('system').length, failed: r.failed }));
  const nn = sk('not-needed');
  check(`${label}: other copies are "not needed" and name the document: A's PDF, B's old share file`, nn.length === 2 && nn.every((x) => /not needed/.test(x.reason) && (x.reason.includes(A) || x.reason.includes(B))), JSON.stringify(nn.map((x) => x.reason)));
  check(`${label}: the report has counts first, AR and EN`, r.report?.counts?.came_in === 3 && r.report.counts.not_needed === 2 && /^دخل 3/.test(r.report.ar) && /^3 documents came in/.test(r.report.en), JSON.stringify(r.report));
};
const assertWork = (label, entries) => {
  const by = (t) => entries.find((e) => e.title === t);
  const a = by(A), b = by(B), d = by(D);
  check(`${label}: the share file's work came in whole (${N_A} edits, real title after the edits)`, a && a.editions.ar.ops.length === N_A && a.editions.ar.ops[0].path === '/control/title', JSON.stringify(a?.editions?.ar?.ops?.length));
  check(`${label}: the editor file won over its Exports copy and older share file: ${N_B} edits AR, 2 EN, comment kept`, b && b.editions.ar.ops.length === N_B && b.editions.en?.ops.length === 2 && b.editions.ar.comments.length === 1, JSON.stringify([b?.editions?.ar?.ops?.length, b?.editions?.en?.ops?.length, b?.editions?.ar?.comments?.length]));
  check(`${label}: the PDF-only document with a path past 260 characters was read (words > 0)`, d && d.words?.ar > 0, JSON.stringify(d?.words));
};

try {
  const root = path.join(tmp, 'tree', 'Fixture');
  await buildTree(root);
  const files = listFiles(root);
  const longest = Math.max(...files.map((f) => f.file.length));
  check(`fixture: ${files.length} files, the longest path is ${longest} characters (past 260 so the long-path case is real)`, files.length === 10 && longest > 260, `${files.length} ${longest}`);

  // 1. importProject straight on the folder (paths): pure function, a fake queue
  const q = [];
  const direct = await importProject({ inputs: [root], queue: async (docs) => { q.push(...docs); return { doc_id: docs.map((_, i) => `d${i}`) }; } });
  check('folder, direct: 3 documents, 0 failed (the long PDF reads)', direct.came_in.length === 3 && !direct.failed.length, JSON.stringify({ failed: direct.failed, in: direct.came_in.map((c) => c.title) }));

  // 2. the real routes: folder upload, then zip upload
  const H = await host('f');
  check('ready: the host answers the project routes (unknown job is 404)', (await H.call('GET', '/api/project/job?id=nope')).status === 404);
  const jf = await H.uploadImport(files, 'مشروع تجريبي', 'skip');
  const ef = await H.inbox();
  assertResult('folder via routes', jf, ef);
  assertWork('folder via routes', ef);
  check('folder via routes: the documents joined the named project', ef.length === 3 && ef.every((e) => e.project), JSON.stringify(ef.map((e) => e.project)));
  const upDirs = fs.readdirSync(os.tmpdir()).filter((x) => /^bw-u-/.test(x));
  check('the upload folder name is short (bw-u-<8 hex>) and is gone after the import', upDirs.every((x) => x.length <= 13) && !fs.readdirSync(os.tmpdir()).some((x) => /^bw-upload-/.test(x)), JSON.stringify(upDirs));

  for (const e of ef) await H.call('POST', '/api/library/mirror', { entry: e }); // what the tab does once it has ingested the inbox
  const again = await H.uploadImport(files, 'مشروع تجريبي', 'skip');
  const ag = (again.result?.skipped || []).filter((x) => x.kind === 'already');
  check('same archive again: all 3 are "already in the library (same content)" and each names its document', again.result.came_in.length === 0 && ag.length === 3 && [A, B, D].every((t) => ag.some((x) => x.reason.includes(t))), JSON.stringify(ag.map((x) => x.reason)));

  const zip = path.join(tmp, `Fixture-${'ا'.repeat(40)}.zip`);
  writeZip(zip, files.filter((f) => !/\.ico$/.test(f.rel)).map((f) => ({ name: `Fixture/${f.rel}`, file: f.file })).filter((e) => e.name.length < 400));
  const Z = await host('z');
  const jz = await Z.uploadImport([{ file: zip, rel: path.basename(zip) }], 'مشروع من ملف', 'skip');
  const ez = await Z.inbox();
  const rz = jz.result || {};
  check('zip via routes: finished, 3 documents once each under real titles, none blank', jz.state === 'done' && ez.length === 3 && [A, B, D].every((t) => ez.filter((e) => e.title === t).length === 1) && !rz.failed.length, JSON.stringify({ s: jz.state, f: rz.failed, e: jz.error, t: ez.map((e) => e.title) }));
  assertWork('zip via routes', ez);
  check('zip: the blank service and the Exports copies are skipped, the copies are "not needed"', (rz.skipped || []).some((x) => x.kind === 'blank') && (rz.skipped || []).filter((x) => x.kind === 'not-needed').length === 2, JSON.stringify((rz.skipped || []).map((x) => x.kind)));

  // 3. one unreadable entry costs only itself (a method the reader does not know), the rest of the zip comes in
  const bad = path.join(tmp, 'one-bad.zip');
  writeZip(bad, [{ name: 'X/ok.html', data: saveHtml('x', { ar: edition(base, 'سليم', 3) }) }, { name: 'X/other.html', data: saveHtml('y', { ar: edition(base, 'سليم آخر', 3) }) }]);
  const buf = fs.readFileSync(bad);
  const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), buf.length - 400);
  const first = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  buf.writeUInt16LE(14, first + 10); // the first entry now claims method 14 (LZMA)
  fs.writeFileSync(bad, buf);
  const one = await importProject({ inputs: [bad], queue: async (docs) => ({ doc_id: docs.map((_, i) => `d${i}`) }) });
  check('a zip with one unreadable entry: that entry fails with a named reason, the other document comes in', cd > 0 && one.came_in.length === 1 && one.failed.length === 1 && /compression method 14/.test(one.failed[0].reason), JSON.stringify({ in: one.came_in.length, failed: one.failed }));

  // 4. the sealed history log travels (0.16.3, AMEND): an honest saved file imported opens with NO tamper warning, a file whose log was really cut still warns
  const edFile = path.join(tmp, 'ed.editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: edFile, set: 'i163', watermarkDir: null });
  const browser = await chromium.launch(launchOptions());
  try {
    const dataOf = (html) => JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html)[1]);
    const withData = (html, d) => html.replace(/(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(d).replace(/</g, '\u003c') + b);
    const saved = async (title, name) => {
      const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
      const pg = await ctx.newPage();
      await pg.goto(pathToFileURL(edFile).href);
      await pg.waitForFunction(() => window.BW?.ready && window.BW.EXT.ledger?.log());
      await pg.evaluate(async () => { await window.BW.EXT.ledger.ready(); });
      for (const v of [`${title} 1`, title]) await pg.evaluate((v) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return window.BW.commit([{ op: 'setText', path: '/control/title', value: v, old: e.doc.control.title }]); }, v);
      await pg.evaluate(() => window.BW.EXT.ledger.ready());
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(() => window.BW.runAction('saveHtml'))]);
      const f = path.join(tmp, name); await dl.saveAs(f); await ctx.close();
      return fs.readFileSync(f, 'utf8');
    };
    const honest = await saved('عنوان سجل سليم', 'honest.html');
    const cutSrc = await saved('عنوان سجل مقطوع', 'cut.html');
    const dh = dataOf(honest), dc = dataOf(cutSrc);
    check('fixture: the honest saved file carries a sealed log and the bwlog mark', !!dh.prov?.[dh.services[0].id]?.log && dh.bwlog === 1, Object.keys(dh.prov || {}).join());
    const { prov: _cut, ...dcut } = dc;
    const root2 = path.join(tmp, 'tree2');
    const w2 = (rel, data) => { const f = path.join(root2, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
    w2('سليم/سليم.html', honest); w2('مقطوع/مقطوع.html', withData(cutSrc, dcut));
    const E = await host('p', edFile);
    const jp = await E.uploadImport(listFiles(root2), 'مشروع السجل', 'skip');
    const ep = await E.inbox();
    const byT = (t) => ep.find((e) => e.title === t);
    const hon = byT('عنوان سجل سليم'), cut = byT('عنوان سجل مقطوع');
    check('history: both documents came in; the honest entry carries its log (entry.prov, old document id), the cut one has none', jp.state === 'done' && ep.length === 2 && hon?.prov?.log && hon.prov.doc && !cut?.prov, JSON.stringify({ s: jp.state, t: ep.map((e) => e.title), p: ep.map((e) => !!e.prov) }));
    const ctx2 = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    const page = await ctx2.newPage();
    await page.goto(`http://127.0.0.1:${E.port}/`);
    await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library && window.BW.EXT.ledger);
    await page.waitForFunction(async (n) => (await window.BW.EXT.library.all()).filter((e) => /^doc-/.test(e.id)).length >= n, 2);
    const openV = async (id) => { await page.waitForFunction(async (id) => !!(await window.BW.EXT.library.get(id)), id, { timeout: 30000 }); let r = false; for (let i = 0; i < 20 && !r; i++) { r = await page.evaluate((id) => window.BW.EXT.library.open(id), id); if (!r) await new Promise((x) => setTimeout(x, 1000)); } await page.waitForFunction((id) => window.BW.S.svc === id, id, { timeout: 15000 }).catch(async (e) => { throw new Error(`open(${id}) returned ${r}; S.svc=${await page.evaluate(() => window.BW.S.svc)}; ids=${JSON.stringify(await page.evaluate(async () => (await window.BW.EXT.library.all()).map((x) => x.id)))}`); }); await page.evaluate(() => window.BW.EXT.ledger.ready()); return page.evaluate(() => { const l = window.BW.EXT.ledger.log(); return { ok: l.verdict.ok, reasons: l.verdict.issues.map((i) => i.reason), src: l.src, n: l.entries.length }; }); };
    const vh = await openV(hon.id);
    check('honest imported document: opens with its own log, chain intact, NO tamper warning', vh.ok && !vh.reasons.length && vh.src === 'entry' && vh.n >= 3, JSON.stringify(vh));
    const vc = await openV(cut.id);
    check('imported document whose log was really cut still warns («stripped»)', !vc.ok && vc.reasons.includes('stripped'), JSON.stringify(vc));
    await ctx2.close();
  } finally { await browser.close(); }
} catch (e) {
  check('test run', false, e.stack || e);
} finally {
  for (const s of servers) await new Promise((r) => s.close(r));
  try { fs.rmSync(lp(tmp), { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed} import-0163 check(s)` : `import-0163: ${out.length} checks, all passed`);
process.exit(failed ? 1 : 0);
