// Updates: the version logic, a mock release feed newer and older than this version, the CLI one-liner,
// the hook (prints only when enabled), the MCP initialize notice + once-per-session tool field, the
// install swap that keeps user files, user-data migration, the schema gate, version sync, AGENTS.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { isNewer, parseVersion, pickRelease, checkLatest, isReleaseZipUrl, extractNotes } from '../update/core.mjs';
import { swapInstall, migrateUserData } from '../update/apply.mjs';
import { migrate } from '../engine/edits.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUR = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).version;
const R = 'NJ-Burrito/Business-Wrap';
let fails = 0;
let n = 0;
const ok = (name, cond, info = '') => { n += 1; console.log(`${cond ? 'PASS' : 'FAIL'}  update: ${name}${info ? `  — ${info}` : ''}`); if (!cond) fails += 1; };
const bump = (v, i) => { const p = parseVersion(v); p[i] += 1; for (let k = i + 1; k < 3; k++) p[k] = 0; return p.join('.'); };
const NEWER = bump(CUR, 1);
const OLDER = '0.0.1';
const release = (tag, extra = {}) => ({
  tag_name: `v${tag}`, draft: false, prerelease: false, html_url: `https://github.com/${R}/releases/tag/v${tag}`, published_at: '2026-10-28T00:00:00Z',
  body: '### Added / أضيف\n- First highlight / الأول\n- Second highlight / الثاني\n- Third highlight / الثالث\n- Fourth\n\n### Migration notes / ملاحظات الترحيل\n- The command x was renamed y.\n',
  assets: [{ name: `business-wrap-${tag}.zip`, browser_download_url: `https://github.com/${R}/releases/download/v${tag}/business-wrap-${tag}.zip`, url: `https://api.github.com/repos/${R}/releases/assets/1`, digest: `sha256:${'a'.repeat(64)}` }],
  ...extra,
});
const res = (status, body, headers = {}) => ({ ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });

// core
ok('isNewer numeric (0.5.10 > 0.5.9)', isNewer('0.5.10', '0.5.9') && !isNewer('0.5.9', '0.5.10') && !isNewer('0.6.0', '0.6.0'));
ok('pre-release and junk never offered', !parseVersion('0.7.0-beta.1') && pickRelease(release('9.0.0', { prerelease: true }), R) === null && pickRelease(release('9.0.0', { draft: true }), R) === null);
ok('release zip URL: traversal and other repos refused', !isReleaseZipUrl(`https://github.com/${R}/releases/download/../../../../evil/x/releases/download/v9/x.zip`, R) && !isReleaseZipUrl('https://github.com/other/repo/releases/download/v9/x.zip', R) && isReleaseZipUrl(`https://github.com/${R}/releases/download/v9/business-wrap-9.zip`, R));
let s = await checkLatest({ repo: R, current: CUR, fetch: async () => res(200, release(NEWER), { etag: 'W/"1"' }), now: 1000 });
ok('feed NEWER than this version: offered', s?.latest?.version === NEWER && s.etag === 'W/"1"', JSON.stringify(s?.latest?.version));
s = await checkLatest({ repo: R, current: CUR, fetch: async () => res(200, release(OLDER)), now: 1000 });
ok('feed OLDER than this version: nothing offered', s && s.latest === null);
ok('404 without a token: quiet "can\'t check"', (await checkLatest({ repo: R, current: CUR, fetch: async () => res(404, {}) })) === null);
s = await checkLatest({ repo: R, current: CUR, fetch: async () => res(403, {}), now: 1000 });
ok('rate limit: backs off at least an hour', s.backoffUntil >= 1000 + 3600000);
ok('during backoff: no request at all', (await checkLatest({ repo: R, current: CUR, state: s, fetch: async () => { throw new Error('called'); }, now: 2000 })) === null);
let sent = null;
await checkLatest({ repo: R, current: CUR, token: 'tok', state: { etag: 'E' }, fetch: async (u, o) => { sent = o.headers; return res(304, {}); } });
ok('token rides as Bearer; ETag as If-None-Match', sent?.Authorization === 'Bearer tok' && sent['If-None-Match'] === 'E');
sent = 'unset';
s = await checkLatest({ repo: R, current: CUR, fetch: async (u, o) => { sent = o.headers; return res(200, release(NEWER)); }, now: 1000 });
ok('public repo, NO token: no Authorization header, newer release offered', sent && !('Authorization' in sent) && s?.latest?.version === NEWER);
let calls = [];
s = await checkLatest({ repo: R, current: CUR, token: 'stale', fetch: async (u, o) => { calls.push(o.headers.Authorization || ''); return calls.length === 1 ? res(401, {}) : res(200, release(NEWER)); }, now: 1000 });
ok('a refused token (401) is dropped and the check repeated anonymously', calls.length === 2 && calls[1] === '' && s?.latest?.version === NEWER);
s = await checkLatest({ repo: R, current: CUR, fetch: async () => res(200, release(NEWER, { prerelease: true })), now: 1000 });
ok('pre-release on releases/latest: nothing offered', s && s.latest === null);
s = await checkLatest({ repo: R, current: CUR, fetch: async () => res(429, {}, { 'retry-after': '7200' }), now: 1000 });
ok('rate limit 429 with retry-after: backs off 2 h', s.backoffUntil === 1000 + 7200000);
ok('bad digest: not trusted (sidecar .sha256 required instead)', pickRelease(release(NEWER, { assets: [{ ...release(NEWER).assets[0], digest: 'sha256:xyz' }] }), R).sha256 === '');
const { download, safeEntries } = await import('../update/apply.mjs');
let refusedRedirect = '';
try { await download(`https://github.com/${R}/releases/download/v9.0.0/business-wrap-9.0.0.zip`, { repo: R, f: async () => res(302, {}, { location: 'https://evil.example/x.zip' }) }); } catch (e) { refusedRedirect = e.message; }
ok('download: a redirect away from GitHub is refused', /redirected away/.test(refusedRedirect), refusedRedirect);
let hops = [];
const buf = await download(`https://api.github.com/repos/${R}/releases/assets/1`, { repo: R, tok: 't', f: async (u, o) => { hops.push(o.headers.Authorization || ''); return hops.length === 1 ? res(302, {}, { location: 'https://release-assets.githubusercontent.com/a?sig=1' }) : { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => new Uint8Array([1, 2]).buffer }; } });
ok('download: token only on the api.github.com hop, CDN hop anonymous', hops[0] === 'Bearer t' && hops[1] === '' && buf.length === 2);
ok('zip entries with .. or absolute paths refused before unpacking', !safeEntries(['a/../../x']) && !safeEntries(['/etc/x']) && !safeEntries(['C:/x']) && safeEntries(['business-wrap-1.0.0/package.json']));
ok('CHANGELOG section for this version exists', !!extractNotes(fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8'), CUR));

// CLI + hook with a mock feed (isolated state folder)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-upd-'));
const feedNew = path.join(tmp, 'feed-new.json');
const feedOld = path.join(tmp, 'feed-old.json');
fs.writeFileSync(feedNew, JSON.stringify(release(NEWER)));
fs.writeFileSync(feedOld, JSON.stringify(release(OLDER)));
const cli = (args, env) => spawnSync(process.execPath, [path.join(REPO, 'update', 'cli.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, BW_UPDATE_TOKEN: 'none', ...env } });
const envNew = { BW_UPDATE_FEED: feedNew, BW_LOCAL_DIR: path.join(tmp, 'local-new') };
let r = cli(['--check', '--lang', 'en'], envNew);
const lines = r.stdout.trim().split('\n');
ok('skill check prints the one-liner + 3 highlights', lines[0].includes(`Business-Wrap ${NEWER} is available`) && lines.length === 4 && lines[1].includes('First highlight') && !lines[1].includes('الأول'), lines[0]);
r = cli(['--check', '--lang', 'ar'], envNew);
ok('one-liner in Arabic keeps the Arabic side', r.stdout.includes('يتوفر إصدار جديد') && r.stdout.includes('الأول'));
r = cli(['--check', '--json'], envNew);
ok('cached: the second check makes no request', JSON.parse(r.stdout).cached === true && JSON.parse(r.stdout).migration[0] === 'The command x was renamed y.');
r = cli(['--check', '--force'], { BW_UPDATE_FEED: feedOld, BW_LOCAL_DIR: path.join(tmp, 'local-old') });
ok('older feed: "is the latest"', r.stdout.includes('is the latest'));
r = cli(['--hook'], envNew);
ok('hook prints nothing while disabled (default)', r.status === 0 && r.stdout.trim() === '');
cli(['--enable-hook'], envNew);
r = cli(['--hook'], envNew);
ok('hook prints one line once enabled', r.stdout.trim().split('\n').length === 1 && r.stdout.includes(NEWER));
r = cli(['--apply'], envNew);
ok('--apply without --yes changes nothing and asks', r.stdout.includes('--yes') && !fs.existsSync(`${REPO}.backup-${CUR}`));

// MCP: initialize instructions + update_available on the first tool result only
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(REPO, 'mcp', 'cli.mjs')], cwd: REPO, env: { ...process.env, ...envNew, BW_UPDATE_TOKEN: 'none' }, stderr: 'pipe' });
const client = new Client({ name: 'bw-update-test', version: '1.0.0' });
try {
  await client.connect(transport);
  const ins = client.getInstructions() || '';
  ok('MCP initialize instructions carry the notice', ins.includes(`UPDATE AVAILABLE: Business-Wrap ${NEWER}`) && ins.includes('consent'), ins.slice(0, 90));
  const a = await client.callTool({ name: 'check_fonts', arguments: {} });
  const b = await client.callTool({ name: 'check_fonts', arguments: {} });
  ok('update_available on the first tool result, once per session', a.structuredContent?.update_available?.latest === NEWER && !b.structuredContent?.update_available);
  const c = await client.callTool({ name: 'apply_update', arguments: {} });
  ok('apply_update without confirm asks first', c.structuredContent?.needs_confirmation === true && c.structuredContent?.applied === false);
  const d = await client.callTool({ name: 'check_update', arguments: {} });
  ok('check_update reports status + messages', d.structuredContent?.status === 'available' && d.structuredContent.message_ar.includes(NEWER));
} finally {
  await client.close();
}

// install swap keeps user files; user-data migration; schema gate
const inst = path.join(tmp, 'install');
const fresh = path.join(tmp, 'fresh');
const put = (base, rel, s) => { fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true }); fs.writeFileSync(path.join(base, rel), s); };
put(inst, 'engine/old-only.mjs', 'old');
put(inst, 'SKILL.md', 'old skill');
put(inst, '.local/config.json', '{"fontDir":"x"}');
put(inst, 'design/custom/mine/pack.json', '{}');
put(inst, 'logos/mine.svg', '<svg/>');
put(inst, 'drafts/a.edits.json', JSON.stringify([{ op: 'setText', path: '/control/title', value: 'x' }]));
put(fresh, 'SKILL.md', 'new skill');
put(fresh, 'engine/edits.mjs', fs.readFileSync(path.join(REPO, 'engine', 'edits.mjs'), 'utf8'));
const sw = await swapInstall(inst, fresh, CUR);
const read = (rel) => (fs.existsSync(path.join(inst, rel)) ? fs.readFileSync(path.join(inst, rel), 'utf8') : null);
ok('swap: product files replaced, removed files gone', sw.ok && read('SKILL.md') === 'new skill' && read('engine/old-only.mjs') === null);
ok('swap: settings, design packs, logos, drafts kept', read('.local/config.json') && read('design/custom/mine/pack.json') && read('logos/mine.svg') && read('drafts/a.edits.json'));
ok('swap: one backup of the old version kept', fs.existsSync(path.join(inst, '..', `install.backup-${CUR}`, 'SKILL.md')));
const mig = await migrateUserData(inst);
const migrated = JSON.parse(read('drafts/a.edits.json'));
ok('migration: v0 edits draft upgraded to v1 by the new engine', mig.length === 1 && migrated.version === 1 && Array.isArray(migrated.ops) && !('migratedFrom' in migrated));
let refused = '';
try { migrate({ version: 2, ops: [] }); } catch (e) { refused = e.message; }
ok('schema gate: a newer edits version is refused', /newer than this editor/.test(refused), refused);

// version sync + AGENTS.md lint
r = spawnSync(process.execPath, [path.join(REPO, 'update', 'version-sync.mjs')], { encoding: 'utf8' });
ok('version sync across package, plugin, marketplace, MCP, Smithery, READMEs, CHANGELOG', r.status === 0, r.stdout.trim() || r.stderr.trim());
const agents = fs.existsSync(path.join(REPO, 'AGENTS.md')) ? fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf8') : '';
const lint = [/^# /m.test(agents), agents.includes('business-wrap update --check'), /never update without the user's explicit consent/i.test(agents), agents.includes('check_update'), agents.includes('Migration notes'), !/\t/.test(agents), !/[ \t]+$/m.test(agents)];
ok('AGENTS.md exists and lints (heading, check command, consent, MCP tool, migration notes, no tabs/trailing spaces)', lint.every(Boolean), lint.join(','));
const hooks = JSON.parse(fs.readFileSync(path.join(REPO, 'hooks', 'hooks.json'), 'utf8'));
ok('plugin SessionStart hook calls the gated --hook mode', hooks.hooks.SessionStart[0].hooks[0].command.includes('--hook'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? `FAILED: update ${n - fails}/${n}` : `ALL PASS: update ${n}/${n}`);
process.exit(fails ? 1 : 0);
