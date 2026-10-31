/* Business-Wrap editor — explanation panel (0.15.0), concatenated after views.js.
 * Owner note 10 (2026-10-30): ONE panel on the physical RIGHT of the screen (the shell is fixed right-to-left, so it no longer sits
 * with the slide-over drawers on the left). Rest the pointer on a tool, a ribbon tab, a field or a toggle for 400 ms (keyboard
 * focus: 400 ms too; touch: a 500 ms long press) and the panel shows its name, its shortcut, one plain explanation
 * (i18n `explain.<id>`, Arabic and English) and its own picture (xpl-art.js: XPL_ART, one drawing per id, no text in it).
 * Moving along a row of tools within 600 ms of leaving one shows the next card at once (no flicker). There is no "seen" memory:
 * the card shows every time, and it stays when the pointer leaves (the panel is a reference area, not a tooltip). The user
 * closes the panel with its X; an edge tab on the right brings it back (state: localStorage bw:xpl-panel, '0' = closed).
 * An old bw:explainers='0' closes it once (migration); nothing else reads bw:explainers any more. While a slide-over drawer is
 * open below 1280 px the panel steps aside to its edge tab by itself (CSS), without touching the saved choice; at 1280 px and
 * wider both show (the drawers are on the left, the panel on the right, and the drawers hold most of the controls to explain).
 * Declarations only (hoisted): xplWire() runs from uxAfterBuild(). */

/** Which explainer a control has: data-x (a field), data-a (a tool), data-dg (a selection picker), data-k / data-f (panel option), a ribbon tab. */
function xplKey(el) {
  if (!el) return '';
  if (el.dataset.rb === 'tab' && el.dataset.tab) return `rbtab_${el.dataset.tab}`;
  if (el.dataset.x) return el.dataset.x;
  if (el.dataset.a) return el.dataset.a;
  if (el.dataset.dg) return `dg_${el.dataset.dg}`;
  if (el.dataset.k) return `k_${el.dataset.k}`;
  if (el.dataset.f) return `k_${el.dataset.f}`;
  // the Design panel's controls (design-panel.js, value-control.js, fonts.js): one explainer per kind of control
  if (el.dataset.fpopen) return 'font.pick';
  if (el.dataset.fplocal) return 'font.local';
  if (el.dataset.fpupload) return 'font.upload';
  if (el.dataset.fprm) return 'font.remove';
  if (el.classList.contains('vc-s')) return 'vc.slider';
  if (el.classList.contains('vc-n')) return 'vc.number';
  if (el.classList.contains('vc-u')) return 'vc.unit';
  if (el.classList.contains('cc-hex')) return 'design.hex';
  if (el.type === 'color') return 'design.swatch';
  if (el.dataset.dpart) return 'design.part';
  if (el.dataset.dmove) return 'design.move';
  if (el.dataset.lab) return 'design.label';
  return '';
}
const XPL_DELAY = 400; // ms the pointer or the focus rests on a control before its card shows
const XPL_WARM = 600; // ms after leaving a control in which the next one shows at once
const XPL_HOLD = 500; // ms of a touch long-press
const XPL_PAD_MIN = 1280; // below this width the page is not pushed aside (the panel may cover its edge)
function xplDelay() { return XPL_DELAY; }
/** The control a node belongs to when it has an explanation (null otherwise). */
function xplTarget(node) {
  const el = node?.closest?.('button[data-a], select[data-a], select[data-dg], [data-x], .rb-tab[data-tab], .drawer [data-k], .drawer [data-f], .pop label.chk, .drawer :is([data-fpopen], [data-fplocal], [data-fpupload], [data-fprm], .vc-s, .vc-n, .vc-u, .cc-hex, input[type="color"], [data-dpart], [data-dmove], [data-lab])');
  if (!el || el.closest('.palette, .xpl, .xpl-dock')) return null;
  if (el.matches('.pop label.chk')) { el.dataset.x = el.dataset.x || 'both'; }
  const k = xplKey(el);
  return k && I18N.ui[S.ui][`explain.${k}`] ? el : null;
}
/** The panel's open/closed state ('0' = closed), remembered per browser; an old "explainers off" closes it once. */
function xplPanelOpen() {
  if (ls.get('bw:xpl-panel') == null && ls.get('bw:explainers') === '0') ls.set('bw:xpl-panel', '0');
  return ls.get('bw:xpl-panel') !== '0';
}
/** True while the panel is really on screen (open, and not stepped aside for a drawer). */
function xplPanelVisible() {
  const head = root.querySelector('.xpl-dock .xd-h'); // the header is hidden whenever the dock is only its edge tab
  return !!head && getComputedStyle(head).display !== 'none';
}
/** The page makes room on the right while the panel is showing (wide screens only), so it never covers the document. */
function xplPad() {
  const de = document.documentElement;
  const need = (root.querySelector('.xpl-dock')?.offsetWidth || 304) + 16;
  const on = xplPanelVisible() && de.clientWidth >= XPL_PAD_MIN;
  document.body.style.paddingRight = on ? `${need}px` : '';
  // room is made only while the page still fits beside the panel: a wide page (a wide table, a long unbroken line) would otherwise gain a horizontal
  // scroll bar from the padding alone (owner-flows L38); the panel then floats over the desk's edge instead
  if (on && de.scrollWidth > de.clientWidth + 1) document.body.style.paddingRight = '';
  // a page whose size changes later (page setup, a re-render) is re-checked: watch the sheets
  if (typeof ResizeObserver === 'function') {
    xplPad.ro ||= new ResizeObserver(() => { cancelAnimationFrame(xplPad.raf); xplPad.raf = requestAnimationFrame(xplPad); });
    for (const m of document.querySelectorAll('main.bw-doc')) xplPad.ro.observe(m);
  }
}
/** The one panel (built once, kept across rebuilds by UI_RUNTIME); its words follow the UI language. */
function xplDock() {
  const shell = root.querySelector('.shell');
  if (!shell) return null;
  let dock = shell.querySelector(':scope > .xpl-dock');
  if (!dock) {
    dock = document.createElement('aside');
    dock.className = 'xpl-dock';
    dock.innerHTML = '<header class="xd-h"><span class="i"></span><b class="xd-w"></b><button type="button" class="xd-x" aria-controls="bw-xpl-body"></button></header><div class="xd-b" id="bw-xpl-body"><div class="xph"><div class="xa" aria-hidden="true"></div><p></p></div></div><button type="button" class="xd-tab"><span class="i"></span></button>';
    shell.appendChild(dock);
    const tab = dock.querySelector('.xd-tab'); // closed (or stepped aside) the dock IS this 40 x 96 edge tab
    dock.querySelector('.xd-x').addEventListener('click', () => xplPanelSet(false));
    tab.addEventListener('click', () => { dock.dataset.force = '1'; xplPanelSet(true); });
    const card = root.querySelector('.xpl');
    if (card) dock.querySelector('.xd-b').appendChild(card);
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => xplPad()).observe(dock);
    window.addEventListener('resize', xplPad);
  }
  const tab = dock.querySelector('.xd-tab');
  const open = xplPanelOpen();
  if (!shell.querySelector('.drawer:not([hidden])')) delete dock.dataset.force; // a stepped-aside panel returns with the next drawer-free moment
  dock.dir = shell.dataset.tdir || 'rtl';
  dock.lang = S.ui;
  dock.dataset.open = open ? '1' : '0';
  dock.setAttribute('aria-label', t('xpl.panel'));
  dock.querySelector('.i').innerHTML = ic('info');
  dock.querySelector('.xd-w').textContent = t('xpl.panel');
  const x = dock.querySelector('.xd-x');
  x.innerHTML = ic('close');
  x.setAttribute('aria-label', t('xpl.close'));
  x.title = t('xpl.close');
  tab.dir = dock.dir;
  tab.lang = S.ui;
  tab.querySelector('.i').innerHTML = ic('info');
  tab.setAttribute('aria-label', t('xpl.open'));
  tab.title = t('xpl.open');
  tab.setAttribute('aria-expanded', String(open));
  const ph = dock.querySelector('.xph');
  ph.querySelector('p').textContent = t('xpl.hint');
  ph.querySelector('.xa').innerHTML = xplArtFor('');
  dock.querySelector('.xd-b').hidden = !open;
  xplPad();
  return dock;
}
function xplPanelSet(open) {
  ls.set('bw:xpl-panel', open ? '1' : '0');
  if (!open) xplClear();
  xplDock();
}
function xplWire() {
  xplDock();
  if (root.__xplWired) return;
  root.__xplWired = true;
  const st = { timer: 0, hold: 0, el: null, warmUntil: 0 };
  xplWire.st = st;
  const arm = (el, delay) => {
    clearTimeout(st.timer);
    // the card replaces the native tooltip; the name the title gave moves to aria-label so it is never lost
    if (el.title) { el.dataset.tt = el.title; el.removeAttribute('title'); if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tt); }
    const k = xplKey(el);
    st.timer = setTimeout(() => xplShow(el, k), delay);
  };
  const warm = () => (performance.now() < st.warmUntil ? 0 : xplDelay());
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = xplTarget(e.target);
    // the card already shows this tool: nothing to do (compared by key: the ribbon repaints by morphing, so one button node can become another tool)
    if (!el || root.querySelector('.xpl:not([hidden])')?.dataset.k === xplKey(el)) return;
    arm(el, warm());
  });
  root.addEventListener('pointerout', (e) => {
    const el = xplTarget(e.target);
    if (!el || el.contains(e.relatedTarget) || !el.isConnected) return; // a repainted (removed) button is not the pointer leaving
    const to = xplTarget(e.relatedTarget);
    if (to && xplKey(to) === xplKey(el)) return; // the ribbon swapped the button under a resting pointer: same tool, keep waiting
    clearTimeout(st.timer); // a card still waiting for its delay is dropped; the one on screen stays
    if (st.el === el) st.warmUntil = performance.now() + XPL_WARM;
  });
  root.addEventListener('focusin', (e) => {
    const el = xplTarget(e.target);
    if (!el || !el.matches(':focus-visible')) return;
    arm(el, warm());
  });
  root.addEventListener('focusout', (e) => {
    const el = xplTarget(e.target);
    if (el && !el.isConnected) return; // a repaint removed the focused button: not the focus leaving
    clearTimeout(st.timer);
    if (el && st.el === el) st.warmUntil = performance.now() + XPL_WARM;
  });
  // touch has no hover: a long press (500 ms) shows the card, a move or a lift cancels it
  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = xplTarget(e.target);
    clearTimeout(st.hold);
    if (el) { const k = xplKey(el); st.hold = setTimeout(() => xplShow(el, k), XPL_HOLD); }
  }, true);
  for (const ev of ['pointerup', 'pointercancel', 'pointermove']) root.addEventListener(ev, (e) => { if (e.pointerType === 'touch') clearTimeout(st.hold); }, true);
}
/** Stops a card that is still waiting for its delay. The card on screen stays (the user closes the panel). Always false: Esc is never swallowed. */
function xplHide() {
  const st = xplWire.st;
  if (st) { clearTimeout(st.timer); clearTimeout(st.hold); }
  return false;
}
/** Hides the card itself (the panel was closed, or it has nothing to explain). */
function xplClear() {
  xplHide();
  const st = xplWire.st;
  const card = root.querySelector('.xpl');
  if (card) card.hidden = true;
  if (st?.el) { st.el.removeAttribute('aria-describedby'); st.el = null; }
  root.querySelector('.xpl-dock')?.classList.remove('has-card');
}
/** The element for a control whose node a repaint replaced (the ribbon redraws its buttons): same tool, same place. */
function xplLive(el, k) {
  if (el.isConnected && root.contains(el)) return el;
  const rb = k.startsWith('rbtab_') ? `.rb-tab[data-tab="${k.slice(6)}"]` : `.ribbon [data-a="${k}"]`;
  return root.querySelector(rb) || root.querySelector(`[data-a="${k}"], [data-x="${k}"]`);
}
function xplShow(el, k) {
  const st = xplWire.st;
  const live = xplLive(el, k);
  if (!live) return;
  el = live;
  const dock = xplDock();
  if (!dock || !xplPanelOpen() || !xplPanelVisible()) return; // closed or stepped aside: the person asked for no explanations on screen
  const shell = root.querySelector('.shell');
  let card = root.querySelector('.xpl');
  if (!card) {
    card = document.createElement('div');
    card.className = 'xpl';
    card.id = 'bw-xpl';
    card.setAttribute('role', 'status');
    card.hidden = true;
  }
  const body = dock.querySelector('.xd-b');
  if (card.parentElement !== body) body.appendChild(card);
  const key = CMDS.find((c) => c.id === k)?.key;
  // the name: the visible word under the tool, else its label without the "(shortcut)" tail
  const name = (el.querySelector('.w, .sw, .rb-tl')?.textContent || el.getAttribute('aria-label') || el.dataset.tt || t(k) || '').split(':')[0].replace(/\s*\([^)]*\)\s*$/, '').trim() || t(k);
  card.dir = shell.dataset.tdir || 'rtl';
  card.lang = S.ui;
  card.innerHTML = `<div class="xa" aria-hidden="true">${xplArtFor(k)}</div><div class="xb"><div class="xt"><b>${esc(name)}</b>${key ? `<kbd>${esc(key)}</kbd>` : ''}</div><p>${esc(t(`explain.${k}`))}</p><button type="button" class="xm" hidden>${esc(t('xpl.more'))}</button></div>`;
  card.hidden = false;
  card.dataset.side = 'panel';
  card.dataset.k = k;
  dock.classList.add('has-card');
  card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
  // a long explanation shows five lines and a "More" button inside the panel (no scrolling inside the card)
  const p = card.querySelector('.xb p'), more = card.querySelector('.xm');
  if (p.scrollHeight > p.clientHeight + 2) {
    more.hidden = false;
    more.addEventListener('click', () => { const o = p.classList.toggle('open'); more.textContent = t(o ? 'xpl.less' : 'xpl.more'); });
  }
  if (st.el && st.el !== el) st.el.removeAttribute('aria-describedby');
  el.setAttribute('aria-describedby', 'bw-xpl');
  st.el = el;
}
