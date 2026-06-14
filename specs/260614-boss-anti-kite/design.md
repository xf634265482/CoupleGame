# 260614 · Boss 反「风筝逃课」机制改动

> 状态：设计已确认，进入实现。
> 关联：`specs/260608-pve-destiny-expedition/design.md`（PVE 主文档）、`specs/game-design/Boss设计V1.md`（Boss 机制总表）。
> 仅改 PVE 第 3/5/2 章 Boss + 两个数值加料；第 1 章哥布林酋长、第 4 章熔岩领主机制不动（仅熔岩焰格数量 +3）。

## 一、背景与根因

`MonsterAI.stepOneMonsterCore` 的回合经济是「每个怪物回合只能做一件事：移动 **或** 攻击」，而玩家靠 AP 可在同一回合「移动 + 攻击」。由此得到一个结构性结论：

> **任何「射程 1 + 纯追击」的 Boss，数学上一定能被无伤风筝**——玩家回合末永远把距离拉回 2，Boss 回合只能用于补 1 格距离，永远轮不到攻击。

一个 Boss 抗风筝的程度，正比于它「**不依赖赢得走位博弈**」的伤害手段（AOE / DOT / 召唤 / 地形 / 传送）有多少。当前现状：

| Boss | 抗风筝靠什么 | 是否可逃课 |
|------|------------|-----------|
| 哥布林酋长(1) | 射程2 + AOE + 增援 + 狂暴加速 | ❌ 已抗住（不改）|
| 沙虫女王(2) | 潜地传送贴脸（每4回合1次）| ⚠️ 其余3回合是射程1纯近战 → **可风筝** |
| 冰霜巨人(3) | 纯射程1近战 + AP-4 | ✅ **最可逃课**（AP-4只让你少走，不阻止「走1+打」）|
| 熔岩领主(4) | 灼烧DOT + 二阶段熔岩 | ⚠️ 靠DOT/潮汐兜底（不改，仅焰格 +3）|
| 命运守卫(5) | 伤害倍率/闪避 + 二阶段镜像 | ✅ **可逃课**（倍率/闪避从不生效，因为玩家从不挨打）|

设计原则（沿用项目既有思路）：**每个 Boss 用自己的机制破解风筝，不做全局规则**——让玩家觉得「这个 Boss 在逼我换打法」，而非「系统不让我风筝」。

## 二、机制一：冰霜巨人 → 冰面地形锁移动（滑行）

把现在的「冰冻回合 AP-4」整套替换为「冰冻回合生成冰面」。

- **触发**：每 `FROST_GIANT_FREEZE_INTERVAL`（4）个怪物回合，普通近战命中后，以**玩家当前格为中心**、曼哈顿距离 ≤ `FROST_GIANT_ICE_RADIUS`(1) 铺一片 `ICE_TILE`（即「+」字 5 格；复用 `LavaLord.lavaTideStep` 的动态刷地块范式 + `FixedEntity.remaining` 倒计时）。已有 `ICE_TILE` 占用/障碍的格子跳过。
- **存续**：`FROST_GIANT_ICE_DURATION`(2) 个回合后融化（`remaining`，由 `ExpeditionState.endTurn` 统一倒计时移除）。冰面**不造成伤害**，只改变移动。
- **滑行规则（`MovementSystem.applyMove`，确定性、无 RNG）**：
  - 玩家**站在** `ICE_TILE` 上、朝方向 D 移动时 → 沿 D 方向**连续冰面一直滑**，停在 D 方向**第一个非冰可走格**；若撞墙/石块/冰墙/怪物/Boss → 停在障碍前最后一格。整段滑行只收常规 1 次移动的 AP。
  - 玩家**不在**冰面上，或 D 方向相邻格本就不是冰 → 普通走一格（不触发滑行）。
  - 滑行沿途逐格揭雾；落点不能是怪物/障碍格。
- **删除**：`playerFreezeRounds` / `FROST_GIANT_AP_PENALTY` / `FROST_GIANT_FREEZE_ROUNDS` / `FREEZE_APPLIED` 整套（被冰面取代，避免「惩罚叠惩罚」）。
- **保留**：其余回合普通近战；第3章 Boss 房既有 `ICE_WALL`（阻挡型，与 `ICE_TILE` 是两个不同实体）不变。

**反风筝原理**：冰面以玩家为中心、对称铺开 → 玩家做不到「精确后撤 1 格」，任意方向都会过冲到冰面边缘，丢掉风筝赖以生存的「精确间距」；巨人本身不滑、稳步推进，趁玩家失控期落拳。落点可预测（边缘），便于巨人逼近。

## 三、机制二：命运守卫 → 删闪避 + 命运预言

- **删除**：`fateGuardianEvade`（40% 闪避）整套 + `CombatSystem.playerAttack` 内联的闪避判定（144-158 行）+ `FATE_GUARDIAN_DODGE_CHANCE`。
- **新增命运预言**（`fateProphecyStep`，作为 `MonsterAI` 中 FATE_GUARDIAN 的前置步，类比 `spawnFateMirror`）：
  - 若存在「待结算预言」`floorState.fateProphecy` → **结算**：以记录的 `center` 为心、Chebyshev 距离 ≤ `FATE_PROPHECY_RADIUS`(1) 的 **3×3** 区域爆炸（emit `PROPHECY_RESOLVED{center}`，无论是否命中均 emit，供渲染）；玩家若在区域内，受 `round(boss.attack × FATE_PROPHECY_DAMAGE_MULT)`(1.0) 伤害（emit `PLAYER_DAMAGED`，可致死）。结算后清空 `fateProphecy`。
  - 否则若 `isProphecyTurn(turn)`（`turn % FATE_PROPHECY_INTERVAL(3) === 0`）→ **标记**：记录玩家**当前格**为 `fateProphecy.center`，emit `PROPHECY_MARKED{center}`（本回合标记、下个 Boss 回合炸，是「真·预警」，玩家看得到、必须走）。
  - 「先结算、后标记」保证预言总是提前 1 个怪物回合预警，且不会自我覆盖。
- **保留**：高血双倍伤害（`hpRatio > FATE_GUARDIAN_HP_THRESHOLD` 时 ×2）+ 二阶段镜像分身（HP≤33%）不变。莽脸吃双倍、苟风筝吃预言，双向都堵。

## 四、机制三：沙虫女王 → 流沙扩张

沙坑系统已存在（`SAND_PIT` 实体 + `MovementSystem` 踩入 +AP + `MapGenerator` 静态生成），让它「活」并加重。

- **流沙扩张**：沙虫每次**潜地**（`sandwormBurrow`）时，在其周边曼哈顿 ≤1 的空格生成 `SANDWORM_DYNAMIC_PIT_PER_BURROW`(2) 个**动态** `SAND_PIT`（带 `remaining = SANDWORM_DYNAMIC_PIT_DURATION`(5)，复用 endTurn 倒计时；满则少刷）。场地随战斗逐渐变雷区，压缩风筝走廊。
- **加重踩入惩罚**：`CHAPTER2_SAND_PIT_MOVE_PENALTY` `1 → 2`（重度迟滞；完全锁移动是冰霜招牌，沙虫用「深陷」做区分）。静态/动态沙坑共用此惩罚。
- **不被填满**：动态沙坑靠 `remaining` 自清理（每 4 回合潜地刷 2 个、5 回合消失 → 同时活跃约 2~3 个），无需全局上限；静态沙坑保持永久。
- **保留**：潜地→冒出贴脸双倍那套不变（「那一下」是爆发，流沙是常驻压迫，互补）。

## 五、两个数值加料

- 第2章 静态沙坑：`CHAPTER2_SAND_PIT_COUNT` `4 → 5`（开房时刷，永久）。
- 第4章 熔岩潮汐每次焰格：`CHAPTER4_LAVA_TIDE_TILE_COUNT` `3 → 6`（+3）。

## 六、数据模型改动清单

**`PveTypes.ts`**
- `FixedEntityType` 新增 `'ICE_TILE'`（冰面地块，踩上滑行，`remaining` 倒计时）。
- `FloorState` 新增 `fateProphecy?: { center: Coord }`（命运守卫待结算预言）。
- `FloorState` 删除 `playerFreezeRounds`。
- `PveEvent`：新增 `PROPHECY_MARKED{center}` / `PROPHECY_RESOLVED{center}` / `ICE_TIDE_SPAWNED{tiles;duration}` / `SAND_TIDE_SPAWNED{tiles;duration}`；删除 `FREEZE_APPLIED`。

**`PveConstants.ts`**
- 新增：`FROST_GIANT_ICE_RADIUS=1`、`FROST_GIANT_ICE_DURATION=2`、`FATE_PROPHECY_INTERVAL=3`、`FATE_PROPHECY_RADIUS=1`、`FATE_PROPHECY_DAMAGE_MULT=1.0`、`SANDWORM_DYNAMIC_PIT_PER_BURROW=2`、`SANDWORM_DYNAMIC_PIT_DURATION=5`。
- 改值：`CHAPTER2_SAND_PIT_COUNT 4→5`、`CHAPTER2_SAND_PIT_MOVE_PENALTY 1→2`、`CHAPTER4_LAVA_TIDE_TILE_COUNT 3→6`。
- 删除：`FROST_GIANT_FREEZE_ROUNDS`、`FROST_GIANT_AP_PENALTY`、`FATE_GUARDIAN_DODGE_CHANCE`。（`FROST_GIANT_FREEZE_INTERVAL` 保留，复用为冰面生成间隔。）

**逻辑层**
- `bosses/FrostGiant.ts`：删冰冻，新增 `frostIceStep`（铺冰面）。
- `bosses/FateGuardian.ts`：删 `fateGuardianEvade`，新增 `fateProphecyStep` + `isProphecyTurn`。
- `bosses/SandwormQueen.ts`：`sandwormBurrow` 增加动态沙坑生成。
- `CombatSystem.ts`：删命运守卫闪避内联块。
- `MovementSystem.ts`：站冰滑行（多格）。
- `MonsterAI.ts`：FROST_GIANT 接 `frostIceStep`、FATE_GUARDIAN 接 `fateProphecyStep`（前置步）。
- `ExpeditionState.endTurn`：把「LAVA_TILE 倒计时」泛化为「凡带 `remaining` 的实体倒计时移除」（LAVA_TILE 额外踩入扣血）；删冰冻 AP 块。

**渲染/回放**
- `FogMapView.ts`：冰面、命运预言预警圈（3×3）、动态沙坑渲染；删冰冻相关。
- `ExpeditionController.ts`：新事件回放 + 日志文案；删 `FREEZE_APPLIED` 处理。
- `PveHudView.ts`：删冰冻状态指示。

## 七、测试与文档

- `test/pve/FrostGiant.test.ts`：重写为冰面生成 + 滑行（含「站冰滑到边缘」「撞墙停下」「过冲丢失精确间距」）。
- `test/pve/FateGuardian.test.ts`：删闪避用例；新增预言「标记→下回合 3×3 结算伤害」「玩家走出区域则无伤」「保留高血双倍」。
- `test/pve/SandwormQueen.test.ts`：潜地刷动态沙坑、+2AP 惩罚、动态坑倒计时移除。
- `test/pve/MovementSystem*` / `ExpeditionState*`：受影响处更新。
- `npx jest test/pve` 全绿。
- 文档同步：`specs/game-design/Boss设计V1.md`（§三冰霜、§六命运、§三沙虫、§七总表）+ `specs/260608-pve-destiny-expedition/design.md`（§11b Boss 机制）。
