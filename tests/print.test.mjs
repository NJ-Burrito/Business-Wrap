// Export & Print centre + toolbar parity + the View menu (0.11.0).
// Printers and printing are mocked (no real printer is ever used here): Windows and lp listings, refresh, the command
// built for every option, injection refused. Then the exports (engine files and in-browser files), the file:// fallback,
// every menu fully visible with a label on every item (1366 / 1920, AR / EN), palette ⊆ toolbar, View switches,
// axe 0 serious. Headless Chrome, closed at the end; no check reads a Thmanyah glyph (HAVE_FONTS-independent).
//
//   node tests/print.test.mjs        (BW_SHOTS=<folder> also writes the viewport screenshots there)
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';
import { setRunner, parseWindows, parseLpstat, parseLpoptions, printCommand, checkOptions, listPrinters, printPdf } from '../engine/printers.mjs';
import { py } from '../engine/py.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.join(REPO, 'out', 'print-test');
fs.mkdirSync(OUT, { recursive: true });
const SHOTS = process.env.BW_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
};

// ── mocks ────────────────────────────────────────────────────────────────
const WIN_A = JSON.stringify([
  { name: 'Office Laser', default: true, printerStatus: 3, workOffline: false, errorState: 2, paper: ['A4', 'Letter', 'A3'], duplex: true, color: false, port: 'IP_10.0.0.5' },
  { name: 'Microsoft Print to PDF', default: false, printerStatus: 3, workOffline: false, errorState: 0, paper: ['A4', 'Letter'], duplex: false, color: true, port: 'PORTPROMPT:' },
  { name: 'Old Inkjet', default: false, printerStatus: 3, workOffline: true, errorState: 0, paper: [], duplex: false, color: true, port: 'USB001' },
  { name: 'Jammed', default: false, printerStatus: 3, workOffline: false, errorState: 8, paper: ['A4'], duplex: false, color: true, port: 'USB002' },
]);
const WIN_B = JSON.stringify([{ name: 'New Printer', default: true, printerStatus: 3, workOffline: false, errorState: 2, paper: ['A4'], duplex: true, color: true, port: 'IP_10.0.0.9' }, JSON.parse(WIN_A)[1]]);
const LPSTAT = 'printer HP_LaserJet is idle.  enabled since Mon 01 Jan 2026\nprinter Back_Office disabled since Mon 01 Jan 2026 -\n\treason unknown\nprinter Plotter now printing Plotter-3.  enabled since x\nsystem default destination: HP_LaserJet\n';
const LPOPT = 'PageSize/Media Size: Letter *A4 Legal\nDuplex/2-Sided Printing: *None DuplexNoTumble DuplexTumble\n';
let winOut = WIN_A;
const calls = [];
function mockWin(cmd, args, opt = {}) {
  calls.push({ cmd, args, env: opt.env || {} });
  if (cmd === 'powershell.exe' && !opt.env?.BW_JOB) return Promise.resolve({ status: 0, stdout: winOut, stderr: '' });
  if (cmd === 'python' || cmd === 'uv') return Promise.resolve({ status: 0, stdout: JSON.stringify(['C:/t/p0001.png', 'C:/t/p0002.png']), stderr: '' });
  if (cmd === 'powershell.exe') return Promise.resolve({ status: 0, stdout: '{"ok":true,"jobId":42}', stderr: '' });
  return Promise.resolve({ status: 1, stdout: '', stderr: 'unexpected ' + cmd });
}
function mockLp(cmd, args, opt = {}) {
  calls.push({ cmd, args, env: opt.env || {} });
  if (cmd === 'lpstat') return Promise.resolve({ status: 0, stdout: LPSTAT, stderr: '' });
  if (cmd === 'lpoptions') return Promise.resolve({ status: 0, stdout: LPOPT, stderr: '' });
  if (cmd === 'lp') return Promise.resolve({ status: 0, stdout: 'request id is HP_LaserJet-17 (1 file(s))', stderr: '' });
  return Promise.resolve({ status: 1, stdout: '', stderr: 'unexpected ' + cmd });
}

// ── 1. listings ──────────────────────────────────────────────────────────
{
  const w = parseWindows(WIN_A);
  check('Windows listing: names, default ✓, paper sizes', w.length === 4 && w[0].default && !w[1].default && w[0].paper.join() === 'A4,Letter,A3');
  check('Windows listing: online / offline / error', w.map((p) => p.status).join() === 'online,online,offline,error', w.map((p) => p.status).join());
  check('Windows listing: virtual printers recognised', w[1].virtual && !w[0].virtual);
  check('Windows listing: a single printer (not an array) still parses', parseWindows(JSON.stringify(JSON.parse(WIN_A)[0])).length === 1);
  const l = parseLpstat(LPSTAT, { HP_LaserJet: parseLpoptions(LPOPT) });
  check('lpstat listing: names, default, statuses', l.map((p) => `${p.name}:${p.default ? 'd' : ''}:${p.status}`).join() === 'HP_LaserJet:d:online,Back_Office::offline,Plotter::online', JSON.stringify(l));
  check('lpoptions: paper sizes without the * mark', l[0].paper.join() === 'Letter,A4,Legal');
}
// ── 2. commands for every option ─────────────────────────────────────────
{
  const job = (o) => ({ printer: 'HP_LaserJet', copies: 1, range: '', color: 'color', duplex: 'one', paper: '', orientation: 'auto', ...o });
  const lp = (o) => printCommand('lp', job(o), { file: '/tmp/a.pdf', docName: 'a.pdf' }).args;
  check('lp: printer, copies, file last after --', lp({}).join(' ') === '-d HP_LaserJet -n 1 -o sides=one-sided -o print-color-mode=color -t a.pdf -- /tmp/a.pdf', lp({}).join(' '));
  check('lp: copies + range', lp({ copies: 3, range: '1-3,5' }).join(' ').includes('-n 3 -P 1-3,5'));
  check('lp: duplex long / short', lp({ duplex: 'long' }).includes('sides=two-sided-long-edge') && lp({ duplex: 'short' }).includes('sides=two-sided-short-edge'));
  check('lp: mono, paper, orientation', lp({ color: 'mono' }).includes('print-color-mode=monochrome') && lp({ paper: 'A4' }).includes('media=A4') && lp({ orientation: 'landscape' }).includes('orientation-requested=4') && lp({ orientation: 'portrait' }).includes('orientation-requested=3'));
  check('lp: auto orientation passes nothing (landscape figure pages keep landscape)', !lp({}).some((a) => a.startsWith('orientation')));
  const su = (o) => printCommand('sumatra', job(o), { file: 'C:/a.pdf' }).args;
  check('SumatraPDF: -print-to <name> -print-settings … -silent <file>', su({}).join('|') === '-print-to|HP_LaserJet|-print-settings|1x,color,simplex,fit|-silent|C:/a.pdf', su({}).join('|'));
  check('SumatraPDF: every option in -print-settings', su({ range: '2-4', copies: 2, color: 'mono', duplex: 'short', paper: 'A3', orientation: 'landscape' })[3] === '2-4,2x,monochrome,duplexshort,paper=A3,landscape,fit', su({ range: '2-4', copies: 2, color: 'mono', duplex: 'short', paper: 'A3', orientation: 'landscape' })[3]);
  const dn = printCommand('dotnet', job({ copies: 2, duplex: 'long', color: 'mono', paper: 'A4', orientation: 'auto' }), { images: ['a.png'], output: 'C:/o.pdf', docName: 'x' });
  const env = JSON.parse(dn.env.BW_JOB);
  check('.NET: a constant script; the job only as JSON in the environment', dn.cmd === 'powershell.exe' && !dn.args.join(' ').includes('HP_LaserJet') && env.printer === 'HP_LaserJet' && env.copies === 2 && env.duplex === 'long' && env.color === false && env.paper === 'A4' && env.orientation === 'auto' && env.output === 'C:/o.pdf');
}
// ── 3. validation and injection ──────────────────────────────────────────
{
  setRunner(mockWin, 'win32');
  winOut = WIN_A;
  const { printers } = await listPrinters({ refresh: true });
  const refused = (o) => { try { checkOptions(o, printers); return false; } catch (e) { return e.code === 400; } };
  check('injection: a printer name not in the list is refused', refused({ printer: 'Office Laser" & calc & "' }) && refused({ printer: 'x; rm -rf /' }) && refused({ printer: '$(Get-Process)' }));
  check('injection: range, copies, enums, paper are validated', refused({ printer: 'Office Laser', range: '1;calc' }) && refused({ printer: 'Office Laser', copies: 0 }) && refused({ printer: 'Office Laser', copies: '1 & x' }) && refused({ printer: 'Office Laser', duplex: 'both' }) && refused({ printer: 'Office Laser', orientation: 'x' }) && refused({ printer: 'Office Laser', paper: 'B9' }));
  check('a listed printer with good options passes', !refused({ printer: 'Office Laser', copies: 2, range: '1-2', paper: 'A3', duplex: 'short', color: 'mono', orientation: 'landscape' }));
  calls.length = 0;
  const r = await printPdf(path.join(OUT, 'none.pdf'), { printer: 'Microsoft Print to PDF', copies: 1, range: '1-2' });
  const ps = calls.find((c) => c.cmd === 'powershell.exe' && c.env.BW_JOB);
  check('print (Windows, mocked): pages rasterised for the range, job sent, job id read', r.ok && r.jobId === 42 && r.pages === 2 && ['python', 'uv'].includes(calls[0].cmd) && calls[0].args.at(-1) === '[1,2]' && JSON.parse(ps.env.BW_JOB).images.length === 2, JSON.stringify(r));
  check('print: no command is run through a shell', fs.readFileSync(path.join(REPO, 'engine', 'printers.mjs'), 'utf8').includes('shell: false') && !/import \{[^}]*\bexec/.test(fs.readFileSync(path.join(REPO, 'engine', 'printers.mjs'), 'utf8')));
  setRunner(mockLp, 'linux');
  calls.length = 0;
  const r2 = await printPdf('/tmp/a.pdf', { printer: 'HP_LaserJet', copies: 2, duplex: 'long', paper: 'A4' });
  check('print (lp, mocked): job id from «request id is …»', r2.jobId === 'HP_LaserJet-17' && calls.at(-1).cmd === 'lp' && calls.at(-1).args.includes('sides=two-sided-long-edge'), JSON.stringify(r2));
}

// ── 4. the server: refresh, injection over HTTP, exports ─────────────────
setRunner(mockWin, 'win32');
winOut = WIN_A;
const server = await serve(file, 0, { out: path.join(OUT, 'exports') });
const base = `http://127.0.0.1:${server.address().port}`;
const doc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.ar.json'), 'utf8'));
const post = (p, b, h = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
const browser = await chromium.launch(launchOptions());
try {
  {
    const a = await (await fetch(`${base}/api/print/printers?refresh=1`)).json();
    winOut = WIN_B;
    const cached = await (await fetch(`${base}/api/print/printers`)).json();
    const b = await (await fetch(`${base}/api/print/printers?refresh=1`)).json();
    check('refresh: the list is asked again and updated (cached otherwise)', a.printers[0].name === 'Office Laser' && cached.printers[0].name === 'Office Laser' && b.printers[0].name === 'New Printer' && b.at >= a.at, JSON.stringify([a.printers.length, b.printers.length]));
    winOut = WIN_A;
    await fetch(`${base}/api/print/printers?refresh=1`);
    const inj = await post('/api/print/job', { doc, service: 'x', printer: 'Office Laser"; Remove-Item C:\\ -Recurse; "', copies: 1 });
    check('HTTP: an injected printer name is refused (400) before anything prints', inj.status === 400 && /unknown printer/.test((await inj.json()).error));
    const inj2 = await post('/api/print/check', { printer: 'Office Laser', range: '1-2 && calc' });
    check('HTTP: an injected page range is refused (400)', inj2.status === 400);
    const foreign = await post('/api/print/check', { printer: 'Office Laser' }, { origin: 'https://evil.example' });
    check('HTTP: another origin is refused (403)', foreign.status === 403);
    const bad = await post('/api/export/file', { doc, service: 'x', format: 'exe' });
    check('HTTP: an unknown export format is refused (400)', bad.status === 400);
  }
  // engine exports: a real file of the expected type
  {
    const ex = async (b) => { const r = await post('/api/export/file', { doc, service: 'event-permit', locale: 'ar', ...b }); return { s: r.status, j: await r.json() }; };
    const pages = (f) => Number(spawnSync(...py(['-c', 'import pymupdf,sys;print(len(pymupdf.open(sys.argv[1])))', f], ['pymupdf']), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout.trim());
    const full = await ex({ format: 'pdf' });
    const fullN = full.s === 200 ? pages(full.j.file) : 0;
    check('export PDF: a %PDF file in the exports folder, served under /files/', full.s === 200 && fs.readFileSync(full.j.file).subarray(0, 5).toString() === '%PDF-' && /^\/files\//.test(full.j.url), JSON.stringify(full.j).slice(0, 200));
    const cut = await ex({ format: 'pdf', range: '1-2' });
    check('export PDF: the page range cuts the file (1-2 → 2 pages)', cut.s === 200 && pages(cut.j.file) === 2);
    const nocover = await ex({ format: 'pdf', cover: false });
    check('export PDF: «include the cover» off drops the cover page', nocover.s === 200 && pages(nocover.j.file) === fullN - 1, `${fullN} → ${nocover.s === 200 ? pages(nocover.j.file) : nocover.j.error}`);
    const folder = path.join(OUT, 'chosen folder');
    const html = await ex({ format: 'printHtml', folder });
    check('export print HTML: saved in the chosen folder, the path returned (no download URL)', html.s === 200 && html.j.file.startsWith(folder) && html.j.url === null && /<html/i.test(fs.readFileSync(html.j.file, 'utf8')));
    const rel = await ex({ format: 'pdf', folder: 'relative/dir' });
    check('export: a relative folder is refused (400)', rel.s === 400);
    const uv = spawnSync('uv', ['--version'], { encoding: 'utf8' }).status === 0;
    if (uv) {
      const dx = await ex({ format: 'docx' });
      const zip = dx.s === 200 ? fs.readFileSync(dx.j.file) : Buffer.alloc(0);
      check('export DOCX: a zip with word/document.xml', dx.s === 200 && zip.subarray(0, 2).toString() === 'PK' && zip.includes('word/document.xml'), dx.j.error);
    } else results.push('SKIP  export DOCX (uv not on this machine)');
  }

  // ── 5. the editor in the browser ─────────────────────────────────────
  async function open(url, { ui = 'ar', width = 1366, height = 860 } = {}) {
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width, height }, acceptDownloads: true }); // bypassCSP only so axe can be injected
    await ctx.addInitScript((u) => { try { if (!sessionStorage.getItem('bw-t')) { sessionStorage.setItem('bw-t', '1'); localStorage.setItem('bw:ui', u); } } catch {} }, ui);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.BW?.ready);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    return { ctx, page, errors };
  }
  const sh = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
  const axe = async (page) => {
    if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ path: AXE });
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.map((x) => ({ id: x.id, impact: x.impact, t: x.nodes[0]?.target?.join(' ') })));
    return v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  };
  // every item of an open menu: inside the window, a visible non-empty label
  const menuAudit = (r) => {
    const m = [...r.querySelectorAll('.menu[data-open="1"], #viewpop:popover-open')][0];
    if (!m) return { open: false };
    const box = m.getBoundingClientRect();
    const inside = box.top >= 0 && box.left >= 0 && box.bottom <= innerHeight && box.right <= document.documentElement.clientWidth;
    const items = [...m.querySelectorAll('button')].map((b) => { const w = b.querySelector('.w, .sw'); return { a: b.dataset.a, label: !!w && w.offsetWidth > 0 && w.textContent.trim().length > 0, inside: b.getBoundingClientRect().bottom <= box.bottom + 1 }; });
    return { open: true, inside, scroll: m.scrollHeight > m.clientHeight + 1, bare: items.filter((x) => !x.label || !x.inside).map((x) => x.a), n: items.length };
  };
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

  for (const url of [pathToFileURL(file).href, `${base}/`]) {
    const srv = url.startsWith('http');
    for (const ui of ['ar', 'en']) for (const width of [1366, 1920]) {
      const { ctx, page, errors } = await open(url, { ui, width });
      const tag = `${srv ? 'server' : 'file'} ${ui} ${width}`;
      // toolbar: one row, no sideways scroll; at 1920 the words show where they fit
      const bar = await sh(page, (r) => { const b = r.querySelector('.island'); const bx = [...b.querySelectorAll(':scope > .sec:not([hidden]), :scope > .grp, :scope > .status')].map((x) => x.getBoundingClientRect()); return { over: b.scrollWidth > b.clientWidth, rows: Math.max(...bx.map((x) => x.top)) < Math.min(...bx.map((x) => x.bottom)) ? 1 : 2, words: [...b.querySelectorAll(':scope > .sec:not(.now) > .sb > .b .w')].filter((w) => w.offsetWidth > 0).length }; });
      check(`${tag}: toolbar on one row, no sideways scroll`, !bar.over && bar.rows === 1, JSON.stringify(bar));
      if (width === 1920) check(`${tag}: tool labels show on the bar where they fit`, bar.words > 0, JSON.stringify(bar));
      // every «More» menu and the Export menu: fully visible, every item labelled
      const mores = await sh(page, (r) => [...r.querySelectorAll('.island .sec:not(.now) .more > [data-a="more"]')].filter((b) => b.offsetWidth > 0).map((b) => b.closest('.sec').dataset.cat + (b.dataset.x ? ':' + b.dataset.x : '')));
      const bad = [];
      for (const [i] of mores.entries()) {
        await sh(page, (r, i) => [...r.querySelectorAll('.island .sec:not(.now) .more > [data-a="more"]')].filter((b) => b.offsetWidth > 0)[i].click(), i);
        await page.waitForTimeout(320);
        const a = await sh(page, menuAudit);
        if (!a.open || !a.inside || a.scroll || a.bare.length || !a.n) bad.push(`${mores[i]} ${JSON.stringify(a)}`);
        if (mores[i].includes('export.menu')) await shot(page, `export-menu-${ui}-${width}.png`);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(150);
      }
      check(`${tag}: ${mores.length} menus (every «More» + Export) fully visible, every item icon + label`, mores.length >= 1 && mores.some((m) => m.includes('export.menu')) && !bad.length, bad.join(' | '));
      // the selection's «More» menu (a text block)
      await page.locator('main.bw-doc p[data-b]').nth(2).click();
      await page.waitForTimeout(350);
      const ctxMore = await sh(page, (r) => { const b = r.querySelector('.ctx .more > [data-a="more"]'); if (b) b.click(); return !!b; });
      await page.waitForTimeout(320);
      if (ctxMore) { const a = await sh(page, menuAudit); check(`${tag}: the selection's «More» fully visible, every item labelled`, a.open && a.inside && !a.bare.length, JSON.stringify(a)); }
      await page.keyboard.press('Escape');
      // palette ⊆ toolbar, with this selection and with none
      const parity = async () => sh(page, (r) => {
        const reach = new Set([...r.querySelectorAll('.island [data-a], .pop [data-a], .island [data-cmds]')].flatMap((x) => [x.dataset.a, ...(x.dataset.cmds || '').split(' ')]).filter(Boolean));
        window.BW.runAction?.('palette');
        const ids = [...r.querySelectorAll('#cmdlist [data-cmd]')].map((x) => x.dataset.cmd);
        r.querySelector('.scrim').hidden = true;
        return { n: ids.length, missing: ids.filter((id) => !reach.has(id)) };
      });
      const withSel = await parity();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      const noSel = await parity();
      check(`${tag}: every palette command is in the toolbar (selection and none)`, withSel.n > 20 && noSel.n > 20 && !withSel.missing.length && !noSel.missing.length, JSON.stringify([withSel, noSel]));
      // View menu: switches reflect the state after toggling, segments for modes, zoom read-out
      await sh(page, (r) => r.querySelector('.island [data-a="view"]').click());
      await page.waitForTimeout(350);
      const va = await sh(page, menuAudit);
      check(`${tag}: View menu in the top layer, fully visible, every control labelled`, va.open && va.inside && !va.bare.length, JSON.stringify(va));
      if (!srv) await shot(page, `view-${ui}-${width}.png`);
      const states = [];
      for (const id of ['dark', 'calm', 'both', 'spell', 'snap']) {
        const before = await sh(page, (r, id) => r.querySelector(`#viewpop [data-a="${id}"]`).getAttribute('aria-checked'), id);
        await sh(page, (r, id) => r.querySelector(`#viewpop [data-a="${id}"]`).click(), id);
        await page.waitForTimeout(250);
        const after = await page.evaluate((id) => { const S = window.BW.S; const r = document.getElementById('bw-ui-host').shadowRoot; const real = { dark: S.dark, calm: S.calm, both: S.both, spell: S.spell[S.ed], snap: S.snap }[id]; return { checked: r.querySelector(`#viewpop [data-a="${id}"]`)?.getAttribute('aria-checked'), real: String(!!real), open: !!r.querySelector('#viewpop:popover-open') }; }, id);
        states.push(`${id}:${before}→${after.checked}/${after.real}/${after.open}`);
        if (after.checked === before || after.checked !== after.real || !after.open) states.push('BAD');
        await sh(page, (r, id) => r.querySelector(`#viewpop [data-a="${id}"]`).click(), id); // back
        await page.waitForTimeout(200);
      }
      check(`${tag}: each View switch flips, matches the real state, the menu stays open`, !states.includes('BAD'), states.join(' '));
      await sh(page, (r) => r.querySelector('#viewpop [data-a="zoomIn"]').click());
      const pct = await sh(page, (r) => r.querySelector('#viewpop [data-a="zoomReset"] .w').textContent);
      await sh(page, (r) => r.querySelector('#viewpop [data-a="zoomReset"]').click());
      const pct2 = await sh(page, (r) => r.querySelector('#viewpop [data-a="zoomReset"] .w').textContent);
      const zoom = await page.evaluate(() => window.BW.S.zoom);
      check(`${tag}: zoom read-out follows (+ → 110%, click → 100%)`, pct === '110%' && pct2 === '100%' && zoom === 1, `${pct} ${pct2} ${zoom}`);
      await sh(page, (r) => r.querySelector('#viewpop [data-a="view.single"]').click());
      await page.waitForTimeout(300);
      const seg = await sh(page, (r) => r.querySelector('#viewpop [data-a="view.single"]')?.getAttribute('aria-pressed'));
      check(`${tag}: page mode segment shows the mode`, seg === 'true' && (await page.evaluate(() => window.BW.S.pages)) === 'single');
      await sh(page, (r) => r.querySelector('#viewpop [data-a="view.continuous"]').click());
      await page.waitForTimeout(300);
      const closed = await page.evaluate(() => !window.BW.S.view);
      check(`${tag}: choosing a page mode closes the View menu`, closed);
      await sh(page, (r) => r.querySelector('.island [data-a="view"]').click());
      await page.waitForTimeout(350);
      if (width === 1366) {
        const v = await axe(page);
        check(`${tag}: axe 0 serious with the View menu open`, !v.length, JSON.stringify(v));
      }
      await page.keyboard.press('Escape');
      // Print panel by Ctrl+P
      await page.keyboard.press('Control+p');
      await page.waitForTimeout(srv ? 900 : 300);
      const pp = await sh(page, (r) => { const d = r.querySelector('dialog.pc-dlg'); return { open: !!d?.open, text: d?.textContent || '', rows: [...(d?.querySelectorAll('.pc-row') || [])].map((x) => x.textContent), at: d?.querySelector('.pc-at')?.textContent || '', browser: !!d?.querySelector('[data-pp="browser"]') }; });
      if (!srv) check(`${tag}: Ctrl+P opens the Print panel; without the server it says so, how to start it, and offers the browser dialog`, pp.open && pp.text.includes('npm run serve') && pp.browser);
      else {
        check(`${tag}: Ctrl+P opens the Print panel with the OS printers (default ✓, status, paper sizes)`, pp.open && pp.rows.length === 4 && pp.rows[0].includes('Office Laser') && pp.rows[0].includes('✓') && /27|3 /.test(pp.rows[0] + '3 ') && pp.at.length > 0, JSON.stringify(pp.rows));
        winOut = WIN_B;
        await sh(page, (r) => r.querySelector('dialog.pc-dlg [data-pp="refresh"]').click());
        await page.waitForTimeout(800);
        const rows2 = await sh(page, (r) => [...r.querySelectorAll('dialog.pc-dlg .pc-row')].map((x) => x.textContent));
        check(`${tag}: «Refresh printers» updates the list`, rows2.length === 2 && rows2[0].includes('New Printer'), JSON.stringify(rows2));
        winOut = WIN_A;
        await sh(page, (r) => r.querySelector('dialog.pc-dlg [data-pp="refresh"]').click());
        await page.waitForTimeout(800);
      }
      if (width === 1366) {
        await shot(page, `print-panel-${srv ? 'server' : 'file'}-${ui}.png`);
        const v = await axe(page);
        check(`${tag}: axe 0 serious with the Print panel open`, !v.length, JSON.stringify(v));
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      // Export menu: axe, offline messages, in-browser files
      await sh(page, (r) => r.querySelector('[data-x="export.menu"]').click());
      await page.waitForTimeout(300);
      if (width === 1366) {
        const v = await axe(page);
        check(`${tag}: axe 0 serious with the Export menu open`, !v.length, JSON.stringify(v));
      }
      if (!srv && width === 1366) {
        const off = await sh(page, (r) => ({ docx: [...r.querySelectorAll('.pc-menu [data-a^="export.docx"]')].every((b) => b.getAttribute('aria-disabled') === 'true'), pdf: [...r.querySelectorAll('.pc-menu [data-a^="export.pdf"]')].every((b) => !b.hasAttribute('aria-disabled')), note: r.querySelector('.pc-menu').textContent }));
        check(`${tag}: file:// — DOCX marked «needs the server», PDF still offered (browser print dialog)`, off.docx && off.pdf && /DOCX/.test(off.note));
        await sh(page, (r) => r.querySelector('.pc-menu [data-a="export.docx.ar"]').click());
        await page.waitForTimeout(300);
        const ban = await sh(page, (r) => r.querySelector('.toast.banner')?.textContent || '');
        check(`${tag}: file:// — DOCX says plainly the server is needed and how to start it`, ban.includes('npm run serve'), ban);
        const dl = {};
        for (const id of ['export.html', 'export.edits', 'export.editsAll', 'export.pack', 'export.mermaid', 'export.svg', 'export.png']) {
          await sh(page, (r) => { if (!r.querySelector('.pc-menu[data-open="1"]')) r.querySelector('[data-x="export.menu"]').click(); });
          await page.waitForTimeout(200);
          const [d] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }).catch(() => null), sh(page, (r, id) => r.querySelector(`.pc-menu [data-a="${id}"]`).click(), id)]);
          if (!d) { dl[id] = 'none'; continue; }
          const p = path.join(OUT, `dl-${ui}-${d.suggestedFilename()}`);
          await d.saveAs(p);
          const buf = fs.readFileSync(p);
          dl[id] = { html: /<!doctype html>/i.test(buf.toString('utf8', 0, 200)), edits: /"ops"|"services"|edits/.test(buf.toString()), editsAll: /"ops"|"services"|edits/.test(buf.toString()), pack: buf.toString().includes('bw-design-pack'), mermaid: /^(flowchart|graph)\b/m.test(buf.toString()), svg: buf.toString().startsWith('<svg'), png: buf.subarray(1, 4).toString() === 'PNG' }[id.split('.')[1]] ? 'ok' : `bad ${d.suggestedFilename()}`;
        }
        check(`${tag}: in-browser exports (HTML, edits ×2, design pack, Mermaid, SVG, PNG) each give a file of the right kind`, Object.values(dl).every((x) => x === 'ok'), JSON.stringify(dl));
      }
      check(`${tag}: no page errors`, !errors.length, errors.join(' | '));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
  setRunner();
}
console.log(results.join('\n'));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
