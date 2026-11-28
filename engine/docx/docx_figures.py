from __future__ import annotations
import cover_design as CD
import json
import model_docx as MD
import os
import re
import subprocess
import sys
import tempfile
import theme as theme_mod
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt
from pathlib import Path
import build_docx as _b
from build_docx import L, LOCALE
from docx_tables import keep_header_with_next
from docx_text import add_script_runs, set_para_bidi

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
    port.left_margin, port.right_margin = body_geometry['left_margin'], body_geometry.get('right_margin', body_geometry['left_margin'])
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
        el.set(qn('w:color'), _b._THEME_ROLES['rule-strong'].lstrip('#').upper())
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
    top.set(qn('w:color'), _b._THEME_ROLES['signal'].lstrip('#').upper())
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
        shd.set(qn('w:fill'), _b._THEME_ROLES['signal'].lstrip('#').upper())
        tag._element.get_or_add_rPr().append(shd)
    q = document.add_paragraph()
    q.paragraph_format.keep_with_next = True
    add_script_runs(q, block.get('question', ''), font)
    owner = document.add_paragraph()
    add_script_runs(owner, f"{L['owner']}: {block.get('owner', '')}", font)
    for r in owner.runs:
        r.font.color.rgb = theme_mod.rgb(_b._THEME_ROLES['muted'])
        r.font.size = Pt(theme_mod.SIZES['meta'])
    counters['gap_block'] = counters.get('gap_block', 0) + 1

SHOT_RATIOS = {'16:10': (16, 10), '4:3': (4, 3), '9:16': (9, 16)}  # render.mjs SHOT_RATIOS
SHOT_LABEL = {'en': 'Screenshot', 'ar': 'لقطة الشاشة'}


def add_shot_frame(document, block, font, counters):
    """0.19.0 C12: a `shots` block with no image yet: a card frame at the block's ratio (at most 120 x 90 mm), a 1.4 pt signal outline and a numbered
    signal badge (one fixed-height cell, the badge a shaded run), then the caption; an empty caption reads «Screenshot n» (render.mjs shotBox)."""
    counters['shot_frame'] = counters.get('shot_frame', 0) + 1
    badge = block.get('badge')
    n = badge if isinstance(badge, int) and not isinstance(badge, bool) and 1 <= badge <= 99 else counters['shot_frame']
    rw, rh = SHOT_RATIOS.get(block.get('ratio'), SHOT_RATIOS['16:10'])
    w = min(120.0, 90.0 * rw / rh)
    h = w * rh / rw
    rtl = LOCALE == 'ar'
    t = CD._fresh_table(document, 1, [w], rtl, theme_mod)
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    CD._borders(t, (_b._THEME_ROLES['signal'], 11), (_b._THEME_ROLES['signal'], 11))
    CD._row_height(t.rows[0], h)
    cell = t.cell(0, 0)
    theme_mod.set_cell_shading(cell, _b._THEME_ROLES.get('card', _b._THEME_ROLES['paper']))
    CD._cell_margins(cell, 3, 3, 0)
    p = cell.paragraphs[0]
    set_para_bidi(p)
    p.paragraph_format.space_before = p.paragraph_format.space_after = Pt(0)
    run = p.add_run(f' {n} ')
    run.font.bold = True
    run.font.size = Pt(theme_mod.SIZES['table'])
    run.font.color.rgb = theme_mod.rgb(_b._THEME_ROLES['paper'])
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), _b._THEME_ROLES['signal'].lstrip('#').upper())
    run._element.get_or_add_rPr().append(shd)
    keep_header_with_next(t)
    cap = document.add_paragraph()
    set_para_bidi(cap)
    text = MD.text_of(block.get('caption', '')) if block.get('caption') else ''
    add_script_runs(cap, text.strip() or f"{SHOT_LABEL['ar' if rtl else 'en']} {n}", font, bold=True)


def add_shots_block(document, block, font, counters):
    import base64, tempfile
    if isinstance(block.get('images'), list) and not block['images'] and (_b.TYPED or 'ratio' in block or 'badge' in block):
        add_shot_frame(document, block, font, counters)
        counters['shots_block'] = counters.get('shots_block', 0) + 1
        return
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
            el.set(qn('w:color'), _b._THEME_ROLES['rule-strong'].lstrip('#').upper())
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
            r.font.color.rgb = theme_mod.rgb(_b._THEME_ROLES['muted'])
            r.font.size = Pt(theme_mod.SIZES['meta'])
    counters['shots_block'] = counters.get('shots_block', 0) + 1
