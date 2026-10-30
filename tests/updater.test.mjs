// The in-editor updater, server and install side (0.11.0): the local server's /api/version, /api/update/check,
// /api/update/apply and /api/update/progress with a mocked release feed (no network, no gh auth); a real apply of a
// fake newer release (program files replaced, every user file byte-identical, edits and history kept); forced
// failures and a broken release roll back to the exact previous tree; the stored-state migration (schema 1 → 2,
// forward-only, idempotent) and the re-wrap of a 0.9.1 and a 0.10.0 Save-HTML file in this version's editor.
//
//   node tests/updater.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUR = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const R = 'NJ-Burrito/Business-Wrap';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-updater-'));
// the update code reads these when it is loaded: an isolated state folder, a mocked feed, no token, no gh
process.env.BW_LOCAL_DIR = path.join(tmp, 'local');
process.env.BW_UPDATE_TOKEN = 'none';
const { parseVersion } = await import('../update/core.mjs');
const { applyUpdate, TAR } = await import('../update/apply.mjs');
const { migrateState, STATE_SCHEMA } = await import('../engine/edits.mjs');
const { rewrapEditorHtml, buildEditor } = await import('../engine/build-editor.mjs');
const { serve } = await import('../engine/serve.mjs');

let fails = 0;
let n = 0;
const ok = (name, cond, info = '') => { n += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  updater: ${name}${info && !cond ? `  — ${info}` : ''}`); if (!cond) fails += 1; };
const bump = (v, i) => { const p = parseVersion(v); p[i] += 1; for (let k = i + 1; k < 3; k++) p[k] = 0; return p.join('.'); };
const NEWER = bump(CUR, 1);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const put = (base, rel, s) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), s); };
/** rel -> sha256 of every file under dir (node_modules skipped). */
function tree(dir, base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) tree(p, base, out);
    else out[path.relative(base, p).split(path.sep).join('/')] = sha(fs.readFileSync(p));
  }
  return out;
}
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/* ── an install folder: this checkout's program files + user data in every place a user keeps it ── */
const files = spawnSync('git', ['-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.split('\n').filter((f) => f && fs.existsSync(path.join(REPO, f)));
function install(name) {
  const dir = path.join(tmp, name, 'business-wrap');
  for (const f of files) put(dir, f, fs.readFileSync(path.join(REPO, f)));
  const user = {
    '.local/config.json': '{"fontDir":"D:/fonts"}\n',
    '.local/update.json': '{"check":true,"hook":false}\n',
    '.local/drafts/old.edits.json': JSON.stringify([{ op: 'setText', path: '/control/title', value: 'v0 draft' }]),
    'drafts/a.en.edits.json': JSON.stringify({ version: 1, document: 'a', baseHash: '', locale: 'en', ops: [{ op: 'setText', path: '/control/title', value: 'kept', id: 'g1.0' }] }),
    'design/custom/mine/pack.json': '{"name":"mine"}',
    'logos/client.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'fonts/custom/MyFace.ttf': crypto.randomBytes(2048),
    'out/my-service/my-service.editor.html': '<!doctype html><title>my work</title>',
    'out/my-service/exports/ar/my-service.ar.pdf': crypto.randomBytes(4096),
    'exports/x.docx': crypto.randomBytes(512),
    'my-service.editor.html': '<!doctype html><title>saved at the root</title>',
    'samples/mine/doc.ar.json': '{"control":{"title":"mine"},"chapters":[]}',
  };
  for (const [rel, s] of Object.entries(user)) put(dir, rel, s);
  return { dir, user: Object.keys(user) };
}
/** The release zip as release.yml makes it (one top folder), with a changed engine file, a new file and a dropped one. */
function release(version, { broken = false } = {}) {
  const top = path.join(tmp, `rel-${version}${broken ? '-broken' : ''}`);
  const root = path.join(top, `business-wrap-${version}`);
  for (const f of files) if (f !== 'editor/README.md') put(root, f, fs.readFileSync(path.join(REPO, f)));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.version = version;
  put(root, 'package.json', JSON.stringify(pkg, null, 2) + '\n');
  put(root, 'engine/new-in-release.mjs', `export const v = '${version}';\n`);
  put(root, 'logos/README.md', 'a release never writes into logos/');
  if (broken) put(root, 'engine/edits.mjs', 'export const = ;\n'); // does not load: verify must refuse it
  const zip = path.join(tmp, `business-wrap-${version}${broken ? '-broken' : ''}.zip`);
  const z = process.platform === 'win32' ? spawnSync(TAR, ['-a', '-cf', zip, '-C', top, `business-wrap-${version}`]) : spawnSync('zip', ['-qr', zip, `business-wrap-${version}`], { cwd: top });
  if (z.status !== 0) throw new Error(`zip failed: ${z.stderr}`);
  return { zip, sha256: sha(fs.readFileSync(zip)) };
}
const relInfo = (version, r) => ({ version, zip: `https://github.com/${R}/releases/download/v${version}/business-wrap-${version}.zip`, zipApi: '', sha256: r.sha256 });

try {
  /* ── apply: a fake newer release replaces program files, user data byte-identical ── */
  const A = install('a');
  const before = tree(A.dir);
  const relA = release(NEWER);
  process.env.BW_UPDATE_ZIP = relA.zip;
  const stages = [];
  const res = await applyUpdate({ dir: A.dir, release: relInfo(NEWER, relA), repo: R, current: CUR, onStage: (s) => stages.push(s) });
  const after = tree(A.dir);
  ok('apply: ok, the folder now says the new version', res.ok && JSON.parse(fs.readFileSync(path.join(A.dir, 'package.json'), 'utf8')).version === NEWER, JSON.stringify(res));
  ok('apply: stages in order download → backup → replace → verify → done', stages.join(',') === 'download,backup,replace,verify,done', stages.join(','));
  ok('apply: a new program file arrives, a dropped one inside the code folders is removed', after['engine/new-in-release.mjs'] && !after['editor/README.md']);
  const dataSame = A.user.filter((f) => !f.endsWith('old.edits.json')).every((f) => before[f] && before[f] === after[f]);
  ok('apply: every user file byte-identical (settings, drafts, design packs, logos, fonts, out/, exports, root and samples documents)', dataSame, A.user.filter((f) => before[f] !== after[f]).join(', '));
  ok('apply: the release never writes into logos/ (its README is not copied over the user\'s folder)', !after['logos/README.md'] || after['logos/README.md'] === before['logos/README.md']);
  const mig = JSON.parse(fs.readFileSync(path.join(A.dir, '.local/drafts/old.edits.json'), 'utf8'));
  ok('apply: a v0 edits draft is migrated by the NEW engine, its op kept; the backup holds the original', res.migrated?.length === 1 && mig.version === 1 && mig.ops[0].value === 'v0 draft' && fs.readFileSync(path.join(`${A.dir}.backup-${CUR}`, '.local/drafts/old.edits.json'), 'utf8').startsWith('['));
  ok('apply: one backup of the previous version, user data included', fs.existsSync(path.join(`${A.dir}.backup-${CUR}`, 'package.json')) && fs.existsSync(path.join(`${A.dir}.backup-${CUR}`, 'fonts/custom/MyFace.ttf')));

  /* ── forced failures and a broken release: the exact previous tree comes back ── */
  for (const failAt of ['replace', 'verify']) {
    const B = install(`b-${failAt}`);
    const b0 = tree(B.dir);
    const r = await applyUpdate({ dir: B.dir, release: relInfo(NEWER, relA), repo: R, current: CUR, failAt });
    ok(`rollback: failure in ${failAt} → not ok, rolled back, every file (program and data) as before`, !r.ok && r.rolledBack && same(tree(B.dir), b0), r.error);
  }
  const broken = release(NEWER, { broken: true });
  process.env.BW_UPDATE_ZIP = broken.zip;
  const C = install('c');
  const c0 = tree(C.dir);
  let r = await applyUpdate({ dir: C.dir, release: relInfo(NEWER, broken), repo: R, current: CUR });
  ok('rollback: a release that does not load fails verify and leaves the install as it was', !r.ok && /does not load/.test(r.error) && same(tree(C.dir), c0), r.error);
  r = await applyUpdate({ dir: C.dir, release: { ...relInfo(NEWER, broken), sha256: 'b'.repeat(64) }, repo: R, current: CUR });
  ok('checksum mismatch: refused before anything changes', !r.ok && /checksum/.test(r.error) && same(tree(C.dir), c0));

  /* ── the server endpoints, mocked feed ── */
  const D = install('d');
  const feed = (v) => { const f = path.join(tmp, `feed-${v}.json`); fs.writeFileSync(f, JSON.stringify({ tag_name: `v${v}`, draft: false, prerelease: false, html_url: `https://github.com/${R}/releases/tag/v${v}`, published_at: '2026-10-28T00:00:00Z', body: '### Added / أضيف\n- Settings page / صفحة الإعدادات\n- <img src=x onerror=alert(1)> **bold** / عريض\n\n### Fixed / أصلح\n- A fix / إصلاح\n', assets: [{ name: `business-wrap-${v}.zip`, browser_download_url: `https://github.com/${R}/releases/download/v${v}/business-wrap-${v}.zip`, url: `https://api.github.com/repos/${R}/releases/assets/1`, digest: `sha256:${relA.sha256}` }] })); return f; };
  process.env.BW_UPDATE_ZIP = relA.zip;
  process.env.BW_UPDATE_FEED = feed(NEWER);
  const ed = path.join(tmp, 'served', 'e.html');
  buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: ed, watermarkDir: '' });
  let restarted = 0;
  const srv = await serve(ed, 0, { installDir: D.dir, onUpdated: () => { restarted += 1; } });
  const base = `http://127.0.0.1:${srv.address().port}`;
  const get = async (p, h = {}) => { const x = await fetch(base + p, { headers: h }); return { status: x.status, j: await x.json() }; };
  let g = await get('/api/version');
  ok('GET /api/version: name, version, release date, repo, licence', g.status === 200 && g.j.version === CUR && g.j.name === 'Business-Wrap' && /github\.com/.test(g.j.repo) && g.j.license && g.j.served === true, JSON.stringify(g.j).slice(0, 200));
  g = await get('/api/update/check?force=1');
  ok('GET /api/update/check, newer feed: available, notes split into sections', g.j.status === 'available' && g.j.latest === NEWER && g.j.notes?.human?.length === 2, JSON.stringify(g.j).slice(0, 300));
  ok('check answer carries no download address and no token', !('zip' in g.j) && !('zipApi' in g.j) && !('sha256' in g.j) && !JSON.stringify(g.j).includes('none'));
  ok('release notes reach the editor as plain text (markup dropped)', !JSON.stringify(g.j.notes).includes('<img') && !JSON.stringify(g.j.notes).includes('**'));
  process.env.BW_UPDATE_FEED = feed(CUR);
  g = await get('/api/update/check?force=1');
  ok('same version in the feed: current', g.j.status === 'current');
  process.env.BW_UPDATE_FEED = feed('0.0.1');
  g = await get('/api/update/check?force=1');
  ok('older version in the feed: current', g.j.status === 'current');
  process.env.BW_UPDATE_FEED = path.join(tmp, 'missing-feed.json');
  g = await get('/api/update/check?force=1');
  ok('feed unreachable: unknown, with a reason for Settings', g.j.status === 'unknown' && !!g.j.reason, JSON.stringify(g.j));
  ok('another origin is refused', (await get('/api/update/check', { origin: 'https://evil.example' })).status === 403 && (await fetch(`${base}/api/update/apply`, { method: 'POST', headers: { origin: 'null', 'content-type': 'application/json' }, body: '{"confirm":true}' })).status === 403);
  ok('apply without confirm: 400, nothing starts', (await fetch(`${base}/api/update/apply`, { method: 'POST', body: '{}' })).status === 400);
  process.env.BW_UPDATE_FEED = feed(NEWER);
  const d0 = tree(D.dir);
  const st = await fetch(`${base}/api/update/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"confirm":true}' });
  const sj = await st.json();
  const seen = new Set();
  let p = {};
  for (let i = 0; i < 200 && !p.finished; i++) { await new Promise((ok2) => setTimeout(ok2, 100)); p = (await get('/api/update/progress')).j; seen.add(p.stage); }
  ok('POST /api/update/apply: 202, the job runs on, progress reaches done', st.status === 202 && sj.to === NEWER && p.finished && p.ok && p.stage === 'done', JSON.stringify(p));
  await new Promise((ok2) => setTimeout(ok2, 1700));
  const d1 = tree(D.dir);
  ok('served update: user data byte-identical, version replaced, restart requested once', D.user.filter((f) => !f.endsWith('old.edits.json')).every((f) => d0[f] === d1[f]) && restarted === 1 && (await get('/api/version')).j.version === NEWER);
  srv.close();
  srv.closeAllConnections?.();

  /* ── the stored-state migration and old Save-HTML files ── */
  const v1 = { v: 1, at: '2026-09-01T00:00:00Z', svc: { s: { ar: { hash: 'h', ops: [{ op: 'setText', path: '/control/title', value: 'x', id: 'g1.0' }, { op: 'setText', path: '/a', value: 'no id' }, null], status: { 'g1.0': 'approved' } } } } };
  const m1 = migrateState(v1);
  const m2 = migrateState(m1.state);
  ok(`migration: schema 1 → ${STATE_SCHEMA}, fields filled, ops kept with ids, status kept`, m1.from === 1 && m1.state.v === STATE_SCHEMA && m1.state.svc.s.ar.ops.length === 2 && m1.state.svc.s.ar.ops.every((o) => o.id) && m1.state.svc.s.ar.status['g1.0'] === 'approved' && Array.isArray(m1.state.svc.s.ar.comments));
  ok('migration: idempotent (twice = once, nothing to change the second time)', JSON.stringify(m2.state) === JSON.stringify(m1.state) && !m2.changed);
  let refused = '';
  try { migrateState({ v: STATE_SCHEMA + 1 }); } catch (e) { refused = e.message; }
  ok('migration: forward-only, a newer schema is refused', /newer than this editor/.test(refused));
  for (const ver of ['0.9.1', '0.10.0']) {
    const html = zlib.gunzipSync(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'saved', `${ver}.editor.html.gz`))).toString('utf8');
    const dOf = (h) => JSON.parse(/<script type="application\/json" id="bw-data">([\s\S]*?)<\/script>/.exec(h)[1]);
    const old = dOf(html);
    const neu = dOf(rewrapEditorHtml(html));
    const e0 = old.services[0].editions.ar;
    const e1 = neu.services[0].editions.ar;
    ok(`${ver} Save-HTML re-wrapped in ${CUR}: same set, documents, edits, comments and snapshots`, old.version === ver && neu.version === CUR && neu.setId === old.setId && e1.raw === e0.raw && JSON.stringify(e1.ops) === JSON.stringify(e0.ops) && e1.comments.length === 1 && e1.versions.length === 1 && e0.ops.some((o) => /FIXTURE EDIT/.test(o.value)));
  }
  const curHtml = fs.readFileSync(ed, 'utf8');
  ok('an editor of this version is served unchanged', rewrapEditorHtml(curHtml) === curHtml);
} finally {
  delete process.env.BW_UPDATE_ZIP;
  delete process.env.BW_UPDATE_FEED;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails ? `FAILED: updater ${n - fails}/${n}` : `ALL PASS: updater ${n}/${n}`);
process.exit(fails ? 1 : 0);
