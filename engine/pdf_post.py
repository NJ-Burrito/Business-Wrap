"""Post-print fixes on the Chrome PDF, copied and adapted from the source
pipeline (render.ts clearCoverHeader + tools/srs/stamp-folios.py):

1. the cover loses Chrome's running head (Chrome paints header/footer on every sheet);
2. the sheets after the cover get a folio, «1» on the first one, measured off the
   footer run Chrome already drew on that sheet (baseline, size, colour, margin).

    python engine/pdf_post.py <pdf> <folio-face.ttf> <anchor text> <rtl|ltr>
"""
import sys
import pymupdf

sys.stdout.reconfigure(encoding="utf-8")


def footer_runs(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                t = span["text"].strip()
                if t:
                    out.append((t, span["origin"], span["size"], span["color"]))
    return out


def main(pdf_path, fontfile, anchor_text, direction):
    doc = pymupdf.open(pdf_path)
    cover = doc[0]
    band = pymupdf.Rect(0, 0, cover.rect.width, 12 * 72 / 25.4)
    cover.add_redact_annot(band)
    cover.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)

    font = pymupdf.Font(fontfile=fontfile) if fontfile else pymupdf.Font('helv')
    if not fontfile:
        print('post: WARN no TrueType face found; folios set in a built-in face (install the fonts)')
    done, missed = 0, []
    for i in range(1, doc.page_count):
        page = doc[i]
        runs = footer_runs(page)
        bottom = page.rect.height - 16 * 72 / 25.4
        # a fallback face can split the anchor into several runs: any footer run that is part of it will do
        anchor = next((r for r in runs if anchor_text and r[1][1] > bottom and (anchor_text in r[0] or r[0] in anchor_text)), None)
        if not anchor:
            missed.append(i + 1)
            continue
        _, (_, baseline), size, colour = anchor
        same = [r for r in runs if abs(r[1][1] - baseline) < 1.0]
        side = min(r[1][0] for r in same)
        rgb = ((colour >> 16) & 255, (colour >> 8) & 255, colour & 255)
        label = str(i)
        width = font.text_length(label, fontsize=size)
        # the footer row is LTR whatever the page is: the folio slot is the right end
        x = page.rect.width - side - width
        face = {"fontname": "bwfolio", "fontfile": fontfile} if fontfile else {"fontname": "helv"}
        page.insert_text(pymupdf.Point(x, baseline), label, fontsize=size, color=tuple(c / 255 for c in rgb), **face)
        done += 1
    if missed:
        raise SystemExit("no footer run found on sheet(s) %s" % ", ".join(map(str, missed)))
    doc.subset_fonts()
    doc.ez_save(pdf_path + ".tmp")
    doc.close()
    import os; os.replace(pdf_path + ".tmp", pdf_path)
    print("post: cover chrome cleared; %d sheet(s) numbered" % done)


if __name__ == "__main__":
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    main(*sys.argv[1:])
