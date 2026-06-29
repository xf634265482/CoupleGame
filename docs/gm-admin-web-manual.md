# GM 后台使用手册

适用范围：`命运远征`（PVE）独立网页 GM 后台  
部署位置：CloudBase 静态网站托管  
数据入口：仅允许通过 `adminLogin`、`adminTool` 云函数读写

## 1. 这套后台能做什么

- 管理员账号密码登录
- 按 `openid` 或 `userId` 查询单个玩家
- 调整单个玩家资源
  - 局内金币：`pve_saves.player.gold`
  - 钻石：`users.diamond`
  - 命运碎片：`users.destinyShards`
- 重置单个玩家当前远征
  - 删除 `pve_saves`
  - 清空 `users.pvePendingRunSeed`
  - 玩家下次从第 1 层重新开始
- 重置单个玩家新手教程
  - `users.pveTutorialCompleted = false`
- 重置单个玩家命运树
  - 只清空，不返还碎片
  - 清空并返还碎片
- 全服重置 PVE 排行榜
  - `users.pveHighestFloor = 0`
  - 删除 `users.pveHighestFloorUpdatedAt`
- 查看最近 50 条 GM 写操作日志

## 2. 这套后台不会做什么

- 不直接给网页开放云数据库写权限
- 不允许前端传任意字段覆盖玩家存档
- 不把管理员密码、云开发密钥写进前端
- 不把网页打进小游戏包体
- 不提供“全服全量清档”按钮
  说明：当前首版按已确认边界，只开放“全服重置排行榜”这一项全局操作

## 3. 当前已确认的数据边界

### 3.1 玩家核心数据来自哪里

- `users`
  - `_openid`
  - `id`
  - `nickname`
  - `diamond`
  - `destinyShards`
  - `pveHighestFloor`
  - `unlockedTreeNodes`
  - `pveCodex`
  - `pveTutorialCompleted`
  - `pvePendingRunSeed`
- `pve_saves`
  - `userId`
  - `openId`
  - `chapter`
  - `floor`
  - `player.classId`
  - `player.gold`
  - `player.bag`
  - `updatedAt`

### 3.2 “重置当前远征” 的准确含义

执行后：

- 删除该玩家 `pve_saves` 存档
- 清空 `users.pvePendingRunSeed`
- 玩家下次进入远征时，从第 1 层重新开始

不会改动：

- `users.pveHighestFloor`
- `users.diamond`
- `users.destinyShards`
- `users.unlockedTreeNodes`
- `users.pveCodex`
- `users.pveTutorialCompleted`

## 4. 文件与目录

### 4.1 网页前端

- `gm-web/`
  - `src/main.ts`
  - `src/api.ts`
  - `src/state.ts`
  - `src/types.ts`
  - `src/styles.css`

### 4.2 云函数

- `cloudfunctions/adminLogin`
- `cloudfunctions/adminTool`

### 4.3 云函数公共源

- `cloudfunctions/common/admin/AdminConstants.js`
- `cloudfunctions/common/admin/AdminAuth.js`
- `cloudfunctions/common/admin/AdminToolService.js`

注意：

- `cloudfunctions/common/**` 是唯一源头
- 改完后必须执行：

```bash
node scripts/sync-cloud-common.js
```

## 5. 本地运行步骤

### 5.1 安装依赖

```bash
cd gm-web
npm install
```

### 5.2 配置前端环境变量

复制 `gm-web/.env.example` 为 `.env.local`，至少填写：

```bash
VITE_TCB_ENV_ID=cloud1-d9gsn7mh609335539
VITE_GM_ENV_LABEL=测试环境
VITE_GM_APP_TITLE=塔塔远征团 GM 后台
```

### 5.2.1 本地调试前的 CloudBase 控制台配置

网页端本地运行前，还需要在云开发控制台确认两项：

- 开启 `匿名登录`
- 把本地域名加入安全域名
  - `http://127.0.0.1:5173`
  - `http://localhost:5173`

否则本地页面调用云函数时会出现：

- `unauthenticated`
- `credentials not found`

### 5.3 启动本地开发

```bash
cd gm-web
npm run dev
```

浏览器打开 Vite 提示的本地地址，例如：

```text
http://127.0.0.1:5173
```

### 5.4 本地构建检查

```bash
cd gm-web
npm run build
```

已验证当前项目可以成功构建。

## 6. 云函数部署步骤

### 6.1 初始化集合与默认管理员

先部署并执行 `initDb`。

当前项目里的 `cloudfunctions/initDb/index.js` 会自动：

- 创建缺失集合
  - `admin_accounts`
  - `admin_sessions`
  - `admin_logs`
- 写入默认管理员账号

默认管理员：

- `username`: `admin`
- `displayName`: `超级管理员`

如果你后续想换密码，重新生成哈希后更新 `admin_accounts` 即可。

### 6.2 部署公共代码变更

如果你改了 `cloudfunctions/common/**`：

```bash
node scripts/sync-cloud-common.js
```

然后在微信开发者工具里部署：

- `adminLogin`
- `adminTool`
- 如有需要，再部署 `initDb`

部署方式：

- 右键云函数
- 选择“创建并部署：云端安装依赖”

## 7. CloudBase 静态网站托管部署步骤

### 7.1 先产出前端静态文件

```bash
cd gm-web
npm run build
```

构建产物目录：

- `gm-web/dist`

### 7.2 上传到 CloudBase 静态网站托管

在对应云开发环境中：

1. 打开 CloudBase / 云开发控制台
2. 进入“静态网站托管”
3. 创建站点或选择已有站点
4. 上传 `gm-web/dist` 目录中的全部文件
5. 发布完成后，用分配到的站点域名访问

### 7.3 环境区分建议

- 测试环境站点标题写 `测试环境`
- 正式环境站点标题写 `正式环境`
- 正式环境对应的 CloudBase `envId` 要单独构建并单独上传

## 8. 如何配置管理员账号

### 8.1 生成密码哈希

项目已提供脚本：

```bash
node scripts/generate-admin-password-hash.js --username gm --password your-password --displayName 超级管理员
```

它会输出一段 JSON，包含：

- `username`
- `usernameLower`
- `passwordSalt`
- `passwordHash`
- `passwordIterations`

### 8.2 写入 `admin_accounts`

把脚本输出的 JSON 写入 `admin_accounts` 集合，并把这两个占位值改成真实值：

- `createdAt: <serverDate()>`
- `updatedAt: <serverDate()>`

建议在数据库控制台中保存为：

- `createdAt`: 当前服务器时间
- `updatedAt`: 当前服务器时间

完整字段建议为：

- `id`
- `username`
- `usernameLower`
- `displayName`
- `passwordSalt`
- `passwordHash`
- `passwordIterations`
- `disabled`
- `createdAt`
- `updatedAt`

### 8.3 停用管理员

把该账号文档的：

```json
{
  "disabled": true
}
```

保存后，该账号新的登录和 token 校验都会失败。

## 9. 正式环境上线前必须确认

### 9.1 设置正式环境标记

编辑：

- `cloudfunctions/common/admin/AdminConstants.js`

把真实正式环境 `envId` 写进：

```js
const PRODUCTION_ENV_IDS = new Set([
  '你的正式环境 envId',
]);
```

然后执行：

```bash
node scripts/sync-cloud-common.js
```

再重新部署：

- `adminLogin`
- `adminTool`

这样后台顶部才能正确显示“正式环境”。

### 9.2 正式环境操作习惯

- 查询玩家优先使用 `userId` 或 `openid`
- 所有资源调整都填写真实原因
- 危险操作先在测试环境演练
- 全服排行榜重置前，确认输入 `RESET_LEADERBOARD`

## 10. 日志说明

所有写操作都会写入 `admin_logs`，内容包括：

- 管理员账号
- 目标玩家
- `action`
- `payload`
- `before`
- `after`
- `reason`
- `createdAt`
- `requestSource`

后台首页会显示最近 50 条日志。

## 11. 常见问题

### 11.1 为什么网页前端不能直接改数据库

因为这样会把写权限暴露给浏览器。现在的实现里，前端只能调云函数，真正的白名单校验和写入逻辑都在云端。

### 11.2 为什么“局内金币”不是 `users` 表字段

因为当前确认的“金币”是本次远征局内资源，它在：

- `pve_saves.player.gold`

不是永久资产。

### 11.3 为什么重置当前远征后玩家不是“完全清档”

因为这个操作只重置当前局。它的目标是让玩家下次从第 1 层重新开始，不影响历史最高层、钻石、命运碎片、命运树和图鉴。
