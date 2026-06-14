#!/usr/bin/env python3
"""Generate room panel + seat cards + host tag from reference mockup."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = Path(__file__).resolve().parent / "ref_room.png"
OUT = Path(__file__).resolve().parent / "out"
WORK = Path(__file__).resolve().parent / "work"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "Match the attached reference mobile game room lobby UI mockup style closely (same fantasy casual board game look): "
        "silver ornate outer frame with gold corner filigree and blue gems, soft purple-pink translucent inner panel. "
        "Generate 4 separate transparent PNG UI pieces, NO AI/bot badge. "
        "1) Main room panel wide frame only: ornate silver-gold border with empty translucent lavender inner area for 2x2 player grid, no player cards inside. "
        "2) Empty seat card: grey riveted metal frame, desaturated fantasy landscape inside, grey blank avatar silhouette, Chinese text '空位' and dark pill '等待加入' like reference top-right empty slots. "
        "3) Joined player seat card: bright glowing blue border frame, vibrant colorful fantasy floating islands background, empty center area for character overlay, blue nameplate bar at bottom (no name text). "
        "4) Host badge small horizontal pill: blue gradient banner with golden crown icon and Chinese text '房主' like reference top-left occupied slot."
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
    "room_ui_v2",
]
raise SystemExit(subprocess.call(cmd))
