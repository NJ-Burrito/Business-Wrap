"""Business-Wrap DOCX page-1 designs (0.18.0 document studio; 0.19.0 page-1 families): `spine` (a title page) and `compact` (a title block on page 1),
a category colour, and since 0.19.0 NO motif and no art on page 1 (work/sdlc/design/0190-types.md §1, tests/page1-0190).

The renderer (engine/render.mjs) is the source of the design: the same keys (`coverDesign`, `docType`; an old file's `motif` only names the type), the
same type codes, the same control block (C3 field grid) where the 0.18 motif was. The colours are the theme's own vars, so a category palette
(doc.design.vars) reaches the Word file through BW_THEME with no new colour. Only solid fills and straight rules are drawn; the only pictures are
logos the user adds, and every one is named `logo-...` (wp:docPr) so the page-1 test can tell a logo from art.
A document with neither key never comes here (theme.build_cover is unchanged for it).
"""
from __future__ import annotations
import re
from pathlib import Path
from docx.shared import Pt, Emu, Mm, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# keep in step with engine/render.mjs (COVER_DESIGNS, COVER_TYPES, COVER_CODES, COVER_DENSE, COVER_CONTROL): tests/cover-designs-0180.test.mjs compares them
DESIGNS = ('spine', 'compact', 'report', 'form', 'sheet')
LAYOUT = {'spine': 'spine', 'report': 'spine', 'compact': 'compact', 'form': 'compact', 'sheet': 'compact'}  # R2 builds report, form and sheet
TYPES = ('blank', 'srs', 'user-manual', 'tot', 'tor', 'brd', 'frs', 'test-plan', 'test-cases', 'uat-signoff', 'release-notes', 'change-request', 'minutes', 'process-flow', 'rtm', 'defect-report', 'business-case')
CODES = {'srs': 'SRS', 'brd': 'BRD', 'frs': 'FRS', 'rtm': 'RTM', 'process-flow': 'PF', 'test-plan': 'TP', 'test-cases': 'TC', 'defect-report': 'DEF', 'uat-signoff': 'UAT', 'release-notes': 'RN', 'user-manual': 'UM', 'tot': 'TOT', 'tor': 'TOR', 'change-request': 'CR', 'minutes': 'MOM', 'business-case': 'BC'}
DENSE = ('test-cases', 'rtm', 'defect-report', 'release-notes')
CONTROL = ('documentId', 'version', 'status', 'issuedOn', 'owner', 'preparedBy', 'approvedBy', 'classification')
CONTROL_LABELS = {'approvedBy': {'en': 'Approved by', 'ar': 'جهة الاعتماد'}}
FIELD_KINDS = ('text', 'chip', 'date', 'blank')
FIELD_COLS = (2, 3, 4, 6)
# 0.19.0 R2 (render.mjs FIGURE_KINDS, REPORT_CONTROL, FAMILY_LABELS, backOf, noContents)
FIGURE_KINDS = ('none', 'ok', 'warn', 'bad', 'idle')
REPORT_CONTROL = ('documentId', 'version', 'status', 'issuedOn', 'owner', 'preparedBy')
FAMILY_LABELS = {'backMatter': {'en': 'Document control', 'ar': 'ضبط الوثيقة'}, 'total': {'en': 'Total', 'ar': 'الإجمالي'}, 'seal': {'en': 'Seal', 'ar': 'الختم'},
                 'revDesc': {'en': 'Description of change', 'ar': 'وصف التغيير'}, 'revAuthor': {'en': 'Author', 'ar': 'المعد'}}


def family_label(data: dict, key: str, rtl: bool) -> str:
    """A family word (render.mjs FAMILY_LABELS); the document's labels.<key> wins."""
    v = (data.get('labels') or {}).get(key)
    return v if isinstance(v, str) and v else FAMILY_LABELS[key]['ar' if rtl else 'en']


def back_of(data: dict) -> list:
    """C10: the parts printed after the last chapter (render.mjs backOf): layout.back, else control and revisions for a form or a sheet."""
    cv = cover_of(data)
    lay = data.get('layout') or {}
    asked = [k for k in lay.get('back') if k in ('control', 'revisions')] if isinstance(lay.get('back'), list) else None
    keys = asked if asked is not None else (['control', 'revisions'] if cv and cv['family'] in ('form', 'sheet') else [])
    hide = set(lay.get('hide') or [])
    out = []
    for k in keys:
        if k not in hide and k not in out:
            out.append(k)
    return out


def no_contents(data: dict) -> bool:
    cv = cover_of(data)
    return bool(cv and cv['family'] in ('form', 'sheet'))


def cover_of(data: dict) -> dict | None:
    """{'design': the layout drawn, 'family': the asked family, 'type': the type id or ''}, or None (today's cover). An old `motif` alone means spine."""
    old = data.get('motif') if data.get('motif') in TYPES else ''
    typ = data.get('docType') if data.get('docType') in TYPES else old
    family = data.get('coverDesign') if data.get('coverDesign') in DESIGNS else ('spine' if old else '')
    return {'design': LAYOUT[family], 'family': family, 'type': typ} if family else None


def is_manual(data: dict) -> bool:
    return data.get('motif') == 'user-manual' or data.get('docType') == 'user-manual'


def _lum(hex_value: str) -> float:
    rgb = [int(hex_value.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted((_lum(a), _lum(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def spine_code_color(roles: dict) -> str:
    """Gold where it reads on the spine (4.5:1), else the pale gold step (render.mjs spineCodeColor)."""
    gold, deep = roles.get('gold-bright', '#be9a41'), roles.get('navy-deep', '#001e3d')
    return roles.get('accent-200', '#e3ddce') if contrast(gold, deep) < 4.5 else gold


def apply_dense(roles: dict, cv: dict | None) -> None:
    """The sheets people scan down (test cases, RTM, defects, release notes) get a washed header and a faint zebra, as the print does."""
    if cv and cv['type'] in DENSE:
        roles.setdefault('th-fill', roles.get('primary-100', '#e1eaf4'))
        roles.setdefault('zebra', roles.get('primary-50', '#f2f6fa'))


def name_logo(shape, path) -> None:
    """Word names a picture `Picture n`; a logo is named `logo-<file stem>` so page 1 can be told from art (spec §3: only `logo-*` pictures are allowed)."""
    stem = Path(str(path)).stem
    shape._inline.docPr.set('name', stem if stem.startswith('logo-') else f'logo-{stem}')


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


# 0.18.1: status cells of a typed document. MIRRORS engine/render.mjs STATUS_WORDS + polishCss (kind -> fill var, ink var); keep the two in step.
_STATUS_WORDS = {'ok': ('Pass', 'Passed', 'Covered', 'ناجح', 'نجح', 'مغطى'), 'bad': ('Fail', 'Failed', 'Gap', 'فاشل', 'فشل', 'ثغرة', 'فجوة'),
                 'warn': ('Blocked', 'Partial', 'محجوب', 'جزئي'), 'idle': ('Not run', 'لم ينفذ')}
_STATUS_VARS = {'ok': ('success-100', 'success-700'), 'bad': ('signal-100', 'signal-600'), 'warn': ('accent-100', 'accent-800'), 'idle': ('neutral-100', 'neutral-700')}


# 0.19.0 C9: words filled only in a status column (render.mjs STATUS_WORDS_HEADED, STATUS_HEADS, isStatusHead)
_STATUS_WORDS_HEADED = {'ok': ('Done', 'Approved', 'Accepted', 'Fixed', 'Added', 'منجز', 'معتمد', 'مقبول', 'مصلح', 'مضاف'),
                        'bad': ('Critical', 'Overdue', 'Rejected', 'Removed', 'Security', 'حرج', 'متأخر', 'مرفوض', 'محذوف', 'أمني'),
                        'warn': ('High', 'Deferred', 'Changed', 'Deprecated', 'عال', 'مؤجل', 'معدل', 'مهمل'),
                        'idle': ('Open', 'مفتوح')}
STATUS_HEADS = ('Status', 'Result', 'Severity', 'Priority', 'Type', 'Impact', 'Decision', 'الحالة', 'النتيجة', 'الخطورة', 'الأولوية', 'النوع', 'الأثر', 'القرار')
_HEAD_TOKENS = {t for h in STATUS_HEADS for t in ([h.lower()] + ([h[2:]] if h.startswith('ال') else []))}


def is_status_head(text) -> bool:
    """A column heading one of whose words (brackets dropped) is a status head word."""
    t = re.sub(r'\([^)]*\)', ' ', str(text or ''))
    return any(w and w.lower() in _HEAD_TOKENS for w in re.split(r'[\s/،,]+', t))


def status_kind(text, headed: bool = False) -> str:
    t = str(text or '').strip()
    for kind, words in _STATUS_WORDS.items():
        if t in words:
            return kind
    if headed:
        for kind, words in _STATUS_WORDS_HEADED.items():
            if t in words:
                return kind
    return ''


def status_colors(text, roles: dict, headed: bool = False):
    """(fill, ink) hex for a cell whose whole text is a status word (a C9 word too in a status column), else None (print: render.mjs statusKind)."""
    kind = status_kind(text, headed)
    if not kind:
        return None
    fill, ink = (roles.get(v) for v in _STATUS_VARS[kind])
    return (fill, ink) if fill and ink else None


# ---- 0.19.0 R2: the report, form and sheet families (render.mjs coverDesigned); square corners, straight rules, solid fills only ----
def _cover_key(data: dict) -> dict:
    c = (data or {}).get('cover')
    return c if isinstance(c, dict) else {}


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


def cover_figures(data: dict) -> list:
    return [f for f in (_cover_key(data).get('figures') or []) if isinstance(f, dict)]


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
