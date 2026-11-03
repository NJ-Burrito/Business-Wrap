// 0.17.0 · owner note N11: the English edition exports and downloads (PDF, DOCX, HTML; alone and with "both") from the Export tab, the print centre,
// the CLI and the server, at the Arabic edition's quality; Arabic stays as it was.
//   1. the server's /api/export/file: AR and EN × PDF, DOCX, print HTML are real, non-empty, in the right script and direction (pdftotext -enc UTF-8)
//   2. the editor in headless Chrome, through the real dispatcher (BW.runAction): the three print-HTML tools, EN alone / both, a single-edition document,
//      the print centre opening on the edition being edited
//   3. project export: the single-edition flag is read from the document as it is now (saved ops applied), a named language always exports
//   4. the CLI: `x.en.edited.json` (the editor's offline file name) is English, not Arabic
// Headless Chrome and the local server are closed at the end.
//
//   node tests/export-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, localeOf } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { wantedEditions } from '../engine/project-export.mjs';
import { exportDoc } from '../engine/cli.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-export0170-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  export-0170: ${name}${detail && !ok ? '  — ' + String(detail).slice(0, 300) : ''}`);
  if (!ok) failed += 1;
};
const ARABIC = /[؀-ۿ]/g;
const LATIN = /[A-Za-z]{3,}/g;
const pdfText = (f) => spawnSync('pdftotext', ['-enc', 'UTF-8', f, '-'], { encoding: 'utf8' }).stdout || '';
/** The text runs of word/document.xml, read from the zip's central directory with node's zlib only. */
function docxText(file) {
  const b = fs.readFileSync(file);
  let p = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  // walk the central directory from its first record
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(eocd + 10);
  p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < n; i++) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    if (name === 'word/document.xml') {
      const lnl = b.readUInt16LE(off + 26), lel = b.readUInt16LE(off + 28);
      const data = b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
      return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
    }
    p += 46 + nl + el + cl;
  }
  return '';
}

const docAr = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.ar.json'), 'utf8'));
const docEn = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.en.json'), 'utf8'));

// a single-edition document (control.editions: ['ar']) as a sample folder for the editor
const flagDir = path.join(tmp, 'flagged');
fs.mkdirSync(flagDir);
for (const [l, d] of [['ar', docAr], ['en', docEn]]) fs.writeFileSync(path.join(flagDir, `document.${l}.json`), JSON.stringify({ ...d, control: { ...d.control, editions: ['ar'] } }, null, 1));
const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out: file, set: 'export-0170', watermarkDir: null });
const fileFlag = path.join(tmp, 'editor-flag.html');
buildEditor({ inputs: [flagDir], out: fileFlag, set: 'export-0170-flag', watermarkDir: null });

// ── 3 · pure: project export + locale ──────────────────────────────────────
{
  const ed = (doc, ops = []) => ({ raw: JSON.stringify(doc), ops });
  const flagOp = { op: 'replace', path: '/control/editions', value: ['ar'] };
  const unflag = { op: 'delete', path: '/control/editions' };
  const both = { editions: { ar: ed(docAr), en: ed(docEn) } };
  check('project: an unflagged pair exports both editions', JSON.stringify(wantedEditions(both, ['ar', 'en'])) === '["ar","en"]');
  const flaggedByOps = { editions: { ar: ed(docAr, [flagOp]), en: ed(docEn, [flagOp]) } };
  check('project: the flag set by saved ops trims "both" to the one edition', JSON.stringify(wantedEditions(flaggedByOps, ['ar', 'en'], 'both')) === '["ar"]');
  check('project: a NAMED language still exports the edition of a flagged document', JSON.stringify(wantedEditions(flaggedByOps, ['en'], 'en')) === '["en"]');
  const flagRaw = (d) => ({ ...d, control: { ...d.control, editions: ['ar'] } });
  const turnedBack = { editions: { ar: ed(flagRaw(docAr), [unflag]), en: ed(flagRaw(docEn), [unflag]) } };
  check('project: "both" turned back on after a flagged base exports the English edition again', JSON.stringify(wantedEditions(turnedBack, ['ar', 'en'], 'both')) === '["ar","en"]');
  check('localeOf: x.en.edited.json is English, x.ar.json Arabic, an explicit locale wins, no name falls back to the title script',
    localeOf('a/blank.en.edited.json', {}) === 'en' && localeOf('x.ar.json', {}) === 'ar' && localeOf('x.json', {}, 'en') === 'en' && localeOf('my-en-route.json', { control: { title: 'خدمة جديدة' } }) === 'ar' && localeOf('d.json', { control: { title: 'Order service' } }) === 'en');
}

// ── 1 · the server ─────────────────────────────────────────────────────────
const server = await serve(file, 0, { out: path.join(tmp, 'exports') });
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (b) => { const r = await fetch(`${base}/api/export/file`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'blank', theme: undefined, ...b }) }); return { s: r.status, j: await r.json() }; };
const browser = await chromium.launch(launchOptions());
try {
  const out = {};
  for (const [loc, doc] of [['ar', docAr], ['en', docEn]]) {
    for (const format of ['pdf', 'docx', 'printHtml']) out[`${loc}.${format}`] = await post({ locale: loc, doc, format });
  }
  const ok = (k) => out[k].s === 200 && fs.existsSync(out[k].j.file) && fs.statSync(out[k].j.file).size > 1000;
  for (const k of Object.keys(out)) check(`server ${k}: written, non-empty, served under /files/`, ok(k) && /^\/files\//.test(out[k].j.url || ''), JSON.stringify(out[k]).slice(0, 200));
  if (ok('en.pdf') && ok('ar.pdf')) {
    const en = pdfText(out['en.pdf'].j.file), ar = pdfText(out['ar.pdf'].j.file);
    check('EN PDF: English text (pdftotext -enc UTF-8), no Arabic letters, the Arabic title absent', /Software Requirements Specification/.test(en) && (en.match(ARABIC) || []).length === 0 && (en.match(LATIN) || []).length > 20, en.slice(0, 120));
    check('AR PDF unchanged in kind: Arabic text, right-to-left title (the English subtitle line is part of the Arabic cover)', (ar.match(ARABIC) || []).length > 100 && /وثيقة متطلبات الخدمة الإلكترونية/.test(ar), ar.slice(0, 120));
  } else check('EN / AR PDF readable', false);
  if (ok('en.docx') && ok('ar.docx')) {
    const en = docxText(out['en.docx'].j.file), ar = docxText(out['ar.docx'].j.file);
    check('EN DOCX: English runs, no Arabic letters', /Software Requirements Specification/.test(en) && (en.match(ARABIC) || []).length === 0, en.slice(0, 120));
    check('AR DOCX unchanged in kind: Arabic runs', (ar.match(ARABIC) || []).length > 100, ar.slice(0, 120));
  } else check('EN / AR DOCX readable', false);
  if (ok('en.printHtml') && ok('ar.printHtml')) {
    const en = fs.readFileSync(out['en.printHtml'].j.file, 'utf8'), ar = fs.readFileSync(out['ar.printHtml'].j.file, 'utf8');
    check('EN print HTML is lang="en" dir="ltr" with the English title; AR is lang="ar" dir="rtl"', /<html lang="en" dir="ltr"/.test(en) && /<html lang="ar" dir="rtl"/.test(ar) && en.includes(docEn.control.title.split(/:\s*/).pop()), en.slice(0, 80));
  } else check('EN / AR print HTML readable', false);
  check('server: the English and Arabic files are different files of the same service', new Set([out['en.pdf'].j.file, out['ar.pdf'].j.file]).size === 2);

  // ── 2 · the editor, through the real dispatcher ─────────────────────────
  for (const [tag, editor, svcFlag] of [['pair', file, false], ['single', fileFlag, true]]) {
    const srv = await serve(editor, 0, { out: path.join(tmp, `exports-${tag}`) });
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    const posted = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) => { if (r.url().endsWith('/api/export/file')) { const b = JSON.parse(r.postData() || '{}'); posted.push(`${b.format}.${b.locale}`); } });
    try {
      await page.goto(url);
      await page.waitForFunction(() => window.BW?.ready);
      const has = await page.evaluate(() => {
        const R = document.getElementById('bw-ui-host').shadowRoot;
        return { en: !!window.BW.M[window.BW.S.svc].en, cmds: ['export.printHtml.ar', 'export.printHtml.en', 'export.printHtml.both'].every((a) => window.BW.hasAction(a)), menu: !!R };
      });
      check(`${tag}: the editor holds the English edition and knows the three print-HTML tools`, has.en && has.cmds, JSON.stringify(has));
      // the English edition is being edited: switch to it, as a person does, then export
      await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-a="ed"][data-ed="en"]')?.click());
      await page.waitForFunction(() => window.BW.S.ed === 'en');
      const dl = async (action, ms = 120000) => {
        const [d] = await Promise.all([page.waitForEvent('download', { timeout: ms }).catch(() => null), page.evaluate((a) => window.BW.runAction(a), action)]);
        if (!d) return null;
        const f = path.join(tmp, `${tag}-${action}-${Date.now()}-${d.suggestedFilename().replace(/[^\w.\-]+/g, '_')}`);
        await d.saveAs(f);
        return { name: d.suggestedFilename(), file: f, bytes: fs.statSync(f).size };
      };
      for (const [action, re] of [['export.pdf.en', /\.pdf$/], ['export.docx.en', /\.docx$/], ['export.printHtml.en', /\.print\.html$/]]) {
        posted.length = 0;
        const d = await dl(action);
        check(`${tag}: ${action} downloads a non-empty ${re.source} of the English edition`, !!d && re.test(d.name) && d.bytes > 1000 && posted.length === 1 && posted[0].endsWith('.en'), JSON.stringify({ d, posted }));
        if (d && /\.pdf$/.test(d.name)) {
          const t = pdfText(d.file);
          check(`${tag}: the downloaded English PDF reads English, left to right`, /Software Requirements Specification/.test(t) && (t.match(ARABIC) || []).length === 0, t.slice(0, 100));
        }
        if (d && /print\.html$/.test(d.name)) check(`${tag}: the downloaded English print HTML is dir="ltr"`, /<html lang="en" dir="ltr"/.test(fs.readFileSync(d.file, 'utf8')));
      }
      // "both": the pair exports two files; a single-edition document exports the one edition it has (no empty second file)
      posted.length = 0;
      await page.evaluate(() => window.BW.runAction('export.printHtml.both'));
      await page.waitForFunction(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.busy,[aria-busy="true"].shell'), null, { timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, 4000));
      check(`${tag}: print HTML "both" posts ${svcFlag ? 'only the Arabic edition (the English one is the empty edition of a single-edition document)' : 'the Arabic and the English edition'}`, svcFlag ? posted.join() === 'printHtml.ar' : posted.join() === 'printHtml.ar,printHtml.en', posted.join());
      // a named English export of a flagged document still works: the person is editing it
      if (svcFlag) {
        posted.length = 0;
        const d = await dl('export.pdf.en');
        check('single: a NAMED English PDF of a document flagged Arabic-only is still produced', !!d && d.bytes > 1000 && posted.join() === 'pdf.en', JSON.stringify({ d, posted }));
      }
      // the print centre opens on the edition being edited
      const ed = await page.evaluate(async () => {
        const B = window.BW; B.S.pp = { printers: [], at: '', printer: '', ed: 'ar', copies: 1, range: '', color: 'color', duplex: 'one', paper: '', orientation: 'auto', error: '' };
        await B.runAction('print'); await new Promise((r) => setTimeout(r, 600));
        const sel = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.pc-dlg select[data-po="ed"]');
        return { state: B.S.pp.ed, shown: sel?.value };
      });
      check(`${tag}: the print centre opens on the English edition when that is the one being edited`, ed.state === 'en' && ed.shown === 'en', JSON.stringify(ed));
      check(`${tag}: no page errors`, errors.length === 0, errors.join(' | '));
    } finally { await ctx.close(); srv.close(); }
  }

  // ── 4 · the CLI ────────────────────────────────────────────────────────
  {
    const dir = path.join(tmp, 'cli');
    fs.mkdirSync(dir);
    const named = path.join(dir, 'blank.en.edited.json');
    fs.writeFileSync(named, JSON.stringify(docEn));
    const r = spawnSync(process.execPath, [path.join(REPO, 'engine', 'export.mjs'), '--doc', named, '--no-docx', '--out', dir], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', BW_TEST_MODE: '1' }, timeout: 120000 });
    const pdf = path.join(dir, 'blank.en.pdf');
    const t = fs.existsSync(pdf) ? pdfText(pdf) : '';
    check('CLI: engine/export.mjs on blank.en.edited.json without --locale writes the English PDF', r.status === 0 && /Software Requirements Specification/.test(t) && (t.match(ARABIC) || []).length === 0, `${r.status} ${r.stderr.slice(0, 200)}`);
    const viaCli = await exportDoc({ document: named, locale: 'en', out: dir, docx: true });
    const dx = viaCli.docx && fs.existsSync(viaCli.docx) ? docxText(viaCli.docx) : '';
    check('CLI/MCP path (exportDoc, locale en): English PDF and DOCX', viaCli.locale === 'en' && fs.existsSync(viaCli.pdf) && /Software Requirements Specification/.test(dx), JSON.stringify(viaCli).slice(0, 200));
  }
} finally {
  await browser.close();
  server.close();
}
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
