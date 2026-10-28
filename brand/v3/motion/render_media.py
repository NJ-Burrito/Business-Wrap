"""Business-Wrap brand v3 media: one delivery render per HyperFrames project, then the shipped files.

    PYTHONUTF8=1 python brand/v3/motion/render_media.py [slug ...]

Masters go to O:/Temp/bw012-wp2 (never the repo, never drive C). Outputs (frozen interface I6):
  site/assets/media/hero.gif (17 fps), hero.mp4 (25 fps), hero-poster.webp (frame 0), hero-ar.gif, github-banner.gif
  brand/v3/banner/github-banner-still.png (the 3.0 s frame), logo-loop.gif, logo-loop.mp4
GIFs: one 256-colour palette per file, no dithering, written to a temp name and renamed (atomic).
Run once; on a failure the failing command is printed and the script stops.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
MOTION = ROOT / "brand" / "v3" / "motion"
MEDIA = ROOT / "site" / "assets" / "media"
BANNER = ROOT / "brand" / "v3" / "banner"
TMP = Path(os.environ.get("BW_MEDIA_TMP", "O:/Temp/bw012-wp2"))
HF = "0.8.144"
NPX = "npx.cmd" if os.name == "nt" else "npx"


def run(cmd: list[str], cwd: Path | None = None, log: Path | None = None) -> None:
    print("$", " ".join(cmd), flush=True)
    out = open(log, "w", encoding="utf-8") if log else None
    r = subprocess.run(cmd, cwd=cwd, stdout=out or None, stderr=subprocess.STDOUT if out else None)
    if out:
        out.close()
    if r.returncode != 0:
        sys.exit(f"FAILED (exit {r.returncode}): {' '.join(cmd)}" + (f"  log: {log}" if log else ""))


def master(slug: str) -> Path:
    out = TMP / f"{slug}.mp4"
    run([NPX, "--yes", f"hyperframes@{HF}", "render", ".", "-q", "delivery", "--crf", "10", "--browser-gpu", "--gpu",
         "-o", str(out)], cwd=MOTION / slug, log=TMP / f"{slug}.render.log")
    return out


def gif(src: Path, dst: Path, fps: int, width: int | None = None) -> None:
    scale = f",scale={width}:-1:flags=lanczos" if width else ""
    tmp = dst.with_name(dst.stem + ".part.gif")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-vf",
         f"fps={fps}{scale},split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=none",
         "-loop", "0", "-map_metadata", "-1", str(tmp)])
    tmp.replace(dst)


def web_mp4(src: Path, dst: Path) -> None:
    tmp = dst.with_name(dst.stem + ".part.mp4")
    run(["ffmpeg", "-y", "-v", "error", "-i", str(src), "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-map_metadata", "-1", "-r", "25", str(tmp)])
    tmp.replace(dst)


def still(src: Path, t: float, dst: Path, codec: list[str]) -> None:
    tmp = dst.with_name(dst.stem + ".part" + dst.suffix)
    run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t}", "-i", str(src), "-frames:v", "1", "-map_metadata", "-1",
         *codec, str(tmp)])
    if dst.suffix == ".png":  # re-save through PIL: no tEXt/iTXt/eXIf/tIME chunks
        from PIL import Image
        im = Image.open(tmp)
        im.load()
        clean = Image.new(im.mode, im.size)
        clean.putdata(list(im.getdata()))
        clean.save(dst, optimize=True)
        tmp.unlink()
    else:
        tmp.replace(dst)


def main(slugs: list[str]) -> None:
    TMP.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)
    BANNER.mkdir(parents=True, exist_ok=True)
    if "hero" in slugs:
        m = master("hero")
        gif(m, MEDIA / "hero.gif", 17)
        web_mp4(m, MEDIA / "hero.mp4")
        still(m, 0, MEDIA / "hero-poster.webp", ["-c:v", "libwebp", "-lossless", "0", "-quality", "92"])
    if "hero-ar" in slugs:
        gif(master("hero-ar"), MEDIA / "hero-ar.gif", 17)
    if "github-banner" in slugs:
        m = master("github-banner")
        gif(m, MEDIA / "github-banner.gif", 17)
        still(m, 3.0, BANNER / "github-banner-still.png", ["-c:v", "png"])
    if "logo-loop" in slugs:
        m = master("logo-loop")
        gif(m, BANNER / "logo-loop.gif", 25)
        web_mp4(m, BANNER / "logo-loop.mp4")
    print("done")


if __name__ == "__main__":
    main(sys.argv[1:] or ["hero", "hero-ar", "github-banner", "logo-loop"])
