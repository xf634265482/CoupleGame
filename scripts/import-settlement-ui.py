#!/usr/bin/env python3
"""Import generated settlement UI into assets/resources/art/ui/."""
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
GEN = ROOT / "assets/generated/260606-settlement-ui"
GEN_UI = GEN / "out/403a77b7-7420-4667-9129-4837879f7449"
GEN_BG = GEN / "bg/candidates_0_content_parts_0_inlineData_01.jpg"
DEST_SETTLEMENT = ROOT / "assets/resources/art/ui/settlement"
DEST_BG = ROOT / "assets/resources/art/ui/backgrounds"

# (source, dest_dir, dest_name, width, height)
MAPPING: list[tuple[Path, Path, str, int, int]] = [
    (GEN_BG, DEST_BG, "bg_settlement", 1334, 750),
    (GEN_UI / "sprite_00.png", DEST_SETTLEMENT, "panel_settlement_main_9s", 760, 480),
    (GEN_UI / "sprite_01.png", DEST_SETTLEMENT, "rank_1", 80, 80),
    (GEN_UI / "sprite_02.png", DEST_SETTLEMENT, "rank_2", 80, 80),
    (GEN_UI / "sprite_03.png", DEST_SETTLEMENT, "rank_3", 80, 80),
    (GEN_UI / "sprite_04.png", DEST_SETTLEMENT, "tag_winner", 120, 48),
    (GEN_UI / "sprite_05.png", DEST_SETTLEMENT, "tag_defeated", 120, 48),
    (GEN_UI / "sprite_06.png", DEST_SETTLEMENT, "btn_settlement_back_9s", 320, 88),
    (GEN_UI / "sprite_07.png", DEST_SETTLEMENT, "btn_settlement_again_9s", 320, 88),
]


def crop_16_9(im: Image.Image) -> Image.Image:
    w, h = im.size
    target_ratio = 16 / 9
    current = w / h
    if current > target_ratio:
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    new_h = int(w / target_ratio)
    top = (h - new_h) // 2
    return im.crop((0, top, w, top + new_h))


def make_meta(name: str, img_uuid: str, w: int, h: int) -> dict:
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
                    "borderTop": 0,
                    "borderBottom": 0,
                    "borderLeft": 0,
                    "borderRight": 0,
                    "packable": True,
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
                    "trimType": "auto",
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
    DEST_SETTLEMENT.mkdir(parents=True, exist_ok=True)
    DEST_BG.mkdir(parents=True, exist_ok=True)
    for src, dest_dir, name, w, h in MAPPING:
        if not src.is_file():
            raise FileNotFoundError(src)
        im = Image.open(src).convert("RGBA")
        if name == "bg_settlement":
            im = crop_16_9(im)
        im = im.resize((w, h), Image.Resampling.LANCZOS)
        out_png = dest_dir / f"{name}.png"
        im.save(out_png, optimize=True)
        meta_path = out_png.with_suffix(".png.meta")
        if meta_path.is_file():
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            img_uuid = data["uuid"]
        else:
            img_uuid = str(uuid.uuid4())
            meta_path.write_text(
                json.dumps(make_meta(name, img_uuid, w, h), indent=2) + "\n",
                encoding="utf-8",
            )
        print(f"[OK] {dest_dir.name}/{name} ({w}x{h}) uuid={img_uuid}")


if __name__ == "__main__":
    main()
