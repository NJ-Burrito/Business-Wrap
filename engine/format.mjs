// The saved-file format (the <script id="bw-data"> block of every editor / Save-HTML file) and the ONLY way it changes.
//
//   FORMAT      integer, written as `format` into every file this build makes. Files before it have no `format` (= 0).
//   MIGRATIONS  { n: fn } — fn turns a format-n data object into format n+1. Pure, one step each, never deletes a key.
//   migrateData(d) → { data, from, to }   runs the chain; a file NEWER than this build is refused (update first).
//   historyProblems(old, neu)             what the new data lost of the old: [] = nothing. A re-wrap is refused on any.
//
// Rules for a release that changes the file (see AGENTS.md § File format and history):
//   1. add attributes ADDITIVELY (new key, default when absent); never rename or drop one;
//   2. if the shape must change: FORMAT += 1 and add MIGRATIONS[old] — the chain is ordered and never edited after release;
//   3. generate tests/fixtures/history/<version>.html.gz with `npm run fixture:history` BEFORE tagging.
// Unknown keys (a later extension's, a newer 0.x's) travel untouched: `BUILT_KEYS` is the denylist of what a build
// regenerates itself; every other top-level key of an older file is carried over as is.

export const FORMAT = 1;

/** Keys editorHtml() makes itself; anything else in an older file's data block belongs to the user and is carried. */
export const BUILT_KEYS = new Set(['icons', 'brand', 'setId', 'uiLang', 'services', 'theme', 'i18n', 'fontCss', 'fontFamilies', 'uiCss', 'csp', 'version', 'stateSchema', 'format', 'about', 'whatsNew']);

/** Keys of the history itself: the log, its mark, contributors, the lock, and per edition the edits and what hangs on them. */
export const HISTORY_KEYS = ['bwlog', 'prov', 'contrib', 'lock'];

export const MIGRATIONS = {
  // 0 → 1: the first versioned format (0.13.x files carry none). Nothing changes shape; the number is stamped.
  0: (d) => ({ ...d, format: 1 }),
};

export class FormatError extends Error {}

/** Runs the migration chain over a parsed data block. The input is not mutated; a failing step throws FormatError. */
export function migrateData(d) {
  const from = Number.isInteger(d?.format) ? d.format : 0;
  if (from > FORMAT) throw new FormatError(`file format ${from} is newer than this Business-Wrap (${FORMAT}): update Business-Wrap first`);
  let data = d;
  for (let n = from; n < FORMAT; n += 1) {
    if (typeof MIGRATIONS[n] !== 'function') throw new FormatError(`no migration from file format ${n} to ${n + 1}`);
    try { data = MIGRATIONS[n](data); } catch (e) { throw new FormatError(`migration ${n} → ${n + 1} failed: ${e.message}`); }
    if (!data || typeof data !== 'object') throw new FormatError(`migration ${n} → ${n + 1} returned no data`);
  }
  return { data, from, to: FORMAT };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What `neu` lost of `old` (both parsed data blocks): every non-built top-level key, and per edition every key. */
export function historyProblems(old, neu) {
  const out = [];
  for (const k of Object.keys(old)) if (!BUILT_KEYS.has(k) && !same(old[k], neu[k])) out.push(`key «${k}» ${k in neu ? 'changed' : 'dropped'}`);
  const nSvc = Object.fromEntries((neu.services || []).map((s) => [s.id, s]));
  for (const s of old.services || []) {
    const t = nSvc[s.id];
    if (!t) { out.push(`service «${s.id}» dropped`); continue; }
    for (const [ed, e] of Object.entries(s.editions || {})) {
      const f = t.editions?.[ed];
      if (!f) { out.push(`edition ${s.id}/${ed} dropped`); continue; }
      for (const k of Object.keys(e)) if (!same(e[k], f[k])) out.push(`${s.id}/${ed}.${k} ${k in f ? 'changed' : 'dropped'}`);
    }
  }
  return out;
}
