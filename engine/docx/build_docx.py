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
import theme as theme_mod
import model_docx as MD
DEFAULT_BODY_FONT = 'thmanyah serif text'
ARABIC = re.compile('[\u0600-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-\ufeff]')
LATIN_DIGIT = re.compile('[A-Za-z0-9]')
HANDLED_KINDS = frozenset({'prose', 'subhead', 'table', 'figure', 'diagram', 'stories', 'gap', 'shots'})
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
_THEME_ROLES: dict | None = None
BLANK_CELLS = {'', '—', '-', '–', 'N/A', 'n/a'}

def _is_blank(cell) -> bool:
    return MD.text_of(cell).strip() in BLANK_CELLS

def apply_render_table_rules(columns, rows):
    width = max([len(columns)] + [len(r) for r in rows] + [0])
    keep = [any((not _is_blank(r[i] if i < len(r) else '') for r in rows)) for i in range(width)]
    out_cols = [c for i, c in enumerate(columns) if i < width and keep[i]]
    out_rows = [[L['none'] if _is_blank(r[i] if i < len(r) else '') else r[i] for i in range(width) if keep[i]] for r in rows]
    return (out_cols, out_rows)

def add_table(document, columns, rows, font, roles=None, spec=None):
    spec = spec or {}
    merges = [m for m in (spec.get('merges') or []) if isinstance(m, dict)]
    width = max([len(columns)] + [len(r) for r in rows] + [0])
    cw = spec.get('colWidths') if isinstance(spec.get('colWidths'), list) and len(spec.get('colWidths')) == width else None
    fixed = bool(merges or cw)
    if columns and not fixed:
        columns, rows = apply_render_table_rules(columns, rows)
    elif cw:
        keepc = [i for i in range(width) if float(cw[i] or 0) > 0]
        columns = [columns[i] for i in keepc if i < len(columns)]
        rows = [[(r[i] if i < len(r) else '') for i in keepc] for r in rows]
        cw = [cw[i] for i in keepc]
    roles = roles if roles is not None else _THEME_ROLES
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
            if fixed and not (header and r == 0) and not MD.text_of(cell_text).strip():
                cell_text = L['none']
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
    return table

def rasterize_svg(svg: str, out_png: Path, scale: int=3) -> None:
    m = re.search('viewBox="0 0 ([\\d.]+) ([\\d.]+)"', svg)
    w, h = (float(m.group(1)), float(m.group(2))) if m else (1200.0, 700.0)
    html = f'<!doctype html><html><head><meta charset="utf-8"><style>\n    html,body{{margin:0;padding:0;background:#fff}}</style></head>\n    <body>{svg}</body></html>'
    html_path = out_png.with_suffix('.raster.html')
    html_path.write_text(html, encoding='utf-8')
    repo_root = Path(__file__).resolve().parents[2]
    script = out_png.with_suffix('.raster.cjs')
    script.write_text(f"\nconst path = require('path');\nconst playwrightPath = require.resolve('playwright-core', {{ paths: [{json.dumps(str(repo_root))}] }});\nconst {{ chromium }} = require(playwrightPath);\n(async () => {{\n  const browser = await chromium.launch({{ executablePath: process.env.BW_CHROME || undefined, args: process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [] }});\n  const page = await browser.newPage({{ viewport: {{ width: Math.ceil({w}), height: Math.ceil({h}) }}, deviceScaleFactor: {scale} }});\n  await page.goto({json.dumps(html_path.resolve().as_uri())});\n  await page.locator('svg').screenshot({{ path: {json.dumps(str(out_png))} }});\n  await browser.close();\n}})();\n", encoding='utf-8')
    subprocess.run(['node', str(script)], check=True, cwd=str(repo_root))
    html_path.unlink(missing_ok=True)
    script.unlink(missing_ok=True)

def open_landscape_section(document):
    from docx.enum.section import WD_SECTION
    from docx.enum.section import WD_ORIENT
    land = document.add_section(WD_SECTION.NEW_PAGE)
    land.orientation = WD_ORIENT.LANDSCAPE
    land.page_width, land.page_height = (Inches(11.69), Inches(8.27))
    land.top_margin = Inches(14 / 25.4)
    land.bottom_margin = Inches(12 / 25.4)
    land.left_margin = land.right_margin = Inches(0.55)
    return land

def close_landscape_section(document, body_geometry: dict):
    from docx.enum.section import WD_SECTION
    from docx.enum.section import WD_ORIENT
    port = document.add_section(WD_SECTION.NEW_PAGE)
    port.page_width, port.page_height = (body_geometry['page_width'], body_geometry['page_height'])
    port.orientation = WD_ORIENT.LANDSCAPE if port.page_width > port.page_height else WD_ORIENT.PORTRAIT
    port.top_margin = body_geometry['top_margin']
    port.bottom_margin = body_geometry['bottom_margin']
    port.left_margin = port.right_margin = body_geometry['left_margin']
    return port

def add_figure(document, svg: str, caption: str, font: str, workdir: Path, counters: dict, pic_width=None):
    png_path = workdir / f"figure-{counters.get('figure', 0)}.png"
    rasterize_svg(svg, png_path)
    p = document.add_paragraph()
    set_para_bidi(p)
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), '4')
        el.set(qn('w:space'), '8')
        el.set(qn('w:color'), _THEME_ROLES['rule-strong'].lstrip('#').upper())
        pBdr.append(el)
    pPr.append(pBdr)
    p.paragraph_format.keep_with_next = True
    run = p.add_run()
    run.add_picture(str(png_path), width=pic_width or Inches(6.0))
    cap = document.add_paragraph()
    set_para_bidi(cap)
    add_script_runs(cap, caption, font, bold=True)
    counters['figure'] = counters.get('figure', 0) + 1
REPO_ROOT = Path(__file__).resolve().parents[2]

def add_gap_block(document, block, font, counters):
    tag_p = document.add_paragraph()
    set_para_bidi(tag_p)
    pPr = tag_p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    top = OxmlElement('w:top')
    top.set(qn('w:val'), 'single')
    top.set(qn('w:sz'), '16')
    top.set(qn('w:space'), '4')
    top.set(qn('w:color'), _THEME_ROLES['signal'].lstrip('#').upper())
    pBdr.append(top)
    pPr.append(pBdr)
    tag_p.paragraph_format.keep_with_next = True
    add_script_runs(tag_p, f" {L['openQuestion']} ", font, bold=True)
    for tag in tag_p.runs:
        tag.font.color.rgb = theme_mod.rgb('FFFFFF')
        tag.font.size = Pt(theme_mod.SIZES['meta'])
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), _THEME_ROLES['signal'].lstrip('#').upper())
        tag._element.get_or_add_rPr().append(shd)
    q = document.add_paragraph()
    q.paragraph_format.keep_with_next = True
    add_script_runs(q, block.get('question', ''), font)
    owner = document.add_paragraph()
    add_script_runs(owner, f"{L['owner']}: {block.get('owner', '')}", font)
    for r in owner.runs:
        r.font.color.rgb = theme_mod.rgb(_THEME_ROLES['muted'])
        r.font.size = Pt(theme_mod.SIZES['meta'])
    counters['gap_block'] = counters.get('gap_block', 0) + 1

def add_shots_block(document, block, font, counters):
    import base64, tempfile
    for k, rel in enumerate(block.get('images') or []):
        m = re.match('data:image/(png|jpeg);base64,(.+)$', str(rel))
        if m:
            img = Path(tempfile.gettempdir()) / f"bw-shot-{os.getpid()}-{counters.get('shots_block', 0)}-{k}.{('png' if m.group(1) == 'png' else 'jpg')}"
            img.write_bytes(base64.b64decode(m.group(2)))
        else:
            img = REPO_ROOT / str(rel).replace('\\', '/')
        if not img.exists():
            print(f'WARN: shots image not found, skipped: {rel}', file=sys.stderr)
            continue
        p = document.add_paragraph()
        set_para_bidi(p)
        p.alignment = None
        pPr = p._p.get_or_add_pPr()
        pBdr = OxmlElement('w:pBdr')
        for edge in ('top', 'left', 'bottom', 'right'):
            el = OxmlElement(f'w:{edge}')
            el.set(qn('w:val'), 'single')
            el.set(qn('w:sz'), '4')
            el.set(qn('w:space'), '4')
            el.set(qn('w:color'), _THEME_ROLES['rule-strong'].lstrip('#').upper())
            pBdr.append(el)
        pPr.append(pBdr)
        p.paragraph_format.keep_with_next = True
        p.add_run().add_picture(str(img), width=Inches(150 / 25.4 * min(100, max(10, float(block.get('width') or 100))) / 100))
    cap = document.add_paragraph()
    set_para_bidi(cap)
    add_script_runs(cap, block.get('caption', ''), font, bold=True)
    if block.get('note'):
        note = document.add_paragraph()
        add_script_runs(note, block['note'], font)
        for r in note.runs:
            r.font.color.rgb = theme_mod.rgb(_THEME_ROLES['muted'])
            r.font.size = Pt(theme_mod.SIZES['meta'])
    counters['shots_block'] = counters.get('shots_block', 0) + 1

def add_stories(document, block, font, counters, chapter_number, story_seq):
    for item in block.get('items', []):
        story_seq[0] += 1
        cap = document.add_paragraph()
        cap.paragraph_format.keep_with_next = True
        add_script_runs(cap, f"{chapter_number}.{story_seq[0]} {L['userStory']}", font, bold=True)
        as_, want, so = (item.get('as', ''), item.get('want', ''), item.get('so', ''))
        rows = [[L['storyId'], item.get('id', '')], [L['storyName'], item.get('name', '')], [L['storyUser'], as_]]
        if item.get('goal'):
            rows.append([L['storyGoalLabel'], item['goal']])
        elif as_ and want and so:
            rows.append([L['storyGoalLabel'], L['storyGoal'].replace('{as}', as_).replace('{want}', want).replace('{so}', so)])
        acceptance_items = item.get('acceptance', [])
        story_tbl = add_table(document, [], rows, font)
        if acceptance_items:
            ac_row = story_tbl.add_row()
            label_cell, value_cell = (ac_row.cells[0], ac_row.cells[1])
            col_w = Emu((int(Inches(8.27)) - int(Inches(0.55)) * 2) // 2)
            for c in (label_cell, value_cell):
                c.width = col_w
            label_cell.paragraphs[0].text = ''
            add_script_runs(label_cell.paragraphs[0], L['acceptance'], font, bold=True)
            value_cell.paragraphs[0].text = ''
            add_numbered_list_cell(value_cell, acceptance_items, font, new_criteria_num_id(document))
        theme_mod.style_story_card(story_tbl, _THEME_ROLES)
        document.add_paragraph()
        counters['stories_table'] = counters.get('stories_table', 0) + 1
        actions = item.get('actions')
        if actions and actions.get('rows'):
            p = document.add_paragraph()
            add_script_runs(p, L['actionsTable'], font, bold=True)
            add_table(document, actions.get('columns', []), actions.get('rows', []), font, spec=actions)
            document.add_paragraph()
            counters['stories_actions_table'] = counters.get('stories_actions_table', 0) + 1
        dictionary = item.get('dictionary')
        if dictionary and dictionary.get('rows'):
            p = document.add_paragraph()
            add_script_runs(p, L['dictionary'], font, bold=True)
            dict_tbl = add_table(document, dictionary.get('columns', []), dictionary.get('rows', []), font, spec=dictionary)
            theme_mod.style_dictionary_table(dict_tbl, _THEME_ROLES)
            document.add_paragraph()
            counters['stories_dictionary_table'] = counters.get('stories_dictionary_table', 0) + 1
CONTROL_LABELS = [('documentId', L['control']['documentId']), ('title', L['control']['title']), ('preparedBy', L['control']['preparedBy']), ('documentType', L['control']['documentType']), ('classification', L['control']['classification']), ('owner', L['control']['owner']), ('issuedOn', L['control']['issuedOn']), ('version', L['control']['version']), ('status', L['control']['status']), ('reviewCycle', L['control']['reviewCycle'])]
REVISIONS_COLUMNS = [L['revVersion'], L['revDate']]
APPROVALS_COLUMNS = L['approvalCols']

def add_control_front_matter(document, data, font, counters, toc: bool=False):
    hide = set((data.get('layout') or {}).get('hide') or [])
    control = (data.get('control') or {}) if 'control' not in hide else {}
    revisions = (data.get('revisions') or []) if 'revisions' not in hide else []
    approvals = data.get('approvals') or []
    if not control and (not revisions) and (not approvals):
        return
    h1 = document.add_heading(level=1)
    set_para_bidi(h1)
    _F = theme_mod.faces(font)
    add_script_runs(h1, L['controlChapter'], _F['display'], bold=True)
    if control:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['controlData'], _F['display'], bold=True)
        rows = MD.control_rows(data, L) if data.get('controlTable') else [[label, str(control.get(key, ''))] for key, label in CONTROL_LABELS if control.get(key) is not None]
        control_tbl = add_table(document, [], rows, font)
        theme_mod.style_control_table(control_tbl, _THEME_ROLES)
        document.add_paragraph()
        counters['control_table'] = 1
    if revisions:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['revisions'], _F['display'], bold=True)
        add_table(document, REVISIONS_COLUMNS, [r[:len(REVISIONS_COLUMNS)] for r in revisions], font)
        document.add_paragraph()
        counters['revisions_table'] = 1
    if approvals:
        h2 = document.add_heading(level=2)
        set_para_bidi(h2)
        add_script_runs(h2, L['approvals'], _F['display'], bold=True)
        add_table(document, APPROVALS_COLUMNS, approvals, font)
        document.add_paragraph()
        counters['approvals_table'] = 1
    if 'toc' in hide:
        pass
    elif toc:
        add_toc_field(document, font)
        counters['toc_field'] = 1
    else:
        add_contents_table(document, data, font)
        counters['contents_table'] = 1
CONTENTS_TABLE_TAG = 'contents'

def contents_rows(data: dict) -> list[tuple[str, str, str]]:
    rows: list[tuple[str, str, str]] = []
    for ch in data.get('chapters', []):
        if ch.get('tocHidden'):
            continue
        rows.append((str(ch.get('number', '')), ch.get('title', ''), 'chapter'))
        secs = ch.get('sections', [])
        if len(secs) == 1:
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
    theme_mod.style_contents_table(table, [kind for _, _, kind in rows], _THEME_ROLES)
    document.add_paragraph()
    return table
TOC_INSTR = 'TOC \\o "1-2" \\n 1-2 \\u'
TOC_STYLE_IDS = (-266, -267, -268)
TOC_ENTRY_PT, TOC_ENTRY_AFTER_PT = (12, 6.2)

def add_toc_field(document, font: str) -> None:
    head = document.add_paragraph()
    set_para_bidi(head)
    head.paragraph_format.keep_with_next = True
    add_script_runs(head, L['contents'], font, bold=True)
    for r in head.runs:
        r.font.size = Pt(theme_mod.SIZES['h2'])
        r.font.color.rgb = theme_mod.rgb(_THEME_ROLES['ink'])
    p = document.add_paragraph()
    set_para_bidi(p)
    r = p.add_run()._r
    begin = OxmlElement('w:fldChar')
    begin.set(qn('w:fldCharType'), 'begin')
    begin.set(qn('w:dirty'), 'true')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = TOC_INSTR
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

# ── free-placed logos and images (document "overlays"), at the PDF's exact position ──
# Coordinates are millimetres: cover = from the cover page's top-left; every = page x, y below the
# body top margin (18 mm, as the print @page); anchor = page x (content starts at 16 mm) and y from
# the anchor block's own position. Images are re-encoded PNG/JPEG data URIs from the editor.
_OV_SEQ = [0]


def _ov_image(o, workdir):
    import base64
    m = re.match(r'data:image/(png|jpeg);base64,(.+)$', str(o.get('src', '')))
    if not m:
        return None
    _OV_SEQ[0] += 1
    f = Path(workdir) / f'overlay-{_OV_SEQ[0]}.{"png" if m.group(1) == "png" else "jpg"}'
    f.write_bytes(base64.b64decode(m.group(2)))
    return f


def anchored_picture(paragraph, img, x_mm, y_mm, w_mm, h_rel='page', v_rel='page'):
    from docx.shared import Mm
    run = paragraph.add_run()
    inline = run.add_picture(str(img), width=Mm(max(4.0, float(w_mm))))._inline
    emu = lambda mm: int(round(float(mm) * 36000))
    _OV_SEQ[0] += 1
    anchor = parse_xml(
        f'<wp:anchor {nsdecls("wp")} distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        f'relativeHeight="{251659264 + _OV_SEQ[0]}" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">'
        f'<wp:simplePos x="0" y="0"/>'
        f'<wp:positionH relativeFrom="{h_rel}"><wp:posOffset>{emu(x_mm)}</wp:posOffset></wp:positionH>'
        f'<wp:positionV relativeFrom="{v_rel}"><wp:posOffset>{emu(y_mm)}</wp:posOffset></wp:positionV>'
        f'</wp:anchor>')
    anchor.append(inline.find(qn('wp:extent')))
    anchor.append(parse_xml(f'<wp:effectExtent {nsdecls("wp")} l="0" t="0" r="0" b="0"/>'))
    anchor.append(parse_xml(f'<wp:wrapNone {nsdecls("wp")}/>'))
    anchor.append(inline.find(qn('wp:docPr')))
    cnv = inline.find(qn('wp:cNvGraphicFramePr'))
    if cnv is not None:
        anchor.append(cnv)
    anchor.append(inline.find(qn('a:graphic')))
    inline.getparent().replace(inline, anchor)


def _ov_host(paragraph_parent_add):
    p = paragraph_parent_add()
    pf = p.paragraph_format
    pf.space_before = pf.space_after = Pt(0)
    pf.line_spacing = Pt(1)
    return p


def place_overlays(document, data, workdir, cover_section, body_section):
    for o in data.get('overlays') or []:
        if o.get('kind') == 'text':
            continue
        img = _ov_image(o, workdir)
        if not img:
            continue
        x, y, w = float(o.get('x', 0)), float(o.get('y', 0)), float(o.get('w', 30))
        if o.get('mode') == 'cover':
            anchored_picture(_ov_host(cover_section.header.add_paragraph), img, x, y, w)
        elif o.get('mode') == 'every':
            anchored_picture(_ov_host(body_section.header.add_paragraph), img, x, y + 18, w)


def anchor_overlays(document, data, workdir, ptr, ids=None, font=DEFAULT_BODY_FONT):
    ids = ids or {}
    def at(o):
        return ids.get(str(o.get('anchor')), o.get('anchor'))
    hits = [o for o in (data.get('overlays') or []) if (o.get('mode') == 'anchor' or (o.get('wrap') and not o.get('mode'))) and at(o) == ptr]
    if not hits:
        return
    host = _ov_host(document.add_paragraph)
    for o in hits:
        if o.get('kind') == 'text':
            MD.text_box(host, o, font, _THEME_ROLES, LOCALE, add_script_runs)
            continue
        img = _ov_image(o, workdir)
        if img and o.get('wrap'):
            MD.wrapped_picture(host, img, o)
        elif img:
            anchored_picture(host, img, float(o.get('x', 0)) + 16, float(o.get('y', 0)), float(o.get('w', 30)), 'page', 'paragraph')


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
    theme_mod.apply_style_scale(document, roles, font)
    if toc:
        theme_mod.apply_cs_font_to_styles(document, font)
    counters = {'table_block': 0, 'figure': 0, 'stories_block': 0, 'prose_block': 0, 'subhead_block': 0}
    cover_logos = theme_logos(workdir, ('end', 'center', 'start') if LOCALE == 'ar' else ('start', 'center', 'end'))
    header_logo = (theme_logos(workdir, ('header',)) or [None])[0]
    theme_mod.build_cover(document, data.get('control') or {}, roles, font, cover_logos) if 'cover' not in hide else None
    from docx.enum.section import WD_SECTION
    body_section = document.add_section(WD_SECTION.NEW_PAGE)
    if document.paragraphs:
        from docx.enum.text import WD_LINE_SPACING
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
    body_section.header_distance = Inches(9 / 25.4)
    body_section.footer_distance = Inches(8 / 25.4)
    ctrl = data.get('control') or {}
    cover_section = document.sections[0]
    theme_mod.add_header_footer(document, roles, font, header_logo, ctrl.get('documentId', ''), ctrl.get('issuedOn', ''), cover_section=cover_section, body_section=body_section)
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
    add_control_front_matter(document, data, font, counters, toc=toc)
    body_geometry = {'page_width': body_section.page_width, 'page_height': body_section.page_height, 'top_margin': body_section.top_margin, 'bottom_margin': body_section.bottom_margin, 'left_margin': body_section.left_margin}
    first_page_secs = []
    def open_segment(seg):
        # a page segment (A18 size/orientation, A6 scoped header/footer items): a new Word section
        from docx.enum.section import WD_SECTION
        sec = document.add_section(WD_SECTION.NEW_PAGE)
        MD.apply_page(sec, seg['page'])
        sec.top_margin, sec.bottom_margin = body_geometry['top_margin'], body_geometry['bottom_margin']
        sec.left_margin = sec.right_margin = body_geometry['left_margin']
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
        elif (ch.get('layout') or {}).get('breakBefore') or (((ch.get('sections') or [{}])[0].get('layout') or {}).get('breakBefore')) or ((((ch.get('sections') or [{}])[0].get('blocks') or [{}]) or [{}])[0].get('layout') or {}).get('breakBefore'):
            MD.page_break(document)
            counters['page_breaks'] = counters.get('page_breaks', 0) + 1
        if wide is True:
            open_landscape_section(document)
        h1 = document.add_heading(level=1)
        set_para_bidi(h1)
        theme_mod.add_chapter_chip(h1, ch['number'], F['display'], roles)
        add_script_runs(h1, ch['title'], F['display'], bold=True)
        story_seq = [0]
        for si, sec in enumerate(ch['sections']):
            if sec.get('hidden'):
                continue
            # as the print renderer: a one-section chapter prints no section heading; otherwise «n.m title»
            sec_ptr = f'/chapters/{ci}/sections/{si}/blocks/0'
            if sec_ptr in seg_starts:
                open_segment(seg_starts.pop(sec_ptr))
            elif si and ((sec.get('layout') or {}).get('breakBefore') or (((sec.get('blocks') or [{}])[0].get('layout') or {}).get('breakBefore'))):
                MD.page_break(document)
                counters['page_breaks'] = counters.get('page_breaks', 0) + 1
            if len(ch['sections']) > 1:
                h2 = document.add_heading(level=2)
                set_para_bidi(h2)
                num = h2.add_run(f"{sec.get('number', '')}  ")
                num.bold = True
                num.font.color.rgb = theme_mod.rgb(roles['gold'])
                add_script_runs(h2, sec['title'], F['display'], bold=True)
            for bi, block in enumerate(sec.get('blocks', [])):
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
                        MD.add_leaf(p, para_text, font, add_script_runs)
                        info = MD.list_info(para_text)
                        if info:
                            MD.number_paragraph(document, p, info)
                    counters['prose_block'] += 1
                elif kind == 'subhead':
                    p = document.add_paragraph()
                    p.paragraph_format.keep_with_next = True
                    MD.add_leaf(p, block.get('text', ''), F['subhead'], add_script_runs, bold=False)
                    counters['subhead_block'] += 1
                elif kind == 'table':
                    add_table(document, block.get('columns', []), block.get('rows', []), font, spec=block)
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
                    add_script_runs(cap, f"{block.get('figureLabel', '')} {counters['figure']}200f: {block.get('caption', '')}".strip(), font, bold=True)
                    p = document.add_paragraph()
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    p._p.append(diagram_run(block['resolved'], font, block.get('caption', '')))
                elif kind == 'stories':
                    if block.get('lead'):
                        p = document.add_paragraph()
                        p.paragraph_format.keep_with_next = True
                        add_script_runs(p, block['lead'], font, bold=True)
                    add_stories(document, block, font, counters, ch['number'], story_seq)
                    counters['stories_block'] += 1
                elif kind == 'gap':
                    add_gap_block(document, block, font, counters)
                elif kind == 'shots':
                    add_shots_block(document, block, font, counters)
                else:
                    raise ValueError(f"block kind {kind!r} has no handler in build_docx.py (section {sec['title']!r}); add one and list it in HANDLED_KINDS")
        if wide:
            close_landscape_section(document, body_geometry)
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
    final_p = _last if _last is not None and (not _last.text.strip()) else document.add_paragraph()
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
