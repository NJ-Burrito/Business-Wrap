// 0.15.3 lane icons2: typed folder icons (folder-pdf / folder-docx / folder-html + the general folder), assigned automatically by
// engine/brand-icons.mjs (ensureFolderIcon, folderKindOf, refreshFolderIcon) and engine/workspace.mjs (noteOutput).
// Only temp folders are touched; the real Documents folder never is.   node tests/file-icons-0153.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensureFolderIcon, readIni, folderKindOf, refreshFolderIcon, FOLDER_KINDS } from '../engine/brand-icons.mjs';
import { noteOutput, DOCS_NAME } from '../engine/workspace.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  file-icons-0153: ${name}${detail && !ok ? '  - ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-foldericons-'));
const ICONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'brand', 'v3', 'file-icons');
const win = process.platform === 'win32';
const mkdir = (...p) => { const d = path.join(tmp, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const touch = (d, ...names) => { for (const n of names) fs.writeFileSync(path.join(d, n), 'x'); return d; };
const attrs = (f) => spawnSync('attrib', [f], { encoding: 'utf8' }).stdout.slice(0, 12);

try {
  // ── the icon set itself: 4 folders x (16..256 png, ico, svg) ──
  for (const k of ['folder', 'folder-pdf', 'folder-docx', 'folder-html']) {
    const have = [16, 32, 48, 64, 128, 256].every((s) => fs.existsSync(path.join(ICONS, `${k}-${s}.png`))) && fs.existsSync(path.join(ICONS, `${k}.ico`)) && fs.existsSync(path.join(ICONS, `${k}.svg`));
    const ico = fs.readFileSync(path.join(ICONS, `${k}.ico`));
    check(`icon set: ${k} has png 16/32/48/64/128/256, .ico (6 frames) and .svg`, have && ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === 6, k);
  }
  check('icon set: the three typed folders differ from each other and from the general one', new Set(['folder', 'folder-pdf', 'folder-docx', 'folder-html'].map((k) => fs.readFileSync(path.join(ICONS, `${k}.ico`)).toString('base64'))).size === 4);

  // ── folder type detection ──
  const kindOf = (...names) => folderKindOf(touch(mkdir(`k-${Math.random().toString(36).slice(2)}`), ...names));
  check('detect: only PDFs -> pdf', kindOf('a.pdf', 'b.PDF') === 'pdf');
  check('detect: only DOCX -> docx', kindOf('a.docx') === 'docx');
  check('detect: only HTML (.html, .htm, .shared.html, .print.html) -> html', kindOf('a.html', 'b.htm', 'c.shared.html', 'd.print.html') === 'html');
  check('detect: PDF + DOCX -> general', kindOf('a.pdf', 'a.docx') === 'general');
  check('detect: PDF + any other file -> general', kindOf('a.pdf', 'notes.txt') === 'general');
  check('detect: empty -> general; desktop.ini and dot-files do not count', kindOf() === 'general' && kindOf('a.docx', 'desktop.ini', '.hidden') === 'docx');
  const root = mkdir('docroot'); mkdir('docroot', 'Exports'); touch(root, 'a.html');
  check('detect: a folder with a sub-folder (a document root) -> general even if its files are one type', folderKindOf(root) === 'general');
  check('detect: a missing folder -> general, never throws', folderKindOf(path.join(tmp, 'nope')) === 'general');

  // ── desktop.ini, attributes, idempotence (Windows) ──
  if (win) {
    const sys = mkdir('sys');
    const d = touch(mkdir('only-pdf'), 'x.pdf');
    check('ensure: pdf kind placed', ensureFolderIcon(d, { kind: 'pdf', systemDir: sys, notify: false }) === true);
    const ini = path.join(d, 'desktop.ini');
    const ico = path.join(sys, 'business-wrap-folder-pdf.ico');
    const txt = readIni(ini);
    check('ensure: desktop.ini = [.ShellClassInfo] IconResource=<hidden .ico>,0 with CRLF', txt === `[.ShellClassInfo]\r\nIconResource=${ico},0\r\n`, txt);
    check('ensure: the typed .ico is a byte copy of folder-pdf.ico, kept in the given system folder', fs.readFileSync(ico).equals(fs.readFileSync(path.join(ICONS, 'folder-pdf.ico'))));
    const at = attrs(ini), dat = spawnSync('attrib', ['/D', d], { encoding: 'utf8' }).stdout.slice(0, 12);
    check('ensure: desktop.ini is hidden + system, the folder is system', /S/.test(at) && /H/.test(at) && /S/.test(dat), `${at} | ${dat}`);
    const m1 = fs.statSync(ini).mtimeMs;
    check('ensure: a second run is idempotent (same text, not rewritten, still hidden+system)', ensureFolderIcon(d, { kind: 'pdf', systemDir: sys, notify: false }) === true && readIni(ini) === txt && fs.statSync(ini).mtimeMs === m1 && /H/.test(attrs(ini)));
    // the type changes when the content changes: pdf only -> pdf + docx -> general
    touch(d, 'x.docx');
    check('refresh: the folder now holds two types -> general icon (rewritten in place, a hidden desktop.ini included)', refreshFolderIcon(d, { systemDir: sys, notify: false }) === true && readIni(ini).includes('business-wrap-folder.ico,0') && /H/.test(attrs(ini)));
    for (const k of FOLDER_KINDS) { const x = touch(mkdir(`k-${k}`), k === 'general' ? 'a.txt' : `a.${k}`); ensureFolderIcon(x, { kind: k, systemDir: sys, notify: false }); }
    check('ensure: every kind writes its own icon file', ['business-wrap-folder.ico', 'business-wrap-folder-pdf.ico', 'business-wrap-folder-docx.ico', 'business-wrap-folder-html.ico'].every((f) => fs.existsSync(path.join(sys, f))));
    // a folder with a desktop.ini that is not ours is left alone
    const theirs = touch(mkdir('theirs'), 'a.pdf');
    fs.writeFileSync(path.join(theirs, 'desktop.ini'), '[.ShellClassInfo]\r\nIconFile=C:\\x\\their.ico\r\n'); // platform-guard: ok a path written as text into a temp desktop.ini, never opened as a drive path
    check('ensure: a desktop.ini that is not ours is never overwritten (returns false)', ensureFolderIcon(theirs, { kind: 'pdf', systemDir: sys, notify: false }) === false && /their\.ico/.test(readIni(path.join(theirs, 'desktop.ini'))));
    check('ensure: a missing folder returns false, never throws', ensureFolderIcon(path.join(tmp, 'gone'), { kind: 'pdf', systemDir: sys, notify: false }) === false);
    check('ensure: an unknown kind falls back to the general icon', (() => { const z = mkdir('unk'); return ensureFolderIcon(z, { kind: 'zip', systemDir: sys, notify: false }) && readIni(path.join(z, 'desktop.ini')).includes('business-wrap-folder.ico'); })());

    // ── noteOutput: only Business-Wrap's own tree ──
    const docs = mkdir(DOCS_NAME);
    const ex = mkdir(DOCS_NAME, 'My Doc', 'Exports');
    touch(ex, '2026-10-31 a - English.pdf');
    check('noteOutput: a PDF written to <docs>\\<title>\\Exports gives that folder the PDF icon (hidden .system of the documents folder)', noteOutput(path.join(ex, '2026-10-31 a - English.pdf')) === true && readIni(path.join(ex, 'desktop.ini')).includes(path.join(docs, '.system', 'business-wrap-folder-pdf.ico')));
    touch(ex, '2026-10-31 a - English.docx');
    noteOutput(path.join(ex, '2026-10-31 a - English.docx'));
    check('noteOutput: then a DOCX arrives -> mixed -> the general icon', readIni(path.join(ex, 'desktop.ini')).includes('business-wrap-folder.ico,0'));
    const ver = mkdir(DOCS_NAME, 'My Doc', 'Versions');
    touch(ver, '2026-10-30 My Doc.html');
    noteOutput(path.join(ver, '2026-10-30 My Doc.html'));
    check('noteOutput: Versions holding only HTML -> the HTML icon', readIni(path.join(ver, 'desktop.ini')).includes('business-wrap-folder-html.ico'));
    const hand = touch(mkdir('Desktop-like'), 'x.pdf');
    check('noteOutput: a folder outside the documents folder is never touched', noteOutput(path.join(hand, 'x.pdf')) === false && !fs.existsSync(path.join(hand, 'desktop.ini')));
    const deep = touch(mkdir(DOCS_NAME, 'My Doc', 'Other'), 'x.pdf');
    check('noteOutput: nor an unknown sub-folder of a document, nor the documents folder itself, nor .system', noteOutput(path.join(deep, 'x.pdf')) === false && noteOutput(path.join(docs, 'x.pdf')) === false && noteOutput(path.join(docs, '.system', 'x.pdf')) === false && !fs.existsSync(path.join(deep, 'desktop.ini')));
  } else {
    check('non-Windows: ensureFolderIcon is skipped (Windows test body not applicable here)', true);
  }

  // ── non-Windows: a no-op, whatever the kind (the platform is faked for the call) ──
  {
    const d = touch(mkdir('linux'), 'a.pdf');
    const real = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'linux' });
    let r1, r2, r3;
    try { r1 = ensureFolderIcon(d, { kind: 'pdf', systemDir: path.join(tmp, 'sys-linux') }); r2 = refreshFolderIcon(d, { systemDir: path.join(tmp, 'sys-linux') }); r3 = noteOutput(path.join(tmp, DOCS_NAME, 'My Doc', 'Exports', 'a.pdf')); } finally { Object.defineProperty(process, 'platform', real); }
    check('non-Windows: ensureFolderIcon / refreshFolderIcon / noteOutput return false and write nothing', r1 === false && r2 === false && r3 === false && !fs.existsSync(path.join(d, 'desktop.ini')) && !fs.existsSync(path.join(tmp, 'sys-linux')));
  }
} catch (e) {
  check('run', false, e.stack?.split('\n').slice(0, 5).join(' / '));
}
try { spawnSync('attrib', ['-s', '-h', '/S', '/D', path.join(tmp, '*')], { stdio: 'ignore', shell: true }); } catch { /* */ }
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
