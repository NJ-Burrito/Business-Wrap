// A10 background host (design.md §3 A10): start → /api/version 200; 3 tabs with edits; close all three → the host
// pid is gone within 6 s and 3 flushed files hold the last edit of each; start again → the popup lists 3; resume →
// the server's (stubbed) browser launch carries the 3 URLs on one command line and a reopened tab gets its state;
// 100 URLs → 4 launches of ≤ 30; New work → the run is archived; stop with no tabs → no node process left (sweep).
//
//   node tests/host.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
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
// free ports, not 4371/4391: a fixed port collides with a second copy of this suite (parallel agents/worktrees) and with a live host
const freePort = () => new Promise((res) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const PORT_A = await freePort();
const PORT_B = await freePort();

let failed = 0;
const out = [];
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  host: ${n}${d && !ok ? '  — ' + d : ''}`); if (!ok) failed += 1; };
const sessions = path.join(tmp, 'ws', 'Business-Wrap', '.system', 'sessions');
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
  h = await H.start({ editor, port: PORT_A, open: false });
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
  h = await H.start({ editor, port: PORT_A, open: false });
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
  // review 2 row 9: the tab that asked becomes the first resumed tab (it navigates itself), the server opens the other 2
  await p.waitForURL(/[?&]tab=/, { timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => window.BW?.ready && document.documentElement.dataset.bwResumed === '1', null, { timeout: 10000 }).catch(() => {});
  check('resume → the asking tab becomes tab 1, the server launches the browser once with the other 2 URLs (own --user-data-dir)', launch.length === 1 && urls.length === 2 && /[?&]tab=/.test(p.url()) && urls.every((u) => /[?&]session=.+&tab=/.test(u)) && launch[0].args.some((a) => a.startsWith('--user-data-dir=') && a.includes(path.join(tmp, '.local'))), JSON.stringify({ launch, here: p.url() }));
  const r0 = p;
  const restored = await r0.evaluate(() => JSON.stringify(window.BW.M['event-permit'].ar.doc.chapters.map((c) => c.title)));
  check('a reopened tab loads its own state from the server', /تبويب \d آخر تعديل/.test(restored), restored.slice(0, 200));
  check('the resumed run is archived (not offered again)', fs.existsSync(path.join(sessions, 'archive')) && !runs().includes(run1));
  const many = H.launchBrowser(Array.from({ length: 100 }, (_, i) => `${h.url}?tab=t${i}`));
  const last4 = stubLines().slice(-4).map((l) => l.args.filter((a) => a.startsWith('http')).length);
  check('100 tabs → 4 launches of at most 30 URLs each', many.chunks === 4 && JSON.stringify(last4) === '[30,30,30,10]', JSON.stringify(last4));
  const r1 = await tabPage(ctx, urls[0]);
  const r2 = await tabPage(ctx, urls[1]);
  await new Promise((r) => setTimeout(r, 600));
  for (const x of [r2, r1, r0]) await x.close({ runBeforeUnload: true });
  await ctx.close();
  check('the second run stops too', (await gone(h.pid, 8000)).gone);
  const run2 = runs().sort().at(-1);
  const n2 = run2 ? fs.readdirSync(path.join(sessions, run2)).filter((f) => f.endsWith('.json') && f !== 'run.json').length : -1;
  check('a resumed run of 3 is still 3 tabs at the next shutdown (the asking tab is not an extra one)', n2 === 3, `${run2}: ${n2}`);

  // 3. relaunch → New work → the run is archived
  h = await H.start({ editor, port: PORT_A, open: false });
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

  // 5. review 2 row 9: typing right before the close is kept (a saved document: its entry is far past a beacon's 64 KB),
  //    a tab closed earlier does not come back, and the profile survives a new port and an empty browser profile
  h = await H.start({ editor, port: PORT_A, open: false });
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('bw:profile-prompt', '0'); } catch { /* storage */ } });
  p = await tabPage(ctx, h.url);
  await p.locator('#bw-ui-host >> css=dialog.bw-resume [data-s="new"]').click({ timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => window.BW.EXT.library, null, { timeout: 8000 });
  await p.evaluate(() => { localStorage.setItem('bw:profile', JSON.stringify({ name: 'Mark', at: '2026-10-29T00:00:00Z' })); localStorage.setItem('bw:actor', 'actor-mark-1'); });
  await p.evaluate(() => window.BW.setText('/chapters/1/title', 'ب'.repeat(40000))); // a document past a beacon's 64 KB
  await p.evaluate(() => window.BW.runAction('save'));
  await p.waitForFunction(() => /^doc-/.test(window.BW.S.svc), null, { timeout: 8000 }).catch(() => {});
  const extra = await tabPage(ctx, h.url); // a second tab, closed by the user while the first stays open
  const extraTab = await extra.evaluate(() => document.documentElement.dataset.bwSession);
  await new Promise((r) => setTimeout(r, 700));
  await extra.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 5000)); // past IDLE_MS: a closed tab, not a reload
  const title = p.locator('#bw-pair main.bw-doc[data-locale="ar"] [data-p="/chapters/0/title"]').first();
  await title.scrollIntoViewIfNeeded();
  await title.click();
  await p.keyboard.press('End');
  await p.keyboard.type(' نهاية-كاملة-XYZ');
  const myTab = await p.evaluate(() => document.documentElement.dataset.bwSession);
  const docId = await p.evaluate(() => window.BW.S.svc); // the document typed into (the «عمل جديد» blank may come first)
  const inPage = await p.evaluate(() => { const e = window.BW.M[window.BW.S.svc].ar; return `${window.BW.S.svc} n=${e.ops.length} last=${String(e.ops.at(-1)?.value).slice(0, 40)}`; });
  await p.close({ runBeforeUnload: true }); // at once: no wait after the last key
  await ctx.close();
  const g5 = await gone(h.pid, 12000);
  const run5 = runs().sort().at(-1);
  const rec5 = (() => { try { return JSON.parse(fs.readFileSync(path.join(sessions, run5, `${myTab}.json`), 'utf8')); } catch { return null; } })();
  const ops5 = JSON.stringify(rec5?.entry?.editions?.ar?.ops || []);
  check('text typed just before closing the tab is saved whole (a saved document)', g5.gone && rec5?.entry?.id === docId && ops5.includes('نهاية-كاملة-XYZ'), `${JSON.stringify(g5)} page: ${inPage} | rec: ${rec5?.entry?.id} ${docId} ${ops5.slice(-160)}`);
  const left5 = run5 ? fs.readdirSync(path.join(sessions, run5)).filter((f) => f.endsWith('.json') && f !== 'run.json') : [];
  check('a tab the user closed earlier is not part of the run (only the tabs open at shutdown come back)', left5.length === 1 && !left5.includes(`${extraTab}.json`), left5.join(','));
  const prof = (() => { try { return JSON.parse(fs.readFileSync(path.join(tmp, '.local', 'profile.json'), 'utf8')); } catch { return null; } })();
  h = await H.start({ editor, port: PORT_B, open: false }); // another port = another origin: an empty localStorage
  ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  p = await tabPage(ctx, h.url);
  const seeded = await p.evaluate(() => ({ profile: localStorage.getItem('bw:profile'), actor: localStorage.getItem('bw:actor') }));
  check('the profile is kept with the host and seeds a new origin (no «من أنت؟» again)', /Mark/.test(prof?.profile || '') && /Mark/.test(seeded.profile || '') && seeded.actor === 'actor-mark-1', JSON.stringify({ prof, seeded }));
  await p.close({ runBeforeUnload: true });
  await ctx.close();
  await gone(h.pid, 8000);

  // 4. stop() with no tabs; the sweep finds nothing of ours
  h = await H.start({ editor, port: PORT_A, open: false });
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
