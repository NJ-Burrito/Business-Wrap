// Shared by the 0.15.0 spell and server-toggle suites (lane spell): a real browser, Edge first (the owner's browser), else the house Chrome,
// and the way to open an editor built from the sample, served in-process on a free port with an isolated state folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { launchOptions } from '../engine/export.mjs';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
/** Edge when it is installed (Windows), else the house Chrome (Linux CI). */
export const launch = () => chromium.launch(EDGE ? { headless: true, executablePath: EDGE } : launchOptions());
export const browserName = () => (EDGE ? 'msedge' : 'chrome');
export const tmpDir = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
/** The page's UI lives in a shadow root: run fn(root, arg) inside it. */
export const shRoot = (page, fn, arg) => page.evaluate(([src, a]) => { const r = document.getElementById('bw-ui-host').shadowRoot; return new Function('r', 'a', `return (${src})(r, a)`)(r, a); }, [fn.toString(), arg]);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const until = async (fn, ms = 15000, step = 120) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(step)) if (await fn()) return true; return false; };
