"""DOCX vs PDF fidelity (Windows + Word only; not part of `npm test`).

Word opens the DOCX read-only and exports a PDF of it (ExportAsFixedFormat:
the document itself is never saved), then tests/pdf_compare.py compares that
PDF with the editor/export PDF page by page.

    uv run --no-project --with pywin32 --with pymupdf python tests/docx_fidelity.py <doc.docx> <reference.pdf> <out.pdf>
"""
import json
import subprocess
import sys
from pathlib import Path

import pythoncom
import win32com.client

WD_EXPORT_PDF = 17


def docx_to_pdf(docx: Path, pdf: Path) -> None:
    pythoncom.CoInitialize()
    app = win32com.client.DispatchEx("Word.Application")
    app.Visible = False
    app.DisplayAlerts = 0
    try:
        doc = app.Documents.Open(str(docx.resolve()), ReadOnly=True, AddToRecentFiles=False, ConfirmConversions=False)
        try:
            doc.ExportAsFixedFormat(str(pdf.resolve()), WD_EXPORT_PDF)
        finally:
            doc.Close(SaveChanges=0)
    finally:
        app.Quit()
        pythoncom.CoUninitialize()


def word_overlap(a: Path, b: Path) -> float:
    """Body words (letters only; numbers, running head and footer dropped) both PDFs share, as a share of the larger."""
    import collections, re
    import pymupdf
    def words(f):
        out = collections.Counter()
        for p in pymupdf.open(str(f)):
            clip = pymupdf.Rect(0, 18 * 72 / 25.4, p.rect.width, p.rect.height - 16 * 72 / 25.4)
            out.update(w for w in re.findall(r"[^\W\d_]+", p.get_text("text", clip=clip)) if len(w) > 1)
        return out
    wa, wb = words(a), words(b)
    return round(sum((wa & wb).values()) / max(sum(wa.values()), sum(wb.values()), 1), 3)


if __name__ == "__main__":
    docx, ref, out = map(Path, sys.argv[1:4])
    docx_to_pdf(docx, out)
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("pdf_compare.py")), str(out), str(ref), "1"], capture_output=True, text=True, encoding="utf-8")
    data = json.loads(r.stdout)
    data["summary"]["content_word_overlap"] = word_overlap(out, ref)
    print(json.dumps(data["summary"], ensure_ascii=False))
    for row in data["pages"]:
        print(json.dumps(row, ensure_ascii=False))
