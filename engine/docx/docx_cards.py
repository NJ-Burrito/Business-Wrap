from __future__ import annotations
import re
import theme as theme_mod
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt
from build_docx import L, LOCALE, _I18N
from docx_text import add_script_runs, set_para_bidi

_PPR_AFTER_BDR = ('w:shd', 'w:tabs', 'w:suppressAutoHyphens', 'w:kinsoku', 'w:wordWrap', 'w:overflowPunct', 'w:topLinePunct', 'w:autoSpaceDE', 'w:autoSpaceDN', 'w:bidi', 'w:adjustRightInd', 'w:snapToGrid', 'w:spacing', 'w:ind', 'w:contextualSpacing', 'w:mirrorIndents', 'w:suppressOverlap', 'w:jc', 'w:textDirection', 'w:textAlignment', 'w:textboxTightWrap', 'w:outlineLvl', 'w:divId', 'w:cnfStyle', 'w:rPr', 'w:sectPr', 'w:pPrChange')

def _hex(v):
    return str(v).lstrip('#').upper()

def _font_el(font):
    rFonts = OxmlElement('w:rFonts')
    for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
        rFonts.set(qn(a), font)
    return rFonts

def card_paragraph(paragraph, roles, edges=('left', 'right'), start_edge=None, fill=True):
    """A paragraph that is a band of the sand story card (the print's .story): sand fill and the card's strong rule on the
    sides it asks for; `start_edge` (the side the text starts on) gets the gold label rule instead (the print's .run-in)."""
    pPr = paragraph._p.get_or_add_pPr()
    for old in pPr.findall(qn('w:pBdr')) + pPr.findall(qn('w:shd')):
        pPr.remove(old)
    bdr = OxmlElement('w:pBdr')
    for edge in ('top', 'left', 'bottom', 'right'):
        if edge not in edges and edge != start_edge:
            continue
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        gold = edge == start_edge
        el.set(qn('w:sz'), '16' if gold else '6')
        el.set(qn('w:space'), '4' if edge in ('left', 'right') else '1')
        el.set(qn('w:color'), _hex(roles['accent-rule'] if gold else roles['rule-strong']))
        bdr.append(el)
    if len(bdr):
        pPr.insert_element_before(bdr, *_PPR_AFTER_BDR)
    if fill:
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), _hex(roles['card']))
        pPr.insert_element_before(shd, *_PPR_AFTER_BDR[1:])

def is_shape_label(block) -> bool:
    """0.16.3: a subhead that carries one of the story card's house labels (this document's wording or either locale's default)."""
    if not isinstance(block, dict) or block.get('kind') != 'subhead' or not isinstance(block.get('text'), str):
        return False
    known = {L.get('actionsTable'), L.get('dictionary'), _I18N['doc']['ar']['actionsTable'], _I18N['doc']['ar']['dictionary'], _I18N['doc']['en']['actionsTable'], _I18N['doc']['en']['dictionary']}
    norm = lambda x: re.sub(r'\s+', ' ', re.sub(r'[\s:：]+$', '', x)).strip().lower()
    return norm(block['text']) in {norm(x) for x in known if isinstance(x, str) and x}

def card_gap(document, roles, closing=False):
    """The sand strip between the parts of a story card (and its closing edge): a 4 pt shaded paragraph, not an empty body line."""
    p = document.add_paragraph()
    set_para_bidi(p)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    pPr = p._p.get_or_add_pPr()
    rPr = OxmlElement('w:rPr')
    for tag in ('w:sz', 'w:szCs'):
        sz = OxmlElement(tag)
        sz.set(qn('w:val'), '8')
        rPr.append(sz)
    pPr.append(rPr)
    card_paragraph(p, roles, edges=('left', 'right', 'bottom') if closing else ('left', 'right'))
    return p

def label_bar(document, text, font, roles):
    """The print's run-in label («جدول الإجراءات», «قاموس البيانات والمصطلحات», «بطاقات القصص»): bold in the primary colour with a gold rule on the starting side."""
    p = document.add_paragraph()
    set_para_bidi(p)
    p.paragraph_format.keep_with_next = True
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    add_script_runs(p, text, font, bold=True)
    for run in p.runs:
        run.font.size = Pt(theme_mod.SIZES['table'])
        run.font.color.rgb = theme_mod.rgb(roles['primary'])
    card_paragraph(p, roles, edges=(), start_edge='right' if LOCALE == 'ar' else 'left', fill=False)
    return p

def thmanyah_only(document, font):
    """Thmanyah only, in Word too: the template's defaults (theme fonts: Calibri, Cambria Math for equations) would draw every space and
    paragraph mark that carries no run font in Calibri, Cambria Math or Arial. docDefaults, every style and the equation font name the
    document font instead, so the exported PDF holds no other face (UAT: Word font line)."""
    styles_el = document.styles.element
    rpr_nodes = [n for n in styles_el.iter(qn('w:rFonts'))]
    for rf in rpr_nodes:
        for a in list(rf.attrib):
            if a.endswith('Theme'):
                del rf.attrib[a]
        for a in ('w:ascii', 'w:hAnsi', 'w:cs', 'w:eastAsia'):
            if rf.get(qn(a)) is None:
                rf.set(qn(a), font)
    defaults = styles_el.find(qn('w:docDefaults'))
    if defaults is not None:
        rpr = defaults.find(qn('w:rPrDefault') + '/' + qn('w:rPr'))
        if rpr is not None and rpr.find(qn('w:rFonts')) is None:
            rpr.insert(0, _font_el(font))
    try:
        settings = document.settings.element
        for mf in settings.iter('{http://schemas.openxmlformats.org/officeDocument/2006/math}mathFont'):
            mf.set('{http://schemas.openxmlformats.org/officeDocument/2006/math}val', font)
    except Exception:
        pass
