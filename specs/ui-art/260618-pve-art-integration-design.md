# PVE Art Integration Design

## Scope

Integrate the approved PVE art assets into the existing code-built Cocos UI.
PVP code and assets are out of scope.

## Resource Loading

- Register every consumed PVE sprite key in `UiAssets`.
- Keep map cells, entities, HUD icons, and controls in the PVE preload list.
- Keep large chapter backgrounds in the resources subpackage unless runtime
  validation shows they must be promoted to critical native assets.
- Preserve all existing WeChat native-loading and fallback behavior.

## Expedition Map

- Resolve the chapter from the current floor.
- Load `tile_floor_ch1` through `tile_floor_ch5` and use the matching tile for
  each revealed cell.
- Keep the grid dynamic for 8x8, 9x9, and 10x10 maps.
- Do not bake a fixed grid into chapter backgrounds.
- Preserve the entity layer below the occupant layer so a player standing on a
  chest or key does not hide it completely.

## Code-Built UI

- Use approved images as decorative frames and backgrounds only.
- Keep labels, values, icons, buttons, and interaction handlers under code
  control.
- Apply the HUD bar to `PveHudView`.
- Apply the character panel frame and repeat one equipment-slot frame exactly
  five times in `PveCharacterPanel`.
- Apply the camp and interaction/death/floor-clear frames only where matching
  UI surfaces already exist; do not add gameplay behavior.

## Destiny Tree

- Use `bg_destiny_tree` as the scene background.
- Reuse one `node_frame` sprite for every tree node.
- Express states through code:
  - locked: dim gray
  - available: cyan highlight
  - unlocked/maxed: warm gold highlight
- Node-specific icons and labels remain dynamic content.

## Verification

- Run PVE Jest tests.
- Run TypeScript diagnostics and report unrelated existing failures separately.
- Validate newly registered paths and sprite metadata.
- Run UUID synchronization after Cocos has imported new PNG files.
- Before a WeChat release, rebuild, compress large UI assets, patch the build,
  and verify the main package remains below 4 MB.

## Implementation Status (2026-06-19)

- `UiAssets` contains UUID entries for every imported PVE PNG.
- Critical native is limited to the core map set, including all five chapter
  floor tiles. HUD art, large backgrounds, and secondary panels stay in the
  resources subpackage and retain code-drawn fallbacks.
- `FogMapView` selects `tile_floor_ch1` through `tile_floor_ch5` from the
  current floor chapter. Chapter backgrounds render as a full-scene layer and
  do not affect grid coordinates.
- HUD, character information, five equipment slots, strengthen choices, camp,
  interaction/result dialogs, and destiny tree nodes use image frames while
  retaining code-built labels and handlers.
- Graphics remain as a fallback. This is required on WeChat devices because
  non-critical subpackage-native images may be unavailable through the native
  filesystem even after `loadSubpackage` succeeds.
- PVP views and assets are unchanged.

