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
// 0.15.9 B8: the saved screen preferences (theme, direction, spelling dictionary ...) are kept with the host as well (PREF_KEYS), so a browser profile that has none of them (Chrome after
// Edge, a wiped profile) starts as the person left it. The editor reads some of them while it loads, before this file runs, so a restore that set something reloads the page once.
const PREF_KEYS = /^bw:(dark|ui|calm|dir:(ar|en)|spell:(on|ar|en|user|ign)|ruler|pages|snap|explainers|xpl-panel|rb:c|docx-fonts|exportFolder|wm-intro|seen-version)$/;
const prefsNow = () => { const o = {}; try { for (const k of Object.keys(localStorage)) if (PREF_KEYS.test(k)) { const v = localStorage.getItem(k); if (typeof v === 'string' && v.length <= 4000) o[k] = v; } } catch { /* no storage */ } return o; };
{
  let hp = null;
  try { hp = JSON.parse(document.getElementById('bw-host-profile')?.textContent || 'null'); } catch { /* no host profile */ }
  if (hp?.profile && !ls.get('bw:profile')) { ls.set('bw:profile', hp.profile); if (hp.actor && !ls.get('bw:actor')) ls.set('bw:actor', hp.actor); }
  let restored = 0;
  if (hp?.prefs) for (const [k, v] of Object.entries(hp.prefs)) if (PREF_KEYS.test(k) && typeof v === 'string' && localStorage.getItem(k) === null) { try { localStorage.setItem(k, v); restored += 1; } catch { /* full */ } }
  try { if (restored && !sessionStorage.getItem('bw:prefs-restored')) { sessionStorage.setItem('bw:prefs-restored', '1'); location.reload(); } } catch { /* no storage */ }
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
    const p = { profile: ls.get('bw:profile') || '', actor: ls.get('bw:actor') || '', prefs: prefsNow() };
    const k = JSON.stringify(p);
    if (!p.profile || k === profSent) return null;
    profSent = k;
    return p;
  }
  function payload() {
    const lib = EXT.library;
    return { tab, seq: seq(), title: titleNow(), svc: S.svc, ed: S.ed, entry: lib?.isDoc(S.svc) ? lib.entryOf(S.svc) : null, snap: snapshotState(), profile: profile() };
  }
  /* 0.15.0 L1 transport: ONE event stream per browser. Chromium browsers allow 6 HTTP/1.1 connections per origin and every tab used to hold one,
   * so the 7th tab never loaded. Primary: a SharedWorker (/api/session/worker.js) holds the stream for all tabs. Fallback (no SharedWorker, or
   * the worker failed): BroadcastChannel 'bw-live' + the Web Locks lock 'bw-live-leader', whose holder opens the one stream and relays; when it
   * closes another tab takes the lock. Both keep the server's tab registry (POST /api/session/tabs) and route flush/req/ingest/progress to
   * the tab (data.tab) or every tab. Tabs answer the hub's ping from a message handler, never from a timer (a hidden tab's timers sleep). */
  const hub = (() => {
    const subs = {};
    let mode = 'none', port = null, ch = null, es = null, lead = false, client = '', beatTimer = 0, sentKey = '', sentAt = 0, listSeq = 0, lastLead = Date.now(), watchTimer = 0;
    const known = new Map(); // leader: tab → {info, at}
    let lastPing = Date.now(); // 0.16.0: when the shared worker goes silent (frozen), the tabs move to the leader fallback
    const lostTabs = new Set(); // leader: tabs that vanished without a bye (a discarded page)
    const me = () => ({ tab, svc: S.svc, docs: EXT.library?.isDoc(S.svc) ? [S.svc] : [], automation: AUTO, awake: AWK.state() });
    const deliver = (event, data) => {
      if (data?.tab && data.tab !== tab) return;
      (subs[event] || []).forEach((f) => { try { f(data); } catch { /* a listener must not break the stream */ } });
      window.dispatchEvent(new CustomEvent('bw:srv', { detail: { event, data } }));
    };
    const list = () => { known.set(tab, { info: me(), at: Date.now() }); return [...known.values()].map((k) => ({ ...k.info, ago: Date.now() - k.at })); };
    const postList = (force) => {
      if (!lead) return;
      const l = list();
      const key = JSON.stringify([l.map(({ ago, ...r }) => r), [...lostTabs]]);
      if (!force && key === sentKey && Date.now() - sentAt < 4500) return;
      sentKey = key; sentAt = Date.now();
      fetch('/api/session/tabs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client, seq: ++listSeq, tabs: l, lost: [...lostTabs] }) }).then((r) => r.arrayBuffer()).catch(() => {}); // no keepalive: its unread bodies fill Chrome's quota and every later fetch fails (see editor/session-worker.js)
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
        else if ((k.miss = (k.miss || 0) + 1) >= 2) { known.delete(t); lostTabs.add(t); gone = true; }
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
        else if (lead && (d.t === 'hello' || d.t === 'beat')) { lostTabs.delete(d.tab); known.set(d.tab, { info: { tab: d.tab, svc: d.svc, docs: d.docs, automation: d.automation, awake: d.awake }, at: Date.now(), since: known.get(d.tab)?.since }); postList(d.t === 'hello'); }
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
        lastPing = Date.now();
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
      /** the shared worker has said nothing for 15 s (it froze; every tab it serves would sleep with it): all its tabs move to the Web Locks leader, which holds ONE stream for the browser and relays
       *  (the same fallback a browser without SharedWorker uses; one stream each would use up the six connections a browser allows per origin) */
      rescue() {
        if (mode !== 'shared' || !tab || Date.now() - lastPing < 15000) return;
        try { port?.close(); } catch { /* closed */ }
        port = null; mode = 'none';
        fallback();
      },
      again() { try { if (port) port.postMessage({ t: 'hello', ...me() }); else if (ch) ch.postMessage({ t: 'hello', ...me() }); } catch { /* none */ } },
      on(ev, fn) { (subs[ev] ||= []).push(fn); },
      get mode() { return mode; },
      get silentMs() { return Date.now() - lastPing; },
      get rescuing() { return mode === 'leader' || (mode === 'follower' && !port); },
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
    if ((healed[doc] === LS.revs[doc] && follows(doc)) || !EXT.library?.adopt) return; // a follower heals once per revision; a tab that just took over (no longer a follower) heals again, or its "stale" stays and it is read-only until a reload (0.15.5)
    healed[doc] = LS.revs[doc];
    try {
      const r = await fetch(`/api/library/mirror?id=${encodeURIComponent(doc)}`);
      if (r.ok) { const e = await r.json(); if (e?.id === doc) { await EXT.library.adopt(e); LS.mine[doc] = LS.revs[doc] ?? LS.mine[doc]; if (!follows(doc)) delete LS.stale[doc]; banners(); } }
    } catch { /* the host has no copy yet */ }
  }
  /* 0.15.9 A2/A3 keep-awake, measured in real Chrome (tests/awake-0159.test.mjs): a hidden tab's main-thread timers run at 1/s after a few seconds and stop (one a minute) after
   * 5 minutes; a Web Lock does not change that; a dedicated worker's timers keep full rate; an open WebRTC data channel keeps the tab out of the intensive throttle. So every tab
   * opens (1) a loopback RTCPeerConnection with one data channel (no network, no permission prompt, no speaker icon), (2) a dedicated heartbeat worker whose clock the page is
   * compared with. The host is told the result in each tab beat (awake.rtc/tickMs/stalls/frozen/resumed). `?awake=0` switches both off (measurement only).
   * A frozen page that is thawed (`resume`) or a tab shown again after a long hide re-announces itself, re-reads the leases and pushes its state: nothing reloads, nothing is lost. */
  const AWK = (() => {
    const st = { rtc: false, stalls: 0, lagMs: 0, tickMs: 1000, frozen: 0, resumed: 0 };
    const OFF = P.get('awake') === '0';
    let pcs = null, wk = null, tickAt = Date.now(), hiddenAt = 0, retryT = 0;
    const retry = () => { if (retryT || OFF) return; retryT = setTimeout(() => { retryT = 0; try { pcs?.[0]?.close(); pcs?.[1]?.close(); } catch { /* closed */ } pcs = null; rtc(); }, 5000); };
    function rtc() {
      if (OFF || pcs || typeof RTCPeerConnection !== 'function') return;
      try {
        const a = new RTCPeerConnection({ iceServers: [] }), b = new RTCPeerConnection({ iceServers: [] });
        a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
        b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
        const dc = a.createDataChannel('bw-awake');
        dc.onopen = () => { st.rtc = true; };
        dc.onclose = () => { st.rtc = false; pcs = null; retry(); };
        b.ondatachannel = (e) => { e.channel.onmessage = () => {}; };
        a.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(a.connectionState)) { st.rtc = false; pcs = null; retry(); } };
        pcs = [a, b, dc];
        a.createOffer().then(async (o) => { await a.setLocalDescription(o); await b.setRemoteDescription(o); const an = await b.createAnswer(); await b.setLocalDescription(an); await a.setRemoteDescription(an); }).catch(() => { pcs = null; retry(); });
      } catch { pcs = null; /* no WebRTC: the heartbeat worker and the Web Lock still hold */ }
    }
    function worker() {
      if (OFF || wk || typeof Worker !== 'function') return;
      try {
        wk = new Worker('/api/session/worker.js', { name: 'bw-awake' });
        let n = 0;
        wk.onmessage = (m) => {
          const lag = Date.now() - Number(m.data?.wall || Date.now());
          if (lag > 3000) { st.stalls += 1; st.lagMs = lag; }
          // 0.16.0: the tab's own beat to the host every 4 s, from this worker's message (never a page timer), so it stays awake whatever the shared worker does
          if (tab && (n += 1) % 4 === 1) fetch('/api/session/beat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tab, svc: S.svc, docs: EXT.library?.isDoc(S.svc) ? [S.svc] : [], automation: AUTO }) }).then((r) => r.arrayBuffer()).catch(() => {});
          hub.rescue();
        };
        wk.onerror = () => { try { wk.terminate(); } catch { /* gone */ } wk = null; };
      } catch { wk = null; }
    }
    /** a page timer measured against the clock: ~1000 awake, 60000 in the intensive throttle (reported in three buckets so the beat does not change every second) */
    const ticker = () => { const d = Date.now() - tickAt; tickAt = Date.now(); st.tickMs = d <= 1500 ? 1000 : d <= 5000 ? 5000 : 60000; };
    async function wake() {
      hub.again();
      const r = await fetch('/api/session/leases').then((x) => x.json()).catch(() => null);
      if (r) { LS.revs = r.revs || LS.revs; leaseIn({ leases: r.leases }); }
      push();
    }
    document.addEventListener('freeze', () => { st.frozen += 1; });
    document.addEventListener('resume', () => { st.resumed += 1; tickAt = Date.now(); wake(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') hiddenAt = Date.now(); else if (hiddenAt && Date.now() - hiddenAt > 30000) { hiddenAt = 0; wake(); } });
    return { start() { rtc(); worker(); setInterval(ticker, 1000); }, state: () => ({ ...st }), wake };
  })();
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
  const writes = new Map();
  window.fetch = function (u, o) { // the library write of this tab carries who it is and which revision it saw (engine/routes/doc-lease.mjs)
    if (!tab || typeof u !== 'string' || !u.startsWith('/api/library/mirror') || o?.method !== 'POST' || typeof o.body !== 'string') return _fetch(u, o);
    const m = /"id":"(doc-[A-Za-z0-9-]{4,64})"/.exec(o.body.slice(0, 400));
    if (!m) return _fetch(u, o);
    const doc = m[1];
    // 0.15.5: one library write of a document at a time. Two writes sent back to back (a Trash move, then the purge) both carried the revision
    // seen before either was answered, so the second looked stale and the host refused it (STALE_BASE): the delete never reached the library.
    // Each write now waits for the one before it and reads its base when it is sent.
    const send = () => {
      const headers = { ...(o.headers || {}), 'x-bw-tab': tab, 'x-bw-doc': doc };
      if (doc in LS.mine) headers['x-bw-base'] = String(LS.mine[doc]);
      if (/^\{"entry":\{[^}]{0,300}"purge":true/.test(o.body.slice(0, 400))) headers['x-bw-purge'] = '1'; // a tombstone is a deliberate delete: accepted from any tab
      return _fetch(u, { ...o, headers }).then((r) => {
        const rev = Number(r.headers.get('x-bw-rev'));
        if (r.ok && rev) LS.mine[doc] = rev;
        else if (r.status === 409) r.clone().json().then((j) => { if (j.code === 'NOT_OWNER') LS.leases[doc] = j.owner; else if (j.code === 'STALE_BASE') LS.stale[doc] = true; if (j.rev != null) LS.revs[doc] = j.rev; banners(); healFromHost(doc); }).catch(() => {});
        return r;
      });
    };
    const prev = writes.get(doc) || Promise.resolve();
    const run = prev.then(send, send);
    writes.set(doc, run.catch(() => {}));
    return run;
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
  /* 0.15.9 R1-R5: the resume popup. The documents of the last session as a list (title, last-edited time, language): tick several, or press one to open it alone; a search box,
   * select all / clear (they act on what the search shows), «continue all»; «open an older document» lists the save folder's Documents (newest first, searchable); a new blank
   * document; «not now» or Esc closes it and changes nothing (the records stay for the next start). A tool's ?automation=1 tab never gets here (boot). */
  let openDlg = null;
  /** closes the resume popup without answering it (an agent's call, `editor_action dismissResume`, or any request from a tool): nothing is changed, the records stay */
  function dismissResume() { const d = openDlg; if (!d) return false; openDlg = null; try { d.close(); } catch { /* closed */ } d.remove(); return true; }
  /** the document in this tab (a library document), if any: an agent's document must keep its tab whatever the popup is answered */
  const holdsDoc = () => !!(info && EXT.library?.isDoc(S.svc));
  async function claim(doc) {
    const d = doc || curDoc();
    if (!d || !tab) return { ok: false, code: 'BAD_ARGS', error: 'no document to claim' };
    const r = await json('/api/session/claim', { tab, doc: d });
    if (r.ok) { LS.leases[d] = tab; delete LS.stale[d]; banners(); LS.mine[d] = LS.revs[d] ?? LS.mine[d]; }
    return r;
  }
  function modal(last, release) {
    const dlg = document.createElement('dialog');
    openDlg = dlg;
    dlg.className = 'bw-resume';
    dlg.dataset.theme = S.dark ? 'dark' : 'light'; // the shell's theme tokens (build-editor brandCss) follow it here
    dlg.setAttribute('aria-labelledby', 'bw-resume-h');
    const loc = S.ui === 'ar' ? 'ar' : 'en';
    // 0.16.1 (fault 10): in an Arabic line the date and the time came out in a jumbled order («00:31.2026/11/03»). The Arabic edition writes year/month/day and the 24 h time in Latin digits itself, and every date sits in its own left-to-right isolate.
    const when = (iso) => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const p2 = (n) => String(n).padStart(2, '0');
        if (loc === 'ar') return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
        return d.toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short', hour12: false });
      } catch { return ''; }
    };
    const whenH = (iso) => { const w = when(iso); return w ? `<bdi dir="ltr">${esc(w)}</bdi>` : ''; };
    const langOf = (ed) => (ed === 'ar' ? t('resLangAr') : ed === 'en' ? t('resLangEn') : '');
    const rows = last.tabs.map((x) => {
      const title = String(x.title || x.tab);
      return `<li data-tab="${esc(x.tab)}" data-q="${esc(title.normalize('NFC').toLowerCase())}"><label class="pick"><input type="checkbox" aria-label="${esc(t('resPick', { title }))}"><span class="box" aria-hidden="true"></span></label><button type="button" class="one" data-s="one" aria-label="${esc(t('resOpenOne', { title }))}"><span class="ti">${esc(title)}</span><span class="me">${[whenH(x.at), esc(langOf(x.ed))].filter(Boolean).join(' · ')}</span></button></li>`;
    }).join('');
    dlg.innerHTML = `<h2 id="bw-resume-h">${esc(t('sessTitle'))}</h2><p class="lead">${esc(t('resLead', { n: last.tabs.length }))}</p>
<div class="main"><div class="tools"><input type="search" class="q" aria-label="${esc(t('resSearch'))}" placeholder="${esc(t('resSearch'))}"><button type="button" class="b" data-s="all">${esc(t('resAll'))}</button><button type="button" class="b" data-s="none">${esc(t('resNone'))}</button></div>
<p class="cnt hint" role="status" aria-live="polite"></p><ul class="list" role="list">${rows}</ul>
<div class="btns"><button type="button" class="b primary" data-s="sel" disabled></button><button type="button" class="b" data-s="every">${esc(t('resOpenAll', { n: last.tabs.length }))}</button><button type="button" class="b" data-s="older">${esc(t('resOlder'))}</button><button type="button" class="b" data-s="new">${esc(t('resNew'))}</button><button type="button" class="b" data-s="later">${esc(t('resLater'))}</button></div></div>
<div class="older" hidden><h3>${esc(t('resOlderTitle'))}</h3><div class="tools"><input type="search" class="oq" aria-label="${esc(t('resOlderSearch'))}" placeholder="${esc(t('resOlderSearch'))}"><button type="button" class="b" data-s="back">${esc(t('resBack'))}</button></div><p class="ocnt hint" role="status" aria-live="polite"></p><ul class="olist list" role="list"></ul></div>
<p class="hint out" role="status"></p>`;
    root.appendChild(dlg);
    const $ = (sel) => dlg.querySelector(sel);
    const lis = () => [...dlg.querySelectorAll('.main li')];
    const shown = () => lis().filter((li) => !li.hidden);
    const picked = () => lis().filter((li) => li.querySelector('input').checked).map((li) => li.dataset.tab);
    function refresh() {
      const sel = picked().length;
      $('.cnt').textContent = !shown().length && $('.q').value.trim() ? t('resNoMatch') : t('resCount', { shown: shown().length, n: last.tabs.length, sel }); // 0.16.1 (fault 9): a search with no match says so
      const b = $('[data-s="sel"]');
      b.disabled = !sel;
      b.textContent = t('resOpenSel', { n: sel });
    }
    $('.q').addEventListener('input', () => {
      const q = $('.q').value.normalize('NFC').toLowerCase().trim();
      for (const li of lis()) li.hidden = !!q && !li.dataset.q.includes(q);
      refresh();
    });
    dlg.addEventListener('change', (ev) => { if (ev.target.matches('.main input[type=checkbox]')) refresh(); });
    let olderTimer = 0, olderSeq = 0;
    async function loadOlder() {
      const seq = ++olderSeq;
      let docs = [];
      try { docs = (await fetch(`/api/session/documents?q=${encodeURIComponent($('.oq').value)}&limit=200`).then((r) => r.json())).docs || []; } catch { /* none */ }
      if (seq !== olderSeq) return;
      $('.olist').innerHTML = docs.map((d) => `<li><button type="button" class="one" data-s="doc" data-id="${esc(d.id)}" data-name="${esc(d.name)}"><span class="ti">${esc(d.name)}</span><span class="me">${whenH(d.at)}</span></button></li>`).join('');
      // 0.16.1 (fault 9): no search typed and nothing saved is «nothing saved yet», not «nothing matches your search»
      $('.ocnt').textContent = docs.length ? t('resOlderCount', { n: docs.length }) : $('.oq').value.trim() ? t('resOlderEmpty') : t('resOlderNone');
    }
    $('.oq').addEventListener('input', () => { clearTimeout(olderTimer); olderTimer = setTimeout(loadOlder, 180); });
    async function resume(tabs) {
      dlg.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      // an agent's document keeps this tab: nothing navigates it away, every chosen document gets a window of its own
      const r = await json('/api/session/resume', { runId: last.runId, ...(holdsDoc() ? {} : { tab }), ...(tabs ? { tabs } : {}) });
      $('.out').textContent = r.ok ? t('sessOpened', { n: r.n }) : String(r.error || t('resFailed'));
      document.documentElement.dataset.bwResume = r.ok ? 'resumed' : 'failed';
      if (!r.ok) { dlg.querySelectorAll('button').forEach((x) => { x.disabled = false; }); refresh(); return; }
      // this tab becomes the run's first tab (never an extra one): it opens there itself
      if (r.here) { info = null; hub.bye(); setTimeout(() => location.replace(r.here), 600); }
      setTimeout(() => { dlg.close(); dlg.remove(); }, 1200);
    }
    dlg.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-s]');
      const k = el?.dataset.s;
      if (!k) return;
      if (k === 'all') { for (const li of shown()) li.querySelector('input').checked = true; refresh(); return; }
      if (k === 'none') { for (const li of lis()) li.querySelector('input').checked = false; refresh(); return; }
      if (k === 'one') { await resume([el.closest('li').dataset.tab]); return; }
      if (k === 'sel') { const ids = picked(); if (ids.length) await resume(ids); return; }
      if (k === 'every') { await resume(null); return; }
      if (k === 'later') { dlg.close(); return; }
      if (k === 'older') { $('.main').hidden = true; $('.older').hidden = false; loadOlder(); $('.oq').focus(); return; }
      if (k === 'back') { $('.older').hidden = true; $('.main').hidden = false; $('.q').focus(); return; }
      if (k === 'doc') {
        el.disabled = true;
        try {
          const html = await fetch(`/api/session/document?id=${encodeURIComponent(el.dataset.id)}`).then((r) => { if (!r.ok) throw new Error('read'); return r.text(); });
          await EXT.library?.importAny(new File([html], `${el.dataset.name}.html`, { type: 'text/html' }));
          document.documentElement.dataset.bwResume = 'older';
          $('.out').textContent = t('resOlderOpened', { name: el.dataset.name });
          setTimeout(() => { dlg.close(); dlg.remove(); }, 600);
        } catch { el.disabled = false; $('.out').textContent = t('resFailed'); }
        return;
      }
      if (k === 'new') {
        dlg.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        await json('/api/session/new', { runId: last.runId, tab });
        document.documentElement.dataset.bwResume = 'new';
        if (!/[#&]doc=/.test(location.hash) && !holdsDoc()) await EXT.library?.newDocument(); // a tab that holds a document keeps it (0.15.0, and an agent's since 0.16.0): never a blank one that owns nothing
        dlg.close(); dlg.remove();
      }
    });
    dlg.addEventListener('close', () => { if (openDlg === dlg) openDlg = null; release?.(); }, { once: true }); // answered or dismissed (Esc, «not now»): the hold goes, nothing was changed
    refresh();
    dlg.showModal();
    $('.q').focus();
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
    let stored = false;
    try { if (!tab) { tab = sessionStorage.getItem('bw:tab'); stored = !!tab; } } catch { /* no storage */ }
    tab ||= newId();
    // 0.15.9 A4: a tab the browser discarded (or killed) and the user came back to is reloaded by the browser with the same tab id (sessionStorage survives). The host kept it as
    // `lost` with its last state, and says so (x-bw-lost); the state is put back and one plain message says what happened. A plain reload of a live tab is left alone.
    let wasDiscarded = false;
    if (!resumed && stored) { try { const r = await fetch(`/api/session/tab?tab=${encodeURIComponent(tab)}`); if (r.ok && (r.headers.get('x-bw-lost') === '1' || document.wasDiscarded === true)) { resumed = await r.json(); wasDiscarded = true; } } catch { /* fresh */ } }
    try { sessionStorage.setItem('bw:tab', tab); } catch { /* no storage */ }
    if (AUTO) document.documentElement.dataset.bwAutomation = '1';
    try { navigator.locks?.request(`bw-tab:${tab}`, { mode: 'shared' }, () => new Promise(() => {})).catch(() => {}); } catch { /* no Web Locks */ } // held while this page lives: the hub's proof that the tab is not gone
    hub.on('flush', flush);
    hub.start();
    AWK.start();
    if (resumed) { await apply(resumed); if (wasDiscarded) { document.documentElement.dataset.bwDiscarded = '1'; toast(t('discardedMsg'), 'ok'); } }
    else if (!AUTO) {
      const release = window.BW?.holdReady?.('resume'); // bw:ready / data-bw-ready wait until the resume question is settled (a tool's ?automation=1 tab never asks)
      const last = await fetch('/api/session/last').then((r) => r.json()).catch(() => null);
      if (last?.tabs?.length) modal(last, release); else release?.();
    }
    push();
    seen();
    document.documentElement.dataset.bwSession = tab;
    healLink();
  }
  /** A #doc=<id> link whose document this browser's IndexedDB does not hold (a profile closed before Chrome flushed its relaxed-durability write, a wiped or moved profile)
   *  but the host's mirror does: the library boot opens the link BEFORE it reads the mirror, so the tab came up holding nothing and the host never saw the document in it.
   *  Here the mirror is read and the link is opened again, a few times, until the tab holds the document or the address no longer asks for it. */
  async function healLink() {
    const m = /[#&]doc=([^&]+)/.exec(location.hash);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    const L = () => EXT.library;
    let ingested = false;
    for (let i = 0; i < 12; i += 1) {
      await new Promise((r) => setTimeout(r, i ? 1500 : 800));
      if (!L() || !new RegExp(`[#&]doc=${encodeURIComponent(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(location.hash)) return;
      if (holdsDoc() && S.svc === id) return;
      if (holdsDoc()) return; // another document was opened meanwhile: leave it
      try {
        if (!(await L().get(id)) && !ingested) { ingested = true; await L().ingestMirror(); }
        if (await L().get(id)) { await L().open(id); document.documentElement.dataset.bwHealed = id; }
      } catch { /* try again */ }
    }
  }
  const card =() => (info ? `<p class="hint">${esc(t('wsLead'))}</p><p><code class="ws-root">${esc(info.workspace.root)}</code></p><div class="btns"><button type="button" class="b" data-ws="pick"><span class="w">${esc(t('wsChange'))}</span></button></div>` : `<p class="hint">${esc(t('wsServerOnly'))}</p>`);
  const mountCard = (el) => el?.querySelector('[data-ws="pick"]')?.addEventListener('click', async () => {
    const r = await json('/api/workspace/pick', {});
    if (r.ok) { info.workspace = { root: r.root, chosen: true }; el.querySelector('.ws-root').textContent = r.root; }
  });
  /* 0.15.9 B4: the browser picker (GET/POST /api/browser, engine/routes/session.mjs). It applies to the next window the host opens. */
  const brCard = () => (info ? `<p class="hint">${esc(t('brLead'))}</p><p><select class="br-sel" aria-label="${esc(t('brTitle'))}"></select></p><p class="hint br-now" role="status"></p>` : `<p class="hint">${esc(t('brServerOnly'))}</p>`);
  const brMount = async (el) => {
    const sel = el?.querySelector('.br-sel');
    if (!sel) return;
    const now = el.querySelector('.br-now');
    const draw = (b) => {
      sel.textContent = '';
      const add = (v, label) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); };
      add('', t('brAuto'));
      if (b.systemDefault) add('default', t('brSystem', { name: b.systemDefault.name }));
      for (const c of b.choices || []) add(c.id, c.recommended ? `${c.name} (${t('brRec')})` : c.name);
      sel.value = [...sel.options].some((o) => o.value === b.saved) ? b.saved : '';
      now.textContent = [b.chosen ? t('brNow', { name: b.chosen.name }) : '', b.chosen && !b.chosen.closable ? t('brOpener') : '', b.chromeFound ? '' : t('brNoChrome')].filter(Boolean).join(' ');
      document.documentElement.dataset.bwBrowser = b.chosen?.id || '';
    };
    try { const r = await fetch('/api/browser'); if (r.ok) draw(await r.json()); } catch { return; }
    sel.addEventListener('change', async () => {
      const r = await json('/api/browser', { browser: sel.value });
      if (r.ok) draw(r); else now.textContent = t('brFailed');
    });
  };
  return { boot, push, soon, flush, ensureFolder, card, mountCard, brCard, brMount, dismissResume, claim, on: hub.on, bye: hub.bye, again: hub.again, seen, get readonly() { const d = curDoc(); return d ? (follows(d) ? 'follower' : LS.stale[d] ? 'stale' : '') : ''; }, get transport() { return hub.mode; }, get silentMs() { return hub.silentMs; }, get rescuing() { return hub.rescuing; }, get automation() { return AUTO; }, get tab() { return tab; }, get info() { return info; } };
})();

bwExt({
  settings: [{ id: 'workspace', title: 'wsTitle', html: SESS.card, mount: SESS.mountCard }, { id: 'browser', title: 'brTitle', html: SESS.brCard, mount: SESS.brMount }],
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
  const seenReq = new Set();
  SESS.on('req', (d) => {
    if (!d?.id || seenReq.has(d.id)) return;
    seenReq.add(d.id); document.documentElement.dataset.bwReqSeen = String(seenReq.size); if (seenReq.size > 200) seenReq.delete(seenReq.values().next().value);
    const asks = d.tool === 'action' && d.args?.id === 'dismissResume'; // that action answers for itself (dismissed: true/false)
    if (!asks) SESS.dismissResume(); // 0.16.0: a tool is talking to this tab: a popup that waits for a person never blocks it
    window.BW.dismissBlockers?.({ keepResume: asks }); // nor does a first-launch or confirm card
    queue = queue.then(async () => {
      try {
        if (!asks) await window.BW.whenReady(10000).catch(() => {}); // a tab still booting answers once it has, or after 10 s anyway (dismissResume never waits for the very popup it closes)
        reply({ id: d.id, ok: true, result: await window.BW.bridge(d.tool, d.doc, d.args) });
      } catch (e) {
        reply({ id: d.id, ok: false, error: { code: e?.bw || 'HOST_ERROR', message: String(e?.message || e).slice(0, 400), ...(e?.extra || {}) } });
      }
    });
  });
}
