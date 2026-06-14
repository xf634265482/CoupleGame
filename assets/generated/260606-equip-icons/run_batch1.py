#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/resources/art/ui/board/cells/cell_gold.png"
OUT = Path(__file__).resolve().parent / "batch1"
WORK = Path(__file__).resolve().parent / "work1"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "8 game item icons for a casual fantasy board game. "
        "Each icon: centered object inside a rounded square weathered grey stone frame "
        "with beveled edges, thick dark outline, hand-painted chunky mobile game style "
        "matching the reference about 90% similarity. Saturated functional colors. "
        "Top row left to right: silver medieval sword, blue pistol gun, orange rocket launcher, knight helmet. "
        "Bottom row: chest plate armor, brown marching boots, cyan lightning fast running shoes, two red dice. "
        "Transparent background, no text, no watermark."
    ),
    "--template-config",
    '{"target_count":8,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
]
raise SystemExit(subprocess.call(cmd))
