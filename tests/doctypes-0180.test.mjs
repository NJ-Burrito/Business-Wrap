// 0.18.0 · document studio, lane L0 (the kit): the type registry loader, the palettes, the categories, the validator.
// It exercises the real registry (templates/_doctypes, whatever folders are present: it passes with only `blank`) and throw-away
// trees for the cases the real folders cannot hold (empty registry, no registry, source types, planted faults).
//
//   node tests/run.mjs doctypes-0180        (no browser; the CLI is run once through its real entry point)
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as DT from '../engine/doctypes.mjs';
import * as CHK from '../tools/doctypes/check.mjs';
import { FORMAT, BUILT_KEYS } from '../engine/format.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);
let failed = 0;
const results = [];
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  doctypes-0180: ${name}${detail && !ok ? '  | ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
process.on('uncaughtException', (e) => { console.log(results.join(NL)); console.error('CRASH: ' + String(e.stack || e.message).split(NL).slice(0, 4).join(' / ')); process.exit(1); });
const rdJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const j = (x) => JSON.stringify(x);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-doctypes-'));
const DIR = path.join(REPO, 'templates', '_doctypes');
let treeN = 0;

/** A throw-away repo root: the shared files, samples/blank and the palette tokens; `types` copies of folders by name. */
function tree({ shared = true, types = [] } = {}) {
  const root = path.join(TMP, `t${++treeN}`);
  fs.mkdirSync(path.join(root, 'templates'), { recursive: true });
  fs.cpSync(path.join(REPO, 'samples', 'blank'), path.join(root, 'samples', 'blank'), { recursive: true });
  fs.mkdirSync(path.join(root, 'palette'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'palette', 'tokens.json'), path.join(root, 'palette', 'tokens.json'));
  if (shared) {
    fs.mkdirSync(path.join(root, 'templates', '_doctypes'), { recursive: true });
    for (const f of ['schema.json', '_categories.json', '_palettes.json']) fs.copyFileSync(path.join(DIR, f), path.join(root, 'templates', '_doctypes', f));
  }
  for (const t of types) fs.cpSync(path.join(DIR, t), path.join(root, 'templates', '_doctypes', t), { recursive: true });
  return { root };
}
/** A copy of the real `blank` type with one planted fault: mut(type, en, ar, helpers) edits the three objects. */
function mutant(mut) {
  const o = tree({ types: ['blank'] });
  const d = path.join(o.root, 'templates', '_doctypes', 'blank');
  const t = rdJson(path.join(d, 'type.json'));
  const en = rdJson(path.join(d, 'en.json'));
  const ar = rdJson(path.join(d, 'ar.json'));
  const extra = mut(t, en, ar, o) || {};
  fs.writeFileSync(path.join(d, 'type.json'), JSON.stringify(t, null, 1));
  fs.writeFileSync(path.join(d, 'en.json'), JSON.stringify(en, null, 1));
  fs.writeFileSync(path.join(d, 'ar.json'), JSON.stringify(ar, null, 1));
  if (extra.svg !== undefined) { fs.mkdirSync(path.join(o.root, 'templates', '_doctypes', '_art'), { recursive: true }); fs.writeFileSync(path.join(o.root, 'templates', '_doctypes', '_art', 'blank.svg'), extra.svg); }
  return { o, r: CHK.validateType('blank', o) };
}
const flagged = (name, rx, mut) => { const { r } = mutant(mut); check(`validator refuses: ${name}`, r.errors.some((e) => rx.test(e)), r.errors.join(' || ') || 'no error at all'); };
const para = (doc) => doc.chapters[0].sections[0].blocks[0];
/** 0.19.0: the real blank type is an `empty` type (it prints nothing, tests/blank-empty-0190 holds those rules). The CONTENT rules of every other type (a title that ends with the
 *  placeholder, cover labels, positional numbers, the block kinds) are exercised here on the classic starter shape: one titled chapter, one section, one prose block. */
const classic = (t, en, ar) => {
  delete t.empty;
  t.layout = { hide: ['revisions', 'toc'] };
  t.placeholder = { ar: 'عنوان الوثيقة', en: 'Document title' };
  for (const [d, ed] of [[en, 'en'], [ar, 'ar']]) {
    d.control.title = ed === 'ar' ? 'وثيقة فارغة: عنوان الوثيقة' : 'Blank document: Document title';
    d.revisions = [['V0.1', 'YYYY-MM-DD', ed === 'ar' ? 'المسودة الأولى' : 'First draft', '—']];
    d.labels = ed === 'ar' ? { kicker: 'وثيقة فارغة', subtitle: 'العنوان الفرعي' } : { kicker: 'BLANK DOCUMENT', subtitle: 'Subtitle' };
    d.chapters = [{ number: '1', title: ed === 'ar' ? 'الفصل الأول' : 'Chapter 1', sections: [{ number: '1.1', title: ed === 'ar' ? 'عنوان القسم' : 'Section title', blocks: [{ kind: 'prose', paragraphs: [ed === 'ar' ? 'اكتب هنا.' : 'Write here.'] }] }] }];
    delete d.chrome;
  }
};
// forbidden shapes are assembled here so this file itself stays clean for security/check.py
const EMAIL = ['someone', '@', 'mail-host.io'].join('');
const PHONE = ['07', '79', '000000'].join('');
const WINPATH = ['C:', String.fromCharCode(92), 'Users', String.fromCharCode(92), 'someone', String.fromCharCode(92), 'file'].join('');
const GOODSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 170"><rect x="10" y="10" width="100" height="150" fill="#003c7a"/><rect x="20" y="30" width="80" height="6" fill="#bfbfbf"/></svg>';

// ───────── palettes ─────────
const PAL = DT.palettes();
const TOK = rdJson(path.join(REPO, 'palette', 'tokens.json')).color;
check('five palettes: navy forest gold slate rust, seven roles each', j(Object.keys(PAL)) === j(['navy', 'forest', 'gold', 'slate', 'rust']) && Object.values(PAL).every((p) => j(Object.keys(p)) === j(DT.ROLES) && DT.ROLES.every((r) => /^#[0-9a-f]{6}$/.test(p[r]))));
const derived = CHK.derivePalettes();
check('every stored palette value equals the one computed from palette/tokens.json (never typed)', Object.keys(PAL).every((id) => DT.ROLES.every((r) => PAL[id][r] === derived[id][r])));
const theme = rdJson(path.join(REPO, 'design', 'ours', 'theme.json')).vars;
check('navy is the brand theme (design/ours/theme.json vars), role for role', DT.ROLES.every((r) => PAL.navy[r] === theme[r]));
check('rust is the diagram rework-line token with derived tints, not a typed value', PAL.rust.primary === TOK.diagram['rework-line'].$value.hex && PAL.rust['primary-100'] !== PAL.rust.primary && PAL.rust['primary-50'] !== PAL.rust['primary-100']);
const paper = TOK.ramp.neutral['50'].$value.hex;
const worst = (f) => Math.min(...Object.values(PAL).map(f));
check(`white on primary is at least 4.5:1 in every palette (worst ${worst((p) => CHK.contrast('#ffffff', p.primary)).toFixed(2)})`, worst((p) => CHK.contrast('#ffffff', p.primary)) >= 4.5);
const paleGold = TOK.ramp.accent['200'].$value.hex; // the spine code is accent-bright where that reads (4.5:1), else accent-200 (render.mjs spineCodeColor, covers.md section 2)
const codeOn = (p) => Math.max(CHK.contrast(p['accent-bright'], p['primary-deep']), CHK.contrast(paleGold, p['primary-deep']));
check(`primary and accent on paper at least 4.5:1, the spine code (accent-bright, else accent-200) on primary-deep at least 4.5:1, white on primary-deep at least 4.5:1, accent-rule on paper at least 3:1 (worst ${worst(codeOn).toFixed(2)})`,
  worst((p) => CHK.contrast(p.primary, paper)) >= 4.5 && worst((p) => CHK.contrast(p.accent, paper)) >= 4.5 && worst(codeOn) >= 4.5 && worst((p) => CHK.contrast('#ffffff', p['primary-deep'])) >= 4.5 && worst((p) => CHK.contrast(p['accent-rule'], paper)) >= 3);
{
  const o = tree();
  const f = path.join(o.root, 'templates', '_doctypes', '_palettes.json');
  const p = rdJson(f);
  p.navy.primary = '#003c7b';
  fs.writeFileSync(f, JSON.stringify(p));
  check('validator refuses a palette value that no longer matches the brand ramps', CHK.validateShared(o).errors.some((e) => /navy\.primary/.test(e)));
  p.navy.primary = '#003c7a'; p.slate['primary-deep'] = '#e8e4de'; p.slate.primary = '#e8e4de';
  fs.writeFileSync(f, JSON.stringify(p));
  check('validator refuses a palette below the contrast floor', CHK.validateShared(o).errors.some((e) => /below 4\.5/.test(e)));
}

// ───────── categories and schema ─────────
const CATS = DT.categories();
check('six categories in order with the Arabic and English names of the brief',
  j(CATS.map((c) => [c.id, c.name.ar, c.name.en])) === j([['start', 'ابدأ', 'Start'], ['requirements', 'المتطلبات', 'Requirements'], ['testing', 'الاختبار', 'Testing'], ['delivery', 'التسليم', 'Delivery'], ['governance', 'الحوكمة', 'Governance'], ['training', 'التدريب', 'Training']]));
check('categories carry a unique integer order', new Set(CATS.map((c) => c.order)).size === 6 && CATS.every((c) => Number.isInteger(c.order)));
const schema = rdJson(path.join(DIR, 'schema.json'));
check('schema.json enums equal the category ids, the palette ids and the cover designs', j([...schema.properties.category.enum].sort()) === j(CATS.map((c) => c.id).sort()) && j([...schema.properties.palette.enum].sort()) === j(Object.keys(PAL).sort()) && j(schema.properties.coverDesign.enum) === j(DT.COVER_DESIGNS) && j(DT.COVER_DESIGNS) === j(['spine', 'compact']));
{
  const good = rdJson(path.join(DIR, 'blank', 'type.json'));
  check('schema accepts the real blank type.json', CHK.validateSchema(schema, good).length === 0);
  const refused = (name, edit) => { const t = JSON.parse(j(good)); edit(t); check(`schema refuses ${name}`, CHK.validateSchema(schema, t).length > 0); };
  refused('an id with a capital', (t) => { t.id = 'Blank'; });
  refused('a code of five letters', (t) => { t.code = 'ABCDE'; });
  refused('a lowercase code', (t) => { t.code = 'doc'; });
  refused('an unknown category', (t) => { t.category = 'qa'; });
  refused('an unknown palette', (t) => { t.palette = 'purple'; });
  refused('the old band cover design', (t) => { t.coverDesign = 'band'; });
  refused('a missing Arabic name', (t) => { delete t.name.ar; });
  refused('an unknown key', (t) => { t.colour = 'red'; });
  refused('a source outside samples/', (t) => { t.source = '../x'; });
}

// ───────── the loader on the real registry ─────────
const TYPES = DT.listTypes();
check('listTypes() includes the sample type blank and orders by category then order', TYPES.some((t) => t.id === 'blank') && j(TYPES.map((t) => t.id)) === j([...TYPES].sort((a, b) => CATS.findIndex((c) => c.id === a.category) - CATS.findIndex((c) => c.id === b.category) || a.order - b.order || (a.id < b.id ? -1 : 1)).map((t) => t.id)));
const blank = DT.loadType('blank');
check('loadType(blank): type.json fields, both editions, art empty when there is no svg', blank.id === 'blank' && blank.code === 'DOC' && blank.category === 'start' && blank.coverDesign === 'compact' && blank.motif === 'blank' && !!blank.content.ar.control && !!blank.content.en.control && typeof blank.art === 'string');
for (const bad of ['../x', 'Blank', '', 'a/b']) { let thrown = false; try { DT.loadType(bad); } catch { thrown = true; } check(`loadType refuses the id «${bad}»`, thrown); }
{ let thrown = false; try { DT.loadType('no-such-type'); } catch { thrown = true; } check('loadType refuses an unknown type', thrown); }
for (const ed of DT.EDITIONS) {
  const before = j(blank.content[ed]);
  const d = DT.compose('blank', ed);
  const pal = PAL[blank.palette];
  check(`compose(blank, ${ed}): service, docType, coverDesign, motif, design.vars (palette), layout`, d.service === 'blank' && d.docType === 'blank' && d.coverDesign === 'compact' && d.motif === 'blank' && j(d.design.vars) === j(pal) && j(d.layout) === j(blank.layout));
  check(`compose(blank, ${ed}): the content is carried unchanged and the loaded copy is not mutated`, j(DT.loadType('blank').content[ed]) === before && d.control.documentId === 'BW-DOC-NEW-001' && j(d.chapters) === j(blank.content[ed].chapters) && !('approvals' in d));
}
{ let thrown = false; try { DT.compose('blank', 'fr'); } catch { thrown = true; } check('compose refuses an edition other than ar or en', thrown); }
check('the file format is untouched: FORMAT 1 and BUILT_KEYS as at 0.17.13, no doctype key', FORMAT === 1 && j([...BUILT_KEYS]) === j(['icons', 'brand', 'setId', 'uiLang', 'services', 'theme', 'i18n', 'fontCss', 'fontFamilies', 'uiCss', 'csp', 'version', 'stateSchema', 'format', 'about', 'whatsNew']));

// ───────── payload (contract C2) ─────────
{
  const p = DT.payload();
  check('payload(): v 1, categories {id,name,order}, types with the C2 keys', p.v === 1 && Array.isArray(p.categories) && p.types.length === TYPES.length && p.types.every((t) => j(Object.keys(t)) === j(['id', 'code', 'category', 'order', 'name', 'description', 'placeholder', 'coverDesign', 'motif', 'palette', 'accent', 'art', 'docs'])) && p.categories.every((c) => j(Object.keys(c)) === j(['id', 'name', 'order'])));
  const pb = p.types.find((t) => t.id === 'blank');
  check('payload(): accent is the palette primary, docs are minified composed JSON strings, art is a string', pb.accent === PAL.navy.primary && DT.EDITIONS.every((ed) => typeof pb.docs[ed] === 'string' && !pb.docs[ed].includes(NL) && j(JSON.parse(pb.docs[ed])) === j(DT.compose('blank', ed))) && typeof pb.art === 'string');
  check('payload(): only categories that hold a type are listed', j(p.categories.map((c) => c.id)) === j(CATS.map((c) => c.id).filter((id) => p.types.some((t) => t.category === id))));
  const s = DT.payloadJson();
  check('payloadJson(): parses back to payload() and has no raw "<" (safe inside a script element)', !s.includes('<') && j(JSON.parse(s)) === j(p));
}

// ───────── the registry may be empty or absent ─────────
{
  const o = tree();
  check('an empty registry (shared files only): listTypes [], payload without types, validator clean', j(DT.listTypes(o)) === '[]' && j(DT.payload(o).types) === '[]' && j(DT.payload(o).categories) === '[]' && CHK.run([], o, () => {}) === 0);
  const none = tree({ shared: false });
  check('no templates/_doctypes at all: empty lists, an empty payload, no throw', j(DT.listTypes(none)) === '[]' && j(DT.categories(none)) === '[]' && j(DT.palettes(none)) === '{}' && j(DT.payload(none)) === j({ v: 1, categories: [], types: [] }));
  const lines = [];
  check('asking for an id that does not exist is an error', CHK.run(['no-such-type'], o, (m) => lines.push(m)) === 1 && lines.some((m) => /no folder/.test(m)));
}

// ───────── source resolution (srs = samples/blank) and composition rules ─────────
{
  const o = tree({ types: ['blank'] });
  const d = path.join(o.root, 'templates', '_doctypes', 'srs');
  fs.mkdirSync(d);
  fs.writeFileSync(path.join(d, 'type.json'), j({ id: 'srs', code: 'SRS', category: 'requirements', order: 10, name: { ar: 'وثيقة متطلبات', en: 'SRS' }, description: { ar: 'وصف', en: 'one line' }, placeholder: { ar: 'خدمة جديدة', en: 'New service' }, palette: 'navy', coverDesign: 'spine', motif: 'srs', source: 'samples/blank' }));
  const en = DT.compose('srs', 'en', o);
  const raw = rdJson(path.join(REPO, 'samples', 'blank', 'document.en.json'));
  check('source samples/blank: the content is read from the sample, service becomes srs, there is no copy in the folder', en.service === 'srs' && en.docType === 'srs' && en.coverDesign === 'spine' && j(en.chapters) === j(raw.chapters) && !fs.existsSync(path.join(d, 'en.json')) && DT.compose('srs', 'ar', o).control.documentId === 'BW-SRS-NEW-001');
  const r = CHK.validateType('srs', o);
  check('source types validate (pair shape, kinds, size, patterns) without their own en.json', r.errors.length === 0, r.errors.join(' || '));
  check('samples/blank is untouched by composition (byte for byte on disk)', crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, 'samples', 'blank', 'document.en.json'))).digest('hex') === crypto.createHash('sha256').update(fs.readFileSync(path.join(o.root, 'samples', 'blank', 'document.en.json'))).digest('hex'));
  fs.writeFileSync(path.join(d, 'type.json'), j({ id: 'srs', code: 'SRS', category: 'requirements', order: 10, name: { ar: 'أ', en: 'SRS' }, description: { ar: 'أ', en: 'x' }, placeholder: { ar: 'خدمة جديدة', en: 'New service' }, palette: 'navy', coverDesign: 'spine', motif: 'srs', source: '../outside' }));
  let thrown = false; try { DT.compose('srs', 'en', o); } catch { thrown = true; }
  check('a source outside samples/ is refused', thrown);
}
{
  const { o } = mutant((t, en) => { en.design = { vars: { primary: '#123456' } }; en.layout = { page: { size: 'A4', orientation: 'landscape' } }; });
  const d = DT.compose('blank', 'en', o);
  check('compose: the content design.vars win over the palette; layout merges type and content (hide kept, page added)', d.design.vars.primary === '#123456' && d.design.vars['primary-deep'] === PAL.navy['primary-deep'] && j(d.layout.hide) === j(blank.layout.hide) && d.layout.page.orientation === 'landscape');
}

// ───────── the validator refuses planted faults (real blank, one change each) ─────────
check('the real blank type passes the validator with no error and no warning', (() => { const r = CHK.validateType('blank'); return r.errors.length === 0 && r.warnings.length === 0; })());
flagged('a block kind outside the handled eight', /kind «chart»/, (t, en, ar) => { classic(t, en, ar); para(en).kind = 'chart'; para(ar).kind = 'chart'; });
flagged('an e-mail address', /bw-email/, (t, en) => { para(en).paragraphs = [`Write to ${EMAIL} please`]; });
flagged('a phone number', /bw-jo-phone/, (t, en) => { para(en).paragraphs = [`Call ${PHONE}`]; });
flagged('a local user path', /bw-local-path/, (t, en) => { para(en).paragraphs = [WINPATH]; });
flagged('a staging host', /bw-staging-host/, (t, en) => { para(en).paragraphs = ['https://' + 'staging' + '.corp-example' + '.io/x']; });
flagged('a design key written in the content', /«design» is composed/, (t, en) => { en.design = { vars: {} }; });
flagged('a service key written in the content', /«service» is composed/, (t, en) => { en.service = 'x'; });
flagged('a coverDesign key written in the content', /«coverDesign» is composed/, (t, en, ar) => { ar.coverDesign = 'spine'; });
flagged('a non-empty approvals list', /approvals/, (t, en) => { en.approvals = [{ name: 'x' }]; });
flagged('an unknown top-level key', /unknown top-level key «extra»/, (t, en) => { en.extra = 1; });
flagged('a missing control key', /control\.status/, (t, en) => { delete en.control.status; });
flagged('a wrong document id', /documentId must be BW-DOC-NEW-001/, (t, en) => { en.control.documentId = 'BW-XYZ-NEW-001'; });
flagged('a title that does not end with the placeholder', /control\.title must end with/, (t, en, ar) => { classic(t, en, ar); en.control.title = 'Blank document: Something else'; });
flagged('missing cover labels', /labels\.kicker/, (t, en, ar) => { classic(t, en, ar); delete en.labels; });
flagged('a chapter number that is not positional', /numbers are positional/, (t, en, ar) => { classic(t, en, ar); en.chapters[0].number = '7'; });
flagged('a motif that differs from the id', /motif must equal/, (t) => { t.motif = 'other'; });
flagged('an unknown palette', /type\.json palette/, (t) => { t.palette = 'purple'; });
flagged('an unknown category', /category/, (t) => { t.category = 'qa'; });
flagged('a type.json id that differs from its folder', /differs from the folder/, (t) => { t.id = 'other'; });
flagged('an Arabic edition with one table row more than the English', /pair shape differs/, (t, en, ar) => { for (const d of [en, ar]) d.chapters[0].sections[0].blocks.push({ kind: 'table', columns: ['a', 'b'], rows: [['1', '2']] }); ar.chapters[0].sections[0].blocks[1].rows.push(['3', '4']); });
flagged('an Arabic edition with one section less', /pair shape differs/, (t, en) => { en.chapters[0].sections.push({ number: '1.2', title: 'Two', blocks: [{ kind: 'prose', paragraphs: ['x'] }] }); });
flagged('differing diagram node ids', /pair shape differs/, (t, en, ar) => { for (const [d, id] of [[en, 'a'], [ar, 'b']]) d.chapters[0].sections[0].blocks.push({ kind: 'diagram', model: { nodes: [{ id }], edges: [] } }); });
flagged('an edition over 14 KB minified', /over the 14\.0 KB budget/, (t, en, ar) => { for (const d of [en, ar]) para(d).paragraphs = Array.from({ length: 220 }, (_, i) => `Paragraph ${i} of filler words to push the starter past its size budget, repeated enough times.`); });
flagged('an embedded data: image', /data: images/, (t, en, ar) => { for (const d of [en, ar]) d.chapters[0].sections[0].blocks.push({ kind: 'shots', images: ['data:image/png;base64,AAAA'] }); });
flagged('a type.json that is not valid', /type\.json/, (t) => { delete t.code; });
{
  const hash = (s) => crypto.createHash('sha256').update(s).digest('hex');
  const o = tree({ types: ['blank'] });
  fs.mkdirSync(path.join(o.root, 'security'), { recursive: true });
  fs.writeFileSync(path.join(o.root, 'security', 'denylist.sha256'), `${hash('zzqx plorf')} 2${NL}`);
  const f = path.join(o.root, 'templates', '_doctypes', 'blank', 'en.json');
  const en = rdJson(f);
  para(en).paragraphs = ['Contact Zzqx   Plorf today'];
  fs.writeFileSync(f, JSON.stringify(en, null, 1));
  check('validator refuses a term of the hashed denylist (case and spacing folded) and names no text', (() => { const r = CHK.validateType('blank', o); return r.errors.some((e) => /bw-denylist/.test(e)) && !r.errors.some((e) => /zzqx/i.test(e)); })());
}
check('termHash agrees with security/check.py (two sample values)', CHK.termHash('Hello World') === 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9' && CHK.termHash('دليل المستخدم') === 'fb5ff2180263ce8d7bfd24c5f36a919041e82093c13587657da5d60aff0e8dd4');

// ───────── svg art ─────────
{
  const { r } = mutant(() => ({ svg: GOODSVG }));
  check('a clean 120x170 svg passes and is counted', r.errors.length === 0 && r.art === Buffer.byteLength(GOODSVG), r.errors.join(' || '));
  const o = tree({ types: ['blank'] });
  fs.mkdirSync(path.join(o.root, 'templates', '_doctypes', '_art'));
  fs.writeFileSync(path.join(o.root, 'templates', '_doctypes', '_art', 'blank.svg'), GOODSVG);
  check('payload() carries the svg as art, and payloadJson escapes its angle brackets', DT.payload(o).types[0].art === GOODSVG && !DT.payloadJson(o).includes('<svg') && JSON.parse(DT.payloadJson(o)).types[0].art === GOODSVG);
}
const svgBad = (name, rx, svg) => check(`svg refused: ${name}`, CHK.checkSvg(svg).some((e) => rx.test(e)), CHK.checkSvg(svg).join(' || ') || 'accepted');
svgBad('a <text> element', /<text>/, GOODSVG.replace('</svg>', '<text x="1" y="1">hi</text></svg>'));
svgBad('an <image> element', /<image>/, GOODSVG.replace('</svg>', '<image href="#x"/></svg>'));
svgBad('an external href', /external href/, GOODSVG.replace('</svg>', '<use href="https://cdn.example.com/a.svg#b"/></svg>'));
svgBad('an external url()', /external url/, GOODSVG.replace('fill="#003c7a"', 'fill="url(https://cdn.example.com/g)"'));
svgBad('a script', /script/, GOODSVG.replace('</svg>', '<script>alert(1)</script></svg>'));
svgBad('an event handler', /event handlers/, GOODSVG.replace('<rect ', '<rect onclick="x()" '));
svgBad('a font attribute', /font/, GOODSVG.replace('<rect ', '<rect font-family="serif" '));
svgBad('a different viewBox', /viewBox/, GOODSVG.replace('0 0 120 170', '0 0 100 100'));
svgBad('more than 6 KB', /larger than 6\.0 KB/, GOODSVG.replace('</svg>', `<!-- ${'x'.repeat(6200)} --></svg>`));
check('svg accepted: an internal #fragment href and url(#id)', CHK.checkSvg(GOODSVG.replace('</svg>', '<defs><linearGradient id="g"/></defs><use href="#g"/><rect width="1" height="1" fill="url(#g)"/></svg>')).length === 0);

// ───────── the validator CLI, through its real entry point ─────────
{
  const run = (...a) => spawnSync(process.execPath, [path.join(REPO, 'tools', 'doctypes', 'check.mjs'), ...a], { cwd: REPO, encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const all = run();
  check('node tools/doctypes/check.mjs exits 0 on the real registry and ends with "0 finding(s)"', all.status === 0 && /0 finding\(s\)/.test(all.stdout), all.stdout + all.stderr);
  const one = run('blank');
  check('node tools/doctypes/check.mjs blank checks that one id', one.status === 0 && /ok\s+blank/.test(one.stdout), one.stdout + one.stderr);
  const bad = run('no-such-type');
  check('node tools/doctypes/check.mjs no-such-type exits 1', bad.status === 1 && /FAIL\s+no-such-type/.test(bad.stdout), bad.stdout);
}
{
  // two folders with the same code: both are named, exit 1
  const o = tree({ types: ['blank'] });
  fs.cpSync(path.join(DIR, 'blank'), path.join(o.root, 'templates', '_doctypes', 'twin'), { recursive: true });
  const f = path.join(o.root, 'templates', '_doctypes', 'twin', 'type.json');
  const t = rdJson(f); t.id = 'twin'; t.motif = 'twin'; fs.writeFileSync(f, JSON.stringify(t));
  const lines = [];
  check('two types with one code: the validator names both and exits 1', CHK.run([], o, (m) => lines.push(m)) === 1 && lines.some((m) => /code DOC is also used by/.test(m)));
}

// ───────── the real registry: every folder present validates, the total stays inside the budget ─────────
{
  const bad = TYPES.map((t) => CHK.validateType(t.id)).filter((r) => r.errors.length);
  check(`every type folder present (${TYPES.map((t) => t.id).join(', ')}) validates`, bad.length === 0, bad.map((r) => r.id + ': ' + r.errors.join(' | ')).join(NL));
  const total = DT.payloadJson().length;
  check(`the whole payload stays under the 400 KB budget (${(total / 1024).toFixed(1)} KB)`, Buffer.byteLength(DT.payloadJson()) <= 400 * 1024);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? `${NL}${failed} FAILED` : `${NL}all ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
