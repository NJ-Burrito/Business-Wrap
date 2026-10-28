// Business-Wrap update check: pure helpers, no DOM and no Node API, so the CLI, the local server,
// the MCP server and the tests share one copy. Mirrors QA Wrap's extension/core/update-check.js
// (parseVersion / isNewer / validRepo / isReleaseZipUrl / pickRelease / checkLatest with ETag and
// rate-limit backoff) and extension/ui/update-lib.js (parseNotes).
//
// One anonymous GET of GitHub's public releases/latest for the repo in update/source.json (the repo is
// public, MIT): no token, no sign-in. An optional read-only token (BW_UPDATE_TOKEN or the gitignored
// .local/update-token) only lifts the anonymous rate limit; it is sent to api.github.com only, and a token
// GitHub refuses (401) is dropped and the check repeated without it. Every failure is silent: the answer is
// "can't check", never an error.

const REPO_RE = /^\w[\w.-]*\/\w[\w.-]*$/;
export const BACKOFF_MS = 60 * 60 * 1000;
const NOTES_MAX = 4000;

/** `v0.5.10` -> [0,5,10]; a pre-release (`0.6.0-beta.1`), a build tag or junk -> null (never offered). */
export function parseVersion(s) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s ?? '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True only when `latest` is a clean release strictly above `current` (numeric: 0.5.10 > 0.5.9). */
export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export const validRepo = (repo) => REPO_RE.test(String(repo ?? '')) && repo !== 'OWNER/REPO';

/** Only https://github.com/<repo>/releases/download/<tag>/<file>.zip, whole-string match, no `.`/`..` segment. */
export function isReleaseZipUrl(url, repo) {
  const s = String(url ?? '');
  if (!validRepo(repo) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/[\w.+-]+\/[\w.+-]+\.zip$/.test(s)) return false;
  if (s.slice('https://'.length).split('/').some((seg) => seg === '.' || seg === '..')) return false;
  return s.startsWith(`https://github.com/${repo}/releases/download/`);
}

/** GitHub's API address of one release asset of this repo (the token path); nothing else. */
export function isAssetApiUrl(url, repo) {
  const s = String(url ?? '');
  if (!validRepo(repo) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false;
  const m = /^https:\/\/api\.github\.com\/repos\/([\w.-]+\/[\w.-]+)\/releases\/assets\/\d+$/.exec(s);
  return !!m && m[1] === repo;
}

/** Where a release download may be redirected: this repo's release URL, or GitHub's asset CDN (*.githubusercontent.com). */
export function isAllowedRedirect(url, repo) {
  const s = String(url ?? '');
  if (isReleaseZipUrl(s, repo) || isReleaseZipUrl(s.replace(/\.sha256$/, ''), repo)) return true;
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.githubusercontent\.com\/\S*$/.test(s) && !/[\\@]/.test(s.split('?')[0]);
}

/** The release JSON -> what the notice needs, or null for a draft, a pre-release or a tag that is not a clean version. */
export function pickRelease(j, repo) {
  if (!j || j.draft || j.prerelease || !parseVersion(j.tag_name)) return null;
  const version = String(j.tag_name).replace(/^v/, '');
  const zips = (Array.isArray(j.assets) ? j.assets : []).filter((a) => isReleaseZipUrl(a?.browser_download_url, repo));
  const z = zips.find((a) => String(a?.name) === `business-wrap-${version}.zip`) || zips[0];
  const clean = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, NOTES_MAX);
  return {
    version,
    url: /^https:\/\/github\.com\//.test(String(j.html_url)) ? String(j.html_url) : `https://github.com/${repo}/releases/latest`,
    zip: z ? String(z.browser_download_url) : '',
    zipApi: isAssetApiUrl(z?.url, repo) ? String(z.url) : '',
    sha256: /^sha256:[0-9a-f]{64}$/.test(String(z?.digest)) ? String(z.digest).slice(7) : '',
    notes: clean(j.body),
    publishedAt: String(j.published_at || ''),
  };
}

/**
 * @returns {Promise<object|null>} the new state to keep ({etag, checkedAt, latest|null, backoffUntil?}),
 *   or null when nothing could be learned ("can't check": offline, no release yet, bad repo).
 * `token` is optional (the repo is public); a token GitHub refuses (401) is dropped and the request repeated without it.
 */
export async function checkLatest({ repo, current, state = {}, token = '', fetch: f = globalThis.fetch, now = Date.now() }) {
  if (!validRepo(repo) || !parseVersion(current) || typeof f !== 'function') return null;
  if (state?.backoffUntil > now) return null;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'business-wrap-update' };
  if (state?.etag) headers['If-None-Match'] = state.etag;
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    let res = await f(url, { method: 'GET', headers, cache: 'no-store', redirect: 'follow', signal });
    if (res.status === 401 && headers.Authorization) {
      try { res.body?.cancel?.(); } catch { /* already consumed */ }
      delete headers.Authorization;
      res = await f(url, { method: 'GET', headers, cache: 'no-store', redirect: 'follow', signal });
    }
    // a response whose body is never read keeps its socket open; release it so the process can exit cleanly
    const drop = () => { try { res.body?.cancel?.(); } catch { /* already consumed */ } };
    if (res.status === 304) { drop(); return { ...state, checkedAt: now }; }
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers?.get?.('x-ratelimit-reset')) * 1000 - now;
      const wait = Number(res.headers?.get?.('retry-after')) * 1000;
      drop();
      return { ...state, backoffUntil: now + Math.min(Math.max(wait || reset || BACKOFF_MS, BACKOFF_MS), 24 * BACKOFF_MS) };
    }
    if (!res.ok) { drop(); return null; }
    const rel = pickRelease(await res.json(), repo);
    return { etag: res.headers?.get?.('etag') || '', checkedAt: now, latest: rel && isNewer(rel.version, current) ? rel : null };
  } catch {
    return null;
  }
}

const kindOf = (s) => (/^(added|new|أضيف)/i.test(s) ? 'added' : /^(fixed|fixes|fix|أصلح)/i.test(s) ? 'fixed' : /^(changed|changes|improved|تغير)/i.test(s) ? 'changed' : '');
const cleanLine = (x) => x.replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, '$1').replace(/[*`<>]/g, '').trim();

/** Release-note text -> [{kind: added|changed|fixed|other, items}] in that order; plain text only, markup is dropped. */
export function parseNotes(text) {
  const by = { added: [], changed: [], fixed: [], other: [] };
  let cur = 'other';
  let count = 0;
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || count >= 60) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { cur = kindOf(cleanLine(h[1])) || 'other'; continue; }
    if (/^<\/?div/.test(line)) continue;
    const li = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const t = cleanLine(li ? li[1] : line);
    if (t) { by[cur].push(t); count += 1; }
  }
  return ['added', 'changed', 'fixed', 'other'].filter((k) => by[k].length).map((kind) => ({ kind, items: by[kind] }));
}

/** The CHANGELOG section of one version (`## [0.6.0] - date` or `## 0.6.0, date`), heading dropped; null when absent. */
export function extractNotes(changelog, version) {
  const v = String(version).trim().replace(/^v/, '');
  if (!parseVersion(v)) return null;
  const lines = String(changelog).replace(/\r\n?/g, '\n').split('\n');
  const head = new RegExp(`^##\\s+\\[?v?${v.replace(/\./g, '\\.')}\\]?(?:\\s*[,(–—-].*|\\s*)$`);
  const start = lines.findIndex((l) => head.test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim() || null;
}
