# PROJECT_NAVIGATION.md
> 2026-06-29 PVP 棋盘对战已彻底移除，仅保留 PVE「命运远征」。发布入口：`assets/scripts/lobby/PveLobbyController.ts`。
> 代码导航索引。排查 Bug / 实现新功能时，**先查本文定位入口，再开文件**，避免盲目全局搜索。
> 更新规则：改动涉及新系统或重命名文件时，同步更新本文。

---
## 2026-07 新营地入口

- 新营地控制器：`assets/scripts/pve/controllers/CampController.ts`
- 新营地四区域视图：`assets/scripts/pve/views/CampView.ts`
- 营地档案/配置网络入口：`assets/scripts/network/PveProgressionService.ts`
- 云端营地配置权威入口：`cloudfunctions/common/pve/PveProgression.js`

---
## 2026-07 第一章纵向切片入口

- 七层内容目录：`assets/scripts/pve/core/chapter1/Chapter1FloorCatalog.ts`
- 确定性生成：`assets/scripts/pve/core/chapter1/Chapter1FloorGenerator.ts`
- 单层运行适配：`assets/scripts/pve/core/chapter1/Chapter1Runtime.ts`
- 第 6/7 层机制状态机：`assets/scripts/pve/core/chapter1/Chapter1Encounters.ts`

---

## 目录

- [架构总览](#架构总览)
- [PVE 模块](#pve-模块)
  - [01 战斗系统](#01-战斗系统)
  - [02 怪物系统](#02-怪物系统)
  - [03 Boss 系统](#03-boss-系统)
  - [04 词条/强化系统](#04-词条强化系统)
  - [05 装备系统](#05-装备系统)
  - [06 职业系统](#06-职业系统)
  - [07 命运树系统](#07-命运树系统)
  - [08 地图生成系统](#08-地图生成系统)
  - [09 迷雾系统](#09-迷雾系统)
  - [10 非战斗交互系统](#10-非战斗交互系统)
  - [10b 楼层通关系统](#10b-楼层通关系统)
  - [11 存档系统](#11-存档系统)
  - [12 PVE UI 系统](#12-pve-ui-系统)
  - [13 事件系统（PVE）](#13-事件系统pve)

- [公共基础层](#公共基础层)
  - [15 应用启动](#15-应用启动)
  - [16 网络层](#16-网络层)
  - [17 UI 公共组件](#17-ui-公共组件)
  - [18 音频系统](#18-音频系统)
  - [19 微信平台适配](#19-微信平台适配)
- [云函数层](#云函数层)
  - [20 PVE 云函数](#20-pve-云函数)

- [已知问题与命名混乱](#已知问题与命名混乱)

---

## 架构总览

```
用户操作
  │
  ▼
controllers/          ← 输入编排层（Cocos Component，处理触摸/点击）
  │  调用纯函数
  ▼
pve/core/             ← 纯逻辑层（零框架依赖，可独立 jest 测试）
  │  返回 { state, events[] }
  ▼
views/                ← 渲染层（消费 events 数组，驱动 Label/Graphics）
  │
  ▼
network/PveService    ← 网络层（云端存档/校验）
  │
  ▼
cloudfunctions/pve/   ← 云端权威（结算、防作弊）
```

**PVE 三层铁律**：core 不 import cc，不直接 Math.random()；view 不持有游戏状态；controller 是唯一的状态更新者。

---

## PVE 模块

### 01 战斗系统

**职责**：玩家/怪物的伤害计算、异常状态（冰冻/灼烧）施加、装备词条加成、击杀判定。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/CombatSystem.ts` | **入口** — `playerAttack()` / `monsterAttack()` / `attackIceWall()` |
| `assets/scripts/pve/core/PveConstants.ts` | 所有伤害相关数值（基础攻击、Boss 倍率等） |
| `assets/scripts/pve/core/PveTypes.ts` | `Monster` / `RunPlayer` / `StatusEffect` 类型定义 |
| `assets/scripts/pve/core/StrengthenEffects.ts` | 强化词条对伤害的修正（吸血/狂暴/反击计算） |
| `assets/scripts/pve/core/EquipTraitEffects.ts` | 装备词条对伤害的修正 |
| `assets/scripts/pve/core/BossEquipTraitEffects.ts` | 装备词条对 Boss 专属效果 |

**推荐入口**：`CombatSystem.ts` → 找 `playerAttack()` → 内部调用 `resolveHit()`。

> ⚠️ **`CombatSystem.ts` 不是单一职责文件**。`resolveHit()` 除了计算伤害，还内联了：
> - 全部 4 个 Boss 的**狂暴 HP 阈值检测**（GoblinChief / QuicksandScorpion / FrostGiant / FateGuardian 各一段 if 分支）
> - 章节专属怪物变体的**被击中副作用**（LAVA_CRAB 硬甲减伤、VOID_WORM 双生复活、FIRE_ELEMENTAL 死亡爆炸、FATE_MIRROR 护盾吸收）
> - 击杀后的 LootSystem / AnimaSystem / RelicSystem 级联调用
>
> **后果**：Boss 行为 Bug 不仅要看 `bosses/` 目录，**还必须看 `CombatSystem.ts`**。

---

### 02 怪物系统

**职责**：怪物 AI 状态机（IDLE/PATROL/CHASE/FLEE）、回合驱动、追击路径、玩家阵亡检测；各章节怪物变体定义。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/MonsterAI.ts` | **入口** — `stepMonsters(state)` 驱动所有怪物一回合 |
| `assets/scripts/pve/core/ChapterMonsterRules.ts` | `CHAPTER_MONSTER_RULES` — 各章各层怪物配比表 |
| `assets/scripts/pve/core/Chapter1Monsters.ts` | 哥布林战士/弓箭手/火焰/冰霜哥布林、灵鼠 |
| `assets/scripts/pve/core/Chapter2Monsters.ts` | 沙漠劫匪、沙虫幼虫、毒蝎、灵甲虫 |
| `assets/scripts/pve/core/Chapter3Monsters.ts` | 雪狼、冰晶史莱姆、冰霜精灵 |
| `assets/scripts/pve/core/Chapter4Monsters.ts` | 熔岩士兵、熔岩螃蟹、火元素 |
| `assets/scripts/pve/core/Chapter5Monsters.ts` | 暗影刺客、命运守卫小怪、虚空虫 |
| `assets/scripts/pve/core/ChapterAnimaMonsters.ts` | 通用灵气怪（各章共用） |
| `assets/scripts/pve/core/AnimaDeathEffects.ts` | 灵气怪击杀后的环境效果 |

**推荐入口**：`MonsterAI.ts` → `stepMonsters()` → 找对应 AI 状态分支。  
修改某章怪物：直接看 `Chapter{N}Monsters.ts` 对应工厂函数。

---

### 03 Boss 系统

**职责**：五章 Boss 的独立 AI 步进、阶段切换、特殊机制（AOE/地形/传送/镜像）、掉落表。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/bosses/GoblinChief.ts` | 第1章（第5层）— 重击 AOE + 增援号角 + 狂暴 |
| `assets/scripts/pve/core/bosses/QuicksandScorpion.ts` | 第2章（第10层）— 潜地突袭 + 流沙扩张 + 沙暴 |
| `assets/scripts/pve/core/bosses/FrostGiant.ts` | 第3章（第15层）— 冰面铺设 + 冻结循环 + 冲锋 |
| `assets/scripts/pve/core/bosses/LavaLord.ts` | 第4章（第20层）— 灼烧 + 喷发 + 潮汐 + 锁链（两阶段）|
| `assets/scripts/pve/core/bosses/FateGuardian.ts` | **第5章（第25层）** — 命运预言 + 行为镜像 + 狂暴改写命运（三段）|
| `assets/scripts/pve/core/bosses/BossSpoils.ts` | `BOSS_SPOILS` 掉落表 + `rollBossSpoil()` |

**推荐入口**：找对应章节 Boss 文件，入口函数均以 `step{BossName}()` 或 `{bossName}Attack()` 命名。  
遗物/掉落问题 → `BossSpoils.ts`。

> ⚠️ **Boss 狂暴检测的职责分裂**：HP 阈值是否跌破的检测发生在 `CombatSystem.resolveHit()`（每次玩家攻击命中时），Boss 文件里的 `tryCross*Threshold()` 只负责**阈值被触发后**下一怪物回合的状态变更。排查"Boss 为什么没有进入狂暴"应同时看两处。

---

### 04 词条/强化系统

**职责**：灵气积累触发 3 选 1 强化；词条效果实现（49 条）；职业被动词条。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/AnimaSystem.ts` | **写入入口** — `addAnima()` / `applyStrengthen()` / `traitCount()`；内含所有职业强化词条 id 常量池 |
| `assets/scripts/pve/core/StrengthenEffects.ts` | 强化词条的实际效果函数（吸血/狂暴/反击/护甲等） |
| `assets/scripts/pve/core/PveConstants.ts` | `ANIMA_PER_STRENGTHEN=100` / 阈值倍增 / 强化池定义 |

**词条 ID 完整生命周期**（查词条 Bug 必须按此顺序追踪）：
1. **定义**：`AnimaSystem.ts` 的 `BERSERKER_STRENGTHEN_POOL` / `ARCHER_STRENGTHEN_POOL` / `ROGUE_STRENGTHEN_POOL` 常量数组
2. **写入**：`AnimaSystem.applyStrengthen()` → `player.classTraits.push(traitId)`
3. **触发**：`CombatSystem.ts` 里直接调用 `StrengthenEffects` 的对应函数（`hasCleave()` / `lowHpAttackMultiplier()` 等）
4. **查询**：`AnimaSystem.traitCount(player, traitId)` 判断词条是否激活

> ⚠️ **词条不在 `AnimaSystem` 里生效，在 `CombatSystem` 里生效**。"吸血词条为什么没触发"要去 `CombatSystem.ts`，不是 `AnimaSystem.ts`。

> ⚠️ **`player.classTraits[]` 混合存储两类词条**：职业进阶词条（`ClassSystem.applyClassAdvance` 写入）和灵气强化词条（`AnimaSystem.applyStrengthen` 写入）都进同一个数组，`CombatSystem` 查询时无区分。导航里"职业系统"和"词条/强化系统"是两套写入路径，但底层存储和触发查询是同一处。

---

### 05 装备系统

**职责**：装备生成（品质/词条随机）、装卸、词条被动触发、铁匠强化/重铸。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/EquipmentSystem.ts` | **入口** — `rollEquipment()` / `equipItem()` / `unequipItem()` |
| `assets/scripts/pve/core/EquipTraitEffects.ts` | 装备词条被动效果（战斗中触发） |
| `assets/scripts/pve/core/BossEquipTraitEffects.ts` | 装备词条对 Boss 专属修正 |
| `assets/scripts/pve/core/EquipHelper.ts` | 装备操作工具函数 |
| `assets/scripts/pve/core/NeutralEntities.ts` | `upgradeEquip()` / `rerollEquipTrait()` — 铁匠强化/重铸 |
| `assets/scripts/pve/core/PveConstants.ts` | 装备品质权重、词条池 |

**推荐入口**：`EquipmentSystem.ts` → `rollEquipment()` 看生成逻辑；战斗词条触发看 `EquipTraitEffects.ts`。

---

### 06 职业系统

**职责**：职业碎片积累、一阶进阶、二阶觉醒、职业被动加成。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/ClassSystem.ts` | **入口** — `pickFragment()` / `applyClassAdvance()` / `applyClassAwaken()` / `getAwakenEligible()` |
| `assets/scripts/pve/core/PveConstants.ts` | `CLASS_FRAGMENTS_TO_ADVANCE=5` / 觉醒条件 / 职业被动定义 |
| `assets/scripts/pve/core/PveTypes.ts` | `ClassId` 联合类型 / `ClassTraits` |

**推荐入口**：`ClassSystem.ts` → `applyClassAdvance()` 看进阶逻辑，`getAwakenEligible()` 看觉醒条件。

---

### 07 命运树系统

**职责**：元进度成长树（5 分支 × 9 节点，按已接入效果分阶段开放）；解锁条件校验；效果快照注入远征；树重置。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/DestinyTreeSystem.ts` | **客户端逻辑入口** — `canUnlockNode()` / `unlockNode()` / `getTreeBonuses()` / `buildPendingTreeChoices()` |
| `assets/scripts/pve/controllers/DestinyTreeController.ts` | **???????** ? ????????????????????? `assets/scripts/lobby/PveLobbyController.ts` ?? |
| `assets/scripts/pve/views/DestinyTreeView.ts` | **渲染层** — 5 分支 × 9 节点布局、三态着色与锁定原因反馈 |
| `assets/scripts/pve/core/PveConstants.ts` | `DESTINY_TREE_NODES` 各节点解锁成本 |
| `cloudfunctions/common/pve/PveMeta.js` | **云端权威** — `unlockTreeNode()` / `resetTreeNodes()` |

**推荐入口**：客户端逻辑 → `DestinyTreeSystem.ts`；解锁失败/云端校验 → `PveMeta.js`。

---

### 08 地图生成系统

**职责**：确定性楼层布局（同 seed 同结果 AC-13）；怪物/实体位置随机放置；地图尺寸按章节变化。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/MapGenerator.ts` | **入口** — `generateFloor(floor, seed)` |
| `assets/scripts/pve/core/rng.ts` | `createRng(seed)` / Mulberry32 / `.state()` 快照 |
| `assets/scripts/pve/core/ChapterMonsterRules.ts` | 配比表（MapGenerator 消费） |
| `assets/scripts/pve/core/PveConstants.ts` | `MAP_SIZE.NORMAL=8` / `MAP_SIZE.HIGH=9` / `MAP_SIZE.BOSS=10` |

**推荐入口**：`MapGenerator.ts` → `generateFloor()` → 找 `createRng(seed)` 调用点。

---

### 09 迷雾系统

**职责**：战争迷雾初始化；玩家移动后按曼哈顿距离揭示周边格子；视野范围控制。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/FogSystem.ts` | **入口** — `createFogGrid()` / `revealAround()` / `isRevealed()` |
| `assets/scripts/pve/core/MovementSystem.ts` | `applyMove()` 调用 `revealAround()` |
| `assets/scripts/pve/views/FogMapView.ts` | 渲染层 — 8×8/9×9/10×10 网格池化渲染 |

**推荐入口**：`FogSystem.ts`；视野 Bug 排查同时看 `MovementSystem.ts` → `applyMove()`。

---

### 10 非战斗交互系统

**职责**：神像/温泉/祭坛/铁匠的交互效果；营地商店购买/出售；遗物开箱。（**不包含**楼层通关，通关见 §10b）

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/NeutralEntities.ts` | **非战斗实体** — `useIdol()` / `useHotSpring()` / `useAltar()` / `upgradeEquip()` / `rerollEquipTrait()` |
| `assets/scripts/pve/core/CampSystem.ts` | **营地商店** — `applyShopBuy()` / `applySellEquip()` / `openRelicChest()` |
| `assets/scripts/pve/core/RelicSystem.ts` | **遗物系统** — `RELIC_DEFS` / `pickupRelic()` / `relicOnNewFloor()` / `relicTryRevive()` |
| `assets/scripts/pve/core/ScrollSystem.ts` | **卷轴系统** — `useScroll()` / `claimScrollChoice()` |

**推荐入口**：铁匠/神像/温泉/祭坛 → `NeutralEntities.ts`；商店 → `CampSystem.ts`；遗物被动 → `RelicSystem.ts`。

---

### 10b 楼层通关系统

**职责**：钥匙拾取、出口门开启、Boss 层传送门生成与踏入、楼层完成事件。（与 §10 非战斗交互分离，前者是"交互实体效果"，此处是"通关流程"）

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/FloorRules.ts` | **入口** — `pickKey()` / `openExit()` / `spawnPortal()` / `interactPortal()` |

**推荐入口**：通关流程 Bug（拿到钥匙后无法出门、传送门不出现）→ `FloorRules.ts`。

---

### 11 存档系统

**职责**：远征生命周期（开始/存档/结算）；状态序列化/反序列化；断线续档。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/ExpeditionState.ts` | **客户端编排入口** — `startExpedition()` / `endTurn()` / `advanceFloor()` / `applyDeath()` / `serialize()` / `resumeExpedition()` |
| `assets/scripts/network/PveService.ts` | **网络入口** — `startRun()` / `loadPveSave()` / `savePveFloor()` / `settlePveRun()` |
| `cloudfunctions/common/pve/PveSave.js` | **云端权威** — `startRun()` / `saveFloorProgress()` / `settleExpedition()` |
| `assets/scripts/pve/controllers/ExpeditionController.ts` | 触发存档的时机（每层通关后自动调用） |

**推荐入口**：客户端序列化 → `ExpeditionState.ts`；存档失败/结算异常 → `PveSave.js`（云函数）。

---

### 12 PVE UI 系统

**职责**：地图渲染、HUD、角色面板、消息栏、Toast 提示、强化弹窗。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/views/FogMapView.ts` | **地图渲染** — 格子/实体/怪物/玩家图标；节点池化 diff 刷新 |
| `assets/scripts/pve/views/PveHudView.ts` | **HUD** — 楼层/回合/AP/HP/金币/灵气/钥匙；方向键+功能按钮 |
| `assets/scripts/pve/views/PveCharacterPanel.ts` | **角色面板弹窗** — 职业/HP/攻击/装备/词条/碎片/成就/图鉴 |
| `assets/scripts/pve/views/PveMessageLog.ts` | **战报消息栏** — 按事件类型上色，可滚动 |
| `assets/scripts/pve/views/PveToastView.ts` | **Toast + 强化 3 选 1 弹窗** |
| `assets/scripts/pve/views/DestinyTreeView.ts` | **命运树 UI** — 5 分支 × 9 节点、三态着色与锁定原因反馈 |
| `assets/scripts/pve/views/pveUiKit.ts` | 按钮/标签工厂工具函数 |

**推荐入口**：HUD 刷新 Bug → `PveHudView.ts` → `refresh(state)`；强化弹窗 → `PveToastView.ts`。

> 2026-06-22 命运远征战场视觉/布局后续修复，先读
> `specs/260608-pve-destiny-expedition/claude-code-handoff-2026-06-22.md`。
> 该文档记录 A V4 不可破坏布局、透明棋盘修正、固定视口和方向键验收规则。

---

### 12c 章节资源加载系统

**职责**：按章节加载战场背景，解决主包 4MB 红线 + 真机分包 native 不可读的矛盾。第1章背景在主包；第2-5章背景配成独立 Cocos Asset Bundle（微信分包 `chapter_N`），进章前先确保 bundle 下载注册，再 `bundle.load` 背景 SpriteFrame；失败回大厅。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/ChapterResourceLoader.ts` | **入口** — `ensureChapterBundle()` / `loadChapterBackground()` / `preloadChapter()` / `isChapterReady()`；`MIGRATED_CHAPTERS` 控制哪些章已切到独立分包（其余走 UiAssets 旧路径兜底） |
| `assets/scripts/pve/controllers/ExpeditionController.ts` | `_ensureChapterReady()`（切章 gating + loading 遮罩 + 失败回大厅）；`_handleFloorCleared` Boss 层 `preloadChapter(next)` |
| `assets/scripts/pve/views/FogMapView.ts` | `_applyChapterBackground()` 经 ChapterResourceLoader 取背景；`setChapterBackground()` 注入 |
| `assets/chapter_backgrounds/chapter_N/` | 各章背景独立 bundle（`.meta` 配 `isBundle`+`compressionType.wechatgame:subpackage`） |
| `scripts/patch-wechatgame-config.js` | `chapterSubpackageNames()` / `ensureChapterSubpackageStubs()`；在 game.json/settings/application override 注册 chapter 分包 |

> ⚠️ **分阶段铺开**：先只迁 chapter_2 打通真机（`bundle.load` 分包 native 在真机能否读是关键门），验证通过再加 3/4/5 到 `MIGRATED_CHAPTERS` 并建对应 bundle。背景加载策略见 `specs/260608-pve-destiny-expedition/design.md`，真机分包细则见 `.cursor/rules/cocos-wechatgame-subpackage.mdc`。

---

### 13 事件系统（PVE）

**职责**：core 纯函数返回 `events[]` 数组，Controller 顺序回放，驱动 View 更新和动画。事件是单向数据流的核心。

| 文件 | 说明 |
|------|------|
| `assets/scripts/pve/core/PveTypes.ts` | **协议定义** — 所有 `PveEvent` 联合类型（50+ 类型：MOVE/ATTACK/KILL/LOOT 等）；纯类型声明，无运行时逻辑 |
| `assets/scripts/pve/controllers/ExpeditionController.ts` | **运行时消费入口** — `_replayEvents(events)`；这是事件流的实际执行中枢 |
| `assets/scripts/pve/views/PveMessageLog.ts` | 消费 events 显示战报 |
| `assets/scripts/pve/views/PveToastView.ts` | 消费 LOOT/STRENGTHEN events 显示 Toast |

**推荐入口**：
- 排查"某事件触发后 UI 没反应" → `ExpeditionController._replayEvents()` 找对应 case
- 新增事件类型 → 先在 `PveTypes.ts` 加联合类型 → 在 core 函数里 push → 在 `_replayEvents()` 里加 case
- `PveTypes.ts` 是协议文件，不含任何事件触发或消费逻辑

---

## 公共基础层

### 15 应用启动

**职责**：微信云初始化 → 登录 → 资源预加载 → 跳转大厅；全局 Session 管理。

| 文件 | 说明 |
|------|------|
| `assets/scripts/core/GameApp.ts` | **启动入口** — `onLoad()` 里的完整启动序列（含协议检查） |
| `assets/scripts/core/GameSession.ts` | 当前登录用户信息（uid / openid / 昵称）|
| `assets/scripts/core/SceneLoader.ts` | 场景切换（封装 `director.loadScene`）|
| `assets/scripts/core/EventBus.ts` | 框架级全局事件派发（非 PVE 事件数组）|
| `assets/scripts/core/Constants.ts` | 全局常量（`PERF_TRACE_ENABLED` 等）|
| `assets/scripts/lobby/LobbyController.ts` | 大厅主控 — 房间列表 / 创建加入 / PVE 入口 |
| `assets/scripts/platform/PlayerAgreement.ts` | 协议版本存储 — `isAgreementNeeded()` / `saveAgreement()` |
| `assets/scripts/ui/AgreementScreen.ts` | 玩家须知弹窗 UI — Q版风格，含三份协议文档和勾选框 |

**推荐入口**：启动流程 → `GameApp.ts`；场景跳转 → `SceneLoader.ts`；大厅功能 → `LobbyController.ts`；协议弹窗 → `AgreementScreen.ts`。

---

### 16 网络层

**职责**：封装微信云函数调用；对外暴露业务 API（PVE）。

| 文件 | 说明 |
|------|------|
| `assets/scripts/network/CloudService.ts` | **底层封装** — `callFunction(name, data)` 统一错误处理 |
| `assets/scripts/network/PveService.ts` | **PVE 业务 API** — startRun / loadSave / saveFloor / settle / loadMeta / unlockTreeNode |

**推荐入口**：PVE 网络问题 → `PveService.ts`。

---

### 17 UI 公共组件

**职责**：通用 UI 组件（加载遮罩、选项列表、精灵资产管理）。

| 文件 | 说明 |
|------|------|
| `assets/scripts/ui/UiAssets.ts` | **资源管理** — critical native 清单；图标/按钮资源懒加载 |
| `assets/scripts/ui/LoadingOverlay.ts` | 加载遮罩 |
| `assets/scripts/ui/OptionListUi.ts` | 通用选项列表弹窗 |
| `assets/scripts/ui/SceneUiBackground.ts` | 场景背景组件 |
| `assets/scripts/ui/UiSprite.ts` | Sprite 工具组件 |

**推荐入口**：图标加载失败 → `UiAssets.ts`（真机分包问题优先看此文件）。

---

### 18 音频系统

**职责**：背景音乐播放/停止；SFX 统一播放（白名单/池化/节流/音量持久化）；微信原生音频适配。

| 文件 | 说明 |
|------|------|
| `assets/scripts/audio/BgmController.ts` | **BGM 入口** — `playMainBgm()` / `stopMainBgm()` / `getBgmController()` |
| `assets/scripts/audio/AudioManager.ts` | **SFX 入口** — `playSfx(id)` / `SFX_IDS` / `setSfxMuted` / `setSfxVolume`；资源走 `resources/audio/sfx/{ui,battle,explore}/` |
| `assets/scripts/platform/wechat/WxAudio.ts` | 微信原生音频 API 封装 |

**推荐入口**：BGM 播放异常 → `BgmController.ts` → `WxAudio.ts`；SFX 不响 → `AudioManager.ts`（先看 `_warned` 控制台、是否 muted、是否被 50ms 节流）。

**SFX 接入点**（v1 最小集，8 个）：
- `sfx_ui_click` → `PveLobbyController._bindButton`（覆盖大厅全部按钮）
- `sfx_player_move` / `sfx_attack_hit` / `sfx_damage_pop` / `sfx_reward_get` / `sfx_door_open` / `sfx_boss_appear` / `sfx_run_failed` → `ExpeditionController._playFxFor`（按事件类型分发）

---

### 19 微信平台适配

**职责**：微信登录/授权、横竖屏、分享、房间码输入、云初始化、小游戏广告封装。

| 文件 | 说明 |
|------|------|
| `assets/scripts/platform/wechat/WxCloudInit.ts` | 云开发初始化（`wx.cloud.init`）|
| `assets/scripts/platform/wechat/WxAuth.ts` | 微信登录授权 |
| `assets/scripts/platform/wechat/WxLifecycle.ts` | 小游戏生命周期（前后台切换）|
| `assets/scripts/platform/wechat/WxShare.ts` | 分享 API |
| `assets/scripts/platform/wechat/WxLandscape.ts` | 横屏适配 |
| `assets/scripts/platform/wechat/ViewAdapt.ts` | 视口自适应 |
| `assets/scripts/platform/wechat/AdManager.ts` | **广告入口** — 激励视频 / Banner / 插屏统一封装，包含预加载、冷却、奖励说明、统一错误处理 |
| `assets/scripts/platform/wechat/WxRoomCodeInput.ts` | 房间码输入组件 |
| `assets/scripts/platform/wechat/WxGameNameInput.ts` | 游戏昵称输入组件 |

**推荐入口**：登录问题 → `WxAuth.ts`；横屏/视口 Bug → `WxLandscape.ts` / `ViewAdapt.ts`；广告接入/审核问题 → `AdManager.ts`。

---

## 云函数层

### 20 PVE 云函数

**职责**：存档读写、结算防作弊、元进度（命运树/成就/图鉴）、卷轴发放。

| 文件 | 说明 |
|------|------|
| `cloudfunctions/pve/index.js` | **Action 路由入口**（loadSave/startRun/saveFloor/settleRun/loadMeta/updateMeta/unlockTreeNode/resetTreeNodes）|
| `cloudfunctions/common/pve/PveSave.js` | 存档 CRUD + 结算（奖励按已通关层数独立计算，不信任客户端）|
| `cloudfunctions/common/pve/PveMeta.js` | 元进度读写（成就/图鉴/命运碎片/树节点）|
| `cloudfunctions/common/pve/PveStamina.js` | PVE 体力纯逻辑（恢复、上限、新远征扣费） |
| `cloudfunctions/common/pve/PveValidate.js` | 防作弊校验 |
| `cloudfunctions/common/pve/PveReward.js` | 按章节完成度计算钻石/碎片奖励 |
| `cloudfunctions/common/pve/PveDestinyTree.js` | 命运树解锁权威校验 |

> ⚠️ **只改 `cloudfunctions/common/pve/`，改完跑 `node scripts/sync-cloud-common.js`**，其余 4 个目录（login/initDb/adminLogin/adminTool）是自动同步副本。

---

## 已知问题与命名混乱

### 职责模糊点

1. **`ExpeditionState.ts` vs `ExpeditionController.ts`**  
   `ExpeditionState.ts`（core 层）负责状态序列化和生命周期编排；`ExpeditionController.ts`（controller 层）负责输入处理和网络调用。两者职责划分清晰，但名字相近，容易混淆。  
   **记忆法**：State = 纯函数/序列化；Controller = Cocos Component/网络。

2. **`ExpeditionState.ts` 已泄露 Boss 专属知识**  
   虽然是 core 层编排文件，但它直接 import 了：
   - `FateGuardian.recordPlayerActionForMirror`（命运守卫镜像记录）
   - `BossEquipTraitEffects.isPlayerBurnImmune` / `tickMonsterDots`（DoT tick）
   
   这意味着 `endTurn()` 的实际执行路径比本文档描述的更复杂。排查 endTurn 相关 Bug 时，除了 `ExpeditionState.ts` 本身，还需检查这两处引用文件。

3. **`PveEvent`（PveTypes.ts）vs `EventBus`（core/EventBus.ts）**  
   `PveEvent` 是 core 层的事件数据对象（plain object 数组，表示一次操作产生的副作用序列）；`EventBus` 是框架级的观察者模式发布订阅。两者完全独立，不要混用。

4. **`cloudfunctions/common/constants.js` vs `assets/scripts/pve/core/PveConstants.ts`**  
   前者是云端共享常量（PVE 难度档、层数等）；后者是客户端 PVE 数值常量。同名不同内容。

5. **`EquipTraitEffects.ts` vs `BossEquipTraitEffects.ts` vs `StrengthenEffects.ts`**  
   三个"效果"文件：装备词条效果 / Boss 专属装备词条效果 / 灵气强化词条效果。功能分工清晰但文件数量多，查询时注意区分触发来源（装备 vs 强化）。

6. **`RelicSystem.ts` 中的遗物 vs `ScrollSystem.ts` 中的卷轴**  
   遗物（Relic）= Boss 掉落的持久被动道具；卷轴（Scroll）= 账户级消耗品。概念相近但机制完全不同。

7. **Boss ID 字符串一致性问题**  
   `FATE_MIRROR_BOSS_ID` 有在 `PveConstants.ts` 定义为常量，但 `'GOBLIN_CHIEF'`、`'FROST_GIANT'` 等在 `CombatSystem.ts` / `MonsterAI.ts` 里是裸字符串比较。全局搜索某个 Boss ID 时会命中多处，且无法从常量定义处反向查找所有引用。

8. **`noop` 函数在三处各自定义**  
   `CombatSystem.ts`、`NeutralEntities.ts`、`FloorRules.ts` 各有一个 `function noop(state) { return { state, events: [] }; }`，完全相同。搜索 `noop` 会命中三处，均非从公共模块导入。

### 缺少单一入口的系统

- **成就/图鉴**：`AchievementSystem.ts`（检测逻辑）+ `PveCharacterPanel.ts`（UI 展示）+ `PveMeta.js`（云端持久化）三处分散，没有单一入口控制器。
- **AP 系统**：`ApSystem.ts` 负责骰子逻辑，但 AP 消耗分散在 `MovementSystem.ts` / `CombatSystem.ts` 中，需同时看多文件。
- **词条触发链**：词条定义在 `AnimaSystem.ts`，写入在 `ClassSystem` / `AnimaSystem`，触发在 `CombatSystem.ts`，三个不同文件，没有聚合入口。
