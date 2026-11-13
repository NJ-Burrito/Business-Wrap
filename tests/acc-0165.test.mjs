// · acc lane: in the field shape (a `stories` block whose card has no acceptance, then a «معايير القبول» subhead and a prose block of numbered
// criteria with nested bullets) the criteria print as the LAST ROW of the story's card table (as the reference), not as a separate part below it:
// print (Chrome), DOCX read-back, stored data unchanged, in-place pointers kept. A story that already holds `acceptance` is unchanged.
// The document is a placeholder built here from the sample (no client words).
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { exportDocx, loadTheme, printHtml, REPO } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';
import { suite, launchChrome } from './_harness.mjs';

const OUT = path.join(REPO, 'out', 'acc-0165');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const S = suite("acc-0165");
const { check } = S;
const theme = loadTheme();
const LAB = { ar: ['معايير القبول', 'جدول الإجراءات'], en: ['Acceptance criteria', 'Actions table'] };
const fieldDoc = (l) => {
  const d = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`), 'utf8'));
  const sec = d.chapters.flatMap((c) => c.sections).find((s) => s.blocks.some((b) => b.kind === 'stories'));
  sec.blocks = [
    { kind: 'stories', items: [{ id: 'US-01', name: 'Placeholder name', as: 'Placeholder user', goal: 'Placeholder goal',
      card: { rows: [[{ label: 'storyId' }, { bind: 'id' }], [{ label: 'storyName' }, { bind: 'name' }], [{ label: 'storyUser' }, { bind: 'as' }], [{ label: 'storyGoalLabel' }, { bind: 'goal' }]] } }] },
    { kind: 'subhead', text: LAB[l][0] },
    { kind: 'prose', paragraphs: [
      { text: 'ACC-GROUP-ONE', marks: [], style: { list: 'number', level: 0 } },
      { text: 'ACC-NESTED-A', marks: [], style: { list: 'bullet', level: 1 } },
      { text: 'ACC-NESTED-B', marks: [], style: { list: 'bullet', level: 1 } },
      { text: 'ACC-GROUP-TWO', marks: [], style: { list: 'number', level: 0 } },
    ] },
    { kind: 'subhead', text: LAB[l][1] },
    { kind: 'table', columns: ['A1', 'A2'], rows: [['a', 'b'], ['c', 'd']] },
    { kind: 'subhead', text: 'Unrelated heading' },
    { kind: 'table', columns: ['U1', 'U2'], rows: [['u', 'v']] },
  ];
  return d;
};
const browser = await launchChrome();
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
      const card = document.querySelector('.id-card table.story-card');
      const rows = card ? [...card.querySelectorAll('tbody tr')] : [];
      const last = rows.at(-1);
      const tds = last ? [...last.children] : [];
      const stray = [...document.querySelectorAll('h4')].filter((h) => /ACC|معايير القبول|Acceptance criteria/.test(h.textContent)).length;
      return {
        ready: !!card && rows.length === 5 && tds.length === 2,
        rows: rows.length, cls: last?.className, label: tds[0]?.textContent.trim(), body: tds[1]?.textContent.replace(/\s+/g, ' ').trim(),
        nestedUl: !!tds[1]?.querySelector('ol ul, ul ul, li > ul'), ptrs: [...(tds[1]?.querySelectorAll('[data-p]') || [])].length,
        lblPtr: tds[0]?.getAttribute('data-p'), firstRows: rows.slice(0, 4).map((r) => r.children[0].textContent.trim()),
        stray, plainAcc: [...document.querySelectorAll('.story.lbl')].map((e) => e.textContent.trim()),
        order: [...document.querySelectorAll('.story')].map((e) => e.className.replace(/\s+/g, ' ').trim()).slice(0, 3),
      };
    });
    check(`${l} PRINT ready state seen: card table with 5 rows (4 + the criteria row) (${m.rows})`, m.ready, JSON.stringify(m));
    check(`${l} PRINT last row is the criteria row (class ${m.cls}, label «${m.label}»)`, /\bac\b/.test(m.cls || '') && m.label === LAB[l][0]);
    check(`${l} PRINT criteria row holds the numbered list with nested bullets`, /ACC-GROUP-ONE.*ACC-NESTED-A.*ACC-NESTED-B.*ACC-GROUP-TWO/.test(m.body || '') && m.nestedUl, JSON.stringify(m));
    check(`${l} PRINT criteria keep their editing pointers (${m.ptrs} of 4) and the label points at the subhead`, m.ptrs >= 4 && /\/blocks\/1\/text$/.test(m.lblPtr || ''), JSON.stringify(m));
    check(`${l} PRINT no separate «${LAB[l][0]}» section is left below the card`, m.stray === 0 && !m.plainAcc.some((t) => t === LAB[l][0]), JSON.stringify(m));
    check(`${l} PRINT the actions table still prints as its own part`, m.plainAcc.includes(LAB[l][1]) || html.includes('A1'), JSON.stringify(m.plainAcc));
    await page.close();
  }
} finally { await browser.close(); }

const PYCODE = [
  'import zipfile,sys,re,json',
  'x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode()',
  'tbls=x.split("<w:tbl>")[1:]',
  'def rows(t): return re.findall(r"<w:tr[ >].*?</w:tr>",t,re.S)',
  'def txt(s): return re.sub(r"\\s+"," ",re.sub(r"<[^>]+>"," ",s.replace("</w:p>","|")))',
  'print(json.dumps([[txt(r) for r in rows(t)] for t in tbls]))',
].join('\n');
for (const l of ['ar', 'en']) {
  const d = fieldDoc(l);
  const docx = path.join(OUT, `out.${l}.docx`);
  exportDocx(d, { locale: l, theme, docxPath: docx, embedFonts: false });
  const r = spawnSync(...py(['-c', PYCODE, docx], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  let tabs = []; try { tabs = JSON.parse(String(r.stdout).trim().split(/\r?\n/)[0]); } catch { /* reported below */ }
  const card = tabs.find((t) => t.some((x) => x.includes('Placeholder goal')));
  check(`${l} DOCX read back: the story card table found among ${tabs.length}`, r.status === 0 && !!card, String(r.stderr).slice(0, 200));
  const lastRow = card?.at(-1) || '';
  check(`${l} DOCX card has 5 rows, the last = label + the criteria (${card?.length})`, card?.length === 5 && lastRow.includes(LAB[l][0]) && /ACC-GROUP-ONE.*ACC-NESTED-A.*ACC-NESTED-B.*ACC-GROUP-TWO/.test(lastRow), lastRow);
  check(`${l} DOCX the criteria are not printed a second time outside the card`, tabs.length >= 1 && !tabs.some((t) => t !== card && t.some((x) => x.includes('ACC-GROUP-ONE'))));
}
S.finish();
