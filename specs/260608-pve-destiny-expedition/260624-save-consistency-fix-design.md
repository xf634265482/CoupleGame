# PVE Save Consistency Fix

Date: 2026-06-24

## Background

Two symptoms were observed in PVE expedition:

1. After the player dies and appears to return to floor 1, a later recompile/re-entry can still resume an older floor 7 cloud save.
2. The current client flow can present a local "new run" state even when the cloud still holds an active save.

The root problem is save-state inconsistency between client presentation and cloud truth.

## Scope

This fix only covers save lifecycle consistency for expedition entry and expedition settlement.

In scope:

- Expedition bootstrap when entering the PVE scene
- `loadSave` failure handling
- `startRun` handling when cloud returns `resume:true`
- Death/completion settlement success and failure flow
- Lobby copy consistency for "continue expedition" vs "new expedition"

Out of scope:

- Performance optimization for floor 7+ interaction delay
- Reward formula changes
- Gameplay balance changes
- Cloud schema changes

## Problem Statement

There are two unsafe branches in the current flow:

1. If `loadPveSave()` fails during bootstrap, the client falls back to `_beginNewRun()`.
2. If `startRun()` returns `resume:true`, the client still creates a local new floor-1 expedition state instead of resuming the active save.

There is also a settlement safety issue:

3. If `settlePveRun()` fails, the client still leaves the scene and returns to lobby, which can mislead the player into believing the run was cleared when the cloud active save may still exist.

## Design Decision

Use strict cloud-first save authority.

Rules:

- The client may start a new expedition only when `loadSave` explicitly returns `save: null`.
- A `loadSave` request failure is a blocking error, not a signal to start a new run.
- A `startRun` response with `resume:true` means the cloud already has an active run; the client must re-enter resume flow rather than create a local floor-1 state.
- The client may leave the expedition scene after death/completion only if `settleRun` succeeds.

This is preferred over a softer fallback because it prevents false local states and keeps the displayed run state aligned with the cloud.

## Target Behavior

### Entry Flow

When entering expedition:

1. Call `loadPveSave()` and `loadPveMeta()`.
2. If `loadPveSave()` succeeds and returns a save, resume it.
3. If `loadPveSave()` succeeds and returns `null`, start a new run.
4. If `loadPveSave()` fails, stop bootstrap, show a retryable error, and do not create a local run.

### New Run Flow

When starting a new run:

1. Call `startRun()`.
2. If `resume:false`, create a local new expedition state from the returned `runSeed`.
3. If `resume:true`, do not create a local floor-1 state.
4. Instead, immediately reload the active save and resume it.
5. If the follow-up reload still fails, keep the player in the scene and report that the cloud save could not be recovered.

### Settlement Flow

When the player dies or clears the run:

1. Call `settlePveRun()`.
2. Only after success:
   - update local meta snapshot
   - show the result modal
   - leave to lobby
3. If settlement fails:
   - do not leave the scene
   - do not pretend the run was cleared
   - show a blocking/retryable error

## UX Requirements

- Never show a local floor-1 fresh run if the cloud still has an active high-floor save.
- Never auto-return to lobby after a failed settlement.
- Error copy should explicitly mention that cloud save cleanup may not have completed.
- Lobby "continue expedition" vs "new expedition" must continue to derive from cloud state only.

## Acceptance Criteria

- `loadSave` failure does not auto-start a new expedition.
- `startRun.resume === true` never creates a local floor-1 expedition state.
- Settlement failure never auto-navigates to lobby.
- After a failed settlement, re-entering expedition cannot silently show a fake fresh start.
- After a successful settlement, the old active save is no longer resumed on next entry.

## Implementation Notes

- Expected touch points:
  - `assets/scripts/pve/controllers/ExpeditionController.ts`
  - optionally small client-facing wording in `assets/scripts/lobby/PveLobbyController.ts`
- No cloud schema migration is required.
- No `cloudfunctions/common/**` logic change is required for the first pass unless testing shows server-side edge cases beyond current validation.

## Risks

- Network instability will become more visible to players because silent fallback is removed.
- If retry UX is too weak, users may feel "stuck" after a settlement error even though this is safer than showing a false reset.

## Recommendation

Implement this fix before the performance investigation, because save inconsistency can invalidate test observations and create misleading repro states across simulator and real device.
