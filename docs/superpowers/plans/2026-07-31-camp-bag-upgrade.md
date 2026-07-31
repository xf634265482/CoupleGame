# Camp Bag Upgrade (Void Hide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bag capacity upgrades (`25→35→45→60`) funded by stardust + 虚空革 (`voidHide`), with Boss/elite CLEAR grants and a camp bag-title upgrade entry (placeholder UI).

**Architecture:** Extend `materials` + `bagCapacity` on the profile. Pure client tables in `CampBagUpgrade.ts` mirror cloud costs for preview. Cloud `upgradeBag` in `PveCamp.js` is authoritative via `manageCamp({ type: 'UPGRADE_BAG' })`. Settlement grants `voidHide` beside existing sand/core. Layout/bag UI read `profile.bagCapacity` instead of a hard-coded 25-slot outer frame.

**Tech Stack:** Cocos Creator 3.8.8 TypeScript, WeChat cloud `cloudfunctions/common/pve/*`, Jest (`npm run test:pve` + `cd cloudfunctions/common && npm test`).

## Global Constraints

- Capacity ladder only: `25|35|45|60` (default 25).
- Material: `materials.voidHide`（虚空革）+ 星尘; no sell grants, no stardust shop exchange.
- CLEAR grants: Boss `+2`, elite-non-Boss `+1`, else `0`; TRIAL/PRACTICE `0`.
- Costs: `25→35` 120/3, `35→45` 240/6, `45→60` 400/10.
- Entry: bag title row 「扩容」 on both Minghen/Equipment camp tabs; placeholder confirm OK.
- Edit only `cloudfunctions/common/**` then `node scripts/sync-cloud-common.js`.
- PVE `core/` must not import `cc`.
- Icon path reserved `pve/lobby/icon_mat_void_hide`; missing art must not crash.
- Sync `specs/260608-pve-destiny-expedition/design.md` when gameplay lands.

---

## File Map

| File | Role |
|---|---|
| Create `assets/scripts/pve/core/CampBagUpgrade.ts` | Capacity normalize, next tier, cost table (Jest) |
| Modify `assets/scripts/pve/core/equipment/EquipmentProgression.ts` | `CampMaterials.voidHide` + normalize |
| Modify `assets/scripts/pve/core/PveProgressionTypes.ts` | `bagCapacity?`, materials type |
| Modify `cloudfunctions/common/pve/PveProfile.js` | defaults + normalize `voidHide` / `bagCapacity` |
| Modify `cloudfunctions/common/pve/PveCamp.js` | materials normalize, grants, `upgradeBag`, export |
| Modify `cloudfunctions/common/pve/PveChallengeState.js` | apply `voidHide` grant + reward snapshot |
| Modify `cloudfunctions/common/pve/PveProgression.js` | `manageCamp` type `UPGRADE_BAG` |
| Modify `cloudfunctions/common/__tests__/PveCamp.test.js` | grants + upgrade cases |
| Modify `assets/scripts/network/PveProgressionService.ts` | request union |
| Modify `assets/scripts/pve/views/CampLayoutConstants.ts` | default slots + height(slots) |
| Modify `CampMinghenLayout.ts` / `CampEquipmentLayout.ts` | metrics take `bagCapacity` |
| Modify `CampSharedBag.ts` + tests | VOID_HIDE material entry |
| Modify `CampView.ts` / `CampController.ts` | upgrade button + confirm + call |
| Modify `design.md` + materials/bag specs status | docs |

---

### Task 1: Client pure upgrade tables + materials normalize

**Files:**
- Create: `assets/scripts/pve/core/CampBagUpgrade.ts`
- Modify: `assets/scripts/pve/core/equipment/EquipmentProgression.ts` (`CampMaterials`, `normalizeCampMaterials`)
- Modify: `assets/scripts/pve/core/PveProgressionTypes.ts` (`materials`, `bagCapacity?`)
- Test: `test/pve/CampBagUpgrade.test.ts`

**Interfaces:**
- Produces:
  - `export const CAMP_BAG_CAPACITY_STEPS = [25, 35, 45, 60] as const`
  - `export type CampBagCapacity = (typeof CAMP_BAG_CAPACITY_STEPS)[number]`
  - `export function normalizeBagCapacity(value: unknown): CampBagCapacity`
  - `export function nextBagCapacity(current: number): CampBagCapacity | null`
  - `export function bagUpgradeCost(from: CampBagCapacity): { stardust: number; voidHide: number } | null`
  - `CampMaterials` includes `voidHide: number`

- [ ] **Step 1: Write failing tests**

```ts
// test/pve/CampBagUpgrade.test.ts
import {
  bagUpgradeCost,
  normalizeBagCapacity,
  nextBagCapacity,
} from '../../assets/scripts/pve/core/CampBagUpgrade';
import { normalizeCampMaterials } from '../../assets/scripts/pve/core/equipment/EquipmentProgression';

test('normalizeBagCapacity accepts ladder only', () => {
  expect(normalizeBagCapacity(undefined)).toBe(25);
  expect(normalizeBagCapacity(35)).toBe(35);
  expect(normalizeBagCapacity(30)).toBe(25);
});

test('upgrade ladder and costs match design', () => {
  expect(nextBagCapacity(25)).toBe(35);
  expect(nextBagCapacity(60)).toBeNull();
  expect(bagUpgradeCost(25)).toEqual({ stardust: 120, voidHide: 3 });
  expect(bagUpgradeCost(35)).toEqual({ stardust: 240, voidHide: 6 });
  expect(bagUpgradeCost(45)).toEqual({ stardust: 400, voidHide: 10 });
  expect(bagUpgradeCost(60)).toBeNull();
});

test('normalizeCampMaterials includes voidHide', () => {
  expect(normalizeCampMaterials({ quenchSand: 1 })).toEqual({
    quenchSand: 1,
    fusionCore: 0,
    voidHide: 0,
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx jest --roots test/pve --testPathPattern CampBagUpgrade`

- [ ] **Step 3: Implement**

```ts
// CampBagUpgrade.ts (core, no cc)
export const CAMP_BAG_CAPACITY_STEPS = [25, 35, 45, 60] as const;
export type CampBagCapacity = (typeof CAMP_BAG_CAPACITY_STEPS)[number];

const COSTS: Record<25 | 35 | 45, { stardust: number; voidHide: number }> = {
  25: { stardust: 120, voidHide: 3 },
  35: { stardust: 240, voidHide: 6 },
  45: { stardust: 400, voidHide: 10 },
};

export function normalizeBagCapacity(value: unknown): CampBagCapacity {
  if (value === 25 || value === 35 || value === 45 || value === 60) return value;
  return 25;
}

export function nextBagCapacity(current: number): CampBagCapacity | null {
  const cap = normalizeBagCapacity(current);
  const i = CAMP_BAG_CAPACITY_STEPS.indexOf(cap);
  return i < 0 || i >= CAMP_BAG_CAPACITY_STEPS.length - 1
    ? null
    : CAMP_BAG_CAPACITY_STEPS[i + 1]!;
}

export function bagUpgradeCost(from: CampBagCapacity): { stardust: number; voidHide: number } | null {
  if (from === 60) return null;
  return COSTS[from] ?? null;
}
```

Update `CampMaterials` + `normalizeCampMaterials` to include `voidHide` (same int rules as sand/core). Add `bagCapacity?: number` on `PveProfile` with comment default 25.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/CampBagUpgrade.ts \
  assets/scripts/pve/core/equipment/EquipmentProgression.ts \
  assets/scripts/pve/core/PveProgressionTypes.ts \
  test/pve/CampBagUpgrade.test.ts
git commit -m "feat(pve): bag upgrade cost tables and voidHide material type"
```

---

### Task 2: Cloud profile + grants + UPGRADE_BAG

**Files:**
- Modify: `cloudfunctions/common/pve/PveProfile.js`
- Modify: `cloudfunctions/common/pve/PveCamp.js`
- Modify: `cloudfunctions/common/pve/PveChallengeState.js` (materials merge + rewardSnapshot)
- Modify: `cloudfunctions/common/pve/PveProgression.js` (`manageCamp`)
- Modify: `cloudfunctions/common/__tests__/PveCamp.test.js`
- Run: `node scripts/sync-cloud-common.js` after source edits

**Interfaces:**
- Consumes: cost ladder identical to client
- Produces: `upgradeBag(profile) -> profile`, `settlementMaterialGrants` returns `{ quenchSand, fusionCore, voidHide }`, `normalizeMaterials` includes `voidHide`, `normalizeBagCapacity` / profile `bagCapacity`

- [ ] **Step 1: Extend failing cloud tests**

In `PveCamp.test.js`:

```js
test('settlementMaterialGrants includes voidHide for boss and elite', () => {
  expect(settlementMaterialGrants(14, 'PROGRESSION')).toEqual({
    quenchSand: 8, fusionCore: 2, voidHide: 2,
  });
  expect(settlementMaterialGrants(9, 'PROGRESSION')).toEqual({
    quenchSand: 4, fusionCore: 1, voidHide: 1,
  });
  expect(settlementMaterialGrants(8, 'PROGRESSION')).toEqual({
    quenchSand: 3, fusionCore: 0, voidHide: 0,
  });
  expect(settlementMaterialGrants(14, 'TRIAL')).toEqual({
    quenchSand: 0, fusionCore: 0, voidHide: 0,
  });
});

test('upgradeBag spends stardust and voidHide', () => {
  const { upgradeBag } = require('../pve/PveCamp');
  const next = upgradeBag({
    ...profile(),
    gold: 200,
    materials: { quenchSand: 0, fusionCore: 0, voidHide: 5 },
    bagCapacity: 25,
  });
  expect(next.bagCapacity).toBe(35);
  expect(next.gold).toBe(80);
  expect(next.materials.voidHide).toBe(2);
});

test('upgradeBag rejects max and shortages', () => {
  const { upgradeBag } = require('../pve/PveCamp');
  expect(() => upgradeBag({ ...profile(), bagCapacity: 60, gold: 999, materials: { quenchSand: 0, fusionCore: 0, voidHide: 99 } }))
    .toThrow(/上限|满/);
  expect(() => upgradeBag({ ...profile(), bagCapacity: 25, gold: 10, materials: { quenchSand: 0, fusionCore: 0, voidHide: 99 } }))
    .toThrow(/星尘/);
});
```

Update existing material assertions that omit `voidHide`. Ensure `profile()` helper includes `voidHide: 0` and `bagCapacity: 25`.

- [ ] **Step 2: Run cloud tests — expect FAIL**

Run: `cd cloudfunctions/common && npm test -- --testPathPattern PveCamp`

- [ ] **Step 3: Implement cloud**

`PveCamp.js`:

```js
const BAG_STEPS = [25, 35, 45, 60];
const BAG_UPGRADE_COST = {
  25: { stardust: 120, voidHide: 3 },
  35: { stardust: 240, voidHide: 6 },
  45: { stardust: 400, voidHide: 10 },
};

function normalizeBagCapacity(value) {
  return BAG_STEPS.includes(value) ? value : 25;
}

function normalizeMaterials(value) {
  const src = value && typeof value === 'object' ? value : {};
  return {
    quenchSand: Number.isInteger(src.quenchSand) && src.quenchSand >= 0 ? src.quenchSand : 0,
    fusionCore: Number.isInteger(src.fusionCore) && src.fusionCore >= 0 ? src.fusionCore : 0,
    voidHide: Number.isInteger(src.voidHide) && src.voidHide >= 0 ? src.voidHide : 0,
  };
}

function settlementMaterialGrants(floor, mode) {
  if (mode === 'TRIAL' || mode === 'PRACTICE') {
    return { quenchSand: 0, fusionCore: 0, voidHide: 0 };
  }
  // ... existing sand/core ...
  let voidHide = 0;
  if (isBoss) voidHide = 2;
  else if (isElite) voidHide = 1;
  return { quenchSand, fusionCore, voidHide };
}

function upgradeBag(profile) {
  const from = normalizeBagCapacity(profile.bagCapacity);
  const cost = BAG_UPGRADE_COST[from];
  if (!cost) fail('PVE_BAG_MAX', '背包已扩至上限');
  if (profile.gold < cost.stardust) fail('PVE_STARDUST_NOT_ENOUGH', '星尘不足');
  const bag = normalizeMaterials(profile.materials);
  if (bag.voidHide < cost.voidHide) fail('PVE_VOID_HIDE_NOT_ENOUGH', '虚空革不足');
  const to = BAG_STEPS[BAG_STEPS.indexOf(from) + 1];
  return {
    ...withMaterials(profile, {
      ...bag,
      voidHide: bag.voidHide - cost.voidHide,
    }),
    gold: profile.gold - cost.stardust,
    bagCapacity: to,
  };
}
```

**Important:** every `withMaterials(...)` call that rebuilds materials must spread full bag (`...bag`) so `voidHide` is not wiped (enhance/synth/sell).

`PveProfile.js`: default + normalize `voidHide` and `bagCapacity: normalizeBagCapacity(...)` (inline allowed values or require helper from PveCamp — prefer duplicate tiny normalize in Profile to avoid cycles, or export `normalizeBagCapacity` from PveCamp and require it if no cycle). Prefer **inline 25|35|45|60 check in PveProfile** to avoid circular requires.

`PveChallengeState.js`:

```js
materials: {
  quenchSand: bag.quenchSand + materialGrants.quenchSand,
  fusionCore: bag.fusionCore + materialGrants.fusionCore,
  voidHide: bag.voidHide + materialGrants.voidHide,
},
// rewardSnapshot also voidHide: materialGrants.voidHide
```

`PveProgression.js` manageCamp:

```js
else if (request.type === 'UPGRADE_BAG') next = upgradeBag(profile);
```

Export `upgradeBag` from `PveCamp.js`.

- [ ] **Step 4: Run cloud tests — expect PASS**

- [ ] **Step 5: Sync copies**

Run: `node scripts/sync-cloud-common.js`

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/common/pve/PveProfile.js \
  cloudfunctions/common/pve/PveCamp.js \
  cloudfunctions/common/pve/PveChallengeState.js \
  cloudfunctions/common/pve/PveProgression.js \
  cloudfunctions/common/__tests__/PveCamp.test.js \
  cloudfunctions/*/common/pve/
git commit -m "feat(pve): cloud bag upgrade and voidHide settlement grants"
```

---

### Task 3: Dynamic bag layout + shared bag VOID_HIDE

**Files:**
- Modify: `assets/scripts/pve/views/CampLayoutConstants.ts`
- Modify: `assets/scripts/pve/views/CampMinghenLayout.ts`
- Modify: `assets/scripts/pve/views/CampEquipmentLayout.ts`
- Modify: `assets/scripts/pve/views/CampSharedBag.ts`
- Modify: `test/pve/CampSharedBag.test.ts`
- Modify: `test/pve/CampMinghenLayout.test.ts`
- Modify: `test/pve/CampEquipmentLayout.test.ts`
- Test: extend layout tests for capacity 35 height

**Interfaces:**
- Consumes: `normalizeBagCapacity` from `CampBagUpgrade`
- Produces: `campBagBlockHeight(slots)`, `minghenContentMetrics(bagCapacity?)`, materialId `'VOID_HIDE'`

- [ ] **Step 1: Failing tests**

```ts
// CampLayoutConstants / layout: height grows with slots
import { campBagBlockHeight } from '.../CampLayoutConstants';
expect(campBagBlockHeight(35)).toBeGreaterThan(campBagBlockHeight(25));

// CampSharedBag
expect(buildCampSharedBagEntries(
  stubProfile({ materials: { quenchSand: 0, fusionCore: 0, voidHide: 4 } }),
  'MATERIAL',
)).toEqual([{ kind: 'MATERIAL', materialId: 'VOID_HIDE', amount: 4 }]);
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
// CampLayoutConstants.ts
export const CAMP_BAG_DEFAULT_SLOTS = 25;
export const CAMP_BAG_SLOTS = CAMP_BAG_DEFAULT_SLOTS; // backward-compat alias = default

export function campBagRows(slots: number): number {
  return Math.ceil(Math.max(1, slots) / CAMP_BAG_COLS);
}

export function campBagBlockHeight(slots: number = CAMP_BAG_DEFAULT_SLOTS): number {
  const rows = campBagRows(slots);
  return rows * CAMP_SLOT_SIZE + (rows - 1) * CAMP_SLOT_GAP;
}
```

`minghenContentMetrics(bagCapacity = 25)` / `equipmentContentMetrics(bagCapacity = 25)`: normalize capacity, use `campBagBlockHeight(cap)` and expose `bagSlots: cap` on metrics if useful.

`CampSharedBag` material union add `'VOID_HIDE'`; push when `mats.voidHide > 0`.

- [ ] **Step 4: Run layout + shared bag tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/views/CampLayoutConstants.ts \
  assets/scripts/pve/views/CampMinghenLayout.ts \
  assets/scripts/pve/views/CampEquipmentLayout.ts \
  assets/scripts/pve/views/CampSharedBag.ts \
  test/pve/CampSharedBag.test.ts \
  test/pve/CampMinghenLayout.test.ts \
  test/pve/CampEquipmentLayout.test.ts
git commit -m "feat(pve): dynamic camp bag capacity layout and voidHide bag entry"
```

---

### Task 4: CampController + CampView wire-up

**Files:**
- Modify: `assets/scripts/network/PveProgressionService.ts` (`ManageCampRequest`)
- Modify: `assets/scripts/pve/controllers/CampController.ts`
- Modify: `assets/scripts/pve/views/CampView.ts` (bag title row + confirm + material icon path)

**Interfaces:**
- Consumes: `manageCamp({ type: 'UPGRADE_BAG' })`, `nextBagCapacity`, `bagUpgradeCost`, `normalizeBagCapacity`
- Produces: working upgrade button; bag loops use `bagCapacity`

- [ ] **Step 1: Extend ManageCampRequest**

```ts
| { type: 'UPGRADE_BAG' }
```

- [ ] **Step 2: CampController**

Add callback `onUpgradeBag(): void` → `_busy` guard → `manageCamp({ type: 'UPGRADE_BAG' })` → refresh view; toast success/error (`err.code` / message).

- [ ] **Step 3: CampView bag rendering**

- Resolve `const bagSlots = normalizeBagCapacity(profile.bagCapacity)`.
- Pass into `minghenContentMetrics(bagSlots)` / `equipmentContentMetrics(bagSlots)`.
- Replace `CAMP_BAG_SLOTS` loops with `bagSlots`.
- Bag title row: left 「背包」, right small 「扩容」 button (or 「已满」 disabled at 60).
- On expand: simple confirm panel Label: `25→35 · 星尘120 + 虚空革3`；确认调 `onUpgradeBag`.
- Material icon: map `VOID_HIDE` → `'pve/lobby/icon_mat_void_hide'` with same fallback as other mats when sprite missing.

- [ ] **Step 4: Smoke unit tests still green**

Run: `npx jest --roots test/pve --testPathPattern "CampBagUpgrade|CampSharedBag|CampMinghenLayout|CampEquipmentLayout"`

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/network/PveProgressionService.ts \
  assets/scripts/pve/controllers/CampController.ts \
  assets/scripts/pve/views/CampView.ts
git commit -m "feat(pve): camp bag expand entry and UPGRADE_BAG wire-up"
```

---

### Task 5: Docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md` (camp bag bullet)
- Modify: `docs/superpowers/specs/2026-07-31-camp-materials-v1-design.md` (note voidHide extension)
- Modify: `docs/superpowers/specs/2026-07-31-camp-ui-glyph-inventory-design.md` (remove “扩容经济留后”)
- Modify: `docs/superpowers/specs/2026-07-31-camp-bag-upgrade-design.md` (status → 实现完成 after code lands; during this task set 「实现中」 then complete)

- [ ] **Step 1: design.md**

Add/adjust: 共用背包容量默认 25，可花星尘+虚空革升级 35/45/60；虚空革 Boss+2 / 精英+1；营地背包标题「扩容」。权威 `UPGRADE_BAG`。细则见 bag-upgrade design spec.

- [ ] **Step 2: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md \
  docs/superpowers/specs/2026-07-31-camp-materials-v1-design.md \
  docs/superpowers/specs/2026-07-31-camp-ui-glyph-inventory-design.md \
  docs/superpowers/specs/2026-07-31-camp-bag-upgrade-design.md
git commit -m "docs(pve): sync bag upgrade and voidHide 口径"
```

---

## Self-Review

1. **Spec coverage:** ladder/costs §4 → T1/T2; grants §5 → T2; entry §6 → T4; bag display voidHide → T3/T4; docs §7 → T5; AC covered by cloud+client tests + manual expand click.
2. **Placeholders:** none.
3. **Types:** `voidHide` / `VOID_HIDE` / `UPGRADE_BAG` / `bagCapacity` naming consistent; material union uses `'VOID_HIDE'` like sand/core ids.

## Manual AC (after Task 4)

1. Expand 25→35 with enough mats; slots increase; gold/voidHide drop.
2. Shortage / max blocked with clear toast.
3. Boss clear shows voidHide in rewards path (or profile delta).
4. Missing voidHide PNG does not crash bag.
