# 260615 · 第4章 Boss「熔岩领主」机制重做

> 状态：设计已确认，进入实现。
> 关联：`specs/game-design/Boss设计V1.md` §五（需同步）、`specs/260608-pve-destiny-expedition/design.md` §11b（需同步）、`specs/260614-boss-anti-kite/design.md`（前置：第4章此前仅熔岩焰格 3→6，未做结构性重做）。
> 实现文件：`assets/scripts/pve/core/bosses/LavaLord.ts`。

## 一、背景

第20层熔岩领主此前机制单调：阶段一只有"普攻附加灼烧"，阶段二只是周期性随机撒 6 个熔岩格。灼烧无上限纯叠加、阶段二随机撒点缺乏方向感，"残血更危险"的体验不明显。

本次重做围绕 4 个机制：
1. 阶段一（HP 100%~50%）：喷发预警——周期性标记区域，下回合生成临时熔岩
2. 阶段二（HP≤50%）：定向熔岩潮汐——从 Boss 所在边整排推进永久熔岩，Boss 站熔岩享受 buff
3. 灼烧终结：熔核爆裂——灼烧叠满阈值强制爆发，限制无脑叠刀
4. 熔岩锁链：反风筝——远离 Boss 过久会被拉近+附加灼烧

## 二、行动优先级（每个 Boss 回合）

1. **喷发标记/结算**（仅阶段一，不占用本回合"行动"，与普攻并行）
2. **熔岩锁链检查**（远离计数器≥3 或 当前距离≥4 → 触发，**替换**本回合普攻，跳过 3-4）
3. **定向潮汐推进**（仅阶段二，周期性）
4. **普通近战 + 灼烧叠加 + 熔核爆裂检查**（`lavaLordAttack`）

## 三、阶段一：喷发预警机制

### 触发与标记

- 触发回合：`turn % LAVA_LORD_ERUPTION_INTERVAL(3) === 0`，仅在 `!lavaLordPhase2` 时生效
- 标记：以玩家**当前格**为中心的 **4×4** 区域（偏移 `x,y ∈ [-1,+2]`，裁剪出图边界），写入 `floorState.lavaEruptionMark = { cells }`，emit `ERUPTION_TELEGRAPHED{cells}`（地图复用 `showAoeWarning` 画预警区）
- 本回合 Boss 仍正常走近战攻击+灼烧叠加流程（标记不占行动）

### 结算

- 下一个 Boss 回合开始时：若 `lavaEruptionMark` 存在 → 在标记 cells 上生成 `LAVA_TILE`（`remaining = LAVA_LORD_ERUPTION_DURATION(3)`），emit `ERUPTION_RESOLVED{tiles, duration}`，清空 `lavaEruptionMark`
- 跳过已被怪物/未消耗实体占据的格子
- 结算后该回合继续正常流程（可能同时是下一次标记回合）

### 实现位置

新增 `lavaEruptionStep(state, bossId)`，作为 `MonsterAI.stepOneMonster` 中 LAVA_LORD 的前置步（"先结算上次标记，再判断本回合是否新标记"，同 `fateProphecyStep` 模式）。

## 四、灼烧终结：熔核爆裂

- 检查时机：`lavaLordAttack` 命中并叠加灼烧后立即检查 `playerBurnRemaining >= LAVA_LORD_BURN_BURST_THRESHOLD(6)`
- 触发效果（emit `BURN_BURST{damage, hp, tiles}`）：
  - `playerBurnRemaining` 清零
  - 造成 `burnStacks × LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK(5)` 点**真实伤害**（不计护甲，可致死）
  - 玩家周围"+"字 4 格生成 `LAVA_TILE`（`remaining = LAVA_LORD_BURN_BURST_TILE_DURATION(3)`，跳过被占用格）
- 普攻每次 +3 层，2 次连续命中（6层）即触发——"贪刀两下不脱离就自伤+周边变雷区"
- 与 `BURN_TICK`（回合开始 DOT）检查时机不同，互不冲突

## 五、阶段二：定向熔岩潮汐

### 进入阶段二（HP/maxHp ≤ `CHAPTER4_LAVA_LORD_PHASE2_HP_RATIO`(0.5)，不可逆）

- 停用喷发：`lavaEruptionStep` 内 `if (lavaLordPhase2) return noop`，已挂起的 `lavaEruptionMark` 直接清空不结算
- 确定方向：取 Boss 当前位置到地图四边的距离，最近一边即为推进起点方向（如 Boss 靠近 x=9 一侧 → `RIGHT`，潮汐从右边界向左推进）；距离相同按 `UP > DOWN > LEFT > RIGHT` 优先级
- 第一排：立即在该边对应整条边界（10格）生成**永久** `LAVA_TILE`（不带 `remaining`），写入 `lavaTideDirection`、`lavaTideRowsAdvanced = 1`，emit `LAVA_TIDE_ROW_SPAWNED{tiles, direction, rowIndex: 1}`

### 后续推进

- 每 `CHAPTER4_LAVA_TIDE_INTERVAL(3)` 个 Boss 回合，若 `lavaTideRowsAdvanced < CHAPTER4_LAVA_TIDE_ROW_MAX(3)`：沿 `lavaTideDirection` 方向再推进一整排，`rowsAdvanced += 1`，emit 同事件（`rowIndex: 2/3`）
- 达到 3 排后停止推进，已生成格子永久保留
- 跳过已被占据的格子，不强制覆盖

### Boss 站熔岩 buff

- 判定：`lavaLordAttack` 计算时检查 `floor.entities` 中是否存在 `type==='LAVA_TILE'` 且 `pos === boss.pos`
- 攻击+1：站熔岩时 `monsterAttack` 前临时 `{ ...boss, attack: boss.attack + LAVA_LORD_LAVA_STAND_ATTACK_BONUS(1) }`
- 减伤20%：`CombatSystem.playerAttack` 命中 `bossId==='LAVA_LORD'` 且 boss 站 `LAVA_TILE` 上时，伤害 `× (1 - LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION(0.2))`，向上取整保留至少1
- Boss 免疫踩入伤害：天然成立——`endTurn` 的 LAVA_TILE 踩入判定只检查 `floorState.player` 位置

### 现有逻辑调整点

`endTurn` 中 LAVA_TILE 的"踩入扣血"判定目前嵌套在 `remaining !== undefined` 倒计时分支内（永久格子无 `remaining`，会被 `continue` 跳过导致踩入不扣血）。需解耦：所有 `LAVA_TILE`（无论是否永久）站上去都扣 `CHAPTER4_LAVA_TILE_DAMAGE`；倒计时移除仅对带 `remaining` 的生效。

## 六、熔岩锁链（反风筝）

- 计数器：`floorState.lavaLordChainCounter`。每个 Boss 回合开始时，若 `manhattan(player, boss) > 1` → `+1`；若 `<=1`（相邻）→ 归零
- 触发条件（任一满足）：`lavaLordChainCounter >= LAVA_LORD_CHAIN_TURN_THRESHOLD(3)` 或当前 `manhattan(player, boss) >= LAVA_LORD_CHAIN_DISTANCE_THRESHOLD(4)`
- 触发效果（替换本回合普攻，emit `LAVA_CHAIN_PULL{from, to, burnTotal}`）：
  - 玩家沿 `boss→player` 方向被拉近 1 格（落点越界/被占据 → 跳过位移，仅附加灼烧）
  - 附加 `LAVA_LORD_CHAIN_BURN_TICKS(2)` 层灼烧（复用熔核爆裂检查：拉拽后若 `playerBurnRemaining>=6` 同样触发 `BURN_BURST`）
  - 触发后 `lavaLordChainCounter = 0`
- 实现位置：新增 `lavaChainStep(state, bossId)`，在 `lavaEruptionStep` 之后、`lavaTideStep`/普攻之前调用；触发则跳过本回合潮汐推进与普攻，**但 Boss 仍朝玩家追击移动一格**（`chaseMoveOnly`，2026-06-16 修正）——否则"Boss 原地不动 → 玩家被拉一格再走开 → 下回合 Boss 仍不动 → 再次锁链"会形成死循环，Boss 实质从不主动逼近。未触发返回 `null` 走正常流程

## 七、数据模型改动清单

### `PveConstants.ts`

新增：
```
LAVA_LORD_ERUPTION_INTERVAL = 3
LAVA_LORD_ERUPTION_DURATION = 3
LAVA_LORD_BURN_BURST_THRESHOLD = 6
LAVA_LORD_BURN_BURST_DAMAGE_PER_STACK = 5
LAVA_LORD_BURN_BURST_TILE_DURATION = 3
CHAPTER4_LAVA_TIDE_ROW_MAX = 3
LAVA_LORD_CHAIN_DISTANCE_THRESHOLD = 4
LAVA_LORD_CHAIN_TURN_THRESHOLD = 3
LAVA_LORD_CHAIN_BURN_TICKS = 2
LAVA_LORD_LAVA_STAND_ATTACK_BONUS = 1
LAVA_LORD_LAVA_STAND_DAMAGE_REDUCTION = 0.2
```

改值：`CHAPTER4_LAVA_TIDE_INTERVAL`(3) 复用作"定向潮汐推进间隔"（值不变）。

删除（不再使用）：`CHAPTER4_LAVA_TIDE_TILE_COUNT`(6)、`CHAPTER4_LAVA_TIDE_DURATION`(2)——原"随机撒点"逻辑被定向整排取代。

### `PveTypes.ts`

- `FloorState` 新增：
  - `lavaEruptionMark?: { cells: Coord[] }`
  - `lavaLordChainCounter?: number`
  - `lavaTideDirection?: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'`
  - `lavaTideRowsAdvanced?: number`
- `lavaTideCounter`（已存在）复用为"距下次推进的回合数"
- `PveEvent` 新增：
  - `{ type: 'ERUPTION_TELEGRAPHED'; cells: Coord[] }`
  - `{ type: 'ERUPTION_RESOLVED'; tiles: Coord[]; duration: number }`
  - `{ type: 'BURN_BURST'; damage: number; hp: number; tiles: Coord[] }`
  - `{ type: 'LAVA_TIDE_ROW_SPAWNED'; tiles: Coord[]; direction: 'UP'|'DOWN'|'LEFT'|'RIGHT'; rowIndex: number }`
  - `{ type: 'LAVA_CHAIN_PULL'; from: Coord; to: Coord; burnTotal: number }`
- 删除：`LAVA_TIDE_SPAWNED`（被 `LAVA_TIDE_ROW_SPAWNED` 取代）

### `ExpeditionState.endTurn`

解耦 LAVA_TILE 踩入判定与 `remaining` 倒计时：所有 `LAVA_TILE`（含永久）踩入即扣 `CHAPTER4_LAVA_TILE_DAMAGE`，倒计时移除仅对带 `remaining` 的生效。

## 八、渲染/回放

- `FogMapView.ts`：
  - `ERUPTION_TELEGRAPHED` → 复用 `showAoeWarning(cells)` 画 4×4 预警区
  - `ERUPTION_RESOLVED` / `LAVA_TIDE_ROW_SPAWNED` → 新增 `LAVA_TILE` 实体走现有"焰"字渲染
  - `BURN_BURST` → 复用 `showAoeHit` 风格短闪 + toast
  - `LAVA_CHAIN_PULL` → 玩家位移动画（同 `KNOCKBACK` 渲染，方向相反）
- `ExpeditionController.ts` / `PveMessageLog.ts`：为 5 个新事件添加战报文案 + 必要 toast（如"🌋 进入熔岩潮汐：地面开始被吞没！"绑定 `LAVA_TIDE_ROW_SPAWNED{rowIndex:1}`）；移除 `LAVA_TIDE_SPAWNED` 分支。

## 九、测试计划

`test/pve/LavaLord.test.ts` 重写覆盖：
1. 喷发标记→下回合生成4×4熔岩（含越界裁剪）
2. 阶段二期间喷发不再标记/结算
3. 熔核爆裂：2次命中触发，清零灼烧+真实伤害+周边生成熔岩
4. 定向潮汐：进入阶段二整排(10格)永久生成，每3回合再推一排，最多3排
5. Boss站熔岩：攻击+1、受击减伤20%、自身踩入不扣血
6. 永久 LAVA_TILE 踩入仍扣玩家血（验证 endTurn 解耦）
7. 熔岩锁链：计数器满3触发 / 距离≥4直接触发，拉近+2层灼烧，替换普攻

受影响测试：`test/pve/ExpeditionState*.test.ts`（LAVA_TILE 解耦逻辑）、`test/pve/MonsterAI*.test.ts`（stepOneMonster 新前置步顺序）。

## 十、文档同步

- `specs/game-design/Boss设计V1.md` §五（第4章 Boss：熔岩领主）整段重写
- `specs/260608-pve-destiny-expedition/design.md` §11b Boss 机制部分同步
