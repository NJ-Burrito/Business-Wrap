// A portal form dump → one bw-harvest. A dump is what a page-walking script writes for one form in one language:
//
//   { route?, card: { title, panels: [{ legend, text }] },
//     form: [{ kind: 'field', tag, type, controlName, label, panel, required, options?, synthetic? }, …],
//     branches?: { '<controlName>-<option index>': [ the fields read after choosing that option ] } }
//
// Two files make one harvest: <stem>.ar.json and <stem>.en.json (the same page in two languages, read in the same
// order). Every rule below is a shape fact of such a dump, not a guess about a service:
// - the two languages align field by field (refused otherwise);
// - radio inputs sharing a controlName are ONE field: options = the radio labels, label = the panel legend;
// - a synthetic composite or a nameless select mirror that repeats a label already read is dropped;
// - a text input whose label names a date is a date picker;
// - a field read only after choosing an option gets shownWhen «<gate> = <option>»;
// - the attachment-name list re-read per branch gives each branch-only document its condition (docBranches);
// - an optional file input that is an attachment-name list's picker sits right after that list.
import fs from 'node:fs';

const ATT = /اسم المرفق|attachment/i;
const DATE = /تاريخ|\bdate\b/i;
const DESC = /وصف الخدمة|description/i;
// a domain lookup component (the account's registered products, the open tenders …) lists records of the system, not an
// enumeration: its options are whatever the harvest account held that day, never printed (SRS2). Generic lists stay.
// ponytail: named by the tag pattern taq-<thing>-select|list; add a tag here when a new generic list appears.
const DYNAMIC = (tag) => /^taq-[a-z-]+-(select|list)$/.test(tag || '') && !/^taq-(select-option|generic-lookup|countries-list)$/.test(tag);

const ftype = (x) => {
  const t = x.type || '', tag = x.tag || '';
  if (tag === 'textarea') return 'textarea';
  if (['radio', 'checkbox', 'file'].includes(t)) return t;
  if (tag.includes('upload-file')) return 'file';
  if (tag.startsWith('taq-') || tag.includes('select')) { if (x.options?.length || /list|lookup|select/.test(tag)) return 'select'; }
  if (tag === 'select') return 'select';
  if (DATE.test(x.label || '')) return 'date';
  return 'text';
};

/** (ar, en) field pairs after radio grouping and mirror drops. */
function collapse(ar, en, prefix) {
  const out = []; const seen = new Set(); const radios = new Map();
  ar.forEach((a, i) => {
    const e = en[i] || a; const cn = a.controlName;
    if (a.type === 'radio' && cn) {
      const r = radios.get(cn);
      if (r) { if (!r[0].options.includes(a.label)) { r[0].options.push(a.label); r[1].options.push(e.label); } r[0].required = r[1].required = r[0].required || !!a.required; return; }
      const fa = { key: cn, type: 'radio', label: a.panel || cn, required: !!a.required, options: [a.label], _panel: a.panel };
      const fe = { key: cn, type: 'radio', label: e.panel || cn, required: !!a.required, options: [e.label], _panel: e.panel };
      radios.set(cn, [fa, fe]); out.push([fa, fe]); seen.add(fa.label); return;
    }
    const lab = a.label || '';
    if ((a.synthetic || (!cn && /select-option/.test(a.tag || ''))) && seen.has(lab)) return;
    if (a.synthetic && ar.some((y) => lab === (y.label || '') && !y.synthetic)) return;
    const t = ftype(a); const k = cn || `${prefix}f${out.length}`;
    const fa = { key: k, type: t, label: lab, required: !!a.required, _panel: a.panel };
    const fe = { key: k, type: t, label: e.label || lab, required: !!a.required, _panel: e.panel };
    if (a.accept) fa.accept = fe.accept = a.accept;
    if (a.options?.length) { fa.options = a.options; fe.options = e.options?.length ? e.options : a.options; }
    if (DYNAMIC(a.component || a.tag)) fa.dynamic = fe.dynamic = true;
    out.push([fa, fe]); seen.add(lab);
  });
  return out;
}

/** Two parsed dumps (ar, en) → a bw-harvest. */
export function fromDump(L, { name = '', startUrl = '' } = {}) {
  const fields = (lc, lst) => (lst || []).filter((x) => x.kind === 'field');
  const A = fields('ar', L.ar.form), E = fields('en', L.en.form);
  if (A.length !== E.length || A.some((a, i) => (a.controlName || null) !== (E[i].controlName || null))) throw new Error(`dump: the AR and EN form reads do not align (${A.length} vs ${E.length} fields)`);
  const base = collapse(A, E, '');
  const have = new Set(base.map(([a]) => `${a.label}|${a.type}`));
  const gates = new Map(base.map((p) => [p[0].key, p]));
  const merged = [];
  for (const [bk, blist] of Object.entries(L.ar.branches || {})) {
    const cut = bk.lastIndexOf('-'); const gk = bk.slice(0, cut); const i = Number(bk.slice(cut + 1));
    const g = gates.get(gk); if (!g) continue;
    const ba = fields('ar', blist); let be = fields('en', L.en.branches?.[bk]); if (be.length !== ba.length) be = ba;
    const ca = `${g[0].label} = ${g[0].options?.[i] ?? i}`, ce = `${g[1].label} = ${g[1].options?.[i] ?? i}`;
    for (const [fa, fe] of collapse(ba, be, `${gk}.${i}.`)) {
      if (have.has(`${fa.label}|${fa.type}`) || fa.type === 'radio') continue;
      const m = merged.find((x) => x.gk === gk && x.p[0].label === fa.label && x.p[0].type === fa.type);
      if (m) { if (!m.p[0].shownWhen.includes(ca)) { m.p[0].shownWhen.push(ca); m.p[1].shownWhen.push(ce); } continue; }
      fa.key = fe.key = `${gk}.b${merged.length}`; fa.shownWhen = [ca]; fe.shownWhen = [ce];
      merged.push({ gk, p: [fa, fe] });
    }
  }
  const order = base.flatMap((p) => [p, ...merged.filter((x) => x.gk === p[0].key).map((x) => x.p)]);
  const steps = (idx) => {
    const st = new Map();
    for (const pair of order) {
      const { _panel, ...f } = pair[idx]; const panel = _panel || '';
      if (!st.has(panel)) st.set(panel, { title: panel, fields: [], validations: [] });
      st.get(panel).fields.push(f);
    }
    for (const s of st.values()) {
      const isList = (f) => f.type === 'select' && ATT.test(f.label || '');
      const files = s.fields.filter((f) => f.type === 'file' && !f.required && ATT.test(f.label || ''));
      const li = s.fields.findIndex(isList);
      if (files.length && li >= 0) { s.fields = s.fields.filter((f) => !files.includes(f)); const j = s.fields.findIndex(isList); s.fields.splice(j + 1, 0, { ...files[0], label: '' }); }
    }
    return [...st.values()];
  };
  const card = (lc) => { const c = L[lc].card || {}; return { title: c.title || '', description: (c.panels || []).filter((p) => DESC.test(p.legend || '') && p.text).map((p) => p.text), facts: [], lists: [] }; };
  const docBranches = (lc) => {
    const docs = (lst) => fields(lc, lst).filter((x) => ftype(x) === 'select' && ATT.test(x.label || '')).flatMap((x) => x.options || []);
    const all = docs(L[lc].form);
    if (!Object.keys(L[lc].branches || {}).length || !all.length) return null;
    const out = {};
    for (const [bk, blist] of Object.entries(L[lc].branches || {})) {
      const cut = bk.lastIndexOf('-'); const g = gates.get(bk.slice(0, cut)); if (!g) continue;
      const gg = g[lc === 'ar' ? 0 : 1]; const i = Number(bk.slice(cut + 1));
      for (const d of docs(blist)) if (!all.includes(d)) (out[d] ||= []).push(`${gg.label} = ${gg.options?.[i] ?? i}`);
    }
    return out;
  };
  const languages = {};
  for (const [lc, idx] of [['ar', 0], ['en', 1]]) {
    languages[lc] = { startUrl: startUrl || L[lc].route || '', card: card(lc), steps: steps(idx), statuses: [], stoppedBeforeSubmit: true };
    const db = docBranches(lc);
    const st = db && languages[lc].steps.find((s) => s.fields.some((f) => f.type === 'file'));
    if (st) st.docBranches = db;
  }
  return { kind: 'bw-harvest', version: 1, name, harvestedAt: L.ar.harvestedAt || L.ar.source?.at || null, source: { kind: 'dump', fields: order.length, branchOnly: merged.length }, languages };
}

/** <stem>.ar.json (or the stem itself) → the pair read from disk and imported. */
export function readDump(file, opts = {}) {
  const stem = String(file).replace(/\.(ar|en)\.json$/i, '');
  const rd = (lc) => JSON.parse(fs.readFileSync(`${stem}.${lc}.json`, 'utf8'));
  return fromDump({ ar: rd('ar'), en: rd('en') }, opts);
}
