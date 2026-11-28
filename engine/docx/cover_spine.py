from __future__ import annotations
import re
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from pathlib import Path
from cover_design import CODES, CONTROL, CONTROL_LABELS, FIELD_COLS, FIELD_KINDS, _cover_key, cover_figures, spine_code_color, status_colors
from cover_tiles import _runs_style, statement_table, tiles_table
from cover_xml import _borders, _cell_margins, _end_align, _fresh_table, _hex, _logos, _meta_text, _min_height, _row_height, _spaced, _tight, _tiny, _top_margin

def control_fields(data: dict, labels: dict, rtl: bool) -> list:
    """The eight common control fields of the title page (render.mjs COVER_CONTROL), from `control`; an empty `approvedBy` is a blank box."""
    control = data.get('control') or {}
    out = []
    for k in CONTROL:
        label = (labels.get('control') or {}).get(k) or CONTROL_LABELS.get(k, {}).get('ar' if rtl else 'en', k)
        value = str(control.get(k) or '')
        kind = 'blank' if k == 'approvedBy' and not value.strip() else ('ltr' if k in ('documentId', 'version', 'issuedOn') else 'text')
        out.append({'label': label, 'value': value, 'kind': kind})
    return out


def type_fields(data: dict) -> list:
    """The type's own page-1 fields (content key `cover`, spec §2)."""
    return [f for f in ((data.get('cover') or {}).get('fields') or []) if isinstance(f, dict)]


def control_type_rows(data: dict) -> list:
    """0.21.1: the type's own fields as [label, value] rows for the document-control section (render.mjs coverFieldRows); page 1 carries no grid."""
    return [[str(f.get('label') or ''), '' if f.get('kind') == 'blank' else str(f.get('value') or '')] for f in type_fields(data)]


def field_grid(document, host, fields: list, cols: int, width_mm: float, roles: dict, font: str, theme_mod, rtl: bool):
    """C3: a field grid as a native table (fixed widths): label 7 pt muted above value 9.5 pt; 0.75 pt rule-strong outer, rule inner; rows at least
    11 mm; a `chip` value takes the status fill (C9) or the wash; `date` and Latin ids stay left to right; `blank` is an empty box."""
    import build_docx as _b
    if not fields:
        return None
    n = cols if cols in FIELD_COLS else 2
    nrows = -(-len(fields) // n)
    table = _fresh_table(document, nrows, [width_mm / n] * n, rtl, theme_mod, host=host)
    _borders(table, (roles['rule-strong'], 6), (roles['rule'], 4))
    for row in table.rows:
        _min_height(row, 11)
    rest = len(fields) % n
    for i, f in enumerate(fields):
        r, c = divmod(i, n)
        cell = table.cell(r, c)
        if rest and i == len(fields) - 1 and c < n - 1:
            cell = cell.merge(table.cell(r, n - 1))
        _cell_margins(cell, 1.6, 2.5, 1.8)
        lp = cell.paragraphs[0]
        _tight(lp, round(theme_mod.SIZES['micro'] * 1.45, 1), after=1)
        _b.set_para_bidi(lp)
        _b.add_script_runs(lp, str(f.get('label') or ''), font)
        for run in lp.runs:
            run.font.size = Pt(theme_mod.SIZES['micro'])
            run.font.color.rgb = theme_mod.rgb(roles['muted'])
        vp = cell.add_paragraph()
        _tight(vp, 13.3)
        _b.set_para_bidi(vp)
        kind = f.get('kind') if f.get('kind') in FIELD_KINDS + ('ltr',) else 'text'
        value = '' if kind == 'blank' else str(f.get('value') or '')
        if not value:
            vp.add_run().font.size = Pt(9.5)
            continue
        _b.add_script_runs(vp, value, font, bold=True)
        colors = status_colors(value, roles, True) if kind == 'chip' else None  # a chip takes the C9 words too
        for run in vp.runs:
            run.font.size = Pt(9.5)
            run.font.color.rgb = theme_mod.rgb(colors[1] if colors else roles['ink'])
            if kind == 'chip':
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), _hex(colors[0] if colors else roles.get('primary-100', roles['navy'])))
                run._element.get_or_add_rPr().append(shd)
    return table


def build_spine(document, control: dict, roles: dict, font: str, logos, cv: dict, theme_mod, rtl: bool, data: dict | None = None) -> None:
    """The spine cover on the same A4 grid as the print (covers.md section 1), as one table of exact-height rows: columns spine 20 | gutter 14 |
    three text columns (20, 60, 80) | right margin 16 mm. Row heights put every line at the print's y, so Word needs no paragraph arithmetic."""
    import build_docx as _b
    if cv.get('family') == 'report':
        return build_report(document, control, roles, font, logos, cv, theme_mod, rtl, data)
    F = theme_mod.faces(font)
    widths = [20, 14, 20, 60, 80, 16]
    rows = [('cap', 20), ('logo', 20), ('hair', 16), ('gapA', 35), ('code', 17.14), ('gapB', 11.36), ('kicker', 5.1), ('gapC', 9.9), ('gapD', 6.5), ('title', 25), ('gapE', 92), ('meta', 25.1), ('end', 1.6)]
    at = {name: i for i, (name, _) in enumerate(rows)}
    table = _fresh_table(document, len(rows), widths, rtl, theme_mod)
    for row, (_, h) in zip(table.rows, rows):
        _row_height(row, h)
    C = lambda name, col: table.cell(at[name], col)
    spine = _hex(roles['navy-deep'])
    for i, (name, _) in enumerate(rows):
        if name == 'cap':
            theme_mod.set_cell_shading(C(name, 0), roles['gold-bright'])
        elif name != 'end':
            theme_mod.set_cell_shading(C(name, 0), spine)
    # the document code: one merged spine cell, vertical text (bottom to top in English, top to bottom in Arabic: the baseline always faces the page)
    top, bottom = C('gapB', 0), C('title', 0)
    code_cell = top.merge(bottom)
    tcPr = code_cell._tc.get_or_add_tcPr()
    textDir = OxmlElement('w:textDirection')
    textDir.set(qn('w:val'), 'tbRl' if rtl else 'btLr')
    tcPr.append(textDir)
    vAlign = OxmlElement('w:vAlign')
    vAlign.set(qn('w:val'), 'center')
    tcPr.append(vAlign)
    p = code_cell.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _tight(p)
    if control.get('documentId'):
        run = p.add_run(control['documentId'])
        run.font.bold = True
        run.font.size = Pt(theme_mod.SIZES['micro'])
        run.font.color.rgb = theme_mod.rgb(spine_code_color(roles))
        rPr = run._element.get_or_add_rPr()
        rf = OxmlElement('w:rFonts')
        for a in ('w:ascii', 'w:hAnsi', 'w:cs'):
            rf.set(qn(a), F['display'])
        rPr.append(rf)
        _spaced(run, theme_mod.SIZES['micro'], 0.3)
    def span(name, c0=2, c1=4):
        return C(name, c0).merge(C(name, c1)) if c1 > c0 else C(name, c0)
    # logos (20 to 40 mm), the hairline (56 mm)
    _logos(span('logo'), logos, 18)
    hair = span('hair')
    _tiny(hair)
    if any(l and Path(l).exists() for l in ([logos] if isinstance(logos, Path) else logos or [])):  # 0.19.0 R3 (review #10): no logo row, no floating hairline
        theme_mod.set_cell_border(hair, 'bottom', roles['rule'], 6)
    # type code: Display Black, cap height 12 mm (48.6 pt on a 1.0 line), baseline at 106 mm
    code = CODES.get(cv['type'], '')
    cell = span('code')
    p = cell.paragraphs[0]
    _tight(p, 48.6)
    if code:
        before = len(p.runs)
        _b.add_script_runs(p, code, F['cover'], bold=False)
        for r in p.runs[before:]:
            r.font.size = Pt(48.6)
            r.font.color.rgb = theme_mod.rgb(roles['navy'])
            _spaced(r, 48.6, 0.07)
    else:
        _tiny(cell)
    # kicker (8 pt), the gold rule (20 mm: the first text column only), title, subtitle
    cell = span('kicker')
    p = cell.paragraphs[0]
    _tight(p, theme_mod.SIZES['meta'] * 1.3)
    _b.add_script_runs(p, _b.L['kicker'], font, bold=True)
    for r in p.runs:
        r.font.color.rgb = theme_mod.rgb(roles['gold'])
        r.font.size = Pt(theme_mod.SIZES['meta'])
        _spaced(r, theme_mod.SIZES['meta'], 0.1)
    theme_mod.set_cell_border(C('gapC', 2), 'bottom', roles['gold-rule'], 6)
    full_title = control.get('title', '')
    parts = re.split('\\s*[:—]\\s+', full_title, maxsplit=1)
    service_name = control.get('coverTitle') or (parts[1] if len(parts) > 1 else full_title)
    cell = span('title')
    p = cell.paragraphs[0]
    _tight(p, round(theme_mod.SIZES['title'] * 1.3, 1))
    _b.add_script_runs(p, service_name, F['cover'], bold=False)
    for r in p.runs:
        r.font.size = Pt(theme_mod.SIZES['title'])
        r.font.color.rgb = theme_mod.rgb(roles['ink'])
    sp = cell.add_paragraph()
    _tight(sp, round(theme_mod.SIZES['table'] * 1.5, 1), before=8)
    sp.add_run(control.get('subtitle') or _b.L['subtitle'])
    _b.set_para_bidi(sp)
    for r in sp.runs:
        r.font.size = Pt(theme_mod.SIZES['table'])
        r.font.color.rgb = theme_mod.rgb(roles['muted'])
    # 0.21.1: page 1 carries no info table (owner, 2026-11-13): the control fields and the type's own fields are in the document-control section
    span('gapE')
    # meta row (258 to 283 mm): a hairline over it, version / status / date at the start, the owner at the end
    start, end = C('meta', 2).merge(C('meta', 3)), C('meta', 4)
    for cell in (start, end):
        theme_mod.set_cell_border(cell, 'top', roles['rule'], 6)
        _top_margin(cell, 6)
        cell.paragraphs[0].text = ''
    p = start.paragraphs[0]
    _tight(p, theme_mod.SIZES['meta'] * 1.4)
    _b.add_script_runs(p, _meta_text(control, _b.L), font)
    for r in p.runs:
        r.font.size = Pt(theme_mod.SIZES['meta'])
        r.font.color.rgb = theme_mod.rgb(roles['muted'])
    owner = control.get('owner')
    p = end.paragraphs[0]
    _tight(p, theme_mod.SIZES['meta'] * 1.4)
    if owner:
        _b.add_script_runs(p, owner, font)
        for r in p.runs:
            r.font.size = Pt(theme_mod.SIZES['meta'])
            r.font.color.rgb = theme_mod.rgb(roles['muted'])
    _end_align(p, rtl)
    for row in table.rows:
        for cell in row.cells:
            if not cell.paragraphs[0].runs and not cell.paragraphs[0].paragraph_format.line_spacing:
                _tiny(cell)


def build_report(document, control: dict, roles: dict, font: str, logos, cv: dict, theme_mod, rtl: bool, data: dict | None = None) -> None:
    """The report title page (business case) on the print's A4 grid, one table of exact-height rows: columns gold cap 20 | gutter 14 | text 160 |
    margin 16 mm. Logos 20 to 40 mm, the band C1 40 to 120 mm (deep fill, the gold cap at the reading start; code chip, kicker, white title), then the
    tiles C4, the decision box C5 and the control block C3 (ID, version, status, date, owner, prepared by; the type's fields after it), the foot at 258 mm."""
    import build_docx as _b
    F = theme_mod.faces(font)
    d = data or {'control': control}
    ck = _cover_key(d)
    widths = [20, 14, 160, 16]
    rows = [('top', 20), ('logo', 20), ('bandA', 41), ('bandB', 39), ('gap', 8), ('body', 130), ('meta', 37.4), ('end', 1.6)]
    at = {name: i for i, (name, _) in enumerate(rows)}
    table = _fresh_table(document, len(rows), widths, rtl, theme_mod)
    for row, (_, h) in zip(table.rows, rows):
        _row_height(row, h)
    C = lambda name, col: table.cell(at[name], col)
    _logos(C('logo', 2), logos, 18)
    # the band: two rows (the title sits at its foot), the cap in the first column
    for name in ('bandA', 'bandB'):
        theme_mod.set_cell_shading(C(name, 0), roles['gold-bright'])
        for col in (1, 2, 3):
            theme_mod.set_cell_shading(C(name, col), roles['navy-deep'])
    cell = C('bandB', 2)
    tcPr = cell._tc.get_or_add_tcPr()
    va = OxmlElement('w:vAlign')
    va.set(qn('w:val'), 'bottom')
    tcPr.append(va)
    p = cell.paragraphs[0]
    _tight(p, 14, after=6)
    code = CODES.get(cv['type'], '')
    if code:
        chip = p.add_run(f' {code} ')
        chip.font.bold = True
        chip.font.size = Pt(theme_mod.SIZES['meta'])
        chip.font.color.rgb = theme_mod.rgb(roles['navy-deep'])
        rPr = chip._element.get_or_add_rPr()
        rf = OxmlElement('w:rFonts')
        for a in ('w:ascii', 'w:hAnsi', 'w:cs'):
            rf.set(qn(a), F['display'])
        rPr.append(rf)
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), _hex(roles.get('paper', '#ffffff')))
        rPr.append(shd)
        _spaced(chip, theme_mod.SIZES['meta'], 0.12)
        p.add_run('   ')
    _b.add_script_runs(p, _b.L['kicker'], font, bold=True)
    for r in p.runs[(2 if code else 0):]:
        r.font.color.rgb = theme_mod.rgb(roles['gold-bright'])
        r.font.size = Pt(theme_mod.SIZES['meta'])
        _spaced(r, theme_mod.SIZES['meta'], 0.1)
    full_title = control.get('title', '')
    parts = re.split('\\s*[:—]\\s+', full_title, maxsplit=1)
    service_name = control.get('coverTitle') or (parts[1] if len(parts) > 1 else full_title)
    tp = cell.add_paragraph()
    _tight(tp, round(theme_mod.SIZES['title'] * 1.3, 1), after=4)
    _b.add_script_runs(tp, service_name, F['cover'], bold=False)
    _runs_style(tp, theme_mod.SIZES['title'], roles.get('paper', '#ffffff'), theme_mod)
    sp = cell.add_paragraph()
    _tight(sp, round(theme_mod.SIZES['table'] * 1.5, 1), after=34)
    sp.add_run(control.get('subtitle') or _b.L['subtitle'])
    _b.set_para_bidi(sp)
    _runs_style(sp, theme_mod.SIZES['table'], roles.get('primary-100', '#e1eaf4'), theme_mod)
    # the body: tiles, decision box, control block (nested tables, top aligned)
    body = C('body', 2)
    first = body.paragraphs[0]

    def after(pt):
        q = body.paragraphs[-1]
        _tight(q, 1, after=pt)
        q.add_run().font.size = Pt(1)
    figs = cover_figures(d)
    if figs:
        tiles_table(document, body, figs, 160, roles, font, theme_mod, rtl, 17)
        after(14)
    if isinstance(ck.get('statement'), dict):
        statement_table(document, body, ck['statement'], 160, roles, font, theme_mod, rtl, '')
        after(14)
    # 0.21.1: no control or field grid on the title page; the data is in the document-control section
    after(1)
    if not first.runs and first._p.getnext() is not None:
        first._p.getparent().remove(first._p)
    # foot (258 mm): a hairline, version / status / date at the start, the owner at the end
    foot = C('meta', 2)
    theme_mod.set_cell_border(foot, 'top', roles['rule'], 6)
    _top_margin(foot, 6)
    ft = _fresh_table(document, 1, [100, 60], rtl, theme_mod, host=foot)
    p = ft.cell(0, 0).paragraphs[0]
    _tight(p, theme_mod.SIZES['meta'] * 1.4)
    _b.add_script_runs(p, _meta_text(control, _b.L), font)
    _runs_style(p, theme_mod.SIZES['meta'], roles['muted'], theme_mod)
    p = ft.cell(0, 1).paragraphs[0]
    _tight(p, theme_mod.SIZES['meta'] * 1.4)
    if control.get('owner'):
        _b.add_script_runs(p, control['owner'], font)
        _runs_style(p, theme_mod.SIZES['meta'], roles['muted'], theme_mod)
    _end_align(p, rtl)
    foot.paragraphs[0]._p.getparent().remove(foot.paragraphs[0]._p) if not foot.paragraphs[0].runs and foot.paragraphs[0]._p.getnext() is not None else None
    _tight(foot.paragraphs[-1], 1)
    for row in table.rows:
        for c in row.cells:
            if not c.paragraphs[0].runs and not c.paragraphs[0].paragraph_format.line_spacing and not c.tables:
                _tiny(c)
