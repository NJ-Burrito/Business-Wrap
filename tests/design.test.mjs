// The Design panel check (0.10.0 B1–B3). Headless Chrome, closed at the end.
//
//   node tests/design.test.mjs
//
// B1 fonts: the machine list (queryLocalFonts, mocked: CI has no local-font permission) is de-duplicated,
//    sorted A→Z with an Arabic-aware collator and filtered as you type; arrow keys + Enter choose; an upload
//    adds @font-face to the document; the choice survives Save → fresh load → import; the PDF prints the
//    chosen face (TrueType, no Type 3); the DOCX embeds it only when its OS/2 fsType allows.
// B2 wording: no raw token (primary-deep, zebra, h1, rule-w ...) shows in the panel, Arabic or English.
// B3 numbers: letters refused, "12.5" taken, slider ↔ field live, unit change converts, the edits JSON
//    keeps number + unit, arrows step, colours take a hex code.
// Screenshots (viewport only) → out/compare-0.10.0-design/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { exportPdf, exportDocx, launchOptions, loadTheme, REPO, docxFonts } from '../engine/export.mjs';
import { systemFonts } from '../engine/fonts.mjs';
import { sfntFromBytes } from '../engine/fontinfo.mjs';
import { uploadedFontCss } from '../engine/render.mjs';
import { config } from '../engine/config.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.join(REPO, 'out', 'design-test');
const SHOTS = path.join(REPO, 'out', 'compare-0.10.0-design');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const POPPLER = [config().poppler].find((d) => d && fs.existsSync(path.join(d, 'pdffonts.exe')));
const tool = (name) => (POPPLER ? path.join(POPPLER, `${name}.exe`) : name);

const results = [];
let failed = 0;
const skips = [];
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const skip = (name, why) => { results.push(`SKIP  ${name}  — ${why}`); skips.push(name); };
const info = (name, detail) => results.push(`INFO  ${name}  — ${detail}`);

// A TrueType font of this machine stands in for "a font the user has" (fonts are never committed).
const PREFER = ['DejaVu Sans', 'Liberation Sans', 'Arial', 'Segoe UI', 'Noto Sans', 'Verdana'];
const ttfs = systemFonts().filter((f) => f.format === 'ttf' && f.outlines === 'truetype' && f.embeddable && !f.italic && f.weight === 400 && /^[\x20-\x7e]+$/.test(f.family) && fs.statSync(f.file).size < 1.9 * 1024 * 1024);
const FONT = PREFER.map((n) => ttfs.find((f) => f.family === n)).find(Boolean) || ttfs[0];
const FONT_BYTES = FONT ? fs.readFileSync(FONT.file) : null;
/** a copy of the font whose OS/2 fsType says Restricted Licence embedding (0x0002) */
function restricted(bytes) {
  const b = Buffer.from(bytes);
  const n = b.readUInt16BE(4);
  for (let i = 0; i < n; i += 1) if (b.toString('latin1', 12 + i * 16, 16 + i * 16) === 'OS/2') b.writeUInt16BE(0x0002, b.readUInt32BE(12 + i * 16 + 8) + 8);
  return b;
}
const unzip = (file, part) => spawnSync('python', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);n=z.namelist();sys.stdout.write("\\n".join(n) if sys.argv[2]=="?" else z.read(sys.argv[2]).decode("utf-8"))', file, part], { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } }).stdout || '';

const editorFile = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editorFile, set: 'design-test', watermarkDir: null });
const editorUrl = pathToFileURL(editorFile).href;

// the machine's fonts as queryLocalFonts gives them: one entry per face, unsorted, a family in Arabic
const MOCK = [
  ['Zeta Grotesk', 'Regular'], ['zeta grotesk', 'Bold'], ['نسخ تجريبي', 'Regular'], ['Alpha Serif', 'Bold'], ['Alpha Serif', 'Regular'],
  ['Écran Mono', 'Regular'], ['beta Round', 'Regular'], ['خط الرقعة التجريبي', 'Regular'], ...(FONT ? [[FONT.family, 'Regular']] : []),
];
const mockFonts = (b64) => {
  const bytes = b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) : new Uint8Array(0);
  window.__mockFonts = window.__MOCK.map(([family, style]) => ({ family, style, fullName: `${family} ${style}`, postscriptName: family.replace(/\s/g, '') + '-' + style, blob: async () => new Blob([bytes]) }));
  window.queryLocalFonts = async () => window.__mockFonts.slice();
};

const browser = await chromium.launch(launchOptions());
const shadow = (page, fn, arg) => page.evaluate(([f, a]) => new Function('r', 'a', `return (${f})(r, a)`)(document.getElementById('bw-ui-host').shadowRoot, a), [fn.toString(), arg]);
async function open(ctx, ui) {
  await ctx.addInitScript(([ui, mock, b64, fn]) => {
    try { localStorage.setItem('bw:ui', ui); } catch {}
    window.__MOCK = mock;
    new Function('b64', `(${fn})(b64)`)(b64);
  }, [ui, MOCK, FONT_BYTES ? FONT_BYTES.toString('base64') : '', mockFonts.toString()]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(editorUrl);
  await page.waitForFunction(() => window.BW?.ready);
  return { page, errors };
}
const theme = async (page) => { await page.locator('.island button[data-a="theme"]').click(); await page.locator('.drawer .dgrp').first().waitFor(); await page.waitForTimeout(500); };
const design = (page) => page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.design || {});
/** viewport screenshot of one element, after asserting it lies inside the viewport */
async function shot(page, sel, name) {
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const box = await el.boundingBox();
  const vp = page.viewportSize();
  const inside = !!box && box.y >= 0 && box.y < vp.height && box.x >= 0 && box.x < vp.width;
  check(`screenshot ${name}: target inside the viewport`, inside, JSON.stringify(box));
  await page.screenshot({ path: path.join(SHOTS, name) });
}
const RAW = /(^|[^\p{L}\p{N}-])(primary-deep|primary|accent-bright|accent-rule|rule-strong|th-fill|th-ink|zebra|h1|h2|h3|micro|meta|page-side|rule-w|th-rule-w|background-color|font-size|font-weight|line-height|letter-spacing|text-align|border-radius)(?=$|[^\p{L}\p{N}-])/u;
const CAMEL = /\b[a-z]+[A-Z][A-Za-z]*\b|\b[a-z]+\/[a-zA-Z0-9]+\b/;

try {
  for (const ui of ['ar', 'en']) {
    // bypassCSP only so axe can be injected; the page's own CSP is checked by tests/editor.test.mjs
    const ctx = await browser.newContext({ acceptDownloads: true, bypassCSP: true, viewport: { width: 1366, height: 900 } });
    const { page, errors } = await open(ctx, ui);
    await theme(page);

    // ── B2: plain wording, no raw token in the panel (labels, hints, units, options) ──
    await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer details').forEach((d) => { d.open = true; }));
    // every text node on its own line (labels, hints, unit options), then every aria-label and placeholder
    const text = await shadow(page, (r) => { const d = r.querySelector('.drawer'); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); const out = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('textarea,svg,style') && n.nodeValue.trim()) out.push(n.nodeValue.trim()); return [...out, ...[...d.querySelectorAll('[aria-label],[placeholder]')].map((x) => x.getAttribute('aria-label') || x.getAttribute('placeholder'))].join('\n'); });
    const raw = text.split('\n').filter((l) => RAW.test(l) || CAMEL.test(l));
    check(`${ui} B2: no raw token in the Design panel (labels, hints, aria-labels)`, raw.length === 0, raw.slice(0, 4).join(' | '));
    const groups = await shadow(page, (r) => [...r.querySelectorAll('.drawer details.dgrp > summary')].map((s) => s.textContent.trim()));
    check(`${ui} B2: settings grouped (fonts, colours, sizes, spacing, page parts, logos …)`, groups.length >= 6, groups.join(' · '));
    const hints = await shadow(page, (r) => [...r.querySelectorAll('.drawer .vc, .drawer .cc, .drawer .fp')].filter((x) => x.querySelector('.hint')?.textContent.trim()).length);
    const controls = await shadow(page, (r) => r.querySelectorAll('.drawer .vc, .drawer .cc, .drawer .fp').length);
    check(`${ui} B2: every setting carries a one-line hint`, hints === controls && controls >= 27, `${hints}/${controls}`);
    check(`${ui} B1: Cairo is suggested nowhere`, !/cairo/i.test(text));
    await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.drawer details[data-grp="labels"], .drawer details[data-grp="css"]').forEach((d) => { d.open = false; }));

    await shot(page, '.drawer details[data-grp="fonts"]', `design-panel-${ui}.png`);

    // ── B1: the default and the project section ──
    const btn = await shadow(page, (r) => ({ v: r.querySelector('[data-fpopen="text"] .fp-v').textContent, tag: !!r.querySelector('[data-fpopen="text"] .fp-tag') }));
    const def = loadTheme().fonts.text;
    check(`${ui} B1: Thmanyah stays the default (button shows it, marked default)`, btn.v === def && btn.tag, JSON.stringify(btn));

    // ── B1: the machine list: permission on a button press, de-duplicated, A→Z (Arabic-aware), filter, keyboard ──
    await page.locator('.drawer [data-fpopen="text"]').click();
    await page.locator('.drawer [data-fplocal="text"]').click();
    await page.locator('.drawer .fp-o[id*="-local-"]').first().waitFor();
    const local = await shadow(page, (r) => [...r.querySelectorAll('.drawer .fp-o[id*="-local-"]')].map((o) => o.dataset.fam));
    const want = [...new Map(MOCK.map(([f]) => [f.toLowerCase(), f])).keys()].map((k) => MOCK.find(([f]) => f.toLowerCase() === k)[0]).sort(new Intl.Collator(ui === 'ar' ? ['ar', 'en'] : ['en', 'ar'], { sensitivity: 'base', numeric: true }).compare);
    check(`${ui} B1: machine fonts listed once per family, sorted A→Z (Arabic-aware)`, JSON.stringify(local) === JSON.stringify(want), JSON.stringify(local));
    const prev = await shadow(page, (r) => { const p = r.querySelector('.drawer .fp-o[id*="-local-"] .fp-prev'); return { text: p.textContent, fam: p.style.fontFamily }; });
    check(`${ui} B1: each font previews Arabic + English sample in its own face`, /[؀-ۿ]/.test(prev.text) && /[A-Za-z]/.test(prev.text) && prev.fam.includes(local[0]), JSON.stringify(prev));
    await shot(page, '.drawer .fp-pop', `font-picker-${ui}.png`);
    await page.locator('.drawer .fp-q').fill('alpha');
    const filtered = await shadow(page, (r) => [...r.querySelectorAll('.drawer .fp-o')].map((o) => o.dataset.fam));
    check(`${ui} B1: typing filters the list`, filtered.length === 1 && filtered[0] === 'Alpha Serif', JSON.stringify(filtered));
    await page.locator('.drawer .fp-q').fill('ecran');
    const folded = await shadow(page, (r) => [...r.querySelectorAll('.drawer .fp-o')].map((o) => o.dataset.fam));
    check(`${ui} B1: search ignores accents and case`, folded.length === 1 && folded[0] === 'Écran Mono', JSON.stringify(folded));
    if (FONT) {
      await page.locator('.drawer .fp-q').fill(FONT.family.slice(0, 5));
      await page.keyboard.press('Home');
      const act = await shadow(page, (r) => r.querySelector('.drawer .fp-o.active')?.dataset.fam);
      await page.keyboard.press('Enter');
      await page.waitForFunction((f) => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.design?.fonts?.text === f, act, { timeout: 4000 }).catch(() => {});
      const d1 = await design(page);
      check(`${ui} B1: keyboard (Home + Enter) chooses a font; saved in the document`, d1.fonts?.text === act && !!act, JSON.stringify(d1.fonts));
      const applied = await page.evaluate(() => getComputedStyle(document.querySelector('main.bw-doc p, main.bw-doc td')).fontFamily);
      check(`${ui} B1: the document shows the chosen font`, applied.includes(act), applied);
      const note = await shadow(page, (r) => r.querySelector('.drawer .fp[data-fp="text"] .fp-warn').textContent.trim());
      check(`${ui} B1: a machine font carries its plain note under the picker`, note.length > 20, note.slice(0, 80));
    } else skip(`${ui} B1: keyboard choose + document face`, 'no TrueType font installed on this machine');

    // ── B1: the API missing / refused: a plain explanation with the server and upload paths ──
    {
      const c2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
      await c2.addInitScript(() => { delete window.queryLocalFonts; });
      const { page: p2 } = await open(c2, ui);
      await p2.evaluate(() => { delete window.queryLocalFonts; });
      await theme(p2);
      await p2.locator('.drawer [data-fpopen="text"]').click();
      await p2.locator('.drawer [data-fplocal="text"]').click();
      await p2.waitForTimeout(300);
      const msg = await shadow(p2, (r) => r.querySelector('.drawer .fp-acts').textContent);
      check(`${ui} B1: no Local Font Access → plain explanation + upload offered`, /Chrome|Edge/.test(msg) && !!(await shadow(p2, (r) => !!r.querySelector('[data-fpupload]'))), msg.slice(0, 120));
      await p2.evaluate(() => { window.queryLocalFonts = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
      await p2.locator('.drawer [data-fplocal="text"]').click();
      await p2.waitForTimeout(300);
      const msg2 = await shadow(p2, (r) => r.querySelector('.drawer .fp-acts').textContent);
      check(`${ui} B1: refused on a file:// page → names npm run serve (localhost) and the upload`, /npm run serve/.test(msg2) && /localhost/.test(msg2), msg2.slice(0, 160));
      await c2.close();
    }

    // ── B1: upload a font file → @font-face in the document, chosen, warning when its licence forbids embedding ──
    if (FONT) {
      await page.locator('.drawer [data-fpopen="display"]').click();
      const up = path.join(OUT, 'upload.ttf');
      fs.writeFileSync(up, FONT_BYTES);
      const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.drawer [data-fpupload="display"]').click()]);
      await ch.setFiles(up);
      await page.waitForFunction(() => (window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.design?.fontFaces || []).length > 0, null, { timeout: 5000 }).catch(() => {});
      const d2 = await design(page);
      const css = await page.evaluate(() => document.getElementById('bw-doc-css').textContent.slice(0, 400));
      check(`${ui} B1: upload adds @font-face to the document and chooses it`, d2.fontFaces?.[0]?.family === FONT.family && d2.fonts?.display === FONT.family && css.includes(`@font-face{font-family:'${FONT.family}'`), `${d2.fontFaces?.[0]?.family} ${css.slice(0, 80)}`);
      const r1 = await page.evaluate(() => document.fonts.check(`16px '${window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.design.fonts.display}'`));
      check(`${ui} B1: the uploaded face loads in the editor`, r1);

      // the restricted copy: the picker warns
      const bad = path.join(OUT, 'restricted.ttf');
      fs.writeFileSync(bad, restricted(FONT_BYTES));
      await page.locator('.drawer [data-fpopen="text"]').click();
      const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.drawer [data-fpupload="text"]').click()]);
      await ch2.setFiles(bad);
      await page.waitForFunction(() => (window.BW.M[window.BW.S.svc][window.BW.S.ed].doc.design?.fontFaces || []).some((f) => f.embed === false), null, { timeout: 5000 }).catch(() => {});
      const warn = await shadow(page, (r) => r.querySelector('.drawer .fp[data-fp="text"] .fp-warn')?.textContent.trim() || '');
      const d3 = await design(page);
      check(`${ui} B1: a font whose licence forbids embedding is flagged in the UI`, d3.fontFaces.some((f) => f.embed === false) && /DOCX/.test(warn), warn.slice(0, 100));
      // put the embeddable face back as the body font for the export checks
      await page.locator('.drawer [data-fprm]').count();
      await page.evaluate((fam) => {
        const e = window.BW.M[window.BW.S.svc][window.BW.S.ed];
        const next = JSON.parse(JSON.stringify(e.doc.design));
        next.fontFaces = next.fontFaces.filter((f) => f.embed !== false);
        next.fonts.text = fam;
        window.BW.commit([{ op: 'replace', path: '/design', value: next, old: e.doc.design }], { mirror: true });
      }, FONT.family);
    } else skip(`${ui} B1: upload`, 'no TrueType font installed on this machine');

    // ── B3: slider + number + unit ──
    await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer details[data-grp="sizes"]').open = true);
    const h1 = '.drawer .vc[data-vc="sizes:h1"]';
    await page.locator(`${h1} .vc-n`).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('1a2.5b.');
    const typed = await page.locator(`${h1} .vc-n`).inputValue();
    check(`${ui} B3: letters and a second decimal point are refused, "12.5" accepted`, typed === '12.5', typed);
    const pasted = await page.locator(`${h1} .vc-n`).evaluate((f) => { const dt = new DataTransfer(); dt.setData('text/plain', 'abc 9'); f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true })); return f.value; });
    check(`${ui} B3: pasting junk is refused`, pasted === '12.5', pasted);
    const slid = await page.locator(`${h1} .vc-s`).evaluate((s) => s.value);
    check(`${ui} B3: field → slider follows live`, +slid === 12.5, slid);
    const live = await page.evaluate(() => document.documentElement.style.getPropertyValue('--t-h1'));
    check(`${ui} B3: the page previews while typing`, live === '12.5pt', live);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);
    check(`${ui} B3: committed as number + unit`, (await design(page)).sizes?.h1 === '12.5pt', JSON.stringify((await design(page)).sizes));
    await page.locator(`${h1} .vc-s`).evaluate((s) => { s.value = '20'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    check(`${ui} B3: slider → field follows live`, (await page.locator(`${h1} .vc-n`).inputValue()) === '20');
    await page.locator(`${h1} .vc-s`).evaluate((s) => s.dispatchEvent(new Event('change', { bubbles: true })));
    await page.locator(`${h1} .vc-n`).focus();
    await page.keyboard.press('ArrowUp');
    check(`${ui} B3: arrow keys step the value`, (await page.locator(`${h1} .vc-n`).inputValue()) === '20.5');
    await page.waitForTimeout(700);
    await page.locator(`${h1} select.vc-u`).selectOption('mm');
    await page.waitForTimeout(200);
    const mm = await page.locator(`${h1} .vc-n`).inputValue();
    const sizes = (await design(page)).sizes || {};
    check(`${ui} B3: unit change converts (20.5pt → mm)`, Math.abs(+mm - 20.5 * 25.4 / 72) < 0.01 && sizes.h1 === `${mm}mm`, `${mm} · ${sizes.h1}`);
    const uopts = await page.locator(`${h1} select.vc-u option`).evaluateAll((o) => o.map((x) => x.value));
    const lopts = await page.locator('.drawer .vc[data-vc="vars:rule-w"] select.vc-u option').evaluateAll((o) => o.map((x) => x.value));
    check(`${ui} B3: each setting lists only its valid units`, uopts.join() === 'pt,px,mm,em' && lopts.join() === 'px,pt,mm', `${uopts} | ${lopts}`);
    const line = '.drawer .vc[data-vc="vars:line"]';
    await page.evaluate(() => document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer details[data-grp="spacing"]').open = true);
    await page.locator(`${line} .vc-n`).fill('1.65');
    await page.locator(`${line} .vc-n`).press('Tab');
    await page.waitForTimeout(200);
    check(`${ui} B3: line spacing is a bare multiple (no unit typed)`, (await design(page)).vars?.line === '1.65', (await design(page)).vars?.line);
    const ps = page.locator('.drawer .vc[data-vc="vars:page-side"] .vc-n');
    await ps.fill('');
    await ps.focus();
    await page.keyboard.type('-5');
    const neg = await ps.inputValue();
    check(`${ui} B3: no minus where a negative value means nothing`, neg === '5', neg);
    // colours: swatch + hex
    const hexSel = '.drawer input.cc-hex[data-hex-dv="zebra"]';
    await page.locator(hexSel).fill('#F1E');
    await page.locator(hexSel).press('Tab');
    await page.waitForTimeout(200);
    check(`${ui} B3: a colour takes a typed hex code (3 digits expand)`, (await design(page)).vars?.zebra === '#ff11ee', (await design(page)).vars?.zebra);
    await page.locator(hexSel).fill('red');
    await page.locator(hexSel).press('Tab');
    await page.waitForTimeout(200);
    check(`${ui} B3: an invalid hex code is refused and put back`, (await design(page)).vars?.zebra === '#ff11ee' && (await page.locator(hexSel).inputValue()) === '#ff11ee');
    await shot(page, '.drawer details[data-grp="sizes"] .vc[data-vc="sizes:h1"]', `sizes-${ui}.png`);

    // axe with the picker open and the number controls on screen
    await page.addScriptTag({ path: AXE });
    await page.locator('.drawer [data-fpopen="text"]').click();
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] })).violations.filter((x) => ['serious', 'critical'].includes(x.impact)).map((x) => `${x.id}@${x.nodes[0]?.target?.join(' ')}`));
    check(`${ui} a11y: axe 0 serious/critical with the font list open`, v.length === 0, v.join(' | '));
    await page.keyboard.press('Escape');

    // ── B1/B3 persistence: Save (edits JSON) → fresh load → import → same choices ──
    const edits = await page.evaluate(() => window.BW.editsFile(window.BW.S.svc, window.BW.S.ed));
    const ef = path.join(OUT, `edits.${ui}.json`);
    fs.writeFileSync(ef, JSON.stringify(edits));
    const last = [...edits.ops].reverse().find((o) => o.path === '/design');
    check(`${ui} B3: the edits JSON stores number + unit`, /^\d+(\.\d+)?mm$/.test(last?.value?.sizes?.h1 || '') && last.value.vars.line === '1.65', JSON.stringify(last?.value?.sizes));
    const before = await design(page);
    const ctx3 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const { page: p3 } = await open(ctx3, ui);
    const [ch3] = await Promise.all([p3.waitForEvent('filechooser'), (async () => { await p3.keyboard.press('Control+K'); await p3.locator('#cmdlist [data-cmd="import"]').click(); })()]);
    await ch3.setFiles(ef);
    await p3.waitForFunction((n) => window.BW.M[window.BW.S.svc][window.BW.S.ed].ops.length >= n, edits.ops.length, { timeout: 5000 }).catch(() => {});
    const after = await design(p3);
    check(`${ui} B1: font choice and uploads persist across reopen`, JSON.stringify(after.fonts) === JSON.stringify(before.fonts) && (after.fontFaces || []).length === (before.fontFaces || []).length, JSON.stringify(after.fonts));
    await theme(p3);
    const shown = await shadow(p3, (r) => r.querySelector('[data-fpopen="text"] .fp-v').textContent);
    check(`${ui} B1: the reopened panel shows the saved font`, shown === before.fonts?.text || (!before.fonts?.text && shown === def), shown);
    await ctx3.close();

    // ── B1: the chosen font reaches the PDF and the DOCX ──
    if (FONT && ui === 'en') {
      const doc = await page.evaluate(() => window.BW.M[window.BW.S.svc][window.BW.S.ed].doc);
      const pdf = path.join(OUT, 'font.en.pdf');
      await exportPdf(doc, { locale: 'en', theme: loadTheme(), pdfPath: pdf, browser });
      const pf = spawnSync(tool('pdffonts'), [pdf], { encoding: 'utf8' }).stdout || '';
      const stem = FONT.family.replace(/\s/g, '');
      check('B1: the PDF prints the chosen font (TrueType, no Type 3)', pf.includes(stem) && /CID TrueType|TrueType/.test(pf) && !/Type 3/.test(pf), pf.split('\n').filter((l) => l.includes(stem)).slice(0, 2).join(' / ') || pf.slice(0, 200));
      const docx = exportDocx(doc, { locale: 'en', theme: loadTheme(), docxPath: path.join(OUT, 'font.en.docx') });
      const names = unzip(docx.docx, '?');
      const ft = unzip(docx.docx, 'word/fontTable.xml');
      check('B1: the DOCX names the chosen font and embeds it (fsType allows)', names.includes('word/fonts/') && new RegExp(`w:name="${FONT.family}">[^]*?embedRegular`).test(ft) && !docx.fontNotes.length, JSON.stringify(docx.fontNotes));
      // the same family uploaded with fsType = Restricted: named, never embedded, and the export says why
      const rdoc = JSON.parse(JSON.stringify(doc));
      rdoc.design.fontFaces = [{ family: 'Restricted Probe', weight: 400, src: `data:font/ttf;base64,${restricted(FONT_BYTES).toString('base64')}`, format: 'ttf', embed: false }];
      rdoc.design.fonts = { text: 'Restricted Probe', display: 'Restricted Probe' };
      const rd = exportDocx(rdoc, { locale: 'en', theme: loadTheme(), docxPath: path.join(OUT, 'restricted.en.docx') });
      const rft = unzip(rd.docx, 'word/fontTable.xml');
      check('B1: DOCX never embeds a font whose fsType forbids it, and reports it', rd.fontNotes.some((n) => n.why === 'licence') && !/w:name="Restricted Probe">[^<]*<w:embed/.test(rft) && !unzip(rd.docx, '?').includes('word/fonts/'), JSON.stringify(rd.fontNotes));
      const css = uploadedFontCss({ design: { fontFaces: [{ family: "x');}body{color:red", src: 'data:font/ttf;base64,AAAA' }, { family: 'ok', src: 'https://evil/x.ttf' }] } });
      check('B1: @font-face from a document is sanitised (family, data URI only)', !css.includes("'x')") && !css.includes('evil'), css.slice(0, 120));
    } else if (!FONT) skip(`${ui} B1: PDF + DOCX`, 'no TrueType font installed on this machine');

    // ── B2/B3 on «Style this element»: plain labels, number controls ──
    await page.keyboard.press('Escape');
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
    await page.keyboard.press('Control+K');
    await page.locator('#cmdlist [data-cmd="styleThis"]').click();
    await page.locator('.drawer .vc[data-vc="style:font-size"]').waitFor();
    const stText = await shadow(page, (r) => { const d = r.querySelector('.drawer'); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); const out = []; for (let n = w.nextNode(); n; n = w.nextNode()) if (!n.parentElement.closest('svg,style') && n.nodeValue.trim()) out.push(n.nodeValue.trim()); return [...out, ...[...d.querySelectorAll('[aria-label]')].map((x) => x.getAttribute('aria-label'))].join('\n'); });
    const stRaw = stText.split('\n').filter((l) => RAW.test(l));
    check(`${ui} B2: «Style this element» shows no CSS property names`, stRaw.length === 0, stRaw.slice(0, 3).join(' | '));
    await page.locator('.drawer .vc[data-vc="style:font-size"] .vc-n').fill('13.5');
    await page.locator('.drawer .vc[data-vc="style:font-size"] .vc-n').press('Tab');
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return e.doc.chapters[1].sections[0].blocks[1].style; });
    check(`${ui} B3: an element's own size is stored as number + unit`, st?.['font-size'] === '13.5pt', JSON.stringify(st));
    await shot(page, '.drawer .vc[data-vc="style:font-size"]', `style-element-${ui}.png`);

    check(`${ui}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // the Local Font Access API itself on a file:// page (real Chrome, permission granted as a user would)
  const ctxF = await browser.newContext();
  try { await ctxF.grantPermissions(['local-fonts']); } catch { /* older Chrome: no such permission */ }
  const pf = await ctxF.newPage();
  await pf.goto(editorUrl);
  const api = await pf.evaluate(async () => { if (!('queryLocalFonts' in window)) return 'no API'; try { return `${(await window.queryLocalFonts()).length} faces`; } catch (e) { return `${e.name}`; } });
  info('Local Font Access on file:// (Chrome, permission granted)', `secure context ${await pf.evaluate(() => isSecureContext)}, queryLocalFonts → ${api}`);
  await ctxF.close();

  // fsType reading on the engine side
  if (FONT) {
    const i0 = sfntFromBytes(new Uint8Array(FONT_BYTES));
    const i1 = sfntFromBytes(new Uint8Array(restricted(FONT_BYTES)));
    check('B1: OS/2 fsType read from the font file', i0.embeddable === true && i1.embeddable === false && i1.fsType === 2, `${i0.fsType} → ${i1.fsType}`);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-plan-'));
    const plan = docxFonts({ design: { fonts: { text: FONT.family, display: 'No Such Family Probe' } } }, { theme: loadTheme(), work });
    fs.rmSync(work, { recursive: true, force: true });
    check('B1: a machine font is embedded, a missing one is reported', plan.cuts.some((c) => c.family === FONT.family) && plan.notes.some((n) => n.family === 'No Such Family Probe' && n.why === 'missing'), JSON.stringify(plan.notes));
  }
  info('stand-in font', FONT ? `${FONT.family} (${path.basename(FONT.file)})` : 'none');
} catch (e) {
  check('test run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}

console.log(results.join('\n'));
const ran = results.filter((r) => !r.startsWith('INFO')).length - skips.length;
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${ran - failed}/${ran}${skips.length ? ` (${skips.length} skipped)` : ''}`);
fs.writeFileSync(path.join(OUT, 'results.txt'), results.join('\n') + '\n');
process.exit(failed ? 1 : 0);
