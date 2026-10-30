// Local learning, the store: .local/learning/ (gitignored, kept by updates, never sent anywhere).
//   journal.jsonl (+ journal.1..3.jsonl rotated)  one redacted event per line
//   lessons.json                                   every lesson with its status (candidate / promoted / retired)
//   rules.md + rules.json                          the promoted rules, for agents (AR + EN) and the engine
//   settings.json                                  { enabled } — default on
// BW_LEARNING_DIR overrides the folder (tests, read-only installs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO } from '../export.mjs';
import { localBase } from '../testguard.mjs';
import { redact, distil, rulesOf, rulesMarkdown, applyRules, LEARN_VERSION } from './core.mjs';

export const MAX_JOURNAL = 4 * 1024 * 1024; // per file; three rotations kept → at most ~16 MB on disk
const ROTATIONS = 3;
const KINDS = new Set(['edit', 'note', 'export', 'revert']);

export const dir = () => process.env.BW_LEARNING_DIR || path.join(localBase(REPO), 'learning');
const f = (name) => path.join(dir(), name);
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const write = (name, text) => { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(f(name), text, 'utf8'); };

export const settings = () => ({ enabled: true, ...readJson(f('settings.json'), {}) });
export function setEnabled(on) { write('settings.json', JSON.stringify({ ...settings(), enabled: !!on }, null, 1) + '\n'); return settings(); }

/** Only the documented fields of an event, redacted; anything else is dropped. */
function clean(e) {
  if (!e || !KINDS.has(e.kind)) return null;
  const keep = ['id', 'at', 'kind', 'service', 'serviceType', 'locale', 'path', 'field', 'section', 'op', 'before', 'after', 'origin', 'note', 'ref', 'refs', 'rule', 'format', 'accepted', 'meta'];
  const o = Object.fromEntries(keep.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  o.id = typeof o.id === 'string' && /^[\w.:-]{1,80}$/.test(o.id) ? o.id : `e${crypto.randomUUID()}`;
  o.at = typeof o.at === 'string' ? o.at.slice(0, 40) : new Date().toISOString();
  return redact(o);
}

function rotate() {
  const j = f('journal.jsonl');
  if (!fs.existsSync(j) || fs.statSync(j).size < MAX_JOURNAL) return;
  for (let i = ROTATIONS; i >= 1; i -= 1) {
    const from = i === 1 ? j : f(`journal.${i - 1}.jsonl`);
    if (fs.existsSync(from)) fs.renameSync(from, f(`journal.${i}.jsonl`)); // the oldest is overwritten
  }
}

/** Append events (deduplicated by id). Returns how many were written; 0 when learning is off. */
export function append(events) {
  if (!settings().enabled) return 0;
  const have = new Set(readEvents().map((e) => e.id));
  const rows = (Array.isArray(events) ? events : [events]).map(clean).filter((e) => e && !have.has(e.id) && have.add(e.id));
  if (!rows.length) return 0;
  rotate();
  fs.mkdirSync(dir(), { recursive: true });
  fs.appendFileSync(f('journal.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  return rows.length;
}

export function readEvents() {
  const out = [];
  for (const name of [...Array.from({ length: ROTATIONS }, (_, i) => `journal.${ROTATIONS - i}.jsonl`), 'journal.jsonl']) {
    if (!fs.existsSync(f(name))) continue;
    for (const line of fs.readFileSync(f(name), 'utf8').split('\n')) if (line.trim()) { try { out.push(JSON.parse(line)); } catch { /* a torn line is skipped */ } }
  }
  return out;
}
export const lessons = () => readJson(f('lessons.json'), { lessons: [] }).lessons;
export const rules = () => readJson(f('rules.json'), { rules: [] }).rules;

function writeLessons(list) {
  write('lessons.json', JSON.stringify({ kind: 'bw-learning-lessons', version: LEARN_VERSION, lessons: list }, null, 1) + '\n');
  const r = rulesOf(list);
  write('rules.json', JSON.stringify({ kind: 'bw-learning-rules', version: LEARN_VERSION, rules: r }, null, 1) + '\n');
  write('rules.md', rulesMarkdown(r));
  return r;
}

/** Group the journal into lessons, auto-promote, write lessons.json + rules.md + rules.json. */
export function distill() {
  const { lessons: list, conflicts } = distil(readEvents(), lessons());
  const r = writeLessons(list);
  write('conflicts.json', JSON.stringify({ conflicts }, null, 1) + '\n');
  return { events: readEvents().length, lessons: list.length, candidates: list.filter((l) => l.status === 'candidate').length, promoted: r.length, retired: list.filter((l) => l.status === 'retired').length, conflicts, rules_md: f('rules.md') };
}
export const conflicts = () => readJson(f('conflicts.json'), { conflicts: [] }).conflicts;

function decide(id, status) {
  const list = lessons();
  const l = list.find((x) => x.id === id);
  if (!l) throw new Error(`no lesson ${id}: run learning_distill first, then pick an id from learning_rules or lessons.json`);
  Object.assign(l, { status, by: 'user', decidedAt: new Date().toISOString() });
  writeLessons(list);
  return l;
}
export const promote = (id) => decide(id, 'promoted');
export const retire = (id) => decide(id, 'retired');

export function status() {
  const l = lessons();
  return { enabled: settings().enabled, dir: dir(), events: readEvents().length, lessons: l.length, promoted: l.filter((x) => x.status === 'promoted').length, retired: l.filter((x) => x.status === 'retired').length, conflicts: conflicts().length };
}

/** One portable bundle for moving to another machine. */
export function exportBundle() {
  return { kind: 'bw-learning', version: LEARN_VERSION, exportedAt: new Date().toISOString(), events: readEvents(), lessons: lessons() };
}
export function importBundle(b) {
  if (!b || b.kind !== 'bw-learning') throw new Error('not a bw-learning bundle');
  if (b.version > LEARN_VERSION) throw new Error(`bw-learning version ${b.version} is newer than this Business-Wrap: update first`);
  const added = append(b.events || []);
  const mine = new Map(lessons().map((l) => [l.id, l]));
  for (const l of b.lessons || []) if (!mine.has(l.id) || (mine.get(l.id).status === 'candidate' && l.status !== 'candidate')) mine.set(l.id, l);
  writeLessons([...mine.values()]);
  return { events_added: added, ...distill() };
}

/** Wipe everything learned on this machine (the folder itself). */
export function forget() {
  const had = status();
  fs.rmSync(dir(), { recursive: true, force: true });
  return { forgotten: true, events: had.events, lessons: had.lessons };
}

/** Apply this machine's promoted safe rules to a newly generated document (see core.applyRules). */
export function applyLearned(doc) {
  if (!settings().enabled) return { doc, applied: [] };
  const r = rules();
  return r.length ? applyRules(doc, r) : { doc, applied: [] };
}
