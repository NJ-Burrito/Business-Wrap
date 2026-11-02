// 0.16.1 · the output table that follows a story card carries its label bar in Word, as in the print («بيانات المخرج» / "Output details").
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { exportDocx, exportPdf, loadTheme, launchOptions, REPO, i18n } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'docx-label-0161');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); if (!ok) failed += 1; };
const theme = loadTheme();
for (const loc of ['ar', 'en']) {
  const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${loc}.json`), 'utf8'));
  // found by kind: the section whose blocks hold a story card; an output table is appended right after it
  const sec = doc.chapters.flatMap((c) => c.sections).find((s) => s.blocks.some((b) => b.kind === 'stories'));
  sec.blocks = sec.blocks.filter((b) => b.kind !== 'subhead'); // a leading subhead hands the section heading on to the next table in the print (reported, not this test's subject)
  const at = sec.blocks.map((b) => b.kind).lastIndexOf('stories');
  const MARK = loc === 'ar' ? 'مخرج-علامة' : 'OutMark';
  sec.blocks.splice(at + 1, 0, { kind: 'table', columns: loc === 'ar' ? ['اسم المخرج', 'متى يصدر'] : ['Output', 'When'], rows: [[MARK, loc === 'ar' ? 'عند الموافقة' : 'On approval']] });
  const label = i18n().doc[loc].outputTable;
  const docx = path.join(OUT, `out.${loc}.docx`);
  exportDocx(doc, { locale: loc, theme, docxPath: docx, embedFonts: false });
  const code = 'import zipfile,sys,re\nx=zipfile.ZipFile(sys.argv[1]).read("word/document.xml").decode()\nt=re.sub(r"<[^>]+>","",x.replace("</w:p>",chr(10)))\ni=t.find(sys.argv[3]);j=t.find(sys.argv[2])\nprint(j,i,t.count(sys.argv[3]))';
  const r = spawnSync(...py(['-c', code, docx, label, MARK], []), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  const [j, i, n] = String(r.stdout).trim().split(/\s+/).map(Number);
  check(`DOCX ${loc}: the label «${label}» is drawn in the body, once, directly above the output table`, r.status === 0 && n === 1 && j >= 0 && j < i && i - j < label.length + 40, String(r.stdout).trim() + ' ' + String(r.stderr).slice(0, 160));
  const b = await chromium.launch(launchOptions());
  try {
    const pdf = path.join(OUT, `out.${loc}.pdf`);
    await exportPdf(doc, { locale: loc, theme, pdfPath: pdf, browser: b });
    const t = spawnSync('pdftotext', ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
    check(`PDF ${loc}: the print carries the same label above the same table`, t.includes(label) && t.includes(MARK));
  } finally { await b.close(); }
}
console.log(failed ? `\n${failed} FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
