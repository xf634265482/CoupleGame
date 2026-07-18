# 命痕改动与扩容设计 V3 — 实现规格

> 日期：2026-07-18  
> 来源：`塔塔远征团-命痕改动与扩容设计V3.md`  
> 权威玩法目录：`specs/260712-pve-persistent-floor-progression/minghen-catalog.md`  
> 状态：设计已确认，待实现计划

## 1. 目标与范围

### 1.1 目标

将命痕正式定位为**玩家永久解锁的战术工具箱**，按 V3：

- 调整文档明确改动的命痕（M08 III、M22、M25–M38）
- 新增 M39–M56
- 未在 V3 出现的命痕（M01–M07、M09–M21、M23–M24）**保持不变**

### 1.2 本轮包含

- `MinghenEventContext` / hooks / effect result 的最小化通用扩展
- `MinghenCatalog`、`MinghenEffects`、相关 bridge、试炼文案
- 单测（喂上下文验证完整机制）
- 同步 `minghen-catalog.md` 与主设计命痕相关段落

### 1.3 本轮不包含

- 楼层设计、主题池掉落接入、关卡强制依赖某命痕
- 新地形/护送/预警实体的大批量落地（只留标签接口；沙坑/沙暴等已有实例继续作为标签来源）
- 将机制简化为同质化条件增伤

### 1.4 已确认决策

| 决策 | 选择 |
|---|---|
| 楼层依赖命痕（M31/M46/M50/M51 等） | 完整逻辑 + 通用上下文；楼层暂不接入；单测喂上下文 |
| M39–M56 来源/试炼 | `sourceFloor = 0` 占位 + 可测试炼文案；不改各层主题池 |
| 实现架构 | 上下文扩展 + 统一 `resolveMinghenEffects`（不拆多模块、不全 stub） |

---

## 2. 性能与架构约束

### 2.1 允许复用

主动攻击/命中/击杀/移动、回合开始/结束、受伤、治疗/护盾、异常施加与结算、强制位移与碰撞、危险地形与环境伤害、职业爆发、任务交互、事件触发时的固定范围局部格子查询。

### 2.2 禁止

- 每帧扫描棋盘或全部敌人
- 长行为历史、完整移动轨迹、多目标攻击序列历史
- 独立命痕能量槽、大量临时战场实体、独立寻路

局部查询仅在事件触发时执行（邻格、玩家相邻、固定 2 格范围）。

### 2.3 架构选择

在现有事件驱动命痕上做最小化扩展：

```
战斗/移动/受伤等事件
  → bridge 填充 MinghenEventContext（含局部查询与关卡标签）
  → resolveMinghenEffects(loadout, context, memory)
  → MinghenEffectResult + flags
  → bridge 应用护盾/次生伤害/异常副作用（次生 source = MINGHEN_SECONDARY，不递归）
```

---

## 3. 事件与上下文扩展

### 3.1 Hooks

复用现有：

`TURN_START`, `TURN_END`, `BEFORE_MOVE`, `AFTER_MOVE`, `BEFORE_ATTACK`, `AFTER_ATTACK`, `BEFORE_HIT`, `AFTER_HIT`, `KILL`, `DAMAGED`, `HEALED`, `SHIELD_BROKEN`, `STATUS_APPLIED`, `STATUS_KILL`, `COLLISION`, `SPIRIT_BURST`

**仅新增 1 个 hook：**

- `TASK_INTERACT` — 任务交互 AP 结算（M51）

强制位移不新增 hook：在现有位移/受击路径填充 `forcedDisplaceDistance` / `collisionDamage`。

### 3.2 `MinghenEventContext` 新增可选字段

| 字段 | 用途 |
|---|---|
| `adjacentEnemyCount` | 玩家相邻敌人数（脱围、近拒、急行…） |
| `targetAdjacentEnemyCount` | 攻击目标相邻其他敌人数（孤锋、密阵） |
| `enemiesInRange2` | 玩家周围 2 格敌人数（休整、急行 II） |
| `adjacentToBlocking` | 玩家是否邻接墙/阻挡（掩护） |
| `targetAdjacentToBlocking` | 目标是否邻接墙/阻挡（壁压） |
| `onExtraMoveCostTerrain` / `extraMoveApCost` | 轻足 |
| `environmentDamage`；`source: 'ENVIRONMENT'` | 抗灾（沙暴等归类） |
| `inTaskObjectiveZone` | 抢位 |
| `isTaskInteract` | 巧手 |
| `escortUnitInRange2` / `damageTargetIsEscort` | 护行 |
| `forcedDisplaceDistance` / `collisionDamage` | 抗冲 |
| `inDangerTerrain` / `inAttackWarningZone` | 险击 |
| `targetHasArmor` / `targetTier` (`NORMAL` \| `ELITE` \| `BOSS`) | 破甲、清杂、斩首 |
| `effectiveHealing` | 续命 |
| `shieldBefore` / `shieldBrokenThisTurn` | 凝甲、护棘 |
| `playerStatusDuration` / `playerStatusNumericEffect` | 定心 |
| `attackHadCollision` | 壁压 III |
| `bleedTriggeredByMove` | 毒血 |
| `actualDamageBeforeMitigation` | 止损计算用（可选） |

### 3.3 `MinghenEffectResult` 最小化扩展

| 字段 | 用途 |
|---|---|
| `damageReductionRatio` | 护行/掩护等比例减伤 |
| `forcedDisplaceReduction` | 抗冲位移格数减免 |
| `transferDamageRatio` / `transferMaxTargets` | 密阵 |
| `consumeShieldRatioOfMaxHp` / `shieldToDamageRatio` / `refundConsumedShieldRatio` | 护棘 |
| `overflowDamageReductionRatio` | 止损：超过阈值部分的减免比例 |

既有 flags 继续承载状态机副作用；新增 flags 示例：

- `EXTEND_SINGLE_STATUS`
- `CONVERT_BURN_CHILL`
- `EXTRA_POISON_ON_BLEED_MOVE`
- `STORE_AFTERMATH_STATUS` / `APPLY_AFTERMATH_STATUS`
- `MITIGATE_OVERFLOW_DAMAGE`

次生伤害：`source: 'MINGHEN_SECONDARY'`，不得再次触发命痕。

### 3.4 桥接

- 将 `SandMinghenBridge` 泛化为「额外移动消耗地形」+「环境伤害」API；沙坑/沙暴继续走同一入口
- `MinghenCombatBridge` / runtime 在 MOVE/ATTACK/DAMAGED/HEALED 等时点填充邻格计数与标签
- 纯函数查询（如 `countAdjacentEnemies`、`isAdjacentToBlocking`）供桥接与单测共用
- 楼层只负责打标签：`inTaskObjectiveZone`、`isTaskInteract`、`escort*`、`inAttackWarningZone` 等；本轮不改掉落池

### 3.5 统一定义（写入 catalog 全局规则）

- **额外移动消耗地形**：进入时产生额外移动 AP 消耗的地形（沙坑、泥地、积雪、废墟、藤蔓等）
- **环境伤害**：关卡周期性/区域性环境伤害（沙暴、毒雾、火雨、寒潮等），`source: 'ENVIRONMENT'`
- **任务目标区域**：特殊关卡统一区域标签（占点、守点、机关操作区、爆破区等）
- **任务交互**：关卡目标系统统一标记的交互；命痕不得自行识别具体机关类型
- **危险地形**：沿用 catalog 既有定义；险击同时接受 `inAttackWarningZone`

---

## 4. 现有命痕调整

ID 不变（存档无需迁移）；改名同步 Catalog / Display / catalog.md。

### 4.1 M08 地脉

- I/II 不变
- III：地脉强化攻击命中后，获得最大生命 6% 的护盾（取消复制地形异常/地形伤害）

### 4.2 M22 行云 → 脱围

| 级 | 效果 |
|---|---|
| I | 玩家回合开始时若相邻敌人 ≥2，本回合第一次主动移动 AP−1（最低 1） |
| II | 使用该减费移动并成功脱离所有敌人邻接后，获得最大生命 5% 护盾 |
| III | 成功脱离后，下一次主动攻击最终伤害 +15% |

### 4.3 M25 沙行 → 轻足

| 级 | 效果 |
|---|---|
| I | 进入额外移动消耗地形时，额外 AP 消耗 −1（最低额外 0） |
| II | 每回合第一次进入此类地形时，完全免除该次额外 AP 消耗 |
| III | 从此类地形发起主动攻击时，本回合第一次主动攻击最终伤害 +15% |

### 4.4 M26 抗暴 → 抗灾

| 级 | 效果 |
|---|---|
| I | 受到环境伤害时，伤害降低 30% |
| II | 降低比例提高至 50% |
| III | 受到环境伤害后，下一次主动攻击最终伤害 +20% |

### 4.5 M27 蚀印（重定义）

| 级 | 效果 |
|---|---|
| I | 目标只拥有 1 种异常时，再次施加相同异常，额外 +1 层；每个目标每回合最多一次 |
| II | 主动攻击已经达到该异常层数上限的目标时，获得 20% 护甲穿透 |
| III | 本回合第一次攻击满层单异常目标时，该异常持续时间 +1 |

与催化差异：催化鼓励多异常；蚀印鼓励单异常专精。

### 4.6 M28 寒燃（重定义）

| 级 | 效果 |
|---|---|
| I | 对冰寒目标施加灼烧，或对灼烧目标施加冰寒：消耗原异常 1 层；追加玩家攻击快照 30% 次生伤害；每目标每回合最多一次 |
| II | 本次新施加的异常额外 +1 层（不超过上限） |
| III | 寒燃转换追加伤害提高至攻击快照 50% |

### 4.7 M29 毒血（重定义）

| 级 | 效果 |
|---|---|
| I | 同时拥有流血和中毒的敌人主动移动并触发流血时，额外结算 1 层中毒；每目标每回合最多一次 |
| II | 目标第一次同时拥有流血和中毒时，两种异常持续时间各 +1 |
| III | 毒血额外结算完成击杀时，获得 10% 灵气 |

### 4.8 M30 余疫（重定义）

| 级 | 效果 |
|---|---|
| I | 异常目标死亡时记录层数最高的一种异常；玩家下一次主动攻击其他目标时施加该异常 1 层；同时最多保存一种 |
| II | 施加层数提高至 2 |
| III | 携带余疫效果的主动攻击最终伤害 +15% |

### 4.9 M31 借势 → 抢位

| 级 | 效果 |
|---|---|
| I | 每回合第一次进入任务目标区域时，获得最大生命 5% 护盾 |
| II | 进入任务目标区域后，下一次主动攻击最终伤害 +15% |
| III | 玩家回合结束时仍位于任务目标区域，获得 10% 灵气 |

### 4.10 M32 断拍 → 整备

| 级 | 效果 |
|---|---|
| I | 玩家回合结束时若本回合未受实际伤害，下一回合开始获得最大生命 4% 护盾 |
| II | 护盾提高至最大生命 6% |
| III | 该护盾仍存在时，本回合第一次主动移动 AP−1（最低 1） |

### 4.11 M33 灵涌

| 级 | 效果 |
|---|---|
| I | 每回合第一次主动击杀敌人时，获得 5% 灵气 |
| II | 提高至 8% |
| III | 每层第一次释放职业爆发结束后，获得 1 临时 AP |

### 4.12 M34 护棘（重定义）

| 级 | 效果 |
|---|---|
| I | 最终 AP 消耗 ≥3 的主动攻击发动时若有护盾：最多消耗最大生命 5% 的当前护盾；追加实际消耗护盾 ×150% 的次生伤害 |
| II | 最大护盾消耗提高至最大生命 8%，转化率 180% |
| III | 护棘强化攻击完成主动击杀时，返还本次实际消耗护盾的 50% |

### 4.13 M35 裂盾 → 凝甲

| 级 | 效果 |
|---|---|
| I | 玩家回合结束时若当前护盾 ≥ 最大生命 8% 且本回合护盾未被击破：下一回合第一次主动移动 AP−1 |
| II | 下一回合第一次主动攻击同时获得 20% 护甲穿透（与移动减费独立结算） |
| III | 下一回合结束时若仍然拥有护盾，获得 10% 灵气 |

### 4.14 M36 续命

| 级 | 效果 |
|---|---|
| I | 生命不高于 40% 时获得治疗，额外获得相当于有效治疗量 40% 的护盾 |
| II | 提高至有效治疗量 60% |
| III | 由续命产生的护盾存在时，第一次主动攻击最终伤害 +15% |

### 4.15 M37 破釜 → 止损

| 级 | 效果 |
|---|---|
| I | 每回合第一次受到超过最大生命 20% 的单次实际伤害时，超过 20% 的部分降低 30% |
| II | 降低比例提高至 50% |
| III | 触发止损后，下一次主动移动 AP−1（最低 1） |

### 4.16 M38 追击 → 疾退

| 级 | 效果 |
|---|---|
| I | 主动击杀敌人后，本回合下一次主动移动 AP−1；每回合最多触发一次 |
| II | 若当前回合未使用该减费效果，可保留至下一玩家回合 |
| III | 完成该减费移动后，获得最大生命 5% 护盾 |

试炼文案按新机制重写为可测语句；**不改楼层主题池中的命痕 ID 列表**。

---

## 5. 新增命痕 M39–M56

- `sourceFloor = 0`（未分配）
- 不写入各层主题池
- 每枚提供可测升格试炼文案

| ID | 名 | 定位 | I → II → III 摘要 |
|---|---|---|---|
| M39 | 孤锋 | 孤立目标 | 攻击邻敌=0 目标 +18% → +25% → 击杀孤立 +10% 灵气 |
| M40 | 壁压 | 墙体压制 | 邻墙目标 15%→25% 穿透；III 同次碰撞 → 攻击快照 20% 次生 |
| M41 | 密阵 | 密集敌群 | 目标邻敌≥2 时传递实际伤害 20%→30% 给 1 邻敌；III 最多 2；次生不触发命痕 |
| M42 | 破甲 | 高护甲 | 每回合首次对有护甲目标 25%→35% 穿透；III 命中后最大生命 4% 护盾 |
| M43 | 清杂 | 普通怪续航 | 每回合首次击杀 NORMAL → 护盾 5%→8%；III 同回合第 2 杀再 +5% |
| M44 | 斩首 | 精英/Boss | 每回合首次攻击 ELITE/BOSS +15% → +20%且 15% 穿透；III 目标≤30% HP 再 +10% |
| M45 | 抢时 | 前两回合 | 前两玩家回合：首次移动减费 → 首次攻击 +15% → 首次击杀 5% 护盾 |
| M46 | 护行 | 护送 | 护送单位距离≤2：该单位每回合首次受伤 −20%→−30%；III 触发后玩家 4% 护盾 |
| M47 | 轻重 | 低费接高费 | 同回合 AP≤2 攻击后再 AP≥3 攻击：第二次 +25%→+35%；III 再 20% 穿透 |
| M48 | 定心 | 异常压力 | 每回合首次获持续异常：持续 −1（最低 1）→ 首次数值效果 −30% → 触发后下次攻击 +15% |
| M49 | 终结 | 残血 | 目标 HP≤25%/35% 时 +20%；III 强化击杀恢复 1 AP（每回合最多一次） |
| M50 | 险击 | 高风险区 | 危险地形或攻击预警区：本回合首次攻击 +20%→+30%；III 命中后 5% 护盾 |
| M51 | 巧手 | 任务交互 | 每回合首次任务交互 AP−1 → 完成后 5% 护盾 → 下次攻击 +15% |
| M52 | 抗冲 | 强制位移 | 每回合首次强制位移距离 −1（最低 0）→ 碰撞伤害 −50% → 最终距离 0 时 5% 护盾 |
| M53 | 近拒 | 贴身应对 | 回合开始有邻敌：首次攻击邻敌 +15% → 命中后 4% 护盾 → 目标未死则下次移动 AP−1 |
| M54 | 休整 | 脱离恢复 | 每层最多一次：回合结束时周围 2 格无敌人 → 回血 10%→15%；III 另 +10% 灵气 |
| M55 | 急行 | 快速移动 | 回合开始无邻敌：首次移动 AP−1；II 若 2 格内无敌人则前两次均减费；III 累计主动移动≥4 格 → 5% 护盾 |
| M56 | 掩护 | 邻墙减伤 | 邻墙时每回合首次实际伤害 −15%→−25%；III 触发后下次攻击 15% 穿透 |

护送关卡不得按「必须拥有护行才能正常通关」设计（设计红线，楼层文档后续遵守）。

### 5.1 数值口径澄清（避免实现歧义）

| 口径 | 约定 |
|---|---|
| 「X% 灵气」 | 与现有 `spiritGain` 一致：灵气槽按 100 满槽计，`spiritGain += X`（即 X 点 = X%） |
| M49 II | 仅将生命阈值从 25% 提高至 35%；最终伤害加成仍为 +20% |
| M45「战斗前两个玩家回合」 | `turn <= 2`（玩家回合编号，与现有 `context.turn` 一致） |
| M54「每层最多一次」 | 使用 `layerKeys` 去重，单次楼层挑战内最多触发一次 |
| M38 II「保留至下一玩家回合」 | 未消耗的减费状态不在回合结束清除；下一玩家回合 `BEFORE_MOVE` 仍可消耗 |
| 止损「超过 20% 的部分」 | 先算实际伤害 D；若 D > maxHp×20%，减免的是 (D − maxHp×20%) 这一段，不是整段 D |
| 护棘消耗护盾 | 消耗量 = min(当前护盾, maxHp × 比例)；次生伤害基于**实际消耗量** |

---

## 6. 测试计划

1. **Catalog**：M01–M56 存在；改名正确；effects/values/hooks 覆盖；`sourceFloor=0` 仅用于 M39–M56
2. **Effects 单测**（喂上下文）：
   - 调整组：M08 III、M22 脱围链、M25/M26 泛化、M27–M38 各关键分支
   - 新增组：M39–M56 每枚至少 I + 最高级关键路径
3. **Bridge 单测**：邻敌/邻墙计数、额外移动地形减免、环境伤害倍率、任务区/交互/护送 flag 透传
4. **回归**：既有 Minghen 相关测试全绿；未改命痕行为不变
5. **禁止回归项**：不得出现为单枚命痕引入的每帧全图扫描 API

---

## 7. 文档同步

| 文档 | 动作 |
|---|---|
| `specs/260712-pve-persistent-floor-progression/minghen-catalog.md` | 更新全局定义；改 M08 III、M22/M25–M38；新增 M39–M56 |
| `specs/260608-pve-destiny-expedition/design.md` | 命痕定位与目录引用对齐 |
| 本文件 | 实现规格源 |

楼层玩法与命痕适配另开文档，本轮不写。

---

## 8. 实现文件触点（预期）

- `assets/scripts/pve/core/minghen/MinghenEventContext.ts`
- `assets/scripts/pve/core/minghen/MinghenCatalog.ts`
- `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- `assets/scripts/pve/core/minghen/MinghenCombatBridge.ts`
- `assets/scripts/pve/core/minghen/SandMinghenBridge.ts`（泛化或重命名）
- `assets/scripts/pve/core/minghen/MinghenTrial.ts`
- `assets/scripts/pve/core/minghen/MinghenDisplay.ts`（若有名称映射）
- `test/pve/Minghen*.test.ts`（扩展/新增）
- 上述 specs 文档

运行时接入点（填充上下文，不改玩法规则）：`PersistentExpeditionRuntime` 等现有命痕调用链。

---

## 9. 后续红线（来自 V3）

56 枚之后不按固定数量扩容。新命痕必须回答：解决了哪个现有命痕无法明显帮助的新问题？禁止仅因数值更高、更易触发、换异常/阈值/AP 条件、或简单拼接既有效果而新增。
