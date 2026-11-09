// The cover motif as one SVG on stdout, for the DOCX builder (engine/docx/cover_design.py draws it to a PNG).
//   node engine/covers/motif-svg.mjs <motif-id> <ltr|rtl> [theme.json]
// The drawing is engine/render.mjs `coverMotifSvg`, the same function the HTML and PDF covers use; the colours are the theme's own vars
// (the file the DOCX builder reads: BW_THEME), each role falling back to its brand value when the theme has none.
import fs from 'node:fs';
import { coverMotifSvg, MOTIF_ROLES } from '../render.mjs';

const [, , id, dir, themeFile] = process.argv;
if (!id) { process.stderr.write('usage: motif-svg.mjs <motif-id> <ltr|rtl> [theme.json]\n'); process.exit(2); }
let vars = {};
if (themeFile) vars = JSON.parse(fs.readFileSync(themeFile, 'utf8')).vars || {};
const colors = Object.fromEntries(Object.entries(MOTIF_ROLES).map(([k, [v, d]]) => [k, /^#[0-9a-f]{6}$/i.test(vars[v] || '') ? vars[v] : d]));
const svg = coverMotifSvg(id, { rtl: dir === 'rtl', colors });
if (!svg) { process.stderr.write(`unknown motif: ${id}\n`); process.exit(1); }
process.stdout.write(svg);
