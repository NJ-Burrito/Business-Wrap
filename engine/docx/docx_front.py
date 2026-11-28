from __future__ import annotations
import cover_design as CD
import json
import model_docx as MD
import os
import re
import sys
import theme as theme_mod
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from pathlib import Path
import build_docx as _b
from build_docx import DEFAULT_BODY_FONT, L, LOCALE
from docx_tables import add_table
from docx_text import add_script_runs, set_para_bidi

def add_control_front_matter(document, data, font, counters, toc: bool=False, spine: bool=False, back: bool=False):
    """Document control, revisions, approvals and contents. 0.19.0 (C7, C11): a typed document's approval rows are 12 mm tall (room to sign); on a
    title-page family (spine) the contents start their own page. 0.19.0 C10: the parts CD.back_of names (approvals go with control) print after the
    last chapter instead (back=True prints them there, under «Document control»); a form or a sheet prints no contents list."""
    hide = set((data.get('layout') or {}).get('hide') or [])
    back_keys = set(CD.back_of(data))
    if 'control' in back_keys:
        back_keys.add('approvals')
    take = (lambda k: k in back_keys) if back else (lambda k: k not in back_keys)
    if not back and CD.no_contents(data):
        hide = hide | {'toc'}
    control = (data.get('control') or {}) if 'control' not in hide and take('control') else {}
    revisions = (data.get('revisions') or []) if 'revisions' not in hide and take('revisions') else []
    approvals = (data.get('approvals') or []) if take('approvals') else []
    if back:
        hide = hide | {'toc'}
    if not control and (not revisions) and (not approvals):
        return
    h1 = document.add_heading(level=1)
    set_para_bidi(h1)
    _F = theme_mod.faces(font)
    add_script_runs(h1, CD.family_label(data, 'backMatter', LOCALE == 'ar') if back else L['controlChapter'], _F['display'], bold=True)
    if back:
        h1.paragraph_format.keep_with_next = True
        counters['back_matter'] = 1
    if control:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['controlData'], _F['display'], bold=True)
        rows = MD.control_rows(data, L) if data.get('controlTable') else [[label, str(control.get(key, ''))] for key, label in _b.CONTROL_LABELS if control.get(key) is not None]
        control_tbl = add_table(document, [], rows, font)
        theme_mod.style_control_table(control_tbl, _b._THEME_ROLES)
        document.add_paragraph()
        counters['control_table'] = 1
        _tr = CD.control_type_rows(data)  # 0.21.1: the type's own fields (page 1 carries no grid)
        if _tr:
            _tt = add_table(document, [], _tr, font)
            theme_mod.style_control_table(_tt, _b._THEME_ROLES)
            document.add_paragraph()
    if revisions:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['revisions'], _F['display'], bold=True)
        # 0.19.0 R3 (review #3): a typed document prints Version, Date, Description of change, Author (render.mjs revCols); an empty cell stays a cell
        _n = min(4, max([2] + [len(r) for r in revisions if isinstance(r, list)])) if CD.cover_of(data) else 2
        _rc = (_b.REVISIONS_COLUMNS + [CD.family_label(data, 'revDesc', LOCALE == 'ar'), CD.family_label(data, 'revAuthor', LOCALE == 'ar')])[:_n]
        add_table(document, _rc, [r[:_n] for r in revisions], font, spec={'blankCell': ''} if _n > 2 else None)
        document.add_paragraph()
        counters['revisions_table'] = 1
    if approvals:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['approvals'], _F['display'], bold=True)
        _apt = add_table(document, _b.APPROVALS_COLUMNS, approvals, font, spec={'blankCell': '', **({'colWidths': [26, 24, 20, 12, 18]} if len(_b.APPROVALS_COLUMNS) == 5 else {})})  # 0.19.0 R3 (review #1, #15): all five columns, empty cells kept to sign
        if _b.TYPED:
            for _row in _apt.rows[1:]:
                CD._min_height(_row, 12)
        document.add_paragraph()
        counters['approvals_table'] = 1
    if spine and 'toc' not in hide and (control or revisions or approvals):
        MD.page_break(document)
        counters['page_breaks'] = counters.get('page_breaks', 0) + 1
    if 'toc' in hide:
        pass
    elif toc:
        add_toc_field(document, font, 1 if (data.get('layout') or {}).get('tocDepth') == 1 else 2)
        counters['toc_field'] = 1
    else:
        add_contents_table(document, data, font)
        counters['contents_table'] = 1
CONTENTS_TABLE_TAG = 'contents'

def contents_rows(data: dict) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    depth1 = (data.get('layout') or {}).get('tocDepth') == 1  # 0.19.0 C11: contents at depth 1 list the chapters only
    for ch in data.get('chapters', []):
        if ch.get('tocHidden'):
            continue
        rows.append((str(ch.get('number', '')), ch.get('title', ''), 'chapter'))
        if depth1:
            continue
        secs = ch.get('sections', [])
        if len(secs) == 1:
            if (secs[0].get('blocks') or [{}])[0].get('kind') == 'stories' and not secs[0].get('tocHidden'):
                rows.append((str(secs[0].get('number', '')), secs[0].get('title', ''), 'section'))
            for b in secs[0].get('blocks', []):
                if b.get('kind') == 'subhead' and not b.get('tocHidden'):
                    rows.append(('', MD.text_of(b.get('text', '')), 'card'))
        else:
            for sec in secs:
                if not sec.get('tocHidden'):
                    rows.append((str(sec.get('number', '')), sec.get('title', ''), 'section'))
    return rows

def add_contents_table(document, data, font: str):
    h2 = document.add_heading(level=2)
    set_para_bidi(h2)
    add_script_runs(h2, L['contents'], font, bold=True)
    rows = contents_rows(data)
    table = add_table(document, [], [[num, title] for num, title, _ in rows], font)
    caption = OxmlElement('w:tblCaption')
    caption.set(qn('w:val'), CONTENTS_TABLE_TAG)
    table._tbl.tblPr.insert_element_before(caption, 'w:tblDescription', 'w:tblPrChange')
    theme_mod.style_contents_table(table, [kind for _, _, kind in rows], _b._THEME_ROLES)
    document.add_paragraph()
    return table
TOC_INSTR = 'TOC \\o "1-2" \\n 1-2 \\u'
TOC_STYLE_IDS = (-266, -267, -268)
TOC_ENTRY_PT, TOC_ENTRY_AFTER_PT = (12, 6.2)

def add_toc_field(document, font: str, depth: int = 2) -> None:
    head = document.add_paragraph()
    set_para_bidi(head)
    head.paragraph_format.keep_with_next = True
    add_script_runs(head, L['contents'], font, bold=True)
    for r in head.runs:
        r.font.size = Pt(theme_mod.SIZES['h2'])
        r.font.color.rgb = theme_mod.rgb(_b._THEME_ROLES['ink'])
    p = document.add_paragraph()
    set_para_bidi(p)
    r = p.add_run()._r
    begin = OxmlElement('w:fldChar')
    begin.set(qn('w:fldCharType'), 'begin')
    begin.set(qn('w:dirty'), 'true')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = TOC_INSTR if depth != 1 else TOC_INSTR.replace('1-2', '1-1')
    sep = OxmlElement('w:fldChar')
    sep.set(qn('w:fldCharType'), 'separate')
    end = OxmlElement('w:fldChar')
    end.set(qn('w:fldCharType'), 'end')
    for el in (begin, instr, sep):
        r.append(el)
    placeholder = p.add_run(L['tocPlaceholder'])
    placeholder.font.size = Pt(theme_mod.SIZES['meta'])
    p.add_run()._r.append(end)

def refresh_fields(out_docx: Path, font: str=DEFAULT_BODY_FONT) -> str:
    try:
        import pythoncom, win32com.client
    except Exception as exc:
        print(f'WARN: TOC field not refreshed at build time ({exc}); the field is w:dirty so Word updates it on open. Add `--with pywin32` to refresh here.', file=sys.stderr)
        return 'DIRTY_ONLY'
    pythoncom.CoInitialize()
    app = doc = None
    try:
        app = win32com.client.DispatchEx('Word.Application')
        app.Visible = False
        app.DisplayAlerts = 0
        doc = app.Documents.Open(str(out_docx.resolve()), ConfirmConversions=False, AddToRecentFiles=False)
        doc.Fields.Update()
        if doc.TablesOfContents.Count:
            doc.TablesOfContents(1).Update()
        for style_id in TOC_STYLE_IDS:
            st = doc.Styles(style_id)
            st.Font.Name = font
            st.Font.NameBi = font
            st.Font.Size = TOC_ENTRY_PT
            st.ParagraphFormat.SpaceBefore = 0
            st.ParagraphFormat.SpaceAfter = TOC_ENTRY_AFTER_PT
        doc.Repaginate()
        doc.Save()
        return 'REFRESHED'
    except Exception as exc:
        print(f'WARN: TOC field refresh failed ({exc}); field left w:dirty', file=sys.stderr)
        return 'DIRTY_ONLY'
    finally:
        try:
            if doc is not None:
                doc.Close(0)
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass
        pythoncom.CoUninitialize()
def embed_fonts(out_docx: Path) -> str:
    """Fonts travel inside the DOCX (default on; BW_EMBED_FONTS='' turns it off). Pure Python, see embed_fonts.py."""
    raw = os.environ.get('BW_EMBED_FONTS', '')
    if not raw:
        return 'OFF'
    import embed_fonts as _ef
    return _ef.embed(out_docx, json.loads(raw))

def theme_logos(workdir: Path, slots) -> list:
    import base64
    theme = json.loads(theme_mod.THEME_JSON.read_text(encoding='utf-8'))
    out = []
    for slot in slots:
        uri = (theme.get('logos') or {}).get(slot) or ''
        m = re.match('data:image/(png|jpeg);base64,(.+)$', uri)
        if not m:
            continue
        p = Path(workdir) / f"logo-{slot}.{('png' if m.group(1) == 'png' else 'jpg')}"
        p.write_bytes(base64.b64decode(m.group(2)))
        out.append(p)
    return out
