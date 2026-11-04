"""Business-Wrap icons for every file type of the save and download tree, and the launcher (0.17.0, owner notes N15 and N16).

Source of truth: assets/icons/types.json. Art: the brand v3 "Cover" badge of brand/v3/tools/build_file_icons.py (navy page, gold folded
corner, a label tab in the type's own colour with white Thmanyah Sans Bold outlines), imported, not copied. Every kind gets TWO drawings:
the full badge (32 px and up) and a hand-tuned small one (16 and 24 px: no text lines, a tab across the whole page), each rasterised
from the vector at 1024 px and reduced to every size, so no size is an enlarged one. Output (this folder):
  <kind>.svg  <kind>-small.svg  <kind>.ico (16, 24, 32, 48, 64, 128, 256 as PNG frames)  <kind>-256.png
  launcher.svg  launcher.ico   (the Business-Wrap logo tile; the shortcut's icon)
  --preview <html>   a page that shows every icon tiny (1x and 8x) and huge (SVG and the 256 frame)

    uv run --no-project --with fonttools --with uharfbuzz --with pillow --with playwright python assets/icons/build_icons.py [--preview <html>]
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "brand" / "v3" / "tools"))
import build_file_icons as B  # noqa: E402

SPEC = json.loads((HERE / "types.json").read_text(encoding="utf-8"))
SIZES = tuple(SPEC["sizes"])
SMALL_MAX = 24


def render_all(svgs: dict[str, str]) -> dict[tuple[str, int], bytes]:
    from PIL import Image
    from playwright.sync_api import sync_playwright
    out: dict[tuple[str, int], bytes] = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel=os.environ.get("BW_ICON_CHANNEL", "msedge"), headless=True, args=["--force-color-profile=srgb"])
        try:
            pg = b.new_page(viewport={"width": 1024, "height": 1024}, device_scale_factor=1)
            for key, svg in svgs.items():
                big_svg = svg.replace('width="64" height="64"', 'width="1024" height="1024"', 1)
                pg.set_content('<body style="margin:0;background:transparent">' + big_svg + "</body>")
                big = Image.open(io.BytesIO(pg.screenshot(omit_background=True, clip={"x": 0, "y": 0, "width": 1024, "height": 1024}))).convert("RGBA")
                for s in SIZES:
                    buf = io.BytesIO()
                    big.resize((s, s), Image.LANCZOS).save(buf, "PNG", optimize=True)
                    out[(key, s)] = buf.getvalue()
        finally:
            b.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args()
    face = B.Face(B.font_path())
    svgs: dict[str, str] = {}
    for k, v in SPEC["kinds"].items():
        c = B.contrast("#ffffff", v["colour"])
        assert c >= 4.5, f"{k}: white on {v['colour']} is {c:.2f}:1"
        svgs[k] = B.badge(face, v["label"], v["colour"], False).replace(f"Business-Wrap {v['label']}", f"Business-Wrap {v['label']} file")
        svgs[k + "-small"] = B.badge(face, v["label"], v["colour"], True)
    svgs["launcher"] = (REPO / "brand" / "v3" / "logo" / "app-icon.svg").read_text(encoding="utf-8")
    for k, s in svgs.items():
        (HERE / f"{k}.svg").write_text(s, encoding="utf-8")
    png = render_all(svgs)
    for k in list(SPEC["kinds"]) + ["launcher"]:
        frames = []
        for s in SIZES:
            src = k + "-small" if (s <= SMALL_MAX and k != "launcher") else k
            frames.append((s, png[(src, s)]))
        (HERE / f"{k}.ico").write_bytes(B.ico(frames))
        (HERE / f"{k}-256.png").write_bytes(png[(k, 256)])
    if a.preview:
        preview(png, Path(a.preview))
    print(f"wrote {len(SPEC['kinds'])} file icons + launcher, sizes {list(SIZES)}")


def uri(b: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(b).decode()


def svguri(k: str) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode((HERE / f"{k}.svg").read_bytes()).decode()


def preview(png, dest: Path):
    rows = []
    for k, v in list(SPEC["kinds"].items()) + [("launcher", {"label": "Launcher", "exts": ["Business-Wrap.lnk"]})]:
        def fr(s):
            return png[((k + "-small") if (s <= SMALL_MAX and k != "launcher") else k, s)]
        tiny = "".join(f'<img src="{uri(fr(s))}" width="{s}" height="{s}" title="{s}px">' for s in (16, 24, 32, 48))
        mag = "".join(f'<img class="px" src="{uri(fr(s))}" width="{s * 4}" height="{s * 4}" title="{s}px x4">' for s in (16, 24))
        rows.append(f'<tr><th>{v["label"]}<br><small>.{" .".join(v["exts"])}</small></th><td class="t">{tiny}</td><td class="t">{mag}</td>'
                    f'<td><img src="{uri(fr(256))}" width="256" height="256" alt="{k} 256"></td><td><img src="{svguri(k)}" width="256" height="256" alt="{k} svg"></td></tr>')
    strip = "".join(f'<img src="{uri(png[((k + "-small") if k != "launcher" else k, 16)])}" width="16" height="16">' for k in list(SPEC["kinds"]) + ["launcher"])
    html = f"""<!doctype html><meta charset="utf-8"><title>Business-Wrap file icons</title>
<style>body{{font:14px system-ui;margin:24px;background:#fff;color:#1b1813}}table{{border-collapse:collapse}}th,td{{border-bottom:1px solid #ddd;padding:8px 14px;text-align:left;vertical-align:middle}}
.t img{{margin-right:10px;vertical-align:middle}}.px{{image-rendering:pixelated}}.dark{{background:#202124;padding:8px;display:inline-block}}</style>
<h1>Business-Wrap file icons (0.17.0)</h1>
<p>All 16 px side by side (light, then dark ground): <span>{strip}</span> <span class="dark">{strip}</span></p>
<p>Row: tiny sizes 16, 24, 32, 48 at 1x; 16 and 24 enlarged 4x (nearest neighbour); the 256 frame of the .ico; the vector SVG.</p>
<table>{''.join(rows)}</table>"""
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    main()
