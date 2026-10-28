// The editor check (VERIFIER). Runs headless Chrome, closes it at the end.
//
//   node tests/editor.test.mjs
//
// Per edition (ar, en): load the sample → scripted edits through the real UI
// (edit text, duplicate a block, delete a row, drag a block) → Save (edits JSON)
// → validate the edits file → a fresh load imports it → same DOM. Then the PDF
// from the edited state: text with poppler pdftotext -enc UTF-8, fonts with
// pdffonts (Thmanyah, no Type 3, no Cairo, no Segoe/Arial fallback).
// Plus: paste sanitising + CSP (#1), autosave recovery (#2), import with a
// conflict (#8), the tool watermark in the UI and never in any output, Save-HTML
// round trip, and a 60-page timing.
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, launchOptions, loadTheme, fontsFor, REPO } from '../engine/export.mjs';
import { applyOps, validateEdits } from '../engine/edits.mjs';
import { config } from '../engine/config.mjs';
import { py } from '../engine/py.mjs';

const OUT = path.join(REPO, 'out', 'test');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const SAMPLE = path.join(REPO, 'samples', 'event-permit');
const POPPLER = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdffonts.exe')));
const tool = (name) => (POPPLER ? path.join(POPPLER, `${name}.exe`) : name);
// The contract lives in bible/ (merged repo) or, before the merge, in the sibling bible worktree.
const BIBLE_SCHEMA = [path.join(REPO, 'bible', 'contracts', 'edits.schema.json'), path.resolve(REPO, '..', 'Business-Wrap-wt-bible', 'bible', 'contracts', 'edits.schema.json')].find((f) => fs.existsSync(f)) || '';

let failed = 0;
const results = [];
// spawn that never throws on a missing tool: stdout '' and status null instead
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  return { ok: r.status === 0, out: r.stdout || '', err: r.stderr || String(r.error || '') };
};
// Thmanyah ships as a fallback in fonts/nj-fonts: a runner without any copy skips the face-specific checks.
const THEME0 = loadTheme();
const FACES = fontsFor(THEME0).used.filter((c) => c.format === 'truetype').map((c) => c.family);
const HAVE_FONTS = [THEME0.fonts.text, THEME0.fonts.display].every((f) => FACES.includes(f));
const skips = [];
function skip(name, why) {
  results.push(`SKIP  ${name}  — ${why}`);
  skips.push(name);
}
const fontCheck = (name, ok, detail = '') => (HAVE_FONTS ? check(name, ok, detail) : skip(name, 'Thmanyah TTF not found (fonts/nj-fonts missing and none installed)'));
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
}

// A 1×1 PNG stands in for the tool watermark (the real NJ-Avatar folder is empty).
const WM_DIR = path.join(OUT, 'wm');
fs.mkdirSync(WM_DIR, { recursive: true });
const WM_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
fs.writeFileSync(path.join(WM_DIR, 'tool-mark.png'), Buffer.from(WM_PNG, 'base64'));

const editorFile = path.join(OUT, 'editor.html');
buildEditor({ inputs: [SAMPLE], out: editorFile, set: 'test', watermarkDir: WM_DIR });
const editorUrl = pathToFileURL(editorFile).href;

const browser = await chromium.launch(launchOptions());
const normDom = (page, ed) =>
  page.evaluate((ed) => {
    const m = document.querySelector(`main.bw-doc[data-locale="${ed}"]`).cloneNode(true);
    m.querySelectorAll('*').forEach((el) => {
      el.removeAttribute('tabindex');
      el.removeAttribute('contenteditable');
      el.removeAttribute('title');
      [...el.classList].filter((c) => c.startsWith('bw-') && c !== 'bw-logo-slot' && c !== 'bw-break').forEach((c) => el.classList.remove(c));
      if (el.getAttribute('class') === '') el.removeAttribute('class');
      if (el.classList.contains('bw-logo-slot')) el.textContent = '';
    });
    return m.outerHTML;
  }, ed);
async function open(ctx) {
  const page = await ctx.newPage();
  const errors = [];
  // name the source of any CSP report, so a blocked handler points at its element
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP-SOURCE ${e.violatedDirective} sample=${JSON.stringify(e.sample)} at ${e.sourceFile}:${e.lineNumber} target=${e.target?.outerHTML?.slice?.(0, 120) || e.target?.nodeName}`)));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(editorUrl);
  await page.waitForFunction(() => window.BW?.ready);
  return { page, errors };
}
const ui = (page, a, extra = '') => page.locator(`button[data-a="${a}"]${extra}`);
// An action is clicked where it is visible (island, selection bar, view menu), else run from the command palette.
async function act(page, a, extra = '') {
  const b = page.locator(`button[data-a="${a}"]${extra}`);
  if ((await b.count()) && (await b.first().isVisible())) return b.first().click();
  await page.keyboard.press('Control+K');
  await page.locator(`#cmdlist [data-cmd="${a}"]`).click();
}
async function pickEdition(page, ed) {
  await act(page, 'ed', `[data-ed="${ed}"]`);
  await page.waitForSelector(`main.bw-doc[data-locale="${ed}"]`);
}
async function download(page, action) {
  const [dl] = await Promise.all([page.waitForEvent('download'), action()]);
  const f = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(f);
  return f;
}

const TYPED = { ar: 'نص معدّل للاختبار', en: 'Edited text for the test' };

try {
  for (const ed of ['ar', 'en']) {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 1300 } });
    const { page, errors } = await open(ctx);
    await pickEdition(page, ed);
    const main = `main.bw-doc[data-locale="${ed}"]`;

    // 1 — edit text through the keyboard
    const para = page.locator(`${main} [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]`);
    await para.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(TYPED[ed]);
    await page.keyboard.press('Enter');

    // 2 — duplicate a block (the service-data table, 2.1)
    await page.locator(`${main} [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]`).click();
    await act(page, 'duplicate');

    // 3 — delete a row (attachments table 2.3, row 2)
    await page.locator(`${main} [data-p="/chapters/1/sections/2/blocks/0/rows/1/0"]`).click();
    await act(page, 'rowDel');

    // 4 — drag a block with the cursor: the 2.1 lead paragraph to after the duplicated table
    const lead = page.locator(`${main} [data-p="/chapters/1/sections/0/blocks/0/paragraphs/0"]`);
    await lead.evaluate((e) => window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 260));
    await lead.click();
    const grip = page.locator('#bw-overlay .bw-grip');
    await grip.waitFor({ state: 'visible' });
    const g = await grip.boundingBox();
    const target = await page.locator(`${main} table[data-b="/chapters/1/sections/0/blocks/2"]`).boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, target.y + target.height - 4, { steps: 8 });
    await page.mouse.up();

    const state = await page.evaluate((ed) => {
      const d = window.BW.M[window.BW.S.svc][ed].doc;
      return { kinds: d.chapters[1].sections[0].blocks.map((b) => b.kind), rows23: d.chapters[1].sections[2].blocks[0].rows.length, p0: d.chapters[0].sections[0].blocks[0].paragraphs[0], ops: window.BW.M[window.BW.S.svc][ed].ops.length };
    }, ed);
    check(`${ed}: text edit in model`, state.p0 === TYPED[ed], state.p0);
    check(`${ed}: duplicate + drag gave table,table,prose`, JSON.stringify(state.kinds) === '["table","table","prose"]', JSON.stringify(state.kinds));
    check(`${ed}: row deleted`, state.rows23 === 2, `rows=${state.rows23}`);
    check(`${ed}: watermark shown in the editor UI`, (await page.locator('#bw-watermark img').count()) === 1);
    check(`${ed}: CSP meta present (#1)`, (await page.locator('meta[http-equiv="Content-Security-Policy"]').count()) === 1);
    const domA = await normDom(page, ed);

    // Save → the edits JSON (this edition)
    const editsPath = await download(page, () => act(page, 'save'));
    const edits = JSON.parse(fs.readFileSync(editsPath, 'utf8'));
    check(`${ed}: edits file valid (engine check)`, validateEdits(edits).length === 0, validateEdits(edits).join('; '));
    check(`${ed}: edits file free of watermark`, !fs.readFileSync(editsPath, 'utf8').includes(WM_PNG.slice(0, 40)));
    if (fs.existsSync(BIBLE_SCHEMA)) {
      const r = run('uv', ['run', '--no-project', '--with', 'jsonschema', 'python', '-c', 'import json,sys,jsonschema;jsonschema.validate(json.load(open(sys.argv[1],encoding="utf-8")),json.load(open(sys.argv[2],encoding="utf-8")));print("ok")', editsPath, BIBLE_SCHEMA]);
      check(`${ed}: edits file valid against bible/contracts/edits.schema.json`, r.out.trim() === 'ok', r.err.split('\n').filter(Boolean).slice(-1)[0] || '');
    }
    // per-service + global bundles
    const bundleFile = await download(page, () => act(page, 'exportEdits'));
    check(`${ed}: per-service edits bundle`, JSON.parse(fs.readFileSync(bundleFile, 'utf8')).files.length === 2);

    // #1 — paste sanitising: HTML with script and handlers lands as plain text
    const cell = page.locator(`${main} [data-p="/chapters/3/sections/0/blocks/0/rows/0/1"]`);
    await cell.click();
    await page.evaluate(() => {
      const el = document.activeElement;
      const sel = getSelection();
      sel.selectAllChildren(el);
      const dt = new DataTransfer();
      dt.setData('text/html', '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2<\/script><b onclick="x()">Safe</b>');
      dt.setData('text/plain', '');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    const pasted = await page.evaluate(() => ({ html: document.activeElement.innerHTML, pwned: window.__pwned || 0 }));
    check(`${ed}: paste sanitised (#1)`, pasted.html === 'Safe' && !pasted.pwned, JSON.stringify(pasted));
    await page.keyboard.press('Control+Z').catch(() => {});
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.BW.undo()); // drop the paste op, keep the four scripted edits

    // #2 — autosave + recovery: a reopened tab offers the draft and restores it
    await page.waitForFunction(() => !window.BW.S.pending);
    const { page: p2 } = await open(ctx);
    const banner = p2.locator('.banner');
    await banner.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    const offered = await banner.isVisible();
    if (offered) await banner.locator('button').first().click();
    const restored = await p2.evaluate((ed) => window.BW.M[window.BW.S.svc][ed].ops.length, ed);
    check(`${ed}: autosave recovery (#2)`, offered && restored >= edits.ops.length, `offered=${offered} ops=${restored}`);
    await p2.close();

    // Save HTML: this service only, no watermark, opens and keeps editing
    const savedHtml = await download(page, () => act(page, 'saveHtml'));
    const savedText = fs.readFileSync(savedHtml, 'utf8');
    check(`${ed}: Save-HTML has no watermark`, !savedText.includes('id="bw-watermark') && !savedText.includes(WM_PNG.slice(0, 40)));

    // fresh load → import the edits file → same DOM
    const ctx2 = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 1300 } });
    const { page: fresh, errors: errors2 } = await open(ctx2);
    await pickEdition(fresh, ed);
    const [chooser] = await Promise.all([fresh.waitForEvent('filechooser'), act(fresh, 'import')]);
    await chooser.setFiles(editsPath);
    await fresh.waitForFunction((n) => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length >= n, edits.ops.length);
    const domB = await normDom(fresh, ed);
    check(`${ed}: re-applied edits give the same DOM`, domA === domB, domA === domB ? '' : `len ${domA.length} vs ${domB.length}`);

    // #8 — import a colleague's file that changed the same field differently → conflict view
    const theirs = { ...edits, ops: [{ op: 'setText', path: '/chapters/0/sections/0/blocks/0/paragraphs/0', value: 'THEIRS', old: '' }] };
    const theirsFile = path.join(OUT, `theirs.${ed}.json`);
    fs.writeFileSync(theirsFile, JSON.stringify(theirs));
    const [ch2] = await Promise.all([fresh.waitForEvent('filechooser'), act(fresh, 'import')]);
    await ch2.setFiles(theirsFile);
    await fresh.locator('.drawer [data-theirs]').first().waitFor({ timeout: 5000 }).catch(() => {});
    const conflicts = await fresh.locator('.drawer [data-theirs]').count();
    check(`${ed}: conflict view on import (#8)`, conflicts === 1, `conflicts=${conflicts}`);
    // structural conflict: they deleted the block I dragged → a structural prompt, and "take theirs" applies
    const theirsStruct = { ...edits, ops: [{ op: 'delete', path: '/chapters/1/sections/0/blocks/0' }] };
    const theirsStructFile = path.join(OUT, `theirs-struct.${ed}.json`);
    fs.writeFileSync(theirsStructFile, JSON.stringify(theirsStruct));
    const [chS] = await Promise.all([fresh.waitForEvent('filechooser'), act(fresh, 'import')]);
    await chS.setFiles(theirsStructFile);
    const structLi = fresh.locator('.drawer li[data-kind="structure"]');
    await structLi.first().waitFor({ timeout: 5000 }).catch(() => {});
    const nStruct = await structLi.count();
    check(`${ed}: structural conflict prompt on import`, nStruct >= 1, `structural=${nStruct}`);
    if (nStruct) {
      const before = await fresh.evaluate((ed) => window.BW.M[window.BW.S.svc][ed].doc.chapters[1].sections[0].blocks.length, ed);
      await structLi.first().locator('[data-theirs]').click();
      const after = await fresh.evaluate((ed) => window.BW.M[window.BW.S.svc][ed].doc.chapters[1].sections[0].blocks.map((b) => b.kind), ed);
      check(`${ed}: structural "take theirs" applies their delete`, after.length === before - 1, JSON.stringify(after));
    }

    // table column add + delete through the toolbar (fees table 2.2, 3 columns)
    const fees = '/chapters/1/sections/1/blocks/1';
    await fresh.locator(`${main} [data-p="${fees}/rows/0/1"]`).click();
    await act(fresh, 'colAdd');
    const added = await fresh.evaluate(([ed, f]) => { const b = window.BW.applyOps ? null : null; const d = window.BW.M[window.BW.S.svc][ed].doc; const t = f.split('/').filter(Boolean).reduce((o, k) => o[k], d); return [t.columns.length, ...t.rows.map((r) => r.length)]; }, [ed, fees]);
    check(`${ed}: column added (header + every row)`, added.every((n) => n === 4), JSON.stringify(added));
    await fresh.locator(`${main} [data-p="${fees}/rows/0/2"]`).click();
    await act(fresh, 'colDel');
    const removed = await fresh.evaluate(([ed, f]) => { const d = window.BW.M[window.BW.S.svc][ed].doc; const t = f.split('/').filter(Boolean).reduce((o, k) => o[k], d); return [t.columns.length, ...t.rows.map((r) => r.length), t.columns[2]]; }, [ed, fees]);
    check(`${ed}: column deleted (header + every row)`, removed.slice(0, -1).every((n) => n === 3) && removed.at(-1) !== '…', JSON.stringify(removed));

    // design pack import: a token applies; a hostile token and a script logo are refused
    const pack = { kind: 'bw-design-pack', version: 1, vars: { primary: '#7a1f5c', ink: 'red;}</style><script>window.__pwned=3</script>' }, logos: { start: 'javascript:alert(1)' }, fonts: { text: 'Thmanyah Serif Text', display: 'Thmanyah Serif Display' } };
    const packFile = path.join(OUT, `pack.${ed}.json`);
    fs.writeFileSync(packFile, JSON.stringify(pack));
    await act(fresh, 'theme');
    const [chP] = await Promise.all([fresh.waitForEvent('filechooser'), fresh.locator('.drawer button[data-k="timp"]').click()]);
    await chP.setFiles(packFile);
    await fresh.waitForFunction(() => window.BW.S.theme.vars.primary === '#7a1f5c', null, { timeout: 5000 }).catch(() => {});
    const applied = await fresh.evaluate(() => ({ primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(), ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(), logo: window.BW.S.theme.logos.start, pwned: window.__pwned || 0 }));
    check(`${ed}: design pack import applies tokens, refuses hostile values`, applied.primary === '#7a1f5c' && !applied.ink.includes('<') && applied.logo === '' && !applied.pwned, JSON.stringify(applied));

    // the colleague's Save-HTML imports too (data only)
    const [ch3] = await Promise.all([fresh.waitForEvent('filechooser'), act(fresh, 'import')]);
    await ch3.setFiles(savedHtml);
    check(`${ed}: Save-HTML file imports`, (await fresh.locator('.flash').textContent()).length > 0);

    // the Save-HTML file opens on its own and shows the edited document
    const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 1300 } });
    const p3 = await ctx3.newPage();
    await p3.goto(pathToFileURL(savedHtml).href);
    await p3.waitForFunction(() => window.BW?.ready);
    await pickEdition(p3, ed);
    check(`${ed}: Save-HTML reopens with the edits`, (await normDom(p3, ed)) === domA);
    check(`${ed}: watermark absent in reopened Save-HTML`, (await p3.locator('#bw-watermark').count()) === 0);

    // the editor's own print: watermark and UI never print
    await page.emulateMedia({ media: 'print' });
    const editorPdf = path.join(OUT, `editor-print.${ed}.pdf`);
    await page.pdf({ path: editorPdf, preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });

    // PDF + DOCX from the edited state
    const base = JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${ed}.json`), 'utf8'));
    const edited = applyOps(base, edits.ops);
    const pdf = path.join(OUT, `event-permit.${ed}.pdf`);
    await exportPdf(edited, { locale: ed, theme: loadTheme(), pdfPath: pdf, browser });
    const txt = run(tool('pdftotext'), ['-enc', 'UTF-8', pdf, '-']).out;
    const fonts = run(tool('pdffonts'), [pdf]).out;
    check(`${ed}: poppler available (pdftotext, pdffonts)`, txt.length > 0 && fonts.length > 0, POPPLER || 'from PATH');
    const arabic = (txt.match(/[\u0600-\u06FF]/g) || []).length;
    const latinWords = (txt.match(/\b(Document|Service|request|Business|rules)\b/g) || []).length;
    if (ed === 'ar') check('ar: PDF has Arabic text', arabic > 500, `arabic chars=${arabic}`);
    else check('en: PDF has English text', latinWords > 5 && arabic === 0, `words=${latinWords} arabic=${arabic}`);
    const want = ed === 'ar' ? 'للاختبار' : 'Edited text for the test';
    // Fallback faces (CI: DejaVu/Noto, partly Type 3) lose the shadda and come back from poppler
    // with the lam-alef ligature reversed ('لالختبار' for 'للاختبار', 'األسماء' for 'الأسماء'), so the
    // whole typed sentence is compared without lam and alef.
    // Thmanyah, where installed, takes the strict branch above.
    const squash = (x) => x.normalize('NFKC')
      .replace(/[\s\u200e\u200f\u202a-\u202e\u2066-\u2069\u064b-\u0652]/g, '')
      .replace(/[لاأإآ]/g, ''); // lam and alef dropped: the reversed ligature cannot be told apart
    if (HAVE_FONTS) check(`${ed}: PDF carries the edited text (words whole)`, txt.replace(/\s+/g, ' ').includes(want));
    else check(`${ed}: PDF carries the edited text (fallback face: spacing, marks, lam/alef ignored)`, squash(txt).includes(squash(TYPED[ed])), squash(txt).includes(squash(TYPED[ed])) ? '' : JSON.stringify(txt.slice(0, 160)));
    fontCheck(`${ed}: PDF fonts are Thmanyah`, /thmanyah/i.test(fonts));
    fontCheck(`${ed}: PDF has no Type 3`, !/Type 3/.test(fonts));
    fontCheck(`${ed}: PDF has no Cairo / Segoe / Arial fallback`, !/cairo|segoe|arial|times|tahoma/i.test(fonts));
    const imgs = run(...py(['-c', 'import pymupdf,sys\nfor f in sys.argv[1:]:\n d=pymupdf.open(f); print(sum(len(p.get_images()) for p in d), d.page_count)', pdf, editorPdf], ['pymupdf'])).out.trim().split(/\r?\n/).map((l) => l.trim());
    check(`${ed}: watermark absent from export PDF and editor print (no images)`, imgs.every((l) => l.split(' ')[0] === '0'), imgs.join(' | '));
    check(`${ed}: editor print and export have the same page count`, imgs[0].split(' ')[1] === imgs[1].split(' ')[1], imgs.join(' | '));
    const docx = exportDocx(edited, { locale: ed, theme: loadTheme(), docxPath: path.join(OUT, `event-permit.${ed}.docx`) }).docx;
    const docxXml = run(...py(['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.read("word/document.xml").decode())', docx], [])).out;
    check(`${ed}: DOCX carries the edited text`, docxXml.includes(ed === 'ar' ? 'للاختبار' : 'Edited text for the test'));
    check(`${ed}: DOCX has no watermark image`, !/<pic:pic/.test(docxXml) || !docxXml.includes('tool-mark'));
    check(`${ed}: no page errors`, errors.length === 0 && errors2.length === 0, [...errors, ...errors2].join(' | '));
    await ctx.close();
    await ctx2.close();
    await ctx3.close();
  }

  // 60-page document stays responsive
  const big = JSON.parse(fs.readFileSync(path.join(SAMPLE, 'document.ar.json'), 'utf8'));
  const extra = [];
  for (let k = 0; k < 10; k += 1) for (const ch of big.chapters.slice(1)) extra.push(JSON.parse(JSON.stringify(ch)));
  big.chapters.push(...extra);
  big.chapters.forEach((ch, i) => { ch.number = String(i + 1); ch.sections.forEach((s, j) => { s.number = `${i + 1}.${j + 1}`; }); });
  big.service = 'big';
  const bigFile = path.join(OUT, 'big.ar.json');
  fs.writeFileSync(bigFile, JSON.stringify(big));
  const bigEditor = path.join(OUT, 'big.editor.html');
  buildEditor({ inputs: [bigFile], out: bigEditor, watermarkDir: null });
  const ctxB = await browser.newContext({ viewport: { width: 1366, height: 1300 } });
  const pb = await ctxB.newPage();
  const t0 = Date.now();
  await pb.goto(pathToFileURL(bigEditor).href);
  await pb.waitForFunction(() => window.BW?.ready);
  const loadMs = Date.now() - t0;
  const timing = await pb.evaluate(() => {
    const B = window.BW;
    const t = (f) => { const s = performance.now(); f(); return performance.now() - s; };
    const p = '/chapters/1/sections/0/blocks/1';
    return {
      duplicate: t(() => B.commit([{ op: 'duplicate', path: p }])),
      undo: t(() => B.undo()),
      typing: t(() => B.setText('/chapters/0/sections/0/blocks/0/paragraphs/0', 'x')),
    };
  });
  await pb.emulateMedia({ media: 'print' });
  const bigPdf = path.join(OUT, 'big.editor-print.pdf');
  await pb.pdf({ path: bigPdf, preferCSSPageSize: true, printBackground: true });
  const bigPages = run(...py(['-c', 'import pymupdf,sys;print(pymupdf.open(sys.argv[1]).page_count)', bigPdf], ['pymupdf'])).out.trim();
  const perf = `pages=${bigPages} load=${loadMs}ms duplicate+render=${timing.duplicate.toFixed(0)}ms undo+render=${timing.undo.toFixed(0)}ms keystroke=${timing.typing.toFixed(1)}ms`;
  fs.writeFileSync(path.join(OUT, 'perf.txt'), perf + '\n');
  const limit = process.env.CI ? 1000 : 300; // shared CI runners are several times slower than a laptop
  check(`60-page document stays responsive (<${limit} ms per structural edit)`, +bigPages >= 60 && timing.duplicate < limit && timing.undo < limit, perf);
  await ctxB.close();

  // the tool watermark: the NJ role mark from editor/brand/watermark, clicked through its roles
  const avatarEditor = path.join(OUT, 'avatar.editor.html');
  buildEditor({ inputs: [SAMPLE], out: avatarEditor, set: 'avatar', watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
  const avatarB64 = fs.readFileSync(path.join(REPO, 'editor', 'brand', 'watermark', 'nj-avatar-teacher.webp')).toString('base64').slice(0, 60);
  for (const ui of ['ar', 'en']) {
    const ctxA = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
    await ctxA.addInitScript((ui) => { try { localStorage.setItem('bw:ui', ui); } catch {} }, ui);
    const pa = await ctxA.newPage();
    await pa.goto(pathToFileURL(avatarEditor).href);
    await pa.waitForFunction(() => window.BW_WM);
    const wm = pa.locator('#bw-watermark');
    const st = await pa.evaluate(() => { const w = document.getElementById('bw-watermark'); const r = w.getBoundingClientRect(); return { n: w.querySelectorAll('img').length, intro: w.dataset.intro, x: r.left, dir: w.dir }; });
    check(`${ui}: avatar mounted with 4 roles + intro, intro plays first`, st.n === 5 && st.intro === 'playing', JSON.stringify(st));
    check(`${ui}: avatar keeps the default layout's corner (bottom right) in both languages; its words follow the UI`, st.x > 1000 && st.dir === (ui === 'ar' ? 'rtl' : 'ltr'), JSON.stringify(st)); // 0.10.0: the layout never flips
    await wm.locator('.bw-wm-stage').click(); // skips the intro, as on the portfolio
    const r0 = await pa.evaluate(() => [document.getElementById('bw-watermark').dataset.role, document.querySelector('#bw-watermark img.on').dataset.i]);
    await wm.locator('.bw-wm-stage').click();
    const r1 = await pa.evaluate(() => [document.getElementById('bw-watermark').dataset.role, document.querySelector('#bw-watermark img.on').dataset.i, document.querySelector('#bw-watermark .bw-wm-tag').textContent]);
    await wm.locator('.bw-wm-stage').focus();
    await pa.keyboard.press('Enter');
    const r2 = await pa.evaluate(() => document.getElementById('bw-watermark').dataset.role);
    check(`${ui}: clicking the avatar changes it (tester → teacher), Enter → volunteer`, r0[0] === 'tester' && r1[0] === 'teacher' && r1[1] !== r0[1] && r1[2] === (ui === 'ar' ? 'يعلم' : 'TEACHER') && r2 === 'volunteer', JSON.stringify([r0, r1, r2]));
    // never blocks editing: a document field next to it still takes the click
    const field = pa.locator('main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]');
    await field.click();
    check(`${ui}: avatar never blocks editing`, await field.evaluate((e) => document.activeElement === e));
    // exclusion: print, Save-HTML
    const saved = await download(pa, () => act(pa, 'saveHtml'));
    const savedTxt = fs.readFileSync(saved, 'utf8');
    check(`${ui}: avatar absent from Save-HTML`, !savedTxt.includes(avatarB64) && !savedTxt.includes('id="bw-watermark'));
    await pa.emulateMedia({ media: 'print' });
    const ap = path.join(OUT, `avatar-print.${ui}.pdf`);
    await pa.pdf({ path: ap, preferCSSPageSize: true, printBackground: true });
    const imgsA = run(...py(['-c', 'import pymupdf,sys;print(sum(len(p.get_images()) for p in pymupdf.open(sys.argv[1])))', ap], ['pymupdf'])).out.trim();
    check(`${ui}: avatar absent from the editor's print`, imgsA === '0', `images=${imgsA}`);
    await ctxA.close();
  }
  // reduced motion: no intro, no float or tilt
  const ctxR = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 900 } });
  const pr = await ctxR.newPage();
  await pr.goto(pathToFileURL(avatarEditor).href);
  await pr.waitForFunction(() => window.BW_WM);
  await pr.waitForTimeout(300);
  const rm = await pr.evaluate(() => { const w = document.getElementById('bw-watermark'); return { intro: w.dataset.intro, role: w.dataset.role, transform: w.querySelector('.bw-wm-mark').style.transform }; });
  check('reduced motion: avatar skips the intro and does not move', rm.intro === 'done' && rm.role === 'tester' && !rm.transform, JSON.stringify(rm));
  await ctxR.close();

  // ── the redesigned shell ──────────────────────────────────────────────
  // a PNG carrying a text chunk: the editor must re-encode it (metadata gone) before it enters the document
  const pngWithMeta = (() => {
    const zlib = require('node:zlib');
    const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = crcT[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
    const w = 80, h = 40;
    const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0)]).fill(200, 1, 1 + w * 3)));
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Author\0secret-camera-owner')), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  })();
  const pngFile = path.join(OUT, 'logo-with-meta.png');
  fs.writeFileSync(pngFile, pngWithMeta);
  for (const uiL of ['ar', 'en']) {
    const ctxU = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 1000 } });
    await ctxU.addInitScript((l) => { try { localStorage.setItem('bw:ui', l); } catch {} }, uiL);
    const pu = await ctxU.newPage();
    const errU = [];
    pu.on('pageerror', (e) => errU.push(e.message));
    await pu.goto(editorUrl);
    await pu.waitForFunction(() => window.BW?.ready);
    const labels = await pu.evaluate(() => { const sh = document.getElementById('bw-ui-host').shadowRoot; return { ed: [...sh.querySelectorAll('[data-a="ed"]')].map((b) => b.textContent.trim()), ui: [...sh.querySelectorAll('[data-a="dir"]')].map((b) => b.textContent.trim()), named: [...sh.querySelectorAll('[data-a="ed"], [data-a="dir"]')].every((b) => b.getAttribute('aria-label') && b.title), icons: sh.querySelectorAll('.seg.lang .cap svg, .seg.ui .cap svg').length, brandWords: sh.querySelector('.brand').innerText.trim(), brandSvg: !!sh.querySelector('.brand svg'), dir: sh.querySelector('.shell').dir, tdir: sh.querySelector('.shell').dataset.tdir }; });
    check(`${uiL} UI: language reads «ع» / «E», direction reads RTL / LTR (icon, tooltip, name), the brand is a logo not words`, JSON.stringify(labels.ed) === '["ع","E"]' && JSON.stringify(labels.ui) === '["RTL","LTR"]' && labels.named && labels.icons === 2 && labels.brandWords === '' && labels.brandSvg && labels.dir === 'rtl' && labels.tdir === (uiL === 'ar' ? 'rtl' : 'ltr'), JSON.stringify(labels)); // 0.10.0: the layout stays right-to-left, the words follow
    {
      // direction is independent of the language: flip it, the language and edition stay; the choice is remembered
      // flip against the edition's own direction (the UI language alone does not pick the edition)
      const natural = await pu.evaluate(() => (window.BW.S.ed === 'ar' ? 'rtl' : 'ltr'));
      const flip = natural === 'rtl' ? 'ltr' : 'rtl';
      const sh = () => pu.evaluateHandle(() => document.getElementById('bw-ui-host').shadowRoot);
      await (await sh()).evaluate((r, d) => r.querySelector(`[data-a="dir"][data-d="${d}"]`).click(), flip);
      const st = await pu.evaluate(() => ({ ui: window.BW.S.ui, ed: window.BW.S.ed, shell: document.getElementById('bw-ui-host').shadowRoot.querySelector('.shell').dataset.tdir, doc: document.querySelector('main.bw-doc').dir, saved: localStorage.getItem('bw:dir') }));
      await pu.reload();
      await pu.waitForFunction(() => window.BW?.ready);
      // wait on the outcome (the remembered direction applied), then report what the reopened page holds
      await pu.waitForFunction((d) => document.querySelector('main.bw-doc')?.dir === d, flip, { timeout: 5000 }).catch(() => {});
      const after = await pu.evaluate(() => ({ kept: document.querySelector('main.bw-doc').dir, S: window.BW.S.dir, ls: localStorage.getItem('bw:dir') }));
      const kept = after.kept;
      check(`${uiL} UI: direction toggles independently of the language and is remembered`, st.ui === uiL && st.shell === flip && st.doc === flip && st.saved === flip && kept === flip, JSON.stringify({ ...st, ...after }));
      await (await sh()).evaluate((r, d) => r.querySelector(`[data-a="dir"][data-d="${d}"]`).click(), natural);
    }
    // command palette: Ctrl+K, filter, Enter runs
    await pu.keyboard.press('Control+K');
    await pu.locator('.palette input').fill(uiL === 'ar' ? 'المخطط' : 'outline');
    await pu.keyboard.press('Enter');
    const drawer = await pu.evaluate(() => window.BW.S.drawer);
    check(`${uiL} UI: command palette filters and runs (Ctrl+K)`, drawer === 'outline', String(drawer));
    await pu.keyboard.press('Escape');
    // add a logo (re-encoded), drag it on the cover, the position is remembered (autosave → reopen) and printed
    const [chL] = await Promise.all([pu.waitForEvent('filechooser'), act(pu, 'logo')]);
    await chL.setFiles(pngFile);
    await pu.waitForFunction(() => (window.BW.M['event-permit'][window.BW.S.ed].doc.overlays || []).length > 0, null, { timeout: 5000 }).catch(() => {});
    const ov = pu.locator('main.bw-doc .bw-ov').first();
    await ov.waitFor();
    const o0 = await pu.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].doc.overlays[0]);
    check(`${uiL} UI: logo re-encoded, metadata stripped`, /^data:image\/png;base64,/.test(o0.src) && !Buffer.from(o0.src.split(',')[1], 'base64').includes('secret-camera-owner'), o0.src.slice(0, 40));
    await ov.scrollIntoViewIfNeeded();
    const bx = await ov.boundingBox();
    await pu.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2);
    await pu.mouse.down();
    await pu.mouse.move(bx.x + bx.width / 2 - 120, bx.y + bx.height / 2 + 150, { steps: 10 });
    await pu.mouse.up();
    const o1 = await pu.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].doc.overlays[0]);
    const scale = await pu.evaluate(() => document.querySelector('main.bw-doc').getBoundingClientRect().width / 210);
    check(`${uiL} UI: logo dragged on the cover (mm position updated)`, o1.mode === 'cover' && Math.abs(o1.x - (o0.x - 120 / scale)) < 4 && Math.abs(o1.y - (o0.y + 150 / scale)) < 4, JSON.stringify({ x0: o0.x, y0: o0.y, x1: o1.x, y1: o1.y }));
    await pu.waitForFunction(() => !window.BW.S.pending);
    const pu2 = await ctxU.newPage();
    await pu2.goto(editorUrl);
    await pu2.waitForFunction(() => window.BW?.ready);
    await pu2.locator('.banner button').first().click({ timeout: 5000 }).catch(() => {});
    const o2 = await pu2.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].doc.overlays?.[0]);
    check(`${uiL} UI: logo position remembered after reopening`, !!o2 && o2.x === o1.x && o2.y === o1.y, JSON.stringify(o2 && { x: o2.x, y: o2.y }));
    // an inline image through the Image button
    await pu2.locator('main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]').click();
    const [chI] = await Promise.all([pu2.waitForEvent('filechooser'), act(pu2, 'image')]);
    await chI.setFiles(pngFile);
    await pu2.waitForFunction(() => window.BW.M['event-permit'][window.BW.S.ed].doc.chapters[0].sections[0].blocks.some((b) => b.kind === 'shots'), null, { timeout: 5000 }).catch(() => {});
    const kinds = await pu2.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].doc.chapters[0].sections[0].blocks.map((b) => b.kind));
    check(`${uiL} UI: image inserted after the selected block`, kinds.includes('shots'), JSON.stringify(kinds));
    // PDF + DOCX carry the logo at its position and the image
    const editsU = await download(pu2, () => act(pu2, 'save'));
    const ef = JSON.parse(fs.readFileSync(editsU, 'utf8'));
    const edU = ef.locale;
    const baseU = JSON.parse(fs.readFileSync(path.join(SAMPLE, `document.${edU}.json`), 'utf8'));
    const docU = applyOps(baseU, ef.ops);
    const pdfU = path.join(OUT, `overlay.${uiL}.pdf`);
    await exportPdf(docU, { locale: edU, theme: loadTheme(), pdfPath: pdfU, browser });
    const rects = JSON.parse(run(...py(['-c', 'import pymupdf,sys,json\nd=pymupdf.open(sys.argv[1]);mm=72/25.4;out=[]\nfor i,p in enumerate(d):\n  for im in p.get_images(full=True):\n    for r in p.get_image_rects(im[0]): out.append([i+1,round(r.x0/mm,1),round(r.y0/mm,1),round(r.width/mm,1)])\nprint(json.dumps(out))', pdfU], ['pymupdf'])).out || '[]');
    const onCover = rects.find((r) => r[0] === 1);
    check(`${uiL} UI: logo printed on the cover at its exact position`, !!onCover && Math.abs(onCover[1] - o1.x) < 1 && Math.abs(onCover[2] - o1.y) < 1 && Math.abs(onCover[3] - o1.w) < 1, JSON.stringify({ onCover, want: [o1.x, o1.y, o1.w] }));
    check(`${uiL} UI: inserted image printed in the PDF`, rects.some((r) => r[0] > 1), JSON.stringify(rects));
    const docxU = exportDocx(docU, { locale: edU, theme: loadTheme(), docxPath: path.join(OUT, `overlay.${uiL}.docx`) }).docx;
    const xmlU = run(...py(['-c', 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(sum(z.read(n).decode("utf-8","ignore").count("<wp:anchor") for n in z.namelist() if n.endswith(".xml")), z.read("word/document.xml").decode().count("<pic:pic"))', docxU], [])).out.trim().split(/\s+/);
    check(`${uiL} UI: DOCX carries the logo as a positioned (anchored) picture and the image`, +xmlU[0] >= 1 && +xmlU[1] >= 1, xmlU.join(' '));
    // calm mode stops motion; reduced motion is honoured separately below
    await act(pu2, 'view');
    await act(pu2, 'calm');
    const calmState = await pu2.evaluate(() => ({ flag: document.documentElement.dataset.bwCalm, anim: getComputedStyle(document.getElementById('bw-ui-host').shadowRoot.querySelector('.island')).animationName, trans: getComputedStyle(document.getElementById('bw-ui-host').shadowRoot.querySelector('.b')).transitionDuration }));
    check(`${uiL} UI: calm mode turns motion off`, calmState.flag === '1' && calmState.anim === 'none' && /^0s/.test(calmState.trans), JSON.stringify(calmState));
    check(`${uiL} UI: no page errors in the shell flows`, errU.length === 0, errU.join(' | '));
    await ctxU.close();
  }
  // reduced motion and the brand mark's reveal
  const ctxM = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const pm = await ctxM.newPage();
  await pm.goto(editorUrl);
  const reveal = await pm.evaluate(() => new Promise((res) => { const s = document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.brand svg .ln') || document.getElementById('bw-ui-host')?.shadowRoot?.querySelector('.brand svg path'); const a = s ? getComputedStyle(s).strokeDashoffset : 'none'; setTimeout(() => res([a, s ? getComputedStyle(s).strokeDashoffset : 'none', s ? getComputedStyle(s).animationName : 'none']), 1400); }));
  const { brandMarks } = await import('../engine/build-editor.mjs');
  if (brandMarks().stub) skip('brand mark draws itself on load', 'brand/v3/logo/mark.svg not present (brand package not merged here)');
  else check('brand mark draws itself on load (animated SVG works inline)', reveal[2] !== 'none' && parseFloat(reveal[0]) > 0 && parseFloat(reveal[1]) === 0, JSON.stringify(reveal));
  await ctxM.close();
  const ctxR2 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 900 } });
  const pr2 = await ctxR2.newPage();
  await pr2.goto(editorUrl);
  await pr2.waitForFunction(() => window.BW?.ready);
  const rm2 = await pr2.evaluate(() => { const sh = document.getElementById('bw-ui-host').shadowRoot; return { island: getComputedStyle(sh.querySelector('.island')).animationName, mark: getComputedStyle(sh.querySelector('.brand svg .ln') || sh.querySelector('.brand svg path')).strokeDashoffset }; });
  check('reduced motion: the shell and the brand mark stay still', rm2.island === 'none' && parseFloat(rm2.mark) === 0, JSON.stringify(rm2));
  await ctxR2.close();
  // brand v3: the inline mark carries the "Cover" parts the chrome animates (DESIGN c.3), and brandCss() scopes the tokens
  if (brandMarks().stub) skip('brand mark: v3 part classes', 'brand/v3/logo/mark.svg not present');
  else {
    const parts = ['.sheet', '.spine', '.cap', '.ln.l1', '.ln.l2', '.rule'];
    const missing = parts.filter((c) => !new RegExp(`class="${c.slice(1).replace('.', ' ')}"`).test(brandMarks().mark));
    check('brand mark: v3 part classes (.sheet .spine .cap .ln.l1 .ln.l2 .rule)', missing.length === 0, missing.join(' '));
  }
  {
    const { brandCss } = await import('../engine/build-editor.mjs');
    const css = brandCss();
    const light = /:host, \.shell \{[^}]*--bw-bg: #fafaf9/.test(css);
    const dark = /\.shell\[data-theme="dark"\] \{[^}]*--bw-bg: #001e3d/.test(css);
    check('brandCss(): v3 tokens scoped to the shadow root (--bw-bg, no :root, light on :host/.shell, dark on .shell[data-theme="dark"], no global focus rule)',
      css.includes('--bw-bg') && !css.includes(':root') && light && dark && !/:where\(a, button/.test(css), JSON.stringify({ len: css.length, light, dark }));
  }
  // drawer reopened while it closes stays open (0.11.x fix kept: the pending hide is cancelled)
  {
    const ctxD = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const pd = await ctxD.newPage();
    await pd.goto(editorUrl);
    await pd.waitForFunction(() => window.BW?.ready);
    await pd.evaluate(() => window.BW.runAction('outline'));
    await pd.waitForTimeout(700);
    await pd.evaluate(() => window.BW.runAction('outline'));
    await pd.waitForTimeout(60);
    await pd.evaluate(() => window.BW.runAction('outline'));
    await pd.waitForTimeout(500);
    const st = await pd.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer'); return { hidden: d.hidden, closing: d.classList.contains('closing'), drawer: window.BW.S.drawer }; });
    check('drawer reopened during its close stays open', !st.hidden && !st.closing && st.drawer === 'outline', JSON.stringify(st));
    await ctxD.close();
  }

  // page thumbnails through the local server (pagination exists only when Chrome prints)
  const { serve } = await import('../engine/serve.mjs');
  const served = path.join(OUT, 'served.editor.html');
  buildEditor({ inputs: [SAMPLE], out: served, set: 'served', watermarkDir: null });
  const srv = await serve(served, 4399);
  try {
    const ctxT = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const pt = await ctxT.newPage();
    await pt.goto('http://127.0.0.1:4399/');
    await pt.waitForFunction(() => window.BW?.ready);
    await act(pt, 'pages');
    await pt.locator('.drawer .thumbs img').nth(8).waitFor({ timeout: 60000 }).catch(() => {});
    const thumbs = await pt.locator('.drawer .thumbs img').count();
    const status = await pt.locator('.drawer .out').textContent();
    check('page thumbnails (served): one per printed sheet', thumbs === 9, `${thumbs} thumbnails; ${status}`);
    const y0 = await pt.evaluate(() => window.scrollY);
    await pt.locator('.drawer .thumbs button[data-page="7"]').click();
    const jumped = await pt.waitForFunction((y0) => window.scrollY > y0 + 500, y0, { timeout: 10000 }).then(() => true, () => false);
    const why = jumped ? '' : JSON.stringify(await pt.evaluate(() => ({ y: window.scrollY, first: document.getElementById('bw-ui-host').shadowRoot.querySelector('.thumbs button[data-page="7"]')?.dataset.first })));
    check('page thumbnail click jumps to that page', jumped, why);
    await ctxT.close();
    // webhooks: off by default; a test-send reaches a local mock through the server; never fonts or the watermark
    const received = [];
    const mock = http.createServer((rq, rs) => { let b = ''; rq.on('data', (c) => { b += c; }); rq.on('end', () => { received.push(JSON.parse(b || '{}')); rs.writeHead(204); rs.end(); }); });
    await new Promise((ok) => mock.listen(4398, '127.0.0.1', ok));
    try {
      const ctxW = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      const pw = await ctxW.newPage();
      await pw.goto('http://127.0.0.1:4399/');
      await pw.waitForFunction(() => window.BW?.ready);
      await act(pw, 'webhooks');
      const offByDefault = await pw.locator('.drawer [data-hook="enabled"]').isChecked();
      await pw.locator('.drawer [data-hook="url"]').fill('http://127.0.0.1:4398/hook');
      await pw.locator('.drawer [data-hk="add"]').click();
      await pw.locator('.drawer [data-hook="enabled"]').check();
      await pw.locator('.drawer [data-hk="test"]').click();
      await pw.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer .log li.approved'), null, { timeout: 10000 }).catch(() => {});
      const t0 = received[0] || {};
      check('webhooks: off by default, test-send delivered to a local mock through the server', !offByDefault && t0.event === 'test' && t0.schema === 'bw-webhook' && t0.service === 'event-permit' && !!t0.timestamp && !('document' in t0), JSON.stringify(t0).slice(0, 200));
      const leak = JSON.stringify(received);
      check('webhooks: payload never carries fonts or the watermark', !/font-face|woff|ttf|bw-watermark|nj-avatar/i.test(leak));
      await act(pw, 'save').catch(() => {});
      await pw.waitForTimeout(1200);
      check('webhooks: Save sends a save event', received.some((x) => x.event === 'save'), received.map((x) => x.event).join(','));
      await ctxW.close();
    } finally {
      mock.close();
    }
  } finally {
    srv.close();
  }
} catch (e) {
  check('test run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
const ran = results.length - skips.length;
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${ran - failed}/${ran}${skips.length ? ` (${skips.length} skipped: ${HAVE_FONTS ? '' : 'no Thmanyah fonts'})` : ''}`);
fs.writeFileSync(path.join(OUT, 'results.txt'), results.join('\n') + '\n');
process.exit(failed ? 1 : 0);
