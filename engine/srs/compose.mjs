// Template pack + neutral model + organisation profile → one edition of the document JSON
// (the shape engine/render.mjs, the editor and the DOCX builder already read).
//
// A pack (templates/<id>/pack.json) is data: its chapters, sections, the generator each section uses, its
// glossary, its wording overrides, its standard requirements and rules. The generators live here, once, so
// every pack gets the same evidence discipline: a section says where it came from (fill), and a section the
// evidence cannot fill becomes a named open question, never a silent «none».
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pick, terms, captionAll } from './model.mjs';
import { DIAGRAM } from '../diagram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES = path.resolve(HERE, '..', '..', 'templates');
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
export const coreText = () => readJson(path.join(TEMPLATES, '_core', 'text.json'));

export const deepMerge = (a, b) => { if (!b) return a; const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' ? deepMerge(a[k], v) : v; return o; };
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const pad = (n) => String(n).padStart(2, '0');
const fill = (s, vars) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
const quoteList = (xs, sep) => xs.map((x) => `«${x}»`).join(sep);

/** Registers (countries, cities, nationalities …) print their size, never their members. */
export const REGISTER = /country|countries|nationalit|city|cities|governorate|province|region|state|currenc|language|بلد|دول|جنسي|محافظ|مدين|مدن|عمل[ةه]|لغ[ةه]/i;
export const INLINE_MAX = 12;
export function constraintsOf(f, { locale, T, threshold = 30 }) {
  const opts = f.options?.[locale] || [];
  const parts = [];
  if (f.shownWhen?.length) parts.push(fill(T.shownWhen, { when: f.shownWhen.map((w) => `«${pick(w, locale)}»`).join(T.listSep) }));
  if (opts.length) {
    const label = pick(f.label, locale);
    if (opts.length > INLINE_MAX || (REGISTER.test(`${label} ${f.key}`) && opts.length > 3) || opts.length >= threshold) parts.push(fill(T.registerCount, { n: opts.length }));
    else parts.push(fill(T.optionsInline, { list: opts.join(T.listSep) }));
  }
  if (f.constraints) parts.push(pick(f.constraints, locale));
  if (f.messages?.length && T.messages) parts.push(fill(T.messages, { m: f.messages.map((x) => `«${pick(x, locale)}»`).join(T.listSep) }));
  return parts.join(locale === 'ar' ? '؛ ' : '; ') || T.none;
}

export function loadPack(id) {
  const dir = fs.existsSync(id) && fs.statSync(id).isDirectory() ? id : path.join(TEMPLATES, id);
  const pack = readJson(path.join(dir, 'pack.json'));
  pack.dir = dir;
  return pack;
}
export const listPacks = () => fs.readdirSync(TEMPLATES).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(TEMPLATES, d, 'pack.json')));

/* ── compose ───────────────────────────────────────────────────────────── */
export function compose(model, pack, profile = {}, { locale = 'ar', today = new Date().toISOString().slice(0, 10), extraQuestions = [] } = {}) {
  const T = deepMerge(deepMerge(coreText()[locale], pack.text?.[locale]), profile.text?.[locale]);
  const G = { ...(T.glossary || {}), ...terms(pack, profile, locale) };
  if (!G.entity) G.entity = T.glossary?.entity;
  const g = (k) => G[k] ?? k;
  const v0 = { ...G, request: g('request'), requests: g('requests'), customer: g('customer'), output: '' };
  const name = pick(model.name, locale);
  const out = pick(model.outputs?.[0]?.name, locale) || (pack.outputFromApproval ? g('outputDefault') : '') || '';
  const V = { ...v0, name, output: out || g('outputDefault') || '', entity: g('entity') };
  // a pack whose processes always issue something on approval names the output after the service until the record says otherwise
  const signed = (model.systemSteps || []).some((x) => new RegExp(pack.signatureSteps || '$^', 'i').test(pick(x.name, 'en')));
  const approvedOutput = !model.outputs?.length && pack.outputFromApproval && model.ends.some((e) => e.outcome === 'approved');
  // an output is printed (1.2's clause, FR, the output story) only where the evidence names one, or the pack issues on approval
  const hasOutput = !!out && (model.outputs.length > 0 || approvedOutput || pack.outputStory === 'always') && pack.outputStory !== 'never';
  V.outputClause = hasOutput && G.outputClause ? fill(G.outputClause, { ...V }) : '';
  const joinAr = (s) => (locale === 'ar' ? s.replace(/لـال/g, 'لل').replace(/([لب])ـ/g, '$1') : s);
  const tx = (s, extra = {}) => joinAr(fill(fill(s, { ...V, ...extra }), V));
  const questions = [];
  const ask = (q, sec) => { const id = `Q${questions.length + 1}`; questions.push({ id, question: q, owner: T.owner, blocks: sec || '' }); return id; };
  const fillLog = [];
  const sep = T.listSep;

  // names a reader sees
  const actorName = (id) => (id === 'customer' ? g('customer') : pick(model.actors.find((a) => a.id === id)?.name, locale));
  const stageName = (st) => (st.id === 'submit' ? tx(T.story.customer.name) : pick(st.name, locale));
  // «who?» answered with a person: the customer, a job-named actor as it is, a stage-named desk as «staff of stage X»
  const asPerson = (st) => { if (!st) return T.actorSystem; if (st.actor === 'customer' || st.kind === 'rework' || st.kind === 'customer') return g('customer'); const a = st.actor && actorName(st.actor); return a && a !== stageName(st) ? (locale === 'ar' && /[A-Za-z]/.test(a) ? `«${a}»` : a) : fill(T.roleStage, { s: stageName(st) }); };
  const stageById = (id) => model.stages.find((s) => s.id === id);
  const endById = (id) => model.ends.find((e) => e.id === id);
  // the end's own name when the evidence gives one in this language; a raw key («cancel») reads as its outcome word
  const endName = (e) => { const nm = pick(e.name, locale); return !nm || (locale === 'ar' ? /[A-Za-z]/.test(nm) : /^[a-z_-]+$/.test(nm)) ? T.outcomes[e.outcome] || nm : nm; };
  const nameOfStage = (id, asRole) => { const st = stageById(id); if (st) return asRole && st.actor && st.actor !== 'customer' ? actorName(st.actor) : st.kind === 'rework' || st.kind === 'customer' ? (asRole ? g('customer') : stageName(st)) : stageName(st); const e = endById(id); return e ? endName(e) : ''; };
  const derivedCaps = captionAll(model, { locale, T, profile, nameOfStage });
  model.derivedCaptions = { ...(Array.isArray(model.derivedCaptions) ? {} : model.derivedCaptions), [locale]: derivedCaps };
  if (derivedCaps.length && pack.askCaptions !== false) ask(fill(T.q.captions, { list: quoteList(derivedCaps, sep) }), '6');
  const actionLabel = (a) => pick(a.label, locale);
  // a stage's captions once each: two flows with one key (approve → next desk, approve → end) are one button (D10)
  const capsOf = (st) => [...new Set(st.actions.map(actionLabel).filter(Boolean))];
  const effectText = (st, a) => {
    const t = a.to ? nameOfStage(a.to) : '';
    const e = endById(a.to);
    const auto = ['forward', 'submit', 'resubmit', 'pay'].includes(a.effect) && stageById(a.to)?.autoAssign && T.effect.autoSuffix ? T.effect.autoSuffix : '';
    return tx((T.effect[a.effect] || T.effect.forward) + auto, { t, s: e ? endName(e) : '' });
  };
  // the stages the document describes: people's steps (payment is a stage, not a desk: no card, no role)
  const people = model.stages.filter((s) => s.kind !== 'payment');
  const staff = people.filter((s) => s.kind === 'review' || s.kind === 'approval');
  const payment = model.stages.find((s) => s.kind === 'payment');
  const firstDesk = staff[0];
  // names the evidence gives in one language only: printed as found, and asked once (both editions)
  const oneLang = [...model.stages.map((x) => x.name), ...model.actors.map((x) => x.name), ...model.fields.map((x) => x.label)].filter((n) => n && /[A-Za-z]/.test(pick(n, 'ar')));
  if (oneLang.length) ask(fill(T.q.translate, { list: quoteList([...new Set(oneLang.map((n) => pick(n, locale)))], sep) }), '0');
  const partners = model.integrations.partners || [];
  const allInteg = [...(model.integrations.internal || []), ...(model.integrations.services || []), ...partners];
  const secTitle = {}; // gen → printed section number (for cross references)

  /* section generators: each returns { blocks, fill, source } (or { sections } for an expanding one) */
  const table = (cols, rows) => ({ kind: 'table', columns: cols, rows });
  const prose = (...p) => ({ kind: 'prose', paragraphs: p.flat().filter(Boolean) });
  // a profile may rename a table's columns (its organisation's template words), never change their number
  const col = (k) => { const p0 = pack.columns?.[k]?.[locale] || []; const o = profile.columns?.[k]?.[locale]; return Array.isArray(o) && o.length === p0.length ? o : p0; };
  const srcOf = (k) => model.sources[k] || null;
  const qInDoc = profile.questionsInDocument === true || pack.questionsInDocument === true;
  // a section the evidence cannot fill: the question goes to open-questions.md; the page says «none», never «Q1» (D21)
  const asked = (sec, title) => { const id = ask(fill(T.q.section, { sec: `${sec} ${title}` }), sec); return { blocks: [prose(qInDoc ? `${T.none} — ${id}` : T.none)], fill: 'question' }; };
  const statedNone = (k) => (srcOf(k) && srcOf(k).kind !== 'crawl' ? { blocks: [prose(T.none)], fill: 'stated-none', source: srcOf(k) } : null);
  const factRows = (k, cols, rowOf) => (model[k]?.length ? { blocks: [table(cols, model[k].map(rowOf))], fill: 'evidence', source: srcOf(k) } : statedNone(k));
  const P = (s) => tx(pick(s, locale)); // pack prose with placeholders

  const GEN = {
    prose: (s) => ({ blocks: [prose((s.paragraphs?.[locale] || []).map((p) => tx(p, { channels: model.channels.map((c) => pick(c, locale)).join(sep) || g('channelsDefault') })))], fill: 'template' }),
    description: (s) => (model.description ? { blocks: [prose(pick(model.description, locale))], fill: 'evidence', source: srcOf('description') } : s.paragraphs ? GEN.prose(s) : null),
    identifier: () => {
      const rows = [];
      if (model.code) rows.push([g('codeLabel'), model.code]);
      if (model.serial) { rows.push([g('serialLabel'), `${pick(model.serial.pattern, locale)}${model.serial.reset ? ` — ${pick(model.serial.reset, locale)}` : ''}`]); if (model.serial.shownOn) rows.push([g('serialShownLabel'), pick(model.serial.shownOn, locale)]); }
      return rows.length ? { blocks: [table([], rows)], fill: model.code ? 'evidence' : 'derived', source: srcOf('code') || srcOf('serial') } : null;
    },
    recipients: () => factRows('recipients', col('recipients'), (r) => [pick(r, locale)]),
    assumptions: () => (model.assumptions.length ? { blocks: [table([], model.assumptions.map((a, i) => [String(i + 1), pick(a, locale)]))], fill: 'evidence', source: srcOf('assumptions') } : statedNone('assumptions')),
    fees: () => factRows('fees', col('fees'), (f) => { const a = pick(f.amount, locale); const m2 = !f.basis && /^(.*\S)\s*\/\s*([^/]*\d[^/]*)$/.exec(a); return [pick(f.code, locale) || T.none, m2 ? m2[2] : a, pick(f.basis, locale) || (m2 ? m2[1] : T.unknown), pick(f.timing, locale) || (payment ? tx(g('feeTimingPayment')) : T.unknown)]; }),
    documents: () => factRows('documents', col('documents'), (d) => [pick(d.name, locale), d.required ? T.required : T.optional, d.formats || '—', pick(d.maxSize, locale) || '—', d.by === 'customer' || !d.by ? g('customer') : pick(d.by, locale), [d.multiple ? g('multiple') : '', pick(d.notes, locale)].filter(Boolean).join(sep) || '—']),
    adminRef: () => (model.adminReference.length ? { blocks: [table([], model.adminReference.map(([k, v]) => [pick(k, locale), pick(v, locale)]))], fill: 'evidence', source: srcOf('adminReference') } : statedNone('adminReference')),
    channels: () => {
      if (!model.place && !model.channels.length) return null;
      const place = model.place ? g(pick(model.place, locale)) : '';
      const list = model.channels.map((c) => g(pick(c, locale))).join(T.placeJoin || sep);
      // the place and the channels as one sentence when the pack words it; the bare value otherwise
      const text = place && list && T.placeSentence ? tx(T.placeSentence, { place, list }) : place || tx(g('channelsLead'), { list });
      return { blocks: [prose(text)], fill: 'evidence', source: srcOf('place') || srcOf('channels') };
    },
    outputs: () => factRows('outputs', col('outputs'), (o) => [pick(o.name, locale), pick(o.validity, locale) || T.none]) || (approvedOutput ? { blocks: [table(col('outputs'), [[out, T.unknown]])], fill: 'derived', source: { kind: 'model', ref: 'approved end' } } : null),
    legislation: () => factRows('legislation', col('legislation'), (l) => [pick(l.number, locale), pick(l.name, locale), pick(l.year, locale)]),
    roles: () => {
      const rows = [[`R-01`, g('customer'), g('customerFunction'), tx(T.roleUsage.customer), g('customerChannel')]];
      staff.forEach((st, i) => {
        const role = st.actor ? actorName(st.actor) : stageName(st);
        rows.push([`R-${pad(i + 2)}`, role, st.actor ? role : fill(T.roleStage, { s: stageName(st) }), tx(T.roleUsage.staff, { list: capsOf(st).join(sep) || T.none }), g('staffChannel')]);
      });
      return { blocks: [table(col('roles'), rows)], fill: staff.length ? 'derived' : 'template', source: { kind: 'model', ref: 'actors + stages' } };
    },
    integrations: (s) => { const k = s.of; const L = model.integrations[k] || []; if (!L.length) return statedNone(`integrations.${k}`); const rows = L.map((x) => (s.cols || ['name', 'description', 'sent', 'received', 'readiness']).map((c) => pick(x[c], locale) || (c === 'readiness' ? pick(profile.integrations?.readinessDefault, locale) || T.unknown : T.none))); return { blocks: [table(col(s.columns || k), rows)], fill: 'evidence', source: srcOf(`integrations.${k}`) }; },
    languages: () => (model.languages.length ? { blocks: [prose(model.languages.map((l) => ({ ar: 'العربية', en: 'English' }[l] || l)).join(' / '))], fill: 'evidence', source: srcOf('languages') } : null),
    requirements: () => {
      const rows = [];
      const skip = new Set(pack.requirements?.skip || []);
      // the timeline rank of a unit: submit 10, assign 20, desks 30+i, other 60, follow-up 70, all staff 80, notices 85, output 90
      const RANK = { submit: 10, payment: 10, assign: 20, staff: 80, rework: 70, track: 70, all: 80, notify: 85, output: 90 };
      const CUSTOMER_FR = new Set(['attach', 'submitCancel', 'rework']);
      const add = (key, unit, extra = {}, who = null, rank = null) => { if (!skip.has(key)) rows.push({ text: tx(T.fr[key], extra), unit: tx(unit === 'output' ? g('outputUnit') || T.units.output : T.units[unit] || unit), who: who || (CUSTOMER_FR.has(key) ? g('customer') : T.actorSystem), rank: rank ?? RANK[unit] ?? 60 }); };
      for (const k of pack.requirements?.customer || ['dynamicFields', 'validate', 'attach', 'submitCancel', 'confirm']) if (k !== 'attach' || model.documents.length) add(k, 'submit');
      for (const p of partners) add(p.received ? 'integration' : 'integrationNoData', 'submit', { p: pick(p.name, locale), data: pick(p.received, locale), sec: secTitle.partners || '' });
      if (payment) { add('toPayment', 'submit'); if (firstDesk) add('afterPayment', 'payment', { t: stageName(firstDesk) }); }
      // the round-robin is a requirement of the human step it feeds, not a step of its own (Lead ruling, D14)
      for (const st of staff.filter((x) => x.autoAssign)) add('autoAssign', stageName(st), { t: stageName(st) }, null, staff.indexOf(st) === 0 ? 20 : 30 + staff.indexOf(st));
      // one requirement per desk's action bar, held by that desk's person
      if (T.fr.deskActions) staff.forEach((st, i) => { if (st.actions.length) rows.push({ text: tx(T.fr.deskActions, { w: asPerson(st), s: stageName(st), list: quoteList(capsOf(st), sep) }), unit: stageName(st), who: asPerson(st), rank: 30 + i }); });
      // one requirement per branch gate (a field the form shows only on a choice)
      if (T.fr.branchGate) for (const f of model.fields.filter((x) => x.shownWhen?.length)) rows.push({ text: tx(T.fr.branchGate, { f: pick(f.label, locale), when: f.shownWhen.map((w) => `«${pick(w, locale)}»`).join(sep) }), unit: tx(T.units.submit), who: T.actorSystem, rank: 10 });
      if (people.some((s) => s.kind === 'rework')) add('rework', 'rework');
      for (const t of model.timers) { const st = stageById(t.stage); if (st) add('timer', st.kind === 'payment' ? 'payment' : 'staff', { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown }, null, st.kind === 'payment' ? 10 : staff.includes(st) ? 30 + staff.indexOf(st) : 70); }
      add('track', 'track');
      if (staff.length) { add('notes', 'staff'); add('history', 'all'); }
      if (model.notifications.length || model.systemSteps.some((s) => /notif|inform|email|sms|إشعار|اشعار/i.test(pick(s.name, 'en')))) add('notify', 'notify');
      if (hasOutput) add('output', 'output');
      for (const r of pack.requirements?.extra || []) rows.push({ text: tx(pick(r.text, locale)), unit: tx(pick(r.unit, locale)), who: T.actorSystem, rank: r.rank ?? 60 });
      // sorted by the timeline (stable), codes issued after the sort
      // one requirement once (two timers on two tasks of one name are one requirement)
      const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => a.rank - b.rank || a.i - b.i).filter((r, i, a) => a.findIndex((x) => x.text === r.text && x.unit === r.unit) === i);
      const out2 = sorted.map((r, i) => [`${pack.codes?.fr || 'FR'}-${pad(i + 1)}`, r.text, r.unit, r.who]);
      model.frRanks = { ...(model.frRanks || {}), [locale]: sorted.map((r) => r.rank) };
      return { blocks: [table(col('requirements'), out2)], fill: 'derived', source: { kind: 'model', ref: 'stages, actions, integrations, payment, timers' } };
    },
    workflow: (s) => {
      if (!model.graph) return null;
      const ir = { actors: model.actors.filter((a) => a.side === 'staff').map((a) => ({ id: a.id, name: pick(a.name, locale) })) };
      const nodes = model.graph.nodes.map((n) => ({ ...n, name: n.type === 'task' ? nameOfStage(n.id) : n.type === 'end' ? endName(endById(n.id)) : n.type === 'decision' ? '' : n.name }));
      // an edge out of a decision carries the caption of the action the stage before it offers
      const before = (id) => model.graph.edges.filter((x) => x.to === id).map((x) => x.from);
      const stagesBefore = (id, seen = new Set()) => before(id).flatMap((f) => (seen.has(f) ? [] : (seen.add(f), stageById(f) ? [stageById(f)] : stagesBefore(f, seen))));
      const edges = model.graph.edges.filter((e) => !e.timer).map((e) => { const sts = stageById(e.from) ? [stageById(e.from)] : stagesBefore(e.from); const a = sts.flatMap((st) => st.actions).find((x) => x.to === e.to); return { from: e.from, to: e.to, label: a && !stageById(e.to)?.kind?.match(/payment/) ? actionLabel(a) : '' }; });
      // figures carry human/actor steps only: a round-robin stage keeps its own shape and no assignment step is
      // drawn before it; the assignment is stated as a rule on that stage (chapters 3, 5, 6) (Lead ruling, D14)
      // a payment-named task without a fee on record is drawn as a system step (B7)
      for (const n of nodes) if (n.type === 'task' && (model.demoted || []).includes(n.id)) { n.type = 'system'; n.name = pick(model.systemSteps.find((x) => x.id === n.id)?.name, locale) || n.name; }
      const applicantId = '__customer';
      for (const n of nodes) if (n.type === 'task' && stageById(n.id)?.actor === 'customer') n.actor = applicantId;
      const model2 = DIAGRAM.fromGraph({ nodes, edges }, { actors: [{ id: applicantId, name: 'customer' }, ...ir.actors], locale });
      return { blocks: [{ kind: 'diagram', caption: tx(pick(s.caption, locale) || '{name}'), model: model2 }], fill: 'derived', source: { kind: 'model', ref: 'people steps only (system steps folded)' } };
    },
    rules: () => {
      const R = { ...(pack.rules || {}), ...(profile.rules || {}) };
      // a pack whose rules govern the back office prints none for a process with no staff stage
      if (R.backOfficeOnly && !staff.length) return null;
      const rows = [];
      const br = pack.codes?.br || 'BR';
      const fam = {};
      const famCode = (f) => `${br}-${f}-${pad((fam[f] = (fam[f] || 0) + 1))}`;
      const code = (c) => c || `${br}-${pad(rows.length + 1)}`;
      const has = { reroute: staff.some((s) => s.actions.some((a) => a.effect === 'back')), recipients: model.recipients.length > 0, serial: !!model.serial, phone: model.fields.some((f) => f.type === 'tel' || /phone|mobile|هاتف/i.test(`${f.key} ${pick(f.label, 'en')}`)), staff: staff.length > 0, partners: partners.length > 0, payment: !!payment };
      for (const r of R.standard || []) {
        if (r.when && !r.when.split('&').every((w) => (w.startsWith('!') ? !has[w.slice(1)] : has[w]))) continue;
        let t = pick(r.text, locale);
        t = tx(t, { list: model.recipients.map((x) => pick(x, locale)).join(sep), pattern: pick(model.serial?.pattern, locale), reset: pick(model.serial?.reset, locale) });
        rows.push([code(r.code), t]);
      }
      const famOn = !!R.families;
      const lc1 = (x) => x.replace(/^(\S)/, (c) => (locale === 'en' ? c.toLowerCase() : c));
      const push = (c, t) => { if (!rows.some((r) => r[1] === t)) rows.push([c, t]); };
      // routing the system decides on a computed value — a back-office rule of the process itself, so printed even
      // where derived rules are off (D08): per value when the names file captions it, else one rule per gateway
      const routeRows = [];
      if (T.br.routing && R.routing !== false) {
        const target = (id) => { const st = stageById(id); return st ? tx(T.effect.forward, { t: stageName(st) }) : endById(id) ? tx(T.effect.endStop, { s: endName(endById(id)) }) : ''; };
        for (const gate of [...new Set((model.routing || []).map((r) => r.gate))]) {
          const rs = model.routing.filter((r) => r.gate === gate);
          const after = [...new Set(rs.flatMap((r) => r.after || []))].map(stageById).filter(Boolean).map(stageName);
          const named = rs.every((r) => r.valueName && r.variableName);
          const texts = named ? rs.map((r) => tx(T.br.routing, { v: pick(r.variableName, locale), x: pick(r.valueName, locale), e: lc1(target(r.to)) })) : [tx(T.br.routingAuto, { s: after.length ? quoteList(after, sep) : T.actorSystem, list: quoteList([...new Set(rs.map((r) => nameOfStage(r.to)).filter(Boolean))], T.so.or) })];
          for (const t of texts) if (!routeRows.includes(t) && !rows.some((r) => r[1] === t)) routeRows.push(t);
          if (!named) ask(fill(T.q.routing, { v: [...new Set(rs.map((r) => r.variable))].join(sep), list: [...new Set(rs.map((r) => r.value))].join(sep) }), '5');
        }
      }
      // within the cap, routing rows come before derived ones; past it they are joined into one rule, never dropped
      const struck0 = new RegExp(`^${br}-(${(R.struckFamilies || []).join('|') || '$^'})\\b`);
      const room = R.maxCount ? R.maxCount - rows.filter((r) => !struck0.test(r[0])).length : Infinity;
      const routeOut = routeRows.length > Math.max(room, 1) ? [`${routeRows.map((t) => t.replace(/\.\s*$/, '')).join(locale === 'ar' ? '؛ ' : '; ')}.`] : routeRows;
      for (const t of routeOut) push(famOn ? famCode('ROUTE') : code(), t);
      if (R.derived !== false) {
        // a derived rule carries its family in its code (REJECT, EDIT, RETURN, SLA …), so a struck family stays out by code
        const familyOf = (a) => (a.effect === 'endStop' ? 'REJECT' : a.effect === 'rework' ? 'EDIT' : a.effect === 'back' ? 'RETURN' : a.effect === 'endOk' ? 'END' : 'ACT');
        // a stop on the payment stage (cancel before paying) is a rule too
        for (const st of [...staff, ...(payment ? [payment] : [])]) for (const a of st.actions.filter((x) => x.effect !== 'forward' && (st !== payment || x.effect === 'endStop'))) push(famOn ? famCode(familyOf(a)) : code(), tx(T.br.action, { a: actionLabel(a), s: stageName(st), e: lc1(effectText(st, a)) }));
        // the round-robin, as a rule on the human step it feeds (D14)
        if (T.br.autoAssign) for (const st of staff.filter((x) => x.autoAssign)) push(famOn ? famCode('ASSIGN') : code(), tx(T.br.autoAssign, { s: stageName(st) }));
        for (const t of model.timers) { const st = stageById(t.stage); const te = t.to && (endById(t.to) || stageById(t.to)); if (st) push(famOn ? famCode('SLA') : code(), te ? tx(T.br.timerTo, { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown, e: effectText(st, { to: t.to, effect: endById(t.to) ? (endById(t.to).outcome === 'approved' ? 'endOk' : 'endStop') : 'forward' }).replace(/^(\S)/, (c) => (locale === 'en' ? c.toLowerCase() : c)) }) : tx(T.br.timer, { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown })); if (st && !t.duration) ask(fill(T.q.timer, { d: t.raw.replace(/^\$\{|\}$/g, '').replace(/_/g, ' '), s: stageName(st) }), '5'); }
      }
      const struck = new RegExp(`^${br}-(${(R.struckFamilies || []).join('|') || '$^'})\\b`);
      const kept = rows.filter((r) => !struck.test(r[0]));
      const capped = R.maxCount ? kept.slice(0, R.maxCount) : kept;
      model.routingPrinted = { ...(model.routingPrinted || {}), [locale]: routeOut.length > 0 && routeOut.every((t) => capped.some((r) => r[1] === t)) };
      // printed codes gap-free when the profile/pack asks (the fixed code stays in the block's $codes, for stability checks) (D15)
      const tb = table(col('rules'), R.sequential ? capped.map((r, i) => [`${br}-${pad(i + 1)}`, r[1]]) : capped);
      if (R.sequential) tb.$codes = capped.map((r) => r[0]);
      return capped.length ? { blocks: [tb], fill: 'derived', source: { kind: 'model+pack', ref: 'staff actions, timers, standard rules' } } : null;
    },
    statuses: () => { const rows = [...new Set([...model.statuses.map((x) => pick(x, locale)), ...model.ends.map(endName)])].map((x) => [x]); return rows.length ? { blocks: [table(col('statuses'), rows)], fill: model.statuses.length ? 'evidence' : 'derived', source: srcOf('statuses') || { kind: 'model', ref: 'ends' } } : null; },
    glossary: () => { const rows = Object.entries(pack.glossaryTable?.[locale] || {}).map(([k, d]) => [tx(k), tx(d)]); return rows.length ? { blocks: [table(col('glossary'), rows)], fill: 'template' } : null; },
    kpis: () => factRows('kpis', col('kpis'), (k) => [pick(k.name, locale), pick(k.target, locale) || T.unknown, pick(k.measure, locale) || T.unknown]),
    slas: () => factRows('slas', col('slas'), (k) => [pick(k.stage, locale), pick(k.target, locale)]),
    notifications: () => factRows('notifications', col('notifications'), (k) => [pick(k.event, locale), pick(k.channel, locale) || T.unknown, pick(k.to, locale) || g('customer')]),
    dataDictionary: () => { const rows = model.fields.map((f) => dictRow(f)); return rows.length ? { blocks: [table(col('dictionary'), rows)], fill: 'evidence', source: { kind: 'crawl', ref: 'form fields' } } : null; },
    questions: () => ({ blocks: [], fill: 'derived', late: true }),
  };
  const dictRow = (f) => [pick(f.label, locale), T.fieldTypes[f.type] || f.type, f.required ? T.required : T.optional, f.editable === false ? T.readOnly : T.editable, pick(f.integration, locale) || T.none, pick(f.default, locale) || T.none, constraintsOf(f, { locale, T, threshold: profile.registers?.threshold || 30 })];
  const docRow = (d) => [pick(d.name, locale), T.fieldTypes.file, d.required ? T.required : T.optional, T.editable, T.none, T.none, d.formats ? fill(d.maxSize ? T.fileLimitsSize : T.fileLimits, { formats: d.formats, size: pick(d.maxSize, locale) }) : T.none];
  const stageTaskRows = () => (pack.stageTasks?.[locale] || []).map((r) => r.map((c) => tx(c)));

  // the applicant's fields in on-screen order, a branch field spliced directly under its gate
  const spliced = () => {
    const out = []; const placed = new Set();
    const gateOf = (f) => model.fields.find((g) => g !== f && f.shownWhen.some((w) => { const t = pick(w, 'ar') || pick(w, 'en'); const lab = String(t).split(/\s*=\s*/)[0]; return [pick(g.label, 'ar'), pick(g.label, 'en'), g.key].includes(lab) || (g.options?.ar || []).includes(t); }));
    const put = (f) => { if (placed.has(f)) return; placed.add(f); out.push(f); for (const c of model.fields.filter((x) => x.shownWhen?.length && !placed.has(x) && gateOf(x) === f)) put(c); };
    for (const f of model.fields) if (!f.shownWhen?.length || !gateOf(f)) put(f);
    for (const f of model.fields) put(f);
    return out;
  };

  /* stories: one card per people's stage, then the output story when there is one */
  GEN.stories = (s, number) => {
    const sections = [];
    const n0 = number.split('.')[0];
    let k = 0;
    const portal = (st) => (st.actor === 'customer' ? g('customerChannel') : g('staffChannel'));
    for (const st of [...people.filter((x) => x.actor === 'customer'), ...people.filter((x) => x.actor !== 'customer')]) {
      k += 1;
      const kind = st.kind;
      const P2 = T.story[kind] || T.story.review;
      const sName = st.id === 'submit' ? stageName(st) : stageName(st);
      const prev = staff[staff.indexOf(st) - 1];
      const so = () => { const parts = [T.so.next]; const back = st.actions.find((a) => a.effect === 'back'); if (back) parts.push(tx(T.so.back, { t: nameOfStage(back.to) })); if (st.actions.some((a) => a.effect === 'rework')) parts.push(T.so.rework); if (st.actions.some((a) => a.effect === 'endStop')) parts.push(T.so.stop); return tx(parts.join(T.so.or)); };
      const acc = [];
      const unresolved = [];
      if (kind === 'customer') {
        acc.push(tx(T.acc.fillForm), tx(T.acc.mandatory));
        for (const p of partners.filter((x) => x.atSubmit !== false)) acc.push(tx(T.acc.integration, { p: pick(p.name, locale), sec: secTitle.partners || '' }));
        acc.push(tx(T.acc.validate));
        if (st.sections?.length) acc.push(tx(T.acc.formSections, { list: quoteList(st.sections.map((x) => pick(x, locale)), sep) }));
        acc.push(tx(T.acc.afterSubmit));
      } else if (kind === 'rework') acc.push(tx(T.acc.rework));
      else {
        if (prev) acc.push(tx(T.acc.previous, { s: sName, p: stageName(prev) }));
        if (st.sections?.length) acc.push(tx(T.acc.sections, { s: sName, list: quoteList(st.sections.map((x) => pick(x, locale)), sep) }));
        else unresolved.push(ask(fill(T.q.sections, { s: sName }), `${n0}.${k}`));
      }
      if (st.actions.length) acc.push(tx(T.acc.actions));
      const item = {
        id: `${pack.codes?.us || 'US'}-${pad(k)}`,
        name: tx(P2.name, { s: sName }),
        as: kind === 'customer' || kind === 'rework' ? g('customer') : st.actor ? actorName(st.actor) : fill(T.roleStage, { s: sName }),
        want: tx(P2.want, { s: kind === 'customer' ? pick(st.sections?.[0], locale) || sName : sName }),
        so: tx(P2.so, { outcomes: so() }),
        acceptance: acc,
      };
      // actions (إجراءات): routing buttons only, each with its effect
      // one row per caption; a caption with two effects lists both
      const acts = [];
      for (const a of st.actions) { const lab = actionLabel(a); const eff = effectText(st, a); const row = acts.find((r) => r[0] === lab); if (!row) acts.push([lab, eff]); else if (!row[1].split(T.so.or).includes(eff)) row[1] += T.so.or + eff; }
      if (kind === 'customer' && payment) acts.splice(0, 1, [actionLabel(st.actions[0]), tx(T.effect.forward, { t: stageName(payment) })]);
      if (acts.length) item.actions = { columns: col('actions'), rows: acts };
      const C4 = T.story4;
      // the dictionary: the stage's fields, its documents, and its tasks (مهمات: never action rows)
      const rows = kind === 'customer' ? [...spliced().map(dictRow), ...model.documents.map(docRow)] : kind === 'rework' ? [] : [...(st.fields || []).map((key) => dictRow(model.fields.find((f) => f.key === key))).filter(Boolean), ...stageTaskRows()];
      if (rows.length) item.dictionary = { columns: col('dictionary'), rows };
      const title = `${tx(P2.name, { s: sName })} (${portal(st)})`;
      const blocks = [{ kind: 'stories', number: '', ...(k === 1 ? { lead: T.storyLead } : {}), items: [item] }];
      if (C4 && pack.storyContract !== false) {
        // البيانات المسترجعة: the desk/walk record; else the partners' returned data on the applicant's screen; else the panels, pointed back
        const retrieved = pick(st.returned, locale) || (kind === 'customer' ? partners.filter((p) => p.received).map((p) => tx(C4.fromPartner, { p: pick(p.name, locale), data: pick(p.received, locale) })).join(' ') : st.sections?.length ? tx(C4.panels, { list: quoteList(st.sections.map((x) => pick(x, locale)), sep) }) : '') || T.none;
        const display = pick(st.displayCriteria, locale) || T.none;
        blocks.push(table([], [[C4.retrieved, retrieved], [C4.display, display], ...(item.dictionary ? [] : [[C4.fields, T.none]]), ...(item.actions ? [] : [[C4.actions, T.none]])]));
      }
      sections.push({ title, blocks, fill: kind === 'customer' ? 'evidence' : 'derived', source: st.source, unresolved, story: kind, stage: st.id });
    }
    if (hasOutput) {
      k += 1;
      const o = model.outputs[0] || {};
      const P2 = T.story.output;
      const item = { id: `${pack.codes?.us || 'US'}-${pad(k)}`, name: tx(P2.name), as: g('outputUser') || g('customer'), want: tx(P2.want), so: tx(P2.so), acceptance: [tx(T.acc.output1), ...(pack.outputAcceptance?.[locale] || []).map((x) => tx(x)), tx(T.acc.output2), ...(model.serial && secTitle.identifier ? [tx(T.acc.output3, { sec: secTitle.identifier || '' })] : [])] };
      const blocks = [{ kind: 'stories', number: '', items: [item] }];
      if (o.preview) blocks.push({ kind: 'shots', caption: tx(g('outputPreviewCaption')), images: [o.preview], width: 70 });
      blocks.push(table(col('outputCard'), [[g('outputNameLabel'), pick(o.name, locale) || out], [g('outputWhenLabel'), pick(o.when, locale) || (signed ? g('outputWhenSigned') || g('outputWhenDefault') : g('outputWhenDefault'))], [g('outputToLabel'), pick(o.to, locale) || g('outputToDefault')]]));
      sections.push({ story: 'output', title: `${tx(P2.name)} (${g('customerChannel')})`, blocks, fill: model.outputs.length ? 'evidence' : approvedOutput ? 'derived' : 'template', source: srcOf('outputs') || (approvedOutput ? { kind: 'model', ref: 'approved end' + (signed ? ' + signature steps' : '') } : null) });
    }
    return { sections };
  };

  /* lay the pack out; numbers from position */
  // first pass: section numbers by gen (cross references such as «2.15 …» need them before the text is written)
  pack.chapters.forEach((c, ci) => (c.sections || []).forEach((s, si) => { const t = pick(s.title, locale); const num = `${ci + 1}.${si + 1}`; if (s.gen === 'integrations') secTitle[s.of] = `${num} ${t}`; else secTitle[s.gen] = `${num} ${t}`; }));
  const chapters = pack.chapters.map((c, ci) => {
    const sections = [];
    for (const s of c.sections || []) {
      const num = `${ci + 1}.${sections.length + 1}`;
      const title = pick(s.title, locale);
      const gen = GEN[s.gen];
      if (s.gen === 'questions' && profile.questionsInDocument !== true && pack.questionsInDocument !== true) continue;
      if (!gen) throw new Error(`pack ${pack.id}: section «${title}» names an unknown generator «${s.gen}»`);
      const r = gen(s, num);
      if (r?.sections) {
        r.sections.forEach((x, j) => {
          const n = `${ci + 1}.${sections.length + 1}`;
          for (const b of x.blocks) if (b.kind === 'stories') b.number = n;
          sections.push({ number: n, title: x.title, blocks: x.blocks });
          fillLog.push({ section: n, title: x.title, gen: s.gen, fill: x.fill, source: x.source || null, questions: x.unresolved || [], ...(x.story ? { story: x.story, stage: x.stage || null } : {}) });
        });
        if (!r.sections.length) { const a = asked(num, title); sections.push({ number: num, title, blocks: a.blocks }); fillLog.push({ section: num, title, gen: s.gen, fill: a.fill, source: null }); }
        continue;
      }
      let res = r;
      if (!res) res = s.whenEmpty === 'none' ? { blocks: [prose(T.none)], fill: 'stated-none' } : asked(num, title);
      if (res.late) { sections.push({ number: num, title, blocks: res.blocks, late: true }); fillLog.push({ section: num, title, gen: s.gen, fill: 'derived', source: null }); continue; }
      sections.push({ number: num, title, blocks: res.blocks });
      fillLog.push({ section: num, title, gen: s.gen, fill: res.fill, source: res.source || null });
    }
    return { number: String(ci + 1), title: pick(c.title, locale), sections };
  }).filter((c) => c.sections.length).map((c, i) => (c.number === String(i + 1) ? c : { ...c, number: String(i + 1), sections: c.sections.map((x) => ({ ...x, number: x.number.replace(/^\d+/, String(i + 1)), blocks: x.blocks.map((b) => (b.kind === 'stories' ? { ...b, number: b.number.replace(/^\d+/, String(i + 1)) } : b)) })) }));
  for (const q of extraQuestions) ask(pick(q.question, locale), q.blocks || '');
  // the code: looked up, never derived
  if (!model.code) ask(fill(T.q.code, { name }), '0');
  // an annex of open questions, when the pack has one
  for (const c of chapters) for (const s of c.sections) if (s.late) { s.blocks = questions.length ? [table(col('questions'), questions.map((q) => [q.id, q.question, q.owner]))] : [prose(T.none)]; delete s.late; }

  /* front matter */
  const C = { ...(pack.control || {}), ...(profile.control || {}) };
  const docCode = [model.key, profile.slug, pick(model.name, 'en'), pick(model.name, 'ar')].filter(Boolean).map((k) => profile.docCodes?.[k]).find(Boolean) || null;
  const ver = (n) => fill(profile.versioning?.format || pack.versioning?.format || 'V{nn}', { nn: pad(n), n });
  let revisions = [];
  for (const r of [].concat(model.earlierIssue || []).filter((x) => x?.date)) revisions.push([pick(r.version, locale) || ver(revisions.length + 1), r.date, pick(r.purpose, locale) || '', pick(r.by, locale) || '—']);
  const lastN = Number(/(\d+)\D*$/.exec(revisions.at(-1)?.[0] || '')?.[1] || revisions.length);
  if (revisions.at(-1)?.[1] !== today) revisions.push([ver(lastN + 1), today, '', '—']);
  const maxRows = profile.versioning?.maxRows || pack.versioning?.maxRows;
  if (maxRows && revisions.length > maxRows) revisions = revisions.slice(-maxRows);
  const control = {
    // the document id's code: the profile's document-code table (a mnemonic), else the service code (D16)
    documentId: model.code || docCode ? fill(profile.codeFormat || pack.codeFormat || '{code}', { code: docCode || model.code }) : '—',
    title: `${pick(pack.titlePrefix, locale) || T.titlePrefix}: ${name}`,
    preparedBy: pick(model.preparedBy?.value, locale) || pick(C.preparedBy, locale), documentType: pick(C.documentType, locale), classification: pick(C.classification, locale),
    owner: pick(C.owner, locale) || g('entity'), issuedOn: today, version: revisions.at(-1)[0], status: pick(C.status, locale), reviewCycle: pick(C.reviewCycle, locale),
  };
  // the footer mark (classification · producer) from the profile, where it names one (D18)
  const footer = pick(profile.footer, locale);
  const doc = {
    service: String(model.key || name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 48) || 'document',
    composedAt: new Date().toISOString(),
    pack: pack.id,
    control, revisions, approvals: [], chapters,
    // questions are printed only when the profile/pack asks; otherwise they live beside the document (D01)
    openQuestions: qInDoc ? questions : [],
    fill: fillLog,
    ...(footer ? { labels: { confidential: footer } } : {}),
  };
  Object.defineProperty(doc, '$questions', { value: questions, enumerable: false });
  Object.defineProperty(doc, '$docCode', { value: docCode ? 'table' : model.code ? 'service code' : 'none', enumerable: false });
  return doc;
}
