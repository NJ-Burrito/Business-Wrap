"""Post-print fixes on the Chrome PDF, copied and adapted from the source
pipeline (render.ts clearCoverHeader + tools/srs/stamp-folios.py):

1. the cover loses Chrome's running head (Chrome paints header/footer on every sheet);
2. the sheets after the cover get a folio, «1» on the first one, measured off the
   footer run Chrome already drew on that sheet (baseline, size, colour, margin);
3. (0.13.0) the page-segment markers (link annotations to bw.invalid) are removed.

    python engine/pdf_post.py <pdf> <folio-face.ttf> <anchor text> <rtl|ltr> [right:n|left:n/N|center:n|none]
    python engine/pdf_post.py links <pdf>                 → {"<segment>": <0-based page>, "_pages": n}
    python engine/pdf_post.py splice <pdf> <part.pdf> <1-based pages, comma separated>
"""
import json
import os
import sys
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")
MARK = "https://bw.invalid/seg/"


def footer_runs(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                t = span["text"].strip()
                if t:
                    out.append((t, span["origin"], span["size"], span["color"]))
    return out


def links(pdf_path):
    doc = pymupdf.open(pdf_path)
    out = {"_pages": doc.page_count}
    for i, page in enumerate(doc):
        for ln in page.get_links():
            uri = ln.get("uri") or ""
            if uri.startswith(MARK):
                out.setdefault(uri[len(MARK):], i)
    print(json.dumps(out))


def splice(pdf_path, part_path, pages):
    """Pages printed again with another running header/footer (A6): same layout, so they replace one for one."""
    doc = pymupdf.open(pdf_path)
    part = pymupdf.open(part_path)
    nums = [int(x) for x in pages.split(",") if x]
    if part.page_count != len(nums):
        raise SystemExit("splice: %d page(s) printed for %d requested" % (part.page_count, len(nums)))
    for k, n in enumerate(nums):
        doc.insert_pdf(part, from_page=k, to_page=k, start_at=n - 1)
        doc.delete_page(n)
    doc.ez_save(pdf_path + ".tmp")
    doc.close()
    os.replace(pdf_path + ".tmp", pdf_path)
    print("splice: %d page(s)" % len(nums))


BADGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "brand", "v3", "file-icons", "pdf-128.png")


def brand_stamp(doc):
    """0.14.0: Creator/Producer «Business-Wrap» and the PDF badge as page 1's /Thumb (Acrobat-style viewers show it)."""
    meta = dict(doc.metadata or {})
    meta.update(creator="Business-Wrap", producer="Business-Wrap")
    doc.set_metadata(meta)
    if not os.path.exists(BADGE):
        return
    pix = pymupdf.Pixmap(BADGE)
    rgb = bytearray()
    s, n = pix.samples, pix.n
    for i in range(0, len(s), n):  # flatten the badge's transparency onto white: /Thumb has no alpha
        a = s[i + 3] / 255 if n == 4 else 1
        rgb += bytes(int(s[i + k] * a + 255 * (1 - a)) for k in range(3))
    import zlib
    xref = doc.get_new_xref()
    doc.update_object(xref, "<</Type/XObject/Subtype/Image/Width %d/Height %d/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode>>" % (pix.width, pix.height))
    doc.update_stream(xref, zlib.compress(bytes(rgb)), compress=False, new=True)
    doc.xref_set_key(doc[0].xref, "Thumb", "%d 0 R" % xref)


def main(pdf_path, fontfile, anchor_text, direction, folio="right:n"):
    doc = pymupdf.open(pdf_path)
    cover = doc[0]
    band = pymupdf.Rect(0, 0, cover.rect.width, 12 * 72 / 25.4)
    cover.add_redact_annot(band)
    cover.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
    for page in doc:
        for ln in page.get_links():
            if (ln.get("uri") or "").startswith(MARK):
                page.delete_link(ln)
    side, _, fmt = folio.partition(":")
    font = pymupdf.Font(fontfile=fontfile) if fontfile else pymupdf.Font('helv')
    if not fontfile and side != "none":
        print('post: WARN no TrueType face found; folios set in a built-in face (install the fonts)')
    done, missed = 0, []
    for i in range(1, doc.page_count if side != "none" else 1):
        page = doc[i]
        runs = footer_runs(page)
        bottom = page.rect.height - 16 * 72 / 25.4
        # a fallback face can split the anchor into several runs: any footer run that is part of it will do
        anchor = next((r for r in runs if anchor_text and r[1][1] > bottom and (anchor_text in r[0] or r[0] in anchor_text)), None)
        if not anchor and folio != "right:n":
            # 0.13.0: the confidentiality item may be gone; any footer run, else the footer band's own line
            anchor = next((r for r in runs if r[1][1] > bottom), None) or ("", (16 * 72 / 25.4, page.rect.height - 8 * 72 / 25.4), 8.0, 0x544C3B)
        if not anchor:
            missed.append(i + 1)
            continue
        _, (_, baseline), size, colour = anchor
        same = [r for r in runs if abs(r[1][1] - baseline) < 1.0] or [anchor]
        margin = min(r[1][0] for r in same) if same[0][0] else 16 * 72 / 25.4
        rgb = ((colour >> 16) & 255, (colour >> 8) & 255, colour & 255)
        label = "%d / %d" % (i, doc.page_count - 1) if fmt == "n/N" else str(i)
        width = font.text_length(label, fontsize=size)
        # the footer row is LTR whatever the page is: right / left / centre slot
        x = page.rect.width - margin - width if side == "right" else margin if side == "left" else (page.rect.width - width) / 2
        face = {"fontname": "bwfolio", "fontfile": fontfile} if fontfile else {"fontname": "helv"}
        page.insert_text(pymupdf.Point(x, baseline), label, fontsize=size, color=tuple(c / 255 for c in rgb), **face)
        done += 1
    if missed:
        raise SystemExit("no footer run found on sheet(s) %s" % ", ".join(map(str, missed)))
    brand_stamp(doc)
    doc.subset_fonts()
    doc.ez_save(pdf_path + ".tmp")
    doc.close()
    os.replace(pdf_path + ".tmp", pdf_path)
    print("post: cover chrome cleared; %d sheet(s) numbered" % done)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "links":
        links(sys.argv[2])
    elif len(sys.argv) == 5 and sys.argv[1] == "splice":
        splice(*sys.argv[2:])
    elif len(sys.argv) in (5, 6):
        main(*sys.argv[1:])
    else:
        raise SystemExit(__doc__)
