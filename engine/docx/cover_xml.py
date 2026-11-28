from __future__ import annotations
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, Mm
from pathlib import Path
from cover_design import name_logo

# ---- small OOXML helpers (heights, borders, shading are the builder's own idioms) ----
def _hex(v: str) -> str:
    return str(v).lstrip('#').upper()


def _tw(mm: float) -> int:
    return int(round(mm * 56.6929))


def _fresh_table(document, rows: int, widths_mm: list[float], rtl: bool, theme_mod, host=None):
    """A borderless fixed-width table with zero cell margins; `host` (a cell) nests it there instead of the document body."""
    table = document.add_table(rows=rows, cols=len(widths_mm)) if host is None else host.add_table(rows, len(widths_mm))
    table.autofit = False
    tblPr = table._tbl.tblPr
    tblW = tblPr.find(qn('w:tblW'))
    tblW.set(qn('w:w'), str(_tw(sum(widths_mm))))
    tblW.set(qn('w:type'), 'dxa')
    if rtl:
        tblPr.get_or_add_bidiVisual()
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'none')
        el.set(qn('w:sz'), '0')
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), 'auto')
        borders.append(el)
    mar = OxmlElement('w:tblCellMar')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:w'), '0')
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    tblPr.insert_element_before(borders, 'w:shd', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook')
    tblPr.insert_element_before(mar, 'w:tblLook')
    for column, w in zip(table.columns, widths_mm):
        column.width = Mm(w)
    for row in table.rows:
        for cell, w in zip(row.cells, widths_mm):
            cell.width = Mm(w)
    return table


def _row_height(row, mm: float) -> None:
    trPr = row._tr.get_or_add_trPr()
    h = OxmlElement('w:trHeight')
    h.set(qn('w:val'), str(_tw(mm)))
    h.set(qn('w:hRule'), 'exact')
    trPr.append(h)
    cs = OxmlElement('w:cantSplit')
    trPr.append(cs)


def _tight(paragraph, line_pt: float | None = None, before: float = 0, after: float = 0) -> None:
    pf = paragraph.paragraph_format
    pf.space_before, pf.space_after = Pt(before), Pt(after)
    if line_pt:
        pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        pf.line_spacing = Pt(line_pt)


def _tiny(cell) -> None:
    """An empty cell's own paragraph, shrunk so an exact row height is never forced taller by it."""
    p = cell.paragraphs[0]
    _tight(p, 1)
    p.add_run().font.size = Pt(1)


def _top_margin(cell, mm: float) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    top = OxmlElement('w:top')
    top.set(qn('w:w'), str(_tw(mm)))
    top.set(qn('w:type'), 'dxa')
    mar.append(top)
    tcPr.insert_element_before(mar, 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:tcPrChange')


def _spaced(run, size_pt: float, em: float) -> None:
    sp = OxmlElement('w:spacing')
    sp.set(qn('w:val'), str(int(size_pt * 20 * em)))
    run._element.get_or_add_rPr().append(sp)


def _end_align(paragraph, rtl: bool) -> None:
    """Aligned to the end of the line in either language (Word reads `end` for a right-to-left paragraph)."""
    if rtl:
        pPr = paragraph._p.get_or_add_pPr()
        for old in pPr.findall(qn('w:jc')):
            pPr.remove(old)
        jc = OxmlElement('w:jc')
        jc.set(qn('w:val'), 'end')
        pPr.append(jc)
    else:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT


def _logos(cell, logos, height_mm: float) -> None:
    items = [l for l in ([logos] if isinstance(logos, Path) else logos or []) if l and Path(l).exists()]
    if not items:
        _tiny(cell)
        return
    p = cell.paragraphs[0]
    _tight(p)
    run = p.add_run()
    for i, l in enumerate(items):
        if i:
            run.add_text('     ')
        name_logo(run.add_picture(str(l), height=Mm(height_mm)), l)


def _meta_text(control: dict, L: dict) -> str:
    return L['comma'].join([control.get('version', ''), control.get('status', ''), control.get('issuedOn', '')])


def _borders(table, outer: tuple, inner: tuple) -> None:
    """Table borders: outer (hex, eighths of a point) on the four edges, inner on insideH / insideV (straight rules only)."""
    tblPr = table._tbl.tblPr
    old = tblPr.find(qn('w:tblBorders'))
    b = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        color, sz = inner if edge.startswith('inside') else outer
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), str(sz))
        el.set(qn('w:space'), '0')
        el.set(qn('w:color'), _hex(color))
        b.append(el)
    if old is not None:
        old.addnext(b)
        tblPr.remove(old)
    else:
        tblPr.insert_element_before(b, 'w:shd', 'w:tblLayout', 'w:tblCellMar', 'w:tblLook')


def _cell_margins(cell, top: float, side: float, bottom: float) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for edge, mm in (('top', top), ('start', side), ('bottom', bottom), ('end', side)):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:w'), str(_tw(mm)))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    tcPr.insert_element_before(mar, 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:tcPrChange')


def _min_height(row, mm: float) -> None:
    """A row at least `mm` tall that never splits (schema order: cantSplit before trHeight; an existing height or cantSplit is replaced, not doubled)."""
    trPr = row._tr.get_or_add_trPr()
    for tag in ('w:trHeight', 'w:cantSplit'):
        for old in trPr.findall(qn(tag)):
            trPr.remove(old)
    h = OxmlElement('w:trHeight')
    h.set(qn('w:val'), str(_tw(mm)))
    h.set(qn('w:hRule'), 'atLeast')
    trPr.insert_element_before(h, 'w:tblHeader', 'w:tblCellSpacing', 'w:jc', 'w:hidden', 'w:ins', 'w:del', 'w:trPrChange')
    h.addprevious(OxmlElement('w:cantSplit'))
