# PVE Legacy System Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the executable legacy profession, relic, achievement/codex and obsolete ad reward paths, move leaderboard authority into `pveProfile`, and enforce the current 1–14 floor boundary.

**Architecture:** Keep the existing movement, combat and presentation pipeline, but remove obsolete hooks from it one subsystem at a time. `users.pveProfile` becomes the only permanent PVE progression and leaderboard record; `PveMeta` is narrowed to tutorial and lobby support. Each task has a focused regression test and an independent commit.

**Tech Stack:** Cocos Creator 3.8.8, TypeScript, Node.js CommonJS cloud functions, WeChat CloudDB, Jest/ts-jest.

## Global Constraints

- Do not migrate or clear historical database fields; stop reading and writing them.
- Preserve the `WARRIOR/ARCHER/RANGER` to legacy `classId` compatibility mapping.
- Preserve generic `AdManager`; only `restore_stamina` remains as a registered PVE reward protocol and has no UI or grant route.
- Current official content is global floors 1–14; floor 15 and above must be rejected by client routing and cloud validation.
- Edit shared cloud code only under `cloudfunctions/common/**`, then run `node scripts/sync-cloud-common.js`.
- Gameplay changes must update `specs/260608-pve-destiny-expedition/design.md` and `specs/260712-pve-persistent-floor-progression/design.md`.
- Never stage the whole repository. Root `_*.txt`, `chapter_tmp_test/`, `build_artifacts/`, and `gm-web/dist/` are pollution and must remain unstaged.
- Before each task, confirm `git diff --cached --name-only` is empty; stage only the exact files named by that task.

---

### Task 1: Retire Legacy Profession Advancement, Awakening, and Fragments

**Files:**
- Create: `test/pve/LegacyProfessionBoundary.test.ts`
- Delete: `assets/scripts/pve/core/ClassSystem.ts`
- Delete: `test/pve/ClassSystem.test.ts`
- Delete: `test/pve/fragment-montecarlo.test.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/core/CombatSystem.ts`
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`
- Modify: `assets/scripts/pve/core/LootSystem.ts`
- Modify: `assets/scripts/pve/core/MapGenerator.ts`
- Modify: `assets/scripts/pve/core/PveConstants.ts`
- Modify: `assets/scripts/pve/core/PveTypes.ts`
- Modify: `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts`
- Modify only if compile references remain: `assets/scripts/pve/views/PveCharacterPanel.ts`, `assets/scripts/pve/views/PveHudView.ts`, `assets/scripts/pve/views/PveToastView.ts`, `assets/scripts/pve/tutorial/TutorialFloorFactory.ts`, `assets/scripts/pve/core/AnimaSystem.ts`, `assets/scripts/pve/core/strengthen/StrengthenCatalog.ts`

**Interfaces:**
- Consumes: `professionIdFromClassId(classId: string): PveProfessionId` and the current three-profession runtime in `ProfessionActionSystem.ts`.
- Produces: a battle pipeline with no `FRAGMENT_*`, `CLASS_CAN_*`, `CLASS_ADVANCED`, `CLASS_AWAKENED`, or `AWAKEN_EFFECT_TRIGGERED` events; `classId` remains a compatibility identifier only.

- [ ] **Step 1: Write a failing source-boundary test**

```ts
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('legacy profession boundary', () => {
  test('old advancement implementation and event hooks are absent', () => {
    expect(existsSync(resolve(root, 'assets/scripts/pve/core/ClassSystem.ts'))).toBe(false);
    const joined = [
      'assets/scripts/pve/controllers/ExpeditionController.ts',
      'assets/scripts/pve/core/PveTypes.ts',
      'assets/scripts/pve/core/ExpeditionState.ts',
      'assets/scripts/pve/core/LootSystem.ts',
      'assets/scripts/pve/core/MapGenerator.ts',
    ].map(source).join('\n');
    expect(joined).not.toMatch(/CLASS_CAN_ADVANCE|CLASS_CAN_AWAKEN|CLASS_ADVANCED|CLASS_AWAKENED/);
    expect(joined).not.toMatch(/FRAGMENT_PICKED|AWAKEN_EFFECT_TRIGGERED|type:\s*'FRAGMENT'/);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails**

Run: `npx jest test/pve/LegacyProfessionBoundary.test.ts --runInBand`

Expected: FAIL because `ClassSystem.ts` exists and the listed legacy tokens remain.

- [ ] **Step 3: Remove the legacy chain while preserving the thin mapping**

Delete `ClassSystem.ts` and its two legacy test suites. Remove its imports and every switch branch or blocking-choice handler for the forbidden events. Remove fragment entity generation and legacy advancement/awakening fields from `PveTypes.ts`, but keep the current factory mapping in both chapter factories:

```ts
function classIdOf(professionId: PveProfessionId): ClassId {
  if (professionId === 'ARCHER') return 'ARCHER';
  if (professionId === 'RANGER') return 'ROGUE';
  return 'WARRIOR';
}
```

The retained player creation must initialize combat from the selected profession without fragments or awakening:

```ts
const professionId = challenge.config.professionId;
const base = professionBaseStats(professionId);
const player = {
  ...existingPlayer,
  classId: classIdOf(professionId),
  maxHp: base.maxHp,
  hp: base.maxHp,
};
```

- [ ] **Step 4: Verify profession and core combat behavior**

Run: `npx jest test/pve/LegacyProfessionBoundary.test.ts test/pve/ProfessionSystems.test.ts test/pve/ProfessionMastery.test.ts test/pve/ProfessionActionSystem.test.ts test/pve/PersistentCombatRules.test.ts --runInBand`

Expected: all selected suites PASS.

Run: `npm run typecheck:game`

Expected: exit code 0.

- [ ] **Step 5: Commit only the profession cleanup**

Stage the exact modified/deleted files listed by `git status --short` for this task, verify with `git diff --cached --name-only`, then commit:

```bash
git commit -m "refactor(pve): remove legacy profession progression"
```

---

### Task 2: Migrate Boss Equipment State and Remove Relics

**Files:**
- Create: `test/pve/LegacyRelicBoundary.test.ts`
- Delete: `assets/scripts/pve/core/RelicSystem.ts`
- Delete: `test/pve/RelicSystem.test.ts`
- Delete: `test/pve/RelicSlotPhase5.test.ts`
- Modify: `assets/scripts/pve/core/PveTypes.ts`
- Modify: `assets/scripts/pve/core/BossEquipTraitEffects.ts`
- Modify: `test/pve/BossEquipTraitEffects.test.ts`
- Modify: `assets/scripts/pve/core/CombatSystem.ts`
- Modify: `assets/scripts/pve/core/MovementSystem.ts`
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`
- Modify: `assets/scripts/pve/core/LootSystem.ts`
- Modify: `assets/scripts/pve/core/CampSystem.ts`
- Modify: `assets/scripts/pve/core/PveConstants.ts`
- Modify: `assets/scripts/pve/core/PveBalance.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/pve/views/PveCharacterPanel.ts`
- Modify: `assets/scripts/pve/views/PveToastView.ts`
- Modify: `assets/scripts/lobby/PveLobbyController.ts`
- Modify: `assets/scripts/pve/SpecialItemCatalog.ts`
- Modify: `assets/scripts/pve/SpecialItemResourceLoader.ts`
- Modify: `assets/scripts/ui/UiAssets.ts`
- Modify: `cloudfunctions/common/pve/PveBalance.js`
- Modify or delete relic-specific assertions: `test/pve/LootSystem.test.ts`, `test/pve/CampSystem.test.ts`, `test/pve/TutorialGuideManager.test.ts`

**Interfaces:**
- Consumes: current Boss equipment trait `boss_revive_50`.
- Produces: `RunPlayer.equipmentEffectState?: { bossReviveUsed?: boolean }`; no relic type, event, loot, UI, resource registration, balance config, or combat hook remains.

- [ ] **Step 1: Move the Boss equipment state under test**

Update the existing Boss equipment test so a first lethal trigger marks the dedicated state and a second trigger does not revive:

```ts
expect(first.nextPlayer.equipmentEffectState?.bossReviveUsed).toBe(true);
expect(first.nextPlayer.relicState).toBeUndefined();
const second = bossTryRevive(first.nextPlayer);
expect(second.revived).toBe(false);
```

Run: `npx jest test/pve/BossEquipTraitEffects.test.ts --runInBand`

Expected: FAIL because the implementation still writes `relicState.shieldUsed`.

- [ ] **Step 2: Implement the dedicated equipment state**

Add this field to `RunPlayer` in `PveTypes.ts`:

```ts
equipmentEffectState?: {
  bossReviveUsed?: boolean;
};
```

Replace the borrowed relic state in `BossEquipTraitEffects.ts`:

```ts
const used = player.equipmentEffectState?.bossReviveUsed === true;
if (used) return { nextPlayer: player, revived: false, restoredHp: 0 };
return {
  nextPlayer: {
    ...player,
    equipmentEffectState: {
      ...player.equipmentEffectState,
      bossReviveUsed: true,
    },
  },
  revived: true,
  restoredHp,
};
```

Run: `npx jest test/pve/BossEquipTraitEffects.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 3: Write the relic boundary test, then remove relics**

```ts
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const source = (path: string): string => readFileSync(resolve(root, path), 'utf8');

test('relic implementation and live hooks are absent', () => {
  expect(existsSync(resolve(root, 'assets/scripts/pve/core/RelicSystem.ts'))).toBe(false);
  const joined = [
    'assets/scripts/pve/core/CombatSystem.ts',
    'assets/scripts/pve/core/MovementSystem.ts',
    'assets/scripts/pve/core/ExpeditionState.ts',
    'assets/scripts/pve/core/LootSystem.ts',
    'assets/scripts/pve/controllers/ExpeditionController.ts',
    'assets/scripts/lobby/PveLobbyController.ts',
  ].map(source).join('\n');
  expect(joined).not.toMatch(/RelicSystem|RELIC_PICKUP|RELIC_TRIGGERED|CODEX_RELIC|relicPity|relicCatalog/i);
});
```

Run it once and expect failure, then delete `RelicSystem.ts`, its tests, and all imports/calls/events/UI/resource registrations listed in this task. Remove the `relic` section from client and cloud balance config. Preserve Boss equipment behavior through `equipmentEffectState` only.

- [ ] **Step 4: Verify relic removal and combat stability**

Run: `npx jest test/pve/LegacyRelicBoundary.test.ts test/pve/BossEquipTraitEffects.test.ts test/pve/CombatSystem.test.ts test/pve/MovementSystem.test.ts test/pve/LootSystem.test.ts --runInBand`

Expected: the boundary and Boss equipment suites PASS; any already-known combat assertion failures must match the pre-task baseline and no new suite may fail to compile.

Run: `npm run typecheck:game`

Expected: exit code 0.

- [ ] **Step 5: Sync cloud balance copies and commit**

Run: `node scripts/sync-cloud-common.js`

Stage only Task 2 files and the generated `cloudfunctions/{login,initDb,pve,adminLogin,adminTool}/common/pve/PveBalance.js` copies, then commit:

```bash
git commit -m "refactor(pve): remove relic system"
```

---

### Task 3: Remove Achievements and Codex, Narrow PveMeta

**Files:**
- Create: `test/pve/LegacyMetaBoundary.test.ts`
- Delete: `assets/scripts/pve/core/AchievementSystem.ts`
- Delete: `test/pve/AchievementSystem.test.ts`
- Modify: `assets/scripts/pve/core/PveTypes.ts`
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`
- Modify: `assets/scripts/pve/core/LootSystem.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Modify: `assets/scripts/network/PveService.ts`
- Modify: `assets/scripts/lobby/PveLobbyController.ts`
- Modify: `cloudfunctions/common/db.js`
- Modify: `cloudfunctions/common/pve/PveMeta.js`
- Modify: `cloudfunctions/common/admin/AdminToolService.js`
- Create: `cloudfunctions/common/__tests__/PveMetaBoundary.test.js`
- Modify or delete obsolete assertions: `test/pve/ExpeditionState.test.ts`

**Interfaces:**
- Consumes: `pveTutorialCompleted` and existing lobby meta loading.
- Produces: `PveMeta` without `achievements` or `codex`; `updateUserPveMeta` accepts only tutorial/reset and any still-used account currency delta.

- [ ] **Step 1: Add client and cloud boundary assertions**

Create a client source-boundary test:

```ts
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');

test('achievement and codex business hooks are absent', () => {
  expect(existsSync(resolve(root, 'assets/scripts/pve/core/AchievementSystem.ts'))).toBe(false);
  const controller = readFileSync(resolve(root, 'assets/scripts/pve/controllers/ExpeditionController.ts'), 'utf8');
  const service = readFileSync(resolve(root, 'assets/scripts/network/PveService.ts'), 'utf8');
  expect(`${controller}\n${service}`).not.toMatch(/ACHIEVEMENT_UNLOCKED|codexMonsters|codexEquipment|codexRelics/);
});
```

Add a cloud source-boundary test asserting the narrowed modules contain no old storage keys:

```js
const { readFileSync } = require('fs');
const { resolve } = require('path');

test('cloud meta no longer reads or writes achievement and codex fields', () => {
  const joined = [
    resolve(__dirname, '../db.js'),
    resolve(__dirname, '../pve/PveMeta.js'),
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  expect(joined).not.toMatch(/achievements|pveCodex|codexMonsters|codexEquipment|codexRelics/);
});
```

Run the two tests and expect failure on the legacy fields/hooks.

- [ ] **Step 2: Delete client achievement/codex behavior**

Delete `AchievementSystem.ts` and its test. Remove `ACHIEVEMENT_UNLOCKED` and remaining codex event types, controller display branches, settlement payload fields, lobby catalog state, and `PveMeta.achievements/PveMeta.codex` types. Do not remove tutorial state.

- [ ] **Step 3: Narrow cloud meta storage operations**

Change `updateUserPveMeta` to a narrow signature:

```js
async function updateUserPveMeta(userId, {
  diamond = 0,
  tutorialCompleted = false,
  resetTutorial = false,
} = {}) {
```

Its write object must contain no achievement or codex fields:

```js
const data = { updatedDate: serverDate() };
if (tutorialCompleted) data.pveTutorialCompleted = true;
if (resetTutorial) data.pveTutorialCompleted = false;
if (diamondDelta !== 0) data.diamond = getDb().command.inc(diamondDelta);
```

`getUserPveMeta` must return tutorial and still-used account values only. Remove achievement/codex counts from the GM player view rather than reading old fields.

- [ ] **Step 4: Verify and sync shared cloud code**

Run: `npx jest test/pve/LegacyMetaBoundary.test.ts --runInBand`

Run from `cloudfunctions/common`: `npx jest __tests__/PveMetaBoundary.test.js --runInBand`

Run: `npm run typecheck:game`

Expected: all selected checks PASS.

Run: `node scripts/sync-cloud-common.js`

- [ ] **Step 5: Commit only meta cleanup files and synced copies**

```bash
git commit -m "refactor(pve): remove achievements and codex"
```

---

### Task 4: Remove Obsolete PVE Ad Rewards

**Files:**
- Create: `test/pve/AdRewardBoundary.test.ts`
- Modify: `assets/scripts/platform/wechat/AdManager.ts`

**Interfaces:**
- Consumes: generic Banner, interstitial, and rewarded-video platform implementation.
- Produces: `RewardAdType = 'restore_stamina'`; no reroll or revive reward protocol remains.

- [ ] **Step 1: Write the failing reward registry test**

```ts
import { REWARD_DESCRIPTIONS } from '../../assets/scripts/platform/wechat/AdManager';

test('only stamina restoration remains registered', () => {
  expect(Object.keys(REWARD_DESCRIPTIONS)).toEqual(['restore_stamina']);
  expect(REWARD_DESCRIPTIONS.restore_stamina).toContain('体力');
});
```

Run: `npx jest test/pve/AdRewardBoundary.test.ts --runInBand`

Expected: FAIL because reroll and revive are still registered.

- [ ] **Step 2: Narrow the reward union and descriptions**

```ts
export type RewardAdType = 'restore_stamina';

export const REWARD_DESCRIPTIONS: Record<RewardAdType, string> = {
  restore_stamina: '观看完整广告后恢复一定体力',
};
```

Do not add a lobby button, cloud reward action, or callback that grants stamina.

- [ ] **Step 3: Verify the generic platform remains intact**

Run: `npx jest test/pve/AdRewardBoundary.test.ts --runInBand`

Expected: PASS.

Run: `npm run typecheck:game`

Expected: exit code 0.

- [ ] **Step 4: Confirm no obsolete callers remain**

Run: `rg -n "reroll_strengthen_once|revive_half_hp_once" assets/scripts test`

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(pve): retire obsolete ad rewards"
```

---

### Task 5: Move Leaderboard Authority into PveProfile

**Files:**
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Modify: `cloudfunctions/common/pve/PveChallengeState.js`
- Modify: `cloudfunctions/common/db.js`
- Modify: `cloudfunctions/common/__tests__/PveProfile.test.js`
- Modify: `cloudfunctions/common/__tests__/PveChallenge.test.js`
- Rewrite: `cloudfunctions/common/__tests__/PveLeaderboardDb.test.js`
- Modify: `cloudfunctions/common/__tests__/PveLeaderboard.test.js`
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts`
- Modify: `assets/scripts/network/PveService.ts`
- Modify: `assets/scripts/lobby/PveLobbyController.ts`
- Modify: `cloud/database/indexes.md`

**Interfaces:**
- Consumes: `PveProfile.highestClearedFloor` and the authoritative settlement transaction.
- Produces: `PveProfile.highestClearedAt: number | null`; leaderboard entry `{ rank, userId, nickname, avatarUrl, highestFloor }` only.

- [ ] **Step 1: Add profile timestamp settlement tests**

Add these assertions around `applyChallengeSettlement`:

```js
const first = applyChallengeSettlement(profile, floor3Challenge, clearResult, 3000);
expect(first.profile).toMatchObject({ highestClearedFloor: 3, highestClearedAt: 3000 });

const repeat = applyChallengeSettlement(first.profile, floor3Challenge, clearResult, 9000);
expect(repeat.profile.highestClearedAt).toBe(3000);

const higher = applyChallengeSettlement(repeat.profile, floor4Challenge, clearResult, 12000);
expect(higher.profile).toMatchObject({ highestClearedFloor: 4, highestClearedAt: 12000 });
```

Run the focused challenge/profile tests and expect failure because `highestClearedAt` does not exist.

- [ ] **Step 2: Add and update the permanent profile field**

In default and normalized profiles:

```js
highestClearedAt: Number.isFinite(value.highestClearedAt)
  ? Math.max(0, Math.trunc(value.highestClearedAt))
  : null,
```

In settlement:

```js
const isNewHighest = challenge.floor > profile.highestClearedFloor;
const highestClearedFloor = Math.max(profile.highestClearedFloor, challenge.floor);
const highestClearedAt = isNewHighest ? now : profile.highestClearedAt;
```

Write both values into `nextProfile` in the same transaction.

- [ ] **Step 3: Rewrite leaderboard query and response tests**

Fixtures must use nested profiles:

```js
{
  id: 'u1',
  nickname: '先到玩家',
  pveProfile: { highestClearedFloor: 7, highestClearedAt: 1000 },
}
```

Expected ordering:

```js
expect(entries.map((entry) => entry.userId)).toEqual(['floor8', 'floor7Early', 'floor7Late']);
expect(entries[0]).toEqual(expect.objectContaining({
  rank: 1,
  highestFloor: 8,
}));
expect(entries[0]).not.toHaveProperty('highestTier');
expect(entries[0]).not.toHaveProperty('highestClassId');
expect(entries[0]).not.toHaveProperty('highestAwakenForm');
```

Run and expect failure against the old root-field implementation.

- [ ] **Step 4: Implement nested-profile ranking and update the client**

The DB query must use:

```js
.where({ 'pveProfile.highestClearedFloor': _.gt(0) })
.orderBy('pveProfile.highestClearedFloor', 'desc')
```

The in-memory comparator must be:

```js
const floorDelta = (b.pveProfile?.highestClearedFloor ?? 0)
  - (a.pveProfile?.highestClearedFloor ?? 0);
if (floorDelta !== 0) return floorDelta;
return (a.pveProfile?.highestClearedAt ?? Infinity)
  - (b.pveProfile?.highestClearedAt ?? Infinity);
```

Return only the five new entry fields. Remove tier/class/awakening fields from `PveLeaderboardEntry` and any lobby rendering fallback. Add the matching compound users index for descending `pveProfile.highestClearedFloor` and ascending `pveProfile.highestClearedAt` using the repository's existing index format.

- [ ] **Step 5: Verify, sync, and commit**

Run from `cloudfunctions/common`:

`npx jest __tests__/PveProfile.test.js __tests__/PveChallenge.test.js __tests__/PveLeaderboardDb.test.js __tests__/PveLeaderboard.test.js --runInBand`

Expected: all selected suites PASS.

Run: `npm run typecheck:game`

Run: `node scripts/sync-cloud-common.js`

Stage exact central files, tests, index file, client files and synced copies, then commit:

```bash
git commit -m "feat(pve): rank players from permanent profile"
```

---

### Task 6: Enforce Floors 1–14, Update Docs, and Run Full Regression

**Files:**
- Modify: `cloudfunctions/common/pve/PveChallengeValidate.js`
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Create: `cloudfunctions/common/__tests__/PveChallengeValidate.test.js`
- Modify: `test/pve/ChapterRouting.test.ts`
- Modify: `PROJECT_NAVIGATION.md`
- Modify: `CALL_FLOW.md`
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `specs/260712-pve-persistent-floor-progression/design.md`

**Interfaces:**
- Consumes: `MAX_READY_FLOOR = 14` in client routing.
- Produces: identical cloud maximum `MAX_READY_FLOOR = 14`; profile normalization cannot unlock above 14.

- [ ] **Step 1: Add cloud rejection tests**

```js
const { validateStartFloorChallengeRequest } = require('../pve/PveChallengeValidate');
const { createDefaultProfile } = require('../pve/PveProfile');

test('accepts floor 14 and rejects floor 15', () => {
  const profile = {
    ...createDefaultProfile(1),
    highestUnlockedFloor: 14,
    highestClearedFloor: 13,
  };
  const request = {
    mode: 'PROGRESSION',
    professionId: 'WARRIOR',
    equipmentLoadout: {},
    minghenLoadout: [],
  };
  expect(validateStartFloorChallengeRequest(profile, { ...request, floor: 14 }).floor).toBe(14);
  try {
    validateStartFloorChallengeRequest(
      { ...profile, highestUnlockedFloor: 35 },
      { ...request, floor: 15 },
    );
    throw new Error('EXPECTED_FLOOR_15_REJECTION');
  } catch (err) {
    expect(err.code).toBe('PVE_INVALID_FLOOR');
  }
});
```

Run from `cloudfunctions/common`:

`npx jest __tests__/PveChallengeValidate.test.js --runInBand`

Expected: FAIL because the cloud maximum is still 35.

- [ ] **Step 2: Align cloud validation and normalization to 14**

Use one exported constant in `PveChallengeValidate.js`:

```js
const MAX_READY_FLOOR = 14;
```

Reject floors outside `1..MAX_READY_FLOOR`. In `PveProfile.js`, cap `highestClearedFloor` and `highestUnlockedFloor` at 14, including the `highestClearedFloor + 1` normalization path. Export the constant only if a test or profile module imports it; do not create a second client-cloud shared package for one number.

- [ ] **Step 3: Strengthen the client routing test**

```ts
expect(chapterIdForFloor(14)).toBe(2);
expect(isFloorContentReady(14)).toBe(true);
expect(isFloorContentReady(15)).toBe(false);
expect(() => chapterIdForFloor(15)).toThrow('PVE_FLOOR_CONTENT_NOT_READY');
```

If `chapterIdForFloor(15)` currently silently returns chapter 2, change it to throw before selecting a factory.

- [ ] **Step 4: Update authority docs and navigation**

Document all final boundaries verbatim:

- three professions plus mastery only;
- no relic, achievement, or codex business system;
- only `restore_stamina` remains as an unconnected ad protocol;
- leaderboard reads `pveProfile.highestClearedFloor/highestClearedAt`;
- current official floor range is 1–14;
- old source and root database fields are not valid entry points.

Run: `node scripts/sync-cloud-common.js`

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npm run typecheck:game
npx jest test/pve/LegacyProfessionBoundary.test.ts test/pve/LegacyRelicBoundary.test.ts test/pve/LegacyMetaBoundary.test.ts test/pve/AdRewardBoundary.test.ts test/pve/ChapterRouting.test.ts test/pve/PersistentFloorFlow.test.ts --runInBand
cd cloudfunctions/common && npx jest __tests__/PveChallengeValidate.test.js __tests__/PveProfile.test.js __tests__/PveChallenge.test.js __tests__/PveLeaderboardDb.test.js __tests__/PveLeaderboard.test.js --runInBand
```

Expected: all focused tests and typecheck PASS.

Then run the two baseline suites and record summaries:

```bash
npm test -- --runInBand
cd cloudfunctions/common && npm test -- --runInBand
```

Expected: no more failed tests or suites than the pre-plan baselines (root: 32 failed tests; cloud: 2 failed assertions plus 2 historical parse-failure suites).

- [ ] **Step 6: Commit final guards and documentation**

Stage only Task 6 central files, generated synced copies, tests and four documentation files, then commit:

```bash
git commit -m "refactor(pve): finalize current system boundaries"
```
