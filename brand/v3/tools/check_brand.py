"""Business-Wrap brand v3 gate: the frozen interfaces I2 to I5 hold.

    uv run --no-project --with pillow python brand/v3/tools/check_brand.py

Checks: every SVG in logo/, favicon/ and icons/ parses as XML, has no <text> (outlined), and uses only colours from
the SRS ramps (palette/tokens.json) or #ffffff; mark-animated.svg carries the six classes; lockup viewBoxes are
exact; every PNG has its exact size, no metadata chunk, and is under 5 MB (social-card.png under 250 KB);
favicon.ico holds 16, 32 and 48; icons keep the v2 names and the .mv part. Exit 1 on any failure.
"""
from __future__ import annotations

import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

V3 = Path(__file__).resolve().parent.parent
REPO = V3.parent.parent
NS = "{http://www.w3.org/2000/svg}"
HEX = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
META = {b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"tIME"}

ICONS = ["bilingual", "design-pack", "diagram", "direction", "docx", "dry-run", "e-service", "editor", "edits-file",
         "evidence", "explainer", "export", "harvest", "mcp-server", "merge", "pdf", "plugin", "print-layout",
         "process-model", "security-gate", "update", "walk"]
LOGO = ["mark.svg", "mark-dark.svg", "mark-small.svg", "mark-small-dark.svg", "mark-mono.svg", "mark-animated.svg",
        "app-icon.svg"] + [f"{k}-{l}{m}.svg" for k in ("lockup", "wordmark") for l in ("en", "ar") for m in ("", "-dark", "-mono")]
PNGS = {**{f"favicon/icon-{s}.png": (s, s) for s in (16, 32, 48, 64, 128, 192, 256, 512)},
        "favicon/maskable-512.png": (512, 512), "favicon/apple-touch-icon.png": (180, 180),
        "social/social-card.png": (1280, 640), "social/og.png": (1200, 630), "social/og-ar.png": (1200, 630)}

fails: list[str] = []


def fail(msg: str):
    fails.append(msg)
    print("FAIL", msg)


def allowed_hex() -> set[str]:
    pal = json.loads((REPO / "palette/tokens.json").read_text(encoding="utf-8"))
    out = {"#ffffff"}
    for ramp in pal["color"]["ramp"].values():
        for step in ramp.values():
            if isinstance(step, dict) and "$value" in step:
                out.add(step["$value"]["hex"].lower())
    return out


def check_svg(p: Path, ok: set[str]):
    src = p.read_text(encoding="utf-8")
    try:
        root = ET.fromstring(src)
    except ET.ParseError as e:
        return fail(f"{p.relative_to(V3)}: does not parse ({e})")
    if any(True for _ in root.iter(f"{NS}text")):
        fail(f"{p.relative_to(V3)}: has <text> (must be outlined)")
    # mask fills (#000 / #fff) are luminance masks, not colours anyone sees
    body = re.sub(r"<mask\b.*?</mask>", "", src, flags=re.S)
    bad = {h.lower() for h in HEX.findall(body)} - ok
    if bad:
        fail(f"{p.relative_to(V3)}: colours outside the ramps {sorted(bad)}")
    return root


def png_chunks(p: Path) -> list[bytes]:
    data, i, out = p.read_bytes(), 8, []
    while i < len(data):
        n = struct.unpack(">I", data[i:i + 4])[0]
        out.append(data[i + 4:i + 8])
        i += 12 + n
    return out


def main() -> int:
    ok = allowed_hex()
    for n in LOGO:
        p = V3 / "logo" / n
        if not p.exists():
            fail(f"logo/{n}: missing")
            continue
        root = check_svg(p, ok)
        if root is None:
            continue
        vb = root.get("viewBox")
        want = "0 0 384 64" if n.startswith("lockup-en") else "0 0 320 64" if n.startswith("lockup-ar") else None
        if want and vb != want:
            fail(f"logo/{n}: viewBox {vb} != {want}")
    anim = (V3 / "logo/mark-animated.svg").read_text(encoding="utf-8") if (V3 / "logo/mark-animated.svg").exists() else ""
    for cls in ('class="sheet"', 'class="spine"', 'class="cap"', 'class="ln l1"', 'class="ln l2"', 'class="rule"'):
        if cls not in anim:
            fail(f"logo/mark-animated.svg: no {cls}")
    if "prefers-reduced-motion" not in anim:
        fail("logo/mark-animated.svg: no reduced-motion guard")
    check_svg(V3 / "favicon/favicon.svg", ok)
    for n, size in PNGS.items():
        p = V3 / n
        if not p.exists():
            fail(f"{n}: missing")
            continue
        im = Image.open(p)
        if im.size != size:
            fail(f"{n}: {im.size} != {size}")
        meta = set(png_chunks(p)) & META
        if meta:
            fail(f"{n}: metadata chunks {sorted(meta)}")
        cap = 250 * 1024 if n.endswith("social-card.png") else 5 * 1024 * 1024
        if p.stat().st_size > cap:
            fail(f"{n}: {p.stat().st_size} B over {cap}")
    ico = Image.open(V3 / "favicon/favicon.ico")
    if not {(16, 16), (32, 32), (48, 48)} <= set(ico.info.get("sizes", ())):
        fail(f"favicon/favicon.ico: sizes {ico.info.get('sizes')}")
    icon_dir = V3 / "icons"
    if icon_dir.exists():
        for n in ICONS:
            p = icon_dir / f"{n}.svg"
            if not p.exists():
                fail(f"icons/{n}.svg: missing")
                continue
            root = check_svg(p, ok)
            if root is not None and 'class="mv' not in p.read_text(encoding="utf-8"):
                fail(f"icons/{n}.svg: no .mv part")
        for n in ("icons.css", "sprite.svg", "icons.json"):
            if not (icon_dir / n).exists():
                fail(f"icons/{n}: missing")
        if (icon_dir / "sprite.svg").exists():
            check_svg(icon_dir / "sprite.svg", ok)
            sprite = (icon_dir / "sprite.svg").read_text(encoding="utf-8")
            for n in ICONS:
                if f'id="bw-i-{n}"' not in sprite and f'id="{n}"' not in sprite:
                    fail(f"icons/sprite.svg: no symbol for {n}")
        if (icon_dir / "icons.json").exists():
            keys = set(json.loads((icon_dir / "icons.json").read_text(encoding="utf-8")).get("icons", {}))
            if keys and keys != set(ICONS):
                fail(f"icons/icons.json: keys differ {sorted(keys ^ set(ICONS))}")
    print("brand v3: all checks pass" if not fails else f"brand v3: {len(fails)} FAIL")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
