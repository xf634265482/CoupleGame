# 塔塔远征团 GM 后台设计

日期：2026-06-27  
范围：PVE GM 后台首版  
目标：提供一个独立于小游戏包体的网页 GM 后台，部署到 CloudBase 静态网站托管，通过云函数安全地查询和修改玩家 PVE 数据。

## 1. 目标与边界

### 1.1 目标

- 提供独立网页 GM 后台，不进入小游戏包体
- 网页前端部署到 CloudBase 静态网站托管
- 所有数据查询和写入都通过云函数完成
- 网页前端禁止直接写云数据库
- 提供管理员登录、玩家查询、资源调整、进度重置、日志查看

### 1.2 已确认现有数据结构

- 云开发环境：`cloud1-d9gsn7mh609335539`
- 已有云函数目录：
  - `cloudfunctions/common`
  - `cloudfunctions/game`
  - `cloudfunctions/initDb`
  - `cloudfunctions/login`
  - `cloudfunctions/match`
  - `cloudfunctions/pve`
  - `cloudfunctions/room`
  - `cloudfunctions/scheduler`
- 已确认集合名：
  - `users`
  - `rooms`
  - `games`
  - `match_queue`
  - `pve_saves`

### 1.3 已确认 PVE 相关字段

`users` 中已确认：

- `_openid`
- `id`
- `nickname`
- `avatarUrl`
- `diamond`
- `destinyShards`
- `pveHighestFloor`
- `pveHighestFloorUpdatedAt`
- `unlockedTreeNodes`
- `pveCodex`
- `pveTutorialCompleted`
- `pveStamina`
- `pveStaminaUpdatedAt`
- `pveFirstRunStarted`
- `pvePendingRunSeed`

`pve_saves` 中已确认：

- `userId`
- `openId`
- `runSeed`
- `status`
- `chapter`
- `floor`
- `player`
- `floorState`
- `version`
- `updatedAt`

### 1.4 GM 首版业务边界

- 支持单玩家操作：
  - 查询玩家
  - 调整当前远征局内金币
  - 调整钻石
  - 调整命运碎片
  - 重置当前远征
  - 重置新手教程
  - 重置命运树
  - 重置命运树并返还碎片
- 支持全服操作：
  - 仅支持重置排行榜

### 1.5 关键定义

`金币`：

- 指当前 PVE 远征存档中的局内金币
- 实际字段为 `pve_saves.player.gold`
- 不引入新的账号级长期金币字段

`重置当前远征（下次从第1层开始）`：

- 删除该玩家当前 `pve_saves` 存档
- 清除 `users.pvePendingRunSeed`
- 不修改 `users.pveHighestFloor`
- 不修改 `diamond`
- 不修改 `destinyShards`
- 不修改命运树、图鉴、成就、教程状态
- 玩家下次进入 PVE 时按新远征逻辑从第 1 层开始

## 2. 方案选型

采用方案：`独立 CloudBase 静态网站 + adminLogin + adminTool 两个专用云函数`

不采用原因：

- 不复用现有 `pve` action 作为 GM 接口，避免普通玩家接口与管理员接口混杂
- 不做轻量 JSON 命令台式后台，避免误操作和可用性不足

## 3. 架构设计

### 3.1 分层

- `gm-web/`
  - 独立前端工程
  - 本地运行与 CloudBase 静态托管部署目标
- `cloudfunctions/adminLogin/`
  - 管理员账号密码校验
  - 签发会话 token
- `cloudfunctions/adminTool/`
  - 玩家查询
  - 资源调整
  - 重置操作
  - 日志记录
- 数据库新增集合
  - `admin_accounts`
  - `admin_sessions`
  - `admin_logs`

### 3.2 权限模型

- GM 网页前端不直接写数据库
- GM 网页前端只调用：
  - `adminLogin`
  - `adminTool`
- 所有数据库写操作只发生在云函数
- `adminTool` 每次调用必须先校验 token

## 4. 云函数设计

### 4.1 adminLogin

输入：

- `username`
- `password`

处理：

- 查 `admin_accounts`
- 使用哈希校验密码，不存明文
- 登录成功后生成随机 token
- 写入 `admin_sessions`
- 设置过期时间

返回：

- `ok`
- `token`
- `expireAt`
- `adminName`
- `envLabel`

失败返回：

- `ok: false`
- `code`
- `message`

### 4.2 adminTool

输入公共字段：

- `token`
- `action`

公共处理：

- 校验 token 是否存在、是否过期、是否已失效
- 校验 action 是否在白名单中
- 拒绝任意字段覆盖式写入
- 所有修改操作记录 `before`、`after`、`reason`

action 白名单：

- `getPlayer`
- `adjustResources`
- `resetExpedition`
- `resetTutorial`
- `resetDestinyTreeOnly`
- `resetDestinyTreeAndRefund`
- `resetLeaderboardGlobal`
- `listLogs`

## 5. 页面设计

### 5.1 页面结构

首版采用单页后台：

1. 登录页
2. 顶部状态栏
3. 玩家查询与操作区
4. 操作日志区

### 5.2 顶部状态栏

显示：

- 当前环境：测试 / 正式
- 当前管理员账号
- token 过期时间
- 登出按钮

正式环境采用明显高风险配色和文案。

### 5.3 玩家查询页

查询条件：

- `openid`
- `userId`

展示字段：

- 昵称
- openid
- userId
- 最近登录时间
- 当前远征局内金币
- 钻石
- 命运碎片
- 当前章节
- 当前层数
- 当前职业
- 新手教程状态
- 命运树进度
- 背包数量

说明：

- `最近登录时间` 以现有 `users` 文档中实际可读到的最近活动字段为准；若不存在，则显示 `暂无`
- `职业`、`当前章节`、`当前层数`、`背包数量` 从 `pve_saves` 推导
- `背包数量` 由后端按存档内装备/道具容器汇总，前端不自行推断

## 6. 资源调整设计

### 6.1 支持资源

- `runGold` -> `pve_saves.player.gold`
- `diamond` -> `users.diamond`
- `destinyShards` -> `users.destinyShards`

### 6.2 校验规则

- `amount` 必须是整数
- 必须填写 `reason`
- 不允许扣成负数
- 单次调整有上限

建议首版上限：

- `runGold`: 绝对值不超过 `5000`
- `diamond`: 绝对值不超过 `2000`
- `destinyShards`: 绝对值不超过 `5000`

### 6.3 交互要求

- 前端提交前弹确认框
- 正式环境显示更强确认提示

## 7. 重置设计

### 7.1 resetExpedition

- 删除该玩家 `pve_saves`
- 删除 `users.pvePendingRunSeed`
- 下次从第 1 层开始

前端按钮文案：

- `重置当前远征（下次从第1层开始）`

### 7.2 resetTutorial

- `users.pveTutorialCompleted = false`

### 7.3 resetDestinyTreeOnly

- `users.unlockedTreeNodes = []`
- 不返还命运碎片

### 7.4 resetDestinyTreeAndRefund

- `users.unlockedTreeNodes = []`
- 根据当前已解锁节点成本返还 `destinyShards`

### 7.5 resetLeaderboardGlobal

- 批量处理 `users`
- `pveHighestFloor = 0`
- 删除或清空 `pveHighestFloorUpdatedAt`

正式环境强确认：

- 要求输入 `RESET_LEADERBOARD`

## 8. 日志设计

新增集合：

- `admin_logs`

字段：

- `adminUsername`
- `adminAccountId`
- `targetOpenId`
- `targetUserId`
- `action`
- `payload`
- `before`
- `after`
- `reason`
- `requestSource`
- `env`
- `success`
- `createdAt`

约束：

- 查询类操作默认不记日志
- 写操作必须记日志
- `before` / `after` 只存相关字段快照，不存整个大文档

日志查看：

- 后台可查看最近 `50` 条

## 9. 安全设计

- 前端不持有管理员明文密码、云开发密钥或数据库密钥
- 前端不直接拥有数据库写权限
- 使用 token 会话而非前端可解码 JWT
- token 过期后必须重新登录
- token 保存在 `sessionStorage`
- 正式环境危险操作额外二次确认
- `adminTool` 只允许白名单 action
- 不接受“前端传任意字段覆盖用户文档”

## 10. 本地开发与部署设计

### 10.1 本地开发

- 在仓库根目录新增 `gm-web/`
- 本地通过独立前端开发服务器运行
- 调用当前云开发环境云函数

### 10.2 部署

- 前端构建产物部署到 CloudBase 静态网站托管
- 不与小游戏构建产物混放
- 与小游戏包体完全解耦

## 11. 文件改动列表

### 11.1 新增前端目录

- `gm-web/package.json`
- `gm-web/tsconfig.json`
- `gm-web/vite.config.ts`
- `gm-web/index.html`
- `gm-web/src/main.ts`
- `gm-web/src/api.ts`
- `gm-web/src/types.ts`
- `gm-web/src/state.ts`
- `gm-web/src/styles.css`

如需要拆分 UI：

- `gm-web/src/components/LoginForm.ts`
- `gm-web/src/components/PlayerPanel.ts`
- `gm-web/src/components/ResourceEditor.ts`
- `gm-web/src/components/ResetActions.ts`
- `gm-web/src/components/LogsPanel.ts`

### 11.2 新增云函数

- `cloudfunctions/adminLogin/index.js`
- `cloudfunctions/adminTool/index.js`

如需本地依赖：

- `cloudfunctions/adminLogin/package.json`
- `cloudfunctions/adminTool/package.json`

### 11.3 新增 common 工具

建议新增：

- `cloudfunctions/common/admin/AdminAuth.js`
- `cloudfunctions/common/admin/AdminToolService.js`
- `cloudfunctions/common/admin/AdminConstants.js`

### 11.4 可能扩展现有 db 封装

修改：

- `cloudfunctions/common/db.js`

新增管理员相关数据库访问封装，例如：

- 查管理员账号
- 查会话
- 写会话
- 写日志
- 查询日志
- 查询玩家主档
- 查询玩家存档
- 批量重置排行榜

### 11.5 文档

- 更新 `README.md`
- 新增 `docs/gm-admin-deploy.md` 或并入现有文档

## 12. 测试策略

### 12.1 云函数测试

- adminLogin 成功登录
- adminLogin 密码错误
- adminTool token 过期
- adjustResources 扣减到负数被拒绝
- resetExpedition 后玩家下次从第 1 层开始
- resetLeaderboardGlobal 正常执行
- 写操作日志完整记录

### 12.2 前端测试

- 登录流程
- token 失效后自动要求重登
- 查询不到玩家时提示清晰
- 正式环境危险操作确认流程
- 日志页显示最近 50 条

## 13. 风险与约束

- 现有项目可能不存在统一的“最近登录时间”字段，首版需要按真实字段兜底显示
- `player` 内职业与背包结构需要实现时再按实际对象结构读取，不能猜字段名
- 首版不做全服清档、全服清教程、全服清命运树，避免误伤
- 命运树返还必须复用现有节点成本定义，不能在后台再手写一套

## 14. 实现顺序

1. 新增管理员集合与索引
2. 实现 `adminLogin`
3. 实现 `adminTool` 查询能力
4. 实现资源调整
5. 实现重置操作
6. 实现写操作日志
7. 实现 `gm-web` 前端
8. 本地联调
9. 输出部署与管理员配置步骤
