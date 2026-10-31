/* NJ watermark (0.15.0: moved out of editor.js): the role mark, behaving as on the owner's portfolio, plus 20 quiet reactions.
 *
 * Mark (unchanged since 0.10.0, copied from NJ-Burrito.github.io index.html): roles tester > teacher > volunteer > professional;
 * click / Enter / Space = next role; the role word rises letter by letter (560 ms, 40 ms stagger); idle float and a pointer tilt
 * on a spring; paused when the tab is hidden; the intro plays once per browser and a click skips it. UI only, print-hidden,
 * never written into an export.
 *
 * Reactions (out/qa-0.15.0/ui/designer.md section 9): W01-W10 are tied to an action, W11-W19 are random, W20 is the easter egg
 * (seven clicks in 3 s). They only use `transform` and `opacity` (Web Animations; the pieces that sparkle or shimmer are small
 * child elements moved by transform), never make a sound, never touch the live region, the document, a setting or the undo
 * history, and never get in the way: one at a time (a trigger that arrives while one plays is dropped, never queued), at most
 * one action reaction per 4 s (a tab switch per 8 s), at most 12 reactions per 10 minutes, nothing while the person typed in the
 * last 2 s, in focus mode, in a hidden tab, or above 200 % zoom. Reduced motion or calm mode: the random ones are off, an action
 * reaction is a 240 ms opacity pulse, the easter egg is a still role switch.
 *
 * Contract for the other lanes (frozen): window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W05' } })). Only this
 * file plays reactions. Tests: BW_WM.play(id) plays one directly (no rate rules), BW_WM.trigger(id) goes through the rules. */
(() => {
  const EASE = 'cubic-bezier(.16,1,.3,1)'; // --bw-ease-out
  const IDLE = 0.3; // the mark's resting opacity
  const UP = 0.85; // while it reacts
  const RMq = matchMedia('(prefers-reduced-motion: reduce)');
  const calm = () => RMq.matches || document.documentElement.dataset.bwCalm === '1' || (typeof S !== 'undefined' && S.calm === true);
  const now = () => Date.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  /** id: [name, kind, total ms, minimum gap in ms between two of this id's kind] (the table in ui/designer.md section 9). */
  const TABLE = {
    W01: ['save-nod', 'action', 520], W02: ['export-launch', 'action', 800], W03: ['undo-rewind', 'action', 700], W04: ['spell-sparkle', 'action', 600],
    W05: ['tab-tick', 'action', 240, 8000], W06: ['idle-yawn', 'idle', 1800], W07: ['server-wake', 'status', 700], W08: ['server-sleep', 'status', 900],
    W09: ['import-landing', 'status', 900], W10: ['welcome-wave', 'status', 1400],
    W11: ['hop', 'random', 600], W12: ['tilt-wave', 'random', 700], W13: ['shimmer', 'random', 900], W14: ['blink', 'random', 500], W15: ['peek', 'random', 1000],
    W16: ['role-flip', 'random', 960], W17: ['spin-flip', 'random', 800], W18: ['jelly', 'random', 700], W19: ['float-bob', 'random', 1600],
    W20: ['lucky-seven', 'egg', 1800],
  };
  const IDS = Object.keys(TABLE);
  const RANDOM_IDS = IDS.filter((id) => TABLE[id][1] === 'random');

  /* what a mounted mark gives the reactions (set by mount) */
  let M0 = null; // { wm, stage, mark, tag, fxClip, fxOpen, parts, next, flip }
  let playingRec = null; // { id, anims, at, ms }
  // «playing» ends with the animation or when its length has passed on the page clock (a test's fake clock moves Date.now, not the animation timeline)
  const stillPlaying = () => { if (playingRec && now() >= playingRec.at + playingRec.ms) { playingRec.anims.forEach((x) => { try { x.finish(); } catch { /* gone */ } }); playingRec = null; clearWill(); } return playingRec; };
  const setPlaying = (r) => { playingRec = r; };
  const st = { lastAny: 0, lastAction: 0, lastById: {}, stamps: [], lastKey: -1e9, lastInput: 0, idleN: 0, idleAt: 0, lastEgg: -1e9, lastHover: -1e9, bag: [], last: null, count: 0, plays: [] };

  const CSS = `
#bw-watermark .bw-wm-stage { position: relative; }
#bw-watermark .bw-wm-fx { position: absolute; inset: 0; pointer-events: none; border-radius: 14px; }
#bw-watermark .bw-wm-fx.clip { overflow: hidden; }
#bw-watermark .bw-wm-fx > * { position: absolute; opacity: 0; pointer-events: none; }
#bw-watermark .fx-star { top: -8px; inset-inline-end: -8px; width: 20px; height: 20px; background: var(--bw-accent, #c99a2e); clip-path: polygon(50% 0, 61% 39%, 100% 50%, 61% 61%, 50% 100%, 39% 61%, 0 50%, 39% 39%); }
#bw-watermark .fx-shadow { left: 12%; right: 12%; bottom: -6px; height: 10px; border-radius: 50%; background: radial-gradient(closest-side, rgba(0,30,61,.35), transparent); }
#bw-watermark .fx-strip { top: -10%; bottom: -10%; left: 0; width: 30%; background: color-mix(in srgb, var(--bw-accent, #c99a2e) 35%, transparent); }
#bw-watermark .fx-half { top: 0; bottom: 0; width: 50%; background: rgba(0,20,40,.6); }
#bw-watermark .fx-half.n { left: 0; }
#bw-watermark .fx-half.j { right: 0; }
#bw-watermark .fx-ring { inset: 0; border: 2px solid var(--bw-accent, #c99a2e); border-radius: 50%; }
`;

  /* ── the reactions: each returns its animations (target, keyframes, options). Total length = the table's ms. ── */
  const kf = (...t) => t.map((transform) => ({ transform }));
  const mk = (id, ms, keys, extra = {}) => ({ target: 'mark', keys, ms, composite: 'add', easing: EASE, ...extra });
  const op = (ms, keys, easing = EASE) => ({ target: 'wm', keys: keys.map((opacity) => ({ opacity })), ms, easing });
  const OP_UP = (ms) => op(ms, [IDLE, UP, IDLE]);
  const BUILD = {
    W01: (ms) => [mk('W01', ms, kf('translateY(0) scaleY(1)', 'translateY(6px) scaleY(.94)', 'translateY(0) scaleY(1)')), OP_UP(ms)],
    W02: (ms) => [mk('W02', ms, kf('translateY(0) rotate(0deg)', 'translateY(-24px) rotate(-8deg)', 'translateY(0) rotate(0deg)')), op(ms, [IDLE, UP, UP, IDLE])],
    W03: (ms) => [mk('W03', ms, kf('rotate(0deg)', 'rotate(-360deg)'), { easing: 'ease-in-out' }), OP_UP(ms)],
    W04: (ms) => [mk('W04', ms, kf('scale(1)', 'scale(1.12)', 'scale(1)')), OP_UP(ms),
      { target: 'star', keys: [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.5 }, { transform: 'scale(1)', opacity: 0 }], ms, easing: EASE }],
    W05: (ms, d) => { const x = (d?.dir === -1 || d?.dir === 'start' || d?.dir === 'left') ? -6 : 6; return [mk('W05', ms, kf('translateX(0)', `translateX(${x}px)`, 'translateX(0)')), OP_UP(ms)]; },
    W06: (ms) => [mk('W06', ms, kf('scaleY(1)', 'scaleY(1.06)', 'scaleY(.96)', 'scaleY(1)')), op(ms, [IDLE, 0.18, IDLE], 'ease-in-out')],
    W07: (ms) => [mk('W07', ms, [{ transform: 'translateY(-8px) scale(1.08)' }, { transform: 'translateY(2px) scale(.98)', offset: 0.6 }, { transform: 'translateY(0) scale(1)' }]), op(ms, [UP, UP, IDLE])],
    W08: (ms) => [mk('W08', ms, kf('scaleY(1)', 'scaleY(.9)', 'scaleY(1)'), { easing: 'ease-in' }), op(ms, [IDLE, 0.15, IDLE], 'ease-in')],
    W09: (ms) => [mk('W09', ms, [{ transform: 'translateY(-32px)' }, { transform: 'translateY(0)', offset: 0.45 }, { transform: 'translateY(-6px)', offset: 0.6 }, { transform: 'translateY(0)', offset: 0.75 }, { transform: 'translateY(-2px)', offset: 0.87 }, { transform: 'translateY(0)' }]), op(ms, [UP, UP, IDLE])],
    W10: (ms) => [mk('W10', ms, kf('rotate(0deg)', 'rotate(10deg)', 'rotate(-8deg)', 'rotate(6deg)', 'rotate(0deg)')), op(ms, [IDLE, UP, UP, IDLE])],
    W11: (ms) => [mk('W11', ms, kf('translateY(0)', 'translateY(-10px)', 'translateY(0)'), { easing: 'cubic-bezier(.34,1.56,.64,1)' }), OP_UP(ms),
      { target: 'shadow', keys: [{ transform: 'scale(1)', opacity: 0.6 }, { transform: 'scale(.9)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 0.6 }], ms, easing: EASE }],
    W12: (ms) => [mk('W12', ms, kf('rotateY(0deg)', 'rotateY(16deg)', 'rotateY(-16deg)', 'rotateY(0deg)')), OP_UP(ms)],
    W13: (ms) => [mk('W13', ms, kf('translateY(0)', 'translateY(0)')), OP_UP(ms),
      { target: 'strip', keys: [{ transform: 'translateX(-120%) skewX(-40deg)', opacity: 1 }, { transform: 'translateX(420%) skewX(-40deg)', opacity: 1 }], ms, easing: 'ease-in-out' }],
    W14: (ms) => [mk('W14', ms, kf('translateY(0)', 'translateY(0)')), OP_UP(ms),
      { target: 'halfN', keys: [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], ms: ms / 2, easing: 'ease-in-out' },
      { target: 'halfJ', keys: [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], ms: ms / 2, delay: ms / 2, easing: 'ease-in-out' }],
    W15: (ms) => [mk('W15', ms, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(10deg)', offset: 0.3 }, { transform: 'rotateY(10deg)', offset: 0.7 }, { transform: 'rotateY(0deg)' }]), OP_UP(ms)],
    W16: (ms) => [mk('W16', ms, kf('translateY(0)', 'translateY(0)')), OP_UP(ms)],
    W17: (ms) => [mk('W17', ms, kf('rotateY(0deg)', 'rotateY(360deg)')), OP_UP(ms)],
    W18: (ms) => [mk('W18', ms, kf('scale(1,1)', 'scale(1.1,.9)', 'scale(.94,1.06)', 'scale(1,1)')), OP_UP(ms)],
    W19: (ms) => [mk('W19', ms, [{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)', offset: 0.25 }, { transform: 'translateY(0)', offset: 0.5 }, { transform: 'translateY(-3px)', offset: 0.75 }, { transform: 'translateY(0)' }], { easing: 'ease-in-out' }), OP_UP(ms)],
    W20: (ms) => [mk('W20', ms, [{ transform: 'rotateY(0deg) scale(1)' }, { transform: 'rotateY(360deg) scale(1.3)', offset: 0.5 }, { transform: 'rotateY(720deg) scale(1)' }]), op(ms, [IDLE, UP, UP, IDLE]),
      ...[0, 1, 2].map((i) => ({ target: `ring${i}`, keys: [{ transform: 'scale(.6)', opacity: 0.6 }, { transform: 'scale(2.2)', opacity: 0 }], ms: ms - 240, delay: i * 120, easing: EASE }))],
  };

  const target = (name) => {
    if (!M0) return null;
    if (name === 'mark') return M0.mark;
    if (name === 'wm') return M0.wm;
    return M0.parts[name] || null;
  };
  const clearWill = () => { if (M0) M0.mark.style.willChange = ''; };

  /** Play one reaction now (no rate rules; reduced motion / calm still apply). Returns the animations, or null when it cannot play. */
  function play(id, detail) {
    const spec = TABLE[id];
    if (!spec || !M0) return null;
    const [name, kind, ms] = spec;
    if (stillPlaying()) cancelPlaying();
    const reduced = calm();
    let list;
    if (reduced) {
      if (kind === 'random') return null;
      // an action reaction is a 240 ms opacity pulse, the easter egg a still (the role image advances, the mark holds at .85)
      list = kind === 'egg' ? [op(1500, [UP, UP])] : [op(240, [IDLE, UP, IDLE], 'linear')];
      if (kind === 'egg') M0.flip(true);
    } else list = BUILD[id](ms, detail);
    M0.mark.style.willChange = 'transform, opacity';
    const anims = [];
    for (const a of list) {
      const el = target(a.target);
      if (!el) continue;
      const opts = { duration: a.ms, delay: a.delay || 0, easing: a.easing || EASE, fill: 'none' };
      if (a.composite) opts.composite = a.composite;
      let an;
      try { an = el.animate(a.keys, opts); } catch { continue; }
      anims.push(an);
    }
    if (!reduced && id === 'W16') M0.flip(true); // the cross-fade to the next role image, the tag letters rise (silent: the live region is not touched)
    const t0 = now();
    const rec = { id, name, kind, ms: reduced ? list[0].ms : ms, anims, reduced, at: t0 };
    setPlaying(rec);
    st.last = rec;
    st.plays.push({ id, at: t0, reduced });
    const done = () => { if (playingRec === rec) { playingRec = null; clearWill(); } };
    Promise.allSettled(anims.map((x) => x.finished)).then(done);
    return anims;
  }
  function cancelPlaying() {
    if (!playingRec) return;
    playingRec.anims.forEach((a) => { try { a.cancel(); } catch { /* gone */ } });
    playingRec = null;
    clearWill();
  }

  /* ── the rules ───────────────────────────────────────────────────────────── */
  const typingFor = () => now() - st.lastKey;
  const suppressed = () => !M0 || document.hidden || (typeof S !== 'undefined' && (S.focus || S.zoom > 2)) || M0.wm.dataset.intro === 'playing';
  const withinCap = () => { st.stamps = st.stamps.filter((x) => x > now() - 600000); return st.stamps.length < 12; };
  const stamp = (kind, id) => { const t = now(); st.stamps.push(t); st.lastAny = t; if (kind === 'action' || kind === 'status') st.lastAction = t; st.lastById[id] = t; };
  let pendingTyping = null;

  /** An event-driven reaction (what the other lanes announce): the rules apply. Returns true when it plays now or after typing stops. */
  function trigger(id, detail) {
    const spec = TABLE[id];
    if (!spec || !M0) return false;
    const [, kind] = spec;
    if (suppressed()) return false;
    if (calm() && kind === 'random') return false;
    if (stillPlaying()) return false; // one at a time: dropped, never queued
    if (!withinCap()) return false;
    if ((kind === 'action' || kind === 'status') && st.lastAction && now() - st.lastAction < 4000) return false; // one action reaction per 4 s
    if (spec[3] && st.lastById[id] && now() - st.lastById[id] < spec[3]) return false;
    if (kind !== 'egg' && typingFor() < 2000) {
      // an action reaction waits up to 2 s for the typing to stop and plays, or is dropped; a status event keeps waiting
      if (pendingTyping) return false;
      const waitMax = kind === 'status' ? 60000 : 2000;
      const t0 = now();
      const poll = () => {
        pendingTyping = null;
        if (typingFor() >= 2000) { if (!stillPlaying() && !suppressed() && withinCap()) { stamp(kind, id); play(id, detail); } return; }
        if (now() - t0 < waitMax) pendingTyping = setTimeout(poll, 250);
      };
      pendingTyping = setTimeout(poll, Math.max(250, 2000 - typingFor()));
      return true;
    }
    stamp(kind, id);
    return !!play(id, detail);
  }

  /* ── random reactions: a shuffle bag, 25 to 70 s after the last reaction of any kind ── */
  let randomTimer = 0;
  const nextFromBag = () => {
    if (!st.bag.length) { st.bag = [...RANDOM_IDS]; for (let i = st.bag.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [st.bag[i], st.bag[j]] = [st.bag[j], st.bag[i]]; } }
    return st.bag.pop();
  };
  function scheduleRandom() {
    clearTimeout(randomTimer);
    const wait = Math.max(1000, rand(25000, 70000) - Math.max(0, now() - st.lastAny));
    randomTimer = setTimeout(() => {
      if (!calm() && now() - st.lastAny >= 25000 && typingFor() >= 2000 && !stillPlaying() && !suppressed() && withinCap()) {
        const id = nextFromBag();
        stamp('random', id);
        play(id);
      }
      scheduleRandom();
    }, wait);
  }

  /* ── idle yawn W06: 3 minutes without a key, pointer or scroll; again after 3 more minutes, at most 3 per idle period ── */
  function idleCheck() {
    const idle = now() - st.lastInput;
    if (idle >= 180000 && st.idleN < 3 && now() - st.idleAt >= 180000 - 1) {
      if (trigger('W06')) { st.idleN += 1; st.idleAt = now(); }
    }
  }
  const touch = () => { st.lastInput = now(); st.idleN = 0; st.idleAt = 0; };

  /* ── mount: the mark itself ──────────────────────────────────────────────── */
  function mountWatermark() {
    if (M0) return;
    const RM = { get matches() { return calm(); }, addEventListener: (...a) => RMq.addEventListener(...a) };
    const roles = WATERMARK.filter((w) => !w.intro);
    const intro = WATERMARK.find((w) => w.intro);
    if (!roles.length && !intro) return;
    if (!document.getElementById('bw-wm-fx-css')) { const css = document.createElement('style'); css.id = 'bw-wm-fx-css'; css.textContent = CSS; document.head.appendChild(css); }
    const wm = document.createElement('div');
    wm.id = 'bw-watermark';
    wm.innerHTML = `<div class="bw-wm-stage" role="button" tabindex="0"><div class="bw-wm-mark">${[...roles, ...(intro ? [intro] : [])]
      .map((w, i) => `<img alt="" draggable="false" data-i="${i}" ${w.intro ? 'data-intro="1"' : ''} src="${esc(w.src)}">`).join('')}</div>`
      + '<div class="bw-wm-fx clip" aria-hidden="true"><i class="fx-strip"></i><i class="fx-half n"></i><i class="fx-half j"></i></div>'
      + '<div class="bw-wm-fx" aria-hidden="true"><i class="fx-shadow"></i><i class="fx-star"></i><i class="fx-ring"></i><i class="fx-ring"></i><i class="fx-ring"></i></div></div>'
      + '<span class="bw-wm-tag" aria-hidden="true"></span><span class="bw-wm-live" aria-live="polite"></span>';
    document.body.appendChild(wm);
    const stage = wm.querySelector('.bw-wm-stage');
    const mark = wm.querySelector('.bw-wm-mark');
    const imgs = [...mark.querySelectorAll('img')];
    const tag = wm.querySelector('.bw-wm-tag');
    const live = wm.querySelector('.bw-wm-live');
    const q = (c) => wm.querySelector(c);
    const parts = { strip: q('.fx-strip'), halfN: q('.fx-half.n'), halfJ: q('.fx-half.j'), shadow: q('.fx-shadow'), star: q('.fx-star') };
    wm.querySelectorAll('.fx-ring').forEach((r, i) => { parts[`ring${i}`] = r; });
    let pi = 0;
    const roleName = () => { const r = roles[pi]?.role; return r ? t(`role_${r}`) : ''; };
    const show = (img) => imgs.forEach((x) => x.classList.toggle('on', x === img));
    const setTag = (animate) => {
      const word = roleName();
      const letters = S.ui === 'ar' ? [word] : [...word];
      tag.innerHTML = letters.map((ch) => `<span><i>${esc(ch)}</i></span>`).join('');
      if (!animate || RM.matches) return;
      [...tag.querySelectorAll('i')].forEach((el, k) => el.animate([{ transform: 'translateY(110%)' }, { transform: 'translateY(-8%)', offset: 0.7 }, { transform: 'translateY(0)' }],
        { duration: 560, delay: k * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
    };
    const label = () => {
      wm.dir = S.ui === 'ar' ? 'rtl' : 'ltr';
      wm.lang = S.ui;
      stage.setAttribute('aria-label', t('wmLabel', { r: roleName() }));
    };
    const settle = () => { wm.dataset.intro = 'done'; show(imgs[pi]); setTag(false); label(); };
    /** silent: a reaction advances the role without announcing it (the live region stays as it was). */
    const flip = (silent) => {
      if (!roles.length) return;
      pi = (pi + 1) % roles.length;
      show(imgs[pi]);
      wm.dataset.role = roles[pi].role || String(pi);
      S2.vy += RM.matches ? 0 : 5;
      setTag(true);
      label();
      if (!silent) live.textContent = t('wmLive', { r: roleName() });
    };
    const next = (e) => {
      e?.preventDefault?.();
      if (wm.dataset.intro === 'playing') { settle(); return; } // a click skips the intro, as on the portfolio
      flip(false);
    };
    // the easter egg: seven clicks (or Enter / Space presses) within 3 s; every click still does its normal role switch
    let clicks = [];
    const wobble = () => { if (RM.matches) return; [...tag.querySelectorAll('i')].forEach((el) => el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 200, easing: 'ease-in-out' })); };
    const counted = (e) => {
      const t0 = now();
      clicks.push(t0);
      clicks = clicks.filter((x) => t0 - x <= 3000);
      next(e);
      if (clicks.length >= 4 && clicks.length < 7) wobble(); // a tiny hint that something is counting
      if (clicks.length >= 7) {
        clicks = [];
        if (t0 - st.lastEgg >= 60000 && typingFor() >= 2000 && !suppressed() && withinCap()) { st.lastEgg = t0; stamp('egg', 'W20'); play('W20'); }
      }
    };
    stage.addEventListener('click', counted);
    stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') counted(e); });
    // a hover plays the hop at most once per 3 s
    stage.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || now() - st.lastHover < 3000) return;
      st.lastHover = now();
      if (!calm() && !stillPlaying() && !suppressed() && typingFor() >= 2000 && withinCap()) { stamp('random', 'W11'); play('W11'); }
    });
    wm.dataset.role = roles[0]?.role || '0';

    // the intro plays once per browser, never under reduced motion
    let seen = false;
    try { seen = localStorage.getItem('bw:wm-intro') === '1'; } catch { /* storage unavailable */ }
    if (intro && !seen && !RM.matches) {
      wm.dataset.intro = 'playing';
      show(imgs[imgs.length - 1]);
      try { localStorage.setItem('bw:wm-intro', '1'); } catch { /* storage unavailable */ }
      setTimeout(() => { if (wm.dataset.intro === 'playing') settle(); }, 8000); // the animation's own length
      label();
    } else settle();

    // 0.15.2 hover cost: the idle float is ONE looping Web Animation on the mark's transform (compositor: no per-frame script, no layout), paused while
    // the pointer is on the toolbar (root flag data-bw-hot, 46-backdrop.js), in a hidden tab and in calm mode. The portfolio's spring frame loop only runs
    // while the pointer is on the mark (tilt) and until it has settled again.
    const S2 = { rx: 0, ry: 0, vx: 0, vy: 0 };
    let pointer = null, last = 0, raf = 0, idle = null;
    const LOOP = 14, STEPS = 56; // seconds; the periods inside it: float 7 s, tilt-x 14 s, tilt-y 14/3 s: whole cycles, so the loop is seamless
    const idleFrames = Array.from({ length: STEPS + 1 }, (_, i) => {
      const tt = (i / STEPS) * LOOP, tau = Math.PI * 2;
      return { transform: `translateY(${(Math.sin(tau * tt / 7) * 6).toFixed(2)}px) rotateX(${(Math.sin(tau * tt / 14) * 4).toFixed(3)}deg) rotateY(${(Math.sin(tau * tt / (14 / 3) + 1) * 6).toFixed(3)}deg)` };
    });
    const spring = (v, tgt, vel, k, c, dt) => { const a = k * (tgt - v) - c * vel; vel += a * dt; return [v + vel * dt, vel]; };
    const idleWanted = () => !pointer && !raf && !document.hidden && !RM.matches && !calm() && document.documentElement.dataset.bwHot !== '1';
    const idleSync = () => {
      if (pointer || raf || RM.matches) { if (idle) { idle.cancel(); idle = null; } return; }
      if (!idle && typeof mark.animate === 'function') { mark.style.transform = ''; idle = mark.animate(idleFrames, { duration: LOOP * 1000, iterations: Infinity, easing: 'linear' }); }
      if (!idle) return;
      const want = idleWanted();
      if (want && idle.playState === 'paused') idle.play();
      else if (!want && idle.playState === 'running') idle.pause();
    };
    const frame = (nowT) => {
      raf = 0;
      const dt = Math.min(0.033, (nowT - (last || nowT)) / 1000);
      last = nowT;
      const p = pointer && !RM.matches ? pointer : null;
      const tx = p ? (p.y - 0.5) * -18 : 0;
      const ty = p ? (p.x - 0.5) * 22 : 0;
      [S2.rx, S2.vx] = spring(S2.rx, tx, S2.vx, 90, 16, dt);
      [S2.ry, S2.vy] = spring(S2.ry, ty, S2.vy, 90, 16, dt);
      const settled = !p && Math.abs(S2.rx) < 0.02 && Math.abs(S2.ry) < 0.02 && Math.abs(S2.vx) < 0.05 && Math.abs(S2.vy) < 0.05;
      if (settled) { S2.rx = S2.ry = S2.vx = S2.vy = 0; mark.style.transform = ''; idleSync(); return; }
      mark.style.transform = `rotateX(${S2.rx.toFixed(3)}deg) rotateY(${S2.ry.toFixed(3)}deg)`;
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    const tilt = () => { if (!raf && !document.hidden && !RM.matches) { last = 0; raf = requestAnimationFrame(frame); } };
    wm.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; const r = stage.getBoundingClientRect(); const first = !pointer; pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; if (first) { idleSync(); tilt(); } });
    wm.addEventListener('pointerleave', () => { pointer = null; tilt(); if (!raf) idleSync(); });
    document.addEventListener('visibilitychange', () => { idleSync(); });
    window.addEventListener('bw:hot', idleSync);
    new MutationObserver(idleSync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-bw-calm'] }); // the editor's own calm button
    RM.addEventListener?.('change', () => { mark.style.transform = ''; idleSync(); });
    idleSync();
    M0 = { wm, stage, mark, tag, parts, flip, next, live };
    window.BW_WM = { next, roles: () => roles.map((r) => r.role), current: () => wm.dataset.role, relabel: () => { setTag(false); label(); }, WM };
    st.lastAny = now(); // the first random reaction comes 25 to 70 s after the mark appears
    scheduleRandom();
    touch();
    setInterval(idleCheck, 5000);
  }

  /* ── the module ────────────────────────────────────────────────────────── */
  const WM = {
    ids: () => [...IDS],
    spec: (id) => (TABLE[id] ? { id, name: TABLE[id][0], kind: TABLE[id][1], ms: TABLE[id][2] } : null),
    play, trigger,
    isPlaying: () => !!stillPlaying(),
    last: () => st.last,
    stats: () => ({ plays: st.plays.slice(), lastAny: st.lastAny }),
    animations: () => (playingRec ? playingRec.anims : []),
  };

  // input bookkeeping: typing (keydown / input) and any activity (key, pointer, scroll, wheel) for the idle yawn
  document.addEventListener('keydown', (e) => { if (!e.target?.closest?.('#bw-watermark')) st.lastKey = now(); touch(); }, true); // Enter / Space on the mark is not typing
  document.addEventListener('input', () => { st.lastKey = now(); }, true);
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'scroll']) document.addEventListener(ev, touch, { capture: true, passive: true });

  // the frozen event contract: other lanes announce, only this file plays (dispatched on window or on document)
  const seenEv = new WeakSet();
  const onWm = (e) => { if (seenEv.has(e)) return; seenEv.add(e); const id = e.detail?.id; if (id && TABLE[id]) trigger(id, e.detail); };
  window.addEventListener('bw:wm', onWm);
  document.addEventListener('bw:wm', onWm);

  // the wires this lane owns: W01 save, W02 other exports, W03 undo, W10 ready (once per browser session)
  bwExt({
    expose: { watermark: WM },
    on: {
      boot: () => { if (WATERMARK.length) mountWatermark(); },
      save: () => trigger('W01'),
      saveHtml: () => trigger('W01'),
      export: () => trigger('W02'),
      commit: (ops, ed, kind) => { if (kind === 'undo') trigger('W03'); },
    },
  });
  // W02 fires only from the success-only emit('export') (editor.js exportPdfDocx), print-center.js and the edits downloads (bw:wm on success); no runAction wrapper, so a failed export never plays it
  const welcome = () => {
    let done = false;
    try { done = sessionStorage.getItem('bw:wm-welcome') === '1'; } catch { /* storage unavailable */ }
    if (done) return;
    try { sessionStorage.setItem('bw:wm-welcome', '1'); } catch { /* storage unavailable */ }
    // W10 is queued, not fired once: on a brand-new browser the first intro is playing (suppressed()) and a typing user / hidden tab drops it, so it retries every 500 ms until it plays or 60 s pass
    const t0 = now();
    const tryW10 = () => { if (trigger('W10') || now() - t0 > 60000) return; setTimeout(tryW10, 500); };
    setTimeout(tryW10, 600);
  };
  if (document.documentElement.dataset.bwReady === '1') welcome();
  else window.addEventListener('bw:ready', welcome, { once: true });
})();
