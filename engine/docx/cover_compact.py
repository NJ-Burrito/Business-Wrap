from __future__ import annotations
import re
from docx.enum.text import WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Mm
from pathlib import Path
from cover_design import CODES, FIELD_COLS, _cover_key, cover_figures, family_label, name_logo
from cover_spine import type_fields
from cover_tiles import badge_cell, derived_figures, id_cell, statement_table, tiles_table
from cover_xml import _end_align, _fresh_table, _hex, _meta_text, _row_height, _spaced, _tight, _tiny, _top_margin

def tighten_cover_header(cover_section, cv: dict) -> None:
    """The spine cover's top margin is 0: an empty header line of normal height would push the whole cover table down. (0.18 drew the motif here; 0.19.0 draws none.)"""
    if cv['design'] != 'spine':
        return
    for hp in cover_section.header.paragraphs:
        _tight(hp, 1)
        hp.add_run().font.size = Pt(1)


def step_chip(paragraph, number: int, font: str, roles: dict, theme_mod) -> None:
    """A user manual's step: the number on a filled chip, then the step's title (the print's counter chip)."""
    theme_mod.add_chapter_chip(paragraph, str(number), font, roles)
    paragraph.runs[-1].text = '   '


_CALLOUT = {'note': ('primary-800', 'primary-wash', 'primary-800'), 'tip': ('success-700', 'success-100', 'success-700'), 'important': ('accent-700', 'accent-100', 'accent-800'), 'warning': ('signal-700', 'signal-100', 'signal-700')}
_TAGS = {'note': ('Note', 'ملاحظة'), 'tip': ('Tip', 'نصيحة'), 'important': ('Important', 'مهم'), 'warning': ('Warning', 'تحذير')}
_TAG_RE = re.compile('^(' + '|'.join(t for v in _TAGS.values() for t in v) + ')\\s*[:：—–-]\\s*')


def callout_of(text) -> dict | None:
    """A plain paragraph that opens with a tag word ("Note: ...", «ملاحظة: ...») is a callout (render.mjs calloutOf)."""
    if not isinstance(text, str):
        return None
    m = _TAG_RE.match(text)
    if not m:
        return None
    kind = next(k for k, v in _TAGS.items() if m.group(1) in v)
    return {'kind': kind, 'tag': m.group(0).rstrip(), 'rest': text[m.end():]}


def style_callout(paragraph, kind: str, roles: dict, pbdr_after: tuple) -> None:
    """Fill and a 0.75 pt border in the callout's colour, no side stripe; the tag word is bold, so colour is never the only cue."""
    border, fill, tag = (roles.get(k, roles['navy']) for k in _CALLOUT[kind])
    pPr = paragraph._p.get_or_add_pPr()
    bdr = OxmlElement('w:pBdr')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '6')
        el.set(qn('w:space'), '6' if edge in ('left', 'right') else '4')
        el.set(qn('w:color'), _hex(border))
        bdr.append(el)
    pPr.insert_element_before(bdr, *pbdr_after)
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), _hex(fill))
    pPr.insert_element_before(shd, *pbdr_after[1:])
    return _hex(tag)


def build_compact(document, control: dict, roles: dict, font: str, logos, cv: dict, text_width: int, theme_mod, rtl: bool, data: dict | None = None) -> None:
    """The compact cover: no page of its own, a title block at the head of page 1: a band (gold cap, deep colour), the type code chip and kicker, the
    title and subtitle (0.19.0: no motif), a meta line (version, status, date, document code), then the type's own fields (C3) when it has any."""
    import build_docx as _b
    F = theme_mod.faces(font)
    W = text_width / 36000  # mm
    def spacer():
        p = document.add_paragraph()
        _tight(p, 1)
        p.add_run().font.size = Pt(1)
        return p
    # band
    band = _fresh_table(document, 1, [20, W - 20], rtl, theme_mod)
    _row_height(band.rows[0], 2.5)
    theme_mod.set_cell_shading(band.cell(0, 0), roles['gold-bright'])
    theme_mod.set_cell_shading(band.cell(0, 1), roles['navy-deep'])
    for c in band.rows[0].cells:
        _tiny(c)
    items = [l for l in ([logos] if isinstance(logos, Path) else logos or []) if l and Path(l).exists()]
    if items:
        lp = spacer()
        lp.paragraph_format.space_before = Pt(8)
        lp.paragraph_format.line_spacing_rule = WD_LINE_SPACING.AT_LEAST
        lp.paragraph_format.line_spacing = Pt(1)
        run = lp.add_run()
        for i, l in enumerate(items):
            if i:
                run.add_text('     ')
            name_logo(run.add_picture(str(l), height=Mm(12)), l)
    else:
        spacer().paragraph_format.space_after = Pt(8)
    # title block; 0.19.0 R2: a form ends the row with its ID box (the field with id:true, else the document id) and/or its badge (C6)
    d = data or {'control': control}
    fam = cv.get('family')
    ck = _cover_key(d)
    tf_all = type_fields(d)
    id_f = next((f for f in tf_all if f.get('id') is True), None) if fam == 'form' else None
    badge = ck.get('badge') if fam == 'form' and isinstance(ck.get('badge'), dict) and isinstance(ck['badge'].get('value'), str) else None
    ends = []
    if fam == 'form':
        if id_f:
            ends.append(('id', str(id_f.get('label') or ''), str(id_f.get('value') or '')))
        if badge:
            ends.append(('badge', str(badge.get('label') or ''), badge['value']))
        if not ends:
            ends.append(('id', (_b.L.get('control') or {}).get('documentId', 'Document ID'), str(control.get('documentId') or '')))
    end_w = [48.0 if k == 'id' else 40.0 for k, _, _ in ends]
    widths = [W - sum(end_w) - 4 * len(ends)]
    for w in end_w:
        widths += [4, w]
    main = _fresh_table(document, 1, widths, rtl, theme_mod)
    text_cell = main.cell(0, 0)
    for i, (k, lab, val) in enumerate(ends):
        _tiny(main.cell(0, 1 + i * 2))
        (id_cell if k == 'id' else badge_cell)(main.cell(0, 2 + i * 2), lab, val, roles, font, theme_mod, rtl)
    title_pt = 18 if fam == 'form' else 16 if fam == 'sheet' else theme_mod.SIZES['title']
    p = text_cell.paragraphs[0]
    _tight(p, 14, after=6)
    code = CODES.get(cv['type'], '')
    if code:
        chip = p.add_run(f' {code} ')
        chip.font.bold = True
        chip.font.size = Pt(theme_mod.SIZES['meta'])
        chip.font.color.rgb = theme_mod.rgb(roles['paper'])
        rPr = chip._element.get_or_add_rPr()
        rf = OxmlElement('w:rFonts')
        for a in ('w:ascii', 'w:hAnsi', 'w:cs'):
            rf.set(qn(a), F['display'])
        rPr.append(rf)
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), _hex(roles['navy']))
        rPr.append(shd)
        _spaced(chip, theme_mod.SIZES['meta'], 0.12)
        p.add_run('   ')
    _b.add_script_runs(p, _b.L['kicker'], font, bold=True)
    for r in p.runs[(2 if code else 0):]:
        r.font.color.rgb = theme_mod.rgb(roles['gold'])
        r.font.size = Pt(theme_mod.SIZES['meta'])
        _spaced(r, theme_mod.SIZES['meta'], 0.1)
    full_title = control.get('title', '')
    parts = re.split('\\s*[:—]\\s+', full_title, maxsplit=1)
    service_name = control.get('coverTitle') or (parts[1] if len(parts) > 1 else full_title)
    tp = text_cell.add_paragraph()
    _tight(tp, round(title_pt * 1.3, 1), after=4)
    _b.add_script_runs(tp, service_name, F['cover'], bold=False)
    for r in tp.runs:
        r.font.size = Pt(title_pt)
        r.font.color.rgb = theme_mod.rgb(roles['ink'])
    sp = text_cell.add_paragraph()
    _tight(sp, round(theme_mod.SIZES['table'] * 1.5, 1))
    sp.add_run(control.get('subtitle') or _b.L['subtitle'])
    _b.set_para_bidi(sp)
    for r in sp.runs:
        r.font.size = Pt(theme_mod.SIZES['table'])
        r.font.color.rgb = theme_mod.rgb(roles['muted'])
    spacer().paragraph_format.space_after = Pt(4)

    def meta_line():
        meta = _fresh_table(document, 1, [W / 2, W / 2], rtl, theme_mod)
        left, right = meta.cell(0, 0), meta.cell(0, 1)
        for cell in (left, right):
            theme_mod.set_cell_border(cell, 'top', roles['rule-strong'], 6)
            theme_mod.set_cell_border(cell, 'bottom', roles['rule'], 6)
            _top_margin(cell, 2.5)
            cell.paragraphs[0].text = ''
        p = left.paragraphs[0]
        _tight(p, theme_mod.SIZES['meta'] * 1.5, after=7)
        _b.add_script_runs(p, _meta_text(control, _b.L), font)
        p = right.paragraphs[0]
        _tight(p, theme_mod.SIZES['meta'] * 1.5, after=7)
        _b.add_script_runs(p, control.get('documentId', ''), font)
        _end_align(p, rtl)
        for cell in (left, right):
            for r in cell.paragraphs[0].runs:
                r.font.size = Pt(theme_mod.SIZES['meta'])
                r.font.color.rgb = theme_mod.rgb(roles['muted'])

    cols = ck.get('cols') if ck.get('cols') in FIELD_COLS else 0
    rest = [f for f in tf_all if f is not id_f]

    def grid(default_cols):
        return None  # 0.21.1: page 1 carries no field grid; the fields are in the document-control section

    def strip(figs, value_pt):
        if figs:
            spacer().paragraph_format.space_after = Pt(4)
            tiles_table(document, None, figs, W, roles, font, theme_mod, rtl, value_pt)

    def statement(seal):
        if isinstance(ck.get('statement'), dict):
            spacer().paragraph_format.space_after = Pt(4)
            statement_table(document, None, ck['statement'], W, roles, font, theme_mod, rtl, family_label(d, 'seal', rtl) if seal else '')

    if fam == 'form':  # spec §1: title row, field grid, meta line, then the statement (C5); chapter 1 follows on the same page
        grid(3)
        spacer().paragraph_format.space_after = Pt(4)
        meta_line()
        strip(cover_figures(d), 17)
        statement(True)
    elif fam == 'sheet':  # spec §1: title row, meta line, the fields in one row, the summary strip (C4), then the sheet
        meta_line()
        grid(6)
        strip(cover_figures(d) or derived_figures(d, rtl), 16)
        statement(False)
    else:
        meta_line()
        grid(2)
    spacer().paragraph_format.space_after = Pt(10)
