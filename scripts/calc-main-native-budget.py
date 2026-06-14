#!/usr/bin/env python3
"""估算 copyCriticalNativeToMain 后主包体积。"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
src = (ROOT / "assets/scripts/ui/UiAssets.ts").read_text(encoding="utf-8")
uuid_map = dict(re.findall(r"'([^']+)': '([0-9a-f-]+)@f9941'", src))
native = ROOT / "build/wechatgame/subpackages/resources/native"

LOBBY_ROOM_BGM = {
    "61d7272b-0616-4fd0-b218-e6379344531e",
    "1201f551-924a-4b0f-b9b7-fc2c8adf1808",
    "f1a2b3c4-5678-4901-a234-567890abcdef",
    "32c676f7-3434-49a5-b02b-f96ba623c038",
    "edc5c209-6f75-4d1b-8079-9a01f2cd0695",
    "675daa6a-6531-4745-9b59-0382aede67d9",
    "51406360-308d-4024-9aa1-74d31f28135f",
    "bb37a4d7-222e-4178-9492-5c02534b599a",
    "be3ed857-affc-4056-a18c-330277e66f09",
    "3a884848-ff37-4199-b774-d15280308671",
    "ebc95ea1-0db2-4cf5-b848-a5780cd90d8d",
    "31cc810e-f907-46ab-8dd8-d8864ae357bb",
    "ee53ec4e-11c8-48f4-bc24-3d7bce7ce2f7",
}


def file_kb(uuid: str, ext: str = ".png") -> float:
    p = native / uuid[:2] / f"{uuid}{ext}"
    return p.stat().st_size / 1024 if p.exists() else 0.0


def group_kb(keys: list[str]) -> float:
    return sum(file_kb(v.split("@")[0]) for k in keys if (v := uuid_map.get(k)))


def main() -> None:
    board_keys = [k for k in uuid_map if k.startswith(("backgrounds/bg_board", "board/"))]
    icon_keys = [k for k in uuid_map if k.startswith("icons/")]
    settlement_keys = [k for k in uuid_map if k.startswith(("backgrounds/bg_settlement", "settlement/"))]

    lobby_kb = sum(file_kb(u) for u in LOBBY_ROOM_BGM if u != "f1a2b3c4-5678-4901-a234-567890abcdef")
    lobby_kb += file_kb("f1a2b3c4-5678-4901-a234-567890abcdef", ".mp3")
    board_kb = group_kb(board_keys)
    icon_kb = group_kb(icon_keys)
    settlement_kb = group_kb(settlement_keys)
    all_ui_kb = sum(file_kb(v.split("@")[0]) for v in uuid_map.values()) + file_kb(
        "f1a2b3c4-5678-4901-a234-567890abcdef", ".mp3"
    )

    base_kb = 2071
    print(f"lobby+room+bgm: {round(lobby_kb)} KB")
    print(f"board: {round(board_kb)} KB ({len(board_keys)} files)")
    print(f"icons: {round(icon_kb)} KB ({len(icon_keys)} files)")
    print(f"settlement: {round(settlement_kb)} KB ({len(settlement_keys)} files)")
    print(f"all ui+bgm: {round(all_ui_kb)} KB")
    print(f"est main lobby only: {round(base_kb + lobby_kb)} KB")
    print(f"est main + board + icons: {round(base_kb + lobby_kb + board_kb + icon_kb)} KB")
    print(f"est main ALL ui: {round(base_kb + all_ui_kb)} KB")

    no_room_bg = lobby_kb - file_kb("1201f551-924a-4b0f-b9b7-fc2c8adf1808")
    board_no_bg = board_kb - file_kb("9dab1592-e610-4b0e-8557-9b0ad3ed894c")
    exclude = {
        "backgrounds/bg_room",
        "backgrounds/bg_settlement",
    }
    exclude |= {k for k in uuid_map if k.startswith("settlement/")}
    # icons 纳入主包（与 patch MAIN_NATIVE_EXCLUDE_PREFIXES 对齐，不再排除 icons/）
    slim_kb = sum(file_kb(v.split("@")[0]) for k, v in uuid_map.items() if k not in exclude)
    slim_kb += file_kb("f1a2b3c4-5678-4901-a234-567890abcdef", ".mp3")
    print(f"slim main native (no room/board/settlement bg): {round(slim_kb)} KB")
    print(f"est main slim: {round(base_kb + slim_kb)} KB")


if __name__ == "__main__":
    main()
