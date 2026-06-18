from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
API_BASE = "https://api.meowa.ai"
RAW_DIR = ROOT / "tmp" / "imagegen" / "meowa_raw"
PROJECT_OUT = ROOT / "assets" / "resources" / "art" / "ui" / "pve"


PVE_P0_JOBS = [
    {
        "name": "tile_fog",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "tile_fog.png",
        "project": "map/tile_fog.png",
        "size": [140, 140],
        "requirement": (
            "Generate one square UI tile asset for a mobile dark fantasy tower-climb game. "
            "Unrevealed fog cell: ornate chunky dark stone frame, deep ink-blue mist in the center, "
            "subtle cyan rune glow in the four corners, designer-toy cartoon style, high readability, "
            "transparent background, no text, no letters, no watermark."
        ),
    },
    {
        "name": "tile_floor_ch1",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "tile_floor_ch1.png",
        "project": "map/tile_floor_ch1.png",
        "size": [140, 140],
        "requirement": (
            "Generate one square UI floor tile asset for a mobile dark fantasy tower-climb game. "
            "Ancient forest tower floor, dark mossy stone slab, chunky beveled square border, tiny cyan rune chips, "
            "designer-toy cartoon UI asset, readable on a 70 pixel grid, transparent background, no text."
        ),
    },
    {
        "name": "tile_selected_frame",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "tile_selected_frame.png",
        "project": "map/tile_selected_frame.png",
        "size": [140, 140],
        "requirement": (
            "Generate one transparent square selection frame overlay for a mobile fantasy grid map. "
            "Hollow center, thick cyan magical outline, chunky rune corners, dark toy-like bevels, no filled center, "
            "transparent background, no text, no watermark."
        ),
    },
    {
        "name": "mark_move_range",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "mark_move_range.png",
        "project": "map/mark_move_range.png",
        "size": [140, 140],
        "requirement": (
            "Generate one transparent square movement range overlay for a mobile fantasy grid map. "
            "Hollow center, soft teal-green glow outline, rounded magical corners, subtle rune particles, "
            "transparent background, no text."
        ),
    },
    {
        "name": "mark_attack_range",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "mark_attack_range.png",
        "project": "map/mark_attack_range.png",
        "size": [140, 140],
        "requirement": (
            "Generate one transparent square attack range overlay for a mobile fantasy grid map. "
            "Hollow center, controlled crimson glow outline, rounded magical corners, dark fantasy UI style, "
            "transparent background, no text."
        ),
    },
    {
        "name": "icon_player",
        "endpoint": "hd-gen",
        "template_name": "hd_char_2",
        "out": "icon_player.png",
        "project": "map/icon_player.png",
        "size": [106, 106],
        "requirement": (
            "Generate one front-facing chibi designer-toy adventurer map icon. Big head small body, dark cloak, "
            "short sword, tiny backpack, semi-matte collectible toy feel, cyan rim light, dark fantasy tower adventure, "
            "transparent background, no text."
        ),
    },
    {
        "name": "icon_monster_normal",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_monster_normal.png",
        "project": "map/icon_monster_normal.png",
        "size": [106, 106],
        "requirement": (
            "Generate one small dark dungeon monster map icon. Chibi designer-toy cartoon, rounded chunky body, "
            "deep teal-gray body, glowing cyan eyes, mild threat but not horror, transparent background, no text."
        ),
    },
    {
        "name": "icon_monster_elite",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_monster_elite.png",
        "project": "map/icon_monster_elite.png",
        "size": [106, 106],
        "requirement": (
            "Generate one elite dungeon monster map icon. Chibi designer-toy cartoon, larger chunky silhouette, "
            "small rune horns or shoulder plates, dark violet body, controlled purple-red warning glow, transparent background, no text."
        ),
    },
    {
        "name": "icon_monster_anima",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_monster_anima.png",
        "project": "map/icon_monster_anima.png",
        "size": [106, 106],
        "requirement": (
            "Generate one small floating anima energy creature map icon. Chibi designer-toy cartoon, translucent cyan-blue soul orb body, "
            "soft magical glow, compact readable silhouette, transparent background, no text."
        ),
    },
    {
        "name": "icon_monster_boss",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_monster_boss.png",
        "project": "map/icon_monster_boss.png",
        "size": [224, 224],
        "requirement": (
            "Generate one large boss map icon for a dark fantasy tower game. Chibi designer-toy cartoon boss, oversized chunky silhouette, "
            "dark stone-like armor, glowing eyes, subtle crimson rune aura, threatening but not horror, transparent background, no text."
        ),
    },
    {
        "name": "icon_chest",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_chest.png",
        "project": "map/icon_chest.png",
        "size": [84, 84],
        "requirement": (
            "Generate one dungeon treasure chest icon. Designer-toy cartoon, dark wood, muted gold metal corners, "
            "warm gold light leaking from seams, chunky bevel, transparent background, no text."
        ),
    },
    {
        "name": "icon_key",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_key.png",
        "project": "map/icon_key.png",
        "size": [84, 84],
        "requirement": (
            "Generate one magic key icon. Designer-toy cartoon, muted gold key, small rune head, blue-white edge glow, "
            "chunky silhouette, transparent background, no text."
        ),
    },
    {
        "name": "icon_exit",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_exit.png",
        "project": "map/icon_exit.png",
        "size": [84, 84],
        "requirement": (
            "Generate one small stone exit door icon for a tower map. Dark stone arch, blue-white light through the door crack, "
            "cyan rune border, designer-toy cartoon style, transparent background, no text."
        ),
    },
    {
        "name": "icon_hud_hp",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_hp.png",
        "project": "icons/icon_hud_hp.png",
        "size": [56, 56],
        "requirement": "Generate one compact ruby heart HUD icon, chunky dark outline, designer-toy cartoon, transparent background, no text.",
    },
    {
        "name": "icon_hud_ap",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_ap.png",
        "project": "icons/icon_hud_ap.png",
        "size": [56, 56],
        "requirement": "Generate one compact cyan lightning bolt action point HUD icon, chunky dark outline, designer-toy cartoon, transparent background, no text.",
    },
    {
        "name": "icon_hud_attack",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_attack.png",
        "project": "icons/icon_hud_attack.png",
        "size": [56, 56],
        "requirement": "Generate one compact sword slash attack HUD icon, muted silver blade with cyan edge glow, chunky dark outline, transparent background, no text.",
    },
    {
        "name": "icon_hud_gold",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_gold.png",
        "project": "icons/icon_hud_gold.png",
        "size": [56, 56],
        "requirement": "Generate one compact muted gold coin stack HUD icon, chunky toy bevel, dark outline, transparent background, no text.",
    },
    {
        "name": "icon_hud_anima",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_anima.png",
        "project": "icons/icon_hud_anima.png",
        "size": [56, 56],
        "requirement": "Generate one compact blue-green soul energy orb HUD icon, soft magical glow, chunky dark outline, transparent background, no text.",
    },
    {
        "name": "icon_hud_key",
        "endpoint": "hd-gen",
        "template_name": "cute_cartoon_icon",
        "out": "icon_hud_key.png",
        "project": "icons/icon_hud_key.png",
        "size": [56, 56],
        "requirement": "Generate one compact tiny magic key HUD icon, muted gold with blue-white rune glow, chunky dark outline, transparent background, no text.",
    },
    {
        "name": "btn_pve_attack",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "btn_pve_attack.png",
        "project": "hud/btn_pve_attack.png",
        "size": [220, 120],
        "requirement": "Generate one compact rounded attack button for mobile game HUD, dark red stone, centered sword slash icon, crimson glow, designer-toy cartoon UI, transparent background, no text.",
    },
    {
        "name": "btn_pve_interact",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "btn_pve_interact.png",
        "project": "hud/btn_pve_interact.png",
        "size": [220, 120],
        "requirement": "Generate one compact rounded interact button for mobile game HUD, deep teal stone, centered sparkle or hand symbol, cyan glow, designer-toy cartoon UI, transparent background, no text.",
    },
    {
        "name": "btn_pve_end_turn",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "btn_pve_end_turn.png",
        "project": "hud/btn_pve_end_turn.png",
        "size": [220, 120],
        "requirement": "Generate one compact rounded end-turn button for mobile game HUD, dark gray stone, centered hourglass symbol, muted blue glow, designer-toy cartoon UI, transparent background, no text.",
    },
    {
        "name": "card_strengthen_choice_9s",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "card_strengthen_choice_9s.png",
        "project": "popup/card_strengthen_choice_9s.png",
        "size": [360, 480],
        "requirement": (
            "Generate one vertical magic card frame for mobile RPG upgrade choices. Dark violet stone frame, cyan rune border, "
            "empty center for UI text, 9-slice friendly frame, designer-toy cartoon UI, transparent background, no text."
        ),
    },
    {
        "name": "panel_strengthen_9s",
        "endpoint": "hd-gen",
        "template_name": "modern_minimal_icon",
        "out": "panel_strengthen_9s.png",
        "project": "popup/panel_strengthen_9s.png",
        "size": [1240, 1280],
        "requirement": (
            "Generate one large dark fantasy modal panel for mobile RPG upgrade choices. Chunky rounded stone frame, smoky glass interior, "
            "deep violet-gray, cyan rune trim, empty center, 9-slice friendly, designer-toy cartoon UI, transparent background, no text."
        ),
    },
]


def _get_key() -> str:
    key = os.environ.get("MEOWA_API_KEY")
    if key:
        return key

    # Windows setx writes to the user environment but does not update already
    # running processes. Querying here lets Codex continue without restart.
    if os.name == "nt":
        import subprocess

        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "[Environment]::GetEnvironmentVariable('MEOWA_API_KEY','User')",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        key = result.stdout.strip()
        if key:
            return key

    raise RuntimeError("MEOWA_API_KEY is missing. Set it with: setx MEOWA_API_KEY \"ma_live_...\"")


def _request_json(method: str, url: str, key: str, data: bytes | None = None, content_type: str | None = None) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "User-Agent": "CoupleGameArtPipeline/0.1",
    }
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from {url}: {body}") from exc


def _multipart(fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = "----codex-meowa-boundary"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.append(f"--{boundary}\r\n".encode())
        chunks.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode())
        chunks.append(str(value).encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _submit_job(job: dict[str, str], key: str) -> str:
    endpoint = job["endpoint"]
    fields = {
        "template_name": job["template_name"],
        "requirement": job["requirement"],
        "aspect_ratio": "1:1",
        "hd_remove_bg_mode": "single",
    }
    body, content_type = _multipart(fields)
    response = _request_json("POST", f"{API_BASE}/api/{endpoint}", key, body, content_type)
    job_id = response.get("api_job_id")
    if not job_id:
        raise RuntimeError(f"Submit response did not include api_job_id: {response}")
    return str(job_id)


def _poll_job(endpoint: str, job_id: str, key: str, timeout_seconds: int = 600) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        query = urllib.parse.urlencode({"id": job_id})
        response = _request_json("GET", f"{API_BASE}/api/{endpoint}/jobs?{query}", key)
        status = response.get("status")
        print(f"{job_id}: {status}")
        if status == "success":
            return response
        if status in {"failure", "cancelled"}:
            raise RuntimeError(f"Meowa job ended with {status}: {response.get('error')}")
        time.sleep(5)
    raise TimeoutError(f"Timed out waiting for Meowa job {job_id}")


def _download(endpoint: str, job_id: str, key: str, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        f"{API_BASE}/api/{endpoint}/jobs/{job_id}/download",
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "*/*",
            "User-Agent": "CoupleGameArtPipeline/0.1",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out.write_bytes(resp.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Download failed HTTP {exc.code}: {body}") from exc


def _fit_to_size(src: Path, dst: Path, size: list[int]) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    target_w, target_h = size
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    im.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (target_w, target_h), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((target_w - im.width) // 2, (target_h - im.height) // 2))
    canvas.save(dst)


def run_one(name: str, force: bool = False) -> Path:
    key = _get_key()
    job = next((item for item in PVE_P0_JOBS if item["name"] == name), None)
    if job is None:
        raise ValueError(f"Unknown job {name!r}. Available: {', '.join(item['name'] for item in PVE_P0_JOBS)}")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out = RAW_DIR / job["out"]
    if force or not out.exists():
        print(f"Submitting {name} via Meowa {job['endpoint']} / {job['template_name']}")
        job_id = _submit_job(job, key)
        print(f"Submitted job_id={job_id}")
        _poll_job(job["endpoint"], job_id, key)
        _download(job["endpoint"], job_id, key, out)
        print(f"Downloaded {out}")
    else:
        print(f"Using existing raw asset {out}")

    project_path = PROJECT_OUT / job["project"]
    _fit_to_size(out, project_path, job["size"])
    print(f"Wrote {project_path}")
    return project_path


def run_batch(force: bool = False) -> None:
    for index, job in enumerate(PVE_P0_JOBS, start=1):
        print(f"[{index}/{len(PVE_P0_JOBS)}] {job['name']}")
        run_one(job["name"], force=force)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate PVE art assets using Meowa API.")
    parser.add_argument("--one", default="tile_fog", help="Generate one named test asset.")
    parser.add_argument("--batch", action="store_true", help="Generate all PVE P0 assets.")
    parser.add_argument("--force", action="store_true", help="Regenerate raw assets even if they already exist.")
    args = parser.parse_args()
    if args.batch:
        run_batch(force=args.force)
    else:
        run_one(args.one, force=args.force)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
