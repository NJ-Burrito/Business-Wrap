/* 0.15.0 look lane (notes 11 and 13, perf booster 2). Three small, independent jobs that share one file because each is a few lines of
 * DOM plumbing the stylesheets cannot do:
 *   1. #bw-backdrop (0.15.2 note 1: a static drafting-grid layer, look in editor/editor.css; here the element is built once).
 *   2. --bw-drawer-top on the host (note 11): the real bottom of the top bar + 8 px, kept in step by a ResizeObserver. editor.js measureBar
 *      only grows --bw-bar-h and is not run when the ribbon folds, which left drawers hanging 275 px down. ui.css reads --bw-drawer-top
 *      and falls back to --bw-bar-h.
 *   3. The mark's idle nod (perf booster 2): one-shot animations set from a timer instead of `infinite` CSS loops (see chrome.css).
 * An extension's code runs in the editor's own scope: `root`, `S`, `isCalm` are in reach. */
/* 0.15.2 note 1: the backdrop is a static CSS layer now (editor/editor.css, a drafting grid over a soft glow): no mask, no animation, nothing to
 * still or pause. Here: build the element once. */
const lookState = { bd: null, ro: null, roEl: null, idleT: 0, idleN: 0 };

function bdEnsure() {
  let el = document.getElementById('bw-backdrop');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bw-backdrop';
    el.setAttribute('aria-hidden', 'true');
    document.body.prepend(el);
  }
  lookState.bd = el;
  return el;
}

/** The bar's real bottom + 8 px (the 12 px page band of measureBar is 4 px more: --bw-bar-h - 4 is the old fallback). */
function dtSync() {
  if (typeof RB !== 'undefined' && RB.glide) return; // the ribbon's panel is gliding (25-ribbon.js): measured once when it lands
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
      bdEnsure(); dtSync();
      // 0.15.2 hover cost: while the pointer is on the toolbar the watermark's idle float pauses (root flag data-bw-hot, event bw:hot)
      const hotSet = (on) => { const d = document.documentElement.dataset; if ((d.bwHot === '1') !== on) { d.bwHot = on ? '1' : '0'; window.dispatchEvent(new Event('bw:hot')); } };
      root.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch' && e.target?.closest?.('.island')) hotSet(true); });
      root.addEventListener('pointerout', (e) => { const isl = e.target?.closest?.('.island'); if (isl && !isl.contains(e.relatedTarget)) hotSet(false); });
      window.addEventListener('resize', dtSync);
      window.addEventListener('bw:server', () => requestAnimationFrame(dtSync));
      lookState.idleT = setTimeout(idleLoop, 2600);
    },
    open: () => { bdEnsure(); dtSync(); },
    render: () => { bdEnsure(); }, // no layout read here: the ResizeObserver already follows the bar (a read per render added 0.7 ms per key)
  },
  expose: { look: { idleNow: () => idleNow(true), drawerTop: dtSync, backdrop: () => lookState.bd } },
});
