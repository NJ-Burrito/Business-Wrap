// Paths that always work on Windows (0.16.3, import fix 0163): a long Arabic path under a long temp folder passed Node but failed
// the native readers (pdftotext: "I/O Error: Couldn't open file"). Node reaches a long path with the \\?\ prefix; a child
// process gets a SHORT temp copy with an ASCII name instead, so no locale, code page or MAX_PATH can touch it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** `p` as Node can open it however long it is (the \\?\ form on Windows past 240 characters; unchanged elsewhere). */
export const lp = (p) => (process.platform === 'win32' && p.length > 240 && !p.startsWith('\\\\') ? `\\\\?\\${path.resolve(p)}` : p);

/** A short temp folder: <tmp>\bw-<tag>-XXXXXX (the caller removes it). */
export const shortDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `bw-${tag}-`));

/** Runs fn(shortPath) on a short ASCII-named copy of `file` (kept with its extension), then removes the copy. */
export function onShortCopy(file, fn) {
  const dir = shortDir('c');
  const copy = path.join(dir, `f${path.extname(file).toLowerCase().replace(/[^.a-z0-9]/g, '')}`);
  try {
    try { fs.copyFileSync(lp(path.resolve(file)), copy); } catch (e) { throw new Error(`cannot read the file (${e.code || e.message}); the path may be too long or the file is locked`); }
    return fn(copy);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
