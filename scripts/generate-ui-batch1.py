#!/usr/bin/env python3
"""Generate first-batch UI assets via MeowArt gemini + hd-gen."""
from __future__ import annotations

import base64
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".cursor/skills/game-assets"))
import meowart_api as ma  # noqa: E402

REF = ROOT / "assets/art/ui/_refs/style_reference.png"
OUT = ROOT / "assets/generated/260603-ui-batch1"

STYLE = (
    "Match the attached reference UI sheet exactly. Stylized fantasy tactical mobile game UI: "
    "painterly illustrative (not flat vector), thick hand-drawn dark outlines, chunky 3D bevels, "
    "strong rim lighting on edges, highly saturated functional colors on dark slate backgrounds. "
    "Hexagonal beveled tokens for resource icons; pill-shaped glossy action buttons with circular icon inset on the left. "
    "No text labels, no watermarks, no UI chrome outside requested assets."
)


def _api_key() -> str:
    key = ma._resolve_auth_token("", "")
    if key.startswith("x-dev-key:"):
        return key.split(":", 1)[1]
    return key


def _save_gemini(name: str, prompt: str, aspect: str, size: str = "2K") -> Path:
    out_dir = OUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    body = {
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": base64.b64encode(REF.read_bytes()).decode("ascii"),
                        }
                    },
                    {"text": f"{STYLE}\n\n{prompt}"},
                ]
            }
        ],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect, "imageSize": size},
        },
    }
    print(f"[RUN] gemini {name}", flush=True)
    payload = ma.gemini_generate_content(
        api_base=ma.DEFAULT_API_BASE,
        api_key=_api_key(),
        model=ma.DEFAULT_GEMINI_MODEL,
        contents=body["contents"],
        generation_config=body["generationConfig"],
    )
    _, downloads = ma._save_gemini_response_assets(
        payload=payload,
        output_dir=str(out_dir),
        timeout=ma.DEFAULT_TIMEOUT,
        verify=True,
        api_key=_api_key(),
    )
    images = [
        Path(d["path"])
        for d in downloads
        if str(d.get("path", "")).lower().endswith((".png", ".jpg", ".jpeg", ".webp"))
    ]
    if not images:
        raise RuntimeError(f"No image saved for {name}")
    path = images[0]
    print(f"[OK] {path}", flush=True)
    return path


def _save_hd(name: str, requirement: str, target: int = 4) -> Path:
    out_root = OUT / name
    out_root.mkdir(parents=True, exist_ok=True)
    print(f"[RUN] hd-gen {name}", flush=True)
    submit, final = ma.run_hd_gen(
        api_base=ma.DEFAULT_API_BASE,
        api_key=_api_key(),
        template_name="hd_char_1",
        requirement=requirement,
        template_config={"target_count": target, "direction": "front"},
        reference_file=str(REF),
        aspect_ratio="1:1",
        timeout=300,
    )
    status = str(final.get("status") or "").lower()
    if status != "success":
        raise RuntimeError(json.dumps(final, ensure_ascii=False)[:500])
    out_dir, downloads = ma._save_run_outputs(
        output_root=str(out_root),
        slug_seed=name,
        submit_payload=submit,
        final_payload=final,
        timeout=300,
        verify=True,
        api_key=_api_key(),
    )
    pngs = [Path(d["path"]) for d in downloads if str(d.get("path", "")).lower().endswith(".png")]
    if not pngs:
        raise RuntimeError(f"No PNG for {name}")
    path = pngs[0]
    print(f"[OK] {path}", flush=True)
    return path


JOBS: dict[str, tuple[str, str, str]] = {
    "01_bg_lobby": (
        "gemini",
        "16:9",
        "Generate ONE full game lobby background only (1334x750 landscape feel). "
        "Dark fantasy tavern-meets-tactical board game hub, warm torch glow, subtle map table, "
        "empty center for UI panels. No characters, no buttons.",
    ),
    "02_bg_room": (
        "gemini",
        "16:9",
        "Generate ONE multiplayer room waiting background. Cozy dark stone chamber with four empty pedestals, "
        "magical candles, competitive party vibe. Leave center clear for room panel.",
    ),
    "03_bg_board": (
        "gemini",
        "16:9",
        "Generate ONE in-game board scene background. Top-down stylized fantasy island map on dark void, "
        "glowing path hints, dramatic rim light, space for hex/path board in center and side HUD.",
    ),
    "04_cells_4x4": (
        "gemini",
        "1:1",
        "Generate a 4x4 grid of separate square board cell tiles on pure black, equal spacing, each ~400px. "
        "Row1: normal grey stone, gold coin sparkle, blue diamond, green supply crate. "
        "Row2: dark waste skull, orange burning flame, purple event star, cyan minigame dice. "
        "Row3: gold shop banner, legendary shop crown, final shop skull-gold, rainbow lucky clover. "
        "Row4: golden selection ring frame, red region border frame, green region border, blue region border. "
        "Each tile is a chunky beveled game token like the reference hex icons but square for board cells.",
    ),
    "05_ui_kit": (
        "gemini",
        "1:1",
        "Generate asset sheet on black, 3 rows. "
        "Row1 five pill buttons (no text): gold ROLL with die icon, blue BAG backpack, red ATTACK sword, "
        "green MAP flag, grey END flag. "
        "Row2 four panels: wide HUD bar, player card, message strip, large modal frame with corner bolts. "
        "Row3 three hex icons: gold coins, blue gem, red heart HP. "
        "Match reference button and panel style exactly.",
    ),
    "06_pawns": (
        "gemini",
        "1:1",
        "Generate 2x2 grid on black of four chibi board-game pawn tokens. "
        "Top-left red scarf explorer, top-right blue mage, bottom-left green ranger, bottom-right purple alchemist. "
        "Front view full body, chunky SD proportions, painterly style like reference. No text.",
    ),
}


def main() -> int:
    only = sys.argv[1:] if len(sys.argv) > 1 else list(JOBS.keys())
    OUT.mkdir(parents=True, exist_ok=True)
    started = datetime.now().isoformat(timespec="seconds")
    log = OUT / "run_log.txt"
    for key in only:
        if key not in JOBS:
            print(f"Unknown job: {key}", file=sys.stderr)
            return 1
        kind, aspect, prompt = JOBS[key]
        try:
            if kind == "gemini":
                _save_gemini(key, prompt, aspect)
            else:
                _save_hd(key, prompt, target=4)
            with log.open("a", encoding="utf-8") as f:
                f.write(f"{started} OK {key}\n")
        except Exception as exc:
            with log.open("a", encoding="utf-8") as f:
                f.write(f"{started} FAIL {key}: {exc}\n")
            raise
    print("[DONE]", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
