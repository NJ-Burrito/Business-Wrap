// 0.15.0 lane explain: every explanation has its own picture (editor/xpl-art.js), and every explain.* / xpl.* string lives in
// editor/ext/36-explain.i18n.json in both languages. Static (no browser): the drawing code runs against the real icons.json.
//
//   node tests/explain-art.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from '../engine/export.mjs';

const ED = path.join(REPO, 'editor');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  explain-art: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// every i18n file, and where each explain.* / xpl.* key lives
const files = [path.join(ED, 'ux-i18n.json'), path.join(ED, 'print-i18n.json'), ...fs.readdirSync(path.join(ED, 'ext')).filter((f) => f.endsWith('.i18n.json')).map((f) => path.join(ED, 'ext', f))];
const own = path.join(ED, 'ext', '36-explain.i18n.json');
const where = {}; // key -> [files]
const mine = { ar: {}, en: {} };
for (const f of files) {
  const j = readJson(f);
  for (const l of ['ar', 'en']) for (const [k, v] of Object.entries(j[l] || {})) {
    if (!/^(explain|xpl)\./.test(k)) continue;
    (where[`${l}:${k}`] ??= []).push(path.basename(f));
    if (f === own) mine[l][k] = v;
  }
}
check('36-explain.i18n.json exists with the same keys in Arabic and English', fs.existsSync(own) && JSON.stringify(Object.keys(mine.ar).sort()) === JSON.stringify(Object.keys(mine.en).sort()), `${Object.keys(mine.ar).length} ar / ${Object.keys(mine.en).length} en`);
const elsewhere = Object.entries(where).filter(([, fs_]) => fs_.some((f) => f !== '36-explain.i18n.json'));
check('no explain.* or xpl.* key is left in another i18n file (the build refuses a key defined twice)', elsewhere.length === 0, elsewhere.slice(0, 5).map(([k, v]) => `${k} in ${v.join(',')}`).join('; '));
check('every explanation text is non-empty in both languages', Object.entries(mine).every(([, m]) => Object.values(m).every((v) => typeof v === 'string' && v.trim().length >= 2)));
for (const k of ['xpl.panel', 'xpl.hint', 'xpl.close', 'xpl.open', 'xpl.more', 'xpl.less']) check(`panel word ${k} exists in AR and EN`, !!mine.ar[k] && !!mine.en[k]);
check('no explanation text uses an em dash (house rule)', ![...Object.values(mine.ar), ...Object.values(mine.en)].some((v) => v.includes('—')));

// explain ids: the JSON ones plus the ones a script adds at run time ('explain.x': '…' in ext/*.js, learning-hook.js)
const ids = new Set(Object.keys(mine.en).filter((k) => k.startsWith('explain.')).map((k) => k.slice(8)));
const scripts = [...fs.readdirSync(path.join(ED, 'ext')).filter((f) => f.endsWith('.js')).map((f) => path.join(ED, 'ext', f)), path.join(ED, 'learning-hook.js')];
for (const f of scripts) for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"]explain\.([A-Za-z0-9_.]+)['"]/g)) ids.add(m[1]);

// load the drawing code with the real icon table
const src = fs.readFileSync(path.join(ED, 'xpl-art.js'), 'utf8');
const icons = readJson(path.join(ED, 'icons.json')).icons;
const ic = (k) => (icons[k] ? icons[k].replace('<svg', `<svg data-ic="${k}"`) : '');
const lib = new Function('ic', 'uiDir', `${src}\nreturn { xplArtFor, xplArtIds, XPL_SCENES };`)(ic, () => 'rtl');
const artIds = new Set(lib.xplArtIds());
check(`XPL_ART has a drawing for every explanation id (${ids.size} ids)`, [...ids].every((i) => artIds.has(i)), [...ids].filter((i) => !artIds.has(i)).join(' '));
check('no drawing is kept for an id that has no explanation', [...artIds].every((i) => ids.has(i)), [...artIds].filter((i) => !ids.has(i)).join(' '));
check('the number of drawings equals the number of explain.* keys', artIds.size === ids.size, `${artIds.size} vs ${ids.size}`);

// every drawing is well-formed, text-free, brand-role only and shows an icon
const bad = [];
const allowedAttr = /^(class|viewBox|focusable|aria-hidden|d|x|y|cx|cy|r|rx|width|height|pathLength|style|transform|xmlns|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|data-ic|data-sw|viewbox)$/;
for (const id of ids) {
  const svg = lib.xplArtFor(id);
  const why = [];
  if (!svg.startsWith('<svg viewBox="0 0 160 96"') || !svg.endsWith('</svg>')) why.push('frame');
  if (/NaN|undefined|\[object/.test(svg)) why.push('NaN/undefined');
  if (/<text\b|<tspan\b/i.test(svg)) why.push('text inside');
  if (/#[0-9a-f]{3,8}\b/i.test(svg.slice(0, svg.indexOf('<g class="badge"')))) why.push('hard-coded colour'); // the badge icon is the brand's own artwork
  if (!/class="badge"/.test(svg) || !/data-ic=/.test(svg)) why.push('no icon badge');
  // a tag stack: every <g> and <svg> closes, shapes self-close
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-z]+)([^>]*?)(\/?)>/gi)) {
    const [, close, tag, attrs, self] = m;
    if (close) { if (stack.pop() !== tag) why.push('unbalanced'); continue; }
    if (m.index < svg.indexOf('<g class="badge"')) for (const a of attrs.matchAll(/\s([a-zA-Z:-]+)=/g)) if (!allowedAttr.test(a[1])) why.push(`attr ${a[1]}`);
    if (!self && !['svg', 'g'].includes(tag)) why.push(`open ${tag}`);
    if (!self) stack.push(tag);
  }
  if (stack.length) why.push('unclosed');
  if (/class="([^"]*)"[^>]*class="/.test(svg)) why.push('class twice');
  if (why.length) bad.push(`${id}: ${[...new Set(why)].join(',')}`);
}
check('every drawing is a well-formed 160 x 96 SVG: no text, no hard-coded colour, an icon badge, no repeated attribute', bad.length === 0, bad.slice(0, 6).join(' | '));

// drawings differ: two ids share a picture only when they are the same action under two names (listed here)
const SAME = [['hdrStart', 'chStart'], ['hdrCenter', 'chCenter'], ['hdrEnd', 'chEnd'], ['hdrDelete', 'chDelete'], ['hdrScope', 'chScope'], ['exportPdf', 'export.pdf.both'], ['saveHtml', 'export.html'], ['exportEdits', 'export.edits'], ['exportAll', 'export.editsAll'], ['export.pack', 'k_texp'], ['insTable', 'k_addTable'], ['insSection', 'k_addSection'], ['k_embed', 'k_docxFonts'], ['hideBlock', 'k_sthide'], ['pgBreak', 'pgBreakAdd'], ['fmRowAdd', 'rowAdd'], ['fmRowDel', 'rowDel'], ['fmColAdd', 'colAdd'], ['fmColDel', 'colDel'], ['history', 'learning'], ['logo', 'k_logoAdd'], ['k_close', 'k_close']];
const seen = new Map();
for (const id of ids) { const s = lib.xplArtFor(id).replace(/data-ic="[^"]*"/g, ''); (seen.get(s) ?? seen.set(s, []).get(s)).push(id); }
const dup = [...seen.values()].filter((v) => v.length > 1).filter((v) => !SAME.some((p) => v.every((x) => p.includes(x))));
check('two ids share one picture only when they are the same action under two names', dup.length === 0, dup.slice(0, 8).map((v) => v.join('=')).join(' | '));
check('a scene for every family used by the map exists', [...new Set(Object.values(Object.fromEntries(lib.xplArtIds().map((i) => [i, 1]))))].length > 0 && /XPL_MAP/.test(src) && [...src.matchAll(/^([a-z]+):/gm)].every((m) => lib.XPL_SCENES[m[1]]));
check('the old runtime fallback scenes are gone from explainers.js (xplScene / xplArt)', !/function xplScene|function xplArt\(/.test(fs.readFileSync(path.join(ED, 'explainers.js'), 'utf8')));
check('the anti-spam memory is gone (no xplSeen, xplMark, bw:xpl-seen, once/always modes)', !/xplSeen|xplMark|xpl-seen|xplMode/.test(fs.readFileSync(path.join(ED, 'explainers.js'), 'utf8')));

console.log(results.join('\n'));
console.log(failed ? `\nexplain-art: ${failed} FAILED` : `\nexplain-art: all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
