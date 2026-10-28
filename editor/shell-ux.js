/* Business-Wrap editor — shell UX (0.10.0), concatenated after diagram-ui.js.
 * The layout never flips: the shell keeps the default (Arabic, right-to-left) arrangement and only the words follow
 * the language / text direction (data-tdir). Segmented controls toggle from anywhere on the field and slide a thumb
 * on a spring. The selection's tools are a sticky mode: they stay while the person works in toolbars, panels, menus,
 * pickers and inline editors, and leave only on a click on empty space or Esc.
 * Declarations only (hoisted): boot() in editor.js runs before this file's statements. */

/** After every buildUi(): the selection section is rebuilt at once (a rebuild never drops the mode), thumbs, explainers. */
function uxAfterBuild() {
  buildCtx(blockOf(S.sel?.b), !!tableCtx());
  fitBar();
  segThumbs();
  xplWire();
  viewsPager();
  // web fonts change every word's width: fold again once they are in (both languages measure the same way then)
  if (!S.uxFonts) { S.uxFonts = true; const refit = () => { fitBar(); measureBar(); segThumbs(); }; document.fonts?.ready.then(refit); document.fonts?.addEventListener?.('loadingdone', refit); }
}

/* ── A3: segmented controls ─────────────────────────────────────────────── */
/** A click anywhere on a segmented field: on an option → that option; on the caption, padding or thumb → the next one. */
function uxSegClick(e) {
  const seg = e.target.closest?.('.seg[data-x]');
  if (!seg) return false;
  const opts = [...seg.querySelectorAll('button[data-a]')];
  let b = e.target.closest('button[data-a]');
  if (!b) {
    const i = opts.findIndex((x) => x.getAttribute('aria-pressed') === 'true');
    b = opts[(i + 1) % opts.length];
  }
  if (!b) return true;
  const th = seg.querySelector('.thumb');
  if (th && S.uxSeg) { const r = th.getBoundingClientRect(); const s0 = seg.getBoundingClientRect(); const k = seg.offsetWidth / (s0.width || 1); S.uxSeg[seg.dataset.x] = { x: (r.left - s0.left) * k - seg.clientLeft, y: (r.top - s0.top) * k - seg.clientTop, w: r.width * k, h: r.height * k }; }
  if (b.dataset.a === 'ed') setLang(b.dataset.ed);
  else if (b.dataset.a === 'dir') setDir(b.dataset.d);
  else runAction(b.dataset.a);
  return true;
}
/** The thumb sits under the pressed option; after a rebuild it starts where it was and springs to the new place. */
function segThumbs() {
  const prev = S.uxSeg || (S.uxSeg = {});
  root.querySelectorAll('.seg[data-x]').forEach((seg) => {
    const th = seg.querySelector('.thumb');
    const on = seg.querySelector('button[aria-pressed="true"]');
    if (!th) return;
    if (!on || !on.offsetWidth) { th.style.opacity = on ? '' : '0'; return; }
    const geo = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
    const put = (g) => { th.style.transform = `translate(${g.x}px, ${g.y}px)`; th.style.width = `${g.w}px`; th.style.height = `${g.h}px`; };
    const old = prev[seg.dataset.x];
    if (old && (old.x !== geo.x || old.w !== geo.w) && !isCalm()) {
      th.style.transition = 'none';
      put(old);
      void th.offsetWidth;
      th.style.transition = '';
      requestAnimationFrame(() => put(geo));
    } else put(geo);
    prev[seg.dataset.x] = geo;
  });
}

/* ── A2: the toolbar folds the same way in Arabic and English ──────────────── */
/** Every toolbar word holds the width of the longer of its two languages, so ع and E fold the same way and every
 *  tool sits in the same place in both. Both widths are real renderings (the other language's words are swapped in
 *  for one layout), so fonts and kerning match. Returns the undo hook fitBar calls (kept: the widths stay). */
function uxWidest(bar) {
  bar.querySelectorAll('[data-alt]').forEach((el) => { el.style.minWidth = ''; });
  const els = [...bar.querySelectorAll('[data-alt]')].filter((el) => el.dataset.alt && el.offsetParent);
  if (!els.length) return () => {};
  const textOf = (el) => (el.tagName === 'SELECT' ? el.selectedOptions[0] : el);
  const keep = els.map((el) => textOf(el)?.textContent);
  // each language measured in its own lang/dir, whichever the UI is in now: both UIs reach the same numbers
  const width = (lang, pick) => {
    els.forEach((el, i) => { const x = textOf(el); if (x) x.textContent = pick(i); el.lang = lang; el.style.direction = lang === 'ar' ? 'rtl' : 'ltr'; });
    const k = bar.offsetWidth / (bar.getBoundingClientRect().width || 1); // layout px: the entry animation scales the bar
    return els.map((el) => el.getBoundingClientRect().width * k);
  };
  const mine = S.ui;
  const a = width(mine, (i) => keep[i]);
  const b = width(other(mine), (i) => els[i].dataset.alt);
  els.forEach((el, i) => { const x = textOf(el); if (x) x.textContent = keep[i]; el.removeAttribute('lang'); el.style.direction = ''; });
  els.forEach((el, i) => { el.style.minWidth = `${Math.round(Math.max(a[i], b[i])) + 1}px`; }); // round, not ceil: sub-pixel noise must not tip one UI over
  return () => {};
}

/* ── A4: sticky context ─────────────────────────────────────────────────── */
/** Empty space: the desk, the page background, the body. Never a block, a free-placed logo/image, a diagram, an inline editor. */
function uxIsEmptySpace(el) {
  if (!el || el === host) return false;
  if (el === document.body || el === document.documentElement) return true;
  if (!el.closest?.('#bw-pair')) return false;
  return !el.closest('[data-b], [data-p], .bw-ov, figure[data-dg], .bw-dg-edit, #bw-overlay');
}
/** Esc inside the UI peels one layer at a time: explainer → open menu → view popover → panel → the selection's tools. */
function uxEscape() {
  if (xplHide()) return;
  const menus = uxMenusOpen();
  if (menus.length) { menus.forEach((m) => uxMenuClose(m, true)); return; }
  if (S.view) { S.view = false; buildUi(); return; }
  if (S.drawer) { closeDrawer(); return; }
  if (S.sel || S.selOv != null || S.dg) { S.sel = null; S.selOv = null; dgClear(); paintSel(); refreshUi(); }
}

/* ── toolbar menus escape the toolbar (0.10.0) ─────────────────────────────
 * A «More» menu opens in the top layer (popover API), anchored to its button, shifted or flipped to stay in the
 * window, so it is never clipped by the toolbar and the toolbar never scrolls. Esc, an outside click and a click on
 * one of its tools close it; an outside click never drops the selection's tools (A4). */
function uxMenusOpen() { return [...root.querySelectorAll('.more .menu[data-open="1"]')]; }
function uxMenuToggle(btn) {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  if (menu.dataset.open === '1') { uxMenuClose(menu); return; }
  uxMenusOpen().forEach((m) => uxMenuClose(m));
  menu.hidden = false;
  menu.dataset.open = '1';
  if (menu.showPopover) { menu.popover = 'manual'; try { menu.showPopover(); } catch { /* already open */ } }
  btn.setAttribute('aria-expanded', 'true');
  uxMenuPlace(menu, btn);
  menu.querySelector('button, select')?.focus({ preventScroll: true });
}
function uxMenuPlace(menu, btn) {
  const r = btn.getBoundingClientRect();
  menu.style.maxHeight = '';
  const w = menu.offsetWidth;
  let h = menu.offsetHeight;
  const vw = document.documentElement.clientWidth;
  // the default layout is right-to-left: the menu's right edge meets its button's right edge, then stays in the window
  const left = Math.min(vw - w - 8, Math.max(8, r.right - w));
  let top = r.bottom + 6;
  if (top + h > innerHeight - 8 && r.top - h - 6 >= 8) top = r.top - h - 6; // flip above when there is room
  if (top + h > innerHeight - 8) { top = Math.max(8, top); menu.style.maxHeight = `${innerHeight - top - 8}px`; h = innerHeight - top - 8; }
  Object.assign(menu.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
}
function uxMenuClose(menu, focusBack = false) {
  if (!menu || menu.dataset.open !== '1') return;
  menu.dataset.open = '';
  if (menu.matches?.(':popover-open')) menu.hidePopover();
  if (!menu.classList.contains('fm')) menu.hidden = true;
  const btn = menu.previousElementSibling;
  btn?.setAttribute('aria-expanded', 'false');
  if (focusBack) btn?.focus();
}
// an outside click closes the menus (the selection stays: only the document's own click handler decides that)
window.addEventListener('pointerdown', (e) => {
  const open = uxMenusOpen();
  if (!open.length) return;
  const path = e.composedPath();
  open.forEach((m) => { if (!path.includes(m) && !path.includes(m.previousElementSibling)) uxMenuClose(m); });
}, true);
window.addEventListener('resize', () => uxMenusOpen().forEach((m) => uxMenuPlace(m, m.previousElementSibling)));
