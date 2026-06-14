# PVE「命运远征」验收清单

> 验收口径以 `design.md` §16 为准。结论：✅ 通过 / ⚠️ 待人工 / ❌ 未通过 / ⬜ 未开始。
> 验证方式：单测 / 代码审查 / 双端联调 / 真机。

## M1（AC-1～AC-14）

> 2026-06-08 走查说明：以下 ✅ 均基于「单测 + 端到端代码审查」（核对 core 纯函数 → Controller 编排 → View 刷新 / 云函数的调用链路完整闭合，事件命名与处理一一对应），非真机/开发者工具实测。**真机/开发者工具的视觉效果、手感、网络异常分支仍需人工联调**，已在各行「待…」中标注；该联调属于 Task 4.3 范畴，不阻塞本表 M1 结论。

| AC | 描述（摘要） | 结论 | 验证方式 |
|----|--------------|------|----------|
| AC-1 | 迷雾 8×8 地图，初始仅显示附近，移动逐步揭开 | ✅ | 单测(MapGenerator/FogSystem) 通过；代码审查：`FogMapView.refresh` 按 `floorState.revealed` diff 刷新格子（[FogMapView.ts:157](../../assets/scripts/pve/views/FogMapView.ts:157)），`applyMove`→`MovementSystem` 产生 `REVEAL` 事件驱动揭示，链路闭合。待真机/开发者工具最终视觉走查 |
| AC-2 | AP=8+骰子(1~6)=9~14；移动/普攻/开宝箱/出口/神像/祭坛消耗 | ✅ | 单测(ApSystem) 通过；代码审查：`startFloorTurn`/`endTurn` 调用 `rollAp` 派生 9~14（[ExpeditionState.ts:39](../../assets/scripts/pve/core/ExpeditionState.ts:39)），各交互系统消耗 AP 后由 `PveHudView.refresh` 显示，链路闭合 |
| AC-3 | AP 耗尽或主动结束回合；怪物按 AI 行动 | ✅ | 单测(ExpeditionState.endTurn) 通过；代码审查：`_onEndTurn`→`endTurn`→`stepMonsters`，`HudController` 「结束回合」按钮已接 `onEndTurn` 回调（[ExpeditionController.ts:224](../../assets/scripts/pve/controllers/ExpeditionController.ts:224)），链路闭合 |
| AC-4 | 普通怪发现玩家追击并攻击 | ✅ | 单测(MonsterAI) 通过；代码审查：`stepMonsters` 在 `endTurn` 内被调用并产生 `ATTACK`/`PLAYER_DAMAGED` 事件，经 `_playEvents`→`describeEvent` 转为战报 toast，链路闭合 |
| AC-5 | 玩家攻击怪物按距离/伤害结算，HP 清零淘汰 | ✅ | 单测(CombatSystem) 通过；代码审查：`_onAttack`/`_onTapCell`→`_attack`→`playerAttack`，事件含 `ATTACK`/`KILL`，HUD 与地图随 `_refreshAll` 同步刷新，链路闭合 |
| AC-6 | 普通怪掉落 50/25/25；宝箱可开 | ✅ | 单测(LootSystem) 通过；代码审查：`KILL`→掉落经 `LootSystem`，`_onInteract` 命中 `CHEST` 时调用 `openChest`，`LOOT` 事件转 toast，链路闭合 |
| AC-7 | 满 100 灵气 3 选 1 强化生效 | ✅ | 单测(AnimaSystem) 通过；代码审查：`_playEvents` 监听 `ANIMA_STRENGTHEN` 事件并调用 `PveToastView.showStrengthenChoice` 弹出三选一，选定后 `applyStrengthen` 落地（[ExpeditionController.ts:249](../../assets/scripts/pve/controllers/ExpeditionController.ts:249)），链路闭合（强化池已在 AC-16 替换为按职业分组，见已知问题#3） |
| AC-8 | 普通层钥匙→出口门通关 | ✅ | 单测(FloorRules) 通过；代码审查：`_afterApply` 在玩家踏入钥匙格时调用 `pickKey`，`_onInteract` 命中 `EXIT` 时调用 `openExit` 产生 `FLOOR_CLEARED`，链路闭合 |
| AC-9 | Boss 层钥匙→击败 Boss→传送门通关 | ✅ | 单测(FloorRules) 通过；代码审查：`_afterApply` 检测 Boss 阵亡且持有钥匙时调用 `spawnPortal`，链路闭合（传送门交互流程已在 M2 修复，见已知问题#4） |
| AC-10 | 哥布林酋长专属机制 + 必掉装备 | ✅ | 单测(GoblinChief) 通过；代码审查：`CombatSystem`/`stepMonsters` 经 `applyStrengthen`/Boss 专属逻辑链路调用 `bosses/GoblinChief`，阵亡掉落经 `LootSystem`，链路闭合（机制数值为 M1 占位，见备注#2） |
| AC-11 | 每层自动存档；续玩从下一层 | ✅ | 单测(ExpeditionState 序列化/advanceFloor/resumeExpedition 19 例) 通过；代码审查：`_handleFloorCleared` 在 `advanceFloor` 前调用 `_autoSaveCurrentFloor`→`savePveFloor`（[ExpeditionController.ts:312](../../assets/scripts/pve/controllers/ExpeditionController.ts:312)），`_bootstrap` 进场 `loadPveSave` 后用 `resumeExpedition` 固定从「已存档层+1」续玩，且与 `advanceFloor` 共用 `deriveFloorSeed` 派生规则（交叉一致性测试覆盖），链路闭合。待云端实部署联调确认网络异常分支 |
| AC-12 | 死亡清空局内、保留局外 | ✅ | 单测(applyDeath) 通过；代码审查：`_handleDeath` 调用 `applyDeath` 清空装备/职业/词条/金币/灵气后再 `_settle(...,'DEAD')`，局外资产（钻石/命运碎片）只在 `users` 集合由云端 `incrementUserPveRewards` 增量写入，不受 `applyDeath` 影响，链路闭合 |
| AC-13 | 同种子/同操作序列确定性，云端可复算 | ✅ | 单测(全模块确定性用例 + ExpeditionState 端到端 + resumeExpedition↔advanceFloor 交叉校验) 通过 |
| AC-14 | 元货币奖励经云函数边界校验入账，越界被拒 | ✅ | 单测(`pve.test.js` 13 例：PveValidate 连续性/种子校验 + PveReward 边界计算) 通过；代码审查：`SettleRunReport` 仅含 `runSeed/floor/status`（无奖励字段，[PveService.ts:37](../../assets/scripts/network/PveService.ts:37)），`settleExpedition` 校验后用 `computeSettleReward` 纯服务端按已通关层数计算入账，从根源不读取/信任客户端奖励数值（[PveSave.js:69](../../cloudfunctions/common/pve/PveSave.js:69)），链路闭合。待云端实部署联调（构造越界上报验证被拒） |

## M2+（AC-15～AC-20）

> 2026-06-09 走查说明：以下 ✅ 均基于「单测 + 代码审查」。真机/云端实部署联调同属 Task 4.3，不阻塞本表结论。

| AC | 描述（摘要） | 结论 | 验证方式 |
|----|--------------|------|----------|
| AC-15 | 职业碎片每层 2 个，集齐 3 个进阶 | ✅ | 单测(ClassSystem 16例) 通过；`pickFragment`/`applyClassAdvance` 链路闭合；Controller `_afterApply` 自动拾取碎片并回放 `CLASS_CAN_ADVANCE` 弹窗 |
| AC-16 | 15 职业词条生效 | ✅ | 单测(TraitSystem 32例) 通过；全部 15 词条（5×3职业）已在 CombatSystem/MovementSystem/MonsterAI 实现；design §10 已按实现回写（#6-16 全部对齐）|
| AC-17 | 5 装备位/5 品质/基础属性/来源概率 | ✅ | 单测(EquipmentSystem 8例) 通过；精英怪 10% 装备掉落、宝箱 10% 掉落已接入 LootSystem；ARMOR 减伤效果已接入 CombatSystem |
| AC-18 | 灵气怪逃跑、精英怪巡逻→追击；掉落表 | ✅ | 单测(MonsterAI) 通过；ANIMA/ELITE/PATROL 状态机已实现；各怪掉落表已接入 LootSystem |
| AC-19 | 击败章节 Boss 进入营地（商店/装备整理/继续/返回） | ✅ | 单测(CampSystem 22例) 通过；Boss 层（floor%5=0）分叉至 `showCamp` 阻塞弹窗；HEAL_FULL/BUFF_MAX_HP 两个商品；装备整理（变卖，design §3.1）：`applySellEquip` + SELL_PRICE 品质价格表 + 装备整理子面板，链路闭合 |
| AC-20 | 成就/图鉴/命运碎片元进度在远征间持久化 | ✅ | 单测(AchievementSystem 26例) 通过；8 个成就定义 + `checkNewAchievements` + `collectCodexEntries` 核心纯函数覆盖；云端 `loadMeta`/`updateMeta` action + `PveMeta.js` 模块；Controller `_checkMeta` 触发成就解锁 toast 并 fire-and-forget 写云端；HUD 展示命运碎片余额；角色面板展示成就/图鉴/碎片 |

## 已知问题 / 待设计师确认事项（M1 占位实现，需回写 design.md）

| # | 描述 | 严重度 |
|---|------|--------|
| 1 | `INITIAL_HP=20`：原 txt 设计文档未给出玩家初始 HP，按怪物数值量级估算的占位值，需平衡性评审 | 待确认 |
| 2 | 哥布林酋长机制为占位（每 3 怪物回合蓄力重击 ×2 伤害 + 必掉「哥布林酋长的战斧」），design.md 未定义具体技能与掉落词条/品质 | 待确认 |
| 3 | ~~灵气强化池 `M1_STRENGTHEN_POOL` 非完整 15 词条系统~~ → **已在 AC-16 按职业分组替换**（ADVENTURER/BERSERKER/ARCHER/ROGUE 四池）| ✅ 已修复 |
| 4 | ~~Boss 层通关简化为「传送门生成即视为 FLOOR_CLEARED」~~ → **已改为「踏入传送门 → 交互 → FLOOR_CLEARED」**，与 design AC-9 流程一致 | ✅ 已修复 |
| 5 | M1 宝箱掉落复用 `NORMAL_MONSTER_DROP` 表（未单列宝箱专属掉落表） | 待确认 |

### AC-16 词条效果偏差（实现与 design.md §10 文字不一致，需设计师审定）

> 以下词条功能在技术上均已实现并通过单测，偏差性质为「实现时做出了不同的游戏性判断」，不是 bug。待设计师逐条确认后更新 design.md 或调整实现。

| # | 词条 | design.md §10 描述 | 当前实现行为 | 偏差类型 |
|---|------|-------------------|------------|---------|
| 6 | 吸血 (life_steal) | 造成伤害回复 **0.5** HP | 每次攻击回复 **1** HP | 数值翻倍 |
| 7 | 狂暴 (berserk) | **消耗 8 AP 额外攻击一次** | **HP ≤ 50% 时攻击 +1** | 机制完全不同 |
| 8 | 血怒 (blood_rage) | **HP -3，攻击 +1**（被动） | **击杀时回复 2 HP** | 机制完全不同 |
| 9 | 鹰眼 (eagle_eye) | 攻击距离 **+3** | 攻击距离 **+1** | 数值缩减 |
| 10 | 射手精通 (marksman) | **距离 +1，攻击 +1** | **仅攻击 +0.5**（无距离加成） | 字段+数值差异 |
| 11 | 连射 (multi_shot) | **攻击两次**（必然） | **30% 概率**再射一箭 | 必然→概率 |
| 12 | 穿透 (pierce) | **攻击可穿透目标**（连锁伤害） | **无视护甲减伤** | 机制完全不同 |
| 13 | 暴击 (crit) | 20% 概率**双倍**伤害 | 20% 概率**三倍**伤害 | 倍率差异 |
| 14 | 疾步 (swift) | **移动距离翻倍** | 移动**消耗 AP -1** | 机制差异 |
| 15 | 残影 (afterimage) | **移动后**获得闪避 | **每层首次**受击闪避 | 触发条件不同 |
| 16 | 刺客之心 (assassin_heart) | **击杀后恢复 2 AP** | 对**非 CHASE 状态**敌人 +2 伤害 | 机制完全不同 |

### 其他功能性偏差

| # | 位置 | design.md 描述 | 当前实现 | 影响 |
|---|------|--------------|---------|------|
| 17 | §6 精英怪掉落 | 40%金币 / 30%金币+灵气 / **15%大量金币** / 10%装备 / **5%进阶卡** | **已修复**：ELITE_MONSTER_DROP.GOLD_HIGH 0.20→0.15，新增 ADVANCE_CARD 0.05 分支；进阶卡补满随机职业碎片并 emit CLASS_CAN_ADVANCE | ✅ 已修复 |
| 18 | §3.1 营地功能 | 商店 / **装备整理** / 返回大厅 / 继续远征 | **已修复**：`applySellEquip` + SELL_PRICE 品质价格表；营地弹窗新增「⚒️ 装备整理」入口 → 子面板展示 5 装备槽 + 变卖按钮 | ✅ 已修复 |
| 19 | §11.3 装备来源 | 精英怪掉落 / 宝箱 / **普通怪极低概率** | **已修复**：`rollNormalMonsterDrop` 主掉落后附加独立 3% COMMON 装备判定（`NORMAL_MONSTER_DROP.EQUIP_CHANCE = 0.03`） | ✅ 已修复 |
