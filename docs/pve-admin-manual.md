# PVE 管理员手册

适用范围：`命运远征`（PVE）  
不适用范围：PVP 联机棋盘

## 1. 先记住这 4 个事实

1. PVE 线上数据主要只在两张集合里：
   - `users`：玩家资产、排行榜、命运树、图鉴、体力、教程状态
   - `pve_saves`：玩家当前远征存档
2. **排行榜没有单独的表**，它直接来自 `users.pveHighestFloor` 和 `users.pveHighestFloorUpdatedAt`。
3. `destinyShards` 是 PVE 专属资产，但 **`diamond` 是 PVE/PVP 共用资产**。批量清 `diamond` 会影响 PVP。
4. 当前项目里**没有现成的一键管理员后台**。你要改线上数据，主要在微信云开发控制台的数据库里操作；你要改玩法数值，主要改代码后重新发布。

## 2. 你平时去哪里操作

### 2.1 改线上玩家数据

去微信开发者工具或微信云开发控制台：

- `云开发`
- `数据库`
- 重点看这两个集合：
  - `users`
  - `pve_saves`

### 2.2 改 PVE 玩法数值

重点文件：

- [assets/scripts/pve/core/PveConstants.ts](/D:/GameSpace/CoupleGame/assets/scripts/pve/core/PveConstants.ts)
- [cloudfunctions/common/pve/PveReward.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveReward.js)
- [cloudfunctions/common/pve/PveDestinyTree.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveDestinyTree.js)
- [cloudfunctions/common/constants.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/constants.js)

### 2.3 改完云端逻辑后要同步的地方

如果你改了 `cloudfunctions/common/**`，必须再跑一次：

```bash
node scripts/sync-cloud-common.js
```

然后重新部署对应云函数，PVE 主要是：

- `cloudfunctions/pve`

## 3. `users` 集合里哪些字段最重要

| 字段 | 作用 | 是否 PVE 专属 |
|---|---|---|
| `diamond` | 钻石资产 | 否，PVE/PVP 共用 |
| `destinyShards` | 命运碎片 | 是 |
| `pveHighestFloor` | 历史最高层，用于排行榜 | 是 |
| `pveHighestFloorUpdatedAt` | 同层排行时的先到先得时间戳 | 是 |
| `unlockedTreeNodes` | 已解锁命运树节点，如 `A1`、`B2` | 是 |
| `achievements` | PVE 成就列表 | 是 |
| `pveCodex` | PVE 图鉴，含怪物/装备/遗物 | 是 |
| `pveStamina` | 当前体力 | 是 |
| `pveStaminaUpdatedAt` | 体力上次结算时间 | 是 |
| `pveFirstRunStarted` | 是否已经用过首免新远征 | 是 |
| `pvePendingRunSeed` | 新远征已预扣体力但还没真正落首层存档的中间态 | 是 |
| `pveTutorialCompleted` | 是否完成 PVE 教学 | 是 |

## 4. `pve_saves` 集合是干什么的

`pve_saves` 只管“当前正在进行的远征存档”，常见字段：

- `userId`
- `runSeed`
- `status`
- `chapter`
- `floor`
- `player`
- `floorState`
- `version`

它不管排行榜，不管命运碎片，不管图鉴。

所以：

- 想让玩家“断档、不能继续当前局” → 处理 `pve_saves`
- 想清排行榜/资产/命运树 → 处理 `users`

## 5. 最常见的管理员操作

### 5.1 只清“当前正在打的远征存档”

适用场景：

- 版本更新后不想让老存档继续
- 只想让所有人重新开一局
- 不想动排行榜和资产

操作：

1. 进入 `pve_saves`
2. 删除所有文档
3. 建议同时检查 `users.pvePendingRunSeed`
   - 如果有，删掉这个字段更稳

结果：

- 玩家会失去当前远征进度
- `diamond`、`destinyShards`、排行榜、命运树、图鉴都还在

### 5.2 重置“全服 PVE 赛季”，但不动 PVP 钻石

这是最常见、也最推荐的“PVE 清档”方式。

操作分两部分：

1. 清 `pve_saves`
   - 删除全部文档
2. 批量重置 `users` 里的 PVE 字段
   - `destinyShards` 改为 `0`
   - `pveHighestFloor` 改为 `0`
   - `pveHighestFloorUpdatedAt` 删除或重置
   - `unlockedTreeNodes` 改为 `[]`
   - `achievements` 改为 `[]`
   - `pveCodex` 改为 `{ monsters: [], equipment: [], relics: [] }`
   - `pveFirstRunStarted` 改为 `false`
   - `pvePendingRunSeed` 删除
   - `pveTutorialCompleted` 按需要改为 `false`
   - `pveStamina` 按需要改为 `60`

不要动：

- `diamond`

结果：

- PVE 资产、排行榜、命运树、图鉴、教学状态都可以回到新赛季
- PVP 共用钻石不受影响

### 5.3 真正的“全服全部清空”，包括钻石

只在你确认 **PVP 也要一起受影响** 时再做。

在 `5.2` 的基础上，再把：

- `diamond` 改为 `0`

强提醒：

- 这个字段是 PVE/PVP 共用
- 一旦清掉，PVP 玩家资产也会一起没

### 5.4 改单个玩家的 PVE 资产

到 `users` 里找到这个玩家，直接改字段：

- 改命运碎片：`destinyShards`
- 改钻石：`diamond`
- 改体力：`pveStamina`
- 改最高层：`pveHighestFloor`
- 改命运树：`unlockedTreeNodes`
- 改图鉴：`pveCodex`

建议查人优先用：

- `id`
- `_openid`

不要优先靠昵称，因为昵称可能重名。

### 5.5 只清某个玩家当前远征

操作：

1. 去 `pve_saves`
2. 按 `userId` 找到这个人的文档
3. 删除该文档
4. 如有必要，再去 `users` 删除 `pvePendingRunSeed`

结果：

- 只会清这个人的当前局
- 不影响他的排行榜和资产

### 5.6 清排行榜

排行榜不是单独一张表，所以不能去找“leaderboard 集合”。

实际操作是去 `users` 批量处理：

- `pveHighestFloor = 0`
- `pveHighestFloorUpdatedAt` 删除或重置

这样排行榜自然就空了。

## 6. 哪些数值该去代码里改

下面这些不是数据库改一下就能长期生效的，应该改代码后重新发布。

### 6.1 体力与跑局成本

文件：[assets/scripts/pve/core/PveConstants.ts](/D:/GameSpace/CoupleGame/assets/scripts/pve/core/PveConstants.ts)

重点常量：

- `PVE_STAMINA_MAX = 60`
- `PVE_STAMINA_RUN_COST = 20`
- `TREE_RESET_DIAMOND_COST = 20`

说明：

- 这是客户端显示和逻辑来源
- 体力的云端实际结算还会经过云函数逻辑校验

### 6.2 强化、命运树、地图、职业进阶节奏

文件：[assets/scripts/pve/core/PveConstants.ts](/D:/GameSpace/CoupleGame/assets/scripts/pve/core/PveConstants.ts)

重点常量：

- `ANIMA_PER_STRENGTHEN = 100`
- `ANIMA_THRESHOLD_MULTIPLIER = 1.5`
- `CLASS_FRAGMENTS_TO_ADVANCE = 5`
- `MAP_SIZE.NORMAL = 8`
- `MAP_SIZE.HIGH = 9`
- `MAP_SIZE.BOSS = 10`

适合改的内容：

- 强化触发门槛
- 职业碎片需求
- 地图尺寸
- AP、攻击消耗、玩家初始血量等

### 6.3 结算奖励

文件：

- [cloudfunctions/common/constants.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/constants.js)
- [cloudfunctions/common/pve/PveReward.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveReward.js)

重点常量：

- `PVE_SETTLE_REWARD.DIAMOND_PER_FLOOR`
- `PVE_SETTLE_REWARD.DIAMOND_PER_BOSS_FLOOR`
- `PVE_SETTLE_REWARD.SHARD_PER_FLOOR`
- `PVE_SETTLE_REWARD.SHARD_PER_BOSS_FLOOR`

说明：

- 这是云端权威奖励
- 这类数值改完一定要重新部署云函数

### 6.4 命运树节点和花费

文件：

- [cloudfunctions/common/pve/PveDestinyTree.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveDestinyTree.js)
- [assets/scripts/pve/core/PveConstants.ts](/D:/GameSpace/CoupleGame/assets/scripts/pve/core/PveConstants.ts)

你通常会改：

- 节点 `id`
- 节点顺序
- 节点 `cost`

强提醒：

- 命运树是前后端都要对齐的功能
- 只改客户端、不改云端，或者只改云端、不改客户端，都会出问题

## 7. 推荐的发布流程

### 7.1 只改数据库，不改代码

比如：

- 给玩家补碎片
- 清单人存档
- 清排行榜
- 新赛季重置 PVE 数据

这种情况：

- 不需要重新发包
- 不需要重新构建客户端
- 只要改完数据库后自己抽查几个账号即可

建议至少检查：

1. 大厅资源显示是否符合预期
2. 排行榜是否符合预期
3. 继续远征/新远征按钮状态是否正常

### 7.2 改了 PVE 数值或玩法代码

建议顺序：

1. 改代码
2. 如果改了 `cloudfunctions/common/**`，执行：

```bash
node scripts/sync-cloud-common.js
```

3. 跑检查：

```bash
npm run typecheck:game
npm run test:pve
```

4. 如果改了云端逻辑，再补：

```bash
npm run typecheck:cloud
cd cloudfunctions/common && npm test
```

5. 重新部署 `cloudfunctions/pve`
6. 重新构建微信小游戏
7. 构建后执行：

```bash
node scripts/patch-wechatgame-config.js
```

8. 真机验证

## 8. 最容易踩坑的地方

1. **不要把 `diamond` 当成 PVE 专属字段。**
   它是 PVE/PVP 共用资产。

2. **不要以为删了 `pve_saves` 就等于清了排行榜。**
   排行榜看的是 `users.pveHighestFloor`。

3. **不要只改客户端命运树配置。**
   命运树必须前后端一起改。

4. **不要直接改 `cloudfunctions/pve/common/**` 副本。**
   只能改 `cloudfunctions/common/**`，然后跑同步脚本。

5. **改了 PVE 玩法数值，要同步设计文档。**
   主文档是：
   [specs/260608-pve-destiny-expedition/design.md](/D:/GameSpace/CoupleGame/specs/260608-pve-destiny-expedition/design.md)

## 9. 代码入口索引

如果你以后要自己继续查，优先看这些：

- PVE 云函数入口：
  [cloudfunctions/pve/index.js](/D:/GameSpace/CoupleGame/cloudfunctions/pve/index.js)
- PVE 存档逻辑：
  [cloudfunctions/common/pve/PveSave.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveSave.js)
- PVE 元进度/排行榜逻辑：
  [cloudfunctions/common/pve/PveMeta.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/pve/PveMeta.js)
- 数据库读写封装：
  [cloudfunctions/common/db.js](/D:/GameSpace/CoupleGame/cloudfunctions/common/db.js)
- 大厅 PVE 展示：
  [assets/scripts/lobby/PveLobbyController.ts](/D:/GameSpace/CoupleGame/assets/scripts/lobby/PveLobbyController.ts)
- PVE 网络接口：
  [assets/scripts/network/PveService.ts](/D:/GameSpace/CoupleGame/assets/scripts/network/PveService.ts)

## 10. 给你的实际建议

如果你只是想以后自己运营，不想每次都找我，最实用的做法是把操作分成两类：

- `数据库类`
  - 补资产
  - 清单人存档
  - 清全服 PVE 赛季
  - 清排行榜
- `发版类`
  - 改体力
  - 改奖励
  - 改命运树花费
  - 改强化/职业/地图等数值

前者直接去云数据库改，后者改代码后重新发布。

如果你后面发现自己经常要做“全服一键清 PVE”这类动作，下一步最值得补的不是再写文档，而是专门做一个 `admin` 云函数，把这些高频操作变成按钮。
