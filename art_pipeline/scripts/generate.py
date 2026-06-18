from __future__ import annotations

import argparse
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any

from common import (
    GENERATED_DIR,
    MANIFEST_PATH,
    PIPELINE_DIR,
    ROOT,
    STYLE_PATH,
    compose_prompt,
    load_manifest,
    prompt_hash,
    read_json,
    slugify,
    write_json,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate PVE art from the manifest.")
    parser.add_argument("--ids", help="Comma-separated asset ids.")
    parser.add_argument("--status", default=None)
    parser.add_argument("--category")
    parser.add_argument("--variants", type=int)
    parser.add_argument("--quality", choices=("low", "medium", "high", "auto"))
    parser.add_argument("--batch")
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--reference-mode", choices=("on", "off"), default="on")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-large-batch", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def image_cli_path() -> Path:
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    path = codex_home / "skills" / ".system" / "imagegen" / "scripts" / "image_gen.py"
    if not path.exists():
        raise FileNotFoundError(f"Bundled image CLI not found: {path}")
    return path


def select_assets(manifest: dict[str, Any], args: argparse.Namespace) -> list[dict[str, Any]]:
    requested_ids = set(args.ids.split(",")) if args.ids else None
    status = args.status
    if requested_ids is None and status is None and not args.category:
        status = "todo"

    selected = []
    for asset in manifest["assets"]:
        if requested_ids is not None and asset["id"] not in requested_ids:
            continue
        if status and asset["status"] != status:
            continue
        if args.category and asset["category"] != args.category:
            continue
        selected.append(asset)

    if requested_ids is not None:
        missing = requested_ids - {asset["id"] for asset in selected}
        if missing:
            raise ValueError(f"Unknown or filtered asset ids: {', '.join(sorted(missing))}")
    return selected


def build_jobs(
    assets: list[dict[str, Any]],
    batch_dir: Path,
    args: argparse.Namespace,
    manifest: dict[str, Any],
) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    prompts_dir = batch_dir / "prompts"
    raw_dir = batch_dir / "raw"
    prompts_dir.mkdir(parents=True, exist_ok=True)
    raw_dir.mkdir(parents=True, exist_ok=True)

    for asset in assets:
        prompt = compose_prompt(asset)
        prompt_path = prompts_dir / f"{slugify(asset['id'])}.txt"
        prompt_path.write_text(prompt + "\n", encoding="utf-8")
        variants = args.variants or asset.get("variants", 1)
        if variants < 1 or variants > 4:
            raise ValueError("Variants must be between 1 and 4")
        for variant in range(1, variants + 1):
            filename = f"{slugify(asset['id'])}__v{variant}.png"
            jobs.append(
                {
                    "assetId": asset["id"],
                    "variant": variant,
                    "prompt": prompt,
                    "promptPath": str(prompt_path.relative_to(ROOT)).replace("\\", "/"),
                    "promptHash": prompt_hash(prompt),
                    "model": manifest.get("defaultModel", "gpt-image-1"),
                    "quality": args.quality
                    or manifest.get("defaultQuality", "medium"),
                    "size": asset["size"],
                    "transparent": bool(asset["transparent"]),
                    "requiresOutline": bool(asset.get("requiresOutline")),
                    "output": str((raw_dir / filename).relative_to(ROOT)).replace("\\", "/"),
                    "status": "pending",
                    "error": None,
                }
            )
    return jobs


def run_job(
    job: dict[str, Any],
    cli_path: Path,
    reference_path: Path,
    use_reference: bool,
    force: bool,
) -> tuple[bool, str | None]:
    output_path = ROOT / job["output"]
    prompt_path = ROOT / job["promptPath"]
    command = [sys.executable, str(cli_path)]
    if use_reference:
        command += [
            "edit",
            "--image",
            str(reference_path),
            "--input-fidelity",
            "high",
        ]
    else:
        command.append("generate")
    command += [
        "--model",
        job["model"],
        "--prompt-file",
        str(prompt_path),
        "--size",
        job["size"],
        "--quality",
        job["quality"],
        "--output-format",
        "png",
        "--background",
        "transparent" if job["transparent"] else "opaque",
        "--out",
        str(output_path),
        "--no-augment",
    ]
    if force:
        command.append("--force")

    result = subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode == 0 and output_path.exists():
        return True, None
    message = (result.stderr or result.stdout or "Unknown generation error").strip()
    return False, message[-1200:]


def retry_jobs(batch_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    batch_path = batch_dir / "batch.json"
    if not batch_path.exists():
        raise FileNotFoundError(f"Batch not found: {batch_path}")
    batch = read_json(batch_path)
    jobs = [job for job in batch["jobs"] if job["status"] == "failed"]
    for job in jobs:
        job["status"] = "pending"
        job["error"] = None
    return batch, jobs


def main() -> int:
    args = parse_args()
    manifest = load_manifest()
    batch_id = args.batch or datetime.now().strftime("pve-%Y%m%d-%H%M%S")
    batch_dir = GENERATED_DIR / batch_id

    if args.retry_failed:
        if not args.batch:
            raise ValueError("--retry-failed requires --batch")
        batch, jobs = retry_jobs(batch_dir)
    else:
        assets = select_assets(manifest, args)
        if not assets:
            print("No PVE assets matched the filters.")
            return 0
        limit = int(manifest.get("defaultBatchLimit", 10))
        if len(assets) > limit and not args.allow_large_batch:
            raise ValueError(
                f"Selected {len(assets)} assets; default limit is {limit}. "
                "Use filters or --allow-large-batch."
            )
        if batch_dir.exists() and any(batch_dir.iterdir()) and not args.force:
            raise FileExistsError(f"Batch already exists: {batch_dir}")
        batch_dir.mkdir(parents=True, exist_ok=True)
        jobs = build_jobs(assets, batch_dir, args, manifest)
        style = read_json(STYLE_PATH)
        batch = {
            "schemaVersion": 1,
            "scope": "PVE_ONLY",
            "batchId": batch_id,
            "createdAt": datetime.now().astimezone().isoformat(),
            "manifest": str(MANIFEST_PATH.relative_to(ROOT)).replace("\\", "/"),
            "styleId": style["id"],
            "referenceMode": args.reference_mode,
            "jobs": jobs,
        }

    write_json(batch_dir / "batch.json", batch)
    print(f"Batch: {batch_id}")
    print(f"Jobs: {len(jobs)}")
    for job in jobs:
        print(
            f"  {job['assetId']}:v{job['variant']} "
            f"{job['size']} {job['quality']} -> {job['output']}"
        )
    if args.dry_run:
        print("Dry run only. No API calls were made.")
        return 0
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set in this terminal.")

    cli_path = image_cli_path()
    style = read_json(STYLE_PATH)
    reference_path = ROOT / style["referenceImage"]
    if args.reference_mode == "on" and not reference_path.exists():
        raise FileNotFoundError(f"Style reference not found: {reference_path}")

    use_reference = args.reference_mode == "on"
    workers = max(1, min(args.concurrency, 4))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                run_job,
                job,
                cli_path,
                reference_path,
                use_reference,
                args.force,
            ): job
            for job in jobs
        }
        for future in as_completed(futures):
            job = futures[future]
            ok, error = future.result()
            job["status"] = "succeeded" if ok else "failed"
            job["error"] = error
            print(f"{job['assetId']}:v{job['variant']} -> {job['status']}")
            write_json(batch_dir / "batch.json", batch)

    succeeded_ids = {
        job["assetId"] for job in batch["jobs"] if job["status"] == "succeeded"
    }
    failed_ids = {job["assetId"] for job in batch["jobs"] if job["status"] == "failed"}
    for asset in manifest["assets"]:
        if asset["id"] in succeeded_ids and asset["id"] not in failed_ids:
            asset["status"] = "generated"
            asset["lastBatch"] = batch_id
    write_json(MANIFEST_PATH, manifest)

    failures = sum(job["status"] == "failed" for job in batch["jobs"])
    print(f"Finished: {len(batch['jobs']) - failures} succeeded, {failures} failed.")
    print(
        f"Next: python art_pipeline/scripts/contact_sheet.py --batch {batch_id}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

