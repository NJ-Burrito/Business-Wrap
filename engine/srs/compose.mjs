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

const deepMerge = (a, b) => { if (!b) return a; const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' ? deepMerge(a[k], v) : v; return o; };
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
  const out = pick(model.outputs?.[0]?.name, locale) || g('outputDefault') || '';
  const V = { ...v0, name, output: out, entity: g('entity') };
  // a pack whose processes always issue something on approval names the output after the service until the record says otherwise
  const signed = (model.systemSteps || []).some((x) => new RegExp(pack.signatureSteps || '$^', 'i').test(pick(x.name, 'en')));
  const approvedOutput = !model.outputs?.length && pack.outputFromApproval && model.ends.some((e) => e.outcome === 'approved');
  const joinAr = (s) => (locale === 'ar' ? s.replace(/لـال/g, 'لل').replace(/([لب])ـ/g, '$1') : s);
  const tx = (s, extra = {}) => joinAr(fill(fill(s, { ...V, ...extra }), V));
  const questions = [];
  const ask = (q, sec) => { const id = `Q${questions.length + 1}`; questions.push({ id, question: q, owner: T.owner, blocks: sec || '' }); return id; };
  const fillLog = [];
  const sep = T.listSep;

  // names a reader sees
  const actorName = (id) => (id === 'customer' ? g('customer') : pick(model.actors.find((a) => a.id === id)?.name, locale));
  const stageName = (st) => (st.id === 'submit' ? tx(T.story.customer.name) : pick(st.name, locale));
  const stageById = (id) => model.stages.find((s) => s.id === id);
  const endById = (id) => model.ends.find((e) => e.id === id);
  // the end's own name when the evidence gives one in this language; a raw key («cancel») reads as its outcome word
  const endName = (e) => { const nm = pick(e.name, locale); return !nm || (locale === 'ar' ? /[A-Za-z]/.test(nm) : /^[a-z_-]+$/.test(nm)) ? T.outcomes[e.outcome] || nm : nm; };
  const nameOfStage = (id, asRole) => { const st = stageById(id); if (st) return asRole && st.actor && st.actor !== 'customer' ? actorName(st.actor) : st.kind === 'rework' || st.kind === 'customer' ? (asRole ? g('customer') : stageName(st)) : stageName(st); const e = endById(id); return e ? endName(e) : ''; };
  const derivedCaps = captionAll(model, { locale, T, profile, nameOfStage });
  if (derivedCaps.length && pack.askCaptions !== false) ask(fill(T.q.captions, { list: quoteList(derivedCaps, sep) }), '6');
  const actionLabel = (a) => pick(a.label, locale);
  const effectText = (st, a) => {
    const t = a.to ? nameOfStage(a.to) : '';
    const e = endById(a.to);
    return tx(T.effect[a.effect] || T.effect.forward, { t, s: e ? endName(e) : '' });
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
  const col = (k) => pack.columns?.[k]?.[locale] || [];
  const srcOf = (k) => model.sources[k] || null;
  const asked = (sec, title) => ({ blocks: [prose(`${T.none} — ${ask(fill(T.q.section, { sec: `${sec} ${title}` }), sec)}`)], fill: 'question' });
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
    documents: () => factRows('documents', col('documents'), (d) => [pick(d.name, locale), d.required ? T.required : T.optional, d.formats || T.unknown, pick(d.maxSize, locale) || T.unknown, d.by === 'customer' || !d.by ? g('customer') : pick(d.by, locale), [d.multiple ? g('multiple') : '', pick(d.notes, locale)].filter(Boolean).join(sep) || '—']),
    adminRef: () => (model.adminReference.length ? { blocks: [table([], model.adminReference.map(([k, v]) => [pick(k, locale), pick(v, locale)]))], fill: 'evidence', source: srcOf('adminReference') } : statedNone('adminReference')),
    channels: () => (model.place || model.channels.length ? { blocks: [prose(model.place ? pick(model.place, locale) : tx(g('channelsLead'), { list: model.channels.map((c) => pick(c, locale)).join(sep) }))], fill: 'evidence', source: srcOf('place') || srcOf('channels') } : null),
    outputs: () => factRows('outputs', col('outputs'), (o) => [pick(o.name, locale), pick(o.validity, locale) || T.none]) || (approvedOutput ? { blocks: [table(col('outputs'), [[out, T.unknown]])], fill: 'derived', source: { kind: 'model', ref: 'approved end' } } : null),
    legislation: () => factRows('legislation', col('legislation'), (l) => [pick(l.number, locale), pick(l.name, locale), pick(l.year, locale)]),
    roles: () => {
      const rows = [[`R-01`, g('customer'), g('customerFunction'), tx(T.roleUsage.customer), g('customerChannel')]];
      staff.forEach((st, i) => {
        const role = st.actor ? actorName(st.actor) : stageName(st);
        rows.push([`R-${pad(i + 2)}`, role, st.actor ? role : fill(T.roleStage, { s: stageName(st) }), tx(T.roleUsage.staff, { list: st.actions.map(actionLabel).join(sep) || T.none }), g('staffChannel')]);
      });
      return { blocks: [table(col('roles'), rows)], fill: staff.length ? 'derived' : 'template', source: { kind: 'model', ref: 'actors + stages' } };
    },
    integrations: (s) => { const k = s.of; const L = model.integrations[k] || []; if (!L.length) return statedNone(`integrations.${k}`); const rows = L.map((x) => (s.cols || ['name', 'description', 'sent', 'received', 'readiness']).map((c) => pick(x[c], locale) || (c === 'readiness' ? T.unknown : T.none))); return { blocks: [table(col(s.columns || k), rows)], fill: 'evidence', source: srcOf(`integrations.${k}`) }; },
    languages: () => (model.languages.length ? { blocks: [prose(model.languages.map((l) => ({ ar: 'العربية', en: 'English' }[l] || l)).join(' / '))], fill: 'evidence', source: srcOf('languages') } : null),
    requirements: () => {
      const rows = [];
      const skip = new Set(pack.requirements?.skip || []);
      const add = (key, unit, extra = {}) => { if (!skip.has(key)) rows.push([`${pack.codes?.fr || 'FR'}-${pad(rows.length + 1)}`, tx(T.fr[key], extra), tx(unit === 'output' ? g('outputUnit') || T.units.output : T.units[unit] || unit), T.actorSystem]); };
      for (const k of pack.requirements?.customer || ['dynamicFields', 'validate', 'attach', 'submitCancel', 'confirm']) if (k !== 'attach' || model.documents.length) add(k, 'submit');
      for (const p of partners) add(p.received ? 'integration' : 'integrationNoData', 'submit', { p: pick(p.name, locale), data: pick(p.received, locale), sec: secTitle.partners || '' });
      if (payment) { add('toPayment', 'submit'); if (firstDesk) add('afterPayment', 'payment', { t: stageName(firstDesk) }); }
      for (const st of staff.filter((x) => x.autoAssign)) add('autoAssign', 'assign', { t: stageName(st) });
      if (people.some((s) => s.kind === 'rework')) add('rework', 'rework');
      for (const t of model.timers) { const st = stageById(t.stage); if (st) add('timer', st.kind === 'payment' ? 'payment' : 'staff', { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown }); }
      add('track', 'track');
      if (staff.length) { add('notes', 'staff'); add('history', 'all'); }
      if (model.notifications.length || model.systemSteps.some((s) => /notif|inform|email|sms|إشعار|اشعار/i.test(pick(s.name, 'en')))) add('notify', 'notify');
      if (out && (model.outputs.length || approvedOutput || pack.outputStory === 'always')) add('output', 'output');
      for (const r of pack.requirements?.extra || []) rows.push([`${pack.codes?.fr || 'FR'}-${pad(rows.length + 1)}`, tx(pick(r.text, locale)), tx(pick(r.unit, locale)), T.actorSystem]);
      return { blocks: [table(col('requirements'), rows)], fill: 'derived', source: { kind: 'model', ref: 'stages, actions, integrations, payment, timers' } };
    },
    workflow: (s) => {
      if (!model.graph) return null;
      const ir = { actors: model.actors.filter((a) => a.side === 'staff').map((a) => ({ id: a.id, name: pick(a.name, locale) })) };
      const nodes = model.graph.nodes.map((n) => ({ ...n, name: n.type === 'task' ? nameOfStage(n.id) : n.type === 'end' ? endName(endById(n.id)) : n.type === 'decision' ? '' : n.name }));
      // an edge out of a decision carries the caption of the action the stage before it offers
      const before = (id) => model.graph.edges.filter((x) => x.to === id).map((x) => x.from);
      const stagesBefore = (id, seen = new Set()) => before(id).flatMap((f) => (seen.has(f) ? [] : (seen.add(f), stageById(f) ? [stageById(f)] : stagesBefore(f, seen))));
      const edges = model.graph.edges.filter((e) => !e.timer).map((e) => { const sts = stageById(e.from) ? [stageById(e.from)] : stagesBefore(e.from); const a = sts.flatMap((st) => st.actions).find((x) => x.to === e.to); return { from: e.from, to: e.to, label: a && !stageById(e.to)?.kind?.match(/payment/) ? actionLabel(a) : '' }; });
      const applicantId = '__customer';
      for (const n of nodes) if (n.type === 'task' && stageById(n.id)?.actor === 'customer') n.actor = applicantId;
      const model2 = DIAGRAM.fromGraph({ nodes, edges }, { actors: [{ id: applicantId, name: 'customer' }, ...ir.actors], locale });
      return { blocks: [{ kind: 'diagram', caption: tx(pick(s.caption, locale) || '{name}'), model: model2 }], fill: 'derived', source: { kind: 'model', ref: 'people steps only (system steps folded)' } };
    },
    rules: () => {
      const rows = [];
      const code = (c) => c || `${pack.codes?.br || 'BR'}-${pad(rows.length + 1)}`;
      const has = { reroute: staff.some((s) => s.actions.some((a) => a.effect === 'back')), recipients: model.recipients.length > 0, serial: !!model.serial, phone: model.fields.some((f) => f.type === 'tel' || /phone|mobile|هاتف/i.test(`${f.key} ${pick(f.label, 'en')}`)), staff: staff.length > 0, partners: partners.length > 0, payment: !!payment };
      for (const r of pack.rules?.standard || []) {
        if (r.when && !r.when.split('&').every((w) => (w.startsWith('!') ? !has[w.slice(1)] : has[w]))) continue;
        let t = pick(r.text, locale);
        t = tx(t, { list: model.recipients.map((x) => pick(x, locale)).join(sep), pattern: pick(model.serial?.pattern, locale), reset: pick(model.serial?.reset, locale) });
        rows.push([code(r.code), t]);
      }
      if (pack.rules?.derived !== false) {
        for (const st of staff) for (const a of st.actions.filter((x) => x.effect !== 'forward')) rows.push([code(), tx(T.br.action, { a: actionLabel(a), s: stageName(st), e: effectText(st, a).replace(/^(\S)/, (c) => (locale === 'en' ? c.toLowerCase() : c)) })]);
        for (const t of model.timers) { const st = stageById(t.stage); const te = t.to && (endById(t.to) || stageById(t.to)); if (st) rows.push([code(), te ? tx(T.br.timerTo, { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown, e: effectText(st, { to: t.to, effect: endById(t.to) ? (endById(t.to).outcome === 'approved' ? 'endOk' : 'endStop') : 'forward' }).replace(/^(\S)/, (c) => (locale === 'en' ? c.toLowerCase() : c)) }) : tx(T.br.timer, { s: stageName(st), d: pick(t.duration, locale) || T.br.timerUnknown })]); if (st && !t.duration) ask(fill(T.q.timer, { d: t.raw.replace(/^\$\{|\}$/g, '').replace(/_/g, ' '), s: stageName(st) }), '5'); }
      }
      return rows.length ? { blocks: [table(col('rules'), rows)], fill: 'derived', source: { kind: 'model+pack', ref: 'staff actions, timers, standard rules' } } : null;
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
      const acts = st.actions.map((a) => [actionLabel(a), effectText(st, a)]);
      if (kind === 'customer' && payment) acts.splice(0, 1, [actionLabel(st.actions[0]), tx(T.effect.forward, { t: stageName(payment) })]);
      if (acts.length) item.actions = { columns: col('actions'), rows: acts };
      // the dictionary: the stage's fields, its documents, and its tasks (مهمات: never action rows)
      const rows = kind === 'customer' ? [...model.fields.map(dictRow), ...model.documents.map(docRow)] : kind === 'rework' ? [] : [...(st.fields || []).map((key) => dictRow(model.fields.find((f) => f.key === key))).filter(Boolean), ...stageTaskRows()];
      if (rows.length) item.dictionary = { columns: col('dictionary'), rows };
      const title = `${tx(P2.name, { s: sName })} (${portal(st)})`;
      sections.push({ title, blocks: [{ kind: 'stories', number: '', ...(k === 1 ? { lead: T.storyLead } : {}), items: [item] }], fill: kind === 'customer' ? 'evidence' : 'derived', source: st.source, unresolved });
    }
    if (out && (model.outputs.length || approvedOutput || pack.outputStory === 'always') && pack.outputStory !== 'never') {
      k += 1;
      const o = model.outputs[0] || {};
      const P2 = T.story.output;
      const item = { id: `${pack.codes?.us || 'US'}-${pad(k)}`, name: tx(P2.name), as: g('outputUser') || g('customer'), want: tx(P2.want), so: tx(P2.so), acceptance: [tx(T.acc.output1), ...(pack.outputAcceptance?.[locale] || []).map((x) => tx(x)), tx(T.acc.output2), ...(model.serial && secTitle.identifier ? [tx(T.acc.output3, { sec: secTitle.identifier || '' })] : [])] };
      const blocks = [{ kind: 'stories', number: '', items: [item] }];
      if (o.preview) blocks.push({ kind: 'shots', caption: tx(g('outputPreviewCaption')), images: [o.preview], width: 70 });
      blocks.push(table(col('outputCard'), [[g('outputNameLabel'), pick(o.name, locale) || out], [g('outputWhenLabel'), pick(o.when, locale) || (signed ? g('outputWhenSigned') || g('outputWhenDefault') : g('outputWhenDefault'))], [g('outputToLabel'), pick(o.to, locale) || g('outputToDefault')]]));
      sections.push({ title: `${tx(P2.name)} (${g('customerChannel')})`, blocks, fill: model.outputs.length ? 'evidence' : approvedOutput ? 'derived' : 'template', source: srcOf('outputs') || (approvedOutput ? { kind: 'model', ref: 'approved end' + (signed ? ' + signature steps' : '') } : null) });
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
      if (!gen) throw new Error(`pack ${pack.id}: section «${title}» names an unknown generator «${s.gen}»`);
      const r = gen(s, num);
      if (r?.sections) {
        r.sections.forEach((x, j) => {
          const n = `${ci + 1}.${sections.length + 1}`;
          for (const b of x.blocks) if (b.kind === 'stories') b.number = n;
          sections.push({ number: n, title: x.title, blocks: x.blocks });
          fillLog.push({ section: n, title: x.title, gen: s.gen, fill: x.fill, source: x.source || null, questions: x.unresolved || [] });
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
  });
  for (const q of extraQuestions) ask(pick(q.question, locale), q.blocks || '');
  // the code: looked up, never derived
  if (!model.code) ask(fill(T.q.code, { name }), '0');
  // an annex of open questions, when the pack has one
  for (const c of chapters) for (const s of c.sections) if (s.late) { s.blocks = questions.length ? [table(col('questions'), questions.map((q) => [q.id, q.question, q.owner]))] : [prose(T.none)]; delete s.late; }

  /* front matter */
  const C = { ...(pack.control || {}), ...(profile.control || {}) };
  const ver = (n) => fill(profile.versioning?.format || pack.versioning?.format || 'V{nn}', { nn: pad(n), n });
  const revisions = [];
  if (model.earlierIssue?.date) revisions.push([pick(model.earlierIssue.version, locale) || ver(1), model.earlierIssue.date, pick(model.earlierIssue.purpose, locale) || '', '—']);
  revisions.push([ver(revisions.length + 1), today, '', '—']);
  const control = {
    documentId: model.code ? fill(profile.codeFormat || pack.codeFormat || '{code}', { code: model.code }) : '—',
    title: `${pick(pack.titlePrefix, locale) || T.titlePrefix}: ${name}`,
    preparedBy: pick(C.preparedBy, locale), documentType: pick(C.documentType, locale), classification: pick(C.classification, locale),
    owner: pick(C.owner, locale) || g('entity'), issuedOn: today, version: revisions.at(-1)[0], status: pick(C.status, locale), reviewCycle: pick(C.reviewCycle, locale),
  };
  return {
    service: String(model.key || name).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 48) || 'document',
    composedAt: new Date().toISOString(),
    pack: pack.id,
    control, revisions, approvals: [], chapters, openQuestions: questions,
    fill: fillLog,
  };
}
