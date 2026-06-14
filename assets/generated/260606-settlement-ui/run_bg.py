#!/usr/bin/env python3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/resources/art/ui/backgrounds/bg_board.png"
OUT = Path(__file__).resolve().parent / "bg"
WORK = Path(__file__).resolve().parent / "work_bg"

cmd = [
    sys.executable,
    str(API),
    "gemini-generate-content",
    "--text",
    (
        "Generate ONE 16:9 landscape mobile game background for a board game SETTLEMENT / results screen. "
        "Match the cozy fantasy party board game style of the reference: warm lighting, illustrated "
        "environment, readable empty center area for UI panel overlay, slightly darker celebratory mood "
        "with subtle confetti or golden light rays, no text, no UI elements, no characters blocking center."
    ),
    "--generation-config",
    '{"responseModalities":["TEXT","IMAGE"],"imageConfig":{"aspectRatio":"16:9","imageSize":"2K"}}',
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
]
raise SystemExit(subprocess.call(cmd))
