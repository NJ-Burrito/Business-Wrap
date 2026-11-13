// (lane P1) · the running header and footer mirror in Arabic, and a user-manual step stays whole.
//   1. chrome, in the markup: the stock band (no doc.chrome) gets dir=rtl in Arabic only (English is byte-identical to before: no dir attribute);
//      chromeDefaults has the same logical slots in both languages (start/end flip with the direction); folioOf puts the Arabic folio at the left.
//   2. chrome, in the PDF: one PDF per language of a typed document (user manual) and of the legacy untyped SRS sample, read back with poppler's
//      `pdftotext -enc UTF-8 -bbox`. English (the baseline, unchanged since 0.18.0): the confidentiality mark at the left margin, the folio and the date
//      at the right margin. Arabic: the mirror image: the mark at the RIGHT margin, the folio and the date at the LEFT margin; the document code
//      stays in the centre. Margins are 16 mm (the band's padding): the side is the assertion, the 16 mm only proves it sits at the margin.
//   3. the user manual (en + ar): every step's heading and its screenshot frame are on the same page; the page count grows by at most two.
//   node tests/run.mjs rtl-chrome-0181
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, exportPdf, loadTheme, i18n } from '../engine/export.mjs';
import { suite, launchChrome } from './_harness.mjs';
import { config } from '../engine/config.mjs';
import { chromeTemplates, chromeDefaults, folioOf } from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-rtlchrome-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
const S = suite('rtl-chrome-0181'); const { check } = S;
const theme = loadTheme();
const MM = 72 / 25.4;
const MARGIN = 16 * MM; // the band's padding (engine/render.mjs chromeTemplates)
const TOL = 1.2; // pt

// poppler's pdftotext (the xpdf one that ships with Git for Windows has no -bbox): the configured folder, else the first on PATH that says "poppler"
function popplerText() {
  const cands = [];
  const dir = config().poppler;
  if (dir) cands.push(path.join(dir, 'pdftotext'), path.join(dir, 'pdftotext.exe'));
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', process.platform === 'win32' ? ['pdftotext'] : ['-a', 'pdftotext'], { encoding: 'utf8' }).stdout || '';
  cands.push(...where.split(/\r?\n/).map((x) => x.trim()).filter(Boolean), 'pdftotext');
  for (const c of cands) {
    const v = spawnSync(c, ['-v'], { encoding: 'utf8' });
    if (/poppler/i.test(`${v.stderr || ''}${v.stdout || ''}`)) return c;
  }
  return '';
}
const PDFTOTEXT = popplerText();
check('poppler pdftotext is available', !!PDFTOTEXT, 'set BW_POPPLER to the poppler bin folder');
const pdftotext = (args) => spawnSync(PDFTOTEXT, args, { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
const pageCount = (pdf) => (pdftotext(['-enc', 'UTF-8', '-bbox', pdf, '-']).match(/<page /g) || []).length;
/** The words of one page: [{x0, y0, x1, y1, t}] and the page's width in pt. */
function words(pdf, n) {
  const out = pdftotext(['-enc', 'UTF-8', '-bbox', '-f', String(n), '-l', String(n), pdf, '-']);
  const w = +/<page width="([\d.]+)"/.exec(out)?.[1];
  const h = +/<page width="[\d.]+" height="([\d.]+)"/.exec(out)?.[1];
  const ws = [...out.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map((m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], t: m[5] }));
  return { w, h, ws };
}
const rowOf = (pg, band) => pg.ws.filter((x) => (band === 'foot' ? x.y0 > pg.h - 16 * MM : x.y1 < 20 * MM)).sort((a, b) => a.x0 - b.x0);
const near = (a, b) => Math.abs(a - b) <= TOL;
const DATE = /^(\d{4}|YYYY)-/;

const SAMPLES = (ed) => ({
  'user manual (typed)': DT.compose('user-manual', ed),
  'SRS sample (legacy, untyped)': JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${ed}.json`), 'utf8')),
});

// ── 1. the markup ──────────────────────────────────────────────────────────
{
  const sample = (ed) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${ed}.json`), 'utf8'));
  const t = {};
  for (const ed of ['en', 'ar']) t[ed] = chromeTemplates(sample(ed), { theme, labels: i18n().doc[ed], locale: ed, fontCss: '', logos: theme.logos });
  check('en: the stock header and footer carry no dir attribute (byte-identical to 0.18.0)', !/\sdir=/.test(t.en.header) && !/\sdir=/.test(t.en.footer));
  check('ar: the stock header and footer carry dir="rtl", so the three slots mirror', /<div dir="rtl" style=/.test(t.ar.header) && /<div dir="rtl" style=/.test(t.ar.footer));
  check('chromeDefaults: the same logical slots in both languages (start/end mirror with the direction)', JSON.stringify(chromeDefaults('ar')) === JSON.stringify(chromeDefaults('en')));
  const slot = (part, id) => chromeDefaults('ar')[part].items.find((x) => x.id === id).align;
  check('chromeDefaults: the confidentiality mark and the logo sit at the start, the folio and the date at the end', slot('footer', 'f-conf') === 'start' && slot('header', 'h-logo') === 'start' && slot('footer', 'f-page') === 'end' && slot('header', 'h-date') === 'end');
  check('folioOf: the stock folio is at the right in English and at the left in Arabic', folioOf({}, 'en').side === 'right' && folioOf({}, 'ar').side === 'left');
  const own = { ...sample('ar'), chrome: chromeDefaults('ar') };
  check('folioOf: Arabic running items put the end-slot folio at the left', folioOf(own, 'ar').side === 'left' && folioOf({ ...sample('en'), chrome: chromeDefaults('en') }, 'en').side === 'right');
}

// ── 2 + 3. the PDFs ─────────────────────────────────────────────────────────
const browser = await launchChrome(['--bw-session=bw-1109']);
try {
  process.env.BW_FONT_NORM_DIR = path.join(tmp, 'norm');
  const pdfs = {};
  for (const ed of ['en', 'ar']) {
    for (const [name, doc] of Object.entries(SAMPLES(ed))) {
      const f = path.join(tmp, `${name.split(' ')[0]}-${name.includes('legacy') ? 'srs' : 'typed'}.${ed}.pdf`);
      await exportPdf(doc, { locale: ed, theme, pdfPath: f, browser });
      pdfs[`${name} ${ed}`] = f;
    }
  }
  for (const ed of ['en', 'ar']) {
    for (const name of Object.keys(SAMPLES(ed))) {
      const pdf = pdfs[`${name} ${ed}`];
      const n = pageCount(pdf);
      const rtl = ed === 'ar';
      let bad = [];
      for (let p = 2; p <= n; p += 1) {
        const pg = words(pdf, p);
        const foot = rowOf(pg, 'foot');
        const head = rowOf(pg, 'head');
        // the footer row: the folio (the only number) and the confidentiality mark (the rest) are at opposite margins; the mark is on the start side
        const num = foot.filter((x) => /^\d+$/.test(x.t));
        const rest = foot.filter((x) => !/^\d+$/.test(x.t));
        if (num.length !== 1 || !rest.length) { bad.push(`p${p}: footer words ${foot.map((x) => x.t).join('|')}`); continue; }
        const folio = num[0];
        const leftEdge = Math.min(...rest.map((x) => x.x0)), rightEdge = Math.max(...rest.map((x) => x.x1));
        if (rtl) {
          if (!(near(folio.x0, MARGIN) && near(rightEdge, pg.w - MARGIN) && folio.x1 < leftEdge)) bad.push(`p${p}: ar folio ${folio.x0.toFixed(1)}..${folio.x1.toFixed(1)} mark ${leftEdge.toFixed(1)}..${rightEdge.toFixed(1)}`);
        } else if (!(near(folio.x1, pg.w - MARGIN) && near(leftEdge, MARGIN) && folio.x0 > rightEdge)) bad.push(`p${p}: en folio ${folio.x0.toFixed(1)}..${folio.x1.toFixed(1)} mark ${leftEdge.toFixed(1)}..${rightEdge.toFixed(1)}`);
        // the header row: the date at the end margin, the document code in the middle
        const date = head.find((x) => DATE.test(x.t));
        const code = head.filter((x) => x !== date && !/^\d+$/.test(x.t));
        const mid = code.length ? (Math.min(...code.map((x) => x.x0)) + Math.max(...code.map((x) => x.x1))) / 2 : -1;
        if (!date || Math.abs(mid - pg.w / 2) > 30 * MM) { bad.push(`p${p}: header words ${head.map((x) => x.t).join('|')}`); continue; }
        if (rtl ? !near(date.x0, MARGIN) : !near(date.x1, pg.w - MARGIN)) bad.push(`p${p}: ${ed} date ${date.x0.toFixed(1)}..${date.x1.toFixed(1)}`);
      }
      check(`${name} ${ed}: on every body page (2..${n}) the ${rtl ? 'confidentiality mark is at the right margin, the folio and the date at the left' : 'confidentiality mark is at the left margin, the folio and the date at the right'}, the code in the middle`, n >= 3 && bad.length === 0, bad.slice(0, 3).join(' ; '));
    }
  }

  // the manual's steps: heading and screenshot frame on one page (the last frame used to land alone at the top of the next page)
  const norm = (s) => s.replace(/[‎‏‪-‮⁦-⁩]/g, '');
  for (const ed of ['en', 'ar']) {
    const pdf = pdfs[`user manual (typed) ${ed}`];
    const n = pageCount(pdf);
    const steps = {}, shots = {};
    for (let p = 1; p <= n; p += 1) {
      for (const line of norm(pdftotext(['-enc', 'UTF-8', '-f', String(p), '-l', String(p), pdf, '-'])).split(/\r?\n/)) {
        const hs = (ed === 'ar' ? /^\s*الخطوة\D*(\d)/ : /^\s*Step\s*(\d)\b/).exec(line);
        const sh = (ed === 'ar' ? /^\s*لقطة\D*(\d)/ : /^\s*Screenshot\s*(\d)\b/).exec(line);
        if (hs) (steps[hs[1]] ||= []).push(p);
        if (sh) (shots[sh[1]] ||= []).push(p);
      }
    }
    const nums = Object.keys(steps);
    check(`user manual ${ed}: five step headings and five screenshot frames found, each once`, nums.length === 5 && Object.keys(shots).length === 5 && [...Object.values(steps), ...Object.values(shots)].every((a) => a.length === 1), JSON.stringify({ steps, shots }));
    const apart = nums.filter((k) => steps[k]?.[0] !== shots[k]?.[0]);
    check(`user manual ${ed}: each step frame is on its step heading's page (apart: ${apart.join(',') || 'none'})`, nums.length === 5 && apart.length === 0, JSON.stringify({ steps, shots }));
    check(`user manual ${ed}: keeping the steps whole costs at most two pages (12 before, now ${n})`, n <= 14, String(n));
  }
} catch (e) {
  check('suite ran without an exception', false, (e && e.stack) || e);
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(tmp, { recursive: true, force: true });
}
S.finish();
