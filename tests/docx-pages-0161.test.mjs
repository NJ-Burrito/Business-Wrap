// 0.16.1 (bw-0161, fault 3): a Word document's page count follows the PDF's wherever Word's layout allows it.
//
//  W1  The blank and event-permit samples, Arabic and English, are exported to PDF (Chrome) and DOCX; real Word opens the DOCX (its own instance,
//      closed in finally) and reports, for every chapter heading, the page it lands on (Range.Information). The PDF gives the same per chapter.
//  W2  Every chapter starts on the same page in both (the first differing page was a vertical-rhythm gap: line-height 1.8, heading and paragraph
//      spacing of the print, and story cards whose first and last three rows stay together).
//  W3  The page counts differ by at most one. Exact equality is not promised: Word and Chrome break tables row by row with different row heights,
//      so a table's last rows can print on a page of their own in the PDF (blank, 7.4) where Word fits them.
//
// Skips cleanly, with a message, where Word is absent (CI, Linux).  uv run --no-project --with pywin32 --with pymupdf is used for Word.
//   BW_CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe" node tests/docx-pages-0161.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';

if (process.platform !== 'win32') { console.log('SKIP  docx-pages-0161: Word runs on Windows only'); process.exit(0); }
const probe = spawnSync('uv', ['run', '--no-project', '--with', 'pywin32', 'python', '-c', "import win32com.client as w; a=w.DispatchEx('Word.Application'); a.Quit(); print('word-ok')"], { encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONUTF8: '1' } });
if (!/word-ok/.test(probe.stdout || '')) { console.log('SKIP  docx-pages-0161: Microsoft Word is not available here'); process.exit(0); }

const PY = `
import json, re, sys
from pathlib import Path
import pythoncom, win32com.client, pymupdf
docx, pdf = sys.argv[1], sys.argv[2]
pythoncom.CoInitialize()
app = win32com.client.DispatchEx("Word.Application")
app.Visible = False
app.DisplayAlerts = 0
try:
    doc = app.Documents.Open(str(Path(docx).resolve()), ReadOnly=True, AddToRecentFiles=False, ConfirmConversions=False)
    try:
        doc.Repaginate()
        pages = doc.ComputeStatistics(2)
        heads = [(p.Range.Information(3), re.sub(r"^[\\d.]+\\s+", "", p.Range.Text.strip())[:14]) for p in doc.Paragraphs if p.OutlineLevel == 1]
    finally:
        doc.Close(SaveChanges=0)
finally:
    app.Quit()
    pythoncom.CoUninitialize()
ref = pymupdf.open(pdf)
def big_lines(page):
    out = []
    for blk in page.get_text("dict")["blocks"]:
        for ln in blk.get("lines", []):
            spans = [sp for sp in ln["spans"] if sp["text"].strip()]
            if spans and max(sp["size"] for sp in spans) >= 15:  # a chapter heading is 16 pt; its line in the contents is 10 pt
                out.append(" ".join(" ".join(sp["text"] for sp in spans).split()))
    return out
big = [big_lines(p) for p in ref]
rows = []
for pg, k in heads:
    hit = [i + 1 for i, ls in enumerate(big) if any(k in l for l in ls)]
    rows.append({"key": k, "word": pg, "pdf": hit[0] if hit else None})
print(json.dumps({"word_pages": pages, "pdf_pages": ref.page_count, "heads": rows}, ensure_ascii=False))
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-docxpages0161-'));
const theme = loadTheme();
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  docx-pages-0161: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
try {
  for (const name of ['blank', 'event-permit']) for (const loc of ['ar', 'en']) {
    const tag = `${name}-${loc}`;
    const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', name, `document.${loc}.json`), 'utf8'));
    const pdf = path.join(tmp, `${tag}.pdf`);
    const docx = path.join(tmp, `${tag}.docx`);
    await exportPdf(doc, { locale: loc, theme, pdfPath: pdf });
    exportDocx(doc, { locale: loc, theme, docxPath: docx });
    const r = spawnSync('uv', ['run', '--no-project', '--with', 'pywin32', '--with', 'pymupdf', 'python', '-X', 'utf8', '-I', '-c', PY, docx, pdf], { encoding: 'utf8', timeout: 240000, env: { ...process.env, PYTHONUTF8: '1' } });
    let m = null;
    try { m = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { /* reported below */ }
    check(`${tag}: Word answered (positive sample: pages and chapters read)`, !!m && m.word_pages > 0 && m.pdf_pages >= 7 && m.heads.length >= 5, (r.stderr || r.stdout || '').slice(-300));
    if (!m) continue;
    const off = m.heads.filter((h) => h.pdf !== h.word);
    check(`${tag}: every chapter starts on the PDF's page`, off.length === 0, off.map((h) => `${h.key}: word ${h.word} pdf ${h.pdf}`).join('; '));
    check(`${tag}: pages Word ${m.word_pages} against PDF ${m.pdf_pages} differ by at most one`, Math.abs(m.word_pages - m.pdf_pages) <= 1);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\ndocx-pages-0161: all passed');
process.exit(failed ? 1 : 0);
