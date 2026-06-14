#!/usr/bin/env python3
"""Check board UI assets under resources/art/ui vs UiAssets.ts BOARD_KEYS."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_ROOT = ROOT / "assets/resources/art/ui"
TS_FILE = ROOT / "assets/scripts/ui/UiAssets.ts"

BOARD_KEYS_EXPECTED = [
    "backgrounds/bg_board",
    "board/cells/cell_normal",
    "board/cells/cell_gold",
    "board/cells/cell_diamond",
    "board/cells/cell_supply",
    "board/cells/cell_waste",
    "board/cells/cell_burning",
    "board/cells/cell_event",
    "board/cells/cell_gold_shop",
    "board/cells/cell_legendary_shop",
    "board/cells/cell_final_shop",
    "board/cells/cell_lucky",
    "board/cells/cell_selected_frame",
    "board/cells/cell_region_frame_1",
    "board/cells/cell_region_frame_2",
    "board/cells/cell_region_frame_3",
    "board/buttons/btn_board_roll_9s",
    "board/buttons/btn_board_bag_9s",
    "board/buttons/btn_board_attack_9s",
    "board/buttons/btn_board_end_9s",
    "board/panels/panel_board_message_9s",
    "board/panels/card_board_player_9s",
    "board/panels/panel_board_modal_9s",
    "board/panels/panel_board_hud_9s",
    "board/pawns/pawn_player_1",
    "board/pawns/pawn_player_2",
    "board/pawns/pawn_player_3",
    "board/pawns/pawn_player_4",
    "icons/icon_gold",
    "icons/icon_diamond",
    "icons/icon_hp",
    "icons/icon_weapon_sword",
    "icons/icon_weapon_gun",
    "icons/icon_weapon_rocket",
    "icons/icon_armor_helmet",
    "icons/icon_armor_armor",
    "icons/icon_shoes_marching",
    "icons/icon_shoes_rapid",
    "icons/icon_item_dice",
    "icons/icon_item_trap",
    "icons/icon_item_medkit",
    "icons/icon_item_immunity",
    "icons/icon_item_vampire",
    "icons/icon_kill",
    "icons/icon_status_infected",
    "icons/icon_status_bounty",
    "icons/icon_status_amulet",
    "icons/icon_warning",
    "icons/icon_connected",
    "backgrounds/bg_settlement",
    "settlement/panel_settlement_main_9s",
    "settlement/rank_1",
    "settlement/rank_2",
    "settlement/rank_3",
    "settlement/tag_winner",
    "settlement/tag_defeated",
    "settlement/btn_settlement_back_9s",
    "settlement/btn_settlement_again_9s",
]


def sprite_meta(key: str) -> dict | None:
    png = UI_ROOT / f"{key}.png"
    meta = png.with_suffix(".png.meta")
    if not meta.is_file():
        return None
    data = json.loads(meta.read_text(encoding="utf-8"))
    for v in data.get("subMetas", {}).values():
        if v.get("importer") == "sprite-frame":
            ud = v.get("userData", {})
            return {
                "uuid": v.get("uuid"),
                "width": ud.get("width"),
                "height": ud.get("height"),
                "borderTop": ud.get("borderTop", 0),
                "borderBottom": ud.get("borderBottom", 0),
                "borderLeft": ud.get("borderLeft", 0),
                "borderRight": ud.get("borderRight", 0),
            }
    return None


def load_ts_uuids() -> dict[str, str]:
    text = TS_FILE.read_text(encoding="utf-8")
    block = re.search(
        r"export const UI_SPRITE_UUID: Record<string, string> = \{([\s\S]*?)\};",
        text,
    )
    if not block:
        return {}
    out: dict[str, str] = {}
    for m in re.finditer(r"'([^']+)':\s*'([^']+)'", block.group(1)):
        out[m.group(1)] = m.group(2)
    return out


def main() -> None:
    ts = load_ts_uuids()
    missing_png: list[str] = []
    uuid_mismatch: list[str] = []
    nine_slice: list[str] = []
    huge: list[str] = []

    print("=== Board UI asset check ===\n")
    for key in BOARD_KEYS_EXPECTED:
        info = sprite_meta(key)
        if not info:
            missing_png.append(key)
            print(f"[MISSING] {key} — no png/meta")
            continue
        meta_uuid = info["uuid"]
        ts_uuid = ts.get(key, "")
        if meta_uuid and ts_uuid and meta_uuid not in ts_uuid:
            uuid_mismatch.append(key)
            print(f"[UUID]    {key}\n          meta {meta_uuid}\n          ts   {ts_uuid}")
        w, h = info["width"], info["height"]
        borders = (
            info["borderTop"],
            info["borderBottom"],
            info["borderLeft"],
            info["borderRight"],
        )
        if any(borders):
            nine_slice.append(f"{key} ({w}x{h}) borders={borders}")
        if w and h and (w > 600 or h > 600):
            huge.append(f"{key} {w}x{h}")
        print(f"[OK]      {key} {w}x{h} uuid={meta_uuid}")

    print("\n--- Summary ---")
    print(f"Expected keys: {len(BOARD_KEYS_EXPECTED)}")
    print(f"Missing files: {len(missing_png)}")
    print(f"UUID mismatch: {len(uuid_mismatch)}")
    print(f"Has 9-slice borders (runtime will clear): {len(nine_slice)}")
    for line in nine_slice:
        print(f"  - {line}")
    print(f"Large source (>600px, code scales down): {len(huge)}")
    for line in huge:
        print(f"  - {line}")

    build = ROOT / "build/wechatgame"
    if build.is_dir():
        print(f"\nBuild dir: {build} (exists)")
        game_js = list(build.rglob("*.js"))
        print(f"JS chunks: {len(game_js)}")
        sample = build / "src" / "chunks" if (build / "src").is_dir() else build
        found_new = False
        found_old = False
        for p in sample.rglob("*.js") if sample.is_dir() else []:
            try:
                t = p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if "normalizeUiSpriteFrame" in t or "ensureArtCover" in t:
                found_new = True
            if "_boardZoom=1.15" in t.replace(" ", "") or "zoom 1.15" in t:
                found_old = True
        if not list(sample.rglob("*.js")) if sample.is_dir() else []:
            for p in build.rglob("index.js"):
                try:
                    t = p.read_text(encoding="utf-8", errors="ignore")[:500000]
                    if "normalizeUiSpriteFrame" in t:
                        found_new = True
                    if "1.15" in t and "boardZoom" in t.lower():
                        found_old = True
                except OSError:
                    pass
        print(f"Build contains new UI fix (normalizeUiSpriteFrame): {found_new}")
        print(f"Build still has boardZoom 1.15: {found_old}")
    else:
        print("\nBuild dir: MISSING — run Cocos WeChat build first")

    if uuid_mismatch:
        print("\nRun: python scripts/sync-ui-asset-uuids.py")
    if missing_png:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
