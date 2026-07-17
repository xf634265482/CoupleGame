# 命运守卫机制重做 — Plan

> 实施 [design.md](design.md)。按 P1→P11 顺序，前 7 步是核心逻辑+测试，后 4 步是 UI/文案/文档同步。

## P1 常量与类型扩展

**文件**：`assets/scripts/pve/core/PveConstants.ts`、`assets/scripts/pve/core/PveTypes.ts`

- 删除 `CHAPTER5_MIRROR_HP` / `CHAPTER5_MIRROR_SPAWN_HP_RATIO` / `CHAPTER5_MIRROR_ATTACK_MULT`
- 新增 design §5.3 常量清单
- `Monster` 接口扩展 `pendingBehavior` / `shieldStacks` / `attackBuffPct` / `attackBuffExpiresAtTurn` / `mirrorSpawned` / `enraged` / `enrageTurn`
- `FloorState` 扩展 `pendingDestinyRewrite` / `destinyLockNextTurn`
- `PveEvent` 联合新增 design §6 的 13 个事件

## P2 重写 FateGuardian.ts

**文件**：`assets/scripts/pve/core/bosses/FateGuardian.ts`

- 删除 `spawnFateMirror`
- 新增（顺序按设计稿 §7）：
  - `tryCrossMirrorThreshold` — HP≤50% 且未生成镜像时生成行为镜像
  - `recordPlayerActionForMirror` — endTurn 调，按 ATTACK>MOVE>IDLE 优先级写 pendingBehavior
  - `mirrorBehaviorStep` — 执行 ATTACK / MOVE / IDLE 分支
  - `tryCrossEnrageThreshold` — 写 enraged + 清空 fateProphecy
  - `tryOfferDestinyRewrite` — 狂暴态周期触发，5 抽 3 写 pendingDestinyRewrite
  - `chooseDestinyRewrite` — 写 removed
  - `resolveDestinyRewrite` — E5→E4→E3→E1→E2 顺序结算
- 改 `fateGuardianAttack` — 用 boss.attackBuffPct
- 改 `isProphecyTurn` — boss.enraged=true 时返回 false

## P3 CombatSystem 改造

**文件**：`assets/scripts/pve/core/CombatSystem.ts`

- `resolveHit` 镜像扣血前判 `target.shieldStacks===1` → 吸收一次伤害 + emit `MIRROR_SHIELD_ABSORBED`
- `monsterAttack` 计算伤害时若怪物有 `attackBuffPct` → `damage = round(attack × (1 + attackBuffPct/100))`，过期检查 `floor.turn >= attackBuffExpiresAtTurn` 则清字段
- 玩家攻击后：HP 首次跨 50% / 30% → emit `MIRROR_SPAWNED`（仅 emit，生成由 MonsterAI 阶段 tryCrossMirrorThreshold 处理）/ `BOSS_ENRAGED`，写对应 boss 标记

## P4 MonsterAI 调度

**文件**：`assets/scripts/pve/core/MonsterAI.ts`

- FATE_GUARDIAN 怪物回合按设计稿 §8 调度顺序
- 调度到 `bossId===FATE_MIRROR_BOSS_ID` 的怪物时跳过通用 AI，直接走 `mirrorBehaviorStep`
- 死亡镜像（aiState==='DEAD'）正常迭代略过

## P5 ExpeditionState 改造

**文件**：`assets/scripts/pve/core/ExpeditionState.ts`、`assets/scripts/pve/core/ApSystem.ts`

- endTurn 在玩家回合结束、怪物回合开始之间调 `recordPlayerActionForMirror`
- ApSystem 玩家回合开始时若 `floor.destinyLockNextTurn===true` → `currentAp = max(1, floor(currentAp/2))`，emit `DESTINY_AP_LOCKED{nextTurnAp}`，清空 `destinyLockNextTurn`

## P6 测试

**文件**：`test/pve/FateGuardian.test.ts`、`test/pve/chapter25-depth.test.ts`

- 按设计稿 §10 清单加新分组
- `chapter25-depth.test.ts` 现有 CHAPTER5_MIRROR_* 引用需迁移到新 API（或删除"旧镜像生成"测试，新文件覆盖）

## P7 测试通过

```
npm run test:pve
```

红了回对应 Px 修；绿了进 P8。

## P8 Controller + 模态

**文件**：`assets/scripts/pve/controllers/ExpeditionController.ts`、新增 `assets/scripts/pve/views/DestinyRewriteModal.ts`

- ExpeditionController 新事件分发：
  - `MIRROR_*` → 战报 + toast
  - `DESTINY_REWRITE_OFFERED` → 暂停输入 + 显示 DestinyRewriteModal
  - 模态回调 → 调 `chooseDestinyRewrite(state, idx)` → 关模态 → 恢复输入
  - `DESTINY_*` 其他事件 → 战报 + toast
- DestinyRewriteModal：参考 PveCharacterPanel 风格，标题 + 3 卡片，点击触发 onChosen 回调

## P9 View 渲染

**文件**：`assets/scripts/pve/views/FogMapView.ts`

- 镜像图标：FATE_MIRROR_BOSS_ID 渲染独立标识（如紫色"镜"字 + 玩家头像剪影占位）
- 护盾标记：shieldStacks=1 → 头顶画蓝色盾形
- 5×5 预警：玩家弃 1 后若 E4 在留下的 2 个内 → 下个 Boss 回合开始前在 Boss 当前格周围切比雪夫 ≤ 2 区域画红橙色高亮

## P10 战报文案

**文件**：`assets/scripts/pve/views/PveMessageLog.ts`

按设计稿 §9.3 表格映射事件 → 中文文案。

## P11 同步设计文档

按设计稿 §12：

- `specs/260608-pve-destiny-expedition/design.md` 中对应 Boss 规则
- `specs/balance-reference.md` §11 数值表
- `specs/260608-pve-destiny-expedition/design.md` 第 5 章 Boss
- `specs/260614-boss-anti-kite/design.md` 加注"狂暴后预言停用"
- `specs/260608-pve-destiny-expedition/design.md` 中对应战斗事件
