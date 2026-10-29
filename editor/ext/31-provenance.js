/* A13 Provenance + A17 tamper-evident history (design.md §3 A13, A17). One bwlog v1 log per document (engine/ledger-v1.mjs,
 * concatenated before this file as BWLOG1): every open, op (exact diff), save, Save-HTML, export, sign, share, lock and
 * unlock, signed with this install's non-extractable ECDSA key. The encrypted log travels inside every Save-HTML
 * (bw-data → prov) and is mirrored in HISTORY (served: the workspace; file://: IndexedDB bw-history). Checked on open. */
const PV_ON = typeof BWLOG1 !== 'undefined'; // engine/ledger-v1.mjs is concatenated before the extensions (build-editor)
const PV = { logs: {}, keys: null, q: Promise.resolve(), ready: null, readyRes: null, opened: new Set(), openLogged: new Set(), typing: {} };
PV.ready = new Promise((res) => { PV.readyRes = res; }); // resolved by boot once the logs are loaded
const pvHttp = () => location.protocol.startsWith('http');

function pvIdb(name, store) {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => r.result.createObjectStore(store); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('idb blocked')); });
  const run = async (mode, f) => { const db = await open(); try { return await new Promise((res, rej) => { const tx = db.transaction(store, mode); const r = f(tx.objectStore(store)); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); }); } finally { db.close(); } };
  return { get: (k) => run('readonly', (s) => s.get(k)), put: (k, v) => run('readwrite', (s) => s.put(v, k)) };
}
/** This install's signing key: non-extractable in IndexedDB; where IndexedDB is unavailable, an exportable key in localStorage. */
async function pvKeys() {
  const id = PF.id();
  try {
    const db = pvIdb('bw-keys', 'k');
    let k = await db.get(id);
    if (!k) { k = await BWLOG1.newKeys(false); await db.put(id, k); }
    return k;
  } catch {
    const raw = ls.get('bw:actor-key');
    if (raw) { const j = JSON.parse(raw); return { privateKey: await crypto.subtle.importKey('jwk', j.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), jwk: j.jwk, kid: j.kid }; }
    const k = await BWLOG1.newKeys(true);
    ls.set('bw:actor-key', JSON.stringify({ priv: await crypto.subtle.exportKey('jwk', k.privateKey), jwk: k.jwk, kid: k.kid }));
    return k;
  }
}
const MIRROR = {
  async get(doc) {
    if (pvHttp()) { try { return await (await fetch(`/api/history?doc=${encodeURIComponent(doc)}`)).json(); } catch { return {}; } }
    try { return (await pvIdb('bw-history', 'logs').get(doc)) || {}; } catch { return {}; }
  },
  async put(doc, log, mirror) {
    if (pvHttp()) { try { await fetch('/api/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ doc, log, mirror }) }); } catch { /* offline: the HTML still carries the log */ } return; }
    try {
      const db = pvIdb('bw-history', 'logs');
      const old = (await db.get(doc))?.mirror;
      const keep = old?.head && (!mirror.head || old.head.seq > mirror.head.seq) ? old : mirror; // the head never moves back
      await db.put(doc, { log, mirror: { ...keep, pins: { ...(mirror.pins || {}), ...(old?.pins || {}) } } });
    } catch { /* storage blocked */ }
  },
};
const pvIsDoc = (svc) => /^doc-/.test(String(svc || '')); // a library document (10-library): its id is stable everywhere
const pvDocId = (svc) => DATA.prov?.[svc]?.doc || (pvIsDoc(svc) ? svc : null) || (() => { const k = `bw:prov-doc:${DATA.setId}:${svc}`; let d = ls.get(k); if (!d) { d = crypto.randomUUID(); ls.set(k, d); } return d; })();
/** The document state to check a log against, per edition {hash, ops}; the hash is taken from the text itself, so a
 *  hand-edited `raw` with its old `hash` kept is a change too. `snap` = the session's state taken at
 *  the open event (pvSnap: a library document), else the state the file was opened with. */
const pvSnap = (svc) => Object.fromEntries(Object.entries(M[svc] || {}).map(([ed, e]) => [ed, { raw: e.raw, hash: e.hash, ops: [...(e.ops || [])] }]));
async function pvEditions(svc, snap) {
  const src = snap || DATA.services.find((s) => s.id === svc)?.editions || {};
  const out = {};
  for (const [ed, e] of Object.entries(src)) out[ed] = { hash: typeof e.raw === 'string' ? await pvDigest(e.raw) : e.hash, ops: e.ops || [] };
  return out;
}
const pvLastDh = (L) => [...L.entries].reverse().find((e) => e.docHash)?.docHash;

/**
 * Attaches the log of one document. `snap` absent = a service of the file at boot; given = a document opened later through
 * the `open` event (library, new, import, duplicate, resumed tab). Sources, in order:
 *  file: the log the file carries; else, when the file carries no edits, this machine's mirror (a template's log).
 *  snap: this machine's mirror; else the log its library entry carries (`entry.prov`, an imported or copied file);
 *        else the log of an open document whose head vouches for exactly this state (Save of a template, a copy).
 * An edited document with none of these is «stripped»: it is never shown as intact.
 */
async function pvLoad(svc, snap = null) {
  const live = !!snap;
  const doc = pvDocId(svc);
  const mir = await MIRROR.get(doc);
  const L = { doc, entries: [], verdict: { ok: true, issues: [] }, src: 'new', mirror: mir.mirror || null };
  const eds = await pvEditions(svc, snap);
  const edited = Object.values(eds).some((e) => e.ops.length);
  let carried = live ? null : DATA.prov?.[svc] ? { doc, log: DATA.prov[svc].log } : null;
  const ent = live && !mir.log ? await Promise.resolve(EXT.library?.get?.(svc)).catch(() => null) : null;
  if (ent?.prov?.log) carried = { doc: ent.prov.doc || doc, log: ent.prov.log }; // an imported file's log (10-library keeps it)
  try {
    if (carried) { Object.assign(L, await BWLOG1.unseal(carried.log, carried.doc)); L.doc = doc; L.src = live ? 'entry' : 'html'; if (carried.doc !== doc) L.from = carried.doc; }
    else if (mir.log && (live || !edited)) { Object.assign(L, await BWLOG1.unseal(mir.log, doc)); L.doc = doc; L.src = 'mirror'; }
    else if (live && edited) {
      // the chain up to an entry that vouches for exactly this state is this document's history too
      const dh = await pvDigest(BWLOG1.canonical(BWLOG1.stateOf(eds)));
      const pool = Object.values(PV.logs).filter((x) => x.doc !== doc && x.verdict.ok);
      if (ent?.from && !pool.some((x) => x.doc === ent.from)) { const m2 = await MIRROR.get(ent.from); if (m2.log) pool.push({ doc: ent.from, ...(await BWLOG1.unseal(m2.log, ent.from)) }); } // a copy names its source (10-library)
      let best = null;
      for (const x of pool) { const k = x.entries.findLastIndex((e) => e.docHash === dh); if (k >= 0 && (!best || k > best.k)) best = { x, k }; }
      if (best) { L.entries = JSON.parse(JSON.stringify(best.x.entries.slice(0, best.k + 1))); L.src = 'fork'; L.from = best.x.doc; }
    }
  } catch { L.verdict = { ok: false, issues: [{ seq: 0, reason: 'unreadable' }] }; L.entries = []; return (PV.logs[svc] = L); }
  // a log continued from this machine's mirror is newer than any file state: only its chain and head are checked
  L.verdict = await BWLOG1.verify(L, { mirror: L.from ? null : L.mirror, editions: L.src === 'mirror' ? undefined : eds, saved: L.src === 'html' || L.src === 'entry' });
  L.pins = L.verdict.pins;
  return (PV.logs[svc] = L);
}
const pvWarn = (L) => { if (pvBad(L)) toast(t('pvTampered'), 'warn', { persist: true, actions: [[t('pvShow'), () => openDrawer('provenance')]] }); };

const pvState = (svc) => BWLOG1.canonical(BWLOG1.stateOf(M[svc]));
const pvBad = (L) => !!L && !L.verdict.ok;
const pvDigest = async (s) => `sha256:${BWLOG1.hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))}`;
/** Queues one entry; the document state is taken now, hashed in the queue. Returns the queue (await it to be sure it is written). */
function pvAppend(kind, data = {}, svc = S.svc) {
  const state = M[svc] ? pvState(svc) : '';
  const at = new Date().toISOString();
  PV.q = PV.q.then(async () => {
    await PV.ready;
    const L = PV.logs[svc];
    if (!L || !PV.keys) return;
    await BWLOG1.append(L, { kind, data, at, actor: PF.actor(), keys: PV.keys, docHash: state ? await pvDigest(state) : '' });
    if (kind === 'open') PV.openLogged.add(svc);
    await pvMirror(svc); // written before the queue moves on: a tab closed right after an edit keeps it
  }).catch((e) => console.error('bwlog', e));
  return PV.q;
}
// ponytail: re-seals the whole log on every entry; batch it if logs reach many thousands of entries
async function pvMirror(svc) {
  const L = PV.logs[svc];
  if (!L) return;
  const env = await BWLOG1.seal(L);
  const m = BWLOG1.mirrorOf(L, L.mirror, L.pins || {});
  L.mirror = m;
  await MIRROR.put(L.doc, env, m);
}
/** Typing merges into one op: its final text is logged after a pause, or before anything else is logged. */
function pvFlushTyping() {
  for (const [key, x] of Object.entries(PV.typing)) { clearTimeout(x.timer); delete PV.typing[key]; pvAppend('op', { ed: x.ed, op: JSON.parse(JSON.stringify(x.op)), typed: true }, x.svc); }
}
function pvPings(svc = S.svc) { const p = EXT.profile?.takePings() || []; if (p.length) pvAppend('x-active', { pings: p }, svc); }
/** Anything that changed the document outside a logged edit (an import merge, a recovered draft) is logged as a merge. */
function pvCatchUp(svc = S.svc) {
  const state = M[svc] ? pvState(svc) : '';
  PV.q = PV.q.then(async () => {
    await PV.ready;
    const L = PV.logs[svc];
    // not before this session's «open» entry: the boot render comes first, and the open is the baseline, not a merge
    if (!L || !state || !PV.openLogged.has(svc)) return;
    const now = await pvDigest(state);
    const last = [...L.entries].reverse().find((e) => e.docHash)?.docHash;
    if (last === now) return;
    const seen = new Set(L.entries.filter((e) => e.data?.op?.id).map((e) => e.data.op.id));
    const ops = Object.entries(M[svc]).flatMap(([ed, e]) => e.ops.filter((o) => !seen.has(o.id)).map((o) => ({ ed, op: o })));
    await BWLOG1.append(L, { kind: 'merge', data: { ops: JSON.parse(JSON.stringify(ops)) }, actor: PF.actor(), keys: PV.keys, docHash: now });
    await pvMirror(svc); // written before the queue moves on: a tab closed right after an edit keeps it
  }).catch((e) => console.error('bwlog', e));
  return PV.q;
}
async function pvSettle(svc = S.svc) { pvFlushTyping(); pvPings(svc); await pvCatchUp(svc); }

/* Save HTML: the log is completed (saveHtml entry included) and sealed before the editor writes the file */
const pvSaveHtml0 = saveHtml;
if (PV_ON) saveHtml = async function pvSaveHtml(embedFonts) {
  await PV.ready; await PV.q; // the document's log is attached (the open event) before it is sealed into the file
  await pvSettle();
  await pvAppend('saveHtml', {});
  const L = PV.logs[S.svc];
  PV.sealed = L ? { svc: S.svc, doc: L.doc, log: await BWLOG1.seal(L), contrib: pvContributors(L).map((c) => ({ id: c.id, kid: c.kid })) } : null;
  return pvSaveHtml0(embedFonts);
};
if (PV_ON) window.BW.saveHtml = saveHtml;

function pvContributors(L) {
  const by = {};
  for (const e of L.entries) { const c = (by[e.actor.id] ||= { id: e.actor.id, name: e.actor.name, kid: e.actor.kid, first: e.at, last: e.at, n: 0 }); c.last = e.at; c.n += 1; if (e.actor.name) c.name = e.actor.name; }
  if (by[PF.id()] && !by[PF.id()].name) by[PF.id()].name = PF.actor().name; // named after the first entries (the first-launch card)
  return Object.values(by);
}
const pvTime = (iso) => { const d = new Date(iso); return { local: d.toLocaleString(S.ui === 'ar' ? 'ar-JO' : 'en-GB'), utc: d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' }; };
const pvShort = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s === undefined ? '' : s.length > 400 ? s.slice(0, 400) + '…' : s; };
function pvEntryHtml(e, issueAt, names = {}) {
  const tm = pvTime(e.at);
  const op = e.data?.op;
  const what = e.kind === 'op' && op ? `${t('pvk_op')} · ${op.op} ${op.path || ''}` : e.kind === 'op' && (e.data.undo || e.data.redo) ? t(e.data.undo ? 'pvUndo' : 'pvRedo') : t('pvk_' + e.kind) === 'pvk_' + e.kind ? e.kind : t('pvk_' + e.kind);
  const diff = op ? `<div class="diff">${op.from ? `<div><b>${esc(t('pvFrom'))}</b> <code>${esc(op.from)}</code></div>` : ''}${op.old !== undefined ? `<del>${esc(pvShort(op.old))}</del>` : ''}${op.value !== undefined ? `<ins>${esc(pvShort(op.value))}</ins>` : ''}</div>` : '';
  return `<li class="pv-e${issueAt.has(e.seq) ? ' bad' : ''}" data-actor="${esc(e.actor.id)}" data-kind="${esc(e.kind)}"><details><summary><b>${esc(e.actor.name || names[e.actor.id] || t('pfNoName'))}</b> · ${esc(what)} · <time datetime="${esc(e.at)}">${esc(tm.local)}</time>${issueAt.has(e.seq) ? ` <span class="badge">${esc(issueAt.get(e.seq))}</span>` : ''}</summary>
<dl><dt>${esc(t('pvWhen'))}</dt><dd>${esc(tm.local)} · ${esc(tm.utc)}</dd><dt>${esc(t('pvWho'))}</dt><dd>${esc(e.actor.name || '—')} <code>${esc(e.actor.kid)}</code></dd><dt>#</dt><dd>${e.seq} · <code>${esc(e.hash.slice(0, 16))}</code></dd></dl>${diff}${!op && Object.keys(e.data || {}).length ? `<pre>${esc(pvShort(e.data))}</pre>` : ''}</details></li>`;
}
function pvDrawer() {
  const L = PV.logs[S.svc];
  if (!L) return { title: t('pvTitle'), html: `<p class="hint">…</p>` };
  const issueAt = new Map(L.verdict.issues.map((i) => [i.seq, t('pvr_' + i.reason)]));
  const people = pvContributors(L);
  const met = BWLOG1.metrics(L.entries);
  const kinds = [...new Set(L.entries.map((e) => e.kind))];
  const status = L.verdict.ok ? `<p class="ok pv-status"><span class="i">${ic('ok')}</span> ${esc(t('pvChainOk', { n: L.entries.length }))}</p>`
    : `<div class="err pv-status" role="alert"><p><span class="i">${ic('err')}</span> <b>${esc(t('pvTampered'))}</b></p><ul>${L.verdict.issues.map((i) => `<li>#${i.seq} · ${esc(t('pvr_' + i.reason))}</li>`).join('')}</ul></div>`;
  const mins = (ms) => Math.round(ms / 6e4);
  return {
    title: t('pvTitle'),
    html: `${pvTabs('provenance')}${status}
<h3>${esc(t('pvPeople'))}</h3><table class="pv-people"><thead><tr><th>${esc(t('pvWho'))}</th><th>${esc(t('pvKey'))}</th><th>${esc(t('pvEdits'))}</th><th>${esc(t('pvActive'))}</th><th>${esc(t('pvSessions'))}</th><th>${esc(t('pvSaves'))}</th><th>${esc(t('pvSigns'))}</th></tr></thead><tbody>${people.map((p) => { const m = met[p.id] || {}; return `<tr><td>${esc(p.name || t('pfNoName'))}</td><td><code>${esc(p.kid)}</code> ${L.verdict.issues.some((i) => L.entries[i.seq]?.actor.id === p.id) ? '✕' : '✓'}</td><td>${m.edits || 0}</td><td>${mins(m.activeMs || 0)} ${esc(t('pvMin'))}</td><td>${m.sessions || 0}</td><td>${m.saves || 0}</td><td>${m.signs || 0}</td></tr>`; }).join('')}</tbody></table>
<div class="pv-filter"><label>${esc(t('pvWho'))}<select data-pv="who"><option value="">${esc(t('pvAll'))}</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name || t('pfNoName'))}</option>`).join('')}</select></label><label>${esc(t('pvKind'))}<select data-pv="kind"><option value="">${esc(t('pvAll'))}</option>${kinds.map((k) => `<option value="${esc(k)}">${esc(t('pvk_' + k) === 'pvk_' + k ? k : t('pvk_' + k))}</option>`).join('')}</select></label></div>
<div class="btns"><button type="button" class="b" data-pv="sign"><span class="w">${esc(t('pvSign'))}</span></button><button type="button" class="b" data-pv="lock"><span class="w">${esc(t(LK[S.svc]?.locked ? 'lkUnlock' : 'lkLock'))}</span></button><button type="button" class="b" data-pv="share"><span class="w">${esc(t('shShare'))}</span></button></div>
<ol class="list pv-log">${[...L.entries].reverse().map((e) => pvEntryHtml(e, issueAt, Object.fromEntries(people.map((p) => [p.id, p.name])))).join('')}</ol>`,
    mount: (d) => {
      const filt = () => { const w = d.querySelector('[data-pv="who"]').value, k = d.querySelector('[data-pv="kind"]').value; d.querySelectorAll('.pv-e').forEach((li) => { li.hidden = (w && li.dataset.actor !== w) || (k && li.dataset.kind !== k); }); };
      d.addEventListener('change', (e) => { if (e.target.closest('[data-pv]')) filt(); });
      d.addEventListener('click', (e) => { const k = e.target.closest('[data-pv]')?.dataset.pv; if (k === 'tab-history') openDrawer('history'); if (k === 'sign') runAction('pvSign'); if (k === 'lock') runAction('lkToggle').then(() => S.drawer === 'provenance' && openDrawer('provenance')); if (k === 'share') runAction('shShare'); });
    },
  };
}
/* «المصدر» as a tab of the Changes drawer (history): a tab pair at the top of both drawers */
const pvTabs = (on) => `<div class="btns pv-tabs" role="group"><button type="button" class="b" data-pv="tab-history" aria-pressed="${on === 'history'}"><span class="w">${esc(t('historyTitle'))}</span></button><button type="button" class="b" data-pv="tab-prov" aria-pressed="${on === 'provenance'}"><span class="w">${esc(t('pvTitle'))}</span></button></div>`;
function pvTabWire() {
  const d = root.querySelector('.drawer');
  if (!d || d.hidden || S.drawer !== 'history' || d.querySelector('.pv-tabs')) return;
  d.querySelector('header')?.insertAdjacentHTML('afterend', pvTabs('history'));
  d.querySelector('[data-pv="tab-prov"]').addEventListener('click', () => openDrawer('provenance'));
}
async function pvSign() {
  const k = await bwModal({ title: t('pvSign'), html: `<p>${esc(t('pvSignNote'))}</p>`, buttons: [['cancel', t('pvCancel')], ['ok', t('pvSign'), true]] });
  if (k !== 'ok') return;
  await pvSettle();
  const dh = await pvDigest(pvState(S.svc));
  await pvAppend('sign', { docHash: dh, name: PF.actor().name });
  flash(t('pvSigned'));
  if (S.drawer === 'provenance') openDrawer('provenance');
}

/** The open of one document: its log attached (once), then «open» logged. */
function pvOpen(svc) {
  if (PV.opened.has(svc)) return;
  PV.opened.add(svc);
  // every open path (boot, the documents list, new, import, duplicate, a resumed tab) attaches the log here, then logs
  // «open». The state is taken now: an edit made before the log is read waits behind it in the queue and is logged
  const snap = M[svc] ? pvSnap(svc) : null, state = M[svc] ? pvState(svc) : '';
  PV.q = PV.q.then(async () => {
    await PV.ready;
    if (!PV.logs[svc] && PV.keys && snap) { await pvLoad(svc, snap); pvWarn(PV.logs[svc]); }
    const L = PV.logs[svc];
    if (!L || !PV.keys) return;
    const ed = S.svc === svc ? S.ed : Object.keys(M[svc] || {})[0];
    await BWLOG1.append(L, { kind: 'open', data: { title: cur(ed, svc)?.doc?.control?.title || svc, src: L.src, ...(L.from ? { from: L.from } : {}), verdict: L.verdict.issues.map((i) => `${i.seq}:${i.reason}`) }, actor: PF.actor(), keys: PV.keys, docHash: state ? await pvDigest(state) : '' });
    PV.openLogged.add(svc);
    await pvMirror(svc); // written before the queue moves on: a tab closed right after an edit keeps it
    if (S.drawer === 'provenance' && S.svc === svc) openDrawer('provenance');
  }).catch((e) => console.error('bwlog', e));
}
if (PV_ON) IC.pvOpen = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" /> </svg>';
if (PV_ON) IC.pvSign = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" > <path d="M12 20h9" /> <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" /> </svg>';
if (PV_ON) bwExt({
  // toolbar tools in «الوثيقة» (the seam draws them on the first mount); also reached from the Changes tab, the Settings
  // trust card and the tamper banner
  cmds: [{ id: 'pvOpen', group: 'document', edit: false }, { id: 'pvSign', group: 'document', edit: false }],
  actions: { pvOpen: () => openDrawer('provenance'), pvSign },
  drawers: { provenance: pvDrawer },
  expose: {
    ledger: {
      authorOf: (opId) => { for (const L of Object.values(PV.logs)) { const e = L.entries.find((x) => x.data?.op?.id === opId); if (e) return e.actor.name; } return ''; },
      log: (svc = S.svc) => PV.logs[svc],
      attached: (svc = S.svc) => !!PV.logs[svc],
      append: pvAppend, settle: pvSettle, ready: () => PV.ready.then(() => PV.q),
    },
  },
  // no edit escapes the log: a document whose log is neither attached nor on its way (no open event) refuses changes;
  // an edit made while it is loading is queued behind it (pvAppend waits for the queue), never dropped
  guards: [() => (!PV.broken && (PV.logs[S.svc] || PV.opened.has(S.svc)) ? true : t('pvWaitLog'))],
  on: {
    boot: () => {
      new MutationObserver(pvTabWire).observe(root, { childList: true, subtree: true }); // the tab in the Changes drawer
      (async () => {
        PV.keys = await pvKeys();
        await Promise.all(DATA.services.map((s) => pvLoad(s.id)));
        Object.values(PV.logs).forEach(pvWarn);
      })().catch((e) => { PV.broken = true; console.error('bwlog', e); }).finally(() => PV.readyRes());
    },
    open: (svc) => pvOpen(svc),
    commit: (ops, ed, kind) => {
      const svc = S.svc;
      if (kind === 'type') { const key = `${svc}|${ed}|${ops[0].id}`; clearTimeout(PV.typing[key]?.timer); PV.typing[key] = { svc, ed, op: ops[0], timer: setTimeout(pvFlushTyping, 1200) }; return; }
      pvFlushTyping();
      if (kind === 'undo' || kind === 'redo') { pvAppend('op', { ed, [kind]: ops.map((o) => o.id) }, svc); return; }
      for (const op of ops) pvAppend('op', { ed, op: JSON.parse(JSON.stringify(op)) }, svc);
    },
    // a path that switches the document without the open event (editor.js: load a JSON document, the New wizard)
    // still gets its log: the first render of a document nobody opened opens it
    render: () => { if (M[S.svc] && !PV.opened.has(S.svc)) pvOpen(S.svc); setTimeout(() => { if (!Object.keys(PV.typing).length) pvCatchUp(); }, 0); },
    save: () => { pvSettle(); pvAppend('save', {}); },
    export: (info) => { pvAppend('export', { pdf: !!info?.pdf, docx: !!info?.docx }); },
    saveHtml: (data) => {
      if (!PV.sealed || PV.sealed.svc !== S.svc) return;
      data.prov = { [S.svc]: { doc: PV.sealed.doc, log: PV.sealed.log } }; // the contributor mark lives in the editor HTML only, never in PDF/DOCX
      data.contrib = PV.sealed.contrib;
    },
    pagehide: () => { pvFlushTyping(); pvPings(); },
  },
});
