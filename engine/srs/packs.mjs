// Pack validator and per-document corrections (matched by text, replayed after every rebuild).
import { pick } from './model.mjs';

export const GENS = ['prose', 'description', 'identifier', 'recipients', 'assumptions', 'fees', 'documents', 'adminRef', 'channels', 'outputs', 'legislation', 'roles', 'integrations', 'languages', 'requirements', 'workflow', 'rules', 'statuses', 'glossary', 'kpis', 'slas', 'notifications', 'dataDictionary', 'questions', 'stories'];
const COLS_OF = { recipients: 'recipients', fees: 'fees', documents: 'documents', outputs: 'outputs', legislation: 'legislation', roles: 'roles', requirements: 'requirements', rules: 'rules', statuses: 'statuses', glossary: 'glossary', kpis: 'kpis', slas: 'slas', notifications: 'notifications', dataDictionary: 'dictionary', questions: 'questions', stories: 'dictionary' };
const bothLangs = (v) => v && typeof v === 'object' && typeof v.ar === 'string' && typeof v.en === 'string' && v.ar.trim() && v.en.trim();

/** Every rule a pack must meet before it may build a document. Returns a list of errors (empty = valid). */
export function validatePack(p) {
  const e = [];
  if (!/^[a-z][a-z0-9-]*$/.test(p.id || '')) e.push('id: lower-case letters, digits and hyphens');
  if (!bothLangs(p.name)) e.push('name: {ar, en} both required');
  for (const lc of ['ar', 'en']) if (!p.glossary?.[lc]) e.push(`glossary.${lc} missing`);
  const ka = Object.keys(p.glossary?.ar || {}).sort().join(), ke = Object.keys(p.glossary?.en || {}).sort().join();
  if (ka !== ke) e.push('glossary: ar and en must define the same terms');
  for (const k of ['customer', 'request', 'requests', 'customerChannel', 'staffChannel']) if (!p.glossary?.ar?.[k]) e.push(`glossary: term «${k}» is required`);
  if (!Array.isArray(p.chapters) || !p.chapters.length) e.push('chapters: at least one');
  (p.chapters || []).forEach((c, i) => {
    if (!bothLangs(c.title)) e.push(`chapters[${i}].title: {ar, en}`);
    (c.sections || []).forEach((s, j) => {
      const at = `chapters[${i}].sections[${j}]`;
      if (!bothLangs(s.title)) e.push(`${at}.title: {ar, en}`);
      if (!GENS.includes(s.gen)) e.push(`${at}.gen: «${s.gen}» is not one of ${GENS.join(', ')}`);
      const ck = s.gen === 'integrations' ? s.columns || s.of : COLS_OF[s.gen];
      if (ck && !['adminRef', 'assumptions', 'identifier'].includes(s.gen)) {
        const c2 = p.columns?.[ck];
        if (!c2) e.push(`${at}: columns «${ck}» not defined`);
        else if (!Array.isArray(c2.ar) || !Array.isArray(c2.en) || c2.ar.length !== c2.en.length) e.push(`columns.${ck}: ar and en need the same number of columns`);
      }
      if (s.gen === 'integrations' && !['internal', 'services', 'dataSources', 'partners'].includes(s.of)) e.push(`${at}.of: internal | services | dataSources | partners`);
      if (s.gen === 'prose' && !(s.paragraphs?.ar?.length && s.paragraphs?.en?.length)) e.push(`${at}.paragraphs: {ar: [...], en: [...]}`);
      if (s.whenEmpty && !['question', 'none'].includes(s.whenEmpty)) e.push(`${at}.whenEmpty: question | none`);
    });
  });
  if ((p.chapters || []).some((c) => (c.sections || []).some((s) => s.gen === 'stories')) && !p.columns?.actions) e.push('columns.actions: required by the stories section');
  for (const r of p.rules?.standard || []) if (!bothLangs(r.text)) e.push(`rules.standard «${r.code || '?'}»: text {ar, en}`);
  return e;
}

/**
 * Corrections by text: [{ id, locale?, find, replace, expect?, stale? }]. Each is applied to every string of the
 * edition; one that finds nothing is reported stale, one whose `expect` text is then absent fails, and one
 * whose `stale` text (what must be gone) is still anywhere in the edition fails.
 */
export function applyCorrections(doc, list, locale) {
  const report = [];
  for (const c of list || []) {
    if (c.locale && c.locale !== locale) continue;
    const find = pick(c.find, locale), repl = pick(c.replace, locale);
    let hits = 0;
    const walk = (o) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && find && v.includes(find)) { o[k] = v.split(find).join(repl); hits += 1; } else if (v && typeof v === 'object') walk(v); } };
    walk(doc);
    const expect = pick(c.expect, locale) || repl;
    const present = JSON.stringify(doc).includes(JSON.stringify(expect).slice(1, -1));
    const st = pick(c.stale, locale);
    const lingers = !!st && JSON.stringify(doc).includes(JSON.stringify(st).slice(1, -1));
    report.push({ id: c.id, hits, status: lingers ? 'FAIL' : hits ? (present ? 'applied' : 'FAIL') : present ? 'already' : 'stale', ...(lingers ? { lingers: st } : {}) });
  }
  return report;
}
