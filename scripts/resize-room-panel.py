#!/usr/bin/env python3
"""Resize panel_room_main_9s.png to project target size and update 9-slice meta."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "assets/resources/art/ui/room/panel_room_main_9s.png"
META = PNG.with_suffix(".png.meta")

SRC_W, SRC_H = 1536, 1024
TARGET_W, TARGET_H = 920, 560
SRC_SLICE = 48


def main() -> None:
    im = Image.open(PNG).convert("RGBA")
    if im.size != (SRC_W, SRC_H):
        print(f"[warn] source {im.size}, expected {(SRC_W, SRC_H)}")

    before = PNG.stat().st_size
    im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    im.save(PNG, optimize=True, compress_level=9)
    after = PNG.stat().st_size

    sx, sy = TARGET_W / SRC_W, TARGET_H / SRC_H
    slice_l = max(1, round(SRC_SLICE * sx))
    slice_t = max(1, round(SRC_SLICE * sy))

    data = json.loads(META.read_text(encoding="utf-8"))
    sf = data["subMetas"]["f9941"]["userData"]
    half_w, half_h = TARGET_W / 2, TARGET_H / 2
    sf["width"] = TARGET_W
    sf["height"] = TARGET_H
    sf["rawWidth"] = TARGET_W
    sf["rawHeight"] = TARGET_H
    sf["borderLeft"] = slice_l
    sf["borderRight"] = slice_l
    sf["borderTop"] = slice_t
    sf["borderBottom"] = slice_t
    sf["vertices"] = {
        "rawPosition": [
            -half_w,
            -half_h,
            0,
            half_w,
            -half_h,
            0,
            -half_w,
            half_h,
            0,
            half_w,
            half_h,
            0,
        ],
        "indexes": [0, 1, 2, 2, 1, 3],
        "uv": [0, TARGET_H, TARGET_W, TARGET_H, 0, 0, TARGET_W, 0],
        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
        "minPos": [-half_w, -half_h, 0],
        "maxPos": [half_w, half_h, 0],
    }
    META.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    print(f"[OK] {PNG.name}: {SRC_W}x{SRC_H} -> {TARGET_W}x{TARGET_H}")
    print(f"     slice L/R={slice_l} T/B={slice_t}")
    print(f"     file {before/1024:.1f} KB -> {after/1024:.1f} KB")


if __name__ == "__main__":
    main()
