import './_isolate.mjs';
// 0.14.0 brand-files: every output carries the Business-Wrap badge it can carry.
//   HTML: the favicon (inline data URI, CSP-safe) in every editor HTML, AR and EN editions
//   DOCX: docProps/thumbnail.png + content type + relationship;  PDF: Creator/Producer + page-1 /Thumb
//   Folder: ensureFolderIcon writes desktop.ini + hidden/system attributes, idempotent, never throws
//   node tests/brand-files-0140.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, exportDocx, loadTheme } from '../engine/export.mjs';
import { py } from '../engine/py.mjs';
import { badgePng, badgeDataUri, faviconLink, ensureFolderIcon } from '../engine/brand-icons.mjs';
import { sample } from './fixtures/doc-model/util.mjs';

let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ' :: ' + String(detail).slice(0, 300)}`); };
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const tmp = fs.mkdtempSync(path.join(process.env.BW_TEST_SANDBOX || os.tmpdir(), 'bw-brandfiles-'));
const run = (code, args, deps) => spawnSync(...py(['-c', code, ...args], deps), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });

// 0. the icon set: PNG sizes, multi-size ICO, SVG
for (const k of ['pdf', 'docx', 'html', 'folder']) {
  const sizes = [16, 32, 48, 64, 128, 256];
  check(`${k}: PNG at 16/32/48/64/128/256`, sizes.every((s) => badgePng(k, s)?.subarray(0, 8).equals(PNG)));
  const ico = fs.readFileSync(path.join(REPO, 'brand', 'v3', 'file-icons', `${k}.ico`));
  check(`${k}.ico: ICONDIR with ${sizes.length} frames`, ico.readUInt16LE(2) === 1 && ico.readUInt16LE(4) === sizes.length, ico.readUInt16LE(4));
  check(`${k}.svg exists`, fs.existsSync(path.join(REPO, 'brand', 'v3', 'file-icons', `${k}.svg`)));
}

// 1. HTML: the favicon in the editor file (AR and EN), the CSP still allows it, the saved copy carries it
const theme = loadTheme();
for (const ui of ['ar', 'en']) {
  const file = path.join(tmp, `editor-${ui}.html`);
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'brandfiles', watermarkDir: null, ui });
  const html = fs.readFileSync(file, 'utf8');
  const m = /<link rel="icon" type="image\/png" sizes="64x64" href="data:image\/png;base64,([A-Za-z0-9+/=]+)">/.exec(html);
  check(`HTML ${ui}: a data-URI favicon is in <head>`, !!m && html.indexOf(m[0]) < html.indexOf('</head>'));
  check(`HTML ${ui}: the favicon is exactly the HTML badge`, !!m && Buffer.from(m[1], 'base64').equals(badgePng('html', 64)));
  check(`HTML ${ui}: CSP img-src allows data:`, /img-src data:/.test(html));
}
check('faviconLink() uses data: and is empty-safe', faviconLink('html').includes('href="data:image/png;base64,') && faviconLink('nope') === '' && badgeDataUri('nope') === '');
// the real caller: the built editor in a browser exposes the link that editor.js saveHtml copies into the saved file
const browser = await chromium.launch({ ...launchOptions(), headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`file:///${path.join(tmp, 'editor-ar.html').replace(/\\/g, '/')}`);
  await page.waitForSelector('#bw-app', { state: 'attached' });
  const saved = await page.evaluate(() => document.head.querySelector('link[rel~="icon"]')?.outerHTML || '');
  check('HTML: the opened editor exposes the icon link to saveHtml', saved.startsWith('<link rel="icon"') && saved.length > 200, saved.slice(0, 80));
  check('editor.js saveHtml copies that link into the saved file', fs.readFileSync(path.join(REPO, 'editor', 'editor.js'), 'utf8').includes("link[rel~=\"icon\"]"));
} finally { await browser.close(); }

// 2. DOCX, both editions
for (const locale of ['ar', 'en']) {
  const docx = path.join(tmp, `x-${locale}.docx`);
  exportDocx(sample(REPO, locale), { locale, theme, docxPath: docx, embedFonts: false });
  const code = 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip());t=z.read("docProps/thumbnail.jpeg");print(t.hex()==open(sys.argv[2],"rb").read().hex());print(t[:2].hex());print(z.read("_rels/.rels").decode().count("metadata/thumbnail"));print(z.namelist().count("docProps/thumbnail.jpeg"));print("docProps/thumbnail.png" in z.namelist());print("jpeg" in z.read("[Content_Types].xml").decode())';
  const r = run(code, [docx, path.join(REPO, 'brand', 'v3', 'file-icons', 'docx-256.jpg')], []);
  const [bad, same, magic, rels, count, png, ct] = r.stdout.trim().split(/\r?\n/);
  check(`DOCX ${locale}: zip intact, thumbnail part is the DOCX badge JPEG, one copy`, bad === 'None' && same === 'True' && magic === 'ffd8' && count === '1' && png === 'False', r.stderr || r.stdout);
  check(`DOCX ${locale}: exactly one thumbnail relationship, jpeg content type`, rels === '1' && ct === 'True', r.stdout);
  const reopen = run('import docx,sys;d=docx.Document(sys.argv[1]);print(len(d.paragraphs)>0)', [docx], ['python-docx', 'lxml']);
  check(`DOCX ${locale}: still opens in python-docx`, reopen.stdout.trim() === 'True', reopen.stderr);
}

// 3. PDF
const pdf = path.join(tmp, 'x.pdf');
await exportPdf(sample(REPO, 'ar'), { locale: 'ar', theme, pdfPath: pdf });
const q = run('import pymupdf,sys;d=pymupdf.open(sys.argv[1]);m=d.metadata;print(m["creator"]);print(m["producer"]);t=d.xref_get_key(d[0].xref,"Thumb");print(t[0]);x=int(t[1].split()[0]);print(d.xref_get_key(x,"Width")[1]);print(len(d.xref_stream(x))>1000);print(d.page_count)', [pdf], ['pymupdf']);
const [creator, producer, kind, width, hasData, pages] = q.stdout.trim().split(/\r?\n/);
check('PDF: Creator and Producer are Business-Wrap', creator === 'Business-Wrap' && producer === 'Business-Wrap', q.stderr || q.stdout);
check('PDF: page 1 has a /Thumb image (128 px badge)', kind === 'xref' && width === '128' && hasData === 'True', q.stdout);
check('PDF: still a multi-page document', Number(pages) > 1, pages);

// 4. the document folder icon
if (process.platform === 'win32') {
  const root = path.join(tmp, 'Docs');
  const dir = path.join(root, 'عقد التوريد');
  fs.mkdirSync(dir, { recursive: true });
  check('folder icon: placed', ensureFolderIcon(dir) === true);
  const ini = path.join(dir, 'desktop.ini');
  const txt = fs.readFileSync(ini, 'latin1');
  const icoPath = path.join(root, '.system', 'business-wrap-folder.ico');
  check('folder icon: desktop.ini names the icon kept in .system', txt.includes('[.ShellClassInfo]') && fs.existsSync(icoPath), txt);
  const at = spawnSync('attrib', [ini], { encoding: 'utf8' }).stdout;
  const dat = spawnSync('attrib', ['/D', dir], { encoding: 'utf8' }).stdout;
  check('folder icon: desktop.ini hidden+system, folder system (Arabic name)', /S/.test(at.slice(0, 12)) && /H/.test(at.slice(0, 12)) && /S/.test(dat.slice(0, 12)), at + dat);
  check('folder icon: idempotent (second call, same file)', ensureFolderIcon(dir) === true && fs.readFileSync(ini, 'latin1') === txt);
}
check('folder icon: a missing folder returns false, never throws', ensureFolderIcon(path.join(tmp, 'nope', 'x')) === false);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `\n${fails} FAILED` : '\nbrand-files-0140: all passed');
process.exit(fails ? 1 : 0);
