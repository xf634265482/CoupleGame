# 线上派对棋 - 任务清单

> 每个任务设计为可独立执行，可交给单独的 Claude 进程处理。  
> 本任务清单由 task-generate skill 根据 plan.md 自动生成。  
> 计划参考：`specs/260526-online-party-board-game/plan.md`  
> 验收参考：`specs/260526-online-party-board-game/design.md` §6

---

## 阶段一：P0 基建（云开发 + 通信骨架）

> 目标：云开发环境就绪、共享类型、login 云函数、客户端 CloudService/watch 封装。  
> 覆盖 AC：AC-1（框架）、AC-14（框架）  
> 计划参考：plan.md §1.1 P0、§4、§5.1.1～5.1.2、§5.2.1～5.2.3

### Task 1.1 - ✅ 云开发环境与项目配置

- **目标**：在 **Cocos 工程为主** 的前提下，补齐微信云开发与 `cloudfunctions/` 配置
- **所在项目**：`CoupleGame/`
- **依赖**：无
- **产出**：`project.config.json`、`cloudfunctions/` 空目录结构、README.md（envId 说明）
- **执行指令**：

```
【开发分工说明】
- 游戏客户端：始终在 Cocos Creator 3.8.8（现有 CoupleGame 工程）中开发
- 微信开发者工具：不用于「创建游戏」，仅用于构建预览、云开发、云函数上传（辅助工具）

1. 微信公众平台注册小游戏，获取 AppID；在云开发控制台开通环境，记录 envId
2. Cocos Creator → 构建发布 → 微信小游戏，填入 AppID（首构后可得 build/wechatgame/）
3. 在仓库根目录创建 project.config.json（appid、cloudfunctionRoot: "cloudfunctions/"）
   - 可将 build/wechatgame/ 作为预览目录，或在开发者工具中打开构建产物目录
4. 创建 cloudfunctions/ 子目录：login、room、match、game、scheduler、common
5. 微信开发者工具 → 云开发 → 关联同一 AppID/envId → 上传云函数（非在 DevTools 里重写游戏）
6. 新建 README.md：Cocos 构建步骤 + envId + 云函数上传命令
参考：plan.md §3.2 顺序1、§5.1.1、§5.2.8、§8
验证：Cocos 能成功构建 wechatgame；开发者工具能打开构建产物并看到云开发面板
```

**Task 1.1 进度（2026-05-26）**

| 项 | 状态 | 说明 |
|----|------|------|
| `project.config.json` | ✅ AI 已创建 | 需你把 `appid` 改成真实 AppID |
| `cloudfunctions/` 目录与 stub | ✅ AI 已创建 | 真实逻辑在 Task 1.5+ |
| `README.md` | ✅ AI 已创建 | 含 Cocos / 微信分工说明 |
| `config/wechat.local.json.example` | ✅ AI 已创建 | 复制为 `wechat.local.json` 并填写 |
| 微信公众平台注册 AppID | ✅ 已配置 | `wxfb28c2b166baf0e2` |
| 开通云开发 envId | ✅ 已配置 | `cloud1-d9gsn7mh609335539` → `config/wechat.local.json` |
| Cocos 首次构建 wechatgame | ⏳ **需你操作** | 构建发布 → 微信小游戏（首次预览前） |
| 云函数首次上传 | ⏳ 可选 | stub 可先传，Task 1.5 后再传正式版 |

---

### Task 1.2 - ✅ 共享协议类型定义

- **目标**：定义 REST/云函数契约的 TypeScript 类型，供客户端与云函数共用
- **所在项目**：`CoupleGame/shared/`
- **依赖**：无
- **产出**：`shared/protocol.ts`
- **执行指令**：

```
1. 新建 shared/protocol.ts
2. 从 plan.md §4.1～§4.2 提取并导出：
   UserVO、RoomVO、PlayerSlotVO、GameDoc、BluffState、SettlementVO
   云函数 action 枚举、CellType、GoldVariant、GamePhase
3. 注释中标注对应 AC 编号（如 UserVO → AC-1）
参考：plan.md §4、plan-decisions.md PD13（雪花ID）
验证：TypeScript 无语法错误（tsc --noEmit shared/protocol.ts 或 IDE 检查）
```

---

### Task 1.3 - ✅ 云数据库集合与上线配置

- **目标**：确定四集合最终 schema、索引、安全规则，并在控制台完成初始化
- **所在项目**：`CoupleGame/cloud/`、`CoupleGame/cloudfunctions/initDb/`
- **依赖**：Task 1.2
- **产出**：`ddl-sql.md`、`cloud/database/*`、`cloudfunctions/initDb`
- **执行指令**：见 **`cloud/database/SETUP.md`**（按步骤在微信开发者工具操作）

**Task 1.3 进度**

| 项 | 状态 | 说明 |
|----|------|------|
| 字段文档 ddl-sql.md | ✅ | 已对齐 protocol.ts |
| 安全规则 JSON 模板 | ✅ | `cloud/database/security-rules/` |
| 索引清单 | ✅ | `cloud/database/indexes.md` |
| initDb 云函数 | ✅ | 运行一次即可创建四集合 |
| 控制台运行 initDb | ✅ 已通过 | 四集合 ok，0 条记录 |
| 创建索引 | ⏳ 联调前建议做 | 至少 `rooms.roomCode` 唯一，见 indexes.md |
| 粘贴安全规则 | ⏳ 联调前建议做 | SETUP.md §3 |

---

### Task 1.4 - ✅ 云函数 common 模块

- **目标**：雪花 ID、数据库访问封装、常量
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 1.2
- **产出**：`common/id.js`、`common/db.js`、`common/constants.js`
- **执行指令**：

```
1. 实现雪花 ID 生成（禁止 DB 自增，见 PD13）
2. 封装 cloud.database() 常用操作：getUserByOpenId、updateGameDoc
3. 常量：BOARD_SIZE=72、MATCH_WAIT_MS=30000、ROOM_EXPIRE_MS=300000、GAME_DURATION_MS=1080000
4. 各云函数 package.json 配置对 common 的引用（copy 或 symlink 脚本）
参考：plan.md §5.1.1、§4.3
验证：Node 环境下 require common 模块无报错
```

---

### Task 1.5 - ✅ login 云函数

- **目标**：实现用户登录/建档与 profile 查询 → AC-1
- **所在项目**：`CoupleGame/cloudfunctions/login/`
- **依赖**：Task 1.3、Task 1.4
- **产出**：`cloudfunctions/login/index.js`
- **执行指令**：

```
1. 读取 cloud.getWXContext().OPENID
2. action 默认：查找 users，不存在则雪花 id 创建（nickname/avatarUrl 可选入参）
3. action='profile'：返回 UserVO
4. 返回 { user: UserVO }
参考：plan.md §4.1 auth.login、§5.1.2
决策：PD1 云开发、D22 openId 全局用户
验证：开发者工具云函数测试返回 user；users 集合有新文档
```

---

### Task 1.6 - ✅ 客户端工程骨架

- **目标**：建立 Cocos 脚本目录、启动流程、场景管理
- **所在项目**：`CoupleGame/assets/`
- **依赖**：Task 1.1
- **产出**：
  - `assets/scripts/core/GameApp.ts`
  - `assets/scripts/core/Constants.ts`
  - `assets/scripts/core/SceneLoader.ts`
  - `assets/scripts/core/GameSession.ts`
  - `assets/scenes/bootstrap.scene`（或改造 couple.scene）
- **执行指令**：

```
1. 创建 assets/scripts/{core,network,platform,lobby,game,settlement} 目录
2. GameApp：onLoad 初始化，预留 wx.cloud.init 调用点
3. Constants：ENV_ID 占位、棋盘/奖励常量（plan §5.2.1）
4. SceneLoader：loadScene 封装 lobby/board/minigame_bluff/settlement
5. GameSession：单例存 roomId、gameId、user
参考：plan.md §5.2.1、§2.1；plan-decisions.md PD10
验证：Creator 编辑器打开场景无报错；GameApp 组件可挂载
```

---

### Task 1.7 - ✅ 客户端云平台与网络层

- **目标**：wx.cloud 初始化、callFunction 封装、db.watch 封装 → AC-14 框架
- **所在项目**：`CoupleGame/assets/scripts/`
- **依赖**：Task 1.2、Task 1.5、Task 1.6
- **产出**：
  - `platform/wechat/WxCloudInit.ts`
  - `platform/wechat/WxAuth.ts`
  - `network/CloudService.ts`
  - `network/GameWatcher.ts`
  - `network/GameStateMirror.ts`
- **执行指令**：

```
1. WxCloudInit：wx.cloud.init({ env: Constants.ENV_ID })
2. WxAuth：调用 login 云函数，写入 GameSession
3. CloudService：封装 callFunction(name, data)，统一错误处理
4. GameWatcher：watch rooms/games 文档，派发 room_update/game_update 等事件（plan §4.2 映射表）
5. GameStateMirror：持有最新 GameDoc，只读
参考：plan.md §4.2、§5.2.2～5.2.3；PD3 callFunction+watch
注意：禁止客户端本地掷骰或改金币
验证：启动后 login 成功；watch 绑定无报错（可用 mock roomId）
```

---

## 阶段二：P1 大厅与房间

> 目标：好友房、匹配队列、5 分钟解散、大厅 UI。  
> 覆盖 AC：AC-2、AC-3、AC-4、AC-5  
> 计划参考：plan.md §5.1.3～5.1.4、§5.2.4

### Task 2.1 - ✅ room 云函数

- **目标**：创建/加入/开始房间 → AC-2、AC-3
- **所在项目**：`CoupleGame/cloudfunctions/room/`
- **依赖**：Task 1.4、Task 1.5
- **产出**：`cloudfunctions/room/index.js`
- **执行指令**：

```
1. action=create：6位 roomCode、写 rooms（expireAt=now+5min、maxPlayers）
2. action=join：按 roomCode 加入，校验未满、status=WAITING
3. action=start：仅 host、players≥2；调用 BoardGenerator.init（可先 stub 空 game）；写 games；rooms.status=PLAYING
4. 返回结构见 plan.md §4.1
参考：plan.md §5.1.3、§4.1；D27 房主开始最少2人
验证：云函数测试 create/join/start 链路；rooms/games 有文档
```

---

### Task 2.2 - ✅ match 云函数

- **目标**：匹配入队与取消 → AC-5 前半
- **所在项目**：`CoupleGame/cloudfunctions/match/`
- **依赖**：Task 1.4
- **产出**：`cloudfunctions/match/index.js`
- **执行指令**：

```
1. action=enqueue：写 match_queue（ticketId、openId、enqueueAt、maxPlayers）
2. action=cancel：按 ticketId 或 openId 删除队列项
3. 防重复入队：同一 openId 仅一条有效 ticket
参考：plan.md §5.1.4、§4.3 match_queue；T1 30秒规则在 scheduler 实现
验证：enqueue 后 match_queue 有记录；cancel 后删除
```

---

### Task 2.3 - ✅ scheduler 云函数与定时触发器

- **目标**：5 分钟解散 + 30 秒匹配组局 → AC-4、AC-5
- **所在项目**：`CoupleGame/cloudfunctions/scheduler/`
- **依赖**：Task 2.1、Task 2.2
- **产出**：`cloudfunctions/scheduler/index.js`、控制台定时触发器
- **执行指令**：

```
1. disbandExpiredRooms：expireAt<now && WAITING → DISBANDED
2. processMatchQueue：enqueueAt≤now-30s 的≥2人组 room 并 auto start（复用 room 逻辑）
3. 在控制台配置定时触发器（见 ddl-sql.md §4）
参考：plan.md §4.4、§5.1.3～5.1.4；PD4 30秒单队列
验证：创建 room 不开始，5min 后 status=DISBANDED；2人 enqueue 30s 后有 gameId
```

---

### Task 2.4 - ✅ 大厅与房间 UI

- **目标**：lobby 场景、建房/加入/匹配/分享、房间 watch → AC-2、AC-3、AC-4、AC-5
- **所在项目**：`CoupleGame/assets/`
- **依赖**：Task 1.7、Task 2.1、Task 2.2、Task 2.3
- **产出**：
  - `assets/scenes/lobby.scene`
  - `assets/scripts/lobby/LobbyController.ts`
  - `assets/scripts/lobby/RoomController.ts`
  - `assets/scripts/platform/wechat/WxShare.ts`
- **执行指令**：

```
1. LobbyController：按钮触发 room.create、room.join、match.enqueue/cancel
2. RoomController：watch rooms 文档，显示成员列表、房主「开始」、满员状态
3. 监听 DISBANDED 提示「房间已过期」→ AC-4
4. 监听 gameId 出现 / match 成功 → SceneLoader 跳 board 场景
5. WxShare：wx.shareAppMessage 带 roomCode
参考：plan.md §5.2.4；design.md §3.2
验证：双开开发者工具可建房加入；房主开始后双方进入 board 场景
```

---

## 阶段三：P2 棋盘核心

> 目标：BoardGenerator、GameEngine、game 云函数、棋盘 UI、结算逻辑。  
> 覆盖 AC：AC-6、AC-7、AC-8、AC-9、AC-11、AC-12、AC-13、AC-14  
> 计划参考：plan.md §5.1.5、§5.1.7、§5.2.5

### Task 3.1 - ✅ BoardGenerator 与 CellResolver 单测

- **目标**：72 格随机布局与金币/厄运结算纯逻辑 → AC-6、AC-8
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 1.4
- **产出**：
  - `common/BoardGenerator.js`
  - `common/CellResolver.js`
  - `cloudfunctions/common/__tests__/*.test.js`（Jest）
- **执行指令**：

```
1. BoardGenerator.init()：1钻石+20金币+5事件+5小游戏+41普通，索引 0-71 不重复
2. 每个金币格随机分配五种 goldVariant 之一
3. CellResolver.apply(cell, player, doomActive)：
   - 固定 +100/+200/+300
   - RANDOM_0_500：{0,50,...,500} 均匀
   - RANDOM_NEG200_400：{-200,-150,...,400} 均匀
   - 厄运：收益变损失；混合区间固定 -200
4. relocateDiamond：踩后变 NORMAL，随机普通格重生 DIAMOND
参考：plan.md §5.1.5；design.md §3.3.2～3.3.4；D18、D30
验证：npm test 覆盖布局计数、厄运翻转、50倍数
```

---

### Task 3.2 - ✅ GameEngine 状态机

- **目标**：回合 rollDice、圈数、18 分钟、切换座位、触发结束
- **所在项目**：`CoupleGame/cloudfunctions/common/`
- **依赖**：Task 3.1
- **产出**：`common/GameEngine.js`
- **执行指令**：

```
1. rollDice(game, openId)：校验 currentSeat；dice=1-6；移动；lap++ 过起点
2. 落点：调用 CellResolver；EVENT 设 doomRemainingTurns=2；MINIGAME 设 phase=MINIGAME_BLUFF（stub）
3. 每完整一轮 decrement doomRemainingTurns
4. 结束：任一 player.lap>=2 或 now-startedAt>=18min → settle 入口
5. nextSeat 顺时针
参考：plan.md §5.1.5；design.md §3.3.5；D11
验证：单测 2 圈结束、18min 超时、doom 2 回合
```

---

### Task 3.3 - ✅ game 云函数（棋盘 + 结算 + 退出）

- **目标**：rollDice、quit、forceSettle、写 users.diamond → AC-7、AC-9、AC-11、AC-12、AC-13、AC-14
- **所在项目**：`CoupleGame/cloudfunctions/game/`
- **依赖**：Task 3.2、Task 2.1
- **产出**：`cloudfunctions/game/index.js`
- **执行指令**：

```
1. action=rollDice：加载 games 文档；GameEngine.rollDice；写回 games（乐观锁 version 可选）
2. action=quit：标记 isDefeated；forceSettle
3. forceSettle：排名 diamond desc → gold desc → 平局；写 settlement；users.diamond inc
4. 不写入 game_history（T7）
参考：plan.md §5.1.5、§5.1.7；PD5 允许负金币；PD6 平局
验证：云函数 rollDice 后 games 文档 position/gold 变化；quit 后 settlement 存在
```

---

### Task 3.4 - ✅ 棋盘场景 UI

- **目标**：72 格棋盘渲染、掷骰、watch 驱动、HUD → AC-6、AC-7、AC-14
- **所在项目**：`CoupleGame/assets/`
- **依赖**：Task 1.7、Task 3.3
- **产出**：
  - `assets/scenes/board.scene`
  - `assets/scripts/game/board/BoardView.ts`
  - `assets/scripts/game/board/PawnView.ts`
  - `assets/scripts/game/board/HudController.ts`
  - `assets/prefabs/Cell.prefab`、`Pawn.prefab`（简版）
- **执行指令**：

```
1. BoardView：72 格环形布局，格类型颜色/Label 区分
2. PawnView：按 players[].position tween 移动；lastDice 动画
3. HudController：当前回合高亮、金币/钻石、18 分钟倒计时
4. 掷骰按钮仅 currentSeat 是自己时可点 → CloudService game.rollDice
5. watch games 文档驱动刷新（禁止本地算骰）
参考：plan.md §5.2.5；design.md §3.3
验证：双客户端轮流掷骰，状态同步；非当前玩家按钮不可用
```

---

## 阶段四：P3 吹牛、结算与集成验收

> 目标：BluffEngine、吹牛 UI、结算页、onHide 退出、全量 AC 走查、微信构建。  
> 覆盖 AC：AC-10、AC-11、AC-12、AC-13、AC-14  
> 计划参考：plan.md §5.1.6～5.1.7、§5.2.6～5.2.8

### Task 4.1 - ✅ BluffEngine 与 game 云函数吹牛 action

- **目标**：大话骰逻辑、私有骰子、奖励发放 → AC-10
- **所在项目**：`CoupleGame/cloudfunctions/`
- **依赖**：Task 3.3
- **产出**：`common/BluffEngine.js`、`game/index.js`（bluffShake/bid/open）
- **执行指令**：

```
1. BluffEngine：每人 5 骰；轮询 bid；开牌统计（1 为赖子）；出局至剩 1 人
2. 排名：出局顺序倒序；奖励 800/500/200，末位 0（按人数表 design §3.4.3）
3. bluffShake/bid/open action；私有 myDice 仅 callFunction 返回，不写 games
4. 结束：phase=BOARD，currentSeat=next(triggerSeat)（PD7/T4）
5. 30s 超时自动开（T5）
参考：plan.md §5.1.6；D15、D28
验证：单测 2～4 人奖励；云函数开牌后 gold 正确增加
```

---

### Task 4.2 - ✅ 吹牛场景 UI

- **目标**：摇骰、叫点、开 UI → AC-10
- **所在项目**：`CoupleGame/assets/`
- **依赖**：Task 4.1、Task 3.4
- **产出**：
  - `assets/scenes/minigame_bluff.scene`
  - `assets/scripts/game/minigame/BluffController.ts`
- **执行指令**：

```
1. 监听 phase=MINIGAME_BLUFF 进入吹牛 UI
2. 显示自己的 myDice（callFunction 响应）；他人只显示 bluffState 公共信息
3. 按钮：摇完、叫点（N 个 P 点）、开 → 对应 cloud function
4. minigame_end 关闭 UI 回棋盘 HUD
参考：plan.md §5.2.6；PD14 独立场景
验证：踩小游戏格后全员进入吹牛；结束后回棋盘且下家可掷骰
```

---

### Task 4.3 - ✅ 结算场景与退出处理

- **目标**：结算页、局外钻石展示、onHide 退出 → AC-11、AC-12、AC-13
- **所在项目**：`CoupleGame/assets/`
- **依赖**：Task 3.3、Task 3.4
- **产出**：
  - `assets/scenes/settlement.scene`
  - `assets/scripts/settlement/SettlementController.ts`
  - board 场景退出按钮 + `wx.onHide` → game.quit
- **执行指令**：

```
1. 监听 games.settlement / phase=SETTLED → 跳 settlement 场景
2. 展示排名、局内 diamond/gold、局外 diamond 增量
3. 平局显示（T3/PD6）
4. board/onHide：调用 game.quit（退出判负整局结算，D24）
5. 返回大厅按钮
参考：plan.md §5.2.7、§5.1.7
验证：完成 2 圈或 18min 结算；退出方判负；users.diamond 已更新
```

---

### Task 4.4 - ✅ 集成验收与微信构建

- **目标**：走查 AC-1～AC-14，完成构建与云函数部署
- **所在项目**：`CoupleGame/`
- **依赖**：Task 2.4、Task 3.4、Task 4.2、Task 4.3
- **产出**：验收记录（可写在 tasks.md 底部或单独 checklist）、`build/wechatgame/`
- **执行指令**：

```
1. 部署全部云函数 + scheduler 触发器
2. Creator 构建 WeChat Mini Game，开发者工具加载
3. 按 design.md AC-1～AC-14 逐项手动走查（双开/三开联调）
4. 确认 ddl-sql.md §5 上线检查清单全部完成
5. 记录已知限制：无断线重连（D14）
参考：plan.md §7 验证策略；design.md §6
验证：AC 全部通过；真机可登录并联机一局
```

**验收检查清单（AC）**

> 验收日期：2026-05-28 · 联调方式：微信开发者工具双开 + 全流程手测  
> 已知限制：无断线重连（D14）；弱网下 watch 可能报错但不影响 callFunction 主流程

- [x] AC-1 微信登录进大厅，昵称头像
- [x] AC-2 创建/加入好友房
- [x] AC-3 房主开始全员进棋盘（含非房主 watch/轮询进房）
- [x] AC-4 5 分钟未开解散（scheduler）
- [x] AC-5 快速匹配满 2 人即开
- [x] AC-6 **58** 格随机布局（1 钻石 / 20 金币 / 5 事件 / 25 小游戏 / 27 普通）
- [x] AC-7 回合制掷骰、逐格移动、切换下家（含掷 7 再掷）
- [x] AC-8 金币格与厄运正确（50 整数倍随机、厄运仅作用于触发者）
- [x] AC-9 钻石格 +5 与重生
- [x] AC-10 吹牛排名奖励（2 人 800/0 等）
- [x] AC-11 **10 行动回合**满或 **2 圈**提前结束；钻石优先、金币次之、完全平局显示并列
- [x] AC-12 局外钻石累加（结算回大厅可见余额）
- [x] AC-13 退出判负立即结算
- [x] AC-14 服务端权威不可篡改（rollDice / 吹牛均走云函数）

---

## 并行执行矩阵

```
阶段一：
  Task 1.1
    ├─ Task 1.2 ──┬─ Task 1.4 ── Task 1.5 ──┐
    │             │                          │
    └─ Task 1.6 ──┴─ Task 1.7 ←──────────────┘
         Task 1.3（与 1.4 并行，依赖 1.2）

阶段二（依赖阶段一）：
  Task 2.1 + Task 2.2（可并行）
    └─ Task 2.3
         └─ Task 2.4

阶段三（依赖阶段二）：
  Task 3.1 → Task 3.2 → Task 3.3
                              └─ Task 3.4

阶段四（依赖阶段三）：
  Task 4.1 → Task 4.2
  Task 4.3（与 4.1 并行，依赖 3.3）
  Task 4.4（依赖 4.2、4.3）
```

**共 18 个任务，最大并行度：阶段一 3 路 / 阶段二 2 路**

---

## 任务状态说明

| 标记 | 含义 |
|------|------|
| ❌ | 未开始 |
| 🔄 | 进行中 |
| ✅ | 已完成 |

完成任务后请将对应 Task 标题前缀改为 ✅，便于 task-executor 追踪。
