#!/usr/bin/env python3
"""Regenerate slim transparent room panel frame."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = ROOT / ".cursor/skills/game-assets/meowart_api.py"
OUT = Path(__file__).resolve().parent / "out"
WORK = Path(__file__).resolve().parent / "work"

cmd = [
    sys.executable,
    str(API),
    "gemini-generate-content",
    "--text",
    (
        "Generate ONE mobile game UI panel FRAME ONLY, landscape wide rectangle. "
        "Minimal clean silver metal border, thin (~32px), subtle corner accents only, "
        "NO heavy gold filigree, NO blue gems, NO checkerboard, NO gray mosaic fill. "
        "The entire inner area (75% center) must be 100% transparent PNG alpha=0 — "
        "draw ONLY the thin outer border ring, absolutely nothing inside. "
        "No text, no cards, no buttons, no background scenery."
    ),
    "--generation-config",
    '{"responseModalities":["TEXT","IMAGE"],"imageConfig":{"aspectRatio":"16:9","imageSize":"2K"}}',
    "--output-dir",
    str(OUT),
    "--work-dir",
    str(WORK),
]
raise SystemExit(subprocess.call(cmd))
