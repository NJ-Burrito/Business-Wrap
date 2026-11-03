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
 * 0.17.0 (owner note N6): the reactions are acted (anticipation, squash and stretch, follow-through; see BUILD), the idle float breathes,
 * and two more easter eggs sit beside W20 without new ids (EGGS: «charge», a long press; «dizzy», circling the pointer round the mark).
 * Tests and the preview: BW_WM.WM.eggs(), .playEgg(name) (the rules apply), .play(name) (no rules), .frames(id) (the keyframes).
 *
 * Contract for the other lanes (frozen): window.dispatchEvent(new CustomEvent('bw:wm', { detail: { id: 'W05' } })). Only this
 * file plays reactions. Tests: BW_WM.play(id) plays one directly (no rate rules), BW_WM.trigger(id) goes through the rules. */
(() => {
  const EASE = 'cubic-bezier(.16,1,.3,1)'; // --bw-ease-out
  const IDLE = 0.9; // the mark's resting opacity (0.15.9: was 0.3, which read as invisible on the drafting grid; editor.css #bw-watermark carries the same value)
  const UP = 1; // while it reacts
  const RMq = { addEventListener() {} }; // only Calm reduces motion (owner 2026-10-31): the OS setting is not read
  const calm = () => document.documentElement.dataset.bwCalm === '1' || (typeof S !== 'undefined' && S.calm === true);
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

  /* ── the reactions: each returns its animations (target, keyframes, options). Total length = the table's ms. ──
     0.17.0 (owner note N6, "bland and simple, make it alive"): every reaction is acted, not just moved. Each one has an ANTICIPATION
     (it crouches or winds up the other way first), the action with SQUASH AND STRETCH (it stretches as it rises, squashes as it lands),
     and a FOLLOW-THROUGH (it overshoots its rest and settles in a damped wobble). Still only transform and opacity, still the same
     lengths (the table above); the keyframes say where each beat falls (out/qa-0.17.0/motion-detail.md section 3). */
  /** keyframes with their beats: [[offset, transform], ...] */
  const at = (...t) => t.map(([offset, transform]) => ({ offset, transform }));
  const mk = (id, ms, keys, extra = {}) => ({ target: 'mark', keys, ms, composite: 'add', easing: EASE, ...extra });
  const op = (ms, keys, easing = EASE) => ({ target: 'wm', keys: keys.map((opacity) => ({ opacity })), ms, easing });
  const OP_UP = (ms) => op(ms, [IDLE, UP, IDLE]);
  const IO = 'cubic-bezier(.45,0,.2,1)'; // the acted beats carry their own timing, so the curve between them is a soft in-out
  const shadowAt = (ms, peak, delay = 0) => ({ target: 'shadow', keys: [{ transform: 'scale(1)', opacity: 0.55 }, { transform: `scale(${peak})`, opacity: 0.25, offset: 0.42 }, { transform: 'scale(1.08)', opacity: 0.6, offset: 0.68 }, { transform: 'scale(1)', opacity: 0 }], ms, delay, easing: IO });
  const BUILD = {
    // save: a nod: it rises a little, ducks with a squash, rebounds and settles
    W01: (ms) => [mk('W01', ms, at([0, 'translateY(0) scale(1,1)'], [0.18, 'translateY(-3px) scale(.97,1.04)'], [0.42, 'translateY(6px) scale(1.07,.9)'], [0.64, 'translateY(-2px) scale(.98,1.03)'], [0.82, 'translateY(1px) scale(1.01,.99)'], [1, 'translateY(0) scale(1,1)']), { easing: IO }), OP_UP(ms)],
    // export: crouch, launch with a lean, fall back past the floor, land squashed, settle
    W02: (ms) => [mk('W02', ms, at([0, 'translateY(0) rotate(0deg) scale(1,1)'], [0.14, 'translateY(4px) rotate(2deg) scale(1.08,.88)'], [0.42, 'translateY(-26px) rotate(-10deg) scale(.93,1.09)'], [0.7, 'translateY(2px) rotate(2deg) scale(1.07,.92)'], [0.85, 'translateY(-2px) rotate(-.5deg) scale(.99,1.01)'], [1, 'translateY(0) rotate(0deg) scale(1,1)']), { easing: IO }), op(ms, [IDLE, UP, UP, IDLE]), shadowAt(ms, 0.5)],
    // undo: winds forward first, then rewinds a whole turn, overshoots and comes back
    W03: (ms) => [mk('W03', ms, at([0, 'rotate(0deg)'], [0.16, 'rotate(16deg)'], [0.78, 'rotate(-374deg)'], [0.9, 'rotate(-356deg)'], [1, 'rotate(-360deg)']), { easing: IO }), OP_UP(ms)],
    // spelling: a squash, a pop, and a gold star that twirls in and out
    W04: (ms) => [mk('W04', ms, at([0, 'scale(1)'], [0.2, 'scale(1.06,.9)'], [0.5, 'scale(1.14,1.16)'], [0.74, 'scale(.97)'], [0.88, 'scale(1.02)'], [1, 'scale(1)']), { easing: IO }), OP_UP(ms),
      { target: 'star', keys: [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1.25) rotate(100deg)', opacity: 1, offset: 0.45 }, { transform: 'scale(.9) rotate(150deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(0) rotate(200deg)', opacity: 0 }], ms, easing: IO }],
    // tab switch: it leans the way the tab went, swings back past the middle, settles
    W05: (ms, d) => { const x = (d?.dir === -1 || d?.dir === 'start' || d?.dir === 'left') ? -6 : 6; return [mk('W05', ms, at([0, 'translateX(0) rotate(0deg)'], [0.45, `translateX(${x}px) rotate(${x / 2}deg)`], [0.75, `translateX(${-x / 4}px) rotate(${-x / 6}deg)`], [1, 'translateX(0) rotate(0deg)']), { easing: IO }), OP_UP(ms)]; },
    // idle: a real yawn: it stretches up tall and thin, holds it, sags, shakes it off
    W06: (ms) => [mk('W06', ms, at([0, 'scale(1,1) rotate(0deg)'], [0.3, 'scale(.95,1.09) rotate(-2deg)'], [0.5, 'scale(.95,1.1) rotate(2deg)'], [0.68, 'scale(1.05,.93) rotate(0deg)'], [0.78, 'scale(1,1) rotate(-3deg)'], [0.86, 'scale(1,1) rotate(3deg)'], [0.94, 'scale(1,1) rotate(-1deg)'], [1, 'scale(1,1) rotate(0deg)']), { easing: IO }), op(ms, [IDLE, 0.18, IDLE], 'ease-in-out')],
    // the server wakes: it springs up out of a crouch and lands awake
    W07: (ms) => [mk('W07', ms, at([0, 'translateY(4px) scale(1.1,.85)'], [0.35, 'translateY(-10px) scale(.94,1.1)'], [0.6, 'translateY(1px) scale(1.05,.95)'], [0.8, 'translateY(-1px) scale(.99,1.01)'], [1, 'translateY(0) scale(1,1)']), { easing: IO }), op(ms, [UP, UP, IDLE])],
    // the server sleeps: it droops, nods off to one side, then the other, and rests
    W08: (ms) => [mk('W08', ms, at([0, 'translateY(0) scale(1,1) rotate(0deg)'], [0.3, 'translateY(2px) scale(1.04,.9) rotate(-5deg)'], [0.6, 'translateY(3px) scale(1.06,.88) rotate(4deg)'], [0.82, 'translateY(1px) scale(1.02,.96) rotate(-1deg)'], [1, 'translateY(0) scale(1,1) rotate(0deg)']), { easing: 'ease-in-out' }), op(ms, [IDLE, 0.15, IDLE], 'ease-in')],
    // an import lands: it drops in from above and bounces twice, squashing on every landing
    W09: (ms) => [mk('W09', ms, at([0, 'translateY(-32px) scale(.95,1.07)'], [0.4, 'translateY(0) scale(1.13,.85)'], [0.52, 'translateY(-8px) scale(.97,1.04)'], [0.66, 'translateY(0) scale(1.06,.94)'], [0.78, 'translateY(-2px) scale(1,1)'], [0.88, 'translateY(0) scale(1.02,.98)'], [1, 'translateY(0) scale(1,1)']), { easing: IO }), op(ms, [UP, UP, IDLE])],
    // welcome: a little hop, then a wave that keeps swinging and dies down
    W10: (ms) => [mk('W10', ms, at([0, 'translateY(0) rotate(0deg)'], [0.12, 'translateY(-6px) rotate(0deg)'], [0.24, 'translateY(0) rotate(12deg)'], [0.4, 'translateY(0) rotate(-10deg)'], [0.56, 'translateY(0) rotate(7deg)'], [0.72, 'translateY(0) rotate(-4deg)'], [0.86, 'translateY(0) rotate(1.5deg)'], [1, 'translateY(0) rotate(0deg)']), { easing: IO }), op(ms, [IDLE, UP, UP, IDLE])],
    // hop: crouch, jump stretched, land squashed (its shadow shrinks while it is up)
    W11: (ms) => [mk('W11', ms, at([0, 'translateY(0) scale(1,1)'], [0.15, 'translateY(2px) scale(1.08,.9)'], [0.45, 'translateY(-12px) scale(.95,1.06)'], [0.7, 'translateY(0) scale(1.06,.94)'], [0.85, 'translateY(-1.5px) scale(1,1)'], [1, 'translateY(0) scale(1,1)']), { easing: IO }), OP_UP(ms), shadowAt(ms, 0.7)],
    // tilt-wave: it turns to look one way, then the other, and back
    W12: (ms) => [mk('W12', ms, at([0, 'rotateY(0deg)'], [0.3, 'rotateY(20deg)'], [0.62, 'rotateY(-15deg)'], [0.84, 'rotateY(5deg)'], [1, 'rotateY(0deg)']), { easing: IO }), OP_UP(ms)],
    // shimmer: a gold light sweeps across; the mark draws a breath as it passes
    W13: (ms) => [mk('W13', ms, at([0, 'scale(1)'], [0.45, 'scale(1.035)'], [1, 'scale(1)']), { easing: 'ease-in-out' }), OP_UP(ms),
      { target: 'strip', keys: [{ transform: 'translateX(-120%) skewX(-40deg)', opacity: 1 }, { transform: 'translateX(420%) skewX(-40deg)', opacity: 1 }], ms, easing: 'ease-in-out' }],
    // blink: one half, then the other; the mark squints with each
    W14: (ms) => [mk('W14', ms, at([0, 'scale(1,1)'], [0.25, 'scale(1.03,.95)'], [0.5, 'scale(1,1)'], [0.75, 'scale(1.03,.95)'], [1, 'scale(1,1)']), { easing: 'ease-in-out' }), OP_UP(ms),
      { target: 'halfN', keys: [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], ms: ms / 2, easing: 'ease-in-out' },
      { target: 'halfJ', keys: [{ opacity: 0 }, { opacity: 0.6 }, { opacity: 0 }], ms: ms / 2, delay: ms / 2, easing: 'ease-in-out' }],
    // peek: it leans out to look past its corner, holds, and pops back
    W15: (ms) => [mk('W15', ms, at([0, 'translateX(0) rotate(0deg) rotateY(0deg)'], [0.25, 'translateX(-7px) rotate(-7deg) rotateY(12deg)'], [0.62, 'translateX(-7px) rotate(-7deg) rotateY(12deg)'], [0.78, 'translateX(1.5px) rotate(2deg) rotateY(-3deg)'], [1, 'translateX(0) rotate(0deg) rotateY(0deg)']), { easing: IO }), OP_UP(ms)],
    // role flip: it turns edge-on, the next role is behind, it swings back past front and settles
    W16: (ms) => [mk('W16', ms, at([0, 'rotateY(0deg) scale(1)'], [0.12, 'rotateY(-10deg) scale(.98)'], [0.4, 'rotateY(90deg) scale(1.04)'], [0.7, 'rotateY(-14deg) scale(1)'], [0.86, 'rotateY(4deg) scale(1)'], [1, 'rotateY(0deg) scale(1)']), { easing: IO }), OP_UP(ms)],
    // spin-flip: a hop with a full turn that overshoots and swings back to face front
    W17: (ms) => [mk('W17', ms, at([0, 'translateY(0) rotateY(0deg)'], [0.14, 'translateY(2px) rotateY(-12deg)'], [0.62, 'translateY(-8px) rotateY(380deg)'], [0.82, 'translateY(0) rotateY(354deg)'], [1, 'translateY(0) rotateY(360deg)']), { easing: IO }), OP_UP(ms)],
    // jelly: squash, stretch, and a wobble that dies down
    W18: (ms) => [mk('W18', ms, at([0, 'scale(1,1)'], [0.18, 'scale(1.15,.85)'], [0.38, 'scale(.9,1.1)'], [0.56, 'scale(1.06,.94)'], [0.74, 'scale(.98,1.02)'], [0.88, 'scale(1.01,.99)'], [1, 'scale(1,1)']), { easing: IO }), OP_UP(ms)],
    // float-bob: two slow bobs on the water, rocking a little
    W19: (ms) => [mk('W19', ms, at([0, 'translateY(0) rotate(0deg)'], [0.25, 'translateY(-5px) rotate(-2deg)'], [0.5, 'translateY(0) rotate(1deg)'], [0.75, 'translateY(-3px) rotate(1.5deg)'], [1, 'translateY(0) rotate(0deg)']), { easing: 'ease-in-out' }), OP_UP(ms)],
    // the easter egg, lucky seven: a deep crouch, a leap with two whole turns, a squashed landing and three gold rings
    W20: (ms) => [mk('W20', ms, at([0, 'translateY(0) rotateY(0deg) scale(1,1)'], [0.12, 'translateY(6px) rotateY(-20deg) scale(1.16,.82)'], [0.5, 'translateY(-22px) rotateY(400deg) scale(1.28,1.34)'], [0.74, 'translateY(3px) rotateY(724deg) scale(1.14,.88)'], [0.88, 'translateY(-2px) rotateY(718deg) scale(.98,1.02)'], [1, 'translateY(0) rotateY(720deg) scale(1,1)']), { easing: IO }), op(ms, [IDLE, UP, UP, IDLE]),
      ...[0, 1, 2].map((i) => ({ target: `ring${i}`, keys: [{ transform: 'scale(.6)', opacity: 0.7 }, { transform: 'scale(2.3)', opacity: 0 }], ms: ms - 480, delay: 240 + i * 120, easing: EASE }))],
  };
  /* 0.17.0 two new easter eggs (not reactions: the table and its 20 ids are frozen). Same rules as W20: one at a time, under the 10-minute
     cap, never while typing, in focus mode or a hidden tab; in calm mode a still (the mark holds at full opacity, nothing moves).
       charge  hold the mark down for 0.7 s: it squashes as it charges, and on release it springs up, spins and lands (with the star)
       dizzy   circle the pointer around the mark twice within 3 s: it gets dizzy, wobbling in shrinking circles while the star orbits */
  const EGGS = {
    charge: ['spring-charge', 1300, (ms) => [mk('charge', ms, at([0, 'translateY(4px) scale(1.14,.8)'], [0.3, 'translateY(-24px) rotate(-8deg) scale(.9,1.16)'], [0.55, 'translateY(-26px) rotate(352deg) scale(1.04,1.04)'], [0.76, 'translateY(3px) rotate(362deg) scale(1.12,.88)'], [0.9, 'translateY(-1px) rotate(359deg) scale(.99,1.01)'], [1, 'translateY(0) rotate(360deg) scale(1,1)']), { easing: IO }), op(ms, [UP, UP, IDLE]), shadowAt(ms, 0.45),
      { target: 'star', keys: [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1.3) rotate(120deg)', opacity: 1, offset: 0.55 }, { transform: 'scale(0) rotate(240deg)', opacity: 0 }], ms, easing: IO }]],
    dizzy: ['dizzy', 1600, (ms) => [mk('dizzy', ms, at([0, 'translate(0,0) rotate(0deg)'], [0.12, 'translate(5px,-2px) rotate(8deg)'], [0.25, 'translate(0,-5px) rotate(-7deg)'], [0.38, 'translate(-4px,-1px) rotate(6deg)'], [0.5, 'translate(0,3px) rotate(-5deg)'], [0.62, 'translate(3px,-1px) rotate(3deg)'], [0.74, 'translate(0,-2px) rotate(-2deg)'], [0.86, 'translate(-1px,0) rotate(1deg)'], [1, 'translate(0,0) rotate(0deg)']), { easing: 'ease-in-out' }), OP_UP(ms),
      { target: 'star', keys: [0, 0.25, 0.5, 0.75, 1].map((o, i) => ({ offset: o, opacity: o === 1 ? 0 : 1, transform: `rotate(${i * 180}deg) translateX(${i === 4 ? 0 : 14}px) rotate(${-i * 180}deg) scale(${i === 4 ? 0 : 0.8})` })), ms, easing: 'linear' }]],
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
    const egg = EGGS[id];
    const spec = TABLE[id] || (egg && [egg[0], 'egg', egg[1]]);
    if (!spec || !M0) return null;
    const [name, kind, ms] = spec;
    if (stillPlaying()) cancelPlaying();
    const reduced = calm();
    let list;
    if (reduced) {
      if (kind === 'random') return null;
      // an action reaction is a 240 ms opacity pulse, the easter egg a still (the role image advances, the mark holds at full opacity)
      list = kind === 'egg' ? [op(1500, [UP, UP])] : [op(240, [IDLE, UP, IDLE], 'linear')];
      if (id === 'W20') M0.flip(true);
    } else list = egg ? egg[2](ms, detail) : BUILD[id](ms, detail);
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

  /** 0.17.0: a new easter egg (EGGS) through the W20 rules: at most one of each per minute, never while typing, suppressed or over the cap. */
  const lastEggBy = {};
  function playEgg(name) {
    if (!EGGS[name] || !M0) return false;
    const t0 = now();
    if (t0 - (lastEggBy[name] ?? -1e9) < 60000 || typingFor() < 2000 || suppressed() || !withinCap()) return false;
    lastEggBy[name] = t0;
    stamp('egg', name);
    return !!play(name);
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
    /* 0.16.1 (fault 4): the mark stays visible and never hides a panel's text. It sits bottom left; while an open panel (Settings and the other drawers, the spelling panel, a dialog)
       would lie under it, it takes the opposite bottom corner, and goes back when the panel closes. Read from the panels' real boxes, not from a language. */
    const wmAvoid = (() => {
      let raf = 0;
      const run = () => {
        raf = 0;
        const sr = document.getElementById('bw-ui-host')?.shadowRoot;
        if (!sr) return;
        const vw = document.documentElement.clientWidth;
        const w = wm.offsetWidth || 84, h = wm.offsetHeight || 100;
        const live = (sel) => [...sr.querySelectorAll(sel)].filter((p) => {
          if (p.hidden || p.closest('[hidden]')) return false;
          const cs = getComputedStyle(p);
          return cs.display !== 'none' && cs.visibility !== 'hidden';
        }).map((p) => p.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        const panels = live('.drawer:not(.closing), .sp-side, [role="dialog"]');
        const toasts = live('.toasts .toast');
        const over = (rs, left, lift) => rs.some((r) => r.left < left + w + 8 && r.right > left - 8 && r.top < innerHeight - 16 - lift && r.bottom > innerHeight - 16 - lift - h - 8);
        const lift = Math.max(0, Math.round(innerHeight - 16 - Math.min(...toasts.map((r) => r.top), innerHeight) + 8));
        // home first; else the other corner; else the other corner above the toasts; else home
        const tries = [['left', 0], ['right', 0], ['right', lift]];
        const pick = tries.find(([side, lf]) => { const left = side === 'left' ? 16 : vw - 16 - w; return !over(panels, left, lf) && (side === 'left' || !over(toasts, left, lf)); }) || tries.find(([side, lf]) => { const left = side === 'left' ? 16 : vw - 16 - w; return !over(panels, left, lf); }) || tries[0];
        if (wm.dataset.wmSide !== pick[0]) wm.dataset.wmSide = pick[0];
        wm.style.setProperty('--bw-wm-lift', pick[1] ? `${pick[1]}px` : '0px');
      };
      const soon = () => { if (!raf) raf = requestAnimationFrame(run); };
      const sr = document.getElementById('bw-ui-host')?.shadowRoot;
      if (sr) new MutationObserver(soon).observe(sr, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'class', 'open'] });
      window.addEventListener('resize', soon);
      soon();
      return soon;
    })();
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
    // 0.17.0 egg «charge»: hold the mark down; it squashes while it charges (the anticipation), and a release after 0.7 s launches it
    let held = null;
    const CHARGE_MS = 700;
    const unhold = () => { if (!held) return; try { held.anim?.cancel(); } catch { /* gone */ } const ok = now() - held.at >= CHARGE_MS; held = null; return ok; };
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      held = { at: now(), anim: RM.matches || typeof mark.animate !== 'function' ? null : mark.animate([{ transform: 'scale(1,1)' }, { transform: 'translateY(4px) scale(1.14,.8)' }], { duration: CHARGE_MS, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards', composite: 'add' }) };
    });
    stage.addEventListener('pointerup', () => { if (unhold()) playEgg('charge'); });
    for (const ev of ['pointercancel', 'pointerleave']) stage.addEventListener(ev, unhold);
    // 0.17.0 egg «dizzy»: two whole circles of the pointer around the middle of the mark within 3 s
    let spin = { a: null, sum: 0, at: 0 };
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = stage.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < 10) return; // too near the middle to read a direction
      const a = Math.atan2(dy, dx), t0 = now();
      if (spin.a === null || t0 - spin.at > 3000) spin = { a, sum: 0, at: t0 };
      let d = a - spin.a;
      if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
      spin.a = a; spin.sum += d;
      if (Math.abs(spin.sum) >= 4 * Math.PI) { spin = { a: null, sum: 0, at: 0 }; playEgg('dizzy'); }
    });
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
      // 0.17.0: it also breathes (4 whole breaths in the 14 s loop, so the loop stays seamless): alive while it waits
      return { transform: `translateY(${(Math.sin(tau * tt / 7) * 6).toFixed(2)}px) rotateX(${(Math.sin(tau * tt / 14) * 4).toFixed(3)}deg) rotateY(${(Math.sin(tau * tt / (14 / 3) + 1) * 6).toFixed(3)}deg) scale(${(1 + Math.sin(tau * tt / 3.5) * 0.014).toFixed(4)}, ${(1 - Math.sin(tau * tt / 3.5) * 0.01).toFixed(4)})` };
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
    eggs: () => Object.entries(EGGS).map(([id, [name, ms]]) => ({ id, name, ms })), playEgg,
    frames: (id) => { const egg = EGGS[id]; const ms = TABLE[id]?.[2] ?? egg?.[1]; return ms ? (egg ? egg[2](ms) : BUILD[id](ms)).map((a) => ({ ...a })) : null; },
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
