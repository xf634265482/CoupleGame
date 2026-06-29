from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Synchronize a Cocos sprite-frame trim rectangle with PNG alpha bounds."
    )
    parser.add_argument("png", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    png_path = args.png
    meta_path = png_path.with_suffix(".png.meta")

    image = Image.open(png_path).convert("RGBA")
    bounds = image.getchannel("A").point(lambda value: 255 if value > 1 else 0).getbbox()
    if bounds is None:
        raise ValueError(f"asset has no visible pixels: {png_path}")

    trim_x, trim_y, right, bottom = bounds
    width = right - trim_x
    height = bottom - trim_y
    raw_width, raw_height = image.size
    offset_x = trim_x + width / 2 - raw_width / 2
    offset_y = raw_height / 2 - (trim_y + height / 2)
    half_width, half_height = width / 2, height / 2

    data = json.loads(meta_path.read_text(encoding="utf-8"))
    sprite = data["subMetas"]["f9941"]["userData"]
    sprite.update(
        {
            "offsetX": offset_x,
            "offsetY": offset_y,
            "trimX": trim_x,
            "trimY": trim_y,
            "width": width,
            "height": height,
            "rawWidth": raw_width,
            "rawHeight": raw_height,
            "vertices": {
                "rawPosition": [
                    -half_width,
                    -half_height,
                    0,
                    half_width,
                    -half_height,
                    0,
                    -half_width,
                    half_height,
                    0,
                    half_width,
                    half_height,
                    0,
                ],
                "indexes": [0, 1, 2, 2, 1, 3],
                "uv": [
                    trim_x,
                    bottom,
                    right,
                    bottom,
                    trim_x,
                    trim_y,
                    right,
                    trim_y,
                ],
                "nuv": [
                    trim_x / raw_width,
                    trim_y / raw_height,
                    right / raw_width,
                    trim_y / raw_height,
                    trim_x / raw_width,
                    bottom / raw_height,
                    right / raw_width,
                    bottom / raw_height,
                ],
                "minPos": [-half_width, -half_height, 0],
                "maxPos": [half_width, half_height, 0],
            },
        }
    )
    meta_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {meta_path}: bounds={bounds}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
