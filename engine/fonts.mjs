// Font manifest → @font-face CSS. Node only. Binaries are read from the user's folders first;
// the bundled fonts/nj-fonts copy (${BW_ROOT}, the repo or plugin root) is the last fallback.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { sfntInfo, sfntFromBytes } from './fontinfo.mjs';

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
  String(d || '').replace(/\$\{(\w+)\}/g, (_, k) => (k === 'BW_FONT_DIR' ? config().fontDir : k === 'BW_ROOT' ? REPO : process.env[k] || ''));

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
      if (embed) return `@font-face{font-family:'${c.family}';font-style:normal;font-weight:${c.weight};font-display:block;src:url(data:font/ttf;base64,${normaliseFont(fs.readFileSync(c.file)).toString('base64')}) format('truetype');}`;
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
      if (info) (info.faces || [info]).forEach((f, index) => out.push({ ...f, format: info.format, index, file, faces: undefined }));
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

/* ── every chosen font prints and embeds as real text (owner decision 2026-10-28) ──
 * Chrome writes CFF outlines and licence-restricted faces as Type 3 drawings, Word embeds TrueType only.
 * So each face is normalised before it reaches Chrome or the DOCX: OS/2 fsType = 0 and TrueType outlines.
 * A TrueType file is patched here in memory; CFF, WOFF/WOFF2 and collection faces go through
 * engine/font_normalise.py (the house otf-to-ttf path) in the gitignored out/ folder, removed at once.
 * The licence of a chosen font is the user's responsibility. */
const NORM = new Map();
const outTmp = () => process.env.BW_FONT_NORM_DIR || path.join(REPO, 'out', 'font-norm'); // BW_FONT_NORM_DIR: a test owns its sub-folder
/** a TrueType copy of the font (Buffer) with fsType 0; index picks the face of a .ttc */
export function normaliseFont(bytes, index = 0, { embolden = false } = {}) {
  const buf = Buffer.from(bytes);
  const key = crypto.createHash('sha1').update(buf).digest('hex') + ':' + index + (embolden ? ':b' : '');
  if (NORM.has(key)) return NORM.get(key);
  const info = sfntFromBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.length));
  let out;
  if (!embolden && info?.format === 'ttf' && info.outlines === 'truetype') {
    out = Buffer.from(buf);
    const n = out.readUInt16BE(4);
    for (let i = 0; i < n; i += 1) if (out.toString('latin1', 12 + i * 16, 16 + i * 16) === 'OS/2') out.writeUInt16BE(0, out.readUInt32BE(12 + i * 16 + 8) + 8);
  } else {
    fs.mkdirSync(outTmp(), { recursive: true });
    const stem = path.join(outTmp(), `${process.pid}-${key.slice(0, 12)}`);
    fs.writeFileSync(`${stem}.in`, buf);
    try {
      const r = spawnSync('uv', ['run', '--no-project', '--with', 'fonttools', '--with', 'brotli', 'python', path.join(HERE, 'font_normalise.py'), `${stem}.in`, `${stem}.ttf`, '--index', String(index), ...(embolden ? ['--embolden'] : [])], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
      if (r.status !== 0) throw new Error(`font normalise failed: ${(r.stderr || r.stdout || String(r.error)).slice(-400)}`);
      out = fs.readFileSync(`${stem}.ttf`);
    } finally {
      fs.rmSync(`${stem}.in`, { force: true });
      fs.rmSync(`${stem}.ttf`, { force: true });
    }
  }
  NORM.set(key, out);
  return out;
}
export const ttfDataUri = (buf) => `data:font/ttf;base64,${buf.toString('base64')}`;
