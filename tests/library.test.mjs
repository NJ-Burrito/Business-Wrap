// A2 document library (design.md §3 A2): Save on a template creates entry 1 and the template keeps 0 ops after a
// reload; Save again updates entry 1 (no entry 2); New → Save creates entry 2; Open in new tab shows entry 2 in a
// second page; Delete → Trash → Restore round-trip from the drawer; import of a Save-HTML file creates an entry;
// served: a DOCX gives ≥ 1 table and ≥ 3 headings, a PDF's Arabic word count matches pdftotext. Headless Chrome.
//
//   node tests/library.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { py } from '../engine/py.mjs';
import { pdfText } from '../engine/import/import.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-lib-'));
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  library: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };

const file = path.join(tmp, 'lib.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit'), path.join(REPO, 'samples', 'blank')], out: file, set: 'lib-test', watermarkDir: null });
const url = pathToFileURL(file).href;
const ws = { parent: tmp, root: path.join(tmp, 'Business-Wrap'), dirs: Object.fromEntries(['pdf', 'docx', 'html', 'history'].map((k) => [k, path.join(tmp, 'Business-Wrap', k.toUpperCase())])) };
const browser = await chromium.launch(launchOptions());
let server = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const ready = (p = page) => p.waitForFunction(() => window.BW?.ready && window.BW.EXT.library);
  const saved = (p, n) => p.waitForFunction((n) => (window.BW.libSaved || 0) >= n, n, { timeout: 10000 });
  const lib = (p = page) => p.evaluate(async () => (await window.BW.EXT.library.all()).map((e) => ({ id: e.id, title: e.title, origin: e.origin, ops: Object.values(e.editions).reduce((a, x) => a + x.ops.length, 0), deleted: !!e.deletedAt })));
  await page.goto(url);
  await ready();

  // 1. Save on the template → entry 1; the template goes back to 0 ops
  await page.evaluate(() => { window.BW.S.svc = 'event-permit'; window.BW.S.ed = 'ar'; window.BW.setText('/chapters/0/title', 'مقدمة معدلة'); });
  await page.evaluate(() => window.BW.runAction('save'));
  await saved(page, 1);
  const s1 = await page.evaluate(() => ({ svc: window.BW.S.svc, tmpl: window.BW.M['event-permit'].ar.ops.length }));
  let L = await lib();
  check('Save on a template creates entry 1 and switches to it', L.length === 1 && s1.svc === L[0].id && /^doc-/.test(s1.svc) && L[0].ops === 1 && L[0].origin === 'template', JSON.stringify({ s1, L }));
  await page.reload();
  await ready();
  const after = await page.evaluate(() => window.BW.M['event-permit'].ar.ops.length + window.BW.M['event-permit'].en.ops.length);
  check('the template keeps 0 ops after a reload (never overwritten)', after === 0 && (await lib()).length === 1, String(after));

  // 2. Save again on the entry → still one entry, now 2 ops
  const id1 = L[0].id;
  await page.evaluate((id) => window.BW.EXT.library.open(id), id1);
  await page.evaluate(() => window.BW.setText('/chapters/1/title', 'بطاقة معدلة'));
  await page.evaluate(() => window.BW.runAction('save'));
  await saved(page, 1);
  await page.waitForFunction(async (id) => (await window.BW.EXT.library.get(id)).editions.ar.ops.length === 2, id1, { timeout: 5000 }).catch(() => {});
  L = await lib();
  check('Save again updates entry 1 (no entry 2)', L.length === 1 && L[0].ops === 2, JSON.stringify(L));

  // 3. New document → Save → entry 2 (the blank placeholder SRS)
  const blankTitle = await page.evaluate(async () => { await window.BW.EXT.library.newDocument(); return window.BW.EXT.library.titleOf(); });
  const unsaved = (await lib()).length;
  await page.evaluate(() => window.BW.runAction('save'));
  await saved(page, 2);
  L = await lib();
  const id2 = L.find((e) => e.id !== id1)?.id;
  check('New document opens the blank SRS unsaved; Save creates entry 2', unsaved === 1 && L.length === 2 && !!id2 && L.find((e) => e.id === id2).origin === 'blank', JSON.stringify({ unsaved, L, blankTitle }));

  // 4. Open in new tab
  const p2 = await ctx.newPage();
  await p2.goto(`${url}#doc=${id2}`);
  await ready(p2);
  await p2.waitForFunction((id) => window.BW.S.svc === id, id2, { timeout: 5000 }).catch(() => {});
  check('Open in new tab (#doc=<id>) shows entry 2 in a second page', (await p2.evaluate(() => window.BW.S.svc)) === id2);
  await p2.close();

  // 5. Delete → Trash → Restore from the drawer (opened with Ctrl+O)
  await page.locator('main.bw-doc h1, main.bw-doc h2').first().click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+O');
  check('Ctrl+O opens «المستندات»', (await page.evaluate(() => window.BW.S.drawer)) === 'library');
  const sh = (sel) => page.locator(`#bw-ui-host >> css=.drawer ${sel}`);
  await sh(`li[data-id="${id2}"] [data-lib="del"]`).click();
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').dataset.libTrash === '1', null, { timeout: 5000 }).catch(() => {});
  const inTrash = (await lib()).find((e) => e.id === id2)?.deleted;
  await sh('.lib-trash summary').click();
  await sh(`.lib-trash li[data-id="${id2}"] [data-lib="restore"]`).click();
  await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer').dataset.libTrash === '0', null, { timeout: 5000 }).catch(() => {});
  const back = (await lib()).find((e) => e.id === id2);
  check('Delete → Trash → Restore round-trip (soft delete, nothing purged)', inTrash === true && back && !back.deleted, JSON.stringify({ inTrash, back }));

  // 6. import a Save-HTML file
  await page.evaluate((id) => window.BW.EXT.library.open(id), id1);
  const dl = page.waitForEvent('download');
  await page.evaluate(() => window.BW.saveHtml(false));
  const htmlFile = path.join(tmp, 'saved.editor.html');
  await (await dl).saveAs(htmlFile);
  await page.evaluate(() => window.BW.openDrawer('library'));
  const fc = page.waitForEvent('filechooser');
  await sh('[data-lib="import"]').click();
  await (await fc).setFiles(htmlFile);
  await page.waitForFunction(async () => (await window.BW.EXT.library.all()).length === 3, null, { timeout: 8000 }).catch(() => {});
  L = await lib();
  const imp = L.find((e) => e.origin === 'import');
  check('import of a Save-HTML file creates an entry with its edits', L.length === 3 && imp && imp.ops === 2, JSON.stringify(L));
  check('no page errors', errors.length === 0, errors.join(' | '));

  // 7. served: DOCX and PDF import through the local server
  server = await serve(file, 0, { workspace: ws });
  const base = `http://127.0.0.1:${server.address().port}`;
  const docx = path.join(tmp, 'fixture.docx');
  const [cmd, args] = py([path.join(REPO, 'tests', 'fixtures', 'import', 'make_docx.py'), docx], ['python-docx']);
  const mk = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  check('the DOCX fixture is written (python-docx through uv)', mk.status === 0 && fs.existsSync(docx), mk.stderr);
  const sp = await ctx.newPage();
  sp.on('pageerror', (e) => errors.push(e.message));
  await sp.goto(base + '/');
  await ready(sp);
  await sp.evaluate(() => window.BW.openDrawer('library'));
  const fc2 = sp.waitForEvent('filechooser');
  await sp.locator('#bw-ui-host >> css=.drawer [data-lib="import"]').click();
  await (await fc2).setFiles(docx);
  await sp.waitForFunction(() => /^doc-/.test(window.BW.S.svc) && window.BW.M[window.BW.S.svc].ar, null, { timeout: 60000 }).catch(() => {});
  const dx = await sp.evaluate(() => { const d = window.BW.M[window.BW.S.svc]?.ar?.doc; if (!d) return null; const secs = d.chapters.flatMap((c) => c.sections); return { headings: d.chapters.length + secs.filter((s) => s.title !== d.chapters.find((c) => c.sections.includes(s)).title).length, tables: secs.flatMap((s) => s.blocks).filter((b) => b.kind === 'table').length, q: d.openQuestions.length }; });
  check('served: a DOCX import opens as a new entry with ≥ 3 headings and ≥ 1 table', dx && dx.headings >= 3 && dx.tables >= 1 && dx.q === 1, JSON.stringify(dx));
  const mirrored = fs.existsSync(path.join(ws.dirs.history, 'library')) && fs.readdirSync(path.join(ws.dirs.history, 'library')).some((f) => f.endsWith('.json.gz'));
  check('served: the entry is mirrored to HISTORY\\library (gzip, machine-only)', mirrored);

  const pdf = path.join(tmp, 'fixture.pdf');
  const blankAr = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'));
  await exportPdf(blankAr, { locale: 'ar', theme: loadTheme(), pdfPath: pdf });
  const r = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'fixture.pdf', data: fs.readFileSync(pdf).toString('base64') }) });
  const j = await r.json();
  const arWords = (s) => (String(s).match(/\S+/g) || []).filter((w) => /[؀-ۿ]/.test(w)).length;
  // the text the PDF gave: chapter and section titles (the importer's own «المحتوى المستورد» chapter left out; a section the importer added under a chapter repeats its title: counted once), paragraphs, cells
  const textOfDoc = (d) => d.chapters.flatMap((c) => [c.title === 'المحتوى المستورد' ? '' : c.title, ...c.sections.flatMap((s) => [s.title === c.title ? '' : s.title, ...s.blocks.flatMap((b) => [...(b.paragraphs || []), ...(b.columns || []), ...(b.rows || []).flat()])])]).join(' ');
  const docWords = j.doc ? arWords(textOfDoc(j.doc)) : -1;
  const want = arWords(pdfText(pdf));
  check('served: a PDF import keeps every Arabic word pdftotext reads (-enc UTF-8)', r.status === 200 && j.locale === 'ar' && docWords === want && want > 20, JSON.stringify({ status: r.status, docWords, want, err: j.error }));
  const bad = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x.exe', data: '' }) });
  check('served: import refuses anything but .pdf / .docx', bad.status === 400);
  await ctx.close();
} finally {
  await browser.close();
  if (server) { server.close(); server.closeAllConnections?.(); }
}

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nlibrary: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
