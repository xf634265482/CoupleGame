# 命运守卫机制重做 — Design

> 范围：第 25 层最终 Boss「命运守卫」（FateGuardian）的三段递进重做。
> 关联：[Boss设计V1](../game-design/Boss设计V1.md)、[战斗系统V1](../game-design/战斗系统V1.md)、[260613-chapter25-content-depth](../260613-chapter25-content-depth/design.md)、[260614-boss-anti-kite](../260614-boss-anti-kite/design.md)。
> 决定日期：2026-06-16。

## 一、目标

将 25 层最终 Boss 从"单层机制（高血量×2 + 命运预言 + 跟随型镜像）"升级为**三段递进的最终 Boss 体验**：玩家在每个 HP 阈值都被迫调整策略，残血段（≤30%）从"轻松收尾"变成"全战最紧绷"。

**核心改动**：

1. **行为镜像**（HP ≤ 50%）：替换原"跟随型镜像"为"复制玩家行为"的镜像，攻击/移动/待机各对应一种反制威胁。
2. **狂暴 + 改写命运**（HP ≤ 30%）：新增狂暴态，触发周期性「改写命运」预告——玩家在 5 个事件抽出的 3 个中弃 1，剩 2 个生效。

**不改**：基础数值（HP 1350 / 攻击 135 / 范围 1 / 全图感知）、高血量×2 惩罚机制、命运预言（仅常态/镜像段生效）。

## 二、状态机

| 阶段 | HP 范围 | 已有机制 | 新增/变更 |
|---|---|---|---|
| **常态** | 100% – 50% | 普通近战、高血量×2、命运预言（3×3） | 不变 |
| **镜像段** | 50% – 30% | 上述全部 | **HP 首次跨过 50% 时生成 1 个"行为镜像"**（详见 §3） |
| **狂暴段** | ≤ 30% | 普通近战、高血量×2、行为镜像继承 | **HP 首次跨过 30% 时进入狂暴**：①清空当前未结算的 `fateProphecy`；②停止命运预言（不再触发新标记）；③开启「改写命运」周期（详见 §4） |

**保留约束**：

- 高血量×2（`hpRatio > 0.5` 守卫普攻 ×2）三段全程保留。狂暴段玩家回血回到 50% 以上仍会触发，惩罚"龟"。
- 命运预言（3×3 反风筝）只在常态/镜像段触发；狂暴段被「改写命运」接替。

**跨阈值触发实现锚点**（沿用 GoblinChief 跨狂暴阈值的 `CombatSystem.resolveHit()` 模式）：

- 玩家攻击使 Boss HP **首次**跨过 50% 且未致死 → emit `MIRROR_SPAWNED`，下一次怪物回合 Boss 行动前由 `tryCrossMirrorThreshold()` 生成镜像（`boss.mirrorSpawned=true` 后不再触发）。
- 玩家攻击使 Boss HP **首次**跨过 30% 且未致死 → emit `BOSS_ENRAGED`，写 `boss.enraged=true` + `boss.enrageTurn=floor.turn`，清空 `fateProphecy`。

HP 无回血路径，跨越天然只触发一次，不需要额外 `_triggered` flag。

## 三、行为镜像（HP 跨 50%）

### 3.1 生成时机与数值

- 触发：Boss HP 首次跨过 50% 阈值的那次玩家攻击后，下一次怪物回合 Boss 行动前由 `tryCrossMirrorThreshold()` 生成。
- 位置：Boss 相邻 8 方向空格随机一格（沿用 `adjacentEmptyCells`）。
- **诞生瞬间快照**（玩家强度决定镜像强度）：
  - `mirror.hp = mirror.maxHp = round(player.hp × FATE_MIRROR_HP_FROM_PLAYER)` = round(player.hp × 0.5)
  - `mirror.attack = round(player.attack × FATE_MIRROR_ATK_FROM_PLAYER)` = round(player.attack × 0.5)
  - `mirror.range = 1`、`aggroRadius` 继承 Boss
- 生命周期：可被玩家攻击杀死。HP=0 后**不再复生**，剩余 Boss 战回到"无镜像"状态。

### 3.2 行为复制规则（"忠实镜像" + 攻击需曼哈顿 ≤ 2）

镜像**没有自主 AI**，每个怪物回合按"上个玩家回合玩家做了什么"执行。**三种行为按优先级互斥**（ATTACK > MOVE > IDLE）：

| 玩家本回合状态判定 | 镜像下个怪物回合执行 | 备注 |
|---|---|---|
| **任意一次普攻/技能命中** → ATTACK | 朝玩家发起一次攻击：曼哈顿距离 ≤ 2 命中（按 `mirror.attack` 结算，可被防御减伤）；> 2 空挥 emit `MIRROR_ATTACKED{hit:false}` | 空挥也消耗回合；攻击模式不附带移动 |
| 无攻击 + 净位移 ≥ 1 → MOVE | 朝玩家方向最短路径推进 min(净位移, 实际可走) 格，遇墙/怪/Boss 占位则停 | 与玩家 `MovementSystem` 相同度量 |
| 无攻击 + 净位移 = 0 → IDLE | 获得 1 层护盾，吸收下一次受到的伤害（不叠加，已有时跳过 emit） | 标记在 `mirror.shieldStacks: 0 or 1` |

**优先级理由**：玩家通常一回合既动又打，但"攻击"是最威胁性的行为，镜像反打更符合"行为镜像"叙事；让镜像同时跑+打会导致单回合压力过爆，违反设计意图。

**记账锚点**：玩家结束回合时（`ExpeditionState.endTurn`）由 `recordPlayerActionForMirror()` 判定 ATTACK/MOVE/IDLE 三选一，写入活镜像的 `pendingBehavior: { action; distance }`；镜像下个怪物回合开始时读取并清空。

### 3.3 镜像回合执行顺序（决定性）

1. 若已有 `shieldStacks=1`，本回合维持；护盾消耗由 `CombatSystem.resolveHit` 处理（详见 §3.5）。
2. 按 `pendingBehavior.action` 单一分支执行（ATTACK / MOVE / IDLE）。
3. 清空 `pendingBehavior`，等待玩家下回合再写入。

### 3.4 护盾消耗钩子（CombatSystem.resolveHit）

`CombatSystem.resolveHit` 计算镜像最终扣血前需新增检查：

```
if (target.bossId === FATE_MIRROR_BOSS_ID && target.shieldStacks === 1) {
  target.shieldStacks = 0;
  emit MIRROR_SHIELD_ABSORBED;
  return damage = 0;  // 不扣 HP
}
// 否则正常扣血
```

仅吸收一次伤害，不区分伤害量级。护盾不影响 `pendingBehavior` 流程。

### 3.5 平衡说明

- 攻击 = 玩家攻击 × 0.5 + 曼哈顿 ≤ 2 才命中：玩家可以站到镜像 3 格外让它空挥，这是策略反制窗口。
- HP = 玩家 HP × 0.5：镜像难度自适应玩家强度——强玩家面对强镜像，弱玩家面对弱镜像。
- 护盾不叠加：避免"连等 3 回合喂 3 层盾"。

## 四、改写命运（HP 跨 30% / 狂暴段）

### 4.1 触发节奏

- HP 首次跨过 30% → emit `BOSS_ENRAGED`、清空 `fateProphecy`、写 `boss.enrageTurn = floor.turn`。
- 之后每 **3 个怪物回合**（`DESTINY_REWRITE_INTERVAL`）触发一次「改写命运」预告。首次触发 = 狂暴回合的下一个 Boss 回合。
- 与命运预言互斥（狂暴段永不再触发预言）。

### 4.2 5 选 3 弃 1 流程（三段时序）

```
Boss 改写命运预告回合（T0 = 怪物回合）
  ├─ RNG 从 5 个事件池中抽 3 个（不重复）
  ├─ emit DESTINY_REWRITE_OFFERED{ drawn: [a,b,c] }
  └─ 写入 floor.pendingDestinyRewrite = { drawn, removed: null, offeredAtTurn }

玩家回合（T1）
  ├─ Controller 弹阻塞模态显示 a/b/c 三个选项
  ├─ 玩家点击其中 1 个 → 视为"弃掉"
  ├─ 调 chooseDestinyRewrite(state, removedIndex) → emit DESTINY_REWRITE_CHOSEN
  ├─ 模态关闭，玩家正常进行回合（可走/打/逃跑）
  └─ 玩家结束回合

Boss 改写命运结算回合（T2 = 下个怪物回合）
  ├─ 读取 floor.pendingDestinyRewrite.{drawn, removed}
  ├─ 剩余 2 个事件按固定序结算（见 §4.4）
  ├─ emit DESTINY_REWRITE_RESOLVED{ executed: [...] }
  └─ 清空 pendingDestinyRewrite
```

**异常处理**：若玩家 T1 回合内死亡 / 通关 → 直接清空 `pendingDestinyRewrite`，不再结算（与 Boss 死亡同步）。

### 4.3 5 个事件池

| 编号 | 事件 | 效果 |
|---|---|---|
| E1 | **Boss 回血** | `boss.hp = min(maxHp, hp + round(maxHp × DESTINY_HEAL_RATIO))` = +10% maxHp |
| E2 | **Boss 加伤害** | 写入 `boss.attackBuffPct = DESTINY_ATK_BUFF_PCT (30)`、`boss.attackBuffExpiresAtTurn = floor.turn + DESTINY_ATK_BUFF_DURATION_TURNS (3)`（`floor.turn` 是怪物回合计数器）；普攻 / 镜像攻击 / 下次 5×5 爆炸都吃 buff |
| E3 | **玩家扣血** | `player.hp -= round(boss.attack × DESTINY_DIRECT_DMG_MULT (1.0))`，无视防御，可致死 |
| E4 | **5×5 爆炸**（中心 = Boss 当前格） | 玩家若与 Boss 切比雪夫距离 ≤ DESTINY_5X5_RADIUS (2) → `player.hp -= round(boss.attack × DESTINY_5X5_DMG_MULT (1.2))`；无论命中均 emit `DESTINY_5X5_EXPLODED{center}` 供渲染 |
| E5 | **命运封锁** | 玩家下个玩家回合 `currentAp = max(1, floor(currentAp / 2))`；标记在 `floor.destinyLockNextTurn = true`，AP 系统结算后清空 |

### 4.4 结算执行顺序（固定序，保证决定性）

按 **E5 → E4 → E3 → E1 → E2** 结算：

1. **E5 命运封锁**最先：影响下回合玩家 AP，不影响本回合结算。
2. **E4 5×5 爆炸**：用当前 `boss.attack`（还没吃 E2 buff）。
3. **E3 玩家扣血**：用当前 `boss.attack`（还没吃 E2 buff）。
4. **E1 Boss 回血**：在伤害结算后回血，避免"玩家击杀 + Boss 回血复活"歧义。
5. **E2 Boss 加伤害**：最后写入 buff，影响下个 Boss 回合起的普攻 / 镜像 / 下次 5×5。

如果 E3+E4 都上场，玩家可能一回合掉 (1.0 + 1.2) × `boss.attack` ≈ 297 血（按 Boss 攻击 135 计）。狂暴段玩家通常 HP < 400，"残血更危险"原则落地。

### 4.5 阻塞模态 UI 简述

详细 UI 在 Controller/View 实现，design 仅约束：

- 触发：controller 收到 `DESTINY_REWRITE_OFFERED` → 暂停玩家输入 → 显示模态。
- 模态内容：标题"改写命运" + 副标题"舍弃一个未来" + 3 个事件卡片（图标 + 名称 + 简短文案）。
- 点击某卡片 → 调 `chooseDestinyRewrite(removedIndex)` → 模态关闭 → 主战报 toast 提示"已舍弃 XXX"。
- 不可取消、不可关闭（除非玩家死亡 / 退出 Boss 战）。

## 五、数据结构

### 5.1 Monster 字段扩展（`assets/scripts/pve/core/PveTypes.ts`）

```ts
interface Monster {
  // ...现有字段

  // 行为镜像专属（仅 FATE_MIRROR）
  pendingBehavior?: { action: 'ATTACK' | 'MOVE' | 'IDLE'; distance: number };
  shieldStacks?: 0 | 1; // 不叠加

  // FATE_GUARDIAN 专属
  attackBuffPct?: number;          // E2 改写命运加伤
  attackBuffExpiresAtTurn?: number;
  mirrorSpawned?: boolean;         // 跨 50% 已生成过镜像（死后不复生用）
  enraged?: boolean;               // 跨 30% 已进入狂暴
  enrageTurn?: number;             // 狂暴起始 turn（计算改写命运周期用）
}
```

### 5.2 FloorState 字段扩展

```ts
interface FloorState {
  // ...现有字段
  pendingDestinyRewrite?: {
    drawn: [1|2|3|4|5, 1|2|3|4|5, 1|2|3|4|5]; // 抽到的 3 个事件编号
    removed: 0 | 1 | 2 | null;                 // 玩家弃哪个（null=待选）
    offeredAtTurn: number;                     // 触发的怪物回合
  };
  destinyLockNextTurn?: boolean;               // E5 命运封锁标记
}
```

### 5.3 新增常量（`assets/scripts/pve/core/PveConstants.ts`）

```ts
// 行为镜像（替换现有 CHAPTER5_MIRROR_*）
export const FATE_MIRROR_SPAWN_HP_RATIO = 0.5;           // 由 0.33 → 0.5
export const FATE_MIRROR_HP_FROM_PLAYER = 0.5;           // 玩家 HP × 0.5
export const FATE_MIRROR_ATK_FROM_PLAYER = 0.5;          // 玩家 attack × 0.5
export const FATE_MIRROR_ATTACK_RANGE = 2;               // 曼哈顿距离 ≤ 2 命中
// 删除：CHAPTER5_MIRROR_HP / CHAPTER5_MIRROR_SPAWN_HP_RATIO / CHAPTER5_MIRROR_ATTACK_MULT

// 狂暴 & 改写命运
export const FATE_ENRAGE_HP_RATIO = 0.3;
export const DESTINY_REWRITE_INTERVAL = 3;               // 每 3 个怪物回合
export const DESTINY_REWRITE_POOL_SIZE = 5;
export const DESTINY_REWRITE_DRAW_SIZE = 3;
export const DESTINY_HEAL_RATIO = 0.10;                  // E1 = maxHp × 10%
export const DESTINY_ATK_BUFF_PCT = 30;                  // E2 = +30%
export const DESTINY_ATK_BUFF_DURATION_TURNS = 3;        // E2 持续 3 个 Boss 回合
export const DESTINY_DIRECT_DMG_MULT = 1.0;              // E3 = atk × 1.0
export const DESTINY_5X5_RADIUS = 2;                     // 切比雪夫 ≤ 2
export const DESTINY_5X5_DMG_MULT = 1.2;                 // E4 = atk × 1.2
// E5 命运封锁 AP 减半逻辑硬编码在 ApSystem，无独立常量
```

## 六、新事件（`PveEvent` 联合扩展）

```ts
| { type: 'MIRROR_BEHAVIOR_QUEUED'; action: 'ATTACK'|'MOVE'|'IDLE'; distance: number }
| { type: 'MIRROR_MOVED'; from: Coord; to: Coord }
| { type: 'MIRROR_ATTACKED'; targetId: 'PLAYER'; hit: boolean; damage: number; hp: number }
| { type: 'MIRROR_SHIELDED' }
| { type: 'MIRROR_SHIELD_ABSORBED' }                    // 护盾吸了一次伤害
| { type: 'DESTINY_REWRITE_OFFERED'; drawn: [number, number, number] }
| { type: 'DESTINY_REWRITE_CHOSEN'; removedIndex: 0|1|2 }
| { type: 'DESTINY_REWRITE_RESOLVED'; executed: number[] }
| { type: 'DESTINY_HEAL'; amount: number; bossHp: number }
| { type: 'DESTINY_ATK_BUFF'; pct: number; expiresAtTurn: number }
| { type: 'DESTINY_DIRECT_DAMAGE'; damage: number; hp: number }
| { type: 'DESTINY_5X5_EXPLODED'; center: Coord; damage: number; hp: number }
| { type: 'DESTINY_AP_LOCKED'; nextTurnAp: number }
```

复用 `BOSS_ENRAGED`、`MIRROR_SPAWNED`（已存在）。

## 七、模块拆分（FateGuardian.ts）

新增/改写以下纯函数，全部返回 `ApplyResult`、决定性、用 `createRng(floor.rngState)`：

- `tryCrossMirrorThreshold(state, bossId)` — Boss HP 跨 50% 时生成镜像（含数值快照），写 `boss.mirrorSpawned=true`；已 true 或镜像还活着则 noop。
- `recordPlayerActionForMirror(state, action, distance)` — `endTurn` 收尾时由 `ExpeditionState` 调用，写入活镜像的 `pendingBehavior`。
- `mirrorBehaviorStep(state, mirrorId)` — MonsterAI 调度镜像回合时调用，执行 §3.3 顺序。
- `tryCrossEnrageThreshold(state, bossId)` — Boss HP 跨 30% 时写 `boss.enraged=true`、`enrageTurn`、清空 `fateProphecy`。
- `tryOfferDestinyRewrite(state, bossId)` — 狂暴态每 `DESTINY_REWRITE_INTERVAL` 个怪物回合从 5 池中抽 3，写入 `pendingDestinyRewrite`。
- `chooseDestinyRewrite(state, removedIndex)` — 玩家点击模态后调用，写入 `pendingDestinyRewrite.removed`。
- `resolveDestinyRewrite(state, bossId)` — 下个 Boss 回合按 §4.4 顺序结算剩余 2 个事件。

**改写**：

- `fateGuardianAttack` — 用 `boss.attackBuffPct` 计算最终伤害（吃 E2 buff）。
- `isProphecyTurn` — 在 `boss.enraged=true` 时直接返回 false（防御性双保险）。
- 删除原 `spawnFateMirror`（被 `tryCrossMirrorThreshold` 替代，逻辑不同：阈值改了、数值改了、镜像类型改了）。

## 八、MonsterAI 调度顺序（FATE_GUARDIAN 怪物回合）

```
1. tryCrossEnrageThreshold       // 幂等；战斗系统已 emit 过 BOSS_ENRAGED 时此处只清字段
2. tryOfferDestinyRewrite         // 狂暴态周期到位则抽 3
3. resolveDestinyRewrite          // 若 pendingDestinyRewrite.removed 非 null → 结算剩余 2
4. fateProphecyStep               // 仅非狂暴态触发；boss.enraged=true 时早返回
5. tryCrossMirrorThreshold        // 未生成过镜像 + HP ≤ 50% 时生成
6. fateGuardianAttack             // 普攻（吃 attackBuffPct）

镜像（FATE_MIRROR）独立调度：MonsterAI 迭代 monsters 列表时遇到镜像调 mirrorBehaviorStep
```

## 九、Controller / View 改动

### 9.1 ExpeditionController.ts

- 监听 `DESTINY_REWRITE_OFFERED` → 暂停输入 + 显示模态（新 UI 组件 `DestinyRewriteModal`）。
- 模态回调 → 调 `chooseDestinyRewrite(state, removedIndex)` → emit `DESTINY_REWRITE_CHOSEN` → 关闭模态。
- 监听新增 `MIRROR_*` / `DESTINY_*` 事件 → 调 `PveMessageLog` 输出战报文案 + 调 `PveToastView` toast。

### 9.2 FogMapView.ts

- 镜像渲染：继承 Boss 图标样式（或独立"镜像"占位），HP 条沿用怪物通用样式。
- 5×5 爆炸预警：玩家弃 1 后若 E4 在剩余 2 个内 → 下个 Boss 回合开始前在 Boss 当前格周围切比雪夫 ≤ 2 区域刷红色高亮，类似现有 `fateProphecy` 渲染。
- 护盾标记：镜像头顶画蓝色盾形（仅 `shieldStacks=1` 时）。

### 9.3 战报文案（PveMessageLog）

| 事件 | 文案 |
|---|---|
| `MIRROR_SPAWNED` | "🪞 行为镜像现身！" |
| `MIRROR_BEHAVIOR_QUEUED` (ATTACK) | "镜像记下了你的攻击" |
| `MIRROR_BEHAVIOR_QUEUED` (MOVE) | "镜像记下了你的步伐" |
| `MIRROR_BEHAVIOR_QUEUED` (IDLE) | "镜像记下了你的停顿" |
| `MIRROR_ATTACKED{hit:true}` | "镜像反打：玩家 -{damage}" |
| `MIRROR_ATTACKED{hit:false}` | "镜像空挥" |
| `MIRROR_MOVED` | "镜像追了上来" |
| `MIRROR_SHIELDED` | "镜像凝出护盾" |
| `MIRROR_SHIELD_ABSORBED` | "镜像护盾化解一击" |
| `BOSS_ENRAGED` (Boss=FATE_GUARDIAN) | "命运守卫狂暴：开始改写命运" |
| `DESTINY_REWRITE_OFFERED` | "改写命运 · 3 选 1 弃" |
| `DESTINY_REWRITE_CHOSEN` | "已舍弃：{事件名}" |
| `DESTINY_HEAL` | "Boss 回血 +{amount}" |
| `DESTINY_ATK_BUFF` | "Boss 攻击 +{pct}%" |
| `DESTINY_DIRECT_DAMAGE` | "命运一击：玩家 -{damage}" |
| `DESTINY_5X5_EXPLODED` (hit) | "命运爆炸：玩家 -{damage}" |
| `DESTINY_5X5_EXPLODED` (miss) | "命运爆炸（已规避）" |
| `DESTINY_AP_LOCKED` | "命运封锁：下回合 AP → {nextTurnAp}" |

## 十、测试覆盖（`test/pve/FateGuardian.test.ts` 扩展）

新增分组：

- **镜像生成阈值**：HP 跨 50% 触发 `MIRROR_SPAWNED`；跨 30% 不再触发；HP 一次直接跨过 50% 和 30% → 两阶段都触发。
- **镜像数值快照**：玩家 HP=200/atk=40 → 镜像 HP=100/atk=20；玩家 HP=80/atk=40 → 镜像 HP=40/atk=20。
- **行为复制 - 攻击**：玩家攻击 + 曼哈顿距离 1/2/3 三种情况 → 镜像下回合命中/命中/空挥。
- **行为复制 - 移动**：玩家走 1 / 2 / 撞墙三种情况。
- **行为复制 - 待机**：玩家不动不打 → 镜像获盾 → 玩家攻击吸掉。
- **镜像死亡不复生**：打死镜像后 Boss 后续回合不再生成。
- **狂暴跨阈值**：HP 跨 30% → `BOSS_ENRAGED` + `fateProphecy=undefined`。
- **狂暴后预言停摆**：狂暴态多回合内 `isProphecyTurn` 始终不触发。
- **改写命运周期**：狂暴起 +0/+3/+6 怪物回合触发预告。
- **5 抽 3 RNG 决定性**：同 seed 抽到的 3 个事件相同。
- **玩家弃 1 流程**：`chooseDestinyRewrite(removedIndex)` 写入正确 → 下个 Boss 回合 `resolveDestinyRewrite` 执行剩余 2 个。
- **结算顺序**：E3+E4 同时上场 → 用 buff 前的 `boss.attack` 计算（E2 之后不影响本次）。
- **E4 5×5 命中判定**：Boss 在 (5,5)，玩家在 (3,3) → 切比雪夫 2 命中；玩家在 (2,2) → 切比雪夫 3 不命中。
- **E5 AP 减半**：`currentAp=3` → 下回合=1（floor(3/2)）；`currentAp=1` → 下回合=1（最小保留）。
- **跨端确定性**：同 seed 完整跑一遍 Boss 战，所有事件序列一致（AC-13 保持）。

## 十一、AC 验收

| 编号 | 验收项 |
|---|---|
| AC-FG-01 | Boss HP 跨 50% 时生成行为镜像，HP / 攻击 = 玩家快照 × 0.5 |
| AC-FG-02 | 镜像下个怪物回合按"上回合玩家行为"执行（攻击/移动/待机三种分支） |
| AC-FG-03 | 镜像攻击曼哈顿 > 2 时空挥 |
| AC-FG-04 | 镜像被击杀后剩余 Boss 战不复生 |
| AC-FG-05 | Boss HP 跨 30% 时进入狂暴，清空命运预言，预言此后不再触发 |
| AC-FG-06 | 狂暴起每 3 个怪物回合触发改写命运预告（5 抽 3） |
| AC-FG-07 | 改写命运为阻塞模态，玩家弃 1，下个 Boss 回合按 E5→E4→E3→E1→E2 顺序结算剩 2 |
| AC-FG-08 | 5×5 爆炸中心 = Boss 当前格，切比雪夫 ≤ 2 命中 |
| AC-FG-09 | 同 seed 下镜像行为、改写命运抽牌、5×5 命中均可复算（AC-13 保持） |
| AC-FG-10 | 高血量×2 在三段全程保留；命运预言仅在常态/镜像段触发 |
| AC-FG-11 | 战报系统新增事件均有中文文案（见 §9.3） |

## 十二、文档同步清单

- `specs/game-design/Boss设计V1.md` §五 命运守卫整段重写
- `specs/balance-reference.md` §11 命运守卫数值表更新
- `specs/260608-pve-destiny-expedition/design.md` 第 5 章 Boss 部分更新
- `specs/260614-boss-anti-kite/design.md` 命运守卫部分加注"狂暴后预言停用"
- `specs/game-design/战斗系统V1.md` §九战报新事件文案

## 十三、不在本批范围

- 镜像视觉模型/动画（design 仅约束逻辑，View 层文案/动画用占位实现）
- 改写命运模态的美术（用 PveCharacterPanel 风格占位）
- 难度选择（普通/困难下数值调整）
- 跨章节复用"行为镜像"为通用机制（仅作命运守卫专属）
- 服务端校验 `pendingDestinyRewrite` 状态序列化（client-only，存档时序列化即可，云端不二次校验机制）
