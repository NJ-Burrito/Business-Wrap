"""Business-Wrap brand v3: favicon PNGs, favicon.ico, maskable and apple-touch icons, social card, og images.
Every PNG is drawn at 2x or more and downscaled; Pillow writes no metadata chunks (the repo gate refuses image metadata).

    uv run --no-project --with playwright --with pillow python brand/v3/tools/export_png.py

Run build_logo.py first (it writes the tile masters into tools/_tiles/). The social cards need the local Thmanyah
files under fonts/nj-fonts (git-ignored); the script stops when a face did not load, so a fallback font never ships.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from shot import chrome, clean_png  # noqa: E402

V3 = Path(__file__).resolve().parent.parent
FAV, SOC, TILES = V3 / "favicon", V3 / "social", V3 / "tools" / "_tiles"

# social pages (DESIGN c.4). Facts and words fixed by the spec; EN and AR built together.
HOOK_EN = 'Evidence in.<br>One document, <span class="rule">two languages.</span>'
HOOK_AR = 'أدلة تدخل. وثيقة واحدة <span class="rule">بلغتين.</span>'
FOOT_EN = "Free · MIT · Arabic + English · PDF + DOCX"
FOOT_AR = "مجاني · MIT · عربي + إنجليزي · PDF + DOCX"
PAGE = """<!doctype html>
<html lang="{lang}" dir="{dir}"><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="card.css"><style>:root{{--w:{w}px;--h:{h}px}}</style></head>
<body><div class="card"><div class="spine" aria-hidden="true"></div>
<img class="lockup" src="../logo/{lockup}.svg" alt="{alt}">
<div class="hooks">{hooks}</div>
<p class="foot">{foot}</p></div></body></html>
"""
CARDS = {
    "card.html": dict(lang="en", dir="ltr", title="Business-Wrap social card", w=1280, h=640, lockup="lockup-en",
                      alt="Business-Wrap", foot=FOOT_EN,
                      hooks=f'<p class="hook">{HOOK_EN}</p><p class="hook" lang="ar" dir="rtl">{HOOK_AR}</p>'),
    "og.html": dict(lang="en", dir="ltr", title="Business-Wrap og image", w=1200, h=630, lockup="lockup-en",
                    alt="Business-Wrap", foot=FOOT_EN, hooks=f'<p class="hook">{HOOK_EN}</p>'),
    "og-ar.html": dict(lang="ar", dir="rtl", title="بزنس راب", w=1200, h=630, lockup="lockup-ar",
                       alt="بزنس راب", foot=FOOT_AR, hooks=f'<p class="hook" lang="ar">{HOOK_AR}</p>'),
}
SOCIAL_OUT = {"card.html": "social-card.png", "og.html": "og.png", "og-ar.html": "og-ar.png"}
FACES = ['700 64px "Thmanyah Serif Display"', '500 28px "Thmanyah Sans"']


def tile_page(svg: str) -> Path:
    p = TILES / (Path(svg).stem + ".html")
    p.write_text('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}'
                 f'img{{display:block;width:100vw;height:100vh}}</style><img src="{svg}" alt="">', encoding="utf-8")
    return p


def main():
    from playwright.sync_api import sync_playwright
    FAV.mkdir(exist_ok=True)
    for name, kw in CARDS.items():
        (SOC / name).write_text(PAGE.format(**kw), encoding="utf-8", newline="\n")
    # (page, out, css size, scale, final size)
    jobs = []
    for s in (16, 32, 48):
        jobs.append((tile_page("tile-small.svg"), FAV / f"icon-{s}.png", 256, 1, (s, s)))
    for s in (64, 128, 192, 256, 512):
        jobs.append((tile_page("tile.svg"), FAV / f"icon-{s}.png", 512, 2, (s, s)))
    jobs.append((tile_page("tile-maskable.svg"), FAV / "maskable-512.png", 512, 2, (512, 512)))
    jobs.append((tile_page("tile-apple.svg"), FAV / "apple-touch-icon.png", 360, 2, (180, 180)))
    for s in (16, 32, 48):
        jobs.append((tile_page("mark-small.svg"), TILES / f"ico-{s}.png", 256, 1, (s, s)))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=chrome(), args=["--force-color-profile=srgb", "--font-render-hinting=none"])
        try:
            for page, out, css, scale, final in jobs:
                pg = b.new_page(viewport={"width": css, "height": css}, device_scale_factor=scale)
                pg.goto(page.resolve().as_uri())
                pg.wait_for_load_state("load")
                pg.wait_for_timeout(100)
                clean_png(pg.screenshot(omit_background=True), out, final)
                pg.close()
            for name, kw in CARDS.items():
                pg = b.new_page(viewport={"width": kw["w"], "height": kw["h"]}, device_scale_factor=2)
                pg.goto((SOC / name).resolve().as_uri())
                pg.evaluate("document.fonts.ready")
                pg.wait_for_timeout(200)
                missing = [f for f in FACES if not pg.evaluate("f => document.fonts.check(f)", f)]
                loaded = pg.evaluate("[...document.fonts].filter(f => f.status === 'loaded').length")
                if missing or loaded < 2:
                    raise SystemExit(f"FAILED: Thmanyah not loaded for {name}: {missing} (loaded {loaded})")
                clean_png(pg.screenshot(), SOC / SOCIAL_OUT[name], (kw["w"], kw["h"]))
                pg.close()
        finally:
            b.close()
    ico = [Image.open(TILES / f"ico-{s}.png") for s in (16, 32, 48)]
    ico[2].save(FAV / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
    # social card budget: 250 KB. Quantise only if the full-colour PNG is over it.
    card = SOC / "social-card.png"
    if card.stat().st_size > 250 * 1024:
        Image.open(card).convert("RGB").quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(card, optimize=True)
    for f in TILES.iterdir():  # build intermediates: never committed
        f.unlink()
    TILES.rmdir()
    for p in sorted(list(FAV.glob("*.png")) + [FAV / "favicon.ico"] + list(SOC.glob("*.png"))):
        print(f"{p.relative_to(V3)}: {Image.open(p).size} {p.stat().st_size // 1024 or 1} KB")


if __name__ == "__main__":
    main()
