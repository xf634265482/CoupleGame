from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

from common import (
    APPROVED_DIR,
    GENERATED_DIR,
    ROOT,
    asset_map,
    load_manifest,
    read_json,
    resolve_repo_path,
    slugify,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Promote selected PVE art variants.")
    parser.add_argument("--batch", required=True)
    parser.add_argument(
        "--select",
        required=True,
        help="Comma-separated assetId:variant pairs.",
    )
    parser.add_argument("--to-assets", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def fit_to_target(
    source: Path,
    target: Path,
    size: tuple[int, int],
    trim_alpha: bool = False,
) -> None:
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        if trim_alpha:
            alpha_box = rgba.getchannel("A").getbbox()
            if alpha_box:
                rgba = rgba.crop(alpha_box)
        rgba.thumbnail(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        x = (size[0] - rgba.width) // 2
        y = (size[1] - rgba.height) // 2
        canvas.alpha_composite(rgba, (x, y))
        target.parent.mkdir(parents=True, exist_ok=True)
        canvas.save(target, optimize=True)


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    assets = asset_map(manifest)
    batch_dir = GENERATED_DIR / args.batch
    batch = read_json(batch_dir / "batch.json")
    jobs = {
        f"{job['assetId']}:{job['variant']}": job
        for job in batch["jobs"]
        if job["status"] == "succeeded"
    }
    selections = [item.strip() for item in args.select.split(",") if item.strip()]
    if not selections:
        raise ValueError("No selections supplied.")

    for selection in selections:
        job = jobs.get(selection)
        if not job:
            raise ValueError(f"Successful batch variant not found: {selection}")
        asset = assets[job["assetId"]]
        source = ROOT / job["output"]
        approved = APPROVED_DIR / args.batch / Path(asset["productionPath"]).relative_to(
            "assets/resources/art/ui/pve"
        )
        if approved.exists() and not args.force:
            raise FileExistsError(f"Approved output exists: {approved}")
        fit_to_target(
            source,
            approved,
            tuple(asset["targetSize"]),
            bool(asset.get("trimAlpha")),
        )
        asset["status"] = "processed"
        asset["selectedVariant"] = selection
        asset["approvedPath"] = approved.relative_to(ROOT).as_posix()
        print(f"approved: {approved}")

        if args.to_assets:
            production = resolve_repo_path(asset["productionPath"])
            if production.exists() and not args.force:
                raise FileExistsError(
                    f"Production asset exists: {production}. Use --force to replace it."
                )
            production.parent.mkdir(parents=True, exist_ok=True)
            production.write_bytes(approved.read_bytes())
            print(f"assets:   {production}")

    write_json(ROOT / "art_pipeline" / "manifests" / "pve_ui.json", manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
