// 0.17.4: who may take over the person's Desktop shortcut and the business-wrap: registration (launcher/ownership.mjs).
// Found when a host started from a git worktree rewrote the owner's real Desktop Business-Wrap.lnk and the protocol (which already pointed at a deleted worktree).
//   - a sandboxed run (test mode ...) never writes the real Desktop or HKCU
//   - a source checkout never takes over a live real target on its own
//   - another install that still exists is never displaced; a dead target (folder gone) or none is taken; `make --force` / `protocol register` are the explicit take-over
// Fake Desktop (a temp folder) and a fake registry layer (a temp HKCU subkey); the real Desktop and the real key are only READ (before/after) to prove they did not move.
//   node tests/launcher-owner-0174.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO } from '../engine/export.mjs';
import * as P from '../engine/protocol.mjs';
import { ensureLauncher, readShortcut, desktopDir, LNK_NAME } from '../launcher/launcher.mjs';
import { mayTakeOver, installOf, isCheckout } from '../launcher/ownership.mjs';

const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  launcher-owner: ${name}${detail && !ok ? '  — ' + detail : ''}`); if (!ok) failed += 1; };
const win = process.platform === 'win32';
const tmp = fs.mkdtempSync(path.join(process.env.BW_START_TMP || os.tmpdir(), 'bw-owner174-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'local'); // the stamps of the fake installs go here, never the real state
const fake = (name, version = '1.0.0') => {
  const d = path.join(tmp, name);
  for (const f of ['launcher/open-editor.vbs', 'assets/icons/launcher.ico']) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.copyFileSync(path.join(REPO, f), path.join(d, f)); }
  fs.mkdirSync(path.join(d, 'update'), { recursive: true });
  fs.writeFileSync(path.join(d, 'update', 'cli.mjs'), '');
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'business-wrap', version }));
  return d;
};
const stat = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return 'none'; } };
const regOf = () => { const r = spawnSync('reg.exe', ['query', 'HKCU\\Software\\Classes\\business-wrap\\shell\\open\\command', '/ve'], { encoding: 'utf8', windowsHide: true }); return r.status === 0 ? r.stdout : 'none'; };

try {
  // the rule itself
  const dead = path.join(tmp, 'gone');
  check('rule: nothing there / same install / dead target are taken, a live other install is not', mayTakeOver({ installDir: tmp, current: null, realProfile: false }).ok && mayTakeOver({ installDir: tmp, current: tmp, realProfile: false }).ok && mayTakeOver({ installDir: tmp, current: dead, realProfile: false }).why === 'dead-target' && mayTakeOver({ installDir: tmp, current: os.homedir(), realProfile: false }).why === 'other-install-alive');
  check('rule: explicit (force / register) always wins', mayTakeOver({ installDir: tmp, current: os.homedir(), explicit: true }).ok);
  check('rule: a sandboxed run never takes the real profile, whatever it holds', mayTakeOver({ installDir: tmp, current: null }).why === 'sandbox');
  const keep = {}; for (const k of ['BW_TEST_MODE', 'BW_TEST_SLOT', 'BW_LOCAL_DIR', 'BW_STATE_DIR', 'BW_WORKSPACE']) { keep[k] = process.env[k]; delete process.env[k]; }
  const co = path.join(tmp, 'checkout'); fs.mkdirSync(co); fs.writeFileSync(path.join(co, '.git'), 'gitdir: x');
  const r1 = mayTakeOver({ installDir: co, current: null }); const r2 = mayTakeOver({ installDir: co, current: dead }); const r3 = mayTakeOver({ installDir: tmp, current: dead });
  for (const [k, v] of Object.entries(keep)) if (v !== undefined) process.env[k] = v;
  check('rule: a git checkout never takes the real profile on its own (not even a dead one or an empty one); a release install does', r1.why === 'checkout' && r2.why === 'checkout' && r3.ok && isCheckout(co) && !isCheckout(tmp));
  check('installOf: reads the install out of a launcher command and a handler command', installOf('//B //Nologo "C:\\x y\\Business-Wrap\\launcher\\open-editor.vbs" "C:\\n\\node.exe"') === 'C:\\x y\\Business-Wrap' && installOf('"node.exe" "O:\\a\\update\\cli.mjs" handle "%1"') === 'O:\\a' && installOf('nothing') === null);

  if (win) {
    // ── the Desktop shortcut, on a fake Desktop ──
    const desktop = path.join(tmp, 'desktop'); fs.mkdirSync(desktop);
    const A = fake('A'); const B = fake('B'); const C = fake('C');
    const targetOf = () => installOf(readShortcut(path.join(desktop, LNK_NAME))?.args);
    const a = ensureLauncher({ installDir: A, lnkDir: path.join(tmp, 'lnkA'), desktop });
    check('desktop: the first install puts its shortcut on the fake Desktop', !!a.desktop?.copy && targetOf()?.toLowerCase() === A.toLowerCase(), JSON.stringify(a.desktop));
    const b = ensureLauncher({ installDir: B, lnkDir: path.join(tmp, 'lnkB'), desktop });
    check('desktop: a second install that exists elsewhere does NOT take it over', b.desktop?.skipped === 'other-install-alive' && targetOf()?.toLowerCase() === A.toLowerCase(), JSON.stringify(b.desktop));
    const bf = ensureLauncher({ installDir: B, lnkDir: path.join(tmp, 'lnkB'), desktop, force: true });
    check('desktop: `make --force` (the person\'s own choice) does take it over', !!bf.desktop?.copy && targetOf()?.toLowerCase() === B.toLowerCase(), JSON.stringify(bf.desktop));
    fs.rmSync(B, { recursive: true, force: true }); // the install the shortcut points at is gone: a dead target
    const c = ensureLauncher({ installDir: C, lnkDir: path.join(tmp, 'lnkC'), desktop });
    check('desktop: a target whose install folder is gone is taken over by the next install', !!c.desktop?.copy && targetOf()?.toLowerCase() === C.toLowerCase(), JSON.stringify(c.desktop));
    // a test run with no Desktop named never reaches the real one
    const realDesk = (() => { try { const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8', windowsHide: true }); return String(r.stdout).trim(); } catch { return ''; } })();
    const before = stat(path.join(realDesk, LNK_NAME));
    delete process.env.BW_DESKTOP_DIR;
    const t = ensureLauncher({ installDir: fake('D'), lnkDir: path.join(tmp, 'lnkD'), force: true });
    check('desktop: a sandboxed run with no Desktop named has none (never the real one), and the real shortcut did not move', desktopDir() === null && !!t.desktop?.skipped && stat(path.join(realDesk, LNK_NAME)) === before, JSON.stringify(t.desktop));

    // ── the protocol, in a fake HKCU subkey ──
    const hive = `HKCU\\Software\\BWOwnerTest-${process.pid}`;
    const realBefore = regOf();
    try {
      const X = fake('X'); const Y = fake('Y');
      P.register({ hive, cli: path.join(X, 'update', 'cli.mjs') });
      const e1 = P.ensureRegistered({ hive });
      check('protocol: a handler that points at another install that still exists is left alone', e1.skipped === 'other-install-alive' && installOf(P.status({ hive }).command)?.toLowerCase() === X.toLowerCase(), JSON.stringify(e1));
      fs.rmSync(X, { recursive: true, force: true });
      const e2 = P.ensureRegistered({ hive });
      check('protocol: once that install is gone (dead target) this install registers itself', e2.registered === true && P.status({ hive }).current === true, JSON.stringify(e2));
      P.register({ hive, cli: path.join(Y, 'update', 'cli.mjs') });
      P.register({ hive }); // the explicit action (`protocol register`) always takes over
      check('protocol: `protocol register` (explicit) takes over even a live one', P.status({ hive }).current === true);
    } finally { P.unregister({ hive }); spawnSync('reg.exe', ['delete', hive, '/f'], { windowsHide: true }); }
    const e3 = P.ensureRegistered(); // no hive: this would be the REAL key
    check('protocol: a sandboxed run with no fake hive never writes the real registration, and the real key did not move', e3.skipped === 'sandbox' && regOf() === realBefore, JSON.stringify(e3));
  } else check('launcher/protocol take-over: Windows-only parts skipped on this platform', true);
} finally {
  spawnSync('python', [path.join(os.homedir(), '.claude', 'skills', 'safe-delete', 'scripts', 'trash.py'), tmp], { stdio: 'ignore', windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
}
console.log(results.join('\n'));
console.log(`${failed ? 'FAIL' : 'PASS'}: launcher-owner-0174 — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
