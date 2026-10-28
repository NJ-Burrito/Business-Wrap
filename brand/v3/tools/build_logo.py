"""Business-Wrap brand v3 "Cover & Rule": the mark, the outlined wordmarks and lockups (EN, AR), the animated mark,
the app icon and the favicon SVG.

    uv run --no-project --with fonttools --with uharfbuzz python brand/v3/tools/build_logo.py [--fonts <dir>]

Fonts: Thmanyah Serif Display 700 (thmanyahserifdisplay-Bold.otf), looked up in --fonts, BW_FONT_DIR,
fonts/nj-fonts/thmanyah/thmanyahserifdisplay/otf in the repo, then the OS user font folder.
The text is converted to outlines: no font file and no font name is needed to show the logo.
Every colour is a ramp step of palette/tokens.json (the SRS palette), or currentColor in the mono files.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

V3 = Path(__file__).resolve().parent.parent
REPO = V3.parent.parent
OUT = V3 / "logo"
FAV = V3 / "favicon"

# ramp steps (palette/tokens.json): nothing here is invented
BAND = "#001e3d"      # primary.950  the spine, the dark ground
NAVY = "#003c7a"      # primary.800  sheet edge (light), wordmark (light)
PAPER = "#fafaf9"     # neutral.50   the sheet, wordmark (dark), keyline (dark)
INK = "#1b1813"       # neutral.900  the text lines
GOLD = "#be9a41"      # accent.500   the cap; The Rule on dark
GOLD_RULE = "#9c7e36"  # accent.600  The Rule on light (3.69:1 on paper, a graphic, never text)

# ---- the mark: "Cover", 64 grid (frozen geometry, DESIGN c.1) --------------------------------------
SHEET = "M18 6H50Q54 6 54 10V54Q54 58 50 58H18Q14 58 14 54V10Q14 6 18 6Z"
SPINE = "M18 6H26V58H18Q14 58 14 54V10Q14 6 18 6Z"
CAP = "M18 6H26V14H14V10Q14 6 18 6Z"
SPINE_MONO = "M14 15.5H26V58H18Q14 58 14 54Z"  # mono: the spine starts under a 1.5 gap, so the cap stays a shape of its own
L1, L2, RULE = "M31 22H48", "M38 30H48", "M31 41H41"
RULE_SMALL = "M31 32H48"

MODES = {
    #        sheet edge, edge width, rule colour
    "light": (NAVY, 2, GOLD_RULE),
    "dark": (PAPER, 2.5, GOLD),
}


def svg(w: float, h: float, body: str, title: str, cls: str = "bw-logo") -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" class="{cls}" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" '
            f'role="img" aria-label="{title}"><title>{title}</title>{body}</svg>\n')


def mark_body(mode: str, small: bool = False) -> str:
    if mode == "mono":
        c = "currentColor"
        body = (f'<path class="sheet" d="{SHEET}" fill="none" stroke="{c}" stroke-width="2.5"/>'
                f'<path class="spine" d="{SPINE_MONO}" fill="{c}"/>'
                f'<path class="cap" d="{CAP}" fill="{c}"/>')
        if small:
            return body + f'<path class="rule" d="{RULE_SMALL}" stroke="{c}" stroke-width="5" stroke-linecap="round"/>'
        return body + (f'<path class="ln l1" d="{L1}" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
                       f'<path class="ln l2" d="{L2}" stroke="{c}" stroke-width="3" stroke-linecap="round"/>'
                       f'<path class="rule" d="{RULE}" stroke="{c}" stroke-width="3" stroke-linecap="round"/>')
    edge, ew, rule = MODES[mode]
    if small:
        ew += 1  # small sizes need the keyline heavier (ref: 3 against 2)
    body = (f'<path class="sheet" d="{SHEET}" fill="{PAPER}" stroke="{edge}" stroke-width="{ew:g}"/>'
            f'<path class="spine" d="{SPINE}" fill="{BAND}"/>'
            f'<path class="cap" d="{CAP}" fill="{GOLD}"/>')
    if small:
        return body + f'<path class="rule" d="{RULE_SMALL}" stroke="{rule}" stroke-width="5" stroke-linecap="round"/>'
    return body + (f'<path class="ln l1" d="{L1}" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
                   f'<path class="ln l2" d="{L2}" stroke="{INK}" stroke-width="3" stroke-linecap="round"/>'
                   f'<path class="rule" d="{RULE}" stroke="{rule}" stroke-width="3" stroke-linecap="round"/>')


# ---- outlined text ---------------------------------------------------------------------------------
class Face:
    def __init__(self, path: Path):
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.upm = self.tt["head"].unitsPerEm
        self.hbfont = hb.Font(hb.Face(hb.Blob.from_file_path(str(path))))
        self.names = self.tt.getGlyphOrder()

    def shape(self, text: str, rtl: bool):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        buf.direction = "rtl" if rtl else "ltr"
        hb.shape(self.hbfont, buf, {"kern": True, "liga": True})
        x, out = 0, []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((self.names[info.codepoint], x + pos.x_offset, pos.y_offset, info.cluster))
            x += pos.x_advance
        return out

    def outline(self, text: str, size: float, x0: float, baseline: float, rtl: bool, keep=None):
        """(svg path d, bounds xmin, ymin, xmax, ymax) of the glyphs whose cluster passes keep()."""
        s = size / self.upm
        pen = SVGPathPen(self.gs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        bp = BoundsPen(self.gs)
        for name, gx, gy, cl in self.shape(text, rtl):
            if keep is None or keep(cl):
                m = (s, 0, 0, -s, x0 + gx * s, baseline - gy * s)
                self.gs[name].draw(TransformPen(pen, m))
                self.gs[name].draw(TransformPen(bp, m))
        return pen.getCommands(), bp.bounds


def font_path(arg: str | None) -> Path:
    name = "thmanyahserifdisplay-Bold.otf"
    for c in (arg, os.environ.get("BW_FONT_DIR"), REPO / "fonts/nj-fonts/thmanyah/thmanyahserifdisplay/otf",
              os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft/Windows/Fonts")):
        if c and (Path(c) / name).exists():
            return Path(c) / name
    raise SystemExit(f"FAILED: no {name}; pass --fonts <dir> or set BW_FONT_DIR")


# Layout (DESIGN c.2): mark then wordmark (EN), wordmark then mark (AR); gap = 0.4 x the drawn mark width (40);
# Latin cap height = 0.42 x the mark height (64). The Rule sits 0.12 em under the baseline and skips the ink
# of descenders (a mask of the word, stroked), so it never cuts a letter.
MARK_W, MARK_X0 = 40.0, 14.0      # the sheet spans x 14..54 of the 64 box
GAP = 0.4 * MARK_W
CAP_H = 0.42 * 64
WORD = {"en": ("Business-Wrap", "Wrap", 384.0), "ar": ("بزنس راب", "راب", 320.0)}
SKIP = 2.6                        # skip-ink halo around glyphs, in viewBox units
RULE_W = 3.0                      # the mark's own rule weight, so lockup and mark read as one family
EDGE = 1.5                        # breathing room at the viewBox edges (keyline half-width plus anti-alias)


def wordmark_parts(face: Face, lang: str, size: float, x0: float, baseline: float):
    text, hit, _ = WORD[lang]
    rtl = lang == "ar"
    start = text.index(hit)
    d, bounds = face.outline(text, size, x0, baseline, rtl)
    _, (hx1, _, hx2, hy2) = face.outline(text, size, x0, baseline, rtl, keep=lambda c: c >= start)
    # Latin: 0.12 em under the baseline, skipping the descender ink. Arabic: under the deepest descender of the
    # word (the tail of the ra and the dot of the ba sit low; a rule through them would break into fragments)
    rule_y = baseline + 0.12 * size if not rtl else hy2 + SKIP + RULE_W / 2
    return d, bounds, (hx1, hx2, rule_y)


def fit(face: Face, lang: str, room: float):
    """Font size: the cap-height rule for Latin, capped by the room left in the frozen viewBox; Arabic matches the
    Latin size so the two lockups read as one family, capped the same way."""
    text, _, _ = WORD[lang]
    probe = 100.0
    cap = -face.outline("H", probe, 0, 0, False)[1][1]
    size = CAP_H / cap * probe
    _, (xmin, _, xmax, _) = face.outline(text, size, 0, 0, lang == "ar")
    if xmax - xmin > room:
        size *= room / (xmax - xmin)
    return size, cap / probe


def word_svg(face: Face, lang: str, mode: str, size: float, x0: float, baseline: float, uid: str):
    d, (bx1, by1, bx2, by2), (hx1, hx2, ry) = wordmark_parts(face, lang, size, x0, baseline)
    fill = {"light": NAVY, "dark": PAPER, "mono": "currentColor"}[mode]
    rule = {"light": GOLD_RULE, "dark": GOLD, "mono": "currentColor"}[mode]
    r = RULE_W / 2
    mask = (f'<mask id="{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">'
            f'<rect x="-10" y="-10" width="2000" height="200" fill="#fff"/>'
            f'<path d="{d}" fill="#000" stroke="#000" stroke-width="{SKIP * 2:g}" stroke-linejoin="round"/></mask>')
    word = f'<path class="word" d="{d}" fill="{fill}"/>'
    rl = (f'<path class="rule" d="M{hx1 + r:.2f} {ry:.2f}H{hx2 - r:.2f}" stroke="{rule}" stroke-width="{RULE_W:g}" '
          f'stroke-linecap="round" mask="url(#{uid})"/>')
    return f"<defs>{mask}</defs>{word}{rl}", (bx1, by1, bx2, max(by2, ry + r))


def base_line(face: Face, lang: str, size: float, H: float) -> float:
    """Latin: the cap height centred on the mark's centre line. Arabic: the block from the top of the word to the
    bottom of The Rule centred (Arabic has no cap height to centre)."""
    if lang == "en":
        return H / 2 + -face.outline("H", size, 0, 0, False)[1][1] / 2
    _, (_, top, _, _), (_, _, ry) = wordmark_parts(face, lang, size, 0, 0)
    return H / 2 - (top + ry + RULE_W / 2) / 2


def lockup(face: Face, lang: str, mode: str, size: float) -> str:
    text, _, W = WORD[lang]
    rtl = lang == "ar"
    H = 64.0
    uid = f"bw-{lang}-{mode}-skip"
    probe = face.outline(text, size, 0, 0, rtl)[1]
    tw = probe[2] - probe[0]
    baseline = base_line(face, lang, size, H)
    total = MARK_W + GAP + tw
    # aligned to the reading start, so the mark sits on the masthead's start edge: EN left, AR right
    left = EDGE if not rtl else W - EDGE - total
    if rtl:
        tx = left - probe[0]
        mx = left + tw + GAP - MARK_X0
    else:
        mx = left - MARK_X0
        tx = left + MARK_W + GAP - probe[0]
    words, _ = word_svg(face, lang, mode, size, tx, baseline, uid)
    mark = f'<g class="mark" transform="translate({mx:.2f} 0)">{mark_body(mode)}</g>'
    title = "بزنس راب" if rtl else "Business-Wrap"
    return svg(W, H, mark + words, title)


def wordmark(face: Face, lang: str, mode: str, size: float) -> str:
    text, _, _ = WORD[lang]
    rtl = lang == "ar"
    probe = face.outline(text, size, 0, 0, rtl)[1]
    H = 64.0
    baseline = base_line(face, lang, size, H)
    tx = EDGE - probe[0]
    W = round(probe[2] - probe[0] + 2 * EDGE, 1)
    words, _ = word_svg(face, lang, mode, size, tx, baseline, f"bw-w{lang}-{mode}-skip")
    return svg(W, H, words, "بزنس راب" if rtl else "Business-Wrap")


def mark_file(mode: str, small: bool = False) -> str:
    return svg(64, 64, mark_body(mode, small), "Business-Wrap")


def app_icon(small: bool = False, scale: float = 0.72, rounded: bool = True) -> str:
    """The tile: navy ground, r 22 %, the dark mark centred at 72 % (the sheet is optically centred: it sits at x 14..54)."""
    off_x = 32 - (MARK_X0 + MARK_W / 2) * scale
    off_y = 32 - 32 * scale
    rx = 64 * 0.22 if rounded else 0
    body = (f'<rect class="tile" width="64" height="64" rx="{rx:g}" fill="{BAND}"/>'
            f'<g transform="translate({off_x:.2f} {off_y:.2f}) scale({scale:g})">{mark_body("dark", small)}</g>')
    return svg(64, 64, body, "Business-Wrap")


def favicon() -> str:
    """The small mark; follows the system scheme (a favicon has no host colour to follow)."""
    style = (f"<style>.sheet{{stroke:{NAVY}}}.rule{{stroke:{GOLD_RULE}}}"
             f"@media (prefers-color-scheme: dark){{.sheet{{stroke:{PAPER}}}.rule{{stroke:{GOLD}}}}}</style>")
    body = (style + f'<path class="sheet" d="{SHEET}" fill="{PAPER}" stroke-width="3"/>'
            f'<path class="spine" d="{SPINE}" fill="{BAND}"/><path class="cap" d="{CAP}" fill="{GOLD}"/>'
            f'<path class="rule" d="{RULE_SMALL}" stroke-width="5" stroke-linecap="round"/>')
    return svg(64, 64, body, "Business-Wrap")


def animated() -> str:
    """Runs once on load (DESIGN c.3), never loops: sheet 0 ms, spine 80, cap 440, line 1 520, line 2 600 (from its
    end), The Rule 760 for 900 ms (total 1.66 s). The resting style is the drawn mark; the keyframes only run from the
    hidden state (fill-mode backwards), so reduced motion, .bw-still and any renderer without CSS animation show it
    drawn. .bw-reveal on the svg (or a parent) replays; hover or focus on the brand link replays The Rule only.
    Colours: light by default; dark when the system is dark (standalone) or when an ancestor carries
    data-theme="dark" (inlined). Every selector is scoped to .bw-logo-anim so inlining never leaks."""
    S = ".bw-logo-anim"
    css = f"""
{S} .sheet{{fill:{PAPER};stroke:{NAVY};stroke-width:2;transform-box:fill-box;transform-origin:50% 50%}}
{S} .spine{{fill:{BAND};transform-box:fill-box;transform-origin:50% 0}}
{S} .cap{{fill:{GOLD};transform-box:fill-box}}
{S} .ln{{stroke:{INK};stroke-width:3;stroke-linecap:round;fill:none;stroke-dasharray:1 1}}
{S} .rule{{stroke:{GOLD_RULE};stroke-width:3;stroke-linecap:round;fill:none;transform-box:fill-box;transform-origin:0 50%}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]) {S} .sheet,{S}:root .sheet{{stroke:{PAPER};stroke-width:2.5}}:root:not([data-theme="light"]) {S} .rule,{S}:root .rule{{stroke:{GOLD}}}}}
[data-theme="dark"] {S} .sheet{{stroke:{PAPER};stroke-width:2.5}}[data-theme="dark"] {S} .rule{{stroke:{GOLD}}}
@keyframes bw-sheet{{from{{opacity:0;transform:scale(.96)}}to{{opacity:1;transform:none}}}}
@keyframes bw-spine{{from{{transform:scaleY(0)}}to{{transform:none}}}}
@keyframes bw-cap{{from{{opacity:0;transform:translateY(-6px)}}to{{opacity:1;transform:none}}}}
@keyframes bw-l1{{0%{{stroke-dashoffset:1;opacity:0}}1%{{opacity:1}}to{{stroke-dashoffset:0;opacity:1}}}}
@keyframes bw-l2{{0%{{stroke-dashoffset:-1;opacity:0}}1%{{opacity:1}}to{{stroke-dashoffset:0;opacity:1}}}}
@keyframes bw-rule{{from{{transform:scaleX(0)}}to{{transform:none}}}}
{S}:not(.bw-still) .sheet{{animation:bw-sheet 240ms cubic-bezier(.22,1,.36,1) 0ms backwards}}
{S}:not(.bw-still) .spine{{animation:bw-spine 520ms cubic-bezier(.65,0,.35,1) 80ms backwards}}
{S}:not(.bw-still) .cap{{animation:bw-cap 160ms cubic-bezier(.34,1.36,.64,1) 440ms backwards}}
{S}:not(.bw-still) .l1{{animation:bw-l1 360ms cubic-bezier(.22,1,.36,1) 520ms backwards}}
{S}:not(.bw-still) .l2{{animation:bw-l2 360ms cubic-bezier(.22,1,.36,1) 600ms backwards}}
{S}:not(.bw-still) .rule{{animation:bw-rule 900ms cubic-bezier(.65,0,.35,1) 760ms backwards}}
.bw-reveal {S} .sheet,{S}.bw-reveal .sheet{{animation-name:bw-sheet,x}}
.bw-reveal {S} .spine,{S}.bw-reveal .spine{{animation-name:bw-spine,x}}
.bw-reveal {S} .cap,{S}.bw-reveal .cap{{animation-name:bw-cap,x}}
.bw-reveal {S} .l1,{S}.bw-reveal .l1{{animation-name:bw-l1,x}}
.bw-reveal {S} .l2,{S}.bw-reveal .l2{{animation-name:bw-l2,x}}
.bw-reveal {S} .rule,{S}.bw-reveal .rule,a:hover>{S} .rule,a:focus-visible>{S} .rule{{animation:bw-rule-again 900ms cubic-bezier(.65,0,.35,1) backwards}}
@keyframes bw-rule-again{{from{{transform:scaleX(0)}}to{{transform:none}}}}
@media (prefers-reduced-motion:reduce){{{S} *{{animation:none!important}}}}
"""
    body = (f"<style>{css.strip()}</style>"
            f'<path class="sheet" d="{SHEET}"/><path class="spine" d="{SPINE}"/><path class="cap" d="{CAP}"/>'
            f'<path class="ln l1" pathLength="1" d="{L1}"/><path class="ln l2" pathLength="1" d="{L2}"/>'
            f'<path class="rule" d="{RULE}"/>')
    return svg(64, 64, body, "Business-Wrap", cls="bw-logo bw-logo-anim")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts")
    face = Face(font_path(ap.parse_args().fonts))
    OUT.mkdir(exist_ok=True)
    FAV.mkdir(exist_ok=True)
    files = {"mark.svg": mark_file("light"), "mark-dark.svg": mark_file("dark"), "mark-mono.svg": mark_file("mono"),
             "mark-small.svg": mark_file("light", True), "mark-small-dark.svg": mark_file("dark", True),
             "mark-small-mono.svg": mark_file("mono", True),
             "mark-animated.svg": animated(), "app-icon.svg": app_icon()}
    # one size for both languages: the smaller of the two fits, so EN and AR lockups carry the same letter height
    sizes = {}
    for lang in ("en", "ar"):
        text, _, W = WORD[lang]
        sizes[lang], _ = fit(face, lang, W - 2 * EDGE - MARK_W - GAP - 8)
    size = min(sizes.values())
    for lang in ("en", "ar"):
        for mode in ("light", "dark", "mono"):
            sfx = "" if mode == "light" else "-" + mode
            files[f"lockup-{lang}{sfx}.svg"] = lockup(face, lang, mode, size)
            files[f"wordmark-{lang}{sfx}.svg"] = wordmark(face, lang, mode, size)
    for n, s in files.items():
        (OUT / n).write_text(s, encoding="utf-8", newline="\n")
    (FAV / "favicon.svg").write_text(favicon(), encoding="utf-8", newline="\n")
    # tile masters for the PNG export (not shipped): small mark for 16..48, full mark above, maskable at 60 %, iOS square
    tiles = V3 / "tools" / "_tiles"
    tiles.mkdir(exist_ok=True)
    for n, s in {"tile.svg": app_icon(), "tile-small.svg": app_icon(True), "tile-maskable.svg": app_icon(False, 0.60, False),
                 "tile-apple.svg": app_icon(False, 0.72, False), "mark-small.svg": files["mark-small.svg"]}.items():
        (tiles / n).write_text(s, encoding="utf-8", newline="\n")
    print(f"wordmark size {size:.2f} (en fit {sizes['en']:.2f}, ar fit {sizes['ar']:.2f})")
    print("\n".join(f"{n}: {len(s.encode())} B" for n, s in files.items()))


if __name__ == "__main__":
    main()
