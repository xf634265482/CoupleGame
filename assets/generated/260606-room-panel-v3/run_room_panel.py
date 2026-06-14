#!/usr/bin/env python3
"""Regenerate room main panel: crisp 9-slice frame + transparent center."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
REF = ROOT / "assets/generated/260606-room-ui-v2/ref_room.png"
OUT = Path(__file__).resolve().parent / "out"
WORK = Path(__file__).resolve().parent / "work"

cmd = [
    sys.executable,
    str(API),
    "gemini-generate-content",
    "--text",
    (
        "Generate ONE game UI asset: wide horizontal room lobby panel FRAME ONLY for mobile landscape casual fantasy board game. "
        "Ornate polished silver-white metal border with gold filigree corners and small blue gems, crisp beveled detail. "
        "CRITICAL: inner area ~75% of canvas must be FULLY TRANSPARENT alpha=0 — only border ring, NO opaque center fill. "
        "Border thickness ~52px. No text, no player cards, no buttons. PNG with alpha channel."
    ),
    "--generation-config",
    '{"responseModalities":["TEXT","IMAGE"],"imageConfig":{"aspectRatio":"16:9","imageSize":"2K"}}',
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
]
raise SystemExit(subprocess.call(cmd))
