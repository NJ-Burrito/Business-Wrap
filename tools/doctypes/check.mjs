// 0.18.0 · document studio: the validator of templates/_doctypes (lane L0).
//
//   node tools/doctypes/check.mjs                 every type folder, the shared files (categories, palettes, schema) and all art
//   node tools/doctypes/check.mjs tot minutes     only these ids (+ the shared files); a missing id is an error
//   node tools/doctypes/check.mjs --write-palettes   recompute templates/_doctypes/_palettes.json from palette/tokens.json
// Exit 0 = clean, 1 = findings. It prints rule, file and line numbers, never the text that matched.
//
// Per type: type.json against schema.json, the AR/EN pair has the same shape (architecture §1.3), only the block kinds the
// renderers handle, forbidden keys and patterns (the same rules as security/gitleaks.toml plus the hashed client-name
// denylist), control/labels/title/id wording, size budget (14 KB per edition minified, 400 KB all together), SVG art rules.
// The shared checks recompute every palette value from the brand ramps (R16: numbers come from the source, never typed)
// and fail below the contrast floors.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REPO, ROLES, EDITIONS, BLOCK_KINDS, ID_RE, categories, palettes, compose } from '../../engine/doctypes.mjs';
import { safeSvg } from '../../engine/render.mjs';

export const LIMITS = { editionBytes: 14 * 1024, totalBytes: 400 * 1024, svgBytes: 6 * 1024, svgViewBox: '0 0 120 170', contrast: 4.5, graphic: 3 };
const CONTROL_KEYS = ['documentId', 'title', 'preparedBy', 'documentType', 'classification', 'owner', 'issuedOn', 'version', 'status', 'reviewCycle'];
const TOP_KEYS = ['composedAt', 'control', 'revisions', 'chapters', 'labels', 'openQuestions', 'controlTable', 'chrome', 'layout'];
const FORBIDDEN_TOP = ['design', 'coverDesign', 'docType', 'service', 'motif'];
const dirOf = (o) => path.join(o?.root || REPO, 'templates', '_doctypes');
const rootOf = (o) => o?.root || REPO;
const rd = (f) => fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
const rdJson = (f) => JSON.parse(rd(f));
const bytes = (s) => Buffer.byteLength(s, 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ───────── colour maths (WCAG 2.x) ───────── */
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (h) => { const [r, g, b] = hx(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const mix = (a, b, t) => '#' + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

/* ───────── palettes: every value derived from palette/tokens.json (the brand ramps) ───────── */
const PALETTE_NAMES = { navy: 'Navy (brand): requirements, start', forest: 'Forest (success ramp): testing', gold: 'Gold (accent ramp): delivery', slate: 'Slate (neutral ramp): governance', rust: 'Rust (diagram rework line): training' };
/**
 * The five palettes (decisions.md D2). A recipe is [ramp, step] (a step of a ramp), ['mix', recipe, '#base', share] (that
 * much of #base mixed in) or ['hex', 'color.diagram.rework-line'] (a named token). Navy equals design/ours/theme.json `vars`.
 */
export function derivePalettes(o) {
  const f = path.join(rootOf(o), 'palette', 'tokens.json');
  if (!fs.existsSync(f)) return null;
  const tokens = rdJson(f);
  const t = tokens.color;
  const ramp = (r, s) => { const v = t.ramp?.[r]?.[s]?.$value?.hex; if (!v) throw new Error(`palette/tokens.json has no ramp ${r}.${s}`); return v; };
  const tok = (name) => { const v = name.split('.').reduce((n, k) => n?.[k], tokens)?.$value?.hex; if (!v) throw new Error(`palette/tokens.json has no ${name}`); return v; };
  const ev = (rc) => {
    if (rc[0] === 'mix') { const b = ev(rc[1]); return { hex: mix(b.hex, rc[2], rc[3]), from: `mix(${b.from}, ${rc[2]}, ${rc[3]})` }; }
    if (rc[0] === 'hex') return { hex: tok(rc[1]), from: rc[1] };
    return { hex: ramp(rc[0], rc[1]), from: `ramp.${rc[0]}.${rc[1]}` };
  };
  const gold = { accent: ['accent', '800'], 'accent-rule': ['accent', '600'], 'accent-bright': ['accent', '500'] }; // the constant gold trio of every cover
  const rust = ['hex', 'color.diagram.rework-line'];
  const RECIPES = {
    navy: { primary: ['primary', '800'], 'primary-deep': ['primary', '950'], 'primary-50': ['primary', '50'], 'primary-100': ['primary', '100'], ...gold },
    forest: { primary: ['success', '700'], 'primary-deep': ['mix', ['success', '700'], '#000000', 0.5], 'primary-50': ['success', '50'], 'primary-100': ['success', '100'], ...gold },
    gold: { primary: ['accent', '700'], 'primary-deep': ['accent', '800'], 'primary-50': ['accent', '50'], 'primary-100': ['accent', '100'], ...gold },
    slate: { primary: ['neutral', '800'], 'primary-deep': ['neutral', '900'], 'primary-50': ['neutral', '100'], 'primary-100': ['neutral', '200'], ...gold },
    rust: { primary: rust, 'primary-deep': ['mix', rust, '#000000', 0.5], 'primary-50': ['mix', rust, '#ffffff', 0.95], 'primary-100': ['mix', rust, '#ffffff', 0.9], ...gold },
  };
  const out = {};
  for (const [id, rec] of Object.entries(RECIPES)) {
    out[id] = {};
    const from = {};
    for (const r of ROLES) { const v = ev(rec[r]); out[id][r] = v.hex; from[r] = v.from; }
    out[id].$from = from;
  }
  return out;
}
const paperOf = (o) => rdJson(path.join(rootOf(o), 'palette', 'tokens.json')).color.ramp.neutral['50'].$value.hex;
const paleGoldOf = (o) => rdJson(path.join(rootOf(o), 'palette', 'tokens.json')).color.ramp.accent['200'].$value.hex; // the spine code's second choice (render.mjs spineCodeColor)

export function writePalettes(o) {
  const d = derivePalettes(o);
  if (!d) throw new Error('palette/tokens.json not found');
  const out = { $comment: 'Computed by `node tools/doctypes/check.mjs --write-palettes` from palette/tokens.json (decisions.md D2). Never typed by hand: the validator recomputes every value and fails on a difference. "$from" says where each value comes from.' };
  for (const [id, p] of Object.entries(d)) out[id] = p;
  fs.writeFileSync(path.join(dirOf(o), '_palettes.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

/* ───────── a small JSON-Schema validator (type, enum, pattern, length, range, required, properties, additionalProperties, items, uniqueItems, $ref) ───────── */
export function validateSchema(schema, value, root = schema, at = '') {
  const errs = [];
  const bad = (m) => errs.push(`${at || '(root)'}: ${m}`);
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((n, k) => n?.[k], root);
    if (!target) { bad(`unresolved ${schema.$ref}`); return errs; }
    errs.push(...validateSchema(target, value, root, at));
  }
  const isObj = value && typeof value === 'object' && !Array.isArray(value);
  const typeOk = { object: isObj, array: Array.isArray(value), string: typeof value === 'string', integer: Number.isInteger(value), number: typeof value === 'number', boolean: typeof value === 'boolean' };
  if (schema.type && !typeOk[schema.type]) { bad(`must be ${schema.type}`); return errs; }
  if (schema.enum && !schema.enum.includes(value)) bad(`must be one of ${schema.enum.join(' | ')}`);
  if (typeof value === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) bad(`must match ${schema.pattern}`);
    if (schema.minLength !== undefined && value.length < schema.minLength) bad(`shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) bad(`longer than ${schema.maxLength}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) bad(`below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) bad(`above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) bad('items must be unique');
    if (schema.items) value.forEach((x, i) => errs.push(...validateSchema(schema.items, x, root, `${at}[${i}]`)));
  }
  if (isObj) {
    for (const k of schema.required || []) if (!(k in value)) bad(`missing «${k}»`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...validateSchema(props[k], v, root, at ? `${at}.${k}` : k));
      else if (schema.additionalProperties === false) bad(`unknown key «${k}»`);
    }
  }
  return errs;
}

/* ───────── forbidden patterns: the repo's own security rules (security/gitleaks.toml) plus the hashed denylist ───────── */
const PATTERNS = [
  ['bw-password-assignment', /(password|passwd|pwd|passphrase|\bpin\b|كلمة المرور|كلمة السر|الرقم السري)\s*[:=]\s*\S{3,}/i],
  ['bw-generic-api-key', /(api[_-]?key|secret|access[_-]?token|auth[_-]?token|bearer)\s*[:=]?\s*['"]?[A-Za-z0-9_\-.]{20,}/i],
  ['bw-sk-key', /\bsk-(ant-)?[A-Za-z0-9_-]{24,}/],
  ['bw-private-key', /-----BEGIN ([A-Z]+ )*PRIVATE KEY-----/],
  ['bw-staging-host', /\b[a-z0-9-]*(staging|stage|uat|preprod|internal)[a-z0-9-]*\.[a-z0-9.-]+\.[a-z]{2,}\b/i],
  ['bw-email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, [/@example\.(com|org|net)$/, /^noreply@/, /^git@github\.com$/]],
  ['bw-jo-national-id', /\b[29][0-9]{9}\b/, [/^2147483000$/]],
  ['bw-jo-phone', /(\+?962[\s-]?|\b0)7[789][\s-]?[0-9]{3}[\s-]?[0-9]{4}\b/],
  ['bw-local-path', /([a-z]:[\\/]+users[\\/]+[^\\/\s"'<>]+|\/c\/users\/[^/\s"'<>]+|\/Users\/[A-Za-z][^/\s"'<>]*\/|\/home\/[a-z][^/\s"'<>]*\/)/i],
];
const normTerm = (text) => text.normalize('NFKC').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
export const termHash = (term) => crypto.createHash('sha256').update((normTerm(term).match(/[\p{L}\p{N}_]+/gu) || []).join(' ')).digest('hex');
let DENY = null;
function denylist(o) {
  if (DENY && DENY.root === rootOf(o)) return DENY;
  const f = path.join(rootOf(o), 'security', 'denylist.sha256');
  const hashes = new Map();
  let longest = 1;
  if (fs.existsSync(f)) for (const line of rd(f).split(/\r?\n/)) { const s = line.trim(); if (s && !s.startsWith('#')) { const [h, n] = s.split(/\s+/); hashes.set(h, +n); longest = Math.max(longest, +n); } }
  DENY = { root: rootOf(o), hashes, longest };
  return DENY;
}
/** Findings of one text: [{rule, line}] (no matched text, ever). */
export function scanText(text, o) {
  const out = [];
  const d = denylist(o);
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [rule, re, allow = []] of PATTERNS) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      for (const m of line.matchAll(g)) if (!allow.some((a) => a.test(m[0]))) { out.push({ rule, line: i + 1 }); break; }
    }
    if (d.hashes.size) {
      const words = normTerm(line).match(/[\p{L}\p{N}_]+/gu) || [];
      let hit = false;
      for (let n = 1; n <= d.longest && !hit; n++) for (let s = 0; s + n <= words.length; s++) if (d.hashes.has(crypto.createHash('sha256').update(words.slice(s, s + n).join(' ')).digest('hex'))) { hit = true; break; }
      if (hit) out.push({ rule: 'bw-denylist', line: i + 1 });
    }
  });
  return out;
}

/* ───────── SVG art (L7): flat, language-neutral, no text, no external reference ───────── */
export function checkSvg(svg) {
  const e = [];
  if (bytes(svg) > LIMITS.svgBytes) e.push(`larger than ${kb(LIMITS.svgBytes)} (${kb(bytes(svg))})`);
  if (!/^<svg[\s>]/.test(svg.trim()) || !/<\/svg>\s*$/.test(svg)) e.push('must be one <svg>…</svg> element');
  { const m = svg.match(/viewBox\s*=\s*["']0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)["']/); if (!m || !(+m[2] > +m[1] || Math.abs(+m[1] / +m[2] - 297 / 210) < 0.05)) e.push('viewBox must be a page "0 0 W H": portrait (H > W) or an A4 landscape sheet (W : H about 297 : 210, the types that print landscape)'); }
  for (const [re, why] of [
    [/<text[\s>]|<tspan[\s>]|<textPath[\s>]/i, 'no <text> (the thumbnail carries no words)'],
    [/<image[\s>]/i, 'no <image>'], [/<script|<foreignObject|<iframe|<object|<embed|<audio|<video/i, 'no script, foreignObject or embedded content'],
    [/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i, 'no DOCTYPE, ENTITY or stylesheet instruction'],
    [/@import/i, 'no @import'], [/\son[a-z]+\s*=/i, 'no event handlers'], [/javascript:|data:/i, 'no javascript: or data: URI'],
    [/\bfont(-[a-z]+)?\s*[=:]/i, 'no font (no text, no font)'],
  ]) if (re.test(svg)) e.push(why);
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!m[1].startsWith('#')) e.push('external href (only #fragment references are allowed)');
  for (const m of svg.matchAll(/url\(\s*["']?([^)"']*)/gi)) if (!m[1].startsWith('#')) e.push('external url() (only url(#id) is allowed)');
  if (safeSvg(svg) !== svg) e.push('safeSvg() would change it (script, handler or foreignObject)');
  return [...new Set(e)];
}

/* ───────── the shape of a starter document, for the AR/EN pair rule (architecture §1.3) ───────── */
const blockShape = (b) => {
  const s = { k: b?.kind };
  if (b?.kind === 'table') Object.assign(s, { cols: (b.columns || []).length, rows: (b.rows || []).length, widths: (b.rows || []).map((r) => (Array.isArray(r) ? r.length : -1)), merges: (b.merges || []).length });
  if (b?.kind === 'diagram') Object.assign(s, { nodes: (b.model?.nodes || []).map((n) => n.id), edges: (b.model?.edges || []).map((x) => x.id) });
  if (b?.kind === 'stories') s.items = (b.items || []).length;
  if (b?.kind === 'shots') s.images = (b.images || []).length;
  if (b?.layout?.page) s.page = b.layout.page;
  return s;
};
export function shapeOf(doc) {
  return {
    control: Object.keys(doc.control || {}),
    revisions: (doc.revisions || []).map((r) => (Array.isArray(r) ? r.length : -1)),
    labels: Object.keys(doc.labels || {}).sort(),
    controlTable: doc.controlTable ? { cols: (doc.controlTable.columns || []).length, rows: (doc.controlTable.rows || []).length } : null,
    layout: doc.layout || null,
    chapters: (doc.chapters || []).map((c) => ({ blocks: (c.blocks || []).map(blockShape), sections: (c.sections || []).map((s) => (s.blocks || []).map(blockShape)) })),
    openQuestions: (doc.openQuestions || []).length,
  };
}
/** Where two shapes differ: up to `max` readable paths. */
export function shapeDiff(a, b, at = '', out = [], max = 4) {
  if (out.length >= max) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) shapeDiff(a[k], b[k], at ? `${at}.${k}` : k, out, max);
  } else if (!sameJson(a, b)) out.push(`${at || '(root)'}: ar=${JSON.stringify(a)} en=${JSON.stringify(b)}`);
  return out;
}

/* ───────── one document edition ───────── */
function docErrors(doc, ed, t, isSource) {
  const e = [];
  const allowed = new Set([...TOP_KEYS, ...(isSource ? ['service', 'approvals'] : [])]);
  for (const k of Object.keys(doc)) {
    if (!isSource && FORBIDDEN_TOP.includes(k)) e.push(`${ed}: «${k}» is composed from type.json, never written in the content`);
    else if (k === 'approvals' && Array.isArray(doc[k]) && !doc[k].length) continue;
    else if (k === 'approvals') e.push(`${ed}: «approvals» prints in DOCX only; use a sign-off table block (architecture F7)`);
    else if (!allowed.has(k)) e.push(`${ed}: unknown top-level key «${k}»`);
  }
  for (const k of CONTROL_KEYS) if (typeof doc.control?.[k] !== 'string') e.push(`${ed}: control.${k} is missing`);
  if (doc.control?.documentId !== `BW-${t.code}-NEW-001`) e.push(`${ed}: control.documentId must be BW-${t.code}-NEW-001`);
  if (t.placeholder?.[ed] && !String(doc.control?.title || '').endsWith(`: ${t.placeholder[ed]}`)) e.push(`${ed}: control.title must end with «: ${t.placeholder[ed]}» (the placeholder of type.json)`);
  if (!Array.isArray(doc.revisions) || !doc.revisions.length || !doc.revisions.every(Array.isArray)) e.push(`${ed}: revisions needs at least one row`);
  if (!isSource && !(typeof doc.labels?.kicker === 'string' && typeof doc.labels?.subtitle === 'string')) e.push(`${ed}: labels.kicker and labels.subtitle are required (the cover wording)`);
  if (!Array.isArray(doc.openQuestions)) e.push(`${ed}: openQuestions must be an array`);
  if (!Array.isArray(doc.chapters) || !doc.chapters.length) { e.push(`${ed}: chapters is empty`); return e; }
  doc.chapters.forEach((c, i) => {
    if (c.number !== undefined && c.number !== String(i + 1)) e.push(`${ed}: chapter ${i + 1} has number «${c.number}» (numbers are positional)`);
    if (typeof c.title !== 'string' || !c.title) e.push(`${ed}: chapter ${i + 1} has no title`);
    const all = [...(c.blocks || []).map((b) => [b, `${i + 1}`]), ...(c.sections || []).flatMap((s, j) => {
      if (s.number !== undefined && s.number !== `${i + 1}.${j + 1}`) e.push(`${ed}: section ${i + 1}.${j + 1} has number «${s.number}» (numbers are positional)`);
      if (!Array.isArray(s.blocks)) e.push(`${ed}: section ${i + 1}.${j + 1} has no blocks array`);
      return (s.blocks || []).map((b) => [b, `${i + 1}.${j + 1}`]);
    })];
    for (const [b, where] of all) {
      if (!BLOCK_KINDS.includes(b?.kind)) e.push(`${ed}: block of ${where} has kind «${b?.kind}»; allowed: ${BLOCK_KINDS.join(', ')}`);
      else if (b.kind === 'table' && !(Array.isArray(b.rows) && b.rows.length && b.rows.every(Array.isArray))) e.push(`${ed}: table of ${where} needs rows as arrays`);
    }
  });
  return e;
}

/* ───────── one type ───────── */
/** → { id, errors: [], warnings: [], sizes: {ar, en}, art: bytes } */
export function validateType(id, o) {
  const r = { id, errors: [], warnings: [], sizes: {}, art: 0 };
  const err = (m) => r.errors.push(m);
  const dir = path.join(dirOf(o), id);
  if (!ID_RE.test(id) || !fs.existsSync(dir)) { err(`no folder templates/_doctypes/${id}`); return r; }
  const tf = path.join(dir, 'type.json');
  if (!fs.existsSync(tf)) { err('type.json is missing'); return r; }
  let t;
  try { t = rdJson(tf); } catch (x) { err(`type.json: ${x.message}`); return r; }
  const schema = rdJson(path.join(dirOf(o), 'schema.json'));
  for (const m of validateSchema(schema, t)) err(`type.json ${m}`);
  if (t.id !== id) err(`type.json: id «${t.id}» differs from the folder «${id}»`);
  if (t.motif !== t.id) err(`type.json: motif must equal the type id (decisions.md D3), not «${t.motif}»`);
  const cats = categories(o);
  if (!cats.some((c) => c.id === t.category)) err(`type.json: category «${t.category}» is not in _categories.json`);
  if (!palettes(o)[t.palette]) err(`type.json: palette «${t.palette}» is not in _palettes.json`);
  const known = new Set(['type.json', 'en.json', 'ar.json']);
  for (const f of fs.readdirSync(dir)) if (!known.has(f)) r.warnings.push(`unexpected file ${f}`);
  const docs = {};
  const texts = { 'type.json': rd(tf) };
  for (const ed of EDITIONS) {
    let f;
    if (t.source) {
      if (!/^samples\/[a-z0-9-]+$/.test(t.source)) { err(`type.json: source «${t.source}» must be samples/<folder>`); continue; }
      f = path.join(rootOf(o), ...t.source.split('/'), `document.${ed}.json`);
    } else f = path.join(dir, `${ed}.json`);
    if (!fs.existsSync(f)) { err(`${ed}: ${path.relative(rootOf(o), f).split(path.sep).join('/')} is missing`); continue; }
    try { docs[ed] = rdJson(f); texts[path.relative(rootOf(o), f).split(path.sep).join('/')] = rd(f); } catch (x) { err(`${ed}: ${x.message}`); }
  }
  for (const ed of EDITIONS) if (docs[ed]) docErrors(docs[ed], ed, t, !!t.source).forEach(err);
  if (docs.ar && docs.en) for (const d of shapeDiff(shapeOf(docs.ar), shapeOf(docs.en))) err(`pair shape differs at ${d}`);
  for (const ed of EDITIONS) {
    if (!docs[ed]) continue;
    if (/"data:[a-z]+\//i.test(JSON.stringify(docs[ed]))) err(`${ed}: no embedded data: images in a starter document`);
    try { r.sizes[ed] = bytes(JSON.stringify(compose(id, ed, o))); } catch (x) { err(`${ed}: compose failed: ${x.message}`); continue; }
    if (r.sizes[ed] > LIMITS.editionBytes) err(`${ed}: ${kb(r.sizes[ed])} minified is over the ${kb(LIMITS.editionBytes)} budget`);
  }
  const artFile = path.join(dirOf(o), '_art', `${id}.svg`);
  if (fs.existsSync(artFile)) { const svg = rd(artFile); r.art = bytes(svg); texts[`_art/${id}.svg`] = svg; for (const m of checkSvg(svg)) err(`_art/${id}.svg: ${m}`); }
  for (const [name, text] of Object.entries(texts)) for (const f of scanText(text, o)) err(`${name}:${f.line} forbidden pattern ${f.rule}`);
  return r;
}

/* ───────── the shared files ───────── */
export function validateShared(o) {
  const errors = [];
  const warnings = [];
  const dir = dirOf(o);
  const need = (f) => fs.existsSync(path.join(dir, f)) || (errors.push(`${f} is missing`), false);
  let schema = null;
  if (need('schema.json')) { try { schema = rdJson(path.join(dir, 'schema.json')); } catch (x) { errors.push(`schema.json: ${x.message}`); } }
  let cats = [];
  if (need('_categories.json')) {
    try {
      cats = categories(o);
      const ids = cats.map((c) => c.id);
      if (new Set(ids).size !== ids.length) errors.push('_categories.json: duplicate ids');
      if (new Set(cats.map((c) => c.order)).size !== cats.length) errors.push('_categories.json: duplicate order');
      for (const c of cats) if (!ID_RE.test(c.id) || !c.name?.ar || !c.name?.en || !Number.isInteger(c.order)) errors.push(`_categories.json: «${c.id}» needs id, name {ar, en} and an integer order`);
      if (schema && !sameJson([...schema.properties.category.enum].sort(), [...ids].sort())) errors.push('schema.json: the category enum differs from _categories.json');
    } catch (x) { errors.push(x.message); }
  }
  if (need('_palettes.json')) {
    try {
      const stored = palettes(o);
      if (schema && !sameJson(Object.keys(stored).sort(), [...schema.properties.palette.enum].sort())) errors.push('schema.json: the palette enum differs from _palettes.json');
      const derived = derivePalettes(o);
      if (!derived) warnings.push('palette/tokens.json not found: palettes were not recomputed');
      else {
        const paper = paperOf(o);
        const paleGold = paleGoldOf(o);
        for (const id of Object.keys(derived)) {
          if (!stored[id]) { errors.push(`_palettes.json: palette «${id}» is missing`); continue; }
          for (const r of ROLES) if (stored[id][r] !== derived[id][r]) errors.push(`_palettes.json: ${id}.${r} is ${stored[id][r]}, the brand ramps give ${derived[id][r]} (run --write-palettes)`);
        }
        for (const id of Object.keys(stored)) if (!derived[id]) errors.push(`_palettes.json: palette «${id}» has no recipe`);
        const theme = path.join(rootOf(o), 'design', 'ours', 'theme.json');
        if (fs.existsSync(theme)) { const v = rdJson(theme).vars || {}; for (const r of ROLES) if (v[r] !== derived.navy[r]) errors.push(`navy.${r} (${derived.navy[r]}) differs from design/ours/theme.json (${v[r]})`); }
        for (const [id, p] of Object.entries(stored)) {
          const floors = [
            ['white on primary', contrast('#ffffff', p.primary), LIMITS.contrast], ['primary on paper', contrast(p.primary, paper), LIMITS.contrast],
            ['accent on paper', contrast(p.accent, paper), LIMITS.contrast], ['spine code (accent-bright, else accent-200) on primary-deep', Math.max(contrast(p['accent-bright'], p['primary-deep']), contrast(paleGold, p['primary-deep'])), LIMITS.contrast],
            ['white on primary-deep', contrast('#ffffff', p['primary-deep']), LIMITS.contrast],
            ['accent-rule on paper', contrast(p['accent-rule'], paper), LIMITS.graphic], ['primary-deep on primary-50', contrast(p['primary-deep'], p['primary-50']), LIMITS.contrast],
          ];
          for (const [what, v, floor] of floors) if (v < floor) errors.push(`palette ${id}: ${what} is ${v.toFixed(2)}:1, below ${floor}:1`);
        }
      }
    } catch (x) { errors.push(x.message); }
  }
  return { errors, warnings };
}

/* ───────── the CLI ───────── */
const folders = (o) => (fs.existsSync(dirOf(o)) ? fs.readdirSync(dirOf(o), { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.')).map((e) => e.name).sort() : []);

/** Runs the checks and prints; returns the exit code. `argv` = ids and flags. */
export function run(argv, o, log = console.log) {
  if (argv.includes('--write-palettes')) { writePalettes(o); log('doctypes: _palettes.json written'); }
  const ids = argv.filter((a) => !a.startsWith('--'));
  let fail = 0;
  const shared = validateShared(o);
  for (const m of shared.warnings) log(`doctypes: WARN  shared: ${m}`);
  if (shared.errors.length) { fail += shared.errors.length; log('doctypes: FAIL  shared files'); shared.errors.forEach((m) => log(`    - ${m}`)); } else log('doctypes: ok    shared files (categories, palettes, schema)');
  const all = folders(o);
  const sel = ids.length ? ids : all;
  const results = sel.map((id) => validateType(id, o));
  const codes = new Map();
  for (const id of all) { try { const t = rdJson(path.join(dirOf(o), id, 'type.json')); (codes.get(t.code) || codes.set(t.code, []).get(t.code)).push(id); } catch { /* reported by validateType */ } }
  for (const r of results) {
    for (const [code, who] of codes) if (who.length > 1 && who.includes(r.id)) r.errors.push(`code ${code} is also used by ${who.filter((x) => x !== r.id).join(', ')}`);
    if (r.errors.length) { fail += r.errors.length; log(`doctypes: FAIL  ${r.id}`); r.errors.forEach((m) => log(`    - ${m}`)); }
    else log(`doctypes: ok    ${r.id}  (ar ${kb(r.sizes.ar)}, en ${kb(r.sizes.en)}${r.art ? ', art ' + kb(r.art) : ''})`);
    r.warnings.forEach((m) => log(`doctypes: WARN  ${r.id}: ${m}`));
  }
  // art that belongs to no type folder yet (L7 may land first): checked, and named
  const artDir = path.join(dirOf(o), '_art');
  if (!ids.length && fs.existsSync(artDir)) {
    for (const f of fs.readdirSync(artDir).filter((x) => x.endsWith('.svg')).sort()) {
      const id = f.replace(/\.svg$/, '');
      if (all.includes(id)) continue;
      log(`doctypes: WARN  _art/${f} has no type folder yet`);
      const svg = rd(path.join(artDir, f));
      const e = [...checkSvg(svg), ...scanText(svg, o).map((x) => `forbidden pattern ${x.rule}`)];
      if (e.length) { fail += e.length; log(`doctypes: FAIL  _art/${f}`); e.forEach((m) => log(`    - ${m}`)); }
    }
  }
  const sizeOf = (id) => {
    let n = 0;
    for (const ed of EDITIONS) { try { n += bytes(JSON.stringify(compose(id, ed, o))); } catch { /* reported above */ } }
    const art = path.join(artDir, `${id}.svg`);
    if (fs.existsSync(art)) n += bytes(rd(art).trim());
    return n;
  };
  const total = all.reduce((n, id) => n + sizeOf(id), 0);
  if (total > LIMITS.totalBytes) { fail += 1; log(`doctypes: FAIL  total ${kb(total)} is over the ${kb(LIMITS.totalBytes)} budget`); }
  log(`doctypes: ${all.length} type(s) in the registry, ${results.length} checked, total ${kb(total)} of ${kb(LIMITS.totalBytes)}`);
  log(fail ? `doctypes: ${fail} finding(s)` : 'doctypes: 0 finding(s)');
  return fail ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try { process.exit(run(process.argv.slice(2))); } catch (x) { console.error('doctypes: ' + x.message); process.exit(2); }
}
