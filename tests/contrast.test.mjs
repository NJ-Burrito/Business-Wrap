// Light-theme contrast (owner, 2026-11-13): every surface, border and text token of the tool's chrome is resolved in the REAL editor (computed custom properties on the shell and on the
// start page's dialog) and the ratios are computed from them here, never typed (rule R16). Non-text (borders, field edges, focus ring) >= 3:1, text >= 4.5:1,
// a card is told from its desk by value (>= 1.1:1) and by a 3:1 border. The dark theme is not touched: its tokens still equal 45-dark-dim.css.
//   node tests/contrast.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-contrast-'));
process.env.BW_LOCAL_DIR ||= path.join(tmp, 'local');
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  contrast: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const lum = ([r, g, b]) => { const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const rgb = (h) => { h = h.trim(); const m = /^#([0-9a-f]{6})$/i.exec(h); if (!m) throw new Error(`not a 6-digit hex: ${h}`); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };

const out = path.join(tmp, 'e.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'blank')], out, set: 'contrast', watermarkDir: null });
const browser = await chromium.launch({ ...launchOptions(), args: [...(launchOptions().args || []), '--bw-session=bw-contrast'] });
try {
  const names = ['bg', 'surface', 'surface-2', 'surface-sunk', 'ink', 'ink-muted', 'ink-faint', 'line', 'rule-strong', 'line-strong', 'primary', 'primary-soft', 'focus', 'signal', 'success', 'accent-strong', 'accent-rule'];
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem('bw:dark', t === 'dark' ? '1' : '0'); localStorage.setItem('bw:ui', 'en'); } catch {} }, theme);
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(out).href);
    await page.waitForFunction(() => window.BW?.ready);
    const T = await page.evaluate((names) => {
      const r = document.getElementById('bw-ui-host').shadowRoot;
      const get = (el) => { const cs = getComputedStyle(el), o = {}; for (const n of names) o[n] = cs.getPropertyValue(`--bw-${n}`).trim(); return o; };
      const d = document.createElement('dialog'); d.dataset.theme = r.querySelector('.shell').dataset.theme; r.appendChild(d);
      const res = { shell: get(r.querySelector('.shell')), dialog: get(d), theme: r.querySelector('.shell').dataset.theme };
      d.remove();
      return res;
    }, names);
    check(`${theme}: the shell is in the ${theme} theme`, T.theme === theme, T.theme);
    if (theme === 'light') {
      for (const [where, k] of [['shell', T.shell], ['start/dialog', T.dialog]]) {
        const c = Object.fromEntries(Object.entries(k).map(([n, v]) => [n, rgb(v)]));
        const R = (a, b) => ratio(c[a], c[b]);
        for (const bgn of ['bg', 'surface']) for (const ln of ['line', 'line-strong']) check(`${where}: border --bw-${ln} on --bw-${bgn} >= 3:1 (${R(ln, bgn).toFixed(2)})`, R(ln, bgn) >= 3);
        check(`${where}: field edge --bw-line-strong on --bw-surface-2 >= 3:1 (${R('line-strong', 'surface-2').toFixed(2)})`, R('line-strong', 'surface-2') >= 3);
        check(`${where}: focus ring on --bw-bg >= 3:1 (${R('focus', 'bg').toFixed(2)})`, R('focus', 'bg') >= 3);
        for (const tn of ['ink', 'ink-muted', 'ink-faint', 'primary']) for (const bgn of ['bg', 'surface', 'surface-2', 'surface-sunk']) check(`${where}: text --bw-${tn} on --bw-${bgn} >= 4.5:1 (${R(tn, bgn).toFixed(2)})`, R(tn, bgn) >= 4.5);
        for (const tn of ['signal', 'success', 'accent-strong']) check(`${where}: text --bw-${tn} on --bw-surface >= 4.5:1 (${R(tn, 'surface').toFixed(2)})`, R(tn, 'surface') >= 4.5);
        check(`${where}: a white card is told from its desk by value (>= 1.1:1, ${R('surface', 'bg').toFixed(2)})`, R('surface', 'bg') >= 1.1);
        check(`${where}: the selected wash (--bw-primary-soft) carries --bw-primary text (${R('primary', 'primary-soft').toFixed(2)})`, R('primary', 'primary-soft') >= 4.5);
      }
    } else {
      // the dark theme is unchanged: its tokens are the ones 45-dark-dim.css declares
      const css = fs.readFileSync(path.join(REPO, 'editor', 'ext', '45-dark-dim.css'), 'utf8');
      const block = /\[data-theme="dark"\] \{([^}]*)\}/.exec(css)[1];
      const want = (n) => new RegExp(`--bw-${n}:\s*([^;]+);`).exec(block)?.[1].trim();
      for (const n of ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'ink-faint']) check(`dark unchanged: --bw-${n} = ${want(n)}`, T.shell[n].toLowerCase() === want(n).toLowerCase(), `${T.shell[n]} vs ${want(n)}`);
    }
    await ctx.close();
  }
} finally { await browser.close(); }
if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\ncontrast: all passed');
