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


def cover_figures(data: dict) -> list:
    return [f for f in (_cover_key(data).get('figures') or []) if isinstance(f, dict)]

# the moved parts, re-exported under their old names (import cover_design as CD still reaches every one)
from cover_xml import (_hex, _tw, _fresh_table, _row_height, _tight, _tiny, _top_margin, _spaced, _end_align, _logos, _meta_text, _borders, _cell_margins, _min_height)
from cover_tiles import (_box, _set_jc, _runs_style, derived_figures, tiles_table, statement_table, id_cell, badge_cell)
from cover_compact import (tighten_cover_header, step_chip, _CALLOUT, _TAGS, _TAG_RE, callout_of, style_callout, build_compact)
from cover_spine import (control_fields, type_fields, control_type_rows, field_grid, build_spine, build_report)
