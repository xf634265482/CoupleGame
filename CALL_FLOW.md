# CALL_FLOW.md

> 当前调用链速查。本文只记录永久逐层挑战主链。

---

## 1. 启动到大厅

```text
GameApp.onLoad()
  -> 微信云初始化
  -> 登录与 resources 分包可并行；登录不阻塞等整包 resources
  -> SceneLoader.loadLobby()（启动读条止于 0.92）
  -> lobby.scene / PveLobbyController
       -> 读条从 0.55 续跑；preloadPveLobbyUi 只拉主包大厅 critical native
       -> applyScreenBackground（await 后重读 visibleDesignSize；过期 apply 丢弃）
       -> refreshScreenAdapt / ensureScreenBackground：尺寸变化时同步重铺 ScreenBg/Art，避免长屏底部黑边
       -> 首屏绘制后 hide overlay
       -> 后台并行：loadPveProfile / loadActiveFloorChallenge（营地·商会·选层可瞬时开）
                    + ensureEquipmentAssetsForFloor（装备图标）
                    + ensureResourcesBundle + playMainBgm
                    + preloadPveExpedition + preloadPartnerIconBundle
```

---

## 2. 进入营地

```text
[Lobby] PveLobbyController 点击“营地”
  -> 有 _warmedProfile 则立刻 CampController.open（不再等 resources 预热）
  -> 无档案时仅短等 loadPveProfile
  -> CampView 立刻渲染命痕/装备/情报/角色（装备图标后台补齐，进厅后已开始预热）
     （角色区：已解锁职业卡调用 previewCampCombatStats 显示攻击/生命/护甲/射程预览）
     （命痕台只负责装配/库存/方案；不含每日商会）
```

## 2.1 进入伙伴

```text
[Lobby] PveLobbyController 底栏「伙伴」（排行榜与远征之间）
  -> PartnerController.open()
  -> loadPveProfile / updateCampConfiguration(equippedPartnerId) / manageCamp(PARTNER EVOLVE)
  -> PartnerView 列表/详情/装备/进化
```

### 战斗内伙伴技能

```text
[Expedition] HUD「伙伴」
  -> ExpeditionController._onPartnerSkill
  -> applyPartnerSkillToRuntime / usePartnerSkill
  -> 需选格/选敌时 _partnerAim + 点地图确认
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

### 大厅今日商会

```text
[Lobby] 右侧「商会」浮标
  -> 有 _warmedProfile 则立刻 MinghenShopController.open（不再等 resources）
  -> MinghenShopView：星尘池 / 命痕兑换（字形格同营地 CAMP_SLOT_SIZE；广告刷新按钮暂隐藏）
  -> manageCamp(MINGHEN_BUY_STARDUST | MINGHEN_EXCHANGE | MINGHEN_REFRESH_SHOP)
  -> [Cloud] PveMinghenShop.js
```

### 大厅邮箱

```text
[Lobby] 左上头像卡下方「邮箱」
  -> listMails（红点 unreadCount；打开时有缓存先立刻展示再刷新）
  -> MailView：列表 / 详情 / 领取 / 删除 / 一键领取
  -> 领取/删除/已读：乐观更新本地列表与红点，再调云端；失败回滚
  -> claimMail / claimAllMails / deleteMail / markMailRead（成功后用返回值更新星尘/体力，不再阻塞等 listMails）
  -> [Cloud] cloudfunctions/pve action → PveMailService
  -> claimAllMails：单次事务批量入账（分块 ≤15），避免 N 次串行事务
  -> 星尘入账 pveProfile.gold；体力入账 pveStamina（封顶）
  -> 大厅刷新星尘芯片与体力条

[GM] gm-web「发送邮件」
  -> adminTool sendMail | sendMailBroadcast
  -> AdminToolService → createMailForUser（广播同 batchId，≤500）
```

### 大厅签到

```text
[Lobby] 左上头像卡下方「签到」（邮箱旁；红点 = 今日未签或有可领累计）
  -> getCheckInState / signCheckInToday / makeupCheckIn / claimCheckInMilestone
  -> CheckInView：月历每日奖 / 补签选日 / 累计里程碑领取
  -> [Cloud] pve action=checkIn → PveCheckIn.handleCheckInAction
       GET_STATE | SIGN_TODAY | MAKEUP | CLAIM_MILESTONE
  -> 入账 gold / materials / checkIn.makeupCards；换月重置 signedDays 与 claimedMilestones
  -> 返回 checkIn 状态 + profile 片段；大厅刷新星尘芯片与红点

[GM] gm-web「资源调整」补签卡
  -> adminTool adjustResources resourceType=makeupCards
  -> 写入 pveProfile.checkIn.makeupCards
```

---

## 3. 选择楼层并进入远征

```text
[Lobby] PveLobbyController 点击“远征”
  -> 优先用已缓存的 PveProfile / activeChallenge 立刻弹出选层（不空等云 RTT）
  -> 后台静默刷新档案缓存
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
       -> 大厅确认楼层时已 preloadChapter；进战再与云端并行 ensureChapterAssets
       -> 同一条 LoadingOverlay 更新进度（不再二次 show「进入第N章」）
       -> loadPveMeta（含 balanceSnapshot）
          → PersistentFloorFlow.bootstrap(..., { balanceSnapshot })
          → createPersistentFloorRuntime → ChapterFactory（灌入玩家覆盖；续玩不重灌）
       -> _ensureChapterReady({ reuseOverlay: true })（已就绪则瞬时返回）
       -> _refreshAll() 画出真实 HUD/地图
       -> LoadingOverlay.hide()
```

> 进战加速：已删除的 HUD/弹窗图不再加入 preload；主包 native 缺图 `accessSync` 立刻失败，避免 6×150ms 空重试。
> 续玩第 2 章：选层/确认时预热 `chapter_2`，避免「远征读条结束后再弹一次进章读条」。

HUD 右上「目标」按钮：

```text
PveHudView「目标」
  -> 默认 _toggleObjectivePopup()
  -> 文案来自 Chapter1Objectives / Chapter2Objectives（本层通关条件；不含可选目标）
  -> 展示当前楼层目标与战斗状态
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
  -> 优先已点选且在攻击范围内的怪物；否则可破坏地形（ICE_WALL / ROCK）；再否则最近可攻击目标
  -> 怪物：PersistentCombatRules.applyPersistentAttack() / CombatSystem.playerAttack
  -> 冰墙：CombatSystem.attackIceWall；石块：CombatSystem.attackRock
  -> ExpeditionController._apply(result)
  -> _playEvents(ATTACK/...)
     ATTACK：targetId 先查怪物，未命中再查固定实体（冰墙/石块）；
             按受击格判定近战/远程；远程 → 箭矢；有武器近战 → 光剑；空装 → lunge
             地形击碎当帧若 EntityArt 已清空，用临时锚点承载闪白/伤害数字
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

> 永久逐层：`addAnima` 仅累加灵气资源；铁匠只处理当前装备目录与换装流程。

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
  -> ExpeditionController._apply：传门通关前停掉后台 ACTIVE 存档（等在途结束，不再强制 flush）
  -> ExpeditionController._handleFloorCleared()
     -> Boss 通关：立刻 preloadChapter(next)
     -> 命痕三选一（如有）
     -> PersistentFloorFlow.beginDeferredSettle(selection)
        -> 本地 PendingSettlementStore 落单
        -> 乐观清 activeChallengeId
        -> 后台 settle（超时/Busy 可重试，幂等）
     -> 立刻弹「继续远征 / 返回大厅」（不因云端超时卡住）
  -> 用户点「继续远征」
     -> LoadingOverlay「正在同步进度…」
     -> ensureSettled()（等后台完成或补推）
     -> continueNextFloor() → start 下一层
     -> 长时间仍失败：遮罩外「再试一次 / 返回大厅」
  -> 返回大厅 / 大厅 warm / bootstrap：flushPendingFloorSettlement 补推本地待结算
  -> [Cloud] PveChallenge.settleFloorChallenge()
    -> runTransactionWithRetry
    -> 幂等终态；CLEAR 写 floorRecords / 解锁 / 发奖
```

> 说明：`updatePveMeta` 负责教学完成等账户标记。装备由击杀掉落自动穿戴，结算入永久背包；继续远征按更新后的 loadout 带装。
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
大厅选择第 1–35 层
  -> chapterRouting.isFloorContentReady
  -> PveService.startFloorChallenge
  -> cloudfunctions/common/pve/PveChallengeValidate.js（再次校验 ≤ 28）
  -> PveChallenge 事务扣除 5 体力并创建挑战

通关结算
  -> PveChallengeState.applyChallengeSettlement
  -> 同事务更新 pveProfile.highestClearedFloor / highestClearedAt
  -> db.listPveLeaderboard 只按 pveProfile 排行
```
