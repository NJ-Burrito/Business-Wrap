// Every released version's saved file opens in THIS build with its whole work history (tests/fixtures/history/).
// Doors, same assertions: re-wrap (node), served + opened in the editor, re-saved, imported into the documents list,
// and the refusals that keep a file safe (a newer format, a failing migration: untouched original + backup + error page).
//
//   node tests/history-compat.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-hist-'));
process.env.BW_WORKSPACE = path.join(tmp, 'ws'); // the run's own save folder: serve() must not write the real HISTORY under the fixtures' fixed doc ids
process.env.BW_LOCAL_DIR = path.join(tmp, 'local'); // the run's own .local: no host profile, backups not in the repo
const { rewrapEditorHtml } = await import('../engine/build-editor.mjs');
const { launchOptions, REPO } = await import('../engine/export.mjs');
const { serve } = await import('../engine/serve.mjs');
const { FORMAT, MIGRATIONS, FormatError, migrateData } = await import('../engine/format.mjs');
const { gate } = await import('../tools/release/history-gate.mjs');
const { describe, dataOf, fixtureDir, readFixture } = await import('../tools/fixtures/history.mjs');

let n = 0, fails = 0;
const check = (name, ok, detail = '') => { n += 1; if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  history: ${name}${!ok && detail ? '  - ' + detail : ''}`); };
const versions = fs.readdirSync(fixtureDir(REPO)).filter((f) => f.endsWith('.html.gz')).map((f) => f.slice(0, -8));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const BLOCK = /(<script type="application\/json" id="bw-data">)[\s\S]*?(<\/script>)/;
const withData = (html, d) => html.replace(BLOCK, (_, a, b) => a + JSON.stringify(d).replace(/</g, '\\u003c') + b);

const g = await gate();
check('release gate: this version has its fixture; every fixture re-wraps without loss', !g.length, g.join(' | '));
check('the current version is among the fixtures', versions.includes(pkg), versions.join());
check('format chain: a migration exists for every step up to FORMAT', Array.from({ length: FORMAT }, (_, i) => typeof MIGRATIONS[i]).every((t) => t === 'function'));

const browser = await chromium.launch(launchOptions());
try {
  for (const v of versions) {
    const html = readFixture(REPO, v);
    const want = JSON.parse(fs.readFileSync(path.join(fixtureDir(REPO), `${v}.expect.json`), 'utf8'));
    const svc = Object.keys(want.services)[0];
    const wantEntries = want.logs[svc].entries;
    const wantOps = want.services[svc].ar.ops;
    const file = path.join(tmp, `${v}.html`);
    // A fixture is by definition an OLDER build's file. When it carries this very version (the release not yet bumped), the
    // server would serve its frozen code untouched (rewrapEditorHtml: same version = nothing to do), so the page under test
    // would be the old build, not this one (0.15.0: the frozen 0.14.0 busy card threw under load). Stamp it one step older.
    const asOlder = (txt) => { const dd = dataOf(txt); return dd.version === pkg ? withData(txt, { ...dd, version: '0.0.0-fixture' }) : txt; };
    fs.writeFileSync(file, asOlder(html));

    // 1. re-wrap: unknown top-level keys and edition attributes travel on
    const marked = dataOf(html);
    marked.zzFuture = { keep: [1, 2, 3] };
    marked.services[0].editions.ar.zzEditionAttr = { cell: 'x' };
    const re = dataOf(rewrapEditorHtml(withData(html, marked)));
    check(`${v}: re-wrap keeps unknown top-level and edition keys, stamps format ${FORMAT}`, JSON.stringify(re.zzFuture) === JSON.stringify(marked.zzFuture) && JSON.stringify(re.services[0].editions.ar.zzEditionAttr) === '{"cell":"x"}' && re.format === FORMAT);

    // 2. served and opened in the editor
    const server = await serve(file, 0, { out: tmp });
    try {
      const ctx = await browser.newContext({ acceptDownloads: true });
      await ctx.addInitScript(() => localStorage.setItem('bw:profile', JSON.stringify({ name: 'T', activity: true })));
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.BW?.ready && window.BW.EXT.ledger?.log(), null, { timeout: 30000 });
      await page.evaluate(() => window.BW.EXT.ledger.ready());
      const r = await page.evaluate(() => { const L = window.BW.EXT.ledger.log(); return { kinds: L.entries.map((e) => e.kind).join(','), heads: L.entries.map((e) => e.hash), ok: L.verdict.ok, src: L.src, ops: window.BW.M[window.BW.S.svc].ar.ops.length }; });
      check(`${v}: opened in the editor: all ${wantEntries} log entries, same chain, ${wantOps} ops, verified, not stripped/legacy`, r.heads[wantEntries - 1] === want.logs[svc].head && r.kinds.startsWith(want.logs[svc].kinds) && r.ok && r.src === 'html' && r.ops === wantOps, JSON.stringify({ src: r.src, ok: r.ok, ops: r.ops, kinds: r.kinds }));

      // 3. Save HTML from the opened file: the history goes on into the next file
      const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.BW.runAction('saveHtml'))]);
      const out = path.join(tmp, `${v}.resaved.html`);
      await dl.saveAs(out);
      const after = await describe(fs.readFileSync(out, 'utf8'));
      check(`${v}: re-saved by this build: ops kept, log only grows (${wantEntries} to ${after.logs[svc]?.entries})`, after.services[svc].ar.opIds === want.services[svc].ar.opIds && after.logs[svc].entries >= wantEntries && after.logs[svc].kinds.startsWith(want.logs[svc].kinds) && after.format === FORMAT, JSON.stringify(after.logs));

      // 4. imported into the documents list
      const imp = await page.evaluate(async (txt) => {
        const e = await window.BW.EXT.library.importAny(new File([txt], 'in.html', { type: 'text/html' }));
        await window.BW.EXT.ledger.ready();
        const L = window.BW.EXT.ledger.log();
        return { n: L.entries.length, prefix: L.entries.map((x) => x.kind).join(','), ok: L.verdict.ok, ops: window.BW.M[window.BW.S.svc].ar.ops.length, id: e?.id, toasts: [...document.getElementById('bw-ui-host').shadowRoot.querySelectorAll('.toast .m')].map((x) => x.textContent).join(' | ') };
      }, html);
      check(`${v}: imported into the library: its log and ${wantOps} ops come with it`, imp.id && imp.ok && imp.prefix.startsWith(want.logs[svc].kinds) && imp.ops === wantOps, JSON.stringify(imp));
      await ctx.close();
    } finally { server.closeAllConnections?.(); await new Promise((ok) => server.close(ok)); }
  }

  // 5. the refusals: a newer file, a failing migration. The file stays untouched, a backup is kept, an error page says why.
  const html = readFixture(REPO, pkg);
  const newer = dataOf(html);
  newer.format = FORMAT + 1;
  let err = null;
  try { rewrapEditorHtml(withData(html, newer)); } catch (e) { err = e; }
  check('a file from a NEWER format is refused (FormatError), never rebuilt', err instanceof FormatError && /newer/.test(err.message), String(err));

  const m0 = MIGRATIONS[0];
  MIGRATIONS[0] = () => { throw new Error('boom'); };
  const stale = dataOf(html);
  delete stale.format; // a file made before the format number
  const staleHtml = withData(html, stale);
  err = null;
  try { migrateData(stale); } catch (e) { err = e; }
  const bad = path.join(tmp, 'failing.html');
  fs.writeFileSync(bad, staleHtml);
  const sBad = await serve(bad, 0, { out: tmp });
  let status = 0, txt = '';
  try { const res = await fetch(`http://127.0.0.1:${sBad.address().port}/`); status = res.status; txt = await res.text(); } finally { sBad.closeAllConnections?.(); await new Promise((ok) => sBad.close(ok)); MIGRATIONS[0] = m0; }
  const bak = path.join(process.env.BW_LOCAL_DIR, 'backups');
  check('a failing migration: FormatError, error page naming the cause, original byte-identical, backup copy kept', err instanceof FormatError && status === 500 && /boom/.test(txt) && fs.readFileSync(bad, 'utf8') === staleHtml && fs.existsSync(bak) && fs.readdirSync(bak).some((f) => f.endsWith('failing.html') && fs.readFileSync(path.join(bak, f), 'utf8') === staleHtml), `${status} ${txt.slice(0, 200)}`);
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails ? `FAILED: history ${n - fails}/${n}` : `ALL PASS: history ${n}/${n}`);
process.exit(fails ? 1 : 0);
