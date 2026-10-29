// Bulk edit core (H1, 0.13.1): one change planned on many documents, each matched by a stable anchor, never by position.
//
// One file, two hosts (like ledger-v1.mjs): Node imports it (tests, CLI), and engine/build-editor.mjs concatenates it into
// the editor's script with the `export` stripped. So: no imports, no Node-only API.
//
//   BULK.plan({ ar: doc, en: doc }, spec) → { status, reason, ops: { ar: [...], en: [...] }, where }
//     status: 'change' (ops to apply) | 'same' (already so) | 'notfound' (anchor missing) | 'conflict' (ambiguous,
//     already exists, or the two editions disagree). Ops are edits-contract ops (bible/04) without id/at.
//
// spec.op and its fields (each text field is { ar, en } or one string for both):
//   addField      section, label, value, after?     a row [label, value] in the section's first table (after `after`)
//   deleteField   field, section?                    the row whose first cell is `field`
//   editField     field, section?, value?, label?    its value cell and/or its label
//   addSection    chapter | after, title, text       a section at the end of the chapter (or right after `after`)
//   deleteSection section
//   editSection   section, title                     its heading
//   replaceText   find, replace, section?            every text in the section (or the document) holding `find`
// Anchors: a section or chapter by number ("2.1") or heading; a field by its label (first cell). Matching ignores case,
// tashkeel, tatweel, hamza forms and extra spaces. A match in one edition is checked against the same place in the other,
// so the AR and EN editions change in step or not at all.
export const BULK = (() => {
  const OPS = ['addField', 'deleteField', 'editField', 'addSection', 'deleteSection', 'editSection', 'replaceText'];
  const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();
  const pick = (v, ed) => (v == null ? undefined : typeof v === 'string' ? v : v[ed] ?? v.ar ?? v.en ?? Object.values(v)[0]);
  const all = (v) => (v == null ? [] : typeof v === 'string' ? [v] : Object.values(v)).map(norm).filter(Boolean);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const rich = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.text === 'string' && ('marks' in v || 'style' in v);
  const cellText = (c) => (typeof c === 'string' ? c : rich(c) ? c.text : c == null || typeof c === 'object' ? '' : String(c));

  /* anchors → places in one document */
  const chapters = (doc, a) => { const k = all(a); return (doc.chapters || []).map((c, ci) => (k.includes(norm(c.number)) || k.includes(norm(c.title)) ? ci : -1)).filter((x) => x >= 0); };
  function sections(doc, a) {
    const k = all(a), out = [];
    (doc.chapters || []).forEach((c, ci) => (c.sections || []).forEach((s, si) => { if (k.includes(norm(s.number)) || k.includes(norm(s.title))) out.push({ ci, si }); }));
    return out;
  }
  const tables = (s) => (s?.blocks || []).map((b, bi) => (b?.kind === 'table' && Array.isArray(b.rows) ? bi : -1)).filter((x) => x >= 0);
  /** Rows whose first cell is `label`; `scope` = {ci, si} limits them to one section (resolved for the pair first). */
  function fields(doc, label, scope = null) {
    const k = all(label), out = [];
    (doc.chapters || []).forEach((c, ci) => (c.sections || []).forEach((s, si) => {
      if (scope && (scope.ci !== ci || scope.si !== si)) return;
      for (const bi of tables(s)) s.blocks[bi].rows.forEach((r, ri) => { if (Array.isArray(r) && k.includes(norm(cellText(r[0])))) out.push({ ci, si, bi, ri }); });
    }));
    return out;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  /** One place for the pair: the editions that find exactly one match agree on it, and every edition holds the same kind
   *  of thing there (`sig`: number, block kinds, row and column counts; null = nothing there). An edition that lost or
   *  gained an item before the anchor gives another signature: a conflict, never a change to the wrong item. */
  function locate(eds, find, sig) {
    const found = Object.fromEntries(Object.entries(eds).map(([ed, d]) => [ed, find(d)]));
    if (Object.values(found).some((m) => m.length > 1)) return { status: 'conflict', reason: 'ambiguous' };
    const ones = Object.values(found).filter((m) => m.length === 1).map((m) => m[0]);
    if (!ones.length) return { status: 'notfound', reason: 'anchor' };
    if (ones.some((x) => !same(x, ones[0]))) return { status: 'conflict', reason: 'editions' };
    const sigs = Object.values(eds).map((d) => sig(d, ones[0]));
    if (sigs.some((x) => x == null || x !== sigs[0])) return { status: 'conflict', reason: 'editions' };
    return { at: ones[0] };
  }
  const secAt = (d, { ci, si }) => d.chapters?.[ci]?.sections?.[si];
  const rowAt = (d, x) => secAt(d, x)?.blocks?.[x.bi]?.rows?.[x.ri];
  const secSig = (d, x) => { const s = secAt(d, x); return s ? `${s.number ?? ''}|${(s.blocks || []).map((b) => b?.kind).join()}|${(s.blocks || []).map((b) => (b?.kind === 'table' ? `${b.rows?.length}x${b.columns?.length ?? ''}` : '')).join()}` : null; };
  const rowSig = (d, x) => { const r = rowAt(d, x); return Array.isArray(r) ? `${secSig(d, x)}|${x.bi}|${r.length}` : null; };
  const chSig = (d, ci) => { const c = d.chapters?.[ci]; return c ? `${c.number ?? ''}|${(c.sections || []).map((s) => s.number ?? '').join()}` : null; };
  /** The section named by `a` for the pair: {at} | {status, reason}; no anchor = {at: null} (the whole document). */
  const scopeOf = (eds, a) => (a == null || !all(a).length ? { at: null } : locate(eds, (d) => sections(d, a), secSig));
  const P = {
    sec: ({ ci, si }) => `/chapters/${ci}/sections/${si}`,
    row: (x) => `/chapters/${x.ci}/sections/${x.si}/blocks/${x.bi}/rows/${x.ri}`,
  };
  const cellPath = (x, j) => `${P.row(x)}/${j}`; // a rich leaf keeps its marks: setText rebases them (edits.mjs applyOp)

  /** Every string under a node (block text), as [pointer, value]. */
  function strings(node, base, out = []) {
    if (typeof node === 'string') out.push([base, node]);
    else if (rich(node)) out.push([base, node.text]);
    else if (Array.isArray(node)) node.forEach((x, i) => strings(x, `${base}/${i}`, out));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) if (!['kind', 'number', 'id', 'src', 'image', 'href', 'style', 'mermaid'].includes(k)) strings(v, `${base}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, out);
    return out;
  }
  const done = (ops) => (Object.values(ops).some((o) => o.length) ? { status: 'change', ops } : { status: 'same', reason: 'already', ops });

  function plan(eds, spec = {}) {
    const E = Object.keys(eds);
    const none = (o) => ({ ...o, ops: Object.fromEntries(E.map((ed) => [ed, []])) });
    if (!OPS.includes(spec.op)) return none({ status: 'conflict', reason: 'op' });
    const ops = Object.fromEntries(E.map((ed) => [ed, []]));
    const op = spec.op;

    if (op === 'addField') {
      const L = locate(eds, (d) => sections(d, spec.section), (d, x) => (tables(secAt(d, x)).length ? secSig(d, x) : null));
      if (L.status) return none(L);
      const bi = tables(secAt(eds[E[0]], L.at))[0];
      const at = { ...L.at, bi };
      if (E.some((ed) => fields(eds[ed], spec.label, L.at).length)) return none({ status: 'conflict', reason: 'exists' });
      let after = null;
      if (spec.after != null && all(spec.after).length) {
        const A = locate(eds, (d) => fields(d, spec.after, L.at).filter((f) => f.bi === bi), rowSig);
        if (A.status) return none(A);
        after = A.at.ri;
      }
      for (const ed of E) {
        const tb = secAt(eds[ed], at).blocks[bi];
        const n = Math.max(2, tb.columns?.length || tb.rows[0]?.length || 2);
        const row = [pick(spec.label, ed) ?? '', pick(spec.value, ed) ?? ''];
        while (row.length < n) row.push('');
        ops[ed].push({ op: 'insert', path: `/chapters/${at.ci}/sections/${at.si}/blocks/${bi}/rows/${after == null ? '-' : after + 1}`, value: row });
      }
      return { ...done(ops), where: `${secAt(eds[E[0]], at).number || ''} ${secAt(eds[E[0]], at).title || ''}`.trim() };
    }
    if (op === 'deleteField' || op === 'editField') {
      const S = scopeOf(eds, spec.section);
      if (S.status) return none(S);
      const L = locate(eds, (d) => fields(d, spec.field, S.at), rowSig);
      if (L.status) return none(L);
      for (const ed of E) {
        const row = rowAt(eds[ed], L.at);
        if (op === 'deleteField') { ops[ed].push({ op: 'delete', path: P.row(L.at), old: clone(row) }); continue; }
        const v = pick(spec.value, ed), l = pick(spec.label, ed);
        if (v != null && row.length > 1 && cellText(row[1]) !== v) ops[ed].push({ op: 'setText', path: cellPath(L.at, 1), value: v, old: cellText(row[1]) });
        if (l != null && l !== '' && cellText(row[0]) !== l) ops[ed].push({ op: 'setText', path: cellPath(L.at, 0), value: l, old: cellText(row[0]) });
      }
      return { ...done(ops), where: cellText(rowAt(eds[E[0]], L.at)[0]) };
    }
    if (op === 'addSection') {
      let ci, si = null;
      if (spec.after != null && all(spec.after).length) {
        const L = locate(eds, (d) => sections(d, spec.after), secSig);
        if (L.status) return none(L);
        ({ ci } = L.at); si = L.at.si + 1;
      } else {
        const L = locate(eds, (d) => chapters(d, spec.chapter), chSig);
        if (L.status) return none(L);
        ci = L.at;
      }
      if (chSig(eds[E[0]], ci) == null || E.some((ed) => chSig(eds[ed], ci) !== chSig(eds[E[0]], ci))) return none({ status: 'conflict', reason: 'editions' });
      if (E.some((ed) => (eds[ed].chapters[ci].sections || []).some((s) => all(spec.title).includes(norm(s.title))))) return none({ status: 'conflict', reason: 'exists' });
      for (const ed of E) {
        const c = eds[ed].chapters[ci];
        ops[ed].push({ op: 'insert', path: `/chapters/${ci}/sections/${si == null ? '-' : si}`, value: { number: `${c.number}.${(c.sections || []).length + 1}`, title: pick(spec.title, ed) ?? '', blocks: [{ kind: 'prose', paragraphs: [pick(spec.text, ed) ?? ''] }] } });
      }
      return { ...done(ops), where: `${eds[E[0]].chapters[ci].number || ''} ${eds[E[0]].chapters[ci].title || ''}`.trim() };
    }
    if (op === 'deleteSection' || op === 'editSection') {
      const L = locate(eds, (d) => sections(d, spec.section), secSig);
      if (L.status) return none(L);
      for (const ed of E) {
        const s = secAt(eds[ed], L.at);
        if (op === 'deleteSection') ops[ed].push({ op: 'delete', path: P.sec(L.at), old: clone(s) });
        else { const v = pick(spec.title, ed); if (v != null && v !== '' && s.title !== v) ops[ed].push({ op: 'setText', path: `${P.sec(L.at)}/title`, value: v, old: s.title }); }
      }
      return { ...done(ops), where: `${secAt(eds[E[0]], L.at).number || ''} ${secAt(eds[E[0]], L.at).title || ''}`.trim() };
    }
    // replaceText
    const SC = scopeOf(eds, spec.section);
    if (SC.status) return none(SC);
    const scope = SC.at;
    let hits = 0;
    for (const ed of E) {
      const f = pick(spec.find, ed), r = pick(spec.replace, ed) ?? '';
      if (!f) continue;
      const d = eds[ed];
      const list = scope ? [...strings(secAt(d, scope).title, `${P.sec(scope)}/title`), ...strings(secAt(d, scope).blocks, `${P.sec(scope)}/blocks`)]
        : (d.chapters || []).flatMap((c, ci) => [...strings(c.title, `/chapters/${ci}/title`), ...(c.sections || []).flatMap((s, si) => [...strings(s.title, `/chapters/${ci}/sections/${si}/title`), ...strings(s.blocks, `/chapters/${ci}/sections/${si}/blocks`)])]);
      for (const [p, v] of list) if (v.includes(f)) { hits += 1; ops[ed].push({ op: 'setText', path: p, value: v.split(f).join(r), old: v }); }
    }
    if (!hits) return none({ status: 'notfound', reason: 'text' });
    return { ...done(ops), where: `${hits}` };
  }
  return { OPS, norm, plan, sections, chapters, fields };
})();
