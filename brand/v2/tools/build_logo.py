"""Business-Wrap brand v2: the mark, the outlined wordmark lockups (EN, AR), the animated mark and the app icon.

    uv run --with fonttools --with uharfbuzz python brand/v2/tools/build_logo.py [--fonts <dir with thmanyah*.otf>]
Fonts default to the OS user font folder (Windows: %LOCALAPPDATA%/Microsoft/Windows/Fonts) or BW_FONT_DIR.
The text is converted to outlines: no font file and no font name is needed to show the logo.
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

V2 = Path(__file__).resolve().parent.parent
OUT = V2 / "logo"
INK, PAPER, DARK, LIME = "#0F231E", "#EEF2EA", "#0B1A16", "#C8F04A"

# ---- the mark: 64 grid ------------------------------------------------------------------------------
LEFT = "M5 15Q5 11 9 11L30 13V55L9 53Q5 53 5 49Z"
RIGHT = "M59 15Q59 11 55 11L34 13V55L55 53Q59 53 59 49Z"
# lines: English page starts on the left, Arabic page starts on the right (the spine is x 30..34)
LINES = [(10, 21.5, 25, 21.5), (10, 44, 24, 44), (10, 49.5, 18, 49.5),
         (54, 21.5, 39, 21.5), (54, 44, 40, 44), (54, 49.5, 46, 49.5)]
BAND = "M8 29.5L56 26.5V35L8 38Z"          # the highlighter: one stroke across the spine, rising to the right
BAND_SLOT = "M6.5 28L57.5 25V36.5L6.5 39.5Z"  # mono: the slot cut around the band


def lines_d(rev_ar: bool = False) -> str:
    return "".join(f"M{a} {b}H{c}" for a, b, c, _ in LINES)


def mark_body(ink: str, band: str | None, uid: str, mono: bool = False) -> str:
    """Pages in `ink` with the text lines cut out (mask), so the ground shows through on any colour."""
    slot = f'<path d="{BAND_SLOT}" fill="#000" stroke="#000" stroke-width="0" />' if mono else ""
    mask = (f'<mask id="{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">'
            f'<rect width="64" height="64" fill="#fff"/>'
            f'<path d="{lines_d()}" stroke="#000" stroke-width="3.6" stroke-linecap="round" fill="none"/>{slot}</mask>')
    pages = f'<g mask="url(#{uid})" fill="{ink}"><path d="{LEFT}"/><path d="{RIGHT}"/></g>'
    hl = f'<path class="hl" d="{BAND}" fill="{band}" stroke="{band}" stroke-width="1" stroke-linejoin="round"/>' if band else ""
    return f"<defs>{mask}</defs>{pages}{hl}"


def svg(w: float, h: float, body: str, title: str, extra: str = "") -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:g} {h:g}" width="{w:g}" height="{h:g}" role="img" '
            f'aria-label="{title}"{extra}><title>{title}</title>{body}</svg>\n')


# ---- outlined text ---------------------------------------------------------------------------------
class Face:
    def __init__(self, path: Path):
        self.tt = TTFont(path)
        self.gs = self.tt.getGlyphSet()
        self.upm = self.tt["head"].unitsPerEm
        blob = hb.Blob.from_file_path(str(path))
        self.hbfont = hb.Font(hb.Face(blob))
        self.names = self.tt.getGlyphOrder()

    def shape(self, text: str, rtl: bool):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        buf.direction = "rtl" if rtl else "ltr"
        hb.shape(self.hbfont, buf, {"kern": True, "liga": True})
        x, out = 0, []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            out.append((self.names[info.codepoint], x + pos.x_offset, pos.y_offset, info.cluster, pos.x_advance))
            x += pos.x_advance
        return out, x

    def outline(self, text: str, size: float, x0: float, baseline: float, rtl: bool = False):
        """SVG path for `text` at `size` px; returns (d, advance_px, per-cluster x extents in px)."""
        glyphs, adv = self.shape(text, rtl)
        s = size / self.upm
        pen = SVGPathPen(self.gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
        spans = {}
        for name, gx, gy, cl, a in glyphs:
            tp = TransformPen(pen, (s, 0, 0, -s, x0 + gx * s, baseline - gy * s))
            self.gs[name].draw(tp)
            lo, hi = spans.get(cl, (1e9, -1e9))
            spans[cl] = (min(lo, x0 + gx * s), max(hi, x0 + (gx + a) * s))
        return pen.getCommands(), adv * s, spans

    def bounds(self, text: str, size: float, rtl: bool = False):
        glyphs, _ = self.shape(text, rtl)
        s = size / self.upm
        bp = BoundsPen(self.gs)
        for name, gx, gy, *_ in glyphs:
            self.gs[name].draw(TransformPen(bp, (s, 0, 0, -s, gx * s, -gy * s)))
        return bp.bounds  # xmin, ymin(top, negative), xmax, ymax


def font_dir(arg: str | None) -> Path:
    for c in (arg, os.environ.get("BW_FONT_DIR"), os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft/Windows/Fonts")):
        if c and (Path(c) / "thmanyahserifdisplay-Black.otf").exists():
            return Path(c)
    raise SystemExit("FAILED: no thmanyahserifdisplay-Black.otf; pass --fonts <dir> or set BW_FONT_DIR")


def band_path(x1: float, x2: float, top: float, bot: float, rise: float = 2.0) -> str:
    """A highlighter band: slightly rising to the right, ends cut on a slant like a chisel tip."""
    return (f"M{x1:.1f} {top + rise:.1f}L{x2:.1f} {top:.1f}L{x2 - 3:.1f} {bot - rise:.1f}"
            f"L{x1 - 3:.1f} {bot:.1f}Z")


def lockup(face: Face, lang: str, mode: str) -> str:
    """mode: light (ink on paper), dark (paper ink on ledger dark), mono (currentColor)."""
    size, mark_h, gap = 46.0, 64.0, 18.0
    ink = {"light": INK, "dark": PAPER, "mono": "currentColor"}[mode]
    rtl = lang == "ar"
    text = "بزنس راب" if rtl else "Business-Wrap"
    hl_from = text.index("راب") if rtl else text.index("Wrap")
    xmin, ymin, xmax, ymax = face.bounds(text, size, rtl)
    cap = -face.bounds("B" if not rtl else "ب", size, rtl)[1]
    baseline = mark_h / 2 + (cap / 2 if not rtl else 13)  # Latin: centre the cap height; Arabic: optical, measured on the tooth line
    tw = xmax - xmin
    pad = 4.0
    W = mark_h + gap + tw + pad * 2
    if rtl:
        tx = pad - xmin
        mark_x = pad + tw + gap
    else:
        mark_x = 0
        tx = mark_h + gap - xmin
    d, adv, spans = face.outline(text, size, tx, baseline, rtl)
    xs = [v for k, v in spans.items() if k >= hl_from]
    hx1, hx2 = min(a for a, _ in xs) + (-5 if rtl else 2), max(b for _, b in xs) + 7
    top, bot = baseline - (cap * 0.78 if not rtl else 24), baseline + (7 if not rtl else 9)
    uid = f"bw-m-{lang}-{mode}"
    if mode == "mono":
        band = f'<path d="{band_path(hx1, hx2, bot - 1, bot + 5, 1)}" fill="currentColor"/>'
        word = f'<path d="{d}" fill="currentColor"/>'
    else:
        band = f'<path class="hl" d="{band_path(hx1, hx2, top, bot)}" fill="{LIME}"/>'
        # the highlighted word is always ink on lime, so it reads on paper and on dark
        clip = f'<clipPath id="{uid}-c"><path d="{band_path(hx1, hx2, top, bot)}"/></clipPath>'
        word = (f'<defs>{clip}</defs><path d="{d}" fill="{ink}"/>'
                f'<path d="{d}" fill="{INK}" clip-path="url(#{uid}-c)"/>')
    mark = f'<g transform="translate({mark_x:.1f} 0)">{mark_body(ink, None if mode == "mono" else LIME, uid, mode == "mono")}' \
           f'{"" if mode != "mono" else f"<path d=\"{BAND}\" fill=\"currentColor\"/>"}</g>'
    title = "بزنس راب" if rtl else "Business-Wrap"
    return svg(round(W, 1), mark_h, mark + band + word, title)


def mark_file(mode: str) -> str:
    if mode == "mono":
        body = mark_body("currentColor", None, "bw-mk-mono", True) + f'<path class="hl" d="{BAND}" fill="var(--bw-accent, currentColor)"/>'
    else:
        body = mark_body(INK if mode == "light" else PAPER, LIME, f"bw-mk-{mode}")
    return svg(64, 64, body, "Business-Wrap")


def app_icon() -> str:
    body = (f'<rect width="64" height="64" rx="14" fill="{DARK}"/>'
            f'<g transform="translate(6 6.5) scale(.8125)">{mark_body(PAPER, LIME, "bw-app")}</g>')
    return svg(64, 64, body, "Business-Wrap")


def favicon() -> str:
    """Follows the system scheme (a favicon has no host colour to follow)."""
    style = (f"<style>.p{{fill:{INK}}}@media (prefers-color-scheme: dark){{.p{{fill:{PAPER}}}}}</style>")
    mask = (f'<mask id="bw-fv" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/>'
            f'<path d="{lines_d()}" stroke="#000" stroke-width="4.4" stroke-linecap="round" fill="none"/></mask>')
    body = (f"{style}<defs>{mask}</defs><g mask=\"url(#bw-fv)\" class=\"p\"><path d=\"{LEFT}\"/><path d=\"{RIGHT}\"/></g>"
            f'<path d="{BAND}" fill="{LIME}" stroke="{LIME}" stroke-width="1.6" stroke-linejoin="round"/>')
    return svg(64, 64, body, "Business-Wrap")


def animated() -> str:
    """Loop, 5 s: lines write from each page's reading start (EN left to right, AR right to left), the highlighter
    sweeps across the spine, holds, and the page clears. Colours follow --bw-ink / --bw-bg / --bw-accent when inlined.
    Hooks: class bw-still stops it (final frame); prefers-reduced-motion shows the final frame."""
    css = """
:root{--i:var(--bw-ink,#0F231E);--g:var(--bw-bg,#F5F3EC);--a:var(--bw-accent,#C8F04A)}
.pg{fill:var(--i)}
.ln{stroke:var(--g);stroke-width:3.6;stroke-linecap:round;fill:none;stroke-dasharray:20;stroke-dashoffset:20;animation:bw-w 5s cubic-bezier(.22,1,.36,1) infinite}
.hl{fill:var(--a);transform-box:fill-box;transform-origin:0 50%;transform:scaleX(0);animation:bw-s 5s cubic-bezier(.65,0,.35,1) infinite}
.l2{animation-delay:.12s}.l3{animation-delay:.24s}
.pl{transform-box:fill-box;transform-origin:100% 50%;animation:bw-o 5s cubic-bezier(.65,0,.35,1) infinite}
.pr{transform-box:fill-box;transform-origin:0 50%;animation:bw-o 5s cubic-bezier(.65,0,.35,1) infinite}
@keyframes bw-w{0%,8%{stroke-dashoffset:20;opacity:1}30%,84%{stroke-dashoffset:0;opacity:1}94%,100%{stroke-dashoffset:0;opacity:0}}
@keyframes bw-s{0%,30%{transform:scaleX(0);opacity:1}46%,84%{transform:scaleX(1);opacity:1}94%,100%{transform:scaleX(1);opacity:0}}
@keyframes bw-o{0%,100%{transform:scaleX(1)}4%{transform:scaleX(.94)}10%{transform:scaleX(1)}}
.bw-still *{animation:none!important}.bw-still .ln{stroke-dashoffset:0}.bw-still .hl{transform:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.ln{stroke-dashoffset:0}.hl{transform:none}}
"""
    lns = []
    for i, (a, b, c, _) in enumerate(LINES):
        cls = f"ln l{i % 3 + 1}"
        lns.append(f'<path class="{cls}" pathLength="20" d="M{a} {b}H{c}"/>')
    body = (f"<style>{css.strip()}</style>"
            f'<path class="pg pl" d="{LEFT}"/><path class="pg pr" d="{RIGHT}"/>{"".join(lns)}'
            f'<path class="hl" d="{BAND}" stroke-linejoin="round"/>')
    return svg(64, 64, body, "Business-Wrap")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fonts")
    fd = font_dir(ap.parse_args().fonts)
    face = Face(fd / "thmanyahserifdisplay-Black.otf")
    OUT.mkdir(exist_ok=True)
    files = {
        "mark.svg": mark_file("light"), "mark-dark.svg": mark_file("dark"), "mark-mono.svg": mark_file("mono"),
        "app-icon.svg": app_icon(), "mark-animated.svg": animated(),
    }
    for lang in ("en", "ar"):
        for mode in ("light", "dark", "mono"):
            files[f"lockup-{lang}{'' if mode == 'light' else '-' + mode}.svg"] = lockup(face, lang, mode)
    for n, s in files.items():
        (OUT / n).write_text(s, encoding="utf-8", newline="\n")
    fav = V2 / "favicon"
    fav.mkdir(exist_ok=True)
    (fav / "favicon.svg").write_text(favicon(), encoding="utf-8", newline="\n")
    print("\n".join(f"{n}: {len(s.encode())} B" for n, s in files.items()))


if __name__ == "__main__":
    main()
