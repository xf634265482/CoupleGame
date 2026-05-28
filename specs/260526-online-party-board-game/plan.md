# 线上派对棋 开发计划

---

## 1. 实现策略

### 1.1 整体方向

本项目为 **从 0 到 1** 的微信小游戏 + **微信云开发**后端。客户端基于现有 **Cocos Creator 3.8.8** 空工程；后端使用 **云函数 + 云数据库 + 定时触发器**，游戏逻辑在云函数内以权威状态机运行，客户端通过 `wx.cloud.callFunction` 发送指令、通过 **数据库 watch** 接收状态推送。

**分四阶段交付**，每阶段结束均可独立验证：

| 阶段 | 目标 | 覆盖 AC |
|------|------|---------|
| **P0 基建** | 云开发环境、工程骨架、登录与用户表、通信封装 | AC-1, AC-14（框架层） |
| **P1 大厅与房间** | 好友房、匹配、房间生命周期 | AC-2, AC-3, AC-4, AC-5 |
| **P2 棋盘核心** | 72 格、回合制、格子事件、结算 | AC-6～AC-9, AC-11, AC-12, AC-13 |
| **P3 吹牛与 polish** | 吹牛小游戏、退出判负、微信构建 | AC-10, AC-13, AC-14 |

### 1.2 设计文档待确认项（plan 阶段决策）

| ID | 决策 | 选择 | 理由 |
|----|------|------|------|
| T1 | 随机匹配等待 | 单队列，**30 秒**后按当前人数（≥2）自动开局，上限 4 人 | 平衡等待与开局率；**用户已确认** |
| T2 | 局内金币负数 | **允许** | 简化厄运与随机格计算 |
| T3 | 完全平局 | **显示平局**，不追加第三排序 | 首版 UI 简单 |
| T4 | 吹牛后回合接续 | **由下一位玩家**继续棋盘回合 | 触发者本回合已在落点完成；**用户已确认** |
| T5 | 吹牛中断线/退出 | 等同棋盘退出：**判负 + 整局立即结算** | 与 D24 一致 |
| T6 | 后端选型 | **微信云开发** | **用户审核确认**；免自建服务器与合法域名 |
| T7 | 对局历史 | **首版不做** | 用户确认；仅持久化用户局外钻石 |

---

## 2. 代码探索结论

### 2.1 相关模块

| 模块/文件 | 位置 | 当前职责 | 本次改动 |
|----------|------|---------|---------|
| `package.json` | 项目根 | Cocos 3.8.8 工程标识 | 不变 |
| `tsconfig.json` | 项目根 | 继承 Cocos tsconfig | 保持 |
| `assets/couple.scene` | `assets/` | 默认 2D 空场景 | 迁移至 `assets/scenes/` |
| `settings/v2/packages/engine.json` | `settings/` | 2D 模块 | **无需启用 websocket**；联机走云数据库 watch |
| `settings/v2/packages/cocos-service.json` | `settings/` | 云服务占位 | 配置云开发 envId |
| `specs/.../design.md` | `specs/` | 需求与 AC | 参照实现 |
| **（新建）** `assets/scripts/**` | — | 不存在 | 客户端全部业务代码 |
| **（新建）** `cloudfunctions/**` | — | 不存在 | 云函数 + 共享游戏逻辑 |

**结论**：应用层 **100% 绿field**；无现成 Service、网络层、UI 可复用。

### 2.2 现有代码模式

- 项目尚无自定义 `@ccclass` 组件，**无既有编码模式可遵循**。
- 本次建立约定：
  - 组件 + 预制体驱动 UI
  - **客户端仅渲染云函数/数据库快照**，不本地计算骰子/格子结果
  - 跨场景状态通过 `GameSession` 单例 + `gameId` / `roomId`
  - 平台相关代码隔离在 `assets/scripts/platform/wechat/`

### 2.3 可复用组件

| 类型 | 说明 |
|------|------|
| Cocos 内置 | `Canvas`、`Widget`、`Tween`、`Label`、`Sprite` |
| 微信云开发 SDK | `wx.cloud.init`、`wx.cloud.callFunction`、云数据库 `watch` |
| 业务复用 | **无**；需新建 `CloudService`、`GameStateMirror`、`SceneLoader` |

---

## 3. 依赖分析

### 3.1 模块间依赖

```
platform/wechat (wx.cloud.init, wx.login)
       ↓
network/CloudService (callFunction + db.watch)
       ↓
lobby (RoomController, MatchController)
       ↓
game/board (BoardView ← GameStateMirror)
       ↓
game/minigame/bluff (BluffView ← minigame_state)
       ↓
settlement (SettlementView)

cloudfunctions: login → room → match → game → scheduler
                      ↓
              云数据库 collections
```

### 3.2 执行顺序约束

| 顺序 | 模块 | 可并行 |
|------|------|--------|
| 1 | 微信云开发环境开通 + envId 配置 | — |
| 2 | 云数据库 collections + 安全规则 | 与 3 并行 |
| 3 | 客户端 `platform/wechat` + `network/CloudService` | 与 2 并行 |
| 4 | 云函数 `login`、`room`、`match` | 依赖 1、2 |
| 5 | 云函数 `game` + 共享 `GameEngine`/`BluffEngine` | 依赖 4 |
| 6 | 定时触发器 `scheduler`（5min 解散 + 30s 匹配） | 依赖 4 |
| 7 | 客户端棋盘 / 吹牛 / 结算场景 | 依赖 3、5 |
| 8 | 微信小游戏构建 + 云开发关联 | 依赖 1 |

### 3.3 外部依赖

| 依赖 | 用途 |
|------|------|
| 微信小游戏 API | `wx.login`、分享、云开发 SDK |
| 微信云开发 | 云函数、云数据库、定时触发器 |
| 微信公众平台 | AppID、开通云开发 |
| Cocos Creator 3.8.8 | 客户端引擎 |

**数据库约定**（云数据库）：
- 业务主键 `id` 由云函数内雪花算法生成，写入文档字段；**不使用自增**
- 用户文档含 `_openid`（云开发自动注入）及审计字段
- 无 `unit_id`（openId 全局用户）
- **首版无对局历史 collection**，对局结束删除或保留 `games` 文档仅作调试（不建 `game_history`）

---

## 4. 接口契约

> 微信云开发不使用自建 REST/WebSocket。对外「apiKey」映射为 **云函数名 + action 字段**，实时推送通过 **云数据库 watch** 实现。

### 4.1 云函数契约

调用方式：`wx.cloud.callFunction({ name, data })`  
云函数内通过 `cloud.getWXContext().OPENID` 识别用户。

| apiKey | 云函数 | data 参数 | 返回 | 说明 |
|--------|--------|----------|------|------|
| `auth.login` | `login` | `{ nickname?, avatarUrl? }` | `{ user: UserVO }` | 首次自动建用户 → AC-1 |
| `user.profile` | `login` | `{ action: 'profile' }` | `{ user: UserVO }` | 局外钻石 → AC-1, AC-12 |
| `room.create` | `room` | `{ action: 'create', maxPlayers: 2\|3\|4 }` | `{ roomId, roomCode }` | → AC-2 |
| `room.join` | `room` | `{ action: 'join', roomCode }` | `{ room: RoomVO }` | → AC-2 |
| `room.start` | `room` | `{ action: 'start', roomId }` | `{ gameId }` | 房主；≥2 人 → AC-3 |
| `match.enqueue` | `match` | `{ action: 'enqueue', maxPlayers? }` | `{ ticketId }` | → AC-5 |
| `match.cancel` | `match` | `{ action: 'cancel', ticketId }` | `{ ok: true }` | 取消匹配 |
| `game.roll_dice` | `game` | `{ action: 'rollDice', gameId }` | `{ snapshot, private?: BluffMyDice }` | → AC-7, AC-14 |
| `game.bluff_shake` | `game` | `{ action: 'bluffShake', gameId }` | `{ ok }` | 吹牛摇完 |
| `game.bluff_bid` | `game` | `{ action: 'bluffBid', gameId, count, face }` | `{ ok }` | 叫点 |
| `game.bluff_open` | `game` | `{ action: 'bluffOpen', gameId }` | `{ ok }` | 开 |
| `game.quit` | `game` | `{ action: 'quit', gameId }` | `{ ok }` | → AC-13 |

**说明**：所有 mutating 操作完成后，云函数更新 `games` / `rooms` 集合文档；客户端通过 **watch** 收到推送，无需云函数返回完整 snapshot（除私有骰子等仅本人可见数据）。

**UserVO**

```typescript
interface UserVO {
  id: string;
  openId: string;
  nickname: string;
  avatarUrl: string;
  diamond: number;
}
```

**RoomVO**

```typescript
interface RoomVO {
  roomId: string;
  roomCode: string;
  hostId: string;
  maxPlayers: number;
  players: PlayerSlotVO[];
  status: 'WAITING' | 'PLAYING' | 'DISBANDED';
  createdAt: number;
  expireAt: number; // 5 分钟解散 deadline
}
```

### 4.2 实时推送（云数据库 watch）

客户端在进房/开局后订阅：

```typescript
// 房间 waiting 阶段
db.collection('rooms').doc(roomId).watch({ onChange, onError });

// 对局进行中
db.collection('games').doc(gameId).watch({ onChange, onError });
```

**games 文档字段（即 GameSnapshot + 元数据）**

```typescript
interface GameDoc {
  _id: string;          // = gameId
  roomId: string;
  phase: 'BOARD' | 'MINIGAME_BLUFF' | 'SETTLED';
  players: Array<{
    userId: string;
    openId: string;
    seat: number;
    position: number;
    lap: number;
    gold: number;
    diamond: number;
    isOnline: boolean;
    isDefeated: boolean;
  }>;
  boardCells: Array<{
    index: number;
    type: 'NORMAL' | 'GOLD' | 'DIAMOND' | 'EVENT' | 'MINIGAME';
    goldVariant?: string;
  }>;
  diamondCellIndex: number;
  currentSeat: number;
  doomRemainingTurns: number;
  startedAt: number;
  lastDice?: number;
  lastEvent?: { type: string; message: string };
  bluffState?: BluffState;       // phase=MINIGAME 时有值
  settlement?: SettlementVO;    // phase=SETTLED 时有值
  updatedAt: number;
}
```

**私有数据（不写入 games 文档）**

- 吹牛「自己的 5 颗骰」：云函数 `rollDice`/`bluffShake` 响应体 `private.myDice` 仅返回给调用者 OPENID
- 或使用 `games/{id}/private/{openId}` 子 collection（安全规则仅本人可读）

**watch 等效原 WebSocket 事件**

| 文档变化 | 客户端等效事件 |
|----------|----------------|
| `rooms` 更新 | `room_update` |
| `rooms.status → DISBANDED` | `room_disbanded` → AC-4 |
| `rooms` 匹配成功写入 gameId | `match_found` → AC-5 |
| 新建 `games` 文档 | `game_start` → AC-3, AC-6 |
| `games` 更新且 phase=BOARD | `game_update` → AC-7～AC-9 |
| `games.phase → MINIGAME_BLUFF` | `minigame_start` → AC-10 |
| `games.bluffState` 变化 | `minigame_update` |
| `games.phase` 从 MINIGAME → BOARD | `minigame_end` |
| `games.settlement` 写入 | `game_over` → AC-11, AC-12, AC-13 |

### 4.3 云数据库 Collections

#### `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 云开发文档 ID（可用业务 id） |
| `id` | string | 雪花 ID |
| `_openid` | string | 云开发自动 |
| `nickname` | string | |
| `avatarUrl` | string | |
| `diamond` | number | 局外钻石 |
| `createdBy/createdDate/updatedBy/updatedDate` | | 审计 |

索引：`_openid`（唯一）

#### `rooms`

| 字段 | 说明 |
|------|------|
| `roomCode` | 6 位数字，索引 |
| `hostId` | 房主 userId |
| `maxPlayers` | 2/3/4 |
| `players[]` | 成员列表 |
| `status` | WAITING / PLAYING / DISBANDED |
| `gameId` | 开局后填入 |
| `createdAt`, `expireAt` | 5 分钟解散 |

#### `games`

运行时对局状态，结构见 §4.2。`phase=SETTLED` 后可选删除或保留 24h 调试，**不写 history 表**。

#### `match_queue`

| 字段 | 说明 |
|------|------|
| `ticketId` | 雪花 ID |
| `openId` | 玩家 |
| `maxPlayers` | 偏好人数 |
| `enqueueAt` | 入队时间 |

### 4.4 定时触发器 `scheduler`

| 任务 | 频率 | 逻辑 |
|------|------|------|
| `disbandExpiredRooms` | 每 1 分钟 | `expireAt < now && status=WAITING` → DISBANDED → AC-4 |
| `processMatchQueue` | 每 10 秒 | 入队 ≥30s 且 ≥2 人 → 建 room + game → AC-5 |

---

## 5. 实现方案

### 5.1 云开发后端

#### 5.1.1 工程脚手架 → AC-14

```
cloudfunctions/
├── login/              # 用户登录/ profile
├── room/               # create/join/start
├── match/              # enqueue/cancel
├── game/               # rollDice/bluff*/quit
├── scheduler/          # 定时：解散 + 匹配
└── common/             # GameEngine, BoardGenerator, CellResolver, BluffEngine, id.ts
    ├── GameEngine.ts
    ├── BoardGenerator.ts
    ├── CellResolver.ts
    ├── BluffEngine.ts
    └── db.ts
```

- 微信开发者工具导入云开发目录，关联 envId
- `common/` 通过 **云函数层** 或每个 function `require('../common/...')` 共享（部署时注意 copy 脚本）
- 单元测试：`common/` 纯逻辑可在 Node 环境 Jest 测试

#### 5.1.2 登录与用户 → AC-1, AC-12

- `login`：读取 OPENID；无则雪花 id 创建 `users` 文档
- 结算时 `game` 云函数原子更新 `users.diamond`（`db.command.inc`）

#### 5.1.3 好友房 → AC-2, AC-3, AC-4

- `room.create`：6 位 roomCode；写 `rooms`；`expireAt = now + 5min`
- `room.join`：事务校验未满员
- `room.start`：校验 host、≥2 人；`BoardGenerator.init()`；写 `games`；`rooms.status=PLAYING`
- `scheduler.disbandExpiredRooms` 兜底 AC-4

#### 5.1.4 随机匹配 → AC-5

- `match.enqueue` 写 `match_queue`
- `scheduler.processMatchQueue`：≥30s 窗口内 ≥2 人组局 → 建 room（自动 start）→ 客户端 watch 到 `gameId`

#### 5.1.5 棋盘 `GameEngine` → AC-6, AC-7, AC-11, AC-14

**BoardGenerator** → AC-6：72 格随机分配 1 钻石 / 20 金币 / 5 事件 / 5 小游戏 / 41 普通。

**回合 rollDice** → AC-7, AC-14：

1. 云函数内校验 `currentSeat` 对应 OPENID
2. 掷骰 `random(1..6)`（权威，非客户端）
3. 更新 position、lap；触发落点事件；切换 `currentSeat`
4. 更新 `games` 文档触发全体 watch

**CellResolver** → AC-8：五种金币格；50 整数倍随机；厄运 2 回合翻转（混合区间固定 -200）。

**钻石重生** → AC-9：+5 钻石；踩后变普通格；在普通格中随机重生，全图始终 1 个钻石格。

**结束条件** → AC-11：`lap >= 2` 或 `startedAt + 18min`。

#### 5.1.6 吹牛 `BluffEngine` → AC-10

- 状态写入 `games.bluffState`
- 私有骰子经 callFunction 响应返回
- 结束后 `currentSeat = next(triggerSeat)`，phase 回 BOARD
- 超时 30s：scheduler 或 game 内 timestamp 校验，自动开

#### 5.1.7 退出与结算 → AC-11, AC-12, AC-13

- `game.quit`：标记 defeated，`forceSettle`
- 客户端 `wx.onHide` / 主动退出按钮：调用 `game.quit`（掉线视同退出判负，与 design §4 一致）→ AC-13
- 写 `settlement` + `users.diamond` 原子递增；**不写入 history**（T7）→ AC-12

#### 5.1.8 数据库安全规则（要点）

- `users`：仅本人可读写自己的 diamond 以外字段需经云函数
- `rooms` / `games`：客户端 **只读**；所有写操作必须经云函数
- 推荐：**客户端仅 watch，禁止 client-side update**

### 5.2 前端实现（Cocos Creator 3.8.8）

#### 5.2.1 工程骨架

- 目录：`assets/scripts/{core,network,platform,lobby,game,settlement}`
- `GameApp.ts` 启动时 `wx.cloud.init({ env: ENV_ID })`

#### 5.2.2 云平台层 → AC-1

- `WxCloudInit.ts`、`WxAuth.ts`（login 云函数）
- `WxShare.ts` 分享 roomCode

#### 5.2.3 网络层 → AC-14

- `CloudService.ts`：封装 `callFunction`
- `GameWatcher.ts`：封装 `rooms`/`games` 的 watch，转为本地 EventBus 事件
- **不使用** 自建 WebSocket / 合法域名

#### 5.2.4 大厅与房间场景 → AC-2, AC-3, AC-4, AC-5

- `lobby.scene` + `LobbyController`：创建/加入/匹配 UI
- `RoomController`：`rooms` watch → 成员列表、房主开始、解散提示（AC-4）
- 分享 roomCode（`WxShare`）→ AC-2

#### 5.2.5 棋盘场景 → AC-6, AC-7, AC-8, AC-9, AC-11

- `board.scene`：`BoardView` 72 格、`PawnView` 移动动画、`HudController` 资源与倒计时
- 掷骰按钮 → `game.roll_dice`；仅渲染 watch 推送的 `GameSnapshot` → AC-14

#### 5.2.6 吹牛场景 → AC-10

- `minigame_bluff.scene`：`BluffController` 摇骰/叫点/开
- 私有骰子仅来自 callFunction 响应；`bluffState` 来自 watch

#### 5.2.7 结算场景 → AC-11, AC-12

- `settlement.scene`：排名、局内钻石/金币、局外 diamond 变化展示
- 监听 `games.settlement` / `game_over` 事件

#### 5.2.8 微信构建

- Creator → WeChat Mini Game
- 开发者工具开通云开发、上传云函数
- 真机联调使用云开发默认链路，**无需备案域名**

### 5.3 其他

- **`shared/protocol.ts`**（可选）：客户端与云函数共享 TypeScript 类型定义
- **对局历史**：首版 **不做**（用户确认）

---

## 6. 风险与注意事项

| 风险 | 影响 | 缓解 |
|------|------|------|
| 云函数冷启动 | 首操作延迟 | 合并云函数减少数量；关键路径预热 |
| 数据库 watch 频率/费用 | 成本 | 合并字段更新；避免高频无意义 write |
| 云函数 3s/60s 超时 | 复杂逻辑受限 | 棋盘/吹牛单步操作足够轻量 |
| 并发写 games | 数据竞争 | 云函数内事务或版本号乐观锁 |
| 吹牛私有骰子泄露 | 作弊 | 私有数据不进 games 文档；安全规则隔离 |
| 定时匹配精度 | 最多 10s 误差 | scheduler 10s 轮询可接受 |
| 无断线重连 | 弱网体验差 | 首版已知限制 |
| 云函数 common 共享 | 部署遗漏 | 部署脚本统一 copy common |

---

## 7. 验证策略

| 模块 | 验证方式 |
|------|----------|
| `common/GameEngine` 等 | 本地 Jest 单测 |
| 云函数 | 开发者工具「云函数本地调试」 |
| watch 联调 | 两个开发者工具实例 watch 同一 gameId |
| AC 清单 | design.md AC-1～AC-14 手动走查 |
| 构建 | Creator 构建 + 上传云函数 |

---

## 8. 建议仓库目录（完成后）

```
CoupleGame/
├── assets/
│   ├── scenes/
│   ├── scripts/
│   ├── prefabs/
│   └── resources/
├── cloudfunctions/
│   ├── login/
│   ├── room/
│   ├── match/
│   ├── game/
│   ├── scheduler/
│   └── common/
├── shared/              # 可选：类型定义
├── specs/260526-online-party-board-game/
│   ├── design.md
│   ├── decisions.md
│   ├── plan.md
│   └── plan-decisions.md
├── project.config.json  # 微信开发者工具（云开发）
├── package.json
└── README.md
```
