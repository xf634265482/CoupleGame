# PVE「命运远征」数据库字段说明

> 微信云数据库为文档型，无 MySQL DDL。本文件记录 PVE 模块的 collection 与字段，供上线与联调对照。
> 安全规则：客户端对 `pve_saves` 与 `users` PVE 字段**只读**；所有写操作经 `pve` 云函数。

## 1. 新增 collection：`pve_saves`

每个用户一条活跃远征存档（`userId` 唯一）。每完成一层由 `pve` 云函数覆盖写入。

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 文档 id |
| `userId` | string | 用户 id（建唯一索引） |
| `openId` | string | 微信 openId |
| `runSeed` | number | 整次远征种子（派生每层地图种子，支持云端复算 → AC-13） |
| `status` | string | `ACTIVE` / `DEAD` / `COMPLETED` |
| `chapter` | number | 当前章节（1-based） |
| `floor` | number | 当前层（1-based，续玩从 floor+1 开始 → AC-11） |
| `player` | object | 跨层持久态：见 §1.1 |
| `floorState` | object | 当前层快照（可选，用于层内断点续玩）：见 §1.2 |
| `version` | number | 乐观锁版本（防并发覆盖） |
| `updatedAt` | number | 服务端写入时间戳 |

### 1.1 `player`（RunPlayer，对应 `assets/scripts/pve/core/PveTypes.ts`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `hp` / `maxHp` | number | 当前/上限生命 |
| `gold` | number | 局内金币（死亡清空） |
| `anima` | number | 局内灵气（死亡清空） |
| `animaProgress` | number | 灵气强化进度（满 100 触发 → AC-7） |
| `classId` | string | `ADVENTURER`/`BERSERKER`/`ARCHER`/`ROGUE` |
| `classTraits` | string[] | 已选职业词条 id |
| `equipment` | object | 5 槽位装备（M2 展开） |
| `classFragments` | object | 各职业碎片数（→ AC-15） |

### 1.2 `floorState`（FloorState）

| 字段 | 类型 | 说明 |
|------|------|------|
| `floor` / `size` / `seed` / `rngState` | number | 层号 / 边长 / 地图种子 / RNG 续算状态 |
| `player` | `{x,y}` | 玩家网格坐标 |
| `ap` / `maxAp` / `dice` / `turn` | number | 行动点 / 上限 / 骰子 / 回合数 |
| `hasKey` | boolean | 是否已拾取钥匙（→ AC-8/AC-9） |
| `revealed` | boolean[][] | 迷雾揭示标记（→ AC-1） |
| `monsters` | array | 怪物状态 |
| `entities` | array | 固定实体（宝箱/钥匙/出口门/传送门…） |
| `status` | string | `EXPLORING`/`CLEARED`/`DEAD` |

## 2. `users` 扩展字段（PVE 元进度）

PVE 与 PVP **共享** `users.diamond`（账户钻石）。新增 PVE 专属字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `diamond` | number | 账户钻石（已存在，PVE/PVP 共享；PVE 死亡保留 → design §2.1） |
| `destinyShards` | number | 命运碎片（PVE 专属，死亡保留 → AC-12） |
| `pveAchievements` | string[] | 成就 id 列表（死亡保留） |
| `pveCodex` | object | 图鉴解锁记录（死亡保留） |

## 3. 奖励入账与防作弊（→ AC-14）

- 客户端远征结束/每层完成上报结果，`pve` 云函数 `settleRun`/`saveFloor` 对元货币奖励做**边界校验**后才写 `users.diamond` / `users.destinyShards`：
  - 单层钻石/碎片上限（按层数与击杀数推导上界）。
  - 层数连续性（不可跳层）。
  - 可选：用 `runSeed` 复算关键随机，比对客户端上报。
- 校验不通过则拒绝入账并记录异常，不抛给玩家可利用的细节。

## 4. 索引

| collection | 索引 | 用途 |
|------------|------|------|
| `pve_saves` | `userId`（唯一） | 按用户读取活跃存档 |
| `users` | 沿用现有 `openId` | 元进度读写 |
