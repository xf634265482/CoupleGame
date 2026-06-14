import re
from pathlib import Path

src = Path("assets/scripts/ui/UiAssets.ts").read_text(encoding="utf-8")
uuid_map = dict(re.findall(r"'([^']+)': '([0-9a-f-]+)@f9941'", src))
native = Path("build/wechatgame/subpackages/resources/native")

critical = {
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


def kb(uuid: str) -> float:
    p = native / uuid[:2] / f"{uuid}.png"
    return p.stat().st_size / 1024 if p.exists() else 0.0


board_only = [
    k
    for k in uuid_map
    if k.startswith(("backgrounds/bg_board", "board/"))
    or k.startswith("icons/")
]
remaining = [(k, uuid_map[k].split("@")[0]) for k in board_only if uuid_map[k].split("@")[0] not in critical]
total = sum(kb(u) for _, u in remaining)
print("board+icons remaining", len(remaining), "KB", round(total))
for k, u in sorted(((kb(u), k) for k, u in remaining), reverse=True)[:12]:
    print(f"  {k[0]:6.1f} {k[1]}")

all_remaining = [
    (k, uuid_map[k].split("@")[0])
    for k in uuid_map
    if uuid_map[k].split("@")[0] not in critical
]
all_kb = sum(kb(u) for _, u in all_remaining)
print("ALL ui png remaining", len(all_remaining), "KB", round(all_kb))
print("est main if copy all remaining:", round(3657 + all_kb))
