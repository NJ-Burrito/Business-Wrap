// A8: the output preview as evidence. Opens the page that shows the service's output (a permit, a certificate),
// masks its data in the DOM, checks nothing value-like is left legible in the frame, and takes ONE viewport
// screenshot (never full page). Beside the PNG it writes `<name>.mask.json`, the record the `output-image`
// healer reads before it lets `masked: true` print.
//
//   captureOutput({ url, out, mask?, target?, viewport? }, { browser? }) → { preview, masked: true, maskFile }
//
// Masked: every element `mask` names, and every visible text leaf that reads like a value (a run of 3+ digits,
// an e-mail, a date). Labels stay legible. Refuses (throws, writes no PNG) when a value-like leaf is still
// uncovered after masking — a script cannot judge a name or an address, so `mask` must name those.
import fs from 'node:fs';
import path from 'node:path';
import { launchOptions, loadPlaywright } from '../export.mjs';

export const VALUE_LIKE = /\d{3,}|[^\s@]+@[^\s@]+\.[a-z]{2,}|\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}/i;

export async function captureOutput({ url, out, mask = [], target, viewport = { width: 1366, height: 900 } }, { browser: shared } = {}) {
  if (!url || !out) throw new Error('captureOutput needs url and out');
  const { chromium } = await loadPlaywright();
  const browser = shared || (await chromium.launch({ ...launchOptions(), headless: true }));
  const ctx = await browser.newContext({ viewport });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    if (target) {
      const t = page.locator(target).first();
      await t.scrollIntoViewIfNeeded();
      const inView = await t.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
      if (!inView) throw new Error(`the output (${target}) does not fit inside the viewport`);
    }
    const rec = await page.evaluate(({ mask, src }) => {
      const RE = new RegExp(src, 'i');
      const shown = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      const leaves = [...document.body.querySelectorAll('*')].filter((e) => ![...e.children].some((c) => c.innerText?.trim()) && (e.innerText || '').trim() && !['SCRIPT', 'STYLE'].includes(e.tagName));
      const targets = new Set([...mask.flatMap((s) => [...document.querySelectorAll(s)]), ...leaves.filter((e) => RE.test(e.innerText))]);
      const boxes = [];
      for (const e of targets) {
        const r = e.getBoundingClientRect();
        if (!shown(r)) continue;
        const d = document.createElement('div');
        d.dataset.bwMask = '1';
        Object.assign(d.style, { position: 'fixed', left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px`, background: '#3a3a3a', zIndex: 99999 });
        document.body.appendChild(d);
        boxes.push([Math.round(r.left - 2), Math.round(r.top - 2), Math.round(r.width + 4), Math.round(r.height + 4)]);
      }
      // the self-check: a value-like leaf in the frame whose centre no mask box covers is a leak
      const covered = (r) => boxes.some(([x, y, w, h]) => r.left + r.width / 2 >= x && r.left + r.width / 2 <= x + w && r.top + r.height / 2 >= y && r.top + r.height / 2 <= y + h);
      const leaks = leaves.filter((e) => RE.test(e.innerText)).map((e) => e.getBoundingClientRect()).filter((r) => shown(r) && !covered(r)).length;
      return { boxes, leaks };
    }, { mask, src: VALUE_LIKE.source });
    if (rec.leaks) throw new Error(`${rec.leaks} value-like text(s) still legible after masking: refused`);
    if (!rec.boxes.length) throw new Error('nothing was masked: an output with no data is not evidence, name its fields in `mask`');
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    const preview = path.resolve(out);
    await page.screenshot({ path: preview, fullPage: false });
    const maskFile = preview.replace(/\.png$/i, '') + '.mask.json';
    fs.writeFileSync(maskFile, JSON.stringify({ kind: 'bw-output-mask', version: 1, viewport, selectors: mask, boxes: rec.boxes, leaks: 0 }, null, 1));
    return { preview, masked: true, maskFile };
  } finally {
    await ctx.close();
    if (!shared) await browser.close();
  }
}

/** The mask record beside a preview, or null. */
export function maskRecord(preview) {
  try { return JSON.parse(fs.readFileSync(String(preview).replace(/\.png$/i, '') + '.mask.json', 'utf8')); } catch { return null; }
}
