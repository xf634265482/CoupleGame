# 命运远征：当前功能设计

本文档是 PVE 玩法的当前唯一总入口。代码、测试和运营工具必须以这里的边界为准。

## 1. 产品边界

- 游戏采用永久逐层挑战；每次只创建、保存和结算一个楼层挑战。
- 当前可游玩内容为第一章至第五章，共 1–35 层。
- 五章内容完成后，不再开放更高楼层入口。
- 第一至第五章的战斗数值、怪物配置和关卡目标是当前基准。
- PVE 与其他玩法的数据、入口和结算互不覆盖。

## 2. 楼层流程

1. 大厅读取 `pveProfile`，玩家选择已解锁楼层。
2. 云端 `startFloorChallenge` 校验楼层、职业、装备、命痕和体力，创建唯一活动挑战。
3. 客户端依据挑战 seed 生成确定性战场，并按回合保存序列化运行时。
4. 通关或死亡时先把结算请求写入本地待同步队列并后台调用 `settleFloorChallenge`；通关 UI 不阻塞等待云端。点「继续远征」时再确认云端结算完成并开启下一层。大厅/重进远征会补推未完成的待结算。
5. 通关解锁下一层；死亡保留已获得的永久进度，但本次楼层需要重新挑战。

大厅「选择远征楼层」弹窗按章节翻页（当前 1–5 章，每章 7 层）：无进行中挑战时**默认打开最高解锁章节**；有续玩进度则打开该层所在章。左右箭头可在**已解锁章节**间翻页，未解锁章节不可进入。副标题展示全局最高解锁进度（如「已解锁到第三章第 2 层」）。

同一个挑战的开始、保存和结算必须幂等。客户端数值不能替代云端校验。

## 3. 体力

- 上限：60。
- 恢复：每 5 分钟恢复 1 点，按云端时间计算。
- 消耗：每次创建楼层挑战消耗 5 点。
- 首次教程楼层免费一次；退出、死亡或再次挑战都按新的楼层挑战处理。
- 未完成教程（`tutorialCompleted !== true`）时，第 1 层注入战士脚本关：蓄力 / 破阵先弹机制说明（换行或框内滚动），再引导操作；点格击杀步骤同时允许「攻击」按钮。
- 中段在击杀第一只怪后进入 `partner_blink`：先弹**伙伴对话框**（闪狐形象 + 同伴语气文案 +「好，走吧」），再强制点「伙伴」闪现至 `(3,2)`（切比雪夫距离 2）；第二只怪在 `(4,2)`。蓄力/破阵仍用机制说明窗；伙伴步不用说明书口吻。细则见 `docs/superpowers/specs/2026-07-31-tutorial-partner-blink-design.md`。
- 教程说明弹窗不得改写 `_busy`；若在 `_apply` 回放中进入说明步，须等回放结束再弹窗，避免与 `_apply.finally` 竞态导致蓄力后点怪/攻击静默失效。
- 取钥匙步骤须高亮走廊全程（含中间格），点格步骤同时允许方向键，但落点仍受引导格约束，避免只高亮钥匙导致无法走近。
- 广告层只保留通用平台能力；PVE 不直接依赖任何广告业务入口。

## 4. 战斗与章节

- 采用格子移动、AP 回合、迷雾、即时攻击、怪物 AI、楼层目标和 Boss 机制。
- 战斗点选：射程内点敌怪（或可破坏石块/冰墙）即攻击，与底栏攻击按钮等价；射程外只选中目标卡。
- 战争号角友军在怪物回合可攻击敌怪；攻击表现与战报归属友军，不得播成玩家出手。
- 流沙巨蝎潜地（`isBurrowed`）期间不占格挡路，细则见第二章内容文档。
- 第一章内容见 `../260712-pve-persistent-floor-progression/chapter-1-content.md`。
- 第二章内容见 `../260712-pve-persistent-floor-progression/chapter-2-content.md`。
- 第三章内容见 `../260712-pve-persistent-floor-progression/chapter-3-content.md`。
- 第四章内容见 `../260712-pve-persistent-floor-progression/chapter-4-content.md`。
- 第五章内容见 `../260712-pve-persistent-floor-progression/chapter-5-content.md`。
- 1–35 层必须能从大厅进入、战斗、保存、结算并返回大厅，且无缺失 UI 或资源。
- 同一 seed、同一输入序列必须得到同一战斗结果。

## 5. 职业与灵气爆发

- 只有战士、射手、游侠三条职业线。
- 职业基础面板由 `ProfessionBaseStats.ts` 定义，职业动作由 `ProfessionActionSystem.ts` 处理。
- 熟练度、等级和已解锁技巧保存在 `pveProfile.professions`。
- 灵气爆发是当前职业战斗资源，状态由 `SpiritBurstSystem.ts` 和职业动作系统共同处理。
- 职业切换、熟练度升级和技巧解锁只通过营地与当前云端进度接口进行。
- **营地角色区属性预览**：每张已解锁职业卡展示「该职业 + 当前营地装备配置」的攻击、最大生命、护甲、射程；口径为营地配置预览（最大生命，不含局内残血/临时状态）。切换职业或换装保存后即时刷新；用于对比调配，不改变开战快照规则（进行中的挑战仍用开局快照）。

## 6. 装备

- 装备唯一目录为 `equipment-catalog.md` 对应的 85 件固定装备。
- 掉落、Boss 战利品、营地库存和战斗装配都必须引用同一 `definitionId`。
- 装备品质、强化等级、固定几何和生效数值由 `core/equipment/` 统一计算。
- **鞋子三岔**：`shoes_light`（轻靴·机动视野）/ `shoes_war`（战靴·节奏爆发）/ `shoes_iron`（铁靴·续航硬抗）。主数值为最大生命；类型效果由实例品质查阶段表（白/绿仅薄生命，稀有起身份，史诗起专精；铁靴史诗起首步 +1 AP）。细则见 `docs/superpowers/specs/2026-08-04-shoes-type-quality-design.md` 与 `equipment-catalog.md`。
- **饰品三岔**：`trinket_spirit`（灵气）/ `trinket_luck`（幸运）/ `trinket_gold`（财运）。主数值为灵气获取 %（不计入生命）；白/绿仅薄灵气%，稀有起分支专精。细则见 `docs/superpowers/specs/2026-08-04-trinket-type-quality-design.md`。
- 营地强化消耗**星尘 + 淬星砂**；合成升品消耗**星尘 + 聚星核**（`materials.quenchSand` / `materials.fusionCore`）。
- 营地支持 **三合一升品**：三件同名同品质、未锁未穿装备 → 一件高一阶品质（强化归零，`baseStat` 取平均）；按材料品质扣星尘与聚星核；传奇不可再合成。营地装备台提供显式合成区（上 1 结果、下 3 材料；格子与背包同尺寸、无连线、结果格不预告文案）；显式合成区以代码绘制**熔炉台**展示；背包详情用「投入合成」，不再一键自动挑料。权威在 `PveCamp` `SYNTHESIZE`。
- 材料可通过通关结算与出售装备获得。营地 **命痕台 / 装备台** 下方为**共用背包 UI**（滤镜：命痕 / 装备 / 材料 / 全部）；格子与装配区统一正方形；淬星砂/聚星核/虚空革仅数量 > 0 时入包（材料图标 + 右下角数量），装备台顶部不另挂材料摘要。共用背包容量默认 **25**，可花**星尘 + 虚空革**升级至 35/45/60（标题行「扩容」）；虚空革 Boss 通关 +2、精英目标层 +1（CLEAR）；权威 `PveCamp` `UPGRADE_BAG` / `bagCapacity`。细则见 `docs/superpowers/specs/2026-07-31-camp-ui-glyph-inventory-design.md`、`2026-07-31-camp-bag-upgrade-design.md`、`2026-07-31-camp-materials-v1-design.md`、`equipment-catalog.md` §1.4–1.5。
- 任何无法在固定目录解析的装备都不得进入挑战快照。
- 第二章入口护甲软着陆（普通甲 4 / 精英 8 / Boss 10 等）见 `docs/superpowers/specs/2026-07-18-ch2-armor-softland-craft-v1-design.md`，不改 `chapterScaling` 总表。

## 7. 命痕

- 命痕是玩家永久解锁的**战术工具箱**：每枚绑定一种可重复触发的战场行为，通过装配组合改变打法，而非单纯数值加成。
- 营地命痕装配槽上限为 **10**；首通通关命痕弹窗固定 **三选一**（楼层主题池可更长，展示截取前 3 个）。
- 完整机制、数值与试炼文案以 `specs/260712-pve-persistent-floor-progression/minghen-catalog.md` 与客户端 `core/minghen/MinghenCatalog.ts` 为权威；V3 已扩容至 M56；**楼层主题池**以各章 `*FloorCatalog.minghenIds` 与云端 `PveMinghen.MINGHEN_SOURCES`（1–35）为准。M39–M50 已挂入第五章主题池；M51–M56 仍为通用命痕（商会软补）。
- 命痕收集、装配、方案、追踪、试炼和战斗效果是当前系统；数据由 `PveMinghen.js`、`PveProgression.js` 与客户端 `core/minghen/` 共同维护。
- **获取分层**：楼层教学命痕走首通/追踪（主题池 ID）；通用工具（M51–M56 等未入主题池者）由大厅「今日商会」弹窗软补货——星尘池约 4 格 + 兑换配方 3 格（格子尺寸/字形与营地命痕格一致）；广告刷新 ≤1 次/日（UI 暂隐藏，接入激励视频后再展示）；兑换只消耗升级里程碑之外的多余副本。minghenDailyShop 永不写云库 null（清档用空店占位；loadProfile 先 remove 再 set），避免 CloudBase 无法在 null 上创建 adRefreshUsed。同名 I→II 须在营地命痕台显式合成（不自动升 II），不做异名随机合成与残片；显式合成区以代码绘制**星盘台**展示（荧光实线光晕，无折线）。营地命痕台负责装配/合成；未装配剩余命痕进入共用库存（展示 = 未装配实体 1 + 超出当前等级材料门槛的多余副本；装上则实体不计，无剩余不列出；2×I→II 后背包为 1 枚 II）；格子内用代码绘制象形星座符（无孤立星点、同 id 稳定），点击看详情，小格不写名称。方案入口本期隐藏。权威细则见 `docs/superpowers/specs/2026-07-18-minghen-acquisition-economy-design.md`、`2026-07-28-minghen-camp-synth-ui-design.md`（合成规则）与 `2026-07-31-camp-ui-glyph-inventory-design.md`（展示）；云端 `PveMinghenShop.js` + `SYNTHESIZE_MINGHEN` + 大厅侧边入口 `MinghenShopController`。
- 楼层与命痕的掉落接入、主题池与关卡标签适配见各章 content 文档，不在本文件展开。
- 星尘是营地统一货币；结算产生的命痕粉尘在入账时统一折算为星尘。

## 7.1 伙伴

- 伙伴是**主动战术技能陪伴**：每场携带 1 名，不占棋盘/不参与 AI/不自动攻击，每层主动技能基础 1 次。
- 首批六类：位移 / 守护 / 破阵 / 控场 / 灵气 / 治疗；四阶段进化（Lv5/15/30 + 星尘；试炼接口首版恒通过）。
- 大厅底栏「伙伴」入口；战斗 HUD 左下「伙伴」按钮；右上去掉星尘/职业标与钥匙角标，「角色」移至右上；蓄力文案为 `蓄力 N`。
- 档案字段 `partners` + `equippedPartnerId`；开局快照冻结；通关经验 `30 + floor`（含重复通关）。
- **等级软顶**：`maxLevel = min(99, highestClearedFloor + 1)`；超额 XP 可囤，软顶抬高后再升级。进化保留 Lv/星尘门槛，并消耗专属材料 **契核**（2/3/4 阶：5/15/40）；精英 CLEAR 20%×1、Boss CLEAR 必掉 2；签到累计 7/15/20 附 +1/+2/+3。细则见 `docs/superpowers/specs/2026-08-03-partner-level-cap-bond-core-design.md`。
- **逐步解锁（progressive）**：新档/清档默认全锁；进入第 1 层教程发放并装备 `MOBILITY`；通关 3/5/7/10/17 分别解锁守护/治疗/破阵/控场/灵气；面板灰态展示条件；老档 `legacy` 不倒扣。细则见 `docs/superpowers/specs/2026-07-29-partner-progressive-unlock-design.md`。
- **GM**：`unlockAllPartners` 可将六只伙伴全部开锁（保留养成进度，不切 `legacy`）；通关条件再达成时幂等跳过；`resetExpedition` 清档后仍回全锁按条件解锁。
- **同伴名**：闪狐 / 岩盾 / 愈羽 / 裂爪 / 眠枭 / 灵萤；职能（位移/守护…）仅作副标，不用「XX伙伴」主标题。
- **解锁揭晓**：通关奖励选择并云端 settle 后，按顺序逐个弹「新同伴加入」揭晓窗（认识一下）；教程闪狐强制闪现已展示则不再揭晓闪狐。细则见 `docs/superpowers/specs/2026-08-01-partner-unlock-reveal-design.md`。
- **技能演出**：六只主动技能确认后，屏幕右侧矮透明板（约 2.5×1.05 格、靠右）自右向左滑入；左侧温情技能短句、右侧伙伴大图底在板内头顶可露外，停约 2.5s 后淡出；并行播棋盘专属特效（`PartnerSkillFx` + `Effects`）；闪狐先离场再结算再落格成形；岩盾软光石障成形后丝滑淡出；眠枭单色细荧光环伸展到位后立刻淡出；灵萤为软光团+萤火（无光柱）；演出期间 `_busy` 锁输入。细则见 `docs/superpowers/specs/2026-08-01-partner-skill-fx-design.md`。
- **护盾 HUD**：玩家血条右侧叠灰色护盾段；数值写在 HP 文案括号内如 `HP 369 / 369 (55)`，白色字。
- 教程内强制体验一次位移：`partner_blink` 步（伙伴对话框 + 强制闪现），见 `docs/superpowers/specs/2026-07-31-tutorial-partner-blink-design.md`。
- 权威实现：`core/partner/` + `PartnerController`/`PartnerView`；细则见 `docs/superpowers/specs/2026-07-18-partner-system-design.md`。

## 8. 云端数据

- `users.pveProfile`：永久进度、库存、职业、命痕、体力与活动挑战引用。
- `pve_challenges`：当前楼层挑战、运行时、结算状态与幂等信息。
- `pve_balance_configs`：GM 数值覆盖。
  - 永久楼层**新开本层 / 重新挑战本层**时，客户端将 `loadPveMeta.balanceSnapshot` 写入 `ExpeditionState.balanceSnapshot`。
  - 玩家字段：GM 有覆盖则整项替换对应职业基础（HP / 攻击 / 射程 / AP 基数 / 行动消耗 / 开局金与灵力）；装备加成仍叠加。
  - 纯续玩不重套最新 GM；怪物 / Boss / 装备倍率本轮不接入永久楼层开局。
- 云端共享源码只修改 `cloudfunctions/common/`，随后执行 `node scripts/sync-cloud-common.js`。

## 9. 结算与大厅资料

- 通关写入最高解锁层、最高通关层、楼层记录、职业熟练度、星尘、装备和命痕奖励。
- 死亡只结算当前规则允许保留的内容，并清除活动挑战引用。
- 排行榜以当前资料中的最高通关层为核心字段。
- 大厅只展示当前资料、楼层选择、营地、排行榜、邮箱、签到和通用设置。
- **邮箱**：左上头像卡下方入口；集合 `pve_mails`；附件支持星尘（`pveProfile.gold`）、体力、淬星砂 / 聚星核 / 虚空革（`materials.*`）、补签卡（`checkIn.makeupCards`）；纯通知无附件；未领有附件不可删；一键领取全部；不过期；软删；GM 下拉单选一种附件。
- **签到**：邮箱旁独立入口；本月累计签到（断签不清零，换月重置进度、保留补签卡）；每日奖按「当月第几天」7 日循环（星尘/淬星砂/聚星核/虚空革）；累计档 1/3/7/15/20 手动领取（7 天档附送补签卡）；补签消耗补签卡；权威 `PveCheckIn`（`pveProfile.checkIn`）；细则见 `docs/superpowers/specs/2026-07-31-lobby-checkin-rewards-design.md`。
- **货币口径**：对外仅星尘；GM `adjustResources` 支持 `stardust`/`stamina`/`makeupCards`；GM 可 `sendMail` / `sendMailBroadcast`（广播硬顶 500 用户）。

## 10. 变更要求

- 修改 `assets/scripts/pve/core/**` 或 `cloudfunctions/common/pve/**` 时同步本文档。
- 不为未开放章节修改第一、二章数值。
- 变更后至少通过游戏 TypeScript 检查、PVE 全量测试、云端测试与 GM 构建。

## 11. 2026-07-18 楼层中立交互边界

- 楼层中立交互只保留当前关卡需要的宝箱、温泉、祭坛、火药桶、爆破点、传送门等。
- 旧楼层神像与旧楼层铁匠已退役，不再进入地图生成、HUD/迷雾图标、远征弹窗 UI 或主包预加载。
- 微信主包 4MB：大厅首屏保留大厅 UI/BGM，以及启动/远征 `LoadingOverlay` 所需转场图（须早于 `resources` 分包）；战斗地图图与第1章战场背景留在 `resources` 分包。大厅 UI 就绪后立刻预热战斗资源；玩家点进远征时若预热未完成则短等同一预热 Promise，避免进厅后立刻开战出现长时间加载或红块。
- 装备强化仅保留营地成长线。
## 12. 2026-07-18 战斗内设置与重开本层

- 远征战斗 HUD 左下原「返回」按钮改为「设置」。
- 设置弹窗包含「继续冒险」「重新挑战本层」「返回大厅」。
- 返回大厅会先保存当前 ACTIVE 楼层运行时，之后可从大厅继续。
- 重新挑战本层会二次确认，放弃当前同配置 ACTIVE 挑战并创建新的同层挑战；不重复扣除体力，本层未结算的临时进度、临时掉落和战斗状态全部丢弃。
- 云端 `startFloorChallenge` 使用 `abandonActive + forceRestart` 表示同层免体力重开；职业 / 装备 / 命痕仍冻结为 ACTIVE 开局快照，防止借重开换装。
- **伙伴例外**：重新挑战时伙伴取自当前档案 `equippedPartnerId`（及对应进化阶段），不冻结旧挑战里的伙伴。
- **大厅换伴后再进同层**：若 ACTIVE 挑战伙伴与档案装备不一致，客户端免体力 `forceRestart` 重开（不再静默续玩旧伙伴）；战斗内「重新挑战」同理。
- 战斗内重开对职业 / 装备 / 命痕仍以 ACTIVE challenge 开局快照为准；云端在 `abandonActive + forceRestart` 且同楼层/同模式时按上述规则重建。
