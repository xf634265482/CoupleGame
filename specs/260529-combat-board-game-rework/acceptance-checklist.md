# 血量淘汰玩法改版 — AC 验收记录

> 检查时间：2026-05-29  
> 需求文档：`design.md` §6  
> 服务端单测：`cloudfunctions/common` → `npm test`（61 passed）

## 自动化验证摘要

| 命令 | 结果 |
|------|------|
| `cd cloudfunctions/common && npm test` | ✅ 61/61 通过 |

## AC 逐项记录

| AC | 结论 | 验证方式 | 证据 / 备注 |
|----|------|----------|-------------|
| AC-1 | ✅ | 单测 + 代码 | `BoardGenerator` 75 格、`neutralCreatures[3]`；`BoardView` 横版布局 |
| AC-2 | ✅ | 单测 | `createInitialGameDoc` hp=10；`NO_WEAPON` 拒绝攻击 |
| AC-3 | ✅ | 单测 + 代码 | `rollDice`/`useItem`/`attack`/`endTurn` 各一次限制；`HudController` 四按钮 |
| AC-4 | ✅ | 单测 | `applyPathCells` 多格金币；`buildPathIndices` 环形路径 |
| AC-5 | ✅ | 单测 + 代码 | 金币/钻石/事件/小游戏路径用例；`pendingInteraction` 延迟小游戏 |
| AC-6 | ✅ | 单测 | `getPrice` 1200/900/700/500；购买扣金发装备 |
| AC-7 | ✅ | 单测 | 售罄 `SHOP_OUT_OF_STOCK`；`refreshShopStockOnPass` 路过刷新 |
| AC-8 | ✅ | 单测 | 枪 8 钻、医疗包 4 钻 |
| AC-9 | ✅ | 单测 | 传说店售罄与刷新（同 AC-7 模式） |
| AC-10 | ✅ | 单测 | 幸运格 7 项池；重复剑转 `LUCKY_DUPLICATE_EQUIP_GOLD` |
| AC-11 | ✅ | 单测 | 剑距2伤1、枪距4伤1.5、炮距7伤2（`WEAPON_STATS` + 攻击用例） |
| AC-12 | ✅ | 单测 | 盔 0.5、铠 1、最低伤 0.5 |
| AC-13 | ✅ | 单测 | 行军鞋单数+1双数+2；`rollDice` 路径步数 |
| AC-14 | ✅ | 单测 | `useItem DOUBLE_DICE` + `extraRollDice` |
| AC-15 | ✅ | 单测 | 路过陷阱扣血；放置者不触发；`useItem TRAP` |
| AC-16 | ✅ | 单测 | 满血拒绝；治疗 +2 封顶 10 |
| AC-17 | ✅ | 单测 | 区域校验 `NOT_IN_REGION`；击杀 2000 金+道具+10% 炮 |
| AC-18 | ✅ | 单测 | 路径淘汰中断；`LAST_STANDING` 1v1 击杀结算 |
| AC-19 | ✅ | 单测 | `ACTION_ROUNDS` 超时；存活>HP>kills>资源值排名 |
| AC-20 | ⚠️ | 代码审查 + **待人工** | `HudController` 已实现 HP/装备/道具/行动剩余；需真机目视 HUD |
| AC-21 | ✅ | 代码审查 | 状态变更经 `GameService` → 云函数；`GameStateMirror` 只读展示 |

## 双端联调清单（需微信开发者工具 ×2）

**操作说明**：见 [`dual-device-debug.md`](./dual-device-debug.md)（建房、开局、逐项验收步骤与 AC-20 目视表）。

以下项 **无法** 由 Jest 完全替代，建议在联调时勾选：

- [ ] 两实例 watch 同一 `gameId`，掷骰后双方棋子与 HUD 同步
- [ ] 路径多格事件 toast / 战斗日志顺序正确
- [ ] 踩商店格弹出购买，金币/钻扣除与装备显示一致
- [ ] 踩小游戏 → 吹牛 → 回棋盘仍可道具/攻击（投骰已用则不可再掷）
- [ ] 攻击玩家/中立生物、淘汰、进入结算页字段（HP/击败数/资源值）
- [ ] 客户端本地改 `GameStateMirror` 不影响云端（刷新后恢复）

## 已知问题

| # | 描述 | 严重度 |
|---|------|--------|
| — | 暂无 | — |

## 结论

- **服务端规则**：AC-1～AC-19、AC-21 已通过单测或代码审查。  
- **客户端展示**：AC-20 实现就绪，建议完成上表双端联调后标为全量通过。
