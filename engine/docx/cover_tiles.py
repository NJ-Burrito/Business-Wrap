from __future__ import annotations
import re
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from cover_design import FIGURE_KINDS, _STATUS_VARS, family_label, is_status_head, status_kind
from cover_xml import _borders, _cell_margins, _end_align, _fresh_table, _hex, _min_height, _row_height, _tight, _tiny

def _box(table_or_cell_table, color: str, sz: int) -> None:
    _borders(table_or_cell_table, (color, sz), (color, sz))


def _set_jc(paragraph, rtl: bool, end: bool) -> None:
    if end:
        _end_align(paragraph, rtl)


def _runs_style(paragraph, size: float, color: str, theme_mod, bold=None, face=None) -> None:
    for r in paragraph.runs:
        r.font.size = Pt(size)
        r.font.color.rgb = theme_mod.rgb(color)
        if bold is not None:
            r.font.bold = bold
        if face:
            rPr = r._element.get_or_add_rPr()
            rf = rPr.find(qn('w:rFonts'))
            if rf is None:
                rf = OxmlElement('w:rFonts')
                rPr.insert(0, rf)
            for a in ('w:ascii', 'w:hAnsi', 'w:cs'):
                rf.set(qn(a), face)


def derived_figures(data: dict, rtl: bool) -> list:
    """A sheet without cover.figures: counted from its first `style: sheet` table with a status column (render.mjs derivedFigures)."""
    import model_docx as _md
    ch = next((c for c in (data.get('chapters') or []) if not c.get('hidden')), None)
    for sec in (ch or {}).get('sections') or []:
        for b in sec.get('blocks') or []:
            if b.get('kind') != 'table' or b.get('hidden') or b.get('style') != 'sheet' or not isinstance(b.get('columns'), list):
                continue
            heads = [_md.text_of(x if x is not None else '') for x in b['columns']]
            main = next((i for i, x in enumerate(heads) if re.search(r'\b(status|result)\b|الحالة|النتيجة|حالة|نتيجة', x, re.I) and is_status_head(x)), -1)
            col = main if main >= 0 else next((i for i, x in enumerate(heads) if is_status_head(x)), -1)
            if col < 0:
                continue
            rows = [r for r in (b.get('rows') or []) if isinstance(r, list)]
            seen = {}
            for r in rows:
                w = _md.text_of(r[col] if col < len(r) and r[col] is not None else '').strip()
                k = status_kind(w, True)
                if k:
                    seen.setdefault(k, [w, 0])[1] += 1
            out = [{'label': family_label(data, 'total', rtl), 'value': str(len(rows)), 'kind': 'none'}]
            out += [{'label': seen[k][0], 'value': str(seen[k][1]), 'kind': k} for k in ('ok', 'bad', 'warn', 'idle') if k in seen]
            return out
    return []


def tiles_table(document, host, figs: list, width_mm: float, roles: dict, font: str, theme_mod, rtl: bool, value_pt: float = 17):
    """C4: one row of tiles: label 7 pt muted above the value (Display 700), the fill of its kind (none = the wash), a rule on top."""
    import build_docx as _b
    if not figs:
        return None
    F = theme_mod.faces(font)
    n = len(figs)
    gap = 2.0
    w = (width_mm - gap * (n - 1)) / n
    widths = []
    for i in range(n):
        widths.append(w)
        if i < n - 1:
            widths.append(gap)
    table = _fresh_table(document, 1, widths, rtl, theme_mod, host=host)
    _min_height(table.rows[0], 14)
    for i, f in enumerate(figs):
        cell = table.cell(0, i * 2)
        kind = f.get('kind') if f.get('kind') in FIGURE_KINDS else 'none'
        fill, ink = (roles.get(_STATUS_VARS[kind][0]), roles.get(_STATUS_VARS[kind][1])) if kind != 'none' else (roles.get('primary-50', roles.get('navy-wash')), roles.get('primary-deep', roles.get('navy-deep')))
        theme_mod.set_cell_shading(cell, fill or roles.get('primary-50', '#f2f6fa'))
        theme_mod.set_cell_border(cell, 'top', roles['rule-strong'], 6)
        _cell_margins(cell, 2.2, 3, 2.6)
        lp = cell.paragraphs[0]
        _tight(lp, round(theme_mod.SIZES['micro'] * 1.45, 1), after=1)
        _b.set_para_bidi(lp)
        _b.add_script_runs(lp, str(f.get('label') or ''), font)
        _runs_style(lp, theme_mod.SIZES['micro'], roles['muted'], theme_mod)
        vp = cell.add_paragraph()
        _tight(vp, round(value_pt * 1.2, 1))
        _b.set_para_bidi(vp)
        _b.add_script_runs(vp, str(f.get('value') or ''), F['display'], bold=True)
        _runs_style(vp, value_pt, ink or roles['ink'], theme_mod, bold=True)
        if not vp.runs:
            vp.add_run().font.size = Pt(value_pt)
    for i in range(n - 1):
        _tiny(table.cell(0, i * 2 + 1))
    return table


def statement_table(document, host, st, width_mm: float, roles: dict, font: str, theme_mod, rtl: bool, seal_label: str = ''):
    """C5: a one-cell box (1.2 pt primary border, primary-50 fill): the text, the items (a small filled square, never a glyph), the choices as
    4 mm empty squares (drawn borders) and, when `seal_label` is given and there are choices, an empty box for the stamp at the end."""
    import build_docx as _b
    if not isinstance(st, dict) or not isinstance(st.get('text'), str):
        return None
    table = _fresh_table(document, 1, [width_mm], rtl, theme_mod, host=host)
    _borders(table, (roles['navy'], 10), (roles['navy'], 10))
    cell = table.cell(0, 0)
    theme_mod.set_cell_shading(cell, roles.get('primary-50', roles.get('navy-wash')))
    _cell_margins(cell, 3.5, 4, 3.5)
    p = cell.paragraphs[0]
    _tight(p, round(theme_mod.SIZES['table'] * 1.55, 1), after=2)
    _b.set_para_bidi(p)
    _b.add_script_runs(p, st['text'], font, bold=True)
    _runs_style(p, theme_mod.SIZES['table'], roles['ink'], theme_mod, bold=True)
    for item in [x for x in (st.get('items') or []) if isinstance(x, str)][:5]:
        ip = cell.add_paragraph()
        _tight(ip, round(theme_mod.SIZES['table'] * 1.55, 1), after=1)
        _b.set_para_bidi(ip)
        mark = ip.add_run('  ')
        mark.font.size = Pt(4)
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), _hex(roles['navy']))
        mark._element.get_or_add_rPr().append(shd)
        ip.add_run('   ').font.size = Pt(theme_mod.SIZES['table'])
        before = len(ip.runs)
        _b.add_script_runs(ip, item, font)
        for r in ip.runs[before:]:
            r.font.size = Pt(theme_mod.SIZES['table'])
            r.font.color.rgb = theme_mod.rgb(roles['ink'])
    choices = [x for x in (st.get('choices') or []) if isinstance(x, str)][:4]
    if choices:
        inner_w = width_mm - 8
        seal_w = 30 if seal_label else 0
        foot = _fresh_table(document, 1, [inner_w - seal_w - (4 if seal_w else 0)] + ([4, seal_w] if seal_w else []), rtl, theme_mod, host=cell)
        ccell = foot.cell(0, 0)
        tcPr = ccell._tc.get_or_add_tcPr()
        va = OxmlElement('w:vAlign')
        va.set(qn('w:val'), 'bottom')
        tcPr.append(va)
        lab_w = max(18.0, (inner_w - seal_w - 8) / len(choices) - 7)
        widths = []
        for _ in choices:
            widths += [4.2, 2.5, lab_w]
        ch = _fresh_table(document, 1, widths, rtl, theme_mod, host=ccell)
        _row_height(ch.rows[0], 4.2)
        for i, text in enumerate(choices):
            box = ch.cell(0, i * 3)
            theme_mod.set_cell_shading(box, roles.get('paper', '#ffffff'))
            theme_mod.set_cell_box(box, roles['ink'], 6)
            _tiny(box)
            _tiny(ch.cell(0, i * 3 + 1))
            lc = ch.cell(0, i * 3 + 2)
            lp = lc.paragraphs[0]
            _tight(lp, 11.5)
            _b.set_para_bidi(lp)
            _b.add_script_runs(lp, text, font, bold=True)
            _runs_style(lp, 9, roles['ink'], theme_mod, bold=True)
        # python-docx closes a nested table with an empty paragraph: shrink it
        last = ccell.paragraphs[-1]
        _tight(last, 1)
        if seal_w:
            _tiny(foot.cell(0, 1))
            seal = foot.cell(0, 2)
            theme_mod.set_cell_shading(seal, roles.get('paper', '#ffffff'))
            theme_mod.set_cell_box(seal, roles['rule-strong'], 6)
            _cell_margins(seal, 1.2, 2, 1.2)
            sp = seal.paragraphs[0]
            _tight(sp, round(theme_mod.SIZES['micro'] * 1.45, 1))
            _b.set_para_bidi(sp)
            _b.add_script_runs(sp, seal_label, font)
            _runs_style(sp, theme_mod.SIZES['micro'], roles['muted'], theme_mod)
            _min_height(foot.rows[0], 22)
        first = ccell.paragraphs[0]
        if not first.runs and first._p.getnext() is not None:
            first._p.getparent().remove(first._p)
        lp = cell.paragraphs[-1]
        _tight(lp, 1)
    return table


def id_cell(cell, label: str, value: str, roles: dict, font: str, theme_mod, rtl: bool) -> None:
    """The form's ID box: a 1.2 pt primary frame, the label 7 pt muted above the value (Display 700, 13 pt), left to right."""
    import build_docx as _b
    F = theme_mod.faces(font)
    theme_mod.set_cell_shading(cell, roles.get('paper', '#ffffff'))
    theme_mod.set_cell_box(cell, roles['navy'], 10)
    _cell_margins(cell, 2, 3, 2.4)
    lp = cell.paragraphs[0]
    _tight(lp, round(theme_mod.SIZES['micro'] * 1.45, 1), after=1)
    _b.set_para_bidi(lp)
    _b.add_script_runs(lp, label, font)
    _runs_style(lp, theme_mod.SIZES['micro'], roles['muted'], theme_mod)
    vp = cell.add_paragraph()
    _tight(vp, 16)
    _b.set_para_bidi(vp)
    _b.add_script_runs(vp, value, F['display'], bold=True)
    _runs_style(vp, 13, roles.get('primary-deep', roles['navy-deep']), theme_mod, bold=True)


def badge_cell(cell, label: str, value: str, roles: dict, font: str, theme_mod, rtl: bool) -> None:
    """C6: the badge: a primary fill, the label above the value (Display 700, 24 pt, white), square corners."""
    import build_docx as _b
    F = theme_mod.faces(font)
    theme_mod.set_cell_shading(cell, roles['navy'])
    _cell_margins(cell, 2.2, 4, 2.6)
    lp = cell.paragraphs[0]
    _tight(lp, round(theme_mod.SIZES['micro'] * 1.45, 1), after=1)
    _b.set_para_bidi(lp)
    _b.add_script_runs(lp, label, font)
    _runs_style(lp, theme_mod.SIZES['micro'], roles.get('paper', '#ffffff'), theme_mod)
    vp = cell.add_paragraph()
    _tight(vp, 27)
    _b.set_para_bidi(vp)
    _b.add_script_runs(vp, value, F['display'], bold=True)
    _runs_style(vp, 24, roles.get('paper', '#ffffff'), theme_mod, bold=True)
