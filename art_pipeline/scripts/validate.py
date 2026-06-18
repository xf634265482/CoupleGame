from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from PIL import Image

from common import (
    GENERATED_DIR,
    ROOT,
    STYLE_PATH,
    asset_map,
    load_manifest,
    read_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate generated PVE art.")
    parser.add_argument("--batch")
    parser.add_argument("--paths", nargs="*")
    parser.add_argument("--strict-outline", action="store_true")
    return parser.parse_args()


def alpha_boundary_dark_ratio(image: Image.Image) -> float | None:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    boundary: list[tuple[int, int, int]] = []
    for y in range(1, height - 1):
        for x in range(1, width - 1):
            r, g, b, a = pixels[x, y]
            if a < 96:
                continue
            if any(
                pixels[nx, ny][3] < 32
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            ):
                boundary.append((r, g, b))
    if not boundary:
        return None
    dark = sum((r * 0.2126 + g * 0.7152 + b * 0.0722) < 105 for r, g, b in boundary)
    return dark / len(boundary)


def validate_image(
    path: Path,
    asset: dict[str, Any],
    minimum_outline_ratio: float,
) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not path.exists():
        return [f"missing file: {path}"], warnings

    try:
        with Image.open(path) as image:
            image.load()
            if image.format != "PNG":
                errors.append("not a PNG")
            if asset["transparent"]:
                if image.mode not in ("RGBA", "LA", "PA"):
                    errors.append("transparent asset has no alpha channel")
                else:
                    alpha = image.convert("RGBA").getchannel("A")
                    extrema = alpha.getextrema()
                    if extrema == (255, 255):
                        errors.append("transparent asset is completely opaque")
                    if extrema == (0, 0):
                        errors.append("transparent asset is completely empty")
            if asset.get("requiresOutline") and asset["transparent"]:
                ratio = alpha_boundary_dark_ratio(image)
                if ratio is None:
                    warnings.append("outline heuristic found no alpha boundary")
                elif ratio < minimum_outline_ratio:
                    warnings.append(
                        f"dark outline boundary ratio {ratio:.2f} "
                        f"is below {minimum_outline_ratio:.2f}"
                    )
    except Exception as exc:
        errors.append(f"unreadable image: {exc}")
    return errors, warnings


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    assets = asset_map(manifest)
    style = read_json(STYLE_PATH)
    minimum_outline_ratio = float(style["outline"]["minimumBoundaryDarkRatio"])
    targets: list[tuple[Path, dict[str, Any], str]] = []

    if args.batch:
        batch = read_json(GENERATED_DIR / args.batch / "batch.json")
        for job in batch["jobs"]:
            if job["status"] == "succeeded":
                targets.append((ROOT / job["output"], assets[job["assetId"]], job["assetId"]))
    if args.paths:
        by_production = {
            asset["productionPath"].replace("\\", "/"): asset
            for asset in manifest["assets"]
        }
        for raw_path in args.paths:
            path = Path(raw_path)
            if not path.is_absolute():
                path = ROOT / path
            relative = path.resolve().relative_to(ROOT.resolve()).as_posix()
            asset = by_production.get(relative)
            if not asset:
                raise ValueError(f"Path is not registered in PVE manifest: {relative}")
            targets.append((path, asset, asset["id"]))
    if not targets:
        raise ValueError("Use --batch or --paths.")

    error_count = 0
    warning_count = 0
    for path, asset, label in targets:
        errors, warnings = validate_image(path, asset, minimum_outline_ratio)
        if errors:
            error_count += len(errors)
            print(f"ERROR {label}: {'; '.join(errors)}")
        if warnings:
            warning_count += len(warnings)
            print(f"WARN  {label}: {'; '.join(warnings)}")
        if not errors and not warnings:
            print(f"OK    {label}")
    print(f"Validation: {error_count} errors, {warning_count} warnings.")
    if error_count or (args.strict_outline and warning_count):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

