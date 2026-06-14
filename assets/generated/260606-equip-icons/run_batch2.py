#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/resources/art/ui/board/cells/cell_gold.png"
OUT = Path(__file__).resolve().parent / "out2"
WORK = Path(__file__).resolve().parent / "w2"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "4 game item icons matching reference stone-frame style. "
        "1 metal bear trap with sharp teeth, 2 white red-cross medical kit bag, "
        "3 glowing green immunity potion in glass bottle, 4 dark red vampire blood stone gem. "
        "Rounded square weathered grey stone frame, transparent bg, no text."
    ),
    "--template-config",
    '{"target_count":4,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "equip_icons_b2",
]
raise SystemExit(subprocess.call(cmd))
