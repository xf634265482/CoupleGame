# Newbie Tutorial Charge + Burst Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the floor-1 scripted newbie tutorial so first-time players learn warrior 蓄力 and 破阵, and reconnect it to the persistent expedition boot path.

**Architecture:** Keep `TutorialGuideManager` as a linear step rail. Rewrite `TutorialConfigs` for a two-monster scripted floor. Extend step actions with `CHARGE` / `SPIRIT_BURST` and advance context for charge/burst completion. Inject the tutorial floor inside `createPersistentFloorRuntime` when `floor === 1 && tutorialCompleted !== true`, forcing `WARRIOR` and KEY_EXPLORE. Wire Controller blocking + spirit fill + light HUD highlight.

**Tech Stack:** Cocos Creator 3.8.8 TypeScript, Jest (`npm run test:pve`), existing PVE core / Controller / HUD.

**Spec:** `docs/superpowers/specs/2026-07-16-newbie-tutorial-charge-burst-design.md`

## Global Constraints

- Teach warrior only: 蓄力 level 1 + 破阵; brief move/basic attack; no aim/combo/撞碎/high charge.
- Fill `resources.spirit = 100` when entering the `burst` step; do not teach spirit farming.
- `tutorialCompleted` lives only on `PveMeta` (read at boot, write on tutorial floor clear).
- Reuse KEY_EXPLORE / key → portal clear; no second clear path.
- No old-save migration; testers clear the meta flag manually.
- PVE gameplay doc sync: add a revision bullet to `specs/260608-pve-destiny-expedition/design.md` when shipping.

---

## File Structure

| File | Responsibility |
|---|---|
| `assets/scripts/pve/tutorial/TutorialTypes.ts` | Step action/complete-condition types |
| `assets/scripts/pve/tutorial/TutorialConfigs.ts` | Scripted floor + step table |
| `assets/scripts/pve/tutorial/TutorialFloorFactory.ts` | Build tutorial `ExpeditionState` for persistent mode |
| `assets/scripts/pve/tutorial/TutorialGuideManager.ts` | Bind / block / advance |
| `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` | Inject tutorial when boot options say so |
| `assets/scripts/pve/core/PersistentFloorFlow.ts` | Pass `tutorialCompleted` into runtime create |
| `assets/scripts/pve/controllers/ExpeditionController.ts` | Boot option, charge/burst gates, spirit fill, HUD highlight |
| `assets/scripts/pve/views/PveHudView.ts` | Optional charge/burst button highlight |
| `test/pve/TutorialGuideManager.test.ts` | Guide pure logic |
| `test/pve/TutorialFloorBoot.test.ts` | Runtime injection / skip |
| `specs/260608-pve-destiny-expedition/design.md` | Revision bullet |

---

### Task 1: Extend tutorial types + guide manager (pure logic)

**Files:**
- Modify: `assets/scripts/pve/tutorial/TutorialTypes.ts`
- Modify: `assets/scripts/pve/tutorial/TutorialGuideManager.ts`
- Create: `test/pve/TutorialGuideManager.test.ts`

**Interfaces:**
- Consumes: existing `ExpeditionState` / `PveEvent` / `Coord`
- Produces:
  - `TutorialStepAction = 'MOVE' | 'ATTACK' | 'INTERACT' | 'TAP_CELL' | 'ANY' | 'CHARGE' | 'SPIRIT_BURST'`
  - `TutorialAdvanceContext = { selectedChargeAp?: number; spiritBurstActive?: boolean }`
  - `TutorialStepConfig` fields:
    - `completeOnChargeAp?: number`
    - `completeOnSpiritBurst?: boolean`
    - `completeOnKillMonsterId?: string`
    - `completeOnAttackTargetId?: string`
    - `onEnterFillSpirit?: boolean`
  - `TutorialGuideManager.advanceIfNeeded(state, events, ctx?: TutorialAdvanceContext): boolean`
  - `TutorialGuideManager.currentStep(): TutorialStepConfig | null`
  - `TutorialGuideManager.shouldHighlightCharge(): boolean`
  - `TutorialGuideManager.shouldHighlightSpiritBurst(): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// test/pve/TutorialGuideManager.test.ts
import { TutorialGuideManager } from '../../assets/scripts/pve/tutorial/TutorialGuideManager';
import { FIRST_TUTORIAL_SCENARIO_ID, FIRST_TUTORIAL_STEPS, buildFirstTutorialFloor } from '../../assets/scripts/pve/tutorial/TutorialConfigs';
import type { ExpeditionState } from '../../assets/scripts/pve/core/PveTypes';

function makeState(stepId: string): ExpeditionState {
  const floorState = buildFirstTutorialFloor(1);
  floorState.tutorialGuide = { currentStepId: stepId, completedStepIds: [] };
  return {
    runSeed: 1,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player: {
      hp: 100, maxHp: 100, gold: 0, anima: 0, animaProgress: 0, animaThreshold: 100,
      classId: 'BERSERKER', classTraits: [], equipment: {}, classFragments: {},
      bag: [], relics: [], ownedRelics: [], campMaxHpBuys: 0,
    },
    floorState,
    balanceSnapshot: null,
    persistentFloorMode: true,
    isTutorialRun: true,
  };
}

test('blocks non-charge actions on charge step', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge');
  mgr.bind(state);
  expect(mgr.shouldBlockAction('ATTACK')).toBe(true);
  expect(mgr.shouldBlockAction('CHARGE')).toBe(false);
  expect(mgr.shouldHighlightCharge()).toBe(true);
});

test('advances charge step when selectedChargeAp matches', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 0 })).toBe(false);
  expect(mgr.advanceIfNeeded(state, [], { selectedChargeAp: 1 })).toBe(true);
  expect(state.floorState.tutorialGuide?.currentStepId).toBe('charge_kill');
});

test('advances burst step when spiritBurstActive', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('burst');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [], { spiritBurstActive: false })).toBe(false);
  expect(mgr.advanceIfNeeded(state, [], { spiritBurstActive: true })).toBe(true);
});

test('kill step requires matching monsterId', () => {
  const mgr = new TutorialGuideManager();
  const state = makeState('charge_kill');
  mgr.bind(state);
  expect(mgr.advanceIfNeeded(state, [{ type: 'KILL', monsterId: 'wrong', monsterType: 'NORMAL' }])).toBe(false);
  expect(mgr.advanceIfNeeded(state, [{ type: 'KILL', monsterId: 'tutorial_mon_a', monsterType: 'NORMAL' }])).toBe(true);
});
```

> Note: these tests assume Task 2 already rewrote `FIRST_TUTORIAL_STEPS` step ids. If running Task 1 alone first, temporarily stub step ids in the test helper OR implement Task 2 configs in the same PR before green. Preferred order: write types+manager against the **new** step ids, then land Task 2 configs in the same commit if needed to compile.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:pve -- TutorialGuideManager.test.ts`

Expected: FAIL (missing exports / old steps / incomplete advance logic)

- [ ] **Step 3: Implement types + manager**

Update `TutorialTypes.ts`:

```ts
import type { Coord } from '../core/PveTypes';

export type TutorialStepAction =
  | 'MOVE'
  | 'ATTACK'
  | 'INTERACT'
  | 'TAP_CELL'
  | 'ANY'
  | 'CHARGE'
  | 'SPIRIT_BURST';

export interface TutorialAdvanceContext {
  selectedChargeAp?: number;
  spiritBurstActive?: boolean;
}

export interface TutorialStepConfig {
  id: string;
  message: string;
  allowedAction?: TutorialStepAction;
  allowedCells?: Coord[];
  completeOnPlayerPos?: Coord;
  completeOnEventTypes?: string[];
  completeOnChargeAp?: number;
  completeOnSpiritBurst?: boolean;
  completeOnKillMonsterId?: string;
  completeOnAttackTargetId?: string;
  onEnterFillSpirit?: boolean;
}

export interface TutorialScenarioConfig {
  id: string;
  floor: number;
  size: number;
  player: Coord;
}
```

Update `TutorialGuideManager.ts` core advance match:

```ts
advanceIfNeeded(state: ExpeditionState, events: PveEvent[], ctx: TutorialAdvanceContext = {}): boolean {
  const guide = state.floorState.tutorialGuide;
  if (!this._currentStep || !guide) return false;

  const step = this._currentStep;
  const matchedByPos = coordEquals(step.completeOnPlayerPos, state.floorState.player);
  const matchedByEvent = step.completeOnEventTypes?.some((type) =>
    events.some((event) => event.type === type),
  ) ?? false;
  const matchedByCharge = step.completeOnChargeAp !== undefined
    && ctx.selectedChargeAp === step.completeOnChargeAp;
  const matchedByBurst = !!step.completeOnSpiritBurst && ctx.spiritBurstActive === true;
  const matchedByKill = !!step.completeOnKillMonsterId
    && events.some((event) => event.type === 'KILL' && event.monsterId === step.completeOnKillMonsterId);
  const matchedByAttack = !!step.completeOnAttackTargetId
    && events.some((event) =>
      event.type === 'ATTACK'
      && event.attackerId === 'PLAYER'
      && event.targetId === step.completeOnAttackTargetId
      && (event.cause === undefined || event.cause === 'DIRECT'),
    );

  if (!matchedByPos && !matchedByEvent && !matchedByCharge && !matchedByBurst && !matchedByKill && !matchedByAttack) {
    return false;
  }

  const currentIndex = this._steps.findIndex((s) => s.id === step.id);
  const completedStepIds = Array.from(new Set([...(guide.completedStepIds ?? []), step.id]));
  const nextStep = currentIndex >= 0 ? this._steps[currentIndex + 1] : null;
  state.floorState.tutorialGuide = {
    ...guide,
    completedStepIds,
    currentStepId: nextStep?.id ?? step.id,
  };
  this._currentStep = nextStep ?? null;
  return true;
}

shouldHighlightCharge(): boolean {
  return this._currentStep?.allowedAction === 'CHARGE';
}

shouldHighlightSpiritBurst(): boolean {
  return this._currentStep?.allowedAction === 'SPIRIT_BURST';
}

currentStep(): TutorialStepConfig | null {
  return this._currentStep;
}
```

Keep existing `shouldBlockAction` / `shouldBlockCell` / `bind` / `isActive` / `getMessage` / `getAllowedCells`. Ensure `shouldBlockAction('CHARGE')` works once types include `CHARGE`.

- [ ] **Step 4: Run tests**

Run: `npm run test:pve -- TutorialGuideManager.test.ts`

Expected: PASS (after Task 2 configs exist; if configs not yet landed, land Task 2 Steps 1–3 next, then re-run)

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/tutorial/TutorialTypes.ts assets/scripts/pve/tutorial/TutorialGuideManager.ts test/pve/TutorialGuideManager.test.ts
git commit -m "feat(pve): extend tutorial guide for charge and burst steps"
```

---

### Task 2: Rewrite scripted floor + step table

**Files:**
- Modify: `assets/scripts/pve/tutorial/TutorialConfigs.ts`
- Create: `assets/scripts/pve/tutorial/TutorialFloorFactory.ts`
- Test: extend `test/pve/TutorialGuideManager.test.ts` or add `test/pve/TutorialConfigs.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `createFog`-style revealed grid; chapter1 monster helpers optional
- Produces:
  - `buildFirstTutorialFloor(seed: number): FloorState` (rewritten)
  - `FIRST_TUTORIAL_STEPS: TutorialStepConfig[]` (new ids)
  - `createTutorialExpeditionState(snapshot, profile): ExpeditionState`
  - Monster ids: `tutorial_mon_a`, `tutorial_mon_b`

- [ ] **Step 1: Write failing config/shape tests**

```ts
// test/pve/TutorialConfigs.test.ts
import { buildFirstTutorialFloor, FIRST_TUTORIAL_STEPS } from '../../assets/scripts/pve/tutorial/TutorialConfigs';

test('tutorial floor has two monsters, key, and full reveal', () => {
  const floor = buildFirstTutorialFloor(42);
  expect(floor.tutorialScenarioId).toBe('first_expedition_intro');
  expect(floor.monsters.map((m) => m.id).sort()).toEqual(['tutorial_mon_a', 'tutorial_mon_b']);
  expect(floor.entities.some((e) => e.type === 'KEY')).toBe(true);
  expect(floor.revealed.every((row) => row.every(Boolean))).toBe(true);
  expect(floor.ap).toBeGreaterThanOrEqual(12);
});

test('steps cover charge then burst then key/portal', () => {
  expect(FIRST_TUTORIAL_STEPS.map((s) => s.id)).toEqual([
    'move', 'basic_attack', 'charge', 'charge_kill',
    'burst', 'burst_charge', 'burst_kill', 'key', 'portal',
  ]);
  expect(FIRST_TUTORIAL_STEPS.find((s) => s.id === 'burst')?.onEnterFillSpirit).toBe(true);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:pve -- TutorialConfigs.test.ts`

Expected: FAIL on step ids / second monster / ap

- [ ] **Step 3: Implement floor + steps**

Layout (6×6 corridor — adjust coords if needed, keep reachable):

```
player (0,2)
mon_a  (2,2)  hp ~22 (survive one ~13 basic hit, die to second charged hit)
mon_b  (4,2)  hp ~18
key    (5,2)
rocks forming a 1-tile-wide lane on y=2
```

`buildFirstTutorialFloor`:

```ts
export function buildFirstTutorialFloor(seed: number): FloorState {
  const size = 6;
  const revealed = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  return {
    floor: 1,
    size,
    seed,
    rngState: seed,
    player: { x: 0, y: 2 },
    ap: 14,
    maxAp: 14,
    dice: 6,
    turn: 1,
    hasKey: false,
    revealed,
    monsters: [
      {
        id: 'tutorial_mon_a',
        type: 'NORMAL',
        pos: { x: 2, y: 2 },
        hp: 22,
        maxHp: 22,
        attack: 0,
        range: 1,
        aggroRadius: 0,
        aiState: 'IDLE',
        variantId: 'GOBLIN_WARRIOR',
        tutorialDrop: { gold: 0, anima: 0 },
      },
      {
        id: 'tutorial_mon_b',
        type: 'NORMAL',
        pos: { x: 4, y: 2 },
        hp: 18,
        maxHp: 18,
        attack: 0,
        range: 1,
        aggroRadius: 0,
        aiState: 'IDLE',
        variantId: 'GOBLIN_WARRIOR',
        tutorialDrop: { gold: 8, anima: 0 },
      },
    ],
    entities: [
      // rocks sealing y=1 and y=3 for x=0..5 (corridor)
      // ... generate ROCK entities ...
      { id: 'tutorial_key_0', type: 'KEY', pos: { x: 5, y: 2 }, consumed: false },
    ],
    status: 'EXPLORING',
    tutorialScenarioId: FIRST_SCENARIO.id,
    tutorialGuide: { currentStepId: 'move', completedStepIds: [] },
  };
}
```

`FIRST_TUTORIAL_STEPS` (messages in Chinese, short):

```ts
export const FIRST_TUTORIAL_STEPS: TutorialStepConfig[] = [
  {
    id: 'move',
    message: '每个回合都有 AP。\n先点前方格子，移动一步。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 1, y: 2 }],
    completeOnPlayerPos: { x: 1, y: 2 },
  },
  {
    id: 'basic_attack',
    message: '靠近后点击怪物，先普攻一次。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnAttackTargetId: 'tutorial_mon_a',
  },
  {
    id: 'charge',
    message: '点「蓄力」投入 1 点 AP。\n蓄力会让下一次攻击更强。',
    allowedAction: 'CHARGE',
    completeOnChargeAp: 1,
  },
  {
    id: 'charge_kill',
    message: '再用蓄力攻击击杀这只怪物。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 2, y: 2 }],
    completeOnKillMonsterId: 'tutorial_mon_a',
  },
  {
    id: 'burst',
    message: '灵气已满！点「灵气爆发」开启破阵。\n（实战中命中/击杀会攒灵气）',
    allowedAction: 'SPIRIT_BURST',
    onEnterFillSpirit: true,
    completeOnSpiritBurst: true,
  },
  {
    id: 'burst_charge',
    message: '破阵强化下一次蓄力攻击。\n再点一次「蓄力」。',
    allowedAction: 'CHARGE',
    completeOnChargeAp: 1,
  },
  {
    id: 'burst_kill',
    message: '用破阵蓄力击杀第二只怪物。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 4, y: 2 }],
    completeOnKillMonsterId: 'tutorial_mon_b',
  },
  {
    id: 'key',
    message: '继续前进，拿起钥匙。\n传送门会出现在钥匙位置。',
    allowedAction: 'TAP_CELL',
    allowedCells: [{ x: 5, y: 2 }],
    completeOnEventTypes: ['PICK_KEY', 'PORTAL_SPAWNED'],
  },
  {
    id: 'portal',
    message: '传送门已出现。\n点「互动」通关。',
    allowedAction: 'ANY',
    allowedCells: [{ x: 5, y: 2 }],
    completeOnEventTypes: ['FLOOR_CLEARED'],
  },
];
```

`TutorialFloorFactory.ts`:

```ts
import { getChapter1Objective } from '../core/objectives/Chapter1Objectives';
import { professionBaseStats } from '../core/professions/ProfessionBaseStats';
import type { ExpeditionState } from '../core/PveTypes';
import type { FloorChallengeSnapshot, PveProfile } from '../core/PveProgressionTypes';
import { buildFirstTutorialFloor } from './TutorialConfigs';

export function createTutorialExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
): ExpeditionState {
  const floorState = buildFirstTutorialFloor(snapshot.seed);
  const base = professionBaseStats('WARRIOR');
  // Reuse equipment mapping from Chapter1 factory patterns (copy the small toLegacyEquipment helper
  // or import a shared helper if one exists). Keep player.classId = 'BERSERKER'.
  return {
    runSeed: snapshot.seed,
    chapter: 1,
    floor: 1,
    status: 'ACTIVE',
    player: { /* warrior stats + loadout from profile, hp from base.maxHp + gear */ },
    floorState: {
      ...floorState,
      // keep tutorial ap 14; sync maxAp
    },
    balanceSnapshot: null,
    persistentFloorMode: true,
    isTutorialRun: true,
    equipmentDropPool: [],
    lootSeq: 0,
  };
}

export function shouldUseTutorialFloor(floor: number, tutorialCompleted: boolean | undefined): boolean {
  return floor === 1 && tutorialCompleted !== true;
}
```

Also export a tiny helper used by runtime:

```ts
export { getChapter1Objective }; // callers use getChapter1Objective(1) for KEY_EXPLORE
```

- [ ] **Step 4: Run tests**

Run: `npm run test:pve -- TutorialConfigs.test.ts TutorialGuideManager.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/tutorial/TutorialConfigs.ts assets/scripts/pve/tutorial/TutorialFloorFactory.ts test/pve/TutorialConfigs.test.ts
git commit -m "feat(pve): rewrite tutorial floor for charge and burst"
```

---

### Task 3: Inject tutorial into persistent boot path

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/PersistentFloorFlow.ts`
- Create: `test/pve/TutorialFloorBoot.test.ts`

**Interfaces:**
- Consumes: `createTutorialExpeditionState`, `shouldUseTutorialFloor`, `getChapter1Objective(1)`
- Produces:
  - `createPersistentFloorRuntime(snapshot, profile, options?: { tutorialCompleted?: boolean })`
  - `PersistentFloorFlow.bootstrap(selectedFloor?: number, options?: { tutorialCompleted?: boolean })`
  - When tutorial: `runtime.config.professionId === 'WARRIOR'`, `expedition.isTutorialRun === true`, `floorState.tutorialScenarioId` set, objective kind `KEY_EXPLORE`

- [ ] **Step 1: Write failing boot tests**

```ts
// test/pve/TutorialFloorBoot.test.ts
import { createPersistentFloorRuntime } from '../../assets/scripts/pve/core/PersistentExpeditionRuntime';
import type { FloorChallengeSnapshot, PveProfile } from '../../assets/scripts/pve/core/PveProgressionTypes';

function profile(): PveProfile {
  return {
    version: 1,
    highestUnlockedFloor: 1,
    highestClearedFloor: 0,
    floorRecords: {},
    minghenCollection: {},
    minghenLoadout: [],
    minghenPresets: [],
    equipmentInventory: [],
    equipmentLoadout: {},
    gold: 0,
    minghenDust: 0,
    professions: {
      WARRIOR: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      ARCHER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
      RANGER: { unlocked: true, xp: 0, level: 1, unlockedTechniqueIds: [] },
    },
    selectedProfessionId: 'ARCHER', // must be forced to WARRIOR in tutorial
    tracking: null,
    activeChallengeId: null,
    updatedAt: 1,
  };
}

function snapshot(floor: number): FloorChallengeSnapshot {
  return {
    challengeId: `c${floor}`,
    userId: 'u1',
    floor,
    mode: 'PROGRESSION',
    seed: 7,
    status: 'ACTIVE',
    config: {
      professionId: 'ARCHER',
      equipmentLoadout: {},
      minghenLoadout: [],
      trackedMinghenId: null,
    },
    createdAt: 1,
    updatedAt: 1,
  };
}

test('floor 1 without tutorialCompleted injects scripted tutorial', () => {
  const runtime = createPersistentFloorRuntime(snapshot(1), profile(), { tutorialCompleted: false });
  expect(runtime.battleState.expedition.isTutorialRun).toBe(true);
  expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBe('first_expedition_intro');
  expect(runtime.config.professionId).toBe('WARRIOR');
  expect(runtime.objective.kind).toBe('KEY_EXPLORE');
  expect(runtime.battleState.expedition.floorState.monsters).toHaveLength(2);
});

test('floor 1 with tutorialCompleted uses normal chapter1 map', () => {
  const runtime = createPersistentFloorRuntime(snapshot(1), profile(), { tutorialCompleted: true });
  expect(runtime.battleState.expedition.isTutorialRun).toBeFalsy();
  expect(runtime.battleState.expedition.floorState.tutorialScenarioId).toBeUndefined();
  expect(runtime.config.professionId).toBe('ARCHER');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm run test:pve -- TutorialFloorBoot.test.ts`

Expected: FAIL (`options` ignored / no tutorial injection)

- [ ] **Step 3: Implement injection**

In `createPersistentFloorRuntime` (chapter 1 branch):

```ts
export function createPersistentFloorRuntime(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  options?: { tutorialCompleted?: boolean },
  now = Date.now(),
): PersistentExpeditionRuntime {
  // ...
  if (chapterId === 1) {
    const useTutorial = shouldUseTutorialFloor(snapshot.floor, options?.tutorialCompleted);
    let expedition = useTutorial
      ? createTutorialExpeditionState(snapshot, profile)
      : createChapter1ExpeditionState(snapshot, profile);

    const effectiveSnapshot = useTutorial
      ? {
          ...snapshot,
          config: { ...snapshot.config, professionId: 'WARRIOR' as const },
        }
      : snapshot;

    const map = useTutorial
      ? null
      : generateChapter1Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);

    const profession = createFreshProfessionState();
    let objective = getChapter1Objective(snapshot.floor).create();
    // ... existing floor-6 wave logic only when !useTutorial ...

    const runtime = startFloorRuntime(effectiveSnapshot, {
      maxHp: expedition.player.maxHp,
      maxAp: expedition.floorState.maxAp,
    }, {
      expedition,
      objective,
      pendingCommands: [],
      profession,
      minghenMemory: createMinghenTriggerMemory(),
      rewardCatalog: {
        minghenIds: map ? [...map.minghenIds] : [],
        equipmentIds: map ? [...map.equipmentIds] : [],
        optionalObjectiveIds: map ? [...map.optionalObjectiveIds] : [],
      },
    }, now);
    return syncRuntimeFromExpedition(runtime, expedition, now);
  }
  // chapter 2 unchanged
}
```

Update `PersistentFloorFlow`:

```ts
async bootstrap(
  selectedFloor?: number,
  options?: { tutorialCompleted?: boolean },
): Promise<PersistentFloorFlowState> {
  // ... existing load/start ...
  const runtime = challenge.runtimeSave
    ? resumeOrRebuildPersistentRuntime(challenge, challenge.runtimeSave, profile)
    : createPersistentFloorRuntime(challenge, profile, {
        tutorialCompleted: options?.tutorialCompleted,
      });
  // ...
}

async continueNextFloor(): Promise<PersistentFloorFlowState> {
  // next floors are never tutorial; pass { tutorialCompleted: true } or omit
  const runtime = createPersistentFloorRuntime(started.challenge, this._state.profile, {
    tutorialCompleted: true,
  });
  // ...
}
```

Resume note: if `runtimeSave` already contains `tutorialScenarioId`, `resumeOrRebuildPersistentRuntime` must keep it (no rebuild that wipes guide). Add a regression assertion if resume path strips tutorial fields.

- [ ] **Step 4: Run tests**

Run: `npm run test:pve -- TutorialFloorBoot.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/PersistentExpeditionRuntime.ts assets/scripts/pve/core/PersistentFloorFlow.ts test/pve/TutorialFloorBoot.test.ts
git commit -m "feat(pve): inject charge-burst tutorial into floor-1 boot"
```

---

### Task 4: Controller wiring — gates, spirit fill, HUD highlight

**Files:**
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/views/PveHudView.ts`

**Interfaces:**
- Consumes: Task 1–3 APIs
- Produces: playable tutorial in editor/devtools

- [ ] **Step 1: Extend `_isTutorialBlocked` and charge/burst hooks**

```ts
private _isTutorialBlocked(
  action: 'MOVE' | 'ATTACK' | 'INTERACT' | 'TAP_CELL' | 'CHARGE' | 'SPIRIT_BURST',
  coord?: Coord,
): boolean {
  // same as today, now accepts CHARGE / SPIRIT_BURST
}

private _onCharge(): void {
  if (!tutorialBypass && this._isTutorialBlocked('CHARGE')) return;
  // existing charge cycle...
  this._syncTutorialGuide([], {
    selectedChargeAp: this._selectedChargeAp,
    spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
  });
  this._refreshTutorialHudHighlights();
}

private _onSpiritBurst(): void {
  if (this._isTutorialBlocked('SPIRIT_BURST')) return;
  // existing activateSpiritBurst...
  this._syncTutorialGuide([], {
    selectedChargeAp: this._selectedChargeAp,
    spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
  });
  this._refreshTutorialHudHighlights();
}
```

- [ ] **Step 2: Spirit fill on entering `burst`**

Extend `_syncTutorialGuide`:

```ts
private _syncTutorialGuide(events: PveEvent[], ctx?: TutorialAdvanceContext): void {
  // bind...
  const beforeId = this._tutorialGuide.currentStep()?.id;
  if (events.length > 0 || ctx) {
    this._tutorialGuide.advanceIfNeeded(this._state, events, {
      selectedChargeAp: this._selectedChargeAp,
      spiritBurstActive: !!this._runtime?.profession.spiritBurstActive,
      ...ctx,
    });
    this._tutorialGuide.bind(this._state);
  }
  const step = this._tutorialGuide.currentStep();
  if (step?.onEnterFillSpirit && this._runtime && this._runtime.resources.spirit < 100) {
    this._runtime = {
      ...this._runtime,
      resources: { ...this._runtime.resources, spirit: 100 },
    };
    this._floorFlow?.updateRuntime(this._runtime);
    this._refreshPersistentHud();
  }
  // message + cell focus as today
  this._refreshTutorialHudHighlights();
}
```

Call `_syncTutorialGuide` after successful attacks/moves with events (already done). Ensure charge/burst paths also call it.

- [ ] **Step 3: Pass meta flag at bootstrap**

```ts
const flowState = await this._floorFlow.bootstrap(selectedFloor, {
  tutorialCompleted: this._meta?.tutorialCompleted === true,
});
```

After first refresh, call `_syncTutorialGuide([])` so if the first step is not burst, no fill; when advancing into burst, fill runs.

- [ ] **Step 4: HUD highlight API**

In `PveHudView.ts`:

```ts
setTutorialButtonHighlight(opts: { charge?: boolean; spiritBurst?: boolean }): void {
  // tint / scale pulse on _chargeButton / _spiritBurstButton when true; clear when false
}
```

Controller:

```ts
private _refreshTutorialHudHighlights(): void {
  this._hud?.setTutorialButtonHighlight({
    charge: !!this._tutorialGuide?.shouldHighlightCharge(),
    spiritBurst: !!this._tutorialGuide?.shouldHighlightSpiritBurst(),
  });
}
```

Keep highlight visually light (color multiply or existing blink pattern on spirit button is fine).

- [ ] **Step 5: Manual smoke checklist (no automated UI test)**

1. Clear `tutorialCompleted` on test meta.
2. Enter floor 1 → scripted corridor, guide bubble visible.
3. Complete move → basic attack → charge → kill A → spirit becomes 100 → burst → charge → kill B → key → portal.
4. Confirm `tutorialCompleted` saved; re-enter floor 1 → normal Chapter1 map.

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/controllers/ExpeditionController.ts assets/scripts/pve/views/PveHudView.ts
git commit -m "feat(pve): wire tutorial charge burst gates and spirit fill"
```

---

### Task 5: Docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` (top revision section)
- Modify: `PROJECT_NAVIGATION.md` and/or `CALL_FLOW.md` only if they mention the old tutorial boot path

- [ ] **Step 1: Add design.md revision bullet**

```md
## 2026-07-16 新手教程：蓄力与破阵

- 第一次远征第 1 层在 `tutorialCompleted !== true` 时走脚本关（永久逐层启动链注入），强制战士。
- 教学步骤：短移动/普攻 → 蓄力击杀 → 系统灌满灵气 → 破阵 → 再蓄力击杀 → 钥匙/传送门。
- 不教攒灵气实操、高级蓄力、撞碎、三职；通关写回 `PveMeta.tutorialCompleted`。
- 详情：`docs/superpowers/specs/2026-07-16-newbie-tutorial-charge-burst-design.md`
```

- [ ] **Step 2: Fix navigation docs if stale**

If `PROJECT_NAVIGATION.md` / `CALL_FLOW.md` still describe `startExpedition → buildFirstTutorialFloor` as the live path, update to:

`PersistentFloorFlow.bootstrap → createPersistentFloorRuntime(..., { tutorialCompleted }) → createTutorialExpeditionState`.

- [ ] **Step 3: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md PROJECT_NAVIGATION.md CALL_FLOW.md
git commit -m "docs: sync newbie tutorial charge-burst revision"
```

---

## Self-Review

1. **Spec coverage:** Goals 1–4 → Tasks 1–4; non-goals respected; boot reconnect → Task 3; spirit fill → Task 4; KEY_EXPLORE → Task 2/3; meta-only flag → Tasks 3–4; AC → tests + smoke; design.md → Task 5.
2. **Placeholders:** None intentional; monster HP numbers are starting values—tune in Task 2 if basic attack oneshots or charge fails to kill.
3. **Type consistency:** `TutorialAdvanceContext`, `onEnterFillSpirit`, `tutorial_mon_a/b`, `createPersistentFloorRuntime` options match across tasks.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-07-16-newbie-tutorial-charge-burst.md`.
