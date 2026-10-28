// Requirements documents from evidence, through a template pack.
//
//   node engine/srs/cli.mjs build --pack <id|dir> --profile <profile.json> [--harvest harvest.json] [--model <model file>]
//        [--roles roles.json] [--record record.json] [--corrections corrections.json] --out <dir>
//        [--today YYYY-MM-DD] [--no-editor] [--export] [--allow-missing-code]
//        [--walk walk.json] [--messages messages.txt] [--previous old.pdf|docx|txt] [--register cards.json]
//        [--record-page page-dump.json] [--freeze] [--harvest-dump form.ar.json (a portal form dump pair, see engine/harvest/dump.mjs)]
//   node engine/srs/cli.mjs packs                 list the packs
//   node engine/srs/cli.mjs validate <id|dir>     check a pack (exit 1 on any error)
//
// Writes, in --out: 01-harvest.json (the inputs, joined), 02-evidence.json (model + ledger + fill + questions),
// document.ar.json / document.en.json (03, the editor's input), fill.md, open-questions.md (always, even empty:
// questions live beside the document, never inside it), the editor, and with --export PDF + DOCX. The healers
// (engine/srs/heal) run on every build and every export; any FAIL makes the CLI exit 1 after writing the files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel, normText, pick } from './model.mjs';
import { readDump } from '../harvest/dump.mjs';
import { compose, loadPack, listPacks, coreText } from './compose.mjs';
import { evidenceOf } from './evidence.mjs';
import { heal, failed, healTable } from './heal/index.mjs';
import { deepMerge } from './compose.mjs';
import { readPrevious } from '../harvest/previous.mjs';
import { recordFromPage, mergeRecords, walkFromScreens } from '../harvest/record.mjs';
import { validatePack, applyCorrections } from './packs.mjs';
import { readModel } from '../harvest/cli.mjs';
import { userCwd } from '../export.mjs';

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const readRaw = (f) => readJson(fs.statSync(f).isDirectory() ? path.join(f, 'harvest.json') : f);

/** The whole build in memory: inputs → model → both editions → evidence. No files written. */
const asJson = (v) => (typeof v === 'string' ? readJson(v) : v || null);
export async function buildDocuments({ pack: packId, profile = {}, harvest, harvestDump, model: modelFile, roles, record, corrections, today, allowMissingCode = false, walk, messages, previous, register, recordPage, prior, frozen }) {
  const pack = typeof packId === 'object' ? packId : loadPack(packId);
  const errs = validatePack(pack);
  if (errs.length) throw new Error(`pack ${pack.id} is not valid:\n  ${errs.join('\n  ')}`);
  const prof = typeof profile === 'string' ? readJson(profile) : profile;
  // record and harvest text normalised at load: NFC + the hamza fold (D19); a portal form dump is imported (D05)
  const raw = normText(harvestDump ? readDump(harvestDump, { name: asJson(record)?.key }) : typeof harvest === 'string' ? readRaw(harvest) : harvest || null);
  const nameMap = typeof roles === 'string' ? readJson(roles) : roles || {};
  const ir = typeof modelFile === 'string' ? await readModel(modelFile, { roles: nameMap }) : modelFile || null;
  const rec = normText(mergeRecords(asJson(record), recordPage ? recordFromPage(asJson(recordPage), { key: asJson(record)?.key || '' }) : null));
  const w0 = asJson(walk);
  const wk = Array.isArray(w0) ? walkFromScreens(w0) : w0;
  const msgs = typeof messages === 'string' && fs.existsSync(messages) ? fs.readFileSync(messages, 'utf8') : messages || null;
  const prev = typeof previous === 'string' ? readPrevious(previous) : previous || null;
  const reg = asJson(register);
  const corr = typeof corrections === 'string' ? readJson(corrections) : corrections || [];
  const m = buildModel({ ir, raw, record: rec, profile: prof, text: coreText(), names: nameMap, walk: wk, messages: msgs, previous: prev, register: reg });
  if (!m.code && !allowMissingCode) throw new Error(`no document code for «${m.name.en || m.name.ar}» (key «${m.key}»): add it to the record (facts.code) or the profile (codes), or pass --allow-missing-code to print «—» with an open question`);
  const make = (extra) => ({ ar: compose(m, pack, prof, { locale: 'ar', today, extraQuestions: extra }), en: compose(m, pack, prof, { locale: 'en', today, extraQuestions: extra }) });
  let docs = make([]);
  let ev = evidenceOf(m, docs, pack);
  if (ev.untraced.length) {
    const T = coreText();
    const list = (lc) => ev.untraced.map((u) => `«${(u.name?.[lc] || u.id)}»`).join(T[lc].listSep);
    docs = make([{ question: { ar: T.ar.q.untraced.replace('{list}', list('ar')), en: T.en.q.untraced.replace('{list}', list('en')) }, blocks: 'ledger' }]);
    ev = evidenceOf(m, docs, pack);
  }
  const correctionReport = { ar: applyCorrections(docs.ar, corr, 'ar'), en: applyCorrections(docs.en, corr, 'en') };
  const failed = [...correctionReport.ar, ...correctionReport.en].filter((r) => r.status === 'FAIL');
  if (failed.length) throw new Error(`corrections failed: ${failed.map((r) => r.id).join(', ')}`);
  ev.corrections = correctionReport;
  // the healers, on the built editions: repair from evidence, or a named question, or FAIL
  const text = Object.fromEntries(['ar', 'en'].map((lc) => [lc, deepMerge(deepMerge(coreText()[lc], pack.text?.[lc]), prof.text?.[lc])]));
  const h = heal({ docs, model: m, evidence: ev, pack, profile: prof, text, inputs: { raw, ir, record: rec }, prior: asJson(prior), frozen: asJson(frozen), corrections: corr });
  ev.heal = h.results;
  for (const x of h.questions) if (!ev.openQuestions.some((o) => o.id === x.id)) ev.openQuestions.push(x);
  ev.harvestConflicts = m.harvestConflicts;
  ev.notes = m.notes;
  return { pack, model: m, docs, evidence: ev, inputs: { harvest: raw, model: ir, record: rec, walk: wk, previous: prev ? { ...prev, text: undefined } : null } };
}

/**
 * The export's file name from the profile's pattern ({name} = the document's service name, {code}, {locale}),
 * e.g. «{name} - وثيقة المتطلبات»; spaces kept, only characters no file system takes are replaced (D17).
 */
export function exportStem(doc, profile, locale) {
  const pat = pick(profile?.fileName, locale);
  if (!pat) return null;
  const name = String(doc.control.title).split(/:\s*/).slice(1).join(': ') || doc.control.title;
  return fillName(pat, { name, code: doc.control.documentId, locale }).normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[ .]+$/, '').slice(0, 120) || null;
}
const fillName = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m));

export function fillTable(ev, { baseline } = {}) {
  const L = coreText().en.fill;
  const lines = ['| Section | Title | Fill | Source |', '|---|---|---|---|'];
  for (const f of ev.fill) lines.push(`| ${f.section} | ${f.titleEn || f.title} | ${L[f.fill] || f.fill}${f.questions?.length ? ` (+${f.questions.length} question)` : ''} | ${f.source ? `${f.source.kind}: ${f.source.ref || ''}`.replace(/\|/g, '/') : '—'} |`);
  const c = ev.counts;
  lines.push('', `Totals: ${Object.entries(c).map(([k, v]) => `${L[k] || k} ${v}`).join(' · ')} · open questions ${ev.openQuestions.length} · ledger rows ${ev.ledger.length} (untraced ${ev.untraced.length})`);
  if (baseline) lines.push('', `Baseline (audit): ${baseline}`);
  return lines.join('\n');
}

/** open-questions.md: every question of the build, beside the document (the document itself carries none). */
export function openQuestionsMd(ev, title) {
  const lines = [`# Open questions — ${title}`, '', ev.openQuestions.length ? `${ev.openQuestions.length} question(s). Answer them in the record or the profile and rebuild; this file is rewritten on every build.` : 'None: every section is filled from the evidence or stated as none. This file is rewritten on every build.', ''];
  if (ev.openQuestions.length) lines.push('| ID | Section | السؤال | Question |', '|---|---|---|---|', ...ev.openQuestions.map((q) => `| ${q.id} | ${q.section || '—'} | ${String(q.ar || '').replace(/\|/g, '/')} | ${String(q.en || '').replace(/\|/g, '/')} |`));
  return lines.join('\n') + '\n';
}

export async function buildToDir(opts) {
  const out = path.resolve(opts.out);
  const prev = (f) => (fs.existsSync(path.join(out, f)) ? readJson(path.join(out, f)) : null);
  const priorDocs = prev('document.ar.json') && { ar: prev('document.ar.json'), en: prev('document.en.json') };
  const frozen = opts.freeze ? null : prev('figure-frozen.json');
  const r = await buildDocuments({ ...opts, prior: opts.prior ?? priorDocs, frozen: opts.frozen ?? frozen });
  fs.mkdirSync(out, { recursive: true });
  const w = (n, v) => fs.writeFileSync(path.join(out, n), typeof v === 'string' ? v : JSON.stringify(v, null, 1) + '\n');
  w('01-harvest.json', { kind: 'bw-inputs', version: 1, ...r.inputs });
  w('02-evidence.json', r.evidence);
  w('document.ar.json', r.docs.ar);
  w('document.en.json', r.docs.en);
  w('open-questions.md', openQuestionsMd(r.evidence, r.docs.en.control.title));
  if (opts.freeze) { const fig = (d) => d.chapters.flatMap((c) => c.sections).flatMap((s) => s.blocks).find((b) => b.kind === 'diagram')?.model || null; w('figure-frozen.json', { ar: fig(r.docs.ar), en: fig(r.docs.en) }); }
  const writeFill = () => w('fill.md', `# Fill — ${r.docs.en.control.title}\n\nPack: ${r.pack.id}\n\n${fillTable(r.evidence, opts)}\n\n## Healers\n\n${healTable(r.evidence.heal || [])}\n`);
  writeFill();
  const files = { dir: out, documents: [path.join(out, 'document.ar.json'), path.join(out, 'document.en.json')] };
  if (opts.editor !== false) {
    const { buildEditor } = await import('../build-editor.mjs');
    files.editor = buildEditor({ inputs: files.documents, out: path.join(out, `${r.docs.en.service}.editor.html`), set: r.docs.en.service, watermarkDir: null }).out;
  }
  if (opts.export) {
    const { exportPdf, exportDocx, loadTheme, fileStem } = await import('../export.mjs');
    const theme = loadTheme(opts.theme);
    files.exports = [];
    const prof = typeof opts.profile === 'string' ? readJson(opts.profile) : opts.profile || {};
    const pdfs = [];
    for (const lc of ['ar', 'en']) {
      const stem = exportStem(r.docs[lc], prof, lc) || `${fileStem(r.docs[lc].service)}.${lc}`;
      const pdf = await exportPdf(r.docs[lc], { locale: lc, theme, pdfPath: path.join(out, 'exports', `${stem}.pdf`) });
      const docx = exportDocx(r.docs[lc], { locale: lc, theme, docxPath: path.join(out, 'exports', `${stem}.docx`) });
      files.exports.push(pdf.pdf, docx.docx);
      pdfs.push({ pdf: pdf.pdf, locale: lc });
    }
    // the export healers: page fill, fonts embedded, corrections as printed (poppler)
    const { healPdf } = await import('./heal/pdf.mjs');
    r.evidence.heal.push(...healPdf(pdfs, { corrections: typeof opts.corrections === 'string' ? readJson(opts.corrections) : opts.corrections || [], profile: prof }));
    w('02-evidence.json', r.evidence);
    writeFill();
  }
  return { ...r, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (k) => { const i = rest.indexOf(`--${k}`); return i < 0 ? undefined : rest[i + 1]; };
  const p = (k) => flag(k) && path.resolve(userCwd(), flag(k));
  try {
    if (cmd === 'packs') { for (const id of listPacks()) { const pk = loadPack(id); console.log(`${id.padEnd(12)} ${pk.name.en} / ${pk.name.ar}`); } process.exit(0); }
    if (cmd === 'validate') { const pk = loadPack(rest[0] && fs.existsSync(rest[0]) ? path.resolve(rest[0]) : rest[0]); const e = validatePack(pk); console.log(e.length ? `FAIL ${pk.id}\n  ${e.join('\n  ')}` : `OK   ${pk.id}`); process.exit(e.length ? 1 : 0); }
    if (cmd !== 'build' || !flag('pack') || !flag('out')) { console.error('usage: node engine/srs/cli.mjs build --pack <id> --profile <p.json> [--harvest h.json] [--model m] [--roles r.json] [--record rec.json] [--corrections c.json] --out <dir> [--export] [--no-editor] [--allow-missing-code] [--today d]\n       node engine/srs/cli.mjs packs | validate <id|dir>'); process.exit(2); }
    const r = await buildToDir({ pack: fs.existsSync(flag('pack')) ? path.resolve(flag('pack')) : flag('pack'), profile: p('profile') || {}, harvest: p('harvest'), harvestDump: p('harvest-dump'), model: p('model'), roles: p('roles'), record: p('record'), corrections: p('corrections'), out: p('out'), today: flag('today'), editor: !rest.includes('--no-editor'), export: rest.includes('--export'), allowMissingCode: rest.includes('--allow-missing-code'), baseline: flag('baseline'), theme: p('theme'), walk: p('walk'), messages: p('messages'), previous: p('previous'), register: p('register'), recordPage: p('record-page'), freeze: rest.includes('--freeze') });
    console.log(`evidence   ${path.join(r.files.dir, '02-evidence.json')}`);
    console.log(`documents  ${r.files.documents.join('  ')}`);
    if (r.files.editor) console.log(`editor     ${r.files.editor}`);
    for (const f of r.files.exports || []) console.log(`export     ${f}`);
    console.log(`fill       ${Object.entries(r.evidence.counts).map(([k, v]) => `${k} ${v}`).join(' · ')} · questions ${r.evidence.openQuestions.length} · untraced ${r.evidence.untraced.length}`);
    const hs = r.evidence.heal || [];
    console.log(`heal       ${['PASS', 'REPAIRED', 'WARN', 'FLAG', 'FAIL', 'SKIP'].map((k) => `${k} ${hs.filter((x) => x.status === k).length}`).join(' · ')}`);
    for (const x of failed(hs)) console.log(`FAIL       ${x.id} (${x.gap}): ${x.detail}`);
    if (failed(hs).length) process.exit(1);
  } catch (e) { console.error(`srs build failed: ${e.message}`); process.exit(1); }
}
