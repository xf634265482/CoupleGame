# 鞋子类型分化与品质阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 鞋子按轻/战/铁三岔 + 品质阶段表分化；主数值回归最大生命；废止旧档位阈值。

**Architecture:** 在 `EquipmentSystem` 增加 `shoes_light|war|iron` implicit 与 `resolveShoesStageEffects(implicit, quality)`；`MovementSystem` / `MonsterAI` / 详情 UI 改读阶段表；模板 `baseStat` 改为生命区间。

**Tech Stack:** TypeScript（PVE core，禁 `import 'cc'`）+ Jest（`test/pve`）。

## Global Constraints

- 设计权威：`docs/superpowers/specs/2026-08-04-shoes-type-quality-design.md`
- 玩法改动后同步 `specs/260608-pve-destiny-expedition/design.md` 与 `equipment-catalog.md`
- PVE `core/` 零框架依赖；随机走 `rng`
- 17 个中文鞋名保留；不新增/删除条目
- 白/绿无分支效果；蓝起身份；紫/橙铁靴才有首步 +1 AP
- 废止 `SHOES_*_THRESHOLD` 与 `shoesStealthReduction(baseStat)` 档位语义

## File Map

| File | Role |
|---|---|
| `assets/scripts/pve/core/EquipmentSystem.ts` | implicit 常量、鞋池生命区间+类型、`resolveShoesStageEffects` |
| `assets/scripts/pve/core/MovementSystem.ts` | 移速/首步免费/揭示/铁靴首步代价/地形减伤 |
| `assets/scripts/pve/core/MonsterAI.ts` | 仇恨缩减改读阶段表 |
| `assets/scripts/pve/core/equipment/EquipmentProgression.ts` | UI「档位」→「生命」 |
| `assets/scripts/pve/views/pveEquipDetail.ts` / `CampView.ts` | 详情与营地文案 |
| `test/pve/ShoesStageEffects.test.ts` | 阶段表与战斗钩子单测 |
| `specs/.../design.md` + `equipment-catalog.md` | 文档同步 |

---

### Task 1: 阶段表 API + 鞋池改写

**Files:**
- Modify: `assets/scripts/pve/core/EquipmentSystem.ts`
- Create: `test/pve/ShoesStageEffects.test.ts`

**Produces:**
- `IMPLICIT_SHOES_LIGHT = 'shoes_light'`
- `IMPLICIT_SHOES_WAR = 'shoes_war'`
- `IMPLICIT_SHOES_IRON = 'shoes_iron'`
- `resolveShoesStageEffects(implicit, quality) → ShoesStageEffects`
- `resolveShoesStageEffectsFromItem(item) → ShoesStageEffects`

- [ ] **Step 1: 写失败单测**（阶段表矩阵）

```ts
import {
  IMPLICIT_SHOES_LIGHT, IMPLICIT_SHOES_WAR, IMPLICIT_SHOES_IRON,
  resolveShoesStageEffects,
} from '../../assets/scripts/pve/core/EquipmentSystem';

describe('resolveShoesStageEffects', () => {
  it('COMMON/FINE: no branch effects for all types', () => {
    for (const q of ['COMMON', 'FINE'] as const) {
      for (const t of [IMPLICIT_SHOES_LIGHT, IMPLICIT_SHOES_WAR, IMPLICIT_SHOES_IRON]) {
        const e = resolveShoesStageEffects(t, q);
        expect(e.moveCostReduction).toBe(0);
        expect(e.fogBonus).toBe(0);
        expect(e.firstMoveFree).toBe(false);
        expect(e.stealthReduction).toBe(0);
        expect(e.terrainDamageReduction).toBe(0);
        expect(e.firstMoveApPenalty).toBe(0);
      }
    }
  });

  it('light RARE/EPIC/LEGENDARY ladder', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'RARE')).toMatchObject({
      moveCostReduction: 1, fogBonus: 1, stealthReduction: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'EPIC').stealthReduction).toBe(2);
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_LIGHT, 'LEGENDARY').stealthReduction).toBe(3);
  });

  it('war RARE first free; EPIC adds move reduction', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_WAR, 'RARE')).toMatchObject({
      firstMoveFree: true, moveCostReduction: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_WAR, 'EPIC')).toMatchObject({
      firstMoveFree: true, moveCostReduction: 1,
    });
  });

  it('iron RARE terrain; EPIC+ first-move penalty', () => {
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'RARE')).toMatchObject({
      terrainDamageReduction: 1, firstMoveApPenalty: 0,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'EPIC')).toMatchObject({
      terrainDamageReduction: 1, firstMoveApPenalty: 1,
    });
    expect(resolveShoesStageEffects(IMPLICIT_SHOES_IRON, 'LEGENDARY').terrainDamageReduction).toBe(2);
  });
});
```

- [ ] **Step 2: Run 确认失败**

Run: `npx jest test/pve/ShoesStageEffects.test.ts -v`  
Expected: FAIL（`resolveShoesStageEffects` 未定义）

- [ ] **Step 3: 实现常量、类型、阶段表；改写 SHOES 池**

在 `EquipmentSystem.ts`：

```ts
export const IMPLICIT_SHOES_LIGHT = 'shoes_light';
export const IMPLICIT_SHOES_WAR = 'shoes_war';
export const IMPLICIT_SHOES_IRON = 'shoes_iron';

export interface ShoesStageEffects {
  type: typeof IMPLICIT_SHOES_LIGHT | typeof IMPLICIT_SHOES_WAR | typeof IMPLICIT_SHOES_IRON | null;
  moveCostReduction: number;
  fogBonus: number;
  firstMoveFree: boolean;
  stealthReduction: number;
  terrainDamageReduction: number;
  firstMoveApPenalty: number;
}

const EMPTY_SHOES: ShoesStageEffects = {
  type: null, moveCostReduction: 0, fogBonus: 0, firstMoveFree: false,
  stealthReduction: 0, terrainDamageReduction: 0, firstMoveApPenalty: 0,
};

function qualityAtLeast(q: EquipQuality, min: EquipQuality): boolean {
  const order = ['COMMON', 'FINE', 'RARE', 'EPIC', 'LEGENDARY'] as const;
  return order.indexOf(q) >= order.indexOf(min);
}

export function resolveShoesStageEffects(
  implicit: string | undefined,
  quality: EquipQuality,
): ShoesStageEffects {
  if (implicit === IMPLICIT_SHOES_LIGHT) {
    if (!qualityAtLeast(quality, 'RARE')) return { ...EMPTY_SHOES, type: IMPLICIT_SHOES_LIGHT };
    return {
      type: IMPLICIT_SHOES_LIGHT,
      moveCostReduction: 1,
      fogBonus: 1,
      firstMoveFree: false,
      stealthReduction: qualityAtLeast(quality, 'LEGENDARY') ? 3 : qualityAtLeast(quality, 'EPIC') ? 2 : 0,
      terrainDamageReduction: 0,
      firstMoveApPenalty: 0,
    };
  }
  if (implicit === IMPLICIT_SHOES_WAR) {
    if (!qualityAtLeast(quality, 'RARE')) return { ...EMPTY_SHOES, type: IMPLICIT_SHOES_WAR };
    return {
      type: IMPLICIT_SHOES_WAR,
      moveCostReduction: qualityAtLeast(quality, 'EPIC') ? 1 : 0,
      fogBonus: 0,
      firstMoveFree: true,
      stealthReduction: 0,
      terrainDamageReduction: 0,
      firstMoveApPenalty: 0,
    };
  }
  if (implicit === IMPLICIT_SHOES_IRON) {
    if (!qualityAtLeast(quality, 'RARE')) return { ...EMPTY_SHOES, type: IMPLICIT_SHOES_IRON };
    return {
      type: IMPLICIT_SHOES_IRON,
      moveCostReduction: 0,
      fogBonus: 0,
      firstMoveFree: false,
      stealthReduction: 0,
      terrainDamageReduction: qualityAtLeast(quality, 'LEGENDARY') ? 2 : 1,
      firstMoveApPenalty: qualityAtLeast(quality, 'EPIC') ? 1 : 0,
    };
  }
  return { ...EMPTY_SHOES };
}

export function resolveShoesStageEffectsFromItem(
  item: { implicit?: string; quality: EquipQuality } | undefined,
): ShoesStageEffects {
  if (!item) return { ...EMPTY_SHOES };
  return resolveShoesStageEffects(item.implicit, item.quality);
}
```

SHOES 池映射与生命区间（按 design §5–§6）：

| 名 | implicit | baseStatMin–Max |
|---|---|---|
| 布靴 | light | 10–14 |
| 皮靴 | war | 12–16 |
| 沙地靴 | iron | 15–20 |
| 旅行皮靴 | light | 20–28 |
| 轻便皮靴 | light | 20–28 |
| 铁制战靴 | war | 24–32 |
| 猎手软靴 | light | 32–42 |
| 精制战靴 | war | 38–48 |
| 精钢铁靴 | iron | 48–58 |
| 英雄战靴 | war | 62–78 |
| 游侠软靴 | light | 52–68 |
| 隐足战靴 | war | 62–78 |
| 猎风铁靴 | iron | 78–94 |
| 疾行套靴 | light | 52–68 |
| 疾风之靴 | war | 95–115 |
| 飞燕步履 | light | 80–100 |
| 影踪战靴 | light | 80–100 |

删除 `SHOES_*_THRESHOLD` 与 `shoesStealthReduction`；若外部仍引用，改为 re-export 兼容层**禁止**——直接改调用方（Task 2）。

- [ ] **Step 4: Run 单测通过**

Run: `npx jest test/pve/ShoesStageEffects.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add assets/scripts/pve/core/EquipmentSystem.ts test/pve/ShoesStageEffects.test.ts
git commit -m "feat(pve): shoes type implicits and quality stage table"
```

---

### Task 2: 战斗接入 MovementSystem + MonsterAI

**Files:**
- Modify: `assets/scripts/pve/core/MovementSystem.ts`
- Modify: `assets/scripts/pve/core/MonsterAI.ts`
- Modify: `test/pve/ShoesStageEffects.test.ts`（补移动/仇恨用例，可轻量 mock 状态）

**Consumes:** `resolveShoesStageEffectsFromItem`, legendary helpers  
**Produces:** 阶段表驱动的移动与仇恨

- [ ] **Step 1: MovementSystem 改读阶段表**

替换鞋子相关片段：

```ts
import { resolveShoesStageEffectsFromItem } from './EquipmentSystem';
// 去掉 SHOES_FIRST_MOVE_THRESHOLD / SHOES_REVEAL_BONUS_THRESHOLD

const shoesFx = resolveShoesStageEffectsFromItem(shoes);
const isFirstMoveOfTurn = (floor.playerStepsThisTurn ?? 0) === 0;
const firstMoveFree = (shoesFx.firstMoveFree || legGaleBootsFirstMoveFree(state.player.equipment))
  && isFirstMoveOfTurn;
const shoesReduction = Math.max(fixedShoesReduction, shoesFx.moveCostReduction);
const ironFirstPenalty = isFirstMoveOfTurn && !firstMoveFree ? shoesFx.firstMoveApPenalty : 0;
const cost = opts?.freeMove
  ? 0
  : firstMoveFree
    ? 0
    : Math.max(0, baseCost + slowPenalty + sandPitPenalty + platePenalty + ironFirstPenalty
        - shoesReduction - shadowBootsReduction);

const revealRadius = FOG_REVEAL_RADIUS + shoesFx.fogBonus + fixedHelmetFogBonus(...);

// 地形伤：SHATTERED_ICE / LAVA_TILE 扣血前减去 shoesFx.terrainDamageReduction（下限 0）
const terrainReduce = shoesFx.terrainDamageReduction;
const shatteredDmg = Math.max(0, FROST_GIANT_SHATTERED_ICE_DAMAGE - terrainReduce);
const lavaDmg = Math.max(0, CHAPTER4_LAVA_TILE_DAMAGE - terrainReduce);
```

- [ ] **Step 2: MonsterAI 改读阶段表**

```ts
import { resolveShoesStageEffectsFromItem } from './EquipmentSystem';
const stealthReduction = resolveShoesStageEffectsFromItem(state.player.equipment.SHOES).stealthReduction
  + /* existing ROGUE + legendary swallow if separate */;
```

确认 `leg_swallow_steps` 现有加成仍叠加（读 LegendarySystem，勿吞掉）。

- [ ] **Step 3: 补测或跑现有 Legendary / 移动相关测试**

Run: `npx jest test/pve/ShoesStageEffects.test.ts test/pve/Legendary.test.ts -v`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add assets/scripts/pve/core/MovementSystem.ts assets/scripts/pve/core/MonsterAI.ts test/pve/
git commit -m "feat(pve): wire shoe stage effects into move and aggro"
```

---

### Task 3: UI 文案 + 详情

**Files:**
- Modify: `assets/scripts/pve/core/equipment/EquipmentProgression.ts`（`primaryStatLabel` / `equipPrimaryStatDescription`）
- Modify: `assets/scripts/pve/views/pveEquipDetail.ts`
- Modify: `assets/scripts/pve/views/CampView.ts`（「档位」标签）

- [ ] **Step 1: Progression 标签**

```ts
case 'SHOES': return '生命'; // label
case 'SHOES': return `最大HP +${current} / ${max}`;
```

- [ ] **Step 2: pveEquipDetail**

```ts
const IMPLICIT_CN = {
  ...,
  shoes_light: '轻靴 · 机动与视野（稀有起）',
  shoes_war: '战靴 · 节奏与爆发（稀有起）',
  shoes_iron: '铁靴 · 续航与硬抗（稀有起）',
};

function shoesExtraDesc(item: EquipItem): string {
  const fx = resolveShoesStageEffectsFromItem(item);
  const parts: string[] = [];
  if (fx.moveCostReduction > 0) parts.push(`移动消耗 -${fx.moveCostReduction} AP`);
  if (fx.fogBonus > 0) parts.push(`视野+${fx.fogBonus}`);
  if (fx.firstMoveFree) parts.push('首步免费');
  if (fx.stealthReduction > 0) parts.push(`潜行-${fx.stealthReduction}`);
  if (fx.terrainDamageReduction > 0) parts.push(`地形伤-${fx.terrainDamageReduction}`);
  if (fx.firstMoveApPenalty > 0) parts.push(`首步+${fx.firstMoveApPenalty} AP`);
  if (parts.length === 0) parts.push('分支效果：稀有品质起生效');
  return parts.join(' · ');
}
```

- [ ] **Step 3: CampView 鞋槽「档位」→「生命」**

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(pve): shoes UI shows HP and type stage text"
```

---

### Task 4: 设计文档同步

**Files:**
- Modify: `specs/260608-pve-destiny-expedition/design.md`（装备节补鞋类型）
- Modify: `specs/260712-pve-persistent-floor-progression/equipment-catalog.md`（鞋隐式与阶段；废止档位）

- [ ] **Step 1: 写入轻/战/铁阶段表摘要与主数值口径**
- [ ] **Step 2: Commit**

```bash
git commit -m "docs: sync shoe type and quality stages to design catalog"
```

---

### Task 5: 回归

- [ ] Run: `npm run test:pve`（至少 ShoesStageEffects + Legendary + 相关 Equipment 通过）
- [ ] 扫残留：`SHOES_REVEAL|FIRST_MOVE|STEALTH_THRESHOLD|shoesStealthReduction|档位`（鞋相关）

---

## Spec coverage

| Spec 节 | Task |
|---|---|
| §3 核心模型 | 1 |
| §4 阶段表 | 1–2 |
| §5 生命区间 | 1 |
| §6 目录映射 | 1 |
| §7 传奇 | 2（保留现有 legendary 钩子） |
| §8 UI/废止 | 3 |
| §9 接入点 | 2 |
| §10 验收 | 5 |
