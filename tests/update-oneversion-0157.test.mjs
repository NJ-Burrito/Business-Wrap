// 0.15.7: after any successful update exactly ONE version of Business-Wrap is on the machine, with every setting,
// history, project, document and piece of work intact. The rollback copy lives only for the update (removed after
// verify, after a rollback, and by the next launch or update when a crash left one); a file the old release shipped
// and the new one does not goes anywhere in the install (manifest); a file no release shipped never goes; the
// migration's data copy is the one copy that stays, only the latest, under .local/backups/.
//
// Every scenario runs on temp folders only. The suite never touches a real install, plugin cache or Documents folder.
//   node tests/update-oneversion-0157.test.mjs
import './_isolate.mjs';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUR = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const R = 'NJ-Burrito/Business-Wrap';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-onever-'));
process.env.BW_LOCAL_DIR = path.join(tmp, 'state'); // the check cache of THIS process, never the real one
process.env.BW_UPDATE_TOKEN = 'none';
const { parseVersion } = await import('../update/core.mjs');
const apply = await import('../update/apply.mjs');
const { applyUpdate, swapInstall, recoverUpdateLeftovers, launchCleanup, pruneOldPluginVersions, readManifest, MANIFEST, KEEP, TAR } = apply;

let fails = 0;
let n = 0;
const ok = (name, cond, info = '') => { n += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  oneversion: ${name}${info && !cond ? `  — ${info}` : ''}`); if (!cond) fails += 1; };
const bump = (v, i) => { const p = parseVersion(v); p[i] += 1; for (let k = i + 1; k < 3; k++) p[k] = 0; return p.join('.'); };
const V1 = bump(CUR, 1);
const V2 = bump(V1, 1);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const put = (base, rel, s) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), s); };
/** rel -> sha256 of every file under dir; `skip` is a list of rel prefixes left out. */
function tree(dir, skip = [], base = dir, out = {}) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (skip.some((s) => rel === s || rel.startsWith(`${s}/`))) continue;
    if (e.isDirectory()) tree(p, skip, base, out);
    else out[rel] = sha(fs.readFileSync(p));
  }
  return out;
}
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const only = (t, test) => Object.fromEntries(Object.entries(t).filter(([k]) => test(k)));
const names = (d) => fs.readdirSync(d).sort();
const noBackups = (parent) => !names(parent).some((x) => /\.backup-/.test(x));

/* ── the template: this checkout's tracked files, once; every scenario copies it ── */
const files = spawnSync('git', ['-C', REPO, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.split('\n').filter((f) => f && fs.existsSync(path.join(REPO, f)));
const template = path.join(tmp, 'template');
for (const f of files) put(template, f, fs.readFileSync(path.join(REPO, f)));

/** The user's data in every place the updater promises to keep, plus files no release ever shipped. */
const USER = {
  '.local/config.json': '{"fontDir":"D:/fonts"}\n',
  '.local/update.json': '{"check":true,"hook":false}\n',
  '.local/learning/rules.json': '{"rules":["mine"]}\n',
  '.local/backups/history-1.json': '{"history":"backup"}\n',
  'node_modules/mine/index.js': 'module.exports = 1;\n',
  'out/my-service/my-service.editor.html': '<!doctype html><title>my work</title>',
  'out/my-service/exports/ar/my-service.ar.pdf': crypto.randomBytes(3000),
  'design/custom/mine/pack.json': '{"name":"mine"}',
  'logos/client.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'fonts/custom/MyFace.ttf': crypto.randomBytes(2048),
  'drafts/a.en.edits.json': JSON.stringify({ version: 1, document: 'a', baseHash: '', locale: 'en', ops: [{ op: 'setText', path: '/control/title', value: 'kept', id: 'g1.0' }] }),
  'exports/x.docx': crypto.randomBytes(512),
  'harvest/site/page.json': '{"url":"x"}',
  'profiles/me/profile.json': '{"name":"me"}',
};
/** Files no release ever shipped, outside the KEEP list: the user's, they stay byte-identical (the update never deletes them). */
const UNKNOWN = {
  'my-notes.txt': 'notes the user keeps next to the program\n',
  'my-service.editor.html': '<!doctype html><title>saved at the root</title>',
  'samples/mine/doc.ar.json': '{"control":{"title":"mine"},"chapters":[]}',
  'docs/my-own-notes.md': '# mine\n',
};
/** The save folder: outside the install (Documents by default). */
const SAVE = {
  'documents/contract.en.json': '{"control":{"title":"contract"},"chapters":[]}',
  'documents/contract.edits.json': '{"version":1}',
  'Versions/contract/v1.json': '{"v":1}',
  'Exports/contract.pdf': crypto.randomBytes(2048),
  'Sources/brief.docx': crypto.randomBytes(1024),
  'projects/p1/project.json': '{"p":1}',
  '.system/history/contract/0001.json': '{"h":1}',
  '.system/backups/contract-1.zip': crypto.randomBytes(512),
};

/** A fake old install (+ a save folder beside it) in its own parent folder. */
function scenario(name, { extra = {}, user = USER } = {}) {
  const parent = path.join(tmp, name);
  const dir = path.join(parent, 'business-wrap');
  fs.cpSync(template, dir, { recursive: true });
  for (const [rel, s] of Object.entries({ ...user, ...UNKNOWN, ...extra })) put(dir, rel, s);
  const save = path.join(tmp, `${name}-Documents`);
  for (const [rel, s] of Object.entries(SAVE)) put(save, rel, s);
  return { parent, dir, save };
}
/** A release zip as release.yml makes it. `drop` leaves tracked files out, `add` adds files. */
function release(version, { drop = [], add = {}, broken = false } = {}) {
  const top = path.join(tmp, `rel-${version}-${crypto.randomBytes(3).toString('hex')}`);
  const root = path.join(top, `business-wrap-${version}`);
  for (const f of files) if (!drop.includes(f)) put(root, f, fs.readFileSync(path.join(REPO, f)));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.version = version;
  put(root, 'package.json', JSON.stringify(pkg, null, 2) + '\n');
  for (const [rel, s] of Object.entries(add)) put(root, rel, s);
  if (broken) put(root, 'engine/edits.mjs', 'export const = ;\n');
  const zip = `${top}.zip`;
  const z = process.platform === 'win32' ? spawnSync(TAR, ['-a', '-cf', zip, '-C', top, `business-wrap-${version}`]) : spawnSync('zip', ['-qr', zip, `business-wrap-${version}`], { cwd: top });
  if (z.status !== 0) throw new Error(`zip failed: ${z.stderr}`);
  return { version, zip, sha256: sha(fs.readFileSync(zip)), root };
}
const info = (r) => ({ version: r.version, zip: `https://github.com/${R}/releases/download/v${r.version}/business-wrap-${r.version}.zip`, zipApi: '', sha256: r.sha256 });
const go = (dir, r, current, extra = {}) => { process.env.BW_UPDATE_ZIP = r.zip; return applyUpdate({ dir, release: info(r), repo: R, current, ...extra }); };
const versionOf = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;

try {
  const rel1 = release(V1, { add: { 'legacy-shipped.txt': 'shipped by V1', 'engine/only-in-v1.mjs': 'export const v1 = 1;\n', 'extra-docs/shipped-note.md': 'shipped by V1' } });
  const rel2 = release(V2, { add: { 'engine/only-in-v2.mjs': 'export const v2 = 1;\n' } }); // drops legacy-shipped.txt, extra-docs/ and engine/only-in-v1.mjs

  /* ── U1/U2/U4: success. The swap is in place, one version remains, user data and the save folder byte-identical ── */
  {
    const S = scenario('success', { extra: { 'engine/old-only.mjs': 'old', 'legacy-shipped.txt': 'old release shipped this' } });
    const stages = [];
    const userBefore = tree(S.dir, ['.local/backups'].slice(0, 0));
    const saveBefore = tree(S.save);
    const out = await go(S.dir, rel1, CUR, { onStage: (s) => stages.push(s), });
    ok('U1 success: ok, the folder says the new version', out.ok && versionOf(S.dir) === V1, JSON.stringify(out));
    ok('U1 the stages are unchanged for the editor (download, backup, replace, verify, done)', stages.join(',') === 'download,backup,replace,verify,done', stages.join(','));
    ok('U2 no .backup-* folder remains beside the install; the listing shows one version', noBackups(S.parent) && names(S.parent).join(',') === 'business-wrap', names(S.parent).join(','));
    ok('U2 the result no longer promises a kept backup', !('backup' in out));
    const after = tree(S.dir);
    const isUser = (k) => Object.keys(USER).includes(k) || Object.keys(UNKNOWN).includes(k);
    ok('U4 every KEEP path and every unknown user file is byte-identical (hashes)', Object.keys(userBefore).filter(isUser).every((k) => userBefore[k] === after[k]) && Object.keys(userBefore).filter((k) => KEEP.some((p) => k === p || k.startsWith(`${p}/`)) ).every((k) => userBefore[k] === after[k]));
    ok('U4 .local as a whole is byte-identical (nothing added, nothing changed)', same(only(userBefore, (k) => k.startsWith('.local/')), only(after, (k) => k.startsWith('.local/'))));
    ok('U4 the save folder (documents, Versions, Exports, Sources, projects, history, backups) is byte-identical', same(saveBefore, tree(S.save)));
    ok('U3 a file the old release dropped inside the code folders is gone', !fs.existsSync(path.join(S.dir, 'engine/old-only.mjs')));
    ok('U3 first update: a root file the new release ships is written over the old content', fs.readFileSync(path.join(S.dir, 'legacy-shipped.txt'), 'utf8') === 'shipped by V1');
    ok('U3 the update wrote the manifest of shipped files', Array.isArray(readManifest(S.dir)) && readManifest(S.dir).includes('engine/only-in-v1.mjs') && !readManifest(S.dir).some((p) => p.startsWith('.local')));
  }

  /* ── U3: a dropped file goes anywhere with the manifest; the first update uses the old zip's listing ── */
  {
    const S = scenario('manifest');
    await go(S.dir, rel1, CUR); // V1 ships legacy-shipped.txt and extra-docs/shipped-note.md
    put(S.dir, 'assets/user-extra.txt', 'a file in a code folder that no release ever shipped');
    put(S.dir, 'extra-docs/my-own.md', 'user file next to a shipped one');
    const before = tree(S.dir);
    const out = await go(S.dir, rel2, V1);
    const after = tree(S.dir);
    ok('U3 manifest: a file V1 shipped and V2 dropped is deleted at the root and in a non-code folder', out.ok && !fs.existsSync(path.join(S.dir, 'legacy-shipped.txt')) && !fs.existsSync(path.join(S.dir, 'extra-docs/shipped-note.md')) && !fs.existsSync(path.join(S.dir, 'engine/only-in-v1.mjs')), JSON.stringify(out));
    ok('U3 manifest: a file no release ever shipped stays byte-identical, even inside a code folder or beside a shipped one', after['assets/user-extra.txt'] === before['assets/user-extra.txt'] && after['extra-docs/my-own.md'] === before['extra-docs/my-own.md'] && Object.keys(UNKNOWN).every((k) => after[k] === before[k]));
    ok('U3 manifest rewritten for V2', readManifest(S.dir).includes('engine/only-in-v2.mjs') && !readManifest(S.dir).includes('legacy-shipped.txt'));
    ok('U2 still one version', noBackups(S.parent) && versionOf(S.dir) === V2);
    // a tampered manifest never reaches outside the install or into user data
    const evil = path.join(S.parent, 'outside.txt');
    fs.writeFileSync(evil, 'outside');
    put(S.dir, MANIFEST, JSON.stringify({ files: ['../outside.txt', 'C:/Windows/x', '.local/config.json', 'drafts/a.en.edits.json', 'logos/client.svg', 'my-notes.txt'] }));
    const h0 = tree(S.dir, [MANIFEST]);
    const rel3 = release(bump(V2, 1));
    const o3 = await go(S.dir, rel3, V2);
    const h1 = tree(S.dir, [MANIFEST]);
    ok('U3 a tampered manifest: the path outside the install and every KEEP path survive', o3.ok && fs.existsSync(evil) && ['.local/config.json', 'drafts/a.en.edits.json', 'logos/client.svg'].every((k) => h0[k] === h1[k]), JSON.stringify(o3));
    // first update, no manifest: the old release's zip listing is used (offline stand-in via BW_UPDATE_OLD_ZIP)
    const F = scenario('firstupdate', { extra: { 'legacy-shipped.txt': 'old release shipped this', 'extra-docs/shipped-note.md': 'old release shipped this too' } });
    process.env.BW_UPDATE_OLD_ZIP = rel1.zip; // pretend the CUR release zip listed these two files
    const o4 = await go(F.dir, rel2, CUR);
    delete process.env.BW_UPDATE_OLD_ZIP;
    const a4 = tree(F.dir);
    ok('U3 first update with the old zip listing: the two paths it lists are deleted, an unlisted root file stays', o4.ok && !fs.existsSync(path.join(F.dir, 'legacy-shipped.txt')) && !fs.existsSync(path.join(F.dir, 'extra-docs/shipped-note.md')) && a4['my-notes.txt'] === sha(UNKNOWN['my-notes.txt']), JSON.stringify(o4));
    const G = scenario('firstupdate-nolist', { extra: { 'legacy-shipped.txt': 'old release shipped this', 'engine/gone.mjs': 'x', 'assets/user-in-code-folder.txt': 'u' } });
    const o5 = await go(G.dir, rel2, CUR);
    ok('U3 first update, no listing obtainable: only CODE_ROOTS files go; a root file, samples/ and docs/ files stay', o5.ok && !fs.existsSync(path.join(G.dir, 'engine/gone.mjs')) && fs.existsSync(path.join(G.dir, 'legacy-shipped.txt')) && Object.keys(UNKNOWN).every((k) => fs.readFileSync(path.join(G.dir, k)).length > 0 && sha(fs.readFileSync(path.join(G.dir, k))) === sha(UNKNOWN[k])), JSON.stringify(o5));
  }

  /* ── U5: a failed replace and a failed verify roll back fully, then the copy is removed ── */
  for (const failAt of ['replace', 'verify']) {
    const S = scenario(`fail-${failAt}`, { extra: { 'engine/old-only.mjs': 'old' } });
    const b0 = tree(S.dir);
    const s0 = tree(S.save);
    const out = await go(S.dir, rel1, CUR, { failAt });
    ok(`U5 failed ${failAt}: not ok, rolled back, every file (program and data) exactly as before, hashes`, !out.ok && out.rolledBack && same(tree(S.dir), b0), JSON.stringify(out));
    ok(`U5 failed ${failAt}: the rollback copy is removed after the rollback; the listing shows one version`, noBackups(S.parent) && names(S.parent).join(',') === 'business-wrap' && same(tree(S.save), s0));
  }
  {
    const broken = release(V1, { broken: true });
    const S = scenario('fail-broken');
    const b0 = tree(S.dir);
    const out = await go(S.dir, broken, CUR);
    ok('U5 a release that does not load fails verify, the install is as it was, no copy remains', !out.ok && /does not load/.test(out.error) && same(tree(S.dir), b0) && noBackups(S.parent), out.error);
  }

  /* ── U6: a migration's data copy is the one copy that stays: latest only, under .local/backups/, never beside the install ── */
  {
    const v0 = JSON.stringify([{ op: 'setText', path: '/control/title', value: 'v0 draft' }]);
    const S = scenario('migrate', { extra: { '.local/drafts/old.edits.json': v0, '.local/backups/update-migration-0.9.0/old.txt': 'an older copy' } });
    const out = await go(S.dir, rel1, CUR);
    const copy = path.join(S.dir, '.local', 'backups', `update-migration-${CUR}`, '.local/drafts/old.edits.json');
    ok('U6 migrated: the file is v1 now, the copy holds the original v0 under .local/backups/', out.ok && out.migrated.length === 1 && JSON.parse(fs.readFileSync(path.join(S.dir, '.local/drafts/old.edits.json'), 'utf8')).version === 1 && fs.readFileSync(copy, 'utf8') === v0, JSON.stringify(out));
    const bk = names(path.join(S.dir, '.local', 'backups')).filter((x) => x.startsWith('update-migration-'));
    ok('U6 only the latest migration copy stays (the older one is gone); the other .local/backups files are untouched', bk.join(',') === `update-migration-${CUR}` && fs.existsSync(path.join(S.dir, '.local/backups/history-1.json')));
    ok('U6 no code copy and no data copy beside the install', noBackups(S.parent));
    // a failure after the migration put the original back and left no copy
    const T = scenario('migrate-fail', { extra: { '.local/drafts/old.edits.json': v0 } });
    const b0 = tree(T.dir);
    const fresh = release(V1);
    const sw = await swapInstall(T.dir, fresh.root, CUR, { verify: async (d, { dataBackup }) => { await apply.migrateUserData(d, dataBackup); throw new Error('forced failure after the migration (test)'); } });
    ok('U6 a failure after the migration: the v0 file is back exactly, the data copy is removed, the tree is as before', !sw.ok && sw.rolledBack && same(tree(T.dir), b0) && !fs.existsSync(path.join(T.dir, '.local/backups/update-migration-' + CUR)) && noBackups(T.parent), JSON.stringify(sw));
    // the old layout: a leftover `<dir>.backup-<v>-data` is moved under .local/backups/, never kept beside
    const L = scenario('legacy');
    put(L.parent, 'business-wrap.backup-0.15.5-data/.local/drafts/x.edits.json', v0);
    put(L.parent, 'business-wrap.backup-0.15.4/SKILL.md', 'an old kept backup of the previous layout');
    put(L.parent, 'business-wrap.backup-0.15.4-data/.local/drafts/y.edits.json', v0);
    const lo = await go(L.dir, rel1, CUR);
    ok('U2/U6 older leftovers of the old layout are gone beside the install; one data copy moved under .local/backups/', lo.ok && noBackups(L.parent) && names(path.join(L.dir, '.local/backups')).filter((x) => x.startsWith('update-migration-')).length === 1, names(L.parent).join(','));
  }

  /* ── U1/U5: a crash in the middle, then the next launch or update ── */
  {
    const child = (S, mode) => spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { swapInstall } from ${JSON.stringify(new URL('../update/apply.mjs', import.meta.url).href)};
      await swapInstall(${JSON.stringify(S.dir)}, ${JSON.stringify(rel1.root)}, ${JSON.stringify(CUR)}, { verify: async () => { process.exit(9); } });`], { encoding: 'utf8', env: { ...process.env } });
    const A = scenario('crash-launch', { extra: { 'engine/old-only.mjs': 'old' } });
    const a0 = tree(A.dir);
    const c = child(A);
    ok('crash: the process died inside the update (exit 9), the install is half replaced and a rollback copy sits beside it', c.status === 9 && fs.existsSync(`${A.dir}.backup-${CUR}`) && versionOf(A.dir) === V1, c.stderr);
    const l = launchCleanup(A.dir, { force: true });
    ok('crash then the next launch: rolled back first (never lose data), the copy removed, the tree exactly as before', l.leftovers.rolledBack.length === 1 && same(tree(A.dir), a0) && noBackups(A.parent), JSON.stringify(l));
    ok('launch cleanup is a no-op in test mode unless forced (a test can never touch a real install)', JSON.stringify(launchCleanup(A.dir)) === JSON.stringify({ leftovers: null, plugin: null }));
    const B = scenario('crash-update', { extra: { 'engine/old-only.mjs': 'old' } });
    const b0 = tree(B.dir);
    child(B);
    const out = await go(B.dir, rel2, CUR);
    ok('crash then the next update: the leftover is rolled back first, then the update succeeds with one version', out.ok && versionOf(B.dir) === V2 && noBackups(B.parent) && Object.keys(USER).every((k) => tree(B.dir)[k] === b0[k]), JSON.stringify(out));
    // a copy from a crash during the COPY (no marker) never touched the install: it is removed, the install is kept
    const C = scenario('crash-copy');
    put(C.parent, `business-wrap.backup-${CUR}/engine/half.mjs`, 'partial');
    const c0 = tree(C.dir);
    const rc = recoverUpdateLeftovers(C.dir);
    ok('crash while copying (no marker): the partial copy is removed, the install is untouched', rc.removed.length === 1 && same(tree(C.dir), c0) && noBackups(C.parent));
  }

  /* ── U5: a failed rollback keeps the copy and says where ── */
  {
    const S = scenario('rollback-fails', { extra: { 'engine/old-only.mjs': 'old' } });
    const fresh = release(V1);
    const out = await swapInstall(S.dir, fresh.root, CUR, { verify: async (d) => { fs.rmSync(path.join(d, 'engine/old-only.mjs'), { force: true }); fs.mkdirSync(path.join(d, 'engine/old-only.mjs')); fs.writeFileSync(path.join(d, 'engine/old-only.mjs/blocker'), 'x'); throw new Error('forced failure (test)'); } });
    ok('U5 a failed rollback: not ok, rollbackFailed, the copy is KEPT and its path is in the answer', !out.ok && out.rollbackFailed && out.backup === `${S.dir}.backup-${CUR}` && fs.existsSync(path.join(out.backup, 'engine/old-only.mjs')) && out.error.includes(out.backup), JSON.stringify(out));
    ok('U5 the user data is intact even then', Object.keys(USER).every((k) => sha(Buffer.isBuffer(USER[k]) ? USER[k] : Buffer.from(USER[k])) === tree(S.dir)[k]));
    const refuse = await go(S.dir, rel2, V1 === CUR ? CUR : CUR);
    ok('a next update does not start over a copy it cannot restore: it refuses and names the copy', !refuse.ok && refuse.rollbackFailed && /could not be restored/.test(refuse.error), JSON.stringify(refuse));
    fs.rmSync(path.join(S.dir, 'engine/old-only.mjs'), { recursive: true, force: true }); // the user clears the obstacle
    const rec = recoverUpdateLeftovers(S.dir);
    ok('with the obstacle gone the next launch finishes the rollback and removes the copy', rec.rolledBack.length === 1 && noBackups(S.parent) && fs.readFileSync(path.join(S.dir, 'engine/old-only.mjs'), 'utf8') === 'old', JSON.stringify(rec));
  }

  /* ── U7: plugin cache ── */
  {
    const plugins = path.join(tmp, 'claude', 'plugins');
    const cache = path.join(plugins, 'cache', 'mk', 'business-wrap');
    for (const v of ['0.15.5', '0.15.6', '0.15.7']) put(cache, `${v}/package.json`, JSON.stringify({ name: 'business-wrap', version: v }));
    put(cache, '0.15.4/package.json', JSON.stringify({ name: 'someone-else', version: '0.15.4' }));
    put(cache, 'notes/readme.txt', 'not a version folder');
    put(cache, '0.15.5/.orphaned_at', '1');
    put(plugins, 'cache/mk/other-plugin/0.1.0/package.json', JSON.stringify({ name: 'other-plugin' }));
    put(plugins, 'cache/mk/other-plugin/0.0.9/package.json', JSON.stringify({ name: 'other-plugin' }));
    put(plugins, 'installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.7'), version: '0.15.7' }], 'other-plugin@mk': [{ installPath: path.join(plugins, 'cache/mk/other-plugin/0.1.0') }] } }));
    const run = pruneOldPluginVersions(path.join(cache, '0.15.7'));
    ok('U7 plugin: older Business-Wrap version folders are removed, the running one stays', run.removed.length === 2 && !fs.existsSync(path.join(cache, '0.15.5')) && !fs.existsSync(path.join(cache, '0.15.6')) && fs.existsSync(path.join(cache, '0.15.7/package.json')), JSON.stringify(run));
    ok('U7 plugin: another plugin\'s folders, a foreign package and a non-version folder are never touched', fs.existsSync(path.join(plugins, 'cache/mk/other-plugin/0.0.9/package.json')) && fs.existsSync(path.join(plugins, 'cache/mk/other-plugin/0.1.0/package.json')) && fs.existsSync(path.join(cache, '0.15.4/package.json')) && fs.existsSync(path.join(cache, 'notes/readme.txt')));
    const oldRun = pruneOldPluginVersions(path.join(cache, '0.15.4'));
    ok('U7 plugin: a path that is not <plugins>/cache/<marketplace>/business-wrap/<version>, or whose folder is not ours, does nothing', oldRun.removed.length === 0 && pruneOldPluginVersions(path.join(plugins, 'cache/mk/other-plugin/0.1.0')).removed.length === 0 && pruneOldPluginVersions(path.join(tmp, 'success', 'business-wrap')).removed.length === 0);
    put(cache, '0.15.8/package.json', JSON.stringify({ name: 'business-wrap', version: '0.15.8' }));
    put(plugins, 'installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.7') }, { installPath: path.join(cache, '0.15.6') }] } }));
    put(cache, '0.15.6/package.json', JSON.stringify({ name: 'business-wrap' }));
    const keep = pruneOldPluginVersions(path.join(cache, '0.15.8'));
    ok('U7 plugin: a version folder Claude Code still lists as installed is kept even when older', fs.existsSync(path.join(cache, '0.15.6')) && fs.existsSync(path.join(cache, '0.15.7')) && keep.removed.length === 0, JSON.stringify(keep));
    // the same through the launch path
    fs.writeFileSync(path.join(plugins, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.8') }] } }));
    const viaLaunch = launchCleanup(path.join(cache, '0.15.8'), { force: true });
    ok('U7 plugin: the launch path prunes the same way (0.15.6 and 0.15.7 go once only 0.15.8 is listed)', viaLaunch.plugin.removed.length === 2 && !fs.existsSync(path.join(cache, '0.15.7')) && fs.existsSync(path.join(cache, '0.15.8/package.json')), JSON.stringify(viaLaunch));
    const pl = await applyUpdate({ dir: path.join(cache, '0.15.8'), release: info(rel1), repo: R, current: '0.15.8' });
    ok('U7 plugin: an in-place update of the plugin cache copy is still refused (Claude Code owns that folder)', !pl.ok && pl.plugin === true);
  }

  /* ── U8: messages and docs say the old version is replaced ── */
  {
    const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
    const promises = ['update/cli.mjs', 'update/release-notes.mjs', 'mcp/server.mjs', 'editor/update.js', 'editor/ux-i18n.json', 'bible/07-updates.md', 'bible/07-updates.ar.md', 'README.md', 'README.ar.md', 'SECURITY.md', 'SECURITY.ar.md'];
    const kept = promises.filter((f) => /one backup is kept|keeps ONE backup|keep ONE backup|a backup is taken before|نسخة احتياطية قبل أي تغيير|نسخة احتياطية كاملة واحدة|keeps one backup|backup is kept/i.test(read(f)));
    ok('U8 no shipped message, doc or note still promises a kept backup of the old version', kept.length === 0, kept.join(', '));
    const i18n = JSON.parse(read('editor/ux-i18n.json'));
    ok('U8 the editor says the old version is replaced, in Arabic and in English (the pair)', /يستبدل الإصدار القديم/.test(i18n.ar['set.dataSafe']) && /replaces the old version/.test(i18n.en['set.dataSafe']) && !/نسخة احتياطية قبل/.test(i18n.ar['set.dataSafe']) && !/a backup is taken/.test(i18n.en['set.dataSafe']));
    const cl = read('CHANGELOG.md');
    const sec = cl.slice(cl.indexOf('## [0.15.7]'), cl.indexOf('## [0.15.6]'));
    ok('U8/U9 the 0.15.7 CHANGELOG section exists in English and Arabic and says the old version is replaced', sec.length > 100 && /replace/i.test(sec) && /[؀-ۿ]/.test(sec) && /استبدال|يُستبدل|تستبدل/.test(sec));
    ok('U9 the version is 0.15.7 where the release reads it', versionOf(REPO) === '0.15.7' && JSON.parse(read('.claude-plugin/plugin.json')).version === '0.15.7' && JSON.parse(read('mcp/server.json')).version === '0.15.7');
  }

  /* ── ENTRY_SMOKE: the CLI of a fake old install, then the editor's update route through a live serve.mjs ── */
  {
    const feed = (v, r) => { const f = path.join(tmp, `feed-${v}.json`); fs.writeFileSync(f, JSON.stringify({ tag_name: `v${v}`, draft: false, prerelease: false, html_url: `https://github.com/${R}/releases/tag/v${v}`, published_at: '2026-11-02T00:00:00Z', body: '### Added / أضيف\n- One version stays / تبقى نسخة واحدة\n', assets: [{ name: `business-wrap-${v}.zip`, browser_download_url: `https://github.com/${R}/releases/download/v${v}/business-wrap-${v}.zip`, url: `https://api.github.com/repos/${R}/releases/assets/1`, digest: `sha256:${r.sha256}` }] })); return f; };
    const S = scenario('smoke-cli');
    const s0 = tree(S.dir);
    const cli = spawnSync(process.execPath, [path.join(S.dir, 'update', 'cli.mjs'), 'update', '--apply', '--yes'], { encoding: 'utf8', env: { ...process.env, BW_UPDATE_FEED: feed(V1, rel1), BW_UPDATE_ZIP: rel1.zip, BW_LOCAL_DIR: path.join(tmp, 'smoke-cli-state'), BW_UPDATE_TOKEN: 'none', BW_ASSUME_NPX: '' } });
    const line = cli.stdout.split('\n').find((l) => l.startsWith('{')) || '{}';
    const res = JSON.parse(line);
    ok('smoke CLI: `update --apply --yes` on the fake old install: exit 0, ok, new version, no copy beside, user data byte-identical', cli.status === 0 && res.ok && versionOf(S.dir) === V1 && noBackups(S.parent) && Object.keys(USER).every((k) => tree(S.dir)[k] === s0[k]), cli.stdout + cli.stderr);

    // the editor's route: a live serve.mjs run FROM the fake install (its own files in use), on a free port
    const E = scenario('smoke-serve');
    const e0 = tree(E.dir);
    const edHtml = path.join(tmp, 'smoke-serve-editor.html');
    const { buildEditor } = await import('../engine/build-editor.mjs');
    buildEditor({ inputs: [path.join(REPO, 'samples', 'event-permit')], out: edHtml, watermarkDir: '' });
    const env = { ...process.env, BW_SERVE_CHILD: '1', BW_UPDATE_FEED: feed(V1, rel1), BW_UPDATE_ZIP: rel1.zip, BW_LOCAL_DIR: path.join(tmp, 'smoke-serve-state'), BW_UPDATE_TOKEN: 'none' };
    const srv = spawn(process.execPath, [path.join(E.dir, 'engine', 'serve.mjs'), edHtml, '--port', '0', '--out', path.join(tmp, 'smoke-serve-out')], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let outText = '';
    srv.stdout.on('data', (d) => { outText += d; });
    srv.stderr.on('data', (d) => { outText += d; });
    const exited = new Promise((res2) => srv.on('exit', (code) => res2(code)));
    try {
      let port = 0;
      for (let i = 0; i < 150 && !port; i++) { await new Promise((r2) => setTimeout(r2, 100)); const m = /127\.0\.0\.1:(\d+)\//.exec(outText); if (m) port = Number(m[1]); }
      ok('smoke serve: the server from the fake install is up on a free port (never 4317)', port > 0 && port !== 4317, outText.slice(0, 300));
      const base = `http://127.0.0.1:${port}`;
      const ver = await (await fetch(`${base}/api/version`)).json();
      ok('smoke serve: ready state observed (the old version answers /api/version)', ver.version === CUR && ver.served === true, JSON.stringify(ver).slice(0, 200));
      const st = await fetch(`${base}/api/update/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"confirm":true}' });
      let p = {};
      for (let i = 0; i < 300 && !p.finished; i++) { await new Promise((r2) => setTimeout(r2, 100)); try { p = await (await fetch(`${base}/api/update/progress`)).json(); } catch { break; } }
      const code = await Promise.race([exited, new Promise((r2) => setTimeout(() => r2('still running'), 8000))]);
      ok('smoke serve: POST /api/update/apply while the host runs: 202, progress finished ok, the host exits to restart on the new code', st.status === 202 && p.finished === true && p.ok === true && typeof code === 'number', JSON.stringify({ status: st.status, p, code }));
      ok('smoke serve: one version (the new one), no copy beside, user data byte-identical, the save folder untouched', versionOf(E.dir) === V1 && noBackups(E.parent) && Object.keys(USER).every((k) => tree(E.dir)[k] === e0[k]) && same(tree(E.save), (() => { const t = {}; for (const [rel, s] of Object.entries(SAVE)) t[rel] = sha(Buffer.isBuffer(s) ? s : Buffer.from(s)); return t; })()));
    } finally {
      if (srv.exitCode === null) srv.kill();
    }
  }
} finally {
  delete process.env.BW_UPDATE_ZIP;
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(fails ? `FAILED: oneversion ${n - fails}/${n}` : `ALL PASS: oneversion ${n}/${n}`);
process.exit(fails ? 1 : 0);
