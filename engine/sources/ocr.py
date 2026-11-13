"""Sources tab, local OCR for pictures and screen-recording frames (RapidOCR, ONNX, no network after the first model download).

  python ocr.py read <image>...      prints {"<image>": [{text, loc, low?, alt?}]} on stdout, one entry per file
  python ocr.py --selftest           the pure rules below, no models

Two passes on every detected box. The Arabic model (PP-OCRv5, MOBILE) reads Arabic and English well but drops digits that sit inside
an Arabic line (measured: «رقم الطلب 2026-0451 بتاريخ 13/11/2026» came back as «رقم الطلب-41 بتاريخ/1/» at score 0.90). So the same box is
read again with the English model, and when that pass holds more digits the line is flagged low and its text kept as `alt`.
"""
import json
import re
import sys

LOW_SCORE = 0.8   # Arabic-pass score under this: the line is doubtful
EN_TRUST = 0.6    # the English pass is only believed about digits when it is this sure of its own read
ROW_OVERLAP = 0.5  # two boxes share a row when their vertical overlap is at least this share of the shorter box
AR = re.compile(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]')
DIGITS = re.compile(r'\d')


def digits(s):
    return len(DIGITS.findall(s or ''))


def is_low(score, ar_text, en_text, en_score):
    """(low, digits_lost) for one line. Low when the Arabic score is under LOW_SCORE or the English pass found more digits."""
    lost = en_score >= EN_TRUST and digits(en_text) > digits(ar_text)
    return (score < LOW_SCORE or lost), lost


def reading_order(items):
    """Items {box:[x0,y0,x1,y1], ...} → visual reading order: rows top to bottom; inside a row right to left when the row is
    mostly Arabic, left to right otherwise."""
    rows = []
    for it in sorted(items, key=lambda i: (i['box'][1] + i['box'][3])):
        x0, y0, x1, y1 = it['box']
        for row in rows:
            ry0, ry1 = row['y']
            over = min(y1, ry1) - max(y0, ry0)
            if over >= ROW_OVERLAP * min(y1 - y0, ry1 - ry0):
                row['items'].append(it); row['y'] = (min(ry0, y0), max(ry1, y1)); break
        else:
            rows.append({'y': (y0, y1), 'items': [it]})
    out = []
    for row in sorted(rows, key=lambda r: r['y'][0]):
        ar = sum(1 for i in row['items'] if AR.search(i['text']))
        rtl = ar * 2 > len(row['items'])
        out += sorted(row['items'], key=lambda i: -i['box'][2] if rtl else i['box'][0])
    return out


def rows_from(items):
    """Raw OCR items {box, text, score, en_text, en_score} → lines.json rows, in reading order, empty reads dropped."""
    out = []
    for it in reading_order([i for i in items if (i['text'] or '').strip()]):
        low, lost = is_low(it['score'], it['text'], it.get('en_text', ''), it.get('en_score', 0.0))
        row = {'text': it['text'].strip(), 'loc': f'line {len(out) + 1}'}
        if low: row['low'] = True
        if lost: row['alt'] = it['en_text'].strip()
        out.append(row)
    return out


def selftest():
    # digit loss: the sample line measured on a Thmanyah screenshot
    low, lost = is_low(0.90, 'رقم الطلب-41 بتاريخ/1/', '13/11/2026 0451-2026', 0.92)
    assert low and lost
    assert is_low(0.96, 'حفظ كمسودة', 'guaS', 0.39) == (False, False)              # a garbled English pass is not believed
    assert is_low(0.62, 'i(mΩ', 'Jhus!', 0.63) == (True, False)                       # a short garbled button is low by score alone
    assert is_low(0.99, 'Payment gateway status: Approved', 'Payment gateway status: Approved', 1.0) == (False, False)
    assert is_low(0.80, 'رقم 12', 'No 12', 0.9) == (False, False)                       # the boundary: 0.80 is not low
    assert is_low(0.79, 'رقم 12', 'No 12', 0.9)[0]
    assert is_low(0.97, 'رقم 1', 'No 12', 0.5) == (False, False)                       # an unsure English pass cannot raise a flag
    # reading order: title on top; a two-button Arabic row reads right to left; an English row left to right; a lone line last
    box = lambda x0, y0, x1, y1: [x0, y0, x1, y1]
    items = [
        {'box': box(10, 200, 90, 230), 'text': 'حفظ كمسودة', 'score': 0.96},
        {'box': box(400, 202, 480, 232), 'text': 'إلغاء', 'score': 1.0},
        {'box': box(100, 20, 500, 60), 'text': 'طلب إصدار تصريح فعالية', 'score': 0.96},
        {'box': box(20, 300, 200, 330), 'text': 'Status', 'score': 0.99},
        {'box': box(300, 301, 480, 331), 'text': 'Approved', 'score': 0.99},
        {'box': box(60, 120, 480, 160), 'text': 'رقم الطلب-41', 'score': 0.9, 'en_text': '0451-2026', 'en_score': 0.92},
    ]
    order = [i['text'] for i in reading_order(items)]
    assert order == ['طلب إصدار تصريح فعالية', 'رقم الطلب-41', 'إلغاء', 'حفظ كمسودة', 'Status', 'Approved'], order
    rows = rows_from(items + [{'box': box(0, 400, 10, 410), 'text': '  ', 'score': 0.5}])
    assert len(rows) == 6 and rows[1] == {'text': 'رقم الطلب-41', 'loc': 'line 2', 'low': True, 'alt': '0451-2026'}, rows[1]
    assert 'low' not in rows[0] and rows[0]['loc'] == 'line 1'
    print('ocr selftest: PASS')


def read(files):
    import numpy as np
    from PIL import Image
    from rapidocr import LangRec, ModelType, OCRVersion, RapidOCR
    import logging
    logging.disable(logging.CRITICAL)  # rapidocr logs to stdout; keep it clean for the JSON
    base = {'Rec.ocr_version': OCRVersion.PPOCRV5, 'Rec.model_type': ModelType.MOBILE}
    ar = RapidOCR(params={'Rec.lang_type': LangRec.ARABIC, **base})
    en = RapidOCR(params={'Rec.lang_type': LangRec.EN, **base})
    out = {}
    for f in files:
        img = np.array(Image.open(f).convert('RGB'))[:, :, ::-1].copy()  # BGR, as RapidOCR expects
        r = ar(img)
        items = []
        for box, txt, sc in zip(r.boxes if r.boxes is not None else [], r.txts or [], r.scores or []):
            x0, y0 = np.floor(box.min(0)).astype(int); x1, y1 = np.ceil(box.max(0)).astype(int)
            crop = img[max(0, y0 - 2):y1 + 2, max(0, x0 - 2):x1 + 2]
            e = en(crop, use_det=False, use_cls=False, use_rec=True)
            items.append({'box': [int(x0), int(y0), int(x1), int(y1)], 'text': txt, 'score': float(sc),
                          'en_text': (e.txts[0] if e.txts else ''), 'en_score': float(e.scores[0]) if e.scores else 0.0})
        out[f] = rows_from(items)
    return out


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[:1] == ['--selftest']: selftest()
    elif a[:1] == ['read'] and len(a) > 1: print(json.dumps(read(a[1:]), ensure_ascii=False))
    else: sys.exit(__doc__)
