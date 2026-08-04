"""
AI-based background cutout for AI-generated art assets.

Usage:
  python scripts/cutout_alpha.py <input> <output.png> [--size 128]

- Uses rembg (isnet-general-use) which preserves soft semi-transparent edges
  on glow/halo/aura better than chroma-key.
- Trims to subject bbox + 4% padding before resizing to keep silhouette big.
- Saves PNG with alpha channel.
"""
import argparse
import io
from pathlib import Path

from PIL import Image
from rembg import new_session, remove


def cutout(input_path: Path, output_path: Path, size: int | None) -> None:
    src = Image.open(input_path).convert("RGBA")
    session = new_session("isnet-general-use")
    cut = remove(src, session=session)

    bbox = cut.getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        w, h = x1 - x0, y1 - y0
        pad = int(max(w, h) * 0.04)
        x0 = max(0, x0 - pad)
        y0 = max(0, y0 - pad)
        x1 = min(cut.width, x1 + pad)
        y1 = min(cut.height, y1 + pad)
        cut = cut.crop((x0, y0, x1, y1))

        side = max(cut.width, cut.height)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(cut, ((side - cut.width) // 2, (side - cut.height) // 2))
        cut = canvas

    if size:
        cut = cut.resize((size, size), Image.LANCZOS)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cut.save(output_path, "PNG", optimize=True)
    print(f"Saved {output_path} ({cut.size[0]}x{cut.size[1]}, {output_path.stat().st_size} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("output")
    ap.add_argument("--size", type=int, default=128)
    args = ap.parse_args()
    cutout(Path(args.input), Path(args.output), args.size)


if __name__ == "__main__":
    main()
