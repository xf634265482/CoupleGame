# GM Player Balance → Persistent Floor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 GM `pve_balance_configs` 的玩家字段在永久楼层「新开本层 / 重新挑战」时生效，便于测试覆盖玩家数值。

**Architecture:** `loadPveMeta.balanceSnapshot` 经 `PersistentFloorFlow` 传入 `createPersistentFloorRuntime`；各章 factory 写入 `state.balanceSnapshot`，并用 `resolveProfessionBaseWithBalance`（GM 有值则替换职业基础，装备仍叠加）。续玩只恢复存档。战斗侧 `playerAttackPower` / AP 消耗 / `endTurn` AP 基数读该 snapshot。

**Tech Stack:** Cocos Creator 3.8 TypeScript（`assets/scripts/pve/core`）、ts-jest（`test/pve/`）、现有 `PveBalance` / `ProfessionBaseStats` / `PersistentFloorFlow`。

**Spec:** `docs/superpowers/specs/2026-07-28-gm-player-balance-persistent-floor-design.md`

## Global Constraints

- 只接玩家字段；不接怪物/Boss/装备倍率。
- GM 字段有值 → 整项替换该职业基础；未配置字段保持职业/代码默认。
- 仅 `createPersistentFloorRuntime` 路径灌入；`resume` 不重套最新 GM。
- PVE `core/` 禁止 `import 'cc'`、禁止直接 `Math.random()`。
- `loadBalanceSnapshot` 只含 DB 覆盖（不含代码默认全集）；空 snapshot 不得把职业 HP 压成旧冒险者 280。
- 玩法变更同步 `specs/260608-pve-destiny-expedition/design.md` 与 `CALL_FLOW.md`。
- 未传 `balanceSnapshot` 时 `playerAttackPower(player)` 行为与现网一致。

## File Structure

| File | Role |
|------|------|
| Modify `assets/scripts/pve/core/PveBalance.ts` | 新增 `resolveProfessionBaseWithBalance` |
| Create `test/pve/ResolveProfessionBaseWithBalance.test.ts` | helper 覆盖/回退单测 |
| Modify `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts` | 接 snapshot；开局玩家/AP 用 helper |
| Modify `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts` | 同上 |
| Modify `assets/scripts/pve/core/chapter3/Chapter3ExpeditionFactory.ts` | 同上 |
| Modify `assets/scripts/pve/core/chapter4/Chapter4ExpeditionFactory.ts` | 同上 |
| Modify `assets/scripts/pve/core/chapter5/Chapter5ExpeditionFactory.ts` | 同上 |
| Modify `assets/scripts/pve/tutorial/TutorialFloorFactory.ts` | 教学层同样接 snapshot（测试用） |
| Modify `test/pve/Chapter1ExpeditionFactory.test.ts` | 断言 GM 覆盖开局 HP/攻击相关字段 |
| Modify `assets/scripts/pve/core/CombatSystem.ts` | `playerAttackPower` 尊重 snapshot |
| Modify `assets/scripts/pve/core/ExpeditionState.ts` | `endTurn` 永久模式 AP 基数走 helper |
| Modify `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` | `PersistentFloorRuntimeOptions.balanceSnapshot` 下传到 factory |
| Modify `assets/scripts/pve/core/PersistentFloorFlow.ts` | bootstrap/restart/continueNextFloor 传入 snapshot |
| Modify `assets/scripts/pve/controllers/ExpeditionController.ts` | 把 meta snapshot 传入 flow；收敛死字段 |
| Modify `specs/260608-pve-destiny-expedition/design.md` | 永久楼层消费 GM 玩家覆盖 |
| Modify `CALL_FLOW.md` | 开局链补一句 |

---

### Task 1: `resolveProfessionBaseWithBalance` helper

**Files:**
- Modify: `assets/scripts/pve/core/PveBalance.ts`
- Create: `test/pve/ResolveProfessionBaseWithBalance.test.ts`

**Interfaces:**
- Consumes: `professionBaseStats`, `getPlayerBalanceConfig`, `PveProfessionId`, `PveBalanceSnapshot`
- Produces:
  ```ts
  export function resolveProfessionBaseWithBalance(
    professionId: PveProfessionId,
    balanceSnapshot?: PveBalanceSnapshot | null,
    chapter?: number,
  ): { maxHp: number; attack: number; apBase: number; attackRange: number }
  ```

- [ ] **Step 1: Write the failing test**

Create `test/pve/ResolveProfessionBaseWithBalance.test.ts`:

```ts
import { resolveProfessionBaseWithBalance } from '../../assets/scripts/pve/core/PveBalance';
import type { PveBalanceSnapshot } from '../../assets/scripts/pve/core/PveTypes';

function snap(player: Record<string, number>): PveBalanceSnapshot {
  return { globalConfig: { player }, chapterConfigs: {}, unitConfigs: {} };
}

describe('resolveProfessionBaseWithBalance', () => {
  test('falls back to warrior profession when snapshot empty', () => {
    expect(resolveProfessionBaseWithBalance('WARRIOR', null, 1)).toEqual({
      maxHp: 320,
      attack: 13,
      apBase: 7,
      attackRange: 1,
    });
  });

  test('overrides only fields present in GM config', () => {
    const base = resolveProfessionBaseWithBalance('WARRIOR', snap({ initialHp: 9999 }), 1);
    expect(base.maxHp).toBe(9999);
    expect(base.attack).toBe(13);
    expect(base.apBase).toBe(7);
    expect(base.attackRange).toBe(1);
  });

  test('overrides attack range and apBase when set', () => {
    const base = resolveProfessionBaseWithBalance(
      'ARCHER',
      snap({ baseAttack: 100, baseAttackRange: 5, apBase: 20 }),
      1,
    );
    expect(base).toMatchObject({ maxHp: 240, attack: 100, apBase: 20, attackRange: 5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/pve/ResolveProfessionBaseWithBalance.test.ts --no-cache`
Expected: FAIL（`resolveProfessionBaseWithBalance` 未导出）

- [ ] **Step 3: Implement helper in `PveBalance.ts`**

Add import for `professionBaseStats` / `PveProfessionId`（从 `./professions/ProfessionBaseStats` 与 `./PveProgressionTypes`；注意 `core/` 无 `cc`）。

```ts
export function resolveProfessionBaseWithBalance(
  professionId: PveProfessionId,
  balanceSnapshot?: PveBalanceSnapshot | null,
  chapter = 1,
): { maxHp: number; attack: number; apBase: number; attackRange: number } {
  const base = professionBaseStats(professionId);
  const config = getPlayerBalanceConfig(balanceSnapshot, chapter);
  return {
    maxHp: config.initialHp ?? base.maxHp,
    attack: config.baseAttack ?? base.attack,
    apBase: config.apBase ?? base.apBase,
    attackRange: config.baseAttackRange ?? base.attackRange,
  };
}
```

若出现 `PveBalance` ↔ profession 循环依赖：把 helper 放到 `assets/scripts/pve/core/professions/ProfessionBalance.ts` 并在测试中改 import 路径（保持同签名）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/pve/ResolveProfessionBaseWithBalance.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/PveBalance.ts test/pve/ResolveProfessionBaseWithBalance.test.ts
# 若拆到 ProfessionBalance.ts 则一并 add
git commit -m "feat(pve): resolve profession base against GM player balance"
```

---

### Task 2: Chapter 1 factory wires snapshot + GM open stats

**Files:**
- Modify: `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts`
- Modify: `test/pve/Chapter1ExpeditionFactory.test.ts`

**Interfaces:**
- Consumes: `resolveProfessionBaseWithBalance`, `getPlayerBalanceConfig`
- Produces:
  ```ts
  export function createChapter1ExpeditionState(
    snapshot: FloorChallengeSnapshot,
    profile: PveProfile,
    balanceSnapshot?: PveBalanceSnapshot | null,
  ): ExpeditionState
  ```

- [ ] **Step 1: Extend Chapter1 factory tests**

Append to `test/pve/Chapter1ExpeditionFactory.test.ts`:

```ts
  test('applies GM player overrides on fresh chapter1 state', () => {
    const balance = {
      globalConfig: { player: { initialHp: 9999, initialGold: 12, initialAnima: 3, apBase: 20, moveCost: 0 } },
      chapterConfigs: {},
      unitConfigs: {},
    };
    const state = createChapter1ExpeditionState(challenge(1), profile(), balance);
    expect(state.balanceSnapshot).toEqual(balance);
    expect(state.player.maxHp).toBe(9999);
    expect(state.player.hp).toBe(9999);
    expect(state.player.gold).toBe(12);
    expect(state.player.anima).toBe(3);
    expect(state.player.animaProgress).toBe(3);
    expect(state.floorState.ap).toBeGreaterThanOrEqual(21);
    expect(state.floorState.ap).toBeLessThanOrEqual(26);
  });

  test('keeps profession HP when balance snapshot has no player fields', () => {
    const state = createChapter1ExpeditionState(challenge(1), profile(), {
      globalConfig: {},
      chapterConfigs: {},
      unitConfigs: {},
    });
    expect(state.player.maxHp).toBe(320);
  });
```

保留原有「空装战士 320 HP / AP 8–13」用例（第三参缺省）。

- [ ] **Step 2: Run tests to verify new cases fail**

Run: `npx jest test/pve/Chapter1ExpeditionFactory.test.ts --no-cache`
Expected: FAIL（`balanceSnapshot` 仍为 `null` / HP 仍 320）

- [ ] **Step 3: Implement Chapter1 factory wiring**

在 `createPlayer` / `createChapter1ExpeditionState` 中：

```ts
function createPlayer(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): RunPlayer {
  const equipment = loadoutToRunEquipment(profile);
  const base = resolveProfessionBaseWithBalance(snapshot.config.professionId, balanceSnapshot, 1);
  const playerConfig = getPlayerBalanceConfig(balanceSnapshot, 1);
  const maxHp = base.maxHp + equipmentMaxHpBonus(equipment);
  return {
    hp: maxHp,
    maxHp,
    gold: playerConfig.initialGold ?? 0,
    anima: playerConfig.initialAnima ?? 0,
    animaProgress: playerConfig.initialAnima ?? 0,
    animaThreshold: 100,
    classId: classIdFromProfessionId(snapshot.config.professionId),
    equipment,
    bag: [],
    campMaxHpBuys: 0,
  };
}

// createChapter1ExpeditionState 第三参 balanceSnapshot
// rollAp(rng, resolveProfessionBaseWithBalance(...).apBase)
// return { ..., balanceSnapshot: getBalanceSnapshot(balanceSnapshot), persistentFloorMode: true, ... }
```

用 `getBalanceSnapshot(balanceSnapshot)` 规范化写入 state（空则空对象结构，勿再写死 `null`——若现有类型允许 `null`，也可写 `balanceSnapshot ?? null`，但后续战斗读路径需与 `getBalancedActionCost` 兼容；推荐写入 `getBalanceSnapshot(...)` 非 null 对象）。

- [ ] **Step 4: Run Chapter1 factory tests**

Run: `npx jest test/pve/Chapter1ExpeditionFactory.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts test/pve/Chapter1ExpeditionFactory.test.ts
git commit -m "feat(pve): apply GM player balance on chapter1 floor create"
```

---

### Task 3: Chapters 2–5 + tutorial factory same wiring

**Files:**
- Modify: `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/core/chapter3/Chapter3ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/core/chapter4/Chapter4ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/core/chapter5/Chapter5ExpeditionFactory.ts`
- Modify: `assets/scripts/pve/tutorial/TutorialFloorFactory.ts`

**Interfaces:**
- Consumes: Task 1 helper；各 factory 第三参 `balanceSnapshot?: PveBalanceSnapshot | null`
- Produces: 各 `createChapterXExpeditionState` / `createTutorialExpeditionState` 签名与 Chapter1 一致（tutorial 固定 `WARRIOR` + chapter `1`）

- [ ] **Step 1: Mirror Chapter1 createPlayer / rollAp / balanceSnapshot write in ch2–5**

对每个 factory：

1. `createXxxExpeditionState(..., balanceSnapshot?)`
2. `createPlayer` 用 `resolveProfessionBaseWithBalance(professionId, balanceSnapshot, chapterNumber)`（chapter 取 2/3/4/5）
3. `gold` / `anima` 来自 `getPlayerBalanceConfig`
4. `rollAp` 用 resolved `apBase`
5. `balanceSnapshot: getBalanceSnapshot(balanceSnapshot)`（或与 Chapter1 相同约定）

Tutorial：

```ts
export function createTutorialExpeditionState(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  balanceSnapshot?: PveBalanceSnapshot | null,
): ExpeditionState
```

教学玩家固定 `resolveProfessionBaseWithBalance('WARRIOR', balanceSnapshot, 1)`。

- [ ] **Step 2: Typecheck / existing factory callers still compile**

第三参可选，现有 `createChapterXExpeditionState(snapshot, profile)` 调用无需改。

Run: `npx jest test/pve/Chapter1ExpeditionFactory.test.ts test/pve/CurrentPveContract.test.ts --no-cache`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts \
  assets/scripts/pve/core/chapter3/Chapter3ExpeditionFactory.ts \
  assets/scripts/pve/core/chapter4/Chapter4ExpeditionFactory.ts \
  assets/scripts/pve/core/chapter5/Chapter5ExpeditionFactory.ts \
  assets/scripts/pve/tutorial/TutorialFloorFactory.ts
git commit -m "feat(pve): wire GM player balance through chapter and tutorial factories"
```

---

### Task 4: Combat attack + endTurn AP use resolved base

**Files:**
- Modify: `assets/scripts/pve/core/CombatSystem.ts`（`playerAttackPower`）
- Modify: `assets/scripts/pve/core/ExpeditionState.ts`（`endTurn` AP）
- Modify: `test/pve/ResolveProfessionBaseWithBalance.test.ts`（或新建 `test/pve/PlayerAttackPowerBalance.test.ts`）

**Interfaces:**
- Consumes: `resolveProfessionBaseWithBalance`, `professionIdFromClassId`
- Produces: `playerAttackPower(player, balanceSnapshot?, chapter?)` 在传入 snapshot 时用 GM/职业 resolved 基数

- [ ] **Step 1: Write failing attack-power test**

```ts
import { playerAttackPower } from '../../assets/scripts/pve/core/CombatSystem';
import { makeRunPlayer } from './helpers'; // 若项目无此 helper，用 CombatSystem.test 同款内联玩家

test('playerAttackPower uses GM baseAttack when snapshot provided', () => {
  const player = /* BERSERKER/WARRIOR 空装 RunPlayer */;
  const balance = {
    globalConfig: { player: { baseAttack: 100, baseAttackRange: 4 } },
    chapterConfigs: {},
    unitConfigs: {},
  };
  const withGm = playerAttackPower(player, balance, 1);
  expect(withGm.damage).toBe(100);
  expect(withGm.range).toBe(4);
  const without = playerAttackPower(player);
  expect(without.damage).toBe(13);
});
```

（空装战士攻击 13；无武器时 range 为 resolved `attackRange`。若现有隐式/CLASS_STATS 仍加 `attackBonus`，断言改为 `100 + stats.attackBonus`，与实现一致。）

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Update `playerAttackPower`**

把当前：

```ts
const profession = professionBaseStats(professionIdFromClassId(player.classId));
```

改为：

```ts
const profession = resolveProfessionBaseWithBalance(
  professionIdFromClassId(player.classId),
  _balanceSnapshot,
  _chapter,
);
```

参数名去掉前导 `_`（改为 `balanceSnapshot` / `chapter`）。其余武器叠加逻辑不变。

- [ ] **Step 4: Update `endTurn` persistent AP base**

在 `ExpeditionState.ts` 将：

```ts
const professionApBase = postExposureState.persistentFloorMode
  ? professionBaseStats(...).apBase
  : getBalancedApBase(...);
```

改为：

```ts
const professionApBase = postExposureState.persistentFloorMode
  ? resolveProfessionBaseWithBalance(
      professionIdFromClassId(postExposureState.player.classId),
      postExposureState.balanceSnapshot,
      postExposureState.chapter,
    ).apBase
  : getBalancedApBase(postExposureState.balanceSnapshot, postExposureState.chapter);
```

- [ ] **Step 5: Run related tests**

Run: `npx jest test/pve/ResolveProfessionBaseWithBalance.test.ts test/pve/DifficultyCurve.test.ts test/pve/CombatSystem.test.ts test/pve/EquipImplicit.test.ts --no-cache`
Expected: PASS（未传 snapshot 的用例不变）

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/core/CombatSystem.ts assets/scripts/pve/core/ExpeditionState.ts test/pve/*.test.ts
git commit -m "feat(pve): honor GM player attack and AP base in combat"
```

---

### Task 5: Runtime / FloorFlow / Controller pass snapshot

**Files:**
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`
- Modify: `assets/scripts/pve/core/PersistentFloorFlow.ts`
- Modify: `assets/scripts/pve/controllers/ExpeditionController.ts`
- Optional test: `test/pve/PersistentExpeditionRuntime.test.ts` 增一条带 balance 的 create 断言

**Interfaces:**
- Consumes: factory 第三参
- Produces:
  ```ts
  export interface PersistentFloorRuntimeOptions {
    tutorialCompleted?: boolean;
    balanceSnapshot?: PveBalanceSnapshot | null;
  }
  // PersistentFloorFlow bootstrap/restart/continueNextFloor options 含 balanceSnapshot
  ```

- [ ] **Step 1: Extend `PersistentFloorRuntimeOptions` and thread into factories**

```ts
export function createPersistentFloorRuntime(
  snapshot: FloorChallengeSnapshot,
  profile: PveProfile,
  options?: PersistentFloorRuntimeOptions,
  now = Date.now(),
): PersistentExpeditionRuntime {
  const balanceSnapshot = options?.balanceSnapshot ?? null;
  // chapter1:
  createTutorialExpeditionState(snapshot, profile, balanceSnapshot)
  createChapter1ExpeditionState(snapshot, profile, balanceSnapshot)
  // chapter2–5: 同样传入
}
```

`resumeOrRebuildPersistentRuntime` 的 v1 rebuild 分支：增加可选 `options?: PersistentFloorRuntimeOptions`，重建时传入 `balanceSnapshot`（罕见路径；有则用）。

- [ ] **Step 2: PersistentFloorFlow stores and passes snapshot**

```ts
private _balanceSnapshot: PveBalanceSnapshot | null = null;

async bootstrap(selectedFloor?: number, options?: {
  tutorialCompleted?: boolean;
  balanceSnapshot?: PveBalanceSnapshot | null;
}): Promise<PersistentFloorFlowState> {
  if (options && 'balanceSnapshot' in options) {
    this._balanceSnapshot = options.balanceSnapshot ?? null;
  }
  // createPersistentFloorRuntime(..., {
  //   tutorialCompleted: options?.tutorialCompleted,
  //   balanceSnapshot: this._balanceSnapshot,
  // })
  // resume 路径不 create → 不重灌
}

async restartCurrentFloor(options?: { tutorialCompleted?: boolean; balanceSnapshot?: ... }) {
  if (options && 'balanceSnapshot' in options) {
    this._balanceSnapshot = options.balanceSnapshot ?? null;
  }
  createPersistentFloorRuntime(..., { tutorialCompleted: ..., balanceSnapshot: this._balanceSnapshot });
}

async continueNextFloor() {
  createPersistentFloorRuntime(..., {
    tutorialCompleted: true,
    balanceSnapshot: this._balanceSnapshot,
  });
}
```

- [ ] **Step 3: ExpeditionController passes meta snapshot**

在 `_bootstrap`：`loadPveMeta` 后：

```ts
const flowState = await this._floorFlow.bootstrap(selectedFloor, {
  tutorialCompleted: this._meta?.tutorialCompleted === true,
  balanceSnapshot: metaRes.ok ? (metaRes.res.balanceSnapshot ?? null) : null,
});
```

`restartCurrentFloor` / 任何调用 `this._floorFlow.restartCurrentFloor` 处同样传入当前已知 snapshot（可在 bootstrap 时缓存到 `this._balanceSnapshot`，restart 再传入）。

删除或停止维护「只写不读」的孤立逻辑：开局后以 `this._state.balanceSnapshot` 为准；若保留字段，仅作 bootstrap 前缓存。

- [ ] **Step 4: Runtime smoke test**

在 `test/pve/PersistentExpeditionRuntime.test.ts` 增加：

```ts
test('createPersistentFloorRuntime bakes GM initialHp into expedition', () => {
  const balance = {
    globalConfig: { player: { initialHp: 9001 } },
    chapterConfigs: {},
    unitConfigs: {},
  };
  const runtime = createPersistentFloorRuntime(snapshot, profile(), {
    tutorialCompleted: true,
    balanceSnapshot: balance,
  }, 1);
  expect(runtime.battleState.expedition.player.maxHp).toBe(9001);
  expect(runtime.battleState.expedition.balanceSnapshot).toEqual(balance);
});
```

（`snapshot`/`profile` 复用该文件现有 helper；floor 选已开放层且 `tutorialCompleted: true` 避免教学层。）

- [ ] **Step 5: Run focused + broader pve tests**

Run:
```bash
npx jest test/pve/ResolveProfessionBaseWithBalance.test.ts test/pve/Chapter1ExpeditionFactory.test.ts test/pve/PersistentExpeditionRuntime.test.ts test/pve/TutorialFloorBoot.test.ts --no-cache
npm run test:pve
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/core/PersistentExpeditionRuntime.ts \
  assets/scripts/pve/core/PersistentFloorFlow.ts \
  assets/scripts/pve/controllers/ExpeditionController.ts \
  test/pve/PersistentExpeditionRuntime.test.ts
git commit -m "feat(pve): pass GM balance snapshot into persistent floor bootstrap"
```

---

### Task 6: Design docs sync

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md`
- Modify: `CALL_FLOW.md`

- [ ] **Step 1: Update PVE design.md**

在「云端数据 / `pve_balance_configs`」或永久楼层开局小节增加：

- 永久楼层新开/重开本层时，客户端将 `loadPveMeta.balanceSnapshot` 写入 `ExpeditionState.balanceSnapshot`。
- 玩家字段：有 GM 覆盖则替换对应职业基础（HP/攻击/射程/AP 基数/行动消耗/开局金与灵力）；装备加成仍叠加。
- 续玩不重套最新 GM；怪物/Boss/装备倍率本轮不接入。

- [ ] **Step 2: Update CALL_FLOW.md 远征进入链**

在现有 `loadPveMeta → PersistentFloorFlow.bootstrap` 处补：

```text
loadPveMeta（含 balanceSnapshot）
  → PersistentFloorFlow.bootstrap(..., { balanceSnapshot })
  → createPersistentFloorRuntime → ChapterFactory（灌入玩家覆盖）
```

- [ ] **Step 3: Commit**

```bash
git add specs/260608-pve-destiny-expedition/design.md CALL_FLOW.md
git commit -m "docs(pve): document GM player balance on persistent floor start"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| 仅玩家字段 | 1–4（不碰怪/装倍率） |
| GM 整项替换职业基础 + 装备叠加 | 1–2 |
| 仅新开/重开灌入 | 5（resume 不 create） |
| factory 写 snapshot | 2–3 |
| `playerAttackPower` / AP | 4 |
| Flow + Controller 传参 | 5 |
| design.md + CALL_FLOW | 6 |
| 单测 helper + 一章 factory | 1–2 |
| 空配置保持职业面板 | 1–2 |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-28-gm-player-balance-persistent-floor.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每个 Task 派一个新子代理，Task 间审查，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 连续执行，设检查点  

Which approach?
