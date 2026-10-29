// A10 background host (design.md §3 A10): start → /api/version 200; 3 tabs with edits; close all three → the host
// pid is gone within 6 s and 3 flushed files hold the last edit of each; start again → the popup lists 3; resume →
// the server's (stubbed) browser launch carries the 3 URLs on one command line and a reopened tab gets its state;
// 100 URLs → 4 launches of ≤ 30; New work → the run is archived; stop with no tabs → no node process left (sweep).
//
//   node tests/host.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-host-'));
process.env.BW_LOCAL_DIR = path.join(tmp, '.local');
process.env.BW_WORKSPACE = path.join(tmp, 'ws');
process.env.BW_BROWSER_STUB = path.join(tmp, 'browser.log');
fs.mkdirSync(process.env.BW_WORKSPACE);
const H = await import('../engine/host.mjs');

let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  host: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };
const sessions = path.join(tmp, 'ws', 'Business-Wrap', 'HISTORY', 'sessions');
const runs = () => (fs.existsSync(sessions) ? fs.readdirSync(sessions).filter((d) => d !== 'archive') : []);
const gone = async (pid, ms) => { const t0 = Date.now(); while (H.alive(pid) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100)); return { gone: !H.alive(pid), ms: Date.now() - t0 }; };
const stubLines = () => (fs.existsSync(process.env.BW_BROWSER_STUB) ? fs.readFileSync(process.env.BW_BROWSER_STUB, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const editor = path.join(tmp, 'host.editor.html');
buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: editor, set: 'host-test', watermarkDir: null });
const browser = await chromium.launch(launchOptions());
const tabPage = async (ctx, url) => {
  const p = await ctx.newPage();
  await p.goto(url);
  await p.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwSession, null, { timeout: 15000 });
  return p;
};
let h = null;
try {
  // 1. start, three tabs with an edit each, close all three
  h = await H.start({ editor, port: 4371, open: false });
  const v = await fetch(h.url + 'api/version');
  check('start → the detached server answers /api/version', v.status === 200 && H.status().running && H.status().pid === h.pid, String(v.status));
  let ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pages = [];
  for (let i = 0; i < 3; i++) pages.push(await tabPage(ctx, h.url));
  await new Promise((r) => setTimeout(r, 300));
  check('three live tabs counted in host.json', H.status().tabs === 3, JSON.stringify(H.status()));
  for (let i = 0; i < 3; i++) await pages[i].evaluate((i) => window.BW.setText(`/chapters/${i}/title`, `تبويب ${i} آخر تعديل`), i);
  for (const p of pages) await p.close({ runBeforeUnload: true });
  await ctx.close();
  const g1 = await gone(h.pid, 8000);
  check('closing the last tab stops the host within 6 s (no process left)', g1.gone && g1.ms <= 6000, JSON.stringify(g1));
  const run1 = runs()[0];
  const files = run1 ? fs.readdirSync(path.join(sessions, run1)).filter((f) => f !== 'run.json') : [];
  const texts = files.map((f) => fs.readFileSync(path.join(sessions, run1, f), 'utf8'));
  check('3 flushed tab files, each with its last edit', files.length === 3 && [0, 1, 2].every((i) => texts.some((s) => s.includes(`تبويب ${i} آخر تعديل`))) && fs.existsSync(path.join(sessions, run1, 'run.json')), `${files.length} files; ${texts.map((s) => s.slice(0, 120)).join(' | ')}`);

  // 2. relaunch → the popup lists 3 → resume: one command line with the 3 URLs
  h = await H.start({ editor, port: 4371, open: false });
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  let p = await tabPage(ctx, h.url);
  await p.waitForFunction(() => document.documentElement.dataset.bwResume === 'asked', null, { timeout: 8000 }).catch(() => {});
  const listed = await p.locator('#bw-ui-host >> css=dialog.bw-resume li').count();
  check('relaunch → the popup offers resume of 3 tabs and new work', listed === 3 && (await p.locator('#bw-ui-host >> css=dialog.bw-resume [data-s="new"]').count()) === 1, String(listed));
  const before = stubLines().length;
  await p.locator('#bw-ui-host >> css=dialog.bw-resume [data-s="resume"]').click();
  await p.waitForFunction(() => document.documentElement.dataset.bwResume === 'resumed', null, { timeout: 8000 }).catch(() => {});
  const launch = stubLines().slice(before);
  const urls = launch[0]?.args.filter((a) => a.startsWith('http')) || [];
  check('resume → the server launches the browser once with all 3 URLs (own --user-data-dir)', launch.length === 1 && urls.length === 3 && urls.every((u) => /[?&]session=.+&tab=/.test(u)) && launch[0].args.some((a) => a.startsWith('--user-data-dir=') && a.includes(path.join(tmp, '.local'))), JSON.stringify(launch));
  const r0 = await tabPage(ctx, urls[0]);
  await r0.waitForFunction(() => document.documentElement.dataset.bwResumed === '1', null, { timeout: 8000 }).catch(() => {});
  const restored = await r0.evaluate(() => JSON.stringify(window.BW.M['event-permit'].ar.doc.chapters.map((c) => c.title)));
  check('a reopened tab loads its own state from the server', /تبويب \d آخر تعديل/.test(restored), restored.slice(0, 200));
  check('the resumed run is archived (not offered again)', fs.existsSync(path.join(sessions, 'archive')) && !runs().includes(run1));
  const many = H.launchBrowser(Array.from({ length: 100 }, (_, i) => `${h.url}?tab=t${i}`));
  const last4 = stubLines().slice(-4).map((l) => l.args.filter((a) => a.startsWith('http')).length);
  check('100 tabs → 4 launches of at most 30 URLs each', many.chunks === 4 && JSON.stringify(last4) === '[30,30,30,10]', JSON.stringify(last4));
  await r0.close({ runBeforeUnload: true });
  await p.close({ runBeforeUnload: true });
  await ctx.close();
  check('the second run stops too', (await gone(h.pid, 8000)).gone);

  // 3. relaunch → New work → the run is archived
  h = await H.start({ editor, port: 4371, open: false });
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  p = await tabPage(ctx, h.url);
  await p.waitForFunction(() => document.documentElement.dataset.bwResume === 'asked', null, { timeout: 8000 }).catch(() => {});
  const offered = (await (await fetch(h.url + 'api/session/last')).json()).runId;
  await p.locator('#bw-ui-host >> css=dialog.bw-resume [data-s="new"]').click();
  await p.waitForFunction(() => document.documentElement.dataset.bwResume === 'new', null, { timeout: 8000 }).catch(() => {});
  const archived = fs.existsSync(path.join(sessions, 'archive')) && fs.readdirSync(path.join(sessions, 'archive')).some((d) => fs.existsSync(path.join(sessions, 'archive', d, offered || 'x')));
  check('New work → archive\\ holds the run', !!offered && archived, String(offered));
  await p.close({ runBeforeUnload: true });
  await ctx.close();
  await gone(h.pid, 8000);

  // 4. stop() with no tabs; the sweep finds nothing of ours
  h = await H.start({ editor, port: 4371, open: false });
  const st = await H.stop();
  const g4 = await gone(h.pid, 3000);
  check('stop() with no tabs stops the host', st.stopped && g4.gone && !H.status().running, JSON.stringify(st));
} finally {
  await browser.close();
  if (h && H.alive(h.pid)) await H.stop();
}
// sweep: no node or Edge process of this test (their command lines name the temp folder)
let left = [];
if (process.platform === 'win32') {
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${tmp.replace(/'/g, "''")}') -and -not $_.CommandLine.Contains('Get-CimInstance') -and $_.ProcessId -ne ${process.pid} } | ForEach-Object { "$($_.ProcessId) $($_.Name)" }`;
  left = String(spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true }).stdout || '').trim().split(/\r?\n/).filter(Boolean);
}
check('sweep: no node or Edge process of this test is left', left.length === 0, left.join(', '));

console.log(out.join('\n'));
console.log(failed ? `\nFAILED: ${failed}` : `\nhost: ${out.length}/${out.length} PASS`);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
process.exit(failed ? 1 : 0);
