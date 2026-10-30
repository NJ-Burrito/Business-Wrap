// A2 document library (design.md §3 A2): Save on a template creates entry 1 and the template keeps 0 ops after a
// reload; Save again updates entry 1 (no entry 2); New → Save creates entry 2; Open in new tab shows entry 2 in a
// second page; Delete → Trash → Restore round-trip from the drawer; import of a Save-HTML file creates an entry;
// served: a DOCX gives ≥ 1 table and ≥ 3 headings, a PDF's Arabic word count matches pdftotext. Headless Chrome.
//
//   node tests/library.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { py } from '../engine/py.mjs';
import { pdfItems, structure } from '../engine/import/import.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-lib-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local'); // the host's profile and state stay in this run's folder (never the install's .local or a caller's)
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
  { // 0.13.1 final pass #3 (extras2 #2, one title store): the cover title drives «عنوان الوثيقة», the list title and the tab
    const tt = await page.evaluate(async () => { const B = window.BW; B.setText('/control/coverTitle', 'عنوان واحد للوثيقة'); await new Promise((r) => setTimeout(r, 50)); B.render(); return { tab: document.title, list: B.EXT.library.titleOf(), ctl: B.M[B.S.svc][B.S.ed].doc.control.title }; });
    check('one title: the cover title names «عنوان الوثيقة», the list title and the browser tab', tt.tab === 'عنوان واحد للوثيقة' && tt.list === tt.tab && /عنوان واحد للوثيقة$/.test(tt.ctl), JSON.stringify(tt));
  }
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

  // 0.13.0 review line 7 (owner flows): «افتح هنا» → #doc=<id> + the drawer closes; an edit is autosaved INTO the list
  // entry (no «حُفظ تلقائياً» toast, the «آخر حفظ» stamp moves); reload → the same document with its edits, no banner;
  // reopening from the list after a reload loses nothing
  await page.evaluate(() => { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Tester' })); window.BW.openDrawer('library'); });
  await sh(`li[data-id="${id1}"] [data-lib="open"]`).click();
  await page.waitForFunction((id) => window.BW.S.svc === id && !window.BW.S.drawer, id1, { timeout: 5000 }).catch(() => {});
  const o1 = await page.evaluate(() => ({ hash: location.hash, drawer: window.BW.S.drawer }));
  check('«افتح هنا» puts #doc=<id> in the address and closes the drawer', o1.hash === `#doc=${id1}` && !o1.drawer, JSON.stringify(o1));
  const toasts = () => page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast, [role="status"]')].map((x) => x.textContent).join(' | '));
  const seqOf = () => page.evaluate(() => Number(document.documentElement.dataset.bwLibSaved || 0));
  const s0 = await seqOf();
  const stamp0 = await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-stamp')?.dataset.list || '');
  await page.evaluate(() => { window.BW.setText('/chapters/0/sections/0/title', 'غرض معدل'); });
  await page.waitForFunction((n) => Number(document.documentElement.dataset.bwLibSaved || 0) > n, s0, { timeout: 5000 }).catch(() => {});
  const stored = await page.evaluate(async (id) => (await window.BW.EXT.library.get(id)).editions.ar.ops.length, id1);
  const st = await page.evaluate(() => { const el = document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-stamp'); return { text: el?.textContent || '', list: el?.dataset.list || '' }; });
  const tt = await toasts();
  check('an edit is autosaved into the list entry, the «آخر حفظ» stamp moves, no «حُفظ تلقائياً» toast', stored === 3 && st.list && st.list !== stamp0 && /آخر حفظ/.test(st.text) && !/حُفظ تلقائياً/.test(tt), JSON.stringify({ stored, st, stamp0, tt: tt.slice(0, 200) }));
  await page.reload();
  await ready();
  await page.waitForFunction((id) => window.BW.S.svc === id, id1, { timeout: 5000 }).catch(() => {});
  const r1 = await page.evaluate(() => ({ svc: window.BW.S.svc, ops: window.BW.M[window.BW.S.svc]?.ar.ops.length, title: window.BW.M[window.BW.S.svc]?.ar.doc.chapters[0].sections[0].title, banner: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.banner') }));
  check('reload → the same document with its edits, no restore banner', r1.svc === id1 && r1.ops === 3 && r1.title === 'غرض معدل' && !r1.banner, JSON.stringify(r1));
  await page.evaluate(() => { window.BW.setText('/chapters/1/sections/0/title', 'وصف معدل'); });
  await page.waitForFunction(() => Number(document.documentElement.dataset.bwDraft || 0) > 0, null, { timeout: 5000 }).catch(() => {});
  await page.reload(); // inside the autosave window: the newer draft is applied quietly
  await ready();
  await page.waitForFunction((id) => window.BW.S.svc === id, id1, { timeout: 5000 }).catch(() => {});
  const r2 = await page.evaluate(() => ({ ops: window.BW.M[window.BW.S.svc]?.ar.ops.length, banner: !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.banner') }));
  check('a reload right after an edit keeps it (the draft is newer than the entry), no banner', r2.ops === 4 && !r2.banner, JSON.stringify(r2));
  await page.evaluate((id) => window.BW.EXT.library.open(id), id2);
  await page.evaluate((id) => window.BW.EXT.library.open(id), id1);
  const r3 = await page.evaluate(() => window.BW.M[window.BW.S.svc].ar.ops.length);
  check('reopening from the list after switching documents loses nothing', r3 === 4, String(r3));

  // extra 6: «مقارنة بآخر حفظ HTML»: 2 paragraphs changed → exactly 2 differences; restoring one leaves the other
  await page.evaluate(() => window.BW.EXT.library.newDocument());
  const dl2 = page.waitForEvent('download');
  await page.evaluate(() => window.BW.saveHtml(false));
  await (await dl2).cancel().catch(() => {});
  const cmp = await page.evaluate(() => {
    const TL = window.BW.EXT.timeline;
    window.BW.setText('/chapters/0/sections/0/blocks/0/paragraphs/0', 'فقرة أولى معدلة');
    window.BW.S.typingGroup = null;
    window.BW.setText('/chapters/0/sections/1/blocks/0/paragraphs/0', 'فقرة ثانية معدلة');
    const before = TL.diff().map((d) => d.path);
    TL.restoreOne(before[0]);
    const after = TL.diff().map((d) => d.path);
    return { before, after };
  });
  check('Compare with the last Save HTML: 2 changed paragraphs = 2 differences; restoring one leaves the other', cmp.before.length === 2 && cmp.after.length === 1 && cmp.after[0] === cmp.before[1], JSON.stringify(cmp));
  await page.evaluate(() => { window.BW.EXT.timeline.compare(true); window.BW.openDrawer('timeline'); });
  const cmpUi = await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .tl-cmp')?.dataset.n);
  check('the «تغييرات» drawer shows the compare view', cmpUi === '1', String(cmpUi));
  await page.evaluate(() => { window.BW.EXT.timeline.compare(false); window.BW.closeDrawer?.(); });

  // extra 8: «نسخ كقالب» → New from template: same header/footer items, palette and chapters, empty bodies
  const tp = await page.evaluate(async (id) => {
    const LIB = window.BW.EXT.library;
    await LIB.open(id);
    const src = window.BW.M[id].ar.doc;
    const tpl = await LIB.saveTemplate(id);
    window.BW.S.theme = { ...window.BW.S.theme, vars: { ...(window.BW.S.theme.vars || {}), '--x-probe': '1' } };
    await LIB.fromTemplate(tpl.id);
    const d = window.BW.M[window.BW.S.svc].ar.doc;
    return {
      tpl: tpl.id, isNew: window.BW.S.svc !== id,
      chapters: JSON.stringify(src.chapters.map((c) => [c.title, c.sections.map((s) => s.title)])) === JSON.stringify(d.chapters.map((c) => [c.title, c.sections.map((s) => s.title)])),
      empty: d.chapters.every((c) => c.sections.every((s) => s.blocks.length === 1 && s.blocks[0].kind === 'prose' && s.blocks[0].paragraphs.join('') === '')),
      chrome: JSON.stringify(src.chrome || null) === JSON.stringify(d.chrome || null),
      palette: !('--x-probe' in (window.BW.S.theme.vars || {})),
      listed: (await LIB.all()).filter((e) => e.kind === 'template').length,
    };
  }, id1);
  check('«نسخ كقالب» then New from template: same chapters and header/footer, palette restored, empty bodies', tp.isNew && tp.chapters && tp.empty && tp.chrome && tp.palette && tp.listed === 1, JSON.stringify(tp));

  // extra 5: per-document metrics from the provenance log (BWLOG1.metrics, read only): 3 edits by the tester
  const mt = await page.evaluate(async () => {
    const BW = window.BW;
    BW.S.svc = 'event-permit'; BW.S.ed = 'ar';
    await BW.EXT.ledger?.ready?.();
    const base = (await BW.EXT.library.metricsOf({ id: 'event-permit' })).edits;
    for (const [i, p] of ['/chapters/0/title', '/chapters/1/title', '/chapters/2/title'].entries()) { BW.S.typingGroup = null; BW.setText(p, `عنوان ${i}`); }
    await BW.EXT.ledger?.ready?.();
    const m = await BW.EXT.library.metricsOf({ id: 'event-permit' });
    return { d: m.edits - base, who: m.who };
  });
  check('metrics read from the provenance log: 3 edits and the editor\'s name', mt.d === 3 && mt.who.includes('Tester'), JSON.stringify(mt));
  await page.evaluate(() => window.BW.openDrawer('library'));
  await page.waitForFunction(() => Number(document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer')?.dataset.libMetrics || 0) > 0, null, { timeout: 8000 }).catch(() => {});
  const rowM = await page.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer .lib-docs .lib-m')].map((x) => x.dataset.edits));
  check('every document row carries its metrics line', rowM.length >= 3 && rowM.every((x) => x !== undefined), JSON.stringify(rowM));
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
  const mirrored = fs.existsSync(path.join(ws.dirs.history, 'library')) && fs.readdirSync(path.join(ws.dirs.history, 'library')).some((f) => f.endsWith('.json.gz')); // a hand-made old-layout dirs object: the mirror stays inside its history
  check('served: the entry is mirrored to .system\\library (gzip, machine-only)', mirrored);

  // review line 7 + extra 4: an import keeps the document's structure and takes ITS title (not the file name), for PDF,
  // DOCX (ours and a hand-made one) and HTML; the front matter (cover, control table, contents) is not a chapter
  const blankAr = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'));
  const src = { ...blankAr, control: { ...blankAr.control, title: 'وثيقة متطلبات الخدمة: تصريح استيراد تجريبي' } };
  const want = src.chapters.map((c) => c.title);
  const post = async (name, file) => { const r = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, data: fs.readFileSync(file).toString('base64') }) }); return { status: r.status, ...(await r.json()) }; };
  const shape = (j) => ({ status: j.status, title: j.doc?.control.coverTitle, chapters: j.doc?.chapters.map((c) => c.title), tables: j.doc?.chapters.flatMap((c) => c.sections).flatMap((s) => s.blocks).filter((b) => b.kind === 'table').length, err: j.error });
  const pdf = path.join(tmp, 'sample.pdf');
  await exportPdf(src, { locale: 'ar', theme: loadTheme(), pdfPath: pdf });
  const jp = shape(await post('sample.pdf', pdf));
  { // pdftotext text as poppler 24.02 (Ubuntu 24.04, the CI runner) prints it: a chapter heading is «title   N», a section « N.M title»
    const pad = (n) => ' '.repeat(n), RLE = '\u202b', PDF = '\u202c';
    const row = (t, n) => pad(40) + RLE + t + PDF + pad(12) + RLE + '\u202a' + n + PDF + PDF;
    const sec = (n, t) => pad(30) + RLE + '\u202a ' + n + PDF + t + PDF;
    const contents = ['', pad(40) + RLE + 'جدول المحتويات' + PDF, '', row('المقدمة', 1), row('الغرض من الوثيقة', '1.1'), row('بطاقة الخدمة', 2), row('وصف الخدمة', '2.1')].join('\n');
    const body = [row('المقدمة', 1), sec('1.1', 'الغرض من الوثيقة'), '', row('بطاقة الخدمة', 2), sec('2.1', 'وصف الخدمة')].join('\n');
    const old = structure(pdfItems(contents + '\f' + body, { rtl: true }));
    check('import (poppler 24.02 text): chapter headings printed as «title   N» are chapters, sections stay sections', JSON.stringify(old.body.filter((i) => i.h === 1).map((i) => i.text)) === JSON.stringify(['المقدمة', 'بطاقة الخدمة']) && old.body.filter((i) => i.h === 2).length === 2, JSON.stringify(old.body));
    const tbl = structure(pdfItems(contents + '\f' + [row('المقدمة', 1), '', pad(20) + 'الرمز' + pad(10) + '3', pad(20) + 'النوع' + pad(10) + '5'].join('\n'), { rtl: true }));
    check('import (poppler 24.02 text): a row «name   3» that is not the next chapter stays out of the headings', tbl.body.filter((i) => i.h === 1).length === 1, JSON.stringify(tbl.body));
  }
  check('served: a PDF import is titled by its cover title (not «sample») with its 5 chapters', jp.status === 200 && jp.title === 'تصريح استيراد تجريبي' && JSON.stringify(jp.chapters) === JSON.stringify(want), JSON.stringify(jp));
  const ourDocx = path.join(tmp, 'sample.docx');
  exportDocx(src, { locale: 'ar', theme: loadTheme(), docxPath: ourDocx, embedFonts: false });
  const jd = shape(await post('sample.docx', ourDocx));
  check('served: an exported DOCX re-imports with its title, its 5 chapters and its tables', jd.status === 200 && jd.title === 'تصريح استيراد تجريبي' && JSON.stringify(jd.chapters) === JSON.stringify(want) && jd.tables >= 3, JSON.stringify(jd));
  check('the DOCX export leaves no manifest.json beside the .docx', !fs.readdirSync(tmp).some((f) => /manifest\.json$/.test(f)), fs.readdirSync(tmp).join(','));
  const d5 = path.join(tmp, 'five.docx');
  const [c5, a5] = py([path.join(REPO, 'tests', 'fixtures', 'import', 'make_docx5.py'), d5], ['python-docx']);
  spawnSync(c5, a5, { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const j5 = shape(await post('five.docx', d5));
  check('served: a hand-made 5-chapter DOCX → 5 chapters, same headings, title = its Title paragraph', j5.title === 'تصريح استيراد تجريبي' && j5.chapters?.length === 5 && j5.chapters[0] === 'المقدمة' && j5.tables === 1, JSON.stringify(j5));
  const jh = shape(await post('five-chapters.html', path.join(REPO, 'tests', 'fixtures', 'import', 'five-chapters.html')));
  check('served: an HTML (not a Save-HTML) → 5 chapters, its table, title from the document', jh.status === 200 && jh.title === 'ترخيص مستودع أدوية' && jh.chapters?.length === 5 && jh.tables === 1, JSON.stringify(jh));
  const bad = await fetch(base + '/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x.exe', data: '' }) });
  check('served: import refuses anything but .pdf / .docx / .html', bad.status === 400);
  // the Export & Print centre's one-format export lands in the save folder too: HTML\ (print), "<title>-<date>-AR", -2 on a clash
  const ef = async () => (await fetch(base + '/api/export/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'blank', locale: 'ar', doc: blankAr, format: 'printHtml' }) })).json();
  const e1 = await ef();
  const e2 = await ef();
  const nm = /\d{4}-\d\d-\d\d \d\d-\d\d .* - العربية( \(2\))?\.print\.html$/;
  check('served: print-centre export → the document Exports\\, "<date> <title> - العربية" name, a second export never overwrites', e1.file?.startsWith(ws.dirs.html + path.sep) && nm.test(e1.file) && e2.file !== e1.file && fs.existsSync(e1.file) && fs.existsSync(e2.file) && !!e1.url, JSON.stringify({ e1: e1.file, e2: e2.file, url: e1.url }));
  await ctx.close();
} finally {
  await browser.close();
  if (server) { server.close(); server.closeAllConnections?.(); }
}

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nlibrary: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
