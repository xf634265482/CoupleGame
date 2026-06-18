from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT / "art_pipeline"
MANIFEST_PATH = PIPELINE_DIR / "manifests" / "pve_ui.json"
STYLE_PATH = PIPELINE_DIR / "styles" / "pve_fantasy.json"
PROMPT_DIR = PIPELINE_DIR / "prompts"
GENERATED_DIR = PIPELINE_DIR / "generated"
APPROVED_DIR = PIPELINE_DIR / "approved"
PVE_ASSET_PREFIX = "assets/resources/art/ui/pve/"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)


def load_manifest() -> dict[str, Any]:
    manifest = read_json(MANIFEST_PATH)
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("scope") != "PVE_ONLY":
        raise ValueError("Manifest scope must be PVE_ONLY")

    assets = manifest.get("assets")
    if not isinstance(assets, list):
        raise ValueError("Manifest assets must be a list")

    seen: set[str] = set()
    valid_statuses = {"todo", "generated", "selected", "processed", "integrated"}
    valid_categories = {"icon", "map_entity", "background", "panel"}
    for asset in assets:
        asset_id = asset.get("id")
        if not isinstance(asset_id, str) or not asset_id:
            raise ValueError("Every asset needs a non-empty id")
        if asset_id in seen:
            raise ValueError(f"Duplicate asset id: {asset_id}")
        seen.add(asset_id)

        if asset.get("status") not in valid_statuses:
            raise ValueError(f"{asset_id}: invalid status")
        if asset.get("category") not in valid_categories:
            raise ValueError(f"{asset_id}: invalid category")

        production_path = asset.get("productionPath", "")
        normalized = production_path.replace("\\", "/")
        if not normalized.startswith(PVE_ASSET_PREFIX):
            raise ValueError(f"{asset_id}: production path must stay under PVE assets")
        if "pvp" in json.dumps(asset, ensure_ascii=False).lower():
            raise ValueError(f"{asset_id}: PVP content is forbidden")

        target_size = asset.get("targetSize")
        if (
            not isinstance(target_size, list)
            or len(target_size) != 2
            or not all(isinstance(value, int) and value > 0 for value in target_size)
        ):
            raise ValueError(f"{asset_id}: targetSize must be [width, height]")


def asset_map(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {asset["id"]: asset for asset in manifest["assets"]}


def slugify(asset_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]+", "_", asset_id).strip("_")


def compose_prompt(asset: dict[str, Any]) -> str:
    style = read_json(STYLE_PATH)
    template = read_json(PROMPT_DIR / f"{asset['promptTemplate']}.json")
    reference_role = (
        "Use the supplied image only as the visual style reference. "
        "Create a new standalone asset; do not reproduce the three-panel comparison layout. "
    )
    lines = [
        reference_role,
        f"Use case: {template['useCase']}",
        f"Asset type: {template['assetType']}",
        f"Primary request: {asset['prompt']}",
        f"Composition: {template['composition']}",
        f"Rendering: {template['rendering']}",
        "Global style: " + "; ".join(style["style"]),
        "Consistency: " + "; ".join(style["consistency"]),
        "Template constraints: " + "; ".join(template["constraints"]),
    ]
    if asset.get("requiresOutline"):
        lines.append("Outline requirement: " + style["outline"]["description"])
        lines.append(
            "The outline is mandatory and must remain clearly visible after downscaling."
        )
    if asset.get("transparent"):
        lines.append(
            "Output requirement: isolated asset on a true transparent background, PNG alpha."
        )
    else:
        lines.append("Output requirement: opaque full-bleed artwork.")
    lines.append("Avoid: " + "; ".join(style["avoid"]))
    return "\n".join(lines)


def prompt_hash(prompt: str) -> str:
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:16]


def resolve_repo_path(relative_path: str) -> Path:
    candidate = (ROOT / relative_path).resolve()
    if ROOT.resolve() not in candidate.parents and candidate != ROOT.resolve():
        raise ValueError(f"Path escapes repository: {relative_path}")
    return candidate
