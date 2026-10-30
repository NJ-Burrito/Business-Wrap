// SRS2: seven defects (S1–S7) found adjudicating six real builds against the delivered client standard, each pinned by
// one check that fails on main @ cdfc1b4 and passes after. Invented inputs only (tests/fixtures/srs/wp8/).
//
//   node tests/srs-srs2.test.mjs        (also run from tests/srs.test.mjs, so `npm test` carries it)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO } from '../engine/export.mjs';
import { buildDocuments } from '../engine/srs/cli.mjs';
import { heal } from '../engine/srs/heal/index.mjs';
import { coreText, deepMerge } from '../engine/srs/compose.mjs';

const FX = (...p) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const G = { pack: 'e-service', profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record: FX('garden.record.json'), today: '2026-10-29' };
const secs = (d) => d.chapters.flatMap((c) => c.sections);
const ofGen = (d, gen) => (d.fill || []).filter((f) => f.gen === gen).map((f) => secs(d).find((s) => s.number === f.section)).filter(Boolean);
const rowsOf = (d, gen) => ofGen(d, gen)[0]?.blocks.find((b) => b.kind === 'table')?.rows || [];
const textOf = (pack, profile = {}) => Object.fromEntries(['ar', 'en'].map((lc) => [lc, deepMerge(deepMerge(coreText()[lc], pack.text?.[lc]), profile.text?.[lc])]));
const tmp = (name, obj) => { const f = path.join(os.tmpdir(), `bw-srs2-${process.pid}-${name}`); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };

export async function run(check) {
  const prof = readJson(G.profile);
  const base = await buildDocuments(G);
  const staffActors = [...new Set(base.model.stages.filter((s) => s.kind === 'review' || s.kind === 'approval').map((s) => s.actor).filter(Boolean))];
  const [a1, a2] = staffActors;

  // S1 §2.11 one row per role: two actors given one name are one role row carrying both stages' captions
  try {
    const name = { ar: 'لجنة الحدائق', en: 'Garden committee' };
    const keyOf = (id) => base.model.actors.find((a) => a.id === id)?.raw || id;
    const roles = tmp('roles.json', { [keyOf(a1)]: name, [keyOf(a2)]: name });
    const r = await buildDocuments({ ...G, roles });
    const rows = rowsOf(r.docs.ar, 'roles');
    const same = rows.filter((x) => x[1] === name.ar);
    const caps = [...new Set(r.model.stages.filter((s) => [a1, a2].includes(s.actor)).flatMap((s) => s.actions.map((a) => a.label?.ar)).filter(Boolean))];
    const codes = rows.map((x) => x[0]);
    check('S1 §2.11 one row per role (two stages, one role → one row with the union of captions; R-nn gap-free)', same.length === 1 && caps.every((c) => same[0][3].includes(c)) && codes.every((c, i) => c === `R-${String(i + 1).padStart(2, '0')}`) && rows.length === new Set(rows.map((x) => x[1])).size, JSON.stringify({ rows, caps, keys: [keyOf(a1), keyOf(a2)] }));
  } catch (e) { check('S1 (threw)', false, e.message); }

  // S2 a stage named only in English in the Arabic edition FAILs lint-text when the profile asks for Arabic names
  try {
    const ctx = (p) => ({ docs: JSON.parse(JSON.stringify(base.docs)), model: base.model, evidence: base.evidence, pack: base.pack, profile: p, text: textOf(base.pack, p), inputs: {} });
    const on = heal(ctx({ ...prof, arabicNames: true }), { only: ['lint-text'] }).results[0];
    const off = heal(ctx(prof), { only: ['lint-text'] }).results[0];
    check('S2 lint-text FAILs on an English-only stage name in the Arabic edition (profile arabicNames), silent without the flag', on.status === 'FAIL' && /named in English/.test(on.detail) && off.status !== 'FAIL', `${on.status}: ${on.detail} | ${off.status}`);
  } catch (e) { check('S2 (threw)', false, e.message); }

  // S4 a domain lookup (taq-<thing>-select|list) lists the system's records, never the harvest account's values
  try {
    const L = { ar: readJson(FX('garden-form.ar.json')), en: readJson(FX('garden-form.en.json')) };
    const add = (lc, label, opts) => L[lc].form.push({ kind: 'field', tag: 'taq-plots-select', component: 'taq-plots-select', controlName: 'plot', panel: L[lc].form.find((x) => x.panel)?.panel, label, required: true, options: opts });
    add('ar', 'القطعة المسجلة', ['قطعة تجربة 1', 'test plot 2']); add('en', 'Registered plot', ['Trial plot 1', 'test plot 2']);
    tmp('dyn.en.json', L.en); // the importer reads the .en pair beside the .ar file
    const r = await buildDocuments({ ...G, harvestDump: tmp('dyn.ar.json', L.ar) });
    const all = JSON.stringify(r.docs.ar.chapters);
    const f = r.model.fields.find((x) => x.key === 'plot');
    check('S4 a domain lookup is printed as a list the system retrieves, its harvested values are not', !!f?.dynamic && !all.includes('قطعة تجربة 1') && all.includes('قائمة يسترجعها النظام'), JSON.stringify(f));
  } catch (e) { check('S4 (threw)', false, e.message); }

  // S5 a model identifier in the Arabic edition FAILs lint-text (profile arabicNames)
  try {
    const p = { ...prof, arabicNames: true };
    const d = JSON.parse(JSON.stringify(base.docs)); d.ar.chapters[0].sections[0].blocks[0].paragraphs[0] += ' بعد الموافقة (مهمة print في النموذج)';
    const res = heal({ docs: d, model: { ...base.model, stages: base.model.stages.map((s) => ({ ...s, name: { ar: 'مرحلة', en: 'Stage' } })) }, evidence: base.evidence, pack: base.pack, profile: p, text: textOf(base.pack, p), inputs: {} }, { only: ['lint-text'] }).results[0];
    check('S5 lint-text FAILs on a model task key in the Arabic edition', res.status === 'FAIL' && /model identifier/.test(res.detail), `${res.status}: ${res.detail}`);
  } catch (e) { check('S5 (threw)', false, e.message); }

  // S6 the serial rule says the number shows on the output only when the service has an output
  try {
    const serial = { pattern: { ar: 'رمز الخدمة-السنة-التسلسل', en: 'code-year-sequence' }, reset: { ar: 'يعاد الترقيم كل سنة', en: 'restarts every year' } };
    const p = tmp('p-serial.json', { ...prof, serial });
    const rec = readJson(G.record); const rec0 = { ...rec, facts: { ...(rec.facts || {}), outputs: [] } }; if (rec.outputs) rec0.outputs = [];
    const r1 = await buildDocuments({ ...G, profile: p });
    const r0 = await buildDocuments({ ...G, profile: p, record: tmp('rec-noout.json', rec0), model: tmp('noprint.bpmn20.xml', fs.readFileSync(G.model, 'utf8').replace(/print/gi, 'archive')) });
    const ser = (r) => rowsOf(r.docs.ar, 'rules').map((x) => x[1]).find((t) => t.includes('رقم متسلسل')) || '';
    check('S6 serial rule: «ويظهر … على المخرج» with an output, the plain rule without one', ser(r1).includes('على المخرج') && !!ser(r0) && !ser(r0).includes('المخرج') && r1.model.outputs.length > 0 && !r0.model.outputs.length, JSON.stringify({ s1: ser(r1), s0: ser(r0), o0: r0.model.outputs.length }));
  } catch (e) { check('S6 (threw)', false, e.message); }

  // S7 payment after a desk: the FR says after which stage, and the stage after payment is the model's next one
  try {
    const xml = fs.readFileSync(G.model, 'utf8').replace('sourceRef="start" targetRef="pay"', 'sourceRef="start" targetRef="screen"')
      .replace('sourceRef="g1" targetRef="head"', 'sourceRef="g1" targetRef="pay"').replace('sourceRef="gp" targetRef="screen"', 'sourceRef="gp" targetRef="head"');
    const r = await buildDocuments({ ...G, model: tmp('payafter.bpmn20.xml', xml) });
    const fr = rowsOf(r.docs.ar, 'requirements').map((x) => x[1]);
    const nm = (id) => r.model.stages.find((s) => s.id === id).name.ar;
    const fr0 = rowsOf(base.docs.ar, 'requirements').map((x) => x[1]);
    check('S7 payment after a desk: «إلى مرحلة الدفع بعد مرحلة «desk»» and the next stage after payment; payment after submit unchanged', fr.some((t) => t.includes(`مرحلة الدفع بعد مرحلة «${nm('screen')}»`)) && fr.some((t) => t.includes(`«${nm('head')}» بعد تأكيد الدفع`)) && !fr.some((t) => t.includes('عند الانتهاء من تعبئة البيانات')) && fr0.some((t) => t.includes('عند الانتهاء من تعبئة البيانات')) && fr0.some((t) => t.includes(`«${nm('screen')}» بعد تأكيد الدفع`)), JSON.stringify(fr.filter((t) => t.includes('الدفع'))));
  } catch (e) { check('S7 (threw)', false, e.message); }

  // S3 the notification requirement names the channel the profile states (system-wide SMS + email switches)
  try {
    const sys = tmp('notify.bpmn20.xml', fs.readFileSync(G.model, 'utf8').replace(/name="Score the plot"/, 'name="Notify applicant"'));
    const via = { ar: 'رسالة نصية (SMS) وبريداً إلكترونياً', en: 'an SMS and an email' };
    const r1 = await buildDocuments({ ...G, model: sys, profile: tmp('p-via.json', { ...prof, notify: { via } }) });
    const r0 = await buildDocuments({ ...G, model: sys });
    const fr1 = rowsOf(r1.docs.ar, 'requirements').map((x) => x[1]); const en1 = rowsOf(r1.docs.en, 'requirements').map((x) => x[1]);
    const fr0 = rowsOf(r0.docs.ar, 'requirements').map((x) => x[1]);
    check('S3 notification FR names the profile channel (AR + EN); without it the generic notice stays', fr1.some((t) => t.includes(via.ar)) && en1.some((t) => t.includes(via.en)) && fr0.some((t) => t.includes('إرسال إشعار')) && !fr1.some((t) => t.includes('إرسال إشعار')), JSON.stringify({ fr1: fr1.filter((t) => /إشعار|رسالة/.test(t)), fr0: fr0.filter((t) => /إشعار/.test(t)) }));
  } catch (e) { check('S3 (threw)', false, e.message); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = []; let bad = 0;
  await run((name, ok, detail = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) bad += 1; });
  console.log(out.join('\n'));
  console.log(`\n${bad ? 'FAILED' : 'ALL PASS'}: ${out.length - bad}/${out.length}`);
  process.exit(bad ? 1 : 0);
}
