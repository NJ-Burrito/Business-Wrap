// 0.13.3 polish pass, through the real editor (a built copy, headless Edge, temp profile under out/):
//   DOCS-08  a floated (square-wrap) picture has a corner handle and resizes by drag, like a free one
//   TBOX     a bare click on a text box gives the same selected look (bw-ov-sel, solid 2px) as insert/drag
//   UIC-09   Arabic UI: start/end and undo/redo glyphs are swapped by ic() (data-sw) and the CSS mirror skips them; indent keeps the mirror
//   UIC-11   hdrDelete, ftrDelete, rowUp, rowDown, keepNext have their own glyph and their own named move
//   UIP-13   the ask dialog, the palette and the print center leave with .closing (the bw-modal family), and at once in calm mode
//   node tests/editor-polish-0133.test.mjs
import './_isolate.mjs';
import { act, rbBtn } from './_ribbon.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { pathToFileURL } from 'node:url';

const OUT = path.join(REPO, 'out', 'polish-0133');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') });
const PNG = path.join(OUT, 'pic.png');
fs.writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const P1 = '/chapters/1/sections/0/blocks/0/paragraphs/0';

async function open(browser, { ui = 'en', calm = false } = {}) {
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1500, height: 900 }, reducedMotion: 'no-preference' });
  await ctx.addInitScript(({ ui, calm }) => { try { localStorage.setItem('bw:ui', ui); if (calm) localStorage.setItem('bw:calm', '1'); } catch { /* none */ } }, { ui, calm });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready);
  await page.waitForTimeout(400); // R15: the boot is done when BW.ready holds; a settle for the first render
  return { ctx, page, errors };
}
const rootEval = (page, fn, arg) => page.evaluate(`(${fn})(document.getElementById('bw-ui-host').shadowRoot, ${JSON.stringify(arg ?? null)})`);
const pick = async (page, p) => { await page.locator(`main.bw-doc[data-locale="ar"] [data-p="${p}"]`).first().click(); await page.waitForTimeout(150); };
const ovs = (page) => page.evaluate(() => window.BW.M[window.BW.S.svc].ar.doc.overlays || []);

const browser = await chromium.launch(launchOptions());
try {
  /* ── DOCS-08 + text box look ── */
  {
    const { ctx, page, errors } = await open(browser, { ui: 'ar' });
    await pick(page, P1);
    const fc = page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null);
    await (await rbBtn(page, 'image')).click();
    (await fc)?.setFiles(PNG);
    await page.waitForFunction(() => (window.BW.M[window.BW.S.svc].ar.doc.overlays || []).length > 0, null, { timeout: 8000 });
    await page.waitForTimeout(500);
    const o0 = (await ovs(page))[0];
    const handle = page.locator('main.bw-doc[data-locale="ar"] .bw-ovf > .bw-ov-handle').first();
    check('DOCS-08: the default picture is a floated .bw-ovf (wrap square) with a corner handle', o0?.wrap === 'square' && (await handle.count()) === 1, `wrap=${o0?.wrap}`);
    await page.locator('main.bw-doc[data-locale="ar"] .bw-ovf').first().hover(); // the handle shows on hover
    await page.waitForTimeout(450);
    const side = await handle.evaluate((h) => h.dataset.side);
    const sgn = side === 'l' ? -1 : 1;
    const hb = await handle.boundingBox();
    const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    await page.mouse.move(cx + sgn * 25, cy + 5, { steps: 4 }); await page.mouse.move(cx + sgn * 50, cy + 10, { steps: 4 });
    await page.mouse.up(); await page.waitForTimeout(450);
    const o1 = (await ovs(page))[0];
    const sel = await page.evaluate(() => window.BW.S.selOv);
    check('DOCS-08: dragging the handle of a floated picture widens it (stored w grows) and keeps it picked', o1.w > o0.w + 5 && sel === 0 && o1.wrap === 'square', `w ${o0.w} -> ${o1.w} side=${side} selOv=${sel}`);
    check('DOCS-08: the resized picture shows the selected look', await page.evaluate(() => { const e = document.querySelector('main.bw-doc .bw-ovf'); return e.classList.contains('bw-ov-sel') && getComputedStyle(e).outlineStyle === 'solid'; }));

    // text box: insert (selected look), click elsewhere, bare click on the box
    await pick(page, P1);
    await page.evaluate(() => window.BW.runAction('insTextBox'));
    await page.waitForTimeout(500);
    const nTb = await page.evaluate(() => (window.BW.M[window.BW.S.svc].ar.doc.overlays || []).findIndex((o) => o.kind === 'text'));
    const tb = page.locator('main.bw-doc[data-locale="ar"] .bw-tb').first();
    const look = () => tb.evaluate((e) => ({ sel: e.classList.contains('bw-ov-sel'), st: getComputedStyle(e).outlineStyle, w: getComputedStyle(e).outlineWidth }));
    const a = await look();
    await pick(page, P1);
    const gone = await look();
    await tb.click({ position: { x: 20, y: 30 } }); await page.waitForTimeout(300);
    const c = await look();
    check('text box: after insert it has bw-ov-sel (solid 2px)', nTb >= 0 && a.sel && a.st === 'solid' && a.w === '2px', JSON.stringify(a));
    check('text box: a click elsewhere drops the look', !gone.sel, JSON.stringify(gone));
    check('text box: a bare click gives the same selected look as insert', c.sel && c.st === a.st && c.w === a.w, JSON.stringify(c));
    check('no page errors (images and boxes)', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ── glyph swap (UI-CHROME-09) and distinct glyphs (UI-CHROME-11) ── */
  for (const ui of ['ar', 'en']) {
    const { ctx, page, errors } = await open(browser, { ui });
    await pick(page, P1); // the format bar (align, indent) is drawn for a picked paragraph
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const B = window.BW;
      const info = (k) => { const s = document.getElementById('bw-ui-host').shadowRoot.querySelector(`svg.ic[data-ic="${k}"]`); return s ? { sw: s.hasAttribute('data-sw'), scale: getComputedStyle(s).scale, html: s.outerHTML.replace(/ data-ic="[^"]*"| data-sw="1"/g, '') } : null; };
      return { swapped: B.ic('fmtAlignStart'), start0: B.IC.fmtAlignStart, end: B.IC.fmtAlignEnd, undo: B.ic('undo'), redo: B.IC.redo, indent: B.ic('fmtIndent'), indentRaw: B.IC.fmtIndent, start: info('fmtAlignStart'), und: info('undo'), ind: info('fmtIndent') };
    });
    const strip = (h) => h.replace(/ data-ic="[^"]*"| data-sw="1"/g, '');
    if (ui === 'ar') {
      check('AR: ic("fmtAlignStart") draws the End glyph and says data-sw', strip(r.swapped) === r.end && r.swapped.includes('data-sw="1"'));
      check('AR: ic("undo") draws the Redo glyph', strip(r.undo) === r.redo && r.undo.includes('data-sw="1"'));
      check('AR: ic("fmtIndent") is not swapped (its arrow would point the wrong way); the CSS mirror applies', strip(r.indent) === r.indentRaw && !r.indent.includes('data-sw'));
      check('AR: a swapped glyph is not mirrored again by the CSS (scale none)', r.start?.sw && r.start.scale === 'none', JSON.stringify(r.start && { sw: r.start.sw, scale: r.start.scale }));
      check('AR: undo in the toolbar: swapped and not mirrored', r.und?.sw && r.und.scale === 'none', r.und?.scale);
      check('AR: indent in the toolbar keeps the CSS mirror (scale -1 1)', r.ind && !r.ind.sw && /^-1/.test(r.ind.scale), r.ind?.scale);
    } else {
      check('EN: ic("fmtAlignStart") is the plain glyph, no swap, no mirror', strip(r.swapped) === r.start0 && !r.swapped.includes('data-sw') && r.start && !r.start.sw && r.start.scale === 'none');
    }
    if (ui === 'en') {
      const g = await page.evaluate(() => {
        const B = window.BW; const keys = ['hdrDelete', 'ftrDelete', 'rowUp', 'rowDown', 'keepNext'];
        const norm = (k) => B.IC[k].replace(/ data-ic="[^"]*"/g, '');
        const others = ['delete', 'chDelete', 'moveUp', 'moveDown', 'fmtLink', 'duplicate', 'rowAdd', 'rowDel', 'pgBreak'].filter((k) => B.IC[k]);
        const clash = {};
        for (const k of keys) clash[k] = Object.keys(B.IC).filter((o) => o !== k && norm(o) === norm(k));
        return { keys, clash, parts: Object.fromEntries(keys.map((k) => [k, (B.IC[k].match(/<(path|rect|line|circle)\b/g) || []).length])), others };
      });
      check('UIC-11: hdrDelete, ftrDelete, rowUp, rowDown, keepNext each have a glyph no other command shares', g.keys.every((k) => g.clash[k].length === 0 && g.parts[k] > 0), JSON.stringify(g.clash));
      const css = fs.readFileSync(path.join(REPO, 'editor', 'ext', '40-icon-motion.css'), 'utf8');
      for (const k of ['hdrDelete', 'ftrDelete', 'rowUp', 'rowDown', 'keepNext']) {
        check(`UIC-11: ${k} has its own --icm move in 40-icon-motion.css`, new RegExp(`\\[data-ic="${k}"\\][^{]*\\{[^}]*--icm:`).test(css));
      }
      // the move really plays on hover (one part has a named animation)
      const played = await page.evaluate(async () => {
        const B = window.BW; const host = document.getElementById('bw-ui-host').shadowRoot;
        const out = {};
        const box = document.createElement('div'); box.className = 'shell'; box.dataset.calm = '0'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:99';
        for (const k of ['hdrDelete', 'ftrDelete', 'rowUp', 'rowDown', 'keepNext']) { const b = document.createElement('button'); b.className = 'b'; b.innerHTML = B.ic(k); b.dataset.k = k; box.appendChild(b); }
        host.appendChild(box);
        await new Promise((r) => setTimeout(r, 100));
        for (const b of box.querySelectorAll('button')) {
          b.classList.add('ic-go');
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          out[b.dataset.k] = [...b.querySelector('svg').children].filter((c) => { const a = getComputedStyle(c).animationName; return a && a !== 'none'; }).length;
          b.classList.remove('ic-go');
        }
        box.remove();
        return out;
      });
      check('UIC-11: each of the five plays a named move on at least one part (.ic-go)', Object.values(played).every((n) => n > 0), JSON.stringify(played));
    }
    check(`${ui}: no page errors (glyphs)`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ── exit transitions (UIP-13) ── */
  for (const calm of [false, true]) {
    const { ctx, page, errors } = await open(browser, { ui: 'en', calm });
    const tag = calm ? 'calm' : 'motion';
    const state = (sel) => rootEval(page, `(r, s) => { const e = r.querySelector(s); return { hidden: e.hidden, closing: e.classList.contains('closing'), anim: getComputedStyle(e).animationName, open: e.open }; }`, sel);
    // palette
    await page.keyboard.press('Control+K'); await page.waitForTimeout(450);
    check(`palette (${tag}): opens`, !(await state('.scrim')).hidden);
    await page.keyboard.press('Escape'); await page.waitForTimeout(40);
    let s = await state('.scrim');
    if (calm) check('palette (calm): hidden at once, no exit', s.hidden && !s.closing, JSON.stringify(s));
    else check('palette: leaves with .closing + fade-out first (still shown, then hidden)', !s.hidden && s.closing && s.anim === 'fade-out', JSON.stringify(s));
    await page.waitForTimeout(400);
    s = await state('.scrim');
    check(`palette (${tag}): hidden after the exit, class removed`, s.hidden && !s.closing, JSON.stringify(s));
    // reopened before the exit ends: stays open
    if (!calm) {
      await page.keyboard.press('Control+K'); await page.waitForTimeout(400);
      await page.keyboard.press('Escape'); await page.waitForTimeout(30);
      await page.keyboard.press('Control+K'); await page.waitForTimeout(400);
      s = await state('.scrim');
      check('palette: reopened during its exit, it stays open', !s.hidden && !s.closing, JSON.stringify(s));
      await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    }
    // ask dialog
    await pick(page, P1);
    await page.evaluate(() => { window.BW.runAction('fmtBefore'); });
    await page.waitForTimeout(450);
    s = await state('.dialog');
    check(`ask dialog (${tag}): opens`, !s.hidden, JSON.stringify(s));
    await page.keyboard.press('Escape'); await page.waitForTimeout(40);
    s = await state('.dialog');
    if (calm) check('ask dialog (calm): hidden at once', s.hidden && !s.closing, JSON.stringify(s));
    else check('ask dialog: leaves with .closing + dialog-out first', !s.hidden && s.closing && s.anim === 'dialog-out', JSON.stringify(s));
    await page.waitForTimeout(400);
    s = await state('.dialog');
    check(`ask dialog (${tag}): hidden after the exit`, s.hidden && !s.closing, JSON.stringify(s));
    // print center
    await page.evaluate(() => { window.BW.runAction('print'); });
    await page.waitForTimeout(500);
    s = await state('dialog.pc-dlg');
    check(`print center (${tag}): opens`, s.open === true, JSON.stringify(s));
    await rootEval(page, `(r) => r.querySelector('dialog.pc-dlg [data-pp="close"]').click()`);
    await page.waitForTimeout(40);
    s = await state('dialog.pc-dlg');
    if (calm) check('print center (calm): closed at once', s.open === false && !s.closing, JSON.stringify(s));
    else check('print center: leaves with .closing + dialog-out first (still open, then closed)', s.open === true && s.closing && s.anim === 'dialog-out', JSON.stringify(s));
    await page.waitForTimeout(400);
    s = await state('dialog.pc-dlg');
    check(`print center (${tag}): closed after the exit, class removed`, s.open === false && !s.closing, JSON.stringify(s));
    // Esc closes it through the same exit
    await page.evaluate(() => { window.BW.runAction('print'); });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); await page.waitForTimeout(450);
    s = await state('dialog.pc-dlg');
    check(`print center (${tag}): Esc closes it`, s.open === false && !s.closing, JSON.stringify(s));
    check(`exit transitions (${tag}): no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // reduced motion: static
  {
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1500, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); } catch { /* none */ } });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready);
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+K'); await page.waitForTimeout(300);
    await page.keyboard.press('Escape'); await page.waitForTimeout(40);
    const s = await rootEval(page, `(r) => { const e = r.querySelector('.scrim'); return { hidden: e.hidden, closing: e.classList.contains('closing') }; }`);
    check('prefers-reduced-motion: the palette closes at once, no exit animation', s.hidden && !s.closing, JSON.stringify(s));
    await ctx.close();
  }
} catch (e) {
  check('polish run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
