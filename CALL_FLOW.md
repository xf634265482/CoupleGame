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
  -> 写回 users.pveProfile
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
ExpeditionController._bootstrap()
  -> 读取 GameSession.pendingPveFloor
  -> PersistentFloorFlow.bootstrap(selectedFloor)
    -> PveProgressionService.loadPveProfile()
    -> PveProgressionService.loadActiveFloorChallenge()
    -> 必要时 startFloorChallenge()
    -> create/resume PersistentExpeditionRuntime
    -> Chapter1ExpeditionFactory 生成正式 ExpeditionState/FloorState
  -> ExpeditionController._state = runtime.battleState.expedition
  -> FogMapView / PveHudView / PveMessageLog / PveToastView 刷新
  -> 播放 initialPersistentPresentationEvents()
```

HUD 右上「目标」按钮：

```text
PveHudView「目标」
  -> 默认 _toggleObjectivePopup()
  -> 文案来自 Chapter1Objectives（主目标）+ Chapter1OptionalObjectives（可选目标）
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
攻击按钮 / 目标选择
  -> ExpeditionController._onAttack()
  -> PersistentCombatRules.applyPersistentAttack()
    -> 固定武器 / 职业 / 命痕上下文
  -> CombatSystem.playerAttack(state, target, context)
  -> ExpeditionController._apply(result)
  -> MinghenCombatBridge / PersistentExpeditionRuntime 同步目标与命痕状态
  -> _playEvents(ATTACK/KILL/LOOT/PLAYER_DAMAGED...)
     ATTACK：按受击格（若同批有目标 MOVE，用 MOVE.from）判定近战/远程；
             await 近战/远程动画结束后再回放后续 MOVE（哨兵受击逃跑等）
  -> _queuePersistentSave()
```

---

## 7. 交互：钥匙、出口、传送门、祭坛、爆破物

```text
交互按钮
  -> ExpeditionController._onInteract()
  -> 根据当前位置/邻近实体选择交互对象
  -> FloorRules 或 NeutralEntities:
     - pickKey()
     - openExit()
     - interactPortal()
     - activateGunpowderBarrel()  // 永久狂暴 + rushMonstersTowardPlayer(2)：冲锋后射程内立刻攻击
     - detonateBlastTarget()
     - useAltar()/useIdol()/useHotSpring()
       // 永久逐层：useAltar 不发旧灵气、不触发 ANIMA_STRENGTHEN；第 6 层 WAVE_ALTAR_* 禁止交互
  -> ExpeditionController._apply(result)
  -> PersistentExpeditionRuntime 更新目标状态
```

火药桶 / 爆破点图标：`pve/map/icon_gunpowder_barrel`、`pve/map/icon_blast_target`（`UiAssets` UUID + `PVE_MAP_KEYS` + FogMapView artMap）。

> 永久逐层：`addAnima` 对 `persistentFloorMode` no-op；Controller 丢弃 `ANIMA_STRENGTHEN`，不得再弹「灵气满溢·选择一项强化」。

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
  -> PersistentExpeditionRuntime 同步目标、命痕、职业资源
  -> _queuePersistentSave()
```

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
  -> ExpeditionController._prepareCloudSettlement()
     （flush ACTIVE runtime 存档，避免与 settle 抢写）
  -> ExpeditionController._settlePersistentFloor() / _handleFloorCleared()
  -> 如 CLEAR：弹出命痕选择（首通主题池三选一）
  -> PersistentFloorFlow.settle(selection)
  -> PveProgressionService.settleFloorChallenge()
  -> [Cloud] PveChallenge.settle()
    -> 幂等处理终态
    -> CLEAR 写入 floorRecords / 解锁下一层 / 发命痕与金币奖励
    -> DEAD/WITHDRAW 清 activeChallengeId
    -> 临时 TransactionBusy/Conflict 最多同请求重试 4 次
  -> 用户选择继续下一层或返回营地
```

> 说明：战内不再扫描/上传成就与图鉴（无正式内容与独立 UI）；`updatePveMeta` 仅保留教学完成等必要局外标记。

继续下一层：

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
