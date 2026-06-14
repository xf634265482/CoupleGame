# 血量淘汰玩法改版 - 任务清单

> 每个任务设计为可独立执行，可交给单独的 Claude 进程处理。  
> 本任务清单由 task-generate skill 根据 plan.md 自动生成。  
> 计划参考：`specs/260529-combat-board-game-rework/plan.md`  
> 验收参考：`specs/260529-combat-board-game-rework/design.md` §6

---

## 阶段一：P0 协议与常量

> 目标：三端协议对齐，定义 75 格、战斗枚举、新 action 与 `games` 文档扩展字段。  
> 覆盖 AC：AC-1, AC-2, AC-21  
> 计划参考：plan.md §1.2 P0、§4、§5.1 常量与协议

### Task 1.1 - ✅ 扩展共享协议 `shared/protocol.ts`

- **目标**：定义血量淘汰版类型、枚举与新云函数 action
- **所在项目**：`CoupleGame/shared/`
- **依赖**：无
- **产出**：`shared/protocol.ts`（扩展）
- **执行指令**：

```
1. 读取 plan.md §4.1～§4.2、design.md §5.2～§5.3
2. 修改常量：BOARD_SIZE=75，DICE_MAX=6；移除或废弃 TARGET_LAPS 作为胜负条件（可保留字段兼容）
3. 扩展 CellType：GOLD_SHOP、LEGENDARY_SHOP、LUCKY
4. 扩展 GameAction：useItem、extraRollDice、attack、buyShopItem、endTurn
5. 扩展 GamePlayer：hp、maxHp、kills、weapon、armor、shoes、items、shopStock、turnActions
6. 扩展 GameDoc：boardSize、pendingInteraction、traps、neutralCreatures、lastEvents
7. 扩展 SettlementVO：存活/HP/击败数/资源价值排名字段
8. 注释标注对应 AC（→ AC-1, AC-2, AC-21）
参考：plan.md §4.2、plan-decisions.md PD6/PD7/PD8
验证：tsc --noEmit（shared/tsconfig.json）或 IDE 无类型错误
```

---

### Task 1.2 - ✅ 同步客户端类型与常量

- **目标**：客户端类型、常量与 `shared/protocol.ts` 一致
- **所在项目**：`CoupleGame/assets/scripts/`
- **依赖**：Task 1.1
- **产出**：`assets/scripts/types/GameTypes.ts`、`assets/scripts/core/Constants.ts`
- **执行指令**：

```
1. 将 Task 1.1 中新增/修改的类型镜像到 GameTypes.ts
2. 更新 Constants.ts：BOARD_SIZE=75、DICE_MAX=6，新增 INITIAL_HP、商店价格等（与 protocol 对齐）
3. 检查 GameStateMirror、BoardController 等对 GameDoc 的引用是否需要临时兼容
参考：plan.md §5.1 常量与协议、plan-decisions.md §Harness 建议第4条
验证：项目 TypeScript 编译通过（或受影响文件无红线）
```

---

### Task 1.3 - ✅ 更新服务端常量 `cloudfunctions/common/constants.js`

- **目标**：服务端常量与协议一致，新增战斗/商店数值
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 1.1
- **产出**：`cloudfunctions/common/constants.js`
- **执行指令**：

```
1. BOARD_SIZE: 58 → 75
2. DICE_MAX: 7 → 6（删除掷 7 再掷规则，见 PD6）
3. 新增：INITIAL_HP=10、武器距离/伤害、护甲减免、商店价格、幸运格池、中立生物 HP、火箭炮掉落概率
4. 保留 COLLECTIONS、BLUFF_* 等现有常量
参考：plan.md §5.1 常量与协议、decisions.md D9～D15
验证：require('./constants') 无语法错误
```

---

### Task 1.4 - ✅ 编写 `games` 文档扩展说明（ddl-sql）

- **目标**：记录血量淘汰版 `games` 运行时字段，供上线与联调对照
- **所在项目**：`CoupleGame/specs/260529-combat-board-game-rework/`
- **依赖**：Task 1.1
- **产出**：`specs/260529-combat-board-game-rework/ddl-sql.md`
- **执行指令**：

```
1. 新建 ddl-sql.md（微信云数据库文档型，无 MySQL DDL）
2. 说明：不新增 collection；扩展 games 文档字段（players 战斗字段、traps、neutralCreatures、pendingInteraction、lastEvents 等）
3. 明确 users.diamond 为局外钻石；局内钻石仍在 games.players[].diamond，结算默认不写回 users（PD7）
4. 列出字段类型、说明、索引（沿用现有 games.roomId 等）
5. 安全规则：客户端 games 只读，写操作经云函数
参考：plan.md §4.3、§5.3；旧版 specs/260526-online-party-board-game/ddl-sql.md 格式
验证：字段与 protocol.ts §4.2 一致
```

---

## 阶段二：P1 服务端状态机（棋盘初始化 + 路径触发 + 多行动回合）

> 目标：75 格开局、路径格触发、三行动回合、淘汰与超时结算骨架。  
> 覆盖 AC：AC-1～AC-5, AC-18, AC-19, AC-21  
> 计划参考：plan.md §5.1 BoardGenerator、CellResolver、GameEngine、Settlement

### Task 2.1 - ✅ 改造 `BoardGenerator.js`（75 格 + 战斗初始状态）

- **目标**：开局生成 75 格棋盘、3 区中立生物、玩家 HP/装备/道具初始态 → AC-1, AC-2, AC-5
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 1.3
- **产出**：`BoardGenerator.js`
- **执行指令**：

```
1. createInitialGameDoc：boardCells 长度 75
2. 格子分布（PD4）：1 钻石、18 金币、5 事件、5 小游戏、4 金币商店、2 传说商店、5 幸运、35 普通
3. 每名玩家：hp=10、maxHp=10、kills=0、无武器、items 全 0、turnActions 全 false
4. neutralCreatures[3]：regionIndex 0/1/2，hp=6，defeated=false
5. traps=[]、pendingInteraction=null、lastEvents=[]
6. 移除或弱化 lap 作为胜负条件（lap 可保留展示用）
参考：plan.md §5.1 棋盘初始化、design.md §3.2～§3.4
验证：Jest 或本地脚本断言 75 格、格子数量、3 只中立生物、玩家 hp=10
```

---

### Task 2.2 - ✅ 改造 `CellResolver.js`（路径触发 + 延迟交互）

- **目标**：移动路径上依次触发格子；商店/小游戏延迟到移动结束 → AC-4, AC-5, AC-10, AC-15
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.1
- **产出**：`CellResolver.js`
- **执行指令**：

```
1. 将 applyCellLanding 重构为 applyPathCells(game, player, pathIndices, rng)
2. 路径上依次处理：金币、钻石、事件、幸运格、陷阱（路过即结算）
3. HP 清零时停止后续路径触发并标记淘汰
4. GOLD_SHOP / LEGENDARY_SHOP / MINIGAME：写入 pendingInteraction，不中断路径循环
5. 多交互格：优先落点，否则路径中最后一个交互格
6. 实现幸运格 7 项池（AC-10）；陷阱路过扣 1 HP（AC-15 与 traps 数组配合）
参考：plan.md §5.1 路径触发、design.md §3.3
验证：Jest 用例覆盖路径多格、淘汰中断、pendingInteraction
```

---

### Task 2.3 - ✅ 改造 `GameEngine.js`（多行动回合）

- **目标**：投骰/用道具/攻击各最多一次，可 endTurn；行军鞋与双骰子骨架 → AC-3, AC-13, AC-14, AC-21
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.2
- **产出**：`GameEngine.js`
- **执行指令**：

```
1. rollDice：校验 currentSeat、!isDefeated、!turnActions.rolled；骰子 1～6；行军鞋单数+1双数+2（AC-13）
2. 调用 applyPathCells；完成后 turnActions.rolled=true；不自动 endTurn（与 MVP 不同）
3. useItem / extraRollDice / endTurn 可先 stub，Task 3.x 补全道具与商店
4. toGamePatch 增加 traps、neutralCreatures、pendingInteraction、lastEvents
5. quitGame：玩家 isDefeated=true；若仅 1 人存活则 forceSettle（AC-18）
6. checkGameEnd：最后 1 人存活立即结算；超时/行动回合上限走 Settlement（AC-19）
参考：plan.md §5.1 多行动回合、plan-decisions.md PD1/PD6
验证：Jest 覆盖回合校验、roll 后不自动换人、endTurn 切换座位
```

---

### Task 2.4 - ✅ 改造 `Settlement.js`（存活淘汰排名）

- **目标**：最后存活获胜；超时按存活/HP/击败数/资源价值排名 → AC-18, AC-19
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.3
- **产出**：`Settlement.js`
- **执行指令**：

```
1. forceSettle：生成 settlement.ranks（isWinner、hp、kills、resourceValue 等）
2. 排名规则：存活 > HP > kills > gold + diamond*300
3. 默认不执行 users.diamond += player.diamond（PD7）
4. 更新 applySettlementToUsers（若有）仅写必要字段或跳过局外钻石
参考：plan.md §5.1 结算、design.md §3.1
验证：Jest 覆盖 1v1 淘汰胜、超时多人兜底排名
```

---

### Task 2.5 - ✅ 同步 common 并更新 `game/index.js` 基础 action

- **目标**：部署用 common 副本一致；rollDice/endTurn/quit 可走通
- **所在项目**：`CoupleGame/cloudfunctions/game/`、`CoupleGame/scripts/`
- **依赖**：Task 2.3、Task 2.4
- **产出**：`game/index.js`、`scripts/sync-cloud-common.js`（如需登记新文件）
- **执行指令**：

```
1. 运行 node scripts/sync-cloud-common.js（修改 common 后必做）
2. game/index.js：确保 rollDice、endTurn、quit 分发到 GameEngine
3. 新 action（useItem、attack 等）可先返回 NOT_IMPLEMENTED，Task 3.5 接入
参考：plan.md §5.1 云函数 action、plan-decisions.md 上下文缺口 #1
验证：云函数本地调试 rollDice + endTurn；games 文档含新字段
```

---

## 阶段三：P2 装备道具与商店

> 目标：商店购买、道具使用、陷阱、幸运格、双骰子完整逻辑。  
> 覆盖 AC：AC-6～AC-16, AC-21  
> 计划参考：plan.md §5.1 ShopResolver、GameEngine useItem

### Task 3.1 - ✅ 新增 `ShopResolver.js`

- **目标**：金币/传说商店购买、库存、路过刷新 → AC-6～AC-9
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.1
- **产出**：`ShopResolver.js`
- **执行指令**：

```
1. 价格：剑1200、鞋900、双骰700、陷阱500；枪8钻、医疗包4钻
2. buyShopItem(game, player, shopType, itemType)：扣资源、发装备/道具、库存置 false
3. 路过商店时刷新该玩家对应 shopStock（在 CellResolver 或 GameEngine 中调用）
4. 装备槽替换：同槽位覆盖，不返还
参考：plan.md §5.1 商店、design.md §3.7～§3.8
验证：Jest 覆盖价格、售罄、刷新、资源不足
```

---

### Task 3.2 - ✅ 完善 `GameEngine` 道具与额外投骰

- **目标**：双骰子、陷阱、医疗包；extraRollDice → AC-14, AC-15, AC-16
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.3、Task 3.1
- **产出**：`GameEngine.js`（扩展）
- **执行指令**：

```
1. useItem：DOUBLE_DICE → extraRollAvailable；TRAP → 写入 traps；MEDKIT → +2 HP 上限10
2. extraRollDice：消耗 extraRollAvailable，再掷一次并走路径触发
3. 校验 turnActions.usedItem、满血不可用医疗包
参考：plan.md §5.1 多行动回合、design.md §3.6
验证：Jest 覆盖双骰子二次移动、陷阱单次触发、医疗包上限
```

---

### Task 3.3 - ✅ 将 ShopResolver 接入路径与购买 action

- **目标**：路过商店可刷新库存；buyShopItem 云函数可用
- **所在项目**：`CoupleGame/cloudfunctions/common/`、`cloudfunctions/game/`
- **依赖**：Task 3.1、Task 3.2
- **产出**：`CellResolver.js` / `GameEngine.js`、`game/index.js`
- **执行指令**：

```
1. 路径经过 GOLD_SHOP/LEGENDARY_SHOP 时刷新该玩家库存（若设计为路过刷新）
2. game/index.js 实现 buyShopItem action，参数见 plan.md §4.1
3. sync-cloud-common 后部署测试
验证：本地调试购买剑后 gold 减少、weapon=SWORD、库存售罄
```

---

## 阶段四：P3 中立生物与战斗

> 目标：攻击玩家/中立生物、伤害减免、掉落与淘汰 → AC-11, AC-12, AC-17, AC-18  
> 计划参考：plan.md §5.1 CombatResolver

### Task 4.1 - ✅ 新增 `CombatResolver.js`

- **目标**：攻击校验、距离、伤害、淘汰、中立生物掉落 → AC-2, AC-11, AC-12, AC-17, AC-18
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 2.3
- **产出**：`CombatResolver.js`
- **执行指令**：

```
1. 无武器拒绝攻击（AC-2）
2. 环形最短距离：剑2/枪4/炮7；伤害 1/1.5/2；护甲减免；min 0.5（AC-11, AC-12）
3. 攻击玩家：HP<=0 → isDefeated，攻击者 kills++
4. 攻击中立生物：按 regionIndex；最后一击 2000金+随机道具+10%火箭炮（AC-17）
5. 攻击后 checkGameEnd（仅 1 人存活）
参考：plan.md §5.1 战斗、plan-decisions.md PD4
验证：Jest 覆盖距离、减免、击杀、掉落概率（可 mock rng）
```

---

### Task 4.2 - ✅ 接入 `attack` action 与 GameEngine

- **目标**：本回合 attack 一次；game 云函数可调用
- **所在项目**：`CoupleGame/cloudfunctions/game/`、`GameEngine.js`
- **依赖**：Task 4.1
- **产出**：`game/index.js`、`GameEngine.js`
- **执行指令**：

```
1. GameEngine.attack → CombatResolver.attackPlayer / attackNeutral
2. turnActions.attacked=true
3. game/index.js：attack action，参数 targetType/targetSeat/regionIndex
4. sync-cloud-common
验证：云函数测试攻击玩家扣血、攻击中立生物减 HP
```

---

## 阶段五：P4 客户端棋盘与 HUD

> 目标：75 格 UI、信息格、四行动按钮、商店/道具/攻击交互。  
> 覆盖 AC：AC-3, AC-4, AC-20 及展示侧 AC-6～AC-17  
> 计划参考：plan.md §5.2

### Task 5.1 - ✅ 扩展 `GameService.ts` 新 action

- **目标**：客户端可调用全部战斗向云函数
- **所在项目**：`CoupleGame/assets/scripts/network/`
- **依赖**：Task 2.5、Task 3.3、Task 4.2
- **产出**：`GameService.ts`
- **执行指令**：

```
1. 新增方法：useItem、extraRollDice、attack、buyShopItem、endTurn
2. 参数类型与 protocol.ts 一致
参考：plan.md §4.1、§5.2 网络与类型
验证：编译通过；方法映射正确 action 名
```

---

### Task 5.2 - ✅ 改造 `boardLayout.ts` + `BoardView.ts`（75 格横版）

- **目标**：75 格横版长方形布局与新格子样式 → AC-1, AC-4, AC-5
- **所在项目**：`CoupleGame/assets/scripts/game/board/`
- **依赖**：Task 1.2
- **产出**：`boardLayout.ts`、`BoardView.ts`
- **执行指令**：

```
1. boardLayout：75 点坐标（横版长方形路径，逻辑仍按 index 0～74 环形）
2. BoardView：GOLD_SHOP、LEGENDARY_SHOP、LUCKY 颜色/标签；可选区域分隔线
3. 中立生物区域 HP 展示占位（3 区）
参考：plan.md §5.2 棋盘布局、plan-decisions.md PD4
验证：进入 board 场景可见 75 格与新格类型
```

---

### Task 5.3 - ✅ 改造 `HudController.ts`（HP + 四行动按钮）

- **目标**：信息格展示战斗状态；投骰/道具/攻击/结束回合 → AC-3, AC-20
- **所在项目**：`CoupleGame/assets/scripts/game/board/`
- **依赖**：Task 1.2、Task 5.1
- **产出**：`HudController.ts`
- **执行指令**：

```
1. 玩家卡：HP、金、钻、武器/护甲/鞋、道具数量、淘汰态
2. 四按钮：投骰、道具、攻击、结束回合；根据 currentSeat 与 turnActions 禁用
3. 移除或弱化 lap 主展示（可选保留次要信息）
参考：plan.md §5.2 HUD、design.md §3.12
验证：watch 更新后 HUD 与 GameDoc 一致
```

---

### Task 5.4 - ✅ 改造 `BoardController.ts`（多行动 + 弹窗 + 路径事件）

- **目标**：编排移动动画、pendingInteraction 商店/小游戏、道具与攻击 UI
- **所在项目**：`CoupleGame/assets/scripts/game/board/`
- **依赖**：Task 5.1～5.3
- **产出**：`BoardController.ts`、可选 `ShopDialog.ts`、`ItemDialog.ts`、`AttackPicker.ts`（或内联）
- **执行指令**：

```
1. 投骰后按 lastEvents 顺序 toast/动画（PawnView 逐格）
2. pendingInteraction：商店弹窗 → buyShopItem；MINIGAME → 现有 Bluff 流程
3. 道具/攻击按钮打开选择器并 callFunction
4. 战斗日志区域（攻击、陷阱、淘汰、掉落）
参考：plan.md §5.2 商店道具攻击、design.md §3.3
验证：双端 watch 联调：移动、买剑、攻击、淘汰流程可走通
```

---

### Task 5.5 - ✅ 改造 `SettlementController.ts` + 吹牛回合接续

- **目标**：结算页展示存活/HP/击败数；小游戏结束回到多行动模型 → AC-5, AC-18, AC-19
- **所在项目**：`CoupleGame/assets/scripts/settlement/`、`cloudfunctions/common/BluffEngine.js`
- **依赖**：Task 2.4、Task 5.4
- **产出**：`SettlementController.ts`、`BluffEngine.js`（如需）
- **执行指令**：

```
1. SettlementController：展示 winner、ranks、hp、kills、resourceValue；不强调局外钻石获得
2. Bluff 结束后：phase 回 BOARD，currentSeat/turnActions 由服务端明确（避免与 MVP 下家规则冲突）
参考：plan.md §5.2 小游戏与结算、plan.md §6 风险「吹牛回合接续」
验证：一局打完进入结算页字段正确；踩小游戏格后仍能继续本回合或下回合规则正确
```

---

## 阶段六：P5 测试与验收

> 目标：服务端单测、联调、AC 全量走查。  
> 覆盖 AC：AC-1～AC-21  
> 计划参考：plan.md §7

### Task 6.1 - ✅ 重写/扩展 `game.test.js`

- **目标**：核心规则回归测试覆盖新版 AC
- **所在项目**：`CoupleGame/cloudfunctions/common/__tests__/`
- **依赖**：Task 2.1～4.2、Task 3.1～3.2
- **产出**：`game.test.js`（及可选 `combat.test.js`、`shop.test.js`）
- **执行指令**：

```
1. 在 cloudfunctions/common 目录运行 npm test
2. 用例：75格初始化、路径触发、商店价格/库存、伤害减免、淘汰胜、超时排名
3. 删除或更新依赖「掷7再掷」「钻石排名」的旧断言
参考：plan.md §7 验证策略
验证：npm test 全部通过
```

---

### Task 6.2 - ✅ 双端联调与 AC 验收清单

- **目标**：按 design.md AC-1～AC-21 手动走查并记录结果
- **所在项目**：全栈
- **依赖**：Task 5.4、Task 6.1
- **产出**：`specs/260529-combat-board-game-rework/acceptance-checklist.md`
- **执行指令**：

```
1. 两个微信开发者工具实例 watch 同一 gameId
2. 走查：75格、三行动、路径触发、商店、幸运格、陷阱、攻击、中立生物、淘汰、超时
3. 确认客户端无法通过本地改 HP/金币（AC-21）
4. 将 design.md 验收标准勾选或记录问题单
参考：design.md §6、plan.md §7
验证：AC-1～AC-21 均有通过记录或已知问题列表
```

**验收记录（2026-05-29）**：见 `acceptance-checklist.md`。AC-1～AC-19、AC-21 已通过单测/代码审查；AC-20 代码就绪，双端目视联调项列于 checklist「双端联调清单」。

---

## 并行执行矩阵

```
阶段一：Task 1.1
    ↓
    ├─ Task 1.2 + Task 1.3 + Task 1.4（可并行，均依赖 1.1）
    └─ Task 1.4 完成后可启动 2.x

阶段二：Task 2.1 → 2.2 → 2.3 → 2.4 → 2.5（串行）

阶段三：Task 3.1 与 3.2 可并行（均依赖 2.3）→ 3.3

阶段四：Task 4.1 → 4.2（依赖 2.3；可与阶段三后半并行）

阶段五：Task 5.1 依赖服务端 action 就绪；5.2 可与 5.1 并行（仅依赖 1.2）
         5.3 → 5.4 → 5.5

阶段六：6.1 随 2～4 完成度递增可提前写用例；6.2 依赖 5.4
```

---

## 任务概要

| 阶段 | 任务编号 | 任务数 | 可并行 |
|------|----------|--------|--------|
| P0 协议与常量 | 1.1～1.4 | 4 | 1.2/1.3/1.4 在 1.1 后 |
| P1 服务端状态机 | 2.1～2.5 | 5 | 无 |
| P2 装备道具与商店 | 3.1～3.3 | 3 | 3.1 与 3.2 |
| P3 战斗 | 4.1～4.2 | 2 | 可与 P2 末期重叠 |
| P4 客户端 | 5.1～5.5 | 5 | 5.2 与 5.1 部分重叠 |
| P5 测试验收 | 6.1～6.2 | 2 | — |
| **合计** | | **21** | |

---

## 验收标准索引（最终任务对照）

执行 **Task 6.2** 时逐项勾选 `design.md`：

- [AC-1]～[AC-21] 见 `specs/260529-combat-board-game-rework/design.md` §6
