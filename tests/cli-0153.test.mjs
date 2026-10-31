// 0.15.3 lane "cli": T3 reset + doctor roots, T9 update check, T11 flags and get, T13 --help and open, T14 ops/render, T15 folder names.
// Everything runs in temp folders (BW_HOME_DIR, BW_WORKSPACE, BW_LOCAL_DIR) and a fake host and releases feed; the owner's real
// save folder and host are never touched.
//
//   node tests/cli-0153.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-cli0153-'));
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* temp */ } });
const results = [];
let failed = 0;
const check = (name, ok, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 200) : ''}`); if (!ok) failed += 1; };
const mk = (...p) => { const d = path.join(TMP, ...p); fs.mkdirSync(d, { recursive: true }); return d; };
const ENV = { ...process.env, PYTHONUTF8: '1', BW_UPDATE_TOKEN: 'none', BW_NO_BROWSER: '1', BW_RESET_KEEP_HOSTS: '1', BW_TEST_MODE: '1' };
const node = (file, args, env = {}, input) => spawnSync(process.execPath, [path.join(REPO, file), ...args], { encoding: 'utf8', env: { ...ENV, ...env }, input, timeout: 120000, windowsHide: true });
const cli = (args, env, input) => node('engine/cli.mjs', args, env, input);

// async variant: the fake host lives in THIS process, so a blocking spawnSync would starve it
const cliAsync = (args, env) => new Promise((ok) => { const c = spawn(process.execPath, [path.join(REPO, 'engine/cli.mjs'), ...args], { env: { ...ENV, ...env }, windowsHide: true }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => { stdout += d; }); c.stderr.on('data', (d) => { stderr += d; }); const t = setTimeout(() => c.kill(), 60000); c.on('close', (status) => { clearTimeout(t); ok({ status, stdout, stderr }); }); });

/* ── T9: the releases list, not releases/latest; a stale cache is refreshed; the cache age is shown ── */
{
  const local = mk('t9-local');
  const feed = path.join(TMP, 'releases.json');
  const rel = (v) => ({ tag_name: `v${v}`, html_url: `https://github.com/NJ-Burrito/Business-Wrap/releases/tag/v${v}`, draft: false, prerelease: false, body: `### Added\n- thing ${v}`, published_at: '2026-10-30T00:00:00Z', assets: [] });
  // the list is newest first on GitHub, but the flagged "latest" may lag: the picker must take the highest clean tag whatever the order
  fs.writeFileSync(feed, JSON.stringify([rel('0.13.3'), { ...rel('9.9.9'), prerelease: true }, rel('0.99.1'), rel('0.99.0')]));
  const env = { BW_LOCAL_DIR: local, BW_UPDATE_FEED: feed };
  let r = node('update/cli.mjs', ['update', '--check', '--json', '--force'], env);
  let j = JSON.parse(r.stdout || '{}');
  check('T9: a newer tag in the list is offered (never "latest" while one exists), pre-release skipped', j.status === 'available' && j.latest === '0.99.1', r.stdout + r.stderr);
  // a cached "current" answer from 7 hours ago is asked again (the old once-a-day cache said latest for a day)
  const cur = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
  const stale = { checkedAt: Date.now() - 7 * 3600e3, latest: null, forVersion: cur, feed: 'list-v2' };
  fs.writeFileSync(path.join(local, 'update-state.json'), JSON.stringify(stale));
  r = node('update/cli.mjs', ['update', '--check', '--json'], env); j = JSON.parse(r.stdout || '{}');
  check('T9: a cache older than the refresh interval is refreshed', j.status === 'available' && j.cached === false, r.stdout);
  // a cache from the old releases/latest feed (no feed key) is dropped, not trusted
  fs.writeFileSync(path.join(local, 'update-state.json'), JSON.stringify({ checkedAt: Date.now() - 60e3, latest: null, forVersion: cur }));
  r = node('update/cli.mjs', ['update', '--check', '--json'], env); j = JSON.parse(r.stdout || '{}');
  check('T9: a cache written by the old feed is not trusted', j.status === 'available', r.stdout);
  // a fresh cache is served and shows its age
  fs.writeFileSync(feed, JSON.stringify([rel('0.13.3')]));
  fs.writeFileSync(path.join(local, 'update-state.json'), JSON.stringify({ checkedAt: Date.now() - 2 * 3600e3, latest: null, forVersion: cur, feed: 'list-v2' }));
  r = node('update/cli.mjs', ['update', '--check', '--json'], env); j = JSON.parse(r.stdout || '{}');
  check('T9: a fresh cache is served with its age in hours', j.status === 'current' && j.cached === true && j.cacheAgeHours >= 1.9 && j.cacheAgeHours <= 2.2, r.stdout);
  r = node('update/cli.mjs', ['update', '--check'], env);
  check('T9: the human line says how old the answer is', /is the latest \(checked 2(\.\d)? h ago\)/.test(r.stdout), r.stdout);
}

/* ── T13: --help of every verb prints usage only: no process, no file ── */
{
  const state = mk('t13-state'); const local = mk('t13-local'); const ws = mk('t13-ws');
  const env = { BW_STATE_DIR: state, BW_LOCAL_DIR: local, BW_WORKSPACE: ws, BW_HOME_DIR: mk('t13-home') };
  const before = JSON.stringify([fs.readdirSync(state), fs.readdirSync(local), fs.readdirSync(ws)]);
  const verbs = ['open', 'close', 'status', 'new', 'build', 'harvest', 'import', 'export', 'gate', 'library', 'report', 'doctor', 'reset', 'editor', 'tidy', 'verify-history'];
  let allOk = true; const bad = [];
  for (const v of verbs) {
    const viaUpdate = node('update/cli.mjs', [v, '--help'], env); // the real entry of `business-wrap <verb>`
    const direct = cli([v, '--help'], env);
    if (!(viaUpdate.status === 0 && /business-wrap open/.test(viaUpdate.stdout) && direct.status === 0 && /business-wrap open/.test(direct.stdout))) { allOk = false; bad.push(`${v}: ${viaUpdate.status}/${direct.status}`); }
  }
  check('T13: every verb answers --help with usage and exit 0 (both entries)', allOk, bad.join(' '));
  check('T13: --help left no file and no host record in the state, local or save folder', JSON.stringify([fs.readdirSync(state), fs.readdirSync(local), fs.readdirSync(ws)]) === before, fs.readdirSync(state).join(','));
  check('T13: no host.json was written', !fs.existsSync(path.join(local, 'host.json')) && !fs.existsSync(path.join(state, 'host.json')));
}
{
  // open with no file: the last document of the library; a blank one only when the library is empty
  process.env.BW_WORKSPACE = mk('t13-lib');
  const { lastDocument, libraryDocs } = await import('../engine/cli.mjs');
  check('T13: an empty library has no last document (a blank one is then made)', lastDocument() === null);
  const docs = path.join(process.env.BW_WORKSPACE, 'Business-Wrap', 'المستندات - Documents');
  for (const [n, t] of [['خدمة قديمة', 1e6], ['خدمة أحدث', 2e6]]) { const d = path.join(docs, n); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, `${n}.html`); fs.writeFileSync(f, '<html></html>'); fs.utimesSync(f, new Date(Date.now() - 5e8 + t), new Date(Date.now() - 5e8 + t)); }
  check('T13: open with no file picks the newest document of the library', lastDocument()?.name === 'خدمة أحدث' && libraryDocs().length === 2, JSON.stringify(libraryDocs().map((d) => d.name)));
  delete process.env.BW_WORKSPACE;
}

/* ── T3: doctor lists every root; reset --dry-run lists, a real reset recycles, never without --yes ── */
{
  const home = mk('t3-home'); const local = mk('t3-local'); const state = local;
  const docs = mk('t3-home', 'Documents');
  const old = mk('t3-home', 'Downloads', 'Business-Wrap'); fs.writeFileSync(path.join(old, 'a.json'), '{}');
  const cur = mk('t3-home', 'Documents', 'Business-Wrap', '.system', 'library'); fs.writeFileSync(path.join(cur, 'lib.json'), '{}');
  fs.mkdirSync(path.join(docs, 'Business-Wrap', 'المستندات - Documents', 'خدمة'), { recursive: true });
  const prof = mk('t3-local', 'edge-profile', 'Default'); fs.writeFileSync(path.join(prof, 'IndexedDB'), 'x');
  const env = { BW_HOME_DIR: home, BW_LOCAL_DIR: local, BW_STATE_DIR: state, BW_WORKSPACE: docs };
  const d = cli(['doctor', '--json'], env);
  let dj = {}; try { dj = JSON.parse(d.stdout); } catch { /* shown below */ }
  const kinds = (dj.roots || []).filter((r) => r.exists).map((r) => `${r.kind}:${path.basename(r.path)}`);
  check('T3: doctor lists the old Downloads workspace, the Documents workspace + its .system, and the Edge profile', ['workspace:Business-Wrap', 'workspace-state:.system', 'edge-profile:edge-profile'].every((k) => kinds.includes(k)) && (dj.roots || []).some((r) => r.exists && r.kind === 'workspace' && /Downloads/.test(r.path)), `${d.stderr.slice(0, 150)} ${kinds.join(' ')}`);
  const dry = cli(['reset', '--dry-run', '--json'], env); const dr = JSON.parse(dry.stdout || '{}');
  check('T3: reset --dry-run lists the state folder (holding the Edge profile) and .system and changes nothing', dry.status === 0 && dr.dryRun && dr.items.some((i) => i.kind === 'state' && prof.startsWith(i.path)) && dr.items.some((i) => i.kind === 'workspace-state') && !dr.items.some((i) => i.kind === 'workspace') && fs.existsSync(prof) && fs.existsSync(cur), dry.stdout + dry.stderr);
  const dryAll = cli(['reset', '--all', '--dry-run', '--json'], env); const da = JSON.parse(dryAll.stdout || '{}');
  check('T3: reset --all --dry-run adds both whole workspaces (Documents and the old Downloads one)', da.items.filter((i) => i.kind === 'workspace').length === 2 && fs.existsSync(old), dryAll.stdout);
  const refuse = cli(['reset', '--all'], env, '');
  check('T3: without --yes and without a terminal reset refuses (exit 2) and changes nothing', refuse.status === 2 && fs.existsSync(old) && fs.existsSync(cur), `${refuse.status} ${refuse.stderr.slice(0, 160)}`);
  const unknown = cli(['reset', '--wipe'], env);
  check('T3: an unknown reset flag is an error (exit 2)', unknown.status === 2 && fs.existsSync(old), unknown.stderr.slice(0, 100));
  const real = cli(['reset', '--all', '--yes', '--json'], env); const rr = JSON.parse(real.stdout || '{}');
  check('T3: reset --all --yes sends every workspace and the profile to the Recycle Bin (gone from disk)', real.status === 0 && rr.failed === 0 && rr.recycled >= 3 && !fs.existsSync(old) && !fs.existsSync(path.join(docs, 'Business-Wrap')) && !fs.existsSync(prof), real.stdout + real.stderr);
  const after = cli(['reset', '--all', '--dry-run', '--json'], env);
  check('T3: nothing is left to list afterwards', JSON.parse(after.stdout || '{}').items?.length === 0, after.stdout);
}

/* ── T11 / T14: the editor verbs against a fake host ── */
{
  const calls = [];
  const modelDoc = JSON.parse(fs.readFileSync(path.join(REPO, 'samples', 'event-permit', 'document.en.json'), 'utf8'));
  let ptr = null;
  modelDoc.chapters.forEach((c, ci) => (c.sections || []).forEach((s, si) => (s.blocks || []).forEach((b, bi) => { if (!ptr && b.kind === 'diagram') ptr = { p: `/chapters/${ci}/sections/${si}/blocks/${bi}`, b }; })));
  let open = [{ id: 'D1', title: 'one' }, { id: 'D2', title: 'two' }];
  const srv = http.createServer((req, res) => {
    let s = ''; req.on('data', (c) => { s += c; });
    req.on('end', () => {
      const b = JSON.parse(s || '{}'); calls.push({ tool: b.tool, doc: b.doc, tab: b.tab, args: b.args });
      const send = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (b.tab === 'nope') return send(404, { ok: false, code: 'NO_TAB', error: 'tab nope is not connected' });
      if (b.tool === 'list') return send(200, { ok: true, result: { documents: open } });
      if (b.tool === 'get') return send(200, { ok: true, result: { value: b.args.pointer === ptr?.p ? ptr.b : { whole: true }, pointer: b.args.pointer || '', locale: 'en' } });
      if (b.tool === 'ops') return send(200, { ok: true, result: { applied: b.args.ops.length, group: 'g', opsLen: 41 } });
      send(200, { ok: true, result: {} });
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const env = { BW_HOST_URL: `http://127.0.0.1:${srv.address().port}`, BW_HOST_TOKEN: 't', BW_NO_AUTOSTART: '1', BW_LOCAL_DIR: mk('t11-local'), BW_STATE_DIR: mk('t11-state') };
  const jn = (r) => { try { return JSON.parse(r.stdout || r.stderr); } catch { return {}; } };

  let r = await cliAsync(['editor', 'get'], env);
  check('T11: get without --doc and several documents open is refused and lists them', r.status !== 0 && /2 documents are open/.test(r.stderr) && /"D1"/.test(r.stderr) && /"D2"/.test(r.stderr) && !calls.some((c) => c.tool === 'get'), r.stderr);
  open = [{ id: 'D1', title: 'one' }];
  r = await cliAsync(['editor', 'get', '--pointer', '/control'], env);
  check('T11: get without --doc and exactly one document open uses that one', r.status === 0 && calls.at(-1).tool === 'get' && calls.at(-1).doc === 'D1', JSON.stringify(calls.at(-1)));
  const pf = path.join(TMP, 'pointer.txt'); fs.writeFileSync(pf, '/chapters/0/title\n');
  r = await cliAsync(['editor', 'get', '--doc', 'D1', '--pointer-file', pf], env);
  check('T11: get --pointer-file sends that pointer (not the whole document)', r.status === 0 && calls.at(-1).args.pointer === '/chapters/0/title' && !jn(r).whole, JSON.stringify(calls.at(-1)));
  fs.writeFileSync(pf, JSON.stringify('/chapters/1'));
  r = await cliAsync(['editor', 'get', '--doc', 'D1', '--pointer-file', pf], env);
  check('T11: --pointer-file may hold a JSON string', calls.at(-1).args.pointer === '/chapters/1', JSON.stringify(calls.at(-1)));
  r = await cliAsync(['editor', 'get', '--doc', 'D1', '--tab', 'tab-7', '--pointer', '/control'], env);
  check('T11: --tab reaches the host as the tab of the call', r.status === 0 && calls.at(-1).tab === 'tab-7', JSON.stringify(calls.at(-1)));
  r = await cliAsync(['editor', 'get', '--doc', 'D1', '--tab', 'nope'], env);
  check('T11: an unknown tab is an error (NO_TAB), not a silent other tab', r.status !== 0 && /NO_TAB/.test(r.stderr), r.stderr);
  r = await cliAsync(['editor', 'get', '--doc', 'D1', '--wat', 'x'], env);
  check('T11: an unknown editor flag is rejected with exit 2', r.status === 2 && /unknown option --wat/.test(r.stderr), r.stderr);
  r = await cliAsync(['library', '--tab', 'x'], env);
  check('T11: --tab on a verb that cannot honour it is rejected, not ignored', r.status === 2 && /--tab/.test(r.stderr), r.stderr);

  const opsFile = path.join(TMP, 'ops.json'); fs.writeFileSync(opsFile, JSON.stringify({ locale: 'en', ops: [{ op: 'setText', path: '/control/title', value: 'a' }, { op: 'setText', path: '/control/subtitle', value: 'b' }] }));
  r = await cliAsync(['editor', 'ops', '--doc', 'D1', '--ops-file', opsFile], env); const oj = jn(r);
  check('T14: editor ops returns the batch size and applied count next to the undo depth', r.status === 0 && oj.batch === 2 && oj.applied === 2 && oj.undo_depth === 41 && oj.opsLen === 41, r.stdout + r.stderr);

  const png = path.join(TMP, 'fig.png');
  r = await cliAsync(['editor', 'render', '--doc', 'D1', '--pointer', ptr?.p || '/none', '--out', png], env);
  const rj = jn(r);
  check('T14: editor render writes a diagram PNG from a block pointer', !!ptr && r.status === 0 && fs.existsSync(png) && fs.statSync(png).size > 2000 && rj.width > 100, `${r.stderr.slice(0, 200)} ${r.stdout.slice(0, 120)}`);
  r = await cliAsync(['editor', 'render', '--doc', 'D1', '--pointer', '/control', '--out', png], env);
  check('T14: editor render refuses a pointer that is not a diagram block', r.status !== 0 && /not a diagram/.test(r.stderr), r.stderr);
  srv.close();
}

/* ── T15: folder names keep the whole name (to 100), cut on a word boundary, unique; the exported file fits the path limit ── */
{
  const W = await import('../engine/workspace.mjs');
  const ar = 'خدمة طلب إنجاز فاتورة استيراد مع مراجعة الاشتراطات الفنية والتفتيش الميداني قبل الإفراج الجمركي عن الشحنة الواردة';
  const en = 'Request to complete an import invoice with the technical requirements review and the field inspection before customs release';
  const a = W.titleStem(ar), e = W.titleStem(en);
  check('T15: a name between 80 and 100 characters is kept whole (was cut at 80)', W.titleStem(ar.slice(0, 95).replace(/\s\S*$/, '')).length > 80 && W.titleStem('x '.repeat(45).trim()).length === 89);
  check('T15: a longer Arabic name is cut at a word boundary (next char was a space), at most 100, no ellipsis', a.length <= 100 && a.length > 80 && /\s/.test(ar[a.length]) && !/[….]$/.test(a), `${a.length} ${a}`);
  check('T15: a longer English name is cut at a word boundary, at most 100', e.length <= 100 && e.length > 80 && /\s/.test(en[e.length]) && !/\s$/.test(e), `${e.length}`);
  check('T15: one very long word is cut on the character, still at most 100', W.titleStem('y'.repeat(300)).length === 100);
  // uniqueness: two documents whose names share the first 100 characters get two folders
  const docsDir = path.join(mk('t15', 'Business-Wrap'), W.DOCS_NAME); fs.mkdirSync(docsDir, { recursive: true });
  const t1 = `${en} first edition`, t2 = `${en} second edition`;
  const f1 = W.docFolder(docsDir, { ids: ['i1'], titles: [t1] }).folder, f2 = W.docFolder(docsDir, { ids: ['i2'], titles: [t2] }).folder;
  check('T15: two long names that share their first 100 characters keep two distinct folders', f1 !== f2 && f1.length <= 100 && f2.length <= 100 && f2.includes('(2)'), `${f1} | ${f2}`);
  const pdf = W.uniquePath(docsDir, W.outName(en, new Date(), 'en', 'pdf'));
  check('T15: the exported file lives in the document folder and the whole path stays under the Windows limit', pdf.startsWith(path.join(docsDir, e)) && pdf.length <= W.PATH_MAX && pdf.endsWith('.pdf'), `${pdf.length}`);
}

console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
