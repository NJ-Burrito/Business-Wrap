// The file types of the save and download tree and their icons (0.17.0, owner note N16). The table is assets/icons/types.json (also read by
// build_icons.py, which draws the icons): one place says which extension gets which icon, nothing here is typed twice.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ICON_DIR = path.dirname(fileURLToPath(import.meta.url));
export const SPEC = JSON.parse(fs.readFileSync(path.join(ICON_DIR, 'types.json'), 'utf8'));
export const SIZES = SPEC.sizes;
export const KINDS = Object.keys(SPEC.kinds);
/** extension (no dot, lower case) -> kind */
export const EXT_KIND = Object.fromEntries(Object.entries(SPEC.kinds).flatMap(([k, v]) => v.exts.map((e) => [e, k])));
export const TREE_EXTS = Object.keys(EXT_KIND);
/** The kind of a file name or an extension ("a.print.html", ".PDF", "docx"); 'file' for anything the tree has no type for. */
export function kindOf(nameOrExt) {
  const e = path.extname(String(nameOrExt || '')).slice(1).toLowerCase() || String(nameOrExt || '').replace(/^\./, '').toLowerCase();
  return EXT_KIND[e] || 'file';
}
export const icoPath = (kind, dir = ICON_DIR) => path.join(dir, `${kind}.ico`);
export const svgPath = (kind, dir = ICON_DIR) => path.join(dir, `${kind}.svg`);
export const LAUNCHER_ICO = path.join(ICON_DIR, 'launcher.ico');
