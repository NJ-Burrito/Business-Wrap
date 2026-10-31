// H2 (0.13.1, owner 2026-10-29): the editor's host starts in the background with no window, and the power button /
// `stop --all` turns off everything this install started (never another install's process).
//
//   node tests/power.test.mjs
// Own state folders and free ports (BW_LOCAL_DIR, BW_STATE_DIR, BW_WORKSPACE): never the hosts on 4317/4327.
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { launchOptions, REPO } from '../engine/export.mjs';
import { ownsServe } from '../engine/cli.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-power-'));
const env = { ...process.env, BW_LOCAL_DIR: path.join(tmp, 'local'), BW_STATE_DIR: path.join(tmp, 'state'), BW_WORKSPACE: path.join(tmp, 'ws'), BW_POWER_GRACE_MS: '300', BW_NO_BROWSER: '1' };
const CLI = path.join(REPO, 'engine', 'cli.mjs');
const cli = (...a) => { const r = spawnSync(process.execPath, [CLI, ...a, '--json'], { env, encoding: 'utf8', timeout: 90000, windowsHide: true }); try { return JSON.parse(r.stdout); } catch { return { error: (r.stdout + r.stderr).slice(0, 400) }; } };
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await fn()) return true; return false; };
const free = () => new Promise((ok) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const up = async (url) => { try { return (await fetch(new URL('api/version', url), { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
const hostJson = () => { try { return JSON.parse(fs.readFileSync(path.join(env.BW_LOCAL_DIR, 'host.json'), 'utf8')); } catch { return null; } };
/** Windows: pid → name and whether it owns a visible top-level window, for a process and all its descendants. */
function tree(root) {
  const ps = `Add-Type 'using System;using System.Runtime.InteropServices;using System.Collections.Generic;public class W{public delegate bool P(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern bool EnumWindows(P f,IntPtr l);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);public static List<uint> V(){var r=new List<uint>();EnumWindows((h,l)=>{if(IsWindowVisible(h)){uint p;GetWindowThreadProcessId(h,out p);r.Add(p);}return true;},IntPtr.Zero);return r;}}'
$all=Get-CimInstance Win32_Process|Select-Object ProcessId,ParentProcessId,Name;$s=@(${Number(root)});do{$n=$s.Count;foreach($p in $all){if($s -contains $p.ParentProcessId -and -not($s -contains $p.ProcessId)){$s+=$p.ProcessId}}}while($s.Count -gt $n)
$v=[W]::V();$all|Where-Object{$s -contains $_.ProcessId}|ForEach-Object{"$($_.ProcessId)\`t$($_.Name)\`t$($v -contains [uint32]$_.ProcessId)"}`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', windowsHide: true });
  return String(r.stdout || '').trim().split(/\r?\n/).filter(Boolean).map((l) => { const [pid, name, vis] = l.split('\t'); return { pid: Number(pid), name, visible: vis === 'True' }; });
}
/** A stray server of this install (as if a host's record was lost): node engine/serve.mjs, hidden, on a free port. */
async function stray(editor) {
  const port = await free();
  const c = spawn(process.execPath, [path.join(REPO, 'engine', 'serve.mjs'), editor, '--port', String(port)], { env: { ...env, BW_SERVE_CHILD: '1' }, detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  await until(() => up(`http://127.0.0.1:${port}/`));
  return c.pid;
}
/** A process of ANOTHER install: its command line names a serve.mjs in a different folder; it must survive. */
function otherInstall() {
  const fake = path.join(tmp, 'other-install', 'engine', 'serve.mjs');
  const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', fake], { detached: true, stdio: 'ignore', windowsHide: true });
  c.unref();
  return c.pid;
}

const browser = await chromium.launch(launchOptions());
let other = 0;
try {
  // ── the code: every background start is detached + hidden, and the supervisor gives its server no console ──
  const host = fs.readFileSync(path.join(REPO, 'engine', 'host.mjs'), 'utf8');
  const serve = fs.readFileSync(path.join(REPO, 'engine', 'serve.mjs'), 'utf8');
  check('launch: host.mjs spawns the server detached, windowsHide, output to HISTORY\\host.log (no inherited console)', /spawn\(process\.execPath, \[SERVE[^\n]*detached: true, stdio: \['ignore', log, log\], windowsHide: true/.test(host) && /host\.log/.test(host));
  check('launch: the supervisor forks its server with windowsHide and piped (not inherited) output when it runs in the background', /stdio: hidden \? \['ignore', 'pipe', 'pipe', 'ipc'\] : 'inherit', windowsHide: true/.test(serve));
  for (const f of ['open.md', 'close.md']) {
    const run = fs.readFileSync(path.join(REPO, 'commands', f), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('!`')).join(' '); // what the command runs
    check(`launch: commands/${f} runs engine/cli.mjs (no serve.mjs, no powershell)`, /engine\/cli\.mjs" (open|close) /.test(run) && !/Start-Process|powershell|serve\.mjs/i.test(run), run);
  }
  check('launch: SKILL.md tells the agent to open through cli.mjs open and never through a console', /cli\.mjs open/.test(fs.readFileSync(path.join(REPO, 'SKILL.md'), 'utf8')) && /never run `node engine\/serve\.mjs` in a terminal/.test(fs.readFileSync(path.join(REPO, 'SKILL.md'), 'utf8')));
  check('stop: ownsServe matches this install only (other folders, other installs never)', ownsServe(`"node.exe" ${path.join(REPO, 'engine', 'serve.mjs')} x.html --port 1`) && ownsServe(`node ${path.join(REPO, 'engine', 'serve.mjs').replace(/\\/g, '/').toUpperCase()}`) && !ownsServe(`node ${path.join(tmp, 'other-install', 'engine', 'serve.mjs')}`) && !ownsServe('node tests/power.test.mjs'));

  // ── open: returns at once with the address; the host runs with no visible window ──
  const port = await free();
  const t0 = Date.now();
  const o = cli('open', path.join(REPO, 'samples', 'blank'), '--port', String(port), '--no-browser');
  const took = Date.now() - t0;
  check('launch: `open` returns with the address while the host keeps running in the background', !!o.url && (await up(o.url)) && took < 60000, JSON.stringify(o).slice(0, 300));
  const h = hostJson();
  if (process.platform === 'win32' && h) {
    const t = tree(h.pid);
    check(`launch: no process of the host tree has a visible window (${t.map((x) => x.name).join(', ')})`, t.length >= 2 && t.every((x) => !x.visible), JSON.stringify(t));
  }
  const log = path.join(env.BW_WORKSPACE, 'Business-Wrap', '.system', 'history', 'host.log');
  check('launch: the host\'s output goes to .system\\history\\host.log', fs.existsSync(log) && /Business-Wrap editor on/.test(fs.readFileSync(log, 'utf8')));

  // ── the power route refuses without the confirmation ──
  const bad = await fetch(new URL('api/power/off', o.url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const foreign = await fetch(new URL('api/power/off', o.url), { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.com' }, body: '{"confirm":true}' });
  check('power: no confirm → 400, a foreign page → 403, and nothing stops', bad.status === 400 && foreign.status === 403 && (await up(o.url)), `${bad.status} ${foreign.status}`);

  // ── the button: cancel stops nothing; confirm stops the host, its server, a stray server of this install ──
  const strayPid = await stray(o.editor);
  other = otherInstall();
  const kids = process.platform === 'win32' ? tree(h.pid).filter((x) => x.name === 'node.exe').map((x) => x.pid) : [h.pid];
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(o.url);
  await page.waitForFunction(() => window.BW?.ready);
  await sleep(600);
  const btn = page.locator('.island [data-a="powerOff"]');
  check('power: the toolbar has the power button (served editor)', (await btn.count()) === 1);
  await btn.click();
  await sleep(300);
  const asked = await page.evaluate(() => { const d = document.getElementById('bw-ui-host').shadowRoot.querySelector('.dialog'); return { open: !d.hidden, text: d.textContent, focus: d.querySelector(':focus')?.dataset.k || document.getElementById('bw-ui-host').shadowRoot.activeElement?.dataset.k }; });
  check('power: pressing it asks first (a dialog, Cancel has the focus)', asked.open && /إيقاف|Turn/.test(asked.text) && asked.focus === 'pw-no', JSON.stringify(asked).slice(0, 200));
  await page.locator('.dialog [data-k="pw-no"]').click();
  await sleep(800);
  check('power: Cancel stops nothing (host, server and stray still answer)', (await up(o.url)) && alive(h.pid) && alive(strayPid) && (await page.evaluate(() => document.documentElement.dataset.bwPower)) === 'cancelled');
  await btn.click();
  await sleep(300);
  await page.locator('.dialog [data-k="pw-yes"]').click();
  const shown = await until(() => page.evaluate(() => !!document.getElementById('bw-ui-host').shadowRoot.querySelector('.pw-off')), 5000);
  check('power: confirm → the «stopped» page', shown);
  const gone = await until(() => ![h.pid, ...kids, strayPid].some(alive), 20000);
  check('power: confirm → no Business-Wrap node of this install is left (host, its server, a stray server)', gone, JSON.stringify([h.pid, ...kids, strayPid].map((p) => [p, alive(p)])));
  check('power: host.json is removed', !hostJson());
  check('power: another install\'s process is untouched', alive(other));
  check('power: no page errors', !errors.length, errors.join(' | '));
  await ctx.close();

  // ── stop --all (the /business-wrap:close command) does the same from outside ──
  const o2 = cli('open', path.join(REPO, 'samples', 'blank'), '--port', String(await free()), '--no-browser');
  const h2 = hostJson();
  const s2 = await stray(o2.editor);
  const r = cli('stop', '--all');
  const gone2 = await until(() => !alive(h2?.pid) && !alive(s2), 15000);
  check('stop --all: the host and a stray server of this install stop; the other install survives', !!h2 && gone2 && alive(other) && r.stopped >= 2, JSON.stringify(r));
  const r3 = cli('close');
  check('close = stop --all, and a second run finds nothing left', r3.stopped === 0, JSON.stringify(r3));
} catch (e) {
  check('power run', false, e.stack?.split('\n').slice(0, 4).join(' / '));
} finally {
  await browser.close();
  try { process.kill(other); } catch { /* gone */ }
  cli('stop', '--all');
}
console.log(results.join('\n'));
console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
