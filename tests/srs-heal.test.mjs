// The 30 gaps of the 0.13 SRS pipeline review (A1–A8, B1–B11, C ×11) and the D process rules: one check per
// gap, each failing on 0.12.0 and passing after its fix. Invented inputs only (samples/, tests/fixtures/srs/).
//
//   node tests/srs-heal.test.mjs        (also run from tests/srs.test.mjs, so `npm test` carries it)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO } from '../engine/export.mjs';
import { buildDocuments, buildToDir } from '../engine/srs/cli.mjs';
import { loadPack, coreText, deepMerge } from '../engine/srs/compose.mjs';
import { applyCorrections } from '../engine/srs/packs.mjs';
import { heal, HEALERS, collisions, countsOf } from '../engine/srs/heal/index.mjs';
import { commonData } from '../engine/srs/heal/cli.mjs';
import { pageFill, pageBoxes, fontAudit, correctionsInPdf } from '../engine/srs/heal/pdf.mjs';
import { parsePrevious, popplerBin } from '../engine/harvest/previous.mjs';
import { recordFromPage, walkFromScreens } from '../engine/harvest/record.mjs';
import { parseBpmn, humanGraph } from '../engine/harvest/model.mjs';
import { DIAGRAM } from '../engine/diagram.mjs';

const S = (...p) => path.join(REPO, 'samples', ...p);
const FX = (...p) => path.join(REPO, 'tests', 'fixtures', 'srs', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const TODAY = '2026-10-28';
const EP = { pack: 'e-service', profile: S('organisation', 'agency.profile.json'), harvest: S('event-permit', 'inputs', 'harvest.json'), model: S('event-permit', 'inputs', 'model.json'), roles: S('event-permit', 'inputs', 'names.json'), record: S('event-permit', 'inputs', 'record.json'), today: TODAY };
const secs = (d) => d.chapters.flatMap((c) => c.sections);
const ofGen = (d, gen) => (d.fill || []).filter((f) => f.gen === gen).map((f) => secs(d).find((s) => s.number === f.section)).filter(Boolean);
const tbl = (s) => s?.blocks?.find((b) => b.kind === 'table');
const storySecs = (d) => (d.fill || []).filter((f) => f.story).map((f) => ({ f, s: secs(d).find((x) => x.number === f.section) }));
const H = (r, id) => r.evidence.heal.find((h) => h.id === id);
const textOf = (pack, profile = {}) => Object.fromEntries(['ar', 'en'].map((lc) => [lc, deepMerge(deepMerge(coreText()[lc], pack.text?.[lc]), profile.text?.[lc])]));
/** Re-run one healer on (possibly altered) editions of a build. */
const reheal = (r, id, alter = () => {}, extra = {}) => { const docs = clone(r.docs); const model = clone({ ...r.model, graph: undefined }); model.graph = r.model.graph; alter(docs, model); return heal({ docs, model, evidence: r.evidence, pack: r.pack, profile: extra.profile || {}, text: textOf(r.pack), inputs: { raw: r.inputs.harvest, ir: r.inputs.model, record: r.inputs.record }, ...extra }, { only: [id] }).results[0]; };

/** A text-only PDF by hand (Helvetica), one entry per page: [{ y, size, text }] in PDF points from the top. */
function makePdf(pages, file) {
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];
  const kidsAt = objs.length + 1 + pages.length * 2; // the Pages object comes last
  for (const lines of pages) {
    const body = lines.map((l) => `BT /F1 ${l.size || 10} Tf 50 ${842 - l.y} Td (${l.text}) Tj ET`).join('\n');
    const c = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${kidsAt} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  fs.writeFileSync(file, out, 'latin1');
  return file;
}
const full = (n = 60) => Array.from({ length: n }, (_, i) => ({ y: 60 + i * 12, text: `Body line ${i + 1}` }));

export async function run(check) {
  const tmp = path.join(REPO, 'out', 'srs-heal-test'); fs.mkdirSync(tmp, { recursive: true });
  const ep = await buildDocuments(EP);
  const pack = loadPack('e-service');

  /* ── A ── */
  // A1: the card title wins over the model's name; the losing name is a harvest conflict; the healer repairs a document that lost it
  {
    const h = readJson(EP.harvest); h.languages.ar.card = { ...(h.languages.ar.card || {}), title: 'متابعة تصاريح الفعاليات العامة' }; h.languages.en.card = { ...(h.languages.en?.card || {}), title: 'Public event permits follow-up' };
    const r = await buildDocuments({ ...EP, harvest: h });
    const bad = reheal(r, 'title-is-portal', (d) => { d.ar.control.title = d.ar.control.title.replace('متابعة تصاريح الفعاليات العامة', 'طلب تصريح فعالية عامة'); });
    check('A1 title = portal card title, model name recorded as a conflict, healer repairs a lost title', r.docs.ar.control.title.endsWith('متابعة تصاريح الفعاليات العامة') && r.model.harvestConflicts.some((c) => c.field === 'name' && c.lost.source === 'model') && bad.status === 'REPAIRED', `${r.docs.ar.control.title} · ${bad.status}`);
  }
  // A2: a back-office request-type page dump becomes a record; record sections asked while a back office exists FAIL; a code outside the filed serial FAILs
  {
    const page = { url: 'https://backoffice.example/request-types/7', fields: [{ label: 'رمز الخدمة', value: '4410' }, { label: 'المديرية', value: 'مديرية المثال' }, { label: 'القسم', value: 'قسم التراخيص' }, { label: 'مركزي؟', value: 'نعم' }, { label: 'لون الشاشة', value: 'أزرق' }] };
    const rec = recordFromPage(page, { key: 'event-permit' });
    const r = await buildDocuments({ ...EP, profile: { ...readJson(EP.profile), codes: {} }, record: { ...readJson(EP.record), facts: { ...readJson(EP.record).facts, adminReference: undefined, filedSerial: '9999-2026-000017' } }, recordPage: page });
    const r2 = await buildDocuments({ ...EP, profile: { ...readJson(EP.profile), backOffice: true }, record: (() => { const x = readJson(EP.record); delete x.facts.adminReference; return x; })() });
    check('A2 record-page importer (code, admin reference, central), unmapped kept; record-present / code-vs-serial gates', rec.facts.code === '4410' && rec.facts.adminReference.length === 2 && rec.facts.place.ar === 'مركزي' && rec.unmapped.includes('لون الشاشة') && r.model.code === '4410' && H(r, 'record-present').status === 'FAIL' && /filed serial/.test(H(r, 'record-present').detail) && H(r2, 'record-present').status === 'FAIL' && /--record-page/.test(H(r2, 'record-present').detail), `${H(r, 'record-present').detail} | ${H(r2, 'record-present').status}`);
  }
  // A3: a site walk unions into the ledger (presentIn model+walk), its buttons are the captions, a walk-only desk is flagged
  {
    const walk = walkFromScreens([{ desk: 'submit', sections: ['بيانات الفعالية'] }, { desk: { key: 'rev', ar: 'التدقيق', en: 'Review' }, sections: ['بيانات الطلب'], buttons: [{ key: 'approve', label: { ar: 'اعتماد', en: 'Endorse' } }, { key: 'need-edit', label: { ar: 'إعادة للتعديل', en: 'Back for edits' } }, { key: 'reject', label: { ar: 'رفض الطلب', en: 'Refuse' } }], status: 'قيد التدقيق' }, { desk: { key: 'audit', ar: 'التدقيق المالي', en: 'Financial audit' }, buttons: ['موافقة'] }]);
    const r = await buildDocuments({ ...EP, walk });
    const row = r.evidence.ledger.find((x) => x.id === 'rev');
    const desk = storySecs(r.docs.ar).find((x) => x.f.stage === 'rev');
    const acts = desk.s.blocks[0].items[0].actions.rows.map((x) => x[0]);
    check('A3 walk importer: ledger union, verbatim buttons, walk-only and unwalked stages flagged', row.presentIn.includes('walk') && row.presentIn.includes('model') && acts.includes('اعتماد') && acts.includes('رفض الطلب') && H(r, 'ledger-union').status === 'FLAG' && r.evidence.openQuestions.some((q) => q.id === 'OQ-WALK-audit') && r.evidence.ledger.some((x) => x.id === 'head' && x.disposition === 'drawn-unobserved'), `${row.presentIn} · ${acts.join('|')} · ${H(r, 'ledger-union').detail}`);
  }
  // A4: a message bundle line belongs to a field only when its key names that field; the report counts both
  {
    const r = await buildDocuments({ ...EP, messages: FX('messages.txt') });
    const dict = storySecs(r.docs.ar)[0].s.blocks[0].items[0].dictionary.rows;
    check('A4 messages attributed by control key (2 in / 1 out), printed in the field constraints', r.model.messageReport.attributed === 2 && r.model.messageReport.leftOut === 1 && dict.find((x) => x[0] === 'اسم الفعالية')?.[6].includes('اسم الفعالية مطلوب') && /2 lines attributed \/ 1 left out/.test(H(r, 'messages-attributed').detail), H(r, 'messages-attributed').detail);
  }
  // A5: an earlier document: lineage, preparer, legislation where none stated; reflect FAILs when the new one says less
  {
    const prev = parsePrevious(fs.readFileSync(FX('previous.txt'), 'utf8'), 'previous.txt');
    const rec = readJson(EP.record); delete rec.facts.legislation; delete rec.facts.earlierIssue;
    const r = await buildDocuments({ ...EP, record: rec, previous: FX('previous.txt') });
    check('A5 previous document: 30 FR / 3 US counted, revisions + preparer + legislation taken, reflect FAILs on fewer requirements', prev.counts.requirements === 30 && prev.counts.stories === 3 && r.docs.ar.revisions.length === 3 && r.docs.en.control.preparedBy === 'Example Analysis Unit' && r.model.sources.legislation?.kind === 'document' && H(r, 'reflect').status === 'FAIL' && /requirements/.test(H(r, 'reflect').detail), H(r, 'reflect').detail);
  }
  // A6: round-robin assignee → autoAssign; drawn as an assignment step, in ch3 and in ch6; flow-fidelity FAILs when the step is dropped
  {
    const ir = parseBpmn(fs.readFileSync(FX('round-robin.bpmn20.xml'), 'utf8'));
    const r = await buildDocuments({ pack: 'e-service', profile: { kind: 'bw-profile', version: 1, id: 't', entity: { ar: 'جهة مثال', en: 'Example body' }, codes: { licenceRenewal: 'LR' } }, model: ir, today: TODAY });
    const ff = H(r, 'flow-fidelity');
    const lost = reheal(r, 'flow-fidelity', (d) => { const fig = secs(d.ar).flatMap((s) => s.blocks).find((b) => b.kind === 'diagram'); fig.model.nodes = fig.model.nodes.filter((n) => n.label !== 'التوزيع الآلي'); });
    check('A6 round-robin detected, assignment step in figure + ch3 + ch6; flow-fidelity FAILs without it', ir.steps.find((s) => s.id === 'check')?.autoAssign === true && ff.status === 'PASS' && lost.status === 'FAIL', `${ff.status}: ${ff.detail} | dropped: ${lost.detail}`);
  }
  // A7: branches + documents with no per-branch read → OQ-DOC-BRANCH; a per-branch read unions documents with shownWhen
  {
    const h = readJson(EP.harvest);
    h.languages.ar.steps[0].fields.splice(1, 0, { key: 'applicantKind', type: 'radio', label: 'صفة مقدم الطلب', required: true, options: ['فرد', 'منشأة'] });
    const r = await buildDocuments({ ...EP, harvest: h });
    const h2 = clone(h); h2.languages.ar.steps[0].docBranches = { 'سجل تجاري': ['صفة مقدم الطلب = منشأة'] };
    const r2 = await buildDocuments({ ...EP, harvest: h2 });
    const cr = r2.model.documents.find((d) => d.name.ar === 'سجل تجاري');
    check('A7 docs-per-branch: FLAG without a branch read; with one, the branch document joins §2.6 with its condition', H(r, 'docs-per-branch').status === 'FLAG' && r.evidence.openQuestions.some((q) => q.id === 'OQ-DOC-BRANCH') && cr?.shownWhen?.[0] === 'صفة مقدم الطلب = منشأة' && H(r2, 'docs-per-branch').status === 'PASS', `${H(r, 'docs-per-branch').status} / ${H(r2, 'docs-per-branch').status}`);
  }
  // A8: an unmasked output preview never prints; an output story with no picture raises OQ-OUTPUT-PREVIEW
  {
    const rec = readJson(EP.record); rec.facts.outputs[0].preview = path.join(tmp, 'missing-preview.png');
    const r = await buildDocuments({ ...EP, record: rec });
    check('A8 output-image: unmasked/missing preview FAILs; story without a picture FLAGs OQ-OUTPUT-PREVIEW', H(r, 'output-image').status === 'FAIL' && /not marked masked/.test(H(r, 'output-image').detail) && H(ep, 'output-image').status === 'FLAG' && ep.evidence.openQuestions.some((q) => q.id === 'OQ-OUTPUT-PREVIEW'), H(r, 'output-image').detail);
  }

  /* ── B ── */
  // B1: no open-questions chapter; open-questions.md always written; the healer FAILs a document that prints one
  {
    const w = await buildToDir({ ...EP, out: path.join(tmp, 'b1'), editor: false });
    const md = fs.readFileSync(path.join(tmp, 'b1', 'open-questions.md'), 'utf8');
    const qcols = pack.columns.questions.ar;
    const bad = reheal(ep, 'no-oq-chapter', (d) => { d.ar.chapters.push({ number: '7', title: 'الملاحق', sections: [{ number: '7.1', title: 'الأسئلة المفتوحة', blocks: [{ kind: 'table', columns: qcols, rows: [['Q1', 'x', 'y']] }] }] }); });
    check('B1 no questions chapter in the document; open-questions.md beside it; healer FAILs a printed annex', !secs(w.docs.ar).some((s) => /الأسئلة المفتوحة/.test(s.title)) && /# Open questions/.test(md) && H(w, 'no-oq-chapter').status === 'PASS' && bad.status === 'FAIL', bad.detail);
  }
  // B2: no stated output → no output story and no FR output row; the healer drops an output story printed anyway
  {
    const rec = readJson(EP.record); delete rec.facts.outputs;
    const r = await buildDocuments({ ...EP, record: rec });
    const withStory = await buildDocuments({ ...EP, record: rec, pack: { ...clone(pack), outputStory: 'always', outputFromApproval: true } });
    const rep = H(withStory, 'story-iff-output');
    check('B2 output story only where §2.9 names an output (approval alone is not one); healer drops a stray story', !storySecs(r.docs.ar).some((x) => x.f.story === 'output') && !tbl(ofGen(r.docs.ar, 'requirements')[0]).rows.some((x) => x[2] === 'مخرج الخدمة') && rep.status === 'REPAIRED', rep.detail);
  }
  // B3: §1.2's output clause only where §2.9 names an output; the healer removes a stray clause
  {
    const rec = readJson(EP.record); delete rec.facts.outputs;
    const r = await buildDocuments({ ...EP, record: rec });
    const p12 = (d) => secs(d).find((s) => s.number === '1.2').blocks[0].paragraphs[0];
    const rep = reheal(r, 'scope-clause', (d) => { const ps = secs(d.ar).find((s) => s.number === '1.2').blocks[0].paragraphs; ps[0] = ps[0].replace(/\.$/, '، وتمكّن من الحصول على الموافقات اللازمة لإصدار مخرج «طلب تصريح فعالية عامة».'); });
    check('B3 §1.2 output clause iff §2.9 has a row; healer strips a stray clause', !p12(r.docs.ar).includes('لإصدار') && p12(ep.docs.ar).includes('لإصدار مخرج «تصريح إلكتروني بصيغة PDF»') && rep.status === 'REPAIRED', rep.detail);
  }
  // B4: rule codes fixed to their rule; derived families (REJECT/EDIT/SLA) stay out; cap; «none» with no staff stage; healer FAILs a struck family or a moved code
  {
    const h = readJson(EP.harvest); h.languages.ar.steps[0].fields.push({ key: 'phone', type: 'tel', label: 'رقم الهاتف', required: true }); h.languages.en.steps[0].fields.push({ key: 'phone', type: 'tel', label: 'Phone', required: true });
    const withPhone = await buildDocuments({ ...EP, harvest: h });
    const rows = (r) => Object.fromEntries(tbl(ofGen(r.docs.ar, 'rules')[0]).rows.map((x) => [x[0], x[1]]));
    const a = rows(ep), b = rows(withPhone);
    const stable = Object.keys(a).every((k) => b[k] === a[k]) && b['BR-09'] && !a['BR-09'];
    const noStaff = await buildDocuments({ pack: 'e-service', profile: { kind: 'bw-profile', version: 1, id: 't', entity: { ar: 'جهة', en: 'Org' }, codes: { solo: 'S' } }, model: { kind: 'bw-process', version: 1, key: 'solo', name: 'Solo', actors: [], steps: [{ id: 's', type: 'start' }, { id: 'e', type: 'end', name: 'Done' }], flows: [{ from: 's', to: 'e' }] }, today: TODAY });
    const struck = reheal(ep, 'br-shape', (d) => { tbl(ofGen(d.ar, 'rules')[0]).rows.push(['BR-REJECT-01', 'x']); });
    const moved = reheal(ep, 'br-shape', () => {}, { prior: { ar: (() => { const d = clone(ep.docs.ar); tbl(ofGen(d, 'rules')[0]).rows[0][1] = 'نص آخر'; return d; })() } });
    check('B4 rule codes fixed (BR-09 appears, the rest keep their codes), no struck family, «none» without staff, healer FAILs struck/moved', stable && !Object.keys(a).some((k) => /REJECT|EDIT|SLA/.test(k)) && Object.keys(a).length <= pack.rules.maxCount && secs(noStaff.docs.ar).find((s) => s.title === 'جدول قواعد العمل').blocks[0].kind === 'prose' && struck.status === 'FAIL' && moved.status === 'FAIL', `${Object.keys(a).join(',')} → ${Object.keys(b).join(',')}`);
  }
  // B5: «النوع» is a person, rows follow the timeline, one row per desk action bar and per branch gate; healer FAILs a bare stage name
  {
    const fr = tbl(ofGen(ep.docs.ar, 'requirements')[0]).rows;
    const stageNames = ep.model.stages.map((s) => s.name?.ar).filter(Boolean);
    const h = readJson(EP.harvest); h.languages.ar.steps[0].fields.push({ key: 'sponsorName', type: 'text', label: 'اسم الراعي', required: false, shownWhen: ['نوع الفعالية = تجارية'] });
    const g = await buildDocuments({ ...EP, harvest: h });
    const gate = tbl(ofGen(g.docs.ar, 'requirements')[0]).rows.find((x) => x[1].includes('«اسم الراعي»'));
    const bad = reheal(ep, 'fr-shape', (d) => { tbl(ofGen(d.ar, 'requirements')[0]).rows[9][3] = 'التدقيق'; });
    check('B5 FR: a person in «النوع», timeline order, desk-action and branch-gate rows; healer FAILs a bare stage name', fr.some((x) => x[3] === 'المدقق') && fr.some((x) => x[3] === 'متلقي الخدمة') && !fr.some((x) => stageNames.includes(x[3]) && !['المدقق'].includes(x[3])) && fr.some((x) => x[1].includes('«موافقة»، «إرجاع للتدقيق»، «رفض»')) && gate && H(ep, 'fr-shape').status === 'PASS' && bad.status === 'FAIL', `${H(ep, 'fr-shape').detail} | ${bad.detail}`);
  }
  // B6: every story carries retrieved data, display criteria, stage fields, actions (or a stated none); a branch field sits under its gate
  {
    const h = readJson(EP.harvest); const fsA = h.languages.ar.steps[0].fields; fsA.push({ key: 'sponsorName', type: 'text', label: 'اسم الراعي', required: false, shownWhen: ['نوع الفعالية = تجارية'] });
    const g = await buildDocuments({ ...EP, harvest: h });
    const order = storySecs(g.docs.ar)[0].s.blocks[0].items[0].dictionary.rows.map((x) => x[0]);
    const bad = reheal(ep, 'story-contract', (d) => { const s = storySecs(d.ar)[1].s; s.blocks = s.blocks.filter((b) => b.kind !== 'table'); });
    check('B6 story contract (4 blocks) and branch field spliced under its gate; healer FAILs a story missing blocks', H(ep, 'story-contract').status === 'PASS' && order.indexOf('اسم الراعي') === order.indexOf('نوع الفعالية') + 1 && bad.status === 'FAIL', `${order.slice(0, 4).join('|')} · ${bad.detail}`);
  }
  // B7: a payment-named task with no fee on record is a system step, not a payment stage; the healer FAILs a payment row without a fee
  {
    const rec = readJson(EP.record); rec.facts.fees = [];
    const h = readJson(EP.harvest); for (const L of Object.values(h.languages)) if (L.card?.lists) L.card.lists = L.card.lists.filter((x) => !/رسوم|fee/i.test(x.title || ''));
    const r = await buildDocuments({ ...EP, record: rec, harvest: h });
    const bad = reheal(r, 'pay-needs-fee', (d) => { tbl(ofGen(d.ar, 'requirements')[0]).rows.push(['FR-99', 'x', 'الدفع', 'النظام']); });
    check('B7 no fee → no payment stage (system step + note); healer FAILs a payment row without a fee', !r.model.stages.some((s) => s.kind === 'payment') && r.model.notes.some((n) => n.kind === 'payment-without-fee') && H(r, 'pay-needs-fee').status === 'PASS' && bad.status === 'FAIL', bad.detail);
  }
  // B8: readiness default from the profile; «unknown» readiness WARNs
  {
    const rec = readJson(EP.record); for (const p of rec.facts.integrations.partners) delete p.readiness;
    const r = await buildDocuments({ ...EP, record: rec });
    const r2 = await buildDocuments({ ...EP, record: rec, profile: { ...readJson(EP.profile), integrations: { readinessDefault: { ar: 'جاهز', en: 'Ready' } } } });
    const cell = (x) => tbl(secs(x.docs.ar).find((s) => s.title === 'الربط مع شركاء الخدمة')).rows[0].at(-1);
    check('B8 readinessDefault fills an unstated readiness; «unknown» WARNs', cell(r2) === 'جاهز' && H(r, 'readiness').status === 'WARN' && H(r2, 'readiness').status === 'PASS', `${cell(r)} → ${cell(r2)}`);
  }
  // B9: a lineage of earlier issues, capped at maxRows, last row = this issue = the cover version
  {
    const rec = readJson(EP.record); rec.facts.earlierIssue = [{ version: 'V01', date: '2024-01-01' }, { version: 'V02', date: '2024-06-01' }, { version: 'V03', date: '2025-01-01' }];
    const r = await buildDocuments({ ...EP, record: rec });
    const bad = reheal(r, 'rev-tail', (d) => { d.ar.control.version = 'V01'; });
    check('B9 revisions = lineage capped at 3, last = V04 on the issue date = cover; healer FAILs a mismatched cover', r.docs.ar.revisions.length === 3 && r.docs.ar.revisions.at(-1)[0] === 'V04' && r.docs.ar.revisions.at(-1)[1] === TODAY && r.docs.ar.control.version === 'V04' && H(r, 'rev-tail').status === 'PASS' && bad.status === 'FAIL', JSON.stringify(r.docs.ar.revisions));
  }
  // B10: the preparer per service (record › earlier document › profile); a label is not a preparer
  {
    const rec = readJson(EP.record); rec.facts.preparedBy = { ar: 'وحدة تحليل المثال', en: 'Example analysis unit' };
    const r = await buildDocuments({ ...EP, record: rec });
    const bad = reheal(r, 'preparer-real', (d) => { d.ar.control.preparedBy = '—'; });
    check('B10 preparer from the record over the profile; healer FAILs a placeholder preparer', r.docs.ar.control.preparedBy === 'وحدة تحليل المثال' && H(r, 'preparer-real').status === 'PASS' && bad.status === 'FAIL', r.docs.ar.control.preparedBy);
  }
  // B11: the card register fills §2.7 when the record is silent and FAILs a disagreement
  {
    const reg = { 'طلب تصريح فعالية عامة': { adminReference: [[{ ar: 'الإدارة', en: 'Department' }, { ar: 'إدارة الفعاليات', en: 'Events department' }], [{ ar: 'القسم', en: 'Section' }, { ar: 'قسم آخر', en: 'Another section' }]] } };
    const rec = readJson(EP.record); delete rec.facts.adminReference;
    const filled = await buildDocuments({ ...EP, record: rec, register: reg });
    const clash = await buildDocuments({ ...EP, register: reg });
    check('B11 card register fills §2.7 (source register); a disagreement with §2.7 FAILs', filled.model.sources.adminReference?.kind === 'register' && H(filled, 'card-register').status === 'PASS' && H(clash, 'card-register').status === 'FAIL', H(clash, 'card-register').detail);
  }

  /* ── C ── */
  // C verify.ts: vocabulary and typography; «،،» and «أريد» repaired, «استمارة» FAILs
  {
    const fixd = reheal(ep, 'lint-text', (d) => { d.ar.chapters[0].sections[0].blocks[0].paragraphs[0] += ' أريد الخدمة،، الآن'; });
    const bad = reheal(ep, 'lint-text', (d) => { d.ar.chapters[0].sections[0].blocks[0].paragraphs[0] += ' عبر الاستمارة'; });
    check('C lint-text: «،،»/«أريد» repaired, «استمارة» FAILs, the sample is clean', H(ep, 'lint-text').status === 'PASS' && fixd.status === 'REPAIRED' && bad.status === 'FAIL', `${fixd.detail} | ${bad.detail}`);
  }
  // C ledger-check: a staff stage missing from 2.11/ch3/ch6 FAILs; drawn-unobserved means «a walk ran and missed it»
  {
    const bad = reheal(ep, 'ledger-check', (d) => { const s = ofGen(d.ar, 'roles')[0]; tbl(s).rows = tbl(s).rows.filter((x) => x[1] !== 'المدير العام'); });
    check('C ledger-check: stage missing from 2.11 FAILs; no walk → no drawn-unobserved row', H(ep, 'ledger-check').status === 'PASS' && bad.status === 'FAIL' && !ep.evidence.ledger.some((x) => x.disposition === 'drawn-unobserved'), bad.detail);
  }
  // C flow-collisions: a wire through a shape, overlapping shapes, a caption over a shape are found on the laid-out figure
  {
    const m = DIAGRAM.fromGraph({ nodes: [{ id: 'a', type: 'task', name: 'Alpha', actor: 'x' }, { id: 'b', type: 'task', name: 'Beta', actor: 'x' }], edges: [{ from: 'a', to: 'b', label: '' }] }, { actors: [{ id: 'x', name: 'Staff' }], locale: 'en' });
    const clean = collisions(m, { locale: 'en' });
    const m2 = clone(m); const [n1, n2] = m2.nodes.filter((n) => n.kind !== 'group'); n2.x = n1.x + 10; n2.y = n1.y + 5;
    const hit = collisions(m2, { locale: 'en' });
    check('C flow-collisions: a clean two-step figure passes, overlapping shapes are reported', !clean.length && hit.some((x) => /overlap|crosses/.test(x)), `${clean.length} / ${hit.slice(0, 2).join('; ')}`);
    // the router itself keeps every wire off every shape: the three samples and a 16-task, 6-gateway process
    const shop = await buildDocuments({ pack: 'e-commerce', profile: S('organisation', 'eshop.profile.json'), harvest: S('e-shop', 'harvest.json'), model: S('e-shop', 'model.json'), roles: S('e-shop', 'names.json'), record: S('e-shop', 'record.json'), today: TODAY });
    const call = await buildDocuments({ pack: 'call-centre', profile: S('organisation', 'callcentre.profile.json'), harvest: S('telemarketing', 'harvest.json'), model: S('telemarketing', 'model.json'), roles: S('telemarketing', 'names.json'), record: S('telemarketing', 'record.json'), today: TODAY });
    const st = [ep, shop, call].map((r) => H(r, 'flow-collisions'));
    check('C flow-collisions: event-permit, e-shop and telemarketing figures PASS', st.every((h) => h.status === 'PASS'), st.map((h) => `${h.status} ${h.detail}`).join(' | '));
    const ir = parseBpmn(fs.readFileSync(FX('many-tasks.bpmn20.xml'), 'utf8'));
    const g = humanGraph(ir);
    const big = ['en', 'ar'].map((lc) => DIAGRAM.fromGraph(g, { actors: ir.actors, locale: lc, flow: lc === 'ar' ? 'rtl' : 'ltr' }));
    const hits = big.flatMap((m, i) => collisions(m, { locale: ['en', 'ar'][i] }));
    const tasks = ir.steps.filter((s) => s.type === 'task').length;
    const gates = big[0].nodes.filter((n) => n.kind === 'decision').length;
    check('C flow-collisions: 16 user tasks + 6 gateways route clear in both editions, no system step drawn', tasks >= 15 && gates >= 6 && !hits.length && !big[0].nodes.some((n) => n.kind === 'system'), `${tasks} tasks, ${gates} gates, ${hits.join('; ')}`);
  }
  // C flow-fidelity: a model stage with no shape on the sheet FAILs
  {
    const bad = reheal(ep, 'flow-fidelity', (d) => { for (const lc of ['ar', 'en']) { const fig = secs(d[lc]).flatMap((s) => s.blocks).find((b) => b.kind === 'diagram'); fig.model.nodes = fig.model.nodes.filter((n) => !['staff'].includes(n.kind)); } });
    check('C flow-fidelity: stages dropped from the sheet FAIL; the sample passes', H(ep, 'flow-fidelity').status === 'PASS' && bad.status === 'FAIL', bad.detail);
  }
  // C caption-check: with a walked desk, a caption not on that desk's own bar FAILs
  {
    const walk = walkFromScreens([{ desk: { key: 'rev', ar: 'التدقيق', en: 'Review' }, buttons: [{ key: 'approve', label: { ar: 'اعتماد', en: 'Endorse' } }] }]);
    const r = await buildDocuments({ ...EP, walk });
    check('C captions-verbatim: walked desk with captions off its bar FAILs; no walk → WARN at most', H(r, 'captions-verbatim').status === 'FAIL' && /rev:/.test(H(r, 'captions-verbatim').detail) && H(ep, 'captions-verbatim').status !== 'FAIL', H(r, 'captions-verbatim').detail);
  }
  // C figure-freeze: --freeze stores the figure; a later build whose figure differs FAILs
  {
    const dir = path.join(tmp, 'freeze');
    await buildToDir({ ...EP, out: dir, editor: false, freeze: true });
    const same = await buildToDir({ ...EP, out: dir, editor: false });
    const rec = readJson(EP.record); rec.facts.desks = { ...(rec.facts.desks || {}) };
    const changed = await buildToDir({ ...EP, model: (() => { const m = readJson(EP.model); m.steps.find((s) => s.id === 'gm').options = { approve: 'approved', reject: 'rejected' }; const f = path.join(tmp, 'm-freeze.json'); fs.writeFileSync(f, JSON.stringify(m)); return f; })(), out: dir, editor: false });
    check('C figure-freeze: frozen figure byte-equal passes, a changed figure FAILs', fs.existsSync(path.join(dir, 'figure-frozen.json')) && H(same, 'figure-freeze').status === 'PASS' && H(changed, 'figure-freeze').status === 'FAIL', `${H(same, 'figure-freeze').status} / ${H(changed, 'figure-freeze').status}`);
  }
  // C page-fill / page-breaks + font-coverage + client-fixes on a PDF (poppler)
  const poppler = /poppler/i.test(spawnSync(popplerBin('pdftotext'), ['-v'], { encoding: 'utf8' }).stderr || '');
  if (poppler) {
    const pdf = makePdf([full(), full(), [{ y: 60, text: 'Short page' }, { y: 72, text: 'Second line' }], [...full(55), { y: 740, size: 20, text: 'Stranded heading' }], full()], path.join(tmp, 'fill.pdf'));
    const f = pageFill(pageBoxes(pdf));
    check('C page-fill: a near-empty page is under the 40% floor, a heading at the foot of a page is stranded', f.fail.some((x) => x.page === 3) && f.stranded.includes(4) && !f.low.some((x) => x.page === 2), JSON.stringify({ low: f.low, stranded: f.stranded }));
    const a = fontAudit(pdf);
    check('C font-coverage on every export: a fallback face (Helvetica) is reported', a.fallback.includes('Helvetica') || a.fallback.some((x) => /Helvetica/.test(x)), JSON.stringify(a));
    const c = correctionsInPdf(pdf, [{ id: 'K1', find: 'Old words', replace: 'Short page' }, { id: 'K2', find: 'x', replace: 'Absent text', expect: 'Absent text' }, { id: 'K3', find: 'Body line 7', replace: 'y', stale: 'Body line 7' }], 'en');
    const rep = applyCorrections(clone(ep.docs.ar), [{ id: 'S1', find: 'لا شيء هنا', replace: 'x', stale: 'مخرج الخدمة' }], 'ar');
    check('C client-fixes: `stale` text still present FAILs the correction; the PDF is read for landed/gone', rep[0].status === 'FAIL' && c.find((x) => x.id === 'K1').landed && !c.find((x) => x.id === 'K2').landed && !c.find((x) => x.id === 'K3').gone, JSON.stringify(c));
  } else for (const n of ['C page-fill', 'C font-coverage', 'C client-fixes']) check(`${n} (poppler not found: skipped)`, true);
  // C no-common-data: a value two services both print is flagged
  {
    const other = clone(ep.docs.ar); const cd = commonData([{ name: 'svc-a', doc: ep.docs.ar }, { name: 'svc-b', doc: other }]);
    const lone = commonData([{ name: 'svc-a', doc: ep.docs.ar }]);
    check('C no-common-data: values copied between two services are flagged', cd.length > 0 && cd.every((x) => x.services.length === 2) && !lone.length, `${cd.length} shared`);
  }
  // C service-card-check / preparers / old-srs-reflect: the three ports are registered healers
  check('C service-card / preparer / reflect healers registered (B11 / B10 / A5)', ['card-register', 'preparer-real', 'reflect'].every((id) => HEALERS.some((h) => h.id === id)) && typeof countsOf(ep.docs.ar).requirements === 'number');

  /* ── D ── */
  {
    const h = readJson(EP.harvest); h.languages.ar.steps[0].fields[1].options = [];
    const r = await buildDocuments({ ...EP, harvest: h });
    const ir = parseBpmn(fs.readFileSync(FX('round-robin.bpmn20.xml'), 'utf8'));
    const b = await buildDocuments({ pack: 'e-service', profile: { kind: 'bw-profile', version: 1, id: 't', entity: { ar: 'جهة', en: 'Org' }, codes: { licenceRenewal: 'LR' } }, model: ir, today: TODAY });
    check('D empty-read: a 0-option select FAILs (a tool suspicion); bpmn-lint FLAGs a borrowed form key and a typo', H(r, 'empty-read').status === 'FAIL' && H(ep, 'empty-read').status === 'PASS' && H(b, 'bpmn-lint').status === 'FLAG' && /otherProcess-check/.test(H(b, 'bpmn-lint').detail) && /acrion/.test(H(b, 'bpmn-lint').detail), H(b, 'bpmn-lint').detail);
  }
  check('every built document: no healer error', [ep].every((r) => r.evidence.heal.every((h) => !/healer error/.test(h.detail))), ep.evidence.heal.filter((h) => /healer error/.test(h.detail)).map((h) => `${h.id}: ${h.detail}`).join(' / '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const results = []; let failed = 0;
  const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
  try { await run(check); } catch (e) { check('srs-heal run', false, e.stack?.split('\n').slice(0, 4).join(' / ')); }
  console.log(results.join('\n'));
  console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
  process.exit(failed ? 1 : 0);
}
