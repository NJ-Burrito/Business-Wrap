// WP8: the 21 pipeline defects (D01–D21) and the reference-diff rows found on six real builds, each pinned by one
// check that fails on v013/wp7 @ 9c4b006 and passes after its fix. Invented inputs only (tests/fixtures/srs/wp8/).
//
//   node tests/srs-wp8.test.mjs        (also run from tests/srs.test.mjs, so `npm test` carries it)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO } from '../engine/export.mjs';
import * as CLI from '../engine/srs/cli.mjs';
import { heal, collisions } from '../engine/srs/heal/index.mjs';
import { coreText, deepMerge } from '../engine/srs/compose.mjs';
import { fold } from '../engine/srs/model.mjs';
import * as PDF from '../engine/srs/heal/pdf.mjs';
import { DIAGRAM } from '../engine/diagram.mjs';
import { makePdf } from './srs-heal.test.mjs';

const FX = (...p) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const TODAY = '2026-10-29';
const G = { pack: 'e-service', profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: FX('garden.record.json'), today: TODAY };
const secs = (d) => d.chapters.flatMap((c) => c.sections);
const ofGen = (d, gen) => (d.fill || []).filter((f) => f.gen === gen).map((f) => secs(d).find((s) => s.number === f.section)).filter(Boolean);
const tbl = (s) => s?.blocks?.find((b) => b.kind === 'table');
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!k.startsWith('$')) strings(v, out); return out; };
const H = (r, id) => r.evidence.heal.find((h) => h.id === id);
const stage = (r, id) => r.model.stages.find((s) => s.id === id);
const story = (d, id) => { const f = d.fill.find((x) => x.stage === id); const s = f && secs(d).find((x) => x.number === f.section); return s?.blocks.find((b) => b.kind === 'stories')?.items[0]; };
const textOf = (pack, profile = {}) => Object.fromEntries(['ar', 'en'].map((lc) => [lc, deepMerge(deepMerge(coreText()[lc], pack.text?.[lc]), profile.text?.[lc])]));

// optional imports, so the same file runs (and fails check by check) on the commit before the fixes
const { buildDocuments } = CLI;
const exportStem = (...a) => (CLI.exportStem ? CLI.exportStem(...a) : undefined);
const { correctionsInPdf } = PDF;
const questionsInPdf = (...a) => (PDF.questionsInPdf ? PDF.questionsInPdf(...a) : { heads: [], ids: [] });
const DUMP = await import('../engine/harvest/dump.mjs').catch(() => ({ readDump: () => ({ languages: { ar: { steps: [] }, en: { steps: [] } } }), fromDump: () => {} }));
const { readDump, fromDump } = DUMP;

export async function run(check) {
  const r = await buildDocuments(G);
  const { ar, en } = r.docs;
  const prof = readJson(G.profile);

  // D01 questions never printed: the document's list is empty, the build's questions are in the evidence; a printed list is repaired
  try {
    const bad = clone(r.docs); bad.ar.openQuestions = [{ id: 'Q1', question: 'x', owner: 'y', blocks: '2' }];
    const h = heal({ docs: bad, model: r.model, evidence: r.evidence, pack: r.pack, profile: prof, text: textOf(r.pack, prof), inputs: {} }, { only: ['no-oq-chapter'] }).results[0];
    check('D01 questions stay beside the document (list empty in both editions, kept in the evidence); a printed list is REPAIRED', !ar.openQuestions.length && !en.openQuestions.length && r.evidence.openQuestions.length > 0 && H(r, 'no-oq-chapter').status === 'PASS' && h.status === 'REPAIRED' && !bad.ar.openQuestions.length, `${ar.openQuestions.length}/${r.evidence.openQuestions.length} · ${h.status}`);
  } catch (e) { check('D01 (threw)', false, e.message); }
  // D21 a question section prints the absence text and no id (unless the profile prints questions)
  try {
    const ids = strings(ar.chapters).filter((x) => /(^|\s)Q\d+\b/.test(x));
    const on = await buildDocuments({ ...G, profile: { ...prof, questionsInDocument: true } });
    check('D21 no «لا يوجد، Qn» in the body; with questionsInDocument the id is printed', !ids.length && strings(on.docs.ar.chapters).some((x) => /— Q\d+/.test(x)), ids.slice(0, 2).join(' / '));
  } catch (e) { check('D21 (threw)', false, e.message); }
  // D02 stage names: walk › names file › the record's desk name › the model (here: no names file)
  try { check('D02 record desk names reach the Arabic edition without --roles', stage(r, 'screen').name.ar === 'الفرز' && stage(r, 'head').name.ar === 'رئيس الوحدة' && stage(r, 'head').name.en === 'Head of unit', JSON.stringify([stage(r, 'screen').name, stage(r, 'head').name])); } catch (e) { check('D02 (threw)', false, e.message); }
  // D03 a desk label that is only its key is no caption
  try {
    const labs = stage(r, 'screen').actions.map((a) => a.label);
    check('D03 «need-edit» / «approve-request» labels fall through to a caption', !labs.some((l) => /need-edit|approve-request/.test(`${l.ar} ${l.en}`)), JSON.stringify(labs));
  } catch (e) { check('D03 (threw)', false, e.message); }
  // D04 the verbatim check binds observed desks only
  try { check('D04 captions-verbatim does not FAIL on record desks whose action list came from the model', H(r, 'captions-verbatim').status !== 'FAIL', H(r, 'captions-verbatim').detail); } catch (e) { check('D04 (threw)', false, e.message); }
  // D05 the portal form dump importer (generic format): radio grouping, mirror drop, date, branch fields, per-branch documents
  try {
    const h = readDump(FX('garden-form.ar.json'), { name: 'gardenPermit' });
    const f = h.languages.ar.steps.flatMap((s) => s.fields);
    const radio = f.filter((x) => x.key === 'gardenType');
    const water = f.find((x) => x.label === 'مصدر المياه');
    const db = h.languages.ar.steps.find((s) => s.docBranches)?.docBranches || {};
    check('D05 dump importer: one radio field with both options, mirror dropped, date typed, branch field + branch document conditioned', h.kind === 'bw-harvest' && radio.length === 1 && radio[0].options.length === 2 && f.filter((x) => x.key === 'plotNumber').length === 1 && f.find((x) => x.key === 'startOn')?.type === 'date' && water?.shownWhen?.[0] === 'نوع الحديقة = حديقة خضار' && db['تصريح المياه (مرفق اجباري)']?.[0] === 'نوع الحديقة = حديقة خضار' && h.languages.en.steps.flatMap((s) => s.fields).some((x) => x.label === 'Water source'), JSON.stringify({ radio, water, db }));
    let threw = '';
    try { const L = { ar: readJson(FX('garden-form.ar.json')), en: readJson(FX('garden-form.en.json')) }; L.en.form.pop(); fromDump(L); } catch (e) { threw = e.message; }
    check('D05 dump importer refuses AR/EN reads that do not align', /do not align/.test(threw), threw);
  } catch (e) { check('D05 (threw)', false, e.message); }
  // D06 an upload control without an attachment-name list is a document and a dictionary row
  try {
    const docs = tbl(ofGen(ar, 'documents')[0])?.rows || [];
    const dict = story(ar, 'submit')?.dictionary?.rows || [];
    check('D06 «إرفاق صور القطعة» is in §2.6 (required) and the applicant dictionary', docs.some((x) => x[0] === 'إرفاق صور القطعة' && x[1] === 'اجباري') && dict.some((x) => x[0] === 'إرفاق صور القطعة'), JSON.stringify(docs.map((x) => x[0])));
  } catch (e) { check('D06 (threw)', false, e.message); }
  // D07 an expression timer takes its duration from the record's stated system variable
  try {
    const t = r.model.timers.find((x) => x.raw === '${edit_duration}');
    const fr = tbl(ofGen(ar, 'requirements')[0]).rows.map((x) => x[1]).join(' | ');
    check('D07 ${edit_duration} → «30 يوماً» from facts.slas; the FR states it; the system variable is traced', t?.duration?.ar === '30 يوماً' && t.duration.en === '30 days' && fr.includes('30 يوماً') && !r.evidence.untraced.some((u) => u.kind === 'sla'), `${JSON.stringify(t?.duration)} · untraced ${JSON.stringify(r.evidence.untraced)}`);
  } catch (e) { check('D07 (threw)', false, e.message); }
  // D08 a gateway on a computed value (not the action) is a business rule; the step that computes it is traced
  try {
    const br = tbl(ofGen(ar, 'rules')[0]).rows.map((x) => x[1]);
    check('D08 PLOT_SCORE routing printed as a rule; «Score the plot» traced; its meaning asked beside the document', br.some((x) => /يحدّد النظام آلياً مسار/.test(x) && x.includes('«رئيس الوحدة»')) && !r.evidence.untraced.some((u) => u.id === 'score') && r.evidence.openQuestions.some((q) => /PLOT_SCORE/.test(q.ar)), br.join(' | '));
  } catch (e) { check('D08 (threw)', false, e.message); }
  // D09 a record list stated empty keeps its source: «none», not a question
  try {
    const rec = readJson(G.record); rec.facts.documents = [];
    const r2 = await buildDocuments({ ...G, harvestDump: undefined, record: rec });
    check('D09 facts.documents = [] prints «لا يوجد» (stated-none), not an open question', r2.docs.ar.fill.find((f) => f.gen === 'documents')?.fill === 'stated-none', r2.docs.ar.fill.find((f) => f.gen === 'documents')?.fill);
  } catch (e) { check('D09 (threw)', false, e.message); }
  // D10 one caption once: two «approve» flows of one desk
  try {
    const it = story(ar, 'head');
    const roles = tbl(ofGen(ar, 'roles')[0]).rows.filter((x) => /موافقة/.test(x[3]));
    const appr = (it?.actions?.rows || []).filter((x) => x[0] === 'موافقة');
    check('D10 «موافقة» once in 2.11 and in the actions table (both effects in one row)', appr.length === 1 && appr[0][1].includes(' أو ') && roles.length > 0 && roles.every((x) => x[3].match(/موافقة/g).length === 1), JSON.stringify([roles.map((x) => x[3]), it?.actions?.rows]));
  } catch (e) { check('D10 (threw)', false, e.message); }
  // D11 poppler's bidi marks at a line wrap do not hide a correction
  try { check('D11 fold drops U+200E/U+200F/U+202A–U+202E/U+2066–U+2069', fold('تصريح‫ حديقة‏⁦ مجتمعية⁩') === fold('تصريح حديقة مجتمعية')); } catch (e) { check('D11 (threw)', false, e.message); }
  // D12 punctuation-only corrections compare unfolded text, and need an expect; the PDF-level question gate
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-wp8-'));
    const pdf = makePdf([[{ y: 100, text: 'The permit for "garden" is kept.' }]], path.join(tmp, 'q.pdf'));
    const c = correctionsInPdf(pdf, [{ id: 'quote', find: '"garden"', replace: '«garden»', expect: '«garden' }, { id: 'bare', find: '"garden"', replace: '«garden»' }], 'en');
    check('D12 a straight-quote correction still printed straight is not landed; one with no expect is refused', c[0].landed === false && !!c[1].refused && !c[1].landed, JSON.stringify(c));
    const qp = makePdf([[{ y: 100, text: 'Open questions' }, { y: 130, text: 'Q3 What is the fee?' }]], path.join(tmp, 'oq.pdf'));
    const qs = questionsInPdf(qp, { labels: ['Open questions'] });
    const ok = questionsInPdf(pdf, { labels: ['Open questions'] });
    check('D01 PDF gate: a printed questions heading and a question id are found; a clean PDF passes', qs.heads.length === 1 && qs.ids.includes('Q3') && !ok.heads.length && !ok.ids.length, JSON.stringify(qs));
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) { check('D12 (threw)', false, e.message); }
  // D13 a caption with no free seat beside its wire is seated further out with a leader line, never on a shape
  try {
    const m = { kind: 'bw-diagram', version: 1, flow: 'ltr', legend: false, nodes: [{ id: 'a', kind: 'staff', label: 'A', x: 0, y: 0, w: 120, h: 50 }, { id: 'b', kind: 'staff', label: 'B', x: 140, y: 0, w: 120, h: 50 }], edges: [{ id: 'e1', from: 'a', to: 'b', label: 'a rather long caption for a short wire' }] };
    const hits = collisions(m, { locale: 'en' });
    const lead = DIAGRAM.resolve(m, { locale: 'en' }).items.some((i) => i.t === 'line' && i.leader === 'e1');
    check('D13 crowded caption: no caption over a shape, a leader line ties it to its wire', !hits.length && lead, hits.join('; '));
  } catch (e) { check('D13 (threw)', false, e.message); }
  // D14 no «التوزيع الآلي» shape; the round-robin is a ch3 requirement on its stage
  try {
    const fig = secs(ar).flatMap((s) => s.blocks).find((b) => b.kind === 'diagram');
    const fr = tbl(ofGen(ar, 'requirements')[0]).rows.find((x) => /آلياً على موظف/.test(x[1]));
    check('D14 figure has people steps only; the round-robin requirement is on «الفرز»', !fig.model.nodes.some((n) => n.label === 'التوزيع الآلي' || n.kind === 'system') && fr?.[2] === 'الفرز' && H(r, 'flow-fidelity').status === 'PASS', `${fr} · ${H(r, 'flow-fidelity').detail}`);
  } catch (e) { check('D14 (threw)', false, e.message); }
  // D15 BR printed gap-free (rules.sequential), fixed codes kept beside for the stability check
  try {
    const t = tbl(ofGen(ar, 'rules')[0]);
    check('D15 BR-01…BR-n gap-free, fixed codes in $codes', t.rows.every((x, i) => x[0] === `BR-${String(i + 1).padStart(2, '0')}`) && t.$codes?.length === t.rows.length && t.$codes.some((c, i) => c !== t.rows[i][0]), JSON.stringify(t.$codes));
  } catch (e) { check('D15 (threw)', false, e.message); }
  // D16 the document id's letter code from docCodes; a missing one uses the service code and says so
  try {
    const r2 = await buildDocuments({ ...G, profile: { ...prof, docCodes: {} } });
    check('D16 id MGC-SRS-GDN-01 from docCodes; without an entry MGC-SRS-41-01 + a WARN naming it', ar.control.documentId === 'MGC-SRS-GDN-01' && r2.docs.ar.control.documentId === 'MGC-SRS-41-01' && H(r2, 'record-present').status === 'WARN' && /no letter code/.test(H(r2, 'record-present').detail), `${ar.control.documentId} / ${r2.docs.ar.control.documentId} · ${H(r2, 'record-present').detail}`);
  } catch (e) { check('D16 (threw)', false, e.message); }
  // D17 export names from the profile pattern (spaces kept)
  try { check('D17 export name «تصريح حديقة مجتمعية - وثيقة المتطلبات»', exportStem(ar, prof, 'ar') === 'تصريح حديقة مجتمعية - وثيقة المتطلبات' && exportStem(en, prof, 'en') === 'Community garden permit - Requirements' && exportStem(ar, {}, 'ar') === null && exportStem({ control: { title: `x: ${'long name '.repeat(20)}`, documentId: 'D' } }, { fileName: { en: '{name} - Requirements' } }, 'en')?.endsWith(' - Requirements'), String(exportStem(ar, prof, 'ar'))); } catch (e) { check('D17 (threw)', false, e.message); }
  // D18 the footer mark from the profile
  try { check('D18 footer «سري · شركة مثال» / «Confidential · EXAMPLE CO» from the profile', ar.labels?.confidential === 'سري · شركة مثال' && en.labels?.confidential === 'Confidential · EXAMPLE CO'); } catch (e) { check('D18 (threw)', false, e.message); }
  // D19 NFC + hamza fold at load
  try {
    const desc = ofGen(ar, 'description')[0]?.blocks[0].paragraphs[0] || '';
    check('D19 «رئيس» composed at load (no U+0654 left in record text)', !JSON.stringify(r.inputs.record).includes('ٔ') && desc.includes('رئيس'), desc);
  } catch (e) { check('D19 (threw)', false, e.message); }
  // D20 the profile's integration rules, when the record is silent
  try {
    const P = r.model.integrations;
    check('D20 integrationRules: a label rule and a per-option rule (with a case) fill 2.12/2.15, sourced crawl+rule', P.partners.some((x) => x.name.ar === 'سلطة المياه النموذجية') && P.internal.length === 2 && P.internal[1].name.ar === 'سجل حديقة زهور' && P.internal[1].sent?.ar === 'رقم القطعة' && !P.internal[0].sent && r.model.sources['integrations.partners']?.kind === 'crawl+rule', JSON.stringify(P.internal));
  } catch (e) { check('D20 (threw)', false, e.message); }
  // R5 §2.6 formats/size from the profile's upload limits; no «غير محدد» noise without them
  try {
    const row = tbl(ofGen(ar, 'documents')[0]).rows[0];
    const r2 = await buildDocuments({ ...G, profile: { ...prof, attachments: undefined } });
    const row2 = tbl(ofGen(r2.docs.ar, 'documents')[0]).rows[0];
    check('R5 §2.6 «pdf, png» / «5 ميجابايت» from the profile; «—» (not «غير محدد») without it', row[2] === 'pdf, png' && row[3] === '5 ميجابايت' && row2[2] === '—' && row2[3] === '—', JSON.stringify([row, row2]));
  } catch (e) { check('R5 (threw)', false, e.message); }
  // R6 §2.8 as one sentence: the place (profile word) and the channels
  try {
    const p8 = ofGen(ar, 'channels')[0]?.blocks[0].paragraphs[0];
    check('R6 §2.8 «مركزية، تقدم إلكترونياً عبر بوابة الخدمات ومن خلال مركز خدمة الجمهور.»', p8 === 'مركزية، تقدم إلكترونياً عبر بوابة الخدمات ومن خلال مركز خدمة الجمهور.', p8);
  } catch (e) { check('R6 (threw)', false, e.message); }
  // R14 the dictionary columns in the organisation's own words
  try { check('R14 dictionary columns from the profile (same count as the pack)', story(ar, 'submit')?.dictionary?.columns?.[2] === 'الإدخال', JSON.stringify(story(ar, 'submit')?.dictionary?.columns)); } catch (e) { check('R14 (threw)', false, e.message); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = []; let bad = 0;
  await run((name, ok, detail = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) bad += 1; });
  console.log(out.join('\n'));
  console.log(`\n${bad ? 'FAILED' : 'ALL PASS'}: ${out.length - bad}/${out.length}`);
  process.exit(bad ? 1 : 0);
}
