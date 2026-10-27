// Node side of the update check: token discovery, a once-a-day cache, the one-line notice for
// humans and agents, and the release notes split into a human summary and agent migration notes.
// Used by the CLI (update/cli.mjs), the local server (/api/update), the MCP server and the
// optional Claude Code SessionStart hook. Never throws; "can't check" is a normal answer.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkLatest, isNewer, parseNotes, extractNotes, parseVersion } from './core.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.env.BW_LOCAL_DIR || path.join(ROOT, '.local'); // BW_LOCAL_DIR: tests and read-only installs
export const STATE_FILE = path.join(LOCAL, 'update-state.json');
export const SETTINGS_FILE = path.join(LOCAL, 'update.json');
export const DAY_MS = 24 * 60 * 60 * 1000;

export const currentVersion = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const repoOf = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'update', 'source.json'), 'utf8')).repo;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n'); } catch { /* read-only install: no cache */ } };

/** User settings (gitignored .local/update.json): {check: true, hook: false}. Kept across updates. */
export function settings() {
  return { check: true, hook: false, ...readJson(SETTINGS_FILE, {}) };
}
export function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  writeJson(SETTINGS_FILE, s);
  return s;
}

/** A read-only token for the private repo: BW_UPDATE_TOKEN, else .local/update-token, else `gh auth token`. Never printed, never stored by us. */
export function token() {
  if (process.env.BW_UPDATE_TOKEN) return process.env.BW_UPDATE_TOKEN.trim();
  try { const t = fs.readFileSync(path.join(LOCAL, 'update-token'), 'utf8').trim(); if (t) return t; } catch { /* none */ }
  try {
    const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch { /* gh missing */ }
  return '';
}

/**
 * A mock feed for tests and offline previews: BW_UPDATE_FEED = a path to a release JSON (GitHub's
 * releases/latest shape). Returns a fetch() that answers with it.
 */
function feedFetch() {
  const feed = process.env.BW_UPDATE_FEED;
  if (!feed) return globalThis.fetch;
  return async () => {
    const body = fs.readFileSync(feed, 'utf8');
    return { ok: true, status: 200, headers: { get: () => '' }, json: async () => JSON.parse(body) };
  };
}

/** Split release notes into the human summary (Added/Changed/Fixed) and the agent-facing migration notes. */
export function splitNotes(text) {
  const t = String(text || '');
  const m = /^#{2,4}\s*(Migration notes|ملاحظات الترحيل)[^\n]*\n([\s\S]*?)(?=^#{2,4}\s|$(?![\s\S]))/im.exec(t);
  const migration = m ? m[2].split('\n').map((l) => l.replace(/^\s*[-*]\s+/, '').trim()).filter((l) => l && !/^<\/?div/.test(l)) : [];
  const human = parseNotes(m ? t.replace(m[0], '') : t);
  return { human, migration };
}

/**
 * @param {{force?: boolean, now?: number}} o
 * @returns {Promise<{status: 'available'|'current'|'unknown'|'off', current: string, latest?: string, url?: string,
 *   highlights?: string[], migration?: string[], checkedAt?: number, cached?: boolean}>}
 */
export async function checkForUpdate({ force = false, now = Date.now() } = {}) {
  const current = currentVersion();
  if (!force && !settings().check) return { status: 'off', current };
  const state = readJson(STATE_FILE, {});
  let next = state;
  let cached = true;
  if (force || !state.checkedAt || now - state.checkedAt >= DAY_MS || state.forVersion !== current) {
    next = await checkLatest({ repo: repoOf(), current, state: state.forVersion === current ? state : {}, token: token(), fetch: feedFetch(), now });
    cached = false;
    if (next) writeJson(STATE_FILE, { ...next, forVersion: current });
  }
  if (!next || (!next.checkedAt && !next.latest)) return { status: 'unknown', current };
  const l = next.latest;
  if (!l || !isNewer(l.version, current)) return { status: 'current', current, checkedAt: next.checkedAt, cached };
  const { human, migration } = splitNotes(l.notes);
  const highlights = human.flatMap((s) => s.items).slice(0, 3);
  return { status: 'available', current, latest: l.version, url: l.url, zip: l.zip, zipApi: l.zipApi, sha256: l.sha256, highlights, migration, checkedAt: next.checkedAt, cached };
}

/** The one line an agent or a terminal shows. AR or EN. Empty string when there is nothing to say. */
export function oneLiner(r, lang = 'en') {
  if (r.status !== 'available') return '';
  // CHANGELOG lines are "English / العربية": keep the side in the user's language, cut to one short line
  const side = (h) => { const p = String(h).split(' / '); const s = (lang === 'ar' ? p[p.length - 1] : p[0]).trim(); return s.length > 140 ? `${s.slice(0, 137)}…` : s; };
  const bullets = (r.highlights || []).map((h) => `  • ${side(h)}`).join('\n');
  return lang === 'ar'
    ? `يتوفر إصدار جديد من Business-Wrap: ‏${r.latest} (المثبت ${r.current}). للتحديث: npx business-wrap update --apply\n${bullets}`.trimEnd()
    : `Business-Wrap ${r.latest} is available (installed ${r.current}). To update: npx business-wrap update --apply\n${bullets}`.trimEnd();
}

/** What's new in the INSTALLED version (for the editor's what's-new panel and after an update). */
export function installedNotes() {
  const cl = fs.existsSync(path.join(ROOT, 'CHANGELOG.md')) ? fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8') : '';
  const v = currentVersion();
  return { version: v, ...splitNotes(extractNotes(cl, v) || '') };
}

export { isNewer, parseVersion };
