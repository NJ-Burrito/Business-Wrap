// Accessibility check: axe-core on the editor (UI in Arabic and in English, every
// panel open in turn) + a keyboard-only pass. Serious/critical axe issues fail.
//
//   node tests/a11y.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');
const OUT = path.join(REPO, 'out', 'a11y');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, watermarkDir: path.join(REPO, 'editor', 'brand', 'watermark') }); // the avatar is part of the UI under test

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failed += 1;
};

const browser = await chromium.launch(launchOptions());
const report = [];
try {
  for (const ui of ['ar', 'en']) {
    // bypassCSP only so axe itself can be injected; the page's own CSP is tested elsewhere
    const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1366, height: 900 } });
    await ctx.addInitScript((ui) => { try { localStorage.setItem('bw:ui', ui); } catch {} }, ui);
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW);
    await page.addScriptTag({ path: AXE });
    const states = ['toolbar', 'check', 'history', 'theme', 'find', 'outline', 'webhooks', 'view', 'selection', 'palette'];
    for (const st of states) {
      if (st === 'selection') await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/1/rows/0/1"]').click();
      else if (st === 'palette') await page.keyboard.press('Control+K');
      else if (st !== 'toolbar') {
        const b = page.locator(`.island button[data-a="${st}"]`);
        if (await b.count()) await b.click();
        else { await page.keyboard.press('Control+K'); await page.locator(`#cmdlist [data-cmd="${st}"]`).click(); }
      }
      await page.waitForTimeout(650); // let open/close motion settle: axe measures colours mid-fade otherwise
      const v = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] });
        return r.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, target: x.nodes[0]?.target?.join(' ') }));
      });
      report.push({ ui, state: st, violations: v });
      const bad = v.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      check(`axe ${ui} UI, ${st}: no serious/critical`, bad.length === 0, bad.map((x) => `${x.id}×${x.n} @${x.target}`).join(' | '));
      if (st !== 'toolbar') await page.keyboard.press('Escape');
      if (st === 'view') await page.locator('.island button[data-a="view"]').click();
    }

    // keyboard only: Tab reaches the toolbar and a document field, Enter-less edit, move, undo
    await page.reload();
    await page.waitForFunction(() => window.BW);
    const seen = new Set();
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab');
      seen.add(await page.evaluate(() => {
        const a = document.activeElement;
        if (a?.id === 'bw-ui-host') return 'ui:' + (a.shadowRoot.activeElement?.dataset?.a || a.shadowRoot.activeElement?.tagName);
        return a?.dataset?.p ? 'doc-field' : a?.tagName;
      }));
    }
    check(`keyboard ${ui}: Tab reaches toolbar buttons and document fields`, [...seen].some((x) => x.startsWith('ui:')) && seen.has('doc-field'), [...seen].slice(0, 8).join(', '));
    await page.locator('main.bw-doc [data-p="/chapters/0/sections/0/blocks/0/paragraphs/0"]').focus();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('KB');
    await page.keyboard.press('Escape');
    await page.locator('main.bw-doc [data-p="/chapters/1/sections/0/blocks/0/paragraphs/0"]').focus();
    await page.keyboard.press('Alt+ArrowDown');
    const kb = await page.evaluate(() => { const e = window.BW.M['event-permit'][window.BW.S.ed]; return { p: e.doc.chapters[0].sections[0].blocks[0].paragraphs[0], kinds: e.doc.chapters[1].sections[0].blocks.map((b) => b.kind) }; });
    check(`keyboard ${ui}: edit text and move a block without a mouse`, kb.p === 'KB' && kb.kinds[0] === 'table', JSON.stringify(kb));
    await page.keyboard.press('Control+Z');
    const undone = await page.evaluate(() => window.BW.M['event-permit'][window.BW.S.ed].doc.chapters[1].sections[0].blocks[0].kind);
    check(`keyboard ${ui}: Ctrl+Z undoes the move`, undone === 'prose', undone);
    await ctx.close();
  }
} catch (e) {
  check('a11y run', false, e.stack?.split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, 'axe-report.json'), JSON.stringify(report, null, 1));
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
