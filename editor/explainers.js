/* Business-Wrap editor — explanation panel (0.15.0; hover intent + overlay in 0.15.2), concatenated after views.js.
 * ONE panel on the physical RIGHT of the screen. It is an OVERLAY (.bw-sidepanel, ux.css): it never pads the body, never pushes the
 * pages and changes no zoom, open or closed. Its card shows only after INTENT: the pointer RESTS on one tool (speed under XPL_SPEED
 * and within XPL_DRIFT px of where it settled) for XPL_INTENT ms; keyboard focus waits the same time. Once a card is on screen,
 * resting on another tool swaps the content in place after XPL_SWAP ms (no close/open, no flash). Sweeping across tools, a tool that
 * is disabled or hidden, or a pointer that already left, never opens anything. The card stays when the pointer leaves the ribbon
 * (the panel is a reference area); the user closes the panel with its X, an edge tab brings it back (localStorage bw:xpl-panel,
 * '0' = closed). No "seen" memory. An old bw:explainers='0' closes it once. Below 1280 px an open drawer sends the panel to its edge tab.
 * Touch: a 500 ms long press. Declarations only (hoisted): xplWire() runs from uxAfterBuild(). */

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
const XPL_INTENT = 500; // ms the pointer must REST on one tool before the card opens (a deliberate dwell: long enough that a sweep or a reach never triggers it, short enough to feel helpful; the old 400 ms fired on slow sweeps)
const XPL_SWAP = 250; // ms of rest on another tool before an open card swaps its content
const XPL_SPEED = 0.2; // px per ms (200 px/s): the pointer counts as resting below this; aimed movement is 500-2000 px/s, hand tremor well under 50
const XPL_DRIFT = 8; // px the pointer may creep from where it settled before the rest starts over
const XPL_HOLD = 500; // ms of a touch long-press
const XPL_SLIDE = 220; // ms of the overlay slide (see bwSidePanelOpen / bwSidePanelClose)

/** SHARED OVERLAY PANEL (.bw-sidepanel, ux.css): a fixed panel that slides over the pages and never moves them. Any side panel (the spelling
 * panel too) takes the class and calls these two. `apply` runs when the panel's state really changes (after the slide-out; before the slide-in).
 * Not tied to the OS reduced-motion setting: only the editor's calm button (.shell[data-calm="1"]) makes it instant. */
function bwSidePanelOpen(el, apply) {
  clearTimeout(el.__spT);
  el.style.transition = 'none';
  el.dataset.slide = 'out'; // start parked off the edge, with no transition on the way there
  if (apply) apply();
  void el.offsetWidth;
  el.style.transition = '';
  delete el.dataset.slide; // the transition now carries it in
}
function bwSidePanelClose(el, apply) {
  clearTimeout(el.__spT);
  if (el.closest('.shell')?.dataset.calm === '1') { if (apply) apply(); return; }
  el.dataset.slide = 'out';
  el.__spT = setTimeout(() => {
    el.style.transition = 'none';
    if (apply) apply();
    delete el.dataset.slide;
    void el.offsetWidth;
    el.style.transition = '';
  }, XPL_SLIDE + 20);
}
/** A tool the person can really use right now: connected, not disabled, not hidden (a disabled or hidden tool explains nothing). */
function xplUsable(el) {
  if (!el?.isConnected || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.inert) return false;
  if (el.closest('[hidden], [inert]')) return false;
  return el.getClientRects().length > 0;
}
/** The control a node belongs to when it has an explanation (null otherwise). */
function xplTarget(node) {
  const el = node?.closest?.('button[data-a], select[data-a], select[data-dg], [data-x], .rb-tab[data-tab], .drawer [data-k], .drawer [data-f], .pop label.chk, .drawer :is([data-fpopen], [data-fplocal], [data-fpupload], [data-fprm], .vc-s, .vc-n, .vc-u, .cc-hex, input[type="color"], [data-dpart], [data-dmove], [data-lab])');
  if (!el || el.closest('.palette, .xpl, .xpl-dock') || !xplUsable(el)) return null;
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
/** The one panel (built once, kept across rebuilds by UI_RUNTIME); its words follow the UI language. */
function xplDock() {
  const shell = root.querySelector('.shell');
  if (!shell) return null;
  let dock = shell.querySelector(':scope > .xpl-dock');
  if (!dock) {
    dock = document.createElement('aside');
    dock.className = 'xpl-dock bw-sidepanel';
    dock.innerHTML = '<header class="xd-h"><span class="i"></span><b class="xd-w"></b><button type="button" class="xd-x" aria-controls="bw-xpl-body"></button></header><div class="xd-b" id="bw-xpl-body"><div class="xph"><div class="xa" aria-hidden="true"></div><p></p></div></div><button type="button" class="xd-tab"><span class="i"></span></button>';
    shell.appendChild(dock);
    const tab = dock.querySelector('.xd-tab'); // closed (or stepped aside) the dock IS this 40 x 96 edge tab
    dock.querySelector('.xd-x').addEventListener('click', () => xplPanelSet(false));
    tab.addEventListener('click', () => { dock.dataset.force = '1'; xplPanelSet(true); });
    const card = root.querySelector('.xpl');
    if (card) dock.querySelector('.xd-b').appendChild(card);
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
  return dock;
}
function xplPanelSet(open) {
  ls.set('bw:xpl-panel', open ? '1' : '0');
  const dock = root.querySelector('.xpl-dock');
  if (!open) xplClear();
  if (!dock) { xplDock(); return; }
  if (open) bwSidePanelOpen(dock, xplDock); // slides in over the pages
  else if (xplPanelVisible()) bwSidePanelClose(dock, xplDock); // slides out, then only the edge tab stays
  else xplDock();
}
function xplWire() {
  xplDock();
  if (root.__xplWired) return;
  root.__xplWired = true;
  // cand = the ONE tool a card is waiting for ({ el, k, src, x, y }); timer = its single rest timer; last = the previous pointer sample
  const st = { timer: 0, hold: 0, el: null, cand: null, last: null };
  xplWire.st = st;
  const shown = () => root.querySelector('.xpl:not([hidden])');
  const cancel = () => { clearTimeout(st.timer); st.timer = 0; st.cand = null; };
  /** (Re)starts the rest timer for the candidate: INTENT for a first card, SWAP when a card is already on screen. */
  const schedule = (c) => {
    clearTimeout(st.timer);
    st.cand = c;
    st.timer = setTimeout(() => {
      if (st.cand !== c) return; // the pointer or the focus moved on: this timer is stale
      st.timer = 0; st.cand = null;
      xplShow(c.el, c.k);
    }, shown() ? XPL_SWAP : XPL_INTENT);
  };
  const quiet = (el) => { // the card replaces the native tooltip; the name the title gave moves to aria-label so it is never lost
    if (el.title) { el.dataset.tt = el.title; el.removeAttribute('title'); if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', el.dataset.tt); }
  };
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = xplTarget(e.target);
    if (!el) return;
    quiet(el);
    const k = xplKey(el);
    // the card already shows this tool (compared by key: the ribbon repaints by morphing, so one button node can become another tool)
    if (shown()?.dataset.k === k) { cancel(); return; }
    // the same tool again (a child of it, or the ribbon swapped the button under a resting pointer): keep the timer already running
    if (st.cand && st.cand.k === k) { st.cand.el = el; return; }
    schedule({ el, k, src: 'pointer', x: e.clientX, y: e.clientY });
  });
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const now = performance.now(), l = st.last;
    st.last = { x: e.clientX, y: e.clientY, t: now };
    const c = st.cand;
    if (!c || c.src !== 'pointer') return;
    const speed = l ? Math.hypot(e.clientX - l.x, e.clientY - l.y) / Math.max(now - l.t, 1) : 0;
    if (speed > XPL_SPEED || Math.hypot(e.clientX - c.x, e.clientY - c.y) > XPL_DRIFT) { // still travelling, or crept away: the rest starts over from here
      c.x = e.clientX; c.y = e.clientY;
      schedule(c);
    }
  }, true);
  root.addEventListener('pointerout', (e) => {
    const el = xplTarget(e.target);
    if (!el || el.contains(e.relatedTarget) || !el.isConnected) return; // a repainted (removed) button is not the pointer leaving
    const to = xplTarget(e.relatedTarget);
    if (to && xplKey(to) === xplKey(el)) return; // the ribbon swapped the button under a resting pointer: same tool, keep waiting
    if (st.cand?.src === 'pointer') cancel(); // a card still waiting is dropped; the one on screen stays
  });
  root.addEventListener('focusin', (e) => {
    const el = xplTarget(e.target);
    if (!el || !el.matches(':focus-visible')) return;
    quiet(el);
    const k = xplKey(el);
    if (shown()?.dataset.k === k) { cancel(); return; }
    schedule({ el, k, src: 'focus' });
  });
  root.addEventListener('focusout', (e) => {
    const el = e.target;
    if (!el.isConnected) return; // a repaint removed the focused button: not the focus leaving
    if (st.cand?.src === 'focus' && (st.cand.el === el || st.cand.k === xplKey(el))) cancel();
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
/** Stops a card that is still waiting for its rest. The card on screen stays (the user closes the panel). Always false: Esc is never swallowed. */
function xplHide() {
  const st = xplWire.st;
  if (st) { clearTimeout(st.timer); clearTimeout(st.hold); st.timer = 0; st.cand = null; }
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
  if (el.isConnected && root.contains(el) && xplKey(el) === k) return el;
  const rb = k.startsWith('rbtab_') ? `.rb-tab[data-tab="${k.slice(6)}"]` : `.ribbon [data-a="${k}"]`;
  return root.querySelector(rb) || root.querySelector(`[data-a="${k}"], [data-x="${k}"]`);
}
function xplShow(el, k) {
  const st = xplWire.st;
  const live = xplLive(el, k);
  if (!live || !xplUsable(live)) return; // gone, disabled or hidden: nothing to explain
  el = live;
  const dock = xplDock();
  if (!dock || dock.dataset.slide || !xplPanelOpen() || !xplPanelVisible()) return; // closed, sliding away or stepped aside: the person asked for no explanations on screen
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
  if (!card.hidden && card.dataset.k === k) { st.el = el; el.setAttribute('aria-describedby', 'bw-xpl'); return; } // already showing this tool: never a second open
  const swap = !card.hidden; // a card is open: its content is replaced in place, it is never closed and reopened
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
  card.classList.remove('in', 'swap'); void card.offsetWidth; card.classList.add(swap ? 'swap' : 'in');
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
