#!/usr/bin/env python3
"""压缩 assets/resources/art/ui 与 BGM，控制微信主包 native 体积。"""
from __future__ import annotations

import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UI_ROOT = ROOT / "assets" / "resources" / "art" / "ui"
BACKUP_ROOT = ROOT / ".asset-backups" / "compress-ui"
BACKUP_SUFFIX = ".pngbak"

# 规格见 specs/260603-ui-entry/ui-asset-checklist.md
BACKGROUND_SPECS: dict[str, tuple[int, int]] = {
    "backgrounds/bg_lobby.png": (1334, 750),
    "backgrounds/bg_room.png": (1334, 750),
    "backgrounds/bg_board.png": (1334, 750),
    "backgrounds/bg_settlement.png": (1334, 750),
}

PROTECTED_SOURCE_ASSETS = {
    "backgrounds/bg_lobby.png",
    "pve/backgrounds/bg_pve_ch1.png",
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
    # 迷雾是高频覆盖层，但天然柔和、重复铺满，适合轻度降分辨率/降色深来换主包空间。
    "pve/map/tile_fog.png": {"size": (192, 192), "colors": 128, "max_kb": 120},
    # 大厅首屏 chip：原图严重过大（图标 512×512 仅显示 58×58；9-slice 885×316）。
    # 它们进主包 critical native，是 4MB 超限的主因，必须压。图标降到 128 仍 2x 清晰；
    # 9-slice 不 resize（避免破坏边框），仅降色深。
    "pve/lobby/icon_chip_diamond.png": {"size": (128, 128), "colors": 64, "max_kb": 24},
    "pve/lobby/icon_chip_stamina.png": {"size": (128, 128), "colors": 64, "max_kb": 24},
    # terrain_rock 跨章共享（第1章 GoblinChief 召唤 + 第3章 FrostGiant 路径碰撞检测），
    # 留主包 critical。源图 512×512 / 292KB 过剩，战场显示约 60-80px。
    "pve/map/terrain_rock.png": {"size": (128, 128), "colors": 64, "max_kb": 24},
    # 第 5 层目标交互图标需要留主包避免真机红方块，但战斗格显示约 80px；
    # 源图 256×256 体积偏大，压到 128px 仍保留 2x 清晰度。
    "pve/map/icon_gunpowder_barrel.png": {"size": (128, 128), "colors": 64, "max_kb": 28},
    "pve/map/icon_blast_target.png": {"size": (128, 128), "colors": 64, "max_kb": 28},
}

BATCH_MIN_KB = 16
BATCH_COLORS = 96
BATCH_DIRS = ("board/cells", "board/panels", "board/buttons", "board/pawns", "icons")

PALETTE_COLORS_BG = 128
PALETTE_COLORS_BG_LOBBY = 64
MAX_BG_KB = 280
MAX_BG_LOBBY_KB = 120
MAX_BG_BOARD_KB = 130
MAX_BG_ROOM_KB = 220

# Chapter terrain tiles are displayed at roughly 100 px in the battle grid.
# Their original 512 px source textures dominate the chapter subpackages, so
# 256 px / indexed PNG keeps the visual detail while cutting first-load size.
CHAPTER_TERRAIN_SPECS: dict[str, dict] = {
    "chapter_3/map/terrain_freeze_wall.png": {"size": (256, 256), "colors": 128, "max_kb": 70},
    "chapter_3/map/terrain_ice_tile.png": {"size": (256, 256), "colors": 128, "max_kb": 70},
    "chapter_3/map/terrain_ice_wall.png": {"size": (256, 256), "colors": 128, "max_kb": 70},
    "chapter_3/map/terrain_shattered_ice.png": {"size": (256, 256), "colors": 128, "max_kb": 70},
}


def kb(path: Path) -> float:
    return path.stat().st_size / 1024


def backup_path(src: Path) -> Path:
    return BACKUP_ROOT / src.relative_to(ROOT).with_name(src.name + BACKUP_SUFFIX)


def backup_once(src: Path) -> None:
    bak = backup_path(src)
    if not bak.exists():
        bak.parent.mkdir(parents=True, exist_ok=True)
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


def save_quantized_png(
    im: Image.Image,
    dest: Path,
    colors: int,
    *,
    preserve_colors: tuple[tuple[int, int, int], ...] = (),
) -> None:
    if im.mode == "RGBA":
        quantized = im.quantize(colors=colors, method=Image.Quantize.FASTOCTREE)
    else:
        quantized = flatten_rgb(im).quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    if preserve_colors and im.mode != "RGBA":
        palette = quantized.getpalette()[: colors * 3]
        for index, color in enumerate(preserve_colors[:colors]):
            offset = (colors - 1 - index) * 3
            palette[offset:offset + 3] = list(color)
        palette_image = Image.new("P", (1, 1))
        palette_image.putpalette(palette + [0] * (768 - len(palette)))
        quantized = flatten_rgb(im).quantize(
            palette=palette_image,
            dither=Image.Dither.FLOYDSTEINBERG,
        )
    buf = io.BytesIO()
    quantized.save(buf, format="PNG", optimize=True, compress_level=9)
    dest.write_bytes(buf.getvalue())


def save_quantized_capped(
    im: Image.Image,
    dest: Path,
    colors: int,
    max_kb: float,
    *,
    preserve_colors: tuple[tuple[int, int, int], ...] = (),
) -> None:
    cur = colors
    while cur >= 32:
        save_quantized_png(im, dest, cur, preserve_colors=preserve_colors)
        if kb(dest) <= max_kb or cur == 32:
            return
        cur = max(32, cur // 2)


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


def compress_background(
    rel: str,
    target_size: tuple[int, int],
    *,
    palette: int,
    max_kb: float,
    preserve_colors: tuple[tuple[int, int, int], ...] = (),
) -> None:
    if rel in PROTECTED_SOURCE_ASSETS:
        print(f"[protected] keep source unchanged: {rel}")
        return
    src = UI_ROOT / rel
    if not src.exists():
        print(f"[skip] missing {rel}")
        return
    before = kb(src)
    backup_once(src)
    with Image.open(src) as opened:
        im = flatten_rgb(opened).copy()
    if im.size != target_size:
        im = im.resize(target_size, Image.Resampling.LANCZOS)
    save_quantized_capped(
        im,
        src,
        palette,
        max_kb,
        preserve_colors=preserve_colors,
    )
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


def compress_chapter_terrain(rel: str, spec: dict) -> None:
    src = ROOT / "assets" / "chapter_backgrounds" / rel
    if not src.exists():
        print(f"[skip] missing {rel}")
        return
    before = kb(src)
    backup_once(src)
    im = Image.open(src).convert("RGBA")
    target = spec["size"]
    if im.size != target:
        im = im.resize(target, Image.Resampling.LANCZOS)
    save_quantized_capped(im, src, int(spec["colors"]), float(spec["max_kb"]))
    after = kb(src)
    update_sprite_meta(src.with_suffix(".png.meta"), *im.size)
    print(f"[chapter] {rel}: {before:.0f} KB -> {after:.0f} KB ({im.size[0]}x{im.size[1]})")


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
    chapter_only = "--chapter-only" in sys.argv[1:]
    if chapter_only:
        print("compress-ui-large-assets --chapter-only")
        for rel, spec in CHAPTER_TERRAIN_SPECS.items():
            compress_chapter_terrain(rel, spec)
        print("done - refresh assets in Cocos Creator, rebuild wechatgame, then run the patch script")
        return

    print("compress-ui-large-assets")
    for rel in sorted(PROTECTED_SOURCE_ASSETS):
        print(f"[protected] excluded from source compression: {rel}")
    for rel, size in BACKGROUND_SPECS.items():
        if rel == "backgrounds/bg_board.png":
            compress_background(rel, size, palette=PALETTE_COLORS_BG_LOBBY, max_kb=MAX_BG_BOARD_KB)
        elif rel == "backgrounds/bg_room.png":
            compress_background(rel, size, palette=PALETTE_COLORS_BG, max_kb=MAX_BG_ROOM_KB)
        elif rel == "pve/backgrounds/bg_pve_ch1.png":
            # 第 1 章背景进入主包；576x1024 / 32 色约 175～205KB，可为 4MB 红线留出安全余量。
            # 红旗占图面积很小，普通全局量化会被绿色吞并，显式保留 5 档哥布林旗帜红。
            compress_background(
                rel,
                size,
                palette=PALETTE_COLORS_BG,
                max_kb=180,
                preserve_colors=(
                    (85, 25, 15),
                    (125, 35, 20),
                    (165, 48, 28),
                    (195, 65, 38),
                    (220, 90, 55),
                ),
            )
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
