// Healers (0.13.0 B4). House rule: only locators and waits heal in a browser walk; a few environment faults
// heal outside it (port busy, stale host record, library schema, missing workspace folder, missing font).
// Every heal appends one HEALED line to .local/heal-log.jsonl and the step reports HEALED, never PASS.
// Gates never heal: a gate failure, a hash/signature failure or a missing document code fails loud (refuse()).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { REPO } from '../export.mjs';
import { localBase } from '../testguard.mjs';

export const STATE_DIR = () => path.resolve(process.env.BW_STATE_DIR || localBase(REPO));
export const HEAL_LOG = () => process.env.BW_HEAL_LOG || path.join(STATE_DIR(), 'heal-log.jsonl');
/** What may never heal: the run fails, no heal is attempted, nothing is logged as HEALED. */
export const NEVER_HEAL = ['gate', 'hash', 'signature', 'document-code'];
/** Thmanyah is the only fallback face (Cairo is banned, never a fallback). */
export const FALLBACK_FONT = 'Thmanyah Serif Text';

export function logHeal(stage, name, detail = {}) {
  const row = { at: new Date().toISOString(), verdict: 'HEALED', stage, name, ...detail };
  fs.mkdirSync(path.dirname(HEAL_LOG()), { recursive: true });
  fs.appendFileSync(HEAL_LOG(), JSON.stringify(row) + '\n');
  return row;
}
export const readHealLog = () => (fs.existsSync(HEAL_LOG()) ? fs.readFileSync(HEAL_LOG(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** A failure no healer may touch. Throws an Error marked FAIL. */
export function refuse(kind, message) {
  if (!NEVER_HEAL.includes(kind)) throw new Error(`refuse(): ${kind} is not a never-heal kind`);
  const e = new Error(`FAIL ${kind}: ${message}`);
  e.verdict = 'FAIL';
  e.kind = kind;
  throw e;
}

/* ── browser walk: locators ── */
/**
 * The primary locator, else one fallback in this order: role+name, text, label. A fallback must match exactly one
 * element; none or several = a structural change, which fails (never guessed). `page` is a Playwright page.
 */
export async function healLocator(page, { selector, role, name, text, label }, { stage = 'crawl' } = {}) {
  if (selector) { const l = page.locator(selector).first(); if (await l.count()) return { locator: l, healed: false }; }
  const tries = [
    role && name && ['role+name', () => page.getByRole(role, { name, exact: true })],
    text && ['text', () => page.getByText(text, { exact: true })],
    label && ['label', () => page.getByLabel(label, { exact: true })],
  ].filter(Boolean);
  for (const [how, make] of tries) {
    const l = make();
    const n = await l.count();
    if (n === 1) { logHeal(stage, 'locator', { from: selector || null, by: how }); return { locator: l, healed: true }; }
    if (n > 1) break; // ambiguous: a structural change
  }
  const e = new Error(`FAIL locator: ${selector || role || text || label} not found (structural change, not healed)`);
  e.verdict = 'FAIL';
  throw e;
}

/* ── browser walk: waits ── */
/** Run `fn(timeout)`; on a timeout extend once to `ceiling`, then fail. Any other error is not a wait and is rethrown. */
export async function healWait(fn, { base = 10000, ceiling = 30000, stage = 'crawl', what = 'wait' } = {}) {
  try { return { value: await fn(base), healed: false }; } catch (e) {
    if (!/timeout/i.test(`${e?.name} ${e?.message}`) || ceiling <= base) throw e;
  }
  const value = await fn(ceiling); // a second timeout fails the step
  logHeal(stage, 'wait', { what, base, ceiling });
  return { value, healed: true };
}

/* ── host ── */
const portFree = (port) => new Promise((ok) => { const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true))).listen(port, '127.0.0.1'); });
/** The asked port, or the next free one up to +20 (HEALED). */
export async function healPort(port, { stage = 'host' } = {}) {
  if (await portFree(port)) return { port, healed: false };
  for (let p = port + 1; p <= port + 20; p += 1) if (await portFree(p)) { logHeal(stage, 'port-busy', { from: port, to: p }); return { port: p, healed: true }; }
  throw new Error(`FAIL host: ports ${port}–${port + 20} are all busy`);
}
export const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** A host record whose process is gone is dropped (HEALED); the live ones are kept. */
export function healStaleHosts(file, { stage = 'host' } = {}) {
  if (!fs.existsSync(file)) return { hosts: [], healed: false };
  let st;
  try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { st = { hosts: [] }; logHeal(stage, 'host-record-unreadable', { file }); }
  const hosts = (st.hosts || []).filter((h) => alive(h.pid));
  const gone = (st.hosts || []).length - hosts.length;
  if (gone) { fs.writeFileSync(file, JSON.stringify({ ...st, hosts }, null, 1)); logHeal(stage, 'stale-host', { dropped: gone }); }
  return { hosts, healed: gone > 0 };
}

/* ── library, workspace, fonts ── */
export const LIBRARY_VERSION = 1;
/** An older library file (a bare array, or no version) migrates to { version, docs } (HEALED); a newer one fails. */
export function healLibrary(lib, { stage = 'library' } = {}) {
  if (lib && lib.version === LIBRARY_VERSION && Array.isArray(lib.docs)) return { lib, healed: false };
  if (lib && lib.version > LIBRARY_VERSION) throw new Error(`FAIL library: version ${lib.version} is newer than this Business-Wrap (${LIBRARY_VERSION}); update first`);
  const docs = Array.isArray(lib) ? lib : Array.isArray(lib?.docs) ? lib.docs : [];
  logHeal(stage, 'library-schema', { from: Array.isArray(lib) ? 'array' : lib?.version ?? 'none', to: LIBRARY_VERSION });
  return { lib: { version: LIBRARY_VERSION, docs }, healed: true };
}
export function healWorkspace(dir, { stage = 'workspace' } = {}) {
  if (fs.existsSync(dir)) return { dir, healed: false };
  fs.mkdirSync(dir, { recursive: true });
  logHeal(stage, 'workspace-missing', { dir });
  return { dir, healed: true };
}
/** A face not installed falls back to the bundled Thmanyah (never Cairo). `has(family)` says whether it resolves. */
export function healFont(family, has, { stage = 'render' } = {}) {
  if (family && !/cairo/i.test(family) && has(family)) return { family, healed: false };
  logHeal(stage, 'font-missing', { from: family || null, to: FALLBACK_FONT });
  return { family: FALLBACK_FONT, healed: true };
}

/** One step's verdict: FAIL on an error, HEALED when any heal ran, PASS otherwise. */
export const verdictOf = ({ error, healed }) => (error ? 'FAIL' : healed ? 'HEALED' : 'PASS');
