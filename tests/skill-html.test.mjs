// The editor shipped inside the skill (assets/editor/business-wrap.html):
// current with the source, no machine path and no font bytes, opens from disk with no
// console error on the blank document, offers the sample, and opens a document JSON at run time.
import './_isolate.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions, REPO } from '../engine/export.mjs';

const HTML = path.join(REPO, 'assets', 'editor', 'business-wrap.html');
let fails = 0;
const ok = (name, cond, info = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  skill-html: ${name}${info ? `  — ${info}` : ''}`); if (!cond) fails += 1; };

const chk = spawnSync(process.execPath, [path.join(REPO, 'engine', 'build-skill-html.mjs'), '--check'], { encoding: 'utf8' });
ok('shipped file is current with the source', chk.status === 0, (chk.stdout || chk.stderr).trim());
const html = fs.readFileSync(HTML, 'utf8');
ok('no machine path', !/file:\/\/\/|[A-Za-z]:[\\/]+Users[\\/]/i.test(html));
ok('no font bytes (local() only)', !/data:font\//.test(html) && /src:local\(/.test(html));

const browser = await chromium.launch(launchOptions());
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(HTML).href);
  await page.waitForFunction(() => window.BW && window.BW.S);
  const s = await page.evaluate(() => ({ svc: window.BW.S.svc, services: Object.keys(window.BW.M) }));
  ok('opens on the blank document', s.svc === 'blank', s.services.join(','));
  ok('sample is one click away (service list)', s.services.includes('event-permit'));
  const raw = fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'utf8');
  const doc = JSON.parse(raw);
  doc.service = 'opened-at-runtime';
  const text = JSON.stringify(doc);
  const r = await page.evaluate(async (t) => {
    await window.BW.importFile(new File([t], 'mine.en.json', { type: 'application/json' }));
    const e = window.BW.M['opened-at-runtime']?.en;
    return { svc: window.BW.S.svc, hash: e?.hash, title: document.querySelector('h1')?.textContent || '' };
  }, text);
  const want = `sha256:${(await import('node:crypto')).createHash('sha256').update(text).digest('hex')}`;
  ok('Import opens a document JSON as its own service', r.svc === 'opened-at-runtime' && r.hash === want, r.hash);
  await page.evaluate(() => localStorage.setItem('bw:seen-version', '0.0.1'));
  await page.reload();
  await page.waitForFunction(() => window.BW_UPDATE);
  const wn = await page.evaluate(() => { const c = document.getElementById('bw-update')?.shadowRoot?.querySelector('.card'); return { shown: !!c && !c.hidden, text: c?.textContent || '', seen: localStorage.getItem('bw:seen-version'), v: window.BW_UPDATE.version }; });
  ok("what's new shows once after an update (editor/update.js)", wn.shown && wn.text.includes(wn.v) && wn.seen === wn.v, wn.text.slice(0, 60));
  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(fails ? `FAILED: skill-html ${fails}` : 'ALL PASS: skill-html');
process.exit(fails ? 1 : 0);
