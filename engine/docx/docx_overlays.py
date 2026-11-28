from __future__ import annotations
import model_docx as MD
import re
from docx.oxml import parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.shared import Pt
from pathlib import Path
import build_docx as _b
from build_docx import DEFAULT_BODY_FONT, LOCALE
from docx_text import add_script_runs

# ── free-placed logos and images (document "overlays"), at the PDF's exact position ──
# Coordinates are millimetres: cover = from the cover page's top-left; every = page x, y below the
# body top margin (18 mm, as the print @page); anchor = page x (content starts at 16 mm) and y from
# the anchor block's own position. Images are re-encoded PNG/JPEG data URIs from the editor.
_OV_SEQ = [0]


def _ov_image(o, workdir):
    import base64
    m = re.match(r'data:image/(png|jpeg);base64,(.+)$', str(o.get('src', '')))
    if not m:
        return None
    _OV_SEQ[0] += 1
    f = Path(workdir) / f'overlay-{_OV_SEQ[0]}.{"png" if m.group(1) == "png" else "jpg"}'
    f.write_bytes(base64.b64decode(m.group(2)))
    return f


def anchored_picture(paragraph, img, x_mm, y_mm, w_mm, h_rel='page', v_rel='page'):
    from docx.shared import Mm
    run = paragraph.add_run()
    inline = run.add_picture(str(img), width=Mm(max(4.0, float(w_mm))))._inline
    emu = lambda mm: int(round(float(mm) * 36000))
    _OV_SEQ[0] += 1
    anchor = parse_xml(
        f'<wp:anchor {nsdecls("wp")} distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        f'relativeHeight="{251659264 + _OV_SEQ[0]}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
        f'<wp:simplePos x="0" y="0"/>'
        f'<wp:positionH relativeFrom="{h_rel}"><wp:posOffset>{emu(x_mm)}</wp:posOffset></wp:positionH>'
        f'<wp:positionV relativeFrom="{v_rel}"><wp:posOffset>{emu(y_mm)}</wp:posOffset></wp:positionV>'
        f'</wp:anchor>')
    anchor.append(inline.find(qn('wp:extent')))
    anchor.append(parse_xml(f'<wp:effectExtent {nsdecls("wp")} l="0" t="0" r="0" b="0"/>'))
    anchor.append(parse_xml(f'<wp:wrapNone {nsdecls("wp")}/>'))
    anchor.append(inline.find(qn('wp:docPr')))
    cnv = inline.find(qn('wp:cNvGraphicFramePr'))
    if cnv is not None:
        anchor.append(cnv)
    anchor.append(inline.find(qn('a:graphic')))
    inline.getparent().replace(inline, anchor)


def _ov_host(paragraph_parent_add):
    p = paragraph_parent_add()
    pf = p.paragraph_format
    pf.space_before = pf.space_after = Pt(0)
    pf.line_spacing = Pt(1)
    return p


def place_overlays(document, data, workdir, cover_section, body_section):
    for o in data.get('overlays') or []:
        if o.get('kind') == 'text':
            continue
        img = _ov_image(o, workdir)
        if not img:
            continue
        x, y, w = float(o.get('x', 0)), float(o.get('y', 0)), float(o.get('w', 30))
        if o.get('mode') == 'cover':
            anchored_picture(_ov_host(cover_section.header.add_paragraph), img, x, y, w)
        elif o.get('mode') == 'every':
            anchored_picture(_ov_host(body_section.header.add_paragraph), img, x, y + 18, w)


def anchor_overlays(document, data, workdir, ptr, ids=None, font=DEFAULT_BODY_FONT):
    ids = ids or {}
    def at(o):
        return ids.get(str(o.get('anchor')), o.get('anchor'))
    hits = [o for o in (data.get('overlays') or []) if (o.get('mode') == 'anchor' or (o.get('wrap') and not o.get('mode'))) and at(o) == ptr]
    if not hits:
        return
    host = _ov_host(document.add_paragraph)
    for o in hits:
        if o.get('kind') == 'text':
            MD.text_box(host, o, font, _b._THEME_ROLES, LOCALE, add_script_runs)
            continue
        img = _ov_image(o, workdir)
        if img and o.get('wrap'):
            MD.wrapped_picture(host, img, o)
        elif img:
            anchored_picture(host, img, float(o.get('x', 0)) + 16, float(o.get('y', 0)), float(o.get('w', 30)), 'page', 'paragraph')
