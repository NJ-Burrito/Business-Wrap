/* The host switch (0.15.0 note 15; reworked 0.17.0 notes 10 and 17). ONE control starts and stops the local Business-Wrap host and shows,
 * in colour AND in words, whether it is up: a green / red dot, the word «Connected :4317» / «Offline», and a switch. It lives ONLY in the
 * top bar (inline-end, after the history counter): Settings no longer holds a copy and the power-off button is gone from it.
 *   - offline  -> press: «Starting…» (disabled, aria-busy, up to 20 s) -> online with the port, or an error state, one toast and «Try again».
 *   - online   -> press: stops at once (the open documents are saved first) and ONLY the host stops: the page stays open and shows «Offline»;
 *                 one 6 s «Undo» toast starts it again. Refused, with the reason in the tooltip, while an export / import / print job runs.
 *   - a file:// page with no host found pulses the gold ring twice, once per open (calm mode: no pulse).
 * No manual command (note 17). A file:// page cannot start a process, so on press it hands business-wrap://start to the browser (the installed
 * launcher starts this install's host and opens no browser; srvBegin in editor/settings.js), then polls 127.0.0.1:4317-4327 /api/health until
 * one answers (20 s cap; a plain message when the launcher is not registered yet). A served page talks to its own host
 * (engine/routes/servers.mjs). The only network traffic from a file:// page is the GET /api/version and /api/health probe of those ports (srvProbe).
 * ONE window (0.17.8 note O2): turning the host ON in the editor opened from disk REPLACES that page, in the same window and place, with the served editor
 * (location.replace to http://127.0.0.1:<port>/?via=disk&from=<file>: the host serves that same file, so it is the same document; a cancelable window event
 * `bw:follow` {detail:{url}} fires first, a test cancels it). The served tab remembers it came from disk (sessionStorage `bw:disk`, the URL is cleaned).
 * Turning it OFF in that tab asks the host (POST /api/servers/stop {returnTo:{x,y,w,h,file}}) to open the editor from disk as a new window at this window's
 * screenX / screenY / outerWidth / outerHeight before it ends (an http page cannot navigate to file://), then the served tab closes itself (window.close works
 * on a tab whose history holds one page, which location.replace keeps true). A served tab that did not come from disk behaves as before: «Offline», the page stays.
 * Contract for other lanes: window event `bw:server` {detail:{online}} on every change of the answer; `bw:wm` W07 (went online) / W08 (went offline)
 * on a real transition only; <html data-bw-server="online|offline|starting|stopping|error|checking"> for tests. */
const SB = (() => {
  const served = () => /^https?:$/.test(location.protocol);
  /** A served tab that was the editor on disk and was replaced in place (0.17.8): the marker rides the URL once, then lives in this tab's sessionStorage. */
  const disk = (() => {
    try {
      const u = new URL(location.href);
      if (served() && u.searchParams.get('via') === 'disk') {
        sessionStorage.setItem('bw:disk', JSON.stringify({ file: u.searchParams.get('from') || '' }));
        u.searchParams.delete('via'); u.searchParams.delete('from');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash); // replaceState keeps the history at one entry: the tab stays closable by script
      }
      return served() ? JSON.parse(sessionStorage.getItem('bw:disk') || 'null') : null;
    } catch { return null; }
  })();
  const diskQuery = (file) => `?via=disk&from=${encodeURIComponent(file || '')}`;
  const SPIN = '<svg aria-hidden="true" focusable="false" class="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'; // Lucide loader-circle (ISC)
  const st = { mode: served() ? 'online' : 'checking', port: served() ? Number(location.port) || 80 : 0, note: '', pulse: false, known: served(), answered: null };
  let pulsed = false;
  const word = () => ({ online: `${t('sv.on')}${st.port ? ` :${st.port}` : ''}`, offline: t('sv.off'), starting: t('sv.starting'), stopping: t('sv.stopping'), checking: t('sv.checking'), error: t('sv.error') })[st.mode];
  const isBusy = () => st.mode === 'starting' || st.mode === 'stopping' || st.mode === 'checking';
  const jobRunning = () => (window.BW?.EXT?.busy || EXT.busy)?.active?.() > 0;
  /** The switch's markup: a pure function of the state, so the toolbar's in-place patch (syncUi) and our own redraw agree. */
  function html(where = 'top') {
    const m = st.mode;
    const online = m === 'online';
    const refused = online && jobRunning();
    const tip = refused ? t('sv.tipBusy') : st.note && (m === 'error' || m === 'offline') ? st.note : online ? t('sv.tipOn') : m === 'offline' || m === 'error' ? t('sv.tipOff') : word();
    const dot = isBusy() ? `<span class="srv-dot" aria-hidden="true">${SPIN}</span>` : '<span class="srv-dot" aria-hidden="true"></span>';
    return `<button type="button" class="srv-toggle" data-k="srvToggle" data-where="${where}" data-st="${m}" data-pulse="${st.pulse ? '1' : '0'}" role="switch" aria-checked="${online ? 'true' : 'false'}"${isBusy() ? ' aria-busy="true" disabled' : ''}${refused ? ' aria-disabled="true"' : ''} title="${esc(tip)}" aria-label="${esc(`${t('sv.label')}: ${word()}`)}">${dot}<span class="srv-w">${esc(word())}</span><span class="srv-track" aria-hidden="true"><i class="srv-thumb"></i></span></button>`;
  }
  function mark() { document.documentElement.dataset.bwServer = st.mode; }
  function draw() {
    mark();
    root.querySelectorAll('.srv-toggle').forEach((el) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = html(el.dataset.where || 'top');
      uiMorph(el, tpl.content.firstElementChild, true);
    });
    measureBar(true);
  }
  /** 0.17.13: after a state change, and after an «online» answer in the first 20 s of a page's life (a host that is stopping can still answer once), ask again every 1.5 s for 15 s before relaxing to the 10 s beat. */
  let fastUntil = 0, fastT = 0;
  function fast() {
    fastUntil = Date.now() + 15000;
    if (fastT) return;
    const tick = () => { fastT = 0; if (Date.now() >= fastUntil) return; fastT = setTimeout(tick, 1500); check(); };
    fastT = setTimeout(tick, 1500);
  }
  function set(mode, note = '') {
    const changed = st.mode !== mode;
    st.mode = mode;
    st.note = note;
    if (mode === 'online') st.pulse = false;
    draw();
    if (changed && (mode === 'online' || mode === 'offline')) fast();
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
  let slow = 0; // consecutive timeouts of this page's own host
  async function probe() {
    if (served()) {
      try {
        const j = await (await fetch('/api/version', { cache: 'no-store', signal: AbortSignal.timeout(slow ? 2500 : 6000) })).json();
        slow = 0;
        if (j) return j.stopping ? [] : [Number(location.port) || 80]; // 0.17.13: a host that says it is stopping is already gone
      } catch (e) {
        // 0.17.13: a refused connection means the host is gone (fall through at once to the other ports); a timeout is slow, not dead, once - the second in a row, with no export running, counts as gone
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') { slow += 1; if (slow < 2 || jobRunning()) { fast(); return null; } }
      }
    }
    return srvProbe();
  }
  async function check() {
    if (isBusy() && st.mode !== 'checking') return;
    if (SRV.busy) return;
    const found = await probe();
    if (!found || (isBusy() && st.mode !== 'checking') || SRV.busy) return;
    st.port = found[0] || 0;
    if (found.length && performance.now() < 20000) fast();
    if (found.length) { const wanted = st.mode === 'error'; set('online'); if (wanted) reconnect(); } // a host came up after a failed start (a late «Open» in the browser box): a served page follows it
    else {
      if (st.mode === 'error') { draw(); return; } // an error stays until the next press or a server appears
      const first = st.mode === 'checking';
      set('offline', st.mode === 'offline' ? st.note : '');
      if (first && !served() && !pulsed && !isCalm()) { pulsed = true; st.pulse = true; draw(); setTimeout(() => { st.pulse = false; draw(); }, 1300); }
    }
  }
  async function start() {
    if (isBusy() || SRV.busy) return;
    SRV.busy = true;
    set('starting');
    // 0.17.7: a browser asks before it hands business-wrap: to another program, once per page ORIGIN (a file:// editor and the served http://127.0.0.1:<port> tab are two origins);
    // the box is easy to miss, so a host that has not answered after a few seconds gets one plain hint instead of a silent wait.
    const hint = setTimeout(() => { if (st.mode === 'starting') toast(t('sv.allowHint'), 'info', { ms: 12000 }); }, 3500);
    let r;
    try { r = await srvBegin(); } finally { clearTimeout(hint); SRV.busy = false; }
    if (r === 'failed') {
      set('error', t('sv.noStart'));
      toast(t('sv.failed', { r: t('sv.noStart') }), 'warn', { actions: [[t('sv.retry'), start]] });
      return;
    }
    st.port = SRV.found[0] || st.port;
    set('online');
    reconnect();
  }
  /** A served page whose own host is gone and which found a host on another port (the restarted host did not get this port back): go to it, the same document from the host that is up now. */
  function reconnect() {
    if (served() && st.port && st.port !== (Number(location.port) || 80)) location.href = `http://127.0.0.1:${st.port}/${disk ? diskQuery(disk.file) : ''}`;
    else if (!served() && st.port) follow();
  }
  /** The file:// page replaces ITSELF with the served editor: same window, same place, one window (history stays one page). */
  function follow() {
    const url = `http://127.0.0.1:${Number(st.port)}/${diskQuery(srvDiskFile())}`;
    if (!window.dispatchEvent(new CustomEvent('bw:follow', { detail: { url }, cancelable: true }))) return;
    location.replace(url);
  }
  const geometry = () => ({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
  async function stop() {
    if (isBusy() || SRV.busy) return;
    if (jobRunning()) { toast(t('sv.tipBusy'), 'warn'); return; }
    SRV.busy = true;
    set('stopping');
    let gone = false;
    let back = false; // the editor from disk opened as a new window where this one is: this tab goes away
    let why = '';
    if (served()) {
      await srvSaveHere();
      try {
        const r = await fetch('/api/servers/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, ...(disk ? { returnTo: { ...geometry(), file: disk.file } } : {}) }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.status);
        gone = true;
        const j = await r.json().catch(() => ({}));
        if (disk && j.reopened && !j.reopened.error) back = true;
      } catch (e) { why = String(e.message || e); }
    } else {
      srvLaunch('business-wrap://stop');
      gone = await srvWait(false, 20000);
      why = t('sv.noLauncherStop');
    }
    SRV.busy = false;
    if (!gone) { st.port = st.port || 0; set('online'); toast(t('sv.stopFailed', { r: why }), 'warn'); return; }
    set('offline');
    const stopped = () => toast(t('sv.stoppedToast'), 'info', { ms: 6000, actions: [[t('sv.undo'), start]] });
    if (back) { setTimeout(() => window.close(), 1500); setTimeout(stopped, 2200); return; } // the new window has had its moment to appear; a browser that refuses to close this tab leaves it «Offline» with the usual toast
    stopped();
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
  return { init, check, draw, start, stop, press, markOff, open, html, state: st, sync: () => { if (!isBusy()) check(); } };
})();

bwExt({
  on: { boot: () => SB.init(), render: () => SB.draw() },
  expose: { server: SB },
});
