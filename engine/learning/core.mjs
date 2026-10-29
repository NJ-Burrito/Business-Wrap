// Local learning, the pure part: redaction, field kinds, distillation into lessons, conflict
// detection, the rules file, and applying promoted rules to a NEW document. No Node API and no
// model call, so the editor carries redact + fieldKind (engine/build-editor.mjs, own scope LEARN).
// The method (record verbatim with the source, flag REVERSAL / CONFLICT, promote only with counts
// and no kill criterion, otherwise keep it scoped) follows bible/10-learning.md.
import { get, textLeaves, withText } from '../edits.mjs';

export const LEARN_VERSION = 1;
export const AUTO_PROMOTE_HITS = 3;
export const MIN_HITS = 2;

/* ── redaction: applied to every string before an event is written anywhere ── */
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted-key]'],
  [/\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, '[redacted-token]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[redacted-token]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[redacted-token]'],
  [/(\b(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|pin)\s*[:=]\s*|(?:كلمة المرور|كلمة السر|الرقم السري)\s*[:=]\s*)\S+/gi, '$1[redacted]'],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/g, '$1[redacted]'],
  [/\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z_-]*[0-9])(?=[0-9_-]*[A-Za-z])[A-Za-z0-9_-]+/g, '[redacted-token]'],
  [/[0-9٠-٩]{9,}/g, '[redacted-digits]'],
];
export function redact(v) {
  if (typeof v === 'string') return SECRETS.reduce((s, [re, to]) => s.replace(re, to), v);
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x)]));
  return v;
}

/** A bounded copy of a value for the journal: long strings cut, objects summarised to their kind / title. */
export function brief(v, max = 2000) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v ?? null;
  if (typeof v === 'string') return v.length > max ? v.slice(0, max) + '…' : v;
  if (Array.isArray(v)) return { array: v.length };
  const o = {};
  for (const k of ['kind', 'title', 'number', 'label', 'caption']) if (typeof v[k] === 'string') o[k] = v[k].slice(0, 200);
  return Object.keys(o).length ? o : { keys: Object.keys(v).slice(0, 12) };
}

/**
 * What kind of field a pointer names, independent of the service: control.title, label.x,
 * section.title, block.table.col2, block.prose, diagram.node.label, design.vars.primary, overlay.
 */
export function fieldKind(doc, path) {
  const p = String(path);
  let m;
  if ((m = /^\/control\/([^/]+)/.exec(p))) return `control.${m[1]}`;
  if ((m = /^\/labels\/([^/]+)/.exec(p))) return `label.${m[1]}`;
  if ((m = /^\/design(\/.*)?$/.exec(p))) return `design${(m[1] || '').replace(/\//g, '.')}`;
  if (/^\/overlays(\/|$)/.test(p)) return 'overlay';
  if (/^\/revisions(\/|$)/.test(p)) return 'revisions';
  if ((m = /^(\/chapters\/\d+\/sections\/\d+\/blocks\/\d+)(\/.*)?$/.exec(p))) {
    const blk = get(doc, m[1]);
    const rest = m[2] || '';
    const kind = blk?.kind || 'block';
    if (kind === 'diagram') {
      const n = /^\/model\/(nodes|edges)\/\d+(?:\/(\w+))?/.exec(rest);
      return n ? `diagram.${n[1] === 'nodes' ? 'node' : 'edge'}${n[2] ? '.' + n[2] : ''}` : rest.startsWith('/model') ? 'diagram.model' : `diagram${rest.replace(/\/\d+/g, '').replace(/\//g, '.')}`;
    }
    const cell = /^\/rows\/\d+\/(\d+)/.exec(rest);
    if (cell) return `block.${kind}.col${cell[1]}`;
    if (/^\/columns\/(\d+)/.test(rest)) return `block.${kind}.header`;
    return `block.${kind}${rest.replace(/\/\d+/g, '').replace(/\//g, '.')}`;
  }
  if (/^\/chapters\/\d+\/sections\/\d+\/title$/.test(p)) return 'section.title';
  if (/^\/chapters\/\d+\/sections\/\d+$/.test(p)) return 'section';
  if (/^\/chapters\/\d+\/title$/.test(p)) return 'chapter.title';
  if (/^\/chapters\/\d+$/.test(p)) return 'chapter';
  return p.replace(/\/\d+/g, '/*') || '/';
}
/** The title of the section a pointer sits in (the "same section" key across services). */
export function sectionOf(doc, path) {
  const m = /^\/chapters\/(\d+)(\/sections\/(\d+))?/.exec(String(path));
  if (!m) return null;
  return (m[2] ? get(doc, `/chapters/${m[1]}/sections/${m[3]}/title`) : get(doc, `/chapters/${m[1]}/title`)) ?? null;
}

/* ── distillation ──────────────────────────────────────────────────────── */
const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean);
const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
/** Word-level substitution between two strings: the common head and tail removed. {from, to} or null. */
export function substitution(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return null;
  const a = words(before);
  const b = words(after);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j += 1;
  const from = a.slice(i, a.length - j).join(' ');
  const to = b.slice(i, b.length - j).join(' ');
  if (!from || from === to) return null;
  if (words(from).length > 6 || words(to).length > 8) return null; // a rewrite, not a substitution
  return { from, to };
}

/** Small stable hash (FNV-1a, 32 bit) for lesson ids: the same pattern always gets the same id. */
export function hashId(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'L' + h.toString(36).padStart(7, '0');
}

/**
 * The events that still count: an undo (kind revert) removes the edits it undid, a redo adds them back.
 * Events are replayed in time order.
 */
export function liveEvents(events) {
  const live = new Map();
  const sorted = [...events].sort((x, y) => String(x.at).localeCompare(String(y.at)));
  const other = [];
  for (const e of sorted) {
    if (e.kind === 'edit') live.set(e.id, e);
    else if (e.kind === 'revert') { const refs = new Set(e.refs || []); for (const [id, x] of live) if (refs.has(x.ref)) live.delete(id); }
    else other.push(e);
  }
  return { edits: [...live.values()], other };
}

const scopeOf = (evs) => {
  const services = new Set(evs.map((e) => e.service));
  if (services.size >= 2) {
    const types = new Set(evs.map((e) => e.serviceType || ''));
    return types.size === 1 && [...types][0] ? `type:${[...types][0]}` : 'global';
  }
  return `service:${[...services][0]}`;
};

/**
 * Group the journal into candidate lessons. Deterministic: same journal + same previous lessons → same output.
 * Returns { lessons, conflicts }. Previous statuses (promoted / retired, by whom) are kept; a lesson whose
 * evidence vanished stays as it was, marked stale. Auto-promotion: hits ≥ 3, no counter-evidence, no conflict.
 */
export function distil(events, previous = []) {
  const { edits, other } = liveEvents(events);
  const groups = new Map();
  const add = (key, type, pattern, ev, extra = {}) => {
    if (!groups.has(key)) groups.set(key, { key, type, pattern, evs: [], ...extra });
    groups.get(key).evs.push(ev);
  };
  for (const e of edits) {
    const fk = e.field || '';
    if (fk.startsWith('design')) {
      if (e.after != null && typeof e.after !== 'object') add(`design|${e.path}|${e.after}`, 'design', { path: e.path, value: e.after }, e);
      continue;
    }
    if (e.op === 'delete' && fk === 'diagram.node') { add(`diagram|delete|${e.meta?.nodeKind || ''}`, 'diagram', { action: 'delete-node', nodeKind: e.meta?.nodeKind || '' }, e); continue; }
    if (e.op === 'delete' && e.origin !== 'manual') {
      const title = norm(e.before?.title || e.section || '');
      add(`delete|${fk}|${fk.startsWith('section') || fk.startsWith('chapter') ? title : ''}`, 'delete', { field: fk, title: fk.startsWith('section') || fk.startsWith('chapter') ? title : '' }, e);
      continue;
    }
    if (typeof e.before === 'string' && typeof e.after === 'string') {
      const sub = substitution(e.before, e.after);
      if (sub) add(`wording|${sub.from}|${sub.to}`, 'wording', sub, e);
      if (e.origin !== 'manual' && norm(e.after) && !fk.startsWith('block.prose')) add(`field|${fk}|${norm(e.after)}`, 'field', { field: fk, value: norm(e.after) }, e);
    }
  }
  const exports = other.filter((e) => e.kind === 'export');
  const accepted = new Set(exports.flatMap((e) => e.accepted || []));
  const lessons = [];
  for (const g of groups.values()) {
    const services = new Set(g.evs.map((e) => e.service));
    const hits = g.evs.length;
    if (hits < MIN_HITS) continue;
    if (['field', 'design'].includes(g.type) && services.size < 2) continue; // "the same way across ≥ 2 services"
    lessons.push({
      id: hashId(g.key), type: g.type, pattern: g.pattern, scope: scopeOf(g.evs), hits, services: services.size,
      accepted: g.evs.filter((e) => accepted.has(e.ref)).length,
      evidence: g.evs.map((e) => e.id), notes: g.evs.map((e) => e.note).filter(Boolean),
      against: 0, kill: [], status: 'candidate',
    });
  }
  // counter-evidence and conflicts, as in the adjustment ledger: REVERSAL (A→B and B→A), CONFLICT (A→B and A→C)
  const conflicts = [];
  const seen = new Set();
  const flag = (kind, a, b, point, sides) => {
    const k = [kind, ...[a, b].sort()].join('|');
    if (a === b || seen.has(k)) return;
    seen.add(k);
    conflicts.push({ flag: kind, a, b, point, sides });
  };
  const prevById = new Map(previous.map((l) => [l.id, l]));
  const all = [...lessons, ...previous.filter((p) => !lessons.some((l) => l.id === p.id) && p.status === 'promoted').map((p) => ({ ...p, kill: [], against: 0 }))];
  for (const l of all) {
    if (l.type === 'wording') {
      const back = groups.get(`wording|${l.pattern.to}|${l.pattern.from}`);
      if (back) {
        l.against = (l.against || 0) + back.evs.length;
        if (!l.kill.includes('reversal')) l.kill.push('reversal');
        flag('REVERSAL', l.id, hashId(back.key), `«${l.pattern.from}» ⇄ «${l.pattern.to}»`, [l.pattern.to, l.pattern.from]);
      }
      for (const o of all) if (o.type === 'wording' && o.pattern.from === l.pattern.from && o.pattern.to !== l.pattern.to)
        flag('CONFLICT', l.id, o.id, `«${l.pattern.from}»`, [l.pattern.to, o.pattern.to]);
    }
    if (l.type === 'field' || l.type === 'design') {
      const at = l.type === 'field' ? 'field' : 'path';
      for (const o of all) if (o.type === l.type && o.pattern[at] === l.pattern[at] && o.pattern.value !== l.pattern.value)
        flag('CONFLICT', l.id, o.id, l.pattern[at], [l.pattern.value, o.pattern.value]);
    }
  }
  const inConflict = new Set(conflicts.flatMap((c) => [c.a, c.b]));
  for (const l of lessons) {
    if (inConflict.has(l.id)) l.kill.push('conflict');
    l.confidence = Math.round((l.hits / (l.hits + l.against + 1)) * 100) / 100;
    const prev = prevById.get(l.id);
    if (prev && ['promoted', 'retired'].includes(prev.status)) Object.assign(l, { status: prev.status, by: prev.by, decidedAt: prev.decidedAt });
    else if (l.hits >= AUTO_PROMOTE_HITS && !l.kill.length) Object.assign(l, { status: 'promoted', by: 'auto' });
  }
  for (const p of previous) if (!lessons.some((l) => l.id === p.id) && p.status !== 'candidate') lessons.push({ ...p, stale: true });
  lessons.sort((a, b) => b.hits - a.hits || a.id.localeCompare(b.id));
  return { lessons, conflicts };
}

/* ── the rules the agent reads (and the engine applies where safe) ──────── */
const SAFE = new Set(['wording', 'design', 'diagram']);
export function rulesOf(lessons) {
  return lessons.filter((l) => l.status === 'promoted').map((l) => ({ id: l.id, type: l.type, pattern: l.pattern, scope: l.scope, hits: l.hits, confidence: l.confidence, auto: SAFE.has(l.type) }));
}
const scopeText = (s, ar) => (s === 'global' ? (ar ? 'كل الخدمات' : 'every service') : s.startsWith('type:') ? `${ar ? 'نوع الوثيقة' : 'document type'} «${s.slice(5)}»` : `${ar ? 'الخدمة' : 'service'} «${s.slice(8)}»`);
function ruleSentence(r, ar) {
  const p = r.pattern;
  switch (r.type) {
    case 'wording': return ar ? `اكتب «${p.to}» بدل «${p.from}».` : `Write "${p.to}" instead of "${p.from}".`;
    case 'field': return ar ? `الحقل ${p.field}: القيمة المعتادة «${p.value}».` : `Field ${p.field}: the usual value is "${p.value}".`;
    case 'delete': return ar ? `لا تولّد ${p.field}${p.title ? ` «${p.title}»` : ''}: يحذفه المستخدم في كل مرة.` : `Do not generate ${p.field}${p.title ? ` "${p.title}"` : ''}: the user deletes it every time.`;
    case 'design': return ar ? `التصميم: ${p.path} = ${p.value}.` : `Design: ${p.path} = ${p.value}.`;
    case 'diagram': return ar ? `المخطط: لا تضع عُقد «${p.nodeKind}»؛ يحذفها المستخدم.` : `Diagram: leave out "${p.nodeKind}" nodes; the user removes them.`;
    default: return JSON.stringify(p);
  }
}
/** rules.md: one line per promoted rule, Arabic then English, with its evidence count. */
export function rulesMarkdown(rules) {
  const row = (r, ar) => `- \`${r.id}\` ${ruleSentence(r, ar)} — ${ar ? 'النطاق' : 'scope'}: ${scopeText(r.scope, ar)} · ${ar ? 'الشواهد' : 'hits'}: ${r.hits} · ${ar ? 'الثقة' : 'confidence'}: ${r.confidence}${r.auto ? (ar ? ' · يطبّقه المحرّك' : ' · applied by the engine') : ''}`;
  return `# القواعد المتعلَّمة محليًا / Locally learned rules

<!-- generated by npm run learn: do not edit by hand (promote / retire through the CLI or the MCP tools) -->

يبقى على جهازك فقط. اقرأ هذه القواعد وطبّقها قبل الاستخراج أو الكتابة أو التوليد، وأخبر المستخدم في سطر واحد بالقواعد التي طُبّقت.

${rules.length ? rules.map((r) => row(r, true)).join('\n') : '- لا قواعد بعد.'}

Stays on this machine only. Read and apply these rules before harvesting, authoring or generating, and tell the user in one line which learned rules were applied.

${rules.length ? rules.map((r) => row(r, false)).join('\n') : '- No rules yet.'}
`;
}

/** Does a rule apply to this document (scope: global, its document type, or its service)? */
const inScope = (r, doc) => r.scope === 'global' || r.scope === `type:${doc.control?.documentType}` || r.scope === `service:${doc.service}`;
const BOUND = '[\\s\\u060C,.;:()«»"\'!?؟]';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Apply the promoted safe rules to a NEW document (a fresh harvest or generation; never an existing one).
 * Wording on the text leaves, design defaults the document does not set, diagram conventions on its
 * models. Hand-edited paths (doc.manual) are left alone. Every change is listed in doc.learned
 * ({path, rule, from, to}) so the editor marks it «مطبّق من التعلّم» and the user can undo it.
 */
export function applyRules(doc, rules) {
  const out = JSON.parse(JSON.stringify(doc));
  const applied = [];
  const manual = out.manual || {};
  const isManual = (p) => Object.keys(manual).some((k) => k.replace(/~1/g, '/').replace(/~0/g, '~') === p);
  const set = (p, v) => { const parts = p.split('/').slice(1); const k = parts.pop(); let o = out; for (const x of parts) o = o[x]; o[k] = v; };
  for (const r of rules.filter((x) => x.auto && inScope(x, out))) {
    if (r.type === 'wording') {
      const re = new RegExp(`(^|${BOUND})${escRe(r.pattern.from)}(?=$|${BOUND})`, 'g');
      for (const { path, value } of textLeaves(out)) {
        if (isManual(path) || path.startsWith('/control/documentId')) continue;
        const next = value.replace(re, (_, pre) => pre + r.pattern.to);
        if (next !== value) { set(path, withText(get(out, path), next)); applied.push({ path, rule: r.id, from: r.pattern.from, to: r.pattern.to }); }
      }
    } else if (r.type === 'design') {
      if (get(out, r.pattern.path) !== undefined) continue;
      const parts = r.pattern.path.split('/').slice(1);
      let o = out;
      for (const x of parts.slice(0, -1)) o = o[x] ??= {};
      o[parts.at(-1)] = r.pattern.value;
      applied.push({ path: r.pattern.path, rule: r.id, from: null, to: r.pattern.value });
    } else if (r.type === 'diagram' && r.pattern.action === 'delete-node') {
      out.chapters.forEach((ch, i) => ch.sections.forEach((s, j) => s.blocks.forEach((b, k) => {
        if (b.kind !== 'diagram' || !b.model?.nodes) return;
        const gone = new Set(b.model.nodes.filter((n) => n.kind === r.pattern.nodeKind).map((n) => n.id));
        if (!gone.size) return;
        b.model.nodes = b.model.nodes.filter((n) => !gone.has(n.id));
        b.model.edges = (b.model.edges || []).filter((e) => !gone.has(e.from) && !gone.has(e.to));
        applied.push({ path: `/chapters/${i}/sections/${j}/blocks/${k}/model`, rule: r.id, from: r.pattern.nodeKind, to: null });
      })));
    }
  }
  if (applied.length) out.learned = [...(out.learned || []), ...applied];
  return { doc: out, applied };
}
