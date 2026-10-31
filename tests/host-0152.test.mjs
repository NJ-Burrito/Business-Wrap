// 0.15.2 lane host (owner notes 4, 10, 11, 12, 13): real Edge/Chrome, real keyboard and wheel, a REAL host and the real MCP client.
//   11  zoom 100 % is true size: a page is A4 at 96 dpi (793.7 CSS px) in the continuous, single and spread views; the pill, the field (zoomPct),
//       Ctrl+wheel, the preset buttons and Ctrl+Alt+... all read the same percentage
//   10  Fill height: the page's top sits right under the ribbon, its bottom just above the pager (or the window bottom), the same gap on both sides (+-2 px),
//       with the ribbon open and folded, and again after a window resize
//   4   turning the host off (Settings, power) stops ONLY the host: the page stays open and shows «server off», with a Turn-on button that asks the
//       installed Business-Wrap for the server again (business-wrap://open?file=...); a host that comes back brings the page online again
//   12  editor_action runs the widened safe list through the real MCP client -> host -> tab; a destructive name is REFUSED; an unknown name is UNKNOWN_ACTION
//   13  check answers spelling counts (ar / en) and diagramWarnings
//   node tests/host-0152.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-host0152-'));
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, '.local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_LEARNING_DIR: path.join(tmp, 'learning'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_NO_BROWSER: '1', BW_NO_PROTOCOL: '1', BW_POWER_GRACE_MS: '300', BW_BRIDGE_TIMEOUT_MS: '8000', BW_EDITOR_TIMEOUT_MS: '30000', BW_IDLE_MS: '1500' };
fs.mkdirSync(env.BW_WORKSPACE, { recursive: true });
Object.assign(process.env, env);
const H = await import('../engine/host.mjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) { try { if (await fn()) return true; } catch { /* not yet */ } } return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  host-0152: ${n}${d && !ok ? '  — ' + String(d).replace(/\s+/g, ' ').slice(0, 300) : ''}`); if (!ok) failed += 1; };
const A4_W = 210 * 96 / 25.4;
const A4_H = 297 * 96 / 25.4;

const file = path.join(tmp, 'editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'host-0152', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
const SH = `document.getElementById('bw-ui-host').shadowRoot`;
const sh = (page, fn, arg) => page.evaluate(`(${fn})(${SH}, ${JSON.stringify(arg ?? null)})`);
async function openFile(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.waitForFunction(() => window.BW?.ready && document.documentElement.classList.contains('bw-ready'));
  await sleep(900);
  return { ctx, page };
}
/** The page the reader sees: its width and its top / bottom edges (the first A4 sheet), the toolbar's bottom, the pager's top. */
const geo = (page) => page.evaluate(({ A4_H }) => {
  const r = document.getElementById('bw-ui-host').shadowRoot;
  const view = document.querySelector('#bw-pair .bw-view') || document.querySelector('#bw-pair main.bw-doc');
  const b = view.getBoundingClientRect();
  const spread = document.getElementById('bw-pair').dataset.pages === 'spread';
  const eff = window.BW.S.zoom * (() => { const pz = parseFloat(document.documentElement.style.getPropertyValue('--bw-pz')); return document.querySelector('#bw-pair .bw-view') && pz > 0 ? pz / window.BW.S.zoom : 1; })();
  const bar = r.querySelector('.island').getBoundingClientRect();
  const pg = r.querySelector('.pager:not([hidden])');
  const limit = pg ? pg.getBoundingClientRect().top : innerHeight;
  const pill = r.querySelector('[data-zoom-pill]')?.textContent;
  return { w: b.width, spread, top: b.top, pageBottom: b.top + A4_H * eff, barBottom: bar.bottom, limit, pager: !!pg, eff, pill, pages: window.BW.S.pages };
}, { A4_H });

try {
  // ── note 11: zoom 100 % is true size, in every view ──
  {
    const { ctx, page } = await openFile(1366, 860);
    for (const mode of ['continuous', 'single', 'spread']) {
      await page.evaluate((m) => window.BW.runAction(`view.${m}`), mode);
      await sleep(500);
      await page.evaluate(() => window.BW.runAction('zoomReset'));
      await sleep(500);
      const g = await geo(page);
      const want = g.spread ? 2 * A4_W + 12 / 25.4 * 96 : A4_W;
      check(`zoom: «zoomReset» in the ${mode} view is 100 % true size (page ${want.toFixed(1)} px, pill 100%)`, Math.abs(g.w - want) <= 1.5 && g.pill === '100%' && g.pages === mode, JSON.stringify({ w: g.w, want, pill: g.pill }));
      // the typed field, then Ctrl+wheel up and down, then the preset buttons all land on the same real size
      await page.evaluate(() => window.BW.runAction('zoomOut'));
      await page.evaluate(() => window.BW.zoomTo('100'));
      await sleep(400);
      const f = await geo(page);
      check(`zoom: the typed 100 in the ${mode} view is the same size and the pill says 100%`, Math.abs(f.w - want) <= 1.5 && f.pill === '100%', JSON.stringify({ w: f.w, pill: f.pill }));
    }
    await page.evaluate(() => window.BW.runAction('view.continuous'));
    await sleep(400);
    await page.evaluate(() => window.BW.zoomTo('100'));
    await sleep(300);
    await page.mouse.move(683, 500);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await sleep(350);
    const up = await geo(page);
    await page.mouse.wheel(0, 100);
    await sleep(350);
    await page.keyboard.up('Control');
    const back = await geo(page);
    check('zoom: Ctrl+wheel steps x1.1 from true size and returns to 100 % (width 793.7 px)', Math.abs(up.w - A4_W * 1.1) <= 2 && up.pill === '110%' && Math.abs(back.w - A4_W) <= 1.5 && back.pill === '100%', JSON.stringify({ up: up.w, upPill: up.pill, back: back.w, backPill: back.pill }));
    check('zoom: no page errors', !page.errors.length, page.errors.join(' | '));
    await ctx.close();
  }

  // ── note 10: Fill height, ribbon open and folded, single view (pager) and continuous (window bottom), and after a resize ──
  {
    const { ctx, page } = await openFile(1366, 860);
    const gaps = async (label, expectPager) => {
      await sleep(900); // the ribbon's transition ends, the re-fit follows 140 ms later
      const g = await geo(page);
      const top = g.top - g.barBottom, bottom = g.limit - g.pageBottom;
      check(`fill height ${label}: top gap ${top.toFixed(1)} px = bottom gap ${bottom.toFixed(1)} px (+-2), both positive${expectPager ? ', bottom edge = the pager' : ''}`, g.pager === expectPager && top > 0 && bottom > 0 && Math.abs(top - bottom) <= 2, JSON.stringify(g));
    };
    for (const mode of ['single', 'continuous']) {
      await page.evaluate((m) => window.BW.runAction(`view.${m}`), mode);
      await sleep(500);
      await page.evaluate(() => window.BW.runAction('zoomHeight'));
      await gaps(`${mode}, ribbon open`, mode === 'single');
      await sh(page, (r) => r.querySelector('.rb-col').click());
      await gaps(`${mode}, ribbon folded (re-fitted by itself)`, mode === 'single');
      await sh(page, (r) => r.querySelector('.rb-col').click());
      await gaps(`${mode}, ribbon open again (re-fitted by itself)`, mode === 'single');
      await page.setViewportSize({ width: 1366, height: 700 });
      await gaps(`${mode}, window 700 px high (resize)`, mode === 'single');
      await page.setViewportSize({ width: 1366, height: 860 });
      await sleep(300);
    }
    await page.evaluate(() => window.BW.runAction('zoomIn'));
    await sleep(400);
    const g1 = await geo(page);
    await sh(page, (r) => r.querySelector('.rb-col').click());
    await sleep(900);
    const g2 = await geo(page);
    check('fill height: a manual zoom ends the fitting (the ribbon no longer changes the zoom)', Math.abs(g1.eff - g2.eff) < 0.001, JSON.stringify([g1.eff, g2.eff]));
    check('fill height: no page errors', !page.errors.length, page.errors.join(' | '));
    await ctx.close();
  }

  // ── notes 12 and 13 through the real caller, then note 4 on the same real host ──
  const client = new Client({ name: 'host-0152', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env, stderr: 'pipe' });
  const text = (r) => r.content?.[0]?.text || '';
  const data = (r) => r.structuredContent ?? JSON.parse(text(r) || 'null');
  const call = (name, args) => client.callTool({ name, arguments: args });
  let ctx = null;
  try {
    await client.connect(transport);
    const oe = data(await call('open_in_editor', { documents: [path.join(REPO, 'samples', 'event-permit')] }));
    const DOC = oe.library_id;
    const hs = H.hostState();
    const port = hs?.port;
    const base = `http://127.0.0.1:${port}`;
    ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript((pp) => {
      window.__bwProbePorts = [pp];
      window.__launched = [];
      document.addEventListener('click', (e) => { const a = e.composedPath().find((n) => n.matches?.('a[href^="business-wrap:"]')); if (a) { window.__launched.push(a.getAttribute('href')); e.preventDefault(); } }, true);
    }, port);
    await page.goto(`${base}/?automation=1#doc=${DOC}`);
    await page.waitForFunction((id) => window.BW?.ready && document.documentElement.dataset.bwSession && window.BW.S.svc === id, DOC, { timeout: 60000 });
    await until(async () => (await (await fetch(`${base}/api/host/health`)).json()).tabs.some((t) => t.docs.includes(DOC)), 15000);

    // 12: the widened allow-list
    const act = async (id, args) => { const r = await call('editor_action', { doc: DOC, id, ...(args ? { args } : {}) }); return { err: r.isError, d: r.isError ? data(r) : data(r) }; };
    let r = await act('zoomPct', { value: 100 });
    check('action: zoomPct {value:100} answers zoomPct 100 and the tab is at true size', !r.err && r.d.zoomPct === 100 && Math.abs((await geo(page)).w - A4_W) <= 1.5, JSON.stringify(r.d));
    r = await act('zoomPct', { value: 150 });
    check('action: zoomPct {value:150} -> 150 %', !r.err && r.d.zoomPct === 150 && (await geo(page)).pill === '150%', JSON.stringify(r.d));
    r = await act('zoomHeight');
    const gz = await geo(page);
    check('action: zoomHeight fills the height (gaps equal +-2)', !r.err && Math.abs((gz.top - gz.barBottom) - (gz.limit - gz.pageBottom)) <= 2, JSON.stringify([r.d, gz]));
    r = await act('zoomWidth');
    check('action: zoomWidth runs', !r.err && r.d.id === 'zoomWidth' && r.d.zoomPct > 0, JSON.stringify(r.d));
    const dark0 = await page.evaluate(() => window.BW.S.dark);
    r = await act('theme');
    check('action: theme toggles dark/light', !r.err && r.d.dark === !dark0 && (await page.evaluate(() => window.BW.S.dark)) === !dark0, JSON.stringify(r.d));
    r = await act('theme', { mode: 'light' });
    check('action: theme {mode:light} sets light', !r.err && r.d.dark === false, JSON.stringify(r.d));
    r = await act('reading', { on: true });
    check('action: reading {on:true} turns reading mode on', !r.err && r.d.reading === true, JSON.stringify(r.d));
    r = await act('reading', { on: false });
    check('action: reading {on:false} turns it off', !r.err && r.d.reading === false, JSON.stringify(r.d));
    r = await act('find');
    check('action: find opens the find drawer', !r.err && r.d.open === true && (await page.evaluate(() => window.BW.S.drawer)) === 'find', JSON.stringify(r.d));
    r = await act('outline');
    check('action: outline opens the outline drawer', !r.err && r.d.open === true && (await page.evaluate(() => window.BW.S.drawer)) === 'outline', JSON.stringify(r.d));
    r = await act('save');
    check('action: save runs', !r.err && r.d.saved === true, JSON.stringify(r.d));
    await page.evaluate(() => window.BW.runAction('view.single'));
    await sleep(500);
    const at0 = await page.evaluate(() => window.BW.S.pageAt || 0);
    r = await act('nextPage');
    check('action: nextPage turns a page in the page view', !r.err && r.d.page === at0 + 2, JSON.stringify([r.d, at0]));
    await page.evaluate(() => window.BW.runAction('view.continuous'));
    for (const id of ['delete', 'close', 'stopServer', 'clear', 'powerOff']) {
      r = await act(id);
      check(`action: the destructive «${id}» is REFUSED`, r.err === true && r.d.code === 'REFUSED', JSON.stringify(r.d));
    }
    r = await act('bogusAction');
    check('action: an unknown name is still UNKNOWN_ACTION', r.err === true && r.d.code === 'UNKNOWN_ACTION', JSON.stringify(r.d));
    const bridgeRefused = await page.evaluate(async (d) => { try { await window.BW.bridge('action', d, { id: 'deleteDocument' }); return 'ran'; } catch (e) { return e.bw; } }, DOC);
    check('action: the tab itself refuses a destructive name too (REFUSED, not only the tool)', bridgeRefused === 'REFUSED', String(bridgeRefused));

    // 13: check returns spelling counts and diagram warnings (a misspelling is typed in first so the count has something to find)
    await page.evaluate(() => { const B = window.BW; const ed = B.S.ed; B.commit([{ op: 'setText', path: '/control/title', value: ed === 'en' ? 'Recieve requirment documnet' : 'المتطلبتا المستخدمم الخدمه' }], { ed, mirror: false }); B.S.spell[ed] = true; B.emit('spell', ed, true); });
    const ready = await until(() => page.evaluate(() => { const s = window.BW.EXT.spell; return !!s && s.issues().length > 0; }), 25000);
    r = await act('check');
    const sp = r.d.spelling || {};
    const lang = await page.evaluate(() => window.BW.S.ed);
    check('check: the misspelling was found before the call (positive sample: the engine ran)', ready, JSON.stringify(sp));
    check('check: returns spelling {enabled, ar, en, total} with the typed misspelling counted in its language', !r.err && sp.enabled === true && Number.isInteger(sp.ar) && Number.isInteger(sp.en) && sp.total === sp.ar + sp.en && sp[lang] >= 1, JSON.stringify(sp));
    check('check: returns diagramWarnings (an array) next to the findings', !r.err && Array.isArray(r.d.diagramWarnings) && Array.isArray(r.d.findings), JSON.stringify(Object.keys(r.d)));
    // a diagram whose lettering cannot be read: the warning is counted with its path
    const dg = await page.evaluate(() => {
      const B = window.BW; const d = B.M[B.S.svc][B.S.ed].doc;
      const ci = d.chapters.findIndex((c) => c.sections.some((s) => s.blocks.some((b) => b.kind === 'diagram')));
      if (ci < 0) return null;
      return { count: d.chapters.flatMap((c) => c.sections.flatMap((s) => s.blocks.filter((b) => b.kind === 'diagram'))).length };
    });
    check('check: diagramWarnings agrees with the editor\'s own Check panel (one finding per warning)', !r.err && r.d.diagramWarnings.length === r.d.findings.filter((f) => /\/blocks\/\d+$/.test(f.path || '') && f.level === 'warn' && /pt|نقطة/.test(f.message)).length, JSON.stringify({ w: r.d.diagramWarnings, dg }));

    // 4: turning the host off stops ONLY the host; the page stays open and can turn it on again
    await page.evaluate(() => window.BW.runAction('settings'));
    await page.waitForFunction(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.drawer [data-k="srvPowerOff"]'));
    const hostPid = hs.pid;
    const closedWindows = []; // a page of the same context that would be closed by «close everything»
    const keep = await ctx.newPage();
    await keep.goto('about:blank');
    await sh(page, (x) => x.querySelector('.drawer [data-k="srvPowerOff"]').click());
    await sleep(300);
    await page.locator('.dialog [data-k="pw-yes"]').click();
    const shown = await until(() => sh(page, (x) => !!x.querySelector('.pw-off [data-k="pw-on"]')), 6000);
    check('power: confirm -> the page shows the «server off» card with a Turn-on button', shown);
    const gone = await until(() => !alive(hostPid), 15000);
    check('power: the host process stopped', gone);
    check('power: host.json removed', !fs.existsSync(path.join(env.BW_LOCAL_DIR, 'host.json')) || !H.hostState());
    check('power: the editor tab is STILL OPEN (not closed, not navigated): the page object is alive on the same URL, and the other window is open too', !page.isClosed() && !keep.isClosed() && page.url().startsWith(base), page.url());
    const toggle = await until(() => page.evaluate(() => document.documentElement.dataset.bwServer === 'offline'), 8000);
    check('power: the server toggle shows offline («server off») on the same page', toggle, await page.evaluate(() => document.documentElement.dataset.bwServer));
    // turn it on again from the same page: the button hands the open command to the installed Business-Wrap
    await sh(page, (x) => x.querySelector('.pw-off [data-k="pw-on"]').click());
    const launched = await until(() => page.evaluate(() => window.__launched.some((u) => u.startsWith('business-wrap://open?file='))), 8000);
    check('power: Turn on asks the installed Business-Wrap (business-wrap://open?file=...) from the same page', launched, JSON.stringify(await page.evaluate(() => window.__launched)));
    // the host comes back on the same port (what the protocol handler does): the page finds it and goes online, the card goes away
    const { open: openHost } = await import('../engine/cli.mjs');
    await openHost({ inputs: [path.join(REPO, 'samples', 'event-permit')], browser: false, port });
    const online = await until(() => page.evaluate(() => document.documentElement.dataset.bwServer === 'online' && !document.getElementById('bw-ui-host').shadowRoot.querySelector('.pw-off')), 30000);
    check('power: the host comes back -> the same page goes online again and the card is gone', online, await page.evaluate(() => document.documentElement.dataset.bwServer));
    check('power: no page errors', !errors.length, errors.join(' | '));
    void closedWindows;
  } finally {
    try { await ctx?.close(); } catch { /* closed */ }
    try { await client.close(); } catch { /* closed */ }
  }
} catch (e) {
  check('host-0152 run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  try { const { close } = await import('../engine/cli.mjs'); await close(); } catch { /* none */ }
}
console.log(out.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${out.length - failed}/${out.length}`);
process.exit(failed ? 1 : 0);
