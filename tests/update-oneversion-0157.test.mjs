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
const go = (dir, r, current, extra = {}) => { process.env.BW_UPDATE_ZIP = r.zip; process.env.BW_UPDATE_OLD_ZIP ??= path.join(tmp, 'no-such-old-release.zip'); /* offline: no listing unless a test names one */ return applyUpdate({ dir, release: info(r), repo: R, current, ...extra }); };
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
    ok('U4 .local as a whole is byte-identical (nothing changed; only the moved-aside copy of unlisted code files is added)', same(only(userBefore, (k) => k.startsWith('.local/')), only(after, (k) => k.startsWith('.local/') && !k.startsWith('.local/backups/removed-files-'))));
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
    process.env.BW_UPDATE_OLD_ZIP = path.join(tmp, 'no-such-old-release.zip');
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
    put(L.parent, 'business-wrap.backup-0.15.4/package.json', JSON.stringify({ name: 'business-wrap', version: '0.15.4' }));
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
    put(C.parent, `business-wrap.backup-${CUR}/package.json`, JSON.stringify({ name: 'business-wrap', version: CUR })); // the copy runs package.json first: that is how it is proven ours
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
    for (const v of ['0.15.5', '0.15.6']) put(cache, `${v}/.orphaned_at`, '1');
    const none = { processes: () => [] }; // no live session: the real lister is exercised in the F1 block below
    put(plugins, 'cache/mk/other-plugin/0.1.0/package.json', JSON.stringify({ name: 'other-plugin' }));
    put(plugins, 'cache/mk/other-plugin/0.0.9/package.json', JSON.stringify({ name: 'other-plugin' }));
    put(plugins, 'installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.7'), version: '0.15.7' }], 'other-plugin@mk': [{ installPath: path.join(plugins, 'cache/mk/other-plugin/0.1.0') }] } }));
    const run = pruneOldPluginVersions(path.join(cache, '0.15.7'), none);
    ok('U7 plugin: older Business-Wrap version folders are removed, the running one stays', run.removed.length === 2 && !fs.existsSync(path.join(cache, '0.15.5')) && !fs.existsSync(path.join(cache, '0.15.6')) && fs.existsSync(path.join(cache, '0.15.7/package.json')), JSON.stringify(run));
    ok('U7 plugin: another plugin\'s folders, a foreign package and a non-version folder are never touched', fs.existsSync(path.join(plugins, 'cache/mk/other-plugin/0.0.9/package.json')) && fs.existsSync(path.join(plugins, 'cache/mk/other-plugin/0.1.0/package.json')) && fs.existsSync(path.join(cache, '0.15.4/package.json')) && fs.existsSync(path.join(cache, 'notes/readme.txt')));
    const oldRun = pruneOldPluginVersions(path.join(cache, '0.15.4'), none);
    ok('U7 plugin: a path that is not <plugins>/cache/<marketplace>/business-wrap/<version>, or whose folder is not ours, does nothing', oldRun.removed.length === 0 && pruneOldPluginVersions(path.join(plugins, 'cache/mk/other-plugin/0.1.0'), none).removed.length === 0 && pruneOldPluginVersions(path.join(tmp, 'success', 'business-wrap'), none).removed.length === 0);
    put(cache, '0.15.8/package.json', JSON.stringify({ name: 'business-wrap', version: '0.15.8' }));
    put(plugins, 'installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.7') }, { installPath: path.join(cache, '0.15.6') }] } }));
    put(cache, '0.15.6/package.json', JSON.stringify({ name: 'business-wrap' }));
    put(cache, '0.15.7/.orphaned_at', '1');
    put(cache, '0.15.6/.orphaned_at', '1');
    const keep = pruneOldPluginVersions(path.join(cache, '0.15.8'), none);
    ok('U7 plugin: a version folder Claude Code still lists as installed is kept even when older', fs.existsSync(path.join(cache, '0.15.6')) && fs.existsSync(path.join(cache, '0.15.7')) && keep.removed.length === 0, JSON.stringify(keep));
    // the same through the launch path
    fs.writeFileSync(path.join(plugins, 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.8') }] } }));
    const viaLaunch = launchCleanup(path.join(cache, '0.15.8'), { force: true, processes: () => [] });
    ok('U7 plugin: the launch path prunes the same way (0.15.6 and 0.15.7 go once only 0.15.8 is listed)', viaLaunch.plugin.removed.length === 2 && !fs.existsSync(path.join(cache, '0.15.7')) && fs.existsSync(path.join(cache, '0.15.8/package.json')), JSON.stringify(viaLaunch));
    const pl = await applyUpdate({ dir: path.join(cache, '0.15.8'), release: info(rel1), repo: R, current: '0.15.8' });
    ok('U7 plugin: an in-place update of the plugin cache copy is still refused (Claude Code owns that folder)', !pl.ok && pl.plugin === true);
  }

  /* ── F1 (0.15.8): an older plugin folder with a live session inside it is kept, and removed at the next launch once the session ends ── */
  {
    const plugins = path.join(tmp, 'claude-f1', 'plugins');
    const cache = path.join(plugins, 'cache', 'mk', 'business-wrap');
    for (const v of ['0.15.6', '0.15.7', '0.15.8']) put(cache, `${v}/package.json`, JSON.stringify({ name: 'business-wrap', version: v }));
    put(cache, '0.15.7/.orphaned_at', '1');
    put(cache, '0.15.6/.orphaned_at', '1');
    put(cache, '0.15.50/package.json', JSON.stringify({ name: 'business-wrap', version: '0.15.50' })); // a newer look-alike name: never matched by 0.15.5
    put(plugins, 'installed_plugins.json', JSON.stringify({ version: 2, plugins: { 'business-wrap@mk': [{ installPath: path.join(cache, '0.15.8') }] } }));
    // a REAL child process whose command line sits inside the old folder (as a session's MCP server does)
    const holder = path.join(cache, '0.15.7', 'hold.mjs');
    fs.writeFileSync(holder, 'setInterval(() => {}, 1000);\n');
    const kid = spawn(process.execPath, [holder], { stdio: 'ignore', windowsHide: true });
    try {
      await new Promise((r2) => setTimeout(r2, 600));
      const procs = apply.listProcesses();
      ok('F1 ready state: the real process list is readable and shows the child inside the old folder', Array.isArray(procs) && procs.some((t) => apply.mentions(t, path.join(cache, '0.15.7'))), `${procs && procs.length}`);
      const first = launchCleanup(path.join(cache, '0.15.8'), { force: true });
      ok('F1 a live process inside 0.15.7: the folder stays, byte-for-byte; 0.15.6 (idle, orphaned) goes', first.plugin.busy.length === 1 && fs.existsSync(holder) && fs.existsSync(path.join(cache, '0.15.7/.orphaned_at')) && !fs.existsSync(path.join(cache, '0.15.6')), JSON.stringify(first.plugin));
    } finally {
      kid.kill();
      await new Promise((r2) => kid.exitCode !== null ? r2() : kid.once('exit', r2));
    }
    const second = launchCleanup(path.join(cache, '0.15.8'), { force: true });
    ok('F1 the session ended: the next launch removes 0.15.7 (one version is reached)', !fs.existsSync(path.join(cache, '0.15.7')) && second.plugin.removed.length === 1 && fs.existsSync(path.join(cache, '0.15.8/package.json')), JSON.stringify(second.plugin));
    ok('F1 a folder with a longer name (0.15.50) is not taken for 0.15.5 by the process match, and a not-readable process list keeps everything', !apply.mentions('node C:/x/0.15.50/a.js', 'C:/x/0.15.5') && apply.mentions('node "C:\\x\\0.15.5\\a.js"', 'C:/x/0.15.5') && apply.mentions('cwd C:/x/0.15.5', 'C:/x/0.15.5'));
    put(cache, '0.15.4/package.json', JSON.stringify({ name: 'business-wrap', version: '0.15.4' }));
    put(cache, '0.15.4/.orphaned_at', '1');
    const blind = pruneOldPluginVersions(path.join(cache, '0.15.8'), { processes: () => null });
    ok('F1 process list unreadable: nothing is removed', blind.removed.length === 0 && fs.existsSync(path.join(cache, '0.15.4/package.json')), JSON.stringify(blind));
    fs.rmSync(path.join(cache, '0.15.4/.orphaned_at'));
    const noMark = pruneOldPluginVersions(path.join(cache, '0.15.8'), { processes: () => [] });
    ok('F1 no .orphaned_at mark from Claude Code: the folder is kept even though unlisted', noMark.removed.length === 0 && fs.existsSync(path.join(cache, '0.15.4/package.json')), JSON.stringify(noMark));
  }

  /* ── F2 (0.15.8): a first update never deletes an unlisted file without a copy ── */
  {
    const mine = { 'engine/my-hack.mjs': 'export const mine = 1;\n', 'assets/my-logo-notes.txt': 'notes\n', 'tests/my.test.mjs': 'x' };
    const legacy = { 'legacy-shipped.txt': 'old release shipped this', 'engine/was-shipped-then-dropped.mjs': 'old' };
    // with the old release's listing: a listed file goes, an unlisted one stays where it is
    const W = scenario('f2-listing', { extra: { ...mine, ...legacy } });
    const w0 = tree(W.dir);
    const listZip = release(CUR, { add: { 'engine/was-shipped-then-dropped.mjs': 'listed', 'legacy-shipped.txt': 'listed' } });
    process.env.BW_UPDATE_OLD_ZIP = listZip.zip;
    const o1 = await go(W.dir, rel2, CUR);
    process.env.BW_UPDATE_OLD_ZIP = path.join(tmp, 'no-such-old-release.zip');
    const w1 = tree(W.dir);
    ok('F2 with a listing: a listed file is deleted, an unlisted file in a code folder stays in place, byte-identical, nothing moved', o1.ok && !fs.existsSync(path.join(W.dir, 'engine/was-shipped-then-dropped.mjs')) && Object.keys(mine).every((k) => w1[k] === w0[k]) && !o1.removedFiles && !fs.existsSync(path.join(W.dir, '.local/backups/removed-files-' + CUR)), JSON.stringify(o1));
    // with no listing: moved, path kept, hashes equal, the result names the folder and the count
    const N = scenario('f2-nolist', { extra: { ...mine, ...legacy } });
    const n0 = tree(N.dir);
    const o2 = await go(N.dir, rel2, CUR);
    const to = o2.removedFiles?.dir || '';
    const moved = Object.keys(n0).filter((k) => !k.startsWith('.local/') && !fs.existsSync(path.join(N.dir, k)) && (k.startsWith('engine/') || k.startsWith('assets/') || k.startsWith('tests/') || k.startsWith('hooks/') || k.startsWith('bible/') || k.startsWith('update/') || k.startsWith('editor/') || k.startsWith('mcp/') || k.startsWith('security/') || k.startsWith('evals/') || k.startsWith('.')));
    const gone = Object.keys(mine).concat('engine/was-shipped-then-dropped.mjs');
    ok('F2 no listing: ok, the result names the folder under .local/backups and the count', o2.ok && o2.removedFiles && to === path.join(N.dir, '.local', 'backups', `removed-files-${CUR}`) && o2.removedFiles.count >= gone.length && /moved, not deleted/.test(o2.message) && o2.message.includes(to), JSON.stringify(o2));
    ok('F2 no listing: every unlisted code file sits in that folder at its own path with the same hash (nothing was deleted)', gone.every((k) => fs.existsSync(path.join(to, k)) && sha(fs.readFileSync(path.join(to, k))) === n0[k]) && moved.every((k) => !fs.existsSync(path.join(N.dir, k)) ? fs.existsSync(path.join(to, k)) && sha(fs.readFileSync(path.join(to, k))) === n0[k] : true), to);
    ok('F2 no listing: the count equals the files in that folder; a root file and samples/docs/ files stay', fs.readdirSync(to, { recursive: true }).filter((x) => fs.statSync(path.join(to, x)).isFile() && x !== '.bw-removed.json').length === o2.removedFiles.count && Object.keys(UNKNOWN).every((k) => sha(fs.readFileSync(path.join(N.dir, k))) === sha(UNKNOWN[k])));
    // only the latest such folder stays
    put(N.dir, '.local/backups/removed-files-0.1.0/.bw-removed.json', '{}');
    put(N.dir, '.local/backups/removed-files-0.1.0/engine/old.mjs', 'older moved file');
    put(N.dir, '.local/backups/removed-files-mine/note.txt', 'the user\'s own folder with a look-alike name (no marker)');
    put(N.dir, 'engine/another-unlisted.mjs', 'again');
    const rel3 = release(bump(V2, 1));
    const o3 = await go(N.dir, rel3, V2); // this install has a manifest now: nothing moved; stage the no-manifest case by removing it
    ok('F2 with a manifest nothing is moved and the prior moved-aside folder is kept', o3.ok && !o3.removedFiles && fs.existsSync(to) && fs.existsSync(path.join(N.dir, 'engine/another-unlisted.mjs')), JSON.stringify(o3));
    const M = scenario('f2-latest', { extra: { 'engine/x1.mjs': 'x1' } });
    put(M.dir, '.local/backups/removed-files-0.1.0/.bw-removed.json', '{}');
    put(M.dir, '.local/backups/removed-files-0.1.0/engine/old.mjs', 'older moved file');
    put(M.dir, '.local/backups/removed-files-mine/note.txt', 'user folder, no marker');
    const o4 = await go(M.dir, rel2, CUR);
    ok('F2 only the latest moved-aside folder stays (an older marked one goes; a look-alike without our marker is never touched)', o4.ok && !fs.existsSync(path.join(M.dir, '.local/backups/removed-files-0.1.0')) && fs.existsSync(o4.removedFiles.dir) && fs.readFileSync(path.join(M.dir, '.local/backups/removed-files-mine/note.txt'), 'utf8') === 'user folder, no marker', JSON.stringify(o4));
    // a failed update puts every file back and leaves no aside folder
    const X = scenario('f2-fail', { extra: { ...mine } });
    const x0 = tree(X.dir);
    const o5 = await go(X.dir, rel2, CUR, { failAt: 'verify' });
    ok('F2 a failed update: every file back as before, no aside folder left, one version', !o5.ok && o5.rolledBack && same(tree(X.dir), x0) && !fs.existsSync(path.join(X.dir, `.local/backups/removed-files-${CUR}`)) && noBackups(X.parent), JSON.stringify(o5));
  }

  /* ── F3 (0.15.8): only proven leftovers go; look-alikes beside the install are byte-identical and never block an update ── */
  {
    const S = scenario('f3');
    const look = {
      'business-wrap.backup-mine/notes.txt': 'user folder',
      'business-wrap.backup-1.2.3/photos/a.jpg': 'not ours: other content, no marker, no package.json',
      'business-wrap.backup-1.2.4/package.json': JSON.stringify({ name: 'business-wrap', version: '9.9.9' }), // wrong version for its name
      'business-wrap.backup-1.2.5/package.json': JSON.stringify({ name: 'someone-elses', version: '1.2.5' }),
      'business-wrap.backup-1.2.6-data/taxes/2025.pdf': 'a user folder named like our data copy but holding other things',
      'business-wrap.backup-1.2.7-data/.local/a.json': '{}', // looks like our data copy (top level .local) ...
      'business-wrap.backup-1.2.7-data/photos/b.jpg': 'but holds a photos folder',
      'business-wrap.backup-1.2.8.9/package.json': JSON.stringify({ name: 'business-wrap', version: '1.2.8.9' }),
      'business-wrap.backup-/x.txt': 'x',
    };
    for (const [rel, c] of Object.entries(look)) put(S.parent, rel, c);
    // and the ones that ARE ours, beside them
    put(S.parent, `business-wrap.backup-1.1.1/package.json`, JSON.stringify({ name: 'business-wrap', version: '1.1.1' }));
    put(S.parent, `business-wrap.backup-1.1.2/anything.txt`, 'x');
    put(S.parent, `business-wrap.backup-1.1.2/${'.bw-rollback.json'}`, JSON.stringify({ phase: 'verified' }));
    put(S.parent, `business-wrap.backup-1.1.3-data/drafts/a.edits.json`, '{}');
    const before = tree(S.parent, ['business-wrap', 'business-wrap.backup-1.1.1', 'business-wrap.backup-1.1.2', 'business-wrap.backup-1.1.3-data']);
    const out = await go(S.dir, rel1, CUR);
    ok('F3 an update with look-alikes beside it succeeds, with no failure reported', out.ok && !out.leftover && !out.error, JSON.stringify(out));
    ok('F3 every look-alike is byte-identical (hashes), proven leftovers are gone', same(before, tree(S.parent, ['business-wrap'])) && !fs.existsSync(path.join(S.parent, 'business-wrap.backup-1.1.1')) && !fs.existsSync(path.join(S.parent, 'business-wrap.backup-1.1.2')), names(S.parent).join(','));
    const rec = recoverUpdateLeftovers(S.dir);
    ok('F3 recovery on its own: nothing removed, nothing failed, nothing reported for a look-alike', rec.removed.length === 0 && rec.failed.length === 0 && rec.rolledBack.length === 0 && same(before, tree(S.parent, ['business-wrap'])), JSON.stringify(rec));
    // a look-alike sitting at the exact name the rollback copy would take: not written into, not removed
    const T = scenario('f3-same-name');
    put(T.parent, `business-wrap.backup-${CUR}/photos/mine.jpg`, 'a user folder with the very name of the rollback copy');
    const t0 = tree(path.join(T.parent, `business-wrap.backup-${CUR}`));
    const o2 = await go(T.dir, rel1, CUR);
    ok('F3 a user folder at the very name of the rollback copy is never written into or deleted; the update still succeeds', o2.ok && versionOf(T.dir) === V1 && same(tree(path.join(T.parent, `business-wrap.backup-${CUR}`)), t0), JSON.stringify(o2));
    // launch cleanup behaves the same
    const L = scenario('f3-launch');
    for (const [rel, c] of Object.entries(look)) put(L.parent, rel, c);
    const l0 = tree(L.parent, ['business-wrap']);
    const lc = launchCleanup(L.dir, { force: true });
    ok('F3 launch cleanup leaves every look-alike alone', same(l0, tree(L.parent, ['business-wrap'])) && lc.leftovers.failed.length === 0, JSON.stringify(lc));
  }

  /* ── F4 (0.15.8): a path read from a marker or manifest never reaches outside what it names ── */
  {
    const S = scenario('f4');
    const victim = path.join(S.parent, 'victim');
    put(victim, 'precious.txt', 'not Business-Wrap\'s');
    put(S.dir, '.local/backups/update-migration-keep/note.txt', 'ours to keep');
    const v0 = tree(victim);
    const nested = path.join(S.dir, '.local', 'backups', 'update-migration-keep', 'deeper');
    const bak = `${S.dir}.backup-${CUR}`;
    const bads = [victim, path.join(S.dir, '.local', 'backups', 'update-migration-x', '..', '..', '..', 'victim'), path.join(S.dir, '.local', 'backups', 'other-name'), path.join(S.dir, '.local'), path.join(S.dir, 'drafts'), nested, S.dir];
    for (const [i, bad] of bads.entries()) {
      put(S.parent, 'business-wrap.backup-' + CUR + '/package.json', JSON.stringify({ name: 'business-wrap', version: CUR }));
      fs.writeFileSync(path.join(bak, '.bw-rollback.json'), JSON.stringify({ phase: 'replacing', from: CUR, pid: 0, incoming: ['../victim/precious.txt', '/etc/passwd', 'C:/Windows/x', '.local/config.json'], dataBackup: bad, backupsExisted: true })); // platform-guard: ok literal inside a tampered marker, never used as a real path
      if (!bad.includes('..')) fs.mkdirSync(bad, { recursive: true });
      const before = tree(S.dir);
      const rec = recoverUpdateLeftovers(S.dir);
      const after = tree(S.dir);
      ok('F4 tampered marker #' + i + ': nothing outside .local/backups/update-migration-* is touched (victim, drafts, .local and the kept copy byte-identical)', same(tree(victim), v0) && Object.keys(before).filter((k) => k.startsWith('.local/') || k.startsWith('drafts/')).every((k) => after[k] === before[k]) && fs.existsSync(path.join(S.dir, '.local/backups/update-migration-keep/note.txt')) && rec.rolledBack.length === 1, JSON.stringify(rec));
      fs.rmSync(bak, { recursive: true, force: true });
    }
    // a genuine marker still restores its own data copy
    const G = scenario('f4-good', { extra: { '.local/drafts/old.edits.json': JSON.stringify([{ op: 'setText', path: '/control/title', value: 'v0' }]) } });
    const g0 = tree(G.dir);
    const fresh = release(V1);
    const sw = await swapInstall(G.dir, fresh.root, CUR, { verify: async (d, { dataBackup }) => { await apply.migrateUserData(d, dataBackup); throw new Error('forced (test)'); } });
    ok('F4 a genuine marker (its own migration folder) still restores the edits file and removes that copy', !sw.ok && sw.rolledBack && same(tree(G.dir), g0), JSON.stringify(sw));
    // a tampered manifest naming a path through a link
    if (process.platform !== 'win32') {
      const L = scenario('f4-link');
      put(L.parent, 'outside/keep.txt', 'outside');
      fs.symlinkSync(path.join(L.parent, 'outside'), path.join(L.dir, 'engine', 'link'));
      put(L.dir, MANIFEST, JSON.stringify({ files: ['engine/link/keep.txt'] }));
      await go(L.dir, rel1, CUR);
      ok('F4 a manifest path through a link to elsewhere deletes nothing outside the install', fs.existsSync(path.join(L.parent, 'outside/keep.txt')));
    }
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
    const s8 = cl.slice(cl.indexOf('## [0.15.8]'), cl.indexOf('## [0.15.7]'));
    ok('U8/U9 the 0.15.8 CHANGELOG section exists in English and Arabic and names the three safety rules', s8.length > 100 && /[؀-ۿ]/.test(s8) && /orphan|process|running/i.test(s8) && /moved|copy/i.test(s8) && /look-alike|name/i.test(s8));
    ok('U9 the version is the package version where the release reads it', versionOf(REPO) === JSON.parse(read('package.json')).version && JSON.parse(read('.claude-plugin/plugin.json')).version === JSON.parse(read('package.json')).version && JSON.parse(read('mcp/server.json')).version === JSON.parse(read('package.json')).version);
    const bible = read('bible/07-updates.md') + read('bible/07-updates.ar.md');
    ok('U8 the bible pair states the 0.15.8 rules (orphaned mark and live process, moved-aside folder, exact leftover names, contained marker paths)', /.orphaned_at/.test(bible) && /removed-files-/.test(bible) && /backup-<semver>/.test(bible) && /update-migration-/.test(bible) && /[؀-ۿ]/.test(read('bible/07-updates.ar.md')) && /removed-files-/.test(read('bible/07-updates.ar.md')));
  }

  /* ── ENTRY_SMOKE: the CLI of a fake old install, then the editor's update route through a live serve.mjs ── */
  {
    const feed = (v, r) => { const f = path.join(tmp, `feed-${v}.json`); fs.writeFileSync(f, JSON.stringify({ tag_name: `v${v}`, draft: false, prerelease: false, html_url: `https://github.com/${R}/releases/tag/v${v}`, published_at: '2026-11-02T00:00:00Z', body: '### Added / أضيف\n- One version stays / تبقى نسخة واحدة\n', assets: [{ name: `business-wrap-${v}.zip`, browser_download_url: `https://github.com/${R}/releases/download/v${v}/business-wrap-${v}.zip`, url: `https://api.github.com/repos/${R}/releases/assets/1`, digest: `sha256:${r.sha256}` }] })); return f; };
    const S = scenario('smoke-cli');
    for (const [rel, c] of Object.entries({ 'business-wrap.backup-mine/notes.txt': 'user folder', 'business-wrap.backup-1.2.3/a.jpg': 'not ours', 'business-wrap.backup-1.2.6-data/taxes/x.pdf': 'not ours' })) put(S.parent, rel, c);
    const look0 = tree(S.parent, ['business-wrap']);
    const s0 = tree(S.dir);
    const cli = spawnSync(process.execPath, [path.join(S.dir, 'update', 'cli.mjs'), 'update', '--apply', '--yes'], { encoding: 'utf8', env: { ...process.env, BW_UPDATE_FEED: feed(V1, rel1), BW_UPDATE_ZIP: rel1.zip, BW_LOCAL_DIR: path.join(tmp, 'smoke-cli-state'), BW_UPDATE_TOKEN: 'none', BW_ASSUME_NPX: '' } });
    const line = cli.stdout.split('\n').find((l) => l.startsWith('{')) || '{}';
    const res = JSON.parse(line);
    ok('smoke CLI: `update --apply --yes` on the fake old install with look-alike folders beside it: exit 0, ok, new version, our copy gone and the look-alikes byte-identical, user data byte-identical', cli.status === 0 && res.ok && versionOf(S.dir) === V1 && same(look0, tree(S.parent, ['business-wrap'])) && Object.keys(USER).every((k) => tree(S.dir)[k] === s0[k]), cli.stdout + cli.stderr);

    // the editor's route: a live serve.mjs run FROM the fake install (its own files in use), on a free port
    const E = scenario('smoke-serve');
    put(E.parent, 'business-wrap.backup-mine/notes.txt', 'user folder');
    const elook0 = tree(E.parent, ['business-wrap']);
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
      ok('smoke serve: one version (the new one), no copy beside, user data byte-identical, the save folder untouched', versionOf(E.dir) === V1 && same(elook0, tree(E.parent, ['business-wrap'])) && Object.keys(USER).every((k) => tree(E.dir)[k] === e0[k]) && same(tree(E.save), (() => { const t = {}; for (const [rel, s] of Object.entries(SAVE)) t[rel] = sha(Buffer.isBuffer(s) ? s : Buffer.from(s)); return t; })()));
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
