# PVE Art Pipeline

This pipeline generates and reviews assets for **PVE Destiny Expedition only**.
PVP assets are intentionally excluded.

The locked style reference is:

```text
art_pipeline/references/pve-style-reference.png
```

The style is anchored to the existing blue-haired player, mossy stone map,
treasure chest, and current PVE UI. Independent icons, characters, buttons, and
map entities require a strong dark outer outline.

## Requirements

- Python 3.12+
- Pillow
- OpenAI Python package
- `OPENAI_API_KEY` set in the local terminal
- The bundled Codex image CLI under `~/.codex/skills/.system/imagegen/`

Check dependencies:

```powershell
python --version
python -c "import PIL, openai; print(PIL.__version__, openai.__version__)"
```

Set the API key for the current PowerShell window:

```powershell
$env:OPENAI_API_KEY="your-key"
```

Do not paste the key into chat or commit it to the repository.

## Manifest

The source of truth is:

```text
art_pipeline/manifests/pve_ui.json
```

Statuses:

```text
todo -> generated -> selected -> processed -> integrated
```

The manifest contains only paths under:

```text
assets/resources/art/ui/pve/
```

## Recommended Generation Flow

### 1. Preview the request without spending API credit

```powershell
npm run art:pve:generate -- --ids background.chapter2,background.chapter3 --dry-run
```

With no filters, generation selects the first `todo` assets. The default
maximum is 10 assets per batch.

### 2. Generate a small batch

```powershell
npm run art:pve:generate -- --ids background.chapter2,background.chapter3 --quality medium
```

The command prints the generated batch ID, for example:

```text
pve-20260618-143000
```

By default, the approved reference image is supplied to `gpt-image-1` with high
input fidelity. This improves style consistency but costs more than prompt-only
generation. Use `--reference-mode off` only for rough disposable drafts.

Useful filters:

```powershell
npm run art:pve:generate -- --category background --quality low
npm run art:pve:generate -- --status todo --variants 2
npm run art:pve:generate -- --ids hud.bar_info --variants 2
```

### 3. Retry only failed jobs

```powershell
npm run art:pve:generate -- --batch <batch-id> --retry-failed
```

### 4. Create one review sheet

```powershell
npm run art:pve:sheet -- --batch <batch-id>
```

Output:

```text
art_pipeline/generated/<batch-id>/contact-sheet.png
```

### 5. Validate PNG, alpha, and outline boundary

```powershell
npm run art:pve:validate -- --batch <batch-id>
```

The outline check is a heuristic. A warning means the image needs visual review;
it does not automatically prove that the style is wrong.

### 6. Promote selected variants to the approved workspace

```powershell
npm run art:pve:promote -- --batch <batch-id> --select background.chapter2:1,background.chapter3:2
```

The selected images are resized into:

```text
art_pipeline/approved/<batch-id>/
```

They do not overwrite Cocos assets.

After visual approval, copy them into the registered PVE asset paths:

```powershell
npm run art:pve:promote -- --batch <batch-id> --select background.chapter2:1 --to-assets
```

Existing production assets are protected. Replacing one requires `--force`.

## How We Collaborate

1. Tell Codex which PVE group to do next.
2. Codex updates the manifest and prompts, then gives a dry-run command.
3. Run the command locally and send Codex the batch ID.
4. Codex opens only the contact sheet and reports consistency, outline, and
   usability issues.
5. Tell Codex the selected `assetId:variant` values.
6. Codex promotes, validates, registers `UiAssets`, integrates into the PVE
   views, and runs the relevant tests.

Small batches of 4 to 8 assets are preferred. Use one or two variants initially,
then regenerate only rejected assets.

