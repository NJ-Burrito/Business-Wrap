// 0.18.0 (document studio) · lane L2 covers: two cover designs (`spine`, `compact`), a category colour taken from the document's own design vars, and one flat
// motif per document type, in the HTML/PDF print, the editor's markup and the Word file; the user manual's steps and callouts.
//   1. the 17 motifs: flat shapes only, mirrored in Arabic (a check mark moves but is not flipped), the Python twin's constants equal the renderer's
//   2. no coverDesign / motif = the markup and the stylesheet carry nothing new (the byte comparison against the old engine is doc-0160's)
//   3. every type x ar/en renders `.cover[data-cover][data-motif]` with its svg (and, on a spine cover, the type code)
//   4. headless Chrome (tagged bw-1109, closed in finally): the spine and motif boxes sit where covers.md puts them, mirrored in RTL, the spine takes the palette,
//      dense tables take the wash and zebra, a compact cover is no page of its own
//   5. the real exports: a PDF and a DOCX per cover design in each language (pdftotext -enc UTF-8 shows the title; the DOCX holds the title, the palette's
//      colours and the motif picture and no colour off the palette)
//   6. the user manual: numbered steps, callouts with a bold tag word, in the print and in Word
//   node tests/cover-designs-0180.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { REPO, exportPdf, exportDocx, loadTheme, launchOptions, i18n, printHtml } from '../engine/export.mjs';
import { renderDocument, documentCss, designTheme, COVER_DESIGNS, COVER_MOTIFS, COVER_CODES, COVER_DENSE, MOTIF_ROLES, coverMotifSvg, coverMotifShapes, contrastOf, calloutOf } from '../engine/render.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-cover0180-'));
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  cover-designs-0180: ${name}${detail && !ok ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`);
  if (!ok) failed += 1;
};
const theme = loadTheme();
const V = theme.vars;
const clone = (x) => JSON.parse(JSON.stringify(x));
const load = (l) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'blank', `document.${l}.json`), 'utf8'));
/** The category palettes the way L0 will store them: the document's primary, primary-deep, primary-50 and primary-100 are steps of an existing ramp. */
const PALETTE = {
  navy: {},
  forest: { primary: V['success-700'], 'primary-deep': V['success-700'], 'primary-50': V['success-50'], 'primary-100': V['success-100'] },
  gold: { primary: V['accent-700'], 'primary-deep': V['accent-800'], 'primary-50': V['accent-50'], 'primary-100': V['accent-100'] },
  slate: { primary: V['neutral-800'], 'primary-deep': V['neutral-800'], 'primary-50': V['neutral-100'], 'primary-100': V['neutral-200'] },
  rust: { primary: V['signal-700'], 'primary-deep': V['signal-700'], 'primary-50': V['signal-50'], 'primary-100': V['signal-100'] },
};
const COMPACT = new Set(['blank', 'minutes', 'test-cases', 'defect-report', 'rtm']);
const CATEGORY = { srs: 'navy', brd: 'navy', frs: 'navy', rtm: 'navy', 'process-flow': 'navy', blank: 'navy', 'test-plan': 'forest', 'test-cases': 'forest', 'defect-report': 'forest', 'user-manual': 'gold', 'uat-signoff': 'gold', 'release-notes': 'gold', tor: 'slate', 'change-request': 'slate', minutes: 'slate', 'business-case': 'slate', tot: 'rust' };
const make = (motif, locale, over = {}) => {
  const d = load(locale);
  d.coverDesign = COMPACT.has(motif) ? 'compact' : 'spine';
  d.motif = motif;
  if (Object.keys(PALETTE[CATEGORY[motif]]).length) d.design = { vars: PALETTE[CATEGORY[motif]] };
  return Object.assign(d, over);
};
const htmlOf = (doc, locale) => renderDocument(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });
const count = (h, s) => h.split(s).length - 1;
const hex = (rgb) => { const m = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(rgb || ''); return m ? '#' + [1, 2, 3].map((i) => (+m[i]).toString(16).padStart(2, '0')).join('') : String(rgb); };
const pdfText = (f, page) => spawnSync('pdftotext', ['-enc', 'UTF-8', ...(page ? ['-f', String(page), '-l', String(page)] : []), f, '-'], { encoding: 'utf8' }).stdout || '';
const pdfPages = (f) => +((/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [f], { encoding: 'utf8' }).stdout || '') || [])[1] || 0);
const PY = `
import sys, zipfile, re, json
z = zipfile.ZipFile(sys.argv[1])
names = z.namelist()
xml = {n: z.read(n).decode('utf8', 'ignore') for n in names if n.endswith('.xml') and n.startswith('word/')}
body = xml['word/document.xml']
allx = ''.join(v for n, v in xml.items() if re.match(r'word/(document|header\d*|footer\d*)\.xml$', n))
text = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', body))
fills = sorted(set(m.upper() for m in re.findall(r'w:(?:fill|color)="([0-9A-Fa-f]{6})"', allx)))
print(json.dumps({'text': text, 'fills': fills, 'media': [n for n in names if n.startswith('word/media/') and n.endswith('.png')], 'cairo': 'Cairo' in allx, 'tag_bold': bool(re.search(r'<w:b/>.{0,400}?<w:t[^>]*>(Note|ملاحظة)', body, re.S))}))
`;
const docx = (f) => JSON.parse(spawnSync('python', ['-X', 'utf8', '-I', '-c', PY, f], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '{}');
const rects = (svg) => [...svg.matchAll(/<rect[^>]*?\sx="([\d.]+)"[^>]*?\swidth="([\d.]+)"/g)].map((m) => [+m[1], +m[2]]);

let ctx;
try {
  // ── 1. the motifs ──
  check('17 motif ids, each with shapes', COVER_MOTIFS.length === 17 && COVER_MOTIFS.every((m) => coverMotifShapes(m).length >= 5), COVER_MOTIFS.filter((m) => coverMotifShapes(m).length < 5));
  const bad = [];
  for (const m of COVER_MOTIFS) {
    const svg = coverMotifSvg(m);
    const roles = new Set([...svg.matchAll(/class="([^"]*)"/g)].flatMap((x) => x[1].split(' ')).filter((c) => /^[fs]-/.test(c)).map((c) => c.slice(2)));
    if (/NaN|undefined|<text|gradient|opacity|filter|<image|url\(/.test(svg) || ![...roles].every((r) => r in MOTIF_ROLES) || !/^<svg [^>]*viewBox="0 0 160 94"/.test(svg) || coverMotifShapes(m).length > 90) bad.push(m);
  }
  check('every motif is flat shapes in known colour roles (no text, gradient, opacity, filter, image)', !bad.length, bad);
  const flipBad = [];
  for (const m of COVER_MOTIFS) {
    const a = rects(coverMotifSvg(m));
    const b = rects(coverMotifSvg(m, { rtl: true }));
    if (a.length !== b.length || a.some(([x, w], i) => Math.abs(160 - x - w - b[i][0]) > 0.011)) flipBad.push(m);
  }
  check('the Arabic motif is the mirror image of the English one, rect by rect', !flipBad.length, flipBad);
  const tick = (svg) => (/<polyline[^>]*points="([^"]+)"/.exec(svg) || [])[1]?.split(' ').map((p) => p.split(',').map(Number));
  const tEn = tick(coverMotifSvg('test-plan'));
  const tAr = tick(coverMotifSvg('test-plan', { rtl: true }));
  check('a check mark moves with the mirror but is not flipped', tEn && tAr && tEn[0][0] < tEn[1][0] && tAr[0][0] < tAr[1][0] && tAr[0][0] > 100 && tEn[0][0] < 20, JSON.stringify([tEn, tAr]));
  const colored = coverMotifSvg('test-cases', { colors: Object.fromEntries(Object.keys(MOTIF_ROLES).map((k) => [k, '#123456'])) });
  check('with colours given the paints are plain attributes (the DOCX route), no class', /fill="#123456"/.test(colored) && !/class="f-/.test(colored));
  const cli = spawnSync('node', [path.join(REPO, 'engine', 'covers', 'motif-svg.mjs'), 'tot', 'rtl'], { encoding: 'utf8' });
  check('engine/covers/motif-svg.mjs prints the renderer\'s own drawing (the DOCX builder reads it)', cli.status === 0 && cli.stdout.startsWith('<svg') && cli.stdout.includes('viewBox="0 0 160 94"') && rects(cli.stdout).length === rects(coverMotifSvg('tot', { rtl: true })).length, cli.stderr);
  const py = fs.readFileSync(path.join(REPO, 'engine', 'docx', 'cover_design.py'), 'utf8');
  const pyList = (name) => [...(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm').exec(py)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const pyCodes = Object.fromEntries([...(/^CODES = \{([^}]*)\}/m.exec(py)?.[1] || '').matchAll(/'([^']+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  check('the DOCX builder\'s designs, motifs, codes and dense types are the renderer\'s', JSON.stringify(pyList('DESIGNS')) === JSON.stringify(COVER_DESIGNS) && JSON.stringify(pyList('MOTIFS')) === JSON.stringify(COVER_MOTIFS) && JSON.stringify(pyCodes) === JSON.stringify(COVER_CODES) && JSON.stringify(pyList('DENSE')) === JSON.stringify(COVER_DENSE), [pyList('DESIGNS'), pyList('DENSE')]);

  // ── 2. absent keys: nothing new ──
  const BASE = ['en', 'ar'].map((l) => { const d = load(l); return [l, d, htmlOf(d, l)]; });
  for (const [l, d, h] of BASE) {
    check(`${l}: no coverDesign / motif = today's cover markup, no cover design CSS`, h.includes('<div class="cover" data-part="cover">') && !/data-cover|cover-motif|bw-callout/.test(h) && !/cover design|user manual/.test(documentCss(designTheme(theme, d), {}, d)));
    const unk = clone(d); unk.coverDesign = 'band'; unk.motif = 'nope';
    check(`${l}: an unknown design or motif changes nothing`, htmlOf(unk, l) === h && documentCss(theme, {}, unk) === documentCss(theme, {}, d));
    // 0.18.0 polish (L10a): only a document with a docType takes it (bands, chapter heading rows, status cells, a quiet contents list); no docType = byte for byte what it was
    const typed = clone(d); typed.docType = 'rtm';
    typed.chapters = [{ title: 'T', sections: [{ title: 'S', blocks: [{ kind: 'subhead', text: 'Sub' }, { kind: 'table', columns: ['A', 'Status'], rows: [['x', 'Pass'], ['y', 'لم ينفذ'], ['z', 'Passing grade']] }] }] }];
    const plainCh = clone(typed); delete plainCh.docType;
    const hT = htmlOf(typed, l); const hP = htmlOf(plainCh, l);
    check(`${l}: status cells (Pass, Fail, Blocked, Not run, Covered, Partial, Gap and the Arabic words) take their fill only with a docType, the word stays, a longer text is no status`, /<td class="st-ok"[^>]*>[^<]*Pass<\/td>|<td class="st-ok"/.test(hT) && /class="st-idle"/.test(hT) && !/class="st-[a-z]+"[^>]*>(<bdi[^>]*>)?Passing/.test(hT) && !/class="st-(ok|bad|warn|idle)/.test(hP.replace(/\.st-(ok|bad|warn|idle)\{[^}]*\}/g, '')));
    check(`${l}: the polish CSS (subhead band padding, chapter heading row kept whole) is in a typed document and absent from any other`, /0\.18\.0 polish/.test(documentCss(theme, {}, typed)) && !/0\.18\.0 polish/.test(documentCss(theme, {}, plainCh)) && /h4\{padding-bottom:3mm\}/.test(documentCss(theme, {}, typed)) && /h2\{break-inside:avoid\}/.test(documentCss(theme, {}, typed)));
    check(`${l}: a typed document's contents list leaves the unnumbered sub-heads out; any other document keeps them`, !/toc-card/.test(hT.replace(/\.toc-card[^{]*\{[^}]*\}/g, '')) && /class="toc-card"/.test(hP));
  }

  // ── 3. markup for every type x language ──
  const markBad = [];
  for (const m of COVER_MOTIFS) {
    for (const l of ['ar', 'en']) {
      const d = make(m, l);
      const h = htmlOf(d, l);
      const design = COMPACT.has(m) ? 'compact' : 'spine';
      const okCode = COMPACT.has(m) ? (COVER_CODES[m] ? h.includes(`<span class="tb-code"><bdi dir="ltr">${COVER_CODES[m]}</bdi>`) : !h.includes('<span class="tb-code">')) : (COVER_CODES[m] ? h.includes(`<div class="type-code"><bdi dir="ltr">${COVER_CODES[m]}</bdi>`) : !h.includes('<div class="type-code">'));
      if (!(h.includes(`data-cover="${design}" data-motif="${m}"`) && count(h, '<svg class="cover-motif"') === 1 && okCode && h.includes(`dir="${l === 'ar' ? 'rtl' : 'ltr'}"`) && documentCss(designTheme(theme, d), {}, d).includes('/* 0.18.0 cover design: ' + design))) markBad.push(`${m}/${l}`);
    }
  }
  check('17 types x ar/en: .cover[data-cover][data-motif] + one motif svg + the type code, and the cover CSS', !markBad.length, markBad);
  const spineAr = htmlOf(make('tot', 'ar'), 'ar');
  check('the spine cover keeps its logo slots, rule, kicker, title, subtitle and meta row', ['class="lockup"', 'cover-rule', 'class="kicker"', 'rule-short', '<h1', 'class="subtitle"', 'cover-foot'].every((s) => spineAr.includes(s)));
  check('a motif alone means the spine design; a design alone has no motif', htmlOf({ ...load('en'), motif: 'tor' }, 'en').includes('data-cover="spine" data-motif="tor"') && !/data-motif|<svg class="cover-motif"/.test(htmlOf({ ...load('en'), coverDesign: 'spine' }, 'en')));
  check('the user manual keys its look on the motif', documentCss(theme, {}, { ...load('en'), motif: 'user-manual' }).includes('counter-increment:bw-step') && !documentCss(theme, {}, { ...load('en'), motif: 'srs' }).includes('counter-increment:bw-step'));

  // ── 4. layout in headless Chrome ──
  const profile = path.join(tmp, 'bw-1109-chrome');
  ctx = await chromium.launchPersistentContext(profile, { ...launchOptions(), headless: true });
  const MM = 96 / 25.4;
  const measure = async (doc, locale, sels) => {
    const { html } = printHtml(doc, { locale, theme, embed: true });
    const f = path.join(tmp, `probe-${doc.motif}-${locale}.html`);
    fs.writeFileSync(f, html, 'utf8');
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.emulateMedia({ media: 'print' });
    await page.goto('file:///' + f.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const ready = await page.evaluate(() => !!document.querySelector('.cover[data-cover]') && document.fonts.size > 0);
    const out = await page.evaluate(([s, mm]) => Object.fromEntries(Object.entries(s).map(([k, q]) => { const e = document.querySelector(q); if (!e) return [k, null]; const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return [k, { x: r.x / mm, y: r.y / mm, w: r.width / mm, h: r.height / mm, r: (r.x + r.width) / mm, bg: c.backgroundColor, color: c.color }]; })), [sels, MM]);
    await page.close();
    return { ready, ...out };
  };
  const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
  const SELS = { cover: '.cover', spine: '.spine', id: '.spine .id', code: '.type-code', kicker: '.cover[data-cover=spine] .kicker', title: '.cover-title', motif: '.cover-motif', foot: '.cover-foot', h2: '.wrap h2' };
  for (const l of ['en', 'ar']) {
    const d = make('test-plan', l);
    const m = await measure(d, l, SELS);
    const pal = PALETTE.forest;
    const rtl = l === 'ar';
    check(`spine ${l}: the page is read (cover and its svg exist)`, m.ready && m.cover && m.motif);
    check(`spine ${l}: A4 cover, the motif is 152 x 89 mm at 163 mm down, ${rtl ? '176 mm from the left edge (mirrored)' : '34 mm in'}`, near(m.cover.h, 297, 0.3) && near(m.motif.w, 152) && near(m.motif.y, 163) && near(rtl ? m.motif.r : m.motif.x, rtl ? 176 : 34), JSON.stringify(m.motif));
    check(`spine ${l}: title at 141 mm, type code at 91 mm, kicker at 119.5 mm, meta row at 258 mm`, near(m.title.y, 141) && near(m.code.y, 91) && near(m.kicker.y, 119.5) && near(m.foot.y, 258), JSON.stringify([m.title.y, m.code.y, m.kicker.y, m.foot.y]));
    check(`spine ${l}: the spine is on the ${rtl ? 'right' : 'left'} edge, in the palette's deep colour`, (rtl ? near(m.spine.x, 190, 1) : near(m.spine.r, 20)) && hex(m.spine.bg) === pal['primary-deep'].toLowerCase(), JSON.stringify([m.spine.x, m.spine.r, m.spine.bg]));
    check(`spine ${l}: the document code on the spine reads (4.5:1) and is centred about 141 mm`, contrastOf(hex(m.id.color), pal['primary-deep']) >= 4.5 && near(m.id.y + m.id.h / 2, 141, 1), JSON.stringify([m.id.color, m.id.y, m.id.h]));
    check(`spine ${l}: chapter headings take the palette's primary`, hex(m.h2.color) === pal.primary.toLowerCase(), m.h2.color);
  }
  const cm = await measure(make('test-cases', 'en'), 'en', { cover: '.cover', motif: '.cover-motif', band: '.tb-band', th: '.wrap table:not(.control):not(.toc) th', code: '.tb-code', h1: '.cover h1' });
  check('compact: no page of its own (a title block, not 297 mm), a small motif, a band, the type code chip', cm.cover.h < 80 && near(cm.motif.w, 46) && cm.band.h > 1 && cm.code && cm.h1.y < 60, JSON.stringify([cm.cover.h, cm.motif.w, cm.h1.y]));
  check('a dense type (test cases) washes its table headers with the palette\'s wash', hex(cm.th.bg) === PALETTE.forest['primary-100'].toLowerCase(), cm.th.bg);
  const plain = await measure(make('srs', 'en'), 'en', { th: '.wrap table:not(.control):not(.toc) th' });
  check('a non-dense type (SRS) keeps plain table headers', /rgba\(0, 0, 0, 0\)|transparent/.test(plain.th.bg), plain.th.bg);
  // the user manual in the print: numbered steps, callouts
  const man = (l) => {
    const d = make('user-manual', l);
    const note = l === 'ar' ? 'ملاحظة: احفظ الملف قبل الإغلاق.' : 'Note: save the file before you close it.';
    d.chapters[0].sections[0].blocks.push({ kind: 'subhead', text: l === 'ar' ? 'افتح الصفحة' : 'Open the page' }, { kind: 'prose', paragraphs: [l === 'ar' ? 'اضغط «ابدأ».' : 'Press «Start».', note, l === 'ar' ? 'تحذير: لا تغلق النافذة.' : 'Warning: do not close the window.'] }, { kind: 'subhead', text: l === 'ar' ? 'أرسل الطلب' : 'Send the request' });
    return d;
  };
  for (const l of ['en', 'ar']) {
    const h = htmlOf(man(l), l);
    check(`user manual ${l}: callouts carry their kind, the tag word is bold, plain paragraphs stay plain`, count(h, 'bw-callout bw-co-note') === 1 && count(h, 'bw-callout bw-co-warning') === 1 && count(h, '<b class="bw-tag">') === 2 && /<p(?![^>]*bw-callout)[^>]*>[^<]*(Press|اضغط)/.test(h));
    check(`user manual ${l}: the editor's markup keeps the callout text whole (no inner tag word markup)`, !renderDocument(man(l), { locale: l, labels: i18n().doc[l], theme, fontCss: '', logos: theme.logos, editor: true }).includes('<b class="bw-tag">'));
  }
  check('callout words are found in both languages and only at the start', calloutOf('Tip: x')?.kind === 'tip' && calloutOf('ملاحظة: س')?.kind === 'note' && calloutOf('A Note: x') === null && calloutOf('Notebook') === null);
  const stepPage = await ctx.newPage();
  const { html: manHtml } = printHtml(man('en'), { locale: 'en', theme, embed: true });
  const manFile = path.join(tmp, 'manual.html');
  fs.writeFileSync(manFile, manHtml, 'utf8');
  await stepPage.emulateMedia({ media: 'print' });
  await stepPage.goto('file:///' + pathToFileURL(manFile).href.replace(/^file:\/\/\//, ''), { waitUntil: 'load' });
  const steps = await stepPage.evaluate(() => [...document.querySelectorAll('.wrap h4')].map((h) => [getComputedStyle(h, '::before').content, getComputedStyle(h).counterIncrement, h.getBoundingClientRect().height]));
  await stepPage.close();
  check('user manual: every subhead is a step chip counting from a counter that restarts in each section', steps.length >= 2 && steps.every(([c, inc]) => c === 'counter(bw-step)' && /bw-step 1/.test(inc)), JSON.stringify(steps));
  await ctx.close();
  ctx = null;

  // ── 5. the real exports ──
  const EXPORTS = [['srs', 'en', 'spine'], ['tot', 'ar', 'spine'], ['test-cases', 'en', 'compact'], ['minutes', 'ar', 'compact']];
  const pages = {};
  for (const [m, l, design] of EXPORTS) {
    const d = make(m, l);
    const base = path.join(tmp, `${m}-${l}`);
    await exportPdf(d, { locale: l, theme, pdfPath: base + '.pdf' });
    const p1 = pdfText(base + '.pdf', 1);
    const title = l === 'ar' ? 'خدمة جديدة' : 'New service';
    const ctl = i18n().doc[l].controlChapter;
    pages[`${m}-${l}`] = pdfPages(base + '.pdf');
    const lat = (p1.match(/[A-Za-z]{3,}/g) || []).length;
    const ar = (p1.match(/[؀-ۿ]/g) || []).length;
    check(`PDF ${design} ${m} ${l}: page 1 shows the title${design === 'spine' ? ' and the type code, and no control heading (the cover is a page)' : ' and the document control heading on the same page'}`, design === 'spine' ? p1.includes(title) && p1.includes(COVER_CODES[m]) && !p1.includes(ctl) : p1.includes(title) && p1.includes(ctl), p1.slice(0, 200));
    check(`PDF ${design} ${m} ${l}: the page is in the ${l === 'ar' ? 'Arabic' : 'English'} script`, l === 'ar' ? ar > 10 : lat > 10 && ar === 0);
    const w = await exportDocxChecked(d, l, base + '.docx');
    const wd = docx(base + '.docx');
    const pal = designTheme(theme, d).vars;
    const allowed = new Set(Object.values(pal).filter((v) => /^#[0-9a-f]{6}$/i.test(v)).map((v) => v.slice(1).toUpperCase()).concat(['FFFFFF', '000000', 'AUTO']));
    const deepHex = pal['primary-deep'].slice(1).toUpperCase();
    check(`DOCX ${design} ${m} ${l}: the title, the palette's deep colour and the gold are in the file`, !!w && (wd.text || '').includes(title) && (wd.fills || []).includes(deepHex) && (wd.fills || []).includes(pal['accent-bright'].slice(1).toUpperCase()), JSON.stringify([wd.fills, (wd.text || '').slice(0, 100)]));
    check(`DOCX ${design} ${m} ${l}: the motif picture is in the file; no colour off the palette; no Cairo`, (wd.media || []).length >= 1 && !(wd.fills || []).some((f) => !allowed.has(f)) && !wd.cairo, JSON.stringify([wd.media, (wd.fills || []).filter((f) => !allowed.has(f))]));
    if (design === 'spine') check(`DOCX ${design} ${m} ${l}: the type code ${COVER_CODES[m]} is real text`, (wd.text || '').includes(COVER_CODES[m]));
    else check(`DOCX ${design} ${m} ${l}: the title block heads the first page (title before the control heading, one section)`, (wd.text || '').indexOf(title) >= 0 && (wd.text || '').indexOf(title) < (wd.text || '').indexOf(ctl), (wd.text || '').slice(0, 160));
  }
  const spineSrs = make('srs', 'en'); spineSrs.coverDesign = 'compact';
  const cmpPdf = path.join(tmp, 'srs-compact.pdf');
  await exportPdf(spineSrs, { locale: 'en', theme, pdfPath: cmpPdf });
  check('the same document as compact is one page shorter than as spine (no cover page)', pdfPages(cmpPdf) < pages['srs-en'], `${pdfPages(cmpPdf)} vs ${pages['srs-en']}`);

  const manPdf = path.join(tmp, 'manual-en.pdf');
  await exportPdf(man('en'), { locale: 'en', theme, pdfPath: manPdf });
  const mt = pdfText(manPdf);
  check('user manual PDF: the step titles print with their numbers 1 and 2 and the callout tags in the text', /1\s+Open the page/.test(mt) && /2\s+Send the request/.test(mt) && mt.includes('Note: save the file') && mt.includes('Warning: do not close'), mt.slice(mt.indexOf('Open the page') - 40, mt.indexOf('Open the page') + 200));

  // ── 6. the user manual in Word ──
  for (const l of ['en', 'ar']) {
    const d = man(l);
    const f = path.join(tmp, `manual-${l}.docx`);
    exportDocx(d, { locale: l, theme, docxPath: f });
    const wd = docx(f);
    const pal = designTheme(theme, d).vars;
    check(`DOCX user manual ${l}: callout fill and border colours, the bold tag word, the step chip in the primary colour`, (wd.fills || []).includes(V['primary-wash'].slice(1).toUpperCase()) && (wd.fills || []).includes(V['signal-100'].slice(1).toUpperCase()) && (wd.fills || []).includes(pal.primary.slice(1).toUpperCase()) && wd.tag_bold && (wd.text || '').includes(l === 'ar' ? 'ملاحظة:' : 'Note:'), JSON.stringify([wd.fills, wd.tag_bold]));
  }
} catch (e) {
  check('suite ran without an exception', false, e && e.stack || e);
} finally {
  if (ctx) await ctx.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\ncover-designs-0180: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);

function exportDocxChecked(doc, locale, docxPath) {
  try { exportDocx(doc, { locale, theme, docxPath }); return fs.statSync(docxPath).size > 5000; } catch (e) { check(`DOCX export ${doc.motif} ${locale} did not throw`, false, e.message); return false; }
}
