// The Business-Wrap file badges (brand/v3/file-icons, made by brand/v3/tools/build_file_icons.py): the HTML badge as an
// inline favicon, the folder icon for a document's folder. Reads the PNG/ICO files beside the brand; a missing file
// means "no badge" (never an error): the editor and the folders work the same without them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'brand', 'v3', 'file-icons');

/** The badge PNG (kind: pdf | docx | html | folder; size 16 | 32 | 48 | 64 | 128 | 256) as a Buffer, or null. */
export function badgePng(kind, size = 64) {
  try { return fs.readFileSync(path.join(DIR, `${kind}-${size}.png`)); } catch { return null; }
}

/** A data: URI of the badge (CSP-safe: the editor's img-src allows data:), or ''. */
export function badgeDataUri(kind, size = 64) {
  const b = badgePng(kind, size);
  return b ? `data:image/png;base64,${b.toString('base64')}` : '';
}

/** `<link rel="icon">` for the HTML badge (the saved/served editor), or ''. */
export function faviconLink(kind = 'html') {
  const uri = badgeDataUri(kind, 64);
  return uri ? `<link rel="icon" type="image/png" sizes="64x64" href="${uri}">` : '';
}

/**
 * Gives a document's folder the Business-Wrap folder icon: <dir>\desktop.ini ([.ShellClassInfo] IconResource) with
 * the hidden+system attribute, the folder marked system so Explorer reads it, and the icon file kept in the
 * documents folder's .system (the parent of `dir`, as the tree is laid out). Idempotent; Windows only; never throws.
 * Returns true when the icon is in place.
 */
export function ensureFolderIcon(dir, { systemDir } = {}) {
  try {
    if (process.platform !== 'win32') return false;
    const src = path.join(DIR, 'folder.ico');
    if (!fs.existsSync(src) || !fs.statSync(dir).isDirectory()) return false;
    const sys = systemDir || path.join(path.dirname(dir), '.system');
    fs.mkdirSync(sys, { recursive: true });
    const ico = path.join(sys, 'business-wrap-folder.ico');
    if (!fs.existsSync(ico) || !fs.readFileSync(ico).equals(fs.readFileSync(src))) fs.copyFileSync(src, ico);
    const ini = path.join(dir, 'desktop.ini');
    const text = `[.ShellClassInfo]\r\nIconResource=${ico},0\r\n`;
    const same = fs.existsSync(ini) && fs.readFileSync(ini, 'latin1') === text;
    if (!same) {
      spawnSync('attrib', ['-s', '-h', ini], { windowsHide: true, stdio: 'ignore' }); // a hidden file cannot be overwritten
      fs.writeFileSync(ini, text, 'latin1');
    }
    spawnSync('attrib', ['+s', '+h', ini], { windowsHide: true, stdio: 'ignore' });
    spawnSync('attrib', ['+s', dir], { windowsHide: true, stdio: 'ignore' });
    return true;
  } catch { return false; }
}
