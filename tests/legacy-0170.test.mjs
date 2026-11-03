// 0.17.0 · legacy lane (owner notes P2 to P5 of 2026-11-03).
//   P2  zip project import: archives made by Windows PowerShell (Compress-Archive) and 7-Zip (default and UTF-8 names), with long Arabic
//       paths (past 260 characters) and Unicode names; archives whose names carry NO UTF-8 flag (OEM 720, Windows-1256, OEM 437: the way
//       older Windows and WinRAR write them) read back to the exact names. Explorer's own zip cannot be driven headless: not verified here.
//   P3  a click on the empty page puts the line caret; Enter and Backspace on the keyboard add and remove empty lines, both editions,
//       one undo step each (the 0.14.0 feature, checked again through real mouse and keys).
//   P4  a file opened straight from disk with an OLDER viewer offers one click that opens the server's current viewer and hands the
//       document over (edits kept); no banner when the viewer is current.
//   P5  add / delete a row of a story's ID card, also in the «معايير القبول» row that folds in after it: one undo step, both editions,
//       the card need not be stored first; an edit survives a hard browser crash 0.5 s and 1 s after it (library list copy).
//
//   node tests/legacy-0170.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { dirsOf } from '../engine/workspace.mjs';
import { importProject } from '../engine/project-import.mjs';
import { unzipTo } from '../engine/import/unzip.mjs';
import { lp } from '../engine/import/safe.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-l170-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  legacy-0170: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 700) : ''}`); if (!ok) failed += 1; };
const note = (n) => out.push(`NOTE  legacy-0170: ${n}`);
setTimeout(() => { console.log(`${out.join('\n')}\nFAILED: legacy-0170 stalled past 12 min`); process.exit(1); }, 12 * 60e3).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FX = path.join(REPO, 'tests', 'fixtures', 'legacy-0170');

/* ───────────────────────── P2: zips ───────────────────────── */
const base = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8'));
const PLACE = 'وثيقة متطلبات الخدمة: خدمة جديدة';
base.control.title = PLACE; delete base.control.coverTitle;
const setText = (p, value, i) => ({ op: 'setText', path: p, value, id: `t${i}`, at: '2026-11-02T10:00:00.000Z' });
const edition = (doc, name, n) => ({ name, raw: JSON.stringify(doc, null, 1), hash: 'sha256:x', ops: [setText('/control/title', `${PLACE.split(':')[0]}: ${name}`, 0), ...Array.from({ length: n - 1 }, (_, i) => setText('/control/owner', `owner ${name} ${i}`, i + 1))], status: {}, stale: [], comments: [], versions: [], marks: [], epochIds: [] });
const saveHtml = (title, editions) => `<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head><body><script type="application/json" id="bw-data">${JSON.stringify({ format: 1, services: [{ id: `doc-${crypto.randomUUID()}`, editions }] })}</script></body></html>`;
const A = 'عنوان تجريبي أول للخدمة';
const B = 'عنوان تجريبي ثان للخدمة الإلكترونية';
const D = `عنوان طويل جدا لمستند يوجد في ملف فقط ${'كلمة '.repeat(14)}`.trim();
const U = 'مستند يونيكود é ü ñ 日本';
const listFiles = (dir, rel = '') => fs.readdirSync(lp(dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name), `${rel}${e.name}/`) : [{ file: path.join(dir, e.name), rel: `${rel}${e.name}` }]));
const w = (root, rel, data) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(lp(path.dirname(f)), { recursive: true }); fs.writeFileSync(lp(f), data); return f.length; };
const treeRoot = path.join(tmp, 'tree');
const fixtureDir = path.join(treeRoot, 'Fixture');
const longest = Math.max(
  w(fixtureDir, `${A}/${A} - مشاركة.html`, saveHtml(`وثيقة: ${A}`, { ar: edition(base, A, 5) })),
  w(fixtureDir, `${D}/${D} - مشاركة.html`, saveHtml(`وثيقة: ${D}`, { ar: edition(base, D, 4) })),
  w(fixtureDir, `المستندات - Documents/${B}/${B}.html`, saveHtml(B, { ar: edition(base, B, 6) })),
  w(fixtureDir, `${U}/ملف é.txt`, 'unicode name'),
);
const expected = listFiles(fixtureDir).map((f) => `Fixture/${f.rel}`).sort();
check(`fixture: ${expected.length} files, the longest path is ${longest} characters (past 260)`, expected.length === 4 && longest > 260, String(longest));

const isWin = process.platform === 'win32'; // the PowerShell script and the 7-Zip paths below are Windows-only
const ps1 = path.join(tmp, 'zip.ps1');
fs.writeFileSync(ps1, `$ErrorActionPreference='Stop'\nCompress-Archive -Path "$env:BWT\\tree\\Fixture" -DestinationPath "$env:BWT\\ps.zip" -Force\n`);
const seven = ['C:\\Program Files\\7-Zip\\7z.exe', 'C:\\Program Files (x86)\\7-Zip\\7z.exe'].find((p) => fs.existsSync(p));
const zips = [];
if (isWin) {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { env: { ...process.env, BWT: tmp }, encoding: 'utf8' });
  if (r.status === 0 && fs.existsSync(path.join(tmp, 'ps.zip'))) zips.push(['Compress-Archive (Windows PowerShell)', path.join(tmp, 'ps.zip')]);
  else check('Compress-Archive made the zip', false, `${r.status} ${r.stderr}`.slice(0, 300));
  if (seven) {
    for (const [label, args, name] of [['7-Zip default names', [], '7z-def.zip'], ['7-Zip UTF-8 names (-mcu)', ['-mcu=on'], '7z-utf8.zip']]) {
      const z = path.join(tmp, name);
      const q = spawnSync(seven, ['a', '-tzip', ...args, z, fixtureDir], { encoding: 'utf8' });
      if (q.status === 0) zips.push([label, z]); else check(`${label} made the zip`, false, String(q.stdout).slice(-300));
    }
  } else note('7-Zip not installed: its two archives are not checked');
} else note('not Windows: Compress-Archive and 7-Zip archives are not checked');

const queue = async (docs) => ({ doc_id: docs.map((_, i) => `d${i}`) });
for (const [label, z] of zips) {
  const dir = path.join(tmp, `x-${path.basename(z, '.zip')}`);
  let r;
  try { r = unzipTo(z, dir); } catch (e) { check(`${label}: reads`, false, e.message); continue; }
  const got = r.files.map((f) => f.name).sort();
  check(`${label}: all ${expected.length} names come back exactly (long Arabic paths, Unicode), no problem`, JSON.stringify(got) === JSON.stringify(expected) && !r.problems.length, JSON.stringify({ got: got.map((x) => x.length), problems: r.problems }));
  const onDisk = r.files.every((f) => fs.existsSync(lp(f.file)) && fs.statSync(lp(f.file)).size === f.size);
  check(`${label}: every file is on disk at its full size`, onDisk);
  const imp = await importProject({ inputs: [z], queue });
  const titles = imp.came_in.map((c) => c.title).sort();
  check(`${label}: imported as a project: A, B and the long-path D once each under their real titles`, imp.came_in.length === 3 && [A, B, D].every((t) => titles.filter((x) => x === t).length === 1) && !imp.failed.length, JSON.stringify({ titles, failed: imp.failed }));
}

// names with NO UTF-8 flag, as older tools write them
const crc = (b) => zlib.crc32(b);
function rawZip(entries) {
  const parts = [], cd = [];
  let off = 0;
  for (const e of entries) {
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(crc(e.data), 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(e.name.length, 26);
    parts.push(lh, e.name, e.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(crc(e.data), 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(e.name.length, 28); ch.writeUInt32LE(off, 42);
    cd.push(ch, e.name);
    off += 30 + e.name.length + e.data.length;
  }
  const cdBuf = Buffer.concat(cd);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
const legacy = JSON.parse(fs.readFileSync(path.join(FX, 'legacy-names.json'), 'utf8'));
for (const c of legacy.cases) {
  const z = path.join(tmp, `${c.id}.zip`);
  fs.writeFileSync(z, rawZip([{ name: Buffer.from(c.hex, 'hex'), data: Buffer.from('<html>x</html>') }]));
  let r;
  try { r = unzipTo(z, path.join(tmp, `x-${c.id}`)); } catch (e) { check(`no-flag ${c.codepage} name «${c.id}»`, false, e.message); continue; }
  check(`no UTF-8 flag, ${c.codepage}: the name reads back exactly («${c.expect.slice(0, 24)}…»)`, r.files.length === 1 && r.files[0].name === c.expect && !r.problems.length, JSON.stringify(r.files.map((f) => f.name)));
}
{ // a hostile name still refuses the archive whole, whatever the code page
  const z = path.join(tmp, 'slip.zip');
  fs.writeFileSync(z, rawZip([{ name: Buffer.from('../evil.html'), data: Buffer.from('x') }]));
  let threw = false;
  try { unzipTo(z, path.join(tmp, 'x-slip')); } catch { threw = true; }
  check('a zip-slip name still refuses the whole archive (nothing written)', threw && !fs.existsSync(path.join(tmp, 'evil.html')));
}

/* ───────────────────────── editor fixture (P3, P5) ───────────────────────── */
const LAB = { ar: ['معايير القبول', 'جدول الإجراءات'], en: ['Acceptance criteria', 'Actions table'] };
const fx = path.join(tmp, 'event-permit');
fs.cpSync(path.join(REPO, 'samples', 'event-permit'), fx, { recursive: true });
for (const ed of ['ar', 'en']) {
  const fp = path.join(fx, `document.${ed}.json`);
  const dj = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const first = dj.chapters[0].sections[0].blocks[0];
  const para = (n) => ({ kind: 'prose', paragraphs: [`${ed === 'ar' ? 'فقرة' : 'Paragraph'} ${n}`] });
  dj.chapters[0].sections[0].blocks = [first, para(2), para(3), { kind: 'table', columns: ['A', 'B'], rows: [['1', '2']] }, para(5)];
  const sec = dj.chapters.flatMap((c) => c.sections).find((s) => s.blocks.some((b) => b.kind === 'stories'));
  sec.blocks = [
    { kind: 'stories', items: [{ id: 'US-01', name: 'Placeholder name', as: 'Placeholder user', goal: 'Placeholder goal' }] }, // no card stored: it prints the default
    { kind: 'subhead', text: LAB[ed][0] },
    { kind: 'prose', paragraphs: ['ACC-ONE', 'ACC-TWO', 'ACC-THREE'] },
  ];
  fs.writeFileSync(fp, JSON.stringify(dj, null, 1));
}
const editorFile = path.join(tmp, 'editor.html');
buildEditor({ inputs: [fx, path.join(REPO, 'samples', 'blank')], out: editorFile, set: 'legacy-test', watermarkDir: null, ui: 'en' });
const editorUrl = pathToFileURL(editorFile).href;

const servers = [];
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(editorUrl);
  await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.library);
  const doc = (ed) => page.evaluate((e) => { const B = window.BW; return JSON.parse(JSON.stringify(B.M[B.S.svc][e || B.S.ed].doc)); }, ed);
  const opsN = (ed) => page.evaluate((e) => { const B = window.BW; return B.M[B.S.svc][e || B.S.ed].ops.length; }, ed);
  const useEd = (ed) => page.evaluate((e) => { const B = window.BW; if (B.S.ed !== e && B.M[B.S.svc][e]) { B.S.ed = e; B.render(); } }, ed);
  await useEd('en');
  const secBlocks = async (ed) => (await doc(ed)).chapters[0].sections[0].blocks;
  const isBlank = (b) => b?.kind === 'prose' && b.paragraphs.every((p) => !String(p).trim());
  const SEC = '/chapters/0/sections/0/blocks';

  /* ── P3 ── */
  const clickMargin = async (ed, i, dy = 2) => {
    await page.evaluate(([e, k]) => { document.querySelector(`#bw-pair main.bw-doc[data-locale="${e}"] [data-b="/chapters/0/sections/0/blocks/${k}"]`).scrollIntoView({ block: 'center' }); }, [ed, i]);
    await page.evaluate(async () => { await document.fonts?.ready; await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))); });
    await page.waitForTimeout(250);
    const r = await page.evaluate(([e, k]) => { const main = document.querySelector(`#bw-pair main.bw-doc[data-locale="${e}"]`); const el = main.querySelector(`[data-b="/chapters/0/sections/0/blocks/${k}"]`); const m = main.getBoundingClientRect(), b = el.getBoundingClientRect(); return { x: m.left + 2, y: b.top }; }, [ed, i]);
    await page.mouse.click(r.x, r.y + dy);
  };
  const slot = () => page.evaluate(() => window.BW.EXT.w2lines.slot);
  const before = await secBlocks('en');
  const beforeAr = await secBlocks('ar');
  const n0 = await opsN();
  await clickMargin('en', 1);
  const s1 = await slot();
  check('P3: a click on the empty space of the page puts the line caret before the block under it', s1?.arr === SEC && s1.at === 1 && await page.evaluate(() => document.querySelectorAll('.bw-ln-caret').length) === 1, JSON.stringify(s1));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  let en = await secBlocks('en'), ar = await secBlocks('ar');
  check('P3: Enter twice adds two empty lines and pushes the content down (both editions)', en.length === before.length + 2 && isBlank(en[1]) && isBlank(en[2]) && ar.length === beforeAr.length + 2 && isBlank(ar[1]) && isBlank(ar[2]) && JSON.stringify(en[3]) === JSON.stringify(before[1]));
  await page.keyboard.press('Backspace');
  en = await secBlocks('en'); ar = await secBlocks('ar');
  check('P3: Backspace removes the empty line above the caret and pulls the content up (both editions)', en.length === before.length + 1 && ar.length === beforeAr.length + 1 && JSON.stringify(en[2]) === JSON.stringify(before[1]));
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Delete');
  en = await secBlocks('en');
  check('P3: Arrow Up, then Delete removes the empty line below the caret: the page is as it was', JSON.stringify(en) === JSON.stringify(before) && JSON.stringify(await secBlocks('ar')) === JSON.stringify(beforeAr));
  await page.keyboard.press('Enter');
  const n1 = await opsN();
  await page.evaluate(() => window.BW.undo());
  check('P3: one Enter is ONE undo step, in both editions', n1 === await opsN() + 1 && (await secBlocks('en')).length === before.length && (await secBlocks('ar')).length === beforeAr.length);
  await page.evaluate(() => window.BW.EXT.w2lines.clear());
  while (await opsN() > n0) await page.evaluate(() => window.BW.undo());
  check('P3: undo to the start leaves the document untouched', JSON.stringify(await secBlocks('en')) === JSON.stringify(before));

  /* ── P5: rows of a story's ID card ── */
  const cardState = () => page.evaluate(() => {
    const B = window.BW;
    const find = (ed) => { const d = B.M[B.S.svc][ed]?.doc; const sec = d?.chapters.flatMap((c) => c.sections).find((x) => x.blocks.some((b) => b.kind === 'stories')); return sec && { rows: sec.blocks[0].items[0].card?.rows?.length ?? 'unstored', blocks: sec.blocks.map((b) => b.kind).join(',') }; };
    return { ed: B.S.ed, ops: B.M[B.S.svc][B.S.ed].ops.length, ar: find('ar'), en: find('en'), printed: document.querySelectorAll('#bw-pair main.bw-doc .id-card tbody tr').length };
  });
  const foldCell = '#bw-pair main.bw-doc .id-card tr.ac td:first-child';
  await useEd('en');
  await page.waitForSelector(foldCell, { state: 'attached' });
  await page.locator(foldCell).first().scrollIntoViewIfNeeded();
  const c0 = await cardState();
  check('P5: ready state seen: the card prints a folded criteria row (last row, class ac) and nothing is stored yet', !!(await page.$(foldCell)) && c0.en.rows === 'unstored' && c0.en.blocks === 'stories,subhead,prose', JSON.stringify(c0));
  const nOps = (await cardState()).ops;
  await page.locator(foldCell).first().click();
  await page.evaluate(() => window.BW.runAction('rowAdd'));
  let c1 = await cardState();
  check('P5: add row in the folded criteria row: a stored row appears above it (both editions), the criteria row stays last', typeof c1.en.rows === 'number' && c1.ar.rows === c1.en.rows && c1.printed === c0.printed + 1 && await page.evaluate(() => [...document.querySelectorAll('#bw-pair main.bw-doc .id-card tbody tr')].at(-1).classList.contains('ac')), JSON.stringify({ c0, c1 }));
  await page.evaluate(() => window.BW.undo());
  let c2 = await cardState();
  check('P5: ONE undo takes the added row away and the card is not stored any more (no ghost step)', c2.ops === nOps && c2.en.rows === 'unstored' && c2.ar.rows === 'unstored' && c2.printed === c0.printed, JSON.stringify(c2));
  await page.evaluate(() => window.BW.redo());
  c2 = await cardState();
  check('P5: redo brings the row back in one step', c2.en.rows === c1.en.rows && c2.printed === c1.printed);
  await page.evaluate(() => window.BW.undo());
  await page.locator(foldCell).first().click();
  await page.evaluate(() => window.BW.runAction('rowDel'));
  c1 = await cardState();
  check('P5: delete row on the folded criteria row removes its subhead and prose (both editions), no empty op', c1.en.blocks === 'stories' && c1.ar.blocks === 'stories' && c1.ops === nOps + 2 && c1.printed === c0.printed - 1, JSON.stringify(c1));
  await page.evaluate(() => window.BW.undo());
  c2 = await cardState();
  const back = await doc('en');
  const secEn = back.chapters.flatMap((c) => c.sections).find((x) => x.blocks.some((b) => b.kind === 'stories'));
  check('P5: ONE undo brings the criteria row back, text intact', c2.ops === nOps && c2.en.blocks === 'stories,subhead,prose' && JSON.stringify(secEn.blocks[2].paragraphs) === JSON.stringify(['ACC-ONE', 'ACC-TWO', 'ACC-THREE']) && c2.ar.blocks === 'stories,subhead,prose', JSON.stringify(c2));
  // a row of the card above the criteria: add and delete are one undo step too, though the card was never stored
  await page.locator('#bw-pair main.bw-doc .id-card tr[data-r="1"] td:last-child').first().click();
  await page.evaluate(() => window.BW.runAction('rowAdd'));
  c1 = await cardState();
  check('P5: add row in an ordinary card row stores the card and the row as ONE step; both editions', typeof c1.en.rows === 'number' && c1.ar.rows === c1.en.rows && c1.ops === nOps + 2 /* stored + row, one group */, JSON.stringify(c1));
  await page.evaluate(() => window.BW.undo());
  c2 = await cardState();
  check('P5: one undo leaves nothing behind (card unstored, no ghost step)', c2.ops === nOps && c2.en.rows === 'unstored', JSON.stringify(c2));
  check('P5: the page raised no script error', errors.length === 0, errors.join(' | '));

  /* ── P4: an older viewer opened from disk ── */
  const host = async () => {
    const root = path.join(tmp, 'host', 'Business-Wrap');
    const ws = { parent: path.join(tmp, 'host'), root, chosen: true, dirs: dirsOf(root) };
    const server = await serve(editorFile, 0, { workspace: ws });
    servers.push(server);
    return server.address().port;
  };
  const port = await host();
  // the saved file: this editor's own Save-HTML with one edit, its viewer marked as an older version
  const sp = await ctx.newPage();
  await sp.goto(editorUrl);
  await sp.waitForFunction(() => window.BW?.ready && window.BW.EXT.library);
  await sp.evaluate(() => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; B.commit([{ op: 'setText', path: '/control/title', value: 'HANDOFF-MARK', old: e.doc.control.title }]); });
  const saved = await sp.evaluate(async () => (await window.BW.EXT.library.captureHtml()).text);
  await sp.close();
  const oldFile = path.join(tmp, 'old-saved.html');
  const withVersion = (html, v) => html.replace(/(<script type="application\/json" id="bw-data">)([\s\S]*?)(<\/script>)/, (_, a, j, b) => a + JSON.stringify({ ...JSON.parse(j), version: v }).replace(/</g, '\\u003c') + b);
  fs.writeFileSync(oldFile, withVersion(saved, '0.0.1'));
  const curFile = path.join(tmp, 'current-saved.html');
  const hostVersion = await (await fetch(`http://127.0.0.1:${port}/api/version`, { headers: { origin: 'null' } })).json();
  fs.writeFileSync(curFile, withVersion(saved, hostVersion.version));
  check('P4: fixture: the host answers a file page with its version', hostVersion.name === 'Business-Wrap' && !!hostVersion.version, JSON.stringify(hostVersion));

  const old = await ctx.newPage();
  await old.addInitScript(() => { try { localStorage.setItem('bw:seen-version', '0.0.1'); } catch { /* none */ } }); // no «what's new» card over the banner (a viewer seen before)
  await old.goto(pathToFileURL(oldFile).href);
  await old.waitForFunction(() => window.BW?.ready && window.BW.EXT.library?.captureHtml && window.BW.EXT.olv);
  check('P4: ready state seen: the old file shows its document (HANDOFF-MARK) in its own viewer', await old.evaluate(() => { const B = window.BW; return B.M[B.S.svc][B.S.ed].doc.control.title; }) === 'HANDOFF-MARK');
  const found = await old.evaluate((p) => window.BW.EXT.olv.check({ ports: [p] }), port);
  check('P4: the older viewer finds the newer server and offers the click', found?.port === port && found.version === hostVersion.version, JSON.stringify(found));
  const btn = old.getByRole('button', { name: 'Open with the current viewer' });
  check('P4: the banner is on screen with its one button', await btn.count() === 1 && /0\.0\.1/.test(await old.locator('.toasts .banner').first().innerText()), await old.locator('.toasts').innerText());
  const [popup] = await Promise.all([ctx.waitForEvent('page'), btn.click()]);
  await popup.waitForFunction(() => window.BW?.ready && window.BW.EXT.library, null, { timeout: 30000, polling: 250 });
  // watched from node, one question every 250 ms (a page behind another window gets neither animation frames nor steady timers)
  const tClick = Date.now();
  let got = null;
  for (let i = 0; i < 160 && !got; i += 1) {
    got = await popup.evaluate(async () => {
      const all = await window.BW.EXT.library.all();
      const e = Array.isArray(all) && all.find((x) => Object.values(x.editions || {}).some((ed) => (ed.ops || []).some((o) => o.value === 'HANDOFF-MARK')));
      return e && window.BW.S.svc === e.id ? { id: e.id, svc: window.BW.S.svc, title: e.title } : null;
    }).catch(() => null);
    if (!got) await sleep(250);
  }
  note(`P4 hand-off took ${Date.now() - tClick} ms from the click to the opened document`);
  const diag = got ? '' : JSON.stringify(await popup.evaluate(async () => ({ url: location.href, opener: !!window.opener, svc: window.BW.S.svc, entries: (await window.BW.EXT.library.all()).map((e) => ({ id: e.id, ops: Object.values(e.editions || {}).map((x) => (x.ops || []).map((o) => String(o.value).slice(0, 20))) })), toasts: document.querySelector('.toasts')?.innerText })).catch((e) => String(e)));
  check('P4: one click: the current viewer (served page) imported the document with its edit and opened it', !!got && got.svc === got.id, `${JSON.stringify(got)} ${diag} old: ${await old.locator('.toasts').innerText().catch(() => '')}`);
  check('P4: the served page is the server\'s own (http, same port) and the hand-off hash is gone', popup.url().startsWith(`http://127.0.0.1:${port}/`) && !/handoff/.test(popup.url()), popup.url());
  await popup.close();
  await old.close();

  const cur = await ctx.newPage();
  await cur.goto(pathToFileURL(curFile).href);
  await cur.waitForFunction(() => window.BW?.ready && window.BW.EXT.olv);
  const none = await cur.evaluate((p) => window.BW.EXT.olv.check({ ports: [p] }), port);
  const bannerText = async () => (await cur.locator('.toasts .banner').allInnerTexts()).join(' | ');
  check('P4: a file whose viewer is current gets no banner', none === null && !/viewer it was saved with/.test(await bannerText()), `${JSON.stringify(none)} ${await bannerText()}`);
  const nobody = await cur.evaluate(() => window.BW.EXT.olv.check({ ports: [1] }));
  check('P4: no server on this computer: no banner, no error', nobody === null && !/viewer it was saved with/.test(await bannerText()), `${JSON.stringify(nobody)} ${await bannerText()}`);
  await cur.close();
  await ctx.close();

  /* ── P5: a hard crash after an edit ── */
  const lo = launchOptions();
  const crashAfter = async (delay, n) => {
    const ud = path.join(tmp, `prof${n}`);
    let c = await chromium.launchPersistentContext(ud, { ...lo, viewport: { width: 1400, height: 900 } });
    let pg = c.pages()[0] || await c.newPage();
    await pg.goto(editorUrl);
    await pg.waitForFunction(() => window.BW?.ready && window.BW.EXT.library);
    const id = await pg.evaluate(async () => { const e = await window.BW.EXT.library.newDocument(); await window.BW.EXT.library.save(); return e.id; });
    await pg.waitForFunction((id) => window.BW.S.svc === id, id);
    await pg.waitForTimeout(900);
    const mark = `CRASH-${delay}-${Date.now()}`;
    await pg.evaluate((m) => { const B = window.BW; const e = B.M[B.S.svc][B.S.ed]; B.commit([{ op: 'setText', path: '/control/title', value: m, old: e.doc.control.title }]); }, mark);
    await pg.waitForTimeout(delay);
    const cdp = await c.newCDPSession(pg);
    cdp.send('Browser.crash').catch(() => {});
    await sleep(2500);
    await Promise.race([c.close().catch(() => {}), sleep(4000)]);
    c = await chromium.launchPersistentContext(ud, { ...lo, viewport: { width: 1400, height: 900 } });
    pg = c.pages()[0] || await c.newPage();
    await pg.goto(editorUrl);
    await pg.waitForFunction(() => window.BW?.ready && window.BW.EXT.library);
    const kept = await pg.evaluate(async ([id, m]) => { for (let i = 0; i < 40; i += 1) { const a = await window.BW.EXT.library.all(); if (Array.isArray(a)) { const e = a.find((x) => x.id === id); return !!e && Object.values(e.editions).some((ed) => (ed.ops || []).some((o) => o.value === m)); } await new Promise((r) => setTimeout(r, 500)); } return null; }, [id, mark]); // the profile may still be locked by the killed browser for a moment
    await Promise.race([c.close().catch(() => {}), sleep(4000)]);
    return kept;
  };
  check('P5: the browser process killed 0.5 s after an edit: the edit is in the list copy after the restart', await crashAfter(500, 1));
  check('P5: the browser process killed 1 s after an edit: the edit is in the list copy after the restart', await crashAfter(1000, 2));
} catch (e) {
  check('test run', false, e.stack || e);
} finally {
  await browser.close().catch(() => {});
  for (const s of servers) await new Promise((r) => s.close(r));
  try { fs.rmSync(lp(tmp), { recursive: true, force: true }); } catch { /* temp */ }
}
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed} legacy-0170 check(s)` : `legacy-0170: ${out.filter((x) => x.startsWith('PASS')).length} checks, all passed`);
process.exit(failed ? 1 : 0);
