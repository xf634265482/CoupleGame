#!/usr/bin/env python3
"""Shrink UI PNGs under assets/resources/art/ui for WeChat package size.

Run from repo root after backing up art:
  python scripts/resize-ui-resources.py

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
UI = ROOT / "assets" / "resources" / "art" / "ui"

RULES: list[tuple[str, int]] = [
    ("board/cells", 128),
    ("icons", 96),
    ("backgrounds", 1280),  # max width; height scales
]


def resize_file(path: Path, max_side: int, max_width: int | None = None) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    if max_width is not None:
        if w <= max_width:
            return
        nh = max(1, round(h * max_width / w))
        img = img.resize((max_width, nh), Image.Resampling.LANCZOS)
    else:
        if max(w, h) <= max_side:
            return
        scale = max_side / max(w, h)
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    img.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)} -> {img.size[0]}x{img.size[1]}")


def main() -> None:
    if not UI.is_dir():
        print(f"Missing {UI}", file=sys.stderr)
        sys.exit(1)
    changed = 0
    for sub, max_side in RULES:
        folder = UI / sub.replace("/", "\\") if "\\" in str(UI) else UI / sub
        if not folder.is_dir():
            continue
        for png in sorted(folder.glob("*.png")):
            before = png.stat().st_size
            if sub == "backgrounds":
                resize_file(png, max_side, max_width=max_side)
            else:
                resize_file(png, max_side)
            after = png.stat().st_size
            if after != before:
                changed += 1
    print(f"Done. {changed} file(s) updated. Reimport in Cocos Creator then rebuild WeChat.")


if __name__ == "__main__":
    main()
