// Edits engine — applies an edits file (bible/contracts/edits.schema.json v1)
// to a document JSON. Browser + Node, no dependencies.

export const EDITS_VERSION = 1;

const unesc = (s) => s.replace(/~1/g, '/').replace(/~0/g, '~');
export const parsePtr = (p) => (p === '' ? [] : p.split('/').slice(1).map(unesc));
export const joinPtr = (parts) => parts.map((x) => '/' + String(x).replace(/~/g, '~0').replace(/\//g, '~1')).join('');

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/* ── rich text leaves (0.13.0, A26) ─────────────────────────────────────────
 * A text leaf is either a string (as before) or {text, marks: [[start, end, type, value?]], style: {…}}.
 * textOf() is the ONLY reader of a leaf's words: render, DOCX, find/replace, learning and the gates go through it. */
export const isRich = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.text === 'string' && ('marks' in v || 'style' in v);
/** The words of a leaf: a string, a rich leaf's text, '' for nothing. */
export const textOf = (leaf) => (leaf == null ? '' : isRich(leaf) ? leaf.text : typeof leaf === 'object' ? '' : String(leaf));
export const MARK_TYPES = ['b', 'i', 'u', 's', 'code', 'link', 'color', 'font', 'size'];
/** A leaf with new words: a string stays a string; a rich leaf keeps its marks, rebased by common prefix/suffix. */
export function withText(leaf, text) {
  text = String(text ?? '');
  if (!isRich(leaf)) return text;
  const a = leaf.text;
  let pre = 0;
  while (pre < a.length && pre < text.length && a[pre] === text[pre]) pre += 1;
  let suf = 0;
  while (suf < a.length - pre && suf < text.length - pre && a[a.length - 1 - suf] === text[text.length - 1 - suf]) suf += 1;
  const delta = text.length - a.length;
  // a mark that starts where text is inserted moves with its words; one that ends there does not grow
  const at = (x, end) => (end ? (x <= pre ? x : x >= a.length - suf ? x + delta : pre + (text.length - pre - suf)) : x >= a.length - suf ? x + delta : x <= pre ? x : pre);
  const marks = (leaf.marks || []).map(([s, e, ...r]) => [at(s, false), at(e, true), ...r]).filter(([s, e]) => e > s);
  return { ...leaf, text, marks };
}
/** Adds (or with on=false removes) one mark over [start, end); same-type marks merge. Returns a rich leaf (or the string when nothing is left). */
export function markLeaf(leaf, start, end, type, value, on = true) {
  const base = isRich(leaf) ? clone(leaf) : { text: textOf(leaf), marks: [] };
  const n = base.text.length;
  start = Math.max(0, Math.min(n, start | 0)); end = Math.max(start, Math.min(n, end | 0));
  if (!MARK_TYPES.includes(type) || end <= start) return leaf;
  const same = (m) => m[2] === type && (on ? (m[3] ?? null) === (value ?? null) : true);
  const keep = [];
  let s0 = start, e0 = end;
  for (const m of base.marks || []) {
    if (m[2] !== type) { keep.push(m); continue; }
    if (m[1] < start || m[0] > end) { keep.push(m); continue; }
    if (on && same(m)) { s0 = Math.min(s0, m[0]); e0 = Math.max(e0, m[1]); continue; }
    if (m[0] < start) keep.push([m[0], start, ...m.slice(2)]);
    if (m[1] > end) keep.push([end, m[1], ...m.slice(2)]);
  }
  if (on) keep.push(value == null ? [s0, e0, type] : [s0, e0, type, value]);
  base.marks = keep.filter((m) => m[1] > m[0]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  return !base.marks.length && !base.style ? base.text : base;
}
/** Is [start, end) fully covered by marks of this type? */
export function hasMark(leaf, start, end, type) {
  if (!isRich(leaf) || end <= start) return false;
  const ms = (leaf.marks || []).filter((m) => m[2] === type).sort((x, y) => x[0] - y[0]);
  let at = start;
  for (const m of ms) { if (m[0] > at) break; at = Math.max(at, m[1]); }
  return at >= end;
}
/** A leaf with paragraph/cell style merged in (null deletes a key); no style and no marks → the plain string. */
export function styleLeaf(leaf, patch) {
  const base = isRich(leaf) ? clone(leaf) : { text: textOf(leaf), marks: [] };
  const style = { ...(base.style || {}) };
  for (const [k, v] of Object.entries(patch || {})) { if (v == null) delete style[k]; else style[k] = v; }
  if (Object.keys(style).length) base.style = style; else delete base.style;
  return !(base.marks || []).length && !base.style ? base.text : base;
}

export function get(doc, p) {
  let cur = doc;
  for (const k of parsePtr(p)) {
    if (cur == null) return undefined;
    cur = cur[Array.isArray(cur) && k !== '-' ? Number(k) : k];
  }
  return cur;
}

function parentOf(doc, p) {
  const parts = parsePtr(p);
  const key = parts.pop();
  const parent = get(doc, joinPtr(parts));
  if (parent == null || typeof parent !== 'object') throw new Error(`no parent for ${p}`);
  return { parent, key: Array.isArray(parent) && key !== '-' ? Number(key) : key };
}

/** Applies one op in place. Throws on a pointer that does not resolve. */
export function applyOp(doc, op) {
  switch (op.op) {
    case 'setText': {
      // typing into a rich leaf keeps its marks (rebased); a rich value replaces it whole
      const { parent, key } = parentOf(doc, op.path);
      parent[key] = typeof op.value === 'string' ? withText(parent[key], op.value) : clone(op.value);
      return;
    }
    case 'replace': {
      const { parent, key } = parentOf(doc, op.path);
      parent[key] = clone(op.value);
      return;
    }
    case 'insert': {
      const { parent, key } = parentOf(doc, op.path);
      if (!Array.isArray(parent)) { parent[key] = clone(op.value); return; }
      if (key === '-') parent.push(clone(op.value));
      else parent.splice(key, 0, clone(op.value));
      return;
    }
    case 'delete': {
      const { parent, key } = parentOf(doc, op.path);
      if (Array.isArray(parent)) parent.splice(key, 1);
      else delete parent[key];
      return;
    }
    case 'move': {
      const value = get(doc, op.from);
      applyOp(doc, { op: 'delete', path: op.from });
      applyOp(doc, { op: 'insert', path: op.path, value });
      return;
    }
    case 'duplicate': {
      const value = get(doc, op.path);
      let to = op.to;
      if (!to) {
        const parts = parsePtr(op.path);
        parts.push(String(Number(parts.pop()) + 1));
        to = joinPtr(parts);
      }
      applyOp(doc, { op: 'insert', path: to, value });
      return;
    }
    default:
      throw new Error(`unknown op ${op.op}`);
  }
}

export function applyOps(base, ops) {
  const doc = clone(base);
  for (const op of ops) applyOp(doc, op);
  return doc;
}

/** 0.15.3 (T16) · shape rules an op must keep, whoever wrote it (the host validator and the editor bridge both call this):
 *  a table is never written with `columns: []` (it would print as label/value rows with no header: give it its header texts, or leave `columns` out);
 *  a `stories` block's number comes from its section, never from an op. */
export function opShapeErrors(op) {
  const out = [];
  if (!op || typeof op !== 'object') return out;
  const emptyCols = (b) => b && typeof b === 'object' && b.kind === 'table' && Array.isArray(b.columns) && b.columns.length === 0;
  if (['replace', 'insert', 'setText'].includes(op.op)) {
    if (emptyCols(op.value)) out.push('a table needs at least one column header: columns: [] is refused (omit `columns` for a headerless table)');
    if (/\/columns$/.test(String(op.path)) && Array.isArray(op.value) && op.value.length === 0) out.push('columns: [] is refused (a table keeps its column headers; delete the columns with the column scope instead)');
    if (/\/chapters\/\d+\/sections\/\d+\/blocks\/(\d+|-)\/number$/.test(String(op.path))) out.push('the number of a story block comes from its section, never by hand: renumber the section instead');
  }
  return out;
}

/** Older or unversioned edits files → v1. Stub: v0 was a bare op array. */
export function migrate(file) {
  if (Array.isArray(file)) return { version: 1, document: '', baseHash: '', locale: 'ar', ops: file, migratedFrom: 0 };
  if (!file || typeof file !== 'object') throw new Error('not an edits file');
  if (file.version === EDITS_VERSION) return file;
  if (file.version == null && Array.isArray(file.ops)) return { ...file, version: 1, migratedFrom: 0 };
  throw new Error(`edits version ${file.version} is newer than this editor (${EDITS_VERSION}): update Business-Wrap first`);
}

/**
 * The editor's stored state (the localStorage draft and the editions embedded in a saved editor HTML).
 * Schema 1 = 0.5.0 … 0.10.0 (`{v: 1, at, theme, svc: {id: {ed: {hash, ops, status, stale, comments, versions}}}}`,
 * some fields missing in older builds); schema 2 = 0.11.0, every field present and typed, ops without an id get one.
 * Forward-only and idempotent: migrateState(migrateState(x)) deep-equals migrateState(x); a newer schema is refused.
 */
export const STATE_SCHEMA = 2;
const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
/** One edition's stored fields → schema 2 (also the `editions[ed]` of a saved editor HTML: extra keys are kept). */
export function migrateEdition(e) {
  const x = obj(e);
  let n = 0;
  const ops = arr(x.ops).filter((o) => o && typeof o === 'object' && typeof o.op === 'string' && typeof o.path === 'string')
    .map((o) => (o.id ? o : { ...o, id: `m${(n++).toString(36)}${String(o.at || '').replace(/\D/g, '').slice(-6)}` }));
  return { ...x, ops, status: obj(x.status), stale: arr(x.stale).filter((s) => typeof s === 'string'), comments: arr(x.comments), versions: arr(x.versions) };
}
/** @returns {{state: object, from: number, changed: boolean}} */
export function migrateState(state) {
  const s = obj(state);
  const from = Number.isInteger(s.v) ? s.v : 1;
  if (from > STATE_SCHEMA) throw new Error(`stored editor state schema ${from} is newer than this editor (${STATE_SCHEMA}): update Business-Wrap first`);
  const svc = {};
  for (const [id, eds] of Object.entries(obj(s.svc))) {
    svc[id] = {};
    for (const [ed, e] of Object.entries(obj(eds))) svc[id][ed] = migrateEdition(e);
  }
  const out = { ...s, v: STATE_SCHEMA, svc };
  return { state: out, from, changed: JSON.stringify(out) !== JSON.stringify(s) };
}

/** Minimal shape check against the v1 contract (no JSON-schema dependency). */
export function validateEdits(file) {
  const errs = [];
  if (file.version !== 1) errs.push('version must be 1');
  for (const k of ['document', 'baseHash', 'locale', 'ops']) if (!(k in file)) errs.push(`missing ${k}`);
  if (file.baseHash && !/^sha256:[0-9a-f]{64}$/.test(file.baseHash)) errs.push('bad baseHash');
  if (!['ar', 'en'].includes(file.locale)) errs.push('bad locale');
  const allowed = new Set(['version', 'document', 'baseHash', 'locale', 'createdAt', 'author', 'theme', 'ops']);
  for (const k of Object.keys(file)) if (!allowed.has(k)) errs.push(`extra key ${k}`);
  for (const [i, op] of (file.ops || []).entries()) {
    if (!['setText', 'replace', 'insert', 'delete', 'move', 'duplicate'].includes(op.op)) errs.push(`op ${i}: bad op`);
    if (typeof op.path !== 'string' || !/^(\/([^~/]|~[01])*)*$/.test(op.path)) errs.push(`op ${i}: bad path`);
    if (op.op === 'move' && typeof op.from !== 'string') errs.push(`op ${i}: move needs from`);
    if (['setText', 'replace', 'insert'].includes(op.op) && !('value' in op)) errs.push(`op ${i}: needs value`);
    errs.push(...opShapeErrors(op).map((e) => `op ${i}: ${e}`));
  }
  return errs;
}

/**
 * Merge incoming ops into local ops on the same base. A conflict is a path
 * both sides wrote with different final values. Returns
 * { merged, conflicts: [{path, mine, theirs}] } — conflicts are left out of
 * `merged` until the caller decides.
 */
export function mergeOps(base, mine, theirs) {
  const finalOf = (ops) => {
    const m = new Map();
    for (const op of ops) if (op.op === 'setText' || op.op === 'replace') m.set(op.path, op.value);
    return m;
  };
  const a = finalOf(mine);
  const b = finalOf(theirs);
  const conflicts = [];
  for (const [p, v] of b) {
    if (a.has(p) && JSON.stringify(a.get(p)) !== JSON.stringify(v)) conflicts.push({ path: p, mine: a.get(p), theirs: v, base: get(base, p) });
  }
  const conflictPaths = new Set(conflicts.map((c) => c.path));
  const mineKeys = new Set(mine.map((o) => JSON.stringify(o)));
  // Structural edits (move / delete / insert / duplicate) on the same unit — a block,
  // a row, a story, a paragraph — on both sides are a conflict too: replaying both
  // would shift each other's indices.
  const sig = (o) => JSON.stringify({ op: o.op, path: o.path, from: o.from, to: o.to, value: o.value });
  const mineSigs = new Set(mine.map(sig));
  const theirStruct = new Set();
  for (const t of theirs) {
    if (!STRUCT.has(t.op) || mineSigs.has(sig(t))) continue;
    const tk = unitsOf(t);
    const hit = mine.filter((m) => STRUCT.has(m.op) && unitsOf(m).some((a) => tk.some((b) => overlaps(a, b))));
    if (!hit.length) continue;
    const key = tk[0];
    const same = conflicts.find((c) => c.kind === 'structure' && c.path === key);
    if (same) same.theirs.push(t);
    else conflicts.push({ kind: 'structure', path: key, mine: hit, theirs: [t] });
    theirStruct.add(t);
  }
  const extra = theirs.filter((o) => !theirStruct.has(o) && !conflictPaths.has(o.path) && !mineKeys.has(JSON.stringify(o)));
  return { merged: [...mine, ...extra], conflicts };
}

const STRUCT = new Set(['move', 'delete', 'insert', 'duplicate']);
/** The deepest array element a pointer names (…/blocks/3, …/rows/2/…→…/rows/2). */
function unitOf(p) {
  const m = [...String(p).matchAll(/\/(chapters|sections|blocks|rows|items|paragraphs|columns|acceptance)\/(\d+|-)/g)];
  if (!m.length) return p;
  const last = m.at(-1);
  return p.slice(0, last.index + last[0].length);
}
const unitsOf = (o) => [o.path, o.from, o.to].filter(Boolean).map(unitOf);
const overlaps = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/');

/**
 * Resolve a structural conflict: 'mine' drops their ops; 'theirs' swaps my ops on
 * that unit for theirs. Returns the new op list, or throws if it no longer applies.
 */
export function resolveStructure(base, ops, conflict, side) {
  if (side === 'mine') return ops;
  const next = [...ops.filter((o) => !conflict.mine.includes(o)), ...conflict.theirs];
  applyOps(base, next);
  return next;
}

/** Every string leaf that the editor may edit: [{path, value}]. */
export function textLeaves(doc) {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string' || isRich(v)) { out.push({ path: p, value: textOf(v) }); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}/${i}`));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (['svg', 'images', 'kind', 'service', 'composedAt', 'layout'].includes(k)) continue;
        if (p === '/control' && (k === 'editions' || k === 'numbering')) continue; // 0.15.3: settings, not words
        if (k === 'id' && 'kind' in v) continue; // a block's stable id (anchors) is not text; a story's id is
        // a diagram's words are its labels; ids, kinds and geometry are not text
        if (k === 'model' && x && typeof x === 'object') {
          (x.nodes || []).forEach((n, i) => ['label', 'sub'].forEach((f) => typeof n?.[f] === 'string' && n[f] && out.push({ path: `${p}/model/nodes/${i}/${f}`, value: n[f] })));
          (x.edges || []).forEach((e, i) => typeof e?.label === 'string' && e.label && out.push({ path: `${p}/model/edges/${i}/label`, value: e.label }));
          continue;
        }
        walk(x, `${p}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`);
      }
  };
  walk({ control: doc.control, revisions: doc.revisions, chapters: doc.chapters }, '');
  return out;
}

/** Arabic-aware fold for find: alef/hamza forms, ya/alef maqsura, ta marbuta, diacritics, tatweel, case. */
export function fold(s) {
  return String(s ?? '')
    .replace(/[ً-ٰٕ]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ىی]/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

/**
 * Find in a string with folding; returns [start, end) ranges in the ORIGINAL
 * string. Folding only deletes or maps 1:1, so an index map is enough.
 */
export function findFolded(text, query) {
  const q = fold(query);
  if (!q) return [];
  const map = [];
  let folded = '';
  for (let i = 0; i < text.length; i += 1) {
    const f = fold(text[i]);
    for (let j = 0; j < f.length; j += 1) { folded += f[j]; map.push(i); }
  }
  const out = [];
  let at = folded.indexOf(q);
  while (at >= 0) {
    const start = map[at];
    const end = map[at + q.length - 1] + 1;
    out.push([start, end]);
    at = folded.indexOf(q, at + q.length);
  }
  return out;
}

export function replaceFolded(text, query, repl) {
  const ranges = findFolded(text, query);
  let out = '';
  let last = 0;
  for (const [s, e] of ranges) { out += text.slice(last, s) + repl; last = e; }
  return { text: out + text.slice(last), count: ranges.length };
}

/** Per-field before/after between two document states. */
export function diffDocs(a, b) {
  const A = new Map(textLeaves(a).map((x) => [x.path, x.value]));
  const B = new Map(textLeaves(b).map((x) => [x.path, x.value]));
  const out = [];
  for (const [p, v] of B) if (A.get(p) !== v) out.push({ path: p, before: A.has(p) ? A.get(p) : null, after: v });
  for (const [p, v] of A) if (!B.has(p)) out.push({ path: p, before: v, after: null });
  return out;
}

/** Structural signature for AR/EN pair sync: kinds + counts, no text. */
export function shape(doc) {
  return doc.chapters.map((ch) =>
    ch.sections.map((s) =>
      s.blocks.map((b) => b.kind + (b.rows ? `:${b.rows.length}x${(b.columns || []).length}` : '') + (b.paragraphs ? `:${b.paragraphs.length}` : '') + (b.items ? `:${b.items.length}` : '')).join(',')
    ).join('|')
  );
}

/* ── 0.14.0 · edit scope (E1), list numbering (E2), the document id (E3) ─────────────────────────────────────────────
 * Pure helpers shared by the editor extensions (ext/28-scope.js, 29-numbering.js, 33-docid.js) and the tests: they read a
 * document and return ops; they never touch the DOM. */

/** E1 · What a Delete can take, from the selection {p: leaf pointer, b: block pointer, ov: overlay index}. Each entry
 *  {scope, path}, smallest first: line · cell · row · column · part · element · block · section. `row`, `column`, `section` and an
 *  overlay `element` are done by the editor's own tools (they keep merges, widths, page sizes); the rest are plain ops here. */
export const DELETE_SCOPES = ['line', 'cell', 'row', 'column', 'part', 'element', 'block', 'section'];
const BLOCK_RE = /^(\/chapters\/\d+\/sections\/\d+\/blocks\/\d+)(?:\/|$)/;
const SECTION_RE = /^(\/chapters\/\d+\/sections\/\d+)(?:\/|$)/;
export function scopesAt(doc, sel = {}) {
  const out = [];
  const p = sel.p || '';
  const b = sel.b || BLOCK_RE.exec(p)?.[1] || null;
  const blk = b ? get(doc, b) : null;
  if (sel.ov != null && sel.ov !== false) out.push({ scope: 'element', path: `/overlays/${sel.ov}`, overlay: true });
  const line = /^(.*\/(?:paragraphs|acceptance))\/(\d+)$/.exec(p);
  if (line && Array.isArray(get(doc, line[1]))) out.push({ scope: 'line', path: p, last: get(doc, line[1]).length <= 1 });
  const m = /^(.*\/rows)\/(\d+)\/(\d+)$/.exec(p);
  if (m && Array.isArray(get(doc, m[1]))) {
    const rows = get(doc, m[1]);
    out.push({ scope: 'cell', path: p });
    if (rows.length > 1) out.push({ scope: 'row', path: `${m[1]}/${m[2]}` });
    if ((rows[+m[2]] || []).length > 1) out.push({ scope: 'column', path: `${m[1]}/${m[2]}/${m[3]}`, c: +m[3] });
  }
  const part = /^(.*\/items)\/(\d+)(?:\/|$)/.exec(p);
  if (part && blk?.kind === 'stories' && Array.isArray(get(doc, part[1])) && get(doc, part[1]).length > 1) out.push({ scope: 'part', path: `${part[1]}/${part[2]}` });
  if (blk && ['figure', 'shots', 'diagram'].includes(blk.kind)) out.push({ scope: 'element', path: b });
  if (b) out.push({ scope: 'block', path: b, kind: blk?.kind });
  const s = SECTION_RE.exec(b || p);
  if (s) out.push({ scope: 'section', path: s[1] });
  return out;
}
/** E1 · The ops of one plain scope (line · cell · part · element · block); null for the scopes the editor's tools do. */
export function deleteOps(doc, scope, sel = {}) {
  const hit = scopesAt(doc, sel).find((x) => x.scope === scope);
  if (!hit) return null;
  const old = get(doc, hit.path);
  if (scope === 'line') return hit.last ? [{ op: 'replace', path: hit.path, value: '', old }] : [{ op: 'delete', path: hit.path, old }];
  if (scope === 'cell') return [{ op: 'replace', path: hit.path, value: '', old }];
  if (scope === 'part' || scope === 'block' || (scope === 'element' && !hit.overlay)) return [{ op: 'delete', path: hit.path, old }];
  return null;
}

/** E2 · A numbered paragraph is a leaf with style.list === 'number'. `style.start` = a whole number (this paragraph starts a run
 *  at that value) or 'continue' (the run goes on from the previous numbered list at its level). No start = 1, as before. */
export const isNumbered = (leaf) => isRich(leaf) && leaf.style?.list === 'number';
export const validStart = (v) => v === 'continue' || (String(v).trim() !== '' && Number.isInteger(+v) && +v >= 0 && +v <= 9999);
/** The ops that make the run starting at `path` (a numbered paragraph, or a cell holding a numbered list) start as asked.
 *  mode: 'restart' (at 1) · 'continue' · 'set' (value). [] when the leaf is not numbered or the value is invalid. */
export function renumberOps(doc, path, mode, value) {
  const leaf = get(doc, path);
  if (!isNumbered(leaf)) return [];
  const start = mode === 'restart' ? 1 : mode === 'continue' ? 'continue' : validStart(value) && value !== 'continue' ? +value : null;
  if (start == null || leaf.style.start === start) return [];
  return [{ op: 'replace', path, value: styleLeaf(leaf, { start }), old: leaf }];
}

/** E3 · The document id as a whole token: BW-1 is not found inside BW-12 or BW-1-A. */
const idRe = (id) => new RegExp(`(?<![\\p{L}\\p{N}_])${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_]|-[\\p{L}\\p{N}])`, 'gu');
const ID_ROOTS = ['control', 'controlTable', 'revisions', 'approvals', 'chapters', 'chrome', 'openQuestions'];
/** E3 · `text` with every token `oldId` turned into `newId`. */
export const replaceId = (text, oldId, newId) => (oldId ? String(text ?? '').replace(idRe(oldId), () => newId) : String(text ?? ''));
const ID_SKIP = new Set(['svg', 'images', 'kind', 'service', 'composedAt', 'layout', 'model', 'src', 'style', 'merges', 'colWidths', 'rowHeights', 'id']);
/** E3 · Every text leaf of the document that holds `id` as a token: [{path, text}] (the id field itself included). */
export function docIdInstances(doc, id) {
  id = String(id ?? '');
  if (!id) return [];
  const re = idRe(id);
  const out = [];
  const walk = (v, p) => {
    if (typeof v === 'string' || isRich(v)) { const s = textOf(v); re.lastIndex = 0; if (re.test(s)) out.push({ path: p, text: s }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}/${i}`)); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!ID_SKIP.has(k)) walk(x, `${p}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`);
  };
  for (const k of ID_ROOTS) if (doc?.[k] !== undefined) walk(doc[k], `/${k}`);
  return out;
}
/** E3 · The ops that turn every instance of `oldId` into `newId` (`skip` = the path the user just typed in). */
export function docIdOps(doc, oldId, newId, skip = null) {
  oldId = String(oldId ?? ''); newId = String(newId ?? '');
  if (!oldId || !newId || oldId === newId) return [];
  const re = idRe(oldId);
  const ops = [];
  for (const x of docIdInstances(doc, oldId)) {
    if (x.path === skip) continue;
    re.lastIndex = 0;
    ops.push({ op: 'setText', path: x.path, value: replaceId(x.text, oldId, newId), old: get(doc, x.path) });
  }
  return ops;
}
/** E3 · The id a user's edit of one instance means: the leaf was `before`, is now `after`, and held `oldId`. Null when the edit is not inside the id. */
export function docIdFromEdit(before, after, oldId) {
  before = String(before ?? ''); after = String(after ?? ''); oldId = String(oldId ?? '');
  if (!oldId) return null;
  const at = before.search(idRe(oldId));
  if (at < 0) return null;
  const head = before.slice(0, at), tail = before.slice(at + oldId.length);
  if (!after.startsWith(head) || !after.endsWith(tail) || after.length < head.length + tail.length) return null;
  const next = after.slice(head.length, after.length - tail.length);
  return next && next !== oldId ? next : null;
}

/* ── 0.15.0 · render-time numbering (F4) ─────────────────────────────────────────────────────────────────────────────
 * Chapter, section and story numbers come from position, so a stored number can never drift from what prints.
 * `control.numbering === 'manual'` opts a document out: the stored numbers then print as they are. */
export const isManualNumbering = (doc) => doc?.control?.numbering === 'manual';

/** @returns {{manual: boolean, ch: string[], sec: string[][], story: string[][][]}} what prints, by position.
 *  ch[i] = "i+1", sec[i][j] = "i+1.j+1", story[i][j][k] = the section number for a `stories` block at blocks[k] (others ''). */
export function docNumbers(doc) {
  const manual = isManualNumbering(doc);
  const chs = doc?.chapters || [];
  const out = { manual, ch: [], sec: [], story: [] };
  chs.forEach((ch, i) => {
    const n = manual ? String(ch.number ?? '') : String(i + 1);
    out.ch.push(n);
    out.sec.push([]);
    out.story.push([]);
    (ch.sections || []).forEach((s, j) => {
      const sn = manual ? String(s.number ?? '') : `${i + 1}.${j + 1}`;
      out.sec[i].push(sn);
      out.story[i].push((s.blocks || []).map((b) => (b.kind === 'stories' ? (manual ? String(b.number ?? '') : sn) : '')));
    });
  });
  return out;
}

/** Writes the computed numbers into the document itself (in place, returns it) so the JSON on disk equals what prints.
 *  Every `stories` block takes its section's number. Manual documents are left untouched. */
export function normaliseNumbers(doc) {
  if (!doc?.chapters || isManualNumbering(doc)) return doc;
  const N = docNumbers(doc);
  doc.chapters.forEach((ch, i) => {
    ch.number = N.ch[i];
    (ch.sections || []).forEach((s, j) => {
      s.number = N.sec[i][j];
      (s.blocks || []).forEach((b) => {
        if (b.kind === 'stories') b.number = N.sec[i][j];
      });
    });
  });
  return doc;
}

/* ── 0.15.3 · numbers everywhere, single-edition documents, tashkeel, words ─────────────────────────────────────────── */

/** The ops that write the positional numbers (what prints in an auto-numbered document) into the stored fields, chapter, section and story:
 *  what «Renumber» does, for an auto-numbered document (so the JSON agrees with the page) and for a manual one (whose numbers are then real). */
export function numberingOps(doc) {
  const ops = [];
  (doc?.chapters || []).forEach((ch, i) => {
    const n = String(i + 1);
    if (ch.number !== n) ops.push({ op: 'replace', path: `/chapters/${i}/number`, value: n, old: ch.number });
    (ch.sections || []).forEach((s, j) => {
      const sn = `${n}.${j + 1}`;
      if (s.number !== sn) ops.push({ op: 'replace', path: `/chapters/${i}/sections/${j}/number`, value: sn, old: s.number });
      (s.blocks || []).forEach((b, k) => {
        if (b.kind === 'stories' && b.number !== sn) ops.push({ op: 'replace', path: `/chapters/${i}/sections/${j}/blocks/${k}/number`, value: sn, old: b.number });
      });
    });
  });
  return ops;
}

/** `control.editions: ['ar']` marks a document written in one language only: no second edition is expected, paired or exported. */
export const editionsOf = (doc) => {
  const e = doc?.control?.editions;
  if (!Array.isArray(e)) return null;
  const ok = [...new Set(e.filter((x) => x === 'ar' || x === 'en'))];
  return ok.length ? ok : null;
};
export const isSingleEdition = (doc) => editionsOf(doc)?.length === 1;
/** The ops that turn single-edition on (one language) or off (both) on every edition doc given: [{ed, op}]. */
export function singleEditionOps(docs, lang) {
  const out = [];
  for (const [ed, doc] of Object.entries(docs || {})) {
    if (!doc?.control) continue;
    if (lang === 'ar' || lang === 'en') { const v = [lang]; if (JSON.stringify(doc.control.editions) !== JSON.stringify(v)) out.push({ ed, op: { op: 'replace', path: '/control/editions', value: v, old: doc.control.editions } }); }
    else if ('editions' in doc.control) out.push({ ed, op: { op: 'delete', path: '/control/editions', old: doc.control.editions } });
  }
  return out;
}
/** The editions of a library entry that an export writes: a single-edition document drops the other (empty) one. */
export function exportEditions(entry) {
  const have = Object.keys(entry?.editions || {}).filter((ed) => entry.editions[ed]?.raw);
  for (const ed of have) {
    try { const e = editionsOf(JSON.parse(entry.editions[ed].raw)); if (e?.length === 1) return have.filter((x) => x === e[0]); } catch { /* unreadable: keep all */ }
  }
  return have;
}

/** Visible text must not carry tashkeel (U+064B to U+0652): the owner's rule; it belongs to text-to-speech only. */
export const TASHKEEL = /[ً-ْ]/g;
export const stripTashkeel = (s) => String(s ?? '').replace(TASHKEEL, '');
export const tashkeelLeaves = (doc) => textLeaves(doc).filter((l) => /[ً-ْ]/.test(l.value));
export function tashkeelOps(doc) {
  return tashkeelLeaves(doc).map((l) => ({ op: 'setText', path: l.path, value: stripTashkeel(l.value), old: l.value }));
}

/** Words of one edition document (what the library lists): the text leaves, split on white space. */
export function wordCount(doc) {
  try { return textLeaves(doc).map((x) => x.value).join(' ').split(/\s+/).filter(Boolean).length; } catch { return 0; }
}
/** Words per edition of a library entry, from what the edition holds NOW (base + its live ops), never from the blank placeholder base. */
export function entryWords(entry) {
  const out = {};
  for (const [ed, e] of Object.entries(entry?.editions || {})) {
    try {
      const live = (e.ops || []).filter((o) => (e.status || {})[o.id] !== 'rejected');
      out[ed] = wordCount(applyOps(JSON.parse(e.raw), live));
    } catch { out[ed] = 0; }
  }
  return out;
}
