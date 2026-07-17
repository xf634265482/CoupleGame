# Floor Challenge Stamina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 60-point stamina economy onto the authoritative permanent-floor challenge chain, charging exactly 5 stamina for each newly created floor challenge while keeping the first tutorial challenge free and resumes free.

**Architecture:** `PveProfile` becomes the stamina authority and `PveChallenge.startFloorChallenge()` performs recovery, eligibility, charging, challenge creation, and active-pointer updates in one transaction. The client reads stamina from `loadProfile`, performs only an early UX check, and trusts the cloud response as final authority. The legacy `startRun` cloud actions are disabled so a second player-facing stamina path cannot remain active.

**Tech Stack:** Cocos Creator 3.8.8, TypeScript, WeChat cloud functions, CommonJS, Jest/ts-jest.

## Global Constraints

- Stamina maximum is 60.
- A successfully created new floor challenge costs 5 stamina.
- Natural recovery is 1 stamina every 5 minutes, capped at 60.
- The first floor-1 progression tutorial challenge is free exactly once; retrying it costs 5.
- Loading or resuming the same ACTIVE challenge never charges stamina.
- Death and withdrawal do not charge at settlement; the next successful challenge creation charges.
- Cloud validation or transaction failure must not charge stamina or consume the tutorial-free marker.
- All cloud shared-source edits happen in `cloudfunctions/common/**`, followed by `node scripts/sync-cloud-common.js`.
- Gameplay behavior changes must update `specs/260608-pve-destiny-expedition/design.md` and `specs/260712-pve-persistent-floor-progression/design.md`.
- Stage only files named by the current task. Never use repository-wide `git add`.
- Never stage root `_*.txt`, `_split_floorflow.diff`, `chapter_tmp_test/`, `build_artifacts/`, or `gm-web/dist/`.
- Recovery anchors are `codex/pre-cleanup-snapshot-20260717` and `D:\GameSpace\CoupleGame-backups\pre-cleanup-20260717.bundle`.

---

## File responsibility map

- `cloudfunctions/common/pve/PveStamina.js`: pure recovery and challenge-consumption rules; no database access.
- `cloudfunctions/common/pve/PveProfile.js`: profile defaults, legacy-field migration, and normalized stamina snapshot.
- `cloudfunctions/common/pve/PveProgression.js`: persists profile migration and returns the authoritative lobby snapshot.
- `cloudfunctions/common/pve/PveChallenge.js`: the only transaction allowed to consume stamina for gameplay entry.
- `cloudfunctions/pve/index.js`: public cloud action router; legacy run actions are removed here.
- `assets/scripts/pve/core/PveProgressionTypes.ts`: shared client profile and response contracts.
- `assets/scripts/pve/core/PersistentFloorFlow.ts`: replaces its local pre-charge profile with the profile returned by challenge start.
- `assets/scripts/lobby/PveLobbyController.ts`: renders profile stamina and blocks an obviously unaffordable new challenge before scene transition.
- `assets/scripts/pve/core/PveConstants.ts`: client display constants, matching cloud values.

### Task 1: Pure stamina rules and profile ownership

**Files:**
- Modify: `cloudfunctions/common/pve/PveStamina.js`
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Modify: `cloudfunctions/common/__tests__/PveStamina.test.js`
- Modify: `cloudfunctions/common/__tests__/PveProfile.test.js`

**Interfaces:**
- Consumes: legacy root-user fields `pveStamina`, `pveStaminaUpdatedAt`, and `pveFirstRunStarted` as one-time migration inputs.
- Produces: `STAMINA_CHALLENGE_COST`, `consumeForFloorChallenge(state, freeEligible)`, and normalized `PveProfile.stamina`, `staminaUpdatedAt`, `staminaNextRecoveryAt`, `tutorialFreeChallengeConsumed`.

- [ ] **Step 1: Replace the old run-cost tests with challenge-cost and one-time-free tests**

Add these exact cases to `cloudfunctions/common/__tests__/PveStamina.test.js`, retaining the existing recovery tests:

```js
const {
  STAMINA_MAX,
  STAMINA_CHALLENGE_COST,
  STAMINA_RECOVERY_MS,
  resolveStamina,
  consumeForFloorChallenge,
} = require('../pve/PveStamina');

test('charges five for every paid floor challenge', () => {
  const result = consumeForFloorChallenge({
    stamina: 12,
    updatedAt: 100,
    nextRecoveryAt: 100 + STAMINA_RECOVERY_MS,
    tutorialFreeChallengeConsumed: true,
  }, false);
  expect(result).toMatchObject({
    stamina: 7,
    charged: STAMINA_CHALLENGE_COST,
    tutorialFreeChallengeConsumed: true,
  });
});

test('consumes the tutorial-free marker without charging', () => {
  const result = consumeForFloorChallenge({
    stamina: STAMINA_MAX,
    updatedAt: 100,
    nextRecoveryAt: null,
    tutorialFreeChallengeConsumed: false,
  }, true);
  expect(result).toMatchObject({
    stamina: STAMINA_MAX,
    charged: 0,
    tutorialFreeChallengeConsumed: true,
  });
});

test('rejects a paid challenge below five stamina', () => {
  expect(() => consumeForFloorChallenge({
    stamina: 4,
    updatedAt: 100,
    nextRecoveryAt: 200,
    tutorialFreeChallengeConsumed: true,
  }, false)).toThrow('体力不足');
});
```

Add these cases to `cloudfunctions/common/__tests__/PveProfile.test.js`:

```js
test('creates a profile with the permanent-floor stamina fields', () => {
  expect(createDefaultProfile(100)).toMatchObject({
    stamina: 60,
    staminaUpdatedAt: 100,
    staminaNextRecoveryAt: null,
    tutorialFreeChallengeConsumed: false,
  });
});

test('migrates legacy root stamina fields once', () => {
  const profile = normalizeProfile(undefined, 1_000, {
    pveStamina: 12,
    pveStaminaUpdatedAt: 500,
    pveFirstRunStarted: true,
  });
  expect(profile).toMatchObject({
    stamina: 12,
    staminaUpdatedAt: 500,
    tutorialFreeChallengeConsumed: true,
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the new contract fails**

Run:

```bash
cd cloudfunctions/common
npx jest __tests__/PveStamina.test.js __tests__/PveProfile.test.js --runInBand
```

Expected: FAIL because `STAMINA_CHALLENGE_COST`, `consumeForFloorChallenge`, and the profile stamina fields do not yet exist.

- [ ] **Step 3: Implement the pure challenge consumer**

Replace the cost and consumer section in `cloudfunctions/common/pve/PveStamina.js` with:

```js
const STAMINA_MAX = 60;
const STAMINA_CHALLENGE_COST = 5;
const STAMINA_RECOVERY_MS = 5 * 60 * 1000;

function consumeForFloorChallenge(state, freeEligible) {
  const stamina = Math.max(0, Math.min(STAMINA_MAX, normalizeInt(state.stamina, STAMINA_MAX)));
  if (freeEligible) {
    return {
      ...state,
      stamina,
      charged: 0,
      tutorialFreeChallengeConsumed: true,
    };
  }
  if (stamina < STAMINA_CHALLENGE_COST) {
    const err = new Error('体力不足');
    err.code = 'PVE_STAMINA_INSUFFICIENT';
    throw err;
  }
  return {
    ...state,
    stamina: stamina - STAMINA_CHALLENGE_COST,
    charged: STAMINA_CHALLENGE_COST,
    tutorialFreeChallengeConsumed: state.tutorialFreeChallengeConsumed === true,
  };
}
```

Export `STAMINA_CHALLENGE_COST` and `consumeForFloorChallenge`. Keep `resolveStamina` unchanged. Keep the legacy `consumeForNewRun` export temporarily so `db.js` remains loadable until the old-save cleanup plan removes it, but make it use `STAMINA_CHALLENGE_COST` instead of a separate 20-point constant.

- [ ] **Step 4: Add stamina fields and migration to the profile normalizer**

Import `STAMINA_MAX` and `resolveStamina` in `PveProfile.js`. Change `createDefaultProfile` and `normalizeProfile` to accept an optional legacy document and include this complete normalization block:

```js
function createDefaultProfile(now = Date.now(), legacy = {}) {
  const stamina = resolveStamina(
    legacy.pveStamina,
    legacy.pveStaminaUpdatedAt,
    now,
  );
  return {
    version: PROFILE_VERSION,
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
      WARRIOR: defaultMastery(true),
      ARCHER: defaultMastery(false),
      RANGER: defaultMastery(false),
    },
    selectedProfessionId: 'WARRIOR',
    tracking: null,
    activeChallengeId: null,
    stamina: stamina.stamina,
    staminaUpdatedAt: stamina.updatedAt,
    staminaNextRecoveryAt: stamina.nextRecoveryAt,
    tutorialFreeChallengeConsumed: legacy.pveFirstRunStarted === true,
    updatedAt: now,
  };
}
```

Change the normalizer signature to `normalizeProfile(value, now = Date.now(), legacy = {})`. Build defaults with `createDefaultProfile(now, legacy)`, then resolve the same-version profile fields with:

```js
const stamina = resolveStamina(
  Number.isFinite(value.stamina) ? value.stamina : defaults.stamina,
  Number.isFinite(value.staminaUpdatedAt) ? value.staminaUpdatedAt : defaults.staminaUpdatedAt,
  now,
);
```

Include these properties in the returned normalized profile:

```js
stamina: stamina.stamina,
staminaUpdatedAt: stamina.updatedAt,
staminaNextRecoveryAt: stamina.nextRecoveryAt,
tutorialFreeChallengeConsumed:
  value.tutorialFreeChallengeConsumed === true
  || defaults.tutorialFreeChallengeConsumed,
```

Do not increment `PROFILE_VERSION`; this is a compatible additive migration and must not reset permanent progression.

- [ ] **Step 5: Run focused tests**

Run the Task 1 command again.

Expected: both suites PASS.

- [ ] **Step 6: Sync cloud common and commit only Task 1 files**

Run:

```bash
node scripts/sync-cloud-common.js
git add cloudfunctions/common/pve/PveStamina.js cloudfunctions/common/pve/PveProfile.js cloudfunctions/common/__tests__/PveStamina.test.js cloudfunctions/common/__tests__/PveProfile.test.js cloudfunctions/login/common/pve/PveStamina.js cloudfunctions/login/common/pve/PveProfile.js cloudfunctions/initDb/common/pve/PveStamina.js cloudfunctions/initDb/common/pve/PveProfile.js cloudfunctions/pve/common/pve/PveStamina.js cloudfunctions/pve/common/pve/PveProfile.js cloudfunctions/adminLogin/common/pve/PveStamina.js cloudfunctions/adminLogin/common/pve/PveProfile.js cloudfunctions/adminTool/common/pve/PveStamina.js cloudfunctions/adminTool/common/pve/PveProfile.js
git commit -m "feat(pve): move stamina state into permanent profile"
```

### Task 2: Authoritative and idempotent challenge charging

**Files:**
- Modify: `cloudfunctions/common/pve/PveProgression.js`
- Modify: `cloudfunctions/common/pve/PveChallenge.js`
- Modify: `cloudfunctions/common/__tests__/PveProgression.test.js`
- Modify: `cloudfunctions/common/__tests__/PveChallenge.test.js`

**Interfaces:**
- Consumes: Task 1 `normalizeProfile(value, now, legacy)` and `consumeForFloorChallenge`.
- Produces: `startFloorChallenge()` responses containing `{ challenge, profile, resume, charged }`.

- [ ] **Step 1: Add transaction-level charging tests**

Add these exact cases to `PveChallenge.test.js`:

```js
test('first tutorial challenge is free and retrying the active challenge stays free', async () => {
  const user = { _id: 'doc1', id: 'u1' };
  const first = await startFloorChallenge(user, startRequest());
  const retry = await startFloorChallenge(user, startRequest());
  expect(first).toMatchObject({ resume: false, charged: 0 });
  expect(first.profile).toMatchObject({
    stamina: 60,
    tutorialFreeChallengeConsumed: true,
  });
  expect(retry).toMatchObject({ resume: true, charged: 0 });
  expect(retry.profile.stamina).toBe(60);
});

test('charges five for a new paid challenge', async () => {
  const user = { _id: 'doc1', id: 'u1' };
  mockStores.users.get('doc1').pveProfile = {
    ...createDefaultProfile(1),
    stamina: 12,
    staminaUpdatedAt: Date.now(),
    tutorialFreeChallengeConsumed: true,
  };
  const result = await startFloorChallenge(user, startRequest());
  expect(result).toMatchObject({ resume: false, charged: 5 });
  expect(result.profile.stamina).toBe(7);
  expect(mockStores.users.get('doc1').pveProfile.stamina).toBe(7);
});

test('insufficient stamina keeps the previous active challenge untouched', async () => {
  const user = { _id: 'doc1', id: 'u1' };
  const profile = createDefaultProfile(1);
  profile.highestUnlockedFloor = 2;
  profile.highestClearedFloor = 1;
  profile.tutorialFreeChallengeConsumed = true;
  profile.stamina = 5;
  mockStores.users.get('doc1').pveProfile = profile;
  const active = await startFloorChallenge(user, { ...startRequest(), floor: 2 });
  mockStores.users.get('doc1').pveProfile.stamina = 4;
  await expect(startFloorChallenge(user, {
    ...startRequest(),
    floor: 1,
    abandonActive: true,
  })).rejects.toMatchObject({ code: 'PVE_STAMINA_INSUFFICIENT' });
  expect(mockStores.pve_challenges.get(active.challenge.challengeId).status).toBe('ACTIVE');
  expect(mockStores.users.get('doc1').pveProfile.activeChallengeId).toBe(active.challenge.challengeId);
});
```

- [ ] **Step 2: Run the focused challenge tests and verify failure**

Run:

```bash
cd cloudfunctions/common
npx jest __tests__/PveChallenge.test.js __tests__/PveProgression.test.js --runInBand
```

Expected: FAIL because challenge start neither charges nor returns a profile.

- [ ] **Step 3: Persist normalized profile migration in `loadProfile`**

In `PveProgression.loadProfile`, call `normalizeProfile(latest.pveProfile, now, latest)`. Persist when the version differs or any stamina migration field is missing/different:

```js
const shouldPersist = latest.pveProfile?.version !== PROFILE_VERSION
  || latest.pveProfile?.stamina !== profile.stamina
  || latest.pveProfile?.staminaUpdatedAt !== profile.staminaUpdatedAt
  || latest.pveProfile?.tutorialFreeChallengeConsumed !== profile.tutorialFreeChallengeConsumed;
```

When `shouldPersist` is true, write `pveProfile: profile` and `updatedDate: serverDate()`. Return `{ profile }`.

- [ ] **Step 4: Charge only after active-resume detection and before active abandonment**

In `PveChallenge.js`, import `consumeForFloorChallenge`. Normalize with the full user document:

```js
const profile = normalizeProfile(userDoc.pveProfile, now, userDoc);
```

When an identical ACTIVE challenge matches, return:

```js
return { challenge: active, profile, resume: true, charged: 0 };
```

For a different ACTIVE challenge with `abandonActive: true`, retain its reference but delay the WITHDRAW update. Before updating the old challenge, create the charged profile:

```js
const tutorialFreeEligible = request.floor === 1
  && request.mode === 'PROGRESSION'
  && profile.tutorialFreeChallengeConsumed !== true;
const stamina = consumeForFloorChallenge(profile, tutorialFreeEligible);
const chargedProfile = {
  ...profile,
  stamina: stamina.stamina,
  staminaUpdatedAt: stamina.updatedAt,
  staminaNextRecoveryAt: stamina.nextRecoveryAt,
  tutorialFreeChallengeConsumed: stamina.tutorialFreeChallengeConsumed,
};
const challenge = buildChallenge(user.id, request, now);
const nextProfile = applyChallengeStart(chargedProfile, challenge, now);
```

Only after this block succeeds may the transaction mark a different prior challenge WITHDRAW. Then create the new challenge and update the user profile. Return:

```js
return {
  challenge,
  profile: nextProfile,
  resume: false,
  charged: stamina.charged,
};
```

This ordering makes the mock test and the real transaction both preserve the old ACTIVE challenge when stamina is insufficient.

- [ ] **Step 5: Run focused tests, sync common, and commit**

Run the Task 2 test command, then:

```bash
cd ../..
node scripts/sync-cloud-common.js
git add cloudfunctions/common/pve/PveProgression.js cloudfunctions/common/pve/PveChallenge.js cloudfunctions/common/__tests__/PveProgression.test.js cloudfunctions/common/__tests__/PveChallenge.test.js cloudfunctions/login/common/pve/PveProgression.js cloudfunctions/login/common/pve/PveChallenge.js cloudfunctions/initDb/common/pve/PveProgression.js cloudfunctions/initDb/common/pve/PveChallenge.js cloudfunctions/pve/common/pve/PveProgression.js cloudfunctions/pve/common/pve/PveChallenge.js cloudfunctions/adminLogin/common/pve/PveProgression.js cloudfunctions/adminLogin/common/pve/PveChallenge.js cloudfunctions/adminTool/common/pve/PveProgression.js cloudfunctions/adminTool/common/pve/PveChallenge.js
git commit -m "feat(pve): charge stamina when floor challenge starts"
```

Expected: focused suites PASS and sync reports all five target cloud functions.

### Task 3: Client contracts and floor-flow profile refresh

**Files:**
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts`
- Modify: `assets/scripts/network/PveProgressionService.ts`
- Modify: `assets/scripts/pve/core/PersistentFloorFlow.ts`
- Modify: `assets/scripts/pve/core/PveConstants.ts`
- Modify: `test/pve/PersistentFloorFlow.test.ts`

**Interfaces:**
- Consumes: Task 2 start response `{ challenge, profile, resume, charged }`.
- Produces: every newly created runtime uses the post-charge profile returned by cloud.

- [ ] **Step 1: Add a flow test proving the post-charge profile is used**

In `PersistentFloorFlow.test.ts`, make the mocked `start` response include a profile with `stamina: 55`, then add:

```ts
test('uses the authoritative profile returned by challenge start', async () => {
  const initial = profile({ stamina: 60, tutorialFreeChallengeConsumed: true });
  const charged = profile({ stamina: 55, tutorialFreeChallengeConsumed: true });
  const startedChallenge = challenge(1);
  const flow = new PersistentFloorFlow({
    loadProfile: async () => ({ profile: initial }),
    loadActive: async () => ({ challenge: null }),
    start: async () => ({
      challenge: startedChallenge,
      profile: charged,
      resume: false,
      charged: 5,
    }),
    save: async () => undefined,
    settle: async () => ({ profile: charged }),
  });
  const state = await flow.bootstrap(1);
  expect(state.profile.stamina).toBe(55);
});
```

Use the file's existing `profile()` and `challenge()` helpers. Add the four stamina defaults to the object returned by `profile()`:

```ts
stamina: 60,
staminaUpdatedAt: 1,
staminaNextRecoveryAt: null,
tutorialFreeChallengeConsumed: false,
```

Update the existing `mockApi().start` return so all existing tests satisfy the new interface and preserve their existing behavior:

```ts
start: async request => {
  starts.push(request);
  return {
    challenge: challenge(request.floor),
    profile: currentProfile,
    resume: false,
    charged: 0,
  };
},
```

- [ ] **Step 2: Run the focused client test and verify failure**

Run:

```bash
npx jest test/pve/PersistentFloorFlow.test.ts --runInBand
```

Expected: FAIL because the flow keeps the pre-start profile and the start interface has no profile.

- [ ] **Step 3: Extend client types and service response**

Add these fields to `PveProfile`:

```ts
stamina: number;
staminaUpdatedAt: number;
staminaNextRecoveryAt: number | null;
tutorialFreeChallengeConsumed: boolean;
```

Change `StartFloorChallengeResponse` to:

```ts
export interface StartFloorChallengeResponse extends CloudOk {
  challenge: FloorChallengeSnapshot;
  profile: PveProfile;
  resume: boolean;
  charged: number;
}
```

Change `PVE_STAMINA_RUN_COST` in `PveConstants.ts` to:

```ts
export const PVE_STAMINA_CHALLENGE_COST = 5;
```

- [ ] **Step 4: Make `PersistentFloorFlow` use the returned profile**

Change `PersistentFloorFlowApi.start` to return:

```ts
Promise<{
  challenge: FloorChallengeSnapshot;
  profile: PveProfile;
  resume: boolean;
  charged: number;
}>;
```

In `bootstrap`, use `started.profile` after a new start:

```ts
let authoritativeProfile = profile;
if (!challenge || (hasExplicitFloor && challenge.floor !== requestedFloor)) {
  const started = await this._api.start(
    progressionRequest(profile, requestedFloor, Boolean(challenge)),
  );
  challenge = started.challenge;
  authoritativeProfile = started.profile;
  resumed = started.resume;
} else {
  resumed = true;
}
```

Use `authoritativeProfile` for runtime creation and `_state.profile`.

In `continueNextFloor`, use `started.profile` both when creating the runtime and assigning `_state.profile`.

- [ ] **Step 5: Run focused test and typecheck, then commit**

Run:

```bash
npx jest test/pve/PersistentFloorFlow.test.ts --runInBand
npm run typecheck:game
```

Expected: test PASS and typecheck PASS.

Commit only:

```bash
git add assets/scripts/pve/core/PveProgressionTypes.ts assets/scripts/network/PveProgressionService.ts assets/scripts/pve/core/PersistentFloorFlow.ts assets/scripts/pve/core/PveConstants.ts test/pve/PersistentFloorFlow.test.ts
git commit -m "feat(pve): refresh floor flow after stamina charge"
```

### Task 4: Lobby stamina source and preflight UX

**Files:**
- Modify: `assets/scripts/lobby/PveLobbyController.ts`

**Interfaces:**
- Consumes: profile stamina fields and `PVE_STAMINA_CHALLENGE_COST` from Task 3.
- Produces: profile-backed stamina display, “首次免费” copy, “5 体力” copy, and an early insufficient-stamina guard.

- [ ] **Step 1: Import the challenge cost and apply profile stamina**

Replace the stamina constant imports with:

```ts
import {
  PVE_STAMINA_CHALLENGE_COST,
  PVE_STAMINA_MAX,
  PVE_STAMINA_RECOVERY_MS,
} from '../pve/core/PveConstants';
```

Add this method:

```ts
private _applyProfileStamina(profile: PveProfile): void {
  this._stamina = profile.stamina;
  this._staminaMax = PVE_STAMINA_MAX;
  this._staminaNextRecoveryAt = profile.staminaNextRecoveryAt;
  this._updateStaminaLabels();
}
```

Call it after every successful `loadPveProfile` used by lobby warming, `_refreshLobbyData`, and `_enterExpedition`. Remove stamina assignments from `_applyMetaSnapshot`; that method may continue handling legacy leaderboard/meta display until the separate Meta cleanup plan.

- [ ] **Step 2: Show the charge on floor buttons and guard scene transition**

Inside `_buildFloorSelectModal`, derive per-floor state:

```ts
const resume = activeFloor === floor;
const tutorialFree = floor === 1 && profile.tutorialFreeChallengeConsumed !== true;
const label = resume
  ? `继续\n第${chapterFloor}层`
  : tutorialFree
    ? `首次免费\n第${chapterFloor}层`
    : `5体力\n第${chapterFloor}层`;
```

Keep unlocked floors clickable even when `canAfford` is false so the click can show a reason, but pass `resume` and `tutorialFree` to the confirmation method:

```ts
void this._confirmFloorAndEnter(floor, resume, tutorialFree);
```

Change the method signature and add the guard before resource warming:

```ts
private async _confirmFloorAndEnter(
  floor: number,
  resume: boolean,
  tutorialFree: boolean,
): Promise<void> {
  if (this._busy) return;
  if (!resume && !tutorialFree && this._stamina < PVE_STAMINA_CHALLENGE_COST) {
    this._setStatus(`体力不足，需要 ${PVE_STAMINA_CHALLENGE_COST} 点体力`);
    return;
  }
  // Existing warm, GameSession, modal close, and scene-load code follows unchanged.
}
```

The cloud remains authoritative: if another device spends stamina after this check, scene bootstrap may still receive `PVE_STAMINA_INSUFFICIENT` and must display that cloud message without locally decrementing stamina.

- [ ] **Step 3: Typecheck and commit the lobby-only change**

Run:

```bash
npm run typecheck:game
```

Expected: PASS.

Commit:

```bash
git add assets/scripts/lobby/PveLobbyController.ts
git commit -m "feat(pve): show per-floor stamina cost in lobby"
```

### Task 5: Disable the legacy run entry and synchronize authoritative docs

**Files:**
- Modify: `cloudfunctions/pve/index.js`
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `specs/260712-pve-persistent-floor-progression/design.md`
- Modify: `PROJECT_NAVIGATION.md`
- Modify: `CALL_FLOW.md`

**Interfaces:**
- Consumes: Tasks 1–4 complete challenge chain.
- Produces: one public player-facing challenge-start action and documentation matching the deployed behavior.

- [ ] **Step 1: Remove player-facing legacy run actions from the router**

Delete this import from `cloudfunctions/pve/index.js`:

```js
const { loadActiveSave, startRun, saveFloorProgress, settleExpedition } = require('./common/pve/PveSave');
```

Delete the `loadSave`, `startRun`, `saveFloor`, and `settleRun` action branches. Keep `loadMeta`, `updateMeta`, and `loadLeaderboard` for now; their non-stamina cleanup belongs to the separate Profile/Meta plan.

Do not delete `PveSave.js`, `PveReward.js`, or `db.js` helpers in this task because GM cleanup still references legacy save storage and needs its own rollback boundary.

- [ ] **Step 2: Update all four authority documents with exact locked rules**

Add a dated stamina section to both gameplay designs containing these statements:

```text
- 体力上限 60，每 5 分钟恢复 1。
- 每次成功创建新的楼层挑战消耗 5；恢复同一 ACTIVE 挑战不消耗。
- 第 1 层首次正式教程挑战免费一次，失败后重试正常消耗 5。
- 死亡/撤退结算本身不扣费；下一次创建挑战时扣费。
- PveChallenge.startFloorChallenge 是唯一扣费入口，扣费与挑战创建处于同一事务。
```

Update `PROJECT_NAVIGATION.md` to point stamina authority to `PveProfile`, `PveStamina`, and `PveChallenge`. Update the start/continue call flows in `CALL_FLOW.md` to show the 5-point transaction and resume-free branch. Remove statements saying PVE stamina is retired.

- [ ] **Step 3: Run the focused and regression checks**

Run:

```bash
npm run typecheck:game
npx jest test/pve/PersistentFloorFlow.test.ts --runInBand
cd cloudfunctions/common
npx jest __tests__/PveStamina.test.js __tests__/PveProfile.test.js __tests__/PveProgression.test.js __tests__/PveChallenge.test.js --runInBand
cd ../..
node scripts/sync-cloud-common.js
git diff --exit-code cloudfunctions/common/pve/PveStamina.js cloudfunctions/pve/common/pve/PveStamina.js
git diff --exit-code cloudfunctions/common/pve/PveProfile.js cloudfunctions/pve/common/pve/PveProfile.js
git diff --exit-code cloudfunctions/common/pve/PveProgression.js cloudfunctions/pve/common/pve/PveProgression.js
git diff --exit-code cloudfunctions/common/pve/PveChallenge.js cloudfunctions/pve/common/pve/PveChallenge.js
```

Expected: typecheck and all focused suites PASS; all four sync comparisons produce no output.

Run the full baselines and record any remaining failures without broadening this task:

```bash
npm run test:pve -- --runInBand
cd cloudfunctions/common
npm test -- --runInBand
```

Pre-plan baseline was 76/87 PVE suites passing with 32 failures and 10/14 cloud suites passing with two assertion failures plus two corrupted test parse failures. This task must add no new unrelated failures; the later system-cleanup plans own removal or repair of the recorded legacy failures.

- [ ] **Step 4: Commit router and documentation only**

Run:

```bash
git add cloudfunctions/pve/index.js specs/260608-pve-destiny-expedition/design.md specs/260712-pve-persistent-floor-progression/design.md PROJECT_NAVIGATION.md CALL_FLOW.md
git commit -m "docs(pve): lock authoritative stamina challenge flow"
```

## Plan self-review

- Spec coverage: Tasks 1–5 cover parameters, first-free semantics, paid starts, death/withdraw timing, resume idempotency, legacy migration, client display, insufficient balance, future ad boundary, tests, sync, and authority docs.
- Scope boundary: old save storage, GM legacy-save operations, Meta/leaderboard migration, real advertising, and payment remain separate cleanup projects.
- Type consistency: `StartFloorChallengeResponse`, `PersistentFloorFlowApi.start`, and cloud return values all use `{ challenge, profile, resume, charged }`; profile stamina fields use the same names on cloud and client.
- Rollback boundary: every task ends in a focused commit and can be reverted independently.
