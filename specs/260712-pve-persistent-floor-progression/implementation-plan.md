# PVE 永久逐层突破与命痕构筑重构实施计划

> 对应设计：`specs/260712-pve-persistent-floor-progression/design.md`
> 日期：2026-07-12
> 状态：待审阅
> 交付策略：完成全部系统能力，并以第一章 1–7 层形成统一验收切片；验收通过后才延展第 2–5 章。

## 1. 实施原则

- 不兼容测试玩家的旧 PVE 数据；使用新档案版本和显式重建入口。
- 实施期间持续跑单元测试、类型检查和云端测试，但不把半成品试玩当作系统间停顿点。
- `assets/scripts/pve/core/**` 保持零 Cocos 依赖、确定性 RNG、纯函数状态变更。
- 云端结算与入账只改 `cloudfunctions/common/**` 权威源，完成后运行 `node scripts/sync-cloud-common.js`。
- 每个玩法任务同步更新 `specs/260608-pve-destiny-expedition/design.md`；架构入口变化同步更新 `PROJECT_NAVIGATION.md` 与 `CALL_FLOW.md`。
- 工作区现有大量未提交改动。实施前必须确认这些改动的归属与基线；禁止 reset、checkout 或覆盖用户改动。
- 不新增 PVE 战力广告、体力、命运树兼容层、职业专属命痕或随机装备触发词条。

## 2. 编码前内容锁（门禁）

以下四张表必须先作为设计附录写定并由用户审阅。未通过门禁，不开始核心代码重写。

### 2.1 24 枚命痕表

在 `specs/260712-pve-persistent-floor-progression/minghen-catalog.md` 写明每枚命痕：

- ID、中文名、标签、I/II/III 级完整规则。
- 精确触发时机、每回合/每目标上限、叠加与互斥规则。
- 对战士、射手、游侠各一个有效用例。
- 来源楼层、追踪条件、三级升格试炼与失败条件。
- 是否影响攻击、移动、受击、击杀、回合结束等事件顺序。

验收：24 枚均不引用职业 ID；I 级独立可用；III 级至少连接两个通用机制；不存在明显同义替代或纯数值最优项。

### 2.2 第一章 1–7 层配置表

在 `specs/260712-pve-persistent-floor-progression/chapter-1-content.md` 固定：

- 每层目标类型、地图骨架、核心地形、怪物组合、高潮遭遇。
- 可选目标、首次奖励、3–4 枚主题命痕、固定装备池。
- 目标回合数、预计时长、失败条件与撤退条件。
- 第 6 层如何预演第 7 层 Boss 机制。
- 半固定生成中固定项与可随机项的明确边界。

验收：7 层覆盖约定的代表性目标；普通层目标时长 6–8 分钟；不存在连续三层相同主流程。

### 2.3 固定装备图鉴

在 `specs/260712-pve-persistent-floor-progression/equipment-catalog.md` 写明第一章全部武器、防具、饰品与 Boss 装备：

- 固定 ID、名称、槽位、品质、基础参数与强化成长。
- 攻击形状、距离、AP、击退/失衡和明确优缺点。
- 同名装备不同品质允许变化的字段白名单。
- 出售价值、强化成本、掉落来源。

验收：不存在随机触发词条字段；每种武器至少与两个职业产生不同使用方式；同名装备规则固定。

### 2.4 职业熟练度与灵气参数

在 `specs/260712-pve-persistent-floor-progression/profession-progression.md` 固定：

- 3 个职业 1–10 级经验表。
- 技法解锁等级、主动选择方式和战斗规则。
- 低熟练职业追赶公式与低层经验衰减。
- 灵气获取事件、槽上限、三职业爆发效果和 Boss 二次积累规则。

验收：熟练度不直接提高通用攻击/生命；满级不是无限成长入口；灵气爆发均由玩家主动触发。

## 3. 任务 1：建立新档案与协议边界

**入口文件**

- `assets/scripts/network/PveService.ts`
- `assets/scripts/pve/core/PveTypes.ts`
- `cloudfunctions/common/pve/PveMeta.js`
- `cloudfunctions/common/pve/PveValidate.js`
- `cloudfunctions/common/db.js`
- `cloudfunctions/pve/index.js`

**新增建议**

- `cloudfunctions/common/pve/PveChallenge.js`
- `cloudfunctions/common/pve/PveProgression.js`
- `test/pve/PveProfileTypes.test.ts`
- `cloudfunctions/common/__tests__/PveChallenge.test.js`

**步骤**

1. 定义新 `PveProfile`：最高解锁层、层记录、命痕收藏/方案、装备库存、金币、命尘、职业解锁/熟练度、追踪进度。
2. 定义 `FloorChallengeSnapshot`：challengeId、floor、mode、seed、职业、装备、8 槽命痕、追踪目标、开始时间和状态。
3. 新增档案版本字段；测试环境检测旧版本时创建新档，不做旧字段迁移。
4. 在 `PveService.ts` 定义 `loadProfile/startFloorChallenge/settleFloorChallenge/withdrawFloorChallenge` 的请求响应类型。
5. 云端加入严格字段白名单、楼层连续性、配置归属和 challengeId 校验。
6. 保留旧 API 到最终切换任务再删除，避免中间提交完全不可编译。

**验证**

- `npm run typecheck:game`
- `npm run typecheck:cloud`
- `cd cloudfunctions/common && npm test -- --runInBand`

## 4. 任务 2：实现楼层挑战生命周期与幂等结算

**入口文件**

- `cloudfunctions/pve/index.js`
- `cloudfunctions/common/pve/PveChallenge.js`
- `cloudfunctions/common/pve/PveSave.js`
- `cloudfunctions/common/pve/PveValidate.js`
- `assets/scripts/network/PveService.ts`

**步骤**

1. `startFloorChallenge` 由云端生成 challengeId 和 seed，冻结出战配置摘要。
2. 限制同一用户同一时刻只有一个 ACTIVE 挑战；网络重试返回同一挑战。
3. `settleFloorChallenge` 支持 CLEAR/DEAD/WITHDRAW，原子写入档案与挑战结果。
4. 相同 challengeId 重复结算返回首次结果，不重复发奖。
5. CLEAR 时只允许当前最高层或已解锁旧层；新层成功后最高解锁层 `+1`。
6. DEAD/WITHDRAW 不降低进度、不扣永久资产。
7. 新增断线恢复：重新进入时读取 ACTIVE 挑战快照和当前层存档。
8. 运行同步脚本，将权威源复制到部署函数目录。

**测试**

- 首次启动、网络重试、重复结算、并发结算、死亡、撤退、越层、篡改配置。
- `node scripts/sync-cloud-common.js`
- `cd cloudfunctions/common && npm test -- --runInBand`

## 5. 任务 3：重建客户端楼层状态机

**入口文件**

- `assets/scripts/pve/core/ExpeditionState.ts`
- `assets/scripts/pve/core/PveTypes.ts`
- `assets/scripts/pve/controllers/ExpeditionController.ts`
- `assets/scripts/core/SceneLoader.ts`

**新增建议**

- `assets/scripts/pve/core/FloorChallengeState.ts`
- `assets/scripts/pve/core/FloorChallengeLifecycle.ts`
- `test/pve/FloorChallengeLifecycle.test.ts`

**步骤**

1. 将“整局远征状态”和“单层挑战状态”拆开；单层 core 只持有当前层战斗所需数据。
2. 新建 `startFloor/clearFloor/applyDeath/withdrawFloor/resetCombatState` 纯函数。
3. 每层开始固定恢复 HP/AP，清空灵气、护盾、异常和临时场景状态。
4. 每层结束生成结算摘要，不直接修改永久资产。
5. Controller 改为消费云端 challenge snapshot，再创建确定性本地楼层状态。
6. 续档只恢复当前层，不恢复旧 1–35 连续 run。
7. 暂时为旧 `ExpeditionState` 提供适配入口，最终切换时删除旧远征推进逻辑。

**测试**

- `npm run test:pve -- FloorChallengeLifecycle`
- `npm run typecheck:game`

## 6. 任务 4：实现三职业底层规则

**入口文件**

- `assets/scripts/pve/core/ClassSystem.ts`
- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/MovementSystem.ts`
- `assets/scripts/pve/core/PveTypes.ts`
- `assets/scripts/pve/controllers/ExpeditionController.ts`

**新增建议**

- `assets/scripts/pve/core/professions/WarriorSystem.ts`
- `assets/scripts/pve/core/professions/ArcherSystem.ts`
- `assets/scripts/pve/core/professions/RangerSystem.ts`
- `assets/scripts/pve/core/professions/ProfessionMastery.ts`
- 对应四个 `test/pve/*` 单测文件。

**步骤**

1. 删除“冒险者收集碎片随机进阶”的目标态依赖，改为前 5 层教学解锁三职业。
2. 战士：攻击预览支持投入额外 AP；解析力量等级、破甲、击退、碰撞和范围模式。
3. 射手：记录本回合移动与瞄准等级；统一弹道、穿透、弱点和掩体计算顺序。
4. 游侠：记录移动/攻击动作序列、连击数和回合结束清空；收招由玩家主动选择。
5. 熟练度只解锁技法；云端结算根据可信挑战摘要增加经验并应用追赶/衰减。
6. Controller/UI 只展示可选技法并传入选择，不复制规则判断。

**测试重点**

- AP 不足、击退阻挡、Boss 位移抗性、瞄准被移动打断、连击重复动作、回合切换。
- 三职业使用同一武器时，装备参数一致而职业规则不同。

## 7. 任务 5：将灵气改为主动爆发槽

**入口文件**

- `assets/scripts/pve/core/AnimaSystem.ts`
- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/MonsterAI.ts`
- `assets/scripts/pve/controllers/ExpeditionController.ts`
- `assets/scripts/pve/views/PveHudView.ts`
- `assets/scripts/pve/views/PveToastView.ts`

**新增建议**

- `assets/scripts/pve/core/SpiritBurstSystem.ts`
- `test/pve/SpiritBurstSystem.test.ts`

**步骤**

1. 将灵气产出统一为明确事件，不再生成强化候选。
2. 实现满槽、单次储存、主动释放和层间清空。
3. 实现破阵、凝神、无间，并把效果接入对应职业模块。
4. HUD 将灵气条改为可释放状态按钮；忙碌/动画期间使用 `_busy` 防重复输入。
5. 删除强化三选一事件消费和广告重抽入口。

**测试重点**

- 未满不可释放、重复点击、职业切换后状态、死亡/通关清空、Boss 二次积累上限。

## 8. 任务 6：实现 24 枚命痕与 8 槽装配

**入口文件**

- `assets/scripts/pve/core/strengthen/StrengthenCatalog.ts`
- `assets/scripts/pve/core/StrengthenEffects.ts`
- `assets/scripts/pve/core/CombatSystem.ts`
- `assets/scripts/pve/core/MovementSystem.ts`
- `assets/scripts/pve/core/PveTypes.ts`

**新增建议**

- `assets/scripts/pve/core/minghen/MinghenCatalog.ts`
- `assets/scripts/pve/core/minghen/MinghenLoadout.ts`
- `assets/scripts/pve/core/minghen/MinghenEffects.ts`
- `assets/scripts/pve/core/minghen/MinghenEventContext.ts`
- `test/pve/MinghenCatalog.test.ts`
- `test/pve/MinghenLoadout.test.ts`
- `test/pve/MinghenEffects.test.ts`

**步骤**

1. 按内容锁文档定义 24 枚命痕，建立唯一 ID、三级规则和事件钩子。
2. 建立通用事件上下文，明确 BEFORE/AFTER_MOVE、BEFORE/AFTER_HIT、KILL、DAMAGED、TURN_END 等顺序。
3. 实现 8 槽校验、重复合成、方案保存、楼层内冻结摘要。
4. 命痕效果只查询通用战斗条件，不查询职业 ID。
5. 把旧 `classTraits` 混合数组的触发逐项迁移；迁移完成后删除旧强化查询。
6. 为每枚命痕建立三职业组合测试，至少覆盖设计表中的关键用例。

**测试重点**

- 槽位超限、重复 ID、等级边界、触发递归、同一事件多命痕顺序、每回合上限、存档序列化。

## 9. 任务 7：重做固定装备图鉴

**入口文件**

- `assets/scripts/pve/EquipmentCatalog.ts`
- `assets/scripts/pve/core/EquipmentSystem.ts`
- `assets/scripts/pve/core/EquipTraitEffects.ts`
- `assets/scripts/pve/core/BossEquipTraitEffects.ts`
- `assets/scripts/pve/core/LootSystem.ts`
- `assets/scripts/pve/views/pveEquipDetail.ts`

**新增建议**

- `assets/scripts/pve/core/equipment/EquipmentDefinition.ts`
- `assets/scripts/pve/core/equipment/WeaponGeometry.ts`
- `assets/scripts/pve/core/equipment/EquipmentProgression.ts`
- `test/pve/EquipmentFixedCatalog.test.ts`
- `test/pve/WeaponGeometry.test.ts`

**步骤**

1. 固定同名装备规则，品质只改变白名单数值字段。
2. 将攻击形状、距离、AP、击退/失衡纳入统一武器几何计算。
3. 删除随机 affix、职业传奇偏向和装备触发词条路径。
4. 实现强化、锁定、比较、出售和库存容量规则。
5. Boss 装备使用固定特殊动作，不进入命痕事件链的被动效果层。
6. 更新详情 UI，明确展示优点、缺点、动作形状和强化变化。

**测试重点**

- 同名装备确定性、品质字段白名单、攻击范围、近身限制、穿透、横扫、出售锁定保护。

## 10. 任务 8：实现楼层目标框架

**入口文件**

- `assets/scripts/pve/core/FloorRules.ts`
- `assets/scripts/pve/core/MapGenerator.ts`
- `assets/scripts/pve/core/MonsterAI.ts`
- `assets/scripts/pve/core/PveTypes.ts`
- `assets/scripts/pve/controllers/ExpeditionController.ts`

**新增建议**

- `assets/scripts/pve/core/objectives/FloorObjective.ts`
- `assets/scripts/pve/core/objectives/KeyExploreObjective.ts`
- `assets/scripts/pve/core/objectives/EliteHuntObjective.ts`
- `assets/scripts/pve/core/objectives/BreakthroughObjective.ts`
- `assets/scripts/pve/core/objectives/PurgeObjective.ts`
- `assets/scripts/pve/core/objectives/WaveSurvivalObjective.ts`
- `assets/scripts/pve/core/objectives/ChaseObjective.ts`
- `assets/scripts/pve/core/objectives/BossObjective.ts`
- 对应目标单测。

**步骤**

1. 定义统一目标接口：初始化、事件消费、进度、完成、失败、序列化。
2. 保留钥匙探索的拿钥匙—开门—出口闭环。
3. 波次生存由固定波数驱动，清空当前波后生成下一波，最后一波清空即完成。
4. 其他目标按内容锁配置实现明确的胜负条件。
5. MapGenerator 接收楼层骨架配置，只随机允许变化的怪物、宝箱、障碍和支路。
6. Controller/HUD 展示主目标、可选目标、波次和剩余数量，不自行判定通关。

**测试重点**

- 每类目标的完成/失败/撤退、断线序列化、最后一只怪死亡、目标单位被环境击杀。

## 11. 任务 9：实现奖励、追踪狩猎与升格试炼

**入口文件**

- `cloudfunctions/common/pve/PveReward.js`
- `cloudfunctions/common/pve/PveValidate.js`
- `cloudfunctions/common/pve/PveProgression.js`
- `assets/scripts/network/PveService.ts`

**新增建议**

- `assets/scripts/pve/core/minghen/MinghenTrial.ts`
- `cloudfunctions/common/pve/PveMinghen.js`
- `cloudfunctions/common/__tests__/PveMinghen.test.js`
- `test/pve/MinghenTrial.test.ts`

**步骤**

1. 首通结算：金币、固定装备池、主题命痕三选一、可选目标奖励、下一层解锁。
2. 追踪开始时冻结目标；通关后增加确定进度，一个阶段只需 2–4 次有效挑战。
3. 材料满足后关闭普通追踪，生成三级试炼状态。
4. 试炼由客户端 core 判定事件条件，云端用挑战快照与摘要校验后升格。
5. 升格后标记来源层毕业，不再提供定向副本。
6. 满级非定向重复转命尘；禁止已毕业低层建立无限命尘循环。
7. 低层金币、装备和熟练度收益按设计衰减，向前推进保持最高综合效率。

**测试重点**

- 首通重复请求、追踪切换、进度上限、材料满足未试炼、试炼失败重试、毕业关闭、命尘漏洞。

## 12. 任务 10：把大厅命运树入口重建为营地

**入口文件**

- `assets/scripts/lobby/PveLobbyController.ts`
- `assets/scripts/pve/views/PveToastView.ts`
- `assets/scripts/pve/views/pveUiKit.ts`
- `assets/scripts/network/PveService.ts`
- `assets/scripts/ui/UiAssets.ts`

**新增建议**

- `assets/scripts/pve/controllers/CampController.ts`
- `assets/scripts/pve/views/CampView.ts`
- `assets/scripts/pve/views/MinghenPanel.ts`
- `assets/scripts/pve/views/EquipmentWorkshopPanel.ts`
- `assets/scripts/pve/views/ExpeditionIntelPanel.ts`
- `assets/scripts/pve/views/ProfessionPanel.ts`

**步骤**

1. 原命运树按钮改为“营地”，移除命运树弹窗与解锁/重置请求。
2. 营地在同一页面提供四个入口：命痕台、装备台、远征情报、角色区。
3. 复用原营地半透明深色底板、金边/高亮按钮和弹窗层级。
4. 命痕台支持 8 槽、合成、追踪、图鉴、方案保存。
5. 装备台支持穿戴、强化、比较、锁定和出售。
6. 情报页显示下一层目标、环境、敌人、主题命痕和装备池。
7. 角色区支持免费切换职业、查看熟练度与技法。
8. 新增 UI 资源优先复用现有素材；确需新增时更新 `UiAssets.ts` critical 清单并核算主包。

**验证**

- 安全区、滚动列表、并发按钮 `_busy`、空库存、满槽、出售锁定装备。
- `python scripts/calc-main-native-budget.py`（若新增 native）

## 13. 任务 11：接通第一章 1–7 层完整内容

**入口文件**

- `assets/scripts/pve/core/MapGenerator.ts`
- `assets/scripts/pve/core/Chapter1Monsters.ts`
- `assets/scripts/pve/core/ChapterMonsterRules.ts`
- `assets/scripts/pve/core/bosses/GoblinChief.ts`
- 第一章内容锁文档。

**步骤**

1. 为 1–7 层建立固定骨架配置和允许随机项。
2. 按内容表接入主目标、可选目标、怪物、地形、装备和 3–4 枚主题命痕。
3. 在第 5 层前完成射手、游侠教学解锁。
4. 第 6 层预演哥布林酋长的核心空间机制。
5. 第 7 层接入完整 Boss 阶段、结算和继续/回营选择。
6. 24 枚命痕全部在图鉴可见，并在第一章拥有至少一个追踪来源和可执行的三级试炼。
7. 用确定种子测试每层可达性、目标生成和 6–8 分钟预算。

**测试**

- 新增 `test/pve/Chapter1Floor1to7.test.ts`
- 新增 `test/pve/Chapter1RewardSources.test.ts`
- 更新 `test/pve/MapGenerator.test.ts`、Boss 测试和目标测试。

## 14. 任务 12：切换主流程并删除旧系统

**入口文件**

- `assets/scripts/lobby/PveLobbyController.ts`
- `assets/scripts/pve/controllers/ExpeditionController.ts`
- `assets/scripts/pve/core/ExpeditionState.ts`
- `assets/scripts/pve/core/AnimaSystem.ts`
- `assets/scripts/pve/core/ClassSystem.ts`
- `assets/scripts/pve/core/DestinyTreeSystem.ts`
- `assets/scripts/pve/core/strengthen/**`
- `cloudfunctions/common/pve/PveSave.js`
- `cloudfunctions/common/pve/PveMeta.js`
- `cloudfunctions/common/pve/PveStamina.js`
- `cloudfunctions/common/pve/PveDestinyTree.js`
- `assets/scripts/platform/wechat/AdManager.ts` 的 PVE 调用方。

**步骤**

1. Lobby 和 Expedition 全量切换到新 profile/challenge API。
2. 删除旧 run start/save/settle、连续 advanceFloor、死亡整局结算和章节营地调用。
3. 删除命运树、体力、职业碎片/觉醒、强化三选一、旧装备 affix/传奇偏向的入口与状态字段。
4. 删除 PVE 奖励广告入口；不影响其他模式广告能力。
5. 删除无引用的 UI、常量、类型和测试；保留仍被新系统复用的怪物/Boss/地图能力。
6. 更新数据库初始化脚本与测试种子为新档案。
7. 运行同步脚本，确认所有部署副本与 `cloudfunctions/common` 一致。

**验证**

- `rg` 定向检查 `DestinyTree|stamina|StrengthenOffer|classFragments|startRun|settleExpedition` 只剩历史文档或明确兼容注释。
- `node scripts/sync-cloud-common.js`
- `npm run typecheck`
- `npm run typecheck:game`
- `npm run typecheck:cloud`
- `npm test -- --runInBand`

## 15. 任务 13：文档、导航与发布验证

**文档**

- 将 `specs/260608-pve-destiny-expedition/design.md` 从“待实施目标态”更新为已实施规则，并清理冲突旧段落或标记历史。
- 更新 `PROJECT_NAVIGATION.md`：新挑战、职业、灵气、命痕、目标、营地和云端入口。
- 更新 `CALL_FLOW.md`：开始楼层、结算、死亡、继续、回营、命痕合成/追踪/升格、职业切换。
- 更新 `DEVELOPMENT_GUIDE.md`：新档案、挑战幂等、命痕事件顺序与禁止项。
- 更新数据库 DDL/初始化说明和第一章验收清单。

**自动验证**

1. `npm run typecheck`
2. `npm run typecheck:game`
3. `npm run typecheck:cloud`
4. `npm test -- --runInBand`
5. `npm run test:pve -- --runInBand`
6. `node scripts/sync-cloud-common.js` 后检查无副本差异。
7. `npm run verify:pve-only`

**构建与真机**

1. Cocos Creator 3.8.8 重建 wechatgame。
2. `python scripts/compress-ui-large-assets.py`
3. `node scripts/patch-wechatgame-config.js`
4. 确认 `build structure OK`、critical native manifest 和主包 `< 4096 KB`。
5. 微信开发者工具清缓存后真机测试大厅、营地、第一章 1–7 层、BGM、UI资源与断线恢复。

## 16. 统一试玩验收门禁

所有任务完成、自动测试通过后，才进行第一章统一试玩验收：

- 从新档开始，在第 5 层前解锁三个职业并完成第 7 层 Boss。
- 三职业各完成至少一套有效命痕构筑和一次主动灵气高光。
- 至少两枚命痕完成 I→II→III、定向狩猎和升格全过程。
- 至少一次失败后回营调整构筑并成功重试。
- 验证继续远征和返回大厅奖励、恢复状态完全等价。
- 验证所有楼层主目标、可选目标和半固定随机边界。
- 验证装备固定规则、强化、锁定、比较和出售。
- 验证低层不能无限高效刷金币、命尘或熟练度。
- 验证断线、重复提交、客户端篡改和云函数重试。
- 记录普通层时长、失败点、命痕选择率、职业使用率和回刷次数。

只有上述验收通过，才为第 2–5 章创建内容延展计划；后续章节不得重开核心系统设计。
