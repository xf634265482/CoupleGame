# PVE Stability Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the PVE camp, floor-selection UI, battle presentation, drops, floor-four target, and GM reset behavior in one releasable change.

**Architecture:** Keep the existing PVE controller/core/view boundaries. Fix camp and lobby layout in their views, keep reward generation in `LootSystem` and repair its event presentation in `ExpeditionController`, and make the GM reset authoritative through the shared cloud source before syncing function copies.

**Tech Stack:** Cocos Creator 3.8.8, TypeScript, Jest, Node.js cloud functions, GM web Vite build.

## Global Constraints

- PVE core remains framework-free and deterministic.
- All player-facing camp text is Chinese except `LV`.
- UI content must remain inside modal borders with no overlap or clipping.
- Edit only `cloudfunctions/common/**`, then run `node scripts/sync-cloud-common.js`.
- Rebuild `gm-web/dist` after GM source changes.
- Update `specs/260608-pve-destiny-expedition/design.md` for gameplay changes.

---

### Task 1: Camp layout and detail stability

**Files:**
- Modify: `assets/scripts/pve/views/CampView.ts`
- Test: `test/pve/MinghenDisplay.test.ts`

- [ ] Move section labels above their card rows, delete `onRefresh`/the refresh button, and retain only the return button in the footer.
- [ ] Make the detail content region start below the title and finish above actions; use the non-scroll branch when content fits.
- [ ] Run: `npm run typecheck`
- [ ] Commit camp-only changes.

### Task 2: Floor selection and confirmation modals

**Files:**
- Modify: `assets/scripts/lobby/PveLobbyController.ts`
- Test: `test/pve/PersistentFloorFlow.test.ts`

- [ ] Render `选择关卡` title and `第 N 章` header before navigation controls.
- [ ] Create disabled buttons using gray fill, gray border, gray text, and `Button.interactable = false`; apply it to unavailable floors and unavailable chapter changes.
- [ ] Render the selected floor's catalog name as confirmation title and its victory-condition text in the body, with only `远征` and `关闭` actions.
- [ ] Run: `npm run typecheck; npm run test:pve -- --runInBand`
- [ ] Commit modal changes.

### Task 3: Player node, chest rendering, and loot replay

**Files:**
- Modify: `assets/scripts/pve/views/FogMapView.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/core/LootSystem.ts` only if a generated reward event lacks a view-consumable payload
- Test: `test/pve/LootSystem.test.ts`

- [ ] Trace the existing `LOOT` event payload and add assertions for normal monster gold/fragment drop and equipment drop fields.
- [ ] Ensure FogMapView maintains exactly one player visual node, stops any in-flight tween before repositioning it, and redraws chest entities through an available asset or visible fallback.
- [ ] In `_replayEvents`, route each `LOOT` variant to the existing toast/log path rather than silently ignoring it.
- [ ] Run: `npm run typecheck; npm run test:pve -- --runInBand`
- [ ] Commit battle presentation changes.

### Task 4: Existing sentinel target on chapter-one floor four

**Files:**
- Modify: `assets/scripts/pve/core/objectives/Chapter1Objectives.ts`
- Modify: `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts` or `Chapter1ExpeditionFactory.ts` when that is the target-spawn owner
- Test: `test/pve/Chapter1Objectives.test.ts`
- Modify: `specs/260608-pve-destiny-expedition/design.md`

- [ ] Replace the `MESSENGER` objective/spawn reference with existing `GOBLIN_SENTINEL` while retaining the floor-four chase objective rules.
- [ ] Update test assertions to confirm the target is `GOBLIN_SENTINEL` and no messenger is spawned.
- [ ] Run: `npm run test:pve -- --runInBand`
- [ ] Commit chapter-one content and design documentation.

### Task 5: Remove destiny tree from GM and make reset destructive to progression inventory

**Files:**
- Modify: `gm-web/src/main.ts`
- Modify: `gm-web/src/types.ts`
- Modify: `cloudfunctions/common/admin/AdminConstants.js`
- Modify: `cloudfunctions/common/admin/AdminToolService.js`
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Test: `cloudfunctions/common/__tests__/PveProfile.test.js`
- Test: `cloudfunctions/common/__tests__/AdminToolService.test.js`

- [ ] Remove GM UI/API action types, action constants, dispatch cases, and reset-tree handlers without touching the camp navigation code.
- [ ] Assert `resetExpeditionProgress()` returns a pristine profile with empty `minghenCollection`, `minghenLoadout`, `minghenPresets`, `equipmentInventory`, `equipmentLoadout`, and initial profession mastery.
- [ ] Ensure admin reset removes the active challenge, active save, and persists that pristine profile.
- [ ] Run: `node scripts/sync-cloud-common.js; Push-Location cloudfunctions/common; npm test -- --runInBand; Pop-Location; Push-Location gm-web; npm run build; Pop-Location`
- [ ] Commit GM and cloud changes including rebuilt `gm-web/dist`.

### Task 6: End-to-end verification and handoff

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` if verification exposes any behavior wording gap

- [ ] Run: `npm run typecheck`
- [ ] Run: `npm run test:pve -- --runInBand`
- [ ] Run: `Push-Location cloudfunctions/common; npm test -- --runInBand; Pop-Location`
- [ ] Inspect `git diff --check` and report any pre-existing unrelated test failures separately.
- [ ] Tell the user to upload the rebuilt GM `dist` and deploy all synced cloud functions that use the common source.
