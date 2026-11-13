// bw-0162: Settings > file icons card collapses/expands like every other card (mouse + Enter), survives a redraw.
//   node tests/settings-icons-0162.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { serve } from '../engine/serve.mjs';

let failed = 0;
const check = (name, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  settings-icons-0162: ${name}${d && !ok ? '  - ' + d : ''}`); if (!ok) failed += 1; };
const OUT = path.join(REPO, 'out', 'settings-icons-0162-test');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file });
const server = await serve(file, 0, { out: OUT });
const browser = await chromium.launch(launchOptions());
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:ui', 'en'); localStorage.setItem('bw:wm-intro', '1'); sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.BW?.ready);
  await page.evaluate(() => window.BW.runAction('settings'));
  const sel = '.drawer .set-ico details.pgrp';
  await page.waitForFunction((s) => !!document.getElementById('bw-ui-host').shadowRoot.querySelector(s), sel);
  const st = () => page.evaluate((s) => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector(s); return { open: d.open, body: !!d.querySelector('.set-ico-body'), vis: d.querySelector('.set-ico-body')?.getBoundingClientRect().height > 0 }; }, sel);
  const sum = page.locator(`${sel} > summary`);
  let s = await st();
  check('card holds its body in the group', s.body);
  const first = s.open;
  await sum.click();
  s = await st();
  check('mouse click toggles (1)', s.open === !first && s.vis === s.open);
  await sum.click();
  s = await st();
  check('mouse click toggles (2)', s.open === first);
  await sum.focus();
  await page.keyboard.press('Enter');
  s = await st();
  check('Enter toggles', s.open === !first);
  // a redraw of the card keeps its state
  await page.evaluate(() => { const r = document.getElementById('bw-ui-host').shadowRoot; r.querySelector('.drawer [data-k="icoApply"]')?.removeAttribute('disabled'); });
  await page.evaluate(() => window.BW.runAction('settings')); // closes the drawer
  await page.waitForTimeout(600);
  await page.evaluate(() => window.BW.runAction('settings')); // opens it again, rebuilt
  await page.waitForFunction((s) => !!document.getElementById('bw-ui-host').shadowRoot.querySelector(s), sel);
  await page.waitForTimeout(600);
  s = await st();
  check('state survives a redraw', s.open === !first, JSON.stringify(s));
  await page.waitForTimeout(800);
  await sum.press('Enter');
  await page.waitForTimeout(200);
  s = await st();
  check('Enter toggles back', s.open === first, JSON.stringify([s, first]));
} finally { await browser.close(); await new Promise((r) => { server.close(r); server.closeAllConnections?.(); }); }
process.exit(failed ? 1 : 0);
