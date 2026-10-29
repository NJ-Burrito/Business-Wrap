// The neutral requirements model: one bilingual description of a business process, built from evidence,
// that every template pack reads. Domain-agnostic: a stage is a stage whether it is a desk in an agency,
// a warehouse step in an e-shop or a disposition in a call centre.
//
//   buildModel({ ir, raw, record, profile, text }) → model
//
// ir      a process model (engine/harvest/model.mjs IR, kind bw-process): actors, steps, flows
// raw     a crawl harvest (kind bw-harvest): the customer-facing form and card, per language
// record  a service record (kind bw-service-record, bible/contracts/service-record.schema.json): the facts a
//         form and a model cannot show (fees, legislation, integrations, outputs, desk sections …), each with a source
// profile the organisation profile (kind bw-profile): names, terms, code table, caption overrides
//
// Every value is { ar, en } (a string counts for both) and every element carries `source`.
import { humanGraph } from '../harvest/model.mjs';

export const bi = (v) => (v == null ? null : typeof v === 'string' || typeof v === 'number' ? { ar: String(v), en: String(v) } : { ar: v.ar ?? v.en ?? '', en: v.en ?? v.ar ?? '' });
export const pick = (v, locale) => (v == null ? '' : typeof v === 'string' ? v : v[locale] ?? v.en ?? v.ar ?? '');
const norm = (s) => String(s || '').toLowerCase().replace(/[_\s]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
const isExpr = (s) => /\$\{|#\{/.test(String(s || ''));
/** Arabic-insensitive comparison key: أإآ→ا, ة→ه, ى→ي, ئ→ي, ؤ→و, diacritics and tatweel stripped, spaces collapsed. */
export const fold = (s) => String(s ?? '').normalize('NFC').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[ً-ْٰـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و').replace(/[«»"'()\[\],،.:؛;-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
/** A label that is only a key («need-edit», «approve_request», or the key itself) is no caption. */
export const keyish = (v, key = '') => !v || (key && String(v).trim() === key) || /^[a-z0-9]+([-_][a-z0-9]+)+$/.test(String(v).trim());
/** Every string of a record/harvest at load: NFC, and the hamza-above mark after a yeh folded into «ئ» (D19). */
export const normText = (o) => (typeof o === 'string' ? o.normalize('NFC').replace(/[\u064a\u0649]\u0654/g, '\u0626') : Array.isArray(o) ? o.map(normText) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, normText(v)])) : o);
const RAW_ID = /^(sid-[0-9a-f-]{8,}|[0-9a-f]{8}-[0-9a-f-]{20,})$/i;
/** The first real name per edition among candidates ({ar, en} or a string); keys and raw ids are no names. */
const nameOf = (...cands) => {
  const out = {};
  for (const lc of ['ar', 'en']) for (const c of cands) { const v = c == null ? '' : typeof c === 'string' ? c : c[lc]; if (v && String(v).trim() && !keyish(v) && !RAW_ID.test(v)) { out[lc] = String(v).trim(); break; } }
  return out.ar || out.en ? bi(out) : null;
};

/* ── action captions: the system's own word first, a clean derived word second, never a raw key ── */
const CAPTION_RULES = [
  [/^(send|forward|refer|submit|move|transfer)-?to-(.+)$/, 'sendTo'],
  [/^(return|back|send-back)-?to-(.+)$/, 'returnTo'],
  [/^(need|needs|request|ask)-?(edit|edits|changes|change|info|completion)$|^(return|rework|edit)$/, 'needEdit'],
  [/^re-?submit|^resend$|^send-again$/, 'resubmit'],
  [/^(approve|approved|accept|accepted|ok|confirm)$/, 'approve'],
  [/^(reject|rejected|refuse|decline|deny)$/, 'reject'],
  [/^(cancel|cancelled|withdraw|abort)$/, 'cancel'],
  [/^(pay|paid|payment|checkout)$/, 'pay'],
  [/^(complete|done|finish|resolve|resolved)$/, 'complete'],
  [/^escalate/, 'escalate'],
  [/^assign/, 'assign'],
  [/^close/, 'close'],
  [/^(call-?back|schedule|reschedule)/, 'callback'],
  [/^(ship|dispatch|deliver)/, 'ship'],
  [/^refund/, 'refund'],
  [/^(submit|send)$/, 'submit'],
];
/** The caption key of an action, from its condition value or its label (`${action=='send-to-unit-head'}` → send-to-unit-head). */
export function actionKey(flow) {
  const m = /==\s*['"]([^'"]+)['"]/.exec(String(flow.condition || ''));
  return norm(m ? m[1] : flow.label || '');
}
export function captionKind(key) {
  for (const [re, kind] of CAPTION_RULES) { const m = re.exec(key); if (m) return { kind, rest: m[2] || '' }; }
  return null;
}
const OUTCOME = [[/approv|accept|complete|done|success|issued|ok$/i, 'approved'], [/reject|refus|declin|denied/i, 'rejected'], [/cancel|withdraw|abort/i, 'cancelled'], [/expire|timeout|time-out/i, 'expired'], [/close/i, 'closed']];
export const outcomeOf = (name) => (OUTCOME.find(([re]) => re.test(String(name || ''))) || [null, null])[1];
// an end that is not plainly a success is a neutral close: the document never calls «not renewed» approved
const POSITIVE = /approv|accept|complete|done|success|issued|renew|deliver|won|paid|granted|موافق|مكتمل|تم /i;
const STOP = /reject|refus|cancel|declin|denied|expired|رفض|مرفوض|إلغاء|الغاء|ملغ|انتهاء/i;
const PAY = /\bpay|payment|fee|checkout|دفع|رسوم|سداد/i;
const CUSTOMER = /\b(applicant|customer|citizen|requester|requestor|shopper|buyer|lead|client|user)\b|مقدم الطلب|العميل|المتسوق|المواطن/i;
const REWORK = /edit-by|by-applicant|by-customer|rework|amend|resubmit|correct|تعديل|استكمال/i;

/** The words a profile/pack calls things, as one lookup: profile terms win over the pack glossary. */
export const terms = (pack, profile, locale) => ({ ...(pack?.glossary?.[locale] || {}), ...Object.fromEntries(Object.entries(profile?.terms || {}).map(([k, v]) => [k, pick(v, locale)])), entity: pick(profile?.entity, locale) || pick(pack?.glossary?.[locale]?.entity, locale) });

/* ── the model ─────────────────────────────────────────────────────────── */
export function buildModel({ ir = null, raw = null, record = null, profile = {}, text, names: nameMap = {}, walk = null, messages = null, previous = null, register = null } = {}) {
  const F = record?.facts || {};
  const src = (k) => record?.sources?.[k] || (record?.source ? { ...record.source } : null);
  const T = text; // core text (ar/en), for derived captions
  const m = {
    kind: 'bw-requirements', version: 1,
    key: record?.key || raw?.name || ir?.key || '',
    name: null,
    code: null, actors: [], stages: [], ends: [], systemSteps: [], timers: [], fields: [], documents: [], fees: [], outputs: [], recipients: [],
    channels: [], legislation: [], assumptions: [], adminReference: [], integrations: { internal: [], services: [], dataSources: [], partners: [] },
    languages: [], statuses: [], notifications: [], kpis: [], slas: [], description: null, place: null, serial: null, earlierIssue: F.earlierIssue || null,
    sources: {}, questions: [], derivedCaptions: [], harvestConflicts: [], notes: [], preparedBy: null,
  };
  const put = (k, v, s) => { m[k] = v; if (s) m.sources[k] = s; };
  // the title: the record's own name, then the customer-facing card title (the name the public sees),
  // then the process model's name. A losing name that differs is kept as a harvest conflict, never printed.
  const cardT = raw?.languages?.ar?.card?.title || raw?.languages?.en?.card?.title;
  const cardName = cardT ? { ar: raw.languages.ar?.card?.title || cardT, en: raw.languages.en?.card?.title || ir?.names?.en || cardT } : null;
  const irName = ir?.names ? bi(ir.names) : ir?.name ? bi(ir.name) : null;
  const cands = [[F.name && bi(F.name), 'record'], [cardName && bi(cardName), 'crawl'], [irName, 'model']].filter(([v]) => v && (v.ar || v.en));
  put('name', cands[0]?.[0] || bi(raw?.name || 'Service'), cands[0] ? { kind: cands[0][1], ref: cands[0][1] === 'crawl' ? 'card title' : 'name' } : null);
  for (const [v, k] of cands.slice(1)) if (fold(v.ar) !== fold(m.name.ar)) m.harvestConflicts.push({ field: 'name', kept: { source: cands[0][1], value: m.name }, lost: { source: k, value: v } });
  // the document code is looked up (record, then the profile's table), never derived from the name
  const keys = [record?.key, raw?.name, ir?.key, pick(m.name, 'ar'), pick(m.name, 'en')].filter(Boolean);
  const code = F.code || record?.code || keys.map((k) => profile?.codes?.[k]).find(Boolean) || null;
  if (code) put('code', String(code), F.code || record?.code ? src('code') : { kind: 'profile', ref: 'codes' });

  /* the customer-facing card and form (crawl) */
  const L = raw?.languages || {};
  const card = (lc) => L[lc]?.card || {};
  const list = (lc, re) => (card(lc).lists || []).find((li) => re.test(li.title || ''))?.items || [];
  const cardList = (re) => { const ar = list('ar', re), en = list('en', re); const n = Math.max(ar.length, en.length); return Array.from({ length: n }, (_, i) => ({ ar: ar[i] ?? en[i], en: en[i] ?? ar[i] })); };
  const crawlSrc = (what) => ({ kind: 'crawl', ref: `${raw?.name || 'harvest'}: ${what}` });
  if (raw) {
    const d = card('ar').description?.[0] || card('en').description?.[0];
    if (d) put('description', { ar: card('ar').description?.[0] || d, en: card('en').description?.[0] || d }, crawlSrc('card description'));
    const rec = cardList(/متلقي|المستفيد|الفئ|شرائح|recipient|beneficiar|who can|segment|eligib|audience/i); if (rec.length) put('recipients', rec, crawlSrc('card recipients'));
    const ch = cardList(/قنوات|channel|where/i); if (ch.length) put('channels', ch, crawlSrc('card channels'));
    const fees = cardList(/رسوم|fee|price|cost/i); if (fees.length) put('fees', fees.map((x) => ({ amount: x })), crawlSrc('card fees'));
    put('languages', Object.keys(L).filter((k) => (L[k].steps || []).length || L[k].card?.title), crawlSrc('languages read'));
  }
  // facts from the record win where they are stated (they are the system's own record)
  for (const k of ['recipients', 'channels', 'legislation', 'assumptions', 'adminReference', 'outputs', 'statuses', 'notifications', 'kpis', 'slas', 'languages']) if (Array.isArray(F[k])) put(k, F[k], src(k));
  if (Array.isArray(F.fees)) put('fees', F.fees, src('fees'));
  if (F.description) put('description', bi(F.description), src('description'));
  if (F.place) put('place', bi(F.place), src('place'));
  if (F.serial || profile?.serial) put('serial', F.serial || profile.serial, F.serial ? src('serial') : { kind: 'profile', ref: 'serial' });
  for (const k of ['internal', 'services', 'dataSources', 'partners']) if (Array.isArray(F.integrations?.[k])) { m.integrations[k] = F.integrations[k]; m.sources[`integrations.${k}`] = src(`integrations.${k}`); }

  /* fields: the crawl's form controls, AR and EN joined by key */
  const steps = (lc) => (L[lc]?.steps || []);
  const enByKey = new Map(steps('en').flatMap((s) => s.fields || []).map((f) => [f.key, f]));
  const NOT_FIELD = /captcha|recaptcha|turnstile/i;
  const ATT = /(اسم|نوع)\s*المرفق|attachment\s*(name|type)|document\s*(name|type)/i;
  const base = steps('ar').length ? 'ar' : 'en';
  const unpaired = [];
  steps(base).forEach((s, si) => {
    const fs = (s.fields || []).filter((f) => !NOT_FIELD.test(`${f.key} ${f.label}`));
    fs.forEach((f, i) => {
      const e = enByKey.get(f.key) || f;
      const a = base === 'ar' ? f : (steps('ar').flatMap((x) => x.fields || []).find((x) => x.key === f.key) || f);
      // attachments are documents: a file input beside an attachment-name list is that list's picker (below);
      // an upload control on its own is one document, named by its label (D06)
      if (f.type === 'file') {
        if ([fs[i - 1], fs[i + 1]].some((x) => x?.type === 'select' && ATT.test(x.label || '')) || !(a.label || e.label)) return;
        unpaired.push({ name: { ar: a.label || e.label, en: e.label || a.label }, required: !!(f.required || e.required), formats: String(f.accept || '').split(',').map((x) => x.replace(/^\.|\.$/g, '').trim()).filter(Boolean).join(', '), multiple: !!f.multiple, by: 'customer', source: crawlSrc(`step ${si + 1} upload «${f.key}»`) });
        return;
      }
      if (f.type === 'select' && ATT.test(f.label || '') && [fs[i - 1], fs[i + 1]].some((x) => x?.type === 'file')) {
        (a.options || []).forEach((o, k) => {
          const oe = (e.options || [])[k] ?? o;
          const opt = /غير\s*(إجباري|اجباري)|optional|not\s*required/i.test(`${o} ${oe}`);
          const multi = /متعدد|multiple/i.test(`${o} ${oe}`);
          const clean = (x) => String(x).replace(/\s*\([^)]*\)\s*$/, '').trim();
          const file = [fs[i - 1], fs[i + 1]].find((x) => x?.type === 'file');
          m.documents.push({ name: { ar: clean(o), en: clean(oe) }, required: !opt, formats: (file?.accept || '').split(',').map((x) => x.replace(/^\.|\.$/g, '').trim()).filter(Boolean).join(', '), multiple: multi, by: 'customer', source: crawlSrc(`step ${si + 1} attachment list`) });
        });
        return;
      }
      m.fields.push({ key: f.key, label: { ar: a.label || e.label, en: e.label || a.label }, type: f.type, required: !!(f.required || e.required), editable: true, options: { ar: a.options || [], en: e.options || a.options || [] }, shownWhen: f.shownWhen || null, dynamic: !!(f.dynamic || e.dynamic), stage: 'submit', section: { ar: s.title || '', en: (steps('en')[si] || {}).title || s.title || '' }, source: crawlSrc(`step ${si + 1} «${f.key}»`) });
    });
  });
  if (m.documents.length) m.sources.documents = m.documents[0].source;
  // the record's list keeps its source, so a list stated empty prints «none», not a question (D09)
  if (Array.isArray(F.documents)) put('documents', F.documents.map((d) => ({ ...d, name: bi(d.name), source: src('documents') })), src('documents'));
  for (const u of unpaired) if (!m.documents.some((d) => fold(pick(d.name, 'ar')) === fold(u.name.ar) || fold(pick(d.name, 'en')) === fold(u.name.en))) m.documents.push(u);
  if (m.documents.length && !m.sources.documents) m.sources.documents = m.documents[0].source;
  for (const fl of m.fields) {
    if (F.fieldIntegrations?.[fl.key]) fl.integration = bi(F.fieldIntegrations[fl.key]);
    if (F.fieldDefaults?.[fl.key]) fl.default = bi(F.fieldDefaults[fl.key]);
  }

  /* integrations the record is silent on: the profile's panel/control → row table, applied to this form (D20) */
  for (const rule of profile?.integrationRules || []) {
    const k = rule.of;
    if (!m.integrations[k] || Array.isArray(F.integrations?.[k]) || !raw) continue;
    const all = (lc) => steps(lc).flatMap((s) => (s.fields || []).map((f) => ({ ...f, panel: s.title || '' })));
    const re = (x) => (x ? new RegExp(x, 'i') : null);
    const W = rule.when || {};
    const hit = (f) => (!W.panel || re(W.panel).test(f.panel)) && (!W.control || re(W.control).test(f.key || '')) && (!W.label || re(W.label).test(f.label || ''));
    const s0 = { kind: 'crawl+rule', ref: `profile integrationRules «${rule.id || k}» on ${raw.name || 'harvest'}` };
    const fillR = (v, o) => (v == null ? v : bi({ ar: pick(v, 'ar').replace('{option}', o.ar), en: pick(v, 'en').replace('{option}', o.en) }));
    const rows = [];
    if (rule.perOption) {
      const fa = all(base).find((f) => re(rule.perOption.control).test(f.key || '')); const fe = fa && all('en').find((f) => f.key === fa.key);
      (fa?.options || []).forEach((o, i) => {
        const opt = { ar: base === 'ar' ? o : (fe?.options?.[i] ?? o), en: fe?.options?.[i] ?? o };
        const cs = (rule.cases || []).find((c) => re(c.match).test(fold(opt.ar)) || re(c.match).test(opt.en));
        rows.push(Object.fromEntries(['name', 'description', 'sent', 'received'].filter((c) => rule.row?.[c] || cs?.[c]).map((c) => [c, fillR(cs?.[c] || rule.row[c], opt)])));
      });
    } else if (all(base).some(hit) || (W.panel && steps(base).some((s) => re(W.panel).test(s.title || '')))) rows.push(Object.fromEntries(Object.entries(rule.row || {}).map(([c, v]) => [c, bi(v)])));
    if (rows.length) { m.integrations[k].push(...rows); m.sources[`integrations.${k}`] ||= s0; }
  }

  /* the site walk (strongest source): desks seen, their action bars verbatim, the statuses shown */
  const walkDesks = (walk?.desks || []).map((d) => ({ ...d, __walk: true, __used: false }));
  const same = (a, b) => !!a && !!b && fold(a) === fold(b);
  const walkDesk = (t, nm) => { const d = walkDesks.find((x) => !x.__used && ([t.id, t.name].includes(x.key) || [pick(nm, 'ar'), pick(nm, 'en'), t.name].some((n) => same(n, pick(x.name, 'ar')) || same(n, pick(x.name, 'en'))))); if (d) d.__used = true; return d; };
  if (walk && Array.isArray(walk.statuses) && !Array.isArray(F.statuses)) put('statuses', walk.statuses, { kind: 'walk', ref: walk.ref || 'site walk: statuses shown' });

  /* stages: the customer's submission, then the model's people's steps in walk order */
  m.actors.push({ id: 'customer', side: 'customer', name: null, source: { kind: 'pack', ref: 'glossary.customer' } });
  m.stages.push({ id: 'submit', kind: 'customer', name: null, actor: 'customer', actions: [], fields: m.fields.map((f) => f.key), sections: F.desks?.submit?.sections || [...new Map(m.fields.map((f) => [pick(f.section, 'ar'), f.section])).values()].filter((x) => pick(x, 'ar')), source: raw ? crawlSrc('form') : { kind: 'pack', ref: 'customer stage' } });
  if (ir) {
    const names = (s) => (s.names ? bi(s.names) : s.name && !RAW_ID.test(s.name) ? bi(s.name) : null);
    const custActor = new Set((ir.actors || []).filter((a) => CUSTOMER.test(`${a.name} ${a.raw || ''}`) || (profile.customerActors || []).includes(a.name)).map((a) => a.id));
    for (const a of (ir.actors || []).filter((x) => !custActor.has(x.id))) m.actors.push({ id: a.id, side: 'staff', name: a.names ? bi(a.names) : bi(a.name), raw: a.raw || '', source: { kind: 'model', ref: `${ir.key || ir.name}: actor ${a.id}` } });
    const g = humanGraph(ir);
    const byId = Object.fromEntries(ir.steps.map((s) => [s.id, s]));
    // walk order from the start (BFS), so "back" and "forward" mean what a reader means
    const order = []; const seen = new Set(); const q = ir.steps.filter((s) => s.type === 'start').map((s) => s.id);
    while (q.length) { const id = q.shift(); if (seen.has(id)) continue; seen.add(id); order.push(id); for (const f of ir.flows.filter((x) => x.from === id)) q.push(f.to); }
    for (const s of ir.steps) if (!seen.has(s.id)) order.push(s.id);
    const rank = Object.fromEntries(order.map((id, i) => [id, i]));
    const tasks = order.map((id) => byId[id]).filter((s) => s.type === 'task');
    const demoted = new Set();
    for (const t of tasks) {
      const key = `${t.name || ''} ${t.id}`;
      const mine = !t.actor || custActor.has(t.actor);
      const payNamed = PAY.test(key) || PAY.test(pick(names(t), 'en'));
      // a payment stage needs a fee on record; a payment-named task without one is a system step, noted
      if (payNamed && !m.fees.length) { demoted.add(t.id); m.systemSteps.push({ id: t.id, name: names(t) || bi(t.name), demoted: 'payment-without-fee', source: { kind: 'model', ref: `${ir.key || ir.name}: task ${t.name || t.id}` } }); m.notes.push({ kind: 'payment-without-fee', id: t.id, text: 'payment-named task, no fee on record: described as a system step' }); continue; }
      const kind = payNamed ? 'payment' : (custActor.has(t.actor) || (!t.actor && (REWORK.test(key) || REWORK.test(pick(names(t), 'en'))))) ? 'rework' : 'review';
      const recDesk = F.desks?.[t.name] || F.desks?.[t.id];
      const wd = walkDesk(t, names(t));
      const desk = wd || recDesk || {};
      // the stage's name per edition: the walk › the names file › the record's desk name › the model (D02)
      const stName = nameOf(wd?.name, t.names, recDesk?.name, RAW_ID.test(t.name || '') ? null : t.name) || bi(t.name);
      m.stages.push({ id: t.id, key: t.name, kind, name: stName, deskObserved: !!wd || recDesk?.observed === true, actions: [], actor: kind === 'review' ? (mine ? null : t.actor) : 'customer', sections: desk.sections || [], tasks: desk.tasks || [], fields: [], autoAssign: !!desk.autoAssign, deskActions: desk.actions || null, returned: desk.returned || null, displayCriteria: desk.displayCriteria || null, presentIn: ['model', ...(desk.__walk ? ['walk'] : []), ...(recDesk ? ['record'] : [])], source: { kind: 'model', ref: `${ir.key || ir.name}: task ${t.name || t.id}` }, rank: rank[t.id] });
    }
    for (const s of ir.steps.filter((x) => x.type === 'end')) m.ends.push({ id: s.id, name: names(s) || bi(s.name), outcome: (() => { const n = `${s.name} ${pick(names(s), 'en')}`; if (/\bnot\b|\bno\b|lost|fail|لم /i.test(n)) return STOP.test(n) ? 'rejected' : 'closed'; return outcomeOf(n) || (STOP.test(n) ? 'rejected' : POSITIVE.test(n) ? 'approved' : 'closed'); })(), source: { kind: 'model', ref: `${ir.key || ir.name}: end ${s.name || s.id}` } });
    for (const s of ir.steps.filter((x) => x.type === 'system')) m.systemSteps.push({ id: s.id, name: bi(s.name), source: { kind: 'model', ref: `${ir.key || ir.name}: system step ${s.name}` } });
    // a timer's duration: its literal, or — for an expression (${edit_duration}) — the names file or the record's
    // stated system variable of that name (facts.slas), with that source (D07)
    const timerOf = (raw, base) => {
      const r = String(raw || '');
      if (!isExpr(r)) return { ...base, duration: r ? bi(nameMap[r] || r) : null, raw: r };
      const v = (/\$\{\s*([\w.]+)\s*\}/.exec(r) || [])[1] || '';
      if (nameMap[r] || (v && nameMap[v])) return { ...base, duration: bi(nameMap[r] || nameMap[v]), raw: r, variable: v, source: { ...base.source, ref: `${base.source.ref}; duration from the names file «${v}»` } };
      const i = v ? m.slas.findIndex((x) => x.variable === v || `${pick(x.stage, 'en')} ${pick(x.stage, 'ar')}`.split(/[^\w]+/).includes(v)) : -1;
      if (i < 0) return { ...base, duration: null, raw: r, variable: v };
      // the reader's words, without the machine form beside them («30 يوماً (P30D)» → «30 يوماً»)
      const t = bi(m.slas[i].target); const iso = (x) => String(x).replace(/\s*\(P[0-9YMWDTHS.]+\)\s*$/, '');
      return { ...base, duration: { ar: iso(t.ar), en: iso(t.en) }, raw: r, variable: v, sla: i, source: m.sources.slas || base.source };
    };
    for (const f of ir.flows.filter((x) => x.timer && byId[x.to]?.type !== 'timer')) m.timers.push(timerOf(f.label, { id: `timer-${f.from}`, stage: f.from, to: f.to, source: { kind: 'model', ref: `${ir.key || ir.name}: timer on ${f.from}` } }));
    for (const s of ir.steps.filter((x) => x.type === 'timer')) m.timers.push(timerOf(s.timer || s.name, { id: s.id, stage: s.attachedTo, source: { kind: 'model', ref: `${ir.key || ir.name}: timer on ${s.attachedTo}` } }));
    // actions: the routing out of each people's step (through decisions and system steps), captioned
    const stageOf = (id) => m.stages.find((s) => s.id === id);
    const endOf = (id) => m.ends.find((e) => e.id === id);
    const visible = (id) => { const n = byId[id]; return n && ((n.type === 'task' && !demoted.has(id)) || n.type === 'end'); };
    const targets = (from) => { // flows from a stage, followed through decisions/system steps to people or ends
      const out = []; const seenT = new Set();
      const go = (id, flow) => { for (const f of ir.flows.filter((x) => x.from === id && !x.timer)) { const n = byId[f.to]; if (!n || seenT.has(f.to + (f.label || ''))) continue; seenT.add(f.to + (f.label || '')); const fl = flow || (f.label || f.condition ? f : null); if (visible(f.to)) out.push({ to: f.to, flow: fl }); else if (n.type !== 'timer') go(f.to, fl); } };
      go(from, null); return out;
    };
    // a timer step leads where its own flow goes (through system steps)
    for (const t of m.timers) if (!t.to && byId[t.id]) t.to = targets(t.id)[0]?.to || null;
    for (const st of m.stages.filter((s) => s.id !== 'submit')) {
      for (const { to, flow } of targets(st.id)) {
        const key = flow ? actionKey(flow) : '';
        const tgtStage = stageOf(to); const tgtEnd = endOf(to);
        const effect = tgtEnd ? (tgtEnd.outcome === 'approved' ? 'endOk' : 'endStop') : st.kind === 'payment' ? 'pay' : tgtStage?.kind === 'rework' ? 'rework' : st.kind === 'rework' ? 'resubmit' : (tgtStage?.rank ?? 0) < (st.rank ?? 0) ? 'back' : 'forward';
        st.actions.push({ key, flowLabel: flow?.label || '', flowNames: flow?.names || null, to, effect, source: { kind: 'model', ref: `${ir.key || ir.name}: flow ${st.key || st.id} → ${byId[to]?.name || to}` } });
      }
    }
    // the submission goes where the start event leads (through payment, system steps)
    const first = targets(ir.steps.find((s) => s.type === 'start')?.id || '');
    for (const { to } of first) m.stages[0].actions.push({ key: 'submit', to, effect: 'submit', source: { kind: 'model', ref: `${ir.key || ir.name}: start` } });
    // routing the system decides (a gateway on a variable other than the action): a business rule per branch,
    // captioned from the names file; the system steps that compute the variable are traced to it (D08)
    const COND = /^\s*[$#]\{\s*([A-Za-z_][\w.]*)\s*===?\s*['"]([^'"]+)['"]\s*\}\s*$/;
    const before = (id, seenB = new Set()) => ir.flows.filter((f) => f.to === id && !f.timer).flatMap((f) => (seenB.has(f.from) ? [] : (seenB.add(f.from), byId[f.from]?.type === 'task' ? [f.from] : before(f.from, seenB))));
    const feeders = (id, seenF = new Set()) => ir.flows.filter((f) => f.to === id).flatMap((f) => (seenF.has(f.from) || byId[f.from]?.type !== 'system' ? [] : (seenF.add(f.from), [f.from, ...feeders(f.from, seenF)])));
    m.routing = [];
    for (const f of ir.flows) {
      const c = COND.exec(String(f.condition || ''));
      if (!c || /^actions?$/i.test(c[1]) || byId[f.from]?.type !== 'decision') continue;
      const tos = visible(f.to) ? [f.to] : targets(f.to).map((x) => x.to);
      const cap = (k) => (nameMap[k] ? bi(nameMap[k]) : null);
      for (const to of tos) if (!m.routing.some((r) => r.gate === f.from && r.value === c[2] && r.to === to)) m.routing.push({ gate: f.from, variable: c[1], value: c[2], to, after: before(f.from), via: feeders(f.from), variableName: cap(c[1]), valueName: cap(`${c[1]}=${c[2]}`) || cap(c[2]) || f.names || null, source: { kind: 'model', ref: `${ir.key || ir.name}: gateway ${byId[f.from]?.name || f.from} (${c[1]} = ${c[2]})` } });
    }
    m.graph = g;
    m.demoted = [...demoted];
  }
  m.stages[0].actions.push({ key: 'cancel', to: null, effect: 'leave', source: { kind: 'pack', ref: 'customer stage' } });
  m.walked = !!walk;
  m.stages[0].presentIn = [raw ? 'crawl' : 'pack'];
  const sub = walkDesks.find((d) => d.key === 'submit');
  if (sub) { sub.__used = true; m.stages[0].presentIn.push('walk'); if (sub.returned) m.stages[0].returned = sub.returned; if (sub.displayCriteria) m.stages[0].displayCriteria = sub.displayCriteria; }
  m.walkOnly = walkDesks.filter((d) => !d.__used).map((d) => ({ key: d.key || pick(d.name, 'en'), name: bi(d.name || d.key), source: { kind: 'walk', ref: walk.ref || 'site walk' } }));
  // auto-assignment: the record's desk walk, or a model attribute when the parser kept one
  for (const st of m.stages) if (ir?.steps?.find((s) => s.id === st.id)?.autoAssign) st.autoAssign = true;
  // approval: a review stage whose action ends the process as approved
  for (const st of m.stages) if (st.kind === 'review' && st.actions.some((a) => a.effect === 'endOk')) st.kind = 'approval';
  // outputs: stated in the record; else the profile says whether this kind of process has one
  if (!m.outputs.length && F.output) put('outputs', [F.output], src('output'));
  /* the message bundle: a line belongs to this service only when its key names one of this form's controls */
  if (messages) {
    const lines = Array.isArray(messages) ? messages : parseMessages(messages);
    const keyOf = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
    let n = 0;
    for (const ln of lines) {
      const k = keyOf(ln.key);
      const f = m.fields.filter((x) => keyOf(x.key).length > 2 && k.includes(keyOf(x.key))).sort((a, b) => keyOf(b.key).length - keyOf(a.key).length)[0];
      if (f) { (f.messages ||= []).push(ln.text); n += 1; }
    }
    m.messageReport = { attributed: n, leftOut: lines.length - n, total: lines.length };
  }
  /* the delivered earlier document: legislation/integrations/outputs where nothing else states them, lineage, preparer, counts */
  if (previous) {
    const ps = { kind: 'document', ref: previous.ref || 'previous document' };
    m.previous = { counts: previous.counts || {}, ref: ps.ref };
    if (!m.legislation.length && previous.legislation?.length) put('legislation', previous.legislation, ps);
    for (const k of ['internal', 'services', 'dataSources', 'partners']) if (!m.integrations[k].length && previous.integrations?.[k]?.length) { m.integrations[k] = previous.integrations[k]; m.sources[`integrations.${k}`] = ps; }
    if (!m.outputs.length && previous.outputs?.length) put('outputs', previous.outputs, ps);
    if (previous.preparedBy) m.preparedBy = { value: bi(previous.preparedBy), source: ps };
    if (previous.revisions?.length && !F.earlierIssue) m.earlierIssue = previous.revisions;
  }
  // the preparer of this service: the record first, then the earlier document, then the profile (compose)
  if (F.preparedBy) m.preparedBy = { value: bi(F.preparedBy), source: src('preparedBy') };
  // revisions lineage: one row or a list, oldest first
  m.earlierIssue = m.earlierIssue ? [].concat(m.earlierIssue).filter((r) => r && r.date) : [];
  /* the card register (directorate / section / division), keyed on the folded service name */
  if (register) {
    const entries = Array.isArray(register) ? register : Object.entries(register).map(([name, v]) => ({ name, ...v }));
    const hit = entries.find((e) => [m.name.ar, m.name.en, m.key].some((n) => same(n, e.name)));
    m.register = { entry: hit || null };
    if (hit?.adminReference && !m.adminReference.length) put('adminReference', hit.adminReference, { kind: 'register', ref: `card register: ${hit.name}` });
  }
  /* the attachments each radio/select branch reveals (a crawl that read the picker per branch) */
  const bare = (x) => String(x).replace(/\s*\([^)]*\)\s*$/, '').trim();
  m.branchRead = steps(base).some((s) => s.docBranches);
  m.hasBranches = m.fields.some((f) => f.type === 'radio' || f.shownWhen?.length);
  for (const [doc, when] of steps(base).flatMap((s) => Object.entries(s.docBranches || {}))) {
    const d = m.documents.find((x) => same(pick(x.name, 'ar'), bare(doc)) || same(pick(x.name, 'en'), bare(doc)));
    if (d) d.shownWhen = [...new Set([...(d.shownWhen || []), ...when])];
    else m.documents.push({ name: bi(bare(doc)), required: !/غير\s*(إجباري|اجباري)|optional/i.test(doc), formats: '', shownWhen: when, by: 'customer', source: crawlSrc('attachment list per branch') });
  }
  // the organisation's upload limits (one picker for every form), where the evidence names none for a document
  const lim = profile?.attachments;
  if (lim) for (const d of m.documents) { if (!d.formats && lim.formats) { d.formats = lim.formats; d.limitsFrom = 'profile'; } if (!d.maxSize && lim.maxSize) { d.maxSize = bi(lim.maxSize); d.limitsFrom = 'profile'; } }
  return m;
}

/** A message bundle: `key=value` (or `key: value`) lines; comments (#, !) and blanks skipped. */
export function parseMessages(text) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[#!]/.test(l)).map((l) => { const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(l); return m ? { key: m[1], text: m[2] } : null; }).filter(Boolean);
}

/** Caption every action in one edition: desk walk › model flow names › profile captions › derived from the key. */
export function captionAll(m, { locale, T, profile = {}, nameOfStage }) {
  const derived = [];
  for (const st of m.stages) for (const a of st.actions) {
    const desk = (st.deskActions || []).find((d) => norm(d.key) === a.key);
    const fromProfile = profile.captions?.[a.key];
    // a label that is only the action's key («need-edit») is no caption: fall through (D03)
    const real = (v) => { const x = pick(v, locale); return keyish(x, a.key) ? '' : x; };
    let label = real(desk?.label) || real(a.flowNames) || real(fromProfile);
    if (!label) {
      const ck = a.key === 'submit' ? { kind: 'submit' } : a.key === 'cancel' && a.effect === 'leave' ? { kind: 'cancel' } : captionKind(a.key);
      const t0 = a.to && nameOfStage(a.to, true);
      const tgt = t0 && locale === 'ar' && /[A-Za-z]/.test(t0) ? `«${t0}»` : t0; // a name the evidence has in English only stays quoted
      if (ck) label = T.captions[ck.kind].replace('{x}', tgt || (ck.rest || '').replace(/-/g, ' '));
      else if (a.effect === 'pay') label = T.captions.pay;
      else label = tgt ? T.captions[a.effect === 'back' ? 'returnTo' : 'sendTo'].replace('{x}', tgt) : T.captions.complete;
      if (a.key !== 'submit' && a.effect !== 'leave') derived.push(label);
    }
    a.label = a.label || {};
    a.label[locale] = label;
  }
  return [...new Set(derived)];
}
