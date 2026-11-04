"""Business-Wrap folder icons, one per folder ROLE (0.17.4, owner note of 2026-11-04). Source of truth: assets/icons/folders.json.

Family of the file icons (build_icons.py): the brand v3 folder (navy back) with a front panel in the role's own colour and one white glyph
(Lucide geometry, ISC) in the middle. Two drawings per role: the full one (32 px and up) and a small one (16 and 24 px: a taller panel and a
heavier stroke), each rasterised from the vector at 1024 px and reduced to every size, so no size is an enlarged one. Output (this folder):
  folder-<role>.svg  folder-<role>-small.svg  folder-<role>.ico (16..256 PNG frames)  folder-<role>-256.png
  and the one-line SVG strings the editor draws (settings card, folder picker), written between the FI-BEGIN / FI-END markers of
  editor/settings.js and editor/ext/48-folder-picker.js.
  --preview <html>   every role at 16, 24, 32, 48 (1x), 16 and 24 enlarged, and 256

    uv run --no-project --with fonttools --with uharfbuzz --with pillow --with playwright python assets/icons/build_folder_icons.py [--preview <html>]
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
sys.path.insert(0, str(REPO / "brand" / "v3" / "tools"))
sys.path.insert(0, str(HERE))
import build_icons as I  # noqa: E402  (render_all; first: build_file_icons puts brand/v3/tools, which has its own build_icons.py, ahead on the path)
import build_file_icons as B  # noqa: E402
from build_logo import NAVY, BAND, PAPER, GOLD  # noqa: E402

SPEC = json.loads((HERE / "folders.json").read_text(encoding="utf-8"))
I.SIZES = tuple(SPEC["sizes"])
SMALL_MAX = 24

# Lucide (ISC) glyphs on the 24 grid
GLYPHS = {
    "files": '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>',
    "file-text": '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    "upload": '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    "download": '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    "link": '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "history": '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    "lock": '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "inbox": '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    "briefcase": '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
}


def folder(role: str, v: dict, small: bool) -> str:
    """One role's 64-grid SVG. `small`: taller panel, heavier stroke, no fine lines (16 and 24 px)."""
    if small:
        back = f'<path d="M5 13Q5 9 9 9H24L29 14H55Q59 14 59 18V51Q59 55 55 55H9Q5 55 5 51Z" fill="{NAVY}"/>'
        panel = "M5 21H59V51Q59 55 55 55H9Q5 55 5 51Z"
        cy, s, sw = 38.5, 1.5, 2.9
    else:
        back = f'<path d="M6 14Q6 10 10 10H24L30 16H54Q58 16 58 20V50Q58 54 54 54H10Q6 54 6 50Z" fill="{NAVY}"/>'
        panel = "M6 22H58V50Q58 54 54 54H10Q6 54 6 50Z"
        cy, s, sw = 38.5, 1.2, 2.5
    if v["colour"] == "brand":
        if small:
            mark = f'<path d="M14 33H44" stroke="{PAPER}" stroke-width="5" stroke-linecap="round"/><path d="M14 45H32" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>'
        else:
            mark = f'<path d="M14 32H40" stroke="{PAPER}" stroke-width="3" stroke-linecap="round"/><path d="M14 41H30" stroke="{GOLD}" stroke-width="3" stroke-linecap="round"/>'
        front = f'<path d="{panel}" fill="{BAND}"/>'
    else:
        front = f'<path d="{panel}" fill="{v["colour"]}"/>'
        mark = (f'<g transform="translate({32 - 12 * s:.2f} {cy - 12 * s:.2f}) scale({s})" fill="none" stroke="#ffffff" stroke-width="{sw / s:.2f}" '
                f'stroke-linecap="round" stroke-linejoin="round">{GLYPHS[v["glyph"]]}</g>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="Business-Wrap {role}">'
            f'<title>Business-Wrap folder: {v["en"]}</title>{back}{front}{mark}</svg>\n')


def splice(file: Path, payload: str):
    t = file.read_text(encoding="utf-8")
    pat = re.compile(r"/\*FI-BEGIN\*/.*?/\*FI-END\*/", re.S)
    assert pat.search(t), f"{file}: no FI-BEGIN/FI-END markers"
    file.write_text(pat.sub(lambda m: "/*FI-BEGIN*/" + payload + "/*FI-END*/", t, count=1), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview")
    a = ap.parse_args()
    roles = SPEC["roles"]
    svgs: dict[str, str] = {}
    for r, v in roles.items():
        if v["colour"] != "brand":
            c = B.contrast("#ffffff", v["colour"])
            assert c >= 4.5, f"{r}: white on {v['colour']} is {c:.2f}:1"
        svgs[f"folder-{r}"] = folder(r, v, False)
        svgs[f"folder-{r}-small"] = folder(r, v, True)
    for k, s in svgs.items():
        (HERE / f"{k}.svg").write_text(s, encoding="utf-8")
    png = I.render_all(svgs)
    for r in roles:
        k = f"folder-{r}"
        frames = [(s, png[((k + "-small") if s <= SMALL_MAX else k, s)]) for s in I.SIZES]
        (HERE / f"{k}.ico").write_bytes(B.ico(frames))
        (HERE / f"{k}-256.png").write_bytes(png[(k, 256)])
    # the editor's copies: the full drawing without its <title>, aria-hidden (the label sits beside it)
    ui = {}
    for r in roles:
        s = svgs[f"folder-{r}"]
        s = re.sub(r"<title>.*?</title>", "", s).replace(' role="img"', ' aria-hidden="true"')
        s = re.sub(r' aria-label="[^"]*"', "", s).replace(' width="64" height="64"', "").strip()
        ui[r] = s
    payload = "\nconst FOLDER_ICONS = " + json.dumps(ui, ensure_ascii=False, separators=(", ", ": ")) + ";\n"
    splice(REPO / "editor" / "settings.js", payload)
    splice(REPO / "editor" / "ext" / "48-folder-picker.js", payload)
    if a.preview:
        preview(png, Path(a.preview))
    print(f"wrote {len(roles)} folder icons, sizes {list(I.SIZES)}")


def uri(b: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(b).decode()


def preview(png, dest: Path):
    rows = []
    for r, v in SPEC["roles"].items():
        def fr(s):
            return png[(f"folder-{r}-small" if s <= SMALL_MAX else f"folder-{r}", s)]
        tiny = "".join(f'<img src="{uri(fr(s))}" width="{s}" height="{s}">' for s in (16, 24, 32, 48))
        mag = "".join(f'<img class="px" src="{uri(fr(s))}" width="{s * 4}" height="{s * 4}">' for s in (16, 24))
        rows.append(f'<tr><th>{r}<br><small>{v["en"]}</small></th><td class="t">{tiny}</td><td class="t">{mag}</td><td><img src="{uri(fr(256))}" width="256" height="256"></td></tr>')
    strip = "".join(f'<img src="{uri(png[(f"folder-{r}-small", 16)])}" width="16" height="16">' for r in SPEC["roles"])
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(f"""<!doctype html><meta charset="utf-8"><title>Business-Wrap folder icons</title>
<style>body{{font:14px system-ui;margin:24px}}table{{border-collapse:collapse}}th,td{{border-bottom:1px solid #ddd;padding:8px 14px;text-align:left}}.t img{{margin-right:10px;vertical-align:middle}}.px{{image-rendering:pixelated}}.dark{{background:#202124;padding:8px;display:inline-block}}</style>
<p>16 px, light then dark: <span>{strip}</span> <span class="dark">{strip}</span></p><table>{''.join(rows)}</table>""", encoding="utf-8")


if __name__ == "__main__":
    main()
