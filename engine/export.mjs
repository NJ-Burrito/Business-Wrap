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
import { renderDocument, chromeTemplates, relaxTallGroups, relaxArgs, PAGE, designTheme, confidentialText, uploadedFontCss } from './render.mjs';
import { applyOps, migrate } from './edits.mjs';
import { loadManifest, resolveFonts, fontFaceCss, systemFamily } from './fonts.mjs';
import { sfntFromBytes } from './fontinfo.mjs';
import { config } from './config.mjs';
import { DIAGRAM } from './diagram.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

export const i18n = () => JSON.parse(fs.readFileSync(path.join(HERE, 'i18n.json'), 'utf8'));

export function loadTheme(file) {
  const base = JSON.parse(fs.readFileSync(path.join(HERE, 'defaults', 'theme.json'), 'utf8'));
  // the house pack (design/ours, the original SRS palette) is the default theme; the stub is only a fallback
  const ours = path.join(REPO, 'design', 'ours', 'theme.json');
  if (!file && fs.existsSync(ours)) file = ours;
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

/** A file name stem that keeps every script readable (Arabic included): only path-hostile characters go. */
export const fileStem = (s) => String(s || 'document').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 80) || 'document';
/** Where the user started the command (npm runs scripts from the package folder; INIT_CWD keeps theirs). */
export const userCwd = () => process.env.INIT_CWD || process.cwd();

/** The print HTML — what the editor shows minus the editor layer. */
export function printHtml(doc, { locale, theme, embed = true }) {
  const { used } = fontsFor(designTheme(theme, doc));
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
    const chrome = chromeTemplates(doc, { theme, labels, locale, fontCss: fontFaceCss(used.filter((c) => [400, 700].includes(c.weight)), { embed: true }) + uploadedFontCss(doc), logos: theme.logos });
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
  const display = designTheme(theme, doc).fonts.display;
  // a machine font chosen for headings stamps the folios too, when it is a TrueType file that may be embedded
  const machine = (() => { const s = systemFamily(display); const f = s.bold || s.regular; return f && f.format === 'ttf' && f.outlines === 'truetype' && f.embeddable ? f : null; })();
  const folioFace = used.find((c) => c.family === display && c.weight === 700 && c.format === 'truetype') || used.find((c) => c.format === 'truetype') || machine;
  const anchor = confidentialText(doc, theme, labels, locale);
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

/** Each diagram block carries its drawing primitives for the DOCX builder (native Word shapes). */
export function withResolvedDiagrams(doc, theme, locale) {
  const label = i18n().doc[locale]?.figureNo || i18n().doc[locale]?.figure || '';
  const copy = JSON.parse(JSON.stringify(doc));
  for (const ch of copy.chapters || []) for (const sec of ch.sections || []) for (const b of sec.blocks || []) {
    if (b.kind !== 'diagram') continue;
    const r = DIAGRAM.resolve(b.model || {}, { theme, locale });
    b.resolved = { view: r.view, items: r.items.map(({ d, ...it }) => it) };
    b.figureLabel = label;
  }
  return copy;
}

const familyName = (f) => String(f || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
/**
 * The fonts a DOCX names and carries. House faces come from the font manifest, a font of this machine
 * from the system font folders, an uploaded font from the document itself (doc.design.fontFaces).
 * A face travels only when it is a TrueType file whose OS/2 fsType allows embedding; every face that
 * cannot travel gets a note {family, why: licence|cff|collection|format|missing} for the editor to show.
 */
export function docxFonts(doc, { theme, work, embed = true }) {
  const th = designTheme(theme, doc);
  const house = new Set(Object.keys(loadManifest().families));
  const text = familyName(th.fonts.text);
  const display = familyName(th.fonts.display) || text;
  const fams = [...new Set([text, display].filter(Boolean))];
  const cuts = [];
  const notes = [];
  const note = (family, why) => { if (!notes.some((n) => n.family === family && n.why === why)) notes.push({ family, why }); };
  const take = (family, weight, info, file) => {
    if (info?.format === 'ttc') return note(family, 'collection');
    if (!info || !['ttf', 'otf'].includes(info.format)) return note(family, 'format');
    if (info.outlines !== 'truetype') return note(family, 'cff');
    if (!info.embeddable) return note(family, 'licence');
    cuts.push({ family, weight, file });
  };
  for (const fam of fams) {
    if (house.has(fam)) { cuts.push(...fontsFor(th).used.filter((c) => c.family === fam && c.format === 'truetype').map((c) => ({ family: c.family, weight: c.weight, file: c.file }))); continue; }
    const up = (doc.design?.fontFaces || []).filter((f) => familyName(f.family) === fam && /^data:font\/\w+;base64,/.test(String(f.src || '')));
    if (up.length) {
      up.forEach((f, i) => {
        const bytes = Buffer.from(String(f.src).split(',')[1], 'base64');
        const file = path.join(work, `upload-${fams.indexOf(fam)}-${i}.ttf`);
        fs.writeFileSync(file, bytes);
        take(fam, +f.weight === 700 ? 700 : 400, sfntFromBytes(new Uint8Array(bytes)), file);
      });
      continue;
    }
    const sys = systemFamily(fam);
    if (!sys.found) { note(fam, 'missing'); continue; }
    take(fam, 400, sys.regular, sys.regular.file);
    if (sys.bold) take(fam, 700, sys.bold, sys.bold.file);
  }
  return { text, display, custom: fams.some((f) => !house.has(f)), cuts: embed ? cuts : [], notes: embed ? notes : notes.filter((n) => n.why === 'missing') };
}

/** DOCX replica through the copied builder (the edited JSON is written beside it first).
 * embedFonts (default true): the fonts that may travel go inside the file (word/fonts/*.odttf); fontNotes says which could not. */
export function exportDocx(doc, { locale, theme, docxPath, embedFonts = true }) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-docx-'));
  const plan = docxFonts(doc, { theme, work, embed: embedFonts });
  const cuts = plan.cuts;
  const docJson = path.join(work, 'document.json');
  const themeJson = path.join(work, 'theme.json');
  fs.writeFileSync(docJson, JSON.stringify(withResolvedDiagrams(doc, designTheme(theme, doc), locale)), 'utf8');
  fs.writeFileSync(themeJson, JSON.stringify(designTheme(theme, doc)), 'utf8');
  fs.mkdirSync(path.dirname(docxPath), { recursive: true });
  // the house pair keeps the builder's own Thmanyah naming; any other choice names the families as chosen
  const fontArgs = plan.custom ? ['--font', plan.text] : [];
  const r = spawnSync('uv', ['run', '--no-project', '--with', 'python-docx', '--with', 'lxml', 'python', path.join(HERE, 'docx', 'build_docx.py'), docJson, docxPath, '--workdir', work, ...fontArgs], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', BW_CHROME: chromePath() || '', BW_LOCALE: locale, BW_THEME: themeJson, BW_EMBED_FONTS: cuts.length ? JSON.stringify(cuts) : '', BW_DISPLAY_FONT: plan.custom ? plan.display : '' },
  });
  fs.rmSync(work, { recursive: true, force: true });
  if (r.status !== 0) throw new Error(`docx build failed: ${(r.stderr || r.stdout).slice(-2000)}`);
  return { docx: docxPath, log: r.stdout.trim(), fontNotes: plan.notes };
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
    console.error('usage: node engine/export.mjs --doc <document.json> [--edits e.json] [--locale ar|en] [--theme t.json] [--out dir] [--no-docx] [--no-embed-fonts]');
    process.exit(2);
  }
  const doc = loadEdited(path.resolve(userCwd(), a.doc), a.edits && path.resolve(userCwd(), a.edits));
  const locale = a.locale || (/\.en\.json$/.test(a.doc) ? 'en' : 'ar');
  const theme = loadTheme(a.theme);
  // beside the user's document (or --out), never inside this repository
  const out = path.resolve(userCwd(), a.out || path.join(path.dirname(path.resolve(userCwd(), a.doc)), 'exports', locale));
  const stem = `${fileStem(doc.service)}.${locale}`;
  if (a['html-only']) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, `${stem}.print.html`), printHtml(doc, { locale, theme }).html);
    console.log(path.join(out, `${stem}.print.html`));
  } else {
    const r = await exportPdf(doc, { locale, theme, pdfPath: path.join(out, `${stem}.pdf`) });
    console.log(`PDF  ${r.pdf}  (${r.post})`);
    if (!a['no-docx']) console.log(`DOCX ${exportDocx(doc, { locale, theme, docxPath: path.join(out, `${stem}.docx`), embedFonts: !a['no-embed-fonts'] }).docx}`);
  }
}
