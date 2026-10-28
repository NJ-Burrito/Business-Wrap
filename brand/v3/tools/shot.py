"""Screenshot an HTML file (or an element in it) to PNG with headless Chrome, then strip metadata.

    uv run --with playwright --with pillow python brand/v3/tools/shot.py <page.html> <out.png> <w> <h> [--scale 2] [--selector css]
Chrome: BW_CHROME, else the Puppeteer chrome-headless-shell under PUPPETEER_CACHE_DIR, else Playwright's own.
"""
from __future__ import annotations

import argparse
import glob
import io
import os
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


def chrome() -> str | None:
    if os.environ.get("BW_CHROME"):
        return os.environ["BW_CHROME"]
    root = os.environ.get("PUPPETEER_CACHE_DIR", "")
    hits = sorted(glob.glob(os.path.join(root, "chrome-headless-shell", "*", "*", "chrome-headless-shell*")))
    return next((h for h in hits if h.endswith((".exe", "shell"))), None)


def clean_png(data: bytes, out: Path, size: tuple[int, int] | None = None):
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    im.save(out, "PNG", optimize=True)  # Pillow writes no tEXt/iTXt/eXIf unless asked


def shoot(page_path: str, jobs: list[tuple[str, int, int, float, str | None, tuple[int, int] | None]]):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome(), args=["--force-color-profile=srgb", "--font-render-hinting=none"])
        try:
            for out, w, h, scale, sel, final in jobs:
                pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
                pg.goto(Path(page_path).resolve().as_uri())
                pg.evaluate("document.fonts.ready")
                pg.wait_for_timeout(150)
                data = pg.locator(sel).screenshot(omit_background=True) if sel else pg.screenshot()
                clean_png(data, Path(out), final)
                pg.close()
        finally:
            b.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("page"), ap.add_argument("out"), ap.add_argument("w", type=int), ap.add_argument("h", type=int)
    ap.add_argument("--scale", type=float, default=2), ap.add_argument("--selector")
    a = ap.parse_args()
    shoot(a.page, [(a.out, a.w, a.h, a.scale, a.selector, None)])
