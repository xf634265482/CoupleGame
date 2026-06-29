from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Add a solid outer outline behind an RGBA asset without repainting its interior."
    )
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--radius", type=int, required=True)
    parser.add_argument("--color", default="#17243A")
    return parser.parse_args()


def parse_hex_color(value: str) -> tuple[int, int, int]:
    text = value.removeprefix("#")
    if len(text) != 6:
        raise ValueError("outline color must be a six-digit RGB hex value")
    return tuple(int(text[i : i + 2], 16) for i in (0, 2, 4))


def apply_outline(image: Image.Image, radius: int, color: tuple[int, int, int]) -> Image.Image:
    if radius < 1:
        raise ValueError("radius must be at least 1")

    source = image.convert("RGBA")
    alpha = source.getchannel("A")
    expanded_alpha = alpha.filter(ImageFilter.MaxFilter(radius * 2 + 1))
    outline = Image.new("RGBA", source.size, (*color, 0))
    outline.putalpha(expanded_alpha)
    outline.alpha_composite(source)
    return outline


def main() -> int:
    args = parse_args()
    result = apply_outline(
        Image.open(args.input),
        args.radius,
        parse_hex_color(args.color),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.output, optimize=True)
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
