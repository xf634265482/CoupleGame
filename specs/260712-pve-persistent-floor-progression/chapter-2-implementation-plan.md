# 第二章 8–14 层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在永久逐层框架上开放全局层 8–14（沙漠第二章），含三层新机制与奖励表扩展，不重做战斗主链。

**Architecture:** 镜像 `chapter1/` 建立 `chapter2/`（Catalog / Generator / Factory / Objectives）；`PersistentExpeditionRuntime` 按 `floor` 路由章节；云端 `PveRewardV2` 与客户端 `FixedEquipmentLoot` 同步扩展 8–14 金币/品质/装备池；新目标种类 `TIMED_ESCAPE` 服务第 12 层。

**Tech Stack:** Cocos 3.8.8 TS（`assets/scripts/pve/core` 零 `cc`）、ts-jest（`test/pve/`）、微信云函数 `cloudfunctions/common/pve/*` + `node scripts/sync-cloud-common.js`。

**Spec:** `specs/260712-pve-persistent-floor-progression/chapter-2-content.md`（唯一玩法口径）。

## Global Constraints

- 只做全局层 **8–14**；第 15+ UI/文案仍为「未开放」。
- `chapterFloor = floor - 7`（章内 1–7）；全局 `floor` 用于奖励/存档/云端。
- 改玩法同步 `chapter-2-content.md` / 相关 catalog；改云端只改 `cloudfunctions/common/**` 后必须 sync。
- `core/` 禁止 `import 'cc'`、禁止直接 `Math.random()`。
- 不做：灵气怪、打造、可选目标、第二套战斗控制器、第 3–5 章。
- 工作区已有大量未提交改动：禁止 reset/checkout 覆盖用户文件；只 stage 本任务相关文件。
- 提交信息用英文 conventional 前缀（`feat:` / `test:` / `docs:`），除非用户另有要求。

---

## File Structure

| 路径 | 职责 |
|---|---|
| `assets/scripts/pve/core/chapterRouting.ts` | `chapterIdForFloor` / `chapterFloorOf` / `isFloorContentReady` |
| `assets/scripts/pve/core/chapter2/Chapter2FloorCatalog.ts` | 8–14 骨架、怪池、命痕/装备 ID、special |
| `assets/scripts/pve/core/chapter2/Chapter2FloorGenerator.ts` | 半固定地图生成 + BFS |
| `assets/scripts/pve/core/chapter2/Chapter2ExpeditionFactory.ts` | 从 snapshot+profile 建 `ExpeditionState` |
| `assets/scripts/pve/core/objectives/Chapter2Objectives.ts` | 8–14 目标定义 |
| `assets/scripts/pve/core/objectives/FloorObjective.ts` | 增加 `TIMED_ESCAPE` |
| `assets/scripts/pve/core/chapter2/LightSandstorm.ts` | 第 12 层轻沙暴（伤害 10） |
| `assets/scripts/pve/core/chapter2/HuntPressure.ts` | 第 10 层哨卫清完后降压 |
| `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` | 章节路由、波次 rush、目标事件 |
| `assets/scripts/pve/core/equipment/EquipmentDefinition.ts` | W08–B06 定义 |
| `assets/scripts/pve/core/equipment/FixedEquipmentLoot.ts` | 品质表 8–14；池回退按章节 |
| `assets/scripts/pve/core/minghen/MinghenCatalog.ts` + `MinghenEffects.ts` + `MinghenTrial.ts` | M25/M26 |
| `cloudfunctions/common/pve/PveRewardV2.js` | 金币/品质/装备池/optional 空表扩到 14 |
| `assets/scripts/lobby/PveLobbyController.ts` | 楼层选择 1–14 |
| `assets/scripts/pve/views/CampView.ts` | 8–14 情报文案 |
| `test/pve/Chapter2*.test.ts` | 生成/目标/运行时切片 |
| `cloudfunctions/common/__tests__/PveRewardV2.test.js` | 8–14 奖励断言 |

---

### Task 1: 章节路由 + 运行时放开 8–14 骨架

**Files:**
- Create: `assets/scripts/pve/core/chapterRouting.ts`
- Modify: `assets/scripts/pve/core/PersistentExpeditionRuntime.ts`（`createPersistentFloorRuntime` 与所有写死 `getChapter1*` 的分支）
- Test: `test/pve/ChapterRouting.test.ts`

**Interfaces:**
- Produces:
  - `chapterIdForFloor(floor: number): 1 | 2`
  - `chapterFloorOf(floor: number): number`（1–7）
  - `isFloorContentReady(floor: number): boolean`（1–14 true，else false）
  - `MAX_READY_FLOOR = 14`

- [ ] **Step 1: Write the failing test**

```ts
// test/pve/ChapterRouting.test.ts
import { chapterFloorOf, chapterIdForFloor, isFloorContentReady } from '../../assets/scripts/pve/core/chapterRouting';

describe('chapterRouting', () => {
  test('maps global floors to chapter and in-chapter index', () => {
    expect(chapterIdForFloor(1)).toBe(1);
    expect(chapterIdForFloor(7)).toBe(1);
    expect(chapterIdForFloor(8)).toBe(2);
    expect(chapterIdForFloor(14)).toBe(2);
    expect(chapterFloorOf(8)).toBe(1);
    expect(chapterFloorOf(14)).toBe(7);
    expect(isFloorContentReady(14)).toBe(true);
    expect(isFloorContentReady(15)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/pve/ChapterRouting.test.ts -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Implement routing helper**

```ts
// assets/scripts/pve/core/chapterRouting.ts
export const MAX_READY_FLOOR = 14 as const;
export const CHAPTER_SIZE = 7 as const;

export function chapterIdForFloor(floor: number): 1 | 2 {
  if (floor < 1 || !Number.isInteger(floor)) throw new Error('INVALID_FLOOR');
  if (floor <= 7) return 1;
  if (floor <= 14) return 2;
  throw new Error('CHAPTER_NOT_READY');
}

export function chapterFloorOf(floor: number): number {
  const chapter = chapterIdForFloor(floor);
  return chapter === 1 ? floor : floor - 7;
}

export function isFloorContentReady(floor: number): boolean {
  return Number.isInteger(floor) && floor >= 1 && floor <= MAX_READY_FLOOR;
}
```

- [ ] **Step 4: Stub chapter2 factory path in runtime (temporary throw with clear code)**

在 `createPersistentFloorRuntime` 中：

```ts
import { chapterIdForFloor, isFloorContentReady } from './chapterRouting';

if (!isFloorContentReady(snapshot.floor)) throw new Error('FLOOR_CONTENT_NOT_READY');
const chapterId = chapterIdForFloor(snapshot.floor);
if (chapterId === 1) {
  // 现有 Chapter1 路径不变
} else {
  throw new Error('CHAPTER2_NOT_WIRED'); // Task 3 替换
}
```

把原先 `snapshot.floor > 7` → `CHAPTER1_FLOOR_OUT_OF_RANGE` 改为上述逻辑。

- [ ] **Step 5: Run tests**

Run: `npx jest test/pve/ChapterRouting.test.ts test/pve/Chapter1Floor1to7.test.ts -v`
Expected: ChapterRouting PASS；Chapter1 既有用例仍 PASS

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/core/chapterRouting.ts assets/scripts/pve/core/PersistentExpeditionRuntime.ts test/pve/ChapterRouting.test.ts
git commit -m "$(cat <<'EOF'
feat(pve): add chapter routing for floors 8-14

EOF
)"
```

---

### Task 2: Chapter2FloorCatalog（8–14 数据表）

**Files:**
- Create: `assets/scripts/pve/core/chapter2/Chapter2FloorCatalog.ts`
- Test: `test/pve/Chapter2FloorCatalog.test.ts`

**Interfaces:**
- Consumes: `ObjectiveKind` from `objectives/FloorObjective`
- Produces: `CHAPTER2_FLOORS: Record<number, Chapter2FloorDefinition>` keyed by **全局** floor 8–14
  字段形状与 `Chapter1FloorDefinition` 一致（可 `export type Chapter2FloorDefinition = Chapter1FloorDefinition` 或复制同构接口）。
  `getChapter2FloorDefinition(floor: number)`

锁定内容（摘自 `chapter-2-content.md`）：

| floor | name | size | fog | kind | minghenIds | equipmentIds |
|---:|---|---:|---|---|---|---|
| 8 | 沙丘哨站 | 8 | FULL | KEY_EXPLORE | M08,M22,M09 | W08,A04,S04 |
| 9 | 毒蝎猎场 | 8 | FULL | ELITE_HUNT | M02,M17,M15,M10 | W09,W10,H04 |
| 10 | 沙暴警戒 | 8 | NONE | PURGE | M05,M03,M13 | W11,A05,H05 |
| 11 | 沙暴追剿 | 9 | NONE | CHASE | M11,M12,M16,M14 | W12,S05,T04,T05 |
| 12 | 沙暴走廊 | 9 | NONE | TIMED_ESCAPE | M19,M18,M20,M25 | W13,A06,S06 |
| 13 | 流沙潮汐 | 9 | NONE | WAVE_SURVIVAL | M21,M23,M22,M26 | H06,T06 + 8–12 非 Boss 回流 |
| 14 | 流沙王座 | 10 | BOSS_FOG | BOSS | M24,M01,M04 | B04,B05,B06 |

`special` 锁死：
- 8: `{ sandPitMovePenalty: 2 }`
- 10: `{ sentinelIds: ['F10_SENTINEL_1','F10_SENTINEL_2'] }`
- 12: `{ turnLimit: 12, sandstormDamage: 10, sandstormCells: 4, sandstormIntervalTurns: 2 }`
- 13: `{ waveCount: 4, waveRushSteps: 4, expandPitsPerWave: 2 }`
- 14: 复用现网流沙巨蝎常量（不在 catalog 重写 Boss 数值）

- [ ] **Step 1: Write failing catalog test**

```ts
import { CHAPTER2_FLOORS, getChapter2FloorDefinition } from '../../assets/scripts/pve/core/chapter2/Chapter2FloorCatalog';

test('seven chapter-two floors use global keys 8-14', () => {
  expect(Object.keys(CHAPTER2_FLOORS).map(Number).sort((a, b) => a - b)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  expect(getChapter2FloorDefinition(12).objectiveKind).toBe('TIMED_ESCAPE');
  expect(getChapter2FloorDefinition(12).special?.turnLimit).toBe(12);
  expect(getChapter2FloorDefinition(10).special?.sentinelIds).toEqual(['F10_SENTINEL_1', 'F10_SENTINEL_2']);
});
```

- [ ] **Step 2: Run — expect FAIL**（`TIMED_ESCAPE` 尚未进类型 / 文件不存在）

- [ ] **Step 3: Extend `ObjectiveKind`**

```ts
// FloorObjective.ts
export type ObjectiveKind =
  | 'KEY_EXPLORE' | 'ELITE_HUNT' | 'WAVE_SURVIVAL' | 'CHASE'
  | 'BREAKTHROUGH' | 'PURGE' | 'BOSS' | 'TIMED_ESCAPE';
```

- [ ] **Step 4: Implement catalog**（坐标骨架可参考章 1 同型层，沙漠怪 kind：`DESERT_RAIDER` / `DESERT_HOPPER_LIZARD` / `POISON_SCORPION` / `DUNE_SENTINEL` / `QUICKSAND_SCORPION`；具体格子写入文件时对照 `chapter-2-content.md` §4–10，保证 BFS 可达。）

- [ ] **Step 5: Run catalog test — PASS**

- [ ] **Step 6: Commit**

```bash
git add assets/scripts/pve/core/objectives/FloorObjective.ts assets/scripts/pve/core/chapter2/Chapter2FloorCatalog.ts test/pve/Chapter2FloorCatalog.test.ts
git commit -m "$(cat <<'EOF'
feat(pve): add chapter 2 floor catalog for floors 8-14

EOF
)"
```

---

### Task 3: Generator + Factory + 运行时接线（复用层 8/9/11/14 可进局）

**Files:**
- Create: `chapter2/Chapter2FloorGenerator.ts`, `chapter2/Chapter2ExpeditionFactory.ts`
- Create: `objectives/Chapter2Objectives.ts`（先实现 KEY_EXPLORE / ELITE_HUNT / CHASE / BOSS；PURGE/WAVE/TIMED 可先 stub 抛 `NOT_IMPLEMENTED` 仅用于 10/12/13）
- Modify: `PersistentExpeditionRuntime.ts` 替换 `CHAPTER2_NOT_WIRED`
- Modify: `FixedEquipmentLoot.ts` 的 `equipmentPoolFor` 回退按章节取 catalog
- Test: `test/pve/Chapter2FloorGenerator.test.ts`

**Interfaces:**
- Produces: `generateChapter2Floor(floor, seed, mode, tutorial?)`、`createChapter2ExpeditionState(snapshot, profile)`、`getChapter2Objective(floor)`、`createChapter2Monster(...)`
- Reuse: `Chapter2Monsters.ts`、`bosses/QuicksandScorpion.ts`、沙坑实体生成（对齐 `MapGenerator` / 章 1 模式）

- [ ] **Step 1: Failing generator determinism test**（20 seeds，floor 8/9/11/14 可达性）

- [ ] **Step 2: Implement generator/factory**（镜像 `Chapter1FloorGenerator` / `Chapter1ExpeditionFactory`；Boss 层调用现有流沙巨蝎遭遇）

- [ ] **Step 3: Wire runtime**

```ts
if (chapterId === 2) {
  let expedition = createChapter2ExpeditionState(snapshot, profile);
  const map = generateChapter2Floor(snapshot.floor, snapshot.seed, snapshot.mode, false);
  let objective = getChapter2Objective(snapshot.floor).create();
  // ... startFloorRuntime 同章 1
}
```

所有 `getChapter1Objective(runtime.floor)` 改为：

```ts
function getFloorObjective(floor: number) {
  return chapterIdForFloor(floor) === 1
    ? getChapter1Objective(floor)
    : getChapter2Objective(floor);
}
```

- [ ] **Step 4: Pool fallback**

```ts
function equipmentPoolFor(state: ExpeditionState): readonly string[] {
  if ((state.equipmentDropPool ?? []).length > 0) return state.equipmentDropPool!;
  try {
    return chapterIdForFloor(state.floor) === 1
      ? getChapter1FloorDefinition(state.floor).equipmentIds
      : getChapter2FloorDefinition(state.floor).equipmentIds;
  } catch { return []; }
}
```

- [ ] **Step 5: Run** `npx jest test/pve/Chapter2FloorGenerator.test.ts test/pve/Chapter1Floor1to7.test.ts -v` — PASS

- [ ] **Step 6: Commit** `feat(pve): wire chapter 2 generator and expedition factory`

---

### Task 4: 第 10 层 PURGE（哨卫）+ 猎压解除

**Files:**
- Modify: `Chapter2Objectives.ts`（PURGE：击杀全部 `sentinelIds`）
- Create: `chapter2/HuntPressure.ts`
- Modify: `PersistentExpeditionRuntime.ts`（目标完成后调用降压）
- Test: `test/pve/Chapter2Floor10Sentinel.test.ts`

**Interfaces:**
- Produces: `dissolveHuntPressure(state: ExpeditionState, options: { keepIds: string[] }): ExpeditionState`
  行为：非哨卫存活怪 `aggroRadius = 1` 且若不在邻接则 `aiState = 'IDLE'`（具体字段以 `Monster` 类型为准；禁止删除怪）。

- [ ] **Step 1: Failing test** — 两哨卫死后 objective COMPLETE，且围猎怪 aggro 下降

- [ ] **Step 2: Implement objective** — `ENTITY_KILLED` 累计；全灭 `complete`；生成传送门走现有 `spawnObjectivePortal` 路径

- [ ] **Step 3: On `OBJECTIVE_COMPLETE` for floor 10** call `dissolveHuntPressure`

- [ ] **Step 4: Tests PASS + commit** `feat(pve): add dune sentinel purge floor 10`

---

### Task 5: 第 12 层 TIMED_ESCAPE + 轻沙暴

**Files:**
- Create: `chapter2/LightSandstorm.ts`
- Modify: `Chapter2Objectives.ts`、`PersistentExpeditionRuntime.ts`（玩家回合结束事件、怪物回合后沙暴）
- Test: `test/pve/Chapter2Floor12TimedEscape.test.ts`

**Interfaces:**
- `applyLightSandstorm(state, rng, { cellCount: 4, damage: 10 }): { state, events }`
  事件复用或新增轻量 `SANDSTORM_SPAWNED` / `SANDSTORM_HIT`（若复用 Boss 事件，伤害必须吃参数 10，不得写死 Boss 20）。
- Objective `TIMED_ESCAPE`：`data: { turnsLeft: 12, turnLimit: 12 }`；`PLAYER_TURN_ENDED` → `turnsLeft--`，到 0 且未 `EXIT_INTERACTED` → FAILED；`EXIT_INTERACTED` → COMPLETE。

- [ ] **Step 1: Failing tests** — 12 回合未出门失败；出门成功；沙暴伤害为 10

- [ ] **Step 2: Implement objective + sandstorm + runtime hooks**

- [ ] **Step 3: PASS + commit** `feat(pve): add sandstorm corridor timed escape floor 12`

---

### Task 6: 第 13 层四波潮汐 + 动态沙坑

**Files:**
- Modify: `Chapter2Objectives.ts`（WAVE_SURVIVAL，waveCount=4）
- Modify: `Chapter2ExpeditionFactory.ts` / Runtime 波次刷怪表（对齐 content §9.2）
- Modify: Runtime — 每波 `rushMonstersTowardPlayer(..., 4, { attackIfInRange: false, collapseMoves: true })`；波间 `expandSandPits(state, count)`
- Test: `test/pve/Chapter2Floor13Waves.test.ts`

波次配置（kind 列表）：
1. `['DESERT_RAIDER','DESERT_RAIDER']`
2. `['DESERT_RAIDER','DESERT_HOPPER_LIZARD']`
3. `['DESERT_RAIDER','DESERT_RAIDER','DESERT_HOPPER_LIZARD']`
4. `['POISON_SCORPION','DESERT_RAIDER','DESERT_HOPPER_LIZARD']`

- [ ] **Step 1–4: TDD 波次推进、rush、沙坑数量递增、通关 portal**

- [ ] **Step 5: Commit** `feat(pve): add quicksand tide wave floor 13`

---

### Task 7: 装备定义 + 客户端/云端奖励表 8–14

**Files:**
- Modify: `EquipmentDefinition.ts`（追加 W08–T06、B04–B06；数值可克隆相近章 1 件并 +1～2 档 power/hp）
- Modify: `FixedEquipmentLoot.ts` `FLOOR_EQUIP_QUALITY_WEIGHTS` 按 content §11
- Modify: `cloudfunctions/common/pve/PveRewardV2.js`（权威源）
- Run: `node scripts/sync-cloud-common.js`
- Test: `test/pve/Chapter2EquipmentPools.test.ts`、`cloudfunctions/common/__tests__/PveRewardV2.test.js`

品质表（必须一致）：

```js
8: [['FINE',100]],
9: [['FINE',100]],
10: [['FINE',70],['RARE',30]],
11: [['FINE',60],['RARE',40]],
12: [['FINE',40],['RARE',60]],
13: [['FINE',20],['RARE',80]],
14: [['RARE',70],['EPIC',30]],
```

金币：`8:35,9:45,10:55,11:65,12:75,13:90,14:140`
`OPTIONAL_BY_FLOOR[8..14]=[]`
`EQUIPMENT_POOLS` 与 catalog `equipmentIds` 一致。

`equipmentPoolForFloor` 若仍被使用：扩展 `sourceFloor===floor` 与 floor 13 回流逻辑。

- [ ] **Step 1: Failing reward test** — floor 8 first clear gold 35；floor 14 quality can be EPIC

- [ ] **Step 2: Implement definitions + tables + sync**

- [ ] **Step 3: PASS + commit** `feat(pve): extend equipment and rewards for floors 8-14`

**提醒用户：** 部署微信云函数 **pve**（云端安装依赖）。

---

### Task 8: 命痕 M25 / M26 + 来源层

**Files:**
- Modify: `MinghenCatalog.ts`、`MinghenEffects.ts`、`MinghenTrial.ts`
- Modify: 云端若有命痕 ID 白名单（Grep `M24` in `cloudfunctions/common/pve`）一并扩展
- Test: `test/pve/MinghenSandEffects.test.ts`

效果口径（已锁）：
- M25 I：沙坑额外移动 AP −1（≥0）；II：本回合首次踩坑额外 0；III：在沙坑上攻击最终伤害 +15%
- M26 I/II：沙暴真实伤害 −30%/−50%；III：被沙暴命中后下一次主动攻击 +20%

- [ ] **Step 1–4: TDD 效果钩子（BEFORE_MOVE / DAMAGED source TERRAIN / BEFORE_HIT）**

- [ ] **Step 5: Commit** `feat(pve): add minghen M25 sandstride and M26 stormguard`

---

### Task 9: 大厅 / 营地 UI 开放到 14

**Files:**
- Modify: `assets/scripts/lobby/PveLobbyController.ts` — `min(7,...)` / `floor <= 7` → `MAX_READY_FLOOR`（14）；tip 文案改为「第一章+第二章 1–14」
- Modify: `assets/scripts/pve/views/CampView.ts` — `_floorIntel` 补 8–14（文案摘自 content）；`text[floor]` 对 15+ 仍「尚未开放」
- Grep 其它写死 `7` 的楼层选择（`CampController` / 情报）一并改，禁止全仓无目的 grep；从 `PROJECT_NAVIGATION` / 调用链定位

- [ ] **Step 1: 手动或轻量单测无法覆盖 UI 时，用注释 checklist 自测**

- [ ] **Step 2: Commit** `feat(pve): unlock lobby floor select through floor 14`

---

### Task 10: 文档与验收回归

**Files:**
- Modify: `PROJECT_NAVIGATION.md`、`CALL_FLOW.md`（第二章入口）
- Modify: `specs/260712-pve-persistent-floor-progression/implementation-status.md`（若存在）标记 ch2 进行中/完成
- Test: 跑全量相关 jest

- [ ] **Step 1: Run**

```bash
npm run test:pve
cd cloudfunctions/common && npm test
```

Expected: 与 ch2/ch1/reward 相关用例 PASS

- [ ] **Step 2: 对照 AC（content §14.2）自检清单全部勾选**

- [ ] **Step 3: Commit docs** `docs(pve): document chapter 2 routing and call flow`

---

## Spec coverage (self-review)

| Spec 要求 | Task |
|---|---|
| 路由 `chapterFloor = floor - 7`，去掉 >7 硬失败 | 1, 3 |
| 8 探索沙坑 / 9 精英 / 11 追击 / 14 Boss | 2, 3 |
| 10 哨卫开门 + 降压 | 4 |
| 12 限 12 回合 + 轻沙暴伤害 10 | 5 |
| 13 四波 + rush + 动态沙坑 | 6 |
| 金币/品质/装备池 8–14 | 7 |
| M25/M26 | 8 |
| 大厅 1–14，15+ 未开放 | 9 |
| 击杀掉落入永久背包 | 已有主链；3/7 保证池正确 |
| 云端 sync + 部署提醒 | 7 |
| 无灵气怪/打造/可选目标/第二控制器 | Global Constraints |

**Placeholder scan:** 无 TBD；第 10/12/13 机制有明确函数名与数值。
**Type consistency:** 全局 `floor` 贯穿 catalog key、reward、runtime；章内索引仅用于叙事/对称章 1 结构时通过 `chapterFloorOf`。

---

## Execution Handoff

Plan complete and saved to `specs/260712-pve-persistent-floor-progression/chapter-2-implementation-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — 每任务新开子代理，任务间评审，迭代快
2. **Inline Execution** — 本会话按 `executing-plans` 连续执行并设检查点

Which approach?
