#!/usr/bin/env python3
"""Trim dark padding from board cell PNGs and re-center on square canvas.

Fixes misaligned tiles when art has uneven black borders (e.g. L=14px R=2px).

  python scripts/trim-cell-borders.py

Requires: pip install pillow
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Install Pillow: pip install pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
CELLS = ROOT / "assets" / "resources" / "art" / "ui" / "board" / "cells"
CANVAS = 128
DARK_THRESH = 28
ALPHA_MIN = 16


def content_bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    px = im.load()
    w, h = im.size
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < ALPHA_MIN:
                continue
            if r <= DARK_THRESH and g <= DARK_THRESH and b <= DARK_THRESH:
                continue
            xs.append(x)
            ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def trim_and_center(path: Path) -> bool:
    im = Image.open(path).convert("RGBA")
    bb = content_bbox(im)
    if not bb:
        print(f"  skip (no content): {path.name}")
        return False

    cropped = im.crop(bb)
    cw, ch = cropped.size
    scale = min(CANVAS / cw, CANVAS / ch, 1.0)
    nw = max(1, round(cw * scale))
    nh = max(1, round(ch * scale))
    if scale < 1.0:
        cropped = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ox = (CANVAS - cropped.width) // 2
    oy = (CANVAS - cropped.height) // 2
    out.paste(cropped, (ox, oy), cropped)

    out.save(path, optimize=True)
    print(
        f"  {path.name}: bbox {bb[2]-bb[0]}x{bb[3]-bb[1]} "
        f"margins L{bb[0]} T{bb[1]} -> centered {cropped.width}x{cropped.height} on {CANVAS}",
    )
    return True


def main() -> None:
    if not CELLS.is_dir():
        print(f"Missing {CELLS}", file=sys.stderr)
        sys.exit(1)
    files = sorted(CELLS.glob("*.png"))
    if not files:
        print("No cell PNGs found", file=sys.stderr)
        sys.exit(1)
    n = sum(trim_and_center(p) for p in files)
    print(f"Done. Updated {n}/{len(files)} cell PNG(s). Rebuild WeChat in Cocos.")


if __name__ == "__main__":
    main()
