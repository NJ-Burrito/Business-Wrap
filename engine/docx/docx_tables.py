from __future__ import annotations
import cover_design as CD
import model_docx as MD
import re
import theme as theme_mod
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.shared import Inches, Pt, Emu
import build_docx as _b
from build_docx import L, LOCALE
from docx_text import add_script_runs, set_para_bidi

CRITERIA_IND_TWIPS, CRITERIA_HANG_TWIPS = (454, 284)
CRITERIA_AFTER_PT = 3.4

def new_criteria_num_id(document) -> int:
    root = document.part.numbering_part.numbering_definitions._numbering
    existing_ids = [int(el.get(qn('w:numId'))) for el in root.findall(qn('w:num'))]
    new_num_id = max(existing_ids, default=0) + 1
    num_el = parse_xml(f'''<w:num {nsdecls('w')} w:numId="{new_num_id}"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="{CRITERIA_IND_TWIPS}"/></w:tabs><w:ind w:left="{CRITERIA_IND_TWIPS}" w:hanging="{CRITERIA_HANG_TWIPS}"/></w:pPr></w:lvl></w:lvlOverride></w:num>''')
    root.append(num_el)
    return new_num_id

def add_numbered_list_cell(cell, items: list[str], font: str, num_id: int) -> None:
    first = True
    for text in items:
        p = cell.paragraphs[0] if first else cell.add_paragraph()
        first = False
        set_para_bidi(p)
        pPr = p._p.get_or_add_pPr()
        numPr = OxmlElement('w:numPr')
        ilvl = OxmlElement('w:ilvl')
        ilvl.set(qn('w:val'), '0')
        numId = OxmlElement('w:numId')
        numId.set(qn('w:val'), str(num_id))
        numPr.append(ilvl)
        numPr.append(numId)
        pPr.append(numPr)
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(CRITERIA_AFTER_PT)
        add_script_runs(p, text, font)


BLANK_CELLS = {'', '—', '-', '–', 'N/A', 'n/a'}

def _keeps_empty(cell) -> bool:
    return isinstance(cell, dict) and cell.get('keepEmpty') is True

def _is_blank(cell) -> bool:
    return not _keeps_empty(cell) and MD.text_of(cell).strip() in BLANK_CELLS

def apply_render_table_rules(columns, rows, blank_cell=None):
    width = max([len(columns)] + [len(r) for r in rows] + [0])
    keep = [True if blank_cell is not None else any((not _is_blank(r[i] if i < len(r) else '') for r in rows)) for i in range(width)]
    fill = L['none'] if blank_cell is None else blank_cell
    out_cols = [c for i, c in enumerate(columns) if i < width and keep[i]]
    out_rows = [[fill if _is_blank(r[i] if i < len(r) else '') else r[i] for i in range(width) if keep[i]] for r in rows]
    return (out_cols, out_rows)

def fit_columns(pct, texts, nw, table_mm):
    """0.19.0 R4: render.mjs fitColumns: each column at least its longest word wide, a no-wrap column its longest cell (10 pt, 6 mm padding); the
    extra comes from the columns above their floor. A no-wrap column that still cannot fit is returned in `wrap`."""
    em = 3.53 * 0.56
    word = lambda x: max([0] + [len(w) for w in re.split(r'\s+', str(x))])
    line = lambda x: max([0] + [len(l.strip()) for l in str(x).split('\n')])
    floor = [min(100.0, (6 + em * max([1] + [(line(x) if nw[k] else word(x)) for x in col])) / table_mm * 100) for k, col in enumerate(texts)]
    wrap = []
    if sum(floor) > 100:
        for k, on in enumerate(nw):
            if on:
                wrap.append(k)
                floor[k] = min(floor[k], (6 + em * max([1] + [word(x) for x in texts[k]])) / table_mm * 100)
    if sum(floor) > 100:
        return pct, wrap
    out = [max(w, f) for w, f in zip(pct, floor)]
    for _ in range(4):
        over = sum(out) - 100
        if over <= 0.01:
            break
        slack = [max(0.0, w - f) for w, f in zip(out, floor)]
        tot = sum(slack)
        if tot <= 0:
            break
        out = [w - over * sl / tot for w, sl in zip(out, slack)]
    return out, wrap

def add_table(document, columns, rows, font, roles=None, spec=None):
    spec = spec or {}
    blank_cell = spec.get('blankCell') if isinstance(spec.get('blankCell'), str) else None
    # a cell kept empty on purpose (`keepEmpty`) travels as a rich leaf with no words
    rows = [[({'text': str(c.get('text') or ''), 'marks': [], 'keepEmpty': True} if _keeps_empty(c) and not MD.is_rich(c) else c) for c in r] for r in rows]
    merges = [m for m in (spec.get('merges') or []) if isinstance(m, dict)]
    width = max([len(columns)] + [len(r) for r in rows] + [0])
    cw = spec.get('colWidths') if isinstance(spec.get('colWidths'), list) and len(spec.get('colWidths')) == width else None
    fixed = bool(merges or cw)
    # 0.19.0 C8, C13, C9 (render.mjs table()): the table style, the column keys and the status columns address the ORIGINAL column indexes
    tstyle = spec.get('style') if spec.get('style') in ('sheet', 'signoff') else None
    if tstyle == 'signoff' and blank_cell is None:
        blank_cell = ''
    num_set = {i for i in (spec.get('numCols') or []) if isinstance(i, int)} if isinstance(spec.get('numCols'), list) else set()
    nw_set = {i for i in (spec.get('nowrapCols') or []) if isinstance(i, int)} if isinstance(spec.get('nowrapCols'), list) else set()
    acc_col = spec.get('accentCol') if isinstance(spec.get('accentCol'), int) and not isinstance(spec.get('accentCol'), bool) else None
    head_set = {i for i, c in enumerate(columns) if CD.is_status_head(MD.text_of(c if c is not None else ''))} if _b.TYPED and columns else set()
    kept = list(range(width))
    if columns and not fixed:
        kept = [i for i in range(width) if blank_cell is not None or any((not _is_blank(r[i] if i < len(r) else '') for r in rows))]
        columns, rows = apply_render_table_rules(columns, rows, blank_cell)
    elif cw:
        keepc = [i for i in range(width) if float(cw[i] or 0) > 0]
        columns = [columns[i] for i in keepc if i < len(columns)]
        rows = [[(r[i] if i < len(r) else '') for i in keepc] for r in rows]
        cw = [cw[i] for i in keepc]
        kept = keepc
    roles = roles if roles is not None else _b._THEME_ROLES
    ncols = len(columns) if columns else len(rows[0]) if rows else 1
    header = [columns] if columns else []
    all_rows = header + rows
    table = document.add_table(rows=len(all_rows), cols=ncols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    tblPr = table._tbl.tblPr
    if LOCALE == 'ar':
        tblPr.get_or_add_bidiVisual()
    TEXT_WIDTH = Emu(int(Inches(8.27)) - int(Inches(0.55)) * 2)
    table.autofit = False
    tblW = tblPr.find(qn('w:tblW'))
    tblW.set(qn('w:w'), str(int(TEXT_WIDTH.twips)))
    tblW.set(qn('w:type'), 'dxa')
    col_w = Emu(int(TEXT_WIDTH) // max(ncols, 1))
    tot = sum(float(w) for w in cw) if cw else 0
    col_ws = [Emu(int(int(TEXT_WIDTH) * float(w) / tot)) for w in cw] if tot else [col_w] * ncols
    if _b.TYPED and ncols and header:  # 0.19.0 R4 (M2, M3): no column narrower than its longest word, a no-wrap column than its longest cell (render.mjs fitColumns)
        _pct = [100.0 * int(w) / int(TEXT_WIDTH) for w in col_ws]
        _texts = [[MD.text_of(r[c] if c < len(r) and r[c] is not None else '') for r in all_rows] for c in range(ncols)]
        _pct, _wrap = fit_columns(_pct, _texts, [kept[c] in nw_set if c < len(kept) else False for c in range(ncols)], int(TEXT_WIDTH) / 36000)
        col_ws = [Emu(int(int(TEXT_WIDTH) * w / 100)) for w in _pct]
        nw_set = {i for i in nw_set if not any(kept[k] == i for k in _wrap if k < len(kept))}
    for column, w in zip(table.columns, col_ws):
        column.width = w
    covered = {(m['r'] + len(header), c) for m in merges for r in range(m['r'], m['r'] + int(m['rs'])) for c in range(m['c'], m['c'] + int(m['cs'])) if (r, c) != (m['r'], m['c'])}
    heights = spec.get('rowHeights') or []
    for r, row in enumerate(all_rows):
        tr = table.rows[r]._tr
        trPr = tr.get_or_add_trPr()
        if header and r == 0:
            th = OxmlElement('w:tblHeader')
            trPr.append(th)
        else:
            cs = OxmlElement('w:cantSplit')
            trPr.append(cs)
        for c in range(ncols):
            cell_text = row[c] if c < len(row) else ''
            cell = table.cell(r, c)
            cell.width = col_ws[c]
            cell.paragraphs[0].text = ''
            if (r, c) in covered:
                continue
            if fixed and not (header and r == 0) and not MD.text_of(cell_text).strip() and not _keeps_empty(cell_text):
                cell_text = L['none'] if blank_cell is None else blank_cell
            MD.fill_cell(document, cell, cell_text if MD.is_rich(cell_text) else str(cell_text), font, add_script_runs, bold=bool(header) and r == 0)
            MD.cell_valign(cell, cell_text)
    for r, h in enumerate(heights):
        if isinstance(h, (int, float)) and 4 <= h <= 400 and r + len(header) < len(table.rows):
            trPr = table.rows[r + len(header)]._tr.get_or_add_trPr()
            hh = OxmlElement('w:trHeight'); hh.set(qn('w:val'), str(int(h * 56.7))); hh.set(qn('w:hRule'), 'atLeast'); trPr.append(hh)
    for m in merges:
        r0, c0 = m['r'] + len(header), m['c']
        r1, c1 = r0 + int(m['rs']) - 1, c0 + int(m['cs']) - 1
        if r1 < len(table.rows) and c1 < ncols and (r1, c1) != (r0, c0):
            table.cell(r0, c0).merge(table.cell(r1, c1))
    if roles is not None:
        theme_mod.style_table_theme(table, roles, has_header=bool(header))
    orig = lambda c: kept[c] if c < len(kept) else c
    if roles is not None and (tstyle or num_set or nw_set or acc_col is not None):
        for r in range(len(all_rows)):
            is_head = bool(header) and r == 0
            body_n = r - len(header)
            for c in range(ncols):
                if (r, c) in covered:
                    continue
                cell = table.cell(r, c)
                oc = orig(c)
                if tstyle == 'sheet':
                    if is_head:
                        theme_mod.set_cell_shading(cell, roles.get('primary-100', roles['navy-wash']))
                    elif body_n % 2:
                        theme_mod.set_cell_shading(cell, roles.get('primary-50', roles['navy-wash']))
                if tstyle == 'signoff' and not is_head:
                    theme_mod.set_cell_border(cell, 'bottom', roles['rule-strong'], 6)
                    tcPr = cell._tc.get_or_add_tcPr()
                    if tcPr.find(qn('w:vAlign')) is None:
                        va = OxmlElement('w:vAlign'); va.set(qn('w:val'), 'center'); tcPr.append(va)
                if oc in num_set:
                    for p in cell.paragraphs:
                        CD._end_align(p, LOCALE == 'ar')
                if oc in nw_set and not is_head:  # 0.19.0 R3: the heading may wrap
                    tcPr = cell._tc.get_or_add_tcPr()
                    if tcPr.find(qn('w:noWrap')) is None:
                        tcPr.insert_element_before(OxmlElement('w:noWrap'), 'w:tcMar', 'w:textDirection', 'w:tcFitText', 'w:vAlign', 'w:hideMark', 'w:tcPrChange')
                if acc_col is not None and oc == acc_col:
                    if is_head:
                        theme_mod.set_cell_shading(cell, roles['navy'])
                        for run in (x for p in cell.paragraphs for x in p.runs):
                            run.font.color.rgb = theme_mod.rgb(roles.get('paper', '#ffffff'))
                    else:
                        theme_mod.set_cell_shading(cell, roles.get('primary-50', roles['navy-wash']))
                        for run in (x for p in cell.paragraphs for x in p.runs):
                            run.font.bold = True
        if tstyle == 'signoff':
            for r in range(len(header), len(all_rows)):
                hs = heights[r - len(header)] if r - len(header) < len(heights) else None
                CD._min_height(table.rows[r], hs if isinstance(hs, (int, float)) and hs >= 4 else 14)
    if _b.TYPED:  # 0.18.1: a status word in a typed document takes the print's fill and ink (bold, so colour is never the only cue)
        for r, row in enumerate(all_rows):
            if header and r == 0:
                continue
            for c in range(ncols):
                v = row[c] if c < len(row) else ''
                col = CD.status_colors(MD.text_of(v), roles, orig(c) in head_set) if (r, c) not in covered else None
                if col:
                    cell = table.cell(r, c)
                    theme_mod.set_cell_shading(cell, col[0])
                    for run in (x for p in cell.paragraphs for x in p.runs):
                        run.font.color.rgb = theme_mod.rgb(col[1])
                        run.font.bold = True
    if header:
        keep_header_with_next(table)
    return table


def keep_header_with_next(table):
    """A table's header row never sits alone at the foot of a page: its paragraphs keep with the first row.
    0.16.2: the same keep as the print (render.mjs: the header and the first KEEP_ROWS rows `hold` together, and a header never parts from them):
    the header and the rows before the KEEP_ROWS-th body row keep with next, so all of them move to the next page together when they do not fit."""
    n = len(table.rows)
    for ri in range(0, min(KEEP_ROWS, max(n - 1, 0))):  # KEEP_ROWS is defined below (read at call time)
        for cell in table.rows[ri].cells:
            for pp in cell.paragraphs:
                pp.paragraph_format.keep_with_next = True

GROUPABLE_ROWS = 12  # render.mjs GROUPABLE_ROWS


def keep_headed_table(table) -> None:
    """0.16.1 (fault 3): a short table (up to GROUPABLE_ROWS rows) right under a heading prints whole with it (render.mjs `hold head whole`);
    a longer one keeps its first and last three rows. Word: `keep with next` through the rows."""
    prev = table._tbl.getprevious()
    if prev is not None and prev.tag == qn('w:p') and ''.join(prev.itertext()).strip():
        # a lead-in sentence stays with its table (render.mjs `.lead-in{break-after:avoid}`); the heading above it already keeps with it
        pp_ = prev.find(qn('w:pPr'))
        if pp_ is None or pp_.find(qn('w:pStyle')) is None:
            from docx.text.paragraph import Paragraph
            Paragraph(prev, table._parent).paragraph_format.keep_with_next = True
            prev = prev.getprevious()
    ps = prev.find(qn('w:pPr')) if prev is not None and prev.tag == qn('w:p') else None
    st = ps.find(qn('w:pStyle')) if ps is not None else None
    if st is None or not str(st.get(qn('w:val')) or '').startswith('Heading'):
        return
    if len(table.rows) <= GROUPABLE_ROWS:
        for row in table.rows[:-1]:
            for cell in row.cells:
                for pp in cell.paragraphs:
                    pp.paragraph_format.keep_with_next = True
    else:
        keep_rows_together(table)


KEEP_ROWS = 3  # render.mjs KEEP_ROWS: the first and the last three rows of a table never part from its heading or from each other


def keep_rows_together(table, head_p=None) -> None:
    """0.16.1 (fault 3): the print keeps a story card's caption with its first three rows and its last three rows together (render.mjs
    KEEP_ROWS, `hold`); a card may still break in the middle. Word gets the same: `keep with next` on the caption and on every paragraph of
    rows 1..KEEP_ROWS-1 and of the rows before the last, so the first three and the last three rows each stay on one page."""
    rows = table.rows
    n = len(rows)
    if head_p is not None:
        head_p.paragraph_format.keep_with_next = True
    pick = set(range(0, min(KEEP_ROWS - 1, n - 1))) | set(range(max(n - KEEP_ROWS, 0), n - 1))
    for ri in pick:
        for cell in rows[ri].cells:
            for p in cell.paragraphs:
                p.paragraph_format.keep_with_next = True
