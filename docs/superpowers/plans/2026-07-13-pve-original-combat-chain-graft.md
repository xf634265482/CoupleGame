# PVE Original Combat Chain Graft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the proven `ExpeditionController + ExpeditionState` combat chain as the only PVE runtime, then graft permanent-floor progression, Chapter 1 objectives, fixed equipment, professions, spirit burst, and Minghen onto that chain without reviving retired random-growth systems.

**Architecture:** `ExpeditionState` remains the sole authoritative battle state and all player actions continue through the original core functions and event playback. `FloorChallengeRuntimeState` becomes a versioned cloud envelope containing an `ExpeditionState` snapshot plus Chapter 1 objective/profession/Minghen adjunct state; `PersistentFloorFlow` owns only challenge bootstrap, save, settlement, and next-floor lifecycle. `PersistentFloorBattleController`, its simplified action functions, and its duplicated animation bridge are removed from the runtime path after the original scene/controller is restored.

**Tech Stack:** Cocos Creator 3.8.8, TypeScript, ts-jest, WeChat CloudBase cloud functions, deterministic seeded RNG.

## Global Constraints

- Preserve unrelated dirty-worktree changes; never reset or replace whole files merely to recover the old controller.
- `assets/scenes/pve_expedition.scene` must mount `ExpeditionController`, and no runtime path may mount `PersistentFloorBattleController`.
- Movement remains `MovementSystem.applyMove`; attack remains the original `CombatSystem` event chain; turn progression remains `ExpeditionState.endTurn`; rendering remains `_apply` → `_playEvents` → `_playMoveFx` / `_playFxFor`.
- Base movement costs exactly `2 AP`; each new floor and each new player turn rolls exactly `8 + 1d6` (`9–14 AP`) using `core/rng.ts`.
- High-frequency movement and attacks are local-first. Cloud save runs after turn end and before leaving the scene, never while holding the input lock for an ordinary move or attack.
- Fog is stored only in `FloorState.revealed`; no View-owned revealed-cell set is an authoritative source.
- Core files must not import `cc` or call `Math.random()`.
- New fixed equipment, profession rules, Minghen, and objectives must extend the original event stream; they must not create parallel move, attack, monster-turn, AP, or animation implementations.
- Retired random equipment drops, random affixes, spirit three-choice strengthening, destiny tree, chapter camp, old class fragments/awakening, old stamina, and old expedition settlement stay disabled in persistent-floor mode.
- Modify cloud shared source only under `cloudfunctions/common/`, then run `node scripts/sync-cloud-common.js`.
- Any PVE rule change must update both `specs/260608-pve-destiny-expedition/design.md` and `specs/260712-pve-persistent-floor-progression/design.md`.
- Do not expand Chapter 2–5 content in this plan; first make Chapter 1 floors 1–7 pass as one complete test slice.

---

## File Structure and Ownership

| File | Responsibility after this change |
|---|---|
| `assets/scripts/pve/controllers/ExpeditionController.ts` | The only battle controller: input, original event playback, persistent lifecycle routing, local dirty-save scheduling. |
| `assets/scripts/pve/core/ExpeditionState.ts` | Original turn/AP/monster lifecycle; exposes a standalone floor-state constructor without enabling old cross-floor progression. |
| `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` | New pure adapter: creates/resumes V2 challenge envelopes, synchronizes the envelope from `ExpeditionState`, and reduces original `PveEvent[]` into objective/profession/Minghen state. |
| `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts` | Converts fixed Chapter 1 floor definitions/profile loadout into official `RunPlayer`, `FloorState`, monsters, entities, fog, and first-turn AP. |
| `assets/scripts/pve/core/PersistentFloorFlow.ts` | Challenge/profile start-load-save-settle-continue orchestration only. No movement, attack, monster AI, AP, fog, or rendering rules. |
| `assets/scripts/pve/core/FloorChallengeState.ts` | V2 envelope/schema and migration version. |
| `assets/scripts/pve/core/PersistentCombatRules.ts` | Fixed-weapon target shape plus profession attack/move/spirit decisions injected into original combat functions. |
| `assets/scripts/pve/core/PersistentFloorBattle.ts` | Deleted after callers are removed; its simplified move/attack/end-turn implementations are forbidden. |
| `assets/scripts/pve/views/PersistentFloorBattleView.ts` | Deleted after callers are removed; original `FogMapView`, `PveHudView`, `PveMessageLog`, and `PveToastView` remain. |
| `cloudfunctions/common/pve/PveChallenge.js` | V2 runtime validation and one-time V1 active-challenge replacement acceptance. |

---

### Task 1: Lock the Original Scene and Combat-Chain Contract

**Files:**
- Modify: `test/pve/PersistentFloorSceneBinding.test.ts`
- Create: `test/pve/OriginalCombatChainContract.test.ts`
- Modify: `assets/scenes/pve_expedition.scene:274`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts:56,1248-1255`
- Modify: `PROJECT_NAVIGATION.md`
- Modify: `CALL_FLOW.md:39-99`

**Interfaces:**
- Consumes: Cocos component UUID metadata for both battle controllers.
- Produces: a scene that mounts only `ExpeditionController`; a regression test that rejects dynamic mounting or self-disabling.

- [ ] **Step 1: Rewrite the scene-binding test to require the original controller**

```ts
it('mounts ExpeditionController as the only PVE battle controller', () => {
  const scene = readFileSync(resolve(ROOT, 'assets/scenes/pve_expedition.scene'), 'utf8');
  expect(scene).toContain(`\"__type__\": \"${compressUuid(expeditionMeta.uuid)}\"`);
  expect(scene).not.toContain(`\"__type__\": \"${compressUuid(persistentMeta.uuid)}\"`);
});
```

- [ ] **Step 2: Add a source contract test that fails on the current takeover code**

```ts
test('ExpeditionController does not disable itself or mount a parallel controller', () => {
  const source = readFileSync(resolve(ROOT, 'assets/scripts/pve/controllers/ExpeditionController.ts'), 'utf8');
  expect(source).not.toContain("import { PersistentFloorBattleController }");
  expect(source).not.toContain('this.enabled = false');
  expect(source).not.toContain('addComponent(PersistentFloorBattleController)');
});
```

- [ ] **Step 3: Run the two tests and verify they fail before the fix**

Run: `npx jest --roots test/pve --runInBand test/pve/PersistentFloorSceneBinding.test.ts test/pve/OriginalCombatChainContract.test.ts`

Expected: FAIL because the scene contains UUID `87672...`, and `ExpeditionController.onLoad()` disables itself.

- [ ] **Step 4: Surgically restore the original binding and startup**

Change only the scene component type back to compressed UUID `c2ce39rxyNNRYzbFuMQr758`. Remove the `PersistentFloorBattleController` import and these four takeover statements from `onLoad()`:

```ts
this.enabled = false;
if (!this.node.getComponent(PersistentFloorBattleController)) {
  this.node.addComponent(PersistentFloorBattleController);
}
return;
```

Keep all unrelated existing fixes in `ExpeditionController.ts` intact.

- [ ] **Step 5: Update navigation before deeper code changes**

Document the new entry path exactly as:

```text
pve_expedition.scene
  → ExpeditionController.onLoad()
  → ExpeditionController._bootstrapPersistentFloor()
  → PersistentFloorFlow.bootstrap()
  → FloorChallengeRuntimeState<PersistentExpeditionBattleState>
  → ExpeditionController._state = runtime.battleState.expedition
```

Mark `PersistentFloorBattleController`, `PersistentFloorBattle`, and `PersistentFloorBattleView` as migration-only files pending deletion, not recommended entry points.

- [ ] **Step 6: Run the tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/PersistentFloorSceneBinding.test.ts test/pve/OriginalCombatChainContract.test.ts`

Expected: PASS.

```bash
git add assets/scenes/pve_expedition.scene assets/scripts/pve/controllers/ExpeditionController.ts test/pve/PersistentFloorSceneBinding.test.ts test/pve/OriginalCombatChainContract.test.ts PROJECT_NAVIGATION.md CALL_FLOW.md
git commit -m "fix(pve): restore original expedition combat controller"
```

---

### Task 2: Introduce the V2 Challenge Envelope and One-Time Runtime Rebuild

**Files:**
- Modify: `assets/scripts/pve/core/FloorChallengeState.ts`
- Modify: `assets/scripts/pve/core/FloorChallengeLifecycle.ts`
- Create: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Create: `test/pve/PersistentExpeditionRuntime.test.ts`
- Modify: `test/pve/FloorChallengeLifecycle.test.ts`

**Interfaces:**
- Consumes: `FloorChallengeSnapshot`, `PveProfile`, official `ExpeditionState`, Chapter 1 objective types.
- Produces:
  - `FLOOR_RUNTIME_VERSION = 2`
  - `PersistentExpeditionBattleState`
  - `syncRuntimeFromExpedition(runtime, expedition, now)`
  - `resumePersistentRuntimeV2(snapshot, serialized)`

- [ ] **Step 1: Write failing V2 envelope tests**

Cover all of these assertions:

```ts
expect(runtime.version).toBe(2);
expect(runtime.battleState.expedition.floorState.ap).toBeGreaterThanOrEqual(9);
expect(runtime.battleState.expedition.floorState.ap).toBeLessThanOrEqual(14);
expect(runtime.resources.ap).toBe(runtime.battleState.expedition.floorState.ap);
expect(runtime.turn).toBe(runtime.battleState.expedition.floorState.turn);
```

For serialized V2, assert exact `FloorState.revealed`, RNG, HP, AP, objective state, challenge ID, floor, seed, and frozen config restoration. Assert a V1 payload throws `FLOOR_RUNTIME_VERSION_MISMATCH`; Task 3 owns the deliberate rebuild because only the Chapter 1 factory can create a valid replacement battle state.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/FloorChallengeLifecycle.test.ts test/pve/PersistentExpeditionRuntime.test.ts`

Expected: FAIL because `FLOOR_RUNTIME_VERSION` is still `1` and no official expedition payload exists.

- [ ] **Step 3: Define the V2 battle payload and mirror rule**

```ts
export const FLOOR_RUNTIME_VERSION = 2 as const;

export interface PersistentExpeditionBattleState {
  expedition: ExpeditionState;
  objective: FloorObjectiveState;
  pendingCommands: ObjectiveCommand[];
  profession: FloorProfessionRuntimeState;
  minghenMemory: MinghenTriggerMemory;
  rewardCatalog: {
    minghenIds: string[];
    equipmentIds: string[];
    optionalObjectiveIds: string[];
  };
}
```

The official source is `battleState.expedition`. Outer `resources`, `turn`, and `rngState` are serialized/cloud-validation mirrors only. Every mutation must finish with:

```ts
export function syncRuntimeFromExpedition(
  runtime: FloorChallengeRuntimeState<PersistentExpeditionBattleState>,
  expedition: ExpeditionState,
  now = Date.now(),
): FloorChallengeRuntimeState<PersistentExpeditionBattleState> {
  return {
    ...runtime,
    status: expedition.status === 'DEAD' ? 'DEAD' : runtime.status,
    resources: {
      ...runtime.resources,
      hp: expedition.player.hp,
      maxHp: expedition.player.maxHp,
      ap: expedition.floorState.ap,
      maxAp: expedition.floorState.maxAp,
      spirit: expedition.player.anima,
    },
    turn: expedition.floorState.turn,
    rngState: expedition.floorState.rngState,
    battleState: { ...runtime.battleState, expedition },
    updatedAt: now,
  };
}
```

- [ ] **Step 4: Implement strict V2 resume behavior**

`resumePersistentRuntimeV2` must parse only once. If both wrapper and runtime versions are `2`, validate challenge/floor/seed/config and return the saved runtime. V1, malformed, mismatched, or non-active payloads throw their existing explicit error codes; the caller must not silently accept invalid V2 state.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/FloorChallengeLifecycle.test.ts test/pve/PersistentExpeditionRuntime.test.ts`

Expected: PASS.

```bash
git add assets/scripts/pve/core/FloorChallengeState.ts assets/scripts/pve/core/FloorChallengeLifecycle.ts assets/scripts/pve/core/PersistentExpeditionRuntime.ts test/pve/FloorChallengeLifecycle.test.ts test/pve/PersistentExpeditionRuntime.test.ts
git commit -m "feat(pve): add v2 official expedition challenge runtime"
```

---

### Task 3: Build Chapter 1 Floors Directly as Official `FloorState`

**Files:**
- Create: `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`
- Modify: `assets/scripts/pve/core/chapter1/Chapter1Runtime.ts`
- Modify: `test/pve/Chapter1Floor1to7.test.ts`
- Create: `test/pve/Chapter1ExpeditionFactory.test.ts`

**Interfaces:**
- Consumes: `generateChapter1Floor()`, profile loadout, `rollAp()`, `createFogGrid()`, `revealAround()`.
- Produces: `createChapter1ExpeditionState(snapshot, profile): ExpeditionState`, `createPersistentFloorRuntime(snapshot, profile, now)`, `resumeOrRebuildPersistentRuntime(snapshot, serialized, profile, now)`, and `initialPersistentPresentationEvents(runtime): PveEvent[]`.

- [ ] **Step 1: Write factory tests for all seven floors**

For floors 1–7, assert:

```ts
expect(state.floor).toBe(floor);
expect(state.floorState.floor).toBe(floor);
expect(state.floorState.ap).toBeGreaterThanOrEqual(9);
expect(state.floorState.ap).toBeLessThanOrEqual(14);
expect(state.floorState.maxAp).toBe(state.floorState.ap);
expect(state.floorState.revealed.flat().some(Boolean)).toBe(true);
expect(state.floorState.revealed.flat().every(Boolean)).toBe(false);
expect(state.floorState.entities.some(entity => entity.type === 'ROCK')).toBe(true);
```

Also assert floor 1 contains a key and exit, floor 3 has wave-one monsters, floor 6 has three destructible altars, and floor 7 contains the Goblin Chief.

- [ ] **Step 2: Run and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/Chapter1ExpeditionFactory.test.ts test/pve/Chapter1Floor1to7.test.ts`

Expected: FAIL because the fixed Chapter 1 catalog is not yet converted to official state.

- [ ] **Step 3: Implement deterministic floor conversion**

Use `GeneratedChapter1Floor` as immutable content input. Convert walls to `ROCK`, objective cells to the required `KEY`/`ALTAR` entities, and exits to `EXIT`. Convert each spawn to a full `Monster` with `variantId`, role-derived `MonsterType`, deterministic stats, `aggroRadius`, and `aiState`. Initialize fog as:

```ts
const revealed = createFogGrid(map.size);
const initialReveal = revealAround(revealed, map.player);
const rng = createRng(hashSeed(`${snapshot.seed}:floor:${snapshot.floor}:turn:1`));
const { dice, ap } = rollAp(rng);
```

Store `rng.state()` in `FloorState.rngState`, and generate the initial `REVEAL`/`AP_ROLLED` presentation events from the returned coordinates and roll.

Expose those two initial events through `initialPersistentPresentationEvents(runtime)` so the controller can reuse `_playEvents` without inventing a second entry-animation path.

- [ ] **Step 4: Build a persistent `RunPlayer` without retired systems**

Map professions exactly: `WARRIOR → BERSERKER`, `ARCHER → ARCHER`, `RANGER → ROGUE`. Set old `classTraits`, random bag, scrolls, relics, destiny-tree bonuses, fragments, and pending tree choices to empty/absent. Convert equipped fixed items to deterministic `EquipItem` display/stat carriers, but store fixed definition IDs separately in the challenge config so Task 6 can apply shape/range/AP rules without random affixes.

- [ ] **Step 5: Add the one-time V1 rebuild wrapper now that the factory exists**

`resumeOrRebuildPersistentRuntime` parses the wrapper header once. It rebuilds only when both stored version fields are the known V1 value `1`, then calls `createPersistentFloorRuntime(snapshot, profile, now)`. Malformed JSON, unknown versions, and snapshot/config mismatches continue to throw. Add tests proving the rebuilt state keeps the existing challenge/floor/seed/config while permanent profile equipment, Minghen, profession, and progress remain untouched.

- [ ] **Step 6: Run tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/Chapter1ExpeditionFactory.test.ts test/pve/Chapter1Floor1to7.test.ts test/pve/ApSystem.test.ts test/pve/MovementSystem.test.ts`

Expected: PASS; movement tests still assert base cost `2`.

```bash
git add assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts assets/scripts/pve/core/PersistentExpeditionRuntime.ts assets/scripts/pve/core/ExpeditionState.ts assets/scripts/pve/core/chapter1/Chapter1Runtime.ts test/pve/Chapter1ExpeditionFactory.test.ts test/pve/Chapter1Floor1to7.test.ts
git commit -m "feat(pve): generate chapter one as official expedition state"
```

---

### Task 4: Make `PersistentFloorFlow` Lifecycle-Only and Wire It into the Original Controller

**Files:**
- Modify: `assets/scripts/pve/core/PersistentFloorFlow.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/network/PveProgressionService.ts`
- Modify: `test/pve/PersistentFloorFlow.test.ts`
- Create: `test/pve/PersistentControllerSourceContract.test.ts`

**Interfaces:**
- Consumes: V2 factory/resumer, `startFloorChallenge`, `saveFloorChallengeRuntime`, `settleFloorChallenge`.
- Produces: `PersistentFloorFlowState.runtime` typed as `FloorChallengeRuntimeState<PersistentExpeditionBattleState>`; original controller local-save hooks.

- [ ] **Step 1: Write failing flow and source-contract tests**

Assert bootstrap produces AP `9–14`, V1 active saves rebuild under the same challenge ID, and V2 saves preserve fog. Source-contract assertions must prove controller input still calls `applyMove`, `playerAttack`, and `endTurn`, while no import from `PersistentFloorBattle` exists.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/PersistentFloorFlow.test.ts test/pve/PersistentControllerSourceContract.test.ts`

Expected: FAIL because the flow still owns `Chapter1PlayableState` and the controller still boots the old save API.

- [ ] **Step 3: Convert flow bootstrap to V2**

Replace `startChapter1Runtime` / `resumeFloorRuntime<Chapter1BattleState>` with:

```ts
const runtime = challenge.runtimeSave
  ? resumeOrRebuildPersistentRuntime(challenge, challenge.runtimeSave, profile)
  : createPersistentFloorRuntime(challenge, profile);
```

`updateRuntime`, `save`, `settle`, and `continueNextFloor` remain lifecycle methods. They must not import movement, combat, AP, monster AI, Cocos, or views.

- [ ] **Step 4: Add a persistent bootstrap path to `ExpeditionController`**

`onLoad()` continues to build the original UI, then calls `_bootstrapPersistentFloor()` instead of the retired `_bootstrap()`. After bootstrap:

```ts
this._floorFlowState = flowState;
this._state = flowState.runtime.battleState.expedition;
this._rebuildInputHints();
this._log?.clear();
this._refreshAll();
await this._playEvents(initialPresentationEvents(flowState.runtime));
```

Keep the old `_bootstrap`, `_beginNewRun`, `_resumeRun`, and old settlement helpers temporarily private but unreachable until Task 8 removes them. This minimizes the first integration diff and protects unrelated historical fixes.

- [ ] **Step 5: Add dirty-save scheduling without input latency**

After `_apply` completes event playback, synchronize the V2 runtime and set `_persistentSaveDirty = true`. On `TURN_END`, queue one save with `setTimeout(0)`. Before returning to the lobby, await the latest queued save. Ordinary move/attack must never `await saveFloorChallengeRuntime()` and `_busy` must be released before the cloud call starts.

- [ ] **Step 6: Run tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/PersistentFloorFlow.test.ts test/pve/PersistentControllerSourceContract.test.ts test/pve/ExpeditionState.test.ts test/pve/MovementSystem.test.ts`

Expected: PASS.

```bash
git add assets/scripts/pve/core/PersistentFloorFlow.ts assets/scripts/pve/controllers/ExpeditionController.ts assets/scripts/network/PveProgressionService.ts test/pve/PersistentFloorFlow.test.ts test/pve/PersistentControllerSourceContract.test.ts
git commit -m "feat(pve): graft floor lifecycle onto original controller"
```

---

### Task 5: Reduce Original Events into Seven Floor Objectives and Settlement

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/objectives/Chapter1Objectives.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/views/PveToastView.ts`
- Modify: `test/pve/Chapter1Objectives.test.ts`
- Create: `test/pve/PersistentObjectiveEventBridge.test.ts`

**Interfaces:**
- Consumes: original `PveEvent[]` from move/attack/end-turn/interact.
- Produces: `applyPersistentBattleResult(runtime, result, now): { runtime; result }`, with objective-generated events appended to the same playback list.

- [ ] **Step 1: Write event-bridge tests**

Cover exact mappings:

```text
PICK_KEY                  → KEY_ACQUIRED
EXIT interaction success → EXIT_INTERACTED
KILL elite               → ENTITY_KILLED
TURN_END                 → PLAYER_TURN_ENDED
wave monsters all DEAD   → WAVE_CLEARED
messenger reaches exit   → TARGET_ESCAPED
altar hp reaches 0       → ALTAR_DESTROYED
Goblin Chief KILL        → ENTITY_KILLED
PLAYER_DEAD/state DEAD   → PLAYER_DIED
```

Assert objective completion changes official `floorState.status` to `CLEARED`, runtime status to `CLEAR`, and leaves exactly one `FLOOR_CLEARED` event even when the original interaction already emitted one. Assert failure/death never invokes old `applyDeath()`.

- [ ] **Step 2: Run and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/Chapter1Objectives.test.ts test/pve/PersistentObjectiveEventBridge.test.ts`

Expected: FAIL because original events are not yet connected to new objectives.

- [ ] **Step 3: Implement the pure event reducer**

`applyPersistentBattleResult` must process events in order, update objective/profession/Minghen adjunct state, consume commands, then synchronize the official state and envelope. `WARN_WAVE` becomes a Chinese battlefield message; `SPAWN_WAVE` adds official `Monster` objects before the next player turn. No controller switch statement may duplicate objective rules.

- [ ] **Step 4: Add a persistent-only `_afterApply` branch**

At the start of `_afterApply`, route persistent mode to `_afterPersistentApply()` and return. That branch may auto-pick the official key, process death, or open the new floor settlement. It must not execute old fragment pickup, portal spawning, random drop, camp, `advanceFloor`, or old run settlement.

- [ ] **Step 5: Show the objective permanently in Chinese**

Use the existing guide bubble/message panel. Floor 1 must display exactly:

```text
本层目标：先探索并取得钥匙
再前往出口点击「互动」
```

After pickup it becomes:

```text
本层目标：钥匙已取得 ✓
前往出口并点击「互动」即可通关
```

All internal error codes remain console-only; player Toasts go through the existing Chinese error mapper.

- [ ] **Step 6: Route clear/death through the new idempotent settlement**

On clear, show reward choice using existing `PveToastView`, call `flow.settle()` once, then offer “继续下一层 / 返回营地”. On death/withdraw, call the same settlement with no reward choice and return to the lobby. Never call `savePveFloor`, `settlePveRun`, `advanceFloor`, or the old chapter camp in persistent mode.

- [ ] **Step 7: Run tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/Chapter1Objectives.test.ts test/pve/PersistentObjectiveEventBridge.test.ts test/pve/PersistentFloorFlow.test.ts`

Expected: PASS.

```bash
git add assets/scripts/pve/core/PersistentExpeditionRuntime.ts assets/scripts/pve/core/objectives/Chapter1Objectives.ts assets/scripts/pve/controllers/ExpeditionController.ts assets/scripts/pve/views/PveToastView.ts test/pve/Chapter1Objectives.test.ts test/pve/PersistentObjectiveEventBridge.test.ts
git commit -m "feat(pve): bridge original combat events to floor objectives"
```

---

### Task 6: Inject Fixed Weapons and Profession Rules into the Original Attack Chain

**Files:**
- Create: `assets/scripts/pve/core/PersistentCombatRules.ts`
- Modify: `assets/scripts/pve/core/CombatSystem.ts`
- Modify: `assets/scripts/pve/core/MovementSystem.ts`
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`
- Modify: `assets/scripts/pve/core/PveTypes.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `test/pve/CombatSystem.test.ts`
- Modify: `test/pve/ProfessionActionSystem.test.ts`
- Create: `test/pve/PersistentCombatRules.test.ts`

**Interfaces:**
- Consumes: fixed equipment definition, frozen profession config, profession runtime, mastery level, selected target, optional warrior charge choice.
- Produces:
  - `previewPersistentAttack(runtime, targetId, choice)`
  - `applyPersistentAttack(runtime, targetId, choice): ApplyResult`
  - profession events appended to `PveEvent`.

- [ ] **Step 1: Write failing compatibility tests**

Assert legacy `playerAttack(state, id)` behavior is unchanged when persistent context is absent. In persistent context assert weapon AP/range/shape for W01–W07/B01, warrior extra AP, archer aim changes, ranger move/attack alternation, and `endTurn` reset rules. Assert every successful result still contains original `ATTACK`, `KILL`, `PLAYER_DAMAGED`, `MOVE`, `TURN_END`, and `AP_ROLLED` events as applicable.

- [ ] **Step 2: Run and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/CombatSystem.test.ts test/pve/ProfessionActionSystem.test.ts test/pve/PersistentCombatRules.test.ts`

Expected: FAIL because fixed equipment/profession choices are not yet injected into the original attack calculation.

- [ ] **Step 3: Add an optional persistent combat context**

Extend, do not replace, original APIs:

```ts
export interface PersistentAttackContext {
  definition: FixedEquipmentDefinition;
  profession: ProfessionAttackResolution;
}

export function playerAttack(
  state: ExpeditionState,
  monsterId: string,
  context?: PersistentAttackContext,
): ApplyResult;
```

Without context, run byte-for-byte-equivalent legacy calculations. With context, override AP cost, min/max range, damage coefficient, armor penetration, knockback, and secondary target shape, but reuse the original `resolveHit`, RNG advancement, event emission, monster death state, and animation events.

- [ ] **Step 4: Inject movement/turn profession bookkeeping without replacing movement or end turn**

After `MovementSystem.applyMove` succeeds, update the adjunct profession state from the emitted `MOVE`; never call `commitProfessionMove` to move the player or spend AP a second time. After `ExpeditionState.endTurn`, update archer/ranger/warrior adjunct state using the actual rolled AP; never pass a hard-coded `8` into `endProfessionTurn`.

- [ ] **Step 5: Wire original controller controls**

The existing attack button still selects/focuses targets and calls `_apply`. Warrior charge and spirit buttons are added to the existing `PveHudView` callback set; they only set/preview choices or call a pure persistent rule, then feed the resulting `ApplyResult` through `_apply`.

- [ ] **Step 6: Run tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/CombatSystem.test.ts test/pve/MovementSystem.test.ts test/pve/ExpeditionState.test.ts test/pve/ProfessionActionSystem.test.ts test/pve/PersistentCombatRules.test.ts`

Expected: PASS, including old combat regressions.

```bash
git add assets/scripts/pve/core/PersistentCombatRules.ts assets/scripts/pve/core/CombatSystem.ts assets/scripts/pve/core/MovementSystem.ts assets/scripts/pve/core/ExpeditionState.ts assets/scripts/pve/core/PveTypes.ts assets/scripts/pve/controllers/ExpeditionController.ts test/pve/CombatSystem.test.ts test/pve/ProfessionActionSystem.test.ts test/pve/PersistentCombatRules.test.ts
git commit -m "feat(pve): inject fixed weapons and professions into original combat"
```

---

### Task 7: Route Minghen and Spirit Through the Same Event Stream

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/minghen/MinghenEventContext.ts`
- Modify: `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- Modify: `assets/scripts/pve/core/SpiritBurstSystem.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/views/PveHudView.ts`
- Modify: `test/pve/MinghenEffects.test.ts`
- Modify: `test/pve/ProfessionSystems.test.ts`
- Create: `test/pve/PersistentEventExtensionOrder.test.ts`

**Interfaces:**
- Consumes: ordered original `PveEvent[]` and frozen config.
- Produces: deterministic derived effects/events, applied once per source event.

- [ ] **Step 1: Write failing event-order tests**

Assert the order is always:

```text
original action state/events
  → profession state reaction
  → Minghen trigger reaction
  → spirit gain/consumption
  → objective reaction
  → one combined event playback
```

Assert duplicate copies of one Minghen stack by configured count, but a single source event cannot trigger the same installed copy twice. Assert active spirit burst never chooses movement or attacks automatically.

- [ ] **Step 2: Run and verify failure**

Run: `npx jest --roots test/pve --runInBand test/pve/MinghenEffects.test.ts test/pve/ProfessionSystems.test.ts test/pve/PersistentEventExtensionOrder.test.ts`

Expected: FAIL because the new systems are not consuming official events yet.

- [ ] **Step 3: Implement a single deterministic extension reducer**

Convert official events to `MinghenEventContext` without reading View state. Store trigger memory and spirit/profession state in the V2 payload. Return derived `PveEvent[]` so damage/heal/shield/status changes use original Toast, damage-number, HUD, and log playback.

- [ ] **Step 4: Keep retired strengthening disabled**

Persistent mode must skip `ANIMA_STRENGTHEN` / `STRENGTHEN_TRIGGERED` choices and never append old `strengthen_*` IDs to `RunPlayer.classTraits`. Spirit reaches 100, waits for the player’s button press, executes the selected profession burst, then updates the same V2 payload.

- [ ] **Step 5: Run tests and commit**

Run: `npx jest --roots test/pve --runInBand test/pve/MinghenEffects.test.ts test/pve/MinghenLoadout.test.ts test/pve/ProfessionSystems.test.ts test/pve/PersistentEventExtensionOrder.test.ts`

Expected: PASS.

```bash
git add assets/scripts/pve/core/PersistentExpeditionRuntime.ts assets/scripts/pve/core/minghen/MinghenEventContext.ts assets/scripts/pve/core/minghen/MinghenEffects.ts assets/scripts/pve/core/SpiritBurstSystem.ts assets/scripts/pve/controllers/ExpeditionController.ts assets/scripts/pve/views/PveHudView.ts test/pve/MinghenEffects.test.ts test/pve/ProfessionSystems.test.ts test/pve/PersistentEventExtensionOrder.test.ts
git commit -m "feat(pve): extend original events with minghen and spirit"
```

---

### Task 8: Remove the Parallel Runtime and Prove Full Regression Safety

**Files:**
- Delete: `assets/scripts/pve/controllers/PersistentFloorBattleController.ts`
- Delete: `assets/scripts/pve/controllers/PersistentFloorBattleController.ts.meta`
- Delete: `assets/scripts/pve/views/PersistentFloorBattleView.ts`
- Delete: `assets/scripts/pve/views/PersistentFloorBattleView.ts.meta`
- Delete: `assets/scripts/pve/core/PersistentFloorBattle.ts`
- Delete: `assets/scripts/pve/core/PersistentFloorBattle.ts.meta`
- Delete or repurpose after zero-reference proof: `assets/scripts/pve/core/PersistentFloorBattleState.ts`
- Delete or rewrite: `test/pve/PersistentFloorBattle.test.ts`
- Modify: `cloudfunctions/common/pve/PveChallengeValidate.js`
- Modify: `cloudfunctions/common/pve/PveChallenge.js`
- Modify: `cloudfunctions/common/__tests__/PveChallenge.test.js`
- Modify: `PROJECT_NAVIGATION.md`
- Modify: `CALL_FLOW.md`
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `specs/260712-pve-persistent-floor-progression/implementation-status.md`

**Interfaces:**
- Consumes: completed V2 client runtime and existing cloud challenge lifecycle.
- Produces: one combat runtime, deployable synced cloud functions, and a Chapter 1 test checklist.

- [ ] **Step 1: Add cloud tests for V2 saves and one-time V1 replacement**

Assert V2 serialized runtime validates challenge/floor/seed/config/turn. Assert the first V2 save may replace an existing V1 runtime for the same active challenge even when its rebuilt turn is lower; after V2 is stored, normal monotonic turn rollback protection applies. Other challenge IDs/configs remain rejected.

- [ ] **Step 2: Run cloud tests and verify failure**

Run: `npx jest cloudfunctions/common/__tests__/PveChallenge.test.js --runInBand`

Expected: FAIL until runtime-version-aware replacement is added.

- [ ] **Step 3: Implement cloud V2 validation in the shared source and sync copies**

Modify only the authoritative shared sources `cloudfunctions/common/pve/PveChallengeValidate.js` and `cloudfunctions/common/pve/PveChallenge.js`, then run:

```bash
node scripts/sync-cloud-common.js
```

The cloud still treats the serialized state as an opaque validated snapshot; it does not simulate high-frequency combat.

- [ ] **Step 4: Prove zero references, then delete parallel files**

Run:

```bash
rg -n "PersistentFloorBattleController|PersistentFloorBattleView|movePersistentPlayer|attackPersistentTarget|endPersistentPlayerTurn|playTransition" assets test/pve PROJECT_NAVIGATION.md CALL_FLOW.md
```

Expected before deletion: matches only in files scheduled for deletion. Expected after deletion: no matches.

- [ ] **Step 5: Update both authoritative PVE documents**

Record the final unique call chain, AP/movement rules, V2 save migration, old-system disable list, and Chapter 1 acceptance results. Update `implementation-status.md` with exact test commands/results rather than a general “completed” statement.

- [ ] **Step 6: Run the complete automated regression suite**

Run in order:

```bash
npm run test:pve -- --runInBand
npm test -- --runInBand
npm run typecheck:game
npm run typecheck:cloud
node scripts/verify-pve-only-build.js
```

Expected: all tests/typechecks pass and PVE-only verification reports no PVP runtime dependency.

- [ ] **Step 7: Build and patch the WeChat package**

Build `wechatgame` in Cocos Creator, then run:

```bash
node scripts/patch-wechatgame-config.js
python scripts/calc-main-native-budget.py
```

Expected: patch succeeds, all required resources resolve, and main package stays below `4096 KB`.

- [ ] **Step 8: Execute the Chapter 1 manual acceptance matrix**

Verify on floor 1 first, then floors 2–7:

1. Consecutive movement is smooth and never jumps between cells.
2. Movement costs `2 AP` unless an explicit equipped rule modifies it.
3. Initial and next-turn AP are always `9–14`, with dice feedback.
4. When no legal move/attack/interaction remains, the original automatic end-turn path runs.
5. Manual end turn remains available.
6. Fog starts closed, reveals around the player, persists in save, and restores after re-entry.
7. Melee lunge, ranged projectile, hit flash, damage number, SFX, monster movement, and camera remain continuous.
8. Floor objective is permanently visible in Chinese and updates immediately.
9. Floor 1 key/exit, floor 2 elite, floor 3 waves, floor 4 chase, floor 5 breakthrough, floor 6 altars, and floor 7 boss each settle exactly once.
10. Continue-next-floor and return-to-camp grant identical rewards.
11. Death retries only the current floor and preserves permanent profile assets.
12. No old random equipment, random affix, strength-three-choice, destiny tree, stamina, chapter camp, fragment, awakening, or reward-ad flow appears.
13. Moving/attacking does not wait for a cloud function; end-turn/exit save does not produce `document.update invalid parameters`.

- [ ] **Step 9: Commit the cleanup and verification**

```bash
git add assets/scripts/pve cloudfunctions/common cloudfunctions/pve/common cloudfunctions/login/common cloudfunctions/initDb/common cloudfunctions/adminLogin/common cloudfunctions/adminTool/common test/pve PROJECT_NAVIGATION.md CALL_FLOW.md specs/260608-pve-destiny-expedition/design.md specs/260712-pve-persistent-floor-progression/implementation-status.md
git commit -m "refactor(pve): finish original combat-chain persistent progression"
```

Do not stage unrelated image, GM web, PVP-removal, or pre-existing dirty files.
