// 0.19.0 · lane R2: the report, form and sheet page-1 families (work/sdlc/design/0190-types.md §1, §2 C4 C5 C6 C8 C9 C10 C13, §6 S1-S9).
//   1. every family type x ar/en, as composed (before or after the content lanes write `cover`): its family, its head on page 1 (form: band, ID box or
//      badge, chapter 1 on page 1, no contents; sheet: landscape, band; report: a title page with the band C1 and the control block C3), the
//      control and revisions after the last chapter (C10)
//   2. the same types with the spec §4 `cover` keys (tests/fixtures/families-0190/cover-keys.json): form header with its ID box (the id:true field),
//      badge (release notes), statement with choices and the seal box (UAT); sheet fields in one row of 6 and the summary strip (C4); report tiles
//      and decision box (C5) with its choices; every printed value carries its /cover pointer
//   3. tables: style sheet (washed header, zebra) and signoff (14 mm rows, empty cells kept), numCols / nowrapCols / accentCol (C13), the C9 words
//      filled only in a status column; a sheet's summary strip counted from its `style: sheet` table when it has no figures
//   4. the validator: the family keys, S2 errors, the coverDesign warning (S1), the S8 layer contract an error for redrawn art only (killed mutants)
//   5. PDF and DOCX of minutes, test-cases and business-case (ar, en, with the keys): sheet landscape, the decision box and the ID on page 1, no curve
//      or image on page 1; in Word the same structure in section 1 and the table keys as table properties
//   node tests/run.mjs families-0190
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { exportPdf, exportDocx, loadTheme, launchOptions, i18n } from '../engine/export.mjs';
import * as R from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';
import { validateType, coverErrors, familyWarnings, layerContract } from '../tools/doctypes/check.mjs';
import { py } from '../engine/py.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'families-0190', 'cover-keys.json'), 'utf8'));
const theme = loadTheme();
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  families-0190: ${name}${detail && !ok ? '  | ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).replace(/\s+/g, ' ').slice(0, 400) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};
const htmlOf = (doc, ed) => R.renderDocument(doc, { locale: ed, labels: i18n().doc[ed], theme, fontCss: '', logos: theme.logos });
const coverPart = (h) => h.slice(h.indexOf('data-part="cover"'), h.indexOf('<div class="wrap">'));
const keyed = (id, ed) => ({ ...DT.compose(id, ed), cover: KEYS[id][ed] });
const count = (h, s) => h.split(s).length - 1;
const FAMILY = { form: ['defect-report', 'change-request', 'minutes', 'uat-signoff', 'release-notes'], sheet: ['rtm', 'test-cases'], report: ['business-case'] };

function unzip(file) {
  const b = fs.readFileSync(file);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  const parts = {};
  for (let i = 0; i < n; i += 1) {
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.toString('utf8', p + 46, p + 46 + nl);
    const lnl = b.readUInt16LE(off + 26), lel = b.readUInt16LE(off + 28);
    const data = b.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
    parts[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 46 + nl + el + cl;
  }
  return parts;
}
const wText = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-families-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
let browser;
try {
  // ── 1. composed, before the content lanes: each family's sound page 1 ──
  check('DT.TYPE_FAMILY names the 8 non-pilot family types of spec §1, and familyOf lets type.json name a family', Object.keys(DT.TYPE_FAMILY).length === 8 && Object.entries(FAMILY).every(([f, ids]) => ids.every((id) => DT.TYPE_FAMILY[id] === f)) && DT.familyOf({ id: 'srs', coverDesign: 'form' }) === 'form' && DT.familyOf({ id: 'minutes', coverDesign: 'compact' }) === 'form' && DT.familyOf({ id: 'srs', coverDesign: 'spine' }) === 'spine');
  const bad1 = [];
  for (const [fam, ids] of Object.entries(FAMILY)) {
    for (const id of ids) {
      for (const ed of DT.EDITIONS) {
        const doc = DT.compose(id, ed);
        const h = htmlOf(doc, ed);
        const cov = coverPart(h);
        const why = [];
        if (doc.coverDesign !== fam || R.coverOf(doc)?.family !== fam) why.push(`family ${doc.coverDesign}`);
        if (!cov.includes(`data-family="${fam}"`) || /<svg|<img|cover-motif|data-motif/.test(cov)) why.push('cover');
        if (fam === 'report' && !(cov.includes('data-cover="spine"') && cov.includes('class="rp-band"') && count(cov, '<div class="fg"') >= 6 && R.REPORT_CONTROL.every((k) => cov.includes(`data-p="/control/${k}"`)))) why.push('report head');
        if (fam !== 'report' && !(cov.includes('data-cover="compact"') && cov.includes('class="tb-band"') && cov.includes(`data-p="/control/documentId"`))) why.push('head');
        if (fam === 'form' && !/class="bw-(idbox|badge)"/.test(cov)) why.push('ID box');
        if (fam === 'sheet' && R.pageSpec(doc.layout?.page).orientation !== 'landscape') why.push('not landscape');
        if (fam !== 'report' && /data-part="toc"/.test(h)) why.push('contents list');
        const hide = new Set(doc.layout?.hide || []);
        const backWanted = fam !== 'report' && ['control', 'revisions'].some((k) => !hide.has(k));
        if (backWanted !== /data-part="back"/.test(h)) why.push('back matter');
        if (backWanted && h.indexOf('data-part="back"') < h.lastIndexOf('<section class="chapter"')) why.push('back before a chapter');
        if (why.length) bad1.push(`${id}.${ed}: ${why.join(', ')}`);
      }
    }
  }
  check('8 family types x ar/en, composed: family, its head on page 1 (report: band + 6 control fields; form: band + ID box; sheet: landscape + band), no art, no contents list in a form or sheet, control and revisions after the last chapter', !bad1.length, bad1);

  // ── 2. with the spec §4 keys ──
  const bad2 = [];
  for (const ed of DT.EDITIONS) {
    const k = (id) => KEYS[id][ed];
    const mn = coverPart(htmlOf(keyed('minutes', ed), ed));
    if (!(mn.includes('class="bw-idbox"') && mn.includes('data-p="/cover/fields/0/value">MOM-001</bdi>') && mn.includes('class="bw-fields fg-type" style="--fg-cols:3"') && !mn.includes('data-p="/cover/fields/0/label"></span>') && count(mn, '<div class="fg"') === 5)) bad2.push(`minutes.${ed}: ID box / grid`);
    const ua = coverPart(htmlOf(keyed('uat-signoff', ed), ed));
    if (!(ua.includes('class="bw-stmt"') && ua.includes('data-p="/cover/statement/text"') && count(ua, 'class="st-box"') === 3 && ua.includes('class="st-seal"') && k('uat-signoff').statement.choices.every((c, i) => ua.includes(`data-p="/cover/statement/choices/${i}">${c}</span>`)))) bad2.push(`uat-signoff.${ed}: statement / choices / seal`);
    const rn = coverPart(htmlOf(keyed('release-notes', ed), ed));
    if (!(rn.includes('class="bw-badge"') && rn.includes('data-p="/cover/badge/value">1.0.0</bdi>') && !rn.includes('class="bw-idbox"') && count(rn, 'data-p="/cover/statement/items/') === 3 && !rn.includes('class="st-seal"'))) bad2.push(`release-notes.${ed}: badge / items`);
    const df = coverPart(htmlOf(keyed('defect-report', ed), ed));
    if (!(df.includes('data-p="/cover/fields/0/value">DEF-001</bdi>') && df.includes('style="--fg-cols:4"') && /class="fg-chip st-warn" data-p="\/cover\/fields\/1\/value"/.test(df) && /class="fg-chip st-idle" data-p="\/cover\/fields\/3\/value"/.test(df))) bad2.push(`defect-report.${ed}: ID / 4 cols / C9 chips (High warn, Open idle)`);
    const tc = coverPart(htmlOf(keyed('test-cases', ed), ed));
    if (!(tc.includes('style="--fg-cols:6"') && tc.includes('class="bw-tiles" style="--tl-n:6"') && count(tc, 'class="tl ') + count(tc, 'class="tl"') === 6 && ['ok', 'bad', 'warn', 'idle'].every((x) => tc.includes(`class="tl tl-${x}"`)) && tc.includes('data-p="/cover/figures/5/value"') && tc.indexOf('bw-tiles') > tc.indexOf('fg-type'))) bad2.push(`test-cases.${ed}: fields row / summary strip`);
    const bc = coverPart(htmlOf(keyed('business-case', ed), ed));
    if (!(bc.includes('class="bw-tiles" style="--tl-n:4"') && bc.includes('class="bw-stmt"') && count(bc, 'class="st-box"') === 3 && !bc.includes('st-seal') && bc.indexOf('bw-tiles') < bc.indexOf('bw-stmt') && bc.indexOf('bw-stmt') < bc.indexOf('fg-control') && bc.includes('data-p="/cover/fields/0/value"'))) bad2.push(`business-case.${ed}: tiles / decision box / control block`);
  }
  check('with the spec keys (ar, en): form ID box and grid (minutes), statement with 3 choice boxes and the seal (UAT), badge and items (release notes), C9 chips (defect), sheet fields row of 6 and a 6-tile summary strip (test cases), report tiles, decision box and control block in order (business case)', !bad2.length, bad2);
  const css = R.documentCss(theme, {}, keyed('business-case', 'en'));
  check('the families draw page 1 with square corners and straight rules only (no border-radius, no round marker in the page-1 CSS)', !/border-radius|list-style:disc|list-style-type:disc/.test(css.slice(css.indexOf('/* 0.19.0 page 1'), css.indexOf('/* 0.18.0 polish'))) && /\.st-items\{list-style:none/.test(css));

  // ── 3. tables (C8, C9, C10, C13) ──
  const tdoc = (ed) => {
    const d = DT.compose('test-cases', ed);
    if (d.cover) delete d.cover.figures; // the strip is counted from the sheet table when the content gives no figures
    const s0 = d.chapters[0].sections[0];
    const t = s0.blocks.find((b) => b.kind === 'table');
    t.columns = [ed === 'ar' ? 'المعرف' : 'ID', ed === 'ar' ? 'الحالة' : 'Status', ed === 'ar' ? 'المبلغ' : 'Amount', ed === 'ar' ? 'ملاحظة' : 'Note'];
    t.rows = [['TC-001', ed === 'ar' ? 'معتمد' : 'Approved', '1,200', ed === 'ar' ? 'معتمد' : 'Approved'], ['TC-002', ed === 'ar' ? 'مفتوح' : 'Open', '30', ''], ['TC-003', ed === 'ar' ? 'ناجح' : 'Passed', '5', 'x']];
    Object.assign(t, { style: 'sheet', numCols: [2], nowrapCols: [0], accentCol: 3 });
    d.chapters.at(-1).sections[0].blocks.push({ kind: 'table', style: 'signoff', columns: ['Role', 'Name', 'Signature', 'Date'], rows: [['Tester', '', '', ''], ['Test lead', '', '', '']] });
    return d;
  };
  for (const ed of DT.EDITIONS) {
    const h = htmlOf(tdoc(ed), ed);
    const sh = h.slice(h.indexOf('<table class="bw-t-sheet"'), h.indexOf('</table>', h.indexOf('<table class="bw-t-sheet"')));
    const so = h.slice(h.indexOf('<table class="bw-t-signoff"'), h.indexOf('</table>', h.indexOf('<table class="bw-t-signoff"')));
    const okSheet = sh.length > 100 && /<tr class="alt"/.test(sh) && /<th class="nw"/.test(sh) && /<th class="num"/.test(sh) && /<th class="acc"/.test(sh) && /<td class="nw"[^>]*>(<bdi dir="ltr">)?TC-001/.test(sh) && /class="num"[^>]*>(<bdi dir="ltr">)?1,200/.test(sh);
    const ap = ed === 'ar' ? 'معتمد' : 'Approved';
    const c9 = new RegExp(`class="st-ok"[^>]*data-c="1">${ap}<`).test(sh) && new RegExp(`class="st-idle"[^>]*data-c="1">${ed === 'ar' ? 'مفتوح' : 'Open'}<`).test(sh) && !new RegExp(`class="st-ok[^"]*"[^>]*data-c="3">${ap}<`).test(sh) && /class="acc"[^>]*data-c="3">/.test(sh);
    const okSign = so.length > 50 && count(so, 'style="height:14mm"') === 2 && !/لا يوجد|>None</.test(so) && count(so, '<td') === 8;
    check(`${ed}: C8 sheet table (zebra rows, washed header CSS), C13 number / no-wrap / accent columns, C9 «${ap}» filled only in the Status column; signoff rows 14 mm with empty cells kept`, okSheet && c9 && okSign && R.tableKeysCss(tdoc(ed)).includes('table.bw-t-sheet th{background:var(--primary-100)'), [okSheet, c9, okSign]);
    const strip = coverPart(h);
    check(`${ed}: a sheet with no cover.figures counts its summary strip from its style:sheet table (total 3, then ok 2, idle 1)`, /data-derived="1"/.test(strip) && /class="tl"><span class="tl-l"><span data-p="\/labels\/total">[^<]+<\/span><\/span><span class="tl-v">(<bdi dir="ltr">)?3</.test(strip) && /class="tl tl-ok"><span class="tl-l">[^<]+<\/span><span class="tl-v">(<bdi dir="ltr">)?2</.test(strip) && /class="tl tl-idle"><span class="tl-l">[^<]+<\/span><span class="tl-v">(<bdi dir="ltr">)?1</.test(strip), strip.slice(strip.indexOf('bw-tiles'), strip.indexOf('bw-tiles') + 400));
  }
  check('no table key, no table-key CSS (an old document prints as before)', R.tableKeysCss(DT.compose('srs', 'en')) === '' && R.tableKeysCss({ chapters: [] }) === '');
  check('C9 head words: «Test result», «نتيجة الاختبار», "Priority (MoSCoW)" are status columns; "Meaning", «المعنى» are not', R.isStatusHead('Test result') && R.isStatusHead('نتيجة الاختبار') && R.isStatusHead('Priority (MoSCoW)') && !R.isStatusHead('Meaning') && !R.isStatusHead('المعنى') && R.statusKind('Approved') === '' && R.statusKind('Approved', true) === 'ok' && R.statusKind('Passed') === 'ok');
  const sp = { ...DT.compose('srs', 'en'), layout: { tocDepth: 1, back: ['control', 'revisions'] } };
  const hs = htmlOf(sp, 'en');
  check('C10 on a spine document: layout.back moves control and revisions after the last chapter under «Document control»; the front keeps the contents', hs.indexOf('data-part="back"') > hs.lastIndexOf('<section class="chapter" data-ch=') && hs.includes('<h2><span data-p="/labels/backMatter">Document control</span></h2>') && count(hs, 'data-part="control"') === 1 && hs.indexOf('data-part="control"') > hs.indexOf('data-part="back"') && hs.indexOf('data-part="toc"') < hs.indexOf('<section class="chapter"'));
  const plain = { ...DT.compose('srs', 'en') };
  delete plain.docType; delete plain.coverDesign;
  const hp = htmlOf(plain, 'en');
  check('a document with no family prints no back part and no families CSS (old documents as before)', !hp.includes('data-part="back"') && !/bw-tiles|bw-stmt|bw-idbox/.test(R.documentCss(theme, {}, plain)));

  // ── 4. the validator ──
  const e1 = coverErrors({ cols: 5, fields: [{ label: 'A', id: true }, { label: 'B', id: true }], figures: [{ label: 'F', value: 3, kind: 'pink', x: 1 }], badge: { label: 'V' }, statement: { text: 'T', choices: ['a', 'b', 'c', 'd', 'e'], seal: true } }, 'en');
  check('S2: bad cover keys are errors (cols, two id fields, a figure value / kind / unknown key, a badge without value, five choices, an unknown statement key)', ['cover.cols', 'more than one id:true', 'figures[0].kind', 'figures[0].value', 'figures[0] has an unknown key', 'cover.badge', 'choices', 'cover.statement has an unknown key «seal»'].every((w) => e1.some((m) => m.includes(w))) && coverErrors(KEYS['uat-signoff'].ar, 'ar').length === 0, e1);
  const allKeysOk = Object.entries(KEYS).filter(([k]) => !k.startsWith('$')).every(([id, v]) => DT.EDITIONS.every((ed) => coverErrors(v[ed], ed).length === 0 && familyWarnings(v[ed], DT.TYPE_FAMILY[id], ed).length === 0));
  check('the spec keys of all 8 family types are valid and print in their family (no S2 error, no family warning)', allKeysOk);
  check('a key the family does not print is a warning (a badge on a report, statement on a spine page, id:true outside a form)', familyWarnings({ badge: { label: 'V', value: '1' } }, 'report', 'en').length === 1 && familyWarnings({ statement: { text: 'x' } }, 'spine', 'en').length === 1 && familyWarnings({ fields: [{ label: 'a', id: true }] }, 'sheet', 'en').length === 1);
  // S8 in a throw-away tree: redrawn art (bw-a-* classes) out of contract is an ERROR, art not redrawn yet only a warning; S1 coverDesign warning
  const root = path.join(tmp, 'tree');
  const src = path.join(REPO, 'templates', '_doctypes');
  const dst = path.join(root, 'templates', '_doctypes');
  fs.mkdirSync(path.join(dst, '_art'), { recursive: true });
  for (const f of ['schema.json', '_categories.json', '_palettes.json']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  fs.cpSync(path.join(src, 'srs'), path.join(dst, 'srs'), { recursive: true });
  fs.cpSync(path.join(src, 'minutes'), path.join(dst, 'minutes'), { recursive: true });
  { const tf = path.join(dst, 'minutes', 'type.json'); const tj = JSON.parse(fs.readFileSync(tf, 'utf8')); tj.coverDesign = 'compact'; fs.writeFileSync(tf, JSON.stringify(tj, null, 2)); } // as before the content lane set «form»
  const art = fs.readFileSync(path.join(src, '_art', 'srs.svg'), 'utf8');
  fs.writeFileSync(path.join(dst, '_art', 'srs.svg'), art);
  const ok0 = validateType('srs', { root });
  const markFirst = art.replace(/(<g class="bw-a-mark">[\s\S]*?<\/g>)(\s*<\/svg>)/, '$2').replace(/(<g class="bw-a-page">)/, (m) => (art.match(/<g class="bw-a-mark">[\s\S]*?<\/g>/) || [''])[0] + m);
  fs.writeFileSync(path.join(dst, '_art', 'srs.svg'), markFirst);
  const bad = validateType('srs', { root });
  fs.writeFileSync(path.join(dst, '_art', 'srs.svg'), markFirst.replace(/bw-a-/g, 'old-'));
  const old = validateType('srs', { root });
  check('S8: the pilot art (a <title> first, then the layers) holds the contract; redrawn art out of order is an ERROR; the same art without bw-a-* classes only a warning', ok0.errors.length === 0 && ok0.contract.length === 0 && markFirst !== art && bad.errors.some((m) => m.includes('layer contract (S8)')) && old.errors.length === 0 && old.contract.length > 0, [ok0.errors, ok0.contract, bad.errors, old.errors, old.contract.length]);
  check('S8: a <title> or <defs> child is no layer; a bw-a-* class inside <defs> is still a nested layer', layerContract('<svg><title>x</title><defs><g/></defs><g class="bw-a-page"/><g class="bw-a-head"/><g class="bw-a-mark"/></svg>').length === 0 && layerContract('<svg><defs><g class="bw-a-row"/></defs><g class="bw-a-page"/><g class="bw-a-head"/><g class="bw-a-mark"/></svg>').some((m) => m.includes('nested')));
  const mt = validateType('minutes', { root });
  check('S1: a family type whose type.json still names compact or spine gets a warning naming its spec family (not an error)', mt.errors.length === 0 && mt.warnings.some((m) => m.includes('coverDesign «compact» prints as «form»')), [mt.errors, mt.warnings]);

  // ── B1 (0.19.0 final review): the Blank document exports through the CLI (`business-wrap export`, whose document gate now accepts a bare chapter)
  // and through the functions the editor's Export calls (engine/serve.mjs: exportPdf + exportDocx) ──
  const blankDir = path.join(tmp, 'blank');
  fs.mkdirSync(blankDir, { recursive: true });
  const { gateDocument } = await import('../engine/heal/gates.mjs');
  const blankBad = [];
  for (const ed of DT.EDITIONS) {
    const doc = DT.compose('blank', ed);
    if (gateDocument(doc).verdict === 'FAIL') blankBad.push(`${ed}: gate ${JSON.stringify(gateDocument(doc).problems)}`);
    const f = path.join(blankDir, `document.${ed}.json`);
    fs.writeFileSync(f, JSON.stringify(doc));
    const cli = spawnSync(process.execPath, [path.join(REPO, 'engine', 'cli.mjs'), 'export', f, ed, '--out', path.join(blankDir, 'cli-' + ed)], { encoding: 'utf8', env: { ...process.env }, timeout: 180000 });
    const made = fs.existsSync(path.join(blankDir, 'cli-' + ed)) ? fs.readdirSync(path.join(blankDir, 'cli-' + ed), { recursive: true }).map(String) : [];
    if (cli.status !== 0 || !made.some((x) => x.endsWith('.pdf')) || !made.some((x) => x.endsWith('.docx'))) blankBad.push(`${ed}: cli exit ${cli.status} ${made.join(',')} ${(cli.stderr || cli.stdout || '').slice(0, 200)}`);
    await exportPdf(doc, { locale: ed, theme, pdfPath: path.join(blankDir, `ed-${ed}.pdf`) });
    exportDocx(doc, { locale: ed, theme, docxPath: path.join(blankDir, `ed-${ed}.docx`) });
    if (!fs.existsSync(path.join(blankDir, `ed-${ed}.pdf`)) || !fs.existsSync(path.join(blankDir, `ed-${ed}.docx`))) blankBad.push(`${ed}: editor export`);
  }
  const g0 = gateDocument({ control: { documentId: 'X' }, chapters: [{ title: '', sections: [] }] });
  check('B1: Blank (ar, en) passes the document gate and exports to PDF and DOCX through the CLI and through the editor\'s export functions; a titled-chapter-less ordinary chapter still fails the gate', !blankBad.length && g0.verdict === 'FAIL', blankBad);

  // ── 5. PDF and DOCX ──
  browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
  const out = path.join(tmp, 'out');
  fs.mkdirSync(out, { recursive: true });
  const jobs = [];
  for (const id of ['minutes', 'test-cases', 'business-case']) for (const ed of DT.EDITIONS) jobs.push([id, ed, id === 'test-cases' ? { ...tdoc(ed), cover: KEYS[id][ed] } : keyed(id, ed)]);
  for (const [id, ed, doc] of jobs) {
    await exportPdf(doc, { locale: ed, theme, pdfPath: path.join(out, `${id}.${ed}.pdf`), browser });
    exportDocx(doc, { locale: ed, theme, docxPath: path.join(out, `${id}.${ed}.docx`) });
  }
  await browser.close();
  browser = null;
  const PY = `
import sys, json, pymupdf
out = {}
for f in sys.argv[1:]:
    d = pymupdf.open(f); p = d[0]
    cur = dg = 0
    for dr in p.get_drawings():
        for it in dr['items']:
            if it[0] == 'c': cur += 1
            elif it[0] == 'l' and abs(it[1].x - it[2].x) > 0.5 and abs(it[1].y - it[2].y) > 0.5: dg += 1
            elif it[0] == 'qu' and not it[1].is_rectangular: dg += 1
    out[f] = {'w': p.rect.width, 'h': p.rect.height, 'images': len(p.get_images()), 'curves': cur, 'diag': dg, 'text': p.get_text(), 'p2': d[1].get_text() if len(d) > 1 else ''}
print(json.dumps(out))
`;
  const [cmd, args] = py(['-c', PY, ...jobs.map(([id, ed]) => path.join(out, `${id}.${ed}.pdf`))], ['pymupdf']);
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, PYTHONUTF8: '1' } });
  let P = {};
  try { P = JSON.parse(r.stdout); } catch { check('pymupdf read the PDFs', false, r.stderr); }
  const pdfBad = [];
  for (const [id, ed, doc] of jobs) {
    const x = P[path.join(out, `${id}.${ed}.pdf`)];
    if (!x) { pdfBad.push(`${id}.${ed}: not read`); continue; }
    const t = x.text.replace(/\s+/g, ' ');
    const why = [];
    if (x.images || x.curves || x.diag) why.push(`${x.images} images, ${x.curves} curves, ${x.diag} diagonals`);
    if (id === 'test-cases' && !(x.w > x.h)) why.push('not landscape');
    if (id !== 'test-cases' && !(x.h > x.w)) why.push('not portrait');
    if (id === 'minutes' && !t.includes('MOM-001')) why.push('no ID on page 1');
    if (id === 'business-case' && ed === 'en' && !t.includes('Approve option [B]')) why.push('no decision box on page 1');
    if (![doc.control.documentId, doc.control.version].every((k) => t.includes(k))) why.push('control tokens');
    if (why.length) pdfBad.push(`${id}.${ed}: ${why.join(', ')}`);
  }
  check('PDF (ar, en, with the keys): page 1 has no image, curve or diagonal; the sheet is landscape, the form and the report portrait; the form\'s ID, the report\'s decision box (en text) and the control tokens are on page 1', !pdfBad.length, pdfBad);
  const docxBad = [];
  for (const [id, ed, doc] of jobs) {
    const z = unzip(path.join(out, `${id}.${ed}.docx`));
    const x = z['word/document.xml'].toString('utf8');
    const body = x.slice(x.indexOf('<w:body'));
    const k = body.indexOf('<w:sectPr');
    const s1 = body.slice(0, k);
    const txt = wText(s1);
    const all = wText(body);
    const why = [];
    if (/<a:blip\b/.test(s1)) why.push('a picture in section 1');
    const keysE = KEYS[id][ed];
    if (id === 'minutes' && !(txt.includes('MOM-001') && txt.indexOf('MOM-001') < txt.indexOf(doc.chapters[0].title))) why.push('ID box not before chapter 1 in section 1');
    if (id === 'test-cases' && !(body.includes('w:orient="landscape"') && keysE.figures.every((f) => txt.includes(f.label)))) why.push('landscape / summary strip');
    if (id === 'test-cases' && !(x.includes('<w:noWrap/>') && /<w:trHeight w:val="79[0-9]" w:hRule="atLeast"\/>/.test(x))) why.push('noWrap / signoff 14 mm rows');
    if (id === 'business-case' && !(txt.includes(keysE.statement.text) && keysE.figures.every((f) => txt.includes(f.label)) && keysE.statement.choices.every((c) => txt.includes(c)))) why.push('tiles / decision box in section 1');
    if (id !== 'business-case') {
      const backHead = ed === 'ar' ? 'ضبط الوثيقة' : 'Document control';
      const lastCh = doc.chapters.at(-1).title;
      if (!(all.lastIndexOf(backHead) > all.lastIndexOf(lastCh))) why.push('back matter not after the last chapter');
    }
    const kicker = doc.labels?.kicker;
    if (kicker && !wText(body).includes(kicker)) why.push(`the document's kicker «${kicker}» is not in the file`);
    if (why.length) docxBad.push(`${id}.${ed}: ${why.join(', ')}`);
  }
  check('DOCX (ar, en, with the keys): no picture in section 1; the form ID before chapter 1, the sheet landscape with its strip, noWrap and 14 mm signoff rows, the report tiles and decision box on the title page, control after the last chapter, the document\'s own kicker', !docxBad.length, docxBad);
} catch (e) {
  check('suite ran without an exception', false, (e && e.stack) || e);
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\nfamilies-0190: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
