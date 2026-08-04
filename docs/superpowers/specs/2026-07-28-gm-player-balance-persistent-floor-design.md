# GM 玩家数值接入永久楼层远征

日期：2026-07-28  
范围：让 GM `pve_balance_configs` 的**玩家**字段在新远征（永久逐层）开局生效；不接怪物/Boss/装备倍率；不改 GM Web UI。

## 背景

GM 可改 `pve_balance_configs`，`loadPveMeta` 也会下发 `balanceSnapshot`。但永久楼层路径里：

- 各章 `createChapterXExpeditionState` 写死 `balanceSnapshot: null`
- 玩家面板走 `professionBaseStats`，不读 GM
- `playerAttackPower` 忽略传入的 snapshot
- `ExpeditionController` 把 meta snapshot 存进 `_balanceSnapshot` 后从未写回战斗 state

结果：GM 改玩家数值对新远征测试无效。

## 目标

测试同学在 GM 改玩家数值后，**新开本层或重新挑战本层**即可在局内看到覆盖效果。

## 已确认决策

| 项 | 选择 |
|----|------|
| 覆盖范围 | 仅玩家字段（方案 A） |
| 与职业面板 | GM 有值则整项替换该职业基础值；装备加成仍叠加 |
| 生效时机 | 仅新开本层 /「重新挑战本层」灌入；纯续玩不改存档内 HP/AP |
| 实现路径 | 开局注入 `balanceSnapshot` 进 runtime（不改云端 challenge 协议） |

## 数据流

```text
GM 保存玩家数值
  → pve_balance_configs
  → loadPveMeta.balanceSnapshot
  → PersistentFloorFlow.bootstrap / restartCurrentFloor（仅 createPersistentFloorRuntime）
  → 各章 ExpeditionFactory：state.balanceSnapshot = snapshot
       + resolve 职业基础（GM 字段优先）
  → 本层战斗读 state.balanceSnapshot
续玩：resume 序列化 runtime，不重套最新 GM
```

## 覆盖规则

共享 helper（建议 `resolveProfessionBaseWithBalance(professionId, balanceSnapshot, chapter)`）：

| GM 字段 | 覆盖项 | 仍叠加 |
|---------|--------|--------|
| `initialHp` | 职业 `maxHp` | 装备 HP 加成 |
| `baseAttack` | 职业 `attack` | 武器威力 / 词条等现有公式 |
| `baseAttackRange` | 职业 `attackRange` | 武器 `maxRange`、矛隐式等 |
| `apBase` | 开局与回合 AP 骰基数 | 结转 / Boss 锁 / 光环等现有修正 |
| `moveCost` / `attackCost` / 开箱与交互消耗 | 行动 AP 消耗 | — |
| `initialGold` / `initialAnima` | 开局金币 / 灵力与进度起点 | — |

未配置字段：继续用职业基础或代码默认（与现有 `getPlayerBalanceConfig` 合并语义一致：global → chapter → `player:ADVENTURER`）。

## 改动点

1. **`PveBalance.ts`（或 profession 旁）**  
   新增 `resolveProfessionBaseWithBalance`；必要时让 `getBalancedApBase` / 攻击基数与永久楼层共用同一优先规则。

2. **五章 `ChapterXExpeditionFactory`**  
   - `createPersistentFloorRuntime` / factory 增加 `balanceSnapshot` 入参  
   - `createPlayer` / 开局 `rollAp` 走 helper  
   - 写入 `state.balanceSnapshot`（不再写死 `null`）

3. **`CombatSystem.playerAttackPower`**  
   有 snapshot 时用 GM/`resolve` 后的攻击与射程基数，不再忽略参数。

4. **`ExpeditionState.endTurn`**  
   `persistentFloorMode` 下：有可用玩家 `apBase` 覆盖则用 `getBalancedApBase`，否则仍用职业 `apBase`。

5. **`PersistentFloorFlow` + `ExpeditionController`**  
   bootstrap / restart 把 meta 的 `balanceSnapshot` 传入 `createPersistentFloorRuntime`；删除或收敛只写不读的 `_balanceSnapshot`。

6. **文档**  
   同步 `specs/260608-pve-destiny-expedition/design.md`（或永久楼层相关小节）与 `CALL_FLOW.md` 一句：永久楼层开局消费 `balanceSnapshot` 玩家字段。

## 非目标

- 怪物 / Boss / 装备倍率接入  
- 续玩强制刷新最新 GM  
- 修改 GM Web 字段列表或后台协议  
- 营地属性预览强制跟局内 GM 一致（营地仍可不传 snapshot；本轮不要求营地显示 GM 覆盖）

## 验收

1. GM 设 `initialHp=9999`、`baseAttack=100`、`moveCost=0` 后，**新开或重开本层**：最大生命（含装）、攻击面板、移动消耗符合配置。  
2. 同一挑战 **纯续玩**：当前 HP/AP 与存档一致，不被最新 GM 改写。  
3. 未配置任何玩家覆盖时，行为与现网职业面板一致。  
4. 单测：helper 覆盖/回退；至少一章 factory 开局字段断言。

## 风险

- 旧存档 `balanceSnapshot` 为 `null`：续玩维持现状，需重开本层才吃到 GM——符合「仅新开/重开」决策。  
- `playerAttackPower` 多处调用：未传 snapshot 时必须保持职业默认，避免营地/其它路径回归。
