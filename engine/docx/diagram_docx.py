"""A workflow diagram as native, editable Word shapes (DrawingML, one wpg group).

Reads the primitives engine/diagram.mjs `resolve()` produced (export.mjs stores them on the block
as `resolved`): rounded boxes, stadiums, diamonds, notes, circles, polylines with open arrowheads,
and text boxes. Every shape and every label stays a shape or a text box in Word: movable,
recolourable, retypable. No picture is embedded.
"""
from __future__ import annotations

from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

EMU_IN = 914400
NS = (nsdecls('w', 'wp', 'a', 'pic', 'r') +
      ' xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"'
      ' xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"'
      ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"')


def _hex(c):
    c = str(c or '').lstrip('#')
    if len(c) == 3:
        c = ''.join(ch * 2 for ch in c)
    return c.upper() if len(c) == 6 else None


def _esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def _dash(d):
    if not d:
        return ''
    return '<a:prstDash val="sysDot"/>' if d.startswith(('1', '2')) else '<a:prstDash val="dash"/>'


class _Canvas:
    def __init__(self, view, max_w_in, max_h_in):
        self.vx, self.vy, vw, vh = view['x'], view['y'], view['w'], view['h']
        self.k = min(max_w_in / vw, max_h_in / vh) * EMU_IN  # EMU per drawing unit
        self.cx, self.cy = int(vw * self.k), int(vh * self.k)
        self.parts = []
        self.n = 1

    def e(self, v):
        return int(round(v * self.k))

    def X(self, x):
        return self.e(x - self.vx)

    def Y(self, y):
        return self.e(y - self.vy)

    def nid(self):
        self.n += 1
        return self.n

    def ln(self, color, w, dash='', arrow=False):
        c = _hex(color)
        if not c or not w:
            return '<a:ln><a:noFill/></a:ln>'
        tail = '<a:tailEnd type="arrow" w="med" len="med"/>' if arrow else ''
        return f'<a:ln w="{max(3175, self.e(w))}" cap="rnd"><a:solidFill><a:srgbClr val="{c}"/></a:solidFill>{_dash(dash)}<a:round/>{tail}</a:ln>'

    @staticmethod
    def fill(color):
        c = _hex(color)
        return f'<a:solidFill><a:srgbClr val="{c}"/></a:solidFill>' if c else '<a:noFill/>'

    def shape(self, prst, x, y, w, h, fill, line, lw, dash='', adj='', geom=None, name='Shape'):
        g = geom or f'<a:prstGeom prst="{prst}"><a:avLst>{adj}</a:avLst></a:prstGeom>'
        self.parts.append(
            f'<wps:wsp><wps:cNvPr id="{self.nid()}" name="{name} {self.n}"/><wps:cNvSpPr/>'
            f'<wps:spPr><a:xfrm><a:off x="{self.X(x)}" y="{self.Y(y)}"/><a:ext cx="{max(1, self.e(w))}" cy="{max(1, self.e(h))}"/></a:xfrm>'
            f'{g}{self.fill(fill)}{self.ln(line, lw, dash)}</wps:spPr><wps:bodyPr/></wps:wsp>')

    def poly(self, pts, color, lw, dash='', arrow=False, closed=False):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        x0, y0 = min(xs), min(ys)
        w, h = max(xs) - x0, max(ys) - y0
        W, H = max(1, self.e(w)), max(1, self.e(h))
        path = ''.join(f'<a:{"moveTo" if i == 0 else "lnTo"}><a:pt x="{self.e(px - x0)}" y="{self.e(py - y0)}"/></a:{"moveTo" if i == 0 else "lnTo"}>' for i, (px, py) in enumerate(pts))
        if closed:
            path += '<a:close/>'
        nofill = '' if closed else ' fill="none"'
        geom = f'<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="{W}" h="{H}"{nofill}>{path}</a:path></a:pathLst></a:custGeom>'
        self.parts.append(
            f'<wps:wsp><wps:cNvPr id="{self.nid()}" name="Line {self.n}"/><wps:cNvSpPr/>'
            f'<wps:spPr><a:xfrm><a:off x="{self.X(x0)}" y="{self.Y(y0)}"/><a:ext cx="{W}" cy="{H}"/></a:xfrm>'
            f'{geom}<a:noFill/>{self.ln(color, lw, dash, arrow)}</wps:spPr><wps:bodyPr/></wps:wsp>')

    def text(self, t, font):
        b = t['box']
        pad = 2
        x, y, w, h = b['x'] - pad, b['y'] - pad, b['w'] + 2 * pad, b['h'] + 2 * pad
        half_pts = max(8, int(round(t['size'] * self.k / EMU_IN * 72 * 2)))
        c = _hex(t['color']) or '000000'
        bold = '<w:b/><w:bCs/>' if (t.get('weight') or 400) >= 600 else ''
        rtl = t.get('rtl')
        paras = ''.join(
            f'<w:p><w:pPr>{"<w:bidi/>" if rtl else ""}<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>'
            f'<w:r><w:rPr><w:rFonts w:ascii="{font}" w:hAnsi="{font}" w:cs="{font}"/>{bold}{"<w:rtl/>" if rtl else ""}'
            f'<w:color w:val="{c}"/><w:sz w:val="{half_pts}"/><w:szCs w:val="{half_pts}"/></w:rPr><w:t xml:space="preserve">{_esc(line)}</w:t></w:r></w:p>'
            for line in t['lines'])
        fill = self.fill(t.get('plate')) if t.get('plate') else '<a:noFill/>'
        self.parts.append(
            f'<wps:wsp><wps:cNvPr id="{self.nid()}" name="Text {self.n}"/><wps:cNvSpPr txBox="1"/>'
            f'<wps:spPr><a:xfrm><a:off x="{self.X(x)}" y="{self.Y(y)}"/><a:ext cx="{max(1, self.e(w))}" cy="{max(1, self.e(h))}"/></a:xfrm>'
            f'<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>{fill}<a:ln><a:noFill/></a:ln></wps:spPr>'
            f'<wps:txbx><w:txbxContent>{paras}</w:txbxContent></wps:txbx>'
            f'<wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" anchorCtr="1"><a:noAutofit/></wps:bodyPr></wps:wsp>')

    def xml(self, title):
        group = (f'<wpg:wgp><wpg:cNvGrpSpPr/><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{self.cx}" cy="{self.cy}"/>'
                 f'<a:chOff x="0" y="0"/><a:chExt cx="{self.cx}" cy="{self.cy}"/></a:xfrm></wpg:grpSpPr>{"".join(self.parts)}</wpg:wgp>')
        return (f'<w:r {NS}><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{self.cx}" cy="{self.cy}"/>'
                f'<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="{abs(hash(title)) % 100000 + 1000}" name="Diagram" descr="{_esc(title)}"/>'
                f'<wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup">'
                f'{group}</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')


def diagram_run(resolved, font, title='', max_w_in=10.2, max_h_in=5.5):
    """One <w:r> holding the whole diagram as a native shape group."""
    cv = _Canvas(resolved['view'], max_w_in, max_h_in)
    v = resolved['view']
    cv.shape('rect', v['x'], v['y'], v['w'], v['h'], '#FFFFFF', None, 0, name='Paper')
    for it in resolved['items']:
        t = it['t']
        if t == 'shape':
            if it.get('fill') == 'none' and it.get('line') == 'none':
                continue
            g = it.get('geom')
            if g == 'diamond':
                cv.shape('diamond', it['x'], it['y'], it['w'], it['h'], it['fill'], it['line'], it['lw'], it.get('dash', ''))
            elif g == 'note':
                cv.shape('foldedCorner', it['x'], it['y'], it['w'], it['h'], it['fill'], it['line'], it['lw'])
            elif g == 'rect':
                cv.shape('rect', it['x'], it['y'], it['w'], it['h'], it['fill'], it['line'], it['lw'], it.get('dash', ''))
            else:
                rx = it['h'] / 2 if g == 'stadium' else (it.get('rx') or 10)
                adj = f'<a:gd name="adj" fmla="val {int(min(50000, rx / max(1, min(it["w"], it["h"])) * 100000))}"/>'
                cv.shape('roundRect', it['x'], it['y'], it['w'], it['h'], it['fill'], it['line'], it['lw'], it.get('dash', ''), adj=adj)
        elif t == 'circle':
            r = it['r']
            cv.shape('ellipse', it['cx'] - r, it['cy'] - r, 2 * r, 2 * r, it.get('fill'), it['color'], it['lw'], it.get('dash', ''))
        elif t == 'line':
            cv.poly(it['pts'], it['color'], it['lw'], it.get('dash', ''), bool(it.get('arrow')))
        elif t == 'text':
            cv.text(it, font)
    return parse_xml(cv.xml(title))
