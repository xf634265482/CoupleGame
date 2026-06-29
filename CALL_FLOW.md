# CALL_FLOW.md
> 2026-06-19 PVE-only 启动链：`GameApp` → `lobby.scene` → `PveLobbyController`
> ???????`PveLobbyController` ???????????????`_startRun()` / `_showDestinyTreeModal()`??
> PVP 房间、棋盘、结算场景当前不进入微信构建。
> 主要调用链速查。理解某个操作的完整执行路径时，从这里找起。
> 层次标记：`[Controller]` = controller 层（Cocos Component）/ `[Core]` = pve/core 纯函数 / `[View]` = 渲染层 / `[Net]` = 网络层 / `[Cloud]` = 云函数

---

## 目录

- [PVE 调用链](#pve-调用链)
  - [1. 玩家攻击](#1-玩家攻击)
  - [2. 玩家移动](#2-玩家移动)
  - [3. 回合结束（EndTurn）](#3-回合结束endturn)
  - [4. 灵气强化触发（3 选 1）](#4-灵气强化触发3-选-1)
  - [5. 怪物回合 AI](#5-怪物回合-ai)
  - [6. Boss 技能释放](#6-boss-技能释放)
  - [7. 楼层通关 → 下一层](#7-楼层通关--下一层)
  - [8. 玩家死亡](#8-玩家死亡)
  - [9. 新局开始](#9-新局开始)
  - [9c. PVE 广告入口](#9c-pve-广告入口)
  - [10. 断线续档](#10-断线续档)
  - [11. 职业进阶 / 觉醒](#11-职业进阶--觉醒)
  - [12. 装备掉落 → 装备上身](#12-装备掉落--装备上身)
  - [13. 命运树解锁](#13-命运树解锁)
  - [14. 营地商店购买](#14-营地商店购买)
  - [15. 楼层地图生成](#15-楼层地图生成)
- [PVP 调用链](#pvp-调用链)
  - [16. 玩家走格子](#16-玩家走格子)
  - [17. PVP 战斗结算](#17-pvp-战斗结算)

---

## PVE 调用链

### 1. 玩家攻击

```
[Controller] ExpeditionController._tapAttack()
  │
  ├─ 校验 _busy 守卫，防止并发输入
  │
  ▼
[Core] CombatSystem.playerAttack(state, targetPos)
  ├─ 计算基础伤害（player.attack + equipBonus）
  ├─ EquipTraitEffects — 装备词条修正（暴击/穿透等）
  ├─ StrengthenEffects — 强化词条修正（狂暴/吸血等）
  ├─ 施加异常状态（冻结/灼烧）
  ├─ resolveHit() — 命中单个怪物：扣 HP、Boss 狂暴检测、变体副作用
  │    └─ 击杀时：applyMonsterKillDrop(LootSystem) → AnimaSystem.addAnima()
  │         └─ addAnima 超阈值 → push STRENGTHEN_TRIGGERED event（Core 内部完成）
  ├─ RelicSystem.relicOnHitTarget() / relicOnKill() — 遗物触发
  └─ 返回 { state: newState, events: PveEvent[] }
  │
  ▼
[Controller] _replayEvents(events)
  ├─ ATTACK event            → PveToastView.showDamage()
  ├─ KILL event              → PveMessageLog.append("击杀xxx")
  ├─ LOOT event              → PveToastView.showLoot()
  ├─ STRENGTHEN_TRIGGERED    → PveToastView.showStrengthenPicker()（见 §4）
  │    注意：addAnima 已在 Core 内部调用，Controller 只消费此 event，不再调用 addAnima
  │
  ▼
[View] FogMapView.refresh(state)   — 移除死亡怪物图标
[View] PveHudView.refresh(state)   — 更新 HP/金币/灵气
  │
  ▼
[Core] MonsterAI.stepMonsters(state)   — 怪物回合（见 §5）
  │
  ▼
[Net] PveService.savePveFloor(report) — 自动存档（每回合末）
```

---

### 2. 玩家移动

```
[Controller] ExpeditionController._tapDirection(dir)
  │
  ▼
[Core] MovementSystem.applyMove(state, direction)
  ├─ 计算目标格坐标
  ├─ 碰撞检测（墙/边界/实体阻挡）
  ├─ 消耗 AP（ApSystem.spend）
  ├─ 背刺检测 → push BACKSTAB event（若从侧/背方向移到怪物旁）
  ├─ FogSystem.revealAround(state, newPos, visionRange)
  │    └─ 曼哈顿距离 ≤ visionRange 的格子标记为 revealed
  ├─ 踩到实体 → push ENTITY_STEP event
  └─ 返回 { state, events }
  │
  ▼
[Controller] _replayEvents(events)
  ├─ MOVE event         → FogMapView.refresh() — 移动玩家图标 + 解除迷雾
  ├─ ENTITY_STEP event  → 按实体类型分发：
  │    ├─ 宝箱      → LootSystem.openChest()
  │    ├─ 钥匙      → FloorRules.pickKey()
  │    ├─ 出口门    → 触发楼层通关流程（见 §7）
  │    ├─ 铁匠/神像 → NeutralEntities 对应函数
  │    └─ 营地      → CampSystem.applyShopBuy() 弹商店 UI
  └─ BACKSTAB event → CombatSystem.playerAttack（加成伤害）
  │
  ▼
[View] FogMapView.refresh(state)
[View] PveHudView.refresh(state)   — AP 减少
```

**地图镜头与页面布局保护线（2026-06-22）**：

```text
[View] FogMapView.refresh(state)
  ├─ 更新格子、迷雾、玩家与实体内容
  └─ _refreshCamera(floor.player)
       ├─ 只计算裁切视口内部的地图内容偏移
       ├─ 只允许移动 FogMapView._content
       └─ 禁止移动 FogMapView._root、地图父容器、HUD、战报或底部操作区
```

玩家位于地图顶部、中部、底部时，主战场窗口在页面上的坐标必须完全一致。
相关修复规则见 `specs/260608-pve-destiny-expedition/claude-code-handoff-2026-06-22.md`。

---

### 3. 回合结束（EndTurn）

```
[Controller] ExpeditionController._tapEndTurn()
  │
  ▼
[Core] ExpeditionState.endTurn(state)
  ├─ ApSystem.rollAp() — 掷骰子，获得新回合 AP
  ├─ 回合计数 ++
  ├─ 异常状态持续扣减（灼烧/中毒）
  ├─ BossEquipTraitEffects.tickMonsterDots() — DoT 持续伤害结算（此处已耦合 Boss 专属效果）
  ├─ FateGuardian.recordPlayerActionForMirror() — 记录玩家本回合行动（命运守卫镜像专用）
  └─ 返回 { state, events }
  │
  ▼
[Core] MonsterAI.stepMonsters(state)   — 怪物移动/攻击（见 §5）
  │
  ▼
[Controller] _replayEvents(events)
  └─ AP_ROLLED event → PveHudView.showApRoll(newAp)
  │
  ▼
[Net] PveService.savePveFloor(report)
```

---

### 4. 灵气强化触发（3 选 1）

```
[Core] CombatSystem（击杀/掉落时）→ applyMonsterKillDrop → AnimaSystem.addAnima()
  ├─ player.anima += amount
  ├─ player.anima >= animaThreshold?
  │    ├─ YES → buildStrengthenChoices(state) → 抽 3 条不重复词条
  │    │         push STRENGTHEN_TRIGGERED event（含 choices 数组）
  │    └─ NO  → 继续（无额外事件）
  └─ （全程在 Core 内部完成，Controller 不介入）
  │
  ▼  Core 返回 events 到 Controller
[Controller] _replayEvents → 检测 STRENGTHEN_TRIGGERED event
  └─ 从 event.choices 读取 3 条词条（不再调用 addAnima）
  │
  ▼
[View] PveToastView.showStrengthenPicker(choices)   — 显示 3 选 1 弹窗
  │  玩家点选
  ▼
[Controller] _onStrengthenChosen(choiceIndex)
  │
  ▼
[Core] AnimaSystem.applyStrengthen(state, traitId)
  ├─ player.classTraits.push(traitId)  ← 职业词条与强化词条共用同一数组
  ├─ player.anima -= threshold
  ├─ player.animaThreshold *= ANIMA_THRESHOLD_MULTIPLIER（下次门槛提高）
  └─ 返回新 state
  │
  ▼
[View] PveCharacterPanel.refresh() — 词条列表更新
```

---

### 5. 怪物回合 AI

```
[Core] MonsterAI.stepMonsters(state)
  │  遍历所有存活怪物
  ▼
  FOR each monster:
    ├─ aiState == 'IDLE'   → 随机游走（PATROL 概率）
    ├─ aiState == 'PATROL' → 随机移动，发现玩家（视野内）→ 切 CHASE
    ├─ aiState == 'CHASE'  → 向玩家 BFS 寻路，移动一步
    │    └─ 到达攻击范围 → CombatSystem.monsterAttack(state, monster)
    │         ├─ 计算伤害
    │         ├─ player.hp -= damage
    │         └─ player.hp <= 0 → push PLAYER_DEAD event
    └─ aiState == 'FLEE'   → 远离玩家（灵气怪逃跑逻辑）
  │
  ├─ Boss 怪物 → 调用对应 Boss 模块步进函数：
  │    bossId == 'GOBLIN_CHIEF'       → GoblinChief 逻辑（重击/号角）
  │    bossId == 'FROST_GIANT'        → stepFrostGiant()
  │    bossId == 'LAVA_LORD'          → lavaLordAttack() + 阶段技能
  │    bossId == 'FATE_GUARDIAN'      → fateGuardianAttack() + 阶段检测
  │
  └─ 返回 { state, events }
```

---

### 6. Boss 技能释放

以**命运守卫（FateGuardian）三段机制**为例，是最复杂的 Boss：

> ⚠️ **阈值检测与状态变更在两个不同时机执行**：
> - HP 是否跌破阈值的**检测**：发生在**玩家攻击回合**的 `CombatSystem.resolveHit()` 里（if 判断后 push `BOSS_ENRAGED` event）
> - 阈值触发后的**状态变更**（生成镜像/开启狂暴）：发生在**下一次怪物回合**的 `MonsterAI` 调用 `tryCross*Threshold()` 时

```
── 玩家攻击回合 ──────────────────────────────────────────────────────
[Core] CombatSystem.resolveHit()
  ├─ Boss HP 从 > 50% 跌到 ≤ 50%？
  │    └─ （不在此处生成镜像，镜像由下一回合怪物 AI 生成）
  ├─ Boss HP 从 > 30% 跌到 ≤ 30%？
  │    └─ push BOSS_ENRAGED event（仅标记事件，不改 boss.enraged 字段）
  └─ 继续正常伤害结算

── 下一怪物回合 ───────────────────────────────────────────────────────
[Core] MonsterAI.stepMonsters → bossId == 'FATE_GUARDIAN'
  │
  ▼
  ├─ FateGuardian.tryCrossMirrorThreshold(state, boss)
  │    └─ boss.hp ≤ 50% 且镜像未生成 → 生成行为镜像实体
  │         ├─ push MIRROR_SPAWNED event
  │         └─ 镜像读取 player.lastAction（recordPlayerActionForMirror 记录）→ 镜像攻击
  │
  ├─ FateGuardian.tryCrossEnrageThreshold(state, boss)
  │    └─ boss.hp ≤ 30% 且未狂暴 → 写入 boss.enraged = true
  │         └─ tryOfferDestinyRewrite(state, boss)
  │              └─ push DESTINY_REWRITE_OFFER event（给玩家选择）
  │
  └─ FateGuardian.fateGuardianAttack(state, boss)
       ├─ 阶段 1（HP > 50%）：fateProphecyStep() — 预言下一回合攻击方向
       ├─ 阶段 2（50% ≥ HP > 30%）：mirrorBehaviorStep() — 镜像复制玩家行动
       └─ 阶段 3（HP ≤ 30%）：攻击力/移速大幅提升

── 玩家响应改写命运 ───────────────────────────────────────────────────
[Controller] _onDestinyRewriteChosen(accept)
  ├─ 接受 → chooseDestinyRewrite(state) → resolveDestinyRewrite()
  └─ 拒绝 → 继续（Boss 狂暴加强）
```

**哥布林酋长（GoblinChief）重击 AOE 调用链**：

```
[Core] MonsterAI → GoblinChief
  │
  ├─ isHeavyStrikeTurn(boss.turn, HEAVY_STRIKE_INTERVAL)?
  │    └─ YES →
  │         ├─ push HEAVY_STRIKE_WARNING event（预警）
  │         └─ 下回合执行：
  │              GoblinChief.executeHeavyStrike(state, boss)
  │              ├─ 以 Boss 为中心，HEAVY_STRIKE_RANGE 格内所有玩家/单位受伤
  │              ├─ 内圈 × HEAVY_STRIKE_MULTIPLIER 倍额外伤害
  │              └─ push HEAVY_STRIKE_HIT event
  │
  └─ 号角 goblinChiefHorn(state, boss)
       ├─ 每 HORN_INTERVAL 回合触发
       ├─ 在 Boss 附近生成 1-2 只哥布林战士
       └─ push SUMMON event
```

---

### 7. 楼层通关 → 下一层

```
[Controller] _replayEvents → FLOOR_EXIT_STEP event
  │
  ▼
[Core] FloorRules.openExit(state) — 已有钥匙才能触发
  │
  ▼
[Core] ExpeditionState.advanceFloor(state)
  ├─ floor ++
  ├─ 保留 player 状态（HP/金币/装备/词条）
  ├─ 清空 floorState（怪物/实体/迷雾）
  └─ 返回 { state, events: [FLOOR_ADVANCE event] }
  │
  ▼ 跨章时（r.state.chapter > oldChapter）先 gating 资源（§7b），失败回大厅
[Controller] ExpeditionController._ensureChapterReady(chapter)
  ├─ isChapterReady? 是 → 直接通过（预加载已命中）
  ├─ 否 → LoadingOverlay.show + ChapterResourceLoader.loadChapterBackground(chapter)
  │        ├─ ensureChapterBundle → wx.loadSubpackage('chapter_N') + loadBundle
  │        └─ bundle.load('bg_pve_chN/spriteFrame', SpriteFrame)（需求#8：仍需 bundle.load）
  └─ 失败/超时 → toast + SceneLoader.loadLobby()（进度已存档，回大厅可续档重载）
  │
  ▼
[Net] PveService.savePveFloor(report) — 存档本层结果
  │
  ▼
[Core] MapGenerator.generateFloor(floor, runSeed)
  └─ 生成新层布局（确定性，见调用链 §15）
  │
  ▼
[View] FogMapView.rebuild(newFloorState) — 重建地图
[View] PveHudView.refresh(state)         — 更新层数显示
```

---

### 8. 玩家死亡

```
[Core] MonsterAI/CombatSystem → player.hp <= 0
  └─ push PLAYER_DEAD event
  │
  ▼
[Controller] _replayEvents → PLAYER_DEAD
  │
  ▼
[Core] ExpeditionState.applyDeath(state)
  ├─ 标记 run 为 DEAD 状态
  ├─ 计算死亡层数 / 存活回合等
  └─ 返回最终 state
  │
  ▼
[Net] PveService.settlePveRun(report)
  │
  ▼
[Cloud] PveSave.settleExpedition(report)
  ├─ 按已通关层数独立计算奖励（不信任客户端数值）
  ├─ 写入钻石/命运碎片
  └─ 清除活跃存档
  │
  ▼
[Controller] 展示死亡结算 UI → 返回大厅
```

---

### 9. 新局开始

```
[Controller] LobbyController._tapStartPve()
  │
  ▼
[Net] PveService.startRun()
  │
  ▼
[Cloud] PveSave.startRun(uid)
  ├─ 生成 runSeed（服务端 Math.random() * MAX_INT）
  ├─ 校验无活跃存档（或覆盖旧存档）
  └─ 写入 db.pve_save { uid, runSeed, status:'ACTIVE' }
  │
  ▼
[Net] PveService.loadPveMeta()
  │
  ▼
[Cloud] PveMeta.loadMeta(uid)
  └─ 返回 { treeNodes, achievements, codex, scrolls, destinyShards }
  │
  ▼
[Core] DestinyTreeSystem.getTreeBonuses(metaTreeNodes)
  └─ 快照化树加成 → treeBonuses 注入初始 player 状态
  │
  ▼
[Core] ExpeditionState.startExpedition(runSeed, treeBonuses)
  ├─ 初始化 player（HP=200, AP=8, classId='ADVENTURER' 等）
  ├─ MapGenerator.generateFloor(1, runSeed)
  └─ 返回初始 state
  │
  ▼
[View] FogMapView.rebuild() / PveHudView.refresh()
```

### 9b. PVE 大厅体力与排行榜

```text
[Lobby] PveLobbyController.onLoad()
  ├─ loadPveMeta() → 碎片 / 钻石 / 体力 / 最高层 / 下次远征消耗
  ├─ loadPveSave() → 判断”继续远征”或”新远征”
  └─ _refreshRank() → loadPveLeaderboard(20)
       ├─ 缓存 _leaderboardEntries / _myRank
       └─ 更新 PlayerCard._rankLabel（”全服第 N 名”）

[排行榜弹窗] PveLobbyController._showLeaderboard()
  ├─ 命中缓存 → 直接 _buildLeaderboardModal(entries, myRank)
  └─ 未缓存 → loadPveLeaderboard(20) → 缓存 → _buildLeaderboardModal
       └─ ScrollView（20 条可滚动）+ myRank 副标题 + 前三徽章 + 自身行高亮

[新远征] PveService.startRun()
  └─ PveSave.startRun()
      ├─ 已有存档：返回原 runSeed，体力消耗 0
      └─ 无存档：db.reservePveRunStart()
          ├─ 按云端时间恢复体力（5 分钟/点，上限 60）
          ├─ 首次免费，否则扣 20
          └─ 写入 pvePendingRunSeed，网络重试复用且不重复扣费
```

### 9c. PVE 广告入口

```text
[Platform] AdManager.init(config)
  ├─ 创建 RewardedVideoAd / BannerAd / InterstitialAd
  ├─ 注册 onLoad / onError / onClose 统一日志
  └─ preloadAll() 预加载激励视频与插屏

[Lobby] PveLobbyController（后续接入）
  ├─ showBanner() → 大厅底部展示 Banner
  ├─ showRewardAd('restore_stamina') → 完整观看后恢复体力
  └─ showRewardAd('destiny_tree_reset') → 完整观看后触发每日 1 次命运树免费重置

[Expedition] ExpeditionController / PveToastView（后续接入）
  ├─ showRewardAd('reroll_strengthen_once')
  │    └─ 完整观看后重抽本局 1 次强化三选一
  └─ showRewardAd('revive_half_hp_once')
       └─ 完整观看后原地复活 1 次并恢复 50% maxHp

[Platform] AdManager.showInterstitial(scene)
  ├─ 检查 _lastInterstitialAt
  ├─ < 60s → 冷却拦截 + debug log
  └─ ≥ 60s → 展示插屏并更新时间戳
```

---

### 10. 断线续档

```
[Controller] ExpeditionController.onLoad()
  │
  ▼
[Net] PveService.loadPveSave()
  │
  ▼
[Cloud] PveSave.loadActiveSave(uid)
  └─ 返回 { runSeed, floorSnapshot, playerSnapshot, turn, ... }
  │
  ▼
[Core] ExpeditionState.resumeExpedition(saveData)
  ├─ deserialize floorSnapshot → FloorState
  ├─ deserialize playerSnapshot → RunPlayer
  └─ createRng(rngState) 恢复 RNG 快照（AC-13）
  │
  ▼
[View] FogMapView.rebuild() — 恢复上次迷雾状态
```

---

### 11. 职业进阶 / 觉醒

```
玩家拾取职业碎片（怪物掉落触发 CLASS_FRAGMENT event）
  │
  ▼
[Core] ClassSystem.pickFragment(state, classId)
  ├─ player.classFragments[classId] ++
  ├─ 达到 CLASS_FRAGMENTS_TO_ADVANCE?
  │    └─ YES → push CLASS_ADVANCE_ELIGIBLE event
  └─ 返回 state
  │
  ▼  玩家主动触发进阶（点击角色面板）
[Controller] _tapClassAdvance(classId)
  │
  ▼
[Core] ClassSystem.applyClassAdvance(state, classId)
  ├─ 消耗碎片
  ├─ player.classId = classId（确定主职）
  ├─ 解锁一阶被动词条
  └─ 返回 state
  │
  ▼  二阶觉醒（条件满足后可触发）
[Core] ClassSystem.getAwakenEligible(state)
  └─ 返回可觉醒的 classId 列表
  │
  ▼
[Core] ClassSystem.applyClassAwaken(state, classId)
  ├─ 解锁二阶觉醒词条
  └─ 返回 state
```

---

### 12. 装备掉落 → 装备上身

```
[Core] LootSystem.rollEliteMonsterDrop(state, monster)
  └─ 概率触发装备掉落
       ├─ EquipmentSystem.rollEquipment(floor, rng)
       │    ├─ 按楼层确定品质权重（高层 EPIC/LEGENDARY 概率更高）
       │    ├─ 随机主属性
       │    └─ 随机词条（0~2 条，视品质）
       └─ push LOOT event { item: EquipItem }
  │
  ▼
[Controller] _replayEvents → LOOT event（装备类型）
  └─ PveToastView.showEquipDrop(item) — 显示装备卡片
  │  玩家点「装备」
  ▼
[Controller] _tapEquip(item, slot)
  │
  ▼
[Core] EquipmentSystem.equipItem(state, item, slot)
  ├─ 若槽位有旧装备 → unequipItem 先摘除
  ├─ player.equipment[slot] = item
  └─ 返回 state
  │
  ▼
[View] PveCharacterPanel.refresh() — 装备格更新
```

---

### 13. ???????

```text
[Lobby] PveLobbyController._showDestinyTreeModal()
  ?? loadPveMeta() ???????????? / ????? / ????
  ?? _applyMetaSnapshot(meta) ?????????????
  ?? _buildDestinyTreeModal(meta) ????????????

[Unlock] PveLobbyController._onUnlockDestinyTreeNode(nodeId)
  ?? DestinyTreeSystem.canUnlockNode(meta, nodeId) ?????????
  ?? PveService.unlockTreeNode(nodeId)
  ?? [Cloud] PveMeta.unlockTreeNode(uid, nodeId)
  ?? _rebuildDestinyTreeModal(meta) + _applyMetaSnapshot(meta)

[Reset] PveLobbyController._onResetDestinyTree()
  ?? PveService.resetTree()
  ?? [Cloud] PveMeta.resetTreeNodes(uid)
  ?? _rebuildDestinyTreeModal(meta) + _applyMetaSnapshot(meta)
```

---
### 14. 营地商店购买

```
[Controller] ExpeditionController → 踩到营地格子
  └─ push CAMP_STEP event
  │
  ▼
[View] PveToastView.showShopMenu(state)   — 弹出商品列表
  │  玩家点购买
  ▼
[Controller] _tapShopBuy(itemType, cost)
  │
  ▼
[Core] CampSystem.applyShopBuy(state, itemType)
  ├─ 校验 player.gold >= cost
  ├─ player.gold -= cost
  ├─ 按 itemType 应用效果：
  │    ├─ 'HEAL'     → player.hp += amount（不超 maxHp）
  │    ├─ 'MAX_HP'   → player.maxHp += amount
  │    ├─ 'ANIMA'   → player.anima += amount
  │    └─ 'RELIC'    → openRelicChest(state)
  └─ 返回 state
  │
  ▼
[View] PveHudView.refresh(state)
```

---

### 15. 楼层地图生成

```
runSeed（服务端生成，全程不变）
  │
  ▼
[Core] MapGenerator.generateFloor(floor, runSeed)
  ├─ deriveFloorSeed(runSeed, floor) → floorSeed（每层唯一）
  ├─ createRng(floorSeed) → 该层专属 RNG（与其他层隔离）
  │
  ├─ 按 floor 决定地图尺寸（1-15层=8×8，16-20=9×9，21-25=10×10）
  ├─ 生成空白网格 + 随机墙体
  ├─ ChapterMonsterRules.generateChapterMonsters(chapter, rng)
  │    └─ 按配比表实例化各怪物变体，随机放置坐标
  ├─ 放置实体（宝箱/铁匠/神像/温泉等）数量由楼层决定
  ├─ 放置钥匙 + 出口门
  └─ 返回 FloorState（fog 全隐藏）
```

---

## PVP 调用链

### 16. 玩家走格子

```
[Controller] BoardController._tapCell(cellIndex)
  │
  ▼
[Net] GameService.submitTurn({ cellIndex })
  │
  ▼
[Cloud] GameEngine.processTurn(gameState, turnData)
  ├─ 校验合法性（是否轮到该玩家、格子是否可走）
  ├─ 更新棋子位置
  └─ CellResolver.resolve(cell, gameState)
       ├─ 普通格 → 无事
       ├─ 战斗格 → CombatResolver.resolve()
       ├─ 事件格 → EventResolver.resolve()
       └─ 商店格 → ShopResolver.resolve()
  │
  ▼
[Cloud] 写入新 gameState 到数据库
  │
  ▼
[Net] GameWatcher（实时监听）触发 onStateChange
  │
  ▼
[Controller] BoardController.onStateChange(newState)
  │
  ▼
[View] BoardView.refresh(newState)
[View] HudController.refresh(newState)
```

---

### 17. PVP 战斗结算

```
[Cloud] CombatResolver.resolve(attacker, defender, gameState)
  ├─ 计算双方攻防（装备 + 事件加成）
  ├─ 掷骰子决定伤害
  ├─ defender.hp -= damage
  ├─ defender.hp <= 0 → 复活惩罚（扣金币/退步）
  └─ 返回 combatResult
  │
  ▼
[Cloud] GameEngine 写入 combatResult 到 gameState
  │
  ▼
[Controller] BoardCombatUi.show(combatResult) — 展示战报动画
```

---

## 通用说明

### core 函数的返回结构

所有 PVE core 函数均遵循：
```typescript
function someAction(state: ExpeditionState, ...args): { state: ExpeditionState; events: PveEvent[] }
```
- `state` 是新状态（不可变，不修改入参）
- `events` 是本次操作产生的副作用序列，Controller 顺序回放

### 事件回放顺序

`_replayEvents(events)` 按数组顺序处理，顺序即时间顺序。  
如需插入新副作用，在 core 函数里 `events.push(...)` 到正确位置，无需改 Controller 主流程。

### 存档触发时机

| 触发点 | 调用 |
|--------|------|
| 每回合结束 | `savePveFloor(snapshot)` |
| 楼层通关 | `savePveFloor(floorResult)` |
| 远征结算（死亡/完成）| `settlePveRun(finalReport)` |
