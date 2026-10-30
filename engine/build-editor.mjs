// Builds the local interactive editor: ONE self-contained HTML file holding the
// print markup (engine/render.mjs), the documents, the theme, the i18n strings
// and the editor app. Opens from disk (file://) or through engine/serve.mjs.
//
//   node engine/build-editor.mjs <doc.json | dir>... [--out file] [--set name]
//        [--theme theme.json] [--embed-fonts] [--watermark-dir dir] [--ui ar|en]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderDocument, safeSvg } from './render.mjs';
import { fontFaceCss, localFontCss } from './fonts.mjs';
import { i18n, loadTheme, fontsFor, REPO } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const sha256hex = (s) => crypto.createHash('sha256').update(s).digest('hex');
const jsonInScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

import { config } from './config.mjs';
import { installedNotes } from '../update/check.mjs';
import { STATE_SCHEMA } from './edits.mjs';
import { FORMAT, BUILT_KEYS, migrateData, historyProblems, FormatError } from './format.mjs';

/** Tool watermark folder: BW_WATERMARK_DIR / .local/config.json watermarkDir, else the repo's editor/brand/watermark. */
export const DEFAULT_WATERMARK_DIR = config().watermarkDir || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'editor', 'brand', 'watermark');

/**
 * Tool watermark images (UI only): [{name, role, intro, src}]. Empty folder → [] and nothing is shown.
 * `nj-avatar-<role>.*` are the roles in the portfolio's order; `*animated*` is the one-time intro.
 */
const ROLES = ['tester', 'teacher', 'volunteer', 'professional'];
const MIME = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export function watermarkImages(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /\.(svg|png|webp|gif)$/i.test(f)).sort();
  const role = (f) => ROLES.find((r) => new RegExp(`(^|[-_])${r}\\.`, 'i').test(f)) || null;
  return files
    .map((f) => ({ name: f, role: role(f), intro: /animated/i.test(f), src: `data:${MIME[f.split('.').pop().toLowerCase()]};base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}` }))
    .sort((a, b) => (a.role ? ROLES.indexOf(a.role) : 9) - (b.role ? ROLES.indexOf(b.role) : 9));
}

function docFiles(inputs) {
  return inputs.flatMap((p) =>
    fs.statSync(p).isDirectory()
      ? fs.readdirSync(p).filter((f) => /\.json$/.test(f) && !/edits|theme|pack/.test(f)).map((f) => path.join(p, f))
      : [p]
  );
}
const editionOf = (file, doc) =>
  /\.en\.json$/i.test(file) ? 'en' : /\.ar\.json$/i.test(file) ? 'ar' : /[\u0600-\u06FF]/.test(doc.control?.title || '') ? 'ar' : 'en';

/**
 * The tool's own logo (brand/v3/logo; BW_BRAND_DIR or .local/config.json brandDir
 * to preview it before the merge). UI only. Missing → a neutral stub so the island never shows words.
 */
const BRAND_STUB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Business-Wrap"><g fill="none" stroke="#be9a41" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="M35 8H22a7 7 0 0 0-7 7v34a7 7 0 0 0 7 7h20a7 7 0 0 0 7-7V22"/><path d="M24 32h16M24 43h8"/><path d="M35 8v10a4 4 0 0 0 4 4h10"/></g></svg>';
export function brandMarks() {
  // brand v3 only (brand/logo v1 and brand/v2 are retired in 0.12.0): no fallback folder
  const dir = config().brandDir || path.join(REPO, 'brand', 'v3', 'logo');
  const pick = (f) => { const p = path.join(dir, f); return fs.existsSync(p) ? safeSvg(read(p).replace(/<!--[\s\S]*?-->/g, '').trim()) : null; };
  // the animated mark is inlined still (.bw-still): editor/chrome.css plays its build once, on first open only
  const anim = pick('mark-animated.svg');
  const mark = anim ? anim.replace(/class="bw-logo bw-logo-anim"/, 'class="bw-logo bw-logo-anim bw-still"') : null;
  return { mark: mark || pick('mark.svg') || BRAND_STUB, stub: !pick('mark.svg') };
}

/**
 * Brand v3 tokens (brand/v3/tokens-v3.css, the SRS palette) scoped to the editor's shadow root: `:root` there matches nothing, so the
 * light set goes on :host and .shell, and the dark set follows the shell's own theme switch (data-theme).
 * Tool chrome only: the document under it keeps its design pack.
 */
export function brandCss() {
  const f = path.join(REPO, 'brand', 'v3', 'tokens-v3.css');
  if (!fs.existsSync(f)) return '';
  return read(f)
    // a dialog on the shadow root (12-session's relaunch prompt) sits outside .shell: it takes the theme tokens too
    .replace(/:root:not\(/g, ':is(.shell, dialog):not(')
    .replace(/:root\[/g, ':is(.shell, dialog)[')
    .replace(/:root(?=\s*\{)/g, ':host, .shell')
    .replace(/:where\(a, button, input, select, textarea, \[tabindex\]\):focus-visible \{[^}]*\}/, '') + '\n';
}
/** The brand icons' micro-animations, also played when the button holding the icon is hovered or focused. */
export function iconCss() {
  const f = path.join(REPO, 'brand', 'v3', 'icons', 'icons.css');
  if (!fs.existsSync(f)) return '';
  return read(f).replace(/(\.bw-i--([\w-]+):hover (\.mv(?:\.[ab])?)), /g, '.b:hover:not(:disabled) .bw-i--$2 $3, .b:focus-visible .bw-i--$2 $3, [role="menuitem"]:hover .bw-i--$2 $3, $1, ') + '\n';
}

/** Editor extensions (0.13.0, editor/ext/README.md): `<dir>/*.<ext>`, sorted by name. No folder → none. */
export const EXT_DIR = path.join(REPO, 'editor', 'ext');
export const extFiles = (dir, ext) => (dir && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort().map((f) => path.join(dir, f)) : []);
/** Each extension's strings join the UI table; a key that already exists (or two extensions sharing one) fails the build. */
export function mergeExtI18n(ui, dir) {
  const own = { ar: {}, en: {} };
  for (const f of extFiles(dir, '.i18n.json')) {
    const j = JSON.parse(read(f));
    for (const l of ['ar', 'en']) for (const [k, v] of Object.entries(j[l] || {})) {
      if (k in ui[l] || k in own[l]) throw new Error(`editor extension ${path.basename(f)}: i18n key "${k}" (${l}) already exists`);
      own[l][k] = v;
    }
  }
  for (const l of ['ar', 'en']) Object.assign(ui[l], own[l]);
}

/** The app script: edits + render (exports stripped) + editor + extensions, one IIFE; local learning goes last (it wraps the editor's functions). */
export function appScript(extDir = EXT_DIR) {
  const core = read(path.join(HERE, 'learning', 'core.mjs')).replace(/^export /gm, '').replace(/^import .*$/gm, '');
  const learn = `const LEARN = (() => {\n${core}\nreturn { redact, brief, fieldKind, sectionOf };\n})();\n${read(path.join(REPO, 'editor', 'learning-hook.js'))}`;
  return editorScript(extDir).replace(/\n\}\)\(\);$/, () => `\n${learn}\n})();`);
}
function editorScript(extDir) {
  const strip = (s) => s.replace(/^export /gm, '').replace(/^import .*$/gm, '');
  // the harvest model code lives in its own scope (HV), so its helper names stay out of the editor's
  const hv = ['xml.mjs', 'yaml.mjs', 'model.mjs', 'docs.mjs'].map((f) => strip(read(path.join(HERE, 'harvest', f)))).join('\n');
  return `(() => {\n'use strict';\n${strip(read(path.join(HERE, 'edits.mjs')))}
${strip(read(path.join(HERE, 'cells.mjs')))}\n${strip(read(path.join(HERE, 'diagram.mjs')))}\n${strip(read(path.join(HERE, 'render.mjs')))}\n${strip(read(path.join(HERE, 'fontinfo.mjs')))}\n${strip(read(path.join(HERE, 'ledger-v1.mjs')))}\n${strip(read(path.join(HERE, 'bulk.mjs')))}\nconst HV = (() => {\n${hv}\nreturn { parseModel, modelToDocument, processFigure, humanGraph, harvestToDocument, mergeToDocument };\n})();\n${['value-control.js', 'fonts.js', 'design-panel.js', 'editor.js'].map((f) => read(path.join(REPO, 'editor', f))).join('\n')}\n${read(path.join(REPO, 'editor', 'diagram-ui.js'))}\n${['shell-ux.js', 'views.js', 'explainers.js', 'print-center.js'].map((f) => read(path.join(REPO, 'editor', f))).join('\n')}\n${['update.js', 'settings.js'].map((f) => read(path.join(REPO, 'editor', f))).join('\n')}\n${extFiles(extDir, '.js').map(read).join('\n')}\nboot();\n})();`;
}

export function buildEditor({ inputs, out, set, themeFile, embedFonts = false, localFonts = false, watermarkDir = DEFAULT_WATERMARK_DIR, ui = 'ar', ops = {}, extDir = EXT_DIR }) {
  const theme = loadTheme(themeFile);
  const services = new Map();
  for (const f of docFiles(inputs)) {
    const raw = read(f);
    const doc = JSON.parse(raw);
    if (!doc.chapters || !doc.control) continue;
    const id = doc.service || path.basename(f).split('.')[0];
    const ed = editionOf(f, doc);
    if (!services.has(id)) services.set(id, { id, editions: {} });
    services.get(id).editions[ed] = { name: doc.control.title.split(/\s*[:—]\s+/).slice(1).join(': ') || doc.control.title, raw, hash: `sha256:${sha256hex(raw)}`, ops: ops[`${id}.${ed}`] || [] };
  }
  if (!services.size) throw new Error('no document JSON found');
  const local = localFonts ? localFontCss() : null;
  const { cuts, used } = local ? { cuts: [], used: local.families } : fontsFor(theme);
  const fontCss = local ? local.css : fontFaceCss(cuts, { embed: embedFonts });
  const html = editorHtml({ services: [...services.values()], setId: set || [...services.keys()].join('+'), ui, theme, fontCss, fontFamilies: local ? local.families : [...new Set(cuts.map((c) => c.family))], wm: watermarkImages(watermarkDir), extDir });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html, 'utf8');
  return { out, services: [...services.keys()], watermark: watermarkImages(watermarkDir).length, fonts: used.length, bytes: Buffer.byteLength(html) };
}

/** What the Settings page's About section shows, also from file:// (no server). */
export function aboutInfo() {
  const pkg = JSON.parse(read(path.join(REPO, 'package.json')));
  const cl = fs.existsSync(path.join(REPO, 'CHANGELOG.md')) ? read(path.join(REPO, 'CHANGELOG.md')) : '';
  const date = /(\d{4}-\d{2}-\d{2})/.exec(cl.split('\n').find((l) => l.startsWith(`## [${pkg.version}]`)) || '')?.[1] || '';
  return {
    name: 'Business-Wrap', version: pkg.version, date, repo: pkg.homepage, license: 'MIT',
    credits: ['Thmanyah (ثمانية)', 'Lucide icons (ISC)', 'Playwright', 'Model Context Protocol SDK'],
  };
}

/** One editor HTML from services already in hand (documents + their stored edits, history and comments). */
function editorHtml({ services, setId, ui = 'ar', theme, fontCss, fontFamilies, wm = [], extDir = EXT_DIR, carry = {} }) {
  const I = i18n();
  // shell UX strings (0.10.0): ux.*, view.*, explain.* live in their own file and join the UI table here
  const UX = JSON.parse(read(path.join(REPO, 'editor', 'ux-i18n.json')));
  const PC = JSON.parse(read(path.join(REPO, 'editor', 'print-i18n.json'))); // Export & Print centre, View menu (0.11.0)
  for (const l of ['ar', 'en']) Object.assign(I.ui[l], UX[l], PC[l]);
  mergeExtI18n(I.ui, extDir);
  const app = appScript(extDir);
  // parse it here: two concatenated files declaring the same name (a merge of parallel work) fail the build, not the browser
  try { new Function(app); } catch (e) { throw new Error(`editor app script does not parse: ${e.message}`); }
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${crypto.createHash('sha256').update(app).digest('base64')}'`,
    "style-src 'unsafe-inline'",
    "font-src 'self' file: data:",
    'img-src data: blob: file:',
    "connect-src 'self' file: http://127.0.0.1:*", // 0.13.3: loopback only, so a file:// page can ask whether a local server answers (Settings › start server)
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  const first = services[0];
  const ed0 = first.editions.ar ? 'ar' : 'en';
  const doc0 = JSON.parse(first.editions[ed0].raw);
  const notes = installedNotes();
  const data = {
    ...carry, // a re-wrapped file's own keys (provenance: bwlog, prov, contrib, lock …); every key below is this build's
    icons: JSON.parse(read(path.join(REPO, 'editor', 'icons.json'))).icons,
    brand: brandMarks(),
    setId,
    uiLang: ui,
    services,
    theme,
    i18n: I,
    fontCss,
    fontFamilies,
    uiCss: brandCss() + read(path.join(REPO, 'editor', 'ui.css')) + read(path.join(REPO, 'editor', 'design.css')) + read(path.join(REPO, 'editor', 'ux.css')) + read(path.join(REPO, 'editor', 'settings.css')) + read(path.join(REPO, 'editor', 'print-center.css')) + iconCss() + read(path.join(REPO, 'editor', 'chrome.css')) + extFiles(extDir, '.css').map(read).join(''),
    csp,
    version: notes.version,
    stateSchema: STATE_SCHEMA,
    format: FORMAT, // the saved-file format (engine/format.mjs): migrations key off this, never off the app version
    about: aboutInfo(),
    whatsNew: { human: notes.human, migration: notes.migration },
  };
  const head = `<meta http-equiv="Content-Security-Policy" content="${csp}">
<style id="bw-editor-css">${read(path.join(REPO, 'editor', 'editor.css'))}
${read(path.join(REPO, 'editor', 'views.css'))}</style>
`;
  const body = `<script type="application/json" id="bw-data">${jsonInScript(data)}</script>
${wm.length ? `<script type="application/json" id="bw-watermark-data">${jsonInScript(wm)}</script>\n` : ''}<script id="bw-app">${app}</script>`;
  return renderDocument(doc0, { locale: ed0, labels: I.doc[ed0], theme, fontCss, logos: theme.logos, extraHead: head, extraBody: body });
}

/**
 * An editor HTML built by an older Business-Wrap (a served editor or a Save-HTML file from 0.9.x, 0.10.0 …)
 * re-wrapped in THIS version's editor: the documents, their edits, history, comments, snapshots, theme, fonts
 * and set id are carried over unchanged (the editor migrates the stored fields on open). The file on disk is
 * never rewritten. Same version, or not an editor → returned as is.
 */
export function rewrapEditorHtml(html) { // throws FormatError (file untouched on disk) instead of ever returning a lossy page
  const m = /<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) return html;
  let d;
  try { d = JSON.parse(m[1]); } catch { return html; }
  if (!Array.isArray(d.services) || !d.services.length || (d.version === installedNotes().version && d.format === FORMAT)) return html;
  d = migrateData(d).data; // the ordered chain; a newer file or a failing step throws FormatError, nothing is rebuilt
  const base = loadTheme();
  const theme = d.theme ? { ...base, ...d.theme, vars: { ...base.vars, ...(d.theme.vars || {}) } } : base;
  let wm = [];
  try { const w = /<script type="application\/json" id="bw-watermark-data">([\s\S]*?)<\/script>/.exec(html); if (w) wm = JSON.parse(w[1]); } catch { /* none */ }
  let { fontCss, fontFamilies } = d;
  if (typeof fontCss !== 'string') { const cuts = fontsFor(theme).cuts; fontCss = fontFaceCss(cuts, {}); fontFamilies = [...new Set(cuts.map((c) => c.family))]; }
  // every key this build does not make itself travels as is: the provenance (bwlog mark, prov log, contributors, lock) and
  // anything a later extension adds; a file re-wrapped without them would read as «stripped» (0.13.1 final pass, item 1)
  const carry = Object.fromEntries(Object.entries(d).filter(([k]) => !BUILT_KEYS.has(k)));
  const out = carryTraces(html, editorHtml({ services: d.services, setId: d.setId, ui: d.uiLang === 'en' ? 'en' : 'ar', theme, fontCss, fontFamilies: fontFamilies || [], wm, carry }));
  // the gate that makes a silent loss impossible: whatever the old file held of history must be in the new one, or no re-wrap
  const lost = historyProblems(JSON.parse(m[1]), JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(out)[1]));
  if (lost.length) throw new FormatError(`re-wrap would lose history: ${lost.slice(0, 5).join('; ')}`);
  return out;
}
/**
 * The 0.13 traces outside the data block (engine/ledger-v1.mjs traces(): <html data-bw-ledger>, <meta name="bw-ledger">,
 * a second hash source in the CSP script-src) copied from the old file's head into the re-wrapped one.
 */
function carryTraces(old, out) {
  const head = old.split(/<\/head>/i)[0];
  const root = /<html[^>]*\sdata-bw-ledger="([^"]*)"/i.exec(head)?.[1];
  const meta = /<meta[^>]*name="bw-ledger"[^>]*>/i.exec(head)?.[0];
  const oldApp = /<script id="bw-app">([\s\S]*?)<\/script>/.exec(old)?.[1];
  const appHash = oldApp != null ? `'sha256-${crypto.createHash('sha256').update(oldApp).digest('base64')}'` : '';
  const csp = /<meta[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"/i.exec(head)?.[1] || '';
  const extra = (/script-src([^;]*)/.exec(csp)?.[1].match(/'sha256-[^']+'/g) || []).filter((h) => h !== appHash);
  const outHead = out.split(/<\/head>/i)[0];
  if (root != null && !/<html[^>]*\sdata-bw-ledger=/i.test(outHead)) out = out.replace(/<html /i, `<html data-bw-ledger="${root}" `);
  if (meta && !/<meta[^>]*name="bw-ledger"/i.test(outHead)) out = out.replace(/<meta charset="utf-8">/i, `$&\n${meta}`);
  if (extra.length) out = out.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src )/, `$1${extra.join(' ')} `);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = {};
  const inputs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--embed-fonts') opt.embedFonts = true;
    else if (a.startsWith('--')) { opt[a.slice(2).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = argv[i + 1]; i += 1; }
    else inputs.push(a);
  }
  if (!inputs.length) {
    console.error('usage: node engine/build-editor.mjs <doc.json|dir>... [--out file] [--theme t.json] [--embed-fonts] [--ui ar|en]');
    process.exit(2);
  }
  const r = buildEditor({ inputs, out: path.resolve(opt.out || path.join(REPO, 'out', 'editor.html')), set: opt.set, themeFile: opt.theme, embedFonts: opt.embedFonts, watermarkDir: opt.watermarkDir ?? DEFAULT_WATERMARK_DIR, ui: opt.ui });
  console.log(`editor  ${r.out}  services=${r.services.join(',')}  fonts=${r.fonts}  watermark=${r.watermark}  ${(r.bytes / 1024).toFixed(0)} KB`);
}
