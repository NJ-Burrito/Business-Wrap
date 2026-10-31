/* 0.14.0 A4 · Reading mode (View › Reading mode). The chrome (toolbar, selection tools, panels, explainer panel) and every
 * editing affordance (selection rings, hover outlines, logo/diagram handles, the caret) go away; the document is shown
 * page by page (the person's own single/spread choice, else single) and read with ← → / PageUp PageDown / Space / Home
 * End. Esc or the visible «خروج» button leaves it and puts the page mode and side-by-side view back as they were.
 * Nothing is written: typing, pasting, dropping and clicks that would select or edit are swallowed while reading.
 * The mode is session-only (never saved), so a reload opens the editor normally. */
const RD = (() => {
  let saved = null;
  const html = document.documentElement;
  const isOn = () => !!S.reading;
  function exitBtn() {
    const shell = root.querySelector('.shell');
    if (!shell) return;
    let b = shell.querySelector(':scope > .rd-exit');
    if (!isOn()) { b?.remove(); return; }
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'b rd-exit';
      b.dataset.a = 'reading';
      shell.appendChild(b);
    }
    b.lang = S.ui;
    b.dir = shell.dataset.tdir || 'rtl';
    b.innerHTML = `<span class="i">${ic('reading')}</span><span class="w">${esc(t('reading.exit'))}</span><kbd>Esc</kbd>`;
    b.setAttribute('aria-label', `${t('reading.exit')} (Esc)`);
  }
  function enter() {
    if (isOn()) return;
    saved = { pages: S.pages, side: S.side, focus: S.focus };
    S.reading = true;
    S.sel = null; S.selOv = null; S.dg = null;
    try { dgClear(); } catch { /* no diagram selection */ }
    if (S.focus) S.focus = false;
    S.side = false;
    if (!viewModes().includes(S.pages) || S.pages === 'continuous') S.pages = 'single'; // not saved to bw:pages
    S.view = false;
    S.drawer && closeDrawer();
    html.dataset.bwReading = '1';
    host.setAttribute('data-reading', '1');
    document.getSelection()?.removeAllRanges();
    document.activeElement?.blur?.();
    buildUi();
    render(false);
    exitBtn();
    toast(t('reading.on'), 'info');
  }
  function leave() {
    if (!isOn()) return;
    S.reading = false;
    const at = S.pageAt || 0;
    if (saved) { S.pages = saved.pages; S.side = saved.side; }
    saved = null;
    delete html.dataset.bwReading;
    host.removeAttribute('data-reading');
    buildUi();
    render(false);
    exitBtn();
    if (viewsActive()) viewsReveal(at);
  }
  function toggle() { if (isOn()) leave(); else enter(); }
  // nothing is written, selected or opened while reading (the UI itself, the shadow tree, still works)
  const outside = (e) => !e.composedPath().includes(host);
  for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'dragstart']) {
    document.addEventListener(ev, (e) => { if (isOn() && outside(e) && !(e.target.closest?.('a[href]') && ev === 'click')) { e.stopImmediatePropagation(); if (ev === 'dragstart' || ev === 'contextmenu') e.preventDefault(); } }, true);
  }
  // a click on a focusable cell (tabindex) still focuses it by default and the editor would select it: no focus enters the page while reading
  document.addEventListener('focusin', (e) => { if (isOn() && outside(e)) { e.stopImmediatePropagation(); e.target.blur?.(); } }, true);
  for (const ev of ['beforeinput', 'paste', 'cut', 'drop']) {
    document.addEventListener(ev, (e) => { if (isOn()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }
  // the exit button survives a full UI rebuild (language switch …)
  new MutationObserver(() => { if (isOn() && !root.querySelector('.rd-exit')) exitBtn(); }).observe(root, { childList: true });
  return { enter, leave, toggle, isOn, exitBtn };
})();

bwExt({
  cmds: [{ id: 'reading', group: 'view', edit: false }],
  actions: { reading: async () => { RD.toggle(); } },
  on: {
    render: () => { if (RD.isOn()) RD.exitBtn(); },
    keydown: (e) => {
      if (!RD.isOn()) return false;
      if (e.key === 'Escape') { e.preventDefault(); RD.leave(); return true; }
      const t0 = e.composedPath?.()[0] || e.target;
      if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(t0.tagName || '')) { e.preventDefault(); viewsGo(e.shiftKey ? -1 : 1); return true; }
      return false;
    },
  },
});
