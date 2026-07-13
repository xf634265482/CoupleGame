# PVE Chapter One Flow Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the chapter-one chest rendering, movement ghosting, settlement transaction conflict, and floor-three premature completion without changing established combat or AP rules.

**Architecture:** Keep `ExpeditionController` as the existing scene entry and make the smallest changes beneath it. Put deterministic floor/objective rules in framework-free PVE core, keep visual cleanup in the map/toast views, and serialize persistence writes before the idempotent cloud settlement.

**Tech Stack:** TypeScript, Cocos Creator 3.8.8, ts-jest, Node.js cloud functions, WeChat CloudBase transactions.

## Global Constraints

- PVE core must not import `cc` or call `Math.random()` directly.
- `cloudfunctions/common/` is the only authoritative shared cloud source; run `node scripts/sync-cloud-common.js` after editing it.
- Preserve the established AP roll, movement cost, attack rules, and automatic end-turn behavior.
- Reuse existing chest, rock, goblin warrior, and goblin archer assets and behavior.
- The shared worktree is dirty; do not revert user changes and do not commit files containing pre-existing uncommitted work.

---

### Task 1: Floor-three blockade and objective gate

**Files:**
- Modify: `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts`
- Modify: `assets/scripts/pve/core/objectives/Chapter1Objectives.ts`
- Test: `test/pve/Chapter1Floor1to7.test.ts`
- Test: `test/pve/Chapter1Objectives.test.ts`

**Interfaces:**
- Consumes: `Chapter1FloorDefinition.fixedWalls`, `fixedMonsters`, and `ObjectiveEvent.ENTITY_KILLED`.
- Produces: floor-three blockers `F3_GATE_W1`, `F3_GATE_W2`, `F3_GATE_A1`, `F3_GATE_A2`; `createSingleAltarObjective()` tracks all four IDs.

- [ ] **Step 1: Add failing layout and objective tests**

Assert that floor 3 has two seven-rock horizontal rows with a central opening, exactly four named existing goblins, and that `ALTAR_DESTROYED` remains active until all blocker IDs receive `ENTITY_KILLED`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:pve -- --runInBand test/pve/Chapter1Floor1to7.test.ts test/pve/Chapter1Objectives.test.ts`

Expected: FAIL because the current layout has two rocks and the altar objective does not track gate monsters.

- [ ] **Step 3: Implement the deterministic layout and gate state**

Use rows `y=3` and `y=4`, rocks at `x=0,1,2,3,5,6,7`, warriors at `(4,4)` and `(4,3)`, archers at `(3,2)` and `(5,2)`. Initialize objective data with the four blocker IDs, remove IDs on kill, and complete only when the altar is destroyed, blockers are empty, and altar summons are empty.

- [ ] **Step 4: Run focused tests**

Expected: both suites PASS with no changes to AP or combat tests.

### Task 2: Settlement serialization and immediate presentation

**Files:**
- Modify: `assets/scripts/pve/core/PersistentFloorFlow.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `cloudfunctions/common/pve/PveChallenge.js`
- Test: `test/pve/PersistentFloorFlow.test.ts`
- Test: `cloudfunctions/common/__tests__/PveChallenge.test.js`

**Interfaces:**
- Consumes: idempotent `settleFloorChallenge(request)` and the controller's `_persistentSaveInFlight`.
- Produces: a single settlement promise per cleared challenge; pending runtime saves are cancelled and in-flight saves finish before settlement starts.

- [ ] **Step 1: Add failing persistence tests**

Cover one in-flight save followed by settlement, duplicate settlement calls returning the same reward once, and a retryable CloudBase transaction conflict that succeeds without changing the selected reward.

- [ ] **Step 2: Run focused client and cloud tests and verify failure**

Run: `npm run test:pve -- --runInBand test/pve/PersistentFloorFlow.test.ts`

Run: `npm --prefix cloudfunctions/common test -- --runInBand __tests__/PveChallenge.test.js`

Expected: FAIL because settlement currently performs an immediate generic retry and the controller exposes the error before a later action.

- [ ] **Step 3: Implement single-flight settlement**

Cache the settlement promise for the current challenge, classify only `TransactionConflict`/`-501001` as retryable, and retry inside the same operation without altering request data. Remove the fixed user-facing delay. In the controller, close reward selection immediately, create the settlement promise, then show the continue/return dialog while the promise is running; await it only when applying the chosen navigation.

- [ ] **Step 4: Remove the save/settle collision**

On terminal runtime, clear `_persistentSaveTimer`, clear the dirty flag, await only an already-running save, and prevent its `.finally()` branch from scheduling another save while `_persistentSettling` is true. Keep server settlement idempotent by `challengeId`.

- [ ] **Step 5: Run focused tests**

Expected: client and cloud persistence tests PASS; no duplicate reward entry appears.

### Task 3: Choice-node lifecycle safety

**Files:**
- Modify: `assets/scripts/pve/views/PveToastView.ts`
- Modify: `assets/scripts/fx/fxRuntime.ts` only if the view-level guard is insufficient
- Test: `test/pve/PlaybackGuard.test.ts`

**Interfaces:**
- Consumes: `Effects.stop(node)` and `_deferChoiceAction`.
- Produces: idempotent choice close that cannot run a pending animation against a removed node.

- [ ] **Step 1: Add a lifecycle contract test**

Verify a deferred choice action settles once even if close/destroy happens in the same microtask, and verify cleanup can be called twice.

- [ ] **Step 2: Implement safe close ordering**

Mark the choice closed, detach callbacks, stop effects while nodes are valid, remove the choice node, and destroy it on the following microtask. Do not invoke `fade`, `pop`, or component lookup after removal.

- [ ] **Step 3: Run the lifecycle and settlement tests**

Expected: PASS and no `findComponent/getComponent length of null` path remains.

### Task 4: Chest fallback and movement visual reset

**Files:**
- Modify: `assets/scripts/pve/views/FogMapView.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Test: `test/pve/OriginalCombatChainContract.test.ts`
- Test: `test/pve/PlaybackGuard.test.ts`

**Interfaces:**
- Consumes: `FogMapView.cloneOccupantForFx`, `setOccupantVisible`, cached `pve/map/icon_chest`.
- Produces: one clean move clone per entity and a deterministic chest sprite/text fallback.

- [ ] **Step 1: Extend contract tests**

Assert the original AP/end-turn calls remain in the controller, MOVE uses one playback path, and chest rendering maps to `pve/map/icon_chest` with `箱` fallback.

- [ ] **Step 2: Normalize movement clones**

Before playback, clear stale move clones, reset clone sprite color to white, reset opacity and scale, use one coordinate space, hide the final occupant exactly once, and restore it from a single completion/timeout cleanup path. Remove the dead duplicate MOVE branch that indexes `_moveGhosts` by coordinates.

- [ ] **Step 3: Clear stale overlays and preserve chest fallback**

Clear warning/target/transient overlays on floor refresh and transition. Keep the chest art node hidden only while loading; if loading fails, leave the gold `箱` fallback visible instead of a colored square.

- [ ] **Step 4: Run focused visual contracts and PVE tests**

Run: `npm run test:pve -- --runInBand test/pve/OriginalCombatChainContract.test.ts test/pve/PlaybackGuard.test.ts test/pve/Chapter1ExpeditionFactory.test.ts`

Expected: PASS.

### Task 5: Documentation, synchronization, and full verification

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `specs/260712-pve-persistent-floor-progression/chapter-1-content.md`
- Generated copies: `cloudfunctions/*/common/pve/PveChallenge.js`

**Interfaces:**
- Consumes: completed behavior from Tasks 1–4.
- Produces: authoritative docs and deployable cloud copies.

- [ ] **Step 1: Sync the approved behavior into the PVE design documents**

Add the floor-three blockade, single-path movement, chest fallback, and immediate/background settlement acceptance rules without deleting existing design history.

- [ ] **Step 2: Synchronize cloud common copies**

Run: `node scripts/sync-cloud-common.js`

Expected: all deployable cloud-function common copies match `cloudfunctions/common`.

- [ ] **Step 3: Run focused suites**

Run the focused commands from Tasks 1–4 and fix only regressions caused by this change.

- [ ] **Step 4: Run full PVE and cloud test suites**

Run: `npm run test:pve -- --runInBand`

Run: `npm --prefix cloudfunctions/common test -- --runInBand`

Expected: all newly added tests pass; any pre-existing unrelated failures are reported separately with exact names.

- [ ] **Step 5: Run TypeScript/build-oriented validation**

Run the repository's existing typecheck/build validation from `package.json`. Do not delete the active Cocos build output to work around file locks.

- [ ] **Step 6: Report the exact user test path**

List whether `pve` must be redeployed, whether Cocos must be rebuilt, how to reset the active expedition, and the four manual checks corresponding to the approved design.
