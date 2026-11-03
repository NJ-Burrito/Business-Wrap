// Business-Wrap brand v3 · spring easings as CSS linear() (0.17.0 motion lane).
// A damped spring (mass 1) is simulated from 0 to rest at 1; its curve is sampled into a linear() easing and the time it takes to
// settle (|x-1| and |v| under 0.004, |v| under 0.02: the eye sees no motion below that) is reported, so the CSS duration that goes with each easing is computed, never typed (R16).
// Technique: Josh Comeau, "Linear timing function" (joshwcomeau.com/animation/linear-timing-function), Chrome for Developers,
// "linear() easing function" (developer.chrome.com/docs/css-ui/css-linear-easing-function): Chrome/Edge 113, Firefox 112, Safari 17.2.
//   node brand/v3/tools/spring_easing.mjs          prints the tokens as CSS custom properties
//   node brand/v3/tools/spring_easing.mjs --json   prints { name: { easing, ms, overshoot } }
export const SPRINGS = {
  // name: [stiffness, damping]  (what each is for is in editor/ext/40-icon-motion.css)
  pop: [320, 15],   // a lively bounce: an icon's press release, the watermark's landings
  soft: [210, 19],  // a gentle settle: hover poses, the logo's lift
  snap: [520, 26],  // quick and nearly critical: focus, small parts
};

export function spring(k, c, { points = 32 } = {}) {
  const dt = 1 / 2000;
  let x = 0, v = 0, t = 0, peak = 0, settledAt = 0;
  const xs = [];
  for (let i = 0; i < 20000; i += 1) {
    const a = k * (1 - x) - c * v;
    v += a * dt; x += v * dt; t += dt;
    xs.push(x);
    peak = Math.max(peak, x);
    if (Math.abs(1 - x) < 0.004 && Math.abs(v) < 0.02) { if (!settledAt) settledAt = t; if (t > settledAt + 0.02) break; } else settledAt = 0;
  }
  const n = xs.length;
  const stops = Array.from({ length: points + 1 }, (_, i) => (i === points ? 1 : xs[Math.min(n - 1, Math.round((i / points) * (n - 1)))]));
  stops[0] = 0;
  const easing = `linear(${stops.map((s) => +s.toFixed(4)).join(', ')})`;
  return { easing, ms: Math.round(t * 1000), overshoot: +((peak - 1) * 100).toFixed(1) };
}

export const tokens = () => Object.fromEntries(Object.entries(SPRINGS).map(([name, [k, c]]) => [name, spring(k, c)]));

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('spring_easing.mjs')) {
  const t = tokens();
  if (process.argv.includes('--json')) console.log(JSON.stringify(t, null, 1));
  else for (const [name, s] of Object.entries(t)) console.log(`--bw-spring-${name}: ${s.easing}; /* settles in ${s.ms} ms, overshoot ${s.overshoot} % */`);
}
