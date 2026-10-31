/* The server toggle (0.15.0, owner note 15). ONE button starts and stops the local Business-Wrap server and shows, in colour AND in icon AND in words,
 * whether it is online. It lives in two places, one component: the top bar (inline-end, after the history counter) and Settings › Local server.
 * The banner of 0.14.0 and the Start / Stop / Open buttons are gone.
 *   - offline  -> press: «Starting…» (disabled, aria-busy, up to 30 s) -> online with the port, or an error state, one toast and «Try again».
 *   - online   -> press: stops at once (the open documents are saved first); one 6 s «Undo» toast starts it again.
 *                 Refused, with the reason in the tooltip, while an export / import / print job runs.
 *   - a file:// page with no server found pulses the gold ring twice, once per open (calm mode: no pulse).
 * A file:// page cannot start a process, so it asks the installed Business-Wrap through the business-wrap: URL protocol (srvBegin in editor/settings.js);
 * a served page talks to its own server (engine/routes/servers.mjs). The only network traffic from a file:// page is the GET /api/version probe of
 * 127.0.0.1:4317-4327 (srvProbe); a served page asks its own /api/version.
 * Contract for other lanes: window event `bw:server` {detail:{online}} on every change of the answer; `bw:wm` W07 (went online) / W08 (went offline)
 * on a real transition only; <html data-bw-server="online|offline|starting|stopping|error|checking"> for tests. */
const SB = (() => {
  const served = () => /^https?:$/.test(location.protocol);
  const ICO = (p) => `<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const SRV_IC = { // Lucide (ISC): server, server-off, loader-circle, triangle-alert
    online: ICO('<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>'),
    offline: ICO('<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5"/><path d="M10 10 2.5 2.5"/><path d="M22 17v-1a2 2 0 0 0-2-2h-1"/><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14"/><path d="M6 18h.01"/><path d="m2 2 20 20"/>'),
    busy: ICO('<path d="M21 12a9 9 0 1 1-6.219-8.56"/>'),
    error: ICO('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  };
  const st = { mode: served() ? 'online' : 'checking', port: served() ? Number(location.port) || 80 : 0, note: '', file: '', pulse: false, known: served(), answered: null };
  let pulsed = false;
  const word = () => ({ online: `${t('sv.on')}${st.port ? ` :${st.port}` : ''}`, offline: t('sv.off'), starting: t('sv.starting'), stopping: t('sv.stopping'), checking: t('sv.checking'), error: t('sv.error') })[st.mode];
  const isBusy = () => st.mode === 'starting' || st.mode === 'stopping' || st.mode === 'checking';
  const jobRunning = () => (window.BW?.EXT?.busy || EXT.busy)?.active?.() > 0;
  const filePath = () => (served() ? (st.file || ls.get('bw:srv-file') || '') : srvFilePath());
  /** The toggle's markup: a pure function of the state, so the toolbar's in-place patch (syncUi) and our own redraw agree. */
  function html(where = 'top') {
    const m = st.mode;
    const online = m === 'online';
    const refused = online && jobRunning();
    const tip = refused ? t('sv.tipBusy') : st.note && (m === 'error' || m === 'offline') ? st.note : online ? t('sv.tipOn') : m === 'offline' || m === 'error' ? t('sv.tipOff') : word();
    const icon = isBusy() ? SRV_IC.busy : m === 'error' ? SRV_IC.error : online ? SRV_IC.online : SRV_IC.offline;
    return `<button type="button" class="srv-toggle" data-k="srvToggle" data-where="${where}" data-st="${m}" data-pulse="${st.pulse ? '1' : '0'}" role="switch" aria-checked="${online ? 'true' : 'false'}"${isBusy() ? ' aria-busy="true" disabled' : ''}${refused ? ' aria-disabled="true"' : ''} title="${esc(tip)}" aria-label="${esc(`${t('sv.label')}: ${word()}`)}"><span class="srv-track" aria-hidden="true"><i class="srv-thumb"></i></span><span class="srv-ic" aria-hidden="true">${icon}</span><span class="srv-w">${esc(word())}</span></button>`;
  }
  /** The one sentence Settings shows under its toggle. */
  function sentence() {
    if (st.mode === 'online') return t('sv.setOn', { p: st.port || '' });
    if (st.mode === 'error' || (st.mode === 'offline' && st.note)) return st.note;
    if (st.mode === 'starting') return t('srv.starting');
    if (st.mode === 'stopping') return t('srv.stopping');
    if (st.mode === 'checking') return t('srv.checking');
    return t('sv.setOff');
  }
  function mark() { document.documentElement.dataset.bwServer = st.mode; }
  function draw() {
    mark();
    root.querySelectorAll('.srv-toggle').forEach((el) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = html(el.dataset.where || 'top');
      uiMorph(el, tpl.content.firstElementChild, true);
    });
    srvDraw(); // the Settings card (sentence, open link), when its drawer is open
    measureBar(true);
  }
  function set(mode, note = '') {
    st.mode = mode;
    st.note = note;
    if (mode === 'online') st.pulse = false;
    draw();
    const online = mode === 'online';
    const answer = online ? true : mode === 'offline' || mode === 'error' ? false : null;
    if (answer !== null && answer !== st.answered) {
      const first = st.answered === null;
      st.answered = answer;
      window.dispatchEvent(new CustomEvent('bw:server', { detail: { online: answer } }));
      if (!first) window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: online ? 'W07' : 'W08' } }));
    }
  }
  /** Who answers now: the ports a file:// page asks, or this served page's own /api/version (then, best effort, the other ports). */
  async function probe() {
    if (served()) {
      try {
        const j = await (await fetch('/api/version', { cache: 'no-store', signal: AbortSignal.timeout(6000) })).json();
        if (j) {
          if (!st.file) { try { const s = await (await fetch('/api/servers/file', { cache: 'no-store' })).json(); if (s?.file) { st.file = s.file; ls.set('bw:srv-file', s.file); } } catch { /* the file is learned next time */ } }
          return [Number(location.port) || 80];
        }
      } catch (e) { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return null; /* slow, not dead: keep what the toggle shows */ }
    }
    return srvProbe();
  }
  async function check() {
    if (isBusy() && st.mode !== 'checking') return;
    if (SRV.busy) return;
    const found = await probe();
    if (!found || (isBusy() && st.mode !== 'checking') || SRV.busy) return;
    st.port = found[0] || 0;
    if (found.length) set('online');
    else {
      if (st.mode === 'error') { draw(); return; } // an error stays until the next press or a server appears
      const first = st.mode === 'checking';
      set('offline', st.mode === 'offline' ? st.note : '');
      if (first && !served() && !pulsed && !isCalm()) { pulsed = true; st.pulse = true; draw(); setTimeout(() => { st.pulse = false; draw(); }, 1300); }
    }
  }
  async function start() {
    if (isBusy() || SRV.busy) return;
    const f = filePath();
    if (!f) { set('error', t('srv.nopath')); toast(t('sv.failed', { r: t('srv.nopath') }), 'warn', { actions: [[t('sv.retry'), start]] }); return; }
    SRV.busy = true;
    set('starting');
    const r = await srvBegin(f);
    SRV.busy = false;
    if (r === 'failed') {
      set('error', t('srv.noHandler'));
      toast(t('sv.failed', { r: t('srv.noHandler') }), 'warn', { actions: [[t('sv.retry'), start]] });
      return;
    }
    st.port = SRV.found[0] || st.port;
    set('online');
    if (served() && st.port && st.port !== (Number(location.port) || 80)) location.href = `http://127.0.0.1:${st.port}/`; // the same document, from the server that is up now
  }
  async function stop() {
    if (isBusy() || SRV.busy) return;
    if (jobRunning()) { toast(t('sv.tipBusy'), 'warn'); return; }
    SRV.busy = true;
    set('stopping');
    let gone = false;
    let why = '';
    if (served()) {
      await srvSaveHere();
      try {
        const r = await fetch('/api/servers/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        gone = true;
      } catch (e) { why = String(e.message || e); }
    } else {
      srvLaunch('business-wrap://stop');
      gone = await srvWait(false, 20000);
      why = t('srv.noHandlerStop');
    }
    SRV.busy = false;
    if (!gone) { st.port = st.port || 0; set('online'); toast(t('sv.stopFailed', { r: why }), 'warn'); return; }
    set('offline');
    toast(t('sv.stoppedToast'), 'info', { ms: 6000, actions: [[t('sv.undo'), start]] });
  }
  function press() { return st.mode === 'online' ? stop() : st.mode === 'offline' || st.mode === 'error' ? start() : undefined; }
  function open() { if (st.port) location.href = `http://127.0.0.1:${Number(st.port)}/`; }
  // the top bar's own markup carries the toggle (so syncUi keeps the very same node): after the history counter, or where a lane put a data-srv-slot
  const baseUi = uiHtml;
  uiHtml = function () {
    const h = baseUi();
    const tg = html('top');
    if (/<span data-srv-slot><\/span>/.test(h)) return h.replace(/<span data-srv-slot><\/span>/, () => tg);
    if (/<span class="flash vh"><\/span>\s*<\/div>/.test(h)) return h.replace(/(<span class="flash vh"><\/span>\s*<\/div>)/, (m) => m + tg);
    return h.replace(/<div class="progress"/, (m) => tg + m);
  };
  function init() {
    root.addEventListener('click', (e) => { const b = e.target.closest?.('.srv-toggle'); if (b && !b.disabled) press(); });
    mark();
    check();
    setInterval(() => { check(); if (st.mode === 'online') draw(); }, 10000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    if (served()) set('online');
  }
  /** The page learned the server is gone (the power card): show «offline» at once, without a probe. */
  function markOff() { if (st.mode === 'online') set('offline'); }
  return { init, check, draw, start, stop, press, markOff, open, html, sentence, state: st, sync: () => { if (!isBusy()) check(); } };
})();

bwExt({
  on: { boot: () => SB.init(), render: () => SB.draw() },
  expose: { server: SB },
});
