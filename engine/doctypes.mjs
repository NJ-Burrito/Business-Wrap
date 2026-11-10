// 0.18.0 · document studio: the document-type registry (lane L0, contract C1/C2 of work/sdlc/design/architecture.md §1).
//
// A document type is a finished STARTER DOCUMENT in templates/_doctypes/<id>/ (type.json = look + metadata, en.json and
// ar.json = the document content). This module only READS that folder: it lists the types, loads one, composes the final
// document of an edition (the one place that writes `service`, `docType`, `coverDesign`, `design.vars` and
// `layout`; 0.19.0: no `motif`, page 1 carries no art) and builds the payload the editor embeds as <script id="bw-doctypes"> (C2). It writes nothing and imports
// nothing but node:fs/path, so the editor build, the served route and the CLI share it. The validator is
// tools/doctypes/check.mjs; the folder contract is templates/_doctypes/README.md.
//
// Every function takes an optional last argument `{ root }` (a repo root; default: this repo) so a test can point it at a
// throw-away tree. Missing folders are not errors: no templates/_doctypes (or an empty one) is an empty registry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** The seven colour roles a palette sets (the only ones the CSS and DOCX read; render.mjs designTheme, docx/theme.py load_roles). */
export const ROLES = ['primary', 'primary-deep', 'primary-50', 'primary-100', 'accent', 'accent-rule', 'accent-bright'];
export const EDITIONS = ['ar', 'en'];
/** D3 (decisions.md) and the 0.19.0 page-1 families (work/sdlc/design/0190-types.md §1); absent in a document means today's cover. */
export const COVER_DESIGNS = ['spine', 'compact', 'report', 'form', 'sheet'];
export const ID_RE = /^[a-z][a-z0-9-]*$/;
/** The block kinds the renderers and the DOCX builder handle (architecture F2); a starter document uses nothing else. */
export const BLOCK_KINDS = ['prose', 'subhead', 'table', 'figure', 'diagram', 'stories', 'gap', 'shots'];
export const PAYLOAD_VERSION = 1;

const dirOf = (o) => path.join(o?.root || REPO, 'templates', '_doctypes');
const rel = (o, f) => path.relative(o?.root || REPO, f).split(path.sep).join('/');

function readJson(f, o) {
  let text;
  try { text = fs.readFileSync(f, 'utf8'); } catch (e) { throw new Error(`doctypes: cannot read ${rel(o, f)}: ${e.code || e.message}`); }
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new Error(`doctypes: ${rel(o, f)} is not valid JSON: ${e.message}`); }
}
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const exists = (p) => fs.existsSync(p);

/** The categories, ordered: [{id, name:{ar,en}, order}]. */
export function categories(o) {
  const f = path.join(dirOf(o), '_categories.json');
  if (!exists(f)) return [];
  const list = readJson(f, o);
  if (!Array.isArray(list)) throw new Error('doctypes: _categories.json must be an array');
  return list.map((c) => ({ id: c.id, name: { ar: c.name?.ar, en: c.name?.en }, order: c.order })).sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
}

/** The palettes by id: { navy: { primary, 'primary-deep', ... } } (the seven roles only; "$from" notes are dropped). */
export function palettes(o) {
  const f = path.join(dirOf(o), '_palettes.json');
  if (!exists(f)) return {};
  const raw = readJson(f, o);
  const out = {};
  for (const [id, p] of Object.entries(raw)) {
    if (id.startsWith('$')) continue;
    out[id] = {};
    for (const r of ROLES) {
      if (!/^#[0-9a-fA-F]{6}$/.test(String(p?.[r] ?? ''))) throw new Error(`doctypes: palette «${id}» has no valid ${r}`);
      out[id][r] = p[r];
    }
  }
  return out;
}

/** type.json objects of every folder that holds one, ordered by category, `order`, id. Folders starting with `_` are not types. */
export function listTypes(o) {
  const dir = dirOf(o);
  if (!isDir(dir)) return [];
  const cats = new Map(categories(o).map((c) => [c.id, c.order]));
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const f = path.join(dir, e.name, 'type.json');
    if (!exists(f)) continue;
    const t = readJson(f, o);
    if (t.id !== e.name) throw new Error(`doctypes: ${rel(o, f)} has id «${t.id}» but its folder is «${e.name}»`);
    out.push(t);
  }
  return out.sort((a, b) => (cats.get(a.category) ?? 999) - (cats.get(b.category) ?? 999) || (a.order ?? 999) - (b.order ?? 999) || (a.id < b.id ? -1 : 1));
}

function contentFile(id, t, ed, o) {
  if (t.source === undefined) return path.join(dirOf(o), id, `${ed}.json`);
  if (!/^samples\/[a-z0-9-]+$/.test(String(t.source))) throw new Error(`doctypes: ${id}: source «${t.source}» must be samples/<folder>`);
  return path.join(o?.root || REPO, ...String(t.source).split('/'), `document.${ed}.json`);
}

/** One type with its starter documents: { ...type.json, content: { ar, en }, art } (art = the _art/<id>.svg text, '' when absent). */
export function loadType(id, o) {
  if (!ID_RE.test(String(id))) throw new Error(`doctypes: «${id}» is not a type id`);
  const f = path.join(dirOf(o), id, 'type.json');
  if (!exists(f)) throw new Error(`doctypes: unknown type «${id}»`);
  const t = readJson(f, o);
  if (t.id !== id) throw new Error(`doctypes: ${rel(o, f)} has id «${t.id}» but its folder is «${id}»`);
  const content = {};
  for (const ed of EDITIONS) content[ed] = readJson(contentFile(id, t, ed, o), o);
  const artFile = path.join(dirOf(o), '_art', `${id}.svg`);
  return { ...t, content, art: exists(artFile) ? fs.readFileSync(artFile, 'utf8').replace(/^﻿/, '').trim() : '' };
}

/**
 * The final document of one edition ('ar' | 'en'). The only place `service`, `docType`, `coverDesign`, `design.vars`
 * and `layout` are written (0.19.0: `motif` is no longer written; type.json may still carry it, it is ignored): the document stays self-contained, so a saved file never needs the registry. FORMAT and
 * BUILT_KEYS (engine/format.mjs) are untouched; the new keys are additive document keys.
 */
export function compose(typeId, ed, o) {
  if (!EDITIONS.includes(ed)) throw new Error(`doctypes: edition must be ar or en, not «${ed}»`);
  const t = loadType(typeId, o);
  const pal = palettes(o)[t.palette];
  if (!pal) throw new Error(`doctypes: ${typeId}: unknown palette «${t.palette}»`);
  const content = JSON.parse(JSON.stringify(t.content[ed]));
  const doc = {
    ...content,
    service: typeId,
    docType: typeId,
    coverDesign: COVER_DESIGNS.includes(t.coverDesign) ? t.coverDesign : 'spine',
    design: { ...(content.design || {}), vars: { ...pal, ...(content.design?.vars || {}) } },
  };
  const layout = { ...(t.layout || {}), ...(content.layout || {}) };
  if (Object.keys(layout).length) doc.layout = layout; else delete doc.layout;
  return doc;
}

/**
 * Contract C2, built at build time and embedded as <script type="application/json" id="bw-doctypes">:
 *   { v:1, categories:[{id,name,order}], types:[{id,code,category,order,name,description,placeholder,coverDesign,palette,
 *     accent:'#hex' (the palette's primary), art:'<svg…>' ('' when none), docs:{ar:'<raw json string>', en:'<raw json string>'}}] }
 * `docs` are the COMPOSED documents, minified. Only categories that hold a type are listed.
 */
export function payload(o) {
  const pals = palettes(o);
  const types = listTypes(o).map((t) => {
    const full = loadType(t.id, o);
    const docs = {};
    for (const ed of EDITIONS) docs[ed] = JSON.stringify(compose(t.id, ed, o));
    return {
      id: t.id, code: t.code, category: t.category, order: t.order ?? 999,
      name: t.name, description: t.description, placeholder: t.placeholder,
      coverDesign: COVER_DESIGNS.includes(t.coverDesign) ? t.coverDesign : 'spine',
      palette: t.palette, accent: pals[t.palette].primary, art: full.art, docs,
    };
  });
  const used = new Set(types.map((t) => t.category));
  return { v: PAYLOAD_VERSION, categories: categories(o).filter((c) => used.has(c.id)), types };
}


/** The payload as a string that is safe inside a <script> element: every `<` and the two line separators are written as a unicode escape, so `</script>` cannot occur. */
const ESCAPE = new RegExp('[<' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
export function payloadJson(o) {
  return JSON.stringify(payload(o)).replace(ESCAPE, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
