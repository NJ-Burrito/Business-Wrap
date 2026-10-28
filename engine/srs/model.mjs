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
const RAW_ID = /^(sid-[0-9a-f-]{8,}|[0-9a-f]{8}-[0-9a-f-]{20,})$/i;

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
export function buildModel({ ir = null, raw = null, record = null, profile = {}, text, names: nameMap = {} } = {}) {
  const F = record?.facts || {};
  const src = (k) => record?.sources?.[k] || (record?.source ? { ...record.source } : null);
  const T = text; // core text (ar/en), for derived captions
  const m = {
    kind: 'bw-requirements', version: 1,
    key: record?.key || raw?.name || ir?.key || '',
    name: bi(F.name) || (ir?.names ? bi(ir.names) : null) || bi(raw?.languages?.ar?.card?.title && { ar: raw.languages.ar.card.title, en: raw.languages.en?.card?.title || ir?.names?.en || raw.languages.ar.card.title }) || bi(ir?.name || raw?.name || 'Service'),
    code: null, actors: [], stages: [], ends: [], systemSteps: [], timers: [], fields: [], documents: [], fees: [], outputs: [], recipients: [],
    channels: [], legislation: [], assumptions: [], adminReference: [], integrations: { internal: [], services: [], dataSources: [], partners: [] },
    languages: [], statuses: [], notifications: [], kpis: [], slas: [], description: null, place: null, serial: null, earlierIssue: F.earlierIssue || null,
    sources: {}, questions: [], derivedCaptions: [],
  };
  const put = (k, v, s) => { m[k] = v; if (s) m.sources[k] = s; };
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
  steps(base).forEach((s, si) => {
    const fs = (s.fields || []).filter((f) => !NOT_FIELD.test(`${f.key} ${f.label}`));
    fs.forEach((f, i) => {
      const e = enByKey.get(f.key) || f;
      const a = base === 'ar' ? f : (steps('ar').flatMap((x) => x.fields || []).find((x) => x.key === f.key) || f);
      if (f.type === 'file') return; // attachments are documents (below)
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
      m.fields.push({ key: f.key, label: { ar: a.label || e.label, en: e.label || a.label }, type: f.type, required: !!(f.required || e.required), editable: true, options: { ar: a.options || [], en: e.options || a.options || [] }, shownWhen: f.shownWhen || null, stage: 'submit', section: { ar: s.title || '', en: (steps('en')[si] || {}).title || s.title || '' }, source: crawlSrc(`step ${si + 1} «${f.key}»`) });
    });
  });
  if (m.documents.length) m.sources.documents = m.documents[0].source;
  if (Array.isArray(F.documents)) put('documents', F.documents.map((d) => ({ ...d, name: bi(d.name), source: src('documents') })));
  for (const fl of m.fields) {
    if (F.fieldIntegrations?.[fl.key]) fl.integration = bi(F.fieldIntegrations[fl.key]);
    if (F.fieldDefaults?.[fl.key]) fl.default = bi(F.fieldDefaults[fl.key]);
  }

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
    for (const t of tasks) {
      const key = `${t.name || ''} ${t.id}`;
      const mine = !t.actor || custActor.has(t.actor);
      const kind = PAY.test(key) || PAY.test(pick(names(t), 'en')) ? 'payment' : (custActor.has(t.actor) || (!t.actor && (REWORK.test(key) || REWORK.test(pick(names(t), 'en'))))) ? 'rework' : 'review';
      const desk = F.desks?.[t.name] || F.desks?.[t.id] || {};
      m.stages.push({ id: t.id, key: t.name, kind, name: names(t) || bi(t.name), actions: [], actor: kind === 'review' ? (mine ? null : t.actor) : 'customer', sections: desk.sections || [], tasks: desk.tasks || [], fields: [], autoAssign: !!desk.autoAssign, deskActions: desk.actions || null, source: { kind: 'model', ref: `${ir.key || ir.name}: task ${t.name || t.id}` }, rank: rank[t.id] });
    }
    for (const s of ir.steps.filter((x) => x.type === 'end')) m.ends.push({ id: s.id, name: names(s) || bi(s.name), outcome: (() => { const n = `${s.name} ${pick(names(s), 'en')}`; if (/\bnot\b|\bno\b|lost|fail|لم /i.test(n)) return STOP.test(n) ? 'rejected' : 'closed'; return outcomeOf(n) || (STOP.test(n) ? 'rejected' : POSITIVE.test(n) ? 'approved' : 'closed'); })(), source: { kind: 'model', ref: `${ir.key || ir.name}: end ${s.name || s.id}` } });
    for (const s of ir.steps.filter((x) => x.type === 'system')) m.systemSteps.push({ id: s.id, name: bi(s.name), source: { kind: 'model', ref: `${ir.key || ir.name}: system step ${s.name}` } });
    for (const f of ir.flows.filter((x) => x.timer && byId[x.to]?.type !== 'timer')) m.timers.push({ id: `timer-${f.from}`, stage: f.from, duration: isExpr(f.label) ? null : bi(nameMap[f.label] || f.label || null), raw: f.label || '', to: f.to, source: { kind: 'model', ref: `${ir.key || ir.name}: timer on ${f.from}` } });
    for (const s of ir.steps.filter((x) => x.type === 'timer')) m.timers.push({ id: s.id, stage: s.attachedTo, duration: isExpr(s.timer || s.name) ? null : bi(nameMap[s.timer || s.name] || s.timer || s.name), raw: s.timer || s.name, source: { kind: 'model', ref: `${ir.key || ir.name}: timer on ${s.attachedTo}` } });
    // actions: the routing out of each people's step (through decisions and system steps), captioned
    const stageOf = (id) => m.stages.find((s) => s.id === id);
    const endOf = (id) => m.ends.find((e) => e.id === id);
    const visible = (id) => { const n = byId[id]; return n && (n.type === 'task' || n.type === 'end'); };
    const targets = (from) => { // flows from a stage, followed through decisions/system steps to people or ends
      const out = []; const seenT = new Set();
      const go = (id, flow) => { for (const f of ir.flows.filter((x) => x.from === id && !x.timer)) { const n = byId[f.to]; if (!n || seenT.has(f.to + (f.label || ''))) continue; seenT.add(f.to + (f.label || '')); const fl = flow || (f.label || f.condition ? f : null); if (visible(f.to)) out.push({ to: f.to, flow: fl }); else if (n.type !== 'timer') go(f.to, fl); } };
      go(from, null); return out;
    };
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
    m.graph = g;
  }
  m.stages[0].actions.push({ key: 'cancel', to: null, effect: 'leave', source: { kind: 'pack', ref: 'customer stage' } });
  // auto-assignment: the record's desk walk, or a model attribute when the parser kept one
  for (const st of m.stages) if (ir?.steps?.find((s) => s.id === st.id)?.autoAssign) st.autoAssign = true;
  // approval: a review stage whose action ends the process as approved
  for (const st of m.stages) if (st.kind === 'review' && st.actions.some((a) => a.effect === 'endOk')) st.kind = 'approval';
  // outputs: stated in the record; else the profile says whether this kind of process has one
  if (!m.outputs.length && F.output) put('outputs', [F.output], src('output'));
  return m;
}

/** Caption every action in one edition: desk walk › model flow names › profile captions › derived from the key. */
export function captionAll(m, { locale, T, profile = {}, nameOfStage }) {
  const derived = [];
  for (const st of m.stages) for (const a of st.actions) {
    const desk = (st.deskActions || []).find((d) => norm(d.key) === a.key);
    const fromProfile = profile.captions?.[a.key];
    let label = pick(desk?.label, locale) || pick(a.flowNames, locale) || pick(fromProfile, locale);
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
