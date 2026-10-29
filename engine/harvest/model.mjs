// Harvest path A: a process model → the process IR → the document JSON the editor opens.
// Inputs: BPMN 2.0 XML (Flowable / Camunda / Activiti, with their extension attributes), draw.io XML
// (plain or compressed), or a YAML/JSON step list. Browser + Node; no dependencies.
//
// IR (bible/contracts/harvest.schema.json#/$defs/process):
//   { kind:'bw-process', version:1, name, source, actors:[{id,name}],
//     steps:[{id, type, name, actor?, fields?, formKey?, timer?, attachedTo?}], flows:[{from,to,label?,condition?}] }
// step.type: task (a person does it) | system | decision | start | end | timer | pass
import { parseXml, find, kids, child, attr, textOf, unescapeXml } from './xml.mjs';
import { parseYaml } from './yaml.mjs';
import { DIAGRAM } from '../diagram.mjs';

// draw.io labels are HTML inside the attribute: tags out, entities decoded once more
const clean = (s) => unescapeXml(String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim();
// a document code is Latin in every edition: the user's slug, the process key, or a transliteration
const TR = { 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ة': 'a', 'و': 'w', 'ي': 'y', 'ى': 'a', 'ئ': 'e', 'ؤ': 'o', 'ء': '' };
export const latin = (s) => String(s || '').replace(/[\u0600-\u06FF]/g, (c) => TR[c] ?? '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
export const docCode = (s) => `BW-SRS-${(latin(String(s || '').replace(/([a-z])([A-Z])/g, '$1-$2')).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'DOC')}`;
const slug = (s) => String(s || 'process').toLowerCase().normalize('NFKD').replace(/[^\w؀-ۿ]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'process';

/* ── BPMN 2.0 ─────────────────────────────────────────────────────────── */
const HUMAN = new Set(['userTask', 'manualTask', 'task']);
const SYSTEM = new Set(['serviceTask', 'scriptTask', 'sendTask', 'receiveTask', 'businessRuleTask', 'callActivity']);
// round-robin auto-assignment is stated on the task, not as a node: assignee="${…getAssigneeRoundRobin(…)}"
export const ROUND_ROBIN = /round-?robin/i;
const GATEWAY = new Set(['exclusiveGateway', 'inclusiveGateway', 'parallelGateway', 'eventBasedGateway', 'complexGateway']);

export function parseBpmn(xml) {
  const doc = parseXml(xml);
  const defs = find(doc, 'definitions')[0] || doc;
  const processes = kids(defs, 'process');
  if (!processes.length) throw new Error('no <process> element: not a BPMN 2.0 file');
  const pools = Object.fromEntries(find(defs, 'participant').map((p) => [attr(p, 'processRef'), clean(attr(p, 'name'))]));
  const ir = { kind: 'bw-process', version: 1, name: '', source: 'bpmn', actors: [], steps: [], flows: [] };
  const actorIds = new Map();
  const actorOf = (name) => {
    const n = clean(name);
    if (!n) return undefined;
    if (!actorIds.has(n)) { const id = `a${actorIds.size + 1}`; actorIds.set(n, id); ir.actors.push({ id, name: n }); }
    return actorIds.get(n);
  };
  const subStart = {};
  const subEnds = {};
  for (const proc of processes) {
    if (!ir.name) ir.name = clean(attr(proc, 'name')) || pools[attr(proc, 'id')] || clean(attr(proc, 'id'));
    if (!ir.key) ir.key = attr(proc, 'id') || undefined;
    const laneOf = {};
    for (const lane of find(proc, 'lane')) for (const ref of kids(lane, 'flowNodeRef')) laneOf[textOf(ref)] = clean(attr(lane, 'name'));
    const poolName = pools[attr(proc, 'id')];
    const scan = (container, parentSub) => {
      for (const el of container.children) {
        const id = attr(el, 'id');
        const t = el.local;
        const name = clean(attr(el, 'name'));
        if (t === 'sequenceFlow') {
          const cond = child(el, 'conditionExpression');
          ir.flows.push({ from: attr(el, 'sourceRef'), to: attr(el, 'targetRef'), label: name || undefined, condition: cond ? clean(textOf(cond)) : undefined });
          continue;
        }
        if (t === 'subProcess' || t === 'transaction' || t === 'adHocSubProcess') {
          ir.steps.push({ id, type: 'pass', name });
          scan(el, id);
          continue;
        }
        if (HUMAN.has(t)) {
          const who = laneOf[id] || clean(attr(el, 'candidateGroups')) || clean(attr(el, 'candidateUsers')) || clean(attr(el, 'assignee')) || poolName || '';
          const fields = find(el, 'formProperty').map((f) => ({
            name: attr(f, 'id') || attr(f, 'name'),
            label: clean(attr(f, 'name')) || attr(f, 'id'),
            type: attr(f, 'type') || 'string',
            required: attr(f, 'required') === 'true',
            options: kids(f, 'value').map((v) => clean(attr(v, 'name')) || attr(v, 'id')).filter(Boolean),
          }));
          ir.steps.push({ id, type: 'task', name: name || '', actor: who ? actorOf(who) : undefined, fields: fields.length ? fields : undefined, formKey: attr(el, 'formKey') || undefined, ...(ROUND_ROBIN.test(attr(el, 'assignee') || '') ? { autoAssign: true } : {}) });
        } else if (SYSTEM.has(t)) ir.steps.push({ id, type: 'system', name: name || '' });
        else if (GATEWAY.has(t)) ir.steps.push({ id, type: 'decision', name: name || '', actor: laneOf[id] ? actorOf(laneOf[id]) : undefined, gateway: t });
        else if (t === 'startEvent') {
          ir.steps.push({ id, type: parentSub ? 'pass' : 'start', name });
          if (parentSub) subStart[parentSub] = id;
        } else if (t === 'endEvent') {
          if (parentSub) { ir.steps.push({ id, type: 'pass', name }); (subEnds[parentSub] ||= []).push(id); }
          else ir.steps.push({ id, type: 'end', name: name || '' });
        } else if (t === 'boundaryEvent' || t === 'intermediateCatchEvent') {
          const timer = child(el, 'timerEventDefinition');
          const dur = timer ? clean(textOf(child(timer, 'timeDuration')) || textOf(child(timer, 'timeDate')) || textOf(child(timer, 'timeCycle'))) : '';
          ir.steps.push({ id, type: timer ? 'timer' : 'pass', name: name || dur, timer: dur || undefined, attachedTo: attr(el, 'attachedToRef') || undefined });
        } else if (t === 'intermediateThrowEvent') ir.steps.push({ id, type: 'pass', name });
      }
    };
    scan(proc, null);
  }
  // a flow into a subprocess enters at its start; a flow out of it leaves from each of its ends
  for (const [sub, start] of Object.entries(subStart)) {
    for (const f of ir.flows) if (f.to === sub) f.to = start;
    for (const f of ir.flows.filter((x) => x.from === sub)) for (const e of subEnds[sub] || []) ir.flows.push({ ...f, from: e });
    ir.flows = ir.flows.filter((x) => x.from !== sub);
  }
  // timers on a task: the task itself leads to the timer's path
  for (const s of ir.steps.filter((x) => x.type === 'timer' && x.attachedTo)) ir.flows.push({ from: s.attachedTo, to: s.id, label: s.timer, timer: true });
  return ir;
}

/* ── draw.io / diagrams.net ───────────────────────────────────────────── */
/** `inflateRaw(Uint8Array) → string|Promise<string>`: Node passes zlib, the browser a DecompressionStream. */
export async function parseDrawio(xml, inflateRaw) {
  let doc = parseXml(xml);
  const diagram = find(doc, 'diagram')[0];
  const diagramName = diagram ? clean(attr(diagram, 'name')) : '';
  if (diagram && !find(diagram, 'mxGraphModel').length && textOf(diagram)) {
    if (!inflateRaw) throw new Error('compressed draw.io file: no inflate available');
    const bin = Uint8Array.from(atob(textOf(diagram).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
    doc = parseXml(decodeURIComponent(await inflateRaw(bin)));
  }
  const cells = find(doc, 'mxCell');
  if (!cells.length) throw new Error('no mxCell elements: not a draw.io diagram');
  const ir = { kind: 'bw-process', version: 1, name: diagramName || 'Process', source: 'drawio', actors: [], steps: [], flows: [] };
  const style = (c) => String(attr(c, 'style') || '');
  const lanes = {};
  for (const c of cells) if (attr(c, 'vertex') === '1' && /swimlane|(^|;)shape=(pool|lane)/.test(style(c))) {
    const id = `a${ir.actors.length + 1}`;
    lanes[attr(c, 'id')] = id;
    ir.actors.push({ id, name: clean(attr(c, 'value')) || id });
  }
  const verts = cells.filter((c) => attr(c, 'vertex') === '1' && !lanes[attr(c, 'id')]);
  const edges = cells.filter((c) => attr(c, 'edge') === '1');
  const ins = (id) => edges.filter((e) => attr(e, 'target') === id).length;
  const outs = (id) => edges.filter((e) => attr(e, 'source') === id).length;
  const laneOf = (c) => { let p = attr(c, 'parent'); const byId = Object.fromEntries(cells.map((x) => [attr(x, 'id'), x])); while (p && !lanes[p] && byId[p]) p = attr(byId[p], 'parent'); return lanes[p]; };
  for (const c of verts) {
    const id = attr(c, 'id');
    const st = style(c);
    const name = clean(attr(c, 'value'));
    if (!name && !/rhombus|ellipse/.test(st)) continue; // text-less shapes are decoration
    let type = 'task';
    if (/rhombus/.test(st)) type = 'decision';
    else if (/ellipse|shape=(startState|endState)/.test(st)) type = !ins(id) ? 'start' : !outs(id) ? 'end' : 'pass';
    else if (/shape=(process|cylinder|database)/.test(st) || /system/i.test(st)) type = 'system';
    else if (!outs(id) && ins(id) && /rounded=1;arcSize=50|terminator/.test(st)) type = 'end';
    ir.steps.push({ id, type, name, actor: laneOf(c) });
  }
  const known = new Set(ir.steps.map((s) => s.id));
  for (const e of edges) if (known.has(attr(e, 'source')) && known.has(attr(e, 'target'))) ir.flows.push({ from: attr(e, 'source'), to: attr(e, 'target'), label: clean(attr(e, 'value')) || undefined });
  if (!ir.actors.length) { ir.actors.push({ id: 'a1', name: 'User' }); for (const s of ir.steps) if (s.type === 'task' || s.type === 'decision') s.actor = 'a1'; }
  return ir;
}

/* ── YAML / JSON step list ────────────────────────────────────────────── */
export function parseSteps(text) {
  const t = String(text).trim();
  const src = t.startsWith('{') || t.startsWith('[') ? JSON.parse(t) : parseYaml(t);
  const spec = Array.isArray(src) ? { steps: src } : src;
  const ir = { kind: 'bw-process', version: 1, name: String(spec.process || spec.name || 'Process'), source: 'steps', actors: [], steps: [], flows: [] };
  const actorIds = new Map();
  const actorOf = (n) => { if (!n) return undefined; const k = String(n); if (!actorIds.has(k)) { const id = `a${actorIds.size + 1}`; actorIds.set(k, id); ir.actors.push({ id, name: k }); } return actorIds.get(k); };
  for (const a of spec.actors || []) actorOf(typeof a === 'string' ? a : a.name);
  const steps = spec.steps || [];
  ir.steps.push({ id: '__start', type: 'start', name: '' });
  steps.forEach((s, k) => {
    const id = String(s.id || `s${k + 1}`);
    if (s.decision !== undefined) ir.steps.push({ id, type: 'decision', name: String(s.decision || ''), actor: actorOf(s.actor) });
    else ir.steps.push({ id, type: s.system ? 'system' : 'task', name: String(s.name || s.task || id), actor: s.system ? undefined : actorOf(s.actor || 'User'), fields: s.fields?.map((f) => (typeof f === 'string' ? { name: f, label: f, type: 'string', required: false } : { name: String(f.name), label: String(f.label || f.name), type: String(f.type || 'string'), required: !!f.required, options: f.options })) });
    if (s.decision === undefined && !s.system && (s.autoAssign || ROUND_ROBIN.test(String(s.assignee || '')))) ir.steps.at(-1).autoAssign = true;
    if (k === 0) ir.flows.push({ from: '__start', to: id });
  });
  for (const e of spec.ends || []) ir.steps.push({ id: String(e.id), type: 'end', name: String(e.name || e.id) });
  steps.forEach((s, k) => {
    const id = String(s.id || `s${k + 1}`);
    if (s.options && typeof s.options === 'object') for (const [label, to] of Object.entries(s.options)) ir.flows.push({ from: id, to: String(to), label });
    for (const key of ['yes', 'no']) if (s[key]) ir.flows.push({ from: id, to: String(s[key]), label: key });
    const nxt = s.next ?? (s.decision === undefined && !s.options && k + 1 < steps.length ? String(steps[k + 1].id || `s${k + 2}`) : null);
    for (const to of [].concat(nxt ?? [])) ir.flows.push({ from: id, to: String(to) });
    if (s.timer) ir.flows.push({ from: id, to: String(s.timer.to), label: String(s.timer.after || s.timer.duration || ''), timer: true });
  });
  const ids = new Set(ir.steps.map((s) => s.id));
  for (const f of ir.flows) if (!ids.has(f.to)) { ir.steps.push({ id: f.to, type: 'end', name: f.to }); ids.add(f.to); }
  return ir;
}


/* ── Flowable monitoring graph JSON (back offices that show the process but do not export XML) ── */
// Shape: { key?, name?, description?, graph: { nodes:[{id, kind, name, groups?, assignee?, timer?, attachedTo?}], edges:[{from, to, name?, condition?}] } }
const G_HUMAN = new Set(['userTask', 'manualTask', 'task']);
const G_SYSTEM = new Set(['serviceTask', 'scriptTask', 'sendTask', 'receiveTask', 'businessRuleTask', 'callActivity']);
const G_GATE = new Set(['exclusiveGateway', 'inclusiveGateway', 'parallelGateway', 'eventBasedGateway', 'complexGateway']);
export function parseGraph(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const g = d.graph || d;
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('not a monitoring graph: no nodes/edges');
  const ir = { kind: 'bw-process', version: 1, name: String(d.description || d.name || d.key || 'Process'), key: d.key || undefined, source: 'graph', actors: [], steps: [], flows: [] };
  const actorIds = new Map();
  const actorOf = (n) => { if (!n) return undefined; if (!actorIds.has(n)) { const id = `a${actorIds.size + 1}`; actorIds.set(n, id); ir.actors.push({ id, name: n }); } return actorIds.get(n); };
  for (const n of g.nodes) {
    const kind = n.kind || n.tag || '';
    const name = String(n.name || '').trim();
    // an expression with commas arrives split into several "groups": join them back
    const who = (Array.isArray(n.groups) ? n.groups.join(',') : n.groups || '') || n.assignee || n.users || '';
    if (kind === 'start' || kind === 'startEvent') ir.steps.push({ id: n.id, type: 'start', name: '' });
    else if (kind === 'end' || kind === 'endEvent') ir.steps.push({ id: n.id, type: 'end', name: name === 'end' ? '' : name });
    else if (G_HUMAN.has(kind)) ir.steps.push({ id: n.id, type: 'task', name, actor: who ? actorOf(who) : undefined, ...(ROUND_ROBIN.test(String(n.assignee || who)) ? { autoAssign: true } : {}) });
    else if (G_SYSTEM.has(kind)) ir.steps.push({ id: n.id, type: 'system', name });
    else if (G_GATE.has(kind)) ir.steps.push({ id: n.id, type: 'decision', name, gateway: kind });
    else if (n.timer || kind === 'boundary' || kind === 'boundaryEvent' || kind === 'timer') ir.steps.push({ id: n.id, type: n.timer ? 'timer' : 'pass', name: n.timer ? String(n.timer) : name, timer: n.timer ? String(n.timer) : undefined, attachedTo: n.attachedTo || undefined });
    else ir.steps.push({ id: n.id, type: 'pass', name });
  }
  for (const e of g.edges) ir.flows.push({ from: e.from, to: e.to, label: e.name || undefined, condition: e.condition || undefined });
  for (const s of ir.steps.filter((x) => x.type === 'timer' && x.attachedTo)) ir.flows.push({ from: s.attachedTo, to: s.id, label: s.timer, timer: true });
  return ir;
}

/* ── readable names: expression assignees, raw keys, unnamed gateways ──────────────────────────
 * A mapping file ({ "<raw key or expression>": "Name" | {ar, en} }, "_name": the service name)
 * gives each actor, step and flow label its name per edition. What it does not cover gets a
 * readable fallback from the key itself ("Role_head-of-section_<Process>" → "Head of section"),
 * and an expression without a mapping is flagged unresolved for the editor to ask about. */
const isExpr = (s) => /\$\{|#\{/.test(String(s || ''));
const RAW_ID = /^(sid-[0-9a-f-]{8,}|[0-9a-f]{8}-[0-9a-f-]{20,}|_?[A-Z][A-Za-z0-9]*_[0-9a-f]{6,})$/i;
export function rawKey(s, processKey = '') {
  let k = String(s || '').trim();
  if (isExpr(k)) {
    const lit = /['"]([^'"]+)['"]/.exec(k);
    const id = /\$\{\s*([\w.]+)\s*\}/.exec(k);
    k = lit ? lit[1] : id ? id[1].split('.').pop() : k.replace(/[${}#()]/g, ' ');
  }
  return k;
}
export function humanize(s, processKey = '') {
  let k = rawKey(s, processKey);
  if (!k || RAW_ID.test(k)) return '';
  if (processKey) k = k.split(processKey).join('');
  k = k.replace(/^(Role|Task|Group|role|task|group)[_-]/, '').replace(/[_-](Role|Task)$/i, '').replace(/_[A-Z][A-Za-z0-9]+$/, '');
  const words = k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[\s_\-.]+/).filter(Boolean);
  if (!words.length) return '';
  const out = words.join(' ').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
export function applyNames(ir, map = {}) {
  const pick = (raw) => {
    if (!raw) return null;
    for (const k of [raw, rawKey(raw, ir.key), humanize(raw, ir.key).toLowerCase()]) if (k && map[k] !== undefined) return typeof map[k] === 'string' ? { ar: map[k], en: map[k] } : map[k];
    return null;
  };
  if (map._name) ir.names = typeof map._name === 'string' ? { ar: map._name, en: map._name } : map._name;
  for (const a of ir.actors) {
    const m = pick(a.raw ?? a.name);
    a.raw ??= a.name;
    if (m) { a.names = m; a.name = m.en || m.ar; delete a.unresolved; }
    else if (isExpr(a.raw) || RAW_ID.test(rawKey(a.raw)) || /^(Role|Group)[_-]/.test(rawKey(a.raw))) {
      a.name = humanize(a.raw, ir.key) || a.name;
      a.unresolved = true;
    }
  }
  for (const st of ir.steps) {
    const m = pick(st.name) || pick(st.id);
    if (m) st.names = m;
    else if (st.name && (/^(Task|Role)[_-]/.test(st.name) || (ir.key && st.name.includes(ir.key)) || /^[a-z0-9]+([_-][a-z0-9]+)+$/i.test(st.name))) st.name = humanize(st.name, ir.key) || st.name;
  }
  for (const f of ir.flows) { const m = pick(f.label); if (m) f.names = m; else if (f.label && /^[a-z0-9]+([_-][a-z0-9]+)+$/i.test(f.label)) f.label = humanize(f.label, ir.key); }
  return ir;
}
/** ${action=='approve' && fee!=0} → action = approve and fee ≠ 0 */
export const plainCond = (c) => String(c || '').replace(/^\s*[$#]\{\s*|\s*\}\s*$/g, '').replace(/\s*===?\s*/g, ' = ').replace(/\s*!==?\s*/g, ' ≠ ').replace(/\s*&&\s*/g, ' and ').replace(/\s*\|\|\s*/g, ' or ').replace(/['"]/g, '').replace(/\s+/g, ' ').trim();
const GENERIC_GATE = /^\s*(action|actions|decision|gateway|exclusive\s*gateway|xor|choice|condition|status|outcome|result|قرار|بوابة)\s*\d*\s*$/i;
const DIGITS_AR = '٠١٢٣٤٥٦٧٨٩';
const numIn = (n, locale) => (locale === 'ar' ? String(n).replace(/\d/g, (d) => DIGITS_AR[d]) : String(n));
/** The IR as one edition reads it: mapped names, generated names for unnamed decisions and steps. */
export function localIR(ir, locale, L = {}) {
  const x = JSON.parse(JSON.stringify(ir));
  let dn = 0, sn = 0;
  for (const a of x.actors) a.name = a.names?.[locale] || a.name;
  for (const s of x.steps) {
    s.name = s.names?.[locale] || s.name || '';
    if (RAW_ID.test(s.name)) s.name = '';
    // a gateway named after the variable it tests ("action", "decision", "gateway"…) is unnamed for a reader
    if (s.type === 'decision' && GENERIC_GATE.test(s.name || '') && !s.names?.[locale]) s.name = '';
    if (s.type === 'decision' && !s.name) s.name = `${L.decisionN || (locale === 'ar' ? 'قرار' : 'Decision')} ${numIn(++dn, locale)}`;
    if ((s.type === 'task' || s.type === 'system') && !s.name) s.name = `${L.stepN || (locale === 'ar' ? 'خطوة' : 'Step')} ${numIn(++sn, locale)}`;
  }
  for (const f of x.flows) {
    f.label = f.names?.[locale] || f.label;
    // a condition is an engine expression: with a label it adds nothing a reader needs; without one, say it plainly
    if (isExpr(f.condition)) f.condition = f.label ? undefined : plainCond(f.condition);
  }
  x.name = ir.names?.[locale] || ir.name;
  return x;
}

/** Pick the parser from the content. */
export async function parseModel(text, { inflateRaw, name, roles } = {}) {
  const t = String(text).trim();
  let ir;
  if (t.startsWith('<')) {
    if (/<(\w+:)?definitions[\s>]/.test(t) && /bpmn|omg\.org\/spec\/BPMN/i.test(t)) ir = parseBpmn(t);
    else if (/<mxfile|<mxGraphModel/.test(t)) ir = await parseDrawio(t, inflateRaw);
    else throw new Error('XML that is neither BPMN 2.0 nor draw.io');
  } else if (/^\{/.test(t) && /"(graph|nodes)"\s*:/.test(t) && /"edges"\s*:/.test(t)) ir = parseGraph(t);
  else ir = parseSteps(t);
  applyNames(ir, roles || {});
  if (name) { ir.name = name; delete ir.names; } // the user's name wins in both editions
  return ir;
}

/* ── the human view: people's steps only, system steps collapsed ─────── */
const VISIBLE = new Set(['task', 'decision', 'start', 'end']);
export function humanGraph(ir) {
  const byId = Object.fromEntries(ir.steps.map((s) => [s.id, s]));
  const out = (id) => ir.flows.filter((f) => f.from === id);
  const edges = [];
  for (const s of ir.steps.filter((x) => VISIBLE.has(x.type))) {
    const seen = new Set();
    const go = (id, label, via) => {
      for (const f of out(id)) {
        const t = byId[f.to];
        if (!t || seen.has(f.to)) continue;
        seen.add(f.to);
        const lab = label || f.label || f.condition || (t.type === 'timer' ? t.timer || t.name : '') || '';
        const isTimer = via === 'timer' || t.type === 'timer' || f.timer;
        if (VISIBLE.has(t.type)) edges.push({ from: s.id, to: t.id, label: lab, condition: f.condition, timer: isTimer ? true : undefined });
        else go(t.id, lab, isTimer ? 'timer' : via);
      }
    };
    go(s.id, '', '');
  }
  const nodes = ir.steps.filter((x) => VISIBLE.has(x.type));
  return { nodes, edges };
}

/* ── the workflow figure (SVG): lanes per actor, people's steps only ──── */
const escX = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wrapText(s, max = 16) {
  const words = String(s).split(/\s+/);
  const lines = [''];
  for (const w of words) { if ((lines.at(-1) + ' ' + w).trim().length > max && lines.at(-1)) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim(); }
  return lines.slice(0, 3);
}
export function processFigure(ir, { locale = 'en', L = {} } = {}) {
  const { nodes, edges } = humanGraph(ir);
  const rank = {};
  const starts = nodes.filter((n) => n.type === 'start');
  const queue = (starts.length ? starts : nodes.slice(0, 1)).map((n) => [n.id, 0]);
  while (queue.length) {
    const [id, r] = queue.shift();
    if (rank[id] !== undefined && rank[id] >= r) continue;
    if (r > nodes.length) continue;
    rank[id] = r;
    for (const e of edges.filter((x) => x.from === id)) if (rank[e.to] === undefined) queue.push([e.to, r + 1]);
  }
  let maxR = Math.max(0, ...Object.values(rank));
  for (const n of nodes) if (rank[n.id] === undefined) rank[n.id] = ++maxR;
  const lanes = [...ir.actors];
  const laneIdx = (n) => {
    if (n.actor) return lanes.findIndex((a) => a.id === n.actor);
    const pred = edges.find((e) => e.to === n.id);
    const p = pred && nodes.find((x) => x.id === pred.from);
    return p?.actor ? lanes.findIndex((a) => a.id === p.actor) : 0;
  };
  const colW = 175, padL = 130, padT = 16, cellH = 76;
  const cols = maxR + 1;
  const W = padL + cols * colW + 20;
  // each lane is as tall as its busiest column, so stacked steps never overlap
  const laneOfNode = Object.fromEntries(nodes.map((n) => [n.id, Math.max(0, laneIdx(n))]));
  const stack = {};
  const slotOf = {};
  for (const n of nodes) { const key = `${rank[n.id]}:${laneOfNode[n.id]}`; slotOf[n.id] = stack[key] = (stack[key] ?? -1) + 1; }
  const laneRows = lanes.map((_, li) => 1 + Math.max(0, ...Object.entries(stack).filter(([k]) => +k.split(':')[1] === li).map(([, v]) => v)));
  if (!lanes.length) laneRows.push(1);
  const laneTop = [];
  let y0 = padT;
  for (const r of laneRows) { laneTop.push(y0); y0 += r * cellH + 24; }
  const H = y0 + 10;
  const pos = {};
  for (const n of nodes) pos[n.id] = { x: padL + rank[n.id] * colW + colW / 2, y: laneTop[laneOfNode[n.id]] + 12 + cellH / 2 + slotOf[n.id] * cellH };
  const half = (n) => (n.type === 'start' ? 16 : n.type === 'decision' ? 55 : n.type === 'end' ? 60 : 62);
  const rtl = locale === 'ar';
  const X = (x) => (rtl ? W - x : x);
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="sans-serif" font-size="13" direction="ltr" style="direction:ltr">`);
  // coordinates are physical (RTL is mirrored above); each label keeps its own reading order
  out.push('<style>text{unicode-bidi:plaintext}</style>');
  out.push('<defs><marker id="bwa" viewBox="0 0 10 10" markerWidth="7" markerHeight="7" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#44433f"/></marker></defs>');
  lanes.forEach((a, i) => {
    const y = laneTop[i];
    const h = laneRows[i] * cellH + 24;
    out.push(`<rect x="0" y="${y}" width="${W}" height="${h}" fill="${i % 2 ? '#f6f4ee' : '#fafaf9'}" stroke="#dcd6c6"/>`);
    wrapText(a.name, 14).forEach((ln, k) => out.push(`<text x="${X(12)}" y="${y + h / 2 + k * 15}" text-anchor="${rtl ? 'end' : 'start'}" font-weight="700" fill="#003c7a">${escX(ln)}</text>`));
  });
  for (const e of edges) {
    const a = pos[e.from], b = pos[e.to];
    if (!a || !b) continue;
    const back = rank[e.to] <= rank[e.from];
    const na = nodes.find((n) => n.id === e.from), nb = nodes.find((n) => n.id === e.to);
    const x1 = X(a.x + (back ? 0 : half(na))), y1 = a.y + (back ? 28 : 0), x2 = X(b.x - (back ? 0 : half(nb))), y2 = b.y + (back ? 28 : 0);
    const path = back ? `M${x1},${y1} C${x1},${Math.max(y1, y2) + 46} ${x2},${Math.max(y1, y2) + 46} ${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    out.push(`<path d="${path}" fill="none" stroke="${e.timer ? '#8a4a12' : '#44433f'}" stroke-width="1.6"${e.timer ? ' stroke-dasharray="5 4"' : ''} marker-end="url(#bwa)"/>`);
    if (e.label) {
      const mx = (x1 + x2) / 2, my = back ? Math.max(y1, y2) + 40 : (y1 + y2) / 2 - 6;
      out.push(`<text x="${mx}" y="${my}" text-anchor="middle" fill="#3f3e3a" font-size="11">${escX(e.label.length > 28 ? e.label.slice(0, 27) + '…' : e.label)}</text>`);
    }
  }
  for (const n of nodes) {
    const p = pos[n.id];
    const x = X(p.x);
    const lines = wrapText(n.name || (n.type === 'start' ? L.start || 'Start' : n.type === 'end' ? L.end || 'End' : ''), n.type === 'decision' ? 12 : 18);
    if (n.type === 'decision') out.push(`<path d="M${x},${p.y - 30} L${x + 55},${p.y} L${x},${p.y + 30} L${x - 55},${p.y} Z" fill="#f4e7b2" stroke="#8b5a05" stroke-width="1.5"/>`);
    else if (n.type === 'start') out.push(`<circle cx="${x}" cy="${p.y}" r="16" fill="#adcbbe" stroke="#065a44" stroke-width="1.5"/>`);
    else if (n.type === 'end') out.push(`<rect x="${x - 60}" y="${p.y - 20}" width="120" height="40" rx="20" fill="#d6e1a0" stroke="#3f680f" stroke-width="1.5"/>`);
    else out.push(`<rect x="${x - 62}" y="${p.y - 26}" width="124" height="52" rx="8" fill="#e1eaf4" stroke="#003c7a" stroke-width="1.5"/>`);
    if (n.type !== 'start') lines.forEach((ln, k) => out.push(`<text x="${x}" y="${p.y + 4 + (k - (lines.length - 1) / 2) * 15}" text-anchor="middle" fill="#1b1813">${escX(ln)}</text>`));
  }
  out.push('</svg>');
  return out.join('');
}

/* ── IR → document JSON (one edition) ─────────────────────────────────── */
export function modelToDocument(irIn, { locale = 'en', L, today = new Date().toISOString().slice(0, 10), code } = {}) {
  const ir = localIR(irIn, locale, L);
  const { nodes, edges } = humanGraph(ir);
  const actorName = (id) => ir.actors.find((a) => a.id === id)?.name || L.unassigned;
  const nameOf = (id) => { const n = ir.steps.find((s) => s.id === id); return n?.name || (n?.type === 'end' ? L.end : n?.type === 'start' ? L.start : id); };
  const tasks = nodes.filter((n) => n.type === 'task');
  const decisions = nodes.filter((n) => n.type === 'decision');
  const ends = nodes.filter((n) => n.type === 'end');
  const name = ir.name || L.untitled;
  const svc = slug(irIn.name || name);
  const gaps = [];
  for (const a of ir.actors.filter((x) => x.unresolved)) gaps.push({ id: `Q${gaps.length + 1}`, question: (L.gapRole || 'Which role is «{x}»?').replace('{x}', a.raw || a.name), owner: L.ownerAnalyst, blocks: '2' });
  for (const t of tasks) if (!t.actor) gaps.push({ id: `Q${gaps.length + 1}`, question: L.gapActor.replace('{x}', t.name), owner: L.ownerAnalyst, blocks: '2' });
  if (!ends.length) gaps.push({ id: `Q${gaps.length + 1}`, question: L.gapEnd, owner: L.ownerAnalyst, blocks: '6' });
  const rules = [];
  const when = (e) => (e.label ? (e.condition && e.condition !== e.label ? `${e.label} (${e.condition})` : e.label) : e.condition || L.otherwise);
  for (const d of decisions) for (const e of edges.filter((x) => x.from === d.id && !x.timer)) rules.push([`BR-${String(rules.length + 1).padStart(2, '0')}`, L.ruleDecision.replace('{d}', d.name || L.decision).replace('{c}', when(e)).replace('{t}', nameOf(e.to))]);
  for (const e of edges.filter((x) => x.timer)) rules.push([`BR-${String(rules.length + 1).padStart(2, '0')}`, L.ruleTimer.replace('{s}', nameOf(e.from)).replace('{d}', e.label || '').replace('{t}', nameOf(e.to))]);
  const stories = tasks.map((t, k) => {
    const nexts = edges.filter((e) => e.from === t.id);
    const st = {
      id: `US-${String(k + 1).padStart(2, '0')}`,
      name: t.name,
      as: actorName(t.actor),
      want: L.storyWant.replace('{t}', t.name),
      so: nexts.length ? L.storySo.replace('{t}', nameOf(nexts[0].to)) : L.storySoEnd,
      acceptance: [
        ...(t.fields || []).filter((f) => f.required).map((f) => L.accRequired.replace('{f}', f.label)),
        ...nexts.map((e) => L.accNext.replace('{c}', e.label || e.condition || L.done).replace('{t}', nameOf(e.to))),
      ],
    };
    if (nexts.length) st.actions = { columns: [L.colAction, L.colEffect], rows: nexts.map((e) => [e.label || e.condition || L.done, L.effectGoes.replace('{t}', nameOf(e.to))]) };
    if (t.fields?.length) st.dictionary = { columns: [L.colField, L.colType, L.colRequired, L.colOptions], rows: t.fields.map((f) => [f.label, f.type, f.required ? L.yes : L.no, (f.options || []).join(L.listSep) || '']) };
    if (!st.acceptance.length) st.acceptance = [L.accDone.replace('{t}', t.name)];
    return st;
  });
  const sec = (number, title, blocks) => ({ number, title, blocks });
  const chapters = [
    { number: '1', title: L.chIntro, sections: [sec('1.1', L.secPurpose, [{ kind: 'prose', paragraphs: [L.introModel.replace('{name}', name), L.introSource.replace('{s}', L['src_' + ir.source] || ir.source)] }])] },
    { number: '2', title: L.chActors, sections: [sec('2.1', L.chActors, [{ kind: 'table', columns: [L.colActor, L.colTasks], rows: ir.actors.map((a) => [a.name, tasks.filter((t) => t.actor === a.id).map((t) => t.name).join(L.listSep) || L.none]) }])] },
    { number: '3', title: L.chWorkflow, sections: [sec('3.1', L.chWorkflow, [{ kind: 'diagram', caption: L.figureCaption.replace('{name}', name), model: DIAGRAM.fromGraph(humanGraph(ir), { actors: ir.actors, locale }) }])] },
    { number: '4', title: L.chSteps, sections: [sec('4.1', L.chSteps, [{ kind: 'table', columns: [L.colStep, L.colActor, L.colNext], rows: [...tasks, ...decisions].map((n) => [n.name || L.decision, n.actor ? actorName(n.actor) : L.none, edges.filter((e) => e.from === n.id).map((e) => (e.label ? `${e.label}: ` : '') + nameOf(e.to)).join(L.listSep) || L.none]) }])] },
    { number: '5', title: L.chRules, sections: [sec('5.1', L.chRules, [rules.length ? { kind: 'table', columns: [L.colCode, L.colRule], rows: rules } : { kind: 'prose', paragraphs: [L.noRules] }])] },
    { number: '6', title: L.chStories, sections: tasks.length ? [sec('6.1', L.chStories, [{ kind: 'stories', number: '6.1', lead: L.storyCards, items: stories }])] : [sec('6.1', L.chStories, [{ kind: 'prose', paragraphs: [L.noTasks] }])] },
    { number: '7', title: L.chStatuses, sections: [sec('7.1', L.chStatuses, [{ kind: 'table', columns: [L.colStatus, L.colAfter], rows: ends.map((e) => [e.name || L.end, edges.filter((x) => x.to === e.id).map((x) => nameOf(x.from)).join(L.listSep) || L.none]) }])] },
  ];
  return {
    service: svc,
    composedAt: new Date().toISOString(),
    control: { documentId: docCode(code || irIn.key || irIn.name), title: `${L.titlePrefix}: ${name}`, preparedBy: '', documentType: L.docType, classification: L.classification, owner: '', issuedOn: today, version: 'V0.1', status: L.draft, reviewCycle: '' },
    revisions: [['V0.1', today]],
    approvals: [],
    chapters,
    openQuestions: gaps,
    process: irIn,
  };
}
