// Two importers that turn what a person (or a read-only crawl) saw on the system into evidence files:
//
//   recordFromPage(dump, { key }) → bw-service-record   the back office's request-type page (read-only form)
//   walkFromScreens(screens, { ref }) → bw-walk         a request filed and advanced desk by desk
//
// dump    { url?, fields: [{ label, value }] }: label/value pairs as the page shows them
// screens [{ desk, sections?, buttons?, status?, autoAssign?, returned?, displayCriteria? }] in walk order;
//         desk 'submit' is the applicant's form
// Nothing is inferred: a label the map does not know is kept in `unmapped`, never guessed into a fact.
import { fold } from '../srs/model.mjs';

const MAP = [
  [/^(رمز الخدمة|كود الخدمة|service code)$/i, 'code'],
  [/^(رمز الرسوم|رموز الرسوم|كود الرسوم|fee codes?)$/i, 'feeCodes'],
  [/^(المديرية|الإدارة|directorate|department)$/i, 'adminReference'],
  [/^(القسم|section)$/i, 'adminReference'],
  [/^(الشعبة|الوحدة|division|unit)$/i, 'adminReference'],
  [/^(مركزي|مركزية|مركزي\s*؟|central\??)$/i, 'central'],
  [/^(مدة الصلاحية|الصلاحية|validity)$/i, 'validity'],
  [/^(اسم الخدمة|service name)$/i, 'name'],
];
const YES = /^(نعم|yes|true|1|✓)$/i;

export function recordFromPage(dump, { key = '', ref } = {}) {
  const facts = { adminReference: [] };
  const unmapped = [];
  for (const { label, value } of dump.fields || []) {
    const l = String(label || '').replace(/[:：*]\s*$/, '').trim();
    const v = String(value ?? '').trim();
    const hit = MAP.find(([re]) => re.test(l) || re.test(fold(l)));
    if (!hit || !v) { if (l) unmapped.push(l); continue; }
    const k = hit[1];
    if (k === 'adminReference') facts.adminReference.push([{ ar: l, en: l }, { ar: v, en: v }]);
    else if (k === 'feeCodes') facts.feeCodes = v.split(/[،,;\s]+/).filter(Boolean);
    else if (k === 'central') facts.place = YES.test(v) ? { ar: 'مركزي', en: 'Central' } : { ar: 'غير مركزي', en: 'Not central' };
    else if (k === 'validity') facts.validity = { ar: v, en: v };
    else facts[k] = v;
  }
  if (!facts.adminReference.length) delete facts.adminReference;
  return { kind: 'bw-service-record', version: 1, key, source: { kind: 'record-page', ref: ref || dump.url || 'back-office request-type page' }, facts, unmapped };
}

/** Merge a record-page record under a hand record: the hand record's stated facts win, the page fills the rest. */
export function mergeRecords(hand, page) {
  if (!page) return hand;
  if (!hand) return page;
  const facts = { ...page.facts, ...Object.fromEntries(Object.entries(hand.facts || {}).filter(([, v]) => v !== undefined)) };
  if (page.facts.feeCodes && Array.isArray(facts.fees)) facts.fees = facts.fees.map((f, i) => (f.code ? f : { ...f, code: page.facts.feeCodes[i] }));
  if (page.facts.validity && Array.isArray(facts.outputs)) facts.outputs = facts.outputs.map((o) => (o.validity ? o : { ...o, validity: page.facts.validity }));
  const sources = { ...(hand.sources || {}) };
  for (const k of Object.keys(page.facts)) if (!(k in (hand.facts || {}))) sources[k] = page.source;
  return { ...hand, facts, sources };
}

export function walkFromScreens(screens, { ref = 'site walk' } = {}) {
  const desks = []; const statuses = [];
  for (const s of screens || []) {
    if (s.status && !statuses.some((x) => fold(x.ar ?? x) === fold(s.status.ar ?? s.status))) statuses.push(typeof s.status === 'string' ? { ar: s.status, en: s.status } : s.status);
    if (!s.desk) continue;
    const key = typeof s.desk === 'string' ? s.desk : s.desk.key || s.desk.en;
    const d = desks.find((x) => x.key === key) || (desks.push({ key, name: typeof s.desk === 'string' ? { ar: s.desk, en: s.desk } : s.desk, sections: [], actions: [] }), desks.at(-1));
    for (const sec of s.sections || []) if (!d.sections.some((x) => fold(x.ar ?? x) === fold(sec.ar ?? sec))) d.sections.push(sec);
    for (const b of s.buttons || []) { const label = typeof b === 'string' ? { ar: b, en: b } : b.label || b; const k = (typeof b === 'object' && b.key) || fold(label.en || label.ar).replace(/\s+/g, '-'); if (!d.actions.some((x) => x.key === k)) d.actions.push({ key: k, label }); }
    if (s.autoAssign) d.autoAssign = true;
    if (s.returned) d.returned = s.returned;
    if (s.displayCriteria) d.displayCriteria = s.displayCriteria;
  }
  return { kind: 'bw-walk', version: 1, ref, desks, statuses };
}
