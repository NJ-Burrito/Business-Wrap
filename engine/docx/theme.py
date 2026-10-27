"""Business-Wrap DOCX theme: styles, tables, cover and page chrome, coloured from the theme variables."""
from __future__ import annotations
import json, re
from pathlib import Path
from docx.shared import Pt, RGBColor, Inches, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import os
THEME_JSON = Path(os.environ.get('BW_THEME', Path(__file__).resolve().parents[1] / 'defaults' / 'theme.json'))
_ROLE_MAP = {'navy': 'primary', 'navy-deep': 'primary-deep', 'navy-wash': 'primary-50', 'navy-mid': 'primary', 'gold': 'accent', 'gold-rule': 'accent-rule', 'gold-bright': 'accent-bright', 'gold-wash': 'card'}

def load_roles() -> dict[str, str]:
    v = json.loads(THEME_JSON.read_text(encoding='utf-8'))['vars']
    roles = dict(v)
    for old, new in _ROLE_MAP.items():
        roles[old] = v.get(new, v.get('primary'))
    return roles

def load_ramps() -> dict[str, dict[str, str]]:
    v = json.loads(THEME_JSON.read_text(encoding='utf-8'))['vars']
    return {'navy': {'50': v['primary-50'], '100': v['primary-100']}, 'sand': {'800': v['ink']}}

def _bd_labels():
    import build_docx as _b
    return _b.L

def rgb(hexval: str) -> RGBColor:
    return RGBColor.from_string(hexval.lstrip('#').upper())

def all_theme_hexes(roles: dict[str, str]) -> set[str]:
    hexes = {v.lstrip('#').upper() for v in roles.values()}
    for ramp in load_ramps().values():
        for v in ramp.values():
            hexes.add(v.lstrip('#').upper())
    return hexes
SIZES = {'title': 24, 'h1': 18, 'h2': 16, 'h3': 14, 'body': 14, 'table': 12, 'meta': 10, 'micro': 9}
COVER_BREAK_RESERVE_TWIPS = 700
COVER_FOOTER_LIFT_TWIPS = 94
_TCPR_AFTER_BORDERS = ('w:shd', 'w:noWrap', 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:tcPrChange')
_TCPR_AFTER_SHD = _TCPR_AFTER_BORDERS[1:]
_EDGE_ORDER = ('top', 'start', 'left', 'bottom', 'end', 'right', 'insideH', 'insideV', 'tl2br', 'tr2bl')

def _insert_edge(borders, el, edge: str) -> None:
    rank = _EDGE_ORDER.index(edge)
    for child in borders:
        name = child.tag.split('}')[-1]
        if name in _EDGE_ORDER and _EDGE_ORDER.index(name) > rank:
            child.addprevious(el)
            return
    borders.append(el)

def set_cell_shading(cell, hexval: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    existing = tcPr.find(qn('w:shd'))
    if existing is not None:
        tcPr.remove(existing)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hexval.lstrip('#').upper())
    tcPr.insert_element_before(shd, *_TCPR_AFTER_SHD)

def set_cell_border(cell, edge: str, color_hex: str, sz_eighths_pt: int) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    borders = tcPr.find(qn('w:tcBorders'))
    if borders is None:
        borders = OxmlElement('w:tcBorders')
        tcPr.insert_element_before(borders, *_TCPR_AFTER_BORDERS)
    existing = borders.find(qn(f'w:{edge}'))
    if existing is not None:
        borders.remove(existing)
    el = OxmlElement(f'w:{edge}')
    el.set(qn('w:val'), 'single')
    el.set(qn('w:sz'), str(sz_eighths_pt))
    el.set(qn('w:space'), '0')
    el.set(qn('w:color'), color_hex.lstrip('#').upper())
    _insert_edge(borders, el, edge)

def set_cell_box(cell, color_hex: str, sz_eighths_pt: int) -> None:
    for edge in ('top', 'left', 'bottom', 'right'):
        set_cell_border(cell, edge, color_hex, sz_eighths_pt)

def faces(body: str) -> dict[str, str]:
    if 'serif text' not in body:
        return {'body': body, 'display': body, 'subhead': body, 'cover': body}
    display = body.replace('serif text', 'serif display')
    return {'body': body, 'display': display, 'subhead': f'{body} Med', 'cover': f'{display} Black'}

def _set_style_cs_font(style, font: str, size_pt: int | None=None) -> None:
    rPr = style.element.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)
    rFonts.set(qn('w:cs'), font)
    if size_pt is not None:
        existing = rPr.find(qn('w:szCs'))
        if existing is not None:
            rPr.remove(existing)
        szCs = OxmlElement('w:szCs')
        szCs.set(qn('w:val'), str(int(size_pt * 2)))
        rPr.insert_element_before(szCs, 'w:highlight', 'w:u', 'w:effect', 'w:bdr', 'w:shd', 'w:fitText', 'w:vertAlign', 'w:rtl', 'w:cs', 'w:em', 'w:lang', 'w:eastAsianLayout', 'w:specVanish', 'w:oMath')

def apply_cs_font_to_styles(document, font: str) -> None:
    styles = document.styles
    F = faces(font)
    for name, size, role in (('Normal', SIZES['body'], 'body'), ('Title', SIZES['title'], 'display'), ('Heading 1', SIZES['h1'], 'display'), ('Heading 2', SIZES['h2'], 'display'), ('Heading 3', SIZES['h3'], 'display')):
        _set_style_cs_font(styles[name], F[role], size)

def apply_style_scale(document, roles: dict[str, str], font: str) -> None:
    styles = document.styles
    F = faces(font)
    normal = styles['Normal']
    normal.font.size = Pt(SIZES['body'])
    normal.font.color.rgb = rgb(roles['ink'])
    title = styles['Title']
    title.font.size = Pt(SIZES['title'])
    title.font.color.rgb = rgb(roles['ink'])
    title.font.bold = True
    title_pPr = title.element.get_or_add_pPr()
    for bdr in title_pPr.findall(qn('w:pBdr')):
        title_pPr.remove(bdr)
    h1 = styles['Heading 1']
    h1.font.size = Pt(SIZES['h1'])
    h1.font.color.rgb = rgb(roles['navy'])
    h1.font.bold = True
    h1_pPr = h1.element.get_or_add_pPr()
    for bdr in h1_pPr.findall(qn('w:pBdr')):
        h1_pPr.remove(bdr)
    h1_pBdr = OxmlElement('w:pBdr')
    h1_bottom = OxmlElement('w:bottom')
    h1_bottom.set(qn('w:val'), 'single')
    h1_bottom.set(qn('w:sz'), '16')
    h1_bottom.set(qn('w:space'), '8')
    h1_bottom.set(qn('w:color'), roles['gold-rule'].lstrip('#').upper())
    h1_pBdr.append(h1_bottom)
    h1_pPr.append(h1_pBdr)
    h2 = styles['Heading 2']
    h2.font.size = Pt(SIZES['h2'])
    h2.font.color.rgb = rgb(roles['ink'])
    h2.font.bold = True
    h3 = styles['Heading 3']
    h3.font.size = Pt(SIZES['h3'])
    h3.font.color.rgb = rgb(roles['navy'])
    h3.font.bold = True
    for style in (title, h1, h2, h3):
        pf = style.paragraph_format
        pf.keep_with_next = True
        pf.keep_together = True
    _set_style_cs_font(normal, F['body'], SIZES['body'])
    for style, size in ((title, SIZES['title']), (h1, SIZES['h1']), (h2, SIZES['h2']), (h3, SIZES['h3'])):
        _set_style_cs_font(style, F['display'], size)
    settings_element = document.settings.element
    if settings_element.find(qn('w:widowControl')) is None:
        wc = OxmlElement('w:widowControl')
        wc.set(qn('w:val'), '1')
        settings_element.insert(0, wc)

def add_chapter_chip(heading_paragraph, number, font: str, roles: dict) -> None:
    run = heading_paragraph.add_run(f' {number} ')
    run.font.bold = True
    run.font.color.rgb = rgb('FFFFFF')
    rPr = run._element.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    for attr in ('w:ascii', 'w:hAnsi', 'w:cs'):
        rFonts.set(qn(attr), font)
    rPr.append(rFonts)
    if re.search('[\u0600-ۿ]', str(number)):
        rPr.append(OxmlElement('w:rtl'))
        lang = OxmlElement('w:lang')
        lang.set(qn('w:bidi'), 'ar-JO')
        rPr.append(lang)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), roles['navy'].lstrip('#').upper())
    rPr.append(shd)
    heading_paragraph.add_run('  ')

def style_control_table(table, roles: dict) -> None:
    for row in table.rows:
        if len(row.cells) < 2:
            continue
        label_cell, value_cell = (row.cells[0], row.cells[1])
        for p in label_cell.paragraphs:
            for run in p.runs:
                run.font.bold = False
                run.font.color.rgb = rgb(roles['muted'])
        for p in value_cell.paragraphs:
            for run in p.runs:
                run.font.bold = True

def _set_tbl_borders(table, roles: dict, edges: dict[str, tuple[str, int]]) -> None:
    tblPr = table._tbl.tblPr
    existing = tblPr.find(qn('w:tblBorders'))
    if existing is not None:
        tblPr.remove(existing)
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'start', 'left', 'bottom', 'end', 'right', 'insideH', 'insideV'):
        if edge not in edges:
            continue
        color_hex, sz = edges[edge]
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), str(sz))
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), color_hex.lstrip('#').upper())
        borders.append(el)
    tblPr.insert_element_before(borders, 'w:shd', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook', 'w:tblCaption', 'w:tblDescription', 'w:tblPrChange')

def style_story_card(table, roles: dict) -> None:
    _set_tbl_borders(table, roles, {e: (roles['rule-strong'], 4) for e in ('top', 'left', 'bottom', 'right')})
    for row in table.rows:
        cells = row.cells
        for i, cell in enumerate(cells):
            set_cell_box(cell, roles['rule'], 4)
            is_label = i == 0 and len(cells) > 1
            set_cell_shading(cell, roles['navy-wash'] if is_label else roles['paper'])
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.bold = is_label
                    run.font.color.rgb = rgb(roles['ink'])
                    run.font.size = Pt(SIZES['table'])

def style_contents_table(table, kinds: list[str], roles: dict) -> None:
    total = int(table._tbl.tblPr.find(qn('w:tblW')).get(qn('w:w')))
    widths = (Emu(int(Pt(total / 20) * 0.09)), Emu(int(Pt(total / 20) * 0.91)))
    for column, w in zip(table.columns, widths):
        column.width = w
    for row, cells_w in zip(table.rows, [widths] * len(table.rows)):
        for cell, w in zip(row.cells, cells_w):
            cell.width = w
    for n, row in enumerate(table.rows):
        kind = kinds[n] if n < len(kinds) else 'section'
        cells = row.cells
        if len(cells) < 2:
            continue
        num_cell, title_cell = (cells[0], cells[1])
        edge = roles['rule-strong'] if kind == 'chapter' else roles['rule']
        for cell in cells:
            set_cell_border(cell, 'bottom', edge, 4)
        for cell, colour in ((num_cell, roles['gold'] if kind == 'chapter' else roles['muted']), (title_cell, roles['navy'] if kind == 'chapter' else roles['muted'] if kind == 'card' else roles['ink'])):
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.bold = kind == 'chapter'
                    run.font.color.rgb = rgb(colour)
                    run.font.size = Pt(SIZES['table'])
        if kind == 'card':
            for p in title_cell.paragraphs:
                p.paragraph_format.left_indent = Inches(6 / 25.4)

def style_dictionary_table(table, roles: dict) -> None:
    ramps = load_ramps()
    rows = table.rows
    if not rows:
        return
    for cell in rows[0].cells:
        set_cell_box(cell, roles['rule'], 4)
        set_cell_border(cell, 'bottom', roles['rule-strong'], 4)
        set_cell_shading(cell, ramps['navy']['100'])
        for p in cell.paragraphs:
            for run in p.runs:
                run.font.color.rgb = rgb(roles['navy'])
    for n, row in enumerate(rows[1:]):
        fill = ramps['navy']['50'] if n % 2 else roles['paper']
        for cell in row.cells:
            set_cell_box(cell, roles['rule'], 4)
            set_cell_shading(cell, fill)

def build_cover(document, control: dict, roles: dict, font: str, logos: list[Path] | Path | None) -> None:
    from build_docx import add_script_runs, set_para_bidi
    table = document.add_table(rows=4, cols=2)
    table.autofit = False
    tblPr = table._tbl.tblPr
    tblW = tblPr.find(qn('w:tblW'))
    tblW.set(qn('w:w'), str(int(Inches(8.27).twips)))
    tblW.set(qn('w:type'), 'dxa')
    import build_docx as _b2
    if _b2.LOCALE == 'ar':
        tblPr.get_or_add_bidiVisual()
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'none')
        el.set(qn('w:sz'), '0')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), 'auto')
        borders.append(el)
    tblPr.insert_element_before(borders, 'w:shd', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook')
    MM = lambda mm: Inches(mm / 25.4)
    F = faces(font)
    SPINE_W, MAIN_W = (MM(20), Emu(Inches(8.27) - MM(20)))
    for column, w in zip(table.columns, (SPINE_W, MAIN_W)):
        column.width = w

    def _set_tcw(cell, width):
        cell.width = width

    def _exact(row, height):
        trPr = row._tr.get_or_add_trPr()
        trHeight = OxmlElement('w:trHeight')
        trHeight.set(qn('w:val'), str(int(height.twips)))
        trHeight.set(qn('w:hRule'), 'exact')
        trPr.append(trHeight)
    cap_cell, cap_blank = table.rows[0].cells
    cap_cell.width, cap_blank.width = (SPINE_W, MAIN_W)
    _set_tcw(cap_cell, SPINE_W)
    _set_tcw(cap_blank, MAIN_W)
    PAGE_H = Inches(11.69)
    CAP_H = Emu(int(PAGE_H * 0.068))
    table.rows[0].height = CAP_H
    _exact(table.rows[0], CAP_H)
    set_cell_shading(cap_cell, roles['gold-bright'])
    FOOT_UPPER_TOP = Emu(int(PAGE_H * 0.908))
    SPINE_STOP = Emu(int(PAGE_H * (1 - 0.047)))
    CONTENT_H = Emu(FOOT_UPPER_TOP - CAP_H)
    FOOT_UPPER_H = Emu(SPINE_STOP - FOOT_UPPER_TOP)
    FOOT_LOWER_H = Emu(PAGE_H - SPINE_STOP - Emu(int(Pt(COVER_BREAK_RESERVE_TWIPS / 20))))
    spine_mid, main_cell = table.rows[1].cells
    spine_mid.width, main_cell.width = (SPINE_W, MAIN_W)
    _set_tcw(spine_mid, SPINE_W)
    _set_tcw(main_cell, MAIN_W)
    table.rows[1].height = CONTENT_H
    _exact(table.rows[1], CONTENT_H)
    set_cell_shading(spine_mid, roles['navy-deep'])
    spine_foot, foot_cell = table.rows[2].cells
    spine_foot.width, foot_cell.width = (SPINE_W, MAIN_W)
    _set_tcw(spine_foot, SPINE_W)
    _set_tcw(foot_cell, MAIN_W)
    table.rows[2].height = FOOT_UPPER_H
    _exact(table.rows[2], FOOT_UPPER_H)
    set_cell_shading(spine_foot, roles['navy-deep'])
    spine_end, main_end = table.rows[3].cells
    spine_end.width, main_end.width = (SPINE_W, MAIN_W)
    _set_tcw(spine_end, SPINE_W)
    _set_tcw(main_end, MAIN_W)
    table.rows[3].height = FOOT_LOWER_H
    _exact(table.rows[3], FOOT_LOWER_H)
    set_cell_shading(spine_end, roles['paper'])
    set_cell_shading(main_end, roles['paper'])
    tcPr = spine_mid._tc.get_or_add_tcPr()
    textDir = OxmlElement('w:textDirection')
    textDir.set(qn('w:val'), 'btLr')
    tcPr.append(textDir)
    vAlign = OxmlElement('w:vAlign')
    vAlign.set(qn('w:val'), 'center')
    tcPr.append(vAlign)
    cap_p = spine_mid.paragraphs[0]
    cap_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc_id = control.get('documentId', '')
    if doc_id:
        run = cap_p.add_run(doc_id)
        run.font.color.rgb = rgb(roles['gold-bright'])
        run.font.bold = True
        run.font.size = Pt(SIZES['table'])
        rPr = run._element.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:ascii'), F['display'])
        rFonts.set(qn('w:hAnsi'), F['display'])
        rFonts.set(qn('w:cs'), F['display'])
        rPr.append(rFonts)
        spacing = OxmlElement('w:spacing')
        spacing.set(qn('w:val'), str(int(SIZES['table'] * 20 * 0.28)))
        rPr.append(spacing)
    import build_docx as _bd
    logo_list = [logos] if isinstance(logos, Path) else logos or []
    heights = {}
    logo_list = [l for l in logo_list if l and Path(l).exists()]
    if logo_list:
        lp = main_cell.paragraphs[0]
        lp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        lp.paragraph_format.space_before = Pt(0)
        run = lp.add_run()
        for i, l in enumerate(logo_list):
            if i:
                run.add_text('     ')
            run.add_picture(str(l), height=heights.get(str(l), MM(27)))
    top_rule_p = main_cell.add_paragraph()
    top_rule_p.paragraph_format.space_before = Pt(0)
    top_pPr = top_rule_p._p.get_or_add_pPr()
    top_pBdr = OxmlElement('w:pBdr')
    top_bottom = OxmlElement('w:bottom')
    top_bottom.set(qn('w:val'), 'single')
    top_bottom.set(qn('w:sz'), '4')
    top_bottom.set(qn('w:space'), '1')
    top_bottom.set(qn('w:color'), roles['rule-strong'].lstrip('#').upper())
    top_pBdr.append(top_bottom)
    top_pPr.append(top_pBdr)
    spacer_p = main_cell.add_paragraph()
    spacer_p.paragraph_format.space_before = Inches(2.36)
    full_title = control.get('title', '')
    parts = re.split('\\s*[:—]\\s+', full_title, maxsplit=1)
    service_name = parts[1] if len(parts) > 1 else full_title
    import build_docx as _b4
    KICKER_TEXT = _b4.L['kicker']
    label_p = main_cell.add_paragraph()
    label_p.paragraph_format.space_after = Pt(6)
    set_para_bidi(label_p)
    add_script_runs(label_p, KICKER_TEXT, font, bold=True)
    for r in label_p.runs:
        r.font.color.rgb = rgb(roles['gold'])
        r.font.size = Pt(SIZES['table'])
    rule_short_p = main_cell.add_paragraph()
    rule_short_p.paragraph_format.left_indent = Emu(MAIN_W - MM(30))
    rule_short_p.paragraph_format.right_indent = Pt(0)
    rule_short_p.paragraph_format.space_before = Pt(2)
    rule_short_p.paragraph_format.space_after = Pt(8)
    rs_pPr = rule_short_p._p.get_or_add_pPr()
    rs_spacing = OxmlElement('w:spacing')
    rs_spacing.set(qn('w:line'), '20')
    rs_spacing.set(qn('w:lineRule'), 'exact')
    rs_pPr.append(rs_spacing)
    rs_pBdr = OxmlElement('w:pBdr')
    rs_bottom = OxmlElement('w:bottom')
    rs_bottom.set(qn('w:val'), 'single')
    rs_bottom.set(qn('w:sz'), '24')
    rs_bottom.set(qn('w:space'), '0')
    rs_bottom.set(qn('w:color'), roles['gold-rule'].lstrip('#').upper())
    rs_pBdr.append(rs_bottom)
    rs_pPr.append(rs_pBdr)
    rule_short_p.add_run().font.size = Pt(1)
    title_p = main_cell.add_paragraph(style='Title')
    set_para_bidi(title_p)
    add_script_runs(title_p, service_name, F['cover'], bold=False)
    subtitle_p = main_cell.add_paragraph()
    set_para_bidi(subtitle_p)
    subtitle_p.paragraph_format.space_before = Pt(9)
    subtitle_p.add_run(_b4.L['subtitle']).font.color.rgb = rgb(roles['muted'])
    for r in subtitle_p.runs:
        r.font.size = Pt(SIZES['table'])
    foot_p = foot_cell.paragraphs[0]
    foot_pPr = foot_p._p.get_or_add_pPr()
    foot_pBdr = OxmlElement('w:pBdr')
    foot_top = OxmlElement('w:top')
    foot_top.set(qn('w:val'), 'single')
    foot_top.set(qn('w:sz'), '4')
    foot_top.set(qn('w:space'), '20')
    foot_top.set(qn('w:color'), roles['rule-strong'].lstrip('#').upper())
    foot_pBdr.append(foot_top)
    foot_pPr.append(foot_pBdr)
    meta_text = _b4.L['comma'].join([control.get('version', ''), control.get('status', ''), control.get('issuedOn', '')])
    add_script_runs(foot_p, meta_text, font)
    for r in foot_p.runs:
        r.font.color.rgb = rgb(roles['muted'])
        r.font.size = Pt(SIZES['table'])

def style_table_theme(table, roles: dict[str, str], has_header: bool) -> None:
    rows = table.rows
    if not rows:
        return
    if has_header:
        for cell in rows[0].cells:
            set_cell_border(cell, 'bottom', roles['navy'], 10)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.color.rgb = rgb(roles['navy'])
    body_rows = rows[1:] if has_header else rows
    for row in body_rows:
        for cell in row.cells:
            set_cell_border(cell, 'bottom', roles['rule'], 4)
    for row in rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                p.paragraph_format.line_spacing = 1.5
                for run in p.runs:
                    run.font.size = Pt(SIZES['table'])

def add_header_footer(document, roles: dict, font: str, logo: Path | None, doc_id: str='', issued_on: str='', cover_section=None, body_section=None) -> None:
    from docx.enum.text import WD_TAB_ALIGNMENT
    cover_section = cover_section or document.sections[0]
    body_section = body_section or document.sections[-1]
    HF_MUTED = load_ramps()['sand']['800']

    def _set_section_bidi(section):
        sectPr = section._sectPr
        if sectPr.find(qn('w:bidi')) is None:
            sectPr.append(OxmlElement('w:bidi'))
    import build_docx as _b3
    if _b3.LOCALE == 'ar':
        _set_section_bidi(cover_section)
        _set_section_bidi(body_section)

    def _spread_footer(section, with_folio: bool, inset=None, muted_hex=None, lift=None):
        inset = inset if inset is not None else Inches(0)
        muted_hex = muted_hex if muted_hex is not None else roles['muted']
        text_w = Emu(section.page_width - section.left_margin - section.right_margin - 2 * inset)
        section.footer.is_linked_to_previous = False
        fp = section.footer.paragraphs[0] if section.footer.paragraphs else section.footer.add_paragraph()
        fp.text = ''
        if inset:
            fp.paragraph_format.left_indent = inset
            fp.paragraph_format.right_indent = inset
        fp.paragraph_format.tab_stops.add_tab_stop(int(text_w // 2), WD_TAB_ALIGNMENT.CENTER)
        fp.paragraph_format.tab_stops.add_tab_stop(int(text_w), WD_TAB_ALIGNMENT.RIGHT)
        conf = fp.add_run(_bd_labels()['confidential'])
        conf.font.color.rgb = rgb(roles['signal'])
        conf.font.bold = True
        conf.font.size = Pt(SIZES['micro'])
        fp.add_run('\t')
        taq = fp.add_run(_bd_labels().get('producer', ''))
        taq.font.bold = True
        taq.font.size = Pt(SIZES['micro'])
        taq.font.color.rgb = rgb(muted_hex)
        if with_folio:
            fp.add_run('\t')
            _add_page_field(fp)
            for r in fp.runs:
                if r.font.size is None:
                    r.font.size = Pt(SIZES['micro'])
                    r.font.color.rgb = rgb(muted_hex)
        if lift:
            from docx.enum.text import WD_LINE_SPACING
            spacer = section.footer.add_paragraph()
            spacer_pf = spacer.paragraph_format
            spacer_pf.space_before = Pt(0)
            spacer_pf.space_after = Pt(0)
            spacer_pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
            spacer_pf.line_spacing = lift
            for r in spacer.runs:
                r.font.size = Pt(1)
    _spread_footer(cover_section, with_folio=False, inset=Inches(16 / 25.4), lift=Pt(COVER_FOOTER_LIFT_TWIPS / 20))
    cover_section.header.is_linked_to_previous = False
    for p in list(cover_section.header.paragraphs):
        p.text = ''
    _spread_footer(body_section, with_folio=True, muted_hex=HF_MUTED)
    sectPr = body_section._sectPr
    pgNumType = OxmlElement('w:pgNumType')
    pgNumType.set(qn('w:start'), '1')
    sectPr.append(pgNumType)
    text_w = body_section.page_width - body_section.left_margin - body_section.right_margin
    header = body_section.header
    header.is_linked_to_previous = False
    hp = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    hp.text = ''
    hp.paragraph_format.tab_stops.add_tab_stop(int(text_w // 2), WD_TAB_ALIGNMENT.CENTER)
    hp.paragraph_format.tab_stops.add_tab_stop(int(text_w), WD_TAB_ALIGNMENT.RIGHT)
    if logo and logo.exists():
        hp.add_run().add_picture(str(logo), height=Inches(0.2))
    hp.add_run('\t')
    r1 = hp.add_run(doc_id)
    r1.font.size = Pt(SIZES['micro'])
    r1.font.color.rgb = rgb(HF_MUTED)
    hp.add_run('\t')
    r2 = hp.add_run(issued_on)
    r2.font.size = Pt(SIZES['micro'])
    r2.font.color.rgb = rgb(HF_MUTED)

def _add_page_field(paragraph) -> None:
    run = paragraph.add_run()
    fldChar1 = OxmlElement('w:fldChar')
    fldChar1.set(qn('w:fldCharType'), 'begin')
    instrText = OxmlElement('w:instrText')
    instrText.set(qn('xml:space'), 'preserve')
    instrText.text = 'PAGE'
    fldChar2 = OxmlElement('w:fldChar')
    fldChar2.set(qn('w:fldCharType'), 'end')
    run._r.append(fldChar1)
    run._r.append(instrText)
    run._r.append(fldChar2)

def theme_color_report(docx_path: Path, roles: dict[str, str]) -> dict:
    import zipfile, re
    allowed = all_theme_hexes(roles)
    found: set[str] = set()
    with zipfile.ZipFile(docx_path) as z:
        for name in z.namelist():
            if name.endswith('.xml') and ('document' in name or 'header' in name or 'footer' in name or ('theme' in name)):
                xml = z.read(name).decode('utf-8', 'ignore')
                for m in re.finditer('(?:w:fill|w:color|w:val)="([0-9A-Fa-f]{6})"', xml):
                    found.add(m.group(1).upper())
    off_palette = sorted((h for h in found if h not in allowed and h not in {'FFFFFF', '000000', 'AUTO'}))
    return {'used': sorted(found), 'off_palette': off_palette, 'total_distinct': len(found)}
