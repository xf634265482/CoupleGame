#!/usr/bin/env python3
"""Split generated sheets into game-ready PNGs under assets/resources/art/ui/."""
from __future__ import annotations

import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess
    import sys

    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "pillow", "-q"],
    )
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN = ROOT / "assets/generated/260603-ui-batch1"
ART = ROOT / "assets/resources/art/ui"


def latest_image(folder: str) -> Path:
    d = GEN / folder
    files = sorted(
        [*d.glob("*.png"), *d.glob("*.jpg"), *d.glob("*.jpeg"), *d.glob("*.webp")],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not files:
        raise FileNotFoundError(d)
    return files[0]


def crop_grid(src: Path, names: list[str], cols: int, rows: int, dest: Path) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    cw, ch = w // cols, h // rows
    dest.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        r, c = divmod(i, cols)
        box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
        tile = im.crop(box)
        # trim near-black margins
        tile.save(dest / f"{name}.png")


def crop_rows(
    src: Path,
    row_names: list[list[str]],
    dest: Path,
    *,
    row_offset: int = 0,
    total_rows: int | None = None,
) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    rows = total_rows or len(row_names)
    ch = h // rows
    dest.mkdir(parents=True, exist_ok=True)
    for r, names in enumerate(row_names):
        cols = len(names)
        cw = w // cols
        y = (row_offset + r) * ch
        for c, name in enumerate(names):
            box = (c * cw, y, (c + 1) * cw, y + ch)
            im.crop(box).save(dest / f"{name}.png")


def split_pawns(src: Path) -> None:
    names = [
        "pawn_player_1",
        "pawn_player_2",
        "pawn_player_3",
        "pawn_player_4",
    ]
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    # hd_char grid 2x2
    cw, ch = w // 2, h // 2
    dest = ART / "board/pawns"
    dest.mkdir(parents=True, exist_ok=True)
    for i, name in enumerate(names):
        r, c = divmod(i, 2)
        box = (c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)
        im.crop(box).save(dest / f"{name}.png")


def main() -> None:
    # backgrounds
    bg_map = {
        "01_bg_lobby": ("backgrounds", "bg_lobby.png"),
        "02_bg_room": ("backgrounds", "bg_room.png"),
        "03_bg_board": ("backgrounds", "bg_board.png"),
    }
    for folder, (subdir, fname) in bg_map.items():
        src = latest_image(folder)
        out = ART / subdir / fname
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src).convert("RGB")
        im = im.resize((1334, 750), Image.Resampling.LANCZOS)
        im.save(out, format="PNG", optimize=True)
        print("bg", out, im.size)

    cells = [
        "cell_normal",
        "cell_gold",
        "cell_diamond",
        "cell_supply",
        "cell_waste",
        "cell_burning",
        "cell_event",
        "cell_minigame",
        "cell_gold_shop",
        "cell_legendary_shop",
        "cell_final_shop",
        "cell_lucky",
        "cell_selected_frame",
        "cell_region_frame_1",
        "cell_region_frame_2",
        "cell_region_frame_3",
    ]
    crop_grid(latest_image("04_cells_4x4"), cells, 4, 4, ART / "board/cells")

    ui_src = latest_image("05_ui_kit")
    crop_rows(
        ui_src,
        [
            [
                "btn_board_roll_9s",
                "btn_board_bag_9s",
                "btn_board_attack_9s",
                "btn_board_map_9s",
                "btn_board_end_9s",
            ],
        ],
        ART / "board/buttons",
        row_offset=0,
        total_rows=3,
    )
    crop_rows(
        ui_src,
        [
            [
                "panel_board_hud_9s",
                "card_board_player_9s",
                "panel_board_message_9s",
                "panel_board_modal_9s",
            ],
        ],
        ART / "board/panels",
        row_offset=1,
        total_rows=3,
    )
    crop_rows(
        ui_src,
        [["icon_gold", "icon_diamond", "icon_hp"]],
        ART / "icons",
        row_offset=2,
        total_rows=3,
    )

    if (GEN / "06_pawns").exists():
        split_pawns(latest_image("06_pawns"))
        print("pawns ok")

    print("[DONE] assets under", ART)


if __name__ == "__main__":
    main()
