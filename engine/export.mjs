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
import { spawn, spawnSync } from 'node:child_process';
import { py } from './py.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderDocument, chromeTemplates, relaxTallGroups, relaxArgs, PAGE, pageGeom, pageModel, folioOf, designTheme, confidentialText, uploadedFontCss, faceWeights } from './render.mjs';
import { applyOps, migrate, normaliseNumbers } from './edits.mjs';
import { assertBase } from './edits-base.mjs';
import { loadManifest, resolveFonts, fontFaceCss, systemFamily, normaliseFont, ttfDataUri } from './fonts.mjs';
import { config } from './config.mjs';
import { DIAGRAM } from './diagram.mjs';
import { workspace, ensure, uniquePath, outName, docTitle, noteOutput, localDir } from './workspace.mjs'; // the default output folder of the command line (a cycle by design: used inside functions only)

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

/* ── Browsers (0.15.9 B1-B6, A1) ───────────────────────────────────────────────────────────────────────────────────
 * One place knows which browsers exist, which one is the standard and which one the OS default is. Google Chrome is the standard; the
 * editor's window and the PDF engine both walk the same chain (below). Opera, Opera GX, Brave, Vivaldi, Chrome, Edge and Chromium are
 * Chromium: launched with the app's own profile and the keep-awake flags. Any other default (Firefox, Safari) is opened with the OS opener. */
const FEATURES = {
  // Chromium's own names, then each vendor's sleep / snooze / hibernate / discard feature. A name a build does not know is ignored, never an error.
  // [A] only the Chrome behaviour is measured here (tests/awake-0159.test.mjs); the other vendors' names are best known, unverified.
  all: ['CalculateNativeWinOcclusion', 'IntensiveWakeUpThrottling', 'TabFreeze', 'BackgroundTabFreezing', 'AutomaticTabDiscarding', 'ProactiveTabFreezeAndDiscard', 'FreezeBackgroundTabs', 'HighEfficiencyModeAvailable', 'HighEfficiencyMultistateMode', 'MemorySaverMultistateMode', 'DiscardsUI', 'PerformanceInterventionUI', 'PerformanceControlsPerformanceSurvey'],
  chrome: ['TabDiscarding', 'MemorySaver', 'MemorySaverModeAvailable', 'BatterySaverModeAvailable'],
  edge: ['SleepingTabs', 'msSleepingTabs', 'msEdgeSleepingTabs', 'msPerformanceDetector', 'EdgeSleepingTabs'],
  opera: ['OperaTabSnoozing', 'TabSnoozing', 'TabSnooze', 'OperaTabFreezing'],
  operagx: ['GXTabSnoozing', 'GXTabSnooze', 'OperaTabSnoozing', 'TabSnoozing', 'TabSnooze', 'GXBrowserSleep', 'GXHotTabsKiller'],
  brave: ['BraveSleepingTabs', 'BraveTabHibernation'],
  vivaldi: ['VivaldiTabHibernation', 'TabHibernation'],
  chromium: [],
};
const roots = () => [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
const winApp = (...parts) => roots().map((d) => path.join(d, ...parts));
/** id, display name, the pattern that recognises its executable path, where it lives. Order = the order "any Chromium found" tries after Chrome and Edge. */
export const BROWSERS = [
  { id: 'chrome', name: 'Google Chrome', rx: /google[\\/ ]chrome|google-chrome/i, win: () => winApp('Google', 'Chrome', 'Application', 'chrome.exe'), mac: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'], lin: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'], bundle: 'com.google.chrome' },
  { id: 'edge', name: 'Microsoft Edge', rx: /msedge|microsoft[\\/ ]edge|microsoft-edge/i, win: () => winApp('Microsoft', 'Edge', 'Application', 'msedge.exe'), mac: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'], lin: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'], bundle: 'com.microsoft.edgemac' },
  { id: 'operagx', name: 'Opera GX', rx: /opera[ _-]?gx/i, win: () => winApp('Programs', 'Opera GX', 'opera.exe'), mac: ['/Applications/Opera GX.app/Contents/MacOS/Opera'], lin: [], bundle: 'com.operasoftware.operagx' },
  { id: 'opera', name: 'Opera', rx: /opera/i, win: () => winApp('Programs', 'Opera', 'opera.exe').concat(winApp('Opera', 'opera.exe')), mac: ['/Applications/Opera.app/Contents/MacOS/Opera'], lin: ['/usr/bin/opera'], bundle: 'com.operasoftware.opera' },
  { id: 'brave', name: 'Brave', rx: /brave/i, win: () => winApp('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), mac: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'], lin: ['/usr/bin/brave-browser', '/usr/bin/brave'], bundle: 'com.brave.browser' },
  { id: 'vivaldi', name: 'Vivaldi', rx: /vivaldi/i, win: () => winApp('Vivaldi', 'Application', 'vivaldi.exe'), mac: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'], lin: ['/usr/bin/vivaldi', '/usr/bin/vivaldi-stable'], bundle: 'com.vivaldi.vivaldi' },
  { id: 'chromium', name: 'Chromium', rx: /chromium/i, win: () => winApp('Chromium', 'Application', 'chrome.exe'), mac: ['/Applications/Chromium.app/Contents/MacOS/Chromium'], lin: ['/usr/bin/chromium', '/usr/bin/chromium-browser'], bundle: 'org.chromium.chromium' },
];
const NON_CHROMIUM = [{ id: 'firefox', name: 'Firefox', rx: /firefox/i, bundle: 'org.mozilla.firefox' }, { id: 'safari', name: 'Safari', rx: /safari/i, bundle: 'com.apple.safari' }];
const nameOf = (id) => [...BROWSERS, ...NON_CHROMIUM].find((b) => b.id === id)?.name || id;
/** Which browser an executable path (or a macOS bundle id) is: a BROWSERS id, a NON_CHROMIUM id, or 'other' (an unknown default is never assumed to be Chromium). */
export function classifyBrowser(exe) {
  const x = String(exe || '');
  const hit = [...BROWSERS, ...NON_CHROMIUM].find((b) => b.rx.test(x) || (b.bundle && b.bundle === x.toLowerCase()));
  return hit ? hit.id : 'other';
}
export const isChromium = (id) => BROWSERS.some((b) => b.id === id);
/** The keep-awake feature names for one browser (A1): Chromium's own plus that vendor's sleep / snooze names. No id = every vendor's. */
export const featureNames = (id) => [...new Set([...FEATURES.all, ...(id ? FEATURES[id] || [] : Object.values(FEATURES).flat())])];
/** {id: executable} of every Chromium browser installed (BW_EDGE, an old setup's variable, still names Edge's executable). */
export function installedBrowsers(env = process.env) {
  const out = {};
  const plat = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'lin';
  for (const b of BROWSERS) {
    const c = plat === 'win' ? b.win() : b[plat];
    const hit = (b.id === 'edge' && env.BW_EDGE ? [env.BW_EDGE] : []).concat(c).find((f) => f && fs.existsSync(f));
    if (hit) out[b.id] = hit;
  }
  return out;
}
function reg(key, name) {
  const r = spawnSync('reg', ['query', key, ...(name ? ['/v', name] : ['/ve'])], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? (/REG_\w+\s+(.+?)\s*$/m.exec(String(r.stdout || ''))?.[1] || '') : '';
}
/** The OS default web browser's executable (a bundle id on macOS), or '' when it cannot be read. Windows: the http UserChoice ProgId resolved to its open command.
 *  Read only: nothing is ever written to the registry or to an OS default. [A] the macOS and Linux branches are not tested here. */
export function osDefaultBrowser() {
  try {
    if (process.platform === 'win32') {
      const prog = reg('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice', 'ProgId');
      if (!prog) return '';
      const m = /^"([^"]+)"|^(\S+\.exe)/i.exec(reg(`HKCR\\${prog}\\shell\\open\\command`));
      return m ? m[1] || m[2] : prog;
    }
    if (process.platform === 'darwin') {
      const r = spawnSync('defaults', ['read', 'com.apple.LaunchServices/com.apple.launchservices.secure', 'LSHandlers'], { encoding: 'utf8' });
      const b = String(r.stdout || '').split(/\}\s*,?\s*\{?/).find((x) => /LSHandlerURLScheme\s*=\s*"?https?"?;/.test(x));
      return /LSHandlerRoleAll\s*=\s*"?([\w.-]+)"?;/.exec(b || '')?.[1] || '';
    }
    return String(spawnSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8' }).stdout || '').trim();
  } catch { return ''; }
}
export const choiceFile = () => path.join(localDir(), 'browser.json');
/** The Settings choice saved in .local/browser.json: 'default' (the OS default), a BROWSERS id, or '' (the standard order). */
export function savedBrowser() { try { const b = JSON.parse(fs.readFileSync(choiceFile(), 'utf8')).browser; return typeof b === 'string' ? b : ''; } catch { return ''; } }
export function saveBrowser(choice) {
  if (!(choice === '' || choice === 'default' || BROWSERS.some((b) => b.id === choice))) throw Object.assign(new Error('browser'), { code: 400 });
  fs.mkdirSync(localDir(), { recursive: true });
  fs.writeFileSync(choiceFile(), JSON.stringify({ browser: choice }));
  return choice;
}
/** BW_BROWSER_PROBE='{"installed":{"chrome":"<path>"},"defaultExe":"<path>"}' replaces the machine probe (tests only). */
function probe() {
  if (process.env.BW_BROWSER_PROBE) { try { const p = JSON.parse(process.env.BW_BROWSER_PROBE); return { installed: p.installed || {}, defaultExe: p.defaultExe || '' }; } catch { /* a bad probe is no probe */ } }
  return { installed: installedBrowsers(), defaultExe: osDefaultBrowser() };
}
/** One browser by id, 'default' (the OS default) or an explicit path, as {id, name, exe, chromium}; null when it is not there. */
function resolveOne(want, { installed, defaultExe }) {
  if (!want) return null;
  if (want === 'default') {
    if (!defaultExe) return null;
    const id = classifyBrowser(defaultExe);
    if (isChromium(id)) { const exe = installed[id] || (fs.existsSync(defaultExe) ? defaultExe : ''); return exe ? { id, name: nameOf(id), exe, chromium: true } : null; }
    return { id, name: id === 'other' ? path.basename(String(defaultExe)) : nameOf(id), exe: defaultExe, chromium: false };
  }
  if (isChromium(want)) return installed[want] ? { id: want, name: nameOf(want), exe: installed[want], chromium: true } : null;
  if (/[\\/]/.test(want) && fs.existsSync(want)) { const id = classifyBrowser(want); return { id, name: nameOf(id), exe: want, chromium: isChromium(id) || id === 'other' }; } // a path the owner named: Chromium unless it is a known other engine
  return null;
}
/** The browser the editor opens in, B1: BW_BROWSER, then the saved Settings choice, then Google Chrome, then the OS default, then Edge, then any Chromium.
 *  Returns {id, name, exe, chromium, via} or null; `via` names the step that decided. Inputs can be passed in (tests). Never changes an OS default. */
export function chooseBrowser({ env = process.env, saved = savedBrowser(), machine = probe() } = {}) {
  for (const [via, want] of [['env', env.BW_BROWSER], ['saved', saved], ['chrome', 'chrome'], ['default', 'default'], ['edge', 'edge']]) { const r = resolveOne(want, machine); if (r) return { ...r, via }; }
  for (const b of BROWSERS) { const r = resolveOne(b.id, machine); if (r) return { ...r, via: 'any' }; }
  return null;
}
/** The Chromium that prints the PDF, B5: BW_CHROME / .local/config.json, then the editor's chain (Chrome, the default if Chromium, Edge, any Chromium). */
export function chromePath(machine = probe()) {
  const own = config().chrome;
  if (own && fs.existsSync(own)) return own;
  for (const want of ['chrome', 'default', 'edge']) { const r = resolveOne(want, machine); if (r?.chromium && r.id !== 'other') return r.exe; }
  for (const b of BROWSERS) if (machine.installed[b.id]) return machine.installed[b.id];
  return undefined;
}
/** The message when no Chromium browser exists, in the user's language (ar | en). */
export const noBrowserMessage = (lang = 'en') => (lang === 'ar'
  ? 'لم يُعثر على متصفح Chromium. ثبّت Google Chrome (الموصى به) أو حدّد المتصفح بالمتغير BW_CHROME.'
  : 'No Chromium browser found. Install Google Chrome (recommended) or point BW_CHROME at one.');

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

const familyName = (f) => String(f || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim();
// scratch for normalised font copies and print pages; BW_FONT_NORM_DIR lets a test own its sub-folder (read at call time)
const outTmp = () => process.env.BW_FONT_NORM_DIR || path.join(REPO, 'out', 'font-norm'); // dev scratch in the git-ignored out/ (removed after use)

/**
 * The chosen fonts outside the house pair, ready to print and embed as real text (owner decision
 * 2026-10-28): every face normalised to TrueType with fsType 0 (engine/fonts.mjs normaliseFont).
 * Returns {doc: the document with its uploaded faces normalised, css: @font-face for the machine fonts,
 * faces: [{family, weight, bytes}], missing: [family]}.
 */
export function chosenFonts(doc, theme) {
  const th = designTheme(theme, doc);
  const house = new Set(Object.keys(loadManifest().families));
  const fams = [...new Set([familyName(th.fonts.text), familyName(th.fonts.display) || familyName(th.fonts.text)].filter(Boolean))].filter((f) => !house.has(f));
  const faces = [];
  const missing = [];
  const out = JSON.parse(JSON.stringify(doc));
  const uploaded = out.design?.fontFaces || [];
  for (const f of uploaded) {
    const m = /^data:font\/\w+;base64,(.+)$/.exec(String(f.src || ''));
    if (!m) continue;
    const bytes = normaliseFont(Buffer.from(m[1], 'base64'));
    Object.assign(f, { src: ttfDataUri(bytes), format: 'ttf', outlines: 'truetype' });
    if (fams.includes(familyName(f.family))) faces.push({ family: familyName(f.family), weight: +f.weight === 700 ? 700 : 400, bytes });
  }
  // faux bold (0.10.0): an uploaded family with no bold face gets a synthetic Bold, so bold text stays bold and real text
  for (const fam of fams) {
    const own = uploaded.filter((f) => familyName(f.family) === fam);
    const reg = own.find((f) => +f.weight !== 700);
    if (!reg || own.some((f) => +f.weight === 700)) continue;
    const bytes = normaliseFont(Buffer.from(reg.src.split(',')[1], 'base64'), 0, { embolden: true });
    uploaded.push({ family: reg.family, weight: 700, src: ttfDataUri(bytes), format: 'ttf', outlines: 'truetype', synthetic: true });
    faces.push({ family: fam, weight: 700, bytes });
  }
  let css = '';
  for (const fam of fams) {
    if (uploaded.some((f) => familyName(f.family) === fam)) continue;
    const sys = systemFamily(fam);
    if (!sys.found) { missing.push(fam); continue; }
    // no bold face: a synthetic Bold from the regular one (faux bold that stays real text, 0.10.0)
    const bold = sys.bold || (sys.regular && { ...sys.regular, embolden: true });
    for (const [face, weight] of [[sys.regular, 400], [bold, 700]]) {
      if (!face) continue;
      const bytes = normaliseFont(fs.readFileSync(face.file), face.index || 0, { embolden: !!face.embolden });
      faces.push({ family: fam, weight, bytes });
      css += `@font-face{font-family:'${fam}';font-style:normal;font-weight:${faceWeights(weight, !!bold)};font-display:block;src:url(${ttfDataUri(bytes)}) format('truetype');}\n`;
    }
  }
  return { doc: out, css, faces, missing };
}

/** The print HTML — what the editor shows minus the editor layer. */
export function printHtml(docIn, { locale, theme, embed = true }) {
  const chosen = chosenFonts(docIn, theme);
  const doc = chosen.doc;
  const { used } = fontsFor(designTheme(theme, doc));
  const fontCss = fontFaceCss(used, { embed }) + '\n' + chosen.css;
  const labels = i18n().doc[locale];
  return { html: renderDocument(doc, { locale, labels, theme, fontCss, logos: theme.logos }), fontCss, labels, used, chosen };
}

let playwright;
/** playwright-core from this install's own node_modules (a clone, the plugin folder), else by normal resolution
 *  (an npm or npx install hoists dependencies beside the package, not inside it). */
export async function loadPlaywright() {
  if (playwright) return playwright;
  const local = path.join(REPO, 'node_modules', 'playwright-core', 'index.mjs');
  playwright = await import(fs.existsSync(local) ? pathToFileURL(local).href : 'playwright-core');
  return playwright;
}
async function chromium() {
  return (await loadPlaywright()).chromium;
}

/** 0.15.0 (F5): a diagram model → PNG through the same headless Chrome the PDF uses (no new dependency), Thmanyah embedded.
 *  scale = device pixel ratio (2 = 2x). Returns {png, width, height, legibility}. */
export async function renderDiagramPng(model, { theme, locale = 'ar', scale = 2, pngPath, browser: shared, frameMm } = {}) {
  const th = designTheme(theme || loadTheme(), {});
  const svg = DIAGRAM.render(model, { theme: th, locale });
  const view = DIAGRAM.resolve(model, { theme: th, locale }).view;
  const { used } = fontsFor(th);
  const css = fontFaceCss(used.filter((c) => [400, 500, 600, 700].includes(c.weight)), { embed: true });
  const html = `<!doctype html><meta charset="utf-8"><style>${css}html,body{margin:0;background:#fff}svg{display:block}</style>${svg}`;
  const browser = shared || (await (await chromium()).launch(launchOptions()));
  try {
    const width = Math.ceil(view.w);
    const height = Math.ceil(view.h);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    fs.mkdirSync(path.dirname(pngPath), { recursive: true });
    await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width, height } });
    await page.close();
    return { png: pngPath, width: width * scale, height: height * scale, legibility: DIAGRAM.legibility(model, { theme: th, locale, ...(frameMm ? { frameMm } : {}) }) };
  } finally {
    if (!shared) await browser.close();
  }
}

/** One warning line per diagram block that would print too small or with overlapping text (warn, never block). */
export function diagramWarnings(doc, { theme, locale = 'ar', frameMm, minPt } = {}) {
  const out = [];
  const th = designTheme(theme || loadTheme(), doc);
  (doc.chapters || []).forEach((ch, ci) => (ch.sections || []).forEach((sec, si) => (sec.blocks || []).forEach((b, bi) => {
    if (b.kind !== 'diagram' || !b.model) return;
    const r = DIAGRAM.legibility(b.model, { theme: th, locale, ...(frameMm ? { frameMm } : {}), ...(minPt ? { minPt } : {}) });
    if (!r.ok) out.push(`diagram /chapters/${ci}/sections/${si}/blocks/${bi}: ${r.small.length ? `text prints at ${r.minPtPrinted} pt (below ${r.minPt}); ` : ''}${r.overlaps.length ? `${r.overlaps.length} overlap(s)` : ''}`.replace(/; $/, ''));
  })));
  return out;
}

/** Prints doc → pdfPath. Returns {pdf, pages}. A tagged, header/footer PDF like the source.
 *  0.16.0 (field notes item 8): the file is written under a temporary name in the same folder and renamed to pdfPath only when it is final (printed, spliced, post-processed),
 *  so no half-finished file (a header on the cover) is ever seen under the real name, and a failed run leaves nothing behind. */
export async function exportPdf(doc, { locale, theme, pdfPath, browser: shared }) {
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  const work = path.join(path.dirname(pdfPath), `.${path.basename(pdfPath, '.pdf')}.${process.pid}.${Date.now().toString(36)}.part.pdf`);
  try {
    const r = await exportPdfWork(doc, { locale, theme, pdfPath: work, browser: shared });
    fs.renameSync(work, pdfPath);
    return { ...r, pdf: pdfPath };
  } catch (e) { fs.rmSync(work, { force: true }); throw e; }
}
async function exportPdfWork(doc, { locale, theme, pdfPath, browser: shared }) {
  const { html, fontCss, labels, used, chosen } = printHtml(doc, { locale, theme, embed: true });
  // the print page carries the normalised font copies: it lives in the gitignored out/ and is removed after
  fs.mkdirSync(outTmp(), { recursive: true });
  const tmp = path.join(outTmp(), `bw-print-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tmp, html, 'utf8');
  const browser = shared || (await (await chromium()).launch(launchOptions()));
  try {
    const geo = doc.layout?.page ? pageGeom(doc) : PAGE;
    const page = await browser.newPage({ viewport: { width: geo.measurePx, height: geo.contentPx } });
    await page.emulateMedia({ media: 'print' });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(relaxTallGroups, doc.layout?.page ? relaxArgs(doc) : relaxArgs());
    const chromeOpt = { theme, labels, locale, fontCss: fontFaceCss(used.filter((c) => [400, 700].includes(c.weight)), { embed: true }) + chosen.css + uploadedFontCss(chosen.doc), logos: theme.logos };
    const chrome = chromeTemplates(doc, chromeOpt);
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    const print = (file, c, pageRanges) => page.pdf({
      path: file,
      preferCSSPageSize: true,
      tagged: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: c.header,
      footerTemplate: c.footer,
      ...(pageRanges ? { pageRanges } : {}),
    });
    await print(pdfPath, chrome);
    await scopedChrome(doc, pdfPath, (file, seg, pages) => print(file, chromeTemplates(doc, chromeOpt, seg), pages));
    await page.close();
  } finally {
    if (!shared) await browser.close();
    fs.rmSync(tmp, { force: true });
  }
  const display = designTheme(theme, doc).fonts.display;
  // a chosen heading font stamps the folios too, as its normalised TrueType copy (written to out/, removed after)
  let folioTmp = '';
  const pick = chosen.faces.find((f) => f.family === familyName(display) && f.weight === 700) || chosen.faces.find((f) => f.family === familyName(display));
  if (pick) { fs.mkdirSync(outTmp(), { recursive: true }); folioTmp = path.join(outTmp(), `folio-${process.pid}-${Date.now()}.ttf`); fs.writeFileSync(folioTmp, pick.bytes); }
  const folioFace = used.find((c) => c.family === display && c.weight === 700 && c.format === 'truetype') || (folioTmp && { file: folioTmp }) || used.find((c) => c.format === 'truetype');
  const anchor = confidentialText(doc, theme, labels, locale);
  const folio = folioOf(doc, locale);
  // 0.16.0: asynchronous, so the host keeps answering its health route and its tabs while the post-processing runs (a blocked event loop made a busy host look dead)
  const r = await spawnAsync(...py([path.join(HERE, 'pdf_post.py'), pdfPath, folioFace?.file || '', anchor, locale === 'ar' ? 'rtl' : 'ltr', ...(doc.chrome ? [folio ? `${folio.side}:${folio.format}` : 'none'] : [])]), {
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  if (folioTmp) fs.rmSync(folioTmp, { force: true });
  if (r.status !== 0) throw new Error(`pdf post-processing failed: ${r.stderr || r.stdout}`);
  return { pdf: pdfPath, post: r.stdout.trim() };
}

/** spawn that resolves {status, stdout, stderr} like spawnSync, without blocking the event loop. */
function spawnAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { ...opts, windowsHide: true });
    let stdout = '', stderr = '';
    c.stdout?.on('data', (d) => { stdout += d; });
    c.stderr?.on('data', (d) => { stderr += d; });
    c.on('error', (e) => resolve({ status: 1, stdout, stderr: stderr || String(e.message) }));
    c.on('close', (status) => resolve({ status: status ?? 1, stdout, stderr }));
  });
}
const postPy = (args) => {
  const r = spawnSync(...py([path.join(HERE, 'pdf_post.py'), ...args]), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } });
  if (r.status !== 0) throw new Error(`pdf_post ${args[0]} failed: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
/**
 * Header/footer items scoped to "this page only" / "from this page on" (A6). Chrome prints one template per
 * document, so the pages a scoped item belongs to are printed again (same layout, another template) and
 * replace their sheets one for one. The pages are read off each segment's marker link.
 */
export async function scopedChrome(doc, pdfPath, printPart) {
  if (!doc.chrome) return 0;
  const { segments } = pageModel(doc);
  if (!segments.some((x) => x.only.length || x.from.length)) return 0;
  const at = JSON.parse(postPy(['links', pdfPath]));
  const starts = segments.map((x) => ({ x, page: x.n === 0 ? 0 : at[String(x.n)] })).filter((s) => Number.isInteger(s.page));
  const groups = new Map();
  for (let p = 1; p < at._pages; p += 1) {
    const cur = starts.filter((s) => s.page <= p).at(-1);
    if (!cur) continue;
    const seg = { from: cur.x.from, only: cur.page === p ? cur.x.only : [] };
    if (!seg.from.length && !seg.only.length) continue;
    const key = JSON.stringify([seg.from.map((i) => [i.part, i.i]), seg.only.map((i) => [i.part, i.i])]);
    if (!groups.has(key)) groups.set(key, { seg, pages: [] });
    groups.get(key).pages.push(p + 1);
  }
  for (const { seg, pages } of groups.values()) {
    const part = `${pdfPath}.part.pdf`;
    await printPart(part, seg, pages.join(','));
    postPy(['splice', pdfPath, part, pages.join(',')]);
    fs.rmSync(part, { force: true });
  }
  return groups.size;
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
    const code = [
      'import pymupdf, sys, json, base64',
      'd = pymupdf.open(sys.argv[1]); out = []',
      'for i, p in enumerate(d):',
      '    pix = p.get_pixmap(dpi=int(sys.argv[2]))',
      '    top = pymupdf.Rect(0, 18 * 72 / 25.4, p.rect.width, p.rect.height - 16 * 72 / 25.4)',
      '    lines = [l.strip() for l in p.get_text("text", clip=top).splitlines() if l.strip()]',
      '    out.append({"n": i + 1, "png": "data:image/png;base64," + base64.b64encode(pix.tobytes("png")).decode(), "first": " | ".join(lines[:3]), "wide": p.rect.width > p.rect.height})',
      'sys.stdout.write(json.dumps(out))',
    ].join('\n');
    const r = spawnSync(...py(['-c', code, pdfPath, String(dpi)]), { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONUTF8: '1' } });
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

/**
 * The fonts a DOCX names and carries. House faces come from the font manifest; every other chosen font
 * (a machine font or an uploaded one) travels as its normalised TrueType copy (fsType 0), so the DOCX
 * always holds real text (owner decision 2026-10-28; the licence is the user's responsibility).
 * notes: [{family, why: 'missing'}] for a machine font this computer does not have.
 */
export function docxFonts(doc, { theme, work, embed = true }) {
  const th = designTheme(theme, doc);
  const house = new Set(Object.keys(loadManifest().families));
  const text = familyName(th.fonts.text);
  const display = familyName(th.fonts.display) || text;
  const fams = [...new Set([text, display].filter(Boolean))];
  const cuts = fams.filter((f) => house.has(f)).flatMap((fam) => fontsFor(th).used.filter((c) => c.family === fam && c.format === 'truetype').map((c) => ({ family: c.family, weight: c.weight, file: c.file })));
  const chosen = embed ? chosenFonts(doc, theme) : { faces: [], missing: [] };
  chosen.faces.forEach((f, i) => {
    const file = path.join(work, `font-${i}.ttf`);
    fs.writeFileSync(file, f.bytes);
    cuts.push({ family: f.family, weight: f.weight, file });
  });
  return { text, display, custom: fams.some((f) => !house.has(f)), cuts: embed ? cuts : [], notes: chosen.missing.map((family) => ({ family, why: 'missing' })) };
}

/** DOCX replica through the copied builder (the edited JSON is written beside it first).
 * embedFonts (default true): the fonts that may travel go inside the file (word/fonts/*.odttf); fontNotes says which could not. */
export function exportDocx(doc, { locale, theme, docxPath, embedFonts = true }) {
  fs.mkdirSync(outTmp(), { recursive: true });
  const work = fs.mkdtempSync(path.join(outTmp(), 'bw-docx-'));
  const plan = docxFonts(doc, { theme, work, embed: embedFonts });
  const cuts = plan.cuts;
  const docJson = path.join(work, 'document.json');
  const themeJson = path.join(work, 'theme.json');
  fs.writeFileSync(docJson, JSON.stringify(normaliseNumbers(structuredClone(withResolvedDiagrams(doc, designTheme(theme, doc), locale)))) /* 0.15.0 (F4): the same positional numbers the PDF prints */, 'utf8');
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

export function loadEdited(docFile, editsFile, { force = false } = {}) {
  const rawText = fs.readFileSync(docFile, 'utf8');
  let doc = JSON.parse(rawText);
  if (editsFile) {
    const rawEdits = JSON.parse(fs.readFileSync(editsFile, 'utf8'));
    const edits = migrate(rawEdits);
    assertBase({ file: docFile, rawText, doc, edits, bare: Array.isArray(rawEdits), force });
    doc = applyOps(doc, edits.ops);
  }
  return doc;
}

/** The edition a document file is in when the caller did not say: `--locale` wins; else the file name (`x.en.json`, and `x.en.edited.json`, the name the editor
 *  gives its offline download, which the old `/\.en\.json$/` test took for Arabic); else the script of the title (more Arabic letters than Latin = ar). */
export function localeOf(file, doc, explicit) {
  if (explicit === 'ar' || explicit === 'en') return explicit;
  const m = /\.(ar|en)(?:\.[a-z0-9-]+)*\.json$/i.exec(path.basename(String(file || '')));
  if (m) return m[1].toLowerCase();
  const text = [doc?.control?.title, doc?.control?.coverTitle, doc?.chapters?.[0]?.title].filter(Boolean).join(' ');
  const ar = (text.match(/[؀-ۿ]/g) || []).length;
  const la = (text.match(/[A-Za-z]/g) || []).length;
  return la > ar ? 'en' : 'ar';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.doc) {
    console.error('usage: node engine/export.mjs --doc <document.json> [--edits e.json] [--locale ar|en] [--theme t.json] [--out dir] [--no-docx] [--no-embed-fonts]  (no --out: the save folder, Documents<title>xports)');
    process.exit(2);
  }
  const doc = loadEdited(path.resolve(userCwd(), a.doc), a.edits && path.resolve(userCwd(), a.edits));
  const locale = localeOf(a.doc, doc, a.locale);
  const theme = loadTheme(a.theme);
  // --out: that folder, as "<service>.<locale>.<ext>"; without it the save folder, never this repository:
  // Documents\<title>\Exports\<date> <title> - <language>.<ext>
  const out = a.out ? path.resolve(userCwd(), a.out) : null;
  const stem = `${fileStem(doc.service)}.${locale}`;
  const target = (ext) => (out ? path.join(out, `${stem}.${ext}`) : uniquePath(ensure(workspace()).dirs.docs, outName(docTitle(doc, doc.service), new Date(), locale, ext)));
  if (a['html-only']) {
    const f = target('print.html');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, printHtml(doc, { locale, theme }).html);
    if (!out) noteOutput(f);
    console.log(f);
  } else {
    for (const w of diagramWarnings(doc, { theme, locale })) console.error(`WARN ${w}`);
    const r = await exportPdf(doc, { locale, theme, pdfPath: target('pdf') });
    console.log(`PDF  ${r.pdf}  (${r.post})`);
    if (!a['no-docx']) {
      const dx = exportDocx(doc, { locale, theme, docxPath: target('docx'), embedFonts: !a['no-embed-fonts'] }).docx;
      console.log(`DOCX ${dx}`);
      if (!out) noteOutput(dx);
    }
    if (!out) noteOutput(r.pdf);
  }
}
