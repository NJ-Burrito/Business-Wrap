// History fixtures: one REAL saved file per released version, made by that version's own editor (never hand-written).
//
//   node tools/fixtures/history.mjs make [outDir]   run in a checkout of the version to fix: builds its editor, makes edits,
//                                                    saves HTML twice, writes <outDir>/<version>.html.gz + <version>.expect.json
//   import { describe } from this file               what a file holds of history, read from the FILE (no app code):
//                                                    ops, marks, comments, versions per edition + the sealed log's entries
// tests/history-compat.test.mjs opens every fixture in the current build and compares with its .expect.json.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..', '..');
import { BWLOG1 as L } from '../../engine/ledger-v1.mjs';

export const dataOf = (html) => JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(html)[1]);

/** The history a file holds, as plain numbers and hashes. */
export async function describe(html) {
  const d = dataOf(html);
  const services = {};
  for (const s of d.services) {
    services[s.id] = {};
    for (const [ed, e] of Object.entries(s.editions)) {
      services[s.id][ed] = { ops: (e.ops || []).length, opIds: (e.ops || []).map((o) => o.id).join(','), marks: (e.marks || []).length, comments: (e.comments || []).length, versions: (e.versions || []).length };
    }
  }
  const logs = {};
  for (const [id, p] of Object.entries(d.prov || {})) {
    const u = await L.unseal(p.log, p.doc);
    logs[id] = { entries: u.entries.length, kinds: u.entries.map((e) => e.kind).join(','), head: u.entries.at(-1)?.hash || '' };
  }
  return { version: d.version, format: d.format ?? 0, bwlog: d.bwlog ?? 0, services, logs };
}

export const fixtureDir = (repo) => path.join(repo, 'tests', 'fixtures', 'history');
export const readFixture = (repo, version) => zlib.gunzipSync(fs.readFileSync(path.join(fixtureDir(repo), `${version}.html.gz`))).toString('utf8');

async function make(outDir) {
  const REPO = ROOT;
  const { chromium } = await import('playwright-core');
  const { buildEditor } = await import(pathToFileURL(path.join(REPO, 'engine', 'build-editor.mjs')).href);
  const { launchOptions } = await import(pathToFileURL(path.join(REPO, 'engine', 'export.mjs')).href);
  const version = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-fx-'));
  const file = path.join(tmp, 'fx.editor.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: file, set: 'fixture', watermarkDir: null });
  const browser = await chromium.launch(launchOptions());
  try {
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1500, height: 900 } });
    await ctx.addInitScript(() => localStorage.setItem('bw:profile', JSON.stringify({ name: 'Fixture', activity: true })));
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.ledger?.log());
    await page.evaluate(() => window.BW.EXT.ledger.ready());
    const edit = (v) => page.evaluate((v) => { const e = window.BW.M[window.BW.S.svc][window.BW.S.ed]; return window.BW.commit([{ op: 'setText', path: '/control/title', value: v, old: e.doc.control.title }]); }, v);
    const save = async (name) => {
      const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
      const f = path.join(tmp, name); await dl.saveAs(f); return f;
    };
    for (const v of ['History one', 'History two', 'History three']) await edit(v);
    await page.evaluate(() => window.BW.EXT.ledger.ready());
    await save('first.html');
    await edit('History four');
    await page.evaluate(() => window.BW.EXT.ledger.ready());
    // no machine path in a committed file: the editor's font urls point into this user's profile
    const html = fs.readFileSync(await save('second.html'), 'utf8').replace(/file:\/\/\/[^)"'\s]+\/([^/)"'\s]+\.(?:ttf|otf|woff2?))/g, 'file:///fixture-fonts/$1');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${version}.html.gz`), zlib.gzipSync(html, { level: 9 }));
    const exp = await describe(html);
    fs.writeFileSync(path.join(outDir, `${version}.expect.json`), JSON.stringify(exp, null, 1) + '\n');
    console.log(`fixture ${version}: ${Object.values(exp.logs).map((l) => l.entries).join('+')} log entries, ${Object.values(exp.services)[0] && Object.values(Object.values(exp.services)[0])[0].ops} ops -> ${outDir}`);
  } finally { await browser.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  if (process.argv[2] !== 'make') { console.error('usage: node tools/fixtures/history.mjs make [outDir]'); process.exit(2); }
  await make(path.resolve(process.argv[3] || fixtureDir(ROOT)));
}
