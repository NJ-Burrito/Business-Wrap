"""Business-Wrap brand v2: writes motion/logo-loop/index.html (HyperFrames, 512x512, 5 s loop) from the mark geometry.

    uv run --with fonttools --with uharfbuzz python brand/v2/tools/build_logo_loop.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_logo import BAND, LEFT, LINES, RIGHT  # noqa: E402

PROJ = Path(__file__).resolve().parent.parent / "motion" / "logo-loop"
lines = "".join(f'<path class="ln" pathLength="20" d="M{a} {b}H{c}"/>' for a, b, c, _ in LINES)
JS = """
(() => {
  const ID = "bw-logo-loop", D = 5;
  const tl = gsap.timeline({ paused: true });
  // base state (t=0 == t=D): the book closed on its spine
  gsap.set("#pl", { scaleX: 0, transformOrigin: "100% 50%" });
  gsap.set("#pr", { scaleX: 0, transformOrigin: "0% 50%" });
  gsap.set(".ln", { strokeDasharray: 20, strokeDashoffset: 20 });
  gsap.set("#band", { scaleX: 0, transformOrigin: "0% 50%" });
  gsap.set("#spine", { scaleY: 0.2, opacity: 1 });
  tl.to("#spine", { scaleY: 1, duration: 0.3, ease: "power2.out" }, 0.1);
  tl.to(["#pl", "#pr"], { scaleX: 1, duration: 0.55, ease: "power3.out" }, 0.3);
  tl.to("#spine", { opacity: 0, duration: 0.2 }, 0.6);
  gsap.utils.toArray(".ln").forEach((l, i) => tl.to(l, { strokeDashoffset: 0, duration: 0.4, ease: "power2.out" }, 0.8 + (i % 3) * 0.12));
  tl.to("#band", { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 1.35);
  tl.fromTo("#glow", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.5);
  tl.to("#glow", { opacity: 0, duration: 0.8 }, 3.4);
  tl.to(".ln", { opacity: 0, duration: 0.25 }, 4.0);
  tl.to("#band", { scaleX: 0, transformOrigin: "100% 50%", duration: 0.35, ease: "power2.in" }, 4.0);
  tl.to(["#pl", "#pr"], { scaleX: 0, duration: 0.45, ease: "power3.in" }, 4.3);
  tl.to("#spine", { opacity: 1, scaleY: 0.2, duration: 0.3 }, 4.6);
  tl.set(".ln", { strokeDashoffset: 20, opacity: 1 }, 4.8);
  tl.set("#band", { transformOrigin: "0% 50%" }, 4.8);
  tl.set({}, {}, D);
  window.__timelines = window.__timelines || {};
  window.__timelines[ID] = tl;
})();
"""
html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=512, height=512" />
<title>Business-Wrap logo loop (5 s)</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:512px;height:512px;overflow:hidden;background:#0B1A16}}
#stage{{position:relative;width:512px;height:512px;overflow:hidden;background:radial-gradient(70% 70% at 50% 45%,#153429,#0B1A16 75%)}}
#glow{{position:absolute;left:96px;top:96px;width:320px;height:320px;border-radius:50%;background:radial-gradient(closest-side,rgba(200,240,74,.18),transparent)}}
#mark{{position:absolute;left:96px;top:96px;width:320px;height:320px;overflow:visible}}
.pg{{fill:#EEF2EA}}
.ln{{stroke:#0B1A16;stroke-width:3.6;stroke-linecap:round;fill:none}}
#band{{fill:#C8F04A;stroke:#C8F04A;stroke-width:1;stroke-linejoin:round}}
#spine{{fill:#C8F04A}}
</style>
</head>
<body>
<div id="stage" data-composition-id="bw-logo-loop" data-start="0" data-duration="5" data-fps="25" data-width="512" data-height="512">
  <div id="glow"></div>
  <svg id="mark" viewBox="0 0 64 64" aria-label="Business-Wrap">
    <rect id="spine" x="30.6" y="12" width="2.8" height="43" rx="1.4"/>
    <path class="pg" id="pl" d="{LEFT}"/><path class="pg" id="pr" d="{RIGHT}"/>{lines}<path id="band" d="{BAND}"/>
  </svg>
</div>
<script>{JS}</script>
</body>
</html>
"""
(PROJ / "index.html").write_text(html, encoding="utf-8", newline="\n")
print("ok")
