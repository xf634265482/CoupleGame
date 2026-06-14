#!/usr/bin/env python3
"""Copy generated HD icons into assets/resources/art/ui/icons/ at 96x96."""
from __future__ import annotations

import json
import shutil
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
GEN = ROOT / "assets/generated/260606-equip-icons"
DEST = ROOT / "assets/resources/art/ui/icons"
SIZE = 96

MAPPING: list[tuple[Path, str]] = [
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_00.png", "icon_weapon_sword"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_01.png", "icon_weapon_gun"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_02.png", "icon_weapon_rocket"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_03.png", "icon_armor_helmet"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_04.png", "icon_armor_armor"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_05.png", "icon_shoes_marching"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_06.png", "icon_shoes_rapid"),
    (GEN / "out1/9f7648f1-0edf-4a5e-b4e0-83e7984c6bfd/sprite_07.png", "icon_item_dice"),
    (GEN / "out2/equip_icons_b2/sprite_00.png", "icon_item_trap"),
    (GEN / "out2/equip_icons_b2/sprite_01.png", "icon_item_medkit"),
    (GEN / "out2/equip_icons_b2/sprite_02.png", "icon_item_immunity"),
    (GEN / "out2/equip_icons_b2/sprite_03.png", "icon_item_vampire"),
]


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
    DEST.mkdir(parents=True, exist_ok=True)
    for src, name in MAPPING:
        if not src.is_file():
            raise FileNotFoundError(src)
        im = Image.open(src).convert("RGBA")
        im = im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        out_png = DEST / f"{name}.png"
        im.save(out_png, optimize=True)
        meta_path = DEST / f"{name}.png.meta"
        if meta_path.is_file():
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            img_uuid = data["uuid"]
        else:
            img_uuid = str(uuid.uuid4())
            meta_path.write_text(
                json.dumps(make_meta(name, img_uuid, SIZE, SIZE), indent=2) + "\n",
                encoding="utf-8",
            )
        print(f"[OK] {name} <- {src.name} ({SIZE}x{SIZE}) uuid={img_uuid}")


if __name__ == "__main__":
    main()
