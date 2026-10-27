// Dev probe: open an editor HTML, print console errors, take a viewport shot.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from '../engine/export.mjs';
const [file, shot, js] = process.argv.slice(2);
const b = await chromium.launch(launchOptions());
try {
  const p = await b.newPage({ viewport: { width: 1366, height: 800 } });
  const errs = [];
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
  p.on('requestfailed', (r) => errs.push('FAILED ' + r.url().slice(0, 120)));
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await p.goto(pathToFileURL(path.resolve(file)).href);
  await p.waitForTimeout(800);
  if (js) console.log(await p.evaluate(js));
  if (shot) await p.screenshot({ path: shot });
  console.log(errs.join('\n') || 'no console errors');
} finally { await b.close(); }
