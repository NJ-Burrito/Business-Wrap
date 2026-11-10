"""Business-Wrap DOCX cover designs (0.18.0, document studio): `spine` and `compact`, a category colour, one flat motif per document type.

The renderer (engine/render.mjs) is the source of the design: the same keys (`coverDesign`, `motif`), the same type codes, the same motif drawing
(engine/covers/motif-svg.mjs is called for the SVG, which is drawn to a PNG with the builder's own rasterizer). The colours are the theme's own vars,
so a category palette (doc.design.vars) reaches the Word file through BW_THEME with no new colour. Only solid fills, hairlines and one picture are used.
A document with neither key never comes here (theme.build_cover is unchanged for it).
"""
from __future__ import annotations
import subprocess, sys, re
from pathlib import Path
from docx.shared import Pt, Emu, Mm, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# keep in step with engine/render.mjs (COVER_DESIGNS, COVER_MOTIFS, COVER_CODES, COVER_DENSE): tests/cover-designs-0180.test.mjs compares them
DESIGNS = ('spine', 'compact')
MOTIFS = ('blank', 'srs', 'user-manual', 'tot', 'tor', 'brd', 'frs', 'test-plan', 'test-cases', 'uat-signoff', 'release-notes', 'change-request', 'minutes', 'process-flow', 'rtm', 'defect-report', 'business-case')
CODES = {'srs': 'SRS', 'brd': 'BRD', 'frs': 'FRS', 'rtm': 'RTM', 'process-flow': 'PF', 'test-plan': 'TP', 'test-cases': 'TC', 'defect-report': 'DR', 'uat-signoff': 'UAT', 'release-notes': 'RN', 'user-manual': 'UM', 'tot': 'TOT', 'tor': 'TOR', 'change-request': 'CR', 'minutes': 'MOM', 'business-case': 'BC'}
DENSE = ('test-cases', 'rtm', 'defect-report', 'release-notes')
MOTIF_SCRIPT = Path(__file__).resolve().parents[1] / 'covers' / 'motif-svg.mjs'
MOTIF_SCALE = 12  # css px of the 160 x 94 box to device px: 152 mm shown = about 300 dpi


def cover_of(data: dict) -> dict | None:
    """{'design', 'motif'} the document asks for, or None (today's cover). A motif alone means the spine design."""
    motif = data.get('motif') if data.get('motif') in MOTIFS else ''
    design = data.get('coverDesign') if data.get('coverDesign') in DESIGNS else ('spine' if motif else '')
    return {'design': design, 'motif': motif} if design else None


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
    if cv and cv['motif'] in DENSE:
        roles.setdefault('th-fill', roles.get('primary-100', '#e1eaf4'))
        roles.setdefault('zebra', roles.get('primary-50', '#f2f6fa'))


def motif_png(motif: str, rtl: bool, workdir: Path, theme_json: Path) -> Path | None:
    """The motif drawn to a PNG (flat shapes, 300 dpi at the shown size), or None when node or Chrome is not there (the cover then has no motif)."""
    if not motif:
        return None
    try:
        import build_docx as _b
        svg = subprocess.run(['node', str(MOTIF_SCRIPT), motif, 'rtl' if rtl else 'ltr', str(theme_json)], check=True, capture_output=True, text=True, encoding='utf-8').stdout
        png = Path(workdir) / f'cover-motif-{motif}-{"rtl" if rtl else "ltr"}.png'
        _b.rasterize_svg(svg, png, scale=MOTIF_SCALE)
        return png if png.exists() else None
    except Exception as e:  # a missing browser must not stop the export: the cover keeps its type code and colour
        print(f'WARN: cover motif {motif} not drawn: {e}', file=sys.stderr)
        return None


# ---- small OOXML helpers (heights, borders, shading are the builder's own idioms) ----
def _hex(v: str) -> str:
    return str(v).lstrip('#').upper()


def _tw(mm: float) -> int:
    return int(round(mm * 56.6929))


def _fresh_table(document, rows: int, widths_mm: list[float], rtl: bool, theme_mod):
    table = document.add_table(rows=rows, cols=len(widths_mm))
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
        run.add_picture(str(l), height=Mm(height_mm))


def _meta_text(control: dict, L: dict) -> str:
    return L['comma'].join([control.get('version', ''), control.get('status', ''), control.get('issuedOn', '')])


def build_spine(document, control: dict, roles: dict, font: str, logos, cv: dict, theme_mod, rtl: bool) -> None:
    """The spine cover on the same A4 grid as the print (covers.md section 1), as one table of exact-height rows: columns spine 20 | gutter 14 |
    three text columns (20, 60, 80) | right margin 16 mm. Row heights put every line at the print's y, so Word needs no paragraph arithmetic."""
    import build_docx as _b
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
    theme_mod.set_cell_border(hair, 'bottom', roles['rule'], 6)
    # type code: Display Black, cap height 12 mm (48.6 pt on a 1.0 line), baseline at 106 mm
    code = CODES.get(cv['motif'], '')
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


def place_motif(cover_section, png: Path | None, rtl: bool, cv: dict) -> None:
    """The spine cover's motif: one anchored picture on the page (34 mm from the start edge, 163 mm down, 152 mm wide), mirrored for Arabic by the drawing itself."""
    if cv['design'] != 'spine':
        return
    for hp in cover_section.header.paragraphs:  # the cover's top margin is 0: an empty header line of normal height would push the whole table down
        _tight(hp, 1)
        hp.add_run().font.size = Pt(1)
    if not png:
        return
    import build_docx as _b
    host = _b._ov_host(cover_section.header.add_paragraph)
    _b.anchored_picture(host, png, 24 if rtl else 34, 163, 152)


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


def build_compact(document, control: dict, roles: dict, font: str, logos, cv: dict, png: Path | None, text_width: int, theme_mod, rtl: bool) -> None:
    """The compact cover: no page of its own, a title block at the head of page 1: a band (gold cap, deep colour), the type code and kicker, the title
    and subtitle with the small motif at the end, a meta line (version, status, date, document code). Three small tables on the body's own margins."""
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
            run.add_picture(str(l), height=Mm(12))
    else:
        spacer().paragraph_format.space_after = Pt(8)
    # title block: text | motif
    mot_w = 52 if png else 0
    main = _fresh_table(document, 1, [W - mot_w, mot_w] if mot_w else [W], rtl, theme_mod)
    text_cell = main.cell(0, 0)
    p = text_cell.paragraphs[0]
    _tight(p, 14, after=6)
    code = CODES.get(cv['motif'], '')
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
    _tight(tp, round(theme_mod.SIZES['title'] * 1.3, 1), after=4)
    _b.add_script_runs(tp, service_name, F['cover'], bold=False)
    for r in tp.runs:
        r.font.size = Pt(theme_mod.SIZES['title'])
        r.font.color.rgb = theme_mod.rgb(roles['ink'])
    sp = text_cell.add_paragraph()
    _tight(sp, round(theme_mod.SIZES['table'] * 1.5, 1))
    sp.add_run(control.get('subtitle') or _b.L['subtitle'])
    _b.set_para_bidi(sp)
    for r in sp.runs:
        r.font.size = Pt(theme_mod.SIZES['table'])
        r.font.color.rgb = theme_mod.rgb(roles['muted'])
    if mot_w:
        mc = main.cell(0, 1)
        mp = mc.paragraphs[0]
        _tight(mp)
        _end_align(mp, rtl)
        mp.add_run().add_picture(str(png), width=Mm(46))
    spacer().paragraph_format.space_after = Pt(4)
    # meta line
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
    spacer().paragraph_format.space_after = Pt(10)


# 0.18.1: status cells of a typed document. MIRRORS engine/render.mjs STATUS_WORDS + polishCss (kind -> fill var, ink var); keep the two in step.
_STATUS_WORDS = {'ok': ('Pass', 'Passed', 'Covered', 'ناجح', 'نجح', 'مغطى'), 'bad': ('Fail', 'Failed', 'Gap', 'فاشل', 'فشل', 'ثغرة', 'فجوة'),
                 'warn': ('Blocked', 'Partial', 'محجوب', 'جزئي'), 'idle': ('Not run', 'لم ينفذ')}
_STATUS_VARS = {'ok': ('success-100', 'success-700'), 'bad': ('signal-100', 'signal-600'), 'warn': ('accent-100', 'accent-800'), 'idle': ('neutral-100', 'neutral-700')}


def status_colors(text, roles: dict):
    """(fill, ink) hex for a cell whose whole text is a status word, else None (print: render.mjs statusKind)."""
    t = str(text or '').strip()
    for kind, words in _STATUS_WORDS.items():
        if t in words:
            fill, ink = (roles.get(v) for v in _STATUS_VARS[kind])
            return (fill, ink) if fill and ink else None
    return None
