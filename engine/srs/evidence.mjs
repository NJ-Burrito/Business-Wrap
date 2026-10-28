// Stage 2: 02-evidence.json — the model with a source beside every fact, the element ledger (every workflow
// element any source knows, its disposition and the sections that took it up), the untraced elements, the
// fill of every section and the open questions. A ledger row with no disposition fails the build.
import { pick } from './model.mjs';

const GEN_OF = {
  field: ['stories', 'dataDictionary'], document: ['documents', 'stories', 'dataDictionary'], stage: ['stories', 'roles', 'workflow'],
  payment: ['fees', 'requirements', 'workflow'], action: ['stories', 'workflow'], return: ['rules', 'stories', 'workflow'], decision: ['workflow'],
  end: ['workflow', 'statuses'], timer: ['rules', 'requirements'], fee: ['fees'], integration: ['integrations', 'requirements'],
  output: ['outputs', 'stories'], legislation: ['legislation'], recipient: ['recipients', 'rules'], notification: ['notifications', 'requirements'],
  kpi: ['kpis'], sla: ['slas'], channel: ['channels', 'prose'], system: [],
};
const NOTIFY = /notif|inform|email|sms|message|إشعار|اشعار|رسال/i;
const BILL = /bill|invoice|fee|payment|فاتور|رسوم|دفع/i;

export function ledgerOf(model, doc, pack) {
  const secs = (gens) => [...new Set(doc.fill.filter((f) => gens.includes(f.gen) && f.fill !== 'question').map((f) => f.section))];
  const has = (gen) => doc.fill.some((f) => f.gen === gen && f.fill !== 'question');
  const rows = [];
  // presentIn is the union of every source that names the element (model, crawl, walk, record, document)
  const row = (kind, id, name, source, disposition, gens, present) => rows.push({ kind, id, name, presentIn: [...new Set([...(present || []), source?.kind].filter(Boolean))], source, disposition, sections: secs(gens) });
  const drawn = new Set((model.graph?.nodes || []).map((n) => n.id));
  for (const f of model.fields) row('field', f.key, f.label, f.source, 'document-only', GEN_OF.field);
  for (const d of model.documents) row('document', pick(d.name, 'en'), d.name, d.source, 'document-only', GEN_OF.document);
  for (const s of model.stages) {
    const kind = s.kind === 'payment' ? 'payment' : 'stage';
    // drawn-unobserved = on the figure, but a site walk ran and never reached it; not drawn = document-only
    const seen = (s.presentIn || []).includes('walk');
    row(kind, s.id, s.name || { ar: 'submit', en: 'submit' }, s.source, s.id === 'submit' || !drawn.has(s.id) ? 'document-only' : model.walked && !seen ? 'drawn-unobserved' : 'drawn', GEN_OF[kind], s.presentIn);
    for (const a of s.actions) {
      const ret = a.effect === 'back' || a.effect === 'rework';
      row(ret ? 'return' : 'action', `${s.id}→${a.to || a.key}`, a.label, a.source, s.id === 'submit' ? 'document-only' : 'drawn', ret ? GEN_OF.return : a.effect === 'endStop' ? ['rules', 'stories', 'workflow'] : GEN_OF.action);
    }
  }
  for (const w of model.walkOnly || []) row('stage', `walk:${w.key}`, w.name, w.source, 'document-only', [], ['walk']);
  for (const n of (model.graph?.nodes || []).filter((x) => x.type === 'decision')) row('decision', n.id, { ar: '', en: '' }, { kind: 'model', ref: n.id }, 'drawn', GEN_OF.decision);
  for (const e of model.ends) row('end', e.id, e.name, e.source, 'drawn', GEN_OF.end);
  for (const t of model.timers) row('timer', t.id, { ar: t.raw, en: t.raw }, t.source, 'document-only', GEN_OF.timer);
  for (const s of model.systemSteps) {
    const own = (pack?.systemTrace || []).find((t) => new RegExp(t.match, 'i').test(pick(s.name, 'en')));
    // a system step that computes a routing value is stated by that routing rule (D08)
    const routes = !!model.routingPrinted?.ar && (model.routing || []).some((r) => (r.via || []).includes(s.id));
    const gens = own ? own.gens : routes ? ['rules'] : NOTIFY.test(pick(s.name, 'en')) ? ['requirements'] : BILL.test(pick(s.name, 'en')) ? ['fees', 'requirements'] : [];
    rows.push({ kind: 'system', id: s.id, name: s.name, presentIn: ['model'], source: s.source, disposition: 'not-a-stage', sections: gens.length ? secs(gens) : [] });
  }
  model.fees.forEach((f, i) => row('fee', `fee-${i + 1}`, f.amount, model.sources.fees, 'document-only', GEN_OF.fee));
  for (const [k, L] of Object.entries(model.integrations)) L.forEach((x, i) => row('integration', `${k}-${i + 1}`, x.name, model.sources[`integrations.${k}`], 'document-only', GEN_OF.integration));
  model.outputs.forEach((o, i) => row('output', `output-${i + 1}`, o.name, model.sources.outputs, 'document-only', GEN_OF.output));
  model.legislation.forEach((l, i) => row('legislation', `law-${i + 1}`, l.name, model.sources.legislation, 'document-only', GEN_OF.legislation));
  model.recipients.forEach((r, i) => row('recipient', `recipient-${i + 1}`, r, model.sources.recipients, 'document-only', GEN_OF.recipient));
  model.channels.forEach((c, i) => row('channel', `channel-${i + 1}`, c, model.sources.channels, 'document-only', GEN_OF.channel));
  model.notifications.forEach((n, i) => row('notification', `notify-${i + 1}`, n.event, model.sources.notifications, 'document-only', GEN_OF.notification));
  model.kpis.forEach((n, i) => row('kpi', `kpi-${i + 1}`, n.name, model.sources.kpis, 'document-only', GEN_OF.kpi));
  // a stated system variable a timer resolved is stated by that timer's rule and requirement (D07)
  model.slas.forEach((n, i) => row('sla', `sla-${i + 1}`, n.stage, model.sources.slas, 'document-only', model.timers.some((t) => t.sla === i) ? [...GEN_OF.sla, ...GEN_OF.timer] : GEN_OF.sla));
  // a drawn element must be on the figure when the pack has one
  if (!has('workflow')) for (const r of rows) if (r.disposition === 'drawn') r.disposition = 'document-only';
  return rows;
}

// the build's questions: kept beside an edition that does not print them ($questions), else the printed list
const qs = (d) => d.$questions || d.openQuestions || [];
export function evidenceOf(model, docs, pack) {
  const ledger = ledgerOf(model, docs.ar, pack);
  const noDisposition = ledger.filter((r) => !r.disposition);
  if (noDisposition.length) throw new Error(`ledger: ${noDisposition.length} element(s) without a disposition: ${noDisposition.map((r) => r.id).join(', ')}`);
  const untraced = ledger.filter((r) => !r.sections.length);
  const fill = docs.ar.fill.map((f, i) => ({ ...f, titleEn: docs.en.fill[i]?.title }));
  const counts = fill.reduce((o, f) => ((o[f.fill] = (o[f.fill] || 0) + 1), o), {});
  const { graph, ...m } = model;
  return { kind: 'bw-evidence', version: 1, pack: pack.id, model: m, ledger, untraced: untraced.map((r) => ({ kind: r.kind, id: r.id, name: r.name })), fill, counts, openQuestions: qs(docs.ar).map((q, i) => ({ id: q.id, ar: q.question, en: qs(docs.en)[i]?.question, section: q.blocks })) };
}
