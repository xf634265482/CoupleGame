# 线上派对棋 - 云数据库上线配置

> 本项目使用 **微信云开发云数据库**（文档型 NoSQL），无 MySQL DDL。  
> 本文档为 **上线时一次性配置清单**：集合结构、索引、安全规则。  
> 生成时间：2026-05-26

---

## 1. 集合一览

| 集合 | 用途 | 持久化 |
|------|------|--------|
| `users` | 用户档案、局外钻石 | 永久 |
| `rooms` | 好友房/匹配房等待态 | 临时（解散后可选删除） |
| `games` | 对局运行时状态 | 临时（结算后可选保留 24h 调试） |
| `match_queue` | 随机匹配队列 | 临时 |

> **首版无** `game_history` 对局历史集合（T7）。

---

## 2. 集合字段定义（最终版）

### 2.1 `users`

```json
{
  "_id": "string，文档ID，建议等于业务 id",
  "id": "string，雪花ID，业务主键",
  "_openid": "string，云开发自动注入",
  "nickname": "string",
  "avatarUrl": "string",
  "diamond": "number，默认 0，局外钻石",
  "createdBy": "string | null",
  "createdDate": "Date",
  "updatedBy": "string | null",
  "updatedDate": "Date"
}
```

**索引（控制台创建）**

| 索引字段 | 类型 | 说明 |
|----------|------|------|
| `_openid` | 唯一 | 按 openId 查用户 |
| `id` | 普通 | 业务 ID 查询 |

**写入约束**：仅 `login` / `game` 云函数写入；客户端禁止写。

---

### 2.2 `rooms`

```json
{
  "_id": "string，roomId",
  "roomCode": "string，6位数字",
  "hostId": "string，房主 users.id",
  "maxPlayers": "number，2|3|4",
  "players": [
    {
      "userId": "string",
      "openId": "string",
      "nickname": "string",
      "avatarUrl": "string",
      "seat": "number"
    }
  ],
  "status": "string，WAITING|PLAYING|DISBANDED",
  "gameId": "string | null",
  "createdAt": "number，毫秒时间戳",
  "expireAt": "number，createdAt + 5min"
}
```

**索引**

| 索引字段 | 类型 | 说明 |
|----------|------|------|
| `roomCode` | 唯一 | 加入房间 |
| `status` + `expireAt` | 复合 | scheduler 解散扫描 |
| `gameId` | 普通 | 可选 |

**写入约束**：仅 `room` / `match` / `scheduler` 云函数写入。

---

### 2.3 `games`

```json
{
  "_id": "string，gameId",
  "roomId": "string",
  "phase": "string，BOARD|MINIGAME_BLUFF|SETTLED",
  "players": [
    {
      "userId": "string",
      "openId": "string",
      "seat": "number",
      "position": "number，0-71",
      "lap": "number",
      "gold": "number，允许负数",
      "diamond": "number",
      "isOnline": "boolean",
      "isDefeated": "boolean"
    }
  ],
  "boardCells": [
    {
      "index": "number",
      "type": "string，NORMAL|GOLD|DIAMOND|EVENT|MINIGAME",
      "goldVariant": "string，可选，FIXED_100|FIXED_200|FIXED_300|RANDOM_0_500|RANDOM_NEG200_400"
    }
  ],
  "diamondCellIndex": "number",
  "currentSeat": "number",
  "doomRemainingTurns": "number",
  "startedAt": "number，毫秒",
  "lastDice": "number，可选",
  "lastEvent": { "type": "string", "message": "string" },
  "bluffState": "object，可选，吹牛状态",
  "settlement": "object，可选，结算结果",
  "updatedAt": "number",
  "version": "number，乐观锁，可选"
}
```

**索引**

| 索引字段 | 类型 | 说明 |
|----------|------|------|
| `roomId` | 普通 | 按房间查对局 |
| `phase` + `startedAt` | 复合 | 18 分钟超时扫描（scheduler 可选） |

**写入约束**：仅 `game` / `room` / `scheduler` 云函数写入；客户端 **只读 + watch**。

---

### 2.4 `match_queue`

```json
{
  "_id": "string，ticketId",
  "openId": "string",
  "userId": "string",
  "maxPlayers": "number，2|3|4，默认4",
  "enqueueAt": "number，毫秒时间戳"
}
```

**索引**

| 索引字段 | 类型 | 说明 |
|----------|------|------|
| `enqueueAt` | 普通 | scheduler 按时间窗口组局 |
| `openId` | 普通 | 防重复入队、取消匹配 |

**写入约束**：仅 `match` / `scheduler` 云函数写入。

---

## 3. 安全规则（上线最终版）

> 在云开发控制台 → 数据库 → 权限设置中配置。推荐 **自定义安全规则**：

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

说明：所有写操作经云函数（云函数有管理员权限）；客户端仅 `watch` 读取 `rooms`/`games`。

---

## 4. 云函数定时触发器（上线配置）

| 云函数 | 触发器 | Cron | 说明 |
|--------|--------|------|------|
| `scheduler` | `disbandExpiredRooms` | `0 * * * * * *`（每 1 分钟） | 5 分钟未开房解散 |
| `scheduler` | `processMatchQueue` | `*/10 * * * * * *`（每 10 秒） | 30 秒匹配组局 |

> Cron 表达式以微信云开发控制台实际格式为准；若仅支持分钟级，匹配轮询可改为 1 分钟并在代码内判断 30 秒窗口。

---

## 5. 上线检查清单

### 仓库 / 云函数（AI 已准备）

- [x] `ddl-sql.md` 字段与索引文档
- [x] `cloud/database/security-rules/*.json` 安全规则模板
- [x] `cloud/database/indexes.md` 索引清单
- [x] `cloud/database/SETUP.md` 控制台操作指南
- [x] `cloudfunctions/initDb` 一键创建集合云函数
- [x] `shared/protocol.ts` 与集合字段对齐

### 需在微信云开发控制台完成（Task 1.3）

- [x] 手动创建四个集合 + initDb 验证 `"ok": true`
- [x] 索引已创建（至少 `rooms.roomCode` 唯一索引）
- [x] 安全规则已粘贴（四集合客户端不可写）

### 后续阶段

- [ ] 云函数 login / room / match / game / scheduler 已部署
- [ ] 定时触发器已绑定 scheduler
- [x] 小游戏已关联云开发 envId（`cloud1-d9gsn7mh609335539`）
