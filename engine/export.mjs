// Export a (possibly edited) document JSON to PDF + DOCX.
//
//   node engine/export.mjs --doc <document.json> [--edits <edits.json>] [--locale ar|en]
//                          [--theme <theme.json>] [--out <dir>] [--no-docx] [--html-only]
//
// The PDF is printed by headless Chrome from the SAME markup the editor shows
// (engine/render.mjs). The DOCX goes through engine/docx/build_docx.py, a copy
// of the source pipeline's builder, reading the edited document JSON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDocument, chromeTemplates, relaxTallGroups, relaxArgs, PAGE } from './render.mjs';
import { applyOps, migrate } from './edits.mjs';
import { loadManifest, resolveFonts, fontFaceCss } from './fonts.mjs';
import { config } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

export const i18n = () => JSON.parse(fs.readFileSync(path.join(HERE, 'i18n.json'), 'utf8'));

export function loadTheme(file) {
  const base = JSON.parse(fs.readFileSync(path.join(HERE, 'defaults', 'theme.json'), 'utf8'));
  if (!file) return base;
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { ...base, ...t, vars: { ...base.vars, ...(t.vars || {}) }, fonts: { ...base.fonts, ...(t.fonts || {}) }, sizes: { ...base.sizes, ...(t.sizes || {}) }, brand: { ...base.brand, ...(t.brand || {}) }, logos: { ...base.logos, ...(t.logos || {}) } };
}

export function chromePath() {
  const c = [config().chrome, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'];
  return c.find((p) => p && fs.existsSync(p));
}

/** Chrome launch options. Linux CI runners forbid the user-namespace sandbox. */
export const launchOptions = () => ({ headless: true, executablePath: chromePath(), args: process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [] });

export function fontsFor(theme) {
  const manifest = loadManifest();
  const { cuts, missing } = resolveFonts(manifest);
  const families = [theme.fonts.text, theme.fonts.display].filter(Boolean);
  const used = cuts.filter((c) => families.includes(c.family));
  return { manifest, cuts, used, missing: missing.filter((m) => families.some((f) => m.startsWith(f))) };
}

/** The print HTML — what the editor shows minus the editor layer. */
export function printHtml(doc, { locale, theme, embed = true }) {
  const { used } = fontsFor(theme);
  const fontCss = fontFaceCss(used, { embed });
  const labels = i18n().doc[locale];
  return { html: renderDocument(doc, { locale, labels, theme, fontCss, logos: theme.logos }), fontCss, labels, used };
}

let playwright;
async function chromium() {
  playwright ??= await import(pathToFileURL(path.join(REPO, 'node_modules', 'playwright-core', 'index.mjs')).href);
  return playwright.chromium;
}

/** Prints doc → pdfPath. Returns {pdf, pages}. A tagged, header/footer PDF like the source. */
export async function exportPdf(doc, { locale, theme, pdfPath, browser: shared }) {
  const { html, fontCss, labels, used } = printHtml(doc, { locale, theme, embed: true });
  const tmp = path.join(os.tmpdir(), `bw-print-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const browser = shared || (await (await chromium()).launch(launchOptions()));
  try {
    const page = await browser.newPage({ viewport: { width: PAGE.measurePx, height: PAGE.contentPx } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(relaxTallGroups, relaxArgs());
    const chrome = chromeTemplates(doc, { theme, labels, fontCss: fontFaceCss(used.filter((c) => [400, 700].includes(c.weight)), { embed: true }), logos: theme.logos });
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      tagged: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: chrome.header,
      footerTemplate: chrome.footer,
    });
    await page.close();
  } finally {
    if (!shared) await browser.close();
    fs.rmSync(tmp, { force: true });
  }
  const folioFace = used.find((c) => c.family === theme.fonts.display && c.weight === 700 && c.format === 'truetype') || used.find((c) => c.format === 'truetype');
  const anchor = theme.brand?.confidential || labels.confidential;
  const r = spawnSync('python', [path.join(HERE, 'pdf_post.py'), pdfPath, folioFace?.file || '', anchor, locale === 'ar' ? 'rtl' : 'ltr'], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (r.status !== 0) throw new Error(`pdf post-processing failed: ${r.stderr || r.stdout}`);
  return { pdf: pdfPath, post: r.stdout.trim() };
}

/**
 * Page thumbnails: the real pagination only exists when Chrome prints, so the
 * document is printed (same path as the PDF export) and each sheet rasterised.
 * Returns [{n, png (data URI), first (first text line), wide}].
 */
export async function pageThumbs(doc, { locale, theme, dpi = 36 }) {
  const pdfPath = path.join(os.tmpdir(), `bw-thumbs-${process.pid}-${Date.now()}.pdf`);
  try {
    await exportPdf(doc, { locale, theme, pdfPath });
    const py = [
      'import pymupdf, sys, json, base64',
      'd = pymupdf.open(sys.argv[1]); out = []',
      'for i, p in enumerate(d):',
      '    pix = p.get_pixmap(dpi=int(sys.argv[2]))',
      '    top = pymupdf.Rect(0, 18 * 72 / 25.4, p.rect.width, p.rect.height - 16 * 72 / 25.4)',
      '    lines = [l.strip() for l in p.get_text("text", clip=top).splitlines() if l.strip()]',
      '    out.append({"n": i + 1, "png": "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode(), "first": " | ".join(lines[:3]), "wide": p.rect.width > p.rect.height})',
      'sys.stdout.write(json.dumps(out))',
    ].join('\n');
    const r = spawnSync('python', ['-c', py, pdfPath, String(dpi)], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } });
    if (r.status !== 0) throw new Error(`thumbnails failed: ${r.stderr}`);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(pdfPath, { force: true });
  }
}

/** DOCX through the copied builder. Writes the edited JSON beside it first. */
export function exportDocx(doc, { locale, theme, docxPath }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-docx-'));
  const docJson = path.join(work, 'document.json');
  const themeJson = path.join(work, 'theme.json');
  fs.writeFileSync(docJson, JSON.stringify(doc), 'utf8');
  fs.writeFileSync(themeJson, JSON.stringify(theme), 'utf8');
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  const r = spawnSync('uv', ['run', '--no-project', '--with', 'python-docx', '--with', 'lxml', 'python', path.join(HERE, 'docx', 'build_docx.py'), docJson, docxPath, '--workdir', work], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', BW_CHROME: chromePath() || '', BW_LOCALE: locale, BW_THEME: themeJson },
  });
  fs.rmSync(work, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`docx build failed: ${(r.stderr || r.stdout).slice(-2000)}`);
  return { docx: docxPath, log: r.stdout.trim() };
}

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[k.slice(2)] = true;
    else { a[k.slice(2)] = next; i += 1; }
  }
  return a;
}

export function loadEdited(docFile, editsFile) {
  let doc = JSON.parse(fs.readFileSync(docFile, 'utf8'));
  if (editsFile) doc = applyOps(doc, migrate(JSON.parse(fs.readFileSync(editsFile, 'utf8'))).ops);
  return doc;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.doc) {
    console.error('usage: node engine/export.mjs --doc <document.json> [--edits e.json] [--locale ar|en] [--theme t.json] [--out dir] [--no-docx]');
    process.exit(2);
  }
  const doc = loadEdited(a.doc, a.edits);
  const locale = a.locale || (/\.en\.json$/.test(a.doc) ? 'en' : 'ar');
  const theme = loadTheme(a.theme);
  const out = path.resolve(a.out || path.join(REPO, 'out', doc.service || 'document', locale));
  const stem = `${doc.service || 'document'}.${locale}`;
  if (a['html-only']) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${stem}.print.html`), printHtml(doc, { locale, theme }).html);
    console.log(path.join(out, `${stem}.print.html`));
  } else {
    const r = await exportPdf(doc, { locale, theme, pdfPath: path.join(out, `${stem}.pdf`) });
    console.log(`PDF  ${r.pdf}  (${r.post})`);
    if (!a['no-docx']) console.log(`DOCX ${exportDocx(doc, { locale, theme, docxPath: path.join(out, `${stem}.docx`) }).docx}`);
  }
}
