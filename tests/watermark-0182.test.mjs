// 0.18.2 lane W1: the NJ mark (#bw-watermark, editor/ext/34-watermark.js) must be on screen at the bottom LEFT in both languages, in an old SRS and in a typed document,
// also while the start page is open. Owner: «why can't I see my watermark at the bottom left?». Cause: the start page (since 0.18.2 it shows on EVERY open) hid the mark
// with `html[data-bw-start="open"] #bw-watermark{visibility:hidden}`, so the mark was gone whenever the start page was up (0.18.0 review fix #10 hid it because it covered
// the last tile row; the right fix is a bottom-start safe area on the start page, not hiding the mark).
//   - editor: computed visibility / display / opacity, the stage left edge 44 px from the left edge (140 px box at 16 px + centred 84 px stage) and the box 16 px from the
//     bottom, inside the viewport, and not covered (elementFromPoint at the stage centre is the mark), in EN and AR x old SRS (event-permit) x typed document (user-manual),
//     with the start page open and closed
//   - start page open: scrolled to its end, no tile, button, field or hint lies under the mark (the safe area)
//   - print / PDF: the mark is UI only and has never printed (CHANGELOG 0.15.0: «never in the PDF, DOCX, print»): print media hides it, and the PDF of each of the four
//     combinations carries no 256 px mark image (pdfimages), while the page text is there
//   node tests/watermark-0182.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO, exportPdf, loadTheme } from '../engine/export.mjs';
import { config } from '../engine/config.mjs';
import * as DT from '../engine/doctypes.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-1109-wm0182-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { const line = `${ok ? 'PASS' : 'FAIL'}  watermark-0182: ${name}${detail && !ok ? '  — ' + detail : ''}`; results.push(line); console.log(line); if (!ok) failed += 1; };

const bundle = path.join(tmp, 'business-wrap.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank'), path.join(REPO, 'samples', 'event-permit')], out: bundle, set: 'business-wrap', localFonts: true, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark'), ui: 'ar', docTypes: true });
check('the bundle carries the mark images and the registry', /id="bw-watermark-data"/.test(fs.readFileSync(bundle, 'utf8')) && /id="bw-doctypes"/.test(fs.readFileSync(bundle, 'utf8')));

const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-1109'] });
const errors = [];
async function open(ui) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((u) => { try { if (!sessionStorage.getItem('bw-wm-seen')) { sessionStorage.setItem('bw-wm-seen', '1'); localStorage.setItem('bw:ui', u); localStorage.setItem('bw:dark', '0'); localStorage.setItem('bw:wm-intro', '1'); localStorage.removeItem('bw:start-pins'); localStorage.removeItem('bw:start'); } } catch { /* storage off */ } }, ui);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${ui}: ${e.message}`));
  await page.goto(pathToFileURL(bundle).href + '?start=1');
  await page.waitForFunction(() => window.BW?.ready, null, { timeout: 60000 });
  await page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });
  await page.waitForSelector('#bw-watermark img.on', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page };
}
const waitClosed = (page) => page.waitForSelector('html[data-bw-start="closed"]', { timeout: 15000, state: 'attached' });
const waitOpen = (page) => page.waitForSelector('html[data-bw-start="open"]', { timeout: 15000 });

/** The mark as a person sees it. */
const mark = (page) => page.evaluate(() => {
  const e = document.getElementById('bw-watermark');
  if (!e) return { missing: true };
  const cs = getComputedStyle(e);
  const q = e.getBoundingClientRect();
  const stage = e.querySelector('.bw-wm-stage');
  const s = stage.getBoundingClientRect();
  const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const img = e.querySelector('img.on');
  return {
    vis: cs.visibility, disp: cs.display, op: +cs.opacity, imgOp: img ? +getComputedStyle(img).opacity : 0, side: e.dataset.wmSide || '',
    left: Math.round(s.left), bottomGap: Math.round(innerHeight - q.bottom), stageBottomGap: Math.round(innerHeight - s.bottom), w: Math.round(s.width), h: Math.round(s.height),
    inView: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight, covered: !(top && top.closest('#bw-watermark')), topIs: top ? (top.id || top.className || top.tagName) : null,
    open: document.documentElement.dataset.bwStart,
  };
});
const seen = (m) => !m.missing && m.vis !== 'hidden' && m.disp !== 'none' && m.op > 0.5 && m.imgOp > 0 && m.inView && !m.covered;
const home = (m) => m.left === 44 && m.side === 'left' && m.bottomGap === 16 && m.stageBottomGap >= 16 && m.stageBottomGap <= 40 && m.w === 84 && m.h === 84;

/** With the start page open and scrolled to its end: what lies under the mark box. */
const under = (page) => page.evaluate(() => {
  const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('dialog.bw-start');
  if (!d) return { none: true };
  d.scrollTop = d.scrollHeight;
  const w = document.getElementById('bw-watermark').getBoundingClientRect();
  const hits = [...d.querySelectorAll('.st-tile, .st-chip, button, a[href], input, .st-hint, .st-nm, .st-ds, .st-rec, [data-recent]')].filter((n) => {
    const r = n.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || getComputedStyle(n).visibility === 'hidden') return false;
    return r.left < w.right && r.right > w.left && r.top < w.bottom && r.bottom > w.top;
  }).map((n) => `${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}${n.dataset?.type ? '[' + n.dataset.type + ']' : ''}`);
  return { hits: [...new Set(hits)].slice(0, 8) };
});

// poppler's tools (the xpdf ones that ship with Git for Windows have no -bbox): the configured folder, else the first on PATH that says "poppler"
function popplerTool(name) {
  const cands = [];
  const dir = config().poppler;
  if (dir) cands.push(path.join(dir, name), path.join(dir, `${name}.exe`));
  const where = spawnSync(process.platform === 'win32' ? 'where' : 'which', process.platform === 'win32' ? [name] : ['-a', name], { encoding: 'utf8' }).stdout || '';
  cands.push(...where.split(/\r?\n/).map((x) => x.trim()).filter(Boolean), name);
  for (const c of cands) { const v = spawnSync(c, ['-v'], { encoding: 'utf8' }); if (/poppler/i.test(`${v.stderr || ''}${v.stdout || ''}`)) return c; }
  return '';
}
const PDFTOTEXT = popplerTool('pdftotext');
const PDFIMAGES = popplerTool('pdfimages');
check('poppler (pdftotext, pdfimages) is available', !!PDFTOTEXT && !!PDFIMAGES, 'set BW_POPPLER to the poppler bin folder');

const jobs = [];
try {
  for (const ui of ['en', 'ar']) {
    for (const kind of ['old SRS', 'typed document']) {
      const L = `${ui.toUpperCase()} ${kind}`;
      const { ctx, page } = await open(ui);
      // 1. the start page is up (it shows on every open): the mark is on screen at its home, and nothing of the page lies under it
      let m = await mark(page);
      check(`${L}: start page open: the mark is on screen (not hidden, not covered)`, seen(m), JSON.stringify(m));
      check(`${L}: start page open: the mark is at the bottom left, stage 44 px from the left edge, box 16 px from the bottom`, home(m), JSON.stringify(m));
      const u = await under(page);
      check(`${L}: start page open: scrolled to the end, no tile, button, field or hint lies under the mark`, !u.hits?.length, JSON.stringify(u));
      // 2. the page works: create the document
      if (kind === 'typed document') await page.evaluate(() => window.BW.EXT.start.create('user-manual'));
      else await page.evaluate(() => window.BW.EXT.start.close());
      await waitClosed(page);
      if (kind === 'old SRS') {
        await page.evaluate(() => { const sel = document.getElementById('bw-ui-host').shadowRoot.querySelector('[data-a="svc"]'); sel.value = 'event-permit'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.waitForFunction(() => window.BW.S.svc === 'event-permit');
      } else {
        await page.waitForFunction(() => window.BW.EXT.library.isDoc(window.BW.S.svc));
      }
      await page.waitForTimeout(250);
      m = await mark(page);
      check(`${L}: document open: the mark is on screen`, seen(m), JSON.stringify(m));
      check(`${L}: document open: the mark is at the bottom left, stage 44 px from the left edge, box 16 px from the bottom`, home(m), JSON.stringify(m));
      // 3. Home brings the start page back over the document: the mark stays
      await page.evaluate(() => window.BW.EXT.start.home());
      await waitOpen(page);
      await page.waitForTimeout(250);
      m = await mark(page);
      check(`${L}: Home (start page over the document): the mark stays on screen at its home`, seen(m) && home(m), JSON.stringify(m));
      await page.evaluate(() => window.BW.EXT.start.close());
      await waitClosed(page);
      m = await mark(page);
      check(`${L}: start page closed again: the mark is on screen at its home`, seen(m) && home(m), JSON.stringify(m));
      // 4. print: the mark never prints
      await page.emulateMedia({ media: 'print' });
      const pr = await page.evaluate(() => getComputedStyle(document.getElementById('bw-watermark')).display);
      check(`${L}: print media hides the mark (UI only)`, pr === 'none', pr);
      await page.emulateMedia({ media: 'screen' });
      jobs.push({ ctx });
    }
  }
  // 5. PDF of each combination (the engine's own export): the page text is there, the mark is not (it has never printed)
  const theme = loadTheme();
  const MARK = 256; // the mark images are 256 px WebP
  for (const ui of ['en', 'ar']) {
    for (const [kind, doc] of [['old SRS', JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', `document.${ui}.json`), 'utf8'))], ['typed document', DT.compose('user-manual', ui)]]) {
      const pdf = path.join(tmp, `${ui}-${kind.replace(/\W+/g, '')}.pdf`);
      await exportPdf(doc, { locale: ui, theme, pdfPath: pdf, browser });
      const words = (spawnSync(PDFTOTEXT, ['-enc', 'UTF-8', '-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout.match(/<word /g) || []).length;
      const imgs = (spawnSync(PDFIMAGES, ['-list', pdf], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '').split(/\r?\n/).slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
      const markSized = imgs.filter((c) => +c[3] === MARK && +c[4] === MARK).length;
      const roleWords = /tester|teacher|volunteer/i.test(spawnSync(PDFTOTEXT, ['-enc', 'UTF-8', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }).stdout);
      check(`${ui.toUpperCase()} ${kind}: PDF has its page text and no NJ mark (UI only, never printed)`, words > 50 && markSized === 0 && !roleWords, JSON.stringify({ words, images: imgs.length, markSized, roleWords }));
    }
  }
} finally {
  for (const j of jobs) await j.ctx.close().catch(() => {});
  await browser.close().catch(() => {});
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `\n${failed} FAILED` : `\nwatermark-0182: ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
