"""Compare two PDFs page by page: page count, page sizes, body text, pixels.
    python tests/pdf_compare.py <a.pdf> <b.pdf> [skip_first_n_pages_for_pixels]
Body = the page minus 18mm at the top and 16mm at the bottom (running head / footer)."""
import json
import re
import sys

import pymupdf

MM = 72 / 25.4


def body(page):
    r = page.rect
    return pymupdf.Rect(0, 18 * MM, r.width, r.height - 16 * MM)


def text(page):
    return re.sub(r"\s+", " ", page.get_text("text", clip=body(page))).strip()


def grey(page, dpi=40):
    pix = page.get_pixmap(dpi=dpi, clip=body(page), colorspace=pymupdf.csGRAY)
    return pix.samples, pix.width, pix.height


def main(a, b, skip=1):
    A, B = pymupdf.open(a), pymupdf.open(b)
    rows = []
    for i in range(max(A.page_count, B.page_count)):
        if i >= A.page_count or i >= B.page_count:
            rows.append({"page": i + 1, "missing": "a" if i >= A.page_count else "b"})
            continue
        pa, pb = A[i], B[i]
        row = {"page": i + 1, "size_equal": tuple(round(x) for x in pa.rect[2:]) == tuple(round(x) for x in pb.rect[2:]),
               "text_equal": text(pa) == text(pb)}
        if i >= skip:
            sa, wa, ha = grey(pa)
            sb, wb, hb = grey(pb)
            if (wa, ha) == (wb, hb):
                row["pixel_mad"] = round(sum(abs(x - y) for x, y in zip(sa, sb)) / len(sa), 3)
                row["pixels_diff_pct"] = round(100 * sum(1 for x, y in zip(sa, sb) if abs(x - y) > 24) / len(sa), 3)
        rows.append(row)
    summary = {
        "pages_a": A.page_count, "pages_b": B.page_count,
        "text_equal_pages": sum(1 for r in rows if r.get("text_equal")),
        "max_pixel_mad": max((r.get("pixel_mad", 0) for r in rows), default=0),
        "max_pixels_diff_pct": max((r.get("pixels_diff_pct", 0) for r in rows), default=0),
    }
    print(json.dumps({"summary": summary, "pages": rows}, ensure_ascii=False, indent=1))
    ok = A.page_count == B.page_count and summary["text_equal_pages"] == A.page_count
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 1)
