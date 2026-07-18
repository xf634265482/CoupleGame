# 命痕 V3 改动与扩容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `docs/superpowers/specs/2026-07-18-minghen-v3-expansion-design.md` 调整 M08 III / M22 / M25–M38，新增 M39–M56，并通过最小化事件上下文扩展复用现有命痕结算链。

**Architecture:** 保持 `resolveMinghenEffects` 统一结算；扩展 `MinghenEventContext` / `MinghenEffectResult` / 一个 `TASK_INTERACT` hook；桥接层在事件时点填充邻格与关卡标签；`SandMinghenBridge` 泛化为额外移动地形 + 环境伤害；楼层掉落暂不接入。

**Tech Stack:** TypeScript、ts-jest（`npm run test:pve`）、现有 `assets/scripts/pve/core/minghen/*`。

## Global Constraints

- 未在 V3 出现的命痕（M01–M07、M09–M21、M23–M24）行为与文案不得改动。
- 禁止为单枚命痕引入每帧扫描、长行为历史、完整路径分析、独立能量槽、独立寻路。
- 次生伤害 `source: 'MINGHEN_SECONDARY'`，不得递归触发命痕。
- 「X% 灵气」=`spiritGain += X`（满槽 100）。
- M39–M56：`sourceFloor = 0`，不写入各层主题池。
- PVE `core/` 禁止 `import 'cc'`；随机数用 `core/rng.ts`。
- 玩法变更同步 `minghen-catalog.md` 与主设计命痕段落。
- 本轮不接关卡掉落/新关卡设计。

## File Map

| 文件 | 职责 |
|---|---|
| `MinghenEventContext.ts` | hooks、上下文、effect result 类型 |
| `MinghenSpatialQuery.ts`（新建） | 邻敌/邻墙/2 格范围纯查询 |
| `SandMinghenBridge.ts` → 泛化或旁挂 `TerrainMinghenBridge.ts` | 额外移动地形减免、环境伤害倍率 |
| `MinghenCatalog.ts` | 定义、文案、values、hooks、试炼 |
| `MinghenEffects.ts` | 全部效果结算 |
| `MinghenCombatBridge.ts` / runtime 调用点 | 填充新上下文字段并应用新 result 字段 |
| `MinghenTrial.ts` | 升格计数目标 |
| `MinghenDisplay.ts` | 若有硬编码旧名则对齐 |
| `test/pve/Minghen*.test.ts` | TDD 与回归 |
| `specs/.../minghen-catalog.md` | 玩法目录权威文案 |
| `specs/260608-.../design.md` | 命痕定位短对齐 |

---

### Task 1: 扩展事件类型与空结果默认值

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenEventContext.ts`
- Modify: `test/pve/MinghenEffects.test.ts`（或新建 `test/pve/MinghenEventContext.test.ts`）

**Interfaces:**
- Produces: `MINGHEN_HOOKS` 含 `'TASK_INTERACT'`
- Produces: `MinghenEventContext` 可选字段见 spec §3.2
- Produces: `MinghenEffectResult` 新字段见 spec §3.3；`emptyMinghenEffectResult()` 全 0/空默认
- Produces: `source` 联合增加 `'ENVIRONMENT'`（若尚未存在）

- [ ] **Step 1: 写失败测试 — 空结果包含新字段默认值**

```ts
import { emptyMinghenEffectResult, MINGHEN_HOOKS } from '../../assets/scripts/pve/core/minghen/MinghenEventContext';

test('effect result defaults include V3 mitigation fields', () => {
  const r = emptyMinghenEffectResult();
  expect(r.damageReductionRatio).toBe(0);
  expect(r.forcedDisplaceReduction).toBe(0);
  expect(r.transferDamageRatio).toBe(0);
  expect(r.transferMaxTargets).toBe(0);
  expect(r.consumeShieldRatioOfMaxHp).toBe(0);
  expect(r.shieldToDamageRatio).toBe(0);
  expect(r.refundConsumedShieldRatio).toBe(0);
  expect(r.overflowDamageReductionRatio).toBe(0);
});

test('hooks include TASK_INTERACT', () => {
  expect(MINGHEN_HOOKS).toContain('TASK_INTERACT');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenEffects.test.ts`

Expected: FAIL（缺字段 / 缺 hook）

- [ ] **Step 3: 实现类型与默认值**

在 `MinghenEventContext.ts`：

1. `MINGHEN_HOOKS` 追加 `'TASK_INTERACT'`
2. `source` 增加 `'ENVIRONMENT'`
3. 给 `MinghenEventContext` 增加 spec §3.2 可选字段（全部 `?:`）
4. 给 `MinghenEffectResult` 增加 spec §3.3 字段
5. `emptyMinghenEffectResult()` 返回这些字段为 `0` / `[]` 保持不变

`targetTier` 类型：`'NORMAL' | 'ELITE' | 'BOSS' | 'ANIMA'`（`ANIMA` 不触发斩首/清杂的 NORMAL/ELITE 分支）。

- [ ] **Step 4: 运行确认通过**

Run: `npm run test:pve -- --runInBand test/pve/MinghenEffects.test.ts`

Expected: 新断言 PASS；旧测试可能仍 PASS（本任务不改 effects）

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/minghen/MinghenEventContext.ts test/pve/MinghenEffects.test.ts
git commit -m "$(cat <<'EOF'
feat(pve): extend minghen event context for V3 hooks and mitigation fields

EOF
)"
```

---

### Task 2: 空间查询纯函数

**Files:**
- Create: `assets/scripts/pve/core/minghen/MinghenSpatialQuery.ts`
- Create: `test/pve/MinghenSpatialQuery.test.ts`

**Interfaces:**
- Produces:
```ts
export type GridPos = { x: number; y: number };
export function countAdjacentEntities(origin: GridPos, entities: readonly GridPos[]): number;
export function countEntitiesInChebyshevRange(origin: GridPos, entities: readonly GridPos[], range: number): number;
export function isAdjacentToAny(origin: GridPos, blockers: readonly GridPos[]): boolean;
```
- 邻格 = 四向或八向？**约定八向（Chebyshev=1）**，与现有碰撞/相邻传递一致时若代码库已有四向工具则复用同一口径；实现前先 grep `adjacent` / `manhattan` / `chebyshev`，与 `MinghenEffects` 里溢伤邻格口径对齐。

- [ ] **Step 1: 写失败测试**

```ts
import { countAdjacentEntities, countEntitiesInChebyshevRange, isAdjacentToAny } from '../../assets/scripts/pve/core/minghen/MinghenSpatialQuery';

test('counts orthogonal and diagonal neighbors once', () => {
  const origin = { x: 2, y: 2 };
  const foes = [{ x: 2, y: 3 }, { x: 3, y: 3 }, { x: 5, y: 5 }];
  expect(countAdjacentEntities(origin, foes)).toBe(2);
  expect(countEntitiesInChebyshevRange(origin, foes, 2)).toBe(2);
  expect(isAdjacentToAny(origin, [{ x: 1, y: 2 }])).toBe(true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenSpatialQuery.test.ts`

Expected: FAIL module not found

- [ ] **Step 3: 实现纯函数（无棋盘扫描循环超出传入列表）**

只遍历传入的 `entities`/`blockers` 数组，禁止读取整层 state。

- [ ] **Step 4: 测试通过后 Commit**

```bash
git add assets/scripts/pve/core/minghen/MinghenSpatialQuery.ts test/pve/MinghenSpatialQuery.test.ts
git commit -m "$(cat <<'EOF'
feat(pve): add minghen spatial query helpers for adjacent and range-2 checks

EOF
)"
```

---

### Task 3: 泛化地形/环境伤害桥接

**Files:**
- Modify: `assets/scripts/pve/core/minghen/SandMinghenBridge.ts`（保留导出别名或就地泛化）
- Modify: `test/pve/MinghenSandEffects.test.ts`（扩展断言，文件名可保留）

**Interfaces:**
- Produces（名称可微调，但语义固定）:
```ts
export function extraMoveCostTerrainPenaltyReduction(loadout, terrainTagged: boolean): number;
export function shouldWaiveExtraMoveCostTerrainStep(loadout, memory, turn): boolean;
export function markExtraMoveCostTerrainStepWaived(memory, turn): void;
export function environmentDamageMultiplier(loadout): number; // M26: 1 / 0.7 / 0.5
export function markEnvironmentDamageHit(memory, loadout): void; // stores M26_READY at L3
```
- 旧 `sandPit*` / `sandstorm*` 函数改为薄包装调用上述 API，避免现有 runtime 调用点大爆炸。

- [ ] **Step 1: 扩展测试 — 沙坑仍工作，且 `onExtraMoveCostTerrain` 语义可测**

保留现有沙坑/沙暴用例；新增：

```ts
test('M25 waiver is once per turn for any extra-move terrain tag', () => {
  const memory = createMinghenTriggerMemory();
  const loadout = [{ id: 'M25', level: 2 as const }];
  expect(shouldWaiveExtraMoveCostTerrainStep(loadout, memory, 1)).toBe(true);
  markExtraMoveCostTerrainStepWaived(memory, 1);
  expect(shouldWaiveExtraMoveCostTerrainStep(loadout, memory, 1)).toBe(false);
});
```

- [ ] **Step 2: 实现泛化 API + 旧名别名**

- [ ] **Step 3: 跑 `MinghenSandEffects.test.ts` 全绿后 Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(pve): generalize sand minghen bridge to extra-move terrain and environment damage

EOF
)"
```

---

### Task 4: Catalog — 改名/改 values（M08、M22、M25–M38）+ 扩容骨架（M39–M56）

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenCatalog.ts`
- Modify: `test/pve/MinghenCatalog.test.ts`
- Modify: `assets/scripts/pve/core/minghen/MinghenTrial.ts`（试炼目标字符串/计数键随改名更新）

**Interfaces:**
- Produces: `MINGHEN_CATALOG.length === 56`
- Produces: 名称：`脱围/轻足/抗灾/抢位/整备/凝甲/止损/疾退` 等
- Produces: M39–M56 `sourceFloor === 0`
- Produces: M01–M38 中未改动条目的 `sourceFloor` 仍为 1–14

- [ ] **Step 1: 重写 Catalog 测试**

```ts
test('contains 56 unique definitions; M39-M56 unassigned sourceFloor', () => {
  expect(MINGHEN_CATALOG).toHaveLength(56);
  expect(new Set(MINGHEN_CATALOG.map(x => x.id)).size).toBe(56);
  for (const entry of MINGHEN_CATALOG) {
    expect(entry.effects[1].length).toBeGreaterThan(8);
    expect(entry.effects[2].length).toBeGreaterThan(8);
    expect(entry.effects[3].length).toBeGreaterThan(8);
    if (Number(entry.id.slice(1)) >= 39) {
      expect(entry.sourceFloor).toBe(0);
    } else {
      expect(entry.sourceFloor).toBeGreaterThanOrEqual(1);
      expect(entry.sourceFloor).toBeLessThanOrEqual(14);
    }
  }
  expect(getMinghenDefinition('M22').name).toBe('脱围');
  expect(getMinghenDefinition('M25').name).toBe('轻足');
  expect(getMinghenDefinition('M26').name).toBe('抗灾');
  expect(getMinghenDefinition('M31').name).toBe('抢位');
  expect(getMinghenDefinition('M32').name).toBe('整备');
  expect(getMinghenDefinition('M35').name).toBe('凝甲');
  expect(getMinghenDefinition('M37').name).toBe('止损');
  expect(getMinghenDefinition('M38').name).toBe('疾退');
  expect(getMinghenDefinition('M08').effects[3]).toContain('护盾');
  expect(getMinghenDefinition('M08').effects[3]).not.toContain('复制');
});
```

删除/替换断言 `追击`、`生命低于40%`（M37 旧文案）、旧 M27 组合增伤等。

- [ ] **Step 2: 运行确认失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenCatalog.test.ts`

Expected: FAIL length 38 / 旧名

- [ ] **Step 3: 更新 `MINGHEN_EFFECTS` 文案、`d(...)` 条目、hooks、values**

数值数组约定（实现时严格按此索引，effects 代码用 `value(i)`）：

| ID | values I / II / III |
|---|---|
| M08 | `[.25]` / `[.25,1]` / `[.25,1,.06]` — III 第三项为护盾比例 |
| M22 | `[2,1]` 邻敌阈值+减费 / `[2,1,.05]` / `[2,1,.05,.15]` |
| M25 | `[1]` / `[1,1]` / `[1,1,.15]` |
| M26 | `[.3]` / `[.5]` / `[.5,.2]` |
| M27 | `[1]` 额外层 / `[1,.2]` / `[1,.2,1]` 持续+1 |
| M28 | `[.3]` / `[.3,1]` / `[.5,1]` |
| M29 | `[1]` / `[1,1]` / `[1,1,10]` 灵气 |
| M30 | `[1]` 层 / `[2]` / `[2,.15]` |
| M31 | `[.05]` / `[.05,.15]` / `[.05,.15,10]` |
| M32 | `[.04]` / `[.06]` / `[.06,1]` |
| M33 | `[5]` / `[8]` / `[8,1]` |
| M34 | `[.05,1.5]` / `[.08,1.8]` / `[.08,1.8,.5]` |
| M35 | `[.08,1]` / `[.08,1,.2]` / `[.08,1,.2,10]` |
| M36 | `[.4]` / `[.6]` / `[.6,.15]` |
| M37 | `[.2,.3]` 阈值+减免 / `[.2,.5]` / `[.2,.5,1]` |
| M38 | `[1]` / `[1,1]` 可跨回合 / `[1,1,.05]` |

M39–M56：按 V3 数值填 `values` + 中文 `effects` + hooks 列表 + `trial` 可测短句；`category/complexity` 合理即可。

- [ ] **Step 4: 更新 `MinghenTrial.ts` 中 M22/M25–M38 旧键名与目标；为 M39–M56 加占位 trial 目标对象**

- [ ] **Step 5: Catalog 测试通过后 Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pve): expand minghen catalog to M56 with V3 renames and values

EOF
)"
```

---

### Task 5: Effects — 调整组 M08 / M22 / M25–M38

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- Modify: `test/pve/MinghenEffects.test.ts`
- Create: `test/pve/MinghenV3AdjustedEffects.test.ts`（推荐：把 V3 调整断言集中，避免旧文件继续断言已废机制）

**Interfaces:**
- Consumes: Task 1 上下文字段、Task 3 桥接状态键（如 `M26_READY`）
- Produces: 各 ID 按 spec §4 行为；memory states 键名建议：
  - `M22_ESCAPE_READY` / `M22_DISCOUNT` / `M22_ATTACK`
  - `M30_AFTERMATH:<STATUS>`
  - `M32_SHIELD_PENDING` / `M32_MOVE`
  - `M34_SPIKE_ACTIVE` / `M34_CONSUMED:<n>`
  - `M35_*` / `M37_MOVE` / `M38_MOVE`（可跨回合）

- [ ] **Step 1: 删除/改写旧失败断言**

`MinghenEffects.test.ts` 中以下用例必须改写（旧语义已废）：

- `new status extenders...`（旧 M27/M28/M29 叠增伤）
- `M32 turns a skipped attack...`
- `M35 reacts to shield break...`
- `M38 chains kill into movement and follow-up kill refund`
- `global AP refund guard...` 中依赖旧 M22 行云的部分改为新脱围或不组合旧行为

- [ ] **Step 2: 为调整组写新失败测试（示例必须覆盖）**

```ts
test('M08 III grants shield instead of terrain copy', () => {
  const memory = createMinghenTriggerMemory();
  const loadout = [{ id: 'M08', level: 3 as const }];
  resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'AFTER_MOVE', enteredDangerousTerrain: true }), memory);
  const hit = resolveMinghenEffects(loadout, ctx({ eventId: 'h', hook: 'BEFORE_HIT', maxHp: 200 }), memory);
  expect(hit.damageMultiplierBonus).toBe(0.25);
  // AFTER_HIT 或 BEFORE_HIT 后应用护盾：按实现挂在 AFTER_HIT
});

test('M22 breakout discounts first move when surrounded', () => {
  const memory = createMinghenTriggerMemory();
  const loadout = [{ id: 'M22', level: 1 as const }];
  resolveMinghenEffects(loadout, ctx({ eventId: 's', hook: 'TURN_START', adjacentEnemyCount: 2 }), memory);
  expect(resolveMinghenEffects(loadout, ctx({ eventId: 'm', hook: 'BEFORE_MOVE' }), memory).moveCostReduction).toBe(1);
});

test('M37 stop-loss only reduces overflow above 20% maxHp', () => {
  const memory = createMinghenTriggerMemory();
  const loadout = [{ id: 'M37', level: 1 as const }];
  const r = resolveMinghenEffects(loadout, ctx({
    eventId: 'd', hook: 'DAMAGED', maxHp: 100, actualDamage: 40, source: 'ENEMY',
  }), memory);
  expect(r.overflowDamageReductionRatio).toBe(0.3);
  // bridge 侧最终伤害 = 20 + (40-20)*(1-0.3) = 34；本单测只断言 effect 字段
});

test('M34 spends shield into secondary damage on heavy attack', () => {
  const memory = createMinghenTriggerMemory();
  const loadout = [{ id: 'M34', level: 1 as const }];
  const r = resolveMinghenEffects(loadout, ctx({
    eventId: 'a', hook: 'BEFORE_ATTACK', apCost: 3, shield: 20, maxHp: 100,
  }), memory);
  expect(r.consumeShieldRatioOfMaxHp).toBe(0.05);
  expect(r.shieldToDamageRatio).toBe(1.5);
});
```

对 M25–M36、M38 至少各写 1 条关键路径（I 或 III）。

- [ ] **Step 3: 运行确认失败**

Run: `npm run test:pve -- --runInBand test/pve/MinghenV3AdjustedEffects.test.ts`

Expected: FAIL 旧 case / 未实现

- [ ] **Step 4: 实现 `MinghenEffects` switch 分支**

实现要点：

- M08 III：充能命中后 `shield += maxHp * 0.06`（取消地形复制 flags）
- M22：`TURN_START` 邻敌≥2 → store；`BEFORE_MOVE` consume → `moveCostReduction=1`；`AFTER_MOVE` 若 `adjacentEnemyCount===0` → 护盾/store 攻击加成
- M27：在 `STATUS_APPLIED` 检测「仅一种异常且再次同异常」；满层穿透在 `BEFORE_HIT`
- M28：在施加灼烧/冰寒时检测对立异常，设 flags + `secondaryDamageRatio`
- M29：依赖 `bleedTriggeredByMove` + 双异常；`STATUS_KILL`/`KILL` 给灵气
- M30：`KILL`+异常 → store aftermath；下次 `BEFORE_HIT`/`AFTER_HIT` 对不同 `targetId` apply
- M33：`once(turnKeys)` 限制每回合首次击杀灵气
- 全局：`result.apDelta = Math.max(-1, ...)` 与 `moveCostReduction = Math.min(1, ...)` 保持；若单次需要 `moveCostReduction` 与别处叠加，仍封顶 1

- [ ] **Step 5: 测试全绿后 Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pve): implement V3 adjusted minghen effects for M08 and M22-M38

EOF
)"
```

---

### Task 6: Effects — 新增组 M39–M56

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- Create: `test/pve/MinghenV3NewEffects.test.ts`

**Interfaces:**
- 每枚至少覆盖 I 主效果 + III 关键分支（可用表驱动）

- [ ] **Step 1: 写表驱动失败测试骨架**

```ts
const cases: Array<{
  id: string; level: 1 | 2 | 3;
  setup?: (m: MinghenTriggerMemory) => void;
  contexts: Partial<MinghenEventContext>[];
  expect: (r: MinghenEffectResult, memory: MinghenTriggerMemory) => void;
}> = [
  {
    id: 'M39', level: 1,
    contexts: [{ hook: 'BEFORE_HIT', targetAdjacentEnemyCount: 0 }],
    expect: (r) => expect(r.damageMultiplierBonus).toBeCloseTo(0.18),
  },
  {
    id: 'M41', level: 3,
    contexts: [{ hook: 'AFTER_HIT', targetAdjacentEnemyCount: 2, actualDamage: 50 }],
    expect: (r) => {
      expect(r.transferDamageRatio).toBeCloseTo(0.3);
      expect(r.transferMaxTargets).toBe(2);
    },
  },
  {
    id: 'M45', level: 1,
    contexts: [{ hook: 'BEFORE_MOVE', turn: 1 }],
    expect: (r) => expect(r.moveCostReduction).toBe(1),
  },
  {
    id: 'M54', level: 1,
    contexts: [{ hook: 'TURN_END', enemiesInRange2: 0, maxHp: 100 }],
    expect: (r) => expect(r.heal).toBe(10),
  },
  // ... 补齐 M40,M42-M53,M55,M56 至少各 1 条
];
```

- [ ] **Step 2: 实现对应 switch cases**

注意：

- M46/M56：`DAMAGED` 时设 `damageReductionRatio`；每回合 `once(turnKeys)`
- M48：需要 `playerStatusDuration`；输出 flag 或直接在 result 中表达持续 −1（若 result 无字段，用 `flags: ['SHORTEN_PLAYER_STATUS']` 并由 bridge 执行）
- M52：`forcedDisplaceReduction = 1`；碰撞用 `damageReductionRatio` 或专用处理；距离最终 0 → 护盾
- M55 III：用现有 `activeMoveStepsThisTurn >= 4`
- M47：memory 记录本回合是否已完成低费攻击

- [ ] **Step 3: 跑新测试 + 调整组测试全绿**

Run: `npm run test:pve -- --runInBand test/pve/MinghenV3NewEffects.test.ts test/pve/MinghenV3AdjustedEffects.test.ts test/pve/MinghenEffects.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pve): implement minghen M39-M56 effect resolution

EOF
)"
```

---

### Task 7: Combat / Runtime 桥接填充与应用

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenCombatBridge.ts`
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`（及现有调用 sand bridge / minghen 的位点；先用导航/Grep 命中 `resolveMinghenEffects`、`sandPit`、`sandstorm`）
- Test: `test/pve/MinghenCombatBridge.test.ts`（若不存在则创建）

**Interfaces:**
- Produces: attack/move/damage 上下文填充：
  - `adjacentEnemyCount` / `targetAdjacentEnemyCount` / `enemiesInRange2`
  - `adjacentToBlocking` / `targetAdjacentToBlocking`
  - `onExtraMoveCostTerrain` / `attackerOnSandPit`（沙坑继续为 true 子集）
  - `environmentDamage` + `source:'ENVIRONMENT'`（沙暴路径改标或双标兼容）
  - `targetHasArmor` / `targetTier`
  - `inTaskObjectiveZone` / `isTaskInteract` / `escort*` / `inAttackWarningZone`：本轮从 runtime 可选字段读取，缺省 `false`（单测可直接喂 context；运行时先留 hook 点）
- Produces: 应用 `overflowDamageReductionRatio`、`damageReductionRatio`、`forcedDisplaceReduction`、护棘消耗护盾、密阵传递（次生 `MINGHEN_SECONDARY`）

- [ ] **Step 1: 写桥接测试**

```ts
test('attack context marks isolated target when no adjacent foes', () => {
  // 构造最小 expedition：player (2,2), target (3,2), no other monsters adjacent to target
  // expect attackContext(...).targetAdjacentEnemyCount === 0
});

test('overflow mitigation reduces only damage above 20% maxHp', () => {
  // 模拟 applyDamagedWithMinghen(maxHp=100, raw=40, M37 L1) => 34
});
```

- [ ] **Step 2: 实现填充与应用**

护棘：在 `BEFORE_ATTACK`/`BEFORE_HIT` 读取 result 消耗字段，从 `resources.shield` 扣除，计算次生伤害并在命中后结算；击杀时按 `refundConsumedShieldRatio` 返还。

密阵：在 `AFTER_HIT` 用 `transfer*` 选相邻敌人造成次生伤害。

止损：在玩家受伤结算点，若有 `overflowDamageReductionRatio`，按 spec §5.1 公式改写实际伤害。

- [ ] **Step 3: 跑桥接 + 原战斗相关冒烟**

Run: `npm run test:pve -- --runInBand test/pve/MinghenCombatBridge.test.ts test/pve/MinghenEffects.test.ts test/pve/MinghenSandEffects.test.ts`

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(pve): wire minghen V3 context filling and mitigation application

EOF
)"
```

---

### Task 8: Display / Trial / 文档同步

**Files:**
- Modify: `assets/scripts/pve/core/minghen/MinghenDisplay.ts`（仅当存在旧名硬编码）
- Modify: `test/pve/MinghenDisplay.test.ts` / `MinghenTrial.test.ts`
- Modify: `specs/260712-pve-persistent-floor-progression/minghen-catalog.md`
- Modify: `specs/260608-pve-destiny-expedition/design.md`（§7 命痕：补工具箱定位 + 指向 catalog V3 / M56）

- [ ] **Step 1: 更新 Display/Trial 测试中的旧名与 38 枚假设**

- [ ] **Step 2: 同步 `minghen-catalog.md`**

必改章节：

1. 全局事件定义：补「额外移动消耗地形」「环境伤害」「任务目标区域」「任务交互」
2. M08 III、M22、M25–M38 全文替换为 V3
3. 新增 §「第三批扩容 M39–M56」完整条目（I/II/III + 试炼短句）
4. 复杂度矩阵/组合校验中凡引用「行云/沙行/抗暴/借势/断拍/裂盾/破釜/追击」处改为新名或新组合说明
5. **不要**把 M39–M56 写进第一章/二章楼层主题池表

- [ ] **Step 3: 主设计 §7 增加 2–4 句：战术工具箱定位、目录见 minghen-catalog、本轮扩至 M56、楼层适配另文**

- [ ] **Step 4: 跑相关测试**

Run: `npm run test:pve -- --runInBand test/pve/MinghenCatalog.test.ts test/pve/MinghenDisplay.test.ts test/pve/MinghenTrial.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs(pve): sync minghen catalog and design for V3 expansion to M56

EOF
)"
```

---

### Task 9: 全量回归与禁令检查

**Files:**
- 无新功能；修复 Task 1–8 遗留红测

- [ ] **Step 1: 跑 PVE 命痕相关全套**

Run: `npm run test:pve -- --runInBand test/pve/Minghen`

Expected: 全部 PASS

- [ ] **Step 2: 人工检查**

- Grep `MinghenEffects.ts` / 新 bridge：确认无 `for` 遍历整层每帧路径；邻格查询仅在事件函数内
- 确认 M01 等未改命痕测试仍在且通过
- 确认章节主题池文件未被改成塞入 M39–M56（除非仅注释）

- [ ] **Step 3: 若有修复，单独 Commit**

```bash
git commit -m "$(cat <<'EOF'
fix(pve): stabilize minghen V3 regression suite

EOF
)"
```

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---|---|
| 事件/上下文/result 扩展 | 1 |
| 空间局部查询 | 2 |
| 额外移动地形 + 环境伤害桥接 | 3 |
| Catalog M08/M22/M25–M56 | 4 |
| Effects 调整组 | 5 |
| Effects M39–M56 | 6 |
| Runtime 填充与减伤/护棘/密阵应用 | 7 |
| 文档 + Display/Trial | 8 |
| 回归与禁令 | 9 |
| 不接楼层掉落 | 全局约束（无任务故意接入） |

## Placeholder Scan

计划中无 TBD；M48 若 result 无持续字段则用 `SHORTEN_PLAYER_STATUS` flag（已写明）。邻格四向/八向在 Task 2 要求与现有溢伤口径对齐后再锁定。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-18-minghen-v3-expansion.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每任务派生子代理，任务间复审，迭代快  
2. **Inline Execution** — 本会话按 executing-plans 批量执行并设检查点  

Which approach?
