# Generates templates/_doctypes/_art/<type-id>.svg (17 files): portrait page miniatures, one file per id, LTR art;
# the Arabic edition mirrors the file with CSS (transform: scaleX(-1) on the <img>; the ticks and arrows stay readable because
# the art is symbolic, no text). Adapted from the designer's work/sdlc/design/ux/tools/make-thumbs.py (decisions D1-D3).
# No <text>, no <image>, no scripts, no external refs; colours are steps of palette/tokens.json (rust is derived).
# Run:  PYTHONUTF8=1 python tools/doctypes/make-art.py
import json, math, pathlib, re

REPO = pathlib.Path(__file__).resolve().parents[2]
OUT = REPO / "templates/_doctypes/_art"
tok = json.load(open(REPO / "palette/tokens.json", encoding="utf8"))["color"]["ramp"]


def C(ramp, step):
    return tok[ramp][str(step)]["$value"]["hex"]


INK, PAPER = C("neutral", 900), C("neutral", 50)
BAR, BAR2, EDGE = C("neutral", 300), C("neutral", 200), C("neutral", 300)
GOLD, GOLD_RULE = C("accent", 500), C("accent", 600)
CARD = C("accent", 100)
SIGNAL, SIGNAL_L = C("signal", 600), C("signal", 100)

RUST = "#853311"  # diagram.rework-line


def mix(a, b, t):
    pa, pb = [int(a[i:i + 2], 16) for i in (1, 3, 5)], [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join("%02x" % round(x + (y - x) * t) for x, y in zip(pa, pb))


# category -> D spine, M mid shapes, W wash, Z zebra/faint  (every value is a step of palette/tokens.json)
CAT = {
    "req": dict(D=C("primary", 950), M=C("primary", 800), W=C("primary", 100), Z=C("primary", 50)),
    "test": dict(D=C("success", 700), M=C("success", 600), W=C("success", 100), Z=C("success", 50)),
    "deliv": dict(D=C("accent", 800), M=C("accent", 700), W=C("accent", 100), Z=C("accent", 50)),
    "gov": dict(D=C("neutral", 800), M=C("neutral", 700), W=C("neutral", 200), Z=C("neutral", 100)),
    "train": dict(D=mix(RUST, "#000000", .35), M=RUST, W=mix(RUST, "#ffffff", .88), Z=mix(RUST, "#ffffff", .95)),
}
CAT["deliv"] = dict(D=C("accent", 800), M=C("accent", 700), W=C("accent", 100), Z=C("accent", 50))

def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def rect(x, y, w, h, fill="none", rx=0, stroke=None, sw=0.8, dash=None):
    a = f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}"'
    if rx:
        a += f' rx="{f(rx)}"'
    a += f' fill="{fill}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{f(sw)}"'
    if dash:
        a += f' stroke-dasharray="{dash}"'
    return a + "/>"


def line(x1, y1, x2, y2, stroke, sw=0.8, dash=None, cap="butt"):
    a = f'<path d="M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}" stroke="{stroke}" stroke-width="{f(sw)}" fill="none" stroke-linecap="{cap}"'
    if dash:
        a += f' stroke-dasharray="{dash}"'
    return a + "/>"


def circ(cx, cy, r, fill="none", stroke=None, sw=0.8):
    a = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{f(sw)}"'
    return a + "/>"


def poly(pts, fill="none", stroke=None, sw=0.8):
    p = " ".join(f"{f(x)},{f(y)}" for x, y in pts)
    a = f'<polygon points="{p}" fill="{fill}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{f(sw)}" stroke-linejoin="round"'
    return a + "/>"


def pline(pts, stroke, sw=1.2):
    p = " ".join(f"{f(x)},{f(y)}" for x, y in pts)
    return f'<polyline points="{p}" fill="none" stroke="{stroke}" stroke-width="{f(sw)}" stroke-linecap="round" stroke-linejoin="round"/>'


RTL = False  # set by build(); a check mark is not a direction, so it is flipped back inside the mirrored art


def tick(x, y, s, stroke, sw=1.3):
    t = pline([(x + .2 * s, y + .52 * s), (x + .42 * s, y + .72 * s), (x + .8 * s, y + .3 * s)], stroke, sw)
    return f'<g transform="translate({f(2 * x + s)} 0) scale(-1 1)">{t}</g>' if RTL else t


def bar(x, y, w, h=2.6, fill=BAR):
    return rect(x, y, w, h, fill, rx=h / 2 if h <= 3 else 0.8)


def arrow(x1, y1, x2, y2, stroke, sw=1.1):
    a = math.atan2(y2 - y1, x2 - x1)
    L, W = 4, 2.4
    bx, by = x2 - L * math.cos(a), y2 - L * math.sin(a)
    px, py = -math.sin(a) * W, math.cos(a) * W
    return line(x1, y1, bx, by, stroke, sw) + poly([(x2, y2), (bx + px, by + py), (bx - px, by - py)], stroke)


OX, OY = 0, 0  # motifs are drawn in a 160 x 94 mm local box; build() places it at (34, 163) mm and scales it by 0.95


def m_srs(c):
    o = []
    for i in range(4):
        y = OY + i * 23
        o += [rect(OX, y, 160, 19, c["W"], rx=1.5), rect(OX + 6, y + 6, 22, 7, c["M"] if i else GOLD, rx=1.2),
              bar(OX + 34, y + 5, 96 - i * 6, 2.6), bar(OX + 34, y + 11, 64 + (i % 2) * 20, 2.6)]
    return o


def m_brd(c):
    cx, cy = OX + 38, OY + 47
    o = [circ(cx, cy, 38, c["W"]), circ(cx, cy, 27, PAPER), circ(cx, cy, 16, c["M"]), circ(cx, cy, 6, GOLD),
         arrow(OX + 84, OY + 4, cx + 4, cy - 4, GOLD_RULE, 1.6)]
    for i, y in enumerate((OY + 22, OY + 46, OY + 70)):
        o += [rect(OX + 88, y, 46, 4.2, c["M"], rx=1), bar(OX + 88, y + 8, 70), bar(OX + 88, y + 13, 52 + i * 6)]
    return o


def m_frs(c):
    o = []
    for i, x in enumerate((OX, OX + 60, OX + 120)):
        o += [rect(x, OY, 40, 24, c["M"] if i == 1 else c["W"], rx=2, stroke=c["M"], sw=1),
              bar(x + 7, OY + 8, 26, 2.6, PAPER if i == 1 else c["M"]), bar(x + 7, OY + 14, 18, 2.6, PAPER if i == 1 else BAR)]
    o += [arrow(OX + 41, OY + 12, OX + 59, OY + 12, GOLD_RULE), arrow(OX + 101, OY + 12, OX + 119, OY + 12, GOLD_RULE)]
    ty = OY + 38
    o += [rect(OX, ty, 160, 10, c["W"]), line(OX, ty + 10, OX + 160, ty + 10, c["M"], 1.2)]
    for i in range(1, 6):
        o.append(line(OX, ty + 10 + i * 8.4, OX + 160, ty + 10 + i * 8.4, BAR2, 0.7))
    for x in (OX + 40, OX + 100):
        o.append(line(x, ty, x, ty + 60.4, BAR2, 0.7))
    for i in range(5):
        yy = ty + 14 + i * 8.4
        o += [bar(OX + 4, yy, 26 - (i % 2) * 6, 2, BAR), bar(OX + 44, yy, 44, 2, BAR), bar(OX + 104, yy, 34, 2, BAR)]
    return o


def m_rtm(c):
    o = []
    x0, cw, rh = OX + 42, 29.5, 15
    o += [rect(OX, OY, 160, 10, c["W"]), line(OX, OY + 10, OX + 160, OY + 10, c["M"], 1.2)]
    for j in range(4):
        o.append(bar(x0 + j * cw + 7, OY + 4, 16, 2.4, c["M"]))
    hits = {(0, 0), (0, 1), (1, 1), (1, 3), (2, 0), (2, 2), (3, 2), (3, 3), (4, 3)}
    for i in range(5):
        y = OY + 10 + i * rh
        o += [line(OX, y + rh, OX + 160, y + rh, BAR2, 0.7), bar(OX + 4, y + 6, 30, 2.4, BAR)]
        for j in range(4):
            if (i, j) in hits:
                o.append(circ(x0 + j * cw + cw / 2, y + rh / 2, 3.2, GOLD if (i, j) == (2, 2) else c["M"]))
    return o


def m_flow(c):
    o = []
    for k in range(2):
        y = OY + k * 48
        o += [rect(OX, y, 160, 44, c["Z"] if k == 0 else PAPER, stroke=BAR, sw=0.7), rect(OX, y, 9, 44, c["M"])]
    o += [circ(OX + 24, OY + 22, 5, c["M"]), rect(OX + 38, OY + 14, 32, 16, PAPER, rx=2, stroke=c["M"], sw=1.2),
          poly([(OX + 98, OY + 22), (OX + 110, OY + 12), (OX + 122, OY + 22), (OX + 110, OY + 32)], c["W"], c["M"], 1.2),
          rect(OX + 92, OY + 62, 36, 16, c["M"], rx=2), circ(OX + 148, OY + 70, 5.5, GOLD, c["M"], 1.4),
          arrow(OX + 29, OY + 22, OX + 37, OY + 22, INK, 1), arrow(OX + 70, OY + 22, OX + 97, OY + 22, INK, 1),
          arrow(OX + 110, OY + 32, OX + 110, OY + 61, INK, 1), arrow(OX + 128, OY + 70, OX + 141.5, OY + 70, INK, 1),
          bar(OX + 42, OY + 20, 24, 2, c["M"]), bar(OX + 97, OY + 66, 28, 2, PAPER), bar(OX + 97, OY + 71, 18, 2, PAPER)]
    return o


def m_testplan(c):
    o = []
    for i in range(4):
        y = OY + i * 24
        done = i < 2
        o.append(rect(OX, y + 1, 11, 11, c["M"] if done else PAPER, rx=2, stroke=c["M"], sw=1.2))
        if done:
            o.append(tick(OX, y + 1, 11, PAPER, 1.4))
        o += [bar(OX + 18, y + 2, 92 - i * 6), bar(OX + 18, y + 8, 64), rect(OX + 126, y + 1, 34, 10, c["W"], rx=5),
              bar(OX + 134, y + 5, 18, 2, c["M"]), line(OX, y + 19, OX + 160, y + 19, BAR2, 0.7)]
    return o


def m_testcases(c):
    o = [rect(OX, OY, 160, 11, c["M"])]
    cols = (OX + 26, OX + 90, OX + 124)
    for i in range(6):
        y = OY + 11 + i * 13.6
        if i % 2:
            o.append(rect(OX, y, 160, 13.6, c["Z"]))
        o.append(line(OX, y + 13.6, OX + 160, y + 13.6, BAR2, 0.7))
        fail = i == 3
        o += [bar(OX + 4, y + 5.5, 16, 2.4, c["M"]), bar(cols[0] + 4, y + 5.5, 50 - (i % 3) * 8, 2.4), bar(cols[1] + 4, y + 5.5, 24, 2.4),
              rect(cols[2] + 5, y + 3.3, 26, 7, SIGNAL_L if fail else c["W"], rx=3.5), bar(cols[2] + 10, y + 5.6, 16, 2.2, SIGNAL if fail else c["M"])]
    for x in cols:
        o.append(line(x, OY + 11, x, OY + 11 + 6 * 13.6, BAR2, 0.7))
    return o


def m_defect(c):
    cols = (SIGNAL, C("signal", 300), GOLD, C("neutral", 400))
    o = []
    for i in range(4):
        y = OY + i * 23
        o += [rect(OX, y, 160, 19, PAPER, rx=1.5, stroke=BAR, sw=0.7), circ(OX + 11, y + 9.5, 5, cols[i]),
              bar(OX + 22, y + 5.5, 100 - i * 18, 2.8, cols[i]), bar(OX + 22, y + 11.5, 120 - i * 12, 2.2, BAR)]
    o += [rect(OX + 126, OY + 5, 28, 8, c["W"], rx=4), bar(OX + 133, OY + 8, 14, 2, c["M"])]
    return o


def m_uat(c):
    o = []
    for i in range(3):
        y = OY + i * 24
        o += [circ(OX + 6, y + 6, 6, c["W"], c["M"], 1.2), tick(OX + .5, y + .5, 11, c["M"], 1.4),
              bar(OX + 18, y + 3, 80 - i * 8, 2.8, INK), bar(OX + 18, y + 9, 60, 2.2),
              line(OX + 112, y + 12, OX + 160, y + 12, INK, 0.9), bar(OX + 112, y + 15, 20, 1.8)]
    sy = OY + 76
    o += [line(OX, sy + 14, OX + 62, sy + 14, INK, 0.9), bar(OX, sy + 17, 24, 1.8), line(OX + 76, sy + 14, OX + 118, sy + 14, INK, 0.9),
          bar(OX + 76, sy + 17, 18, 1.8), circ(OX + 144, sy + 6, 11, c["M"]), circ(OX + 144, sy + 6, 8, "none", PAPER, 0.9),
          tick(OX + 135, sy - 3, 18, GOLD, 1.8)]
    return o


def m_release(c):
    o = [rect(OX, OY, 58, 24, c["M"], rx=3), circ(OX + 7, OY + 12, 2.6, PAPER), bar(OX + 15, OY + 8, 30, 3.2, PAPER), bar(OX + 15, OY + 14.5, 20, 2.4, c["W"]),
         bar(OX + 74, OY + 8, 40, 2.8), bar(OX + 74, OY + 14, 26, 2.2, BAR2)]
    kinds = ((c["M"], PAPER, None), (GOLD, INK, None), (PAPER, c["M"], c["M"]), (c["M"], PAPER, None))
    for i, (fl, tx, st) in enumerate(kinds):
        y = OY + 36 + i * 15.5
        o += [rect(OX, y, 24, 9, fl, rx=4.5, stroke=st, sw=1) if st else rect(OX, y, 24, 9, fl, rx=4.5), bar(OX + 6, y + 3.3, 12, 2.2, tx),
              bar(OX + 32, y + 1.5, 110 - i * 10, 2.6), bar(OX + 32, y + 6, 80, 2)]
    return o


def m_manual(c):
    o = [rect(OX, OY, 13, 13, c["M"], rx=2), rect(OX + 5.2, OY + 3.4, 2.8, 6.2, PAPER, rx=0.6),
         bar(OX + 19, OY + 3, 70, 4.2, INK), bar(OX + 19, OY + 10, 104, 2.4)]
    fy = OY + 20
    o += [rect(OX, fy, 160, 56, CARD, rx=1.5, stroke=BAR, sw=0.8), rect(OX + 3, fy + 3, 154, 6, BAR2, rx=1), rect(OX + 3, fy + 12, 32, 41, BAR2, rx=1)]
    for j in range(3):
        o.append(bar(OX + 7, fy + 17 + j * 7, 22, 2, BAR))
    o += [rect(OX + 40, fy + 13, 50, 12, PAPER, stroke=BAR, sw=0.6), rect(OX + 40, fy + 29, 80, 6, PAPER, stroke=BAR, sw=0.6),
          rect(OX + 40, fy + 39, 80, 6, PAPER, stroke=BAR, sw=0.6),
          rect(OX + 37.5, fy + 26.5, 85.5, 11.5, "none", rx=1.2, stroke=SIGNAL, sw=1.4), circ(OX + 124, fy + 26.5, 4.4, SIGNAL),
          rect(OX + 123, fy + 24.2, 2, 4.6, PAPER, rx=0.5)]
    sy = OY + 84
    o += [rect(OX, sy, 9, 9, c["M"], rx=1.5), bar(OX + 14, sy + 2.5, 60, 3.2, INK)]
    return o


def m_tot(c):
    ramp = (c["W"], mix(RUST, "#ffffff", .55), c["M"], c["D"])
    o = []
    for i in range(4):
        h = 20 + i * 17
        o += [rect(OX + i * 40, OY + 94 - h, 32, h, ramp[i], rx=1.5), bar(OX + i * 40 + 6, OY + 94 - h + 6, 20, 2.4, PAPER if i > 1 else c["M"])]
    gx, gy = OX + 3 * 40 + 16, OY + 94 - 71
    o += [line(gx, gy, gx, gy - 14, INK, 1), poly([(gx, gy - 14), (gx + 9, gy - 11), (gx, gy - 8)], GOLD)]
    for i in range(3):
        o.append(circ(OX + 6 + i * 9, OY + 12, 3.2, c["M"]))
    o.append(bar(OX + 36, OY + 10, 40, 2.8))
    return o


def m_tor(c):
    o = [rect(OX, OY, 160, 58, "none", rx=2, stroke=c["M"], sw=1.2), rect(OX + 6, OY + 6, 38, 4, c["M"], rx=1)]
    for i in range(3):
        x = OX + 6 + i * 50
        o += [rect(x, OY + 17, 44, 16, c["W"], rx=1.5), bar(x + 5, OY + 22, 28, 2.4, c["M"]), bar(x + 5, OY + 27, 20, 2)]
    o += [rect(OX + 6, OY + 38, 70, 14, "none", rx=1.5, stroke=c["M"], sw=0.9, dash="2.4 1.8"), bar(OX + 12, OY + 44, 40, 2.2)]
    ty = OY + 78
    o.append(line(OX, ty, OX + 160, ty, c["M"], 1.4))
    for i, x in enumerate((OX + 4, OX + 52, OX + 102, OX + 154)):
        o += [circ(x, ty, 4, GOLD if i == 3 else c["M"], PAPER, 1.2), bar(x - 9, ty + 8, 18, 2.2)]
    return o


def m_bcase(c):
    # balance (costs vs benefits, gold pan heavier) and rising benefit bars
    o = [rect(OX + 36, OY + 84, 28, 4, c["M"], rx=1.5), rect(OX + 48, OY + 18, 4, 66, c["M"]), circ(OX + 50, OY + 14, 5, GOLD),
         line(OX + 8, OY + 30, OX + 92, OY + 22, c["M"], 2.2, cap="round"),
         line(OX + 14, OY + 30, OX + 6, OY + 56, INK, 0.9), line(OX + 14, OY + 30, OX + 30, OY + 56, INK, 0.9),
         line(OX + 86, OY + 22, OX + 72, OY + 44, INK, 0.9), line(OX + 86, OY + 22, OX + 100, OY + 44, INK, 0.9),
         rect(OX + 4, OY + 54, 30, 5, c["W"], rx=2.5, stroke=c["M"], sw=1), rect(OX + 68, OY + 42, 36, 5, GOLD, rx=2.5)]
    for i in range(4):
        h = 22 + i * 17
        o.append(rect(OX + 114 + i * 12, OY + 94 - h, 9, h, c["M"] if i < 3 else GOLD, rx=1))
    o += [line(OX + 110, OY + 94, OX + 160, OY + 94, INK, 0.9), bar(OX, OY + 68, 24, 2.4), bar(OX + 74, OY + 56, 24, 2.4, c["M"])]
    return o


def m_change(c):
    o = [rect(OX, OY, 58, 44, c["W"], rx=2), bar(OX + 6, OY + 7, 34, 3.2, c["M"]), bar(OX + 6, OY + 15, 44, 2.4), bar(OX + 6, OY + 21, 38, 2.4),
         bar(OX + 6, OY + 27, 44, 2.4), line(OX + 4, OY + 28.2, OX + 54, OY + 28.2, SIGNAL, 1.1),
         rect(OX + 102, OY, 58, 44, c["M"], rx=2), bar(OX + 108, OY + 7, 34, 3.2, GOLD), bar(OX + 108, OY + 15, 44, 2.4, PAPER),
         bar(OX + 108, OY + 21, 38, 2.4, PAPER), bar(OX + 108, OY + 27, 30, 2.4, PAPER), arrow(OX + 64, OY + 22, OX + 96, OY + 22, GOLD_RULE, 1.8)]
    for i, (frac, col) in enumerate(((0.35, c["M"]), (0.6, GOLD), (0.85, SIGNAL))):
        y = OY + 56 + i * 13
        o += [circ(OX + 4, y + 3, 3, col), bar(OX + 12, y + 1.5, 22, 3), rect(OX + 40, y + 1, 120, 4, BAR2, rx=2), rect(OX + 40, y + 1, 120 * frac, 4, col, rx=2)]
    return o


def m_minutes(c):
    o = []
    for i in range(3):
        o.append(circ(OX + 6 + i * 11, OY + 6, 5, c["M"] if i < 2 else GOLD))
    o += [bar(OX + 112, OY + 3, 48, 2.8, INK), bar(OX + 126, OY + 9, 34, 2.2)]
    for i in range(3):
        y = OY + 22 + i * 17
        o += [circ(OX + 5, y + 4, 5, c["W"], c["M"], 1), bar(OX + 16, y + 1, 90 - i * 10, 3, INK), bar(OX + 16, y + 7, 120, 2.2),
              line(OX, y + 14.5, OX + 160, y + 14.5, BAR2, 0.7)]
    y = OY + 78
    o += [rect(OX, y, 10, 10, PAPER, rx=2, stroke=c["M"], sw=1.2), bar(OX + 16, y + 2, 76, 2.8), rect(OX + 118, y + 1, 42, 8, c["W"], rx=4),
          bar(OX + 126, y + 4, 26, 2, c["M"])]
    return o


MOTIFS = {
    "srs": ("req", "SRS", m_srs), "brd": ("req", "BRD", m_brd), "frs": ("req", "FRS", m_frs), "rtm": ("req", "RTM", m_rtm),
    "process-flow": ("req", "PF", m_flow),
    "test-plan": ("test", "TP", m_testplan), "test-cases": ("test", "TC", m_testcases), "defect-report": ("test", "DR", m_defect),
    "uat-signoff": ("deliv", "UAT", m_uat), "release-notes": ("deliv", "RN", m_release),
    "user-manual": ("deliv", "UM", m_manual), "tot": ("train", "TOT", m_tot),
    "tor": ("gov", "TOR", m_tor), "business-case": ("gov", "BC", m_bcase), "change-request": ("gov", "CR", m_change),
    "minutes": ("gov", "MOM", m_minutes),
}
NAMES = {"blank": "Blank document", "srs": "Software Requirements Specification", "user-manual": "User Manual",
         "tot": "Training of Trainers guide", "tor": "Terms of Reference", "brd": "Business Requirements Document",
         "frs": "Functional Requirements Specification", "test-plan": "Test Plan", "test-cases": "Test Cases sheet",
         "uat-signoff": "UAT sign-off", "release-notes": "Release notes", "change-request": "Change request",
         "minutes": "Minutes of meeting", "process-flow": "Process flow document", "rtm": "Requirements Traceability Matrix",
         "business-case": "Business case", "defect-report": "Defect report"}


COMPACT = {"blank", "minutes", "test-cases", "defect-report", "rtm"}
LANDSCAPE = {"rtm", "test-cases"}  # these documents print on A4 landscape (registry layout.page.orientation): their thumbnail is a landscape page, 328 x 232 viewBox


def build_landscape(tid):
    """A landscape page miniature (297 x 210 mm): band, kicker and title block, then the matrix / case table as the body."""
    pw, ph = 297, 210
    cat, code, motif = MOTIFS[tid]
    c = CAT[cat]
    art = [rect(0, 0, pw, ph, PAPER, stroke=EDGE, sw=0.8), rect(0, 0, pw, 4, c["D"]), rect(16, 12, 14, 8, BAR2, rx=1.5), bar(237, 14, 44, 2.6), line(16, 24, 281, 24, EDGE, 0.7),
           rect(16, 31, 24, 6, c["M"], rx=1), bar(46, 33, 28, 2.4, C("accent", 700)), rect(16, 42, 100, 5, INK, rx=0.8)]
    art.append('<g transform="translate(16 56) scale(1.4)">' + "".join(motif(c)) + "</g>")
    art += [line(16, 196, 281, 196, EDGE, 0.7), rect(16, 202, 14, 2.4, SIGNAL, rx=0.6), bar(120, 202, 26, 2.2, BAR), bar(277, 202, 4, 2.2, BAR)]
    return pw, ph, art


def build(tid):
    pw, ph = 210, 297
    art = [rect(0, 0, pw, ph, PAPER, stroke=EDGE, sw=0.8)]
    if tid in LANDSCAPE:
        pw, ph, art = build_landscape(tid)
    elif tid == "blank":
        art += [circ(105, 140, 24, "none", C("neutral", 400), 1.4), rect(103.4, 128, 3.2, 24, C("neutral", 400), rx=1.6),
                rect(93, 138.4, 24, 3.2, C("neutral", 400), rx=1.6), rect(34, 34, 1.2, 8, INK, rx=0.4)]
        for i in range(3):
            art.append(bar(34, 200 + i * 8, 110 - i * 20, 1.8, BAR2))
    else:
        cat, code, motif = MOTIFS[tid]
        c = CAT[cat]
        if tid in COMPACT:  # no cover page: running header, kicker, gold rule and title block on page 1, motif as the body
            art += [rect(0, 0, pw, 4, c["D"]), rect(34, 14, 14, 10, BAR2, rx=1.5), bar(154, 17, 40, 2.6), line(34, 28, 194, 28, EDGE, 0.7),
                    rect(34, 40, 26, 6.5, c["M"], rx=1), bar(66, 42, 30, 2.6, C("accent", 700)), line(34, 54, 54, 54, GOLD_RULE, 1.2),
                    rect(34, 60, 100, 5.6, INK, rx=0.8), rect(34, 69.5, 64, 5.6, INK, rx=0.8)]
            art.append('<g transform="translate(34 88) scale(.95)">' + "".join(motif(c)) + "</g>")
            for i in range(3):
                art.append(bar(34, 188 + i * 8, 150 - i * 24, 1.8, BAR2))
            art += [line(34, 258, 194, 258, EDGE, 0.7), rect(34, 288, 14, 2.4, SIGNAL, rx=0.6), bar(92, 288, 26, 2.2, BAR), bar(190, 288, 4, 2.2, BAR)]
        else:
            art += [rect(0, 0, 20, ph, c["D"]), rect(0, 0, 20, 20, GOLD), line(10, 110, 10, 172, GOLD, 1.4, dash="1.6 3.2", cap="round")]
            for x, w in ((34, 22), (90, 30), (172, 22)):
                art.append(rect(x, 20, w, 20, BAR2, rx=1.5))
            art += [line(34, 56, 194, 56, EDGE, 0.7), rect(34, 92, 40, 14, c["M"], rx=1.5), rect(79, 92, 16, 14, GOLD, rx=1.5),
                    bar(34, 122, 28, 2.6, C("accent", 700)), line(34, 134.5, 54, 134.5, GOLD_RULE, 1.2),
                    rect(34, 141, 96, 5.6, INK, rx=0.8), rect(34, 150.5, 62, 5.6, INK, rx=0.8)]
            art.append('<g transform="translate(34 163) scale(.95)">' + "".join(motif(c)) + "</g>")
            art += [line(34, 258, 194, 258, EDGE, 0.7), bar(34, 264, 28, 2.6), bar(154, 264, 40, 2.6), rect(34, 288, 14, 2.4, SIGNAL, rx=0.6),
                    bar(92, 288, 26, 2.2, BAR), bar(190, 288, 4, 2.2, BAR)]
    name = NAMES[tid]
    body = "".join(art)
    body = re.sub(r' stroke-linecap="butt"', "", body)
    body = re.sub(r'(\d+\.\d)\d+', r'\1', body)
    body = body.replace('.0"', '"').replace('.0 ', ' ')
    vw, vh = (pw + 31, ph + 22) if tid in LANDSCAPE else (240, 320)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw} {vh}" width="{vw}" height="{vh}" role="img" aria-label="{name}">'
            f'<title>{name}</title><rect x="16.5" y="13" width="{pw}" height="{ph}" fill="#1b1813" opacity=".1" rx="1"/>'
            f'<g transform="translate(15 11)">{body}</g></svg>\n')


if __name__ == "__main__":
    ids = ["blank"] + list(MOTIFS.keys())
    OUT.mkdir(parents=True, exist_ok=True)
    for tid in ids:
        (OUT / f"{tid}.svg").write_text(build(tid), encoding="utf8", newline="\n")
    print(len(ids), "files")
