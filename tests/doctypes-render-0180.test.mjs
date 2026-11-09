// 0.18.0 (document studio) · lane L8, render gate: every registry type x ar/en composes and renders through the real engine (no browser, no server).
//   per type and edition (the type list is read from the registry, never typed here):
//   1. compose + renderDocument return a full page: lang/dir right (ar = rtl, en = ltr), the document's own title in <title>
//   2. exactly one `.cover` carrying data-cover = the type's coverDesign and data-motif = its motif (= the id), and the type's palette on the document
//   3. every chapter heading of the model is in the markup (data-p="/chapters/N/title", the text equal)
//   4. no "undefined" / "NaN" / "[object" anywhere in the markup (data attributes, text, CSS)
//   5. no empty table: every table block has columns, every <table> in the markup has at least one cell; every table block is drawn
//   6. the language is right: the Arabic edition's headings carry Arabic letters, the English edition's do not
//   node tests/run.mjs doctypes-render-0180
import './_isolate.mjs';
import { loadTheme, i18n } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';
import * as DT from '../engine/doctypes.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'}  doctypes-render-0180: ${name}${detail && !ok ? '  | ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`;
  results.push(line);
  if (!ok) failed += 1;
};
process.on('uncaughtException', (e) => { console.log(results.join('\n')); console.error('CRASH: ' + String(e.stack || e.message).split('\n').slice(0, 4).join(' / ')); process.exit(1); });

const theme = loadTheme();
const labels = i18n().doc;
const types = DT.listTypes();
const ARABIC = /[؀-ۿ]/;
const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const unesc = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const plain = (s) => unesc(String(s).replace(/<[^>]*>/g, '')).replace(BIDI, '').replace(/\s+/g, ' ').trim();
const blocksOf = (doc) => doc.chapters.flatMap((c, ci) => (c.sections || []).flatMap((s) => (s.blocks || []).map((b) => ({ b, ci }))));

// the registry itself: 17 types are the 0.18.0 promise, and the first look must have seen them (R15)
check(`the registry lists the 17 types of 0.18.0 (${types.length})`, types.length === 17, types.map((t) => t.id).join());
check('every type has a unique id and a cover design of the two designs', new Set(types.map((t) => t.id)).size === types.length && types.every((t) => DT.COVER_DESIGNS.includes(t.coverDesign || 'spine')));

for (const t of types) {
  for (const ed of DT.EDITIONS) {
    const tag = `${t.id} ${ed}`;
    let doc, html;
    try {
      doc = DT.compose(t.id, ed);
      html = renderDocument(doc, { locale: ed, labels: labels[ed], theme, fontCss: '', logos: theme.logos });
    } catch (e) { check(`${tag}: compose and render do not throw`, false, e.stack || e.message); continue; }
    check(`${tag}: compose + render give a page, ${ed === 'ar' ? 'rtl' : 'ltr'}, titled with the document's own title`,
      html.startsWith('<!doctype html>') && html.includes(`<html lang="${ed}" dir="${ed === 'ar' ? 'rtl' : 'ltr'}">`) && plain(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '') === plain(doc.control.title) && doc.control.title.length > 2, doc.control.title);
    const covers = html.match(/<div class="cover"[^>]*>/g) || [];
    const want = DT.COVER_DESIGNS.includes(t.coverDesign) ? t.coverDesign : 'spine';
    check(`${tag}: one cover, data-cover=${want}, data-motif=${t.motif || t.id}`, covers.length === 1 && covers[0].includes(`data-cover="${want}"`) && covers[0].includes(`data-motif="${t.motif || t.id}"`) && (t.motif || t.id) === t.id, covers.join(' '));
    check(`${tag}: the composed document carries its docType, cover design, motif and the palette's primary`, doc.docType === t.id && doc.service === t.id && doc.coverDesign === want && doc.motif === (t.motif || t.id) && /^#[0-9a-f]{6}$/i.test(doc.design?.vars?.primary || ''), JSON.stringify([doc.docType, doc.service, doc.coverDesign, doc.motif, doc.design?.vars?.primary]));
    const heads = new Map([...html.matchAll(/<span data-p="\/chapters\/(\d+)\/title">([\s\S]*?)<\/span>/g)].map((m) => [+m[1], plain(m[2])]));
    const missing = doc.chapters.map((c, i) => [i, c.title]).filter(([i, ti]) => !ti || heads.get(i) !== plain(ti));
    check(`${tag}: all ${doc.chapters.length} chapter headings are in the markup`, doc.chapters.length >= 1 && missing.length === 0, JSON.stringify(missing.slice(0, 3)));
    const bad = html.match(/.{0,40}(undefined|NaN|\[object).{0,40}/g) || [];
    check(`${tag}: no "undefined", "NaN" or "[object" in the markup`, bad.length === 0, bad.slice(0, 2).join(' | '));
    const tables = blocksOf(doc).filter(({ b }) => b.kind === 'table');
    // a table is headed by its columns, or (a key/value table: columns []) by the label in the first cell of every row; never both missing
    const noHead = tables.filter(({ b }) => !Array.isArray(b.columns) || !Array.isArray(b.rows) || (b.columns.length ? b.columns.some((c) => !String(c).trim()) : !b.rows.length || b.rows.some((r) => !String(r?.[0] ?? '').trim())));
    const empty = (html.match(/<table[\s\S]*?<\/table>/g) || []).filter((x) => !/<t[dh][\s>]/.test(x));
    const drawn = (html.match(/<table[^>]*data-b="\/chapters\/\d+\/sections\/\d+\/blocks\/\d+"/g) || []).length;
    check(`${tag}: ${tables.length} table blocks, each with a header row, each drawn, none empty`, noHead.length === 0 && empty.length === 0 && drawn >= tables.length, JSON.stringify({ noHead: noHead.length, empty: empty.length, drawn, tables: tables.length }));
    const titles = doc.chapters.map((c) => c.title).join(' ');
    check(`${tag}: the chapter headings are in ${ed === 'ar' ? 'Arabic' : 'English'} script`, ed === 'ar' ? ARABIC.test(titles) : !ARABIC.test(titles) && /[A-Za-z]/.test(titles), titles.slice(0, 80));
  }
}

console.log(results.join('\n'));
console.log(failed ? `\n${failed} FAILED` : `\ndoctypes-render-0180: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
