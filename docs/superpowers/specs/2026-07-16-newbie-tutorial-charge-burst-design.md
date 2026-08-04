# 新手教程重构：蓄力与破阵

> 日期：2026-07-16  
> 状态：已确认，待实现  
> 权威玩法同步目标：`specs/260608-pve-destiny-expedition/design.md`（修订条）  
> 关联：`specs/260712-pve-persistent-floor-progression/profession-progression.md`（战士蓄力 / 破阵 / 灵气）

## 1. 目标

1. **废弃旧教学内容**：删除「仅移动 → 普攻 → 钥匙 → 传送门」的旧步骤与过时脚本布局意图。
2. **新教程只教战士核心**：极短带过移动/普攻后，强制教会 **蓄力 1 级击杀** 与 **灵气爆发「破阵」+ 蓄力击杀**。
3. **重新挂回永久逐层启动链**：当前 `PersistentFloorFlow → createPersistentFloorRuntime` **不再**调用 `buildFirstTutorialFloor`；实现时必须在 floor 1 且 `tutorialCompleted !== true` 时注入脚本关。
4. **复用现有引导框架**：扩展 `TutorialGuideManager` / step config，而不是新写一套教程状态机 UI。

## 2. 非目标

- 不教游侠瞄准、潜行者连击、高级蓄力（2/3）、撞碎。
- 不在教程里实操「攒灵气」；破阵步骤前由系统灌满 `resources.spirit`。
- 不做老存档迁移 / 强制老玩家重做（产品未上线；测试账号手动清 `tutorialCompleted`）。
- 不重做引导 UI 框架；不新增独立教程场景。

## 3. 产品决策摘要

| 项 | 决策 |
|---|---|
| 教学范围 | 仅战士：蓄力 + 破阵 |
| 基础操作 | 极短带过（方案 C） |
| 挂载位置 | 替换第一次远征第 1 层（`tutorialCompleted`） |
| 蓄力深度 | 只教点 1 次蓄力再攻击 |
| 灵气来源 | 进入破阵步骤时直接灌满 |
| 怪物布置 | 两只怪：怪 A 练蓄力击杀，怪 B 练破阵蓄力击杀 |
| 实现路径 | 重写脚本关 + 扩展现有引导框架 |

## 4. 玩家流程

脚本关（小通道，约 6×6），默认/强制战士，全程强制引导（只允许当前步骤的格子或按钮）。

| 步骤 ID | 文案意图 | 允许操作 | 完成条件 |
|---|---|---|---|
| `move` | 每个回合有 AP，先点前方格子移动一步 | `TAP_CELL`（指定格） | 玩家到达指定坐标 |
| `basic_attack` | 靠近后点击怪物普攻 | `TAP_CELL`（怪 A） | 对怪 A 造成伤害（不要求击杀；怪 A 血量需撑过这一刀） |
| `charge` | 点「蓄力」投入 1 AP | `CHARGE` | `selectedChargeAp === 1` |
| `charge_kill` | 用蓄力攻击击杀怪 A | `TAP_CELL` / `ATTACK`（怪 A） | `KILL` 且目标为怪 A |
| （副作用） | 文案说明：命中/击杀会攒灵气；本教程直接灌满 | — | 进入下一步前 `resources.spirit = 100` |
| `burst` | 灵气已满，点「灵气爆发」开启破阵 | `SPIRIT_BURST` | `spiritBurstActive === true` |
| `burst_charge` | 破阵强化下一次蓄力攻击，再点一次蓄力 | `CHARGE` | `selectedChargeAp === 1` |
| `burst_kill` | 蓄力攻击击杀怪 B | `TAP_CELL` / `ATTACK`（怪 B） | `KILL` 且目标为怪 B |
| `key` | 前进拿钥匙 | `TAP_CELL` | `PICK_KEY` / `PORTAL_SPAWNED` |
| `portal` | 点互动通关 | `INTERACT` / `ANY`（钥匙格） | `FLOOR_CLEARED` |

通关后沿用现有逻辑：`isTutorialRun && floor === 1` → 写 `tutorialCompleted: true`。

## 5. 架构与改动边界

### 5.1 必须重接的启动链

```
大厅选第 1 层
  → PersistentFloorFlow.bootstrap
  → createPersistentFloorRuntime
  → [NEW] if floor===1 && meta.tutorialCompleted !== true
        使用 buildFirstTutorialFloor（或等价 builder）
        标记 expedition.isTutorialRun = true
        强制 professionId = WARRIOR
        注入 tutorialScenarioId + tutorialGuide
        挂 KEY_EXPLORE objective（与正式第 1 层同口径）
  → 否则走正式 Chapter1 生成
```

`tutorialCompleted` **只读/只写 `PveMeta`**（与现有 `ExpeditionController` 通关写回一致）。bootstrap 注入条件：`floor === 1 && meta.tutorialCompleted !== true`。

### 5.2 模块职责

| 模块 | 职责 |
|---|---|
| `tutorial/TutorialConfigs.ts` | 脚本地图（两怪、钥匙、岩石通道）、步骤表、灌灵气钩子声明 |
| `tutorial/TutorialTypes.ts` | 扩展 `TutorialStepAction`：`CHARGE` / `SPIRIT_BURST`；可选 `completeOnChargeAp` / `completeOnSpiritBurst` / `onEnterFillSpirit` |
| `tutorial/TutorialGuideManager.ts` | bind / 拦截 / 推进；支持新完成条件 |
| `PersistentExpeditionRuntime.ts`（或 Chapter1 factory 入口） | floor1 教程注入 |
| `ExpeditionController.ts` | `_onCharge` / `_onSpiritBurst` / 攻击与点格走 `_isTutorialBlocked`；步骤切换时执行灌灵气；高亮当前按钮 |
| `PveHudView.ts` | 可选：蓄力/爆发按钮高亮 API（轻量，不重做 HUD） |
| `FogMapView` | 继续用现有 tutorial overlay 高亮允许格 |

### 5.3 与永久逐层规则的对齐

- 灵气爆发读 **`runtime.resources.spirit`**（0–100），不是旧 `addAnima` 三选一。
- 破阵：`activateSpiritBurst`；战士破阵强化**下一次蓄力攻击**（规则上未手动蓄力也会按至少 1 级解析，但教程仍强制再点蓄力）。
- 脚本关清关仍走钥匙 → 传送门 → `FLOOR_CLEARED`。启动链注入时须挂上与第 1 层一致的 **KEY_EXPLORE objective**（或等价可完成状态），禁止另开一套专用 clear 路径，避免永久逐层双轨。

## 6. 边界情况

- **AP**：脚本关给足 AP，主课步骤内尽量不强迫结束回合；若必须跨回合，步骤文案明确指引。
- **误操作**：非允许格子/按钮拦截 + 短 toast。
- **中途退出**：未通关不写 `tutorialCompleted`；再次进入第 1 层仍进脚本关；若有层内存档，应恢复 `tutorialGuide.currentStepId`。
- **职业**：大厅选了非战士，进教程关仍强制战士机制与文案。
- **已完成教程**：`tutorialCompleted === true` 时进正式第 1 层；测试清标记即可重进。

## 7. 验收口径

1. 未完成教程账号，经永久逐层路径第一次进第 1 层，必进脚本关（有引导文案与格子高亮）。
2. 不完成「蓄力击杀怪 A」与「破阵后蓄力击杀怪 B」无法拿到钥匙出门。
3. 进入 `burst` 步前 `spirit === 100`，爆发按钮可点并被引导。
4. 通关后 `tutorialCompleted === true`；再进第 1 层为正式 Chapter1 地图。
5. 单测覆盖：步骤推进、非法 `CHARGE`/`SPIRIT_BURST`/点格拦截、灌灵气副作用、启动链在 `tutorialCompleted` 真/假下的分支。

## 8. 文档同步（实现时）

- 在 `specs/260608-pve-destiny-expedition/design.md` 顶部增加修订条：新手教程改为战士蓄力 + 破阵脚本关，并说明挂在永久逐层 floor1。
- 如 `CALL_FLOW.md` / `PROJECT_NAVIGATION.md` 仍指向旧教程启动路径，实现时一并修正。

## 9. 测试计划（实现阶段）

- `test/pve/`：TutorialGuideManager 纯逻辑单测。
- 启动链：`createPersistentFloorRuntime` / bootstrap 相关测例，断言教程注入与跳过。
- 手工：清 `tutorialCompleted` → 进第 1 层完整走一遍 → 再进确认正式关。
