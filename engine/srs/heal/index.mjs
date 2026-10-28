// Healers: one check per known gap, run on the BUILT document (both editions) after compose.
//
//   heal(ctx) → { results: [{ id, gap, status, detail, questions? }], questions: [...] }
//
// A healer detects its gap and then either repairs it from evidence it already holds (REPAIRED, and only
// after the same check passes again on the repaired document) or emits a named open question (FLAG), or
// fails (FAIL). It never invents a value, and a gate never passes itself: a repair that does not clear the
// check is a FAIL. Statuses: PASS · REPAIRED · WARN · FLAG · FAIL · SKIP (the evidence the check needs is absent).
//
// ctx = { docs: {ar, en}, model, evidence, pack, profile, inputs: {raw, ir, record}, prior?: {ar, en},
//         frozen?: diagram model, register?, corrections?, previous? }
import fs from 'node:fs';
import { pick, fold } from '../model.mjs';
import { DIAGRAM } from '../../diagram.mjs';
import { maskRecord } from '../../harvest/output.mjs';

const LOCALES = ['ar', 'en'];
const sections = (d) => d.chapters.flatMap((c) => c.sections);
const fillOf = (d, gen) => (d.fill || []).filter((f) => f.gen === gen);
const secByNum = (d, n) => sections(d).find((s) => s.number === n);
const secOfGen = (d, gen) => fillOf(d, gen).map((f) => secByNum(d, f.section)).filter(Boolean);
const tableIn = (s) => s?.blocks?.find((b) => b.kind === 'table');
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!k.startsWith('$') && k !== 'fill' && k !== 'openQuestions') strings(v, out); return out; };
const storySecs = (d) => (d.fill || []).filter((f) => f.gen === 'stories' && f.story).map((f) => ({ f, s: secByNum(d, f.section) })).filter((x) => x.s);
const T0 = (ctx, lc) => ctx.text?.[lc] || {};
const none = (ctx, lc) => T0(ctx, lc).none || (lc === 'ar' ? 'لا يوجد' : 'None');
const q = (id, ar, en, section = '') => ({ id, ar, en, section });

/* ── A. evidence sources ─────────────────────────────────────────────── */
const titleIsPortal = {
  id: 'title-is-portal', gap: 'A1',
  run(ctx) {
    const card = ctx.inputs?.raw?.languages;
    if (!card?.ar?.card?.title && !card?.en?.card?.title) return { status: 'FLAG', detail: 'no crawl: the title cannot be checked against the card title', questions: [q('OQ-TITLE', 'لم تُقرأ بطاقة الخدمة: ما عنوان الخدمة كما يظهر للجمهور؟', 'The service card was not read: what is the service title as the public sees it?', 'control')] };
    const bad = () => LOCALES.filter((lc) => card[lc]?.card?.title && !fold(ctx.docs[lc].control.title).includes(fold(card[lc].card.title)));
    const was = bad();
    if (!was.length) return { status: 'PASS', detail: 'title carries the card title (both editions)' };
    if (ctx.inputs?.record?.facts?.name) return { status: 'WARN', detail: `the record names the service «${pick(ctx.inputs.record.facts.name, 'ar')}», the card says «${card.ar?.card?.title}»: the record wins` };
    for (const lc of was) { const d = ctx.docs[lc]; const name = pick(ctx.model.name, lc); d.control.title = name && d.control.title.includes(name) ? d.control.title.replace(name, card[lc].card.title) : `${d.control.title.split(':')[0]}: ${card[lc].card.title}`; }
    ctx.model.notes?.push({ kind: 'title-repaired', text: `title replaced by the card title in ${was.join(', ')}` });
    return bad().length ? { status: 'FAIL', detail: `title still lacks the card title in ${bad().join(', ')}` } : { status: 'REPAIRED', detail: `title replaced by the card title in ${was.join(', ')}` };
  },
};

const RECORD_GENS = { identifier: '2.2', fees: '2.5', adminRef: '2.7', channels: '2.8', outputs: '2.9' };
const recordPresent = {
  id: 'record-present', gap: 'A2',
  run(ctx) {
    const asked = Object.keys(RECORD_GENS).filter((g) => fillOf(ctx.docs.ar, g).some((f) => f.fill === 'question'));
    const out = [];
    if (asked.length && ctx.profile?.backOffice) out.push(`sections ${asked.map((g) => RECORD_GENS[g]).join(', ')} are open questions while the profile names a back office: run «node engine/srs/cli.mjs build … --record-page <request-type page dump.json>» (see engine/harvest/record.mjs)`);
    // code vs a filed serial, and the profile's code shape
    const code = ctx.model.code; const serial = ctx.inputs?.record?.facts?.filedSerial;
    if (code && serial && !String(serial).includes(code)) out.push(`code «${code}» is not part of the filed serial «${serial}»`);
    if (code && ctx.profile?.codePattern && !new RegExp(ctx.profile.codePattern).test(code)) out.push(`code «${code}» does not match the profile's code pattern ${ctx.profile.codePattern}`);
    if (out.length) return { status: 'FAIL', detail: out.join('; ') };
    // the document id's letter code (D16): looked up in the profile's docCodes; a service missing there uses its service code, said so
    if (ctx.profile?.docCodes && ctx.docs.ar.$docCode && ctx.docs.ar.$docCode !== 'table') return { status: 'WARN', detail: `no letter code for «${ctx.model.key}» in the profile's docCodes: the document id uses the service code «${code || '—'}» (${ctx.docs.ar.control.documentId})` };
    return { status: asked.length ? 'WARN' : 'PASS', detail: asked.length ? `sections ${asked.map((g) => RECORD_GENS[g]).join(', ')} open (no back office named in the profile)` : 'record sections filled; code consistent' };
  },
};

const ledgerUnion = {
  id: 'ledger-union', gap: 'A3',
  run(ctx) {
    const m = ctx.model;
    if (!m.walked) return { status: 'SKIP', detail: 'no site walk: the ledger has the model and the crawl only (one source per stage)' };
    const qs = [];
    for (const w of m.walkOnly || []) qs.push(q(`OQ-WALK-${w.key}`, `رأت جولة الموقع مرحلة «${pick(w.name, 'ar')}» وليست في نموذج الإجراء: هل تُضاف؟`, `The site walk saw the «${pick(w.name, 'en')}» stage, which the process model lacks: add it?`, '4'));
    const unwalked = m.stages.filter((s) => s.id !== 'submit' && s.kind !== 'payment' && !(s.presentIn || []).includes('walk'));
    for (const s of unwalked) qs.push(q(`OQ-WALK-${s.id}`, `مرحلة «${pick(s.name, 'ar')}» في النموذج ولم تصلها جولة الموقع: هل ما زالت قائمة؟`, `The model's «${pick(s.name, 'en')}» stage was not reached by the site walk: does it still exist?`, '4'));
    const rows = ctx.evidence?.ledger || [];
    const single = rows.filter((r) => r.kind === 'stage' && r.id !== 'submit' && !String(r.id).startsWith('walk:') && (r.presentIn || []).length < 2 && !unwalked.some((s) => s.id === r.id));
    if (single.length) return { status: 'FAIL', detail: `ledger rows not unioned across sources: ${single.map((r) => r.id).join(', ')}` };
    return qs.length ? { status: 'FLAG', detail: `${m.walkOnly.length} walk-only stage(s), ${unwalked.length} model stage(s) the walk did not reach`, questions: qs } : { status: 'PASS', detail: 'every stage seen by both the model and the walk' };
  },
};

const messagesAttributed = {
  id: 'messages-attributed', gap: 'A4',
  run(ctx) {
    const r = ctx.model.messageReport;
    if (!r) return { status: 'SKIP', detail: 'no message bundle given (--messages)' };
    const line = `${r.attributed} lines attributed / ${r.leftOut} left out`;
    return r.total && !r.attributed ? { status: 'WARN', detail: `${line}: an empty attribution is a tool suspicion (wrong bundle or control keys)` } : { status: 'PASS', detail: line };
  },
};

export function countsOf(doc) {
  const fr = tableIn(secOfGen(doc, 'requirements')[0])?.rows?.length || 0;
  const ss = storySecs(doc);
  const cust = ss.find((x) => x.f.story === 'customer');
  const fields = cust ? (cust.s.blocks.find((b) => b.kind === 'stories')?.items?.[0]?.dictionary?.rows?.length || 0) : 0;
  const assumptions = tableIn(secOfGen(doc, 'assumptions')[0])?.rows?.length || 0;
  return { requirements: fr, stories: ss.length, fields, stages: ss.filter((x) => !['customer', 'output'].includes(x.f.story)).length, assumptions };
}
const reflect = {
  id: 'reflect', gap: 'A5',
  run(ctx) {
    const old = ctx.model.previous?.counts;
    if (!old) return { status: 'SKIP', detail: 'no earlier document given (--previous)' };
    const now = countsOf(ctx.docs.ar);
    const waive = new Set([...(ctx.profile?.reflectWaive || []), ...(ctx.corrections || []).map((c) => c.reflect).filter(Boolean)]);
    const less = Object.keys(old).filter((k) => now[k] != null && now[k] < old[k] && !waive.has(k));
    const line = Object.keys(old).map((k) => `${k} ${now[k] ?? '?'}/${old[k]}`).join(' · ');
    return less.length ? { status: 'FAIL', detail: `says less than the earlier document in ${less.join(', ')} (${line})` } : { status: 'PASS', detail: line };
  },
};

const figureOf = (doc) => sections(doc).flatMap((s) => s.blocks).find((b) => b.kind === 'diagram');
const flowFidelity = {
  id: 'flow-fidelity', gap: 'A6',
  run(ctx) {
    const m = ctx.model;
    if (!m.graph) return { status: 'SKIP', detail: 'no process model' };
    const out = [];
    for (const lc of LOCALES) {
      const fig = figureOf(ctx.docs[lc]);
      if (!fig) { out.push(`${lc}: no figure`); continue; }
      const labels = (fig.model.nodes || []).map((n) => fold(n.label ?? n.name ?? ''));
      // every people's stage by its name; every end by a terminator shape (an end may print as its outcome word)
      const want = m.stages.filter((s) => s.id !== 'submit').map((s) => pick(s.name, lc)).filter(Boolean);
      const miss = want.filter((w) => !labels.some((l) => l && (l.includes(fold(w)) || fold(w).includes(l))));
      if (miss.length) out.push(`${lc}: ${miss.length} model stage(s) without a shape: ${miss.slice(0, 4).join(', ')}`);
      const terms = (fig.model.nodes || []).filter((n) => n.kind === 'ok' || n.kind === 'stop').length;
      if (terms < m.ends.length) out.push(`${lc}: ${m.ends.length} end(s), ${terms} terminator(s) drawn`);
      const autos = m.stages.filter((s) => s.autoAssign);
      const assign = fold(ctx.text?.[lc]?.units?.assign || '');
      // figures carry human/actor steps only: no assignment step is drawn; the round-robin is a rule on its stage (D14)
      const routeShapes = (fig.model.nodes || []).filter((n) => assign && fold(n.label ?? n.name ?? '') === assign).length;
      if (routeShapes) out.push(`${lc}: ${routeShapes} assignment step(s) drawn as a shape (figures carry human/actor steps only)`);
      if (autos.length) {
        const fr = tableIn(secOfGen(ctx.docs[lc], 'requirements')[0])?.rows || [];
        for (const st of autos) { const n = fold(pick(st.name, lc)); if (!fr.some((r) => fold(r[2]) === n && fold(r[1]).includes(n))) out.push(`${lc}: no chapter-3 requirement for the auto-assignment of «${pick(st.name, lc)}»`);}
        const suffix = fold(ctx.text?.[lc]?.effect?.autoSuffix || '');
        const eff = storySecs(ctx.docs[lc]).flatMap((x) => x.s.blocks.filter((b) => b.kind === 'stories').flatMap((b) => b.items.flatMap((i) => i.actions?.rows?.map((r) => r[1]) || [])));
        if (suffix && !eff.some((e) => fold(e).includes(suffix))) out.push(`${lc}: the auto-assignment is in no story's action table`);
      }
    }
    return out.length ? { status: 'FAIL', detail: out.join('; ') } : { status: 'PASS', detail: `figure carries every stage and end; ${m.stages.filter((s) => s.autoAssign).length} round-robin step(s) in figure + ch3 + ch6` };
  },
};

const docsPerBranch = {
  id: 'docs-per-branch', gap: 'A7',
  run(ctx) {
    const m = ctx.model; const out = [];
    for (const lc of LOCALES) {
      const sec6 = tableIn(secOfGen(ctx.docs[lc], 'documents')[0])?.rows?.length || 0;
      const cust = storySecs(ctx.docs[lc]).find((x) => x.f.story === 'customer');
      const fileType = ctx.text?.[lc]?.fieldTypes?.file;
      const inStory = cust ? (cust.s.blocks.find((b) => b.kind === 'stories')?.items?.[0]?.dictionary?.rows || []).filter((r) => r[1] === fileType).length : sec6;
      if (m.documents.length && sec6 !== inStory) out.push(`${lc}: §2.6 lists ${sec6} document(s), the applicant's story ${inStory}`);
    }
    if (out.length) return { status: 'FAIL', detail: out.join('; ') };
    if (m.hasBranches && m.documents.length && !m.branchRead) return { status: 'FLAG', detail: 'the form has branches and documents, but the attachment list was not read per branch', questions: [q('OQ-DOC-BRANCH', 'في النموذج خيارات تغيّر الحقول، ولم تُقرأ قائمة المرفقات لكل خيار: ما المرفقات المطلوبة في كل حالة؟', 'The form has branching choices and its attachment list was not read per branch: which documents does each choice require?', '2.6')] };
    return { status: 'PASS', detail: m.branchRead ? 'attachments read per branch' : 'no branching documents' };
  },
};

const outputImage = {
  id: 'output-image', gap: 'A8',
  run(ctx) {
    const out = []; const qs = [];
    for (const lc of LOCALES) {
      const ss = storySecs(ctx.docs[lc]);
      const oi = ss.findIndex((x) => x.f.story === 'output');
      const shots = sections(ctx.docs[lc]).flatMap((s) => s.blocks).filter((b) => b.kind === 'shots');
      if (oi >= 0 && oi !== ss.length - 1) out.push(`${lc}: the output story is not the last story`);
      if (oi < 0 && shots.length && ctx.model.outputs.some((o) => o.preview)) out.push(`${lc}: an output image without an output story`);
      for (const b of shots) for (const img of b.images || []) if (typeof img === 'string' && !img.startsWith('data:') && !fs.existsSync(img)) out.push(`${lc}: output image file missing: ${img}`);
      if (oi >= 0 && !ss[oi].s.blocks.some((b) => b.kind === 'shots') && lc === 'ar') qs.push(q('OQ-OUTPUT-PREVIEW', 'لا توجد صورة للمخرج: يُلتقط المخرج ويُحجب ما فيه من بيانات قبل إدراجه.', 'No picture of the output: capture it and mask its data before it is printed.', '6'));
    }
    const unmasked = ctx.model.outputs.filter((o) => o.preview && o.masked !== true);
    if (unmasked.length) out.push(`${unmasked.length} output preview(s) not marked masked: never print an unmasked image`);
    // `masked: true` is a claim: the capture's mask record must sit beside the image, with boxes and no leak
    const unproven = ctx.model.outputs.filter((o) => o.preview && o.masked === true && !String(o.preview).startsWith('data:')).filter((o) => { const m = maskRecord(o.preview); return !m || !m.boxes?.length || m.leaks !== 0; });
    if (unproven.length) out.push(`${unproven.length} output preview(s) marked masked with no mask record (<name>.mask.json from captureOutput)`);
    if (out.length) return { status: 'FAIL', detail: out.join('; ') };
    return qs.length ? { status: 'FLAG', detail: 'output story without a picture', questions: qs } : { status: 'PASS', detail: 'output story last; image iff story' };
  },
};

/* ── B. client rulings ───────────────────────────────────────────────── */
const noOqChapter = {
  id: 'no-oq-chapter', gap: 'B1',
  run(ctx) {
    if (ctx.profile?.questionsInDocument === true) return { status: 'PASS', detail: 'the profile asks for the questions inside the document' };
    const qcols = (ctx.pack.columns?.questions?.ar || []).join('|');
    const chapter = (lc) => fillOf(ctx.docs[lc], 'questions').length || sections(ctx.docs[lc]).some((s) => s.blocks.some((b) => b.kind === 'table' && qcols && (b.columns || []).join('|') === qcols));
    // the renderer prints doc.openQuestions as a chapter of its own; a question id in the body is a question printed (D01, D21)
    const listed = (lc) => (ctx.docs[lc].openQuestions || []).length > 0;
    const ID = /(^|[\s—–-])(Q\d+|OQ-[A-Z][\w-]*)(?=$|[\s.,،؛;)])/;
    const ids = (lc) => strings(ctx.docs[lc].chapters).filter((x) => ID.test(x));
    const bad = () => LOCALES.filter((lc) => chapter(lc) || listed(lc) || ids(lc).length);
    const was = bad();
    if (!was.length) return { status: 'PASS', detail: 'no questions chapter, list or id in either edition (questions in open-questions.md)' };
    if (LOCALES.some(chapter)) return { status: 'FAIL', detail: `an open-questions chapter is printed in ${LOCALES.filter(chapter).join(', ')}` };
    const what = was.map((lc) => `${lc}: ${listed(lc) ? `${ctx.docs[lc].openQuestions.length} listed` : ''}${ids(lc).length ? ` id «${ids(lc)[0].match(ID)[2]}» in the body` : ''}`.trim());
    for (const lc of was) {
      const d = ctx.docs[lc];
      if (listed(lc) && !d.$questions) Object.defineProperty(d, '$questions', { value: d.openQuestions, enumerable: false });
      d.openQuestions = [];
      const walk = (o) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && ID.test(v)) o[k] = v.replace(/\s*[—–-]\s*(Q\d+|OQ-[A-Z][\w-]*)\b/g, '').replace(/(^|\s)(Q\d+|OQ-[A-Z][\w-]*)\b/g, '$1').trim(); else if (v && typeof v === 'object' && !k.startsWith('$')) walk(v); } };
      walk(d.chapters);
    }
    return bad().length ? { status: 'FAIL', detail: `questions still printed: ${bad().join(', ')}` } : { status: 'REPAIRED', detail: `questions taken out of the document (${what.join('; ')}); they stay in open-questions.md` };
  },
};

const stated = (m) => m.outputs.filter((o) => o && !o.derived);
const storyIffOutput = {
  id: 'story-iff-output', gap: 'B2',
  run(ctx) {
    if (ctx.pack.outputStory === 'never') return { status: 'SKIP', detail: 'the pack prints no output story' };
    const want = stated(ctx.model).length > 0;
    const has = () => LOCALES.map((lc) => storySecs(ctx.docs[lc]).some((x) => x.f.story === 'output'));
    const h = has();
    if (h.every((x) => x === want)) return { status: 'PASS', detail: want ? 'output story where §2.9 names an output' : 'no output named, no output story' };
    if (!want) {
      for (const lc of LOCALES) {
        const d = ctx.docs[lc]; const x = storySecs(d).find((y) => y.f.story === 'output'); if (!x) continue;
        for (const c of d.chapters) c.sections = c.sections.filter((s) => s !== x.s);
        d.fill = d.fill.filter((f) => f !== x.f);
      }
      return has().some(Boolean) ? { status: 'FAIL', detail: 'output story still printed' } : { status: 'REPAIRED', detail: 'dropped the output story: §2.9 names no output' };
    }
    return { status: 'FLAG', detail: '§2.9 names an output but no output story is printed', questions: [q('OQ-OUTPUT', 'يذكر البند 2.9 مخرجاً ولا توجد قصة له: ما الذي يُصدر ومتى؟', 'Section 2.9 names an output with no story for it: what is issued, and when?', '6')] };
  },
};

const scopeClause = {
  id: 'scope-clause', gap: 'B3',
  run(ctx) {
    const want = ctx.model.outputs.length > 0;
    const out = []; let repaired = 0;
    for (const lc of LOCALES) {
      const cl = ctx.pack.glossary?.[lc]?.outputClause;
      if (!cl) continue;
      const head = cl.split('{')[0].trim();
      const sec = sections(ctx.docs[lc]).find((s) => s.number === '1.2');
      const ps = sec?.blocks?.find((b) => b.kind === 'prose')?.paragraphs || [];
      const i = ps.findIndex((p) => head && p.includes(head));
      if (i >= 0 && !want) { ps[i] = ps[i].slice(0, ps[i].indexOf(head)).replace(/[\s،,]+$/, '') + (lc === 'ar' ? '.' : '.'); repaired += 1; }
      else if (i < 0 && want) out.push(`${lc}: §1.2 lacks the output clause while §2.9 has a row`);
    }
    if (out.length) return { status: 'FAIL', detail: out.join('; ') };
    return repaired ? { status: 'REPAIRED', detail: 'dropped §1.2\'s output clause: §2.9 names no output' } : { status: 'PASS', detail: want ? 'clause present, output named' : 'no clause, no output' };
  },
};

const brShape = {
  id: 'br-shape', gap: 'B4',
  run(ctx) {
    const R = { ...(ctx.pack.rules || {}), ...(ctx.profile?.rules || {}) };
    const br = ctx.pack.codes?.br || 'BR';
    const out = [];
    const rows = (d) => tableIn(secOfGen(d, 'rules')[0])?.rows || [];
    const ar = rows(ctx.docs.ar);
    if (R.maxCount && ar.length > R.maxCount) out.push(`${ar.length} rules, more than ${R.maxCount}`);
    const struck = (R.struckFamilies || []).map((f) => `${br}-${f}`);
    const hit = ar.filter((r) => struck.some((s) => String(r[0]).startsWith(s)));
    if (hit.length) out.push(`struck family printed: ${hit.map((r) => r[0]).join(', ')}`);
    const staff = ctx.model.stages.some((s) => s.kind === 'review' || s.kind === 'approval');
    if (R.backOfficeOnly && !staff && ar.length) out.push('rules printed for a process with no staff stage (must be «none»)');
    if (ctx.prior?.ar) {
      // a renumbered table (rules.sequential) keeps its fixed codes in $codes: stability is checked on those (D15)
      const fixed = (d) => { const t = tableIn(secOfGen(d, 'rules')[0]); return (t?.rows || []).map((r, i) => [t.$codes?.[i] || r[0], fold(r[1])]); };
      const before = Object.fromEntries(fixed(ctx.prior.ar));
      const moved = fixed(ctx.docs.ar).filter(([c, t]) => before[c] && before[c] !== t).map(([c]) => [c]);
      if (moved.length) out.push(`code changed rule between builds: ${moved.map((r) => r[0]).join(', ')}`);
    }
    const codes = ar.map((r) => r[0]);
    if (new Set(codes).size !== codes.length) out.push('duplicate rule codes');
    return out.length ? { status: 'FAIL', detail: out.join('; ') } : { status: 'PASS', detail: `${ar.length} rules${R.maxCount ? ` ≤ ${R.maxCount}` : ''}, no struck family${ctx.prior ? ', codes stable against the prior build' : ''}` };
  },
};

const frShape = {
  id: 'fr-shape', gap: 'B5',
  run(ctx) {
    const out = [];
    const pre = ctx.pack.codes?.fr || 'FR';
    for (const lc of LOCALES) {
      const rows = tableIn(secOfGen(ctx.docs[lc], 'requirements')[0])?.rows || [];
      if (!rows.every((r, i) => r[0] === `${pre}-${String(i + 1).padStart(2, '0')}`)) out.push(`${lc}: codes not gap-free`);
      const ranks = ctx.model.frRanks?.[lc] || [];
      if (ranks.some((r, i) => i && r < ranks[i - 1])) out.push(`${lc}: rows not in timeline order`);
      const stageNames = new Set(ctx.model.stages.filter((s) => s.id !== 'submit').map((s) => pick(s.name, lc)));
      const actorNames = new Set(ctx.model.actors.map((a) => pick(a.name, lc)).filter(Boolean));
      const bare = rows.filter((r) => stageNames.has(r[3]) && !actorNames.has(r[3]));
      if (bare.length) out.push(`${lc}: «${bare[0][3]}» in the type column is a stage, not a person`);
    }
    const ids = new Set(ctx.model.stages.map((s) => s.id));
    const dangling = ctx.model.stages.flatMap((s) => s.actions.filter((a) => a.effect === 'back' && !ids.has(a.to)));
    if (dangling.length) out.push(`return target(s) not a model desk: ${dangling.map((a) => a.to).join(', ')}`);
    return out.length ? { status: 'FAIL', detail: out.join('; ') } : { status: 'PASS', detail: 'codes gap-free, timeline order, a person in every type cell, returns resolve' };
  },
};

const storyContract = {
  id: 'story-contract', gap: 'B6',
  run(ctx) {
    if (ctx.pack.storyContract === false) return { status: 'SKIP', detail: 'the pack opts out of the story contract' };
    const out = [];
    for (const lc of LOCALES) {
      const C4 = ctx.text?.[lc]?.story4; if (!C4) { out.push(`${lc}: no story4 wording`); continue; }
      for (const { f, s } of storySecs(ctx.docs[lc]).filter((x) => x.f.story !== 'output')) {
        const item = s.blocks.find((b) => b.kind === 'stories')?.items?.[0] || {};
        const rows = s.blocks.filter((b) => b.kind === 'table').flatMap((b) => b.rows || []);
        const has = (label) => rows.some((r) => r[0] === label && String(r[1] || '').trim());
        const miss = [[C4.retrieved, has(C4.retrieved)], [C4.display, has(C4.display)], [C4.fields, !!item.dictionary || has(C4.fields)], [C4.actions, !!item.actions || has(C4.actions)]].filter(([, ok]) => !ok).map(([l]) => l);
        if (miss.length) out.push(`${lc} ${f.section}: missing ${miss.join(', ')}`);
      }
    }
    return out.length ? { status: 'FAIL', detail: out.slice(0, 4).join('; ') } : { status: 'PASS', detail: 'every story carries the four blocks or a stated «none»' };
  },
};

const payNeedsFee = {
  id: 'pay-needs-fee', gap: 'B7',
  run(ctx) {
    if (ctx.model.fees.length) return { status: 'PASS', detail: `${ctx.model.fees.length} fee(s) on record` };
    const out = [];
    if (ctx.model.stages.some((s) => s.kind === 'payment')) out.push('a payment stage');
    for (const lc of LOCALES) {
      const u = ctx.text?.[lc]?.units?.payment;
      const rows = tableIn(secOfGen(ctx.docs[lc], 'requirements')[0])?.rows || [];
      if (u && rows.some((r) => r[2] === u)) out.push(`${lc}: a payment FR row`);
    }
    return out.length ? { status: 'FAIL', detail: `no fee on record, but ${out.join(', ')}` } : { status: 'PASS', detail: 'no fee, no payment stage' };
  },
};

const readiness = {
  id: 'readiness', gap: 'B8',
  run(ctx) {
    const hits = [];
    for (const lc of LOCALES) {
      const head = ctx.pack.columns?.partners?.[lc]?.at(-1);
      const unk = ctx.text?.[lc]?.unknown;
      for (const s of secOfGen(ctx.docs[lc], 'integrations')) { const t = tableIn(s); const ci = (t?.columns || []).indexOf(head); if (ci >= 0 && t.rows.some((r) => r[ci] === unk)) hits.push(`${lc} ${s.number}`); }
    }
    return hits.length ? { status: 'WARN', detail: `readiness «unknown» in ${hits.join(', ')}: state it in the record or set profile.integrations.readinessDefault` } : { status: 'PASS', detail: 'every readiness cell stated' };
  },
};

const revTail = {
  id: 'rev-tail', gap: 'B9',
  run(ctx) {
    const out = [];
    const max = ctx.profile?.versioning?.maxRows || ctx.pack.versioning?.maxRows;
    for (const lc of LOCALES) {
      const d = ctx.docs[lc]; const last = d.revisions.at(-1) || [];
      if (d.control.version !== last[0]) out.push(`${lc}: cover version ${d.control.version} ≠ last row ${last[0]}`);
      if (d.control.issuedOn !== last[1]) out.push(`${lc}: last row date ${last[1]} ≠ issue date ${d.control.issuedOn}`);
      if (max && d.revisions.length > max) out.push(`${lc}: ${d.revisions.length} rows > ${max}`);
    }
    return out.length ? { status: 'FAIL', detail: out.join('; ') } : { status: 'PASS', detail: `${ctx.docs.ar.revisions.length} row(s), last = issue date = cover` };
  },
};

const LABELS = /^(—|-|tbd|todo|n\/a|none|prepared by|إعداد|اعداد|المعد|لا يوجد|غير محدد)$/i;
const preparerReal = {
  id: 'preparer-real', gap: 'B10',
  run(ctx) {
    const bad = LOCALES.filter((lc) => { const p = String(ctx.docs[lc].control.preparedBy || '').trim(); return !p || LABELS.test(p) || /\{|\}/.test(p); });
    if (bad.length) return { status: 'FAIL', detail: `no real preparer in ${bad.join(', ')}: state facts.preparedBy in the record or control.preparedBy in the profile` };
    return { status: 'PASS', detail: `${ctx.docs.ar.control.preparedBy} (${ctx.model.preparedBy?.source?.kind || 'profile'})` };
  },
};

const cardRegister = {
  id: 'card-register', gap: 'B11',
  run(ctx) {
    const reg = ctx.model.register;
    if (!reg) return { status: 'SKIP', detail: 'no card register given (--register)' };
    if (!reg.entry) return { status: 'WARN', detail: `«${pick(ctx.model.name, 'ar')}» is not in the card register` };
    const want = (reg.entry.adminReference || []).map(([k, v]) => [fold(pick(k, 'ar')), fold(pick(v, 'ar'))]);
    const have = Object.fromEntries((ctx.model.adminReference || []).map(([k, v]) => [fold(pick(k, 'ar')), fold(pick(v, 'ar'))]));
    const diff = want.filter(([k, v]) => have[k] !== undefined && have[k] !== v).map(([k]) => k);
    const missing = want.filter(([k]) => have[k] === undefined).map(([k]) => k);
    if (diff.length) return { status: 'FAIL', detail: `§2.7 disagrees with the card register on: ${diff.join(', ')}` };
    return { status: missing.length ? 'WARN' : 'PASS', detail: missing.length ? `register rows not in §2.7: ${missing.join(', ')}` : '§2.7 agrees with the card register' };
  },
};

/* ── C. gates ─────────────────────────────────────────────────────────── */
const lintText = {
  id: 'lint-text', gap: 'C-verify',
  run(ctx) {
    let repaired = 0; const out = [];
    const fix = (o) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string') { const n = v.replace(/،\s*،/g, '،').replace(/(^|[\s«])أريد/g, '$1أرغب'); if (n !== v) { o[k] = n; repaired += 1; } } else if (v && typeof v === 'object' && k !== 'fill') fix(v); } };
    const d = ctx.docs.ar;
    fix(d.chapters); fix(d.control);
    const all = strings({ c: d.chapters, x: d.control });
    // the evidence's own names (a desk «قسم الشحن», an actor) are not the generator's vocabulary
    const own = [...ctx.model.stages.map((x) => pick(x.name, 'ar')), ...ctx.model.actors.map((x) => pick(x.name, 'ar'))].filter(Boolean).sort((a, b) => b.length - a.length);
    const story = storySecs(d).flatMap((x) => strings(x.s.blocks)).map((x) => own.reduce((t, n) => t.split(n).join(' '), x));
    const rules = [[/استمارة/, 'استمارة'], [/مرصود/, 'مرصود'], [/\?\?|؟؟/, '?? / ؟؟'], [/::/, '::'], [/"/, 'stray "']];
    for (const [re, name] of rules) { const h = all.find((x) => re.test(x)); if (h) out.push(`${name}: «${h.slice(0, 50)}»`); }
    // a quoted «…» name is the evidence's own word (a desk may be «قسم الشحن»); the sentence around it may not say «قسم»
    const qism = story.find((x) => /(^|[\s(])قسم([\s).،:]|$)/.test(x.replace(/«[^»]*»/g, '')));
    if (qism) out.push(`«قسم» in a story (say «شاشة»): «${qism.slice(0, 50)}»`);
    const unbalanced = all.find((x) => (x.match(/«/g) || []).length !== (x.match(/»/g) || []).length);
    if (unbalanced) out.push(`unbalanced «»: «${unbalanced.slice(0, 50)}»`);
    const en = strings({ c: ctx.docs.en.chapters }).find((x) => /\?\?|::/.test(x));
    if (en) out.push(`en: «${en.slice(0, 50)}»`);
    if (out.length) return { status: 'FAIL', detail: out.join('; ') };
    return repaired ? { status: 'REPAIRED', detail: `${repaired} string(s): «،،» → «،», «أريد» → «أرغب»` } : { status: 'PASS', detail: 'vocabulary and typography clean' };
  },
};

const ledgerCheck = {
  id: 'ledger-check', gap: 'C-ledger',
  run(ctx) {
    const rows = ctx.evidence?.ledger || [];
    const out = [];
    const noDisp = rows.filter((r) => !r.disposition);
    if (noDisp.length) out.push(`${noDisp.length} row(s) without a disposition`);
    const fig = figureOf(ctx.docs.ar);
    if (fig) {
      const labels = (fig.model.nodes || []).map((n) => fold(n.label ?? n.name ?? ''));
      const off = rows.filter((r) => r.kind === 'stage' && r.disposition === 'drawn' && !labels.some((l) => l && l.includes(fold(pick(r.name, 'ar')))));
      if (off.length) out.push(`marked drawn, not on the sheet: ${off.map((r) => r.id).join(', ')}`);
    }
    const roles = strings(secOfGen(ctx.docs.ar, 'roles')[0]?.blocks || []).map(fold).join(' | ');
    const fr = strings(secOfGen(ctx.docs.ar, 'requirements')[0]?.blocks || []).map(fold).join(' | ');
    const ch6 = storySecs(ctx.docs.ar).map((x) => fold(x.s.title)).join(' | ');
    for (const s of ctx.model.stages.filter((x) => x.kind === 'review' || x.kind === 'approval')) {
      const n = fold(pick(s.name, 'ar'));
      const who = fold(pick(ctx.model.actors.find((a) => a.id === s.actor)?.name, 'ar'));
      const miss = [['2.11', roles], ['3', fr], ['6', ch6]].filter(([, txt]) => !txt.includes(n) && !(who && txt.includes(who))).map(([k]) => k);
      if (miss.length) out.push(`stage «${pick(s.name, 'ar')}» missing from ${miss.join('/')}`);
    }
    return out.length ? { status: 'FAIL', detail: out.join('; ') } : { status: 'PASS', detail: `${rows.length} ledger rows decided; every staff stage in 2.11, ch3 and ch6` };
  },
};

const overlap = (a, b, pad = 0) => a.x < b.x + b.w - pad && a.x + a.w > b.x + pad && a.y < b.y + b.h - pad && a.y + a.h > b.y + pad;
const segHitsBox = (p, q2, b, inset = 3) => {
  const [x1, y1] = p, [x2, y2] = q2; const l = b.x + inset, r = b.x + b.w - inset, t = b.y + inset, bt = b.y + b.h - inset;
  if (x1 === x2) return x1 > l && x1 < r && Math.max(y1, y2) > t && Math.min(y1, y2) < bt;
  if (y1 === y2) return y1 > t && y1 < bt && Math.max(x1, x2) > l && Math.min(x1, x2) < r;
  return false;
};
export function collisions(diagramModel, opts = {}) {
  const r = DIAGRAM.resolve(diagramModel, opts);
  const soft = new Set((r.model?.nodes || []).filter((n) => ['group', 'text', 'note', 'symbol'].includes(n.kind)).map((n) => n.id));
  const shapes = r.items.filter((i) => i.t === 'shape' && i.id && !soft.has(i.id));
  const out = [];
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) if (shapes[i].id !== shapes[j].id && overlap(shapes[i], shapes[j], 1)) out.push(`shapes overlap: ${shapes[i].id} × ${shapes[j].id}`);
  for (const w of r.items.filter((i) => i.t === 'line' && i.route)) {
    for (const s of shapes.filter((x) => x.id !== w.from && x.id !== w.to)) {
      if (w.route.slice(1).some((pt, k) => segHitsBox(w.route[k], pt, s))) { out.push(`wire ${w.from}→${w.to} crosses ${s.id}`); break; }
    }
  }
  const caps = r.items.filter((i) => i.t === 'text' && i.box && !i.node && !i.legend && !i.sub);
  for (const c of caps) for (const s of shapes) if (overlap(c.box, s, 2)) { out.push(`caption «${(c.lines || []).join(' ')}» over ${s.id}`); break; }
  return out;
}
const flowCollisions = {
  id: 'flow-collisions', gap: 'C-collisions',
  run(ctx) {
    const out = [];
    for (const lc of LOCALES) { const fig = figureOf(ctx.docs[lc]); if (!fig) continue; try { out.push(...collisions(fig.model, { locale: lc }).map((x) => `${lc}: ${x}`)); } catch (e) { out.push(`${lc}: render failed: ${e.message}`); } }
    if (!figureOf(ctx.docs.ar)) return { status: 'SKIP', detail: 'no figure' };
    return out.length ? { status: 'FAIL', detail: out.slice(0, 5).join('; ') + (out.length > 5 ? ` (+${out.length - 5})` : '') } : { status: 'PASS', detail: 'no overlap, no wire through a shape, no caption over a shape' };
  },
};

const captionsVerbatim = {
  id: 'captions-verbatim', gap: 'C-captions',
  run(ctx) {
    const m = ctx.model;
    // the verbatim check binds only a desk whose bar was seen (a walk, or a record desk marked observed) (D04)
    const seenDesk = (s) => s.deskActions?.length && (s.deskObserved || (s.presentIn || []).includes('walk'));
    const walked = m.walked || m.stages.some(seenDesk);
    const derived = (m.derivedCaptions?.ar || []);
    if (!walked) return { status: derived.length ? 'WARN' : 'PASS', detail: derived.length ? `${derived.length} derived caption(s), asked as a question (no walk to read them from)` : 'every caption from the evidence' };
    const desks = m.stages.filter(seenDesk);
    const bad = desks.flatMap((s) => s.actions.filter((a) => a.key !== 'submit' && a.effect !== 'leave' && !s.deskActions.some((d) => fold(d.key) === fold(a.key) || fold(pick(d.label, 'ar')) === fold(pick(a.label, 'ar')))).map((a) => `${s.id}:${pick(a.label, 'ar')}`));
    return bad.length ? { status: 'FAIL', detail: `captions not on the walked desk's own bar: ${bad.join(', ')}` } : { status: 'PASS', detail: `${desks.length} walked desk(s), every caption verbatim` };
  },
};

const figureFreeze = {
  id: 'figure-freeze', gap: 'C-freeze',
  run(ctx) {
    if (!ctx.frozen) return { status: 'SKIP', detail: 'no frozen figure (build with --freeze once the figure is approved)' };
    const out = LOCALES.filter((lc) => ctx.frozen[lc] && JSON.stringify(figureOf(ctx.docs[lc])?.model) !== JSON.stringify(ctx.frozen[lc]));
    return out.length ? { status: 'FAIL', detail: `the figure differs from the frozen one in ${out.join(', ')} (re-approve and --freeze again)` } : { status: 'PASS', detail: 'figure byte-equal to the frozen one' };
  },
};

/* ── D. process rules ───────────────────────────────────────────────── */
const emptyRead = {
  id: 'empty-read', gap: 'D-rule12',
  run(ctx) {
    const raw = ctx.inputs?.raw; if (!raw) return { status: 'SKIP', detail: 'no crawl' };
    const out = [];
    for (const [lc, L] of Object.entries(raw.languages || {})) {
      if (L.card && !String(L.card.title || '').trim()) out.push(`${lc}: card read with no title`);
      (L.steps || []).forEach((s, i) => { if (!(s.fields || []).length) out.push(`${lc}: step ${i + 1} has 0 fields`); for (const f of s.fields || []) if ((f.type === 'select' || f.type === 'radio') && !(f.options || []).length) out.push(`${lc}: «${f.label || f.key}» has 0 options`); });
    }
    return out.length ? { status: 'FAIL', detail: `empty read (a tool suspicion, not a fact): ${out.slice(0, 4).join('; ')}` } : { status: 'PASS', detail: 'no empty read' };
  },
};

const TYPO = /\bacrion\b|\baprove\b|\brejcet\b|\bretrun\b|\bsubmitt\b/i;
const bpmnLint = {
  id: 'bpmn-lint', gap: 'D-bpmn',
  run(ctx) {
    const ir = ctx.inputs?.ir; if (!ir?.key || ir.source !== 'bpmn') return { status: 'SKIP', detail: 'no BPMN model' };
    const k = String(ir.key).toLowerCase();
    const borrowed = ir.steps.filter((s) => s.formKey && !String(s.formKey).toLowerCase().includes(k)).map((s) => `${s.id} formKey «${s.formKey}»`);
    const typos = [...ir.flows.map((f) => `${f.label || ''} ${f.condition || ''}`), ...ir.steps.map((s) => s.name || '')].filter((x) => TYPO.test(x));
    const out = [...borrowed, ...typos.map((t) => `typo «${t.trim().slice(0, 40)}»`)];
    if (!out.length) return { status: 'PASS', detail: 'form keys carry the process key; no known typo' };
    return { status: 'FLAG', detail: out.slice(0, 4).join('; '), questions: [q('OQ-BPMN', `في نموذج الإجراء ما يحتاج تأكيد مالكه: ${out.slice(0, 3).join('؛ ')}`, `The process model has items for its owner to confirm: ${out.slice(0, 3).join('; ')}`, '4')] };
  },
};

export const HEALERS = [titleIsPortal, recordPresent, ledgerUnion, messagesAttributed, reflect, flowFidelity, docsPerBranch, outputImage, noOqChapter, storyIffOutput, scopeClause, brShape, frShape, storyContract, payNeedsFee, readiness, revTail, preparerReal, cardRegister, lintText, ledgerCheck, flowCollisions, captionsVerbatim, figureFreeze, emptyRead, bpmnLint];

export function heal(ctx, { only } = {}) {
  const results = []; const questions = [];
  for (const h of HEALERS) {
    if (only && !only.includes(h.id)) continue;
    let r;
    try { r = h.run(ctx); } catch (e) { r = { status: 'FAIL', detail: `healer error: ${e.message}` }; }
    results.push({ id: h.id, gap: h.gap, status: r.status, detail: r.detail });
    for (const x of r.questions || []) questions.push(x);
  }
  return { results, questions };
}

export const failed = (results) => results.filter((r) => r.status === 'FAIL');
export function healTable(results) {
  return ['| Healer | Gap | Status | Detail |', '|---|---|---|---|', ...results.map((r) => `| ${r.id} | ${r.gap} | ${r.status} | ${String(r.detail || '').replace(/\|/g, '/').replace(/\n/g, ' ')} |`)].join('\n');
}
