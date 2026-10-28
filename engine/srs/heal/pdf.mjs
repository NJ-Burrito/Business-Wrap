// Healers that read the EXPORTED PDF (poppler): page fill and stranded headings, fonts actually embedded,
// and the named corrections as the reader will see them. Run on every export by engine/srs/cli.mjs.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { popplerBin, pdfText } from '../../harvest/previous.mjs';
import { fold, pick } from '../model.mjs';

/** Per page: size and the words' boxes, from `pdftotext -bbox`. */
export function pageBoxes(pdf) {
  const r = spawnSync(popplerBin('pdftotext'), ['-enc', 'UTF-8', '-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 128 << 20 });
  if (r.status !== 0) throw new Error(`pdftotext -bbox failed: ${r.stderr || r.error?.message}`);
  return [...r.stdout.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)].map(([, w, h, body]) => ({
    w: +w, h: +h,
    words: [...body.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">/g)].map(([, a, b, c, d]) => ({ x0: +a, y0: +b, x1: +c, y1: +d })),
  }));
}

/** Fill of each portrait page against the body area every page shares; cover, last page, landscape sheets and the page before one are excluded. */
export function pageFill(pages, { report = 0.8, floor = 0.4 } = {}) {
  const portrait = pages.filter((p) => p.h >= p.w && p.words.length);
  if (!portrait.length) return { pages: [], low: [], fail: [], stranded: [] };
  const top = Math.min(...portrait.map((p) => Math.min(...p.words.map((w) => w.y0))));
  const bottom = Math.max(...portrait.map((p) => Math.max(...p.words.map((w) => w.y1))));
  const heights = portrait.flatMap((p) => p.words.map((w) => w.y1 - w.y0)).sort((a, b) => a - b);
  const body = heights[Math.floor(heights.length / 2)] || 10;
  const res = []; const stranded = [];
  pages.forEach((p, i) => {
    const skip = i === 0 || i === pages.length - 1 || p.w > p.h || (pages[i + 1] && pages[i + 1].w > pages[i + 1].h) || !p.words.length;
    if (skip) return;
    const maxY = Math.max(...p.words.map((w) => w.y1));
    res.push({ page: i + 1, fill: Math.max(0, Math.min(1, (maxY - top) / (bottom - top))) });
    // the last line of the page: a heading (taller than body text) with nothing under it on this page
    const lastY = Math.max(...p.words.map((w) => w.y0));
    const last = p.words.filter((w) => Math.abs(w.y0 - lastY) < 2);
    if (last.length && Math.min(...last.map((w) => w.y1 - w.y0)) > body * 1.25 && maxY < bottom - body) stranded.push(i + 1);
  });
  return { pages: res, low: res.filter((x) => x.fill < report), fail: res.filter((x) => x.fill < floor), stranded };
}

const FALLBACK = /arial|segoe|times|tahoma|calibri|dejavu|liberation|helvetica|courier|verdana/i;
export function fontAudit(pdf, { allow = [] } = {}) {
  const r = spawnSync(popplerBin('pdffonts'), [pdf], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`pdffonts failed: ${r.stderr || r.error?.message}`);
  const rows = r.stdout.split(/\r?\n/).slice(2).filter(Boolean);
  const type3 = rows.filter((l) => /Type 3/.test(l));
  const fallback = rows.filter((l) => FALLBACK.test(l.split(/\s+/)[0]) && !allow.some((a) => l.includes(a)));
  return { rows: rows.length, type3: type3.length, fallback: fallback.map((l) => l.split(/\s+/)[0]) };
}

/** Each correction as printed: its expected text present, its stale text gone (folded, whitespace-free). */
export function correctionsInPdf(pdf, corrections, locale) {
  const txt = fold(pdfText(pdf)).replace(/\s+/g, '');
  const has = (s) => txt.includes(fold(s).replace(/\s+/g, ''));
  return (corrections || []).filter((c) => !c.locale || c.locale === locale).map((c) => {
    const exp = pick(c.expect, locale) || pick(c.replace, locale);
    const stale = pick(c.stale, locale) || pick(c.find, locale);
    const landed = !exp || has(exp);
    const gone = !stale || !has(stale) || (exp && fold(exp).includes(fold(stale)));
    return { id: c.id, landed, gone };
  });
}

export function healPdf(files, { corrections = [], profile = {} } = {}) {
  const results = [];
  for (const { pdf, locale } of files) {
    if (!fs.existsSync(pdf)) continue;
    try {
      const f = pageFill(pageBoxes(pdf), profile.pageFill || {});
      const bad = [...f.fail.map((x) => `p${x.page} ${Math.round(x.fill * 100)}%`)];
      results.push({ id: 'page-fill', gap: 'C-pagefill', status: bad.length || f.stranded.length ? 'FAIL' : f.low.length ? 'WARN' : 'PASS', detail: `${locale}: ${f.pages.length} page(s) measured; under 80%: ${f.low.map((x) => `p${x.page} ${Math.round(x.fill * 100)}%`).join(', ') || 'none'}${bad.length ? `; under the 40% floor: ${bad.join(', ')}` : ''}${f.stranded.length ? `; heading stranded at the foot of p${f.stranded.join(', p')}` : ''}` });
    } catch (e) { results.push({ id: 'page-fill', gap: 'C-pagefill', status: 'FAIL', detail: `${locale}: ${e.message}` }); }
    try {
      const a = fontAudit(pdf, { allow: profile.fontsAllow || [] });
      results.push({ id: 'font-coverage', gap: 'C-fonts', status: a.type3 || a.fallback.length ? 'FAIL' : 'PASS', detail: `${locale}: ${a.rows} font(s), Type 3 ${a.type3}${a.fallback.length ? `, fallback faces: ${[...new Set(a.fallback)].join(', ')}` : ''}` });
    } catch (e) { results.push({ id: 'font-coverage', gap: 'C-fonts', status: 'FAIL', detail: `${locale}: ${e.message}` }); }
    if (corrections.length) {
      try {
        const c = correctionsInPdf(pdf, corrections, locale);
        const bad = c.filter((x) => !x.landed || !x.gone);
        results.push({ id: 'corrections-landed', gap: 'C-clientfixes', status: bad.length ? 'FAIL' : 'PASS', detail: `${locale}: ${c.length - bad.length} of ${c.length} correction(s) landed in the PDF${bad.length ? `; not landed: ${bad.map((x) => x.id).join(', ')}` : ''}` });
      } catch (e) { results.push({ id: 'corrections-landed', gap: 'C-clientfixes', status: 'FAIL', detail: `${locale}: ${e.message}` }); }
    }
  }
  return results;
}
