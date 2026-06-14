# 命运树 UI — 实现状态与排查记录（2026-06-10）

设计文档见 [design.md](./design.md)。本文件记录实现落地清单与「大厅看不到命运树按钮」问题的排查结论。

## 一、实现落地清单

### 云端（cloudfunctions）
- 新增 `cloudfunctions/common/pve/PveDestinyTree.js`：纯 JS 镜像 `DESTINY_TREE_NODES` + `canUnlockNode(meta, nodeId)` + `getNodeDef(nodeId)`。
- `cloudfunctions/common/db.js`：
  - `getUserPveMeta` 新增返回 `unlockedTreeNodes`（来自 `users.unlockedTreeNodes`，默认 `[]`）。
  - 新增 `unlockUserTreeNode(userId, nodeId)`：服务端权威重新校验（顺序/碎片/重复解锁），通过后原子扣费并写入 `unlockedTreeNodes`，返回最新 `PveMeta`；校验失败抛出 `CANNOT_UNLOCK`。
- `cloudfunctions/common/pve/PveMeta.js`：新增 `unlockTreeNode(user, nodeId)`，导出 `{ loadMeta, updateMeta, unlockTreeNode }`。
- `cloudfunctions/pve/index.js`：新增 action `unlockTreeNode` → 调用 `unlockTreeNode`，返回 `{ ok: true, meta }`。
- `scripts/sync-cloud-common.js`：`COPY_SUBDIR_FILES` 登记 `pve/PveDestinyTree.js`、`pve/PveMeta.js`，已执行同步到各云函数目录。
- 测试：`cloudfunctions/common/__tests__/pve.test.js` 新增 `PveDestinyTree — canUnlockNode` 6 个用例（节点不存在/重复解锁/碎片不足/顺序违反/合法顺序解锁/首个节点无前置解锁），全套件 100/100 通过。

### 客户端网络层
- `assets/scripts/network/PveService.ts` 新增 `unlockTreeNode(nodeId)`：调用云函数 `pve.unlockTreeNode`，失败抛错（调用方不做乐观更新）。

### 场景注册
- `assets/scripts/core/Constants.ts`：`SCENE.DESTINY_TREE = 'destiny_tree'`。
- `assets/scripts/core/SceneLoader.ts`：新增 `loadDestinyTree()`。

### 客户端 UI（新文件）
- `assets/scripts/pve/views/DestinyTreeView.ts`：纯渲染视图。标题「命运之树」、碎片余量、5 列（A 生存/B 战斗/C 财富/D 强化/E 天命）× 3 节点网格，按已解锁/可解锁/锁定三态着色，「返回大厅」按钮。
- `assets/scripts/pve/controllers/DestinyTreeController.ts`：
  - `onLoad`：`lockLandscape` + `refreshScreenAdapt` + `applyUiLayerTree`，构建 `DestinyTreeView`/`PveToastView`，拉取 `loadPveMeta()` 渲染。
  - 点击节点 → `unlockTreeNode(nodeId)` → 用返回的最新 `meta` 重渲染；失败 toast 提示，状态保持不变。

### 编辑器场景（通过 MCP）
- 新建 `db://assets/scenes/destiny_tree.scene`（Camera 已正确挂载为 Canvas 子节点），在 Canvas 上挂载 `DestinyTreeController` 脚本，已 `save` 并 `validate_scene` 通过（无断裂引用）。

### 大厅入口
- `assets/scripts/lobby/LobbyController.ts`（约 1064 行）：在「命运远征」按钮下方新增「命运树」按钮，点击调用 `SceneLoader.loadDestinyTree()`。

### 测试结果
- `npm run test:pve`：23 套件 / 311 用例全部通过。
- `cloudfunctions/common` jest：2 套件 / 100 用例全部通过（含新增 19 例）。
- `npx tsc --noEmit`：无新增错误（仅引擎自带的预存在错误）。

## 二、问题排查：「重新构建+patch 后大厅没有命运树按钮」

**用户反馈**：本地 Build → 勾选 destiny_tree 场景 → patch → 清理微信开发者工具缓存 → 重新编译后，大厅其它功能均正常，唯独新增的「命运树」按钮没有出现。微信开发者工具控制台无报错。

**已排查并确认无问题的环节：**
1. `LobbyController.ts:1064` 源码逻辑正确，与现有「命运远征」按钮结构完全一致（同一个 `_makeBtn`，同一套 sprite-key 兜底逻辑 `lobby/btn_lobby_join_9s`）。
2. `npx tsc --noEmit` 无 LobbyController 相关新增错误。
3. **构建产物已确认包含新代码**：`build/wechatgame/assets/main/index.js`（mtime 2026-06-10 11:55，晚于源码修改时间 11:48）中可搜到：
   ```js
   this._makeBtn(f,"命运树",v,(function(){return R.loadDestinyTree()}),new s(200,160,60,255))
   ```
   紧跟在「命运远征」按钮之后，结构完全正常。

**结论**：源码、TypeScript 编译、Cocos Build 产物三者均正确包含「命运树」按钮代码。问题应出在 **build 产物 与 微信开发者工具实际运行内容之间的不一致**（缓存/路径问题），而非代码本身。

**待用户排查的方向（未验证）：**
1. 确认微信开发者工具打开的项目目录确实是 `D:\GameSpace\CoupleGame\build\wechatgame`，而不是旧的/其它构建输出目录。
2. 开发者工具「清除全部缓存」（不仅是「编译」）后，完全关闭并重新打开项目。
3. 若是通过 patch 在真机上体验：手机端微信小程序运行时缓存与开发者工具缓存是分离的，需要重新扫码/清除小程序缓存。

## 三、范围确认（来自 design.md）
- E2/E3「三选一队列展示」不在本次范围内。
- 节点效果文案不展示，仅显示名称 + 解锁所需碎片数。
