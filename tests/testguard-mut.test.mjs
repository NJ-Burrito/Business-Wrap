// engine/testguard.mjs + engine/ownership.mjs, mutation-tested (Stryker, 2026-11-24): testguard scored 7.7% (155 of 168 mutants
// survived the suites that use it), so a change that let a test write the owner's real Documents\Business-Wrap or the real .local
// would have passed. Every check below fails if its rule is weakened. The non-test-mode cases run in a child process with every
// test variable removed, against temp folders only; nothing here reads or writes the owner's real folders.
//   node tests/testguard-mut.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isTestMode, testSandbox, isPluginInstall, pluginData, localBase, realParent, isRealRoot, migrateLocal } from '../engine/testguard.mjs';
import { sandboxed, mayTakeOver, installOf, isWorktree } from '../engine/ownership.mjs';

const out = [];
let failed = 0;
const check = (n, ok, d = '') => { out.push(`${ok ? 'PASS' : 'FAIL'}  testguard-mut: ${n}${d && !ok ? '  — ' + String(d).slice(0, 300) : ''}`); if (!ok) failed += 1; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-tgmut-'));
const ENGINE = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'engine');
const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(BW_|CLAUDE_PLUGIN_DATA$)/.test(k)));
// run `body` (an async function source) in a child that is NOT in test mode; returns its JSON result
const child = (body, env = {}) => {
  const src = `import * as T from ${JSON.stringify(pathToFileURL(path.join(ENGINE, 'testguard.mjs')).href)};
import * as O from ${JSON.stringify(pathToFileURL(path.join(ENGINE, 'ownership.mjs')).href)};
const r = await (${body})(T, O); process.stdout.write(JSON.stringify(r));`;
  const p = spawnSync(process.execPath, ['--input-type=module', '-e', src], { encoding: 'utf8', env: { ...CLEAN, ...env }, cwd: tmp, windowsHide: true });
  try { return JSON.parse(p.stdout); } catch { return { error: p.stderr || p.stdout }; }
};

try {
  // ---- test mode
  check('this suite is in test mode', isTestMode() === true);
  const plain = child(async (T) => ({ test: T.isTestMode() }));
  check('a plain process (no BW_ variable, entry not under tests/) is not in test mode', plain.test === false, JSON.stringify(plain));
  check('BW_TEST_SLOT alone turns test mode on', child(async (T) => T.isTestMode(), { BW_TEST_SLOT: '0' }) === true);
  check('BW_TEST_MODE=1 turns it on; another value does not', child(async (T) => T.isTestMode(), { BW_TEST_MODE: '1' }) === true && child(async (T) => T.isTestMode(), { BW_TEST_MODE: '0' }) === false);
  const entryDir = path.join(tmp, 'tests'); fs.mkdirSync(entryDir);
  const entry = path.join(entryDir, 'x.test.mjs');
  fs.writeFileSync(entry, `import { isTestMode } from ${JSON.stringify(pathToFileURL(path.join(ENGINE, 'testguard.mjs')).href)}; process.stdout.write(String(isTestMode() && process.env.BW_TEST_MODE));`);
  const byEntry = spawnSync(process.execPath, [entry], { encoding: 'utf8', env: CLEAN, windowsHide: true }).stdout;
  check('a script under tests/ is in test mode by its path alone (BW_TEST_MODE=1 for its children)', byEntry === '1', byEntry);
  const nested = path.join(entryDir, 'deep'); fs.mkdirSync(nested); fs.copyFileSync(entry, path.join(nested, 'y.mjs'));
  check('only a file directly in tests/ counts (tests/deep/y.mjs does not)', spawnSync(process.execPath, [path.join(nested, 'y.mjs')], { encoding: 'utf8', env: CLEAN, windowsHide: true }).stdout === 'false');

  // ---- the sandbox and the state folder
  const sb = testSandbox('local');
  check('testSandbox is under the OS temp folder, shared through BW_TEST_SANDBOX, and created', sb.startsWith(os.tmpdir()) && process.env.BW_TEST_SANDBOX && sb.startsWith(process.env.BW_TEST_SANDBOX) && fs.existsSync(process.env.BW_TEST_SANDBOX));
  check('the same sandbox root is reused', path.dirname(testSandbox('other')) === path.dirname(sb));
  const repo = path.join(tmp, 'repo');
  const lb = child(async (T, _O, ) => T.localBase(process.cwd() + '/repo'));
  check('outside test mode the state folder is <repo>/.local', lb === path.join(tmp, 'repo', '.local'), JSON.stringify(lb));
  check('BW_LOCAL_DIR wins over everything', child(async (T) => T.localBase('x'), { BW_LOCAL_DIR: path.join(tmp, 'mine') }) === path.join(tmp, 'mine'));
  check('in test mode the state folder is a temp sandbox, never <repo>/.local', !localBase(repo).startsWith(repo) && localBase(repo).startsWith(os.tmpdir()));
  const sbChild = child(async (T) => { const a = T.testSandbox('a'); const root = process.env.BW_TEST_SANDBOX; return { a, root, made: (await import('node:fs')).existsSync(root) }; }, { BW_TEST_SANDBOX: path.join(tmp, 'gone') });
  check('a BW_TEST_SANDBOX that does not exist is replaced by a fresh temp folder', sbChild.made && sbChild.root !== path.join(tmp, 'gone'), JSON.stringify(sbChild));

  // ---- plugin installs
  const cache = path.join(tmp, 'plugins', 'cache', 'nj-mk', 'business-wrap', '0.24.2');
  check('isPluginInstall: a plugins/cache copy yes, a plain folder or plugins-cache no', isPluginInstall(cache) && !isPluginInstall(repo) && !isPluginInstall(path.join(tmp, 'plugins-cache', 'x')));
  const pd = child(async (T) => T.pluginData(process.cwd() + '/plugins/cache/nj-mk/business-wrap/0.24.2'));
  check('pluginData is <plugins>/data/<plugin>-<marketplace>', pd === path.join(tmp, 'plugins', 'data', 'business-wrap-nj-mk'), JSON.stringify(pd));
  check('pluginData: CLAUDE_PLUGIN_DATA wins; a non-cache folder has none', child(async (T) => T.pluginData('x'), { CLAUDE_PLUGIN_DATA: path.join(tmp, 'pd') }) === path.join(tmp, 'pd') && child(async (T) => T.pluginData(process.cwd()), {}) === null);
  check('a marketplace name with odd characters is made safe', child(async (T) => T.pluginData(process.cwd() + '/plugins/cache/a.b c/bw/1')) === path.join(tmp, 'plugins', 'data', 'bw-a-b-c'));
  check('outside test mode a plugin install keeps state in <plugin data>/local', child(async (T) => T.localBase(process.cwd() + '/plugins/cache/nj-mk/business-wrap/0.24.2')) === path.join(tmp, 'plugins', 'data', 'business-wrap-nj-mk', 'local'));

  // ---- the owner's real save folder
  const real = path.join(realParent(), 'Business-Wrap');
  check('realParent is <home>/Documents', realParent() === path.join(os.homedir(), 'Documents'));
  check('isRealRoot: the real save folder and anything inside it', isRealRoot(real) && isRealRoot(path.join(real, 'a', 'b')));
  check('isRealRoot: a sibling, the parent and a look-alike name are not it', !isRealRoot(realParent()) && !isRealRoot(real + '2') && !isRealRoot(path.join(realParent(), 'Other')) && !isRealRoot(tmp));

  // ---- migrateLocal (one-time copy into the plugin data folder)
  check('migrateLocal never runs in test mode', (await migrateLocal(cache)).reason === 'not-plugin-data');
  const mk = (base, files) => { for (const [f, d] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(base, f)), { recursive: true }); fs.writeFileSync(path.join(base, f), d); } };
  const v1 = path.join(tmp, 'plugins', 'cache', 'nj-mk', 'business-wrap', '0.24.1'), v2 = cache;
  mk(path.join(v1, '.local'), { 'recent.json': '[1]', 'host.json': '{"pid":1}', 'Cache/x': 'c' });
  fs.mkdirSync(v2, { recursive: true });
  const mig = (env = {}) => child(async (T) => T.migrateLocal(process.cwd() + '/plugins/cache/nj-mk/business-wrap/0.24.2'), env);
  const m1 = mig();
  const target = path.join(tmp, 'plugins', 'data', 'business-wrap-nj-mk', 'local');
  check('a new version copies the newest sibling .local, without host.json and browser caches', m1.migrated === true && m1.from === path.join(v1, '.local') && fs.existsSync(path.join(target, 'recent.json')) && !fs.existsSync(path.join(target, 'host.json')) && !fs.existsSync(path.join(target, 'Cache')) && JSON.stringify(m1.items) === '["recent.json"]', JSON.stringify(m1));
  check('the copy is recorded (migrated-from.json) and the old folder is kept', fs.existsSync(path.join(target, 'migrated-from.json')) && fs.existsSync(path.join(v1, '.local', 'recent.json')));
  check('a second run finds the target and does nothing', mig().reason === 'target-exists');
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(path.join(v1, '.local'), { recursive: true, force: true });
  mk(path.join(v1, '.local'), { 'host.json': 'x', 'GPUCache/y': 'z' });
  check('a .local that holds only skipped files is nothing to move', mig().reason === 'nothing-to-move');
  check('a state folder that is not <plugin data>/local is not migrated', child(async (T) => T.migrateLocal(process.cwd() + '/repo')).reason === 'not-plugin-data');

  // ---- ownership
  check('sandboxed: test mode, or any of BW_LOCAL_DIR / BW_STATE_DIR / BW_WORKSPACE', sandboxed() === true
    && child(async (_T, O) => O.sandboxed()) === false
    && ['BW_LOCAL_DIR', 'BW_STATE_DIR', 'BW_WORKSPACE'].every((k) => child(async (_T, O) => O.sandboxed(), { [k]: tmp }) === true));
  const wt = path.join(tmp, 'wt'), clone = path.join(tmp, 'clone');
  fs.mkdirSync(wt); fs.writeFileSync(path.join(wt, '.git'), 'gitdir: x'); fs.mkdirSync(path.join(clone, '.git'), { recursive: true });
  check('isWorktree: a .git FILE yes, a .git folder or none no', isWorktree(wt) && !isWorktree(clone) && !isWorktree(tmp));
  const other = path.join(tmp, 'other'); fs.mkdirSync(other);
  const run = (o) => child(new Function('T', 'O', `return O.mayTakeOver(${JSON.stringify(o)})`).toString().replace('function anonymous', 'async function'));
  check('outside a sandbox: none / same install / dead target are taken', run({ installDir: clone, current: null }).why === 'none' && run({ installDir: clone, current: clone }).why === 'same-install' && run({ installDir: clone, current: path.join(tmp, 'gone') }).why === 'dead-target');
  check('outside a sandbox: a live other install is left alone', run({ installDir: clone, current: other }).ok === false && run({ installDir: clone, current: other }).why === 'other-install-alive');
  check('a worktree never takes the real profile on its own; explicit always may', run({ installDir: wt, current: null }).why === 'worktree' && run({ installDir: wt, current: other, explicit: true }).ok === true);
  check('realProfile:false skips the sandbox and worktree rules', run({ installDir: wt, current: null, realProfile: false }).why === 'none' && mayTakeOver({ installDir: wt, current: null, realProfile: false }).why === 'none');
  if (process.platform === 'win32') check('same install is case-insensitive on Windows', run({ installDir: clone, current: clone.toUpperCase() }).why === 'same-install');
  check('installOf: a quoted launcher or updater path', installOf(`wscript.exe "C:\\BW\\launcher\\open-editor.vbs" "%1"`) === 'C:\\BW' && installOf(`node "D:/x y/bw/update/cli.mjs" --open`) === 'D:/x y/bw');
  check('installOf: an unquoted one, and none at all', installOf('node C:\\BW\\update\\cli.mjs') === 'C:\\BW' && installOf('notepad.exe') === null && installOf(null) === null && installOf('C:\\BW\\launcher\\other.vbs') === null);
} catch (e) { check('suite ran without an exception', false, e.stack); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(out.join('\n'));
console.log(failed ? `FAILED: ${failed}` : `ALL OK: ${out.length} checks`);
process.exit(failed ? 1 : 0);
