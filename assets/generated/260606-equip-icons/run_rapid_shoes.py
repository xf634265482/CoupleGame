#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/resources/art/ui/board/cells/cell_gold.png"
OUT = Path(__file__).resolve().parent / "out1b"
WORK = Path(__file__).resolve().parent / "w1b"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "1 game item icon: cyan lightning fast running sneakers inside rounded square "
        "weathered grey stone frame, hand-painted chunky mobile game style matching reference."
    ),
    "--template-config",
    '{"target_count":1,"hd_remove_bg_mode":"single"}',
    "--reference-file",
    str(REF),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "rapid_shoes",
]
raise SystemExit(subprocess.call(cmd))
