// Harvest → document JSON, the parts that run in the browser too (the editor's New document wizard):
// a raw crawl harvest → one edition, and the merge of a crawl with a process model.
import { modelToDocument, docCode } from './model.mjs';

/* ── raw harvest → document JSON (one edition) ─────────────────────────── */
// what a crawl may have picked up that is not a form field, and the required flags the site's own messages give
const LANG_NAMES = /^(english|arabic|العربية|عربي|عربى|الإنجليزية|الانجليزية|انجليزي|إنجليزي|en|ar|fr|français|french)$/i;
const notAField = (f) => /captcha|recaptcha|turnstile/i.test(`${f.key} ${f.label}`) || ((f.options || []).length >= 2 && f.options.every((o) => LANG_NAMES.test(String(o).trim())));
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The labels a site's validation messages name as missing («Label: required»). A label that only matches as
 * the tail of a longer named label («form» inside «Dosage form:») is not counted. */
export function requiredByMessage(labels, messages) {
  const said = (messages || []).join(' \n ').toLowerCase();
  const hit = (label) => label && label.length > 1 && new RegExp(`(^|[\\s,،;|])${escRe(label.toLowerCase())}\\s*([:：]|is required|مطلوب|إجباري)`, 'i').test(said);
  const named = [...new Set(labels.filter(hit))];
  return new Set(named.filter((l) => !named.some((m) => m !== l && m.toLowerCase().endsWith(l.toLowerCase()))));
}
/** A harvested step as the document should read it: no captcha or language switcher, required from the messages. */
export function cleanStep(s) {
  const fields = (s.fields || []).filter((f) => !notAField(f));
  const req = requiredByMessage(fields.map((f) => f.label), s.validations);
  return { ...s, fields: fields.map((f) => (req.has(f.label) ? { ...f, required: true } : f)) };
}

/** Consecutive readings of the same form (same fields) are one step: the richer field wins (more options, required). */
export function dedupeSteps(steps) {
  const sig = (x) => x.fields.map((f) => `${f.key}:${f.type}`).join('|');
  const out = [];
  for (const st of steps) {
    const prev = out.at(-1);
    if (prev && sig(prev) === sig(st)) {
      prev.fields = prev.fields.map((f, i) => { const g = st.fields[i]; return { ...g, ...f, options: (f.options?.length || 0) >= (g.options?.length || 0) ? f.options : g.options, required: f.required || g.required }; });
      prev.validations = [...new Set([...(prev.validations || []), ...(st.validations || [])])];
    } else out.push({ ...st });
  }
  return out;
}

export function harvestToDocument(raw, { locale = 'en', L, today = new Date().toISOString().slice(0, 10) }) {
  const langs = Object.keys(raw.languages || {});
  const H0 = raw.languages[locale] || raw.languages[langs[0]] || { steps: [], statuses: [] };
  const H = { ...H0, steps: dedupeSteps((H0.steps || []).map(cleanStep)) };
  const name = H.card?.title || raw.name || L.untitled;
  const svc = String(raw.name || H.card?.title || 'service').toLowerCase().normalize('NFKD').replace(/[^\w؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'service';
  const yn = (b) => (b ? L.yes : L.no);
  const fieldsOf = (s) => s.fields.filter((f) => f.type !== 'file' && !pairedSelects.has(f.key));
  // the card: its label/value facts, then each list (recipients, fees, documents, channels) as one row
  const cardRows = [...(H.card?.facts || [])];
  for (const li of H.card?.lists || []) if (li.title && li.items?.length && !cardRows.some(([k]) => k === li.title)) cardRows.push([li.title, li.items.join(L.listSep)]);
  // an attachment is the file input with the «attachment name» select beside it: one row (names, required, types).
  // The card's own statement on required documents wins over the select's star; a disagreement is a question.
  const ATT_NAME = /(اسم|نوع)\s*المرفق|attachment\s*(name|type)|document\s*(name|type)/i;
  const OPTIONAL = /غير\s*(إجباري|اجباري|إلزامي|الزامي|مطلوب)|اختياري|not\s*required|optional/i;
  const REQUIRED = /(إجباري|اجباري|إلزامي|الزامي)(?!\S)|\bmandatory\b|\brequired\b/i;
  const docsList = (H.card?.lists || []).find((li) => /المستندات|المرفقات|documents|attachments/i.test(li.title || ''));
  const cardSays = (names) => {
    const said = [...(docsList?.items || []), ...names].join(' | ');
    return OPTIONAL.test(said) ? false : REQUIRED.test(said) && !OPTIONAL.test(said) ? true : null;
  };
  const files = [];
  const pairGaps = [];
  for (const s of H.steps) s.fields.forEach((f, i) => {
    if (f.type !== 'file') return;
    const near = [s.fields[i - 1], s.fields[i + 1]].find((g) => g && g.type === 'select' && ATT_NAME.test(g.label || ''));
    const names = near?.options?.length ? near.options : [];
    const statement = cardSays(names);
    const starred = !!(f.required || near?.required);
    const required = statement ?? starred;
    if (statement !== null && statement !== starred) pairGaps.push((L.gapAttachment || 'The card says the attachment is {c}, the form marks it {f}: which is right?').replace('{c}', statement ? L.yes : L.no).replace('{f}', starred ? L.yes : L.no));
    files.push({ label: names.join(L.listSep) || f.label || near?.label || L.none, required, accept: f.accept || '' });
  });
  const pairedSelects = new Set(H.steps.flatMap((s) => s.fields.filter((g, i) => g.type === 'select' && ATT_NAME.test(g.label || '') && [s.fields[i - 1], s.fields[i + 1]].some((x) => x?.type === 'file')).map((g) => g.key)));
  const sec = (number, title, blocks) => ({ number, title, blocks });
  const gaps = [];
  for (const q of pairGaps) gaps.push({ id: `Q${gaps.length + 1}`, question: q, owner: L.ownerAnalyst, blocks: '4' });
  if (!raw.languages[locale]) gaps.push({ id: 'Q1', question: L.gapLang.replace('{l}', locale === 'ar' ? 'العربية' : 'English'), owner: L.ownerAnalyst, blocks: '2' });
  const stories = H.steps.map((s, k) => ({
    id: `US-${String(k + 1).padStart(2, '0')}`,
    name: s.title || L.formStep.replace('{n}', k + 1),
    as: L.unassigned,
    want: L.storyWant.replace('{t}', s.title || L.formStep.replace('{n}', k + 1)),
    so: k + 1 < H.steps.length ? L.storySo.replace('{t}', H.steps[k + 1].title || L.formStep.replace('{n}', k + 2)) : L.storySoEnd,
    acceptance: [...s.fields.filter((f) => f.required).map((f) => L.accRequired.replace('{f}', f.label)), ...s.validations],
    dictionary: { columns: [L.colField, L.colType, L.colRequired, L.colOptions], rows: s.fields.map((f) => [f.label, f.type, yn(f.required), (f.options || []).join(L.listSep)]) },
  }));
  return {
    service: svc,
    composedAt: new Date().toISOString(),
    control: { documentId: docCode(raw.code || raw.name || raw.languages?.en?.card?.title || name), title: `${L.titlePrefix}: ${name}`, preparedBy: '', documentType: L.docType, classification: L.classification, owner: '', issuedOn: today, version: 'V0.1', status: L.draft, reviewCycle: '' },
    revisions: [['V0.1', today]],
    approvals: [],
    chapters: [
      { number: '1', title: L.chIntro, sections: [sec('1.1', L.secPurpose, [{ kind: 'prose', paragraphs: [L.introCrawl.replace('{name}', name), L.introSource.replace('{s}', L.src_crawl)] }])] },
      { number: '2', title: L.chCard, sections: [sec('2.1', L.secCardInfo, [...(H.card?.description?.length ? [{ kind: 'prose', paragraphs: H.card.description }] : []), { kind: 'table', columns: [L.colItem, L.colValue], rows: cardRows.length ? cardRows : [[L.none, L.none]] }])] },
      { number: '3', title: L.chInputs, sections: H.steps.length ? H.steps.map((s, k) => sec(`3.${k + 1}`, s.title || L.formStep.replace('{n}', k + 1), [{ kind: 'table', columns: [L.colLabel, L.colType, L.colRequired, L.colOptions, L.colConditional], rows: fieldsOf(s).map((f) => [f.label, f.type, yn(f.required), (f.options || []).join(L.listSep), (f.shownWhen || []).join(L.listSep)]) }])) : [sec('3.1', L.chInputs, [{ kind: 'prose', paragraphs: [L.none] }])] },
      { number: '4', title: L.chAttachments, sections: [sec('4.1', L.chAttachments, [files.length ? { kind: 'table', columns: [L.colLabel, L.colRequired, L.colAccept], rows: files.map((f) => [f.label, yn(f.required), f.accept]) } : { kind: 'prose', paragraphs: [L.noAttachments] }])] },
      { number: '5', title: L.chValidations, sections: [sec('5.1', L.chValidations, [H.steps.some((s) => s.validations.length || s.fields.some((f) => f.message)) ? { kind: 'table', columns: [L.colMessage, L.colWhere], rows: H.steps.flatMap((s, k) => [...s.fields.filter((f) => f.message).map((f) => [f.message, f.label || s.title]), ...s.validations.filter((m) => !s.fields.some((f) => f.message === m)).map((m) => [m, s.title || L.formStep.replace('{n}', k + 1)])]) } : { kind: 'prose', paragraphs: [L.noValidations] }])] },
      { number: '6', title: L.chStories, sections: [sec('6.1', L.chStories, stories.length ? [{ kind: 'stories', number: '6.1', lead: L.storyCards, items: stories }] : [{ kind: 'prose', paragraphs: [L.noTasks] }])] },
      { number: '7', title: L.chStatuses, sections: [sec('7.1', L.chStatuses, [H.statuses?.length ? { kind: 'table', columns: [L.colStatus], rows: H.statuses.map((s) => [s]) } : { kind: 'prose', paragraphs: [L.noStatuses] }])] },
    ],
    openQuestions: gaps,
  };
}

/* ── merge: a crawl (what the user meets) ∪ a process model (what happens after) ────────────────
 * Union, never select-one: every chapter of both harvests is kept once, the statuses are the union
 * with the source of each row, the stories are the form steps then the people's tasks. Where both
 * sources say something different about one fact, the crawl's wording is kept (it is what the user
 * reads) and the other is recorded as a conflict (doc.harvestConflicts), shown by the editor.
 * doc.provenance maps each chapter and each status row to 'crawl', 'model' or 'both'. */
const norm = (s) => String(s || '').toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
export function mergeToDocument(ir, raw, { locale = 'en', L, today, name, code } = {}) {
  const cd = code || docCode(raw?.code || raw?.name || ir?.key || name || ir?.name);
  const m = modelToDocument(ir, { locale, L, today, code: cd });
  const c = harvestToDocument(raw, { locale, L, today });
  const ch = (d, title) => d.chapters.find((x) => x.title === title);
  const prov = {};
  const chapters = [];
  const add = (chapter, src) => { if (!chapter) return; prov[`/chapters/${chapters.length}`] = src; chapters.push(JSON.parse(JSON.stringify(chapter))); };
  // 1 introduction: both sources named
  const intro = JSON.parse(JSON.stringify(ch(m, L.chIntro)));
  const cIntro = ch(c, L.chIntro)?.sections[0]?.blocks[0]?.paragraphs || [];
  intro.sections[0].blocks[0].paragraphs.push(...cIntro.slice(1));
  add(intro, 'both');
  for (const t of [L.chCard, L.chInputs, L.chAttachments, L.chValidations]) add(ch(c, t), 'crawl');
  for (const t of [L.chActors, L.chWorkflow, L.chSteps, L.chRules]) add(ch(m, t), 'model');
  // stories: the form steps (crawl), then the tasks (model)
  const sItems = (d) => ch(d, L.chStories)?.sections.flatMap((s) => s.blocks).filter((b) => b.kind === 'stories').flatMap((b) => b.items) || [];
  const items = [...sItems(c), ...sItems(m)].map((st, k) => ({ ...st, id: `US-${String(k + 1).padStart(2, '0')}` }));
  add({ number: '', title: L.chStories, sections: [{ number: '', title: L.chStories, blocks: items.length ? [{ kind: 'stories', number: '', lead: L.storyCards, items }] : [{ kind: 'prose', paragraphs: [L.noTasks] }] }] }, 'both');
  // statuses: the union, with the source of each row
  const rows = [];
  const seen = new Map();
  const put = (s, src) => { const k = norm(s); if (!k || k === norm(L.none)) return; if (seen.has(k)) { const r = rows[seen.get(k)]; if (r.src !== src) r.src = 'both'; } else { seen.set(k, rows.length); rows.push({ s, src }); } };
  for (const r of ch(c, L.chStatuses)?.sections[0]?.blocks.find((b) => b.kind === 'table')?.rows || []) put(r[0], 'crawl');
  for (const r of ch(m, L.chStatuses)?.sections[0]?.blocks.find((b) => b.kind === 'table')?.rows || []) put(r[0], 'model');
  const srcName = { crawl: L.provCrawl, model: L.provModel, both: L.provBoth };
  const stAt = chapters.length;
  add({ number: '', title: L.chStatuses, sections: [{ number: '', title: L.chStatuses, blocks: [rows.length ? { kind: 'table', columns: [L.colStatus, L.colSource], rows: rows.map((r) => [r.s, srcName[r.src]]) } : { kind: 'prose', paragraphs: [L.noStatuses] }] }] }, 'both');
  rows.forEach((r, i) => { prov[`/chapters/${stAt}/sections/0/blocks/0/rows/${i}`] = r.src; });
  // numbers from position
  chapters.forEach((x, i) => {
    x.number = String(i + 1);
    x.sections.forEach((s, j) => {
      s.number = `${i + 1}.${j + 1}`;
      for (const b of s.blocks) if (b.kind === 'stories') b.number = s.number;
    });
  });
  // one fact, two wordings: keep the crawl's, record the conflict
  const conflicts = [];
  const mName = m.control.title, cName = c.control.title;
  let title = cName;
  if (name) title = `${L.titlePrefix}: ${name}`;
  else if (raw && ir && norm(mName) !== norm(cName)) conflicts.push({ path: '/control/title', kept: cName, other: mName, source: 'model', manual: cName, harvested: mName });
  const gaps = [...(c.openQuestions || []), ...(m.openQuestions || [])].map((q, k) => ({ ...q, id: `Q${k + 1}` }));
  return {
    service: c.service || m.service,
    composedAt: new Date().toISOString(),
    control: { ...m.control, title, documentId: cd },
    revisions: m.revisions,
    approvals: [],
    chapters,
    openQuestions: gaps,
    process: ir,
    provenance: prov,
    ...(conflicts.length ? { harvestConflicts: conflicts } : {}),
  };
}
