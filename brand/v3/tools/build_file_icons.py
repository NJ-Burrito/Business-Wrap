"""Business-Wrap brand v3 file-type badges: PDF, DOCX, HTML (and the document folder icon).

Idea (owner, 2026-10-30): a file-page icon with a solid label tab across its left edge carrying the type in bold
capitals. Ours is built from the brand v3 "Cover" mark: a navy page with a gold folded corner, the paper text line
and the gold rule; the tab is a solid colour (PDF red, DOCX blue, HTML black) with white Thmanyah Sans Bold outlines.
The tab sits on the page's left edge in every edition (EN and AR): it stays fixed, because a mirrored tab would
cover the folded corner's side and the label would no longer read first in either direction (decision, recorded).

    uv run --no-project --with fonttools --with uharfbuzz --with pillow --with playwright python brand/v3/tools/build_file_icons.py [--preview <png>]

Output (brand/v3/file-icons/): pdf.svg docx.svg html.svg folder.svg (64 grid), *-small.svg (16 px: no text lines),
<name>-<16|32|48|64|128|256>.png, <name>.ico (16/32/48/64/128/256, PNG frames). Text is outlined: no font is needed to show them.
"""
from __future__ import annotations

import argparse
import io
import os
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_logo import Face, BAND, NAVY, PAPER, GOLD, INK  # noqa: E402

V3 = Path(__file__).resolve().parent.parent
REPO = V3.parent.parent
OUT = V3 / "file-icons"
SIZES = (16, 32, 48, 64, 128, 256)

# tab colours: the owner's red / blue / black, harmonised to the brand; white text must clear AA (4.5:1)
TABS = {"pdf": ("PDF", "#c0262d"), "docx": ("DOCX", "#1b5fc1"), "html": ("HTML", INK)}


def lum(h: str) -> float:
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    x, y = sorted((lum(a), lum(b)), reverse=True)
    return (x + 0.05) / (y + 0.05)


def font_path() -> Path:
    name = "thmanyahsans-Bold.otf"
    for c in (os.environ.get("BW_FONT_DIR"), REPO / "fonts/nj-fonts/thmanyah/thmanyahsans/otf",
              os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft/Windows/Fonts")):
        if c and (Path(c) / name).exists():
            return Path(c) / name
    raise SystemExit(f"FAILED: no {name}; set BW_FONT_DIR (the git-ignored Thmanyah files under fonts/nj-fonts)")


PAGE = "M16 4H40L54 18V56Q54 60 50 60H16Q12 60 12 56V8Q12 4 16 4Z"
FOLD = "M40 4V14Q40 18 44 18H54Z"


def text_path(face: Face, label: str, cx: float, cy: float, max_w: float, cap: float) -> str:
    probe, (x1, y1, x2, y2) = face.outline(label, 100, 0, 0, False)
    h, w = y2 - y1, x2 - x1  # y grows down: y1 is the top of the capitals
    k = min(cap / (-y1 if y1 < 0 else h), max_w / w)
    size = 100 * k
    d, (a, b, c, e) = face.outline(label, size, 0, 0, False)
    return face.outline(label, size, cx - (a + c) / 2, cy - (b + e) / 2, False)[0]


def badge(face: Face, label: str, colour: str, small: bool) -> str:
    if small:
        tab = (0, 25, 54, 26)       # x, y, w, h  (full width of the page: the label is all that fits at 16 px)
        text = text_path(face, label, tab[0] + tab[2] / 2, tab[1] + tab[3] / 2, 46, 15)
        body = (f'<path d="{PAGE}" fill="{NAVY}"/><path d="{FOLD}" fill="{GOLD}"/>'
                f'<rect x="{tab[0] + 0.75}" y="{tab[1] + 0.75}" width="{tab[2] - 1.5}" height="{tab[3] - 1.5}" rx="5" fill="{colour}" stroke="{PAPER}" stroke-width="1.5"/>')
    else:
        tab = (2, 29, 42, 20)
        text = text_path(face, label, tab[0] + tab[2] / 2, tab[1] + tab[3] / 2, 33, 9.5)
        body = (f'<path d="{PAGE}" fill="{NAVY}"/><path d="{FOLD}" fill="{GOLD}"/>'
                f'<path d="M23 23H46" stroke="{PAPER}" stroke-width="3" stroke-linecap="round"/>'
                f'<path d="M28 54H46" stroke="{GOLD}" stroke-width="3" stroke-linecap="round"/>'
                f'<rect x="{tab[0] + 0.75}" y="{tab[1] + 0.75}" width="{tab[2] - 1.5}" height="{tab[3] - 1.5}" rx="4.5" fill="{colour}" stroke="{PAPER}" stroke-width="1.5"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="{label}">'
            f'<title>Business-Wrap {label}</title>{body}<path d="{text}" fill="#ffffff"/></svg>\n')


def folder_svg() -> str:
    body = (f'<path d="M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z" fill="{NAVY}"/>'
            f'<path d="M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z" fill="{BAND}"/>'
            f'<path d="M14 32H40" stroke="{PAPER}" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="M14 41H30" stroke="{GOLD}" stroke-width="3" stroke-linecap="round"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Business-Wrap">'
            f'<title>Business-Wrap</title>{body}</svg>\n')


def rasterise(svgs: dict[str, str]) -> dict[tuple[str, int], bytes]:
    from PIL import Image
    from playwright.sync_api import sync_playwright
    out: dict[tuple[str, int], bytes] = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True, args=["--force-color-profile=srgb"])
        try:
            pg = b.new_page(viewport={"width": 1024, "height": 1024}, device_scale_factor=1)
            for key, svg in svgs.items():
                big_svg = svg.replace('width="64" height="64"', 'width="1024" height="1024"', 1)
                pg.set_content('<body style="margin:0;background:transparent">' + big_svg + '</body>')
                big = Image.open(io.BytesIO(pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 1024, "height": 1024}))).convert("RGBA")
                for s in SIZES:
                    if key.endswith("-small") and s != 16:
                        continue
                    if not key.endswith("-small") and s == 16 and key != "folder":
                        continue
                    buf = io.BytesIO()
                    big.resize((s, s), Image.LANCZOS).save(buf, "PNG", optimize=True)
                    out[(key, s)] = buf.getvalue()
        finally:
            b.close()
    return out


def ico(frames: list[tuple[int, bytes]]) -> bytes:
    head = struct.pack("<HHH", 0, 1, len(frames))
    off = 6 + 16 * len(frames)
    dirs, data = b"", b""
    for s, png in frames:
        dirs += struct.pack("<BBBBHHII", 0 if s >= 256 else s, 0 if s >= 256 else s, 0, 0, 1, 32, len(png), off + len(data))
        data += png
    return head + dirs + data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args()
    face = Face(font_path())
    OUT.mkdir(parents=True, exist_ok=True)
    svgs: dict[str, str] = {}
    for k, (label, colour) in TABS.items():
        c = contrast("#ffffff", colour)
        assert c >= 4.5, f"{k}: white on {colour} is {c:.2f}:1"
        print(f"{k}: white on {colour} {c:.2f}:1")
        svgs[k] = badge(face, label, colour, False)
        svgs[k + "-small"] = badge(face, label, colour, True)
    svgs["folder"] = folder_svg()
    for k, s in svgs.items():
        (OUT / f"{k}.svg").write_text(s, encoding="utf-8")
    png = rasterise(svgs)
    for k in ("pdf", "docx", "html", "folder"):
        frames = []
        for s in SIZES:
            data = png.get((k, s)) or png.get((k + "-small", s))
            if data is None:
                continue
            frames.append((s, data))
            if not (k != "folder" and s == 16):
                (OUT / f"{k}-{s}.png").write_bytes(data)
            elif s == 16:
                (OUT / f"{k}-{s}.png").write_bytes(data)
        (OUT / f"{k}.ico").write_bytes(ico(frames))
        if k != "folder":  # the DOCX thumbnail part is a JPEG (Word's own format): flatten the badge onto white
            from PIL import Image
            im = Image.open(io.BytesIO(png[(k, 256)])).convert("RGBA")
            flat = Image.new("RGB", im.size, "white")
            flat.paste(im, mask=im.split()[3])
            flat.save(OUT / f"{k}-256.jpg", "JPEG", quality=92, optimize=True)
    if a.preview:
        preview(png, Path(a.preview))


def preview(png: dict[tuple[str, int], bytes], dest: Path):
    from PIL import Image, ImageDraw
    rows = ("pdf", "docx", "html", "folder")
    W = 40 + sum(s + 28 for s in SIZES)
    sheet = Image.new("RGBA", (W, 4 * 440 + 20), "#ffffff")
    d = ImageDraw.Draw(sheet)
    y = 20
    for k in rows:
        x = 20
        d.text((x, y), k.upper(), fill="#000000")
        for s in SIZES:
            data = png.get((k, s)) or png.get((k + "-small", s))
            if data is None:
                continue
            im = Image.open(io.BytesIO(data))
            sheet.paste(im, (x, y + 20), im)
            d.text((x, y + 24 + s), f"{s}px", fill="#555555")
            x += s + 28
        # the 16 px version enlarged 8x, nearest, so the owner can judge it
        k16 = png.get((k, 16)) or png.get((k + "-small", 16))
        if k16:
            im = Image.open(io.BytesIO(k16)).resize((128, 128), Image.NEAREST)
            sheet.paste(im, (20, y + 20 + 256 + 20), im)
            d.text((160, y + 20 + 256 + 60), "16 px enlarged 8x", fill="#555555")
        y += 440
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(dest)


if __name__ == "__main__":
    main()
