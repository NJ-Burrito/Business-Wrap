"""Business-Wrap brand v2: favicon PNGs, favicon.ico, apple-touch-icon, social card, og image. Metadata-free PNGs.

    uv run --with playwright --with pillow python brand/v2/tools/export_png.py
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from shot import shoot  # noqa: E402

V2 = Path(__file__).resolve().parent.parent
FAV = V2 / "favicon"
SOC = V2 / "social"
TMP = V2 / "favicon" / "_tile.html"

TMP.write_text('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}'
               'img{display:block;width:100vw;height:100vh}</style><img src="../logo/app-icon.svg" alt="">', encoding="utf-8")
try:
    sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512]
    # draw at 512 css px x scale so small sizes are downsampled from a sharp master
    jobs = [(str(FAV / f"icon-{s}.png"), s, s, max(1, 512 // s) if s < 128 else 2, None, (s, s)) for s in sizes]
    shoot(str(TMP), jobs)
finally:
    TMP.unlink()
(FAV / "icon-180.png").replace(FAV / "apple-touch-icon.png")
ico = [Image.open(FAV / f"icon-{s}.png") for s in (16, 32, 48)]
ico[2].save(FAV / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
shoot(str(SOC / "card.html"), [(str(SOC / "social-card.png"), 1280, 640, 1, None, None)])
shoot(str(SOC / "og.html"), [(str(SOC / "og.png"), 1200, 630, 1, None, None)])
shoot(str(SOC / "card.html"), [(str(SOC / "social-card-2x.png"), 1280, 640, 2, None, None)])
for p in sorted(list(FAV.glob("*.*")) + list(SOC.glob("*.png"))):
    print(f"{p.relative_to(V2)}: {p.stat().st_size // 1024 or 1} KB")
