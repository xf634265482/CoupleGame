# PVE AI Art Pipeline Design

## Goal

Build a local, repeatable PVE-only art pipeline for generating UI and map assets with the OpenAI Image API. The pipeline must preserve the approved outlined fantasy style, keep API spending visible, and prevent generated candidates from overwriting Cocos production assets before review.

PVP assets are explicitly out of scope.

## Collaboration Workflow

1. Codex maintains the style specification, prompt templates, asset manifest, and scripts.
2. The user runs generation commands locally with `OPENAI_API_KEY`.
3. The pipeline writes each run into an isolated batch directory and creates one contact sheet.
4. The user selects asset IDs or variant IDs from the contact sheet.
5. Codex validates, processes, promotes, registers, and integrates the selected assets into Cocos.

This separates API image charges from Codex work and keeps visual approval under user control.

## Directory Layout

```text
art_pipeline/
  README.md
  styles/
    pve_fantasy.json
  prompts/
    icon.json
    map_entity.json
    background.json
    panel.json
  manifests/
    pve_ui.json
  scripts/
    generate.mjs
    contact-sheet.mjs
    validate.mjs
    promote.mjs
  generated/
    <batch-id>/
      batch.json
      raw/
      contact-sheet.png
  approved/
```

`generated/` and `approved/` are local working directories and must not be treated as Cocos resources. The manifest and scripts are project source files.

## Manifest Model

Each asset record contains:

- `id`: stable PVE asset identifier.
- `category`: `icon`, `map_entity`, `background`, or `panel`.
- `status`: `todo`, `generated`, `selected`, `processed`, or `integrated`.
- `prompt`: asset-specific subject and composition.
- `promptTemplate`: template file name.
- `size`: OpenAI Image API output size.
- `targetSize`: final Cocos pixel dimensions.
- `transparent`: whether alpha is required.
- `variants`: number of candidates requested, default `1`.
- `productionPath`: intended path under `assets/resources/art/ui/pve/`.
- `notes`: review or integration notes.

The initial manifest records existing generated PVE assets and remaining PVE work. It contains no PVP entries.

## Style And Prompt Composition

The final prompt is assembled from:

1. Global PVE style specification.
2. Category template.
3. Asset-specific prompt.
4. Output constraints such as transparency, silhouette, outline thickness, view angle, and no text.

The global style encodes the approved reference direction: chibi dark-fantasy adventure art, mossy stone and woodland materials, readable mobile silhouettes, coherent lighting, and a strong dark outer outline.

Templates remain separate because icons, map entities, full backgrounds, and UI panels require different composition rules.

## Generation Command

`generate.mjs` reads the manifest and accepts filters:

```text
--ids <comma-separated ids>
--status <manifest status>
--category <category>
--variants <count>
--quality <low|medium|high>
--batch <batch id>
--concurrency <count>
--retry-failed
--dry-run
```

Defaults:

- Model: `gpt-image-1`.
- Variants: manifest value or `1`.
- Quality: `medium`.
- Concurrency: `2`.
- Batch size: maximum `10` selected assets unless explicitly overridden.
- API key: `OPENAI_API_KEY`; never persisted to disk or printed.

Every request and result is recorded in `batch.json`, including asset ID, variant, prompt hash, model, size, quality, timestamps, status, error summary, and output filename. Failed jobs can be retried without regenerating successful jobs.

## Contact Sheet

`contact-sheet.mjs` creates one numbered preview for a batch. Each tile shows the asset ID and variant number outside the artwork. It does not modify source images.

The contact sheet is the default review artifact so Codex and the user do not need to inspect every full-resolution image individually.

## Validation

`validate.mjs` checks:

- File exists and is a readable PNG.
- Dimensions match the expected source or target size.
- Transparent assets contain an alpha channel.
- Transparent assets are not completely opaque or completely empty.
- Filename and asset ID agree with the manifest.
- Production paths stay under `assets/resources/art/ui/pve/`.

Visual style, unwanted text, composition, and outline quality still require human review.

## Promotion

`promote.mjs` only processes explicitly selected `assetId:variant` pairs. It:

1. Reads the generated batch result.
2. Resizes to `targetSize` while preserving aspect ratio.
3. Writes into `approved/` by default.
4. Copies to the production path only with an explicit `--to-assets` flag.
5. Refuses to overwrite an existing production file unless `--force` is supplied.

The pipeline does not create or edit Cocos `.meta` files. Cocos Creator remains responsible for importing new resources, after which Codex can update `UiAssets` and verify packaging rules.

## Error Handling And Cost Controls

- API errors are stored per item and do not abort the entire batch.
- Retries use exponential backoff and only target failed items.
- The default batch limit and concurrency reduce accidental spend.
- `--dry-run` prints selected assets, request count, and prompt summaries without calling the API.
- Generation never invokes PVP entries because the manifest contains only PVE assets.
- Existing successful outputs are skipped unless explicitly regenerated.

## Verification

The implementation is complete when:

- Manifest schema validation passes.
- Dry-run selects the expected PVE assets without an API call.
- Contact-sheet generation works from fixture or existing images.
- Validation detects invalid dimensions and missing alpha.
- Promotion stays inside approved PVE paths and refuses unsafe overwrite.
- `npm` scripts expose concise terminal commands.
- The README documents the user/Codex handoff workflow.

