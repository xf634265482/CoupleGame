#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/resources/art/ui/board/cells/cell_gold.png"
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
        "6 mobile board game status/battle report icons in rounded square weathered grey stone frame, "
        "hand-painted chunky style matching reference, saturated colors, transparent bg, NO text. "
        "1) crossed swords with small skull for player kill count. "
        "2) toxic green virus cloud for infection debuff. "
        "3) golden target with coin sparkles for bounty/chosen-one mark. "
        "4) purple mystical amulet talisman with glow for auction relic buff. "
        "5) yellow warning triangle with exclamation for alert. "
        "6) green wifi/signal dot for online connected status."
    ),
    "--template-config",
    '{"target_count":6,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "status_icons",
]
raise SystemExit(subprocess.call(cmd))
