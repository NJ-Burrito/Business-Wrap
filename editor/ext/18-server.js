/* Server banner (owner request 2026-10-30). When an editor is opened and no Business-Wrap server answers (a file:// page, or a served
 * page whose server died), a banner at the top says so and offers «Start server»: the same action as Settings › Local server (srvBegin in
 * editor/settings.js: business-wrap://open?file=<this document> through the registered URL protocol). When a server answers, it turns into
 * «Open from the server», which goes to the served address of the SAME document. Dismissible (it comes back on the next open). The page
 * re-checks every 10 s and when the window regains focus. The only network traffic from a file:// page is the GET /api/version probe of
 * 127.0.0.1:4317-4327 (srvProbe); a served page asks its own /api/version. */
const SB = (() => {
  const st = { mode: 'none', note: '', busy: false, dismissed: false, port: 0, started: false, file: '', lang: '' };
  let el = null;
  const served = () => /^https?:$/.test(location.protocol);
  const mark = () => { document.documentElement.dataset.bwServer = st.dismissed ? 'dismissed' : st.busy ? 'starting' : st.mode; };
  const filePath = () => (served() ? (st.file || ls.get('bw:srv-file') || '') : srvFilePath());
  /** The banner stays at the top; the toolbar (a fixed island) sits below it while it shows, so it never covers a control. */
  let ro = null;
  function place() {
    const isl = root.querySelector('.island');
    if (!el || !isl) return;
    const shown = !el.hidden && !st.dismissed && st.mode !== 'none';
    isl.style.insetBlockStart = shown ? `${Math.round(el.offsetHeight + 16)}px` : '';
    if (!ro && typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { place(); measureBar(true); }); ro.observe(el); }
  }
  function draw() {
    mark();
    // an automated browser (navigator.webdriver: tests, CI, an agent) is not nagged: the banner would cover what it drives and move the layout it measures;
    // the state is still published on <html data-bw-server>. localStorage bw:srv-banner = 1 turns it back on (the banner's own test).
    const quiet = navigator.webdriver && ls.get('bw:srv-banner') !== '1';
    if (st.dismissed || st.mode === 'none' || quiet) { if (el) { el.hidden = true; place(); measureBar(true); } return; }
    if (!el) { el = document.createElement('div'); el.className = 'srv-bar'; el.setAttribute('role', 'region'); root.appendChild(el); }
    else if (!el.isConnected) root.appendChild(el);
    el.hidden = false;
    el.dataset.st = st.mode;
    el.dataset.lang = S.ui;
    el.dataset.calm = isCalm() ? '1' : '0';
    el.dir = S.ui === 'ar' ? 'rtl' : 'ltr';
    el.lang = S.ui;
    const up = st.mode === 'up';
    el.setAttribute('aria-label', t(up ? 'sbUp' : 'sbDown'));
    const btn = up
      ? `<button type="button" class="b primary" data-k="sbOpen"><span class="i">${ic('connect')}</span><span class="w">${esc(t('sbOpen'))}</span></button>`
      : `<button type="button" class="b primary" data-k="sbStart"${st.busy ? ' disabled' : ''}><span class="i">${ic('send')}</span><span class="w">${esc(t('sbStart'))}</span></button>`;
    const next = `<span class="srv-mark">${ic(up ? 'connect' : 'powerOff')}</span><div class="srv-txt" role="status" aria-live="polite"><strong>${esc(t(up ? 'sbUp' : 'sbDown'))}</strong><span>${esc(t(up ? 'sbUpLead' : 'sbDownLead'))}</span>${st.note ? `<span class="srv-note">${esc(st.note)}</span>` : ''}</div>${btn}<button type="button" class="b srv-x" data-k="sbDismiss" aria-label="${esc(t('sbDismiss'))}" title="${esc(t('sbDismiss'))}"><span class="i">${ic('close')}</span></button>`;
    if (el.dataset.html !== next) { el.dataset.html = next; el.innerHTML = next; }
    place();
    measureBar(true);
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
      } catch (e) { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return null; /* slow, not dead: keep what the banner shows */ }
      return srvProbe();
    }
    return srvProbe();
  }
  async function check() {
    if (st.busy || SRV.busy) return;
    const found = await probe();
    if (!found) return;
    if (st.busy || SRV.busy) return;
    if (served()) {
      const own = found[0] === (Number(location.port) || 80);
      st.mode = own ? 'none' : found.length ? 'up' : 'down';
    } else {
      st.mode = found.length ? (st.started || st.mode === 'down' ? 'up' : 'none') : 'down'; // a server already up when the file was opened: nothing to nag about; one that comes up while the banner shows: offer it
    }
    st.port = found[0] || 0;
    if (st.mode === 'down' && !st.busy) st.note = st.note === t('sbStarting') ? '' : st.note;
    draw();
  }
  async function start() {
    if (st.busy || SRV.busy) return;
    const f = filePath();
    if (!f) { st.note = t('sbNoPath'); draw(); return; }
    st.busy = true; SRV.busy = true; st.note = '';
    draw();
    const r = await srvBegin(f, (s) => { if (s === 'starting') { st.note = t('sbStarting'); draw(); } });
    SRV.busy = false; st.busy = false;
    if (r === 'failed') { st.mode = 'down'; st.note = t('sbFailed'); } else { st.mode = 'up'; st.port = SRV.found[0]; st.started = true; st.note = ''; }
    draw();
    el?.querySelector(r === 'failed' ? '[data-k="sbStart"]' : '[data-k="sbOpen"]')?.focus();
    srvDraw();
  }
  function open() { if (st.port) location.href = `http://127.0.0.1:${Number(st.port)}/`; }
  function click(e) {
    const k = e.target.closest('button')?.dataset.k;
    if (k === 'sbStart') start();
    if (k === 'sbOpen') open();
    if (k === 'sbDismiss') { st.dismissed = true; draw(); }
  }
  function init() {
    root.addEventListener('click', (e) => { if (el && e.composedPath().includes(el)) click(e); });
    check();
    setInterval(check, 10000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  }
  return { init, check, draw, start, open, state: st, sync: () => { if (!st.busy) check(); } };
})();

bwExt({
  on: { boot: () => SB.init(), render: () => { if (SB.state.mode !== 'none') SB.draw(); } },
  expose: { server: SB },
});
