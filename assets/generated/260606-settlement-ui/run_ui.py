#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF_PANEL = ROOT / "assets/resources/art/ui/room/panel_room_main_9s.png"
REF_BTN = ROOT / "assets/resources/art/ui/room/btn_room_start_9s.png"
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
        "8 settlement/results screen UI pieces, lobby button style with rivets and bevel, transparent bg, NO text. "
        "1) large main results panel wide rectangle ornate dark blue glass frame for player list. "
        "2) gold first place medal badge with number 1. "
        "3) silver second place medal badge with number 2. "
        "4) bronze third place medal badge with number 3. "
        "5) green victory winner ribbon tag. "
        "6) grey defeated eliminated ribbon tag. "
        "7) blue back-to-lobby horizontal button. "
        "8) orange play-again horizontal button."
    ),
    "--template-config",
    '{"target_count":8,"hd_remove_bg_mode":"batch"}',
    "--reference-file",
    str(REF_BTN),
    "--reference-files",
    str(REF_PANEL),
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
    "--job-name",
    "settlement_ui",
]
raise SystemExit(subprocess.call(cmd))
