"""The 0.13.0 document model in DOCX (A5 A6 A15 A18 A19 A23 A25 A26), next to build_docx.py.

Each function mirrors one part of engine/render.mjs so the DOCX and the PDF read the same JSON:
rich leaves (marks, paragraph style, nested lists), page segments (size, orientation, scoped
header/footer items), page breaks, the materialised control table, wrap modes for anchored
images and DrawingML text boxes. A document that uses none of it builds exactly as in 0.12.0.
"""
from __future__ import annotations
import base64, re
from pathlib import Path
from docx.shared import Pt, Mm, Emu
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.opc.constants import RELATIONSHIP_TYPE as RT

HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
HREF = re.compile(r'^(https?://|mailto:)[^\s"\'<>]+$', re.I)
FONT_FAMILIES = ('Thmanyah Serif Text', 'Thmanyah Serif Display', 'Thmanyah Sans')
PAPER = {'A3': (297, 420), 'A4': (210, 297), 'A5': (148, 210), 'B5': (176, 250), 'Letter': (215.9, 279.4), 'Legal': (215.9, 355.6), 'Tabloid': (279.4, 431.8)}
CONTROL_KEYS = ('documentId', 'title', 'preparedBy', 'documentType', 'classification', 'owner', 'issuedOn', 'version', 'status', 'reviewCycle')


def is_rich(v) -> bool:
    return isinstance(v, dict) and isinstance(v.get('text'), str) and ('marks' in v or 'style' in v)


def text_of(v) -> str:
    """The words of a leaf (string or rich), as edits.mjs textOf."""
    if v is None:
        return ''
    if is_rich(v):
        return v['text']
    if isinstance(v, (dict, list)):
        return ''
    return str(v)


# ── rich leaves ──────────────────────────────────────────────────────────────
def _rpr_mark(run, marks):
    rPr = run._element.get_or_add_rPr()
    types = {m[2] for m in marks}
    for t, tag in (('b', 'w:b'), ('i', 'w:i'), ('s', 'w:strike')):
        if t in types:
            rPr.append(OxmlElement(tag))
            if t in ('b', 'i'):
                rPr.append(OxmlElement(tag + 'Cs'))
    if 'u' in types or 'link' in types:
        u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); rPr.append(u)
    for m in marks:
        v = m[3] if len(m) > 3 else None
        if m[2] == 'color' and HEX.match(str(v or '')):
            c = OxmlElement('w:color'); c.set(qn('w:val'), str(v)[1:].upper()); rPr.append(c)
        elif m[2] == 'size' and isinstance(v, (int, float)) and 5 <= v <= 72:
            for tag in ('w:sz', 'w:szCs'):
                e = OxmlElement(tag); e.set(qn('w:val'), str(int(round(v * 2)))); rPr.append(e)
        elif m[2] == 'font' and str(v) in FONT_FAMILIES:
            rf = rPr.find(qn('w:rFonts'))
            if rf is None:
                rf = OxmlElement('w:rFonts'); rPr.append(rf)
            for slot in ('w:ascii', 'w:hAnsi', 'w:cs'):
                rf.set(qn(slot), str(v))
        elif m[2] == 'code':
            shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), 'F2EEE6'); rPr.append(shd)


def _hyperlink(paragraph, runs, href):
    rid = paragraph.part.relate_to(href, RT.HYPERLINK, is_external=True)
    h = OxmlElement('w:hyperlink'); h.set(qn('r:id'), rid)
    runs[0]._element.addprevious(h)
    for r in runs:
        h.append(r._element)


def add_leaf(paragraph, leaf, font, add_script_runs, bold=False):
    """A leaf into a paragraph: a string through add_script_runs (0.12.0), a rich leaf run by run with its marks."""
    if not is_rich(leaf):
        return add_script_runs(paragraph, text_of(leaf), font, bold=bold)
    text = leaf['text']
    marks = [m for m in (leaf.get('marks') or []) if isinstance(m, list) and len(m) >= 3 and m[1] > m[0]]
    cuts = sorted({0, len(text), *[max(0, min(len(text), int(x))) for m in marks for x in m[:2]]})
    for a, b in zip(cuts, cuts[1:]):
        seg = text[a:b]
        if not seg:
            continue
        on = [m for m in marks if m[0] <= a and m[1] >= b]
        before = len(paragraph.runs)
        add_script_runs(paragraph, seg, font, bold=bold)
        new = paragraph.runs[before:]
        for r in new:
            _rpr_mark(r, on)
        link = next((m for m in on if m[2] == 'link' and len(m) > 3 and HREF.match(str(m[3]))), None)
        if link and new:
            _hyperlink(paragraph, new, str(link[3]))
    style_paragraph(paragraph, leaf.get('style') or {})


def style_paragraph(paragraph, st):
    pPr = paragraph._p.get_or_add_pPr()
    al = {'start': 'start', 'center': 'center', 'end': 'end', 'justify': 'both'}.get(st.get('align'))
    if al:
        for old in pPr.findall(qn('w:jc')):
            pPr.remove(old)
        jc = OxmlElement('w:jc'); jc.set(qn('w:val'), al); pPr.append(jc)
    pf = paragraph.paragraph_format
    if isinstance(st.get('spaceBefore'), (int, float)):
        pf.space_before = Mm(st['spaceBefore'])
    if isinstance(st.get('spaceAfter'), (int, float)):
        pf.space_after = Mm(st['spaceAfter'])
    if isinstance(st.get('lineHeight'), (int, float)) and 0.8 <= st['lineHeight'] <= 4:
        pf.line_spacing = float(st['lineHeight'])
    if st.get('quote'):
        pf.left_indent = pf.right_indent = Mm(6)
        bdr = OxmlElement('w:pBdr'); edge = OxmlElement('w:start')
        for k, v in (('w:val', 'single'), ('w:sz', '18'), ('w:space', '8'), ('w:color', 'C8A96A')):
            edge.set(qn(k), v)
        bdr.append(edge); pPr.append(bdr)


def cell_valign(cell, leaf):
    v = {'top': 'top', 'middle': 'center', 'bottom': 'bottom'}.get(((leaf.get('style') or {}) if is_rich(leaf) else {}).get('valign'))
    if v:
        tcPr = cell._tc.get_or_add_tcPr()
        e = OxmlElement('w:vAlign'); e.set(qn('w:val'), v); tcPr.append(e)


# ── nested lists: one abstractNum per list kind, 9 levels (Word's own model) ──
_NUM = {}
_FMT = ['decimal', 'lowerLetter', 'lowerRoman']
_CSS_TO_WORD = {'decimal': 'decimal', 'lower-alpha': 'lowerLetter', 'upper-alpha': 'upperLetter', 'lower-roman': 'lowerRoman', 'upper-roman': 'upperRoman', 'arabic-indic': 'arabicAbjad'}
_BULLETS = ['•', '◦', '▪']


def list_info(leaf):
    st = (leaf.get('style') or {}) if is_rich(leaf) else {}
    kind = st.get('list')
    if not kind:
        return None
    level = max(0, min(8, int(st.get('level') or 0)))
    if kind in ('bullet', 'number'):
        info = {'kind': kind, 'level': level, 'fmt': st.get('numFormat')}
        sv = st.get('start')  # 0.14.0 (E2): a number run starts at this value, or goes on from the previous list
        if kind == 'number' and (sv == 'continue' or (isinstance(sv, (int, float)) and not isinstance(sv, bool) and 0 <= sv <= 9999)):
            info['start'] = sv if sv == 'continue' else int(sv)
        return info
    m = re.match(r'^shape:(.)$', str(kind))
    return {'kind': 'shape', 'shape': m.group(1), 'level': level} if m and m.group(1) in '•◦▪–✓➤' else None


def _num_id(document, key, levels_xml):
    if key in _NUM:
        return _NUM[key]
    root = document.part.numbering_part.numbering_definitions._numbering
    abs_ids = [int(e.get(qn('w:abstractNumId'))) for e in root.findall(qn('w:abstractNum'))]
    num_ids = [int(e.get(qn('w:numId'))) for e in root.findall(qn('w:num'))]
    aid, nid = max(abs_ids + [100]) + 1, max(num_ids + [100]) + 1
    absn = parse_xml(f'<w:abstractNum {nsdecls("w")} w:abstractNumId="{aid}"><w:multiLevelType w:val="multilevel"/>{levels_xml}</w:abstractNum>')
    first_num = root.find(qn('w:num'))
    if first_num is not None:
        first_num.addprevious(absn)
    else:
        root.append(absn)
    root.append(parse_xml(f'<w:num {nsdecls("w")} w:numId="{nid}"><w:abstractNumId w:val="{aid}"/></w:num>'))
    _NUM[key] = nid
    return nid


def list_num_id(document, info):
    lv = []
    for i in range(9):
        ind = 360 * (i + 1)
        if info['kind'] == 'number':
            fmt = _CSS_TO_WORD.get(info.get('fmt')) if i == info['level'] and info.get('fmt') else _FMT[i % 3]
            lv.append(f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/><w:lvlText w:val="%{i + 1}."/><w:lvlJc w:val="start"/><w:pPr><w:ind w:start="{ind}" w:hanging="300"/></w:pPr></w:lvl>')
        else:
            ch = info['shape'] if info['kind'] == 'shape' else _BULLETS[i % 3]
            lv.append(f'<w:lvl w:ilvl="{i}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="{ch}"/><w:lvlJc w:val="start"/><w:pPr><w:ind w:start="{ind}" w:hanging="300"/></w:pPr></w:lvl>')
    key = (info['kind'], info.get('shape'), info.get('fmt') if info['kind'] == 'number' else None, info['level'] if info.get('fmt') else None)
    return _num_id(document, key, ''.join(lv))


_RUN = {}


def _run_num_id(document, paragraph, info, base):
    """0.14.0 (E2): a number run with a start value gets its own w:num (startOverride) and its next items follow it;
    a run that goes on ('continue') or has no start keeps the shared list, as before."""
    lv = info['level']
    start = info.get('start')
    if info['kind'] != 'number':
        return base
    if isinstance(start, int):
        root = document.part.numbering_part.numbering_definitions._numbering
        abs_id = next((n.find(qn('w:abstractNumId')).get(qn('w:val')) for n in root.findall(qn('w:num')) if n.get(qn('w:numId')) == str(base)), '0')
        nid = max([int(e.get(qn('w:numId'))) for e in root.findall(qn('w:num'))] + [100]) + 1
        root.append(parse_xml(f'<w:num {nsdecls("w")} w:numId="{nid}"><w:abstractNumId w:val="{abs_id}"/><w:lvlOverride w:ilvl="{lv}"><w:startOverride w:val="{start}"/></w:lvlOverride></w:num>'))
        _RUN[lv] = nid
        return nid
    if start == 'continue':
        _RUN.pop(lv, None)
        return base
    # no start: stay in the run opened above while the previous paragraphs are its items (or deeper items of it)
    prev = paragraph._p.getprevious()
    while prev is not None:
        n = prev.find(qn('w:pPr') + '/' + qn('w:numPr'))
        if n is None:
            break
        pl = int(n.find(qn('w:ilvl')).get(qn('w:val')))
        if pl > lv:
            prev = prev.getprevious()
            continue
        if pl == lv and _RUN.get(lv) is not None and n.find(qn('w:numId')).get(qn('w:val')) == str(_RUN[lv]):
            return _RUN[lv]
        break
    _RUN.pop(lv, None)
    return base


def number_paragraph(document, paragraph, info):
    pPr = paragraph._p.get_or_add_pPr()
    numPr = OxmlElement('w:numPr')
    il = OxmlElement('w:ilvl'); il.set(qn('w:val'), str(info['level']))
    ni = OxmlElement('w:numId'); ni.set(qn('w:val'), str(_run_num_id(document, paragraph, info, list_num_id(document, info))))
    numPr.append(il); numPr.append(ni)
    pPr.insert(0, numPr)



# ── spreadsheet cells (0.14.0, engine/cells.mjs): lines, lists, fill, wrap, merges, sizes ──
def leaf_lines(leaf):
    """A cell's lines ('\n'), marks sliced as engine/cells.mjs splitLines; strings give strings."""
    text = text_of(leaf)
    if not is_rich(leaf):
        return text.split(chr(10))
    out, at = [], 0
    for ln in text.split(chr(10)):
        a, b = at, at + len(ln)
        at = b + 1
        marks = [[max(m[0], a) - a, min(m[1], b) - a, *m[2:]] for m in (leaf.get('marks') or []) if isinstance(m, list) and len(m) >= 3 and min(m[1], b) > max(m[0], a)]
        out.append({**leaf, 'text': ln, 'marks': marks})
    return out


def fill_cell(document, cell, leaf, font, add_script_runs, bold=False):
    """A body cell: one paragraph per line (a list numbers each line), fill, no-wrap."""
    st = (leaf.get('style') or {}) if is_rich(leaf) else {}
    info = list_info(leaf)
    for i, ln in enumerate(leaf_lines(leaf)):
        p = cell.paragraphs[0] if i == 0 else cell.add_paragraph()
        add_leaf(p, ln if is_rich(ln) else str(ln), font, add_script_runs, bold=bold)
        if info:
            number_paragraph(document, p, info)
    tcPr = cell._tc.get_or_add_tcPr()
    if HEX.match(str(st.get('fill') or '')):
        shd = OxmlElement('w:shd'); shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), st['fill'][1:].upper()); tcPr.append(shd)
    if st.get('wrap') is False:
        tcPr.append(OxmlElement('w:noWrap'))

# ── pages: breaks, sizes, segments ───────────────────────────────────────────
def page_break(document):
    p = document.add_paragraph()
    br = OxmlElement('w:br'); br.set(qn('w:type'), 'page')
    p.add_run()._r.append(br)
    pf = p.paragraph_format
    pf.space_before = pf.space_after = Pt(0)
    return p


def page_spec(p):
    p = p or {}
    size = p.get('size')
    if isinstance(size, dict) and 50 < float(size.get('w', 0)) < 1200 and 50 < float(size.get('h', 0)) < 1200:
        w, h = float(size['w']), float(size['h'])
    else:
        w, h = PAPER.get(size, PAPER['A4'])
    land = p.get('orientation') == 'landscape'
    if land != (w > h):
        w, h = h, w
    return {'w': w, 'h': h, 'landscape': land}


def apply_page(section, spec):
    from docx.enum.section import WD_ORIENT
    section.orientation = WD_ORIENT.LANDSCAPE if spec['landscape'] else WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = Mm(spec['w']), Mm(spec['h'])


def page_model(data):
    """As render.mjs pageModel: segment starts {block ptr: {page, only, from}} and block ids."""
    order = [(f'/chapters/{ci}/sections/{si}/blocks/{bi}', b) for ci, ch in enumerate(data.get('chapters') or []) for si, sec in enumerate(ch.get('sections') or []) for bi, b in enumerate(sec.get('blocks') or [])]
    ids = {}
    for p, b in order:
        if isinstance(b, dict) and b.get('id'):
            ids.setdefault(str(b['id']), p)
    known = {p for p, _ in order}
    scoped = {}
    for part in ('header', 'footer'):
        for i, it in enumerate(((data.get('chrome') or {}).get(part) or {}).get('items') or []):
            if it.get('scope') not in ('only', 'from'):
                continue
            a = it.get('anchor')
            at = ids.get(str(a)) or (a if a in known else None)
            if at:
                scoped.setdefault(at, []).append({**it, 'part': part, 'i': i})
    page = (data.get('layout') or {}).get('page') or {}
    starts, frm = {}, []
    for p, b in order:
        lp = ((b or {}).get('layout') or {}).get('page')
        items = scoped.get(p, [])
        if isinstance(lp, dict) or items:
            if isinstance(lp, dict):
                page = {**((data.get('layout') or {}).get('page') or {}), **lp}
            frm = frm + [x for x in items if x['scope'] == 'from']
            starts[p] = {'page': page_spec(page), 'only': [x for x in items if x['scope'] == 'only'], 'from': list(frm)}
    return starts, ids


# ── running header / footer items (A5, A6) ──────────────────────────────────
def chrome_items(data, part, seg=None):
    items = [{**it, 'part': part, 'i': i} for i, it in enumerate(((data.get('chrome') or {}).get(part) or {}).get('items') or [])]
    out = [it for it in items if it.get('scope', 'all') == 'all']
    if seg:
        out += [it for it in seg.get('from', []) + seg.get('only', []) if it['part'] == part]
    return [it for it in out if not it.get('hidden')]


def _field(paragraph, instr):
    r = paragraph.add_run()._r
    for kind, txt in (('begin', None), (None, instr), ('end', None)):
        if kind:
            e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), kind)
        else:
            e = OxmlElement('w:instrText'); e.set(qn('xml:space'), 'preserve'); e.text = txt
        r.append(e)


def _pages_less_cover(paragraph):
    """{ = { NUMPAGES } - 1 }: the cover carries no folio, so N counts the sheets after it (as the PDF)."""
    def fc(kind):
        e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), kind); r = paragraph.add_run()._r; r.append(e)
    def it(t):
        e = OxmlElement('w:instrText'); e.set(qn('xml:space'), 'preserve'); e.text = t; r = paragraph.add_run()._r; r.append(e)
    fc('begin'); it(' = '); fc('begin'); it(' NUMPAGES '); fc('separate'); paragraph.add_run('2'); fc('end'); it(' - 1 '); fc('separate'); paragraph.add_run('1'); fc('end')


def write_band(hf, items, data, labels, roles, locale, font, add_script_runs, logo, workdir, sizes):
    """One header or footer part: three slots (physical left / centre / right) on one tabbed line."""
    from docx.enum.text import WD_TAB_ALIGNMENT
    from docx.shared import RGBColor
    hf.is_linked_to_previous = False
    for p in list(hf.paragraphs)[1:]:
        p._p.getparent().remove(p._p)
    p = hf.paragraphs[0] if hf.paragraphs else hf.add_paragraph()
    for r in list(p._p):
        if r.tag != qn('w:pPr'):
            p._p.remove(r)
    sec = hf._parent if hasattr(hf, '_parent') else None
    ar = locale == 'ar'
    phys = lambda a: 'center' if a == 'center' else ('right' if (a == 'start') == ar else 'left')
    slots = {'left': [], 'center': [], 'right': []}
    for it in items:
        slots[phys(it.get('align') or 'start')].append(it)
    ctrl = data.get('control') or {}
    muted = roles.get('muted', '544C3B').lstrip('#')
    for k, side in enumerate(('left', 'center', 'right')):
        if k:
            p.add_run('\t')
        for j, it in enumerate(slots[side]):
            if j:
                p.add_run('  ')
            before = len(p.runs)
            if it['kind'] == 'logo':
                img = _logo_file(it, logo, workdir)
                if img:
                    p.add_run().add_picture(str(img), height=Mm(5))
                continue
            if it['kind'] == 'page':
                _field(p, 'PAGE')
                if it.get('value') == 'n/N':
                    p.add_run(' / ')
                    _pages_less_cover(p)
            else:
                if it['kind'] == 'text':
                    txt = text_of(it.get('value'))
                elif it.get('value') == 'confidentiality':
                    txt = (data.get('labels') or {}).get('confidential') or labels.get('confidential', '')
                elif it.get('value') == 'producer':
                    txt = labels.get('producer', '')
                else:
                    txt = text_of(ctrl.get(it.get('value'), ''))
                add_script_runs(p, txt, font, bold=it.get('value') in ('confidentiality', 'producer') or bool((it.get('style') or {}).get('bold')))
            for r in p.runs[before:]:
                r.font.size = Pt(sizes['micro'])
                r.font.color.rgb = RGBColor.from_string((roles.get('signal', 'B42318') if it.get('value') == 'confidentiality' else muted).lstrip('#').upper())
    return p


def tab_stops(p, section):
    from docx.enum.text import WD_TAB_ALIGNMENT
    w = section.page_width - section.left_margin - section.right_margin
    p.paragraph_format.tab_stops.add_tab_stop(int(w // 2), WD_TAB_ALIGNMENT.CENTER)
    p.paragraph_format.tab_stops.add_tab_stop(int(w), WD_TAB_ALIGNMENT.RIGHT)


def _logo_file(it, logo, workdir):
    m = re.match(r'data:image/(png|jpeg);base64,(.+)$', str(it.get('src') or ''))
    if m:
        f = Path(workdir) / f'chrome-logo-{it.get("part")}-{it.get("i")}.{"png" if m.group(1) == "png" else "jpg"}'
        f.write_bytes(base64.b64decode(m.group(2)))
        return f
    return logo if logo and Path(logo).exists() else None


# ── the materialised control table (A25) ────────────────────────────────────
def control_rows(data, labels):
    """[[label, value, …]] of doc.controlTable; a {bind: key} cell prints /control/<key>."""
    T = data.get('controlTable') or {}
    ctrl = data.get('control') or {}
    rows = [r for r in (T.get('rows') or []) if isinstance(r, list)]
    cols = T.get('columns')
    w = max([2, len(cols) if isinstance(cols, list) else int(cols or 0)] + [len(r) for r in rows])
    out = []
    for r in rows:
        row = []
        for k in range(w):
            v = r[k] if k < len(r) else ''
            if isinstance(v, dict) and not is_rich(v) and v.get('bind') in CONTROL_KEYS:
                row.append(text_of(ctrl.get(v['bind'], '')))
            else:
                row.append(text_of(v))
        out.append(row)
    return out


# ── anchored images with Word's wrap modes (A15) and text boxes (A23) ───────
WRAP_XML = {
    'square': '<wp:wrapSquare {ns} wrapText="bothSides"/>',
    'tight': '<wp:wrapTight {ns} wrapText="bothSides">{poly}</wp:wrapTight>',
    'through': '<wp:wrapThrough {ns} wrapText="bothSides">{poly}</wp:wrapThrough>',
    'topBottom': '<wp:wrapTopAndBottom {ns}/>',
    'behind': '<wp:wrapNone {ns}/>',
    'front': '<wp:wrapNone {ns}/>',
}
# ponytail: the tight/through polygon is the image rectangle (4 points), not its alpha outline; trace the outline if text must hug a shape
POLY = '<wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="0" y="21600"/><wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon>'
_SEQ = [0]


def _anchor_xml(wrap, x_mm, y_mm, cx, cy, graphic, name, h_rel='column', v_rel='paragraph'):
    _SEQ[0] += 1
    emu = lambda mm: int(round(float(mm) * 36000))
    ns = nsdecls('wp')
    w = WRAP_XML.get(wrap, WRAP_XML['front']).format(ns=ns, poly=POLY)
    behind = '1' if wrap == 'behind' else '0'
    side = 0 if wrap == 'through' else 114300  # through: the text runs up to (and into) the shape, no side gap; tight keeps 3.2 mm
    return (f'<wp:anchor {nsdecls("wp", "a", "pic", "r")} xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" distT="0" distB="0" distL="{side}" distR="{side}" simplePos="0" '
            f'relativeHeight="{251700000 + _SEQ[0]}" behindDoc="{behind}" locked="0" layoutInCell="1" allowOverlap="1">'
            f'<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="{h_rel}"><wp:posOffset>{emu(x_mm)}</wp:posOffset></wp:positionH>'
            f'<wp:positionV relativeFrom="{v_rel}"><wp:posOffset>{emu(y_mm)}</wp:posOffset></wp:positionV>'
            f'<wp:extent cx="{cx}" cy="{cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>{w}'
            f'<wp:docPr id="{3000 + _SEQ[0]}" name="{name} {_SEQ[0]}"/><wp:cNvGraphicFramePr/>{graphic}</wp:anchor>')


def wrapped_picture(paragraph, img, o):
    """An anchored picture with its wrap mode; inline → wp:inline in the paragraph."""
    w = max(4.0, float(o.get('w', 30)))
    run = paragraph.add_run()
    inline = run.add_picture(str(img), width=Mm(w))._inline
    wrap = o.get('wrap') or 'front'
    if wrap == 'inline':
        return
    ext = inline.find(qn('wp:extent'))
    graphic = inline.find(qn('a:graphic'))
    from lxml import etree
    xml = _anchor_xml(wrap, float(o.get('x', 0)), float(o.get('y', 0)), ext.get('cx'), ext.get('cy'), etree.tostring(graphic).decode(), 'Picture')
    inline.getparent().replace(inline, parse_xml(xml))


def text_box(paragraph, o, font, roles, locale, add_script_runs):
    """A DrawingML text box (wps:wsp + wps:txbx) anchored like an image; its words in both font slots."""
    from docx import Document
    w, h = max(4.0, float(o.get('w', 60))), max(4.0, float(o.get('h', 20)))
    cx, cy = int(w * 36000), int(h * 36000)
    # the box's paragraph is built by the same run writer, then serialised into w:txbxContent
    scratch = Document().add_paragraph()
    add_leaf(scratch, o.get('text', ''), font, add_script_runs)
    from lxml import etree
    para = etree.tostring(scratch._p).decode()
    st = o.get('style') or {}
    anchor = {'top': 't', 'middle': 'ctr', 'bottom': 'b'}.get(st.get('valign'), 't')
    fill = roles.get('card', '#FBF8F2').lstrip('#') if st.get('fill') is None else str(st.get('fill')).lstrip('#') if HEX.match(str(st.get('fill'))) else 'FFFFFF'
    line = '<a:ln w="9525"><a:noFill/></a:ln>' if st.get('border') == 'none' else f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{roles.get("rule-strong", "#C9BFAE").lstrip("#")}"/></a:solidFill></a:ln>'
    pad = int(float(st.get('padding', 3)) * 36000)
    graphic = (f'<a:graphic {nsdecls("a")}><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">'
               f'<wps:wsp xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:cNvSpPr txBox="1"/>'
               f'<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
               f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>{line}</wps:spPr>'
               f'<wps:txbx><w:txbxContent {nsdecls("w")}>{para}</w:txbxContent></wps:txbx>'
               f'<wps:bodyPr rot="0" vert="horz" wrap="square" lIns="{pad}" tIns="{pad}" rIns="{pad}" bIns="{pad}" anchor="{anchor}"><a:noAutofit/></wps:bodyPr></wps:wsp>'
               f'</a:graphicData></a:graphic>')
    wrap = o.get('wrap') or 'square'
    xml = _anchor_xml('square' if wrap == 'inline' else wrap, float(o.get('x', 0)), float(o.get('y', 0)), cx, cy, graphic, 'Text Box')
    r = OxmlElement('w:r')
    d = OxmlElement('w:drawing')
    d.append(parse_xml(xml))
    r.append(d)
    paragraph._p.append(r)
