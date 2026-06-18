from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from common import GENERATED_DIR, ROOT, read_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a PVE batch contact sheet.")
    parser.add_argument("--batch", required=True)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--tile", type=int, default=280)
    return parser.parse_args()


def contain(image: Image.Image, size: int) -> Image.Image:
    copy = image.convert("RGBA")
    copy.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (29, 34, 39, 255))
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    canvas.alpha_composite(copy, (x, y))
    return canvas


def main() -> int:
    args = parse_args()
    batch_dir = GENERATED_DIR / args.batch
    batch = read_json(batch_dir / "batch.json")
    jobs = [job for job in batch["jobs"] if job["status"] == "succeeded"]
    if not jobs:
        raise RuntimeError("The batch has no successful images.")

    columns = max(1, args.columns)
    tile = max(160, args.tile)
    label_height = 58
    gap = 12
    rows = math.ceil(len(jobs) / columns)
    width = gap + columns * (tile + gap)
    height = gap + rows * (tile + label_height + gap)
    sheet = Image.new("RGB", (width, height), (14, 20, 25))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)

    for index, job in enumerate(jobs):
        row, column = divmod(index, columns)
        x = gap + column * (tile + gap)
        y = gap + row * (tile + label_height + gap)
        image_path = ROOT / job["output"]
        with Image.open(image_path) as image:
            preview = contain(image, tile)
        sheet.paste(preview.convert("RGB"), (x, y))
        label = f"{index + 1:02d}  {job['assetId']}  v{job['variant']}"
        draw.rectangle(
            (x, y + tile, x + tile, y + tile + label_height),
            fill=(24, 31, 37),
        )
        draw.text(
            (x + 8, y + tile + 10),
            label,
            fill=(236, 211, 151),
            font=font,
        )

    out = batch_dir / "contact-sheet.png"
    sheet.save(out, optimize=True)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

