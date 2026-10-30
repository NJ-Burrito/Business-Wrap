import './_isolate.mjs';
// Test hygiene (0.13.3): no suite can touch the owner's real save folder or the real .local/. By construction:
// every suite imports tests/_isolate.mjs first; in test mode the state folder and the default save folder are temp
// folders and the real <Documents>\Business-Wrap is refused as a parent.
//   node tests/hygiene-0133.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('ok', m); };

// 1. every suite imports the shared helper
const suites = [...fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(ROOT, 'tests', f)), path.join(ROOT, 'mcp', 'test', 'server.test.mjs')];
for (const f of suites) {
  const want = f.includes(`${path.sep}mcp${path.sep}`) ? '../../tests/_isolate.mjs' : './_isolate.mjs'; // a wrong relative path fails the suite at import, but the check names it
  ok(fs.readFileSync(f, 'utf8').includes(`import '${want}';`) && fs.existsSync(path.resolve(path.dirname(f), want)), `${path.basename(f)} imports ${want}`);
}

// 2. the paths resolve into temp, never into the real ones
const { workspace, localDir, validParent } = await import('../engine/workspace.mjs');
const { CONFIG_FILE } = await import('../engine/config.mjs');
const { dir: learnDir } = await import('../engine/learning/store.mjs');
const { STATE_DIR } = await import('../engine/heal/index.mjs');
const tmp = path.resolve(os.tmpdir());
const under = (p, d) => { const r = path.relative(d, path.resolve(p)); return !r.startsWith('..') && !path.isAbsolute(r); };
const realRoot = path.join(os.homedir(), 'Documents', 'Business-Wrap');
if (!process.env.BW_WORKSPACE) {
  ok(under(workspace().root, tmp) && !under(workspace().root, realRoot), 'default workspace root is a temp folder');
}
if (!process.argv.includes('--child')) {
  for (const f of [localDir(), CONFIG_FILE, learnDir(), STATE_DIR()]) ok(!under(f, path.join(ROOT, '.local')), `${f} is outside the repo .local`);
}
ok(validParent(path.join(os.homedir(), 'Documents')) === null, 'the real Documents parent is refused in test mode');
ok(validParent(realRoot) === null, 'the real Business-Wrap root is refused in test mode');

// 3. a suite run directly (no runner env at all) is still safe: the entry path alone turns the guard on
const probe = path.join(ROOT, 'tests', '_hygiene-probe.tmp.mjs');
fs.writeFileSync(probe, "import { workspace, localDir } from '../engine/workspace.mjs';\nconsole.log(JSON.stringify({ root: workspace().root, local: localDir() }));\n");
try {
  const env = { ...process.env }; for (const k of ['BW_TEST_SLOT', 'BW_TEST_MODE', 'BW_WORKSPACE', 'BW_LOCAL_DIR', 'BW_TEST_SANDBOX']) delete env[k];
  const r = spawnSync(process.execPath, [probe], { env, encoding: 'utf8' });
  const o = JSON.parse(r.stdout.trim());
  ok(under(o.root, tmp) && !under(o.root, realRoot), 'a direct run: workspace root is a temp folder');
  ok(under(o.local, tmp), 'a direct run: .local is a temp folder');
} finally { fs.rmSync(probe, { force: true }); }
console.log(`hygiene-0133: ${n} checks ok`);
