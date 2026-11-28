from __future__ import annotations
import re
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from build_docx import LOCALE

ARABIC = re.compile('[\u0600-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-\ufeff]')
LATIN_DIGIT = re.compile('[A-Za-z0-9]')


OPENERS = set('([{«')

def split_by_script(text: str) -> list[tuple[str, bool]]:
    if not text:
        return [('', True)]
    n = len(text)
    segments: list[tuple[str, bool]] = []
    cur: list[str] = []
    cur_is_ar: bool | None = None
    for i, ch in enumerate(text):
        if ARABIC.match(ch):
            ch_class: bool | None = True
        elif LATIN_DIGIT.match(ch):
            ch_class = False
        else:
            ch_class = None
        if ch_class is None:
            if ch in OPENERS and cur_is_ar is not None:
                j = i + 1
                while j < n and ARABIC.match(text[j]) is None and (LATIN_DIGIT.match(text[j]) is None):
                    j += 1
                if j < n:
                    intro_is_ar = bool(ARABIC.match(text[j]))
                    if intro_is_ar != cur_is_ar:
                        segments.append((''.join(cur), cur_is_ar))
                        cur = []
                        cur_is_ar = intro_is_ar
            cur.append(ch)
            continue
        if cur_is_ar is None:
            cur_is_ar = ch_class
        if ch_class != cur_is_ar:
            segments.append((''.join(cur), cur_is_ar))
            cur = []
            cur_is_ar = ch_class
        cur.append(ch)
    if cur:
        segments.append((''.join(cur), cur_is_ar if cur_is_ar is not None else True))
    return segments

def set_para_bidi(paragraph):
    if LOCALE != 'ar':
        return
    pPr = paragraph._p.get_or_add_pPr()
    if pPr.find(qn('w:bidi')) is None:
        pPr.append(OxmlElement('w:bidi'))
    existing = pPr.find(qn('w:jc'))
    if existing is not None:
        pPr.remove(existing)
    jc = OxmlElement('w:jc')
    jc.set(qn('w:val'), 'start')
    pPr.append(jc)
LRI, PDI, RLM = ('\u202a', '\u202c', '\u200f')
if LOCALE != 'ar':
    RLM = ''
_TRAILING_CLOSERS = set(')]}»”\'"')
_CLOSER_MATE = {')': '(', ']': '[', '}': '{', '»': '«', '”': '“'}

def add_script_runs(paragraph, text: str, font: str, bold: bool=False):
    set_para_bidi(paragraph)
    segments = split_by_script(text)
    n_ar = n_lat = 0
    last_is_ar = True
    last_seg = ''
    for seg, is_ar in segments:
        if not seg:
            continue
        needs_wrap = not is_ar and bool(re.search('[A-Za-z]', seg))
        if needs_wrap:
            core = seg.strip()
            lead, trail = (seg[:len(seg) - len(seg.lstrip())], seg[len(seg.rstrip()):])
            while len(core) > 1 and core[-1] in _CLOSER_MATE and (_CLOSER_MATE[core[-1]] not in core):
                trail = core[-1] + trail
                core = core[:-1]
            run_text = f'{lead}{LRI}{core}{PDI}{trail}' if LOCALE == 'ar' else f'{lead}{core}{trail}'
        else:
            run_text = seg
        run = paragraph.add_run(run_text)
        run.bold = bold
        rPr = run._element.get_or_add_rPr()
        rFonts = OxmlElement('w:rFonts')
        rFonts.set(qn('w:ascii'), font)
        rFonts.set(qn('w:hAnsi'), font)
        rFonts.set(qn('w:cs'), font)
        rPr.append(rFonts)
        if is_ar:
            rPr.append(OxmlElement('w:rtl'))
            lang = OxmlElement('w:lang')
            lang.set(qn('w:bidi'), 'ar-JO')
            rPr.append(lang)
            n_ar += 1
        else:
            lang = OxmlElement('w:lang')
            lang.set(qn('w:val'), 'en-US')
            rPr.append(lang)
            n_lat += 1
        last_is_ar, last_seg = (is_ar, seg)
    if segments and (not last_is_ar) and last_seg and (last_seg[-1] in _TRAILING_CLOSERS):
        rlm_run = paragraph.add_run(RLM)
        rlm_rPr = rlm_run._element.get_or_add_rPr()
        rlm_rPr.append(OxmlElement('w:rtl'))
    return (n_ar, n_lat)
