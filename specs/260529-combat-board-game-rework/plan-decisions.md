# 血量淘汰玩法改版 计划决策记录

> 记录 AI 在制定开发计划时的代码探索过程、实现取舍和上下文缺口。

---

## 代码探索日志

| # | 探索目标 | 搜索方式 | 找到的关键文件 | 信息来源 | 难度 |
|---|----------|----------|----------------|----------|------|
| 1 | 确认项目级规范 | 搜索 `CLAUDE.md`、rules 目录 | 未找到 `CLAUDE.md` 或项目 rules | 手动搜索 | 直接找到 |
| 2 | 定位新版需求 | 读取 `specs/260529-combat-board-game-rework/design.md`、`decisions.md` | 新玩法 21 条 AC、21 条需求决策 | design/decisions 文档 | 直接找到 |
| 3 | 判断当前实现状态 | 探索 `assets/**`、`cloudfunctions/**`、`shared/**` | MVP 已实现，血量淘汰代码尚不存在 | 代码探索 | 直接找到 |
| 4 | 定位服务端权威逻辑 | 搜索 `GameEngine`、`BoardGenerator`、`CellResolver`、`Settlement` | `cloudfunctions/common/GameEngine.js`、`BoardGenerator.js`、`CellResolver.js`、`Settlement.js` | 手动搜索 + 代码读取 | 直接找到 |
| 5 | 确认当前棋盘常量 | 读取 `cloudfunctions/common/constants.js`、`shared/protocol.ts` | `BOARD_SIZE=58`、`DICE_MAX=7`、`TARGET_LAPS=2`、`TARGET_ACTION_ROUNDS=10` | 代码读取 | 直接找到 |
| 6 | 定位云函数 action 分发 | 搜索 `rollDice`、`quit`、`bluff` | `cloudfunctions/game/index.js` | 代码探索 | 直接找到 |
| 7 | 定位协议与客户端类型 | 读取 `shared/protocol.ts`，探索 `assets/scripts/types/GameTypes.ts` | 当前仅支持 MVP cell/action/player 字段 | 代码读取 | 直接找到 |
| 8 | 定位棋盘 UI | 搜索 `HudController`、`BoardController`、`BoardView`、`boardLayout` | `assets/scripts/game/board/**` | 代码探索 | 直接找到 |
| 9 | 确认 UI 构建模式 | 读取 `HudController.ts` | 代码构建 UI，无 prefab 依赖 | 代码读取 | 直接找到 |
| 10 | 确认 common 同步方式 | 搜索 `sync-cloud-common` | `scripts/sync-cloud-common.js`，common 文件需同步到各云函数 | 代码探索 | 直接找到 |
| 11 | 查找测试入口 | 搜索 Jest 与 `__tests__` | `cloudfunctions/common/__tests__/game.test.js` | 代码探索 | 直接找到 |

## 实现决策

| ID | 决策主题 | 备选方案 | 最终选择 | 决策理由 |
|----|----------|----------|----------|----------|
| PD1 | 新玩法落地方式 | 直接替换 MVP / 新增 gameMode 双模式 | 直接替换 MVP | 当前无多模式架构；双模式会扩大协议、房间、UI、测试复杂度；旧文档已保留可追溯 |
| PD2 | 服务端改造边界 | 只改 `game` 云函数 / 改 `common` canonical 逻辑 | 改 `cloudfunctions/common/` 并同步 | 项目已有 common 复用与同步机制，避免各云函数副本分叉 |
| PD3 | 新服务端模块 | 全部塞进 `GameEngine` / 拆分 resolver | 新增 `CombatResolver.js`、`ShopResolver.js` | 战斗、商店、格子触发规则复杂，拆分后更容易测试和维护 |
| PD4 | 棋盘拓扑 | 非环形直线路径 / 环形路径 / 坐标距离 | 视觉横版长方形，逻辑环形路径 | 与 design.md 默认一致，最小化距离算法和回合移动复杂度 |
| PD5 | 格子分布 | 等待后续确认 / 计划中给默认分布 | 计划给默认分布 | `BoardGenerator` 需要可实现输入；默认分布保留旧格子并给新格子足够出现率 |
| PD6 | 骰子规则 | 保留 1～7 且 7 再掷 / 改 1～6 | 改 1～6 | 双骰子已承担额外投骰能力，保留 7 会与新版道具定位冲突 |
| PD7 | 局内钻石处理 | 继续结算写入局外 / 拆分局内局外 | 局内钻石不默认写入 `users.diamond` | 新版钻石用于传说商店消费，必须避免消费长期资产的误解 |
| PD8 | 淘汰字段 | 新增 `isEliminated` / 复用 `isDefeated` | 复用 `isDefeated` | 现有协议和 UI 已识别该字段，语义可从判负扩展为淘汰 |
| PD9 | 路径触发结果 | 只写最后事件 / 写事件数组 | 新增 `lastEvents[]`，保留 `lastEvent` 兼容展示 | 路径触发会产生多个事件，客户端需要按动画节奏展示 |
| PD10 | 测试策略 | 主要手测 / 先服务端 Jest | 以 `cloudfunctions/common/__tests__` 为主 | 新规则随机与状态组合多，服务端纯逻辑单测能降低回归风险 |

## 上下文缺口

| # | 缺失的上下文 | 实际查找方式 | 耗费的额外动作 | 建议补充到 |
|---|--------------|--------------|----------------|------------|
| 1 | 项目没有统一说明 canonical common 文件和同步流程 | 搜索并阅读 `scripts/sync-cloud-common.js` 与 common 结构 | 需要额外探索部署/同步约定 | `CLAUDE.md` |
| 2 | 当前实现与旧设计文档不完全一致，代码为 58 格而旧设计写 72 格 | 读取 `constants.js`、`protocol.ts` 后确认 | 需要以代码为准重新判断改造幅度 | `specs/260526-online-party-board-game/plan-decisions.md` 或项目说明 |
| 3 | 血量淘汰版未明确商店格、幸运格数量 | 从 `design.md` 待确认事项推导 | 计划阶段需要补默认分布 | 新版 `design.md` 或后续设计审查 |
| 4 | 横版长方形棋盘的拓扑没有视觉坐标图 | 结合 design 默认和当前 `boardLayout` 推断 | 计划先采用环形路径，具体坐标需实现时设计 | 新版 `design.md` 附录或美术地图规范 |
| 5 | 局外奖励策略未定义 | 阅读 `decisions.md` D20 与旧结算逻辑 | 计划暂定不写局外钻石 | 后续经济系统设计文档 |
| 6 | 小游戏在多行动回合中的接续细节未完全定义 | 阅读旧 `BluffEngine` 设计与新版需求 | 计划要求服务端统一设置回合状态 | 新版 `design.md` 待确认事项 |
| 7 | 云函数部署步骤与 common 同步命令没有集中说明 | 搜索脚本与 package | 需要从文件结构推断 | `CLAUDE.md` 或 `cloudfunctions/README.md` |

## Harness 改进建议

1. 在项目根新增 `CLAUDE.md`，记录 Cocos 客户端、云函数、shared 类型、common 同步和测试命令的固定约定。
2. 在玩法规格中记录“当前代码实际状态”与“设计目标状态”的差异，避免后续计划误以旧设计文档的 72 格为实现现状。
3. 为棋盘类玩法建立固定检查清单：棋盘大小、路径拓扑、格子分布、结算规则、局内/局外货币边界、客户端展示字段。
4. 将 `shared/protocol.ts`、`assets/scripts/types/GameTypes.ts`、`cloudfunctions/common/constants.js` 的同步要求写入项目规则，避免三处类型/常量漂移。
5. 将 `scripts/sync-cloud-common.js` 的使用时机写入开发流程：修改 `cloudfunctions/common/**` 后必须同步再部署云函数。
