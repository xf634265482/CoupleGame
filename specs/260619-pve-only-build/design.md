# PVE-only 构建设计

## 目标

当前微信小游戏仅上线 PVE。保留原大厅视觉、命运远征入口和命运树入口，完全隐藏 PVP 操作，并让 PVP 场景、运行时代码依赖和 UI 原生素材不进入发布包。

## 方案

- 新增独立 `PveLobbyController`，大厅场景不再挂载联机版 `LobbyController`。
- 原 `LobbyController`、`RoomController`、PVP 网络层和玩法源码保留，未来恢复时无需从 Git 还原。
- 微信构建场景仅包含：
  - `bootstrap.scene`
  - `lobby.scene`
  - `pve_expedition.scene`
  - `destiny_tree.scene`
- 开启 Creator `experimentalEraseModules`，擦除未被上述场景引用的 PVP 脚本模块。
- post-build 补丁读取 `config/build-flavor.json`：
  - `pve-only` 模式只保留大厅共享资源、PVE 资源和 BGM。
  - 删除构建产物中的 PVP native 贴图。
  - 主包 critical native 清单不再包含棋盘、房间、结算和 PVP 图标。
- 大厅两枚 PVE 按钮继续复用现有 lobby 按钮底图，以保持当前视觉不变；其余 PVP lobby 素材不保留。

## 恢复 PVP

恢复完整版时：

1. 将 `config/build-flavor.json` 改为 `full`。
2. 恢复微信构建场景列表中的 `board.scene` 和 `settlement.scene`。
3. 将 `lobby.scene` 的控制器从 `PveLobbyController` 切回 `LobbyController`。

## 验收

- 大厅仅显示“命运远征”和“命运树”。
- 不触发房间列表、匹配、分享房间等 PVP 请求。
- 微信构建场景无 board/settlement。
- 构建产物无 board/room/settlement/PVP icons 原生贴图。
- 主包小于微信 4096KB 限制。
- PVE 单测通过。
