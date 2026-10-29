// A20 feature audit (the 0.12.0 baseline method, checked in at 0.13.0). Not part of `npm test`: it drives a headed
// Microsoft Edge over a local server and reports, per feature, works / partial / broken, plus the works rate.
//   node tests/audit.probe.mjs [editor.html] [--headless] [--json <file>]
// Default editor: assets/editor/business-wrap.html. Own throw-away profile, server on a free port, exports and the save
// folder in a temp folder; everything it starts is closed at the end. Each feature is capped at 20 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const file = path.resolve(args.find((a, i) => !a.startsWith('--') && !['--json', '--svc', '--shots'].includes(args[i - 1])) || path.join(REPO, 'assets', 'editor', 'business-wrap.html'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-audit-'));
const wsRoot = path.join(tmp, 'Business-Wrap');
const ws = { parent: tmp, root: wsRoot, chosen: true, dirs: Object.fromEntries(['PDF', 'DOCX', 'HTML', 'HISTORY'].map((d) => [d.toLowerCase(), path.join(wsRoot, d)])) };
process.env.BW_PICK_STUB = tmp; // a folder question answers with the temp folder, never a dialog
const server = await serve(file, 0, { workspace: ws });
const url = `http://127.0.0.1:${server.address().port}/`;
const ctx = await chromium.launchPersistentContext(path.join(tmp, 'profile'), { channel: 'msedge', headless: flag('--headless'), viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); if (args.includes('--verbose')) console.log('PAGEERROR', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')); });
const rows = [];

/* ── helpers (page side) ─────────────────────────────────────────────── */
const ev = (fn, a) => page.evaluate(fn, a);
const ops = () => ev(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length);
const st = (k) => ev((k) => JSON.parse(JSON.stringify(window.BW.S[k] ?? null)), k);
/** the real toolbar button when one is visible (same handler as a pointer click), else the registry action */
const act = (id) => ev(async (id) => {
  const r = document.getElementById('bw-ui-host').shadowRoot;
  const b = [...r.querySelectorAll(`.island [data-a="${id}"]`)].find((x) => x.offsetParent && !x.closest('.menu'));
  if (b) { b.click(); return 'button'; }
  Promise.resolve(window.BW.runAction(id)).catch((e) => console.error(e)); // not awaited: a picker action waits for a file
  return 'action';
}, id);
const drawer = () => ev(() => window.BW.S.drawer || null);
const closeDrawers = () => ev(() => { const r = document.getElementById('bw-ui-host').shadowRoot; r.querySelector('.drawer [data-a="closeDrawer"], .drawer .x')?.click(); if (window.BW.S.drawer) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
const sel = (p) => page.locator(`main.bw-doc [data-p="${p}"]`).first().click();
const P0 = '/chapters/0/sections/0/blocks/0/paragraphs/0';
const CELL = '/chapters/1/sections/0/blocks/1/rows/0/1';
const wait = (ms) => page.waitForTimeout(ms);
const download = async (fn) => { const d = page.waitForEvent('download', { timeout: 8000 }).catch(() => null); await fn(); const x = await d; return x ? x.suggestedFilename() : null; };
const chooser = async (fn) => { const c = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null); await fn(); return c; };
const grew = async (id, prep) => { if (prep) await prep(); const a = await ops(); await act(id); await wait(250); const b = await ops(); return [b > a ? 'works' : 'broken', `ops ${a} → ${b}`]; };

// a check that edits leaves the sample as it found it (undo back to the count before)
const keep = (section, name, fn) => check(section, name, async () => { const n0 = await ops(); try { return await fn(); } finally { for (let k = 0; k < 40 && (await ops()) > n0; k += 1) await ev(() => window.BW.undo()); } });
const P1 = '/chapters/1/sections/0/blocks/0/paragraphs/0';
async function check(section, name, fn) {
  const nErr = errors.length;
  let out;
  try {
    out = await Promise.race([fn(), new Promise((_, no) => setTimeout(() => no(new Error('20 s cap')), 20000))]);
  } catch (e) { out = ['broken', String(e.message || e).split('\n')[0].slice(0, 140)]; }
  if (out[0] !== 'works' && opt('--shots')) { fs.mkdirSync(opt('--shots'), { recursive: true }); await page.screenshot({ path: path.join(opt('--shots'), `${section}-${name}`.replace(/[^\w.-]+/g, '_') + '.png') }).catch(() => {}); }
  const [verdict, detail = ''] = out;
  const pe = errors.slice(nErr);
  const v = pe.length && verdict === 'works' ? 'partial' : verdict;
  rows.push({ section, name, verdict: v, detail: detail + (pe.length ? ` · page error: ${pe[0].slice(0, 80)}` : '') });
  console.log(`${v.padEnd(7)} ${section} · ${name}  ${detail}`);
  await ev(() => {
    const r = document.getElementById('bw-ui-host').shadowRoot;
    for (const d of [...document.querySelectorAll('dialog[open]'), ...r.querySelectorAll('dialog[open]')]) d.close();
    r.querySelectorAll('.scrim:not([hidden])').forEach((x) => { x.hidden = true; });
    if (window.BW.S.drawer) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

try {
  await page.goto(url);
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 30000 });
  await wait(1500);
  // a resume / recovery question from the host is answered «new work» so the sweep starts clean
  await ev(() => { const r = document.getElementById('bw-ui-host').shadowRoot; r.querySelector('dialog[open] [data-k="new"], dialog[open] button:last-child')?.click(); });
  // the sample service (the skill bundle also carries the blank template, listed first), as in the 0.12.0 audit
  await ev((svc) => { const r = document.getElementById('bw-ui-host').shadowRoot; const sel = r.querySelector('[data-a="svc"]'); if (sel && [...sel.options].some((o) => o.value === svc)) { sel.value = svc; sel.dispatchEvent(new Event('change')); } }, opt('--svc') || 'event-permit');
  await wait(800);

  /* ── File ── */
  await check('File', 'save (library entry)', async () => {
    const a = await ev(() => window.BW.libSaved || 0);
    await act('save'); await wait(800);
    const b = await ev(() => window.BW.libSaved || 0);
    const n = await ev(() => (window.BW.EXT.library?.all?.() || []).length ?? 0).catch(() => 0);
    return [b > a ? 'works' : 'partial', `library saves ${a} → ${b}, entries ${n}`];
  });
  await check('File', 'saveHtml', async () => {
    const before = fs.existsSync(ws.dirs.html) ? fs.readdirSync(ws.dirs.html).length : 0;
    const name = await download(() => act('saveHtml'));
    await wait(1200);
    const after = fs.existsSync(ws.dirs.html) ? fs.readdirSync(ws.dirs.html).length : 0;
    return [name || after > before ? 'works' : 'broken', name ? `download ${name}` : `HTML\\ ${before} → ${after}`];
  });
  await check('File', 'exportEdits', async () => { const n = await download(() => act('exportEdits')); return [n ? 'works' : 'broken', n || 'no download']; });
  await check('File', 'exportAll', async () => { const n = await download(() => act('exportAll')); return [n ? 'works' : 'broken', n || 'no download']; });
  /* ── Insert ── */
  await check('Insert', 'image', async () => { const c = await chooser(() => act('image')); return [c ? 'works' : 'broken', c ? 'file chooser' : 'none']; });
  await check('Insert', 'logo', async () => { const c = await chooser(() => act('logo')); return [c ? 'works' : 'broken', c ? 'file chooser' : 'none']; });
  await keep('Insert', 'addPara (after the selected block)', () => grew('addPara', () => sel(P0)));
  await keep('Insert', 'addDiagram', () => grew('addDiagram'));

  /* ── Edit ── */
  await check('Edit', 'undo', async () => { await sel(P0); await ev(() => window.BW.runAction('addPara')); await wait(200); const a = await ops(); await act('undo'); await wait(200); const b = await ops(); return [b < a ? 'works' : 'broken', `ops ${a} → ${b}`]; });
  await check('Edit', 'redo (no freeze)', async () => { const a = await ops(); await act('redo'); await wait(300); const b = await ops(); await ev(() => window.BW.undo()); return [b > a ? 'works' : 'broken', `ops ${a} → ${b}`]; });
  await check('Edit', 'find', async () => { await act('find'); await wait(300); return [(await drawer()) === 'find' ? 'works' : 'broken', `drawer ${await drawer()}`]; });

  /* ── Document ── */
  for (const id of ['newdoc', 'process', 'outline', 'webhooks', 'check', 'history']) {
    await check('Document', id, async () => { await act(id); await wait(400); const d = await drawer(); return [d ? 'works' : 'broken', `drawer ${d}`]; });
  }
  await check('Document', 'renumber', async () => { await act('renumber'); await wait(300); return ['works', 'no error']; });
  await check('Document', 'pages (thumbnails)', async () => {
    await act('pages');
    const ok = await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer img, .drawer .thumb img'), null, { timeout: 15000 }).then(() => true).catch(() => false);
    return [ok ? 'works' : 'partial', ok ? 'thumbnails shown' : 'still preparing after 15 s'];
  });
  await keep('Document', 'check → jump to problem', async () => {
    await ev(() => { const d = window.BW.M[window.BW.S.svc][window.BW.S.ed].doc; window.BW.commit([{ op: 'replace', path: '/chapters/1/number', value: '9', old: d.chapters[1].number }]); }); await wait(200); // a known problem: chapter numbering
    await act('check'); await wait(400);
    const n = await ev(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer button.jump[data-go]').length);
    return [n ? 'works' : 'broken', `${n} jump buttons`];
  });
  await check('Document', 'history: back / forward (timeline)', async () => {
    const has = await ev(() => !!window.BW.EXT.timeline && !!window.BW.EXT.drawers.timeline);
    if (!has) return ['partial', 'no timeline'];
    await ev(() => window.BW.openDrawer('timeline')); await wait(300);
    const n = await ev(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer [data-tl]').length);
    return [n ? 'works' : 'partial', `${n} travel controls`];
  });

  /* ── Design ── */
  await check('Design', 'theme', async () => { await act('theme'); await wait(400); return [(await drawer()) === 'theme' ? 'works' : 'broken', `drawer ${await drawer()}`]; });
  await check('Design', 'styleThis', async () => { await sel(P0); await act('styleThis'); await wait(400); return [(await drawer()) ? 'works' : 'broken', `drawer ${await drawer()}`]; });
  await check('Design', 'hideBlock hide', async () => { await sel(P0); return grew('hideBlock'); });
  await check('Design', 'hideBlock unhide', async () => {
    // the hidden block stays selected for the second press (the sweep's Esc between checks cleared the selection)
    const a = await ops();
    await ev((p) => { window.BW.S.sel = { p, b: p.replace(/\/paragraphs\/\d+$/, '') }; window.BW.runAction('hideBlock'); }, P0);
    await wait(200);
    const hidden = await ev(() => !!window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.chapters[0].sections[0].blocks[0].hidden);
    if (hidden) await ev(() => window.BW.undo()); // never leave the sample's first block hidden for the checks after this one
    return [!hidden && (await ops()) !== a ? 'works' : 'broken', `ops ${a} → ${await ops()}, hidden ${hidden}`];
  });

  /* ── View ── */
  const toggle = (id, key) => check('View', `${id} on/off`, async () => {
    const a = await st(key); await act(id); await wait(250); const b = await st(key); await act(id); await wait(250); const c = await st(key);
    return [JSON.stringify(a) !== JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c) ? 'works' : 'broken', `${JSON.stringify(a)} → ${JSON.stringify(b)} → ${JSON.stringify(c)}`];
  });
  await toggle('side', 'side'); await toggle('both', 'both'); await toggle('dark', 'dark'); await toggle('calm', 'calm'); await toggle('spell', 'spell'); await toggle('snap', 'snap');
  await check('View', 'uiLang ar→en→ar', async () => { const a = await st('ui'); await act('uiLang'); await wait(300); const b = await st('ui'); await act('uiLang'); await wait(300); return [a !== b && (await st('ui')) === a ? 'works' : 'broken', `${a} → ${b}`]; });
  await check('View', 'focus', async () => { await act('focus'); await wait(200); const on = await st('focus'); await ev(() => window.BW.runAction('focus')); return [on ? 'works' : 'broken', `focus ${on}`]; });
  await check('View', 'zoomIn', async () => { const a = await st('zoom'); await act('zoomIn'); return [(await st('zoom')) > a ? 'works' : 'broken', `${a} → ${await st('zoom')}`]; });
  await check('View', 'zoomOut', async () => { const a = await st('zoom'); await act('zoomOut'); return [(await st('zoom')) < a ? 'works' : 'broken', `${a} → ${await st('zoom')}`]; });
  await check('View', 'zoomFit', async () => { await act('zoomFit'); const z = await st('zoom'); return [z !== 1 ? 'works' : 'partial', `zoom ${z}`]; });
  await check('View', 'zoomReset', async () => { await act('zoomReset'); return [(await st('zoom')) === 1 ? 'works' : 'broken', `zoom ${await st('zoom')}`]; });
  await check('View', 'settings', async () => { await act('settings'); await wait(400); return [(await drawer()) === 'settings' ? 'works' : 'broken', `drawer ${await drawer()}`]; });
  await check('View', 'view popover', async () => { await act('view'); await wait(300); const v = await st('view'); await act('view'); return [v ? 'works' : 'broken', `view ${v}`]; });
  for (const m of ['single', 'spread', 'continuous']) {
    await check('View', `view.${m} (read back)`, async () => { await ev((m) => window.BW.runAction('view.' + m), m); await wait(500); const p = await ev(() => document.getElementById('bw-pair')?.dataset.pages); return [p === m ? 'works' : 'broken', `pages=${p}`]; });
  }

  /* ── Export ── */
  await check('Export', 'print (centre opens)', async () => { await act('print'); await wait(600); const open = await ev(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog[open], .pc[open], .print-center')); await page.keyboard.press('Escape'); return [open ? 'works' : 'broken', `open ${open}`]; });
  await check('Export', 'exportPdf (both, named, save folder)', async () => {
    const before = fs.existsSync(ws.dirs.pdf) ? fs.readdirSync(ws.dirs.pdf) : [];
    await act('exportPdf');
    await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.flash')?.textContent, null, { timeout: 15000 }).catch(() => {});
    await wait(1500);
    const pdf = fs.existsSync(ws.dirs.pdf) ? fs.readdirSync(ws.dirs.pdf).filter((f) => !before.includes(f)) : [];
    const docx = fs.existsSync(ws.dirs.docx) ? fs.readdirSync(ws.dirs.docx) : [];
    const named = pdf.some((f) => /-\d{4}-\d\d-\d\d-(AR|ENG)\.pdf$/.test(f));
    return [named && docx.length ? 'works' : pdf.length ? 'partial' : 'broken', `PDF ${pdf.join(',') || '-'} · DOCX ${docx.length}`];
  });
  await check('Export', 'export file (print centre layout + naming)', async () => {
    const r = await ev(async () => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; const res = await fetch('/api/export/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: window.BW.S.svc, locale: window.BW.S.ed, doc: e.doc, theme: window.BW.S.theme, format: 'docx' }) }); return res.json(); });
    const ok = r.file && r.file.startsWith(ws.dirs.docx) && /-(AR|ENG)(-\d+)?\.docx$/.test(r.file);
    return [ok ? 'works' : 'partial', r.file ? path.relative(tmp, r.file) : r.error];
  });
  await check('Export', 'page break reaches DOCX', async () => {
    await sel(P0); await ev(() => window.BW.runAction('breakBefore'));
    const r = await ev(async () => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; const res = await fetch('/api/export/file', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: window.BW.S.svc, locale: window.BW.S.ed, doc: e.doc, theme: window.BW.S.theme, format: 'docx', folder: null }) }); return res.json(); });
    await ev(() => window.BW.undo());
    if (!r.file) return ['broken', r.error];
    const { docxParts } = await import('./fixtures/doc-model/util.mjs');
    const xml = docxParts(r.file, /^word\/document\.xml$/)['word/document.xml'] || '';
    const ok = /w:type="page"|<w:pageBreakBefore/.test(xml);
    return [ok ? 'works' : 'partial', ok ? 'page break in document.xml' : 'no page break in DOCX'];
  });

  /* ── Text selection ── */
  // every Text / Table check leaves the sample as it found it (undo back to the count before), so one move never
  // takes the next check's paragraph away; moves use a section with two blocks (chapter 2, section 1)
  await keep('Text', 'duplicate', async () => { await sel(P1); return grew('duplicate'); });
  await keep('Text', 'moveDown', async () => { await sel(P1); return grew('moveDown'); });
  await keep('Text', 'selection follows a move', async () => {
    await sel(P1); await act('moveDown'); await wait(300);
    const s = await ev(() => ({ p: window.BW.S.sel?.p, b: window.BW.S.sel?.b }));
    return [s.b === '/chapters/1/sections/0/blocks/1' && s.p?.startsWith(s.b) ? 'works' : 'broken', JSON.stringify(s)];
  });
  await keep('Text', 'keyboard after a toolbar move (Alt+↑)', async () => {
    await sel(P1); await act('moveDown'); await wait(200);
    const a = await ops(); await page.keyboard.press('Alt+ArrowUp'); await wait(300);
    return [(await ops()) > a ? 'works' : 'broken', `ops ${a} → ${await ops()}`];
  });
  await keep('Text', 'move crosses into the next section', async () => {
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').first().click(); // the last block of chapter 2 section 1
    const a = await ops(); await ev(() => window.BW.runAction('moveDown')); await wait(300);
    const s = await ev(() => window.BW.S.sel?.b);
    return [(await ops()) > a && String(s).startsWith('/chapters/1/sections/1/') ? 'works' : 'partial', `sel ${s}`];
  });
  await keep('Text', 'breakBefore', async () => { await sel(P1); return grew('breakBefore'); });
  await keep('Text', 'keepNext', async () => { await sel(P1); return grew('keepNext'); });
  await keep('Text', 'comment (typed)', async () => {
    await sel(P1); const a = await ops();
    await act('comment'); await wait(400);
    const typed = await ev(() => { const r = document.getElementById('bw-ui-host').shadowRoot; const i = r.querySelector('.dialog textarea, dialog[open] textarea, dialog[open] input[type="text"]'); if (!i) return false; i.value = 'audit note'; i.dispatchEvent(new Event('input', { bubbles: true })); (r.querySelector('.dialog [data-k="ok"], dialog[open] .primary'))?.click(); return true; });
    await wait(300);
    const c = await ev(() => (window.BW.M[window.BW.S.svc][window.BW.S.ed].comments || []).length);
    return [typed && ((await ops()) > a || c > 0) ? 'works' : 'broken', `dialog ${typed}, ops ${a} → ${await ops()}, comments ${c}`];
  });
  await keep('Text', 'delete', async () => { await sel(P1); return grew('delete'); });
  await keep('Text', "moveUp on the document's first block (no-op)", async () => { await sel(P0); const a = await ops(); await ev(() => window.BW.runAction('moveUp')); await wait(200); const b = await ops(); return [b === a ? 'works' : 'broken', `ops ${a} → ${b}`]; });

  /* ── Tables ── */
  for (const id of ['rowAdd', 'rowDel', 'colAdd', 'colDel']) await keep('Table', id, async () => { await sel(CELL); return grew(id); });
  await keep('Table', 'duplicate table', async () => { await sel(CELL); return grew('duplicate'); });
  await keep('Table', 'move table block', async () => { await sel(CELL); return grew('moveUp'); });
  await check('Table', 'front-matter table tools (control / revisions / TOC)', async () => {
    const out = {};
    for (const [k, q] of [['revisions', '[data-rows="/revisions"] td'], ['control', '[data-rows="/controlTable/rows"] td, table.control td'], ['toc', '[data-rows="/toc"] td, table.toc [data-sec]']]) {
      const el = page.locator(`main.bw-doc ${q.split(', ').join(', main.bw-doc ')}`).first();
      if (!(await el.count())) { out[k] = 'none'; continue; }
      await el.scrollIntoViewIfNeeded(); await el.click(); await wait(200);
      out[k] = await ev(() => { const r = document.getElementById('bw-ui-host').shadowRoot; const c = r.querySelector('.ctx'); return c && !c.hidden && !!c.querySelector('[data-a="rowAdd"], [data-a="fmRowAdd"], [data-a="tocAdd"]'); });
    }
    const n = Object.values(out).filter((x) => x === true).length;
    return [n === 3 ? 'works' : n ? 'partial' : 'broken', JSON.stringify(out)];
  });

  /* ── Diagram ── */
  await check('Diagram', 'select diagram', async () => {
    const svg = page.locator('main.bw-doc figure[data-dg] svg').first();
    await svg.scrollIntoViewIfNeeded();
    const bb = await svg.boundingBox();
    await page.mouse.click(bb.x + 8, bb.y + 8); await wait(300);
    return [(await ev(() => !!window.BW.S.dg)) ? 'works' : 'partial', 'S.dg'];
  });
  const dgSel = async () => { const svg = page.locator('main.bw-doc figure[data-dg] svg').first(); await svg.scrollIntoViewIfNeeded(); const bb = await svg.boundingBox(); await page.mouse.click(bb.x + 8, bb.y + 8); await wait(250); };
  for (const id of ['dgStaff', 'dgDecision', 'dgAuto', 'dgLegend']) await keep('Diagram', id, () => grew(id, dgSel));
  await check('Diagram', 'dgZoomFit', async () => { await dgSel(); await act('dgZoomFit'); return ['works', 'no error']; });
  await check('Diagram', 'dgMermaidOut', async () => { await dgSel(); const n = await download(() => act('dgMermaidOut')); return [n ? 'works' : 'broken', n || 'no download']; });
  await check('Edit', '20 undos return toward 0', async () => { for (let i = 0; i < 20; i++) await ev(() => window.BW.undo()); const n = await ops(); return [n < 20 ? 'works' : 'broken', `ops ${n}`]; });

  /* ── shell behaviours (real pointer) ── */
  await check('Shell', 'toast: short life + click dismisses', async () => {
    await ev(() => window.BW.toast('audit life', 'info'));
    const t0 = Date.now();
    await page.waitForFunction(() => ![...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toasts > *')].some((x) => x.dataset.msg === 'info|audit life' && !x.classList.contains('out')), null, { timeout: 6000 }).catch(() => {});
    const life = Date.now() - t0;
    await ev(() => window.BW.toast('audit 2', 'info'));
    await page.locator('#bw-ui-host .toasts > *').last().click().catch(() => {});
    await wait(500);
    const gone = await ev(() => !document.getElementById('bw-ui-host').shadowRoot.querySelector('.toasts > :not(.banner)'));
    return [life < 3500 && gone ? 'works' : 'partial', `life ${life} ms, click dismiss ${gone}`];
  });
  await check('Shell', 'toolbar motion: island kept on a toggle', async () => {
    await ev(() => { window.__isl = document.getElementById('bw-ui-host').shadowRoot.querySelector('.island'); });
    await page.locator('#bw-ui-host .island [data-a="dir"]').first().click(); await wait(300);
    await page.locator('#bw-ui-host .island [data-a="dir"]').first().click(); await wait(300);
    const same = await ev(() => window.__isl === document.getElementById('bw-ui-host').shadowRoot.querySelector('.island'));
    return [same ? 'works' : 'partial', `island kept ${same}`];
  });
  await check('Shell', 'explainer: ~900 ms, no re-show', async () => {
    const b = page.locator('#bw-ui-host .island .sec[data-cat="file"] .b').first();
    await b.hover(); const t0 = Date.now();
    const shown = await page.waitForFunction(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.xpl:not([hidden])'), null, { timeout: 3000 }).then(() => Date.now() - t0).catch(() => null);
    await page.mouse.move(700, 600); await wait(400); await b.hover(); await wait(1300);
    const again = await ev(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.xpl:not([hidden])'));
    if (shown == null) return ['partial', 'no card (setting may be off)'];
    return [shown >= 800 && !again ? 'works' : 'partial', `first ${shown} ms, re-shown ${again}`];
  });
  await check('Shell', 'side panel closes on outside click', async () => {
    let closed = 0;
    for (const id of ['outline', 'settings', 'theme', 'history', 'check']) { await ev((id) => window.BW.runAction(id), id); await wait(300); await page.mouse.click(720, 700); await wait(300); if (!(await drawer())) closed += 1; }
    return [closed === 5 ? 'works' : closed ? 'partial' : 'broken', `${closed}/5 closed`];
  });
  await check('File', 'import (real edits file)', async () => {
    const f = path.join(tmp, 'import.edits.json');
    const bundle = await ev(() => window.BW.editsFile(window.BW.S.svc, window.BW.S.ed));
    fs.writeFileSync(f, typeof bundle === 'string' ? bundle : JSON.stringify(bundle));
    const c = await chooser(() => act('import'));
    if (!c) return ['broken', 'no file chooser'];
    await c.setFiles(f); await wait(800);
    return ['works', 'chooser opened, file read with no error'];
  });

  /* ── 0.13.0 features (beyond the 0.12.0 set) ── */
  for (const [id, drawer] of [['library', 'library'], ['timeline', 'timeline'], ['pvOpen', 'provenance']]) {
    await check('0.13', `${id} tool opens ${drawer}`, async () => { await act(id); await wait(500); const d = await ev(() => window.BW.S.drawer); return [d === drawer ? 'works' : 'broken', `drawer ${d}`]; });
  }
  await check('0.13', 'two sections «الترويسة» and «التذييل» in the bar', async () => {
    const r = await ev(() => { const R = document.getElementById('bw-ui-host').shadowRoot; return ['header', 'footer'].map((c) => !!R.querySelector(`.island .sec[data-cat="${c}"]`)); });
    return [r.every(Boolean) ? 'works' : 'broken', JSON.stringify(r)];
  });
  await keep('0.13', 'lock refuses an edit, unlock allows it', async () => {
    await ev(() => window.BW.runAction('lkToggle')); await wait(300);
    const refused = await ev(() => { try { window.BW.setText('/control/title', 'locked edit'); return false; } catch (e) { return !!e.refused; } });
    await ev(() => { window.BW.runAction('lkToggle'); }); // unlock asks first (a warning, no password): not awaited
    await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal [data-mk="ok"]'), null, { timeout: 5000 }).catch(() => {});
    await ev(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.bw-modal [data-mk="ok"]')?.click());
    await wait(400);
    const locked = await ev(() => document.documentElement.dataset.bwLocked === '1');
    return [refused && !locked ? 'works' : refused ? 'partial' : 'broken', `refused ${refused}, still locked ${locked}`];
  });
  await keep('0.13', 'format bar: Ctrl+B bolds a selected word (one op)', async () => {
    await sel(P1);
    await ev((p) => {
      const el = document.querySelector(`main.bw-doc [data-p="${p}"]`);
      el.focus();
      const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.max(1, n.data.indexOf(' ')));
      getSelection().removeAllRanges(); getSelection().addRange(r);
    }, P1);
    await wait(100);
    const a = await ops(); await page.keyboard.press('Control+b'); await wait(250);
    return [(await ops()) === a + 1 ? 'works' : 'broken', `ops ${a} → ${await ops()}`];
  });

  await check('Shell', 'licence in About is MIT', async () => {
    await ev(() => window.BW.runAction('settings')); await wait(400);
    const txt = await ev(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer')?.textContent || '');
    return [/\bMIT\b/.test(txt) ? 'works' : 'broken', /\bMIT\b/.test(txt) ? 'MIT' : 'no MIT']; // the repo-wide A27 gate (settings.test) refuses any other licence line
  });
} finally {
  const sum = { works: 0, partial: 0, broken: 0 };
  for (const r of rows) sum[r.verdict] += 1;
  const rate = rows.length ? Math.round((sum.works / rows.length) * 1000) / 10 : 0;
  console.log(`\nworks ${sum.works} · partial ${sum.partial} · broken ${sum.broken} · total ${rows.length} · works rate ${rate} %`);
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ file, at: new Date().toISOString(), sum, rate, rows }, null, 1));
  await ctx.close().catch(() => {});
  server.close(); server.closeAllConnections?.();
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
}
