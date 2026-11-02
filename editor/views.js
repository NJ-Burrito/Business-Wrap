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

/* geometry: one slot = one column of the document's own page + the gap (12 mm, as in views.css), in CSS px before the view's zoom.
 * 0.16.0: a document may mix sheet sizes (a landscape section, a figure chapter that prints on its own turned sheet). The columns stay
 * the document's own page, so every free logo, image and text box sits exactly where it does in a plain document. A run of pages of
 * another size is one box of its own (.bw-frun) with its own columns, as wide and as high as that sheet: its pages are real pages of that
 * size (long text goes on to the next landscape page), and the slots it covers are held empty (.bw-slot). viewsTable lists every page
 * with its place and size; the window shows exactly that sheet (or the two sheets of a book). */
const VIEWS_MM = 96 / 25.4;
/** The turned sheet every figure chapter prints on (engine/render.mjs @page wide): the widest figure sheet, else A4 landscape. */
function viewsWide(d) {
  let s = null;
  for (const c of d?.chapters || []) for (const sec of c.sections || []) for (const b of sec.blocks || []) if (b.kind === 'figure' && b.sheet && (!s || b.sheet.widthMm > s.widthMm)) s = b.sheet;
  return { w: s?.widthMm ?? 297, h: s?.heightMm ?? 210 };
}
function viewsGeo() {
  const mm = VIEWS_MM;
  const d = cur()?.doc;
  const base = pageSpec(d?.layout?.page); // A18: the document's own paper (A4 portrait unless set)
  return { W: base.w * mm, H: base.h * mm, GAP: 12 * mm, SLOT: (base.w + 12) * mm, Wmm: base.w, Hmm: base.h, base: { w: base.w, h: base.h }, wide: viewsWide(d), mixed: !!mainOf(S.ed)?.querySelector('.bw-frun') };
}
/** The id of the page segment an element prints on: its own `page:bw-seg-N` style, a figure chapter's turned sheet ('w'), else the
 *  nearest container's, else the document's own page ('0'). */
function viewsSegOf(el) {
  for (let x = el; x && x.nodeType === 1; x = x.parentElement) {
    const m = /^page:bw-seg-(\d+)/.exec(x.getAttribute('style') || '');
    if (m) return m[1];
    if (x.matches?.('.chapter.wide')) return 'w';
    if (x.matches?.('main.bw-doc')) break;
  }
  return '0';
}
/** Put every run of containers that print on another sheet size into a box of its own. */
function viewsForeign(main, g) {
  const segs = new Map(pageModel(cur().doc).segments.map((x) => [String(x.n), x.page]));
  const sizeOf = (id) => (id === 'w' ? { w: g.wide.w, h: g.wide.h } : segs.get(id) || g.base);
  const keyOf = (id) => { const z = sizeOf(id); return z.w === g.base.w && z.h === g.base.h ? '' : `${z.w}x${z.h}`; };
  const CAND = '.chapter, .sec, .bw-pg';
  const made = [];
  const group = (parent) => {
    const items = [];
    for (const c of [...parent.children]) {
      if (c.classList.contains('bw-runs') || c.classList.contains('bw-sheets') || c.classList.contains('bw-slot')) { items.push({ el: c, key: '', skip: true }); continue; }
      if (!c.matches(CAND)) { items.push({ el: c, key: keyOf(viewsSegOf(c)) }); continue; }
      const key = keyOf(viewsSegOf(c));
      if (![...c.querySelectorAll(CAND)].some((x) => keyOf(viewsSegOf(x)) !== key)) { items.push({ el: c, key }); continue; }
      group(c); // a container that holds pages of two sizes stays in the flow; its parts are grouped one level down
      items.push({ el: c, key: '', skip: true });
    }
    for (let i = 0; i < items.length;) {
      const it = items[i];
      if (it.skip || !it.key) { i += 1; continue; }
      let j = i;
      while (j + 1 < items.length && !items[j + 1].skip && items[j + 1].key === it.key) j += 1;
      const [w, h] = it.key.split('x').map(Number);
      const box = document.createElement('div');
      box.className = 'bw-frun';
      box.dataset.w = w;
      box.dataset.h = h;
      if (items.slice(i, j + 1).some((x) => viewsSegOf(x.el) === 'w')) box.dataset.wide = '1'; // a figure chapter prints on `@page wide`: margins 14 mm above and 12 mm below, not 18 and 16
      box.style.setProperty('--rw', `${w}mm`);
      box.style.setProperty('--rh', `${h}mm`);
      it.el.before(box);
      for (let k = i; k <= j; k += 1) box.appendChild(items[k].el);
      made.push(box);
      i = j + 1;
    }
  };
  for (const wrap of main.querySelectorAll(':scope > .wrap')) group(wrap);
  S.viewsTall = made.filter((b) => +b.dataset.h > g.base.h).map((b) => `${b.dataset.w}×${b.dataset.h}`);
  return made;
}
/** After layout: how many pages each box of another size holds, and how many slots of the document's own columns it covers. */
function viewsReserve(main, g) {
  const z = parseFloat(getComputedStyle(main.parentElement).zoom) || 1;
  const rtl = main.dir === 'rtl';
  const side = parseFloat(getComputedStyle(main).getPropertyValue('--page-side')) || 16;
  for (const box of main.querySelectorAll('.bw-frun')) {
    const ww = +box.dataset.w;
    const cw = ww - 2 * side;
    const pitch = ww + 12;
    const br = box.getBoundingClientRect();
    let far = 0;
    for (const e of box.querySelectorAll('*')) for (const q of e.getClientRects()) far = Math.max(far, rtl ? br.right - q.left : q.right - br.left);
    const m = Math.max(1, Math.ceil((far / z / VIEWS_MM - cw - 0.5) / pitch) + 1);
    const slots = Math.max(1, Math.ceil(((m - 1) * pitch + ww + 12) / (g.Wmm + 12) - 1e-6));
    box.dataset.m = m;
    box.dataset.slots = slots;
    let at = box;
    for (let i = 1; i < slots; i += 1) { const sp = document.createElement('i'); sp.className = 'bw-slot'; sp.setAttribute('aria-hidden', 'true'); at.after(sp); at = sp; }
  }
}
/** Every page, in reading order: its place (mm from the start edge of the book), its sheet size. */
function viewsTable(main, g, nOut) {
  const z = parseFloat(getComputedStyle(main.parentElement).zoom) || 1;
  const r = main.getBoundingClientRect();
  const slotOf = (q) => Math.max(0, Math.floor(((main.dir === 'rtl' ? r.right - q.right : q.left - r.left) + 2) / z / g.SLOT));
  const boxes = new Map([...main.querySelectorAll('.bw-frun')].map((b) => [slotOf(b.getBoundingClientRect()), b]));
  const tab = [];
  for (let s = 0; s < nOut;) {
    const b = boxes.get(s);
    if (b) {
      const w = +b.dataset.w;
      for (let j = 0; j < +b.dataset.m; j += 1) tab.push({ x: s * (g.Wmm + 12) + j * (w + 12), w, h: +b.dataset.h });
      s += +b.dataset.slots;
    } else { tab.push({ x: s * (g.Wmm + 12), w: g.Wmm, h: g.Hmm }); s += 1; }
  }
  return tab.length ? tab : [{ x: 0, w: g.Wmm, h: g.Hmm }];
}
/** One sheet of paper per page, at its own size (a document with pages of another size only: otherwise the stripes of views.css). */
function viewsSheets(main, g) {
  main.querySelector(':scope > .bw-sheets')?.remove();
  if (!g.mixed) return;
  const lay = document.createElement('div');
  lay.className = 'bw-sheets';
  lay.setAttribute('contenteditable', 'false');
  lay.setAttribute('aria-hidden', 'true');
  lay.innerHTML = (S.pageTab || []).map((s, k) => `<i class="bw-sheet" data-page="${k}" style="inset-inline-start:${+s.x.toFixed(3)}mm;width:${s.w}mm;height:${s.h}mm"></i>`).join('');
  main.appendChild(lay);
}
/** 0.16.0 · The page count equals the PDF's. The cause of the old gap (10 pages here, 9 in the PDF, a chapter that fits pushed to the next
 *  column): the PDF is not printed from the plain markup. Before printing, engine/render.mjs `relaxTallGroups` turns each keep-together
 *  group into an atomic block (`.whole`), frees the ones taller than a page and splits a long held table into its first rows, a free
 *  middle and its last rows. The paged view laid the plain markup out, where a chain of `break-after: avoid` headings and lists pulled a
 *  whole chapter to the next column. So the same pass runs here, on a copy of the sheet laid out the way the print pass sees it (a hidden
 *  frame of the print measure), and its verdicts are written back as classes and attributes only (the editable markup is never cloned or
 *  split). The markers (`data-rlx`, `data-rlr`) are screen-only and cleared on the next pass. */
function viewsRelax(main) {
  // the last pass's verdicts go back to what the markup came with (class and style as rendered), then the pass is made again
  main.querySelectorAll('[data-rlx]').forEach((e) => {
    if (e.dataset.rlc === undefined) return;
    if (e.dataset.rlc) e.setAttribute('class', e.dataset.rlc); else e.removeAttribute('class');
    if (e.dataset.rls) e.setAttribute('style', e.dataset.rls); else e.removeAttribute('style');
    delete e.dataset.rlc; delete e.dataset.rls; e.removeAttribute('data-rlx');
  });
  main.querySelectorAll('[data-rlr]').forEach((e) => e.removeAttribute('data-rlr'));
  const pair = document.getElementById('bw-pair');
  const doc = cur().doc;
  const live = [...main.querySelectorAll('.keep,.card,.hold,.fig')].filter((e) => !e.closest('.bw-runs'));
  if (!pair || !doc || !live.length) return;
  live.forEach((e, i) => { e.dataset.rlx = String(i); e.dataset.rlc = e.getAttribute('class') || ''; e.dataset.rls = e.getAttribute('style') || ''; });
  const geo = doc.layout?.page ? pageGeom(doc) : PAGE;
  const probe = document.createElement('div');
  probe.className = 'bw-probe';
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = `position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none;width:${geo.measurePx}px;zoom:1`;
  const copy = main.cloneNode(true);
  copy.querySelectorAll('.bw-runs,.bw-sheets,.bw-slot').forEach((x) => x.remove());
  copy.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
  copy.removeAttribute('id');
  copy.style.cssText = 'zoom:1;width:100%;margin:0;transform:none;box-shadow:none;height:auto';
  probe.appendChild(copy);
  pair.appendChild(probe);
  try {
    relaxTallGroups([...(doc.layout?.page ? relaxArgs(doc) : relaxArgs()), copy]);
    const by = new Map();
    copy.querySelectorAll('[data-rlx]').forEach((e) => { const l = by.get(e.dataset.rlx); if (l) l.push(e); else by.set(e.dataset.rlx, [e]); });
    live.forEach((el, i) => {
      const g = by.get(String(i));
      if (!g) return;
      if (g.length > 1) { // a long held table or list: its first rows and its last rows stay together, the middle flows
        const rows = [...el.children];
        rows.slice(0, Math.max(0, g[0].children.length - 1)).forEach((r) => { r.dataset.rlr = 'a'; });
        rows.slice(Math.max(0, rows.length - g[g.length - 1].children.length + 1)).forEach((r) => { r.dataset.rlr = 'b'; });
        el.style.breakInside = 'auto';
        el.classList.remove('whole');
      } else {
        if (g[0].style.breakInside === 'auto') el.style.breakInside = 'auto';
        el.classList.toggle('whole', g[0].classList.contains('whole'));
      }
    });
  } finally { probe.remove(); }
}
/** A box taller than the document's own page cannot be shown whole in its columns: say so. */
function viewsOverflow() {
  if (!S.viewsTall?.length) return;
  const key = S.viewsTall.join();
  if (S.viewsWarned === key) return;
  S.viewsWarned = key;
  toast(S.ui === 'ar' ? `صفحات أطول من صفحة المستند (${key} مم) تظهر مقصوصة في هذا العرض؛ ملف PDF يطبعها كاملة.` : `Pages taller than the document's own page (${key} mm) are cut in this view; the PDF prints them whole.`, 'warn');
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
  { const p = viewsGeo(); box.style.setProperty('--pw', `${p.Wmm}mm`); box.style.setProperty('--ph', `${p.Hmm}mm`); } // A18: the sheets as set
  viewsUnwrap(main);
  viewsRelax(main);
  viewsFit();
  const g0 = viewsGeo();
  const made = viewsForeign(main, g0);
  if (made.length) main.dataset.bwmix = '1'; else delete main.dataset.bwmix;
  if (made.length) viewsReserve(main, g0);
  const nOut = viewsCount(main);
  S.pageTab = viewsTable(main, viewsGeo(), nOut);
  S.pageSizes = S.pageTab;
  S.pageN = S.pageTab.length;
  main.style.setProperty('--pages', String(nOut));
  const g = viewsGeo();
  viewsSheets(main, g);
  viewsRuns(main);
  viewsOverflow();
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
    const sz = S.pageTab?.[k];
    const own = viewsGeo().mixed && sz ? `;--fx:${+sz.x.toFixed(3)}mm;--fw:${sz.w}mm;--fh:${sz.h}mm` : '';
    html += `<div class="bw-run-f" data-page="${k}" data-seg="${seg}" style="--k:${k}${own}"><div class="bw-run-h">${band(seg, 'header')}</div><div class="bw-run-b">${band(seg, 'footer')}</div></div>`;
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
    if (el.classList.contains('bw-runs') || el.classList.contains('bw-sheets')) continue; // the header/footer layer is placed on the pages, it is not content
    for (const q of el.getClientRects()) far = Math.max(far, main.dir === 'rtl' ? r.right - q.left : q.right - r.left);
  }
  return Math.max(1, Math.round(far / z / viewsGeo().SLOT + 0.25));
}
/** The window of page `at` (or the book whose left page is `at`): its size in mm and where it starts, in mm from the start edge of the
 *  columns (the book's own empty first page counts, as in a plain document). One page: exactly its sheet; a book: the two sheets from
 *  outer edge to outer edge. */
function viewsWindow(g, at, spread) {
  const t = S.pageTab;
  const a = t?.[at];
  if (!a) return { w: spread ? 2 * g.Wmm + 12 : g.Wmm, h: g.Hmm, start: 0 };
  if (!spread) return { w: a.w, h: a.h, start: a.x };
  if (at === 0) return { w: 2 * g.Wmm + 12, h: a.h, start: 0 }; // the cover alone: an empty page beside it
  const b = t[at + 1];
  return { w: b ? b.x + b.w - a.x : a.w + 12 + g.Wmm, h: Math.max(a.h, b?.h || 0), start: a.x + g.Wmm + 12 };
}
/** Fit one page (single) or the open book (spread) to the window, times the person's zoom. */
function viewsFit() {
  const spread = viewsMode() === 'spread';
  const g = viewsGeo();
  const win = viewsWindow(g, S.pageAt || 0, spread);
  const availH = Math.max(240, innerHeight - (S.focus ? 24 : barH || 90) - 84);
  const availW = Math.max(240, document.documentElement.clientWidth - 32);
  const fit = Math.min(availH / (win.h * VIEWS_MM), availW / (win.w * VIEWS_MM), 1.4);
  document.documentElement.style.setProperty('--bw-pz', String(+(fit * S.zoom).toFixed(4)));
}
/** Move by `delta` pages (single) or spreads (spread); `instant` skips the slide. */
function viewsGo(delta, instant = false) {
  const main = mainOf(S.ed);
  if (!viewsActive() || !main) return;
  const n = S.pageN || 1;
  const spread = viewsMode() === 'spread';
  let at = S.pageAt || 0;
  const g = viewsGeo();
  if (spread) {
    // spreads: [cover] [1 2] [3 4] … ; spread k starts at page 2k-1
    const last = Math.floor(n / 2);
    const k = Math.min(last, Math.max(0, Math.floor((at + 1) / 2) + delta));
    at = Math.max(0, 2 * k - 1);
  } else at = Math.min(n - 1, Math.max(0, at + delta));
  const win = viewsWindow(g, at, spread);
  const box = main.parentElement;
  box.style.setProperty('--vw', `${win.w}mm`);
  box.style.setProperty('--vh', `${win.h}mm`);
  main.style.setProperty('--shift', `${win.start * VIEWS_MM * (main.dir === 'rtl' ? 1 : -1)}px`);
  if (instant) { main.style.transition = 'none'; void main.offsetWidth; main.style.transition = ''; }
  S.pageAt = at;
  if (g.mixed) viewsFit();
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
  const mm = (off + 2) / z / VIEWS_MM;
  const t = S.pageTab;
  if (!t?.length || !viewsGeo().mixed) return Math.max(0, Math.floor((off + 2) / z / viewsGeo().SLOT));
  let k = 0;
  for (let i = 0; i < t.length; i += 1) if (t[i].x <= mm) k = i;
  return k;
}
function viewsReveal(page) {
  if (viewsActive()) { S.pageAt = page; viewsGo(0); return; }
  if (!page) return;
}
/** Take the boxes of another size, their empty slots and the sheets away again: the markup is the document's own. */
function viewsUnwrap(root0) {
  root0.querySelectorAll('.bw-slot, .bw-sheets').forEach((x) => x.remove());
  root0.querySelectorAll('.bw-frun').forEach((b) => b.replaceWith(...b.childNodes));
  root0.querySelectorAll('main.bw-doc[data-bwmix]').forEach((m) => { delete m.dataset.bwmix; });
}
/** Back to the plain sheet for print: the print pass measures block heights on screen before printing. */
function viewsUnpage() {
  const pair = document.getElementById('bw-pair');
  if (!pair || pair.dataset.pages === 'continuous') return;
  pair.dataset.pages = 'continuous';
  viewsUnwrap(pair);
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
  if (document.documentElement.scrollHeight > innerHeight + 12) return; // zoomed past the window: let it scroll (the fit leaves the page 8 px over the window: views.css pads 92, the fit reserves 84; that never counted as zoomed)
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
    ${grp('zoom', `${zb('zoomOut', t('zoomOut'))}${zb('zoomReset', `${zoomPctNow()}%`)}${zb('zoomIn', t('zoomIn'))}${zb('zoomFit', t('zoomFit'))}${zb('zoomHeight', t('zoomHeight'))}`)}
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
  if (w) w.textContent = `${zoomPctNow()}%`;
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
