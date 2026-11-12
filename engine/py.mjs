// One way to run Python: through uv with the packages each step needs, so a fresh machine needs only
// Node, uv and a Chromium browser, Google Chrome first (no pip installs). Without uv it falls back to plain `python` and says so once.
//
//   spawnSync(...py(['script.py', 'arg'], ['pymupdf']), opts)
import { spawnSync } from 'node:child_process';

let uv;
export function hasUv() {
  if (uv === undefined) uv = spawnSync('uv', ['--version'], { stdio: 'ignore' }).status === 0;
  return uv;
}

let warned = false;
/** [command, args] for a Python run with `deps` available. */
export function py(args, deps = ['pymupdf']) {
  if (hasUv()) return ['uv', ['run', '--no-project', '--quiet', ...deps.flatMap((d) => ['--with', d]), 'python', ...args]];
  if (!warned) {
    warned = true;
    process.stderr.write(`business-wrap: uv not found, running plain python (it needs ${deps.join(', ') || 'no extra packages'}). Install uv: https://docs.astral.sh/uv/getting-started/installation/\n`);
  }
  return ['python', args];
}
