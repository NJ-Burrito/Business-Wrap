// Font manifest → @font-face CSS. Node only. Binaries are read from local
// folders at build time and never copied into the repo.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { sfntInfo } from './fontinfo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

/** Agent A's manifest if present, else the stub in engine/defaults. */
export function loadManifest(explicit) {
  const candidates = [explicit, path.join(REPO, 'fonts', 'manifest.json'), path.join(HERE, 'defaults', 'fonts.manifest.json')];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      const m = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (m.families && m.weights) return { ...m, source: c };
    }
  }
  throw new Error('no font manifest found');
}

const expand = (d) =>
  String(d || '').replace(/\$\{(\w+)\}/g, (_, k) => (k === 'BW_FONT_DIR' ? config().fontDir : process.env[k] || ''));

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every cut of every family: { family, weight, file, format } — .ttf preferred. */
export function resolveFonts(manifest, extraDirs = []) {
  const dirs = [...extraDirs, ...manifest.fontDirs.map(expand)].filter((d) => d && fs.existsSync(d));
  const files = dirs.flatMap((d) => walk(d));
  const pick = (name) => {
    const lower = name.toLowerCase();
    const hits = files.filter((f) => path.basename(f).toLowerCase() === lower);
    return hits[0];
  };
  const cuts = [];
  const missing = [];
  for (const [family, info] of Object.entries(manifest.families)) {
    if ((manifest.banned || []).some((b) => family.toLowerCase().includes(b.toLowerCase()))) continue;
    for (const [weight, label] of Object.entries(manifest.weights)) {
      const ttf = pick(`${info.stem}-${label}.ttf`);
      const woff2 = pick(`${info.stem}-${label}.woff2`);
      const file = ttf || woff2;
      if (!file) { missing.push(`${family} ${weight}`); continue; }
      cuts.push({ family, weight: Number(weight), file, format: ttf ? 'truetype' : 'woff2' });
    }
  }
  return { cuts, missing, dirs };
}

/** embed: true → base64 data URIs (PDF printing, self-contained export); false → file:// URLs. */
export function fontFaceCss(cuts, { embed = false, families } = {}) {
  return cuts
    .filter((c) => !families || families.includes(c.family))
    .map((c) => {
      const src = embed
        ? `data:font/${c.format === 'truetype' ? 'ttf' : 'woff2'};base64,${fs.readFileSync(c.file).toString('base64')}`
        : pathToFileURL(c.file).href;
      return `@font-face{font-family:'${c.family}';font-style:normal;font-weight:${c.weight};font-display:block;src:url(${src}) format('${c.format}');}`;
    })
    .join('\n');
}

/**
 * @font-face rules that name the installed system fonts only (src: local()), for the editor shipped
 * inside the skill: no path and no font bytes go into that file. Fonts must be installed in the OS
 * (fonts/README.md); a personal editor built with build-editor.mjs reads the configured font folder.
 */
export function localFontCss(manifest = loadManifest()) {
  const banned = (manifest.banned || []).map((b) => b.toLowerCase());
  const rules = [];
  for (const [family, info] of Object.entries(manifest.families)) {
    if (banned.some((b) => family.toLowerCase().includes(b))) continue;
    for (const [weight, label] of Object.entries(manifest.weights)) {
      const full = `${family.toLowerCase().replace(/\s+/g, ' ')} ${label}`;
      rules.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:local('${info.stem}-${label}'),local('${full}');}`);
    }
  }
  return { css: rules.join('\n'), families: Object.keys(manifest.families).filter((f) => !banned.some((b) => f.toLowerCase().includes(b))) };
}

/* ── fonts installed on this machine (the editor's «خطوط جهازك»), for the PDF and the DOCX ── */
let SYSTEM;
/** Every face installed in the usual font folders: {file, format, outlines, fsType, embeddable, family, names, weight, italic}. */
export function systemFonts(dirs) {
  if (SYSTEM && !dirs) return SYSTEM;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const list = dirs || [
    process.env.WINDIR && path.join(process.env.WINDIR, 'Fonts'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'),
    '/usr/share/fonts', '/usr/local/share/fonts', home && path.join(home, '.fonts'), home && path.join(home, '.local', 'share', 'fonts'),
    '/Library/Fonts', '/System/Library/Fonts', home && path.join(home, 'Library', 'Fonts'),
  ].filter(Boolean);
  const out = [];
  for (const d of list) for (const file of walk(d)) {
    if (!/\.(ttf|otf|ttc)$/i.test(file)) continue;
    let fd;
    try {
      fd = fs.openSync(file, 'r');
      const read = (off, len) => { const b = Buffer.alloc(Math.max(0, len)); const n = fs.readSync(fd, b, 0, b.length, off); return new Uint8Array(b.buffer, b.byteOffset, n); };
      const info = sfntInfo(read);
      if (info) for (const f of info.faces || [info]) out.push({ ...f, format: info.format, embeddable: info.format === 'ttc' ? false : f.embeddable, file, faces: undefined });
    } catch { /* unreadable file: not a candidate */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  if (!dirs) SYSTEM = out;
  return out;
}

/** The upright faces of one installed family, nearest to Regular (400) and Bold (700). */
export function systemFamily(family, dirs) {
  const low = String(family || '').toLowerCase();
  const hits = systemFonts(dirs).filter((f) => !f.italic && f.names.some((n) => n.toLowerCase() === low));
  // TrueType outlines first at equal distance: Chrome prints CFF as Type 3, and Word embeds TrueType only
  const near = (w) => hits.slice().sort((a, b) => Math.abs(a.weight - w) - Math.abs(b.weight - w) || (a.outlines !== 'truetype') - (b.outlines !== 'truetype'))[0];
  const regular = near(400);
  const bold = hits.find((f) => f.weight >= 600) ? near(700) : null;
  return { regular, bold: bold && bold !== regular ? bold : null, found: hits.length > 0 };
}
