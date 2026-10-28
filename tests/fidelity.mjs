// Fidelity: the editor's own print output vs a reference PDF of the same
// document JSON built by another pipeline (e.g. the source SRS pipeline).
//
//   node tests/fidelity.mjs --doc <document.json> --reference <ref.pdf> [--theme t.json] [--skip-pages 1]
//
// Prints per-page: body-text equality and a pixel difference (mean absolute
// grey-level difference, 0..255, body area only — the running head and footer
// are excluded because the reference may carry a different producer/logo).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildEditor } from '../engine/build-editor.mjs';
import { launchOptions, REPO } from '../engine/export.mjs';
import { PAGE } from '../engine/render.mjs';
import { py } from '../engine/py.mjs';

const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1]]] : acc), []));
if (!a.doc || !a.reference) { console.error('usage: node tests/fidelity.mjs --doc d.json --reference ref.pdf [--theme t.json]'); process.exit(2); }

export async function editorPrint(docFile, themeFile, outPdf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fid-'));
  const html = path.join(tmp, 'editor.html');
  buildEditor({ inputs: [docFile], out: html, themeFile, watermarkDir: null });
  const b = await chromium.launch(launchOptions());
  try {
    const p = await b.newPage({ viewport: { width: PAGE.measurePx, height: PAGE.contentPx } });
    await p.goto(pathToFileURL(html).href);
    await p.waitForFunction(() => window.BW);
    await p.evaluate(() => document.fonts.ready.then(() => 1));
    await p.emulateMedia({ media: 'print' });
    await p.pdf({ path: outPdf, preferCSSPageSize: true, printBackground: true });
  } finally {
    await b.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const out = path.join(REPO, 'out', 'fidelity', path.basename(a.doc).replace(/\.json$/, '.editor-print.pdf'));
fs.mkdirSync(path.dirname(out), { recursive: true });
await editorPrint(path.resolve(a.doc), a.theme && path.resolve(a.theme), out);
const r = spawnSync(...py([path.join(path.dirname(fileURLToPath(import.meta.url)), 'pdf_compare.py'), out, path.resolve(a.reference), String(a['skip-pages'] ?? 1)], ['pymupdf']), { encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
process.stdout.write(r.stdout);
process.stderr.write(r.stderr);
process.exit(r.status ?? 1);
