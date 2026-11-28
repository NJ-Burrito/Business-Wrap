"""Business-Wrap DOCX builder: an editable, RTL-correct (AR) / LTR (EN) DOCX replica of a document JSON.
Adapted copy of the source pipeline's DOCX builder: theme from engine/defaults/theme.json (or BW_THEME),
labels from engine/i18n.json per edition (BW_LOCALE), logos only from the design pack.

    python engine/docx/build_docx.py <document.json> <out.docx> [--workdir dir]
"""
from __future__ import annotations
import argparse, json, re, shutil, subprocess, sys, tempfile, zipfile
from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls
from docx.opc.part import Part
from docx.opc.constants import RELATIONSHIP_TYPE as RT
sys.path.insert(0, str(Path(__file__).resolve().parent))
import os
_I18N = json.loads((Path(__file__).resolve().parents[1] / 'i18n.json').read_text(encoding='utf-8'))
LOCALE = os.environ.get('BW_LOCALE', 'ar')
L = dict(_I18N['doc'][LOCALE])
# 0.19.0 R2: run as a script, this module is `__main__`; cover_design.py and theme.py `import build_docx` and would get a SECOND copy whose L never saw
# merge_labels (the cover printed the house kicker and labels, not the document's). One module object under both names.
sys.modules.setdefault('build_docx', sys.modules[__name__])
import theme as theme_mod
import model_docx as MD
import cover_design as CD
DEFAULT_BODY_FONT = 'thmanyah serif text'
HANDLED_KINDS = frozenset({'prose', 'subhead', 'table', 'figure', 'diagram', 'stories', 'gap', 'shots'})
from docx_text import (ARABIC, LATIN_DIGIT, OPENERS, split_by_script, set_para_bidi, LRI, PDI, RLM, _TRAILING_CLOSERS, _CLOSER_MATE, add_script_runs)
from docx_tables import (CRITERIA_IND_TWIPS, CRITERIA_HANG_TWIPS, CRITERIA_AFTER_PT, new_criteria_num_id, add_numbered_list_cell, BLANK_CELLS, _keeps_empty, _is_blank, apply_render_table_rules, fit_columns, add_table, keep_header_with_next, GROUPABLE_ROWS, keep_headed_table, KEEP_ROWS, keep_rows_together)
from docx_figures import (rasterize_svg, open_landscape_section, close_landscape_section, add_figure, REPO_ROOT, add_gap_block, SHOT_RATIOS, SHOT_LABEL, add_shot_frame, add_shots_block)
from docx_cards import (_PPR_AFTER_BDR, _hex, _font_el, card_paragraph, is_shape_label, card_gap, label_bar, thmanyah_only)
from docx_stories import (_TAKEN_STORY_NOS, is_ac_label, add_stories)
from docx_front import (add_control_front_matter, CONTENTS_TABLE_TAG, contents_rows, add_contents_table, TOC_INSTR, TOC_STYLE_IDS, TOC_ENTRY_PT, TOC_ENTRY_AFTER_PT, add_toc_field, refresh_fields, embed_fonts, theme_logos)
from docx_overlays import (_OV_SEQ, _ov_image, anchored_picture, _ov_host, place_overlays, anchor_overlays)


_THEME_ROLES: dict | None = None
TYPED = False  # set in build(): the document has a docType (0.18.1 status cells)


CONTROL_LABELS = [('documentId', L['control']['documentId']), ('title', L['control']['title']), ('preparedBy', L['control']['preparedBy']), ('documentType', L['control']['documentType']), ('classification', L['control']['classification']), ('owner', L['control']['owner']), ('issuedOn', L['control']['issuedOn']), ('version', L['control']['version']), ('status', L['control']['status']), ('reviewCycle', L['control']['reviewCycle'])]
REVISIONS_COLUMNS = [L['revVersion'], L['revDate']]
APPROVALS_COLUMNS = L['approvalCols']


def merge_labels(data: dict) -> None:
    """House labels <- design-pack labels <- this document's labels (as render.mjs withLabels)."""
    global CONTROL_LABELS, REVISIONS_COLUMNS, APPROVALS_COLUMNS
    try:
        pack = (json.loads(theme_mod.THEME_JSON.read_text(encoding='utf-8')).get('labels') or {}).get(LOCALE) or {}
    except Exception:
        pack = {}
    for over in (pack, data.get('labels') or {}):
        for k, v in over.items():
            if k == 'control' and isinstance(v, dict):
                L['control'] = {**L['control'], **v}
            elif v is not None:
                L[k] = v
    CONTROL_LABELS = [(k, L['control'][k]) for k, _ in CONTROL_LABELS]
    REVISIONS_COLUMNS = [L['revVersion'], L['revDate']]
    APPROVALS_COLUMNS = L['approvalCols']

def build(doc_json: Path, out_docx: Path, logo: Path | None, font: str, workdir: Path, toc: bool=False):
    global _THEME_ROLES
    data = json.loads(doc_json.read_text(encoding='utf-8'))
    _TAKEN_STORY_NOS.clear()
    for _c in data.get('chapters', []):
        for _s in _c.get('sections', []):
            for _b in _s.get('blocks', []):
                if _b.get('kind') == 'stories' and _b.get('number'):
                    _TAKEN_STORY_NOS.add(str(_b['number']))
    merge_labels(data)
    hide = set((data.get('layout') or {}).get('hide') or [])
    document = Document()
    # core properties: Word, Explorer and screen readers show the title and the language (the PDF carries them too)
    _ctl = data.get('control') or {}
    document.core_properties.title = str(_ctl.get('title') or '')
    document.core_properties.language = 'ar-JO' if LOCALE == 'ar' else 'en-US'
    section = document.sections[0]
    section.page_width, section.page_height = (Inches(8.27), Inches(11.69))
    section.top_margin = section.bottom_margin = Inches(0)
    section.left_margin = section.right_margin = Inches(0)
    section.header_distance = Inches(0)
    section.footer_distance = Inches(0)
    F = theme_mod.faces(font)
    style = document.styles['Normal']
    style.font.name = F['body']
    style.font.size = Pt(12)
    roles = theme_mod.load_roles()
    _THEME_ROLES = roles
    cv = CD.cover_of(data)  # 0.18.0: a page-1 design (spine | compact; 0.19.0 report/form/sheet print as their nearest) and no motif; None = today's cover
    CD.apply_dense(roles, cv)
    manual = CD.is_manual(data)
    global TYPED
    TYPED = isinstance(data.get('docType'), str) and data.get('docType') != ''
    compact = bool(cv and cv['design'] == 'compact' and 'cover' not in hide)
    one_section = compact or 'cover' in hide  # 0.19.0: no cover page (compact, or a hidden cover): the body starts in the first section, no empty leading page
    theme_mod.apply_style_scale(document, roles, font)
    thmanyah_only(document, F['body'])
    if toc:
        theme_mod.apply_cs_font_to_styles(document, font)
    counters = {'table_block': 0, 'figure': 0, 'stories_block': 0, 'prose_block': 0, 'subhead_block': 0}
    cover_logos = theme_logos(workdir, ('end', 'center', 'start') if LOCALE == 'ar' else ('start', 'center', 'end'))
    header_logo = (theme_logos(workdir, ('header',)) or [None])[0]
    if 'cover' in hide:
        pass
    elif cv and cv['design'] == 'spine':
        CD.build_spine(document, data.get('control') or {}, roles, font, cover_logos, cv, theme_mod, LOCALE == 'ar', data)
    elif not compact:
        theme_mod.build_cover(document, data.get('control') or {}, roles, font, cover_logos)
    from docx.enum.section import WD_SECTION
    body_section = document.sections[0] if one_section else document.add_section(WD_SECTION.NEW_PAGE)  # a compact cover has no page of its own
    from docx.enum.text import WD_LINE_SPACING
    if document.paragraphs and not compact:
        _break_pf = document.paragraphs[-1].paragraph_format
        _break_pf.space_before = Pt(0)
        _break_pf.space_after = Pt(0)
        _break_pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
        _break_pf.line_spacing = Pt(theme_mod.COVER_BREAK_RESERVE_TWIPS / 20)
    body_section.page_width, body_section.page_height = (Inches(8.27), Inches(11.69))
    doc_page = (data.get('layout') or {}).get('page')
    if doc_page:
        MD.apply_page(document.sections[0], MD.page_spec(doc_page))  # the cover (python-docx's last sectPr is the body's)
        MD.apply_page(body_section, MD.page_spec(doc_page))
    body_section.top_margin = Inches(0.7)
    body_section.bottom_margin = Inches(0.63)
    body_section.left_margin = body_section.right_margin = Inches(0.55)
    page_margins = MD.margins_of(data)
    if page_margins:
        MD.apply_margins(body_section, page_margins, LOCALE == 'ar')
    body_section.header_distance = Inches(9 / 25.4)
    body_section.footer_distance = Inches(8 / 25.4)
    ctrl = data.get('control') or {}
    cover_section = document.sections[0]
    theme_mod.add_header_footer(document, roles, font, header_logo, ctrl.get('documentId', ''), ctrl.get('issuedOn', ''), cover_section=cover_section, body_section=body_section, single=one_section)
    def bands(sec, seg=None, first=False):
        # doc.chrome (A5/A6): the section's header and footer from the items; first=True → this section's first page
        for part in ('header', 'footer'):
            hf = (sec.first_page_header if part == 'header' else sec.first_page_footer) if first else (sec.header if part == 'header' else sec.footer)
            p = MD.write_band(hf, MD.chrome_items(data, part, seg), data, L, roles, LOCALE, font, add_script_runs, header_logo, workdir, theme_mod.SIZES)
            MD.tab_stops(p, sec)
        counters['chrome_bands'] = counters.get('chrome_bands', 0) + 1
    if data.get('chrome'):
        bands(body_section)
    seg_starts, block_ids = MD.page_model(data)
    cur_page = MD.page_spec(doc_page) if doc_page else None
    if cv and 'cover' not in hide:  # 0.19.0: no motif picture on page 1 (tests/page1-0190)
        if compact:
            CD.build_compact(document, ctrl, roles, font, cover_logos, cv, int(body_section.page_width - body_section.left_margin - body_section.right_margin), theme_mod, LOCALE == 'ar', data)
        else:
            CD.tighten_cover_header(cover_section, cv)
    spine_front = bool(cv and cv['design'] == 'spine' and 'cover' not in hide and TYPED)
    add_control_front_matter(document, data, font, counters, toc=toc, spine=spine_front)
    _front_shown = bool(set(('control', 'revisions', 'toc')) - hide) or bool(data.get('approvals'))
    _first_ci = next((k for k, c in enumerate(data['chapters']) if not c.get('hidden')), -1)
    _ch1_break = spine_front and _front_shown  # 0.19.0 C11: chapter 1 opens on a new page after the front matter
    body_geometry = {'page_width': body_section.page_width, 'page_height': body_section.page_height, 'top_margin': body_section.top_margin, 'bottom_margin': body_section.bottom_margin, 'left_margin': body_section.left_margin, 'right_margin': body_section.right_margin}
    first_page_secs = []
    def open_segment(seg):
        # a page segment (A18 size/orientation, A6 scoped header/footer items): a new Word section
        from docx.enum.section import WD_SECTION
        sec = document.add_section(WD_SECTION.NEW_PAGE)
        MD.apply_page(sec, seg['page'])
        sec.top_margin, sec.bottom_margin = body_geometry['top_margin'], body_geometry['bottom_margin']
        sec.left_margin, sec.right_margin = body_geometry['left_margin'], body_geometry.get('right_margin', body_geometry['left_margin'])
        body_geometry['page_width'], body_geometry['page_height'] = sec.page_width, sec.page_height
        if data.get('chrome') and (seg['only'] or seg['from']):
            bands(sec, {'from': seg['from'], 'only': []})
            if seg['only']:
                sec.different_first_page_header_footer = True
                bands(sec, seg, first=True)
                first_page_secs.append(len(document.sections) - 1)  # by index: python-docx's last sectPr moves on
        counters['segments'] = counters.get('segments', 0) + 1
        return sec
    place_overlays(document, data, workdir, cover_section, body_section)
    for ci, ch in enumerate(data['chapters']):
        if ch.get('hidden'):
            continue
        # as the print renderer: a chapter holding a figure is set on turned (landscape) sheets, heading included
        wide = any((b.get('kind') in ('figure', 'diagram') for sec in ch['sections'] for b in sec.get('blocks', [])))
        # 0.19.0 R3 (review #6): in a typed document a chapter of several sections stays portrait; only the section that holds the figure turns (render.mjs)
        sec_wide = bool(wide and TYPED and len(ch['sections']) > 1)
        if sec_wide:
            wide = False
        first_ptr = f'/chapters/{ci}/sections/0/blocks/0'
        if first_ptr in seg_starts:
            seg_sec = open_segment(seg_starts.pop(first_ptr))
            if wide:
                # the segment's own section takes the figure chapter's turned sheet (no empty page between)
                from docx.enum.section import WD_ORIENT
                seg_sec.orientation = WD_ORIENT.LANDSCAPE
                seg_sec.page_width, seg_sec.page_height = (Inches(11.69), Inches(8.27))
                seg_sec.top_margin, seg_sec.bottom_margin = Inches(14 / 25.4), Inches(12 / 25.4)
                wide = 'opened'
        elif (_ch1_break and ci == _first_ci) or (ch.get('layout') or {}).get('breakBefore') or (((ch.get('sections') or [{}])[0].get('layout') or {}).get('breakBefore')) or ((((ch.get('sections') or [{}])[0].get('blocks') or [{}]) or [{}])[0].get('layout') or {}).get('breakBefore'):
            MD.page_break(document)
            counters['page_breaks'] = counters.get('page_breaks', 0) + 1
        if wide is True:
            open_landscape_section(document)
        if not ch.get('bare'):  # 0.19.0: a bare chapter (the Blank document's one empty page) prints no heading, as the page does
            h1 = document.add_heading(level=1)
            set_para_bidi(h1)
            theme_mod.add_chapter_chip(h1, ch['number'], F['display'], roles)
            h1.paragraph_format.keep_with_next = True  # 0.19.0 C15: the chapter heading row (chip and title) moves whole, with what follows
            h1.paragraph_format.keep_together = True
            h1.runs[-1].text = '    '  # the chip's own gap is two spaces: in an RTL line the number box sat glued to the title (UAT H1)
            add_script_runs(h1, ch['title'], F['display'], bold=True)
        story_seq = [0]
        counters['step'] = 0
        for si, sec in enumerate(ch['sections']):
            if sec.get('hidden'):
                continue
            counters['step'] = 0
            sec_land = sec_wide and any(b.get('kind') in ('figure', 'diagram') for b in sec.get('blocks', []))
            if sec_land:
                open_landscape_section(document)
            # as the print renderer: a one-section chapter prints no section heading; otherwise «n.m title»
            sec_ptr = f'/chapters/{ci}/sections/{si}/blocks/0'
            if sec_ptr in seg_starts:
                open_segment(seg_starts.pop(sec_ptr))
            elif si and ((sec.get('layout') or {}).get('breakBefore') or (((sec.get('blocks') or [{}])[0].get('layout') or {}).get('breakBefore'))):
                MD.page_break(document)
                counters['page_breaks'] = counters.get('page_breaks', 0) + 1
            first_kind = ((sec.get('blocks') or [{}])[0] or {}).get('kind')
            if len(ch['sections']) > 1 and not (first_kind == 'stories' and not toc):
                # a story section prints no heading of its own (the card's caption carries its number, as in the PDF); the Word contents field keeps it
                h2 = document.add_heading(level=2)
                set_para_bidi(h2)
                num = h2.add_run(f"{sec.get('number', '')}    ")
                num.bold = True
                num.font.color.rgb = theme_mod.rgb(roles['gold'])
                num._element.get_or_add_rPr().insert(0, _font_el(F['display']))
                add_script_runs(h2, sec['title'], F['display'], bold=True)
            _blocks = sec.get('blocks', [])
            _shape_skip = set()
            for bi, block in enumerate(_blocks):
                if bi in _shape_skip:
                    continue
                if block.get('hidden'):
                    continue
                bptr = f'/chapters/{ci}/sections/{si}/blocks/{bi}'
                if bptr in seg_starts:
                    open_segment(seg_starts.pop(bptr))
                elif bi and (block.get('layout') or {}).get('breakBefore'):
                    MD.page_break(document)
                    counters['page_breaks'] = counters.get('page_breaks', 0) + 1
                anchor_overlays(document, data, workdir, bptr, block_ids, font)
                kind = block.get('kind')
                if kind == 'prose':
                    for para_text in block.get('paragraphs', []):
                        p = document.add_paragraph()
                        p.paragraph_format.space_after = Pt(theme_mod.PROSE_AFTER_PT)
                        p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
                        p.paragraph_format.line_spacing = Pt(round(theme_mod.SIZES['body'] * theme_mod.LINE, 1))
                        co = CD.callout_of(para_text) if manual else None
                        if co:
                            # 0.18.0 (user manual): a paragraph that opens with a tag word is a callout: fill and border in its colour, the tag word bold
                            add_script_runs(p, co['tag'] + ' ', font, bold=True)
                            for r in p.runs:
                                r.font.color.rgb = theme_mod.rgb(roles.get(CD._CALLOUT[co['kind']][2], roles['navy']))
                            MD.add_leaf(p, co['rest'], font, add_script_runs)
                            CD.style_callout(p, co['kind'], roles, _PPR_AFTER_BDR)
                        else:
                            MD.add_leaf(p, para_text, font, add_script_runs)
                        info = MD.list_info(para_text)
                        if info:
                            MD.number_paragraph(document, p, info)
                    counters['prose_block'] += 1
                elif kind == 'subhead' and is_shape_label(block) and bi + 1 < len(_blocks) and _blocks[bi + 1].get('kind') == 'table' and not _blocks[bi + 1].get('hidden'):
                    # 0.16.3 (shape): the field shape (a house-label subhead and the plain table under it) prints as the story card's part, as render.mjs does
                    tb = _blocks[bi + 1]
                    _shape_skip.add(bi + 1)
                    label_bar(document, block.get('text', ''), font, roles)
                    shape_tbl = add_table(document, tb.get('columns', []), tb.get('rows', []), font, spec=tb)
                    theme_mod.style_dictionary_table(shape_tbl, _THEME_ROLES)
                    keep_header_with_next(shape_tbl)
                    _nx = _blocks[bi + 2] if bi + 2 < len(_blocks) else {}
                    _nn = _blocks[bi + 3] if bi + 3 < len(_blocks) else {}
                    card_gap(document, roles, closing=not (is_shape_label(_nx) and _nn.get('kind') == 'table'))
                    counters['shape_card_part'] = counters.get('shape_card_part', 0) + 1
                elif kind == 'subhead':
                    p = document.add_paragraph()
                    p.paragraph_format.keep_with_next = True
                    if manual:
                        # 0.18.0 (user manual): a subhead is a step: its number on a filled chip, counting from 1 in each section
                        counters['step'] = counters.get('step', 0) + 1
                        if not (isinstance(block.get('text'), str) and re.match(r'^(?:Step|الخطوة)\s+\d+\s*[:：]', block['text'])):  # 0.19.0 R3 (review #9): the text carries its number: no second chip
                            CD.step_chip(p, counters['step'], F['display'], roles, theme_mod)
                    MD.add_leaf(p, block.get('text', ''), F['subhead'], add_script_runs, bold=False)
                    counters['subhead_block'] += 1
                elif kind == 'table':
                    prev_kind = (sec.get('blocks') or [{}] * (bi + 1))[bi - 1].get('kind') if bi else None
                    if prev_kind == 'stories':
                        # 0.16.1: the output table that follows a story card carries its label bar, as in the print (render.mjs: lb('outputTable'))
                        label_bar(document, L['outputTable'], font, roles)
                        counters['output_label'] = counters.get('output_label', 0) + 1
                    _t = add_table(document, block.get('columns', []), block.get('rows', []), font, spec=block)
                    keep_headed_table(_t)
                    counters['table_block'] += 1
                elif kind == 'figure':
                    svg_src = block.get('svg', '')
                    vb = re.search('viewBox="0 0 ([\\d.]+) ([\\d.]+)"', svg_src)
                    svg_w, svg_h = (float(vb.group(1)), float(vb.group(2))) if vb else (1200.0, 700.0)
                    MAX_W_IN, MAX_H_IN = (10.59, 5.7)
                    scale = min(MAX_W_IN / svg_w, MAX_H_IN / svg_h)
                    add_figure(document, svg_src, block.get('caption', ''), font, workdir, counters, pic_width=Inches(svg_w * scale))
                elif kind == 'diagram' and block.get('resolved'):
                    # native Word shapes (engine/docx/diagram_docx.py): every box, line and label stays editable
                    from diagram_docx import diagram_run
                    counters['figure'] = counters.get('figure', 0) + 1
                    cap = document.add_paragraph()
                    set_para_bidi(cap)
                    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    cap.paragraph_format.keep_with_next = True
                    # the number and the colon are separate runs: one run «1: » was shown as «:1» in an Arabic line (Word reorders a Latin run as a unit)
                    add_script_runs(cap, f"{block.get('figureLabel', '')} {counters['figure']}".strip(), font, bold=True)
                    add_script_runs(cap, f": {block.get('caption', '')}", font, bold=True)
                    p = document.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    fr = block.get('frame') if isinstance(block.get('frame'), dict) else None
                    frame_mm = None
                    if fr:
                        try:
                            # the saved canvas, kept inside the landscape sheet's text area (the editor and the PDF clamp to the page's own room the same way)
                            fw, fh = float(fr.get('wMm')), float(fr.get('hMm'))
                            if fw > 0 and fh > 0:
                                frame_mm = (min(max(fw, 20.0), 10.59 * 25.4), min(max(fh, 20.0), 5.7 * 25.4))
                        except (TypeError, ValueError):
                            frame_mm = None
                    p._p.append(diagram_run(block['resolved'], font, block.get('caption', ''), frame_mm=frame_mm))
                elif kind == 'stories':
                    _fold = None
                    _la, _bd = (_blocks[bi + 1] if bi + 1 < len(_blocks) else {}), (_blocks[bi + 2] if bi + 2 < len(_blocks) else {})
                    _its = block.get('items', [])
                    if is_ac_label(_la) and _bd.get('kind') == 'prose' and _its and not _its[-1].get('acceptance') and not _la.get('hidden') and not _bd.get('hidden')                             and f'/chapters/{ci}/sections/{si}/blocks/{bi + 1}' not in seg_starts and f'/chapters/{ci}/sections/{si}/blocks/{bi + 2}' not in seg_starts:
                        _fold = {'label': _la, 'body': _bd}
                        _shape_skip.update({bi + 1, bi + 2})
                    add_stories(document, block, font, counters, ch['number'], story_seq, _fold)
                    counters['stories_block'] += 1
                elif kind == 'gap':
                    add_gap_block(document, block, font, counters)
                elif kind == 'shots':
                    add_shots_block(document, block, font, counters)
                else:
                    raise ValueError(f"block kind {kind!r} has no handler in build_docx.py (section {sec['title']!r}); add one and list it in HANDLED_KINDS")
            if sec_land:
                close_landscape_section(document, body_geometry)
        if wide:
            close_landscape_section(document, body_geometry)
    add_control_front_matter(document, data, font, counters, toc=toc, back=True)  # 0.19.0 C10: layout.back (a form or a sheet: control and revisions)
    # a new Word section copies the one before it: only the body section restarts the folio at 1, and only a
    # "this page only" segment keeps a first-page header (0.13.0; before, every figure chapter restarted at 1)
    for _k, _s in enumerate(document.sections):
        if _k < 2:
            continue
        for _n in _s._sectPr.findall(qn('w:pgNumType')):
            _s._sectPr.remove(_n)
        if first_page_secs and _k not in first_page_secs and _s.different_first_page_header_footer:
            _s.different_first_page_header_footer = False
    from docx.enum.text import WD_LINE_SPACING
    from docx.text.paragraph import Paragraph
    _flow = [c for c in document.element.body.iterchildren() if c.tag in (qn('w:p'), qn('w:tbl'))]
    _last = Paragraph(_flow[-1], document._body) if _flow and _flow[-1].tag == qn('w:p') else None
    _only_bare = bool(data.get('chapters')) and all(c.get('bare') for c in data['chapters'])  # 0.19.0: the empty page keeps its own typing paragraph; the 1 pt spacer is a paragraph after it
    final_p = _last if _last is not None and (not _last.text.strip()) and not _only_bare else document.add_paragraph()
    _fpf = final_p.paragraph_format
    _fpf.space_before = Pt(0)
    _fpf.space_after = Pt(0)
    _fpf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    _fpf.line_spacing = Pt(1)
    for _r in final_p.runs:
        _r.font.size = Pt(1)
    out_docx.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(out_docx))
    if toc:
        counters['toc_refresh'] = refresh_fields(out_docx, F['body'])
    counters['font_embed'] = embed_fonts(out_docx)
    from thumbnail import add_thumbnail; counters['thumbnail'] = add_thumbnail(out_docx)  # 0.14.0: the DOCX badge in Explorer/Word thumbnails
    return counters
if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('doc_json', type=Path)
    ap.add_argument('out_docx', type=Path)
    ap.add_argument('--logo', type=Path, default=None)
    ap.add_argument('--font', default=DEFAULT_BODY_FONT)
    ap.add_argument('--workdir', type=Path, default=None)
    ap.add_argument('--toc', action='store_true', help='emit a live Word TOC field (off by default: Word rewrites the document on open)')
    ap.add_argument('--i-know-this-project-keeps-docx-on-thamanya', action='store_true', help='kept as an accepted no-op: the 2026-09-22 Cairo refusal it guarded is gone (see below), and scripts still pass it.')
    args = ap.parse_args()
    workdir = args.workdir or args.out_docx.parent
    workdir.mkdir(parents=True, exist_ok=True)
    counters = build(args.doc_json, args.out_docx, args.logo, args.font, workdir, toc=args.toc)
    # the counters are machine data: with --workdir (engine/export.mjs, a temp folder) they stay there, never beside the
    # .docx in the user's DOCX\ folder (0.13.0 review line 15); stdout carries them too
    manifest = (args.workdir / args.out_docx.with_suffix('.manifest.json').name) if args.workdir else args.out_docx.with_suffix('.manifest.json')
    manifest.write_text(json.dumps(counters, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(counters, ensure_ascii=False))
