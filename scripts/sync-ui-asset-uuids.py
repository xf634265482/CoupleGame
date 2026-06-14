#!/usr/bin/env python3
"""Regenerate UI_SPRITE_UUID in UiAssets.ts from resources/art/ui meta files."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UI_ROOT = ROOT / "assets/resources/art/ui"
TS_FILE = ROOT / "assets/scripts/ui/UiAssets.ts"


def collect() -> dict[str, str]:
    out: dict[str, str] = {}
    for meta in sorted(UI_ROOT.rglob("*.png.meta")):
        key = meta.parent.relative_to(UI_ROOT).as_posix() + "/" + meta.name.replace(
            ".png.meta", ""
        )
        data = json.loads(meta.read_text(encoding="utf-8"))
        for v in data.get("subMetas", {}).values():
            if v.get("importer") == "sprite-frame":
                out[key] = v["uuid"]
                break
    return out


def main() -> None:
    manifest = collect()
    lines = [f"  '{k}': '{v}'," for k, v in sorted(manifest.items())]
    block = "export const UI_SPRITE_UUID: Record<string, string> = {\n" + "\n".join(lines) + "\n};"
    text = TS_FILE.read_text(encoding="utf-8")
    text, n = re.subn(
        r"export const UI_SPRITE_UUID: Record<string, string> = \{[\s\S]*?\};",
        block,
        text,
        count=1,
    )
    if n != 1:
        raise RuntimeError("UI_SPRITE_UUID block not found")
    TS_FILE.write_text(text, encoding="utf-8")
    print(f"updated {len(manifest)} entries in {TS_FILE}")


if __name__ == "__main__":
    main()
