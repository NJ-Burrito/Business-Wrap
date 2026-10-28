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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--index', type=int, default=0, help='face number inside a .ttc collection')
    a = ap.parse_args()
    font = TTFont(a.src, fontNumber=a.index, lazy=False)
    font.flavor = None  # WOFF/WOFF2 → plain sfnt
    if 'glyf' not in font:
        to_truetype(font)
    if 'OS/2' in font:
        font['OS/2'].fsType = 0
    font.save(a.dst)
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
