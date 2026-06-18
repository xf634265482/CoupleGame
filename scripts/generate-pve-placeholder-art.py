from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable, Tuple

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "resources" / "art" / "ui" / "pve"

Color = Tuple[int, int, int, int]


INK: Color = (14, 18, 31, 255)
OUTLINE: Color = (9, 11, 18, 255)
STONE: Color = (45, 52, 72, 255)
STONE_2: Color = (31, 40, 55, 255)
TEAL: Color = (58, 224, 216, 255)
TEAL_DIM: Color = (40, 140, 156, 210)
GOLD: Color = (224, 171, 65, 255)
RED: Color = (220, 70, 70, 255)
VIOLET: Color = (94, 76, 146, 255)
ICE: Color = (118, 212, 242, 255)
LAVA: Color = (236, 91, 42, 255)
WHITE: Color = (225, 238, 248, 255)
TRANSPARENT: Color = (0, 0, 0, 0)


def ensure_dirs() -> None:
    for name in ("map", "icons", "hud", "popup"):
        (OUT / name).mkdir(parents=True, exist_ok=True)


def save(img: Image.Image, rel: str) -> None:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def glow(size: Tuple[int, int], shapes: Iterable[Tuple[str, Tuple[int, ...], Color]], blur: int = 10) -> Image.Image:
    layer = Image.new("RGBA", size, TRANSPARENT)
    d = ImageDraw.Draw(layer)
    for kind, box, color in shapes:
        if kind == "ellipse":
            d.ellipse(box, fill=color)
        elif kind == "rounded":
            d.rounded_rectangle(box, radius=max(4, min(size) // 8), fill=color)
        elif kind == "polygon":
            pts = [(box[i], box[i + 1]) for i in range(0, len(box), 2)]
            d.polygon(pts, fill=color)
    return layer.filter(ImageFilter.GaussianBlur(blur))


def rounded_panel(size: Tuple[int, int], radius: int, fill: Color, outline: Color, width: int = 6) -> Image.Image:
    img = Image.new("RGBA", size, TRANSPARENT)
    d = ImageDraw.Draw(img)
    pad = width // 2 + 2
    d.rounded_rectangle((pad, pad, size[0] - pad, size[1] - pad), radius=radius, fill=fill, outline=outline, width=width)
    d.rounded_rectangle((pad + width, pad + width, size[0] - pad - width, size[1] - pad - width), radius=max(2, radius - width), outline=(95, 225, 220, 110), width=max(2, width // 2))
    return img


def tile_base(fill: Color, accent: Color) -> Image.Image:
    size = (140, 140)
    img = Image.new("RGBA", size, TRANSPARENT)
    img.alpha_composite(glow(size, [("rounded", (20, 20, 120, 120), accent)], 12))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((14, 14, 126, 126), radius=22, fill=OUTLINE)
    d.rounded_rectangle((22, 20, 120, 118), radius=18, fill=fill, outline=(78, 95, 119, 255), width=4)
    d.line((30, 42, 110, 34), fill=(255, 255, 255, 28), width=3)
    d.line((35, 92, 105, 102), fill=(0, 0, 0, 40), width=4)
    for x, y in ((40, 44), (96, 52), (62, 96)):
        d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=accent)
    return img


def make_tiles() -> None:
    save(tile_base((25, 38, 54, 255), TEAL_DIM), "map/tile_floor_ch1.png")

    fog = Image.new("RGBA", (140, 140), TRANSPARENT)
    fog.alpha_composite(tile_base((20, 26, 43, 245), (51, 175, 190, 160)))
    d = ImageDraw.Draw(fog, "RGBA")
    for cx, cy, r, a in ((56, 58, 30, 90), (84, 70, 34, 80), (65, 86, 28, 70)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(84, 136, 159, a))
    fog = fog.filter(ImageFilter.GaussianBlur(1))
    save(fog, "map/tile_fog.png")

    frame = Image.new("RGBA", (140, 140), TRANSPARENT)
    frame.alpha_composite(glow((140, 140), [("rounded", (12, 12, 128, 128), (58, 224, 216, 180))], 8))
    d = ImageDraw.Draw(frame)
    d.rounded_rectangle((13, 13, 127, 127), radius=24, outline=TEAL, width=8)
    d.rounded_rectangle((25, 25, 115, 115), radius=16, outline=(230, 255, 252, 160), width=3)
    save(frame, "map/tile_selected_frame.png")

    for filename, color in (("mark_move_range.png", (64, 218, 185, 180)), ("mark_attack_range.png", (224, 72, 80, 180))):
        img = Image.new("RGBA", (140, 140), TRANSPARENT)
        img.alpha_composite(glow((140, 140), [("rounded", (22, 22, 118, 118), color)], 9))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((21, 21, 119, 119), radius=22, outline=color, width=7)
        save(img, f"map/{filename}")


def toy_body(size: Tuple[int, int], body: Color, accent: Color, kind: str) -> Image.Image:
    img = Image.new("RGBA", size, TRANSPARENT)
    w, h = size
    img.alpha_composite(glow(size, [("ellipse", (w // 5, h // 4, w * 4 // 5, h * 5 // 6), accent)], max(5, w // 14)))
    d = ImageDraw.Draw(img)
    cx = w // 2
    if kind == "player":
        d.ellipse((cx - 24, 12, cx + 24, 60), fill=OUTLINE)
        d.ellipse((cx - 20, 16, cx + 20, 56), fill=(210, 174, 132, 255))
        d.polygon((cx - 32, 55, cx + 32, 55, cx + 24, 96, cx - 24, 96), fill=OUTLINE)
        d.polygon((cx - 26, 58, cx + 26, 58, cx + 18, 92, cx - 18, 92), fill=body)
        d.line((cx + 18, 62, cx + 42, 36), fill=(210, 220, 224, 255), width=7)
        d.line((cx + 16, 62, cx + 40, 38), fill=OUTLINE, width=11)
    elif kind == "chest":
        d.rounded_rectangle((18, 42, w - 18, h - 18), radius=14, fill=OUTLINE)
        d.rounded_rectangle((24, 48, w - 24, h - 24), radius=12, fill=(82, 46, 32, 255))
        d.arc((24, 24, w - 24, 72), 180, 360, fill=GOLD, width=9)
        d.rectangle((cx - 8, 56, cx + 8, 78), fill=GOLD)
    elif kind == "key":
        d.line((24, h - 28, w - 28, 28), fill=OUTLINE, width=17)
        d.line((26, h - 30, w - 30, 30), fill=body, width=10)
        d.ellipse((w - 54, 12, w - 12, 54), outline=OUTLINE, width=10)
        d.ellipse((w - 50, 16, w - 16, 50), outline=body, width=7)
        d.line((28, h - 30, 18, h - 18), fill=body, width=7)
        d.line((42, h - 43, 32, h - 31), fill=body, width=7)
    elif kind == "exit":
        d.rounded_rectangle((24, 22, w - 24, h - 12), radius=22, fill=OUTLINE)
        d.rounded_rectangle((31, 30, w - 31, h - 18), radius=18, fill=(48, 53, 65, 255))
        d.rounded_rectangle((w * 2 // 5, 42, w * 3 // 5, h - 18), radius=8, fill=(118, 226, 246, 210))
        d.line((cx, 43, cx, h - 22), fill=WHITE, width=4)
    else:
        d.ellipse((cx - 35, 24, cx + 35, 94), fill=OUTLINE)
        d.ellipse((cx - 29, 30, cx + 29, 88), fill=body)
        eye = accent
        d.ellipse((cx - 18, 50, cx - 6, 62), fill=eye)
        d.ellipse((cx + 6, 50, cx + 18, 62), fill=eye)
        if kind == "elite":
            d.polygon((cx - 28, 32, cx - 42, 6, cx - 14, 24), fill=OUTLINE)
            d.polygon((cx + 28, 32, cx + 42, 6, cx + 14, 24), fill=OUTLINE)
        if kind == "anima":
            d.ellipse((cx - 20, 36, cx + 20, 76), fill=(119, 240, 235, 190))
        if kind == "boss":
            d.rounded_rectangle((cx - 55, 36, cx + 55, 148), radius=32, fill=OUTLINE)
            d.rounded_rectangle((cx - 46, 46, cx + 46, 138), radius=28, fill=body)
            d.ellipse((cx - 30, 74, cx - 12, 90), fill=accent)
            d.ellipse((cx + 12, 74, cx + 30, 90), fill=accent)
    return img


def make_entities() -> None:
    save(toy_body((106, 106), (42, 70, 93, 255), TEAL_DIM, "player"), "map/icon_player.png")
    save(toy_body((106, 106), (48, 82, 88, 255), TEAL, "normal"), "map/icon_monster_normal.png")
    save(toy_body((106, 106), (75, 58, 95, 255), RED, "elite"), "map/icon_monster_elite.png")
    save(toy_body((106, 106), (64, 190, 210, 170), TEAL, "anima"), "map/icon_monster_anima.png")
    save(toy_body((224, 224), (68, 52, 83, 255), RED, "boss"), "map/icon_monster_boss.png")
    save(toy_body((84, 84), GOLD, GOLD, "chest"), "map/icon_chest.png")
    save(toy_body((84, 84), GOLD, TEAL, "key"), "map/icon_key.png")
    save(toy_body((84, 84), STONE, ICE, "exit"), "map/icon_exit.png")


def icon_canvas(size: int = 56) -> Tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (size, size), TRANSPARENT)
    img.alpha_composite(glow((size, size), [("ellipse", (8, 8, size - 8, size - 8), (58, 224, 216, 80))], 5))
    return img, ImageDraw.Draw(img)


def make_hud_icons() -> None:
    icons = [
        ("icon_hud_hp.png", RED, "heart"),
        ("icon_hud_ap.png", TEAL, "bolt"),
        ("icon_hud_attack.png", WHITE, "sword"),
        ("icon_hud_gold.png", GOLD, "coin"),
        ("icon_hud_anima.png", TEAL, "orb"),
        ("icon_hud_key.png", GOLD, "key"),
    ]
    for filename, color, kind in icons:
        img, d = icon_canvas(56)
        if kind == "heart":
            d.ellipse((10, 12, 30, 32), fill=OUTLINE)
            d.ellipse((26, 12, 46, 32), fill=OUTLINE)
            d.polygon((9, 24, 47, 24, 28, 48), fill=OUTLINE)
            d.ellipse((13, 15, 29, 31), fill=color)
            d.ellipse((27, 15, 43, 31), fill=color)
            d.polygon((13, 25, 43, 25, 28, 43), fill=color)
        elif kind == "bolt":
            d.polygon((31, 4, 14, 31, 28, 31, 23, 52, 43, 23, 29, 23), fill=OUTLINE)
            d.polygon((31, 8, 18, 29, 31, 29, 26, 45, 39, 25, 27, 25), fill=color)
        elif kind == "sword":
            d.line((14, 43, 42, 12), fill=OUTLINE, width=10)
            d.line((16, 41, 41, 14), fill=color, width=5)
            d.line((19, 36, 30, 47), fill=GOLD, width=5)
        elif kind == "coin":
            d.ellipse((10, 10, 46, 46), fill=OUTLINE)
            d.ellipse((14, 14, 42, 42), fill=color)
            d.arc((20, 17, 42, 39), 105, 255, fill=(255, 235, 150, 255), width=4)
        elif kind == "orb":
            d.ellipse((10, 10, 46, 46), fill=OUTLINE)
            d.ellipse((15, 12, 41, 43), fill=(70, 220, 213, 210))
            d.ellipse((22, 18, 32, 28), fill=(220, 255, 250, 190))
        elif kind == "key":
            d.line((15, 42, 39, 18), fill=OUTLINE, width=9)
            d.line((17, 40, 37, 20), fill=color, width=5)
            d.ellipse((32, 9, 48, 25), outline=OUTLINE, width=5)
            d.ellipse((34, 11, 46, 23), outline=color, width=3)
        save(img, f"icons/{filename}")


def make_buttons() -> None:
    specs = [
        ("btn_pve_attack.png", RED, "sword"),
        ("btn_pve_interact.png", TEAL, "spark"),
        ("btn_pve_end_turn.png", (96, 105, 126, 255), "hour"),
    ]
    for filename, accent, symbol in specs:
        img = rounded_panel((220, 120), 28, (34, 40, 56, 245), OUTLINE, 8)
        img.alpha_composite(glow((220, 120), [("rounded", (20, 20, 200, 100), accent)], 12))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((16, 16, 204, 104), radius=26, outline=accent, width=5)
        cx, cy = 110, 60
        if symbol == "sword":
            d.line((78, 82, 138, 28), fill=OUTLINE, width=14)
            d.line((82, 78, 135, 31), fill=WHITE, width=7)
            d.line((78, 74, 96, 92), fill=GOLD, width=8)
        elif symbol == "spark":
            pts = (cx, 24, cx + 10, cy - 10, cx + 40, cy, cx + 10, cy + 10, cx, 96, cx - 10, cy + 10, cx - 40, cy, cx - 10, cy - 10)
            d.polygon(pts, fill=OUTLINE)
            pts2 = (cx, 32, cx + 7, cy - 7, cx + 28, cy, cx + 7, cy + 7, cx, 88, cx - 7, cy + 7, cx - 28, cy, cx - 7, cy - 7)
            d.polygon(pts2, fill=accent)
        else:
            d.rounded_rectangle((86, 28, 134, 92), radius=12, outline=OUTLINE, width=10)
            d.line((92, 38, 128, 82), fill=accent, width=6)
            d.line((128, 38, 92, 82), fill=accent, width=6)
        save(img, f"hud/{filename}")


def make_popups() -> None:
    save(rounded_panel((1240, 1280), 72, (34, 33, 54, 242), OUTLINE, 16), "popup/panel_strengthen_9s.png")
    card = rounded_panel((360, 480), 34, (39, 36, 64, 246), OUTLINE, 10)
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((34, 34, 326, 446), radius=28, outline=TEAL, width=6)
    d.rounded_rectangle((58, 62, 302, 220), radius=24, fill=(24, 30, 48, 210), outline=(128, 244, 236, 110), width=4)
    d.line((68, 262, 292, 262), fill=(128, 244, 236, 100), width=5)
    d.line((68, 310, 292, 310), fill=(128, 244, 236, 65), width=4)
    save(card, "popup/card_strengthen_choice_9s.png")


def main() -> None:
    ensure_dirs()
    make_tiles()
    make_entities()
    make_hud_icons()
    make_buttons()
    make_popups()
    print(f"Generated PVE placeholder art under {OUT}")


if __name__ == "__main__":
    main()
