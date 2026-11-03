// 0.16.0 lane doc: item 13 a table cell kept empty on purpose (`{"text":"","keepEmpty":true}` per cell, `blankCell` per table) in the
// HTML/PDF print, the editor view and the Word export, old samples byte-identical; item 14 the Check reads a story's nested acceptance
// blocks. Pure render in node, the rest through the real editor (headless Chrome, closed in finally) and the real Word export.
//   node tests/doc-0160.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, loadTheme, i18n, exportDocx } from '../engine/export.mjs';
import { renderDocument } from '../engine/render.mjs';

const BASE = 'eaee003'; // acceptance as the story card's last row (eaee003) after: 0.16.2 after the intended print changes since a276245 (story card ID row, field shape as a story card, a table's header kept with its first rows, Justify levels: 0c38351 adca1c7 8a5bca9 288f0a4), then the page-matching parity change fab0db0 (the editor draws a table's repeated header, a table starts where its head fits, cards number 6.1); a doc without keepEmpty must print as it did there. Move it again only when the print changes on purpose
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-doc0160-'));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  doc-0160: ${name}${detail && !ok ? '  — ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
const clone = (x) => JSON.parse(JSON.stringify(x));
const SAMPLES = ['blank', 'event-permit'];
const load = (s, l) => JSON.parse(fs.readFileSync(path.join(REPO, 'samples', s, `document.${l}.json`), 'utf8'));
const htmlOf = (render, doc, locale) => render(doc, { locale, labels: i18n().doc[locale], theme, fontCss: '', logos: theme.logos });
const NONE = { ar: 'لا يوجد', en: 'None' };
const count = (h, s) => h.split(s).length - 1;
const KEPT = { text: '', keepEmpty: true };
const tableBlock = (extra = {}) => ({ kind: 'table', columns: ['A', 'B', 'C'], rows: [['x', clone(KEPT), 'z'], ['y', '', 'w']], ...extra });
const withTable = (doc, block) => { const d = clone(doc); d.chapters[0].sections[0].blocks.push(block); return d; };
const tableHtml = (h, i) => { const m = new RegExp(`<table[^>]*data-b="[^"]*/blocks/${i}"[\\s\\S]*?</table>`).exec(h); return m ? m[0] : ''; };
const PY = 'import zipfile,sys,re;x=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode("utf8");print("".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>",x)))';

try {
  // ── old samples byte-identical against the base commit's renderer ──
  const old = path.join(tmp, 'base');
  fs.mkdirSync(old, { recursive: true });
  const ar = spawnSync(`git -C "${REPO}" archive ${BASE} engine | tar -x`, { shell: true, cwd: old, encoding: 'utf8' });
  check('base engine extracted for the byte comparison', ar.status === 0 && fs.existsSync(path.join(old, 'engine', 'render.mjs')), ar.stderr);
  const oldRender = (await import(pathToFileURL(path.join(old, 'engine', 'render.mjs')).href)).renderDocument;
  let same = 0; let total = 0;
  for (const s of SAMPLES) for (const l of ['ar', 'en']) { total += 1; if (htmlOf(oldRender, load(s, l), l) === htmlOf(renderDocument, load(s, l), l)) same += 1; }
  check(`absent = byte-identical print (${total} sample renders)`, total === 4 && same === total, `${same}/${total}`);

  // ── 13 · print ──
  for (const l of ['ar', 'en']) {
    const base = load('event-permit', l);
    const at = base.chapters[0].sections[0].blocks.length;
    const h1 = tableHtml(htmlOf(renderDocument, withTable(base, tableBlock()), l), at);
    check(`13 ${l}: the table was found in the print`, h1.includes('<td') && h1.includes('>x<'), h1.slice(0, 120));
    check(`13 ${l}: a kept-empty cell prints empty and the plain blank cell still prints «${NONE[l]}» (exactly once)`, count(h1, NONE[l]) === 1 && !h1.includes('keepEmpty') && !h1.includes('[object'), h1);
    const h2 = tableHtml(htmlOf(renderDocument, withTable(base, tableBlock({ blankCell: '' })), l), at);
    check(`13 ${l}: table option blankCell:"" prints every blank cell empty`, h2.includes('>y<') && count(h2, NONE[l]) === 0, h2);
    const h3 = tableHtml(htmlOf(renderDocument, withTable(base, tableBlock({ blankCell: '·' })), l), at);
    check(`13 ${l}: blankCell:"·" fills with that mark`, count(h3, '·') >= 1 && count(h3, NONE[l]) === 0, h3);
    const allKept = withTable(base, { kind: 'table', columns: ['A', 'B'], rows: [['x', clone(KEPT)], ['y', clone(KEPT)]] });
    const h4 = tableHtml(htmlOf(renderDocument, allKept, l), at);
    check(`13 ${l}: a column of kept-empty cells is not dropped`, (h4.match(/<th[ >]/g) || []).length === 2, h4);
  }

  // ── 13 · Word ──
  const wordText = (doc, l, name) => {
    const f = path.join(tmp, name);
    exportDocx(doc, { locale: l, theme, docxPath: f, embedFonts: false });
    return spawnSync('python', ['-X', 'utf8', '-I', '-c', PY, f], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout;
  };
  for (const l of ['ar', 'en']) {
    const base = load('event-permit', l);
    const n0 = count(wordText(base, l, `w0-${l}.docx`), NONE[l]);
    const n1 = count(wordText(withTable(base, tableBlock()), l, `w1-${l}.docx`), NONE[l]);
    const n2 = count(wordText(withTable(base, tableBlock({ blankCell: '' })), l, `w2-${l}.docx`), NONE[l]);
    check(`13 ${l}: Word: the plain blank cell reads «${NONE[l]}» (+1), the kept-empty one does not`, n1 === n0 + 1, `${n0} ${n1}`);
    check(`13 ${l}: Word: blankCell:"" adds no «${NONE[l]}»`, n2 === n0, `${n0} ${n2}`);
  }

  // ── 14 · the Check, through the real editor ──
  const file = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'doc-0160-test', watermarkDir: null });
  const browser = await chromium.launch(launchOptions());
  try {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    const res = await page.evaluate(async () => {
      const B = window.BW; const svc = B.S.svc;
      const story = (id, extra) => ({ id, name: `قصة ${id}`, as: 'مستخدم', goal: 'هدف', ...extra });
      const block = { kind: 'stories', items: [
        story('NEST-1', { acceptance: [], blocks: [{ kind: 'prose', paragraphs: ['يقبل النظام الطلب خلال يوم'] }] }),
        story('OWN-2', { acceptance: ['معيار مكتوب'] }),
        story('NONE-3', { acceptance: [] }),
        story('EMPTYNEST-4', { acceptance: [], blocks: [{ kind: 'prose', paragraphs: ['  '] }] }),
        // last on purpose: the prose block that follows the cards is the criteria of the LAST story (field notes 14), so the probe stories above must not be last
        story('LAST-5', { acceptance: ['معيار مكتوب'] }),
      ] };
      const r = await B.bridge('ops', svc, { locale: 'ar', mirror: false, ops: [{ op: 'insert', path: '/chapters/0/sections/0/blocks/0', value: block }] });
      const f = (await B.bridge('action', svc, { id: 'check' })).findings;
      return { r: JSON.stringify(r).slice(0, 200), msgs: f.map((x) => x.message).filter((m) => /معايير قبول|acceptance/i.test(m)) };
    });
    const has = (id) => res.msgs.some((m) => m.includes(id));
    check('14 editor reached the ready state and took the stories block (the check saw the warned stories)', res.msgs.length > 0, res.r);
    check('14 a story whose criteria sit in a nested prose block is not warned', !has('NEST-1'), JSON.stringify(res.msgs));
    check('14 a story with its own acceptance is not warned', !has('OWN-2'));
    check('14 a story truly without criteria still warns', has('NONE-3'));
    check('14 an empty nested block does not count as criteria', has('EMPTYNEST-4'));
    check('14 no page error', errors.length === 0, errors.join('|'));
  } finally { await browser.close(); }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\ndoc-0160: ${failed} FAILED` : '\ndoc-0160: all passed');
process.exit(failed ? 1 : 0);
