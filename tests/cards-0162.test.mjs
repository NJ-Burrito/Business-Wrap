// · cards lane: S (a printed user story looks like the reference's pages: sand rounded card, «المعرف» row set apart, pale blue header with
// navy words, full grid with vertical rules, gold side-rule bands; DOCX shading and borders) and O (no «وصف المخرج» section; its wording lives in the
// output story's acceptance criteria: blank placeholders and packs from the same evidence).
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exportDocx, loadTheme, printHtml, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';
import * as CLI from '../engine/srs/cli.mjs';
import { suite, launchChrome } from './_harness.mjs';

const OUT = path.join(REPO, 'out', 'cards-0162');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const S = suite("cards-0162");
const { check } = S;
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const theme = loadTheme();
const LOCS = ['ar', 'en'];
const doc = (l) => readJson(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`));
const blank = (l) => readJson(path.join(REPO, 'samples', 'blank', `document.${l}.json`));

// ══ S · print HTML, computed in real Chrome ═══════════════════════════════════════════════════════════
const browser = await launchChrome();
try {
  for (const l of LOCS) {
    const { html } = printHtml(doc(l), { locale: l, theme, embed: false });
    const file = path.join(OUT, `print.${l}.html`);
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const m = await page.evaluate(() => {
      const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
      const px = (v) => parseFloat(v) || 0;
      const card = document.querySelector('.story.part-first') || document.querySelector('.story');
      const dth = document.querySelector('.story table.dict th');
      const dtd = document.querySelector('.story table.dict tbody td:not(:first-child)');
      const idr = document.querySelector('table.story-info tr.idrow td');
      const lab = document.querySelector('.story .dict-label');
      return {
        ready: !!card && !!dth && !!dtd && !!idr && !!lab,
        radius: px(cs(card, 'borderTopLeftRadius')) + px(cs(card, 'borderTopRightRadius')),
        cardBg: cs(card, 'backgroundColor'), hdrBg: cs(dth, 'backgroundColor'), hdrInk: cs(dth, 'color'), bodyInk: cs(document.body, 'color'),
        vrule: px(cs(dtd, 'borderLeftWidth')) + px(cs(dtd, 'borderRightWidth')),
        hrule: px(cs(dtd, 'borderBottomWidth')),
        thVrule: px(cs(dth, 'borderLeftWidth')) + px(cs(dth, 'borderRightWidth')),
        idGap: px(cs(idr, 'borderBottomWidth')), idGapColor: cs(idr, 'borderBottomColor'),
        labelRule: px(cs(lab, 'borderLeftWidth')) + px(cs(lab, 'borderRightWidth')),
        infoLabelBg: cs(document.querySelector('table.story-info td:first-child'), 'backgroundColor'),
        infoValueBg: cs(document.querySelector('table.story-info td:last-child'), 'backgroundColor'),
      };
    });
    check(`${l} PRINT ready state seen: a card, a dictionary header, a body cell, the ID row and a band label exist`, m.ready, JSON.stringify(m));
    check(`${l} PRINT the card is a rounded sand card (radius ${m.radius}px)`, m.radius > 4 && m.cardBg !== 'rgba(0, 0, 0, 0)');
    check(`${l} PRINT table header row is tinted (not the card's colour, not transparent): ${m.hdrBg}`, m.hdrBg !== 'rgba(0, 0, 0, 0)' && m.hdrBg !== m.cardBg);
    check(`${l} PRINT header words are the theme's primary colour, not the body ink: ${m.hdrInk}`, m.hdrInk !== m.bodyInk);
    check(`${l} PRINT full grid: vertical rules (${m.vrule}px), row rules (${m.hrule}px), also in the header (${m.thVrule}px)`, m.vrule >= 1 && m.hrule >= 1 && m.thVrule >= 1);
    check(`${l} PRINT «المعرف» row stands apart: ${m.idGap}px strip in the card colour`, m.idGap >= 8 && m.idGapColor === m.cardBg, `${m.idGapColor} vs ${m.cardBg}`);
    check(`${l} PRINT band label has the gold side rule (${m.labelRule}px)`, m.labelRule >= 2);
    check(`${l} PRINT ID table: tinted label column, white value cells (${m.infoLabelBg} / ${m.infoValueBg})`, m.infoLabelBg !== m.infoValueBg && m.infoLabelBg !== m.cardBg);
    await page.close();
  }
} finally { await browser.close(); }

// ══ S · DOCX: shading and borders ═════════════════════════════════════════════════════════════════════
const PYCODE = [
  'import zipfile,sys,re,json',
  'x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode()',
  'tbls=x.split("<w:tbl>")[1:]',
  'def info(t):',
  '    first=re.search(r"<w:tr[ >].*?</w:tr>",t,re.S).group(0)',
  '    fill=re.findall(r\'<w:shd [^>]*w:fill="([0-9A-Fa-f]{6})"\',first)',
  '    text=re.sub(r"<[^>]+>","",first.replace("</w:p>"," "))',
  '    b=re.search(r"<w:tcBorders>(.*?)</w:tcBorders>",first,re.S)',
  '    sides=sorted(set(re.findall(r"<w:(left|right|top|bottom) ",b.group(1)))) if b else []',
  '    return {"fill":fill[0] if fill else None,"text":text,"sides":sides}',
  'print(json.dumps([info(t) for t in tbls]))',
  'print("GAP",len(re.findall(r\'<w:bottom [^>]*w:sz="24"\',x)))',
].join('\n');
for (const l of LOCS) {
  const d = doc(l);
  const story = d.chapters.flatMap((c) => c.sections).flatMap((s) => s.blocks).find((b) => b.kind === 'stories' && b.items[0].actions && b.items[0].dictionary).items[0];
  const docx = path.join(OUT, `out.${l}.docx`);
  exportDocx(d, { locale: l, theme, docxPath: docx, embedFonts: false });
  const r = spawnSync(...py(['-c', PYCODE, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const lines = String(r.stdout).trim().split(/\r?\n/);
  let tabs = []; try { tabs = JSON.parse(lines[0]); } catch { /* reported below */ }
  const act = tabs.find((t) => t.text.includes(story.actions.columns[0]) && t.text.includes(story.actions.columns[1]));
  const dic = tabs.find((t) => t.text.includes(story.dictionary.columns[0]) && t.text.includes(story.dictionary.columns[2]));
  check(`${l} DOCX read back: tables found (${tabs.length}), actions and dictionary among them`, r.status === 0 && !!act && !!dic, String(r.stderr).slice(0, 200));
  check(`${l} DOCX actions header is shaded like the dictionary header (${act?.fill} / ${dic?.fill})`, !!act?.fill && act.fill === dic?.fill);
  check(`${l} DOCX header cells carry the grid (four sides): ${act?.sides}`, ['bottom', 'left', 'right', 'top'].every((s) => act?.sides.includes(s)));
  check(`${l} DOCX «المعرف» row is set apart: ${lines[1]}`, Number(lines[1]?.split(' ')[1]) >= 1);
}

// ══ O · «وصف المخرج» is gone, its wording is acceptance criteria of the output story ═════════════════════
const TXT = readJson(path.join(REPO, 'templates', '_core', 'text.json'));
const hasDescSection = (d, l) => d.chapters.some((c) => c.sections.some((s) => s.title === (l === 'ar' ? 'وصف المخرج' : 'Description of the output')));
for (const l of LOCS) {
  const d = blank(l);
  const out = d.chapters.at(-2).sections.at(-1).blocks.find((b) => b.kind === 'stories').items[0];
  const c = d.chapters.at(-1);
  check(`${l} BLANK no description section; numbering closes up (${c.sections.map((s) => s.number)})`, !hasDescSection(d, l) && c.sections.every((s, i) => s.number === `${c.number}.${i + 1}`) && c.sections.length === 3);
  check(`${l} BLANK the output story's acceptance holds the description as a placeholder criterion`, out.acceptance.length >= 2 && out.acceptance.some((a) => /what it proves|وماذا يثبت/.test(a)), JSON.stringify(out.acceptance));
}
const FX = (...p) => path.join(REPO, 'tests', 'fixtures', 'srs', 'wp8', ...p);
const build = (id, record) => CLI.buildDocuments({ pack: id, profile: FX('council.profile.json'), harvestDump: FX('garden-form.ar.json'), model: FX('garden-permit.bpmn20.xml'), record, today: '2026-10-29' });
const lastStory = (d) => d.chapters.flatMap((c) => c.sections).flatMap((s) => s.blocks).filter((b) => b.kind === 'stories').flatMap((b) => b.items).at(-1);
for (const id of ['e-service', 'generic']) {
  const pk = readJson(path.join(REPO, 'templates', id, 'pack.json'));
  check(`${id} PACK lists no outputDesc section`, !pk.chapters.some((c) => c.sections.some((s) => s.gen === 'outputDesc')));
  const r = await build(id, FX('garden.record.json'));
  for (const l of LOCS) {
    const d = r.docs[l];
    const issued = lastStory(d).acceptance.join(' ');
    const frag = TXT[l].od.desc.split('{o}')[0].trim();
    const ch = d.chapters.at(-1);
    check(`${id} ${l} BUILT no description section in the Outputs chapter, numbering closed up`, !hasDescSection(d, l) && ch.sections.every((s, i) => s.number === `${ch.number}.${i + 1}`));
    check(`${id} ${l} BUILT the output story's acceptance carries the description («${frag}…»)`, issued.includes(frag), issued.slice(0, 200));
  }
}
{
  // a record that states a description: that text, verbatim, is the criterion
  const two = readJson(FX('garden.record.json'));
  two.facts.outputs = [{ name: { ar: 'تصريح', en: 'Permit' }, description: { ar: 'وصف مذكور حرفيا', en: 'A stated description' }, when: { ar: 'عند الاعتماد', en: 'On approval' }, to: { ar: 'مقدم الطلب', en: 'The applicant' }, differs: { ar: 'لا', en: 'No' } }];
  const f2 = path.join(OUT, 'stated.record.json');
  fs.writeFileSync(f2, JSON.stringify(two));
  const r = await build('e-service', f2);
  for (const l of LOCS) {
    const st = lastStory(r.docs[l]);
    check(`${l} BUILT a stated description is an acceptance criterion of the output story, verbatim`, st.acceptance.includes(l === 'ar' ? 'وصف مذكور حرفيا' : 'A stated description'), JSON.stringify(st.acceptance).slice(0, 200));
  }
}
S.finish();
