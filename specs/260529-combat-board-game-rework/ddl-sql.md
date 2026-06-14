# 血量淘汰玩法改版 - 云数据库上线配置

> 本项目使用 **微信云开发云数据库**（文档型 NoSQL），无 MySQL DDL。  
> 本文档为血量淘汰玩法改版的 **运行时字段最终版**，供上线与联调对照。  
> 生成时间：2026-05-29  
> 协议对齐：`shared/protocol.ts`、`assets/scripts/types/GameTypes.ts`

---

## 1. 变更范围

| 项 | 说明 |
|----|------|
| 新增 collection | **无**（沿用 `users` / `rooms` / `games` / `match_queue`） |
| 变更 collection | **`games`** 文档结构扩展；`boardCells` 格子类型扩展 |
| 不变 collection | `users`、`rooms`、`match_queue` 结构与 MVP 一致（见 `specs/260526-online-party-board-game/ddl-sql.md`） |
| 索引 | **沿用 MVP** 索引，本迭代不强制新增 |
| 安全规则 | **沿用 MVP**：客户端 `games` 只读，写操作经云函数 |

### 1.1 货币字段约定（PD7）

| 字段位置 | 含义 | 读写 |
|----------|------|------|
| `users.diamond` | **局外钻石**（长期养成，登录档案） | `login` 云函数 |
| `games.players[].diamond` | **局内钻石**（传说商店等战斗消费） | `game` 云函数 |
| 结算 | 血量淘汰版 **默认不把局内钻石累加至 `users.diamond`** | `Settlement`（Task 2.4 实现） |

---

## 2. 集合一览

| 集合 | 用途 | 本迭代 |
|------|------|--------|
| `users` | 用户档案、局外钻石 | 无结构变更 |
| `rooms` | 好友房/匹配房 | 无结构变更 |
| `games` | 对局运行时（75 格 + 战斗状态） | **字段扩展**（见 §3） |
| `match_queue` | 随机匹配队列 | 无结构变更 |

---

## 3. `games` 集合字段定义（血量淘汰版最终版）

```json
{
  "_id": "string，gameId",
  "roomId": "string",
  "phase": "string，BOARD | MINIGAME_BLUFF | SETTLED",
  "boardSize": "number，固定 75（可选冗余字段，便于客户端校验）",

  "players": [
    {
      "userId": "string",
      "openId": "string",
      "seat": "number，0～3",
      "position": "number，0～74",
      "lap": "number，保留；不以圈数决胜，可展示",
      "gold": "number，允许负数",
      "diamond": "number，局内钻石（非局外 users.diamond）",
      "isOnline": "boolean",
      "isDefeated": "boolean，淘汰态（HP 清零或退出）",

      "hp": "number，当前 HP，初始 10",
      "maxHp": "number，上限 10",
      "kills": "number，击败玩家数",
      "weapon": "string | 省略，SWORD | GUN | ROCKET",
      "armor": "string | 省略，HELMET | ARMOR",
      "shoes": "string | 省略，MARCHING_SHOES",
      "items": {
        "doubleDice": "number",
        "trap": "number",
        "medkit": "number"
      },
      "shopStock": {
        "goldShopVersion": "number，路过金币商店时递增以触发刷新",
        "legendaryShopVersion": "number",
        "goldShop": {
          "SWORD": "boolean，true=有货",
          "MARCHING_SHOES": "boolean",
          "DOUBLE_DICE": "boolean",
          "TRAP": "boolean"
        },
        "legendaryShop": {
          "GUN": "boolean",
          "MEDKIT": "boolean"
        }
      },
      "turnActions": {
        "rolled": "boolean，本回合是否已投骰",
        "usedItem": "boolean，本回合是否已用道具",
        "attacked": "boolean，本回合是否已攻击",
        "extraRollAvailable": "boolean，双骰子授予的额外投骰资格",
        "extraRolled": "boolean，本回合是否已使用额外投骰"
      },
      "doomRemainingTurns": "number，可选，厄运降临剩余回合"
    }
  ],

  "boardCells": [
    {
      "index": "number，0～74",
      "type": "string，NORMAL | GOLD | DIAMOND | EVENT | MINIGAME | GOLD_SHOP | LEGENDARY_SHOP | LUCKY",
      "goldVariant": "string，可选，FIXED_100 | FIXED_200 | FIXED_300 | RANDOM_0_500 | RANDOM_NEG200_400"
    }
  ],

  "diamondCellIndex": "number，当前钻石格 index",
  "currentSeat": "number，当前行动回合座位",
  "startedAt": "number，毫秒时间戳",
  "actionRoundCount": "number，可选，已完成的行动回合数（超时兜底）",
  "rolledSeatsThisRound": "number[]，可选，MVP 遗留；多行动回合模型下可能弱化",

  "pendingInteraction": {
    "seat": "number，待交互玩家座位",
    "cellIndex": "number",
    "type": "string，GOLD_SHOP | LEGENDARY_SHOP | MINIGAME"
  },

  "traps": [
    {
      "id": "string",
      "ownerSeat": "number，放置者",
      "cellIndex": "number",
      "damage": "number，默认 1",
      "active": "boolean，触发后置 false"
    }
  ],

  "neutralCreatures": [
    {
      "regionIndex": "number，0 | 1 | 2（每区 25 格）",
      "hp": "number，初始 6",
      "maxHp": "number，6",
      "defeated": "boolean",
      "damageBySeat": "object，可选，{ \"0\": 2, \"1\": 1 } 记录各座位造成伤害（参与奖励预留）"
    }
  ],

  "lastDice": "number，可选，最近一次骰点 1～6",
  "lastEvent": {
    "type": "string",
    "message": "string",
    "actorSeat": "number，可选"
  },
  "lastEvents": [
    {
      "type": "string",
      "message": "string",
      "actorSeat": "number，可选"
    }
  ],

  "bluffState": "object，可选，吹牛子对局（结构同 MVP）",
  "settlement": {
    "reason": "string，LAST_STANDING | ELIMINATION | TIMEOUT | ACTION_ROUNDS | QUIT | …",
    "finishedAt": "number",
    "players": [
      {
        "userId": "string",
        "openId": "string",
        "seat": "number",
        "rank": "number",
        "isWinner": "boolean",
        "isEliminated": "boolean",
        "hp": "number",
        "kills": "number",
        "gold": "number",
        "diamond": "number，局内钻石快照",
        "resourceValue": "number，gold + diamond * 300",
        "diamondEarned": "number，局外增量，血量淘汰版默认 0",
        "isTie": "boolean，可选"
      }
    ]
  },

  "updatedAt": "number",
  "version": "number，乐观锁，可选"
}
```

### 3.1 棋盘与格子分布（实现参考）

开局由 `BoardGenerator` 生成（Task 2.1），建议分布：

| 格子类型 | 数量 |
|----------|------|
| DIAMOND | 1 |
| GOLD | 18 |
| EVENT | 5 |
| MINIGAME | 5 |
| GOLD_SHOP | 4 |
| LEGENDARY_SHOP | 2 |
| LUCKY | 5 |
| NORMAL | 35 |
| **合计** | **75** |

区域划分：`index` 0～24 / 25～49 / 50～74 各对应 `neutralCreatures[0/1/2]`。

### 3.2 与 MVP `games` 文档差异摘要

| 字段/行为 | MVP | 血量淘汰版 |
|-----------|-----|------------|
| `position` 范围 | 0～57（58 格时代） | 0～74 |
| `players` | 无 hp/装备/道具 | 见 §3 |
| `boardCells.type` | 5 种 | +3 种商店/幸运 |
| 胜负 | 钻石/金币排名、2 圈 | 最后存活；超时综合排名 |
| `settlement` | 钻石优先 | hp/kills/resourceValue |
| 局外钻石写入 | 结算累加 `users.diamond` | **默认不写** |

---

## 4. 索引（沿用 MVP）

| 索引字段 | 类型 | 说明 |
|----------|------|------|
| `roomId` | 普通 | 按房间查对局 |
| `phase` + `startedAt` | 复合 | 超时扫描（scheduler 可选） |

> 控制台配置与 `cloud/database/indexes.md` 一致，本迭代无需新建索引。

---

## 5. 安全规则（沿用 MVP）

> 模板文件：`cloud/database/security-rules/games.json`  
> 客户端 **只读 + watch**；所有写操作经云函数。

```json
{
  "users": {
    "read": "doc._openid == auth.openid",
    "write": false
  },
  "rooms": {
    "read": true,
    "write": false
  },
  "games": {
    "read": true,
    "write": false
  },
  "match_queue": {
    "read": false,
    "write": false
  }
}
```

---

## 6. 云函数写入职责（本迭代）

| 云函数 | 写入集合 | 血量淘汰相关 action |
|--------|----------|---------------------|
| `login` | `users` | 无变更 |
| `room` / `match` | `rooms` | 无变更 |
| `game` | `games` | `rollDice`、`extraRollDice`、`useItem`、`attack`、`buyShopItem`、`endTurn`、`quit`、吹牛 `bluff*` |
| `scheduler` | `rooms`、`match_queue` | 无变更 |

私有数据（如吹牛手牌）仍不进 `games` 文档，规则同 MVP。

---

## 7. 上线检查清单（本迭代增量）

### 文档与协议

- [x] `specs/260529-combat-board-game-rework/ddl-sql.md`（本文档）
- [x] `shared/protocol.ts` 与 §3 字段对齐（Task 1.1）
- [x] `cloudfunctions/common/constants.js`（Task 1.3）

### 实现阶段（后续 Task）

- [ ] `BoardGenerator` 写入 §3 完整 `players` / `neutralCreatures` / `traps`
- [ ] `game` 云函数实现新 action 并 `toGamePatch()` 包含扩展字段
- [ ] 部署前执行 `node scripts/sync-cloud-common.js`
- [ ] 微信开发者工具上传 `game` 等云函数
- [ ] 双端 watch 联调验证 `games` 文档字段

### 控制台（若环境已按 MVP 配置则无需重复）

- [x] 四集合已创建（`initDb`）
- [x] 安全规则已粘贴
- [ ] 联调前确认 `game` 云函数为最新 common 副本

---

## 8. 相关文档

| 文档 | 路径 |
|------|------|
| MVP 数据库配置 | `specs/260526-online-party-board-game/ddl-sql.md` |
| 设计文档 | `specs/260529-combat-board-game-rework/design.md` |
| 开发计划 | `specs/260529-combat-board-game-rework/plan.md` |
| 控制台操作 | `cloud/database/SETUP.md` |
