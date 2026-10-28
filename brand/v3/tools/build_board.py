"""Business-Wrap brand v3: the brand board, brand/v3/index.html (colour roles in light and dark, logo files, the
animated mark, the 22 icons playing, type, motion tokens, favicons and social images). One page for anyone reusing
the brand; it reads the generated files, so run build_tokens_v3.py, build_logo.py, build_icons.py and export_png.py first.

    python brand/v3/tools/build_board.py
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

V3 = Path(__file__).resolve().parent.parent
FONT = "../../fonts/nj-fonts/thmanyah"  # local, git-ignored; local() first so an installed face wins

FACES = [("Thmanyah Serif Display", 700, "thmanyahserifdisplay", "Bold"),
         ("Thmanyah Serif Text", 400, "thmanyahseriftext", "Regular"),
         ("Thmanyah Sans", 400, "thmanyahsans", "Regular"),
         ("Thmanyah Sans", 500, "thmanyahsans", "Medium"),
         ("Thmanyah Sans", 700, "thmanyahsans", "Bold")]

MOTION = [("--bw-dur-instant", "press"), ("--bw-dur-fast", "hover-in, small close, cap drop"),
          ("--bw-dur-base", "hover-out, dialog open, theme cross-fade"), ("--bw-dur-slow", "panel close, scroll reveal"),
          ("--bw-dur-page", "panel open, The Spine, icon move"), ("--bw-dur-story", "The Rule, logo build")]
EASES = [("--bw-ease-out", "every entrance and move"), ("--bw-ease-in", "only things leaving entirely"),
         ("--bw-ease-in-out", "The Spine, The Rule, reversible moves"), ("--bw-ease-spring", "small confirms only")]

LOGOS = [("mark.svg", "light"), ("mark-dark.svg", "dark"), ("mark-mono.svg", "light"), ("mark-small.svg", "light"),
         ("mark-small-dark.svg", "dark"), ("app-icon.svg", "light"),
         ("lockup-en.svg", "light"), ("lockup-en-dark.svg", "dark"), ("lockup-ar.svg", "light"), ("lockup-ar-dark.svg", "dark"),
         ("wordmark-en.svg", "light"), ("wordmark-ar.svg", "light"), ("lockup-en-mono.svg", "light"), ("lockup-ar-mono.svg", "light")]

CSS = """
%FACES%
:root { --ground-light: #fafaf9; --ground-dark: #001e3d; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { margin: 0; background: var(--bw-bg); color: var(--bw-ink); font: 400 17px/var(--bw-leading-body) var(--bw-font-ui);
  transition: background-color var(--bw-dur-base) var(--bw-ease-out), color var(--bw-dur-base) var(--bw-ease-out); }
.spine { position: fixed; inset-block: 0; inset-inline-start: 0; width: var(--bw-spine-w); background: var(--bw-band);
  transform-origin: 50% 0; animation: bw-grow var(--bw-dur-page) var(--bw-ease-in-out) backwards; z-index: 3; }
.spine::before { content: ""; position: absolute; inset-inline: 0; top: 0; height: 64px; background: var(--bw-accent);
  animation: bw-cap var(--bw-dur-fast) var(--bw-ease-spring) 380ms backwards; }
:root[data-theme="dark"] .spine { box-shadow: 1px 0 0 var(--bw-rule-strong); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .spine { box-shadow: 1px 0 0 var(--bw-rule-strong); } }
@keyframes bw-grow { from { transform: scaleY(0); } }
@keyframes bw-cap { from { transform: translateY(-6px); opacity: 0; } }
.wrap { width: min(1120px, 100% - 32px); margin-inline: auto; padding-inline-start: max(0px, var(--bw-spine-w) + 8px - 16px); }
header.mast { position: sticky; top: 0; z-index: 2; background: color-mix(in srgb, var(--bw-bg) 88%, transparent);
  backdrop-filter: blur(10px); border-bottom: 1px solid var(--bw-line); }
@media (prefers-reduced-transparency: reduce) { header.mast { background: var(--bw-bg); backdrop-filter: none; } }
.mast .wrap { display: flex; align-items: center; gap: 16px; min-height: 64px; flex-wrap: wrap; }
.mast nav { display: flex; gap: 4px; flex-wrap: wrap; margin-inline-start: auto; }
.mast nav a, .btn { display: inline-flex; align-items: center; min-height: var(--bw-target); padding-inline: 12px; border-radius: var(--bw-radius-sm);
  color: var(--bw-primary); text-decoration: none; font-weight: 500; }
.mast nav a:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
.btn { border: 1px solid var(--bw-line-strong); background: var(--bw-surface); color: var(--bw-ink); font: inherit; font-weight: 500; cursor: pointer;
  transition: background-color var(--bw-dur-base) var(--bw-ease-out), border-color var(--bw-dur-base) var(--bw-ease-out), transform var(--bw-dur-instant) var(--bw-ease-out); }
.btn:hover { border-color: var(--bw-primary); background: var(--bw-primary-wash); transition-duration: var(--bw-dur-fast); }
.btn:active { transform: scale(var(--bw-scale-press)); }
.lock { display: block; height: 30px; width: auto; }
.only-dark { display: none; }
:root[data-theme="dark"] .only-dark { display: block; } :root[data-theme="dark"] .only-light { display: none; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .only-dark { display: block; } :root:not([data-theme="light"]) .only-light { display: none; } }
h1, h2 { font-family: var(--bw-font-display); font-weight: 700; color: var(--bw-primary); letter-spacing: var(--bw-tracking-display);
  line-height: var(--bw-leading-tight); text-wrap: balance; }
h1 { font-size: clamp(2.25rem, 1.2rem + 3vw, 4rem); margin: 64px 0 16px; }
h2 { font-size: clamp(1.75rem, 1.2rem + 1.6vw, 2.5rem); margin: 0 0 8px; padding-bottom: 12px; border-bottom: 2px solid var(--bw-primary); }
h2 .no { color: var(--bw-accent-strong); margin-inline-end: .4em; }
h3 { font: 700 1.1rem/1.3 var(--bw-font-ui); margin: 24px 0 8px; }
section { padding-block: 56px 8px; scroll-margin-top: 72px; }
p.lead { font-size: 1.25rem; max-width: 60ch; color: var(--bw-ink-muted); }
.rule { background-image: linear-gradient(var(--bw-accent-rule), var(--bw-accent-rule)); background-repeat: no-repeat;
  background-size: 100% 3px; background-position: 0 100%; padding-bottom: .06em; }
html.motion .rule { animation: bw-rule var(--bw-dur-story) var(--bw-ease-in-out) 640ms backwards; }
@keyframes bw-rule { from { background-size: 0 3px; } }
.moves { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
.card { background: var(--bw-surface); border: 1px solid var(--bw-rule-strong); border-radius: var(--bw-radius-md); padding: 20px; box-shadow: var(--bw-shadow-1); }
.card.story { background: var(--bw-surface-2); }
.id { font: 700 .85rem/1 var(--bw-font-ui); color: var(--bw-accent-strong); letter-spacing: var(--bw-tracking-caps); }
table { width: 100%; border-collapse: collapse; font-size: .95rem; font-variant-numeric: tabular-nums; }
th { text-align: start; background: var(--bw-primary-soft); color: var(--bw-ink); border-bottom: 2px solid var(--bw-primary); padding: 10px; }
td { padding: 8px 10px; border-bottom: 1px solid var(--bw-line); vertical-align: middle; }
tbody tr:nth-child(even) { background: var(--bw-primary-wash); }
.tbl { overflow-x: auto; }
.sw { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.chip { width: 28px; height: 28px; border-radius: var(--bw-radius-sm); border: 1px solid var(--bw-line-strong); flex: none; }
code { font-family: var(--bw-font-mono); font-size: .88em; }
.logos { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.logo { border: 1px solid var(--bw-rule-strong); border-radius: var(--bw-radius-md); overflow: hidden; display: flex; flex-direction: column; }
.logo .g { display: grid; place-items: center; height: 140px; padding: 16px; }
.logo .g.light { background: var(--ground-light); } .logo .g.dark { background: var(--ground-dark); }
.logo .g.light.mono { color: #003c7a; }
.logo img { max-width: 100%; max-height: 96px; }
.logo a { padding: 10px 12px; color: var(--bw-primary); font-size: .9rem; min-height: var(--bw-target); display: flex; align-items: center; background: var(--bw-surface); }
.anim { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.anim .tile { width: 160px; height: 160px; display: grid; place-items: center; border-radius: var(--bw-radius-lg); background: var(--ground-light); border: 1px solid var(--bw-rule-strong); }
.anim .tile.dark { background: var(--ground-dark); }
.anim svg { width: 112px; height: 112px; }
.icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.ic { background: var(--bw-surface); border: 1px solid var(--bw-rule-strong); border-radius: var(--bw-radius-md); padding: 16px 12px; text-align: center;
  color: var(--bw-primary); transition: transform var(--bw-dur-base) var(--bw-ease-out), box-shadow var(--bw-dur-base) var(--bw-ease-out); }
.ic:hover, .ic:focus-visible { transform: translateY(-2px); box-shadow: var(--bw-shadow-2); transition-duration: var(--bw-dur-fast); }
.ic .bw-i { width: 40px; height: 40px; display: block; margin: 4px auto 10px; }
.ic b { display: block; color: var(--bw-ink); font-weight: 500; font-size: .95rem; }
.ic span { display: block; color: var(--bw-ink-muted); font-size: .9rem; line-height: 1.8; }
.ic code { color: var(--bw-ink-faint); font-size: .75rem; }
.sizes { display: flex; gap: 20px; align-items: end; color: var(--bw-primary); margin-top: 16px; flex-wrap: wrap; }
.type p { margin: 0 0 4px; }
.type .disp { font: 700 3rem/1.15 var(--bw-font-display); color: var(--bw-primary); letter-spacing: var(--bw-tracking-display); }
.type .txt { font: 400 1.25rem/1.7 var(--bw-font-text); }
.type .ui { font: 500 1.1rem/1.7 var(--bw-font-ui); }
.type [lang="ar"] { letter-spacing: 0; line-height: 1.8; }
.mot td:first-child { width: 34%; }
.track { position: relative; height: 12px; background: var(--bw-primary-wash); border-radius: var(--bw-radius-pill); overflow: hidden; min-width: 140px; }
.track i { position: absolute; inset: 0; background: var(--bw-primary); border-radius: inherit; transform-origin: 0 50%; transform: scaleX(0); }
.track.gold i { background: var(--bw-accent); }
.play .track i { transform: scaleX(1); transition: transform var(--d) var(--e); }
.pngs { display: flex; gap: 16px; flex-wrap: wrap; align-items: end; }
.pngs img { display: block; border: 1px solid var(--bw-rule-strong); border-radius: var(--bw-radius-sm); }
.social { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.social img { width: 100%; height: auto; border: 1px solid var(--bw-rule-strong); border-radius: var(--bw-radius-md); display: block; }
footer { margin-top: 72px; background: var(--bw-band); color: #fafaf9; padding-block: 32px; }
footer a { color: #fafaf9; min-height: var(--bw-target); display: inline-flex; align-items: center; }
footer a:hover { color: var(--bw-accent); }
.dodont { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 640px) { .dodont { grid-template-columns: 1fr; } }
.ok { color: var(--bw-success); font-weight: 700; } .no-go { color: var(--bw-signal); font-weight: 700; }
ul.plain { padding-inline-start: 1.1em; margin: 8px 0; }
@media (forced-colors: active) { .spine { background: CanvasText; } .spine::before { background: Highlight; } }
"""

JS = """
(function () {
  var root = document.documentElement;
  try { var t = localStorage.getItem('bw-board-theme'); if (t) root.dataset.theme = t; } catch (e) {}
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('motion');
  var btn = document.getElementById('theme');
  function label() {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    btn.textContent = dark ? 'Light theme' : 'Dark theme';
    btn.setAttribute('aria-pressed', String(dark));
  }
  btn.addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light' : 'dark';
    var go = function () { root.dataset.theme = next; label(); };
    if (document.startViewTransition && root.classList.contains('motion')) document.startViewTransition(go); else go();
    try { localStorage.setItem('bw-board-theme', next); } catch (e) {}
  });
  label();
  document.getElementById('replay').addEventListener('click', function () {
    document.querySelectorAll('.anim svg').forEach(function (s) { var c = s.cloneNode(true); s.replaceWith(c); });
  });
  document.querySelectorAll('[data-play]').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.getElementById(b.dataset.play);
      t.classList.remove('play'); void t.offsetWidth; t.classList.add('play');
    });
  });
  var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-inview'); io.unobserve(e.target); } });
  }, { threshold: 0.3 });
  if (io) document.querySelectorAll('.ic').forEach(function (n) { io.observe(n); });
})();
"""


def faces() -> str:
    return "\n".join(
        f'@font-face {{ font-family: "{fam}"; font-weight: {w}; font-display: swap; '
        f'src: local("{fam}"), url("{FONT}/{d}/woff2/{d}-{f}.woff2") format("woff2"); }}' for fam, w, d, f in FACES)


def inline_svg(p: Path) -> str:
    s = p.read_text(encoding="utf-8").strip()
    return re.sub(r"<title>.*?</title>", "", s)


def main():
    light = json.loads((V3 / "tokens-v3.json").read_text(encoding="utf-8"))
    dark = json.loads((V3 / "dark/tokens-v3.dark.json").read_text(encoding="utf-8"))
    ramps = light["color"]["ramp"]

    def step(alias: str):
        ref = alias.strip("{}").split(".")
        if ref[1] == "white":
            return "white", "#ffffff"
        return f"{ref[2]}.{ref[3]}", ramps[ref[2]][ref[3]]["$value"]["hex"]

    rows = []
    for name, node in light["color"]["role"].items():
        ls, lh = step(node["$value"])
        ds, dh = step(dark["color"]["role"][name]["$value"])
        rows.append(f'<tr><td><code>--bw-{name}</code></td>'
                    f'<td><span class="sw"><span class="chip" style="background:{lh}"></span>{ls} <code>{lh}</code></span></td>'
                    f'<td><span class="sw"><span class="chip" style="background:{dh}"></span>{ds} <code>{dh}</code></span></td>'
                    f'<td>{html.escape(node["$description"])}</td></tr>')
    pairs = light["$extensions"]["business-wrap"]["contrastPairs"]
    icons = json.loads((V3 / "icons/icons.json").read_text(encoding="utf-8"))["icons"]
    tiles = "".join(
        f'<div class="ic" tabindex="0">{inline_svg(V3 / "icons" / i["file"])}<b>{html.escape(i["label"]["en"])}</b>'
        f'<span lang="ar" dir="rtl">{html.escape(i["label"]["ar"])}</span><code>{i["name"]} · {i["animation"]}</code></div>' for i in icons)
    first = inline_svg(V3 / "icons/harvest.svg")
    sizes = "".join(first.replace('width="24" height="24"', f'width="{px}" height="{px}" style="width:{px}px;height:{px}px"') for px in (16, 18, 20, 24, 32, 48))
    logos = "".join(
        f'<figure class="logo" style="margin:0"><div class="g {g}{" mono" if "mono" in n else ""}"><img src="logo/{n}" alt="{n}"></div>'
        f'<a href="logo/{n}" download>{n}</a></figure>' for n, g in LOGOS)
    anim = inline_svg(V3 / "logo/mark-animated.svg")
    mot = "".join(
        f'<tr><td><code>{t}</code><br><small>{u}</small></td><td><div class="track" id="m{i}" style="--d:var({t});--e:var(--bw-ease-out)"><i></i></div></td>'
        f'<td><button class="btn" type="button" data-play="m{i}">Play</button></td></tr>' for i, (t, u) in enumerate(MOTION))
    eases = "".join(
        f'<tr><td><code>{t}</code><br><small>{u}</small></td><td><div class="track gold" id="e{i}" style="--d:var(--bw-dur-story);--e:var({t})"><i></i></div></td>'
        f'<td><button class="btn" type="button" data-play="e{i}">Play</button></td></tr>' for i, (t, u) in enumerate(EASES))
    favs = "".join(f'<figure style="margin:0;text-align:center"><img src="favicon/icon-{s}.png" width="{s}" height="{s}" alt="icon {s} px">'
                   f'<figcaption><small>{s}</small></figcaption></figure>' for s in (16, 32, 48, 64, 128))
    page = f"""<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Business-Wrap brand v3</title>
<meta name="description" content="Business-Wrap brand v3, Cover and Rule: colour roles, logo files, icons, type and motion tokens.">
<meta name="theme-color" content="#fafaf9" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#001e3d" media="(prefers-color-scheme: dark)">
<link rel="icon" href="favicon/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="tokens-v3.css"><link rel="stylesheet" href="icons/icons.css">
<style>{CSS.replace("%FACES%", faces()).strip()}</style></head>
<body><div class="spine" aria-hidden="true"></div>
<header class="mast"><div class="wrap">
<a href="#top" aria-label="Business-Wrap brand board, top"><img class="lock only-light" src="logo/lockup-en.svg" width="180" height="30" alt=""><img class="lock only-dark" src="logo/lockup-en-dark.svg" width="180" height="30" alt=""></a>
<nav aria-label="Sections"><a href="#colour">Colour</a><a href="#logo">Logo</a><a href="#icons">Icons</a><a href="#type">Type</a><a href="#motion">Motion</a><a href="#files">Files</a></nav>
<button class="btn" id="theme" type="button" aria-pressed="false">Dark theme</button>
</div></header>
<main class="wrap" id="top">
<h1>Brand v3: Cover <span class="rule">and Rule</span></h1>
<p class="lead">The tool dresses like the documents it makes: paper ground, a navy spine with a gold cap on the start side, chapter headings in navy, and one gold rule that marks what matters. Every colour is a step of the documents' own palette; nothing is retuned.</p>
<div class="moves">
<div class="card story"><span class="id">MOVE 1</span><h3>The Spine</h3><p>A navy band on the inline-start edge with a gold cap at its top. It grows top to bottom when a page or panel opens, and it changes sides with the language (English left, Arabic right).</p></div>
<div class="card story"><span class="id">MOVE 2</span><h3>The Rule</h3><p>A short gold rule that draws under one phrase from its reading start. Once per view. It marks words; it never fills behind them, so text is readable from the first frame.</p></div>
</div>

<section id="colour"><h2><span class="no">01</span>Colour roles</h2>
<p>Light and dark come from the same ramps. Gold is a mark, never text on light grounds: gold words use <code>--bw-accent-strong</code>. {len(pairs)} contrast pairs pass in both themes (<a href="contrast-v3.md">contrast-v3.md</a>, gate: <code>python palette/check.py</code>).</p>
<div class="tbl"><table><thead><tr><th>Role</th><th>Light</th><th>Dark</th><th>Use</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
</section>

<section id="logo"><h2><span class="no">02</span>Logo</h2>
<p>The mark is a document cover: sheet, spine, gold cap, two ink lines (the second ends at the end: the other edition reads the other way) and The Rule. It is never mirrored for Arabic; only the lockup order changes. Clear space: the spine width on every side. Minimum: mark 16 px, lockup 24 px high.</p>
<h3>Animated mark (runs once; still under reduced motion)</h3>
<div class="anim"><div class="tile">{anim}</div><div class="tile dark" data-theme="dark">{anim}</div>
<button class="btn" id="replay" type="button">Replay the build</button></div>
<h3>Files</h3><div class="logos">{logos}</div>
</section>

<section id="icons"><h2><span class="no">03</span>Icons</h2>
<p>22 icons on a 24 grid, 1.75 stroke, round caps, <code>currentColor</code>, one gold part and one moving part. Hover, focus or scroll one into view to play its move (once, {html.escape("520 ms")}). Where v2 had a marker block behind a line, v3 draws The Rule under it.</p>
<div class="icons">{tiles}</div>
<div class="sizes" aria-label="Sizes 16 to 48 px">{sizes}</div>
</section>

<section id="type" class="type"><h2><span class="no">04</span>Type</h2>
<p>Thmanyah only: Serif Display for headings, Serif Text for long reading, Sans for the interface. Arabic is never tracked and reads at 1.8 leading.</p>
<div class="card"><p class="disp">Evidence in. One document, two languages.</p><p class="disp" lang="ar" dir="rtl">أدلة تدخل. وثيقة واحدة بلغتين.</p>
<p class="txt">Serif Text: the page you edit is the page that prints.</p><p class="txt" lang="ar" dir="rtl">الصفحة التي تحررها هي الصفحة التي تطبع.</p>
<p class="ui">Sans 500: Install · How it works · Features</p><p class="ui" lang="ar" dir="rtl">التثبيت · كيف يعمل · المزايا</p></div>
</section>

<section id="motion"><h2><span class="no">05</span>Motion</h2>
<p>One system for the site, the editor and the media. Open slower than close; hover-in fast, hover-out base; only <code>transform</code>, <code>opacity</code>, <code>filter</code> and <code>clip-path</code> move. Under reduced motion every duration is 1 ms.</p>
<div class="tbl"><table class="mot"><thead><tr><th>Duration</th><th>Demo</th><th></th></tr></thead><tbody>{mot}</tbody></table></div>
<div class="tbl" style="margin-top:16px"><table class="mot"><thead><tr><th>Easing (900 ms)</th><th>Demo</th><th></th></tr></thead><tbody>{eases}</tbody></table></div>
</section>

<section id="files"><h2><span class="no">06</span>Favicons and social images</h2>
<div class="pngs">{favs}<figure style="margin:0;text-align:center"><img src="favicon/maskable-512.png" width="96" height="96" alt="maskable icon"><figcaption><small>maskable</small></figcaption></figure></div>
<h3>Social card and og images</h3>
<div class="social"><img src="social/social-card.png" width="1280" height="640" alt="Social card: Evidence in. One document, two languages." loading="lazy">
<img src="social/og.png" width="1200" height="630" alt="og image, English" loading="lazy"><img src="social/og-ar.png" width="1200" height="630" alt="og image, Arabic" loading="lazy"></div>
<h3>Do and don't</h3>
<div class="dodont"><div class="card"><p class="ok">Do</p><ul class="plain"><li>Use the files as they are; dark files on <code>#001e3d</code> or darker.</li><li>Keep gold for one mark per view: The Rule or one gold fill.</li><li>Pair every coloured status with a word and an icon.</li></ul></div>
<div class="card"><p class="no-go">Don't</p><ul class="plain"><li>Set words in gold on light grounds.</li><li>Mirror the mark for Arabic, stretch it or add effects.</li><li>Change a text colour during an animation.</li></ul></div></div>
<p>Rules in full: <a href="BRAND.md">BRAND.md</a> · <a href="BRAND.ar.md">BRAND.ar.md</a></p>
</section>
</main>
<footer><div class="wrap"><img src="logo/lockup-en-dark.svg" width="180" height="30" alt="Business-Wrap"><p>Brand v3, generated by <code>brand/v3/tools/build_board.py</code>. MIT. Fonts: see NOTICE.</p></div></footer>
<script>{JS.strip()}</script>
</body></html>
"""
    (V3 / "index.html").write_text(page, encoding="utf-8", newline="\n")
    print("index.html written")


if __name__ == "__main__":
    main()
