#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import shutil

try:
    from PIL import Image
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = Path.home() / "Desktop"
OUTPUT_ROOT = ROOT / "build_artifacts" / "pve-equipment-icons"
SIZE = 384
QUALITY = 82

SOURCE_TO_TIER = {
    "common": "equipment_tier1",
    "fine": "equipment_tier1",
    "rare": "equipment_tier2",
    "epic": "equipment_tier3",
    "legendary": "equipment_tier3",
}

EXPECTED_COUNTS = {
    "common": 15,
    "fine": 15,
    "rare": 15,
    "epic": 25,
    "legendary": 15,
}


def clean_output() -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    for tier in {"equipment_tier1", "equipment_tier2", "equipment_tier3"}:
        icon_dir = OUTPUT_ROOT / tier / "icons"
        icon_dir.mkdir(parents=True, exist_ok=True)


def build_one(src_path: Path, dst_path: Path) -> int:
    with Image.open(src_path) as opened:
        image = opened.convert("RGB")
        image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        image.save(dst_path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return dst_path.stat().st_size


def main() -> None:
    clean_output()
    total = 0
    total_bytes = 0

    for source_dir_name, tier in SOURCE_TO_TIER.items():
      src_dir = DESKTOP / source_dir_name
      if not src_dir.is_dir():
          raise FileNotFoundError(f"missing source dir: {src_dir}")

      files = sorted(src_dir.glob("*.jpeg"))
      expected = EXPECTED_COUNTS[source_dir_name]
      if len(files) != expected:
          raise RuntimeError(f"{source_dir_name}: expected {expected} files, got {len(files)}")

      dst_dir = OUTPUT_ROOT / tier / "icons"
      folder_bytes = 0
      for src_path in files:
          dst_path = dst_dir / f"{src_path.stem}.jpg"
          folder_bytes += build_one(src_path, dst_path)
          total += 1
      total_bytes += folder_bytes
      print(f"[ok] {source_dir_name} -> {tier}: {len(files)} files, {round(folder_bytes / 1024)} KB")

    if total != 85:
        raise RuntimeError(f"expected 85 files total, got {total}")

    print(
        f"[done] generated {total} icons at {OUTPUT_ROOT} "
        f"({round(total_bytes / 1024)} KB total, {SIZE}x{SIZE}, jpg q{QUALITY})"
    )


if __name__ == "__main__":
    main()
