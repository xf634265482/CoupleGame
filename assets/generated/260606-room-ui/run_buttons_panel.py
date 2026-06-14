#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF_BTN = ROOT / "assets/resources/art/ui/lobby/btn_lobby_create_9s.png"
REF_JOIN = ROOT / "assets/resources/art/ui/lobby/btn_lobby_join_9s.png"
OUT = Path(__file__).resolve().parent / "gen_btns"
WORK = Path(__file__).resolve().parent / "work_btns"

cmd = [
    sys.executable,
    str(API),
    "hd-gen-run",
    "--template-name",
    "cute_cartoon_icon",
    "--requirement",
    (
        "4 room page UI elements matching reference lobby buttons about 90% style: "
        "horizontal pill buttons with blue gradient, dark outline, corner rivets, beveled edges, "
        "NO text, transparent background between elements. "
        "1) start game button wide 320x88 ratio, strong red-orange gradient variant for primary action. "
        "2) invite/share button same size, bright blue gradient like reference. "
        "3) leave/exit button slightly shorter 260x76 ratio, muted grey-blue secondary style. "
        "4) large room main panel 900x560 ratio, semi-transparent dark blue glass panel with ornate border for 2x2 player grid area."
    ),
    "--template-config",
    '{"target_count":4,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF_BTN),
    "--reference-files",
    str(REF_JOIN),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "room_btns",
]
raise SystemExit(subprocess.call(cmd))
