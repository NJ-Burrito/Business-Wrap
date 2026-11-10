// 0.18.0 (document studio) · lane L2 covers: page-1 designs (`spine`, `compact`), a category colour taken from the document's own design vars, in the
// HTML/PDF print, the editor's markup and the Word file; the user manual's steps and callouts. 0.19.0 (lane R1): NO motif any more (work/sdlc/design/
// 0190-types.md): the spine title page carries the control block (C3) where the motif was; tests/page1-0190 holds the page-1 drawing rule for every type.
//   1. no motif drawing is exported; the Python twin's constants (designs, types, codes, dense types, control fields) equal the renderer's
//   2. no coverDesign / motif = the markup and the stylesheet carry nothing new (the byte comparison against the old engine is doc-0160's); C7, C11, C12
//   3. every type x ar/en renders `.cover[data-cover][data-type]` with no svg (and, on a spine cover, the type code and the control block)
//   4. headless Chrome (tagged bw-1109, closed in finally): the spine and the control block sit where the spec puts them, mirrored in RTL, the spine takes
//      the palette, dense tables take the wash and zebra, a compact cover is no page of its own
//   5. the real exports: a PDF and a DOCX per cover design in each language (pdftotext -enc UTF-8 shows the title; the DOCX holds the title, the palette's
//      colours, no picture at all and no colour off the palette; approvals rows 12 mm)
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
import * as RM from '../engine/render.mjs';
import { renderDocument, documentCss, designTheme, COVER_DESIGNS, COVER_TYPES, COVER_CODES, COVER_DENSE, COVER_CONTROL, FIGURE_KINDS, REPORT_CONTROL, STATUS_WORDS, STATUS_WORDS_HEADED, STATUS_HEADS, contrastOf, calloutOf } from '../engine/render.mjs';

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
const make = (type, locale, over = {}) => {
  const d = load(locale);
  d.coverDesign = COMPACT.has(type) ? 'compact' : 'spine';
  d.docType = type;
  if (Object.keys(PALETTE[CATEGORY[type]]).length) d.design = { vars: PALETTE[CATEGORY[type]] };
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
print(json.dumps({'text': text, 'fills': fills, 'media': [n for n in names if n.startswith('word/media/')], 'cairo': 'Cairo' in allx, 'tag_bold': bool(re.search(r'<w:b/>.{0,400}?<w:t[^>]*>(Note|ملاحظة)', body, re.S)), 'h12': len(re.findall(r'<w:trHeight w:val="680" w:hRule="atLeast"/>', body)), 'breaks': body.count('w:type="page"')}))
`;
const docx = (f) => JSON.parse(spawnSync('python', ['-X', 'utf8', '-I', '-c', PY, f], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '{}');
const rects = (svg) => [...svg.matchAll(/<rect[^>]*?\sx="([\d.]+)"[^>]*?\swidth="([\d.]+)"/g)].map((m) => [+m[1], +m[2]]);

let ctx;
try {
  // ── 1. no motif any more; the Python twin ──
  check('17 type ids; render.mjs exports no motif drawing (coverMotifSvg, coverMotifShapes, MOTIF_ROLES, COVER_MOTIFS gone)', COVER_TYPES.length === 17 && !['coverMotifSvg', 'coverMotifShapes', 'MOTIF_ROLES', 'COVER_MOTIFS'].some((k) => k in RM));
  check('engine/covers/motif-svg.mjs is gone (the DOCX builder draws no motif)', !fs.existsSync(path.join(REPO, 'engine', 'covers', 'motif-svg.mjs')));
  const py = fs.readFileSync(path.join(REPO, 'engine', 'docx', 'cover_design.py'), 'utf8');
  const pyList = (name) => [...(new RegExp(`^${name} = \\(([^)]*)\\)`, 'm').exec(py)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const pyCodes = Object.fromEntries([...(/^CODES = \{([^}]*)\}/m.exec(py)?.[1] || '').matchAll(/'([^']+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  // 0.19.0 R2: the families' constants and the status words (C9: also the words of a status column, and its head words) are the renderer's too
  const pyWords = (name) => { const m = new RegExp(`^${name} = \\{([\\s\\S]*?)\\}\\n`, 'm').exec(py)?.[1] || ''; return Object.fromEntries([...m.matchAll(/'(ok|bad|warn|idle)': \(([^)]*)\)/g)].map((x) => [x[1], [...x[2].matchAll(/'([^']+)'/g)].map((y) => y[1])])); };
  check('the DOCX builder\'s figure kinds, report control fields, status words, C9 words and status head words are the renderer\'s', JSON.stringify(pyList('FIGURE_KINDS')) === JSON.stringify(FIGURE_KINDS) && JSON.stringify(pyList('REPORT_CONTROL')) === JSON.stringify(REPORT_CONTROL) && JSON.stringify(pyList('STATUS_HEADS')) === JSON.stringify(STATUS_HEADS) && JSON.stringify(pyWords('_STATUS_WORDS')) === JSON.stringify(STATUS_WORDS) && JSON.stringify(pyWords('_STATUS_WORDS_HEADED')) === JSON.stringify(STATUS_WORDS_HEADED), JSON.stringify([pyList('FIGURE_KINDS'), pyList('STATUS_HEADS'), pyWords('_STATUS_WORDS'), pyWords('_STATUS_WORDS_HEADED')]).slice(0, 400));
  check('the DOCX builder\'s designs, types, codes, dense types and control fields are the renderer\'s; no motif in it', JSON.stringify(pyList('DESIGNS')) === JSON.stringify(COVER_DESIGNS) && JSON.stringify(pyList('TYPES')) === JSON.stringify(COVER_TYPES) && JSON.stringify(pyCodes) === JSON.stringify(COVER_CODES) && JSON.stringify(pyList('DENSE')) === JSON.stringify(COVER_DENSE) && JSON.stringify(pyList('CONTROL')) === JSON.stringify(COVER_CONTROL) && !/motif_png|place_motif|MOTIF_SCRIPT/.test(py), [pyList('DESIGNS'), pyList('DENSE'), pyList('CONTROL')]);

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
    check(`${l}: the polish CSS (subhead band padding, chapter heading row kept whole: C15) is in a typed document and absent from any other`, /0\.18\.0 polish/.test(documentCss(theme, {}, typed)) && !/0\.18\.0 polish/.test(documentCss(theme, {}, plainCh)) && /h4\{padding-bottom:3mm\}/.test(documentCss(theme, {}, typed)) && /h2\{break-inside:avoid;break-after:avoid\}/.test(documentCss(theme, {}, typed)));
    // 0.19.0 C7: approvals rows print on the control page of a typed document (empty cells kept, to be signed); never in an untyped one
    const appr = [['Prepared by', '', '', '', ''], ['Approved by', '', '', '', '']];
    const hA = htmlOf({ ...typed, approvals: appr }, l); const hA0 = htmlOf({ ...plainCh, approvals: appr }, l);
    check(`${l}: C7 a typed document prints its approvals with the house columns and empty cells; an untyped one does not`, hA.includes('data-part="approvals"') && i18n().doc[l].approvalCols.every((c) => hA.includes(c)) && /<td[^>]*><\/td>/.test(hA.slice(hA.indexOf('data-part="approvals"'))) && !hA0.includes('data-part="approvals"'));
    // C11: a title-page document starts the contents and chapter 1 on new pages; tocDepth 1 lists the chapters only
    const sp = make('srs', l);
    check(`${l}: C11 a spine document's contents and chapter 1 open on new pages (a compact one's do not)`, /\[data-part=toc\]:not\(h2\+\[data-part=toc\]\)\{break-before:page\}/.test(documentCss(theme, {}, sp)) && /section\.chapter:first-of-type\{break-before:page\}/.test(documentCss(theme, {}, sp)) && !/first-of-type\{break-before:page\}/.test(documentCss(theme, {}, make('minutes', l))));
    const deep = htmlOf(sp, l); const flat = htmlOf({ ...sp, layout: { tocDepth: 1 } }, l);
    const tocRows = (h) => (h.slice(h.indexOf('<table class="toc"'), h.indexOf('</table>', h.indexOf('<table class="toc"'))).match(/<tr/g) || []).length;
    check(`${l}: C11 tocDepth 1 lists the ${sp.chapters.length} chapters only (depth 2: ${tocRows(deep)} rows)`, tocRows(flat) === sp.chapters.length && tocRows(deep) > tocRows(flat), [tocRows(flat), tocRows(deep)]);
    // C12: a shots block with no image prints a frame at its ratio with a numbered badge; an untyped one without ratio or badge keeps its plain caption
    const shotDoc = (t) => ({ ...t, chapters: [{ title: 'T', sections: [{ title: 'S', blocks: [{ kind: 'shots', images: [], caption: '' }, { kind: 'shots', images: [], caption: 'Form', ratio: '9:16', badge: 7 }] }] }] });
    const hs = htmlOf(shotDoc(typed), l); const hs0 = htmlOf(shotDoc(plainCh), l);
    check(`${l}: C12 screenshot frames: ratio, badge, «${l === 'ar' ? 'لقطة الشاشة' : 'Screenshot'} 1» for an empty caption; untyped, only the block with ratio and badge gets one`, count(hs, 'class="shot-frame"') === 2 && hs.includes('--sf-r:16/10') && hs.includes('--sf-r:9/16') && hs.includes('<bdi dir="ltr">7</bdi>') && hs.includes(l === 'ar' ? 'لقطة الشاشة <bdi dir="ltr">1</bdi>' : 'Screenshot 1') && count(hs0, 'class="shot-frame"') === 1, [count(hs, 'class="shot-frame"'), count(hs0, 'class="shot-frame"')]);
    check(`${l}: a typed document's contents list leaves the unnumbered sub-heads out; any other document keeps them`, !/toc-card/.test(hT.replace(/\.toc-card[^{]*\{[^}]*\}/g, '')) && /class="toc-card"/.test(hP));
  }

  // ── 3. markup for every type x language ──
  const markBad = [];
  for (const m of COVER_TYPES) {
    for (const l of ['ar', 'en']) {
      const d = make(m, l);
      const h = htmlOf(d, l);
      const design = COMPACT.has(m) ? 'compact' : 'spine';
      const okCode = COMPACT.has(m) ? (COVER_CODES[m] ? h.includes(`<span class="tb-code"><bdi dir="ltr">${COVER_CODES[m]}</bdi>`) : !h.includes('<span class="tb-code">')) : (COVER_CODES[m] ? h.includes(`<div class="type-code"><bdi dir="ltr">${COVER_CODES[m]}</bdi>`) : !h.includes('<div class="type-code">'));
      const cov = h.slice(h.indexOf('<div class="cover"'), h.indexOf('<div class="wrap">'));
      const ctl = design === 'spine' ? cov.includes('class="bw-fields fg-control"') && COVER_CONTROL.every((k) => cov.includes(`data-p="/control/${k}"`)) : !cov.includes('fg-control');
      if (!(h.includes(`data-cover="${design}" data-type="${m}"`) && !/<svg|cover-motif|data-motif/.test(cov) && okCode && ctl && h.includes(`dir="${l === 'ar' ? 'rtl' : 'ltr'}"`) && documentCss(designTheme(theme, d), {}, d).includes('/* 0.19.0 page 1: ' + design))) markBad.push(`${m}/${l}`);
    }
  }
  check('17 types x ar/en: .cover[data-cover][data-type], no svg, the type code, the control block on a spine page, and the page-1 CSS', !markBad.length, markBad);
  const spineAr = htmlOf(make('tot', 'ar'), 'ar');
  check('the spine cover keeps its logo slots, rule, kicker, title, subtitle and meta row', ['class="lockup"', 'cover-rule', 'class="kicker"', 'rule-short', '<h1', 'class="subtitle"', 'cover-foot'].every((s) => spineAr.includes(s)));
  const oldFile = htmlOf({ ...load('en'), motif: 'tor' }, 'en');
  check('an old file\'s motif alone still means the spine design and names the type (code TOR), and prints no art; a design alone names no type', oldFile.includes('data-cover="spine" data-type="tor"') && oldFile.includes('<div class="type-code"><bdi dir="ltr">TOR</bdi>') && !/data-motif|<svg class="cover-motif"/.test(oldFile) && !/data-type|<svg class="cover-motif"/.test(htmlOf({ ...load('en'), coverDesign: 'spine' }, 'en')));
  const fam = (f, t) => htmlOf({ ...load('en'), coverDesign: f, docType: t }, 'en');
  const [rep, frm, sht] = [fam('report', 'business-case'), fam('form', 'defect-report'), fam('sheet', 'rtm')];
  check('0.19.0 R2: report is a title page (data-cover spine) with its band and control block; form and sheet are a header on page 1 (data-cover compact, the band), a form with its ID box', rep.includes('data-cover="spine" data-family="report"') && rep.includes('class="rp-band"') && rep.includes('class="bw-fields fg-control"') && frm.includes('data-cover="compact" data-family="form"') && frm.includes('class="bw-idbox"') && sht.includes('data-cover="compact" data-family="sheet"') && sht.includes('class="tb-band"'));
  check('the user manual keys its look on the motif', documentCss(theme, {}, { ...load('en'), motif: 'user-manual' }).includes('counter-increment:bw-step') && !documentCss(theme, {}, { ...load('en'), motif: 'srs' }).includes('counter-increment:bw-step'));

  // ── 4. layout in headless Chrome ──
  const profile = path.join(tmp, 'bw-1109-chrome');
  ctx = await chromium.launchPersistentContext(profile, { ...launchOptions(), headless: true });
  const MM = 96 / 25.4;
  const measure = async (doc, locale, sels) => {
    const { html } = printHtml(doc, { locale, theme, embed: true });
    const f = path.join(tmp, `probe-${doc.docType}-${locale}.html`);
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
  const SELS = { cover: '.cover', spine: '.spine', id: '.spine .id', code: '.type-code', kicker: '.cover[data-cover=spine] .kicker', title: '.cover-title', ctl: '.cover-ctl', art: '.cover svg', foot: '.cover-foot', h2: '.wrap h2' };
  for (const l of ['en', 'ar']) {
    const d = make('test-plan', l);
    const m = await measure(d, l, SELS);
    const pal = PALETTE.forest;
    const rtl = l === 'ar';
    check(`spine ${l}: the page is read (cover and its control block exist, no svg on it)`, m.ready && m.cover && m.ctl && m.art === null);
    check(`spine ${l}: A4 cover, the control block is 152 mm wide, ends at 252 mm, ${rtl ? '176 mm from the left edge (mirrored)' : '34 mm in'}, below the title`, near(m.cover.h, 297, 0.3) && near(m.ctl.w, 152) && near(m.ctl.y + m.ctl.h, 252) && near(rtl ? m.ctl.r : m.ctl.x, rtl ? 176 : 34) && m.ctl.y > m.title.y + m.title.h, JSON.stringify([m.ctl, m.title.y + m.title.h]));
    check(`spine ${l}: title at 141 mm, type code at 91 mm, kicker at 119.5 mm, meta row at 258 mm`, near(m.title.y, 141) && near(m.code.y, 91) && near(m.kicker.y, 119.5) && near(m.foot.y, 258), JSON.stringify([m.title.y, m.code.y, m.kicker.y, m.foot.y]));
    check(`spine ${l}: the spine is on the ${rtl ? 'right' : 'left'} edge, in the palette's deep colour`, (rtl ? near(m.spine.x, 190, 1) : near(m.spine.r, 20)) && hex(m.spine.bg) === pal['primary-deep'].toLowerCase(), JSON.stringify([m.spine.x, m.spine.r, m.spine.bg]));
    check(`spine ${l}: the document code on the spine reads (4.5:1) and is centred about 141 mm`, contrastOf(hex(m.id.color), pal['primary-deep']) >= 4.5 && near(m.id.y + m.id.h / 2, 141, 1), JSON.stringify([m.id.color, m.id.y, m.id.h]));
    check(`spine ${l}: chapter headings take the palette's primary`, hex(m.h2.color) === pal.primary.toLowerCase(), m.h2.color);
  }
  const cm = await measure(make('test-cases', 'en'), 'en', { cover: '.cover', art: '.cover svg', band: '.tb-band', th: '.wrap table:not(.control):not(.toc) th', code: '.tb-code', h1: '.cover h1' });
  check('compact: no page of its own (a title block, not 297 mm), no motif, a band, the type code chip', cm.cover.h < 80 && cm.art === null && cm.band.h > 1 && cm.code && cm.h1.y < 60, JSON.stringify([cm.cover.h, cm.h1.y]));
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
    const d = make(m, l, m === 'srs' ? { approvals: [['Prepared by', '', '', '', ''], ['Reviewed by', '', '', '', ''], ['Approved by', '', '', '', '']] } : {});
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
    check(`DOCX ${design} ${m} ${l}: no picture at all (0.19.0: no motif); no colour off the palette; no Cairo`, (wd.media || []).length === 0 && !(wd.fills || []).some((f) => !allowed.has(f)) && !wd.cairo, JSON.stringify([wd.media, (wd.fills || []).filter((f) => !allowed.has(f))]));
    if (m === 'srs') check(`DOCX spine srs ${l}: C7 the three approval rows are 12 mm tall; C11 page breaks before the contents and chapter 1`, wd.h12 === 3 && wd.breaks >= 2, JSON.stringify([wd.h12, wd.breaks]));
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
  try { exportDocx(doc, { locale, theme, docxPath }); return fs.statSync(docxPath).size > 5000; } catch (e) { check(`DOCX export ${doc.docType} ${locale} did not throw`, false, e.message); return false; }
}
