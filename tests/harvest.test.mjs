// Harvest check: both paths end in the document JSON the editor opens.
//   A. invented Flowable-style BPMN, a draw.io file (plain and compressed) and a YAML step list
//   B. a local bilingual static site walked end to end, with an OTP pause that resumes by itself
//   plus the editor's New-document wizard and Process panel.
//
//   node tests/harvest.test.mjs
import './_isolate.mjs';
import { act, rbBtn } from './_ribbon.mjs';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { harvestModel, harvestCrawl } from '../engine/harvest/cli.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { buildSite } from './fixtures/harvest/site.mjs';

const OUT = path.join(REPO, 'out', 'harvest-test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(REPO, 'tests', 'fixtures', 'harvest');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const table = (doc, ch) => doc.chapters[ch].sections.flatMap((s) => s.blocks).find((b) => b.kind === 'table');

const browser = await chromium.launch(launchOptions());
async function opens(editor, label) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(pathToFileURL(editor).href);
  await p.waitForFunction(() => window.BW?.ready, null, { timeout: 15000 }).catch(() => {});
  const n = await p.evaluate(() => document.querySelectorAll('main.bw-doc h2').length);
  check(`${label}: the editor opens the harvested document`, n >= 7 && !errs.length, `${n} headings ${errs.join(' | ')}`);
  await ctx.close();
}

try {
  // ── A. BPMN (Flowable dialect) ──
  const bp = await harvestModel(path.join(FIX, 'permit.bpmn20.xml'), { out: OUT });
  const [arB, enB] = bp.documents.map(read);
  check('bpmn: lanes and candidate groups become actors', JSON.stringify(enB.chapters[1].sections[0].blocks[0].rows.map((r) => r[0])) === '["Applicant","Reviewing officer"]', JSON.stringify(enB.chapters[1].sections[0].blocks[0].rows));
  const dg = enB.chapters[2].sections[0].blocks[0];
  const svg = dg.kind === 'diagram' ? dg.model.nodes.map((n) => n.label).join(' | ') : dg.svg;
  check('bpmn: the figure shows people\'s steps only (the service task is left out)', svg.includes('File the request') && svg.includes('Review the request') && !svg.includes('Calculate the fee'));
  const rules = table(enB, 4).rows.map((r) => r[1]).join(' | ');
  check('bpmn: gateway conditions and the boundary timer become rules', /Complete/.test(rules) && /Needs changes/.test(rules) && /P5D/.test(rules), rules.slice(0, 200));
  const stories = enB.chapters[5].sections[0].blocks.find((b) => b.kind === 'stories').items;
  check('bpmn: user tasks become user stories, form properties their data dictionary', stories.length === 3 && stories[0].dictionary.rows.length === 3 && stories[0].dictionary.rows[2][3].includes('Outdoor'), `${stories.length} stories`);
  check('bpmn: end events become the final statuses (subprocess end is not one)', JSON.stringify(table(enB, 6).rows.map((r) => r[0]).sort()) === '["Approved","Escalated to supervisor","Rejected"]', JSON.stringify(table(enB, 6).rows));
  check('bpmn: both editions, labels in each language', arB.chapters[1].title === 'الأطراف والأدوار' && enB.chapters[1].title === 'Actors and roles' && arB.service === enB.service);
  check('bpmn: the process travels with the document (Process panel source)', arB.process?.kind === 'bw-process' && arB.process.steps.length > 5);
  await opens(bp.editor, 'bpmn');

  // ── A. draw.io, plain and compressed ──
  const dr = await harvestModel(path.join(FIX, 'permit.drawio'), { out: OUT, editor: false });
  const enD = read(dr.documents[1]);
  check('drawio: swimlanes → actors, the process-shape system step left out, labels decoded', JSON.stringify(enD.chapters[1].sections[0].blocks[0].rows) === '[["Customer","Choose a date & room"],["Booking desk","Confirm the booking"]]' && !JSON.stringify(enD.chapters[2].sections[0].blocks[0].model).includes('Check availability'), JSON.stringify(enD.chapters[1].sections[0].blocks[0].rows));
  const plain = fs.readFileSync(path.join(FIX, 'permit.drawio'), 'utf8');
  const model = plain.match(/<mxGraphModel>[\s\S]*<\/mxGraphModel>/)[0];
  const packed = zlib.deflateRawSync(Buffer.from(encodeURIComponent(model))).toString('base64');
  const compressedFile = path.join(OUT, 'compressed.drawio');
  fs.writeFileSync(compressedFile, `<mxfile><diagram id="c" name="Venue booking">${packed}</diagram></mxfile>`);
  const dc = await harvestModel(compressedFile, { out: path.join(OUT, 'c'), editor: false });
  check('drawio: a compressed diagram gives the same document', JSON.stringify(read(dc.documents[1]).chapters.slice(1, 7).map((c) => c.sections.map((s) => s.blocks.filter((b) => !['figure', 'diagram'].includes(b.kind))))) === JSON.stringify(enD.chapters.slice(1, 7).map((c) => c.sections.map((s) => s.blocks.filter((b) => !['figure', 'diagram'].includes(b.kind))))));

  // ── A. YAML step list ──
  const ym = await harvestModel(path.join(FIX, 'steps.yaml'), { out: OUT, editor: false });
  const enY = read(ym.documents[1]);
  const yRules = table(enY, 4).rows.map((r) => r[1]).join(' | ');
  check('yaml: a step list with a decision and a timer', /Payment received\?/.test(yRules) && /within 10 days/.test(yRules) && table(enY, 6).rows.length === 2, yRules);

  // ── B. crawl a local bilingual site ──
  const siteDir = path.join(OUT, 'site');
  buildSite(siteDir);
  const srv = http.createServer((q, r) => {
    const f = path.join(siteDir, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(siteDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain' });
    r.end(fs.readFileSync(f));
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${srv.address().port}`;
  process.env.BW_TEST_USER = 'harvest-tester';
  process.env.BW_TEST_PASS = 'pw-never-written-anywhere';
  const logs = [];
  const cfg = {
    name: 'Event permit', headed: false, delayMs: 40,
    languages: [{ code: 'ar', startUrl: `${base}/ar/index.html` }, { code: 'en', startUrl: `${base}/en/index.html` }],
    openForm: '#start',
    login: { when: '#user', steps: [{ fill: '#user', value: '$env:BW_TEST_USER' }, { fill: '#pass', value: '$env:BW_TEST_PASS' }, { press: 'button[type=submit]' }] },
    pause: [{ selector: '#otp', until: 'gone', message: 'Type the one-time code', timeoutMs: 20000 }],
    next: 'button[type=submit]', statusesSelector: 'ul.statuses',
    submit: true, // a local fixture: filing is the point here (field.test.mjs proves the dry-run default)
  };
  try {
    const cr = await harvestCrawl(cfg, { out: OUT, log: (m) => logs.push(m), browser, yesFileRealRequest: true });
    const raw = cr.raw;
    check('crawl: the OTP pause waited for the human and resumed', logs.filter((m) => m.startsWith('PAUSED')).length === 2 && logs.filter((m) => m === 'RESUMED').length === 2, logs.join(' / '));
    for (const l of ['ar', 'en']) {
      const L = raw.languages[l];
      const s1 = L.steps[0].fields;
      check(`crawl ${l}: card facts, two form steps, after-submit statuses`, L.card.facts.length === 2 && L.steps.length === 2 && L.statuses.length === 4, `${L.card.facts.length} facts, ${L.steps.length} steps, ${L.statuses.length} statuses`);
      check(`crawl ${l}: required flags, select and radio options, the conditional field`, s1.find((f) => f.key === 'eventName')?.required && s1.find((f) => f.key === 'venue')?.options.length === 2 && s1.find((f) => f.key === 'org')?.options.length === 2 && /=/.test((s1.find((f) => f.key === 'permitNo')?.shownWhen || [])[0] || ''), JSON.stringify(s1.find((f) => f.key === 'permitNo')));
      check(`crawl ${l}: attachments with their accepted types, validation messages`, L.steps[1].fields.filter((f) => f.type === 'file').map((f) => f.accept).join(',') === '.pdf,image/*' && L.steps[0].validations.length >= 2, L.steps[0].validations.join(' | '));
    }
    check('crawl: Arabic labels from the Arabic UI', raw.languages.ar.steps[0].fields[0].label === 'اسم الفعالية', raw.languages.ar.steps[0].fields[0].label);
    const shots = fs.readdirSync(cr.rawDir).filter((f) => f.endsWith('.png'));
    const dims = shots.map((f) => { const b = fs.readFileSync(path.join(cr.rawDir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; });
    check('crawl: screenshots are viewport-only', shots.length >= 8 && dims.every(([w, h]) => w === 1366 && h === 900), `${shots.length} shots`);
    const rawText = fs.readFileSync(path.join(cr.rawDir, 'harvest.json'), 'utf8');
    check('crawl: credentials never written to the harvest', !rawText.includes('pw-never-written-anywhere') && !rawText.includes('harvest-tester') && !logs.join(' ').includes('pw-never'));
    const [arC, enC] = cr.documents.map(read);
    check('crawl: mapped into the document sections', table(enC, 1).rows.length === 2 && enC.chapters[2].sections.length === 2 && table(enC, 3).rows.length === 2 && table(enC, 6).rows.length === 4 && table(arC, 2).rows[0][0] === 'اسم الفعالية', JSON.stringify(table(enC, 3).rows));
    await opens(cr.editor, 'crawl');
    let refused = '';
    try { await harvestCrawl({ ...cfg, languages: [{ code: 'en', startUrl: `${base}/private/x.html` }] }, { out: path.join(OUT, 'robots'), log: () => {}, browser }); } catch (e) { refused = e.message; }
    check('crawl: robots.txt is respected', /robots\.txt disallows/.test(refused), refused);
  } finally {
    srv.close();
  }

  // ── the editor: New document wizard and the Process panel ──
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(pathToFileURL(bp.editor).href);
  await p.waitForFunction(() => window.BW?.ready);
  const before = await p.evaluate(() => Object.keys(window.BW.M).length);
  await (await rbBtn(p,'newdoc')).click();
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('.drawer [data-k="nd-model"]').click()]);
  await fc.setFiles(path.join(FIX, 'permit.drawio'));
  await p.waitForFunction((n) => Object.keys(window.BW.M).length > n, before, { timeout: 10000 }).catch(() => {});
  const added = await p.evaluate(() => ({ n: Object.keys(window.BW.M).length, svc: window.BW.S.svc, ch: window.BW.M[window.BW.S.svc].ar.doc.chapters.length, opts: document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('select[data-a="svc"] option').length }));
  check('wizard: a model file becomes a new service, both editions, in the selector', added.n === before + 1 && added.ch === 7 && added.opts === added.n, JSON.stringify(added));
  await p.evaluate(() => window.BW.runAction('process')); // folded into the Document section's «More» at this width
  await p.waitForTimeout(300);
  const pg = await p.evaluate(() => [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer details.pgrp')].map((d) => d.open));
  check('F2 11: the Process panel opens with every group collapsed', pg.length >= 2 && pg.every((x) => !x), JSON.stringify(pg));
  await p.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer details.pgrp').forEach((d) => { d.open = true; })); // A7: collapsed groups
  await p.locator('.drawer [data-k="pr-step"]').click();
  const steps0 = await p.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.process.steps.length);
  await p.locator('.drawer [data-k="pr-regen"]').click();
  const regen = await p.evaluate(() => { const d = window.BW.M[window.BW.S.svc]; return ['ar', 'en'].map((ed) => d[ed].doc.chapters[3].sections[0].blocks[0].rows.length); });
  check('process panel: add a step, rebuild the sections in both editions', steps0 >= 7 && regen[0] === regen[1] && regen[0] >= 4, JSON.stringify({ steps0, regen }));
  check('wizard + process panel: no page errors', !errs.length, errs.join(' | '));
  await ctx.close();

  // ── C. user-provided sources (0.13.0 B2): a PDF printed here and an HTML page → steps, no model, no network ──
  {
    const { harvestSources, linesToProcess, htmlLines } = await import('../engine/harvest/sources.mjs');
    const pg = await browser.newPage();
    await pg.setContent('<h1>Fishing permit</h1><p>1. Fill in the permit form</p><p>2. Pay the permit fee</p><p>3. Download the permit</p>');
    const pdf = path.join(OUT, 'src', 'fishing.pdf');
    fs.mkdirSync(path.dirname(pdf), { recursive: true });
    await pg.pdf({ path: pdf });
    await pg.close();
    const r = await harvestSources([pdf], { out: path.join(OUT, 'src-out'), editor: false });
    const en = r.results[0] ? read(r.results[0].documents[1]) : null;
    if (r.skipped[0] && /pdftotext/.test(r.skipped[0].why)) results.push(`SKIP  sources: PDF  — ${r.skipped[0].why}`);
    else check('sources: the numbered lines of a PDF become the steps (poppler text)', !!en && /Pay the permit fee/.test(JSON.stringify(en)) && en.control.title.includes('Fishing permit'), JSON.stringify(r.skipped));
    check('sources: HTML list items are steps, the h1 is the name', JSON.parse(linesToProcess(htmlLines('<title>T</title><h1>Boat hire</h1><ul><li>Pick a boat</li><li>Pay</li></ul>'))).steps.length === 2);
    let e;
    try { linesToProcess(['Just prose with no steps']); } catch (x) { e = x; }
    check('sources: a document with no numbered or bulleted step is refused with the reason', /no numbered or bulleted step/.test(e?.message || ''));
    // review 2 extra 8: several sources under one name never overwrite each other (the first keeps the folder)
    const sd = path.join(OUT, 'src-many');
    fs.mkdirSync(sd, { recursive: true });
    fs.writeFileSync(path.join(sd, 'a.md'), '# Permit\n1. Apply online\n2. Pay the fee\n');
    fs.writeFileSync(path.join(sd, 'b.txt'), 'Permit\n- Upload the licence\n- Wait for approval\n');
    const m1 = await harvestSources([path.join(sd, 'a.md'), path.join(sd, 'b.txt')], { out: path.join(OUT, 'src-many-out'), name: 'One permit', editor: false });
    const dirs = m1.results.map((x) => path.dirname(x.documents[0]));
    const texts = m1.results.map((x) => JSON.stringify(read(x.documents[1])));
    check('sources: two sources under one name land in two folders, the first output kept', m1.results.length === 2 && dirs[0] !== dirs[1] && /Apply online/.test(fs.readFileSync(path.join(dirs[0], 'document.en.json'), 'utf8')) && /Upload the licence/.test(texts[1]), JSON.stringify({ dirs, skipped: m1.skipped }));
  }
} catch (e) {
  check('harvest run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
