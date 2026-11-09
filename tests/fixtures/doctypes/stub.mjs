// 0.18.0 lane L3: a stand-in registry payload for the start page tests, built from the REAL payload() of engine/doctypes.mjs.
// Until the content lanes (L4-L6) land, templates/_doctypes holds only the `blank` type; the start page needs the whole gallery. This module takes the
// real composed blank pair (so every document is a true composed document: design.vars, layout, docType, coverDesign, motif) and fans it out to the 17 ids of
// decisions.md D1, with the names, descriptions, categories, palettes and cover designs of D2/D3 and the real `_art/<id>.svg` thumbnails.
// When the registry itself holds 17 or more types, startPayload() returns the real payload untouched.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, payload, palettes, categories } from '../../../engine/doctypes.mjs';

// id, code, category, [EN name, EN description], [AR name, AR description], cover design
const ROWS = [
  ['blank', 'DOC', 'start', ['Blank document', 'A clean document for work no other type fits'], ['وثيقة فارغة', 'وثيقة نظيفة لعمل لا يناسبه نوع آخر'], 'compact'],
  ['srs', 'SRS', 'requirements', ['SRS', 'Software Requirements Specification'], ['SRS', 'مواصفات متطلبات البرمجيات'], 'spine'],
  ['brd', 'BRD', 'requirements', ['BRD', 'Business Requirements Document'], ['BRD', 'وثيقة متطلبات العمل'], 'spine'],
  ['frs', 'FRS', 'requirements', ['FRS', 'Functional Requirements Specification'], ['FRS', 'مواصفات المتطلبات الوظيفية'], 'spine'],
  ['rtm', 'RTM', 'requirements', ['RTM', 'Requirements Traceability Matrix'], ['RTM', 'مصفوفة تتبّع المتطلبات'], 'compact'],
  ['process-flow', 'PRC', 'requirements', ['Process flow', 'As-is and to-be diagrams'], ['تدفق العمليات', 'مخططات الوضع الحالي والمستهدف'], 'spine'],
  ['test-plan', 'TP', 'testing', ['Test Plan', 'Scope, approach and schedule'], ['خطة الاختبار', 'النطاق والنهج والجدول'], 'spine'],
  ['test-cases', 'TC', 'testing', ['Test Cases', 'Cases, steps and expected results'], ['حالات الاختبار', 'الحالات والخطوات والنتائج المتوقعة'], 'compact'],
  ['defect-report', 'DEF', 'testing', ['Defect report', 'Defects by severity'], ['تقرير العيوب', 'العيوب حسب الخطورة'], 'compact'],
  ['user-manual', 'UM', 'delivery', ['User Manual', 'Step-by-step guide with screenshots'], ['دليل المستخدم', 'دليل خطوة بخطوة مع لقطات الشاشة'], 'spine'],
  ['uat-signoff', 'UAT', 'delivery', ['UAT sign-off', 'Acceptance record with signatures'], ['قبول UAT', 'محضر القبول مع التواقيع'], 'compact'],
  ['release-notes', 'RN', 'delivery', ['Release notes', 'What changed in this version'], ['ملاحظات الإصدار', 'ما تغيّر في هذا الإصدار'], 'spine'],
  ['tor', 'TOR', 'governance', ['ToR', 'Terms of Reference'], ['ToR', 'الشروط المرجعية'], 'spine'],
  ['change-request', 'CR', 'governance', ['Change request', 'Change with impact analysis'], ['طلب تغيير', 'تغيير مع تحليل الأثر'], 'compact'],
  ['minutes', 'MOM', 'governance', ['Minutes', 'Decisions and action items'], ['محضر اجتماع', 'القرارات وبنود العمل'], 'compact'],
  ['business-case', 'BC', 'governance', ['Business case', 'Why, what it costs and what it returns'], ['دراسة الجدوى', 'السبب والتكلفة والعائد'], 'spine'],
  ['tot', 'TOT', 'training', ['TOT guide', 'Training of Trainers'], ['دليل TOT', 'تدريب المدربين'], 'spine'],
];
const PALETTE = { start: 'navy', requirements: 'navy', testing: 'forest', delivery: 'gold', governance: 'slate', training: 'gold' };
const CHAPTERS = { en: ['Scope', 'Content', 'Approvals'], ar: ['النطاق', 'المحتوى', 'الموافقات'] };

/** The stand-in payload: 17 types, composed documents in both editions, real thumbnails. */
export function stubPayload() {
  const real = payload();
  const blank = real.types.find((t) => t.id === 'blank');
  if (!blank) throw new Error('stub: the registry has no blank type to fan out');
  const pals = palettes();
  const art = (id) => { const f = path.join(REPO, 'templates', '_doctypes', '_art', `${id}.svg`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : ''; };
  const types = ROWS.map(([id, code, category, en, ar, coverDesign], i) => {
    const docs = {};
    for (const ed of ['ar', 'en']) {
      const d = JSON.parse(blank.docs[ed]);
      const [name, desc] = ed === 'ar' ? ar : en;
      const ph = blank.placeholder[ed];
      d.control = { ...d.control, title: `${name}: ${ph}`, documentType: name, documentId: `BW-${code}-NEW-001` };
      d.service = id; d.docType = id; d.coverDesign = coverDesign; d.motif = id;
      d.design = { ...(d.design || {}), vars: { ...pals[PALETTE[category]] } };
      d.chapters = CHAPTERS[ed].map((title, n) => ({ number: n + 1, title: `${title}${ed === 'en' ? '' : ''}`, sections: [{ number: `${n + 1}.1`, title, blocks: [{ kind: 'prose', paragraphs: [desc] }] }] }));
      docs[ed] = JSON.stringify(d);
    }
    return {
      id, code, category, order: (i + 1) * 10, name: { ar: ar[0], en: en[0] }, description: { ar: ar[1], en: en[1] }, placeholder: blank.placeholder,
      coverDesign, motif: id, palette: PALETTE[category], accent: pals[PALETTE[category]].primary, art: art(id), docs,
    };
  });
  const used = new Set(types.map((t) => t.category));
  return { v: 1, categories: categories().filter((c) => used.has(c.id)), types };
}

/** The real payload when the registry is complete (17 types), else the stub. `real` tells which one a test got. */
export function startPayload() {
  const real = payload();
  return real.types.length >= 17 ? { payload: real, real: true } : { payload: stubPayload(), real: false };
}
