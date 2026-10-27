// Field-test gaps (0.8.0): an SPA portal crawled end to end, the crawl + model merge with a conflict,
// a Flowable monitoring-graph JSON, expression assignees mapped to role names, the EN edition's own
// code and header, readable Arabic export names, DOCX fonts embedded, the server started through a
// junction. All fixtures are invented.
//
//   node tests/field.test.mjs
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { harvestCrawl, harvestModel, harvestMerge } from '../engine/harvest/cli.mjs';
import { isLanguageSwitch, wrongLanguage } from '../engine/harvest/crawl.mjs';
import { parseModel } from '../engine/harvest/model.mjs';
import { launchOptions, exportDocx, exportPdf, loadTheme, fontsFor, REPO, fileStem } from '../engine/export.mjs';
import { buildSpa } from './fixtures/harvest/spa.mjs';

const OUT = path.join(REPO, 'out', 'field-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(REPO, 'tests', 'fixtures', 'harvest');
const lines = [];
let failed = 0;
const check = (name, ok, detail = '') => { lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const tableIn = (doc, title) => doc.chapters.find((c) => c.title === title)?.sections.flatMap((s) => s.blocks).find((b) => b.kind === 'table');

const browser = await chromium.launch(launchOptions());
try {
  // ── 1. an SPA portal: async render, terms gate, PrimeNG-style controls, no ids or names ──
  const site = buildSpa(path.join(OUT, 'spa'));
  let filed = 0; // requests the fixture received: a dry run must file none
  const srv = http.createServer((q, r) => {
    if (q.method === 'POST' && q.url.startsWith('/api/submit')) { filed += 1; r.writeHead(200); r.end('ok'); return; }
    const f = path.join(site, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
    r.end(fs.readFileSync(f));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const cfg = {
    name: 'venue-hire', headed: false, delayMs: 40, idleMs: 1500,
    languages: [{ code: 'ar', startUrl: `${base}/ar/index.html` }, { code: 'en', startUrl: `${base}/en/index.html` }],
    waitFor: { card: 'h1', form: 'form, ul.statuses' }, waitForMs: 8000,
    openForm: '#start',
    preForm: [{ check: '.p-checkbox-box' }, { press: 'button.go' }],
    next: 'button[type=submit]', statusesSelector: 'ul.statuses',
    statuses: { ar: ['مقدم', 'قيد المراجعة', 'مقبول', 'مرفوض'], en: ['Submitted', 'Under review', 'Approved', 'Rejected'] },
  };
  let cr;
  const logs = [];
  let filedWithFlag = -1, filedNoFlag = -1, flagged;
  try {
    cr = await harvestCrawl(cfg, { out: path.join(OUT, 'crawl'), browser, log: (m) => logs.push(m) });
    const dry = filed;
    // submit: true alone is still a dry run (no go-ahead); with the flag, exactly one request is filed
    await harvestCrawl({ ...cfg, submit: true, languages: [cfg.languages[1]] }, { out: path.join(OUT, 'crawl-noflag'), browser, log: () => {}, ask: async () => false });
    filedNoFlag = filed - dry;
    flagged = await harvestCrawl({ ...cfg, submit: true, languages: [cfg.languages[1]] }, { out: path.join(OUT, 'crawl-filed'), browser, log: () => {}, yesFileRealRequest: true });
    filedWithFlag = filed - dry - filedNoFlag;
    check('SAFETY: the default crawl files no request and says it stopped before submit', dry === 0 && logs.filter((m) => m.startsWith('stopped before submit')).length === 2 && cr.raw.languages.en.stoppedBeforeSubmit, `${dry} filed; ${logs.filter((m) => m.startsWith('stopped')).join(' / ')}`);
    check('SAFETY: submit: true without the go-ahead files nothing; with --yes-file-real-request exactly one', filedNoFlag === 0 && filedWithFlag === 1 && flagged.raw.languages.en.statuses.length === 4 && !flagged.raw.languages.en.stoppedBeforeSubmit, `${filedNoFlag} / ${filedWithFlag}`);
  } finally { srv.close(); }
  for (const l of ['ar', 'en']) {
    const L = cr.raw.languages[l];
    const f = L.steps[0]?.fields || [];
    const by = (k) => f.find((x) => x.key === k);
    check(`spa ${l}: waited for the async card and form, passed the terms gate, read one form step and the statuses`, L.card.title && L.card.facts.length >= 2 && L.steps.length === 1 && L.statuses.length === 4, `${L.card.facts.length} facts, ${L.steps.length} steps, ${L.statuses.length} statuses`);
    check(`spa ${l}: labels from the sibling label, never the section title`, f.length >= 7 && f.every((x) => x.label && x.label !== (l === 'ar' ? 'الطلب' : 'Request')) && by('organiser')?.label === (l === 'ar' ? 'اسم المنظم' : 'Organiser name'), f.map((x) => x.label).join(' | '));
    check(`spa ${l}: required from the asterisk / ng-invalid`, by('organiser')?.required && by('purpose')?.required && by('eventDate')?.required && by('kind')?.required && !by('notes')?.required && !by('guests')?.required, JSON.stringify(f.map((x) => [x.key, x.required])));
    check(`spa ${l}: dropdown, multiselect, calendar and radio options`, by('purpose')?.options?.length === 3 && by('guests')?.options?.length === 2 && by('eventDate')?.type === 'date' && by('kind')?.options?.length === 2, JSON.stringify([by('purpose')?.options, by('guests')?.options, by('kind')?.options]));
    check(`spa ${l}: conditional field, attachment, validation messages`, /=/.test((by('weeks')?.shownWhen || [])[0] || '') && by('plan')?.accept === '.pdf,image/*' && L.steps[0].validations.length >= 1, JSON.stringify([by('weeks')?.shownWhen, L.steps[0].validations]));
  }
  // 0.8.1 (the live re-crawl): the header language switcher, the card, required from CSS and from the site's own message,
  // the attachment label inside a captioned panel, the captcha field
  for (const l of ['ar', 'en']) {
    const L = cr.raw.languages[l];
    const f = L.steps[0]?.fields || [];
    const by = (k) => f.find((x) => x.key === k);
    check(`spa ${l}: the header language switcher is not a field, the run stayed in its language`, !f.some((x) => isLanguageSwitch(x.options)) && !wrongLanguage(l, L) && L.steps[0].title && by('organiser')?.label === (l === 'ar' ? 'اسم المنظم' : 'Organiser name'), f.map((x) => x.key).join(','));
    check(`spa ${l}: a card made of divs, a panel and tabs`, L.card.facts.length >= 2 && L.card.description.some((d) => d === (l === 'ar' ? 'احجز قاعة مجتمعية لفعالية.' : 'Book a community venue for an event.')) && L.card.lists?.some((x) => x.items.length === 3), JSON.stringify(L.card).slice(0, 200));
    check(`spa ${l}: required from a CSS ::after asterisk and from the site's validation message`, by('eventDate')?.required && by('ref')?.required && !by('notes')?.required, JSON.stringify([by('eventDate')?.required, by('ref')?.required]));
    check(`spa ${l}: the attachment label from its own box, not the panel caption; no captcha field`, by('plan')?.label === (l === 'ar' ? 'مخطط القاعة' : 'Floor plan') && !f.some((x) => /captcha/i.test(x.key)), `${by('plan')?.label} / ${f.map((x) => x.key).join(',')}`);
  }
  const swapped = { card: { title: 'Venue hire request' }, steps: [{ title: 'Applicant', validations: ['This field is required'], fields: [{ label: 'Organiser name', options: [] }, { label: 'Purpose', options: ['Meeting', 'Workshop'] }] }] };
  check('a run captured in the other language fails loudly (script check)', !!wrongLanguage('ar', swapped) && !wrongLanguage('en', swapped) && isLanguageSwitch(['English', 'العربية']) && !isLanguageSwitch(['Meeting', 'Workshop']), wrongLanguage('ar', swapped));
  for (const l of ['ar', 'en']) {
    const L = cr.raw.languages[l];
    const f = L.steps[0]?.fields || [];
    const facts = Object.fromEntries(L.card.facts);
    const T = l === 'ar' ? { fees: 'الرسوم المالية', rec: 'متلقو الخدمة', ch: 'قنوات تقديم الخدمة' } : { fees: 'Fees', rec: 'Service recipients', ch: 'Channels' };
    check(`spa ${l}: one form step (no duplicate), the attachment kept beside the form, the statuses from the config`, L.steps.length === 1 && f.some((x) => x.type === 'file' && x.label === (l === 'ar' ? 'مخطط القاعة' : 'Floor plan')) && L.statuses.length === 4, `${L.steps.length} steps, ${f.filter((x) => x.type === 'file').map((x) => x.label)}`);
    check(`spa ${l}: card fees, recipients and channels`, !!facts[T.fees] && (facts[T.rec] || '').includes('،') && !!facts[T.ch], JSON.stringify(L.card.facts));
    check(`spa ${l}: every starred field is required; the message only adds`, ['organiser', 'purpose', 'eventDate', 'kind', 'plan', 'ref'].every((k) => f.find((x) => x.key === k)?.required) && !f.find((x) => x.key === 'notes')?.required, JSON.stringify(f.map((x) => [x.key, x.required])));
  }
  // 0.8.3: the card's lists reach the document (and the PDF), one attachment row per file + its name select,
  // inline messages read by blurring the fields (the dry run never presses Send)
  const [arD, enD] = cr.documents.map(read);
  for (const [l, d] of [['ar', arD], ['en', enD]]) {
    const T = l === 'ar' ? { card: 'بطاقة الخدمة', att: 'المرفقات', val: 'رسائل التحقق', ch: 'قنوات تقديم الخدمة', via: 'مركز الخدمة', docs: 'المستندات المطلوبة', name: 'مخطط القاعة (المرفق غير إجباري)', no: 'لا', where: 'اسم المنظم' } : { card: 'Service card', att: 'Attachments', val: 'Validation messages', ch: 'Channels', via: 'Service centre', docs: 'Required documents', name: 'Floor plan (optional attachment)', no: 'No', where: 'Organiser name' };
    const card = tableIn(d, T.card)?.rows || [];
    check(`spa ${l}: card lists (channels, documents) are rows of the service card`, card.some(([k, v]) => k === T.ch && v.includes(T.via)) && card.some(([k]) => k === T.docs), JSON.stringify(card).slice(0, 220));
    const att = tableIn(d, T.att)?.rows || [];
    check(`spa ${l}: one attachment row: the name select + the file, accepted types, required from the card`, att.length === 1 && att[0][0] === T.name && att[0][1] === T.no && att[0][2] === '.pdf,image/*' && !JSON.stringify(tableIn(d, l === 'ar' ? 'المدخلات' : 'Inputs')?.rows || []).includes(T.name) && d.openQuestions.some((q) => q.blocks === '4'), JSON.stringify([att, d.openQuestions.map((q) => q.question)]));
    const val = tableIn(d, T.val)?.rows || [];
    check(`spa ${l}: inline messages from blurring the fields, with the field they belong to`, val.some(([, w]) => w === T.where), JSON.stringify(val).slice(0, 200));
  }
  {
    const pdf = path.join(OUT, 'card.en.pdf');
    await exportPdf(enD, { locale: 'en', theme: loadTheme(), pdfPath: pdf, browser });
    const txt = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    check('PDF: the card channels are printed', txt.includes('Channels') && txt.includes('Service centre'), '');
  }
  check('spa: harvest.json is written as the crawl goes (kept on a crash)', fs.existsSync(path.join(cr.rawDir, 'harvest.json')) && read(path.join(cr.rawDir, 'harvest.json')).languages.en.steps.length === 1);

  // ── 3. the model side: a monitoring-graph JSON, expression assignees, unnamed gateways ──
  const graphFile = path.join(FIX, 'monitoring-graph.json');
  const roles = path.join(FIX, 'roles.json');
  const irG = await parseModel(fs.readFileSync(graphFile, 'utf8'), { name: 'Venue hire', roles: read(roles) });
  const names = irG.actors.map((a) => a.name);
  check('monitoring graph JSON → the process IR (tasks, decisions, ends, timer)', irG.source === 'graph' && irG.steps.filter((s) => s.type === 'task').length === 3 && irG.steps.some((s) => s.type === 'timer') && irG.steps.filter((s) => s.type === 'end').length === 2, irG.steps.map((s) => s.type).join(','));
  check('expression assignees resolve to role names (mapping file), never "User"', names.includes('Booking desk') && names.includes('Venue manager') && !names.includes('User') && !names.some((n) => n.includes('${')), names.join(' | '));
  const irU = await parseModel(fs.readFileSync(graphFile, 'utf8'), {});
  const un = irU.actors.find((a) => a.unresolved);
  check('an unmapped expression gets a readable fallback and is flagged for the editor', !!un && !un.name.includes('${') && !irU.actors.some((a) => a.name === 'User'), JSON.stringify(irU.actors));
  const gm = await harvestModel(graphFile, { out: path.join(OUT, 'model'), name: 'Venue hire', roles, editor: false });
  const [arM, enM] = gm.documents.map(read);
  const enText = JSON.stringify(enM);
  check('a gateway named after its variable ("action") is numbered like an unnamed one', !JSON.stringify(enM.chapters).includes('>action<') && !tableIn(enM, 'Steps')?.rows.some((r) => r[0] === 'action'), tableIn(enM, 'Steps')?.rows.map((r) => r[0]).join(' | '));
  check('unnamed gateways get readable names, no raw sid- ids printed', !/sid-[0-9A-F]{4}/.test(enText.replace(/"process":\{.*$/s, '')) && /Decision 1/.test(enText) && /قرار ١/.test(JSON.stringify(arM)), (enText.match(/sid-[0-9A-F-]{8}/) || [''])[0]);
  check('--name is honoured for a model', enM.control.title.endsWith('Venue hire') && enM.service === 'venue-hire', enM.control.title);
  const bp = await harvestModel(path.join(FIX, 'permit.bpmn20.xml'), { out: path.join(OUT, 'bpmn'), name: 'Night market permit', editor: false });
  check('--name is honoured for BPMN', read(bp.documents[1]).control.title.endsWith('Night market permit'));

  // ── 2. merge: union with provenance, a conflict shown, a second harvest merges ──
  const merged = await harvestMerge(path.join(cr.rawDir, 'harvest.json'), path.join(gm.dir, 'process.json'), { out: path.join(OUT, 'merged'), editor: true });
  const [arX, enX] = merged.documents.map(read);
  const titles = enX.chapters.map((c) => c.title);
  check('merge: the union of both harvests (card, inputs, attachments, validations + actors, workflow, rules, stories, statuses)', ['Service card', 'Inputs', 'Attachments', 'Validation messages', 'Actors and roles', 'Workflow diagram', 'Business rules', 'User stories', 'Request statuses'].every((t) => titles.includes(t)) && titles.length === new Set(titles).size, titles.join(' | '));
  const st = tableIn(enX, 'Request statuses');
  check('merge: statuses are a union with the source of each row', st && st.columns.length === 2 && st.rows.some((r) => /crawl/i.test(r[1])) && st.rows.some((r) => /model|both/i.test(r[1])), JSON.stringify(st?.rows));
  check('merge: provenance per section and row', Object.values(enX.provenance || {}).includes('crawl') && Object.values(enX.provenance || {}).includes('model'), Object.keys(enX.provenance || {}).length + ' entries');
  check('merge: a disagreement is a conflict, shown, not a silent pick', (enX.harvestConflicts || []).some((c) => c.path === '/control/title'), JSON.stringify(enX.harvestConflicts));
  check('merge: both editions', arX.chapters.length === enX.chapters.length && arX.chapters.some((c) => c.title === 'بطاقة الخدمة'));
  // a second crawl into the merged folder merges with what is there instead of overwriting it
  // (offline: the saved harvest.json mapped again, as the field re-run does)
  const again = await harvestCrawl(cfg, { into: merged.dir, raw: path.join(cr.rawDir, 'harvest.json'), editor: false }).catch((e) => ({ error: e.message }));
  const after = again.documents ? read(again.documents[1]) : {};
  check('a second harvest into the same document merges (the model chapters stay)', !!after.chapters && after.chapters.some((c) => c.title === 'Workflow diagram') && after.chapters.some((c) => c.title === 'Service card'), again.error || after.chapters?.map((c) => c.title).join(' | '));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const pg = await ctx.newPage();
  await pg.goto(new URL(`file:///${merged.editor.replace(/\\/g, '/')}`).href);
  await pg.waitForFunction(() => window.BW?.ready);
  check('merge: the editor opens the merged document with its conflict listed', await pg.evaluate(() => window.BW.S.conflicts.length >= 1));
  await ctx.close();

  // ── 4. the EN edition has its own code, header and spine ──
  check('EN edition: a Latin document code, no Arabic in the code', /^BW-SRS-[A-Z0-9-]+$/.test(enM.control.documentId) && /^BW-SRS-[A-Z0-9-]+$/.test(arM.control.documentId), `${enM.control.documentId} / ${arM.control.documentId}`);
  const arOnly = await harvestModel(path.join(FIX, 'steps-ar.yaml'), { out: path.join(OUT, 'ar-only'), editor: false });
  const enA = read(arOnly.documents[1]);
  check('EN edition of an Arabic-named service: code transliterated, never Arabic', /^BW-SRS-[A-Z0-9-]+$/.test(enA.control.documentId) && !/[\u0600-\u06FF]/.test(enA.control.documentId), enA.control.documentId);

  // ── 5. export names: the Arabic slug stays readable ──
  check('export file names keep Arabic readable', fileStem('طلب حجز قاعة') === 'طلب-حجز-قاعة' && !/^-+$/.test(fileStem('طلب حجز قاعة')) && fileStem('a/b\\c:d') === 'a-b-c-d', fileStem('طلب حجز قاعة'));

  // ── 6. DOCX: fonts embedded (word/fonts parts), default on, off when asked ──
  const { used } = fontsFor(loadTheme());
  if (used.some((c) => c.format === 'truetype')) {
    const docx = exportDocx(enM, { locale: 'en', theme: loadTheme(), docxPath: path.join(OUT, 'embed.en.docx') }).docx;
    const parts = spawnSync('python', ['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print("\\n".join(z.namelist()));print(z.read("word/fontTable.xml").decode("utf-8").count("w:embedRegular"))', docx], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/);
    check('DOCX: fonts embedded as word/fonts/*.odttf, linked from the font table', parts.filter((p) => /^word\/fonts\/.+\.odttf$/.test(p)).length >= 2 && +parts.at(-1) >= 2, parts.filter((p) => p.startsWith('word/fonts')).join(','));
    const plain = exportDocx(enM, { locale: 'en', theme: loadTheme(), docxPath: path.join(OUT, 'plain.en.docx'), embedFonts: false }).docx;
    const n = spawnSync('python', ['-c', 'import zipfile,sys;print(sum(1 for n in zipfile.ZipFile(sys.argv[1]).namelist() if n.startswith("word/fonts/")))', plain], { encoding: 'utf8' }).stdout.trim();
    check('DOCX: the toggle turns embedding off', n === '0', n);
  } else lines.push('SKIP  DOCX font embedding (no TrueType Thmanyah cuts on this machine)');
  // the embedding itself, on any TrueType font: the obfuscated part round-trips to the font bytes
  const probe = spawnSync('python', [path.join(REPO, 'engine', 'docx', 'embed_fonts.py'), '--selftest'], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  check('DOCX embedding: ODTTF obfuscation round-trips (selftest)', probe.status === 0 && /PASS/.test(probe.stdout), (probe.stdout + probe.stderr).trim().slice(-200));

  // ── 7. the server starts through a junction / symlink and fails loudly ──
  const link = path.join(os.tmpdir(), `bw-link-${process.pid}`);
  // a link is removed as a link (unlink), never recursively: that would delete the repo it points at
  const unlinkLink = () => { try { fs.unlinkSync(link); } catch { /* not there */ } };
  unlinkLink();
  fs.symlinkSync(REPO, link, process.platform === 'win32' ? 'junction' : 'dir');
  const editorFile = merged.editor;
  const sv = spawn(process.execPath, [path.join(link, 'engine', 'serve.mjs'), editorFile, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const said = await new Promise((ok) => { let s = ''; const done = () => ok(s); sv.stdout.on('data', (d) => { s += d; if (/http:\/\/127\.0\.0\.1:\d+/.test(s)) done(); }); sv.on('exit', done); setTimeout(done, 15000); });
  sv.kill();
  check('serve.mjs runs when launched through a junction', /http:\/\/127\.0\.0\.1:\d+/.test(said), said.trim().slice(0, 120));
  const bad = spawnSync(process.execPath, [path.join(link, 'engine', 'serve.mjs'), path.join(OUT, 'missing.html')], { encoding: 'utf8' });
  check('serve.mjs prints an error and exits non-zero on a bad editor path', bad.status !== 0 && /usage|not found|no such/i.test(bad.stderr), `${bad.status} ${bad.stderr.trim().slice(0, 80)}`);
  unlinkLink();
} finally {
  await browser.close();
}
console.log(lines.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `ALL PASS: ${lines.filter((l) => l.startsWith('PASS')).length}/${lines.filter((l) => !l.startsWith('SKIP')).length}`);
process.exit(failed ? 1 : 0);
