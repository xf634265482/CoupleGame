# 命运树 UI 功能设计

> 历史 V1 UI 设计。命运树 V2 已扩展为 5 支 × 9 节点，正式规则见 `specs/260628-destiny-tree-v2/design.md`。
> 关联：`assets/scripts/pve/core/DestinyTreeSystem.ts` / `PveConstants.DESTINY_TREE_NODES`。

## 背景

`DestinyTreeSystem` 的纯函数逻辑（`canUnlockNode`/`unlockNode`/`getTreeBonuses`）已实现并通过单测，但：
- 云端 `getUserPveMeta` 未返回 `unlockedTreeNodes`，且无解锁校验 action。
- 客户端无任何命运树 UI 入口。

本设计补齐云端校验 + 网络层 + 客户端独立场景 UI。

## 1. 云端：`unlockTreeNode` action

- `cloudfunctions/common/db.js`
  - `getUserPveMeta` 返回值补充 `unlockedTreeNodes: user?.unlockedTreeNodes ?? []`
  - 新增 `unlockUserTreeNode(userId, nodeId)`：读取用户当前 `destinyShards` + `unlockedTreeNodes`，服务端用 `PveDestinyTree.canUnlockNode` 重新校验（节点存在 / 未解锁 / 碎片足够 / 同列需按 order 顺序解锁），通过则 `destinyShards -= cost`、`unlockedTreeNodes` 追加并原子写回；不通过返回 `{ ok: false, code: 'CANNOT_UNLOCK' }`。
- 新增 `cloudfunctions/common/pve/PveDestinyTree.js`：纯 JS 镜像 `DESTINY_TREE_NODES` 表 + `canUnlockNode`（与 `DestinyTreeSystem.ts` 逻辑一致，同 `PveValidate.js` 的镜像模式），登记进 `scripts/sync-cloud-common.js` 的 `COPY_SUBDIR_FILES`。
- `cloudfunctions/pve/index.js` 新增 `action === 'unlockTreeNode'`（入参 `nodeId`），返回 `{ ok: true, meta }`（最新 `PveMeta`）。
- 测试：`cloudfunctions/common/__tests__/pve.test.js` 补充用例：
  - 顺序未满足（如先解锁 A2 但 A1 未解锁）→ no-op / 失败
  - 碎片不足 → 失败
  - 重复解锁 → 失败
  - 正常解锁 → 扣费 + 节点加入列表

## 2. 客户端网络层

`assets/scripts/network/PveService.ts` 新增：
```ts
export async function unlockTreeNode(nodeId: string): Promise<LoadMetaResponse> {
  return ensureOk(
    await callFunction<LoadMetaResponse>('pve', { action: 'unlockTreeNode', nodeId }),
    'PVE_UNLOCK_TREE_NODE_FAILED',
  );
}
```
失败不做客户端乐观更新（避免与服务端状态不一致），由 UI 层 toast 提示并保持原状态。

## 3. 客户端 UI

### 场景：`assets/scenes/destiny_tree.scene`（新增独立场景）

- Canvas + Camera（沿用其他场景的标准结构）
- 挂载 `DestinyTreeController`

### `assets/scripts/pve/views/DestinyTreeView.ts`（纯渲染）

沿用 `pveUiKit.makeFlatButton` / `makeLabel`，配色与 `PveCharacterPanel` 一致：
- 顶部标题「命运之树」+ 当前命运碎片余额（`TITLE_COLOR`）
- 5 列（A 生存 / B 战斗 / C 财富 / D 强化 / E 天命）× 3 行节点按钮，每个显示节点名称 + 消耗
  - 已解锁：金色（`TITLE_COLOR`），不可点击
  - 可解锁（`canUnlockNode` 为 true）：蓝色（`makeFlatButton` 默认色），可点击
  - 锁定（前置未解锁或碎片不足）：灰色（`DIM_COLOR` 系），不可点击
- 底部「返回大厅」按钮

### `assets/scripts/pve/controllers/DestinyTreeController.ts`

- `onLoad`：`loadPveMeta()` 拉取 `meta` → `view.render(meta)`
- 节点点击：本地 `canUnlockNode` 预判（避免无效请求）→ `unlockTreeNode(nodeId)` → 用返回的新 `meta` 重新 `render`；失败用 `PveToastView` 同款 toast 提示
- 返回按钮 → `SceneLoader.loadLobby()`

## 4. 场景注册与入口

- `assets/scripts/core/Constants.ts`：`SCENE.DESTINY_TREE = 'destiny_tree'`
- `assets/scripts/core/SceneLoader.ts`：新增 `loadDestinyTree()`
- `assets/scripts/lobby/LobbyController.ts`：菜单中「命运远征」按钮旁新增「命运树」按钮（金色调，`SceneLoader.loadDestinyTree()`）

## 范围确认

- 仅命运树 UI 闭环（M2+ 范围内的「命运碎片元进度」一部分），不涉及 E2/E3 三选一队列展示（那是远征内 `pendingTreeChoices` 的既有逻辑，不在本次范围）。
- 节点效果文案（具体数值说明）暂不展示，仅显示名称 + 消耗，与现有 `DESTINY_TREE_NODES` 数据一致。
