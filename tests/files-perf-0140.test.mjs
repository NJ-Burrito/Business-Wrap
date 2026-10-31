// 0.14.0 lane files-perf: D1 typing/hover performance (the toolbar fit no longer re-measures the whole bar on every key),
// D2 «افتح المجلد / Open folder» after the performance report PDF, D3 the report without edits and with four more chart kinds,
// D4 Save (in place) vs «حفظ نسخة جديدة / Save as new copy» (Versions\) vs Export HTML. Headless Edge, closed at the end.
//
//   node tests/files-perf-0140.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { BWLOG1 as L } from '../engine/ledger-v1.mjs';
import { reportData, reportHtml, exportReport, lineChart, donutChart, columnChart, heatChart, niceMax } from '../engine/report.mjs';
import { serve } from '../engine/serve.mjs';
import { config } from '../engine/config.mjs';
import * as W from '../engine/workspace.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fp140-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_REVEAL_STUB = path.join(tmp, 'reveal.log');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  files-perf: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const pop = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdffonts.exe')));
const tool = (n) => (pop ? path.join(pop, n) : n);
const file = path.join(tmp, 'fp.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'fp140', watermarkDir: null });
const revealed = () => { try { return fs.readFileSync(process.env.BW_REVEAL_STUB, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
const frame = (page) => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));

// ── the report data: two people, three weeks, three documents ─────────────────────────────────────
const kA = await L.newKeys(), kB = await L.newKeys();
const al = { id: 'actor-alaa', name: 'Alaa' }, mk = { id: 'actor-mark', name: 'Mark' };
const t0 = Date.parse('2026-10-05T08:00:00Z');
const at = (days, min) => new Date(t0 + days * 864e5 + min * 6e4).toISOString();
const mkLog = async (doc, who, keys, days, extra = []) => {
  const lg = { doc, entries: [] };
  await L.append(lg, { kind: 'open', actor: who, keys, at: at(days[0], 0), data: { title: `وثيقة متطلبات: خدمة ${doc}` } });
  for (const d of days) for (let i = 1; i <= 4; i++) await L.append(lg, { kind: 'op', actor: who, keys, at: at(d, i), data: { ed: 'ar', op: { op: 'setText', path: `/p${i}`, value: `v${d}${i}`, old: '', id: `${doc}.${d}.${i}` } } });
  for (const e of extra) await L.append(lg, { ...e, actor: who, keys });
  return lg;
};
const logs = [
  await mkLog('doc-a', al, kA, [0, 7, 14], [{ kind: 'export', at: at(14, 10), data: { pdf: true } }, { kind: 'sign', at: at(14, 11) }]),
  await mkLog('doc-b', mk, kB, [0, 7], [{ kind: 'export', at: at(7, 10), data: { pdf: true } }]),
  await mkLog('doc-c', al, kA, [7]),
];
const data = reportData(logs, { from: '2026-10-01', to: '2026-10-31' });

// ── D3 the report: no edits, five chart kinds, both editions ──────────────────────────────────────
for (const lang of ['ar', 'en']) {
  const html = reportHtml(data, { lang });
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  check(`D3 ${lang}: no edit count anywhere (tiles, charts, table, story)`, !(lang === 'ar' ? /تعديل|التعديلات/ : /\bedits?\b|Edits/i).test(body), body.match(lang === 'ar' ? /.{20}تعديل.{20}/ : /.{20}edit.{20}/i)?.[0]);
  check(`D3 ${lang}: five chart kinds — line (polyline), donut (dash circles), columns, heat map, bars`, (html.match(/<svg /g) || []).length === 5 && /<polyline /.test(html) && /stroke-dasharray="[\d.]+ [\d.]+"/.test(html) && (html.match(/<rect /g) || []).length >= 10, String((html.match(/<svg /g) || []).length));
}
check('D3: the model carries no edits (people and documents)', data.people.length === 2 && data.people.every((p) => !('edits' in p)) && data.docs.every((x) => !('edits' in x)) && data.weeks.length === 3, JSON.stringify(data.weeks));
{
  const empty = reportHtml(reportData([], { from: '2026-10-01', to: '2026-10-31' }), { lang: 'en' });
  check('D3 edge: no activity → no charts, the «no recorded activity» line', !/<svg /.test(empty) && /No recorded activity/.test(empty));
  const one = lineChart([{ k: '2026-10-05', v: 2 }]), z = columnChart([{ k: 'x', v: 0 }]), hz = heatChart([{ k: 'x', cells: [0, 0] }], ['2026-10-05', '2026-10-12']);
  check('D3 edge: one week, all-zero columns and an all-zero heat map still draw (no NaN)', [one, z, hz, donutChart([{ k: 'a', v: 0, c: '#000' }])].every((s) => /^<svg /.test(s) && !/NaN|Infinity/.test(s)) && niceMax(0) === 1 && niceMax(7.3) === 10 && niceMax(2.2) === 2.5);
}
const browser = await chromium.launch(launchOptions());
let server = null;
const errors = [];
try {
  {
    const pg = await browser.newPage();
    for (const lang of ['ar', 'en']) {
      await pg.setContent(reportHtml(data, { lang }));
      const out = await pg.evaluate(() => [...document.querySelectorAll('svg.chart')].flatMap((s) => { const w = s.viewBox.baseVal.width; return [...s.querySelectorAll('text')].map((x) => { const b = x.getBBox(); return { t: x.textContent, l: b.x, r: b.x + b.width, w }; }); }).filter((b) => b.l < -0.5 || b.r > b.w + 0.5));
      check(`D3 ${lang}: every chart label inside its chart`, out.length === 0, JSON.stringify(out.slice(0, 3)));
    }
    await pg.close();
  }
  {
    const pdf = path.join(tmp, 'rep', 'r.pdf');
    await exportReport(logs, { from: '2026-10-01', to: '2026-10-31', lang: 'ar', pdfPath: pdf });
    const fonts = spawnSync(tool('pdffonts'), [pdf], { encoding: 'utf8' }).stdout || '';
    const txt = spawnSync(tool('pdftotext'), ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8' }).stdout || '';
    const faces = fonts.split('\n').slice(2).filter(Boolean);
    check('D3 PDF (Arabic): Thmanyah only, TrueType, the people named, no edits word', faces.length > 0 && faces.every((l) => /thmanyah/i.test(l) && /TrueType/.test(l)) && txt.includes('Alaa') && !/تعديل/.test(txt), fonts + txt.slice(0, 200));
  }

  // ── D1 performance, through the real editor ─────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`file:///${file.replace(/\\/g, '/')}`);
    await p.waitForFunction(() => window.BW?.ready);
    await p.waitForTimeout(800);
    const sel = 'main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]';
    await p.locator(sel).focus();
    await p.keyboard.press('End');
    await p.evaluate(() => { window.__m = 0; new MutationObserver((l) => { window.__m += l.length; }).observe(document.getElementById('bw-ui-host').shadowRoot, { subtree: true, childList: true, attributes: true, characterData: true }); });
    await p.keyboard.type('x'); // the first key may enable Undo (a real change of the bar)
    await frame(p);
    await p.evaluate(() => { window.__m = 0; });
    for (let i = 0; i < 20; i++) { await p.keyboard.press(i % 6 === 5 ? 'Space' : 'a'); await frame(p); }
    const muts = await p.evaluate(() => window.__m);
    check('D1: 20 keystrokes cause < 150 toolbar DOM mutations (0.13.3 made ~5,300: the fit re-measured the bar on every key; what is left is the change counter and the selection text)', muts < 150, String(muts));
    const fits = async () => p.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('.island'); return b.scrollWidth - b.clientWidth; });
    check('D1: typing keeps the bar fitted (no sideways scroll)', (await fits()) <= 0);
    await p.setViewportSize({ width: 1100, height: 800 });
    await p.waitForTimeout(500);
    const narrow = await fits();
    await p.setViewportSize({ width: 1600, height: 900 });
    await p.waitForTimeout(500);
    check('D1: a window resize still refits the bar (forced past the skip), narrow and wide', narrow <= 0 && (await fits()) <= 0, String(narrow));
    // selecting a block changes the bar's markup: the fit runs again and the bar still fits (Arabic edition, RTL)
    await p.setViewportSize({ width: 1366, height: 768 });
    await p.waitForTimeout(400);
    await p.locator(sel).click();
    await p.waitForTimeout(400);
    const afterSel = await p.evaluate(() => { const b = document.getElementById('bw-ui-host').shadowRoot.querySelector('.island'); return { over: b.scrollWidth - b.clientWidth, hasSel: b.classList.contains('has-sel'), dir: getComputedStyle(b).direction }; });
    check('D1: a selection changes the bar and it is fitted again at 1366 px (RTL)', afterSel.over <= 0 && afterSel.hasSel, JSON.stringify(afterSel));
    await ctx.close();
  }

  // ── served: D2 open folder, D4 the three saves ──────────────────────────────────────────────────
  const parent = path.join(tmp, 'parent');
  fs.mkdirSync(parent);
  W.setParent(parent);
  server = await serve(file, 0, { workspace: true });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (u, b) => { const r = await fetch(base + u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  const ws = W.workspace();
  {
    const dirs = W.ensure(ws).dirs;
    fs.mkdirSync(dirs.history, { recursive: true });
    const stem = 'doc-fp-1';
    fs.writeFileSync(path.join(dirs.history, `${stem}.bwlog`), await L.seal(logs[0]));
    fs.writeFileSync(path.join(dirs.history, `${stem}.heads.json`), JSON.stringify(L.mirrorOf(logs[0], null, {})));
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('bw:profile', JSON.stringify({ name: 'Alaa' })));
    const s = await ctx.newPage();
    s.on('pageerror', (e) => errors.push(e.message));
    await s.goto(`${base}/`);
    await s.waitForFunction(() => window.BW?.ready);
    const sh = (fn) => s.evaluate((f) => new Function('r', `return (${f})(r)`)(document.getElementById('bw-ui-host').shadowRoot), String(fn));
    await s.evaluate(() => window.BW.openDrawer('settings'));
    await s.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.set-x-report [data-person]').length >= 1);
    check('D2: no «Open folder» button before a report is made', !(await sh((r) => !!r.querySelector('[data-rp="open"]'))));
    await sh((r) => { r.querySelector('.set-x-report [data-rp="from"]').value = '2026-10-01'; r.querySelector('.set-x-report [data-rp="to"]').value = '2026-10-31'; r.querySelector('.set-x-report [data-rp="go"]').click(); });
    await s.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.set-x-report [data-rp="open"]'), null, { timeout: 90000 });
    const btn = await sh((r) => { const b = r.querySelector('.set-x-report [data-rp="open"]'); return { file: b.dataset.file, text: b.textContent.trim(), icon: !!b.querySelector('svg'), out: r.querySelector('.set-x-report [data-rp="out"]').textContent }; });
    check('D2: after the report PDF the button «افتح المجلد» (UI Arabic) sits beside the result, with a glyph, and the result names the file', btn.text === 'افتح المجلد' && btn.icon && fs.existsSync(btn.file) && btn.out.includes(path.basename(btn.file)), JSON.stringify(btn));
    await sh((r) => r.querySelector('.set-x-report [data-rp="open"]').click());
    await s.waitForFunction(() => document.documentElement.dataset.bwReportFolder);
    const rv = revealed().at(-1);
    check('D2: clicking it asks the file manager to show THAT pdf (Arabic file name kept)', document_ok(rv, btn.file), JSON.stringify(rv));
    // the route refuses anything outside the documents folder
    const outside = path.join(tmp, 'outside.txt');
    fs.writeFileSync(outside, 'x');
    const before = revealed().length;
    const r1 = await post('/api/workspace/open', { file: outside });
    const r2 = await post('/api/workspace/open', { file: path.join(ws.dirs.docs, '..', 'outside.txt') });
    const r3 = await post('/api/workspace/open', { file: path.join(ws.dirs.docs, 'nope', 'missing.pdf') });
    const r4 = await post('/api/workspace/open', {});
    check('D2 edge: a path outside the documents folder, a ../ path and a missing file are 404 and open nothing; no file = the root as before', r1.s === 404 && r2.s === 404 && r3.s === 404 && revealed().length === before + 1 && r4.s === 200 && !!r4.j.root, JSON.stringify([r1.s, r2.s, r3.s, r4.s]));
    // English UI: the same button, English words
    await s.evaluate(() => { window.BW.S.ui = 'en'; });
    check('D2: the English words exist', await s.evaluate(() => window.BW.EXT.reportFolder && true) && true);
    await ctx.close();
  }
  {
    // D4 the engine: a copy is a NEW file in Versions\, the document's file is not touched
    const mk = (word) => `<!doctype html><html lang="ar"><head><title>t</title></head><body><p>${word}</p><script type="application/json" id="bw-data">${JSON.stringify({ services: [] })}</script></body></html>`;
    const a = await post('/api/workspace/html', { title: 'خدمة النسخ', locale: 'ar', html: mk('one') });
    const own = a.j.file;
    const c1 = await post('/api/workspace/html', { title: 'خدمة النسخ', locale: 'ar', html: mk('two'), copy: true });
    const c2 = await post('/api/workspace/html', { title: 'خدمة النسخ', locale: 'ar', html: mk('two'), copy: true });
    const inV = (f) => path.basename(path.dirname(f)) === 'Versions' && path.dirname(path.dirname(f)) === path.dirname(own);
    check('D4: Save as new copy writes a NEW dated file in the document\'s Versions folder; the document\'s own file is untouched', a.s === 200 && c1.s === 200 && c1.j.copy === true && inV(c1.j.file) && /\d{4}-\d\d-\d\d \d\d-\d\d .* - copy\.html$/.test(c1.j.file) && fs.readFileSync(own, 'utf8') === mk('one') && fs.readFileSync(c1.j.file, 'utf8') === mk('two'), JSON.stringify([a.j, c1.j]));
    check('D4 edge: the same copy twice in one minute is two files (" (2)"), never an overwrite', c2.s === 200 && c2.j.file !== c1.j.file && fs.existsSync(c1.j.file) && fs.existsSync(c2.j.file), JSON.stringify([c1.j.file, c2.j.file]));
    const a2 = await post('/api/workspace/html', { title: 'خدمة النسخ', locale: 'ar', html: mk('three') });
    check('D4: plain Save HTML posts (no copy flag) still overwrite in place and keep the old file in Versions', a2.s === 200 && a2.j.file === own && a2.j.overwritten === true && fs.readFileSync(own, 'utf8') === mk('three') && a2.j.version && inV(a2.j.version), JSON.stringify(a2.j));
  }
  {
    // D4 through the real caller: File › Save HTML in the served editor
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
    const s = await ctx.newPage();
    s.on('pageerror', (e) => errors.push(e.message));
    await s.goto(`${base}/`);
    await s.waitForFunction(() => window.BW?.ready);
    await s.waitForTimeout(600);
    const labels = await s.evaluate(() => ({ ar: window.BW.S.ui, text: document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-a="saveHtml"] .w, [data-a="saveHtml"]')?.textContent?.trim() || '' }));
    const nameAr = await s.evaluate(() => { const I = window.BW; return I.S.ui; });
    const vdirs = () => { const out = []; const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (path.basename(path.dirname(p)) === 'Versions' && / - copy( \(\d+\))?\.html$/.test(e.name)) out.push(p); } }; walk(ws.dirs.docs); return out; };
    const n0 = vdirs().length;
    await s.evaluate(() => window.BW.runAction('saveHtml'));
    await s.waitForFunction(() => document.documentElement.dataset.bwSavedCopy, null, { timeout: 60000 });
    const n1 = vdirs().length;
    const toast1 = await s.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.toast')?.textContent || '');
    await s.evaluate(() => { delete document.documentElement.dataset.bwSavedCopy; });
    await s.keyboard.press('End').catch(() => {});
    await s.evaluate(() => window.BW.runAction('saveHtml'));
    await s.waitForFunction(() => document.documentElement.dataset.bwSavedCopy, null, { timeout: 60000 });
    const n2 = vdirs().length;
    check('D4 (real caller): File › Save HTML creates a new copy file in Versions each time (1 then 2 more), and the toast says where + offers «افتح المجلد»', n1 === n0 + 1 && n2 === n0 + 2 && /Versions/.test(toast1) && /افتح المجلد|Open folder/.test(toast1), JSON.stringify({ n0, n1, n2, toast1 }));
    const words = await s.evaluate(() => Object.fromEntries([...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('[data-a="save"],[data-a="saveHtml"],[data-a="export.html"]')].map((e) => [e.dataset.a, e.textContent.trim()])));
    const src = fs.readFileSync(path.join(REPO, 'editor', 'ext', '10-library.js'), 'utf8');
    check('D4: the labels tell the three saves apart — «حفظ» / «حفظ نسخة جديدة» / «تصدير HTML (نسخة نظيفة)» (and English: Save as new copy, Export HTML (clean copy))', words.save === 'حفظ' && words.saveHtml === 'حفظ نسخة جديدة' && /نسخة نظيفة/.test(words['export.html']) && /saveHtml: 'Save as new copy'/.test(src) && /'export.html': 'Export HTML \(clean copy\)'/.test(src), JSON.stringify(words));
    await ctx.close();
  }
  check('no page error', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server?.close(); server?.closeAllConnections?.();
  fs.rmSync(tmp, { recursive: true, force: true });
}
// Windows selects the file in Explorer (/select,"<file>"); macOS reveals it (open -R <file>); Linux has no select verb, so the host opens
// the file's folder (xdg-open <dir>): the folder is the file's own, never the documents root.
function document_ok(rv, f) {
  if (!rv) return false;
  const a = JSON.stringify(rv.args || []);
  if (process.platform === 'win32') return a.includes(path.basename(f)) && String(rv.args?.[0] || '').includes('/select');
  if (process.platform === 'darwin') return rv.cmd === 'open' && rv.args?.[0] === '-R' && a.includes(path.basename(f));
  return rv.cmd === 'xdg-open' && rv.args?.[0] === path.dirname(f);
}
if (failed) { console.log(`files-perf-0140: ${failed} FAILED`); process.exit(1); }
console.log('files-perf-0140: all passed');
