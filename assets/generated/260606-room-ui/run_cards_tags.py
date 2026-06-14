#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF_BTN = ROOT / "assets/resources/art/ui/lobby/btn_lobby_create_9s.png"
REF_PANEL = ROOT / "assets/resources/art/ui/lobby/panel_lobby_main_9s.png"
OUT = Path(__file__).resolve().parent / "gen_cards"
WORK = Path(__file__).resolve().parent / "work_cards"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "4 mobile game room UI pieces matching reference lobby button/panel style about 90%: "
        "dark navy fantasy casual board game UI, blue gradient accents, corner rivets, soft bevel, "
        "hand-painted chunky look, transparent background, NO text labels. "
        "1) empty player seat card 260x160 ratio wide rectangle, dim grey-blue empty slot with dashed inner frame and plus icon silhouette. "
        "2) filled player seat card same size, brighter blue-teal panel with golden border glow for ready player. "
        "3) small host badge 120x48 wide pill, gold crown icon area, warm orange-gold gradient. "
        "4) small AI bot badge 120x48 wide pill, purple-cyan gradient with robot chip icon area."
    ),
    "--template-config",
    '{"target_count":4,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF_BTN),
    "--reference-files",
    str(REF_PANEL),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "room_cards",
]
raise SystemExit(subprocess.call(cmd))
