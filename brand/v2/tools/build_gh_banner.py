"""Business-Wrap brand v2: writes motion/github-banner/index.html (HyperFrames, 1280x640, 6 s loop) from the logo
geometry and the icon set, so the banner never drifts from the brand files.

    uv run --with fonttools --with uharfbuzz python brand/v2/tools/build_gh_banner.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_icons import ICONS  # noqa: E402
from build_logo import BAND, LEFT, LINES, RIGHT  # noqa: E402

V2 = Path(__file__).resolve().parent.parent
PROJ = V2 / "motion" / "github-banner"
CHIPS = [("harvest", "Harvest"), ("process-model", "Process model"), ("editor", "Editor"),
         ("pdf", "PDF"), ("docx", "DOCX"), ("mcp-server", "MCP server")]


def icon(n: str) -> str:
    body = ICONS[n][4].replace('fill="#C8F04A"', 'fill="none"')
    return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" '
            f'stroke-linejoin="round">{body}</svg>')


CSS = """
@font-face{font-family:"Thmanyah Sans";src:url("./assets/fonts/thmanyahsans-Medium.woff2") format("woff2");font-weight:500;font-display:block}
@font-face{font-family:"Thmanyah Sans";src:url("./assets/fonts/thmanyahsans-Bold.woff2") format("woff2");font-weight:700;font-display:block}
/* Business-Wrap v2 light tokens (brand/v2/tokens.css) */
:root{--bg:#F5F3EC;--surface:#FFFFFF;--ink:#0F231E;--muted:#4A5A55;--line:#D6D2C5;--green:#0B6B50;--lime:#C8F04A;--sans:"Thmanyah Sans",sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1280px;height:640px;overflow:hidden;background:var(--bg)}
#stage{position:relative;width:1280px;height:640px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--sans)}
.ruled{position:absolute;inset:0;background:repeating-linear-gradient(transparent 0 39px,rgba(15,35,30,.05) 39px 40px)}
.margin{position:absolute;left:0;top:0;width:8px;height:640px;background:var(--green)}
#markw{position:absolute;left:96px;top:96px;width:290px;height:290px}
#mark{width:290px;height:290px;overflow:visible}
#mark .pg{fill:var(--ink)}
#mark .ln{stroke:var(--bg);stroke-width:3.6;stroke-linecap:round;fill:none}
#mark .hl{fill:var(--lime);stroke:var(--lime);stroke-width:1;stroke-linejoin:round}
#shadow{position:absolute;left:122px;top:384px;width:238px;height:22px;border-radius:50%;background:radial-gradient(closest-side,rgba(15,35,30,.22),transparent)}
#wm{position:absolute;left:452px;top:130px;height:104px}
#wmAr{position:absolute;left:452px;top:250px;height:72px}
#tag{position:absolute;left:456px;top:350px;font-weight:700;font-size:27px;color:var(--muted);white-space:nowrap}
#row{position:absolute;left:96px;top:486px;display:flex;gap:14px;align-items:center}
.chip{position:relative;height:60px;padding:0 22px 0 16px;border-radius:16px;background:var(--surface);border:2px solid var(--line);display:flex;gap:10px;align-items:center;font-weight:700;font-size:21px;color:var(--ink);box-shadow:0 2px 4px rgba(15,35,30,.06),0 8px 20px rgba(15,35,30,.08);white-space:nowrap}
.chip svg{width:30px;height:30px;position:relative}
.chip span{position:relative}
.chip .fill{position:absolute;inset:-2px;border-radius:16px;background:var(--lime);opacity:0}
"""

JS = """
(() => {
  const ID = "bw-gh-banner", D = 6;
  const tl = gsap.timeline({ paused: true });
  const lns = gsap.utils.toArray("#mark .ln");
  // base state (t=0 == t=D): pages shown, no lines, no band, no chip lit
  lns.forEach((l, i) => gsap.set(l, { strokeDasharray: 20, strokeDashoffset: 20 }));
  gsap.set("#band", { scaleX: 0, transformOrigin: "0% 50%" });
  // the mark writes itself: each line from its page's reading start (pathLength 20 and the path direction carry it)
  lns.forEach((l, i) => tl.to(l, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, 0.25 + (i % 3) * 0.12));
  tl.to("#band", { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, 0.85);
  tl.fromTo("#markw", { y: 0 }, { y: -6, duration: D / 2, ease: "sine.inOut" }, 0).to("#markw", { y: 0, duration: D / 2, ease: "sine.inOut" }, D / 2);
  tl.fromTo("#shadow", { scale: 1, opacity: 1 }, { scale: .9, opacity: .7, duration: D / 2, ease: "sine.inOut" }, 0).to("#shadow", { scale: 1, opacity: 1, duration: D / 2, ease: "sine.inOut" }, D / 2);
  // the highlighter steps along the tool chain, one chip at a time
  gsap.utils.toArray(".chip").forEach((c, i) => {
    const t = 1.35 + i * 0.58, f = c.querySelector(".fill");
    tl.to(f, { opacity: 1, duration: 0.18, ease: "power2.out" }, t);
    tl.to(c, { y: -5, duration: 0.2, ease: "power2.out" }, t);
    tl.to(c, { y: 0, duration: 0.35, ease: "power2.inOut" }, t + 0.45);
    if (i < 5) tl.to(f, { opacity: 0.0, duration: 0.3, ease: "power2.in" }, t + 0.58);
  });
  tl.to(".chip:last-child .fill", { opacity: 0, duration: 0.3 }, 5.05);
  // the mark clears for the next loop
  tl.to(lns, { opacity: 0, duration: 0.3 }, 5.2);
  tl.to("#band", { opacity: 0, duration: 0.3 }, 5.2);
  tl.set(lns, { strokeDashoffset: 20, opacity: 1 }, 5.55);
  tl.set("#band", { scaleX: 0, opacity: 1 }, 5.55);
  tl.set({}, {}, D);
  window.__timelines = window.__timelines || {};
  window.__timelines[ID] = tl;
})();
"""


def main():
    lines = "".join(f'<path class="ln" pathLength="20" d="M{a} {b}H{c}"/>' for a, b, c, _ in LINES)
    chips = "".join(f'<div class="chip"><i class="fill"></i>{icon(n)}<span>{lab}</span></div>' for n, lab in CHIPS)
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1280, height=640" />
<title>Business-Wrap GitHub banner (6 s loop)</title>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>{CSS}</style>
</head>
<body>
<div id="stage" data-composition-id="bw-gh-banner" data-start="0" data-duration="6" data-fps="25" data-width="1280" data-height="640">
  <div class="ruled"></div><div class="margin"></div>
  <div id="shadow"></div>
  <div id="markw"><svg id="mark" viewBox="0 0 64 64" aria-label="Business-Wrap">
    <path class="pg" d="{LEFT}"/><path class="pg" d="{RIGHT}"/>{lines}<path class="hl" id="band" d="{BAND}"/>
  </svg></div>
  <img id="wm" src="./assets/logo/wordmark-en.svg" alt="Business-Wrap" />
  <img id="wmAr" src="./assets/logo/wordmark-ar.svg" alt="بزنس راب" />
  <div id="tag">Bilingual requirements documents from evidence.</div>
  <div id="row">{chips}</div>
</div>
<script>{JS}</script>
</body>
</html>
"""
    (PROJ / "index.html").write_text(html, encoding="utf-8", newline="\n")
    for n in ("wordmark-en.svg", "wordmark-ar.svg"):
        shutil.copy(V2 / "logo" / n, PROJ / "assets" / "logo" / n)
    print("ok", PROJ / "index.html")


if __name__ == "__main__":
    main()
