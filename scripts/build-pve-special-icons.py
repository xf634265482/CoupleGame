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
OUTPUT_ROOT = ROOT / "build_artifacts" / "pve-special-icons"
SIZE = 256
QUALITY = 60

SOURCE_DIRS = {
    "boss": DESKTOP / "boss",
}

CHAPTER_BY_STEM = {
    "boss_goblin_chief_war_axe": 1,
    "boss_goblin_war_horn": 1,
    "boss_broken_king_crown": 1,
    "boss_scorpion_tail_stinger": 2,
    "boss_quicksand_greaves": 2,
    "boss_carapace_talisman": 2,
    "boss_frost_giant_greatsword": 3,
    "boss_frostplate_war_helm": 3,
    "boss_everfrost_ring": 3,
    "boss_lava_warhammer": 4,
    "boss_emberheart_breastplate": 4,
    "boss_blazering": 4,
}

EXPECTED_COUNTS = {
    "boss": 12,
}


def clean_output() -> None:
    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    for chapter in range(1, 6):
        icon_dir = OUTPUT_ROOT / f"chapter_{chapter}" / "icons"
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
    chapter_counts = {chapter: 0 for chapter in range(1, 6)}

    for source_name, source_dir in SOURCE_DIRS.items():
        if not source_dir.is_dir():
            raise FileNotFoundError(f"missing source dir: {source_dir}")

        files = sorted(source_dir.glob("*.jpeg"))
        expected = EXPECTED_COUNTS[source_name]
        if len(files) != expected:
            raise RuntimeError(f"{source_name}: expected {expected} files, got {len(files)}")

        folder_bytes = 0
        for src_path in files:
            chapter = CHAPTER_BY_STEM.get(src_path.stem)
            if chapter is None:
                raise RuntimeError(f"unmapped special icon: {src_path.name}")
            dst_path = OUTPUT_ROOT / f"chapter_{chapter}" / "icons" / f"{src_path.stem}.jpg"
            folder_bytes += build_one(src_path, dst_path)
            chapter_counts[chapter] += 1
            total += 1
        total_bytes += folder_bytes
        print(f"[ok] {source_name}: {len(files)} files, {round(folder_bytes / 1024)} KB")

    if total != 12:
        raise RuntimeError(f"expected 12 files total, got {total}")

    for chapter in range(1, 6):
        print(f"[chapter_{chapter}] {chapter_counts[chapter]} files")

    print(
        f"[done] generated {total} special icons at {OUTPUT_ROOT} "
        f"({round(total_bytes / 1024)} KB total, {SIZE}x{SIZE}, jpg q{QUALITY})"
    )


if __name__ == "__main__":
    main()
