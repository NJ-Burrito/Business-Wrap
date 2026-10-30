// Test hygiene (0.13.3): a test never reads or writes the owner's real data, by construction.
// "Test mode" is on when the test runner set BW_TEST_SLOT, when a suite imported tests/_isolate.mjs (BW_TEST_MODE=1),
// or when the entry script is a file under tests/ or mcp/test/ (so `node tests/x.test.mjs` is safe too; children inherit the env).
// In test mode: the local state folder (.local) is a temp folder, the default save folder is a temp folder, and the owner's
// real save folder (<home>\Documents\Business-Wrap) is refused as a workspace parent. BW_LOCAL_DIR / BW_WORKSPACE still win
// when a suite names its own (they are the suite's sandbox).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ENTRY = String(process.argv[1] || '');
if (/\/(tests|mcp\/test)\/[^/]+\.mjs$/.test(ENTRY.replace(/\\/g, '/'))) process.env.BW_TEST_MODE ??= '1';

export const isTestMode = () => process.env.BW_TEST_SLOT !== undefined || process.env.BW_TEST_MODE === '1';
/** A per-run scratch folder under the OS temp folder (never under the repo, never in the owner's Documents). Created on first use,
 *  shared with child processes through BW_TEST_SANDBOX, removed by the process that made it when it exits. */
export const testSandbox = (name) => {
  let root = process.env.BW_TEST_SANDBOX;
  if (!root || !fs.existsSync(root)) {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-test-'));
    process.env.BW_TEST_SANDBOX = root;
    process.on('exit', () => { try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* temp */ } });
  }
  return path.join(root, name);
};
/** The state folder: BW_LOCAL_DIR, else a temp folder in test mode, else <repo>/.local. */
export const localBase = (repo) => (process.env.BW_LOCAL_DIR ? path.resolve(process.env.BW_LOCAL_DIR) : isTestMode() ? testSandbox('local') : path.join(repo, '.local'));
/** The owner's real default save parent and root: never touched by a test. */
export const realParent = () => path.join(os.homedir(), 'Documents');
export const isRealRoot = (p) => {
  const r = path.relative(path.join(realParent(), 'Business-Wrap'), path.resolve(p));
  return !r.startsWith('..') && !path.isAbsolute(r);
};
