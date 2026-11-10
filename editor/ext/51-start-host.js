/* 0.19.0 N1 · the local-host switch on the start page (owner note N1; design work/sdlc/design/0190-n1.md).
 * The start page (50-start.js) covers the whole shell, so the top bar's switch (18-server.js) cannot be reached there. This file puts THE SAME control in the start page's own bar:
 * not a copy. The markup is SB.html('start') (EXT.server.html), the state is SB's one state object, and SB.draw() patches every .srv-toggle under the shadow root, so toggling either one
 * moves both (the dot, the word «Connected :4317» / «Offline», starting / stopping / error, the 1.5 s re-check, the bw:server and bw:wm events, html[data-bw-server]).
 * It owns no logic of its own: a press goes through the root's delegated click handler of 18-server.js (0.17.8-0.17.13 rules: one window, the file:// page swaps to the served URL,
 * turning the host off reopens the editor on disk at the same geometry, only the host stops).
 * Mounting needs no change in 50-start.*: a MutationObserver on html[data-bw-start] (+ the bw:start-open event) puts the switch into `.st-bar` before the language segment
 * (or into a `[data-st-host-slot]` if the start page ever offers one), and a childList guard puts it back if the bar is redrawn.
 * Landing: a page that was on the start page when it followed the host to another page (18-server.js landQuery) arrives with ?bwstart=1; the start page opens over it once the session
 * has settled, and the parameter is dropped. (A plain tool editor lands on the start page by itself, 0.18.2.)
 * Focus: the switch is disabled while it works; when the state settles the focus returns to it.
 * Contract: <html data-bw-start-host="1"> while the switch is mounted (tests). */
const STARTHOST = (() => {
  const PARAM = 'bwstart';
  const landing = (() => {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get(PARAM) !== '1') return false;
      u.searchParams.delete(PARAM);
      history.replaceState(history.state, '', u.pathname + u.search + u.hash); // replaceState keeps the history at one entry
      return true;
    } catch { return false; }
  })();
  const html = document.documentElement;
  const dlg = () => root.querySelector('dialog.bw-start');
  const startOpen = () => html.dataset.bwStart === 'open' && !!dlg();
  const mine = (d = dlg()) => d?.querySelector('.srv-toggle[data-where="start"]') || null;
  let guard = null, lastMode = '', held = false;
  function mount() {
    const d = dlg();
    if (!d || !EXT.server?.html || mine(d)) return;
    const bar = d.querySelector('[data-st-host-slot]') || d.querySelector('.st-bar');
    if (!bar) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = `${EXT.server.html('start')}<span class="st-host-live" role="status" aria-live="polite" data-st-host-live></span>`;
    const anchor = bar.matches('[data-st-host-slot]') ? null : bar.querySelector('[data-st-ui]');
    bar.insertBefore(tpl.content, anchor && anchor.parentNode === bar ? anchor : null);
    html.dataset.bwStartHost = '1';
    lastMode = html.dataset.bwServer || '';
    guard?.disconnect();
    guard = new MutationObserver(() => {
      if (!d.isConnected) { guard.disconnect(); guard = null; delete html.dataset.bwStartHost; return; }
      if (!mine(d)) mount(); // the bar was redrawn: put the switch back
    });
    guard.observe(d, { childList: true, subtree: true });
  }
  /** The state changed (18-server.js sets html[data-bw-server] on every change): say it aloud once, and give the focus back to the switch that was working. */
  function changed() {
    const b = mine();
    if (!b) return;
    const mode = html.dataset.bwServer || '';
    if (mode === lastMode) return;
    lastMode = mode;
    if (mode === 'checking') return;
    const live = dlg()?.querySelector('[data-st-host-live]');
    if (live && !/^(starting|stopping)$/.test(mode)) live.textContent = b.getAttribute('aria-label') || '';
    if (held && !/^(starting|stopping)$/.test(mode)) {
      held = false;
      if (root.activeElement !== b && !b.disabled) { try { b.focus({ preventScroll: true }); } catch { /* gone */ } }
    }
  }
  /** A page that came from the start page asks for the start page again, with the same waiting rules as 50-start's own auto-open. */
  async function land() {
    if (html.dataset.bwSessionSettled !== '1') await new Promise((ok) => window.addEventListener('bw:session-settled', ok, { once: true }));
    try { await window.BW?.whenReady?.(20000); } catch { return; }
    if (startOpen()) return;
    await EXT.start?.open?.({ auto: true });
  }
  function init() {
    new MutationObserver(() => { if (startOpen()) mount(); changed(); }).observe(html, { attributes: true, attributeFilter: ['data-bw-start', 'data-bw-server'] });
    window.addEventListener('bw:start-open', mount);
    root.addEventListener('pointerdown', (e) => { if (e.target.closest?.('.srv-toggle[data-where="start"]')) held = true; }, true);
    root.addEventListener('keydown', (e) => { if (e.target.closest?.('.srv-toggle[data-where="start"]') && (e.key === 'Enter' || e.key === ' ')) held = true; }, true);
    if (startOpen()) mount();
    if (landing) land().catch((e) => console.error(e));
  }
  return { init, mount, landing };
})();

bwExt({
  on: { boot: () => STARTHOST.init() },
});
