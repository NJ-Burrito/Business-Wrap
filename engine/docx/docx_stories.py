from __future__ import annotations
import model_docx as MD
import re
import theme as theme_mod
from docx.shared import Pt
import build_docx as _b
from build_docx import L, _I18N
from docx_cards import _font_el, card_gap, card_paragraph, label_bar
from docx_tables import add_numbered_list_cell, add_table, keep_header_with_next, keep_rows_together, new_criteria_num_id
from docx_text import add_script_runs, set_para_bidi

_TAKEN_STORY_NOS = set()

def is_ac_label(block) -> bool:
    """0.16.5 (acc): a subhead that carries the «معايير القبول» house label (this document's wording or either locale's default)."""
    if not isinstance(block, dict) or block.get('kind') != 'subhead' or not isinstance(block.get('text'), str):
        return False
    known = {L.get('acceptance'), _I18N['doc']['ar']['acceptance'], _I18N['doc']['en']['acceptance']}
    norm = lambda x: re.sub(r'\s+', ' ', re.sub(r'[\s:：]+$', '', x)).strip().lower()
    return norm(block['text']) in {norm(x) for x in known if isinstance(x, str) and x}

def add_stories(document, block, font, counters, chapter_number, story_seq, fold=None):
    for item_no, item in enumerate(block.get('items', [])):
        story_seq[0] += 1
        roles = _b._THEME_ROLES
        if block.get('lead') and item_no == 0:
            lead = label_bar(document, block['lead'], font, roles)  # «بطاقات القصص»: the print's cards label, once per block
            lead.paragraph_format.space_before = Pt(0)
        cap = document.add_paragraph()
        set_para_bidi(cap)
        cap.paragraph_format.keep_with_next = True
        cap.paragraph_format.space_before = Pt(6)
        cap.paragraph_format.space_after = Pt(0)
        # the print's story-head: the SECTION's number (gold) then «قصة مستخدم» in the primary colour, on the top band of the sand card
        sn = str(block.get('number') or f"{chapter_number}.{story_seq[0]}")
        if _b.TYPED and len(block.get('items', [])) > 1 and sn:  # 0.19.0 R3 (review #5): 3.6.1, 3.6.2 in a typed document (render.mjs storyNo)
            sn = f"{sn}.{item_no + 1}"
        elif item_no > 0:  # 0.16.3: a block of several cards numbers each card (6.1, 6.2, ...), as the print does
            _m = re.match(r'^(.*?)(\d+)$', sn)
            if _m:
                # 0.16.4: card k counts on from the block's number, skipping a number another block already carries (engine/render.mjs storyNo)
                _n, _left = int(_m.group(2)), item_no
                while _left > 0:
                    _n += 1
                    if f"{_m.group(1)}{_n}" not in _TAKEN_STORY_NOS:
                        _left -= 1
                sn = f"{_m.group(1)}{_n}"
        nrun = cap.add_run(f"{sn}    ")
        nrun.bold = True
        nrun.font.size = Pt(theme_mod.SIZES['h2'])
        nrun.font.color.rgb = theme_mod.rgb(roles['accent'])
        nrun._element.get_or_add_rPr().insert(0, _font_el(font))
        add_script_runs(cap, L['userStory'], font, bold=True)
        for run in cap.runs[1:]:
            run.font.size = Pt(theme_mod.SIZES['h2'])
            run.font.color.rgb = theme_mod.rgb(roles['primary'])
        card_paragraph(cap, roles, edges=('top', 'left', 'right'))
        as_, want, so = (item.get('as', ''), item.get('want', ''), item.get('so', ''))
        goal_text = item['goal'] if item.get('goal') else (L['storyGoal'].replace('{as}', as_).replace('{want}', want).replace('{so}', so) if as_ and want and so else '')
        acceptance_items = item.get('acceptance', [])
        card = item.get('card') if isinstance(item.get('card'), dict) and isinstance(item['card'].get('rows'), list) else None
        # 0.15.1: a story without `card` prints the ID card it always printed; with one, its rows (labels, {bind} cells, merges,
        # widths) are the table, the same model as every other table. A {bind: field} cell prints the story's own field.
        src = card['rows'] if card else [[{'label': 'storyId'}, {'bind': 'id'}], [{'label': 'storyName'}, {'bind': 'name'}], [{'label': 'storyUser'}, {'bind': 'as'}]] + ([[{'label': 'storyGoalLabel'}, {'bind': 'goal'}]] if goal_text else []) + ([[{'label': 'acceptance'}, {'bind': 'acceptance'}]] if acceptance_items else [])
        fields = {'id': item.get('id', ''), 'name': item.get('name', ''), 'as': as_, 'goal': goal_text, 'acceptance': ''}
        # 0.16.5 (acc): the field shape (a «معايير القبول» subhead + its prose after the card) prints as the card's last row, as render.mjs does
        fold_here = fold if (fold and item_no == len(block.get('items', [])) - 1 and not acceptance_items) else None
        def resolve(v):
            if isinstance(v, dict) and not MD.is_rich(v):
                if isinstance(v.get('label'), str):
                    return L.get(v['label'], '')
                if v.get('bind') in fields:
                    return fields[v['bind']]
            return v if v is not None else ''
        rows = [[resolve(v) for v in (r if isinstance(r, list) else [])] for r in src]
        if fold_here:
            rows.append([fold_here['label'].get('text', ''), ''])
        ac_at = [(ri, ci) for ri, r in enumerate(src) if isinstance(r, list) for ci, v in enumerate(r) if isinstance(v, dict) and v.get('bind') == 'acceptance']
        story_tbl = add_table(document, [], rows, font, spec=card)
        for ri, ci in ac_at:
            if acceptance_items:
                try:
                    cell = story_tbl.cell(ri, ci)
                except IndexError:
                    continue
                for pp in cell.paragraphs[1:]:
                    pp._p.getparent().remove(pp._p)
                cell.paragraphs[0].text = ''
                add_numbered_list_cell(cell, acceptance_items, font, new_criteria_num_id(document))
        if fold_here:
            cell = story_tbl.cell(len(rows) - 1, 1)
            for pp in cell.paragraphs[1:]:
                pp._p.getparent().remove(pp._p)
            first = True
            for para_text in fold_here['body'].get('paragraphs', []):
                p = cell.paragraphs[0] if first else cell.add_paragraph()
                first = False
                p.paragraph_format.space_after = Pt(theme_mod.PROSE_AFTER_PT)
                MD.add_leaf(p, para_text, font, add_script_runs)
                info = MD.list_info(para_text)
                if info:
                    MD.number_paragraph(document, p, info)
            counters['acceptance_folded'] = counters.get('acceptance_folded', 0) + 1
        theme_mod.style_story_card(story_tbl, _b._THEME_ROLES)
        # 0.16.2: the reference sets the «المعرف» row apart from the rest of the card: a card-coloured strip (3 pt) between it and the next row
        if len(src) > 1 and any(isinstance(v, dict) and v.get('bind') == 'id' for v in (src[0] if isinstance(src[0], list) else [])):
            for cell in story_tbl.rows[0].cells:
                theme_mod.set_cell_border(cell, 'bottom', roles['card'], 24)
            for cell in story_tbl.rows[1].cells:
                theme_mod.set_cell_border(cell, 'top', roles['card'], 24)
        keep_rows_together(story_tbl, cap)
        has_more = bool((item.get('actions') or {}).get('rows')) or bool((item.get('dictionary') or {}).get('rows'))
        card_gap(document, roles, closing=not has_more)
        counters['stories_table'] = counters.get('stories_table', 0) + 1
        actions = item.get('actions')
        if actions and actions.get('rows'):
            label_bar(document, L['actionsTable'], font, roles)
            act_tbl = add_table(document, actions.get('columns', []), actions.get('rows', []), font, spec=actions)
            theme_mod.style_dictionary_table(act_tbl, _b._THEME_ROLES)  # 0.16.2: the same pale blue header, navy words and full grid as the dictionary
            keep_header_with_next(act_tbl)
            card_gap(document, roles, closing=not (item.get('dictionary') or {}).get('rows'))
            counters['stories_actions_table'] = counters.get('stories_actions_table', 0) + 1
        dictionary = item.get('dictionary')
        if dictionary and dictionary.get('rows'):
            label_bar(document, L['dictionary'], font, roles)
            dict_tbl = add_table(document, dictionary.get('columns', []), dictionary.get('rows', []), font, spec=dictionary)
            theme_mod.style_dictionary_table(dict_tbl, _b._THEME_ROLES)
            keep_header_with_next(dict_tbl)
            card_gap(document, roles, closing=True)
            counters['stories_dictionary_table'] = counters.get('stories_dictionary_table', 0) + 1
