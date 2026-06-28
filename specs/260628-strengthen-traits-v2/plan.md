# 强化词条 V2 实施计划

> 设计文档：`specs/260628-strengthen-traits-v2/design.md`
> 原则：任何词条只有在目录、候选、效果、显示和测试全部完成后才能进入正式池。

## 批次 1：统一目录与候选系统

涉及文件：

- 新建 `assets/scripts/pve/core/strengthen/StrengthenCatalog.ts`
- 新建 `assets/scripts/pve/core/strengthen/StrengthenOfferSystem.ts`
- 修改 `assets/scripts/pve/core/AnimaSystem.ts`
- 修改 `assets/scripts/pve/core/PveTypes.ts`
- 新建 `test/pve/StrengthenCatalog.test.ts`
- 新建 `test/pve/StrengthenOfferSystem.test.ts`

任务：

1. 建立 80 个唯一词条定义，统一名称、描述、职业、类型、权重、叠加上限和流派前置。
2. 保留现有池与元数据导出作为兼容别名，逐步迁移调用方。
3. 实现确定性加权无放回抽取。
4. 实现最近候选排除、至少一条未拥有、特殊词条每轮最多一条、核心和流派门槛。
5. `RunPlayer` 增加 `recentStrengthenOffers`，连续强化按生成顺序更新历史。
6. 测试 80 个唯一 id、同 seed 可复现、门槛、权重边界、满层过滤和池不足回退。

完成门槛：候选系统可独立通过测试，但新增词条暂不进入游戏池。

## 批次 2：普通常规 15 条

涉及文件：

- 新建 `assets/scripts/pve/core/strengthen/CommonStrengthenEffects.ts`
- 修改 `AnimaSystem.ts`、`CombatSystem.ts`、`ExpeditionState.ts`、`LootSystem.ts`
- 修改 `PveTypes.ts`
- 新建/扩展普通词条测试

任务：

1. 调整原 4 条数值与叠加上限。
2. 接入防护、灵气、宝箱、进层回复。
3. 接入先发、收尾、低血防护、余力整备和受挫反击。
4. 接入博采众长与厚积薄发的动态统计。
5. 将普通 15 条正式加入候选池。

完成门槛：普通 15 条逐条效果测试通过，无空效果。

## 批次 3：普通异质 5 条

涉及文件：

- 修改 `CommonStrengthenEffects.ts`
- 修改 `MovementSystem.ts`、`CombatSystem.ts`、`ExpeditionState.ts`
- 修改 `CampSystem.ts`、`NeutralEntities.ts`、`ExpeditionController.ts`、`PveToastView.ts`

任务：

1. 据险而守：统一阻挡地形邻接判定。
2. 地脉借力：沙坑、冰面、熔岩、碎冰触发与储存状态。
3. 藏锋待发：回合攻击记录与下次攻击消费。
4. 溢能转化：建立统一治疗入口和每层转化上限。
5. 血价交易：商店/铁匠确认、生命支付上限及钻石排除。
6. 将 5 条异质词条正式加入普通池。

完成门槛：所有地图和交易入口均使用统一效果函数，断线状态可恢复。

## 批次 4：狂战士 20 条

涉及文件：

- 新建 `assets/scripts/pve/core/strengthen/BerserkerStrengthenEffects.ts`
- 修改 `CombatSystem.ts`、`ExpeditionState.ts`、`PveTypes.ts`
- 扩展狂战士测试

任务：

1. 重做原 15 条数值、百分比叠加与每章不屈。
2. 接入鲜血护盾、血腥连锁、怒火沸腾、濒死盛宴、以牙还牙。
3. 明确治疗溢出优先级，防止护盾与灵气双重结算。
4. 将狂战士 20 条正式加入职业池。

完成门槛：攻击、受击、击杀、低血跨越、跨层和跨章状态测试通过。

## 批次 5：射手 20 条

涉及文件：

- 新建 `assets/scripts/pve/core/strengthen/ArcherStrengthenEffects.ts`
- 修改 `CombatSystem.ts`、`PveTypes.ts`
- 扩展射手测试

任务：

1. 重做原 15 条，删除返还 AP。
2. 建立统一主动攻击、追加箭和次生伤害上下文。
3. 接入屏息凝神、一线穿心、箭雨节奏、暴击装填、猎杀转移。
4. 将射手 20 条正式加入职业池。

完成门槛：连射、暴击、标记、贯穿不递归，概率上限与 RNG 顺序测试通过。

## 批次 6：隐匿者 20 条

涉及文件：

- 新建 `assets/scripts/pve/core/strengthen/RogueStrengthenEffects.ts`
- 修改 `CombatSystem.ts`、`MovementSystem.ts`、`MonsterAI.ts`、`PveTypes.ts`
- 扩展隐匿者测试

任务：

1. 重做原 15 条，删除返还 AP 和换皮低血机制。
2. 建立怪物中毒、隐匿、闪避与本回合主动移动统计。
3. 接入剧毒蔓延、猛毒爆发、刀尖舞步、影袭连环、无影无踪。
4. 将隐匿者 20 条正式加入职业池。

完成门槛：毒素不递归扩散，主动移动与强制位移分离，Boss 免疫隐匿控制。

## 批次 7：UI、兼容与总验收

涉及文件：

- 修改 `PveToastView.ts`、`PveCharacterPanel.ts`
- 修改 `PROJECT_NAVIGATION.md`、`CALL_FLOW.md`
- 修改 `specs/260608-pve-destiny-expedition/design.md`

任务：

1. UI 全部改为读取统一 Catalog，删除重复文案表。
2. 角色面板显示叠加层数与流派标签。
3. 旧 id 读取和活动存档兼容测试。
4. 更新导航、调用链和 PVE 主设计文档。
5. 运行 `npm run typecheck:game`、`npm run test:pve`、相关云端测试。
6. 检查所有候选均有真实效果，不存在返还 AP、直接 `Math.random()` 或 Cocos core 依赖。

完成门槛：80 条目录、效果、文案、存档与测试全部闭环。

