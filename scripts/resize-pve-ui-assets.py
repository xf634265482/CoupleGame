"""
Resize & compress PVE UI assets to match UI_SIZE_SPEC.md (2x design coords).
Run from project root: python scripts/resize-pve-ui-assets.py
"""
from pathlib import Path
from PIL import Image

BASE = Path(__file__).parent.parent / "assets/resources/art/ui/pve"

# (relative_path, target_w, target_h, resize_mode)
# resize_mode: "fit" = scale+center-pad transparent  |  "stretch" = direct resize
TARGETS = [
    # HUD buttons: design 110x60 → 2x = 220x120
    ("hud/btn_pve_attack.png",      220, 120, "fit"),
    ("hud/btn_pve_end_turn.png",    220, 120, "fit"),
    ("hud/btn_pve_interact.png",    220, 120, "fit"),
    # HUD data icons: design 28x28 → 2x = 56x56
    ("icons/icon_hud_hp.png",       56,  56,  "fit"),
    ("icons/icon_hud_ap.png",       56,  56,  "fit"),
    ("icons/icon_hud_attack.png",   56,  56,  "fit"),
    # HUD currency icons: design 24x24 → 2x = 48x48
    ("icons/icon_hud_gold.png",     48,  48,  "fit"),
    ("icons/icon_hud_anima.png",    48,  48,  "fit"),
    ("icons/icon_hud_key.png",      48,  48,  "fit"),
    # Map entity icons: design 53x53 → 2x ≈ 106x106
    ("map/icon_player.png",         106, 106, "fit"),
    ("map/icon_monster_normal.png", 106, 106, "fit"),
    ("map/icon_monster_elite.png",  106, 106, "fit"),
    ("map/icon_monster_anima.png",  106, 106, "fit"),
    # Boss icon: design 112x112 → 2x = 224x224
    ("map/icon_monster_boss.png",   224, 224, "fit"),
    # Entity interaction icons: design 42x42 → 2x = 84x84
    ("map/icon_chest.png",          84,  84,  "fit"),
    ("map/icon_exit.png",           84,  84,  "fit"),
    ("map/icon_key.png",            84,  84,  "fit"),
    # Map tiles: design 70x70 → 2x = 140x140
    ("map/tile_floor_ch1.png",      140, 140, "stretch"),
    ("map/tile_fog.png",            140, 140, "stretch"),
    ("map/tile_selected_frame.png", 140, 140, "stretch"),
    ("map/mark_move_range.png",     140, 140, "stretch"),
    ("map/mark_attack_range.png",   140, 140, "stretch"),
]


def resize_image(src: Path, tw: int, th: int, mode: str) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    sw, sh = img.size

    if mode == "stretch":
        return img.resize((tw, th), Image.LANCZOS)

    # "fit": scale to fit inside (tw, th), center on transparent canvas
    scale = min(tw / sw, th / sh)
    new_w = int(sw * scale)
    new_h = int(sh * scale)
    scaled = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    off_x = (tw - new_w) // 2
    off_y = (th - new_h) // 2
    canvas.paste(scaled, (off_x, off_y))
    return canvas


def main():
    results = []
    for rel, tw, th, mode in TARGETS:
        src = BASE / rel
        if not src.exists():
            results.append(f"  SKIP (not found) {rel}")
            continue
        before_kb = src.stat().st_size / 1024
        img_out = resize_image(src, tw, th, mode)
        # Save with max compression (PNG level 9), no metadata
        img_out.save(src, "PNG", optimize=True, compress_level=9)
        after_kb = src.stat().st_size / 1024
        results.append(
            f"  OK {rel:<45} {tw}x{th}  {before_kb:>7.1f}KB -> {after_kb:>6.1f}KB"
        )

    print("\n=== PVE UI Asset Resize & Compress ===")
    for r in results:
        print(r)
    print("\nDone. Popup files (already correct size) were skipped.")


if __name__ == "__main__":
    main()
