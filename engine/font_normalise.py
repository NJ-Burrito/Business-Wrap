"""Normalise one font for printing and embedding as real text: TrueType outlines, OS/2 fsType = 0.

Chrome's PDF backend writes CFF outlines (.otf, CFF .woff/.woff2) and licence-restricted faces as Type 3
glyph drawings with no font name; Word embeds TrueType only. The editor promises real text for every font
the user chooses (owner decision 2026-10-28: the licence is the user's responsibility), so each face that
is not already a TrueType file goes through here. The CFF → TrueType conversion is the house otf-to-ttf
path (nj-plugin pdf-typography/scripts/otf-to-ttf.py): cubic curves become quadratics within one unit
per em. WOFF/WOFF2 are unpacked, a collection (TTC) gives up the face at --index.

    uv run --no-project --with fonttools --with brotli python engine/font_normalise.py IN OUT [--index N]

The output is written where the caller says (the gitignored out/ folder) and never committed.
"""
from __future__ import annotations
import argparse
import sys

from fontTools.ttLib import TTFont, newTable
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen


def to_truetype(font: TTFont, tolerance: float = 1.0) -> None:
    """otf-to-ttf.py, in place: glyf/loca from the CFF outlines, TrueType maxp, sfnt version 1.0."""
    glyphset = font.getGlyphSet()
    order = font.getGlyphOrder()
    glyf = newTable('glyf')
    glyf.glyphOrder = order
    glyf.glyphs = {}
    for name in order:
        pen = TTGlyphPen(glyphset)
        glyphset[name].draw(Cu2QuPen(pen, tolerance))
        glyf.glyphs[name] = pen.glyph()
    font['glyf'] = glyf
    for name in order:
        glyf[name].recalcBounds(glyf)
    font['loca'] = newTable('loca')
    font['head'].indexToLocFormat = 0
    font['head'].glyphDataFormat = 0
    for table in ('CFF ', 'CFF2', 'VORG'):
        if table in font:
            del font[table]
    maxp = newTable('maxp')
    maxp.tableVersion = 0x00010000
    maxp.numGlyphs = len(order)
    for field in ('maxZones', 'maxTwilightPoints', 'maxStorage', 'maxFunctionDefs', 'maxInstructionDefs',
                  'maxStackElements', 'maxSizeOfInstructions', 'maxComponentElements', 'maxComponentDepth',
                  'maxPoints', 'maxContours', 'maxCompositePoints', 'maxCompositeContours'):
        setattr(maxp, field, 1 if field == 'maxZones' else 0)
    font['maxp'] = maxp
    font.sfntVersion = '\x00\x01\x00\x00'


def embolden(font: TTFont, ratio: float = 1 / 26) -> None:
    """A synthetic Bold face, in place, for a family that has none (0.10.0 faux bold).

    Chrome fakes bold by stroking glyphs, and a stroked glyph prints as a Type 3 drawing; an emboldened
    TrueType face prints as real text. Every contour point moves outward along the bisector of its two
    edges by half the stroke (FreeType's FT_Outline_EmboldenXY, simplified); the advance grows by the
    stroke and the outline shifts right by half of it, so letters keep their spacing and Arabic joins meet.
    """
    import math
    glyf = font['glyf']
    hmtx = font['hmtx']
    s = font['head'].unitsPerEm * ratio
    half = s / 2
    for name in font.getGlyphOrder():
        g = glyf[name]
        if g.isComposite() or g.numberOfContours <= 0:
            if name in hmtx.metrics and g.numberOfContours != 0:
                adv, lsb = hmtx.metrics[name]
                hmtx.metrics[name] = (int(round(adv + s)), lsb)
            continue
        coords = g.coordinates
        ends = g.endPtsOfContours
        # orientation of the whole glyph: TrueType outer contours run clockwise (negative area)
        area = 0.0
        start = 0
        for end in ends:
            for i in range(start, end + 1):
                x0, y0 = coords[i]
                x1, y1 = coords[start if i == end else i + 1]
                area += x0 * y1 - x1 * y0
            start = end + 1
        sign = -1 if area < 0 else 1
        out = []
        start = 0
        for end in ends:
            n = end - start + 1
            for k in range(n):
                px, py = coords[start + k]
                ax, ay = coords[start + (k - 1) % n]
                bx, by = coords[start + (k + 1) % n]
                ix, iy = px - ax, py - ay
                ox, oy = bx - px, by - py
                li = math.hypot(ix, iy) or 1.0
                lo = math.hypot(ox, oy) or 1.0
                ix, iy, ox, oy = ix / li, iy / li, ox / lo, oy / lo
                d = max(0.35, 1 + ix * ox + iy * oy)  # 1 + cos(turn); floored so sharp corners do not spike
                nx, ny = (iy + oy) * sign, -(ix + ox) * sign
                out.append((px + nx * half / d + half, py + ny * half / d))
            start = end + 1
        for i, (x, y) in enumerate(out):
            coords[i] = (int(round(x)), int(round(y)))
        g.recalcBounds(glyf)
        adv, _ = hmtx.metrics[name]
        hmtx.metrics[name] = (int(round(adv + s)), g.xMin)
    if 'OS/2' in font:
        font['OS/2'].usWeightClass = 700
        font['OS/2'].fsSelection = (font['OS/2'].fsSelection | 0x20) & ~0x40  # BOLD on, REGULAR off
    font['head'].macStyle |= 1
    if 'name' in font:
        for rec in font['name'].names:
            if rec.nameID == 2:
                rec.string = 'Bold'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--index', type=int, default=0, help='face number inside a .ttc collection')
    ap.add_argument('--embolden', action='store_true', help='write a synthetic Bold face (the family has none)')
    a = ap.parse_args()
    font = TTFont(a.src, fontNumber=a.index, lazy=False)
    font.flavor = None  # WOFF/WOFF2 → plain sfnt
    if 'glyf' not in font:
        to_truetype(font)
    if a.embolden:
        embolden(font)
    if 'OS/2' in font:
        font['OS/2'].fsType = 0
    font.save(a.dst)
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
