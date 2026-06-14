#!/usr/bin/env python3
"""压缩 assets/resources/art/ui 与 BGM，控制微信主包 native 体积。"""
from __future__ import annotations

import io
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UI_ROOT = ROOT / "assets" / "resources" / "art" / "ui"
BACKUP_SUFFIX = ".pngbak"

# 规格见 specs/260603-ui-entry/ui-asset-checklist.md
BACKGROUND_SPECS: dict[str, tuple[int, int]] = {
    "backgrounds/bg_lobby.png": (1334, 750),
    "backgrounds/bg_room.png": (1334, 750),
    "backgrounds/bg_board.png": (1334, 750),
    "backgrounds/bg_settlement.png": (1334, 750),
}

PANEL_SPECS: dict[str, int] = {
    "settlement/panel_settlement_main_9s.png": 128,
}

ROOM_RGBA_SPECS: dict[str, dict] = {
    "room/panel_room_main_9s.png": {
        "size": (920, 560),
        "colors": 128,
        "max_kb": 88,
        "slice_lr": 29,
        "slice_tb": 26,
    },
    "room/card_room_player_ready.png": {"size": (280, 172), "colors": 96, "max_kb": 32},
    "room/card_room_player_empty.png": {"size": (280, 172), "colors": 96, "max_kb": 32},
}

EXTRA_RGBA_SPECS: dict[str, dict] = {
    "lobby/logo_game.png": {"size": (520, 180), "colors": 128, "max_kb": 28},
    "board/panels/panel_board_modal_9s.png": {"size": None, "colors": 128, "max_kb": 28},
    "lobby/panel_lobby_main_9s.png": {"size": None, "colors": 128, "max_kb": 18},
}

BATCH_MIN_KB = 16
BATCH_COLORS = 96
BATCH_DIRS = ("board/cells", "board/panels", "board/buttons", "board/pawns", "icons")

PALETTE_COLORS_BG = 128
PALETTE_COLORS_BG_LOBBY = 64
MAX_BG_KB = 280
MAX_BG_LOBBY_KB = 140
MAX_BG_BOARD_KB = 130
MAX_BG_ROOM_KB = 220


def kb(path: Path) -> float:
    return path.stat().st_size / 1024


def backup_once(src: Path) -> None:
    bak = src.with_name(src.name + BACKUP_SUFFIX)
    if not bak.exists():
        shutil.copy2(src, bak)
        print(f"  backup -> {bak.relative_to(ROOT)}")


def flatten_rgb(im: Image.Image) -> Image.Image:
    if im.mode == "RGBA":
        bg = Image.new("RGB", im.size, (12, 16, 28))
        bg.paste(im, mask=im.split()[3])
        return bg
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def save_quantized_png(im: Image.Image, dest: Path, colors: int) -> None:
    if im.mode == "RGBA":
        quantized = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    else:
        quantized = flatten_rgb(im).quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    buf = io.BytesIO()
    quantized.save(buf, format="PNG", optimize=True, compress_level=9)
    dest.write_bytes(buf.getvalue())


def save_quantized_capped(im: Image.Image, dest: Path, colors: int, max_kb: float) -> None:
    cur = colors
    while cur >= 32:
        save_quantized_png(im, dest, cur)
        if kb(dest) <= max_kb:
            return
        cur = max(32, cur // 2)
    save_quantized_png(im, dest, 32)


def update_sprite_meta(
    meta_path: Path,
    w: int,
    h: int,
    *,
    slice_lr: int | None = None,
    slice_tb: int | None = None,
) -> None:
    if not meta_path.is_file():
        return
    data = json.loads(meta_path.read_text(encoding="utf-8"))
    sf = data.get("subMetas", {}).get("f9941", {}).get("userData")
    if not sf:
        return
    half_w, half_h = w / 2, h / 2
    sf["width"] = w
    sf["height"] = h
    sf["rawWidth"] = w
    sf["rawHeight"] = h
    sf["trimX"] = 0
    sf["trimY"] = 0
    sf["offsetX"] = 0
    sf["offsetY"] = 0
    if slice_lr is not None and slice_tb is not None:
        sf["borderLeft"] = slice_lr
        sf["borderRight"] = slice_lr
        sf["borderTop"] = slice_tb
        sf["borderBottom"] = slice_tb
    sf["vertices"] = {
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
    }
    meta_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def compress_background(rel: str, target_size: tuple[int, int], *, palette: int, max_kb: float) -> None:
    src = UI_ROOT / rel
    if not src.exists():
        print(f"[skip] missing {rel}")
        return
    before = kb(src)
    backup_once(src)
    im = Image.open(src)
    im = flatten_rgb(im)
    if im.size != target_size:
        im = im.resize(target_size, Image.Resampling.LANCZOS)
    save_quantized_capped(im, src, palette, max_kb)
    after = kb(src)
    print(f"[bg] {rel}: {before:.0f} KB -> {after:.0f} KB ({im.size[0]}x{im.size[1]})")


def compress_rgba_spec(rel: str, spec: dict) -> None:
    src = UI_ROOT / rel
    if not src.exists():
        print(f"[skip] missing {rel}")
        return
    before = kb(src)
    backup_once(src)
    im = Image.open(src).convert("RGBA")
    target = spec.get("size")
    if target and im.size != target:
        im = im.resize(target, Image.Resampling.LANCZOS)
    save_quantized_capped(im, src, int(spec["colors"]), float(spec["max_kb"]))
    after = kb(src)
    w, h = im.size
    update_sprite_meta(
        src.with_suffix(".png.meta"),
        w,
        h,
        slice_lr=spec.get("slice_lr"),
        slice_tb=spec.get("slice_tb"),
    )
    print(f"[ui] {rel}: {before:.0f} KB -> {after:.0f} KB ({w}x{h})")


def batch_compress_dir(rel_dir: str) -> None:
    folder = UI_ROOT / rel_dir
    if not folder.is_dir():
        return
    skip = set(ROOM_RGBA_SPECS) | set(EXTRA_RGBA_SPECS) | set(PANEL_SPECS)
    for src in sorted(folder.rglob("*.png")):
        rel = src.relative_to(UI_ROOT).as_posix()
        if rel in skip or kb(src) < BATCH_MIN_KB:
            continue
        before = kb(src)
        backup_once(src)
        im = Image.open(src).convert("RGBA")
        save_quantized_capped(im, src, BATCH_COLORS, before * 0.55)
        after = kb(src)
        if after < before - 0.5:
            print(f"[batch] {rel}: {before:.0f} KB -> {after:.0f} KB")


def compress_bgm() -> None:
    script = ROOT / "scripts" / "compress-bgm-main.js"
    if not script.exists():
        print("[skip] compress-bgm-main.js missing")
        return
    print("[bgm] compressing bgm_main.mp3 …")
    try:
        subprocess.run(["node", str(script)], check=True, cwd=str(ROOT))
    except (subprocess.CalledProcessError, FileNotFoundError) as err:
        print(f"[bgm] skip — {err}")


def main() -> None:
    print("compress-ui-large-assets")
    for rel, size in BACKGROUND_SPECS.items():
        if rel == "backgrounds/bg_lobby.png":
            compress_background(rel, size, palette=PALETTE_COLORS_BG_LOBBY, max_kb=MAX_BG_LOBBY_KB)
        elif rel == "backgrounds/bg_board.png":
            compress_background(rel, size, palette=PALETTE_COLORS_BG_LOBBY, max_kb=MAX_BG_BOARD_KB)
        elif rel == "backgrounds/bg_room.png":
            compress_background(rel, size, palette=PALETTE_COLORS_BG, max_kb=MAX_BG_ROOM_KB)
        else:
            compress_background(rel, size, palette=PALETTE_COLORS_BG, max_kb=MAX_BG_KB)
    for rel, colors in PANEL_SPECS.items():
        compress_rgba_spec(rel, {"colors": colors, "max_kb": 28})
    for rel, spec in ROOM_RGBA_SPECS.items():
        compress_rgba_spec(rel, spec)
    for rel, spec in EXTRA_RGBA_SPECS.items():
        compress_rgba_spec(rel, spec)
    for rel_dir in BATCH_DIRS:
        batch_compress_dir(rel_dir)
    compress_bgm()
    print("done — 请在 Cocos Creator 刷新 resources 并重新构建 wechatgame，再 npm run patch:wechat")


if __name__ == "__main__":
    main()
