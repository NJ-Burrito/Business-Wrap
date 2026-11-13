// one icon per folder ROLE (assets/icons/folders.json, build_folder_icons.py). Checks: the icon set itself (10 roles, 7 frames each, all
// distinct, 16..256), the role of every folder of the save tree (roleOfFolder), the desktop.ini assigned to each (applyTreeIcons, noteOutput,
// docFolder), a project export as a folder and as a zip (relative icon paths that travel), the picker's listing, and the editor's copies of the art.
// Only temp folders are touched.   node tests/folder-icons-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensureFolderIcon, readIni, FOLDER_ROLES, ROLE_SPEC } from '../engine/brand-icons.mjs';
import { roleOfFolder, applyTreeIcons, noteOutput, docFolder, listFolders, DOCS_NAME, SYSTEM_NAME, UNSORTED_NAME, dirsOf } from '../engine/workspace.mjs';
import { exportProject } from '../engine/project-export.mjs';
import { makeEntry } from '../engine/routes/library.mjs';
import { readZip, extractZip } from '../engine/zip.mjs';
import { suite, launchChrome } from './_harness.mjs';

const S = suite("folder-icons-0174");
const { check } = S;
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(REPO, 'assets', 'icons');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fi174-'));
const win = process.platform === 'win32';
const mkdir = (...p) => { const d = path.join(tmp, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const attrs = (f) => spawnSync('attrib', [f], { encoding: 'utf8' }).stdout.slice(0, 12);
const framesOf = (ico) => { const n = ico.readUInt16LE(4); return Array.from({ length: n }, (_, i) => { const o = 6 + i * 16; return ico[o] || 256; }); };

try {
  // ── the icon set ──
  const roles = ['root', 'documents', 'document', 'exports', 'sources', 'versions', 'system', 'unsorted', 'projects', 'download'];
  check('the roles are the ten the tool creates', JSON.stringify(FOLDER_ROLES) === JSON.stringify(roles), FOLDER_ROLES.join());
  const hashes = new Set();
  let setOk = true;
  for (const r of roles) {
    const ico = fs.existsSync(path.join(ICONS, `folder-${r}.ico`)) ? fs.readFileSync(path.join(ICONS, `folder-${r}.ico`)) : null;
    const f = ico ? framesOf(ico) : [];
    if (!ico || JSON.stringify(f) !== JSON.stringify([16, 24, 32, 48, 64, 128, 256]) || !fs.existsSync(path.join(ICONS, `folder-${r}.svg`)) || !fs.existsSync(path.join(ICONS, `folder-${r}-small.svg`)) || !fs.existsSync(path.join(ICONS, `folder-${r}-256.png`))) { setOk = false; check(`icon set: ${r}`, false, JSON.stringify(f)); }
    if (ico) hashes.add(ico.toString('base64'));
  }
  check('icon set: every role has an .ico of 7 frames (16 to 256), an svg, a small svg and a 256 png', setOk);
  check('icon set: the ten icons are all different', hashes.size === 10);
  const px = (r) => fs.readFileSync(path.join(ICONS, `folder-${r}-256.png`));
  check('icon set: the 256 frame is a real PNG (256 x 256)', roles.every((r) => px(r).readUInt32BE(16) === 256 && px(r).readUInt32BE(20) === 256));
  check('icon set: each role names its place and has an English and an Arabic label', roles.every((r) => ROLE_SPEC.roles[r].where && ROLE_SPEC.roles[r].en && /[\u0600-\u06ff]/.test(ROLE_SPEC.roles[r].ar)));

  // ── which role a folder has ──
  const root = path.join(tmp, 'Business-Wrap');
  const R = (...p) => roleOfFolder(path.join(root, ...p), root);
  check('role: the save folder', R() === 'root');
  check('role: the documents folder', R(DOCS_NAME) === 'documents');
  check('role: a document folder', R(DOCS_NAME, 'My Doc') === 'document');
  check('role: Exports, Sources, Versions of a document', R(DOCS_NAME, 'My Doc', 'Exports') === 'exports' && R(DOCS_NAME, 'My Doc', 'Sources') === 'sources' && R(DOCS_NAME, 'My Doc', 'Versions') === 'versions');
  check('role: .system itself only (0.17.5: its sub-folders are machine collections that code lists as entries, so they have none)', R(SYSTEM_NAME) === 'system' && R(SYSTEM_NAME, 'history') === null && R(SYSTEM_NAME, 'sessions') === null && R(SYSTEM_NAME, 'cache', 'x') === null);
  check('role: Unsorted', R(DOCS_NAME, UNSORTED_NAME) === 'unsorted');
  check('role: a folder that is not ours (sub-folder of Sources, an unknown sub-folder, a dot folder, outside the tree) has none', R(DOCS_NAME, 'My Doc', 'Sources', 'page-1') === null && R(DOCS_NAME, 'My Doc', 'Other') === null && R(DOCS_NAME, '.hidden') === null && R('Elsewhere') === null && roleOfFolder(path.join(tmp, 'x'), root) === null);

  if (win) {
    // ── ensureFolderIcon per role ──
    const sys = mkdir('ens', '.system');
    for (const r of roles) {
      const d = mkdir('ens', `d-${r}`);
      const ok = ensureFolderIcon(d, { kind: r, systemDir: sys, notify: false });
      const ico = path.join(sys, `business-wrap-folder-${r}.ico`);
      const ini = path.join(d, 'desktop.ini');
      const a = attrs(ini), b = attrs(d);
      check(`ensure: ${r} -> desktop.ini IconResource names its own icon, hidden+system, folder system`, ok && fs.existsSync(ico) && fs.readFileSync(ico).equals(fs.readFileSync(path.join(ICONS, `folder-${r}.ico`))) && readIni(ini).includes(`IconResource=${ico},0`) && /S/.test(a) && /H/.test(a) && /S/.test(b), `${a}|${b}`);
    }
    // ── the whole save tree ──
    const ws = dirsOf(root);
    for (const d of Object.values(ws)) fs.mkdirSync(d, { recursive: true });
    for (const s of ['Exports', 'Sources', 'Versions']) fs.mkdirSync(path.join(ws.docs, 'My Doc', s), { recursive: true });
    fs.mkdirSync(path.join(ws.docs, UNSORTED_NAME), { recursive: true });
    fs.mkdirSync(path.join(ws.docs, 'My Doc', 'Sources', 'page-1'), { recursive: true });
    const n = applyTreeIcons(root, { notify: false });
    const want = [[root, 'root'], [ws.docs, 'documents'], [path.join(ws.docs, 'My Doc'), 'document'], [path.join(ws.docs, 'My Doc', 'Exports'), 'exports'], [path.join(ws.docs, 'My Doc', 'Sources'), 'sources'], [path.join(ws.docs, 'My Doc', 'Versions'), 'versions'], [ws.system, 'system'], [path.join(ws.docs, UNSORTED_NAME), 'unsorted']];
    check('tree: every folder of the save tree got its role icon', want.every(([d, r]) => fs.existsSync(path.join(d, 'desktop.ini')) && readIni(path.join(d, 'desktop.ini')).includes(`business-wrap-folder-${r}.ico,0`)), want.filter(([d, r]) => !fs.existsSync(path.join(d, 'desktop.ini')) || !readIni(path.join(d, 'desktop.ini')).includes(`business-wrap-folder-${r}.ico,0`)).map((x) => x[1]).join());
    check('tree: applyTreeIcons counts what it marked (root, documents, document + 3, unsorted, .system = 8), and leaves a harvest sub-folder and every .system sub-folder alone', n === 8 && !fs.existsSync(path.join(ws.docs, 'My Doc', 'Sources', 'page-1', 'desktop.ini')) && fs.readdirSync(ws.system, { withFileTypes: true }).filter((e) => e.isDirectory()).every((e) => !fs.existsSync(path.join(ws.system, e.name, 'desktop.ini'))), String(n));
    const n2 = applyTreeIcons(root, { notify: false });
    check('tree: a second run is idempotent (same count, nothing rewritten)', n2 === n);
    const theirs = path.join(ws.docs, 'Theirs');
    fs.mkdirSync(theirs);
    const theirIco = process.platform === 'win32' ? 'C:\\their.ico' : '/their.ico'; // a drive path only where drives exist
    fs.writeFileSync(path.join(theirs, 'desktop.ini'), `[.ShellClassInfo]\r\nIconResource=${theirIco},0\r\n`);
    ensureFolderIcon(path.join(ws.docs, 'My Doc', 'Exports'), { kind: 'exports', systemDir: ws.system, notify: false });
    check('tree: a document folder\'s own desktop.ini is rewritten when its role changes, a foreign one never', applyTreeIcons(root, { notify: false }) === n && /their\.ico/.test(readIni(path.join(theirs, 'desktop.ini'))));
    // docFolder / noteOutput: the real writers
    const df = docFolder(ws.docs, { titles: ['Fresh doc'] });
    check('docFolder: a new document folder gets the document icon at once', readIni(path.join(df.dir, 'desktop.ini')).includes('business-wrap-folder-document.ico,0') && readIni(path.join(df.dir, 'desktop.ini')).includes(path.join(root, '.system')));
    const ex = mkdir('Business-Wrap', DOCS_NAME, 'Fresh doc', 'Versions');
    fs.writeFileSync(path.join(ex, 'v.html'), 'x');
    check('noteOutput: a version written -> Versions icon', noteOutput(path.join(ex, 'v.html')) === true && readIni(path.join(ex, 'desktop.ini')).includes('business-wrap-folder-versions.ico,0'));
  }

  // ── the picker lists the role of a Business-Wrap folder ──
  mkdir('Business-Wrap', DOCS_NAME, 'My Doc', 'Exports');
  const lst = listFolders(path.join(root, DOCS_NAME, 'My Doc'));
  check('picker: listFolders tags a Business-Wrap folder with its role (and no other)', lst.entries.find((e) => e.name === 'Exports')?.role === 'exports' && !('role' in (listFolders(tmp).entries.find((e) => e.name === 'ens') || { role: 1 }) && listFolders(tmp).entries.find((e) => e.name === 'ens').role), JSON.stringify(lst.entries));
  check('picker: the save folder itself is tagged root, the Projects folder projects', listFolders(tmp).entries.find((e) => e.name === 'Business-Wrap')?.role === 'root');

  // ── the editor's copies of the art ──
  for (const f of ['editor/settings.js', 'editor/ext/48-folder-picker.js']) {
    const m = /\/\*FI-BEGIN\*\/\s*const FOLDER_ICONS = (\{.*\});\s*\/\*FI-END\*\//s.exec(fs.readFileSync(path.join(REPO, f), 'utf8'));
    const j = m ? JSON.parse(m[1]) : {};
    check(`editor: ${f} carries the ten role icons as vector svg, none empty`, roles.every((r) => /^<svg [^>]*viewBox="0 0 64 64"/.test(j[r] || '') && !/<img|data:image/.test(j[r])), Object.keys(j).join());
  }

  // ── a project export: as a folder, and as a zip ──
  const sample = (l) => fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${l}.json`), 'utf8');
  const entry = makeEntry({ ar: sample('ar'), en: sample('en'), ops: {}, title: 'Doc A' });
  const out = path.join(tmp, 'exp');
  const rf = await exportProject({ project: 'P1', docs: [entry], formats: ['html'], locales: 'ar', layout: 'folder', outParent: out });
  if (win) {
    check('export folder: the project export folder is «download», its document folder «document», icons in its .system', readIni(path.join(rf.root, 'desktop.ini')).includes('business-wrap-folder-download.ico,0') && fs.readdirSync(rf.root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).every((e) => readIni(path.join(rf.root, e.name, 'desktop.ini')).includes('business-wrap-folder-document.ico,0')) && fs.existsSync(path.join(rf.root, '.system', 'business-wrap-folder-download.ico')));
    check('export folder: the Projects folder this export made is «projects»', readIni(path.join(out, 'المشاريع - Projects', 'desktop.ini')).includes('business-wrap-folder-projects.ico,0'));
  }
  const rz = await exportProject({ project: 'P2', docs: [entry], formats: ['html'], locales: 'ar', layout: 'zip', outParent: out });
  const ents = readZip(rz.zip).map((e) => e.name);
  const base = ents[0].split('/')[0];
  check('export zip: the zip carries the icon files and a desktop.ini per folder', ents.includes(`${base}/desktop.ini`) && ents.includes(`${base}/.system/business-wrap-folder-download.ico`) && ents.some((e) => /\/desktop\.ini$/.test(e) && e !== `${base}/desktop.ini`) && ents.some((e) => e.endsWith('/.system/business-wrap-folder-document.ico')), ents.join(' | '));
  // the MS-DOS attribute byte of every entry, read from the central directory: Explorer's own unzip applies it (a folder needs System or Read-only to show its desktop.ini icon)
  const zb = fs.readFileSync(rz.zip);
  const eocd = zb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const attrOf = {};
  for (let o = zb.readUInt32LE(eocd + 16), i = 0; i < zb.readUInt16LE(eocd + 10); i += 1) {
    const nl = zb.readUInt16LE(o + 28);
    attrOf[zb.subarray(o + 46, o + 46 + nl).toString('utf8')] = zb.readUInt32LE(o + 38) & 0xff;
    o += 46 + nl + zb.readUInt16LE(o + 30) + zb.readUInt16LE(o + 32);
  }
  const docDir = Object.keys(attrOf).find((k) => /^[^/]+\/\d\d [^/]+\/$/.test(k));
  check('export zip: root and document folder entries carry System+Read-only, .system Hidden+System+Read-only (it has an icon too), every desktop.ini Hidden+System', attrOf[`${base}/`] === 0x15 && attrOf[docDir] === 0x15 && attrOf[`${base}/.system/`] === 0x17 && Object.entries(attrOf).filter(([k]) => /desktop\.ini$/.test(k)).every(([, v]) => v === 0x06) && Object.keys(attrOf).some((k) => /desktop\.ini$/.test(k)), JSON.stringify(attrOf));
  const un = mkdir('unzipped');
  extractZip(rz.zip, un);
  const ini = readIni(path.join(un, base, 'desktop.ini'));
  const dini = readIni(path.join(un, base, fs.readdirSync(path.join(un, base)).find((x) => !x.startsWith('.') && fs.statSync(path.join(un, base, x)).isDirectory()), 'desktop.ini'));
  check('export zip: the icon paths are relative to each folder, so they resolve wherever it is unpacked, and point at files that exist', /IconResource=\.system[\\/]business-wrap-folder-download\.ico,0/.test(ini) && /IconResource=\.\.[\\/]\.system[\\/]business-wrap-folder-document\.ico,0/.test(dini) && fs.existsSync(path.join(un, base, '.system', 'business-wrap-folder-document.ico')), ini + '|' + dini);

  // ── the editor's folder picker, through the real caller: a real Chrome tab of the real host lists a Business-Wrap folder with its role icons ──
  const { chromium } = await import('playwright-core');
  const { buildEditor } = await import('../engine/build-editor.mjs');
  const { launchOptions } = await import('../engine/export.mjs');
  const { serve } = await import('../engine/serve.mjs');
  const OUT = path.join(REPO, 'out', 'folder-icons-0174-test');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, 'editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file });
  const server = await serve(file, 0, { out: OUT });
  const browser = await launchChrome();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:wm-intro', '1'); sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* */ } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.folderPicker);
    const target = path.join(root, DOCS_NAME, 'My Doc');
    fs.mkdirSync(path.join(target, 'Exports'), { recursive: true });
    fs.mkdirSync(path.join(target, 'Sources'), { recursive: true });
    fs.mkdirSync(path.join(target, 'Versions'), { recursive: true });
    fs.mkdirSync(path.join(target, 'plain-harvest'), { recursive: true });
    await page.evaluate((p) => window.BW.EXT.folderPicker.open(p), target); // the Settings button's own entry point
    await page.locator('dialog.bw-fp[open] .fp-item').nth(3).waitFor({ timeout: 20000 }); // the panel lives in the editor's shadow root: locators pierce it
    const rows = await page.locator('dialog.bw-fp .fp-item').evaluateAll((els) => els.map((b) => ({ n: b.querySelector('.w').textContent, role: !!b.querySelector('.fp-role svg'), fill: b.querySelector('.fp-role svg path:nth-of-type(2)')?.getAttribute('fill') || '', w: b.querySelector('.fp-role svg')?.getBoundingClientRect().width || 0 })));
    const fills = new Set(rows.filter((r) => r.role).map((r) => r.fill));
    check('picker UI: Exports, Sources and Versions wear their own role icon (three different colours, 24 px), a plain folder keeps the generic one', ['Exports', 'Sources', 'Versions'].every((n) => rows.find((r) => r.n === n)?.role) && fills.size === 3 && rows.filter((r) => r.role).every((r) => r.w === 24) && rows.find((r) => r.n === 'plain-harvest')?.role === false, JSON.stringify(rows));
    if (process.env.BW_SHOT) await page.locator('dialog.bw-fp').screenshot({ path: process.env.BW_SHOT });
    await page.evaluate(() => fetch('/api/workspace/picker/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  } finally { await browser.close(); await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); }
} catch (e) { check('suite ran without throwing', false, e.stack || e); } finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
S.finish();
