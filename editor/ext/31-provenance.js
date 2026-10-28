/* A13 Provenance + A17 tamper-evident history (design.md §3 A13, A17). One bwlog v1 log per document (engine/ledger-v1.mjs,
 * concatenated before this file as BWLOG1): every open, op (exact diff), save, Save-HTML, export, sign, share, lock and
 * unlock, signed with this install's non-extractable ECDSA key. The encrypted log travels inside every Save-HTML
 * (bw-data → prov) and is mirrored in HISTORY (served: the workspace; file://: IndexedDB bw-history). Checked on open. */
const PV_ON = typeof BWLOG1 !== 'undefined'; // engine/ledger-v1.mjs is concatenated before the extensions (build-editor)
const PV = { logs: {}, keys: null, q: Promise.resolve(), ready: null, readyRes: null, opened: new Set(), typing: {}, mirrorTimer: {} };
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
const pvDocId = (svc) => DATA.prov?.[svc]?.doc || (() => { const k = `bw:prov-doc:${DATA.setId}:${svc}`; let d = ls.get(k); if (!d) { d = crypto.randomUUID(); ls.set(k, d); } return d; })();
const pvFileEditions = (svc) => Object.fromEntries(Object.entries(DATA.services.find((s) => s.id === svc)?.editions || {}).map(([ed, e]) => [ed, { hash: e.hash, ops: e.ops || [] }]));

async function pvLoad(svc) {
  const doc = pvDocId(svc);
  const mir = await MIRROR.get(doc);
  const L = { doc, entries: [], verdict: { ok: true, issues: [] }, src: 'new', mirror: mir.mirror || null };
  const inFile = DATA.prov?.[svc]?.log;
  try {
    if (inFile) { Object.assign(L, await BWLOG1.unseal(inFile, doc)); L.src = 'html'; }
    else if (mir.log) { Object.assign(L, await BWLOG1.unseal(mir.log, doc)); L.src = 'mirror'; }
  } catch { L.verdict = { ok: false, issues: [{ seq: 0, reason: 'unreadable' }] }; L.entries = []; return (PV.logs[svc] = L); }
  // the file's own state is checked against its log; a log continued from this machine's mirror has no file state to check
  // a file from before 0.13 (no log, no contributor mark, unknown here) is not "stripped": it never had a log
  const known = inFile || DATA.contrib || L.mirror?.head;
  L.verdict = await BWLOG1.verify(L, { mirror: L.mirror, editions: L.src === 'mirror' || !known ? undefined : pvFileEditions(svc) });
  L.pins = L.verdict.pins;
  return (PV.logs[svc] = L);
}

const pvState = (svc) => BWLOG1.canonical(BWLOG1.stateOf(M[svc]));
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
    pvMirrorSoon(svc);
  }).catch((e) => console.error('bwlog', e));
  return PV.q;
}
function pvMirrorSoon(svc) {
  clearTimeout(PV.mirrorTimer[svc]);
  PV.mirrorTimer[svc] = setTimeout(() => pvMirror(svc), 400);
}
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
    if (!L || !state) return;
    const now = await pvDigest(state);
    const last = [...L.entries].reverse().find((e) => e.docHash)?.docHash;
    if (last === now) return;
    const seen = new Set(L.entries.filter((e) => e.data?.op?.id).map((e) => e.data.op.id));
    const ops = Object.entries(M[svc]).flatMap(([ed, e]) => e.ops.filter((o) => !seen.has(o.id)).map((o) => ({ ed, op: o })));
    await BWLOG1.append(L, { kind: 'merge', data: { ops: JSON.parse(JSON.stringify(ops)) }, actor: PF.actor(), keys: PV.keys, docHash: now });
    pvMirrorSoon(svc);
  }).catch((e) => console.error('bwlog', e));
  return PV.q;
}
async function pvSettle(svc = S.svc) { pvFlushTyping(); pvPings(svc); await pvCatchUp(svc); }

/* Save HTML: the log is completed (saveHtml entry included) and sealed before the editor writes the file */
const pvSaveHtml0 = saveHtml;
if (PV_ON) saveHtml = async function pvSaveHtml(embedFonts) {
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
const pvBad = (L) => !!L && !L.verdict.ok;
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

if (PV_ON) bwExt({
  // no toolbar tool (yet): commands that join CMDS after boot are not drawn until the next rebuild, and a section makes the
  // seam rebuild after boot, which drops the draft-recovery banner (seam issue, reported for WP1). The drawer is reached
  // from its tab in «التغييرات / Changes» (history), the Settings trust card and the tamper banner; Sign, Lock and Share
  // are buttons inside it.
  actions: { pvOpen: () => openDrawer('provenance'), pvSign },
  drawers: { provenance: pvDrawer },
  expose: {
    ledger: {
      authorOf: (opId) => { for (const L of Object.values(PV.logs)) { const e = L.entries.find((x) => x.data?.op?.id === opId); if (e) return e.actor.name; } return ''; },
      log: (svc = S.svc) => PV.logs[svc],
      append: pvAppend, settle: pvSettle, ready: () => PV.ready.then(() => PV.q),
    },
  },
  on: {
    boot: () => {
      new MutationObserver(pvTabWire).observe(root, { childList: true, subtree: true }); // the tab in the Changes drawer
      (async () => {
        PV.keys = await pvKeys();
        await Promise.all(DATA.services.map((s) => pvLoad(s.id)));
        for (const L of Object.values(PV.logs)) if (pvBad(L)) toast(t('pvTampered'), 'warn', { persist: true, actions: [[t('pvShow'), () => openDrawer('provenance')]] });
      })().catch((e) => console.error('bwlog', e)).finally(() => PV.readyRes());
    },
    open: (svc) => {
      if (PV.opened.has(svc)) return;
      PV.opened.add(svc);
      PV.ready.then(() => { const L = PV.logs[svc]; pvAppend('open', { title: cur(S.ed, svc)?.doc?.control?.title || svc, src: L?.src, verdict: L?.verdict.issues.map((i) => `${i.seq}:${i.reason}`) || [] }, svc); });
    },
    commit: (ops, ed, kind) => {
      const svc = S.svc;
      if (kind === 'type') { const key = `${svc}|${ed}|${ops[0].id}`; clearTimeout(PV.typing[key]?.timer); PV.typing[key] = { svc, ed, op: ops[0], timer: setTimeout(pvFlushTyping, 1200) }; return; }
      pvFlushTyping();
      if (kind === 'undo' || kind === 'redo') { pvAppend('op', { ed, [kind]: ops.map((o) => o.id) }, svc); return; }
      for (const op of ops) pvAppend('op', { ed, op: JSON.parse(JSON.stringify(op)) }, svc);
    },
    render: () => { setTimeout(() => { if (!Object.keys(PV.typing).length) pvCatchUp(); }, 0); },
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
