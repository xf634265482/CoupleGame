#!/usr/bin/env python3
"""Import regenerated room panel with 9-slice meta borders."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import subprocess
    import sys

    subprocess.check_call([sys.executable, "-m", "pip", "install", "pillow", "-q"])
    from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GEN_DIR = ROOT / "assets/generated/260606-room-panel-v4/out"
DEST = ROOT / "assets/resources/art/ui/room"
TARGET_W, TARGET_H = 920, 560
SLICE = 48


def _looks_like_checker(r: int, g: int, b: int) -> bool:
    if abs(r - g) > 12 or abs(g - b) > 12:
        return False
    return 130 <= r <= 245 and 130 <= g <= 245 and 130 <= b <= 245


def clear_panel_center(im: Image.Image, border: int = SLICE) -> Image.Image:
    """Only clear inner content; keep ornate border pixels from reference art."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    inner_l = border + 8
    inner_r = w - border - 8
    inner_t = border + 8
    inner_b = h - border - 8
    for y in range(inner_t, inner_b + 1):
        for x in range(inner_l, inner_r + 1):
            px[x, y] = (0, 0, 0, 0)
    return im


def find_source() -> Path:
    v2 = ROOT / "assets/generated/260606-room-ui-v2/out/room_ui_v2/sprite_00.png"
    if v2.is_file():
        return v2
    out = GEN_DIR / "room_panel_v3"
    if out.is_dir():
        for name in ("sprite_00.png", "sprite_00.jpg"):
            p = out / name
            if p.is_file():
                return p
    for pattern in ("**/sprite_00.png", "candidates_*_inlineData_*.jpg", "candidates_*_inlineData_*.png", "*.png"):
        hits = sorted(GEN_DIR.rglob(pattern))
        if hits:
            return hits[0]
    raise FileNotFoundError(f"No generated image under {GEN_DIR}")


def make_meta(name: str, img_uuid: str, w: int, h: int, slice_px: int) -> dict:
    half_w, half_h = w / 2, h / 2
    return {
        "ver": "1.0.27",
        "importer": "image",
        "imported": True,
        "uuid": img_uuid,
        "files": [".json", ".png"],
        "subMetas": {
            "6c48a": {
                "importer": "texture",
                "uuid": f"{img_uuid}@6c48a",
                "displayName": name,
                "id": "6c48a",
                "name": "texture",
                "userData": {
                    "wrapModeS": "clamp-to-edge",
                    "wrapModeT": "clamp-to-edge",
                    "imageUuidOrDatabaseUri": img_uuid,
                    "isUuid": True,
                    "visible": False,
                    "minfilter": "linear",
                    "magfilter": "linear",
                    "mipfilter": "none",
                    "anisotropy": 0,
                },
                "ver": "1.0.22",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
            "f9941": {
                "importer": "sprite-frame",
                "uuid": f"{img_uuid}@f9941",
                "displayName": name,
                "id": "f9941",
                "name": "spriteFrame",
                "userData": {
                    "trimThreshold": 1,
                    "rotated": False,
                    "offsetX": 0,
                    "offsetY": 0,
                    "trimX": 0,
                    "trimY": 0,
                    "width": w,
                    "height": h,
                    "rawWidth": w,
                    "rawHeight": h,
                    "borderTop": slice_px,
                    "borderBottom": slice_px,
                    "borderLeft": slice_px,
                    "borderRight": slice_px,
                    "packable": False,
                    "pixelsToUnit": 100,
                    "pivotX": 0.5,
                    "pivotY": 0.5,
                    "meshType": 0,
                    "vertices": {
                        "rawPosition": [
                            -half_w,
                            -half_h,
                            0,
                            half_w,
                            -half_h,
                            0,
                            -half_w,
                            half_h,
                            0,
                            half_w,
                            half_h,
                            0,
                        ],
                        "indexes": [0, 1, 2, 2, 1, 3],
                        "uv": [0, h, w, h, 0, 0, w, 0],
                        "nuv": [0, 0, 1, 0, 0, 1, 1, 1],
                        "minPos": [-half_w, -half_h, 0],
                        "maxPos": [half_w, half_h, 0],
                    },
                    "isUuid": True,
                    "imageUuidOrDatabaseUri": f"{img_uuid}@6c48a",
                    "atlasUuid": "",
                    "trimType": "none",
                },
                "ver": "1.0.12",
                "imported": True,
                "files": [".json"],
                "subMetas": {},
            },
        },
        "userData": {
            "type": "sprite-frame",
            "fixAlphaTransparencyArtifacts": False,
            "hasAlpha": True,
            "redirect": f"{img_uuid}@6c48a",
        },
    }


def main() -> None:
    src = find_source()
    im = Image.open(src).convert("RGBA")
    im = im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)
    im = clear_panel_center(im, SLICE)
    name = "panel_room_main_9s"
    out_png = DEST / f"{name}.png"
    DEST.mkdir(parents=True, exist_ok=True)
    im.save(out_png, optimize=True)
    meta_path = out_png.with_suffix(".png.meta")
    if meta_path.is_file():
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        img_uuid = data["uuid"]
        data = make_meta(name, img_uuid, TARGET_W, TARGET_H, SLICE)
    else:
        img_uuid = str(uuid.uuid4())
        data = make_meta(name, img_uuid, TARGET_W, TARGET_H, SLICE)
    meta_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] {name} ({TARGET_W}x{TARGET_H}) slice={SLICE} uuid={img_uuid} from {src.name}")


if __name__ == "__main__":
    main()
