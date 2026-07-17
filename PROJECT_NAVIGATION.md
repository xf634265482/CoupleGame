# PROJECT_NAVIGATION.md

> 当前项目导航。排查 Bug / 实现功能时，先从这里定位入口，再打开具体代码。
> 当前 PVE 目标态以 `specs/260712-pve-persistent-floor-progression/design.md` 为准；旧命运树、旧 runSeed 远征存档链、旧 `PersistentFloorBattle*` 平行战斗链均不得作为新开发入口。

---

## 当前权威入口

### 大厅与场景

| 功能 | 当前入口 |
| --- | --- |
| 游戏启动 | `assets/scripts/core/GameApp.ts` |
| 场景切换 | `assets/scripts/core/SceneLoader.ts` |
| 大厅 UI / 远征入口 / 营地入口 | `assets/scripts/lobby/PveLobbyController.ts` |
| 远征战斗场景 | `assets/scripts/pve/controllers/ExpeditionController.ts` 挂载于 `assets/scenes/pve_expedition.scene` |
| 营地场景 UI | `assets/scripts/pve/controllers/CampController.ts` + `assets/scripts/pve/views/CampView.ts` |

### 永久逐层远征

| 职责 | 当前入口 |
| --- | --- |
| 挑战生命周期编排 | `assets/scripts/pve/core/PersistentFloorFlow.ts` |
| 持久化运行时 / 目标 / 命痕事件桥 | `assets/scripts/pve/core/PersistentExpeditionRuntime.ts` |
| 章节路由（全局层 1–14） | `assets/scripts/pve/core/chapterRouting.ts` |
| 第一章楼层目录 | `assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts` |
| 第一章确定性楼层生成 | `assets/scripts/pve/core/chapter1/Chapter1FloorGenerator.ts` |
| 第一章正式 ExpeditionState/FloorState 工厂 | `assets/scripts/pve/core/chapter1/Chapter1ExpeditionFactory.ts` |
| 第二章楼层目录 / 生成 / 工厂 | `assets/scripts/pve/core/chapter2/Chapter2FloorCatalog.ts` / `Chapter2FloorGenerator.ts` / `Chapter2ExpeditionFactory.ts` |
| 装备模板库（中文名） | `assets/scripts/pve/core/EquipmentSystem.ts` |
| 装备图标映射 / 分包加载 | `assets/scripts/pve/EquipmentCatalog.ts` / `EquipmentResourceLoader.ts` |
| 永久层装备掉落（无词条） | `assets/scripts/pve/core/equipment/FixedEquipmentLoot.ts` |
| 第二章机制（哨卫降压 / 轻沙暴 / 沙坑扩张） | `chapter2/HuntPressure.ts` / `LightSandstorm.ts` / `SandPitExpansion.ts` |
| 固定武器与职业上下文攻击 | `assets/scripts/pve/core/PersistentCombatRules.ts` |
| 命痕目录 / 展示 / 战斗桥 | `assets/scripts/pve/core/minghen/MinghenCatalog.ts` / `MinghenDisplay.ts` / `MinghenCombatBridge.ts` |
| 前端网络 API | `assets/scripts/network/PveProgressionService.ts` |
| 云端挑战生命周期 | `cloudfunctions/common/pve/PveChallenge.js` |
| 云端玩家永久档案 | `cloudfunctions/common/pve/PveProfile.js` |
| 云端挑战校验 | `cloudfunctions/common/pve/PveChallengeValidate.js` |

### 原战斗主链（仍是当前唯一表现/输入主链）

| 功能 | 当前入口 |
| --- | --- |
| 玩家移动 | `assets/scripts/pve/core/MovementSystem.ts` |
| 玩家攻击 / 地形攻击 | `assets/scripts/pve/core/CombatSystem.ts` |
| 回合结束 / 怪物回合 | `assets/scripts/pve/core/ExpeditionState.ts` 的 `endTurn()` |
| 怪物 AI | `assets/scripts/pve/core/MonsterAI.ts` |
| 钥匙 / 出口 / 传送门 / 特殊实体交互 | `assets/scripts/pve/core/FloorRules.ts` + `NeutralEntities.ts` |
| 战场渲染 | `assets/scripts/pve/views/FogMapView.ts` |
| HUD | `assets/scripts/pve/views/PveHudView.ts`（右上「目标」= 本层通关条件，不是词条） |
| 战报 | `assets/scripts/pve/views/PveMessageLog.ts` |
| 弹窗 / Toast / 选择 | `assets/scripts/pve/views/PveToastView.ts` |

### 营地

| 功能 | 当前入口 |
| --- | --- |
| 营地控制器 | `assets/scripts/pve/controllers/CampController.ts` |
| 营地布局与交互 | `assets/scripts/pve/views/CampView.ts` |
| 命痕台布局 | `assets/scripts/pve/views/CampMinghenLayout.ts` |
| 营地档案读写 | `assets/scripts/network/PveProgressionService.ts` |
| 云端配置校验 | `cloudfunctions/common/pve/PveProgression.js` |

### 资源与分包

| 功能 | 当前入口 |
| --- | --- |
| UI 资源缓存 / critical native 清单 | `assets/scripts/ui/UiAssets.ts` |
| 章节背景 / 分包加载 | `assets/scripts/pve/ChapterResourceLoader.ts` |
| 构建后微信分包 patch | `scripts/patch-wechatgame-config.js` |

---

## 已删除或历史实现：不要作为入口

这些名字可能还存在于历史文档、旧计划或测试注释里，但不再是当前开发入口：

| 历史项 | 当前状态 |
| --- | --- |
| `assets/scripts/pve/controllers/PersistentFloorBattleController.ts` | 已删除；禁止恢复第二套移动/攻击/回合/表现链 |
| `assets/scripts/pve/core/PersistentFloorBattle.ts` | 已删除 |
| `assets/scripts/pve/views/PersistentFloorBattleView.ts` | 已删除 |
| `assets/scripts/pve/core/PersistentFloorBattleState.ts` | 已删除 |
| `assets/scripts/pve/core/chapter1/Chapter1Runtime.ts` | 已删除；正式运行使用 `Chapter1ExpeditionFactory` + `PersistentExpeditionRuntime` |
| `assets/scripts/pve/controllers/DestinyTreeController.ts` | 已删除；命运树入口已被营地替代 |
| `assets/scripts/pve/views/DestinyTreeView.ts` | 已删除 |
| `assets/scripts/ui/OptionListUi.ts` | 已删除；选择类弹窗走 `PveToastView` |
| `assets/scripts/platform/wechat/WxGameNameInput.ts` | 已删除 |
| `assets/scripts/network/PveService.ts` 的旧 `startRun/loadPveSave/savePveFloor/settlePveRun` | 历史旧远征链；云端 action 已移除，不得调用 |
| `cloudfunctions/common/pve/PveSave.js` 的旧 runSeed 存档链 | 仅保留未路由的历史兼容源码；当前逐层挑战与体力只以 `PveChallenge/PveProfile` 为准 |
| 命运树 UI / 命运树解锁 / 命运树重置 | 历史系统；当前大厅原入口为营地 |

---

## 常见问题从哪里查

| 问题 | 先看 |
| --- | --- |
| 进远征不是选中楼层 / 继续错楼层 | `PveLobbyController.ts` → `GameSession.pendingPveFloor` → `PersistentFloorFlow.bootstrap()` |
| 战场移动/攻击/交互表现异常 | `ExpeditionController.ts` → `_apply()` / `_playFxFor()` / `FogMapView.ts` |
| 传送门、出口、钥匙、祭坛交互异常 | `FloorRules.ts` / `NeutralEntities.ts` / `PersistentExpeditionRuntime.ts` |
| 怪物图标不显示、红方块、资源加载失败 | `FogMapView.ts` 的 artMap + `UiAssets.ts` + `ChapterResourceLoader.ts` |
| 营地命痕/装备配置没保存 | `CampController.ts` / `PveProgressionService.ts` / `PveProgression.js` |
| GM 重置后仍有残留 | `cloudfunctions/common/admin/AdminToolService.js` + `PveProfile.js` / `PveChallenge.js` |
| 云函数改动未生效 | 只改 `cloudfunctions/common/**` 后运行 `node scripts/sync-cloud-common.js`，再部署对应云函数 |

---

## 文档权威顺序

1. 当前 PVE 目标态：`specs/260712-pve-persistent-floor-progression/design.md`
2. 当前 PVE 总设计入口：`specs/260608-pve-destiny-expedition/design.md`
3. 代码导航：本文件
4. 调用链：`CALL_FLOW.md`
5. 历史资料：`specs/game-design/**`、`specs/260610-destiny-tree-ui/**`、`specs/260628-destiny-tree-v2/**` 等。历史资料只供追溯，不作为当前实现依据。

## 2026-07-17 当前系统边界

- 正式 PVE 内容仅开放全局第 1–14 层；客户端入口为 `chapterRouting.ts`，云端校验入口为 `cloudfunctions/common/pve/PveChallengeValidate.js`。
- 职业只保留战士、弓手、游侠三套当前机制与熟练度；旧晋升、觉醒、职业碎片不是有效入口。
- 遗物、成就、图鉴业务已删除；历史源码说明和数据库旧字段不得作为运行时入口。
- 排行榜只读取 `users.pveProfile.highestClearedFloor`，同层按 `highestClearedAt` 先到先得。
- 广告只保留通用平台层与未接线的 `restore_stamina` 协议；当前没有广告 UI 或体力发放路由。
