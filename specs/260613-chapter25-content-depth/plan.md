# 2-5 章内容深化 — Implementation Plan

> 配套 [design.md](design.md)。按依赖排序，**不要并行**前后置任务（每一阶段都要跑 `npm test` 绿了再进下一阶段）。

## 阶段 0：基础设施（30 分钟）

### T0.1 PveTypes 新增事件类型
- 文件：`assets/scripts/pve/core/PveTypes.ts`
- 在 `PveEvent` 联合添加：
  - `{ type: 'SAND_PIT_STEPPED'; entityId: string }`
  - `{ type: 'ICE_WALL_BROKEN'; entityId: string; anima: number }`
  - `{ type: 'LAVA_TIDE_SPAWNED'; tiles: Coord[]; duration: number }`
  - `{ type: 'LAVA_TILE_DAMAGED'; entityId: string; damage: number }`
  - `{ type: 'MIRROR_SPAWNED'; mirrorId: string; pos: Coord }`
  - `{ type: 'MIRROR_KILLED'; mirrorId: string }`
- 在 `FixedEntity` 的 `type` 联合添加：`'SAND_PIT' | 'ICE_WALL' | 'LAVA_TILE'`
- `Monster.bossId` 联合添加 `'FATE_MIRROR'` 作为镜像伪 Boss 子类

### T0.2 PveConstants 新增数值常量
- 文件：`assets/scripts/pve/core/PveConstants.ts`
- 新增：
  ```ts
  export const CHAPTER2_SAND_PIT_COUNT = 4;
  export const CHAPTER2_SAND_PIT_MOVE_PENALTY = 1;
  export const CHAPTER3_ICE_WALL_COUNT = 3;
  export const CHAPTER3_ICE_WALL_HP = 10;
  export const CHAPTER3_ICE_WALL_DROP_ANIMA = 1;
  export const CHAPTER4_LAVA_TIDE_INTERVAL = 3;
  export const CHAPTER4_LAVA_TIDE_TILE_COUNT = 3;
  export const CHAPTER4_LAVA_TIDE_DURATION = 2;
  export const CHAPTER4_LAVA_TILE_DAMAGE = 5;
  export const CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO = 0.5;
  export const CHAPTER5_MIRROR_SPAWN_HP_RATIO = 0.33;
  export const CHAPTER5_MIRROR_HP = 20;
  export const CHAPTER5_MIRROR_ATTACK_MULT = 0.5;
  ```
- 数值留待 plan 实施时按真机手感微调，design 阶段不锁。

### T0.3 测试套件骨架
- 新建 `test/pve/chapter25-depth.test.ts`，先写 5 个 describe 块（每个 Boss 一个 + HELMET 一个 + 怪物表一个）只放 `it.todo`，让目录树早早可见。

---

## 阶段 1：HELMET 接入（最简单，先打通养成回路 — 45 分钟）

### T1.1 抽 helper
- 新建 `assets/scripts/pve/core/EquipHelper.ts`
- 导出 `equipItem(state, newItem) → ApplyResult`：
  - 读取 `state.player.equipment[newItem.slot]` 旧装备
  - HELMET 槽：`maxHp += (new.baseStat - old?.baseStat ?? 0)`；无旧装备时 hp 同步 +new.baseStat
  - 其余槽位：照搬现有逻辑（直接覆盖）
  - emit `{ type: 'EQUIP_CHANGED', slot, ... }`（PveTypes 中新增此事件）

### T1.2 替换三处直接覆盖装备的代码
- `LootSystem.openChest` 内 `equipment: { ...next.player.equipment, [equip.slot]: equip }` → 调 `equipItem`
- `LootSystem.applySimpleDrop` 同上
- `NeutralEntities.upgradeEquip` 内 `equipment: { ...state.player.equipment, [slot]: newItem }` → 调 `equipItem`（强化是 baseStat+1，也要触发 maxHp 调整）
- `NeutralEntities.rerollEquipTrait` 不动 baseStat，不需要走 helper

### T1.3 测试
- `chapter25-depth.test.ts` 的 HELMET describe：
  - it 1：空槽位首次拾取 COMMON 头盔（baseStat=2），maxHp +2，hp +2
  - it 2：已有 COMMON 头盔，替换为 RARE（baseStat=6），maxHp +4（6-2），hp 不变
  - it 3：铁匠强化头盔 baseStat+1，maxHp +1
  - it 4：装备 LEGENDARY（baseStat=14）从空槽，maxHp 增加 14
- 跑 `npm run test:pve` 全绿。

### T1.4 同步 design 文档
- 修改 [经济养成与存档系统V1](../game-design/经济养成与存档系统V1.md) §2.1 HELMET 行：去掉"占位"标注，改成"最大生命值加成（生效于 `equipItem`）"。
- §七已知限制移除"HELMET 槽位 baseStat 未读取"那条。

---

## 阶段 2：2-5 章怪物表框架（P0，2 小时）

### T2.1 重命名并参数化
- `assets/scripts/pve/core/Chapter1Monsters.ts` → 保留文件名（变体工厂还在用）
- `MapGenerator.generateChapter1Monsters` → 抽到新文件 `ChapterMonsterRules.ts`，函数签名：
  ```ts
  export function generateChapterMonsters(
    chapter: number,
    flInChapter: number,
    pool: Coord[],
    nextMonsterId: () => string,
    monsters: Monster[],
  ): void
  ```

### T2.2 表驱动
- `ChapterMonsterRules.ts` 内：
  ```ts
  type MonsterRule = Record<string, number>; // variantId → count
  const CHAPTER_RULES: Record<number, Record<number, MonsterRule>> = {
    1: { 1: { GOBLIN_WARRIOR: 3, SPIRIT_RAT: 1 }, ... },  // 完整搬现有第1章
    2: { 1: {...}, 2: {...}, 3: {...}, 4: {...} },        // 暂用通用怪 NORMAL×N 配比（量级不同）
    3: {...}, 4: {...}, 5: {...},
  };
  ```
- 2-5 章用"chapter 1 数据 + chapter 缩放"先填，让玩家至少能感到每层怪物数不同（如第 1 层 3 只，第 2 层 4 只，第 3 层 3 只，第 4 层 5 只 + 1 精英）。

### T2.3 MapGenerator 替换调用
- `MapGenerator.generateFloor` 中 `if (chapter === 1)` 分支 → 全部 chapter 都走 `generateChapterMonsters`
- 删除 `MapGenerator` 中原 `generateChapter1Monsters` 函数
- ELITE/ANIMA 怪物的生成移入 `ChapterMonsterRules`，由表自行声明数量

### T2.4 回归测试
- 已有的 PVE 集成测试（`test/pve/*.test.ts`）跑过——AC-302 要求第 1 章行为不变。
- 新加 `chapter25-depth.test.ts` 的怪物表 describe：
  - it 1：chapter=1, fl=1 → 调用结果与重构前 `generateChapter1Monsters` 完全一致
  - it 2：chapter=2, fl=1~4 → 每层怪物数符合表声明
  - it 3：chapter=3,4,5 同上

---

## 阶段 3：Boss 机制深化（核心，~半天）

> 每个 Boss 一节，按章节顺序。**每一节都要单测过了再下一节**，否则 Boss 之间 bug 互相串。

### T3.1 QuicksandScorpion — 沙坑地形（1 小时）

- `MapGenerator.generateFloor`：Boss 层 + chapter===2 时，从 pool 取 `CHAPTER2_SAND_PIT_COUNT` 个格放 `SAND_PIT` 实体。
- `MovementSystem.applyMove`：目标格是 `SAND_PIT` 时，AP 消耗 + `CHAPTER2_SAND_PIT_MOVE_PENALTY`，emit `SAND_PIT_STEPPED`。
- `bosses/QuicksandScorpion.ts` 的 `quicksandScorpionBurrow`：钻出位置改为"距玩家最近的未被占用沙坑"，找不到则保持现有随机位置回退。
- 测试：
  - it：钻出时如有沙坑，必从沙坑出
  - it：踩沙坑移动 AP 消耗 +1
  - it：所有沙坑被占用时回退到原随机逻辑

### T3.2 FrostGiant — 冰墙地形（1 小时）

- `MapGenerator.generateFloor`：Boss 层 + chapter===3 时，放 `CHAPTER3_ICE_WALL_COUNT` 个 `ICE_WALL` 实体（带 `hp` 字段）。
- 扩展 `FixedEntity` 类型：`ICE_WALL` 变体允许带 `hp: number`。
- `MovementSystem.applyMove`：目标格是 `ICE_WALL` 且未破坏 → no-op（阻挡）。
- `CombatSystem.playerAttack`：目标可以是 `ICE_WALL`（不只是 Monster）；命中扣 hp，hp ≤ 0 时标记 consumed，emit `ICE_WALL_BROKEN` + 给玩家 `CHAPTER3_ICE_WALL_DROP_ANIMA` 灵气。
- `FogSystem`：冰墙阻挡视线（在 `revealAround` 的曼哈顿展开中，遇 `ICE_WALL` 不继续展开）— **此项工作量较大，单列 T3.2.bonus**，初版可以先不做视线阻挡只做移动阻挡。
- 测试：
  - it：玩家移动到冰墙格 no-op
  - it：玩家攻击冰墙 hp 扣减
  - it：冰墙 hp=0 时 emit ICE_WALL_BROKEN，玩家 anima+1

### T3.3 LavaLord — 熔岩潮汐阶段（1.5 小时，复杂度最高）

- 在 `ExpeditionState` / `floorState` 增加字段：`lavaTiles?: { entityId: string; remaining: number }[]`、`lavaTideCounter?: number`。
- `bosses/LavaLord.ts` 新增 `lavaLordPhaseTransition(state)` 与 `lavaTideStep(state)`：
  - 每个 monster 回合开始检查：Boss 当前 HP / maxHp ≤ 50% 且未进入 phase2 → 标记 phase2 进入（用 monster.aiState 或 floorState 上的 flag）。
  - phase2 期间，每 `CHAPTER4_LAVA_TIDE_INTERVAL` 回合：从 pool 中随机 `CHAPTER4_LAVA_TIDE_TILE_COUNT` 个空格放 `LAVA_TILE`，emit `LAVA_TIDE_SPAWNED`。
  - 每回合结束时（`endTurn`）：所有 `LAVA_TILE` 的 remaining -1；玩家所在格是 `LAVA_TILE` 时扣 `CHAPTER4_LAVA_TILE_DAMAGE` HP，emit `LAVA_TILE_DAMAGED`；remaining=0 时移除。
- `MonsterAI.stepBoss`：第 4 章 Boss 钩入 `lavaTideStep`。
- 测试：
  - it：Boss HP > 50% 时不触发潮汐
  - it：Boss HP 落到 50% 时下一回合开始触发首次潮汐
  - it：潮汐间隔 3 回合
  - it：玩家踩熔岩格扣 5 HP
  - it：潮汐 2 回合后自动消失

### T3.4 FateGuardian — 镜像分身（1 小时）

- `bosses/FateGuardian.ts` 新增 `spawnFateMirror(state, boss)`：
  - Boss HP / maxHp ≤ `CHAPTER5_MIRROR_SPAWN_HP_RATIO` 且 floor 上无现存镜像 → 在 Boss 相邻空格生成一个 `Monster`：
    ```
    { id: 'mirror_<floor>', type: 'BOSS', bossId: 'FATE_MIRROR',
      hp: CHAPTER5_MIRROR_HP, maxHp: 20,
      attack: Math.round(boss.attack * 0.5),
      range: boss.range, aggroRadius: boss.aggroRadius, aiState: 'CHASE' }
    ```
  - emit `MIRROR_SPAWNED`。
- `CombatSystem.playerAttack`：killed 怪物 bossId === 'FATE_MIRROR' 时 emit `MIRROR_KILLED`，**不**调 `applyMonsterKillDrop`（镜像不掉东西）。
- `FloorRules.spawnPortal`：保持只看真 Boss（bossId !== 'FATE_MIRROR'）的死亡，避免镜像被打死后误生成传送门。
- `MonsterAI.stepBoss`：镜像走普通近战 AI（与现有 stepMonster 一致），不复用 Boss 的专属机制。
- 测试：
  - it：Boss HP > 33% 时不生成镜像
  - it：Boss HP 落到 33% 时下一回合生成镜像
  - it：已存在镜像时不重复生成
  - it：杀死镜像不生成传送门
  - it：镜像攻击力 = Boss 攻击 × 0.5

---

## 阶段 4：战报与渲染（1 小时）

### T4.1 战报文案
- [战斗系统V1](../game-design/战斗系统V1.md) §九的事件文案映射表中添加新事件文案：
  - SAND_PIT_STEPPED → "🏜️ 陷入沙坑！移动 AP +1"
  - ICE_WALL_BROKEN → "❄️ 击碎冰墙！获得 1 灵气"
  - LAVA_TIDE_SPAWNED → "🌋 熔岩潮汐！3 格被熔岩覆盖"
  - LAVA_TILE_DAMAGED → "🔥 被熔岩烫伤！-5 HP"
  - MIRROR_SPAWNED → "👥 命运镜像现身！"
  - MIRROR_KILLED → "✨ 击碎镜像！"

### T4.2 FogMapView 渲染
- 新增 GLYPH 项：SAND_PIT=`'🕳️'`、ICE_WALL=`'🧊'`、LAVA_TILE=`'🟧'`、FATE_MIRROR=`'👤'`
- 在 `_renderEntity` 中处理 ICE_WALL 的 hp 显示（在格子右下角小字 "10/10"）

### T4.3 同步设计文档
- [Boss设计V1](../game-design/Boss设计V1.md)：补充 2-5 章 Boss 的新机制描述、数值表。
- [地图与探索系统V1](../game-design/地图与探索系统V1.md) §2.2：补充 chapter 2-5 Boss 层的新增地形说明。
- [战斗系统V1](../game-design/战斗系统V1.md) §六：补充新增异常状态/伤害事件。

---

## 阶段 5：验收（30 分钟）

- [ ] `npm test` 全绿（含 cloudfunctions/common 套件）
- [ ] `npm run test:pve` 全绿
- [ ] 手动跑一次完整 5 章远征（可借助 `devSkipToFloor` 跳层），逐 Boss 验机制
- [ ] 真机调试：检查新增 emoji 在微信渲染正常（部分 emoji 在低端机会显示□）
- [ ] AC-13 跨端确定性回归：同一 runSeed 重跑 chapter 2-5 楼层，地图布局/Boss 行为完全一致

---

## 工作量估算

| 阶段 | 时间 |
|---|---|
| 阶段 0 基础设施 | 30 分钟 |
| 阶段 1 HELMET | 45 分钟 |
| 阶段 2 怪物表框架 | 2 小时 |
| 阶段 3 Boss 机制（4 个） | 4.5 小时 |
| 阶段 4 战报/渲染/文档 | 1 小时 |
| 阶段 5 验收 | 30 分钟 |
| **合计** | **~9.5 小时**（约 1.5 工作日） |

## 回滚策略

- 每个阶段一个独立 commit，标签 `feat(pve): chapter25-depth/Tx.y`
- 阶段 3 内 Boss 间独立 commit，回滚不互相影响
- 数值常量集中在 `PveConstants.ts`，调参不动逻辑代码
