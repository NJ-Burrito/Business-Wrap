/* 0.15.0 look lane (notes 11 and 13, perf booster 2). Three small, independent jobs that share one file because each is a few lines of
 * DOM plumbing the stylesheets cannot do:
 *   1. #bw-backdrop, the giant NJ monogram on the desk (note 13). The look is in editor/editor.css (page level: the desk is outside the
 *      shadow root, so an ext/*.css file could not reach it). Here: build the element once, hand it the monogram as a CSS mask, and still it
 *      (class bd-still) while the tab is hidden or the page is zoomed past 200 %. Calm, reduced motion and focus mode are CSS (root flags).
 *   2. --bw-drawer-top on the host (note 11): the real bottom of the top bar + 8 px, kept in step by a ResizeObserver. editor.js measureBar
 *      only grows --bw-bar-h and is not run when the ribbon folds, which left drawers hanging 275 px down. ui.css reads --bw-drawer-top
 *      and falls back to --bw-bar-h.
 *   3. The mark's idle nod (perf booster 2): one-shot animations set from a timer instead of `infinite` CSS loops (see chrome.css).
 * An extension's code runs in the editor's own scope: `root`, `S`, `isCalm` are in reach. */
const BD_NJ = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="#000" d="M40 50H70L106 126V50H136V206H106L70 128V206H40Z"/>'
  + '<path fill="#000" d="M154 50H220V152Q220 206 170 206H152V176H166Q190 176 190 148V80H154Z"/></svg>';
const BD_MASK = `url("data:image/svg+xml,${encodeURIComponent(BD_NJ)}")`;

const lookState = { bd: null, ro: null, roEl: null, idleT: 0, idleN: 0 };

function bdEnsure() {
  let el = document.getElementById('bw-backdrop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bw-backdrop';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--bd-mask', BD_MASK);
    el.innerHTML = '<div class="bd-mark"><i class="bd-wash"></i></div>';
    document.body.prepend(el);
  }
  lookState.bd = el;
  return el;
}
function bdSync() {
  const el = lookState.bd || bdEnsure();
  const zoom = parseFloat(document.documentElement.style.getPropertyValue('--bw-zoom')) || 1;
  el.classList.toggle('bd-still', document.hidden || zoom > 2);
}

/** The bar's real bottom + 8 px (the 12 px page band of measureBar is 4 px more: --bw-bar-h - 4 is the old fallback). */
function dtSync() {
  const bar = root.querySelector('.island');
  const host = document.getElementById('bw-ui-host');
  if (!host) return;
  if (bar !== lookState.roEl) {
    lookState.ro?.disconnect();
    lookState.roEl = bar;
    if (bar && typeof ResizeObserver === 'function') { lookState.ro = new ResizeObserver(dtSync); lookState.ro.observe(bar); }
  }
  const bottom = bar && !bar.closest('[hidden]') && getComputedStyle(bar).display !== 'none' ? bar.offsetTop + bar.offsetHeight : 0;
  const v = `${Math.round(bottom) + 8}px`;
  if (host.style.getPropertyValue('--bw-drawer-top') !== v) host.style.setProperty('--bw-drawer-top', v);
}

/** The mark's idle nod: each part once per 6.4 s (the lines every 12.8 s), staggered like the old loops; nothing runs in between.
 *  Web Animations on the parts (they stack on top of the first-open build, which fills forwards, and cancel themselves when done);
 *  ids bwm-idle-* name them for the tests. Easings are the brand v3 tokens' cubic-beziers (WAAPI cannot read var()). */
const EASE = { inOut: 'cubic-bezier(0.65, 0, 0.35, 1)', out: 'cubic-bezier(0.22, 1, 0.36, 1)', spring: 'cubic-bezier(0.34, 1.36, 0.64, 1)' };
const IDLE_PARTS = [
  ['.rule', 'bwm-idle-rule', [{ transform: 'scaleX(1)' }, { transform: 'scaleX(.2)', offset: .27 }, { transform: 'scaleX(1.08)', offset: .64 }, { transform: 'scaleX(1)' }], 1400, 0, EASE.inOut, 1],
  ['.sheet', 'bwm-idle-sheet', [{ transform: 'none' }, { transform: 'rotate(-2deg) translateY(-.5px)', offset: .3 }, { transform: 'rotate(.6deg)', offset: .65 }, { transform: 'none' }], 1300, 300, EASE.inOut, 1],
  ['.cap', 'bwm-idle-cap', [{ transform: 'none' }, { transform: 'translateY(-3px)', offset: .28 }, { transform: 'translateY(.5px)', offset: .64 }, { transform: 'none' }], 900, 600, EASE.spring, 1],
  ['.ln.l2', 'bwm-idle-write', [{ strokeDashoffset: 0 }, { strokeDashoffset: -1, offset: .25 }, { strokeDashoffset: 0, offset: .75 }, { strokeDashoffset: 0 }], 1500, 900, EASE.out, 2],
];
function idleBlocked() {
  const brand = root.querySelector('.brand');
  return !brand || document.hidden || isCalm() || S.focus || brand.matches(':hover');
}
/** Play the nod (all parts when `all`, the test hook BW.EXT.look.idleNow()). Returns the animation ids; [] while blocked. */
function idleNow(all = false) {
  if (idleBlocked()) return [];
  const mark = root.querySelector('.brand svg');
  if (!mark || typeof mark.animate !== 'function') return [];
  lookState.idleN += 1;
  const set = [];
  for (const [sel, id, frames, duration, delay, easing, period] of IDLE_PARTS) {
    if (!all && lookState.idleN % period !== 0) continue;
    const part = mark.querySelector(sel);
    if (!part) continue;
    const a = part.animate(frames, { duration, delay, easing, fill: 'backwards' });
    a.id = id;
    a.onfinish = () => a.cancel();
    set.push(id);
  }
  return set;
}
function idleLoop() {
  idleNow();
  lookState.idleT = setTimeout(idleLoop, 6400);
}

bwExt({
  on: {
    boot: () => {
      bdEnsure(); bdSync(); dtSync();
      document.addEventListener('visibilitychange', bdSync);
      new MutationObserver(bdSync).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
      window.addEventListener('resize', dtSync);
      window.addEventListener('bw:server', () => requestAnimationFrame(dtSync));
      lookState.idleT = setTimeout(idleLoop, 2600);
    },
    open: () => { bdEnsure(); dtSync(); },
    render: () => { bdEnsure(); }, // no layout read here: the ResizeObserver already follows the bar (a read per render added 0.7 ms per key)
  },
  expose: { look: { idleNow: () => idleNow(true), drawerTop: dtSync, backdrop: () => lookState.bd } },
});
