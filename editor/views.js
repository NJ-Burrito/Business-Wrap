/* Business-Wrap editor — page view modes (0.10.0), concatenated after shell-ux.js.
 * continuous: the long sheet (as before) · single: one page at a time · spread: two pages side by side like an open book,
 * the cover alone first, then pairs, in the document's reading direction (RTL: first page of a pair on the right).
 * Screen only: the pages are CSS columns of one page each (the document's paper, A18) (editor/views.css, inside @media screen), so editing,
 * selection and every tool keep working; print, the PDF and the DOCX never see any of it.
 * Declarations only (hoisted) above the listeners at the end. */
function viewModes() { return ['continuous', 'single', 'spread']; }
function viewsMode() {
  if (!S.pages) { const v = ls.get('bw:pages'); S.pages = viewModes().includes(v) ? v : 'continuous'; }
  return S.pages;
}
function viewsActive() { return !S.side && viewsMode() !== 'continuous'; }

/** The View popover's segmented control (remembered per browser). */
function viewsSeg() {
  const m = viewsMode();
  const icon = { continuous: 'view.continuous', single: 'view.single', spread: 'view.spread' };
  const opt = (mode) => `<button type="button" data-a="view.${mode}" aria-pressed="${m === mode}" aria-label="${esc(t('view.mode'))}: ${esc(t('view.' + mode))}" title="${esc(t('view.' + mode + 'Tip'))}"><span class="i">${ic(icon[mode])}</span><span class="sw">${esc(t('view.' + mode))}</span></button>`;
  return `<div class="seg pages" role="group" data-x="view.mode" aria-label="${esc(t('view.mode'))}"><i class="thumb" aria-hidden="true"></i><span class="cap" aria-hidden="true"><span class="i">${ic('pages')}</span><span class="cw">${esc(t('view.mode'))}</span></span>${viewModes().map(opt).join('')}</div>`;
}
function viewsSet(mode) {
  if (!viewModes().includes(mode)) return;
  const first = viewsFirstPage();
  S.pages = mode;
  ls.set('bw:pages', mode);
  S.pageAt = first;
  S.view = false; // a page mode is a choice: the View menu closes and shows the pages
  buildUi();
  render();
  if (mode === 'continuous') viewsReveal(first);
}
/** The page the reader is on (for keeping the place across a mode change). */
function viewsFirstPage() {
  if (viewsActive()) return S.pageAt || 0;
  return 0;
}

/* geometry: one slot = one page + the gap (12 mm, as in views.css), in CSS px before the view's zoom */
function viewsGeo() {
  const mm = 96 / 25.4;
  const p = pageSpec(cur()?.doc?.layout?.page); // A18: the document's own paper (A4 portrait unless set)
  return { W: p.w * mm, H: p.h * mm, GAP: 12 * mm, SLOT: (p.w + 12) * mm };
}

/** After every render(): wrap the edition in the paged window, count its pages, fit it, show the current page. */
function viewsApply() {
  const pair = document.getElementById('bw-pair');
  if (!pair) return;
  const mode = viewsActive() ? viewsMode() : 'continuous';
  pair.dataset.pages = mode;
  const main = mainOf(S.ed);
  if (mode === 'continuous' || !main) { S.pageN = 0; viewsPager(); return; }
  let box = main.parentElement;
  if (!box.classList.contains('bw-view')) {
    box = document.createElement('div');
    box.className = 'bw-view';
    main.before(box);
    box.appendChild(main);
  }
  box.dir = main.dir; // the book opens in the document's reading direction
  { const p = pageSpec(cur()?.doc?.layout?.page); box.style.setProperty('--pw', `${p.w}mm`); box.style.setProperty('--ph', `${p.h}mm`); } // A18: the sheets as set
  viewsFit();
  S.pageN = viewsCount(main);
  main.style.setProperty('--pages', String(S.pageN));
  viewsRuns(main);
  viewsGo(0, true);
}
/** A5/A6 on screen: every page frame after the cover carries its own header and footer, editable in place (the
 *  bands of <template class="bw-run"> from engine/render.mjs, per page segment; without doc.chrome, today's band from
 *  chromeDefaults). Page numbers are filled per frame. The layer is screen-only and never part of the print markup. */
function viewsRuns(main) {
  main.querySelector(':scope > .bw-runs')?.remove();
  const n = S.pageN || 0;
  const d = cur().doc;
  if (!n || !d) return;
  const show = d.chrome ? d : { ...d, chrome: chromeDefaults(S.ed) };
  const o = { locale: S.ed, theme: S.theme, labels: I18N.doc[S.ed], L: labelsOf(S.ed), logos: S.theme.logos };
  const segs = pageModel(show).segments;
  const band = (seg, part) => main.querySelector(`template.bw-run[data-seg="${seg}"][data-part="${part === 'header' ? 'head' : 'foot'}"]`)?.innerHTML ?? runBand(show, o, part, segs.find((x) => x.n === seg) || segs[0]);
  // the page each segment starts on (its marker's column)
  const starts = [...main.querySelectorAll('a.bw-seg[data-seg]')].map((a) => [viewsPageOf(a), +a.dataset.seg]).sort((x, y) => x[0] - y[0]);
  const segOf = (k) => starts.reduce((s, [p, n2]) => (p <= k ? n2 : s), segs[0]?.n ?? 0);
  const first = main.querySelector('.cover') ? 1 : 0;
  const lay = document.createElement('div');
  lay.className = 'bw-runs';
  lay.setAttribute('contenteditable', 'false');
  let html = '';
  for (let k = first; k < n; k += 1) {
    const seg = segOf(k);
    html += `<div class="bw-run-f" data-page="${k}" data-seg="${seg}" style="--k:${k}"><div class="bw-run-h">${band(seg, 'header')}</div><div class="bw-run-b">${band(seg, 'footer')}</div></div>`;
  }
  lay.innerHTML = html;
  lay.querySelectorAll('.bw-run-f').forEach((f) => {
    const k = +f.dataset.page;
    f.querySelectorAll('[data-bw-page]').forEach((x) => { x.textContent = /\//.test(x.textContent) ? `${k + 1} / ${n}` : String(k + 1); });
  });
  // the bands edit through 20-chrome's handler (they are not the document's markup): data-p → data-w2p
  lay.querySelectorAll('[data-p]').forEach((x) => { if (d.chrome) { x.dataset.w2p = x.dataset.p; x.tabIndex = 0; x.contentEditable = 'plaintext-only'; } x.removeAttribute('data-p'); });
  main.appendChild(lay);
}
/** Pages = columns: the content's far edge in the reading direction, in slots. */
function viewsCount(main) {
  const z = parseFloat(getComputedStyle(main.parentElement).zoom) || 1;
  const r = main.getBoundingClientRect();
  let far = 0;
  for (const el of main.children) {
    if (el.classList.contains('bw-runs')) continue; // the header/footer layer is placed on the pages, it is not content
    for (const q of el.getClientRects()) far = Math.max(far, main.dir === 'rtl' ? r.right - q.left : q.right - r.left);
  }
  return Math.max(1, Math.round(far / z / viewsGeo().SLOT + 0.25));
}
/** Fit one page (single) or the open book (spread) to the window, times the person's zoom. */
function viewsFit() {
  const spread = viewsMode() === 'spread';
  const { W: PAGE_W, H: PAGE_H, GAP: PAGE_GAP } = viewsGeo();
  const w = spread ? 2 * PAGE_W + PAGE_GAP : PAGE_W;
  const availH = Math.max(240, innerHeight - (S.focus ? 24 : barH || 90) - 84);
  const availW = Math.max(240, document.documentElement.clientWidth - 32);
  const fit = Math.min(availH / PAGE_H, availW / w, 1.4);
  document.documentElement.style.setProperty('--bw-pz', String(+(fit * S.zoom).toFixed(4)));
}
/** Move by `delta` pages (single) or spreads (spread); `instant` skips the slide. */
function viewsGo(delta, instant = false) {
  const main = mainOf(S.ed);
  if (!viewsActive() || !main) return;
  const n = S.pageN || 1;
  const { SLOT } = viewsGeo();
  const spread = viewsMode() === 'spread';
  let at = S.pageAt || 0;
  if (spread) {
    // spreads: [cover] [1 2] [3 4] … ; spread k starts at page 2k-1
    const last = Math.floor(n / 2);
    const k = Math.min(last, Math.max(0, Math.floor((at + 1) / 2) + delta));
    at = Math.max(0, 2 * k - 1);
    main.style.setProperty('--shift', `${(k * 2) * SLOT * (main.dir === 'rtl' ? 1 : -1)}px`);
  } else {
    at = Math.min(n - 1, Math.max(0, at + delta));
    main.style.setProperty('--shift', `${at * SLOT * (main.dir === 'rtl' ? 1 : -1)}px`);
  }
  if (instant) { main.style.transition = 'none'; void main.offsetWidth; main.style.transition = ''; }
  S.pageAt = at;
  viewsPager();
}
/** The page under a document element (for keyboard focus and Find in a paged view). */
function viewsPageOf(el) {
  const main = mainOf(S.ed);
  if (!main || !el || !main.contains(el)) return -1;
  const z = parseFloat(getComputedStyle(main.parentElement).zoom) || 1;
  const r = main.getBoundingClientRect();
  const q = el.getBoundingClientRect();
  const off = main.dir === 'rtl' ? r.right - q.right : q.left - r.left;
  return Math.max(0, Math.floor((off + 2) / z / viewsGeo().SLOT));
}
function viewsReveal(page) {
  if (viewsActive()) { S.pageAt = page; viewsGo(0); return; }
  if (!page) return;
}
/** Back to the plain sheet for print: the print pass measures block heights on screen before printing. */
function viewsUnpage() {
  const pair = document.getElementById('bw-pair');
  if (!pair || pair.dataset.pages === 'continuous') return;
  pair.dataset.pages = 'continuous';
  pair.querySelectorAll('.bw-view').forEach((v) => { const m = v.firstElementChild; if (m) { m.style.removeProperty('--shift'); v.before(m); } v.remove(); });
}
/** The page pill under the book: previous · «pages / total» · next, in the document's reading direction. */
function viewsPager() {
  let p = root.querySelector('.pager');
  if (!viewsActive() || !S.pageN || S.focus) { if (p) p.hidden = true; return; }
  if (!p) {
    p = document.createElement('div');
    p.className = 'pager';
    p.setAttribute('role', 'group');
    root.querySelector('.shell')?.appendChild(p);
  }
  const main = mainOf(S.ed);
  p.dir = main?.dir || 'rtl';
  p.setAttribute('aria-label', t('view.pager'));
  const n = S.pageN;
  const at = S.pageAt || 0;
  const spread = viewsMode() === 'spread';
  const shown = spread && at > 0 && at + 1 < n ? `${at + 1}–${at + 2}` : String(at + 1);
  const atEnd = spread ? Math.floor((at + 1) / 2) >= Math.floor(n / 2) : at >= n - 1;
  const prevIc = p.dir === 'rtl' ? 'view.right' : 'view.left';
  const nextIc = p.dir === 'rtl' ? 'view.left' : 'view.right';
  p.hidden = false;
  p.innerHTML = `<button type="button" class="b" data-a="view.prev" aria-label="${esc(t('view.prev'))}" ${at <= 0 ? 'disabled' : ''}><span class="i">${ic(prevIc)}</span><span class="w">${esc(t('view.prev'))}</span></button><span class="pn" role="status" aria-live="polite">${esc(t('view.pageOf', { a: shown, n }))}</span><button type="button" class="b" data-a="view.next" aria-label="${esc(t('view.next'))}" ${atEnd ? 'disabled' : ''}><span class="i">${ic(nextIc)}</span><span class="w">${esc(t('view.next'))}</span></button>`;
}

/* listeners (run after boot) */
document.addEventListener('focusin', (e) => {
  if (!viewsActive()) return;
  const pg = viewsPageOf(e.target.closest?.('#bw-pair [data-p], #bw-pair .bw-ov'));
  if (pg < 0) return;
  const at = S.pageAt || 0;
  const vis = viewsMode() === 'spread' ? (at === 0 ? [0] : [at, at + 1]) : [at];
  if (!vis.includes(pg)) { S.pageAt = pg; viewsGo(0); }
});
document.addEventListener('keydown', (e) => {
  if (!viewsActive() || e.ctrlKey || e.metaKey || e.altKey) return;
  const t0 = e.target;
  if (t0.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t0.tagName || '') || e.composedPath?.().some((x) => x === host)) return;
  if (/^Arrow/.test(e.key) && (S.selOv != null || S.dg || t0.closest?.('.bw-ov'))) return; // the arrows nudge the selected logo or shape
  const rtl = mainOf(S.ed)?.dir === 'rtl';
  const step = { PageDown: 1, PageUp: -1, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, Home: -999, End: 999 }[e.key];
  if (step) { e.preventDefault(); viewsGo(step); }
});
let viewsWheelAt = 0;
let viewsWheelSum = 0;
document.addEventListener('wheel', (e) => {
  if (!viewsActive() || e.ctrlKey || !e.target.closest?.('#bw-pair')) return;
  if (document.documentElement.scrollHeight > innerHeight + 4) return; // zoomed past the window: let it scroll
  e.preventDefault();
  const now = performance.now();
  if (now - viewsWheelAt < 420) return;
  viewsWheelSum += e.deltaY || e.deltaX;
  if (Math.abs(viewsWheelSum) < 40) return;
  viewsGo(viewsWheelSum > 0 ? 1 : -1);
  viewsWheelSum = 0;
  viewsWheelAt = now;
}, { passive: false });
window.addEventListener('resize', () => { if (viewsActive()) { viewsFit(); viewsGo(0, true); } });

/* ── the View menu (0.11.0): grouped, labelled, switches for toggles, segments for modes, in the top layer ───────── */
/** One switch: icon + label + an on/off track; the state is aria-checked (never a gold-filled pill). */
function viewSwitch(id, on, label = t(id), icon = id) {
  return `<button type="button" class="b swt" role="switch" data-a="${id}" aria-checked="${!!on}"><span class="i">${ic(icon)}</span><span class="w">${esc(label)}</span><span class="tg" aria-hidden="true"><i></i></span></button>`;
}
function viewPop() {
  const grp = (k, body) => `<div class="vg" role="group" aria-labelledby="vg-${k}"><span class="vgh" id="vg-${k}">${esc(t('viewg.' + k))}</span><div class="vr">${body}</div></div>`;
  const zb = (id, label) => `<button type="button" class="b" data-a="${id}" title="${esc(t(id))}" aria-label="${esc(t(id))}"><span class="i">${ic(id)}</span><span class="w">${esc(label)}</span></button>`;
  const multi = Object.keys(M[S.svc]).length > 1;
  return `<div class="pop vpop" id="viewpop" role="dialog" aria-label="${esc(t('view'))}" dir="${LAYOUT_DIR}" lang="${S.ui}" ${S.view ? '' : 'hidden'}>
    ${grp('pages', viewsSeg())}
    ${grp('zoom', `${zb('zoomOut', t('zoomOut'))}${zb('zoomReset', `${Math.round(S.zoom * 100)}%`)}${zb('zoomIn', t('zoomIn'))}${zb('zoomFit', t('zoomFit'))}`)}
    ${grp('compare', `${multi ? viewSwitch('side', S.side, t('sideBySide')) : ''}${viewSwitch('both', S.both, t('bothEditions'))}`)}
    ${grp('look', `${viewSwitch('dark', S.dark)}${viewSwitch('calm', S.calm)}`)}
    ${grp('aids', `${viewSwitch('reading', S.reading, t('reading'), 'view.single')}${viewSwitch('focus', S.focus)}${viewSwitch('spell', S.spell[S.ed])}${viewSwitch('snap', S.snap)}`)}
  </div>`;
}
/** After buildUi(): an open View menu goes to the top layer, under its button, and the control just used keeps the focus. */
function viewPopAfterBuild() {
  const pop = root.querySelector('#viewpop');
  const btn0 = root.querySelector('.island [data-a="view"]');
  if (!pop || !S.view || !btn0) return;
  if (pop.showPopover) { pop.popover = 'manual'; try { pop.showPopover(); } catch { /* open */ } }
  uxMenuPlace(pop, btn0);
  const f = S.viewFocus && pop.querySelector(`[data-a="${S.viewFocus}"]`);
  (f || pop.querySelector('button'))?.focus({ preventScroll: true });
}
/** The zoom read-out follows every zoom step without a rebuild. */
function viewPct() {
  const w = root.querySelector('#viewpop [data-a="zoomReset"] .w');
  if (w) w.textContent = `${Math.round(S.zoom * 100)}%`;
}
function viewPopClose() {
  if (!S.view) return;
  S.view = false;
  const pop = root.querySelector('#viewpop');
  if (pop?.matches?.(':popover-open')) pop.hidePopover();
  if (pop) pop.hidden = true;
  root.querySelector('.island [data-a="view"]')?.setAttribute('aria-expanded', 'false');
}
root.addEventListener('click', (e) => { const b = e.target.closest?.('#viewpop [data-a]'); if (b) S.viewFocus = b.dataset.a; }, true);
window.addEventListener('pointerdown', (e) => {
  if (!S.view) return;
  const p = e.composedPath();
  if (!p.some((x) => x.id === 'viewpop' || x.dataset?.a === 'view')) viewPopClose();
}, true);
window.addEventListener('resize', () => { const pop = root.querySelector('#viewpop'); if (S.view && pop) uxMenuPlace(pop, root.querySelector('.island [data-a="view"]')); });
