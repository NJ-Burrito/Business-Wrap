// Shared test harness. One place for the check reporter, the temp workspace, the Chrome launch and the polling helper
// that 160 suites used to copy by hand. A suite stays a plain node script: it calls finish() last and the exit code is the verdict.
//
//   import { suite, sleep, waitFor, launchChrome } from './_harness.mjs';
//   const { check, tmp, run, finish } = suite('launcher');      // label is the optional "label: " prefix on each line
//   await run(async () => { ... check('does X', cond, 'detail shown on failure'); });  // an exception becomes one FAIL, never a crash
//   finish();                                                  // prints the lines, "ALL PASS: n/m" / "FAILED: n/m", exits 0 / 1
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll fn() (sync or async, a throw counts as "not yet") until it is truthy; returns that value, or false after `ms`. */
export async function waitFor(fn, ms = 20000, step = 150) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) {
    try { const v = await fn(); if (v) return v; } catch { /* not yet */ }
  }
  return false;
}

/** A fresh temp directory under the OS temp dir (which is O:\Temp here). Remove it with rmTmp or suite().cleanup. */
export const mkTmp = (prefix = 'bw-test-') => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
export const rmTmp = (dir) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } };

/** Chrome through the product's own launch options (real Chrome, the same flags the exporter uses). Caller closes it. */
export async function launchChrome(extraArgs = []) {
  const { chromium } = await import('playwright-core');
  const { launchOptions } = await import('../engine/export.mjs');
  const o = launchOptions();
  return chromium.launch(extraArgs.length ? { ...o, args: [...(o.args || []), ...extraArgs] } : o);
}

/**
 * @param {string} label   optional prefix for every result line ("launcher: ...")
 * @param {{tmpPrefix?: string, sep?: string, failOnly?: boolean}} opts
 *        sep: separator before the detail (default ' | ' is NOT used; default is '  — ' like most suites);
 *        failOnly: show the detail only on FAIL (default true)
 */
export function suite(label = '', opts = {}) {
  const { tmpPrefix = 'bw-' + (label || 'test').replace(/[^a-z0-9]+/gi, '-') + '-', sep = '  — ', failOnly = true } = opts;
  const results = [];
  let failed = 0, tmpDir = null;
  const prefix = label ? label + ': ' : '';
  /** check(name, ok, detail): ok must be a boolean-ish value; a non-boolean truthy value passes. Returns ok. */
  const check = (name, ok, detail = '') => {
    const show = detail && (!failOnly || !ok);
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${prefix}${name}${show ? sep + String(detail).slice(0, 400) : ''}`);
    if (!ok) failed += 1;
    return !!ok;
  };
  const api = {
    check,
    results,
    get failed() { return failed; },
    /** Lazy temp workspace, removed by cleanup() / finish(). */
    get tmp() { return tmpDir ??= mkTmp(tmpPrefix); },
    cleanup() { if (tmpDir) rmTmp(tmpDir); tmpDir = null; },
    /** Run the suite body; an exception is reported as one failing check (nothing is added when it runs clean) ("suite ran without an exception") and the body's finally-work still runs. */
    async run(body, cleanup) {
      try { await body(); } catch (e) { check('suite ran without an exception', false, (e && e.stack) || e); } finally {
        if (cleanup) { try { await cleanup(); } catch (e) { check('suite cleanup ran without an exception', false, (e && e.message) || e); } }
      }
    },
    /** Print and exit. Also guards against a suite that checked nothing (that cannot pass for the wrong reason). */
    finish() {
      api.cleanup();
      if (!results.length) check('the suite made at least one check', false);
      console.log(results.join('\n'));
      console.log(`\n${failed ? 'FAILED' : 'ALL PASS'}: ${label ? label + ' ' : ''}${results.length - failed}/${results.length}`);
      process.exit(failed ? 1 : 0);
    },
  };
  return api;
}
