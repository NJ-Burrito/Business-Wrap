// Template packs + evidence stage: structure, ledger, generated requirements/rules/stories, wording rules,
// profile parameterisation, domain neutrality. Invented inputs only (samples/ and the fixtures below).
//
//   node tests/srs.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, printHtml, loadTheme } from '../engine/export.mjs';
import { buildDocuments, buildToDir } from '../engine/srs/cli.mjs';
import { loadPack, listPacks, coreText, TEMPLATES } from '../engine/srs/compose.mjs';
import { validatePack, applyCorrections } from '../engine/srs/packs.mjs';
import { py } from '../engine/py.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const S = (...p) => path.join(REPO, 'samples', ...p);
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const TODAY = '2026-10-28';
const EP = { pack: 'e-service', profile: S('organisation', 'agency.profile.json'), harvest: S('event-permit', 'inputs', 'harvest.json'), model: S('event-permit', 'inputs', 'model.json'), roles: S('event-permit', 'inputs', 'names.json'), record: S('event-permit', 'inputs', 'record.json'), today: TODAY };
const SHOP = { pack: 'e-commerce', profile: S('organisation', 'eshop.profile.json'), harvest: S('e-shop', 'harvest.json'), model: S('e-shop', 'model.json'), roles: S('e-shop', 'names.json'), record: S('e-shop', 'record.json'), today: TODAY };
const CALL = { pack: 'call-centre', profile: S('organisation', 'callcentre.profile.json'), harvest: S('telemarketing', 'harvest.json'), model: S('telemarketing', 'model.json'), roles: S('telemarketing', 'names.json'), record: S('telemarketing', 'record.json'), today: TODAY };
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (!k.startsWith('$')) strings(v, out); return out; };
const sections = (d) => d.chapters.flatMap((c) => c.sections);
const sec = (d, title) => sections(d).find((s) => s.title === title);
const tableOf = (s) => s?.blocks.find((b) => b.kind === 'table');
const storyItems = (d) => sections(d).flatMap((s) => s.blocks).filter((b) => b.kind === 'stories').flatMap((b) => b.items);

try {
  /* 1. packs */
  const ids = listPacks();
  check('six shipped packs', ['approval', 'call-centre', 'e-commerce', 'e-service', 'generic', 'saas'].every((x) => ids.includes(x)), ids.join(', '));
  for (const id of ids) { const e = validatePack(loadPack(id)); check(`pack ${id} validates`, !e.length, e.join('; ')); }
  const ex = loadPack(path.join(TEMPLATES, '_example-custom'));
  check('the user-pack example validates', !validatePack(ex).length);
  const bad = JSON.parse(JSON.stringify(ex)); bad.chapters[0].sections[0].gen = 'nope'; bad.columns.roles.en.pop();
  const be = validatePack(bad);
  check('validator refuses an unknown generator and unequal ar/en columns', be.some((x) => /unknown|not one of/.test(x)) && be.some((x) => /same number of columns/.test(x)), be.join('; '));
  const cli = spawnSync(process.execPath, [path.join(REPO, 'engine', 'srs', 'cli.mjs'), 'validate', path.join(TEMPLATES, '_example-custom')], { encoding: 'utf8' });
  check('CLI validate exits 0 on the example', cli.status === 0, cli.stdout.trim());

  /* 2. the e-service structure (the reference template) */
  const ep = await buildDocuments(EP);
  const ar = ep.docs.ar, en = ep.docs.en;
  const ch = ar.chapters.map((c) => c.title);
  check('e-service: chapters 1–6 as the reference, no open-questions annex (questions beside the document)', JSON.stringify(ch) === JSON.stringify(['المقدمة', 'بطاقة الخدمة', 'متطلبات النظام الوظيفية', 'مسار الخدمة وسير العمل', 'قواعد العمل', 'قصص المستخدمين ومعايير القبول']), ch.join(' | '));
  const c2 = ar.chapters[1].sections.map((s) => s.title);
  const REF2 = ['وصف الخدمة', 'معرف الخدمة وترميزها', 'فئة متلقي الخدمة', 'الافتراضات والقيود والشروط', 'رسوم الخدمة', 'وثائق الخدمة', 'المرجعية الإدارية', 'مكان تقديم الخدمة', 'مخرجات الخدمة', 'التشريعات الناظمة', 'المستخدمون والأدوار', 'الربط الداخلي مع أنظمة الجهة', 'الربط مع خدمات النظام', 'مصادر البيانات الداخلية', 'الربط مع شركاء الخدمة', 'اللغات المدعومة'];
  check('e-service: chapter 2 = the 16 card sections 2.1–2.16 in order', JSON.stringify(c2) === JSON.stringify(REF2));
  check('e-service: 1.1/1.2, 3.1, 4.1, 5.1 present', ar.chapters[0].sections.length === 2 && ar.chapters[2].sections[0].number === '3.1' && ar.chapters[3].sections[0].blocks[0].kind === 'diagram' && ar.chapters[4].sections[0].number === '5.1');
  const c6 = ar.chapters[5].sections;
  check('e-service: chapter 6 = one card per people stage + the output story', c6.length === 7 && /^تقديم الطلب \(بوابة متلقي الخدمة\)$/.test(c6[0].title) && /^مخرج الخدمة: /.test(c6.at(-1).title), c6.map((s) => s.title).join(' | '));
  check('editions have the same structure', JSON.stringify(ar.chapters.map((c) => c.sections.map((s) => s.blocks.map((b) => b.kind + (b.rows?.length ?? b.items?.length ?? ''))))) === JSON.stringify(en.chapters.map((c) => c.sections.map((s) => s.blocks.map((b) => b.kind + (b.rows?.length ?? b.items?.length ?? ''))))));
  check('section numbers gap-free', ar.chapters.every((c, i) => c.sections.every((s, j) => s.number === `${i + 1}.${j + 1}`)));
  const leftover = [...strings(ar), ...strings(en)].filter((x) => /\{(name|entity|customer|request|requests|output|s|t|p|list|sec|d|e|a|x)\}/.test(x));
  check('no unfilled placeholder in either edition', !leftover.length, leftover.slice(0, 2).join(' / '));

  /* 3. evidence + ledger */
  const ev = ep.evidence;
  check('ledger: every row has a disposition', ev.ledger.every((r) => ['drawn', 'drawn-unobserved', 'document-only', 'not-a-stage'].includes(r.disposition)));
  const kinds = new Set(ev.ledger.map((r) => r.kind));
  check('ledger: fields, stages, actions, returns, decisions, ends, timers, fees, documents, integrations traced', ['field', 'stage', 'action', 'return', 'end', 'timer', 'fee', 'document', 'integration', 'payment', 'output', 'legislation'].every((k) => kinds.has(k)), [...kinds].join(','));
  check('ledger: event permit has no untraced element', ev.untraced.length === 0, JSON.stringify(ev.untraced));
  check('evidence: every section has a fill and sourced fills name a source', ev.fill.every((f) => f.fill) && ev.fill.filter((f) => f.fill === 'evidence').every((f) => f.source?.kind), JSON.stringify(ev.counts));
  const ir = readJson(S('event-permit', 'inputs', 'model.json'));
  ir.steps.push({ id: 'arch', name: 'Archive the file', system: true, next: 'approved' });
  const withSys = await buildDocuments({ ...EP, model: undefined });
  const { readModel } = await import('../engine/harvest/cli.mjs');
  const tmp = path.join(REPO, 'out', 'srs-test'); fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'model-sys.json'), JSON.stringify(ir));
  const sysRun = await buildDocuments({ ...EP, model: path.join(tmp, 'model-sys.json') });
  check('ledger: an untraced system step is reported and asked', sysRun.evidence.untraced.some((u) => u.id === 'arch') && sysRun.evidence.openQuestions.some((q) => /Archive the file/.test(q.en)) && !sysRun.docs.en.openQuestions.length);
  check('no model → no figure, workflow becomes a question', withSys.evidence.fill.find((f) => f.gen === 'workflow').fill === 'question');

  /* 4. FR / BR */
  const fr = tableOf(sec(ar, 'جدول المتطلبات')).rows;
  check('FR codes gap-free FR-01…', fr.every((r, i) => r[0] === `FR-${String(i + 1).padStart(2, '0')}`), fr.length + ' rows');
  check('FR from payment, auto-assignment, partner, rework, timer', ['مرحلة الدفع', 'آلياً', 'يتكامل النظام مع «سجل الأحوال', 'بتعديل الطلب عند إرجاعه', 'خلال 10 أيام عمل'].every((k) => fr.some((r) => r[1].includes(k))));
  const br = tableOf(sec(ar, 'جدول قواعد العمل')).rows;
  // e-service: derived rule families are off (client ruling); a pack that derives them words them from the real labels
  const gen = await buildDocuments({ ...EP, pack: 'generic' });
  const gbr = gen.docs.ar.chapters.flatMap((c) => c.sections).filter((x) => gen.docs.ar.fill.find((f) => f.section === x.number)?.gen === 'rules').flatMap((x) => tableOf(x).rows);
  check('BR worded from real action labels (a deriving pack)', gbr.some((r) => r[1].includes('«إرجاع للتدقيق»')) && gbr.some((r) => r[1].includes('«رفض»')), gbr.length + ' rows');
  check('BR standard rules switch on evidence (serial, recipients, re-routing)', br.some((r) => /رقم متسلسل/.test(r[1])) && br.some((r) => /الفئات التالية: الأفراد، المنشآت/.test(r[1])) && br.some((r) => /إعادة توجيه/.test(r[1])));
  // raw gateway text: an invented model whose flows carry English keys only and whose ends are raw keys
  const raw = { process: 'raw-keys', actors: ['Officer'], steps: [{ id: 'chk', name: 'Check', actor: 'Officer', options: { 'need-edit': 'fix', 'send-to-officer': 'chk2', cancel: 'cancel' } }, { id: 'fix', name: 'edit-by-applicant', options: { 're-submit': 'chk' } }, { id: 'chk2', name: 'Second check', actor: 'Officer', options: { approve: 'approve', 'return-to-check': 'chk' } }], ends: [{ id: 'approve', name: 'approve' }, { id: 'cancel', name: 'cancel' }] };
  fs.writeFileSync(path.join(tmp, 'raw.json'), JSON.stringify(raw));
  const rk = await buildDocuments({ pack: 'e-service', profile: { kind: 'bw-profile', version: 1, id: 't', entity: { ar: 'جهة', en: 'Org' }, codes: { 'raw-keys': 'RAW' } }, model: path.join(tmp, 'raw.json'), today: TODAY });
  const arRule = [...tableOf(sec(rk.docs.ar, 'جدول قواعد العمل')).rows.map((r) => r[1]), ...tableOf(sec(rk.docs.ar, 'جدول المتطلبات')).rows.map((r) => r[1]), ...storyItems(rk.docs.ar).flatMap((s) => [...s.acceptance, ...(s.actions?.rows.flat() || []), s.want, s.so])];
  // a name quoted «…» is the evidence's own word (asked for translation below); the sentence around it must be Arabic
  const latin = arRule.filter((x) => /[A-Za-z]{2,}/.test(x.replace(/«[^»]*»/g, '').replace(/\b(PDF|QR|SMS)\b/g, '')));
  check('no mixed-language rule text in the Arabic edition (raw English keys in)', !latin.length, latin.slice(0, 2).join(' / '));
  check('no «قرار ١» / «Decision 1» anywhere', ![rk, ep].some((r) => [...strings(r.docs.ar), ...strings(r.docs.en)].some((x) => /قرار\s*[0-9٠-٩]|Decision\s*\d/.test(x))));
  check('a name the evidence gives in English only is asked for translation', rk.evidence.openQuestions.some((q) => /بلغة واحدة/.test(q.ar) && q.ar.includes('«Check»')));
  check('derived captions are listed as one open question', rk.evidence.openQuestions.some((q) => /مشتقة من مفاتيح النموذج/.test(q.ar)));
  check('raw end keys read as outcome words («ملغى», «موافق عليه»)', strings(rk.docs.ar).some((x) => x.includes('«ملغى»')) && !strings(rk.docs.ar).some((x) => /«cancel»|«approve»/.test(x)));

  /* 5. stories, actions vs tasks, payment */
  const items = storyItems(ar);
  const desk = items.find((s) => s.name === 'التدقيق');
  check('staff story: actions table = routing buttons only; tasks (مهمات) in the dictionary', desk.actions.rows.map((r) => r[0]).join('|') === 'موافقة|إرجاع لمقدم الطلب|رفض' && desk.dictionary.rows.some((r) => r[0] === 'ملاحظات على الطلب') && !desk.actions.rows.some((r) => r[0] === 'ملاحظات على الطلب'));
  check('staff story: sections shown from the desk walk', desk.acceptance.some((a) => a.includes('«بيانات الفعالية»، «المرفقات»، «سجل الإجراءات»')));
  check('staff story without a desk walk: named open question, not silence', ep.evidence.openQuestions.some((q) => q.ar.includes('«رئيس القسم»')));
  check('acceptance criteria carry no per-field lines and no auto-assignment line', !items.some((s) => s.acceptance.some((a) => /التوزيع الآلي|آلياً على/.test(a))) && !items[0].acceptance.some((a) => a.includes('اسم الفعالية')));
  check('payment is a stage, not a desk: no story card, no role row', !items.some((s) => s.name === 'دفع الرسوم') && !tableOf(sec(ar, 'المستخدمون والأدوار')).rows.some((r) => r[1] === 'دفع الرسوم'));
  check('rework stage is the customer\'s card, on the customer portal', c6.some((s) => s.title === 'تعديل الطلب (بوابة متلقي الخدمة)'));
  check('figure: people steps only (no system step drawn)', !strings(sysRun.docs.en.chapters[3]).some((x) => x.includes('Archive the file')));

  /* 6. data dictionary */
  const dict = items[0].dictionary;
  check('dictionary: 7 columns', dict.columns.length === 7 && dict.rows.every((r) => r.length === 7));
  const shop = await buildDocuments(SHOP);
  const sd = storyItems(shop.docs.ar)[0].dictionary.rows;
  const country = sd.find((r) => r[0] === 'بلد التوصيل');
  check('register prints its count only (40 countries)', country && /40 قيمة/.test(country[6]) && !country[6].includes('بلد 1'), country?.[6]);
  check('short option list prints inline', sd.find((r) => r[0] === 'فترة التوصيل')?.[6].includes('صباحية، مسائية'));
  check('types and required in the edition\'s words', sd.find((r) => r[0] === 'رقم الهاتف')?.[1] === 'رقم هاتف' && sd.find((r) => r[0] === 'رمز الخصم')?.[2] === 'اختياري');
  check('attachments are dictionary rows (type مرفق) with their formats', dict.rows.some((r) => r[1] === 'مرفق' && /pdf/.test(r[6])));

  /* 7. profile parameterisation, code lookup, revisions */
  check('entity comes from the profile', strings(ar).some((x) => x.includes('هيئة الخدمات النموذجية')) && ar.control.documentId === 'MSA-SRS-EVP-01');
  const other = await buildDocuments({ ...EP, profile: { ...readJson(EP.profile), entity: { ar: 'بلدية المثال', en: 'Example Town' }, control: { preparedBy: 'Team' } } });
  check('another profile, another entity; the first is gone', strings(other.docs.en).some((x) => x.includes('Example Town')) && !strings(other.docs.en).some((x) => x.includes('Model Services Authority')));
  let threw = '';
  try { await buildDocuments({ ...EP, profile: { ...readJson(EP.profile), codes: {} } }); } catch (e) { threw = e.message; }
  check('a missing document code stops the build', /no document code/.test(threw));
  const nc = await buildDocuments({ ...EP, profile: { ...readJson(EP.profile), codes: {} }, allowMissingCode: true });
  check('…or prints «—» with a named question when allowed', nc.docs.ar.control.documentId === '—' && nc.evidence.openQuestions.some((q) => /رمز الوثيقة/.test(q.ar)));
  check('revisions: earlier issue on record + this issue = 2 rows, last = issue date', ar.revisions.length === 2 && ar.revisions[0][0] === 'V01' && ar.revisions[1][0] === 'V02' && ar.revisions[1][1] === TODAY && ar.control.version === 'V02');
  check('revisions: no earlier issue = 1 row', shop.docs.en.revisions.length === 1);
  check('control table complete (preparer, owner, classification, review cycle, status)', ['preparedBy', 'owner', 'classification', 'reviewCycle', 'status'].every((k) => ar.control[k]));
  const rec = readJson(EP.record);
  delete rec.facts.integrations.internal;
  const asked = await buildDocuments({ ...EP, record: rec });
  check('stated empty list prints «none»; an unstated one is an open question', ep.evidence.fill.find((f) => f.title === 'الربط الداخلي مع أنظمة الجهة').fill === 'stated-none' && asked.evidence.fill.find((f) => f.title === 'الربط الداخلي مع أنظمة الجهة').fill === 'question');

  /* 8. corrections by text */
  const d2 = JSON.parse(JSON.stringify(ar));
  const rep = applyCorrections(d2, [{ id: 'C1', find: 'اسم الفعالية', replace: 'عنوان الفعالية' }, { id: 'C2', find: 'غير موجود إطلاقاً', replace: 'نص بديل لا يوجد في الوثيقة' }, { id: 'C3', find: 'المدقق', replace: 'المراجع', expect: 'نص لن يظهر' }], 'ar');
  check('corrections: applied / stale / FAIL', rep.map((r) => r.status).join(',') === 'applied,stale,FAIL', JSON.stringify(rep));

  /* 9. domain neutrality */
  const BANNED = /حكوم|وزار|بوابة|متلقي الخدمة|التوقيع الرقمي|مخرج|\bgovernment|\bministr|\bportal\b|digital signature/i;
  const neutral = [path.join(TEMPLATES, '_core', 'text.json'), ...ids.filter((x) => x !== 'e-service').map((x) => path.join(TEMPLATES, x, 'pack.json'))];
  const hits = neutral.flatMap((f) => strings(readJson(f)).filter((x) => BANNED.test(x)).map((x) => `${path.basename(path.dirname(f))}: ${x.slice(0, 40)}`));
  check('core text and non-e-service packs assume no government, portal, recipient, signature or official output', !hits.length, hits.slice(0, 3).join(' / '));
  const call = await buildDocuments(CALL);
  check('call-centre: no e-service term in the document', !strings(call.docs.ar).some((x) => BANNED.test(x)) && !strings(shop.docs.ar).some((x) => BANNED.test(x)));
  for (const id of ids) {
    try { const r = await buildDocuments({ ...SHOP, pack: id }); check(`e-shop evidence through pack ${id}`, r.evidence.fill.every((f) => f.fill) && !strings(r.docs.en).some((x) => /\{(name|entity|customer|request|output)\}/.test(x))); } catch (e) { check(`e-shop evidence through pack ${id}`, false, e.message); }
  }

  /* 10. the renderer accepts every generated edition; files written */
  const theme = loadTheme();
  for (const [n, r] of [['event-permit', ep], ['e-shop', shop], ['call', call]]) for (const lc of ['ar', 'en']) { let ok = true; try { ok = printHtml(r.docs[lc], { locale: lc, theme, embed: false }).html.length > 1000; } catch { ok = false; } check(`render ${n}.${lc}`, ok); }
  const w = await buildToDir({ ...CALL, out: path.join(tmp, 'call'), editor: false });
  check('build writes 01-harvest, 02-evidence, both documents, fill.md', ['01-harvest.json', '02-evidence.json', 'document.ar.json', 'document.en.json', 'fill.md'].every((f) => fs.existsSync(path.join(w.files.dir, f))));

  /* 11. the 0.13 gap checks and their healers (tests/srs-heal.test.mjs) */
  const { run: gaps } = await import('./srs-heal.test.mjs');
  await gaps(check);

  /* 11b. WP8: the 21 defects and the reference-diff rows of the six real builds (tests/srs-wp8.test.mjs) */
  const { run: wp8 } = await import('./srs-wp8.test.mjs');
  await wp8(check);

  /* 12. no client term in the repository (hashed denylist, tree) */
  const sec2 = spawnSync(...py([path.join(REPO, 'security', 'check.py'), '--tree-only'], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  check('security gate (tree): 0 findings', sec2.status === 0, (sec2.stdout || sec2.error?.message || '').trim().split('\n').at(-1));
} catch (e) {
  check('srs run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
