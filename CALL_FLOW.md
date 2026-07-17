# CALL_FLOW.md

> 当前调用链速查。本文只记录当前有效主链；旧命运树、旧 runSeed 远征存档、旧 `PersistentFloorBattle*` 平行战斗链不再作为当前流程。

---

## 1. 启动到大厅

```text
GameApp.onLoad()
  -> 微信云初始化
  -> 登录与 resources 分包可并行；登录不阻塞等整包 resources
  -> SceneLoader.loadLobby()（启动读条止于 0.92）
  -> lobby.scene / PveLobbyController
       -> 读条从 0.55 续跑；preloadPveLobbyUi 只拉主包大厅 critical native
       -> 首屏绘制后 hide overlay
       -> 后台 ensureResourcesBundle + preloadPveCampUi + loadPveProfile + playMainBgm
```

---

## 2. 进入营地

```text
[Lobby] PveLobbyController 点击“营地”
  -> _ensureWarmReady（现有 LoadingOverlay 短等预热完成）
  -> CampController.open()
  -> PveProgressionService.loadPveProfile()
  -> [Cloud] cloudfunctions/pve/index.js action=loadProfile
  -> [Cloud] PveProgression.loadProfile()
  -> CampView 渲染：命痕台 / 装备台 / 远征情报 / 角色区
```

### 营地保存配置

```text
CampView.onSelectProfession / onEquip / onMinghenLoadout
  -> CampController 更新本地配置
  -> PveProgressionService.updateCampConfiguration()
  -> [Cloud] PveProgression.updateCampConfiguration()
  -> 校验职业已解锁、装备/命痕归属、无非法槽位
  -> 写回 users.pveProfile（允许挑战进行中改档；当前层仍用开局快照）
```

---

## 3. 选择楼层并进入远征

```text
[Lobby] PveLobbyController 点击“远征”
  -> 加载 PveProfile（选层弹窗，不挡分包）
  -> 展示可挑战楼层 / 可继续挑战
  -> 用户选择楼层
  -> _ensureWarmReady（现有 LoadingOverlay 短等）
  -> GameSession.pendingPveFloor = selectedFloor
  -> SceneLoader.loadPveExpedition()
  -> pve_expedition.scene / ExpeditionController.onLoad()
```

---

## 4. 战斗场景初始化

```text
ExpeditionController.onLoad()
  -> _buildUi()（空 HUD/地图先建好，但被 LoadingOverlay 盖住）
  -> LoadingOverlay.show「正在进入远征…」
  -> _bootstrap()
       -> 读取 GameSession.pendingPveFloor
       -> PersistentFloorFlow.bootstrap(selectedFloor)
         -> PveProgressionService.loadPveProfile()
         -> PveProgressionService.loadActiveFloorChallenge()
         -> 必要时 startFloorChallenge()
           -> [Cloud transaction] 恢复同一 ACTIVE 挑战：返回原挑战，扣费 0
           -> [Cloud transaction] 新挑战：首次第 1 层教程免费，否则从 pveProfile 扣 5 体力
           -> 体力不足：保持原 ACTIVE 挑战不变并返回 PVE_STAMINA_INSUFFICIENT
           -> 返回扣费后的权威 profile，客户端据此创建 runtime
         -> create/resume PersistentExpeditionRuntime
         -> chapterRouting.chapterIdForFloor(selectedFloor)
         -> Chapter1ExpeditionFactory 或 Chapter2ExpeditionFactory 生成 ExpeditionState/FloorState
       -> _ensureChapterReady（章节资源；成功不关 overlay）
       -> _refreshAll() 画出真实 HUD/地图
       -> LoadingOverlay.hide()
       -> 播放 initialPersistentPresentationEvents()
```

HUD 右上「目标」按钮：

```text
PveHudView「目标」
  -> 默认 _toggleObjectivePopup()
  -> 文案来自 Chapter1Objectives / Chapter2Objectives（本层通关条件；不含可选目标）
  -> 不是灵气/职业强化词条弹窗（该入口已退役）
```

---

## 5. 玩家移动

```text
方向按钮 / 键盘 / 点击格子
  -> ExpeditionController._onMove()
  -> MovementSystem.applyMove(state, direction)
  -> ExpeditionController._apply(result)
    -> applyPersistentBattleResult(runtime, result)
    -> syncRuntimeFromExpedition()
    -> _playEvents(result.events)
    -> FogMapView / HUD / 战报刷新
    -> _queuePersistentSave()
```

要查移动动画、重影、闪烁，优先看：

- `ExpeditionController._playFxFor()`
- `FogMapView.setOccupantVisible()`
- `FogMapView.clearOccupantVisibilitySuppression()`

---

## 6. 玩家攻击

```text
点击棋盘格子
  -> FogMapView onCellTap
  -> ExpeditionController._onTapCell()
     - 已揭示格上有怪物/实体：focusMonster / focusEntity，刷新左上角目标卡（不直接攻击/互动）
     - 教学「点怪普攻」步骤例外：点怪仍直接攻击
     - 空地 / 迷雾格：朝该方向移动一步（不清除选中）

攻击按钮
  -> ExpeditionController._onAttack()
  -> 优先已点选且在攻击范围内的怪物/冰墙；否则取最近可攻击目标
  -> PersistentCombatRules.applyPersistentAttack()
    -> 固定武器 / 职业 / 命痕上下文
  -> CombatSystem.playerAttack(state, target, context)
  -> ExpeditionController._apply(result)
  -> MinghenCombatBridge / PersistentExpeditionRuntime 同步目标与命痕状态
  -> _playEvents(ATTACK/KILL/LOOT/PLAYER_DAMAGED...)
     ATTACK：按受击格（若同批有目标 MOVE，用 MOVE.from）判定近战/远程；
             远程 → 箭矢 `_playRangedShot`；有武器近战 → 剑弧 `_playMeleeSlash`；
             空装近战 → lunge `_playMeleeLunge`；await 结束后再回放后续 MOVE
  -> _queuePersistentSave()
```

---

## 7. 交互：钥匙、出口、传送门、祭坛、爆破物

```text
交互按钮
  -> ExpeditionController._onInteract()
  -> 根据当前位置/邻近实体选择交互对象（同格优先 PORTAL）
  -> FloorRules 或 NeutralEntities:
     - pickKey()
     - openExit()
     - interactPortal()   // 不耗 AP；真正 FLOOR_CLEARED / 通关弹窗
     - activateGunpowderBarrel()  // 永久狂暴 + rushMonstersTowardPlayer(2)：冲锋后射程内立刻攻击
     - detonateBlastTarget()
     - useAltar()/useIdol()/useHotSpring()
       // 永久逐层：useAltar 不发旧灵气；第 6 层 WAVE_SPAWN_MARKER（旧 WAVE_ALTAR_*）禁止交互
  -> ExpeditionController._apply(result)
  -> PersistentExpeditionRuntime 更新目标状态
```

永久第一层：取得钥匙即完成目标并刷通关门（`PORTAL_SPAWNED` 与门同时出现在钥匙格）。他层同理——击杀精英/清波等目标完成当下刷门。**不**自动踏门；玩家再点「互动」才 `interactPortal` 弹通关/命痕。刚刷门的那次 apply 会丢弃排队互动，避免连点立刻通关。

火药桶 / 爆破点图标：`pve/map/icon_gunpowder_barrel`、`pve/map/icon_blast_target`（`UiAssets` UUID + `PVE_MAP_KEYS` + FogMapView artMap）。

> 永久逐层：`addAnima` 仅累加灵气资源，不再 emit `ANIMA_STRENGTHEN`；`AffixSystem` / `ScrollSystem` / 铁匠 `equip_*` 洗炼已从代码删除（非 gate）。

传送门/红方块/图标问题分两层查：

1. 逻辑是否生成正确实体：`FloorRules.ts` / `PersistentExpeditionRuntime.ts`
2. 图标是否能渲染：`FogMapView.ts` 的 artMap + `UiAssets.ts`

---

## 8. 回合结束

```text
结束回合按钮 / AP 自动耗尽
  -> ExpeditionController._onEndTurn()
  -> ExpeditionState.endTurn(state)
    -> 怪物 AI / 状态 tick / 新 AP
  -> ExpeditionController._apply(result)
  -> _playEvents：连续 MOVE/ATTACK 跨实体并行回放（同实体多步仍串行）
  -> PersistentExpeditionRuntime 同步目标、命痕、职业资源
  -> _queuePersistentSave()（动画/_busy 结束后再 stringify + 云存档，避免抢帧）
```

> 第 10 层等无迷雾多怪层：串行 await 每步移动会长时间占住 `_busy`，表现为移动/交互/蓄力全延迟。战士蓄力仅改本地 UI，动画期间仍可点。
> 第 7 层 Boss：增援后同帧大量攻击 SFX / 云存档序列化易打断 tween；SFX 同帧封顶，存档避开 `_busy`。

---

## 9. 后台保存运行时

```text
ExpeditionController._queuePersistentSave()
  -> debounce
  -> PersistentFloorFlow.save()
  -> PveProgressionService.saveFloorChallengeRuntime()
  -> [Cloud] PveChallenge.saveRuntime()
  -> 校验 ACTIVE challenge + runtime version/turn 单调
  -> 写入 runtimeSave
```

返回大厅前：

```text
ExpeditionController._onQuitRequested()
  -> _flushPersistentSave()
  -> SceneLoader.loadLobby()
```

---

## 10. 楼层结算与进入下一层

```text
PersistentExpeditionRuntime.status != ACTIVE
  -> ExpeditionController._apply：传门通关前 flush ACTIVE runtime
  -> ExpeditionController._handleFloorCleared()
     -> Boss 通关：立刻 preloadChapter(next)（不等云端 flush）
     -> 先弹命痕三选一，再 settle；busy 期间互动会排队补执行
  -> PersistentFloorFlow.settle(selection)
     （附带局内 lootedEquipment + equipmentLoadout；非通关选装）
  -> PveProgressionService.settleFloorChallenge()
  -> [Cloud] PveChallenge.settle()
    -> 幂等处理终态
    -> 击杀掉落入账 equipmentInventory，并写回 equipmentLoadout（CLEAR/DEAD/WITHDRAW 均保留）
    -> CLEAR 写入 floorRecords / 解锁下一层 / 发命痕与金币奖励
    -> DEAD/WITHDRAW 清 activeChallengeId
    -> 临时 TransactionBusy/Conflict 最多同请求重试 4 次
  -> 用户选择继续下一层或返回营地
```

> 说明：战内不再扫描/上传成就与图鉴（无正式内容与独立 UI）；`updatePveMeta` 仅保留教学完成等必要局外标记。装备由击杀掉落自动穿戴，结算入永久背包；继续远征按更新后的 loadout 带装。
> 章节预热：进入 Boss 前一层 / Boss 层时即 `preloadChapter(chapter+1)`，避免「通关后才开始下分包」。

跨章继续下一层：

```text
用户点「继续远征」且 clearedFloor 为章末 Boss
  -> LoadingOverlay.show「正在进入第N章…」
  -> Promise.all([
       ensureChapterAssets(nextChapter),   // 分包+背景+地图图（可命中预热）
       PersistentFloorFlow.continueNextFloor()  // 云端开下一层
     ])
  -> _ensureChapterReady 兜底（已就绪则瞬时返回）
  -> 刷新 runtime/state/UI，hide overlay
```

同章继续下一层：

```text
PersistentFloorFlow.continueNextFloor()
  -> start/load next active challenge
  -> ExpeditionController 刷新 runtime/state/UI
```

---

## 11. GM 重置

```text
gm-web
  -> cloudfunctions/adminTool
  -> cloudfunctions/common/admin/AdminToolService.js
  -> PveProfile reset/cleanup
  -> PveChallenge active challenge cleanup
  -> 返回实际 post-cleanup counts
```

云函数源码规则：

```text
只改 cloudfunctions/common/**
  -> node scripts/sync-cloud-common.js
  -> 部署对应云函数
```

## 当前边界调用链（2026-07-17）

```text
大厅选择第 1–14 层
  -> chapterRouting.isFloorContentReady
  -> PveService.startFloorChallenge
  -> cloudfunctions/common/pve/PveChallengeValidate.js（再次校验 ≤ 14）
  -> PveChallenge 事务扣除 5 体力并创建挑战

通关结算
  -> PveChallengeState.applyChallengeSettlement
  -> 同事务更新 pveProfile.highestClearedFloor / highestClearedAt
  -> db.listPveLeaderboard 只按 pveProfile 排行
```

旧职业成长、遗物、成就、图鉴和旧 PVE 广告奖励均无调用链；数据库中的历史根字段不再参与当前玩法判断。
