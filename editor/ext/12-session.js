/* A10 session + A11 save folder, the page half (0.13.0). Only on the local server with a save folder
 * (GET /api/session/info answers): each tab has a tabId (sessionStorage, or ?tab= when the server reopened it),
 * holds a live connection (one event stream per browser, shared by every tab: SharedWorker, else the Web Locks leader), pushes its state 0.4 s after a change and, on pagehide or when the tab is
 * hidden, beacons the edits made since that push (a delta: a beacon carries at most 64 KB, a document does not), so
 * closing the tab right after typing loses nothing and closing the last tab saves every tab before the host stops.
 * The profile travels with the host (.local/profile.json, served back in #bw-host-profile): a resumed tab on another
 * origin or browser profile keeps the user and is not asked «من أنت؟» again. A fresh tab asks for the last run: a modal
 * offers (1) resume everything (the server opens all tabs) or (2) new work. Save HTML goes into the save folder's
 * HTML\ instead of the downloads; the first Save or export asks for the parent folder once; Settings «مجلد الحفظ».
 */
// the host's copy of the profile, into an empty localStorage before any boot handler (30-profile asks at boot)
if (!ls.get('bw:profile')) {
  try {
    const hp = JSON.parse(document.getElementById('bw-host-profile')?.textContent || 'null');
    if (hp?.profile) { ls.set('bw:profile', hp.profile); if (hp.actor && !ls.get('bw:actor')) ls.set('bw:actor', hp.actor); }
  } catch { /* no host profile */ }
}
const SESS = (() => {
  const P = new URLSearchParams(location.search);
  let info = null, tab = null, timer = 0, sent = null, profSent = '', pushing = 0;
  const seq = () => performance.timeOrigin + performance.now(); // orders this tab's pushes and flushes on the server (a late older push is dropped)
  const AUTO = P.get('automation') === '1' || document.documentElement.dataset.bwAutomation === '1'; // a tool's tab (0.15.0): never asks to resume
  const json = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json().catch(() => ({})));
  const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const titleNow = () => (EXT.library ? EXT.library.titleOf() : cur().doc.control?.title || S.svc);
  // per edition: how many ops the last push carried, and its last op as sent (typing grows that op in place)
  const lens = () => Object.fromEntries(Object.entries(M[S.svc] || {}).map(([ed, e]) => [ed, { n: e.ops.length, last: JSON.stringify(e.ops.at(-1) ?? null) }]));
  function profile() {
    const p = { profile: ls.get('bw:profile') || '', actor: ls.get('bw:actor') || '' };
    const k = JSON.stringify(p);
    if (!p.profile || k === profSent) return null;
    profSent = k;
    return p;
  }
  function payload() {
    const lib = EXT.library;
    return { tab, seq: seq(), title: titleNow(), svc: S.svc, ed: S.ed, entry: lib?.isDoc(S.svc) ? lib.entryOf(S.svc) : null, snap: snapshotState(), profile: profile() };
  }
  /* 0.15.0 L1 transport: ONE event stream per browser. Edge and Chrome allow 6 HTTP/1.1 connections per origin and every tab used to hold one,
   * so the 7th tab never loaded. Primary: a SharedWorker (/api/session/worker.js) holds the stream for all tabs. Fallback (no SharedWorker, or
   * the worker failed): BroadcastChannel 'bw-live' + the Web Locks lock 'bw-live-leader', whose holder opens the one stream and relays; when it
   * closes another tab takes the lock. Both keep the server's tab registry (POST /api/session/tabs) and route flush/req/ingest/progress to
   * the tab (data.tab) or every tab. Tabs answer the hub's ping from a message handler, never from a timer (a hidden tab's timers sleep). */
  const hub = (() => {
    const subs = {};
    let mode = 'none', port = null, ch = null, es = null, lead = false, client = '', beatTimer = 0, sentKey = '', sentAt = 0, listSeq = 0, lastLead = Date.now(), watchTimer = 0;
    const known = new Map(); // leader: tab → {info, at}
    const me = () => ({ tab, svc: S.svc, docs: EXT.library?.isDoc(S.svc) ? [S.svc] : [], automation: AUTO });
    const deliver = (event, data) => {
      if (data?.tab && data.tab !== tab) return;
      (subs[event] || []).forEach((f) => { try { f(data); } catch { /* a listener must not break the stream */ } });
      window.dispatchEvent(new CustomEvent('bw:srv', { detail: { event, data } }));
    };
    const list = () => { known.set(tab, { info: me(), at: Date.now() }); return [...known.values()].map((k) => ({ ...k.info, ago: Date.now() - k.at })); };
    const postList = (force) => {
      if (!lead) return;
      const l = list();
      const key = JSON.stringify(l.map(({ ago, ...r }) => r));
      if (!force && key === sentKey && Date.now() - sentAt < 4500) return;
      sentKey = key; sentAt = Date.now();
      fetch('/api/session/tabs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client, seq: ++listSeq, tabs: l }), keepalive: true }).catch(() => {});
    };
    /** a follower that died without a bye: its Web Lock `bw-tab:<tab>` is gone twice in a row (see editor/session-worker.js) */
    async function sweep() {
      if (!navigator.locks?.query) return;
      let held;
      try { held = new Set((await navigator.locks.query()).held.map((l) => l.name)); } catch { return; }
      let gone = false;
      for (const [t, k] of [...known]) {
        if (t === tab || Date.now() - (k.since ||= Date.now()) < 4000) continue;
        if (held.has(`bw-tab:${t}`)) k.miss = 0;
        else if ((k.miss = (k.miss || 0) + 1) >= 2) { known.delete(t); gone = true; }
      }
      if (gone) postList(true);
    }
    function leaderOpen() {
      lead = true; mode = 'leader';
      client = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      es = new EventSource(`/api/session/live?client=${client}`);
      for (const n of ['flush', 'req', 'ingest', 'progress', 'lease', 'rev', 'asleep', 'hello']) es.addEventListener(n, (e) => {
        let data = {};
        try { data = e.data ? JSON.parse(e.data) : {}; } catch { data = {}; }
        ch.postMessage({ t: 'ev', event: n, data });
        deliver(n, data);
      });
      es.addEventListener('open', () => postList(true));
      known.clear();
      ch.postMessage({ t: 'who' }); // a new leader: every tab announces itself again
      postList(true);
      beatTimer = setInterval(() => { ch.postMessage({ t: 'ping' }); sweep(); postList(true); }, 2000);
    }
    /** 0.15.3 T2: the leader tab slept (a frozen or discarded page keeps its Web Lock, so no other tab could take over). The leader pings every 3 s; a follower that
     *  has heard nothing from it for 12 s takes the lock with {steal:true} (a little jitter, so followers do not all steal at once) and opens the one stream itself. A stolen
     *  holder that wakes later is told by an AbortError and steps down. */
    function demote() { if (!lead) return; lead = false; mode = 'follower'; clearInterval(beatTimer); try { es?.close(); } catch { /* closed */ } es = null; lastLead = Date.now(); }
    const takeLead = (steal) => navigator.locks.request('bw-live-leader', steal ? { steal: true } : {}, () => { leaderOpen(); return new Promise(() => {}); }).catch(() => { demote(); });
    function watchLeader() {
      watchTimer = setInterval(() => {
        if (lead || Date.now() - lastLead < 12000) return;
        lastLead = Date.now() - 6000 + Math.random() * 3000; // not again for a few seconds, whoever wins
        takeLead(true);
      }, 4000);
    }
    function fallback() {
      mode = 'follower';
      ch = new BroadcastChannel('bw-live');
      ch.onmessage = (m) => {
        const d = m.data || {};
        if (d.t === 'ev') { lastLead = Date.now(); deliver(d.event, d.data); }
        else if (d.t === 'ping' || d.t === 'who') { lastLead = Date.now(); ch.postMessage({ t: d.t === 'who' ? 'hello' : 'beat', ...me() }); }
        else if (lead && (d.t === 'hello' || d.t === 'beat')) { known.set(d.tab, { info: { tab: d.tab, svc: d.svc, docs: d.docs, automation: d.automation }, at: Date.now(), since: known.get(d.tab)?.since }); postList(d.t === 'hello'); }
        else if (lead && d.t === 'bye') { known.delete(d.tab); postList(true); }
      };
      if (navigator.locks?.request) { takeLead(false); watchLeader(); }
      else { mode = 'direct'; es = new EventSource(`/api/session/live?tab=${encodeURIComponent(tab)}`); for (const n of ['flush', 'lease', 'rev', 'asleep', 'hello']) es.addEventListener(n, (e) => { let d = {}; try { d = e.data ? JSON.parse(e.data) : {}; } catch { d = {}; } deliver(n, d); }); } // no Web Locks: a stream of this tab's own (the old way)
      ch.postMessage({ t: 'hello', ...me() });
    }
    function shared() {
      const w = new SharedWorker('/api/session/worker.js', { name: 'bw-session' });
      port = w.port;
      port.onmessage = (m) => {
        const d = m.data || {};
        if (d.t === 'ev') deliver(d.event, d.data);
        else if (d.t === 'ping') port.postMessage({ t: 'beat', ...me() });
      };
      w.onerror = () => { if (mode === 'shared') { mode = 'none'; try { port.close(); } catch { /* closed */ } port = null; fallback(); } }; // the worker could not start: the fallback, once
      port.start();
      port.postMessage({ t: 'hello', ...me() });
      mode = 'shared';
    }
    return {
      start() { try { if (typeof SharedWorker === 'function') shared(); else fallback(); } catch { if (mode === 'none') fallback(); } },
      bye() {
        try { if (port) port.postMessage({ t: 'bye', tab }); else if (ch && !lead) ch.postMessage({ t: 'bye', tab }); else if (lead) { clearInterval(beatTimer); es?.close(); } } catch { /* closing */ }
      },
      again() { try { if (port) port.postMessage({ t: 'hello', ...me() }); else if (ch) ch.postMessage({ t: 'hello', ...me() }); } catch { /* none */ } },
      on(ev, fn) { (subs[ev] ||= []).push(fn); },
      get mode() { return mode; },
    };
  })();
  /* 0.15.3 T1: one document = one owning tab. The host gives a document's lease to the first tab that lists it (engine/routes/session.mjs) and tells every tab
   * (`lease`: who owns what; `rev`: a save was accepted). A tab on a document another tab owns is a FOLLOWER, and a tab whose copy is older than a save another tab
   * made is STALE: both are read-only (a guard refuses every edit, a banner says why in Arabic and English, with Reload), so a stale copy can never be saved over
   * the library. The host refuses such a save anyway (engine/routes/doc-lease.mjs: NOT_OWNER, STALE_BASE); this page adds the headers it checks. */
  const LS = { leases: {}, revs: {}, mine: {}, stale: {}, asleep: [] };
  const curDoc = () => (info && EXT.library?.isDoc(S.svc) ? S.svc : null);
  const owner = (d) => LS.leases[d] || null;
  const follows = (d) => !!d && !!owner(d) && owner(d) !== tab;
  const both = (k, v = {}) => `${tIn(k, 'ar').replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m)} · ${tIn(k, 'en').replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m)}`; // the words live in 12-session.i18n.json; a banner shows both languages
  const MSG = {
    get follower() { return both('leaseFollower'); },
    get stale() { return both('leaseStale'); },
    asleep: (n) => both('leaseAsleep', { n }),
    get reload() { return both('leaseReload'); },
  };
  function bar(id, text, top, button) {
    let el = document.getElementById(id);
    if (!text) { el?.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = id; el.setAttribute('role', 'status');
      Object.assign(el.style, { position: 'fixed', insetInline: '0', top: top + 'px', zIndex: '2147483000', padding: '8px 16px', background: '#3b2a00', color: '#fff', font: '600 14px/1.5 inherit', textAlign: 'center', display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' });
      const sp = document.createElement('span'); sp.dir = 'auto'; el.appendChild(sp);
      if (button) { const b = document.createElement('button'); b.type = 'button'; b.textContent = MSG.reload; b.onclick = () => location.reload(); Object.assign(b.style, { font: 'inherit', padding: '2px 12px', cursor: 'pointer' }); el.appendChild(b); }
      document.body.appendChild(el);
    }
    el.firstChild.textContent = text;
  }
  function banners() {
    const d = curDoc();
    const why = !d ? '' : follows(d) ? MSG.follower : LS.stale[d] ? MSG.stale : '';
    document.documentElement.dataset.bwReadonly = why ? (follows(d) ? 'follower' : 'stale') : '';
    bar('bw-lease-banner', why, 0, true);
    bar('bw-asleep-banner', LS.asleep.length ? MSG.asleep(LS.asleep.length) : '', why ? 44 : 0, false);
  }
  function leaseIn(d) {
    if (d?.leases) LS.leases = d.leases;
    if (d?.revs) { LS.revs = d.revs; for (const doc of Object.keys(LS.mine)) if (LS.revs[doc] > LS.mine[doc] && owner(doc) !== tab) LS.stale[doc] = true; }
    banners();
    const doc = curDoc();
    if (doc && (follows(doc) || LS.stale[doc])) healFromHost(doc);
  }
  /** a follower or stale tab may already have written its older copy into the browser's own library (a save in the second before it learned it): the host's last accepted copy is put back */
  const healed = {};
  async function healFromHost(doc) {
    if (healed[doc] === LS.revs[doc] || !EXT.library?.adopt) return;
    healed[doc] = LS.revs[doc];
    try {
      const r = await fetch(`/api/library/mirror?id=${encodeURIComponent(doc)}`);
      if (r.ok) { const e = await r.json(); if (e?.id === doc) { await EXT.library.adopt(e); LS.mine[doc] = LS.revs[doc] ?? LS.mine[doc]; if (!follows(doc)) delete LS.stale[doc]; banners(); } }
    } catch { /* the host has no copy yet */ }
  }
  hub.on('lease', leaseIn);
  hub.on('hello', (d) => { if (d?.leases) leaseIn(d); });
  hub.on('rev', (d) => {
    if (!d?.doc) return;
    LS.revs[d.doc] = d.rev;
    if (d.by === tab) LS.mine[d.doc] = d.rev;
    else if (d.doc in LS.mine && d.rev > LS.mine[d.doc]) LS.stale[d.doc] = true;
    banners();
  });
  hub.on('asleep', (d) => { LS.asleep = (d?.tabs || []).filter((x) => x.tab !== tab); banners(); });
  /** the document this tab just showed: list it to the host now (not at the next 3 s beat), learn who owns it and at which revision */
  async function seen() {
    const d = curDoc();
    if (!d || !tab) { banners(); return; }
    hub.again();
    if (!(d in LS.mine)) {
      const r = await fetch('/api/session/leases').then((x) => x.json()).catch(() => null);
      if (r) { LS.revs = r.revs || LS.revs; if (!(d in LS.mine)) LS.mine[d] = LS.revs[d] ?? 0; leaseIn({ leases: r.leases }); }
    } else banners();
  }
  const _fetch = window.fetch.bind(window);
  window.fetch = function (u, o) { // the library write of this tab carries who it is and which revision it saw (engine/routes/doc-lease.mjs)
    if (!tab || typeof u !== 'string' || !u.startsWith('/api/library/mirror') || o?.method !== 'POST' || typeof o.body !== 'string') return _fetch(u, o);
    const m = /"id":"(doc-[A-Za-z0-9-]{4,64})"/.exec(o.body.slice(0, 400));
    if (!m) return _fetch(u, o);
    const doc = m[1];
    const headers = { ...(o.headers || {}), 'x-bw-tab': tab, 'x-bw-doc': doc };
    if (doc in LS.mine) headers['x-bw-base'] = String(LS.mine[doc]);
    return _fetch(u, { ...o, headers }).then((r) => {
      const rev = Number(r.headers.get('x-bw-rev'));
      if (r.ok && rev) LS.mine[doc] = rev;
      else if (r.status === 409) r.clone().json().then((j) => { if (j.code === 'NOT_OWNER') LS.leases[doc] = j.owner; else if (j.code === 'STALE_BASE') LS.stale[doc] = true; if (j.rev != null) LS.revs[doc] = j.rev; banners(); healFromHost(doc); }).catch(() => {});
      return r;
    });
  };
  EXT.guards.push(() => { const d = curDoc(); if (!d) return true; return follows(d) ? MSG.follower : LS.stale[d] ? MSG.stale : true; });
  const push = () => {
    clearTimeout(timer); timer = 0;
    if (!info) return;
    const mark = { svc: S.svc, lens: lens() };
    pushing += 1;
    json('/api/session/state', payload()).then((r) => { if (r.ok && !r.stale) sent = mark; }).catch(() => {}).finally(() => { pushing -= 1; });
  };
  const soon = () => { if (!info) return; clearTimeout(timer); timer = setTimeout(push, 400); };
  const beacon = (body) => navigator.sendBeacon?.('/api/session/flush', new Blob([body], { type: 'application/json' })) || (fetch('/api/session/flush', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {}), body.length < 63000);
  /** The edits since the last push (the last op again: typing grows it in place), sent so it survives the page. */
  function flush() {
    if (!info) return;
    clearTimeout(timer);
    if (!sent || sent.svc !== S.svc || pushing) {
      // no push of this document yet (a Save switched to it a moment ago) or one still in flight (its answer is not in: the delta's base is
      // uncertain): the whole latest state, without the base text when that is what makes it too big for a beacon (the server takes it back
      // from the library mirror). A document past a beacon with a push in flight keeps the delta: it is relative to the last acknowledged push
      // and the server drops the older in-flight push by its seq.
      const pl = payload();
      const bytes = (x) => new TextEncoder().encode(x).length; // a beacon's 64 KB is bytes: Arabic is 2 per letter
      let body = JSON.stringify(pl);
      if (bytes(body) > 60000 && pl.entry) { for (const x of Object.values(pl.entry.editions)) delete x.raw; body = JSON.stringify(pl); }
      if (!(sent && sent.svc === S.svc && bytes(body) > 60000)) {
        beacon(body); // ponytail: edits alone past 64 KB (a pasted book) are lost here; the 0.4 s push before it is the net
        return;
      }
    }
    const delta = {};
    for (const [ed, e] of Object.entries(M[S.svc] || {})) {
      const was = sent.lens[ed] || { n: 0, last: 'null' };
      const n = Math.min(was.n, e.ops.length);
      const from = n && n === was.n && JSON.stringify(e.ops[n - 1]) !== was.last ? n - 1 : n; // the last pushed op again only when it grew
      delta[ed] = { from, prev: from ? e.ops[from - 1]?.id ?? null : null, ops: e.ops.slice(from) };
    }
    const mark = { svc: S.svc, lens: lens() };
    if (beacon(JSON.stringify({ tab, seq: seq(), svc: S.svc, ed: S.ed, title: titleNow(), delta }))) sent = mark;
  }
  async function apply(rec) {
    if (rec.entry && EXT.library) await EXT.library.adopt(rec.entry);
    else if (rec.snap) {
      loadDraft(rec.snap);
      if (M[rec.svc]) { S.svc = rec.svc; S.ed = M[rec.svc][rec.ed] ? rec.ed : Object.keys(M[rec.svc])[0]; }
      buildUi();
      render(false);
      emit('open', S.svc, S.ed);
    }
    document.documentElement.dataset.bwResumed = '1';
  }
  function modal(last, release) {
    const dlg = document.createElement('dialog');
    dlg.className = 'bw-resume';
    dlg.dataset.theme = S.dark ? 'dark' : 'light'; // the shell's theme tokens (build-editor brandCss) follow it here
    dlg.setAttribute('aria-labelledby', 'bw-resume-h');
    dlg.innerHTML = `<h2 id="bw-resume-h">${esc(t('sessTitle'))}</h2><p>${esc(t('sessLead', { n: last.tabs.length }))}</p><ol class="list">${last.tabs.slice(0, 12).map((x) => `<li>${esc(x.title || x.tab)}</li>`).join('')}${last.tabs.length > 12 ? `<li>… +${last.tabs.length - 12}</li>` : ''}</ol><div class="btns"><button type="button" class="b primary" data-s="resume"><span class="w">${esc(t('sessResume', { n: last.tabs.length }))}</span></button><button type="button" class="b" data-s="new"><span class="w">${esc(t('sessNew'))}</span></button></div><p class="hint out" role="status"></p>`;
    root.appendChild(dlg);
    dlg.addEventListener('click', async (ev) => {
      const k = ev.target.closest('[data-s]')?.dataset.s;
      if (!k) return;
      dlg.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const r = await json(`/api/session/${k}`, { runId: last.runId, tab });
      if (k === 'resume') {
        dlg.querySelector('.out').textContent = r.ok ? t('sessOpened', { n: r.n }) : String(r.error || '');
        document.documentElement.dataset.bwResume = r.ok ? 'resumed' : 'failed';
        // this tab becomes the run's first tab (never an extra one): it opens there itself
        if (r.ok && r.here) { info = null; hub.bye(); setTimeout(() => location.replace(r.here), 600); }
      }
      else { document.documentElement.dataset.bwResume = 'new'; if (!/[#&]doc=/.test(location.hash)) await EXT.library?.newDocument(); } // a tab opened on one document keeps it (0.15.0)
      setTimeout(() => { dlg.close(); dlg.remove(); }, k === 'resume' ? 1200 : 0);
    });
    dlg.addEventListener('close', () => release?.(), { once: true }); // answered or dismissed (Esc): the hold goes
    dlg.showModal();
    document.documentElement.dataset.bwResume = 'asked';
  }

  /* A11: the save folder */
  async function ensureFolder() {
    if (!info || info.workspace.chosen) return true;
    const r = await json('/api/workspace/pick', {});
    if (r.ok) { info.workspace = { root: r.root, chosen: true }; toast(t('wsChosen', { dir: r.root }), 'ok'); }
    return !!r.ok;
  }
  const _download = download;
  download = function (name, text, type) {
    if (!info || !/\.editor\.html$/.test(name)) return _download(name, text, type);
    ensureFolder().then(() => json('/api/workspace/html', { title: EXT.library ? EXT.library.titleOf() : S.svc, locale: S.ed, html: text })).then((r) => {
      if (r.ok) toast(t('wsSavedHtml', { file: r.file }), 'ok');
      else _download(name, text, type);
    }).catch(() => _download(name, text, type));
  };

  async function boot() {
    if (!location.protocol.startsWith('http')) return;
    try { const r = await fetch('/api/session/info'); if (!r.ok) return; info = await r.json(); } catch { return; }
    let resumed = null;
    if (P.get('tab')) {
      tab = P.get('tab');
      try { const r = await fetch(`/api/session/tab?tab=${encodeURIComponent(tab)}`); if (r.ok) resumed = await r.json(); } catch { /* fresh */ }
    }
    try { tab ||= sessionStorage.getItem('bw:tab'); } catch { /* no storage */ }
    tab ||= newId();
    try { sessionStorage.setItem('bw:tab', tab); } catch { /* no storage */ }
    if (AUTO) document.documentElement.dataset.bwAutomation = '1';
    try { navigator.locks?.request(`bw-tab:${tab}`, { mode: 'shared' }, () => new Promise(() => {})).catch(() => {}); } catch { /* no Web Locks */ } // held while this page lives: the hub's proof that the tab is not gone
    hub.on('flush', flush);
    hub.start();
    if (resumed) await apply(resumed);
    else if (!AUTO) {
      const release = window.BW?.holdReady?.('resume'); // bw:ready / data-bw-ready wait until the resume question is settled (a tool's ?automation=1 tab never asks)
      const last = await fetch('/api/session/last').then((r) => r.json()).catch(() => null);
      if (last?.tabs?.length) modal(last, release); else release?.();
    }
    push();
    seen();
    document.documentElement.dataset.bwSession = tab;
  }
  const card = () => (info ? `<p class="hint">${esc(t('wsLead'))}</p><p><code class="ws-root">${esc(info.workspace.root)}</code></p><div class="btns"><button type="button" class="b" data-ws="pick"><span class="w">${esc(t('wsChange'))}</span></button></div>` : `<p class="hint">${esc(t('wsServerOnly'))}</p>`);
  const mountCard = (el) => el?.querySelector('[data-ws="pick"]')?.addEventListener('click', async () => {
    const r = await json('/api/workspace/pick', {});
    if (r.ok) { info.workspace = { root: r.root, chosen: true }; el.querySelector('.ws-root').textContent = r.root; }
  });
  return { boot, push, soon, flush, ensureFolder, card, mountCard, on: hub.on, bye: hub.bye, again: hub.again, seen, get readonly() { const d = curDoc(); return d ? (follows(d) ? 'follower' : LS.stale[d] ? 'stale' : '') : ''; }, get transport() { return hub.mode; }, get automation() { return AUTO; }, get tab() { return tab; }, get info() { return info; } };
})();

bwExt({
  settings: [{ id: 'workspace', title: 'wsTitle', html: SESS.card, mount: SESS.mountCard }],
  expose: { session: SESS },
  on: {
    boot: () => { SESS.boot(); },
    open: () => { SESS.seen(); },
    commit: () => SESS.soon(),
    save: () => { SESS.ensureFolder(); SESS.soon(); },
    beforeExport: () => SESS.ensureFolder(), // the first export asks for the save folder too (once; then it is remembered)
    export: () => SESS.push(),
    pagehide: () => { SESS.flush(); SESS.bye(); },
  },
});
window.addEventListener('pagehide', () => SESS.bye()); // not only through the extension seam: a throwing earlier handler must not leave the tab listed
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') SESS.flush(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) SESS.again(); }); // back from the back/forward cache: the hub is told this tab is here again

/* 0.15.0 editor bridge, the tab half: the host's SSE `req {id, tool, doc, args}` (engine/routes/editor-bridge.mjs) is run through the core
 * (BW.bridge in editor.js: ops = one undo group, signed as the agent) and answered with POST /api/editor/reply. One request at a time per tab,
 * in arrival order: two agents on one tab never interleave their groups. */
{
  let queue = Promise.resolve();
  const reply = (body) => fetch('/api/editor/reply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  SESS.on('req', (d) => {
    if (!d?.id) return;
    queue = queue.then(async () => {
      try {
        await window.BW.whenReady(10000).catch(() => {}); // a tab still booting answers once it has, or after 10 s anyway
        reply({ id: d.id, ok: true, result: await window.BW.bridge(d.tool, d.doc, d.args) });
      } catch (e) {
        reply({ id: d.id, ok: false, error: { code: e?.bw || 'HOST_ERROR', message: String(e?.message || e).slice(0, 400), ...(e?.extra || {}) } });
      }
    });
  });
}
