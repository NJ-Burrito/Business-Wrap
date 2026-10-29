"""DOCX -> the import item list (A2, 0.13.0), as JSON on stdout.

    uv run --no-project --with python-docx python engine/import/docx_items.py <file.docx>

Items, in document order: {"title": text} for the Title style, {"h": level, "text": ...} for Heading styles, {"p": text},
{"table": [[cell, ...], ...]}. "meta": {"title": core properties title}.
"""
import json
import re
import sys

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


def level(p):
    name = (p.style.name or "") if p.style is not None else ""
    if name == "Title":
        return -1
    m = re.match(r"(?:Heading|العنوان)\s*(\d)", name)
    return int(m.group(1)) if m else 0


def main(path):
    doc = Document(path)
    items = []
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            p = Paragraph(child, doc)
            text = p.text.strip()
            if not text:
                continue
            lv = level(p)
            items.append({"title": text} if lv < 0 else {"h": lv, "text": text} if lv else {"p": text})
        elif tag == "tbl":
            rows = [[c.text.strip() for c in r.cells] for r in Table(child, doc).rows]
            if rows:
                items.append({"table": rows})
    meta = {"title": (doc.core_properties.title or "").strip()}
    sys.stdout.write(json.dumps({"items": items, "meta": meta}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
