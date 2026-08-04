# PVE Current Source of Truth Design

**Status:** approved  
**Date:** 2026-07-17

## Goal

The active workspace must describe and implement one PVE game. Source code, UI,
assets, tests, cloud handlers, database guidance, and design documents must agree
with the current runtime. Material that is not part of the current game is removed
instead of retained as compatibility code or historical guidance.

## Retained Game

- The permanent floor challenge flow and its stamina rules.
- The current Chapter 1 and Chapter 2 content, objectives, monsters, and combat
  behavior. Their current values remain frozen until the full chapter set is ready
  for a separate balance pass.
- The three current professions, their base combat identities, and mastery.
- The original fixed equipment catalog of more than 80 items and its current loot,
  inventory, loadout, settlement, and camp flow.
- Minghen, current strengthening, spirit burst, camp preparation, profile progress,
  and leaderboard progress.
- The current client/cloud challenge lifecycle and the shared original combat chain.

## Single-Source Rules

1. A feature without a current runtime entry point is removed from every active
   layer; it is not documented as an alternative or future restoration candidate.
2. Temporary catalogs and test-only gameplay definitions may not override the
   retained production catalogs.
3. No migration or compatibility branch is retained for pre-release account data.
4. Active design documents describe only the present game. Changelogs and retired
   alternatives do not remain in authoritative gameplay documents.
5. Tests assert current Chapter 1 and Chapter 2 behavior. They may not force a
   production rule to match an abandoned fixture or an unfinished chapter balance.

## Safe-Deletion Gate

Before deleting a module, field, asset, or document reference, trace its imports and
runtime callers from the current navigation entry points. Shared helpers used by a
retained system stay in place even if an obsolete caller used them previously.

A cleanup batch is accepted only when:

- `npm run typecheck:game` passes;
- the directly affected client and cloud tests pass;
- the complete client and cloud suites have no failures caused by the batch;
- the lobby, camp, floor start/resume, combat, settlement, and next-floor paths
  remain connected;
- the cloud shared-source synchronization check passes after any cloud edit; and
- current PVE design documents match the retained runtime.

If a deletion breaks a retained path, restore the required shared capability and
remove only the obsolete caller or data shape. Do not recreate a second gameplay
path.

## Completion Criteria

- The active workspace contains one equipment catalog, one monster catalog per
  chapter, one profession model, one challenge flow, and one combat chain.
- Current source, UI, tests, comments, cloud code, and documentation contain no
  references that can be mistaken for an alternative gameplay implementation.
- No combat-number rebalance is included in this cleanup.
- The current Chapter 1 and Chapter 2 playable flow passes automated regression and
  a manual Cocos smoke test before release.
