// 0.16.3 · shape lane: a document built by agents in the field shape (a house-label subhead + a plain table, no `stories` actions/dictionary)
// prints like the story card: sand rounded card, pale blue header, navy words, full grid, label bands; DOCX shading and grid; stored data unchanged.
// The document is a placeholder built here from the sample (no client words).
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { exportDocx, loadTheme, launchOptions, printHtml, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'shape-0162');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  shape-0162: ${name}${detail && !ok ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const LAB = { ar: ['جدول الإجراءات', 'قاموس البيانات والمصطلحات'], en: ['Actions table', 'Data dictionary and terms'] };
const rows = (n, w) => Array.from({ length: n }, (_, i) => Array.from({ length: w }, (_, c) => `x${i}-${c}`));
const fieldDoc = (l) => {
  const d = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`), 'utf8'));
  const sec = d.chapters.flatMap((c) => c.sections).find((s) => s.blocks.some((b) => b.kind === 'stories'));
  sec.blocks = [
    { kind: 'prose', paragraphs: ['Placeholder lead'] },
    { kind: 'subhead', text: LAB[l][0] },
    { kind: 'table', columns: ['A1', 'A2'], rows: rows(3, 2) },
    { kind: 'subhead', text: LAB[l][1] },
    { kind: 'table', columns: ['D1', 'D2', 'D3', 'D4'], rows: rows(4, 4) },
    { kind: 'subhead', text: 'Unrelated heading' },
    { kind: 'table', columns: ['U1', 'U2'], rows: rows(2, 2) },
  ];
  return d;
};
const browser = await chromium.launch(launchOptions());
try {
  for (const l of ['ar', 'en']) {
    const d = fieldDoc(l);
    const before = JSON.stringify(d);
    const { html } = printHtml(d, { locale: l, theme, embed: false });
    check(`${l} stored JSON unchanged by printing`, JSON.stringify(d) === before);
    const file = path.join(OUT, `print.${l}.html`);
    fs.writeFileSync(file, html);
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const m = await page.evaluate(() => {
      const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
      const px = (v) => parseFloat(v) || 0;
      const parts = [...document.querySelectorAll('.story')].filter((e) => e.classList.contains('lbl') || e.classList.contains('plain')).slice(0, 4); // the sample's own story cards come after the field shape; only the shape's parts are measured
      const dth = document.querySelector('.story table.dict.shape th');
      const dtd = document.querySelector('.story table.dict.shape tbody td');
      const tables = [...document.querySelectorAll('table.dict.shape')];
      const labs = parts.filter((e) => e.classList.contains('lbl')).map((e) => e.querySelector('.dict-label'));
      const other = [...document.querySelectorAll('table')].find((t) => t.textContent.includes('U1'));
      return {
        ready: parts.length === 4 && !!dth && !!dtd && tables.length === 2 && labs.length === 2,
        parts: parts.map((p) => p.className.replace(/\s+/g, ' ')),
        radius: px(cs(parts[0], 'borderTopLeftRadius')) + px(cs(parts[0], 'borderTopRightRadius')),
        cardBg: cs(parts[0], 'backgroundColor'), hdrBg: cs(dth, 'backgroundColor'), hdrInk: cs(dth, 'color'), bodyInk: cs(document.body, 'color'),
        vrule: px(cs(dtd, 'borderLeftWidth')) + px(cs(dtd, 'borderRightWidth')), thVrule: px(cs(dth, 'borderLeftWidth')) + px(cs(dth, 'borderRightWidth')),
        labelRule: px(cs(labs[0], 'borderLeftWidth')) + px(cs(labs[0], 'borderRightWidth')),
        labels: labs.map((e) => e.textContent.trim()),
        otherIsDict: !!other?.classList.contains('dict'), otherInStory: !!other?.closest('.story'),
        lblBreak: cs(document.querySelector('.story.lbl'), 'breakAfter'),
      };
    });
    check(`${l} PRINT ready state seen: four card parts, two shaped tables (${m.parts})`, m.ready, JSON.stringify(m));
    check(`${l} PRINT parts chain first..last`, /part-first/.test(m.parts[0]) && /part-last/.test(m.parts[3]), String(m.parts));
    check(`${l} PRINT rounded sand card (radius ${m.radius}px)`, m.radius > 4 && m.cardBg !== 'rgba(0, 0, 0, 0)');
    check(`${l} PRINT pale blue header, computed ${m.hdrBg}`, m.hdrBg !== 'rgba(0, 0, 0, 0)' && m.hdrBg !== m.cardBg);
    check(`${l} PRINT navy header words ${m.hdrInk} (body ${m.bodyInk})`, m.hdrInk !== m.bodyInk);
    check(`${l} PRINT vertical rules in body (${m.vrule}px) and header (${m.thVrule}px)`, m.vrule >= 1 && m.thVrule >= 1);
    check(`${l} PRINT band labels with the gold side rule: ${m.labels}`, m.labelRule >= 2 && m.labels.length === 2 && m.labels[0] === LAB[l][0] && m.labels[1] === LAB[l][1]);
    check(`${l} PRINT an unrelated subhead + table is not touched`, !m.otherInStory && !m.otherIsDict);
    check(`${l} PRINT label stays with its table (break-after ${m.lblBreak})`, m.lblBreak === 'avoid');
    await page.close();
  }
} finally { await browser.close(); }

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
].join('\n');
for (const l of ['ar', 'en']) {
  const d = fieldDoc(l);
  const docx = path.join(OUT, `out.${l}.docx`);
  exportDocx(d, { locale: l, theme, docxPath: docx, embedFonts: false });
  const r = spawnSync(...py(['-c', PYCODE, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  let tabs = []; try { tabs = JSON.parse(String(r.stdout).trim().split(/\r?\n/)[0]); } catch { /* reported below */ }
  const act = tabs.find((t) => t.text.includes('A1') && t.text.includes('A2'));
  const dic = tabs.find((t) => t.text.includes('D1') && t.text.includes('D4'));
  const oth = tabs.find((t) => t.text.includes('U1'));
  check(`${l} DOCX read back: actions, dictionary and the untouched table found among ${tabs.length}`, r.status === 0 && !!act && !!dic && !!oth, String(r.stderr).slice(0, 200));
  check(`${l} DOCX both headers shaded the same (${act?.fill} / ${dic?.fill}) and unlike the untouched table (${oth?.fill})`, !!act?.fill && act.fill === dic?.fill && act.fill !== oth?.fill);
  check(`${l} DOCX header cells carry the grid: ${act?.sides}`, ['bottom', 'left', 'right', 'top'].every((s) => act?.sides.includes(s)));
}
console.log(failed ? `shape-0162: ${failed} FAILED` : 'shape-0162: all pass');
process.exit(failed ? 1 : 0);
